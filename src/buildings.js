// Buildings (run 2, slice 8): the ruined town at the heart of The Ruins (stone houses along its broken streets, a few
// still roofed, most roofless shells with fallen timbers and rubble, and a watchtower like IW1's), one landmark per
// biome (the Waste's gas station after IW1's structures.js, a Frostline stone hut, a Glass Desert adobe, a Bog cabin, a
// Greenbelt farmhouse beyond the ring, an overgrown Fungal Hollow ruin), raider camps (tents round a fire, a scrap
// barricade, a guarded supply crate) and supply crates to search (E). Walls collide as chains of small circles with real
// gaps at the doorways. planBuildings() runs before the props are placed (they keep out of every footprint, and it adds
// the camps' scrap and the station's wrecks); buildBuildings() makes the meshes, colliders and crates; tickBuildings()
// lifts the roof off the building the player is in (third-person cameras) and hides far buildings.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HALF, WATER_Y, SEED, Q } from './config.js';
import { mulberry32, vnoise } from './noise.js';
import { groundY, biomeAt, slopeAt, isWet, canyonAt, street } from './world.js';
import { addCollider, surfaces } from './props.js';
import { pbr, boxUV, loadMesh, canvasTex } from './propmodels.js';
import { buildFire, buildTent } from './camp.js';

export const buildings = [], caches = [], raiderCamps = [];
const sites = [], R = mulberry32(SEED ^ 0x8b1d5); // its own stream: the props' layout stays as it was
export const clearOf = (x, z, pad = 0) => sites.every(s => Math.hypot(x - s.x, z - s.z) > s.r + pad);
// inside a building's walls (the gas station: its forecourt too), where no grass grows
export function indoors(x, z) { for (const b of buildings) { if (Math.abs(x - b.x) + Math.abs(z - b.z) > b.w + b.d) continue;
  const [lx, lz] = toL(b, x, z); if (Math.abs(lx) < b.w / 2 && Math.abs(lz) < b.d / 2) return true; } return false; }

// ── Planning: where things go (data only, before the props) ─────────────────────────────────────────────────────
// level, dry, open ground of radius r around (x, z)
function level(x, z, r, minY = WATER_Y + 1, tol = 0.12) { const y0 = groundY(x, z); if (y0 < minY || y0 > 60 || slopeAt(x, z) > 0.2) return false;
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (Math.abs(groundY(px, pz) - y0) > Math.max(0.6, r * tol) || isWet(px, pz) || canyonAt(px, pz) > 0.3) return false; } return true; }
const deep = (x, z, b, r) => [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([a, c]) => biomeAt(x + a, z + c) === b);
// the nearest such spot to the centre, at least minR out, in biome b, well clear of everything planned so far
function findSite(b, minR, r, minY) { let best = null, bd = 1e9;
  for (let z = -HALF + 70; z < HALF - 70; z += 8) for (let x = -HALF + 70; x < HALF - 70; x += 8) { const d = Math.hypot(x, z);
    if (d < minR || d >= bd || !deep(x, z, b, r + 12) || !clearOf(x, z, r + 30) || !level(x, z, r, minY)) continue; best = { x, z }; bd = d; }
  return best; }
// a building record: its frame (heading a: local +x is world (cos a, sin a), local -z is its front), footprint and parts
function bld(kind, x, z, a, o) { const b = { kind, x, z, a, ca: Math.cos(a), sa: Math.sin(a), y: groundY(x, z), seed: R() * 100, doors: [], walls: [], ...o };
  buildings.push(b); sites.push({ x, z, r: Math.hypot(b.w, b.d) / 2 + 1.5 }); return b; }
const toW = (b, lx, lz) => [b.x + lx * b.ca - lz * b.sa, b.z + lx * b.sa + lz * b.ca];
const toL = (b, x, z) => { const dx = x - b.x, dz = z - b.z; return [dx * b.ca + dz * b.sa, -dx * b.sa + dz * b.ca]; };

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
    const s = findSite(bio, 260, 12); if (!s) continue; const c = { id: raiderCamps.length, x: s.x, z: s.z, raiders: crew, a0: R() * 6.283 };
    raiderCamps.push(c); sites.push({ x: s.x, z: s.z, r: 14 });
    for (let k = 0; k < 11; k++) { const a = c.a0 + k * 0.57; if (k === 3 || k === 8) continue; // a scrap barricade with two ways in
      adds.push(['scrap', { x: s.x + Math.cos(a) * 11.5, z: s.z + Math.sin(a) * 11.5, s: 1 + R() * 0.3, ry: a, v: k % 6 }]); }
    adds.push(['hulk', { x: s.x + Math.cos(c.a0 + 1.71) * 15.5, z: s.z + Math.sin(c.a0 + 1.71) * 15.5, s: 1, ry: c.a0, v: 0 }]); }
  for (const [, it] of adds) it.y = groundY(it.x, it.z) - 0.1;
  return adds;
}

