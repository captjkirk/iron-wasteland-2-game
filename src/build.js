// Building (slice 12): IW1's build mode in 3D. Picking a build in the craft menu (Tab) enters build mode: a ghost of the
// piece stands on a 2 m grid where you aim (green where it fits, red with the reason where it does not), R (RB, or the
// d-pad's left and right, or the wheel) turns it a quarter, a click, E or Enter (A) places it and pays for it, right
// click, Tab or Esc (B) ends it. Walls and gates sit on the grid's edges, so they meet end to end at its corners (a post
// stands at each corner a wall uses) and join into runs and enclosures; everything else sits in a cell.
// Hold X (RB on a pad) by something you built to tear it down: half its cost comes back (rounded down, IW1).
// Walls (200), stone walls (300) and gates (200) take hits: enemies whose way to you is blocked by one attack it (IW1: 0.7
// of their damage every 1.4 s; always when it is part of an enclosure of three or more pieces, a lone wall only
// sometimes) and it shows its damage (logs lean and snap, stones fall) until it falls. Players pass a gate (it swings
// aside for them); enemies do not, unless someone holds it open with E. A spike trap does 35 damage to the first enemy
// that steps on it, then is spent (IW1).
// Co-op: what is built, every piece's health, the gates and the traps are the host's. A joined game asks (`build`,
// `tear`, `gate`); the host decides and tells every game (`built`, `gone`, `bst`), and late joiners get it all in
// `welcome`. Each game draws the ghost, the grid and the swing of a gate a player walks through for itself.
import * as THREE from 'three';
import { WATER_Y } from './config.js';
import { RECIPES, BENCH_R } from './recipes.js';
import { groundY, slopeAt } from './world.js';
import { nearColliders, colR, standAt, STEP, addCollider } from './props.js';
import { palisadeMesh, stoneMesh, rubbleMesh, postMesh, gateMesh, spikeMesh } from './buildmodels.js';
import { benchMesh, bedMesh, torchMesh } from './craftmodels.js';
import { dustPuff, hitBurst, floatText } from './effects.js';
import { sfx } from './audio.js';
import { logEvent } from './playlog.js';
import { player, log, scene3, enemies, hitEnemy, getCamMode, aimGround, isPadActive } from './game.js';
import { send, joining, net, others } from './coop.js';
import { built, addBuilt, spend, short, FOOT, nextBuiltId, benchNear, toggleCraft } from './craft.js';

export const G = 2; // the grid's cell (m): a wall is one cell long
export const PIECE = { wall: { edge: 1, hp: 200, name: 'wall', top: 2.4 }, reinforced_wall: { edge: 1, hp: 300, name: 'stone wall', top: 2.35, stone: 1 }, gate: { edge: 1, hp: 200, name: 'gate', top: 2.9 },
  spike_trap: { name: 'spike trap' }, campfire: { name: 'campfire' }, torch: { name: 'torch', keep: 1 }, craftbench: { name: 'craftbench' }, bed: { name: 'bed' } };
export const isEdge = (k) => !!PIECE[k]?.edge;
const QT = Math.PI / 2, snapF = (a) => Math.round(a / QT) * QT, alongX = (f) => Math.abs(Math.cos(f)) > 0.5;
const axis = (f) => [Math.cos(f), -Math.sin(f)]; // a piece's local x axis in the world
export const slotOf = (x, z) => Math.round(x * 4) + ',' + Math.round(z * 4);
// the ground under a piece along its own x axis, relative to its base
const gyOf = (b) => { const [ax, az] = axis(b.f); return (lx) => groundY(b.x + ax * lx, b.z + az * lx) - b.y; };
const no = (why) => ({ ok: false, why });
const players = () => [player, ...others.values()].filter(p => p && !p.out && p.ch !== null);

