#!/bin/bash
# Baut KiezKoenige-FireTV.apk ohne Gradle (aapt2 + javac + d8 + apksigner).
# Aufruf: ./build_apk.sh [--install]   (FIRETV=ip:5555 optional)
set -euo pipefail
cd "$(dirname "$0")"

export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
SDK=${ANDROID_SDK:-/opt/homebrew/share/android-commandlinetools}
BT=$SDK/build-tools/34.0.0
JAR=$SDK/platforms/android-34/android.jar
FIRETV=${FIRETV:-}
OUT=build
KS=$OUT/release.keystore
APK=KiezKoenige-FireTV.apk

mkdir -p "$OUT"
# Signatur-Schlüssel (lokal, nie ins Repo)
if [ ! -f "$KS" ]; then
    keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias kiez \
        -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Kiez-Koenige" >/dev/null
fi

rm -rf "$OUT/tmp" && mkdir -p "$OUT/tmp/classes" "$OUT/tmp/dex" "$OUT/tmp/assets"
# Spiel + Handy-Controller als Assets (der Server in der App liefert sie aus)
cp -R game "$OUT/tmp/assets/game"
cp -R controller "$OUT/tmp/assets/controller"
"$BT/aapt2" compile --dir android/res -o "$OUT/tmp/res.zip"
javac -source 8 -target 8 -bootclasspath "$JAR" -Xlint:-options \
    -d "$OUT/tmp/classes" $(find android/src -name '*.java')
"$BT/d8" --release --min-api 22 --lib "$JAR" --output "$OUT/tmp/dex" $(find "$OUT/tmp/classes" -name '*.class')
"$BT/aapt2" link -I "$JAR" --manifest android/AndroidManifest.xml -A "$OUT/tmp/assets" -o "$OUT/tmp/unsigned.apk" "$OUT/tmp/res.zip"
(cd "$OUT/tmp/dex" && zip -q -j ../unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/tmp/unsigned.apk" "$OUT/tmp/aligned.apk"
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android --out "$APK" "$OUT/tmp/aligned.apk"
"$BT/apksigner" verify "$APK"
ls -la "$APK"

if [ "${1:-}" = "--install" ]; then
    DEV=()
    if [ -n "$FIRETV" ]; then adb connect "$FIRETV" >/dev/null || true; DEV=(-s "$FIRETV"); fi
    adb ${DEV[@]+"${DEV[@]}"} install -r "$APK"
    adb ${DEV[@]+"${DEV[@]}"} shell am start -n de.kiezkoenige.tv/.MainActivity
fi
