// Entwicklungs-Server: gleiche Schnittstelle wie der Server in der Fire-TV-App.
// node tools/devserver.mjs [port]  →  Spiel: http://localhost:8090/game/  ·  Handy: http://<LAN-IP>:8090/c/?p=1
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.argv[2] || 8090;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml' };
const queue = [], seen = {}, state = {};

function lanIp() {
    for (const list of Object.values(networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
    return '127.0.0.1';
}
function send(res, code, body, type) { res.writeHead(code, { 'Content-Type': type || 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); res.end(body); }
function body(req) { return new Promise(r => { let b = ''; req.on('data', c => { b += c; if (b.length > 200000) req.destroy(); }); req.on('end', () => r(b)); }); }

http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (p === '/api/info') return send(res, 200, JSON.stringify({ ip: lanIp(), port: PORT }));
    if (p === '/api/in' && req.method === 'POST') {
        try { const e = JSON.parse(await body(req)); e.t = Date.now(); if (e.p) seen[e.p] = Date.now(); queue.push(e); if (queue.length > 300) queue.shift(); } catch { }
        return send(res, 200, '{"ok":true}');
    }
    if (p === '/api/in') {
        const ev = queue.splice(0), now = Date.now(), ages = {};
        for (const k of Object.keys(seen)) ages[k] = now - seen[k];
        return send(res, 200, JSON.stringify({ events: ev, seen: ages }));
    }
    if (p === '/api/state' && req.method === 'POST') {
        try { const j = JSON.parse(await body(req)); for (const k of Object.keys(j)) state[k] = JSON.stringify(j[k]); } catch { }
        return send(res, 200, '{"ok":true}');
    }
    if (p === '/api/state') {
        const pl = url.searchParams.get('p'); if (pl) seen[pl] = Date.now();
        return send(res, 200, state[pl] || '{}');
    }
    // statische Dateien
    let file = (p === '/' || p === '/1' || p === '/2') ? '/c/index.html' : p;
    if (file.endsWith('/')) file += 'index.html';
    let base;
    if (file.startsWith('/game/')) base = 'game'; else if (file.startsWith('/c/')) base = 'controller'; else return send(res, 404, 'nicht gefunden', 'text/plain');
    const rel = normalize(file.slice(base === 'game' ? 6 : 3));
    if (rel.startsWith('..')) return send(res, 403, 'nein', 'text/plain');
    try { send(res, 200, await readFile(join(ROOT, base, rel)), MIME[extname(rel)] || 'application/octet-stream'); }
    catch { send(res, 404, 'nicht gefunden', 'text/plain'); }
}).listen(PORT, () => console.log(`Kiez-Könige Dev-Server: http://localhost:${PORT}/game/  ·  Handy: http://${lanIp()}:${PORT}/c/?p=1`));