// ── Building: meshes, colliders, crates ────────────────────────────────────────────────────────────────────────
let MAT = null, CRATE = null;
const TILE = { wall: 2.2, brick: 2, plaster: 1.6, planks: 2, roof: 2.4, ceil: 2, concrete: 3, floor: 2, paint: 1.5, iron: 2, beam: 2, moss: 2.2 };
function mats() { if (MAT) return MAT; const base = {}; // one load per texture: variants are clones, which share the maps
  const t = (n, o = {}) => { const m = (base[n] ||= pbr('props/' + n)).clone(); m.roughness = o.rough ?? 0.92; m.metalness = o.metal ?? 0; m.color.set(o.color ?? 0xffffff); m.side = o.side ?? THREE.FrontSide; return m; };
  MAT = { wall: t('wall'), brick: t('brick'), plaster: t('plaster', { color: 0xe6c8a0 }), planks: t('planks', { rough: 0.85, color: 0xd8a878 }), roof: t('rooftile'),
    ceil: t('planks', { color: 0xc89870, side: THREE.DoubleSide }), beam: t('planks', { color: 0xa07850 }), concrete: t('concrete'), floor: pbr('terrain/paving', { rough: 0.95, color: 0xd0b898 }),
    paint: t('iron', { color: 0xc04a36, metal: 0.3, rough: 0.6 }), iron: t('iron', { metal: 0.35, rough: 0.75, side: THREE.DoubleSide }), moss: t('wall', { color: 0x7a8a6a }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x7a3426, roughness: 0.95 }), ring: new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }),
    sign: new THREE.MeshStandardMaterial({ roughness: 0.7, map: canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#e8dcc0'; x.font = 'bold 74px sans-serif'; x.textAlign = 'center'; x.fillText('FUEL', w / 2, 92);
      x.fillStyle = 'rgba(70,40,20,0.5)'; for (let i = 0; i < 300; i++) x.fillRect(Math.random() * w, Math.random() * h, 3, 2); }, '#8a2a1e') }) };
  // indoors seen from a third-person camera, every building is cut away above the player's waist (and its roof lifted)
  MAT.plaster.normalScale.set(2.2, 2.2); // the clay plaster reads flat at its own relief
  for (const m of Object.values(MAT)) m.clippingPlanes = [CUT];
  return MAT; }
const CUT = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
function tinted(hex) { return MAT['roof' + hex] ||= (() => { const m = MAT.roof.clone(); m.color.set(hex); m.clippingPlanes = [CUT]; return m; })(); } // snow on the hut, a dark Bog roof
const box = (P, k, sx, sy, sz, x, y, z, ry = 0, rx = 0, rz = 0) => P[k].push(new THREE.BoxGeometry(sx, sy, sz).rotateZ(rz).rotateX(rx).rotateY(ry).translate(x, y, z));
// ground height under a point of the building's frame, as an offset from its base
const gAt = (b, lx, lz) => { const [x, z] = toW(b, lx, lz); return groundY(x, z); };

// collision along a solid run of wall: circles of 0.3 m every 0.45 m, inset so a doorway keeps its full width
// topAt(lx, lz) is the solid's top there (shots pass over lower walls)
function collideRun(b, lx0, lz0, lx1, lz1, r = 0.3, topAt = () => b.y + 3) { const L = Math.hypot(lx1 - lx0, lz1 - lz0); if (L < 0.05) { const [x, z] = toW(b, lx0, lz0); Object.assign(addCollider(x, z, r, b), { vr: 0, top: topAt(lx0, lz0), stand: r > 0.2 ? topAt(lx0, lz0) : null }); return; }
  const n = Math.max(1, Math.ceil((L - 2 * r) / 0.45));
  for (let k = 0; k <= n; k++) { const s = L <= 2 * r ? L / 2 : r + (L - 2 * r) * k / n, lx = lx0 + (lx1 - lx0) * s / L, lz = lz0 + (lz1 - lz0) * s / L, [x, z] = toW(b, lx, lz); Object.assign(addCollider(x, z, r, b), { vr: 0, top: topAt(lx, lz), stand: r > 0.2 ? topAt(lx, lz) : null }); } }
