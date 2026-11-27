/* Kiez-Könige – 3D-Stadt im Klötzchen-Look (three.js r149)
   Noppen-Platten, Block-Figuren, Spieler-Avatare mit Hut & Gesicht, Läden, Münzen, Wetter, Tageszeit. */
(function (G) {
    'use strict';
    var T = G.THREE, K = G.KKDATA;
    var C = { ok: false };
    G.KK3D = C;
    ['init', 'sync', 'select', 'focus', 'mode', 'setTime', 'setWeather', 'customer', 'coin', 'label', 'soldOut', 'celebrate', 'clearDay', 'screenPos', 'avatar', 'winner', 'cheer'].forEach(function (k) { C[k] = function () { }; });
    if (!T) return;

    var TV = /AFT|Android/i.test(navigator.userAgent);
    var W = 1280, H = 720;
    var renderer, scene, camera, canvas, hemi, sun, clockT = 0.3, weather = 'sun';
    var mode = 'title', focusPlot = -1, time = 0, last = 0;
    var cam = { x: 0, y: 60, z: 60, tx: 0, tz: 0, ang: 0 };
    var plotObjs = [], rings = [], peds = [], coinsPool = [], rain = null, confetti = null, clouds = null, water = null;
    var avatars = [], winnerPi = -1, owners = [], closeup = false;
    var geo = {}, mat = {}, studCache = {};
    var PX = [-20, -10, 10, 20];
    var FONT = 'Fredoka, Inter, sans-serif';

    /* Block-Figur: Maße in Weltgrößen (Beine 1, Körper 1, Kopf 0,62) */
    var FIG = { legH: 1.0, legW: 0.48, torsoW: 1.0, torsoH: 1.0, torsoD: 0.5, armW: 0.45, headW: 0.72, headH: 0.62 };
    C.HATS = ['cap', 'hair', 'top', 'party', 'ears', 'none'];
    C.FACES = ['smile', 'cool', 'grin', 'wink'];
    C.SKINS = ['#f1c27d', '#ffdbac', '#c68642', '#8d5524'];

    function col(h) { return new T.Color(h); }
    function lerp(a, b, k) { return a + (b - a) * k; }
    function angLerp(a, b, k) { var d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; }
    function easeOutBack(t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
    C.plotPos = function (id) { var p = K.plots[id]; return { x: PX[p.gx], z: PX[p.gy] }; };

    function box(g, w, h, d, x, y, z, m) { var b = new T.Mesh(geo.box, m); b.scale.set(w, h, d); b.position.set(x, y, z); g.add(b); return b; }
    function lam(c, e) { var m = new T.MeshLambertMaterial({ color: c }); if (e) { m.emissive = col(e); m.emissiveIntensity = 0.5; } return m; }

    /* ---------- Texturen ---------- */
    var studCanvas = null;
    function studTex(rep) {
        if (!studCanvas) {
            var c = document.createElement('canvas'); c.width = c.height = 64;
            var g = c.getContext('2d');
            g.fillStyle = '#e9e9e9'; g.fillRect(0, 0, 64, 64);
            g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(0, 62, 64, 2); g.fillRect(62, 0, 2, 64);
            g.beginPath(); g.arc(34, 35, 18, 0, Math.PI * 2); g.fillStyle = '#bdbdbd'; g.fill();          // Schatten
            var gr = g.createRadialGradient(26, 26, 2, 32, 32, 19); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#dcdcdc');
            g.beginPath(); g.arc(32, 32, 17, 0, Math.PI * 2); g.fillStyle = gr; g.fill();                  // Noppe
            studCanvas = c;
        }
        var key = rep[0] + 'x' + rep[1];
        if (!studCache[key]) {
            var t = new T.CanvasTexture(studCanvas); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep[0], rep[1]);
            studCache[key] = t;
        }
        return studCache[key];
    }
    function studMat(color, rx, rz) { return new T.MeshLambertMaterial({ color: color, map: studTex([rx, rz || rx]) }); }
    /* Platte mit Noppen nur oben */
    function plate(g, w, h, d, x, y, z, color, studs) {
        var side = lam(color), top = studMat(color, Math.max(1, Math.round(w / (studs || 1))), Math.max(1, Math.round(d / (studs || 1))));
        var m = new T.Mesh(geo.box, [side, side, top, side, side, side]); m.scale.set(w, h, d); m.position.set(x, y, z); g.add(m); return m;
    }
    function windowsTex() {
        var c = document.createElement('canvas'); c.width = 64; c.height = 64;
        var g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
        for (var y = 0; y < 2; y++) for (var x = 0; x < 2; x++) {
            g.fillStyle = '#1e3a5f'; g.fillRect(7 + x * 30, 9 + y * 30, 20, 20);
            g.fillStyle = '#7dd3fc'; g.fillRect(9 + x * 30, 11 + y * 30, 16, 16);
            g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(11 + x * 30, 13 + y * 30, 5, 5);
        }
        var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t;
    }
    /* Nachtlicht: nur die Fenster leuchten (Wände schwarz) */
    function litTex() {
        var c = document.createElement('canvas'); c.width = 64; c.height = 64;
        var g = c.getContext('2d'); g.fillStyle = '#000000'; g.fillRect(0, 0, 64, 64);
        for (var y = 0; y < 2; y++) for (var x = 0; x < 2; x++) { g.fillStyle = (x + y) % 3 ? '#ffd27a' : '#ffe9b0'; g.fillRect(9 + x * 30, 11 + y * 30, 16, 16); }
        var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t;
    }
    var litMats = [], night = 0, lamps = null;
    function litMat(color, rx, ry) {
        var m = new T.MeshLambertMaterial({ color: color, map: mat.win.clone(), emissive: 0xffc46b, emissiveMap: mat.lit.clone(), emissiveIntensity: night });
        m.map.needsUpdate = true; m.emissiveMap.needsUpdate = true;
        m.map.repeat.set(rx, ry); m.emissiveMap.repeat.set(rx, ry);
        litMats.push(m);
        return m;
    }
    /* Gesicht (64×64). bg = null → weiß (wird über die Instanzfarbe eingefärbt) */
    function faceCanvas(kind, bg) {
        var c = document.createElement('canvas'); c.width = c.height = 64;
        var g = c.getContext('2d');
        g.fillStyle = bg || '#ffffff'; g.fillRect(0, 0, 64, 64);
        g.fillStyle = '#1f1f1f'; g.strokeStyle = '#1f1f1f'; g.lineCap = 'round';
        if (kind === 'cool') {
            g.fillRect(12, 20, 40, 5); g.fillRect(13, 22, 16, 11); g.fillRect(35, 22, 16, 11);
            g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(16, 24, 5, 3); g.fillRect(38, 24, 5, 3);
            g.lineWidth = 4; g.beginPath(); g.arc(32, 38, 11, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
        } else if (kind === 'grin') {
            g.fillRect(20, 18, 7, 12); g.fillRect(37, 18, 7, 12);
            g.beginPath(); g.moveTo(16, 37); g.lineTo(48, 37); g.arc(32, 37, 16, 0, Math.PI); g.closePath(); g.fill();
            g.fillStyle = '#ffffff'; g.fillRect(20, 37, 24, 4);
        } else if (kind === 'wink') {
            g.fillRect(20, 20, 7, 11);
            g.lineWidth = 4; g.beginPath(); g.moveTo(36, 27); g.lineTo(45, 25); g.stroke();
            g.beginPath(); g.arc(32, 36, 13, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
        } else {
            g.fillRect(21, 19, 7, 12); g.fillRect(36, 19, 7, 12);
            g.lineWidth = 4; g.beginPath(); g.arc(32, 35, 14, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
        }
        return c;
    }

    /* ---------- Schrift-Sprites ---------- */
    function textSprite(text, bg, fg, scale) {
        var c = document.createElement('canvas'); c.width = 512; c.height = 128;
        var s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false, depthTest: false }));
        s.userData.canvas = c; s.scale.set(7 * (scale || 1), 1.75 * (scale || 1), 1);
        drawSprite(s, text, bg, fg);
        s.renderOrder = 10;
        return s;
    }
    function drawSprite(s, text, bg, fg) {
        if (s.userData.text === text + bg + fg) return;
        s.userData.text = text + bg + fg;
        var c = s.userData.canvas, g = c.getContext('2d');
        g.clearRect(0, 0, 512, 128);
        g.font = '700 60px ' + FONT;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        if (bg) {
            var w = Math.min(504, g.measureText(text).width + 56);
            g.fillStyle = 'rgba(0,0,0,0.35)'; rr(g, (512 - w) / 2, 24, w, 94, 26); g.fill();
            g.fillStyle = bg; rr(g, (512 - w) / 2, 16, w, 94, 26); g.fill();
        }
        g.lineWidth = 12; g.lineJoin = 'round'; g.strokeStyle = 'rgba(15,15,25,0.95)'; g.strokeText(text, 256, 64);
        g.fillStyle = fg || '#fff'; g.fillText(text, 256, 64);
        s.material.map.needsUpdate = true;
    }
    function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

    /* ---------- Aufbau ---------- */
    C.init = function (el) {
        try { canvas = el; renderer = new T.WebGLRenderer({ canvas: canvas, antialias: !TV, powerPreference: 'high-performance' }); } catch (e) { return false; }
        if (!renderer.getContext()) return false;
        renderer.setPixelRatio(TV ? 0.85 : Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(W, H, false);
        scene = new T.Scene();
        scene.fog = new T.Fog(0x8fd3ff, 110, 260);
        camera = new T.PerspectiveCamera(40, W / H, 0.5, 420);
        hemi = new T.HemisphereLight(0xffffff, 0x7a8a99, 0.95); scene.add(hemi);
        sun = new T.DirectionalLight(0xfff6e5, 0.8); sun.position.set(30, 50, 20); scene.add(sun);

        geo.box = new T.BoxGeometry(1, 1, 1);
        geo.cyl = new T.CylinderGeometry(1, 1, 1, 10);
        geo.cone4 = new T.ConeGeometry(1, 1, 4);
        geo.coin = new T.CylinderGeometry(0.5, 0.5, 0.16, 10);
        mat.win = windowsTex(); mat.lit = litTex();
        mat.coin = new T.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x7a4f00, emissiveIntensity: 0.5 });

        buildWorld();
        buildPlots();
        buildPeds();
        buildAvatars();
        for (var i = 0; i < 40; i++) { var c = new T.Mesh(geo.coin, mat.coin); c.visible = false; scene.add(c); coinsPool.push(c); }
        buildRain();
        buildConfetti();
        [0, 1].forEach(function (pi) {
            var r = new T.Mesh(new T.RingGeometry(6.0, 7.0, 4, 1, Math.PI / 4), new T.MeshBasicMaterial({ color: col(K.players[pi].color), transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false }));
            r.rotation.x = -Math.PI / 2; r.position.y = 0.75 + pi * 0.02; r.visible = false; scene.add(r); rings.push(r);
        });
        C.setTime(0.25);
        C.ok = true;
        requestAnimationFrame(loop);
        return true;
    };

    function buildWorld() {
        // Grundplatte
        var ground = new T.Mesh(new T.PlaneGeometry(420, 420), studMat(0x5cc84a, 210)); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; scene.add(ground);
        // Viertel als bunte Noppen-Platten
        K.districts.forEach(function (d, i) {
            var cx = i % 2 ? 15 : -15, cz = i < 2 ? -15 : 15;
            plate(scene, 22, 0.4, 22, cx, 0.1, cz, col(d.plastic || d.color).getHex(), 1);
            var lbl = textSprite(d.name, null, d.color, 1.0);
            lbl.position.set(cx, 2.4, cz + (i < 2 ? -13.6 : 13.6)); lbl.scale.set(13, 3.25, 1); scene.add(lbl);
        });
        // Straßen
        var road = lam(0x3f4452), line = lam(0xffffff);
        box(scene, 8, 0.22, 92, 0, 0.06, 0, road); box(scene, 92, 0.22, 8, 0, 0.06, 0, road);
        box(scene, 92, 0.22, 5, 0, 0.06, -28.5, road); box(scene, 92, 0.22, 5, 0, 0.06, 28.5, road);
        box(scene, 5, 0.22, 92, -28.5, 0.06, 0, road); box(scene, 5, 0.22, 92, 28.5, 0.06, 0, road);
        for (var i = -40; i <= 40; i += 5) { if (Math.abs(i) < 7) continue; box(scene, 0.4, 0.26, 2, 0, 0.1, i, line); box(scene, 2, 0.26, 0.4, i, 0.1, 0, line); }
        // Platz mit Klötzchen-Brunnen
        plate(scene, 11, 0.5, 11, 0, 0.2, 0, 0xd6d3d1, 1);
        var rim = lam(0x94a3b8);
        box(scene, 7, 0.9, 0.8, 0, 0.9, -3.1, rim); box(scene, 7, 0.9, 0.8, 0, 0.9, 3.1, rim);
        box(scene, 0.8, 0.9, 5.4, -3.1, 0.9, 0, rim); box(scene, 0.8, 0.9, 5.4, 3.1, 0.9, 0, rim);
        water = box(scene, 5.4, 0.5, 5.4, 0, 0.85, 0, lam(0x38bdf8, 0x0284c7));
        box(scene, 1.2, 2.6, 1.2, 0, 1.6, 0, lam(0xe2e8f0)); box(scene, 2.2, 0.4, 2.2, 0, 2.9, 0, lam(0xe2e8f0));
        box(scene, 0.8, 0.8, 0.8, 0, 3.5, 0, lam(0x7dd3fc, 0x0ea5e9));
        // Kulissen-Häuser (instanziert)
        var skyMat = new T.MeshLambertMaterial({ color: 0xffffff, map: mat.win, emissive: 0xffc46b, emissiveMap: mat.lit, emissiveIntensity: 0 });
        litMats.push(skyMat);
        var n = 90, inst = new T.InstancedMesh(geo.box, skyMat, n);
        var m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), pos = new T.Vector3(), cc = new T.Color();
        var pal = [0xff6b6b, 0xffd23f, 0x4ade80, 0x60a5fa, 0xc084fc, 0xf472b6, 0xf8fafc, 0xfb923c, 0x2dd4bf];
        for (var k = 0; k < n; k++) {
            var a = k / n * Math.PI * 2, r = 98 + (k * 37 % 14);
            var hgt = 8 + (k * 53 % 20);
            pos.set(Math.cos(a) * r, hgt / 2, Math.sin(a) * r); sc.set(6 + k % 4, hgt, 6 + (k + 1) % 4);
            m4.compose(pos, q, sc); inst.setMatrixAt(k, m4); inst.setColorAt(k, cc.setHex(pal[k % pal.length]));
        }
        scene.add(inst);
        // Straßenlaternen entlang der Ringstraße (leuchten am Abend)
        var lp = [];
        for (var li = -24; li <= 24; li += 12) { lp.push([li, -31.5], [li, 31.5], [-31.5, li], [31.5, li]); }
        var poles = new T.InstancedMesh(geo.box, lam(0x334155), lp.length);
        lamps = new T.InstancedMesh(geo.box, new T.MeshLambertMaterial({ color: 0xfff1c9, emissive: 0xffd27a, emissiveIntensity: 0 }), lp.length);
        lp.forEach(function (p, i) {
            pos.set(p[0], 2.2, p[1]); sc.set(0.3, 4.4, 0.3); m4.compose(pos, q, sc); poles.setMatrixAt(i, m4);
            pos.set(p[0], 4.6, p[1]); sc.set(0.8, 0.6, 0.8); m4.compose(pos, q, sc); lamps.setMatrixAt(i, m4);
        });
        scene.add(poles); scene.add(lamps);
        // Klötzchen-Bäume (instanziert): Stamm + zwei Blätter-Würfel
        var tn = 60, trunk = new T.InstancedMesh(geo.box, lam(0x8b5a2b), tn), leaf = new T.InstancedMesh(geo.box, lam(0xffffff), tn * 2);
        var greens = [0x22c55e, 0x16a34a, 0x4ade80];
        for (var t = 0; t < tn; t++) {
            var ang = t / tn * Math.PI * 2 + 0.05, rad = 33 + (t * 29 % 5);
            var x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
            if (Math.abs(x) < 6 || Math.abs(z) < 6) { x += 7; }
            q.setFromAxisAngle(new T.Vector3(0, 1, 0), t * 0.7);
            pos.set(x, 1, z); sc.set(0.6, 2, 0.6); m4.compose(pos, q, sc); trunk.setMatrixAt(t, m4);
            pos.set(x, 2.6, z); sc.set(2.4, 1.6, 2.4); m4.compose(pos, q, sc); leaf.setMatrixAt(t * 2, m4); leaf.setColorAt(t * 2, cc.setHex(greens[t % 3]));
            pos.set(x, 3.8, z); sc.set(1.5, 1.1, 1.5); m4.compose(pos, q, sc); leaf.setMatrixAt(t * 2 + 1, m4); leaf.setColorAt(t * 2 + 1, cc.setHex(greens[(t + 1) % 3]));
        }
        q.identity();
        scene.add(trunk); scene.add(leaf);
        // Klötzchen-Wolken
        var cn = 14, parts = 4;
        clouds = new T.InstancedMesh(geo.box, new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35, transparent: true, opacity: 0.92 }), cn * parts);
        clouds.userData.list = [];
        for (var cI = 0; cI < cn; cI++) {
            clouds.userData.list.push({ a: cI / cn * Math.PI * 2, r: 135 + (cI * 23 % 35), y: 38 + (cI * 7 % 16), s: 1.6 + (cI % 3) * 0.4 });
        }
        clouds.frustumCulled = false;
        scene.add(clouds);
        updateClouds(0);
    }
    function updateClouds(dt) {
        var m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), pos = new T.Vector3();
        var shapes = [[0, 0, 0, 7, 2.4, 4], [3.5, 1.4, 0.4, 4.5, 2, 3.5], [-3, 0.9, -0.5, 4, 1.8, 3], [1, -0.6, 1.2, 5, 1.4, 3]];
        clouds.userData.list.forEach(function (c, i) {
            c.a += dt * 0.012;
            var cx = Math.cos(c.a) * c.r, cz = Math.sin(c.a) * c.r;
            shapes.forEach(function (sh, k) {
                pos.set(cx + sh[0] * c.s, c.y + sh[1] * c.s, cz + sh[2] * c.s); sc.set(sh[3] * c.s, sh[4] * c.s, sh[5] * c.s);
                m4.compose(pos, q, sc); clouds.setMatrixAt(i * 4 + k, m4);
            });
        });
        clouds.instanceMatrix.needsUpdate = true;
    }

    function buildPlots() {
        K.plots.forEach(function (p, i) {
            var g = new T.Group(), pp = C.plotPos(i);
            g.position.set(pp.x, 0, pp.z);
            var edge = new T.Mesh(geo.box, lam(0xffffff)); edge.scale.set(8.8, 0.5, 8.8); edge.position.y = 0.3; g.add(edge);
            var pad = plate(g, 8.0, 0.5, 8.0, 0, 0.45, 0, 0xf1f5f9, 1);
            // „Zu verpachten“-Schild aus Klötzchen
            var sign = new T.Group();
            box(sign, 0.35, 1.8, 0.35, 0, 1.4, 0, lam(0x8b5a2b));
            box(sign, 2.6, 1.3, 0.3, 0, 2.6, 0, lam(0xffd23f));
            box(sign, 2.0, 0.25, 0.32, 0, 2.8, 0, lam(0x1f2937)); box(sign, 1.4, 0.25, 0.32, 0, 2.35, 0, lam(0x1f2937));
            g.add(sign);
            var label = textSprite('', 'rgba(15,23,42,0.88)', '#fff', 0.8); label.position.set(0, 7.5, 0); label.visible = false; g.add(label);
            scene.add(g);
            plotObjs.push({ g: g, pad: pad, edge: edge, sign: sign, label: label, shop: null, key: '', anim: 1, sold: textSprite('AUSVERKAUFT', '#ef4444', '#fff', 0.7) });
            var so = plotObjs[i].sold; so.position.set(0, 9.4, 0); so.visible = false; g.add(so);
        });
    }

    /* Ladenmodelle je Art – bunte Klötzchen */
    function shopModel(type, level, ownerColor) {
        var g = new T.Group(), t = K.types[type], s = 1 + level * 0.18;
        var acc = lam(col(t.color).getHex(), t.color);
        var floors = 1 + (level >= 2 ? 1 : 0);
        var wallCol = col(t.color).lerp(col('#ffffff'), 0.55);
        function body(w, h, d) {
            var side = litMat(wallCol, Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
            g.userData.lit = (g.userData.lit || []).concat([side]);
            var m = new T.Mesh(geo.box, side); m.scale.set(w, h, d); m.position.y = 0.7 + h / 2; g.add(m);
            plate(g, w + 0.6, 0.6, d + 0.6, 0, 0.7 + h + 0.3, 0, col(ownerColor).getHex(), 1);   // Dach in Spielerfarbe mit Noppen
            return 0.7 + h + 0.6;
        }
        var top;
        if (type === 'kiosk') {
            top = body(3.4 * s, 2.6 * floors, 3 * s);
            for (var k = 0; k < 4; k++) box(g, 3.8 * s / 4 - 0.05, 0.5, 1.4, (-1.5 + k) * 3.8 * s / 4, 2.4, 2.1 * s, lam(k % 2 ? 0xffffff : col(t.color).getHex()));
            box(g, 2.6 * s, 1.0, 0.7, 0, 1.2, 1.9 * s, lam(0x92400e));
            box(g, 1.6, 0.4, 1.1, 0, top + 0.2, 0, lam(0xf8fafc)); box(g, 1.6, 0.3, 1.1, 0.1, top + 0.55, 0.05, lam(0xe2e8f0));
        } else if (type === 'eis') {
            top = body(4 * s, 2.8 * floors, 3.6 * s);
            var cone = new T.Mesh(geo.cone4, lam(0xe0a040)); cone.scale.set(1.0, 2.4, 1.0); cone.rotation.x = Math.PI; cone.rotation.y = Math.PI / 4; cone.position.y = top + 1.2; g.add(cone);
            [[0, 0xf9a8d4], [0.95, 0xfef3c7], [1.8, 0x93c5fd]].forEach(function (b, k) { box(g, 1.4 - k * 0.15, 0.95, 1.4 - k * 0.15, 0, top + 2.8 + b[0], 0, lam(b[1])); });
            box(g, 0.35, 0.35, 0.35, 0, top + 5.25, 0, lam(0xef4444));
        } else if (type === 'cafe') {
            top = body(4.6 * s, 2.8 * floors, 3.6 * s);
            box(g, 4.9 * s, 0.35, 1.5, 0, 2.7, 2.5 * s, acc);
            [-1.6, 1.6].forEach(function (x) {
                box(g, 0.15, 1.8, 0.15, x * s, 1.5, 3.5 * s, lam(0x475569));
                box(g, 1.8, 0.3, 1.8, x * s, 2.45, 3.5 * s, acc);
                box(g, 1.1, 0.15, 1.1, x * s, 1.3, 3.5 * s, lam(0xf8fafc));
            });
            box(g, 1.5, 1.4, 1.5, 0, top + 0.7, 0, lam(0xffffff)); box(g, 1.1, 0.2, 1.1, 0, top + 1.45, 0, lam(0x5b3416)); box(g, 0.35, 0.8, 0.35, 0.95, top + 0.75, 0, lam(0xffffff));
        } else if (type === 'imbiss') {
            top = body(4.4 * s, 2.8 * floors, 3.8 * s);
            [[2.0, 0.55, 0xe0a040], [2.2, 0.3, 0x7c2d12], [2.3, 0.15, 0x22c55e], [2.1, 0.15, 0xfacc15], [2.0, 0.55, 0xe0a040]].forEach(function (l, k) {
                box(g, l[0], l[1], l[0], 0, top + 0.3 + k * 0.4, 0, lam(l[2]));
            });
        } else if (type === 'bubbletea') {      // Bubble-Tea: Riesenbecher mit Strohhalm und Perlen auf dem Dach
            top = body(3.8 * s, 2.7 * floors, 3.4 * s);
            box(g, 4.1 * s, 0.35, 1.3, 0, 2.6, 2.2 * s, acc);
            box(g, 1.5, 2.2, 1.5, 0, top + 1.1, 0, new T.MeshLambertMaterial({ color: 0xe8fffb, transparent: true, opacity: 0.85 }));
            box(g, 1.3, 1.4, 1.3, 0, top + 0.75, 0, lam(0xd9a066));                      // Milchtee
            [[-0.35, -0.3], [0.3, 0.2], [0, 0.35], [-0.2, 0.1], [0.35, -0.35]].forEach(function (p) { box(g, 0.28, 0.28, 0.28, p[0], top + 0.3, p[1], lam(0x2b1a12)); });   // Perlen
            box(g, 1.7, 0.2, 1.7, 0, top + 2.3, 0, lam(0x14b8a6));                        // Deckel
            var straw = box(g, 0.25, 2.2, 0.25, 0.3, top + 3.2, 0, lam(0xff5cb5)); straw.rotation.z = -0.25;
        } else if (type === 'secondhand') {     // Second-Hand: Kleiderstange vor dem Laden, großes T-Shirt-Schild
            top = body(4.4 * s, 2.8 * floors, 3.6 * s);
            for (var a = 0; a < 5; a++) box(g, 4.7 * s / 5 - 0.05, 0.4, 1.3, (-2 + a) * 4.7 * s / 5, 2.65, 2.3 * s, lam(a % 2 ? 0xffffff : 0xec4899));
            box(g, 3.0, 0.12, 0.12, 0, 2.0, 3.4 * s, lam(0x94a3b8)); box(g, 0.12, 2.0, 0.12, -1.45, 1.0, 3.4 * s, lam(0x94a3b8)); box(g, 0.12, 2.0, 0.12, 1.45, 1.0, 3.4 * s, lam(0x94a3b8));
            [[-0.9, 0xf472b6], [0, 0x60a5fa], [0.9, 0xfacc15]].forEach(function (c) { box(g, 0.7, 0.9, 0.12, c[0], 1.5, 3.4 * s, lam(c[1])); box(g, 0.95, 0.22, 0.12, c[0], 1.85, 3.4 * s, lam(c[1])); });
            box(g, 2.6, 0.8, 0.3, 0, top + 1.0, 0, lam(0xec4899)); box(g, 1.4, 1.6, 0.3, 0, top + 0.6, 0, lam(0xec4899));   // T-Shirt
            box(g, 0.5, 0.3, 0.32, 0, top + 1.2, 0, lam(0xffffff));
        } else if (type === 'fitness') {
            top = body(5.6 * s, 3.2 * floors, 4.4 * s);
            var y1 = top + 1.0;
            box(g, 4, 0.3, 0.3, 0, y1, 0, lam(0x334155));
            [-1.8, 1.8].forEach(function (x) { box(g, 0.6, 1.6, 1.6, x, y1, 0, acc); });
        } else {
            top = body(5.4 * s, 3.4 * floors, 4.4 * s);
            box(g, 4.4 * s, 2.2, 0.4, 0, top + 1.2, 0, lam(0x1e1b4b));
            var scr = box(g, 3.8 * s, 1.7, 0.42, 0, top + 1.2, 0.02, new T.MeshBasicMaterial({ color: 0x22d3ee }));
            scr.userData.neon = true;
            box(g, 0.5, 0.5, 0.45, -0.6, top + 1.2, 0.05, new T.MeshBasicMaterial({ color: 0xf472b6 }));
            box(g, 0.5, 0.5, 0.45, 0.6, top + 1.2, 0.05, new T.MeshBasicMaterial({ color: 0xfacc15 }));
        }
        // Eingangstür
        box(g, 1.2, 1.8, 0.2, 0, 1.6, (type === 'kiosk' ? 1.55 : 1.85) * s + 0.05, lam(0x1e293b));
        return g;
    }

    C.sync = function (st) {
        if (!C.ok) return;
        st.plots.forEach(function (pl, i) {
            var o = plotObjs[i];
            owners[i] = pl.owner;
            var key = pl.owner + ':' + pl.type + ':' + pl.level;
            if (key !== o.key) {
                if (o.shop) { o.g.remove(o.shop); (o.shop.userData.lit || []).forEach(function (m) { var k = litMats.indexOf(m); if (k >= 0) litMats.splice(k, 1); }); }
                o.shop = null;
                if (pl.type) {
                    o.shop = shopModel(pl.type, pl.level, st.players[pl.owner].color);
                    o.g.add(o.shop);
                    if (o.key) { o.anim = 0; C.coin(i, 8); C.cheer(pl.owner); }
                }
                o.edge.material.color.set(pl.owner >= 0 ? st.players[pl.owner].color : '#ffffff');
                o.sign.visible = !pl.type;
                o.key = key;
            }
            if (pl.type) {
                var t = K.types[pl.type];
                drawSprite(o.label, t.icon + ' ' + pl.price.toFixed(2).replace('.', ',') + ' €', 'rgba(15,23,42,0.88)', st.players[pl.owner].color);
                o.label.visible = mode !== 'title';
                o.label.position.y = 8.5 + pl.level * 1.6;
                o.sold.position.y = o.label.position.y + 1.9;
            } else o.label.visible = false;
        });
    };
    C.label = function (id, text, color) { var o = plotObjs[id]; if (o && o.label.visible) drawSprite(o.label, text, 'rgba(15,23,42,0.88)', color); };
    C.soldOut = function (id, on) { var o = plotObjs[id]; if (o) o.sold.visible = !!on; };
    C.clearDay = function () { plotObjs.forEach(function (o) { o.sold.visible = false; }); peds.forEach(function (p) { p.u.active = false; }); };

    C.select = function (pi, id) {
        var r = rings[pi]; if (!r) return;
        var a = avatars[pi];
        if (id === null || id === undefined || id < 0) { r.visible = false; if (a) a.sel = -1; return; }
        var pp = C.plotPos(id);
        r.visible = true; r.position.x = pp.x; r.position.z = pp.z;
        r.userData.target = id;
        if (a) a.sel = id;
        if (pi === 0 || focusPlot < 0) focusPlot = id;
    };
    C.focus = function (id) { focusPlot = id; };
    C.mode = function (m) {
        mode = m; canvas.style.visibility = m === 'off' ? 'hidden' : 'visible';
        if (m !== 'plan') rings.forEach(function (r) { r.visible = false; });
        if (m !== 'final') C.winner(-1);
    };

    /* Tageszeit 0 = Morgen, 0.5 = Mittag, 1 = Abend */
    C.setTime = function (t) {
        clockT = t;
        var sky = new T.Color();
        if (t < 0.5) sky.lerpColors(col('#ffd6a5'), col('#7cc8ff'), t * 2);
        else sky.lerpColors(col('#7cc8ff'), col('#ff9f43'), (t - 0.5) * 2);
        if (t > 0.9) sky.lerp(col('#2b1d5c'), (t - 0.9) * 8);
        if (weather === 'rain') sky.lerp(col('#7b8ba3'), 0.6);
        if (weather === 'heat') sky.lerp(col('#ffe28a'), 0.25);
        scene.background = sky; scene.fog.color = sky;
        var ang = Math.PI * (0.15 + t * 0.7);
        sun.position.set(Math.cos(ang) * 60, Math.sin(ang) * 60 + 5, 20);
        sun.intensity = (weather === 'rain' ? 0.45 : 0.85) * (t > 0.92 ? 0.45 : 1);
        hemi.intensity = weather === 'rain' ? 0.8 : 1.0;
        if (clouds) clouds.material.color.set(weather === 'rain' ? '#9aa6b8' : '#ffffff');
        night = Math.max(0, Math.min(1, (t - 0.74) / 0.18)) + (weather === 'rain' && t > 0.5 ? 0.25 : 0);
        litMats.forEach(function (m) { m.emissiveIntensity = night * 0.95; });
        if (lamps) lamps.material.emissiveIntensity = night * 1.2;
    };
    C.setWeather = function (w) { weather = w; rain.visible = w === 'rain'; C.setTime(clockT); };

    /* ---------- Block-Figuren ---------- */
    var M = null, A = null;
    /* Teil-Matrix: base · T(px,py,pz) · [Rx(rot) · T(0,-h/2,0)] · S(w,h,d) */
    function part(out, base, px, py, pz, rot, w, h, d) {
        out.copy(base);
        A.makeTranslation(px, py, pz); out.multiply(A);
        if (rot !== null) { A.makeRotationX(rot); out.multiply(A); A.makeTranslation(0, -h / 2, 0); out.multiply(A); }
        A.makeScale(w, h, d); out.multiply(A);
        return out;
    }
    function buildPeds() {
        var n = 140;
        M = new T.Matrix4(); A = new T.Matrix4();
        var face = new T.CanvasTexture(faceCanvas('smile', null));
        var white = lam(0xffffff), faceMat = new T.MeshLambertMaterial({ color: 0xffffff, map: face });
        var mk = function (m) { var x = new T.InstancedMesh(geo.box, m, n); x.frustumCulled = false; scene.add(x); return x; };
        var P = C._peds = { torso: mk(white), head: mk([white, white, white, white, faceMat, white]), armL: mk(white), armR: mk(white), legL: mk(white), legR: mk(white) };
        var cc = new T.Color();
        var shirts = [0xef4444, 0x3b82f6, 0x22c55e, 0xf59e0b, 0xa855f7, 0xec4899, 0x14b8a6, 0xf8fafc, 0xfacc15, 0x0ea5e9];
        var pants = [0x1e3a8a, 0x334155, 0x166534, 0x7c2d12, 0x111827, 0x6b21a8];
        var skins = C.SKINS;
        var zero = new T.Matrix4().makeScale(0, 0, 0);
        for (var i = 0; i < n; i++) {
            var sk = cc.set(skins[(i * 7) % skins.length]);
            P.head.setColorAt(i, sk); P.armL.setColorAt(i, sk); P.armR.setColorAt(i, sk);
            P.torso.setColorAt(i, cc.setHex(shirts[i % shirts.length]));
            cc.setHex(pants[(i * 3) % pants.length]); P.legL.setColorAt(i, cc); P.legR.setColorAt(i, cc);
            Object.keys(P).forEach(function (k) { P[k].setMatrixAt(i, zero); });
            peds.push({ u: { active: false, hidden: true } });
        }
    }
    /* Eine Figur zeichnen (für Instanzen) */
    function drawFig(P, i, base, swing, armUp) {
        var f = FIG, lh = f.legH, th = f.torsoH;
        P.legL.setMatrixAt(i, part(M, base, -0.25, lh, 0, swing, f.legW, lh, f.legW));
        P.legR.setMatrixAt(i, part(M, base, 0.25, lh, 0, -swing, f.legW, lh, f.legW));
        P.torso.setMatrixAt(i, part(M, base, 0, lh + th / 2, 0, null, f.torsoW, th, f.torsoD));
        P.armL.setMatrixAt(i, part(M, base, -(f.torsoW / 2 + f.armW / 2), lh + th - 0.05, 0, armUp ? Math.PI * 0.9 : -swing, f.armW, th, f.armW));
        P.armR.setMatrixAt(i, part(M, base, f.torsoW / 2 + f.armW / 2, lh + th - 0.05, 0, armUp ? Math.PI * 0.9 : swing, f.armW, th, f.armW));
        P.head.setMatrixAt(i, part(M, base, 0, lh + th + f.headH / 2, 0, null, f.headW, f.headH, f.headH));
    }
    function spawnPoint(d) {
        var cx = d % 2 ? 15 : -15, cz = d < 2 ? -15 : 15;
        if (Math.random() < 0.5) return { x: cx + (Math.random() - 0.5) * 20, z: d < 2 ? -28.5 : 28.5 };
        return { x: d % 2 ? 28.5 : -28.5, z: cz + (Math.random() - 0.5) * 20 };
    }
    C.customer = function (plotId, fromD, lost) {
        for (var i = 0; i < peds.length; i++) {
            var u = peds[i].u;
            if (u.active) continue;
            var s = Math.random() < 0.5 ? { x: (Math.random() - 0.5) * 6, z: (fromD < 2 ? -1 : 1) * (8 + Math.random() * 18) } : spawnPoint(fromD);
            var pp = C.plotPos(plotId), door = { x: pp.x + (Math.random() - 0.5) * 2, z: pp.z + 5.2 };
            u.active = true; u.hidden = false; u.t = 0; u.s = s; u.e = door; u.lost = lost; u.plot = plotId;
            u.dur = 1.6 + Math.random() * 1.2; u.yaw = Math.atan2(door.x - s.x, door.z - s.z);
            return true;
        }
        return false;
    };

    /* ---------- Spieler-Avatare ---------- */
    function buildAvatars() {
        [0, 1].forEach(function (pi) {
            var root = new T.Group(), body = new T.Group();
            root.add(body);
            var f = FIG, pc = K.players[pi].color;
            var shirt = lam(col(pc).getHex()), pantsM = lam(0x1f2937), skinM = lam(col(C.SKINS[0]).getHex());
            function limb(x, y, w, h, d, m) { var piv = new T.Group(); piv.position.set(x, y, 0); var mesh = new T.Mesh(geo.box, m); mesh.scale.set(w, h, d); mesh.position.y = -h / 2; piv.add(mesh); body.add(piv); return piv; }
            var legL = limb(-0.25, f.legH, f.legW, f.legH, f.legW, pantsM), legR = limb(0.25, f.legH, f.legW, f.legH, f.legW, pantsM);
            var torso = new T.Mesh(geo.box, shirt); torso.scale.set(f.torsoW, f.torsoH, f.torsoD); torso.position.y = f.legH + f.torsoH / 2; body.add(torso);
            // kleines Logo auf dem Shirt (weißer Stern-Klotz)
            var badge = new T.Mesh(geo.box, lam(0xffffff)); badge.scale.set(0.3, 0.3, 0.05); badge.position.set(0.22, f.legH + f.torsoH * 0.7, f.torsoD / 2 + 0.02); body.add(badge);
            var armL = limb(-(f.torsoW / 2 + f.armW / 2), f.legH + f.torsoH - 0.05, f.armW, f.torsoH, f.armW, skinM);
            var armR = limb(f.torsoW / 2 + f.armW / 2, f.legH + f.torsoH - 0.05, f.armW, f.torsoH, f.armW, skinM);
            var faceTex = new T.CanvasTexture(faceCanvas('smile', C.SKINS[0]));
            var faceM = new T.MeshLambertMaterial({ map: faceTex });
            var head = new T.Mesh(geo.box, [skinM, skinM, skinM, skinM, faceM, skinM]); head.scale.set(f.headW, f.headH, f.headH); head.position.y = f.legH + f.torsoH + f.headH / 2; body.add(head);
            var hat = new T.Group(); hat.position.y = f.legH + f.torsoH + f.headH; body.add(hat);
            var crown = new T.Group(); crown.position.y = f.legH + f.torsoH + f.headH + 0.02; crown.visible = false; body.add(crown);
            var gold = lam(0xffd23f, 0x8a5a00);
            box(crown, 0.86, 0.3, 0.76, 0, 0.15, 0, gold);
            [[-0.33, -0.28], [0.33, -0.28], [-0.33, 0.28], [0.33, 0.28]].forEach(function (c) { box(crown, 0.2, 0.3, 0.2, c[0], 0.45, c[1], gold); });
            box(crown, 0.16, 0.16, 0.05, 0, 0.17, 0.4, lam(0xef4444));
            var tag = textSprite(K.players[pi].name, null, pc, 0.4); tag.position.y = f.legH + f.torsoH + f.headH + 0.95; root.add(tag);
            root.scale.setScalar(1.55);
            var home = { x: pi ? 3.2 : -3.2, z: 7.4 };
            root.position.set(home.x, 0.45, home.z);
            scene.add(root);
            avatars.push({ root: root, body: body, legL: legL, legR: legR, armL: armL, armR: armR, head: head, hat: hat, crown: crown, tag: tag, skinM: skinM, faceM: faceM, shirt: shirt,
                x: home.x, z: home.z, yaw: 0, walk: 0, sel: -1, cheer: 0, cfg: {}, home: home });
            C.avatar(pi, { hat: pi ? 'hair' : 'cap', face: pi ? 'grin' : 'smile', skin: pi ? 1 : 0 });
        });
    }
    function hatModel(g, kind, pc) {
        while (g.children.length) g.remove(g.children[0]);
        var dark = col(pc).multiplyScalar(0.55).getHex();
        if (kind === 'cap') {
            box(g, 0.78, 0.24, 0.7, 0, 0.12, -0.02, lam(col(pc).getHex()));
            box(g, 0.74, 0.07, 0.45, 0, 0.03, 0.5, lam(dark));
        } else if (kind === 'hair') {
            var hm = lam(0x5b3416);
            box(g, 0.8, 0.2, 0.7, 0, 0.08, 0, hm); box(g, 0.8, 0.5, 0.16, 0, -0.18, -0.3, hm);
            box(g, 0.12, 0.35, 0.6, -0.38, -0.1, 0, hm); box(g, 0.12, 0.35, 0.6, 0.38, -0.1, 0, hm);
        } else if (kind === 'top') {
            box(g, 1.0, 0.07, 0.9, 0, 0.04, 0, lam(0x111827));
            box(g, 0.62, 0.66, 0.56, 0, 0.4, 0, lam(0x111827)); box(g, 0.64, 0.14, 0.58, 0, 0.16, 0, lam(col(pc).getHex()));
        } else if (kind === 'party') {
            var c = new T.Mesh(geo.cone4, lam(0xffd23f)); c.scale.set(0.42, 0.9, 0.42); c.rotation.y = Math.PI / 4; c.position.y = 0.45; g.add(c);
            box(g, 0.2, 0.2, 0.2, 0, 0.95, 0, lam(col(pc).getHex()));
        } else if (kind === 'ears') {
            var em = lam(col(pc).getHex());
            box(g, 0.24, 0.32, 0.12, -0.24, 0.16, 0, em); box(g, 0.24, 0.32, 0.12, 0.24, 0.16, 0, em);
            box(g, 0.12, 0.16, 0.13, -0.24, 0.12, 0.01, lam(0xfbcfe8)); box(g, 0.12, 0.16, 0.13, 0.24, 0.12, 0.01, lam(0xfbcfe8));
        }
    }
    /* Aussehen setzen: { hat, face, skin(Index) } */
    C.avatar = function (pi, cfg) {
        var a = avatars[pi]; if (!a || !cfg) return;
        var c = a.cfg, pc = K.players[pi].color;
        var skin = C.SKINS[(cfg.skin | 0) % C.SKINS.length];
        if (cfg.hat !== c.hat) hatModel(a.hat, cfg.hat, pc);
        if (cfg.skin !== c.skin || cfg.face !== c.face) {
            a.skinM.color.set(skin);
            a.faceM.map.image = faceCanvas(cfg.face || 'smile', skin); a.faceM.map.needsUpdate = true;
        }
        a.cfg = { hat: cfg.hat, face: cfg.face, skin: cfg.skin };
    };
    C.avatarName = function (pi, name) { var a = avatars[pi]; if (a) drawSprite(a.tag, name, null, K.players[pi].color); };
    C.winner = function (pi) { winnerPi = pi; avatars.forEach(function (a, i) { a.crown.visible = i === pi; }); };
    C.closeup = function (on) { closeup = !!on; };
    C.cheer = function (pi) { var a = avatars[pi]; if (a) a.cheer = 1.4; };

    function avatarTarget(a, pi) {
        if (mode === 'plan' && a.sel >= 0) { var pp = C.plotPos(a.sel); return { x: pp.x + (pi ? 1.6 : -1.6), z: pp.z + 5.6 }; }
        if (mode === 'final') return winnerPi === pi ? { x: 0, z: 6.2 } : { x: pi ? 4.5 : -4.5, z: 7.6 };
        return a.home;
    }
    function animateAvatars(dt) {
        avatars.forEach(function (a, pi) {
            a.root.visible = mode !== 'off';
            var tg = avatarTarget(a, pi), dx = tg.x - a.x, dz = tg.z - a.z, dist = Math.sqrt(dx * dx + dz * dz);
            var moving = dist > 0.15;
            if (moving) {
                var step = Math.min(dist, dt * 16);
                a.x += dx / dist * step; a.z += dz / dist * step;
                a.yaw = angLerp(a.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 12));
                a.walk += dt * 13;
            } else {
                a.yaw = angLerp(a.yaw, 0, 1 - Math.exp(-dt * 6));
                a.walk = lerp(a.walk, Math.round(a.walk / Math.PI) * Math.PI, 0.2);
            }
            var sw = Math.sin(a.walk) * 0.7, jump = 0, armUp = false;
            if (a.cheer > 0) { a.cheer -= dt; jump = Math.abs(Math.sin(a.cheer * 7)) * 0.9; armUp = true; }
            if (mode === 'final' && winnerPi === pi) { jump = Math.abs(Math.sin(time * 5)) * 1.4; armUp = true; }
            var idle = !moving && !armUp;
            a.legL.rotation.x = sw; a.legR.rotation.x = -sw;
            a.armL.rotation.x = armUp ? Math.PI * 0.92 : (idle ? Math.sin(time * 2 + pi) * 0.08 : -sw);
            a.armR.rotation.x = armUp ? Math.PI * 0.92 : (idle && mode === 'title' ? Math.PI * 0.85 + Math.sin(time * 8 + pi * 2) * 0.25 : (idle ? -Math.sin(time * 2 + pi) * 0.08 : sw));
            a.armR.rotation.z = idle && mode === 'title' ? 0.35 : 0;
            a.root.position.set(a.x, 0.45 + jump, a.z);
            a.body.rotation.y = a.yaw;
        });
    }

    /* ---------- Münzen ---------- */
    C.coin = function (plotId, n) {
        var pp = C.plotPos(plotId), c = 0;
        for (var i = 0; i < coinsPool.length && c < (n || 1); i++) {
            var m = coinsPool[i]; if (m.visible) continue;
            m.visible = true; m.position.set(pp.x + (Math.random() - 0.5) * 3, 6, pp.z + (Math.random() - 0.5) * 3);
            m.userData = { v: 6 + Math.random() * 3, life: 1.1, spin: 6 + Math.random() * 6 }; c++;
        }
        if (mode === 'day' && owners[plotId] >= 0 && Math.random() < 0.08) C.cheer(owners[plotId]);
    };

    function buildRain() {
        var n = 700, g = new T.BufferGeometry(), p = new Float32Array(n * 3);
        for (var i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 100; p[i * 3 + 1] = Math.random() * 40; p[i * 3 + 2] = (Math.random() - 0.5) * 100; }
        g.setAttribute('position', new T.BufferAttribute(p, 3));
        rain = new T.Points(g, new T.PointsMaterial({ color: 0xbfdbfe, size: 0.4, transparent: true, opacity: 0.75 }));
        rain.visible = false; rain.frustumCulled = false; scene.add(rain);
    }
    function buildConfetti() {
        var n = 400, g = new T.BufferGeometry(), p = new Float32Array(n * 3), c = new Float32Array(n * 3);
        var pal = ['#f472b6', '#ffd23f', '#22d3ee', '#4ade80', '#a78bfa', '#fb923c', '#ef4444'].map(col);
        for (var i = 0; i < n; i++) { var k = pal[i % pal.length]; c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b; p[i * 3 + 1] = -50; }
        g.setAttribute('position', new T.BufferAttribute(p, 3)); g.setAttribute('color', new T.BufferAttribute(c, 3));
        confetti = new T.Points(g, new T.PointsMaterial({ size: 0.75, vertexColors: true }));
        confetti.userData = { vel: new Float32Array(n * 3), life: 0 }; confetti.frustumCulled = false; scene.add(confetti);
    }
    C.celebrate = function (pi, st) {
        var ids = st ? st.plots.filter(function (pl) { return pl.owner === pi; }).map(function (pl) { return pl.id; }) : [];
        var pos = confetti.geometry.attributes.position.array, vel = confetti.userData.vel;
        for (var k = 0; k < pos.length / 3; k++) {
            var c = ids.length && k % 3 ? C.plotPos(ids[k % ids.length]) : { x: 0, z: 6 };
            pos[k * 3] = c.x; pos[k * 3 + 1] = 10; pos[k * 3 + 2] = c.z;
            vel[k * 3] = (Math.random() - 0.5) * 16; vel[k * 3 + 1] = 8 + Math.random() * 12; vel[k * 3 + 2] = (Math.random() - 0.5) * 16;
        }
        confetti.userData.life = 6; confetti.geometry.attributes.position.needsUpdate = true;
        C.winner(pi);
    };

    /* Bildschirm-Position eines Grundstücks (für HTML-Overlays) */
    C.screenPos = function (id) {
        var pp = C.plotPos(id), v = new T.Vector3(pp.x, 2, pp.z).project(camera);
        return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H };
    };

    /* ---------- Animation ---------- */
    function loop(t) {
        requestAnimationFrame(loop);
        if (mode === 'off' || document.hidden) { last = t; return; }
        var minDt = TV ? 1000 / 30 : 1000 / 60;
        if (t - last < minDt - 1) return;
        var dt = Math.min(0.1, (t - last) / 1000); last = t; time += dt;
        animate(dt);
        renderer.render(scene, camera);
    }
    var base = null, tmpQ = null, tmpS = null, tmpP = null, yAxis = null;
    function animate(dt) {
        if (!base) { base = new T.Matrix4(); tmpQ = new T.Quaternion(); tmpS = new T.Vector3(1, 1, 1); tmpP = new T.Vector3(); yAxis = new T.Vector3(0, 1, 0); }
        // Kamera
        var dist = 78, height = 62, tx = 0, tz = 4, off = 0, offY = 0;
        if (mode === 'title') { cam.ang += dt * 0.08; dist = 82; height = 48; }
        else if (mode === 'plan') { dist = 64; height = 66; off = 230; cam.ang = lerp(cam.ang, 0, 0.05); if (focusPlot >= 0) { var fp = C.plotPos(focusPlot); tx = fp.x * 0.35; tz = fp.z * 0.35 + 4; } }
        else if (mode === 'plan2') { dist = 66; height = 66; cam.ang = lerp(cam.ang, 0, 0.05); }
        else if (mode === 'day') { cam.ang += dt * 0.05; dist = 72; height = 52; }
        else if (mode === 'evening') { cam.ang += dt * 0.03; dist = 80; height = 56; }
        else if (mode === 'final') { cam.ang = lerp(cam.ang, Math.sin(time * 0.3) * 0.4, 0.02); dist = 36; height = 20; tz = 6; offY = 110; }
        var lookY = mode === 'final' ? 3 : 0;
        if (closeup) { cam.ang = lerp(cam.ang, 0, 0.08); dist = 21; height = 6.5; tx = 0; tz = 7.4; off = -330; lookY = 3.4; }
        var k = 1 - Math.exp(-dt * 2.5);
        cam.tx = lerp(cam.tx, tx, k); cam.tz = lerp(cam.tz, tz, k);
        cam.x = lerp(cam.x, cam.tx + Math.sin(cam.ang) * dist, k);
        cam.y = lerp(cam.y, height, k);
        cam.z = lerp(cam.z, cam.tz + Math.cos(cam.ang) * dist, k);
        camera.position.set(cam.x, cam.y, cam.z);
        camera.lookAt(cam.tx, lookY, cam.tz);
        camera.setViewOffset(W, H, off, offY, W, H);

        rings.forEach(function (r) { if (r.visible) r.material.opacity = 0.6 + Math.sin(time * 5) * 0.35; });
        plotObjs.forEach(function (o) {
            if (o.shop && o.anim < 1) { o.anim = Math.min(1, o.anim + dt / 0.9); var s = Math.max(0.01, easeOutBack(o.anim)); o.shop.scale.set(1, s, 1); }
            if (o.sold.visible) o.sold.material.opacity = 0.75 + Math.sin(time * 8) * 0.25;
        });
        if (water) water.position.y = 0.85 + Math.sin(time * 2) * 0.05;
        updateClouds(dt);
        animateAvatars(dt);
        // Passanten
        var P = C._peds, any = false;
        peds.forEach(function (p, i) {
            var u = p.u;
            if (!u.active) {
                if (!u.hidden) { u.hidden = true; any = true; M.makeScale(0, 0, 0); Object.keys(P).forEach(function (k2) { P[k2].setMatrixAt(i, M); }); }
                return;
            }
            any = true;
            u.t += dt / u.dur;
            var x, z, f = Math.min(1, u.t), yaw = u.yaw;
            if (u.lost && u.t > 1) {
                var back = Math.min(1, (u.t - 1) * 1.5); x = lerp(u.e.x, u.e.x + 4, back); z = lerp(u.e.z, u.e.z + 6, back);
                yaw = Math.atan2(4, 6); if (back >= 1) u.active = false;
            } else { x = lerp(u.s.x, u.e.x, f); z = lerp(u.s.z, u.e.z, f); }
            if (!u.lost && u.t >= 1) { u.active = false; if (Math.random() < 0.35) C.coin(u.plot, 1); }
            var sw = Math.sin(time * 11 + i) * 0.65;
            tmpP.set(x, 0.45, z); tmpQ.setFromAxisAngle(yAxis, yaw); tmpS.set(0.8, 0.8, 0.8);
            base.compose(tmpP, tmpQ, tmpS);
            drawFig(P, i, base, sw, u.lost && u.t > 1 && false);
        });
        if (any) Object.keys(P).forEach(function (k2) { P[k2].instanceMatrix.needsUpdate = true; });
        // Münzen
        coinsPool.forEach(function (c) {
            if (!c.visible) return;
            var u = c.userData; u.life -= dt; u.v -= 14 * dt; c.position.y += u.v * dt; c.rotation.y += u.spin * dt; c.rotation.x = 1.2;
            if (u.life <= 0) c.visible = false;
        });
        if (rain.visible) {
            var a = rain.geometry.attributes.position.array;
            for (var r = 1; r < a.length; r += 3) { a[r] -= 40 * dt; if (a[r] < 0) a[r] = 40; }
            rain.geometry.attributes.position.needsUpdate = true;
        }
        if (confetti.userData.life > 0) {
            var cu = confetti.userData; cu.life -= dt;
            var pos = confetti.geometry.attributes.position.array, vel = cu.vel;
            for (var j = 0; j < pos.length / 3; j++) {
                vel[j * 3 + 1] = Math.max(-3, vel[j * 3 + 1] - 10 * dt); vel[j * 3] *= 0.985; vel[j * 3 + 2] *= 0.985;
                pos[j * 3] += vel[j * 3] * dt; pos[j * 3 + 1] += vel[j * 3 + 1] * dt; pos[j * 3 + 2] += vel[j * 3 + 2] * dt;
                if (cu.life <= 0) pos[j * 3 + 1] = -50;
            }
            confetti.geometry.attributes.position.needsUpdate = true;
        }
    }
})(window);