// ── Where a piece goes: the grid slot nearest where the player aims, turned to face them plus `rot` quarter turns ──
export function placeSpot(key, p = player, rot = mode?.rot || 0) { const aim = aimGround(1.7, 4.6), heading = getCamMode() === 'top' ? Math.atan2(-(aim.x - p.x), -(aim.z - p.z)) : p.yaw;
  const f = snapF(heading) + (isEdge(key) ? 0 : Math.PI) + rot * QT; let x, z;
  if (isEdge(key)) [x, z] = alongX(f) ? [(Math.floor(aim.x / G) + 0.5) * G, Math.round(aim.z / G) * G] : [Math.round(aim.x / G) * G, (Math.floor(aim.z / G) + 0.5) * G];
  else [x, z] = [(Math.floor(aim.x / G) + 0.5) * G, (Math.floor(aim.z / G) + 0.5) * G];
  const y = isEdge(key) ? Math.min(...[-1, 0, 1].map(k => groundY(x + Math.cos(f) * k, z - Math.sin(f) * k))) : Math.max(groundY(x, z), standAt(x, z, p.y + STEP));
  return { x, y, z, f: Math.atan2(Math.sin(f), Math.cos(f)), slot: slotOf(x, z), ...spotFree(key, x, y, z, f) }; }

// whether a piece fits there (every game checks its own ghost; the host re-checks a joined game's request with it)
export function spotFree(key, x, y, z, f = 0) { const slot = slotOf(x, z);
  if (built.some(b => b.slot === slot)) return no('Something is built there already.');
  if (isEdge(key)) { const [ax, az] = axis(f), pts = [-1, -0.5, 0, 0.5, 1].map(k => [x + ax * k, z + az * k]), hs = pts.map(([a, c]) => groundY(a, c));
    if (Math.min(...hs) < WATER_Y + 0.15) return no('Not in the water: find dry ground.');
    // (across it too: on a hillside the uphill ground came up near its top, and players and wolves stepped over it; the gate of slice 12)
    const across = [-1.2, 1.2].map(k => groundY(x - az * k, z + ax * k)); if (Math.max(...hs, ...across) - Math.min(...hs, ...across) > 1.2) return no('Too steep here for a wall.');
    for (const [a, c] of pts) for (const q of nearColliders(a, c)) if (q.r && !q.bp && Math.hypot(q.x - a, q.z - c) < colR(q, a, c) + 0.22) return no('Something is in the way: a tree, a rock or a building.');
    for (const p of players()) { const t = Math.max(-1, Math.min(1, (p.x - x) * ax + (p.z - z) * az)); if (Math.hypot(p.x - x - ax * t, p.z - z - az * t) < 0.8) return no('Stand clear of where it goes.'); }
    return { ok: true }; }
  const r = FOOT[key] || 1;
  if (y < WATER_Y + 0.25) return no('Not in the water: find dry ground.');
  const hs = [0, 1.57, 3.14, 4.71].map(a => Math.max(groundY(x + Math.cos(a) * r, z + Math.sin(a) * r), standAt(x + Math.cos(a) * r, z + Math.sin(a) * r, y + STEP)));
  if (Math.max(...hs) - Math.min(...hs) > 0.6 || (y === groundY(x, z) && slopeAt(x, z) > 0.55)) return no('Too steep here: find level ground.');
  for (const c of nearColliders(x, z)) if (c.r && !(c.bp && isEdge(c.bp.key)) && Math.hypot(c.x - x, c.z - z) < colR(c, x, z) + r) return no('Something is in the way: step back or turn.');
  if (key !== 'spike_trap' && key !== 'torch') for (const p of players()) if (Math.hypot(p.x - x, p.z - z) < r + 0.5) return no('Step back: you are standing where it goes.');
  return { ok: true }; }

// ── The pieces slice 12 adds (walls, stone walls, gates, spike traps): model, colliders, posts, health ──
const posts = new Map(); // grid corner 'i,j' -> { n, s (stone walls using it), kind, mesh }
const ends = (b) => { const [ax, az] = axis(b.f); return [-1, 1].map(k => [Math.round((b.x + ax * k) / G), Math.round((b.z + az * k) / G)]); };
function post(i, j, dn, ds) { const k = i + ',' + j, p = posts.get(k) || { n: 0, s: 0 }; posts.set(k, p); p.n += dn; p.s += ds;
  const want = p.n > 0 ? (p.s > 0 ? 'stone' : 'log') : null; if (want === p.kind) return; if (p.mesh) scene3().remove(p.mesh); p.kind = want;
  if (!want) { posts.delete(k); return; } const x = i * G, z = j * G; p.mesh = postMesh(0, want === 'stone'); p.mesh.position.set(x, groundY(x, z), z); scene3().add(p.mesh); }
