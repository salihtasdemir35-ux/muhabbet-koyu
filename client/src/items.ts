// 3D eşya fabrikası: bardaklar, şişeler, yiyecekler, balıklar, olta, meyve...
import * as THREE from 'three';
import { DRINKS, FOODS, FISH, FRUITS, cookDef, doneness } from '../../shared/data';

const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28, envMapIntensity: 1.5, side: THREE.DoubleSide, depthWrite: false });
const porcelain = new THREE.MeshStandardMaterial({ color: 0xf7f5ef, roughness: 0.25 });
const metal = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.3, metalness: 0.9 });
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.7 });
const wood = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.8 });

function lathe(points: [number, number][], seg = 18) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}
function liquid(geo: THREE.BufferGeometry, color: number, opacity = 0.92, emissive = 0) {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.15, transparent: opacity < 1, opacity, emissive, emissiveIntensity: 0.15 }));
  m.name = 'liquid';
  return m;
}

/** İçecek kabı. Ölçek gerçek boyutlu (metre). `fill` 0..1 */
export function makeDrink(id: string, fill = 1): THREE.Group {
  const d = DRINKS.find(x => x.id === id) ?? DRINKS[0];
  const g = new THREE.Group(); g.name = 'drink:' + id;
  let liq: THREE.Mesh | null = null; let liqH = 0;
  switch (d.glass) {
    case 'cay': { // ince belli çay bardağı + tabak
      const prof: [number, number][] = [[0.0, 0], [0.024, 0], [0.026, 0.01], [0.02, 0.04], [0.018, 0.05], [0.024, 0.075], [0.028, 0.1], [0.029, 0.102]];
      g.add(new THREE.Mesh(lathe(prof), glassMat));
      liq = liquid(lathe([[0, 0.003], [0.022, 0.003], [0.019, 0.04], [0.017, 0.05], [0.023, 0.074], [0.026, 0.09], [0, 0.09]]), d.color, 0.9);
      liqH = 0.09;
      const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.008, 22), porcelain); saucer.position.y = -0.004; g.add(saucer);
      const spoon = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.002, 0.06), metal); spoon.position.set(0.035, 0.003, 0); spoon.rotation.y = 0.4; g.add(spoon);
      break;
    }
    case 'fincan': {
      g.add(new THREE.Mesh(lathe([[0, 0], [0.025, 0], [0.032, 0.03], [0.034, 0.055], [0.032, 0.056]]), porcelain));
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 12), porcelain); h.position.set(0.04, 0.03, 0); g.add(h);
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.008, 22), porcelain); s.position.y = -0.004; g.add(s);
      liq = liquid(new THREE.CylinderGeometry(0.03, 0.026, 0.045, 18), d.color, 1); liq.position.y = 0.025; liqH = 0.05;
      break;
    }
    case 'kupa': {
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.04, 0.1, 22, 1, true), new THREE.MeshStandardMaterial({ color: 0x2d6a8a, roughness: 0.4, side: THREE.DoubleSide })); mug.position.y = 0.05; g.add(mug);
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 8, 14), mug.material); h.position.set(0.05, 0.05, 0); g.add(h);
      liq = liquid(new THREE.CylinderGeometry(0.04, 0.04, 0.085, 18), d.color, 1); liq.position.y = 0.045; liqH = 0.09;
      break;
    }
    case 'bardak': case 'highball': {
      const r = d.glass === 'highball' ? 0.033 : 0.035, h = d.glass === 'highball' ? 0.15 : 0.11;
      g.add(new THREE.Mesh(lathe([[0, 0], [r - 0.004, 0], [r, 0.005], [r + 0.003, h]]), glassMat));
      liq = liquid(new THREE.CylinderGeometry(r, r - 0.004, h * 0.85, 18), d.color, 0.88); liq.position.y = h * 0.43; liqH = h;
      if (d.glass === 'highball') {
        const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0xff4d6d })); straw.position.set(0.012, 0.12, 0); straw.rotation.z = -0.18; g.add(straw);
        const lem = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.004, 14, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xf2e34b })); lem.rotation.x = Math.PI / 2; lem.position.set(-0.03, h, 0); g.add(lem);
      }
      break;
    }
    case 'rakı': { // ince uzun rakı kadehi + buz
      g.add(new THREE.Mesh(lathe([[0, 0], [0.024, 0], [0.026, 0.01], [0.026, 0.16]]), glassMat));
      liq = liquid(new THREE.CylinderGeometry(0.023, 0.023, 0.13, 16), 0xf4f2ec, 0.94, 0); liq.position.y = 0.07; liqH = 0.14;
      const ice = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.022), glassMat); ice.position.y = 0.12; ice.rotation.set(0.4, 0.5, 0.2); g.add(ice);
      break;
    }
    case 'bira': { // kulplu bira bardağı
      g.add(new THREE.Mesh(lathe([[0, 0], [0.04, 0], [0.042, 0.01], [0.045, 0.16]]), glassMat));
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 8, 14, Math.PI), glassMat); h.rotation.z = -Math.PI / 2; h.position.set(0.045, 0.08, 0); g.add(h);
      liq = liquid(new THREE.CylinderGeometry(0.041, 0.038, 0.13, 18), d.color, 0.85); liq.position.y = 0.066; liqH = 0.15;
      const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.022, 18), new THREE.MeshStandardMaterial({ color: 0xfffbf0, roughness: 0.9 })); foam.position.y = 0.142; foam.name = 'foam'; g.add(foam);
      break;
    }
    case 'sarap': {
      g.add(new THREE.Mesh(lathe([[0, 0], [0.035, 0], [0.036, 0.003], [0.004, 0.008], [0.004, 0.09], [0.03, 0.115], [0.042, 0.15], [0.038, 0.19]], 22), glassMat));
      liq = liquid(lathe([[0, 0.093], [0.027, 0.115], [0.036, 0.14], [0, 0.14]], 18), d.color, 0.9); liqH = 0.05;
      break;
    }
    case 'viski': {
      g.add(new THREE.Mesh(lathe([[0, 0], [0.038, 0], [0.04, 0.015], [0.042, 0.085]]), glassMat));
      liq = liquid(new THREE.CylinderGeometry(0.038, 0.037, 0.04, 18), d.color, 0.85); liq.position.y = 0.035; liqH = 0.05;
      const ice = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.035), glassMat); ice.position.y = 0.05; ice.rotation.set(0.2, 0.6, 0.1); g.add(ice);
      break;
    }
    case 'kokteyl': {
      g.add(new THREE.Mesh(lathe([[0, 0], [0.035, 0], [0.004, 0.006], [0.004, 0.085], [0.06, 0.15]], 22), glassMat));
      liq = liquid(lathe([[0, 0.088], [0.05, 0.138], [0, 0.138]]), d.color, 0.88); liqH = 0.05;
      const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), new THREE.MeshStandardMaterial({ color: 0xc0102a, roughness: 0.3 })); cherry.position.set(0.02, 0.14, 0); g.add(cherry);
      break;
    }
    case 'sise_su': {
      const b = new THREE.Mesh(lathe([[0, 0], [0.03, 0], [0.032, 0.02], [0.032, 0.15], [0.014, 0.18], [0.012, 0.2]]), new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.45, roughness: 0.1 })); g.add(b);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.015, 12), new THREE.MeshStandardMaterial({ color: 0x1e64c8 })); cap.position.y = 0.205; g.add(cap);
      const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.0325, 0.0325, 0.05, 18, 1, true), new THREE.MeshStandardMaterial({ color: 0x2f8de4 })); lab.position.y = 0.08; g.add(lab);
      liq = liquid(new THREE.CylinderGeometry(0.029, 0.029, 0.14, 14), 0xdff4ff, 0.35); liq.position.y = 0.075; liqH = 0.15;
      break;
    }
    case 'kutu': {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 20), new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.3, metalness: 0.6 })); can.position.y = 0.06; g.add(can);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.008, 20), metal); top.position.y = 0.124; g.add(top);
      liqH = 0;
      break;
    }
  }
  if (liq) { liq.userData.h = liqH; g.add(liq); setFill(g, fill); }
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}
export function setFill(g: THREE.Object3D, fill: number) {
  const l = g.getObjectByName('liquid'); if (!l) return;
  const f = Math.max(0.001, Math.min(1, fill));
  l.scale.y = f; l.visible = fill > 0.02;
  const foam = g.getObjectByName('foam'); if (foam) { foam.visible = fill > 0.1; foam.position.y = 0.012 + 0.13 * f; }
}

