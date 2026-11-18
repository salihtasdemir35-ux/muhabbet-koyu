// ======================================================================
//  MUHABBET KOYU – Paylaşılan oyun verileri (istemci + sunucu)
//  Bütün fiyatlar Sahil Lirası (SL). Sunucu bu tabloları tek doğru
//  kaynak olarak kullanır; istemci yalnızca gösterim için okur.
// ======================================================================

export const GAME_NAME = 'Muhabbet Koyu';
export const GAME_SUBTITLE = 'Sahilde Muhabbet';
export const SLOGAN = 'Balık bahane, muhabbet şahane!';
export const START_COINS = 500;
export const ROOM_MAX_DEFAULT = 16;
export const PROTOCOL_VERSION = 3;

// ---------------------------------------------------------------- BALIK
export type Rarity = 'yaygın' | 'nadir' | 'çok nadir' | 'efsane';
export interface FishDef {
  id: string; name: string; minW: number; maxW: number;
  chance: number;          // ağırlıklı olasılık
  pricePerKg: number;
  rarity: Rarity;
  spots: string[];         // hangi noktalarda çıkar
  night?: number;          // akşam/gece çarpanı
  color: number;           // 3D model rengi
  belly: number;
}
export const FISH: FishDef[] = [
  { id: 'istavrit', name: 'İstavrit', minW: 0.05, maxW: 0.25, chance: 30, pricePerKg: 60, rarity: 'yaygın', spots: ['iskele', 'sahil', 'kayalik'], color: 0x6f8fa8, belly: 0xdfe8ee },
  { id: 'hamsi', name: 'Hamsi', minW: 0.02, maxW: 0.06, chance: 26, pricePerKg: 90, rarity: 'yaygın', spots: ['iskele', 'sahil'], color: 0x4f6f8f, belly: 0xe6edf2 },
  { id: 'sardalya', name: 'Sardalya', minW: 0.04, maxW: 0.12, chance: 24, pricePerKg: 80, rarity: 'yaygın', spots: ['iskele', 'sahil'], color: 0x587d9c, belly: 0xe9eef0 },
  { id: 'kefal', name: 'Kefal', minW: 0.3, maxW: 2.2, chance: 18, pricePerKg: 70, rarity: 'yaygın', spots: ['sahil', 'kayalik', 'iskele'], color: 0x7d8a8f, belly: 0xd8dcd8 },
  { id: 'cipura', name: 'Çipura', minW: 0.25, maxW: 1.8, chance: 12, pricePerKg: 160, rarity: 'nadir', spots: ['kayalik', 'iskele'], color: 0xa0a6a8, belly: 0xe8e4d8 },
  { id: 'levrek', name: 'Levrek', minW: 0.3, maxW: 3.5, chance: 10, pricePerKg: 180, rarity: 'nadir', spots: ['kayalik', 'iskele', 'sahil'], color: 0x8c979c, belly: 0xeef0ee },
  { id: 'barbun', name: 'Barbun', minW: 0.08, maxW: 0.4, chance: 10, pricePerKg: 220, rarity: 'nadir', spots: ['kayalik', 'sahil'], color: 0xc8604f, belly: 0xf1d0c0 },
  { id: 'lufer', name: 'Lüfer', minW: 0.4, maxW: 4.5, chance: 6, pricePerKg: 260, rarity: 'çok nadir', spots: ['iskele', 'kayalik'], night: 2.2, color: 0x46708a, belly: 0xd8e2e6 },
  { id: 'palamut', name: 'Palamut', minW: 0.8, maxW: 5, chance: 5, pricePerKg: 200, rarity: 'çok nadir', spots: ['iskele'], night: 1.4, color: 0x2e4f6c, belly: 0xe0e6ea },
  { id: 'kalamar', name: 'Kalamar', minW: 0.15, maxW: 1.4, chance: 5, pricePerKg: 240, rarity: 'çok nadir', spots: ['iskele', 'kayalik'], night: 2.5, color: 0xd9b7b0, belly: 0xf2e2dc },
  { id: 'ahtapot', name: 'Ahtapot', minW: 0.6, maxW: 6, chance: 3, pricePerKg: 300, rarity: 'efsane', spots: ['kayalik'], color: 0xa4513f, belly: 0xe0a090 },
  { id: 'orkinos', name: 'Orkinos', minW: 18, maxW: 120, chance: 0.8, pricePerKg: 120, rarity: 'efsane', spots: ['iskele'], color: 0x1d3550, belly: 0xc8d0d8 },
];
export const RARITY_SCORE: Record<Rarity, number> = { 'yaygın': 1, 'nadir': 3, 'çok nadir': 8, 'efsane': 25 };
export const RARITY_COLOR: Record<Rarity, string> = { 'yaygın': '#cfd8dc', 'nadir': '#4fc3f7', 'çok nadir': '#ba68c8', 'efsane': '#ffb300' };

