/* Kiez-Könige – 3D-Stadt (three.js r149)
   Vier Viertel, 16 Grundstücke, Läden je Art, Passanten, Münzen, Wetter, Tageszeit. */
(function (G) {
    'use strict';
    var T = G.THREE, K = G.KKDATA;
    var C = { ok: false };
    G.KK3D = C;
    ['init', 'sync', 'select', 'mode', 'setTime', 'setWeather', 'customer', 'coin', 'label', 'soldOut', 'celebrate', 'clearDay', 'screenPos'].forEach(function (k) { C[k] = function () { }; });
    if (!T) return;

    var TV = /AFT|Android/i.test(navigator.userAgent);
    var W = 1280, H = 720;
    var renderer, scene, camera, canvas, hemi, sun, clockT = 0.3, weather = 'sun';
    var mode = 'title', focusPlot = -1, time = 0, last = 0;
    var cam = { x: 0, y: 60, z: 60, tx: 0, tz: 0, ang: 0 };
    var plotObjs = [], rings = [], peds = [], coinsPool = [], rain = null, confetti = null;
    var geo = {}, mat = {};
    var PX = [-20, -10, 10, 20];

    function col(h) { return new T.Color(h); }
    function lerp(a, b, k) { return a + (b - a) * k; }
    function easeOutBack(t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
    C.plotPos = function (id) { var p = K.plots[id]; return { x: PX[p.gx], z: PX[p.gy] }; };

    function box(g, w, h, d, x, y, z, m) { var b = new T.Mesh(geo.box, m); b.scale.set(w, h, d); b.position.set(x, y, z); g.add(b); return b; }
    function lam(c, e) { var m = new T.MeshLambertMaterial({ color: c }); if (e) { m.emissive = col(e); m.emissiveIntensity = 0.6; } return m; }
    function windowsTex() {
        var c = document.createElement('canvas'); c.width = 64; c.height = 64;
        var g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
        g.fillStyle = '#334155';
        for (var y = 0; y < 2; y++) for (var x = 0; x < 2; x++) g.fillRect(8 + x * 30, 10 + y * 30, 18, 18);
        var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t;
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
        if (s.userData.text === text + bg) return;
        s.userData.text = text + bg;
        var c = s.userData.canvas, g = c.getContext('2d');
        g.clearRect(0, 0, 512, 128);
        g.font = '800 58px Inter, sans-serif';
        var w = Math.min(500, g.measureText(text).width + 60);
        g.fillStyle = bg; rr(g, (512 - w) / 2, 18, w, 92, 46); g.fill();
        g.fillStyle = fg || '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 66);
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
        scene.fog = new T.Fog(0x9ec5e8, 90, 220);
        camera = new T.PerspectiveCamera(40, W / H, 0.5, 400);
        hemi = new T.HemisphereLight(0xdbeafe, 0x3a3a2a, 0.95); scene.add(hemi);
        sun = new T.DirectionalLight(0xfff4e0, 0.85); sun.position.set(30, 50, 20); scene.add(sun);

        geo.box = new T.BoxGeometry(1, 1, 1);
        geo.cyl = new T.CylinderGeometry(1, 1, 1, 14);
        geo.cone = new T.ConeGeometry(1, 1, 14);
        geo.sphere = new T.SphereGeometry(1, 14, 10);
        geo.coin = new T.CylinderGeometry(0.5, 0.5, 0.14, 14);
        mat.win = windowsTex();
        mat.coin = new T.MeshPhongMaterial({ color: 0xfacc15, emissive: 0x6b4500, shininess: 80 });

        buildWorld();
        buildPlots();
        buildPeds();
        for (var i = 0; i < 40; i++) { var c = new T.Mesh(geo.coin, mat.coin); c.visible = false; scene.add(c); coinsPool.push(c); }
        buildRain();
        buildConfetti();
        [0, 1].forEach(function (pi) {
            var r = new T.Mesh(new T.RingGeometry(5.6, 6.4, 40), new T.MeshBasicMaterial({ color: col(K.players[pi].color), transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false }));
            r.rotation.x = -Math.PI / 2; r.position.y = 0.7; r.visible = false; scene.add(r); rings.push(r);
        });
        C.setTime(0.25);
        C.ok = true;
        requestAnimationFrame(loop);
        return true;
    };

    function buildWorld() {
        var ground = new T.Mesh(new T.PlaneGeometry(400, 400), lam(0x5b7a4a)); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; scene.add(ground);
        // Viertel-Flächen
        K.districts.forEach(function (d, i) {
            var cx = i % 2 ? 15 : -15, cz = i < 2 ? -15 : 15;
            var tile = new T.Mesh(geo.box, lam(col(d.ground).getHex())); tile.scale.set(22, 0.2, 22); tile.position.set(cx, 0.05, cz); scene.add(tile);
            var lbl = textSprite(d.name, 'rgba(15,23,42,0.75)', d.color, 1.0);
            lbl.position.set(cx, 2.2, cz + (i < 2 ? -13.5 : 13.5)); lbl.scale.set(13, 3.25, 1); scene.add(lbl);
        });
        // Straßen: Kreuz + Ring
        var road = lam(0x2b2f3a), line = new T.MeshBasicMaterial({ color: 0xe2e8f0 });
        box(scene, 8, 0.22, 90, 0, 0.06, 0, road); box(scene, 90, 0.22, 8, 0, 0.06, 0, road);
        box(scene, 90, 0.22, 5, 0, 0.06, -28.5, road); box(scene, 90, 0.22, 5, 0, 0.06, 28.5, road);
        box(scene, 5, 0.22, 90, -28.5, 0.06, 0, road); box(scene, 5, 0.22, 90, 28.5, 0.06, 0, road);
        for (var i = -40; i <= 40; i += 5) { box(scene, 0.25, 0.25, 2.2, 0, 0.1, i, line); box(scene, 2.2, 0.25, 0.25, i, 0.1, 0, line); }
        // Platz mit Brunnen
        var plaza = new T.Mesh(geo.cyl, lam(0xcbd5e1)); plaza.scale.set(5.5, 0.3, 5.5); plaza.position.y = 0.2; scene.add(plaza);
        var water = new T.Mesh(geo.cyl, lam(0x38bdf8, 0x0ea5e9)); water.scale.set(3, 0.35, 3); water.position.y = 0.35; scene.add(water);
        var tower = new T.Mesh(geo.cyl, lam(0xe2e8f0)); tower.scale.set(0.6, 2.2, 0.6); tower.position.y = 1.4; scene.add(tower);
        // Kulissen-Häuser rund um die Stadt (instanziert)
        var n = 90, inst = new T.InstancedMesh(geo.box, new T.MeshLambertMaterial({ color: 0xffffff, map: mat.win }), n);
        var m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), pos = new T.Vector3(), cc = new T.Color();
        var pal = [0xfca5a5, 0xfde68a, 0xa7f3d0, 0xbfdbfe, 0xddd6fe, 0xfbcfe8, 0xe2e8f0, 0xfed7aa];
        for (var k = 0; k < n; k++) {
            var a = k / n * Math.PI * 2, r = 96 + (k * 37 % 14);
            var hgt = 8 + (k * 53 % 18);
            pos.set(Math.cos(a) * r, hgt / 2, Math.sin(a) * r); sc.set(6 + k % 4, hgt, 6 + (k + 1) % 4);
            m4.compose(pos, q, sc); inst.setMatrixAt(k, m4); inst.setColorAt(k, cc.setHex(pal[k % pal.length]));
        }
        scene.add(inst);
        // Bäume (instanziert)
        var tn = 60, trunk = new T.InstancedMesh(geo.cyl, lam(0x7c4a20), tn), crown = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), new T.MeshLambertMaterial({ color: 0x22a34a, flatShading: true }), tn);
        for (var t = 0; t < tn; t++) {
            var ang = t / tn * Math.PI * 2 + 0.05, rad = 33 + (t * 29 % 5);
            var x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
            if (Math.abs(x) < 6 || Math.abs(z) < 6) { x += 7; }
            pos.set(x, 0.8, z); sc.set(0.25, 1.6, 0.25); m4.compose(pos, q, sc); trunk.setMatrixAt(t, m4);
            pos.set(x, 2.2, z); sc.set(1.3, 1.5, 1.3); m4.compose(pos, q, sc); crown.setMatrixAt(t, m4);
        }
        scene.add(trunk); scene.add(crown);
    }

    function buildPlots() {
        K.plots.forEach(function (p, i) {
            var g = new T.Group(), pp = C.plotPos(i);
            g.position.set(pp.x, 0, pp.z);
            var pad = new T.Mesh(geo.box, lam(0x94a3b8)); pad.scale.set(8.4, 0.35, 8.4); pad.position.y = 0.3; g.add(pad);
            var edge = new T.Mesh(geo.box, new T.MeshBasicMaterial({ color: 0xffffff })); edge.scale.set(8.8, 0.25, 8.8); edge.position.y = 0.2; g.add(edge);
            // „Zu verpachten“-Schild
            var sign = new T.Group();
            var post = new T.Mesh(geo.box, lam(0x78350f)); post.scale.set(0.2, 1.6, 0.2); post.position.y = 1.2; sign.add(post);
            var board = new T.Mesh(geo.box, lam(0xfef3c7)); board.scale.set(2.2, 1.0, 0.15); board.position.y = 2.2; sign.add(board);
            g.add(sign);
            var label = textSprite('', 'rgba(15,23,42,0.85)', '#fff', 0.8); label.position.set(0, 7.5, 0); label.visible = false; g.add(label);
            var flag = textSprite('', 'rgba(0,0,0,0)', '#fff', 1); flag.visible = false; g.add(flag);
            scene.add(g);
            plotObjs.push({ g: g, pad: pad, edge: edge, sign: sign, label: label, shop: null, key: '', anim: 1, sold: textSprite('AUSVERKAUFT', '#dc2626', '#fff', 0.7) });
            var so = plotObjs[i].sold; so.position.set(0, 9.4, 0); so.visible = false; g.add(so);
        });
    }

    /* Ladenmodelle je Art */
    function shopModel(type, level, ownerColor) {
        var g = new T.Group(), t = K.types[type], s = 1 + level * 0.18;
        var wall = lam(0xf8fafc), roof = lam(col(ownerColor).getHex()), acc = lam(col(t.color).getHex(), t.color);
        var floors = 1 + (level >= 2 ? 1 : 0);
        function body(w, h, d) {
            var side = new T.MeshLambertMaterial({ color: 0xffffff, map: mat.win.clone() });
            side.map.needsUpdate = true; side.map.repeat.set(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
            var m = new T.Mesh(geo.box, [side, side, roof, roof, side, side]); m.scale.set(w, h, d); m.position.y = 0.5 + h / 2; g.add(m); return m;
        }
        if (type === 'kiosk') {
            body(3.4 * s, 2.6 * floors, 3 * s);
            var aw = box(g, 3.8 * s, 0.25, 1.6, 0, 2.5 * floors + 0.2, 1.9 * s, acc); aw.rotation.x = 0.35;
            box(g, 2.6 * s, 0.9, 0.6, 0, 1.0, 1.8 * s, lam(0x92400e));
        } else if (type === 'eis') {
            body(4 * s, 2.8 * floors, 3.6 * s);
            var cone = new T.Mesh(geo.cone, lam(0xd97706)); cone.scale.set(0.9, 2.2, 0.9); cone.rotation.x = Math.PI; cone.position.y = 2.8 * floors + 1.8; g.add(cone);
            [[0, 3.3, 0xf9a8d4], [0.4, 3.9, 0xfef3c7], [-0.3, 4.3, 0x93c5fd]].forEach(function (b) {
                var sc = new T.Mesh(geo.sphere, lam(b[2])); sc.scale.set(0.95, 0.85, 0.95); sc.position.set(b[0], 2.8 * floors + b[1] - 0.6, 0); g.add(sc);
            });
        } else if (type === 'cafe') {
            body(4.6 * s, 2.8 * floors, 3.6 * s);
            box(g, 4.8 * s, 0.3, 1.4, 0, 2.6, 2.4 * s, acc);
            [-1.6, 1.6].forEach(function (x) {
                var pole = new T.Mesh(geo.cyl, lam(0x475569)); pole.scale.set(0.08, 1.8, 0.08); pole.position.set(x * s, 1.4, 3.4 * s); g.add(pole);
                var um = new T.Mesh(geo.cone, acc); um.scale.set(1.2, 0.6, 1.2); um.position.set(x * s, 2.4, 3.4 * s); g.add(um);
                var tb = new T.Mesh(geo.cyl, lam(0xf8fafc)); tb.scale.set(0.6, 0.1, 0.6); tb.position.set(x * s, 1.2, 3.4 * s); g.add(tb);
            });
        } else if (type === 'imbiss') {
            body(4.4 * s, 2.8 * floors, 3.8 * s);
            var y0 = 2.8 * floors + 0.9;
            [[0.55, 0.45, 0xd97706], [0.62, 0.22, 0x7c2d12], [0.6, 0.12, 0x22c55e], [0.55, 0.4, 0xd97706]].forEach(function (l, k) {
                var c = new T.Mesh(geo.cyl, lam(l[2])); c.scale.set(l[0] * 1.8, l[1], l[0] * 1.8); c.position.y = y0 + k * 0.36; g.add(c);
            });
        } else if (type === 'fitness') {
            body(5.6 * s, 3.2 * floors, 4.4 * s);
            var y1 = 3.2 * floors + 1.3;
            var bar = new T.Mesh(geo.cyl, lam(0x334155)); bar.scale.set(0.18, 4, 0.18); bar.rotation.z = Math.PI / 2; bar.position.y = y1; g.add(bar);
            [-1.8, 1.8].forEach(function (x) { var w = new T.Mesh(geo.cyl, acc); w.scale.set(0.9, 0.5, 0.9); w.rotation.z = Math.PI / 2; w.position.set(x, y1, 0); g.add(w); });
        } else {
            body(5.4 * s, 3.4 * floors, 4.4 * s);
            var screen = box(g, 4.2 * s, 1.8, 0.15, 0, 3.4 * floors + 1.6, 0, new T.MeshBasicMaterial({ color: 0x8b5cf6 }));
            box(g, 3.6 * s, 1.3, 0.2, 0, 3.4 * floors + 1.6, 0.05, new T.MeshBasicMaterial({ color: 0x22d3ee }));
            screen.userData.neon = true;
        }
        // Eingangstür nach vorn
        box(g, 1.1, 1.6, 0.15, 0, 1.3, (type === 'kiosk' ? 1.55 : 1.85) * s + 0.05, lam(0x1e293b));
        return g;
    }

    C.sync = function (st) {
        if (!C.ok) return;
        st.plots.forEach(function (pl, i) {
            var o = plotObjs[i];
            var key = pl.owner + ':' + pl.type + ':' + pl.level;
            if (key !== o.key) {
                if (o.shop) o.g.remove(o.shop);
                o.shop = null;
                if (pl.type) {
                    o.shop = shopModel(pl.type, pl.level, st.players[pl.owner].color);
                    o.g.add(o.shop);
                    if (o.key) { o.anim = 0; C.coin(i, 8); }
                }
                o.edge.material.color.set(pl.owner >= 0 ? st.players[pl.owner].color : '#ffffff');
                o.sign.visible = !pl.type;
                o.key = key;
            }
            if (pl.type) {
                var t = K.types[pl.type];
                drawSprite(o.label, t.icon + ' ' + pl.price.toFixed(2).replace('.', ',') + ' €', 'rgba(15,23,42,0.85)', st.players[pl.owner].color);
                o.label.visible = mode !== 'title';
                o.label.position.y = 6.5 + pl.level * 1.4;
                o.sold.position.y = o.label.position.y + 1.9;
            } else o.label.visible = false;
        });
    };
    C.label = function (id, text, color) { var o = plotObjs[id]; if (o && o.label.visible) drawSprite(o.label, text, 'rgba(15,23,42,0.85)', color); };
    C.soldOut = function (id, on) { var o = plotObjs[id]; if (o) o.sold.visible = !!on; };
    C.clearDay = function () { plotObjs.forEach(function (o) { o.sold.visible = false; }); peds.forEach(function (p) { p.u.active = false; }); };

    C.select = function (pi, id) {
        var r = rings[pi]; if (!r) return;
        if (id === null || id === undefined || id < 0) { r.visible = false; return; }
        var pp = C.plotPos(id);
        r.visible = true; r.position.x = pp.x; r.position.z = pp.z;
        r.userData.target = id;
        if (pi === 0 || focusPlot < 0) focusPlot = id;
    };
    C.focus = function (id) { focusPlot = id; };
    C.mode = function (m) { mode = m; canvas.style.visibility = m === 'off' ? 'hidden' : 'visible'; if (m !== 'plan') rings.forEach(function (r) { r.visible = false; }); };

    /* Tageszeit 0 = Morgen, 0.5 = Mittag, 1 = Abend */
    C.setTime = function (t) {
        clockT = t;
        var sky = new T.Color();
        if (t < 0.5) sky.lerpColors(col('#fcd9b6'), col('#9ec5e8'), t * 2);
        else sky.lerpColors(col('#9ec5e8'), col('#f59e0b'), (t - 0.5) * 2);
        if (t > 0.9) sky.lerp(col('#1e1b4b'), (t - 0.9) * 8);
        if (weather === 'rain') sky.lerp(col('#64748b'), 0.6);
        if (weather === 'heat') sky.lerp(col('#fde68a'), 0.25);
        scene.background = sky; scene.fog.color = sky;
        var ang = Math.PI * (0.15 + t * 0.7);
        sun.position.set(Math.cos(ang) * 60, Math.sin(ang) * 60 + 5, 20);
        sun.intensity = (weather === 'rain' ? 0.45 : 0.9) * (t > 0.92 ? 0.4 : 1);
        hemi.intensity = weather === 'rain' ? 0.75 : 0.95;
    };
    C.setWeather = function (w) { weather = w; rain.visible = w === 'rain'; C.setTime(clockT); };

    /* ---------- Passanten ---------- */
    function buildPeds() {
        var n = 140;
        geo.ped = new T.CylinderGeometry(0.28, 0.34, 1.3, 7);
        var mesh = new T.InstancedMesh(geo.ped, new T.MeshLambertMaterial({ color: 0xffffff }), n);
        var heads = new T.InstancedMesh(new T.SphereGeometry(0.3, 8, 6), new T.MeshLambertMaterial({ color: 0xf1c19d }), n);
        mesh.frustumCulled = false; heads.frustumCulled = false;
        var cc = new T.Color(), pal = [0xef4444, 0x3b82f6, 0x22c55e, 0xf59e0b, 0xa855f7, 0xec4899, 0x14b8a6, 0xf8fafc];
        for (var i = 0; i < n; i++) { mesh.setColorAt(i, cc.setHex(pal[i % pal.length])); peds.push({ u: { active: false } }); }
        scene.add(mesh); scene.add(heads);
        C._pedMesh = mesh; C._pedHeads = heads;
    }
    function spawnPoint(d) {
        var cx = d % 2 ? 15 : -15, cz = d < 2 ? -15 : 15;
        var side = Math.random() < 0.5;
        if (side) return { x: cx + (Math.random() - 0.5) * 20, z: d < 2 ? -28.5 : 28.5 };
        return { x: d % 2 ? 28.5 : -28.5, z: cz + (Math.random() - 0.5) * 20 };
    }
    C.customer = function (plotId, fromD, lost) {
        for (var i = 0; i < peds.length; i++) {
            var u = peds[i].u;
            if (u.active) continue;
            var s = Math.random() < 0.5 ? { x: (Math.random() - 0.5) * 6, z: (fromD < 2 ? -1 : 1) * (8 + Math.random() * 18) } : spawnPoint(fromD);
            var pp = C.plotPos(plotId), door = { x: pp.x, z: pp.z + 5 };
            u.active = true; u.t = 0; u.s = s; u.e = door; u.lost = lost; u.plot = plotId;
            u.dur = 1.6 + Math.random() * 1.2;
            return true;
        }
        return false;
    };

    /* ---------- Münzen ---------- */
    C.coin = function (plotId, n) {
        var pp = C.plotPos(plotId), c = 0;
        for (var i = 0; i < coinsPool.length && c < (n || 1); i++) {
            var m = coinsPool[i]; if (m.visible) continue;
            m.visible = true; m.position.set(pp.x + (Math.random() - 0.5) * 3, 6, pp.z + (Math.random() - 0.5) * 3);
            m.userData = { v: 6 + Math.random() * 3, life: 1.1, spin: 6 + Math.random() * 6 }; c++;
        }
    };

    function buildRain() {
        var n = 700, g = new T.BufferGeometry(), p = new Float32Array(n * 3);
        for (var i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 100; p[i * 3 + 1] = Math.random() * 40; p[i * 3 + 2] = (Math.random() - 0.5) * 100; }
        g.setAttribute('position', new T.BufferAttribute(p, 3));
        rain = new T.Points(g, new T.PointsMaterial({ color: 0xbfdbfe, size: 0.35, transparent: true, opacity: 0.7 }));
        rain.visible = false; rain.frustumCulled = false; scene.add(rain);
    }
    function buildConfetti() {
        var n = 400, g = new T.BufferGeometry(), p = new Float32Array(n * 3), c = new Float32Array(n * 3);
        var pal = ['#f472b6', '#facc15', '#22d3ee', '#4ade80', '#a78bfa', '#fb923c'].map(col);
        for (var i = 0; i < n; i++) { var k = pal[i % pal.length]; c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b; p[i * 3 + 1] = -50; }
        g.setAttribute('position', new T.BufferAttribute(p, 3)); g.setAttribute('color', new T.BufferAttribute(c, 3));
        confetti = new T.Points(g, new T.PointsMaterial({ size: 0.5, vertexColors: true }));
        confetti.userData = { vel: new Float32Array(n * 3), life: 0 }; confetti.frustumCulled = false; scene.add(confetti);
    }
    C.celebrate = function (pi, st) {
        var ids = st ? st.plots.filter(function (pl) { return pl.owner === pi; }).map(function (pl) { return pl.id; }) : [];
        var pos = confetti.geometry.attributes.position.array, vel = confetti.userData.vel;
        for (var k = 0; k < pos.length / 3; k++) {
            var c = ids.length ? C.plotPos(ids[k % ids.length]) : { x: 0, z: 0 };
            pos[k * 3] = c.x; pos[k * 3 + 1] = 10; pos[k * 3 + 2] = c.z;
            vel[k * 3] = (Math.random() - 0.5) * 16; vel[k * 3 + 1] = 8 + Math.random() * 12; vel[k * 3 + 2] = (Math.random() - 0.5) * 16;
        }
        confetti.userData.life = 6; confetti.geometry.attributes.position.needsUpdate = true;
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
    var m4 = null, tmpQ = null, tmpS = null, tmpP = null;
    function animate(dt) {
        if (!m4) { m4 = new T.Matrix4(); tmpQ = new T.Quaternion(); tmpS = new T.Vector3(1, 1, 1); tmpP = new T.Vector3(); }
        // Kamera
        var dist = 78, height = 62, tx = 0, tz = 4, off = 0;
        if (mode === 'title') { cam.ang += dt * 0.08; dist = 82; height = 48; }
        else if (mode === 'plan') { dist = 64; height = 66; off = 230; cam.ang = lerp(cam.ang, 0, 0.05); if (focusPlot >= 0) { var fp = C.plotPos(focusPlot); tx = fp.x * 0.35; tz = fp.z * 0.35 + 4; } }
        else if (mode === 'plan2') { dist = 66; height = 66; cam.ang = lerp(cam.ang, 0, 0.05); }
        else if (mode === 'day') { cam.ang += dt * 0.05; dist = 72; height = 52; }
        else if (mode === 'evening') { cam.ang += dt * 0.03; dist = 80; height = 56; }
        else if (mode === 'final') { cam.ang += dt * 0.1; dist = 76; height = 44; }
        var k = 1 - Math.exp(-dt * 2.5);
        cam.tx = lerp(cam.tx, tx, k); cam.tz = lerp(cam.tz, tz, k);
        cam.x = lerp(cam.x, cam.tx + Math.sin(cam.ang) * dist, k);
        cam.y = lerp(cam.y, height, k);
        cam.z = lerp(cam.z, cam.tz + Math.cos(cam.ang) * dist, k);
        camera.position.set(cam.x, cam.y, cam.z);
        camera.lookAt(cam.tx, 0, cam.tz);
        camera.setViewOffset(W, H, off, 0, W, H);

        rings.forEach(function (r) { if (r.visible) { r.rotation.z += dt * 0.8; r.material.opacity = 0.65 + Math.sin(time * 5) * 0.3; } });
        plotObjs.forEach(function (o) {
            if (o.shop && o.anim < 1) { o.anim = Math.min(1, o.anim + dt / 0.9); var s = Math.max(0.01, easeOutBack(o.anim)); o.shop.scale.set(1, s, 1); }
            if (o.sold.visible) o.sold.material.opacity = 0.75 + Math.sin(time * 8) * 0.25;
        });
        // Passanten
        var mesh = C._pedMesh, heads = C._pedHeads;
        peds.forEach(function (p, i) {
            var u = p.u;
            if (!u.active) { tmpP.set(0, -20, 0); m4.compose(tmpP, tmpQ, tmpS); mesh.setMatrixAt(i, m4); heads.setMatrixAt(i, m4); return; }
            u.t += dt / u.dur;
            var x, z, f = Math.min(1, u.t);
            if (u.lost && u.t > 1) { var back = Math.min(1, (u.t - 1) * 1.5); x = lerp(u.e.x, u.e.x + 4, back); z = lerp(u.e.z, u.e.z + 6, back); if (back >= 1) u.active = false; }
            else { x = lerp(u.s.x, u.e.x, f); z = lerp(u.s.z, u.e.z, f); }
            if (!u.lost && u.t >= 1) { u.active = false; if (Math.random() < 0.35) C.coin(u.plot, 1); }
            var bob = Math.abs(Math.sin(time * 9 + i)) * 0.15;
            tmpP.set(x, 1.15 + bob, z); m4.compose(tmpP, tmpQ, tmpS); mesh.setMatrixAt(i, m4);
            tmpP.set(x, 2.0 + bob, z); m4.compose(tmpP, tmpQ, tmpS); heads.setMatrixAt(i, m4);
        });
        mesh.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
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
