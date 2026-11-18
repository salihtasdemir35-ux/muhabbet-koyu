// ======================================================================
//  MUHABBET KOYU – istemci giriş noktası
// ======================================================================
import './style.css';
import { Game, Settings } from './game';
import { AudioEngine } from './audio';
import { Net } from './net';
import { Voice } from './voice';
import { UI } from './ui';

const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 1100);
const saved = JSON.parse(localStorage.getItem('mk_settings') || 'null');
const settings: Settings = { camSway: true, showTipsy: true, alcohol: true, chatCam: true, quality: isMobile ? 'med' : 'high', invertY: false, sens: 1, ...(saved ?? {}) };
if (new URLSearchParams(location.search).get('q')) settings.quality = new URLSearchParams(location.search).get('q') as any;

const audio = new AudioEngine();
Object.assign(audio.vol, JSON.parse(localStorage.getItem('mk_vol') || '{}')); audio.applyVolumes();
const net = new Net();
const voice = new Voice((o) => net.send(o), audio);
voice.ptt = localStorage.getItem('mk_ptt') === '1';
if (localStorage.getItem('mk_compat') !== null) voice.compat = localStorage.getItem('mk_compat') === '1';
const canvas = document.getElementById('game') as HTMLCanvasElement;
let game: Game;
try { game = new Game(canvas, audio, net, voice, settings); }
catch (e) { document.getElementById('boot')!.innerHTML = '<p style="padding:30px;text-align:center">Bu cihaz WebGL desteklemiyor ya da grafik sürücüsü kapalı. 😔<br>Güncel bir Chrome/Safari/Edge ile tekrar deneyin.</p>'; throw e; }
const ui = new UI(game, net, voice, audio);
(window as any).__mk = { game, ui, net, voice, audio }; // test/hata ayıklama için

game.start();
setTimeout(() => { const b = document.getElementById('boot')!; b.style.opacity = '0'; setTimeout(() => b.remove(), 700); }, 400);
setInterval(() => ui.hudTick(), 150);
// ilk kullanıcı etkileşiminde sesi başlat (tarayıcı kuralı)
const unlock = () => { audio.resume(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);

let authed = false;
net.on('hello', (m) => {
  if (m.ice) voice.ice = m.ice;
  const token = localStorage.getItem('mk_token');
  if (token) net.send({ t: 'auth', mode: 'token', token });
  else if (!authed) ui.showFirstTime();
});
net.on('auth.fail', (m) => { ui.toast(m.msg, 'warn'); if (m.msg.includes('Oturum')) { localStorage.removeItem('mk_token'); ui.showFirstTime(); } });
net.on('auth.ok', (m) => {
  localStorage.setItem('mk_token', m.token);
  game.prof = m.p; ui.look = m.p.look;
  for (const b of m.p.blocked ?? []) voice.blocked.add(b);
  const wasAuthed = authed; authed = true;
  // yeniden bağlanma: son odaya dön
  if (ui.lastRoom && wasAuthed) { net.send({ t: 'room.join', ...ui.lastRoom, pos: { x: game.me.pos.x, z: game.me.pos.z } }); return; }
  if (ui.pendingRoom) { const r = ui.pendingRoom; ui.pendingRoom = null; ui.joinRoom(r.id, r.password, r.key); history.replaceState(null, '', location.pathname); return; }
  ui.closeModal(); ui.showMenu();
});
net.on('prof', (m) => ui.onProf(m.p));
net.on('rooms', (m) => ui.onRooms(m.list));
net.on('contests', (m) => ui.showContests(m));
net.on('joined', (m) => {
  if (!ui.lastRoom || ui.lastRoom.id !== m.room.id) ui.lastRoom = { id: m.room.id, key: m.room.inviteKey, password: ui.pendingPass || undefined };
  ui.lastRoom.key = m.room.inviteKey;
  ui.pendingPass = '';
  ui.closeModal();
  game.enterRoom(m);
  game.setHost(m.hostId);
});
net.on('join.fail', (m) => { if (m.needPass) ui.askPassword(m.id); ui.toast(m.msg, 'warn'); if (!game.inRoom) ui.showMenu(); });
net.on('left', () => { /* */ });
net.on('kicked', (m) => { ui.lastRoom = null; game.leaveRoomLocal(); ui.showMenu(); ui.toast(m.msg, 'warn'); });
net.on('err', (m) => ui.toast(m.msg, 'warn'));
net.on('note', (m) => ui.toast(m.msg, m.kind));
net.on('needAdult', () => ui.showAdultGate());
net.on('pj', (m) => { game.addRemote(m.p); /* yeni gelen bize bağlanır (teklifi o yapar) */ });
net.on('pl', (m) => game.removeRemote(m.id));
net.on('snap', (m) => game.onSnap(m));
net.on('pu', (m) => game.onPlayerUpdate(m));
net.on('host', (m) => game.setHost(m.id));
net.on('fix', (m) => { game.me.pos.set(m.x, m.y, m.z); });
net.on('grill', (m) => game.setGrill(m.g));
net.on('tree', (m) => { game.world.setTreeFruit(m.id, m.n); });
net.on('door', (m) => game.world.setDoor(m.id, m.open));
net.on('env', (m) => game.setEnv(m.env));
net.on('roomcfg', (m) => { game.alcoholRoom = m.alcohol; });
net.on('prop', (m) => game.setProp(m.p));
net.on('propDel', (m) => game.delProp(m.pid));
net.on('fx', (m) => game.onFx(m));
net.on('bite', () => game.onBite());
net.on('cast.ok', () => { /* */ });
net.on('catch', (m) => game.onCatchResult(m));
net.on('chat', (m) => ui.addChat(m));
net.on('rtc', (m) => voice.onSignal(m.from, m.d));
net.on('grp.invite', (m) => {
  ui.openModal('🔒 Özel sohbet daveti', (() => {
    const d = document.createElement('div'); d.className = 'col';
    d.innerHTML = `<p><b>${m.name.replace(/</g, '')}</b> seni özel sohbete davet ediyor. Grup içindekiler birbirini mesafeden bağımsız duyar; dışarıdakiler duymaz.</p>`;
    const ok = document.createElement('button'); ok.className = 'btn pri'; ok.textContent = 'Katıl'; ok.onclick = () => { net.send({ t: 'grp.accept', gid: m.gid }); ui.closeModal(); };
    const no = document.createElement('button'); no.className = 'btn'; no.textContent = 'Hayır'; no.onclick = () => ui.closeModal();
    d.append(ok, no); return d;
  })());
});
net.on('_close', () => { if (game.inRoom) { ui.toast('Bağlantı koptu, yeniden bağlanılıyor…', 'warn'); game.leaveRoomLocal(); } });
net.onStatus = () => { /* menüdeki durum göstergesi bir sonraki çizimde güncellenir */ };
net.connect();

// PWA servis çalışanı (çevrimdışı kabuk)
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