/** Şişe (dökme animasyonu için). */
export function makeBottle(id: string): THREE.Group {
  const g = new THREE.Group();
  const colors: Record<string, [number, number, number]> = { raki: [0xe8f0ea, 0.35, 0x1b3d7a], sarap: [0x1f3b1c, 0.9, 0x7a1a2a], bira: [0x5a2e0e, 0.85, 0xe0b020], viski: [0xb5701c, 0.6, 0x101010] };
  const [c, op, lab] = colors[id] ?? [0x333333, 0.8, 0xffffff];
  const prof: [number, number][] = id === 'viski' ? [[0, 0], [0.045, 0], [0.045, 0.17], [0.02, 0.2], [0.015, 0.26]] : [[0, 0], [0.036, 0], [0.037, 0.2], [0.03, 0.24], [0.013, 0.29], [0.013, 0.33]];
  g.add(new THREE.Mesh(lathe(prof, id === 'viski' ? 4 : 16), new THREE.MeshPhysicalMaterial({ color: c, transparent: true, opacity: op, roughness: 0.1, metalness: 0 })));
  const l = new THREE.Mesh(new THREE.CylinderGeometry(0.0375, 0.0375, 0.08, 16, 1, true), new THREE.MeshStandardMaterial({ color: lab, roughness: 0.6 })); l.position.y = 0.1; g.add(l);
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

// ----------------------------------------------------------------------- yiyecek
const foodMatCache = new Map<string, THREE.MeshStandardMaterial>();
export function makeFood(id: string, w?: number): THREE.Group {
  const g = new THREE.Group(); g.name = 'food:' + id;
  const fish = FISH.find(f => f.id === id);
  if (fish) { const m = makeFish(id, w ?? 0.2); g.add(m); g.userData.mats = (m.userData.mats as THREE.MeshStandardMaterial[]); return g; }
  const f = FOODS.find(x => x.id === id) ?? FOODS[0];
  const mat = new THREE.MeshStandardMaterial({ color: f.raw, roughness: 0.7 });
  const mats = [mat];
  const add = (geo: THREE.BufferGeometry, m: THREE.Material = mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const mm = new THREE.Mesh(geo, m); mm.position.set(x, y, z); mm.rotation.set(rx, ry, rz); mm.castShadow = true; g.add(mm); return mm; };
  switch (f.shape) {
    case 'kofte': add(new THREE.SphereGeometry(0.035, 12, 8), mat).scale.set(1.3, 0.55, 0.9); break;
    case 'sucuk': add(new THREE.TorusGeometry(0.06, 0.016, 8, 16, Math.PI * 0.9), mat, 0, 0.016, 0, Math.PI / 2); break;
    case 'kanat': add(new THREE.CapsuleGeometry(0.02, 0.05, 4, 8), mat, 0, 0.02, 0, 0, 0, Math.PI / 2); add(new THREE.CapsuleGeometry(0.017, 0.04, 4, 8), mat, 0.04, 0.02, 0.02, 0, 0.7, Math.PI / 2); break;
    case 'sis': { add(new THREE.CylinderGeometry(0.003, 0.003, 0.32, 6), metal, 0, 0.02, 0, 0, 0, Math.PI / 2); for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.03, 0.028, 0.03), mat, -0.1 + i * 0.05, 0.02, 0, 0.3 * i, 0.2, 0.1); break; }
    case 'pirzola': { add(new THREE.CylinderGeometry(0.045, 0.04, 0.02, 12), mat, 0, 0.01, 0).scale.set(1, 1, 0.7); add(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 6), porcelain, 0.07, 0.01, 0, 0, 0, Math.PI / 2); break; }
    case 'biftek': add(new THREE.BoxGeometry(0.15, 0.022, 0.1), mat, 0, 0.011, 0); break;
    case 'mantar': { add(new THREE.SphereGeometry(0.03, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat, 0, 0.012, 0); add(new THREE.CylinderGeometry(0.01, 0.012, 0.02, 8), new THREE.MeshStandardMaterial({ color: 0xf0e8da }), 0, 0.005, 0); break; }
    case 'patlican': { add(new THREE.SphereGeometry(0.04, 14, 10), mat, 0, 0.04, 0).scale.set(2.3, 1, 1); add(new THREE.ConeGeometry(0.025, 0.04, 8), new THREE.MeshStandardMaterial({ color: 0x3e6b28 }), 0.1, 0.04, 0, 0, 0, -Math.PI / 2); break; }
    case 'biber': add(new THREE.ConeGeometry(0.014, 0.14, 8), mat, 0, 0.014, 0, 0, 0, Math.PI / 2); break;
    case 'domates': { add(new THREE.SphereGeometry(0.035, 14, 10), mat, 0, 0.032, 0).scale.y = 0.85; add(new THREE.ConeGeometry(0.012, 0.01, 5), new THREE.MeshStandardMaterial({ color: 0x2f6a24 }), 0, 0.064, 0); break; }
    case 'misir': add(new THREE.CapsuleGeometry(0.024, 0.13, 6, 12), mat, 0, 0.024, 0, 0, 0, Math.PI / 2); break;
    case 'patates': add(new THREE.SphereGeometry(0.04, 12, 8), mat, 0, 0.03, 0).scale.set(1.3, 0.8, 1); break;
  }
  g.userData.mats = mats; g.userData.raw = f.raw; g.userData.done = f.done;
  return g;
}

