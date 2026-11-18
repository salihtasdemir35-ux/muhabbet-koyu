// ======================================================================
//  Karakter: prosedürel insan modeli + iskelet + prosedürel animasyon
//  Bütün animasyonlar (yürüme, oturma, yüzme, balık, içme, dans, düşme...)
//  eklem açılarıyla hesaplanır ve yumuşak geçişlerle karıştırılır.
// ======================================================================
import * as THREE from 'three';
import { Look, DEFAULT_LOOK } from '../../shared/data';
import { makeHeld, setFill } from './items';

type V3 = { x: number; y: number; z: number };
const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'elL', 'haL', 'shR', 'elR', 'haR', 'hipL', 'knL', 'anL', 'hipR', 'knR', 'anR'] as const;
type J = typeof JOINTS[number];
export interface Pose { j: Record<J, V3>; hipsY: number; hipsZ: number; mouth: number; brow: number; eyes: number; itemTilt: number; rodPitch: number; itemY: number }

function emptyPose(): Pose {
  const j = {} as Record<J, V3>;
  for (const k of JOINTS) j[k] = { x: 0, y: 0, z: 0 };
  return { j, hipsY: 0, hipsZ: 0, mouth: 0, brow: 0, eyes: 1, itemTilt: 0, rodPitch: 0.9, itemY: 0 };
}

