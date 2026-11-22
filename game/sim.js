/* Kiez-Könige – Spiellogik ohne Oberfläche (läuft auch in Node) */
(function (G) {
    'use strict';
    var K = G.KKDATA;
    var S = {};

    /* ---------- Zufall ---------- */
    S.rand = function (st) {
        var t = (st.rng += 0x6D2B79F5) | 0;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    function pick(st, arr) { return arr[Math.floor(S.rand(st) * arr.length)]; }
    function r10(x) { return Math.round(x * 10) / 10; }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    /* ---------- Neues Spiel ---------- */
    S.newGame = function (opts, seed) {
        opts = opts || {};
        var st = {
            v: 1, rng: (seed >>> 0) || 1, days: opts.days || 20, day: 1, mode: opts.mode || 'remote', cpuLevel: opts.cpuLevel || 'normal',
            phase: 'plan', weather: 'sun', forecast: 'sun', event: null, log: [],
            districtRent: [1, 1, 1, 1],
            players: [0, 1].map(function (i) {
                var cpu = !!(opts.cpu && opts.cpu[i]);
                return { name: cpu ? 'Computer' : K.players[i].name, color: K.players[i].color, cpu: cpu,
                    cash: K.startCash, loan: 0, mkt: 0, ready: false, history: [], totalRevenue: 0, totalProfit: 0 };
            }),
            plots: K.plots.map(function (p) { return { id: p.id, owner: -1, type: null, level: 0, price: 0, invested: 0, last: null, opened: 0 }; }),
            report: null, influencer: null
        };
        st.weather = S.rollWeather(st);
        st.forecast = S.rollWeather(st);
        st.event = null;   // Tag 1 ohne Ereignis
        st.players.forEach(function (p, i) { p.history.push(S.wealth(st, i)); });
        return st;
    };
    S.rollWeather = function (st) {
        var r = S.rand(st), acc = 0;
        var keys = Object.keys(K.weather);
        for (var i = 0; i < keys.length; i++) { acc += K.weather[keys[i]].p; if (r < acc) return keys[i]; }
        return 'sun';
    };
    S.dow = function (st, day) { return ((day || st.day) - 1) % 7; };
    S.isWeekend = function (st, day) { return S.dow(st, day) >= 5; };

    /* ---------- Kennzahlen ---------- */
    S.wealth = function (st, pi) {
        var p = st.players[pi], inv = 0;
        st.plots.forEach(function (pl) { if (pl.owner === pi) inv += pl.invested; });
        return Math.round(p.cash - p.loan + inv * K.assetValue);
    };
    S.shopsOf = function (st, pi) { return st.plots.filter(function (pl) { return pl.owner === pi; }); };
    S.rentOf = function (st, pl) { var d = K.plots[pl.id].d; return Math.round(K.plots[pl.id].rent * st.districtRent[d] / 10) * 10; };
    S.capOf = function (pl) { return K.types[pl.type].cap[pl.level]; };
    S.wageOf = function (pl) { return K.types[pl.type].wage[pl.level]; };
    S.upgradeCost = function (pl) { return pl.level >= 2 ? null : K.types[pl.type].up[pl.level]; };
    S.priceRange = function (type) { var r = K.types[type].ref; return [r10(r * 0.5), r10(r * 2)]; };

    /* ---------- Aktionen (geben {ok, msg} zurück) ---------- */
    S.act = function (st, pi, cmd, a, b) {
        if (st.phase !== 'plan') return { ok: false, msg: 'Gerade nicht – erst am Morgen planen.' };
        var p = st.players[pi], pl = typeof a === 'number' ? st.plots[a] : null;
        if (p.ready && cmd !== 'unready') return { ok: false, msg: 'Du bist schon fertig für heute.' };
        switch (cmd) {
            case 'build': {
                var t = K.types[b];
                if (!pl || !t) return { ok: false, msg: 'Unbekannt.' };
                if (pl.owner !== -1) return { ok: false, msg: pl.owner === pi ? 'Gehört dir schon.' : 'Schon vergeben!' };
                if (p.cash < t.build) return { ok: false, msg: 'Zu wenig Geld: ' + t.name + ' kostet ' + fmt(t.build) + '.' };
                p.cash -= t.build;
                pl.owner = pi; pl.type = b; pl.level = 0; pl.price = r10(t.ref); pl.invested = t.build; pl.last = null; pl.opened = st.day;
                return { ok: true, msg: t.name + ' gebaut!', fx: 'build' };
            }
            case 'upgrade': {
                if (!pl || pl.owner !== pi) return { ok: false, msg: 'Nicht dein Laden.' };
                var c = S.upgradeCost(pl);
                if (c === null) return { ok: false, msg: 'Schon voll ausgebaut.' };
                if (p.cash < c) return { ok: false, msg: 'Zu wenig Geld: Ausbau kostet ' + fmt(c) + '.' };
                p.cash -= c; pl.level += 1; pl.invested += c;
                return { ok: true, msg: K.types[pl.type].name + ' auf ' + K.levelNames[pl.level] + ' ausgebaut!', fx: 'upgrade' };
            }
            case 'sell': {
                if (!pl || pl.owner !== pi) return { ok: false, msg: 'Nicht dein Laden.' };
                var back = Math.round(pl.invested * K.sellBack);
                p.cash += back;
                var name = K.types[pl.type].name;
                pl.owner = -1; pl.type = null; pl.level = 0; pl.price = 0; pl.invested = 0; pl.last = null;
                return { ok: true, msg: name + ' verkauft (+' + fmt(back) + ').', fx: 'sell' };
            }
            case 'price': {   // b = Schritt (+1 / -1) oder Preis
                if (!pl || pl.owner !== pi) return { ok: false, msg: 'Nicht dein Laden.' };
                var rg = S.priceRange(pl.type), step = pl.price < 5 ? 0.1 : pl.price < 15 ? 0.5 : 1;
                var np = Math.abs(b) <= 1 ? r10(pl.price + b * step) : r10(b);
                pl.price = clamp(np, rg[0], rg[1]);
                return { ok: true, msg: 'Preis: ' + fmtPrice(pl.price) };
            }
            case 'marketing': {
                if (p.mkt > 0) return { ok: false, msg: 'Kampagne läuft noch ' + p.mkt + ' Tag(e).' };
                if (p.cash < K.marketing.cost) return { ok: false, msg: 'Zu wenig Geld für Werbung.' };
                if (!S.shopsOf(st, pi).length) return { ok: false, msg: 'Erst einen Laden bauen.' };
                p.cash -= K.marketing.cost; p.mkt = K.marketing.days;
                return { ok: true, msg: 'Werbekampagne läuft ' + K.marketing.days + ' Tage!', fx: 'marketing' };
            }
            case 'loan': {
                if (p.loan >= K.loanMax) return { ok: false, msg: 'Die Bank gibt nicht mehr.' };
                p.loan += K.loanStep; p.cash += K.loanStep;
                return { ok: true, msg: 'Kredit: +' + fmt(K.loanStep) + ' (0,5 % Zinsen pro Tag).', fx: 'coin' };
            }
            case 'repay': {
                if (p.loan <= 0) return { ok: false, msg: 'Kein Kredit offen.' };
                if (p.cash < K.loanStep) return { ok: false, msg: 'Zu wenig Geld zum Tilgen.' };
                p.loan -= K.loanStep; p.cash -= K.loanStep;
                return { ok: true, msg: fmt(K.loanStep) + ' getilgt.' };
            }
            case 'ready': p.ready = true; return { ok: true, msg: 'Fertig!' };
            case 'unready': p.ready = false; return { ok: true, msg: 'Weiter planen.' };
        }
        return { ok: false, msg: '?' };
    };

    /* ---------- Nachfrage-Modell ----------
       Jedes Viertel hat Kundschaft je Geschäftsart. Läden derselben Art im Viertel
       (und in Nachbarvierteln, mit Weg-Abschlag) teilen sie sich. Preis, Ausbau-Stufe,
       Werbung und Ecklage machen einen Laden attraktiver. Kapazität begrenzt den Verkauf. */
    S.shopUtility = function (st, pl, d, opts) {
        var t = K.types[pl.type], dist = K.plots[pl.id].d === d ? 0 : 1;
        var p = st.players[pl.owner];
        var u = 0.8 * (K.quality[pl.level] - 1) - K.districts[d].sens * 2 * (pl.price / t.ref - 1);
        if (dist) u -= 1.2; else if (K.plots[pl.id].corner) u += 0.15;
        if (p && p.mkt > 0) u += K.marketing.boost;
        if (st.influencer === pl.id) u += 1.0;
        if (opts && opts.boost && opts.boost[pl.id]) u += opts.boost[pl.id];
        return u;
    };
    S.segment = function (st, d, type, weather, event) {
        var D = K.districts[d], t = K.types[type];
        var f = S.isWeekend(st) ? D.weekend : 1;
        if (event) {
            if (event.traffic && event.traffic[d]) f *= event.traffic[d];
            if (event.trafficAll) f *= event.trafficAll;
            if (event.typeAll && event.typeAll[type]) f *= event.typeAll[type];
            if (event.typeMult && event.typeMult[D.id] && event.typeMult[D.id][type]) f *= event.typeMult[D.id][type];
        }
        return D.traffic * f * t.share * t.appeal[d] * t.weather[weather || 'sun'];
    };
    /* Berechnet einen Tag. plots kann geändert übergeben werden (für Prognosen). */
    S.computeDay = function (st, plots, opts) {
        plots = plots || st.plots;
        var weather = (opts && opts.weather) || st.weather, event = opts && opts.hasOwnProperty('event') ? opts.event : S.eventDef(st.event);
        var res = {};
        plots.forEach(function (pl) { if (pl.type) res[pl.id] = { demand: 0, byD: [0, 0, 0, 0] }; });
        for (var d = 0; d < 4; d++) {
            K.typeOrder.forEach(function (type) {
                var shops = plots.filter(function (pl) {
                    if (pl.type !== type) return false;
                    var pd = K.plots[pl.id].d;
                    return pd === d || K.neighbors[d].indexOf(pd) >= 0;
                });
                if (!shops.length) return;
                var seg = S.segment(st, d, type, weather, event);
                var ws = shops.map(function (pl) { return Math.exp(S.shopUtility(st, pl, d, opts)); });
                var sum = ws.reduce(function (a, b) { return a + b; }, K.outside);
                shops.forEach(function (pl, i) { var q = seg * ws[i] / sum; res[pl.id].demand += q; res[pl.id].byD[d] += q; });
            });
        }
        plots.forEach(function (pl) {
            if (!pl.type) return;
            var t = K.types[pl.type], r = res[pl.id];
            var costMult = (event && event.cost && event.cost[pl.type]) || 1;
            r.demand = Math.round(r.demand);
            r.cap = S.capOf(pl);
            r.sales = Math.min(r.demand, r.cap);
            r.lost = r.demand - r.sales;
            r.rev = Math.round(r.sales * pl.price);
            r.goods = Math.round(r.sales * t.cost * costMult);
            r.wage = S.wageOf(pl);
            r.rent = S.rentOf(st, pl);
            r.profit = r.rev - r.goods - r.wage - r.rent;
        });
        return res;
    };
    S.eventDef = function (ev) {
        if (!ev) return null;
        for (var i = 0; i < K.events.length; i++) if (K.events[i].id === ev.id) return K.events[i];
        return null;
    };

    /* Prognose: wie viele Kunden hätte ein neuer Laden dieser Art hier heute? */
    S.forecastBuild = function (st, plotId, type, pi) {
        var t = K.types[type];
        var plots = st.plots.map(function (pl) { return pl.id === plotId ? { id: pl.id, owner: pi, type: type, level: 0, price: r10(t.ref), invested: t.build } : pl; });
        var r = S.computeDay(st, plots)[plotId];
        return r;
    };

    /* ---------- Tag simulieren ---------- */
    S.runDay = function (st) {
        var res = S.computeDay(st);
        var rep = { day: st.day, weather: st.weather, event: st.event, plots: res, players: [] };
        st.players.forEach(function (p, pi) {
            var pr = { rev: 0, goods: 0, wage: 0, rent: 0, interest: Math.round(p.loan * K.loanRate), profit: 0, sales: 0, lost: 0, shops: [] };
            st.plots.forEach(function (pl) {
                if (pl.owner !== pi) return;
                var r = res[pl.id];
                pl.last = { demand: r.demand, sales: r.sales, lost: r.lost, rev: r.rev, profit: r.profit, cap: r.cap, price: pl.price };
                pr.rev += r.rev; pr.goods += r.goods; pr.wage += r.wage; pr.rent += r.rent; pr.sales += r.sales; pr.lost += r.lost;
                pr.shops.push(pl.id);
            });
            pr.profit = pr.rev - pr.goods - pr.wage - pr.rent - pr.interest;
            p.cash += pr.profit;
            p.totalRevenue += pr.rev; p.totalProfit += pr.profit;
            if (p.mkt > 0) p.mkt -= 1;
            // Notfall: bei Minus automatisch Kredit, wenn möglich
            pr.autoLoan = 0;
            while (p.cash < 0 && p.loan < K.loanMax) { p.loan += K.loanStep; p.cash += K.loanStep; pr.autoLoan += K.loanStep; }
            pr.broke = p.cash < 0;
            pr.tips = S.tips(st, pi, res);
            rep.players.push(pr);
        });
        st.report = rep;
        st.phase = 'evening';
        st.players.forEach(function (p, pi) { p.history.push(S.wealth(st, pi)); });
        return rep;
    };

    /* Abend-Tipps: die wichtigste Lektion des Tages */
    S.tips = function (st, pi, res) {
        var out = [];
        S.shopsOf(st, pi).forEach(function (pl) {
            var r = res[pl.id], t = K.types[pl.type];
            if (r.lost > r.cap * 0.25) out.push({ k: 'cap', id: pl.id, x: t.name + ' war ausverkauft – ' + r.lost + ' Kunden gingen leer aus. Ausbauen oder Preis erhöhen!' });
            else if (r.profit < 0 && r.sales < r.cap * 0.5) out.push({ k: 'loss', id: pl.id, x: t.name + ' macht Verlust: Pacht und Personal kosten mehr, als die Marge bringt.' });
            else if (pl.price > t.ref * 1.35 && r.sales < r.cap * 0.6) out.push({ k: 'price', id: pl.id, x: t.name + ': Bei ' + fmtPrice(pl.price) + ' kaufen nur wenige. Zu teuer?' });
        });
        var mine = S.shopsOf(st, pi);
        mine.forEach(function (pl) {
            var d = K.plots[pl.id].d;
            var rival = st.plots.filter(function (o) { return o.owner !== -1 && o.owner !== pi && o.type === pl.type && K.plots[o.id].d === d; });
            if (rival.length) out.push({ k: 'comp', id: pl.id, x: 'Konkurrenz im ' + K.districts[d].name + ': Zwei ' + K.types[pl.type].name + 's teilen sich die Kundschaft.' });
        });
        if (!mine.length) out.push({ k: 'none', x: 'Noch kein Laden? Ohne Geschäft kein Geld – bau morgen deinen ersten!' });
        return out.slice(0, 3);
    };

    /* ---------- Nächster Morgen ---------- */
    S.nextMorning = function (st) {
        st.day += 1;
        st.players.forEach(function (p) { p.ready = false; });
        if (st.day > st.days) { st.phase = 'end'; return; }
        st.weather = st.forecast;
        st.forecast = S.rollWeather(st);
        st.influencer = null;
        st.event = null;
        if (S.rand(st) < 0.4) {
            var ev = pick(st, K.events);
            st.event = { id: ev.id };
            if (ev.influencer) {
                var built = st.plots.filter(function (pl) { return pl.owner !== -1; });
                if (built.length) { st.influencer = pick(st, built).id; st.event.plot = st.influencer; }
                else st.event = null;
            }
        }
        st.phase = 'plan';
    };

    S.winner = function (st) {
        var w = st.players.map(function (p, i) { return st.players[i].cash < 0 && st.players[i].loan >= K.loanMax ? -1e9 : S.wealth(st, i); });
        return w[0] === w[1] ? -1 : (w[0] > w[1] ? 0 : 1);
    };
    S.bankrupt = function (st) {
        for (var i = 0; i < 2; i++) if (st.players[i].cash < 0 && st.players[i].loan >= K.loanMax) return i;
        return -1;
    };

    /* ---------- Computer-Gegner ---------- */
    S.cpuPlan = function (st, pi) {
        var p = st.players[pi], log = [];
        var easy = st.cpuLevel === 'easy';
        var reserve = easy ? 4000 : 1500;
        if (easy && st.day % 2 === 0) { p.ready = true; return log; }   // leicht: plant nur jeden zweiten Tag
        // 1. Preise optimieren
        S.shopsOf(st, pi).forEach(function (pl) {
            var t = K.types[pl.type], best = pl.price, bestP = -1e9;
            for (var m = easy ? 1 : 0.8; m <= (easy ? 1.15 : 1.7); m += 0.05) {
                var price = r10(t.ref * m), save = pl.price;
                pl.price = price;
                var r = S.computeDay(st)[pl.id];
                if (r.profit > bestP) { bestP = r.profit; best = price; }
                pl.price = save;
            }
            pl.price = best;
        });
        // 2. Ausbauen, wenn ausverkauft
        S.shopsOf(st, pi).forEach(function (pl) {
            var c = S.upgradeCost(pl);
            if (c !== null && pl.last && pl.last.lost > pl.last.cap * 0.15 && p.cash - c > reserve && st.days - st.day >= 4) {
                S.act(st, pi, 'upgrade', pl.id); log.push('upgrade');
            }
        });
        // 3. Neu bauen: größter erwarteter Gewinn bis Spielende (notfalls mit Kredit)
        for (var tries = 0; tries < 2; tries++) {
            var best = null, daysLeft = st.days - st.day + 1;
            var budget = p.cash + (easy ? 0 : K.loanMax - p.loan);
            st.plots.forEach(function (pl) {
                if (pl.owner !== -1) return;
                K.typeOrder.forEach(function (type) {
                    var t = K.types[type];
                    if (budget - t.build < reserve) return;
                    var r = S.forecastBuild(st, pl.id, type, pi);
                    var needLoan = Math.max(0, t.build + reserve - p.cash);
                    var gain = r.profit * daysLeft * 0.75 - t.build * (1 - K.assetValue) - needLoan * K.loanRate * daysLeft;
                    if (r.profit > 0 && (!best || gain > best.gain)) best = { gain: gain, plot: pl.id, type: type, roi: gain / t.build };
                });
            });
            if (!best || best.roi < (easy ? 0.8 : 0.3)) break;
            while (p.cash < K.types[best.type].build + reserve && p.loan < K.loanMax) S.act(st, pi, 'loan');
            S.act(st, pi, 'build', best.plot, best.type); log.push('build ' + best.type);
        }
        // 4. Werbung, wenn viele Läden
        if (S.shopsOf(st, pi).length >= 3 && p.mkt === 0 && p.cash > 6000) { S.act(st, pi, 'marketing'); log.push('mkt'); }
        // 5. Kredit tilgen
        while (p.loan > 0 && p.cash > K.loanStep + 8000) S.act(st, pi, 'repay');
        p.ready = true;
        return log;
    };

    function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'; }
    function fmtPrice(x) { return x.toFixed(2).replace('.', ',') + ' €'; }
    S.fmt = fmt; S.fmtPrice = fmtPrice;

    G.KKSIM = S;
})(typeof window !== 'undefined' ? window : globalThis);