export interface RodDef { id: string; name: string; price: number; rareBoost: number; speed: number; escape: number; desc: string }
export const RODS: RodDef[] = [
  { id: 'olta_bambu', name: 'Bambu Olta', price: 0, rareBoost: 1, speed: 1, escape: 0.22, desc: 'Dededen kalma, her şeyi tutar (biraz yavaş).' },
  { id: 'olta_karbon', name: 'Karbon Olta', price: 350, rareBoost: 1.5, speed: 1.25, escape: 0.14, desc: 'Hafif, hassas. Nadir balıklar için iyi.' },
  { id: 'olta_pro', name: 'Profesyonel Kamış + Makine', price: 1200, rareBoost: 2.3, speed: 1.5, escape: 0.08, desc: 'Orkinos hayali kuranlar için.' },
];
export interface BaitDef { id: string; name: string; price: number; rareBoost: number; bigBoost: number; desc: string }
export const BAITS: BaitDef[] = [
  { id: 'yem_ekmek', name: 'Ekmek İçi', price: 2, rareBoost: 0.8, bigBoost: 0.8, desc: 'Kefal sever.' },
  { id: 'yem_karides', name: 'Karides', price: 8, rareBoost: 1.2, bigBoost: 1.1, desc: 'Çipura ve levrek dayanamaz.' },
  { id: 'yem_silikon', name: 'Silikon Yem', price: 15, rareBoost: 1.4, bigBoost: 1.4, desc: 'Lüfer ve palamut için.' },
  { id: 'yem_canli', name: 'Canlı Yem', price: 30, rareBoost: 1.9, bigBoost: 1.8, desc: 'Büyük av, büyük hikâye.' },
];

// ---------------------------------------------------------------- MANGAL
export type FoodShape = 'fish' | 'kofte' | 'sucuk' | 'kanat' | 'sis' | 'pirzola' | 'biftek' | 'mantar' | 'patlican' | 'biber' | 'domates' | 'misir' | 'patates';
export interface FoodDef { id: string; name: string; price: number; cook: number; burn: number; shape: FoodShape; raw: number; done: number; sell: number }
// cook: bir yüz için tam pişme süresi (sn) — burn: tam pişmeden sonra yanmaya kadar ek süre
export const FOODS: FoodDef[] = [
  { id: 'kofte', name: 'Köfte', price: 25, cook: 22, burn: 25, shape: 'kofte', raw: 0xb5563f, done: 0x5a2f1d, sell: 0 },
  { id: 'sucuk', name: 'Sucuk', price: 22, cook: 14, burn: 14, shape: 'sucuk', raw: 0xa52a24, done: 0x5c1612, sell: 0 },
  { id: 'kanat', name: 'Tavuk Kanat', price: 28, cook: 28, burn: 25, shape: 'kanat', raw: 0xe8c4a8, done: 0xb06a2a, sell: 0 },
  { id: 'tavuksis', name: 'Tavuk Şiş', price: 30, cook: 24, burn: 22, shape: 'sis', raw: 0xead0b5, done: 0xb8742f, sell: 0 },
  { id: 'pirzola', name: 'Kuzu Pirzola', price: 60, cook: 26, burn: 22, shape: 'pirzola', raw: 0xc1504a, done: 0x6a3420, sell: 0 },
  { id: 'biftek', name: 'Biftek', price: 75, cook: 30, burn: 25, shape: 'biftek', raw: 0xb23a36, done: 0x5c2c1a, sell: 0 },
  { id: 'mantar', name: 'Mantar', price: 10, cook: 12, burn: 15, shape: 'mantar', raw: 0xe6dccb, done: 0x8a6a45, sell: 0 },
  { id: 'patlican', name: 'Patlıcan', price: 8, cook: 30, burn: 30, shape: 'patlican', raw: 0x3a1f4a, done: 0x2a1a20, sell: 0 },
  { id: 'biber', name: 'Sivri Biber', price: 5, cook: 10, burn: 14, shape: 'biber', raw: 0x5aa83a, done: 0x3c6a22, sell: 0 },
  { id: 'domates', name: 'Domates', price: 6, cook: 12, burn: 14, shape: 'domates', raw: 0xd8392b, done: 0x8e2a1c, sell: 0 },
  { id: 'misir', name: 'Mısır', price: 10, cook: 24, burn: 26, shape: 'misir', raw: 0xf2d24a, done: 0xc0902a, sell: 0 },
  { id: 'patates', name: 'Patates (közde)', price: 6, cook: 34, burn: 34, shape: 'patates', raw: 0xb88f5a, done: 0x6a4a2a, sell: 0 },
];
export const GRILL_SLOTS = 10;
export function doneness(cookA: number, cookB: number, def: { cook: number; burn: number }): { level: number; label: string } {
  // her yüz 0..1 pişme, 1..2 yanma
  const a = cookA / def.cook, b = cookB / def.cook;
  const raw = Math.min(a, b);
  const burnt = Math.max(a, b);
  if (burnt > 1 + def.burn / def.cook) return { level: 4, label: 'Kömür oldu' };
  if (burnt > 1 + (def.burn / def.cook) * 0.5) return { level: 3, label: 'Biraz yanık' };
  if (raw >= 1) return { level: 2, label: 'Tam kıvamında' };
  if (raw >= 0.5) return { level: 1, label: 'Az pişmiş' };
  return { level: 0, label: 'Çiğ' };
}

