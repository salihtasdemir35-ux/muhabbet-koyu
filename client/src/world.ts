// ======================================================================
//  Dünya: gökyüzü, deniz, kumsal, villa, havuz, bahçe, mangal alanı,
//  meyve bahçesi, iskele, kayalık, tekneler, martılar, gece-gündüz, hava
// ======================================================================
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import * as TX from './textures';
import { makeSea, makePoolWater, makeCausticMaterial, seaUniforms } from './water';
import { makeFruit } from './items';
import {
  beachY, POOL, VILLA, TERRACE, PIER, ROCK_PAD, GARDEN, BOARDWALK, GRILL, BAR, FRIDGE, TV, SHOWER, RADIO, WC,
  SEATS, TREES, PALMS, Seat, STATIC_COLLIDERS,
} from '../../shared/world';
import { FRUITS } from '../../shared/data';

export type Quality = 'low' | 'med' | 'high';
const std = (color: number, rough = 0.8, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });

export class World {
  scene: THREE.Scene;
  sky!: Sky;
  sun = new THREE.DirectionalLight(0xffffff, 3);
  hemi = new THREE.HemisphereLight(0xbfd9ff, 0xc8b48a, 0.8);
  moonLight = new THREE.DirectionalLight(0x8fb0ff, 0);
  sea!: THREE.Mesh;
  poolWater!: THREE.Mesh;
  colliderMeshes: THREE.Object3D[] = [];  // kamera çarpışması için
  lamps: { light?: THREE.PointLight; bulb: THREE.Mesh }[] = [];
  bulbMats: THREE.MeshStandardMaterial[] = [];
  fireLight!: THREE.PointLight; coals!: THREE.MeshStandardMaterial;
  grillSlotPos: THREE.Vector3[] = [];
  treeFruits = new Map<string, THREE.Object3D[]>();
  treeObjs = new Map<string, THREE.Object3D>();
  doors = new Map<string, THREE.Object3D>();
  fridgeDoor!: THREE.Object3D; fridgeOpenT = 0;
  tvScreen!: THREE.Mesh; tvCanvas!: HTMLCanvasElement; tvOn = false;
  umbrellas: THREE.Object3D[] = [];
  gulls: { o: THREE.Object3D; wingL: THREE.Object3D; wingR: THREE.Object3D; r: number; c: THREE.Vector3; s: number; ph: number; h: number }[] = [];
  boats: THREE.Object3D[] = [];
  palms: THREE.Object3D[] = [];
  stars!: THREE.Points; moon!: THREE.Mesh;
  clouds: THREE.Sprite[] = [];
  rain!: THREE.LineSegments; rainOn = 0; flash = 0;
  grass: THREE.InstancedMesh | null = null; grassMat: THREE.MeshStandardMaterial | null = null;
  pmrem: THREE.PMREMGenerator; envRT: THREE.WebGLRenderTarget | null = null; lastEnvKey = '';
  hour = 17; weather = 'gunesli'; night = 0;
  wind = 0.3;
  seatMeshes = new Map<string, THREE.Object3D>();
  time = 0;
  private skyScene = new THREE.Scene();

