// Where the buildings go (run 2, slice 8; split from buildings.js in slice 13c so it needs no Three.js: scripts/worlds.mjs
// plans every seed's town, landmarks and raider camps in Node and checks them). planBuildings() runs before the props are
// placed (they keep out of every footprint, and it adds the camps' scrap and the station's wrecks); buildings.js builds
// the meshes, colliders and crates from these records.
import { HALF, WATER_Y, SEED, CLASSIC, ENEMY } from './config.js';
import { mulberry32 } from './noise.js';
import { groundY, biomeAt, slopeAt, isWet, canyonAt, street, reachable, lakes, islands } from './world.js';

export const buildings = [], raiderCamps = [], places = [];
const sites = [];
export const R = mulberry32(SEED ^ 0x8b1d5); // its own stream: the props' layout stays as it was (buildings.js draws on after the plan)
export const clearOf = (x, z, pad = 0) => sites.every(s => Math.hypot(x - s.x, z - s.z) > s.r + pad);
// inside a building's walls (the gas station: its forecourt too), where no grass grows
export function indoors(x, z) { for (const b of buildings) { if (Math.abs(x - b.x) + Math.abs(z - b.z) > b.w + b.d) continue;
  const [lx, lz] = toL(b, x, z); if (Math.abs(lx - (b.cx || 0)) < b.w / 2 && Math.abs(lz - (b.cz || 0)) < b.d / 2) return true; } return false; } // (cx, cz: a house kind's footprint, porch and all, off its frame's middle)

// ── Planning: where things go (data only, before the props) ─────────────────────────────────────────────────────
// level, dry, open ground of radius r around (x, z)
// (slice 13c: and ground a player can walk to from the camp, so no generated world hides a town on a cliff-girt mesa)
function level(x, z, r, minY = WATER_Y + 1, tol = 0.12) { const y0 = groundY(x, z); if (y0 < minY || y0 > 60 || slopeAt(x, z) > 0.2 || !reachable(x, z)) return false;
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (Math.abs(groundY(px, pz) - y0) > Math.max(0.6, r * tol) || isWet(px, pz) || canyonAt(px, pz) > 0.3) return false; } return true; }
const deep = (x, z, b, r) => [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([a, c]) => biomeAt(x + a, z + c) === b);
// the nearest such spot to the centre, at least minR out, in biome b, well clear of everything planned so far
// (slice 13c: a generated world with no such spot gets a second, looser look: nearer the biome's edge, closer to its
// neighbours and 20 m nearer in; the classic world finds every site on the first)
function findSite(b, minR, r, minY, loose = false) { let best = null, bd = 1e9; const edge = loose ? r + 4 : r + 12, gap = loose ? r + 14 : r + 30, mr = loose ? minR - 20 : minR;
  for (let z = -HALF + 70; z < HALF - 70; z += 8) for (let x = -HALF + 70; x < HALF - 70; x += 8) { const d = Math.hypot(x, z);
    if (d < mr || d >= bd || !deep(x, z, b, edge) || !clearOf(x, z, gap) || !level(x, z, r, minY)) continue; best = { x, z }; bd = d; }
  return best || (loose ? null : findSite(b, minR, r, minY, true)); }
// a building record: its frame (heading a: local +x is world (cos a, sin a), local -z is its front), footprint and parts
function bld(kind, x, z, a, o) { const b = { kind, x, z, a, ca: Math.cos(a), sa: Math.sin(a), y: groundY(x, z), seed: R() * 100, doors: [], walls: [], ...o };
  buildings.push(b); sites.push({ x, z, r: Math.hypot(b.w, b.d) / 2 + 1.5 }); return b; }
export const toW = (b, lx, lz) => [b.x + lx * b.ca - lz * b.sa, b.z + lx * b.sa + lz * b.ca];
export const toL = (b, x, z) => { const dx = x - b.x, dz = z - b.z; return [dx * b.ca + dz * b.sa, -dx * b.sa + dz * b.ca]; };

