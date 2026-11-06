// The world's shape: biome layout, the heightfield (mountain ranges, valleys, a river and lakes), and the
// per-vertex texture-layer weights the terrain shader blends. Everything reads the same 2 m grid.
import { HALF, WORLD, CELL, SEG, N, WATER_Y, BIOME, BIOME_NAMES, NB, SEED, CLASSIC, CAMP } from './config.js';
import { rng, fbm, vnoise, ridged, smooth, clamp01, mulberry32 } from './noise.js';

// ── Biome map: warped nearest-seed, like IW1 getBiome, with soft weights for blending ──
// The first seed is the start: a Greenbelt valley at the centre (IW1: the start is grass). Every other seed sits
// beyond the valley's ring of mountains, so each pass out of the valley leads into a different land.
export const seeds = [{ x: 0, z: 0, b: 'grass' }];
// (slice 13c) a random world leans toward two of its lands: after three regions of each (fewer left some land under
// 3 ha), those two get four times the share of the rest, so one world is mostly frozen and boggy, the next dry and ruined. The classic world shares them evenly, as it always did.
const L = mulberry32(SEED ^ 0x1ea7), LEAN = CLASSIC ? [] : BIOME_NAMES.map(b => [L(), b]).sort((a, q) => a[0] - q[0]).map(q => q[1]).slice(0, 2);
export { LEAN };
{ const order = []; if (CLASSIC) for (let i = 0; i < 30; i++) order.push(BIOME_NAMES[i % NB]);
  else { order.push(...BIOME_NAMES, ...BIOME_NAMES, ...BIOME_NAMES); const w = BIOME_NAMES.map(b => LEAN.includes(b) ? 4 : 1), tot = w.reduce((a, q) => a + q, 0);
    for (let i = 0; i < 9; i++) { let r = L() * tot, k = 0; while ((r -= w[k]) > 0) k++; order.push(BIOME_NAMES[k]); } }
  for (const b of order) { let x, z, ok = false, tries = 0;
    while (!ok && tries++ < 120) { x = (rng() - 0.5) * WORLD * 0.86; z = (rng() - 0.5) * WORLD * 0.86; ok = Math.hypot(x, z) > 235 && seeds.every(s => Math.hypot(s.x - x, s.z - z) > 145); }
    if (ok) seeds.push({ x, z, b }); } }
export function biomeWeights(x, z) {
  const wx = x + (fbm(x * 0.006 + 11, z * 0.006) - 0.5) * 120, wz = z + (fbm(x * 0.006, z * 0.006 + 37) - 0.5) * 120;
  let dmin = 1e9, best = 'grass'; const ds = new Float32Array(seeds.length);
  for (let i = 0; i < seeds.length; i++) { const d = Math.hypot(seeds[i].x - wx, seeds[i].z - wz); ds[i] = d; if (d < dmin) { dmin = d; best = seeds[i].b; } }
  const w = {}; for (const k of BIOME_NAMES) w[k] = 0; let tot = 0;
  for (let i = 0; i < seeds.length; i++) { const k = Math.exp(-(ds[i] - dmin) / 16); if (k < 1e-3) continue; w[seeds[i].b] += k; tot += k; }
  for (const k in w) w[k] /= tot;
  // the valley is Greenbelt out to its ring of mountains, whatever lies beyond
  const v = smooth(185, 135, Math.hypot(x, z) + (fbm(x * 0.01 + 3, z * 0.01) - 0.5) * 40);
  if (v > 0) { for (const k in w) w[k] *= 1 - v; w.grass += v; if (v > 0.5) best = 'grass'; }
  return { best, w };
}

// ── The world's shape choices (slice 13c): which way the river runs, which side of the camp it passes, how high the
// valley's ring stands, and the ponds and tarns beyond it. Its own stream, so the biome layout stays as it was. The
// classic world (the default seed: the checks' world) keeps slice 7's shape exactly: a river from north to south, east
// of the camp, and no ponds.
const V = mulberry32(SEED ^ 0x51ed27);
export const SHAPE = CLASSIC ? { riverA: 0, side: 1, ring: 1, ponds: 0 }
  : { riverA: V() * Math.PI * 2, side: V() < 0.5 ? 1 : -1, ring: 0.8 + V() * 0.45, ponds: 1 + Math.floor(V() * 3) };
