// The world's shape: biome layout, the heightfield (mountain ranges, valleys, a river and lakes), and the
// per-vertex texture-layer weights the terrain shader blends. Everything reads the same 2 m grid.
import { HALF, WORLD, CELL, SEG, N, WATER_Y, BIOME, BIOME_NAMES, NB, SEED } from './config.js';
import { rng, fbm, vnoise, ridged, smooth, clamp01, mulberry32 } from './noise.js';

// ── Biome map: warped nearest-seed, like IW1 getBiome, with soft weights for blending ──
// The first seed is the start: a Greenbelt valley at the centre (IW1: the start is grass). Every other seed sits
// beyond the valley's ring of mountains, so each pass out of the valley leads into a different land.
export const seeds = [{ x: 0, z: 0, b: 'grass' }];
{ const order = []; for (let i = 0; i < 30; i++) order.push(BIOME_NAMES[i % NB]);
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

// ── The river: a meandering channel from the north range down to a lake in the south ──
const riverRaw = (z) => 110 * Math.sin(z * 0.0065 + 1.3) + 45 * Math.sin(z * 0.017 + 4.1) + (fbm(z * 0.01, 3.3, 3) - 0.5) * 90;
const RIVER_SHIFT = 68 - riverRaw(0); // it runs through the valley about 70 m east of the camp, in gorges through the ring
export const river = [];
for (let z = -HALF - 10; z <= 300; z += 12) river.push({ x: riverRaw(z) + RIVER_SHIFT, z });
const lakes = [{ x: river[river.length - 1].x + 10, z: 340, rx: 95, rz: 62 }];
{ const g = seeds.filter(s => s.b === 'grass' && Math.hypot(s.x, s.z) > 170 && Math.abs(s.x - riverRaw(s.z) - RIVER_SHIFT) > 120);
  if (g.length) lakes.push({ x: g[0].x, z: g[0].z, rx: 58, rz: 44 }); }
export { lakes };
function riverDist(x, z) { let best = 1e9;
  for (let i = 0; i < river.length - 1; i++) { const a = river[i], b = river[i + 1];
    if (z < a.z - 60 || z > b.z + 60) continue;
    const ex = b.x - a.x, ez = b.z - a.z, t = clamp01(((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez));
    const d = Math.hypot(x - a.x - ex * t, z - a.z - ez * t); if (d < best) best = d; }
  return best; }

// ── The passes: three saddles through the valley's ring, each toward a different land (not where the river cuts) ──
export const PASSES = [];
{ const riverAngles = river.filter(p => Math.abs(Math.hypot(p.x, p.z) - 160) < 25).map(p => Math.atan2(p.z, p.x));
  const angGap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))), used = new Set();
  for (const s of seeds.slice(1).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))) {
    const a = Math.atan2(s.z, s.x); if (used.has(s.b) || PASSES.length >= 3) continue;
    if (PASSES.some(p => angGap(p.a, a) < 1.35) || riverAngles.some(r => angGap(r, a) < 0.55)) continue;
    PASSES.push({ a, b: s.b }); used.add(s.b); } }
function passK(x, z, r, width) { const ang = Math.atan2(z, x); let k = 0;
  for (const p of PASSES) { const da = Math.abs(Math.atan2(Math.sin(ang - p.a), Math.cos(ang - p.a))) * r; k = Math.max(k, smooth(width, width * 0.35, da)); } return k; }

// ── Height ──
function heightAt(x, z, w) {
  let off = 0, amp = 0, mtn = 0; for (const k in w) { off += BIOME[k].off * w[k]; amp += BIOME[k].amp * w[k]; mtn += BIOME[k].mtn * w[k]; }
  const r = Math.hypot(x, z), valley = smooth(135, 70, r);
  amp *= 1 - 0.6 * valley; // the valley floor is a gentle meadow
  let h = off + amp * (fbm(x * 0.0045, z * 0.0045, 5) - 0.45) * 2 + (fbm(x * 0.05, z * 0.05, 3) - 0.5) * 1.6 * (1 - 0.5 * valley);
  // the valley's ring: a wall of ridged peaks from about 120 to 230 m out, broken by the three passes
  const rr = r + (fbm(x * 0.012 + 8, z * 0.012 - 4, 3) - 0.5) * 55;
  const ring = smooth(112, 152, rr) * smooth(240, 182, rr) * (1 - 0.94 * passK(x, z, r, 28));
  if (ring > 0) h += ring * (26 + ridged(x * 0.006 + 4, z * 0.006 - 2, 5) * 100) * (0.8 + fbm(x * 0.004, z * 0.004, 2) * 0.4);
  // mountain ranges: ridged crests where a low-frequency mask allows them, kept clear of the valley and its passes
  const edge = Math.max(Math.abs(x), Math.abs(z)), rim = smooth(HALF - 170, HALF - 35, edge + (fbm(x * 0.01, z * 0.01) - 0.5) * 60);
  const range = smooth(0.5, 0.68, fbm(x * 0.0028 + 3, z * 0.0028 + 7, 3)) * mtn * smooth(200, 270, r) * (1 - passK(x, z, r, 40) * smooth(360, 300, r));
  const m = Math.max(range, rim);
  if (m > 0) { const rd = ridged(x * 0.0055, z * 0.0055, 5); h += m * (rd * 125 + 6) * (0.75 + fbm(x * 0.002, z * 0.002, 2) * 0.5); }
  const open = (1 - m) * (1 - ring) * smooth(150, 215, r); // ground where the land shapes below may form
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
  // the river channel, then the lakes
  const rd = riverDist(x, z), halfW = 7 + fbm(z * 0.01, 9.1, 2) * 6, bed = WATER_Y - 2.4;
  if (rd < halfW + 40 && h > bed) h = bed + (h - bed) * smooth(halfW * 0.35, halfW + 30 + Math.min(40, Math.max(0, h - 10)) * 0.4, rd);
  for (const l of lakes) { const e = Math.hypot((x - l.x) / l.rx, (z - l.z) / l.rz) + (vnoise(x * 0.03, z * 0.03) - 0.5) * 0.25;
    if (e < 1.5 && h > WATER_Y - 5) h = (WATER_Y - 5) + (h - (WATER_Y - 5)) * smooth(0.55, 1.35, e);
    // a walkable way out on every side: the bank rises no steeper than 0.6 (the owner was trapped in a pit lake, 2026-11-03)
    h = Math.min(h, WATER_Y - 5 + Math.max(0, e - 0.55) * Math.min(l.rx, l.rz) * 0.6); }
  // a clean shoreline: land just above the water stays up, land just below drops away, so nothing hugs the surface
  if (h < 0.8) h -= 0.6 * smooth(0.8, 0.0, h);
  return { h, rd, halfW, canyon };
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
// the water and the canyon floors (those are shaped on purpose); the change is blended in by that mask.
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
    const mask = smooth(95, 125, Math.hypot(x, z)) * smooth(-2, 10, RD[k]) * (1 - CAN[k]) * smooth(1.5, 6, Math.min(H[k], E[k]));
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
    const d = Math.hypot(x, z); if (d >= minR && d < bd) { bd = d; best = { x, z }; } }
  return best; }
// Forest stands: the same mask that lays forest floor in the terrain (grass biome), so trees stand on leaf litter.
export function forestAt(x, z) { return smooth(0.42, 0.62, fbm(x * 0.012 + 40, z * 0.012, 3)); }