// ---------------------------------------------------------------- İÇECEK
export type GlassType = 'cay' | 'fincan' | 'kupa' | 'bardak' | 'rakı' | 'bira' | 'sarap' | 'viski' | 'kokteyl' | 'highball' | 'sise_su' | 'kutu';
export interface DrinkDef { id: string; name: string; price: number; alcohol: number; glass: GlassType; color: number; sips: number; bottle?: boolean; hot?: boolean; desc: string }
export const DRINKS: DrinkDef[] = [
  { id: 'cay', name: 'Türk Çayı', price: 5, alcohol: 0, glass: 'cay', color: 0x9c2f0e, sips: 3, hot: true, desc: 'İnce belli bardakta tavşan kanı.' },
  { id: 'turkkahvesi', name: 'Türk Kahvesi', price: 15, alcohol: 0, glass: 'fincan', color: 0x2b1a10, sips: 3, hot: true, desc: 'Köpüklü, yanında su ile.' },
  { id: 'filtre', name: 'Filtre Kahve', price: 18, alcohol: 0, glass: 'kupa', color: 0x3a2214, sips: 4, hot: true, desc: 'Büyük kupa, sabah keyfi.' },
  { id: 'su', name: 'Su', price: 2, alcohol: 0, glass: 'sise_su', color: 0xcfefff, sips: 3, desc: 'Ayıltır, serinletir.' },
  { id: 'ayran', name: 'Ayran', price: 6, alcohol: 0, glass: 'bardak', color: 0xf6f4ee, sips: 3, desc: 'Köpüklü yayık ayranı.' },
  { id: 'kola', name: 'Kola', price: 10, alcohol: 0, glass: 'kutu', color: 0xc8202a, sips: 3, desc: 'Buz gibi.' },
  { id: 'gazoz', name: 'Gazoz', price: 8, alcohol: 0, glass: 'kutu', color: 0x2e9a4a, sips: 3, desc: 'Eski usul gazoz.' },
  { id: 'limonata', name: 'Limonata', price: 12, alcohol: 0, glass: 'highball', color: 0xf5e98a, sips: 4, desc: 'Bahçe limonundan.' },
  { id: 'portakalsuyu', name: 'Portakal Suyu', price: 12, alcohol: 0, glass: 'highball', color: 0xffa21f, sips: 4, desc: 'Taze sıkım.' },
  { id: 'meyvesuyu', name: 'Vişne Suyu', price: 10, alcohol: 0, glass: 'highball', color: 0x7a1030, sips: 4, desc: 'Meyve suyu.' },
  { id: 'soguk_kahve', name: 'Soğuk Kahve', price: 20, alcohol: 0, glass: 'highball', color: 0x8a5a35, sips: 4, desc: 'Buzlu latte.' },
  { id: 'mocktail', name: 'Alkolsüz Kokteyl', price: 20, alcohol: 0, glass: 'kokteyl', color: 0xff6f91, sips: 4, desc: 'Nane, misket limonu, keyif.' },
  // ---- Yetişkin içerik (tamamen sanal, oyun içi para ile) ----
  { id: 'bira', name: 'Bira', price: 25, alcohol: 0.55, glass: 'bira', color: 0xf0b42a, sips: 4, bottle: true, desc: 'Soğuk bira, köpüklü.' },
  { id: 'sarap', name: 'Şarap', price: 35, alcohol: 0.7, glass: 'sarap', color: 0x6a0f22, sips: 4, bottle: true, desc: 'Ege bağlarından kırmızı.' },
  { id: 'raki', name: 'Rakı', price: 40, alcohol: 0.9, glass: 'rakı', color: 0xf3f1ea, sips: 4, bottle: true, desc: 'Su katınca beyazlaşır, muhabbet koyulaşır.' },
  { id: 'viski', name: 'Viski', price: 50, alcohol: 0.95, glass: 'viski', color: 0xb5701c, sips: 3, bottle: true, desc: 'Tek buz.' },
  { id: 'kokteyl', name: 'Kokteyl', price: 45, alcohol: 0.8, glass: 'kokteyl', color: 0x37b6e0, sips: 4, desc: 'Mavi lagün.' },
  { id: 'cintonik', name: 'Cin Tonik', price: 40, alcohol: 0.75, glass: 'highball', color: 0xe8f6f2, sips: 4, desc: 'Limon dilimli.' },
];
export const isAlcohol = (id: string) => (DRINKS.find(d => d.id === id)?.alcohol ?? 0) > 0;