// a roof or floor a foot can stand on: at(lx, lz) gives its height in the building's frame, or null off its edge
function surface(b, at) { surfaces.push({ x: b.x, z: b.z, r: Math.max(b.w, b.d) / 2 + 1.5, at: (x, z) => { const [lx, lz] = toL(b, x, z); return at(lx, lz); } }); }
export const ladders = []; // the tower's: y0 to y1, at(y) is where the climber's feet are at that height, off the step-off point at the top
export function ladderAt(x, z, y) { for (const l of ladders) { if (y < l.y0 - 0.3 || y > l.y1 + 0.1) continue; const [lx, lz] = l.at(Math.min(l.y1, Math.max(l.y0, y))); if (Math.hypot(lx - x, lz - z) < 0.7) return l; } return null; }
// a straight wall along the frame's x or z axis, from (x0, z0) to (x1, z1): solid runs between the openings (a door is a
// gap with a lintel, a window a gap between sill and head); a ruined wall breaks into blocks that lose their tops
function wall(b, P, k, x0, z0, x1, z1, h, holes = []) {
  const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, along = Math.abs(ux) > 0.5, t = b.t || 0.45, ruin = b.ruin || 0;
  const hs = holes.map(o => ({ ...o, s0: L / 2 + o.at - o.w / 2, s1: L / 2 + o.at + o.w / 2 })).sort((p, q) => p.s0 - q.s0);
  const piece = (s0, s1, y0, y1) => { if (s1 - s0 < 0.02 || y1 - y0 < 0.02) return; const c = (s0 + s1) / 2;
    box(P, k, along ? s1 - s0 : t, y1 - y0, along ? t : s1 - s0, x0 + ux * c, (y0 + y1) / 2, z0 + uz * c); };
  const foot = (s) => Math.min(gAt(b, x0 + ux * s, z0 + uz * s), b.y) - 0.8; // walls run on down into the ground
  const top = (s) => { if (!ruin) return b.y + h; const e = Math.min(1, Math.min(s, L - s) / 1.4), v = vnoise((x0 + ux * s) * 0.7 + b.seed, (z0 + uz * s) * 0.7); // corners stand tallest
    return b.y + h * Math.max(b.minTop ?? 0.18, 1 - ruin * Math.min(1, v * 1.5) * (0.35 + 0.65 * e)); };
  const topAt = (lx, lz) => top((lx - x0) * ux + (lz - z0) * uz);
  let s = 0; const runs = []; for (const o of hs) { runs.push([s, o.s0]); s = o.s1; } runs.push([s, L]);
  for (const [s0, s1] of runs) { const n = ruin ? Math.max(1, Math.round((s1 - s0) / 0.7)) : 1;
    for (let i = 0; i < n; i++) { const a = s0 + (s1 - s0) * i / n, c = s0 + (s1 - s0) * (i + 1) / n; piece(a, c, Math.min(foot(a), foot(c)), top((a + c) / 2)); }
    collideRun(b, x0 + ux * s0, z0 + uz * s0, x0 + ux * s1, z0 + uz * s1, 0.3, topAt); }
  for (const o of hs) { const tp = top((o.s0 + o.s1) / 2), mid = (o.s0 + o.s1) / 2;
    if (o.type === 'door') { if (tp > b.y + o.hgt + 0.2) piece(o.s0, o.s1, b.y + o.hgt, tp);
      b.doors.push({ lx: x0 + ux * mid, lz: z0 + uz * mid, nx: uz, nz: -ux }); }  // the outward normal (walls run so that it is)
    else { const ys = [Math.min(foot(o.s0), foot(o.s1)), ...o.gaps.flat().map(v => b.y + v), tp]; // stone between and around the openings
      for (let i = 0; i < ys.length; i += 2) piece(o.s0, o.s1, ys[i], Math.min(ys[i + 1], tp));
      collideRun(b, x0 + ux * o.s0, z0 + uz * o.s0, x0 + ux * o.s1, z0 + uz * o.s1, 0.3, topAt); } }
  // a solid spot on this wall for the walk test: the longest run's middle, if the wall still stands above 1.2 m there
  const [r0, r1] = runs.reduce((p, q) => (q[1] - q[0] > p[1] - p[0] ? q : p)); const m = (r0 + r1) / 2;
  if (r1 - r0 > 1.2 && top(m) > b.y + 1.2) b.walls.push({ lx: x0 + ux * m, lz: z0 + uz * m, nx: uz, nz: -ux });
}
const door = (at = 0, w = 1.6, hgt = 2.2) => ({ type: 'door', at, w, hgt }), win = (at, w = 0.9, gaps = [[0.95, 1.9]]) => ({ type: 'window', at, w, gaps });
// four walls round a w x d room, wound so every wall's outward normal is (uz, -ux); the front (-z) holds the door
function room(b, P, k, w, d, h, front, back = [], left = [], right = []) { const t = b.t || 0.45, hw = w / 2, hd = d / 2;
  wall(b, P, k, -hw - t / 2, -hd, hw + t / 2, -hd, h, front); wall(b, P, k, hw + t / 2, hd, -hw - t / 2, hd, h, back);
  wall(b, P, k, -hw, hd - t / 2, -hw, -hd + t / 2, h, left); wall(b, P, k, hw, -hd + t / 2, hw, hd - t / 2, h, right); }
