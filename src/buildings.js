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
import { Q, SEED, DEFAULT_SEED, WATER_Y, CAMP } from './config.js';
import { vnoise, mulberry32 } from './noise.js';
import { groundY, biomeAt } from './world.js';
import { buildings, raiderCamps, places, R, toW, toL } from './plan.js';
import { islands } from './world.js';
import { mushroomParts } from './landmarks.js';
import { addCollider, surfaces, colliders } from './props.js';
import { buildKind, dressDoor, dressWindow, porchOn } from './houses.js';
import { pbr, boxUV, loadMesh, canvasTex, rockMat, glowcapParts } from './propmodels.js';
import { buildFire, buildTent } from './camp.js';

export const caches = [];
export { buildings, raiderCamps, clearOf, indoors, planBuildings } from './plan.js';

// ── Building: meshes, colliders, crates ────────────────────────────────────────────────────────────────────────
let MAT = null, CRATE = null;
const TILE = { hull: 2.4, snow: 3, wall: 2.2, brick: 2, plaster: 1.6, planks: 2, roof: 2.4, ceil: 2, concrete: 3, floor: 2, paint: 1.5, iron: 2, beam: 2, moss: 2.2, seat: 0.6, carpet: 1.6, earth: 4, inwall: 1.8, adobe: 2.0 }; // (inwall, slice 36: a kind's painted plaster inside) // (the last three: the plane's, made with it)
export function mats() { if (MAT) return MAT; const base = {}; // one load per texture: variants are clones, which share the maps
  const t = (n, o = {}) => { const m = (base[n] ||= pbr('props/' + n)).clone(); m.roughness = o.rough ?? 0.92; m.metalness = o.metal ?? 0; m.color.set(o.color ?? 0xffffff); m.side = o.side ?? THREE.FrontSide; return m; };
  MAT = { wall: t('wall'), brick: t('brick'), plaster: t('plaster', { color: 0xe6c8a0 }), planks: t('planks', { rough: 0.85, color: 0xd8a878 }), roof: t('rooftile'),
    ceil: t('planks', { color: 0xc89870, side: THREE.DoubleSide }), beam: t('planks', { color: 0xa07850 }), concrete: t('concrete'), floor: pbr('terrain/paving', { rough: 0.95, color: 0xd0b898 }),
    paint: t('iron', { color: 0xc04a36, metal: 0.3, rough: 0.6 }), hull: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.15, roughness: 0.78, side: THREE.DoubleSide, map: canvasTex(256, 256, (x, w, h) => { // riveted panels, streaked with grime
      x.fillStyle = 'rgba(40,38,32,0.55)'; for (let i = 0; i <= 2; i++) { x.fillRect(0, i * h / 2 - 1, w, 3); x.fillRect(i * w / 2 - 1, 0, 3, h); }
      x.fillStyle = 'rgba(30,28,24,0.6)'; for (let i = 0; i < 2; i++) for (let k = 4; k < w; k += 10) { x.fillRect(k, i * h / 2 + 6, 2, 2); x.fillRect(i * w / 2 + 6, k, 2, 2); }
      for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(${60 + Math.random() * 50},${50 + Math.random() * 30},30,${0.06 + Math.random() * 0.12})`; x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 20 + Math.random() * 90); } }, '#8a8c84') }),
    glass: new THREE.MeshStandardMaterial({ color: 0x24323c, metalness: 0.6, roughness: 0.18 }), pane: new THREE.MeshStandardMaterial({ color: 0x9fb2bb, metalness: 0.2, roughness: 0.06, transparent: true, opacity: 0.3, depthWrite: false }), /* (slice 36: a window's glass) */ snow: new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.95 }), /* (slice 23: a plane's bare aluminium, the outpost's snowed roof) */ iron: t('iron', { metal: 0.35, rough: 0.75, side: THREE.DoubleSide }), moss: t('wall', { color: 0x7a8a6a }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x7a3426, roughness: 0.95 }), glow: new THREE.MeshBasicMaterial({ color: 0xffb050 }), ring: new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }),
    sign: new THREE.MeshStandardMaterial({ roughness: 0.7, map: canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#e8dcc0'; x.font = 'bold 74px sans-serif'; x.textAlign = 'center'; x.fillText('FUEL', w / 2, 92);
      x.fillStyle = 'rgba(70,40,20,0.5)'; for (let i = 0; i < 300; i++) x.fillRect(Math.random() * w, Math.random() * h, 3, 2); }, '#8a2a1e') }) };
  // indoors seen from a third-person camera, every building is cut away above the player's waist (and its roof lifted)
  MAT.plaster.normalScale.set(2.2, 2.2); // the clay plaster reads flat at its own relief
  MAT.inwall = new THREE.MeshStandardMaterial({ color: 0xb3a487, roughness: 0.95, normalMap: MAT.plaster.normalMap, normalScale: new THREE.Vector2(0.3, 0.3) }); MAT.adobe = new THREE.MeshStandardMaterial({ color: 0xdcc39c, roughness: 0.97, normalMap: MAT.plaster.normalMap, normalScale: new THREE.Vector2(0.9, 0.9) }); // (the courtyard house's lime-washed adobe) // (slice 36: the house kinds' rooms, a pale painted plaster)
  for (const m of Object.values(MAT)) m.clippingPlanes = [CUT];
  return MAT; }
const CUT = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
function tinted(hex) { return MAT['roof' + hex] ||= (() => { const m = MAT.roof.clone(); m.color.set(hex); m.clippingPlanes = [CUT]; return m; })(); } // snow on the hut, a dark Bog roof
export const box = (P, k, sx, sy, sz, x, y, z, ry = 0, rx = 0, rz = 0) => P[k].push(new THREE.BoxGeometry(sx, sy, sz).rotateZ(rz).rotateX(rx).rotateY(ry).translate(x, y, z));
// ground height under a point of the building's frame, as an offset from its base
export const gAt = (b, lx, lz) => { const [x, z] = toW(b, lx, lz); return groundY(x, z); };

// collision along a solid run of wall: circles of 0.3 m every 0.45 m, inset so a doorway keeps its full width
// topAt(lx, lz) is the solid's top there (shots pass over lower walls)
export function collideRun(b, lx0, lz0, lx1, lz1, r = 0.3, topAt = () => b.y + 3) { const L = Math.hypot(lx1 - lx0, lz1 - lz0); if (L < 0.05) { const [x, z] = toW(b, lx0, lz0); Object.assign(addCollider(x, z, r, b), { vr: 0, top: topAt(lx0, lz0), stand: r > 0.2 ? topAt(lx0, lz0) : null }); return; }
  const n = Math.max(1, Math.ceil((L - 2 * r) / 0.45));
  for (let k = 0; k <= n; k++) { const s = L <= 2 * r ? L / 2 : r + (L - 2 * r) * k / n, lx = lx0 + (lx1 - lx0) * s / L, lz = lz0 + (lz1 - lz0) * s / L, [x, z] = toW(b, lx, lz); Object.assign(addCollider(x, z, r, b), { vr: 0, top: topAt(lx, lz), stand: r > 0.2 ? topAt(lx, lz) : null }); } }
// a roof or floor a foot can stand on: at(lx, lz) gives its height in the building's frame, or null off its edge
export function surface(b, at, o = {}) { surfaces.push({ ...o, x: b.x, z: b.z, r: Math.max(Math.abs(b.cx || 0) + b.w / 2, Math.abs(b.cz || 0) + b.d / 2) + 1.5, at: (x, z) => { const [lx, lz] = toL(b, x, z); return at(lx, lz); } }); }
export const ladders = []; // the tower's: y0 to y1, at(y) is where the climber's feet are at that height, off the step-off point at the top
export function ladderAt(x, z, y) { for (const l of ladders) { if (y < l.y0 - 0.3 || y > l.y1 + 0.1) continue; const [lx, lz] = l.at(Math.min(l.y1, Math.max(l.y0, y))); if (Math.hypot(lx - x, lz - z) < 0.7) return l; } return null; }
// a straight wall along the frame's x or z axis, from (x0, z0) to (x1, z1): solid runs between the openings (a door is a
// gap with a lintel, a window a gap between sill and head); a ruined wall breaks into blocks that lose their tops
// (slice 36, the house kinds: o.lv raises its base that far above the floor, b.y (an upper storey's wall stands on its floor
// and has a bottom its colliders keep, bot, so the floor below walks on under it); o.ext marks an outside wall, the ones the
// walk test walks into; o.line lines its inner side, the -normal side, with that material; a door's y0 lifts its sill (a
// doorway at a half-landing). A house kind (b.dress) gets frames, sills, glass and doors in its openings)
export function wall(b, P, k, x0, z0, x1, z1, h, holes = [], o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, along = Math.abs(ux) > 0.5, t = b.t || 0.45, ruin = b.ruin || 0, lv = o.lv || 0, base = b.y + lv;
  const bot = lv > 0.05 ? base : o.bot, kind = !!b.style;
  const hs = holes.map(o => ({ ...o, s0: L / 2 + o.at - o.w / 2, s1: L / 2 + o.at + o.w / 2 })).sort((p, q) => p.s0 - q.s0);
  const piece = (s0, s1, y0, y1) => { if (s1 - s0 < 0.02 || y1 - y0 < 0.02) return; const c = (s0 + s1) / 2;
    box(P, k, along ? s1 - s0 : t, y1 - y0, along ? t : s1 - s0, x0 + ux * c, (y0 + y1) / 2, z0 + uz * c);
    if (o.line) { const ly0 = Math.max(y0, base), d = t / 2 + 0.012; if (y1 - ly0 > 0.02) box(P, o.line, along ? s1 - s0 : 0.02, y1 - ly0, along ? 0.02 : s1 - s0, x0 + ux * c - uz * d, (ly0 + y1) / 2, z0 + uz * c + ux * d); } };
  const foot = (s) => kind ? (lv > 0.05 ? base : o.foot ?? Math.min(gAt(b, x0 + ux * s, z0 + uz * s), b.y) - 0.8) : Math.min(gAt(b, x0 + ux * s, z0 + uz * s), b.y) - 0.8; // walls run on down into the ground
  const top = (s) => { if (!ruin) return base + h; const e = Math.min(1, Math.min(s, L - s) / 1.4), v = vnoise((x0 + ux * s) * 0.7 + b.seed, (z0 + uz * s) * 0.7); // corners stand tallest
    return base + h * Math.max(b.minTop ?? 0.18, 1 - ruin * Math.min(1, v * 1.5) * (0.35 + 0.65 * e)); };
  const topAt = (lx, lz) => top((lx - x0) * ux + (lz - z0) * uz);
  const run = (s0, s1, tp = topAt, bt = bot) => { const n0 = colliders.length; collideRun(b, x0 + ux * s0, z0 + uz * s0, x0 + ux * s1, z0 + uz * s1, 0.3, tp); if (bt != null) for (let i = n0; i < colliders.length; i++) colliders[i].bot = bt; };
  let s = 0; const runs = []; for (const o of hs) { runs.push([s, o.s0]); s = o.s1; } runs.push([s, L]);
  for (const [s0, s1] of runs) { const n = ruin ? Math.max(1, Math.round((s1 - s0) / 0.7)) : 1;
    for (let i = 0; i < n; i++) { const a = s0 + (s1 - s0) * i / n, c = s0 + (s1 - s0) * (i + 1) / n; piece(a, c, Math.min(foot(a), foot(c)), top((a + c) / 2)); }
    run(s0, s1); }
  for (const q of hs) { const tp = top((q.s0 + q.s1) / 2), mid = (q.s0 + q.s1) / 2;
    if (q.type === 'door') { const y0 = q.y0 || 0; if (tp > base + y0 + q.hgt + 0.2) { const ys = [base + y0 + q.hgt, ...(q.gaps || []).flat().map(v => base + v), tp]; // (q.gaps, a kind's: windows over the door)
        for (let i = 0; i < ys.length; i += 2) piece(q.s0, q.s1, ys[i], Math.min(ys[i + 1], tp)); if (kind) run(q.s0, q.s1, () => tp, base + y0 + q.hgt); // (a kind's lintel stops shots and a climber's head)
        if (kind) for (const [g0, g1] of q.gaps || []) dressWindow(b, P, x0 + ux * mid, z0 + uz * mid, ux, uz, base + g0, base + g1, q.w, o); }
      if (y0 > 0) { piece(q.s0, q.s1, Math.min(foot(q.s0), foot(q.s1)), base + y0); run(q.s0, q.s1, () => base + y0 - 0.55); } // (its solid sill: 55 cm under the doorway, so the stair's last steps up to it are not blocked; still too high to step up onto from the floor below)
      const d = { lx: x0 + ux * mid, lz: z0 + uz * mid, nx: uz, nz: -ux, lv: lv + y0, w: q.w }; if (!kind || (o.ext && !q.int && lv + y0 < 1.5)) b.doors.push(d); else if (kind) (b.inner ||= []).push(d);
      if (kind) dressDoor(b, P, x0 + ux * mid, z0 + uz * mid, ux, uz, base + y0, q, o); }
    else { const ys = [Math.min(foot(q.s0), foot(q.s1)), ...q.gaps.flat().map(v => base + v), tp]; // stone between and around the openings
      for (let i = 0; i < ys.length; i += 2) piece(q.s0, q.s1, ys[i], Math.min(ys[i + 1], tp));
      run(q.s0, q.s1); if (kind) for (const [g0, g1] of q.gaps) dressWindow(b, P, x0 + ux * mid, z0 + uz * mid, ux, uz, base + g0, base + g1, q.w, o); } }
  // a solid spot on this wall for the walk test: the longest run's middle, if the wall still stands above 1.2 m there
  const [r0, r1] = runs.reduce((p, q) => (q[1] - q[0] > p[1] - p[0] ? q : p)); const m = (r0 + r1) / 2;
  if ((!kind || (o.ext && lv < 1.5)) && r1 - r0 > (kind ? 2.0 : 1.2) && top(m) > b.y + 1.2) b.walls.push({ lx: x0 + ux * m, lz: z0 + uz * m, nx: uz, nz: -ux }); // (a kind's: a stretch over 2 m, its middle a metre from any opening or corner, where the walker cannot slide round into one)
}
export const door = (at = 0, w = 1.6, hgt = 2.2, y0 = 0) => ({ type: 'door', at, w, hgt, y0 }), win = (at, w = 0.9, gaps = [[0.95, 1.9]]) => ({ type: 'window', at, w, gaps });
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
export function cache(b, g, lx, lz, camp = null, o = {}) { const [x, z] = toW(b, lx, lz), m = new THREE.Mesh(CRATE.geo, CRATE.mat), y = o.y ?? groundY(x, z); // (o, slice 23: a place's crate: its loot k, rounds, a deck or cap it stands on)
  m.scale.setScalar(1.25); m.position.set(x, y, z); m.rotation.y = -b.a + R() * 0.6; m.castShadow = m.receiveShadow = true; g.add(m);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32).rotateX(-Math.PI / 2), mats().ring); ring.position.set(x, y + 0.05, z); g.add(ring);
  const col = Object.assign(addCollider(x, z, 0.6, b), { vr: 0, top: y + 0.8, stand: y + CRATE.h });
  // a few hits smash it (game.js): the crate is gone, its collider with it
  col.cache = { x, z, y, camp, hp: 3, opened: false, open() { this.opened = true; ring.visible = false; m.rotation.z = 0.12; m.position.y -= 0.05; },
    smash() { this.broken = true; this.opened = true; ring.visible = false; m.visible = false; col.r = 0; } }; Object.assign(col.cache, o); caches.push(col.cache); return col.cache; }
// a corner of the room, not the same one in every house (the door's corners are at -z)
const corner = (w, d) => [[-1, 1], [1, -1], [-1, -1]][Math.floor(R() * 3)].map((s, i) => s * ((i ? d : w) / 2 - 0.75));

function furnish(b, P, g, w, d) { const hw = w / 2 - 0.45, hd = d / 2 - 0.45; // the door is at (0, -d/2): the way in stays clear
  if (b.furnish === 'home' && b.hermit) { R(); R(); const c = corner(w, d); hermitRoom(b, P, w, d, c); cache(b, g, ...c); } // (slice 23 polish: the hermit's room in scanned props; the two stools' draws kept)
  else if (b.furnish === 'home') { table(b, P, hw * 0.35, hd * 0.25, 0.1); stool(b, P, hw * 0.35 - 0.95, hd * 0.25); stool(b, P, hw * 0.35 + 0.95, hd * 0.25 + 0.1);
    // a bed in the back corner, a shelf on the left wall
    const bx = hw - 0.5, bz = hd - 1.05, by = gAt(b, bx, bz); box(P, 'beam', 0.95, 0.35, 2.05, bx, by + 0.2, bz); P.cloth.push(new THREE.BoxGeometry(0.88, 0.12, 1.55).translate(bx, by + 0.42, bz + 0.2));
    const sx = -hw + 0.2, sy = gAt(b, sx, 0); for (const y of [0.4, 1.0, 1.6]) box(P, 'planks', 0.32, 0.04, 1.6, sx, sy + y, 0); for (const z of [-0.78, 0.78]) box(P, 'beam', 0.32, 1.8, 0.05, sx, sy + 0.9, z);
    cache(b, g, ...corner(w, d)); }
  else if (b.furnish === 'radio') { R(); radioRoom(b, P, w, d); radioShack(b, P, w, d); } // (slice 23; polish: scanned props, radioRoom. The stool that stood here drew from the world's stream: it draws as it did)
  else if (b.furnish === 'outpost') outpost(b, P, g, w, d); // (slice 23 polish: a small polar research station, below with the places)
  else { rubble(b, P, b.moss ? 'moss' : b.mat, hw - 0.8, hd - 0.8, 1.4, 14); rubble(b, P, b.moss ? 'moss' : b.mat, -hw + 0.9, 0.4, 1.1, 10);
    const y = gAt(b, -0.5, hd * 0.4); box(P, 'beam', w * 0.85, 0.18, 0.2, -0.3, y + 0.55, hd * 0.4, 0.15, 0, 0.18); // a fallen roof beam
    if (R() < 0.6) cache(b, g, ...corner(w, d)); }
}

function buildHouse(b, P, g) { const { w, d, h } = b, k = b.moss ? 'moss' : b.mat;
  room(b, P, k, w, d, h, [door(0), ...(w > 6.2 ? [win(-w * 0.3), win(w * 0.3)] : [])], w > 5.2 ? [win(0)] : [], d > 5.4 ? [win(0)] : [], [win(-d * 0.15)]);
  floor(b, P, b.furnish === 'home' ? 'planks' : 'floor', w - 0.45, d - 0.45);
  if (b.hermit) { const gz = (z) => Math.max(gAt(b, -0.8, z), gAt(b, 0, z), gAt(b, 0.8, z)), z0 = -d / 2 - 1.2, y0 = gz(z0) + 0.24; let k = 1; for (let z = z0 - 0.5; z > z0 - 11; z -= 0.5) k = Math.min(k, (y0 - gz(z) - 0.14) / (z0 - z));
    const jy = b.jy = (z) => Math.max(y0 - Math.max(0, k) * (z0 - z), WATER_Y + 0.45); // (one even ramp down from his door to the water, then level) // (slice 23) the hermit's jetty (polish: on the ground ashore, level over the water, on stringers)
    for (let z = -d / 2 - 1.2; z > -d / 2 - 12; z -= 0.5) box(P, 'planks', 1.6, 0.07, 0.45, 0, jy(z) - 0.035, z, R() * 0.06 - 0.03);
    for (let z = -d / 2 - 1.2; z > -d / 2 - 11.6; z -= 1.05) for (const sx of [-0.6, 0.6]) bar(P, 'beam', sx, jy(z) - 0.13, z, sx, jy(z - 1.05) - 0.13, z - 1.05, 0.12);
    for (let z = -d / 2 - 2; z > -d / 2 - 12; z -= 2.5) for (const sx of [-0.75, 0.75]) box(P, 'beam', 0.14, 2.4, 0.14, sx, Math.max(gAt(b, sx, z), 0) - 0.6, z);
    surface(b, (lx, lz) => Math.abs(lx) <= 0.8 && lz < -d / 2 - 1 && lz > -d / 2 - 12 ? jy(lz) : null); hermitYard(b, P); }
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
  // a porch (issue #17): a deck, two posts and a lean-to roof in front of the door of about a third of the intact gable houses; it is
  // picked from the house's place, never from the world's random stream (nothing else moves), and never in the classic world
  if (b.roof === 'gable' && SEED !== DEFAULT_SEED && ((Math.round(b.x * 10) * 73856093 ^ Math.round(b.z * 10) * 19349663) >>> 0) % 3 === 0 && (() => { const pz = -d / 2 - 1.1, ys = [-1.6, 1.6].flatMap(x => [pz - 0.9, pz + 0.9].map(z => gAt(b, x, z))); return Math.max(...ys) - Math.min(...ys) < 0.3; })()) { b.porch = true; // (only on level ground: on a slope the deck would hover or sink)
    porchOn(b, P, g); } // (slice 36, Jared, November 14, 2026: "the porches don't look like they are actually touching structurally": now a ledger on the wall, posts on piers, the deck at the sill)
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

// the gas station (IW1's GAS STATION; its detail pass, Jared, November 15, 2026: "the gas station still needs the detail/quality
// pass"): a cracked concrete forecourt with oil stains and faded lane arrows; a steel canopy on four posts (guard collars at their
// feet), its fascia in the old brand's livery, panels and dead light fittings under it, one panel hanging; two pump islands, each a
// painted curb with bollards at its ends and a pump in the brand's red (its face, dial and grade buttons, hoses on their nozzles,
// one hose cut); the shop and service bay at the back (a glass shop door hung open, its front window and sign board, the bay's
// roller door stuck up over head height, a boarded window, rust down the walls, the roof's coping and a dead air conditioner);
// inside: the counter and its till, shelves of tins, a drinks fridge, a car lift in the bay, the workbench under a pegboard, tyres
// and drums; a lantern on the counter, one on the bench and one hung under the canopy, so the place reads at night; the pole sign
// with its price board, a number missing. Everything solid between waist and head height has a collider (walktest 'gas')
let GM = null;
function gasMats() { if (GM) return GM;
  const r = mulberry32(31), rnd = (a, c) => a + r() * (c - a);
  const wear = (x, w, h, n = 120, rust = 0.5) => { for (let i = 0; i < n; i++) { const rs = r() < rust; x.fillStyle = rs ? `rgba(${110 + r() * 50},${50 + r() * 30},20,${0.15 + r() * 0.35})` : `rgba(30,28,24,${0.05 + r() * 0.15})`;
    x.fillRect(r() * w, r() * h, 1 + r() * (rs ? 6 : 3), 1 + r() * (rs ? 8 : 3)); } };
  const drips = (x, w, y0, n, len) => { for (let i = 0; i < n; i++) { x.fillStyle = `rgba(${105 + r() * 40},${48 + r() * 22},18,${0.12 + r() * 0.3})`; x.fillRect(r() * w, y0 + r() * 6, 1.5 + r() * 3, len * (0.3 + r())); } };
  const logo = (x, cx, cy, s) => { x.fillStyle = '#b8261b'; x.beginPath(); x.arc(cx, cy, s, 0, 6.283); x.fill(); x.fillStyle = '#ece8dc'; x.beginPath(); x.moveTo(cx - s * 0.7, cy + s * 0.35); x.lineTo(cx - s * 0.15, cy - s * 0.45); x.lineTo(cx + s * 0.15, cy - s * 0.05); x.lineTo(cx + s * 0.35, cy - s * 0.3); x.lineTo(cx + s * 0.75, cy + s * 0.35); x.closePath(); x.fill(); };
  const S = (o, cut = false) => { const m = new THREE.MeshStandardMaterial({ roughness: 0.7, ...o }); if (cut) m.clippingPlanes = [CUT]; return m; }, rep = (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  const decal = (map) => S({ map, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  GM = {
    // the canopy's fascia, 4 m of it a repeat: cream panels, the brand's red and blue bands, its name and mark, rust run down from the joints
    fascia: S({ roughness: 0.55, metalness: 0.2, map: rep(canvasTex(512, 102, (x, w, h) => { x.fillStyle = '#b8261b'; x.fillRect(0, h * 0.66, w, h * 0.2); x.fillStyle = '#1d3f74'; x.fillRect(0, h * 0.88, w, h * 0.07);
      logo(x, w * 0.2, h * 0.36, 26); x.fillStyle = '#b8261b'; x.font = 'bold 52px sans-serif'; x.textAlign = 'left'; x.fillText('RIDGE', w * 0.29, h * 0.55); x.fillStyle = '#1d3f74'; x.font = 'bold 22px sans-serif'; x.fillText('FUEL', w * 0.66, h * 0.55);
      x.fillStyle = 'rgba(40,36,30,0.55)'; for (const u of [0, w / 2]) x.fillRect(u, 0, 2, h); drips(x, w, 0, 40, 46); drips(x, w, h * 0.66, 40, 34); wear(x, w, h, 700, 0.5); x.fillStyle = 'rgba(80,66,46,0.26)'; x.fillRect(0, 0, w, h); for (let i = 0; i < 6; i++) { const gr = x.createLinearGradient(0, 0, 0, h), u = r() * w; gr.addColorStop(0, 'rgba(60,48,34,0.45)'); gr.addColorStop(1, 'rgba(60,48,34,0)'); x.fillStyle = gr; x.fillRect(u, 0, 30 + r() * 60, h); } }, '#d8d0bd')) }),
    // under the canopy: painted steel panels, water stains
    soffit: S({ roughness: 0.8, side: THREE.DoubleSide, map: canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#9a968c'; for (let i = 0; i <= w; i += 64) { x.fillRect(i - 1, 0, 2, h); x.fillRect(0, i - 1, w, 2); }
      for (let i = 0; i < 9; i++) { const gr = x.createRadialGradient(0, 0, 0, 0, 0, 1), cx = r() * w, cy = r() * h, s = 10 + r() * 30; gr.addColorStop(0, 'rgba(120,90,50,0.28)'); gr.addColorStop(1, 'rgba(120,90,50,0)'); x.save(); x.translate(cx, cy); x.scale(s, s * 0.6); x.fillStyle = gr; x.fillRect(-1, -1, 2, 2); x.restore(); } wear(x, w, h, 140, 0.25); }, '#cfcbc0') }),
    lens: S({ color: 0x8e918c, roughness: 0.45 }),
    steel: S({ roughness: 0.6, metalness: 0.35, map: rep(canvasTex(128, 128, (x, w, h) => { drips(x, w, 0, 14, 70); wear(x, w, h, 160, 0.55); }, '#7c7a74')) }),
    drinks: S({ roughness: 0.5, map: canvasTex(256, 48, (x, w, h) => { x.fillStyle = '#b8261b'; x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.fillText('COLD DRINKS', w / 2, 35); wear(x, w, h, 50, 0.3); }, '#ece8dc') }, true),
    glow: Object.assign(new THREE.MeshBasicMaterial({ color: 0xa8743c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: canvasTex(64, 64, (x, w, h) => { const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); }, '#000') }), { clippingPlanes: [CUT] }),
    // the pump's face: the brand's header, the dial (sale and gallons), the price strip, three grade buttons, the nozzle's bay
    face: S({ roughness: 0.5, metalness: 0.15, map: canvasTex(256, 512, (x, w, h) => { x.fillStyle = '#ece8dc'; x.fillRect(10, 10, w - 20, 76); logo(x, 58, 48, 24); x.fillStyle = '#b8261b'; x.font = 'bold 40px sans-serif'; x.textAlign = 'left'; x.fillText('RIDGE', 92, 64);
      x.fillStyle = '#d8d4c8'; x.fillRect(22, 108, w - 44, 170); x.fillStyle = '#1b1d1c'; x.fillRect(30, 116, w - 60, 154); x.fillStyle = '#e8e4d8'; x.font = 'bold 15px sans-serif'; x.fillText('TOTAL SALE  $', 40, 140); x.fillText('GALLONS', 40, 212);
      x.fillStyle = '#5a4a2a'; x.font = 'bold 42px monospace'; x.textAlign = 'right'; x.fillText('00.00', w - 40, 186); x.fillText('0.000', w - 40, 258); x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(30, 116, w - 60, 40);
      x.fillStyle = '#ece8dc'; x.fillRect(22, 292, w - 44, 44); x.fillStyle = '#1b1d1c'; x.textAlign = 'left'; x.font = 'bold 17px sans-serif'; x.fillText('PRICE PER GALLON', 32, 320); x.font = 'bold 24px monospace'; x.fillText('1.29', w - 92, 322);
      for (const [k, [c, t]] of [['#d8a420', '87'], ['#2f6fc0', '89'], ['#2a8a46', '93']].entries()) { x.fillStyle = '#1b1d1c'; x.fillRect(26 + k * 72, 350, 62, 46); x.fillStyle = c; x.fillRect(30 + k * 72, 354, 54, 38); x.fillStyle = '#111'; x.font = 'bold 22px sans-serif'; x.textAlign = 'center'; x.fillText(t, 57 + k * 72, 381); }
      x.fillStyle = '#5a1712'; x.fillRect(40, 412, w - 80, 84); x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(40, 412, w - 80, 8); drips(x, w, 90, 20, 60); drips(x, w, 400, 14, 50); wear(x, w, h, 260, 0.6); }, '#bf2c22') }),
    body: S({ roughness: 0.55, metalness: 0.2, map: rep(canvasTex(128, 128, (x, w, h) => { drips(x, w, 0, 12, 50); wear(x, w, h, 120, 0.6); }, '#b42c22')) }),
    band: S({ roughness: 0.6, metalness: 0.1, map: rep(canvasTex(128, 128, (x, w, h) => { drips(x, w, 0, 10, 60); wear(x, w, h, 90, 0.5); }, '#b42c22')) }, true),
    white: S({ roughness: 0.6, metalness: 0.2, map: rep(canvasTex(128, 128, (x, w, h) => { drips(x, w, 0, 16, 90); wear(x, w, h, 160, 0.55); }, '#d8d4c8')) }),
    // worn yellow and black: the islands' curbs and the posts' guard collars; the bollards' bands
    hazard: S({ roughness: 0.75, map: rep(canvasTex(128, 128, (x, w, h) => { x.fillStyle = '#1c1b18'; for (let i = -w; i < w * 2; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 16, 0); x.lineTo(i + 16 + h, h); x.lineTo(i + h, h); x.closePath(); x.fill(); }
      for (let i = 0; i < 260; i++) { x.fillStyle = r() < 0.5 ? 'rgba(160,150,130,0.6)' : 'rgba(70,50,30,0.4)'; x.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 3); } }, '#d8a820')) }),
    bollard: S({ roughness: 0.6, metalness: 0.3, map: canvasTex(64, 128, (x, w, h) => { x.fillStyle = '#1c1b18'; x.fillRect(0, 8, w, 14); x.fillRect(0, 34, w, 14); wear(x, w, h, 70, 0.6); }, '#d8a820') }),
    // the shop's sign board, the pole sign's face and its price board (a figure fallen off)
    board: S({ roughness: 0.6, map: canvasTex(512, 96, (x, w, h) => { x.fillStyle = '#b8261b'; x.fillRect(0, 0, w, 10); x.fillRect(0, h - 10, w, 10); logo(x, 50, h / 2, 28); x.fillStyle = '#1d3f74'; x.font = 'bold 34px sans-serif'; x.textAlign = 'left'; x.fillText('FOOD · DRINKS · SERVICE', 92, 61); drips(x, w, h - 10, 30, 40); wear(x, w, h, 200, 0.45); }, '#ece8dc') }),
    signFace: S({ roughness: 0.55, metalness: 0.1, map: canvasTex(256, 136, (x, w, h) => { x.strokeStyle = '#ece8dc'; x.lineWidth = 6; x.strokeRect(10, 10, w - 20, h - 20); logo(x, 62, h / 2, 34); x.fillStyle = '#ece8dc'; x.beginPath(); x.arc(62, h / 2, 34, 0, 6.283); x.lineWidth = 4; x.stroke();
      x.font = 'bold 54px sans-serif'; x.textAlign = 'left'; x.fillText('FUEL', 106, 86); x.font = 'bold 15px sans-serif'; x.fillText('RIDGE OIL CO.', 108, 112); drips(x, w, 10, 22, 50); wear(x, w, h, 180, 0.55); }, '#a8241a') }),
    price: S({ roughness: 0.6, map: canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#1b1d1c'; x.font = 'bold 20px sans-serif'; x.textAlign = 'left'; x.fillText('UNLEADED', 14, 44); x.fillText('DIESEL', 14, 100);
      const tile = (cx, cy, t) => { x.fillStyle = '#1b1d1c'; x.fillRect(cx, cy, 24, 36); if (t) { x.fillStyle = '#ece8dc'; x.font = 'bold 28px monospace'; x.textAlign = 'center'; x.fillText(t, cx + 12, cy + 28); } };
      [['1', 120], ['.', 0], ['2', 150], [null, 176], ['9', 202]].forEach(([t, cx]) => { if (cx) tile(cx, 16, t); else { x.fillStyle = '#1b1d1c'; x.fillRect(146, 46, 4, 4); } }); x.strokeStyle = 'rgba(30,30,30,0.35)'; x.lineWidth = 2; x.strokeRect(176, 16, 24, 36); x.fillStyle = '#ece8dc'; x.fillRect(178, 18, 20, 32); // (the missing figure: its clean square)
      [['1', 120], ['3', 150], ['9', 176], ['9', 202]].forEach(([t, cx]) => tile(cx, 72, t)); x.fillStyle = '#1b1d1c'; x.fillRect(146, 102, 4, 4); drips(x, w, 0, 18, 60); wear(x, w, h, 160, 0.5); }, '#e2ddce') }),
    ice: S({ roughness: 0.5, map: canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#2a5aa8'; x.font = 'bold 72px sans-serif'; x.textAlign = 'center'; x.fillText('ICE', w / 2, 88); x.fillStyle = 'rgba(42,90,168,0.6)'; x.fillRect(0, h - 18, w, 10); drips(x, w, h - 30, 24, 40); wear(x, w, h, 120, 0.5); }, '#e6ecef') }),
    peg: S({ roughness: 0.9, map: canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#3a2a1c'; for (let i = 6; i < w; i += 10) for (let j = 6; j < h; j += 10) x.fillRect(i, j, 3, 3); x.strokeStyle = 'rgba(235,230,215,0.7)'; x.lineWidth = 3;
      for (const [a, c, d, e] of [[30, 20, 14, 80], [70, 24, 10, 70], [150, 30, 50, 12], [210, 18, 12, 90]]) x.strokeRect(a, c, d, e); x.beginPath(); x.arc(110, 50, 16, 0, 6.283); x.stroke(); wear(x, w, h, 80, 0.2); }, '#8a6a48') }, true),
    // the forecourt's marks: oil, cracks, a faded lane arrow; rust run down the shop's walls
    oil: decal(canvasTex(128, 128, (x, w, h) => { for (let i = 0; i < 7; i++) { const gr = x.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, 'rgba(16,14,12,0.75)'); gr.addColorStop(0.7, 'rgba(16,14,12,0.35)'); gr.addColorStop(1, 'rgba(16,14,12,0)');
      x.save(); x.translate(w / 2 + rnd(-30, 30), h / 2 + rnd(-30, 30)); x.rotate(r() * 3); x.scale(rnd(14, 40), rnd(10, 30)); x.fillStyle = gr; x.fillRect(-1, -1, 2, 2); x.restore(); } }, '#141210')),
    crack: decal(canvasTex(256, 256, (x, w, h) => { x.strokeStyle = 'rgba(26,22,18,0.8)'; for (let k = 0; k < 3; k++) { let px = rnd(20, 60), py = rnd(20, w - 20); x.lineWidth = 2.5; x.beginPath(); x.moveTo(px, py);
      while (px < w - 20) { px += rnd(8, 22); py += rnd(-14, 14); x.lineTo(px, py); if (r() < 0.2) { x.stroke(); x.lineWidth = Math.max(0.8, x.lineWidth * 0.8); x.beginPath(); x.moveTo(px, py); } } x.stroke(); } }, '#1a1612')),
    arrow: decal(canvasTex(128, 256, (x, w, h) => { x.fillStyle = 'rgba(232,228,214,0.65)'; x.fillRect(w / 2 - 14, 90, 28, 150); x.beginPath(); x.moveTo(w / 2, 14); x.lineTo(w / 2 + 50, 96); x.lineTo(w / 2 - 50, 96); x.closePath(); x.fill();
      x.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(0,0,0,${0.4 + r() * 0.6})`; x.fillRect(r() * w, r() * h, 1 + r() * 5, 1 + r() * 4); } }, '#e8e4d6')),
    streak: decal(canvasTex(64, 256, (x, w, h) => { for (let i = 0; i < 26; i++) { const gr = x.createLinearGradient(0, 0, 0, h), a = 0.2 + r() * 0.4; gr.addColorStop(0, `rgba(110,56,22,${a})`); gr.addColorStop(rnd(0.3, 1), 'rgba(110,56,22,0)'); x.fillStyle = gr; x.fillRect(r() * w, 0, 1 + r() * 4, h); } }, '#6e381a')) };
  GM.streak.clippingPlanes = [CUT]; for (const k of ['steel', 'white', 'body']) { GM[k + 'In'] = GM[k].clone(); if (k === 'steel') GM.steelIn.color.set(0xc4c8c4); GM[k + 'In'].clippingPlanes = [CUT]; } // (the shop's own steel, fridge and lift: cut away with its walls; the canopy's and the sign's stay whole)
  return GM; }
// a pump island at sx: the curb and its paint, a pump (the face to each lane), its hoses on their nozzles (cut: the second side's
// hose lies on the island), a bollard at each end; and their colliders
function gasIsland(b, P, G, sx, cut) { const z0 = -5.6, z1 = -2.4, top = Math.max(...[z0, -4, z1].flatMap(z => [sx - 0.5, sx + 0.5].map(x => gAt(b, x, z)))) + 0.2;
  box(P, 'concrete', 1.0, top - b.y + 0.5, z1 - z0, sx, (top + b.y - 0.5) / 2, (z0 + z1) / 2); box(G, 'hazard', 1.012, 0.16, z1 - z0 + 0.012, sx, top - 0.085, (z0 + z1) / 2);
  surface(b, (lx, lz) => Math.abs(lx - sx) <= 0.5 && lz >= z0 && lz <= z1 ? top : null); for (const e of [-0.2, 0.2]) collideRun(b, sx + e, z0, sx + e, z1, 0.3, () => top); // (on a slope its low side is a wall; where it is a step, stepped onto)
  const y = top; box(P, 'concrete', 0.6, 0.12, 0.92, sx, y + 0.06, -4); box(G, 'steel', 0.46, 0.14, 0.82, sx, y + 0.19, -4); box(G, 'body', 0.42, 1.42, 0.78, sx, y + 0.97, -4); box(G, 'steel', 0.48, 0.05, 0.86, sx, y + 1.7, -4);
  for (const s of [-1, 1]) { G.face.push(new THREE.PlaneGeometry(0.74, 1.4).rotateY(s * Math.PI / 2).translate(sx + s * 0.214, y + 0.97, -4));
    box(P, 'iron', 0.06, 0.16, 0.1, sx + s * 0.24, y + 0.72, -3.72); // the nozzle's holster
    const n = [sx + s * 0.29, y + 0.68, -3.72]; box(P, 'iron', 0.07, 0.08, 0.24, n[0], n[1] + 0.06, n[2] + 0.02, 0, -0.5); box(P, 'iron', 0.03, 0.14, 0.03, n[0], n[1] - 0.02, n[2] + 0.12, 0, 0.3);
    const pts = cut && s > 0 ? [[sx + 0.22, y + 1.35, -4.3], [sx + 0.36, y + 1.0, -4.42], [sx + 0.42, y + 0.3, -4.5], [sx + 0.45, y + 0.04, -4.85], [sx + 0.4, y + 0.04, -5.25]] // (cut: down the side and along the curb)
      : [[sx + s * 0.22, y + 1.35, -4.3], [sx + s * 0.34, y + 1.05, -4.42], [sx + s * 0.36, y + 0.55, -4.1], [sx + s * 0.32, y + 0.62, -3.8], [n[0], n[1] + 0.08, n[2] - 0.1]];
    G.hose.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 16, 0.024, 6, false)); }
  for (const z of [z0 + 0.2, z1 - 0.2]) { G.bollard.push(new THREE.CylinderGeometry(0.09, 0.09, 1.0, 12).translate(sx, y + 0.5, z)); P.iron.push(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 12).translate(sx, y + 1.01, z)); collideRun(b, sx, z, sx, z, 0.15, () => y + 1.0); }
  collideRun(b, sx, -4.3, sx, -3.7, 0.45, () => y + 1.72); }
