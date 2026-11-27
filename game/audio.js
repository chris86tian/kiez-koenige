/* Kiez-Könige – Klang: eigene Songs in drei Stilen (Lo-Fi, Chiptune, Phonk) und Soundeffekte mit Web Audio.
   Alle Melodien sind eigene Kompositionen. Zeitgenaue Planung über den Audio-Takt. */
(function (G) {
    'use strict';
    var A = { muted: false };
    G.NSAUDIO = A;
    var ctx = null, master = null, musicBus = null, sfxBus = null, echo = null, noiseBuf = null;
    var seq = { track: null, step: 0, next: 0, timer: null, vol: 1 };
    var combo = { n: 0, t: 0 };

    function init() {
        if (ctx) { if (ctx.state === 'suspended') try { ctx.resume(); } catch (e) { } return ctx; }
        try { ctx = new (G.AudioContext || G.webkitAudioContext)(); } catch (e) { return null; }
        var comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
        master = ctx.createGain(); master.gain.value = 0.9;
        master.connect(comp); comp.connect(ctx.destination);
        musicBus = ctx.createGain(); musicBus.gain.value = 0.42; musicBus.connect(master);
        sfxBus = ctx.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
        // Echo für die Minen-Melodie
        echo = ctx.createDelay(1.0); echo.delayTime.value = 0.27;
        var fb = ctx.createGain(); fb.gain.value = 0.32; var ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 2200;
        echo.connect(ef); ef.connect(fb); fb.connect(echo); ef.connect(musicBus);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return ctx;
    }
    A.unlock = function () { init(); };
    A.state = function () { return ctx ? ctx.state + ' t=' + ctx.currentTime.toFixed(1) + ' track=' + seq.track : 'none'; };
    function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

    /* Ein Ton mit Hüllkurve */
    function note(f, t, dur, o) {
        o = o || {};
        var osc = ctx.createOscillator(), g = ctx.createGain(), out = g;
        osc.type = o.type || 'square';
        osc.frequency.setValueAtTime(f, t);
        if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || dur));
        if (o.vib) { var l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 6; lg.gain.value = f * 0.012; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.05); }
        if (o.lp) { var flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = o.lp; osc.connect(flt); flt.connect(g); } else osc.connect(g);
        var v = o.vol || 0.1, a = o.a || 0.005, r = o.r || 0.06;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + a);
        g.gain.setValueAtTime(v, t + Math.max(a, dur - r));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        out.connect(o.dest || sfxBus);
        if (o.send) out.connect(o.send);
        osc.start(t); osc.stop(t + dur + 0.02);
    }
    /* Rauschen (Schlagzeug, Wusch, Krach) */
    function noise(t, dur, o) {
        o = o || {};
        var src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
        src.buffer = noiseBuf; flt.type = o.ft || 'highpass'; flt.frequency.setValueAtTime(o.f || 6000, t);
        if (o.fto) flt.frequency.exponentialRampToValueAtTime(o.fto, t + dur);
        flt.Q.value = o.q || 0.7;
        g.gain.setValueAtTime(o.vol || 0.1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(flt); flt.connect(g); g.connect(o.dest || sfxBus);
        src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
    }
    /* --- Phonk-Bausteine --- */
    var distCurve = null;
    function shaper() {
        if (!distCurve) { var n = 1024; distCurve = new Float32Array(n); for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1; distCurve[i] = Math.tanh(x * 3.2); } }
        var ws = ctx.createWaveShaper(); ws.curve = distCurve; ws.oversample = '2x'; return ws;
    }
    function cowbell(m, t, dur, v, dest) {        // Kuhglocke: zwei Rechteck-Töne durch einen Bandpass
        var f = mtof(m), g = ctx.createGain(), bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = f * 1.6; bp.Q.value = 2.2;
        [1, 1.48].forEach(function (k) { var o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * k; o.connect(bp); o.start(t); o.stop(t + dur + 0.05); });
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        bp.connect(g); g.connect(dest);
        if (echo) g.connect(echo);
    }
    function bass808(m, t, dur, v, dest, slideTo) {   // tiefer, angezerrter 808-Bass mit Gleiten
        var o = ctx.createOscillator(), g = ctx.createGain(), ws = shaper(), lp = ctx.createBiquadFilter();
        o.type = 'sine'; var f = mtof(m);
        o.frequency.setValueAtTime(f * 2.2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.035);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(mtof(slideTo), t + dur * 0.85);
        lp.type = 'lowpass'; lp.frequency.value = 700;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.setValueAtTime(v, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(ws); ws.connect(lp); lp.connect(g); g.connect(dest);
        o.start(t); o.stop(t + dur + 0.05);
    }
    function clap(t, dest) { [0, 0.011, 0.022].forEach(function (d, i) { noise(t + d, i === 2 ? 0.16 : 0.02, { ft: 'bandpass', f: 1400, q: 0.9, vol: 0.3, dest: dest }); }); }
    function kick(t, dest) { note(150, t, 0.16, { type: 'sine', to: 45, glide: 0.12, vol: 0.55, dest: dest, a: 0.002 }); }
    function snare(t, dest) { noise(t, 0.13, { f: 1800, vol: 0.22, dest: dest }); note(190, t, 0.07, { type: 'triangle', vol: 0.12, dest: dest }); }
    function hat(t, dest, v) { noise(t, 0.035, { f: 8000, vol: v || 0.07, dest: dest }); }

    /* ================= Musik ================= */
    // Schritte = Sechzehntel, 4 Takte à 16. Melodie als Achtel (MIDI, 0 = Pause), wird verdoppelt.
    var TRACKS = {
        meadow: {   // fröhlich, C-Dur: C – Am – F – G
            bpm: 132, lead: 'square', leadVol: 0.07, echo: false,
            mel: [76, 79, 84, 79, 81, 79, 76, 0, 76, 72, 74, 76, 0, 72, 69, 0, 77, 0, 77, 81, 79, 77, 76, 74, 74, 76, 79, 0, 83, 0, 79, 0],
            chords: [[48, 60, 64, 67], [45, 57, 60, 64], [41, 57, 60, 65], [43, 55, 59, 62]],
            drums: 'k.h.s.h.k.k.s.h.'
        },
        mine: {     // geheimnisvoll, a-Moll mit Echo: Am – F – Dm – E
            bpm: 112, lead: 'triangle', leadVol: 0.11, echo: true,
            mel: [69, 0, 72, 0, 76, 0, 74, 72, 69, 0, 0, 65, 69, 72, 0, 0, 74, 0, 77, 0, 76, 74, 72, 0, 71, 0, 68, 0, 71, 74, 76, 0],
            chords: [[45, 57, 60, 64], [41, 57, 60, 65], [38, 57, 62, 65], [40, 56, 59, 64]],
            drums: 'k...h...s...h.k.'
        },
        title: {    // ruhig für die Menüs (Wiesen-Akkorde, weiche Melodie)
            bpm: 100, lead: 'triangle', leadVol: 0.08, echo: true,
            mel: [72, 0, 76, 0, 79, 0, 76, 0, 69, 0, 72, 0, 76, 0, 72, 0, 65, 0, 69, 0, 72, 0, 77, 76, 67, 0, 71, 0, 74, 0, 79, 0],
            chords: [[48, 60, 64, 67], [45, 57, 60, 64], [41, 57, 60, 65], [43, 55, 59, 62]],
            drums: '....h.......h...'
        }
    };
    /* Phonk: Sechzehntel-Raster, 4 Takte. bell = Kuhglocken-Riff (MIDI je 16tel, 0 = Pause), bass = [Schritt, Ton, Länge in 16teln, Gleit-Ziel] je Takt */
    TRACKS.phonk = {
        kind: 'phonk', bpm: 142, bellVol: 0.1,
        bell: [74, 0, 74, 0, 77, 0, 74, 0, 72, 0, 72, 0, 69, 0, 0, 0,  74, 0, 74, 0, 77, 0, 79, 0, 77, 0, 74, 0, 72, 0, 74, 0,
               70, 0, 70, 0, 74, 0, 70, 0, 69, 0, 69, 0, 72, 0, 69, 0,  74, 0, 77, 0, 81, 0, 79, 0, 77, 0, 76, 0, 74, 0, 0, 0],
        bass: [[[0, 38, 7], [10, 38, 2], [12, 41, 4]], [[0, 41, 7], [10, 41, 2], [12, 43, 4]], [[0, 34, 7], [10, 34, 2], [12, 36, 4]], [[0, 33, 6], [8, 38, 4], [12, 45, 4, 38]]],
        kick: [0, 7, 10], clap: [4, 12], hats: 2, roll: true
    };
    TRACKS.phonk2 = {                // Drachenschlucht: dunkler, treibender
        kind: 'phonk', bpm: 150, bellVol: 0.09,
        bell: [62, 0, 62, 65, 0, 62, 0, 61, 62, 0, 0, 0, 58, 0, 57, 0,  62, 0, 62, 65, 0, 67, 0, 65, 62, 0, 0, 0, 61, 0, 0, 0,
               58, 0, 58, 62, 0, 58, 0, 57, 58, 0, 0, 0, 55, 0, 57, 0,  62, 0, 65, 0, 69, 0, 67, 0, 65, 0, 64, 0, 61, 0, 62, 0],
        bass: [[[0, 26, 6], [7, 26, 2], [10, 26, 3], [13, 29, 3]], [[0, 26, 6], [7, 26, 2], [10, 31, 3], [13, 29, 3]], [[0, 22, 6], [7, 22, 2], [10, 22, 3], [13, 24, 3]], [[0, 21, 6], [8, 26, 4], [12, 33, 4, 26]]],
        kick: [0, 3, 7, 10], clap: [4, 12], hats: 1, roll: true
    };
    TRACKS.phonkMenu = {             // ruhig: nur Glocke, weicher Bass, wenig Hi-Hat
        kind: 'phonk', bpm: 120, bellVol: 0.07,
        bell: [74, 0, 0, 0, 77, 0, 0, 0, 72, 0, 0, 0, 69, 0, 0, 0,  74, 0, 0, 0, 77, 0, 79, 0, 77, 0, 0, 0, 74, 0, 0, 0,
               70, 0, 0, 0, 74, 0, 0, 0, 69, 0, 0, 0, 72, 0, 0, 0,  74, 0, 77, 0, 81, 0, 0, 0, 79, 0, 0, 0, 77, 0, 0, 0],
        bass: [[[0, 38, 12]], [[0, 41, 12]], [[0, 34, 12]], [[0, 33, 8], [8, 38, 8]]],
        kick: [0], clap: [8], hats: 4, roll: false
    };
    function playPhonk(tr, i, t) {
        var bar = Math.floor(i / 16) % 4, s16 = i % 16, sp = 60 / tr.bpm / 4;
        var b = tr.bell[bar * 16 + s16]; if (b) cowbell(b, t, sp * 2.6, tr.bellVol, musicBus);
        tr.bass[bar].forEach(function (e) { if (e[0] === s16) bass808(e[1], t, sp * e[2], 0.5, musicBus, e[3]); });
        if (tr.kick.indexOf(s16) >= 0) kick(t, musicBus);
        if (tr.clap.indexOf(s16) >= 0) clap(t, musicBus);
        if (s16 % tr.hats === 0) hat(t, musicBus, 0.06);
        if (tr.roll && bar === 3 && s16 >= 12) { hat(t + sp / 3, musicBus, 0.05); hat(t + 2 * sp / 3, musicBus, 0.05); }   // Hi-Hat-Wirbel
    }
    /* --- Lo-Fi: warme Septakkorde, Swing, Vinyl-Knistern --- */
    function keys(m, t, dur, v) {                 // E-Piano-artig: Sinus + leicht verstimmtes Dreieck, weich gefiltert
        note(mtof(m), t, dur, { type: 'sine', vol: v, dest: musicBus, a: 0.02, r: dur * 0.5 });
        note(mtof(m) * 1.003, t, dur, { type: 'triangle', vol: v * 0.45, dest: musicBus, a: 0.02, r: dur * 0.5, lp: 1600 });
    }
    function crackle(t, sp) { for (var i = 0; i < 2; i++) if (Math.random() < 0.35) noise(t + Math.random() * sp, 0.012, { f: 3000, vol: 0.025 + Math.random() * 0.03, dest: musicBus }); }
    function playLofi(tr, i, t) {
        var bar = Math.floor(i / 16) % 4, s16 = i % 16, sp = 60 / tr.bpm / 4;
        var sw = (s16 % 2) ? sp * 0.33 : 0;          // Swing auf die Off-Beats
        var ch = tr.chords[bar];
        if (s16 === 0) ch.forEach(function (m, k) { keys(m + 12, t + k * 0.012, sp * 15, 0.045); });
        if (s16 === 8 && tr.restrike) ch.slice(1).forEach(function (m, k) { keys(m + 12, t + k * 0.012, sp * 7, 0.03); });
        if (s16 === 0 || s16 === 10) note(mtof(ch[0] - 12), t, sp * 5, { type: 'sine', vol: 0.22, dest: musicBus, a: 0.01, r: 0.2 });
        if (s16 % 2 === 0) { var m = tr.mel[bar * 8 + s16 / 2]; if (m) note(mtof(m), t + sw, sp * 2.6, { type: 'triangle', vol: tr.leadVol, dest: musicBus, lp: 2200, a: 0.015, r: 0.15, send: echo }); }
        var d = tr.drums[s16];
        if (d === 'k') note(110, t, 0.22, { type: 'sine', to: 48, glide: 0.18, vol: 0.4, dest: musicBus, a: 0.003 });
        else if (d === 's') { noise(t + sw, 0.18, { ft: 'bandpass', f: 1300, q: 0.8, vol: 0.14, dest: musicBus }); }
        if (d === 'h' || (tr.hats && s16 % 2 === 0 && d !== 'k' && d !== 's')) hat(t + sw, musicBus, 0.035);
        crackle(t, sp);
    }
    /* eigene Songs für Kiez-Könige */
    TRACKS.lofiMorning = {   // „Kiez-Morgen“: ruhiges Planen, F-Dur-Septakkorde
        kind: 'lofi', bpm: 80, leadVol: 0.07, restrike: true, hats: false,
        chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]],
        mel: [72, 0, 0, 69, 0, 67, 0, 0, 71, 0, 69, 0, 67, 0, 64, 0, 69, 0, 0, 72, 0, 74, 72, 0, 67, 0, 64, 0, 0, 0, 0, 0],
        drums: 'k.......s.k.....'
    };
    TRACKS.lofiDay = {       // „Rush Hour Lo-Fi“: der Laden brummt
        kind: 'lofi', bpm: 92, leadVol: 0.08, restrike: true, hats: true,
        chords: [[57, 60, 64, 67], [50, 57, 60, 65], [55, 59, 62, 65], [48, 55, 60, 64]],
        mel: [76, 0, 74, 72, 0, 69, 72, 0, 74, 0, 72, 69, 0, 67, 0, 0, 72, 0, 74, 76, 0, 79, 76, 0, 74, 72, 0, 69, 0, 0, 0, 0],
        drums: 'k.....k.s...k...'
    };
    TRACKS.lofiEvening = {   // „Feierabend“: langsam und warm
        kind: 'lofi', bpm: 72, leadVol: 0.065, restrike: false, hats: false,
        chords: [[48, 52, 55, 59], [45, 52, 55, 60], [41, 52, 57, 60], [43, 50, 55, 59]],
        mel: [67, 0, 0, 0, 64, 0, 62, 0, 64, 0, 0, 60, 0, 0, 0, 0, 65, 0, 0, 64, 0, 62, 60, 0, 62, 0, 0, 0, 0, 0, 0, 0],
        drums: 'k.......s.......'
    };
    TRACKS.chipKiez = {      // „Kiez-König“: fröhlicher Chiptune für den Verkaufstag, G-Dur
        bpm: 138, lead: 'square', leadVol: 0.065, echo: false,
        mel: [79, 0, 83, 0, 86, 83, 79, 0, 76, 0, 79, 83, 0, 79, 76, 0, 72, 76, 79, 0, 84, 0, 79, 76, 74, 0, 78, 0, 81, 0, 78, 74],
        chords: [[43, 55, 59, 62], [40, 55, 59, 64], [36, 55, 60, 64], [38, 54, 57, 62]],
        drums: 'k.h.s.hkk.h.s.h.'
    };
    TRACKS.chipPlan = {      // „Morgenrunde“: ruhiger Chiptune zum Planen, F-Dur
        bpm: 104, lead: 'triangle', leadVol: 0.085, echo: true,
        mel: [72, 0, 77, 0, 76, 0, 72, 0, 69, 0, 74, 0, 72, 0, 69, 0, 70, 0, 74, 0, 77, 0, 74, 0, 72, 0, 76, 0, 79, 0, 0, 0],
        chords: [[41, 53, 57, 60], [38, 53, 57, 62], [46, 53, 58, 62], [48, 55, 60, 64]],
        drums: 'k...h...s...h...'
    };
    TRACKS.phonkKiez = {     // „Kiez Drift“: Phonk für den Verkaufstag, e-Moll
        kind: 'phonk', bpm: 146, bellVol: 0.1,
        bell: [76, 0, 76, 0, 79, 0, 76, 0, 74, 0, 74, 0, 71, 0, 0, 0,  76, 0, 76, 0, 79, 0, 81, 0, 79, 0, 76, 0, 74, 0, 76, 0,
               72, 0, 72, 0, 76, 0, 72, 0, 71, 0, 71, 0, 74, 0, 71, 0,  76, 0, 79, 0, 83, 0, 81, 0, 79, 0, 78, 0, 76, 0, 0, 0],
        bass: [[[0, 40, 7], [10, 40, 2], [12, 43, 4]], [[0, 43, 7], [10, 43, 2], [12, 45, 4]], [[0, 36, 7], [10, 36, 2], [12, 38, 4]], [[0, 35, 6], [8, 40, 4], [12, 47, 4, 40]]],
        kick: [0, 7, 10], clap: [4, 12], hats: 2, roll: true
    };
    TRACKS.phonkChill = {    // „Night Shift“: ruhiger Phonk für Morgen und Abend
        kind: 'phonk', bpm: 118, bellVol: 0.07,
        bell: [76, 0, 0, 0, 79, 0, 0, 0, 74, 0, 0, 0, 71, 0, 0, 0,  76, 0, 0, 0, 79, 0, 81, 0, 79, 0, 0, 0, 76, 0, 0, 0,
               72, 0, 0, 0, 76, 0, 0, 0, 71, 0, 0, 0, 74, 0, 0, 0,  76, 0, 79, 0, 83, 0, 0, 0, 81, 0, 0, 0, 79, 0, 0, 0],
        bass: [[[0, 40, 12]], [[0, 43, 12]], [[0, 36, 12]], [[0, 35, 8], [8, 40, 8]]],
        kick: [0], clap: [8], hats: 4, roll: false
    };
    function playStep(tr, i, t) {
        if (tr.kind === 'phonk') return playPhonk(tr, i, t);
        if (tr.kind === 'lofi') return playLofi(tr, i, t);
        var bar = Math.floor(i / 16) % 4, s16 = i % 16, sp = 60 / tr.bpm / 4;
        var ch = tr.chords[bar];
        // Bass: Achtel mit Oktavsprung
        if (s16 % 2 === 0) note(mtof(ch[0] + (s16 % 4 === 2 ? 12 : 0)), t, sp * 1.8, { type: 'triangle', vol: 0.2, dest: musicBus, lp: 900 });
        // Arpeggio: leise Sechzehntel
        note(mtof(ch[1 + (s16 % 3)] + 12), t, sp * 0.9, { type: 'square', vol: 0.022, dest: musicBus, lp: 2600 });
        // Melodie: Achtel
        if (s16 % 2 === 0) {
            var m = tr.mel[bar * 8 + s16 / 2];
            if (m) note(mtof(m), t, sp * 1.9, { type: tr.lead, vol: tr.leadVol, dest: musicBus, vib: true, lp: 3200, send: tr.echo ? echo : null, r: 0.08 });
        }
        // Schlagzeug
        var d = tr.drums[s16];
        if (d === 'k') kick(t, musicBus); else if (d === 's') snare(t, musicBus); else if (d === 'h') hat(t, musicBus);
    }
    function schedule() {
        if (!ctx || !seq.track) return;
        var tr = TRACKS[seq.track], sp = 60 / tr.bpm / 4;
        while (seq.next < ctx.currentTime + 0.14) {
            if (!A.muted) playStep(tr, seq.step, seq.next);
            seq.step = (seq.step + 1) % 64; seq.next += sp;
        }
    }
    /* Musik wechseln: 'meadow' | 'mine' | 'title' | null */
    A.music = function (name, vol) {
        if (!init()) return;
        if (name === seq.track) { setMusicVol(vol); return; }
        seq.track = name;
        setMusicVol(vol);
        if (!name) { if (seq.timer) { clearInterval(seq.timer); seq.timer = null; } return; }
        seq.step = 0; seq.next = ctx.currentTime + 0.08;
        if (!seq.timer) seq.timer = setInterval(schedule, 25);
    };
    function setMusicVol(v) { if (musicBus) musicBus.gain.setTargetAtTime(0.42 * (v === undefined ? 1 : v), ctx.currentTime, 0.15); }
    A.duck = function (on) { if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.12 : 0.42, ctx.currentTime, 0.1); };
    A.setMuted = function (m) { A.muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05); };

    /* ================= Effekte ================= */
    A.sfx = function (k) {
        if (A.muted || !init()) return;
        var t = ctx.currentTime + 0.005;
        switch (k) {
            case 'move': note(1046, t, 0.035, { type: 'triangle', vol: 0.05 }); break;
            case 'click': note(784, t, 0.05, { type: 'square', vol: 0.05, lp: 3000 }); note(1175, t + 0.04, 0.07, { type: 'square', vol: 0.05, lp: 3000 }); break;
            case 'no': note(196, t, 0.1, { type: 'square', vol: 0.08, lp: 1200 }); note(147, t + 0.09, 0.16, { type: 'square', vol: 0.08, lp: 1200 }); break;
            case 'coin': {
                var now = ctx.currentTime;
                combo.n = now - combo.t < 0.45 ? Math.min(combo.n + 1, 12) : 0; combo.t = now;
                var base = 88 + combo.n;                                   // steigt bei Taler-Ketten
                note(mtof(base), t, 0.06, { type: 'square', vol: 0.06, lp: 5000 });
                note(mtof(base + 7), t + 0.05, 0.14, { type: 'square', vol: 0.06, lp: 5000, r: 0.1 });
                break;
            }
            case 'jump': note(280, t, 0.2, { type: 'square', to: 820, glide: 0.16, vol: 0.07, lp: 2400 }); noise(t, 0.06, { f: 3000, vol: 0.04 }); break;
            case 'land': noise(t, 0.06, { ft: 'lowpass', f: 600, vol: 0.12 }); break;
            case 'slide': noise(t, 0.3, { ft: 'bandpass', f: 1800, fto: 350, q: 1.5, vol: 0.2 }); break;
            case 'lane': noise(t, 0.07, { ft: 'bandpass', f: 2600, fto: 1200, q: 2, vol: 0.09 }); break;
            case 'power': [72, 76, 79, 84, 88, 91].forEach(function (m, i) { note(mtof(m), t + i * 0.045, 0.1, { type: 'square', vol: 0.055, lp: 4000 }); }); noise(t + 0.25, 0.25, { f: 9000, vol: 0.05 }); break;
            case 'heart': [79, 83, 86, 91].forEach(function (m, i) { note(mtof(m), t + i * 0.07, 0.16, { type: 'triangle', vol: 0.12 }); }); break;
            case 'hurt':
                note(440, t, 0.12, { type: 'square', to: 220, vol: 0.09, lp: 1800 }); note(330, t + 0.12, 0.22, { type: 'square', to: 150, vol: 0.09, lp: 1500 });
                noise(t, 0.2, { ft: 'lowpass', f: 1200, vol: 0.18 });
                A.duck(true); setTimeout(function () { A.duck(false); }, 900);
                break;
            case 'crash':
                noise(t, 0.6, { ft: 'lowpass', f: 2400, fto: 200, vol: 0.4 });
                note(392, t, 0.5, { type: 'square', to: 55, vol: 0.1, lp: 1400 });
                kick(t, sfxBus);
                break;
            case 'thud': note(130, t, 0.14, { type: 'sine', to: 60, vol: 0.3 }); noise(t, 0.08, { ft: 'lowpass', f: 900, vol: 0.15 }); break;
            case 'shield': note(1568, t, 0.45, { type: 'sine', to: 392, vol: 0.12 }); noise(t, 0.3, { f: 7000, vol: 0.05 }); break;
            case 'zone': [64, 67, 71, 76].forEach(function (m, i) { note(mtof(m), t + i * 0.09, 0.2, { type: 'triangle', vol: 0.1, send: echo }); }); break;
            case 'badge': [72, 76, 79, 84].forEach(function (m, i) { note(mtof(m), t + i * 0.08, 0.22, { type: 'square', vol: 0.05, lp: 3500 }); }); [84, 88, 91].forEach(function (m) { note(mtof(m), t + 0.34, 0.5, { type: 'triangle', vol: 0.06 }); }); break;
            case 'buy': noise(t, 0.08, { f: 6000, vol: 0.08 }); [76, 83, 88].forEach(function (m, i) { note(mtof(m), t + 0.04 + i * 0.07, 0.15, { type: 'square', vol: 0.05, lp: 4500 }); }); break;
            case 'record': [72, 76, 79, 84, 79, 84, 88].forEach(function (m, i) { note(mtof(m), t + i * 0.11, i === 6 ? 0.6 : 0.16, { type: 'square', vol: 0.05, lp: 4000 }); }); [60, 64, 67].forEach(function (m) { note(mtof(m), t + 0.66, 0.7, { type: 'triangle', vol: 0.08 }); }); break;
            case 'roar':
                noise(t, 0.9, { ft: 'lowpass', f: 900, fto: 180, q: 2, vol: 0.35 });
                note(95, t, 0.9, { type: 'sawtooth', to: 55, vol: 0.12, lp: 700, vib: true });
                note(142, t + 0.05, 0.7, { type: 'square', to: 80, vol: 0.06, lp: 900 });
                break;
            case 'fire': noise(t, 0.45, { ft: 'bandpass', f: 600, fto: 2400, q: 1.2, vol: 0.25 }); break;
            case 'boom': kick(t, sfxBus); noise(t, 0.35, { ft: 'lowpass', f: 1800, fto: 150, vol: 0.3 }); break;
            case 'build': [60, 64, 67, 72].forEach(function (m, i) { note(mtof(m), t + i * 0.06, 0.12, { type: 'square', vol: 0.05, lp: 3500 }); }); kick(t + 0.26, sfxBus); break;
            case 'win': [72, 76, 79, 84, 79, 84, 88].forEach(function (m, i) { note(mtof(m), t + i * 0.11, i === 6 ? 0.7 : 0.16, { type: 'square', vol: 0.05, lp: 4000 }); }); [60, 64, 67].forEach(function (m) { note(mtof(m), t + 0.66, 0.8, { type: 'triangle', vol: 0.09 }); }); break;
            case 'bell': note(1568, t, 0.6, { type: 'sine', vol: 0.08, send: echo }); note(2093, t + 0.12, 0.7, { type: 'sine', vol: 0.05, send: echo }); break;
            case 'pop': note(520, t, 0.06, { type: 'square', vol: 0.05, lp: 2500 }); note(780, t + 0.05, 0.09, { type: 'triangle', vol: 0.07 }); break;
            case 'mission': [67, 72, 76, 79, 84].forEach(function (m, i) { note(mtof(m), t + i * 0.07, 0.18, { type: 'triangle', vol: 0.1 }); }); noise(t + 0.35, 0.3, { f: 8000, vol: 0.05 }); break;
            case 'go': [67, 72].forEach(function (m, i) { note(mtof(m), t + i * 0.1, 0.14, { type: 'square', vol: 0.06, lp: 4000 }); }); break;
        }
    };
})(window);