  constructor(private renderer: THREE.WebGLRenderer, public quality: Quality) {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xbfd8ee, 0.0045);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.buildSky();
    this.buildLights();
    this.buildTerrain();
    this.buildSea();
    this.buildBeach();
    this.buildPier();
    this.buildRocks();
    this.buildGarden();
    this.buildVilla();
    this.buildPool();
    this.buildGrillArea();
    this.buildOrchard();
    this.buildPalms();
    this.buildGulls();
    this.buildHorizon();
    this.buildWeather();
    this.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.receiveShadow === false && !m.userData.noRecv) m.receiveShadow = true; });
  }

  add<T extends THREE.Object3D>(o: T, collide = false): T { this.scene.add(o); if (collide) this.colliderMeshes.push(o); return o; }
  box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, collide = false, parent: THREE.Object3D = this.scene) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m);
    if (collide) this.colliderMeshes.push(m); return m;
  }
  cyl(rt: number, rb: number, h: number, mat: THREE.Material, x: number, y: number, z: number, seg = 16, parent: THREE.Object3D = this.scene) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }

  // -------------------------------------------------------------- gökyüzü + ışık
  buildSky() {
    this.sky = new Sky(); this.sky.scale.setScalar(4500);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.85;
    this.scene.add(this.sky);
    // yıldızlar
    const n = 2500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.95); const r = 1800; pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.scene.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshBasicMaterial({ color: 0xf4f1e0, fog: false, transparent: true, opacity: 0 }));
    this.scene.add(this.moon);
    // bulutlar
    const ct = TX.cloudTex();
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, transparent: true, opacity: 0.8, fog: false, depthWrite: false }));
      const a = Math.random() * Math.PI * 2, r = 500 + Math.random() * 900;
      s.position.set(Math.cos(a) * r, 140 + Math.random() * 160, Math.sin(a) * r - 300); s.scale.set(380 + Math.random() * 300, 120 + Math.random() * 80, 1);
      s.userData.base = s.position.clone(); this.clouds.push(s); this.scene.add(s);
    }
  }
  buildLights() {
    const s = this.sun;
    s.castShadow = this.quality !== 'low';
    const res = this.quality === 'high' ? 2048 : 1024;
    s.shadow.mapSize.set(res, res); s.shadow.bias = -0.0004; s.shadow.normalBias = 0.03;
    const cam = s.shadow.camera; cam.left = -45; cam.right = 45; cam.top = 45; cam.bottom = -45; cam.near = 1; cam.far = 260;
    this.scene.add(s, s.target, this.hemi, this.moonLight, this.moonLight.target);
  }

  // -------------------------------------------------------------- arazi
  buildTerrain() {
    const W = 320, D = 260, sx = 200, sz = 170;
    const geo = new THREE.PlaneGeometry(W, D, sx, sz); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, -40 + 0);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const wet = new THREE.Color(0xa58c63), dry = new THREE.Color(0xe9d6ae), under = new THREE.Color(0x9e8b67), grass = new THREE.Color(0x6f9a3f), dirt = new THREE.Color(0x9a8a5a), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let y: number;
      if (z < 8) y = beachY(x, z);
      else if (Math.abs(x) <= 40.5 && z <= 62.5) y = GARDEN.y - 0.02;
      else y = GARDEN.y + Math.max(0, (Math.abs(x) - 40) * 0.12 + (z - 62) * 0.15) * (z > 8 ? 1 : 0) + Math.sin(x * 0.1) * 0.4 * Math.min(1, Math.max(0, (Math.abs(x) - 42) / 10));
      pos.setY(i, y);
      if (z < 8) {
        const sd = z + 17.5; // kıyıdan uzaklık
        if (sd < -0.6) c.copy(under).lerp(new THREE.Color(0x7c8a6a), Math.min(1, -sd / 30));
        else if (sd < 3.5) c.copy(wet).lerp(dry, Math.max(0, (sd - 0.4) / 3.1));
        else c.copy(dry).offsetHSL(0, 0, Math.sin(x * 0.3) * Math.cos(z * 0.21) * 0.02);
      } else if (Math.abs(x) <= 40.5 && z <= 62.5) c.copy(grass).offsetHSL(0, 0, (Math.sin(x * 0.17) * Math.cos(z * 0.13)) * 0.04);
      else c.copy(dirt).lerp(grass, 0.4);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: TX.sandDetail(), normalMap: TX.sandNormal(), normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95 });
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.name = 'terrain';
    this.add(m);
  }
  buildSea() {
    const seg = this.quality === 'low' ? 120 : this.quality === 'med' ? 180 : 240;
    this.sea = makeSea(900, seg); this.add(this.sea);
  }

  // -------------------------------------------------------------- kumsal
  buildBeach() {
    // tahta yürüyüş yolu
    const bw = new THREE.Mesh(new THREE.BoxGeometry(BOARDWALK.x1 - BOARDWALK.x0, 0.12, BOARDWALK.z1 - BOARDWALK.z0), new THREE.MeshStandardMaterial({ map: (() => { const t = TX.planks('#9a7450').clone(); t.needsUpdate = true; t.repeat.set(1, 20); t.rotation = Math.PI / 2; return t; })(), roughness: 0.85 }));
    bw.position.set(0, BOARDWALK.y - 0.06, (BOARDWALK.z0 + BOARDWALK.z1) / 2); bw.receiveShadow = true; this.add(bw);
    // sokak lambaları
    for (let x = -36; x <= 36; x += 12) this.lamp(x, BOARDWALK.z1 - 0.2, BOARDWALK.y, 3.6, x % 24 === 0);
    // şezlong + şemsiye
    const umbCols = [['#e63946', '#f1faee'], ['#1d7bb8', '#ffffff'], ['#f4a261', '#fefae0'], ['#2a9d8f', '#f1faee']];
    SEATS.filter(s => s.id.startsWith('sh_')).forEach((s, i) => {
      this.seatMeshes.set(s.id, this.sunbed(s));
      if (i % 2 === 0) { const u = this.umbrella(s.x + 1.1, s.z - 0.4, beachY(s.x + 1, s.z), umbCols[(i / 2) % umbCols.length]); this.umbrellas.push(u); }
    });
    // ekstra şemsiyeler (rüzgâr olayları için)
    for (const [x, z] of [[-30, -8], [22, -6], [30, -10]] as const) this.umbrellas.push(this.umbrella(x, z, beachY(x, z), umbCols[(x + 40) % 4]));
    // sahil masası
    const tMat = std(0xe8e0d0, 0.6);
    const tb = new THREE.Group(); tb.position.set(-8, beachY(-8, 0), 0); this.add(tb);
    this.box(2, 0.05, 1, new THREE.MeshStandardMaterial({ map: TX.planks('#b0855a'), roughness: 0.8 }), 0, 0.74, 0, false, tb);
    for (const [x, z] of [[-0.9, -0.42], [0.9, -0.42], [-0.9, 0.42], [0.9, 0.42]]) this.box(0.06, 0.74, 0.06, tMat, x, 0.37, z, false, tb);
    SEATS.filter(s => s.id.startsWith('sm_')).forEach(s => this.seatMeshes.set(s.id, this.chair(s, 0xf2efe6)));
    // büfe / sahil barı
    const bar = new THREE.Group(); bar.position.set(BAR.x, beachY(BAR.x, BAR.z), BAR.z); this.add(bar);
    const bwm = new THREE.MeshStandardMaterial({ map: TX.planks('#8a5f3a'), roughness: 0.8 });
    this.box(4.4, 1.1, 0.5, bwm, 0, 0.55, -0.35, true, bar);
    this.box(4.6, 0.06, 0.8, std(0xf0e8d8, 0.5), 0, 1.13, -0.4, false, bar);
    this.box(4.4, 2.4, 0.2, bwm, 0, 1.2, 1.5, true, bar);
    this.box(0.2, 2.4, 2, bwm, -2.1, 1.2, 0.6, false, bar); this.box(0.2, 2.4, 2, bwm, 2.1, 1.2, 0.6, false, bar);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.4, 8), new THREE.MeshStandardMaterial({ map: TX.thatch(), roughness: 1 })); roof.position.set(0, 3.0, 0.4); roof.castShadow = true; bar.add(roof);
    for (const x of [-1.8, 1.8]) this.cyl(0.07, 0.07, 2.4, std(0x6a4a2a), x, 1.2, -0.7, 8, bar);
    // büfe rafları: şişeler
    const shelfCols = [0x1b6b2a, 0x7a3a12, 0xe8f0ea, 0xb5701c, 0xc8202a, 0x2e9a4a];
    for (let i = 0; i < 14; i++) { const b = this.cyl(0.035, 0.04, 0.28, new THREE.MeshPhysicalMaterial({ color: shelfCols[i % 6], roughness: 0.15, transparent: true, opacity: 0.85 }), -1.6 + i * 0.24, 1.55, 1.25, 8, bar); b.castShadow = false; }
    this.box(4, 0.04, 0.3, bwm, 0, 1.4, 1.3, false, bar);
    // tabela
    const sign = this.signTexture('SAHİL BÜFE', '#0d4f6c', '#fff3c4');
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshStandardMaterial({ map: sign, roughness: 0.6 })); sm.position.set(0, 2.15, -0.75); sm.rotation.y = Math.PI; bar.add(sm);
    const sm2 = sm.clone(); sm2.rotation.y = 0; sm2.position.z = -0.7; bar.add(sm2);
    this.lampBulbs(bar, [[-1.8, 2.2, -0.75], [0, 2.4, -0.75], [1.8, 2.2, -0.75]]);
    // dış duş
    const sh = new THREE.Group(); sh.position.set(SHOWER.x, GARDEN.y, SHOWER.z); this.add(sh);
    this.box(1.2, 0.08, 1.2, new THREE.MeshStandardMaterial({ map: TX.planks('#8a6a4a'), roughness: 0.9 }), 0, 0.04, 0, false, sh);
    this.cyl(0.04, 0.04, 2.4, std(0xb0b0b0, 0.3, { metalness: 0.9 }), -0.5, 1.2, 0, 10, sh);
    const head = this.cyl(0.12, 0.08, 0.05, std(0xc0c0c0, 0.3, { metalness: 0.9 }), -0.2, 2.35, 0, 16, sh);
    this.box(0.35, 0.03, 0.03, std(0xb0b0b0, 0.3, { metalness: 0.9 }), -0.35, 2.4, 0, false, sh); head.name = 'showerHead';
  }
  signTexture(text: string, bg: string, fg: string) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d')!;
    g.fillStyle = bg; g.fillRect(0, 0, 512, 128); g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, 496, 112);
    g.fillStyle = fg; g.font = 'bold 64px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 68);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  umbrella(x: number, z: number, y: number, cols: string[]) {
    const g = new THREE.Group(); g.position.set(x, y, z); this.add(g);
    this.cyl(0.025, 0.03, 2.5, std(0xeeeeee, 0.4), 0, 1.25, 0, 8, g);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.55, 12, 1, true), new THREE.MeshStandardMaterial({ map: TX.stripes(cols[0], cols[1], 12), side: THREE.DoubleSide, roughness: 0.8 }));
    canopy.position.y = 2.45; canopy.castShadow = true; g.add(canopy);
    g.rotation.z = (Math.random() - 0.5) * 0.08; g.userData.home = g.position.clone();
    return g;
  }
  sunbed(s: Seat) {
    const g = new THREE.Group(); g.position.set(s.x, s.y - 0.36, s.z); g.rotation.y = s.ry; this.add(g);
    const frame = std(0xf5f5f0, 0.4), pad = std(0x2a7fb8, 0.85);
    this.box(0.7, 0.06, 1.9, frame, 0, 0.32, 0.15, false, g);
    this.box(0.62, 0.07, 1.25, pad, 0, 0.38, 0.45, false, g);
    const back = this.box(0.62, 0.07, 0.75, pad, 0, 0.55, -0.55, false, g); back.rotation.x = -0.6;
    for (const [x, z] of [[-0.3, -0.7], [0.3, -0.7], [-0.3, 0.95], [0.3, 0.95]]) this.box(0.05, 0.3, 0.05, frame, x, 0.15, z, false, g);
    return g;
  }
  chair(s: Seat, color = 0x6b4a2e, kind: 'wood' | 'plastic' = 'wood') {
    const g = new THREE.Group(); g.position.set(s.x, s.y - 0.46, s.z); g.rotation.y = s.ry; this.add(g);
    const m = kind === 'wood' ? new THREE.MeshStandardMaterial({ map: TX.planks('#' + color.toString(16).padStart(6, '0')), roughness: 0.75 }) : std(color, 0.5);
    this.box(0.46, 0.05, 0.44, m, 0, 0.45, 0, false, g);
    this.box(0.46, 0.5, 0.04, m, 0, 0.72, -0.22, false, g).rotation.x = -0.12;
    for (const [x, z] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]]) this.box(0.04, 0.45, 0.04, m, x, 0.225, z, false, g);
    return g;
  }
  lamp(x: number, z: number, y: number, h: number, withLight: boolean) {
    const pole = std(0x2b2b2b, 0.5, { metalness: 0.6 });
    this.cyl(0.05, 0.07, h, pole, x, y + h / 2, z, 8);
    const bm = new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffc070, emissiveIntensity: 0, roughness: 0.3 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), bm); bulb.position.set(x, y + h + 0.05, z); this.add(bulb);
    this.bulbMats.push(bm);
    let light: THREE.PointLight | undefined;
    if (withLight && this.quality !== 'low') { light = new THREE.PointLight(0xffc27a, 0, 16, 1.6); light.position.set(x, y + h - 0.1, z); this.add(light); }
    this.lamps.push({ light, bulb });
  }
  lampBulbs(parent: THREE.Object3D, pts: number[][]) {
    const bm = new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffb860, emissiveIntensity: 0 });
    this.bulbMats.push(bm);
    for (const [x, y, z] of pts) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), bm); b.position.set(x, y, z); parent.add(b); }
  }
  stringLights(a: THREE.Vector3, b: THREE.Vector3, n: number, sag = 0.5, withLight = false) {
    const bm = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffc070, emissiveIntensity: 0 }); this.bulbMats.push(bm);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) { const t = i / n; const p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * sag; pts.push(p); if (i > 0 && i < n) { const bl = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), bm); bl.position.copy(p).y -= 0.08; this.add(bl); } }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x222222 })); this.add(line);
    if (withLight && this.quality !== 'low') { const l = new THREE.PointLight(0xffc27a, 0, 14, 1.5); l.position.copy(a).lerp(b, 0.5).y -= sag + 0.3; this.add(l); this.lamps.push({ light: l, bulb: new THREE.Mesh() }); }
  }

  // -------------------------------------------------------------- iskele, tekneler
  buildPier() {
    const deckMat = new THREE.MeshStandardMaterial({ map: (() => { const t = TX.planks('#8a6440').clone(); t.needsUpdate = true; t.repeat.set(1, 12); return t; })(), roughness: 0.9 });
    const L = PIER.z1 - PIER.z0, W = PIER.x1 - PIER.x0;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(W, 0.16, L), deckMat); deck.position.set((PIER.x0 + PIER.x1) / 2, PIER.y - 0.08, (PIER.z0 + PIER.z1) / 2); deck.castShadow = deck.receiveShadow = true; this.add(deck);
    const post = std(0x5a4030, 0.95);
    const postGeo = new THREE.CylinderGeometry(0.13, 0.15, 5, 8);
    const n = Math.floor(L / 3) + 1;
    const inst = new THREE.InstancedMesh(postGeo, post, n * 2); const mm = new THREE.Matrix4();
    for (let i = 0; i < n; i++) for (let s = 0; s < 2; s++) { mm.setPosition(s ? PIER.x1 - 0.1 : PIER.x0 + 0.1, PIER.y - 2.3, PIER.z0 + i * 3); inst.setMatrixAt(i * 2 + s, mm); }
    inst.castShadow = true; this.add(inst);
    // korkuluk
    for (const x of [PIER.x0 + 0.05, PIER.x1 - 0.05]) { this.box(0.08, 0.08, L - 4, post, x, PIER.y + 0.95, (PIER.z0 + PIER.z1) / 2 + 2); for (let z = PIER.z0 + 4; z < PIER.z1; z += 3) this.box(0.08, 0.95, 0.08, post, x, PIER.y + 0.47, z); }
    // bank + lambalar
    const bs = SEATS.find(s => s.id === 'isk_b')!;
    const bench = new THREE.Group(); bench.position.set(bs.x, PIER.y, bs.z); bench.rotation.y = bs.ry; this.add(bench);
    this.box(1.8, 0.06, 0.45, deckMat, 0, 0.45, 0, false, bench); this.box(1.8, 0.45, 0.05, deckMat, 0, 0.75, -0.22, false, bench);
    for (const z of [-30, -18, -41]) this.lamp(PIER.x1 - 0.2, z, PIER.y, 2.6, z === -41);
    // tekneler
    const hullMat = (c: number) => std(c, 0.55);
    const mkBoat = (x: number, z: number, ry: number, c: number, len = 6) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; this.add(g);
      const shape = new THREE.Shape(); shape.moveTo(-len / 2, 0.5); shape.quadraticCurveTo(-len / 2 + 0.3, -0.5, 0, -0.55); shape.quadraticCurveTo(len / 2 - 0.4, -0.5, len / 2, 0.7); shape.lineTo(-len / 2, 0.7);
      const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.9, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.2, bevelSegments: 3 }), hullMat(c));
      hull.position.z = -0.95; hull.castShadow = true; g.add(hull);
      this.box(len - 0.6, 0.08, 1.8, new THREE.MeshStandardMaterial({ map: TX.planks('#a07850'), roughness: 0.8 }), 0, 0.65, 0, false, g);
      this.box(1.2, 1, 1.2, std(0xf4f4f4, 0.4), -0.6, 1.15, 0, false, g);
      this.box(1.25, 0.08, 1.3, std(0x1d5f8a, 0.5), -0.6, 1.7, 0, false, g);
      this.cyl(0.04, 0.05, 4.5, std(0xdedede), 0.8, 2.9, 0, 8, g);
      g.userData.base = { x, z, ry, ph: Math.random() * 6 };
      this.boats.push(g);
    };
    mkBoat(26.5, -24, 0.1, 0xf2f2f2); mkBoat(17.3, -33, -0.08, 0x1f6aa5, 5); mkBoat(-14, -48, 1.2, 0xc8402a, 7); mkBoat(46, -70, 0.6, 0xf2f2f2, 9);
    // şamandıralar
    for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), std(i % 2 ? 0xffffff : 0xe8452a, 0.5)); b.position.set(-40 + i * 10, 0.05, -34 - (i % 3)); b.userData.buoy = Math.random() * 6; this.boats.push(b); this.add(b); }
  }
  buildRocks() {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.92, flatShading: true });
    const mkRock = (x: number, z: number, s: number, y = 0) => {
      const g = new THREE.IcosahedronGeometry(1, 1); const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); v.multiplyScalar(0.75 + Math.sin(v.x * 4 + x) * 0.12 + Math.cos(v.z * 5 + z) * 0.12 + Math.random() * 0.1); p.setXYZ(i, v.x, v.y * 0.7, v.z); }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, rockMat); m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.y = Math.random() * 6; m.castShadow = m.receiveShadow = true; this.add(m); return m;
    };
    // balıkçı kayası (düz üst)
    const pad = mkRock(ROCK_PAD.x, ROCK_PAD.z, ROCK_PAD.r + 0.6, ROCK_PAD.y - 1.6); pad.scale.y *= 0.9;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(ROCK_PAD.r, ROCK_PAD.r + 0.4, 0.4, 10), rockMat); top.position.set(ROCK_PAD.x, ROCK_PAD.y - 0.2, ROCK_PAD.z); top.receiveShadow = true; this.add(top);
    const spots: [number, number, number][] = [[-42, -16, 2.6], [-46, -21, 3.4], [-40, -25, 2.2], [-31, -24, 1.7], [-48, -11, 2.8], [-52, -18, 4], [-44, -8, 1.8], [-30, -13, 1.1], [-38, -13, 1.4], [-55, -28, 3.6], [36, -18, 1.6], [44, -22, 2.8], [50, -14, 3.2], [40, -12, 1.4]];
    for (const [x, z, s] of spots) mkRock(x, z, s, beachY(x, z) - s * 0.25);
    // kayalığa çıkış basamakları
    for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.3, 7), rockMat); st.position.set(ROCK_PAD.x + 3.2 + i * 0.9, beachY(ROCK_PAD.x + 3.2 + i * 0.9, ROCK_PAD.z + 2) + 0.05 + (3 - i) * 0.18, ROCK_PAD.z + 2 + i * 0.4); st.receiveShadow = true; this.add(st); }
  }

  // -------------------------------------------------------------- bahçe
  buildGarden() {
    // bahçe duvarı
    const wallMat = new THREE.MeshStandardMaterial({ map: TX.stone('#d9ccb4', 6), roughness: 0.9 });
    for (const c of STATIC_COLLIDERS.filter(b => b.h === 1 && (b.z0 > 9 && b.z0 < 10.3 || Math.abs(b.x0) > 39 || b.z0 > 61))) {
      if (c.x1 - c.x0 < 0.6 && c.z1 - c.z0 < 0.6) continue;
      this.box(c.x1 - c.x0, 1, c.z1 - c.z0, wallMat, (c.x0 + c.x1) / 2, GARDEN.y + 0.5, (c.z0 + c.z1) / 2, true);
    }
    for (const x of [-3, 3]) { this.box(0.6, 1.6, 0.6, wallMat, x, GARDEN.y + 0.8, 10.05, true); this.lampBulbs(this.scene, [[x, GARDEN.y + 1.7, 10.05]]); }
    // taş yol: kapıdan terasa
    const pathMat = new THREE.MeshStandardMaterial({ map: TX.stone('#d8cdb8', 1), roughness: 0.85 });
    for (let z = 10.8; z < 32; z += 1.15) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.6 + Math.sin(z) * 0.1, 0.05, 0.95), pathMat); s.position.set(Math.sin(z * 0.25) * 0.4, GARDEN.y + 0.02, z); s.rotation.y = Math.sin(z * 3) * 0.08; s.receiveShadow = true; this.add(s); }
    // mangal yolu
    for (let i = 0; i < 9; i++) { const t = i / 8; const s = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 8), pathMat); s.position.set(-1 - t * 11, GARDEN.y + 0.02, 15 + t * 4); s.receiveShadow = true; this.add(s); }
    // bahçe lambaları
    for (const [x, z] of [[-6, 13], [6, 13], [-6, 24], [6, 24], [-20, 16], [-24, 26], [26, 22], [30, 34], [-18, 34], [16, 34]] as const) {
      this.cyl(0.08, 0.1, 0.7, std(0x2a2a2a, 0.5), x, GARDEN.y + 0.35, z, 8);
      const bm = new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffb860, emissiveIntensity: 0 }); this.bulbMats.push(bm);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 10), bm); b.position.set(x, GARDEN.y + 0.78, z); this.add(b);
    }
    // çalılar ve çiçekler (bahçe kenarları)
    const bushMat = std(0x3f6b2a, 0.9), flowerCols = [0xff4d8d, 0xffffff, 0xff9f1c, 0xb15cff, 0xe63946];
    const bushGeo = new THREE.IcosahedronGeometry(0.6, 1);
    const bushPos: [number, number, number][] = [];
    for (let x = -38; x <= 38; x += 2.4) { if (Math.abs(x) > 4) bushPos.push([x, 11.2, 0.7 + Math.random() * 0.3]); bushPos.push([x, 60.6, 0.9 + Math.random() * 0.3]); }
    for (let z = 12; z <= 60; z += 2.6) { bushPos.push([-38.8, z, 0.8]); bushPos.push([38.8, z, 0.8]); }
    const bi = new THREE.InstancedMesh(bushGeo, bushMat, bushPos.length); const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    bushPos.forEach(([x, z, s], i) => { sc.set(s * 1.3, s, s * 1.2); mm.compose(new THREE.Vector3(x, GARDEN.y + s * 0.45, z), q.setFromEuler(new THREE.Euler(0, Math.random() * 6, 0)), sc); bi.setMatrixAt(i, mm); });
    bi.castShadow = true; bi.receiveShadow = true; this.add(bi);
    const fGeo = new THREE.SphereGeometry(0.07, 6, 5);
    for (let k = 0; k < flowerCols.length; k++) {
      const fi = new THREE.InstancedMesh(fGeo, std(flowerCols[k], 0.6), 70);
      for (let i = 0; i < 70; i++) { const b = bushPos[(i * 7 + k * 13) % bushPos.length]; mm.makeTranslation(b[0] + (Math.random() - 0.5) * 1.2, GARDEN.y + b[2] * 0.8 + Math.random() * 0.3, b[1] + (Math.random() - 0.5) * 1); fi.setMatrixAt(i, mm); }
      this.add(fi);
    }
    // çim (instanced, rüzgârla salınır)
    const count = this.quality === 'high' ? 70000 : this.quality === 'med' ? 28000 : 0;
    if (count) {
      const bg = new THREE.PlaneGeometry(0.06, 0.32, 1, 3); bg.translate(0, 0.16, 0);
      const pa = bg.attributes.position as THREE.BufferAttribute; for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); pa.setX(i, pa.getX(i) * (1 - y / 0.34)); }
      const mat = new THREE.MeshStandardMaterial({ color: 0x6e9e3a, roughness: 0.9, side: THREE.DoubleSide });
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = seaUniforms.uTime; sh.uniforms.uWind = { value: 0.3 }; mat.userData.sh = sh;
        sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 ip = instanceMatrix*vec4(0,0,0,1);
          float h = position.y/0.32;
          transformed.x += sin(uTime*1.8 + ip.x*0.4 + ip.z*0.3)*0.06*h*h*(0.5+uWind*2.0);
          transformed.z += cos(uTime*1.3 + ip.x*0.3)*0.03*h*h*(0.5+uWind*2.0);`);
      };
      const im = new THREE.InstancedMesh(bg, mat, count);
      const col = new THREE.Color(); let n = 0;
      for (let i = 0; i < count * 3 && n < count; i++) {
        const x = (Math.random() * 2 - 1) * 39, z = 10.6 + Math.random() * 51;
        if (this.blockedForGrass(x, z)) continue;
        mm.compose(new THREE.Vector3(x, GARDEN.y - 0.02, z), q.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.3)), sc.set(1, 0.6 + Math.random() * 0.8, 1));
        im.setMatrixAt(n, mm); im.setColorAt(n, col.setHSL(0.24 + Math.random() * 0.05, 0.5, 0.28 + Math.random() * 0.14)); n++;
      }
      im.count = n; im.receiveShadow = true; im.userData.noRecv = true; this.add(im); this.grass = im; this.grassMat = mat;
    }
  }
  blockedForGrass(x: number, z: number) {
    const r = (a: { x0: number; x1: number; z0: number; z1: number }, p = 0.3) => x > a.x0 - p && x < a.x1 + p && z > a.z0 - p && z < a.z1 + p;
    if (r(VILLA) || r(TERRACE) || r({ x0: POOL.x0 - 1.4, x1: POOL.x1 + 1.4, z0: POOL.z0 - 1.4, z1: POOL.z1 + 4.5 })) return true;
    if (Math.abs(x) < 1.3 && z < 32) return true;
    if (Math.hypot(x - GRILL.x, z - 24) < 6.5) return true;
    if (Math.hypot(x - SHOWER.x, z - SHOWER.z) < 1) return true;
    return false;
  }

  // -------------------------------------------------------------- villa
  buildVilla() {
    const V = VILLA;
    const plasterM = new THREE.MeshStandardMaterial({ map: TX.plaster(), color: 0xe9dfcf, roughness: 0.9 });
    const floorM = new THREE.MeshStandardMaterial({ map: (() => { const t = TX.planks('#a8774c').clone(); t.needsUpdate = true; t.repeat.set(4, 6); return t; })(), roughness: 0.45 });
    const woodM = new THREE.MeshStandardMaterial({ map: TX.planks('#8b5e3c'), roughness: 0.6 });
    const glassM = new THREE.MeshPhysicalMaterial({ color: 0xbfd8e0, roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.22, envMapIntensity: 2, depthWrite: false });
    const frameM = std(0x2a2a2a, 0.4, { metalness: 0.6 });
    // zemin
    this.box(V.x1 - V.x0, 0.24, V.z1 - V.z0, floorM, 0, V.floor - 0.12, (V.z0 + V.z1) / 2);
    // duvarlar
    const H = V.height;
    for (const c of STATIC_COLLIDERS.slice(0, 8)) {
      const w = c.x1 - c.x0, d = c.z1 - c.z0;
      this.box(w, H, d, c.z0 > 47.5 && c.x0 >= 7.8 ? std(0xf0ece4, 0.8) : plasterM, (c.x0 + c.x1) / 2, V.floor + H / 2, (c.z0 + c.z1) / 2, true);
    }
    // ön cephe: cam sürgü + pencereler (ön duvarı kısmen camla değiştir)
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 2.6), glassM); gl.position.set(0, V.floor + 1.3, V.z0 - 0.05); gl.userData.noRecv = true;
    // sürgü açık: camlar kenarlara toplanmış
    for (const x of [-5.5, 5.5]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), glassM); p.position.set(x, V.floor + 1.3, V.z0 - 0.2); this.add(p); }
    for (const x of [-4, 4]) this.box(0.08, 2.7, 0.12, frameM, x, V.floor + 1.35, V.z0, false);
    this.box(8, 0.12, 0.14, frameM, 0, V.floor + 2.7, V.z0, false);
    // yan pencereler
    for (const z of [42, 46.5]) for (const x of [V.x0, V.x1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), glassM); w.position.set(x + (x < 0 ? -0.17 : 0.17), V.floor + 1.6, z); w.rotation.y = Math.PI / 2; this.add(w); }
    // çatı (ince beton döşeme + ahşap saçak)
    const roof = this.box(V.x1 - V.x0 + 2.4, 0.3, V.z1 - V.z0 + 2.2, std(0xf4f1ea, 0.7), 0, V.floor + H + 0.15, (V.z0 + V.z1) / 2 - 0.6);
    this.box(V.x1 - V.x0 + 2.42, 0.12, V.z1 - V.z0 + 2.22, woodM, 0, V.floor + H - 0.02, (V.z0 + V.z1) / 2 - 0.6);
    roof.castShadow = true;
    // taş kaplama vurgu duvarı (dış)
    this.box(0.12, H, 6, new THREE.MeshStandardMaterial({ map: TX.stone('#b8a88a', 2), roughness: 0.9 }), V.x0 - 0.2, V.floor + H / 2, 47);
    // iç aydınlatma
    for (const [x, z] of [[-6, 45], [4, 46], [10, 51]] as const) {
      const bm = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffd9a0, emissiveIntensity: 0 }); this.bulbMats.push(bm);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.05, 20), bm); b.position.set(x, V.floor + H - 0.04, z); this.add(b);
      if (this.quality !== 'low' && z !== 51) { const l = new THREE.PointLight(0xffd9a0, 0, 12, 1.4); l.position.set(x, V.floor + H - 0.4, z); this.add(l); this.lamps.push({ light: l, bulb: b }); }
    }
    // --- salon: kanepe, sehpa, halı, TV
    const sofaM = std(0xd8cfc0, 0.95), cushM = std(0x2f5d7a, 0.95);
    const sofa = new THREE.Group(); sofa.position.set(3.5, V.floor, 43.85); this.add(sofa);
    this.box(5.2, 0.42, 0.9, sofaM, 0, 0.21, 0, false, sofa); this.box(5.2, 0.6, 0.22, sofaM, 0, 0.62, -0.38, false, sofa);
    for (const x of [-2.5, 2.5]) this.box(0.22, 0.6, 0.9, sofaM, x, 0.42, 0, false, sofa);
    for (const x of [-1.6, 0, 1.6]) this.box(1.5, 0.14, 0.75, sofaM, x, 0.49, 0.05, false, sofa);
    for (const x of [-1.9, 1.9]) { const c = this.box(0.45, 0.4, 0.14, cushM, x, 0.72, -0.2, false, sofa); c.rotation.x = -0.25; }
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3), new THREE.MeshStandardMaterial({ map: TX.stripes('#c9b79c', '#b39f80', 16), roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(3.5, V.floor + 0.005, 46.6); this.add(rug);
    this.box(1.4, 0.06, 0.7, woodM, 3.5, V.floor + 0.42, 46.4); this.box(1.3, 0.38, 0.6, std(0x3a3a3a), 3.5, V.floor + 0.2, 46.4);
    this.box(3.4, 0.5, 0.5, woodM, TV.x, V.floor + 0.25, TV.z + 0.05, false);
    this.tvCanvas = document.createElement('canvas'); this.tvCanvas.width = 256; this.tvCanvas.height = 144;
    const tvTex = new THREE.CanvasTexture(this.tvCanvas); tvTex.colorSpace = THREE.SRGBColorSpace;
    this.box(2.2, 1.28, 0.06, std(0x111111, 0.3), TV.x, V.floor + 1.3, TV.z + 0.12);
    this.tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.18), new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0xffffff, emissiveMap: tvTex, emissiveIntensity: 0, roughness: 0.2 }));
    this.tvScreen.position.set(TV.x, V.floor + 1.3, TV.z + 0.08); this.tvScreen.rotation.y = Math.PI; this.add(this.tvScreen);
    // hoparlör / müzik sistemi
    for (const x of [TV.x - 1.6, TV.x + 1.6]) this.box(0.3, 1.0, 0.3, std(0x1a1a1a, 0.6), x, V.floor + 0.5, TV.z, false);
    // bitki
    this.plantPot(-0.5, V.floor, 39); this.plantPot(11, V.floor, 39.3); this.plantPot(-11, V.floor, 50);
    // --- yemek masası
    this.box(5.4, 0.06, 1.5, woodM, -6.3, V.floor + 0.76, 42.35, false);
    for (const [x, z] of [[-8.8, 41.8], [-3.8, 41.8], [-8.8, 42.9], [-3.8, 42.9]]) this.box(0.08, 0.76, 0.08, frameM, x, V.floor + 0.38, z);
    SEATS.filter(s => s.id.startsWith('ym_')).forEach(s => this.seatMeshes.set(s.id, this.chair(s, 0x3a2a1e, 'plastic')));
    this.pendant(-6.3, 42.35, V.floor + H - 0.9);
    // --- mutfak: tezgâh, ocak, eviye, dolaplar, ada, buzdolabı
    const cab = std(0xf2f0eb, 0.4), top = std(0x2b2b2b, 0.25, { metalness: 0.2 });
    this.box(8.6, 0.9, 0.75, cab, -7.35, V.floor + 0.45, 53.45); this.box(8.7, 0.05, 0.8, top, -7.35, V.floor + 0.92, 53.43);
    this.box(8.6, 0.8, 0.4, cab, -7.35, V.floor + 2.3, 53.65);
    this.box(0.7, 0.02, 0.5, std(0x111111, 0.2), -9.5, V.floor + 0.955, 53.4); // ocak
    for (const [x, z] of [[-9.7, 53.3], [-9.3, 53.5]]) this.cyl(0.09, 0.09, 0.01, std(0x333333), x, V.floor + 0.97, z, 16);
    this.box(0.6, 0.05, 0.4, std(0xc0c0c0, 0.2, { metalness: 0.9 }), -6, V.floor + 0.95, 53.4); // eviye
    this.cyl(0.015, 0.015, 0.35, std(0xc0c0c0, 0.2, { metalness: 0.9 }), -6, V.floor + 1.12, 53.75, 8);
    this.box(4, 0.92, 1, woodM, -7, V.floor + 0.46, 48.9, false); this.box(4.1, 0.05, 1.1, std(0xf4f4f4, 0.3), -7, V.floor + 0.94, 48.9);
    // tezgâh üstü: çaydanlık, meyve kâsesi
    const kettle = new THREE.Group(); kettle.position.set(-8.6, V.floor + 0.97, 53.4); this.add(kettle);
    this.cyl(0.11, 0.13, 0.2, std(0xc0c0c0, 0.25, { metalness: 0.9 }), 0, 0.1, 0, 16, kettle); this.cyl(0.08, 0.1, 0.16, std(0xc0c0c0, 0.25, { metalness: 0.9 }), 0, 0.28, 0, 16, kettle);
    const bowl = this.cyl(0.22, 0.12, 0.1, std(0xf0eadc, 0.4), -7, V.floor + 1.02, 48.9, 18);
    ['portakal', 'limon', 'portakal', 'mandalina', 'nar'].forEach((f, i) => { const fr = makeFruit(f); fr.position.set(-7 + Math.cos(i * 1.3) * 0.1, V.floor + 1.1, 48.9 + Math.sin(i * 1.3) * 0.1); this.add(fr); });
    void bowl;
    // buzdolabı (kapı açılır)
    const fr = new THREE.Group(); fr.position.set(FRIDGE.x, V.floor, FRIDGE.z); this.add(fr);
    const steel = std(0xd0d0d0, 0.25, { metalness: 0.85 });
    this.box(0.9, 1.95, 0.7, steel, 0, 0.975, 0.05, false, fr);
    const inside = this.box(0.8, 1.8, 0.05, std(0xf8f8f8, 0.3, { emissive: 0xffffff, emissiveIntensity: 0.15 }), 0, 0.98, -0.31, false, fr);
    void inside;
    this.fridgeDoor = new THREE.Group(); this.fridgeDoor.position.set(-0.45, 0, -0.32); fr.add(this.fridgeDoor);
    this.box(0.9, 1.95, 0.06, steel, 0.45, 0.975, 0, false, this.fridgeDoor);
    this.box(0.03, 0.6, 0.04, std(0x333333), 0.82, 1.1, -0.05, false, this.fridgeDoor);
    // --- WC: kapı, klozet, lavabo, duş
    const door = new THREE.Group(); door.position.set(WC.x0, V.floor, 50); this.add(door);
    const dm = this.box(0.06, 2.15, 1.4, woodM, 0, 1.075, 0.7, false, door); this.colliderMeshes.push(dm);
    this.box(0.08, 0.04, 0.15, std(0xc0c0c0, 0.2, { metalness: 0.9 }), -0.06, 1.05, 1.25, false, door);
    this.doors.set('wc', door);
    const toilet = new THREE.Group(); toilet.position.set(11.45, V.floor, 52.2); toilet.rotation.y = -Math.PI / 2; this.add(toilet);
    this.cyl(0.18, 0.15, 0.4, porcelainM(), 0, 0.2, 0.08, 16, toilet).scale.z = 1.35;
    this.box(0.4, 0.4, 0.18, porcelainM(), 0, 0.6, -0.2, false, toilet);
    this.cyl(0.2, 0.2, 0.04, porcelainM(), 0, 0.42, 0.1, 16, toilet).scale.z = 1.3;
    this.box(0.5, 0.15, 0.4, porcelainM(), 11.6, V.floor + 0.85, 49.2); this.box(0.05, 0.6, 0.4, std(0xdddddd, 0.05, { metalness: 1 }), 11.85, V.floor + 1.45, 49.2);
    // WC tabelası
    const wcSign = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshStandardMaterial({ map: this.signTexture('WC', '#123', '#fff') })); wcSign.position.set(WC.x0 - 0.17, V.floor + 1.9, 50.7); wcSign.rotation.y = -Math.PI / 2; this.add(wcSign);
    // --- teras
    const deckM = new THREE.MeshStandardMaterial({ map: (() => { const t = TX.planks('#9a6f48').clone(); t.needsUpdate = true; t.repeat.set(4, 2); return t; })(), roughness: 0.8 });
    this.box(TERRACE.x1 - TERRACE.x0, 0.16, TERRACE.z1 - TERRACE.z0, deckM, 0, TERRACE.y - 0.08, (TERRACE.z0 + TERRACE.z1) / 2);
    // pergola
    const pm = std(0x5a3c24, 0.8);
    for (const x of [-11.7, -4.2, 4.2, 11.7]) this.box(0.18, 2.8, 0.18, pm, x, TERRACE.y + 1.4, TERRACE.z0 + 0.2);
    this.box(23.6, 0.16, 0.2, pm, 0, TERRACE.y + 2.85, TERRACE.z0 + 0.2);
    for (let x = -11.5; x <= 11.5; x += 0.9) this.box(0.08, 0.14, 6, pm, x, TERRACE.y + 2.95, (TERRACE.z0 + TERRACE.z1) / 2);
    this.stringLights(new THREE.Vector3(-11.6, TERRACE.y + 2.75, TERRACE.z0 + 0.3), new THREE.Vector3(11.6, TERRACE.y + 2.75, TERRACE.z0 + 0.3), 30, 0.35, true);
    // teras masası
    this.box(4.2, 0.06, 1.2, woodM, -6.5, TERRACE.y + 0.76, 35);
    for (const [x, z] of [[-8.4, 34.5], [-4.6, 34.5], [-8.4, 35.5], [-4.6, 35.5]]) this.box(0.07, 0.76, 0.07, pm, x, TERRACE.y + 0.38, z);
    SEATS.filter(s => s.id.startsWith('tr_n') || s.id.startsWith('tr_s')).forEach(s => this.seatMeshes.set(s.id, this.chair(s, 0x9a6f48)));
    // teras köşe kanepe
    const ts = new THREE.Group(); ts.position.set(4.8, TERRACE.y, 36.95); ts.rotation.y = Math.PI; this.add(ts);
    this.box(3.4, 0.4, 0.85, std(0xece4d4, 0.95), 0, 0.2, 0, false, ts); this.box(3.4, 0.55, 0.2, std(0xece4d4, 0.95), 0, 0.55, -0.35, false, ts);
    for (const x of [-0.8, 0.8]) this.box(1.5, 0.12, 0.7, std(0xc8573a, 0.95), x, 0.46, 0.05, false, ts);
    this.plantPot(-11.2, TERRACE.y, 32.8, 1.3); this.plantPot(11.2, TERRACE.y, 32.8, 1.3);
    // teras basamakları
    for (let i = 0; i < 2; i++) this.box(6, 0.07, 0.4, deckM, 0, GARDEN.y + 0.04 + i * 0.07, TERRACE.z0 - 0.4 + i * 0.25);
  }
  plantPot(x: number, y: number, z: number, s = 1) {
    this.cyl(0.25 * s, 0.18 * s, 0.5 * s, std(0xc8653a, 0.8), x, y + 0.25 * s, z, 12);
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45 * s, 1), std(0x3d7a32, 0.85)); l.position.set(x, y + 0.85 * s, z); l.scale.y = 1.4; l.castShadow = true; this.add(l);
  }
  pendant(x: number, z: number, y: number) {
    this.cyl(0.005, 0.005, 0.9, std(0x111111), x, y + 0.45, z, 4);
    const bm = new THREE.MeshStandardMaterial({ color: 0xffeacc, emissive: 0xffc078, emissiveIntensity: 0, side: THREE.DoubleSide }); this.bulbMats.push(bm);
    const sh = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.3, 20, 1, true), bm); sh.position.set(x, y, z); this.add(sh);
  }

  // -------------------------------------------------------------- havuz
  buildPool() {
    const P = POOL; const w = P.x1 - P.x0, d = P.z1 - P.z0, cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2;
    const tile = TX.tiles('#3aa6c9', '#d8f0f6', 8); const tt = tile.clone(); tt.needsUpdate = true; tt.repeat.set(w / 2, d / 2);
    const floorMat = makeCausticMaterial(tt);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat); fl.rotation.x = -Math.PI / 2; fl.position.set(cx, P.floor, cz); fl.receiveShadow = true; this.add(fl);
    const depth = GARDEN.y - P.floor;
    const wallTex = tile.clone(); wallTex.needsUpdate = true; wallTex.repeat.set(w / 2, depth / 2);
    const wm = makeCausticMaterial(wallTex); wm.side = THREE.DoubleSide;
    for (const [x, z, ww, ry] of [[cx, P.z0, w, 0], [cx, P.z1, w, Math.PI], [P.x0, cz, d, Math.PI / 2], [P.x1, cz, d, -Math.PI / 2]] as const) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(ww, depth), wm); m.position.set(x, P.floor + depth / 2, z); m.rotation.y = ry; this.add(m);
    }
    // kenar taşları (koping) + ahşap güverte
    const cop = std(0xf2ede2, 0.6);
    this.box(w + 1.2, 0.08, 0.6, cop, cx, GARDEN.y + 0.04, P.z0 - 0.3); this.box(w + 1.2, 0.08, 0.6, cop, cx, GARDEN.y + 0.04, P.z1 + 0.3);
    this.box(0.6, 0.08, d, cop, P.x0 - 0.3, GARDEN.y + 0.04, cz); this.box(0.6, 0.08, d, cop, P.x1 + 0.3, GARDEN.y + 0.04, cz);
    const deck = new THREE.MeshStandardMaterial({ map: (() => { const t = TX.stone('#e8dfcc', 1).clone(); t.needsUpdate = true; t.repeat.set(6, 1.5); return t; })(), roughness: 0.75 });
    this.box(w + 3, 0.04, 4, deck, cx, GARDEN.y + 0.02, P.z1 + 2.6);
    this.box(w + 3, 0.04, 1.2, deck, cx, GARDEN.y + 0.02, P.z0 - 1.2);
    this.poolWater = makePoolWater(w, d); this.poolWater.position.set(cx, P.water, cz); this.poolWater.renderOrder = 3; this.add(this.poolWater);
    // merdiven
    const ch = std(0xdddddd, 0.15, { metalness: 1 });
    for (const dx of [-0.35, 0.35]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 8, 16, Math.PI / 2), ch); r.position.set(P.x1 - 1.5 + dx, GARDEN.y + 0.05, P.z1 - 0.2); r.rotation.y = Math.PI / 2; this.add(r); this.cyl(0.03, 0.03, 1.2, ch, P.x1 - 1.5 + dx, GARDEN.y - 0.55, P.z1 - 0.62, 8); }
    for (let i = 0; i < 3; i++) this.box(0.8, 0.03, 0.12, ch, P.x1 - 1.5, GARDEN.y - 0.3 - i * 0.3, P.z1 - 0.62);
    // şezlonglar + şemsiye
    SEATS.filter(s => s.id.startsWith('hv_')).forEach(s => this.seatMeshes.set(s.id, this.sunbed(s)));
    this.umbrella(11.5, 31.5, GARDEN.y, ['#ffffff', '#1d3557']); this.umbrella(17.5, 31.5, GARDEN.y, ['#ffffff', '#1d3557']);
    // havuz ışıkları (gece)
    const pl = new THREE.MeshStandardMaterial({ color: 0x9ff, emissive: 0x2bd4ff, emissiveIntensity: 0 }); this.bulbMats.push(pl);
    for (const x of [P.x0 + 3, cx, P.x1 - 3]) { const b = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), pl); b.position.set(x, P.floor + 0.6, P.z0 + 0.01); this.add(b); }
  }

  // -------------------------------------------------------------- mangal alanı
  buildGrillArea() {
    const g = new THREE.Group(); g.position.set(GRILL.x, GARDEN.y, GRILL.z); this.add(g);
    // taş zemin
    const pav = new THREE.Mesh(new THREE.CircleGeometry(6.2, 40), new THREE.MeshStandardMaterial({ map: (() => { const t = TX.stone('#cfc3ad', 1).clone(); t.needsUpdate = true; t.repeat.set(5, 5); return t; })(), roughness: 0.85 }));
    pav.rotation.x = -Math.PI / 2; pav.position.set(0, 0.015, 2.6); pav.receiveShadow = true; g.add(pav);
    // tuğla mangal
    const brick = new THREE.MeshStandardMaterial({ map: TX.bricks(), roughness: 0.9 });
    const bt = TX.bricks().clone(); bt.needsUpdate = true; bt.repeat.set(2.5, 1.2); brick.map = bt;
    this.box(2.5, 0.85, 1.0, brick, 0, 0.425, 0, true, g);
    this.box(2.6, 0.06, 1.1, std(0x7a7a72, 0.9), 0, 0.88, 0, false, g);
    this.box(0.5, 1.6, 1.0, brick, -1.5, 0.8, 0, true, g); // yan duvar/raf
    this.box(1.0, 0.05, 1.0, std(0xd8d0c0, 0.8), 1.8, 0.86, 0, false, g); // hazırlık tezgâhı
    this.box(0.9, 0.82, 0.9, std(0x6a4a2e), 1.8, 0.41, 0, false, g);
    // kor yatağı + ızgara teli
    this.coals = new THREE.MeshStandardMaterial({ color: 0x1a0a06, emissive: 0xc8320a, emissiveIntensity: 0.8, roughness: 1 });
    const cg = new THREE.Group(); cg.position.y = 0.95; g.add(cg);
    this.box(1.9, 0.18, 0.75, std(0x222222, 0.6, { metalness: 0.7 }), 0, 0, 0, false, cg);
    for (let i = 0; i < 60; i++) { const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.025 + Math.random() * 0.02), this.coals); c.position.set((Math.random() - 0.5) * 1.7, 0.06, (Math.random() - 0.5) * 0.6); c.rotation.set(Math.random() * 6, Math.random() * 6, 0); cg.add(c); }
    const grate = std(0x333333, 0.5, { metalness: 0.9 });
    for (let x = -0.9; x <= 0.9; x += 0.06) this.box(0.008, 0.008, 0.72, grate, x, 0.3, 0, false, cg);
    this.box(1.9, 0.02, 0.02, grate, 0, 0.3, 0.36, false, cg); this.box(1.9, 0.02, 0.02, grate, 0, 0.3, -0.36, false, cg);
    // ızgara slotları (2 sıra x 5)
    for (let i = 0; i < 10; i++) this.grillSlotPos.push(new THREE.Vector3(GRILL.x - 0.72 + (i % 5) * 0.36, GARDEN.y + 0.95 + 0.32, GRILL.z + (i < 5 ? -0.16 : 0.16)));
    this.fireLight = new THREE.PointLight(0xff7a2a, 2, 9, 1.8); this.fireLight.position.set(GRILL.x, GARDEN.y + 1.6, GRILL.z + 0.2); this.add(this.fireLight);
    // baca/davlumbaz
    this.box(2.4, 0.08, 1.0, std(0x3a3a3a, 0.6, { metalness: 0.6 }), 0, 2.5, 0, false, g);
    this.cyl(0.18, 0.22, 1.4, std(0x3a3a3a, 0.6, { metalness: 0.6 }), 0, 3.2, 0, 12, g);
    for (const x of [-1.2, 1.2]) this.box(0.08, 1.6, 0.08, std(0x3a3a3a), x, 1.7, 0.45, false, g);
    // büyük masa
    const woodM = new THREE.MeshStandardMaterial({ map: TX.planks('#a0754c'), roughness: 0.75 });
    this.box(5.2, 0.08, 1.1, woodM, 0, 0.78, 5.5, false, g);
    for (const [x, z] of [[-2.4, 5.05], [2.4, 5.05], [-2.4, 5.95], [2.4, 5.95]]) this.box(0.1, 0.78, 0.1, std(0x5a3c24), x, 0.39, z, false, g);
    SEATS.filter(s => s.id.startsWith('mm_')).forEach(s => this.seatMeshes.set(s.id, this.chair(s, 0xa0754c)));
    for (const s of SEATS.filter(s => s.id.startsWith('mg_'))) { const st = this.cyl(0.2, 0.18, 0.45, woodM, s.x, GARDEN.y + 0.225, s.z, 10); this.seatMeshes.set(s.id, st); }
    // masa üstü: ekmek sepeti, salata, su sürahisi
    this.cyl(0.18, 0.14, 0.1, std(0xb08850, 1), -1.5, 0.87, 5.5, 12, g);
    this.cyl(0.2, 0.12, 0.1, std(0xffffff, 0.3), 0.2, 0.87, 5.5, 16, g);
    for (let i = 0; i < 8; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), std(i % 3 ? 0x4a9a3a : 0xd8392b)); l.position.set(0.2 + Math.cos(i) * 0.1, 0.95, 5.5 + Math.sin(i) * 0.1); g.add(l); }
    const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.25, 14), new THREE.MeshPhysicalMaterial({ color: 0xddeeff, transparent: true, opacity: 0.35, roughness: 0.05 })); jug.position.set(1.4, 0.95, 5.5); g.add(jug);
    // ip ışıklar (direkler arası)
    const poles: [number, number][] = [[-5.2, 1.5], [5.2, 1.5], [5.2, 8.4], [-5.2, 8.4]];
    for (const [x, z] of poles) this.cyl(0.07, 0.08, 3.4, std(0x5a3c24), GRILL.x + x, GARDEN.y + 1.7, GRILL.z + z, 8);
    for (let i = 0; i < 4; i++) { const a = poles[i], b = poles[(i + 1) % 4]; this.stringLights(new THREE.Vector3(GRILL.x + a[0], GARDEN.y + 3.3, GRILL.z + a[1]), new THREE.Vector3(GRILL.x + b[0], GARDEN.y + 3.3, GRILL.z + b[1]), 14, 0.45, i === 0); }
    this.stringLights(new THREE.Vector3(GRILL.x - 5.2, GARDEN.y + 3.3, GRILL.z + 1.5), new THREE.Vector3(GRILL.x + 5.2, GARDEN.y + 3.3, GRILL.z + 8.4), 18, 0.6, false);
    // radyo
    const radio = new THREE.Group(); radio.position.set(RADIO.x, GARDEN.y, RADIO.z); this.add(radio);
    this.box(0.5, 0.75, 0.5, woodM, 0, 0.375, 0, false, radio);
    this.box(0.5, 0.3, 0.2, std(0x7a2e1e, 0.6), 0, 0.9, 0, false, radio);
    this.cyl(0.08, 0.08, 0.02, std(0x222222), 0.12, 0.9, 0.11, 16, radio).rotation.x = Math.PI / 2;
    this.cyl(0.006, 0.006, 0.5, std(0xaaaaaa, 0.2, { metalness: 1 }), -0.18, 1.3, 0, 4, radio).rotation.z = 0.4;
  }

  // -------------------------------------------------------------- meyve bahçesi
  buildOrchard() {
    const trunkM = new THREE.MeshStandardMaterial({ map: TX.bark(), color: 0x8a7a68, roughness: 0.95 });
    for (const t of TREES) {
      const g = new THREE.Group(); g.position.set(t.x, GARDEN.y, t.z); this.add(g); this.treeObjs.set(t.id, g);
      const fruitDef = FRUITS.find(f => f.id === t.fruit)!;
      const fruits: THREE.Object3D[] = [];
      if (t.fruit === 'uzum') { // asma çardağı
        const pm = std(0x5a3c24);
        for (const [x, z] of [[-2, -1.5], [2, -1.5], [-2, 1.5], [2, 1.5]]) this.cyl(0.08, 0.1, 2.4, pm, x, 1.2, z, 8, g);
        for (let x = -2; x <= 2; x += 0.5) this.box(0.06, 0.06, 3.2, pm, x, 2.42, 0, false, g);
        const leaves = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.3, 3.4, 8, 1, 6), std(0x5a8a32, 0.9)); leaves.position.y = 2.6; leaves.castShadow = true; g.add(leaves);
        for (let i = 0; i < t.max; i++) { const f = makeFruit('uzum'); f.position.set(-1.6 + (i % 5) * 0.8, 2.35, -1 + Math.floor(i / 5) * 1.8); g.add(f); fruits.push(f); }
      } else {
        const olive = t.fruit === 'zeytin', fig = t.fruit === 'incir';
        const h = olive ? 1.4 : 1.6;
        const tr = this.cyl(0.11, 0.17, h, trunkM, 0, h / 2, 0, 8, g); tr.rotation.z = olive ? 0.12 : 0.04;
        const leafCol = olive ? 0x7d8f6a : fig ? 0x4f7f2e : 0x2f5f24;
        const lm = std(leafCol, 0.85);
        const blobs = olive ? 6 : 5;
        for (let i = 0; i < blobs; i++) {
          const b = new THREE.Mesh(new THREE.IcosahedronGeometry(olive ? 0.9 : 1.0, 1), lm);
          const a = i / blobs * Math.PI * 2;
          b.position.set(Math.cos(a) * 0.7, h + 0.8 + Math.sin(i * 2.1) * 0.3, Math.sin(a) * 0.7); b.scale.set(1, 0.85, 1); b.castShadow = true; g.add(b);
        }
        const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), lm); c.position.y = h + 1.3; c.castShadow = true; g.add(c);
        for (let i = 0; i < t.max; i++) {
          const f = makeFruit(t.fruit); const a = i * 2.4, r = 1.25 + (i % 2) * 0.25;
          f.position.set(Math.cos(a) * r, h + 0.5 + (i % 4) * 0.35, Math.sin(a) * r);
          if (olive) f.scale.setScalar(1.6);
          g.add(f); fruits.push(f);
        }
        void fruitDef;
      }
      this.treeFruits.set(t.id, fruits);
    }
    // tabela
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshStandardMaterial({ map: this.signTexture('MEYVE BAHÇESİ', '#3d5a1e', '#fff6d8') }));
    sign.position.set(-19.5, GARDEN.y + 1.2, 33); sign.rotation.y = -Math.PI / 2; this.add(sign);
    this.cyl(0.04, 0.04, 1.2, std(0x5a3c24), -19.5, GARDEN.y + 0.6, 33, 6);
  }
  setTreeFruit(id: string, n: number) {
    const fr = this.treeFruits.get(id); if (!fr) return;
    fr.forEach((f, i) => (f.visible = i < n));
  }

  // -------------------------------------------------------------- palmiyeler
  buildPalms() {
    const trunkM = new THREE.MeshStandardMaterial({ map: TX.bark(), roughness: 0.95 });
    const leafM = new THREE.MeshStandardMaterial({ map: TX.leafTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
    for (const [x, z, h] of PALMS) {
      const y0 = z < 8 ? beachY(x, z) : GARDEN.y;
      const g = new THREE.Group(); g.position.set(x, y0, z); this.add(g);
      const lean = new THREE.Vector3(Math.sin(x * 1.7) * 1.2, 0, Math.cos(z * 1.3) * 1.2 - (z < 8 ? 0.8 : 0));
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean.x * 0.2, h * 0.55, lean.z * 0.2), new THREE.Vector3(lean.x, h, lean.z));
      const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.17, 8), trunkM); trunk.castShadow = true; g.add(trunk);
      const top = new THREE.Group(); top.position.copy(curve.getPoint(1)); g.add(top);
      for (let i = 0; i < 4; i++) { const n = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), std(0x5a3a1a)); n.position.set(Math.cos(i * 1.6) * 0.15, -0.15, Math.sin(i * 1.6) * 0.15); top.add(n); }
      const fronds = 11;
      for (let i = 0; i < fronds; i++) {
        const geo = new THREE.PlaneGeometry(1.1, 3.4, 1, 8); geo.translate(0, 1.7, 0);
        const p = geo.attributes.position as THREE.BufferAttribute;
        for (let k = 0; k < p.count; k++) { const yy = p.getY(k); const t = yy / 3.4; p.setZ(k, -t * t * 1.6 + Math.abs(p.getX(k)) * 0.35); }
        geo.computeVertexNormals();
        const f = new THREE.Mesh(geo, leafM); f.castShadow = true;
        const piv = new THREE.Group(); piv.rotation.y = (i / fronds) * Math.PI * 2 + Math.random() * 0.3; top.add(piv);
        f.rotation.x = 1.0 + Math.random() * 0.5 - (i % 3 === 0 ? 0.5 : 0); piv.add(f);
        piv.userData.sway = Math.random() * 6;
      }
      top.userData.top = true;
      this.palms.push(top);
    }
  }

  // -------------------------------------------------------------- martılar
  buildGulls() {
    const wm = std(0xf4f4f4, 0.7), dm = std(0x9aa0a6, 0.7);
    for (let i = 0; i < 7; i++) {
      const o = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.32, 4, 8), wm); body.rotation.x = Math.PI / 2; o.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), wm); head.position.z = 0.25; o.add(head);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 6), std(0xf2b90f)); beak.rotation.x = Math.PI / 2; beak.position.z = 0.34; o.add(beak);
      const wing = (s: number) => { const w = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.015, 0.18), dm); m.position.x = s * 0.28; w.add(m); const tip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.12), std(0x222222)); tip.position.x = s * 0.62; w.add(tip); o.add(w); return w; };
      const wingL = wing(1), wingR = wing(-1);
      o.castShadow = true;
      this.add(o);
      this.gulls.push({ o, wingL, wingR, r: 15 + Math.random() * 30, c: new THREE.Vector3((Math.random() - 0.5) * 50, 0, -30 - Math.random() * 30), s: 0.15 + Math.random() * 0.15, ph: Math.random() * 6, h: 9 + Math.random() * 10 });
    }
  }

  // -------------------------------------------------------------- ufuk: uzak adalar ve tepeler
  buildHorizon() {
    const m = new THREE.MeshStandardMaterial({ color: 0x6a7f6a, roughness: 1, flatShading: true });
    for (const [x, z, s, h] of [[-220, -420, 140, 40], [120, -480, 180, 55], [380, -380, 120, 30], [-420, -260, 160, 60], [0, -620, 260, 45]] as const) {
      const g = new THREE.ConeGeometry(s, h, 9, 2); const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > -h / 2 + 1) p.setX(i, p.getX(i) * (0.8 + Math.random() * 0.4));
      g.computeVertexNormals();
      const mm = new THREE.Mesh(g, m); mm.position.set(x, h / 2 - 6, z); mm.scale.z = 0.5; this.add(mm);
    }
    // arka tepeler (villanın arkası)
    for (let i = 0; i < 9; i++) { const g = new THREE.SphereGeometry(40 + i * 3, 10, 6); const mm = new THREE.Mesh(g, std(0x5f7a48, 1, { flatShading: true })); mm.position.set(-160 + i * 40, -18, 140 + (i % 3) * 20); mm.scale.y = 0.6; this.add(mm); }
    // çam/servi ağaçları arka plan
    const cy = std(0x2f4a24, 0.9);
    for (let i = 0; i < 40; i++) { const x = -60 + Math.random() * 120, z = 66 + Math.random() * 20; const c = new THREE.Mesh(new THREE.ConeGeometry(0.9, 6 + Math.random() * 4, 7), cy); c.position.set(x, GARDEN.y + 3 + Math.random(), z); c.castShadow = true; this.add(c); }
  }

  // -------------------------------------------------------------- hava
  buildWeather() {
    const n = this.quality === 'low' ? 1500 : 4000;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60; pos.set([x, y, z, x + 0.05, y - 0.6, z], i * 6); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0.35 }));
    this.rain.visible = false; this.rain.frustumCulled = false; this.add(this.rain);
  }

  // -------------------------------------------------------------- güncelleme
  setEnv(hour: number, weather: string) { this.hour = hour; this.weather = weather; }
  setDoor(id: string, open: boolean) { const d = this.doors.get(id); if (d) d.userData.target = open ? -Math.PI / 2 * 0.95 : 0; }
  openFridge() { this.fridgeOpenT = 3; }

  update(dt: number, camPos: THREE.Vector3) {
    this.time += dt;
    seaUniforms.uTime.value = this.time;
    const h = this.hour;
    // güneş açısı: 6'da doğar, 20'de batar
    const dayT = (h - 6) / 14.5; // 0..1 (≈20:30 gün batımı)
    const elev = Math.sin(Math.PI * Math.min(1, Math.max(0, dayT))) * 62 - (dayT < 0 || dayT > 1 ? 12 : 0);
    const elevR = THREE.MathUtils.degToRad(elev);
    const th = Math.PI * Math.min(1.1, Math.max(-0.1, dayT));
    const ce = Math.cos(elevR);
    const sunDir = new THREE.Vector3(Math.cos(th) * ce, Math.sin(elevR), -Math.sin(th) * ce * 0.8 - 0.35 * ce).normalize();
    // bulut/yağmur oranı
    const wx = this.weather;
    const cloud = wx === 'gunesli' ? 0.15 : wx === 'ruzgarli' ? 0.3 : wx === 'bulutlu' ? 0.75 : wx === 'yagmurlu' ? 0.9 : 1;
    this.wind = wx === 'ruzgarli' ? 0.8 : wx === 'firtina' ? 1.6 : wx === 'yagmurlu' ? 0.6 : wx === 'bulutlu' ? 0.4 : 0.2;
    const day = THREE.MathUtils.smoothstep(elev, -6, 10);
    this.night = 1 - day;
    const golden = THREE.MathUtils.smoothstep(elev, 25, 3) * day;
    // gökyüzü
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(sunDir);
    u.turbidity.value = 1.2 + golden * 2 + cloud * 9; u.rayleigh.value = 2.2 + golden * 1.4 + cloud * 0.4; u.mieCoefficient.value = 0.0012 + golden * 0.007 + cloud * 0.004;
    // güneş ışığı
    const sunCol = new THREE.Color().setHSL(0.11 - golden * 0.06, 0.12 + golden * 0.75, 0.9 - golden * 0.25);
    this.sun.color.copy(sunCol);
    this.sun.intensity = Math.max(0, day * (1.85 - golden * 0.55) * (1 - cloud * 0.6));
    this.sun.position.copy(camPos).add(sunDir.clone().multiplyScalar(120)); this.sun.position.y = Math.max(this.sun.position.y, camPos.y + 8);
    this.sun.target.position.copy(camPos); this.sun.target.updateMatrixWorld();
    // ay ışığı
    const moonDir = new THREE.Vector3(-0.4, 0.55, -0.75).normalize();
    this.moonLight.intensity = this.night * 0.22 * (1 - cloud * 0.6);
    this.moonLight.position.copy(camPos).add(moonDir.clone().multiplyScalar(100)); this.moonLight.target.position.copy(camPos); this.moonLight.target.updateMatrixWorld();
    this.moon.position.copy(moonDir).multiplyScalar(1500); this.moon.lookAt(0, 0, 0);
    (this.moon.material as THREE.MeshBasicMaterial).opacity = this.night * (1 - cloud * 0.8);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, this.night - 0.2) * (1 - cloud);
    this.hemi.intensity = 0.07 + day * 0.43;
    this.hemi.color.setHSL(0.58, 0.5, 0.35 + day * 0.4).lerp(new THREE.Color(0xffb37a), golden * 0.5);
    this.hemi.groundColor.setHSL(0.1, 0.3, 0.15 + day * 0.3);
    // sis rengi
    const fogCol = new THREE.Color().setHSL(0.57, 0.45 - golden * 0.1, 0.07 + day * 0.58).lerp(new THREE.Color(0xf0a070), golden * 0.45).lerp(new THREE.Color(0x8a96a0), cloud * 0.5 * day);
    const fog = this.scene.fog as THREE.FogExp2; fog.color.copy(fogCol); fog.density = 0.0018 + cloud * 0.004 + (wx === 'firtina' ? 0.006 : 0);
    // deniz
    seaUniforms.uSunDir.value.copy(sunDir); seaUniforms.uSunColor.value.copy(sunCol); seaUniforms.uSunInt.value = day * (1 - cloud * 0.85);
    seaUniforms.uZenith.value.setHSL(0.6, 0.6 - cloud * 0.4, 0.05 + day * 0.4); seaUniforms.uHorizon.value.copy(fogCol);
    seaUniforms.uLight.value = 0.06 + day * 0.94; seaUniforms.uMoon.value = this.night;
    seaUniforms.uAmp.value += ((wx === 'firtina' ? 3.2 : wx === 'ruzgarli' ? 1.8 : wx === 'yagmurlu' ? 1.5 : 1) - seaUniforms.uAmp.value) * dt * 0.3;
    ((this.poolWater.material as THREE.ShaderMaterial).uniforms.uNight).value = this.night;
    // lambalar
    const lampOn = THREE.MathUtils.smoothstep(this.night + cloud * 0.25, 0.35, 0.65);
    for (const bm of this.bulbMats) bm.emissiveIntensity = lampOn * 3.5;
    for (const l of this.lamps) if (l.light) l.light.intensity = lampOn * 9;
    // ateş titremesi
    this.fireLight.intensity = (1.2 + Math.sin(this.time * 13) * 0.25 + Math.sin(this.time * 7.3) * 0.3 + Math.random() * 0.2) * (0.9 + this.night * 5) * (this.coals.emissiveIntensity > 0.1 ? 1 : 0);
    // bulutlar
    for (const c of this.clouds) { (c.material as THREE.SpriteMaterial).opacity = cloud * 0.9 * (0.4 + day * 0.6); (c.material as THREE.SpriteMaterial).color.copy(fogCol).lerp(new THREE.Color(0xffffff), 0.5 * day - cloud * 0.3); c.position.x = c.userData.base.x + Math.sin(this.time * 0.002 + c.userData.base.z) * 200 + this.time * this.wind * 0.6 % 800; }
    // yağmur
    const raining = wx === 'yagmurlu' || wx === 'firtina';
    this.rainOn += ((raining ? 1 : 0) - this.rainOn) * dt * 0.5;
    this.rain.visible = this.rainOn > 0.02;
    if (this.rain.visible) {
      (this.rain.material as THREE.LineBasicMaterial).opacity = 0.35 * this.rainOn;
      this.rain.position.set(camPos.x, camPos.y - 10, camPos.z);
      const p = this.rain.geometry.attributes.position as THREE.BufferAttribute; const arr = p.array as Float32Array;
      const fall = dt * 22; const drift = dt * this.wind * 4;
      for (let i = 0; i < arr.length; i += 6) { arr[i + 1] -= fall; arr[i + 4] -= fall; arr[i] += drift; arr[i + 3] += drift; if (arr[i + 1] < 0) { const y = 30; arr[i + 1] = y; arr[i + 4] = y - 0.6; arr[i] = (Math.random() - 0.5) * 60; arr[i + 3] = arr[i] + 0.05; } }
      p.needsUpdate = true;
    }
    // şimşek
    if (wx === 'firtina' && Math.random() < dt * 0.08) this.flash = 1;
    if (this.flash > 0) { this.flash -= dt * 3; this.hemi.intensity += Math.max(0, this.flash) * 4; }
    // çim rüzgârı
    if (this.grassMat?.userData.sh) this.grassMat.userData.sh.uniforms.uWind.value = this.wind;
    // palmiyeler
    for (const t of this.palms) t.children.forEach((piv, i) => { if (piv.userData.sway !== undefined) { piv.rotation.z = Math.sin(this.time * (1 + this.wind) + piv.userData.sway) * 0.05 * (0.5 + this.wind); piv.rotation.x = Math.sin(this.time * 1.3 + i) * 0.03 * this.wind; } });
    // tekneler ve şamandıralar
    for (const b of this.boats) {
      if (b.userData.buoy !== undefined) { b.position.y = Math.sin(this.time * 1.4 + b.userData.buoy) * 0.12 * seaUniforms.uAmp.value; continue; }
      const bb = b.userData.base; b.position.y = Math.sin(this.time * 0.9 + bb.ph) * 0.1 * seaUniforms.uAmp.value; b.rotation.z = Math.sin(this.time * 0.7 + bb.ph) * 0.04 * seaUniforms.uAmp.value; b.rotation.x = Math.sin(this.time * 0.5 + bb.ph) * 0.02 * seaUniforms.uAmp.value;
    }
    // martılar
    for (const g of this.gulls) {
      const a = this.time * g.s + g.ph;
      g.o.position.set(g.c.x + Math.cos(a) * g.r, g.h + Math.sin(a * 2) * 1.5, g.c.z + Math.sin(a) * g.r);
      g.o.rotation.y = -a + Math.PI; g.o.rotation.z = 0.25;
      const fl = Math.sin(this.time * 9 + g.ph) * 0.5 * (Math.sin(this.time * 0.6 + g.ph) > 0.3 ? 1 : 0.15);
      g.wingL.rotation.z = fl; g.wingR.rotation.z = -fl;
    }
    // kapılar
    for (const d of this.doors.values()) { const t = d.userData.target ?? 0; d.rotation.y += (t - d.rotation.y) * Math.min(1, dt * 6); }
    // buzdolabı
    this.fridgeOpenT = Math.max(0, this.fridgeOpenT - dt);
    this.fridgeDoor.rotation.y += ((this.fridgeOpenT > 0 ? -1.6 : 0) - this.fridgeDoor.rotation.y) * Math.min(1, dt * 5);
    // TV
    const tvm = this.tvScreen.material as THREE.MeshStandardMaterial;
    tvm.emissiveIntensity = this.tvOn ? 1.2 : 0;
    if (this.tvOn && Math.floor(this.time * 10) % 2 === 0) this.drawTV();
    // gölge kamerası kaliteye göre
  }
  drawTV() {
    const g = this.tvCanvas.getContext('2d')!; const t = this.time;
    const grd = g.createLinearGradient(0, 0, 256, 144); grd.addColorStop(0, `hsl(${(t * 20) % 360},70%,45%)`); grd.addColorStop(1, `hsl(${(t * 20 + 120) % 360},70%,30%)`);
    g.fillStyle = grd; g.fillRect(0, 0, 256, 144);
    g.fillStyle = 'rgba(255,255,255,.9)'; g.font = 'bold 22px sans-serif'; g.fillText('SAHİL TV', 12, 30);
    g.font = '15px sans-serif'; g.fillText('Canlı: Akşam Muhabbeti', 12, 128);
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(128 + Math.sin(t * 2 + i) * 70, 75 + Math.cos(t * 1.5 + i * 2) * 25, 10 + i * 2, 0, 7); g.fillStyle = `hsla(${i * 60},90%,70%,.7)`; g.fill(); }
    ((this.tvScreen.material as THREE.MeshStandardMaterial).emissiveMap as THREE.Texture).needsUpdate = true;
  }

  /** Çevre haritası (PBR yansımalar) – saat/hava değişince yenilenir. */
  refreshEnv() {
    const key = Math.round(this.hour * 2) + this.weather;
    if (key === this.lastEnvKey) return; this.lastEnvKey = key;
    const tmp = new Sky(); tmp.scale.setScalar(1000);
    const su = this.sky.material.uniforms, tu = tmp.material.uniforms;
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) tu[k].value = su[k].value;
    tu.sunPosition.value.copy(su.sunPosition.value);
    this.skyScene.clear(); this.skyScene.add(tmp);
    const rt = this.pmrem.fromScene(this.skyScene, 0, 0.1, 1100);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt; this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.06 + (1 - this.night) * 0.05;
    tmp.geometry.dispose(); tmp.material.dispose();
  }
}

let _porc: THREE.MeshStandardMaterial | null = null;
function porcelainM() { return _porc ??= new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.15 }); }