function buildGas(b, P, g) { floor(b, P, 'concrete', 16, 11, 0, -3, 0.06);
  const gw = 8, gd = 6.5, gz = 5.6, Z0 = gz - gd / 2, Z1 = gz + gd / 2, IX = gw / 2 - 0.175, F = (x, z) => gAt(b, x, z) + 0.07, G = Object.fromEntries(Object.keys(gasMats()).concat('hose').map(k => [k, []])), rnd = mulberry32(Math.round(b.seed * 1000) + 89), PI = Math.PI;
  for (let i = 0; i < 54; i++) R(); // (the old garage's rubble drew 54 from the world's stream; still drawn, so nothing built after the station moves. ponytail: drop once the classic world is re-baselined)
  b.roofBox = { cz: gz, w: gw, d: gd }; b.t = 0.35; b.ruin = 0; b.h = 3.6; // the shop and bay, in the station's frame
  // the front: the shop's window and its glass door (hung open), the bay's roller door; a window in the back wall and one in the right (boarded)
  const IN = { line: 'inwall' }; wall(b, P, 'plaster', -gw / 2 - 0.175, Z0, gw / 2 + 0.175, Z0, 3.6, [win(-3.0, 1.4, [[0.9, 2.1]]), door(-1.3, 1.1, 2.2), door(1.9, 3.0, 2.8)], IN); // (the stretch between the doors under 1.2 m: no wall spot for the walk test there)
  wall(b, P, 'plaster', gw / 2 + 0.175, Z1, -gw / 2 - 0.175, Z1, 3.6, [win(0, 1.6, [[1.1, 2.0]])], IN);
  wall(b, P, 'plaster', -gw / 2, Z1 - 0.175, -gw / 2, Z0 + 0.175, 3.6, [], IN); wall(b, P, 'plaster', gw / 2, Z0 + 0.175, gw / 2, Z1 - 0.175, 3.6, [win(0.6, 1.4, [[1.1, 2.0]])], IN);
  floor(b, P, 'concrete', gw - 0.35, gd - 0.35, 0, gz, 0.07);
  // the roof (it lifts off with the cut-away): the slab, its coping, a dead air conditioner and a vent stack
  box(b.PR, 'concrete', gw + 0.5, 0.25, gd + 0.5, 0, b.y + 3.72, gz); box(b.PR, 'ceil', gw - 0.36, 0.02, gd - 0.36, 0, b.y + 3.585, gz); /* (boards under the slab: not a black void from inside) */ for (const s of [-1, 1]) { box(b.PR, 'iron', gw + 0.6, 0.12, 0.08, 0, b.y + 3.9, gz + s * (gd / 2 + 0.26)); box(b.PR, 'iron', 0.08, 0.12, gd + 0.6, s * (gw / 2 + 0.26), b.y + 3.9, gz); }
  box(b.PR, 'iron', 1.2, 0.7, 0.9, 1.8, b.y + 4.2, gz + 1.6); box(b.PR, 'iron', 0.8, 0.04, 0.8, 1.8, b.y + 4.57, gz + 1.6, 0.3); b.PR.iron.push(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 10).translate(-2.4, b.y + 4.3, gz + 2.3));
  // the shop's frontage: the window's frame (one pane left whole, a shard of the other), the door's frame and its leaf swung back against the
  // wall inside, the sign board over both, the red band round the walls at the eaves, rust run down from the band and the roof
  const fz = Z0 - 0.175; for (const [cx, w0, y0, y1] of [[-3.0, 1.4, 0.9, 2.1], [-1.3, 1.1, 0, 2.2]]) { for (const s of [-1, 1]) box(G, 'steelIn', 0.06, y1 - y0, 0.12, cx + s * (w0 / 2 - 0.03), b.y + (y0 + y1) / 2, Z0); box(G, 'steelIn', w0, 0.06, 0.12, cx, b.y + y1 - 0.03, Z0); if (y0) box(G, 'steelIn', w0 + 0.1, 0.05, 0.3, cx, b.y + y0, fz + 0.1); }
  box(G, 'steelIn', 0.05, 1.08, 0.08, -3.0, b.y + 1.5, Z0); box(P, 'pane', 0.6, 1.08, 0.012, -3.33, b.y + 1.5, Z0);
  const shard = (pts, z) => { const g0 = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))), cx = pts.reduce((a, q) => a + q[0], 0) / pts.length; P.pane.push(g0.clone().translate(0, b.y, z), g0.translate(-cx, 0, 0).rotateY(PI).translate(cx, b.y, z)); }; // (seen from both sides)
  shard([[-2.95, 0.96], [-2.36, 0.96], [-2.36, 1.62], [-2.62, 1.31], [-2.8, 1.12]], Z0);
  { const hz = Z0 + 0.175 + 0.07, x0 = -0.72, x1 = x0 + 1.05; box(G, 'steelIn', x1 - x0, 2.1, 0.05, (x0 + x1) / 2, F(x0, hz) + 1.07, hz); box(P, 'pane', x1 - x0 - 0.14, 1.3, 0.06, (x0 + x1) / 2, F(x0, hz) + 1.3, hz); box(P, 'iron', 0.04, 0.04, 0.22, x1 - 0.15, F(x0, hz) + 1.0, hz - 0.08); }
  box(G, 'steel', 3.6, 0.62, 0.08, -2.2, b.y + 2.72, fz - 0.06); G.board.push(new THREE.PlaneGeometry(3.5, 0.54).rotateY(PI).translate(-2.2, b.y + 2.72, fz - 0.104));
  for (const [x0, z0, x1, z1] of [[-gw / 2 - 0.175, fz, gw / 2 + 0.175, fz], [gw / 2 + 0.175, Z1 + 0.175, -gw / 2 - 0.175, Z1 + 0.175], [-gw / 2 - 0.175, Z1 + 0.175, -gw / 2 - 0.175, fz], [gw / 2 + 0.175, fz, gw / 2 + 0.175, Z1 + 0.175]]) {
    const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, nx = uz, nz = -ux, ry = Math.atan2(nx, nz); box(G, 'band', L + 0.02, 0.32, 0.03, (x0 + x1) / 2 + nx * 0.016, b.y + 3.22, (z0 + z1) / 2 + nz * 0.016, ry);
    for (let s = 0.3; s < L - 0.3; s += 0.9 + rnd() * 1.4) { const h = 0.8 + rnd() * 1.4, w = 0.25 + rnd() * 0.5, cx = x0 + ux * s, cz = z0 + uz * s; if ((z0 === fz && z1 === fz && [[-3, 0.7], [-1.3, 0.55], [1.9, 1.5], [-2.2, 1.8]].some(([hx, hw]) => Math.abs(cx - hx) < hw + w / 2)) || (z0 === Z1 + 0.175 && Math.abs(cx) < 0.8 + w / 2) || (x0 === gw / 2 + 0.175 && Math.abs(cz - gz - 0.6) < 0.7 + w / 2)) continue; /* (none over the front's openings, nor behind its sign board) */ G.streak.push(new THREE.PlaneGeometry(w, h).rotateY(ry).translate(cx + nx * 0.035, b.y + 3.06 - h / 2, cz + nz * 0.035)); } }
  // the bay's roller door: its drum housing over the opening inside and the curtain's last slats, stuck up over head height
  box(G, 'steelIn', 3.2, 0.42, 0.42, 1.9, b.y + 3.05, Z0 + 0.4); for (let k = 0; k < 5; k++) box(G, 'steelIn', 3.0, 0.1, 0.04 + (k % 2) * 0.02, 1.9, b.y + 2.79 - k * 0.1 - 0.02 * (k === 4), Z0 + 0.2);
  // the right window boarded over (outside), the back window's glass gone but a shard
  { const x = gw / 2 + 0.175 + 0.03; for (const [a, c] of [[0.5, 0.35], [-0.45, -0.3], [0.05, 0.1]]) box(P, 'planks', 0.025, 0.16, 1.75, x, b.y + 1.55 + c * 0.3, gz + 0.6, 0, a); }
  shard([[-0.78, 1.12], [-0.2, 1.12], [-0.5, 1.5]], Z1);
  for (const [along, c, w0] of [[true, Z1, 1.6], [false, gw / 2, 1.4]]) { const m = along ? [0, c] : [c, gz + 0.6], B = (a, h, x, y) => along ? box(G, 'steelIn', a, h, 0.1, m[0] + x, b.y + y, m[1]) : box(G, 'steelIn', 0.1, h, a, m[0], b.y + y, m[1] + x);
    for (const s of [-1, 1]) B(0.06, 0.9, s * (w0 / 2 - 0.03), 1.55); B(w0, 0.06, 0, 1.97); B(w0, 0.06, 0, 1.13); B(0.04, 0.84, 0, 1.55); } // (the back and right windows' frames)
  // the canopy: a steel deck, its fascia all round, panels and light fittings under it (one fitting dead and hanging, a panel down at
  // one end), four posts in guard collars; the islands and their pumps (the right one's far hose cut)
  const cy = b.y + 4.55, CW = 12, CD = 7.2, cz = -4; box(G, 'steel', CW, 0.3, CD, 0, cy, cz); G.soffit.push(new THREE.PlaneGeometry(CW - 0.04, CD - 0.04).rotateX(PI / 2).translate(0, cy - 0.16, cz));
  for (const [L, x, z, ry] of [[CW + 0.1, 0, cz - CD / 2 - 0.03, PI], [CW + 0.1, 0, cz + CD / 2 + 0.03, 0], [CD + 0.1, -CW / 2 - 0.03, cz, -PI / 2], [CD + 0.1, CW / 2 + 0.03, cz, PI / 2]]) {
    const f = new THREE.BoxGeometry(L, 0.8, 0.04), uv = f.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * L / 4); G.fascia.push(f.rotateY(ry).translate(x, cy + 0.12, z)); }
  for (const x of [-3.4, 0, 3.4]) for (const z of [cz - 1.8, cz + 1.8]) { if (!(x === 3.4 && z > cz)) box(G, 'lens', 1.2, 0.08, 0.45, x, cy - 0.2, z); box(G, 'steel', 1.26, 0.04, 0.5, x, cy - 0.17, z); }
 // (hung on its wire)
  for (const sx of [-4.8, 4.8]) for (const sz of [cz - 2.6, cz + 2.6]) { const y0 = gAt(b, sx, sz); box(G, 'white', 0.3, cy - y0 - 0.1, 0.3, sx, (cy + y0) / 2 - 0.05, sz); box(G, 'hazard', 0.5, 1.0, 0.5, sx, y0 + 0.45, sz); box(P, 'concrete', 0.56, 0.06, 0.56, sx, y0 + 0.97, sz);
    collideRun(b, sx, sz, sx, sz, 0.36, () => cy + 0.2); }
  gasIsland(b, P, G, -1.7, false); gasIsland(b, P, G, 1.7, true);
  // the forecourt's marks, and outside the shop an ice chest and a stack of tyres
  const mark = (k, x, z, w, d, ry = 0) => G[k].push(new THREE.PlaneGeometry(w, d).rotateX(-PI / 2).rotateY(ry).translate(x, gAt(b, x, z) + 0.075, z));
  for (const [x, z, s] of [[-0.6, -4.2, 1.6], [0.7, -3.3, 1.1], [-3.2, -3.6, 1.4], [3.1, -4.6, 1.8], [2.1, 4.9, 1.6], [2.6, 0.8, 1.0], [-5.6, -1.2, 0.9]]) mark('oil', x, z, s, s * 0.8, rnd() * 3);
  for (const [x, z, s] of [[-4.5, -7.0, 2.6], [5.6, -2.0, 2.6], [-6.4, 0.6, 2.4], [1.0, -7.2, 2.2], [6.8, -7.3, 2.0]]) mark('crack', x, z, s, s, rnd() * 3);
  for (const x of [-3.25, 3.25]) mark('arrow', x, -4.6, 0.9, 1.8, x < 0 ? 0 : PI);
  const put = kitRoom(b);
  { const x = -3.3, z = Z0 - 0.62, y = gAt(b, x, z) + 0.06; box(G, 'white', 1.1, 0.86, 0.6, x, y + 0.43, z); G.ice.push(new THREE.PlaneGeometry(0.9, 0.45).rotateY(PI).translate(x, y + 0.5, z - 0.302)); box(P, 'iron', 1.14, 0.06, 0.64, x, y + 0.89, z);
    collideRun(b, x - 0.55, z, x + 0.55, z, 0.32, () => y + 0.92); } // (a run's end circles sit r in from its ends)
  { const x = gw / 2 + 0.75, z = Z0 + 1.2, y = gAt(b, x, z); for (let i = 0; i < 3; i++) put('tyre', x + (rnd() - 0.5) * 0.05, y + 0.08 + i * 0.16, z + (rnd() - 0.5) * 0.05, rnd() * 3, { rx: PI / 2 }); put('tyre', x + 0.1, y + 0.29, z + 0.75, 0.2, { rx: 0.15 });
    collideRun(b, x, z - 0.3, x, z + 1.05, 0.4, () => y + 0.7); }
  // the pole sign: its cabinet's two faces and frame, the price board under it, a step bracket
  { const [px, pz] = [7.6, -9], y = gAt(b, px, pz); box(G, 'steel', 0.2, 7.2, 0.2, px, y + 3.6, pz); collideRun(b, px, pz, px, pz, 0.3, () => y + 7);
    box(G, 'steel', 2.7, 1.5, 0.34, px, y + 6.4, pz); box(G, 'steel', 2.3, 1.2, 0.14, px, y + 5.0, pz); for (const s of [-1, 1]) { G.signFace.push(new THREE.PlaneGeometry(2.56, 1.36).rotateY(s > 0 ? 0 : PI).translate(px, y + 6.4, pz + s * 0.172)); G.price.push(new THREE.PlaneGeometry(2.2, 1.1).rotateY(s > 0 ? 0 : PI).translate(px, y + 5.0, pz + s * 0.072)); } }
  // inside: the counter (its till, a lantern lit on it), two shelf units of tins and a drinks fridge on the shop's side; the car lift,
  // the workbench under its pegboard (a vise, a meter, a jerrycan, a lantern), tyres and drums in the bay
  { const z = Z0 + 2.1, x0 = -IX, x1 = -2.25, y = F(-3, z); box(P, 'planks', x1 - x0 + 0.04, 0.05, 0.66, (x0 + x1) / 2, y + 1.0, z); box(G, 'band', x1 - x0, 0.95, 0.06, (x0 + x1) / 2, y + 0.48, z - 0.27); box(P, 'beam', x1 - x0, 0.95, 0.5, (x0 + x1) / 2, y + 0.48, z + 0.02);
    put('till', -2.8, y + 1.025, z, -PI / 2 - 0.2); litLantern(put, -3.45, y + 1.025, z + 0.1); G.glow.push(new THREE.PlaneGeometry(3.2, 3.2).rotateX(-PI / 2).translate(-3.0, F(-3.0, z - 0.8) + 0.02, z - 0.8));
    put('papers', -3.2, y + 1.025, z - 0.15, 0.4); G.glow.push(new THREE.PlaneGeometry(1.5, 1.4).rotateY(PI).translate(-3.0, b.y + 1.5, Z0 + 0.3)); /* (the lantern's light in the window, seen from outside) */ collideRun(b, x0 + 0.2, z, x1 + 0.1, z, 0.33, () => y + 1.03); }
  for (const z of [Z0 + 3.4, Z0 + 4.55]) { const S = shelfAt(-IX + 0.27, F(-3.5, z), z, PI / 2); put('shelves', -IX + 0.27, F(-3.5, z), z, PI / 2); stock(put, S, [1, 2, 3], rnd, 0.35); /* (picked over: and the scanned tins are the station's heaviest part) */ collideRun(b, -IX + 0.27, z - 0.58, -IX + 0.27, z + 0.58, 0.3, () => F(-3.5, z) + 2.14); }
  { const x = -2.1, z = Z1 - 0.175 - 0.36, y = F(x, z); box(G, 'whiteIn', 0.9, 1.9, 0.04, x, y + 0.95, z + 0.31); for (const s of [-1, 1]) box(G, 'whiteIn', 0.04, 1.9, 0.66, x + s * 0.43, y + 0.95, z);
    box(G, 'whiteIn', 0.9, 0.22, 0.66, x, y + 1.79, z); box(G, 'whiteIn', 0.9, 0.24, 0.66, x, y + 0.12, z); G.drinks.push(new THREE.PlaneGeometry(0.8, 0.15).rotateY(PI).translate(x, y + 1.79, z - 0.332)); box(P, 'glass', 0.82, 1.44, 0.02, x, y + 0.96, z + 0.28);
    for (const sy of [0.24, 0.66, 1.08, 1.48]) { box(G, 'steelIn', 0.82, 0.02, 0.56, x, y + sy, z + 0.02); for (let u = -0.32; u <= 0.33; u += 0.1) if (rnd() < 0.35) put(rnd() < 0.7 ? 'tin' : 'fish', x + u, y + sy + 0.01, z - 0.05 + rnd() * 0.15, rnd() * 6, { s: 2 }); }
    box(P, 'pane', 0.82, 1.44, 0.012, x, y + 0.96, z - 0.325); box(G, 'steelIn', 0.03, 0.5, 0.04, x + 0.36, y + 1.0, z - 0.355);
    collideRun(b, x - 0.25, z, x + 0.25, z, 0.36, () => y + 1.9); }
  for (const x of [0.55, 3.25]) { const z = gz + 0.4, y = F(x, z); box(G, 'steelIn', 0.32, 3.0, 0.32, x, y + 1.5, z); box(G, 'steelIn', 0.5, 0.06, 0.5, x, y + 0.03, z); box(G, 'bodyIn', 0.06, 1.9, 0.08, x + (x < 2 ? 0.19 : -0.19), y + 1.2, z);
    for (const s of [-1, 1]) box(G, 'steelIn', 0.1, 0.06, 1.0, x + (x < 2 ? 0.55 : -0.55), y + 0.22, z + s * 0.35, s * (x < 2 ? 0.5 : -0.5)); collideRun(b, x, z, x, z, 0.3, () => y + 3); }
  box(G, 'steelIn', 2.9, 0.16, 0.16, 1.9, F(1.9, gz + 0.4) + 3.05, gz + 0.4);
  { const x = IX - 0.38, z0 = Z1 - 1.55, z1 = Z1 - 0.3, y = F(x, (z0 + z1) / 2); box(P, 'planks', 0.7, 0.07, z1 - z0, x, y + 0.9, (z0 + z1) / 2); for (const zz of [z0 + 0.08, z1 - 0.08]) for (const dx of [-0.28, 0.28]) box(P, 'beam', 0.07, 0.86, 0.07, x + dx, y + 0.43, zz); box(P, 'planks', 0.6, 0.04, z1 - z0 - 0.1, x, y + 0.2, (z0 + z1) / 2);
    box(G, 'steelIn', 0.16, 0.16, 0.22, x - 0.2, y + 1.02, z0 + 0.25); box(G, 'steelIn', 0.3, 0.03, 0.03, x - 0.32, y + 1.08, z0 + 0.25); G.peg.push(new THREE.PlaneGeometry(z1 - z0, 0.85).rotateY(-PI / 2).translate(IX - 0.004, y + 1.6, (z0 + z1) / 2));
    for (const [dz, h] of [[0.2, 0.3], [0.5, 0.26], [0.9, 0.34]]) box(P, 'iron', 0.02, h, 0.04, IX - 0.02, y + 1.75 - h / 2, z0 + dz); put('meter', x + 0.1, y + 0.935, z0 + 0.75, -PI / 2); litLantern(put, x + 0.05, y + 0.935, z1 - 0.25);
    G.glow.push(new THREE.PlaneGeometry(3.0, 3.0).rotateX(-PI / 2).translate(x - 0.7, F(x - 0.7, z1 - 0.4) + 0.02, z1 - 0.4)); put('jerry', x + 0.05, y + 0.24, z0 + 0.4, PI / 2); for (const e of [-0.15, 0.15]) collideRun(b, x + e, z0, x + e, z1, 0.25, () => y + 0.94); }
  { const x = 0.95, z = Z1 - 0.62, y = F(x, z); for (let i = 0; i < 2; i++) put('tyre', x, y + 0.08 + i * 0.16, z, rnd() * 3, { rx: PI / 2 }); collideRun(b, x, z, x, z, 0.32, () => y + 0.34);
    for (const [dx, dz] of [[1.0, 0.05], [1.62, -0.1]]) { put('barrel', x + dx, F(x + dx, z + dz), z + dz, rnd() * 6); collideRun(b, x + dx, z + dz, x + dx, z + dz, 0.33, () => y + 0.93); } }
  put('clock', -1.0, b.y + 2.55, Z1 - 0.175 - 0.002, PI); put('crate', 2.9, F(2.9, Z0 + 0.9), Z0 + 0.9, 0.15); collideRun(b, 2.9, Z0 + 0.5, 2.9, Z0 + 1.3, 0.3, () => F(2.9, Z0 + 0.9) + 0.45);
  // the lantern hung under the canopy between the islands, on its wire, its light on the forecourt
  bar(G, 'steel', 0, cy - 0.16, cz + 0.6, 0, cy - 1.42, cz + 0.6, 0.012); litLantern(put, 0, cy - 1.95, cz + 0.6); G.glow.push(new THREE.PlaneGeometry(3.4, 3.4).rotateX(-PI / 2).translate(0, gAt(b, 0, cz + 0.6) + 0.085, cz + 0.6));
  put.done(); gasFlush(b, G);
  cache(b, g, -2.6, gz + 1.4); cache(b, g, 0, -4.9); }
// the station's own materials' geometry merged, one mesh per material (box-mapped where it has no uv of its own to keep)
function gasFlush(b, G) { const M = gasMats(); for (const k in G) { if (!G[k].length) continue; const geo = mergeGeometries(G[k].map(q => q.index ? q.toNonIndexed() : q)); if (['body', 'band', 'white', 'hazard', 'lens', 'steel', 'steelIn', 'whiteIn', 'bodyIn'].includes(k)) boxUV(geo, k === 'hazard' ? 0.5 : 1);
  const m = new THREE.Mesh(geo, k === 'hose' ? placeMats().cable : M[k]); m.castShadow = !['oil', 'crack', 'arrow', 'streak', 'glow'].includes(k); m.receiveShadow = true; b.group.add(m); } }

export async function buildBuildings(scene) {
  if (!CRATE) { CRATE = { geo: await loadMesh('wooden_crate_01'), mat: pbr('props/wooden_crate_01', { rough: 0.85 }) }; CRATE.geo.computeBoundingBox(); CRATE.h = CRATE.geo.boundingBox.max.y * 1.25; }
  { const need = places.length || buildings.some(b => b.style) ? Object.keys(KITS) : buildings.some(b => b.kind === 'gas') ? GAS_KIT : []; if (need.some(k => !KIT?.[k])) KIT = await loadKit(need, KIT || {}); } // (and for the house kinds, slice 36) // (slice 23 polish: the interiors' scanned props, only for a world with places)
  const M = mats(), root = new THREE.Group(); root.name = 'buildings'; scene.add(root);
  for (const b of buildings) { const g = new THREE.Group(); g.position.set(b.x, 0, b.z); g.rotation.y = -b.a; root.add(b.group = g);
    const P = Object.fromEntries(Object.keys(TILE).concat('cloth', 'glow', 'glass', 'pane', ...PLANE_KEYS).map(k => [k, []])); b.place = places.find(q => q.b === b || q.shack === b) || null; b.PR = Object.fromEntries(Object.keys(TILE).map(k => [k, []]));
    if (b.style) buildKind(b, P, root); else if (b.kind === 'house') buildHouse(b, P, root); else if (b.kind === 'tower') buildTower(b, P, root); else if (PLACE_BUILD[b.kind]) PLACE_BUILD[b.kind](b, P, root); else buildGas(b, P, root);
    const roof = new THREE.Group(); g.add(roof); b.roofGroup = roof;
    for (const [parts, into] of [[P, g], [b.PR, roof]]) for (const k in parts) { if (!parts[k].length) continue;
      const geo = mergeGeometries(parts[k].map(q => q.index ? q.toNonIndexed() : q)); if (TILE[k]) boxUV(geo, TILE[k]);
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
  // (slice 23) the crater lakes' chests, at the bottom, and a crate on every island but the hermit's (his is in his shack)
  const W0 = { x: 0, z: 0, a: 0, ca: 1, sa: 0 };
  for (const q of places) { if (q.kind === 'crater') { q.chest = cache(W0, root, q.x + 0.6, q.z - 0.4, null, { k: 4, ammo: 6, sunk: true }); buildCrater(q, root); } // (its rim rocks, mist, glow, wreck and bones)
    if (q.kind === 'plane' || q.kind === 'barge' || q.kind === 'shrooms' || q.kind === 'outpost') q.crate = caches.find(c => c.camp === q) || null; }
  for (const s of islands) if (s.crate) cache(W0, root, s.crate.x, s.crate.z, null, { k: 2 });
}

// ── Places worth going to (slice 23, #52): the radio tower's mast, the crashed plane, the sunken barge, the mushroom ring ──
const UP = new THREE.Vector3(0, 1, 0);
// a straight bar between two points of the frame, t thick (a mast's legs and braces, wires)
export function bar(P, k, x0, y0, z0, x1, y1, z1, t = 0.12) { const d = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0), L = d.length();
  P[k].push(new THREE.BoxGeometry(t, L, t).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize())).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)); }
// (slice 23 polish, #52, Jared: "the same sort of scale and quality/detail check" as the plane) the places' own materials, made
// once: chain-link and grating you see through, warning signs, solar cells, a lit window, a stove's glow on the floor, equipment
// cabinets, oil drums, black cable, fibreglass white, a radome's panels, an obstruction light's red, ice, marker orange.
// The ones used indoors take the cutaway plane (CUT); the outdoor ones stay whole
let PM = null;
function placeMats() { if (PM) return PM;
  const rep = (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }, M = (o, cut = false) => { const m = new THREE.MeshStandardMaterial(o); if (cut) m.clippingPlanes = [CUT]; return m; };
  const grime = (x, w, h, n = 120) => { for (let i = 0; i < n; i++) { x.fillStyle = `rgba(${80 + Math.random() * 40},${60 + Math.random() * 20},30,${0.05 + Math.random() * 0.15})`; x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 4, 2 + Math.random() * 14); } };
  const plate = (draw) => M({ roughness: 0.55, metalness: 0.15, map: canvasTex(256, 192, (x, w, h) => { draw(x, w, h); x.strokeStyle = '#1a1a1a'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6); x.fillStyle = '#555'; for (const [a, c] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) { x.beginPath(); x.arc(a, c, 4, 0, 6.283); x.fill(); } grime(x, w, h, 90); }, '#f1efe6') });
  const tri = (x, cx, cy, s) => { x.fillStyle = '#111'; x.beginPath(); x.moveTo(cx, cy - s); x.lineTo(cx + s * 1.1, cy + s * 0.9); x.lineTo(cx - s * 1.1, cy + s * 0.9); x.closePath(); x.fill(); x.fillStyle = '#f2c21b'; x.beginPath(); x.moveTo(cx, cy - s * 0.62); x.lineTo(cx + s * 0.78, cy + s * 0.72); x.lineTo(cx - s * 0.78, cy + s * 0.72); x.closePath(); x.fill(); x.fillStyle = '#111'; };
  const cab = M({ roughness: 0.6, metalness: 0.35, map: canvasTex(128, 256, (x, w, h) => { x.fillStyle = 'rgba(30,32,30,0.85)'; x.fillRect(8, 8, w - 16, 3); x.fillRect(8, h - 11, w - 16, 3); x.fillRect(8, 8, 3, h - 16); x.fillRect(w - 11, 8, 3, h - 16); x.fillRect(w / 2 - 1, 8, 2, h - 16);
    for (let j = 26; j < 74; j += 7) { x.fillRect(18, j, w / 2 - 30, 3); x.fillRect(w / 2 + 12, j, w / 2 - 30, 3); } x.fillRect(w / 2 - 12, h / 2 + 10, 5, 28); x.fillRect(w / 2 + 7, h / 2 + 10, 5, 28); tri(x, w / 2 + 34, 120, 13); grime(x, w, h, 60); }, '#b7bbb3') });
  const drum = M({ roughness: 0.6, metalness: 0.3, map: canvasTex(128, 128, (x, w, h) => { x.fillStyle = 'rgba(15,15,15,0.4)'; for (const j of [h * 0.33, h * 0.66]) x.fillRect(0, j - 3, w, 6); x.fillRect(0, 0, w, 5); x.fillRect(0, h - 5, w, 5);
    for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(${100 + Math.random() * 50},${55 + Math.random() * 25},25,${0.15 + Math.random() * 0.3})`; x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 7, 3 + Math.random() * 24); } }, '#ffffff') });
  const tint = (m, c) => { const n = m.clone(); n.color.set(c); return n; };
  PM = { cab, gen: tint(cab, 0x7f9160), drumB: tint(drum, 0x2f5f8a), drumR: tint(drum, 0xa0301f), drumY: tint(drum, 0xc8981c),
    chain: M({ color: 0xc0c4c8, metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide, transparent: true, depthWrite: false, alphaTest: 0.05, map: rep(canvasTex(64, 64, (x, w, h) => { x.strokeStyle = '#d4d8dc'; x.lineWidth = 2.5; x.beginPath(); for (let i = -w; i <= w; i += 16) { x.moveTo(i, 0); x.lineTo(i + h, h); x.moveTo(i + h, 0); x.lineTo(i, h); } x.stroke(); }, '#a8acb0')) }),
    grate: M({ color: 0xa4a6a2, metalness: 0.55, roughness: 0.6, side: THREE.DoubleSide, alphaTest: 0.5, map: rep(canvasTex(64, 64, (x, w, h) => { x.fillStyle = '#c4c6c2'; for (let i = 0; i < w; i += 8) x.fillRect(i, 0, 3, h); for (let j = 0; j < h; j += 32) x.fillRect(0, j, w, 5); }, '#a4a6a2')) }),
    solar: M({ metalness: 0.5, roughness: 0.22, map: canvasTex(128, 192, (x, w, h) => { x.fillStyle = 'rgba(150,180,225,0.22)'; for (let i = 0; i < w; i += 4) x.fillRect(i, 0, 1, h); x.fillStyle = '#c9ced6'; for (let i = 0; i <= 4; i++) x.fillRect(i * (w - 5) / 4, 0, 5, h); for (let j = 0; j <= 6; j++) x.fillRect(0, j * (h - 5) / 6, w, 5); }, '#16264a') }),
    lit: M({ color: 0x2a2014, roughness: 0.25, emissive: 0xffffff, emissiveIntensity: 1.1, emissiveMap: canvasTex(64, 64, (x, w, h) => { const gr = x.createRadialGradient(w / 2, h * 0.62, 2, w / 2, h / 2, w * 0.75); gr.addColorStop(0, '#ffe9b8'); gr.addColorStop(1, '#b8682a'); x.fillStyle = gr; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(90,40,20,0.75)'; x.fillRect(0, 0, 12, h); x.fillRect(w - 12, 0, 12, h); }, '#000') }, true),
    heat: Object.assign(new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: canvasTex(64, 64, (x, w, h) => { const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,190,120,0.75)'); gr.addColorStop(1, 'rgba(255,110,30,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); }, '#000') }), { clippingPlanes: [CUT] }),
    cable: M({ color: 0x18181a, roughness: 0.55 }), white: M({ color: 0xe6e8e2, roughness: 0.5, metalness: 0.05 }), dome: M({ color: 0xeef0ec, roughness: 0.6, flatShading: true }),
    drift: M({ roughness: 0.93, map: canvasTex(128, 128, (x, w, h) => { for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${170 + Math.random() * 30},${185 + Math.random() * 25},${205 + Math.random() * 25},${0.05 + Math.random() * 0.1})`; x.beginPath(); x.ellipse(Math.random() * w, Math.random() * h, 3 + Math.random() * 14, 2 + Math.random() * 6, Math.random() * 3, 0, 6.283); x.fill(); } }, '#d6dde6') }),
    red: new THREE.MeshBasicMaterial({ color: 0xd8261a }), ice: M({ color: 0xd4ecf6, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.82 }, true), orange: M({ color: 0xe05a18, roughness: 0.8, side: THREE.DoubleSide }),
    danger: plate((x, w, h) => { x.fillStyle = '#111'; x.fillRect(0, 0, w, 66); x.fillStyle = '#c4161c'; x.beginPath(); x.ellipse(w / 2, 33, 98, 25, 0, 0, 6.283); x.fill(); x.fillStyle = '#fff'; x.font = 'bold 38px sans-serif'; x.textAlign = 'center'; x.fillText('DANGER', w / 2, 47);
      x.fillStyle = '#111'; x.font = 'bold 32px sans-serif'; x.fillText('HIGH VOLTAGE', w / 2, 114); x.font = 'bold 25px sans-serif'; x.fillText('KEEP OUT', w / 2, 158); }),
    rf: plate((x, w, h) => { x.fillStyle = '#f2c21b'; x.fillRect(0, 0, w, h); tri(x, 52, 58, 34); x.lineWidth = 3; x.strokeStyle = '#111'; x.beginPath(); x.arc(52, 72, 4, 0, 6.283); x.fill(); for (const r of [9, 15]) { x.beginPath(); x.arc(52, 72, r, -2.5, -0.64); x.stroke(); }
      x.font = 'bold 30px sans-serif'; x.textAlign = 'left'; x.fillText('CAUTION', 102, 58); x.font = 'bold 21px sans-serif'; x.fillText('RADIO WAVES', 102, 86); x.textAlign = 'center'; x.font = 'bold 21px sans-serif'; x.fillText('AUTHORIZED CLIMBERS', w / 2, 132); x.fillText('ONLY', w / 2, 160); }),
    station: plate((x, w, h) => { x.fillStyle = '#1d4e89'; x.fillRect(0, 0, w, h); x.fillStyle = '#f1efe6'; x.fillRect(14, 14, w - 28, h - 28); x.fillStyle = '#1d4e89'; x.textAlign = 'center'; x.font = 'bold 36px sans-serif'; x.fillText('FROSTLINE', w / 2, 66); x.font = 'bold 21px sans-serif'; x.fillText('RESEARCH STATION', w / 2, 100);
      x.fillRect(40, 116, w - 80, 3); x.font = '18px sans-serif'; x.fillText('MET  ·  RADIO  ·  ICE CORE', w / 2, 146); }) };
  return PM; }
const PK = ['drift', 'chain', 'grate', 'cab', 'gen', 'drumB', 'drumR', 'drumY', 'cable', 'white', 'dome', 'red', 'solar', 'ice', 'orange', 'heat', 'lit'];
const slot = () => Object.fromEntries(PK.map(k => [k, []]));
// a slot's geometries (in the building's frame) merged one mesh per material onto the building's group
function flush(b, Q) { const M = placeMats(); for (const k in Q) { if (!Q[k].length) continue; const geo = mergeGeometries(Q[k].map(q => q.index ? q.toNonIndexed() : q)); if (k === 'chain' || k === 'grate' || k === 'drift') boxUV(geo, k === 'chain' ? 0.25 : k === 'grate' ? 0.3 : 3);
  const m = new THREE.Mesh(geo, M[k]); m.castShadow = !['heat', 'lit', 'red', 'chain', 'grate', 'ice'].includes(k); m.receiveShadow = k !== 'heat'; b.group.add(m); } }
// a sign plate facing +z turned by ry (its back plain iron)
function signAt(b, m, x, y, z, ry, sw = 0.6, sh = 0.45) { const I = mats().iron, s = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 0.025), [I, I, I, I, m, I]); s.position.set(x, y, z); s.rotation.y = ry; s.castShadow = true; b.group.add(s); }
// a quad from (x0, y0, z0) to (x1, y1, z1) along its bottom, h tall (a fence bay, a gate leaf)
function quad(x0, y0, z0, x1, y1, z1, h) { const q = new THREE.PlaneGeometry(1, 1), p = q.attributes.position; p.setXYZ(0, x0, y0 + h, z0); p.setXYZ(1, x1, y1 + h, z1); p.setXYZ(2, x0, y0, z0); p.setXYZ(3, x1, y1, z1); q.computeVertexNormals(); return q; }
// a snow drift: a flattened dome, r across, sunk a little (into a slot's drift)
const drift = (b, Q, x, z, r, sx = 1.6, sy = 0.45, ry = 0) => Q.drift.push(new THREE.SphereGeometry(r, 18, 6, 0, 6.283, 0, 1.3).scale(sx, sy, 1).rotateY(ry).translate(x, gAt(b, x, z) - 0.15, z));

