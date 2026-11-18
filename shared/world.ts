// ======================================================================
//  Dünya yerleşimi – sunucu ve istemci aynı haritayı kullanır.
//  Koordinatlar metre: +x doğu, +z güney (villaya doğru), -z deniz.
// ======================================================================

export const SEA_Y = 0;
export const POOL = { x0: 8, x1: 22, z0: 17, z1: 27, water: 0.42, floor: -1.05 };
export const VILLA = { x0: -12, x1: 12, z0: 38, z1: 54, floor: 0.82, height: 3.4 };
export const TERRACE = { x0: -12, x1: 12, z0: 32, z1: 38, y: 0.74 };
export const PIER = { x0: 20.4, x1: 23.6, z0: -42, z1: -9, y: 0.95 };
export const ROCK_PAD = { x: -36, z: -19.5, r: 3.4, y: 1.15 };
export const GARDEN = { x0: -40, x1: 40, z0: 10, z1: 62, y: 0.6 };
export const BOARDWALK = { x0: -40, x1: 40, z0: 6, z1: 9.6, y: 0.66 };
export const GRILL = { x: -14, z: 21.5 };
export const BAR = { x: 10, z: 2 };
export const FRIDGE = { x: -1.6, z: 53.2 };
export const TV = { x: 3.5, z: 49.4 };
export const SHOWER = { x: 25.5, z: 31 };
export const RADIO = { x: -17.6, z: 19.6 };
export const WORLD_BOUNDS = { x0: -60, x1: 60, z0: -60, z1: 64 };
export const WC = { x0: 8, x1: 12, z0: 48, z1: 54 };

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
const BEACH_PROFILE: [number, number][] = [[-70, -4.2], [-40, -2.6], [-24, -0.9], [-17.5, 0.0], [-10, 0.34], [0, 0.48], [8, 0.58]];

export function beachY(x: number, z: number): number {
  if (z >= 8) return GARDEN.y;
  let h = BEACH_PROFILE[0][1];
  for (let i = 0; i < BEACH_PROFILE.length - 1; i++) {
    const [za, ha] = BEACH_PROFILE[i], [zb, hb] = BEACH_PROFILE[i + 1];
    if (z >= za && z <= zb) { const t = (z - za) / (zb - za); h = lerp(ha, hb, t * t * (3 - 2 * t)); break; }
    if (z > zb) h = hb;
  }
  // küçük kum tepecikleri
  const dune = z > -14 ? (Math.sin(x * 0.21) * Math.cos(z * 0.33) * 0.07 + Math.sin(x * 0.07 + z * 0.11) * 0.06) : 0;
  return h + dune;
}

const inRect = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
export const inPool = (x: number, z: number) => inRect(x, z, POOL);
export const inVilla = (x: number, z: number) => inRect(x, z, VILLA);
export const inWC = (x: number, z: number) => inRect(x, z, WC);
export const onPier = (x: number, z: number) => inRect(x, z, PIER);

/** Karakterin ayaklarının basacağı yükseklik. */
export function floorY(x: number, z: number): number {
  if (inVilla(x, z)) return VILLA.floor;
  if (inRect(x, z, TERRACE)) return TERRACE.y;
  if (onPier(x, z)) return PIER.y;
  if (inRect(x, z, BOARDWALK)) return BOARDWALK.y;
  if (inPool(x, z)) return POOL.floor;
  const dr = Math.hypot(x - ROCK_PAD.x, z - ROCK_PAD.z);
  if (dr < ROCK_PAD.r) return ROCK_PAD.y;
  return beachY(x, z);
}
/** Suda mı (yüzme)? Havuz ya da derin deniz. */
export function waterAt(x: number, z: number): number | null {
  if (inPool(x, z)) return POOL.water;
  if (!onPier(x, z) && Math.hypot(x - ROCK_PAD.x, z - ROCK_PAD.z) > ROCK_PAD.r && beachY(x, z) < -1.05) return SEA_Y;
  return null;
}