// Sarhoşluk seviyeleri (tamamen sanal oyun mekaniği)
export const TIPSY_LEVELS = [
  { min: 0, name: 'Normal' },
  { min: 1.2, name: 'Hafif keyifli' },
  { min: 2.6, name: 'Neşeli' },
  { min: 4.2, name: 'Sarhoş' },
  { min: 6.0, name: 'Aşırı sarhoş' },
];
export const TIPSY_MAX = 8;
export function tipsyLevel(v: number) { let l = 0; for (let i = 0; i < TIPSY_LEVELS.length; i++) if (v >= TIPSY_LEVELS[i].min) l = i; return l; }

// ---------------------------------------------------------------- MEYVE
export interface FruitDef { id: string; name: string; color: number; sell: number; size: number }
export const FRUITS: FruitDef[] = [
  { id: 'portakal', name: 'Portakal', color: 0xff8a1a, sell: 4, size: 0.09 },
  { id: 'limon', name: 'Limon', color: 0xf3e03b, sell: 3, size: 0.07 },
  { id: 'mandalina', name: 'Mandalina', color: 0xff9f2e, sell: 3, size: 0.07 },
  { id: 'incir', name: 'İncir', color: 0x5b2c4f, sell: 5, size: 0.06 },
  { id: 'nar', name: 'Nar', color: 0xb3172a, sell: 6, size: 0.09 },
  { id: 'zeytin', name: 'Zeytin', color: 0x3e4a1e, sell: 2, size: 0.025 },
  { id: 'uzum', name: 'Üzüm', color: 0x5a2a6e, sell: 4, size: 0.1 },
];

