// ======================================================================
//  Arayüz: ana menü, karakter oluşturma, oda listesi, HUD, envanter,
//  mağaza, emote, balık, mangal, ayarlar, oyuncular, oda sahibi paneli
// ======================================================================
import type { Game } from './game';
import type { Net } from './net';
import type { Voice } from './voice';
import type { AudioEngine } from './audio';
import { STATIONS } from './audio';
import {
  GAME_NAME, GAME_SUBTITLE, SLOGAN, COSMETICS, SKIN_TONES, PALETTE, HAIR_COLORS, DEFAULT_LOOK, Look, EMOTES, RODS, BAITS,
  FISH, FOODS, DRINKS, FRUITS, FURNITURE, shopItems, ShopCat, itemName, itemCategory, InvItem, QUESTS, TIPSY_LEVELS, tipsyLevel,
  RARITY_COLOR, doneness, cookDef, Rarity, TIPSY_MAX,
} from '../../shared/data';
import { SEATS, POOL, VILLA, GRILL, TREES, FISH_SPOTS, PIER, BAR, inVilla } from '../../shared/world';

type El = HTMLElement;
function h(tag: string, attrs: Record<string, any> = {}, ...kids: (El | string | null | undefined | false)[]): El {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k === 'style') e.setAttribute('style', v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== undefined && v !== false) e.setAttribute(k, String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) e.append(c as any);
  return e;
}
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
export function icon(id: string): string {
  if (FISH.some(f => f.id === id)) return id === 'ahtapot' ? '🐙' : id === 'kalamar' ? '🦑' : id === 'orkinos' ? '🐟' : '🐟';
  const m: Record<string, string> = {
    kofte: '🧆', sucuk: '🌭', kanat: '🍗', tavuksis: '🍢', pirzola: '🍖', biftek: '🥩', mantar: '🍄', patlican: '🍆', biber: '🌶️', domates: '🍅', misir: '🌽', patates: '🥔',
    cay: '🫖', turkkahvesi: '☕', filtre: '☕', su: '💧', ayran: '🥛', kola: '🥤', gazoz: '🥤', limonata: '🍋', portakalsuyu: '🧃', meyvesuyu: '🧃', soguk_kahve: '🧋', mocktail: '🍹',
    bira: '🍺', sarap: '🍷', raki: '🥛', viski: '🥃', kokteyl: '🍸', cintonik: '🍸',
    portakal: '🍊', limon: '🍋', mandalina: '🍊', incir: '🟣', nar: '🔴', zeytin: '🫒', uzum: '🍇',
    olta_bambu: '🎣', olta_karbon: '🎣', olta_pro: '🎣', yem_ekmek: '🍞', yem_karides: '🦐', yem_silikon: '🪱', yem_canli: '🐛',
    esya_sandalye: '🪑', esya_sezlong: '🏖️', esya_semsiye: '⛱️', esya_puf: '🟤',
  };
  return m[id] ?? (COSMETICS.some(c => c.id === id) ? '👕' : EMOTES.find(e => e.id === id)?.icon ?? '📦');
}

export class UI {
  root = document.getElementById('ui')!;
  layer = h('div', { class: 'np' }); hud: El | null = null; modal: El | null = null; side: El | null = null;
  toasts = h('div', { class: 'toasts np' }); chatBox = h('div', { class: 'chat' }); promptEl = h('div', { class: 'prompt glass', style: 'display:none' });
  reelBtn: El | null = null; catchEl: El | null = null; minimap!: HTMLCanvasElement; coinsEl!: El; tipsyEl!: El; micBtn!: El; nameEl!: El; pingEl!: El; actBtn!: El; envEl!: El;
  token = localStorage.getItem('mk_token') ?? '';
  look: Look = JSON.parse(localStorage.getItem('mk_look') || 'null') ?? { ...DEFAULT_LOOK };
  pendingRoom: { id: string; key?: string; password?: string } | null = null;
  lastRoom: { id: string; key?: string; password?: string } | null = null;
  invTab = 'Tümü'; shopTab: ShopCat = 'icecek';
  private chatInput: HTMLInputElement | null = null;

  constructor(public game: Game, public net: Net, public voice: Voice, public audio: AudioEngine) {
    this.root.append(this.toasts);
    const q = new URLSearchParams(location.search);
    if (q.get('oda')) this.pendingRoom = { id: q.get('oda')!.toUpperCase(), key: q.get('k') ?? undefined };
    game.onUI = (ev, d) => this.onGame(ev, d);
    voice.onState = () => this.refreshMic();
    voice.onSpeaking = (on) => net.send({ t: 'speak', on });
  }