// ------------------------------------------------------------ ÇARPIŞMA
export interface Box { x0: number; x1: number; z0: number; z1: number; h?: number; id?: string }
const W = 0.3;
export const STATIC_COLLIDERS: Box[] = [
  // villa dış duvarları (ön cephede 8 m'lik cam sürgülü açıklık)
  { x0: VILLA.x0, x1: -4, z0: VILLA.z0 - W / 2, z1: VILLA.z0 + W / 2, h: 3.4 },
  { x0: 4, x1: VILLA.x1, z0: VILLA.z0 - W / 2, z1: VILLA.z0 + W / 2, h: 3.4 },
  { x0: VILLA.x0, x1: VILLA.x1, z0: VILLA.z1 - W / 2, z1: VILLA.z1 + W / 2, h: 3.4 },
  { x0: VILLA.x0 - W / 2, x1: VILLA.x0 + W / 2, z0: VILLA.z0, z1: VILLA.z1, h: 3.4 },
  { x0: VILLA.x1 - W / 2, x1: VILLA.x1 + W / 2, z0: VILLA.z0, z1: VILLA.z1, h: 3.4 },
  // WC bölmesi (kapı x=8, z 50..51.4)
  { x0: WC.x0, x1: WC.x1, z0: WC.z0 - W / 2, z1: WC.z0 + W / 2, h: 3.4 },
  { x0: WC.x0 - W / 2, x1: WC.x0 + W / 2, z0: WC.z0, z1: 50, h: 3.4 },
  { x0: WC.x0 - W / 2, x1: WC.x0 + W / 2, z0: 51.4, z1: WC.z1, h: 3.4 },
  // mutfak tezgâhı + ada
  { x0: -11.7, x1: -3, z0: 53, z1: 53.85, h: 1 },
  { x0: -9, x1: -5, z0: 48.4, z1: 49.4, h: 1 },
  { x0: FRIDGE.x - 0.45, x1: FRIDGE.x + 0.45, z0: 53, z1: 53.85, h: 2 },
  // salon
  { x0: 0.8, x1: 6.2, z0: 43.4, z1: 44.3, h: 0.8 },     // kanepe
  { x0: 1.8, x1: 5.2, z0: 49.1, z1: 49.7, h: 1.6 },     // TV ünitesi
  { x0: -9, x1: -3.6, z0: 41.6, z1: 43.1, h: 0.8 },     // yemek masası
  // bahçe duvarı (kapı z=10, x -3..3)
  { x0: -40, x1: -3, z0: 9.85, z1: 10.25, h: 1 }, { x0: 3, x1: 40, z0: 9.85, z1: 10.25, h: 1 },
  { x0: -40.3, x1: -39.9, z0: 10, z1: 62, h: 1 }, { x0: 39.9, x1: 40.3, z0: 10, z1: 62, h: 1 },
  { x0: -40, x1: 40, z0: 61.8, z1: 62.2, h: 1 },
  // mangal + büyük masa
  { x0: GRILL.x - 1.25, x1: GRILL.x + 1.25, z0: GRILL.z - 0.5, z1: GRILL.z + 0.5, h: 1 },
  { x0: -16.6, x1: -11.4, z0: 26.45, z1: 27.55, h: 0.78 },
  // sahil büfesi
  { x0: BAR.x - 2.2, x1: BAR.x + 2.2, z0: BAR.z - 0.6, z1: BAR.z + 1.6, h: 2.6 },
  // sahil masası
  { x0: -9, x1: -7, z0: -0.5, z1: 0.5, h: 0.75 },
  // teras yemek masası
  { x0: -8.5, x1: -4.5, z0: 34.5, z1: 35.5, h: 0.78 },
];
export const DOORS = [{ id: 'wc', x: WC.x0, z0: 50, z1: 51.4 }];
export function doorBox(open: boolean): Box | null { return open ? null : { x0: WC.x0 - 0.15, x1: WC.x0 + 0.15, z0: 50, z1: 51.4, h: 2.2, id: 'door_wc' }; }

