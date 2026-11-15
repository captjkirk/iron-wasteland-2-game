// Props placed by biome: trees, bushes, ferns, reeds, flowers, rocks, cacti, scrap piles, car wrecks and ruin walls.
// Each is drawn through scatter.js (instanced, distance LOD); trunks, rocks and wrecks get collision circles; props
// between the camera and the player are hidden (occluders).
import * as THREE from 'three';
import { HALF, WATER_Y, Q, CAMP, SEED } from './config.js';
import { rng, fbm, vnoise, mulberry32 } from './noise.js';
import { groundY, biomeAt, slopeAt, isWet, forestAt, canyonAt, street, PASSES, river } from './world.js';
import { rocksInWater } from './environment.js';
import { addLayer, markDirty } from './scatter.js';
import { buildTrees, SPECIES } from './trees.js';
import { rockParts, cactusParts, fernParts, reedParts, flowerParts, loadPropMeshes, scrapParts, wreckParts, wallParts, spireParts, glowcapParts, SPIRE_REACH, pebbleParts, driftwoodParts } from './propmodels.js';
import { mushroomParts, archParts } from './landmarks.js';
import { planBuildings, clearOf } from './buildings.js';
const AS = [9.4, 13]; // arch sizes: metres per unit of landmarks.js's arch (legs at +-0.85, leg radius 0.3)

export const colliders = []; const CG = 8, cgrid = new Map(); // spatial hash of circles
// a collider goes in every cell its circle touches, so a boulder wider than a cell is still found from its far side
export function addCollider(x, z, r, ref) { const c = { x, z, r, ref }; colliders.push(c);
  for (let a = Math.floor((x - r) / CG); a <= Math.floor((x + r) / CG); a++) for (let b = Math.floor((z - r) / CG); b <= Math.floor((z + r) / CG); b++) { const k = a + ',' + b; (cgrid.get(k) || cgrid.set(k, []).get(k)).push(c); }
  return c; }
// rocks carry their real footprint (radius per direction, from the mesh); everything else is a circle. With a height h, a
// rock's outline there: the outline of all of it at or above h (issue #44: bands, below)
export function colR(c, x, z, h) { if (!c.prof) return c.r; const dx = x - c.x, dz = z - c.z, cs = Math.cos(c.ry), sn = Math.sin(c.ry), n = c.prof.length;
  const f = ((Math.atan2(dx * sn + dz * cs, dx * cs - dz * sn) / (2 * Math.PI) + 1) % 1) * n, i = Math.floor(f) % n, t = f - Math.floor(f), at = (P) => (P[i] * (1 - t) + P[(i + 1) % n] * t) * c.s;
  if (h == null || !c.bands) return at(c.prof);
  const L = c.lv, B = c.bands, k = L.findLastIndex(y => y <= h); if (k < 0) return at(B[0]);
  const y1 = k + 1 < L.length ? L[k + 1] : c.peak; if (h >= c.peak) return 0; const r0 = at(B[k]), r1 = k + 1 < L.length ? at(B[k + 1]) : 0;
  return r0 + (r1 - r0) * (h - L[k]) / (y1 - L[k]); }
