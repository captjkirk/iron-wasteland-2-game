// Harvesting (slice 11, IW1's in 3D): hold E (B on a pad) by a tree to chop it. Every swing bites chips out of the trunk
// and shakes the tree; when it goes it creaks, falls away from you, crashes down and breaks into 2 or 3 logs of wood; a
// stump stays. Hold E by a bush to pull fiber from it. IW1's times: the Architect 1.5 s, the Gunslinger 4 s, others 2.5 s.
// Co-op: the world's trees are the host's. A joined game chops, then asks (`chop`); the host fells it for everyone
// (`fell`, and in `welcome` for late joiners) and drops the logs as loot it owns. Each swing's shake is shown to all.
import * as THREE from 'three';
import { placed, nearColliders, addCollider } from './props.js';
import { markDirty } from './scatter.js';
import { pbr } from './propmodels.js';
import { groundY } from './world.js';
import { hitBurst, dustPuff, grainDisc } from './effects.js';
import { sfx } from './audio.js';
import { logEvent } from './playlog.js';
import { rng } from './noise.js';
import { player, scene3, dropLoot, log } from './game.js';
import { send, joining } from './coop.js';

export const TREES = new Set(['pine', 'oak', 'aspen', 'snowpine', 'deadtree', 'swamptree']);
const BUSHES = ['bush', 'drybush'], NAME = { pine: 'pine', oak: 'oak', aspen: 'aspen', snowpine: 'pine', deadtree: 'dead tree', swamptree: 'swamp tree', bush: 'bush', drybush: 'dry bush' };
const CHOP = { architect: 1.5, gunslinger: 4 };
export const chopTime = (ch, it) => (CHOP[ch.id] ?? 2.5) * (TREES.has(it.type) ? 1 : 0.4);
export const felled = []; // [type, index, fall heading] of every tree felled and bush picked (for players who join later)
const live = new Map(), Y = new THREE.Vector3(0, 1, 0); // trees shaking or falling: item -> { g, shake, t, idle, fall }
const idx = (it) => it.pi ??= placed[it.type].indexOf(it);

// what is in reach to harvest: the nearest standing trunk within 1.4 m of its bark, else a bush within 1.5 m
let bgrid = null;
function bushes(x, z) { if (!bgrid) { bgrid = new Map(); for (const t of BUSHES) for (const it of placed[t] || []) { const k = Math.floor(it.x / 8) + ',' + Math.floor(it.z / 8); (bgrid.get(k) || bgrid.set(k, []).get(k)).push(it); } }
  const out = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) out.push(...(bgrid.get((Math.floor(x / 8) + a) + ',' + (Math.floor(z / 8) + b)) || [])); return out; }
const reach = (it, x, z) => Math.hypot(it.x - x, it.z - z) - (TREES.has(it.type) ? it.col.r : 0);
export function harvestTarget(x, z, slack = 0) { let best = null, bd = 1.4 + slack;
  for (const c of nearColliders(x, z)) { const it = c.ref; if (!it || !c.r || !TREES.has(it.type) || it.felled || it.col !== c || performance.now() - (it.asked || -1e9) < 4000) continue; /* asked the host: wait for its word */ const d = reach(it, x, z); if (d < bd) { bd = d; best = it; } }
  if (best) return best; bd = 1.5 + slack; for (const it of bushes(x, z)) { if (it.felled || performance.now() - (it.asked || -1e9) < 4000) continue; const d = reach(it, x, z); if (d < bd) { bd = d; best = it; } } return best; }
export const harvestName = (it) => NAME[it.type] || it.type;