// the radio tower (IW1's): a 30 m lattice mast on a concrete pad, guyed three ways, a caged ladder up its front to a railed
// grating platform at 18 m (the view: you can see most of the world from it), sector antennas at 27 m, microwave dishes at
// 20 to 24 m, its feeder cables down a leg and along a cable bridge into the shack, and a red lamp on its whip that blinks
// (src/places.js), seen for kilometres. Round it a real site: a chain-link compound with barbed wire (its gate swung open, a bay
// fallen on the far side), warning signs, equipment cabinets on a slab, a generator and its drums. The shack is its own house
// record (furnish 'radio'), its door toward the mast
function buildRadio(b, P, g) { const H = 30, w0 = 1.8, w1 = 0.32, hw = (y) => w0 + (w1 - w0) * y / H, C = [[-1, -1], [1, -1], [1, 1], [-1, 1]], PY = 18, M = placeMats(), Q = slot();
  // the footing: a pad (a step up, stood on) with a plinth and base plate under each leg
  const pad = Math.max(b.y, ...[-2.4, 2.4].flatMap(x => [-2.4, 2.4].map(z => gAt(b, x, z)))) + 0.14;
  box(P, 'concrete', 4.8, pad - b.y + 0.9, 4.8, 0, (pad + b.y - 0.9) / 2, 0); surface(b, (lx, lz) => Math.abs(lx) <= 2.4 && Math.abs(lz) <= 2.4 ? pad : null);
  for (const [sx, sz] of C) { for (let s = 0; s < 10; s++) { const f0 = s / 10, f1 = (s + 1) / 10, yy = (f) => b.y - 0.4 + (H + 0.4) * f, xx = (f) => sx * (w0 + (w1 - w0) * f), zz = (f) => sz * (w0 + (w1 - w0) * f); bar(P, s % 2 ? 'snow' : 'paint', xx(f0), yy(f0), zz(f0), xx(f1), yy(f1), zz(f1), 0.24); }
    box(P, 'concrete', 0.9, 0.5, 0.9, sx * w0, pad + 0.2, sz * w0); box(P, 'iron', 0.62, 0.05, 0.62, sx * w0, pad + 0.47, sz * w0); collideRun(b, sx * w0, sz * w0, sx * w0, sz * w0, 0.5, () => b.y + H); }
  for (let y = 1, i = 0; y < H - 1; y += 3, i++) { const a = hw(y), c = hw(Math.min(H, y + 3)), ya = b.y + y, yb = b.y + Math.min(H, y + 3);
    for (let q = 0; q < 4; q++) { const [ax, az] = C[q], [bx, bz] = C[(q + 1) % 4]; bar(P, 'iron', ax * a, ya, az * a, bx * a, ya, bz * a, 0.09);
      if (i % 2) bar(P, 'iron', ax * a, ya, az * a, bx * c, yb, bz * c, 0.07); else bar(P, 'iron', bx * a, ya, bz * a, ax * c, yb, az * c, 0.07); } }
  // the platform: a steel frame and joists under open grating (a hatch where the ladder comes up), a rail, mid-rail and toe board
  const pw = 1.45, py = b.y + PY; surface(b, (lx, lz) => Math.abs(lx) <= pw && Math.abs(lz) <= pw ? py + 0.05 : null);
  for (const s of [-1, 1]) { box(P, 'iron', pw * 2 + 0.1, 0.16, 0.08, 0, py - 0.04, s * pw); box(P, 'iron', 0.08, 0.16, pw * 2, s * pw, py - 0.04, 0); box(P, 'iron', 0.06, 0.12, pw * 2, s * 0.55, py - 0.05, 0); }
  for (const [x0, x1, z0, z1] of [[-pw, pw, -0.95, pw], [-pw, -0.42, -pw, -0.95], [0.42, pw, -pw, -0.95]]) Q.grate.push(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, py + 0.04, (z0 + z1) / 2));
  for (const [x0, z0, x1, z1] of [[-pw, pw, pw, pw], [-pw, -pw, -pw, pw], [pw, -pw, pw, pw], [-pw, -pw, -0.45, -pw], [0.45, -pw, pw, -pw]]) { for (const h of [1.05, 0.55]) bar(P, 'iron', x0, py + h, z0, x1, py + h, z1, 0.05);
    box(P, 'iron', Math.abs(x1 - x0) || 0.02, 0.1, Math.abs(z1 - z0) || 0.02, (x0 + x1) / 2, py + 0.1, (z0 + z1) / 2);
    for (const [x, z] of [[x0, z0], [x1, z1]]) bar(P, 'iron', x, py, z, x, py + 1.05, z, 0.06); collideRun(b, x0, z0, x1, z1, 0.12, () => py + 1.1); }
  // the ladder up the front face (it leans in with the mast), caged from 2.4 m: hoops round the climber and five straps up them
  const lz = (y) => -(hw(y) + 0.32), cz = (y) => lz(y) - 0.36; for (const sx of [-0.26, 0.26]) bar(P, 'iron', sx, b.y, lz(0), sx, b.y + PY + 1, lz(PY + 1), 0.05);
  for (let y = 0.35; y < PY; y += 0.35) box(P, 'iron', 0.52, 0.04, 0.04, 0, b.y + y, lz(y));
  ladders.push({ b, y0: b.y, y1: b.y + PY + 0.05, off: toW(b, 0, -0.6), at: (y) => toW(b, 0, lz(y - b.y) - 0.12) });
  const hoop = new THREE.TorusGeometry(0.42, 0.022, 4, 12, Math.PI).rotateX(-Math.PI / 2);
  for (let y = 2.4; y <= PY + 1.05; y += 0.8) { P.iron.push(hoop.clone().translate(0, b.y + y, cz(y))); for (const s of [-1, 1]) bar(P, 'iron', s * 0.42, b.y + y, cz(y), s * 0.27, b.y + y, lz(y), 0.025); }
  for (let k = 0; k <= 4; k++) { const t = k / 4 * Math.PI, x = Math.cos(t) * 0.42, dz = -Math.sin(t) * 0.42; bar(P, 'iron', x, b.y + 2.4, cz(2.4) + dz, x, b.y + PY + 1, cz(PY + 1) + dz, 0.03); }
  // microwave dishes: a shrouded dish with a flat radome, a back housing, clamped to a pipe on the mast by two struts
  const dish = (dx, dz, y, r) => { const d = new THREE.Vector3(dx, 0, dz), q = new THREE.Quaternion().setFromUnitVectors(UP, d), o = hw(y) + 0.3 + r * 0.3, at = (geo, k) => Q[k].push(geo.applyQuaternion(q).translate(d.x * o, b.y + y, d.z * o));
    at(new THREE.CylinderGeometry(r, r, 0.42, 22, 1, true), 'white'); at(new THREE.CircleGeometry(r, 22).rotateX(-Math.PI / 2).translate(0, 0.2, 0), 'white');
    at(new THREE.SphereGeometry(r, 18, 4, 0, 6.283, 0, 1.0).rotateX(Math.PI).scale(1, 0.45, 1).translate(0, -0.21 + Math.cos(1) * r * 0.45, 0), 'white');
    const m = hw(y) + 0.1; bar(P, 'iron', d.x * m, b.y + y - r - 0.3, d.z * m, d.x * m, b.y + y + r + 0.3, d.z * m, 0.07);
    for (const s of [-1, 1]) bar(P, 'iron', d.x * m, b.y + y + s * r * 0.5, d.z * m, d.x * (o - 0.3), b.y + y + s * r * 0.4, d.z * (o - 0.3), 0.04); };
  dish(1, 0, 22, 0.62); dish(-1, 0, 20.5, 0.9); dish(0, 1, 24, 0.45);
  // sector antennas: three pairs of panels on arms round the top, each on its mount pipe
  for (const a of [0.35, 2.45, 4.55]) { const ca = Math.cos(a), sa = Math.sin(a), r0 = hw(26.6), r1 = 1.2, ry = Math.atan2(ca, sa);
    for (const y of [25.9, 27.3]) { bar(P, 'iron', ca * r0, b.y + y, sa * r0, ca * r1, b.y + y, sa * r1, 0.06); bar(P, 'iron', ca * r1 + sa * 0.4, b.y + y, sa * r1 - ca * 0.4, ca * r1 - sa * 0.4, b.y + y, sa * r1 + ca * 0.4, 0.05); }
    for (const s of [-0.28, 0.28]) { const x = ca * (r1 + 0.12) - sa * s, z = sa * (r1 + 0.12) + ca * s; bar(P, 'iron', ca * r1 - sa * s, b.y + 25.6, sa * r1 + ca * s, ca * r1 - sa * s, b.y + 27.7, sa * r1 + ca * s, 0.05); box(Q, 'white', 0.3, 1.45, 0.13, x, b.y + 26.6, z, ry); } }
  // feeder cables down the back-right leg to 2.4 m, across to the cable bridge and along it into the shack's front wall
  const TH = b.y + 2.25, tx = 1.6;
  for (let i = 0; i < 4; i++) { const o = i * 0.055 - 0.08, at = (y) => hw(y) - 0.14; bar(Q, 'cable', at(26.4) + o, b.y + 26.4, at(26.4), at(2.4) + o, b.y + 2.4, at(2.4), 0.04);
    bar(Q, 'cable', at(2.4) + o, b.y + 2.4, at(2.4), tx + o, TH + 0.06, 2.0, 0.04); bar(Q, 'cable', tx + o, TH + 0.06, 2.0, tx + o, TH + 0.06, 5.45, 0.04); }
  for (const s of [-1, 1]) box(P, 'iron', 0.04, 0.1, 3.6, tx + s * 0.22, TH, 3.68); for (let z = 1.95; z < 5.45; z += 0.45) box(P, 'iron', 0.46, 0.03, 0.05, tx, TH - 0.04, z);
  { const gy = gAt(b, tx, 3.7) - 0.3; P.iron.push(new THREE.CylinderGeometry(0.06, 0.06, TH - gy, 8).translate(tx, (TH + gy) / 2, 3.7)); box(P, 'iron', 0.6, 0.06, 0.06, tx, TH - 0.08, 3.7); box(P, 'iron', 0.6, 0.35, 0.05, tx, TH, 5.47); collideRun(b, tx, 3.7, tx, 3.7, 0.12, () => TH); }
  // obstruction lights half way up, and a housing under the beacon
  for (const [sx, sz] of [[-1, -1], [1, 1]]) Q.red.push(new THREE.SphereGeometry(0.14, 10, 6).translate(sx * (hw(15) + 0.14), b.y + 15, sz * (hw(15) + 0.14)));
  // equipment cabinets on a slab to the right of the mast, a conduit to the pad
  { const cx = 4.3, cy = Math.max(gAt(b, cx, -0.9), gAt(b, cx, 1.9), gAt(b, cx, 0.5)) + 0.12; box(P, 'concrete', 1.4, cy - b.y + 0.6, 3.2, cx, (cy + b.y - 0.6) / 2, 0.5);
    for (const [z, h, wd] of [[-0.35, 1.7, 0.85], [0.6, 1.7, 0.85], [1.45, 1.15, 0.7]]) { box(Q, 'cab', 0.7, h, wd, cx, cy + h / 2, z); box(P, 'iron', 0.8, 0.05, wd + 0.08, cx, cy + h + 0.03, z); box(P, 'iron', 0.5, 0.1, wd - 0.1, cx, cy + 0.05, z); }
    bar(Q, 'cable', cx - 0.36, cy + 0.06, 0.2, 2.4, pad + 0.03, 0.2, 0.06); collideRun(b, cx, -0.75, cx, 1.8, 0.5, () => cy + 1.75); }
  // the generator on its skids (exhaust, control panel, a cable to the shack) and its fuel drums by the shack's side
  { const gx = -4.4, gz = 3.3, gy = gAt(b, gx, gz); for (const s of [-1, 1]) box(P, 'iron', 0.1, 0.12, 2.3, gx + s * 0.45, gy + 0.06, gz); box(P, 'iron', 1.0, 0.3, 2.1, gx, gy + 0.27, gz);
    box(Q, 'gen', 1.0, 1.0, 1.9, gx, gy + 0.92, gz); box(P, 'iron', 1.05, 0.05, 1.95, gx, gy + 1.44, gz); P.iron.push(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 8).translate(gx + 0.25, gy + 1.8, gz + 0.6)); box(P, 'iron', 0.15, 0.03, 0.15, gx + 0.25, gy + 2.19, gz + 0.6, 0, 0.35);
    box(Q, 'cab', 0.06, 0.45, 0.55, gx - 0.53, gy + 1.05, gz - 0.45); bar(Q, 'cable', gx + 0.5, gy + 0.3, gz + 0.9, -2.45, b.y + 0.35, 6.4, 0.05); collideRun(b, gx, gz - 0.85, gx, gz + 0.85, 0.55, () => gy + 1.45);
    for (const [x, z, k] of [[-5.15, 6.3, 'drumR'], [-5.75, 6.85, 'drumB'], [-5.05, 7.0, 'drumR'], [-5.55, 7.6, 'drumY']]) Q[k].push(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14).translate(x, gAt(b, x, z) + 0.44, z));
    Q.drumB.push(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14).rotateZ(Math.PI / 2).rotateY(0.4).translate(-4.2, gAt(b, -4.2, 8.9) + 0.29, 8.9));
    collideRun(b, -5.4, 6.3, -5.4, 7.6, 0.5, () => b.y + 0.9); collideRun(b, -4.6, 8.75, -3.8, 9.05, 0.3, () => b.y + 0.6); }
  // the compound: chain-link on posts every 3 m with a top rail and three strands of barbed wire on arms leaning out; the gate's
  // two leaves stand open at the front, and a bay on the right side has fallen flat (two ways in, nothing traps a player)
  const F = [[-6.5, -6.5], [6.5, -6.5], [6.5, 11.5], [-6.5, 11.5]], GAP = [[[4.5, 8.5]], [[9.5, 12.5]], [], []];
  const post = (x, z, ox, oz, r = 0.04, h = 2.1) => { const y = gAt(b, x, z); P.iron.push(new THREE.CylinderGeometry(r, r, h + 0.5, 6).translate(x, y + h / 2 - 0.25, z)); bar(P, 'iron', x, y + 2.05, z, x + ox * 0.36, y + 2.45, z + oz * 0.36, 0.035); };
  F.forEach(([x0, z0], i) => { const [x1, z1] = F[(i + 1) % 4], L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, ox = uz, oz = -ux; let s = 0; const runs = [];
    for (const [a, c] of GAP[i]) { runs.push([s, a]); s = c; } runs.push([s, L]);
    for (const [a, c] of runs) { const n = Math.max(1, Math.ceil((c - a) / 3)), P0 = (t) => [x0 + ux * t, z0 + uz * t];
      for (let k = 0; k <= n; k++) { const [x, z] = P0(a + (c - a) * k / n); post(x, z, ox, oz, k === 0 || k === n ? 0.06 : 0.04); }
      for (let k = 0; k < n; k++) { const [xa, za] = P0(a + (c - a) * k / n), [xb, zb] = P0(a + (c - a) * (k + 1) / n), ya = gAt(b, xa, za), yb = gAt(b, xb, zb);
        Q.chain.push(quad(xa, ya + 0.06, za, xb, yb + 0.06, zb, 1.98)); bar(P, 'iron', xa, ya + 2.05, za, xb, yb + 2.05, zb, 0.045);
        for (const f of [0.35, 0.68, 1]) bar(P, 'iron', xa + ox * 0.36 * f, ya + 2.05 + 0.4 * f, za + oz * 0.36 * f, xb + ox * 0.36 * f, yb + 2.05 + 0.4 * f, zb + oz * 0.36 * f, 0.014); }
      const [xa, za] = P0(a), [xb, zb] = P0(c); collideRun(b, xa, za, xb, zb, 0.12, () => b.y + 2.4); } });
  // the gate's leaves, hinged on the gate posts and swung out
  for (const [hx, ang] of [[-2, -1.25], [2, Math.PI + 0.95]]) { const ux = Math.cos(ang), uz = Math.sin(ang), ex = hx + ux * 1.95, ez = -6.5 + uz * 1.95, ya = gAt(b, hx, -6.5) + 0.1, yb = gAt(b, ex, ez) + 0.1;
    Q.chain.push(quad(hx, ya, -6.5, ex, yb, ez, 1.8)); for (const h of [0, 0.9, 1.8]) bar(P, 'iron', hx, ya + h, -6.5, ex, yb + h, ez, 0.045); bar(P, 'iron', ex, yb, ez, ex, yb + 1.8, ez, 0.045); bar(P, 'iron', hx, ya, -6.5, ex, yb + 1.8, ez, 0.03);
    collideRun(b, hx + ux * 0.3, -6.5 + uz * 0.3, ex, ez, 0.1, () => b.y + 2); }
  { const y = gAt(b, 7.6, 4.5); Q.chain.push(new THREE.PlaneGeometry(1.95, 2.9).rotateX(-Math.PI / 2).rotateY(0.12).translate(7.7, y + 0.07, 4.5)); bar(P, 'iron', 7.0, y + 0.08, 3.1, 7.2, y + 0.1, 5.9, 0.045); bar(P, 'iron', 6.5, y - 0.3, 4.6, 7.5, y + 1.6, 4.9, 0.04); }
  // signs: danger and RF on the fence either side of the gate, RF on the mast by the ladder
  signAt(b, M.danger, -3.6, gAt(b, -3.6, -6.5) + 1.35, -6.54, Math.PI); signAt(b, M.rf, 3.6, gAt(b, 3.6, -6.5) + 1.35, -6.54, Math.PI); signAt(b, M.rf, -0.85, pad + 1.9, -hw(1.9) - 0.06, Math.PI, 0.5, 0.375);
  // the whip; three guy wires to anchors with turnbuckles
  bar(P, 'iron', 0, b.y + H, 0, 0, b.y + H + 4, 0, 0.08); P.iron.push(new THREE.CylinderGeometry(0.22, 0.28, 0.3, 10).translate(0, b.y + H + 3.75, 0));
  for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.5, x = Math.cos(a) * 15, z = Math.sin(a) * 15, y = gAt(b, x, z); bar(P, 'iron', Math.cos(a) * hw(25), b.y + 25, Math.sin(a) * hw(25), x, y + 0.5, z, 0.035);
    bar(P, 'iron', x, y + 0.45, z, x - Math.cos(a) * 0.45, y + 1.2, z - Math.sin(a) * 0.45, 0.07); box(P, 'concrete', 0.8, 0.5, 0.8, x, y + 0.15, z); collideRun(b, x, z, x, z, 0.45, () => y + 0.4); }
  flush(b, Q);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false })); /* (seen through the haze from far off) */ lamp.position.set(0, b.y + H + 4.2, 0); b.group.add(lamp); if (b.place) b.place.lamp = lamp; }

// the crashed plane (slice 23, rebuilt at real scale; Jared, November 14, 2026: "if it's meant to be like a commercial airliner, the
// scale should make sense and the detail needs improved"): a narrow-body airliner the size of an A320 (fuselage 3.9 m across and 38 m
// long, wings 34 m tip to tip) of a made-up airline, Solmere, broken in three where it ploughed in. The nose has dug in nose-down, the
// middle (the wing box) lies sunk in its own furrow with the right wing still on, the tail lies slewed and rolled with its fin leaning.
// The left wing tore off and lies propped on its own engine; the right engine fell off and lies ahead of the right wing. Walk into the
// middle through either break (a torn floor panel ramps down to the sand); the cargo crate is at the back of the cabin, seen from the
// rear break. Everything is built in a design frame (y 0 on the fuselage's centreline, -z the nose, z -19 to 19) and each piece is
// moved into the building's frame by its own pose.
const FZ0 = -19, FRX = 1.95, FRY = 2.02, FLOOR = -0.77, TAU = Math.PI * 2;
// the fuselage's top and bottom lines and half-width at z: a round nose with the windscreen sloping back, the tail cone swept up
function fprof(z) {
  if (z < -13.5) { const t = Math.max(0.002, (z + 19) / 5.5), e = Math.sqrt(1 - (1 - t) ** 2); return { top: -0.55 + (FRY + 0.55) * e ** 0.85, bot: -0.55 - (FRY - 0.55) * e ** 0.55, hw: FRX * e ** 0.7 }; }
  if (z > 6) { const t = Math.min(1, (z - 6) / 13); return { top: FRY - (FRY - 1.05) * t ** 2.2, bot: -FRY + (FRY + 0.6) * t ** 1.35, hw: FRX + (0.24 - FRX) * t ** 1.5 }; }
  return { top: FRY, bot: -FRY, hw: FRX }; }
