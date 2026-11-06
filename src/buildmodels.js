// What players build on the grid (slice 12): a timber palisade wall, a stone (reinforced) wall, a plank gate in a
// lintel frame, a spike trap, and the posts where walls meet. Every piece is built in its own frame: the wall runs along
// local x from -1 to +1 (one 2 m grid edge), local +z faces the side it was built from (its inside), y is up from the
// piece's base. Each log and block stands on the ground under it (sampled through `gy`), so a wall follows a slope.
// A wall has three looks (stage 0 whole, 1 damaged, 2 broken) and a rubble heap for after it falls.
// Textures are the CC0 ones already in assets/ (Poly Haven log bark, brown planks, rustic stone wall, rusty iron).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pbr, boxUV } from './propmodels.js';
import { mulberry32 } from './noise.js';

let M = null;
export function buildMats() { if (M) return M;
  const stone = pbr('props/wall', { rough: 0.92, color: 0xc8c0b4 });
  M = { bark: pbr('props/logbark', { rough: 0.95, color: 0xa89a88 }), cut: new THREE.MeshStandardMaterial({ color: 0xc9a476, roughness: 0.85 }),
    planks: pbr('props/planks', { rough: 0.8, color: 0x9a7048 }), stone, cap: pbr('props/wall', { rough: 0.9, color: 0xa8a298 }),
    iron: new THREE.MeshStandardMaterial({ map: pbr('props/iron', {}).map, color: 0x7a6a5a, metalness: 0.6, roughness: 0.55 }),
    stain: new THREE.MeshStandardMaterial({ color: 0x3a1c14, roughness: 1, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }) };
  // the stone's world-scale UVs are set per wall (boxUV), so its texture tiles at about 2 m
  return M; }

// a log of radius r from y0 to y1 with the bark tiled at about 0.9 m, its top cut to a point (cone) or a ragged break
function log(r, y0, y1, tip) { const h = y1 - y0, g = new THREE.CylinderGeometry(r, r * 1.04, h, 9, 1), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (6.28 * r / 0.9), uv.getY(i) * (h / 0.9));
  g.translate(0, y0 + h / 2, 0); let t = null;
  if (tip === 'point') t = new THREE.ConeGeometry(r, r * 3.2, 9).translate(0, y1 + r * 1.6, 0);
  else if (tip === 'broken') t = new THREE.ConeGeometry(r, r * 1.6, 7, 1).rotateZ(0.35).translate(r * 0.2, y1 + r * 0.6, 0);
  return [g, t]; } // (a flat end is the cylinder's own cap: t is null)
const tilt = (geos, ax, az, px, py, pz) => { const m = new THREE.Matrix4().makeTranslation(-px, -py, -pz).premultiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(ax, 0, az))).premultiply(new THREE.Matrix4().makeTranslation(px, py, pz)); for (const g of geos) g.applyMatrix4(m); return geos; };
const box = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.BoxGeometry(w, h, d).rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);
const merge = (list) => { list = list.filter(Boolean); return list.length ? mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g)) : null; };
function group(parts) { const g = new THREE.Group(); for (const [geo, mat] of parts) if (geo) { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; g.add(m); } return g; }

// The palisade: nine sharpened logs side by side, two plank rails pegged across their inside face, and an iron band
// round their tops. Damaged, two logs lean and one is snapped; broken, four are snapped low, two lean hard, one is gone
// and the top rail hangs from one end.
export function palisadeMesh(gy, stage, seed = 1) { const m = buildMats(), R = mulberry32(seed * 7919 + 13), bark = [], cut = [], planks = [], iron = [];
  const N = 9, step = 2 / N, broken = new Set(), lean = new Map(), gone = new Set(), pick = () => Math.floor(R() * N);
  if (stage >= 1) { broken.add(pick()); for (let k = 0; k < 2; k++) lean.set(pick(), (R() < 0.5 ? -1 : 1) * (0.07 + R() * 0.06)); }
  if (stage >= 2) { for (let k = 0; k < 3; k++) broken.add(pick()); for (let k = 0; k < 2; k++) lean.set(pick(), (R() < 0.5 ? -1 : 1) * (0.2 + R() * 0.12)); gone.add(pick()); }
  for (let k = 0; k < N; k++) { if (gone.has(k)) continue; const x = -1 + step * (k + 0.5) + (R() - 0.5) * 0.02, g0 = gy(x), r = 0.1 + R() * 0.018;
    const top = broken.has(k) ? g0 + (stage >= 2 ? 0.5 + R() * 0.7 : 1.3 + R() * 0.5) : g0 + 2.3 + (R() - 0.5) * 0.22;
    const [g, t] = log(r, g0 - 0.35, top, broken.has(k) ? 'broken' : 'point'); const l = lean.get(k);
    if (l) tilt([g, t], (R() - 0.5) * 0.08, l, 0, g0, 0);
    g.translate(x, 0, 0); t.translate(x, 0, 0); bark.push(g); cut.push(t); }
  const mid = Math.min(gy(-0.6), gy(0), gy(0.6));
  for (const [h, k] of [[0.55, 0], [1.75, 1]]) { const hang = stage >= 2 && k === 1;
    planks.push(hang ? box(1.3, 0.17, 0.06, 0.25, mid + h - 0.35, 0.15, 0, 0, -0.42) : box(2.02, 0.17, 0.06, 0, mid + h, 0.15));
    if (!hang) for (const x of [-0.78, 0, 0.78]) iron.push(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 6).rotateX(Math.PI / 2).translate(x, mid + h, 0.19)); }
  if (stage < 2) iron.push(box(2.0, 0.07, 0.24, 0, mid + 2.02, 0));
  return group([[merge(bark), m.bark], [merge(cut), m.cut], [merge(planks), m.planks], [merge(iron), m.iron]]); }