// ── House kinds (slice 36, #68 and #71). Jared, November 14, 2026: "I feel like there needs to start with like 10 different kinds
// of houses, whether they are multiple stories or by levels or split levels or different layouts or whatever". Random worlds
// only: the classic world (seed 20261103) keeps its houses. Each kind's footprint in its frame (x0..x1, z0..z1, its front at -z:
// porch, steps and carport included); houses.js builds them. The town takes the town kinds in turn, the biggest first, each where
// it fits; the Greenbelt, Frostline, Glass Desert and Bog landmarks are the farmhouse, the A-frame, the courtyard house and the
// stilt house
export const KINDS = { farmhouse: [-5.8, 5.6, -8.0, 4.8], splitlevel: [-5.6, 5.6, -6.1, 4.3], ranch: [-5.8, 5.25, -4.7, 6.8], aframe: [-3.9, 3.9, -7.3, 4.9], rowhouses: [-7.1, 7.1, -5.4, 5.3],
  shop: [-4.7, 6.35, -6.2, 6.0], stilt: [-3.95, 3.95, -7.8, 3.5], courtyard: [-6.6, 6.6, -7.0, 6.6], townhouse: [-3.5, 3.5, -5.5, 5.4], trailer: [-7.3, 8.1, -4.5, 2.0] };
const TOWN_KINDS = ['ranch', 'rowhouses', 'splitlevel', 'shop', 'townhouse', 'trailer', 'farmhouse'];
const reach = (k) => { const [x0, x1, z0, z1] = KINDS[k]; return Math.hypot(x1 - x0, z1 - z0) / 2; }; // half its footprint's diagonal
// a kind at (x, z) heading a: its floor level is the highest ground under its footprint (the stilt house's 1.9 m above it), its
// record carries its footprint (w, d, cx, cz) and keeps the site clear to its farthest corner
function kindAt(style, x, z, a, o = {}) { const [x0, x1, z0, z1] = KINDS[style], cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ca = Math.cos(a), sa = Math.sin(a); // (its frame set back so the footprint's middle is on (x, z))
  x -= cx * ca - cz * sa; z -= cx * sa + cz * ca; const b = bld('house', x, z, a, { style, w: x1 - x0, d: z1 - z0, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, h: 3, mat: 'wall', ruin: 0, roof: 'kind', ...o });
  Object.assign(sites.at(-1), { x: x + cx * ca - cz * sa, z: z + cx * sa + cz * ca, r: reach(style) + 1.6 }); let g = -1e9;
  for (let u = 0; u <= 1; u += 0.25) for (let v = 0; v <= 1; v += 0.25) { const [wx, wz] = toW(b, x0 + 0.6 + (x1 - x0 - 1.2) * u, z0 + 0.6 + (z1 - z0 - 1.2) * v); g = Math.max(g, groundY(wx, wz)); }
  b.ground = g; b.y = g + (style === 'stilt' ? 1.9 : 0.15); return b; }