/** Pişme rengini uygula: cookA/cookB saniye. */
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _burnt = new THREE.Color(0x141010);
export function applyCook(g: THREE.Object3D, id: string, cookA: number, cookB: number) {
  const def = cookDef(id);
  const mats: THREE.MeshStandardMaterial[] = g.userData.mats || [];
  const raw = g.userData.raw ?? FISH.find(f => f.id === id)?.color ?? 0x888888, done = g.userData.done ?? 0xb08048;
  const c = Math.max(cookA, cookB) / def.cook; // 0..1 pişme, >1 yanma
  if (c <= 1) _c1.setHex(raw).lerp(_c2.setHex(done), Math.min(1, (cookA + cookB) / (2 * def.cook)));
  else _c1.setHex(done).lerp(_burnt, Math.min(1, (c - 1) / (def.burn / def.cook)));
  for (const m of mats) m.color.copy(_c1);
  return doneness(cookA, cookB, def).level;
}
export function applyDoneLevel(g: THREE.Object3D, id: string, level: number) {
  const def = cookDef(id);
  const map = [0, 0.6, 1.05, 1.5, 2.6];
  const a = def.cook * (level <= 2 ? map[level] : 1 + (level === 3 ? 0.5 : 1) * def.burn / def.cook);
  applyCook(g, id, a, level <= 2 ? a : def.cook);
}

