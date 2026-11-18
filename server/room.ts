// ======================================================================
//  Oda – yetkili (authoritative) oyun durumu
//  Ekonomi, balık tutma, mangal, içecek/sarhoşluk, meyve, eşyalar, olaylar
//  sunucuda hesaplanır; istemci yalnızca istek gönderir.
// ======================================================================
import crypto from 'node:crypto';
import {
  FISH, RODS, BAITS, FOODS, DRINKS, FRUITS, EMOTES, FURNITURE, COSMETICS, GRILL_SLOTS, doneness, RARITY_SCORE,
  TIPSY_MAX, tipsyLevel, cookDef, InvItem, shopItems, itemName, ROOM_MAX_DEFAULT,
} from '../shared/data';
import {
  fishSpotAt, TREES, GRILL, BAR, FRIDGE, SHOWER, TV, WORLD_BOUNDS, inPool, waterAt, SEATS, DOORS, floorY, WC, inVilla,
} from '../shared/world';
import { Accounts, Profile, uid, sanitizeLook, weekKey } from './accounts';
import type { StoreLike as Store } from './hub';

export interface Client {
  id: string; prof: Profile | null; room: Room | null; send(o: any): void; close(): void;
  bucket: number; lastChat: number; ip: string;
}

interface Fishing { spot: string; kind: string; castAt: number; biteAt: number; rod: string; bait: string | null; bitten: boolean; timer?: NodeJS.Timeout }
interface P {
  c: Client; prof: Profile; x: number; y: number; z: number; ry: number; a: string; it: string; s: string | null; sw: number;
  lastT: number; tipsy: number; speaking: boolean; group: string | null; fishing: Fishing | null;
  lastSip: number; lastPick: number; lastAct: number; actBucket: number; tipsySent: number; joinedAt: number; sitSince: number;
}
interface Slot { uid: string; id: string; owner: string; ownerName: string; side: 0 | 1; cookA: number; cookB: number; w?: number; burntFx?: boolean }
interface Prop { pid: string; kind: 'drink' | 'furn'; id: string; x: number; y: number; z: number; ry: number; owner: string; sv?: number; n?: number; tipped?: boolean }

const WEATHERS = ['gunesli', 'ruzgarli', 'bulutlu', 'yagmurlu', 'firtina'] as const;
const now = () => Date.now();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const d2 = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

export class Room {
  id: string; name: string; isPublic: boolean; password: string; inviteKey: string; max: number; permanent: boolean;
  hostId: string | null = null; alcohol = true;
  players = new Map<string, P>();
  slots: (Slot | null)[] = new Array(GRILL_SLOTS).fill(null);
  grillLit = true; grillLitUntil = now() + 30 * 60e3;
  trees = new Map<string, number>();
  doors: Record<string, boolean> = { wc: false };
  env = { hour: 17.5, at: now(), rate: 1 / 120, weather: 'gunesli' as string, weatherLocked: false, music: { on: true, station: 0, vol: 0.6 }, tv: false };
  props = new Map<string, Prop>();
  banned = new Set<string>();
  groups = new Map<string, Set<string>>();
  emptySince = 0;
  private nextEvent = now() + rnd(60e3, 110e3);
  private nextWeather = now() + rnd(6, 11) * 60e3;
  private lastGrillSend = 0; private grillDirty = true;

  constructor(private acc: Accounts, private store: Store, opts: { id?: string; name: string; isPublic: boolean; password?: string; max?: number; permanent?: boolean }) {
    this.id = opts.id ?? crypto.randomBytes(3).toString('hex').toUpperCase();
    this.name = opts.name; this.isPublic = opts.isPublic; this.password = opts.password ?? '';
    this.inviteKey = crypto.randomBytes(6).toString('base64url');
    this.max = Math.max(2, Math.min(32, opts.max ?? ROOM_MAX_DEFAULT));
    this.permanent = !!opts.permanent;
    for (const t of TREES) this.trees.set(t.id, t.max);
  }

  summary() { return { id: this.id, name: this.name, n: this.players.size, max: this.max, locked: !!this.password, pub: this.isPublic, host: this.hostId ? this.players.get(this.hostId)?.prof.name ?? '' : '' }; }
  hour() { return (this.env.hour + (now() - this.env.at) * this.env.rate / 1000) % 24; }
  isNight() { const h = this.hour(); return h >= 19.5 || h < 6; }

  bcast(o: any, except?: string) { const s = JSON.stringify(o); for (const [id, p] of this.players) if (id !== except) (p.c as any).raw ? (p.c as any).raw(s) : p.c.send(o); }
  note(p: P, msg: string, kind = 'info') { p.c.send({ t: 'note', msg, kind }); }
  pushProf(p: P) { p.c.send({ t: 'prof', p: this.acc.publicView(p.prof) }); this.acc.persist(p.prof); }
  pubPlayer(p: P) { return { id: p.prof.id, name: p.prof.name, look: p.prof.look, x: p.x, y: p.y, z: p.z, ry: p.ry, a: p.a, it: p.it, s: p.s, tipsy: p.tipsy, speaking: p.speaking, group: p.group, host: this.hostId === p.prof.id }; }