export function model(key, b, stage = 0) { const gy = gyOf(b);
  if (key === 'wall') return palisadeMesh(gy, stage, b.id || 1);
  if (key === 'reinforced_wall') return stoneMesh(gy, stage, b.id || 1);
  if (key === 'gate') return gateMesh(gy, stage);
  if (key === 'spike_trap') return spikeMesh(gy, b.spent, b.id || 1);
  return key === 'craftbench' ? benchMesh() : key === 'bed' ? bedMesh() : key === 'torch' ? torchMesh() : fireGhost(); }
function fireGhost() { const g = new THREE.Group(), m = new THREE.MeshBasicMaterial(); for (let k = 0; k < 9; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), m); s.position.set(Math.cos(k * 0.7) * 0.6, 0.08, Math.sin(k * 0.7) * 0.6); g.add(s); }
  for (let k = 0; k < 3; k++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 6).rotateZ(1.2), m); l.rotation.y = k * 2.1; l.position.y = 0.25; g.add(l); } return g; }
const stageOf = (b) => !b.max ? 0 : b.hp / b.max < 0.34 ? 2 : b.hp / b.max < 0.67 ? 1 : 0;
const drop = (m) => { scene3().remove(m); m.traverse(o => o.geometry?.dispose()); }; // (materials are shared)
function setMesh(b) { const s = scene3(); if (b.mesh) drop(b.mesh); b.mesh = model(b.key, b, b.stage); b.mesh.position.set(b.x, b.y, b.z); b.mesh.rotation.y = b.f; s.add(b.mesh);
  if (b.key === 'gate') { b.leaf = b.mesh.userData.leaf; b.leaf.rotation.y = b.swing || 0; } }
// called by craft.js addBuilt for the slice 12 pieces
export function makePiece(b, hp, st) { const P = PIECE[b.key]; b.type = b.key; b.slot = slotOf(b.x, b.z);
  if (P.hp) { b.max = P.hp; b.hp = hp ?? P.hp; } if (b.key === 'gate') { b.open = !!st; b.swing = st ? -1.5 : 0; } if (b.key === 'spike_trap') b.spent = !!st;
  b.stage = stageOf(b); setMesh(b);
  if (P.edge) { const [ax, az] = axis(b.f), r = P.stone ? 0.34 : 0.3, top = b.y + P.top;
    for (const k of [-0.9, -0.45, 0, 0.45, 0.9]) b.cols.push(Object.assign(addCollider(b.x + ax * k, b.z + az * k, r, b), { vr: 0.45, top, stand: top, base: b.y, bp: b, gate: b.key === 'gate' ? b : undefined }));
    for (const [i, j] of ends(b)) post(i, j, 1, P.stone ? 1 : 0); }
  return b; }

// ── Health: the host's game damages a piece and tells everyone; every game shows the hit, the damage and the fall ──
export function damageBuilt(b, dmg, from) { if (joining() || !(b.hp > 0) || !built.includes(b)) return; b.hp = Math.max(0, b.hp - dmg); showHit(b, from);
  send('all', { t: 'bst', id: b.id, hp: Math.round(b.hp) }); if (b.hp <= 0) { removeBuilt(b, 'fell'); send('all', { t: 'gone', id: b.id, how: 'fell' }); } }
function showHit(b, from) { b.barT = 6; b.shakeT = 0.22; const P = PIECE[b.key], [ax, az] = axis(b.f);
  let t = 0; if (from) t = Math.max(-0.9, Math.min(0.9, (from.x - b.x) * ax + (from.z - b.z) * az)); const nx = -az, nz = ax, side = from ? Math.sign((from.x - b.x) * nx + (from.z - b.z) * nz) || 1 : 1;
  const at = new THREE.Vector3(b.x + ax * t + nx * side * 0.3, b.y + 0.9 + Math.random() * 0.6, b.z + az * t + nz * side * 0.3);
  hitBurst(at, new THREE.Vector3(nx * side, 0.3, nz * side), P.stone ? 'stone' : 'wood', 12, false); sfx(P.stone ? 'chitin' : 'chop', at, 0.7);
  const s = stageOf(b); if (s !== b.stage && b.hp > 0) { b.stage = s; setMesh(b); dustPuff(at, 16); sfx('creak', at, 0.6); } }