// ------------------------------------------------------------ OTURAKLAR
export type SeatType = 'chair' | 'sunbed' | 'sofa' | 'bench' | 'toilet' | 'stool';
export interface Seat { id: string; x: number; z: number; y: number; ry: number; type: SeatType }
export const SEATS: Seat[] = [];
// mangal masası: 3+3 yan, 2 uç
[-15.6, -14, -12.4].forEach((x, i) => {
  SEATS.push({ id: 'mm_n' + i, x, z: 25.75, y: GARDEN.y + 0.46, ry: 0, type: 'chair' });
  SEATS.push({ id: 'mm_s' + i, x, z: 28.25, y: GARDEN.y + 0.46, ry: Math.PI, type: 'chair' });
});
SEATS.push({ id: 'mm_w', x: -17.35, z: 27, y: GARDEN.y + 0.46, ry: Math.PI / 2, type: 'chair' });
SEATS.push({ id: 'mm_e', x: -10.65, z: 27, y: GARDEN.y + 0.46, ry: -Math.PI / 2, type: 'chair' });
// mangal başı tabureleri
SEATS.push({ id: 'mg_t1', x: -16.4, z: 20.2, y: GARDEN.y + 0.45, ry: Math.PI * 0.75, type: 'stool' });
SEATS.push({ id: 'mg_t2', x: -11.6, z: 20.2, y: GARDEN.y + 0.45, ry: -Math.PI * 0.75, type: 'stool' });
// havuz şezlongları
[10, 13, 16, 19].forEach((x, i) => SEATS.push({ id: 'hv_' + i, x, z: 30.2, y: GARDEN.y + 0.38, ry: Math.PI, type: 'sunbed' }));
// sahil şezlongları
[-22, -17, -12, 1, 6, 15].forEach((x, i) => SEATS.push({ id: 'sh_' + i, x, z: -5, y: beachY(x, -5) + 0.36, ry: Math.PI, type: 'sunbed' }));
// sahil masası
SEATS.push({ id: 'sm_0', x: -8, z: -1.25, y: beachY(-8, -1.25) + 0.46, ry: 0, type: 'chair' });
SEATS.push({ id: 'sm_1', x: -8, z: 1.25, y: beachY(-8, 1.25) + 0.46, ry: Math.PI, type: 'chair' });
SEATS.push({ id: 'sm_2', x: -9.6, z: 0, y: beachY(-9.6, 0) + 0.46, ry: Math.PI / 2, type: 'chair' });
SEATS.push({ id: 'sm_3', x: -6.4, z: 0, y: beachY(-6.4, 0) + 0.46, ry: -Math.PI / 2, type: 'chair' });
// iskele bankı
SEATS.push({ id: 'isk_b', x: 23.1, z: -20, y: PIER.y + 0.45, ry: -Math.PI / 2, type: 'bench' });
// kanepe
[1.9, 3.5, 5.1].forEach((x, i) => SEATS.push({ id: 'kn_' + i, x, z: 44.4, y: VILLA.floor + 0.44, ry: 0, type: 'sofa' }));
// içerideki yemek masası
[-8.2, -6.3, -4.4].forEach((x, i) => {
  SEATS.push({ id: 'ym_n' + i, x, z: 41.05, y: VILLA.floor + 0.46, ry: 0, type: 'chair' });
  SEATS.push({ id: 'ym_s' + i, x, z: 43.65, y: VILLA.floor + 0.46, ry: Math.PI, type: 'chair' });
});
// teras masası
[-7.8, -5.2].forEach((x, i) => {
  SEATS.push({ id: 'tr_n' + i, x, z: 33.95, y: TERRACE.y + 0.46, ry: 0, type: 'chair' });
  SEATS.push({ id: 'tr_s' + i, x, z: 36.05, y: TERRACE.y + 0.46, ry: Math.PI, type: 'chair' });
});
// teras salıncaklı kanepe / bank
SEATS.push({ id: 'tr_k0', x: 4, z: 37, y: TERRACE.y + 0.44, ry: Math.PI, type: 'sofa' });
SEATS.push({ id: 'tr_k1', x: 5.6, z: 37, y: TERRACE.y + 0.44, ry: Math.PI, type: 'sofa' });
// tuvalet
SEATS.push({ id: 'wc_0', x: 11.3, z: 52.2, y: VILLA.floor + 0.44, ry: -Math.PI / 2, type: 'toilet' });

// ------------------------------------------------------------ BALIK NOKTALARI
export interface FishSpot { id: string; kind: 'iskele' | 'kayalik' | 'sahil'; x: number; z: number; r: number; face: number }
export const FISH_SPOTS: FishSpot[] = [
  { id: 'isk_uc', kind: 'iskele', x: 22, z: -40, r: 3.2, face: Math.PI },
  { id: 'isk_orta', kind: 'iskele', x: 22, z: -28, r: 3, face: Math.PI / 2 },
  { id: 'kaya', kind: 'kayalik', x: -36, z: -20.5, r: 3.6, face: Math.PI },
  { id: 'sahil_b', kind: 'sahil', x: -8, z: -16.5, r: 6, face: Math.PI },
  { id: 'sahil_d', kind: 'sahil', x: 8, z: -16.5, r: 6, face: Math.PI },
];
export function fishSpotAt(x: number, z: number): FishSpot | null {
  for (const s of FISH_SPOTS) if (Math.hypot(x - s.x, z - s.z) <= s.r + 0.5) return s;
  return null;
}

// ------------------------------------------------------------ MEYVE AĞAÇLARI
export interface TreeDef { id: string; fruit: string; x: number; z: number; max: number }
export const TREES: TreeDef[] = [
  { id: 't_por1', fruit: 'portakal', x: -31, z: 31, max: 8 },
  { id: 't_lim', fruit: 'limon', x: -24, z: 31, max: 8 },
  { id: 't_man', fruit: 'mandalina', x: -31, z: 38, max: 8 },
  { id: 't_inc', fruit: 'incir', x: -24, z: 38, max: 6 },
  { id: 't_nar', fruit: 'nar', x: -31, z: 45, max: 6 },
  { id: 't_zey', fruit: 'zeytin', x: -24, z: 45, max: 12 },
  { id: 't_uzm', fruit: 'uzum', x: -27.5, z: 53, max: 10 },
  { id: 't_por2', fruit: 'portakal', x: 30, z: 50, max: 8 },
  { id: 't_lim2', fruit: 'limon', x: 33, z: 42, max: 8 },
];
export const PALMS: [number, number, number][] = [
  [-26, -3, 7.5], [-19, 2, 8.4], [-3, -6, 7], [12, -9, 7.8], [18, 4, 8.6], [28, -2, 7.2], [-33, 4, 8], [33, 6, 7.7],
  [-6, 14, 6.6], [6, 14, 6.9], [-36, 22, 7.4], [36, 24, 7.8], [-2, 30, 6.2], [26, 58, 7], [-36, 58, 7.5],
];

export function nearestSeat(x: number, z: number, maxD = 2): Seat | null {
  let best: Seat | null = null, bd = maxD;
  for (const s of SEATS) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
  return best;
}
export const dist2 = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
