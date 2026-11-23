/* Kiez-Könige – Verbindung zu den Handy-Controllern.
   Der Fernseher (bzw. das Notebook beim Testen) betreibt einen kleinen Webserver im Heimnetz.
   Handys öffnen /c/?p=1 bzw. /c/?p=2, schicken Befehle an /api/in und lesen ihren Zustand aus /api/state. */
(function (G) {
    'use strict';
    var N = { ok: false, ip: null, port: null, seen: {}, last: '', busy: false, handler: null, pubTimer: null, pending: null };
    G.KKNET = N;

    N.init = function (cb) {
        if (location.protocol === 'file:') { cb(false); return; }
        fetch('/api/info', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
            N.ok = true; N.ip = j.ip; N.port = j.port; cb(true);
        }).catch(function () { cb(false); });
    };
    N.url = function (p) { return 'http://' + N.ip + ':' + N.port + '/' + p; };
    N.short = function (p) { return N.ip + ':' + N.port + '/' + p; };
    N.start = function (handler) {
        N.handler = handler;
        if (!N.ok || N.loop) return;
        N.loop = setInterval(function () {
            if (N.busy) return;
            N.busy = true;
            fetch('/api/in', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
                N.busy = false;
                N.seen = j.seen || {};
                (j.events || []).forEach(function (e) { try { N.handler && N.handler(e); } catch (err) { console.error(err); } });
            }).catch(function () { N.busy = false; });
        }, 120);
    };
    /* Zustand für beide Handys veröffentlichen (gedrosselt) */
    N.publish = function (obj) {
        if (!N.ok) return;
        N.pending = obj;
        if (N.pubTimer) return;
        N.pubTimer = setTimeout(function () {
            N.pubTimer = null;
            var s = JSON.stringify(N.pending);
            if (s === N.last) return;
            N.last = s;
            fetch('/api/state', { method: 'POST', body: s, headers: { 'Content-Type': 'application/json' } }).catch(function () { });
        }, 150);
    };
    N.connected = function (p) { var a = N.seen[p]; return a !== undefined && a !== null && a < 4000; };
})(window);