// a piece goes: torn down by its builder (a puff, the posts it alone used go too) or fallen to enemies (it topples or
// crumbles, with dust and a crash, and leaves rubble that sinks away after a while)
const falling = [];
export function removeBuilt(b, how) { const i = built.indexOf(b); if (i < 0) return; built.splice(i, 1);
  for (const c of b.cols) { c.r = 0; c.vr = 0; } const s = scene3(), at = new THREE.Vector3(b.x, b.y + 0.8, b.z), P = PIECE[b.key] || {};
  if (b.flame) b.flame.visible = false; if (P.edge) for (const [i2, j] of ends(b)) post(i2, j, -1, P.stone ? -1 : 0);
  if (player.bed === b.id) { player.bed = null; log('Your bed is gone: you will not wake there now.'); }
  logEvent(how === 'fell' ? 'collapse' : 'torn', { key: b.key, x: +b.x.toFixed(1), z: +b.z.toFixed(1) });
  if (how !== 'fell') { s.remove(b.mesh); dustPuff(at, 18); sfx('thud', at, 0.6); return; }
  const rub = rubbleMesh(gyOf(b), !!P.stone, b.id); rub.position.set(b.x, b.y, b.z); rub.rotation.y = b.f; s.add(rub);
  for (let k = -1; k <= 1; k++) { const [ax, az] = axis(b.f), q = new THREE.Vector3(b.x + ax * k * 0.8, b.y + 0.6, b.z + az * k * 0.8); dustPuff(q, 26); hitBurst(q, new THREE.Vector3(0, 1, 0), P.stone ? 'stone' : 'wood', 26, false); }
  sfx('crash', at); falling.push({ m: b.mesh, rub, t: 0, stone: !!P.stone, dir: Math.random() < 0.5 ? -1 : 1 });
  floatText(new THREE.Vector3(b.x, b.y + 2.6, b.z), `The ${P.name || b.key} falls!`, '#ffb07a'); }

// ── Gates and traps ──
export const gateNear = (x, z) => built.find(b => b.key === 'gate' && Math.hypot(b.x - x, b.z - z) < 2.0);
export function toggleGate(b) { if (joining()) { send('host', { t: 'gate', id: b.id }); return; } setGate(b, !b.open); send('all', { t: 'bst', id: b.id, open: b.open ? 1 : 0 }); }
function setGate(b, open) { if (b.open === open) return; b.open = open; sfx('creak', b, 0.5); logEvent('gate', { id: b.id, open }); }
function spring(b, e) { b.spent = true; setMesh(b); sfx('thunk', b); sfx('hitHard', b, 0.7); hitBurst(new THREE.Vector3(b.x, b.y + 0.3, b.z), new THREE.Vector3(0, 1, 0), 'wood', 16, false);
  if (e) logEvent('spike', { enemy: e.type }); }

// ── Teardown: hold X (RB) by your own piece (or one whose builder has left the game) ──
const mine = (b) => b.by === net.id || !others.has(b.by);
export function tearTarget(x, z) { let best = null, bd = 2.3;
  for (const b of built) { if (!mine(b)) continue; const d = b.cols.length ? Math.min(...b.cols.map(c => Math.hypot(c.x - x, c.z - z) - c.r)) + 0.4 : Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; best = b; } } return best; }
export const refundOf = (key) => { const r = RECIPES.find(q => q.key === key), o = {}; for (const k in r?.cost || {}) if (Math.floor(r.cost[k] / 2)) o[k] = Math.floor(r.cost[k] / 2); return o; };
export const pieceName = (b) => PIECE[b.key]?.name || b.key;
// (one piece per hold: after one comes down, X is let go before the next)
let tearLock = false;
export function tickTear(dt, held) { if (!held) tearLock = false; const b = held && !tearLock && !mode && !player.dead && !(player.down > 0) ? tearTarget(player.x, player.z) : null;
  if (!b) { player.tear = null; return; } if (player.tear?.b !== b) player.tear = { b, t: 0, T: 0.9 }; player.tear.t += dt;
  if (player.tear.t >= player.tear.T) { player.tear = null; tearLock = true; tear(b); } }