export function planBuildings() { const adds = []; // props for props.js to place: [type, item]
  // the town: lots on the ruins' street grid (u along (0.92, 0.39)), each house facing its nearer street
  const T = findSite('ruins', 250, 30);
  if (T) { const U = T.x * 0.92 + T.z * 0.39, V = -T.x * 0.39 + T.z * 0.92, lots = [];
    for (let bu = -2; bu <= 1; bu++) for (let bv = -2; bv <= 1; bv++) for (const ou of [8.5, 25.5]) for (const ov of [8.5, 25.5]) {
      const u = (Math.floor(U / 34) + bu) * 34 + ou, v = (Math.floor(V / 34) + bv) * 34 + ov, x = u * 0.92 - v * 0.39, z = u * 0.39 + v * 0.92;
      if (Math.hypot(x - T.x, z - T.z) < 62) lots.push({ x, z, u, v, d: Math.hypot(x - T.x, z - T.z) }); }
    lots.sort((p, q) => p.d - q.d);
    let roofed = 0, n = 0, tk = 0;
    for (const L of lots) { if (biomeAt(L.x, L.z) !== 'ruins' || !level(L.x, L.z, 5, WATER_Y + 1, 0.25) || !clearOf(L.x, L.z, 4)) continue;
      // the door faces the nearer street line (a tie, as every lot has, goes either way)
      const alongU = R() < 0.5, line = alongU ? Math.round(L.u / 34) * 34 - L.u : Math.round(L.v / 34) * 34 - L.v, s = Math.sign(line) || 1;
      const D = alongU ? [0.92 * s, 0.39 * s] : [-0.39 * s, 0.92 * s], a = Math.atan2(D[0], -D[1]);
      if (n === 0) bld('tower', L.x, L.z, a, { w: 6, d: 6, h: 11.5, t: 0.7, mat: 'brick', ruin: 0.3 });
      else if (n > 15) break;
      else if (R() < 0.2) { for (let k = 0; k < 4; k++) adds.push(['ruinwall', { x: L.x + (R() - 0.5) * 9, z: L.z + (R() - 0.5) * 9, s: 0.9 + R() * 0.3, ry: a + (k % 2) * Math.PI / 2, v: k % 2 }]); if (!CLASSIC) sites.push({ x: L.x, z: L.z, r: 7 }); continue; } // a lot gone to bare wall stubs (slice 36: kept clear of, in a random world, so no house's door opens onto them)
      else if (!CLASSIC && (() => { for (let j = 0; j < TOWN_KINDS.length; j++) { const k = TOWN_KINDS[(tk + j) % TOWN_KINDS.length], r = reach(k);
        if (!level(L.x, L.z, r - 1.5, WATER_Y + 1, 0.25) || !clearOf(L.x, L.z, r + 2.0)) continue; /* (room between neighbours: no window looks onto a wall a hand's width away) */ kindAt(k, L.x, L.z, a); tk += j + 1; return true; } return false; })()) {} // (slice 36: a kind, the next in turn that fits the lot)
      else { const intact = roofed < 2 || (roofed < 3 && R() < 0.3); if (intact) roofed++;
        bld('house', L.x, L.z, a, { w: 6.5 + R() * 2, d: 5.5 + R() * 1.6, h: 3 + R() * 0.6, mat: R() < 0.3 ? 'plaster' : 'wall', ruin: intact ? 0 : 0.35 + R() * 0.55, roof: intact ? 'gable' : 'fallen', furnish: intact ? 'home' : 'rubble' }); }
      n++; }
    const town = { x: T.x, z: T.z, rubble: [] }; // rubble heaps along the streets
    for (let k = 0; k < 40 && town.rubble.length < 14; k++) { const x = T.x + (R() - 0.5) * 90, z = T.z + (R() - 0.5) * 90; if (street(x, z) > 0.5 && clearOf(x, z, 2) && biomeAt(x, z) === 'ruins') town.rubble.push({ x, z, s: 0.6 + R() * 0.8 }); }
    buildings.town = town; }
  // landmarks, one per biome: the gas station is IW1's (structures.js: garage with loot, pumps under a canopy, a wreck each side)
  const gs = findSite('waste', 250, 13);
  if (gs) { const b = bld('gas', gs.x, gs.z, R() * 6.283, { w: 18, d: 20 });
    for (const sx of [-1, 1]) { const [x, z] = toW(b, sx * 8.4, -4); adds.push(['hulk', { x, z, s: 1, ry: b.a + sx * 0.4, v: sx > 0 ? 1 : 2 }]); } }
  const LANDMARKS = [ // biome: the house it gets
    ['tundra', { w: 5.5, d: 5, h: 2.7, mat: 'wall', ruin: 0, roof: 'gable', tint: 0xe4ecf2, furnish: 'home' }],
    ['desert', { w: 7, d: 6, h: 3.2, mat: 'plaster', ruin: 0.3, roof: 'flat', furnish: 'rubble' }],
    ['swamp', { w: 5, d: 4.6, h: 2.6, mat: 'planks', ruin: 0, roof: 'gable', tint: 0x7a7266, furnish: 'home', minY: WATER_Y + 0.5 }],
    ['grass', { w: 8, d: 6, h: 3, mat: 'wall', ruin: 0, roof: 'gable', furnish: 'home' }],
    ['fungal', { w: 6.5, d: 6, h: 3.2, mat: 'wall', ruin: 0.6, roof: 'fallen', moss: true, furnish: 'rubble' }],
  ];
  const LAND_KINDS = { grass: 'farmhouse', tundra: 'aframe', desert: 'courtyard', swamp: 'stilt' }; // (slice 36, random worlds; where a kind finds no room, the old house)
  for (const [bio, o] of LANDMARKS) { const k = !CLASSIC && LAND_KINDS[bio], ks = k && findSite(bio, 250, reach(k), o.minY), s = ks || findSite(bio, 250, 7, o.minY);
    if (ks) kindAt(k, s.x, s.z, R() * 6.283, { biome: bio }); else if (s) bld('house', s.x, s.z, R() * 6.283, { ...o, biome: bio }); }
  // raider camps (IW1: brawlers, shooters and heavies round a fire, the cache locked while any of them lives)
  for (const [bio, crew] of [['waste', ['brawler', 'brawler', 'shooter']], ['ruins', ['brawler', 'shooter', 'heavy']], ['desert', ['shooter', 'brawler', 'heavy', 'shooter']]]) {
    // (slice 13c: if a generated world's own biome has no room left, even at a second look, one of the other dry lands)
    const s = findSite(bio, 260, 12) || ['waste', 'desert', 'ruins'].filter(q => q !== bio).map(q => findSite(q, 260, 12)).find(Boolean);
    if (!s) continue; const c = { id: raiderCamps.length, x: s.x, z: s.z, raiders: crew, a0: R() * 6.283 };
    raiderCamps.push(c); sites.push({ x: s.x, z: s.z, r: 14 });
    for (let k = 0; k < 11; k++) { const a = c.a0 + k * 0.57; if (k === 3 || k === 8) continue; // a scrap barricade with two ways in
      adds.push(['scrap', { x: s.x + Math.cos(a) * 11.5, z: s.z + Math.sin(a) * 11.5, s: 1 + R() * 0.3, ry: a, v: k % 6 }]); }
    adds.push(['hulk', { x: s.x + Math.cos(c.a0 + 1.71) * 15.5, z: s.z + Math.sin(c.a0 + 1.71) * 15.5, s: 1, ry: c.a0, v: 0 }]); }
  if (!CLASSIC) planPlaces(adds);
  for (const [, it] of adds) it.y = groundY(it.x, it.z) - 0.1;
  return adds;
}