// a point of the skin at z, angle f round from the crown (toward +x first), inset d
const fpt = (z, f, d = 0) => { const p = fprof(z), hh = (p.top - p.bot) / 2; return [Math.max(0.01, p.hw - d) * Math.sin(f), (p.top + p.bot) / 2 + Math.max(0.01, hh - d) * Math.cos(f)]; };
// a stretch of skin from z0 to z1: o.d inset, o.j0 / o.j1 the torn ends (metres added to z, by angle), o.dent crumpling, o.f0..o.f1 the
// angles it covers; its uv runs along the body (u, 38 m) and round it from the crown (v), so one painted livery wraps every piece
function skinGeo(z0, z1, o = {}) { const na = o.na || 40, f0 = o.f0 ?? 0, f1 = o.f1 ?? TAU, nz = Math.max(1, Math.ceil((z1 - z0) / (o.dz || 0.5))), d = o.d || 0, pos = [], uv = [], idx = [];
  for (let i = 0; i <= nz; i++) { const s = i / nz;
    for (let k = 0; k <= na; k++) { const f = f0 + (f1 - f0) * k / na; let z = z0 + (z1 - z0) * s;
      if (o.j0) z += o.j0(f) * (1 - s) ** 6; if (o.j1) z += o.j1(f) * s ** 6;
      const [x, y] = fpt(z, f, d - (o.dent ? o.dent(f, z) : 0)); pos.push(x, y, z); uv.push((z - FZ0) / 38, ((f % TAU) + TAU) % TAU / TAU); } }
  for (let i = 0; i < nz; i++) for (let k = 0; k < na; k++) { const a = i * (na + 1) + k, b = a + 1, c = a + na + 1, e = c + 1; idx.push(a, c, b, b, c, e); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  if (f1 - f0 >= TAU - 1e-6) { const n = g.attributes.normal; for (let i = 0; i <= nz; i++) { const a = i * (na + 1), b = a + na, v = new THREE.Vector3(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize(); n.setXYZ(a, v.x, v.y, v.z); n.setXYZ(b, v.x, v.y, v.z); } } // (no seam along the crown)
  if (o.uvAt) { const p = g.attributes.position, u = g.attributes.uv; for (let i = 0; i < p.count; i++) { const [a, c] = o.uvAt(p.getX(i), p.getY(i), p.getZ(i), u.getX(i), u.getY(i)); u.setXY(i, a, c); } }
  return g; }
// an airfoil surface through stations { x, y, z (leading edge), c (chord), t (thickness / chord), v (texture row) }, span along x
// (o.sym: a symmetric section, for the fin; o.caps: stations to close)
function wingGeo(st, o = {}) { const N = 8, R = 2 * N + 1, pos = [], uv = [], idx = [];
  const cs = (s) => 0.5 - 0.5 * Math.cos(Math.PI * s), th = (s) => 5 * (0.2969 * Math.sqrt(s) - 0.126 * s - 0.3516 * s * s + 0.2843 * s ** 3 - 0.1036 * s ** 4);
  for (const q of st) for (let i = 0; i < R; i++) { const up = i <= N, s = cs(up ? 1 - i / N : (i - N) / N), h = th(s) * q.t * q.c * (o.sym ? (up ? 1 : -1) : (up ? 1.12 : -0.78)), cam = o.sym ? 0 : 0.012 * q.c * Math.sin(Math.PI * s);
    pos.push(q.x, q.y + cam + h, q.z + s * q.c); uv.push(s, q.v ?? 0); }
  for (let j = 0; j < st.length - 1; j++) for (let i = 0; i < R - 1; i++) { const a = j * R + i, b = a + 1, c = a + R, d = c + 1; idx.push(a, c, b, b, c, d); }
  for (const j of o.caps || []) for (let i = 1; i < R - 2; i++) idx.push(j * R, j * R + i, j * R + i + 1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g; }
// the wing's upper surface height over its chord line at chord fraction s (the same section as wingGeo's)
const wingTopAt = (q, s) => q.y + 0.012 * q.c * Math.sin(Math.PI * s) + 5 * (0.2969 * Math.sqrt(s) - 0.126 * s - 0.3516 * s * s + 0.2843 * s ** 3 - 0.1036 * s ** 4) * q.t * q.c * 1.12;
// the wing's planform (design frame, the right wing; x < 0 mirrors): leading edge swept 27 degrees, the inboard trailing edge straight
const WD = Math.tan(0.087 + 0.05); // (5 degrees of dihedral and 3 more where the wing buckled up at its root)
function wingStation(x) { const a = Math.abs(x), z = -4.3 + (a - 1.6) * 0.51, zt = -4.3 + 15 * 0.51; // (the tip's leading edge, at 16.6 m)
  const te = a <= 6.3 ? 2.3 : 2.3 + ((zt + 1.55) - 2.3) * (a - 6.3) / 10.3; // (the trailing edge: straight inboard, then swept to the tip)
  return { x, y: -1.25 + (a - 1.6) * WD, z, c: te - z, t: 0.15 - 0.04 * (a - 1.6) / 15, v: (a - 1.6) / 4 }; }
// a turbofan in its own frame: the intake lip at z 0, the exhaust at the back (+z); the cowl turned on a lathe, a dark intake, the
// fan and its spinner, the core's nozzle and plug
function engineGeo(T) { const pts = [[0.84, 0.78], [0.86, 0.42], [0.9, 0.12], [0.98, 0], [1.06, 0.06], [1.1, 0.32], [1.1, 1.3], [1.04, 2.3], [0.9, 2.95], [0.76, 3.32], [0.72, 3.26]].map(([r, a]) => new THREE.Vector2(r, a));
  T.nacelle.push(new THREE.LatheGeometry(pts, 32).rotateX(Math.PI / 2));
  T.dark.push(new THREE.CircleGeometry(0.86, 24).translate(0, 0, 0.82)); // (behind the fan: no seeing through the engine)
  T.chrome.push(new THREE.ConeGeometry(0.3, 0.5, 16).rotateX(-Math.PI / 2).translate(0, 0, 0.5)); // the spinner
  for (let k = 0; k < 22; k++) T.dark.push(new THREE.BoxGeometry(0.025, 0.55, 0.2).rotateY(0.65).translate(0, 0.57, 0.68).rotateZ(k / 22 * TAU));
  T.dark.push(new THREE.CylinderGeometry(0.58, 0.64, 0.7, 20, 1, true).rotateX(Math.PI / 2).translate(0, 0, 3.4)); // the core nozzle
  T.chrome.push(new THREE.ConeGeometry(0.44, 1.0, 16).rotateX(Math.PI / 2).translate(0, 0, 4.1)); } // the plug
// the pylon, in the engine's frame: from the cowl's top up and back to the wing's underside
function pylonGeo(T, cut = 1) { const s = new THREE.Shape([[0.5, 1.0], [3.7 * cut, 1.0], [4.6 * cut, 1.0 + 0.75 * cut], [2.2, 1.7], [1.1, 1.4]].map(([z, y]) => new THREE.Vector2(z, y)));
  T.white.push(new THREE.ExtrudeGeometry(s, { depth: 0.34, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(0.17, 0, 0)); }
// a triple seat row in its own frame (feet on the floor at y 0, facing -z, 1.5 m wide)
function seatGeo(T, M) { const add = (k, g) => T[k].push(g.applyMatrix4(M));
  for (let i = 0; i < 3; i++) { const x = (i - 1) * 0.5;
    add('seat', new THREE.BoxGeometry(0.46, 0.13, 0.5).translate(x, 0.44, 0));
    add('seat', new THREE.BoxGeometry(0.46, 0.7, 0.1).translate(0, 0.35, 0).rotateX(0.2).translate(x, 0.48, 0.24));
    add('snow', new THREE.BoxGeometry(0.4, 0.2, 0.11).translate(0, 0.58, -0.006).rotateX(0.2).translate(x, 0.48, 0.24));
    add('dark', new THREE.BoxGeometry(0.36, 0.26, 0.012).translate(0, 0.3, 0.056).rotateX(0.2).translate(x, 0.48, 0.24)); } // (the tray table on its back)
  for (let j = 0; j < 4; j++) add('dark', new THREE.BoxGeometry(0.05, 0.05, 0.42).translate(-0.75 + j * 0.5, 0.64, 0.02));
  for (const x of [-0.55, 0.55]) for (const z of [-0.18, 0.18]) add('chrome', new THREE.BoxGeometry(0.04, 0.4, 0.04).translate(x, 0.2, z));
  add('chrome', new THREE.BoxGeometry(1.4, 0.04, 0.04).translate(0, 0.37, 0)); }
// a geometry painted one colour (the luggage, the oxygen masks: one material, coloured by vertex)
const tint = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };

// the plane's painted textures and materials, made the first time a plane is built (the classic world never has one)
function planeMats(b) { if (MAT.livery) return MAT;
  const rnd = mulberry32(5150), std = (o) => { const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...o }); m.clippingPlanes = [CUT]; return m; };
  const rep = (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  const rr = (x, px, py, w, h, r) => { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); };
  // the fuselage: 4096 along the body (38 m) by 1024 round it; y on the side maps to an angle round from the crown
  const sides = (W, H, RY) => { const X = (z) => (z - FZ0) / 38 * W, PH = (y, s) => { const f = Math.acos(Math.max(-1, Math.min(1, y / RY))); return s > 0 ? f : TAU - f; }, Y = (f) => H * (1 - f / TAU); return { X, PH, Y, row: (y, s) => Y(PH(y, s)) }; };
  const band = (x, S, from, to, top, bot, col) => { for (const s of [1, -1]) { x.fillStyle = col; x.beginPath(); for (let z = from; z <= to + 1e-6; z += 0.25) x.lineTo(S.X(z), S.row(top(z), s)); for (let z = to; z >= from - 1e-6; z -= 0.25) x.lineTo(S.X(z), S.row(bot(z), s)); x.closePath(); x.fill(); } };
  const up = (z) => z > 6.5 ? ((z - 6.5) / 12.5) ** 1.5 * 2.6 : 0; // (the cheatline sweeps up the tail cone toward the fin)
  const WIN = []; for (let z = -12.9; z < 10.4; z += 0.533) WIN.push(z);
  const soot = (x, S, W, H, zb, spread, a0, n) => { for (let i = 0; i < n; i++) { const dz = (rnd() - 0.5) * 2 * spread * rnd(), f = rnd() * TAU, a = a0 * Math.exp(-Math.abs(dz) / (spread * 0.35)) * (0.4 + rnd() * 0.6);
    blob(x, S.X(zb + dz), S.Y(f), 8 + rnd() * 50, 0.4 + rnd() * 0.5, Math.min(0.3, a)); } };
  const blob = (x, cx, cy, r, sq, a) => { x.save(); x.translate(cx, cy); x.scale(1, sq); const g = x.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, `rgba(20,17,13,${a.toFixed(3)})`); g.addColorStop(1, 'rgba(20,17,13,0)'); x.fillStyle = g; x.fillRect(-r, -r, 2 * r, 2 * r); x.restore(); }; // (a soft smudge of soot)
  const livery = canvasTex(4096, 1024, (x, W, H) => { const S = sides(W, H, FRY);
    for (let i = 0; i < 260; i++) { const g = 226 + rnd() * 14 | 0; x.fillStyle = `rgba(${g},${g - 2},${g - 6},0.35)`; x.fillRect(S.X(-19 + rnd() * 38), rnd() * H, 60 + rnd() * 160, 30 + rnd() * 90); } // (panels repainted at different times)
    band(x, S, -19, 19, () => -0.98, () => -FRY - 0.01, '#8c9096'); // the grey belly
    band(x, S, -19, 19, (z) => -0.46 + up(z), (z) => -0.82 + up(z) * 0.92, '#1d4f6e'); // the teal cheatline
    band(x, S, -19, 19, (z) => -0.33 + up(z), (z) => -0.4 + up(z), '#d9a441'); // its gold pinstripe
    band(x, S, -19, -17.6, () => FRY, () => -FRY, 'rgba(120,124,128,0.35)'); // the radome, a shade greyer
    // panel seams and rivet rows
    x.fillStyle = 'rgba(70,70,66,0.28)'; for (let z = -17.6; z < 18; z += 1.6) x.fillRect(S.X(z), 0, 2, H);
    for (const y of [1.72, 1.02, -0.12, -1.18]) for (const s of [1, -1]) { const r = S.row(y, s); x.fillRect(0, r, W, 2); }
    x.fillStyle = 'rgba(60,60,56,0.22)'; for (let z = -17.6; z < 18; z += 1.6) for (let r = 0; r < H; r += 7) x.fillRect(S.X(z) + 5, r, 2, 2);
    for (const y of [1.72, 1.02, -0.12, -1.18]) for (const s of [1, -1]) { const r = S.row(y, s); for (let px = 0; px < W; px += 8) x.fillRect(px, r + 5, 2, 2); }
    // the cabin windows (one row each side), dark glass in a grey frame with the sky caught in the top
    for (const s of [1, -1]) for (const z of WIN) { const w = 0.235 * W / 38, h = 0.36 / FRY / TAU * H, cx = S.X(z), cy = S.row(0.3, s);
      x.fillStyle = '#8f918e'; rr(x, cx - w / 2 - 3, cy - h / 2 - 3, w + 6, h + 6, w * 0.5); x.fill();
      const gr = x.createLinearGradient(0, cy + h / 2 * s, 0, cy - h / 2 * s); gr.addColorStop(0, '#5d6d7a'); gr.addColorStop(0.45, '#26313a'); gr.addColorStop(1, '#151b20'); x.fillStyle = gr; rr(x, cx - w / 2, cy - h / 2, w, h, w * 0.45); x.fill();
      x.fillStyle = 'rgba(70,64,56,0.12)'; for (let k = 0; k < 2; k++) { const L = (0.3 + rnd() * 0.9) / FRY / TAU * H; x.fillRect(cx - w / 3 + rnd() * w * 0.6, s > 0 ? cy - h / 2 - L : cy + h / 2, 2 + rnd() * 3, L); } } // (rain streaks below)
    // doors: the front and rear passenger doors, two overwing exits, each a seam with a small window and handle
    const door = (z0, z1, y0, y1, s, win) => { const a = S.row(y1, s), c = S.row(y0, s), t = Math.min(a, c), h = Math.abs(c - a); x.strokeStyle = 'rgba(80,80,76,0.85)'; x.lineWidth = 3; rr(x, S.X(z0), t, S.X(z1) - S.X(z0), h, 14); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 1; rr(x, S.X(z0) + 3, t + 3, S.X(z1) - S.X(z0) - 6, h - 6, 12); x.stroke();
      if (win) { x.fillStyle = '#1e262d'; rr(x, S.X((z0 + z1) / 2) - 11, S.row(0.42, s) - 13, 22, 26, 10); x.fill(); } x.fillStyle = '#6a6a66'; x.fillRect(S.X(z0 + 0.12), S.row(0.05, s) - 4, 18, 8); };
    for (const s of [1, -1]) { door(-14.75, -13.93, -0.77, 1.12, s, true); door(10.9, 11.72, -0.6, 1.25, s, true); door(-1.68, -1.16, -0.15, 0.78, s, false); door(-0.84, -0.32, -0.15, 0.78, s, false); }
    // the cockpit's windows, painted: two windscreens and two side windows a side, in a dark frame
    for (const s of [1, -1]) for (const q of [[[-16.95, 0.1], [-16.3, 0.1], [-16.3, 0.62], [-16.95, 0.7]], [[-16.22, 0.66], [-15.66, 0.68], [-15.66, 1.04], [-16.22, 1.02]], [[-15.58, 0.7], [-15.08, 0.72], [-15.1, 1.02], [-15.58, 1.04]]]) {
      x.beginPath(); q.forEach(([z, f]) => x.lineTo(S.X(z), S.Y(s > 0 ? f : TAU - f))); x.closePath(); x.fillStyle = '#12181d'; x.fill(); x.strokeStyle = '#3a3d40'; x.lineWidth = 5; x.stroke();
      x.fillStyle = 'rgba(120,150,175,0.25)'; x.beginPath(); q.slice(0, 3).forEach(([z, f], i) => x.lineTo(S.X(z) + (i === 2 ? -10 : 0), S.Y(s > 0 ? f : TAU - f))); x.fill(); }
    // the name, in the airline's teal over the forward cabin (read the right way round on both sides), the registration near the tail
    const word = (txt, z, y, hgt, col, s) => { x.save(); x.translate(S.X(z), S.row(y, s)); if (s > 0) x.rotate(Math.PI); x.scale(1.32 * (W / 4096), 1); x.fillStyle = col; x.font = `bold ${Math.round(hgt / FRY / TAU * H * 1.38)}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, 0, 0); x.restore(); };
    for (const s of [1, -1]) { word('SOLMERE', -6.6, 1.2, 0.72, '#1d4f6e', s); word('IW-SLM', 14.6, 0.55, 0.3, '#3a3d40', s); }
    // grime: dust low on the body, the belly scraped raw, soot round both breaks and where the left wing burned
    for (let i = 0; i < 3200; i++) { const f = rnd() * TAU, low = Math.max(0, 0.35 - Math.cos(f)); x.fillStyle = `rgba(${130 + rnd() * 30 | 0},${108 + rnd() * 24 | 0},${78 + rnd() * 18 | 0},${(0.015 + 0.09 * low * rnd()).toFixed(3)})`; x.fillRect(rnd() * W, S.Y(f) - 6, 10 + rnd() * 60, 4 + rnd() * 16); }
    for (const s of [1, -1]) { const a = S.row(0.5, s), c = S.row(-1.5, s), g = x.createLinearGradient(0, a, 0, c); g.addColorStop(0, 'rgba(150,124,88,0)'); g.addColorStop(1, 'rgba(150,124,88,0.26)'); x.fillStyle = g; x.fillRect(0, Math.min(a, c), W, Math.abs(c - a)); } // (sand blown up the sides)
    for (let i = 0; i < 520; i++) { x.fillStyle = `rgba(150,156,162,${(0.3 + rnd() * 0.45).toFixed(2)})`; x.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 12, 1 + rnd() * 5); } // (paint chipped to the bare metal)
    for (let i = 0; i < 700; i++) { const f = rnd() * TAU, z = -19 + rnd() * 38; x.fillStyle = `rgba(96,84,66,${(0.04 + rnd() * 0.07).toFixed(3)})`; const L = 30 + rnd() * 160, y0 = S.Y(f); x.fillRect(S.X(z), f < Math.PI ? y0 - L : y0, 2 + rnd() * 4, L); } // (dirt run down from the crown)
    for (let i = 0; i < 500; i++) { const f = Math.PI + (rnd() - 0.5) * 1.6, c = rnd() < 0.5 ? 'rgba(220,220,214,0.3)' : 'rgba(40,36,30,0.25)'; x.fillStyle = c; x.fillRect(rnd() * W, S.Y(f), 40 + rnd() * 400, 1 + rnd() * 2); }
    soot(x, S, W, H, -8, 2.2, 0.4, 1100); soot(x, S, W, H, 6.5, 2.4, 0.4, 1200);
    for (let i = 0; i < 700; i++) { const z = -5 + rnd() * 8, f = TAU - (Math.PI * 0.62 + rnd() * rnd() * Math.PI * 0.7); blob(x, S.X(z), S.Y(f), 12 + rnd() * 60, 0.5 + rnd() * 0.4, 0.06 + rnd() * 0.22); } // (where the left wing burned)
    for (let i = 0; i < 160; i++) { const z = -19 + rnd() * 38, f = rnd() * TAU; x.fillStyle = `rgba(90,80,64,${(0.05 + rnd() * 0.08).toFixed(3)})`; x.fillRect(S.X(z), S.Y(f), 2 + rnd() * 3, 20 + rnd() * 80); } }, '#ebe9e3');
  // the cabin's lining: cream sidewalls with a bezel round each window (lit by the day outside), green primer below the floor
  const LW = 2048, LH = 512, lining = (glow) => canvasTex(LW, LH, (x, W, H) => { const S = sides(W, H, FRY - 0.1);
    if (!glow) { band(x, S, -19, 19, () => -0.72, () => -FRY - 0.01, '#3f493b'); x.fillStyle = 'rgba(30,34,28,0.6)'; for (let z = -18.5; z < 19; z += 0.533) x.fillRect(S.X(z), S.row(-0.75, 1), 3, S.row(-0.75, -1) - S.row(-0.75, 1));
      band(x, S, -19, 19, () => FRY, () => 1.45, '#e3dfd6'); x.fillStyle = 'rgba(90,86,78,0.35)'; for (let z = -17.6; z < 18; z += 1.066) x.fillRect(S.X(z), 0, 2, H); }
    for (const s of [1, -1]) for (const z of WIN) { const cx = S.X(z), cy = S.row(0.3, s), w = 0.4 * W / 38, h = 0.6 / FRY / TAU * H;
      if (!glow) { x.fillStyle = '#ece8df'; rr(x, cx - w / 2, cy - h / 2, w, h, w * 0.4); x.fill(); x.strokeStyle = 'rgba(90,86,78,0.4)'; x.lineWidth = 2; x.stroke(); }
      x.fillStyle = glow ? '#fff4e0' : '#b9cfe0'; rr(x, cx - w * 0.27, cy - h * 0.29, w * 0.54, h * 0.58, w * 0.22); x.fill(); }
    if (!glow) { for (let i = 0; i < 1500; i++) { x.fillStyle = `rgba(60,52,40,${(0.02 + rnd() * 0.06).toFixed(3)})`; x.fillRect(rnd() * W, rnd() * H, 4 + rnd() * 30, 2 + rnd() * 12); } soot(x, S, W, H, -8, 2, 0.6, 500); soot(x, S, W, H, 6.5, 2, 0.6, 500); } }, glow ? '#000000' : '#d6d0c2');
  // the wings: light grey paint, a bare metal leading edge, spar and panel seams, the flap hinge line; 4 m of span to a repeat
  const wing = rep(canvasTex(512, 512, (x, W, H) => { x.fillStyle = '#d2d5d8'; x.fillRect(0, 0, W * 0.07, H);
    x.fillStyle = 'rgba(60,62,64,0.35)'; for (const u of [0.07, 0.16, 0.34, 0.52, 0.64]) x.fillRect(u * W, 0, 2, H); x.fillStyle = 'rgba(30,30,32,0.7)'; x.fillRect(0.76 * W, 0, 3, H); x.fillRect(0.76 * W, 0, W * 0.24, 4);
    for (let r = 0; r < H; r += 128) { x.fillStyle = 'rgba(60,62,64,0.3)'; x.fillRect(0, r, W, 2); } x.fillStyle = 'rgba(50,50,52,0.25)'; for (const u of [0.16, 0.34, 0.52, 0.64]) for (let r = 0; r < H; r += 6) x.fillRect(u * W + 4, r, 2, 2);
    for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(${70 + rnd() * 40 | 0},${64 + rnd() * 30 | 0},${54 + rnd() * 20 | 0},${(0.03 + rnd() * 0.08).toFixed(3)})`; x.fillRect(rnd() * W, rnd() * H, 30 + rnd() * 200, 1 + rnd() * 4); } }, '#aeb3b7'));
  // the fin: the airline's teal with its gold sun rising over a white horizon
  const fin = canvasTex(512, 512, (x, W, H) => { const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#24607f'); g.addColorStop(1, '#173f58'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    const cx = W * 0.6, cy = H * 0.42, r = W * 0.13; x.fillStyle = '#e0a83a'; for (let k = 0; k < 14; k++) { x.save(); x.translate(cx, cy); x.rotate(k / 14 * TAU); x.beginPath(); x.moveTo(-r * 0.16, -r * 1.2); x.lineTo(0, -r * 1.75); x.lineTo(r * 0.16, -r * 1.2); x.fill(); x.restore(); }
    x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); x.fillStyle = '#ffffff'; x.fillRect(0, cy + r * 0.55, W, H * 0.035); x.fillStyle = '#173f58'; x.fillRect(0, cy + r * 0.55 + H * 0.035, W, H);
    x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(0, cy + r * 0.55 + H * 0.06, W, H * 0.015);
    x.fillStyle = 'rgba(20,24,28,0.4)'; x.save(); x.beginPath(); x.moveTo(W * 0.74, H); x.lineTo(W * 0.98, 0); x.lineWidth = 3; x.strokeStyle = 'rgba(10,14,18,0.6)'; x.stroke(); x.restore(); // (the rudder's hinge line)
    for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(${40 + rnd() * 50 | 0},${36 + rnd() * 30 | 0},${30 + rnd() * 20 | 0},${(0.03 + rnd() * 0.08).toFixed(3)})`; x.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 6, 20 + rnd() * 120); } }, '#1d4f6e');
  // the engine's cowl along its profile: a dark intake, the polished lip, a white cowl with a teal band, the grey nozzle
  const nacelle = canvasTex(256, 256, (x, W, H) => { const at = (v0, v1, c) => { x.fillStyle = c; x.fillRect(0, H * (1 - v1), W, H * (v1 - v0)); };
    at(0, 0.21, '#2a2c2f'); at(0.21, 0.42, '#c7cbcf'); at(0.42, 0.82, '#e5e3dd'); at(0.6, 0.66, '#1d4f6e'); at(0.66, 0.675, '#d9a441'); at(0.82, 1, '#808386');
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(40,34,28,${(0.03 + rnd() * 0.1).toFixed(3)})`; x.fillRect(rnd() * W, H * (0.1 + rnd() * 0.75), 1 + rnd() * 3, 6 + rnd() * 40); } }, '#e5e3dd');
  const seat = rep(canvasTex(128, 128, (x, W, H) => { for (let i = 0; i < 900; i++) { const v = rnd(); x.fillStyle = `rgba(${v > 0.5 ? '70,90,130' : '20,26,40'},${(0.1 + rnd() * 0.2).toFixed(2)})`; x.fillRect(rnd() * W, rnd() * H, 2, 1); }
    x.fillStyle = 'rgba(15,18,28,0.5)'; x.fillRect(0, 0, W, 2); x.fillRect(0, 0, 2, H); }, '#2c3a5c'));
  const carpet = rep(canvasTex(256, 256, (x, W, H) => { x.fillStyle = 'rgba(120,128,150,0.35)'; for (let a = 0; a < W; a += 32) for (let c = 0; c < H; c += 32) { x.beginPath(); x.moveTo(a + 16, c + 8); x.lineTo(a + 24, c + 16); x.lineTo(a + 16, c + 24); x.lineTo(a + 8, c + 16); x.fill(); }
    for (let i = 0; i < 2000; i++) { x.fillStyle = `rgba(20,20,24,${(0.05 + rnd() * 0.1).toFixed(2)})`; x.fillRect(rnd() * W, rnd() * H, 2, 2); } for (let i = 0; i < 14; i++) { x.fillStyle = `rgba(70,58,40,${(0.1 + rnd() * 0.2).toFixed(2)})`; x.beginPath(); x.ellipse(rnd() * W, rnd() * H, 8 + rnd() * 30, 6 + rnd() * 20, rnd() * 3, 0, TAU); x.fill(); } }, '#474d5c'));
  const sootTex = canvasTex(256, 256, (x, W, H) => { for (let i = 0; i < 260; i++) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * W * 0.42, k = 1 - r / (W * 0.45); x.fillStyle = `rgba(0,0,0,${(0.05 + 0.25 * k * rnd()).toFixed(3)})`; x.beginPath(); x.ellipse(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r, 10 + rnd() * 40, 8 + rnd() * 30, rnd() * 3, 0, TAU); x.fill(); }
    const g = x.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.45); g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.6, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); }, '#191512');
  const desert = biomeAt(b.x, b.z) === 'desert', earth = pbr(desert ? 'terrain/sand' : 'terrain/gravel', { rough: 1 }); earth.color.setRGB(...(desert ? [1.55, 0.92, 0.46] : [1.16, 0.92, 0.64])); rep(earth.map); rep(earth.normalMap); earth.clippingPlanes = [CUT]; // (the ground's own layer, the turned earth a shade darker)
  const gouge = rep(canvasTex(256, 512, (x, W, H) => { for (let i = 0; i < 900; i++) { const u = rnd(), k = Math.sin(Math.PI * u) ** 1.5; x.fillStyle = `rgba(${40 + rnd() * 30 | 0},${30 + rnd() * 20 | 0},${20 + rnd() * 12 | 0},${(0.06 + 0.3 * k * rnd()).toFixed(3)})`; x.fillRect(u * W, rnd() * H, 1 + rnd() * 5, 30 + rnd() * 200); }
    const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.25, 'rgba(50,38,26,0.35)'); g.addColorStop(0.5, 'rgba(40,30,20,0.5)'); g.addColorStop(0.75, 'rgba(50,38,26,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); }, '#3a2c1e'));
  Object.assign(MAT, { livery: std({ map: livery, roughness: 0.5, metalness: 0.18 }), lining: std({ map: lining(false), emissiveMap: lining(true), emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.85 }),
    wing: std({ map: wing, roughness: 0.45, metalness: 0.4 }), fin: std({ map: fin, roughness: 0.5, metalness: 0.15 }), nacelle: std({ map: nacelle, roughness: 0.4, metalness: 0.35 }),
    seat: std({ map: seat, roughness: 0.95 }), carpet: std({ map: carpet, roughness: 1 }), earth, dark: std({ color: 0x1e2023, roughness: 0.55, metalness: 0.5 }), chrome: std({ color: 0xb4b8bc, roughness: 0.32, metalness: 0.85 }),
    white: std({ color: 0xe2e0da, roughness: 0.5, metalness: 0.15 }), rubber: std({ color: 0x18181a, roughness: 0.92 }), plastic: std({ color: 0xd8d2c4, roughness: 0.6, emissive: 0x7a766c }), bags: std({ vertexColors: true, roughness: 0.8 }),
    alu: std({ color: 0x8c9196, roughness: 0.5, metalness: 0.6 }), gouge: Object.assign(new THREE.MeshStandardMaterial({ map: gouge, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), { clippingPlanes: [CUT] }),
    soot: Object.assign(new THREE.MeshStandardMaterial({ map: sootTex, opacity: 0.75, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { clippingPlanes: [CUT] }) });
  return MAT; }

function buildPlane(b, P, g) { planeMats(b); const rnd = mulberry32(Math.round(b.seed * 1000) + 23), rr = (a, c) => a + rnd() * (c - a), V = (x, y, z) => new THREE.Vector3(x, y, z);
  const pose = (pivot, pos, yaw, pitch, roll) => new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'))).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
  const part = () => Object.fromEntries(Object.keys(P).map(k => [k, []])), put = (T, M) => { for (const k in T) for (const q of T[k]) P[k].push(M ? q.applyMatrix4(M) : q); };
  const at = (M, x, y, z) => V(x, y, z).applyMatrix4(M), ga = (x, z) => gAt(b, x, z), post = (lx, lz, r, top, stand) => { const [x, z] = toW(b, lx, lz); Object.assign(addCollider(x, z, r, b), { vr: 0, top, stand }); };
  const earthMound = (x, z, sx, sy, sz, ry = 0, sink = 0.15) => { const NR = 7, NA = 20, pos = [], idx = [], s0 = rnd() * 50, c = Math.cos(ry), sn = Math.sin(ry); // a heap of turned earth, sloping out to the ground
    for (let i = 0; i <= NR; i++) for (let k = 0; k < NA; k++) { const r = i / NR, a = k / NA * TAU, rn = 1 + 0.18 * Math.sin(a * 3 + s0) + 0.1 * Math.sin(a * 7 - s0), lx = Math.cos(a) * r * rn * sx, lz = Math.sin(a) * r * rn * sz, wx = x + lx * c + lz * sn, wz = z - lx * sn + lz * c;
      const h = sy * (1 - r * r) ** 1.6 * (1 + 0.25 * Math.sin(lx * 2.3 + s0) * Math.sin(lz * 2.9 - s0)); pos.push(wx, ga(wx, wz) + h - sink * (1 - r) + 0.03, wz); }
    for (let i = 0; i < NR; i++) for (let k = 0; k < NA; k++) { const a = i * NA + k, b2 = i * NA + (k + 1) % NA, d = a + NA, e = b2 + NA; idx.push(a, b2, d, b2, e, d); }
    const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); m.setIndex(idx); m.computeVertexNormals(); P.earth.push(m); };
  const sootAt = (x, z, w, d, ry = 0) => { const q = new THREE.PlaneGeometry(w, d, 8, 8).rotateX(-Math.PI / 2).rotateY(ry), p = q.attributes.position; for (let i = 0; i < p.count; i++) { const wx = x + p.getX(i), wz = z + p.getZ(i); p.setXYZ(i, wx, ga(wx, wz) + 0.09, wz); }
    q.computeVertexNormals(); const m = new THREE.Mesh(q, MAT.soot); m.receiveShadow = true; m.renderOrder = 1; b.group.add(m); };
  const wiggle = (sd) => (f) => 0.22 * Math.sin(3 * f + sd) + 0.14 * Math.sin(7 * f + sd * 2.3) + 0.08 * Math.sin(13 * f + sd * 4.1) + 0.05 * Math.sin(31 * f + sd * 0.7);
  const notch = (nf, nw, nd) => (f) => { const a = Math.atan2(Math.sin(f - nf), Math.cos(f - nf)), q = Math.max(0, 1 - (a / nw) ** 2); return nd * q * q; };
  const dent = (ends) => (f, z) => { let k = 0; for (const e of ends) k = Math.max(k, Math.exp(-Math.abs(z - e) / 1.1)); return k * 0.1 * Math.sin(f * 5 + z * 2.3) * Math.sin(f * 3 - z * 1.7 + 1); };

  // ── a section of fuselage, in the design frame: skin, lining, torn ends (an edge, ribs and stringers where the skin is gone, a few
  // petals of skin peeled back), the floor, bulkheads ──
  function section(T, z0, z1, ends) { const dn = dent(ends.map(e => e.z));
    const j0 = ends.find(e => e.side < 0), j1 = ends.find(e => e.side > 0);
    T.livery.push(skinGeo(z0, z1, { j0: j0?.j, j1: j1?.j, dent: dn, dz: 0.45 }));
    const l0 = j0 ? z0 : Math.max(z0, -14.75), l1 = j1 ? z1 : Math.min(z1, 11.85); // (the lining stops at the cockpit's and the aft galley's bulkheads)
    T.lining.push(skinGeo(l0, l1, { d: 0.1, j0: j0 && ((f) => j0.j(f) + 0.06), j1: j1 && ((f) => j1.j(f) - 0.06), dent: dn, dz: 0.5, na: 36 }));
    for (const e of ends) { const zE = (f) => e.z + e.j(f), na = 40, pos = [], idx = [];
      for (let k = 0; k <= na; k++) { const f = k / na * TAU, z = zE(f), [ax, ay] = fpt(z, f, -dn(f, z)), [bx, by] = fpt(z - e.side * 0.06, f, 0.1 - dn(f, z)); pos.push(ax, ay, z, bx, by, z - e.side * 0.06); }
      for (let k = 0; k < na; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); eg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); eg.setIndex(idx); eg.computeVertexNormals(); T.alu.push(eg);
      // the frames (ribs) the skin tore back from, and the stringers along them, bent where they broke
      const D = e.deep || 1.2; for (let m = 0; 0.25 + m * 0.53 < D + 0.3; m++) { const zf = e.z - e.side * (0.25 + m * 0.53), p = fprof(zf), hh = (p.top - p.bot) / 2;
        T.alu.push(new THREE.TorusGeometry(1, 0.03, 4, 40).scale(p.hw - 0.05, hh - 0.05, 2).translate(0, (p.top + p.bot) / 2, zf)); }
      for (let f = e.nf - e.nw * 0.85; f <= e.nf + e.nw * 0.85; f += 0.13) { const zA = e.z - e.side * (D + 0.4), zB = e.z + e.side * rr(-0.2, 0.45), [ax, ay] = fpt(zA, f, 0.05), [bx, by] = fpt(zB, f, 0.05 + rr(-0.25, 0.15));
        bar(T, 'alu', ax, ay, zA, bx, by, zB, 0.045); }
      for (let i = 0; i < 4; i++) { let f = rnd() * TAU; if (Math.abs(Math.atan2(Math.sin(f - e.nf), Math.cos(f - e.nf))) < e.nw * 1.2) f += Math.PI; const w = rr(0.18, 0.38), L = rr(0.4, 1.0), out = rr(0.25, 0.7);
        const zs = (ff) => zE(ff) - e.side * 0.05, pg = skinGeo(0, 1, { f0: f - w / 2, f1: f + w / 2, na: 4, dz: 0.25 }), p = pg.attributes.position; // (a petal: out past the tear, curling outward, narrowing)
        for (let k = 0; k < p.count; k++) { const s = Math.floor(k / 5) / 4, fk = f - w / 2 + w * (k % 5) / 4, fn = f + (fk - f) * (1 - 0.6 * s), z = zs(fn) + e.side * s * L, [px, py] = fpt(z, fn, -out * s * s);
          p.setXYZ(k, px, py, z); pg.attributes.uv.setXY(k, (z - FZ0) / 38, ((fn % TAU) + TAU) % TAU / TAU); }
        pg.computeVertexNormals(); T.livery.push(pg); }
      // the floor's beams stick out of the break, cables hang from the ceiling
      for (let x = -1.4; x <= 1.45; x += 0.7) if (rnd() < 0.75) bar(T, 'alu', x, FLOOR - 0.12, e.z - e.side * 0.6, x + rr(-0.12, 0.12), FLOOR - 0.12 + rr(-0.25, 0.04), e.z + e.side * rr(-0.1, 0.3), 0.06);
      for (let i = 0; i < 5; i++) { const x = rr(-0.9, 0.9), zc = e.z - e.side * rr(0, 0.4), yb = rr(-0.1, 0.7); bar(T, 'dark', x, 1.5, zc, x + rr(-0.15, 0.15), yb, zc + e.side * rr(0, 0.3), 0.025); } }
    return T; }
  // the cabin's floor, seats, bins and ceiling panels between za and zb (design frame); o.left / o.right: rows still standing on that side
  function cabin(T, za, zb, o) { const half = (z, y, d) => { const p = fprof(z), hh = (p.top - p.bot) / 2 - d, r = (y - (p.top + p.bot) / 2) / hh; return Math.abs(r) >= 1 ? 0 : (p.hw - d) * Math.sqrt(1 - r * r); };
    for (let z = za; z < zb - 1e-6; z += 0.5) { const z2 = Math.min(zb, z + 0.5), w = Math.min(1.68, half(z2, FLOOR, 0.1), half(z, FLOOR, 0.1)) * 2, zc = (z + z2) / 2; // (the floor narrows with the body)
      T.carpet.push(new THREE.BoxGeometry(w, 0.08, z2 - z).translate(0, FLOOR - 0.04, zc)); for (const x of [-1.32, -0.82, 0.82, 1.32]) if (Math.abs(x) < w / 2 - 0.05) T.chrome.push(new THREE.BoxGeometry(0.04, 0.02, z2 - z).translate(x, FLOOR + 0.01, zc));
      if (half(zc, 1.47, 0.1) > 0.8) T.plastic.push(new THREE.BoxGeometry(1.5, 0.04, z2 - z).translate(0, 1.47, zc)); }
    for (let z = za + 0.45; z < zb - 0.3; z += 0.79) for (const sx of [-1, 1]) { if (!(sx < 0 ? o.left : o.right)(z) || (z > -1.8 && z < -0.2 && o.exits) || half(z, 0.5, 0.1) < 1.72) continue; seatGeo(T, new THREE.Matrix4().makeTranslation(sx * 1.0, FLOOR, z)); }
    for (let z = za + 0.6; z < zb - 0.6; z += 1.25) for (const sx of [-1, 1]) { const keep = (sx < 0 ? o.binL : o.binR)(z); if (!keep || half(z, 1.2, 0.1) < 1.47) continue;
      T.plastic.push(new THREE.BoxGeometry(0.5, 0.38, 1.2).rotateZ(sx * 0.25).translate(sx * 1.2, 1.17, z));
      if (keep === 2) T.plastic.push(new THREE.BoxGeometry(0.02, 0.4, 1.16).translate(0, -0.2, 0).rotateZ(-sx * 1.2).translate(sx * 0.96, 1.0, z)); } } // (a bin hanging open)

  // ── where the pieces lie: the ground under the middle decides its tilt; the nose digs in, the tail rests slewed and rolled ──
  const gF = (ga(-1.6, -6) + ga(1.6, -6)) / 2, gB = (ga(-1.6, 6) + ga(1.6, 6)) / 2, gL = (ga(-1.6, -6) + ga(-1.6, 6)) / 2, gR = (ga(1.6, -6) + ga(1.6, 6)) / 2, gC = (gF + gB) / 2, cl = (v, m) => Math.max(-m, Math.min(m, v));
  const MM = pose(V(0, 0, -0.75), V(0, gC + FRY - 0.95, 0), 0, -cl(Math.atan((gB - gF) / 12), 0.08), cl(Math.atan((gR - gL) / 3.2), 0.06));
  const nPos = V(0.9, ga(0.9, -10.3) - 0.7, -10.3), nTip = ga(0.9 - 11 * Math.sin(0.17), -10.3 - 11 * Math.cos(0.17)), nPitch = -Math.asin(cl((nPos.y + 1.47 - (nTip - 0.75)) / 11, 0.3));
  const MN = pose(V(0, -FRY, -8), nPos, 0.17, Math.min(-0.05, nPitch), -0.09);
  const MT = pose(V(0, -FRY, 6.5), V(-1.3, ga(-1.3, 10.7) - 0.65, 10.7), -0.24, -0.03, 0.22);
  const breakA = wiggle(1.3), breakB = wiggle(4.1);
  // the nose: the cockpit (its door shut in the bulkhead), six rows behind it, torn off behind the front door
  { const T = part(), nn = notch(4.3, 0.55, 1.0); section(T, -18.98, -8, [{ z: -8, side: 1, j: (f) => breakA(f) - nn(f), nf: 4.3, nw: 0.55, deep: 1.0 }]);
    cabin(T, -13.7, -8.3, { left: () => true, right: () => true, binL: () => 1, binR: (z) => z < -10 ? 1 : 2 });
    const p = fprof(-14.8), hh = (p.top - p.bot) / 2; T.plastic.push(new THREE.CircleGeometry(1, 28).scale(p.hw - 0.1, hh - 0.1, 1).translate(0, (p.top + p.bot) / 2, -14.78)); T.dark.push(new THREE.BoxGeometry(0.8, 1.9, 0.05).translate(0, FLOOR + 0.95, -14.74));
    T.plastic.push(new THREE.BoxGeometry(1.0, 1.9, 0.8).translate(1.2, FLOOR + 0.95, -14.3), new THREE.BoxGeometry(0.9, 1.9, 0.8).translate(-1.25, FLOOR + 0.95, -14.3)); // (the galley and a lavatory)
    put(T, MN); }
  // the middle: the wing box, the right wing still on it, the left torn off at the root; seats on the left, the right side torn out
  { const T = part(), na = notch(5.4, 0.6, 1.5), nb = notch(0.95, 0.6, 1.6);
    section(T, -8, 6.5, [{ z: -8, side: -1, j: (f) => breakA(f) + na(f), nf: 5.4, nw: 0.6, deep: 1.5 }, { z: 6.5, side: 1, j: (f) => breakB(f) - nb(f), nf: 0.95, nw: 0.6, deep: 1.6 }]);
    cabin(T, -7.75, 6.1, { left: (z) => z < 5.4, right: () => false, exits: true, binL: (z) => (Math.round(z * 7) % 3 === 0 ? 2 : 1), binR: (z) => z < -5.5 ? 2 : 0 });
    for (const [x, z, ry, rx, rz] of [[1.35, -4.4, 1.57, -1.5, 0], [1.4, -0.6, 1.5, 0, 0.25], [1.38, 2.2, 1.62, -1.45, 0.1]]) seatGeo(T, new THREE.Matrix4().makeTranslation(x, FLOOR + 0.35, z).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))).multiply(new THREE.Matrix4().makeTranslation(0, -0.35, 0)));
    for (const [x, z, rz] of [[1.35, -2.4, 0.4], [1.4, 3.3, -0.3], [1.3, -6.2, 0.15]]) T.plastic.push(new THREE.BoxGeometry(0.56, 0.4, 1.2).rotateY(rr(-0.3, 0.3)).rotateZ(rz).translate(x, FLOOR + 0.22, z)); // (bins fallen from the right side)
    for (let z = -6.6; z < 5; z += rr(1.4, 3.2)) for (let k = 0; k < 3; k++) { if (rnd() < 0.3) continue; const x = -1.05 + k * 0.5 + rr(-0.05, 0.05), L = rr(0.15, 0.45); T.bags.push(tint(new THREE.CylinderGeometry(0.006, 0.006, L, 3).translate(x, 0.75 - L / 2, z - 0.3), 0x8a8a84), tint(new THREE.BoxGeometry(0.1, 0.07, 0.08).translate(x, 0.75 - L - 0.03, z - 0.3), 0xf0c020)); } // (oxygen masks)
    for (let z = -6.8; z < 5.6; z += 0.9) if (rnd() < 0.7) T.glow.push(new THREE.BoxGeometry(0.03, 0.012, 0.35).translate(0.12, FLOOR + 0.006, z)); // (the emergency path lights, some still lit)
    // the wings' roots: the right wing whole to its tip (with its sharklet and flap fairings, the pylon torn where its engine fell),
    // the left a jagged stub with the spars sticking out
    const st = [1.6, 3.5, 6.3, 9.5, 13, 16.6].map(wingStation); T.wing.push(wingGeo(st, { caps: [st.length - 1] }));
    const tip = st.at(-1); T.wing.push(wingGeo([0, 1.2, 2.3].map((h, i) => ({ x: h, y: 0, z: i * 0.75, c: [1.5, 1.0, 0.55][i], t: 0.09, v: h / 4 })), { sym: true, caps: [2] }).rotateZ(Math.PI / 2 - 0.2).translate(tip.x - 0.05, tip.y + 0.05, tip.z));
    for (const x of [4.2, 8.6, 12.4]) { const q = wingStation(x); T.white.push(new THREE.CylinderGeometry(0.03, 0.24, 2.2, 8).rotateX(Math.PI / 2).translate(x, q.y - 0.24, q.z + q.c - 0.35)); }
    { const q = wingStation(5.75); T.white.push(new THREE.BoxGeometry(0.34, 0.55, 2.4).translate(5.75, q.y - 0.5, q.z + 0.6)); for (let i = 0; i < 5; i++) bar(T, 'iron', 5.75 + rr(-0.15, 0.15), q.y - 0.75, q.z + rr(-0.4, 1.6), 5.75 + rr(-0.3, 0.3), q.y - rr(0.95, 1.3), q.z + rr(-0.6, 1.8), 0.05); }
    const sl = [-1.6, -2.6, -3.7].map(wingStation); T.wing.push(wingGeo(sl, {}));
    T.dark.push(wingGeo([{ ...sl.at(-1), x: -3.62, t: 0.13 }, { ...sl.at(-1), x: -3.6, t: 0.13 }], { caps: [0] }));
    { const q = sl.at(-1); for (const s of [0.15, 0.62]) for (let k = 0; k < 3; k++) bar(T, 'iron', -3.4, q.y + rr(-0.25, 0.25), q.z + s * q.c, -3.6 - rr(0.3, 1.0), q.y + rr(-0.3, 0.3), q.z + s * q.c + rr(-0.2, 0.2), 0.08); }
    put(T, MM); }
  // the tail: slewed off the furrow and rolled onto its side, the fin leaning; the aft galley closes it, a few rows before that
  { const T = part(), nc = notch(1.5, 0.5, 1.0); section(T, 6.5, 18.98, [{ z: 6.5, side: -1, j: (f) => breakB(f) + nc(f), nf: 1.5, nw: 0.5, deep: 1.0 }]);
    cabin(T, 6.9, 11.8, { left: (z) => z < 10.2, right: (z) => z < 10.2, binL: () => 1, binR: () => 1 });
    const p = fprof(11.85), hh = (p.top - p.bot) / 2; T.plastic.push(new THREE.CircleGeometry(1, 28).scale(p.hw - 0.1, hh - 0.1, 1).translate(0, (p.top + p.bot) / 2, 11.85));
    for (let k = 0; k < 3; k++) T.chrome.push(new THREE.BoxGeometry(0.32, 1.0, 0.8).translate(-0.6 + k * 0.4, FLOOR + 0.5, 11.4)); // (the galley's carts)
    T.dark.push(new THREE.CircleGeometry(0.22, 12).translate(0, 0, 18.99).translate(0, (fprof(18.99).top + fprof(18.99).bot) / 2, 0)); // (the APU's exhaust)
    // the fin, swept and tall (6 m over the body), and the stabilisers
    for (const fg of [wingGeo([0, 3.4, 6.8].map((h) => ({ x: h, y: 0, z: 11.4 + h * 0.74, c: 5.8 - h * 0.56, t: 0.1, v: 0 })), { sym: true, caps: [2] }), wingGeo([{ x: 0, y: 0, z: 9.3, c: 2.6, t: 0.08 }, { x: 1.05, y: 0, z: 12.1, c: 0.1, t: 0.08 }], { sym: true })]) { // the fin and its dorsal fillet
      fg.rotateZ(Math.PI / 2).translate(0, 1.2, 0); const p2 = fg.attributes.position, u = fg.attributes.uv; for (let i = 0; i < p2.count; i++) u.setXY(i, (p2.getZ(i) - 11.4) / 6.8, (p2.getY(i) - 1.2) / 6.8); T.fin.push(fg); }
    const sc = fprof(15.2), sy = (sc.top + sc.bot) / 2;
    for (const sx of [-1, 1]) { const hs = [0.25, 3.2, 6.25].map((x) => ({ x: sx * x, y: sy + x * 0.1, z: 14.3 + x * 0.55, c: 3.4 - x * 0.34, t: 0.1, v: x / 4 })), gq = wingGeo(hs, { caps: [2] }); T.wing.push(gq); }
    put(T, MT); }

  // ── the left wing, torn off, lying propped on its own engine with its tip in the sand and its torn root up in the air ──
  { const T = part(), st = [-3.75, -6.3, -9.5, -13, -16.6].map(wingStation); T.wing.push(wingGeo(st, { caps: [st.length - 1] }));
    T.dark.push(wingGeo([{ ...st[0], x: -3.8 }, { ...st[0], x: -3.78 }], { caps: [0] }));
    const tip = st.at(-1); T.wing.push(wingGeo([0, 1.2, 2.3].map((h, i) => ({ x: h, y: 0, z: i * 0.75, c: [1.5, 1.0, 0.55][i], t: 0.09, v: 0 })), { sym: true, caps: [2] }).rotateZ(Math.PI / 2 + 0.2).translate(tip.x + 0.05, tip.y + 0.05, tip.z));
    for (const x of [-8.6, -12.4]) { const q = wingStation(x); T.white.push(new THREE.CylinderGeometry(0.03, 0.24, 2.2, 8).rotateX(Math.PI / 2).translate(x, q.y - 0.24, q.z + q.c - 0.35)); }
    { const q = st[0]; for (const s of [0.15, 0.62]) for (let k = 0; k < 3; k++) bar(T, 'iron', -3.95, q.y + rr(-0.3, 0.3), q.z + s * q.c, -3.5 + rr(0.0, 0.9), q.y + rr(-0.4, 0.4), q.z + s * q.c + rr(-0.3, 0.3), 0.08);
      for (let i = 0; i < 6; i++) bar(T, 'dark', -3.8, q.y + rr(-0.2, 0.2), q.z + rr(0.5, 4), -3.6 + rr(-0.2, 0.3), q.y - rr(0.4, 1.4), q.z + rr(0.5, 4), 0.03); }
    const qe = wingStation(-5.75), E = { x: -5.75, y: qe.y - 1.62, z: qe.z - 2.3 }, ET = part(); engineGeo(ET); pylonGeo(ET);
    const ME = new THREE.Matrix4().makeTranslation(E.x, E.y, E.z); for (const k in ET) for (const q of ET[k]) T[k].push(q.applyMatrix4(ME));
    // propped: turned about the engine's bottom so the tip comes down to the sand, then slewed round and laid out to the left
    const c = V(E.x, E.y - 1.1, E.z + 1.6), tipLow = V(tip.x, tip.y - 0.1, tip.z + tip.c * 0.4), dx = tipLow.x - c.x, dy = tipLow.y - c.y, Rr = Math.hypot(dx, dy), yaw = 0.93, lx = -9.6, lz = -3.4;
    const gE = ga(lx, lz) - 0.35, roll0 = Math.PI - Math.atan2(dy, dx), guess = at(pose(c, V(lx, gE, lz), yaw, 0, roll0), tipLow.x, tipLow.y, tipLow.z), gT2 = ga(guess.x, guess.z) - 0.2;
    const roll = (Math.PI - Math.asin(cl((gT2 - gE) / Rr, 0.9))) - Math.atan2(dy, dx);
    const MW = pose(c, V(lx, gE, lz), yaw, 0, roll); put(T, MW);
    const Pw = (x, y, z) => at(MW, x, y, z); b.lwing = { tip: Pw(tip.x, tip.y, tip.z + tip.c / 2), root: Pw(st[0].x, st[0].y, st[0].z + st[0].c / 2), eng: Pw(E.x, E.y, E.z + 1.6) };
    // colliders: the engine, and the wing's planform wherever its underside is lower than a head
    { const e0 = Pw(E.x, E.y, E.z), e1 = Pw(E.x, E.y, E.z + 3.6); collideRun(b, e0.x, e0.z, e1.x, e1.z, 1.05, () => Math.max(e0.y, e1.y) + 1.1); earthMound(e0.x, e0.z, 2.2, 0.7, 1.6, -yaw, 0.2); }
    for (let x = -4; x > -16.6; x -= 0.9) { const q = wingStation(x), n = Math.ceil(q.c / 1.5); for (let i = 0; i < n; i++) { const s = (i + 0.5) / n, p = Pw(x, q.y, q.z + s * q.c), under = p.y - 0.35 * q.t * q.c - ga(p.x, p.z);
      if (under < 1.9) post(p.x, p.z, Math.max(0.45, q.c / n / 2 + 0.05), p.y + 0.4 * q.t * q.c, p.y + 0.1); } }
    earthMound(b.lwing.tip.x, b.lwing.tip.z, 1.6, 0.45, 1.2, 0.3, 0.1); }
  // ── the right engine, fallen off, lying on its side ahead of the right wing with a scrap of its pylon ──
  { const T = part(); engineGeo(T); pylonGeo(T, 0.55); for (let i = 0; i < 5; i++) bar(T, 'iron', rr(-0.15, 0.15), 1.6, rr(1.2, 2.6), rr(-0.3, 0.3), rr(1.9, 2.4), rr(1.0, 2.8), 0.05);
    const ex = 8.6, ez = -9.4, M = pose(V(0, 0, 1.7), V(ex, ga(ex, ez) + 0.75, ez), 0.55, 0.06, 1.25); put(T, M);
    const a0 = at(M, 0, 0, 0), a1 = at(M, 0, 0, 3.6); collideRun(b, a0.x, a0.z, a1.x, a1.z, 1.05, () => a0.y + 1.1); earthMound(a0.x - 0.4, a0.z - 0.9, 1.8, 0.6, 1.4, 0.4, 0.2); }

  // ── the ground: the furrow it ploughed (dark earth between two berms), mounds where the nose dug in and along the middle, soot ──
  { const n = 40, cxAt = (z) => -1.2 + 1.4 * Math.sin((z - 8) / 30), strip = (X, Hh, lift, z0) => { const pts = [], uv = [], idx = [], m = X.length;
      for (let i = 0; i <= n; i++) { const z = z0 + i * (76 - z0) / n, f = 1 - i / n, rise = Math.min(1, Math.max(0, (z - z0) / 6)), cx = cxAt(z); for (let k = 0; k < m; k++) { const x = cx + X[k] * (0.2 + 0.8 * f); pts.push(x, ga(x, z) + Hh[k] * (0.3 + 0.7 * f) * rise + lift, z); uv.push(k / (m - 1), z / 9); } }
      for (let i = 0; i < n; i++) for (let k = 0; k < m - 1; k++) { const a = i * m + k, c2 = a + m; idx.push(a, c2, a + 1, a + 1, c2, c2 + 1); }
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); fg.setIndex(idx); fg.computeVertexNormals(); return fg; };
    for (const s of [-1, 1]) P.earth.push(strip([4.9, 4.1, 3.4, 2.7, 2.2].map(v => v * s), [0, 0.22, 0.4, 0.22, 0], 0.02, 9)); // (the berms it threw up)
    const gm = new THREE.Mesh(strip([-3.2, -1.6, 0, 1.6, 3.2], [0.1, 0.03, 0.02, 0.03, 0.1], 0.08, -6), MAT.gouge); gm.receiveShadow = true; gm.renderOrder = 1; b.group.add(gm); }
  for (const s of [-1, 1]) earthMound(s * 3.0, 0.5, 1.6, 0.6, 8, 0, 0.1); // (berms along the middle where it settled)
  const nose = at(MN, 0, -0.55, -18.9); earthMound(nose.x - Math.sin(0.17) * 0.8, nose.z - Math.cos(0.17) * 0.8, 3.4, 1.5, 2.6, 0.17, 0.2); earthMound(nose.x + 2.4, nose.z + 1.5, 1.6, 0.7, 2.2, 0.5, 0.1); earthMound(nose.x - 2.3, nose.z + 1.2, 1.5, 0.6, 2.0, -0.3, 0.1);
  const tf = at(MT, 0, -FRY, 6.6); earthMound(tf.x, tf.z - 1.2, 2.6, 0.55, 1.2, -0.24, 0.1);
  for (const [x, z, w, d] of [[-3.6, 0, 7, 11], [0.6, -9, 6, 5], [-0.6, 9, 6, 6], [b.lwing.eng.x, b.lwing.eng.z, 9, 9], [-1.5, 20, 6, 9], [-0.5, 33, 5, 8], [7, -8.5, 6, 5]]) sootAt(x, z, w, d, rnd() * 3);

  // ── the debris field, thinning out back along the furrow: seats, luggage burst open, torn panels of skin, a main wheel set ──
  const strewn = (x, z) => [x, z, ga(x, z)];
  for (const [x, z] of [[4.2, 13.5], [-5.4, 16], [2.2, 24], [-3.8, 29], [5.6, -4]]) { const [, , y] = strewn(x, z), M = new THREE.Matrix4().makeTranslation(x, y + 0.25, z).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rr(-1.5, 1.5), rr(0, TAU), rr(-1.6, 1.6)))); const T = part(); seatGeo(T, M.multiply(new THREE.Matrix4().makeTranslation(0, -0.35, 0))); put(T); }
  const bagCols = [0x23293a, 0x5a2420, 0x1a1a1c, 0x3e4430, 0x55585c, 0x7a6040, 0x24474f];
  for (let i = 0; i < 16; i++) { const a = rr(0, TAU), r = rr(5, 26), x = Math.cos(a) * r * 0.6 + (i % 2 ? 3 : -3), z = Math.abs(Math.sin(a)) * r + 4, y = ga(x, z), w = rr(0.38, 0.55), h = rr(0.55, 0.78), t = rr(0.2, 0.3), ry = rr(0, TAU), lay = rnd() < 0.7;
    P.bags.push(tint(new THREE.BoxGeometry(w, lay ? t : h, lay ? h : t).rotateY(ry).translate(x, y + (lay ? t : h) / 2 - 0.03, z), bagCols[i % 7]), tint(new THREE.BoxGeometry(0.16, 0.04, 0.03).translate(0, lay ? t / 2 + 0.02 : h / 2 + 0.02, lay ? h * 0.3 : 0).rotateY(ry).translate(x, y + (lay ? t : h) / 2 - 0.03, z), 0x101012));
    if (rnd() < 0.4) for (let k = 0; k < 3; k++) P.bags.push(tint(new THREE.BoxGeometry(rr(0.2, 0.5), 0.04, rr(0.2, 0.5)).rotateY(rr(0, 3)).translate(x + rr(-0.8, 0.8), y + 0.03, z + rr(-0.8, 0.8)), [0x7a3a30, 0xb8b09c, 0x34465e, 0x4a5a40][k + i & 3])); } // (clothes spilled from it)
  for (let i = 0; i < 9; i++) { const za = rr(-12, 14), fa = rr(0, TAU), x = (i % 2 ? 1 : -1) * rr(4, 12), z = rr(-6, 34), y = ga(x, z), pg = skinGeo(za, za + rr(0.8, 2.2), { f0: fa, f1: fa + rr(0.4, 1.1), na: 6, dz: 0.4 });
    pg.translate(0, -FRY + 0.2, -za).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rr(-0.4, 0.4), rr(0, TAU), Math.PI + rr(-0.5, 0.5)))).translate(x, y + rr(0.05, 0.3), z); P.livery.push(pg); }
  { const x = 3.6, z = 18.5, y = ga(x, z), T = part(), M = pose(V(0, 0, 0), V(x, y + 0.5, z), 0.6, 0, 1.45); // the main gear: a strut, its torque links and two wheels, lying on its side
    for (const s of [-1, 1]) { T.rubber.push(new THREE.TorusGeometry(0.42, 0.2, 10, 24).rotateY(Math.PI / 2).translate(s * 0.42, 0, 0)); T.chrome.push(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 16).rotateZ(Math.PI / 2).translate(s * 0.42, 0, 0)); }
    T.chrome.push(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8).rotateZ(Math.PI / 2), new THREE.CylinderGeometry(0.12, 0.14, 2.0, 10).translate(0, 1.0, 0)); bar(T, 'chrome', 0, 0.3, 0.1, 0, 1.1, 0.35, 0.06); bar(T, 'iron', 0, 2.0, 0, 0.2, 2.5, 0.3, 0.1); put(T, M);
    collideRun(b, x, z, x, z, 0.75, () => y + 0.9); }

  // ── inside the middle: walls along both sides (open at the breaks), the left's seat rows, the floor and the torn panels ramping down ──
  const fl0 = at(MM, 0, FLOOR, -0.75), flz = at(MM, 0, FLOOR, 5.25), flx = at(MM, 1, FLOOR, -0.75), sZ = (flz.y - fl0.y) / (flz.z - fl0.z), sX = (flx.y - fl0.y) / (flx.x - fl0.x);
  const floorAt = (lx, lz) => fl0.y + (lz - fl0.z) * sZ + (lx - fl0.x) * sX, top = at(MM, 0, FRY, -0.75).y, Z0 = -7.0, Z1 = 6.85, RL = 1.9;
  for (const sx of [-1, 1]) collideRun(b, sx * 1.8, Z0 + 0.1, sx * 1.8, Z1 - 0.15, 0.3, () => top);
  collideRun(b, -0.42, -6.6, -0.42, 5.4, 0.26, (lx, lz) => floorAt(lx, lz) + 1.15);
  for (const [z, d] of [[Z0, -1], [Z1, 1]]) { const y0 = floorAt(0.7, z), y1 = ga(0.7, z + d * RL) + 0.02; box(P, 'alu', 1.3, 0.05, Math.hypot(RL, y0 - y1) + 0.1, 0.7, (y0 + y1) / 2 - 0.02, z + d * RL / 2, 0, d * Math.atan2(y0 - y1, RL));
    box(P, 'carpet', 1.1, 0.02, RL * 0.7, 0.6 + rr(-0.1, 0.1), (y0 * 0.65 + y1 * 0.35) + 0.01, z + d * RL * 0.35, rr(-0.1, 0.1), d * Math.atan2(y0 - y1, RL)); }
  // the wing's top is a floor too (up from its root, out to the tip); a chain of posts holds the planform where it is low
  const MMi = MM.clone().invert(), wTop = (lx, lz) => { const d = V(lx, fl0.y + 1, lz).applyMatrix4(MMi), a = Math.abs(d.x); if (a < 1.9 || a > 16.5 || (d.x < 0 && a > 3.6)) return null;
    const q = wingStation(d.x), s = (d.z - q.z) / q.c; if (s < 0.01 || s > 0.99) return null; return at(MM, d.x, wingTopAt(q, s), d.z).y; };
  surface(b, (lx, lz) => { let h = null; if (Math.abs(lx) <= 1.7 && lz >= Z0 && lz <= Z1) h = floorAt(lx, lz);
    for (const [z, d] of [[Z0, -1], [Z1, 1]]) if (Math.abs(lx - 0.7) <= 0.65 && (lz - z) * d >= 0 && (lz - z) * d <= RL) { const t = (lz - z) * d / RL; h = Math.max(h ?? -1e9, floorAt(0.7, z) * (1 - t) + (ga(lx, lz) + 0.02) * t); }
    const w = wTop(lx, lz); return w != null ? Math.max(h ?? -1e9, w) : h; });
  for (const sx of [1, -1]) for (let x = 2.3; x < (sx > 0 ? 16.5 : 3.7); x += 0.85) { const q = wingStation(sx * x), n = Math.ceil(q.c / 1.5);
    for (let i = 0; i < n; i++) { const s = (i + 0.5) / n, p = at(MM, sx * x, q.y, q.z + s * q.c), lowTop = Math.min(at(MM, sx * x, wingTopAt(q, 0.02), q.z).y, at(MM, sx * x, wingTopAt(q, 0.97), q.z + q.c).y);
      if (p.y - 0.35 * q.t * q.c - ga(p.x, p.z) < 1.9) post(p.x, p.z, Math.min(0.9, q.c / n / 2 + 0.05), lowTop + 0.3, lowTop - 0.3); } } // (stand well under the skin: a foot on the wing is never pushed off it)
  // the nose and the tail: closed all round (their insides are seen through the breaks, not walked)
  const ring = (M, za, zb, step = 0.9) => { const pts = []; for (let z = za; z <= zb + 1e-6; z += step) pts.push([fprof(z).hw - 0.15, z]); for (let i = pts.length - 1; i >= 0; i--) pts.push([-pts[i][0], pts[i][1]]); pts.push(pts[0]);
    for (let i = 0; i < pts.length - 1; i++) { const p = at(M, pts[i][0], 0, pts[i][1]), q = at(M, pts[i + 1][0], 0, pts[i + 1][1]); const tp = Math.max(at(M, pts[i][0], fprof(pts[i][1]).top, pts[i][1]).y, ga(p.x, p.z) + 0.6);
      collideRun(b, p.x, p.z, q.x, q.z, 0.3, () => tp); } };
  ring(MN, -18.4, -8.1); ring(MT, 6.6, 18.4);
  for (const sx of [-1, 1]) for (let x = 1.2; x < 6.3; x += 0.8) { const z = 14.3 + x * 0.55 + (3.4 - x * 0.34) / 2, p = at(MT, sx * x, (fprof(15.2).top + fprof(15.2).bot) / 2 + x * 0.1, z); // (a stabiliser rolled down to head height)
    if (p.y - ga(p.x, p.z) < 2.0) post(p.x, p.z, 0.55, p.y + 0.15, p.y - 0.3); }
  // the third-person cut-away covers the middle's cabin; the crate is near the back, seen from the rear break
  b.roofBox = { cz: (Z0 + Z1) / 2, w: 3.3, d: Z1 - Z0 }; // (inside the walls only: one on the wing's root by the body is not inside) b.h = top - b.y - 0.1;
  cache(b, g, 0.75, 4.7, b.place, { k: 3, ammo: 9, y: floorAt(0.75, 4.7) }); }