// ── The river: a meandering channel from the range at the world's edge, through the valley, down to a lake ──
// (laid out along its own axis, then turned to its heading: along is local z, across is local x)
const riverRaw = (z) => 110 * Math.sin(z * 0.0065 + 1.3) + 45 * Math.sin(z * 0.017 + 4.1) + (fbm(z * 0.01, 3.3, 3) - 0.5) * 90;
const RIVER_SHIFT = 68 - riverRaw(0); // it runs through the valley about 70 m beside the camp, in gorges through the ring
const rc = Math.cos(SHAPE.riverA), rs = Math.sin(SHAPE.riverA), turn = (lx, lz) => CLASSIC ? { x: lx, z: lz } : { x: lx * rc - lz * rs, z: lx * rs + lz * rc };
export const river = [];
let mouth = 0; // the river's last point along its axis: the lake lies just past it
for (let z = CLASSIC ? -HALF - 10 : -760; z <= 300; z += 12) { const p = turn(SHAPE.side * (riverRaw(z) + RIVER_SHIFT), z); mouth = z;
  if (CLASSIC || (Math.abs(p.x) < HALF + 30 && Math.abs(p.z) < HALF + 30)) river.push(p); }
const lakes = [{ ...turn(SHAPE.side * (riverRaw(mouth) + RIVER_SHIFT) + 10, 340), rx: 95, rz: 62, a: CLASSIC ? 0 : SHAPE.riverA }];
function riverDist(x, z) { let best = 1e9;
  for (let i = 0; i < river.length - 1; i++) { const a = river[i], b = river[i + 1];
    if (z < Math.min(a.z, b.z) - 60 || z > Math.max(a.z, b.z) + 60 || (!CLASSIC && (x < Math.min(a.x, b.x) - 60 || x > Math.max(a.x, b.x) + 60))) continue;
    const ex = b.x - a.x, ez = b.z - a.z, t = clamp01(((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez));
    const d = Math.hypot(x - a.x - ex * t, z - a.z - ez * t); if (d < best) best = d; }
  return best; }
// a second lake in a Greenbelt beyond the ring, well away from the river
{ const g = seeds.filter(s => s.b === 'grass' && Math.hypot(s.x, s.z) > 170 && (CLASSIC ? Math.abs(s.x - riverRaw(s.z) - RIVER_SHIFT) > 120 : riverDist(s.x, s.z) > 120));
  if (g.length) lakes.push({ x: g[0].x, z: g[0].z, rx: 58, rz: 44, a: 0 }); }
export { lakes };

// ── The passes: three saddles through the valley's ring, each toward a different land (not where the river cuts) ──
export const PASSES = [];
{ const riverAngles = river.filter(p => Math.abs(Math.hypot(p.x, p.z) - 160) < 25).map(p => Math.atan2(p.z, p.x));
  const angGap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))), used = new Set();
  for (const s of seeds.slice(1).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))) {
    const a = Math.atan2(s.z, s.x); if (used.has(s.b) || PASSES.length >= 3) continue;
    if (PASSES.some(p => angGap(p.a, a) < 1.35) || riverAngles.some(r => angGap(r, a) < 0.55)) continue;
    PASSES.push({ a, b: s.b }); used.add(s.b); }
  // (a random world leaning toward two lands can have its nearest regions all alike: then a pass may share a land)
  if (!CLASSIC) for (const s of seeds.slice(1).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))) { const a = Math.atan2(s.z, s.x); if (PASSES.length >= 3) break;
    if (PASSES.some(p => angGap(p.a, a) < 1.35) || riverAngles.some(r => angGap(r, a) < 0.55)) continue; PASSES.push({ a, b: s.b }); } }
function passK(x, z, r, width) { const ang = Math.atan2(z, x); let k = 0;
  for (const p of PASSES) { const da = Math.abs(Math.atan2(Math.sin(ang - p.a), Math.cos(ang - p.a))) * r; k = Math.max(k, smooth(width, width * 0.35, da)); } return k; }

// Level ground for what the generator builds (random worlds). src/plan.js puts the ruined town, the gas station, a
// landmark in five biomes and three raider camps on the nearest level, dry ground deep in their biome beyond the ring;
// a random world often had none (its Ruins had a patch level enough for the town in 0 to 3 places of about 500; 4 worlds
// in 70 had no forecourt for the gas station). So each gets a pad: the nearest spot deep in its biome beyond the ring,
// off the river, clear of every lake and of the other pads, whose own ground lies low (2 to 28 m, not a mountain's
// shoulder), settled to that ground's mean level, keeping a little of its own roll. The classic world stands as it was.
// [biome, the site's radius in plan.js, the pad's level radius, how far out it blends]
const PAD_SPECS = [['ruins', 30, 50, 78], ['waste', 13, 22, 40], ['tundra', 7, 14, 28], ['desert', 7, 14, 28], ['swamp', 7, 14, 28], ['grass', 7, 14, 28], ['fungal', 7, 14, 28],
  ['waste', 12, 20, 36], ['ruins', 12, 20, 36], ['desert', 12, 20, 36]];