// ---------------------------------------------------------------- KOZMETİK
export interface CosmeticDef { id: string; slot: 'hair' | 'top' | 'bottom' | 'hat' | 'glasses' | 'shoes' | 'acc'; name: string; price: number }
export const COSMETICS: CosmeticDef[] = [
  { id: 'hair_kisa', slot: 'hair', name: 'Kısa', price: 0 }, { id: 'hair_uzun', slot: 'hair', name: 'Uzun', price: 0 },
  { id: 'hair_topuz', slot: 'hair', name: 'Topuz', price: 0 }, { id: 'hair_kivircik', slot: 'hair', name: 'Kıvırcık', price: 0 },
  { id: 'hair_kel', slot: 'hair', name: 'Kel', price: 0 }, { id: 'hair_atkuyrugu', slot: 'hair', name: 'At kuyruğu', price: 0 },
  { id: 'hair_dalgali', slot: 'hair', name: 'Dalgalı', price: 0 }, { id: 'hair_mohawk', slot: 'hair', name: 'Mohikan', price: 120 },
  { id: 'top_tisort', slot: 'top', name: 'Tişört', price: 0 }, { id: 'top_gomlek', slot: 'top', name: 'Keten gömlek', price: 0 },
  { id: 'top_atlet', slot: 'top', name: 'Atlet', price: 0 }, { id: 'top_hawaii', slot: 'top', name: 'Hawaii gömleği', price: 90 },
  { id: 'top_elbise', slot: 'top', name: 'Yazlık elbise', price: 0 }, { id: 'top_mayo', slot: 'top', name: 'Mayo/Bikini üstü', price: 0 },
  { id: 'top_polo', slot: 'top', name: 'Polo yaka', price: 60 }, { id: 'top_fener', slot: 'top', name: 'Çizgili denizci', price: 80 },
  { id: 'bottom_sort', slot: 'bottom', name: 'Şort', price: 0 }, { id: 'bottom_pantolon', slot: 'bottom', name: 'Keten pantolon', price: 0 },
  { id: 'bottom_mayo', slot: 'bottom', name: 'Deniz şortu', price: 0 }, { id: 'bottom_etek', slot: 'bottom', name: 'Etek', price: 0 },
  { id: 'hat_yok', slot: 'hat', name: 'Yok', price: 0 }, { id: 'hat_hasir', slot: 'hat', name: 'Hasır şapka', price: 40 },
  { id: 'hat_kep', slot: 'hat', name: 'Kep', price: 0 }, { id: 'hat_bucket', slot: 'hat', name: 'Balıkçı şapkası', price: 50 },
  { id: 'hat_fotr', slot: 'hat', name: 'Fötr', price: 120 }, { id: 'hat_kaptan', slot: 'hat', name: 'Kaptan şapkası', price: 200 },
  { id: 'glasses_yok', slot: 'glasses', name: 'Yok', price: 0 }, { id: 'glasses_gunes', slot: 'glasses', name: 'Güneş gözlüğü', price: 0 },
  { id: 'glasses_yuvarlak', slot: 'glasses', name: 'Yuvarlak', price: 45 }, { id: 'glasses_pilot', slot: 'glasses', name: 'Pilot', price: 90 },
  { id: 'shoes_terlik', slot: 'shoes', name: 'Terlik', price: 0 }, { id: 'shoes_spor', slot: 'shoes', name: 'Spor ayakkabı', price: 0 },
  { id: 'shoes_sandalet', slot: 'shoes', name: 'Sandalet', price: 30 }, { id: 'shoes_yalin', slot: 'shoes', name: 'Yalınayak', price: 0 },
  { id: 'acc_yok', slot: 'acc', name: 'Yok', price: 0 }, { id: 'acc_kolye', slot: 'acc', name: 'Nazarlık kolye', price: 35 },
  { id: 'acc_saat', slot: 'acc', name: 'Kol saati', price: 60 }, { id: 'acc_kulaklik', slot: 'acc', name: 'Kulaklık', price: 70 },
  { id: 'acc_tespih', slot: 'acc', name: 'Tespih', price: 25 },
];

export interface Look {
  gender: 'k' | 'e'; skin: number; build: number; hair: string; hairColor: number;
  top: string; topColor: number; bottom: string; bottomColor: number;
  hat: string; glasses: string; shoes: string; shoesColor: number; acc: string;
}
export const DEFAULT_LOOK: Look = {
  gender: 'e', skin: 0xd9a77e, build: 0.5, hair: 'hair_kisa', hairColor: 0x2a1c14,
  top: 'top_tisort', topColor: 0x2f80c8, bottom: 'bottom_sort', bottomColor: 0xe9dfc8,
  hat: 'hat_yok', glasses: 'glasses_yok', shoes: 'shoes_terlik', shoesColor: 0x1d1d1d, acc: 'acc_yok',
};
export const SKIN_TONES = [0xf6d6bd, 0xeec19c, 0xd9a77e, 0xc08a5f, 0x9b6a43, 0x6e4a2f, 0x4a3122];
export const PALETTE = [0xffffff, 0xe9dfc8, 0x1d1d1d, 0x2f80c8, 0x1e3a5f, 0x2e9a6a, 0xc0392b, 0xf39c12, 0xf4d03f, 0x8e44ad, 0xff7aa2, 0x00a8a8, 0x6d4c41, 0x7f8c8d];
export const HAIR_COLORS = [0x1a1210, 0x2a1c14, 0x5a3a22, 0x8a5a2b, 0xc8a165, 0xe8d5a0, 0x8f8f8f, 0xb03a2e, 0x3a6ab0];

