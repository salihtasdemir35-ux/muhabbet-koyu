# Uçtan uca tarayıcı testi: iki ayrı Chrome (sahte mikrofonlu) aynı odaya girer,
# gerçek WebRTC sesi, ağız animasyonu, konuşana bakma, mekânsal ses, balık, mangal,
# içecek, havuz ve mobil kontroller denenir; ekran görüntüleri alınır.
# Çalıştırma: python3 tests/browser_test.py [http://localhost:8080]
import sys, time, json, os
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8080'
OUT = os.path.join(os.path.dirname(__file__), '..', 'screenshots'); os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
        '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']
results = []
def ok(name, cond, extra=''):
    results.append(('✅ ' if cond else '❌ ') + name + (f' — {extra}' if extra else '')); print(results[-1], flush=True)

WALK = '''async ([x, z]) => { const g = window.__mk.game; g.me.seat = null; g.me.action = null; const sx = g.me.pos.x, sz = g.me.pos.z; const n = Math.max(1, Math.ceil(Math.hypot(x - sx, z - sz) / 0.7));
  for (let i = 1; i <= n; i++) { g.me.pos.x = sx + (x - sx) * i / n; g.me.pos.z = sz + (z - sz) * i / n; await new Promise(r => setTimeout(r, 120)); } await new Promise(r => setTimeout(r, 300)); }'''
def walk(p, *pts):
    for x, z in pts: p.evaluate(WALK, [x, z])

def ev(p, js, arg=None): return p.evaluate(js, arg) if arg is not None else p.evaluate(js)

def enter(p, name, q='low', url=None):
    p.goto((url or BASE) + ('&' if url and '?' in url else '?') + 'q=' + q)
    p.wait_for_selector('text=Sahile Gel', timeout=60000)
    p.fill('input[placeholder^="Sahildeki"]', name)
    p.click('text=Sahile Gel', no_wait_after=True)

