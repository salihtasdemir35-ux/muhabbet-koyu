// WebSocket istemcisi: otomatik yeniden bağlanma, gecikme ölçümü, olay dağıtımı
type Handler = (m: any) => void;

export function defaultServer(): string {
  const saved = localStorage.getItem('mk_server');
  if (saved) return saved;
  const env = (import.meta as any).env?.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  if (location.port === '5173') return `ws://${location.hostname}:8080/ws`; // vite geliştirme sunucusu
  if (location.protocol === 'http:' || location.protocol === 'https:') return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  return 'ws://localhost:8080/ws';
}

export class Net {
  ws: WebSocket | null = null;
  url: string;
  handlers = new Map<string, Handler[]>();
  connected = false;
  ping = 0;
  serverOffset = 0;
  private retry = 0; private closedByUser = false; private pingTimer: any = null; private queue: string[] = [];
  onStatus: (s: 'connecting' | 'open' | 'closed') => void = () => {};

  constructor(url = defaultServer()) { this.url = url; }

  on(t: string, h: Handler) { const a = this.handlers.get(t) ?? []; a.push(h); this.handlers.set(t, a); }
  emit(m: any) { for (const h of this.handlers.get(m.t) ?? []) h(m); for (const h of this.handlers.get('*') ?? []) h(m); }

  connect() {
    this.closedByUser = false;
    this.onStatus('connecting');
    let ws: WebSocket;
    try { ws = new WebSocket(this.url); } catch { this.scheduleReconnect(); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true; this.retry = 0; this.onStatus('open');
      for (const q of this.queue.splice(0)) ws.send(q);
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ t: 'ping', ts: performance.now() }), 3000);
      this.emit({ t: '_open' });
    };
    ws.onmessage = (e) => {
      let m: any; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'pong') { this.ping = performance.now() - m.ts; this.serverOffset = m.st - Date.now(); }
      this.emit(m);
    };
    ws.onclose = () => {
      const was = this.connected; this.connected = false; clearInterval(this.pingTimer);
      this.onStatus('closed');
      if (was) this.emit({ t: '_close' });
      if (!this.closedByUser) this.scheduleReconnect();
    };
    ws.onerror = () => { /* onclose gelir */ };
  }
  private scheduleReconnect() {
    const d = Math.min(8000, 500 * Math.pow(1.6, this.retry++));
    setTimeout(() => { if (!this.closedByUser) this.connect(); }, d);
  }
  send(o: any) {
    const s = JSON.stringify(o);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(s);
    else if (o.t !== 'mv' && o.t !== 'ping' && this.queue.length < 50) this.queue.push(s);
  }
  close() { this.closedByUser = true; this.ws?.close(); }
  setUrl(u: string) { this.url = u; localStorage.setItem('mk_server', u); this.close(); setTimeout(() => this.connect(), 100); }
}
