// Sunucu kabul testleri: iki gerçek WebSocket istemcisiyle protokolü uçtan uca dener.
// Çalıştırma: (sunucu açıkken)  npx tsx tests/server.test.ts [ws://localhost:8080/ws]
import WebSocket from 'ws';
import { GRILL, FISH_SPOTS, TREES, BAR } from '../shared/world';

const URL = process.argv[2] ?? 'ws://localhost:8080/ws';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const results: string[] = [];
function ok(name: string, cond: any, extra = '') { if (cond) { pass++; results.push(`✅ ${name}${extra ? ' — ' + extra : ''}`); } else { fail++; results.push(`❌ ${name}${extra ? ' — ' + extra : ''}`); } }

class C {
  ws!: WebSocket; msgs: any[] = []; prof: any; id = ''; token = '';
  async open() { this.ws = new WebSocket(URL); await new Promise(r => this.ws.on('open', r)); this.ws.on('message', (d) => { const m = JSON.parse(String(d)); this.msgs.push(m); if (m.t === 'prof') this.prof = m.p; if (m.t === 'auth.ok') { this.prof = m.p; this.token = m.token; } }); await this.wait('hello'); }
  send(o: any) { this.ws.send(JSON.stringify(o)); }
  async wait(t: string, pred: (m: any) => boolean = () => true, ms = 6000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const i = this.msgs.findIndex(m => m.t === t && pred(m)); if (i >= 0) return this.msgs.splice(i, 1)[0]; await sleep(20); }
    return null;
  }
  clear() { this.msgs = []; }
  mv(x: number, z: number, y = 0.6, a = 'idle') { this.send({ t: 'mv', x, y, z, ry: 0, a, it: '' }); }
  async walkTo(x: number, z: number, from: { x: number; z: number }) {
    const steps = Math.ceil(Math.hypot(x - from.x, z - from.z) / 0.5);
    for (let i = 1; i <= steps; i++) { this.mv(from.x + (x - from.x) * i / steps, from.z + (z - from.z) * i / steps); await sleep(110); }
  }
}

