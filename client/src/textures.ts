// Prosedürel dokular (canvas) – harici görsel dosyası gerektirmez, telifsizdir.
import * as THREE from 'three';

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')!] as const; }
function tex(c: HTMLCanvasElement, rep = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
// basit değer gürültüsü
function noiseField(w: number, h: number, scale: number, seed: number) {
  const r = rng(seed); const gw = Math.ceil(w / scale) + 2, gh = Math.ceil(h / scale) + 2;
  const grid = new Float32Array(gw * gh).map(() => r());
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const g = (a: number, b: number) => grid[((b % (gh - 1)) * gw) + (a % (gw - 1))];
    out[y * w + x] = (g(ix, iy) * (1 - sx) + g(ix + 1, iy) * sx) * (1 - sy) + (g(ix, iy + 1) * (1 - sx) + g(ix + 1, iy + 1) * sx) * sy;
  }
  return out;
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, f: () => THREE.Texture) { let t = cache.get(key); if (!t) { t = f(); cache.set(key, t); } return t; }

/** Kum: ince taneli gürültü (renk değil, detay – vertex rengiyle çarpılır) */
export const sandDetail = () => cached('sand', () => {
  const S = 256; const [c, g] = canvas(S, S); const img = g.createImageData(S, S); const r = rng(7);
  const n1 = noiseField(S, S, 32, 3), n2 = noiseField(S, S, 8, 5);
  for (let i = 0; i < S * S; i++) { const v = 205 + (n1[i] - 0.5) * 30 + (n2[i] - 0.5) * 22 + (r() - 0.5) * 34; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return tex(c, 40, false);
});
export const sandNormal = () => cached('sandN', () => {
  const S = 256; const [c, g] = canvas(S, S); const img = g.createImageData(S, S);
  const h = noiseField(S, S, 6, 11), h2 = noiseField(S, S, 24, 13);
  const H = (x: number, y: number) => { x = (x + S) % S; y = (y + S) % S; return h[y * S + x] * 0.6 + h2[y * S + x] * 1.4; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2, dy = (H(x, y + 1) - H(x, y - 1)) * 2.2;
    const l = Math.hypot(dx, dy, 1); const i = (y * S + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return tex(c, 40, false);
});

export const planks = (base = '#a0784e', rep = 1) => cached('planks' + base + rep, () => {
  const [c, g] = canvas(512, 512); const r = rng(21);
  const h = 512 / 8;
  for (let i = 0; i < 8; i++) {
    const shade = (r() - 0.5) * 30;
    g.fillStyle = shadeHex(base, shade); g.fillRect(0, i * h, 512, h);
    for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(60,35,15,${0.05 + r() * 0.12})`; g.lineWidth = 1 + r() * 1.5; g.beginPath(); const y = i * h + r() * h; g.moveTo(0, y); g.bezierCurveTo(170, y + (r() - .5) * 8, 340, y + (r() - .5) * 8, 512, y + (r() - .5) * 6); g.stroke(); }
    g.fillStyle = 'rgba(30,18,8,.55)'; g.fillRect(0, i * h, 512, 3);
    const off = r() * 512; g.fillRect(off, i * h, 3, h);
  }
  return tex(c, rep);
});
export const tiles = (color = '#3aa6c9', grout = '#e8f4f8', n = 8) => cached('tiles' + color + n, () => {
  const [c, g] = canvas(256, 256); const r = rng(5); const s = 256 / n;
  g.fillStyle = grout; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = shadeHex(color, (r() - 0.5) * 18); g.fillRect(x * s + 1.5, y * s + 1.5, s - 3, s - 3); }
  return tex(c, 1);
});
export const plaster = () => cached('plaster', () => {
  const S = 256; const [c, g] = canvas(S, S); const img = g.createImageData(S, S); const n = noiseField(S, S, 16, 9); const r = rng(4);
  for (let i = 0; i < S * S; i++) { const v = 238 + (n[i] - 0.5) * 14 + (r() - 0.5) * 6; img.data[i * 4] = v; img.data[i * 4 + 1] = v - 2; img.data[i * 4 + 2] = v - 7; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return tex(c, 4);
});
export const stone = (base = '#c9bca6', rep = 4) => cached('stone' + base, () => {
  const [c, g] = canvas(512, 512); const r = rng(33);
  g.fillStyle = '#8f8574'; g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 64) { const off = (y / 64) % 2 ? 0 : 50; for (let x = -100; x < 512; x += 100 + r() * 30) { g.fillStyle = shadeHex(base, (r() - 0.5) * 40); g.fillRect(x + off + 3, y + 3, 94 + r() * 20, 58); } }
  return tex(c, rep);
});
export const bricks = () => cached('bricks', () => {
  const [c, g] = canvas(256, 256); const r = rng(8);
  g.fillStyle = '#d8d0c0'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) for (let x = (y / 32) % 2 ? -32 : 0; x < 256; x += 64) { g.fillStyle = shadeHex('#a0503a', (r() - 0.5) * 40); g.fillRect(x + 2, y + 2, 60, 28); }
  return tex(c, 1);
});
export const stripes = (a: string, b: string, n = 8) => cached('str' + a + b + n, () => {
  const [c, g] = canvas(256, 32); for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 256 / n, 0, 256 / n + 1, 32); } return tex(c, 1);
});
export const bark = () => cached('bark', () => {
  const [c, g] = canvas(64, 256); const r = rng(2);
  g.fillStyle = '#8a7356'; g.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 10 + r() * 6) { g.fillStyle = `rgba(50,35,20,${0.3 + r() * 0.3})`; g.fillRect(0, y, 64, 3 + r() * 3); g.fillStyle = `rgba(200,180,150,${0.15})`; g.fillRect(0, y + 4, 64, 2); }
  return tex(c, 1);
});
export const thatch = () => cached('thatch', () => {
  const [c, g] = canvas(256, 256); const r = rng(77);
  g.fillStyle = '#b8955a'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) { g.strokeStyle = shadeHex('#c8a468', (r() - 0.5) * 70); g.lineWidth = 1 + r(); g.beginPath(); const x = r() * 256, y = r() * 256; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y + 20 + r() * 20); g.stroke(); }
  return tex(c, 2);
});
export const grassGround = () => cached('grassG', () => {
  const S = 256; const [c, g] = canvas(S, S); const img = g.createImageData(S, S); const n = noiseField(S, S, 20, 17), n2 = noiseField(S, S, 5, 19); const r = rng(3);
  for (let i = 0; i < S * S; i++) { const v = 0.75 + (n[i] - 0.5) * 0.3 + (n2[i] - 0.5) * 0.2 + (r() - 0.5) * 0.15; img.data[i * 4] = 255 * v; img.data[i * 4 + 1] = 255 * v; img.data[i * 4 + 2] = 255 * v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return tex(c, 30, false);
});
export const leafTex = () => cached('leaf', () => { // palmiye yaprağı (alfa)
  const [c, g] = canvas(64, 256);
  g.clearRect(0, 0, 64, 256);
  g.strokeStyle = '#3d6b25'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 256); g.stroke();
  for (let y = 4; y < 252; y += 5) { const w = Math.sin((y / 256) * Math.PI) * 30; g.strokeStyle = y % 2 ? '#4f8a2e' : '#467d29'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, y); g.lineTo(32 - w, y + 14); g.moveTo(32, y); g.lineTo(32 + w, y + 14); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
});
export const cloudTex = () => cached('cloud', () => {
  const [c, g] = canvas(256, 128); const r = rng(55);
  for (let i = 0; i < 40; i++) { const x = 40 + r() * 176, y = 50 + r() * 40, rad = 18 + r() * 30; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 128); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
});
export const softDot = () => cached('dot', () => {
  const [c, g] = canvas(64, 64); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
});
export const smokeTex = () => cached('smoke', () => {
  const [c, g] = canvas(128, 128); const r = rng(91);
  for (let i = 0; i < 18; i++) { const x = 30 + r() * 68, y = 30 + r() * 68, rad = 14 + r() * 24; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  return new THREE.CanvasTexture(c);
});

function shadeHex(hex: string, d: number) {
  const n = parseInt(hex.slice(1), 16); const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v + d)));
  return `rgb(${cl(n >> 16)},${cl((n >> 8) & 255)},${cl(n & 255)})`;
}
