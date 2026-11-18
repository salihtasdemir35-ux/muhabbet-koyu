# Hızlı son doğrulama: ağız, sarhoşluk seviyeleri, sendeleme, yeniden bağlanma, telefon + ekran görüntüleri
import sys, time, os
sys.argv = sys.argv[:1]
exec(open(os.path.join(os.path.dirname(__file__), 'browser_test.py')).read().split("with sync_playwright() as pw:")[0])
with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=ARGS)
    a = br.new_context(viewport={'width': 1280, 'height': 720}, permissions=['microphone']).new_page()
    b = br.new_context(viewport={'width': 1280, 'height': 720}, permissions=['microphone']).new_page()
    enter(a, 'Ayşe'); a.wait_for_selector('text=Oyuna Katıl', timeout=60000)
    a.click('text=➕ Oda Oluştur', no_wait_after=True); time.sleep(0.5); a.click('text=🏖️ Odayı aç', no_wait_after=True)
    a.wait_for_function('() => window.__mk.game.inRoom', timeout=30000)
    room = ev(a, '() => window.__mk.game.room'); invite = ev(a, '() => window.__mk.ui.inviteUrl()')
    enter(b, 'Mehmet', url=invite); b.wait_for_function('() => window.__mk.game.inRoom && window.__mk.game.players.size === 1', timeout=40000)
    walk(a, (0, 15.5)); walk(b, (0, 13))
    ev(a, '() => window.__mk.ui.toggleMic()'); ev(b, '() => window.__mk.ui.toggleMic()'); time.sleep(6)
    ev(b, '() => window.__mk.voice.disableMic()')
    talk = 0
    for _ in range(60):
        talk = max(talk, ev(b, '() => { const c = [...window.__mk.game.players.values()][0].ch; return Math.max(c.talkS, c.cur.mouth); }')); time.sleep(0.08)
    ok('Konuşan karakterin ağzı hareket ediyor', talk > 0.05, f'ağız {talk:.2f}')
    ev(b, '() => window.__mk.net.send({t:"act",k:"adult",on:true})'); time.sleep(0.4)
    ev(b, '() => { window.__mk.net.send({t:"act",k:"buy",id:"raki"}); window.__mk.net.send({t:"act",k:"buy",id:"viski",qty:3}); }'); time.sleep(1.2)
    for _ in range(26):
        if ev(b, '() => window.__mk.game.me.level') >= 4: break
        ev(b, '''() => { const g = window.__mk.game; const it = g.prof.inv.find(i => ["raki","viski"].includes(i.id) && i.sv > 0) || g.prof.inv.find(i => i.id === "raki"); if (it) { g.me.action = null; it.sv > 0 ? g.drink(it.uid) : g.refill(it.uid); } }'''); time.sleep(1.9)
    lv = ev(b, '() => window.__mk.game.me.level'); tp = ev(b, '() => window.__mk.game.me.tipsy')
    ok('İçtikçe sanal denge sistemi değişiyor (sarhoş seviyesine ulaşıldı)', lv >= 3, f'seviye {lv} ({tp:.2f})')
    time.sleep(2.5)
    ok('Diğerleri sarhoşluk seviyesini görüyor (🥴)', ev(a, '() => [...window.__mk.game.players.values()][0].ch.flags.level') >= 3)
    ev(b, '() => { const g = window.__mk.game; g.me.action = null; g.me.stumbleT = 0; g.me.fallCool = 0.5; g.cam.yaw = Math.PI/2; g.keys.add("KeyW"); }')
    seen = set()
    for _ in range(40): seen.add(ev(b, '() => window.__mk.game.me.ch.anim')); time.sleep(0.12)
    ev(b, '() => window.__mk.game.keys.clear()')
    ok('Karakter sendeleyebiliyor / dengesini kaybediyor', 'stagger' in seen or 'fall' in seen, ','.join(sorted(seen)))
    time.sleep(1); b.screenshot(path=f'{OUT}/05_sarhos.png')
    # yeniden bağlanma
    ev(b, '() => window.__mk.net.ws.close()'); time.sleep(1.5)
    b.wait_for_function('() => window.__mk.game.inRoom', timeout=30000)
    ok('Bağlantı kopunca otomatik yeniden bağlanıp odaya dönüyor', ev(b, '() => window.__mk.game.room.id') == room['id'])
    # telefon
    cm = br.new_context(**pw.devices['Pixel 7'], permissions=['microphone']); m = cm.new_page()
    enter(m, 'Telefoncu', url=invite); m.wait_for_function('() => window.__mk.game.inRoom', timeout=60000)
    ok('Telefon + iki bilgisayar aynı odada', ev(m, '() => window.__mk.game.players.size') == 2)
    box = m.locator('.joy').bounding_box(); z0 = ev(m, '() => window.__mk.game.me.pos.z')
    m.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2); m.mouse.down(); m.mouse.move(box['x'] + box['width']/2, box['y'] + 5, steps=4); time.sleep(1.5); m.mouse.up()
    ok('Mobil joystick ile hareket', abs(ev(m, '() => window.__mk.game.me.pos.z') - z0) > 0.5)
    time.sleep(1); m.screenshot(path=f'{OUT}/16_mobil.png'); cm.close()
    # ekran görüntüleri (yüksek kalite tek sayfa)
    b.close(); 
    h = br.new_context(viewport={'width': 1280, 'height': 720}).new_page()
    enter(h, 'Kaptan', q='high', url=invite); h.wait_for_function('() => window.__mk.game.inRoom', timeout=90000)
    walk(h, (0, 11), (-2, 4), (-6, -6))
    ev(h, '() => { const g = window.__mk.game; g.me.ry = Math.PI; g.cam.yaw = Math.PI*0.72; g.cam.pitch = 0.1; g.cam.dist = 7; }')
    for hr, nm in ((11.5, '10_ogle_sahil'), (20.0, '11_gun_batimi'), (22.8, '12_gece')):
        ev(a, f'() => window.__mk.net.send({{t:"host",cmd:"time",v:{hr}}})'); time.sleep(6); h.screenshot(path=f'{OUT}/{nm}.png')
    br.close()
print('\n'.join(results)); bad = [r for r in results if r.startswith('❌')]; print(f'\nSONUÇ: {len(results)-len(bad)} başarılı, {len(bad)} başarısız')