// ── Interiors (slice 23 polish, #52; Jared, 2026-11-14: "everything else just sort of looks like somebody drew it from memory") ──
// The rooms are furnished with scanned CC0 props from Poly Haven (CREDITS.md), at their real size: loaded once by buildBuildings,
// placed per room, each prop's copies in a room merged into one mesh. KITS: [mesh file, texture set when it shares one, material]
const KITS = { desk: ['metal_office_desk', 0, { rough: 0.55, metal: 0.35 }], shelves: ['steel_frame_shelves_01', 0, { rough: 0.6, metal: 0.3 }], chair: ['painted_wooden_chair_01'],
  table: ['wooden_table_02'], bed: ['vintage_day_bed', 0, { rough: 0.95 }], heater: ['scandinavian_masonry_heater', 0, { rough: 0.45, metal: 0.5 }], radio: ['radio_set', 0, { rough: 0.6, metal: 0.25 }],
  radioKit: ['radio_kit', 0, { rough: 0.55, metal: 0.3 }], lamp: ['hanging_industrial_lamp', 0, { rough: 0.45, metal: 0.45, side: THREE.DoubleSide }], clip: ['clipboard'], medic: ['medical_box', 0, { rough: 0.5, metal: 0.35 }],
  pot: ['pot_enamel_01', 0, { rough: 0.3, metal: 0.1 }], bucket: ['wooden_bucket_01'], meter: ['retro_multimeter', 0, { rough: 0.5 }], jerry: ['metal_jerrycan_green', 0, { rough: 0.55, metal: 0.1 }],
  sheet: ['paper_sheet', 'office_notepads', { side: THREE.DoubleSide }], papers: ['paper_stack', 'office_notepads'], pad: ['notepad', 'office_notepads'], salt: ['salt_box', 'russian_food_cans_01'],
  tin: ['can_cond', 'russian_food_cans_01', { rough: 0.35, metal: 0.55 }], fish: ['can_fish', 'russian_food_cans_01', { rough: 0.35, metal: 0.55 }], crate: ['wooden_crate_02'], crate1: ['wooden_crate_01'], lantern: ['wooden_lantern_01'], axe: ['wooden_axe'],
  // (slice 36, the house kinds' rooms: more scanned CC0 furniture from Poly Haven, CREDITS.md)
  sofa: ['sofa_02', 0, { rough: 0.95 }], armchair: ['arm_chair_01', 0, { rough: 0.9 }], cabinet: ['painted_wooden_cabinet'], bookshelf: ['wooden_bookshelf_worn'],
  bed2: ['gothic_bed_01', 0, { rough: 0.85 }], rocker: ['rockingchair_01'], nightstand: ['painted_wooden_nightstand'], stove: ['electric_stove', 0, { rough: 0.5, metal: 0.3 }], till: ['cash_register_01', 0, { rough: 0.5, metal: 0.5 }],
  clock: ['wall_clock'], coffee: ['coffee_table_01'], dining: ['dining_table'], bench: ['painted_wooden_bench'],
  tyre: ['old_tyre', 'tyre', { rough: 0.9 }], barrel: ['barrel_03', 0, { rough: 0.85, metal: 0.05, color: 0xb09880 }] }; // (the gas station's detail pass)
let KIT = null;
export const kit = () => KIT; // (slice 36: houses.js sizes its furniture from the loaded meshes)
const GAS_KIT = ['till', 'papers', 'shelves', 'tin', 'fish', 'salt', 'meter', 'jerry', 'clock', 'crate', 'lantern', 'tyre', 'barrel']; // (the gas station's: all a classic world loads)
async function loadKit(keys = Object.keys(KITS), K = {}) {
  await Promise.all(Object.entries(KITS).filter(([k]) => keys.includes(k) && !K[k]).map(async ([k, [n, tx, o = {}]]) => { const geo = await loadMesh(n), mat = pbr('props/' + (tx || n), { rough: 0.8, ...o }); mat.clippingPlanes = [CUT]; mat.map.flipY = mat.normalMap.flipY = false; K[k] = { geo, mat }; })); // (glTF's uv start at the image's top: unflipped)
  if (K.extra) return K; // (a second call only adds the props a new world needs)
  const glowTex = canvasTex(64, 64, (x, w, h) => { const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); }, '#fff');
  const add = (o) => Object.assign(o, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTex });
  K.extra = { bulb: new THREE.MeshBasicMaterial({ color: 0xfff1d0 }), flame: new THREE.MeshBasicMaterial({ color: 0xffa040 }), slot: new THREE.MeshBasicMaterial({ color: 0xff7a20 }), iron: mats().iron.clone(),
    pool: new THREE.MeshBasicMaterial(add({ color: 0x705030 })), map: new THREE.MeshStandardMaterial({ roughness: 0.9, map: chartTex() }), note: new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide, map: noteTex() }), bark: pbr('props/logbark', { rough: 0.95, color: 0xa89a88 }), cut: new THREE.MeshStandardMaterial({ color: 0xc9a476, roughness: 0.85 }) };
  for (const m of Object.values(K.extra)) m.clippingPlanes = [CUT];
  K.halo = (c) => (K['halo' + c] ||= Object.assign(new THREE.SpriteMaterial(add({ color: c })), { clippingPlanes: [CUT] }));
  return K; }
// a room's props. put(kind, x, y, z, ry, o) stands one with its base at (x, y, z) in the building's frame, turned by ry (o: s its
// scale, rx and rz tilts, c a tint); put.geo(material, geometry) adds plain geometry (a bulb, logs, a glow); put.halo(x, y, z, size,
// colour) a soft light. put.done() merges it all, through m (a tilted hull's frame) when given, onto the building's group
export function kitRoom(b, m = null) { const L = {}, G = {}, e = new THREE.Euler(), q = new THREE.Quaternion(), V = THREE.Vector3;
  const put = (k, x, y, z, ry = 0, o = {}) => { const s = o.s || 1, M = new THREE.Matrix4().compose(new V(x, y, z), q.setFromEuler(e.set(o.rx || 0, ry, o.rz || 0, 'YXZ')), new V(s, s, s)); (L[k + '|' + (o.c ?? '')] ||= []).push(M); };
  put.geo = (k, geo) => (G[k] ||= []).push(geo);
  put.halo = (x, y, z, s, c = 0xffc890) => { const p = new V(x, y, z); if (m) p.applyMatrix4(m); const sp = new THREE.Sprite(KIT.halo(c)); sp.position.copy(p); sp.scale.setScalar(s); sp.renderOrder = 2; b.group.add(sp); };
  put.done = () => { for (const key in L) { const [k, c] = key.split('|'), K = KIT[k], geo = mergeGeometries(L[key].map(M => K.geo.clone().applyMatrix4(m ? M.premultiply(m) : M)));
      const mat = c ? (K['c' + c] ||= (() => { const n = K.mat.clone(); n.color.set(+c); return n; })()) : K.mat, mesh = new THREE.Mesh(geo, mat); mesh.castShadow = mesh.receiveShadow = true; b.group.add(mesh); }
    for (const k in G) { const geo = mergeGeometries(G[k].map(g => { const n = g.index ? g.toNonIndexed() : g; return m ? n.applyMatrix4(m) : n; })), mesh = new THREE.Mesh(geo, KIT.extra[k]); mesh.receiveShadow = k === 'bark' || k === 'cut'; mesh.castShadow = mesh.receiveShadow; b.group.add(mesh); } };
  return put; }