const bareH = (x, z, r) => { let t = 0; for (let k = 0; k < 9; k++) { const a = k * Math.PI / 4, q = k ? r : 0, px = x + Math.cos(a) * q, pz = z + Math.sin(a) * q; t += heightAt(px, pz, biomeWeights(px, pz).w, true).h; } return t / 9; };
export const PADS = [];
if (!CLASSIC) { const G = 8, best = new Map(); // (each grid point's biome, looked up once)
  const bio = (x, z) => { const k = x + ',' + z; let v = best.get(k); if (v === undefined) best.set(k, v = biomeWeights(x, z).best); return v; };
  const look = (b, r, outer, e, river, shore) => { const c = [];
    for (let z = -HALF + 80; z <= HALF - 80; z += G) for (let x = -HALF + 80; x <= HALF - 80; x += G) { const d = Math.hypot(x, z);
      if (d < 262 || bio(x, z) !== b || PADS.some(p => Math.hypot(p.x - x, p.z - z) < p.outer + outer + 20)) continue;
      // (clear of every pass's way out: a pass leads into a biome, so its nearest low ground was often the pass's own mouth,
      // and a pad levelled there walled it off with its skirt, slice 13c)
      if (PASSES.some(q => { const along = x * Math.cos(q.a) + z * Math.sin(q.a); return along > 120 && along < 330 && Math.abs(z * Math.cos(q.a) - x * Math.sin(q.a)) < outer + 18; })) continue;
      if (![[e, 0], [-e, 0], [0, e], [0, -e]].every(([a, q]) => bio(x + a, z + q) === b)) continue;
      if (riverDist(x, z) < river || lakes.some(l => Math.hypot(l.x - x, l.z - z) - Math.max(l.rx, l.rz) < shore)) continue; c.push({ x, z, d }); }
    return c.sort((p, q) => p.d - q.d); };
  for (const [b, r, inner, outer] of PAD_SPECS) { const e = Math.ceil((r + 10) / G) * G; // (a second, looser look if the first finds no ground)
    let c = look(b, r, outer, e, outer + 22, outer); if (!c.length) c = look(b, r, outer, Math.ceil(r / 2 / G) * G, outer, outer * 0.6);
    let t = null; for (const q of c.slice(0, 40)) { q.h = bareH(q.x, q.z, r); if (q.h > 2 && q.h < 28) { t = q; break; } }
    if (!t && c[0]) t = { ...c[0], h: bareH(c[0].x, c[0].z, r) };
    if (t) PADS.push({ x: t.x, z: t.z, b, inner, outer, h: Math.min(40, Math.max(WATER_Y + 3, t.h)) }); } }
export const TOWN = PADS.find(p => p.b === 'ruins' && p.inner === 50) || null;
const padK = (x, z) => { let k = 0; for (const p of PADS) { const d = Math.abs(x - p.x) + Math.abs(z - p.z); if (d < p.outer * 1.5) k = Math.max(k, smooth(p.outer, p.inner, Math.hypot(x - p.x, z - p.z))); } return k; };
// ponds and tarns (random worlds): out beyond the ring, off the river, apart from every other lake; never in the Bog
// (it has its own pools) and rarely in the desert, where one is an oasis
for (let k = 0, tries = 0; k < SHAPE.ponds && tries < 60; tries++) { const a = V() * Math.PI * 2, r = 280 + V() * 170, x = Math.cos(a) * r, z = Math.sin(a) * r;
  const rx = 26 + V() * 30, rz = rx * (0.55 + V() * 0.4), turnA = V() * Math.PI, b = biomeWeights(x, z).best, oasis = V() < 0.3;
  if (Math.abs(x) > HALF - 70 || Math.abs(z) > HALF - 70 || b === 'swamp' || (b === 'desert' && !oasis) || riverDist(x, z) < rx + 50) continue;
  if (lakes.some(l => Math.hypot(l.x - x, l.z - z) < Math.max(l.rx, l.rz) + rx + 60) || PADS.some(p => Math.hypot(p.x - x, p.z - z) < rx + p.outer + 30)) continue;
  lakes.push({ x, z, rx, rz, a: turnA, pond: b }); k++; }
