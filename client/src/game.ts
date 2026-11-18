// ======================================================================
//  Oyun çekirdeği: yerel oyuncu, uzak oyuncular (ara değerleme), kamera,
//  etkileşimler, balık tutma, mangal, içecekler, sarhoşluk, olaylar
// ======================================================================
import * as THREE from 'three';
import { World, Quality } from './world';
import { Character } from './character';
import { FX } from './fx';
import { AudioEngine } from './audio';
import { Voice } from './voice';
import { Net } from './net';
import { makeFood, applyCook, makeDrink, makeFruit, makeFish } from './items';
import {
  SEATS, Seat, STATIC_COLLIDERS, doorBox, floorY, waterAt, inPool, inVilla, FISH_SPOTS, fishSpotAt, TREES, PALMS,
  GRILL, BAR, FRIDGE, TV, SHOWER, RADIO, DOORS, POOL, GARDEN, TERRACE, VILLA, beachY, WC, WORLD_BOUNDS, Box,
} from '../../shared/world';
import { DRINKS, FOODS, FISH, FRUITS, EMOTES, tipsyLevel, InvItem, Look, cookDef, doneness, FURNITURE, itemName } from '../../shared/data';

export interface Settings { camSway: boolean; showTipsy: boolean; alcohol: boolean; chatCam: boolean; quality: Quality; invertY: boolean; sens: number }
interface Remote {
  id: string; name: string; look: Look; ch: Character; buf: { t: number; x: number; y: number; z: number; ry: number; a: string; it: string; s: string | null; sw: number }[];
  tipsy: number; speaking: boolean; group: string | null; host: boolean; pos: THREE.Vector3; ry: number; indoors: boolean;
  bob?: { m: THREE.Mesh; line: THREE.Line; dip: number; target: THREE.Vector3 }; anim: string;
}
interface Prop { d: any; obj: THREE.Object3D }
interface Interact { kind: string; label: string; key: string; x: number; z: number; data?: any; r: number }

const TABLES = [
  { x0: -16.5, x1: -11.5, z0: 26.5, z1: 27.5, y: GARDEN.y + 0.82 },
  { x0: -8.9, x1: -7.1, z0: -0.4, z1: 0.4, y: beachY(-8, 0) + 0.77 },
  { x0: -8.5, x1: -4.5, z0: 34.5, z1: 35.5, y: TERRACE.y + 0.79 },
  { x0: -8.9, x1: -3.7, z0: 41.7, z1: 43, y: VILLA.floor + 0.79 },
  { x0: -8.9, x1: -5.1, z0: 48.5, z1: 49.3, y: VILLA.floor + 0.97 },
  { x0: 8.2, x1: 11.8, z0: 1.3, z1: 1.9, y: beachY(10, 2) + 1.16 },
  { x0: 2.9, x1: 4.1, z0: 46.1, z1: 46.7, y: VILLA.floor + 0.45 },
];

export class Game {
  renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; world: World; fx: FX;
  me = {
    id: '', name: '', ch: null as unknown as Character, pos: new THREE.Vector3(0, GARDEN.y, 14), ry: Math.PI, vy: 0, onGround: true,
    seat: null as Seat | null, swim: false, fishing: null as null | { state: string; spot: any; t: number; target: THREE.Vector3; bob: THREE.Mesh; line: THREE.Line; dip: number },
    action: null as null | { anim: string; until: number; lock: boolean; onEnd?: () => void }, speed: 0, tipsy: 0, level: 0,
    held: null as null | { uid: string; id: string }, heldKey: '', group: null as string | null, inGrill: false, dozeUntil: 0,
    drift: 0, stumbleT: 4, fallCool: 15, look: null as unknown as Look, lastSwimQuest: false, showering: 0, sitT: 0,
  };
  players = new Map<string, Remote>();
  grill = { lit: true, slots: [] as any[], recv: 0 };
  grillObjs: (THREE.Object3D | null)[] = new Array(10).fill(null); grillFlip: number[] = new Array(10).fill(0); grillSide: number[] = new Array(10).fill(0);
  props = new Map<string, Prop>();
  prof: any = null;
  inRoom = false; room: any = null; hostId = ''; alcoholRoom = true;
  env = { hour: 17.5, at: 0, rate: 1 / 120, weather: 'gunesli', music: { on: true, station: 0, vol: 0.6 }, tv: false };
  settings: Settings;
  keys = new Set<string>();
  joy = { x: 0, y: 0, active: false };
  cam = { yaw: Math.PI, pitch: 0.28, dist: 5.2, lastManual: 0, sway: 0, curPos: new THREE.Vector3() };
  interact: Interact | null = null;
  raycaster = new THREE.Raycaster();
  clock = new THREE.Clock();
  lastSend = 0; t = 0;
  menuMode = true; previewCh: Character | null = null;
  onUI: (ev: string, data?: any) => void = () => {};
  private tmpV = new THREE.Vector3();
  private seatTaken = new Set<string>();
  private dynSeats: Seat[] = [];
  private gullFx: { o: THREE.Object3D; t: number; from: THREE.Vector3; to: THREE.Vector3; item?: THREE.Object3D }[] = [];
  private flyingUmb: { o: THREE.Object3D; t: number; home: THREE.Vector3 }[] = [];
  private fallingFruit: { o: THREE.Object3D; v: THREE.Vector3; id: string }[] = [];
  private showerFx = 0;
  fps = 60; private fpsAcc = 0; private fpsN = 0; private dpr = 1;