// ----------------------------------------------------------------------- balık
export function makeFish(id: string, w: number): THREE.Group {
  const f = FISH.find(x => x.id === id) ?? FISH[0];
  const g = new THREE.Group();
  const len = 0.24 * Math.cbrt(Math.max(0.02, w) / 0.2);
  const body = new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.35, metalness: 0.35 });
  const belly = new THREE.MeshStandardMaterial({ color: f.belly, roughness: 0.4, metalness: 0.2 });
  if (id === 'ahtapot' || id === 'kalamar') {
    const head = new THREE.Mesh(new THREE.SphereGeometry(len * 0.3, 14, 10), body); head.scale.set(1, id === 'kalamar' ? 1.8 : 1.2, 1); head.position.y = len * 0.3; g.add(head);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const t = new THREE.Mesh(new THREE.CapsuleGeometry(len * 0.04, len * 0.6, 3, 6), body);
      t.position.set(Math.cos(a) * len * 0.12, -len * 0.05, Math.sin(a) * len * 0.12); t.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); g.add(t);
    }
    g.rotation.z = Math.PI / 2;
  } else {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12), body); b.scale.set(len, len * (id === 'cipura' ? 0.42 : 0.26), len * 0.12); g.add(b);
    const bl = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), belly); bl.scale.copy(b.scale).multiplyScalar(1.01); g.add(bl);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(len * 0.16, len * 0.25, 3), body); tail.rotation.z = Math.PI / 2; tail.scale.z = 0.15; tail.position.x = -len * 0.6; g.add(tail);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(len * 0.08, len * 0.18, 3), body); fin.scale.z = 0.12; fin.position.set(0, len * 0.15, 0); g.add(fin);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(len * 0.03, 8, 6), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.1 })); eye.position.set(len * 0.36, len * 0.04, len * 0.05); g.add(eye);
    const eye2 = eye.clone(); eye2.position.z *= -1; g.add(eye2);
  }
  g.userData.mats = [body, belly]; g.userData.raw = f.color; g.userData.done = 0xa8743c; g.userData.len = len;
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

