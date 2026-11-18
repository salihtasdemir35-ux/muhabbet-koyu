// ======================================================================
//  MUHABBET KOYU – Node.js sunucusu (kendi bilgisayarında / VPS'te çalıştırmak için)
//  Cloudflare için: server/worker.ts
//  Çalıştırma:  npm run build && npm start   →  http://localhost:8080
// ======================================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Store } from './store';
import { Hub } from './hub';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 8080);
const store = new Store(process.env.DATA_DIR || path.join(ROOT, 'data'));
await store.init();

// ICE sunucuları: STUN ücretsiz. Mobil ağlarda TURN gerekebilir (TURN_URL/TURN_USER/TURN_PASS).
const ICE: any[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
if (process.env.TURN_URL) ICE.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USER, credential: process.env.TURN_PASS });
const hub = new Hub(store, ICE);

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.jpg': 'image/jpeg' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (url.pathname === '/health') { res.end(JSON.stringify(hub.health())); return; }
  if (url.pathname === '/api/rooms') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(hub.listRooms())); return; }
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('İstemci derlenmemiş. Önce "npm run build" çalıştırın.'); return; }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400' });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', (ws: WebSocket & { alive?: boolean }, req) => {
  const c = hub.open({
    send: (s) => { if (ws.readyState === WebSocket.OPEN) ws.send(s); },
    close: () => ws.close(),
    ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
  });
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));
  ws.on('message', (data) => hub.message(c, String(data)));
  ws.on('close', () => hub.close(c));
});
// kopuk bağlantıları temizle
setInterval(() => { wss.clients.forEach((ws: any) => { if (ws.alive === false) return ws.terminate(); ws.alive = false; ws.ping(); }); }, 25000);

const shutdown = async () => { console.log('Kapanıyor, kayıtlar yazılıyor...'); await hub.shutdown(); process.exit(0); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

server.listen(PORT, () => console.log(`🏖️  Muhabbet Koyu sunucusu hazır → http://localhost:${PORT}  (kayıt: ${store.kind})`));
