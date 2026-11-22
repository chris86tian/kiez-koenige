# Kiez-Könige 👑

![Kiez-Könige](docs/banner.png)

**Das Tycoon-Duell für den Fire TV:** Zwei Spieler bauen in einer 3D-Stadt (three.js) Läden – Kiosk, Eisdiele, Café, Imbiss, Fitnessstudio, Gaming-Lounge – setzen Preise, bauen aus, machen Werbung, nehmen Kredite auf. Wer nach 10/20/30 Tagen das größte Vermögen hat, ist Kiez-König.

## Installieren

APK herunterladen: **[KiezKoenige-FireTV.apk](https://github.com/chris86tian/kiez-koenige/releases/latest/download/KiezKoenige-FireTV.apk)** und per *Downloader*-App oder `adb install` auf den Fire TV / Android TV spielen.

## Screenshots

| Titel | Planung (Handys) | Der Tag läuft |
|---|---|---|
| ![Titel](docs/title.jpg) | ![Planung](docs/planung.jpg) | ![Tag](docs/tag.jpg) |

## Steuerung

| Modus | So geht's |
|---|---|
| 📱 **Handys (gleichzeitig)** | Beide Handys ins gleiche WLAN wie der Fire TV, QR-Code am Fernseher scannen – fertig, keine App nötig. Beide planen gleichzeitig, der Tag startet, wenn beide „Fertig“ tippen. |
| 📺 **Fernbedienung (abwechselnd)** | Eine Fernbedienung, die wird nach jedem Zug weitergereicht. |
| 🤖 **Gegen den Computer** | Spieler 2 = Computer (leicht oder stark). |

## Was man lernt

- **Standort:** Altstadt = Touristen (Eis, Café), Uni = Studis (Imbiss, Gaming), Büropark = unter der Woche voll, Wohngebiet = am Wochenende.
- **Preis vs. Menge:** Zu teuer → Kunden gehen zur Konkurrenz. Zu billig → ausverkauft und Geld verschenkt.
- **Kapazität:** „Ausverkauft“ heißt: ausbauen oder Preis hoch.
- **Kosten:** Ware, Personal, Pacht, Zinsen – der Abendbericht zeigt alles.
- **Wetter & Ereignisse:** Hitze, Regen, Stadtfest, Prüfungswoche, Messe, Influencer …

## Technik

- `game/` – Spiel (three.js r149, reines HTML/JS, 1280×720, D-Pad-Navigation)
- `controller/` – Handy-Controller (Browserseite)
- `android/` – WebView-App mit eingebautem Mini-Webserver (`RelayServer.java`, Port 8090): liefert Spiel und Controller aus und leitet Handy-Befehle weiter (`/api/in`, `/api/state`)
- `tools/devserver.mjs` – gleicher Server in Node zum Testen am Rechner: `node tools/devserver.mjs` → http://localhost:8090/game/
- `tools/balance.js` – Wirtschafts-Simulation zum Ausbalancieren

APK bauen (ohne Gradle, braucht JDK 17 + Android SDK build-tools 34):

```bash
./build_apk.sh            # baut KiezKoenige-FireTV.apk
FIRETV=192.168.x.y:5555 ./build_apk.sh --install
```
