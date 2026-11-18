// ======================================================================
//  MUHABBET KOYU – Oyun sunucusu
//  HTTP (statik istemci) + WebSocket (oyun protokolü + WebRTC sinyal)
//  Çalıştırma:  npm run build && npm start   →  http://localhost:8080
// ======================================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Store } from './store';
import { Accounts, cleanName, sanitizeLook, weekKey, uid } from './accounts';
import { Room, Client } from './room';
import { PROTOCOL_VERSION, CONTESTS } from '../shared/data';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 8080);
const store = new Store(process.env.DATA_DIR || path.join(ROOT, 'data'));
await store.init();
const acc = new Accounts(store);
const rooms = new Map<string, Room>();

// Herkese açık kalıcı sahiller
for (const [id, name] of [['KUMSAL', 'Kumsal – Herkese Açık'], ['KOY', 'Gün Batımı Koyu'], ['ISKELE', 'İskele Muhabbeti']]) {
  rooms.set(id, new Room(acc, store, { id, name, isPublic: true, permanent: true }));
}

// ICE sunucuları: STUN ücretsiz. Mobil ağlarda TURN gerekebilir (TURN_URL/TURN_USER/TURN_PASS).
const ICE: any[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
if (process.env.TURN_URL) ICE.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USER, credential: process.env.TURN_PASS });

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (url.pathname === '/health') { res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: [...rooms.values()].reduce((a, r) => a + r.players.size, 0), store: store.kind })); return; }
  if (url.pathname === '/api/rooms') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(listRooms())); return; }
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('İstemci derlenmemiş. Önce "npm run build" çalıştırın.'); return; }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400' });
  fs.createReadStream(file).pipe(res);
});

function listRooms() { return [...rooms.values()].filter(r => r.isPublic).map(r => r.summary()).sort((a, b) => b.n - a.n); }

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', (ws: WebSocket, req) => {
  const c: Client & { raw(s: string): void; alive: boolean } = {
    id: uid(4), prof: null, room: null, bucket: 60, lastChat: 0, ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
    send(o: any) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); },
    raw(s: string) { if (ws.readyState === WebSocket.OPEN) ws.send(s); },
    close() { ws.close(); }, alive: true,
  };
  let lastRefill = Date.now();
  ws.on('message', (data) => {
    // hız sınırı (token bucket): saniyede ~40 mesaj
    const tn = Date.now(); c.bucket = Math.min(80, c.bucket + (tn - lastRefill) / 25); lastRefill = tn;
    if (c.bucket < 1) return; c.bucket--;
    let m: any; try { m = JSON.parse(String(data)); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    try { onMsg(c, m); } catch (e) { console.error('[msg]', m.t, e); c.send({ t: 'err', msg: 'Sunucu hatası' }); }
  });
  ws.on('close', () => { if (c.room && c.prof) c.room.leave(c.prof.id); c.room = null; });
  c.send({ t: 'hello', v: PROTOCOL_VERSION, ice: ICE });
});
// kopuk bağlantıları temizle
setInterval(() => {
  wss.clients.forEach((ws: any) => { if (ws.isAliveFlag === false) return ws.terminate(); ws.isAliveFlag = false; ws.ping(); });
}, 25000);
wss.on('connection', (ws: any) => { ws.isAliveFlag = true; ws.on('pong', () => (ws.isAliveFlag = true)); });