// a floor that follows the ground inside the walls
function floor(b, P, k, w, d, cx = 0, cz = 0, lift = 0.04) { const g = new THREE.PlaneGeometry(w, d, Math.ceil(w / 1.5), Math.ceil(d / 1.5)).rotateX(-Math.PI / 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, gAt(b, cx + p.getX(i), cz + p.getZ(i)) + lift); g.translate(cx, 0, cz); g.computeVertexNormals(); P[k].push(g); }
// a gable roof over w x d (ridge along x) with plank boarding underneath and the gable ends in the wall stone
// (the walls' centrelines are at x = +-w/2 and z = +-d/2; roof parts go in b.PR, which lifts off when the player is inside)
function gable(b, P, w, d, h, rh, k) { const t = b.t || 0.45, top = b.y + h, D = d / 2 + t / 2, half = D + 0.45, sl = Math.atan2(rh, D), len = half / Math.cos(sl), yE = top - 0.45 * rh / D;
  surface(b, (lx, lz) => Math.abs(lx) <= (w + t + 0.7) / 2 && Math.abs(lz) <= half ? top + rh * (1 - Math.abs(lz) / D) + 0.16 : null);
  for (const s of [-1, 1]) { const zm = s * half / 2, ym = (yE + top + rh) / 2 + 0.07;
    box(b.PR, 'roof', w + t + 0.7, 0.14, len, 0, ym, zm, 0, s * sl); box(b.PR, 'ceil', w - t, 0.03, len - 0.6, 0, ym - 0.12, zm * 0.95, 0, s * sl); }
  box(b.PR, 'roof', w + t + 0.75, 0.16, 0.3, 0, top + rh + 0.12, 0);
  const tri = new THREE.Shape([new THREE.Vector2(-D, 0), new THREE.Vector2(D, 0), new THREE.Vector2(0, rh)]);
  for (const s of [-1, 1]) P[k].push(new THREE.ExtrudeGeometry(tri, { depth: t, bevelEnabled: false }).rotateY(Math.PI / 2).translate(s * w / 2 - t / 2, top, 0)); }
// stone chunks in a heap
function rubble(b, P, k, lx, lz, s = 1, n = 9) { for (let i = 0; i < n; i++) { const a = R() * 6.283, r = R() * s, q = 0.18 + R() * 0.4 * s, x = lx + Math.cos(a) * r, z = lz + Math.sin(a) * r;
  box(P, k, q * (1 + R()), q * (0.6 + R() * 0.5), q * (1 + R()), x, gAt(b, x, z) + q * 0.25 * (1.3 - r / s), z, R() * 3, R() * 0.6, R() * 0.6); } }
function table(b, P, x, z, ry) { const y = gAt(b, x, z); box(P, 'planks', 1.4, 0.06, 0.8, x, y + 0.76, z, ry);
  for (const [a, c] of [[0.62, 0.32], [-0.62, 0.32], [0.62, -0.32], [-0.62, -0.32]]) box(P, 'beam', 0.07, 0.74, 0.07, x + a * Math.cos(ry) + c * Math.sin(ry), y + 0.37, z - a * Math.sin(ry) + c * Math.cos(ry)); }