// ── Height ──
function heightAt(x, z, w, bare = false) { // bare: without the town's shelf (to find its level)
  let off = 0, amp = 0, mtn = 0; for (const k in w) { off += BIOME[k].off * w[k]; amp += BIOME[k].amp * w[k]; mtn += BIOME[k].mtn * w[k]; }
  const r = Math.hypot(x, z), valley = smooth(135, 70, r);
  amp *= 1 - 0.6 * valley; // the valley floor is a gentle meadow
  let h = off + amp * (fbm(x * 0.0045, z * 0.0045, 5) - 0.45) * 2 + (fbm(x * 0.05, z * 0.05, 3) - 0.5) * 1.6 * (1 - 0.5 * valley);
  // the valley's ring: a wall of ridged peaks from about 120 to 230 m out, broken by the three passes
  const rr = r + (fbm(x * 0.012 + 8, z * 0.012 - 4, 3) - 0.5) * 55;
  const ring = smooth(112, 152, rr) * smooth(240, 182, rr) * (1 - 0.94 * passK(x, z, r, 28));
  if (ring > 0) h += ring * (26 + ridged(x * 0.006 + 4, z * 0.006 - 2, 5) * 100) * (0.8 + fbm(x * 0.004, z * 0.004, 2) * 0.4) * SHAPE.ring;
  // mountain ranges: ridged crests where a low-frequency mask allows them, kept clear of the valley and its passes
  const edge = Math.max(Math.abs(x), Math.abs(z)), rim = smooth(HALF - 170, HALF - 35, edge + (fbm(x * 0.01, z * 0.01) - 0.5) * 60);
  const range = smooth(0.5, 0.68, fbm(x * 0.0028 + 3, z * 0.0028 + 7, 3)) * mtn * smooth(200, 270, r) * (1 - passK(x, z, r, 40) * smooth(360, 300, r));
  const m = Math.max(range, rim);
  if (m > 0) { const rd = ridged(x * 0.0055, z * 0.0055, 5); h += m * (rd * 125 + 6) * (0.75 + fbm(x * 0.002, z * 0.002, 2) * 0.5); }
  const open = (1 - m) * (1 - ring) * smooth(150, 215, r) // ground where the land shapes below may form
    * (CLASSIC ? 1 : 1 - passK(x, z, r, 24) * smooth(300, 265, r)); // (not across a random world's pass until it opens onto the land: a butte or a canyon wall there blocked the way out of 25 worlds in 48, slice 13c)
  if (w.desert) h += (Math.pow(Math.sin(x * 0.04 + Math.sin(z * 0.02) * 2.4) * 0.5 + 0.5, 1.6) * 6 + (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 3) * w.desert * (1 - m);          // dunes
  if (w.waste) { const f = fbm(x * 0.009 + 5, z * 0.009 + 9, 3); h += (smooth(0.58, 0.66, f) * 14 + smooth(0.68, 0.74, f) * 9) * w.waste * open; } // mesas
  // desert and ruins: buttes and plateaus with sheer, two-tier escarpments
  const dryLand = w.desert + w.ruins * 0.5 + w.tundra * 0.35;
  if (dryLand > 0.03) { const f = fbm(x * 0.0065 + 21, z * 0.0065 - 13, 3) + (vnoise(x * 0.07, z * 0.07) - 0.5) * 0.012;
    h += (smooth(0.6, 0.617, f) * 15 + smooth(0.664, 0.676, f) * 13) * dryLand * open; }
  // a long dry canyon winding through the desert, the Waste and the ruins: a raised tableland cut by stepped walls
  let canyon = 0; const cm = (w.desert + w.waste + w.ruins * 0.6) * open;
  if (cm > 0.02) { const e = 2, F = (a, b) => fbm(a * 0.0032 + 50, b * 0.0032 - 80, 3), c0 = F(x, z), g = Math.hypot(F(x + e, z) - c0, F(x, z + e) - c0) / e;
    const dm = Math.abs(c0 - 0.5) / Math.max(g, 1e-5) + (vnoise(x * 0.09, z * 0.09) - 0.5) * 6;
    if (dm < 170) { h += smooth(160, 45, dm) * 24 * cm;
      canyon = (0.5 * smooth(24, 17, dm) + 0.5 * smooth(12, 6.5, dm)) * cm; /* two sheer steps */ const floor = WATER_Y + 2.4 + vnoise(x * 0.03, z * 0.03) * 1.2;
      if (h > floor) h -= canyon * (h - floor); } }
  if (w.fungal) h += (Math.pow(fbm(x * 0.035 + 7, z * 0.035, 2), 2.2) * 6 - 0.8) * w.fungal * (1 - m);   // spongy hummocks
  if (w.swamp) h -= (fbm(x * 0.03 + 2, z * 0.03 + 4, 3) - 0.3) * 3.4 * w.swamp;                                        // pools
  // the building pads: the ground settles toward each one's level, keeping a little of its own roll
  let tk = 0; if (!bare && PADS.length) for (const p of PADS) { const d = Math.abs(x - p.x) + Math.abs(z - p.z); if (d > p.outer * 1.5) continue;
    const k = smooth(p.outer, p.inner, Math.hypot(x - p.x, z - p.z)); if (k > 0) { h += (p.h + (fbm(x * 0.05, z * 0.05, 2) - 0.5) * 0.8 - h) * k; tk = Math.max(tk, k); } }
  // the river channel, then the lakes
  const rd = riverDist(x, z), halfW = 7 + fbm(z * 0.01, 9.1, 2) * 6, bed = WATER_Y - 2.4;
  if (rd < halfW + 40 && h > bed) h = bed + (h - bed) * smooth(halfW * 0.35, halfW + 30 + Math.min(40, Math.max(0, h - 10)) * 0.4, rd);
  for (const l of lakes) { const dx = x - l.x, dz = z - l.z, ca = Math.cos(l.a), sa = Math.sin(l.a); // (along the lake's own axes)
    const e = Math.hypot((dx * ca + dz * sa) / l.rx, (dz * ca - dx * sa) / l.rz) + (vnoise(x * 0.03, z * 0.03) - 0.5) * 0.25;
    if (CLASSIC && e < 1.5 && h > WATER_Y - 5) h = (WATER_Y - 5) + (h - (WATER_Y - 5)) * smooth(0.55, 1.35, e); // (a random world's bowl is the bank's cap below alone)
    // a walkable way out on every side: the bank rises no steeper than 0.6 (the owner was trapped in a pit lake, 2026-11-03)
    // (a random world's: on the lake's own ellipse, no wobble, rising 0.45, so that with the shoreline's drop below, which
    // steepens it about 1.42 times through its last 1.6 m, it stays well under the 1.05 a player climbs: 4242's river lake
    // held the walk test at its rim on a 1.04 step, slice 13c. The classic world's lakes stay as they were)
    const e0 = Math.hypot((dx * ca + dz * sa) / l.rx, (dz * ca - dx * sa) / l.rz);
    h = CLASSIC ? Math.min(h, WATER_Y - 5 + Math.max(0, e - 0.55) * Math.min(l.rx, l.rz) * 0.6) : Math.min(h, WATER_Y - 5 + Math.max(0, e0 - 0.55) * Math.min(l.rx, l.rz) * 0.45); }
  // a clean shoreline: land just above the water stays up, land just below drops away, so nothing hugs the surface
  // (a random world's is 0.45 m over twice the height, which steepens a bank through it about 1.42 times, not 2.1: lakes' banks
  // went past the 1.05 a player climbs there, 4242's river lake among them, slice 13c. The classic world's stays as it was)
  if (CLASSIC) { if (h < 0.8) h -= 0.6 * smooth(0.8, 0.0, h); } else if (h < 1.6) h -= 0.45 * smooth(1.6, 0.0, h);
  return { h, rd, halfW, canyon: canyon * (1 - tk) };
}

// ── The grid: heights, best biome, normals, texture-layer weights ──
export const H = new Float32Array(N * N), BI = new Uint8Array(N * N), WET = new Uint8Array(N * N);
const BW = new Float32Array(N * N * NB), RD = new Float32Array(N * N), CAN = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = -HALF + i * CELL, z = -HALF + j * CELL, k = j * N + i;
  const { best, w } = biomeWeights(x, z), r = heightAt(x, z, w);
  H[k] = r.h; BI[k] = BIOME_NAMES.indexOf(best); WET[k] = r.rd < r.halfW + 6 ? 1 : 0; RD[k] = r.rd - r.halfW; CAN[k] = r.canyon;
  for (let c = 0; c < NB; c++) BW[k * NB + c] = w[BIOME_NAMES[c]]; }