// ── Places worth going to (slice 23, #52). Jared, November 14, 2026: "there really weren't many unique points of interest (like
// IW1 had the radio tower for instance)". Each has something to see, something guarding it and something to win, names itself
// on screen the first time a player arrives, and is logged then (src/places.js runs them). Random worlds only: the classic
// world (the checks' own) stays as it was. A place: { kind, name, x, z, r (you have arrived inside r), guards (creature
// types that keep to it), and what its kind needs }; the meshes, colliders and crates are buildings.js's
// The radio tower's guards are spiders (IW1's, slice 22, #51): until that creature is in the game the Ruins' own stand in,
// and the moment it is (any creature whose name says spider), they are spiders, with no change here
const SPIDER = Object.keys(ENEMY).find(k => /spider/.test(k));
// the nearest spot beyond minR that suits, clear of everything planned by gap, that a player can reach (a place whose ground
// findSite's level test is too strict for: the barge on its shore, a second building in a land that already has one)
function spot(ok, minR, gap) { let best = null, bd = 1e9;
  for (let z = -HALF + 70; z < HALF - 70; z += 6) for (let x = -HALF + 70; x < HALF - 70; x += 6) { const d = Math.hypot(x, z);
    if (d < minR || d >= bd || !clearOf(x, z, gap) || !reachable(x, z) || !ok(x, z)) continue; best = { x, z }; bd = d; } return best; }
