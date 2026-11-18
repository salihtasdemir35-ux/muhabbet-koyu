import crypto from 'node:crypto';
import { Store } from './store';
import { DEFAULT_LOOK, START_COINS, COSMETICS, InvItem, Look, QUESTS, PALETTE, SKIN_TONES, HAIR_COLORS } from '../shared/data';

export interface Profile {
  id: string; name: string; look: Look; coins: number; inv: InvItem[]; owned: string[];
  quests: Record<string, boolean>; stats: Record<string, any>; adult: boolean; blocked: string[];
  user?: string; passHash?: string; tokenHash: string; created: number; lastSeen: number;
}

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const uid = (n = 9) => crypto.randomBytes(n).toString('base64url');

export function cleanName(n: unknown): string {
  let s = String(n ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 18);
  if (s.length < 2) s = 'Misafir' + Math.floor(Math.random() * 900 + 100);
  return s;
}

export function sanitizeLook(l: any, owned: string[]): Look {
  const out: any = { ...DEFAULT_LOOK };
  if (!l || typeof l !== 'object') return out;
  out.gender = l.gender === 'k' ? 'k' : 'e';
  const num = (v: any, list: number[], d: number) => (typeof v === 'number' && list.includes(v) ? v : d);
  out.skin = num(l.skin, SKIN_TONES, DEFAULT_LOOK.skin);
  out.build = Math.max(0, Math.min(1, Number(l.build) || 0.5));
  out.hairColor = num(l.hairColor, HAIR_COLORS, DEFAULT_LOOK.hairColor);
  out.topColor = num(l.topColor, PALETTE, DEFAULT_LOOK.topColor);
  out.bottomColor = num(l.bottomColor, PALETTE, DEFAULT_LOOK.bottomColor);
  out.shoesColor = num(l.shoesColor, PALETTE, DEFAULT_LOOK.shoesColor);
  for (const slot of ['hair', 'top', 'bottom', 'hat', 'glasses', 'shoes', 'acc'] as const) {
    const c = COSMETICS.find(x => x.id === l[slot] && x.slot === slot);
    if (c && (c.price === 0 || owned.includes(c.id))) out[slot] = c.id;
  }
  return out;
}

export class Accounts {
  constructor(private store: Store) {}

  private save(p: Profile) { this.store.set('p:' + p.id, p); }
  persist(p: Profile) { p.lastSeen = Date.now(); this.save(p); }

  createGuest(name: string, look: any): { token: string; profile: Profile } {
    const token = uid(32);
    const p: Profile = {
      id: uid(6), name: cleanName(name), look: sanitizeLook(look, []), coins: START_COINS,
      inv: [
        { uid: uid(), id: 'olta_bambu' }, { uid: uid(), id: 'yem_ekmek', n: 10 }, { uid: uid(), id: 'yem_karides', n: 5 },
        { uid: uid(), id: 'cay', sv: 3 }, { uid: uid(), id: 'kofte' }, { uid: uid(), id: 'misir' }, { uid: uid(), id: 'su', sv: 3 },
      ],
      owned: ['olta_bambu'], quests: {}, stats: { fishTypes: [] }, adult: false, blocked: [],
      tokenHash: sha(token), created: Date.now(), lastSeen: Date.now(),
    };
    this.save(p);
    this.store.set('t:' + p.tokenHash, p.id);
    return { token, profile: p };
  }

  byToken(token: string): Profile | null {
    if (typeof token !== 'string' || token.length < 20) return null;
    const id = this.store.get<string>('t:' + sha(token));
    return id ? this.store.get<Profile>('p:' + id) ?? null : null;
  }
  byId(id: string): Profile | null { return this.store.get<Profile>('p:' + id) ?? null; }

  /** Misafir hesabı kullanıcı adı + şifre ile güvenceye alır (başka cihazdan giriş için). */
  register(p: Profile, user: string, pass: string): string | null {
    user = String(user || '').toLowerCase().trim();
    if (!/^[a-z0-9_.]{3,20}$/.test(user)) return 'Kullanıcı adı 3-20 karakter olmalı (a-z, 0-9, _ .)';
    if (String(pass || '').length < 6) return 'Şifre en az 6 karakter olmalı';
    if (this.store.get('u:' + user)) return 'Bu kullanıcı adı alınmış';
    if (p.user) this.store.del('u:' + p.user);
    const salt = crypto.randomBytes(16).toString('hex');
    p.passHash = salt + ':' + crypto.scryptSync(pass, salt, 64).toString('hex');
    p.user = user;
    this.store.set('u:' + user, p.id);
    this.save(p);
    return null;
  }

  login(user: string, pass: string): { token: string; profile: Profile } | string {
    user = String(user || '').toLowerCase().trim();
    const id = this.store.get<string>('u:' + user);
    const p = id ? this.byId(id) : null;
    if (!p || !p.passHash) return 'Kullanıcı adı veya şifre hatalı';
    const [salt, hash] = p.passHash.split(':');
    const test = crypto.scryptSync(String(pass || ''), salt, 64);
    if (!crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'))) return 'Kullanıcı adı veya şifre hatalı';
    // yeni oturum belirteci (eskisi geçersiz olur)
    this.store.del('t:' + p.tokenHash);
    const token = uid(32);
    p.tokenHash = sha(token);
    this.store.set('t:' + p.tokenHash, p.id);
    this.save(p);
    return { token, profile: p };
  }

  publicView(p: Profile) {
    return { id: p.id, name: p.name, coins: p.coins, inv: p.inv, owned: p.owned, quests: p.quests, stats: p.stats, adult: p.adult, blocked: p.blocked, look: p.look, user: p.user ?? null };
  }

  /** Görev ilerlemesini kontrol eder, tamamlananların ödülünü verir. */
  checkQuests(p: Profile): string[] {
    const done: string[] = [];
    for (const q of QUESTS) {
      if (p.quests[q.id]) continue;
      const v = q.stat === 'fishTypes' ? (p.stats.fishTypes?.length ?? 0) : (p.stats[q.stat] ?? 0);
      if (v >= q.goal) { p.quests[q.id] = true; p.coins += q.reward; done.push(`🏅 Görev tamamlandı: ${q.name} (+${q.reward} SL)`); }
    }
    return done;
  }
}

export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-H${Math.ceil(((+t - +y0) / 86400000 + 1) / 7)}`;
}