function onMsg(c: Client, m: any) {
  if (m.t === 'ping') return c.send({ t: 'pong', ts: m.ts, st: Date.now() });
  if (m.t === 'auth') {
    let res: any = null;
    if (m.mode === 'token') { const p = acc.byToken(m.token); if (p) res = { token: m.token, profile: p }; else return c.send({ t: 'auth.fail', msg: 'Oturum bulunamadı' }); }
    else if (m.mode === 'login') { const r = acc.login(m.user, m.pass); if (typeof r === 'string') return c.send({ t: 'auth.fail', msg: r }); res = r; }
    else res = acc.createGuest(cleanName(m.name), m.look);
    c.prof = res.profile;
    acc.persist(c.prof!);
    return c.send({ t: 'auth.ok', token: res.token, p: acc.publicView(c.prof!) });
  }
  if (!c.prof) return c.send({ t: 'err', msg: 'Önce giriş yapın' });
  switch (m.t) {
    case 'register': { const e = acc.register(c.prof, m.user, m.pass); return c.send(e ? { t: 'note', msg: e, kind: 'warn' } : { t: 'note', msg: '✅ Hesabınız kaydedildi. Artık başka cihazdan giriş yapabilirsiniz.', kind: 'ok' }), c.send({ t: 'prof', p: acc.publicView(c.prof) }); }
    case 'profile': { // menüde karakter düzenleme
      c.prof.look = sanitizeLook(m.look, c.prof.owned);
      if (m.name) c.prof.name = cleanName(m.name);
      acc.persist(c.prof); return c.send({ t: 'prof', p: acc.publicView(c.prof) });
    }
    case 'block': { const id = String(m.id); if (m.on) { if (!c.prof.blocked.includes(id)) c.prof.blocked.push(id); } else c.prof.blocked = c.prof.blocked.filter(x => x !== id); acc.persist(c.prof); return c.send({ t: 'prof', p: acc.publicView(c.prof) }); }
    case 'rooms.list': return c.send({ t: 'rooms', list: listRooms() });
    case 'contests': {
      const all = store.get<any>('contest:' + weekKey()) ?? {};
      return c.send({ t: 'contests', week: weekKey(), defs: CONTESTS, data: all });
    }
    case 'room.create': {
      if (c.room) c.room.leave(c.prof.id);
      const mine = [...rooms.values()].filter(r => !r.permanent && r.hostId === c.prof!.id);
      if (mine.length >= 2) return c.send({ t: 'err', msg: 'En fazla 2 oda açabilirsiniz.' });
      if (rooms.size > 300) return c.send({ t: 'err', msg: 'Sunucu dolu, biraz sonra deneyin.' });
      const r = new Room(acc, store, { name: String(m.name || `${c.prof.name}'in Sahili`).slice(0, 30), isPublic: !!m.pub, password: String(m.password || '').slice(0, 30), max: Number(m.max) || 16 });
      rooms.set(r.id, r);
      const err = r.join(c); if (err) c.send({ t: 'err', msg: err });
      return;
    }
    case 'room.join': {
      const r = rooms.get(String(m.id || '').toUpperCase());
      if (!r) return c.send({ t: 'join.fail', msg: 'Oda bulunamadı. Kapanmış olabilir.' });
      const viaInvite = m.key && m.key === r.inviteKey;
      if (r.password && !viaInvite && String(m.password || '') !== r.password && !(c.room === r)) return c.send({ t: 'join.fail', msg: 'Şifre hatalı.', needPass: true, id: r.id });
      if (c.room && c.room !== r) c.room.leave(c.prof.id);
      const err = r.join(c, m.pos); if (err) c.send({ t: 'join.fail', msg: err });
      return;
    }
    case 'room.leave': if (c.room) { c.room.leave(c.prof.id); c.room = null; } return c.send({ t: 'left' });
    default: if (c.room) c.room.handle(c, m);
  }
}

// oyun döngüleri
let last = Date.now();
setInterval(() => { const t = Date.now(); const dt = (t - last) / 1000; last = t; for (const r of rooms.values()) r.tick(dt); }, 250);
setInterval(() => { for (const r of rooms.values()) r.snapshot(); }, 100);
setInterval(() => { // boş odaları kapat
  for (const [id, r] of rooms) if (!r.permanent && !r.players.size && r.emptySince && Date.now() - r.emptySince > 10 * 60e3) rooms.delete(id);
}, 30e3);

const shutdown = async () => { console.log('Kapanıyor, kayıtlar yazılıyor...'); for (const r of rooms.values()) for (const p of r.players.values()) acc.persist(p.prof); await store.flush(); process.exit(0); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

server.listen(PORT, () => console.log(`🏖️  Muhabbet Koyu sunucusu hazır → http://localhost:${PORT}  (kayıt: ${store.kind})`));
