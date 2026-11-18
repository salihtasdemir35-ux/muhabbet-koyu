// Kalıcı kayıt katmanı.
//  - DATABASE_URL tanımlıysa PostgreSQL (ör. Neon/Supabase ücretsiz katman) kullanılır.
//  - Tanımlı değilse data/db.json dosyasına atomik olarak yazılır.
// Bütün veri bellekte tutulur, değişiklikler arka planda kalıcı hale getirilir.
import fs from 'node:fs';
import path from 'node:path';

type Json = any;

export class Store {
  private mem = new Map<string, Json>();
  private dirty = new Set<string>();
  private pg: any = null;
  private file: string;
  private timer: NodeJS.Timeout | null = null;
  kind = 'json';

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'db.json');
    fs.mkdirSync(dataDir, { recursive: true });
  }

  async init() {
    const url = process.env.DATABASE_URL;
    if (url) {
      const { default: pgmod } = await import('pg');
      this.pg = new pgmod.Pool({ connectionString: url, ssl: url.includes('localhost') ? undefined : { rejectUnauthorized: false }, max: 4 });
      await this.pg.query('CREATE TABLE IF NOT EXISTS mk_kv (k TEXT PRIMARY KEY, v JSONB NOT NULL, updated TIMESTAMPTZ DEFAULT now())');
      const r = await this.pg.query('SELECT k, v FROM mk_kv');
      for (const row of r.rows) this.mem.set(row.k, row.v);
      this.kind = 'postgres';
    } else if (fs.existsSync(this.file)) {
      try {
        const obj = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        for (const k of Object.keys(obj)) this.mem.set(k, obj[k]);
      } catch (e) { console.error('db.json okunamadı, yedekleniyor', e); fs.copyFileSync(this.file, this.file + '.bozuk-' + Date.now()); }
    }
    console.log(`[store] ${this.kind} – ${this.mem.size} kayıt yüklendi`);
  }

  get<T = Json>(k: string): T | undefined { return this.mem.get(k); }
  set(k: string, v: Json) { this.mem.set(k, v); this.dirty.add(k); this.schedule(); }
  del(k: string) { this.mem.delete(k); this.dirty.add(k); this.schedule(); }
  keys(prefix: string) { return [...this.mem.keys()].filter(k => k.startsWith(prefix)); }

  private schedule() { if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.flush().catch(e => console.error('[store] flush', e)); }, 1500); }

  async flush() {
    if (!this.dirty.size) return;
    const keys = [...this.dirty]; this.dirty.clear();
    if (this.pg) {
      for (const k of keys) {
        if (this.mem.has(k)) await this.pg.query('INSERT INTO mk_kv(k,v,updated) VALUES($1,$2,now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, updated=now()', [k, JSON.stringify(this.mem.get(k))]);
        else await this.pg.query('DELETE FROM mk_kv WHERE k=$1', [k]);
      }
    } else {
      const obj: Record<string, Json> = {};
      for (const [k, v] of this.mem) obj[k] = v;
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(obj));
      fs.renameSync(tmp, this.file);
    }
  }
}