// The reinforced wall: dressed stone in six courses (each block a little out of line), flat capstones on top. Damaged,
// blocks are gone from the top courses and a few pushed out; broken, the top half is mostly down and lies at its foot.
export function stoneMesh(gy, stage, seed = 1) { const m = buildMats(), R = mulberry32(seed * 104729 + 7), blocks = [], caps = [];
  const base = Math.min(gy(-1), gy(0), gy(1)) - 0.3, top = Math.max(gy(-1), gy(0), gy(1)) + 2.2, C = Math.max(5, Math.round((top - base) / 0.42)), ch = (top - base) / C;
  for (let c = 0; c < C; c++) { let x = -1 + (c % 2 ? 0.3 : 0) - 0.3; const y = base + ch * (c + 0.5), upper = (c + 1) / C;
    while (x < 1) { const L = 0.45 + R() * 0.3, x0 = Math.max(-1, x), x1 = Math.min(1, x + L); x += L; if (x1 - x0 < 0.12) continue;
      if (stage >= 1 && upper > 0.66 && R() < (stage >= 2 ? 0.9 : 0.3)) continue; if (stage >= 2 && upper > 0.45 && R() < 0.65) continue;
      const push = stage >= 1 && R() < 0.12 ? (R() - 0.5) * 0.24 : 0;
      blocks.push(box(x1 - x0 - 0.025, ch - 0.025, 0.56 + (R() - 0.5) * 0.05, (x0 + x1) / 2, y, push + (R() - 0.5) * 0.02, (R() - 0.5) * 0.03, (R() - 0.5) * 0.04, (R() - 0.5) * 0.03)); } }
  if (stage === 0) for (let x = -1; x < 1 - 0.05; x += 0.5) caps.push(box(0.49, 0.12, 0.68, x + 0.25, top + 0.06, 0, 0, (R() - 0.5) * 0.04, (R() - 0.5) * 0.02));
  if (stage >= 1) for (let k = 0; k < stage * 4; k++) { const s = 0.3 + R() * 0.25; blocks.push(box(s * 1.4, s * 0.8, s, (R() - 0.5) * 1.8, gy(0) + s * 0.3, (R() < 0.5 ? -1 : 1) * (0.45 + R() * 0.5), R(), R() * 3, R())); }
  const g = merge(blocks), cg = merge(caps); if (g) boxUV(g, 2.2); if (cg) boxUV(cg, 2.2);
  return group([[g, m.stone], [cg, m.cap]]); }

// what is left after a wall falls: logs lying in a jumble with a few stubs standing, or a heap of stone blocks
export function rubbleMesh(gy, stone, seed = 1) { const m = buildMats(), R = mulberry32(seed * 31337 + 3), a = [], b = [];
  if (stone) { for (let k = 0; k < 18; k++) { const s = 0.25 + R() * 0.3, x = (R() - 0.5) * 2.1; a.push(box(s * 1.5, s * 0.8, s, x, gy(x) + s * 0.25 + R() * 0.15, (R() - 0.5) * 1.6, R() - 0.5, R() * 3, R() - 0.5)); }
    const g = merge(a); boxUV(g, 2.2); return group([[g, m.stone]]); }
  for (let k = 0; k < 6; k++) { const x = (R() - 0.5) * 1.8, L = 1.2 + R() * 1.0, y = gy(x) + 0.12, [g, t] = log(0.1, -L / 2, L / 2, 'broken');
    for (const q of [g, t]) q.rotateZ(Math.PI / 2 + (R() - 0.5) * 0.3).rotateY((R() - 0.5) * 1.2).translate(x, y + (k % 3) * 0.12, (R() - 0.5) * 1.4); a.push(g); b.push(t); }
  for (let k = 0; k < 4; k++) { const x = -0.9 + R() * 1.8, g0 = gy(x), [g, t] = log(0.1, g0 - 0.3, g0 + 0.25 + R() * 0.4, 'broken'); g.translate(x, 0, 0); t.translate(x, 0, 0); a.push(g); b.push(t); }
  return group([[merge(a), m.bark], [merge(b), m.cut]]); }

