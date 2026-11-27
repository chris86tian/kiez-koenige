/* Kiez-Könige – TV-Oberfläche: Bildschirme, Fernbedienung, Handy-Controller, Ablauf */
(function () {
    'use strict';
    var K = window.KKDATA, S = window.KKSIM, C = window.KK3D, N = window.KKNET;
    var app = document.getElementById('app');
    var ST = null;                       // Spielstand
    var OPT = { control: 'phones', p2: 'human', days: 20, music: 'lofi', looks: [{ hat: 'cap', face: 'smile', skin: 0 }, { hat: 'hair', face: 'grin', skin: 1 }] };
    var sel = [5, 6];                    // gewähltes Grundstück je Spieler
    var msgs = [null, null];             // letzte Rückmeldung je Spieler (fürs Handy)
    var logs = [[], []];                 // Aktionsprotokoll je Spieler (für den TV im Handy-Modus)
    var phase = 'title';                 // title | setup | lobby | plan | handover | day | evening | end
    var planPi = 0;                      // wer plant gerade (Fernbedienungs-Modus)
    var timers = [], focused = null, backFn = null, ctx = {};
    var live = null, planDeadline = 0;
    var SAVE = 'kk_save_v1';
    var PLAN_SECONDS = 120;

    /* ================= Hilfen ================= */
    function eur(n) { var neg = n < 0; n = Math.abs(Math.round(n)); return (neg ? '−' : '') + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'; }
    function sgn(n) { return (n >= 0 ? '+' : '−') + eur(Math.abs(n)); }
    function price(x) { return x.toFixed(2).replace('.', ',') + ' €'; }
    function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
    function every(fn, ms) { var t = setInterval(fn, ms); timers.push(t); return t; }
    function clearTimers() { timers.forEach(function (t) { clearTimeout(t); clearInterval(t); }); timers = []; }
    function plotName(id) { var p = K.plots[id]; return K.districts[p.d].short + ' ' + ('ABCD')[p.gy] + (p.gx + 1); }
    function isCpu(pi) { return ST && ST.players[pi].cpu; }
    function save() { try { if (ST && ST.phase !== 'end') localStorage.setItem(SAVE, JSON.stringify({ st: ST, opt: OPT, sel: sel })); } catch (e) { } }
    function loadSave() { try { var t = localStorage.getItem(SAVE); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
    try { var lk = JSON.parse(localStorage.getItem('kk_looks') || 'null'); if (lk && lk.length === 2) OPT.looks = lk; } catch (e) { }
    function clearSave() { try { localStorage.removeItem(SAVE); } catch (e) { } }

    /* ================= Bild an jede Größe anpassen ================= */
    function fit() {
        var st = document.getElementById('stage'), w = window.innerWidth, h = window.innerHeight, s = Math.min(w / 1280, h / 720);
        st.style.transform = 'translate(' + Math.round((w - 1280 * s) / 2) + 'px,' + Math.round((h - 720 * s) / 2) + 'px) scale(' + s + ')';
    }
    window.addEventListener('resize', fit); fit();
    document.addEventListener('touchstart', function () { document.body.classList.add('touch'); }, { once: true, passive: true });

    /* ================= Sound & Musik (audio.js) ================= */
    var AU = window.NSAUDIO, muted = false, curMusic = 'plan', audioUnlocked = false;
    function sfx(k) { AU.sfx(k); }
    var MUS = { lofi: { plan: 'lofiMorning', day: 'lofiDay', evening: 'lofiEvening' },
                chip: { plan: 'chipPlan', day: 'chipKiez', evening: 'chipPlan' },
                phonk: { plan: 'phonkChill', day: 'phonkKiez', evening: 'phonkChill' } };
    try { var ms = localStorage.getItem('kk_music'); if (ms) OPT.music = ms; } catch (e) { }
    /* mode: 'plan' | 'day' | 'evening' */
    function music(mode) {
        curMusic = mode || curMusic;
        var st = OPT.music || 'lofi';
        if (st === 'off' || !MUS[st]) { AU.music(null); return; }
        AU.music(MUS[st][curMusic], curMusic === 'evening' ? 0.85 : 1);
    }
    var toastT = null;
    function toast(m) { var el = document.getElementById('toast'); el.innerHTML = m; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('on'); }, 2400); }

    /* ================= Navigation (Fernbedienung) ================= */
    function show(html, opts) {
        clearTimers();
        opts = opts || {};
        backFn = opts.back || null;
        app.innerHTML = '<div class="screen">' + html + '</div>';
        C.mode(opts.three || 'off');
        focused = null;
        var keep = opts.keep && app.querySelector('[data-key="' + opts.keep + '"]');
        setFocus(keep || app.querySelector('[data-auto]') || first());
        publish();
    }
    function cands() { var m = app.querySelector('.modal'), list = (m || app).querySelectorAll('[data-f]'), out = []; for (var i = 0; i < list.length; i++) if (list[i].getClientRects().length) out.push(list[i]); return out; }
    function first() { return cands()[0] || null; }
    function setFocus(el) { if (focused) focused.classList.remove('f'); focused = el; if (el) el.classList.add('f'); }
    function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    function ov(a1, a2, b1, b2) { return Math.min(a2, b2) - Math.max(a1, b1) > 6; }
    function move(dir) {
        if (focused && focused.hasAttribute('data-map') && mapMove(dir)) return;
        var list = cands(); if (!list.length) return;
        if (!focused || list.indexOf(focused) < 0) { setFocus(list[0]); return; }
        var from = focused.getBoundingClientRect(), fc = center(from), best = null, bs = Infinity;
        list.forEach(function (el) {
            if (el === focused || el.hasAttribute('data-map')) return;
            var r = el.getBoundingClientRect(), c = center(r), p, o;
            if (dir === 'up') { if (c.y >= fc.y - 6) return; p = fc.y - c.y; o = ov(from.left, from.right, r.left, r.right) ? 0 : Math.abs(c.x - fc.x); }
            if (dir === 'down') { if (c.y <= fc.y + 6) return; p = c.y - fc.y; o = ov(from.left, from.right, r.left, r.right) ? 0 : Math.abs(c.x - fc.x); }
            if (dir === 'left') { if (c.x >= fc.x - 6) return; p = fc.x - c.x; o = ov(from.top, from.bottom, r.top, r.bottom) ? 0 : Math.abs(c.y - fc.y); }
            if (dir === 'right') { if (c.x <= fc.x + 6) return; p = c.x - fc.x; o = ov(from.top, from.bottom, r.top, r.bottom) ? 0 : Math.abs(c.y - fc.y); }
            var sc = p + o * 2.2; if (sc < bs) { bs = sc; best = el; }
        });
        if (best) { setFocus(best); sfx('move'); }
        else if (dir === 'left') { var map = app.querySelector('[data-map]'); if (map) { setFocus(map); sfx('move'); } }
    }
    var H = {};
    function act(el) {
        if (!el) return;
        if (el.classList.contains('dis')) { sfx('no'); toast(el.getAttribute('data-why') || 'Geht gerade nicht.'); return; }
        var h = H[el.getAttribute('data-a')];
        if (h) { sfx('click'); h(el.getAttribute('data-v'), el); }
    }
    function btn(label, a, v, o) {
        o = o || {};
        var key = a + (v !== undefined && v !== null ? ':' + v : '');
        return '<button class="btn ' + (o.cls || '') + (o.dis ? ' dis' : '') + '" data-f data-key="' + esc(key) + '" data-a="' + a + '"' + (v !== undefined && v !== null ? ' data-v="' + esc(v) + '"' : '') +
            (o.auto ? ' data-auto' : '') + (o.why ? ' data-why="' + esc(o.why) + '"' : '') + (o.style ? ' style="' + o.style + '"' : '') + '>' + label + '</button>';
    }
    app.addEventListener('click', function (e) { var el = e.target.closest('[data-f]'); if (el) { setFocus(el); act(el); } });
    document.addEventListener('keydown', function (e) {
        AU.unlock(); if (!audioUnlocked) { audioUnlocked = true; music(); }
        var k = e.key, c = e.keyCode;
        if (k === 'ArrowUp' || c === 38) { e.preventDefault(); move('up'); }
        else if (k === 'ArrowDown' || c === 40) { e.preventDefault(); move('down'); }
        else if (k === 'ArrowLeft' || c === 37) { e.preventDefault(); move('left'); }
        else if (k === 'ArrowRight' || c === 39) { e.preventDefault(); move('right'); }
        else if (k === 'Enter' || k === ' ' || c === 13 || c === 23) { e.preventDefault(); if (!e.repeat) act(focused); }
        else if (k === 'Escape' || k === 'Backspace') { e.preventDefault(); window.tvBack(); }
        else if (k === 'm') { muted = !muted; AU.setMuted(muted); toast(muted ? 'Ton aus' : 'Ton an'); }
    }, true);
    window.tvBack = function () { var m = app.querySelector('.modal'); if (m) { closeModal(); return true; } if (backFn) { var r = backFn(); return r !== false; } return false; };
    window.tvKey = function (n) {
        if (n === 'playpause') { act(focused); return true; }
        if (n === 'menu') { muted = !muted; AU.setMuted(muted); toast(muted ? '🔇 Ton aus' : '🔊 Ton an'); return true; }
        if (n === 'ff' && phase === 'day') { H.fast(); return true; }
        return true;
    };
    var modalPrev = null;
    function modal(html) {
        closeModal(); modalPrev = focused;
        var m = document.createElement('div'); m.className = 'modal'; m.innerHTML = '<div class="card">' + html + '</div>';
        app.querySelector('.screen').appendChild(m);
        setFocus(m.querySelector('[data-auto]') || m.querySelector('[data-f]'));
    }
    function closeModal() { C.closeup && C.closeup(false); var m = app.querySelector('.modal'); if (m) { m.remove(); setFocus(modalPrev && modalPrev.isConnected ? modalPrev : first()); } }
    H.close = function () { closeModal(); };

    /* ================= QR ================= */
    function qr(text) { if (!window.qrcode) return ''; var q = window.qrcode(0, 'L'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 8, margin: 32, scalable: true }); /* Rand 32 px = 4 Module */ }

    /* ================= Looks (Avatare) ================= */
    function lookOf(pi) { var l = (OPT.looks && OPT.looks[pi]) || {}; return { hat: l.hat || 'cap', face: l.face || 'smile', skin: l.skin | 0 }; }
    function applyLooks() {
        [0, 1].forEach(function (i) {
            C.avatar(i, lookOf(i));
            C.avatarName && C.avatarName(i, ST ? ST.players[i].name : K.players[i].name);
        });
    }
    function setLook(pi, key, val) {
        var L = K.looks, l = lookOf(pi);
        if (key === 'hat' && L.hats.some(function (h) { return h[0] === val; })) l.hat = val;
        else if (key === 'face' && L.faces.some(function (h) { return h[0] === val; })) l.face = val;
        else if (key === 'skin' && +val >= 0 && +val < L.skins.length) l.skin = +val;
        else return false;
        OPT.looks = OPT.looks || [{}, {}]; OPT.looks[pi] = l; applyLooks(); C.cheer(pi); save();
        try { localStorage.setItem('kk_looks', JSON.stringify(OPT.looks)); } catch (e) { }
        return true;
    }
    function lookName(list, id) { for (var i = 0; i < list.length; i++) if (list[i][0] === id) return list[i]; return list[0]; }
    function cycle(list, id) { for (var i = 0; i < list.length; i++) if (list[i][0] === id) return list[(i + 1) % list.length][0]; return list[0][0]; }
    H.looks = function () { looksModal(null); };
    function looksModal(keep) {
        var L = K.looks;
        function row(pi) {
            var l = lookOf(pi), h = lookName(L.hats, l.hat), f = lookName(L.faces, l.face);
            return '<div class="lookrow"><b style="width:130px;color:' + K.players[pi].color + '">' + esc(K.players[pi].name) + '</b>' +
                btn('<span style="font-size:30px">' + h[1] + '</span><span class="sub">' + h[2] + '</span>', 'look', pi + '|hat') +
                btn('<span style="font-size:30px">' + f[1] + '</span><span class="sub">' + f[2] + '</span>', 'look', pi + '|face') +
                btn('<span style="display:inline-block;width:30px;height:30px;border-radius:8px;border:3px solid #15151f;background:' + L.skins[l.skin] + '"></span><span class="sub">Hautfarbe</span>', 'look', pi + '|skin') + '</div>';
        }
        modal('<h2>🎨 Eure Avatare</h2><div class="mute">OK drücken = nächster Hut, nächstes Gesicht, nächste Farbe. Schaut auf die Figuren in der Stadt!</div>' + row(0) + row(1) +
            '<div class="row" style="justify-content:flex-end">' + btn('Fertig', 'close', null, { cls: 'gold', auto: !keep }) + '</div>');
        var md = app.querySelector('.modal'); if (md) md.classList.add('side');
        C.closeup(true);
        if (keep) { var el = app.querySelector('.modal [data-key="' + keep + '"]'); if (el) setFocus(el); }
    }
    H.look = function (v, el) {
        var a = v.split('|'), pi = +a[0], k = a[1], l = lookOf(pi), L = K.looks;
        if (k === 'hat') setLook(pi, 'hat', cycle(L.hats, l.hat));
        else if (k === 'face') setLook(pi, 'face', cycle(L.faces, l.face));
        else setLook(pi, 'skin', (l.skin + 1) % L.skins.length);
        sfx('pop');
        looksModal(el.getAttribute('data-key'));
    };

    /* ================= Abzeichen ================= */
    var BADGES = [
        ['first', '🏪', 'Erster Laden', function (pi) { return S.shopsOf(ST, pi).length >= 1; }],
        ['chain', '🏙️', 'Ladenkette: 3 Läden', function (pi) { return S.shopsOf(ST, pi).length >= 3; }],
        ['all4', '🗺️', 'In allen 4 Vierteln', function (pi) { var d = {}; S.shopsOf(ST, pi).forEach(function (pl) { d[K.plots[pl.id].d] = 1; }); return Object.keys(d).length >= 4; }],
        ['up', '⬆️', 'Erster Ausbau', function (pi) { return S.shopsOf(ST, pi).some(function (pl) { return pl.level >= 1; }); }],
        ['mega', '🏰', 'Mega-Laden (Stufe 3)', function (pi) { return S.shopsOf(ST, pi).some(function (pl) { return pl.level >= 2; }); }],
        ['ad', '📣', 'Werbeprofi', function (pi, p) { return p.mkt > 0; }],
        ['sold', '🔥', 'Ausverkauft!', function (pi, p, x) { return x.report && ST.report.players[pi].lost > 0; }],
        ['k1', '💰', '1.000 € Gewinn an einem Tag', function (pi, p, x) { return x.report && ST.report.players[pi].profit >= 1000; }],
        ['k5', '💎', '5.000 € Gewinn an einem Tag', function (pi, p, x) { return x.report && ST.report.players[pi].profit >= 5000; }],
        ['free', '🏦', 'Schuldenfrei', function (pi, p) { return p.loanSeen && p.loan === 0; }],
        ['rich', '🤑', '100.000 € Vermögen', function (pi) { return S.wealth(ST, pi) >= 100000; }],
        ['king', '👑', 'Kiez-König', function (pi, p, x) { return x.win === pi; }]
    ];
    var badgeQ = [], badgeBusy = false;
    function checkBadges(pi, x) {
        if (!ST) return;
        var p = ST.players[pi]; x = x || {};
        p.badges = p.badges || [];
        if (p.loan > 0) p.loanSeen = true;
        BADGES.forEach(function (b) {
            if (p.badges.indexOf(b[0]) >= 0 || !b[3](pi, p, x)) return;
            p.badges.push(b[0]);
            if (!p.cpu) badgeQ.push({ pi: pi, b: b });
        });
        showBadge();
    }
    function badgeOf(id) { for (var i = 0; i < BADGES.length; i++) if (BADGES[i][0] === id) return BADGES[i]; return null; }
    function showBadge() {
        if (badgeBusy || !badgeQ.length) return;
        var it = badgeQ.shift(), el = document.getElementById('badge'), p = ST ? ST.players[it.pi] : K.players[it.pi];
        badgeBusy = true;
        el.innerHTML = '<div class="bi">' + it.b[1] + '</div><div><div class="bk">🏅 Abzeichen!</div><div class="bn">' + esc(it.b[2]) + '</div><div class="bp" style="color:' + shade(p.color) + '">' + esc(p.name) + '</div></div>';
        el.classList.add('on'); sfx('badge'); C.cheer(it.pi);
        setTimeout(function () { el.classList.remove('on'); setTimeout(function () { badgeBusy = false; showBadge(); }, 400); }, 2600);
    }
    function shade(c) { return c === '#22d3ee' ? '#0e7490' : c === '#f472b6' ? '#be185d' : '#15151f'; }
    function badgeRow(pi) {
        var bs = (ST.players[pi].badges || []).map(badgeOf).filter(Boolean);
        return bs.length ? '<div class="badges">' + bs.map(function (b) { return '<span title="' + esc(b[2]) + '">' + b[1] + '</span>'; }).join('') + '</div>' : '';
    }
    function logoHtml() {
        function word(w, cls) { return '<span class="' + cls + '">' + w.split('').map(function (c) { return '<span class="lt">' + c + '</span>'; }).join('') + '</span>'; }
        return '<div class="logo">' + word('KIEZ', 'k1') + '<br>' + word('KÖNIGE', 'k2') + '</div>';
    }

    /* ================= Sterne & Tagesaufgabe ================= */
    function stars(r) { r = r || 3.5; return '⭐ ' + r.toFixed(1).replace('.', ','); }
    function missionHtml(pi, compact) {
        var m = ST && ST.missions && ST.missions[pi]; if (!m) return '';
        return '<div class="mission' + (compact ? ' small' : '') + '">🎯 <b>Tagesaufgabe</b>' + (compact ? '' : ' · ' + esc(ST.players[pi].name)) + ': ' + esc(m.text) + ' <span class="gold">+' + eur(m.reward) + '</span></div>';
    }

    /* ================= Titel ================= */
    function demoCity() {
        var d = S.newGame({ days: 20 }, 7);
        [[1, 'cafe', 1, 0], [2, 'kiosk', 0, 1], [5, 'eis', 2, 0], [6, 'gaming', 1, 1], [9, 'imbiss', 1, 0], [10, 'fitness', 0, 1], [13, 'kiosk', 2, 1], [14, 'eis', 0, 0]].forEach(function (b) {
            var pl = d.plots[b[0]]; pl.owner = b[3]; pl.type = b[1]; pl.level = b[2]; pl.price = K.types[b[1]].ref;
        });
        return d;
    }
    function title() {
        phase = 'title'; ST = null; music('plan');
        C.sync(demoCity()); C.setWeather('sun'); C.setTime(0.35); applyLooks();
        var sv = loadSave();
        var html = '<div class="shade"></div><div class="col grow" style="width:560px;justify-content:center;gap:20px;position:relative">' +
            logoHtml() +
            '<div class="big mute" style="font-weight:600">Das Tycoon-Duell: Wer baut das reichste Geschäfts-Imperium der Stadt?</div>' +
            '<div class="col" style="width:440px;gap:12px">' +
            (sv ? btn('Weiterspielen <span class="sub">Tag ' + Math.min(sv.st.days, sv.st.day + (sv.st.phase === 'evening' ? 1 : 0)) + ' von ' + sv.st.days + '</span>', 'resume', null, { cls: 'gold', auto: true, style: 'width:100%' }) : '') +
            btn('Neues Spiel', 'setup', null, { cls: sv ? '' : 'gold', auto: !sv, style: 'width:100%' }) +
            '<div class="row" style="gap:12px">' + btn('🎨 Avatare', 'looks', null, { style: 'flex:1;justify-content:center' }) + btn('So geht\'s', 'help', null, { style: 'flex:1;justify-content:center' }) + '</div>' +
            '</div></div>';
        show(html, { three: 'title', back: function () { return false; } });
    }
    H.title = function () { title(); };
    H.resume = function () {
        var sv = loadSave(); if (!sv) return title();
        ST = sv.st; sv.opt.looks = OPT.looks; OPT = sv.opt; sel = sv.sel || [5, 6]; applyLooks();
        if (ST.phase === 'evening') { // Tag war schon abgerechnet → direkt zum nächsten Morgen
            if (S.bankrupt(ST) >= 0 || ST.day >= ST.days) { ST.phase = 'end'; return finale(); }
            S.nextMorning(ST);
        }
        if (OPT.control === 'phones') lobby(true); else planStart();
    };

    H.help = function () {
        var html = '<h2 class="shadow">So geht\'s</h2>' +
            '<div class="row grow" style="gap:18px;margin-top:18px">' +
            '<div class="card col grow"><h3>☀️ Morgens planen</h3><div>Grundstücke pachten, Läden bauen, Preise setzen, ausbauen, werben. Mit Handys plant ihr <b>gleichzeitig</b>, mit einer Fernbedienung <b>nacheinander</b>.</div></div>' +
            '<div class="card col grow"><h3>🚶 Tagsüber zuschauen</h3><div>Die Kundschaft strömt durch die Viertel. Jedes Viertel tickt anders: Studierende achten auf den Preis, Büroleute kaufen mittags, Touristen lieben Eis. Ist ein Laden voll, gehen Kunden leer aus.</div></div>' +
            '<div class="card col grow"><h3>🏆 Abends abrechnen</h3><div>Umsatz minus Ware, Personal, Pacht. Tipps zeigen, was besser geht. Nach 10, 20 oder 30 Tagen gewinnt das größere <b>Vermögen</b>: Geld plus Wert der Läden minus Kredit.</div></div>' +
            '</div><div class="row" style="justify-content:flex-end;margin-top:18px">' + btn('Verstanden', 'title', null, { cls: 'gold', auto: true }) + '</div>';
        show(html, { three: 'title', back: title });
    };

    /* ================= Einstellungen ================= */
    H.setup = function () { setup(); };
    function setup() {
        phase = 'setup';
        function opt(lbl, key, vals) {
            return '<div class="opt"><span class="lbl shadow">' + lbl + '</span>' + vals.map(function (v) {
                return btn(v[1] + (v[2] ? '<span class="sub">' + v[2] + '</span>' : ''), 'opt', key + '|' + v[0], { cls: OPT[key] === v[0] ? 'on' : '', style: 'flex-direction:column;align-items:center' });
            }).join('') + '</div>';
        }
        var phonesOk = N.ok;
        var html = '<div class="shade" style="background:rgba(11,17,32,.82)"></div><div class="col grow" style="position:relative;gap:22px;justify-content:center">' +
            '<h2 class="shadow">Neues Spiel</h2>' +
            opt('Steuerung', 'control', [['phones', '📱 Handys', 'gleichzeitig'], ['remote', '📺 Fernbedienung', 'abwechselnd']]) +
            opt('Spieler 2', 'p2', [['human', '🙂 Mensch', 'zu zweit'], ['cpu-easy', '🤖 Computer', 'leicht'], ['cpu', '🤖 Computer', 'stark']]) +
            opt('Spieldauer', 'days', [[10, '10 Tage', '~20 Min.'], [20, '20 Tage', '~40 Min.'], [30, '30 Tage', '~60 Min.']]) +
            opt('Musik', 'music', [['lofi', '☕ Lo-Fi', 'gemütlich'], ['chip', '🎵 Chiptune', 'fröhlich'], ['phonk', '🔊 Phonk', 'cool'], ['off', '🔇 Aus', '']]) +
            (OPT.control === 'phones' && !phonesOk ? '<div class="card" style="border-color:#7f1d1d;width:760px">Der Handy-Modus braucht die Kiez-Könige-App auf dem Fernseher (oder den Test-Server). Wähle sonst „Fernbedienung“.</div>' : '') +
            '<div class="row" style="gap:16px;margin-top:8px">' + btn('Los geht\'s!', 'start', null, { cls: 'gold', auto: true, dis: OPT.control === 'phones' && !phonesOk, why: 'Handy-Modus hier nicht verfügbar.' }) + btn('🎨 Avatare', 'looks') + btn('Zurück', 'title') + '</div>' +
            '</div>';
        show(html, { three: 'title', back: title, keep: ctx.keep });
    }
    H.opt = function (v, el) {
        var parts = v.split('|'), key = parts[0], val = key === 'days' ? +parts[1] : parts[1];
        OPT[key] = val; ctx.keep = el.getAttribute('data-key');
        if (key === 'music') { try { localStorage.setItem('kk_music', val); } catch (e) { } music('plan'); }
        setup(); ctx.keep = null;
    };
    H.start = function () {
        var cpu2 = OPT.p2 !== 'human';
        ST = S.newGame({ mode: OPT.control, days: OPT.days, cpu: [false, cpu2], cpuLevel: OPT.p2 === 'cpu-easy' ? 'easy' : 'normal' }, (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
        sel = [5, 6]; msgs = [null, null]; logs = [[], []]; applyLooks();
        if (OPT.control === 'phones') lobby(false); else planStart();
    };

    /* ================= Handys verbinden ================= */
    function lobby(resumed) {
        phase = 'lobby';
        C.sync(ST);
        var need = isCpu(1) ? [1] : [1, 2];
        function card(p) {
            var pl = ST.players[p - 1];
            return '<div class="card col center" style="gap:10px;border-color:' + pl.color + ';width:380px;padding:14px">' +
                '<h3 style="color:' + pl.color + '">' + esc(pl.name) + '</h3><div class="qrbox">' + qr(N.url(p)) + '</div>' +
                '<div class="addr">' + esc(N.short(p)) + '</div>' +
                '<div class="big" id="con' + p + '">⏳ Warte auf Handy …</div></div>';
        }
        var html = '<div class="shade" style="background:rgba(13,16,32,.5)"></div><div class="col grow" style="position:relative;gap:12px">' +
            '<h2>Handys verbinden</h2><div class="big shadow">Handy ins <b>gleiche WLAN</b> wie der Fernseher → QR-Code mit der Kamera scannen → Link öffnen. Keine App nötig.</div>' +
            '<div class="row grow center" style="gap:30px">' + need.map(card).join('') +
            (isCpu(1) ? '<div class="card col center" style="width:300px;gap:10px"><div style="font-size:70px">🤖</div><h3>Computer</h3><div class="mute">spielt Spieler 2</div></div>' : '') + '</div>' +
            '<div class="row" style="justify-content:space-between;align-items:center"><span class="small shadow">Klappt der QR-Code nicht? Die weiße Adresse im Handy-Browser eintippen.<br>Kein Gäste-WLAN benutzen. Auf dem Handy könnt ihr euren Avatar wählen 🎨</span>' +
            btn(resumed ? 'Weiterspielen' : 'Spiel starten', 'lobbyGo', null, { cls: 'gold', auto: true }) + '</div></div>';
        show(html, { three: 'title', back: title });
        every(function () {
            need.forEach(function (p) {
                var el = document.getElementById('con' + p);
                if (el) el.innerHTML = N.connected(p) ? '<b class="good">✓ Verbunden</b>' : '⏳ Warte auf Handy …';
            });
        }, 400);
    }
    H.lobbyGo = function () { planStart(); };

    /* ================= Planung ================= */
    function planStart() {
        phase = 'plan'; music('plan');
        ST.phase = 'plan';
        C.setWeather(ST.weather); C.setTime(0.12); C.clearDay(); C.sync(ST);
        ST.players.forEach(function (p, i) { p.ready = false; if (p.cpu) { var log = S.cpuPlan(ST, i); logs[i] = log.length ? log.map(cpuLogText) : ['Plant heute nichts Neues.']; } });
        C.sync(ST);
        save();
        if (OPT.control === 'phones') { planDeadline = Date.now() + PLAN_SECONDS * 1000; planPhones(); }
        else { planPi = 0; planRemote(0); }
    }
    function cpuLogText(l) {
        if (l.indexOf('build') === 0) return 'Baut: ' + K.types[l.split(' ')[1]].name;
        if (l === 'upgrade') return 'Baut einen Laden aus';
        if (l === 'mkt') return 'Startet eine Werbekampagne';
        return l;
    }
    function hud() {
        var ev = S.eventDef(ST.event);
        var w = K.weather[ST.weather], f = K.weather[ST.forecast];
        function pbox(i) {
            var p = ST.players[i];
            return '<div class="box pl" style="border-left-color:' + p.color + ';min-width:200px"><div class="k" style="color:' + p.color + '">' + esc(p.name) + (p.ready ? ' ✓' : '') + '</div><div class="v">' + eur(p.cash) + ' <span class="small mute">· Wert ' + eur(S.wealth(ST, i)) + '</span></div></div>';
        }
        return '<div class="hud">' +
            '<div class="box"><div class="k">Tag ' + ST.day + ' von ' + ST.days + '</div><div class="v">' + K.dayNames[S.dow(ST)] + (S.isWeekend(ST) ? ' 🎉' : '') + '</div></div>' +
            '<div class="box"><div class="k">Heute · Morgen</div><div class="v">' + w.icon + ' ' + w.name + ' <span class="small mute">· ' + f.icon + '</span></div></div>' +
            (ev ? '<div class="box" style="max-width:330px"><div class="k">' + ev.icon + ' Heute</div><div class="v" style="font-size:18px;white-space:normal;line-height:1.15">' + esc(ev.title) + '</div></div>' : '') +
            '<div class="grow"></div>' + pbox(0) + pbox(1) + '</div>';
    }

    /* --- Fernbedienung: ein Spieler plant am Fernseher --- */
    function planRemote(pi) {
        phase = 'plan'; planPi = pi;
        C.select(pi, sel[pi]); C.select(1 - pi, -1); C.focus(sel[pi]);
        var html = hud() + '<div class="mapzone" data-f data-map data-a="mapok" data-key="map" style="position:absolute;left:24px;top:110px;width:770px;bottom:24px;border-radius:20px"></div>' +
            '<div class="maphint col" style="gap:8px;max-width:760px">' + missionHtml(pi) + '<div class="card small"><b>◀▶▲▼</b> Grundstück wählen · <b>OK</b> Aktionen · <b>Zurück</b> Pause</div></div>' +
            '<div class="panel">' + panelHtml(pi) + '</div>';
        show(html, { three: 'plan', back: pauseMenu, keep: ctx.keep || 'map' });
        ctx.keep = null;
    }
    function rerenderPanel() {
        var key = focused ? focused.getAttribute('data-key') : 'map';
        ctx.keep = key;
        planRemote(planPi);
    }
    function mapMove(dir) {
        var p = K.plots[sel[planPi]], gx = p.gx, gy = p.gy;
        if (dir === 'left') gx--; if (dir === 'right') gx++; if (dir === 'up') gy--; if (dir === 'down') gy++;
        if (gx > 3) { var b = app.querySelector('.panel [data-f]'); if (b) { setFocus(b); sfx('move'); } return true; }
        if (gx < 0 || gy < 0 || gy > 3) return true;
        sel[planPi] = gy * 4 + gx; sfx('move');
        ctx.keep = 'map'; planRemote(planPi);
        return true;
    }
    H.mapok = function () { var b = app.querySelector('.panel .buildlist [data-f], .panel [data-a="price"], .panel [data-f]'); if (b) setFocus(b); };
    function panelHtml(pi) {
        var p = ST.players[pi], id = sel[pi], pl = ST.plots[id], kp = K.plots[id], D = K.districts[kp.d];
        var head = '<div class="card row" style="align-items:center;border-color:' + p.color + ';padding:10px 16px"><div class="grow"><b style="color:' + p.color + ';font-size:22px">' + esc(p.name) + '</b><div class="small mute">' + (OPT.control === 'remote' && !isCpu(1) ? 'plant gerade' : 'am Zug') + (p.mkt ? ' · 📣 Werbung ' + p.mkt + ' T.' : '') + '</div></div><div style="text-align:right"><b style="font-size:24px">' + eur(p.cash) + '</b>' + (p.loan ? '<div class="small bad">Kredit ' + eur(p.loan) + '</div>' : '') + '</div></div>';
        var info = '<div class="card col" style="gap:8px;flex:1;min-height:0"><div class="row" style="align-items:baseline;justify-content:space-between"><h3>' + plotName(id) + (kp.corner ? ' <span class="chip y">Ecklage</span>' : '') + '</h3><span class="chip" style="border-color:' + D.color + ';color:' + D.color + '">' + D.name + '</span></div>' +
            '<div class="small mute">' + D.who + ' · Pacht ' + eur(S.rentOf(ST, pl)) + '/Tag</div>';
        if (pl.owner === -1) {
            info += '<div class="buildlist">' + K.typeOrder.map(function (t, i) {
                var ty = K.types[t], fc = S.forecastBuild(ST, id, t, pi), poor = p.cash < ty.build;
                return btn('<span class="nm"><span class="ico">' + ty.icon + '</span>' + ty.name + '</span><span class="sub">Bau ' + eur(ty.build) + '</span><span class="fc">~' + fc.sales + ' Kunden · <b class="' + (fc.profit >= 0 ? 'good' : 'bad') + '">' + sgn(fc.profit) + '/Tag</b></span>', 'build', t, { dis: poor, why: 'Zu wenig Geld – ' + ty.name + ' kostet ' + eur(ty.build) + '. Kredit gibt es bei der Bank.' });
            }).join('') + '</div>';
        } else if (pl.owner === pi) {
            var t = K.types[pl.type], l = pl.last, upc = S.upgradeCost(pl);
            info += '<div class="row" style="align-items:center;gap:10px"><span style="font-size:40px">' + t.icon + '</span><div class="grow"><b style="font-size:22px">' + t.name + '</b><div class="small mute">' + K.levelNames[pl.level] + ' · bis ' + S.capOf(pl) + ' Kunden/Tag</div></div></div>' +
                '<div class="pricebar">' + btn('−', 'price', -1, { style: 'width:64px;justify-content:center;font-size:30px' }) + '<div class="p">' + price(pl.price) + '<div class="small mute">üblich ' + price(t.ref) + '</div></div>' + btn('+', 'price', 1, { style: 'width:64px;justify-content:center;font-size:30px' }) + '</div>' +
                '<div class="stat"><span>Kunden-Bewertung</span><b>' + stars(pl.rating) + (l && l.ratingDelta ? ' <span class="small ' + (l.ratingDelta > 0 ? 'good' : 'bad') + '">' + (l.ratingDelta > 0 ? '▲' : '▼') + '</span>' : '') + '</b></div>' +
                (l ? '<div class="stat"><span>Gestern verkauft</span><b>' + l.sales + ' / ' + l.cap + '</b></div>' + (l.lost ? '<div class="stat"><span>Leer ausgegangen</span><b class="bad">' + l.lost + '</b></div>' : '') + '<div class="stat"><span>Gewinn gestern</span><b class="' + (l.profit >= 0 ? 'good' : 'bad') + '">' + sgn(l.profit) + '</b></div>' : '<div class="small mute">Öffnet heute zum ersten Mal.</div>') +
                '<div class="row" style="margin-top:auto">' + btn(upc === null ? 'Voll ausgebaut' : 'Ausbauen <span class="sub">' + eur(upc) + ' · bis ' + t.cap[pl.level + 1] + ' Kunden</span>', 'upgrade', null, { dis: upc === null || p.cash < upc, why: upc === null ? 'Schon Stufe 3.' : 'Zu wenig Geld.', style: 'flex:1.4;flex-direction:column;align-items:flex-start' }) +
                btn('Verkaufen <span class="sub">+' + eur(pl.invested * K.sellBack) + '</span>', 'sellAsk', null, { cls: 'danger', style: 'flex:1;flex-direction:column;align-items:flex-start' }) + '</div>';
        } else {
            var o = ST.players[pl.owner], tt = K.types[pl.type];
            info += '<div class="row" style="align-items:center;gap:10px"><span style="font-size:40px">' + tt.icon + '</span><div><b style="font-size:22px;color:' + o.color + '">' + tt.name + ' von ' + esc(o.name) + '</b><div class="small mute">' + K.levelNames[pl.level] + ' · Preis ' + price(pl.price) + '</div></div></div>' +
                '<div class="stat"><span>Bewertung</span><b>' + stars(pl.rating) + '</b></div>' +
                (pl.last ? '<div class="stat"><span>Gestern verkauft</span><b>' + pl.last.sales + ' / ' + pl.last.cap + '</b></div>' : '') +
                '<div class="small mute">Tipp: Eine eigene ' + tt.name + ' daneben teilt sich die Kundschaft mit diesem Laden – lieber eine andere Art bauen?</div>';
        }
        info += '</div>';
        var foot = '<div class="row">' + btn('📣 Werbung', 'marketing', null, { dis: p.mkt > 0, why: 'Läuft noch ' + p.mkt + ' Tage.', style: 'flex:1;justify-content:center' }) + btn('🏦 Bank', 'bank', null, { style: 'flex:1;justify-content:center' }) + btn('Fertig ✓', 'ready', null, { cls: 'gold', style: 'flex:1.2;justify-content:center' }) + '</div>';
        return head + info + foot;
    }
    function doAct(pi, cmd, a, b) {
        var r = S.act(ST, pi, cmd, a, b);
        msgs[pi] = { text: r.msg, ok: r.ok, n: (msgs[pi] ? msgs[pi].n : 0) + 1 };
        if (r.ok && cmd !== 'price' && cmd !== 'ready' && cmd !== 'unready') { logs[pi].unshift(r.msg); logs[pi] = logs[pi].slice(0, 3); }
        if (r.fx === 'build' || r.fx === 'upgrade') { sfx('build'); }
        else if (r.fx === 'coin' || r.fx === 'sell' || r.fx === 'marketing') sfx('coin');
        else if (!r.ok) sfx('no');
        C.sync(ST);
        if (r.ok) checkBadges(pi);
        return r;
    }
    H.build = function (t) { var r = doAct(planPi, 'build', sel[planPi], t); toast(r.msg); ctx.keep = 'price:1'; planRemote(planPi); };
    H.price = function (d) { doAct(planPi, 'price', sel[planPi], +d); rerenderPanel(); };
    H.upgrade = function () { var r = doAct(planPi, 'upgrade', sel[planPi]); toast(r.msg); rerenderPanel(); };
    H.sellAsk = function () {
        var pl = ST.plots[sel[planPi]];
        modal('<h2>' + K.types[pl.type].name + ' verkaufen?</h2><div class="big">Du bekommst <b>' + eur(pl.invested * K.sellBack) + '</b> zurück – die Hälfte von dem, was du investiert hast.</div><div class="row">' + btn('Behalten', 'close', null, { cls: 'gold', auto: true, style: 'flex:1;justify-content:center' }) + btn('Verkaufen', 'sell', null, { cls: 'danger', style: 'flex:1;justify-content:center' }) + '</div>');
    };
    H.sell = function () { var r = doAct(planPi, 'sell', sel[planPi]); closeModal(); toast(r.msg); ctx.keep = 'map'; planRemote(planPi); };
    H.marketing = function () { var r = doAct(planPi, 'marketing'); toast(r.msg); rerenderPanel(); };
    H.bank = function () {
        var p = ST.players[planPi];
        modal('<h2>🏦 Bank</h2><div class="big">Kredit: <b>' + eur(p.loan) + '</b> von max. ' + eur(K.loanMax) + '</div><div class="mute">Zinsen: 0,5 % pro Tag. Ein Kredit hilft beim schnellen Wachsen – kostet aber jeden Tag Geld.</div>' +
            '<div class="row">' + btn('+' + eur(K.loanStep) + ' leihen', 'loan', null, { cls: 'gold', auto: true, dis: p.loan >= K.loanMax, why: 'Mehr gibt die Bank nicht.', style: 'flex:1;justify-content:center' }) + btn(eur(K.loanStep) + ' tilgen', 'repay', null, { dis: p.loan <= 0 || p.cash < K.loanStep, why: 'Nichts zu tilgen oder zu wenig Geld.', style: 'flex:1;justify-content:center' }) + btn('Zurück', 'close', null, { style: 'justify-content:center' }) + '</div>');
    };
    H.loan = function () { var r = doAct(planPi, 'loan'); closeModal(); toast(r.msg); rerenderPanel(); };
    H.repay = function () { var r = doAct(planPi, 'repay'); closeModal(); toast(r.msg); rerenderPanel(); };
    H.ready = function () {
        doAct(planPi, 'ready');
        var other = 1 - planPi;
        if (planPi === 0 && !isCpu(1)) { handover(1); return; }
        startDay();
    };
    function handover(pi) {
        phase = 'handover';
        var p = ST.players[pi];
        C.select(0, -1); C.select(1, -1);
        var html = '<div class="col grow center" style="gap:20px"><div style="font-size:90px">📺</div><h1 class="shadow" style="color:' + p.color + '">' + esc(p.name) + ' ist dran!</h1><div class="big shadow">Fernbedienung weitergeben 🙂</div>' + btn('Los geht\'s', 'handoverGo', pi, { cls: 'gold', auto: true, style: 'font-size:28px;padding:16px 40px' }) + '</div>';
        show(html, { three: 'plan2', back: function () { } });
    }
    H.handoverGo = function (pi) { planRemote(+pi); };
    function pauseMenu() {
        modal('<h2>Pause</h2><div class="mute big">Der Spielstand wird jeden Morgen gespeichert.</div><div class="row">' + btn('Weiterspielen', 'close', null, { cls: 'gold', auto: true, style: 'flex:1;justify-content:center' }) + btn('Zum Titelbild', 'title', null, { style: 'flex:1;justify-content:center' }) + '</div>');
    }

    /* --- Handys: beide planen gleichzeitig, der Fernseher zeigt den Überblick --- */
    function planPhones() {
        phase = 'plan';
        [0, 1].forEach(function (i) { C.select(i, isCpu(i) ? -1 : sel[i]); });
        C.focus(-1);
        function pcard(i) {
            var p = ST.players[i];
            return '<div class="card pstat" style="border-color:' + p.color + '"><div class="row" style="align-items:center"><b class="grow" style="color:' + p.color + ';font-size:22px">' + (p.cpu ? '🤖 ' : '📱 ') + esc(p.name) + '</b><span class="ready" id="rd' + i + '">' + readyTxt(i) + '</span></div>' +
                '<div class="row" style="justify-content:space-between"><span>Geld</span><b id="cash' + i + '">' + eur(p.cash) + '</b></div><div class="row" style="justify-content:space-between"><span>Vermögen</span><b id="wl' + i + '">' + eur(S.wealth(ST, i)) + '</b></div>' +
                (p.cpu ? '' : missionHtml(i, true)) +
                '<div class="log" id="log' + i + '">' + (logs[i] || []).map(esc).join('<br>') + '</div></div>';
        }
        var html = hud() + '<div class="panel" style="width:400px">' + pcard(0) + pcard(1) +
            '<div class="card row" style="align-items:center"><div class="grow"><div class="k mute small">PLANUNGSZEIT</div><b id="cd" style="font-size:30px">' + PLAN_SECONDS + ' s</b></div>' + btn('Tag starten ▶', 'forceDay', null, { cls: 'gold', auto: true }) + '</div></div>' +
            '<div class="maphint card small">📱 Plant auf euren Handys. Fertig? Dann „Fertig“ tippen – der Tag startet, sobald alle bereit sind.</div>';
        show(html, { three: 'plan', back: pauseMenu });
        every(function () {
            var left = Math.max(0, Math.round((planDeadline - Date.now()) / 1000));
            var cd = document.getElementById('cd'); if (cd) cd.textContent = left + ' s';
            [0, 1].forEach(function (i) {
                var r = document.getElementById('rd' + i); if (r) r.innerHTML = readyTxt(i);
            });
            if (left <= 0) startDay();
            publish();
        }, 500);
    }
    function readyTxt(i) {
        var p = ST.players[i];
        if (p.ready) return '<span class="good">✓ Fertig</span>';
        if (p.cpu) return '<span class="mute">rechnet …</span>';
        return N.connected(i + 1) ? '<span class="gold">plant …</span>' : '<span class="bad">nicht verbunden</span>';
    }
    function refreshPhoneTV(i) {
        if (phase !== 'plan' || OPT.control !== 'phones') return;
        var c = document.getElementById('cash' + i); if (c) c.textContent = eur(ST.players[i].cash);
        var w = document.getElementById('wl' + i); if (w) w.textContent = eur(S.wealth(ST, i));
        var l = document.getElementById('log' + i); if (l) l.innerHTML = (logs[i] || []).map(esc).join('<br>');
        var r = document.getElementById('rd' + i); if (r) r.innerHTML = readyTxt(i);
        C.select(i, sel[i]);
    }
    H.forceDay = function () { startDay(); };

    /* Befehle vom Handy */
    function onPhone(e) {
        var pi = (+e.p) - 1;
        if (!(pi === 0 || pi === 1) || !ST || isCpu(pi)) return;
        var cmd = e.cmd;
        if (cmd === 'hello') { publish(); return; }
        if (cmd === 'avatar') { if (setLook(pi, e.key, e.val)) publish(); return; }
        if (cmd === 'next') { if (phase === 'evening') H.nextDay(); else if (phase === 'lobby') planStart(); else if (phase === 'end') H.rematch(); return; }
        if (cmd === 'sel') { if (e.plot >= 0 && e.plot < 16) { sel[pi] = e.plot; if (phase === 'plan' && OPT.control === 'phones') C.select(pi, sel[pi]); } publish(); return; }
        if (phase !== 'plan' || OPT.control !== 'phones') { msgs[pi] = { text: 'Gerade nicht möglich.', ok: false, n: (msgs[pi] ? msgs[pi].n : 0) + 1 }; publish(); return; }
        var r;
        if (cmd === 'build') r = doAct(pi, 'build', e.plot, e.type);
        else if (cmd === 'upgrade') r = doAct(pi, 'upgrade', e.plot);
        else if (cmd === 'sell') r = doAct(pi, 'sell', e.plot);
        else if (cmd === 'price') r = doAct(pi, 'price', e.plot, e.d > 0 ? 1 : -1);
        else if (cmd === 'marketing') r = doAct(pi, 'marketing');
        else if (cmd === 'loan') r = doAct(pi, 'loan');
        else if (cmd === 'repay') r = doAct(pi, 'repay');
        else if (cmd === 'ready') r = doAct(pi, 'ready');
        else if (cmd === 'unready') r = doAct(pi, 'unready');
        if (r && r.ok && cmd !== 'price') toast('<span style="color:' + ST.players[pi].color + '">' + esc(ST.players[pi].name) + ':</span> ' + esc(r.msg));
        refreshPhoneTV(pi);
        publish();
        if (ST.players.every(function (p) { return p.ready; })) later(startDay, 600);
    }

    /* ================= Tag ================= */
    function startDay() {
        if (phase !== 'day') music('day');
        if (phase === 'day') return;
        phase = 'day';
        ST.players.forEach(function (p) { p.ready = true; });
        C.select(0, -1); C.select(1, -1);
        var cash0 = ST.players.map(function (p) { return p.cash; });
        var wealth0 = [S.wealth(ST, 0), S.wealth(ST, 1)];
        var rep = S.runDay(ST);
        live = { rep: rep, t: 0, fast: false, cash0: cash0, wealth0: wealth0, acc: {}, shown: {}, rev: [0, 0], done: false };
        var ids = Object.keys(rep.plots).map(Number);
        ids.forEach(function (id) { live.acc[id] = 0; live.shown[id] = { d: 0 }; });
        var ev = S.eventDef(ST.event);
        var html = '<div class="hud"><div class="box"><div class="k">Tag ' + ST.day + ' · ' + K.dayNames[S.dow(ST)] + '</div><div class="v" id="clk">08:00</div></div>' +
            '<div class="box"><div class="k">Wetter</div><div class="v">' + K.weather[ST.weather].icon + ' ' + K.weather[ST.weather].name + '</div></div>' +
            (ev ? '<div class="box"><div class="k">' + ev.icon + ' Ereignis</div><div class="v" style="font-size:18px">' + esc(ev.title) + '</div></div>' : '') +
            '<div class="grow"></div>' + [0, 1].map(function (i) { var p = ST.players[i]; return '<div class="box pl" style="border-left-color:' + p.color + ';min-width:220px"><div class="k" style="color:' + p.color + '">' + esc(p.name) + ' · Umsatz heute</div><div class="v" id="rev' + i + '">0 €</div></div>'; }).join('') + '</div>' +
            '<div class="grow"></div><div class="row" style="align-items:center;gap:16px"><div class="grow clockbar"><i id="cbar" style="width:0%"></i></div>' + btn('⏩ Schneller', 'fast', null, { auto: true }) + btn('Zum Abend', 'skip') + '</div>';
        show(html, { three: 'day', back: function () { } });
        C.sync(ST);
        var last = performance.now();
        every(function () {
            var now = performance.now(), dt = (now - last) / 1000; last = now;
            tickDay(dt * (live.fast ? 4 : 1));
        }, 50);
    }
    H.fast = function () { if (live) { live.fast = !live.fast; toast(live.fast ? 'Vierfache Geschwindigkeit' : 'Normale Geschwindigkeit'); } };
    H.skip = function () { if (live) tickDay(999); };
    var DAY_SECONDS = 24;
    function cum(d, f) {   // Anteil des Tagesumsatzes bis zum Zeitpunkt f (0..1) im Viertel d
        var c = K.hourCurve[d], tot = c.reduce(function (a, b) { return a + b; }, 0), h = f * 12, s = 0;
        for (var i = 0; i < 12; i++) { if (h >= i + 1) s += c[i]; else if (h > i) s += c[i] * (h - i); }
        return s / tot;
    }
    function tickDay(dt) {
        if (!live || live.done) return;
        live.t = Math.min(1, live.t + dt / DAY_SECONDS);
        var f = live.t, rev = [0, 0];
        C.setTime(0.12 + f * 0.8);
        Object.keys(live.rep.plots).forEach(function (k) {
            var id = +k, r = live.rep.plots[id], pl = ST.plots[id], d = K.plots[id].d;
            var demand = r.demand * cum(d, f), sold = Math.min(demand, r.cap), lost = demand - sold;
            var sh = live.shown[id];
            var dSold = sold - (sh.sold || 0), dLost = lost - (sh.lost || 0);
            sh.sold = sold; sh.lost = lost;
            live.acc[id] += (dSold + dLost) * 0.05;
            while (live.acc[id] >= 1) {
                live.acc[id] -= 1;
                var isLost = Math.random() < (dLost / Math.max(0.001, dSold + dLost));
                var from = pickD(r.byD, d);
                C.customer(id, from, isLost);
            }
            if (lost > 0 && !sh.so) { sh.so = true; C.soldOut(id, true); }
            if (pl.owner >= 0) rev[pl.owner] += sold * pl.price;
            if (Math.floor(sold) !== sh.lbl) { sh.lbl = Math.floor(sold); C.label(id, K.types[pl.type].icon + ' ' + sh.lbl + ' / ' + r.cap, ST.players[pl.owner].color); }
        });
        [0, 1].forEach(function (i) {
            var el = document.getElementById('rev' + i);
            if (el && Math.round(rev[i]) !== Math.round(live.rev[i])) { el.textContent = eur(rev[i]); }
        });
        if (Math.floor(rev[0] / 2000) > Math.floor(live.rev[0] / 2000) || Math.floor(rev[1] / 2000) > Math.floor(live.rev[1] / 2000)) sfx('coin');
        live.rev = rev;
        var hour = 8 + f * 12, hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60 / 15) * 15;
        var clk = document.getElementById('clk'); if (clk) clk.textContent = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
        var bar = document.getElementById('cbar'); if (bar) bar.style.width = (f * 100) + '%';
        publish();
        if (f >= 1) { live.done = true; later(evening, 700); }
    }
    function pickD(byD, home) {
        var tot = byD.reduce(function (a, b) { return a + b; }, 0), r = Math.random() * tot;
        for (var i = 0; i < 4; i++) { r -= byD[i]; if (r <= 0) return i; }
        return home;
    }

    /* ================= Abend ================= */
    function evening() {
        music('evening');
        if (ST.report && ST.report.players.some(function (r, i) { return r.mission && r.mission.ok && !ST.players[i].cpu; })) later(function () { sfx('mission'); }, 900);
        phase = 'evening';
        sfx('bell');
        C.setTime(0.95);
        var rep = ST.report;
        var broke = S.bankrupt(ST);
        function pcard(i) {
            var p = ST.players[i], r = rep.players[i];
            var best = null;
            r.shops.forEach(function (id) { var x = rep.plots[id]; if (!best || x.profit > best.profit) best = { id: id, profit: x.profit }; });
            return '<div class="card col grow" style="gap:8px;border-color:' + p.color + '"><div class="row" style="align-items:baseline;justify-content:space-between"><h3 style="color:' + p.color + '">' + esc(p.name) + '</h3><b class="' + (r.profit >= 0 ? 'good' : 'bad') + '" style="font-size:26px">' + sgn(r.profit) + '</b></div>' +
                '<table class="tbl"><tr><td>Umsatz (' + r.sales + ' Kunden)</td><td class="good">' + sgn(r.rev) + '</td></tr><tr><td>Ware</td><td class="bad">' + sgn(-r.goods) + '</td></tr><tr><td>Personal</td><td class="bad">' + sgn(-r.wage) + '</td></tr><tr><td>Pacht' + (r.interest ? ' & Zinsen' : '') + '</td><td class="bad">' + sgn(-(r.rent + r.interest)) + '</td></tr>' +
                '<tr class="sum"><td>Vermögen</td><td>' + eur(S.wealth(ST, i)) + '</td></tr></table>' +
                (best ? '<div class="small">🏆 Bester Laden: <b>' + K.types[ST.plots[best.id].type].name + ' (' + plotName(best.id) + ')</b> ' + sgn(best.profit) + '</div>' : '') +
                (r.lost ? '<div class="small bad">😞 ' + r.lost + ' Kunden gingen leer aus (ausverkauft)</div>' : '') +
                (r.autoLoan ? '<div class="small bad">🏦 Konto im Minus – Notkredit ' + eur(r.autoLoan) + '</div>' : '') +
                (r.mission ? '<div class="small ' + (r.mission.ok ? 'good' : 'mute') + '">🎯 ' + (r.mission.ok ? 'Aufgabe geschafft! <b>+' + eur(r.mission.reward) + '</b>' : 'Aufgabe verpasst: ' + esc(r.mission.text)) + '</div>' : '') +
                badgeRow(i) + '<div class="tips">' + r.tips.slice(0, 2).map(function (t) { return '<div><span>💡</span><span>' + esc(t.x) + '</span></div>'; }).join('') + '</div></div>';
        }
        var f = K.weather[ST.forecast];
        var last = ST.day >= ST.days || broke >= 0;
        var html = '<div class="row" style="align-items:center"><h2 class="shadow grow">🌙 Feierabend – Tag ' + ST.day + '</h2>' + (last ? '' : '<span class="chip">Morgen: ' + f.icon + ' ' + f.name + ' · ' + K.dayNames[S.dow(ST, ST.day + 1)] + '</span>') + '</div>' +
            '<div class="row grow" style="gap:18px;margin-top:14px">' + pcard(0) + pcard(1) + '</div>' +
            '<div class="row" style="justify-content:flex-end;margin-top:14px">' + btn(last ? '🏆 Zur Siegerehrung' : 'Nächster Tag ☀️', 'nextDay', null, { cls: 'gold', auto: true }) + '</div>';
        show(html, { three: 'evening', back: function () { } });
        C.clearDay(); C.sync(ST);
        checkBadges(0, { report: true }); checkBadges(1, { report: true });
        save();
    }
    H.nextDay = function () {
        if (phase !== 'evening') return;
        if (S.bankrupt(ST) >= 0 || ST.day >= ST.days) { ST.phase = 'end'; return finale(); }
        S.nextMorning(ST);
        var ev = S.eventDef(ST.event);
        planStart();
        if (ev) later(function () { modal('<div style="font-size:64px;text-align:center">' + ev.icon + '</div><h2 style="text-align:center">' + esc(ev.title) + '</h2><div class="big" style="text-align:center">' + esc(ev.text) + (ST.event.plot !== undefined ? ' <b>(' + plotName(ST.event.plot) + ')</b>' : '') + '</div>' + btn('Okay!', 'close', null, { cls: 'gold', auto: true, style: 'justify-content:center' })); }, 300);
    };

    /* ================= Finale ================= */
    function finale() {
        phase = 'end';
        clearSave();
        var w = [S.wealth(ST, 0), S.wealth(ST, 1)], broke = S.bankrupt(ST);
        var win = broke >= 0 ? 1 - broke : (w[0] === w[1] ? -1 : (w[0] > w[1] ? 0 : 1));
        sfx('win'); later(function () { music('evening'); }, 1800);
        if (win >= 0) { checkBadges(win, { win: win }); C.celebrate(win, ST); }
        var max = Math.max.apply(null, ST.players[0].history.concat(ST.players[1].history, [1]));
        function line(i) {
            var h = ST.players[i].history, n = Math.max(2, h.length);
            return '<polyline fill="none" stroke="' + ST.players[i].color + '" stroke-width="5" stroke-linejoin="round" points="' + h.map(function (v, k) { return (k / (n - 1) * 560).toFixed(1) + ',' + (170 - Math.max(0, v) / max * 160).toFixed(1); }).join(' ') + '"/>';
        }
        function pc(i) {
            var p = ST.players[i], shops = S.shopsOf(ST, i);
            return '<div class="card col grow" style="gap:6px;border-color:' + p.color + (win === i ? ';box-shadow:0 0 0 4px #facc15' : '') + '"><h3 style="color:' + p.color + '">' + (win === i ? '👑 ' : '') + esc(p.name) + '</h3>' +
                '<div style="font-size:34px;font-weight:900">' + eur(w[i]) + '</div><div class="small mute">' + shops.length + (shops.length === 1 ? ' Laden' : ' Läden') + ' · Umsatz gesamt ' + eur(p.totalRevenue) + (p.loan ? ' · Kredit ' + eur(p.loan) : '') + '</div>' +
                '<div style="font-size:30px">' + shops.map(function (pl) { return K.types[pl.type].icon; }).join(' ') + '</div>' + badgeRow(i) + '</div>';
        }
        var head = broke >= 0 ? esc(ST.players[broke].name) + ' ist pleite!' : 'Nach ' + ST.days + ' Tagen';
        var html = '<div class="col center" style="gap:4px"><span class="chip y" style="font-size:18px">' + head + '</span><h1 class="shadow" style="font-size:72px;color:' + (win >= 0 ? ST.players[win].color : '#fff') + '">' + (win >= 0 ? esc(ST.players[win].name) + ' ist Kiez-König!' : 'Unentschieden!') + '</h1></div>' +
            '<div class="grow"></div>' +
            '<div class="row" style="gap:18px;align-items:stretch">' + pc(0) + '<div class="card col center" style="width:600px"><div class="small mute">Vermögen Tag für Tag</div><svg viewBox="0 0 560 175" style="width:560px;height:175px">' + line(0) + line(1) + '</svg></div>' + pc(1) + '</div>' +
            '<div class="row" style="justify-content:flex-end;gap:14px;margin-top:14px">' + btn('Revanche!', 'rematch', null, { cls: 'gold', auto: true }) + btn('Zum Titelbild', 'title') + '</div>';
        show(html, { three: 'final', back: title });
    }
    H.rematch = function () { H.start(); };

    /* ================= Zustand für die Handys ================= */
    function snap(pi) {
        if (!ST) return { phase: phase };
        var p = ST.players[pi], o = ST.players[1 - pi];
        var ev = S.eventDef(ST.event);
        var hide = phase === 'day' && live && live.wealth0; // kein Spoiler während des Tages
        var s = {
            phase: phase === 'handover' ? 'plan' : phase, control: OPT.control, day: ST.day, days: ST.days, dow: K.dayNames[S.dow(ST)],
            weather: ST.weather, forecast: ST.forecast, event: ev ? { icon: ev.icon, title: ev.title, text: ev.text } : null,
            timeLeft: phase === 'plan' && OPT.control === 'phones' ? Math.max(0, Math.round((planDeadline - Date.now()) / 1000)) : null,
            me: { i: pi, name: p.name, color: p.color, cash: hide ? live.cash0[pi] : p.cash, loan: p.loan, wealth: hide ? live.wealth0[pi] : S.wealth(ST, pi), mkt: p.mkt, ready: p.ready, sel: sel[pi] },
            rival: { name: o.name, color: o.color, wealth: hide ? live.wealth0[1 - pi] : S.wealth(ST, 1 - pi), ready: o.ready, cpu: o.cpu },
            mission: ST.missions && ST.missions[pi] ? { text: ST.missions[pi].text, reward: ST.missions[pi].reward } : null,
            plots: ST.plots.map(function (pl) { return { id: pl.id, owner: pl.owner, type: pl.type, level: pl.level, price: pl.price, invested: pl.invested, rating: pl.rating, last: pl.last ? { sales: pl.last.sales, cap: pl.last.cap, lost: pl.last.lost, profit: pl.last.profit } : null }; }),
            msg: msgs[pi], look: lookOf(pi),
            badges: (p.badges || []).map(function (id) { var b = badgeOf(id); return b ? [b[1], b[2]] : null; }).filter(Boolean)
        };
        var spl = ST.plots[sel[pi]];
        if (phase === 'plan' && spl && spl.owner === -1) {
            s.forecast2 = {};
            K.typeOrder.forEach(function (t) { var f = S.forecastBuild(ST, sel[pi], t, pi); s.forecast2[t] = { sales: f.sales, profit: f.profit }; });
        }
        if (phase === 'day' && live) s.live = { rev: Math.round(live.rev[pi]), t: live.t };
        if (phase === 'evening' && ST.report) { var r = ST.report.players[pi]; s.report = { rev: r.rev, profit: r.profit, sales: r.sales, lost: r.lost, tips: r.tips.map(function (t) { return t.x; }), mission: r.mission }; }
        if (phase === 'end') { var w = [S.wealth(ST, 0), S.wealth(ST, 1)]; s.win = w[pi] > w[1 - pi] ? 'win' : w[pi] < w[1 - pi] ? 'lose' : 'draw'; }
        return s;
    }
    function publish() { if (N.ok && ST) N.publish({ 1: snap(0), 2: snap(1) }); else if (N.ok) N.publish({ 1: { phase: phase, look: lookOf(0) }, 2: { phase: phase, look: lookOf(1) } }); }

    /* ================= Start ================= */
    window.KKDEBUG = { st: function () { return ST; }, H: H, startDay: startDay, evening: evening, finale: finale, planStart: planStart, opt: OPT, sel: sel };
    C.init(document.getElementById('three'));
    N.init(function () { N.start(onPhone); });
    var started = false; function go() { if (!started) { started = true; title(); } }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); setTimeout(go, 1500);
})();