// a survey sheet pinned to the walls: contours round two hills, a lake and a river, tracks, a grid, pencilled marks and its title
function chartTex() { return canvasTex(512, 384, (x, w, h) => { const r = mulberry32(5), hill = [[150, 140, 120], [380, 250, 95], [300, 90, 60]], H = (px, py) => hill.reduce((a, [cx, cy, s]) => a + Math.exp(-((px - cx) ** 2 + (py - cy) ** 2) / (2 * s * s)), 0) + 0.08 * Math.sin(px * 0.03 + py * 0.02);
  x.fillStyle = '#e7dfc6'; x.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(120,100,60,${r() * 0.05})`; x.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 6); }
  x.fillStyle = 'rgba(110,160,200,0.55)'; x.beginPath(); x.ellipse(110, 300, 70, 38, 0.3, 0, 6.283); x.fill(); x.strokeStyle = 'rgba(60,110,170,0.8)'; x.lineWidth = 2; x.stroke(); x.beginPath(); x.moveTo(170, 290); x.bezierCurveTo(260, 330, 300, 260, 512, 300); x.stroke();
  for (let py = 0; py < h; py += 2) for (let px = 0; px < w; px += 2) { const v = H(px, py) * 8, f = v - Math.floor(v); if (f < 0.09) { x.fillStyle = Math.floor(v) % 5 ? 'rgba(150,95,45,0.55)' : 'rgba(130,75,30,0.85)'; x.fillRect(px, py, 2, 2); } }
  x.strokeStyle = 'rgba(40,40,40,0.75)'; x.setLineDash([8, 5]); x.lineWidth = 2; x.beginPath(); x.moveTo(0, 210); x.bezierCurveTo(150, 230, 230, 160, 330, 180); x.lineTo(512, 120); x.stroke(); x.setLineDash([]);
  x.strokeStyle = 'rgba(60,90,160,0.35)'; x.lineWidth = 1; for (let i = 64; i < w; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); } for (let j = 64; j < h; j += 64) { x.beginPath(); x.moveTo(0, j); x.lineTo(w, j); x.stroke(); }
  x.strokeStyle = 'rgba(190,30,30,0.85)'; x.lineWidth = 3; for (const [cx, cy] of [[150, 140], [330, 180], [395, 255]]) { x.beginPath(); x.arc(cx, cy, 13, 0, 6.283); x.stroke(); }
  x.fillStyle = '#f2ecda'; x.fillRect(w - 170, h - 62, 160, 52); x.strokeStyle = '#333'; x.lineWidth = 2; x.strokeRect(w - 170, h - 62, 160, 52); x.fillStyle = '#222'; x.font = 'bold 17px serif'; x.fillText('SURVEY SHEET 7', w - 160, h - 38); x.font = '12px serif'; x.fillText('1 : 25 000   contours 10 m', w - 160, h - 20);
  x.strokeStyle = '#333'; x.lineWidth = 3; x.strokeRect(4, 4, w - 8, h - 8); x.strokeStyle = 'rgba(0,0,0,0.08)'; x.lineWidth = 2; x.beginPath(); x.moveTo(w / 2, 0); x.lineTo(w / 2, h); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke(); }, '#e7dfc6'); }
// a page of the station's log: a typed heading and columns, the entries in pencil, ruled lines, a coffee ring
function noteTex() { return canvasTex(256, 362, (x, w, h) => { const r = mulberry32(9); x.fillStyle = '#f1eee4'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(80,110,170,0.35)'; x.lineWidth = 1; for (let y = 70; y < h - 10; y += 14) { x.beginPath(); x.moveTo(12, y); x.lineTo(w - 12, y); x.stroke(); }
  x.strokeStyle = 'rgba(190,60,60,0.4)'; x.beginPath(); x.moveTo(52, 50); x.lineTo(52, h - 10); x.stroke(); x.fillStyle = '#222'; x.font = 'bold 18px monospace'; x.fillText('LOG', 14, 30); x.font = '11px monospace'; x.fillText('TIME   FREQ    CALL   REMARKS', 14, 56);
  x.strokeStyle = 'rgba(40,45,70,0.8)'; x.lineWidth = 1.2; for (let y = 82; y < h - 60; y += 14) { if (r() < 0.12) continue; x.beginPath(); let px = 16; x.moveTo(px, y); for (const end of [44, 60 + r() * 40, 110 + r() * 30, 150 + r() * 90]) { while (px < end) { px += 2 + r() * 3; x.lineTo(px, y - 1 - r() * 5); } px += 8; x.moveTo(px, y); } x.stroke(); }
  x.strokeStyle = 'rgba(120,80,40,0.25)'; x.lineWidth = 5; x.beginPath(); x.arc(190, 300, 30, 0.3, 5.6); x.stroke(); }, '#f1eee4'); }
// a page pinned flat to a wall at (x, y, z) facing ry, tilted rz
function note(put, x, y, z, ry, rz = 0, d = 0.006) { put.geo('note', new THREE.PlaneGeometry(0.21, 0.297).rotateZ(rz).rotateY(ry).translate(x + Math.sin(ry) * d, y, z + Math.cos(ry) * d)); }
// that sheet on a wall at (x, y, z) facing ry, wide wd, with four pins
function chart(put, x, y, z, ry, wd = 1) { const hh = wd * 0.75, c = Math.cos(ry), s = Math.sin(ry); put.geo('map', new THREE.PlaneGeometry(wd, hh).rotateZ((Math.sin(x * 7 + z * 3)) * 0.015).rotateY(ry).translate(x, y, z));
  for (const [u, v] of [[-0.47, 0.45], [0.47, 0.45], [-0.47, -0.45], [0.47, -0.45]]) put.geo('slot', new THREE.SphereGeometry(0.008, 6, 4).translate(x + u * wd * c + s * 0.004, y + v * hh, z - u * wd * s + c * 0.004)); }
// a shelf's levels filled with stores, two rows deep: tins, fish tins and salt (some stacked), now and then a crate on the bottom
export function stock(put, S, levels, rnd, full = 0.8) { for (const lv of levels) for (const v of [0.16, 0.34]) for (let u = -0.46; u <= 0.46; u += 0.09 + rnd() * 0.05) { if (rnd() > full) continue; const k = ['tin', 'tin', 'fish', 'salt'][Math.floor(rnd() * 4)], p = S(u, lv, v + (rnd() - 0.5) * 0.04);
    put(k, ...p, rnd() * 6, { s: 2 }); if (k === 'tin' && rnd() < 0.5) put('tin', p[0], p[1] + 0.076, p[2], rnd() * 6, { s: 2 }); if (k === 'fish' && rnd() < 0.6) put('fish', p[0], p[1] + 0.04, p[2], rnd() * 6, { s: 2 }); } }
// stacked firewood along z: rows of split logs (bark, their cut ends pale), n long, r a log's radius
export function woodpile(put, x, y, z, n, rows = 3, len = 0.42, r = 0.065, rnd = Math.random) { for (let j = 0; j < rows; j++) for (let i = 0; i < n - j; i++) { const lx = x + (i - (n - j - 1) / 2) * r * 2.05, ly = y + r + j * r * 1.75, a = rnd() * 6.28;
    put.geo('bark', new THREE.CylinderGeometry(r * (0.85 + rnd() * 0.3), r, len * (0.9 + rnd() * 0.2), 7, 1, true).rotateY(a).rotateX(Math.PI / 2).translate(lx, ly, z + (rnd() - 0.5) * 0.05));
    for (const s of [-1, 1]) put.geo('cut', new THREE.CircleGeometry(r * 0.97, 7).rotateY(s > 0 ? 0 : Math.PI).rotateZ(a).translate(lx, ly, z + s * len * 0.47)); } }
// the hanging lamp: shade and chain from the ceiling at (x, yc, z), its bulb, its light on the floor below (fy) and a soft glow
export function hangLamp(put, x, yc, z, fy, s = 1) { put('lamp', x, yc, z, 0, { s }); const yb = yc - 1.25 * s; /* (s: smaller, for a house room's low ceiling: the quality pass) */ put.geo('bulb', new THREE.SphereGeometry(0.05, 10, 8).scale(1, 1.25, 1).translate(x, yb, z));
  put.halo(x, yb - 0.05, z, 1.2, 0xffd6a0); put.geo('pool', new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2).translate(x, fy + 0.015, z)); }
// a lantern standing at (x, y, z) with its flame lit
export function litLantern(put, x, y, z, ry = 0) { put('lantern', x, y, z, ry); put.geo('flame', new THREE.SphereGeometry(0.018, 8, 6).scale(1, 2, 1).translate(x, y + 0.2, z)); put.halo(x, y + 0.22, z, 0.75, 0xffb060); }
// a shelf unit's spots: (u along it from its middle, level 0..4 from the floor up, v from its back) to the room's frame
export const shelfAt = (sx, sy, sz, ry) => (u, lv, v = 0.25) => { const c = Math.cos(ry), s = Math.sin(ry), lz = v - 0.25; return [sx + u * c + lz * s, sy + [0.13, 0.64, 1.14, 1.65, 2.14][lv], sz - u * s + lz * c]; };

// the radio shack (4.4 x 3.6 m inside the walls): the operator's steel desk along the back wall, the set on it (its microphone,
// morse key and speaker), a second receiver, the logbook and papers, a chair; a steel rack of spare sets and stores on the left
// wall; a table under the window with the kettle pot, tins and a lantern; a crate and a jerrycan in the corner; a green enamel
// lamp hanging over it all. place.radio (0, d/2 - 1) is just in front of the set, the way to it from the door clear
function radioRoom(b, P, w, d) { const t = b.t || 0.45, IX = w / 2 - t / 2, IZ = d / 2 - t / 2, F = (x, z) => gAt(b, x, z) + 0.07, put = kitRoom(b), rnd = mulberry32(Math.round(b.seed * 1000) + 71), PI = Math.PI;
  const dx = -0.1, dz = IZ - 0.48, f = F(dx, dz), T = f + 0.79; put('desk', dx, f, dz, PI, { c: 0x9c9e9a });
  put('radio', 0.02, T, IZ - 0.3, PI); put('radioKit', 0.02, T, IZ - 0.3, PI); put('radio', -0.52, T, IZ - 0.26, PI + 0.06); put('radio', -0.52, T + 0.137, IZ - 0.27, PI - 0.03);
  put('pad', 0.5, T, IZ - 0.62, PI + 0.25); put('papers', 0.72, T, IZ - 0.3, 0.2); put('sheet', -0.32, T + 0.012, IZ - 0.74, 2.7); put('sheet', 0.62, T + 0.012, IZ - 0.55, PI - 0.5); put('meter', 0.8, T, IZ - 0.2, PI - 0.35);
  put('tin', -0.85, T, IZ - 0.6, 0, { s: 2 }); put('clip', -0.8, T + 0.003, IZ - 0.3, PI + 0.15);
  put('chair', 0.18, F(0.18, IZ - 1.25), IZ - 1.25, -0.3, { c: 0xb8b2a6 });
  collideRun(b, dx - 0.8, dz + 0.06, dx + 0.8, dz + 0.06, 0.42, () => f + 0.8);
  // on the back wall over the desk: the frequency list and a log on clipboards, papers pinned up
  chart(put, -0.3, b.y + 1.72, IZ - 0.008, PI, 0.95); put('clip', 0.5, b.y + 1.45, IZ - 0.02, PI, { rx: PI / 2, rz: 0.05 }); note(put, 0.5, b.y + 1.45 - 0.025, IZ - 0.02, PI, 0.05, 0.03); note(put, 0.85, b.y + 1.6, IZ - 0.012, PI, 0.06); note(put, -IX + 0.012, b.y + 1.55, 0.75, PI / 2, -0.04);
  // the rack on the left wall: spare sets on the top shelves, the first-aid box and a meter, tins and salt, a jerrycan and papers below
  { const sx = -IX + 0.27, sz = -0.12, sy = F(sx, sz), S = shelfAt(sx, sy, sz, PI / 2); put('shelves', sx, sy, sz, PI / 2);
    for (const u of [-0.27, 0.22]) put('radio', ...S(u, 3, 0.3), PI / 2 + (rnd() - 0.5) * 0.2); put('radio', ...S(-0.05, 4, 0.3), PI / 2 - 0.1); put('papers', ...S(0.33, 4, 0.25), PI / 2 + 0.1);
    put('medic', ...S(-0.2, 2, 0.24), PI / 2 + 0.04); put('meter', ...S(0.32, 2, 0.3), PI / 2 - 0.3);
    stock(put, S, [1], rnd, 0.85);
    put('jerry', ...S(-0.2, 0, 0.27), PI / 2); put('papers', ...S(0.28, 0, 0.25), PI / 2 + 0.2); put('papers', ...S(0.28, 0, 0.25).map((v, i) => i === 1 ? v + 0.012 : v), PI / 2 - 0.15);
    collideRun(b, sx, sz - 0.4, sx, sz + 0.4, 0.3, () => sy + 2.15); }
  // the table under the window: the pot for water, tins, the lantern, a notepad
  { const tx = IX - 0.37, tz = -0.52, ty = F(tx, tz), T2 = ty + 0.8; put('table', tx, ty, tz, PI / 2);
    put('pot', tx + 0.05, T2, tz - 0.3, 0.4); put('tin', tx - 0.12, T2, tz + 0.05, 0, { s: 2 }); put('fish', tx + 0.08, T2, tz + 0.1, 0, { s: 2 }); put('salt', tx + 0.15, T2, tz - 0.02, 1, { s: 2 });
    litLantern(put, tx, T2, tz + 0.36); put('pad', tx - 0.1, T2, tz - 0.05, 1.2); collideRun(b, tx, tz - 0.4, tx, tz + 0.4, 0.33, () => T2); }
  // the back-right corner: a long crate, a jerrycan on the floor
  { const cx = IX - 0.32, cz = IZ - 0.62, cy = F(cx, cz); put('crate', cx, cy, cz, 0.02); put('jerry', 1.12, F(1.12, IZ - 0.15), IZ - 0.12, PI - 0.1); collideRun(b, cx, cz - 0.4, cx, cz + 0.4, 0.33, () => cy + 0.46); }
  // the lamp over the desk's front, hung from the ceiling boards (the roof's underside at that z)
  { const rh = Math.min(2, d * 0.32), Dd = d / 2 + t / 2, z = 0.3; hangLamp(put, 0.05, b.y + b.h + rh * (1 - z / Dd) - 0.17, z, F(0.05, z)); }
  put.done(); }

// the frozen outpost (8 x 6 m inside): a round iron heater on its sheet in the back-right corner (place.heater is its spot), a heat
// shield behind it, the flue up through the roof, firewood under its side and a bucket; two day beds (the back wall and the left);
// a table with chairs, a lantern and supper in the middle under a hanging lamp; the instrument bench (a steel desk with the radio,
// a meter and logs) under the right window with its chair; steel racks of stores on the back and right walls; jerrycans by the door
function outpostRoom(b, P, w, d) { const t = b.t || 0.45, IX = w / 2 - t / 2, IZ = d / 2 - t / 2, F = (x, z) => gAt(b, x, z) + 0.07, put = kitRoom(b), rnd = mulberry32(Math.round(b.seed * 1000) + 73), PI = Math.PI;
  const rh = Math.min(2, d * 0.32), Dd = d / 2 + t / 2, top = b.y + b.h, roofAt = (z) => top + rh * (1 - Math.abs(z) / Dd);
  // the heater: its flue (at its back) up through the roof with a collar and a cap; its fire under the door, warm on the floor
  { const hx = w / 2 - 1.6, hz = d / 2 - 1.4, yh = F(hx, hz), fx = hx + 0.025, fz = hz + 0.29; put('heater', hx, yh, hz, PI);
    box(P, 'iron', 1.25, 0.02, 1.25, hx, yh + 0.005, hz - 0.15); box(P, 'hull', 1.3, 2.3, 0.03, hx, yh + 1.15, d / 2 - t / 2 - 0.03);
    { const fy = roofAt(fz) + 0.9, L = fy - yh - 2.36; P.iron.push(new THREE.CylinderGeometry(0.085, 0.085, L, 10).translate(fx, yh + 2.36 + L / 2, fz), new THREE.ConeGeometry(0.22, 0.18, 10).translate(fx, fy + 0.2, fz), new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10).translate(fx, roofAt(fz) + 0.05, fz)); }
    put.geo('slot', new THREE.PlaneGeometry(0.26, 0.022).rotateY(PI).translate(hx, yh + 0.19, hz - 0.47)); put.halo(hx, yh + 0.3, hz - 0.6, 0.9, 0xff8a40);
    const Q = slot(); Q.heat.push(new THREE.PlaneGeometry(2.4, 2.4).rotateX(-PI / 2).translate(hx, yh + 0.02, hz - 0.9)); flush(b, Q);
    woodpile(put, IX - 0.32, yh, hz + 0.15, 4, 3, 0.42, 0.065, rnd); put('bucket', hx - 0.75, F(hx - 0.75, hz - 0.55), hz - 0.55, 0.6); put('axe', IX - 0.12, yh + 0.22, hz - 0.45, -PI / 2, { rz: 0.25 });
    collideRun(b, hx, hz, hx, hz, 0.5, () => yh + 2.36); collideRun(b, IX - 0.32, hz - 0.05, IX - 0.32, hz + 0.35, 0.28, () => yh + 0.4); }
  // the beds: one along the back wall, one along the left, blankets and pillows on them, a clipboard log on the wall between
  { const bz = IZ - 0.48, bx = -IX + 1.0; put('bed', bx, F(bx, bz), bz, PI); collideRun(b, bx - 0.8, bz + 0.05, bx + 0.8, bz + 0.05, 0.42, () => F(bx, bz) + 0.55);
    const lx = -IX + 0.48, lz = 0.55; put('bed', lx, F(lx, lz), lz, PI / 2, { c: 0xd8d0c4 }); collideRun(b, lx - 0.05, lz - 0.8, lx - 0.05, lz + 0.8, 0.42, () => F(lx, lz) + 0.55);
    put('clip', -1.0, b.y + 1.45, IZ - 0.02, PI, { rx: PI / 2 }); note(put, -1.0, b.y + 1.45 - 0.025, IZ - 0.02, PI, 0, 0.03); note(put, -1.0, b.y + 1.75, IZ - 0.012, PI, 0.05); }
  // the table in the middle, two chairs, the lantern, the pot, tins, cards and papers; the lamp over it
  { const tx = -0.9, tz = -0.1, ty = F(tx, tz), T = ty + 0.8; put('table', tx, ty, tz, PI / 2 + 0.05); collideRun(b, tx, tz - 0.4, tx, tz + 0.4, 0.38, () => T);
    put('chair', tx - 0.75, F(tx - 0.75, tz - 0.25), tz - 0.25, PI / 2 - 0.2, { c: 0x9fb4c0 }); put('chair', tx + 0.7, F(tx + 0.7, tz + 0.3), tz + 0.3, -PI / 2 + 0.35, { c: 0x9fb4c0 });
    litLantern(put, tx + 0.05, T, tz + 0.3); put('pot', tx - 0.1, T, tz - 0.3, 1.2); put('tin', tx + 0.15, T, tz - 0.05, 0, { s: 2 }); put('fish', tx - 0.12, T, tz + 0.05, 0, { s: 2 });
    put('pad', tx + 0.1, T, tz - 0.42, 0.3); put('sheet', tx - 0.15, T + 0.012, tz + 0.48, 0.8);
    hangLamp(put, tx, roofAt(tz) - 0.17, tz, ty); }
  // the instrument bench under the right window: the radio and its kit, a meter, the logs, papers; a chair at it
  { const bx = IX - 0.48, bz = -1.6, by = F(bx, bz), T = by + 0.79; put('desk', bx, by, bz, -PI / 2, { c: 0x9c9e9a }); collideRun(b, bx + 0.06, bz - 0.8, bx + 0.06, bz + 0.8, 0.42, () => T);
    put('radio', bx + 0.18, T, bz - 0.55, -PI / 2); put('radioKit', bx + 0.18, T, bz - 0.55, -PI / 2); put('meter', bx + 0.2, T, bz + 0.15, -PI / 2 + 0.3); put('medic', bx + 0.12, T, bz + 0.6, -PI / 2 + 0.1);
    put('clip', bx - 0.15, T + 0.003, bz - 0.05, -PI / 2 - 0.2); put('papers', bx - 0.05, T, bz + 0.25, 0.2); put('pad', bx - 0.2, T, bz + 0.38, -1.4); put('sheet', bx - 0.1, T + 0.012, bz - 0.25, 2.2);
    put('chair', bx - 0.75, F(bx - 0.75, bz - 0.2), bz - 0.2, PI / 2 + 0.25, { c: 0x9fb4c0 });
    put('clip', IX - 0.02, b.y + 1.5, -2.35, -PI / 2, { rx: PI / 2 }); note(put, IX - 0.02, b.y + 1.5 - 0.025, -2.35, -PI / 2, 0, 0.03); note(put, IX - 0.012, b.y + 1.45, -0.15, -PI / 2, -0.05); }
  // the racks of stores: tins, salt, the pot, jerrycans, papers, the bucket
  for (const [sx, sz, ry] of [[1.02, IZ - 0.27, PI], [IX - 0.27, 0.2, -PI / 2]]) { const sy = F(sx, sz), S = shelfAt(sx, sy, sz, ry); put('shelves', sx, sy, sz, ry);
    stock(put, S, [1, 2, 3], rnd, 0.85); if (ry === PI) put('crate1', ...S(0, 0, 0.27), ry); else { put('jerry', ...S(-0.22, 0, 0.27), ry); put('papers', ...S(0.3, 0, 0.25), ry + 0.2); } put('papers', ...S(0.2, 4, 0.25), ry - 0.1); put('pot', ...S(-0.25, 4, 0.25), ry + 0.5);
    collideRun(b, sx - Math.cos(ry) * 0.4, sz + Math.sin(ry) * 0.4, sx + Math.cos(ry) * 0.4, sz - Math.sin(ry) * 0.4, 0.3, () => sy + 2.15); }
  // jerrycans by the door; the survey sheet on the left wall over the stores' crate, a weather log beside the door
  for (const [x, ry] of [[-1.25, 0.15], [-1.68, -0.1]]) put('jerry', x, F(x, -IZ + 0.15), -IZ + 0.15, ry);
  chart(put, -IX + 0.008, b.y + 1.65, -1.55, PI / 2, 1.2); put('clip', -1.4, b.y + 1.5, -IZ + 0.02, 0, { rx: PI / 2 }); note(put, -1.4, b.y + 1.5 - 0.025, -IZ + 0.02, 0, 0, 0.03); note(put, -2.1, b.y + 1.55, -IZ + 0.012, 0, 0.05);
  put.done(); }

// the hermit's shack (5 x 4.6 m inside): a round iron heater against the left gable, its pipe out through the wall to his stone
// chimney, firewood and a bucket by it, an axe; his day bed along the back wall; a table and two chairs with a lantern, the pot and
// tins; a rack of stores (on the back wall, or the right if his crate is in that corner); a jerrycan by the door. c: the crate's corner
function hermitRoom(b, P, w, d, c) { const t = b.t || 0.45, IX = w / 2 - t / 2, IZ = d / 2 - t / 2, F = (x, z) => gAt(b, x, z) + 0.04, put = kitRoom(b), rnd = mulberry32(Math.round(b.seed * 1000) + 79), PI = Math.PI;
  { const hx = -IX + 0.5, hz = 0.5, yh = F(hx, hz), fx = hx - 0.29, fz = hz + 0.025; put('heater', hx, yh, hz, PI / 2, { c: 0xb8b0a4 }); box(P, 'iron', 1.2, 0.02, 1.2, hx + 0.15, yh + 0.005, hz);
    rod(P, 'iron', fx, yh + 2.33, fz, fx, yh + 2.45, fz, 0.085, 10); rod(P, 'iron', fx, yh + 2.45, fz, -w / 2 - 0.75, yh + 2.45, fz, 0.085, 10);
    put.geo('slot', new THREE.PlaneGeometry(0.26, 0.022).rotateY(PI / 2).translate(hx + 0.47, yh + 0.19, hz)); put.halo(hx + 0.6, yh + 0.3, hz, 0.9, 0xff8a40);
    const Q = slot(); Q.heat.push(new THREE.PlaneGeometry(2.2, 2.2).rotateX(-PI / 2).translate(hx + 0.9, yh + 0.02, hz)); flush(b, Q);
    woodpile(put, hx + 0.1, F(hx, hz - 0.95), hz - 0.95, 4, 3, 0.4, 0.06, rnd); put('bucket', hx + 0.65, F(hx + 0.65, hz + 0.65), hz + 0.65, 2.2); put('axe', hx + 0.45, F(hx, hz - 0.95) + 0.22, hz - 0.95, 0.2, { rz: -0.3 });
    collideRun(b, hx, hz, hx, hz, 0.5, () => yh + 2.36); collideRun(b, hx + 0.1, hz - 1.1, hx + 0.1, hz - 0.8, 0.3, () => yh + 0.4); }
  { const bx = 1.12, bz = IZ - 0.48; put('bed', bx, F(bx, bz), bz, PI, { c: 0xd8c8b0 }); chart(put, bx, b.y + 1.65, IZ - 0.008, PI, 0.8); collideRun(b, bx - 0.8, bz + 0.05, bx + 0.8, bz + 0.05, 0.42, () => F(bx, bz) + 0.55); }
  { const tx = 0.45, tz = -0.4, ty = F(tx, tz), T = ty + 0.8; put('table', tx, ty, tz, 0.08); collideRun(b, tx - 0.4, tz, tx + 0.4, tz, 0.38, () => T);
    put('chair', tx - 0.25, F(tx - 0.25, tz - 0.7), tz - 0.7, -0.15, { c: 0x8a7a66 }); put('chair', tx + 0.85, F(tx + 0.85, tz + 0.1), tz + 0.1, -PI / 2 - 0.3, { c: 0x8a7a66 });
    litLantern(put, tx - 0.3, T, tz + 0.12); put('pot', tx + 0.2, T, tz + 0.05, 0.7); put('tin', tx + 0.05, T, tz - 0.2, 0, { s: 2 }); put('fish', tx - 0.05, T, tz - 0.1, 0, { s: 2 }); put('salt', tx + 0.38, T, tz - 0.15, 0.4, { s: 2 }); }
  { const back = !(c[0] < 0 && c[1] > 0), sx = back ? -1.3 : IX - 0.27, sz = back ? IZ - 0.27 : 0.6, ry = back ? PI : -PI / 2, sy = F(sx, sz), S = shelfAt(sx, sy, sz, ry); put('shelves', sx, sy, sz, ry, { c: 0xc8bca8 });
    stock(put, S, [1, 2, 3], rnd, 0.7);
    put('jerry', ...S(-0.22, 0, 0.27), ry); put('bucket', ...S(0.28, 0, 0.25), ry); put('lantern', ...S(0.25, 4, 0.25), ry); put('medic', ...S(-0.15, 4, 0.24), ry);
    collideRun(b, sx - Math.cos(ry) * 0.4, sz + Math.sin(ry) * 0.4, sx + Math.cos(ry) * 0.4, sz - Math.sin(ry) * 0.4, 0.3, () => sy + 2.15); }
  put('jerry', -0.3, F(-0.3, IZ - 0.2), IZ - 0.2, 0.1);
  put.done(); }

// the barge's deckhouse (in the hull's tilted frame m, its floor at y 0; x within +-hw, z from Z0 to Z1, H high): the round heater in
// the back-left corner under the pipe on the roof (scaled to fit the low room), firewood; a bunk (the day bed) along the left wall;
// the chart table (a steel desk) under the front windows with the radio, the log and a lantern, a chair; a rack of stores on the back
// wall; a crate and a jerrycan in the back-right corner. colAt makes colliders in that frame
function deckhouseRoom(b, m, colAt, hw, Z0, Z1, H) { const put = kitRoom(b, m), rnd = mulberry32(Math.round(b.seed * 1000) + 83), PI = Math.PI, x0 = -hw + 0.05, x1 = hw - 0.05, z0 = Z0 + 0.05, z1 = Z1 - 0.05;
  { const s = 0.92, hx = -1.7 + 0.29 * s, hz = Z1 - 0.5 - 0.025 * s; put('heater', hx, 0, hz, PI / 2, { s }); put.geo('iron', new THREE.CylinderGeometry(0.08, 0.08, H + 0.15 - 2.33 * s, 10).translate(-1.7, (H + 0.15 + 2.33 * s) / 2, Z1 - 0.5));
    put.geo('slot', new THREE.PlaneGeometry(0.24, 0.02).rotateY(PI / 2).translate(hx + 0.44, 0.18, hz)); put.halo(hx + 0.55, 0.28, hz, 0.8, 0xff8a40); put.geo('pool', new THREE.PlaneGeometry(1.8, 1.8).rotateX(-PI / 2).translate(hx + 0.8, 0.02, hz));
    put('bucket', -0.85, 0, Z1 - 1.25, 0.7); colAt(hx, hz, hx, hz, 0.45, 2.2); }
  { const lx = x0 + 0.47, lz = Z0 + 1.05; put('bed', lx, 0, lz, PI / 2, { c: 0xc8c0b4 }); colAt(lx - 0.05, lz - 0.8, lx - 0.05, lz + 0.8, 0.42, 0.55); }
  { const dx = -0.28, dz = z0 + 0.47, T = 0.79; put('desk', dx, 0, dz, 0, { c: 0x9c9e9a }); colAt(dx - 0.8, dz - 0.05, dx + 0.8, dz - 0.05, 0.42, T);
    put('radio', dx + 0.45, T, dz - 0.22, 0); put('radioKit', dx + 0.45, T, dz - 0.22, 0); put('clip', dx - 0.1, T + 0.003, dz + 0.05, 0.3); put('papers', dx - 0.5, T, dz - 0.1, -0.2); put('sheet', dx - 0.45, T + 0.012, dz + 0.15, 0.9);
    put('pad', dx + 0.1, T, dz + 0.2, -0.4); litLantern(put, dx - 0.82, T, dz - 0.18); put('tin', dx + 0.82, T, dz + 0.1, 0, { s: 2 });
    put('chair', dx + 0.15, 0, dz + 0.8, PI + 0.3, { c: 0x8f9a8a }); }
  { const sx = 0, sz = z1 - 0.27, S = shelfAt(sx, 0, sz, PI); put('shelves', sx, 0, sz, PI, { s: 0.98 });
    stock(put, S, [1, 2], rnd, 0.8); chart(put, x1 - 0.008, 1.5, (Z0 + Z1) / 2, -PI / 2, 0.75);
    put('medic', ...S(-0.15, 3, 0.24), PI); put('meter', ...S(0.3, 3, 0.3), PI + 0.3); put('jerry', ...S(-0.22, 0, 0.27), PI); put('bucket', ...S(0.28, 0, 0.25), PI); put('pot', ...S(0.1, 4, 0.25), PI);
    colAt(sx - 0.4, sz, sx + 0.4, sz, 0.3, 2.1); }
  { const cx = x1 - 0.32, cz = z1 - 0.65; put('crate', cx, 0, cz, 0.03); put('jerry', cx - 0.05, 0.454, cz + 0.1, 1.4); colAt(cx, cz - 0.4, cx, cz + 0.4, 0.33, 0.5); }
  put.done(); }

// (slice 23 polish) the radio shack's outside: the right window lit, a lamp over the door, an air-conditioner on its side (its
// room is radioRoom, with the interiors above)
function radioShack(b, P, w, d) { const Q = slot(), hw = w / 2 - 0.45, hd = d / 2 - 0.45, t = b.t || 0.45; floor(b, P, 'concrete', w - 0.45, d - 0.45, 0, 0, 0.07);
  Q.lit.push(new THREE.PlaneGeometry(0.9, 0.95).rotateY(Math.PI / 2).translate(w / 2 + 0.05, b.y + 1.425, -d * 0.15));
  box(P, 'beam', 0.06, 0.95, 0.06, w / 2 + t / 2 - 0.02, b.y + 1.425, -d * 0.15); box(P, 'beam', 0.06, 0.06, 0.9, w / 2 + t / 2 - 0.02, b.y + 1.425, -d * 0.15); box(P, 'beam', 0.14, 0.06, 1.05, w / 2 + t / 2 + 0.04, b.y + 0.92, -d * 0.15);
  box(P, 'iron', 0.22, 0.1, 0.2, 0, b.y + 2.45, -d / 2 - t / 2 - 0.1); P.glow.push(new THREE.BoxGeometry(0.16, 0.05, 0.14).translate(0, b.y + 2.38, -d / 2 - t / 2 - 0.1));
  box(Q, 'cab', 0.42, 0.62, 0.8, w / 2 + t / 2 + 0.21, b.y + 1.0, d * 0.22); Q.cable.push(new THREE.CircleGeometry(0.24, 14).rotateY(Math.PI / 2).translate(w / 2 + t / 2 + 0.43, b.y + 1.0, d * 0.22)); box(P, 'iron', 0.3, 0.04, 0.04, w / 2 + t / 2 + 0.15, b.y + 0.66, d * 0.22 - 0.3);
  flush(b, Q); }
// (slice 23 polish) the frozen outpost: a small polar research station. The main hut (8 x 6 m, red insulated walls, snow on the
// roof with a cornice and icicles at the eaves) holds a cast-iron stove whose fire shows through the front-right window (src/plan.js
// puts place.heater at the same spot: x = w/2 - 1.6, z = d/2 - 1.4), bunks, a table, a bench of instruments under the right
// window, parkas by the door and the locked stores (the guarded crate). Outside: an antenna mast with a Yagi and an HF wire to the
// gable, a weather mast (cup anemometer, vane, a louvred screen), solar panels, a fuel tank and drums, a sled, aluminium cases,
// a snow fence half buried, a radome on its base, marker flags out from the door, and drifts against everything
function outpost(b, P, g, w, d) { const Q = slot(), M = placeMats(), hw = w / 2 - 0.45, hd = d / 2 - 0.45, t = b.t || 0.45, W = w / 2, D0 = d / 2, F = (x, z) => gAt(b, x, z);
  floor(b, P, 'planks', w - 0.45, d - 0.45, 0, 0, 0.07); // (a timber floor over the paving)
  // the stove's spot (src/plan.js puts place.heater there) and the roof's line, for the flue and the snow
  const hx = W - 1.6, hz = D0 - 1.4, yh = F(hx, hz), rh = Math.min(2, d * 0.32), Dd = d / 2 + t / 2, top = b.y + b.h, roofAt = (z) => top + rh * (1 - Math.abs(z) / Dd);
  // the room: outpostRoom (with the interiors, below). The three stools that stood here drew from the world's stream: it draws as it did
  R(); R(); R(); outpostRoom(b, P, w, d);
  cache(b, g, -hw + 0.8, -hd + 1.0, b.place, { k: 3 });
  // the windows: front-left and left lit, frames and sills on all (the front-right one open on the stove)
  Q.lit.push(new THREE.PlaneGeometry(0.9, 0.95).rotateY(Math.PI).translate(-w * 0.3, b.y + 1.425, -D0 - 0.06), new THREE.PlaneGeometry(0.9, 0.95).rotateY(-Math.PI / 2).translate(-W - 0.06, b.y + 1.425, 0));
  for (const [x, z, ry] of [[-w * 0.3, -D0, 0], [w * 0.3, -D0, 0], [0, D0, 0], [-W, 0, 1.57], [W, -d * 0.15, 1.57]]) { const o = t / 2 + 0.03, nx = ry ? Math.sign(x) : 0, nz = ry ? 0 : Math.sign(z);
    box(P, 'beam', 1.1, 0.07, 0.16, x + nx * o, b.y + 0.9, z + nz * o, ry); box(P, 'beam', 1.05, 0.1, 0.08, x + nx * o, b.y + 1.95, z + nz * o, ry); box(P, 'beam', 0.05, 0.95, 0.05, x + nx * (o - 0.02), b.y + 1.425, z + nz * (o - 0.02), ry); box(P, 'beam', 0.9, 0.05, 0.05, x + nx * (o - 0.02), b.y + 1.425, z + nz * (o - 0.02), ry);
    P.snow.push(new THREE.BoxGeometry(1.0, 0.07, 0.14).rotateY(ry).translate(x + nx * o, b.y + 0.96, z + nz * o)); }
  // the station's sign by the door, a lamp over it, a shovel leaning on the wall
  signAt(b, M.station, 1.4, b.y + 1.55, -D0 - t / 2 - 0.02, Math.PI, 0.72, 0.54); box(P, 'iron', 0.22, 0.1, 0.2, 0, b.y + 2.45, -D0 - t / 2 - 0.1); P.glow.push(new THREE.BoxGeometry(0.16, 0.05, 0.14).translate(0, b.y + 2.38, -D0 - t / 2 - 0.1));
  bar(P, 'beam', -1.05, F(-1.05, -D0 - 0.6) + 0.05, -D0 - 0.62, -1.15, b.y + 1.25, -D0 - t / 2 - 0.04, 0.04); box(P, 'iron', 0.26, 0.34, 0.03, -1.05, F(-1.05, -D0 - 0.6) + 0.15, -D0 - 0.62, 0, 0.15);
  // snow on the roof, a cornice along each eave, icicles under it
  { const half = Dd + 0.45, sl = Math.atan2(rh, Dd), len = half / Math.cos(sl), yE = top - 0.45 * rh / Dd;
    for (const s of [-1, 1]) { box(b.PR, 'snow', w + t + 0.8, 0.22, len * 0.97, 0, (yE + top + rh) / 2 + 0.22, s * half / 2, 0, s * sl); b.PR.snow.push(new THREE.CylinderGeometry(0.17, 0.17, w + t + 0.85, 8).rotateZ(Math.PI / 2).translate(0, yE + 0.16, s * (half - 0.02)));
      for (let x = -W - 0.4; x < W + 0.4; x += 0.22) { if (R() < 0.3) continue; const L = 0.12 + R() * R() * 0.6; Q.ice.push(new THREE.ConeGeometry(0.035 + L * 0.06, L, 5).rotateX(Math.PI).translate(x + R() * 0.1, yE - 0.02 - L / 2, s * (half - 0.08))); } } }
  // the antenna mast at the right: a Yagi on top, two whips on an arm, a bracket to the wall, guys, an HF wire to the gable
  { const ax = W + 1.3, az = -1.8, ay = F(ax, az), top9 = ay + 9; P.iron.push(new THREE.CylinderGeometry(0.05, 0.07, 9.4, 8).translate(ax, ay + 4.5, az)); bar(P, 'iron', ax, ay + 2.6, az, W + t / 2, b.y + 2.6, az, 0.05);
    bar(P, 'iron', ax - 1.1, top9 - 0.2, az, ax + 1.1, top9 - 0.2, az, 0.05); for (let k = 0; k < 6; k++) { const x = ax - 1.0 + k * 0.4, L = 1.05 - k * 0.06; bar(P, 'iron', x, top9 - 0.2, az - L / 2, x, top9 - 0.2, az + L / 2, 0.02); }
    bar(P, 'iron', ax, top9 - 1.6, az - 0.7, ax, top9 - 1.6, az + 0.7, 0.04); for (const s of [-1, 1]) bar(P, 'iron', ax, top9 - 1.6, az + s * 0.7, ax, top9 + 0.2, az + s * 0.7, 0.02);
    for (const a of [-0.5, 0.9, -2.0]) { const gx = ax + Math.cos(a) * 2.6, gz = az + Math.sin(a) * 2.6; bar(Q, 'cable', ax, ay + 6.5, az, gx, F(gx, gz) + 0.05, gz, 0.015); box(P, 'iron', 0.12, 0.3, 0.12, gx, F(gx, gz) + 0.05, gz); }
    bar(Q, 'cable', ax, top9 - 0.6, az, W + 0.35, roofAt(0) + 0.1, 0, 0.012); collideRun(b, ax, az, ax, az, 0.15, () => top9); }
  // the weather mast behind it: cup anemometer and vane on a cross-arm, a logger box and a small panel; a louvred screen beside
  { const mx = W + 3, mz = D0 + 1.5, my = F(mx, mz), T = my + 7; P.iron.push(new THREE.CylinderGeometry(0.045, 0.06, 7.2, 8).translate(mx, my + 3.5, mz)); bar(P, 'iron', mx - 0.75, T - 0.4, mz, mx + 0.75, T - 0.4, mz, 0.04); bar(P, 'iron', mx, T - 0.2, mz, mx, T + 0.6, mz, 0.015);
    const ax = mx + 0.7, ay = T - 0.1; P.iron.push(new THREE.CylinderGeometry(0.035, 0.035, 0.35, 8).translate(ax, ay - 0.15, mz)); for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.3, ex = ax + Math.cos(a) * 0.22, ez = mz + Math.sin(a) * 0.22;
      bar(P, 'iron', ax, ay, mz, ex, ay, ez, 0.012); Q.white.push(new THREE.SphereGeometry(0.055, 8, 4, 0, 6.283, 0, Math.PI / 2).rotateX(Math.PI / 2).rotateY(-a).translate(ex, ay, ez)); }
    const vx = mx - 0.7; P.iron.push(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6).translate(vx, T - 0.25, mz)); bar(P, 'iron', vx - 0.35, T - 0.1, mz + 0.1, vx + 0.25, T - 0.1, mz - 0.07, 0.018); box(Q, 'white', 0.02, 0.16, 0.24, vx - 0.33, T - 0.08, mz + 0.1, 1.85); P.iron.push(new THREE.ConeGeometry(0.035, 0.1, 6).rotateZ(-Math.PI / 2).rotateY(0.28).translate(vx + 0.27, T - 0.1, mz - 0.075));
    box(Q, 'cab', 0.32, 0.42, 0.16, mx, my + 1.4, mz - 0.13); bar(Q, 'cable', mx, my + 1.6, mz - 0.06, mx, T - 0.45, mz - 0.06, 0.015); box(Q, 'solar', 0.42, 0.03, 0.55, mx, my + 3.1, mz - 0.35, 0, -1.0);
    for (const a of [0.2, 2.3, 4.4]) { const gx = mx + Math.cos(a) * 2.5, gz = mz + Math.sin(a) * 2.5; bar(Q, 'cable', mx, my + 5.5, mz, gx, F(gx, gz) + 0.05, gz, 0.012); box(P, 'iron', 0.1, 0.25, 0.1, gx, F(gx, gz) + 0.05, gz); }
    collideRun(b, mx, mz, mx, mz, 0.12, () => T);
    const sx = W + 4.6, sz = D0 + 3.4, sy = F(sx, sz); for (const [a, c] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]]) box(Q, 'white', 0.05, 1.2, 0.05, sx + a, sy + 0.6, sz + c);
    box(Q, 'white', 0.62, 0.5, 0.5, sx, sy + 1.45, sz); box(Q, 'white', 0.74, 0.05, 0.62, sx, sy + 1.73, sz, 0, 0.12); for (let k = 0; k < 5; k++) box(P, 'iron', 0.6, 0.015, 0.02, sx, sy + 1.25 + k * 0.09, sz - 0.26);
    collideRun(b, sx, sz, sx, sz, 0.4, () => sy + 1.8); }
  // solar panels in a row at the front right, steep for the low sun, on frames; a battery box behind
  { const pz = -D0 - 2.4, tilt = 1.05; for (let k = 0; k < 3; k++) { const px = W + 0.75 + k * 1.08, py = F(px, pz); box(Q, 'solar', 1.0, 0.04, 1.65, px, py + 0.55 + 0.82 * Math.sin(tilt), pz, 0, -tilt);
      for (const s of [-0.45, 0.45]) { bar(P, 'iron', px + s, py - 0.1, pz - 0.82 * Math.cos(tilt), px + s, py + 0.55, pz - 0.82 * Math.cos(tilt), 0.05); bar(P, 'iron', px + s, py - 0.1, pz + 0.82 * Math.cos(tilt), px + s, py + 0.55 + 1.64 * Math.sin(tilt), pz + 0.82 * Math.cos(tilt), 0.05); } }
    box(Q, 'cab', 0.9, 0.7, 0.5, W + 1.83, F(W + 1.83, pz + 1.3) + 0.35, pz + 1.3); bar(Q, 'cable', W + 1.83, F(W + 1.83, pz + 1.3) + 0.6, pz + 1.05, W + t / 2, b.y + 0.6, -D0 + 0.4, 0.03);
    collideRun(b, W + 0.4, pz, W + 3.6, pz, 0.45, () => F(W + 2, pz) + 2); drift(b, Q, W + 1.9, pz - 0.6, 0.6, 2.6, 0.7); }
  // the fuel tank on its saddles at the left, a line to the wall, drums behind it
  { const fx = -W - 2.2, fz = -1.0, fy = F(fx, fz); for (const s of [-0.85, 0.85]) box(P, 'concrete', 1.1, 0.5, 0.25, fx, fy + 0.15, fz + s);
    P.hull.push(new THREE.CylinderGeometry(0.62, 0.62, 2.6, 18).rotateX(Math.PI / 2).translate(fx, fy + 1.0, fz)); for (const s of [-1, 1]) P.iron.push(new THREE.CylinderGeometry(0.64, 0.64, 0.06, 18).rotateX(Math.PI / 2).translate(fx, fy + 1.0, fz + s * 1.0));
    P.iron.push(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 10).translate(fx, fy + 1.7, fz - 0.6)); box(P, 'snow', 0.7, 0.12, 2.4, fx, fy + 1.64, fz); bar(P, 'iron', fx + 0.6, fy + 0.6, fz + 0.5, -W - t / 2, b.y + 0.45, fz + 0.5, 0.04);
    collideRun(b, fx, fz - 1.2, fx, fz + 1.2, 0.68, () => fy + 1.7);
    for (const [x, z, k] of [[-W - 1.9, 1.15, 'drumR'], [-W - 2.55, 1.35, 'drumB'], [-W - 2.2, 1.9, 'drumY']]) Q[k].push(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14).translate(x, F(x, z) + 0.44, z));
    Q.drumR.push(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14).rotateZ(Math.PI / 2).rotateY(0.3).translate(-W - 1.4, F(-W - 1.4, 2.5) + 0.29, 2.5)); collideRun(b, -W - 2.6, 1.3, -W - 1.5, 1.9, 0.45, () => fy + 0.9);
    drift(b, Q, fx - 0.7, fz + 0.3, 0.9, 1.4, 0.75, 1.5); }
  // the sled at the front left: runners turned up at the front, slats, stanchions, a tarp-lashed load
  { const sx = -2.9, sz = -D0 - 3.4, ry = 0.35, sy = F(sx, sz), S = { beam: [], planks: [], cloth: [], hull: [] };
    for (const v of [-0.36, 0.36]) { S.beam.push(new THREE.BoxGeometry(2.3, 0.06, 0.06).translate(-0.1, 0.05, v), new THREE.BoxGeometry(0.42, 0.06, 0.06).rotateZ(0.8).translate(1.18, 0.2, v)); for (let k = 0; k < 4; k++) S.beam.push(new THREE.BoxGeometry(0.04, 0.26, 0.04).translate(-0.95 + k * 0.6, 0.2, v)); S.beam.push(new THREE.BoxGeometry(2.1, 0.05, 0.05).translate(-0.1, 0.55, v)); }
    for (let k = 0; k < 9; k++) S.planks.push(new THREE.BoxGeometry(0.1, 0.03, 0.8).translate(-1.05 + k * 0.24, 0.34, 0)); S.hull.push(new THREE.BoxGeometry(0.75, 0.42, 0.55).translate(-0.55, 0.57, 0)); S.cloth.push(new THREE.BoxGeometry(1.1, 0.38, 0.68).translate(0.45, 0.55, 0));
    for (const k in S) for (const geo of S[k]) P[k].push(geo.rotateY(ry).translate(sx, sy, sz)); bar(Q, 'cable', sx + 0.6, sy + 0.75, sz - 0.35, sx + 0.3, sy + 0.75, sz + 0.4, 0.015);
    collideRun(b, sx - Math.cos(ry) * 1.1, sz + Math.sin(ry) * 1.1, sx + Math.cos(ry) * 1.2, sz - Math.sin(ry) * 1.2, 0.45, () => sy + 0.8); }
  // aluminium cases stacked by the door's right, snow on them
  { const cx = 2.6, cz = -D0 - 1.6, cy = F(cx, cz); box(P, 'hull', 0.85, 0.45, 0.58, cx, cy + 0.23, cz, 0.1); box(P, 'hull', 0.85, 0.45, 0.58, cx + 0.95, cy + 0.23, cz + 0.1, -0.08); box(P, 'hull', 0.7, 0.38, 0.5, cx + 0.4, cy + 0.65, cz + 0.05, 0.3);
    box(P, 'snow', 0.62, 0.05, 0.44, cx + 0.4, cy + 0.86, cz + 0.05, 0.3); collideRun(b, cx - 0.2, cz, cx + 1.2, cz + 0.1, 0.45, () => cy + 0.85); }
  // the radome on its base at the back left: geodesic panels on a ring, a door, a cable to the hut
  { const rx = -W - 2.8, rz = D0 + 2.0, ry = F(rx, rz); box(P, 'paint', 2.6, 2.4, 2.6, rx, ry + 0.4, rz); box(P, 'iron', 2.75, 0.12, 2.75, rx, ry + 1.66, rz); box(P, 'iron', 0.9, 1.85, 0.06, rx + 1.31, ry + 0.95, rz, Math.PI / 2);
    P.iron.push(new THREE.CylinderGeometry(1.35, 1.35, 0.14, 18).translate(rx, ry + 1.78, rz)); Q.dome.push(new THREE.IcosahedronGeometry(1.75, 2).translate(rx, ry + 2.85, rz)); P.iron.push(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6).translate(rx, ry + 4.95, rz)); Q.red.push(new THREE.SphereGeometry(0.07, 8, 6).translate(rx, ry + 5.38, rz));
    bar(Q, 'cable', rx + 1.3, ry + 0.2, rz - 0.6, -W - t / 2, b.y + 0.3, D0 - 0.6, 0.035); collideRun(b, rx, rz - 0.4, rx, rz + 0.4, 1.35, () => ry + 4.6); drift(b, Q, rx - 0.6, rz + 1.5, 1.0, 1.8, 0.7, 0.4); }
  // the snow fence behind: slatted bays on posts, a gap in the middle, half buried on its lee side
  { const fz = D0 + 5.0; for (const [x0, x1] of [[-5.5, -0.6], [0.9, 5.0]]) { const n = Math.ceil((x1 - x0) / 2);
      for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n; box(P, 'beam', 0.1, 1.9, 0.1, x, F(x, fz) + 0.5, fz); }
      for (const h of [0.35, 1.05]) bar(P, 'beam', x0, F(x0, fz) + h, fz - 0.06, x1, F(x1, fz) + h, fz - 0.06, 0.06);
      for (let x = x0 + 0.1; x < x1 - 0.05; x += 0.21) { if (R() < 0.06) continue; box(P, 'planks', 0.1, 1.15 + R() * 0.1, 0.025, x, F(x, fz) + 0.62, fz - 0.1, 0, 0, (R() - 0.5) * 0.06); }
      collideRun(b, x0, fz, x1, fz, 0.12, () => F((x0 + x1) / 2, fz) + 1.3); drift(b, Q, (x0 + x1) / 2, fz - 1.0, (x1 - x0) * 0.3, 1.6, 0.32); } }
  // marker flags out from the door, and drifts against the hut and round the place
  for (const [x, z] of [[-1.5, -D0 - 2.6], [-1.7, -D0 - 5.6], [-2.0, -D0 - 8.6]]) { const y = F(x, z); bar(P, 'beam', x, y - 0.2, z, x + 0.05, y + 1.9, z, 0.03); Q.orange.push(new THREE.PlaneGeometry(0.34, 0.26).translate(x + 0.2, y + 1.74, z)); }
  { const o = t / 2, e = (r) => o + r * 0.8; /* (each drift's near edge stays outside the wall it leans on) */
    for (const [x, z, r, sx, sy, ry] of [[-W - e(1.0), 1.7, 1.0, 1.8, 0.8, 1.57], [W + e(0.9), 1.3, 0.9, 1.6, 0.75, 1.57], [0.3, D0 + e(1.0), 1.0, 2.2, 0.7, 0], [-W - 1.3, D0 + 1.1, 0.9, 1.6, 0.8, 0.8], [W + 1.3, D0 + 1.1, 0.9, 1.6, 0.75, -0.8],
      [W - 0.7, -D0 - e(0.7), 0.7, 1.6, 0.7, 0], [-W + 0.6, -D0 - e(0.7), 0.7, 1.7, 0.7, 0.2]]) drift(b, Q, x, z, r, sx, sy, ry); }
  flush(b, Q); }


// the sunken barge (polish, Jared, November 14, 2026: "the same sort of scale and quality/detail check" as the plane): a 28 m
// riveted river cargo barge, 7.6 m in the beam, run aground with its bow sunk in the water (its deck just awash there) and its
// stern up the bank. Its long hold has four hatch covers on a coaming, one lifted off and stacked (the hold below, half flooded);
// a derrick at the hold's head, its hook down the open hatch; a deckhouse aft you can walk into (windows, a door);
// a container on the covers and another gone overboard into the shallows with its loot spilled round it. A gangplank goes
// up onto the sunk bow; the deck is walkable, the hull, coaming and deckhouse solid. Two crates: the guarded one on the
// foredeck, another in the shallows by the bow
let BM = null; const WLU = { value: 0 }; // (the barge's waterline, world y: its hull goes dark and green with slime below it)
const TILEB = { rust: 6, green: 4, cream: 4, sack: 0.8, soil: 1.5 }; // (metres a texture covers, box-projected; the rest carry their own uvs)
const seeded = (s) => () => (s = (s * 16807) % 2147483647) / 2147483647; // (a texture is drawn twice, its colour then its alpha: the same both times)
function slime(m) { m.onBeforeCompile = (sh) => { sh.uniforms.uWL = WLU;
    sh.vertexShader = 'varying float vWY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = 'uniform float uWL;\nvarying float vWY;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  { float s = smoothstep(uWL + 0.55, uWL - 0.15, vWY); diffuseColor.rgb *= mix(vec3(1.0), vec3(0.36, 0.41, 0.24), s); diffuseColor.rgb *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.12, abs(vWY - uWL - 0.45))); }'); };
  m.customProgramCacheKey = () => 'iw-slime'; }
function bargeMats() { if (BM) return BM;
  // a seamless sheet of weathered steel: paint faded in blotches, rust where it has gone, plate seams with rivet rows, rust run down
  // from them, pitting, scrapes from quays and locks (or a container's corrugations)
  const sheet = (paint, o, seed) => { const t = canvasTex(512, 512, (x, w, h) => { const rnd = seeded(seed);
      const at = (cx, cy, r, f) => { for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { const X = cx + dx, Y = cy + dy; if (X > -r && X < w + r && Y > -r && Y < h + r) f(X, Y); } };
      const blob = (cx, cy, r, c, a) => at(cx, cy, r, (X, Y) => { const g = x.createRadialGradient(X, Y, 0, X, Y, r); g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(1, `rgba(${c},0)`); x.fillStyle = g; x.fillRect(X - r, Y - r, 2 * r, 2 * r); });
      for (let i = 0; i < 200; i++) blob(rnd() * w, rnd() * h, 12 + rnd() * 60, rnd() < 0.5 ? '255,248,230' : '0,0,0', 0.04 + rnd() * 0.07);
      if (o.corr) for (let k = 0; k < o.corr; k++) { const p = w / o.corr; x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(p * k, 0, p * 0.3, h); x.fillStyle = 'rgba(255,255,255,0.1)'; x.fillRect(p * k + p * 0.5, 0, p * 0.22, h); }
      const RU = ['118,56,24', '146,76,32', '92,42,20', '168,100,50'];
      for (let i = 0; i < o.rust; i++) { const cx = rnd() * w, cy = rnd() * h, n = 3 + rnd() * 7; for (let k = 0; k < n; k++) blob(cx + (rnd() - 0.5) * 44, cy + (rnd() - 0.5) * 30, 4 + rnd() * 16, RU[k % 4], 0.35 + rnd() * 0.45); }
      const ys = [], xs = []; for (let r = 0; r < (o.rows || 0); r++) { const y = h / o.rows * r; ys.push(y); for (const f of [0, 0.5]) xs.push([w * (f + (r % 2) * 0.25), y, h / o.rows]); }
      for (const y of ys) { x.fillStyle = 'rgba(20,16,12,0.6)'; x.fillRect(0, y - 1, w, 2); x.fillStyle = 'rgba(255,240,220,0.13)'; x.fillRect(0, y + 1, w, 1); }
      for (const [sx, y0, hh] of xs) { x.fillStyle = 'rgba(20,16,12,0.55)'; x.fillRect(sx - 1, y0, 2, hh); }
      const rivet = (cx, cy) => at(cx, cy, 3, (X, Y) => { x.fillStyle = 'rgba(14,11,9,0.75)'; x.fillRect(X - 1.5, Y - 1, 3, 3); x.fillStyle = 'rgba(255,235,210,0.28)'; x.fillRect(X - 1.5, Y - 1.5, 2, 1); });
      if (o.rivets) { for (const y of ys) for (let X = 3; X < w; X += 9) { rivet(X, y - 6); rivet(X + 4, y + 6); } for (const [sx, y0, hh] of xs) for (let Y = y0 + 6; Y < y0 + hh - 3; Y += 9) { rivet(sx - 6, Y); rivet(sx + 6, Y + 4); } }
      for (let i = 0; i < o.streaks; i++) { const X = rnd() * w, Y = ys.length && rnd() < 0.7 ? ys[Math.floor(rnd() * ys.length)] + 4 : rnd() * h, len = 20 + rnd() * 150, wd = 1 + rnd() * 3.5, c = RU[Math.floor(rnd() * 4)], a = 0.3 + rnd() * 0.4;
        at(X, Y + len / 2, len, (X1, Y1) => { const g = x.createLinearGradient(0, Y1 - len / 2, 0, Y1 + len / 2); g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(1, `rgba(${c},0)`); x.fillStyle = g; x.fillRect(X1, Y1 - len / 2, wd, len); }); }
      for (let i = 0; i < 2500; i++) { x.fillStyle = `rgba(${rnd() < 0.5 ? '30,22,16' : '120,64,30'},${0.2 + rnd() * 0.4})`; x.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1 + rnd() * 1.5); }
      for (let i = 0; i < (o.scuff || 0); i++) { x.fillStyle = `rgba(200,190,170,${0.08 + rnd() * 0.12})`; x.fillRect(rnd() * w, rnd() * h, 40 + rnd() * 160, 1 + rnd() * 2); } }, paint);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  const small = (n, bg, draw) => { const t = canvasTex(n, n, draw, bg); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  const mk = (map, o = {}) => { const m = new THREE.MeshStandardMaterial({ map, color: o.color ?? 0xffffff, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0.2, side: THREE.DoubleSide, transparent: !!o.blend, opacity: o.opacity ?? 1, alphaTest: o.alpha ?? 0, depthWrite: !o.blend });
    m.clippingPlanes = [CUT]; if (o.slime) slime(m); return m; };
  const cont = sheet('#aaa69c', { corr: 11, rust: 40, streaks: 130 }, 41);
  const text = (lines, bg, w, h) => canvasTex(w, h, (x) => { const rnd = seeded(5); x.textAlign = 'center'; x.fillStyle = 'rgba(232,224,204,0.92)'; for (const [s, f, y] of lines) { x.font = f; x.fillText(s, w / 2, y); }
    x.globalCompositeOperation = 'destination-out'; for (let i = 0; i < w * h / 70; i++) { x.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.7})`; x.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 4, 1 + rnd() * 3); } }, bg);
  BM = { rust: mk(sheet('#3a3c3a', { rows: 3, rivets: true, rust: 70, streaks: 220, scuff: 14 }, 11), { slime: true, metal: 0.3 }),
    green: mk(sheet('#56685a', { rows: 2, rivets: true, rust: 45, streaks: 120 }, 23), { metal: 0.25 }), cream: mk(sheet('#cbc4ac', { rows: 1, rust: 26, streaks: 150 }, 31), { rough: 0.75 }),
    contB: mk(cont, { color: 0x7090ac, slime: true }), contR: mk(cont, { color: 0xa85440, slime: true }),
    hole: new THREE.MeshBasicMaterial({ color: 0x0c0a08, side: THREE.DoubleSide }), water: mk(null, { color: 0x2c3123, rough: 0.1, metal: 0.25, blend: true, opacity: 0.9 }),
    rubber: mk(null, { color: 0x1e1d1c, rough: 0.95, metal: 0 }), buoy: mk(null, { color: 0xc8643c, rough: 0.7, metal: 0 }), leaf: mk(null, { color: 0x56753a, rough: 0.85, metal: 0 }), cab: mk(null, { color: 0x9fbb6e, rough: 0.7, metal: 0 }),
    sack: mk(small(128, '#9a8058', (x, w, h) => { for (let k = 0; k < w; k += 4) { x.fillStyle = 'rgba(60,44,24,0.35)'; x.fillRect(k, 0, 1.5, h); x.fillRect(0, k, w, 1.5); } }), { rough: 0.95, metal: 0 }),
    soil: mk(small(256, '#3c2c1f', (x, w, h) => { const rnd = seeded(3); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${rnd() < 0.5 ? '20,14,9' : '96,74,52'},${0.25 + rnd() * 0.5})`; const r = 1 + rnd() * 4; x.fillRect(rnd() * w, rnd() * h, r, r * 0.8); } }), { rough: 1, metal: 0 }),
    net: mk(small(128, '#3e4636', (x, w, h) => { x.strokeStyle = 'rgba(62,70,54,1)'; x.lineWidth = 4.5; for (let k = -w; k <= 2 * w; k += 32) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + h, h); x.moveTo(k, 0); x.lineTo(k - h, h); x.stroke(); } }), { alpha: 0.5, rough: 0.9, metal: 0 }),
    name: mk(text([['GREY HERON', 'bold 62px Georgia, serif', 84], ['LOWMARSH', 'bold 30px Georgia, serif', 136]], '#e8e0cc', 512, 160), { alpha: 0.35, metal: 0 }),
    code: mk(text([['IWLU 418207 3', 'bold 40px monospace', 56], ['22G1', 'bold 34px monospace', 104]], '#e8e0cc', 256, 128), { alpha: 0.35, metal: 0 }) };
  BM.hole.clippingPlanes = [CUT]; return BM; }
const bag = () => new Proxy({}, { get: (o, k) => (o[k] ||= []) }); // geometry lists by material, made as they are asked for
// a round bar between two points (a mast, a boom, a wire, a pole)
function rod(D, k, x0, y0, z0, x1, y1, z1, r, seg = 8) { const d = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0), L = d.length();
  D[k].push(new THREE.CylinderGeometry(r, r, L, seg).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize())).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)); }
// a chain of links from a to c, sagging by sag in its middle
function chain(D, k, a, c, sag, link = 0.12) { const n = Math.max(2, Math.round(a.distanceTo(c) * (1 + sag * 0.3) / (link * 0.8))), p = (t) => new THREE.Vector3().lerpVectors(a, c, t).add(new THREE.Vector3(0, -4 * sag * t * (1 - t), 0));
  for (let i = 0; i < n; i++) { const p0 = p(i / n), p1 = p((i + 1) / n), q = new THREE.Quaternion().setFromUnitVectors(UP, p1.clone().sub(p0).normalize());
    D[k].push(new THREE.TorusGeometry(link * 0.36, link * 0.1, 4, 8).scale(0.8, 1.4, 1).rotateY(i % 2 ? Math.PI / 2 : 0).applyQuaternion(q).translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2)); } }
// a ship's lantern: a lit glass box in a cage under a cap, hung by its bail
function lantern(D, x, y, z) { D.glow.push(new THREE.BoxGeometry(0.1, 0.16, 0.1).translate(x, y, z)); D.iron.push(new THREE.ConeGeometry(0.11, 0.09, 4).rotateY(Math.PI / 4).translate(x, y + 0.13, z)); box(D, 'iron', 0.15, 0.025, 0.15, x, y - 0.095, z);
  for (const [a, c] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) box(D, 'iron', 0.015, 0.2, 0.015, x + a * 0.065, y, z + c * 0.065); D.iron.push(new THREE.TorusGeometry(0.045, 0.008, 4, 8).translate(x, y + 0.21, z)); }
// lists of geometry into meshes on the building's group: my own materials (box-projected in the frame they were made in, then
// moved by m), and the shared ones into P (or the roof's PR) for buildBuildings to merge
function bake(b, lists) { const M_ = bargeMats(), out = {};
  for (const [D, m] of lists) for (const k in D) for (const q of D[k]) { if (TILEB[k]) boxUV(q, TILEB[k]); if (m) q.applyMatrix4(m); (out[k] ||= []).push(q.index ? q.toNonIndexed() : q); }
  for (const k in out) { const mesh = new THREE.Mesh(mergeGeometries(out[k]), M_[k]); mesh.castShadow = !['water', 'hole', 'name', 'code', 'net'].includes(k); mesh.receiveShadow = true; b.group.add(mesh); } }
const share = (D, m, into) => { for (const k in D) for (const q of D[k]) into[k].push(m ? q.applyMatrix4(m) : q); };
// a 20 ft shipping container (6.06 x 2.44 x 2.59 m) in its own frame, its doors at +z: corrugated walls, corner posts and
// castings, the doors' locking bars; open swings the right-hand door out
function container(k, open) { const l = 6.06, w = 2.44, h = 2.59, D = bag(), plate = (sx, sy, sz, x, y, z, ry = 0) => D[k].push(boxUV(new THREE.BoxGeometry(sx, sy, sz).rotateY(ry).translate(x, y, z), 3));
  for (const s of [-1, 1]) plate(0.05, h - 0.2, l - 0.2, s * (w / 2 - 0.04), h / 2, 0); plate(w - 0.1, 0.05, l - 0.1, 0, h - 0.05, 0); plate(w - 0.1, 0.05, l - 0.1, 0, 0.05, 0); plate(w - 0.1, h - 0.2, 0.05, 0, h / 2, -l / 2 + 0.05);
  plate(w / 2 - 0.06, h - 0.24, 0.05, -w / 4, h / 2, l / 2 - 0.05); if (open) { const f = 1.95; plate(w / 2 - 0.06, h - 0.24, 0.05, w / 2 - 0.06 + Math.cos(f) * w / 4, h / 2, l / 2 + Math.sin(f) * w / 4, f); } else plate(w / 2 - 0.06, h - 0.24, 0.05, w / 4, h / 2, l / 2 - 0.05);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { box(D, 'iron', 0.13, h, 0.13, sx * (w / 2 - 0.06), h / 2, sz * (l / 2 - 0.06)); for (const y of [0.06, h - 0.06]) box(D, 'iron', 0.18, 0.12, 0.17, sx * (w / 2 - 0.08), y, sz * (l / 2 - 0.08)); }
  for (const sx of [-1, 1]) for (const y of [0.08, h - 0.08]) box(D, 'iron', 0.1, 0.13, l - 0.2, sx * (w / 2 - 0.05), y, 0);
  for (const sz of [-1, 1]) for (const y of [0.08, h - 0.08]) box(D, 'iron', w - 0.2, 0.13, 0.1, 0, y, sz * (l / 2 - 0.05));
  for (const x of open ? [-0.95, -0.3] : [-0.95, -0.3, 0.3, 0.95]) { rod(D, 'iron', x, 0.15, l / 2 + 0.01, x, h - 0.15, l / 2 + 0.01, 0.022, 6); box(D, 'iron', 0.05, 0.05, 0.12, x + 0.06, h * 0.45, l / 2 + 0.06); }
  D.code.push(new THREE.PlaneGeometry(0.9, 0.45).translate(-0.62, h - 0.5, l / 2 - 0.02)); return D; }
function buildBarge(b, P, g) { const L = 28, W = 7.6, D = 2.7, cw = 2.25, hs = -10, he = 7, Z0 = 8.9, Z1 = 12.4, hw = 2.3, H = 2.35, wl = b.wl ?? WATER_Y, T = bag(), TP = bag(), TL = bag(), TR = bag();
  WLU.value = wl;
  // how it lies: the stern on the bank (its keel just in the ground), the bow down to the water, its deck just awash there, a slight list
  const gS = Math.max(...[0, -W / 2, W / 2].map(x => gAt(b, x, L / 2 - 1))), gB = Math.max(...[0, -W / 2, W / 2].map(x => gAt(b, x, -L / 2 + 1)));
  const dB = Math.max(wl + 0.12, gB + 0.3), tilt = Math.min(0.17, Math.max(0.035, Math.atan2(gS + D - 0.35 - dB, L))), roll = (b.seed % 2 < 1 ? 1 : -1) * 0.022, dMid = dB + L / 2 * Math.sin(tilt);
  const M = new THREE.Matrix4().makeTranslation(0, dMid, 0).multiply(new THREE.Matrix4().makeRotationZ(roll)).multiply(new THREE.Matrix4().makeRotationX(-tilt)), Mi = M.clone().invert();
  const at = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(M), N = new THREE.Vector3(0, 1, 0).transformDirection(M), deckY = (lx, lz) => dMid - (N.x * lx + N.z * lz) / N.y, v = new THREE.Vector3();
  const colAt = (x0, z0, x1, z1, r, top = 1.1) => { const p = at(x0, 0, z0), q = at(x1, 0, z1); collideRun(b, p.x, p.z, q.x, q.z, r, (lx, lz) => deckY(lx, lz) + top); };
  // the hull (barge frame: the deck at y 0, the bow at -z): riveted sides with a spoon bow raked up from the keel and a counter
  // stern, a low bulwark, a rubbing strake and a wale, the deck plates; rust holes and a gash; her name aft on both sides and the stern
  const prof = new THREE.Shape([[L / 2, 0.32], [L / 2, -0.9], [L / 2 - 1.6, -D], [-L / 2 + 3, -D], [-L / 2, -0.45], [-L / 2, 0.32]].map(([z, y]) => new THREE.Vector2(-z, y)));
  for (const s of [-1, 1]) T.rust.push(new THREE.ExtrudeGeometry(prof, { depth: 0.08, bevelEnabled: false }).rotateY(Math.PI / 2).translate(s * W / 2 - 0.04, 0, 0));
  box(T, 'rust', W, 0.08, L - 4.6, 0, -D, 0.7);
  { const l = Math.hypot(3, D - 0.45); box(T, 'rust', W, 0.08, l, 0, (-0.45 - D) / 2, -L / 2 + 1.5, 0, Math.asin((D - 0.45) / l)); }
  { const l = Math.hypot(1.6, D - 0.9); box(T, 'rust', W, 0.08, l, 0, (-0.9 - D) / 2, L / 2 - 0.8, 0, -Math.asin((D - 0.9) / l)); }
  box(T, 'rust', W, 0.45, 0.08, 0, -0.225, -L / 2); for (const s of [-1, 1]) box(T, 'rust', W / 2 - 0.75, 0.32, 0.08, s * (W / 4 + 0.375), 0.16, -L / 2); // (the bow's bulwark open in the middle: the gangplank's way)
  box(T, 'rust', W, 1.22, 0.08, 0, -0.29, L / 2);
  box(TP, 'iron', W - 0.1, 0.06, hs + L / 2, 0, -0.03, (hs - L / 2) / 2); box(TP, 'iron', W - 0.1, 0.06, L / 2 - he, 0, -0.03, (he + L / 2) / 2);
  for (const s of [-1, 1]) { box(TP, 'iron', W / 2 - cw - 0.05, 0.06, he - hs, s * (W / 2 + cw) / 2, -0.03, (hs + he) / 2);
    box(TP, 'iron', 0.2, 0.05, L + 0.05, s * W / 2, 0.345, 0); box(T, 'rust', 0.14, 0.2, L - 1.2, s * (W / 2 + 0.1), -0.32, 0.4); box(T, 'rust', 0.12, 0.16, L - 4, s * (W / 2 + 0.09), -1.25, 1.2);
    T.name.push(new THREE.PlaneGeometry(3.2, 1.0).rotateY(s * Math.PI / 2).translate(s * (W / 2 + 0.05), -0.75, 7.5)); }
  box(TP, 'iron', W, 0.05, 0.2, 0, 0.345, L / 2); T.name.push(new THREE.PlaneGeometry(3.4, 1.06).translate(0, -0.42, L / 2 + 0.05));
  for (const [s, z, y, r, sx] of [[-1, -6.2, -0.95, 0.34, 1.3], [1, 3.4, -1.55, 0.2, 1], [-1, 9.5, -0.5, 0.13, 1], [1, -9.2, -1.05, 0.55, 1.9], [1, 10.8, -0.65, 0.16, 1.2], [-1, 2.6, -1.8, 0.24, 1.4]]) {
    const c = new THREE.CircleGeometry(r, 10), p = c.attributes.position; for (let i = 1; i < p.count; i++) { const f = 0.65 + R() * 0.55; p.setXY(i, p.getX(i) * f * sx, p.getY(i) * f); }
    T.hole.push(c.rotateY(s * Math.PI / 2).translate(s * (W / 2 + 0.046), y, z)); }
  // old tyres hung on ropes along her sides for fenders
  for (const [s, z] of [[-1, -3.5], [-1, 2.0], [-1, 11.2], [1, -1.0], [1, 4.6], [1, 11.6]]) { T.rubber.push(new THREE.TorusGeometry(0.32, 0.12, 6, 14).rotateY(Math.PI / 2).translate(s * (W / 2 + 0.17), -0.62, z)); rod(TP, 'beam', s * (W / 2 + 0.04), 0.34, z, s * (W / 2 + 0.17), -0.28, z, 0.018, 4); }
  // rails on stanchions along her sides and across the stern and the bow's corners: a few gone, one bent
  const rail = (x0, z0, x1, z1, gone, bent) => { bar(TP, 'iron', x0, 0.34, z0, x0, 1.05, z0, 0.05); if (gone) return;
    if (bent) { const xm = (x0 + x1) / 2 + Math.sign(x0 || 1) * 0.18, zm = (z0 + z1) / 2; bar(TP, 'iron', x0, 1.05, z0, xm, 0.55, zm, 0.04); bar(TP, 'iron', xm, 0.55, zm, x1, 1.05, z1, 0.04); } else bar(TP, 'iron', x0, 1.05, z0, x1, 1.05, z1, 0.045);
    bar(TP, 'iron', x0, 0.7, z0, x1, 0.7, z1, 0.035); };
  for (const s of [-1, 1]) { const x = s * (W / 2 - 0.1); for (let z = -L / 2 + 0.1; z < L / 2 - 0.2; z += 1.5) rail(x, z, x, Math.min(z + 1.5, L / 2 - 0.1), R() < 0.1, R() < 0.06); rail(x, L / 2 - 0.1, x, L / 2 - 0.1, true);
    for (let x0 = s * (W / 2 - 0.1); Math.abs(x0) > 0.9; x0 -= s * 1.45) rail(x0, -L / 2 + 0.1, x0 - s * Math.min(1.45, Math.abs(x0) - 0.85), -L / 2 + 0.1, false, false); rail(s * 0.85, -L / 2 + 0.1, 0, 0, true); }
  for (let x = -W / 2 + 0.1; x < W / 2 - 0.2; x += 1.25) rail(x, L / 2 - 0.1, Math.min(x + 1.25, W / 2 - 0.1), L / 2 - 0.1, false, false);
  // double bitts at the bow and the stern
  for (const s of [-1, 1]) for (const z of [-L / 2 + 1.1, L / 2 - 0.9]) { const x = s * (W / 2 - 0.6); box(T, 'rust', 0.36, 0.06, 1.0, x, 0.03, z);
    for (const d of [-0.3, 0.3]) { T.rust.push(new THREE.CylinderGeometry(0.13, 0.14, 0.5, 10).translate(x, 0.28, z + d)); T.rust.push(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 10).translate(x, 0.55, z + d)); } colAt(x, z - 0.3, x, z + 0.3, 0.2); }
  // the hold: a coaming round it (brackets outside), the tank top far below, a ladder down; four hatch covers on the coaming, the
  // second lifted and stacked askew on the first (the hold open under the derrick's hook), a container on the last two
  const hh = D - 0.25 + 0.9, hy = (0.9 - D + 0.25) / 2;
  for (const s of [-1, 1]) { box(T, 'green', 0.08, hh, he - hs, s * cw, hy, (hs + he) / 2); box(T, 'green', 0.22, 0.05, he - hs + 0.2, s * (cw + 0.05), 0.92, (hs + he) / 2);
    for (let z = hs + 0.7; z < he; z += 1.4) box(T, 'green', 0.22, 0.55, 0.04, s * (cw + 0.12), 0.3, z); colAt(s * (cw + 0.05), hs - 0.05, s * (cw + 0.05), he + 0.05, 0.15, 1.0); }
  for (const z of [hs, he]) { box(T, 'green', 2 * cw, hh, 0.08, 0, hy, z); box(T, 'green', 2 * cw + 0.2, 0.05, 0.22, 0, 0.92, z); colAt(-cw, z, cw, z, 0.15, 1.0); }
  const cover = (zc, dx = 0, dy = 0, ry = 0) => { const C = bag(), hf = cw + 0.18;
    for (const s of [-1, 1]) { box(C, 'green', hf, 0.1, 4.15, s * hf / 2, 1.06, 0, 0, 0, -s * 0.05); for (const z of [-1.55, -0.52, 0.52, 1.55]) box(C, 'green', hf - 0.05, 0.07, 0.08, s * hf / 2, 1.14, z, 0, 0, -s * 0.05); box(C, 'green', 0.05, 0.24, 4.15, s * hf, 0.92, 0); }
    for (const z of [-2.05, 2.05]) box(C, 'green', 2 * hf, 0.24, 0.05, 0, 0.98, z); for (const q of C.green) T.green.push(q.rotateY(ry).translate(dx, dy, zc)); };
  const slot = (k) => hs + 2.125 + 4.25 * k; cover(slot(0)); cover(slot(0) + 0.3, 0.22, 0.3, 0.07); cover(slot(2)); cover(slot(3));
  { const C = container('contB', false), m = new THREE.Matrix4().makeTranslation(0.3, 1.12, slot(2) + 2.125).multiply(new THREE.Matrix4().makeRotationY(0.06)); for (const k in C) for (const q of C[k]) (k === 'iron' ? TP : T)[k].push(q.applyMatrix4(m)); }
  box(TP, 'iron', 2 * cw - 0.1, 0.05, he - hs - 0.1, 0, -D + 0.25, (hs + he) / 2);
  for (const d of [-0.22, 0.22]) bar(TP, 'iron', -cw + 0.12, -D + 0.27, -4.6 + d, -cw + 0.12, 0.95, -4.6 + d, 0.045); for (let y = -D + 0.5; y < 0.9; y += 0.3) bar(TP, 'iron', -cw + 0.12, y, -4.82, -cw + 0.12, y, -4.38, 0.03);
  for (const [x, z, ry] of [[0.9, -2.3, 0.2], [1.6, -2.5, -0.3], [1.2, -2.0, 1.4], [0.3, -2.4, 0.9], [1.4, -2.3, 0.1]]) T.sack.push(new THREE.SphereGeometry(0.4, 8, 6).scale(0.95, 0.36, 0.6).rotateY(ry).translate(x, -D + 0.45 + (ry > 1 ? 0.28 : 0), z));
  for (const [x, z, a] of [[-1.2, -3.0, 0.4], [-0.3, -4.9, 1.2]]) TP.paint.push(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14).rotateZ(Math.PI / 2).rotateY(a).translate(x, -D + 0.56, z));
  { const p = at(0, -D + 0.28, hs), q = at(0, 0, (hs + he) / 2); if (wl > p.y + 0.05) TL.water.push(new THREE.PlaneGeometry(2 * cw - 0.1, (he - hs) * Math.cos(tilt) - 0.1).rotateX(-Math.PI / 2).translate(q.x, wl, q.z)); } // (flooded to the water outside)
  // the derrick at the hold's head: a mast with a crosstree and its lantern, a boom out over the open hatch, the hook down it; a
  // winch at its foot, stays to the bow and the sides; the anchor windlass on the foredeck, its chain out of the hawse into the water
  const mz = -10.75, tip = [0.55, 5.4, -3.6];
  T.cream.push(new THREE.CylinderGeometry(0.12, 0.18, 7.8, 10).translate(0, 3.9, mz)); box(T, 'green', 0.7, 0.4, 0.7, 0, 0.2, mz); box(T, 'cream', 1.8, 0.1, 0.1, 0, 6.6, mz);
  rod(T, 'cream', 0, 1.5, mz + 0.2, ...tip, 0.11); rod(TP, 'iron', 0, 7.7, mz, ...tip, 0.02, 4); rod(TP, 'iron', ...tip, tip[0], 0.6, tip[2], 0.016, 4);
  box(TP, 'paint', 0.22, 0.38, 0.16, tip[0], 0.45, tip[2]); TP.iron.push(new THREE.TorusGeometry(0.1, 0.025, 5, 10, 4.2).translate(tip[0], 0.14, tip[2]));
  for (const s of [-1, 1]) { rod(TP, 'iron', 0, 7.6, mz, s * (W / 2 - 0.15), 0.36, -L / 2 + 0.6, 0.014, 4); rod(TP, 'iron', 0, 7.0, mz, s * (W / 2 - 0.15), 0.36, mz + 0.4, 0.014, 4); }
  T.green.push(new THREE.CylinderGeometry(0.2, 0.2, 0.7, 12).rotateZ(Math.PI / 2).translate(0, 0.5, mz - 0.6)); for (const s of [-1, 1]) box(T, 'green', 0.06, 0.6, 0.5, s * 0.4, 0.3, mz - 0.6);
  colAt(0, mz - 0.7, 0, mz, 0.2); lantern(TP, 0.8, 6.25, mz); rod(TP, 'iron', 0.8, 6.55, mz, 0.8, 6.46, mz, 0.008, 4);
  { const x = -1.6, z = -12.4; box(T, 'green', 1.1, 0.14, 0.7, x, 0.07, z); for (const d of [-0.45, 0.45]) box(T, 'green', 0.08, 0.7, 0.6, x + d, 0.42, z);
    T.rust.push(new THREE.CylinderGeometry(0.17, 0.17, 0.82, 12).rotateZ(Math.PI / 2).translate(x, 0.5, z)); T.rust.push(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 7).rotateZ(Math.PI / 2).translate(x - 0.25, 0.5, z)); colAt(x - 0.5, z, x + 0.5, z, 0.2);
    chain(TP, 'iron', new THREE.Vector3(x - 0.25, 0.2, z - 0.3), new THREE.Vector3(-2.3, 0.08, -L / 2 + 0.3), 0); TP.iron.push(new THREE.TorusGeometry(0.2, 0.06, 6, 12).translate(-2.3, -0.12, -L / 2 - 0.05));
    const e = at(-2.3, -0.15, -L / 2 - 0.06), f = [e.x - 0.5, e.z - 3.2]; chain(P, 'iron', e, new THREE.Vector3(f[0], gAt(b, ...f) + 0.06, f[1]), 0.35); }
  // the deckhouse aft: windows round it (two broken), a door at its front standing open (its room left bare: another pass furnishes
  // the interiors); on its roof a rail, a mast with a lamp, a searchlight, a horn and the stove's pipe
  const wallB = (x0, z0, x1, z1, holes) => { const l = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / l, uz = (z1 - z0) / l, al = Math.abs(ux) > 0.5;
    const piece = (s0, s1, y0, y1) => { if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return; const c = (s0 + s1) / 2; box(T, 'cream', al ? s1 - s0 : 0.1, y1 - y0, al ? 0.1 : s1 - s0, x0 + ux * c, (y0 + y1) / 2, z0 + uz * c); };
    let s = 0; for (const o of holes) { const a = l / 2 + o.c - o.w / 2, e = l / 2 + o.c + o.w / 2; piece(s, a, 0, H); piece(a, e, 0, o.y0); piece(a, e, o.y1, H); s = e;
      if (o.y0 > 0) { const cx = x0 + ux * (a + e) / 2, cz = z0 + uz * (a + e) / 2, sx = al ? o.w : 0.04, sz = al ? 0.04 : o.w;
        if (!o.broken) box(TP, 'glass', sx, o.y1 - o.y0, sz, cx, (o.y0 + o.y1) / 2, cz); else for (let k = 0; k < 3; k++) box(TP, 'glass', al ? 0.16 + R() * 0.2 : 0.03, 0.1 + R() * 0.25, al ? 0.03 : 0.16 + R() * 0.2, cx + ux * (k - 1) * o.w * 0.32, o.y0 + 0.12 + R() * 0.1, cz + uz * (k - 1) * o.w * 0.32, 0, al ? 0 : R() * 0.6, al ? R() * 0.6 : 0);
        for (const y of [o.y0, o.y1]) box(TP, 'iron', al ? o.w + 0.06 : 0.14, 0.05, al ? 0.14 : o.w + 0.06, cx, y, cz); for (const d of [-1, 1]) box(TP, 'iron', al ? 0.05 : 0.14, o.y1 - o.y0, al ? 0.14 : 0.05, cx + ux * d * o.w / 2, (o.y0 + o.y1) / 2, cz + uz * d * o.w / 2); } }
    piece(s, l, 0, H); };
  const wn = (c, w = 0.9, broken = false) => ({ c, w, y0: 1.05, y1: 1.85, broken });
  wallB(-hw, Z0, hw, Z0, [wn(-1.45), wn(-0.3, 0.9, true), { c: 1.35, w: 1.0, y0: 0, y1: 2.05 }]); wallB(-hw, Z1, hw, Z1, [wn(-1.0, 0.8), wn(1.0, 0.8)]);
  wallB(-hw, Z0, -hw, Z1, [wn(-0.9, 0.85), wn(0.9, 0.85, true)]); wallB(hw, Z0, hw, Z1, [wn(-0.9, 0.85), wn(0.9, 0.85)]);
  box(T, 'cream', 0.05, 2.02, 0.98, 1.9, 1.02, Z0 - 0.5, 0.1); for (const y of [0.4, 1.0, 1.6]) box(TP, 'iron', 0.03, 0.05, 0.25, 1.88, y, Z0 - 0.12); colAt(1.9, Z0 - 0.15, 1.95, Z0 - 0.95, 0.1);
  colAt(-hw, Z0, 0.85, Z0, 0.15, H); colAt(1.85, Z0, hw, Z0, 0.15, H); colAt(-hw, Z1, hw, Z1, 0.15, H); for (const s of [-1, 1]) colAt(s * hw, Z0, s * hw, Z1, 0.15, H);
  deckhouseRoom(b, M, colAt, hw, Z0, Z1, H); // (polish: its room in scanned props, with the interiors)
  lantern(TP, 0.55, 2.0, Z0 - 0.3); box(TP, 'iron', 0.03, 0.03, 0.32, 0.55, 2.24, Z0 - 0.16); T.buoy.push(new THREE.TorusGeometry(0.3, 0.07, 8, 18).rotateY(Math.PI / 2).translate(hw + 0.1, 1.45, (Z0 + Z1) / 2));
  box(TR, 'iron', 2 * hw + 0.3, 0.1, Z1 - Z0 + 0.3, 0, H + 0.05, (Z0 + Z1) / 2); box(T, 'cream', 2 * hw + 0.34, 0.12, 0.05, 0, H - 0.02, Z0 - 0.15); // the roof (lifts off with the cutaway) and its drip edge
  for (const [x0, z0, x1, z1] of [[-hw, Z0, hw, Z0], [-hw, Z1, hw, Z1], [-hw, Z0, -hw, Z1], [hw, Z0, hw, Z1]]) { bar(TP, 'iron', x0, H + 0.9, z0, x1, H + 0.9, z1, 0.04); for (let f = 0; f <= 1.001; f += 1 / 3) bar(TP, 'iron', x0 + (x1 - x0) * f, H + 0.1, z0 + (z1 - z0) * f, x0 + (x1 - x0) * f, H + 0.9, z0 + (z1 - z0) * f, 0.04); }
  rod(TP, 'iron', 1.5, H + 0.1, Z1 - 0.6, 1.5, H + 2.3, Z1 - 0.6, 0.045, 6); box(TP, 'iron', 0.9, 0.05, 0.05, 1.5, H + 1.9, Z1 - 0.6); TP.glow.push(new THREE.SphereGeometry(0.09, 8, 6).translate(1.5, H + 2.38, Z1 - 0.6));
  T.cream.push(new THREE.CylinderGeometry(0.17, 0.14, 0.34, 12).rotateX(Math.PI / 2).translate(-1.4, H + 0.42, Z0 + 0.4)); TP.glass.push(new THREE.CircleGeometry(0.15, 12).rotateY(Math.PI).translate(-1.4, H + 0.42, Z0 + 0.22)); rod(TP, 'iron', -1.4, H + 0.1, Z0 + 0.4, -1.4, H + 0.26, Z0 + 0.4, 0.04, 6);
  T.cream.push(new THREE.ConeGeometry(0.12, 0.4, 10).rotateX(-Math.PI / 2).translate(0.4, H + 0.3, Z0 + 0.35)); rod(TP, 'iron', -1.7, H + 0.1, Z1 - 0.5, -1.7, H + 1.0, Z1 - 0.5, 0.08, 8); TP.iron.push(new THREE.ConeGeometry(0.16, 0.12, 8).translate(-1.7, H + 1.08, Z1 - 0.5));
  // the guarded crate on the foredeck, beside the derrick
  { const c = at(1.9, 0, -11.6); cache(b, g, c.x, c.z, b.place, { k: 3, y: deckY(c.x, c.z) }); }
  // a gangplank up onto the sunk bow from the shallows (lying a little way along the deck first)
  const p = at(0, 0.05, -L / 2 + 0.05), gq = new THREE.Vector3(p.x, 0, p.z - 2.4); gq.y = Math.min(p.y - 0.15, gAt(b, gq.x, gq.z) + 0.06);
  { const len = p.distanceTo(gq), c = p.clone().add(gq).multiplyScalar(0.5), rx = -Math.asin((p.y - gq.y) / len);
    for (const d of [-0.29, 0.29]) { box(P, 'planks', 0.56, 0.06, len, p.x + d, c.y, c.z, 0, rx); box(TP, 'planks', 0.56, 0.06, 0.6, d, 0.03, -L / 2 + 0.35); }
    for (let s = 0.25; s < len - 0.15; s += 0.4) { const f = s / len; box(P, 'beam', 1.15, 0.04, 0.06, p.x, gq.y + (p.y - gq.y) * f + 0.05, gq.z + (p.z - gq.z) * f, 0, rx); } }
  surface(b, (lx, lz) => { if (Math.abs(lx - p.x) <= 0.6 && lz >= gq.z && lz <= p.z) return gq.y + 0.03 + (p.y - gq.y) * (lz - gq.z) / (p.z - gq.z);
    const B = v.set(lx, deckY(lx, lz), lz).applyMatrix4(Mi); if (Math.abs(B.x) > W / 2 - 0.2 || B.z < -L / 2 + 0.06 || B.z > L / 2 - 0.2 || (Math.abs(B.x) < cw + 0.06 && B.z > hs - 0.06 && B.z < he + 0.06)) return null; return deckY(lx, lz); });
  // the hull is solid along its gunwale (a player climbs it from the shallows where it is low), open at the bow for the gangplank
  for (const s of [-1, 1]) { colAt(s * W / 2, -L / 2, s * W / 2, L / 2, 0.28, 0.32); colAt(s * W / 2, -L / 2, s * 0.85, -L / 2, 0.28, 0.32); } colAt(-W / 2, L / 2, W / 2, L / 2, 0.28, 0.32);
  b.roofBox = { cz: at(0, 0, (Z0 + Z1) / 2).z, w: 2 * hw, d: Z1 - Z0 }; b.h = at(0, H, (Z0 + Z1) / 2).y - b.y;
  // overboard: a container sunk to its knees in the shallows, leaning, off the port bow, one door open and its cargo spilled; drums, crates and
  // sacks lost round the bow, planks afloat, the second crate in the shallows to starboard; her stern moored by a chain to a stake
  { const o = at(-W / 2 - 3.2, 0, -4.4), yaw = Math.PI + 0.3, cy = gAt(b, o.x, o.z) - 0.6, C = container('contR', true);
    const m = new THREE.Matrix4().makeTranslation(o.x, cy, o.z).multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(new THREE.Matrix4().makeRotationX(0.07)).multiply(new THREE.Matrix4().makeRotationZ(0.13));
    for (const k in C) for (const q of C[k]) (k === 'iron' ? P : TL)[k].push(q.applyMatrix4(m));
    const ax = Math.sin(yaw), az = Math.cos(yaw); collideRun(b, o.x - ax * 2.4, o.z - az * 2.4, o.x + ax * 2.4, o.z + az * 2.4, 1.15, () => cy + 2.5);
    for (const [d, s, k] of [[3.6, 0.4, 'planks'], [4.4, -0.6, 'planks'], [5.3, 0.3, 'sack'], [4.0, 1.1, 'sack'], [6.0, -0.5, 'planks']]) { const x = o.x + ax * d + az * s, z = o.z + az * d - ax * s, y = gAt(b, x, z);
      if (k === 'sack') TL.sack.push(new THREE.SphereGeometry(0.4, 8, 6).scale(0.95, 0.36, 0.6).rotateY(R() * 3).translate(x, y + 0.1, z)); else { box(P, 'planks', 0.7, 0.55, 0.6, x, y + 0.12, z, R() * 3, (R() - 0.5) * 0.4, (R() - 0.5) * 0.4); collideRun(b, x, z, x, z, 0.4, () => y + 0.4); } } }
  for (const [bx, bz, lying, k] of [[-W / 2 - 1.2, -9.6, 1, 'paint'], [-W / 2 - 0.8, -12.6, 0, 'iron'], [W / 2 + 1.2, -12.4, 1, 'paint'], [-1.6, -L / 2 - 2.6, 1, 'iron'], [W / 2 + 1.0, -6.4, 0, 'paint'], [-W / 2 - 5.6, -0.6, 1, 'paint'], [2.2, -L / 2 - 1.8, 0, 'paint']]) {
    const c = at(bx, 0, bz), y = gAt(b, c.x, c.z), a = R() * 6.283, d = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14);
    P[k].push(lying ? d.rotateZ(Math.PI / 2).rotateY(a).translate(c.x, y + 0.2, c.z) : d.rotateX((R() - 0.5) * 0.3).translate(c.x, y + 0.3, c.z)); collideRun(b, c.x, c.z, c.x, c.z, lying ? 0.4 : 0.3, () => y + (lying ? 0.45 : 0.72)); }
  if (wl > gB) for (const [bx, bz, l, a] of [[1.4, -L / 2 - 3.6, 2.2, 0.4], [-3.4, -L / 2 - 1.2, 1.6, 1.9], [W / 2 + 2.8, -11.0, 1.8, 2.6], [-W / 2 - 1.6, -8.0, 2.4, 0.9]]) { const c = at(bx, 0, bz); box(P, 'planks', 0.22, 0.05, l, c.x, Math.max(wl, gAt(b, c.x, c.z) + 0.03), c.z, a); }
  { const c = at(W / 2 + 2.4, 0, -L / 2 + 4.6); cache(b, g, c.x, c.z, null, { k: 2 }); }
  { const p0 = at(-(W / 2 - 0.6), 0.56, L / 2 - 0.6), e = at(-W / 2 - 0.05, 0.36, L / 2 - 0.4), sx = e.x - 4.2, sz = e.z + 3.4, sy = gAt(b, sx, sz);
    chain(P, 'iron', p0, e, 0); chain(P, 'iron', e, new THREE.Vector3(sx, sy + 1.05, sz), 0.6); box(TL, 'rust', 0.3, 2.0, 0.3, sx, sy + 0.2, sz, 0.3, 0.12, 0.08); collideRun(b, sx, sz, sx, sz, 0.2); }
  bake(b, [[T, M], [TL, null]]); share(TP, M, P); share(TR, M, b.PR); }

// the hermit's yard (polish): a stone chimney up his shack's gable with smoke drifting off it, a fenced vegetable patch, his nets
// drying on frames, a rain barrel under the eave's gutter, a woodpile under a lean-to with the chopping block, lanterns by his
// door and at the jetty's end, and his rowboat tied alongside the jetty (the trees round the yard are props: src/plan.js)
let PUFF = null;
export function smoke(b, x, y, z) { PUFF ||= canvasTex(64, 64, (c) => { const gr = c.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); }, '#ffffff');
  const n = 12, ps = [], drift = R() * 6.283; for (let i = 0; i < n; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: PUFF, color: 0x8e8b86, transparent: true, depthWrite: false, opacity: 0 })); s.position.set(x, y, z); b.group.add(s); ps.push(s); }
  ps[0].onBeforeRender = () => { const t = performance.now() / 1000; ps.forEach((s, i) => { const f = (t * 0.1 + i / n) % 1; // (each puff rises, swells and fades, the wind leaning it over)
    s.position.set(x + Math.cos(drift) * f * f * 3.5 + Math.sin(t * 0.7 + i) * 0.12, y + f * 5, z + Math.sin(drift) * f * f * 3.5); s.scale.setScalar(0.6 + f * 3.2); s.material.opacity = 0.6 * Math.min(1, f * 6) * (1 - f); }); }; }
function boatParts() { const Lb = 3.7, B = 1.3, Dp = 0.5, out = bag(), half = (f) => B / 2 * (f < 0.62 ? Math.pow(Math.sin(f / 0.62 * Math.PI / 2), 0.75) : 1 - 0.28 * ((f - 0.62) / 0.38) ** 2);
  const sheer = (f) => 0.2 * (1 - f) ** 3 + 0.05 * f * f, dep = (f) => Dp * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, f * 1.1))), sec = (f, th) => [-half(f) * Math.cos(th), sheer(f) - dep(f) * Math.pow(Math.sin(th), 0.6)];
  const g = new THREE.PlaneGeometry(1, 1, 18, 8), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const f = p.getX(i) + 0.5, [x, y] = sec(f, (p.getY(i) + 0.5) * Math.PI); p.setXYZ(i, x, y, (f - 0.5) * Lb); }
  g.computeVertexNormals(); out.ceil.push(g); const sh = new THREE.Shape(); for (let k = 0; k <= 10; k++) { const [x, y] = sec(1, k / 10 * Math.PI); k ? sh.lineTo(x, y) : sh.moveTo(x, y); } out.ceil.push(new THREE.ShapeGeometry(sh).translate(0, 0, Lb / 2));
  for (const s of [-1, 1]) for (let k = 0; k < 8; k++) { const f0 = k / 8, f1 = (k + 1) / 8; bar(out, 'beam', s * half(f0), sheer(f0) + 0.02, (f0 - 0.5) * Lb, s * half(f1), sheer(f1) + 0.02, (f1 - 0.5) * Lb, 0.05); }
  for (const f of [0.38, 0.72]) box(out, 'planks', 2 * half(f) - 0.08, 0.04, 0.24, 0, sheer(f) - 0.16, (f - 0.5) * Lb);
  for (const s of [-1, 1]) { rod(out, 'beam', s * 0.2, sheer(0.5) - 0.1, -1.3, s * 0.3, sheer(0.5) - 0.12, 1.0, 0.024, 6); box(out, 'planks', 0.14, 0.012, 0.5, s * 0.31, sheer(0.5) - 0.12, 1.25, 0.05); }
  out.bow = [0, sheer(0) + 0.02, -Lb / 2]; return out; }
function hermitYard(b, P) { const T = bag(), t = b.t || 0.45, hw = b.w / 2 + t / 2, hd = b.d / 2 + t / 2, gy = (x, z) => gAt(b, x, z), rh = Math.min(2, b.d * 0.32);
  // the chimney up the left gable (clear of the roof's overhang), its smoke
  { const x = -hw - 0.72, z = 0.5, y0 = gy(x, z) - 0.3, top = b.y + b.h + rh + 0.55;
    box(P, 'wall', 1.2, b.y + 2.1 - y0, 1.0, x + 0.12, (y0 + b.y + 2.1) / 2, z); box(P, 'wall', 0.62, top - b.y - 1.9, 0.62, x, (b.y + 1.9 + top) / 2, z); box(P, 'wall', 0.78, 0.1, 0.78, x, top + 0.05, z);
    P.brick.push(new THREE.CylinderGeometry(0.11, 0.13, 0.32, 8).translate(x, top + 0.26, z)); collideRun(b, x + 0.1, z, x + 0.1, z, 0.62); smoke(b, x, top + 0.55, z); }
  // the vegetable patch: a raised bed edged in boards, four mounded rows (cabbages, leeks, beans up poles), a picket fence round it
  // with its gate toward the shack standing ajar
  { const x0 = hw + 0.75, x1 = x0 + 3.4, z0 = -1.9, z1 = 2.1, cz = (z0 + z1) / 2, ys = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([a, c]) => gy(a, c)), lo = Math.min(...ys), hi = Math.max(...ys), top = hi + 0.12;
    box(T, 'soil', x1 - x0 - 0.1, top - lo + 0.25, z1 - z0 - 0.1, (x0 + x1) / 2, (top + lo - 0.25) / 2, cz);
    for (const [sx, sz, x, z] of [[x1 - x0, 0.05, (x0 + x1) / 2, z0], [x1 - x0, 0.05, (x0 + x1) / 2, z1], [0.05, z1 - z0, x0, cz], [0.05, z1 - z0, x1, cz]]) box(P, 'planks', sx, top - lo + 0.32, sz, x, (top + lo - 0.2) / 2 + 0.04, z);
    for (let r = 0; r < 4; r++) { const x = x0 + 0.47 + r * 0.82; T.soil.push(new THREE.CylinderGeometry(0.24, 0.24, z1 - z0 - 0.4, 8, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).scale(1, 0.45, 1).translate(x, top, cz));
      for (let z = z0 + 0.45; z < z1 - 0.3; z += r < 2 ? 0.52 : 0.4) { const y = top + 0.08;
        if (r < 2) { T.cab.push(new THREE.SphereGeometry(0.16, 8, 6).scale(1, 0.82, 1).translate(x, y + 0.06, z)); for (let k = 0; k < 4; k++) { const a = k * 1.571 + R(); T.leaf.push(new THREE.CircleGeometry(0.15, 6).rotateX(-1.1).rotateY(a).translate(x + Math.sin(a) * 0.14, y + 0.04, z + Math.cos(a) * 0.14)); } }
        else if (r === 2) for (let k = 0; k < 3; k++) T.leaf.push(new THREE.ConeGeometry(0.022, 0.42, 4).translate(0, 0.21, 0).rotateZ((R() - 0.5) * 0.5).rotateX((R() - 0.5) * 0.5).translate(x + (k - 1) * 0.05, y - 0.02, z)); }
      if (r === 3) for (const z of [z0 + 0.9, z1 - 0.9]) { for (const [a, c] of [[0.28, 0.28], [-0.28, 0.28], [0.28, -0.28], [-0.28, -0.28]]) rod(P, 'beam', x + a, top - 0.05, z + c, x, top + 1.75, z, 0.018, 4);
        for (let k = 0; k < 12; k++) { const f = 0.15 + R() * 0.75, a = (k % 4) * 1.571 + 0.785; T.leaf.push(new THREE.IcosahedronGeometry(0.1 + R() * 0.04, 0).translate(x + Math.cos(a) * 0.4 * (1 - f), top + f * 1.7, z + Math.sin(a) * 0.4 * (1 - f))); } } }
    const fx0 = x0 - 0.4, fx1 = x1 + 0.4, fz0 = z0 - 0.4, fz1 = z1 + 0.4;
    for (const [ax, az, bx, bz] of [[fx0, fz0, fx1, fz0], [fx1, fz0, fx1, fz1], [fx1, fz1, fx0, fz1], [fx0, fz1, fx0, 0.9], [fx0, -0.25, fx0, fz0]]) { const l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l / 1.2)), al = Math.abs(bx - ax) > 0.01;
      for (let k = 0; k <= n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n; box(P, 'beam', 0.09, 1.1, 0.09, x, gy(x, z) + 0.45, z); }
      for (const h of [0.35, 0.8]) bar(P, 'planks', ax, gy(ax, az) + h, az, bx, gy(bx, bz) + h, bz, 0.05);
      for (let s = 0.12; s < l - 0.06; s += 0.16) { const x = ax + (bx - ax) * s / l, z = az + (bz - az) * s / l; box(P, 'planks', al ? 0.08 : 0.025, 0.9, al ? 0.025 : 0.08, x + (al ? 0 : 0.04), gy(x, z) + 0.42, z + (al ? 0.04 : 0)); }
      collideRun(b, ax, az, bx, bz, 0.12); }
    box(P, 'planks', 0.04, 0.85, 1.1, fx0 - 0.5, gy(fx0 - 0.5, 0) + 0.45, -0.02, 1.15); }
  // nets drying on two frames toward the water, a heap of net at the foot of one
  for (const [ax, az, bx, bz] of [[-hw - 1.0, -hd - 1.7, -hw - 3.6, -hd - 1.5], [-hw - 2.6, -0.9, -hw - 4.1, -2.9]]) { const ya = gy(ax, az), yb = gy(bx, bz), l = Math.hypot(bx - ax, bz - az);
    rod(P, 'beam', ax, ya - 0.3, az, ax + 0.05, ya + 2.1, az, 0.06, 6); rod(P, 'beam', bx, yb - 0.3, bz, bx - 0.05, yb + 2.1, bz, 0.06, 6); rod(P, 'beam', ax, ya + 2.0, az, bx, yb + 2.0, bz, 0.04, 6);
    const net = new THREE.PlaneGeometry(l - 0.15, 1.75, 10, 6), p = net.attributes.position, uv = net.attributes.uv;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i) / (l - 0.15) + 0.5, f = 0.5 - p.getY(i) / 1.75; p.setZ(i, 0.16 * Math.sin(Math.PI * u) * f * f); p.setY(i, p.getY(i) - 0.18 * Math.sin(Math.PI * u) * f); uv.setXY(i, uv.getX(i) * l / 0.6, uv.getY(i) * 1.75 / 0.6); }
    T.net.push(net.rotateY(-Math.atan2(bz - az, bx - ax)).translate((ax + bx) / 2, (ya + yb) / 2 + 2.0 - 0.9, (az + bz) / 2));
    for (let s = 0.2; s < l - 0.1; s += 0.35) { const f = s / l; T.buoy.push(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 8).rotateZ(Math.PI / 2).rotateY(-Math.atan2(bz - az, bx - ax)).translate(ax + (bx - ax) * f, ya + (yb - ya) * f + 1.9, az + (bz - az) * f)); }
    collideRun(b, ax, az, ax, az, 0.12); collideRun(b, bx, bz, bx, bz, 0.12); }
  { const x = -hw - 3.0, z = -1.6; T.net.push(new THREE.IcosahedronGeometry(0.55, 1).scale(1.3, 0.32, 0.9).translate(x, gy(x, z) + 0.06, z)); }
  // the rain barrel under the gutter
  { const x = 1.95, z = -hd - 0.5, y = gy(x, z), prof = [[0, 0], [0.29, 0], [0.33, 0.25], [0.34, 0.47], [0.33, 0.7], [0.29, 0.95], [0.27, 0.95]].map(([r, h]) => new THREE.Vector2(r, h));
    P.planks.push(new THREE.LatheGeometry(prof, 14).translate(x, y, z)); for (const h of [0.12, 0.47, 0.83]) P.iron.push(new THREE.CylinderGeometry(0.343, 0.343, 0.04, 14, 1, true).translate(x, y + h, z));
    T.water.push(new THREE.CircleGeometry(0.28, 14).rotateX(-Math.PI / 2).translate(x, y + 0.86, z));
    const ye = b.y + b.h - 0.45 * rh / hd - 0.12, ze = -(hd + 0.45) + 0.06; P.iron.push(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 8, 1, true, 0, Math.PI).rotateZ(-Math.PI / 2).translate(x - 0.95, ye, ze));
    rod(P, 'iron', x, ye, ze, x, y + 1.05, z, 0.04, 6); collideRun(b, x, z, x, z, 0.38, () => y + 0.95); }
  // the woodpile against the back wall under a lean-to of boards, the chopping block with the axe in it
  { const z = hd + 0.38, x0 = -1.9, x1 = 0.9, yc = b.y + 1.5;
    for (let row = 0; row < 4; row++) for (let x = x0 + 0.12 + (row % 2) * 0.1; x < x1 - 0.1; x += 0.21) { const r = 0.085 + R() * 0.03; P.beam.push(new THREE.CylinderGeometry(r, r, 0.55, 7).rotateX(Math.PI / 2).rotateZ(R() * 0.5).translate(x, gy(x, z) + 0.1 + row * 0.19, z + (R() - 0.5) * 0.08)); }
    for (const x of [x0, x1]) { box(P, 'beam', 0.07, 1.0, 0.07, x, gy(x, z) + 0.4, z - 0.2); rod(P, 'beam', x, gy(x, z + 0.55) - 0.2, z + 0.55, x, yc - 0.12, z + 0.55, 0.045, 6); }
    box(P, 'planks', x1 - x0 + 0.5, 0.04, 1.08, (x0 + x1) / 2, yc, hd + 0.5, 0, 0.25); collideRun(b, x0, z, x1, z, 0.36, () => gy(0, z) + 0.85);
    const cx = 1.75, cz = hd + 0.95, cy = gy(cx, cz); P.beam.push(new THREE.CylinderGeometry(0.27, 0.3, 0.48, 10).translate(cx, cy + 0.2, cz)); rod(P, 'beam', cx - 0.05, cy + 0.48, cz, cx + 0.3, cy + 1.05, cz + 0.22, 0.022, 6); box(P, 'iron', 0.04, 0.12, 0.2, cx - 0.06, cy + 0.5, cz - 0.02, 0.6);
    for (let k = 0; k < 4; k++) box(P, 'beam', 0.09, 0.09, 0.5, cx + 0.5 + R() * 0.5, cy + 0.04, cz + (R() - 0.5) * 0.8, R() * 3); collideRun(b, cx, cz, cx, cz, 0.3, () => cy + 0.45); }
  // lanterns: on a bracket by the door, on a pole at the jetty's end
  { const x = -1.15, y = b.y + 2.05; box(P, 'iron', 0.03, 0.03, 0.34, x, y, -hd - 0.17); lantern(P, x, y - 0.22, -hd - 0.32); }
  { const jz = -b.d / 2 - 11.4, jy = b.jy(jz), x = 0.78; rod(P, 'beam', x, jy - 0.6, jz, x, jy + 1.65, jz, 0.06, 6); box(P, 'beam', 0.05, 0.05, 0.45, x, jy + 1.6, jz - 0.2); lantern(P, x, jy + 1.32, jz - 0.38); collideRun(b, x, jz, x, jz, 0.1); }
  // the rowboat, tied alongside the jetty by its painter
  { const bx = 1.95, bz = -b.d / 2 - 10.0, by = Math.max(WATER_Y + 0.32, gy(bx, bz) + 0.5), ry = Math.PI + 0.08, Bt = boatParts(), m = new THREE.Matrix4().makeTranslation(bx, by, bz).multiply(new THREE.Matrix4().makeRotationY(ry));
    for (const k of ['ceil', 'planks', 'beam']) for (const q of Bt[k]) P[k].push(q.applyMatrix4(m)); const bow = new THREE.Vector3(...Bt.bow).applyMatrix4(m), post = new THREE.Vector3(0.75, Math.max(gy(0.75, -b.d / 2 - 7), 0) + 0.58, -b.d / 2 - 7); // (the jetty's post ahead of her bow)
    for (let k = 0; k < 5; k++) { const f0 = k / 5, f1 = (k + 1) / 5, y = (f) => bow.y + (post.y - bow.y) * f - 0.25 * Math.sin(Math.PI * f); rod(P, 'planks', bow.x + (post.x - bow.x) * f0, y(f0), bow.z + (post.z - bow.z) * f0, bow.x + (post.x - bow.x) * f1, y(f1), bow.z + (post.z - bow.z) * f1, 0.016, 4); }
    collideRun(b, bx + Math.sin(ry) * 1.3, bz + Math.cos(ry) * 1.3, bx - Math.sin(ry) * 1.3, bz - Math.cos(ry) * 1.3, 0.55, () => by - 0.25); }
  bake(b, [[T, null]]); }

// the mushroom ring: seven giant caps in a ring, each 0.9 m higher than the last (a spiral stair you climb cap to cap, 1.5 m
// to 6.9 m), round a clearing where a spore cloud hangs; the rare loot is on the middle cap, a jump down from the top step.
// Slice 23 polish (Jared, November 14, 2026: the same scale and detail check as the plane; a critic: the ring and the stair did
// not read, a purple mass with no glow): the ring is its own species, not the Hollow's purple: dark caps flattened into treads
// whose rims and warts glow spore-green (each step's edge is lit), lime gills, roots and bracket fungi on the stems, an even gap
// between every two caps; a fairy ring of glowcaps round it; a column of spores turning over the clearing, seen from outside;
// a gold glow over the crate until it is searched
let SHROOM = null, RINGM = null;
function ringMats() { if (RINGM) return RINGM;
  const capTex = (glow) => canvasTex(512, 512, (x, w, h) => { const r = mulberry32(77), c = w / 2;
    if (glow) { x.fillStyle = '#000000'; x.fillRect(0, 0, w, h); }
    else { const g = x.createRadialGradient(c, c, 0, c, c, c); g.addColorStop(0, '#140f24'); g.addColorStop(0.5, '#1b2838'); g.addColorStop(0.84, '#234640'); g.addColorStop(1, '#16302c'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
    for (let i = 0; i < 120; i++) { const a = r() * TAU, d = Math.sqrt(r()) * c, px = c + Math.cos(a) * d, py = c + Math.sin(a) * d, s = 18 + r() * 40; if (glow) continue; // darker mottling
      const m = x.createRadialGradient(px, py, 0, px, py, s); m.addColorStop(0, 'rgba(4,8,14,0.3)'); m.addColorStop(1, 'rgba(4,8,14,0)'); x.fillStyle = m; x.fillRect(px - s, py - s, s * 2, s * 2); }
    // the rim's glowing band, the tread's edge (the cap's uv runs out from its crown: the rim is at about 0.9 of the radius)
    const band = x.createRadialGradient(c, c, c * 0.76, c, c, c); band.addColorStop(0, 'rgba(150,255,120,0)'); band.addColorStop(0.6, `rgba(176,255,140,${glow ? 1 : 0.6})`);
    band.addColorStop(0.8, `rgba(120,230,110,${glow ? 0.5 : 0.35})`); band.addColorStop(1, 'rgba(40,120,70,0)'); x.fillStyle = band; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { const a = r() * TAU, d = Math.pow(r(), 0.6) * c * 0.86, px = c + Math.cos(a) * d, py = c + Math.sin(a) * d, s = 1.5 + r() * r() * 11, al = 0.5 + r() * 0.5; // glowing warts, more toward the rim
      const m = x.createRadialGradient(px, py, 0, px, py, s); m.addColorStop(0, `rgba(214,255,176,${al})`); m.addColorStop(0.6, `rgba(150,240,120,${al * 0.7})`); m.addColorStop(1, 'rgba(120,220,100,0)');
      x.fillStyle = m; x.beginPath(); x.arc(px, py, s, 0, TAU); x.fill(); }
    for (let i = 0; i < 180; i++) { const a = r() * TAU, r0 = c * (0.93 + r() * 0.06), r1 = r0 - 10 - r() * 34; if (glow) continue; // fine dark ribs at the edge
      x.strokeStyle = `rgba(6,10,14,${0.2 + r() * 0.3})`; x.lineWidth = 0.8 + r() * 1.4; x.beginPath(); x.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); x.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); x.stroke(); } }, glow ? '#000000' : '#16302c');
  const dot = canvasTex(64, 64, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); }, '#ffffff');
  // a soft upward fade with streaks (the spore column's sleeve, the crate's glow)
  const shaft = canvasTex(128, 256, (x, w, h) => { const r = mulberry32(5);
    for (let i = 0; i < 60; i++) { const px = r() * w, wd = 3 + r() * 12, g = x.createLinearGradient(0, h, 0, h * (0.05 + r() * 0.5)); g.addColorStop(0, `rgba(255,255,255,${0.06 + r() * 0.3})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; for (const o of [0, w, -w]) x.fillRect(px - wd / 2 + o, 0, wd, h); }
    const f = x.createLinearGradient(0, h, 0, 0); f.addColorStop(0, 'rgba(255,255,255,0.22)'); f.addColorStop(0.45, 'rgba(255,255,255,0.08)'); f.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = f; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'destination-in'; const e = x.createLinearGradient(0, h, 0, 0); e.addColorStop(0, 'rgba(0,0,0,0)'); e.addColorStop(0.12, 'rgba(0,0,0,1)'); e.addColorStop(0.6, 'rgba(0,0,0,0.7)'); e.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = e; x.fillRect(0, 0, w, h); }, '#ffffff');
  const gill = SHROOM.parts[2].mat.clone(); gill.emissive.set(0xb4ff8c); gill.emissiveIntensity = 2.6;
  const glow = (color, opacity) => new THREE.MeshBasicMaterial({ map: shaft, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  return RINGM = { cap: new THREE.MeshStandardMaterial({ map: capTex(false), emissive: 0xffffff, emissiveMap: capTex(true), emissiveIntensity: 1.2, roughness: 0.5 }), gill,
    shelf: new THREE.MeshStandardMaterial({ color: 0xb4946a, roughness: 0.85 }),
    spore: new THREE.PointsMaterial({ map: dot, color: 0xa8ff86, size: 4, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }),
    shaft: glow(0x8cff6a, 0.32), beam: glow(0xffc860, 0.7) }; }
// a root or a tapering bar along points (thick at the first, a quarter of it at the last)
function taper(pts, r0, T = 8, S = 5) { const cv = new THREE.CatmullRomCurve3(pts), g = new THREE.TubeGeometry(cv, T, r0, S, false), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i <= T; i++) { const c = cv.getPointAt(i / T), k = 1 - 0.75 * i / T; for (let j = 0; j <= S; j++) { const q = i * (S + 1) + j; v.fromBufferAttribute(p, q).sub(c).multiplyScalar(k).add(c); p.setXYZ(q, v.x, v.y, v.z); } }
  g.computeVertexNormals(); return g; }
