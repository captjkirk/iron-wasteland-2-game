// Where the buildings go (run 2, slice 8; split from buildings.js in slice 13c so it needs no Three.js: scripts/worlds.mjs
// plans every seed's town, landmarks and raider camps in Node and checks them). planBuildings() runs before the props are
// placed (they keep out of every footprint, and it adds the camps' scrap and the station's wrecks); buildings.js builds
// the meshes, colliders and crates from these records.
import { HALF, WATER_Y, SEED } from './config.js';
import { mulberry32 } from './noise.js';
import { groundY, biomeAt, slopeAt, isWet, canyonAt, street, reachable } from './world.js';

export const buildings = [], raiderCamps = [];
const sites = [];
export const R = mulberry32(SEED ^ 0x8b1d5); // its own stream: the props' layout stays as it was (buildings.js draws on after the plan)
export const clearOf = (x, z, pad = 0) => sites.every(s => Math.hypot(x - s.x, z - s.z) > s.r + pad);
// inside a building's walls (the gas station: its forecourt too), where no grass grows
export function indoors(x, z) { for (const b of buildings) { if (Math.abs(x - b.x) + Math.abs(z - b.z) > b.w + b.d) continue;
  const [lx, lz] = toL(b, x, z); if (Math.abs(lx) < b.w / 2 && Math.abs(lz) < b.d / 2) return true; } return false; }

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

export function planBuildings() { const adds = []; // props for props.js to place: [type, item]
  // the town: lots on the ruins' street grid (u along (0.92, 0.39)), each house facing its nearer street
  const T = findSite('ruins', 250, 30);
  if (T) { const U = T.x * 0.92 + T.z * 0.39, V = -T.x * 0.39 + T.z * 0.92, lots = [];
    for (let bu = -2; bu <= 1; bu++) for (let bv = -2; bv <= 1; bv++) for (const ou of [8.5, 25.5]) for (const ov of [8.5, 25.5]) {
      const u = (Math.floor(U / 34) + bu) * 34 + ou, v = (Math.floor(V / 34) + bv) * 34 + ov, x = u * 0.92 - v * 0.39, z = u * 0.39 + v * 0.92;
      if (Math.hypot(x - T.x, z - T.z) < 62) lots.push({ x, z, u, v, d: Math.hypot(x - T.x, z - T.z) }); }
    lots.sort((p, q) => p.d - q.d);
    let roofed = 0, n = 0;
    for (const L of lots) { if (biomeAt(L.x, L.z) !== 'ruins' || !level(L.x, L.z, 5, WATER_Y + 1, 0.25) || !clearOf(L.x, L.z, 4)) continue;
      // the door faces the nearer street line (a tie, as every lot has, goes either way)
      const alongU = R() < 0.5, line = alongU ? Math.round(L.u / 34) * 34 - L.u : Math.round(L.v / 34) * 34 - L.v, s = Math.sign(line) || 1;
      const D = alongU ? [0.92 * s, 0.39 * s] : [-0.39 * s, 0.92 * s], a = Math.atan2(D[0], -D[1]);
      if (n === 0) bld('tower', L.x, L.z, a, { w: 6, d: 6, h: 11.5, t: 0.7, mat: 'brick', ruin: 0.3 });
      else if (n > 15) break;
      else if (R() < 0.2) { for (let k = 0; k < 4; k++) adds.push(['ruinwall', { x: L.x + (R() - 0.5) * 9, z: L.z + (R() - 0.5) * 9, s: 0.9 + R() * 0.3, ry: a + (k % 2) * Math.PI / 2, v: k % 2 }]); continue; } // a lot gone to bare wall stubs
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
  for (const [bio, o] of LANDMARKS) { const s = findSite(bio, 250, 7, o.minY); if (s) bld('house', s.x, s.z, R() * 6.283, { ...o, biome: bio }); }
  // raider camps (IW1: brawlers, shooters and heavies round a fire, the cache locked while any of them lives)
  for (const [bio, crew] of [['waste', ['brawler', 'brawler', 'shooter']], ['ruins', ['brawler', 'shooter', 'heavy']], ['desert', ['shooter', 'brawler', 'heavy', 'shooter']]]) {
    // (slice 13c: if a generated world's own biome has no room left, even at a second look, one of the other dry lands)
    const s = findSite(bio, 260, 12) || ['waste', 'desert', 'ruins'].filter(q => q !== bio).map(q => findSite(q, 260, 12)).find(Boolean);
    if (!s) continue; const c = { id: raiderCamps.length, x: s.x, z: s.z, raiders: crew, a0: R() * 6.283 };
    raiderCamps.push(c); sites.push({ x: s.x, z: s.z, r: 14 });
    for (let k = 0; k < 11; k++) { const a = c.a0 + k * 0.57; if (k === 3 || k === 8) continue; // a scrap barricade with two ways in
      adds.push(['scrap', { x: s.x + Math.cos(a) * 11.5, z: s.z + Math.sin(a) * 11.5, s: 1 + R() * 0.3, ry: a, v: k % 6 }]); }
    adds.push(['hulk', { x: s.x + Math.cos(c.a0 + 1.71) * 15.5, z: s.z + Math.sin(c.a0 + 1.71) * 15.5, s: 1, ry: c.a0, v: 0 }]); }
  for (const [, it] of adds) it.y = groundY(it.x, it.z) - 0.1;
  return adds;
}