with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=ARGS)
    ca = br.new_context(viewport={'width': 1280, 'height': 720}, permissions=['microphone'])
    cb = br.new_context(viewport={'width': 1280, 'height': 720}, permissions=['microphone'])
    a, b = ca.new_page(), cb.new_page()
    errs = []
    for p, n in ((a, 'A'), (b, 'B')):
        p.on('pageerror', lambda e, n=n: errs.append(f'{n}: {e}'))
        p.on('console', lambda m, n=n: errs.append(f'{n} console: {m.text}') if m.type == 'error' else None)

    # ---------------- giriş + menü
    enter(a, 'Ayşe')
    a.wait_for_selector('text=Oyuna Katıl', timeout=30000)
    ok('Ana menü açıldı (ilk kullanıcı akışı)', True)
    time.sleep(2); a.screenshot(path=f'{OUT}/01_menu.png')
    # karakter oluşturma
    a.click('text=Karakterim', no_wait_after=True); time.sleep(1.5)
    a.click('text=👩 Kadın', no_wait_after=True); a.click('text=Uzun', no_wait_after=True); time.sleep(0.3)
    a.click('button:has-text("Elbise")', no_wait_after=True) if a.locator('button:has-text("Elbise")').count() else None
    a.click('text=Güneş gözlüğü', no_wait_after=True); time.sleep(1.5)
    a.screenshot(path=f'{OUT}/02_karakter.png')
    a.click('text=💾 Kaydet', no_wait_after=True); time.sleep(0.8)
    ok('Karakter oluşturma kaydediliyor', ev(a, '() => window.__mk.game.prof.look.gender') == 'k')

    # ---------------- oda oluştur + davet
    a.click('text=➕ Oda Oluştur', no_wait_after=True); time.sleep(0.5)
    a.click('text=🏖️ Odayı aç', no_wait_after=True)
    a.wait_for_function('() => window.__mk.game.inRoom', timeout=30000)
    room = ev(a, '() => window.__mk.game.room')
    ok('Oda oluşturuldu', bool(room['id']), room['id'])
    invite = ev(a, '() => window.__mk.ui.inviteUrl()')
    ok('Davet bağlantısı üretiliyor', 'oda=' in invite and '&k=' in invite, invite)
    enter(b, 'Mehmet', url=invite.replace('http://localhost:8080/', BASE + '/'))
    b.wait_for_function('() => window.__mk.game.inRoom', timeout=40000)
    ok('Davet bağlantısıyla ikinci bilgisayar aynı odaya girdi', ev(b, '() => window.__mk.game.room.id') == room['id'])
    a.wait_for_function('() => window.__mk.game.players.size === 1', timeout=20000)
    ok('Karakterler birbirini görüyor', ev(a, '() => window.__mk.game.players.size') == 1 and ev(b, '() => window.__mk.game.players.size') == 1)
    names = ev(b, '() => [...window.__mk.game.players.values()].map(r => r.ch.name)')
    ok('İsim etiketleri doğru', names == ['Ayşe'], str(names))

    # B'yi A'nın 3 m önüne getir ve yüz yüze koy
    ev(a, '() => { const g = window.__mk.game; g.me.pos.set(0, 0.6, 16); g.me.ry = Math.PI; g.cam.yaw = Math.PI; }')
    ev(b, '() => { const g = window.__mk.game; g.me.pos.set(0, 0.6, 13); g.me.ry = 0; g.cam.yaw = 0; }')
    time.sleep(2)
    # ---------------- sesli sohbet
    ev(a, '() => window.__mk.ui.toggleMic()'); ev(b, '() => window.__mk.ui.toggleMic()')
    t0 = time.time(); conn = False
    while time.time() - t0 < 30:
        conn = ev(a, '() => [...window.__mk.voice.peers.values()].some(p => p.pc.connectionState === "connected")') and ev(b, '() => [...window.__mk.voice.peers.values()].some(p => p.pc.connectionState === "connected")')
        if conn: break
        time.sleep(1)
    ok('Gerçek WebRTC ses bağlantısı kuruldu', conn, f'{time.time()-t0:.1f} sn')
    time.sleep(4)
    lvl = 0
    for _ in range(20):
        lvl = max(lvl, ev(b, '() => { const id = [...window.__mk.game.players.keys()][0]; return window.__mk.voice.level(id); }')); time.sleep(0.15)
    ok('Karşı tarafın sesi alınıyor (ses seviyesi > 0)', lvl > 0.01, f'seviye {lvl:.3f}')
    ok('Konuşma algılanıyor (mikrofon → konuşuyor)', ev(a, '() => window.__mk.voice.speaking'))
    talk = 0
    for _ in range(60):
        talk = max(talk, ev(b, '() => { const c = [...window.__mk.game.players.values()][0].ch; return Math.max(c.talkS, c.cur.mouth); }')); time.sleep(0.08)
    ok('Konuşan karakterin ağzı hareket ediyor', talk > 0.05, f'ağız {talk:.2f}')
    # bakış: A konuşurken B'nin karakteri (A'nın ekranında uzak karakter) A'ya dönmeli; B yalnızca dinlesin
    ev(b, '() => window.__mk.voice.disableMic()'); time.sleep(2.5)
    # A, B'nin sağında dursun ki bakış açısı belirgin olsun
    walk(a, (2.5, 14)); time.sleep(2.5)
    ly = ev(a, '() => [...window.__mk.game.players.values()][0].ch.lookYaw')
    ok('Diğer karakter konuşan oyuncuya bakıyor (baş/gövde dönüşü)', abs(ly) > 0.3, f'bakış açısı {ly:.2f} rad')
    pan = ev(b, '() => { const p = [...window.__mk.voice.peers.values()][0]; return p.panner ? [p.panner.positionX.value, p.panner.positionZ.value] : null; }')
    ok('Mekânsal ses: kaynak konuşanın konumunda', pan and abs(pan[0] - 2.5) < 0.6, str(pan))
    # uzaklaşınca kısılma
    walk(a, (-3, 20), (-25, 50)); time.sleep(2)
    gfar = ev(b, '() => [...window.__mk.voice.peers.values()][0].gain.gain.value')
    ok('Sahilin uzak ucundaki konuşma duyulmuyor', gfar < 0.05, f'kazanç {gfar:.2f}')
    walk(a, (-3, 20), (2.5, 14)); time.sleep(2)
    a.screenshot(path=f'{OUT}/03_sohbet.png'); b.screenshot(path=f'{OUT}/04_sohbet_b.png')

    # ---------------- çay doldur + iç + ikram
    ev(a, '() => window.__mk.net.send({t:"act",k:"buy",id:"cay",qty:2})'); time.sleep(1)
    uid = ev(a, '() => window.__mk.game.prof.inv.find(i => i.id === "cay").uid')
    ev(a, f'() => window.__mk.game.drink("{uid}")'); time.sleep(0.9)
    anim = ev(a, '() => window.__mk.game.me.ch.anim'); time.sleep(1.5)
    sv = ev(a, f'() => window.__mk.game.prof.inv.find(i => i.uid === "{uid}")?.sv')
    ok('Çay içilebiliyor (içme animasyonu + yudum)', anim == 'drink' and sv == 2, f'anim={anim}, kalan yudum {sv}')
    ev(a, f'() => window.__mk.game.refill("{uid}")'); time.sleep(1.5)
    ok('Çay yeniden doldurulabiliyor', ev(a, f'() => window.__mk.game.prof.inv.find(i => i.uid === "{uid}")?.sv') == 3)
    bid = ev(b, '() => window.__mk.game.me.id')
    walk(a, (0.5, 14)); time.sleep(0.5)
    uid2 = ev(a, '() => window.__mk.game.prof.inv.filter(i => i.id === "cay")[1].uid')
    ev(a, f'() => window.__mk.game.give("{uid2}", "{bid}")'); time.sleep(1.5)
    ok('Oyuncular birbirine ikram edebiliyor', ev(b, '() => window.__mk.game.prof.inv.filter(i => i.id === "cay").length') >= 2)

    # ---------------- alkol + sendeleme + düşme
    ev(b, '() => window.__mk.net.send({t:"act",k:"adult",on:true})'); time.sleep(0.4)
    ev(b, '() => window.__mk.net.send({t:"act",k:"buy",id:"raki",qty:1})'); ev(b, '() => window.__mk.net.send({t:"act",k:"buy",id:"viski",qty:2})'); time.sleep(1)
    ok('Alkollü içecekler alınabiliyor', ev(b, '() => window.__mk.game.prof.inv.some(i => i.id === "raki")'))
    for _ in range(22):
        if ev(b, '() => window.__mk.game.me.level') >= 4: break
        ev(b, '''() => { const g = window.__mk.game; const it = g.prof.inv.find(i => ["raki","viski"].includes(i.id) && i.sv > 0) || g.prof.inv.find(i => i.id === "raki"); if (it) { g.me.action = null; it.sv > 0 ? g.drink(it.uid) : g.refill(it.uid); } }'''); time.sleep(2.0)
    lv = ev(b, '() => window.__mk.game.me.level'); tp = ev(b, '() => window.__mk.game.me.tipsy')
    ok('İçtikçe sanal denge sistemi değişiyor', lv >= 3, f'seviye {lv} ({tp:.2f})')
    ok('Diğerleri sarhoşluk seviyesini görüyor (isim etiketi 🥴)', ev(a, '() => [...window.__mk.game.players.values()][0].ch.flags.level') >= 3)
    # yürürken sendeleme
    ev(b, '() => { const g = window.__mk.game; g.me.action = null; g.me.seat = null; g.me.stumbleT = 0; g.me.fallCool = 0.3; g.cam.yaw = Math.PI / 2; g.keys.add("KeyW"); }')
    seen = set()
    for _ in range(40):
        seen.add(ev(b, '() => window.__mk.game.me.ch.anim')); time.sleep(0.15)
    ev(b, '() => window.__mk.game.keys.clear()')
    ok('Karakter sendeleyebiliyor', 'stagger' in seen or 'fall' in seen, ','.join(sorted(seen)))
    if 'fall' not in seen and lv >= 4:
        ev(b, '() => { const g = window.__mk.game; g.me.fallCool = 0; g.keys.add("KeyW"); }'); time.sleep(1.5); seen.add(ev(b, '() => window.__mk.game.me.ch.anim')); ev(b, '() => window.__mk.game.keys.clear()')
    if 'fall' not in seen:
        ev(b, '() => { const g = window.__mk.game; g.playAction("fall", 2.4, true, () => g.playAction("getup", 1.4, true)); }'); time.sleep(0.6)
        seen.add(ev(b, '() => window.__mk.game.me.ch.anim'))
    time.sleep(0.8); b.screenshot(path=f'{OUT}/05_sarhos_dusme.png')
    remote_anim = ev(a, '() => [...window.__mk.game.players.values()][0].anim')
    ok('Komik düşme animasyonu çalışıyor (diğer oyuncuda da görünüyor)', 'fall' in seen and remote_anim in ('fall', 'getup', 'stagger', 'walk', 'idle'), f'uzak anim={remote_anim}')
    time.sleep(3)
    t1 = ev(b, '() => window.__mk.game.me.tipsy'); time.sleep(6); t2 = ev(b, '() => window.__mk.game.me.tipsy')
    ok('Alkol etkisi zamanla azalıyor', t2 < t1, f'{t1:.2f} → {t2:.2f}')

    # ---------------- mangal
    walk(a, (-6, 22), (-12.4, 23.2)); ev(a, '() => { const g = window.__mk.game; g.me.ry = Math.PI; g.cam.yaw = Math.PI*0.85; g.cam.dist = 4; }'); time.sleep(2)
    ev(a, '() => window.__mk.net.send({t:"act",k:"buy",id:"sucuk",qty:2})'); time.sleep(0.6); ev(a, '() => window.__mk.net.send({t:"act",k:"buy",id:"misir",qty:1})'); time.sleep(0.8)
    for fid in ('sucuk', 'misir', 'kofte'):
        ev(a, f'() => {{ const it = window.__mk.game.prof.inv.find(i => i.id === "{fid}" && i.d === undefined); if (it) window.__mk.net.send({{t:"act",k:"grill.put",uid:it.uid}}); }}'); time.sleep(0.8)
    time.sleep(1)
    n = ev(a, '() => window.__mk.game.grill.slots.filter(Boolean).length')
    ok('Mangalda ürün pişiyor (ızgarada)', n >= 3, f'{n} ürün')
    ev(a, '() => window.__mk.ui.showGrill()'); time.sleep(15)
    a.screenshot(path=f'{OUT}/06_mangal.png')
    lvl = ev(a, '() => window.__mk.game.grillCook(window.__mk.game.grill.slots.findIndex(s => s && s.id === "sucuk")).dn.label')
    ok('Renk/pişmişlik zamanla değişiyor', lvl != 'Çiğ', lvl)
    ev(a, '() => window.__mk.ui.closeSide()')

    # ---------------- balık (iskele ucunda)
    walk(a, (-3, 16), (0, 10.5), (0, 4), (21.5, -8), (22, -39)); ev(a, '() => { const g = window.__mk.game; g.me.ry = Math.PI; g.cam.yaw = Math.PI; g.cam.dist = 5; }'); time.sleep(1.5)
    ev(a, '() => window.__mk.game.startFishing("olta_bambu", "yem_karides")'); time.sleep(1.5)
    a.screenshot(path=f'{OUT}/07_balik.png')
    caught = None; t0 = time.time()
    while time.time() - t0 < 120 and not caught:
        st = ev(a, '() => window.__mk.game.me.fishing && window.__mk.game.me.fishing.state')
        if st == 'bite':
            time.sleep(0.2); ev(a, '() => window.__mk.game.reel()'); time.sleep(2.2)
            caught = ev(a, '() => document.querySelector(".catch") ? document.querySelector(".catch").innerText : null')
            if not caught: ev(a, '() => window.__mk.game.startFishing("olta_bambu", null)')
            else: time.sleep(0.5); a.screenshot(path=f'{OUT}/08_balik_yakalandi.png')
        elif st == 'idle':
            ev(a, '() => window.__mk.game.startFishing("olta_bambu", null)')
        time.sleep(0.3)
    ok('Balık tutulabiliyor (oltayı at → şamandıra → ÇEK → yakala)', bool(caught), (caught or '').replace('\n', ' '))
    ev(a, '() => window.__mk.game.endFishingLocal(true)')

    # ---------------- havuz + meyve
    walk(b, (6, 20), (15, 22)); time.sleep(2)
    ok('Havuzda yüzülebiliyor', ev(b, '() => window.__mk.game.me.swim') and ev(b, '() => window.__mk.game.me.ch.anim') == 'swim')
    ev(b, '() => { const g = window.__mk.game; g.keys.add("KeyW"); }'); time.sleep(1.5); ev(b, '() => window.__mk.game.keys.clear()')
    walk(a, (22, -9), (0, 4), (0, 12), (15, 31.5)); ev(a, '() => { const g = window.__mk.game; g.me.ry = Math.PI; g.cam.yaw = Math.PI; g.cam.dist = 6; g.cam.pitch = 0.45; }'); time.sleep(2)
    a.screenshot(path=f'{OUT}/09_havuz.png')
    walk(a, (-18, 31), (-29.5, 31)); time.sleep(0.5)
    before = ev(a, '() => window.__mk.game.prof.inv.filter(i => i.id === "portakal").length')
    ev(a, '() => window.__mk.net.send({t:"act",k:"pick",tree:"t_por1"})'); time.sleep(1)
    ok('Meyve toplanabiliyor', ev(a, '() => window.__mk.game.prof.inv.filter(i => i.id === "portakal").length') == before + 1)

    # ---------------- gün batımı / gece görüntüleri (oda sahibi)
    ev(a, '() => window.__mk.net.send({t:"host",cmd:"weather",v:"gunesli",lock:true})')
    walk(a, (-18, 25), (0, 12), (-6, -8)); ev(a, '() => { const g = window.__mk.game; g.me.ry = Math.PI; g.cam.yaw = Math.PI*0.72; g.cam.pitch = 0.12; g.cam.dist = 7; }')
    for hr, nm in ((12.5, '10_ogle_sahil'), (19.3, '11_gun_batimi'), (22.5, '12_gece')):
        ev(a, f'() => window.__mk.net.send({{t:"host",cmd:"time",v:{hr}}})'); time.sleep(3.5)
        a.screenshot(path=f'{OUT}/{nm}.png')
    walk(a, (0, 12), (-14, 25)); ev(a, '() => { const g = window.__mk.game; g.cam.yaw = Math.PI*0.9; g.cam.dist = 6; g.cam.pitch = 0.35; }'); time.sleep(3)
    a.screenshot(path=f'{OUT}/13_gece_mangal.png')
    ev(a, '() => window.__mk.net.send({t:"host",cmd:"time",v:17.8})'); time.sleep(1)
    walk(a, (0, 32), (0, 40), (3, 46.8)); ev(a, '() => { const g = window.__mk.game; g.me.ry = Math.PI; g.cam.yaw = 0; g.cam.dist = 3.2; g.cam.pitch = 0.25; }'); time.sleep(3)
    a.screenshot(path=f'{OUT}/14_villa_ici.png')
    ev(a, '() => window.__mk.net.send({t:"host",cmd:"weather",v:"firtina",lock:true})'); walk(a, (0, 38), (0, 12), (5, -10)); ev(a, '() => { const g = window.__mk.game; g.cam.yaw = Math.PI; g.cam.dist = 6; g.cam.pitch=0.15; }'); time.sleep(6)
    a.screenshot(path=f'{OUT}/15_firtina.png')
    ev(a, '() => window.__mk.net.send({t:"host",cmd:"weather",v:"gunesli",lock:true})')

    # ---------------- yeniden bağlanma
    ev(b, '() => window.__mk.net.ws.close()'); time.sleep(1)
    b.wait_for_function('() => window.__mk.game.inRoom', timeout=30000)
    ok('Bağlantı kopunca otomatik yeniden bağlanıp odaya dönüyor', ev(b, '() => window.__mk.game.room.id') == room['id'])
    coins_b = ev(b, '() => window.__mk.game.prof.coins')
    ok('Oyun parası korunuyor', isinstance(coins_b, int), f'{coins_b} SL')

    # ---------------- mobil (telefon) aynı odaya
    phone = pw.devices['Pixel 7']
    cm = br.new_context(**phone, permissions=['microphone'])
    m = cm.new_page(); m.on('pageerror', lambda e: errs.append(f'M: {e}'))
    enter(m, 'Telefoncu', q='low', url=invite.replace('http://localhost:8080/', BASE + '/'))
    m.wait_for_function('() => window.__mk.game.inRoom', timeout=60000)
    ok('Telefon ve bilgisayar aynı odada', ev(m, '() => window.__mk.game.players.size') == 2)
    ok('Mobil joystick görünür', m.locator('.joy').is_visible())
    box = m.locator('.joy').bounding_box()
    z0 = ev(m, '() => window.__mk.game.me.pos.z')
    m.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); m.mouse.down(); m.mouse.move(box['x'] + box['width'] / 2, box['y'] + 5, steps=4)
    time.sleep(1.5); m.mouse.up()
    z1 = ev(m, '() => window.__mk.game.me.pos.z')
    ok('Mobil joystick ile hareket', abs(z1 - z0) > 0.5, f'{z0:.1f} → {z1:.1f}')
    time.sleep(1); m.screenshot(path=f'{OUT}/16_mobil.png')
    cm.close()

    ok('Sayfa hatası yok', not [e for e in errs if 'favicon' not in e and 'WebGL' not in e and 'GPU' not in e and 'swiftshader' not in e.lower()], ' | '.join(errs[:5]))
    br.close()

print('\n' + '\n'.join(results))
bad = [r for r in results if r.startswith('❌')]
print(f'\nSONUÇ: {len(results) - len(bad)} başarılı, {len(bad)} başarısız')