// ── Every frame: the local player's chopping (hold is E or B held), and every shaking or falling tree ──
export function tickHarvest(dt, hold) {
  const c = player.chop, it = hold && !player.dead && !(player.down > 0) ? (c && !c.it.felled && reach(c.it, player.x, player.z) < 2 ? c.it : harvestTarget(player.x, player.z)) : null;
  if (!it) player.chop = null;
  else { if (!c || c.it !== it) player.chop = { it, t: 0, T: chopTime(player.ch, it), next: 0 }; const h = player.chop, dx = it.x - player.x, dz = it.z - player.z, d = Math.hypot(dx, dz) || 1;
    h.t += dt; h.next -= dt; player.faceYaw = Math.atan2(-dx, -dz);
    if (h.next <= 0) { h.next = 0.5; swing(it, dx / d, dz / d); }
    if (h.t >= h.T) { player.chop = null; const k = it.type, i = idx(it), fd = +Math.atan2(dx, dz).toFixed(2); logEvent('chopped', { type: k, i });
      if (joining()) { send('host', { t: 'chop', k, i, d: fd }); it.asked = performance.now(); } else fell(k, i, fd, true); } }
  for (const [q, L] of live) tickLive(q, L, dt);
}
function swing(it, nx, nz) { const tree = TREES.has(it.type), r = tree ? it.col.r : 0.3, at = new THREE.Vector3(it.x - nx * r * 0.9, groundY(it.x, it.z) + (tree ? 1.0 : 0.5), it.z - nz * r * 0.9);
  player.swing = 1; player.mesh.userData.anim.attack(false); hitBurst(at, new THREE.Vector3(-nx, 0.4, -nz), tree ? 'wood' : 'leaf', tree ? 14 : 16, false); sfx(tree ? 'chop' : 'swing', at, 0.9);
  if (tree) shake(it); send('all', { t: 'a', d: [+nx.toFixed(2), +nz.toFixed(2)], r: 0 }); if (tree) send('all', { t: 'shake', k: it.type, i: idx(it) }); }

// a tree that is shaking or falling is drawn on its own (its instanced copy is hidden): the same parts, as one-instance meshes
function lift(it) { let L = live.get(it); if (L) return L; const g = new THREE.Group(); g.position.set(it.x, it.y, it.z);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromAxisAngle(Y, it.ry || 0), new THREE.Vector3(it.s, it.s, it.s));
  for (const im of it.layer.near) { const c = new THREE.InstancedMesh(im.geometry, im.material, 1); c.setMatrixAt(0, m); c.castShadow = im.castShadow; c.receiveShadow = im.receiveShadow; c.customDepthMaterial = im.customDepthMaterial; c.frustumCulled = false; g.add(c); }
  scene3().add(g); it.gone = true; markDirty(); L = { g, shake: 0, t: 0, idle: 0, fall: null }; live.set(it, L); return L; }
function unlift(it) { const L = live.get(it); L.g.removeFromParent(); for (const c of L.g.children) c.dispose(); live.delete(it); if (!it.felled) { it.gone = false; markDirty(); } }
function shake(it) { const L = lift(it); L.shake = 1; L.idle = 0; }
export function onShake(m) { const it = placed[m.k]?.[m.i]; if (it && !it.felled) shake(it); }

// the stump left behind: a short, slightly tapered trunk in log bark (Poly Haven, CC0) with a pale sawn top showing its
// rings and a ragged hinge of splinters where it broke; solid, and low enough to stand on
let STUMP = null;
export function prepHarvest() { STUMP = { bark: pbr('props/logbark', { rough: 0.95, color: 0xb8a490 }), grain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), splinter: new THREE.MeshStandardMaterial({ color: 0xc8a070, roughness: 0.9 }) }; }
function stump(it, r, d) { const y = groundY(it.x, it.z), h = 0.38 + r * 0.5, g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.22, h + 0.25, 16, 1), STUMP.bark); body.position.y = (h - 0.25) / 2; g.add(body);
  const top = new THREE.Mesh(grainDisc(r * 0.97).rotateX(-Math.PI / 2), STUMP.grain); top.position.y = h + 0.002; g.add(top);
  // the hinge: splinters standing on the side the tree fell toward
  for (let k = 0; k < 5; k++) { const a = d + (k - 2) * 0.28, s = new THREE.Mesh(new THREE.ConeGeometry(r * 0.16, 0.12 + rng() * 0.16, 4), STUMP.splinter); s.position.set(Math.sin(a) * r * 0.72, h + 0.06, Math.cos(a) * r * 0.72); s.rotation.set((rng() - 0.5) * 0.4, rng() * 3, (rng() - 0.5) * 0.4); g.add(s); }
  g.position.set(it.x, y - 0.02, it.z); g.traverse(m => { m.castShadow = m.receiveShadow = true; }); scene3().add(g); it.stump = g;
  Object.assign(addCollider(it.x, it.z, r * 1.05, null), { vr: 0, top: y + h, stand: y + h - 0.04, base: y }); }

