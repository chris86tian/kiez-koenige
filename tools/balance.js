// Balancing: Computer gegen Computer. node tools/balance.js [Spiele] [Tage]
require('../game/data.js');
require('../game/sim.js');
const K = globalThis.KKDATA, S = globalThis.KKSIM;
const N = +process.argv[2] || 200, DAYS = +process.argv[3] || 20;
let wealth = [], shops = [], types = {}, ups = 0, broke = 0, day1 = [], lossDays = 0, totalDays = 0, margins = [];
for (let g = 0; g < N; g++) {
    const st = S.newGame({ mode: 'cpu', days: DAYS, cpu: [true, true], cpuLevel: process.argv[4] || 'normal' }, 1000 + g * 7919);
    while (st.phase !== 'end') {
        S.cpuPlan(st, 0); S.cpuPlan(st, 1);
        const rep = S.runDay(st);
        if (st.day === 1) day1.push(rep.players[0].profit);
        rep.players.forEach(p => { totalDays++; if (p.profit < 0) lossDays++; });
        if (S.bankrupt(st) >= 0) { broke++; break; }
        S.nextMorning(st);
    }
    for (let i = 0; i < 2; i++) {
        wealth.push(S.wealth(st, i));
        const my = S.shopsOf(st, i); shops.push(my.length);
        my.forEach(pl => { types[pl.type] = (types[pl.type] || 0) + 1; ups += pl.level; const l = pl.last; if (l) margins.push(l.price / K.types[pl.type].ref); });
    }
}
wealth.sort((a, b) => a - b);
const q = p => wealth[Math.floor(p * (wealth.length - 1))];
const avg = a => (a.reduce((x, y) => x + y, 0) / a.length);
console.log(`Tage ${DAYS}: Vermögen p10 ${q(0.1)} p50 ${q(0.5)} p90 ${q(0.9)} | Läden Ø ${avg(shops).toFixed(1)} | Ausbaustufen Ø ${(ups / shops.length).toFixed(1)} | Pleiten ${broke} | Verlusttage ${(lossDays / totalDays * 100).toFixed(0)}% | Tag-1-Gewinn Ø ${avg(day1).toFixed(0)} | Preis/Ref Ø ${avg(margins).toFixed(2)}`);
console.log('Arten:', JSON.stringify(types));