function stool(b, P, x, z) { const y = gAt(b, x, z); box(P, 'planks', 0.38, 0.05, 0.38, x, y + 0.45, z, R()); for (const [a, c] of [[0.13, 0.13], [-0.13, 0.13], [0.13, -0.13], [-0.13, -0.13]]) box(P, 'beam', 0.05, 0.44, 0.05, x + a, y + 0.22, z + c); }
// a supply crate to search: a Poly Haven crate with a soft gold ring on the ground while it is still full
function cache(b, g, lx, lz, camp = null) { const [x, z] = toW(b, lx, lz), m = new THREE.Mesh(CRATE.geo, CRATE.mat), y = groundY(x, z);
  m.scale.setScalar(1.25); m.position.set(x, y, z); m.rotation.y = -b.a + R() * 0.6; m.castShadow = m.receiveShadow = true; g.add(m);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32).rotateX(-Math.PI / 2), mats().ring); ring.position.set(x, y + 0.05, z); g.add(ring);
  const col = Object.assign(addCollider(x, z, 0.6, b), { vr: 0, top: y + 0.8, stand: y + CRATE.h });
  // a few hits smash it (game.js): the crate is gone, its collider with it
  col.cache = { x, z, y, camp, hp: 3, opened: false, open() { this.opened = true; ring.visible = false; m.rotation.z = 0.12; m.position.y -= 0.05; },
    smash() { this.broken = true; this.opened = true; ring.visible = false; m.visible = false; col.r = 0; } }; caches.push(col.cache); }
// a corner of the room, not the same one in every house (the door's corners are at -z)
const corner = (w, d) => [[-1, 1], [1, -1], [-1, -1]][Math.floor(R() * 3)].map((s, i) => s * ((i ? d : w) / 2 - 0.75));

function furnish(b, P, g, w, d) { const hw = w / 2 - 0.45, hd = d / 2 - 0.45; // the door is at (0, -d/2): the way in stays clear
  if (b.furnish === 'home') { table(b, P, hw * 0.35, hd * 0.25, 0.1); stool(b, P, hw * 0.35 - 0.95, hd * 0.25); stool(b, P, hw * 0.35 + 0.95, hd * 0.25 + 0.1);
    // a bed in the back corner, a shelf on the left wall
    const bx = hw - 0.5, bz = hd - 1.05, by = gAt(b, bx, bz); box(P, 'beam', 0.95, 0.35, 2.05, bx, by + 0.2, bz); P.cloth.push(new THREE.BoxGeometry(0.88, 0.12, 1.55).translate(bx, by + 0.42, bz + 0.2));
    const sx = -hw + 0.2, sy = gAt(b, sx, 0); for (const y of [0.4, 1.0, 1.6]) box(P, 'planks', 0.32, 0.04, 1.6, sx, sy + y, 0); for (const z of [-0.78, 0.78]) box(P, 'beam', 0.32, 1.8, 0.05, sx, sy + 0.9, z);
    cache(b, g, ...corner(w, d)); }
  else { rubble(b, P, b.moss ? 'moss' : b.mat, hw - 0.8, hd - 0.8, 1.4, 14); rubble(b, P, b.moss ? 'moss' : b.mat, -hw + 0.9, 0.4, 1.1, 10);
    const y = gAt(b, -0.5, hd * 0.4); box(P, 'beam', w * 0.85, 0.18, 0.2, -0.3, y + 0.55, hd * 0.4, 0.15, 0, 0.18); // a fallen roof beam
    if (R() < 0.6) cache(b, g, ...corner(w, d)); }
}