// ---------------------------------------------------------------- EMOTE
export interface EmoteDef { id: string; name: string; icon: string; price: number; dur: number }
export const EMOTES: EmoteDef[] = [
  { id: 'kahkaha', name: 'Kahkaha', icon: '😂', price: 0, dur: 3 },
  { id: 'alkis', name: 'Alkış', icon: '👏', price: 0, dur: 3 },
  { id: 'sasirma', name: 'Şaşırma', icon: '😮', price: 0, dur: 2 },
  { id: 'aglama', name: 'Ağlama', icon: '😢', price: 0, dur: 3 },
  { id: 'kizma', name: 'Kızma', icon: '😠', price: 0, dur: 2.5 },
  { id: 'selam', name: 'Selam verme', icon: '🙋', price: 0, dur: 2 },
  { id: 'dans', name: 'Dans', icon: '💃', price: 0, dur: 8 },
  { id: 'bassalla', name: 'Baş sallama', icon: '🙂', price: 0, dur: 2 },
  { id: 'omuz', name: 'Omuz silkme', icon: '🤷', price: 0, dur: 2 },
  { id: 'elsalla', name: 'El sallama', icon: '👋', price: 0, dur: 2.5 },
  { id: 'goster', name: 'Parmakla gösterme', icon: '👉', price: 0, dur: 2 },
  { id: 'kadeh', name: 'Kadeh kaldırma', icon: '🥂', price: 0, dur: 2.5 },
  { id: 'cayikram', name: 'Çay ikram etme', icon: '🫖', price: 0, dur: 2.5 },
  { id: 'balikgoster', name: 'Balık gösterme', icon: '🐟', price: 0, dur: 3 },
  { id: 'zafer', name: 'Zafer hareketi', icon: '✌️', price: 0, dur: 2.5 },
  { id: 'uyu', name: 'Uyuma', icon: '😴', price: 0, dur: 10 },
  { id: 'telefon', name: 'Telefonla konuşma', icon: '📱', price: 0, dur: 10 },
  { id: 'sarhosdans', name: 'Sarhoş dansı', icon: '🥴', price: 0, dur: 8 },
  { id: 'zeybek', name: 'Zeybek', icon: '🦅', price: 150, dur: 8 },
  { id: 'halay', name: 'Halay', icon: '🧣', price: 150, dur: 8 },
  { id: 'robot', name: 'Robot dansı', icon: '🤖', price: 120, dur: 8 },
];

// ---------------------------------------------------------------- MOBİLYA
export interface FurnitureDef { id: string; name: string; price: number; kind: 'chair' | 'sunbed' | 'umbrella' | 'pouf' }
export const FURNITURE: FurnitureDef[] = [
  { id: 'esya_sandalye', name: 'Katlanır Sandalye', price: 40, kind: 'chair' },
  { id: 'esya_sezlong', name: 'Şezlong', price: 90, kind: 'sunbed' },
  { id: 'esya_semsiye', name: 'Plaj Şemsiyesi', price: 60, kind: 'umbrella' },
  { id: 'esya_puf', name: 'Hasır Puf', price: 35, kind: 'pouf' },
];