const shade = (g, k) => g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(k), 3));
function buildShrooms(b, P, g) { if (!SHROOM) { SHROOM = mushroomParts(1); const bb = new THREE.Box3().setFromBufferAttribute(SHROOM.parts[1].geo.attributes.position);
    SHROOM.top = bb.max.y; SHROOM.R = (bb.max.x - bb.min.x + bb.max.z - bb.min.z) / 4; SHROOM.c = bb.getCenter(new THREE.Vector3()); }
  const M = ringMats(), rnd = mulberry32(Math.round(b.x * 31 + b.z * 17) + 52), G = { body: [], cap: [], under: [], shelf: [] }, m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), V = new THREE.Vector3();
  // one giant: its cap's middle at (lx, lz), its tread's top h over the ground at the ring's middle (at least 1.2 m over its own), its
  // cap rc wide; the unit model's cap is flattened (0.58 of its width's scale) so its top reads as a tread, the stem thickened
  const giant = (lx, lz, h, rc, ry) => { const [x, z] = toW(b, lx, lz), y = groundY(x, z), top = Math.max(y + 1.2, b.y + h), s = rc / SHROOM.R, sc = s * 0.58, ss = s * 1.2;
    q4.setFromAxisAngle(UP, ry); const o = V.set(SHROOM.c.x * s, 0, SHROOM.c.z * s).applyQuaternion(q4), bx = x - o.x, bz = z - o.z, y0 = top - SHROOM.top * sc, base = Math.min(groundY(bx, bz), y) - 0.05;
    G.cap.push(SHROOM.parts[1].geo.clone().applyMatrix4(m4.compose(new THREE.Vector3(bx, y0, bz), q4, new THREE.Vector3(s, sc, s)))); G.under.push(SHROOM.parts[2].geo.clone().applyMatrix4(m4));
    G.body.push(SHROOM.parts[0].geo.clone().applyMatrix4(m4.compose(new THREE.Vector3(bx, base, bz), q4, new THREE.Vector3(ss, (y0 - base + 0.85 * sc + 0.05) / 0.862, ss))));
    // roots spread from the swollen foot into the ground
    for (let k = 0, nr = 4 + Math.floor(rnd() * 4); k < nr; k++) { const a = ry + (k + rnd() * 0.7) / nr * TAU, L = 0.9 + rnd() * 1.6, bend = (rnd() - 0.5) * 0.9, pt = (d, up) => { const aa = a + bend * d / (L + 0.6), px = bx + Math.cos(aa) * d, pz = bz + Math.sin(aa) * d; return new THREE.Vector3(px, groundY(px, pz) + up, pz); };
      G.body.push(shade(taper([pt(0.4, 0.42 + rnd() * 0.25), pt(0.8, 0.22), pt(0.4 + L * 0.6, 0.06 + rnd() * 0.08), pt(0.45 + L, -0.16)], 0.15 + rnd() * 0.08), 0.55 + rnd() * 0.12)); }
    // bracket fungi in tiers up the stem (the stem leans 0.084 of the unit model's height toward 2.2 rad, turned with the giant)
    const lean = new THREE.Vector3(Math.cos(2.2), 0, Math.sin(2.2)).applyQuaternion(q4), hs = y0 + 0.75 * sc - base;
    for (let k = 0; k < (hs > 3 ? 3 : 1); k++) { const a = rnd() * TAU, t = 0.28 + k * 0.2 + rnd() * 0.08, sx = bx + lean.x * 0.48 * t * t * ss / 5.6, sz = bz + lean.z * 0.48 * t * t * ss / 5.6, sr = 0.46 * ss / 5.6;
      for (let j = 0; j < 3; j++) { const rb = (0.4 + rnd() * 0.25) * (1 - j * 0.22), aj = a + (rnd() - 0.5) * 0.4;
        G.shelf.push(new THREE.CylinderGeometry(rb, rb * 0.75, 0.1, 10, 1, false, -Math.PI / 2, Math.PI).scale(0.8, 1, 1.1).rotateX(-0.1).rotateY(Math.atan2(Math.cos(aj), Math.sin(aj)))
          .translate(sx + Math.cos(aj) * sr * 0.8, base + hs * t + j * 0.2, sz + Math.sin(aj) * sr * 0.8)); } }
    Object.assign(addCollider(x, z, rc * 0.97, b), { vr: 0, top, stand: top }); return top; };
  // the ring, 7.8 m out, an even 0.8 m between every two caps (a jump and a climb from each to the next); the gap at the eighth
  // place is the way into the clearing
  const RR = 7.8, A = (i) => (i + 0.5) / 8 * TAU; b.caps = [];
  [1.5, 2.4, 3.3, 4.2, 5.1, 6.0, 6.9].forEach((h, i) => b.caps.push(giant(Math.cos(A(i)) * RR, Math.sin(A(i)) * RR, h, 2.6, rnd() * TAU)));
  // the middle cap, a little toward the top step; the crate on it, under a gold glow until it is searched
  const mx = Math.cos(A(6)) * 0.2, mz = Math.sin(A(6)) * 0.2, top = giant(mx, mz, 5.9, 2.3, rnd() * TAU), cr = cache(b, g, mx + 0.3, mz - 0.2, b.place, { k: 4, ammo: 6, y: top - 0.15 });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 7, 16, 1, true), M.beam); beam.position.set(cr.x, top + 3.3, cr.z); beam.renderOrder = 2; g.add(beam);
  beam.onBeforeRender = (r, sc, cam) => { beam.material.opacity = cr.opened ? 0 : (0.45 + 0.15 * Math.sin(performance.now() / 600)) * Math.min(1, Math.max(0.1, (Math.hypot(cam.position.x - cr.x, cam.position.z - cr.z) - 3) / 6)); };
  for (const [k, mat, cast] of [['body', SHROOM.parts[0].mat, true], ['cap', M.cap, true], ['under', M.gill, false], ['shelf', M.shelf, true]]) { const m = new THREE.Mesh(mergeGeometries(G[k]), mat); m.castShadow = cast; m.receiveShadow = true; g.add(m); }
  // a fairy ring of glowcaps round the outside, and a few in the clearing
  const gc = glowcapParts(2), n = 84, im = gc.parts.map(p => { const m = new THREE.InstancedMesh(p.geo, p.mat, n); m.receiveShadow = true; g.add(m); return m; });
  for (let i = 0; i < n; i++) { const inner = i >= 72, a = inner ? rnd() * TAU : (i + rnd() * 0.6) / 72 * TAU, d = inner ? 2.7 + rnd() * 2 : 11.3 + (rnd() - 0.5) * 0.8, [x, z] = toW(b, Math.cos(a) * d, Math.sin(a) * d), s = 0.8 + rnd() * 0.6;
    m4.compose(new THREE.Vector3(x, groundY(x, z) - 0.02, z), q4.setFromAxisAngle(UP, rnd() * TAU), new THREE.Vector3(s, s, s)); for (const m of im) m.setMatrixAt(i, m4); }
  // the spores: a low cloud over the clearing (where they hurt, src/places.js), a sleeve of them rising and widening out of it to
  // 17 m (it turns, src/places.js), loose motes round the caps; a faint glowing veil marks the column from afar
  const N = 1600, pos = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const k = i % 10, a = rnd() * TAU; let r, y;
    if (k < 3) { r = 2.5 + Math.sqrt(rnd()) * 3.6; y = 0.15 + rnd() * 2.2; } else if (k < 9) { y = Math.pow(rnd(), 1.5) * 17; r = (3.0 + (rnd() - 0.5) * 2.2) * (1 + y / 22); } else { r = 4 + rnd() * 8; y = rnd() * 8; }
    pos.set([Math.cos(a) * r, b.y + y, Math.sin(a) * r], i * 3); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const cloud = new THREE.Points(geo, M.spore); cloud.position.set(b.x, 0, b.z); g.add(cloud); /* (its points are round the ring's middle: it was at the world's) */ if (b.place) b.place.cloud = cloud;
  for (const [r0, r1, hh] of [[3.1, 4.6, 16], [2.5, 3.9, 13]]) { const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, hh, 28, 1, true).rotateY(r0).translate(0, b.y + hh / 2 + 0.4, 0), M.shaft); sleeve.renderOrder = 2; cloud.add(sleeve);
    sleeve.onBeforeRender = (r, sc, cam) => { M.shaft.opacity = 0.32 * Math.min(1, Math.max(0.15, (Math.hypot(cam.position.x - b.x, cam.position.z - b.z) - 4) / 8)); }; } } // (faint seen from inside it)