function buildHouse(b, P, g) { const { w, d, h } = b, k = b.moss ? 'moss' : b.mat;
  room(b, P, k, w, d, h, [door(0), ...(w > 6.2 ? [win(-w * 0.3), win(w * 0.3)] : [])], w > 5.2 ? [win(0)] : [], d > 5.4 ? [win(0)] : [], [win(-d * 0.15)]);
  floor(b, P, b.furnish === 'home' ? 'planks' : 'floor', w - 0.45, d - 0.45);
  if (b.roof === 'gable') { gable(b, P, w, d, h, Math.min(2, d * 0.32), k);
    // the door itself, standing open into the room against its jamb (solid: thin posts keep the walk off it)
    const [dl] = b.doors; box(P, 'planks', 0.06, 2.15, 1.5, dl.lx + 0.76, b.y + 1.08, dl.lz + 0.75, 0); collideRun(b, dl.lx + 0.76, dl.lz + 0.2, dl.lx + 0.76, dl.lz + 1.4, 0.1); }
  else if (b.roof === 'flat') { // adobe: a flat roof on log beams (their ends stick out of the wall), fallen in at the back
    box(b.PR, 'plaster', w + 0.3, 0.22, d * 0.55, 0, b.y + h + 0.05, -d * 0.22); surface(b, (lx, lz) => Math.abs(lx) <= (w + 0.3) / 2 && Math.abs(lz + d * 0.22) <= d * 0.275 ? b.y + h + 0.16 : null);
    for (let x = -w / 2 + 0.5; x < w / 2; x += 0.85) P.beam.push(new THREE.CylinderGeometry(0.09, 0.1, d * 0.62, 7).rotateX(Math.PI / 2).translate(x, b.y + h - 0.14, -d * 0.31 - 0.05)); }
  else if (b.roof === 'fallen') { // a few rafters fell in: each leans from the back wall's top down to the floor (they used to
    // tilt up into the room from the wall, unsupported, and read as floating: the owner, 2026-11-03); the rest of the roof lies on the floor
    const top = h * (1 - (b.ruin || 0) * 0.3) - 0.2;
    for (let x = -w / 2 + 0.6; x < w / 2 - 0.3; x += 1.3) { const len = 1.2 + R() * d * 0.45; if (R() < 0.35) continue; const a = Math.asin(Math.min(0.95, top / len));
      box(P, 'beam', 0.14, 0.18, len, x, b.y + 0.05 + len * Math.sin(a) / 2, d / 2 - 0.2 - len * Math.cos(a) / 2, 0, -a); }
    box(P, 'roof', w * 0.45, 0.14, d * 0.4, w * 0.15, gAt(b, w * 0.15, -d * 0.05) + 0.55, -d * 0.05, 0.3, 0.32, 0.12); }
  furnish(b, P, g, w, d); }

// IW1's watchtower: a square brick tower with arrow slits, crenellations and a broken crown, a ladder inside
function buildTower(b, P, g) { const { w, d, h } = b, slit = (at) => [win(at, 0.32, [[3.6, 4.8], [7.2, 8.4]])];
  b.minTop = 0.85; room(b, P, 'brick', w, d, h, [door(0, 1.7, 2.5), ...slit(-1.9), ...slit(1.9)], slit(0), slit(0), slit(0));
  for (const y of [b.y + 2.9, b.y + 6.2]) for (const [sx, sz] of [[w + b.t + 0.16, 0.16], [0.16, d + b.t + 0.16]]) for (const s of [-1, 1]) // stone string courses
    box(P, 'wall', sx, 0.24, sz, sx > 1 ? 0 : s * (w + b.t) / 2, y, sx > 1 ? s * (d + b.t) / 2 : 0);
  const t = b.t, top = b.y + h; // merlons along the parapet (missing where the crown has fallen)
  for (const [x0, z0, x1, z1] of [[-w / 2, -d / 2, w / 2, -d / 2], [w / 2, d / 2, -w / 2, d / 2], [-w / 2, d / 2, -w / 2, -d / 2], [w / 2, -d / 2, w / 2, d / 2]])
    for (let s = 0.4; s < 1; s += 0.3) { const x = x0 + (x1 - x0) * s, z = z0 + (z1 - z0) * s; if (vnoise(x * 0.7 + b.seed, z * 0.7) > 0.55) continue; box(P, 'brick', 0.8, 0.9, 0.8, x, top - h * 0.1 + 0.2, z); }
  floor(b, P, 'floor', w - t, d - t); const fw = (w - t) / 2, z0 = -d * 0.005, z1 = d * 0.445, hz = d / 2 - t / 2 - 1.55; // the old upper floor, half gone, with a hatch the ladder comes up through
  for (const s of [-1, 1]) box(P, 'beam', fw - 0.55, 0.2, z1 - z0, s * (fw + 0.55) / 2, b.y + 5.6, (z0 + z1) / 2); box(P, 'beam', 1.1, 0.2, hz - z0, 0, b.y + 5.6, (z0 + hz) / 2);
  surface(b, (lx, lz) => Math.abs(lx) <= fw && lz >= z0 && lz <= z1 && !(Math.abs(lx) < 0.55 && lz > hz) ? b.y + 5.7 : null); // the ladder climbs to it (slice 9b)
  ladders.push({ b, y0: b.y, y1: b.y + 5.7, off: toW(b, 0, hz - 0.5), at: (y) => toW(b, 0, d / 2 - t / 2 - 0.25 - (y - b.y) * 0.08 - 0.42) });
  for (const s of [-0.25, 0.25]) box(P, 'beam', 0.07, 5.8, 0.08, s, b.y + 2.85, d / 2 - t / 2 - 0.25, 0, -0.08); for (let y = 0.4; y < 5.6; y += 0.35) box(P, 'beam', 0.5, 0.05, 0.05, 0, b.y + y, d / 2 - t / 2 - 0.25 - y * 0.08);
  rubble(b, P, 'brick', w / 2 - 1.2, -d / 2 + 1.3, 1.1, 12); cache(b, g, -w / 2 + 1, -d / 2 + 1.1); }