// issue #44 (Jared's play, 2026-11-12: "rocks having hitboxes that are weird?"): a big boulder's footprint was its widest
// outline at any height, buried part included, stood straight up to its top, and its top was flat and as wide: an
// invisible wall up to 1.7 m out from the rock you see, and a ledge in the air 2 m up at its edge. Now each rock's shape is
// measured where it stands, from its mesh as placed (scale, turn and tilt): only the part above the ground, in 8 height
// bands from the ground at its middle to its peak, each band the outline of everything at or above it. The surface a foot
// stands on (topAt) is the dome those outlines make, capped at the old stand height; the wall a walker meets (rockCol) is
// the outline at their height
function rockShape(it, geo, n = 24) { const P = geo.attributes.position, m = new THREE.Matrix4().fromArray(it.layer.elems, it.index * 16), v = new THREE.Vector3(), pts = [];
  let peak = -Infinity; for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m); if (v.y < groundY(v.x, v.z) + 0.05) continue; pts.push(v.x - it.x, v.y, v.z - it.z); peak = Math.max(peak, v.y); }
  if (!pts.length) return null; const base = Math.min(groundY(it.x, it.z), peak - 0.05), NBD = 8, lv = Array.from({ length: NBD }, (_, b) => base + (peak - base) * b / NBD), bands = lv.map(() => new Float32Array(n));
  for (let i = 0; i < pts.length; i += 3) { const dx = pts[i], y = pts[i + 1], dz = pts[i + 2], r = Math.hypot(dx, dz), k = Math.round(((Math.atan2(dz, dx) / (2 * Math.PI) + 1) % 1) * n) % n;
    for (let b = 0; b < NBD && (b === 0 || y >= lv[b]); b++) if (r > bands[b][k]) bands[b][k] = r; }
  for (const B of bands) { const has = [...B.keys()].filter(k => B[k] > 0); if (!has.length) continue; // (a band near the peak may miss a sector: filled between its neighbours)
    for (let k = 0; k < n; k++) if (!(B[k] > 0)) { let a = 1, c = 1; while (!(B[(k - a + n) % n] > 0)) a++; while (!(B[(k + c) % n] > 0)) c++; B[k] = (B[(k - a + n) % n] * c + B[(k + c) % n] * a) / (a + c); } }
  for (let b = 1; b < NBD; b++) for (let k = 0; k < n; k++) bands[b][k] = Math.min(bands[b][k], bands[b - 1][k]); // (at or above: never wider higher up)
  return { prof: bands[0], bands, lv, peak, base }; }
// the height of a rock's surface at (x, z) (its stand height for anything but a measured rock); -Infinity off it
export function topAt(c, x, z) { if (!c.bands) return c.stand; const r = Math.hypot(x - c.x, z - c.z), L = c.lv;
  if (r > colR(c, x, z, -Infinity) + 0.15) return -Infinity;
  for (let k = L.length - 1; k >= 0; k--) { const rk = colR(c, x, z, L[k]); if (rk < r && k > 0) continue; const y1 = k + 1 < L.length ? L[k + 1] : c.peak, r1 = k + 1 < L.length ? colR(c, x, z, y1) : 0;
    return Math.min(c.stand, rk <= r1 ? y1 : L[k] + (y1 - L[k]) * Math.max(0, Math.min(1, (rk - r) / (rk - r1)))); }
  return L[0]; }
// the wall a walker with feet at `feet` meets at a measured rock: on the ground, its outline above the ground; up off the
// ground (on it, or on another rock beside it), the outline of what rises above the feet (on its gentle top, within 0.5 m
// of its stand height, a step up is allowed). Walking up its steeper sides is a climb (jump at it), as before. (Still a
// prism on the ground: where a boulder leans out over a drop, its overhang is a wall down to the ground below it)
export function rockCol(c, x, z, feet) { if (feet < groundY(x, z) + 0.3) return colR(c, x, z); return colR(c, x, z, feet + (feet >= c.stand - 0.5 ? STEP : 0.02)); }
function footprint(geo, n = 24) { const p = geo.attributes.position, prof = new Float32Array(n);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), k = Math.round(((Math.atan2(z, x) / (2 * Math.PI) + 1) % 1) * n) % n; prof[k] = Math.max(prof[k], Math.hypot(x, z)); }
  return prof; }
export function nearColliders(x, z) { const out = [], gx = Math.floor(x / CG), gz = Math.floor(z / CG);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = cgrid.get((gx + a) + ',' + (gz + b)); if (l) out.push(...l); } return out; }

// what a foot can stand on at (x, z) (slice 9b): the highest top of a rock, crate or wall there, or of a roof or floor from
// `surfaces`, that is no more than `step` above the feet (y = Infinity finds the highest ledge, for climbing up)
export const STEP = 0.35, surfaces = []; // surfaces: { x, z, r, at(x, z) -> height or null }, registered by buildings.js
// a step up onto a solid's top is only for a solid that rises no more than a step from the ground at its own centre (a
// broken wall, low rubble): a crate or a rock on a slope is not stepped onto from its uphill side; from above, anything is
export const steps = (c, feet, step = STEP, top = c.stand) => feet >= top - 0.02 || (feet >= top - step && top - (c.base ??= groundY(c.x, c.z)) <= STEP);
export function standAt(x, z, y, step = STEP) { let s = -Infinity;
  for (const c of nearColliders(x, z)) { if (c.stand == null || !c.r) continue;
    if (c.bands) { const h = topAt(c, x, z); if (h > -Infinity && (y === Infinity || steps(c, y, step, h))) s = Math.max(s, h); } // (a measured rock: its surface there, issue #44)
    else if ((y === Infinity || steps(c, y, step)) && Math.hypot(c.x - x, c.z - z) < colR(c, x, z) + 0.15) s = Math.max(s, c.stand); }
  for (const f of surfaces) if (Math.abs(f.x - x) < f.r && Math.abs(f.z - z) < f.r) { const h = f.at(x, z); if (h != null && h <= y + Math.max(step, f.climb || 0)) s = Math.max(s, h); } // (climb, slice 36: a stair's, so a slow frame's long stride still goes up it)
  return s; }