// Erosion: rain droplets run downhill over the grid, picking up soil where they speed up and dropping it where they
// slow, which cuts gullies and ribs into slopes and leaves fans at their feet. Kept off the valley floor, the camp,
// the water and the canyon floors (those are shaped on purpose); the change is blended in by that mask. In a random world
// it is kept off each pass's floor too: the water of both walls runs down the slot and cut steps a player could not climb
// (frozen-fen-62's grass pass stopped the walk test 165 m out, slice 13c; the classic world's passes walk out as they are)
{ const E = new Float32Array(H), R = mulberry32(SEED ^ 0x9e3779b9), at = (i, j) => E[j * N + i];
  const W3 = [[-1, -1, 0.05], [0, -1, 0.12], [1, -1, 0.05], [-1, 0, 0.12], [0, 0, 0.32], [1, 0, 0.12], [-1, 1, 0.05], [0, 1, 0.12], [1, 1, 0.05]];
  for (let d = 0; d < 110000; d++) {
    let x = 2 + R() * (SEG - 4), z = 2 + R() * (SEG - 4), dx = 0, dz = 0, speed = 1, water = 1, sed = 0;
    for (let step = 0; step < 34; step++) {
      const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, k = j * N + i;
      const h00 = E[k], h10 = E[k + 1], h01 = E[k + N], h11 = E[k + N + 1];
      const gx = (h10 - h00) * (1 - fz) + (h11 - h01) * fz, gz = (h01 - h00) * (1 - fx) + (h11 - h10) * fx, hh = h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz;
      dx = dx * 0.1 - gx * 0.9; dz = dz * 0.1 - gz * 0.9; const l = Math.hypot(dx, dz); if (l < 1e-6) break; dx /= l; dz /= l;
      const nx = x + dx, nz = z + dz; if (nx < 2 || nz < 2 || nx > SEG - 3 || nz > SEG - 3) break;
      const ni = Math.floor(nx), nj = Math.floor(nz), nfx = nx - ni, nfz = nz - nj, nk = nj * N + ni;
      const nh = E[nk] * (1 - nfx) * (1 - nfz) + E[nk + 1] * nfx * (1 - nfz) + E[nk + N] * (1 - nfx) * nfz + E[nk + N + 1] * nfx * nfz, dh = nh - hh;
      const cap = Math.max(-dh, 0.05) * speed * water * 1.6;
      if (sed > cap || dh > 0) { const dep = dh > 0 ? Math.min(dh, sed) : (sed - cap) * 0.25; sed -= dep;
        E[k] += dep * (1 - fx) * (1 - fz); E[k + 1] += dep * fx * (1 - fz); E[k + N] += dep * (1 - fx) * fz; E[k + N + 1] += dep * fx * fz; }
      else { const ero = Math.min((cap - sed) * 0.08, -dh); const ci = Math.round(x), cj = Math.round(z);
        for (const [a, b, wgt] of W3) E[(cj + b) * N + ci + a] -= ero * wgt; sed += ero; }
      speed = Math.sqrt(Math.max(0, speed * speed - dh * 2)); water *= 0.97; x = nx; z = nz; } }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i, x = -HALF + i * CELL, z = -HALF + j * CELL;
    const r = Math.hypot(x, z), pass = CLASSIC ? 0 : passK(x, z, r, 14) * smooth(100, 130, r) * smooth(300, 265, r);
    const mask = smooth(95, 125, r) * smooth(-2, 10, RD[k]) * (1 - CAN[k]) * smooth(1.5, 6, Math.min(H[k], E[k])) * (1 - padK(x, z)) * (1 - pass);
    H[k] += (E[k] - H[k]) * mask; } }