// the gas station (IW1's GAS STATION): a concrete forecourt, a canopy on four posts over two pumps, a garage at the back
// with its roller door half up, a sign on a pole
function buildGas(b, P, g) { floor(b, P, 'concrete', 16, 11, 0, -3, 0.06);
  const gw = 8, gd = 6.5, gz = 5.6; b.roofBox = { cz: gz, w: gw, d: gd }; // the garage, in the station's frame
  b.t = 0.35; b.ruin = 0.12; b.h = 3.6;
  wall(b, P, 'concrete', -gw / 2 - 0.175, gz - gd / 2, gw / 2 + 0.175, gz - gd / 2, 3.6, [door(0, 3.4, 2.7)]);
  wall(b, P, 'concrete', gw / 2 + 0.175, gz + gd / 2, -gw / 2 - 0.175, gz + gd / 2, 3.6, [win(0, 1.6, [[1.1, 2.0]])]);
  wall(b, P, 'concrete', -gw / 2, gz + gd / 2 - 0.175, -gw / 2, gz - gd / 2 + 0.175, 3.6); wall(b, P, 'concrete', gw / 2, gz - gd / 2 + 0.175, gw / 2, gz + gd / 2 - 0.175, 3.6, [win(0.6, 1.4, [[1.1, 2.0]])]);
  b.ruin = 0; box(b.PR, 'concrete', gw + 0.5, 0.25, gd + 0.5, 0, b.y + 3.72, gz);
  box(P, 'iron', 3.4, 1.0, 0.06, 0, b.y + 2.25, gz - gd / 2 - 0.2); // the roller door, stuck half up
  floor(b, P, 'concrete', gw - 0.35, gd - 0.35, 0, gz, 0.07);
  const cy = b.y + 4.5; box(P, 'concrete', 12, 0.4, 7.2, 0, cy, -4); box(P, 'paint', 12.15, 0.55, 7.35, 0, cy + 0.02, -4); // the canopy and its red fascia
  for (const sx of [-4.8, 4.8]) for (const sz of [-6.6, -1.4]) { box(P, 'concrete', 0.38, 4.5, 0.38, sx, b.y + 2.1, sz); collideRun(b, sx, sz, sx, sz, 0.32); }
  for (const sx of [-1.7, 1.7]) { box(P, 'concrete', 1.3, 0.25, 0.9, sx, b.y + 0.15, -4); box(P, 'paint', 0.8, 1.45, 0.52, sx, b.y + 0.95, -4); box(P, 'iron', 0.86, 0.32, 0.56, sx, b.y + 1.8, -4);
    box(P, 'iron', 0.08, 0.5, 0.1, sx + 0.42, b.y + 1.05, -4); collideRun(b, sx - 0.25, -4, sx + 0.25, -4, 0.5); }
  const [px, pz] = [7.6, -9]; box(P, 'iron', 0.16, 6, 0.16, px, gAt(b, px, pz) + 3, pz); collideRun(b, px, pz, px, pz, 0.3);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 0.12), [mats().paint, mats().paint, mats().paint, mats().paint, mats().sign, mats().sign]);
  sign.position.set(px, gAt(b, px, pz) + 6.4, pz); sign.castShadow = true; b.group.add(sign);
  // the garage inside: a workbench, barrels, a cache (IW1: metal, ammo and food, always)
  table(b, P, 2.4, gz + 2.3, 0); box(P, 'iron', 1.6, 0.9, 0.5, -2.6, b.y + 0.45, gz + 2.7); rubble(b, P, 'concrete', 2.8, gz - 1.6, 0.8, 6);
  cache(b, g, -2.6, gz + 1.4); cache(b, g, 0, -4.9); }