function tear(b) { if (joining()) { send('host', { t: 'tear', id: b.id }); return; } removeBuilt(b, 'torn'); send('all', { t: 'gone', id: b.id, how: 'torn', by: net.id }); refund(b); }
function refund(b) { const got = refundOf(b.key); spend(got, -1); const txt = Object.entries(got).map(([k, v]) => `+${v} ${k}`).join('  ');
  log(`Tore down the ${pieceName(b)}${txt ? ': ' + txt.replace(/\+/g, '').replace(/ {2}/g, ', ') + ' back' : ''}.`); if (txt) floatText(new THREE.Vector3(player.x, player.y + 2, player.z), txt, '#e8b878'); logEvent('refund', got); }

// co-op messages (coop.js routes them)
export function onTearReq(m, from) { if (net.role !== 'host') return; const b = built.find(q => q.id === m.id); if (!b || !(b.by === from || !others.has(b.by) && b.by !== net.id)) return;
  removeBuilt(b, 'torn'); send('all', { t: 'gone', id: b.id, how: 'torn', by: from }); }
export function onGateReq(m) { if (net.role !== 'host') return; const b = built.find(q => q.id === m.id && q.key === 'gate'); if (b) toggleGate(b); }
export function onGone(m) { const b = built.find(q => q.id === m.id); if (!b) return; removeBuilt(b, m.how); if (m.how === 'torn' && m.by === net.id) refund(b); }
export function onBst(m) { const b = built.find(q => q.id === m.id); if (!b) return;
  if (m.hp != null && m.hp < b.hp) { b.hp = m.hp; showHit(b, null); } else if (m.hp != null) b.hp = m.hp;
  if (m.open != null) setGate(b, !!m.open); if (m.spent && !b.spent) spring(b, null); }
export const pieceState = (b) => b.key === 'gate' ? (b.open ? 1 : 0) : b.key === 'spike_trap' ? (b.spent ? 1 : 0) : 0;

// ── Enemies and walls: the first wall or shut gate on an enemy's way toward (dx, dz) within `max` m, or null ──
export function wallAhead(x, z, dx, dz, r, max) { for (let s = 0.3; s <= max; s += 0.3) { const px = x + dx * s, pz = z + dz * s;
  for (const c of nearColliders(px, pz)) if (c.bp && c.r && c.bp.hp > 0 && !(c.gate && c.gate.open) && Math.hypot(c.x - px, c.z - pz) < c.r + r) return c.bp; } return null; }
// pieces in a fort: walls and gates within 7 m of it (IW1: three or more and the enemy always breaks in)
export const fortSize = (b) => built.filter(q => q.max && Math.hypot(q.x - b.x, q.z - b.z) < 7).length;
// health bars over pieces hit lately (game.js draws them with the enemies')
export function pieceBars(cx, cz) { const out = []; for (const b of built) if (b.barT > 0 && b.max) { const d = Math.hypot(b.x - cx, b.z - cz); if (d < 28) out.push({ d, p: new THREE.Vector3(b.x, b.y + PIECE[b.key].top + 0.35, b.z), frac: b.hp / b.max }); } return out; }

// ── Build mode ──
let mode = null, ghost = null, ghostSig = '', grid = null, gridSig = '';
const hudEl = document.getElementById('build');
export const building = () => !!mode;
export function startBuild(r) { mode = { r, rot: 0 }; ghostSig = gridSig = ''; logEvent('build-mode', { key: r.key }); renderHud(true); }
export function endBuild() { if (!mode) return; mode = null; if (ghost) ghost.visible = false; if (grid) grid.visible = false; hudEl.classList.add('hidden'); }
export function rotateBuild(n = 1) { if (mode) { mode.rot = (mode.rot + n + 4) % 4; sfx('toss', null, 0.25); } }
const GOOD = new THREE.MeshBasicMaterial({ color: 0x7aff9a, transparent: true, opacity: 0.4, depthWrite: false }), BAD = new THREE.MeshBasicMaterial({ color: 0xff5a46, transparent: true, opacity: 0.42, depthWrite: false });
const GRID = new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
let spot = null;
// the ghost follows the aim every frame; its model is rebuilt only when it moves to another slot or turns
function tickGhost() { const key = mode.r.key; spot = placeSpot(key); const sig = key + spot.slot + spot.f.toFixed(2) + spot.y.toFixed(1);
  if (sig !== ghostSig) { ghostSig = sig; if (ghost) drop(ghost); ghost = model(key, { x: spot.x, y: spot.y, z: spot.z, f: spot.f, id: 1 }); ghost.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.renderOrder = 5; } });
    ghost.position.set(spot.x, spot.y, spot.z); ghost.rotation.y = spot.f; scene3().add(ghost); }
  ghost.visible = true; ghost.traverse(o => { if (o.isMesh) o.material = spot.ok ? GOOD : BAD; });
  const ci = Math.floor(spot.x / G), cj = Math.floor(spot.z / G), gs = ci + ',' + cj; if (gs !== gridSig) { gridSig = gs; drawGrid(ci, cj); } grid.visible = true; }