function planPlaces(adds) {
  const CLEAR = { radio: 20, plane: 27, shrooms: 13, outpost: 13, barge: 18, island: 11 }; // (props keep this far off the middle: no hoodoo hides the mast)
  const place = (kind, name, x, z, r, o = {}) => { const p = { kind, name, x, z, r, guards: [], seen: false, reached: false, heard: false, ...o }; places.push(p); if (CLEAR[kind]) sites.push({ x, z, r: CLEAR[kind] }); return p; };
  // the radio tower: a 30 m lattice mast on the Ruins' edge with the radio shack at its foot (IW1: hold Interact 10 s)
  const rs = findSite('ruins', 260, 9) || findSite('waste', 260, 9) || findSite('desert', 260, 9);
  if (rs) { const b = bld('radio', rs.x, rs.z, R() * 6.283, { w: 7, d: 7 }), [sx, sz] = toW(b, 0, 7.5); // the radio shack, its door toward the mast
    const sh = bld('house', sx, sz, b.a, { w: 4.4, d: 3.6, h: 2.6, mat: 'planks', ruin: 0, roof: 'gable', tint: 0x4e5a52, furnish: 'radio' }), [x, z] = toW(sh, 0, sh.d / 2 - 1);
    place('radio', 'The Radio Tower', rs.x, rs.z, 16, { b, shack: sh, radio: { x, z }, guards: SPIDER ? [SPIDER, SPIDER, SPIDER] : ['wolf', 'dust_hound', 'rat', 'rat'] }); }
  // the crashed plane: an airliner broken in three in the Waste or the Glass Desert, dust hounds nesting in the wreck (at real scale,
  // 38 m long with 34 m of wing: the footprint holds the pieces, the debris and the furrow's start; the furrow runs on back along
  // the frame's +z, kept clear of rocks too)
  const ps = findSite('waste', 280, 18) || findSite('desert', 280, 18) || spot((x, z) => groundY(x, z) > WATER_Y + 1 && slopeAt(x, z) < 0.25 && ['waste', 'desert', 'ruins'].some(q => deep(x, z, q, 14)), 220, 32);
  if (ps) { const b = bld('plane', ps.x, ps.z, R() * 6.283, { w: 38, d: 50 }); place('plane', 'The Crashed Plane', ps.x, ps.z, 26, { b, guards: ['dust_hound', 'dust_hound', 'dust_hound', 'dust_hound'] });
    for (const lz of [36, 48, 60]) { const [x, z] = toW(b, -1 + 1.4 * Math.sin((lz - 8) / 30), lz); sites.push({ x, z, r: 6 }); } }
  // the frozen outpost: a snowed-in polar research station in the Frostline with a heater that mends, ice crawlers round it
  const os = findSite('tundra', 250, 8) || spot((x, z) => groundY(x, z) > WATER_Y + 1 && slopeAt(x, z) < 0.3 && deep(x, z, 'tundra', 8), 220, 16);
  if (os) { const b = bld('house', os.x, os.z, R() * 6.283, { w: 8, d: 6, h: 2.8, mat: 'paint', ruin: 0, roof: 'gable', tint: 0xeef3f7, furnish: 'outpost' }), [x, z] = toW(b, b.w / 2 - 1.6, b.d / 2 - 1.4); // (slice 23 polish: an 8 x 6 m red hut; the heater is buildings.js's stove, the same spot)
    place('outpost', 'The Frozen Outpost', os.x, os.z, 14, { b, heater: { x, z, r: 3.2 }, guards: ['ice_crawler', 'ice_crawler', 'ice_crawler'] }); }
  // the sunken barge: a 28 m river cargo barge run aground on the Bog's edge, its bow sunk in the water and its stern up the
  // bank, its cargo in the shallows (polish, Jared, November 14, 2026: "the same sort of scale and quality/detail check")
  // A barge needs its length of shore: of 24 headings, the one whose bow (13 m ahead) is lowest, its stern (13 m behind) up the
  // bank but no more than a few metres, level across its beam; it fits if that bow is down in the water
  const lie = (x, z) => { const y = groundY(x, z); let best = null;
    for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12, fx = Math.sin(a), fz = -Math.cos(a), at = (s, t) => groundY(x + fx * s - fz * t, z + fz * s + fx * t);
      const bow = Math.max(at(13, 0), at(11, 3), at(11, -3)), stern = at(-13, 0), cross = Math.abs(at(0, 4) - at(0, -4)) + Math.abs(at(-9, 4) - at(-9, -4));
      const sc = bow - 0.4 * Math.min(stern - y, 2.5) + cross + (stern - y > 3.2 ? 4 : 0); if (!best || sc < best.sc) best = { a, sc, bow, stern, cross, y }; } return best; };
  const fits = (x, z) => { const o = lie(x, z); return o.bow < WATER_Y + 0.4 && o.stern - o.y < 3.2 && o.cross < 2; };
  const shallow = (lo, hi) => (x, z) => { const y = groundY(x, z); return y >= WATER_Y + lo && y <= WATER_Y + hi && slopeAt(x, z) < 0.3; };
  const bs = spot((x, z) => shallow(-0.5, 0.5)(x, z) && deep(x, z, 'swamp', 16) && fits(x, z), 250, 30) || spot((x, z) => shallow(-0.8, 0.9)(x, z) && deep(x, z, 'swamp', 6) && fits(x, z), 230, 24)
    || spot((x, z) => shallow(-0.6, 0.4)(x, z) && biomeAt(x, z) !== 'swamp' && fits(x, z), 230, 24) // (a Bog with no shore: aground on a lake's edge)
    || spot((x, z) => shallow(-0.8, 0.9)(x, z) && deep(x, z, 'swamp', 5), 230, 20) || spot((x, z) => shallow(-0.6, 0.4)(x, z), 230, 20); // (and if no shore fits it whole, any)
  if (bs) { R(); const a = lie(bs.x, bs.z).a; // (its front, local -z, the bow down into the water; R() still drawn: what follows is as it was)
    const b = bld('barge', bs.x, bs.z, a, { w: 8, d: 30, wl: WATER_Y + (biomeAt(bs.x, bs.z) === 'swamp' ? 0.62 : 0) }); // (wl: the water it sinks in, the Bog's table or a lake's)
    place('barge', 'The Sunken Barge', bs.x, bs.z, 18, { b, guards: ['bog_lurker', 'bog_lurker', 'rat', 'rat'] }); }
  // the mushroom ring: giant glowing caps round a clearing in the Fungal Hollow, climbable as a stair; a spore cloud hangs in the
  // middle (it hurts on the ground) over the rare loot on the middle cap
  const ms = findSite('fungal', 250, 12) || spot((x, z) => groundY(x, z) > WATER_Y + 1 && slopeAt(x, z) < 0.25 && deep(x, z, 'fungal', 12), 220, 20);
  if (ms) { const b = bld('shrooms', ms.x, ms.z, R() * 6.283, { w: 20, d: 20 }); place('shrooms', 'The Mushroom Ring', ms.x, ms.z, 13, { b, spore: 5, guards: ['bog_lurker', 'bog_lurker', 'rat'] }); }
  // the crater lakes (world.js shapes them): a chest at the bottom, the Thing in the deep in the water
  lakes.filter(l => l.crater).forEach((l, i) => place('crater', i ? 'The Little Crater' : 'The Crater Lake', l.x, l.z, l.rx * (1 + l.rw * 0.5), { lake: l, chest: { x: l.x, z: l.z } }));
  // islands: a crate on each, a wreck or a wall stub on some; the first (the biggest lake's widest) is the hermit's, his shack and his stores
  islands.forEach((s, i) => { if (!i) { const b = bld('house', s.x, s.z, R() * 6.283, { w: 5, d: 4.6, h: 2.6, mat: 'planks', ruin: 0, roof: 'gable', tint: 0x6e665c, furnish: 'home', hermit: true });
      place('island', 'The Hermit\'s Island', s.x, s.z, s.r + 6, { b });
      // (polish) a few trees round his yard, grown by props.js like any other (their own stream: nothing else moves)
      const T = mulberry32(Math.round(s.x * 7 + s.z * 13));
      for (const [type, lx, lz, h] of [['oak', -6.4, 5.4, 8], ['pine', 4.6, 6.4, 12], ['aspen', -7.6, 1.8, 9], ['bush', -7.4, -0.6, 1.8], ['bush', 2.6, 7.4, 1.5], ['bush', -2.6, 6.6, 1.3]]) {
        const [x, z] = toW(b, lx, lz); adds.push([type, { x, z, s: h * (0.92 + T() * 0.16), ry: T() * 6.283, v: Math.floor(T() * 3) }]); }
      return; }
    sites.push({ x: s.x, z: s.z, r: 2 }); s.crate = { x: s.x + (R() - 0.5) * s.r * 0.6, z: s.z + (R() - 0.5) * s.r * 0.6 };
    if (R() < 0.5) adds.push([R() < 0.5 ? 'hulk' : 'ruinwall', { x: s.x + s.r * 0.5, z: s.z - s.r * 0.3, s: 0.8, ry: R() * 6.283, v: 1 }]); });
}