const hAt = (i, j) => H[Math.min(SEG, Math.max(0, j)) * N + Math.min(SEG, Math.max(0, i))];
export const NORMAL = new Float32Array(N * N * 3), SLOPE = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i;
  const dx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * CELL), dz = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * CELL), l = Math.hypot(dx, 1, dz);
  NORMAL[k * 3] = -dx / l; NORMAL[k * 3 + 1] = 1 / l; NORMAL[k * 3 + 2] = -dz / l; SLOPE[k] = Math.hypot(dx, dz); }

// Layer order matches LAYERS in config.js: grass, forest, dirt, rock | sand, snow, mud, (macro) | paving, gravel, moss.
// The ground's biome weights are a blurred copy of the height's (two box passes, about 24 m wide), so textures cross
// from one biome to the next over a wide, ragged band instead of a hard seam; a noise warp keeps the band uneven.
const BWS = new Float32Array(BW); {
  const tmp = new Float32Array(BWS.length), R = 6;
  const pass = (src, dst, di, dj) => { for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) for (let c = 0; c < NB; c++) { let a = 0, n = 0;
    for (let t = -R; t <= R; t++) { const ii = i + di * t, jj = j + dj * t; if (ii < 0 || jj < 0 || ii > SEG || jj > SEG) continue; a += src[(jj * N + ii) * NB + c]; n++; }
    dst[(j * N + i) * NB + c] = a / n; } };
  for (let r = 0; r < 2; r++) { pass(BWS, tmp, 1, 0); pass(tmp, BWS, 0, 1); } }
// scree: the foot of a cliff, ground that is not itself sheer but has sheer ground just above it
const CLIFF = new Float32Array(N * N);
for (let j = 2; j < N - 2; j++) for (let i = 2; i < N - 2; i++) { let m = 0, k = j * N + i;
  for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) { const q = (j + b) * N + i + a; if (H[q] > H[k] + 1 && SLOPE[q] > m) m = SLOPE[q]; } CLIFF[k] = m; }