// fell a tree or pick a bush (the host decides; every game shows it). quick: no animation (a late joiner's world)
export function fell(k, i, d, host, quick = false) { const it = placed[k]?.[i]; if (!it || it.felled) return false; it.felled = true; felled.push([k, i, d]);
  if (host) send('all', { t: 'fell', k, i, d });
  if (TREES.has(k)) { const r = Math.max(0.2, Math.min(0.42, it.col.r * 0.75)); it.col.r = 0; it.col.vr = 0; stump(it, r, d);
    if (quick) { if (live.has(it)) unlift(it); it.gone = true; markDirty(); }
    else { const L = lift(it), L0 = it.s, fx = Math.sin(d), fz = Math.cos(d), hEnd = groundY(it.x + fx * L0 * 0.6, it.z + fz * L0 * 0.6) - groundY(it.x, it.z);
      L.fall = { a: 0.03, w: 0.12, t: 0, land: 0, host, axis: new THREE.Vector3(fz, 0, -fx), fx, fz, max: Math.max(1.15, Math.min(1.75, Math.PI / 2 - Math.atan2(hEnd, L0 * 0.6))) };
      sfx('creak', it); if (Math.hypot(it.x - player.x, it.z - player.z) < 30) log(`Timber! The ${NAME[k]} comes down.`); } }
  else { it.gone = true; markDirty(); if (!quick) { const at = new THREE.Vector3(it.x, groundY(it.x, it.z) + 0.5, it.z); hitBurst(at, Y, 'leaf', 26, false); sfx('salvage', it, 0.5); }
    if (host && !quick) { const n = 1 + (rng() < 0.5 ? 1 : 0); for (let j = 0; j < n; j++) dropLoot(it.x, it.z, 'fiber'); } }
  return true; }
export const onChop = (m) => fell(m.k, m.i, m.d, true);
export const onFell = (m) => fell(m.k, m.i, m.d, false);
export function applyFelled(list) { for (const [k, i, d] of list) fell(k, i, d, false, true); }

// shaking: a quick decaying wobble; falling: it tips over slowly, then faster (a toppling pole), crashes and bounces a
// little, lies there a moment, then breaks up into logs (the host drops them along the trunk) and sinks away
function tickLive(it, L, dt) { L.t += dt;
  if (!L.fall) { L.shake = Math.max(0, L.shake - dt * 2.2); const a = L.shake * 0.035; L.g.rotation.set(Math.sin(L.t * 31) * a, 0, Math.cos(L.t * 27) * a);
    if (L.shake <= 0 && (L.idle += dt) > 2.5) unlift(it); return; }
  const F = L.fall, len = it.s; F.t += dt;
  if (!F.land || F.t - F.land < 1.2) { F.w += (3.2 * Math.sin(F.a) + 0.2) * dt; F.a += F.w * dt;
    if (F.a >= F.max) { F.a = F.max; if (!F.land) { F.land = F.t; F.w = -F.w * 0.16; sfx('crash', it);
      for (let k = 2; k <= 8; k += 2) dustPuff(new THREE.Vector3(it.x + F.fx * len * k / 10, groundY(it.x + F.fx * len * k / 10, it.z + F.fz * len * k / 10), it.z + F.fz * len * k / 10), 10);
      if (Math.hypot(it.x - player.x, it.z - player.z) < 25) player.shake = 0.3; } else F.w = 0; } }
  L.g.rotation.set(0, 0, 0); L.g.quaternion.setFromAxisAngle(F.axis, F.a);
  if (F.land && F.t - F.land > 1.6) { if (!F.broke) { F.broke = true; for (let k = 1; k <= 7; k += 2) dustPuff(new THREE.Vector3(it.x + F.fx * len * k / 10, groundY(it.x + F.fx * len * k / 10, it.z + F.fz * len * k / 10), it.z + F.fz * len * k / 10), 12);
      if (F.host) { const n = 2 + (rng() < 0.5 ? 1 : 0); for (let j = 0; j < n; j++) { const s = 0.12 + j * 0.13; dropLoot(it.x + F.fx * len * s, it.z + F.fz * len * s, 'wood'); } } }
    L.g.position.y -= dt * 3; if (F.t - F.land > 2.4) unlift(it); } }