  // ================================================================ ortak
  clear() { this.closeModal(); this.closeSide(); this.layer.remove(); this.layer = h('div'); this.root.append(this.layer); }
  closeModal() { this.modal?.remove(); this.modal = null; }
  closeSide() { this.side?.remove(); this.side = null; this.game.me.inGrill = false; }
  openModal(title: string, body: El, wide = false, onClose?: () => void) {
    this.closeModal();
    const m = h('div', { class: 'modal-wrap', onclick: (e: Event) => { if (e.target === m) { this.closeModal(); onClose?.(); } } },
      h('div', { class: 'modal glass', style: wide ? 'width:min(900px,100%)' : '' },
        h('header', {}, h('h2', {}, title), h('button', { class: 'x', onclick: () => { this.closeModal(); onClose?.(); } }, '✕')),
        h('div', { class: 'body' }, body)));
    this.root.append(m); this.modal = m; this.audio.play('click');
    return m;
  }
  openSide(content: El) { this.closeSide(); this.side = h('div', { class: 'panel-side glass' }, content); this.root.append(this.side); }
  toast(msg: string, kind = 'info') {
    const t = h('div', { class: 'toast glass ' + kind }, msg); this.toasts.append(t);
    while (this.toasts.children.length > 5) this.toasts.firstChild?.remove();
    setTimeout(() => { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, kind === 'quest' ? 5000 : 3500);
    if (kind === 'quest') this.audio.play('quest'); else if (kind === 'coin') this.audio.play('coin'); else this.audio.play('note');
  }
  status(): El { const s = h('div', { class: 'status' }, h('span', { class: 'dot ' + (this.net.connected ? 'on' : 'off') }), this.net.connected ? `Sunucuya bağlı (${Math.round(this.net.ping)} ms)` : 'Sunucuya bağlanılıyor…'); return s; }

  // ================================================================ menü
  showFirstTime() {
    this.clear();
    this.game.showPreview(this.look, '');
    const name = h('input', { value: localStorage.getItem('mk_name') ?? '', placeholder: 'Sahildeki adın (ör. Kaptan Cemil)', maxlength: 18 }) as HTMLInputElement;
    const card = h('div', { class: 'card glass col' },
      this.brand(),
      h('p', { style: 'margin:0;line-height:1.5' }, 'Arkadaşlarınla sanal sahilde buluş. Balık tut, mangal yak, çay demle, sesli sohbet et. Hiçbir şey yapmak zorunda değilsin — sadece muhabbet. 🌅'),
      h('div', { class: 'field' }, 'Kullanıcı adın', name),
      h('button', { class: 'btn pri big', onclick: () => { const n = name.value.trim(); if (n.length < 2) { this.toast('En az 2 karakterlik bir ad yaz', 'warn'); return; } localStorage.setItem('mk_name', n); this.net.send({ t: 'auth', mode: 'guest', name: n, look: this.look }); this.audio.resume(); } }, '🏖️ Sahile Gel'),
      h('button', { class: 'btn', onclick: () => this.showLogin() }, '🔑 Hesabım var, giriş yap'),
      h('p', { class: 'muted' }, 'Devam ederek oyun içi sesli sohbet kurallarını kabul edersin. Mikrofon yalnızca sen izin verince açılır; sesin hiçbir yerde kaydedilmez.'),
      this.status());
    this.layer.append(h('div', { class: 'menu' }, card));
  }
  brand() { return h('div', { class: 'brand' }, h('img', { src: '/icons/icon-192.png', alt: '' }), h('div', {}, h('h1', {}, GAME_NAME), h('small', {}, `${GAME_SUBTITLE} · ${SLOGAN}`))); }
  showLogin() {
    const u = h('input', { placeholder: 'kullanıcı adı' }) as HTMLInputElement, p = h('input', { type: 'password', placeholder: 'şifre' }) as HTMLInputElement;
    this.openModal('Giriş yap', h('div', { class: 'col' }, h('div', { class: 'field' }, 'Kullanıcı adı', u), h('div', { class: 'field' }, 'Şifre', p),
      h('button', { class: 'btn pri', onclick: () => { this.net.send({ t: 'auth', mode: 'login', user: u.value, pass: p.value }); this.audio.resume(); } }, 'Giriş')));
  }
  showMenu() {
    this.clear(); this.game.menuMode = true;
    this.game.showPreview(this.game.prof?.look ?? this.look, this.game.prof?.name ?? '');
    const p = this.game.prof;
    const card = h('div', { class: 'card glass col' }, this.brand(),
      h('div', { class: 'row' }, h('span', {}, `👋 Hoş geldin, `, h('b', {}, p?.name ?? '')), h('span', { class: 'coins' }, `🪙 ${p?.coins ?? 0} SL`)),
      h('div', { class: 'grid' },
        h('button', { class: 'btn pri big', onclick: () => this.quickJoin() }, '🌊 Oyuna Katıl'),
        h('button', { class: 'btn sea', onclick: () => this.showFriends() }, '👫 Arkadaşlarla Oyna'),
        h('button', { class: 'btn', onclick: () => this.showCreateRoom() }, '➕ Oda Oluştur'),
        h('button', { class: 'btn', onclick: () => this.showRooms() }, '🏝️ Açık Odalar'),
        h('button', { class: 'btn', onclick: () => this.showCreator() }, '🧑 Karakterim'),
        h('button', { class: 'btn', onclick: () => this.showInventory() }, '🎒 Envanterim'),
        h('button', { class: 'btn', onclick: () => this.showShop() }, '🛍️ Mağaza'),
        h('button', { class: 'btn', onclick: () => this.showSettings() }, '⚙️ Ayarlar'),
        h('button', { class: 'btn', onclick: () => this.showQuests() }, '🏅 Görevler'),
        h('button', { class: 'btn', onclick: () => this.showContests() }, '🏆 Yarışmalar')),
      this.status());
    this.layer.append(h('div', { class: 'menu' }, card));
  }
  quickJoin() { this.audio.resume(); this.net.send({ t: 'rooms.list' }); this.wantQuick = true; }
  wantQuick = false;
  onRooms(list: any[]) {
    if (this.wantQuick) { this.wantQuick = false; const r = list.filter(r => !r.locked && r.n < r.max).sort((a, b) => b.n - a.n)[0]; if (r) this.joinRoom(r.id); else this.toast('Uygun oda yok, yeni oda açılıyor'); return; }
    this.roomList = list; if (this.modal?.dataset.kind === 'rooms') this.showRooms();
  }
  roomList: any[] = [];
  joinRoom(id: string, password?: string, key?: string) { this.audio.resume(); this.lastRoom = { id, password, key }; this.net.send({ t: 'room.join', id, password, key }); }
  showRooms() {
    this.net.send({ t: 'rooms.list' });
    const list = h('div', { class: 'list' }, ...(this.roomList.length ? this.roomList.map(r => h('div', { class: 'li' },
      h('div', { class: 'grow' }, h('b', {}, (r.locked ? '🔒 ' : '🏖️ ') + r.name), h('div', { class: 'muted' }, `Kod: ${r.id} · Sahibi: ${r.host || '-'}`)),
      h('div', { style: 'width:90px' }, h('div', { class: 'muted' }, `${r.n}/${r.max} kişi`), h('div', { class: 'bar2' }, h('i', { style: `width:${(r.n / r.max) * 100}%;background:linear-gradient(90deg,#3ddc97,#ffcc4d)` }))),
      h('button', { class: 'btn sm pri', disabled: r.n >= r.max ? 'true' : undefined, onclick: () => r.locked ? this.askPassword(r.id) : this.joinRoom(r.id) }, r.n >= r.max ? 'Dolu' : 'Katıl'))) : [h('p', { class: 'muted' }, 'Odalar yükleniyor…')]));
    const code = h('input', { placeholder: 'Oda kodu (ör. 3F9A1C)', maxlength: 8 }) as HTMLInputElement;
    const m = this.openModal('Açık Odalar', h('div', { class: 'col' }, list,
      h('div', { class: 'row' }, code, h('button', { class: 'btn sea', onclick: () => code.value && this.joinRoom(code.value.trim().toUpperCase()) }, 'Kodla katıl'), h('button', { class: 'btn', onclick: () => this.showCreateRoom() }, '➕ Yeni oda'))));
    m.dataset.kind = 'rooms';
  }
  askPassword(id: string) {
    const p = h('input', { type: 'password', placeholder: 'Oda şifresi' }) as HTMLInputElement;
    this.openModal('Şifreli oda', h('div', { class: 'col' }, p, h('button', { class: 'btn pri', onclick: () => this.joinRoom(id, p.value) }, 'Katıl')));
  }
  showCreateRoom() {
    const name = h('input', { value: `${this.game.prof?.name ?? ''}'in Sahili`, maxlength: 30 }) as HTMLInputElement;
    const pass = h('input', { type: 'password', placeholder: 'Boş bırakılırsa şifresiz' }) as HTMLInputElement;
    const pub = h('input', { type: 'checkbox' }) as HTMLInputElement;
    const max = h('select', {}, ...[4, 8, 12, 16].map(n => h('option', { value: n, selected: n === 16 ? 'true' : undefined }, `${n} kişi`))) as HTMLSelectElement;
    this.openModal('Oda Oluştur', h('div', { class: 'col' },
      h('div', { class: 'field' }, 'Oda adı', name), h('div', { class: 'field' }, 'Oda şifresi (özel oda)', pass),
      h('label', { class: 'row' }, pub, 'Herkese açık listede göster'), h('div', { class: 'field' }, 'Kapasite', max),
      h('button', { class: 'btn pri', onclick: () => { this.audio.resume(); this.lastRoom = null; this.pendingPass = pass.value; this.net.send({ t: 'room.create', name: name.value, password: pass.value, pub: pub.checked, max: +max.value }); } }, '🏖️ Odayı aç')));
  }
  pendingPass = '';
  showFriends() {
    this.openModal('Arkadaşlarla Oyna', h('div', { class: 'col' },
      h('p', {}, 'Özel bir oda aç ve davet bağlantısını WhatsApp/Telegram ile gönder. Arkadaşın bağlantıya tıklayınca doğrudan senin sahiline gelir.'),
      h('button', { class: 'btn pri', onclick: () => this.showCreateRoom() }, '➕ Özel oda oluştur'),
      h('button', { class: 'btn', onclick: () => this.showRooms() }, '🔑 Oda koduyla katıl')));
  }

  // ================================================================ karakter oluşturma
  showCreator() {
    this.clear();
    const prof = this.game.prof;
    const look: Look = { ...(prof?.look ?? this.look) };
    const owned: string[] = prof?.owned ?? [];
    this.game.showPreview(look, prof?.name ?? '');
    const name = h('input', { value: prof?.name ?? '', maxlength: 18 }) as HTMLInputElement;
    const upd = () => { this.game.showPreview(look, name.value); render(); };
    const body = h('div', { class: 'col' });
    const swatches = (cols: number[], key: keyof Look) => h('div', { class: 'swatches' }, ...cols.map(c => h('button', { class: (look as any)[key] === c ? 'on' : '', style: `background:${hex(c)}`, onclick: () => { (look as any)[key] = c; upd(); } })));
    const opts = (slot: string, key: keyof Look) => h('div', { class: 'opts' }, ...COSMETICS.filter(c => c.slot === slot).map(c => {
      const locked = c.price > 0 && !owned.includes(c.id);
      return h('button', { class: ((look as any)[key] === c.id ? 'on ' : '') + (locked ? 'lock' : ''), title: locked ? `Mağazada ${c.price} SL` : '', onclick: () => { if (locked) { this.toast(`${c.name} mağazada ${c.price} SL`, 'warn'); return; } (look as any)[key] = c.id; upd(); } }, (locked ? '🔒 ' : '') + c.name);
    }));
    const render = () => {
      body.innerHTML = '';
      body.append(
        h('div', { class: 'field' }, 'Kullanıcı adı (başının üstünde görünür)', name),
        h('div', { class: 'sec' }, 'Cinsiyet ve görünüm'),
        h('div', { class: 'opts' }, h('button', { class: look.gender === 'k' ? 'on' : '', onclick: () => { look.gender = 'k'; if (look.hair === 'hair_kisa') look.hair = 'hair_uzun'; upd(); } }, '👩 Kadın'), h('button', { class: look.gender === 'e' ? 'on' : '', onclick: () => { look.gender = 'e'; upd(); } }, '👨 Erkek')),
        h('div', { class: 'sec' }, 'Ten rengi'), swatches(SKIN_TONES, 'skin'),
        h('div', { class: 'sec' }, 'Vücut yapısı'), (() => { const r = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: look.build }) as HTMLInputElement; r.oninput = () => { look.build = +r.value; this.game.showPreview(look, name.value); }; return r; })(),
        h('div', { class: 'sec' }, 'Saç modeli'), opts('hair', 'hair'), swatches(HAIR_COLORS, 'hairColor'),
        h('div', { class: 'sec' }, 'Üst'), opts('top', 'top'), swatches(PALETTE, 'topColor'),
        h('div', { class: 'sec' }, 'Alt'), opts('bottom', 'bottom'), swatches(PALETTE, 'bottomColor'),
        h('div', { class: 'sec' }, 'Şapka'), opts('hat', 'hat'),
        h('div', { class: 'sec' }, 'Gözlük'), opts('glasses', 'glasses'),
        h('div', { class: 'sec' }, 'Ayakkabı'), opts('shoes', 'shoes'), swatches(PALETTE, 'shoesColor'),
        h('div', { class: 'sec' }, 'Aksesuar'), opts('acc', 'acc'),
        h('div', { class: 'row', style: 'margin-top:10px' },
          h('button', { class: 'btn pri', onclick: () => { this.look = look; localStorage.setItem('mk_look', JSON.stringify(look)); this.net.send(this.game.inRoom ? { t: 'act', k: 'equip', look, name: name.value } : { t: 'profile', look, name: name.value }); this.toast('Karakter kaydedildi ✨'); this.back(); } }, '💾 Kaydet'),
          h('button', { class: 'btn', onclick: () => { look.skin = SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)]; look.topColor = PALETTE[Math.floor(Math.random() * PALETTE.length)]; look.bottomColor = PALETTE[Math.floor(Math.random() * PALETTE.length)]; look.hairColor = HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)]; const free = (s: string) => COSMETICS.filter(c => c.slot === s && (c.price === 0 || owned.includes(c.id))); for (const s of ['hair', 'top', 'bottom', 'hat', 'glasses', 'shoes', 'acc']) { const l = free(s); (look as any)[s] = l[Math.floor(Math.random() * l.length)].id; } look.build = Math.random(); upd(); } }, '🎲 Rastgele'),
          h('button', { class: 'btn', onclick: () => this.back() }, 'Geri')));
    };
    render();
    this.layer.append(h('div', { class: 'creator glass' }, h('h2', { style: 'margin:0 0 8px' }, '🧑 Karakterim'), body));
  }
  back() { if (this.game.inRoom) this.showHUD(); else this.showMenu(); }

  // ================================================================ HUD
  showHUD() {
    this.clear(); this.game.menuMode = false;
    const g = this.game;
    this.nameEl = h('b', {}, g.me.name); this.coinsEl = h('span', { class: 'coins' }, `🪙 ${g.prof?.coins ?? 0} SL`); this.pingEl = h('span', { class: 'muted' }, '');
    this.envEl = h('span', { class: 'muted' }, '');
    this.tipsyEl = h('div', { class: 'tipsy glass hud-chip', style: 'flex-direction:column;align-items:stretch;gap:4px' });
    const tl = h('div', { class: 'hud-tl' },
      h('div', { class: 'hud-chip glass' }, this.nameEl, this.coinsEl),
      h('div', { class: 'hud-chip glass', style: 'font-size:12px' }, this.envEl, this.pingEl), this.tipsyEl);
    this.minimap = h('canvas', { class: 'minimap', width: 300, height: 300 }) as HTMLCanvasElement;
    this.minimap.onclick = () => this.showPlayers();
    const tr = h('div', { class: 'hud-tr' }, this.minimap,
      h('div', { class: 'row' },
        h('button', { class: 'rb', title: 'Yakındaki oyuncular', onclick: () => this.showPlayers() }, '👥'),
        h('button', { class: 'rb', title: 'Davet et', onclick: () => this.showInvite() }, '🔗'),
        h('button', { class: 'rb', title: 'Menü (ESC)', onclick: () => this.showPause() }, '☰')));
    this.micBtn = h('button', { class: 'rb', title: 'Mikrofon (M) · Bas-konuş: V', onclick: () => this.toggleMic() }, '🎙️');
    const ptt = h('button', { class: 'rb', title: 'Bas-konuş (basılı tut)' }, '🗣️');
    ptt.addEventListener('pointerdown', () => { if (!this.voice.micOn) this.toggleMic(); this.voice.setPTTDown(true); ptt.classList.add('on'); });
    const pttUp = () => { this.voice.setPTTDown(false); ptt.classList.remove('on'); };
    ptt.addEventListener('pointerup', pttUp); ptt.addEventListener('pointerleave', pttUp);
    this.actBtn = h('button', { class: 'rb big', onclick: () => this.doInteract() }, '✋');
    const br = h('div', { class: 'hud-br' },
      h('div', { class: 'btnrow' }, this.micBtn, ...(this.voice.ptt ? [ptt] : []), h('button', { class: 'rb', title: 'Ses aç/kapat', onclick: (e: Event) => { this.voice.setDeafened(!this.voice.deafened); (e.currentTarget as El).textContent = this.voice.deafened ? '🔇' : '🔊'; } }, this.voice.deafened ? '🔇' : '🔊')),
      h('div', { class: 'btnrow' },
        h('button', { class: 'rb', title: 'Emote (B)', onclick: () => this.showEmotes() }, '😄'),
        h('button', { class: 'rb', title: 'Envanter (I)', onclick: () => this.showInventory() }, '🎒'),
        h('button', { class: 'rb', title: 'Yiyecek & İçecek', onclick: () => this.showShop('icecek') }, '🍹')),
      h('div', { class: 'btnrow' },
        h('button', { class: 'rb', title: 'Aktiviteler', onclick: () => this.showActivities() }, '🎯'),
        h('button', { class: 'rb', title: 'Zıpla / Kalk (Space)', onclick: () => this.game.jump() }, '⤴️'),
        this.actBtn));
    const joy = h('div', { class: 'joy' }, h('i'));
    this.bindJoystick(joy);
    const chatBtn = h('button', { class: 'rb', style: 'position:absolute;left:12px;top:50%;', title: 'Yazılı sohbet (Enter)', onclick: () => this.openChat() }, '💬');
    this.hud = h('div', {}, tl, tr, br, joy, chatBtn, this.promptEl, this.chatBox);
    this.layer.append(this.hud);
    this.refreshMic(); this.refreshTipsy();
  }
  bindJoystick(joy: El) {
    const knob = joy.querySelector('i') as El; let id = -1;
    const set = (e: PointerEvent) => {
      const r = joy.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2); const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      this.game.joy.x = dx; this.game.joy.y = dy; this.game.joy.active = true; knob.style.transform = `translate(${dx * 40}px,${dy * 40}px)`;
    };
    joy.addEventListener('pointerdown', (e) => { id = e.pointerId; joy.setPointerCapture(id); set(e); this.audio.resume(); });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e: PointerEvent) => { if (e.pointerId !== id) return; id = -1; this.game.joy.active = false; this.game.joy.x = this.game.joy.y = 0; knob.style.transform = ''; };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
  }
  async toggleMic() {
    this.audio.resume();
    if (this.voice.micOn) { this.voice.disableMic(); this.toast('🎙️ Mikrofon kapandı'); }
    else { const err = await this.voice.enableMic(); if (err) this.toast(err, 'warn'); else this.toast(this.voice.ptt ? '🎙️ Bas-konuş: V tuşu / 🗣️ düğmesi' : '🎙️ Mikrofon açık — yakınındakiler seni duyuyor'); }
  }
  refreshMic() {
    if (!this.micBtn) return;
    this.micBtn.className = 'rb ' + (this.voice.micOn ? 'on' : 'off') + (this.voice.speaking ? ' speak' : '');
    this.micBtn.textContent = this.voice.micOn ? '🎙️' : '🎙️';
  }
  refreshTipsy() {
    if (!this.tipsyEl) return;
    const g = this.game; const show = g.settings.showTipsy && g.me.tipsy > 0.05;
    this.tipsyEl.style.display = show ? '' : 'none';
    if (show) { this.tipsyEl.innerHTML = ''; this.tipsyEl.append(h('div', { class: 'row', style: 'justify-content:space-between;font-size:12px' }, h('span', {}, '🥴 Keyif'), h('b', {}, TIPSY_LEVELS[g.me.level].name)), h('div', { class: 'bar2' }, h('i', { style: `width:${(g.me.tipsy / TIPSY_MAX) * 100}%` }))); }
  }
  hudTick() {
    const g = this.game; if (!this.hud || !g.inRoom) return;
    this.coinsEl.textContent = `🪙 ${g.prof?.coins ?? 0} SL`;
    const hr = g.hourNow(); const hh = Math.floor(hr), mm = Math.floor((hr - hh) * 60);
    const wx: Record<string, string> = { gunesli: '☀️', ruzgarli: '🌬️', bulutlu: '☁️', yagmurlu: '🌧️', firtina: '⛈️' };
    this.envEl.textContent = `${wx[g.env.weather] ?? ''} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${g.room?.name ?? ''}`;
    this.pingEl.textContent = ` · ${Math.round(this.net.ping)} ms · ${Math.round(g.fps)} fps`;
    // istem
    const it = g.interact;
    if (it && !this.modal) { this.promptEl.style.display = ''; this.promptEl.innerHTML = ''; this.promptEl.append(h('kbd', {}, it.kind === 'reel' ? 'Space' : 'E'), it.label); this.actBtn.textContent = it.kind === 'reel' ? '🎣' : it.kind === 'seat' ? '🪑' : it.kind === 'stand' ? '🧍' : it.kind === 'fish' ? '🎣' : it.kind === 'grill' ? '🔥' : it.kind === 'tree' ? '🍊' : it.kind === 'splash' ? '💦' : '✋'; }
    else { this.promptEl.style.display = 'none'; this.actBtn.textContent = '✋'; }
    // çek düğmesi
    const bite = g.me.fishing?.state === 'bite';
    if (bite && !this.reelBtn) { this.reelBtn = h('button', { class: 'reel', onclick: () => { this.game.reel(); } }, 'ÇEK!'); this.root.append(this.reelBtn); }
    if (!bite && this.reelBtn) { this.reelBtn.remove(); this.reelBtn = null; }
    this.refreshMic();
    this.drawMinimap();
  }
  drawMinimap() {
    const c = this.minimap; if (!c) return; const g = c.getContext('2d')!; const W = 300, S = 2.2; const me = this.game.me.pos;
    const tx = (x: number) => W / 2 + (x - me.x) * S, tz = (z: number) => W / 2 + (z - me.z) * S;
    g.save(); g.fillStyle = '#e9d6ae'; g.fillRect(0, 0, W, W);
    g.fillStyle = '#2a8bb0'; g.fillRect(0, 0, W, tz(-17.5)); g.fillStyle = '#5ea3c0'; g.fillRect(0, tz(-17.5) - 6, W, 6);
    g.fillStyle = '#7aa64a'; g.fillRect(tx(-40), tz(10), 80 * S, 52 * S);
    g.fillStyle = '#f4f0e8'; g.fillRect(tx(VILLA.x0), tz(VILLA.z0), (VILLA.x1 - VILLA.x0) * S, (VILLA.z1 - VILLA.z0) * S);
    g.fillStyle = '#4fd0e8'; g.fillRect(tx(POOL.x0), tz(POOL.z0), (POOL.x1 - POOL.x0) * S, (POOL.z1 - POOL.z0) * S);
    g.fillStyle = '#8a6440'; g.fillRect(tx(PIER.x0), tz(PIER.z0), (PIER.x1 - PIER.x0) * S, (PIER.z1 - PIER.z0) * S);
    g.fillStyle = '#c0392b'; g.beginPath(); g.arc(tx(GRILL.x), tz(GRILL.z), 5, 0, 7); g.fill();
    g.fillStyle = '#2f6a24'; for (const t of TREES) { g.beginPath(); g.arc(tx(t.x), tz(t.z), 4, 0, 7); g.fill(); }
    g.fillStyle = '#ffd166'; for (const s of FISH_SPOTS) { g.beginPath(); g.arc(tx(s.x), tz(s.z), 3, 0, 7); g.fill(); }
    g.fillStyle = '#7a4a22'; g.fillRect(tx(BAR.x - 2), tz(BAR.z - 0.5), 4 * S, 2 * S);
    for (const r of this.game.players.values()) { g.fillStyle = r.speaking ? '#3ddc97' : '#ffffff'; g.strokeStyle = '#000'; g.beginPath(); g.arc(tx(r.pos.x), tz(r.pos.z), 5, 0, 7); g.fill(); g.stroke(); }
    g.translate(W / 2, W / 2); g.rotate(-this.game.me.ry + Math.PI); g.fillStyle = '#ff5e3a'; g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(-7, 8); g.closePath(); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    g.restore();
  }

  // ================================================================ etkileşim
  doInteract(it = this.game.interact) {
    const g = this.game; if (!it || !g.inRoom) return;
    this.audio.resume();
    switch (it.kind) {
      case 'seat': g.sitOn(it.data); break;
      case 'stand': g.stand(); break;
      case 'fish': this.showFishing(); break;
      case 'recast': this.showFishing(); break;
      case 'reel': g.reel(); break;
      case 'splash': g.act({ k: 'splash' }); g.playAction('splash', 1.2); break;
      case 'grill': this.showGrill(); break;
      case 'tree': { const n = g.world.treeFruits.get(it.key)?.filter(f => f.visible).length ?? 0; if (!n) { this.toast('Olgun meyve kalmadı, biraz bekle 🌱', 'warn'); break; } g.playAction('pick', 1.4, true); setTimeout(() => { g.act({ k: 'pick', tree: it.key }); this.audio.play('pick'); }, 500); break; }
      case 'bar': this.showShop('icecek'); break;
      case 'fridge': this.showFridge(); break;
      case 'tv': g.act({ k: 'tv' }); break;
      case 'radio': this.showRadio(); break;
      case 'shower': g.act({ k: 'shower' }); g.playAction('shower', 5, true); this.toast('🚿 Serinledin! (Keyif biraz azaldı)'); break;
      case 'door': g.act({ k: 'door', id: it.key }); this.audio.play('door'); break;
      case 'pickup': g.act({ k: 'pickup', pid: it.key }); break;
      case 'player': this.showPlayerMenu(it.key); break;
      case 'pool': g.dive(); break;
    }
  }
  showActivities() {
    const g = this.game;
    const acts: [string, string, () => void][] = [
      ['🧘', 'Yere bağdaş kur', () => g.sitGround()],
      ['🪑', 'Kalk', () => g.stand()],
      ['💃', 'Dans et', () => g.emote('dans')],
      ['🥂', 'Kadeh kaldır', () => g.emote('kadeh')],
      ['📱', 'Telefonla konuş', () => g.emote('telefon')],
      ['😴', 'Uyu', () => g.emote('uyu')],
      ['🎣', 'Balık noktası bul', () => this.toast('🎣 İskele ucu, kayalık ve kıyı balık noktalarıdır (haritada sarı)')],
      ['🏊', 'Havuza atla', () => g.dive()],
      ['💦', 'Su sıçrat (yüzerken F)', () => { if (g.me.swim) { g.act({ k: 'splash' }); g.playAction('splash', 1.2); } else this.toast('Önce suya gir 🌊', 'warn'); }],
      ['🏅', 'Görevler', () => this.showQuests()],
      ['🏆', 'Yarışmalar', () => this.showContests()],
      ['💬', 'Yazılı sohbet', () => this.openChat()],
    ];
    this.openModal('Aktiviteler', h('div', { class: 'emotes' }, ...acts.map(([i, n, f]) => h('button', { onclick: () => { this.closeModal(); f(); } }, h('span', {}, i), n))));
  }

  // ================================================================ envanter
  showInventory() {
    const g = this.game; const p = g.prof; if (!p) return;
    const cats = ['Tümü', 'Balık', 'Yiyecek', 'İçecek', 'Alkollü içecek', 'Meyve', 'Olta', 'Balık yemi', 'Diğer eşyalar'];
    const render = () => {
      const tabs = h('div', { class: 'tabs' }, ...cats.map(c => h('button', { class: c === this.invTab ? 'on' : '', onclick: () => { this.invTab = c; body.replaceWith(render()); } }, c)));
      const inv: InvItem[] = this.game.prof.inv.filter((i: InvItem) => this.invTab === 'Tümü' || itemCategory(i.id) === this.invTab).filter((i: InvItem) => g.settings.alcohol || itemCategory(i.id) !== 'Alkollü içecek');
      const items = h('div', { class: 'items' }, ...inv.map(it => this.itemCard(it)));
      const cos = this.invTab === 'Tümü' || this.invTab === 'Diğer eşyalar' ? h('div', { class: 'muted', style: 'margin-top:10px' }, `Sahip olunan kıyafet/emote: ${p.owned.filter((o: string) => !o.startsWith('olta')).map((o: string) => itemName(o)).join(', ') || '-'}`) : null;
      const body = h('div', {}, h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:8px' }, h('span', { class: 'coins' }, `🪙 ${this.game.prof.coins} SL`), h('span', { class: 'muted' }, `${this.game.prof.inv.length}/120 eşya`)), tabs, inv.length ? items : h('p', { class: 'muted' }, 'Bu kategoride eşya yok.'), cos);
      return body;
    };
    let body = render();
    this.openModal('🎒 Envanterim', body, true);
    this.invRefresh = () => { if (this.modal?.dataset.kind === 'inv') { const nb = render(); body.replaceWith(nb); body = nb; } };
    this.modal!.dataset.kind = 'inv';
  }
  invRefresh: () => void = () => {};
  itemCard(it: InvItem): El {
    const g = this.game; const id = it.id;
    const fish = FISH.find(f => f.id === id), food = FOODS.find(f => f.id === id), drink = DRINKS.find(d => d.id === id), fruit = FRUITS.some(f => f.id === id);
    const info: string[] = [];
    if (it.w) info.push(`${it.w >= 1 ? it.w.toFixed(2) + ' kg' : Math.round(it.w * 1000) + ' g'}`);
    if (fish && it.d === undefined) info.push(`değer ${Math.max(1, Math.round(it.w! * fish.pricePerKg))} SL`);
    if (fish) info.push(fish.rarity);
    if (it.d !== undefined) info.push(['Çiğ', 'Az pişmiş', 'Tam kıvamında', 'Biraz yanık', 'Kömür'][it.d]);
    if (drink) info.push(`${it.sv ?? 0}/${drink.sips} yudum` + (drink.bottle && it.n ? ` · şişede ${it.n} kadeh` : ''));
    if (it.n && !drink) info.push(`x${it.n}`);
    const btn = (t: string, f: () => void, cls = '') => h('button', { class: 'btn sm ' + cls, onclick: () => { f(); } }, t);
    const acts: El[] = [];
    const held = g.me.held?.uid === it.uid;
    if (g.inRoom) {
      if (drink) { acts.push(btn('İç', () => { this.closeModal(); g.drink(it.uid); }, 'pri')); acts.push(btn(drink.bottle && it.n ? 'Doldur' : `Doldur (${drink.price})`, () => { this.closeModal(); g.refill(it.uid); })); acts.push(btn('Masaya koy', () => { g.placeDrink(it.uid); this.closeModal(); })); }
      if ((food || fish) && it.d !== undefined || fruit) acts.push(btn('Ye', () => { this.closeModal(); g.eat(it.uid); }, 'pri'));
      if ((food || fish) && it.d === undefined) acts.push(btn('Mangala koy', () => { if (Math.hypot(g.me.pos.x - GRILL.x, g.me.pos.z - GRILL.z) > 4) { this.toast('Mangala yaklaş 🔥', 'warn'); return; } g.act({ k: 'grill.put', uid: it.uid }); }));
      if (fish && it.d === undefined) acts.push(btn('Göster', () => { this.closeModal(); g.setHeld(it.uid); g.playAction('balikgoster', 3); }));
      if (FURNITURE.some(f => f.id === id)) acts.push(btn('Yere koy', () => { g.act({ k: 'placeFurn', uid: it.uid }); this.closeModal(); }, 'pri'));
      if (!RODS.some(r => r.id === id) && !BAITS.some(b => b.id === id) && !FURNITURE.some(f => f.id === id)) acts.push(btn(held ? 'Bırak' : 'Eline al', () => { g.setHeld(held ? null : it.uid); this.invRefresh(); }));
      if (!RODS.some(r => r.id === id) || id !== 'olta_bambu') acts.push(btn('İkram et', () => this.pickPlayer(pid => g.give(it.uid, pid))));
    }
    if ((fish && it.d === undefined) || fruit) acts.push(btn('Sat', () => g.act({ k: 'sell', uid: it.uid }), 'ok'));
    return h('div', { class: 'item' + (held ? ' sel' : '') }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { class: 'ic' }, icon(id)), fish ? h('span', { class: 'tag', style: `background:${RARITY_COLOR[fish.rarity as Rarity]};color:#111` }, fish.rarity) : null),
      h('div', { class: 'nm' }, itemName(id)), h('div', { class: 'muted' }, info.join(' · ') || itemCategory(id)), h('div', { class: 'act' }, ...acts));
  }
  pickPlayer(cb: (id: string) => void) {
    const near = [...this.game.players.values()].map(r => ({ r, d: r.pos.distanceTo(this.game.me.pos) })).sort((a, b) => a.d - b.d);
    if (!near.length) { this.toast('Yakında kimse yok 🙂', 'warn'); return; }
    this.openModal('Kime ikram edeceksin?', h('div', { class: 'list' }, ...near.map(({ r, d }) => h('div', { class: 'li' }, h('div', { class: 'grow' }, h('b', {}, r.name), h('div', { class: 'muted' }, `${d.toFixed(1)} m`)), h('button', { class: 'btn sm pri', disabled: d > 5 ? 'true' : undefined, onclick: () => { cb(r.id); this.closeModal(); } }, d > 5 ? 'Uzak' : 'İkram et')))));
  }

  // ================================================================ mağaza
  showShop(cat?: ShopCat) {
    if (cat) this.shopTab = cat;
    const g = this.game;
    const cats: [ShopCat, string][] = [['icecek', '🥤 İçecek'], ['alkol', '🍷 Alkollü'], ['yiyecek', '🍖 Yiyecek'], ['olta', '🎣 Olta'], ['yem', '🪱 Yem'], ['kiyafet', '👕 Kıyafet'], ['esya', '🪑 Eşya'], ['emote', '💃 Emote']];
    const visible = cats.filter(([c]) => c !== 'alkol' || g.settings.alcohol);
    const render = (): El => {
      const list = shopItems().filter(s => s.cat === this.shopTab);
      const owned: string[] = g.prof?.owned ?? [];
      return h('div', {},
        h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:8px' }, h('span', { class: 'coins' }, `🪙 ${g.prof?.coins ?? 0} SL`), this.shopTab === 'alkol' ? h('span', { class: 'muted' }, '🔞 Yetişkinlere yönelik, tamamen sanal ve isteğe bağlı. Gerçek para yok.') : null),
        h('div', { class: 'tabs' }, ...visible.map(([c, n]) => h('button', { class: c === this.shopTab ? 'on' : '', onclick: () => { this.shopTab = c; this.showShop(); } }, n))),
        this.shopTab === 'alkol' && !g.alcoholRoom ? h('p', { class: 'muted' }, 'Bu odada oda sahibi alkollü içecekleri kapattı.') : null,
        h('div', { class: 'items' }, ...list.map(s => {
          const have = owned.includes(s.id);
          const dd = DRINKS.find(d => d.id === s.id); const rod = RODS.find(r => r.id === s.id); const bait = BAITS.find(b => b.id === s.id);
          const desc = dd?.desc ?? rod?.desc ?? bait?.desc ?? (FOODS.some(f => f.id === s.id) ? `Mangalda ~${FOODS.find(f => f.id === s.id)!.cook * 2} sn` : '');
          return h('div', { class: 'item' }, h('span', { class: 'ic' }, icon(s.id)), h('div', { class: 'nm' }, s.name), h('div', { class: 'muted' }, desc), h('div', { class: 'act' },
            h('button', { class: 'btn sm pri', disabled: have ? 'true' : undefined, onclick: () => { this.net.send({ t: 'act', k: 'buy', id: s.id }); if (!g.inRoom) this.toast('Satın almak için bir odada olmalısın', 'warn'); } }, have ? 'Sende var' : `${s.price} SL`),
            ...(['icecek', 'alkol', 'yiyecek'].includes(s.cat) ? [h('button', { class: 'btn sm', onclick: () => this.net.send({ t: 'act', k: 'buy', id: s.id, qty: 3 }) }, 'x3')] : [])));
        })));
    };
    this.openModal('🛍️ Mağaza & Büfe', render(), true);
    this.modal!.dataset.kind = 'shop';
  }
  showAdultGate() {
    this.openModal('🔞 Yaş onayı', h('div', { class: 'col' },
      h('p', {}, 'Alkollü içecekler yetişkinlere yönelik, tamamen sanal ve isteğe bağlı bir oyun mekaniğidir. Gerçek alkol satışı veya teşviki yoktur. 18 yaşından büyük müsün?'),
      h('div', { class: 'row' }, h('button', { class: 'btn pri', onclick: () => { this.net.send({ t: 'act', k: 'adult', on: true }); this.closeModal(); this.toast('Onaylandı. Şerefe! 🥂'); } }, 'Evet, 18 yaşından büyüğüm'),
        h('button', { class: 'btn', onclick: () => { this.game.settings.alcohol = false; this.saveSettings(); this.closeModal(); this.toast('Alkollü içecekler gizlendi'); } }, 'Hayır / Gizle'))));
  }
  showFridge() {
    this.game.act({ k: 'fridge', id: 'su' }); this.closeModal();
    this.openModal('🧊 Buzdolabı (ev ikramı)', h('div', { class: 'emotes' }, ...['su', 'ayran', 'kola', 'gazoz'].map(id => h('button', { onclick: () => { this.game.act({ k: 'fridge', id }); this.closeModal(); } }, h('span', {}, icon(id)), itemName(id)))));
  }

  // ================================================================ emote
  showEmotes() {
    const g = this.game; const owned: string[] = g.prof?.owned ?? [];
    this.openModal('😄 Emote', h('div', { class: 'emotes' }, ...EMOTES.filter(e => g.settings.alcohol || e.id !== 'sarhosdans').map(e => {
      const lock = e.price > 0 && !owned.includes(e.id);
      return h('button', { class: lock ? 'lock' : '', onclick: () => { if (lock) { this.shopTab = 'emote'; this.showShop(); return; } this.closeModal(); g.emote(e.id); } }, h('span', {}, e.icon), e.name + (lock ? ` (${e.price} SL)` : ''));
    })));
  }

  // ================================================================ balık
  showFishing() {
    const g = this.game; const p = g.prof;
    const rods = RODS.filter(r => r.price === 0 || p.inv.some((i: InvItem) => i.id === r.id));
    const baits = p.inv.filter((i: InvItem) => BAITS.some(b => b.id === i.id) && (i.n ?? 0) > 0);
    let rod = localStorage.getItem('mk_rod') ?? rods[0].id; if (!rods.some(r => r.id === rod)) rod = rods[0].id;
    let bait: string | null = localStorage.getItem('mk_bait'); if (!baits.some((b: InvItem) => b.id === bait)) bait = baits[0]?.id ?? null;
    const body = h('div', { class: 'col' });
    const render = () => {
      body.innerHTML = '';
      body.append(
        h('div', { class: 'sec' }, '1. Olta seç'), h('div', { class: 'opts' }, ...rods.map(r => h('button', { class: r.id === rod ? 'on' : '', title: r.desc, onclick: () => { rod = r.id; render(); } }, '🎣 ' + r.name))),
        h('div', { class: 'sec' }, '2. Yem seç'), h('div', { class: 'opts' }, h('button', { class: bait === null ? 'on' : '', onclick: () => { bait = null; render(); } }, 'Yemsiz (yavaş)'), ...baits.map((b: InvItem) => h('button', { class: b.id === bait ? 'on' : '', onclick: () => { bait = b.id; render(); } }, `${icon(b.id)} ${itemName(b.id)} x${b.n}`))),
        baits.length ? '' : h('div', { class: 'muted' }, 'Yemin bitmiş — mağazadan alabilirsin.'),
        h('div', { class: 'row' }, h('button', { class: 'btn pri', onclick: () => { localStorage.setItem('mk_rod', rod); if (bait) localStorage.setItem('mk_bait', bait); this.closeModal(); g.startFishing(rod, bait); } }, '🎣 Oltayı At'),
          h('button', { class: 'btn', onclick: () => { this.shopTab = 'yem'; this.showShop(); } }, '🪱 Yem al'),
          g.me.fishing ? h('button', { class: 'btn', onclick: () => { g.endFishingLocal(true); this.closeModal(); } }, 'Bırak') : null),
        h('p', { class: 'muted' }, 'Şamandıra batınca ekranda "ÇEK!" çıkar — Space / E / ÇEK düğmesi ile zamanında çek. Erken çekersen balık ürker. Akşam ve gece lüfer, kalamar daha çok çıkar!'));
    };
    render();
    this.openModal('🎣 Balık Tutma', body);
  }
  showCatch(m: any) {
    this.catchEl?.remove();
    const col = RARITY_COLOR[m.rarity as Rarity] ?? '#fff';
    const w = m.w >= 1 ? `${m.w.toFixed(2)} kg` : `${Math.round(m.w * 1000)} g`;
    this.catchEl = h('div', { class: 'catch glass np', style: `border-color:${col}` },
      h('div', { class: 'rar', style: `color:${col}` }, m.rarity), h('div', { style: 'font-size:46px' }, icon(m.fish)),
      h('h3', {}, m.fishName), h('div', {}, `🎣 ${m.name} · ⚖️ ${w}`), h('div', { class: 'coins', style: 'margin-top:6px' }, `Değeri ${m.value} SL · Ödül +${m.bonus} SL`));
    this.root.append(this.catchEl);
    const el = this.catchEl; setTimeout(() => { el.style.transition = 'opacity .6s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 600); }, 4200);
  }

  // ================================================================ mangal
  showGrill() {
    const g = this.game; g.me.inGrill = true;
    const content = h('div', { class: 'col' });
    const render = () => {
      if (!this.side) return;
      content.innerHTML = '';
      const raw = (g.prof?.inv ?? []).filter((i: InvItem) => (FOODS.some(f => f.id === i.id) || FISH.some(f => f.id === i.id)) && i.d === undefined);
      content.append(
        h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', {}, '🔥 Mangal'), h('button', { class: 'x btn sm', onclick: () => this.closeSide() }, '✕')),
        g.grill.lit ? h('div', { class: 'muted' }, 'Kor hazır. Ürünü koy, zamanında çevir, kıvamında al!') : h('button', { class: 'btn pri', onclick: () => g.act({ k: 'grill.light' }) }, '🔥 Mangalı yak'),
        h('div', { class: 'grill-slots' }, ...new Array(10).fill(0).map((_, i) => {
          const s = g.grill.slots[i]; if (!s) return h('div', { class: 'slot', style: 'opacity:.5;align-items:center;justify-content:center' }, 'boş');
          const c = g.grillCook(i)!; const def = cookDef(s.id);
          const pct = Math.min(100, (Math.min(c.a, c.b) / def.cook) * 100);
          const mine = s.owner === g.me.id;
          return h('div', { class: 'slot' + (mine ? ' mine' : '') }, h('div', {}, icon(s.id) + ' ' + itemName(s.id)), h('div', { class: 'muted', style: 'font-size:10px' }, mine ? 'senin' : s.ownerName),
            h('div', { class: 'bar2' }, h('i', { style: `width:${pct}%` })), h('div', { style: `font-size:10px;color:${c.dn.level === 2 ? '#3ddc97' : c.dn.level >= 3 ? '#ff7a5a' : '#fff'}` }, (c.dn.level === 0 && Math.max(c.a, c.b) / def.cook > 0.85 ? '🔄 Çevirme zamanı!' : c.dn.label) + ` · alt: ${s.side ? 'B' : 'A'}`),
            h('button', { class: 'btn', onclick: () => { g.act({ k: 'grill.flip', slot: i }); this.audio.play('sizzle'); } }, '🔄 Çevir'),
            mine ? h('button', { class: 'btn ok', onclick: () => g.act({ k: 'grill.take', slot: i }) }, '🍽️ Al') : null);
        })),
        h('div', { class: 'sec' }, 'Mangala koy'),
        raw.length ? h('div', { class: 'opts' }, ...raw.map((i: InvItem) => h('button', { onclick: () => g.act({ k: 'grill.put', uid: i.uid }) }, `${icon(i.id)} ${itemName(i.id)}${i.w ? ` (${i.w < 1 ? Math.round(i.w * 1000) + 'g' : i.w.toFixed(1) + 'kg'})` : ''}`))) : h('div', { class: 'muted' }, 'Çiğ yiyecek ya da balık yok.'),
        h('button', { class: 'btn', onclick: () => this.showShop('yiyecek') }, '🛒 Et, sebze al'));
    };
    this.openSide(content); render();
    this.grillRefresh = render;
    const iv = setInterval(() => { if (!this.side || !g.me.inGrill) { clearInterval(iv); return; } if (Math.hypot(g.me.pos.x - GRILL.x, g.me.pos.z - GRILL.z) > 5) { this.closeSide(); clearInterval(iv); return; } render(); }, 500);
  }
  grillRefresh: () => void = () => {};

  // ================================================================ radyo + oda sahibi
  showRadio() {
    const g = this.game; const host = g.isHost(); const m = g.env.music;
    this.openModal('📻 Sahil Radyosu', h('div', { class: 'col' },
      h('p', {}, `Şu an: ${m.on ? '▶️ ' + STATIONS[m.station] : '⏸️ Kapalı'}`),
      host ? h('div', { class: 'opts' }, ...STATIONS.map((s, i) => h('button', { class: m.on && m.station === i ? 'on' : '', onclick: () => { this.net.send({ t: 'host', cmd: 'music', on: true, station: i }); this.closeModal(); } }, s)), h('button', { onclick: () => { this.net.send({ t: 'host', cmd: 'music', on: !m.on, station: m.station }); this.closeModal(); } }, m.on ? '⏸️ Kapat' : '▶️ Aç'))
        : h('p', { class: 'muted' }, 'İstasyonu oda sahibi değiştirebilir. Müzik sesini Ayarlar\'dan kendine göre ayarlayabilirsin.'),
      h('p', { class: 'muted' }, 'Tüm müzikler oyun içinde gerçek zamanlı üretilir (telif sorunu yok). Konuşma başladığında müzik otomatik kısılır.')));
  }
  showHost() {
    const g = this.game; if (!g.isHost()) { this.toast('Oda sahibi paneli yalnızca oda sahibine açık', 'warn'); return; }
    const hour = h('input', { type: 'range', min: 0, max: 23.9, step: 0.25, value: g.hourNow() }) as HTMLInputElement;
    const hl = h('span', {}, ''); const upd = () => (hl.textContent = `${Math.floor(+hour.value)}:${String(Math.round((+hour.value % 1) * 60)).padStart(2, '0')}`); upd();
    hour.oninput = upd; hour.onchange = () => this.net.send({ t: 'host', cmd: 'time', v: +hour.value });
    const pass = h('input', { type: 'password', placeholder: 'Yeni şifre (boş = şifresiz)' }) as HTMLInputElement;
    this.openModal('👑 Oda Sahibi Paneli', h('div', { class: 'col' },
      h('div', { class: 'sec' }, 'Zaman'), h('div', { class: 'row' }, hour, hl),
      h('div', { class: 'opts' }, ...[['🌅 Sabah', 7.5], ['☀️ Öğlen', 13], ['🌇 Gün batımı', 19.2], ['🌙 Gece', 22.5]].map(([n, v]) => h('button', { onclick: () => this.net.send({ t: 'host', cmd: 'time', v }) }, n as string)),
        h('button', { onclick: () => this.net.send({ t: 'host', cmd: 'timeRate', v: g.env.rate === 0 }) }, g.env.rate === 0 ? '▶️ Zamanı akıt' : '⏸️ Zamanı durdur')),
      h('div', { class: 'sec' }, 'Hava durumu'),
      h('div', { class: 'opts' }, ...[['gunesli', '☀️ Güneşli'], ['ruzgarli', '🌬️ Rüzgârlı'], ['bulutlu', '☁️ Bulutlu'], ['yagmurlu', '🌧️ Yağmurlu'], ['firtina', '⛈️ Fırtına']].map(([v, n]) => h('button', { class: g.env.weather === v ? 'on' : '', onclick: () => this.net.send({ t: 'host', cmd: 'weather', v, lock: true }) }, n))),
      h('div', { class: 'sec' }, 'Radyo'), h('button', { class: 'btn', onclick: () => this.showRadio() }, '📻 Radyo ayarları'),
      h('div', { class: 'sec' }, 'Oda'),
      h('label', { class: 'row' }, (() => { const c = h('input', { type: 'checkbox' }) as HTMLInputElement; c.checked = g.alcoholRoom; c.onchange = () => this.net.send({ t: 'host', cmd: 'alcohol', v: c.checked }); return c; })(), 'Bu odada alkollü içecekler serbest'),
      h('div', { class: 'row' }, pass, h('button', { class: 'btn sm', onclick: () => this.net.send({ t: 'host', cmd: 'password', v: pass.value }) }, 'Şifreyi ayarla')),
      h('button', { class: 'btn', onclick: () => this.showPlayers() }, '👥 Oyuncuları yönet (çıkar)')));
  }

  // ================================================================ oyuncular
  showPlayers() {
    const g = this.game;
    const list = [...g.players.values()].map(r => ({ r, d: r.pos.distanceTo(g.me.pos) })).sort((a, b) => a.d - b.d);
    this.openModal(`👥 Oyuncular (${list.length + 1}/${g.room?.max ?? 16})`, h('div', { class: 'list' },
      h('div', { class: 'li' }, h('div', { class: 'grow' }, h('b', {}, (g.isHost() ? '👑 ' : '') + g.me.name + ' (sen)'), h('div', { class: 'muted' }, g.me.group ? '🔒 Özel sohbettesin' : 'Genel sohbet')), g.me.group ? h('button', { class: 'btn sm', onclick: () => { this.net.send({ t: 'grp.leave' }); this.closeModal(); } }, 'Özel sohbetten ayrıl') : null, g.isHost() ? h('button', { class: 'btn sm', onclick: () => this.showHost() }, '👑 Panel') : null),
      ...list.map(({ r, d }) => h('div', { class: 'li' },
        h('div', { class: 'grow' }, h('b', {}, (r.host ? '👑 ' : '') + (r.group && r.group === g.me.group ? '🔒 ' : '') + r.name), h('div', { class: 'muted' }, `${d.toFixed(0)} m · ${r.speaking ? '🔊 konuşuyor' : this.voice.connected(r.id) ? '🎧 ses bağlı' : '… ses bağlanıyor'}${r.tipsy > 1.2 ? ' · 🥴' : ''}`)),
        h('button', { class: 'btn sm', onclick: () => this.showPlayerMenu(r.id) }, '⋯')))));
  }
  showPlayerMenu(id: string) {
    const g = this.game; const r = g.players.get(id); if (!r) return;
    const muted = this.voice.muted.has(id); const blocked = g.prof?.blocked?.includes(id);
    this.openModal(r.name, h('div', { class: 'col' },
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { const inv = g.prof.inv.filter((i: InvItem) => !RODS.some(x => x.id === i.id)); this.openModal(`${r.name}'e ikram`, h('div', { class: 'items' }, ...inv.map((it: InvItem) => h('div', { class: 'item' }, h('span', { class: 'ic' }, icon(it.id)), h('div', { class: 'nm' }, itemName(it.id)), h('button', { class: 'btn sm pri', onclick: () => { g.give(it.uid, id); this.closeModal(); } }, 'İkram et'))))); } }, '🎁 İkram et'),
        h('button', { class: 'btn', onclick: () => { g.emote('cayikram'); const tea = g.prof.inv.find((i: InvItem) => i.id === 'cay'); if (tea) g.give(tea.uid, id); else this.toast('Önce bir çay al ☕ (Büfe 5 SL)', 'warn'); this.closeModal(); } }, '🫖 Çay ikram et'),
        h('button', { class: 'btn', onclick: () => { this.net.send({ t: 'grp.invite', to: id }); this.closeModal(); } }, '🔒 Özel sohbete davet')),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { if (muted) this.voice.muted.delete(id); else this.voice.muted.add(id); this.toast(muted ? 'Sesi açıldı' : `${r.name} susturuldu (sadece senin için)`); this.closeModal(); } }, muted ? '🔊 Sesini aç' : '🔇 Sustur'),
        h('button', { class: 'btn bad', onclick: () => { this.net.send({ t: 'block', id, on: !blocked }); this.voice.block(id, !blocked); if (blocked) this.voice.connect(id); this.toast(blocked ? 'Engel kaldırıldı' : `${r.name} engellendi`); this.closeModal(); } }, blocked ? 'Engeli kaldır' : '⛔ Engelle'),
        h('button', { class: 'btn', onclick: () => this.showReport(id) }, '🚩 Şikâyet et')),
      g.isHost() ? h('button', { class: 'btn bad', onclick: () => { this.net.send({ t: 'host', cmd: 'kick', id }); this.closeModal(); } }, '👢 Odadan çıkar') : null));
  }
  showReport(id: string) {
    const reason = h('input', { placeholder: 'Kısaca ne oldu?' }) as HTMLInputElement;
    this.openModal('🚩 Şikâyet', h('div', { class: 'col' }, reason, h('button', { class: 'btn bad', onclick: () => { this.net.send({ t: 'report', who: id, reason: reason.value }); this.closeModal(); } }, 'Gönder')));
  }

  // ================================================================ davet
  inviteUrl() {
    const r = this.game.room; const base = this.net.url.replace(/^ws/, 'http').replace(/\/ws$/, '/');
    return `${base}?oda=${r.id}${r.inviteKey ? '&k=' + r.inviteKey : ''}`;
  }
  showInvite() {
    const url = this.inviteUrl(); const text = `Sahile gel, mangal yanıyor! 🔥🎣 Balık bahane, muhabbet şahane! ${url}`;
    this.openModal('🔗 Arkadaşını Davet Et', h('div', { class: 'col' },
      h('p', {}, `Oda kodu: `, h('b', { style: 'font-size:22px;letter-spacing:2px' }, this.game.room?.id ?? '')),
      h('input', { value: url, readonly: 'true', onclick: (e: any) => e.target.select(), style: 'padding:10px;border-radius:10px;border:0;width:100%' }),
      h('div', { class: 'row' },
        h('button', { class: 'btn pri', onclick: async () => { try { if ((navigator as any).share) await (navigator as any).share({ title: GAME_NAME, text, url }); else { await navigator.clipboard.writeText(url); this.toast('Bağlantı kopyalandı 📋'); } } catch { /* */ } } }, '📤 Paylaş / Kopyala'),
        h('a', { class: 'btn ok', href: `https://wa.me/?text=${encodeURIComponent(text)}`, target: '_blank' }, '💬 WhatsApp'),
        h('a', { class: 'btn sea', href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Sahile gel! 🔥🎣')}`, target: '_blank' }, '✈️ Telegram')),
      h('p', { class: 'muted' }, 'Bağlantı şifreli odaya da doğrudan girer. Oda dolarsa arkadaşın bilgilendirilir.')));
  }

  // ================================================================ görevler + yarışmalar
  showQuests() {
    const p = this.game.prof; if (!p) return;
    this.openModal('🏅 Görevler (isteğe bağlı)', h('div', { class: 'list' }, ...QUESTS.map(q => {
      const v = q.stat === 'fishTypes' ? (p.stats.fishTypes?.length ?? 0) : (p.stats[q.stat] ?? 0); const done = p.quests[q.id];
      return h('div', { class: 'li' }, h('span', { style: 'font-size:22px' }, done ? '✅' : '⬜'), h('div', { class: 'grow' }, h('b', {}, q.name), h('div', { class: 'bar2', style: 'margin-top:5px' }, h('i', { style: `width:${Math.min(100, v / q.goal * 100)}%;background:linear-gradient(90deg,#3ddc97,#2bbf7f)` }))), h('span', { class: 'coins' }, `+${q.reward} SL`));
    })));
  }
  showContests(data?: any) {
    if (!data) { this.net.send({ t: 'contests' }); this.openModal('🏆 Haftalık Yarışmalar', h('p', {}, 'Yükleniyor…')); return; }
    this.openModal(`🏆 Haftalık Yarışmalar · ${data.week}`, h('div', { class: 'col' }, ...data.defs.map((d: any) => {
      const list = data.data[d.id] ?? [];
      return h('div', {}, h('div', { class: 'sec' }, d.name), list.length ? h('table', { class: 'lb', style: 'width:100%;border-collapse:collapse' }, ...list.slice(0, 5).map((e: any, i: number) => h('tr', {}, h('td', {}, ['🥇', '🥈', '🥉', '4.', '5.'][i]), h('td', {}, e.name), h('td', { style: 'text-align:right' }, `${e.v} ${d.unit}`)))) : h('div', { class: 'muted' }, 'Henüz katılım yok — ilk sen ol!'));
    })), true);
  }

  // ================================================================ ayarlar
  saveSettings() { localStorage.setItem('mk_settings', JSON.stringify(this.game.settings)); localStorage.setItem('mk_vol', JSON.stringify(this.audio.vol)); }
  showSettings() {
    const g = this.game; const s = g.settings; const a = this.audio;
    const slider = (label: string, key: keyof typeof a.vol) => { const r = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: a.vol[key] }) as HTMLInputElement; r.oninput = () => { a.vol[key] = +r.value; a.applyVolumes(); this.saveSettings(); }; return h('div', { class: 'field' }, label, r); };
    const check = (label: string, key: keyof typeof s) => { const c = h('input', { type: 'checkbox' }) as HTMLInputElement; c.checked = !!s[key]; c.onchange = () => { (s as any)[key] = c.checked; this.saveSettings(); this.refreshTipsy(); }; return h('label', { class: 'row' }, c, label); };
    const q = h('select', {}, ...['low', 'med', 'high'].map(v => h('option', { value: v, selected: s.quality === v ? 'true' : undefined }, { low: 'Düşük (eski telefonlar)', med: 'Orta', high: 'Yüksek (bilgisayar)' }[v]!))) as HTMLSelectElement;
    q.onchange = () => { s.quality = q.value as any; this.saveSettings(); this.toast('Grafik kalitesi bir sonraki açılışta uygulanır'); };
    const server = h('input', { value: this.net.url }) as HTMLInputElement;
    const user = h('input', { placeholder: 'kullanıcı adı' }) as HTMLInputElement, pass = h('input', { type: 'password', placeholder: 'şifre (min 6)' }) as HTMLInputElement;
    const sens = h('input', { type: 'range', min: 0.3, max: 2.5, step: 0.1, value: s.sens }) as HTMLInputElement; sens.oninput = () => { s.sens = +sens.value; this.saveSettings(); };
    this.openModal('⚙️ Ayarlar', h('div', { class: 'col' },
      h('div', { class: 'sec' }, 'Ses'), slider('Ana ses', 'master'), slider('Konuşma sesi', 'voice'), slider('Müzik (radyo)', 'music'), slider('Ortam (deniz, rüzgâr, martı)', 'amb'), slider('Efektler', 'sfx'),
      h('div', { class: 'sec' }, 'Mikrofon'),
      h('label', { class: 'row' }, (() => { const c = h('input', { type: 'checkbox' }) as HTMLInputElement; c.checked = this.voice.ptt; c.onchange = () => { this.voice.setPTT(c.checked); localStorage.setItem('mk_ptt', c.checked ? '1' : ''); if (g.inRoom) this.showHUD(); }; return c; })(), 'Bas-konuş modu (V tuşu / 🗣️ düğmesi)'),
      h('label', { class: 'row' }, (() => { const c = h('input', { type: 'checkbox' }) as HTMLInputElement; c.checked = this.voice.compat; c.onchange = () => { this.voice.compat = c.checked; localStorage.setItem('mk_compat', c.checked ? '1' : '0'); this.toast('Yeni bağlantılarda geçerli'); }; return c; })(), 'Ses uyumluluk modu (iPhone/iPad için önerilir)'),
      h('div', { class: 'sec' }, 'Kamera ve oynanış'),
      check('Sarhoşken kamera salınımı', 'camSway'), check('Keyif (sarhoşluk) göstergesini göster', 'showTipsy'), check('Sohbet kamerası (otururken konuşana yavaşça dön)', 'chatCam'), check('Kamerayı ters çevir (Y)', 'invertY'),
      h('div', { class: 'field' }, 'Kamera hassasiyeti', sens),
      check('Alkollü içecek içeriğini göster (18+)', 'alcohol'),
      h('div', { class: 'field' }, 'Grafik kalitesi', q),
      h('div', { class: 'sec' }, 'Hesap'),
      g.prof?.user ? h('p', {}, `Kayıtlı hesap: `, h('b', {}, g.prof.user)) : h('div', { class: 'col' }, h('p', { class: 'muted' }, 'Misafir hesabını kullanıcı adı + şifre ile kaydet; başka cihazdan da girebilirsin. Paran ve envanterin korunur.'), h('div', { class: 'row' }, user, pass, h('button', { class: 'btn sm pri', onclick: () => this.net.send({ t: 'register', user: user.value, pass: pass.value }) }, 'Kaydet'))),
      h('button', { class: 'btn', onclick: () => { localStorage.removeItem('mk_token'); location.reload(); } }, '🚪 Çıkış yap (bu cihazdan)'),
      h('div', { class: 'sec' }, 'Gelişmiş'),
      h('div', { class: 'row' }, h('div', { class: 'field', style: 'flex:1' }, 'Sunucu adresi', server), h('button', { class: 'btn sm', onclick: () => this.net.setUrl(server.value.trim()) }, 'Bağlan')),
      h('p', { class: 'muted' }, 'Kontroller: WASD hareket · Shift koş · Fare sürükle kamera · Tekerlek yakınlaştır · E etkileşim · Space zıpla/çek · C bağdaş · B emote · I envanter · M mikrofon · V bas-konuş · Enter sohbet · ESC menü')));
  }
  showPause() {
    const g = this.game;
    this.openModal('☰ Menü', h('div', { class: 'col' },
      h('div', { class: 'grid', style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' },
        h('button', { class: 'btn', onclick: () => this.showInventory() }, '🎒 Envanter'), h('button', { class: 'btn', onclick: () => this.showShop() }, '🛍️ Mağaza'),
        h('button', { class: 'btn', onclick: () => { this.closeModal(); this.showCreator(); } }, '🧑 Karakterim'), h('button', { class: 'btn', onclick: () => this.showSettings() }, '⚙️ Ayarlar'),
        h('button', { class: 'btn', onclick: () => this.showQuests() }, '🏅 Görevler'), h('button', { class: 'btn', onclick: () => this.showContests() }, '🏆 Yarışmalar'),
        h('button', { class: 'btn', onclick: () => this.showInvite() }, '🔗 Davet et'), h('button', { class: 'btn', onclick: () => this.showPlayers() }, '👥 Oyuncular'),
        g.isHost() ? h('button', { class: 'btn', onclick: () => this.showHost() }, '👑 Oda paneli') : h('button', { class: 'btn', onclick: () => this.showRadio() }, '📻 Radyo'),
        h('button', { class: 'btn bad', onclick: () => { this.net.send({ t: 'room.leave' }); this.lastRoom = null; g.leaveRoomLocal(); this.closeModal(); this.showMenu(); } }, '🚪 Odadan ayrıl'))));
  }

  // ================================================================ sohbet
  openChat() {
    if (this.chatInput) { this.chatInput.focus(); return; }
    const inp = h('input', { placeholder: 'Mesaj yaz, Enter ile gönder' + (this.game.me.group ? ' (/g özel gruba)' : ''), maxlength: 200 }) as HTMLInputElement;
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = inp.value.trim(); if (v) { const grp = v.startsWith('/g ') && !!this.game.me.group; this.net.send({ t: 'chat', text: grp ? v.slice(3) : v, group: grp }); } inp.remove(); this.chatInput = null; }
      if (e.key === 'Escape') { inp.remove(); this.chatInput = null; }
    });
    inp.addEventListener('blur', () => setTimeout(() => { inp.remove(); this.chatInput = null; }, 200));
    this.chatBox.append(inp); this.chatInput = inp; inp.focus();
  }
  addChat(m: any) {
    const el = h('div', { class: 'msg' }, h('b', {}, (m.group && m.group === this.game.me.group ? '🔒 ' : '') + m.name + ': '), m.text);
    if (this.chatInput) this.chatBox.insertBefore(el, this.chatInput); else this.chatBox.append(el);
    while (this.chatBox.querySelectorAll('.msg').length > 6) this.chatBox.querySelector('.msg')?.remove();
    setTimeout(() => { el.style.transition = 'opacity 1s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 1000); }, 12000);
  }

  // ================================================================ oyun olayları
  onGame(ev: string, d?: any) {
    const g = this.game;
    switch (ev) {
      case 'room': this.showHUD(); this.toast(`🏖️ ${g.room.name} — ${SLOGAN}`); break;
      case 'toast': this.toast(d.msg, d.kind); break;
      case 'interact': if (!this.modal) this.doInteract(); break;
      case 'doInteract': this.doInteract(d); break;
      case 'inv': this.modal ? this.closeModal() : this.showInventory(); break;
      case 'emotes': this.modal ? this.closeModal() : this.showEmotes(); break;
      case 'shop': this.modal ? this.closeModal() : this.showShop(); break;
      case 'mic': this.toggleMic(); break;
      case 'menu': if (this.modal) this.closeModal(); else if (this.side) this.closeSide(); else this.showPause(); break;
      case 'chat': this.openChat(); break;
      case 'sitground': g.me.seat ? g.stand() : g.sitGround(); break;
      case 'player': this.showPlayerMenu(d); break;
      case 'catchMine': setTimeout(() => this.showCatch(d), d.w >= 5 ? 2400 : 300); break;
      case 'catchOther': if (d.rarity !== 'yaygın' || d.w >= 2) this.toast(`🎣 ${d.name} ${d.w >= 1 ? d.w.toFixed(1) + ' kg' : Math.round(d.w * 1000) + ' g'} ${d.fishName} yakaladı! (${d.rarity})`, 'event'); break;
      case 'grill': this.grillRefresh(); break;
      case 'tipsy': this.refreshTipsy(); if (g.me.level >= 3) this.toast(`🥴 ${TIPSY_LEVELS[g.me.level].name}! Su iç ya da biraz otur 😉`, 'event'); break;
      case 'host': if (g.isHost()) this.toast('👑 Oda sahibi sensin — zaman, hava ve radyoyu yönetebilirsin'); break;
    }
  }
  onProf(p: any) {
    const prevCoins = this.game.prof?.coins;
    this.game.prof = p;
    this.game.refreshHeld();
    this.invRefresh();
    if (this.modal?.dataset.kind === 'shop') { const tab = this.shopTab; this.shopTab = tab; this.showShop(); }
    void prevCoins;
  }
}
