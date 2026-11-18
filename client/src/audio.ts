// ======================================================================
//  Ses motoru (WebAudio): ortam sesleri, sahil radyosu (üretken, telifsiz
//  müzik), efektler. Hiçbir harici ses dosyası kullanılmaz.
// ======================================================================
export class AudioEngine {
  ctx: AudioContext;
  master: GainNode; music: GainNode; amb: GainNode; sfx: GainNode; voice: GainNode;
  musicDuck: GainNode; musicDist: GainNode;
  vol = { master: 0.9, music: 0.5, amb: 0.7, sfx: 0.8, voice: 1 };
  private noiseBuf: AudioBuffer;
  private ambNodes: Record<string, GainNode> = {};
  private sizzle!: GainNode; private showerG!: GainNode;
  private plucks = new Map<string, AudioBuffer>();
  station = 0; musicOn = true; private nextNote = 0; private step = 0; private schedTimer: any = null;
  started = false;

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.music = c.createGain(); this.musicDuck = c.createGain(); this.musicDist = c.createGain();
    this.music.connect(this.musicDuck).connect(this.musicDist).connect(this.master);
    this.amb = c.createGain(); this.amb.connect(this.master);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.voice = c.createGain(); this.voice.connect(this.master);
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0); let b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = b * 3.5; } // kahverengi gürültü
    this.applyVolumes();
  }
  applyVolumes() {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05); this.music.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.05);
    this.amb.gain.setTargetAtTime(this.vol.amb, t, 0.05); this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05); this.voice.gain.setTargetAtTime(this.vol.voice, t, 0.05);
  }
  async resume() {
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
    if (!this.started) { this.started = true; this.startAmbience(); this.startMusic(); }
  }

  private noise(): AudioBufferSourceNode { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; s.loopStart = Math.random(); return s; }
  private whiteBuf: AudioBuffer | null = null;
  private white(): AudioBufferSourceNode {
    if (!this.whiteBuf) { this.whiteBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate); const d = this.whiteBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = this.ctx.createBufferSource(); s.buffer = this.whiteBuf; s.loop = true; return s;
  }

  // ------------------------------------------------------------------ ortam
  startAmbience() {
    const c = this.ctx;
    const mk = (name: string, src: AudioNode, ...chain: AudioNode[]) => { const g = c.createGain(); g.gain.value = 0; let n: AudioNode = src; for (const x of chain) { n.connect(x); n = x; } n.connect(g).connect(this.amb); this.ambNodes[name] = g; return g; };
    // dalgalar: alçak geçiren gürültü + yavaş LFO
    const wv = this.noise(); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const wg = c.createGain(); const lfo = c.createOscillator(); lfo.frequency.value = 0.11; const lfoG = c.createGain(); lfoG.gain.value = 0.45; lfo.connect(lfoG).connect(wg.gain); wg.gain.value = 0.55;
    const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.07; const l2g = c.createGain(); l2g.gain.value = 350; lfo2.connect(l2g).connect(lp.frequency);
    mk('waves', wv, lp, wg); wv.start(); lfo.start(); lfo2.start();
    // rüzgâr
    const wn = this.white(); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.6;
    const wl = c.createOscillator(); wl.frequency.value = 0.18; const wlg = c.createGain(); wlg.gain.value = 300; wl.connect(wlg).connect(bp.frequency);
    mk('wind', wn, bp); wn.start(); wl.start();
    // yağmur
    const rn = this.white(); const rhp = c.createBiquadFilter(); rhp.type = 'highpass'; rhp.frequency.value = 1500;
    mk('rain', rn, rhp); rn.start();
    // ızgara cızırtısı
    const sz = this.white(); const shp = c.createBiquadFilter(); shp.type = 'highpass'; shp.frequency.value = 3500;
    const sg = c.createGain(); const sl = c.createOscillator(); sl.frequency.value = 9; const slg = c.createGain(); slg.gain.value = 0.3; sl.connect(slg).connect(sg.gain); sg.gain.value = 0.6;
    this.sizzle = mk('sizzle', sz, shp, sg); sz.start(); sl.start();
    // duş
    const shn = this.white(); const sbp = c.createBiquadFilter(); sbp.type = 'bandpass'; sbp.frequency.value = 2500; sbp.Q.value = 0.4;
    this.showerG = mk('shower', shn, sbp); shn.start();
    // cırcır böceği (gece)
    const cr = c.createOscillator(); cr.frequency.value = 4400; const crg = c.createGain(); crg.gain.value = 0;
    const crl = c.createOscillator(); crl.type = 'square'; crl.frequency.value = 18; const crlg = c.createGain(); crlg.gain.value = 0.5; crl.connect(crlg).connect(crg.gain);
    const crm = c.createOscillator(); crm.frequency.value = 0.6; const crmg = c.createGain(); crmg.gain.value = 0.5; crm.connect(crmg).connect(crg.gain);
    cr.connect(crg); mk('crickets', crg); cr.start(); crl.start(); crm.start();
  }
  setAmb(name: string, v: number) { const g = this.ambNodes[name]; if (g) g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.4); }
  /** Her karede: oyuncunun konumuna ve çevreye göre ortam seslerini ayarla. */
  updateAmbience(o: { shoreDist: number; wind: number; rain: number; night: number; grillDist: number; grillItems: number; indoors: boolean; showering: boolean; radioDist: number; speaking: number }) {
    if (!this.started) return;
    const ind = o.indoors ? 0.35 : 1;
    this.setAmb('waves', Math.max(0.05, 0.9 - o.shoreDist / 70) * ind * 0.8);
    this.setAmb('wind', (0.03 + o.wind * 0.12) * ind);
    this.setAmb('rain', o.rain * 0.18 * (o.indoors ? 0.5 : 1));
    this.setAmb('sizzle', o.grillItems ? Math.max(0, 1 - o.grillDist / 9) * 0.05 * Math.min(1, o.grillItems / 3 + 0.4) : 0);
    this.setAmb('shower', o.showering ? 0.12 : 0);
    this.setAmb('crickets', o.night > 0.6 && o.rain < 0.3 ? 0.012 * ind : 0);
    // müzik: radyo uzaklığı + konuşma sırasında kısma (müzik konuşmayı bastırmaz)
    this.musicDist.gain.setTargetAtTime(Math.max(0.15, 1 - o.radioDist / 45) * (o.indoors ? 0.8 : 1), this.ctx.currentTime, 0.3);
    this.musicDuck.gain.setTargetAtTime(o.speaking ? 0.45 : 1, this.ctx.currentTime, 0.2);
    // ara sıra martı / kuş / ateş çıtırtısı
    if (Math.random() < 0.002 && o.night < 0.5 && o.shoreDist < 50) this.gull(Math.max(0.05, 0.35 - o.shoreDist / 150));
    if (Math.random() < 0.004 && o.night < 0.3 && o.shoreDist > 20) this.bird();
    if (o.grillDist < 8 && Math.random() < 0.05) this.crackle(Math.max(0, 1 - o.grillDist / 8) * 0.25);
  }

  // ------------------------------------------------------------------ efektler
  private env(g: GainNode, t: number, a: number, peak: number, dec: number) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  tone(f: number, dur = 0.2, type: OscillatorType = 'sine', vol = 0.2, f2?: number, dest: AudioNode = this.sfx, when = 0) {
    const c = this.ctx, t = c.currentTime + when; const o = c.createOscillator(); const g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    this.env(g, t, 0.01, vol, dur); o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  noiseHit(dur = 0.2, freq = 1000, vol = 0.3, type: BiquadFilterType = 'bandpass', when = 0, q = 1) {
    const c = this.ctx, t = c.currentTime + when; const s = this.white(); const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain();
    this.env(g, t, 0.005, vol, dur); s.connect(f).connect(g).connect(this.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  gull(v = 0.2) { const t0 = Math.random() * 0.1; for (let i = 0; i < 3; i++) { this.tone(1500 + Math.random() * 300, 0.18, 'sawtooth', v * 0.15, 900, this.amb, t0 + i * 0.22); } }
  bird() { for (let i = 0; i < 4; i++) this.tone(2800 + Math.random() * 1500, 0.07, 'sine', 0.03, 3600 + Math.random() * 800, this.amb, i * 0.11); }
  crackle(v: number) { this.noiseHit(0.02, 2500 + Math.random() * 3000, v * 0.4, 'bandpass', 0, 3); }
  play(name: string) {
    if (!this.started) return;
    switch (name) {
      case 'click': this.tone(880, 0.05, 'sine', 0.08); break;
      case 'cast': this.noiseHit(0.35, 1800, 0.25, 'bandpass'); this.tone(600, 0.3, 'sine', 0.03, 1400); break;
      case 'plop': this.tone(500, 0.15, 'sine', 0.25, 120); this.noiseHit(0.1, 800, 0.15); break;
      case 'bite': this.tone(300, 0.1, 'sine', 0.3, 90); this.tone(300, 0.1, 'sine', 0.3, 90, this.sfx, 0.15); break;
      case 'reel': for (let i = 0; i < 12; i++) this.noiseHit(0.015, 4000, 0.12, 'highpass', i * 0.05); break;
      case 'catch': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.15, undefined, this.sfx, i * 0.09)); break;
      case 'rare': [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.16, undefined, this.sfx, i * 0.08)); this.noiseHit(1.2, 6000, 0.05, 'highpass', 0.3); break;
      case 'escape': this.tone(400, 0.4, 'sawtooth', 0.08, 120); break;
      case 'splash': this.noiseHit(0.6, 900, 0.5, 'lowpass'); this.noiseHit(0.4, 3000, 0.2); break;
      case 'smallSplash': this.noiseHit(0.3, 1500, 0.2); break;
      case 'sizzle': this.noiseHit(0.8, 5000, 0.15, 'highpass'); break;
      case 'pour': for (let i = 0; i < 8; i++) this.tone(400 + i * 60 + Math.random() * 40, 0.12, 'sine', 0.05, undefined, this.sfx, i * 0.09); break;
      case 'sip': this.tone(220, 0.12, 'sine', 0.12, 160); this.tone(180, 0.1, 'sine', 0.1, 130, this.sfx, 0.2); break;
      case 'eat': for (let i = 0; i < 4; i++) this.noiseHit(0.05, 1200 + Math.random() * 800, 0.15, 'bandpass', i * 0.18); break;
      case 'coin': this.tone(1318, 0.08, 'square', 0.06); this.tone(1760, 0.2, 'square', 0.06, undefined, this.sfx, 0.07); break;
      case 'pick': this.tone(700, 0.08, 'sine', 0.15, 1100); this.noiseHit(0.05, 3000, 0.1); break;
      case 'door': this.tone(140, 0.2, 'triangle', 0.15, 90); this.noiseHit(0.1, 400, 0.2, 'lowpass'); break;
      case 'fridge': this.tone(90, 0.6, 'sine', 0.08); this.noiseHit(0.1, 600, 0.1); break;
      case 'flush': this.noiseHit(2.2, 700, 0.35, 'bandpass', 0, 0.5); break;
      case 'thud': this.tone(90, 0.25, 'sine', 0.4, 45); this.noiseHit(0.15, 300, 0.3, 'lowpass'); break;
      case 'whoosh': this.noiseHit(0.8, 800, 0.2, 'bandpass', 0, 0.4); break;
      case 'gull': this.gull(0.4); break;
      case 'note': this.tone(988, 0.08, 'sine', 0.06); this.tone(1318, 0.12, 'sine', 0.06, undefined, this.sfx, 0.07); break;
      case 'quest': [659, 784, 988, 1318].forEach((f, i) => this.tone(f, 0.2, 'sine', 0.12, undefined, this.sfx, i * 0.1)); break;
      case 'cough': for (let i = 0; i < 3; i++) this.noiseHit(0.12, 500, 0.25, 'bandpass', i * 0.25, 2); break;
      case 'clink': this.tone(2600, 0.3, 'sine', 0.1); this.tone(3200, 0.25, 'sine', 0.06, undefined, this.sfx, 0.02); break;
      case 'thunder': this.noiseHit(2.5, 120, 0.8, 'lowpass'); break;
      case 'fire': this.noiseHit(0.6, 600, 0.3, 'lowpass'); break;
      case 'jump': this.tone(300, 0.15, 'sine', 0.06, 500); break;
    }
  }

  // ------------------------------------------------------------------ üretken müzik (telifsiz)
  private pluckBuf(freq: number, bright = 0.5, dur = 2): AudioBuffer {
    const key = Math.round(freq) + ':' + bright;
    let b = this.plucks.get(key); if (b) return b;
    const sr = this.ctx.sampleRate; const N = Math.floor(sr * dur); b = this.ctx.createBuffer(1, N, sr); const d = b.getChannelData(0);
    const p = Math.max(2, Math.round(sr / freq)); const buf = new Float32Array(p).map(() => Math.random() * 2 - 1);
    let idx = 0; const k = 0.5 * (0.996 - (1 - bright) * 0.01);
    for (let i = 0; i < N; i++) { const nx = (idx + 1) % p; const v = buf[idx]; buf[idx] = (v + buf[nx]) * k + (v - buf[nx]) * bright * 0.0; d[i] = v; idx = nx; }
    this.plucks.set(key, b); if (this.plucks.size > 120) this.plucks.delete(this.plucks.keys().next().value!);
    return b;
  }
  private pluck(t: number, freq: number, vol = 0.3, bright = 0.5, pan = 0) {
    const s = this.ctx.createBufferSource(); s.buffer = this.pluckBuf(freq, bright); const g = this.ctx.createGain(); g.gain.value = vol;
    const p = this.ctx.createStereoPanner(); p.pan.value = pan; s.connect(g).connect(p).connect(this.music); s.start(t); s.stop(t + 2);
  }
  private keys(t: number, freq: number, dur: number, vol = 0.08, type: OscillatorType = 'sine') { // elektrik piyano / marimba
    const c = this.ctx; const o = c.createOscillator(); const o2 = c.createOscillator(); o.type = type; o2.type = 'sine'; o.frequency.value = freq; o2.frequency.value = freq * 2.003;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = c.createGain(); g2.gain.value = 0.25; o.connect(g); o2.connect(g2).connect(g); g.connect(this.music); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  private pad(t: number, freqs: number[], dur: number, vol = 0.03) {
    const c = this.ctx; const g = c.createGain(); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200; g.connect(f).connect(this.music);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const fr of freqs) for (const det of [-6, 6]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = det; o.connect(g); o.start(t); o.stop(t + dur + 0.1); }
  }
  private drum(t: number, kind: 'kick' | 'snare' | 'hat' | 'def' | 'tek', vol = 0.3) {
    const c = this.ctx;
    if (kind === 'kick' || kind === 'def') { const o = c.createOscillator(); const g = c.createGain(); o.frequency.setValueAtTime(kind === 'def' ? 180 : 120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.connect(g).connect(this.music); o.start(t); o.stop(t + 0.3); }
    else { const s = this.white(); const f = c.createBiquadFilter(); f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : kind === 'tek' ? 2500 : 1800; const g = c.createGain(); const d = kind === 'hat' ? 0.04 : 0.14; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); s.connect(f).connect(g).connect(this.music); s.start(t, Math.random()); s.stop(t + d + 0.02); }
  }
  setStation(on: boolean, st: number) { this.musicOn = on; if (st !== this.station) { this.station = st; this.step = 0; } }
  startMusic() {
    this.nextNote = this.ctx.currentTime + 0.2;
    const tick = () => {
      const c = this.ctx;
      while (this.nextNote < c.currentTime + 0.2) { if (this.musicOn) this.playStep(this.nextNote, this.step); const bpm = [96, 84, 110, 92, 124, 78, 100][this.station]; this.nextNote += 60 / bpm / 2; this.step++; }
    };
    this.schedTimer = setInterval(tick, 50);
  }
  private playStep(t: number, s: number) {
    const st = this.station; const bar = Math.floor(s / 8) % 4; const b = s % 8;
    const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    const rnd = (n: number) => ((Math.sin(s * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
    switch (st) {
      case 0: { // Hafif Türkçe enstrümantal – Hicaz dizisinde saz benzeri
        const hicaz = [62, 63, 66, 67, 69, 70, 72, 74];
        if (b % 2 === 0 || rnd(1) > 0.6) this.pluck(t, hz(hicaz[Math.floor(rnd(2) * 8)] + (bar === 3 ? -12 : 0)), 0.22, 0.6, -0.2);
        if (b === 0 || b === 3 || b === 6) this.drum(t, 'def', 0.18); if (b === 2 || b === 5) this.drum(t, 'tek', 0.06);
        if (b === 0) this.pluck(t, hz(50), 0.25, 0.3, 0.2);
        break;
      }
      case 1: { // akustik gitar – C G Am F arpej
        const ch = [[48, 55, 60, 64, 67], [43, 55, 59, 62, 67], [45, 52, 57, 60, 64], [41, 53, 57, 60, 65]][bar];
        this.pluck(t, hz(ch[[0, 2, 3, 4, 3, 2, 1, 3][b]]), 0.25, 0.5, (b % 2 ? 0.2 : -0.2));
        if (b === 0) this.pluck(t, hz(ch[0] - 12), 0.2, 0.3);
        break;
      }
      case 2: { // caz – ii V I vi, yürüyen bas + fırça
        const roots = [62, 67, 60, 57][bar]; const chord = [[0, 3, 7, 10], [0, 4, 7, 10], [0, 4, 7, 11], [0, 3, 7, 10]][bar];
        if (b === 0 || b === 5) chord.forEach(i => this.keys(t, hz(roots + i), 1.2, 0.035));
        if (b % 2 === 0) this.keys(t, hz(roots - 24 + [0, 4, 7, 9][b / 2]), 0.4, 0.09, 'triangle');
        if (b % 2 === 1 || rnd(3) > 0.7) this.drum(t, 'hat', 0.04);
        if (rnd(4) > 0.75) this.keys(t, hz(roots + 12 + chord[Math.floor(rnd(5) * 4)]), 0.3, 0.03);
        break;
      }
      case 3: { // lounge – pad + yumuşak ritim
        const ch = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]][bar];
        if (b === 0) this.pad(t, ch.map(hz), 3.6, 0.018);
        if (b === 0 || b === 4) this.drum(t, 'kick', 0.18); if (b === 4) this.drum(t, 'snare', 0.05); this.drum(t, 'hat', b % 2 ? 0.02 : 0.035);
        if (b === 2 || b === 7) this.keys(t, hz(ch[Math.floor(rnd(6) * 4)] + 12), 0.5, 0.03);
        break;
      }
      case 4: { // Akdeniz – hızlı buzuki benzeri tremolo
        const sc = [64, 65, 68, 69, 71, 72, 74, 76]; const n = sc[Math.floor((Math.sin(s * 0.7) * 0.5 + 0.5) * 7.99)];
        this.pluck(t, hz(n), 0.18, 0.8, 0.15); if (rnd(7) > 0.5) this.pluck(t + 0.06, hz(n), 0.12, 0.8, 0.15);
        if (b === 0 || b === 4) this.pluck(t, hz(40 + [0, 5, 4, 0][bar]), 0.25, 0.3, -0.2);
        if (b % 2 === 0) this.drum(t, 'tek', 0.05);
        break;
      }
      case 5: { // chill / lofi
        const ch = [[60, 63, 67, 70], [58, 62, 65, 69], [56, 60, 63, 67], [55, 58, 62, 65]][bar];
        if (b === 0) ch.forEach(m => this.keys(t, hz(m), 2.6, 0.03, 'triangle'));
        if (b === 0 || b === 5) this.drum(t, 'kick', 0.2); if (b === 4) this.drum(t, 'snare', 0.07); if (b % 2 === 1) this.drum(t, 'hat', 0.02);
        if (rnd(8) > 0.85) this.noiseHit(0.01, 5000, 0.02, 'highpass'); // plak cızırtısı
        break;
      }
      case 6: { // enstrümantal sahil – marimba
        const sc = [60, 62, 64, 67, 69, 72, 74, 76];
        this.keys(t, hz(sc[[0, 2, 4, 2, 5, 4, 3, 1][b] + (bar % 2)] ?? 72), 0.35, 0.06, 'sine');
        if (b === 0) this.keys(t, hz([48, 53, 55, 50][bar]), 0.8, 0.08, 'triangle');
        if (b === 3 || b === 7) this.drum(t, 'tek', 0.04);
        break;
      }
    }
  }
}
export const STATIONS = ['Hafif Türkçe Enstrümantal', 'Akustik Gitar', 'Caz', 'Lounge', 'Akdeniz Ezgileri', 'Chill', 'Sahil Enstrümantal'];