// a patch of grid lines round the ghost, lying on the ground: thin strips every 2 m, sampled every half metre
function drawGrid(ci, cj) { const N = 3, W = 0.045, pos = [], idx = [];
  const strip = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 0.5), px = -(z1 - z0) / L * W, pz = (x1 - x0) / L * W, b = pos.length / 3;
    for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n, y = groundY(x, z) + 0.05; pos.push(x - px, y, z - pz, x + px, y, z + pz); if (k) idx.push(b + 2 * k - 2, b + 2 * k - 1, b + 2 * k, b + 2 * k - 1, b + 2 * k + 1, b + 2 * k); } };
  for (let k = -N; k <= N + 1; k++) { strip((ci - N) * G, (cj + k) * G, (ci + N + 1) * G, (cj + k) * G); strip((ci + k) * G, (cj - N) * G, (ci + k) * G, (cj + N + 1) * G); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  if (!grid) { grid = new THREE.Mesh(g, GRID); grid.renderOrder = 4; scene3().add(grid); } else { grid.geometry.dispose(); grid.geometry = g; } }
export function placeNow() { if (!mode) return false; const r = mode.r, s = placeSpot(r.key);
  if (!s.ok) { log(`Cannot build there: ${s.why}`); sfx('chitin', null, 0.4); return false; }
  if (r.bench && !benchNear(player.x, player.z)) { log(`The ${PIECE[r.key].name} needs a craftbench: stand within ${BENCH_R} m of one.`); return false; }
  const miss = short(r.cost); if (miss.length) { log(`${r.label}: you need ${miss.join(', ')} more.`); endBuild(); return false; }
  spend(r.cost); const msg = { key: r.key, x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2), f: +s.f.toFixed(3) };
  if (joining()) send('host', { t: 'build', ...msg }); else { const id = nextBuiltId(); addBuilt(id, r.key, s.x, s.y, s.z, s.f, net.id); send('all', { t: 'built', id, ...msg, by: net.id }); }
  logEvent('build', { ...msg, ...player.inv }); ghostSig = '';
  if (!PIECE[r.key].edge && !PIECE[r.key].keep && r.key !== 'spike_trap') endBuild(); else if (short(r.cost).length) { log(`That was the last ${PIECE[r.key].name} you have materials for.`); endBuild(); }
  return true; }
// keys while building: true when the key was build mode's (movement, looking, jumping and X still work)
export function buildKey(e) { if (!mode) return false; const c = e.code; if (e.repeat && c !== 'KeyR') return c === 'KeyE' || c === 'Enter';
  if (c === 'KeyR') rotateBuild(e.shiftKey ? -1 : 1);
  else if (c === 'KeyE' || c === 'Enter') placeNow();
  else if (c === 'Escape') endBuild();
  else if (c === 'Tab') { endBuild(); toggleCraft(true); }
  else return false;
  return true; }
// a pad while building: A places, B ends it, RB or the d-pad's left and right turn the piece
export function buildPad(p) { if (!mode || !p) return; if (p.jump) placeNow(); if (p.use) endBuild(); if (p.rb || p.right) rotateBuild(1); if (p.left) rotateBuild(-1); }
function renderHud(force) { if (!mode) return; const r = mode.r, pad = isPadActive(), have = r.cost ? Object.keys(r.cost).map(k => `${r.cost[k]} ${k} (${player.inv[k] || 0})`).join(', ') : '';
  const keys = pad ? 'A place · RB turn · B done' : 'Click or E place · R turn · Tab or right-click done', why = spot && !spot.ok ? spot.why : '';
  const html = `<b>BUILD · ${PIECE[r.key].name.toUpperCase()}</b> <span>${have}</span><br><small>${keys}</small>${why ? `<em>${why}</em>` : ''}`;
  if (force || hudEl.dataset.h !== html) { hudEl.dataset.h = html; hudEl.innerHTML = html; } hudEl.classList.remove('hidden'); }