export const SPLAT_A = new Uint8Array(N * N * 4), SPLAT_B = new Uint8Array(N * N * 4), SPLAT_C = new Uint8Array(N * N * 4);
const street = (x, z) => { const u = x * 0.92 + z * 0.39, v = -x * 0.39 + z * 0.92, d = Math.min(Math.abs(u - Math.round(u / 34) * 34), Math.abs(v - Math.round(v / 34) * 34));
  return smooth(4.2, 2.2, d) * smooth(0.28, 0.45, vnoise(x * 0.06 + 3, z * 0.06)); };
export { street };
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const k = j * N + i, x = -HALF + i * CELL, z = -HALF + j * CELL, h = H[k], slope = SLOPE[k];
  const jit = (vnoise(x * 0.05 + 7, z * 0.05 - 3) - 0.5) * 0.5; // sharpen or soften the blend by place: ragged edges
  const [ws, wg, wd, wt, wsw, wr, wf] = Array.from(BWS.subarray(k * NB, k * NB + NB), (v, c) => Math.pow(v, 1 + jit * (c % 2 ? 1 : -1)));
  const macro = fbm(x * 0.02, z * 0.02, 3), forestP = smooth(0.42, 0.62, fbm(x * 0.012 + 40, z * 0.012, 3)), n2 = vnoise(x * 0.08, z * 0.08);
  let L = [
    wg * (1 - forestP * 0.85) + wsw * 0.15 + wt * 0.12 + wr * 0.22,           // grass
    wg * forestP * 0.85 + wsw * 0.35 + wt * 0.18 + wf * 0.22,                 // forest floor
    ws * 0.85 + wg * 0.1 * smooth(0.55, 0.7, macro) + wd * 0.12 + wr * 0.35,  // dirt
    ws * 0.15 * smooth(0.5, 0.7, macro) + wr * 0.06,                          // rock
    wd * 1.5,                                                                // sand (dominant: the desert reads as sand, not grass)
    wt * 0.7 * (1 - smooth(0.5, 0.9, slope)),                               // snow (slides off steep tundra slopes)
    wsw * 0.5 + wf * 0.08,                                                   // mud
    wr * (0.12 + street(x, z) * 1.4),                                        // paving: broken streets in the ruins
    0,                                                                       // gravel (banks, scree, washes; below)
    wf * 0.78,                                                               // moss: the fungal mat
  ];
  // shores and river beds: mud in wet biomes, sand in dry ones; the river's banks are gravel bars
  const shore = 1 - smooth(0.3, 1.8 + n2, h - WATER_Y), dry = ws + wd + wr;
  if (shore > 0) for (let l = 0; l < 10; l++) L[l] *= 1 - shore;
  L[4] += shore * (dry * 0.9 + 0.1) * 0.6; L[6] += shore * (1 - dry) * (0.4 + wsw * 0.5); L[8] += shore * (0.4 * dry + 0.5 * (1 - dry) * (1 - wsw));
  const bank = smooth(13, 3, RD[k] + (n2 - 0.5) * 6) * (1 - wsw) * (1 - smooth(4, 9, h));
  for (let l = 0; l < 10; l++) L[l] *= 1 - bank * 0.85; L[8] += bank * 0.9;
  // canyon floors are dry washes of gravel and sand
  const wash = smooth(0.5, 0.9, CAN[k]); for (let l = 0; l < 10; l++) L[l] *= 1 - wash * 0.7; L[8] += wash * 0.45; L[4] += wash * 0.25;
  // high ground turns to scree and then snow; steep ground is bare rock
  const alpine = smooth(38, 62, h + (macro - 0.5) * 16), snowT = smooth(55, 75, h + (macro - 0.5) * 20) * (1 - smooth(1.1, 1.6, slope));
  for (let l = 0; l < 10; l++) if (l !== 3 && l !== 5) L[l] *= 1 - alpine * 0.8;
  L[3] += alpine * 0.45; L[8] += alpine * 0.2;
  const scree = smooth(0.75, 1.2, CLIFF[k]) * (1 - smooth(0.55, 0.75, slope)) * (0.6 + n2 * 0.6);
  for (let l = 0; l < 10; l++) L[l] *= 1 - scree * 0.75; L[8] += scree * 0.8;
  const rockT = smooth(0.62, 1.0, slope + (n2 - 0.5) * 0.2);
  for (let l = 0; l < 10; l++) L[l] *= 1 - rockT; L[3] += rockT;
  for (let l = 0; l < 10; l++) if (l !== 5) L[l] *= 1 - snowT; L[5] += snowT;
  const tot = L.reduce((a, b) => a + b, 0) || 1;
  for (let l = 0; l < 4; l++) SPLAT_A[k * 4 + l] = Math.round(L[l] / tot * 255);
  for (let l = 0; l < 3; l++) SPLAT_B[k * 4 + l] = Math.round(L[l + 4] / tot * 255);
  for (let l = 0; l < 3; l++) SPLAT_C[k * 4 + l] = Math.round(L[l + 7] / tot * 255);
  SPLAT_B[k * 4 + 3] = Math.round(clamp01(fbm(x * 0.011 + 70, z * 0.011 - 20, 3)) * 255); // large-scale tint variation
}