  // ------------------------------------------------------------------ katılım
  join(c: Client, pos?: { x: number; z: number }): string | null {
    const prof = c.prof!;
    if (this.banned.has(prof.id)) return 'Bu odadan çıkarıldınız.';
    if (this.players.size >= this.max && !this.players.has(prof.id)) return `Oda dolu (${this.players.size}/${this.max}).`;
    const old = this.players.get(prof.id);
    if (old && old.c !== c) { old.c.room = null; old.c.send({ t: 'kicked', msg: 'Başka bir cihazdan bu odaya girildi.' }); this.leave(prof.id, true); }
    let x = rnd(-4, 4), z = rnd(12, 16);
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) { x = clamp(pos.x, WORLD_BOUNDS.x0, WORLD_BOUNDS.x1); z = clamp(pos.z, WORLD_BOUNDS.z0, WORLD_BOUNDS.z1); }
    const p: P = { c, prof, x, y: floorY(x, z), z, ry: Math.PI, a: 'idle', it: '', s: null, sw: 0, lastT: now(), tipsy: prof.stats.tipsy ?? 0, speaking: false, group: null, fishing: null, lastSip: 0, lastPick: 0, lastAct: 0, actBucket: 10, tipsySent: 0, joinedAt: now(), sitSince: 0 };
    this.players.set(prof.id, p);
    c.room = this;
    if (!this.hostId || !this.players.has(this.hostId)) this.hostId = prof.id;
    this.emptySince = 0;
    c.send({
      t: 'joined', room: { ...this.summary(), inviteKey: this.inviteKey, alcohol: this.alcohol }, you: prof.id, hostId: this.hostId,
      players: [...this.players.values()].map(q => this.pubPlayer(q)),
      grill: this.grillState(), trees: Object.fromEntries(this.trees), doors: this.doors, env: this.envState(),
      props: [...this.props.values()], serverTime: now(),
    });
    this.bcast({ t: 'pj', p: this.pubPlayer(p) }, prof.id);
    this.bcast({ t: 'note', msg: `👋 ${prof.name} sahile geldi`, kind: 'join' }, prof.id);
    return null;
  }

  leave(id: string, silent = false) {
    const p = this.players.get(id); if (!p) return;
    if (p.fishing?.timer) clearTimeout(p.fishing.timer);
    p.prof.stats.tipsy = Math.round(p.tipsy * 100) / 100;
    this.acc.persist(p.prof);
    this.players.delete(id);
    if (p.group) this.leaveGroup(p);
    this.bcast({ t: 'pl', id });
    if (!silent) this.bcast({ t: 'note', msg: `${p.prof.name} ayrıldı`, kind: 'leave' });
    if (this.hostId === id) {
      const next = [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      this.hostId = next?.prof.id ?? null;
      if (next) { this.bcast({ t: 'host', id: this.hostId }); this.note(next, '👑 Artık oda sahibi sizsiniz.'); }
    }
    if (!this.players.size) this.emptySince = now();
  }

  envState() { return { ...this.env, hour: this.hour(), at: now() }; }
  grillState() { return { lit: this.grillLit, slots: this.slots, t: now() }; }

  // ------------------------------------------------------------------ envanter yardımcıları
  inv(p: P, u: string) { return p.prof.inv.find(i => i.uid === u); }
  removeInv(p: P, u: string) { const i = p.prof.inv.findIndex(x => x.uid === u); if (i >= 0) return p.prof.inv.splice(i, 1)[0]; return null; }
  addInv(p: P, it: Omit<InvItem, 'uid'>): boolean {
    if (p.prof.inv.length >= 120) { this.note(p, 'Envanter dolu! Bir şeyler sat ya da ikram et.', 'warn'); return false; }
    // yığınlanabilir: yem
    if (BAITS.some(b => b.id === it.id)) { const ex = p.prof.inv.find(i => i.id === it.id); if (ex) { ex.n = (ex.n ?? 0) + (it.n ?? 1); return true; } }
    p.prof.inv.push({ uid: uid(), ...it }); return true;
  }
  stat(p: P, k: string, inc = 1) { p.prof.stats[k] = (p.prof.stats[k] ?? 0) + inc; for (const m of this.acc.checkQuests(p.prof)) this.note(p, m, 'quest'); }
  contest(p: P, id: string, value: number, lowerBetter = false) {
    const key = 'contest:' + weekKey();
    const all = this.store.get<any>(key) ?? {};
    const list: any[] = all[id] ?? [];
    const ex = list.find(e => e.id === p.prof.id);
    if (ex) { if (lowerBetter ? value < ex.v : value > ex.v) { ex.v = value; ex.name = p.prof.name; } else return; }
    else list.push({ id: p.prof.id, name: p.prof.name, v: value });
    list.sort((a, b) => lowerBetter ? a.v - b.v : b.v - a.v);
    all[id] = list.slice(0, 15);
    this.store.set(key, all);
  }
  near(p: P, x: number, z: number, r: number) { return d2(p.x, p.z, x, z) <= r; }

  // ------------------------------------------------------------------ mesaj işleme
  handle(c: Client, m: any) {
    const p = this.players.get(c.prof!.id); if (!p) return;
    switch (m.t) {
      case 'mv': return this.move(p, m);
      case 'act': return this.act(p, m);
      case 'host': return this.hostCmd(p, m);
      case 'speak': p.speaking = !!m.on; this.bcast({ t: 'pu', id: p.prof.id, speaking: p.speaking }, p.prof.id); return;
      case 'chat': {
        const text = String(m.text ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, 200).trim();
        if (!text) return;
        if (now() - c.lastChat < 900) return this.note(p, 'Biraz yavaş, muhabbet kaçmıyor 🙂', 'warn');
        c.lastChat = now();
        const msg = { t: 'chat', from: p.prof.id, name: p.prof.name, text, group: p.group };
        if (m.group && p.group) { for (const id of this.groups.get(p.group) ?? []) this.players.get(id)?.c.send(msg); }
        else this.bcast(msg);
        return;
      }
      case 'rtc': {
        const q = this.players.get(String(m.to)); if (!q) return;
        if (q.prof.blocked.includes(p.prof.id) || p.prof.blocked.includes(q.prof.id)) return;
        q.c.send({ t: 'rtc', from: p.prof.id, d: m.d }); return;
      }
      case 'grp.invite': {
        const q = this.players.get(String(m.to)); if (!q || q === p) return;
        if (!p.group) { p.group = uid(4); this.groups.set(p.group, new Set([p.prof.id])); this.bcast({ t: 'pu', id: p.prof.id, group: p.group }); }
        q.c.send({ t: 'grp.invite', from: p.prof.id, name: p.prof.name, gid: p.group });
        this.note(p, `${q.prof.name} özel sohbete davet edildi.`); return;
      }
      case 'grp.accept': {
        const g = this.groups.get(String(m.gid)); if (!g) return this.note(p, 'Grup artık yok.');
        if (p.group) this.leaveGroup(p);
        g.add(p.prof.id); p.group = String(m.gid);
        this.bcast({ t: 'pu', id: p.prof.id, group: p.group });
        for (const id of g) this.players.get(id) && this.note(this.players.get(id)!, `🔒 ${p.prof.name} özel sohbete katıldı`);
        return;
      }
      case 'grp.leave': if (p.group) this.leaveGroup(p); return;
      case 'report': {
        const key = 'reports';
        const list = this.store.get<any[]>(key) ?? [];
        list.push({ at: new Date().toISOString(), room: this.id, by: p.prof.id, byName: p.prof.name, who: String(m.who).slice(0, 20), whoName: this.players.get(String(m.who))?.prof.name ?? '?', reason: String(m.reason ?? '').slice(0, 300) });
        this.store.set(key, list.slice(-500));
        this.note(p, 'Şikâyetiniz kaydedildi. Teşekkürler.'); return;
      }
    }
  }

  leaveGroup(p: P) {
    const g = p.group ? this.groups.get(p.group) : null;
    if (g) { g.delete(p.prof.id); if (g.size <= 1) { for (const id of g) { const q = this.players.get(id); if (q) { q.group = null; this.bcast({ t: 'pu', id, group: null }); } } this.groups.delete(p.group!); } }
    p.group = null; this.bcast({ t: 'pu', id: p.prof.id, group: null });
  }

  move(p: P, m: any) {
    const t = now();
    let x = Number(m.x), y = Number(m.y), z = Number(m.z);
    if (![x, y, z].every(Number.isFinite)) return;
    const dt = Math.max(0.05, (t - p.lastT) / 1000);
    const dist = d2(p.x, p.z, x, z);
    const maxD = 9.5 * dt + 0.6; // koşu + sendeleme + düşme payı
    let fixed = false;
    if (dist > maxD) { const k = maxD / dist; x = p.x + (x - p.x) * k; z = p.z + (z - p.z) * k; fixed = true; }
    x = clamp(x, WORLD_BOUNDS.x0, WORLD_BOUNDS.x1); z = clamp(z, WORLD_BOUNDS.z0, WORLD_BOUNDS.z1);
    if (Math.abs(y - floorY(x, z)) > 4) { y = floorY(x, z); fixed = true; }
    if (fixed) p.c.send({ t: 'fix', x, y, z });
    p.x = x; p.y = y; p.z = z; p.lastT = t;
    p.ry = Number(m.ry) || 0;
    p.a = String(m.a ?? 'idle').slice(0, 16);
    p.it = String(m.it ?? '').slice(0, 20);
    const seat = m.s ? String(m.s).slice(0, 24) : null;
    if (seat && !p.s) p.sitSince = t;
    p.s = seat;
    p.sw = m.sw ? 1 : 0;
    if (p.fishing && !fishSpotAt(p.x, p.z)) this.endFishing(p, 'Balık noktasından ayrıldın.');
  }

  // ------------------------------------------------------------------ aksiyonlar
  act(p: P, m: any) {
    const t = now();
    // spam koruması: saniyede ~8 aksiyon (kova)
    p.actBucket = Math.min(10, p.actBucket + (t - p.lastAct) / 125); p.lastAct = t;
    if (p.actBucket < 1) return this.note(p, 'Biraz yavaş 🙂', 'warn');
    p.actBucket--;
    const k = String(m.k);
    switch (k) {
      // ---------------- balık
      case 'cast': {
        const spot = fishSpotAt(p.x, p.z);
        if (!spot) return this.note(p, 'Burada balık tutulmaz. İskele, kayalık ya da kıyıya git.', 'warn');
        if (p.fishing) return;
        const rod = RODS.find(r => r.id === m.rod) ?? RODS[0];
        if (rod.price > 0 && !p.prof.inv.some(i => i.id === rod.id)) return this.note(p, 'Bu olta sende yok.', 'warn');
        let bait: string | null = null;
        if (m.bait) {
          const b = p.prof.inv.find(i => i.id === m.bait && (i.n ?? 0) > 0);
          if (!b) return this.note(p, 'Bu yemden kalmamış.', 'warn');
          b.n = (b.n ?? 1) - 1; if (b.n <= 0) this.removeInv(p, b.uid);
          bait = b.id;
        }
        const wait = rnd(4, 13) / rod.speed * (bait ? 1 : 1.5) * (this.env.weather === 'firtina' ? 1.4 : 1);
        const f: Fishing = { spot: spot.id, kind: spot.kind, castAt: t, biteAt: t + wait * 1000, rod: rod.id, bait, bitten: false };
        f.timer = setTimeout(() => {
          if (p.fishing !== f) return;
          f.bitten = true;
          p.c.send({ t: 'bite', big: Math.random() < 0.25 });
          this.bcast({ t: 'fx', k: 'bite', id: p.prof.id }, p.prof.id);
          f.timer = setTimeout(() => { if (p.fishing === f) this.endFishing(p, 'Geç kaldın! Balık yemi yiyip kaçtı 🐟💨', 'escape'); }, 2600);
        }, wait * 1000);
        p.fishing = f;
        if (bait) this.pushProf(p);
        // birlikte balık tutma görevi
        for (const q of this.players.values()) if (q !== p && q.fishing && d2(p.x, p.z, q.x, q.z) < 25) { if (!p.prof.stats.fishTogether) this.stat(p, 'fishTogether'); if (!q.prof.stats.fishTogether) { this.stat(q, 'fishTogether'); this.pushProf(q); } }
        p.c.send({ t: 'cast.ok', spot: spot.id });
        return;
      }
      case 'reel': {
        const f = p.fishing; if (!f) return;
        if (f.timer) clearTimeout(f.timer);
        p.fishing = null;
        if (!f.bitten) return this.endFishing(p, 'Erken çektin, balık ürktü!', 'early', f);
        const reaction = (t - f.biteAt) / 1000;
        const rod = RODS.find(r => r.id === f.rod)!;
        const bait = BAITS.find(b => b.id === f.bait);
        const escapeChance = rod.escape + Math.max(0, reaction - 0.8) * 0.15;
        if (Math.random() < escapeChance) {
          p.c.send({ t: 'catch', ok: false, msg: 'Balık son anda oltadan kurtuldu! 😤' });
          this.bcast({ t: 'fx', k: 'escape', id: p.prof.id }, p.prof.id);
          return;
        }
        const night = this.isNight() || this.hour() > 18;
        const pool = FISH.filter(fd => fd.spots.includes(f.kind));
        const weights = pool.map(fd => {
          let w = fd.chance;
          if (fd.rarity !== 'yaygın') w *= rod.rareBoost * (bait?.rareBoost ?? 0.7);
          if (fd.night && night) w *= fd.night;
          return w;
        });
        let r = Math.random() * weights.reduce((a, b) => a + b, 0), pick = pool[0];
        for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { pick = pool[i]; break; } }
        const big = bait?.bigBoost ?? 0.7;
        const wgt = Math.round((pick.minW + (pick.maxW - pick.minW) * Math.pow(Math.random(), 2.2 / big)) * 1000) / 1000;
        const value = Math.max(1, Math.round(wgt * pick.pricePerKg));
        const bonus = Math.max(1, Math.round(value * 0.2));
        if (!this.addInv(p, { id: pick.id, w: wgt })) return;
        p.prof.coins += bonus;
        const st = p.prof.stats;
        st.fishTypes = Array.from(new Set([...(st.fishTypes ?? []), pick.id]));
        this.stat(p, 'fish');
        if (pick.rarity !== 'yaygın') this.stat(p, 'rareFish');
        if (wgt >= 2) this.stat(p, 'bigFish');
        st.biggestKg = Math.max(st.biggestKg ?? 0, wgt);
        this.contest(p, 'biggest', wgt);
        this.contest(p, 'rarest', RARITY_SCORE[pick.rarity] * 10 + Math.round(wgt * 10) / 10);
        this.contest(p, 'fastest', Math.round(reaction * 100) / 100, true);
        const res = { t: 'catch', ok: true, by: p.prof.id, name: p.prof.name, fish: pick.id, fishName: pick.name, w: wgt, value, bonus, rarity: pick.rarity };
        this.bcast(res);
        this.pushProf(p);
        return;
      }
      case 'cancelFish': if (p.fishing) this.endFishing(p, ''); return;

      // ---------------- mangal
      case 'grill.light': {
        if (!this.near(p, GRILL.x, GRILL.z, 4)) return;
        this.grillLit = true; this.grillLitUntil = t + 30 * 60e3; this.grillDirty = true;
        this.bcast({ t: 'fx', k: 'grillLit', id: p.prof.id });
        this.bcast({ t: 'note', msg: `🔥 ${p.prof.name} mangalı yaktı` });
        return;
      }
      case 'grill.put': {
        if (!this.near(p, GRILL.x, GRILL.z, 4)) return this.note(p, 'Mangala yaklaş.', 'warn');
        if (!this.grillLit) return this.note(p, 'Önce mangalı yak!', 'warn');
        const it = this.inv(p, m.uid);
        if (!it) return;
        const isFood = FOODS.some(f => f.id === it.id), isFish = FISH.some(f => f.id === it.id);
        if (!(isFood || isFish) || it.d !== undefined) return this.note(p, 'Bu mangala konmaz.', 'warn');
        let idx = Number.isInteger(m.slot) && !this.slots[m.slot] ? m.slot : this.slots.findIndex(s => !s);
        if (idx < 0 || idx >= GRILL_SLOTS) return this.note(p, 'Izgara dolu!', 'warn');
        this.removeInv(p, it.uid);
        this.slots[idx] = { uid: it.uid, id: it.id, owner: p.prof.id, ownerName: p.prof.name, side: 0, cookA: 0, cookB: 0, w: it.w };
        this.grillDirty = true; this.pushProf(p);
        // toplu mangal görevi
        const owners = new Set(this.slots.filter(Boolean).map(s => s!.owner));
        if (owners.size >= 3) for (const id of owners) { const q = this.players.get(id); if (q && !q.prof.stats.groupGrill) { this.stat(q, 'groupGrill'); this.pushProf(q); } }
        return;
      }
      case 'grill.flip': {
        const s = this.slots[m.slot]; if (!s || !this.near(p, GRILL.x, GRILL.z, 4)) return;
        s.side = s.side ? 0 : 1; this.grillDirty = true;
        this.bcast({ t: 'fx', k: 'flip', slot: m.slot, id: p.prof.id }); return;
      }
      case 'grill.take': {
        const s = this.slots[m.slot]; if (!s || !this.near(p, GRILL.x, GRILL.z, 4)) return;
        if (s.owner !== p.prof.id && this.players.has(s.owner)) return this.note(p, `Bu ${s.ownerName} için pişiyor 😉`, 'warn');
        const def = foodDef(s.id); const dn = doneness(s.cookA, s.cookB, def);
        if (!this.addInv(p, { id: s.id, d: dn.level, w: s.w })) return;
        this.slots[m.slot] = null; this.grillDirty = true;
        if (dn.level >= 1) this.stat(p, 'cooked');
        if (dn.level === 2) { this.stat(p, 'perfect'); this.contest(p, 'grillmaster', p.prof.stats.perfect); }
        this.note(p, `${itemName(s.id)}: ${dn.label}`);
        this.pushProf(p); return;
      }
      // ---------------- yeme / içme
      case 'eat': {
        const it = this.inv(p, m.uid); if (!it) return;
        const fruit = FRUITS.some(f => f.id === it.id);
        const cooked = it.d !== undefined;
        if (!fruit && !cooked) return this.note(p, 'Önce mangalda pişir! 🔥', 'warn');
        this.removeInv(p, it.uid);
        if (cooked && it.d === 0) this.note(p, 'Çiğ çiğ yedin... karnın guruldadı 🤢');
        if (cooked && it.d === 4) this.note(p, 'Kömür gibi! Yine de afiyet olsun 😅');
        this.bcast({ t: 'fx', k: 'eat', id: p.prof.id, item: it.id }); this.pushProf(p); return;
      }
      case 'sip': {
        const it = this.inv(p, m.uid); if (!it) return;
        const dd = DRINKS.find(d => d.id === it.id); if (!dd) return;
        if (t - p.lastSip < 900) return;
        if ((it.sv ?? 0) <= 0) return this.note(p, 'Bardak boş. Doldur ya da yenisini al.', 'warn');
        if (dd.alcohol > 0 && !this.alcohol) return this.note(p, 'Bu odada alkol kapalı.', 'warn');
        p.lastSip = t; it.sv = (it.sv ?? 1) - 1;
        if (dd.alcohol > 0) p.tipsy = Math.min(TIPSY_MAX, p.tipsy + (dd.alcohol * 1.6) / dd.sips);
        if (dd.id === 'su') p.tipsy = Math.max(0, p.tipsy - 0.35);
        if (dd.id === 'turkkahvesi' || dd.id === 'filtre') p.tipsy = Math.max(0, p.tipsy - 0.12);
        this.bcast({ t: 'pu', id: p.prof.id, tipsy: p.tipsy });
        if (it.sv <= 0 && !dd.bottle) { this.removeInv(p, it.uid); }
        this.pushProf(p); return;
      }
      case 'refill': {
        const it = this.inv(p, m.uid); if (!it) return;
        const dd = DRINKS.find(d => d.id === it.id); if (!dd) return;
        if (dd.bottle && (it.n ?? 0) > 0) { it.n = (it.n ?? 0) - 1; it.sv = dd.sips; this.bcast({ t: 'fx', k: 'pour', id: p.prof.id, item: dd.id }); }
        else {
          if (p.prof.coins < dd.price) return this.note(p, 'Yeterli Sahil Lirası yok.', 'warn');
          p.prof.coins -= dd.price; it.sv = dd.sips; if (dd.bottle) it.n = 2;
          this.bcast({ t: 'fx', k: 'pour', id: p.prof.id, item: dd.id });
        }
        if (it.sv && it.sv > 0 && it.n === 0 && dd.bottle) { /* son kadeh */ }
        this.pushProf(p); return;
      }
      case 'give': {
        const q = this.players.get(String(m.to)); const it = this.inv(p, m.uid);
        if (!q || !it || q === p) return;
        if (d2(p.x, p.z, q.x, q.z) > 5) return this.note(p, 'Yanına git, öyle ikram et 🙂', 'warn');
        if (RODS.some(r => r.id === it.id) && it.id === 'olta_bambu' && p.prof.inv.filter(i => i.id === 'olta_bambu').length <= 1) return this.note(p, 'Son oltanı veremezsin.', 'warn');
        const dd = DRINKS.find(d => d.id === it.id);
        if (dd && dd.alcohol > 0 && (!q.prof.adult || !this.alcohol)) return this.note(p, `${q.prof.name} alkollü içecek almıyor.`, 'warn');
        this.removeInv(p, it.uid);
        if (!this.addInv(q, { ...it })) { p.prof.inv.push(it); return; }
        if (it.id === 'cay') this.stat(p, 'teaGiven');
        this.bcast({ t: 'fx', k: 'give', id: p.prof.id, to: q.prof.id, item: it.id });
        this.note(q, `🎁 ${p.prof.name} sana ${itemName(it.id)} ikram etti!`, 'gift');
        this.pushProf(p); this.pushProf(q); return;
      }
      case 'place': {
        const it = this.inv(p, m.uid); if (!it) return;
        const dd = DRINKS.find(d => d.id === it.id); if (!dd) return;
        if (this.props.size > 60) return this.note(p, 'Masalar dolu!', 'warn');
        this.removeInv(p, it.uid);
        const pr: Prop = { pid: uid(5), kind: 'drink', id: it.id, x: num(m.x, p.x), y: num(m.y, p.y + 0.8), z: num(m.z, p.z), ry: 0, owner: p.prof.id, sv: it.sv, n: it.n };
        if (d2(pr.x, pr.z, p.x, p.z) > 2.5) { pr.x = p.x; pr.z = p.z; }
        this.props.set(pr.pid, pr); this.bcast({ t: 'prop', p: pr }); this.pushProf(p); return;
      }
      case 'placeFurn': {
        const it = this.inv(p, m.uid); if (!it) return;
        const fd = FURNITURE.find(f => f.id === it.id); if (!fd) return;
        if ([...this.props.values()].filter(q => q.kind === 'furn').length > 40) return this.note(p, 'Sahilde yer kalmadı!', 'warn');
        if (inVilla(p.x, p.z) || inPool(p.x, p.z) || waterAt(p.x, p.z) !== null) return this.note(p, 'Buraya koyamazsın.', 'warn');
        this.removeInv(p, it.uid);
        const fx = p.x + Math.sin(p.ry) * 1.3, fz = p.z + Math.cos(p.ry) * 1.3;
        const pr: Prop = { pid: uid(5), kind: 'furn', id: it.id, x: fx, y: floorY(fx, fz), z: fz, ry: p.ry + Math.PI, owner: p.prof.id };
        this.props.set(pr.pid, pr); this.bcast({ t: 'prop', p: pr }); this.pushProf(p); return;
      }
      case 'pickup': {
        const pr = this.props.get(String(m.pid)); if (!pr) return;
        if (pr.owner !== p.prof.id) return this.note(p, 'Bu senin değil 🙂', 'warn');
        if (d2(pr.x, pr.z, p.x, p.z) > 3) return;
        if (pr.kind === 'drink' && pr.tipped) { this.props.delete(pr.pid); this.bcast({ t: 'propDel', pid: pr.pid }); return this.note(p, 'Devrilen bardağı topladın.'); }
        if (!this.addInv(p, { id: pr.id, sv: pr.sv, n: pr.n })) return;
        this.props.delete(pr.pid); this.bcast({ t: 'propDel', pid: pr.pid }); this.pushProf(p); return;
      }
      // ---------------- meyve
      case 'pick': {
        const tr = TREES.find(x => x.id === m.tree); if (!tr) return;
        if (!this.near(p, tr.x, tr.z, 4.2)) return this.note(p, 'Ağaca yaklaş.', 'warn');
        if (t - p.lastPick < 1100) return;
        const n = this.trees.get(tr.id) ?? 0;
        if (n <= 0) return this.note(p, 'Bu ağaçta olgun meyve kalmadı. Biraz bekle.', 'warn');
        p.lastPick = t;
        if (!this.addInv(p, { id: tr.fruit })) return;
        this.trees.set(tr.id, n - 1);
        p.prof.coins += 2;
        this.stat(p, 'fruit');
        this.bcast({ t: 'tree', id: tr.id, n: n - 1, by: p.prof.id });
        this.pushProf(p); return;
      }
      // ---------------- ekonomi
      case 'sell': {
        const it = this.inv(p, m.uid); if (!it) return;
        let v = 0;
        const fd = FISH.find(f => f.id === it.id);
        if (fd && it.d === undefined) v = Math.max(1, Math.round((it.w ?? fd.minW) * fd.pricePerKg));
        const fr = FRUITS.find(f => f.id === it.id); if (fr) v = fr.sell;
        if (!v) return this.note(p, 'Bu satılamaz.', 'warn');
        this.removeInv(p, it.uid); p.prof.coins += v;
        this.note(p, `${itemName(it.id)} satıldı: +${v} SL`, 'coin'); this.pushProf(p); return;
      }
      case 'buy': {
        const si = shopItems().find(s => s.id === m.id); if (!si) return;
        const qty = Math.max(1, Math.min(10, Math.floor(Number(m.qty) || 1)));
        const cost = si.price * qty;
        if (si.cat === 'alkol') {
          if (!p.prof.adult) return p.c.send({ t: 'needAdult' });
          if (!this.alcohol) return this.note(p, 'Oda sahibi bu odada alkollü içecekleri kapattı.', 'warn');
        }
        if (p.prof.coins < cost) return this.note(p, `Yeterli Sahil Lirası yok (${cost} SL gerekli).`, 'warn');
        const cos = COSMETICS.find(c => c.id === si.id); const emo = EMOTES.find(e => e.id === si.id); const rod = RODS.find(r => r.id === si.id);
        if ((cos || emo || rod) && (p.prof.owned.includes(si.id))) return this.note(p, 'Bu zaten sende var.', 'warn');
        p.prof.coins -= cost;
        if (cos || emo) p.prof.owned.push(si.id);
        else if (rod) { p.prof.owned.push(si.id); this.addInv(p, { id: rod.id }); }
        else if (BAITS.some(b => b.id === si.id)) this.addInv(p, { id: si.id, n: 5 * qty });
        else for (let i = 0; i < qty; i++) {
          const dd = DRINKS.find(d => d.id === si.id);
          if (dd) this.addInv(p, { id: dd.id, sv: dd.sips, n: dd.bottle ? 2 : undefined });
          else this.addInv(p, { id: si.id });
        }
        this.note(p, `🛍️ ${si.name}${qty > 1 ? ' x' + qty : ''} alındı (-${cost} SL)`, 'coin');
        this.pushProf(p); return;
      }
      case 'adult': { p.prof.adult = !!m.on; this.pushProf(p); return; }
      case 'equip': {
        p.prof.look = sanitizeLook(m.look, p.prof.owned);
        if (m.name) p.prof.name = String(m.name).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 18) || p.prof.name;
        this.bcast({ t: 'pu', id: p.prof.id, look: p.prof.look, name: p.prof.name }); this.pushProf(p); return;
      }
      case 'emote': {
        const e = EMOTES.find(x => x.id === m.id); if (!e) return;
        if (e.price > 0 && !p.prof.owned.includes(e.id)) return this.note(p, 'Bu emote mağazadan alınmalı.', 'warn');
        if (['dans', 'sarhosdans', 'zeybek', 'halay', 'robot'].includes(e.id)) { this.stat(p, 'dances'); this.contest(p, 'party', p.prof.stats.dances); }
        return;
      }
      case 'swim': if (inPool(p.x, p.z) && !p.prof.stats.swim) { this.stat(p, 'swim'); this.pushProf(p); } return;
      case 'splash': if (waterAt(p.x, p.z) !== null) this.bcast({ t: 'fx', k: 'splash', id: p.prof.id, x: p.x, z: p.z, ry: p.ry }); return;
      case 'dive': this.bcast({ t: 'fx', k: 'dive', id: p.prof.id, x: num(m.x, p.x), z: num(m.z, p.z) }); return;
      case 'fall': this.bcast({ t: 'fx', k: 'fall', id: p.prof.id, why: String(m.why ?? '').slice(0, 20) }, p.prof.id); return;
      case 'door': {
        const d = DOORS.find(x => x.id === m.id); if (!d) return;
        if (!this.near(p, d.x, (d.z0 + d.z1) / 2, 3)) return;
        this.doors[d.id] = !this.doors[d.id]; this.bcast({ t: 'door', id: d.id, open: this.doors[d.id] }); return;
      }
      case 'tv': if (this.near(p, TV.x, TV.z, 8)) { this.env.tv = !this.env.tv; this.bcast({ t: 'env', env: this.envState() }); } return;
      case 'shower': if (this.near(p, SHOWER.x, SHOWER.z, 2.5)) { this.bcast({ t: 'fx', k: 'shower', id: p.prof.id }); p.tipsy = Math.max(0, p.tipsy - 0.6); this.bcast({ t: 'pu', id: p.prof.id, tipsy: p.tipsy }); } return;
      case 'flush': if (d2(p.x, p.z, (WC.x0 + WC.x1) / 2, (WC.z0 + WC.z1) / 2) < 4) this.bcast({ t: 'fx', k: 'flush', x: 11.3, z: 52.2 }); return;
      case 'fridge': {
        if (!this.near(p, FRIDGE.x, FRIDGE.z, 3)) return;
        this.bcast({ t: 'fx', k: 'fridge', id: p.prof.id });
        const free = ['su', 'ayran', 'kola', 'gazoz'];
        const id = free.includes(m.id) ? m.id : 'su';
        const dd = DRINKS.find(d => d.id === id)!;
        this.addInv(p, { id, sv: dd.sips });
        this.note(p, `Buzdolabından ${dd.name} aldın (ev ikramı)`); this.pushProf(p); return;
      }
      case 'bar': {
        if (!this.near(p, BAR.x, BAR.z, 5)) return;
        return;
      }
    }
  }

  endFishing(p: P, msg: string, kind = 'cancel', f = p.fishing) {
    if (f?.timer) clearTimeout(f.timer);
    p.fishing = null;
    if (msg) p.c.send({ t: 'catch', ok: false, msg, kind });
    if (kind === 'escape' || kind === 'early') this.bcast({ t: 'fx', k: 'escape', id: p.prof.id }, p.prof.id);
  }

  hostCmd(p: P, m: any) {
    if (this.hostId !== p.prof.id) return this.note(p, 'Bunu sadece oda sahibi yapabilir.', 'warn');
    switch (m.cmd) {
      case 'time': { const h = Number(m.v); if (Number.isFinite(h)) { this.env.hour = ((h % 24) + 24) % 24; this.env.at = now(); } break; }
      case 'timeRate': this.env.hour = this.hour(); this.env.at = now(); this.env.rate = m.v ? 1 / 120 : 0; break;
      case 'weather': if (WEATHERS.includes(m.v)) { this.env.weather = m.v; this.env.weatherLocked = !!m.lock; } break;
      case 'music': this.env.music = { on: !!m.on, station: clamp(Math.floor(Number(m.station) || 0), 0, 6), vol: clamp(Number(m.vol ?? this.env.music.vol), 0, 1) }; break;
      case 'kick': {
        const q = this.players.get(String(m.id)); if (!q || q === p) return;
        this.banned.add(q.prof.id); q.c.send({ t: 'kicked', msg: 'Oda sahibi sizi odadan çıkardı.' }); this.leave(q.prof.id); q.c.room = null;
        this.bcast({ t: 'note', msg: `${q.prof.name} odadan çıkarıldı.` }); return;
      }
      case 'alcohol': this.alcohol = !!m.v; this.bcast({ t: 'note', msg: this.alcohol ? '🍻 Oda sahibi alkollü içecekleri açtı' : '🧃 Bu oda artık alkolsüz' }); this.bcast({ t: 'roomcfg', alcohol: this.alcohol }); return;
      case 'rename': this.name = String(m.v ?? '').slice(0, 30) || this.name; break;
      case 'password': this.password = String(m.v ?? '').slice(0, 30); this.note(p, this.password ? 'Oda şifrelendi.' : 'Oda şifresi kaldırıldı.'); return;
    }
    this.bcast({ t: 'env', env: this.envState() });
  }

  // ------------------------------------------------------------------ zaman adımı
  tick(dt: number) {
    const t = now();
    // ızgara
    if (this.grillLit && t > this.grillLitUntil) { this.grillLit = false; this.grillDirty = true; this.bcast({ t: 'note', msg: '🪵 Mangalın közü söndü. Biri yeniden yaksın!' }); }
    if (this.grillLit) for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]; if (!s) continue;
      if (s.side === 0) s.cookA += dt; else s.cookB += dt;
      const def = foodDef(s.id); const dn = doneness(s.cookA, s.cookB, def);
      if (dn.level === 4 && !s.burntFx) {
        s.burntFx = true; this.grillDirty = true;
        this.bcast({ t: 'fx', k: 'burnt', slot: i, owner: s.owner, item: s.id });
        this.bcast({ t: 'note', msg: `💨 ${s.ownerName}'in ${itemName(s.id)} kömür oldu!` });
        for (const p of this.players.values()) if (d2(p.x, p.z, GRILL.x, GRILL.z) < 3.5) this.bcast({ t: 'fx', k: 'smokeface', id: p.prof.id });
      }
      // sahibi odadan çıktıysa 3 dk sonra temizle
      if (!this.players.has(s.owner) && s.cookA + s.cookB > 180) { this.slots[i] = null; this.grillDirty = true; }
    }
    if (this.grillDirty && t - this.lastGrillSend > 250) { this.grillDirty = false; this.lastGrillSend = t; this.bcast({ t: 'grill', g: this.grillState() }); }
    // sarhoşluk düşüşü
    for (const p of this.players.values()) {
      if (p.tipsy > 0) {
        const rest = p.s ? 1.7 : 1;
        const before = tipsyLevel(p.tipsy);
        p.tipsy = Math.max(0, p.tipsy - dt * (0.55 / 60) * rest);
        if (tipsyLevel(p.tipsy) !== before || t - p.tipsySent > 2000) { p.tipsySent = t; this.bcast({ t: 'pu', id: p.prof.id, tipsy: p.tipsy }); }
      }
    }
    // meyve yeniden olgunlaşır
    if (Math.random() < dt / 25) for (const tr of TREES) { const n = this.trees.get(tr.id)!; if (n < tr.max) { this.trees.set(tr.id, n + 1); this.bcast({ t: 'tree', id: tr.id, n: n + 1 }); } }
    // hava durumu
    if (!this.env.weatherLocked && t > this.nextWeather) {
      this.nextWeather = t + rnd(6, 12) * 60e3;
      const r = Math.random();
      this.env.weather = r < 0.45 ? 'gunesli' : r < 0.68 ? 'ruzgarli' : r < 0.84 ? 'bulutlu' : r < 0.96 ? 'yagmurlu' : 'firtina';
      this.bcast({ t: 'env', env: this.envState() });
    }
    // komik olaylar
    if (t > this.nextEvent && this.players.size) { this.nextEvent = t + rnd(70e3, 160e3); this.randomEvent(); }
  }

  snapshot() {
    if (!this.players.size) return;
    const ps = [...this.players.values()].map(p => [p.prof.id, r2(p.x), r2(p.y), r2(p.z), r2(p.ry), p.a, p.it, p.s, p.sw]);
    this.bcast({ t: 'snap', ps, st: now() });
  }

  randomEvent() {
    const players = [...this.players.values()];
    const opts: (() => boolean)[] = [
      () => { // martı ızgaradan kapar
        const idx = this.slots.findIndex(s => s && doneness(s.cookA, s.cookB, foodDef(s.id)).level >= 1);
        if (idx < 0) return false;
        const s = this.slots[idx]!; this.slots[idx] = null; this.grillDirty = true;
        this.bcast({ t: 'fx', k: 'seagull', slot: idx, item: s.id });
        this.bcast({ t: 'note', msg: `🐦 Bir martı ${s.ownerName}'in ${itemName(s.id)}'ını kapıp kaçtı!`, kind: 'event' });
        return true;
      },
      () => { // şemsiye uçar
        if (!['ruzgarli', 'firtina', 'bulutlu'].includes(this.env.weather) && Math.random() < 0.6) return false;
        this.bcast({ t: 'fx', k: 'umbrella', i: Math.floor(Math.random() * 6) });
        this.bcast({ t: 'note', msg: '🌬️ Rüzgâr bir plaj şemsiyesini uçurdu!', kind: 'event' }); return true;
      },
      () => { // bardak devrilir
        const drinks = [...this.props.values()].filter(q => q.kind === 'drink' && !q.tipped);
        if (!drinks.length) return false;
        const pr = drinks[Math.floor(Math.random() * drinks.length)]; pr.tipped = true; pr.sv = 0;
        this.bcast({ t: 'prop', p: pr }); this.bcast({ t: 'fx', k: 'tip', pid: pr.pid });
        this.bcast({ t: 'note', msg: `🫗 Masadaki ${itemName(pr.id)} devrildi!`, kind: 'event' }); return true;
      },
      () => { // meyve kafaya düşer
        const p = players.find(q => TREES.some(tr => d2(q.x, q.z, tr.x, tr.z) < 2.8));
        if (!p) return false;
        const tr = TREES.find(tr => d2(p.x, p.z, tr.x, tr.z) < 2.8)!;
        this.addInv(p, { id: tr.fruit }); this.pushProf(p);
        this.bcast({ t: 'fx', k: 'fruitfall', id: p.prof.id, fruit: tr.fruit });
        this.bcast({ t: 'note', msg: `🍊 ${p.prof.name}'in kafasına ${itemName(tr.fruit)} düştü! (Bedava meyve)`, kind: 'event' }); return true;
      },
      () => { // mangal dumanı
        const near = players.filter(q => d2(q.x, q.z, GRILL.x, GRILL.z) < 4);
        if (!near.length || !this.grillLit) return false;
        const p = near[Math.floor(Math.random() * near.length)];
        this.bcast({ t: 'fx', k: 'smokeface', id: p.prof.id });
        this.bcast({ t: 'note', msg: `💨 Rüzgâr döndü, duman ${p.prof.name}'in yüzüne geldi!`, kind: 'event' }); return true;
      },
      () => { // mangal başında uyuyakalma
        const p = players.find(q => q.s && now() - q.sitSince > 120e3 && d2(q.x, q.z, GRILL.x, GRILL.z) < 9);
        if (!p) return false;
        this.bcast({ t: 'fx', k: 'doze', id: p.prof.id });
        this.bcast({ t: 'note', msg: `😴 ${p.prof.name} mangal başında uyuyakaldı...`, kind: 'event' }); return true;
      },
      () => { // martılar alçaktan geçer
        this.bcast({ t: 'fx', k: 'gulls' }); return true;
      },
    ];
    for (let tries = 0; tries < 8; tries++) if (opts[Math.floor(Math.random() * opts.length)]()) return;
  }
}

const foodDef = cookDef;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: any, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
export { SEATS };
