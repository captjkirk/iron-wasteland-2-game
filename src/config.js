// Game data and settings. Units are metres. IW1 speeds are pixels a second; PX converts them (IW1 knight 128 px/s -> 5 m/s).
export const PX = 0.039;
export const params = new URLSearchParams(location.search);
export const SEED = Number(params.get('seed') || 20261103);

// World: about 1 km square, a height sample every 2 m.
export const WORLD = 1024, HALF = WORLD / 2, CELL = 2, SEG = WORLD / CELL, N = SEG + 1;
export const WATER_Y = 0, WAKE_RADIUS = 70;

// Quality presets: the family's computers vary. Vegetation: grass blades per m2 is 26 x grassDensity out to grassDist;
// trees are full meshes inside treeNear and baked billboards (impostors) beyond; bushes likewise at bushNear; ferns,
// reeds and flowers stop at smallDist; rocks and wrecks at propFar. Medium is the default; the choice is kept in localStorage.
// fireLights (slice 13): how many point lights the nearest fires and torches get at night (each one costs every pixel).
export const QUALITY = {
  low:    { label: 'Low',    pixelRatio: 1,   antialias: false, shadows: true, shadowSize: 1024, shadowExtent: 40,  drawDist: 380,  lod0: 110, water: 'simple', waterRes: 0,   albedoRes: 512,  anisotropy: 2, furShells: 4, fireLights: 2, grassDensity: 0.3, grassDist: 22, treeNear: 32, bushNear: 18, smallDist: 26, propFar: 220, impostorRes: 128 },
  medium: { label: 'Medium', pixelRatio: 1.5, antialias: true,  shadows: true, shadowSize: 2048, shadowExtent: 70,  drawDist: 650,  lod0: 190, water: 'mirror', waterRes: 384, albedoRes: 1024, anisotropy: 4, furShells: 10, fireLights: 3, grassDensity: 0.6, grassDist: 38, treeNear: 55, bushNear: 30, smallDist: 40, propFar: 380, impostorRes: 256 },
  high:   { label: 'High',   pixelRatio: 2,   antialias: true,  shadows: true, shadowSize: 4096, shadowExtent: 110, drawDist: 1100, lod0: 320, water: 'mirror', waterRes: 512, albedoRes: 1024, anisotropy: 8, furShells: 16, fireLights: 5, grassDensity: 1.0, grassDist: 60, treeNear: 95, bushNear: 50, smallDist: 65, propFar: 700, impostorRes: 256 },
};
function storedQuality() { try { return localStorage.getItem('iw2.quality'); } catch { return null; } }
export const QUALITY_KEY = [params.get('q'), storedQuality(), 'medium'].find(k => k && QUALITY[k]);
export const Q = QUALITY[QUALITY_KEY];
export function setQuality(key) { try { localStorage.setItem('iw2.quality', key); } catch { /* private window: the URL carries it */ }
  const p = new URLSearchParams(location.search); p.set('q', key); location.search = p.toString(); }