// the crater lakes (slice 23 polish; a critic: the water looked shallow, the rim low, no drama): jagged outcrops and boulders
// stand along the rim in broken clusters (a way out between every two, and the way in from the camp kept wide open), loose
// boulders lie rolled down the inner slope and half sunk at the shore, the deep middle goes near black, low mist lies over it, a faint gold glow on the
// water marks the sunken chest, and at the shore lie a wrecked rowboat and the bones of an old serpent, the Thing in the deep's kind
let CRM = null;
function craterMats() { if (CRM) return CRM;
  const mist = canvasTex(512, 512, (x, w, h) => { const r = mulberry32(9), c = w / 2;
    for (let i = 0; i < 170; i++) { const a = r() * TAU, d = (0.2 + 0.65 * Math.sqrt(r())) * c, px = c + Math.cos(a) * d, py = c + Math.sin(a) * d, s = 24 + r() * 60, g = x.createRadialGradient(px, py, 0, px, py, s);
      g.addColorStop(0, `rgba(255,255,255,${0.05 + r() * 0.13})`); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(px - s, py - s, s * 2, s * 2); }
    x.globalCompositeOperation = 'destination-in'; const e = x.createRadialGradient(c, c, c * 0.5, c, c, c * 0.98); e.addColorStop(0, 'rgba(0,0,0,1)'); e.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = e; x.fillRect(0, 0, w, h); }, '#ffffff');
  const halo = canvasTex(128, 128, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.25, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); }, '#ffffff');
  // (the deep: the water's own dark veil, src/water.js, lies 2 cm over the mirror and is lost at a distance; this one is pulled toward
  // the eye, black in the 8 m middle and clear at the shore)
  const deep = canvasTex(256, 256, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(0.6, 'rgba(0,0,0,0.82)'); g.addColorStop(0.86, 'rgba(0,0,0,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); }, '#ffffff');
  const lift = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  return CRM = { mist: new THREE.MeshBasicMaterial({ map: mist, color: 0xd4dee2, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, ...lift }),
    deep: new THREE.MeshBasicMaterial({ map: deep, color: 0x03141a, transparent: true, depthWrite: false, ...lift }),
    gold: new THREE.MeshBasicMaterial({ map: halo, color: 0xffc860, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, ...lift }),
    bone: new THREE.MeshStandardMaterial({ color: 0xd6ccb4, roughness: 0.78 }) }; }
// a jagged rock: a faceted lump, flat underneath, tapering to a ragged top; w wide, hgt tall, d deep, its own vertex colours
function shardGeo(rnd, w, hgt, d, taper = 0.5) { const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, v = new THREE.Vector3(), sd = rnd() * 100, hsh = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + sd) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + (hsh(v.x, v.y, v.z) - 0.5) * 0.55, t = (v.y + 1) / 2; v.multiplyScalar(k); if (v.y < -0.3) v.y = -0.3 + (v.y + 0.3) * 0.3;
    p.setXYZ(i, v.x * w / 2 * (1 - taper * t * t), (v.y + 0.3) / 1.3 * hgt, v.z * d / 2 * (1 - taper * t * t)); }
  g.deleteAttribute('normal'); g.computeVertexNormals(); boxUV(g, 1.6); const n = g.attributes.normal, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 3) { const k = 0.78 + hsh(i, 1, 2) * 0.24 + Math.max(0, n.getY(i)) * 0.12; for (let j = 0; j < 3; j++) col.set([k, k * 0.98, k * 0.95], (i + j) * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; }
function buildCrater(q, root) { const l = q.lake, M = mats(), C = craterMats(), rnd = mulberry32(Math.round(l.x * 13 + l.z * 7) + 23), T = { rock: [], bone: [], planks: [], beam: [] };
  const kind = { tundra: 'icerock', waste: 'wasterock', desert: 'sandrock', ruins: 'wasterock' }[biomeAt(l.x + l.rx * 1.5, l.z)] || 'rock', eC = 1 + l.rw, camp = Math.atan2(CAMP.z - l.z, CAMP.x - l.x);
  const at = (a, e) => [l.x + Math.cos(a) * l.rx * e, l.z + Math.sin(a) * l.rx * e];
  // (the way in from the camp: nothing within 5 m of its line, as a player walks it straight in and out)
  const open = (x, z, r) => { const dx = x - l.x, dz = z - l.z; return dx * Math.cos(camp) + dz * Math.sin(camp) > 0 && Math.abs(dz * Math.cos(camp) - dx * Math.sin(camp)) < 5 + r; };
  const rock = (x, z, w, hgt, d, a, lean, sink, stand = true) => { if (open(x, z, Math.max(w, d) / 2)) return; const y = groundY(x, z);
    T.rock.push(shardGeo(rnd, w, hgt, d, hgt > 2.4 ? 0.4 : 0.3).rotateZ(-lean).rotateY(-a).translate(x, y - sink, z));
    const rr = w * 0.42 + 0.1, n = Math.max(1, Math.ceil(d * 0.8 / (rr * 1.2))), tx = -Math.sin(a), tz = Math.cos(a); // (a row of circles along a slab's broad side)
    for (let i = 0; i < n; i++) { const f = n > 1 ? (i / (n - 1) - 0.5) * d * 0.8 : 0; Object.assign(addCollider(x + tx * f, z + tz * f, rr, null), { vr: 0, top: y - sink + hgt * 0.9, stand: stand && hgt < 2.6 ? y - sink + hgt * 0.85 : null }); } };
  // the rim: clusters of uplifted shards leaning outward (as a crater's rim rocks are thrown back) with boulders round them
  const nC = 9 + Math.floor(rnd() * 3);
  for (let c = 0; c < nC; c++) { const gate = c === 0 || c === nC - 1, a0 = gate ? camp + (c ? -1 : 1) * 10.5 / (l.rx * eC) : camp + (c + 0.5) / nC * TAU + (rnd() - 0.5) * 0.2; // (the first and last flank the way in from the camp, a gate through the rim)
    for (let k = 0, nk = 2 + Math.floor(rnd() * 2); k < nk; k++) { const a = a0 + (rnd() - 0.5) * 0.16, [x, z] = at(a, eC + (rnd() - 0.6) * 0.08), ry = a + (rnd() - 0.5) * 0.5; rock(x, z, 1.5 + rnd() * 1.1, (5 + rnd() * 4.5) * (gate ? 1.2 : 1), 3.5 + rnd() * 2.5, ry, 0.25 + rnd() * 0.4, 0.6); } // (slabs: thin across the rim, broad along it, tipped outward)
    for (let k = 0, nk = 3 + Math.floor(rnd() * 3); k < nk; k++) { const a = a0 + (rnd() - 0.5) * 0.32, [x, z] = at(a, eC + (rnd() - 0.5) * 0.22), s = 1.1 + rnd() * 1.5; rock(x, z, s * 1.3, s, s * (0.9 + rnd() * 0.4), rnd() * TAU, (rnd() - 0.5) * 0.3, 0.25); } }
  // the shore: a wrecked rowboat and a serpent's bones, each its own way round; boulders rolled down the slope and half sunk
  const aw = camp + (rnd() < 0.5 ? 1 : -1) * Math.PI * (0.42 + rnd() * 0.16), ab = camp + Math.PI + (rnd() - 0.5) * 0.6, /* (the bones across the water from the way in, seen as you come over the rim) */ off = (a) => Math.min(Math.abs(Math.atan2(Math.sin(a - aw), Math.cos(a - aw))), Math.abs(Math.atan2(Math.sin(a - ab), Math.cos(a - ab)))) < 0.35;
  for (let k = 0; k < 22; k++) { const a = rnd() * TAU, e = k < 9 ? 0.93 + rnd() * 0.08 : 1.03 + rnd() * (eC - 1.15); if (off(a)) continue; const [x, z] = at(a, e), s = 0.8 + rnd() * (k < 9 ? 1.7 : 1.2);
    rock(x, z, s * 1.2, s, s, rnd() * TAU, (rnd() - 0.5) * 0.4, s * 0.25); }
  if (T.rock.length) { const m = new THREE.Mesh(mergeGeometries(T.rock), rockMat(kind)); m.castShadow = m.receiveShadow = true; root.add(m); }
  // the rowboat: a 3.8 m double-ender of planks on ribs, stern in the water, bow up the bank, listing on its side, planks gone
  { const L = 3.8, half = (z, k) => (0.42 + 0.13 * k) * Math.sqrt(Math.max(0, 1 - (z / (L / 2)) ** 2)), B = { planks: [], beam: [] };
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) for (let z0 = -L / 2; z0 < L / 2 - 0.01; z0 += L / 8) { if (rnd() < 0.18) continue; const z1 = z0 + L / 8, x0 = half(z0, k), x1 = half(z1, k), len = Math.hypot(z1 - z0, x1 - x0);
      box(B, 'planks', 0.035, 0.19, len + 0.03, sx * (x0 + x1) / 2, 0.14 + k * 0.19, (z0 + z1) / 2, Math.atan2(sx * (x1 - x0), z1 - z0), 0, -sx * 0.12 * k); }
    for (let z = -L / 2 + 0.45; z < L / 2 - 0.3; z += 0.42) { for (const sx of [-1, 1]) bar(B, 'beam', sx * half(z, 0) * 0.5, 0.06, z, sx * half(z, 2), 0.62, z, 0.06); box(B, 'planks', half(z, 0) * 1.2, 0.035, 0.36, 0, 0.06, z); }
    box(B, 'beam', 0.1, 0.12, L * 0.96, 0, 0.02, 0); box(B, 'planks', half(-0.5, 2) * 1.9, 0.04, 0.26, 0, 0.5, -0.5); box(B, 'beam', 0.07, 0.07, 2.4, 0.3, 0.12, 0.2, 0.15); // the keel, a thwart, a loose oar
    const [x, z] = at(aw, 0.99), [x2, z2] = at(aw, 1.08), y = Math.max(groundY(x, z), WATER_Y - 0.25), pitch = Math.atan2(groundY(x2, z2) - groundY(x, z), l.rx * 0.09);
    const Mb = new THREE.Matrix4().makeTranslation(x, y - 0.12, z).multiply(new THREE.Matrix4().makeRotationY(Math.atan2(Math.cos(aw), Math.sin(aw)))).multiply(new THREE.Matrix4().makeRotationX(-pitch * 0.8)).multiply(new THREE.Matrix4().makeRotationZ(0.42));
    for (const k in B) for (const geo of B[k]) T[k].push(geo.applyMatrix4(Mb));
    Object.assign(addCollider(x, z, 0.8, null), { vr: 0, top: y + 0.7, stand: null }); q.wreck = { x, z }; }
  for (const k of ['planks', 'beam']) { const geo = mergeGeometries(T[k].map(q => q.index ? q.toNonIndexed() : q)); boxUV(geo, TILE[k]); const m = new THREE.Mesh(geo, M[k]); m.castShadow = m.receiveShadow = true; root.add(m); }
  // the serpent's bones: an 11 m spine snaking down the bank, its tail in the shallows, ribs curling down into the mud, the skull
  // on the bank with its jaw dropped open
  { const pts = []; for (let i = 0; i <= 5; i++) { const [x, z] = at(ab + (i - 2.5) * 0.055, 1.13 - i * 0.026 + Math.sin(i * 1.7) * 0.012); pts.push(new THREE.Vector3(x, 0, z)); }
    const cv = new THREE.CatmullRomCurve3(pts), NV = 26, up = new THREE.Vector3(0, 1, 0), sy = (p) => Math.max(groundY(p.x, p.z), WATER_Y - 0.2) + 0.14;
    for (let i = 0; i < NV; i++) { const u = i / (NV - 1), p = cv.getPointAt(u), t = cv.getTangentAt(u), s = i < 4 ? 0.7 + i * 0.1 : Math.max(0.35, 1.05 - (i - 4) / (NV - 4) * 0.7), nx = -t.z, nz = t.x; p.y = sy(p);
      T.bone.push(new THREE.BoxGeometry(0.34 * s, 0.26 * s, 0.3).rotateY(Math.atan2(t.x, t.z)).translate(p.x, p.y, p.z), new THREE.ConeGeometry(0.07 * s, 0.32 * s, 5).translate(p.x, p.y + 0.26 * s, p.z));
      if (i > 1 && i < NV - 3 && rnd() > 0.12) for (const sx of [-1, 1]) { if (rnd() < 0.15) continue; const k = s * (0.75 + rnd() * 0.2), Q = (a, b, c) => new THREE.Vector3(p.x + nx * sx * a * k + t.x * c, p.y + b * k, p.z + nz * sx * a * k + t.z * c);
        T.bone.push(taper([Q(0.12, 0.05, 0), Q(0.5, 0.32, 0.08), Q(0.85, 0.05, 0.16), Q(0.82, -0.45, 0.2)], 0.065 * k, 6, 4)); } }
    const p = cv.getPointAt(0), t = cv.getTangentAt(0), hy = sy(p) + 0.18, ry = Math.atan2(-t.x, -t.z), hx = p.x - t.x * 0.9, hz = p.z - t.z * 0.9, skull = new THREE.BoxGeometry(0.6, 0.38, 1.3, 2, 1, 3), sp = skull.attributes.position;
    for (let i = 0; i < sp.count; i++) { const zz = sp.getZ(i), k = 1 - Math.max(0, zz) / 0.65 * 0.55; sp.setXYZ(i, sp.getX(i) * k, sp.getY(i) * (zz > 0 ? 0.6 + 0.4 * k : 1), zz); } skull.computeVertexNormals();
    const Rm = new THREE.Matrix4().makeTranslation(hx, hy, hz).multiply(new THREE.Matrix4().makeRotationY(ry)), jaw = (sx) => new THREE.BoxGeometry(0.08, 0.1, 1.25).translate(sx * 0.2, -0.32, 0.45).rotateX(0.35);
    T.bone.push(skull.applyMatrix4(Rm), jaw(-1).applyMatrix4(Rm), jaw(1).applyMatrix4(Rm));
    for (let j = 0; j < 7; j++) for (const sx of [-1, 1]) T.bone.push(new THREE.ConeGeometry(0.035, 0.15, 4).rotateX(Math.PI).translate(sx * 0.17 * (1 - j / 7 * 0.45), -0.22, 0.05 + j * 0.11).applyMatrix4(Rm), new THREE.ConeGeometry(0.03, 0.13, 4).translate(sx * 0.2, -0.2, 0.25 + j * 0.13).rotateX(0.35).applyMatrix4(Rm));
    const m = new THREE.Mesh(mergeGeometries(T.bone.map(q => q.index ? q.toNonIndexed() : q)), C.bone); m.castShadow = m.receiveShadow = true; root.add(m);
    Object.assign(addCollider(hx, hz, 0.55, null), { vr: 0, top: hy + 0.3, stand: hy + 0.2 }); q.bones = { x: hx, z: hz }; }
  const dk = new THREE.Mesh(new THREE.CircleGeometry(l.rx * 1.02, 48).rotateX(-Math.PI / 2), C.deep); dk.position.set(l.x, WATER_Y + 0.05, l.z); dk.renderOrder = 1; root.add(dk);
  // low mist over the water, three layers turning slowly against each other
  for (let k = 0; k < 3; k++) { const s = l.rx * (2.0 - k * 0.2), m = new THREE.Mesh(new THREE.PlaneGeometry(s, s).rotateX(-Math.PI / 2), C.mist); m.position.set(l.x, WATER_Y + 0.35 + k * 0.5, l.z); m.renderOrder = 3; root.add(m);
    m.onBeforeRender = () => { m.rotation.y = k * 2.1 + performance.now() / 1000 * 0.012 * (k % 2 ? -1 : 1); }; }
  // a faint gold glow on the water over the chest, breathing, gone once it is opened
  const ch = q.chest, glow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), C.gold); glow.position.set(ch.x, WATER_Y + 0.08, ch.z); glow.renderOrder = 2; root.add(glow);
  glow.onBeforeRender = () => { glow.material.opacity = ch.opened ? 0 : 0.45 + 0.2 * Math.sin(performance.now() / 900); }; }
const PLANE_KEYS = ['livery', 'lining', 'wing', 'fin', 'nacelle', 'dark', 'chrome', 'white', 'rubber', 'plastic', 'bags', 'alu']; // (the plane's own materials, which keep their own uv)
const PLACE_BUILD = { radio: buildRadio, plane: buildPlane, barge: buildBarge, shrooms: buildShrooms };

// the roof comes off the building the player stands in (not in first person: there it is the ceiling); far ones hide
export function tickBuildings(cam, x, z, y, firstPerson) { CUT.constant = 1e6;
  for (const b of buildings) { b.group.visible = Math.hypot(cam.x - b.x, cam.z - b.z) < Q.drawDist * 0.8;
    const [lx, lz] = toL(b, x, z), r = b.roofBox || { cz: 0, w: b.w, d: b.d }; const inside = Math.abs(lx - (r.cx || 0)) < r.w / 2 + 0.5 && Math.abs(lz - r.cz) < r.d / 2 + 0.5 && !(y > b.y + (b.h ?? 99) - 0.2); // on the roof is not inside
    if (b.kind === 'radio' || b.kind === 'shrooms') continue; // (slice 23: a mast and a mushroom ring are not rooms: never cut away)
    if (b.inside) { const [mx, mz] = toW(b, b.cx, b.cz); b.inside.visible = b.group.visible && Math.hypot(cam.x - mx, cam.z - mz) < 24; } // (slice 36: a house kind's furniture, only up close)
    b.roofGroup.visible = firstPerson || !inside; if (inside && !firstPerson) CUT.constant = Math.max(groundY(x, z), y) + 1.3; } }
