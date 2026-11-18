// ======================================================================
//  Hub: bağlantılar, hesaplar, odalar ve oyun döngüleri.
//  Hem Node.js sunucusu (index.ts) hem Cloudflare Worker (worker.ts) kullanır.
// ======================================================================
import { Accounts, cleanName, sanitizeLook, weekKey, uid } from './accounts';
import { Room, Client } from './room';
import { PROTOCOL_VERSION, CONTESTS } from '../shared/data';

/** Kalıcı kayıt arayüzü (JSON dosyası, PostgreSQL veya Durable Object). */
export interface StoreLike {
  kind: string;
  get<T = any>(k: string): T | undefined;
  set(k: string, v: any): void;
  del(k: string): void;
  keys(prefix: string): string[];
  flush(): Promise<void>;
}
export interface Conn extends Client { raw(s: string): void; lastRefill: number }

export class Hub {
  rooms = new Map<string, Room>();
  acc: Accounts;
  conns = new Set<Conn>();
  private timers: any[] = [];
  private last = Date.now();
  onIdle: () => void = () => {};

  constructor(public store: StoreLike, public ice: any[]) {
    this.acc = new Accounts(store as any);
    for (const [id, name] of [['KUMSAL', 'Kumsal – Herkese Açık'], ['KOY', 'Gün Batımı Koyu'], ['ISKELE', 'İskele Muhabbeti']]) {
      this.rooms.set(id, new Room(this.acc, store as any, { id, name, isPublic: true, permanent: true }));
    }
  }

  listRooms() { return [...this.rooms.values()].filter(r => r.isPublic).map(r => r.summary()).sort((a, b) => b.n - a.n); }
  health() { return { ok: true, rooms: this.rooms.size, players: [...this.rooms.values()].reduce((a, r) => a + r.players.size, 0), store: this.store.kind }; }

  /** Yeni WebSocket bağlantısı. send/raw/close platforma göre verilir. */
  open(io: { send(s: string): void; close(): void; ip: string }): Conn {
    const c: Conn = {
      id: uid(4), prof: null, room: null, bucket: 60, lastChat: 0, ip: io.ip, lastRefill: Date.now(),
      send(o: any) { try { io.send(JSON.stringify(o)); } catch { /* kapalı */ } },
      raw(s: string) { try { io.send(s); } catch { /* kapalı */ } },
      close() { try { io.close(); } catch { /* */ } },
    };
    this.conns.add(c);
    this.startLoops();
    c.send({ t: 'hello', v: PROTOCOL_VERSION, ice: this.ice });
    return c;
  }
  message(c: Conn, data: string) {
    // hız sınırı (token bucket): saniyede ~40 mesaj
    const tn = Date.now(); c.bucket = Math.min(80, c.bucket + (tn - c.lastRefill) / 25); c.lastRefill = tn;
    if (c.bucket < 1) return; c.bucket--;
    if (typeof data !== 'string' || data.length > 64 * 1024) return;
    let m: any; try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    try { this.onMsg(c, m); } catch (e) { console.error('[msg]', m.t, e); c.send({ t: 'err', msg: 'Sunucu hatası' }); }
  }
  close(c: Conn) {
    if (!this.conns.delete(c)) return;
    if (c.room && c.prof) c.room.leave(c.prof.id);
    c.room = null;
    if (!this.conns.size) { this.store.flush().catch(() => {}); this.stopLoops(); this.onIdle(); }
  }

  onMsg(c: Conn, m: any) {
    const acc = this.acc;
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
      case 'register': { const e = acc.register(c.prof, m.user, m.pass); c.send(e ? { t: 'note', msg: e, kind: 'warn' } : { t: 'note', msg: '✅ Hesabınız kaydedildi. Artık başka cihazdan giriş yapabilirsiniz.', kind: 'ok' }); return c.send({ t: 'prof', p: acc.publicView(c.prof) }); }
      case 'profile': {
        c.prof.look = sanitizeLook(m.look, c.prof.owned);
        if (m.name) c.prof.name = cleanName(m.name);
        acc.persist(c.prof); return c.send({ t: 'prof', p: acc.publicView(c.prof) });
      }
      case 'block': { const id = String(m.id); if (m.on) { if (!c.prof.blocked.includes(id)) c.prof.blocked.push(id); } else c.prof.blocked = c.prof.blocked.filter(x => x !== id); acc.persist(c.prof); return c.send({ t: 'prof', p: acc.publicView(c.prof) }); }
      case 'rooms.list': return c.send({ t: 'rooms', list: this.listRooms() });
      case 'contests': {
        const all = this.store.get<any>('contest:' + weekKey()) ?? {};
        return c.send({ t: 'contests', week: weekKey(), defs: CONTESTS, data: all });
      }
      case 'room.create': {
        if (c.room) c.room.leave(c.prof.id);
        const mine = [...this.rooms.values()].filter(r => !r.permanent && r.hostId === c.prof!.id);
        if (mine.length >= 2) return c.send({ t: 'err', msg: 'En fazla 2 oda açabilirsiniz.' });
        if (this.rooms.size > 300) return c.send({ t: 'err', msg: 'Sunucu dolu, biraz sonra deneyin.' });
        const r = new Room(acc, this.store as any, { name: String(m.name || `${c.prof.name}'in Sahili`).slice(0, 30), isPublic: !!m.pub, password: String(m.password || '').slice(0, 30), max: Number(m.max) || 16 });
        this.rooms.set(r.id, r);
        const err = r.join(c); if (err) c.send({ t: 'err', msg: err });
        return;
      }
      case 'room.join': {
        const r = this.rooms.get(String(m.id || '').toUpperCase());
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

  // ------------------------------------------------------------ döngüler
  startLoops() {
    if (this.timers.length) return;
    this.last = Date.now();
    this.timers.push(setInterval(() => { const t = Date.now(); const dt = Math.min(2, (t - this.last) / 1000); this.last = t; for (const r of this.rooms.values()) r.tick(dt); }, 250));
    this.timers.push(setInterval(() => { for (const r of this.rooms.values()) r.snapshot(); }, 100));
    this.timers.push(setInterval(() => {
      for (const [id, r] of this.rooms) if (!r.permanent && !r.players.size && r.emptySince && Date.now() - r.emptySince > 10 * 60e3) this.rooms.delete(id);
      this.store.flush().catch(() => {});
    }, 30e3));
  }
  stopLoops() { for (const t of this.timers) clearInterval(t); this.timers = []; }
  async shutdown() { for (const r of this.rooms.values()) for (const p of r.players.values()) this.acc.persist(p.prof); await this.store.flush(); }
}