// ── Lookups ──
export function groundY(x, z) { // exact on the LOD0 mesh's triangles
  const gx = Math.min(SEG - 1e-4, Math.max(0, (x + HALF) / CELL)), gz = Math.min(SEG - 1e-4, Math.max(0, (z + HALF) / CELL));
  const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
  const h00 = H[j * N + i], h10 = H[j * N + i + 1], h01 = H[(j + 1) * N + i], h11 = H[(j + 1) * N + i + 1];
  return fx + fz < 1 ? h00 + (h10 - h00) * fx + (h01 - h00) * fz : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}
export function biomeAt(x, z) { const i = Math.round((x + HALF) / CELL), j = Math.round((z + HALF) / CELL);
  return BIOME_NAMES[BI[Math.min(SEG, Math.max(0, j)) * N + Math.min(SEG, Math.max(0, i))]]; }
export function biomeW(x, z, b) { // this biome's blend weight (0..1) at the nearest grid vertex
  const i = Math.round((x + HALF) / CELL), j = Math.round((z + HALF) / CELL);
  return BW[(Math.min(SEG, Math.max(0, j)) * N + Math.min(SEG, Math.max(0, i))) * NB + BIOME_NAMES.indexOf(b)]; }
export function canyonAt(x, z) { const i = Math.round((x + HALF) / CELL), j = Math.round((z + HALF) / CELL); return CAN[Math.min(SEG, Math.max(0, j)) * N + Math.min(SEG, Math.max(0, i))]; }
export function slopeAt(x, z) { const e = 1.5; return Math.hypot(groundY(x + e, z) - groundY(x - e, z), groundY(x, z + e) - groundY(x, z - e)) / (2 * e); }
export function isWet(x, z) { const i = Math.round((x + HALF) / CELL), j = Math.round((z + HALF) / CELL);
  return WET[Math.min(SEG, Math.max(0, j)) * N + Math.min(SEG, Math.max(0, i))] === 1; }
export function findBiome(b, minR = 0) { // a dry, walkable spot well inside a region of this biome, nearest the spawn (at least minR out)
  let best = null, bd = 1e9;
  for (let z = -HALF + 120; z < HALF - 120; z += 8) for (let x = -HALF + 120; x < HALF - 120; x += 8) {
    if (biomeAt(x, z) !== b || groundY(x, z) < WATER_Y + 0.4 || slopeAt(x, z) > 0.3) continue;
    if (biomeAt(x + 30, z) !== b || biomeAt(x - 30, z) !== b || biomeAt(x, z + 30) !== b || biomeAt(x, z - 30) !== b) continue;
    const d = Math.hypot(x, z); if (d >= minR && d < bd && reachable(x, z)) { bd = d; best = { x, z }; } } // (slice 13c: never a plateau nobody can climb)
  return best; }
// Forest stands: the same mask that lays forest floor in the terrain (grass biome), so trees stand on leaf litter.
export function forestAt(x, z) { return smooth(0.42, 0.62, fbm(x * 0.012 + 40, z * 0.012, 3)); }
// Ground a player can get to from the camp on foot (or swimming), slice 13c: a flood over the 2 m grid where each step
// climbs no more than a player can walk up (game.js stops a climb at a slope of 1.05). Built the first time it is asked.
// The generator places buildings and camps only on reachable ground, and the checks walk every seed's world with it.
let REACH = null;
export function reachGrid() { if (REACH) return REACH; REACH = new Uint8Array(N * N);
  const k0 = Math.round((CAMP.z + HALF) / CELL) * N + Math.round((CAMP.x + HALF) / CELL), q = new Int32Array(N * N); let n = 0; q[n++] = k0; REACH[k0] = 1;
  while (n) { const k = q[--n], i = k % N, j = (k - i) / N;
    for (let d = 0; d < 4; d++) { const ii = i + (d === 0) - (d === 1), jj = j + (d === 2) - (d === 3); if (ii < 1 || jj < 1 || ii >= SEG || jj >= SEG) continue;
      const m = jj * N + ii; if (REACH[m] || Math.abs(H[m] - H[k]) > CELL) continue; REACH[m] = 1; q[n++] = m; } }
  return REACH; }
export function reachable(x, z) { const i = Math.round((x + HALF) / CELL), j = Math.round((z + HALF) / CELL); return reachGrid()[Math.min(SEG, Math.max(0, j)) * N + Math.min(SEG, Math.max(0, i))] === 1; }