// ---------------------------------------------------------------- GÖREVLER
export interface QuestDef { id: string; name: string; goal: number; reward: number; stat: string }
export const QUESTS: QuestDef[] = [
  { id: 'q_ilkbalik', name: 'İlk balığını yakala', goal: 1, reward: 50, stat: 'fish' },
  { id: 'q_bestur', name: 'Beş farklı balık türü yakala', goal: 5, reward: 150, stat: 'fishTypes' },
  { id: 'q_cayikram', name: 'Arkadaşına çay ikram et', goal: 1, reward: 40, stat: 'teaGiven' },
  { id: 'q_ucpisir', name: 'Mangalda üç ürün pişir', goal: 3, reward: 60, stat: 'cooked' },
  { id: 'q_yuz', name: 'Havuzda yüz', goal: 1, reward: 30, stat: 'swim' },
  { id: 'q_besmeyve', name: 'Beş meyve topla', goal: 5, reward: 40, stat: 'fruit' },
  { id: 'q_nadir', name: 'Nadir balık yakala', goal: 1, reward: 120, stat: 'rareFish' },
  { id: 'q_birlikte', name: 'Bir arkadaşınla balık tut', goal: 1, reward: 80, stat: 'fishTogether' },
  { id: 'q_buyuk', name: 'En az 2 kg balık yakala', goal: 1, reward: 100, stat: 'bigFish' },
  { id: 'q_topluMangal', name: 'Arkadaşlarınla toplu mangal (3+ kişi aynı anda)', goal: 1, reward: 100, stat: 'groupGrill' },
];
export const CONTESTS = [
  { id: 'biggest', name: 'En büyük balık', unit: 'kg' },
  { id: 'rarest', name: 'En nadir balık', unit: 'puan' },
  { id: 'grillmaster', name: 'En iyi mangal ustası', unit: 'tam kıvam' },
  { id: 'fastest', name: 'En hızlı balık tutma', unit: 'sn' },
  { id: 'party', name: 'Sahil partisi (dans)', unit: 'dans' },
];

// ---------------------------------------------------------------- MAĞAZA
export type ShopCat = 'yiyecek' | 'icecek' | 'alkol' | 'olta' | 'yem' | 'kiyafet' | 'esya' | 'emote';
export interface ShopItem { id: string; name: string; price: number; cat: ShopCat }
export function shopItems(): ShopItem[] {
  const out: ShopItem[] = [];
  for (const f of FOODS) out.push({ id: f.id, name: f.name, price: f.price, cat: 'yiyecek' });
  for (const d of DRINKS) out.push({ id: d.id, name: d.name, price: d.price, cat: d.alcohol > 0 ? 'alkol' : 'icecek' });
  for (const r of RODS) if (r.price > 0) out.push({ id: r.id, name: r.name, price: r.price, cat: 'olta' });
  for (const b of BAITS) out.push({ id: b.id, name: b.name + ' (x5)', price: b.price * 5, cat: 'yem' });
  for (const c of COSMETICS) if (c.price > 0) out.push({ id: c.id, name: c.name, price: c.price, cat: 'kiyafet' });
  for (const f of FURNITURE) out.push({ id: f.id, name: f.name, price: f.price, cat: 'esya' });
  for (const e of EMOTES) if (e.price > 0) out.push({ id: e.id, name: e.name + ' emote', price: e.price, cat: 'emote' });
  return out;
}

// İsim çözümleyici
export function itemName(id: string): string {
  return FISH.find(f => f.id === id)?.name ?? FOODS.find(f => f.id === id)?.name ?? DRINKS.find(f => f.id === id)?.name
    ?? FRUITS.find(f => f.id === id)?.name ?? RODS.find(f => f.id === id)?.name ?? BAITS.find(f => f.id === id)?.name
    ?? FURNITURE.find(f => f.id === id)?.name ?? COSMETICS.find(f => f.id === id)?.name ?? id;
}
export function itemCategory(id: string): string {
  if (FISH.some(f => f.id === id)) return 'Balık';
  if (FOODS.some(f => f.id === id)) return 'Yiyecek';
  const d = DRINKS.find(f => f.id === id); if (d) return d.alcohol > 0 ? 'Alkollü içecek' : 'İçecek';
  if (FRUITS.some(f => f.id === id)) return 'Meyve';
  if (RODS.some(f => f.id === id)) return 'Olta';
  if (BAITS.some(f => f.id === id)) return 'Balık yemi';
  if (COSMETICS.some(f => f.id === id)) return 'Kıyafet/Aksesuar';
  return 'Diğer eşyalar';
}

// Envanter öğesi (sunucuda tutulur)
export interface InvItem { uid: string; id: string; w?: number; d?: number; sv?: number; n?: number }

/** Izgarada pişen her şeyin (yiyecek ya da balık) pişme tanımı. */
export function cookDef(id: string): { cook: number; burn: number } {
  const f = FOODS.find(x => x.id === id); if (f) return f;
  return { cook: 26, burn: 24 };
}
