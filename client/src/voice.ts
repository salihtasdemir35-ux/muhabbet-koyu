// ======================================================================
//  Gerçek zamanlı sesli sohbet: WebRTC (P2P mesh) + 3D mekânsal ses
//  - Yakındaki oyuncu net, uzaktaki kısık; arkadaki ses arkadan gelir (HRTF)
//  - Villa içi/dışı arasında ses boğuklaşır ve azalır
//  - Özel grup sohbeti: grup üyeleri mesafeden bağımsız duyar
//  - Mikrofon yalnızca kullanıcı izniyle açılır, ses hiçbir yerde kaydedilmez
// ======================================================================
import type { AudioEngine } from './audio';

interface Peer { id: string; pc: RTCPeerConnection; sender: RTCRtpSender | null; el?: HTMLAudioElement; src?: MediaStreamAudioSourceNode; analyser?: AnalyserNode; filter?: BiquadFilterNode; panner?: PannerNode; gain?: GainNode; level: number; buf?: Uint8Array<ArrayBuffer>; makingOffer: boolean; polite: boolean; pendingIce: RTCIceCandidateInit[] }

export class Voice {
  peers = new Map<string, Peer>();
  ice: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  mic: MediaStream | null = null; micTrack: MediaStreamTrack | null = null;
  micOn = false; ptt = false; pttDown = false; deafened = false;
  micLevel = 0; private micAnalyser: AnalyserNode | null = null; private micBuf = new Uint8Array(256);
  speaking = false; private speakHold = 0;
  muted = new Set<string>(); blocked = new Set<string>();
  myId = '';
  compat = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  onSpeaking: (on: boolean) => void = () => {};
  onState: () => void = () => {};

  constructor(private send: (o: any) => void, private audio: AudioEngine) {}

  get transmitting() { return this.micOn && !!this.micTrack && (!this.ptt || this.pttDown); }

  async enableMic(): Promise<string | null> {
    if (!navigator.mediaDevices?.getUserMedia) return 'Bu tarayıcı mikrofon desteklemiyor (HTTPS gerekli).';
    try {
      if (!this.mic) {
        this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
        this.micTrack = this.mic.getAudioTracks()[0];
        const src = this.audio.ctx.createMediaStreamSource(this.mic);
        this.micAnalyser = this.audio.ctx.createAnalyser(); this.micAnalyser.fftSize = 512; src.connect(this.micAnalyser);
      }
      this.micOn = true; this.applySend(); this.onState();
      return null;
    } catch (e: any) {
      this.micOn = false; this.onState();
      return e?.name === 'NotAllowedError' ? 'Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verebilirsiniz.' : 'Mikrofon açılamadı: ' + (e?.message ?? e);
    }
  }
  disableMic() { this.micOn = false; this.applySend(); this.onState(); }
  setPTT(on: boolean) { this.ptt = on; this.applySend(); this.onState(); }
  setPTTDown(d: boolean) { if (this.pttDown === d) return; this.pttDown = d; this.applySend(); }
  setDeafened(d: boolean) { this.deafened = d; this.audio.voice.gain.setTargetAtTime(d ? 0 : this.audio.vol.voice, this.audio.ctx.currentTime, 0.05); this.onState(); }
  private applySend() {
    const track = this.transmitting ? this.micTrack : null;
    for (const p of this.peers.values()) p.sender?.replaceTrack(track).catch(() => {});
    if (this.micTrack) this.micTrack.enabled = this.transmitting;
  }