// ── Every frame: the ghost, gates swinging, traps (the host's), hit shakes, falling walls and their rubble ──
export function tickBuild(dt) {
  if (mode && (player.dead || player.down > 0 || player.out)) endBuild();
  if (mode) { tickGhost(); renderHud(); }
  const host = !joining(), P = players();
  for (const b of built) {
    if (b.mesh && b.cols.length) b.mesh.visible = !b.hidden; // a wall between the camera and the player is hidden, like trees
    if (b.barT > 0) b.barT -= dt;
    if (b.shakeT > 0) { b.shakeT -= dt; const k = Math.max(0, b.shakeT) * 0.15; b.mesh.position.set(b.x + (Math.random() - 0.5) * k, b.y, b.z + (Math.random() - 0.5) * k); if (b.shakeT <= 0) b.mesh.position.set(b.x, b.y, b.z); }
    if (b.key === 'gate') { const [ax, az] = axis(b.f), nx = -az, nz = ax; let want = b.open ? -1.5 : 0;
      if (!b.open) for (const p of P) { const lx = (p.x - b.x) * ax + (p.z - b.z) * az, ln = (p.x - b.x) * nx + (p.z - b.z) * nz; if (Math.abs(lx) < 1.2 && Math.abs(ln) < 1.7) { want = ln > 0 ? 1.35 : -1.35; break; } } // it swings away from a player walking through
      const was = b.swing; b.swing += (want - b.swing) * Math.min(1, dt * 7); if (b.leaf) b.leaf.rotation.y = b.swing; if (Math.abs(was) < 0.05 && Math.abs(b.swing) >= 0.05) sfx('creak', b, 0.3); }
    if (host && b.key === 'spike_trap' && !b.spent) for (const e of enemies) { if (e.dead || e.state === 'lurk') continue;
      if (Math.hypot(e.x - b.x, e.z - b.z) < 0.75 + 0.25 * (e.mesh.scale.x || 1)) { const d = Math.hypot(e.x - b.x, e.z - b.z) || 1;
        hitEnemy(e, 35, (e.x - b.x) / d, (e.z - b.z) / d, new THREE.Vector3(e.x, b.y + 0.4, e.z), b.by !== net.id && others.has(b.by) ? b.by : null); spring(b, e); send('all', { t: 'bst', id: b.id, spent: 1 }); break; } } }
  for (let i = falling.length - 1; i >= 0; i--) { const f = falling[i]; f.t += dt;
    if (f.m) { const k = Math.min(1, f.t / 0.8); if (f.stone) { f.m.scale.y = Math.max(0.05, 1 - k * k); f.m.position.y -= dt * 0.4; } else f.m.rotation.x = f.dir * 1.45 * k * k;
      if (k >= 1) { scene3().remove(f.m); f.m = null; } }
    if (f.t > 25) { f.rub.position.y -= dt * 0.3; if (f.t > 28) { scene3().remove(f.rub); falling.splice(i, 1); } } } }
// for the checks: build `key` at grid slot (x, z) facing f, as the host would (null, with the reason, if it does not fit)
export function putPiece(key, x, z, f = 0) { const y = isEdge(key) ? Math.min(...[-1, 0, 1].map(k => groundY(x + Math.cos(f) * k, z - Math.sin(f) * k))) : Math.max(groundY(x, z), standAt(x, z, groundY(x, z) + STEP)), ok = spotFree(key, x, y, z, f);
  if (!ok.ok) return ok.why; const id = nextBuiltId(); addBuilt(id, key, x, y, z, f, net.id); send('all', { t: 'built', id, key, x, y, z, f, by: net.id }); return built.find(b => b.id === id); }
// a new game clears every piece and its rubble (the host's game starts an empty world)
export function clearBuilt() { endBuild(); for (const b of [...built]) { for (const c of b.cols) { c.r = 0; c.vr = 0; } scene3().remove(b.mesh); } built.length = 0;
  for (const p of posts.values()) scene3().remove(p.mesh); posts.clear(); for (const f of falling) { if (f.m) scene3().remove(f.m); scene3().remove(f.rub); } falling.length = 0; }