// The five characters, from IW1 src/constants.js CHARS (names, colours, speed, HP, kit). Slice 9's balance: slower swings,
// one target per melee blow (the Knight's cleave catches a second for half); sec is each one's IW1 secondary (F), secCd its cooldown.
// close: the Gunslinger's pistol-whip (Z, right stick click), a weaker melee blow on its own short cooldown (the owner, 2026-11-04).
export const CHARS = [
  { id:'knight',     player:'Hudson',  title:'Iron Knight',   color:0x4a6d8c, dark:0x2d4a63, speed:128, maxHp:200, atk:'melee',  dmg:30, range:2.6, cd:0.9,  cleave:2, sec:'War cry',      secCd:30, desc:'Highest HP. Sword and shield.' },
  { id:'gunslinger', player:'Zachary', title:'Gunslinger',    color:0xcc8833, dark:0x7a4a1a, speed:200, maxHp:120, atk:'ranged', dmg:14, range:0,   cd:0.5,  sec:'Fan the hammer', secCd:12, close:{ dmg:12, range:1.9, cd:0.6 }, desc:'Fastest. Revolver.' },
  { id:'architect',  player:'Jared',   title:'The Architect', color:0x3a9a55, dark:0x1a6030, speed:165, maxHp:140, atk:'melee',  dmg:22, range:2.4, cd:0.75, sec:'Auto-turret',  secCd:45, desc:'Master builder. Wrench.' },
  { id:'charmer',    player:'Lauren',  title:'The Charmer',   color:0xd988bb, dark:0x995577, speed:175, maxHp:130, atk:'ranged', dmg:14, range:0,   cd:0.7,  sec:'Charm flower', secCd:8,  desc:'Bouquet toss.' },
  { id:'ranger',     player:'Abigail', title:'The Ranger',    color:0x557733, dark:0x334422, speed:185, maxHp:120, atk:'ranged', dmg:24, range:0,   cd:0.8,  sec:'Knife strike', secCd:1.2, desc:'Bow. Scout.' },
];
// Enemies, from IW1 ENEMY_STATS (hp, speed px/s, dmg, attack interval ms, aggro px).
export const ENEMY = {
  wolf:        { hp:60,  speed:75,  dmg:6,  atk:1600, aggro:190, scale:1.0,  body:0x77777f, belly:0x9a9aa0, loot:['food','fiber'] },
  rat:         { hp:30,  speed:105, dmg:4,  atk:1200, aggro:110, scale:0.55, body:0x6a5040, belly:0x8a6a55, loot:['metal'] },
  bear:        { hp:140, speed:50,  dmg:16, atk:2400, aggro:290, scale:1.6,  body:0x5a3a24, belly:0x6e4a30, loot:['food','fiber','fiber'] },
  ice_crawler: { hp:45,  speed:130, dmg:7,  atk:1400, aggro:160, scale:0.9,  body:0x9cc4dc, belly:0xd8eef8, loot:['metal'] },
  bog_lurker:  { hp:55,  speed:55,  dmg:13, atk:2000, aggro:80,  scale:1.1,  body:0x3e5232, belly:0x5f7048, loot:['fiber','food'] },
  dust_hound:  { hp:28,  speed:118, dmg:5,  atk:1500, aggro:200, scale:0.8,  body:0xa8845a, belly:0xc8a478, loot:['food','metal'] },
  // raiders (IW1 RAIDER_STATS; shoot is the firing range in px): they hold their camps, shooters and heavies fire from range
  brawler:     { hp:130, speed:110, dmg:20, atk:1100, aggro:230, scale:1.0, loot:['metal','food','ammo'], raider:true },
  shooter:     { hp:80,  speed:90,  dmg:16, atk:1200, aggro:280, scale:1.0, loot:['metal','food','ammo'], raider:true, shoot:280 },
  heavy:       { hp:200, speed:75,  dmg:28, atk:1400, aggro:230, scale:1.0, loot:['metal','metal','food','ammo'], raider:true, shoot:200 },
};
// Biomes: IW1's seven. The start is a Greenbelt valley ringed by mountains (world.js); ruins and fungal joined in run 2.
// off/amp shape the rolling ground; mtn is how much mountain range the biome allows.
export const BIOME = {
  waste:  { off: 5,   amp: 7,   mtn: 0.35, enemies:['dust_hound','rat','rat'],           label:'The Waste' },
  grass:  { off: 6,   amp: 9,   mtn: 0.6,  enemies:['wolf','wolf','rat','bear'],         label:'Greenbelt' },
  desert: { off: 4,   amp: 5,   mtn: 0.25, enemies:['dust_hound','dust_hound'],          label:'Glass Desert' },
  tundra: { off: 14,  amp: 14,  mtn: 1.0,  enemies:['ice_crawler','ice_crawler','wolf'], label:'Frostline' },
  swamp:  { off: 0.6, amp: 1.4, mtn: 0.0,  enemies:['bog_lurker','rat'],                 label:'The Bog' },
  ruins:  { off: 5,   amp: 4,   mtn: 0.3,  enemies:['rat','rat','wolf','dust_hound'],    label:'The Ruins' },
  fungal: { off: 3,   amp: 6,   mtn: 0.45, enemies:['bog_lurker','rat','bog_lurker'],    label:'Fungal Hollow' },
};
export const BIOME_NAMES = Object.keys(BIOME), NB = BIOME_NAMES.length;
// The safe valley (IW1: nothing spawns inside the safe radius, a campfire heals). CAMP is the campfire.
export const SAFE_R = 118, CAMP = { x: -7, z: 7 };

// Terrain texture layers (Poly Haven CC0, see CREDITS.md): file stem, metres per tile, roughness.
export const LAYERS = [
  { name: 'grass',  tile: 9,  rough: 0.95 },
  { name: 'forest', tile: 5,  rough: 0.95 },
  { name: 'dirt',   tile: 6,  rough: 0.95 },
  { name: 'rock',   tile: 17, rough: 0.85 },
  { name: 'sand',   tile: 7,  rough: 0.9 },
  { name: 'snow',   tile: 8,  rough: 0.7 },
  { name: 'mud',    tile: 5,  rough: 0.55 },
  { name: 'paving', tile: 4,  rough: 0.9 },
  { name: 'gravel', tile: 3,  rough: 0.9 },
  { name: 'moss',   tile: 6,  rough: 0.8 },
];