(async () => {
  const a = new C(), b = new C();
  await a.open(); await b.open();
  a.send({ t: 'auth', mode: 'guest', name: 'Ayşe' }); b.send({ t: 'auth', mode: 'guest', name: 'Mehmet', look: { gender: 'e', hat: 'hat_fotr' } });
  const aa = await a.wait('auth.ok'), ba = await b.wait('auth.ok');
  ok('Misafir hesap açılıyor', aa && ba, `başlangıç ${aa?.p.coins} SL`);
  ok('Ücretli kozmetik ücretsiz giyilemez', ba?.p.look.hat === 'hat_yok');
  a.id = aa.p.id; b.id = ba.p.id;

  // ---- oda
  a.send({ t: 'room.create', name: 'Test Sahili', password: 'gizli', pub: false, max: 12 });
  const ja = await a.wait('joined');
  ok('Özel oda oluşturuldu', ja?.room?.id, `kod ${ja?.room?.id}`);
  b.send({ t: 'room.join', id: ja.room.id, password: 'yanlis' });
  const jf = await b.wait('join.fail'); ok('Yanlış şifre reddediliyor', jf?.needPass);
  b.send({ t: 'room.join', id: ja.room.id, key: ja.room.inviteKey });
  const jb = await b.wait('joined'); ok('Davet bağlantısıyla (anahtar) odaya girildi', jb && jb.players.length === 2);
  const pj = await a.wait('pj'); ok('İlk oyuncu yeni geleni görüyor', pj?.p?.name === 'Mehmet');

  // ---- hareket senkronu + hız hilesi
  a.mv(1, 14); await sleep(150); a.mv(1.3, 14.2); await sleep(250);
  const snap = await b.wait('snap', m => m.ps.some((p: any) => p[0] === a.id && Math.abs(p[1] - 1.3) < 0.01));
  ok('Konum senkronu (snapshot)', !!snap);
  a.clear(); a.mv(40, 50); const fix = await a.wait('fix');
  ok('Sunucu ışınlanma/hız hilesini düzeltiyor', fix && Math.hypot(fix.x - 1.3, fix.z - 14.2) < 3, fix ? `düzeltilen konum (${fix.x.toFixed(1)}, ${fix.z.toFixed(1)})` : '');

  // ---- ekonomi doğrulama
  b.send({ t: 'act', k: 'buy', id: 'olta_pro' }); const nb = await b.wait('note', m => /Yeterli/.test(m.msg));
  ok('Yetersiz bakiyeyle satın alma engelleniyor', !!nb);
  await sleep(150);
  a.send({ t: 'act', k: 'buy', id: 'cay' }); await a.wait('prof');
  const coinsAfterTea = a.prof.coins; ok('Çay satın alındı (5 SL)', coinsAfterTea === 495, `${coinsAfterTea} SL`);

  // ---- ikram (çay)
  // B'yi A'nın yanına getir
  b.mv(0, 13); await sleep(200); for (let i = 0; i < 6; i++) { b.mv(0.2 * i, 13.5 + i * 0.1); await sleep(110); }
  a.mv(1.3, 14.2); await sleep(150);
  const tea = a.prof.inv.find((i: any) => i.id === 'cay');
  a.send({ t: 'act', k: 'give', uid: tea.uid, to: b.id });
  const gift = await b.wait('note', m => /ikram/.test(m.msg));
  ok('Arkadaşa çay ikram edildi', !!gift, gift?.msg);
  await sleep(300);
  ok('Çay ikram görevi tamamlandı', a.prof.quests.q_cayikram === true);

  // ---- alkol + sarhoşluk
  await sleep(150);
  b.send({ t: 'act', k: 'buy', id: 'raki' }); const na = await b.wait('needAdult'); ok('Alkol için yaş onayı isteniyor', !!na);
  b.send({ t: 'act', k: 'adult', on: true }); await sleep(200);
  b.send({ t: 'act', k: 'buy', id: 'raki' }); await b.wait('prof'); await sleep(150);
  let raki = b.prof.inv.find((i: any) => i.id === 'raki');
  if (!raki) console.log('DEBUG inv', b.prof.inv.map((i: any) => i.id), b.prof.adult, b.prof.coins, b.msgs.filter((m: any) => m.t === 'note'));
  ok('Rakı alındı (şişede 2 kadeh daha)', raki && raki.n === 2);
  let tip = 0;
  const lastTipsy = async () => { await sleep(400); let v = -1; for (const m of b.msgs) if (m.t === 'pu' && m.id === b.id && m.tipsy !== undefined) v = m.tipsy; b.msgs = b.msgs.filter(m => !(m.t === 'pu')); return v; };
  for (let i = 0; i < 4; i++) { b.send({ t: 'act', k: 'sip', uid: raki.uid }); await sleep(1000); }
  tip = await lastTipsy();
  ok('İçtikçe sanal denge göstergesi artıyor', tip > 1.2, `keyif ${tip.toFixed(2)}`);
  b.send({ t: 'act', k: 'refill', uid: raki.uid }); await sleep(300);
  raki = b.prof.inv.find((i: any) => i.id === 'raki');
  ok('Şişeden bardağa yeniden doldurma', raki?.sv === 4 && raki?.n === 1);
  b.send({ t: 'act', k: 'buy', id: 'su' }); await b.wait('prof'); await sleep(950);
  const su = b.prof.inv.find((i: any) => i.id === 'su');
  const before = await lastTipsy();
  b.send({ t: 'act', k: 'sip', uid: su.uid }); const after = await lastTipsy();
  ok('Su içmek sarhoşluğu azaltıyor', after >= 0 && after < (before >= 0 ? before : tip) - 0.2, `${(before >= 0 ? before : tip).toFixed(2)} → ${after.toFixed(2)}`);
  a.send({ t: 'host', cmd: 'alcohol', v: false }); await sleep(200);
  b.send({ t: 'act', k: 'buy', id: 'bira' }); const nal = await b.wait('note', m => /alkol/.test(m.msg));
  ok('Oda sahibi alkolü kapatabiliyor', !!nal);
  a.send({ t: 'host', cmd: 'alcohol', v: true });

  // ---- mangal
  const gp = { x: GRILL.x + 1.5, z: GRILL.z + 1.5 };
  await Promise.all([a.walkTo(gp.x, gp.z, { x: 1.3, z: 14.2 }), b.walkTo(gp.x - 2.5, gp.z, { x: 1, z: 14 })]);
  const kofte = a.prof.inv.find((i: any) => i.id === 'kofte');
  a.send({ t: 'act', k: 'grill.put', uid: kofte.uid }); const g1 = await a.wait('grill', m => m.g.slots.some((s: any) => s?.id === 'kofte'));
  ok('Mangala köfte konuldu', !!g1);
  const slot = g1.g.slots.findIndex((s: any) => s?.id === 'kofte');
  await sleep(2000);
  b.send({ t: 'act', k: 'grill.take', slot }); // başkası alamaz
  const nt = await b.wait('note', m => /pişiyor|Mangala/.test(m.msg)); ok('Başkasının yiyeceği alınamıyor (sahiplik)', !!nt);
  a.send({ t: 'act', k: 'grill.flip', slot }); const fl = await a.wait('fx', m => m.k === 'flip'); ok('Ürün çevrildi', !!fl);
  await sleep(1500);
  a.send({ t: 'act', k: 'grill.take', slot }); await a.wait('prof'); await sleep(100);
  const cooked = a.prof.inv.find((i: any) => i.id === 'kofte' && i.d !== undefined);
  ok('Pişmişlik seviyesi hesaplanıyor', cooked && cooked.d >= 0, `seviye ${cooked?.d} (kısa sürede alındı)`);
  a.send({ t: 'act', k: 'eat', uid: cooked.uid }); const fe = await a.wait('fx', m => m.k === 'eat'); ok('Yiyecek yenebiliyor', !!fe);

  // ---- meyve
  const tr = TREES[0];
  await a.walkTo(tr.x + 1.5, tr.z, gp);
  a.send({ t: 'act', k: 'pick', tree: tr.id }); const tm = await a.wait('tree', m => m.id === tr.id);
  ok('Meyve toplanıyor, ağaç sayısı azalıyor', tm && tm.n === tr.max - 1);
  await sleep(300); ok('Meyve envantere eklendi', a.prof.inv.some((i: any) => i.id === tr.fruit));

  // ---- balık tutma (bekleme + vurma)
  const sp = FISH_SPOTS.find(s => s.id === 'sahil_b')!;
  let pos = { x: tr.x + 1.5, z: tr.z };
  for (const [x, z] of [[-18, 30], [-3, 16], [0, 10.5], [0, 4], [sp.x, sp.z]] as [number, number][]) { await a.walkTo(x, z, pos); pos = { x, z }; }
  a.send({ t: 'act', k: 'cast', rod: 'olta_bambu', bait: 'yem_karides' });
  const co = await a.wait('cast.ok'); ok('Olta atıldı (doğru noktada)', !!co);
  a.send({ t: 'act', k: 'reel' }); const early = await a.wait('catch'); ok('Erken çekince balık ürküyor', early && !early.ok && /Erken/.test(early.msg));
  let caught: any = null;
  for (let tries = 0; tries < 6 && !caught; tries++) {
    await sleep(200);
    a.send({ t: 'act', k: 'cast', rod: 'olta_bambu', bait: 'yem_ekmek' });
    const bite = await a.wait('bite', () => true, 25000);
    if (!bite) continue;
    await sleep(250);
    a.send({ t: 'act', k: 'reel' });
    const r = await a.wait('catch', () => true, 3000);
    if (r?.ok) caught = r;
  }
  ok('Balık yakalandı', !!caught, caught ? `${caught.fishName} ${caught.w} kg, değer ${caught.value} SL, ödül +${caught.bonus}` : '');
  if (caught) {
    const { FISH } = await import('../shared/data');
    const fd = FISH.find(f => f.id === caught.fish)!;
    ok('Tür, ağırlık ve değer doğru hesaplanıyor', caught.w >= fd.minW && caught.w <= fd.maxW && caught.value === Math.max(1, Math.round(caught.w * fd.pricePerKg)));
    const bsee = await b.wait('catch', m => m.by === a.id); ok('Diğer oyuncular yakalanan balığı görüyor', !!bsee);
    await sleep(200);
    const fishItem = a.prof.inv.find((i: any) => i.id === caught.fish);
    const before = a.prof.coins; a.send({ t: 'act', k: 'sell', uid: fishItem.uid }); await a.wait('prof'); await sleep(100);
    ok('Balık satılabiliyor', a.prof.coins === before + caught.value, `+${caught.value} SL`);
  }
  // uzaktan balık tutma engeli
  b.send({ t: 'act', k: 'cast', rod: 'olta_bambu' }); const nf = await b.wait('note', m => /balık tutulmaz/.test(m.msg)); ok('Balık noktası dışında olta atılamıyor', !!nf);

  // ---- oda sahibi
  a.send({ t: 'host', cmd: 'weather', v: 'yagmurlu', lock: true }); const ev = await b.wait('env', m => m.env.weather === 'yagmurlu'); ok('Oda sahibi havayı değiştiriyor', !!ev);
  a.send({ t: 'host', cmd: 'time', v: 21 }); const et = await b.wait('env', m => Math.abs(m.env.hour - 21) < 0.1); ok('Oda sahibi saati değiştiriyor (gece)', !!et);
  b.send({ t: 'host', cmd: 'time', v: 8 }); const nh = await b.wait('note', m => /oda sahibi/.test(m.msg)); ok('Oda sahibi olmayan komut veremiyor', !!nh);

  // ---- WebRTC sinyal iletimi
  a.send({ t: 'rtc', to: b.id, d: { sdp: { type: 'offer', sdp: 'test' } } }); const rs = await b.wait('rtc', m => m.from === a.id); ok('WebRTC sinyal iletimi', !!rs);
  // ---- özel grup
  a.send({ t: 'grp.invite', to: b.id }); const gi = await b.wait('grp.invite'); b.send({ t: 'grp.accept', gid: gi.gid }); const gu = await a.wait('pu', m => m.id === b.id && m.group); ok('Özel sohbet grubu kuruluyor', !!gu);
  // ---- sohbet + spam
  a.send({ t: 'chat', text: 'Selam millet!' }); const ch = await b.wait('chat'); ok('Yazılı sohbet', ch?.text === 'Selam millet!');
  a.send({ t: 'chat', text: 'spam' }); const sp2 = await a.wait('note', m => /yavaş/.test(m.msg)); ok('Sohbet spam koruması', !!sp2);

  // ---- kalıcılık + yeniden bağlanma
  const coinsBefore = a.prof.coins; const tokenA = a.token; const roomId = ja.room.id; const key = ja.room.inviteKey;
  a.ws.terminate(); const pl = await b.wait('pl', m => m.id === a.id); ok('Kopan oyuncu odadan düşüyor', !!pl);
  const a2 = new C(); await a2.open(); a2.send({ t: 'auth', mode: 'token', token: tokenA }); const re = await a2.wait('auth.ok');
  ok('Oyun parası/ilerleme korunuyor', re && re.p.coins === coinsBefore, `${re?.p.coins} SL`);
  a2.send({ t: 'room.join', id: roomId, key, pos: { x: sp.x, z: sp.z } }); const rj = await a2.wait('joined'); ok('Yeniden bağlanınca odaya geri dönülüyor', !!rj);

  // ---- oda dolu
  const small = new C(); await small.open(); small.send({ t: 'auth', mode: 'guest', name: 'Dolu' }); await small.wait('auth.ok');
  small.send({ t: 'room.create', name: 'Mini', max: 2 }); const sj = await small.wait('joined');
  const x1 = new C(); await x1.open(); x1.send({ t: 'auth', mode: 'guest', name: 'X1' }); await x1.wait('auth.ok'); x1.send({ t: 'room.join', id: sj.room.id }); await x1.wait('joined');
  const x2 = new C(); await x2.open(); x2.send({ t: 'auth', mode: 'guest', name: 'X2' }); await x2.wait('auth.ok'); x2.send({ t: 'room.join', id: sj.room.id });
  const full = await x2.wait('join.fail'); ok('Oda doluysa bilgi veriliyor', full && /dolu/i.test(full.msg), full?.msg);

  // ---- hesap kaydı + giriş
  a2.send({ t: 'register', user: 'ayse_test' + Date.now() % 10000, pass: 'deniz123' }); const rg = await a2.wait('note', m => /kaydedildi|alınmış|Kullanıcı/.test(m.msg)); ok('Hesap kullanıcı adı/şifre ile kaydediliyor', rg && /kaydedildi/.test(rg.msg));

  console.log('\n' + results.join('\n'));
  console.log(`\nSONUÇ: ${pass} başarılı, ${fail} başarısız`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