// Where walls meet: a thick post (palisade) or a stone pillar (when a reinforced wall uses the corner); `g0` is the
// ground under it, relative to its own base.
export function postMesh(g0, stone) { const m = buildMats();
  if (stone) { const g = box(0.74, 2.9, 0.74, 0, g0 - 0.3 + 1.45, 0); boxUV(g, 2.2); const c = box(0.86, 0.14, 0.86, 0, g0 + 2.67, 0); boxUV(c, 2.2); return group([[g, m.stone], [c, m.cap]]); }
  const [g, t] = log(0.17, g0 - 0.4, g0 + 2.6, 'point'), band = box(0.38, 0.08, 0.38, 0, g0 + 2.05, 0);
  return group([[g, m.bark], [t, m.cut], [band, m.iron]]); }

// The gate: a lintel log across the top of the 2 m opening on its two posts, and one plank leaf (seven boards, two
// ledges and a brace, iron strap hinges and a ring pull) hung on a pivot at its left end. leaf.rotation.y swings it.
export function gateMesh(gy, stage = 0) { const m = buildMats(), mid = Math.min(gy(-0.8), gy(0), gy(0.8)), g = new THREE.Group();
  const [lg] = log(0.13, -1.12, 1.12, 'flat'); lg.rotateZ(Math.PI / 2).translate(0, mid + 2.78, 0); g.add(group([[lg, m.bark]]));
  const pivot = new THREE.Group(); pivot.position.set(-0.86, mid + 0.08, 0); const W = 1.7, H = 2.3, pl = [], ir = [];
  for (let k = 0; k < 7; k++) { if (stage >= 2 && (k === 2 || k === 5)) continue; const h = stage >= 1 && k === 4 ? H - 0.5 : H; pl.push(box(W / 7 - 0.012, h, 0.06, W / 7 * (k + 0.5), h / 2, 0)); }
  for (const y of [0.42, 1.88]) pl.push(box(W - 0.08, 0.2, 0.05, W / 2, y, 0.055));
  pl.push(box(0.16, Math.hypot(W - 0.3, 1.3), 0.045, W / 2, 1.15, 0.055, 0, 0, Math.atan2(W - 0.3, 1.3)));
  for (const y of [0.42, 1.88]) { ir.push(box(0.7, 0.07, 0.015, 0.33, y, -0.04)); ir.push(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8).translate(0.0, y, 0)); }
  ir.push(new THREE.TorusGeometry(0.06, 0.012, 6, 14).translate(W - 0.22, 1.1, 0.1));
  const leaf = group([[merge(pl), m.planks], [merge(ir), m.iron]]); pivot.add(leaf); g.add(pivot); g.userData.leaf = pivot; return g; }

// The spike trap: a square frame of four logs with a dozen sharpened stakes slanting up and out of it. Spent, the stakes
// are snapped and flattened, with a dark stain on the ground.
export function spikeMesh(gy, spent, seed = 1) { const m = buildMats(), R = mulberry32(seed * 2654435 + 1), a = [], b = [], g0 = gy(0), S = 0.62, st = [];
  for (const [x, z, ry] of [[0, -S, 0], [0, S, 0], [-S, 0, Math.PI / 2], [S, 0, Math.PI / 2]]) { const [g] = log(0.075, -S - 0.08, S + 0.08, 'flat'); g.rotateZ(Math.PI / 2).rotateY(ry).translate(x, gy(x) + 0.06 - g0, z); a.push(g); }
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const x = -0.45 + i * 0.3 + (R() - 0.5) * 0.08, z = -0.36 + j * 0.36 + (R() - 0.5) * 0.08, L = spent ? 0.18 + R() * 0.12 : 0.55 + R() * 0.15;
    const [g, t] = log(0.034, 0, L, spent ? 'broken' : 'point'), ang = spent ? 0.9 + R() * 0.5 : 0.18 + R() * 0.2, dir = Math.atan2(z, x) + (R() - 0.5) * 0.6;
    for (const q of [g, t]) q.rotateZ(-ang).rotateY(-dir).translate(x, gy(x) - g0 - 0.05, z); a.push(g); b.push(t); }
  if (spent) st.push(new THREE.CircleGeometry(0.7, 16).rotateX(-Math.PI / 2).translate(0, 0.03, 0));
  return group([[merge(a), m.bark], [merge(b), m.cut], [merge(st), m.stain]]); }