// the quality pass (November 15, 2026): the floors, stairs and roofs of `surfaces`, which feet stand on, are also what a head, a
// shot and a creature meet. headroom: the lowest one over (x, z) more than 1.2 m above feet at y (a jump stops under it).
// slabAcross: is there one at (x, z) between heights y0 and y1 (a shot crossing it stops). floorAt: the house floor or deck a
// creature walks on there, one no more than 0.9 m over the ground gy (a house floor stands that far over a sloping lot), else gy
// ponytail: every surface is tested (a cheap box test each; a random world has a few hundred); a grid like the colliders' if it ever shows in a frame
const over = (x, z, fn) => { for (const f of surfaces) if (Math.abs(f.x - x) < f.r && Math.abs(f.z - z) < f.r) { const h = f.at(x, z); if (h != null) fn(h); } };
export function headroom(x, z, y) { let s = Infinity; over(x, z, (h) => { if (h > y + 1.2 && h < s) s = h; }); return s; }
export function slabAcross(x, z, y0, y1) { let hit = false; over(x, z, (h) => { if ((h - y0) * (h - y1) <= 0) hit = true; }); return hit; }
export function floorAt(x, z, gy) { let s = gy; over(x, z, (h) => { if (h > s && h <= gy + 0.9) s = h; }); return s; }

export const placed = {}; // type -> items (game.js salvages placed.scrap and placed.hulk)
const TREE_TYPES = ['pine', 'oak', 'aspen', 'snowpine', 'deadtree', 'swamptree'];
const add = (type, it) => { (placed[type] = placed[type] || []).push(it); return it; };
const dry = (x, z, y, bio) => bio === 'swamp' ? y > WATER_Y + 0.1 : (y > WATER_Y + 0.6 && !isWet(x, z));

