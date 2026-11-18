// ======================================================================
//  MUHABBET KOYU – Cloudflare Workers sunucusu (ücretsiz, kart gerekmez)
//  - Oyun dosyaları (dist/) Workers Static Assets ile sunulur.
//  - Tüm oyun durumu tek bir Durable Object (GameDO) içinde çalışır;
//    hesaplar, paralar, envanter ve yarışmalar SQLite tabanlı depolamada kalıcıdır.
// ======================================================================
import { Hub, StoreLike } from './hub';

declare const WebSocketPair: any;

/** Durable Object depolaması: bellekte tutulur, değişiklikler toplu yazılır. */
class DOStore implements StoreLike {
  kind = 'cloudflare-durable-object';
  private mem = new Map<string, any>();
  private dirty = new Set<string>();
  constructor(private st: any) {}
  async init() { const all: Map<string, any> = await this.st.list(); for (const [k, v] of all) this.mem.set(k, v); }
  get<T = any>(k: string): T | undefined { return this.mem.get(k); }
  set(k: string, v: any) { this.mem.set(k, v); this.dirty.add(k); }
  del(k: string) { this.mem.delete(k); this.dirty.add(k); }
  keys(prefix: string) { return [...this.mem.keys()].filter(k => k.startsWith(prefix)); }
  async flush() {
    if (!this.dirty.size) return;
    const keys = [...this.dirty]; this.dirty.clear();
    const put: Record<string, any> = {}; const del: string[] = [];
    for (const k of keys) { if (this.mem.has(k)) put[k] = structuredClone(this.mem.get(k)); else del.push(k); }
    const ents = Object.entries(put);
    for (let i = 0; i < ents.length; i += 100) await this.st.put(Object.fromEntries(ents.slice(i, i + 100)));
    for (let i = 0; i < del.length; i += 100) await this.st.delete(del.slice(i, i + 100));
  }
}

export class GameDO {
  private hub: Hub | null = null;
  private store: DOStore;
  constructor(private state: any, private env: any) {
    this.store = new DOStore(state.storage);
    state.blockConcurrencyWhile(async () => {
      await this.store.init();
      const ice: any[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
      if (env.TURN_URL) ice.push({ urls: String(env.TURN_URL).split(','), username: env.TURN_USER, credential: env.TURN_PASS });
      this.hub = new Hub(this.store, ice);
    });
  }
  async fetch(req: Request): Promise<Response> {
    const hub = this.hub!;
    const url = new URL(req.url);
    if (url.pathname === '/health') return Response.json(hub.health());
    if (url.pathname === '/api/rooms') return Response.json(hub.listRooms(), { headers: { 'Access-Control-Allow-Origin': '*' } });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket bekleniyor', { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();
    const c = hub.open({ send: (s) => server.send(s), close: () => server.close(1000, 'bye'), ip: req.headers.get('CF-Connecting-IP') ?? '' });
    server.addEventListener('message', (e: any) => hub.message(c, typeof e.data === 'string' ? e.data : ''));
    server.addEventListener('close', () => hub.close(c));
    server.addEventListener('error', () => hub.close(c));
    return new Response(null, { status: 101, webSocket: client } as any);
  }
}

export default {
  async fetch(req: Request, env: any): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/ws' || url.pathname === '/health' || url.pathname === '/api/rooms') {
      const stub = env.GAME.get(env.GAME.idFromName('muhabbet-koyu-ana'));
      return stub.fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
};