  // ------------------------------------------------------------------ bağlantı
  private create(id: string, initiator: boolean): Peer {
    this.close(id);
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const p: Peer = { id, pc, sender: null, level: 0, makingOffer: false, polite: !initiator, pendingIce: [] };
    if (initiator) {
      const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
      p.sender = tr.sender;
      if (this.transmitting && this.micTrack) tr.sender.replaceTrack(this.micTrack);
    }
    pc.onicecandidate = (e) => { if (e.candidate) this.send({ t: 'rtc', to: id, d: { ice: e.candidate.toJSON() } }); };
    pc.ontrack = (e) => this.attach(p, e.streams[0] ?? new MediaStream([e.track]));
    pc.onnegotiationneeded = async () => {
      try { p.makingOffer = true; await pc.setLocalDescription(); this.send({ t: 'rtc', to: id, d: { sdp: pc.localDescription } }); }
      catch (e) { console.warn('[rtc] offer', e); } finally { p.makingOffer = false; }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') { try { pc.restartIce(); } catch { /* */ } }
      this.onState();
    };
    this.peers.set(id, p);
    return p;
  }
  /** Odaya yeni girdiğimizde mevcut herkese bağlan. */
  connect(id: string) { if (id === this.myId || this.blocked.has(id)) return; this.create(id, true); }