  constructor(public canvas: HTMLCanvasElement, public audio: AudioEngine, public net: Net, public voice: Voice, settings: Settings) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== 'low', powerPreference: 'high-performance' });
    this.dpr = Math.min(window.devicePixelRatio, settings.quality === 'high' ? 2 : settings.quality === 'med' ? 1.5 : 1);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.5;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = settings.quality !== 'low'; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 5000);
    this.world = new World(this.renderer, settings.quality);
    this.fx = new FX(this.world.scene, settings.quality === 'low' ? 200 : 600);
    this.world.update(0, new THREE.Vector3(0, 2, 10)); this.world.refreshEnv();
    addEventListener('resize', () => this.resize());
    this.bindInput();
  }
  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); }

  // ------------------------------------------------------------------ menü önizleme
  showPreview(look: Look, name: string) {
    if (!this.previewCh) { this.previewCh = new Character(look, name); this.world.scene.add(this.previewCh.root); }
    else { this.previewCh.setLook(look); this.previewCh.setName(name); }
    this.previewCh.root.position.set(1.2, TERRACE.y, 33.2); this.previewCh.root.rotation.y = Math.PI - 0.35; this.previewCh.play('idle');
  }
  hidePreview() { if (this.previewCh) { this.world.scene.remove(this.previewCh.root); this.previewCh = null; } }

  // ------------------------------------------------------------------ oda
  enterRoom(m: any) {
    this.leaveRoomLocal();
    this.inRoom = true; this.menuMode = false; this.hidePreview();
    this.room = m.room; this.hostId = m.hostId; this.me.id = m.you; this.alcoholRoom = m.room.alcohol;
    this.voice.myId = m.you;
    const self = m.players.find((p: any) => p.id === m.you);
    this.me.name = self.name; this.me.look = self.look; this.me.tipsy = self.tipsy; this.me.level = tipsyLevel(self.tipsy);
    this.me.ch = new Character(self.look, self.name); this.me.ch.isLocal = true; this.world.scene.add(this.me.ch.root);
    this.me.pos.set(self.x, floorY(self.x, self.z), self.z); this.me.ry = self.ry; this.cam.yaw = self.ry;
    this.me.seat = null; this.me.swim = false; this.me.fishing = null; this.me.action = null; this.setHeld(null);
    for (const p of m.players) if (p.id !== m.you) { this.addRemote(p); this.voice.connect(p.id); }
    this.setGrill(m.grill);
    for (const [id, n] of Object.entries(m.trees)) this.world.setTreeFruit(id, n as number);
    for (const [id, open] of Object.entries(m.doors)) this.world.setDoor(id, open as boolean);
    this.setEnv(m.env);
    for (const pr of m.props) this.setProp(pr);
    this.serverClockOffset = m.serverTime - Date.now();
    this.onUI('room');
  }
  serverClockOffset = 0;
  leaveRoomLocal() {
    for (const id of [...this.players.keys()]) this.removeRemote(id);
    this.voice.closeAll();
    if (this.me.ch) { this.world.scene.remove(this.me.ch.root); }
    this.endFishingLocal();
    for (const p of this.props.values()) this.world.scene.remove(p.obj); this.props.clear(); this.dynSeats = [];
    for (let i = 0; i < 10; i++) if (this.grillObjs[i]) { this.world.scene.remove(this.grillObjs[i]!); this.grillObjs[i] = null; }
    this.inRoom = false;
  }
  addRemote(p: any) {
    this.removeRemote(p.id);
    const ch = new Character(p.look, p.name); this.world.scene.add(ch.root);
    ch.root.position.set(p.x, p.y, p.z); ch.root.rotation.y = p.ry;
    const r: Remote = { id: p.id, name: p.name, look: p.look, ch, buf: [], tipsy: p.tipsy, speaking: p.speaking, group: p.group, host: p.host, pos: new THREE.Vector3(p.x, p.y, p.z), ry: p.ry, indoors: inVilla(p.x, p.z), anim: p.a };
    ch.flags.level = tipsyLevel(p.tipsy); ch.flags.host = p.host; ch.flags.group = !!p.group; ch.drawTag();
    this.players.set(p.id, r);
    this.onUI('players');
  }
  removeRemote(id: string) {
    const r = this.players.get(id); if (!r) return;
    this.world.scene.remove(r.ch.root); if (r.bob) { this.world.scene.remove(r.bob.m, r.bob.line); }
    this.players.delete(id); this.voice.close(id); this.onUI('players');
  }
  onSnap(m: any) {
    const t = performance.now();
    for (const [id, x, y, z, ry, a, it, s, sw] of m.ps) {
      if (id === this.me.id) continue;
      const r = this.players.get(id); if (!r) continue;
      r.buf.push({ t, x, y, z, ry, a, it, s, sw }); if (r.buf.length > 20) r.buf.shift();
    }
  }
  onPlayerUpdate(m: any) {
    if (m.id === this.me.id) {
      if (m.tipsy !== undefined) { this.me.tipsy = m.tipsy; const lv = tipsyLevel(m.tipsy); if (lv !== this.me.level) { this.me.level = lv; this.me.ch.flags.level = lv; this.me.ch.drawTag(); this.onUI('tipsy'); } }
      if (m.group !== undefined) { this.me.group = m.group; this.me.ch.flags.group = !!m.group; this.me.ch.drawTag(); this.onUI('players'); }
      if (m.look) { this.me.look = m.look; this.me.ch.setLook(m.look); this.setHeld(this.me.held ? this.me.held.uid : null); }
      if (m.name) { this.me.name = m.name; this.me.ch.setName(m.name); }
      return;
    }
    const r = this.players.get(m.id); if (!r) return;
    if (m.tipsy !== undefined) { r.tipsy = m.tipsy; r.ch.flags.level = tipsyLevel(m.tipsy); }
    if (m.speaking !== undefined) r.speaking = m.speaking;
    if (m.group !== undefined) { r.group = m.group; r.ch.flags.group = !!m.group; }
    if (m.look) { r.look = m.look; r.ch.setLook(m.look); r.ch.heldKey = '__'; }
    if (m.name) { r.name = m.name; r.ch.setName(m.name); }
    r.ch.drawTag(); this.onUI('players');
  }
  setHost(id: string) { this.hostId = id; for (const r of this.players.values()) { r.host = r.id === id; r.ch.flags.host = r.host; r.ch.drawTag(); } if (this.me.ch) { this.me.ch.flags.host = id === this.me.id; this.me.ch.drawTag(); } this.onUI('host'); }
  isHost() { return this.hostId === this.me.id; }

  setEnv(e: any) {
    this.env = { ...this.env, ...e, at: performance.now() };
    this.world.weather = e.weather; this.world.tvOn = !!e.tv;
    this.audio.setStation(e.music.on, e.music.station);
    this.onUI('env');
  }
  hourNow() { return (this.env.hour + (performance.now() - this.env.at) * this.env.rate / 1000) % 24; }

  // ------------------------------------------------------------------ ızgara
  setGrill(g: any) {
    this.grill = { lit: g.lit, slots: g.slots, recv: performance.now() };
    this.world.coals.emissiveIntensity = g.lit ? 1.2 : 0.05;
    g.slots.forEach((s: any, i: number) => {
      const cur = this.grillObjs[i];
      if (!s) { if (cur) { this.world.scene.remove(cur); this.grillObjs[i] = null; } return; }
      if (!cur || cur.userData.uid !== s.uid) {
        if (cur) this.world.scene.remove(cur);
        const o = makeFood(s.id, s.w); o.userData.uid = s.uid; o.position.copy(this.world.grillSlotPos[i]);
        o.rotation.y = (i % 2 ? 0.3 : -0.3) + (FISH.some(f => f.id === s.id) ? Math.PI / 2 : 0);
        if (FISH.some(f => f.id === s.id)) { const fs = (o.children[0] as THREE.Object3D); fs.rotation.x = Math.PI / 2; fs.position.y = 0.03; fs.scale.setScalar(Math.min(1, 0.32 / (fs.userData.len || 0.3))); }
        this.world.scene.add(o); this.grillObjs[i] = o; this.grillSide[i] = s.side;
      }
      if (this.grillSide[i] !== s.side) { this.grillSide[i] = s.side; this.grillFlip[i] = 0.35; }
    });
    this.onUI('grill');
  }
  grillCook(i: number) {
    const s = this.grill.slots[i]; if (!s) return null;
    const el = this.grill.lit ? (performance.now() - this.grill.recv) / 1000 : 0;
    const a = s.cookA + (s.side === 0 ? el : 0), b = s.cookB + (s.side === 1 ? el : 0);
    return { a, b, dn: doneness(a, b, cookDef(s.id)) };
  }

  // ------------------------------------------------------------------ eşyalar
  setProp(pr: any) {
    const ex = this.props.get(pr.pid);
    if (ex) { this.world.scene.remove(ex.obj); }
    let obj: THREE.Object3D;
    if (pr.kind === 'drink') {
      const dd = DRINKS.find(d => d.id === pr.id)!;
      obj = makeDrink(pr.id, pr.tipped ? 0 : (pr.sv ?? dd.sips) / dd.sips);
      if (pr.tipped) { obj.rotation.z = Math.PI / 2; obj.position.y += 0.03; }
    } else obj = this.makeFurniture(pr.id);
    obj.position.set(pr.x, pr.y + (pr.tipped ? 0.035 : 0), pr.z); obj.rotation.y = pr.ry ?? 0;
    if (pr.tipped) obj.rotation.z = Math.PI / 2;
    this.world.scene.add(obj);
    this.props.set(pr.pid, { d: pr, obj });
    this.rebuildDynSeats();
  }
  delProp(pid: string) { const p = this.props.get(pid); if (p) { this.world.scene.remove(p.obj); this.props.delete(pid); this.rebuildDynSeats(); } }
  rebuildDynSeats() {
    this.dynSeats = [];
    for (const p of this.props.values()) {
      if (p.d.kind !== 'furn') continue;
      const kind = FURNITURE.find(f => f.id === p.d.id)?.kind;
      if (kind === 'chair' || kind === 'pouf') this.dynSeats.push({ id: 'prop_' + p.d.pid, x: p.d.x, z: p.d.z, y: p.d.y + (kind === 'pouf' ? 0.4 : 0.46), ry: p.d.ry, type: 'chair' });
      if (kind === 'sunbed') this.dynSeats.push({ id: 'prop_' + p.d.pid, x: p.d.x, z: p.d.z, y: p.d.y + 0.38, ry: p.d.ry, type: 'sunbed' });
    }
  }
  makeFurniture(id: string): THREE.Object3D {
    const kind = FURNITURE.find(f => f.id === id)?.kind;
    const g = new THREE.Group();
    const box = (w: number, h: number, d: number, c: number, x: number, y: number, z: number, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 })); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; g.add(m); return m; };
    if (kind === 'chair') { box(0.46, 0.04, 0.44, 0x1d5f8a, 0, 0.45, 0); box(0.46, 0.45, 0.03, 0x1d5f8a, 0, 0.7, -0.21, -0.15); for (const s of [-1, 1]) { box(0.03, 0.5, 0.5, 0xcccccc, s * 0.22, 0.25, 0, 0.5); box(0.03, 0.5, 0.5, 0xcccccc, s * 0.22, 0.25, 0, -0.5); } }
    else if (kind === 'sunbed') { box(0.7, 0.06, 1.9, 0xffffff, 0, 0.32, 0.15); box(0.62, 0.07, 1.25, 0xe76f51, 0, 0.38, 0.45); box(0.62, 0.07, 0.75, 0xe76f51, 0, 0.55, -0.55, -0.6); for (const [x, z] of [[-0.3, -0.7], [0.3, -0.7], [-0.3, 0.95], [0.3, 0.95]]) box(0.05, 0.3, 0.05, 0xffffff, x, 0.15, z); }
    else if (kind === 'pouf') { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.4, 16), new THREE.MeshStandardMaterial({ color: 0xc8a468, roughness: 1 })); m.position.y = 0.2; m.castShadow = true; g.add(m); }
    else if (kind === 'umbrella') { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.5, 8), new THREE.MeshStandardMaterial({ color: 0xeeeeee })); p.position.y = 1.25; g.add(p); const c = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.55, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xf4a261, side: THREE.DoubleSide })); c.position.y = 2.45; c.castShadow = true; g.add(c); }
    return g;
  }

  // ------------------------------------------------------------------ eldeki eşya
  setHeld(uid: string | null) {
    if (!this.me.ch) return;
    if (!uid) { this.me.held = null; this.me.heldKey = ''; this.me.ch.setHeld(''); return; }
    const it: InvItem | undefined = this.prof?.inv.find((i: InvItem) => i.uid === uid);
    if (!it) { this.me.held = null; this.me.heldKey = ''; this.me.ch.setHeld(''); return; }
    this.me.held = { uid, id: it.id };
    const dd = DRINKS.find(d => d.id === it.id);
    const key = it.id + (dd ? '|' + ((it.sv ?? 0) / dd.sips).toFixed(2) : it.d !== undefined ? '|d' + it.d : it.w ? '|w' + it.w : '');
    this.me.heldKey = key;
    this.me.ch.heldKey = '__'; this.me.ch.setHeld(it.id, { w: it.w, sv: it.sv, d: it.d });
  }
  refreshHeld() { if (this.me.held) { const u = this.me.held.uid; if (!this.prof.inv.some((i: InvItem) => i.uid === u)) this.setHeld(null); else this.setHeld(u); } }

  // ------------------------------------------------------------------ aksiyonlar
  act(o: any) { this.net.send({ t: 'act', ...o }); }
  playAction(anim: string, dur: number, lock = false, onEnd?: () => void) { this.me.action = { anim, until: this.t + dur, lock, onEnd }; }
  busy() { return !!this.me.action?.lock; }

  emote(id: string) {
    const e = EMOTES.find(x => x.id === id)!;
    if (e.price > 0 && !this.prof.owned.includes(id)) { this.onUI('toast', { msg: 'Bu emote mağazadan alınmalı.', kind: 'warn' }); return; }
    const map: Record<string, string> = { kahkaha: 'laugh', dans: 'dans', elsalla: 'elsalla', zafer: 'zafer', uyu: 'uyu', telefon: 'telefon' };
    if (id === 'telefon') { this.me.ch.setHeld('phone'); }
    this.playAction(map[id] ?? id, e.dur, false, () => { if (id === 'telefon') this.setHeld(this.me.held?.uid ?? null); });
    this.act({ k: 'emote', id });
    if (id === 'kadeh' && this.me.held && DRINKS.some(d => d.id === this.me.held!.id)) this.audio.play('clink');
  }
  drink(uid: string) {
    const it = this.prof.inv.find((i: InvItem) => i.uid === uid); if (!it) return;
    const dd = DRINKS.find(d => d.id === it.id)!;
    if ((it.sv ?? 0) <= 0) { this.refill(uid); return; }
    if (this.me.held?.uid !== uid) this.setHeld(uid);
    if (this.busy() || this.me.swim) return;
    this.playAction('drink', 1.8, true);
    setTimeout(() => { this.act({ k: 'sip', uid }); this.audio.play('sip'); }, 650);
    void dd;
  }
  refill(uid: string) {
    const it = this.prof.inv.find((i: InvItem) => i.uid === uid); if (!it) return;
    const dd = DRINKS.find(d => d.id === it.id)!;
    if (this.me.held?.uid !== uid) this.setHeld(uid);
    if (dd.bottle) { this.me.ch.setHeld('bottle:' + dd.id); this.playAction('pour', 1.5, true, () => this.setHeld(uid)); }
    else this.playAction('pour', 1.0, true);
    this.audio.play('pour');
    this.act({ k: 'refill', uid });
  }
  eat(uid: string) {
    const it = this.prof.inv.find((i: InvItem) => i.uid === uid); if (!it) return;
    const fruit = FRUITS.some(f => f.id === it.id);
    if (!fruit && it.d === undefined) { this.onUI('toast', { msg: 'Önce mangalda pişir! 🔥', kind: 'warn' }); return; }
    this.setHeld(uid);
    this.playAction('eat', 2.0, true, () => { this.act({ k: 'eat', uid }); this.setHeld(null); });
    this.audio.play('eat');
  }
  give(uid: string, to: string) { this.playAction('give', 1.5); this.act({ k: 'give', uid, to }); if (this.me.held?.uid === uid) setTimeout(() => this.setHeld(null), 600); }
  placeDrink(uid: string) {
    const p = this.me.pos; let best: any = null, bd = 2.4;
    for (const t of TABLES) { const cx = Math.max(t.x0, Math.min(t.x1, p.x)), cz = Math.max(t.z0, Math.min(t.z1, p.z)); const d = Math.hypot(cx - p.x, cz - p.z); if (d < bd) { bd = d; best = { x: cx + (Math.random() - .5) * .2, y: t.y, z: cz }; } }
    if (!best) best = { x: p.x + Math.sin(this.me.ry) * 0.5, y: floorY(p.x, p.z), z: p.z + Math.cos(this.me.ry) * 0.5 };
    this.act({ k: 'place', uid, ...best });
    if (this.me.held?.uid === uid) this.setHeld(null);
  }

  // ------------------------------------------------------------------ oturma
  sitOn(s: Seat) {
    if (this.me.fishing) this.endFishingLocal(true);
    // sarhoşken yanlış sandalye / ıskalama
    if (this.me.level >= 3 && s.type !== 'sunbed' && Math.random() < (this.me.level >= 4 ? 0.55 : 0.35)) {
      this.me.pos.set(s.x - Math.sin(s.ry) * 0.5, floorY(s.x, s.z), s.z - Math.cos(s.ry) * 0.5); this.me.ry = s.ry;
      this.playAction('sitFall', 2.2, true, () => this.playAction('getup', 1.4, true));
      this.audio.play('thud'); this.act({ k: 'fall', why: 'chair' });
      this.onUI('toast', { msg: '🥴 Sandalyeyi ıskaladın!', kind: 'event' });
      return;
    }
    this.me.seat = s; this.me.sitT = 0; this.me.ry = s.ry; this.me.pos.set(s.x, s.y, s.z);
    if (s.type === 'toilet') { this.act({ k: 'flush' }); setTimeout(() => { if (this.me.seat?.type === 'toilet') this.audio.play('flush'); }, 4000); }
    this.audio.play('click');
  }
  stand() {
    if (!this.me.seat) return;
    const s = this.me.seat; this.me.seat = null;
    const fx = Math.sin(s.ry), fz = Math.cos(s.ry);
    this.me.pos.set(s.x + fx * 0.65, 0, s.z + fz * 0.65);
    if (this.collides(this.me.pos.x, this.me.pos.z)) this.me.pos.set(s.x - fx * 0.7, 0, s.z - fz * 0.7);
    this.me.pos.y = floorY(this.me.pos.x, this.me.pos.z);
  }
  sitGround() { if (this.me.swim) return; this.stand(); this.me.seat = { id: 'ground', x: this.me.pos.x, z: this.me.pos.z, y: floorY(this.me.pos.x, this.me.pos.z), ry: this.me.ry, type: 'bench' }; (this.me.seat as any).ground = true; }

  // ------------------------------------------------------------------ balık tutma
  startFishing(rod: string, bait: string | null) {
    const spot = fishSpotAt(this.me.pos.x, this.me.pos.z); if (!spot) return;
    if (this.me.seat) this.stand();
    const bob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff2a2a, roughness: 0.4 }));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.061, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff })); bob.add(cap);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(new Array(14).fill(0).map(() => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.7 }));
    this.world.scene.add(bob, line);
    // denize dön
    const face = spot.face; this.me.ry = face;
    const dist = 12 + Math.random() * 6;
    const target = new THREE.Vector3(this.me.pos.x + Math.sin(face) * dist, 0, this.me.pos.z + Math.cos(face) * dist);
    if (this.me.fishing) { this.world.scene.remove(this.me.fishing.bob, this.me.fishing.line); }
    this.me.fishing = { state: 'cast', spot, t: 0, target, bob, line, dip: 0 };
    this.me.ch.setHeld('rod');
    this.playAction('fishCast', 0.9, true);
    this.audio.play('cast');
    setTimeout(() => this.audio.play('plop'), 900);
    this.act({ k: 'cast', rod, bait });
    this.onUI('fishing');
  }
  reel() {
    const f = this.me.fishing; if (!f || (f.state !== 'wait' && f.state !== 'bite')) return;
    f.state = 'reeling'; this.audio.play('reel');
    this.act({ k: 'reel' });
    this.onUI('fishing');
  }
  onBite() { const f = this.me.fishing; if (!f) return; f.state = 'bite'; f.dip = 1; this.audio.play('bite'); if (navigator.vibrate) navigator.vibrate([80, 60, 80]); this.onUI('fishing'); }
  onCatchResult(m: any) {
    if (m.by && m.by !== this.me.id) { // başkasının yakaladığı
      const r = this.players.get(m.by);
      if (r && (m.rarity === 'efsane' || m.rarity === 'çok nadir')) this.fx.confetti(r.pos.clone().add(new THREE.Vector3(0, 2, 0)), 40);
      this.onUI('catchOther', m); return;
    }
    const f = this.me.fishing;
    if (!m.ok) {
      this.onUI('toast', { msg: m.msg, kind: 'warn' });
      if (f) { f.state = 'idle'; f.t = 0; }
      this.playAction(Math.random() < 0.5 ? 'kizma' : 'aglama', 2.2);
      this.audio.play('escape'); this.onUI('fishing'); return;
    }
    const big = m.w >= 5, rare = m.rarity !== 'yaygın';
    const show = () => {
      // balığı göster
      const fish = makeFish(m.fish, m.w); fish.userData.tmp = true;
      this.me.ch.setHeld(''); this.me.ch.held = fish; this.me.ch.heldKey = 'fish_show'; this.me.ch.root.add(fish);
      fish.rotation.z = Math.PI / 2; if ((fish.userData.len ?? 0.3) > 1.2) fish.scale.setScalar(1.2 / fish.userData.len);
      this.playAction(rare ? 'zafer' : 'showFish', 3, true, () => { this.me.ch.root.remove(fish); this.me.ch.held = null; this.me.ch.heldKey = ''; this.me.ch.setHeld('rod'); });
      this.audio.play(rare ? 'rare' : 'catch');
      if (rare) this.fx.confetti(this.me.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), 70);
      this.fx.splash(f ? f.target : this.me.pos, 12, 0.6);
    };
    if (big) { this.playAction('struggle', 2.4, true, show); this.onUI('toast', { msg: '💪 Çok ağır! Asılıyor…', kind: 'event' }); }
    else show();
    if (f) { f.state = 'idle'; f.t = 0; }
    this.onUI('catchMine', m); this.onUI('fishing');
  }
  endFishingLocal(send = false) {
    const f = this.me.fishing; if (!f) return;
    this.world.scene.remove(f.bob, f.line); this.me.fishing = null;
    if (this.me.ch) this.setHeld(this.me.held?.uid ?? null);
    if (send) this.act({ k: 'cancelFish' });
    this.onUI('fishing');
  }

  // ------------------------------------------------------------------ olaylar (fx)
  onFx(m: any) {
    const r = m.id ? (m.id === this.me.id ? null : this.players.get(m.id)) : null;
    const pos = m.id === this.me.id ? this.me.pos : r?.pos;
    const near = (p?: THREE.Vector3, d = 25) => !!p && p.distanceTo(this.me.pos) < d;
    switch (m.k) {
      case 'bite': if (r?.bob) r.bob.dip = 1; break;
      case 'flip': this.grillFlip[m.slot] = 0.35; if (near(new THREE.Vector3(GRILL.x, 0, GRILL.z), 12)) this.audio.play('sizzle'); break;
      case 'burnt': { const p = this.world.grillSlotPos[m.slot]; this.fx.puff(p, 0x222222, 18); if (near(p, 15)) this.audio.play('fire'); break; }
      case 'grillLit': this.fx.sparks(this.world.grillSlotPos[2], 30); this.audio.play('fire'); break;
      case 'seagull': this.seagullSteal(m.slot); break;
      case 'umbrella': { const u = this.world.umbrellas[m.i % this.world.umbrellas.length]; if (u && !this.flyingUmb.some(f => f.o === u)) { this.flyingUmb.push({ o: u, t: 0, home: u.userData.home.clone() }); this.audio.play('whoosh'); } break; }
      case 'tip': { const p = this.props.get(m.pid); if (p) { this.fx.splash(p.obj.position, 8, 0.2); this.audio.play('clink'); } break; }
      case 'fruitfall': {
        if (!pos) break;
        const fr = makeFruit(m.fruit); fr.position.copy(pos).add(new THREE.Vector3(0, 4.5, 0)); this.world.scene.add(fr);
        this.fallingFruit.push({ o: fr, v: new THREE.Vector3(0, 0, 0), id: m.id });
        break;
      }
      case 'smokeface': if (pos) { this.fx.puff(pos.clone().add(new THREE.Vector3(0, 1.7, 0)), 0x777777, 14); if (m.id === this.me.id) { this.playAction('cough', 2.2); this.audio.play('cough'); } } break;
      case 'doze': if (m.id === this.me.id && this.me.seat) { this.me.dozeUntil = this.t + 8; } else if (r) r.ch.play('doze'); break;
      case 'gulls': this.audio.play('gull'); for (const g of this.world.gulls) { g.h = 4 + Math.random() * 3; setTimeout(() => (g.h = 9 + Math.random() * 10), 9000); } break;
      case 'splash': {
        const p = new THREE.Vector3(m.x, (waterAt(m.x, m.z) ?? 0) + 0.1, m.z);
        this.fx.spray(p, new THREE.Vector3(Math.sin(m.ry), 0, Math.cos(m.ry)), 26); if (near(p, 20)) this.audio.play('smallSplash');
        if (m.id !== this.me.id) { const d = this.me.pos.clone().sub(p); if (d.length() < 3.5 && d.normalize().dot(new THREE.Vector3(Math.sin(m.ry), 0, Math.cos(m.ry))) > 0.4) { this.playAction('sasirma', 1.5); this.onUI('toast', { msg: `💦 ${r?.name ?? 'Biri'} sana su sıçrattı!`, kind: 'event' }); } }
        break;
      }
      case 'dive': { const p = new THREE.Vector3(m.x, POOL.water + 0.05, m.z); this.fx.splash(p, 45, 1.1); if (near(p, 30)) this.audio.play('splash'); (this.world.poolWater.material as THREE.ShaderMaterial).uniforms.uRipple.value.set(m.x, m.z, this.world.time, 0); break; }
      case 'fall': if (pos && near(pos)) this.audio.play('thud'); break;
      case 'shower': this.showerFx = 6; break;
      case 'flush': if (near(new THREE.Vector3(m.x, 0, m.z), 10)) this.audio.play('flush'); break;
      case 'fridge': this.world.openFridge(); if (near(new THREE.Vector3(FRIDGE.x, 0, FRIDGE.z), 12)) this.audio.play('fridge'); break;
      case 'pour': if (pos && near(pos, 10) && m.id !== this.me.id) this.audio.play('pour'); break;
      case 'eat': if (pos && near(pos, 6) && m.id !== this.me.id) this.audio.play('eat'); break;
      case 'give': if (m.to === this.me.id) this.audio.play('note'); break;
      case 'escape': break;
    }
  }
  seagullSteal(slot: number) {
    const to = this.world.grillSlotPos[slot] ?? new THREE.Vector3(GRILL.x, 2, GRILL.z);
    const o = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.35, 4, 8), new THREE.MeshStandardMaterial({ color: 0xf4f4f4 })); body.rotation.x = Math.PI / 2; o.add(body);
    for (const s of [1, -1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.2), new THREE.MeshStandardMaterial({ color: 0x9aa0a6 })); w.position.x = s * 0.4; w.name = 'w' + s; o.add(w); }
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 6), new THREE.MeshStandardMaterial({ color: 0xf2b90f })); beak.rotation.x = Math.PI / 2; beak.position.z = 0.32; o.add(beak);
    this.world.scene.add(o);
    const from = new THREE.Vector3(to.x - 20, 12, to.z - 30);
    this.gullFx.push({ o, t: 0, from, to: to.clone() });
    this.audio.play('gull');
  }

  // ------------------------------------------------------------------ girdi
  bindInput() {
    const c = this.canvas;
    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys.add(e.code);
      if (!this.inRoom) return;
      if (e.code === 'KeyE') this.onUI('interact');
      if (e.code === 'Space') { e.preventDefault(); if (this.me.fishing?.state === 'bite' || this.me.fishing?.state === 'wait') this.reel(); else this.jump(); }
      if (e.code === 'KeyV') this.voice.setPTTDown(true);
      if (e.code === 'KeyI') this.onUI('inv'); if (e.code === 'KeyB') this.onUI('emotes'); if (e.code === 'KeyM') this.onUI('mic'); if (e.code === 'KeyL') this.onUI('shop');
      if (e.code === 'Escape') this.onUI('menu'); if (e.code === 'Enter' || e.code === 'KeyT') { e.preventDefault(); this.onUI('chat'); }
      if (e.code === 'KeyC') this.onUI('sitground');
      if (e.code === 'KeyF') { if (this.me.swim) { this.act({ k: 'splash' }); this.playAction('splash', 1.2); } }
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'KeyV') this.voice.setPTTDown(false); });
    addEventListener('blur', () => this.keys.clear());
    // fare: sürükle = kamera, tık = etkileşim
    let drag = false, moved = 0, lx = 0, ly = 0, pid = -1;
    const pinch = new Map<number, { x: number; y: number }>(); let pinchD = 0;
    c.addEventListener('pointerdown', (e) => {
      this.audio.resume();
      if (e.pointerType === 'touch') { pinch.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pinch.size === 2) { const [a, b] = [...pinch.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); } }
      if (pid !== -1 && e.pointerType === 'touch') return;
      drag = true; moved = 0; lx = e.clientX; ly = e.clientY; pid = e.pointerId; c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' && pinch.has(e.pointerId)) { pinch.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pinch.size === 2) { const [a, b] = [...pinch.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); this.cam.dist = THREE.MathUtils.clamp(this.cam.dist * (pinchD / d), 1.6, 14); pinchD = d; return; } }
      if (!drag || e.pointerId !== pid) return;
      const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      const s = 0.005 * this.settings.sens;
      this.cam.yaw -= dx * s; this.cam.pitch = THREE.MathUtils.clamp(this.cam.pitch + dy * s * (this.settings.invertY ? -1 : 1), -0.35, 1.25);
      this.cam.lastManual = this.t;
    });
    const up = (e: PointerEvent) => {
      pinch.delete(e.pointerId);
      if (e.pointerId !== pid) return;
      if (drag && moved < 8) this.click(e.clientX, e.clientY);
      drag = false; pid = -1;
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { this.cam.dist = THREE.MathUtils.clamp(this.cam.dist * (1 + Math.sign(e.deltaY) * 0.1), 1.6, 14); }, { passive: true });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  click(x: number, y: number) {
    if (!this.inRoom) return;
    const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const objs: THREE.Object3D[] = [...this.players.values()].map(r => r.ch.root);
    const hit = this.raycaster.intersectObjects(objs, true)[0];
    if (hit) { let o: THREE.Object3D | null = hit.object; while (o && !o.userData.char) o = o.parent; const ch = o?.userData.char as Character | undefined; const r = [...this.players.values()].find(p => p.ch === ch); if (r) { this.onUI('player', r.id); return; } }
    const h2 = this.raycaster.intersectObjects(this.world.scene.children, true).find(h => h.distance < 60 && !(h.object as any).isSprite);
    if (!h2) return;
    const list = this.interactables(h2.point.x, h2.point.z, 2.6);
    if (list.length) {
      const it = list[0];
      if (Math.hypot(it.x - this.me.pos.x, it.z - this.me.pos.z) > it.r + 0.8) this.onUI('toast', { msg: `${it.label} için yaklaşman gerek`, kind: 'warn' });
      else this.onUI('doInteract', it);
    }
  }
  jump() {
    if (this.busy() || !this.inRoom) return;
    if (this.me.seat) { this.stand(); return; }
    if (this.me.swim) { this.act({ k: 'splash' }); this.playAction('splash', 1.2); return; }
    if (this.me.fishing) { this.endFishingLocal(true); return; }
    // havuz kenarındaysa atla
    const p = this.me.pos; const fx = Math.sin(this.me.ry), fz = Math.cos(this.me.ry);
    if (!inPool(p.x, p.z) && inPool(p.x + fx * 1.2, p.z + fz * 1.2)) { this.dive(); return; }
    if (this.me.onGround) { this.me.vy = 4.4; this.me.onGround = false; this.audio.play('jump'); }
  }
  dive() {
    const p = this.me.pos; const fx = Math.sin(this.me.ry), fz = Math.cos(this.me.ry);
    this.playAction('dive', 0.7, true, () => {
      this.me.pos.set(p.x + fx * 1.4, POOL.water, p.z + fz * 1.4);
      this.act({ k: 'dive', x: this.me.pos.x, z: this.me.pos.z });
    });
    this.me.vy = 3.5; this.me.onGround = false;
  }

  // ------------------------------------------------------------------ çarpışma
  colliders(): Box[] { const d = doorBox(this.world.doors.get('wc')?.userData.target !== 0 && this.world.doors.get('wc')?.userData.target !== undefined); return d ? [...STATIC_COLLIDERS, d] : STATIC_COLLIDERS; }
  collides(x: number, z: number, r = 0.3) {
    for (const b of this.colliders()) if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
    return false;
  }
  resolve(x: number, z: number, r = 0.3): [number, number] {
    for (let it = 0; it < 3; it++) {
      for (const b of this.colliders()) {
        if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) {
          const dl = x - (b.x0 - r), dr = (b.x1 + r) - x, dt = z - (b.z0 - r), db = (b.z1 + r) - z;
          const m = Math.min(dl, dr, dt, db);
          if (m === dl) x = b.x0 - r; else if (m === dr) x = b.x1 + r; else if (m === dt) z = b.z0 - r; else z = b.z1 + r;
        }
      }
      for (const t of TREES) { const d = Math.hypot(x - t.x, z - t.z); const rr = t.fruit === 'uzum' ? 0 : 0.45; if (d < rr + r && d > 0) { x = t.x + (x - t.x) / d * (rr + r); z = t.z + (z - t.z) / d * (rr + r); } }
      for (const [px, pz] of PALMS) { const d = Math.hypot(x - px, z - pz); if (d < 0.5 && d > 0) { x = px + (x - px) / d * 0.5; z = pz + (z - pz) / d * 0.5; } }
    }
    x = THREE.MathUtils.clamp(x, WORLD_BOUNDS.x0, WORLD_BOUNDS.x1); z = THREE.MathUtils.clamp(z, -48, WORLD_BOUNDS.z1);
    return [x, z];
  }

  // ------------------------------------------------------------------ etkileşimler
  interactables(x: number, z: number, maxD: number): Interact[] {
    const out: Interact[] = [];
    const add = (i: Interact) => { const d = Math.hypot(i.x - x, i.z - z); if (d <= Math.max(maxD, i.r)) out.push(i); };
    for (const s of [...SEATS, ...this.dynSeats]) {
      if (this.seatTaken.has(s.id)) continue;
      add({ kind: 'seat', key: s.id, x: s.x, z: s.z, r: 1.5, label: s.type === 'sunbed' ? 'Şezlonga uzan' : s.type === 'toilet' ? 'Tuvalete git' : s.type === 'sofa' ? 'Kanepeye otur' : 'Otur', data: s });
    }
    for (const s of FISH_SPOTS) add({ kind: 'fish', key: s.id, x: s.x, z: s.z, r: s.r, label: 'Balık tut', data: s });
    add({ kind: 'grill', key: 'grill', x: GRILL.x, z: GRILL.z, r: 2.8, label: 'Mangal' });
    for (const t of TREES) add({ kind: 'tree', key: t.id, x: t.x, z: t.z, r: t.fruit === 'uzum' ? 2.8 : 2.6, label: `${itemName(t.fruit)} topla`, data: t });
    add({ kind: 'bar', key: 'bar', x: BAR.x, z: BAR.z - 1.2, r: 3, label: 'Sahil büfesi' });
    add({ kind: 'fridge', key: 'fridge', x: FRIDGE.x, z: FRIDGE.z - 0.8, r: 1.6, label: 'Buzdolabını aç' });
    add({ kind: 'tv', key: 'tv', x: TV.x, z: TV.z - 1.2, r: 2.2, label: 'TV aç/kapat' });
    add({ kind: 'radio', key: 'radio', x: RADIO.x, z: RADIO.z, r: 1.8, label: 'Sahil radyosu' });
    add({ kind: 'shower', key: 'shower', x: SHOWER.x, z: SHOWER.z, r: 1.3, label: 'Duş al' });
    for (const d of DOORS) add({ kind: 'door', key: d.id, x: d.x, z: (d.z0 + d.z1) / 2, r: 1.6, label: this.world.doors.get(d.id)?.userData.target ? 'Kapıyı kapat' : 'Kapıyı aç' });
    for (const p of this.props.values()) if (p.d.owner === this.me.id) add({ kind: 'pickup', key: p.d.pid, x: p.d.x, z: p.d.z, r: 1.3, label: p.d.kind === 'drink' ? `${itemName(p.d.id)} al` : `${itemName(p.d.id)} topla`, data: p.d });
    for (const r of this.players.values()) add({ kind: 'player', key: r.id, x: r.pos.x, z: r.pos.z, r: 2, label: `${r.name} ile etkileşim`, data: r });
    if (!inPool(this.me.pos.x, this.me.pos.z) && Math.min(Math.abs(x - POOL.x0), Math.abs(x - POOL.x1), Math.abs(z - POOL.z0), Math.abs(z - POOL.z1)) < 1.2 && x > POOL.x0 - 1.2 && x < POOL.x1 + 1.2 && z > POOL.z0 - 1.2 && z < POOL.z1 + 1.2)
      out.push({ kind: 'pool', key: 'pool', x, z, r: 1.2, label: 'Havuza atla' });
    out.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    // öncelik: balık noktası ve mangal oturaklardan önce
    return out;
  }

  // ------------------------------------------------------------------ ana döngü
  start() { this.renderer.setAnimationLoop(() => this.frame()); }
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.t += dt;
    // fps ölçümü + uyarlamalı çözünürlük
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 2) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; this.adapt(); }
    const hour = this.inRoom ? this.hourNow() : 18.3;
    this.world.setEnv(hour, this.inRoom ? this.env.weather : 'gunesli');
    if (this.inRoom) this.updatePlayer(dt);
    this.updateRemotes(dt);
    this.updateGrill(dt);
    this.updateCamera(dt);
    this.world.update(dt, this.camera.position);
    if (Math.floor(this.t * 2) % 8 === 0) this.world.refreshEnv();
    this.fx.update(dt);
    this.updateMisc(dt);
    if (this.previewCh) { this.previewCh.update(dt, this.camera.position); this.previewCh.root.rotation.y += dt * 0.15; }
    this.updateAudio(dt);
    this.renderer.render(this.world.scene, this.camera);
  }
  adapt() {
    const max = this.settings.quality === 'high' ? 2 : this.settings.quality === 'med' ? 1.5 : 1;
    if (this.fps < 40 && this.dpr > 0.75) { this.dpr = Math.max(0.75, this.dpr - 0.25); this.renderer.setPixelRatio(this.dpr); }
    else if (this.fps > 57 && this.dpr < Math.min(max, devicePixelRatio)) { this.dpr = Math.min(max, this.dpr + 0.25); this.renderer.setPixelRatio(this.dpr); }
  }

  updatePlayer(dt: number) {
    const me = this.me; const ch = me.ch;
    // girdi vektörü
    let ix = 0, iz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iz += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iz -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix += 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix -= 1;
    if (this.joy.active) { ix = -this.joy.x; iz = -this.joy.y; }
    let mag = Math.min(1, Math.hypot(ix, iz));
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || (this.joy.active && mag > 0.92);
    // eylem süresi
    if (me.action && this.t >= me.action.until) { const a = me.action; me.action = null; a.onEnd?.(); }
    if (me.action?.lock) mag = 0;
    if (mag > 0.1 && me.action && !me.action.lock) me.action = null;
    if (mag > 0.1 && me.seat) this.stand();
    if (mag > 0.1 && me.fishing && me.fishing.state !== 'reeling') this.endFishingLocal(true);
    // sarhoşluk: sendeleme, sapma, düşme (kontrol tamamen kaybolmaz)
    const lv = me.level;
    let yawWobble = 0;
    if (lv >= 2 && mag > 0.1) {
      me.drift += dt * (0.6 + lv * 0.3);
      yawWobble = Math.sin(me.drift * 1.3) * 0.18 * (lv - 1) + Math.sin(me.drift * 3.1) * 0.06 * lv;
      me.stumbleT -= dt;
      if (lv >= 3 && me.stumbleT < 0 && !me.action) { me.stumbleT = 5 + Math.random() * 7; this.playAction('stagger', 1.3, false); }
      me.fallCool -= dt;
      if (lv >= 4 && me.fallCool < 0 && !me.swim && !me.action) {
        me.fallCool = 22 + Math.random() * 25;
        const nearPool = !inPool(me.pos.x, me.pos.z) && me.pos.x > POOL.x0 - 1.5 && me.pos.x < POOL.x1 + 1.5 && me.pos.z > POOL.z0 - 1.5 && me.pos.z < POOL.z1 + 1.5;
        if (nearPool) { // havuza düşme
          const cx = THREE.MathUtils.clamp(me.pos.x, POOL.x0 + 0.8, POOL.x1 - 0.8), cz = THREE.MathUtils.clamp(me.pos.z, POOL.z0 + 0.8, POOL.z1 - 0.8);
          this.playAction('poolFall', 0.7, true, () => { me.pos.set(cx, POOL.water, cz); this.act({ k: 'dive', x: cx, z: cz }); this.onUI('toast', { msg: '🌊 Sendeleyip havuza düştün!', kind: 'event' }); });
        } else {
          const back = Math.hypot(me.pos.x - GRILL.x, me.pos.z - GRILL.z) < 4;
          this.playAction('fall', 2.4, true, () => this.playAction('getup', 1.4, true));
          setTimeout(() => this.audio.play('thud'), 600);
          this.act({ k: 'fall', why: back ? 'grill' : 'drunk' });
          this.onUI('toast', { msg: back ? '🔥 Mangal başında geriye doğru düştün! (Kimse yanmadı 😅)' : '🥴 Dengeni kaybettin!', kind: 'event' });
        }
      }
    }
    if (me.action?.anim === 'stagger') mag = Math.max(mag * 0.6, 0.35);
    // hareket
    const fwdYaw = this.cam.yaw;
    let speed = (run ? 5.3 : 2.4) * (me.swim ? 0.55 : 1) * (lv >= 3 ? 0.85 : 1);
    if (me.seat) { mag = 0; }
    if (mag > 0.1) {
      const ang = Math.atan2(ix, iz) + fwdYaw + yawWobble;
      const target = ang;
      let d = target - me.ry; d = Math.atan2(Math.sin(d), Math.cos(d));
      const turnRate = lv >= 2 ? 6 : 10;
      me.ry += d * Math.min(1, dt * turnRate);
      const vx = Math.sin(me.ry) * speed * mag, vz = Math.cos(me.ry) * speed * mag;
      let nx = me.pos.x + vx * dt, nz = me.pos.z + vz * dt;
      if (me.action?.anim === 'stagger') { nx += Math.cos(me.ry) * Math.sin(this.t * 5) * dt * 1.2; nz -= Math.sin(me.ry) * Math.sin(this.t * 5) * dt * 1.2; }
      [nx, nz] = this.resolve(nx, nz);
      const fy = floorY(nx, nz);
      if (!me.swim && fy - me.pos.y > 1.35 && waterAt(nx, nz) === null) { /* çok yüksek basamak */ } else { me.pos.x = nx; me.pos.z = nz; }
      me.speed = speed * mag;
    } else me.speed = 0;
    // dikey
    const w = waterAt(me.pos.x, me.pos.z);
    const fy = floorY(me.pos.x, me.pos.z);
    const deep = w !== null && w - fy > 1.05;
    if (me.seat) {
      const s = me.seat; me.pos.set(s.x, s.y, s.z); me.ry = s.ry; me.vy = 0; me.onGround = true; me.sitT += dt;
    } else if (deep && me.pos.y <= w + 0.3 && me.action?.anim !== 'dive') {
      if (!me.swim) { me.swim = true; this.fx.splash(new THREE.Vector3(me.pos.x, w, me.pos.z), 20, 0.6); this.audio.play('smallSplash'); if (inPool(me.pos.x, me.pos.z)) this.act({ k: 'swim' }); if (me.fishing) this.endFishingLocal(true); }
      me.pos.y += ((w - 0.12) - me.pos.y) * Math.min(1, dt * 6); me.vy = 0; me.onGround = true;
    } else {
      if (me.swim) { me.swim = false; }
      me.vy -= 12 * dt; me.pos.y += me.vy * dt;
      if (me.pos.y <= fy) { if (!me.onGround && me.vy < -6) this.audio.play('thud'); me.pos.y = fy; me.vy = 0; me.onGround = true; }
      else if (me.pos.y - fy > 0.05) me.onGround = false;
      // basamak çıkma yumuşatma
      if (me.onGround && fy > me.pos.y) me.pos.y = fy;
    }
    // animasyon seçimi
    let anim = 'idle';
    if (me.action) anim = me.action.anim;
    else if (me.seat) {
      const s = me.seat as any;
      anim = s.ground ? 'sitGround' : s.type === 'sunbed' ? 'lie' : s.type === 'sofa' ? 'sitSofa' : s.type === 'toilet' ? 'toilet' : 'sit';
      if (this.t < me.dozeUntil) anim = 'doze';
    }
    else if (me.swim) anim = 'swim';
    else if (me.fishing) anim = me.fishing.state === 'bite' ? 'fishBite' : me.fishing.state === 'reeling' ? 'fishReel' : me.fishing.state === 'cast' ? 'fishCast' : 'fishWait';
    else if (!me.onGround) anim = 'jump';
    else if (me.speed > 3.4) anim = 'run';
    else if (me.speed > 0.2) anim = 'walk';
    else if (me.inGrill) anim = 'grill';
    if (me.action?.anim === 'drink' || me.action?.anim === 'eat' || me.action?.anim === 'pour' || me.action?.anim === 'give') { if (me.seat) { /* oturarak içme: bacaklar oturur */ } }
    ch.play(anim);
    ch.speed = me.speed;
    ch.root.position.copy(me.pos);
    if (me.seat) { const s = me.seat as any; ch.root.position.y = s.ground ? s.y : s.type === 'sunbed' ? s.y - 0.22 : s.y - 0.45; }
    if (me.swim) ch.root.position.y = (w ?? 0) - 0.12;
    if (anim === 'fall' || anim === 'getup' || anim === 'sitFall') ch.root.position.y = fy;
    ch.root.rotation.y = me.ry;
    ch.talk = this.voice.micLevel > 0.06 ? Math.min(1, this.voice.micLevel * 2) : 0;
    ch.flags.speaking = this.voice.speaking; ch.flags.muted = !this.voice.micOn; ch.drawTag();
    // oturarak içme/yeme: oturma pozunu koru
    if (me.seat && (anim === 'drink' || anim === 'eat' || anim === 'kadeh' || anim === 'alkis' || anim === 'kahkaha' || anim === 'laugh')) {
      // karakter pozu eylemi oynar, kökü oturma yüksekliğinde tutmak için bacakları elle bük
      ch.update(dt, this.camera.position);
      const j = ch.joints; j.hipL.rotation.x = j.hipR.rotation.x = -1.5; j.knL.rotation.x = j.knR.rotation.x = 1.5; j.hips.position.y = ch.hipH - 0.47;
    } else ch.update(dt, this.camera.position);
    // konuşana bakma
    this.lookAtSpeaker(ch, me.pos, me.ry, null);
    // balık
    this.updateFishingLocal(dt);
    // etkileşim istemi
    me.inGrill = false;
    const list = me.action?.lock ? [] : this.interactables(me.pos.x, me.pos.z, 2.2);
    this.interact = list.find(i => i.kind !== 'seat' || !me.seat) ?? null;
    if (me.seat) this.interact = { kind: 'stand', key: 'stand', label: 'Kalk', x: me.pos.x, z: me.pos.z, r: 1 };
    if (me.fishing) this.interact = me.fishing.state === 'bite' ? { kind: 'reel', key: 'reel', label: 'ÇEK!', x: 0, z: 0, r: 1 } : me.fishing.state === 'wait' ? { kind: 'reel', key: 'reel', label: 'Oltayı çek', x: 0, z: 0, r: 1 } : me.fishing.state === 'idle' ? { kind: 'recast', key: 'recast', label: 'Tekrar at', x: 0, z: 0, r: 1 } : null;
    if (me.swim) this.interact = { kind: 'splash', key: 'splash', label: 'Su sıçrat', x: 0, z: 0, r: 1 };
    // ağ
    if (this.t - this.lastSend > 0.1) {
      this.lastSend = this.t;
      this.net.send({ t: 'mv', x: +ch.root.position.x.toFixed(2), y: +ch.root.position.y.toFixed(2), z: +ch.root.position.z.toFixed(2), ry: +me.ry.toFixed(3), a: anim, it: this.me.fishing ? 'rod' : ch.heldKey === 'phone' ? 'phone' : ch.heldKey.startsWith('bottle:') ? ch.heldKey : this.me.heldKey, s: me.seat?.id ?? null, sw: me.swim ? 1 : 0 });
    }
    // duş
    if (Math.hypot(me.pos.x - SHOWER.x, me.pos.z - SHOWER.z) < 1 && me.showering > 0) me.showering -= dt;
  }
  lookAtSpeaker(ch: Character, pos: THREE.Vector3, ry: number, selfId: string | null) {
    let best: THREE.Vector3 | null = null, bd = 9;
    const consider = (p: THREE.Vector3, speaking: boolean, id: string) => { if (!speaking || id === selfId) return; const d = p.distanceTo(pos); if (d < bd && d > 0.4) { bd = d; best = p; } };
    if (selfId !== null) consider(this.me.pos, this.voice.speaking, this.me.id);
    for (const r of this.players.values()) consider(r.pos, r.speaking || this.voice.level(r.id) > 0.08, r.id);
    // konuşma aralarında hemen dönmesin: son konuşana ~2.5 sn daha bakmaya devam et
    const ud = ch.root.userData;
    if (best) { ud.lookAt = (best as THREE.Vector3).clone(); ud.lookUntil = this.t + 2.5; }
    else if (ud.lookAt && this.t < ud.lookUntil) best = ud.lookAt;
    if (best) {
      const b = best as THREE.Vector3;
      const yaw = Math.atan2(b.x - pos.x, b.z - pos.z) - ry;
      const rel = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      ch.tLookYaw = THREE.MathUtils.clamp(rel, -1.25, 1.25);
      ch.tLookPitch = THREE.MathUtils.clamp(-(b.y - pos.y) * 0.2, -0.3, 0.3);
    } else { ch.tLookYaw = 0; ch.tLookPitch = 0; }
  }

  updateFishingLocal(dt: number) {
    const f = this.me.fishing; if (!f) return;
    f.t += dt;
    const tip = this.me.ch.rodTip;
    const bob = f.bob;
    const sea = this.seaY(f.target.x, f.target.z);
    if (f.state === 'cast') {
      const k = Math.min(1, Math.max(0, (f.t - 0.45) / 0.55));
      bob.position.lerpVectors(tip, f.target, k); bob.position.y = THREE.MathUtils.lerp(tip.y, sea, k) + Math.sin(k * Math.PI) * 3;
      if (f.t > 1.0) { f.state = 'wait'; this.onUI('fishing'); }
    } else {
      f.dip = Math.max(0, f.dip - dt * 0.4);
      const d = f.state === 'bite' ? 0.08 + Math.abs(Math.sin(this.t * 14)) * 0.12 : f.state === 'reeling' ? 0 : 0;
      if (f.state === 'reeling') bob.position.lerp(new THREE.Vector3(tip.x, sea, tip.z), dt * 1.5);
      else bob.position.set(f.target.x, sea - d + Math.sin(this.t * 2) * 0.02, f.target.z);
    }
    this.drawLine(f.line, tip, bob.position);
  }
  seaY(x: number, z: number) { return Math.sin(this.world.time * 1.2 + x * 0.3 + z * 0.2) * 0.06 * (this.world.weather === 'firtina' ? 3 : 1); }
  drawLine(line: THREE.Line, a: THREE.Vector3, b: THREE.Vector3) {
    const p = line.geometry.attributes.position as THREE.BufferAttribute; const n = p.count;
    const sag = Math.min(1.5, a.distanceTo(b) * 0.06);
    for (let i = 0; i < n; i++) { const t = i / (n - 1); p.setXYZ(i, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * sag, a.z + (b.z - a.z) * t); }
    p.needsUpdate = true; line.geometry.computeBoundingSphere();
  }

  updateRemotes(dt: number) {
    const now = performance.now() - 130;
    const others = new Map<string, any>();
    this.seatTaken.clear();
    for (const r of this.players.values()) {
      const b = r.buf;
      let s0 = b[0], s1 = b[0];
      for (let i = 0; i < b.length - 1; i++) if (b[i].t <= now && b[i + 1].t >= now) { s0 = b[i]; s1 = b[i + 1]; break; }
      if (b.length && now > b[b.length - 1].t) s0 = s1 = b[b.length - 1];
      if (s0) {
        const k = s1.t > s0.t ? (now - s0.t) / (s1.t - s0.t) : 1;
        const tx = s0.x + (s1.x - s0.x) * k, ty = s0.y + (s1.y - s0.y) * k, tz = s0.z + (s1.z - s0.z) * k;
        const prev = r.pos.clone();
        r.pos.set(tx, ty, tz);
        let d = s1.ry - r.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); r.ry += d * Math.min(1, dt * 12);
        const spd = prev.distanceTo(r.pos) / Math.max(dt, 0.001);
        r.ch.speed = spd;
        const a = s1.a; r.anim = a;
        if (!(a === 'idle' && r.ch.anim === 'doze')) r.ch.play(a);
        const [key, extra] = (s1.it || '').split('|');
        if (r.ch.heldKey !== key) {
          const opts: any = {};
          if (extra?.startsWith('d')) opts.d = +extra.slice(1); else if (extra?.startsWith('w')) opts.w = +extra.slice(1); else if (extra) { const dd = DRINKS.find(x => x.id === key); if (dd) opts.sv = +extra * dd.sips; }
          r.ch.setHeld(key, opts);
        } else if (extra && DRINKS.some(x => x.id === key)) r.ch.setHeldFill(+extra);
        if (s1.s) this.seatTaken.add(s1.s);
      }
      r.ch.root.position.copy(r.pos); r.ch.root.rotation.y = r.ry;
      r.indoors = inVilla(r.pos.x, r.pos.z);
      // ses seviyesi → ağız
      const lvl = this.voice.level(r.id);
      r.ch.talk = lvl > 0.05 ? Math.min(1, lvl * 2) : 0;
      const sp = r.speaking || lvl > 0.08;
      if (r.ch.flags.speaking !== sp) { r.ch.flags.speaking = sp; r.ch.drawTag(); }
      r.ch.flags.muted = this.voice.muted.has(r.id);
      r.ch.update(dt, this.camera.position);
      this.lookAtSpeaker(r.ch, r.pos, r.ry, r.id);
      // uzak oyuncunun şamandırası
      const fishing = r.ch.heldKey === 'rod' && r.anim.startsWith('fish') && r.anim !== 'fishCast';
      if (fishing && !r.bob) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff2a2a }));
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(new Array(14).fill(0).map(() => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.6 }));
        const target = new THREE.Vector3(r.pos.x + Math.sin(r.ry) * 14, 0, r.pos.z + Math.cos(r.ry) * 14);
        r.bob = { m, line, dip: 0, target }; this.world.scene.add(m, line);
      } else if (!fishing && r.bob) { this.world.scene.remove(r.bob.m, r.bob.line); r.bob = undefined; }
      if (r.bob) {
        r.bob.dip = Math.max(0, r.bob.dip - dt * 0.5);
        const y = this.seaY(r.bob.target.x, r.bob.target.z) - (r.anim === 'fishBite' || r.bob.dip > 0 ? Math.abs(Math.sin(this.t * 14)) * 0.12 : 0);
        r.bob.m.position.set(r.bob.target.x, y, r.bob.target.z);
        this.drawLine(r.bob.line, r.ch.rodTip, r.bob.m.position);
      }
      others.set(r.id, { x: r.pos.x, y: r.pos.y, z: r.pos.z, indoors: r.indoors, group: r.group });
    }
    if (this.inRoom) {
      const fx = Math.sin(this.cam.yaw), fz = Math.cos(this.cam.yaw);
      this.voice.update(dt, { x: this.me.pos.x, y: this.me.pos.y + 1.6, z: this.me.pos.z, fx, fz, indoors: inVilla(this.me.pos.x, this.me.pos.z), group: this.me.group }, others);
    }
  }

  updateGrill(dt: number) {
    for (let i = 0; i < 10; i++) {
      const o = this.grillObjs[i]; if (!o) continue;
      const c = this.grillCook(i); if (!c) continue;
      applyCook(o, this.grill.slots[i].id, c.a, c.b);
      if (this.grillFlip[i] > 0) { this.grillFlip[i] -= dt; o.position.y = this.world.grillSlotPos[i].y + Math.sin((this.grillFlip[i] / 0.35) * Math.PI) * 0.12; o.rotation.x = (1 - this.grillFlip[i] / 0.35) * Math.PI; }
      else { o.position.y = this.world.grillSlotPos[i].y; o.rotation.x = 0; }
      if (this.grill.lit) {
        const lvl = c.dn.level;
        const rate = lvl >= 4 ? 6 : lvl >= 3 ? 3.5 : lvl >= 1 ? 1.4 : 0.6;
        if (Math.random() < dt * rate) this.fx.smoke(o.position.clone().add(new THREE.Vector3(0, 0.05, 0)), 1, lvl >= 3 ? (lvl - 2) * 0.5 : 0, this.world.wind);
      }
    }
    if (this.grill.lit && Math.random() < dt * 3) this.fx.sparks(new THREE.Vector3(GRILL.x, GARDEN.y + 1.1, GRILL.z), 1);
    if (this.grill.lit && Math.random() < dt * 1.2) this.fx.smoke(new THREE.Vector3(GRILL.x + (Math.random() - 0.5) * 1.5, GARDEN.y + 1.3, GRILL.z), 1, 0, this.world.wind);
    this.world.coals.emissiveIntensity = this.grill.lit ? (0.45 + this.world.night * 0.9) * (1 + Math.sin(this.t * 3) * 0.2 + Math.random() * 0.08) : 0.03;
  }

  updateCamera(dt: number) {
    const cam = this.camera;
    if (!this.inRoom) { // menü: yavaş dönen sinematik
      const a = this.t * 0.03;
      if (this.previewCh) { cam.position.set(2.6, TERRACE.y + 1.6, 30.2); cam.lookAt(0.9, TERRACE.y + 1.05, 33.2); }
      else { cam.position.set(Math.sin(a) * 30 + 5, 9 + Math.sin(a * 2) * 2, -2 + Math.cos(a) * 10); cam.lookAt(-4, 2, 20); }
      return;
    }
    const me = this.me;
    // sohbet kamerası: elle kontrol edilmediyse konuşana nazikçe dön
    if (this.settings.chatCam && me.seat && this.t - this.cam.lastManual > 5) {
      let best: Remote | null = null, bd = 10;
      for (const r of this.players.values()) { const d = r.pos.distanceTo(me.pos); if ((r.speaking || this.voice.level(r.id) > 0.08) && d < bd) { bd = d; best = r; } }
      if (best) { const want = Math.atan2(best.pos.x - me.pos.x, best.pos.z - me.pos.z); let d = want - this.cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.cam.yaw += d * Math.min(1, dt * 0.8); }
    }
    const head = this.tmpV.copy(me.ch.root.position); head.y += me.seat ? 1.1 : me.swim ? 0.4 : 1.55;
    if (me.seat?.type === 'sunbed') head.y = me.ch.root.position.y + 0.8;
    // sarhoş kamera salınımı (ayarlardan kapatılabilir)
    const sway = this.settings.camSway ? Math.max(0, me.level - 1) : 0;
    const swy = Math.sin(this.t * 0.9) * 0.04 * sway, swr = Math.sin(this.t * 0.7) * 0.025 * sway;
    const yaw = this.cam.yaw + swy, pitch = this.cam.pitch;
    const dist = this.cam.dist;
    const shoulder = new THREE.Vector3(Math.cos(yaw) * -0.35, 0, -Math.sin(yaw) * -0.35);
    const target = head.clone().add(shoulder.multiplyScalar(dist > 3 ? 0.5 : 1));
    const off = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist);
    let want = target.clone().add(off);
    // duvarların içinden geçmeme
    const dir = want.clone().sub(target); const len = dir.length(); dir.normalize();
    this.raycaster.set(target, dir); this.raycaster.far = len;
    const hit = this.raycaster.intersectObjects(this.world.colliderMeshes, false)[0];
    if (hit) want = target.clone().add(dir.multiplyScalar(Math.max(0.5, hit.distance - 0.25)));
    // çatı altında kal (villa içi)
    if (inVilla(me.pos.x, me.pos.z)) want.y = Math.min(want.y, VILLA.floor + VILLA.height - 0.3);
    const gy = floorY(want.x, want.z) + 0.3; if (want.y < gy) want.y = gy;
    if (want.y < 0.25 && waterAt(want.x, want.z) !== null && !me.swim) want.y = 0.25;
    this.cam.curPos.lerp(want, Math.min(1, dt * 12));
    if (this.cam.curPos.lengthSq() === 0) this.cam.curPos.copy(want);
    cam.position.copy(this.cam.curPos);
    cam.lookAt(target);
    cam.rotation.z += swr;
  }

  updateMisc(dt: number) {
    // martı hırsızlığı
    for (const g of [...this.gullFx]) {
      g.t += dt; const k = g.t / 4;
      const w1 = g.o.getObjectByName('w1'), w2 = g.o.getObjectByName('w-1'); const fl = Math.sin(this.t * 14) * 0.6; if (w1) w1.rotation.z = fl; if (w2) w2.rotation.z = -fl;
      if (k < 0.5) { const t = k * 2; g.o.position.lerpVectors(g.from, g.to, t); g.o.position.y += Math.sin(t * Math.PI) * 2 + 0.2; g.o.lookAt(g.to); }
      else {
        if (!g.item) { g.item = makeFood('sucuk'); g.item.scale.setScalar(0.8); g.o.add(g.item); g.item.position.set(0, -0.12, 0.3); }
        const t = (k - 0.5) * 2; const away = g.to.clone().add(new THREE.Vector3(25, 14, -40)); g.o.position.lerpVectors(g.to, away, t); g.o.lookAt(away);
      }
      if (k >= 1) { this.world.scene.remove(g.o); this.gullFx.splice(this.gullFx.indexOf(g), 1); }
    }
    // uçan şemsiye
    for (const u of [...this.flyingUmb]) {
      u.t += dt;
      if (u.t < 6) { u.o.position.x += dt * 3; u.o.position.y = u.home.y + Math.sin(u.t / 6 * Math.PI) * 5; u.o.position.z += dt * 1.2; u.o.rotation.z += dt * 2.4; u.o.rotation.x += dt * 1.1; }
      else { u.o.position.lerp(u.home, Math.min(1, dt * 2)); u.o.rotation.x *= 0.9; u.o.rotation.z *= 0.9; if (u.t > 8) { u.o.position.copy(u.home); u.o.rotation.set(0, 0, 0); this.flyingUmb.splice(this.flyingUmb.indexOf(u), 1); } }
    }
    // düşen meyve
    for (const f of [...this.fallingFruit]) {
      f.v.y -= 9.8 * dt; f.o.position.addScaledVector(f.v, dt);
      const target = f.id === this.me.id ? this.me.pos : this.players.get(f.id)?.pos;
      if (target && f.o.position.y < target.y + 1.75 && !f.o.userData.hit) {
        f.o.userData.hit = true; f.v.set(1.2, 2.5, 0.5);
        if (f.id === this.me.id) { this.playAction('struck', 1.4); this.audio.play('thud'); }
      }
      if (f.o.position.y < (target?.y ?? 0) - 0.5) { this.world.scene.remove(f.o); this.fallingFruit.splice(this.fallingFruit.indexOf(f), 1); }
    }
    // duş suyu
    if (this.showerFx > 0) { this.showerFx -= dt; this.fx.shower(new THREE.Vector3(SHOWER.x - 0.2, GARDEN.y + 2.3, SHOWER.z)); }
    // uyuklama zzz
    if (this.inRoom && this.t < this.me.dozeUntil && Math.random() < dt * 2) this.fx.zzz(this.me.pos.clone().add(new THREE.Vector3(0.2, 1.4, 0)));
    // komik: havuzda su sıçratma partikülü
  }

  updateAudio(_dt: number) {
    const p = this.inRoom ? this.me.pos : this.camera.position;
    const grillItems = this.grill.slots.filter(Boolean).length;
    this.audio.updateAmbience({
      shoreDist: Math.max(0, p.z + 17.5), wind: this.world.wind, rain: this.world.rainOn, night: this.world.night,
      grillDist: Math.hypot(p.x - GRILL.x, p.z - GRILL.z), grillItems: this.grill.lit ? grillItems : 0, indoors: inVilla(p.x, p.z),
      showering: this.showerFx > 0 && Math.hypot(p.x - SHOWER.x, p.z - SHOWER.z) < 12, radioDist: Math.min(Math.hypot(p.x - RADIO.x, p.z - RADIO.z), Math.hypot(p.x - TV.x, p.z - TV.z) + 4),
      speaking: (this.voice.speaking ? 1 : 0) + [...this.players.values()].filter(r => r.speaking).length,
    });
    if (this.world.flash > 0.95) setTimeout(() => this.audio.play('thunder'), 600 + Math.random() * 1500);
  }
}
export { TABLES, WC };