// the world's props, decided once from the seed
function place() {
  const spawnClear = (x, z, r) => Math.hypot(x, z) < r || Math.hypot(x - CAMP.x, z - CAMP.z) < r + 7; // the start and the camp stay open
  for (const [type, it] of planBuildings()) add(type, it).keep = true; // the raider camps' scrap barricades, the gas station's wrecks, the town's bare wall stubs
  // trees: a jittered 5 m grid; forests where the forest mask is high, scattered trees elsewhere
  for (let z = -HALF + 30; z < HALF - 30; z += 5) for (let x = -HALF + 30; x < HALF - 30; x += 5) {
    const px = x + (rng() - 0.5) * 4.6, pz = z + (rng() - 0.5) * 4.6, roll = rng(), pick = rng(), sv = rng(), y = groundY(px, pz), bio = biomeAt(px, pz);
    if (spawnClear(px, pz, 9) || !dry(px, pz, y, bio) || y > 72 || slopeAt(px, pz) > 0.65) continue;
    const forest = forestAt(px, pz), stand = vnoise(px * 0.02 + 9, pz * 0.02), alpine = Math.max(0, Math.min(1, (y - 40) / 30));
    let type = null;
    if (bio === 'grass') { if (roll < 0.025 + forest * forest * 0.85) type = stand < 0.45 ? 'pine' : pick < 0.6 ? 'oak' : 'aspen'; if (type && alpine > 0.3) type = 'pine'; }
    else if (bio === 'tundra') { if (roll < (0.03 + forest * forest * 0.75) * (1 - alpine * 0.7)) type = pick < 0.08 ? 'deadtree' : 'snowpine'; }
    else if (bio === 'swamp') { if (roll < 0.13) type = pick < 0.5 ? 'deadtree' : 'swamptree'; }
    else if (bio === 'waste') { if (roll < 0.012 + forest * 0.06) type = 'deadtree'; }
    else if (bio === 'desert') { if (roll < 0.006) type = 'deadtree'; }
    else if (bio === 'ruins') { if (roll < 0.02 + forest * 0.04) type = pick < 0.55 ? 'deadtree' : 'oak'; }
    // giant mushrooms stay inside the Hollow, off its edges
    else if (bio === 'fungal') { if (roll < 0.05 + forest * 0.1 && [[14, 0], [-14, 0], [0, 14], [0, -14]].every(([a, b]) => biomeAt(px + a, pz + b) === 'fungal')) { add('shroom', { x: px, y: y - 0.2, z: pz, s: (0.75 + sv * 0.6) * 7, ry: rng() * 6.283, v: Math.floor(rng() * 3) }); continue; } if (roll > 0.985) type = 'deadtree'; }
    if (!type) continue;
    const sp = SPECIES[type], h = sp.h[0] + (sp.h[1] - sp.h[0]) * sv * (1 - alpine * 0.4);
    add(type, { x: px, y: y - 0.15, z: pz, s: h, ry: rng() * 6.283, v: Math.floor(rng() * 3) });
  }
  // undergrowth and ground props: a jittered 3 m grid
  for (let z = -HALF + 30; z < HALF - 30; z += 3) for (let x = -HALF + 30; x < HALF - 30; x += 3) {
    const px = x + (rng() - 0.5) * 2.8, pz = z + (rng() - 0.5) * 2.8, roll = rng(), pick = rng(), sv = rng(), y = groundY(px, pz), bio = biomeAt(px, pz);
    if (spawnClear(px, pz, 6) || y > 85) continue;
    const wet = isWet(px, pz), forest = forestAt(px, pz), meadow = fbm(px * 0.03 + 5, pz * 0.03, 2), sl = slopeAt(px, pz);
    // reeds along wet banks and in the bog shallows
    if ((wet || bio === 'swamp') && y > WATER_Y - 0.5 && y < WATER_Y + 1.2 && roll < (bio === 'swamp' ? 0.5 : 0.35) && bio !== 'desert') { add('reeds', { x: px, y: y - 0.05, z: pz, s: 0.8 + sv * 0.5, ry: pick * 6.283, v: Math.floor(sv * 3) }); continue; }
    if (!dry(px, pz, y, bio)) continue;
    let r = roll;
    const outcrop = Math.max(0, fbm(px * 0.025 + 31, pz * 0.025 - 7, 3) - 0.56) * 9; // rocks gather in outcrops; open ground stays clear
    const rockC = sl > 0.75 ? 0 : { grass: 0.05, tundra: 0.09, swamp: 0.02, waste: 0.09, desert: 0.08, ruins: 0.1, fungal: 0.05 }[bio] * outcrop;
    if (r < rockC) { const kind = { grass: 'rock', tundra: 'icerock', swamp: 'rock', waste: 'wasterock', desert: 'sandrock', ruins: 'wasterock', fungal: 'rock' }[bio], big = pick < 0.2 * outcrop;
      add(kind, { x: px, y: y - 0.3 - sv * 0.25, z: pz, s: big ? 1.6 + sv * sv * 4.5 : 0.25 + sv * sv * 1.2, ry: rng() * 6.283, v: Math.floor(rng() * 3), tilt: [(rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3] }); continue; }
    r -= rockC; if (sl > 0.7 || y > 72) continue;
    const bushC = { grass: 0.04 + forest * 0.05, tundra: 0.012, swamp: 0.05, waste: 0.035, desert: 0.03, ruins: 0.05, fungal: 0.012 }[bio] * (bio === 'waste' || bio === 'desert' ? 0.4 + meadow * 1.4 : 1);
    if (r < bushC) { const dryb = bio === 'waste' || bio === 'desert' || (bio === 'tundra' && pick < 0.5);
      add(dryb ? 'drybush' : 'bush', { x: px, y: y - 0.05, z: pz, s: (dryb ? SPECIES.drybush.h : SPECIES.bush.h)[0] + sv * 1.0, ry: rng() * 6.283, v: Math.floor(rng() * 3) }); continue; }
    r -= bushC;
    // glowcaps carpet the fungal floor and turn up in damp forest shade
    const glowC = bio === 'fungal' ? 0.16 + forest * 0.1 : (bio === 'swamp' || bio === 'grass') ? forest * 0.012 : 0;
    if (r < glowC) { add('glowcap', { x: px, y: y - 0.02, z: pz, s: 0.8 + sv * 1.2, ry: pick * 6.283, v: Math.floor(sv * 3) }); continue; }
    r -= glowC;
    const fernC = bio === 'grass' ? forest * 0.4 : bio === 'swamp' ? 0.12 : bio === 'fungal' ? 0.05 : bio === 'ruins' ? 0.03 : 0;
    if (r < fernC) { add('fern', { x: px, y: y - 0.02, z: pz, s: 0.7 + sv * 0.6, ry: pick * 6.283, v: Math.floor(sv * 3) }); continue; }
    r -= fernC;
    const flowerC = bio === 'grass' ? (1 - forest) * Math.max(0, meadow - 0.45) * 0.9 : bio === 'tundra' ? 0.01 : 0;
    if (r < flowerC) { add('flowers', { x: px, y: y - 0.02, z: pz, s: 0.8 + sv * 0.5, ry: rng() * 6.283, v: Math.floor(vnoise(px * 0.05, pz * 0.05) * 4) % 4 }); continue; }
    r -= flowerC;
    if (bio === 'desert' && r < 0.008 && y < 30 && ![[25, 0], [-25, 0], [0, 25], [0, -25]].some(([a, b]) => biomeAt(px + a, pz + b) === 'tundra')) { add('cactus', { x: px, y: y - 0.1, z: pz, s: 0.8 + sv * 0.6, ry: pick * 6.283, v: Math.floor(rng() * 3) }); continue; }
  }
  // salvage and ruins: a 6 m grid, as in the prototype (scrap mostly in the Waste and desert)
  for (let z = -HALF + 40; z < HALF - 40; z += 6) for (let x = -HALF + 40; x < HALF - 40; x += 6) {
    const px = x + (rng() - 0.5) * 5, pz = z + (rng() - 0.5) * 5, roll = rng(), y = groundY(px, pz), bio = biomeAt(px, pz);
    if (spawnClear(px, pz, 8) || !dry(px, pz, y, bio) || slopeAt(px, pz) > 0.35 || y > 60) continue;
    const C = { waste: [0.05, 0.012, 0.012], grass: [0.012, 0.002, 0.003], desert: [0.02, 0.008, 0.004], tundra: [0.004, 0.002, 0.002], swamp: [0.006, 0.002, 0.002], ruins: [0.03, 0.012, 0.1 + street(px, pz) * 0.25], fungal: [0.004, 0.001, 0.006] }[bio];
    if (roll < C[0]) add('scrap', { x: px, y: y - 0.12, z: pz, s: 0.85 + rng() * 0.4, ry: rng() * 6.283, v: Math.floor(rng() * 6) });
    else if (roll < C[0] + C[1]) add('hulk', { x: px, y: y - 0.05, z: pz, s: 1, ry: rng() * 6.283, v: Math.floor(rng() * 3) });
    else if (roll < C[0] + C[1] + C[2]) add('ruinwall', { x: px, y: y - 0.3, z: pz, s: 0.9 + rng() * 0.3, ry: rng() * 6.283, v: Math.floor(rng() * 2) });
  }
  // an old wreck and a scrap pile out in the valley meadow, a short walk from the camp
  add('hulk', { x: 24, y: groundY(24, -22) - 0.05, z: -22, s: 1, ry: 0.7, v: 0 }); add('scrap', { x: 30, y: groundY(30, -16) - 0.05, z: -16, s: 1, ry: 2, v: 0 });
  // landforms: sandstone hoodoos and arches in the desert, the Waste and the ruins' badlands, ice spires in the
  // Frostline, on a jittered 34 m grid where the ground is open and fairly level
  for (let z = -HALF + 50; z < HALF - 50; z += 34) for (let x = -HALF + 50; x < HALF - 50; x += 34) {
    const px = x + (rng() - 0.5) * 28, pz = z + (rng() - 0.5) * 28, roll = rng(), v = rng(), bio = biomeAt(px, pz), y = groundY(px, pz);
    if (Math.hypot(px, pz) < 200 || y < WATER_Y + 1.5 || slopeAt(px, pz) > 0.35 || isWet(px, pz)) continue;
    const kind = bio === 'tundra' ? 'icerock' : bio === 'desert' || bio === 'waste' || bio === 'ruins' ? 'sandrock' : null; if (!kind) continue;
    const pS = { desert: 0.3, waste: 0.18, ruins: 0.08, tundra: 0.14 }[bio] + canyonAt(px, pz) * 0.3, aS = { desert: 0.045, waste: 0.035, ruins: 0, tundra: 0 }[bio];
    if (roll < aS) { const ry = rng() * 6.283, vv = v < 0.5 ? 0 : 1, half = AS[vv] * 0.85, ax = Math.cos(ry) * half, az = -Math.sin(ry) * half;
      if (Math.abs(groundY(px + ax, pz + az) - groundY(px - ax, pz - az)) > 3) continue;
      add('arch', { x: px, y: Math.min(groundY(px + ax, pz + az), groundY(px - ax, pz - az), y) + 0.3, z: pz, s: (0.9 + rng() * 0.25) * AS[vv], ry, v: vv, k: kind }); }
    else if (roll < aS + pS) { const n = 1 + Math.floor(rng() * 3); for (let k = 0; k < n; k++) { const qx = px + (rng() - 0.5) * 16 * Math.min(1, k), qz = pz + (rng() - 0.5) * 16 * Math.min(1, k);
      add(kind === 'icerock' ? 'icespire' : 'spire', { x: qx, y: groundY(qx, qz) + 0.4, z: qz, s: 0.75 + rng() * 0.45, ry: rng() * 6.283, v: Math.min(2, Math.floor(rng() * 3 * (k ? 0.7 : 1))) }); } }
  }
  // slice 31 (Jared, November 14, 2026: "water that looks alive should include more variety on the shoreline"): pebbles,
  // driftwood and fallen trunks along every bank by biome (the Bog has its own), rocks breaking the waterline, and boulders out
  // in the river's deep middle, foam round each rock. Their own random stream, so everything above lies exactly as before (the
  // classic world keeps its layout). Pebbles and driftwood lie flat and are walked over (no collider: no bank becomes a wall);
  // the rocks are solid but few (about one in 30 waterline spots) and small, so a way out of the water is never far
  const boulders = [], sr = mulberry32(SEED + 31), STONE = { grass: 0, fungal: 0, ruins: 0, desert: 1, waste: 1, tundra: 2 }, ROCK = ['rock', 'sandrock', 'icerock'];
  for (let z = -HALF + 30; z < HALF - 30; z += 3) for (let x = -HALF + 30; x < HALF - 30; x += 3) {
    const px = x + (sr() - 0.5) * 2.8, pz = z + (sr() - 0.5) * 2.8, roll = sr(), sv = sr(), turn = sr(), y = groundY(px, pz), bio = biomeAt(px, pz);
    if (bio === 'swamp' || y < WATER_Y - 0.5 || y > WATER_Y + 1.6 || spawnClear(px, pz, 8) || slopeAt(px, pz) > 0.8) continue;
    const drift = { desert: 0.02, waste: 0.04 }[bio] ?? 0.15;
    if (roll < 0.035 && Math.abs(y - WATER_Y) < 0.35) { const it = { x: px, y: y - 0.3, z: pz, s: 0.55 + sv * 0.7, ry: turn * 6.283, v: Math.floor(sv * 3), tilt: [(turn - 0.5) * 0.4, (sv - 0.5) * 0.4] }; // a rock breaking the waterline (solid)
      add(ROCK[STONE[bio]], it); boulders.push(it); it.shore = true; }
    else if (roll < 0.6) add('pebbles', { x: px, y: y - 0.03, z: pz, s: 0.5 + sv * sv * 1.4, ry: turn * 6.283, v: STONE[bio] });
    else if (roll < 0.6 + drift) { const gx = groundY(px + 1, pz) - groundY(px - 1, pz), gz = groundY(px, pz + 1) - groundY(px, pz - 1); // (lying along the shore)
      const v = bio !== 'desert' && bio !== 'waste' && sv < 0.3 ? 2 : sv < 0.65 ? 0 : 1;
      add('driftwood', { x: px, y: y - [0.06, 0.08, 0.2][v], z: pz, s: 0.85 + turn * 0.3, ry: Math.atan2(-gx, -gz) + (sv - 0.5) * 0.8, v }); }
  }
  for (let k = 2; k < river.length - 2; k++) { const a = river[k - 1], b = river[k + 1], l = Math.hypot(b.x - a.x, b.z - a.z), side = (sr() - 0.5) * 12, roll = sr(), sv = sr(), turn = sr();
    const px = river[k].x - (b.z - a.z) / l * side, pz = river[k].z + (b.x - a.x) / l * side, y = groundY(px, pz);
    if (roll > 0.16 || y > WATER_Y - 1.2 || spawnClear(px, pz, 20)) continue;
    const kind = ROCK[STONE[biomeAt(px, pz)] ?? 0], it = { x: px, y: y - 0.3, z: pz, s: 1.9 + sv * 1.0, ry: turn * 6.283, v: Math.floor(sv * 3), tilt: [(turn - 0.5) * 0.3, (sv - 0.5) * 0.3] };
    add(kind, it); boulders.push(it); it.shore = true; }
  // the buildings' sites stay open: filtered after placing, so the seeded layout everywhere else is exactly slice 7's
  for (const t in placed) placed[t] = placed[t].filter(it => it.keep || clearOf(it.x, it.z, /spire|arch/.test(t) ? 3 : 2));
  // the passes are the valley's only ways out: no hoodoo, ice spire or arch stands in one before the ring ends (two
  // overlapping spires 208 m out in the desert pass made a dead end facing the valley, 2026-11-04)
  const inPass = (x, z) => { const r = Math.hypot(x, z); return r < 255 && PASSES.some(q => Math.abs(Math.atan2(Math.sin(Math.atan2(z, x) - q.a), Math.cos(Math.atan2(z, x) - q.a))) * r < 32); };
  for (const t of ['spire', 'icespire', 'arch']) if (placed[t]) placed[t] = placed[t].filter(it => !inPass(it.x, it.z));
  rocksInWater(boulders.filter(it => clearOf(it.x, it.z, 2))); // (foam round the boulders that stayed)
}

const COL = { shroom: [0.11, 0.15], pine: [0.03, 0.16], snowpine: [0.03, 0.16], oak: [0.035, 0.22], aspen: [0.02, 0.1], deadtree: [0.04, 0.12], swamptree: [0.04, 0.2],
  rock: [0.75, 0.9], icerock: [0.75, 0.9], sandrock: [0.75, 0.9], wasterock: [0.75, 0.9], scrap: [1.1, 1.3], hulk: [2.1, 2.3], cactus: [0.4, 0.8] };
export async function buildProps(scene, renderer, status) {
  place();
  if (status) status('Growing trees…');
  const trees = await buildTrees(renderer, [...TREE_TYPES, 'bush', 'drybush']);
  await loadPropMeshes();
  const byVariant = (type, n) => { const lists = Array.from({ length: n }, () => []); for (const it of placed[type] || []) lists[it.v % n].push(it); return lists; };
  for (const type of [...TREE_TYPES, 'bush', 'drybush']) { const T = trees[type], small = type.endsWith('bush');
    byVariant(type, T.variants.length).forEach((items, v) => { if (items.length) addLayer(scene, { name: type + '#' + v, parts: T.variants[v].parts, far: T.variants[v].far,
      nearR: small ? Q.bushNear : Q.treeNear, farR: small ? Math.min(Q.drawDist, 260) : Q.drawDist, items }); }); }
  const simple = [['rock', 3, v => rockParts('rock', v + 1), Q.propFar], ['icerock', 3, v => rockParts('icerock', v + 4), Q.propFar], ['sandrock', 3, v => rockParts('sandrock', v + 7), Q.propFar],
    ['wasterock', 3, v => rockParts('wasterock', v + 10), Q.propFar], ['cactus', 3, v => cactusParts(v * 3.1), Q.propFar * 0.6], ['fern', 3, v => fernParts(v + 1), Q.smallDist],
    ['reeds', 3, v => reedParts(v + 1), Q.smallDist * 1.3], ['flowers', 4, v => flowerParts(v), Q.smallDist], ['scrap', 6, scrapParts, Math.min(90, Q.propFar * 0.3)], ['hulk', 3, wreckParts, Q.propFar],
    ['ruinwall', 2, wallParts, Q.propFar], ['spire', 3, v => spireParts(v, 'sandrock'), Q.drawDist], ['icespire', 3, v => spireParts(v, 'icerock'), Q.drawDist],
    ['arch', 2, v => archParts(v), Q.drawDist], ['pebbles', 3, pebbleParts, Q.smallDist], ['driftwood', 3, driftwoodParts, Q.propFar * 0.5], ['shroom', 3, mushroomParts, Math.min(Q.drawDist, Q.propFar * 1.2)], ['glowcap', 3, glowcapParts, Q.smallDist * 1.3]];
  for (const [type, n, make, dist] of simple) byVariant(type, n).forEach((items, v) => { if (!items.length) return; const m = make(v);
    if (type.endsWith('rock')) { const prof = footprint(m.parts[0].geo); for (const it of items) it.prof = prof; }
    const hgt = Math.max(...m.parts.map(q => (q.geo.boundingBox || (q.geo.computeBoundingBox(), q.geo.boundingBox)).max.y)); for (const it of items) it.hgt = hgt; // how high a foot stands on it
    // rocks switch to their low-poly shape at a third of their range
    if (type === 'hulk') m.far = m.parts.filter(q => !q.name.includes('tyres')).map(q => ({ ...q, cast: false })); // far wrecks drop their tyres
    addLayer(scene, m.far ? { name: type + '#' + v, parts: m.parts, far: m.far, nearR: Math.min(dist, 90), farR: dist, items } : { name: type + '#' + v, parts: m.parts, nearR: dist, items }); });
  // collision circles (trunks, rocks, wrecks); vr and top drive the camera-occluder hiding
  for (const type in placed) for (const p of placed[type]) { p.type = type; const c = /spire/.test(type) ? [SPIRE_REACH[(type === 'spire' ? 'sandrock' : 'icerock') + p.v], 0] : COL[type];
    if (type === 'arch') { const dx = Math.cos(p.ry) * p.s, dz = -Math.sin(p.ry) * p.s, half = 0.85; for (const k of [-1, 1]) { const col = addCollider(p.x + dx * half * k, p.z + dz * half * k, 0.3 * p.s, p); col.vr = 0; } continue; }
    if (type === 'ruinwall') { const dx = Math.cos(p.ry) * p.s, dz = -Math.sin(p.ry) * p.s; for (const k of [-1.8, 0, 1.8]) { const col = addCollider(p.x + dx * k, p.z + dz * k, 0.8, p); col.vr = 1.2; col.top = p.y + 3.4; col.stand = p.y + p.hgt * p.s * 0.9; } continue; }
    if (!c) continue; const tree = SPECIES[type] && !type.endsWith('bush');
    if (p.prof) { const sh = p.layer && rockShape(p, p.layer.near[0].geometry); // (issue #44: its shape as it stands; the old outline if none)
      if (sh) { p.col = addCollider(p.x, p.z, Math.max(...sh.prof), p); Object.assign(p.col, { prof: sh.prof, bands: sh.bands, lv: sh.lv, peak: sh.peak, base: sh.base, s: 1, ry: 0, vr: c[1] * p.s, top: p.y + c[1] * p.s * 1.3, stand: Math.min(p.y + p.hgt * p.s * 0.92, sh.peak) }); continue; }
      p.col = addCollider(p.x, p.z, Math.max(...p.prof) * p.s, p); Object.assign(p.col, { prof: p.prof, s: p.s, ry: p.ry, vr: c[1] * p.s, top: p.y + c[1] * p.s * 1.3, stand: p.y + p.hgt * p.s * 0.92 }); continue; }
    p.col = addCollider(p.x, p.z, tree ? Math.max(0.25, c[0] * p.s) : c[0] * p.s, p); p.col.vr = tree ? Math.max(1, c[1] * p.s * 2) : c[1] * p.s; p.col.top = p.y + (tree ? p.s : c[1] * p.s * 1.3); }
}

let hidden = new Set();
export function hideOccluders(camera, head) { // any prop between the camera and the player is hidden, then put back when clear
  const now = new Set();
  if (head) { const from = camera.position, len = from.distanceTo(head);
    for (let d = 0; d < len - 0.6; d += 0.8) { const q = from.clone().lerp(head, d / len);
      for (const c of nearColliders(q.x, q.z)) if (c.vr && Math.hypot(c.x - q.x, c.z - q.z) < c.vr + 0.5 && q.y < c.top + 0.4) now.add(c.ref); } }
  let changed = false;
  for (const p of now) if (!hidden.has(p)) { p.hidden = true; changed = true; }
  for (const p of hidden) if (!now.has(p)) { p.hidden = false; changed = true; }
  hidden = now; if (changed) markDirty(); }