  async onSignal(from: string, d: any) {
    let p = this.peers.get(from);
    if (!p) { if (this.blocked.has(from)) return; p = this.create(from, false); }
    const pc = p.pc;
    try {
      if (d.sdp) {
        const collision = d.sdp.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
        if (collision && !p.polite) return;
        await pc.setRemoteDescription(d.sdp);
        for (const c of p.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        if (d.sdp.type === 'offer') {
          if (!p.sender) {
            const tr = pc.getTransceivers().find(x => x.receiver.track?.kind === 'audio');
            if (tr) { tr.direction = 'sendrecv'; p.sender = tr.sender; if (this.transmitting && this.micTrack) await tr.sender.replaceTrack(this.micTrack); }
          }
          await pc.setLocalDescription(); this.send({ t: 'rtc', to: from, d: { sdp: pc.localDescription } }); }
      } else if (d.ice) {
        if (!pc.remoteDescription) p.pendingIce.push(d.ice); else await pc.addIceCandidate(d.ice).catch(() => {});
      }
    } catch (e) { console.warn('[rtc] signal', e); }
  }

  private attach(p: Peer, stream: MediaStream) {
    const ctx = this.audio.ctx;
    if (!p.el) { p.el = new Audio(); p.el.autoplay = true; (p.el as any).playsInline = true; }
    p.el.srcObject = stream;
    if (this.compat) { p.el.muted = false; p.el.play().catch(() => {}); }
    else {
      p.el.muted = true; p.el.play().catch(() => {}); // Chrome: akışın akması için gerekli
      p.src?.disconnect();
      p.src = ctx.createMediaStreamSource(stream);
      p.analyser = ctx.createAnalyser(); p.analyser.fftSize = 256; p.buf = new Uint8Array(new ArrayBuffer(128));
      p.filter = ctx.createBiquadFilter(); p.filter.type = 'lowpass'; p.filter.frequency.value = 20000;
      p.panner = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 2.2, maxDistance: 40, rolloffFactor: 1.35, coneInnerAngle: 360 });
      p.gain = ctx.createGain();
      p.src.connect(p.analyser); p.src.connect(p.filter).connect(p.panner).connect(p.gain).connect(this.audio.voice);
    }
    if (!p.analyser && this.compat) { // iOS: seviye ölçümü için ayrı analiz (ses çıkışı elementten)
      try { const s = ctx.createMediaStreamSource(stream); p.analyser = ctx.createAnalyser(); p.analyser.fftSize = 256; p.buf = new Uint8Array(new ArrayBuffer(128)); s.connect(p.analyser); } catch { /* */ }
    }
  }

  close(id: string) {
    const p = this.peers.get(id); if (!p) return;
    try { p.pc.close(); } catch { /* */ }
    p.src?.disconnect(); p.gain?.disconnect(); if (p.el) { p.el.srcObject = null; }
    this.peers.delete(id);
  }
  closeAll() { for (const id of [...this.peers.keys()]) this.close(id); }
  block(id: string, on: boolean) { if (on) { this.blocked.add(id); this.close(id); } else this.blocked.delete(id); }

  // ------------------------------------------------------------------ her kare
  /**
   * @param me dinleyici bilgisi; others: id → konum/oda/grup bilgisi
   */
  update(dt: number, me: { x: number; y: number; z: number; fx: number; fz: number; indoors: boolean; group: string | null }, others: Map<string, { x: number; y: number; z: number; indoors: boolean; group: string | null }>) {
    const ctx = this.audio.ctx; const L = ctx.listener; const t = ctx.currentTime;
    if (L.positionX) { L.positionX.setTargetAtTime(me.x, t, 0.05); L.positionY.setTargetAtTime(me.y, t, 0.05); L.positionZ.setTargetAtTime(me.z, t, 0.05); L.forwardX.setTargetAtTime(me.fx, t, 0.05); L.forwardY.setTargetAtTime(0, t, 0.05); L.forwardZ.setTargetAtTime(me.fz, t, 0.05); L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else (L as any).setPosition(me.x, me.y, me.z), (L as any).setOrientation(me.fx, 0, me.fz, 0, 1, 0);
    for (const p of this.peers.values()) {
      const o = others.get(p.id);
      // seviye (ağız animasyonu)
      if (p.analyser && p.buf) {
        p.analyser.getByteTimeDomainData(p.buf); let s = 0; for (let i = 0; i < p.buf.length; i++) { const v = (p.buf[i] - 128) / 128; s += v * v; }
        const rms = Math.sqrt(s / p.buf.length); p.level += (Math.min(1, rms * 6) - p.level) * Math.min(1, dt * 18);
      }
      if (!o) continue;
      const sameGroup = !!me.group && me.group === o.group;
      const privateOther = !!o.group && o.group !== me.group;
      let g = this.muted.has(p.id) || privateOther ? 0 : 1;
      const wall = me.indoors !== o.indoors;
      const dist = Math.hypot(o.x - me.x, o.z - me.z);
      if (!sameGroup && dist > 38) g = 0;               // sahilin öbür ucu duyulmaz
      if (p.panner && p.gain && p.filter) {
        const px = sameGroup ? me.x + (o.x - me.x) / Math.max(1, dist) * 1.5 : o.x, pz = sameGroup ? me.z + (o.z - me.z) / Math.max(1, dist) * 1.5 : o.z;
        p.panner.positionX.setTargetAtTime(px, t, 0.05); p.panner.positionY.setTargetAtTime(o.y + 1.6, t, 0.05); p.panner.positionZ.setTargetAtTime(pz, t, 0.05);
        p.filter.frequency.setTargetAtTime(wall && !sameGroup ? 900 : 20000, t, 0.1);
        p.gain.gain.setTargetAtTime(g * (wall && !sameGroup ? 0.35 : 1), t, 0.08);
      } else if (p.el) { // uyumluluk modu: elle uzaklık zayıflatma
        const att = sameGroup ? 1 : Math.min(1, 2.2 / Math.max(2.2, dist)) * (wall ? 0.35 : 1);
        p.el.volume = this.deafened ? 0 : Math.max(0, Math.min(1, g * att * this.audio.vol.voice));
      }
    }
    // kendi mikrofon seviyem
    if (this.micAnalyser && this.transmitting) {
      this.micAnalyser.getByteTimeDomainData(this.micBuf); let s = 0; for (let i = 0; i < this.micBuf.length; i++) { const v = (this.micBuf[i] - 128) / 128; s += v * v; }
      const rms = Math.sqrt(s / this.micBuf.length); this.micLevel += (Math.min(1, rms * 6) - this.micLevel) * Math.min(1, dt * 18);
    } else this.micLevel *= 0.8;
    const now = this.micLevel > 0.06;
    if (now) this.speakHold = 0.45; else this.speakHold -= dt;
    const sp = this.speakHold > 0;
    if (sp !== this.speaking) { this.speaking = sp; this.onSpeaking(sp); }
  }
  level(id: string) { return this.peers.get(id)?.level ?? 0; }
  connected(id: string) { const s = this.peers.get(id)?.pc.connectionState; return s === 'connected'; }
}
