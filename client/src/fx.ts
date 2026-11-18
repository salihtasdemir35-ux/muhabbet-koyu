// Parçacık efektleri: duman, sıçrama, kıvılcım, konfeti, su damlaları
import * as THREE from 'three';
import { smokeTex, softDot } from './textures';

interface Part { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number; grow: number; fade: number; grav: number; alive: boolean; spin: number }

export class FX {
  parts: Part[] = [];
  private smokeMat = new THREE.SpriteMaterial({ map: smokeTex(), transparent: true, depthWrite: false, color: 0xdddddd });
  private dotMat = new THREE.SpriteMaterial({ map: softDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  private waterMat = new THREE.SpriteMaterial({ map: softDot(), transparent: true, depthWrite: false, color: 0xd8f4ff });
  constructor(private scene: THREE.Scene, private max = 500) {}

  private spawn(mat: THREE.SpriteMaterial, pos: THREE.Vector3, v: THREE.Vector3, size: number, life: number, opts: Partial<Part> & { color?: number; opacity?: number } = {}) {
    let p = this.parts.find(x => !x.alive);
    if (!p) {
      if (this.parts.length >= this.max) return;
      const s = new THREE.Sprite(mat.clone()); this.scene.add(s);
      p = { s, v: new THREE.Vector3(), life: 0, max: 1, grow: 0, fade: 1, grav: 0, alive: false, spin: 0 }; this.parts.push(p);
    }
    const m = p.s.material as THREE.SpriteMaterial;
    m.map = mat.map; m.blending = mat.blending; m.color.set(opts.color ?? mat.color.getHex()); m.opacity = opts.opacity ?? 1; m.rotation = Math.random() * 6;
    p.s.visible = true; p.alive = true; p.s.position.copy(pos); p.v.copy(v); p.life = 0; p.max = life; p.s.scale.setScalar(size);
    p.grow = opts.grow ?? 0; p.fade = opts.opacity ?? 1; p.grav = opts.grav ?? 0; p.spin = opts.spin ?? 0;
  }
  smoke(pos: THREE.Vector3, amount = 1, dark = 0, wind = 0.3) {
    const c = new THREE.Color(0xd8d8d8).lerp(new THREE.Color(0x202020), dark).getHex();
    for (let i = 0; i < amount; i++) this.spawn(this.smokeMat, pos.clone().add(new THREE.Vector3((Math.random() - .5) * .2, 0, (Math.random() - .5) * .2)), new THREE.Vector3(wind * 0.6 + (Math.random() - .5) * .2, 0.55 + Math.random() * 0.3, (Math.random() - .5) * .2), 0.35, 2.6 + Math.random(), { color: c, opacity: 0.35 + dark * 0.4, grow: 0.9, spin: (Math.random() - .5) });
  }
  sparks(pos: THREE.Vector3, n = 2) {
    for (let i = 0; i < n; i++) this.spawn(this.dotMat, pos.clone().add(new THREE.Vector3((Math.random() - .5) * 1.4, 0, (Math.random() - .5) * .5)), new THREE.Vector3((Math.random() - .5) * .4, 1 + Math.random() * 1.2, (Math.random() - .5) * .4), 0.05, 0.9 + Math.random() * 0.6, { color: 0xff8a30, opacity: 1, grav: -0.3 });
  }
  splash(pos: THREE.Vector3, n = 30, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random();
      this.spawn(this.waterMat, pos.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.4, 0.05, Math.sin(a) * r * 0.4)), new THREE.Vector3(Math.cos(a) * (1 + r) * power, (2.5 + Math.random() * 2.5) * power, Math.sin(a) * (1 + r) * power), 0.12 + Math.random() * 0.1, 1.2, { opacity: 0.85, grav: 9.8 });
    }
  }
  spray(pos: THREE.Vector3, dir: THREE.Vector3, n = 20) {
    for (let i = 0; i < n; i++) this.spawn(this.waterMat, pos.clone(), dir.clone().multiplyScalar(3 + Math.random() * 3).add(new THREE.Vector3((Math.random() - .5) * 1.5, 2 + Math.random() * 2, (Math.random() - .5) * 1.5)), 0.1, 1, { opacity: 0.8, grav: 9.8 });
  }
  shower(pos: THREE.Vector3) { for (let i = 0; i < 4; i++) this.spawn(this.waterMat, pos.clone().add(new THREE.Vector3((Math.random() - .5) * .25, 0, (Math.random() - .5) * .25)), new THREE.Vector3(0, -4, 0), 0.05, 0.55, { opacity: 0.7, grav: 6 }); }
  confetti(pos: THREE.Vector3, n = 60) {
    const cols = [0xffd166, 0xef476f, 0x06d6a0, 0x118ab2, 0xffffff, 0xff9f1c];
    for (let i = 0; i < n; i++) this.spawn(this.dotMat, pos.clone(), new THREE.Vector3((Math.random() - .5) * 4, 3 + Math.random() * 4, (Math.random() - .5) * 4), 0.09, 2.2, { color: cols[i % cols.length], opacity: 1, grav: 5, spin: 3 });
  }
  puff(pos: THREE.Vector3, color = 0xffffff, n = 10) { for (let i = 0; i < n; i++) this.spawn(this.smokeMat, pos.clone(), new THREE.Vector3((Math.random() - .5) * 1.5, Math.random() * 1.2, (Math.random() - .5) * 1.5), 0.3, 1, { color, opacity: 0.6, grow: 1.2 }); }
  zzz(pos: THREE.Vector3) { this.spawn(this.dotMat, pos.clone(), new THREE.Vector3(0.1, 0.4, 0), 0.08, 1.6, { color: 0xbfe3ff, opacity: 0.9 }); }

  update(dt: number) {
    for (const p of this.parts) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.max) { p.alive = false; p.s.visible = false; continue; }
      p.v.y -= p.grav * dt;
      p.s.position.addScaledVector(p.v, dt);
      if (p.grow) p.s.scale.multiplyScalar(1 + p.grow * dt);
      const m = p.s.material as THREE.SpriteMaterial;
      m.opacity = p.fade * (1 - p.life / p.max);
      m.rotation += p.spin * dt;
    }
  }
}