const skinMatCache = new Map<number, THREE.MeshStandardMaterial>();
function cloth(color: number, rough = 0.85, map?: THREE.Texture) { return new THREE.MeshStandardMaterial({ color: map ? 0xffffff : color, roughness: rough, map: map ?? null }); }
function patternTex(kind: 'hawaii' | 'stripe', color: number) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  const base = '#' + color.toString(16).padStart(6, '0');
  g.fillStyle = kind === 'stripe' ? '#f4f1ea' : base; g.fillRect(0, 0, 128, 128);
  if (kind === 'stripe') { g.fillStyle = base; for (let y = 0; y < 128; y += 16) g.fillRect(0, y, 128, 8); }
  else { for (let i = 0; i < 26; i++) { const x = (i * 47) % 128, y = (i * 83) % 128; g.fillStyle = ['#fff6d5', '#ff6f61', '#ffd166', '#2ec4b6'][i % 4]; for (let p = 0; p < 5; p++) { g.beginPath(); g.ellipse(x + Math.cos(p * 1.26) * 6, y + Math.sin(p * 1.26) * 6, 5, 3, p * 1.26, 0, 7); g.fill(); } g.fillStyle = '#ffd166'; g.beginPath(); g.arc(x, y, 2.5, 0, 7); g.fill(); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Character {
  root = new THREE.Group();
  body = new THREE.Group();
  joints = {} as Record<J, THREE.Object3D>;
  look: Look;
  name: string;
  cur = emptyPose();
  anim = 'idle'; animT = 0; t = Math.random() * 10;
  speed = 0;
  talk = 0;           // 0..1 konuşma seviyesi (ağız)
  talkS = 0;
  lookYaw = 0; lookPitch = 0; tLookYaw = 0; tLookPitch = 0;
  tipsy = 0;
  held: THREE.Object3D | null = null; heldKey = '';
  heldFill = 1;
  mouth!: THREE.Mesh; browL!: THREE.Mesh; browR!: THREE.Mesh; eyeL!: THREE.Object3D; eyeR!: THREE.Object3D;
  face = new THREE.Group();
  tag!: THREE.Sprite; tagState = '';
  flags = { speaking: false, host: false, muted: false, group: false, level: 0 };
  blinkT = 2;
  hipH = 0.92;
  private dims = { sw: 0.19, hw: 0.1, thick: 1 };
  rodTip = new THREE.Vector3();
  isLocal = false;

  constructor(look: Look = DEFAULT_LOOK, name = '') {
    this.look = { ...DEFAULT_LOOK, ...look }; this.name = name;
    this.root.add(this.body);
    this.build();
    this.makeTag();
  }

  // ---------------------------------------------------------------- inşa
  build() {
    this.body.clear();
    const L = this.look;
    const fem = L.gender === 'k';
    const b = 0.85 + L.build * 0.4;
    this.dims = { sw: (fem ? 0.165 : 0.195) * (0.92 + L.build * 0.16), hw: fem ? 0.105 : 0.095, thick: b };
    let skin = skinMatCache.get(L.skin);
    if (!skin) { skin = new THREE.MeshStandardMaterial({ color: L.skin, roughness: 0.62, metalness: 0 }); skinMatCache.set(L.skin, skin); }
    const top = L.top;
    const topTex = top === 'top_hawaii' ? patternTex('hawaii', L.topColor) : top === 'top_fener' ? patternTex('stripe', L.topColor) : undefined;
    const shirt = cloth(L.topColor, top === 'top_mayo' ? 0.5 : 0.85, topTex);
    const pants = cloth(L.bottomColor, L.bottom === 'bottom_mayo' ? 0.6 : 0.9);
    const shoeM = cloth(L.shoesColor, 0.6);
    const hairM = new THREE.MeshStandardMaterial({ color: L.hairColor, roughness: 0.75 });
    const bareTorso = top === 'top_mayo';
    const sleeves = ['top_tisort', 'top_gomlek', 'top_hawaii', 'top_polo', 'top_fener'].includes(top);
    const dress = top === 'top_elbise';
    const skirt = L.bottom === 'bottom_etek' || dress;
    const longPants = L.bottom === 'bottom_pantolon' && !dress;

    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = false; parent.add(m); return m;
    };
    const joint = (name: J, parent: THREE.Object3D, x: number, y: number, z: number) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); this.joints[name] = o; return o; };

    const hips = joint('hips', this.body, 0, this.hipH, 0);
    const spine = joint('spine', hips, 0, 0.1, 0);
    const chest = joint('chest', spine, 0, 0.18, 0);
    const neck = joint('neck', chest, 0, 0.26, 0);
    const head = joint('head', neck, 0, 0.07, 0);
    const sw = this.dims.sw;
    const shL = joint('shL', chest, sw, 0.2, 0), shR = joint('shR', chest, -sw, 0.2, 0);
    const elL = joint('elL', shL, 0, -0.29, 0), elR = joint('elR', shR, 0, -0.29, 0);
    const haL = joint('haL', elL, 0, -0.26, 0), haR = joint('haR', elR, 0, -0.26, 0);
    const hw = this.dims.hw;
    const hipL = joint('hipL', hips, hw, -0.04, 0), hipR = joint('hipR', hips, -hw, -0.04, 0);
    const knL = joint('knL', hipL, 0, -0.44, 0), knR = joint('knR', hipR, 0, -0.44, 0);
    const anL = joint('anL', knL, 0, -0.42, 0), anR = joint('anR', knR, 0, -0.42, 0);

    // pelvis
    const pelvisMat = dress ? shirt : pants;
    mk(new THREE.SphereGeometry(0.5, 16, 12), pelvisMat, hips, 0, 0.02, 0, (fem ? 0.33 : 0.3) * b, 0.2, 0.2 * b);
    // gövde (alt + üst)
    const torsoMat = bareTorso ? skin : shirt;
    mk(new THREE.CapsuleGeometry(0.5, 0.35, 6, 16), torsoMat, spine, 0, 0.06, 0, (fem ? 0.27 : 0.28) * b, 0.3, 0.17 * b);
    mk(new THREE.CapsuleGeometry(0.5, 0.3, 6, 16), torsoMat, chest, 0, 0.11, 0, (fem ? 0.3 : 0.37) * b, 0.36, 0.2 * b);
    if (fem) { // göğüs
      const bm = bareTorso ? shirt : torsoMat;
      mk(new THREE.SphereGeometry(0.058 * b, 12, 10), bm, chest, 0.052, 0.1, 0.07);
      mk(new THREE.SphereGeometry(0.058 * b, 12, 10), bm, chest, -0.052, 0.1, 0.07);
      if (bareTorso) mk(new THREE.CylinderGeometry(0.155 * b, 0.15 * b, 0.05, 16), shirt, chest, 0, 0.1, 0.0, 1, 1, 0.75);
    }
    if (top === 'top_gomlek' || top === 'top_polo') { // yaka
      mk(new THREE.TorusGeometry(0.06, 0.016, 6, 14), shirt, chest, 0, 0.26, 0.01, 1, 1, 0.8).rotation.x = Math.PI / 2;
    }
    // etek / elbise
    if (skirt) {
      const sk = mk(new THREE.CylinderGeometry(0.17 * b, (dress ? 0.32 : 0.28) * b, dress ? 0.55 : 0.4, 18, 1, true), dress ? shirt : pants, hips, 0, dress ? -0.22 : -0.15, 0);
      (sk.material as THREE.Material).side = THREE.DoubleSide;
    }
    // boyun + baş
    mk(new THREE.CylinderGeometry(0.048, 0.055, 0.12, 12), skin, neck, 0, 0.02, 0);
    const headM = mk(new THREE.SphereGeometry(0.5, 24, 18), skin, head, 0, 0.11, 0.0, 0.2, 0.245, 0.225);
    headM.name = 'headMesh';
    mk(new THREE.SphereGeometry(0.5, 14, 10), skin, head, 0, 0.035, 0.035, 0.15, 0.12, 0.16); // çene
    mk(new THREE.SphereGeometry(0.03, 8, 6), skin, head, 0.1, 0.1, 0, 0.6, 1, 0.9); // kulak
    mk(new THREE.SphereGeometry(0.03, 8, 6), skin, head, -0.1, 0.1, 0, 0.6, 1, 0.9);
    // yüz
    this.face = new THREE.Group(); head.add(this.face);
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const iris = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.1 });
    const eye = (x: number) => { const e = new THREE.Group(); e.position.set(x, 0.125, 0.098); this.face.add(e); mk(new THREE.SphereGeometry(0.018, 10, 8), white, e, 0, 0, 0, 1, 0.8, 0.6); mk(new THREE.SphereGeometry(0.0095, 8, 6), iris, e, 0, 0, 0.009); return e; };
    this.eyeL = eye(0.04); this.eyeR = eye(-0.04);
    const browM = new THREE.MeshStandardMaterial({ color: L.hairColor, roughness: 0.9 });
    this.browL = mk(new THREE.BoxGeometry(0.035, 0.007, 0.01), browM, this.face, 0.04, 0.152, 0.104);
    this.browR = mk(new THREE.BoxGeometry(0.035, 0.007, 0.01), browM, this.face, -0.04, 0.152, 0.104);
    mk(new THREE.ConeGeometry(0.014, 0.04, 6), skin, this.face, 0, 0.1, 0.112).rotation.x = Math.PI / 2 + 0.3; // burun
    const lip = new THREE.MeshStandardMaterial({ color: fem ? 0xb0505a : 0x8a4a3a, roughness: 0.5 });
    this.mouth = mk(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshStandardMaterial({ color: 0x3a0f0f, roughness: 0.6 }), this.face, 0, 0.058, 0.098, 0.042, 0.008, 0.02);
    mk(new THREE.TorusGeometry(0.019, 0.004, 4, 14), lip, this.face, 0, 0.058, 0.1, 1.05, 0.35, 0.6);
    // saç
    this.buildHair(head, hairM, fem);
    this.buildHat(head);
    this.buildGlasses(head);
    // kollar
    const armTop = sleeves ? shirt : skin;
    const at = this.dims.thick;
    mk(new THREE.SphereGeometry(0.062 * at, 10, 8), armTop, shL, 0, 0, 0);
    mk(new THREE.CapsuleGeometry(0.046 * at, 0.2, 4, 10), armTop, shL, 0, -0.14, 0);
    mk(new THREE.CapsuleGeometry(0.04 * at, 0.2, 4, 10), (top === 'top_gomlek' ? skin : skin), elL, 0, -0.13, 0);
    mk(new THREE.CapsuleGeometry(0.046 * at, 0.2, 4, 10), armTop, shR, 0, -0.14, 0);
    mk(new THREE.SphereGeometry(0.062 * at, 10, 8), armTop, shR, 0, 0, 0);
    mk(new THREE.CapsuleGeometry(0.04 * at, 0.2, 4, 10), skin, elR, 0, -0.13, 0);
    if (sleeves && top !== 'top_gomlek') { mk(new THREE.CylinderGeometry(0.052 * at, 0.05 * at, 0.13, 10), shirt, shL, 0, -0.08, 0); mk(new THREE.CylinderGeometry(0.052 * at, 0.05 * at, 0.13, 10), shirt, shR, 0, -0.08, 0); }
    // eller
    for (const h of [haL, haR]) {
      mk(new THREE.BoxGeometry(0.06, 0.09, 0.03), skin, h, 0, -0.045, 0.005);
      mk(new THREE.CapsuleGeometry(0.012, 0.03, 3, 6), skin, h, h === haL ? -0.03 : 0.03, -0.04, 0.025).rotation.z = h === haL ? 0.6 : -0.6;
    }
    // bacaklar
    const thighM = skirt ? skin : pants;
    const shinM = longPants ? pants : skin;
    for (const [hip, kn, an] of [[hipL, knL, anL], [hipR, knR, anR]] as const) {
      mk(new THREE.CapsuleGeometry(0.068 * b, 0.3, 4, 12), thighM, hip, 0, -0.21, 0);
      if (!skirt && !longPants) mk(new THREE.CylinderGeometry(0.075 * b, 0.07 * b, 0.26, 12), pants, hip, 0, -0.14, 0);
      mk(new THREE.CapsuleGeometry(0.052 * b, 0.32, 4, 10), shinM, kn, 0, -0.2, 0);
      this.buildShoe(an, shoeM, skin);
    }
    // aksesuar
    if (L.acc === 'acc_kolye') {
      mk(new THREE.TorusGeometry(0.075, 0.004, 4, 20), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.3 }), chest, 0, 0.23, 0.02).rotation.x = Math.PI / 2 - 0.3;
      mk(new THREE.SphereGeometry(0.016, 10, 8), new THREE.MeshStandardMaterial({ color: 0x1e5ad8, roughness: 0.2 }), chest, 0, 0.17, 0.12, 1, 1, 0.4);
    }
    if (L.acc === 'acc_saat') mk(new THREE.BoxGeometry(0.05, 0.035, 0.05), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 }), elL, 0, -0.23, 0);
    if (L.acc === 'acc_kulaklik') { mk(new THREE.TorusGeometry(0.12, 0.012, 6, 20, Math.PI), new THREE.MeshStandardMaterial({ color: 0x111111 }), head, 0, 0.12, 0); for (const s of [1, -1]) mk(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 14), new THREE.MeshStandardMaterial({ color: 0x111111 }), head, s * 0.115, 0.1, 0).rotation.z = Math.PI / 2; }
    if (L.acc === 'acc_tespih') { const tm = new THREE.MeshStandardMaterial({ color: 0x7a1b1b, roughness: 0.25 }); for (let i = 0; i < 11; i++) mk(new THREE.SphereGeometry(0.009, 6, 5), tm, haL, Math.cos(i / 11 * 6.28) * 0.03, -0.1 + Math.sin(i / 11 * 6.28) * 0.04, 0.02); }

    this.root.traverse(o => { (o as any).userData.char = this; });
    // tutulan eşyayı yeniden ekle
    const hk = this.heldKey; this.heldKey = '__'; this.setHeld(hk);
  }

  private buildShoe(an: THREE.Object3D, shoeM: THREE.Material, skin: THREE.Material) {
    const s = this.look.shoes;
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; an.add(m); return m; };
    if (s === 'shoes_spor') { mk(new THREE.CapsuleGeometry(0.05, 0.12, 4, 10), shoeM, 0, -0.03, 0.05, 1, 0.75, 1).rotation.x = Math.PI / 2; mk(new THREE.BoxGeometry(0.1, 0.02, 0.24), new THREE.MeshStandardMaterial({ color: 0xf0f0f0 }), 0, -0.065, 0.05); }
    else {
      mk(new THREE.CapsuleGeometry(0.042, 0.12, 4, 10), skin, 0, -0.035, 0.05, 1, 0.65, 1).rotation.x = Math.PI / 2;
      if (s !== 'shoes_yalin') mk(new THREE.BoxGeometry(0.1, 0.018, 0.25), shoeM, 0, -0.068, 0.05);
      if (s === 'shoes_terlik') mk(new THREE.BoxGeometry(0.095, 0.03, 0.06), shoeM, 0, -0.04, 0.09);
      if (s === 'shoes_sandalet') { mk(new THREE.BoxGeometry(0.096, 0.012, 0.02), shoeM, 0, -0.03, 0.12); mk(new THREE.BoxGeometry(0.096, 0.012, 0.02), shoeM, 0, -0.025, 0.02); }
    }
  }
  private buildHair(head: THREE.Object3D, m: THREE.Material, fem: boolean) {
    const h = this.look.hair;
    const mk = (geo: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => { const mm = new THREE.Mesh(geo, m); mm.position.set(x, y, z); mm.scale.set(sx, sy, sz); mm.castShadow = true; head.add(mm); return mm; };
    const cap = () => mk(new THREE.SphereGeometry(0.5, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, 0.125, -0.008, 0.215, 0.27, 0.24).rotation.x = -0.25;
    switch (h) {
      case 'hair_kel': mk(new THREE.TorusGeometry(0.1, 0.02, 6, 20, Math.PI * 1.2), 0, 0.1, -0.01, 1, 0.9, 1).rotation.set(Math.PI / 2, 0, -0.6 + Math.PI); break;
      case 'hair_kisa': cap(); break;
      case 'hair_uzun': cap(); mk(new THREE.CapsuleGeometry(0.1, 0.22, 4, 10), 0, -0.02, -0.07, 1.05, 1, 0.45); mk(new THREE.CapsuleGeometry(0.035, 0.18, 4, 8), 0.095, 0.02, -0.01); mk(new THREE.CapsuleGeometry(0.035, 0.18, 4, 8), -0.095, 0.02, -0.01); break;
      case 'hair_topuz': cap(); mk(new THREE.SphereGeometry(0.06, 12, 10), 0, 0.25, -0.06); break;
      case 'hair_kivircik': for (let i = 0; i < 26; i++) { const a = i * 2.4, r = 0.09 + (i % 3) * 0.008; const yy = 0.16 + Math.sin(i * 1.7) * 0.05; mk(new THREE.SphereGeometry(0.04, 8, 6), Math.cos(a) * r, yy, Math.sin(a) * r - 0.015); } break;
      case 'hair_atkuyrugu': cap(); mk(new THREE.CapsuleGeometry(0.035, 0.2, 4, 8), 0, 0.06, -0.13).rotation.x = 0.35; break;
      case 'hair_dalgali': cap(); for (const s of [1, -1]) mk(new THREE.SphereGeometry(0.06, 10, 8), s * 0.09, 0.07, -0.03, 0.7, 1.4, 1.1); mk(new THREE.SphereGeometry(0.08, 10, 8), 0, 0.06, -0.08, 1.2, 1.2, 0.6); break;
      case 'hair_mohawk': for (let i = 0; i < 7; i++) mk(new THREE.BoxGeometry(0.03, 0.07, 0.03), 0, 0.235 - Math.abs(i - 2) * 0.01, 0.07 - i * 0.035); break;
      default: cap();
    }
  }
  private buildHat(head: THREE.Object3D) {
    const h = this.look.hat; if (h === 'hat_yok') return;
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => { const mm = new THREE.Mesh(geo, mat); mm.position.set(x, y, z); mm.castShadow = true; head.add(mm); return mm; };
    if (h === 'hat_hasir') { const m = new THREE.MeshStandardMaterial({ color: 0xe0c27a, roughness: 0.95 }); mk(new THREE.CylinderGeometry(0.24, 0.24, 0.012, 28), m, 0, 0.2, 0); mk(new THREE.CylinderGeometry(0.1, 0.115, 0.1, 20), m, 0, 0.25, 0); mk(new THREE.CylinderGeometry(0.116, 0.116, 0.025, 20), new THREE.MeshStandardMaterial({ color: 0x8a2a1a }), 0, 0.215, 0); }
    if (h === 'hat_kep' || h === 'hat_kaptan') { const m = new THREE.MeshStandardMaterial({ color: h === 'hat_kaptan' ? 0xf5f5f5 : 0xc0392b, roughness: 0.8 }); mk(new THREE.SphereGeometry(0.118, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 0.18, -0.005); const v = mk(new THREE.BoxGeometry(0.17, 0.01, 0.11), new THREE.MeshStandardMaterial({ color: h === 'hat_kaptan' ? 0x111111 : 0xc0392b }), 0, 0.185, 0.12); v.rotation.x = 0.15; if (h === 'hat_kaptan') mk(new THREE.BoxGeometry(0.04, 0.03, 0.01), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8 }), 0, 0.23, 0.115); }
    if (h === 'hat_bucket') { const m = new THREE.MeshStandardMaterial({ color: 0x8f9a6a, roughness: 0.9 }); mk(new THREE.CylinderGeometry(0.11, 0.17, 0.13, 20, 1, true), m, 0, 0.23, 0).material = Object.assign(m, { side: THREE.DoubleSide }); mk(new THREE.CylinderGeometry(0.11, 0.11, 0.01, 20), m, 0, 0.295, 0); }
    if (h === 'hat_fotr') { const m = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 }); mk(new THREE.CylinderGeometry(0.19, 0.19, 0.01, 24), m, 0, 0.21, 0); mk(new THREE.CylinderGeometry(0.09, 0.11, 0.13, 20), m, 0, 0.28, 0); mk(new THREE.CylinderGeometry(0.112, 0.112, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0x111111 }), 0, 0.23, 0); }
  }
  private buildGlasses(head: THREE.Object3D) {
    const g = this.look.glasses; if (g === 'glasses_yok') return;
    const frame = new THREE.MeshStandardMaterial({ color: g === 'glasses_pilot' ? 0xd4af37 : 0x111111, metalness: 0.6, roughness: 0.3 });
    const lens = new THREE.MeshStandardMaterial({ color: g === 'glasses_yuvarlak' ? 0x99ccff : 0x101418, transparent: true, opacity: g === 'glasses_yuvarlak' ? 0.25 : 0.85, roughness: 0.05, metalness: 0.5 });
    for (const s of [1, -1]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0035, 6, 18), frame); r.position.set(s * 0.04, 0.126, 0.118); this.face.add(r);
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.026, 18), lens); l.position.set(s * 0.04, 0.126, 0.119); if (g === 'glasses_pilot') l.scale.set(1.1, 0.9, 1); this.face.add(l);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.11), frame); arm.position.set(s * 0.068, 0.128, 0.07); this.face.add(arm);
    }
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.004), frame); br.position.set(0, 0.13, 0.118); this.face.add(br);
  }

  // ---------------------------------------------------------------- isim etiketi
  makeTag() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true, sizeAttenuation: true }));
    this.tag.scale.set(1.5, 0.375, 1); this.tag.position.y = 2.12; this.tag.renderOrder = 10;
    this.root.add(this.tag);
    this.drawTag();
  }
  setName(n: string) { this.name = n; this.drawTag(); }
  drawTag() {
    const f = this.flags;
    const key = [this.name, f.speaking, f.host, f.muted, f.group, f.level].join('|');
    if (key === this.tagState) return; this.tagState = key;
    const c = (this.tag.material.map as THREE.CanvasTexture).image as HTMLCanvasElement; const g = c.getContext('2d')!;
    g.clearRect(0, 0, 512, 128);
    g.font = '600 46px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    const pre = (f.host ? '👑 ' : '') + (f.group ? '🔒 ' : '');
    const post = (f.speaking ? ' 🔊' : f.muted ? ' 🔇' : '') + (f.level >= 3 ? ' 🥴' : f.level >= 1 ? ' 🙂' : '');
    const text = pre + this.name + post;
    const w = Math.min(500, g.measureText(text).width + 44);
    const x = (512 - w) / 2;
    g.fillStyle = f.speaking ? 'rgba(20,140,90,0.82)' : 'rgba(10,22,34,0.62)';
    roundRect(g, x, 26, w, 70, 35); g.fill();
    if (f.speaking) { g.strokeStyle = '#7dffb9'; g.lineWidth = 5; roundRect(g, x, 26, w, 70, 35); g.stroke(); }
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 6;
    g.fillText(text, 256, 63, 480);
    (this.tag.material.map as THREE.CanvasTexture).needsUpdate = true;
  }

  // ---------------------------------------------------------------- eşya
  setHeld(key: string, opts?: { w?: number; sv?: number; d?: number }) {
    if (key === this.heldKey) return;
    if (this.held) { this.root.remove(this.held); this.held = null; }
    this.heldKey = key;
    const o = makeHeld(key, opts?.w, opts);
    if (o) { this.held = o; this.root.add(o); }
  }
  setHeldFill(f: number) { this.heldFill = f; if (this.held) setFill(this.held, f); }

  setLook(look: Look) { this.look = { ...DEFAULT_LOOK, ...look }; this.build(); }
  play(anim: string) { if (anim !== this.anim) { this.anim = anim; this.animT = 0; } }

  // ---------------------------------------------------------------- animasyon
  private target(P: Pose, a: string, t: number, sp: number) {
    const j = P.j;
    const s = Math.sin, c = Math.cos;
    // ortak: nefes
    j.chest.x = s(this.t * 1.6) * 0.015;
    j.shL.z = 0.08; j.shR.z = -0.08; j.elL.x = -0.12; j.elR.x = -0.12;
    const holding = !!this.held && this.heldKey !== 'rod';
    if (holding) { j.shR.x = -0.35; j.elR.x = -1.15; j.shR.z = -0.05; j.haR.x = 0.1; }
    switch (a) {
      case 'idle': {
        j.hips.z = s(this.t * 0.5) * 0.015; j.head.y = s(this.t * 0.31) * 0.08;
        break;
      }
      case 'walk': case 'run': {
        const run = a === 'run';
        const w = this.t * (run ? 10.5 : 7.2) * Math.max(0.6, sp / (run ? 5.5 : 2.3));
        const amp = run ? 0.75 : 0.48;
        j.hipL.x = -s(w) * amp; j.hipR.x = s(w) * amp;
        j.knL.x = Math.max(0, -c(w)) * (run ? 1.5 : 0.7) + 0.05; j.knR.x = Math.max(0, c(w)) * (run ? 1.5 : 0.7) + 0.05;
        j.anL.x = -j.hipL.x * 0.3; j.anR.x = -j.hipR.x * 0.3;
        if (!holding) { j.shL.x = s(w) * amp * 0.75; j.shR.x = -s(w) * amp * 0.75; j.elL.x = run ? -1.2 : -0.25; j.elR.x = run ? -1.2 : -0.25; }
        else { j.shL.x = s(w) * amp * 0.7; j.elL.x = run ? -1.1 : -0.25; }
        P.hipsY = Math.abs(c(w)) * (run ? 0.06 : 0.03) - (run ? 0.03 : 0);
        j.hips.y = s(w) * 0.08; j.chest.y = -s(w) * 0.12; j.spine.x = run ? 0.15 : 0.04;
        break;
      }
      case 'jump': { j.hipL.x = -0.9; j.hipR.x = -0.3; j.knL.x = 1.3; j.knR.x = 0.8; j.shL.z = 1.2; j.shR.z = -1.2; P.mouth = 0.4; break; }
      case 'sit': case 'sitSofa': case 'toilet': case 'doze': {
        j.hipL.x = -1.5; j.hipR.x = -1.5; j.knL.x = 1.5; j.knR.x = 1.5; j.hipL.z = 0.05; j.hipR.z = -0.05;
        P.hipsY = -0.47; P.hipsZ = -0.05;
        j.spine.x = a === 'sitSofa' ? -0.15 : 0.02;
        if (!holding) { j.shL.x = -0.45; j.elL.x = -0.9; j.shR.x = -0.45; j.elR.x = -0.9; j.shL.z = 0.02; j.shR.z = -0.02; }
        if (a === 'toilet') { j.spine.x = 0.35; j.shL.x = -0.6; j.shR.x = -0.6; j.elL.x = -1.5; j.elR.x = -1.5; j.head.x = 0.3; }
        if (a === 'doze') { j.head.x = 0.55 + s(t * 1.1) * 0.05; j.neck.x = 0.2; P.eyes = 0; P.mouth = 0.25; }
        break;
      }
      case 'sitGround': {
        j.hipL.x = -1.35; j.hipR.x = -1.35; j.hipL.z = 1.0; j.hipR.z = -1.0; j.hipL.y = -0.4; j.hipR.y = 0.4;
        j.knL.x = 2.45; j.knR.x = 2.45; P.hipsY = -0.8; j.spine.x = 0.12;
        if (!holding) { j.shL.x = -0.6; j.elL.x = -0.6; j.shR.x = -0.6; j.elR.x = -0.6; }
        break;
      }
      case 'lie': {
        j.hips.x = -1.38; P.hipsY = -0.6; j.head.x = 0.35; j.knL.x = 0.12; j.knR.x = 0.2; j.hipL.x = -0.12;
        j.shL.z = 0.35; j.shR.z = -0.35; j.elL.x = -0.3; j.elR.x = -0.3;
        if (!holding) { j.shL.z = 2.6; j.shR.z = -2.6; j.elL.x = -1.5; j.elR.x = -1.5; } // eller başın arkasında
        break;
      }
      case 'swim': {
        const w = this.t * 3.2;
        j.hips.x = 1.35; P.hipsY = -0.92;
        j.head.x = -0.95; j.neck.x = -0.3;
        j.shL.x = -Math.PI + ((w % (Math.PI * 2)) / (Math.PI * 2)) * Math.PI * 2; j.shR.x = j.shL.x + Math.PI;
        j.shL.x = -1.6 + s(w) * 1.6; j.shR.x = -1.6 - s(w) * 1.6; j.elL.x = -0.3; j.elR.x = -0.3; j.shL.z = 0.3; j.shR.z = -0.3;
        j.hipL.x = s(w * 2.2) * 0.35; j.hipR.x = -s(w * 2.2) * 0.35; j.knL.x = 0.2; j.knR.x = 0.2;
        if (sp < 0.3) { // su içinde durma
          j.hips.x = 0.15; P.hipsY = -1.05; j.head.x = -0.05; j.neck.x = 0;
          j.shL.z = 1.2 + s(this.t * 2) * 0.3; j.shR.z = -1.2 - s(this.t * 2) * 0.3; j.shL.x = -0.3; j.shR.x = -0.3; j.elL.x = -0.4; j.elR.x = -0.4;
          j.hipL.x = s(this.t * 2.4) * 0.4; j.hipR.x = -s(this.t * 2.4) * 0.4; j.knL.x = 0.5; j.knR.x = 0.5;
        }
        break;
      }
      case 'dive': { const k = Math.min(1, t / 0.6); j.shL.z = 2.9; j.shR.z = -2.9; j.hips.x = k * 1.2; j.hipL.x = 0.2; j.hipR.x = 0.2; P.hipsY = -k * 0.5; break; }
      case 'fishIdle': case 'fishWait': case 'fishCast': case 'fishReel': case 'fishBite': {
        j.shR.x = -0.75; j.elR.x = -0.75; j.shR.z = -0.15; j.shL.x = -0.6; j.elL.x = -1.0; j.shL.z = -0.25;
        j.hipL.x = -0.15; j.hipR.x = 0.12; j.knL.x = 0.15;
        P.rodPitch = 0.95;
        if (a === 'fishCast') {
          const k = Math.min(1, t / 0.9);
          const back = k < 0.45 ? k / 0.45 : 1 - (k - 0.45) / 0.55;
          j.shR.x = -0.75 - back * 1.6; j.elR.x = -0.75 - back * 0.4; j.chest.y = back * 0.4 - 0.1; P.rodPitch = 0.95 - back * 1.9;
          j.hipR.x = 0.3 * (1 - back); j.hipL.x = -0.3;
        }
        if (a === 'fishReel' || a === 'fishBite') {
          j.elL.x = -1.2 + s(this.t * 14) * 0.25; j.shL.x = -0.7 + c(this.t * 14) * 0.15;
          P.rodPitch = a === 'fishBite' ? 0.6 + s(this.t * 25) * 0.08 : 0.45 + s(this.t * 6) * 0.06;
          j.spine.x = -0.15; j.hipL.x = -0.35; j.knL.x = 0.4; j.hipR.x = 0.3;
          if (a === 'fishBite') { P.brow = 1; P.mouth = 0.5; }
        }
        if (a === 'fishWait') { j.head.y = s(this.t * 0.4) * 0.1; }
        break;
      }
      case 'struggle': { // büyük balıkla boğuşma
        j.shR.x = -1.2; j.elR.x = -0.5; j.shL.x = -1.1; j.elL.x = -0.6; j.spine.x = -0.35 + s(this.t * 9) * 0.08; j.hips.y = s(this.t * 5) * 0.15;
        j.hipL.x = -0.6; j.knL.x = 0.7; j.hipR.x = 0.4; P.rodPitch = 0.3 + s(this.t * 11) * 0.15; P.mouth = 0.7; P.brow = 1; break;
      }
      case 'cheer': case 'zafer': {
        const b = Math.abs(s(t * 7));
        j.shL.z = 2.7; j.shR.z = -2.7; j.elL.x = -0.3 * b; j.elR.x = -0.3 * b; P.hipsY = b * 0.08; j.head.x = -0.2; P.mouth = 0.9;
        if (a === 'zafer') { j.shL.z = 2.4; j.shR.z = -2.4; j.shL.x = -0.3; j.shR.x = -0.3; P.hipsY = 0; }
        break;
      }
      case 'showFish': { j.shL.x = -1.2; j.shR.x = -1.2; j.elL.x = -0.5; j.elR.x = -0.5; j.shL.z = -0.2; j.shR.z = 0.2; P.mouth = 0.6; j.head.x = 0.2; break; }
      case 'laugh': case 'kahkaha': { const b = s(this.t * 16); j.spine.x = -0.15 + b * 0.05; j.chest.x = b * 0.06; j.head.x = -0.3 + b * 0.05; P.mouth = 0.9; P.eyes = 0.2; j.shL.x = -0.5; j.shR.x = -0.5; j.elL.x = -1.6; j.elR.x = -1.6; j.shL.z = -0.1; j.shR.z = 0.1; break; }
      case 'alkis': { const b = s(this.t * 14); j.shL.x = -1.15; j.shR.x = -1.15; j.shL.z = -0.35 - b * 0.18; j.shR.z = 0.35 + b * 0.18; j.elL.x = -0.8; j.elR.x = -0.8; P.mouth = 0.4; break; }
      case 'sasirma': case 'surprise': { j.shL.z = 0.9; j.shR.z = -0.9; j.elL.x = -1.6; j.elR.x = -1.6; j.head.x = -0.15; j.spine.x = -0.12; P.mouth = 1; P.brow = 1; P.eyes = 1.4; break; }
      case 'aglama': { const b = s(this.t * 18) * 0.04; j.shL.x = -1.2; j.shR.x = -1.2; j.elL.x = -2.3; j.elR.x = -2.3; j.shL.z = -0.3; j.shR.z = 0.3; j.head.x = 0.45 + b; j.chest.x = 0.2 + b; P.mouth = 0.4; P.brow = -1; break; }
      case 'kizma': case 'angry': { j.shL.z = 0.3; j.shR.z = -0.3; j.elL.x = -1.2 + s(this.t * 12) * 0.3; j.elR.x = -1.2 - s(this.t * 12) * 0.3; j.head.x = 0.15; j.spine.x = 0.15; P.brow = -1.4; P.mouth = 0.5; P.hipsY = Math.abs(s(this.t * 6)) * 0.03; break; }
      case 'selam': { j.shR.x = -1.0; j.shR.z = -0.4; j.elR.x = -1.9; j.head.x = 0.35; j.spine.x = 0.25 * Math.min(1, s(t * 3) + 0.4); break; }
      case 'elsalla': case 'wave': { j.shR.z = -2.6; j.elR.z = s(this.t * 9) * 0.5; j.elR.x = -0.3; P.mouth = 0.4; break; }
      case 'bassalla': { j.head.x = s(this.t * 8) * 0.25 + 0.1; P.mouth = 0.15; break; }
      case 'omuz': { const k = Math.min(1, t * 4); j.shL.z = 0.35 * k; j.shR.z = -0.35 * k; j.elL.x = -1.6 * k; j.elR.x = -1.6 * k; j.elL.y = -0.8 * k; j.elR.y = 0.8 * k; j.head.z = 0.2 * k; j.chest.y = 0.1; P.brow = 0.8; break; }
      case 'goster': { j.shR.x = -1.5; j.shR.z = 0.1; j.elR.x = -0.05; j.head.y = 0; break; }
      case 'kadeh': { j.shR.x = -2.3; j.elR.x = -0.6; P.mouth = 0.6; P.itemTilt = 0; P.itemY = 0.05; break; }
      case 'cayikram': case 'give': { j.shR.x = -1.15; j.elR.x = -0.6; j.shL.x = -1.0; j.elL.x = -0.8; j.shL.z = -0.2; j.spine.x = 0.2; j.head.x = 0.2; P.mouth = 0.3; break; }
      case 'balikgoster': { j.shL.x = -1.3; j.shR.x = -1.3; j.elL.x = -0.4; j.elR.x = -0.4; j.shL.z = 0.3; j.shR.z = -0.3; P.mouth = 0.7; break; }
      case 'uyu': { j.hipL.x = -1.35; j.hipR.x = -1.35; j.hipL.z = 1.0; j.hipR.z = -1.0; j.knL.x = 2.45; j.knR.x = 2.45; P.hipsY = -0.8; j.spine.x = 0.4; j.head.x = 0.7; P.eyes = 0; j.shL.x = -0.5; j.shR.x = -0.5; j.elL.x = -1; j.elR.x = -1; break; }
      case 'telefon': case 'phone': { j.shR.x = -0.6; j.shR.z = -0.55; j.elR.x = -2.35; j.head.z = -0.15; P.mouth = 0.3 + Math.abs(s(this.t * 9)) * 0.4; j.hips.y = s(this.t * 0.6) * 0.3; break; }
      case 'dans': case 'dance': {
        const w = this.t * 6.2;
        P.hipsY = -Math.abs(s(w)) * 0.07; j.hips.z = s(w) * 0.12; j.hips.y = s(w * 0.5) * 0.25; j.chest.z = -s(w) * 0.1;
        j.shL.z = 1.4 + s(w) * 0.6; j.shR.z = -1.4 + s(w) * 0.6; j.elL.x = -1.0 - s(w) * 0.4; j.elR.x = -1.0 + s(w) * 0.4;
        j.knL.x = Math.max(0, s(w)) * 0.5; j.knR.x = Math.max(0, -s(w)) * 0.5; j.hipL.x = -Math.max(0, s(w)) * 0.3; j.hipR.x = -Math.max(0, -s(w)) * 0.3;
        j.head.z = s(w) * 0.15; P.mouth = 0.5; break;
      }
      case 'sarhosdans': {
        const w = this.t * 3.4;
        j.hips.z = s(w) * 0.25; j.chest.z = s(w + 1) * 0.25; j.head.z = s(w + 2) * 0.35; j.head.x = 0.2;
        j.shL.z = 2.2 + s(w * 1.3) * 0.7; j.shR.z = -0.6 + s(w) * 0.5; j.elL.x = -0.5 + s(w * 2) * 0.5; j.elR.x = -1.4;
        j.hipL.x = s(w) * 0.4; j.hipR.x = -s(w) * 0.2; j.knL.x = 0.4 + s(w) * 0.3; j.knR.x = 0.3;
        P.hipsY = -0.05 + s(w * 2) * 0.03; P.mouth = 0.6; P.eyes = 0.5; break;
      }
      case 'zeybek': {
        const w = this.t * 1.6;
        j.shL.z = 1.7; j.shR.z = -1.7; j.shL.x = -0.3; j.shR.x = -0.3; j.elL.z = 0.4; j.elR.z = -0.4;
        j.knL.x = Math.max(0, s(w)) * 1.2; j.hipL.x = -Math.max(0, s(w)) * 0.9; P.hipsY = -Math.max(0, s(w)) * 0.15;
        j.knR.x = 0.3; j.spine.x = 0.1 + Math.max(0, s(w)) * 0.15; j.hips.y = this.t * 0.6; j.head.x = 0.1; break;
      }
      case 'halay': {
        const w = this.t * 4.2;
        j.shL.z = 0.4; j.shR.z = -0.4; j.shL.x = s(w) * 0.6; j.shR.x = s(w) * 0.6; j.elL.x = -0.2; j.elR.x = -0.2;
        j.hipL.x = -Math.max(0, s(w)) * 0.6; j.knL.x = Math.max(0, s(w)) * 0.8; j.hipR.x = -Math.max(0, -s(w)) * 0.4; j.knR.x = Math.max(0, -s(w)) * 0.5;
        P.hipsY = -Math.abs(s(w)) * 0.05; j.spine.x = 0.1; P.mouth = 0.5; break;
      }
      case 'robot': {
        const w = Math.floor(this.t * 3) ;
        const ph = w % 4;
        j.shL.x = ph === 0 ? -1.5 : ph === 1 ? 0 : -0.8; j.elL.x = ph === 2 ? -1.57 : 0;
        j.shR.x = ph === 1 ? -1.5 : ph === 3 ? -0.8 : 0; j.elR.x = ph === 3 ? -1.57 : 0;
        j.head.y = (ph - 1.5) * 0.3; j.chest.y = (ph % 2 ? 0.2 : -0.2); break;
      }
      case 'drink': case 'eat': {
        // bardağı/yemeği ağza götürme döngüsü: 0-0.5 kaldır, 0.5-1.3 iç, 1.3-1.8 indir
        const k = t < 0.5 ? t / 0.5 : t < 1.3 ? 1 : Math.max(0, 1 - (t - 1.3) / 0.5);
        const e = k * k * (3 - 2 * k);
        j.shR.x = -0.35 - e * 0.85; j.elR.x = -1.15 - e * 1.0; j.shR.z = -0.05 + e * 0.32; j.haR.x = 0.1;
        j.head.x = a === 'drink' ? -e * 0.35 : -e * 0.05; P.itemTilt = a === 'drink' ? e * 1.25 : 0; P.mouth = a === 'eat' ? (t > 0.5 && t < 1.3 ? Math.abs(s(this.t * 14)) * 0.5 : 0) : e * 0.25;
        break;
      }
      case 'pour': { j.shR.x = -0.7; j.elR.x = -1.2; j.shL.x = -0.9; j.elL.x = -0.9; j.shL.z = -0.3; j.head.x = 0.35; break; }
      case 'grill': { // mangalda çevirme
        const w = this.t * 3;
        j.shR.x = -0.9; j.elR.x = -0.9 + s(w) * 0.3; j.haR.z = s(w * 2) * 0.8; j.shL.x = -0.3; j.elL.x = -0.6;
        j.spine.x = 0.3; j.head.x = 0.4; break;
      }
      case 'pick': { const k = Math.min(1, t / 0.4) * (t < 1.0 ? 1 : Math.max(0, 1 - (t - 1) / 0.4)); j.shR.x = -2.6 * k; j.elR.x = -0.3 * k; j.head.x = -0.5 * k; j.hipL.x = -0.1; P.hipsY = 0.04 * k; break; }
      case 'splash': { const w = this.t * 10; j.shL.x = -1.2 + s(w) * 0.6; j.shR.x = -1.2 - s(w) * 0.6; j.shL.z = 0.3; j.shR.z = -0.3; P.mouth = 0.8; j.hips.x = 0.1; P.hipsY = -1.05; break; }
      case 'shower': { const w = this.t * 6; j.shL.z = 2.4; j.shR.z = -2.4; j.elL.x = -1.6 + s(w) * 0.3; j.elR.x = -1.6 - s(w) * 0.3; j.head.x = -0.4; P.eyes = 0; P.mouth = 0.3; break; }
      case 'cough': { const b = s(this.t * 20); j.spine.x = 0.3 + b * 0.08; j.head.x = 0.4; j.shR.x = -1.3; j.elR.x = -1.2 + b * 0.4; j.shR.z = 0.3; P.eyes = 0.1; P.mouth = 0.6; P.brow = -0.6; break; }
      case 'stagger': {
        const w = this.t * 7;
        j.shL.z = 1.2 + s(w) * 0.4; j.shR.z = -1.2 + s(w) * 0.4; j.hips.z = s(w * 0.7) * 0.2; j.chest.z = -s(w * 0.7) * 0.25;
        j.hipL.x = -0.4 * s(w); j.hipR.x = 0.4 * s(w); j.knL.x = 0.4; j.knR.x = 0.3; j.hipL.z = 0.25; P.mouth = 0.6; P.brow = 1; break;
      }
      case 'fall': case 'fallBack': {
        // 0-0.5 dengesini kaybetme, 0.5-0.9 sırtüstü düşme, sonra yerde yatma
        const k = Math.min(1, t / 0.9); const e = k * k;
        j.hips.x = -1.4 * e; P.hipsY = -0.78 * e;
        j.shL.z = 1.4 + e * 0.6; j.shR.z = -1.4 - e * 0.6; j.elL.x = -0.5; j.elR.x = -0.5;
        j.hipL.x = -0.9 * e; j.hipR.x = -0.4 * e; j.knL.x = 0.6 * e; j.head.x = 0.4 * e;
        P.mouth = 1; P.eyes = t < 1.2 ? 1.4 : 0.3; P.brow = 1;
        if (t > 1.2) { j.shL.z = 0.8; j.shR.z = -0.8; j.hipL.x = -0.3; j.knL.x = 0.4; j.head.y = s(this.t * 2) * 0.3; P.mouth = 0.3; }
        break;
      }
      case 'getup': {
        const k = Math.min(1, t / 1.4);
        const e = 1 - (1 - k) * (1 - k);
        j.hips.x = -1.4 * (1 - e) + s(k * Math.PI) * 0.9; P.hipsY = -0.78 * (1 - e) - s(k * Math.PI) * 0.15;
        j.hipL.x = -1.6 * s(k * Math.PI); j.knL.x = 2.0 * s(k * Math.PI); j.hipR.x = -1.0 * s(k * Math.PI); j.knR.x = 1.6 * s(k * Math.PI);
        j.shL.x = -0.8 * s(k * Math.PI); j.shR.x = -0.8 * s(k * Math.PI); j.shL.z = 0.6; j.shR.z = -0.6; P.brow = 0.5;
        break;
      }
      case 'sitFall': { // sandalyeyi ıskalayıp yere oturma
        const k = Math.min(1, t / 0.5);
        j.hipL.x = -1.45; j.hipR.x = -1.45; j.knL.x = 0.4; j.knR.x = 0.4; j.hipL.z = 0.25; j.hipR.z = -0.25;
        P.hipsY = -0.47 - 0.38 * k; j.spine.x = -0.25; j.shL.z = 1.1; j.shR.z = -1.1; P.mouth = 1; P.brow = 1; P.eyes = 1.3;
        break;
      }
      case 'poolFall': { const k = Math.min(1, t / 0.6); j.hips.x = -1.2 * k; j.shL.z = 2.4; j.shR.z = -2.4; j.hipL.x = -1; j.hipR.x = -0.8; P.hipsY = -0.6 * k; P.mouth = 1; P.brow = 1; break; }
      case 'struck': { j.shL.x = -1.5; j.elL.x = -2.2; j.shL.z = -0.4; j.head.x = 0.3; P.eyes = 1.5; P.mouth = 1; P.brow = 1; j.hips.z = s(t * 20) * 0.05; break; }
    }
    // sarhoşluk katmanı (yalnızca görsel; kontrol tamamen kaybolmaz)
    const lv = this.flags.level;
    if (lv >= 1 && !['fall', 'getup', 'swim', 'lie', 'sit', 'sitSofa', 'sitGround', 'toilet', 'doze', 'sitFall'].includes(a)) {
      const k = (lv - 0.5) / 4;
      j.chest.z += s(this.t * 1.1) * 0.07 * k; j.hips.z += s(this.t * 0.8 + 1) * 0.05 * k;
      j.head.z += (lv >= 3 ? 0.14 : 0.04) + s(this.t * 1.5) * 0.05 * k;
      if (lv >= 2 && (a === 'walk' || a === 'run')) { j.shL.z += 0.3 * k; j.shR.z -= 0.3 * k; j.hipL.z += s(this.t * 4) * 0.1 * k; }
      P.eyes = Math.min(P.eyes, 1 - lv * 0.12);
      if (lv >= 1 && P.mouth < 0.15) P.mouth = 0.08 + 0.05 * lv;
    }
  }

  update(dt: number, camPos?: THREE.Vector3) {
    this.t += dt; this.animT += dt;
    const P = emptyPose();
    this.target(P, this.anim, this.animT, this.speed);
    // bakış (konuşana dönme) – baş/boyun/göğüs paylaşır
    this.lookYaw += (this.tLookYaw - this.lookYaw) * Math.min(1, dt * 5);
    this.lookPitch += (this.tLookPitch - this.lookPitch) * Math.min(1, dt * 5);
    if (!['swim', 'lie', 'fall', 'getup', 'dive', 'poolFall'].includes(this.anim)) {
      P.j.head.y += this.lookYaw * 0.55; P.j.neck.y += this.lookYaw * 0.25; P.j.chest.y += this.lookYaw * 0.2;
      P.j.head.x += this.lookPitch * 0.7;
    }
    // konuşma: ağız + baş jestleri
    // konuşma: hızlı açılır, yavaş kapanır; hece benzeri açılıp kapanma
    this.talkS = Math.max(this.talk, this.talkS - dt * 2.2);
    if (this.talkS > 0.04) {
      P.mouth = Math.max(P.mouth, Math.min(1, this.talkS * 1.6) * (0.45 + 0.55 * Math.abs(Math.sin(this.t * 13 + Math.sin(this.t * 5)))));
      P.j.head.x += Math.sin(this.t * 7.3) * 0.04 * this.talkS; P.j.head.z += Math.sin(this.t * 4.1) * 0.03 * this.talkS;
      if (this.anim === 'idle' && !this.held) { P.j.elR.x -= this.talk * 0.4 * (1 + Math.sin(this.t * 3.7)); P.j.shR.x -= this.talk * 0.15; }
    }
    // göz kırpma
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blinkT = 2 + Math.random() * 4; }
    const blink = this.blinkT < 0.12 ? 0.1 : 1;
    // karışım
    const fast = ['fall', 'fishCast', 'jump', 'dive', 'sitFall', 'poolFall', 'struck'].includes(this.anim);
    const k = 1 - Math.exp(-dt * (fast ? 16 : 9));
    const cur = this.cur;
    for (const n of JOINTS) {
      const a = cur.j[n], b = P.j[n];
      a.x += (b.x - a.x) * k; a.y += (b.y - a.y) * k; a.z += (b.z - a.z) * k;
      this.joints[n].rotation.set(a.x, a.y, a.z);
    }
    cur.hipsY += (P.hipsY - cur.hipsY) * k; cur.hipsZ += (P.hipsZ - cur.hipsZ) * k;
    cur.mouth += (P.mouth - cur.mouth) * Math.min(1, dt * 18);
    cur.brow += (P.brow - cur.brow) * k; cur.eyes += (P.eyes - cur.eyes) * k;
    cur.itemTilt += (P.itemTilt - cur.itemTilt) * k; cur.rodPitch += (P.rodPitch - cur.rodPitch) * Math.min(1, dt * (this.anim === 'fishCast' ? 20 : 8)); cur.itemY += (P.itemY - cur.itemY) * k;
    this.joints.hips.position.y = this.hipH + cur.hipsY; this.joints.hips.position.z = cur.hipsZ;
    // yüz
    this.mouth.scale.y = 0.006 + cur.mouth * 0.03;
    const ey = Math.max(0.05, cur.eyes * blink);
    this.eyeL.scale.y = ey; this.eyeR.scale.y = ey;
    this.browL.position.y = this.browR.position.y = 0.152 + Math.max(0, cur.brow) * 0.01;
    this.browL.rotation.z = -cur.brow * 0.18; this.browR.rotation.z = cur.brow * 0.18;
    // LOD: uzaktaki yüz detaylarını kapat
    if (camPos) { const d = camPos.distanceTo(this.root.position); this.face.visible = d < 30; this.tag.visible = d < 45; }
    // tutulan eşya
    if (this.held) {
      this.root.updateMatrixWorld(true);
      const hand = this.joints.haR;
      const wp = hand.localToWorld(new THREE.Vector3(0, -0.075, 0.03));
      this.root.worldToLocal(wp);
      this.held.position.copy(wp);
      if (this.heldKey === 'rod') {
        this.held.rotation.set(cur.rodPitch, 0, 0);
        this.held.position.y -= 0.05;
        const tip = this.held.getObjectByName('tip')!; tip.getWorldPosition(this.rodTip);
      } else {
        this.held.rotation.set(0, 0, 0);
        this.held.position.y += -0.04 + cur.itemY;
        // ağza doğru eğim
        this.held.rotation.x = -cur.itemTilt;
        if (this.anim === 'lie' || this.anim === 'swim') this.held.visible = false; else this.held.visible = true;
      }
    }
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