export async function buildBuildings(scene) {
  if (!CRATE) { CRATE = { geo: await loadMesh('wooden_crate_01'), mat: pbr('props/wooden_crate_01', { rough: 0.85 }) }; CRATE.geo.computeBoundingBox(); CRATE.h = CRATE.geo.boundingBox.max.y * 1.25; }
  const M = mats(), root = new THREE.Group(); root.name = 'buildings'; scene.add(root);
  for (const b of buildings) { const g = new THREE.Group(); g.position.set(b.x, 0, b.z); g.rotation.y = -b.a; root.add(b.group = g);
    const P = Object.fromEntries(Object.keys(TILE).concat('cloth').map(k => [k, []])); b.PR = Object.fromEntries(Object.keys(TILE).map(k => [k, []]));
    if (b.kind === 'house') buildHouse(b, P, root); else if (b.kind === 'tower') buildTower(b, P, root); else buildGas(b, P, root);
    const roof = new THREE.Group(); g.add(roof); b.roofGroup = roof;
    for (const [parts, into] of [[P, g], [b.PR, roof]]) for (const k in parts) { if (!parts[k].length) continue;
      const geo = mergeGeometries(parts[k].map(q => q.index ? q.toNonIndexed() : q)); if (k !== 'cloth') boxUV(geo, TILE[k]);
      const m = new THREE.Mesh(geo, k === 'roof' && b.tint ? tinted(b.tint) : M[k]); m.castShadow = k !== 'floor'; m.receiveShadow = true; into.add(m); }
    delete b.PR; }
  // the town's street rubble
  if (buildings.town?.rubble.length) { const P = { wall: [] }, t = { x: 0, z: 0, ca: 1, sa: 0 };
    for (const r of buildings.town.rubble) { rubble(t, P, 'wall', r.x, r.z, r.s * 1.4, 8); Object.assign(addCollider(r.x, r.z, r.s * 0.9, null), { vr: 0, top: groundY(r.x, r.z) + r.s * 0.6, stand: groundY(r.x, r.z) + r.s * 0.6 }); }
    const geo = mergeGeometries(P.wall.map(q => q.toNonIndexed())); boxUV(geo, TILE.wall); const m = new THREE.Mesh(geo, M.wall); m.castShadow = m.receiveShadow = true; root.add(m); }
  // raider camps: three tents round a fire (no light: lights cost every material), a crate the raiders guard
  for (const c of raiderCamps) { const t = { x: c.x, z: c.z, a: c.a0, ca: Math.cos(c.a0), sa: Math.sin(c.a0) };
    buildFire(root, c.x, c.z, false);
    for (let k = 0; k < 3; k++) { const a = c.a0 + 0.9 + k * 2.1, dx = Math.cos(a) * 5.5, dz = Math.sin(a) * 5.5, tent = buildTent(true);
      tent.rotation.y = Math.atan2(dz, -dx); tent.position.set(c.x + dx, groundY(c.x + dx, c.z + dz), c.z + dz); tent.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = !m.userData.thin; } });
      root.add(tent); Object.assign(addCollider(c.x + dx, c.z + dz, 1.5, c), { vr: 0, top: tent.position.y + 1.5 }); }
    cache(t, root, 2.6, 0.4, c); }
}

// the roof comes off the building the player stands in (not in first person: there it is the ceiling); far ones hide
export function tickBuildings(cam, x, z, y, firstPerson) { CUT.constant = 1e6;
  for (const b of buildings) { b.group.visible = Math.hypot(cam.x - b.x, cam.z - b.z) < Q.drawDist * 0.8;
    const [lx, lz] = toL(b, x, z), r = b.roofBox || { cz: 0, w: b.w, d: b.d }; const inside = Math.abs(lx) < r.w / 2 + 0.5 && Math.abs(lz - r.cz) < r.d / 2 + 0.5 && !(y > b.y + (b.h ?? 99) - 0.2); // on the roof is not inside
    b.roofGroup.visible = firstPerson || !inside; if (inside && !firstPerson) CUT.constant = Math.max(groundY(x, z), y) + 1.3; } }