export function makeFruit(id: string): THREE.Mesh | THREE.Group {
  const f = FRUITS.find(x => x.id === id) ?? FRUITS[0];
  const mat = new THREE.MeshStandardMaterial({ color: f.color, roughness: id === 'zeytin' || id === 'uzum' ? 0.3 : 0.55 });
  if (id === 'uzum') {
    const g = new THREE.Group();
    for (let i = 0; i < 18; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), mat); const r = (1 - i / 18) * 0.03; s.position.set(Math.cos(i * 2.4) * r, -i * 0.006, Math.sin(i * 2.4) * r); g.add(s); }
    return g;
  }
  const m = new THREE.Mesh(new THREE.SphereGeometry(f.size * 0.5, 14, 10), mat);
  if (id === 'limon' || id === 'zeytin') m.scale.set(1, 1, 1.35);
  if (id === 'incir') m.scale.set(1, 1.25, 1);
  m.castShadow = true;
  return m;
}

export function makeRod(): THREE.Group {
  const g = new THREE.Group(); g.name = 'rod';
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.012, 2.4, 8), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.35, metalness: 0.3 }));
  pole.position.y = 1.0; g.add(pole);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.35, 10), new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9 })); grip.position.y = -0.05; g.add(grip);
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 14), metal); reel.rotation.z = Math.PI / 2; reel.position.set(0.035, 0.12, 0); g.add(reel);
  const tip = new THREE.Object3D(); tip.name = 'tip'; tip.position.y = 2.2; g.add(tip);
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}
export function makePhone(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.145, 0.008), [darkMetal, darkMetal, darkMetal, darkMetal, new THREE.MeshStandardMaterial({ color: 0x0b2030, emissive: 0x1a4a7a, emissiveIntensity: 0.6 }), darkMetal] as any);
  return m;
}
export function makeHeld(it: string, w?: number, extra?: { sv?: number; d?: number }): THREE.Object3D | null {
  if (!it) return null;
  if (it === 'rod') return makeRod();
  if (it === 'phone') return makePhone();
  if (it.startsWith('bottle:')) return makeBottle(it.slice(7));
  const d = DRINKS.find(x => x.id === it);
  if (d) return makeDrink(it, extra?.sv !== undefined ? extra.sv / d.sips : 1);
  if (FRUITS.some(x => x.id === it)) return makeFruit(it);
  if (FOODS.some(x => x.id === it) || FISH.some(x => x.id === it)) {
    const g = makeFood(it, w);
    if (extra?.d !== undefined) applyDoneLevel(g, it, extra.d);
    return g;
  }
  return null;
}
export { wood };
