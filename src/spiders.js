// Spiders' ways (slice 22, #51): webs, nests and the drop at night. The models are spider.js; the spiders themselves
// are ordinary enemies (game.js runs their hunting like any other animal's).
//  webs   A hunting spider leaves a web on the ground every 8 s (IW1's ruins spider); a web slows anyone walking through it
//         to 40% (players only: spiders run over silk). Each web is timed by the shared day clock and keyed by its
//         spider and slot, so a joined game lays the same webs where the host's does without a message of its own.
//         Webs last 40 s; a nest keeps four round it while it stands.
//  nests  The dens rule of #9: up to three nests in the Ruins and three in the Fungal Hollow, placed from the world's
//         seed on open ground; a nest is an enemy that never moves (game.js skips its thinking) and, while a player is
//         within 75 m, sends a spider out of its mouth every 12 s (7 at night) until three (four at night) are out, and
//         never again once it is torn apart. Its spiders keep near it until they see someone.
//  drop   The goal beyond the goal (Jared's, for Zachary): at night, a player under a tree, a giant mushroom or a ruined
//         wall in the Ruins or the Hollow has a spider come down on a thread beside them: a still moment at the top,
//         a fast drop, a second hanging at head height with its legs spread, then it lets go and attacks. Each player's
//         first comes 5 to 12 s into the night there, then one every minute or so. Shoot it on its thread and it falls.
import * as THREE from 'three';
import { SEED, HALF, SAFE_R, WATER_Y, ENEMY } from './config.js';
import { groundY, biomeAt, slopeAt } from './world.js';
import { nearColliders, colR, placed, addCollider, floorY } from './props.js';
import { buildings } from './plan.js';
import { day, DAY_S, nightK } from './daynight.js';
import { sfx } from './audio.js';
import { dustPuff } from './effects.js';
import { spiderGlow } from './spider.js';
import { floatText } from './effects.js';

export { biomeAt }; // (for the checks)
const clock = () => (day.n + day.t) * DAY_S;
const hash = (a, b, c = 0) => { const n = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return n - Math.floor(n); };
const HUNT = new Set(['chase', 'windup', 'recover']);
const isSpider = (t) => !!ENEMY[t]?.spider; // (every kind of spider; the nest is not one)
const KIND = { ruins: 'spider', fungal: 'spider_pale' }; // what a nest sends out and what drops at night, by biome
// each spider's own size, from its id (so a joined game sees the same): a range per kind, and now and then a big wolf spider
const SIZE = { wolf: [0.8, 1.15], pale: [0.85, 1.1], widow: [0.75, 1.0], brute: [0.95, 1.25] };
function sizeOf(id, kind) { const [a, b] = SIZE[kind] || [1, 1], h = hash(id, 3.7, 1.3); return kind === 'wolf' && hash(id, 9.1) < 0.06 ? 1.45 : a + (b - a) * h; }
let scene = null;

// ── Webs ──
export const webs = []; // { x, z, r, until (day-clock seconds), key, perm (its nest), mesh }
let WM = null;
function webMat() { if (WM) return WM;
  // a sheet web seen from above: threads radiating from the hub to anchor points round the rim, a loose spiral, and a
  // tangle of cross threads over a faint white haze (the canvas is the alpha too: outside the rim is clear)
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), R = 122, hub = [128 + 6, 128 - 4];
  const haze = g.createRadialGradient(128, 128, 10, 128, 128, R); haze.addColorStop(0, 'rgba(255,255,255,0.22)'); haze.addColorStop(0.8, 'rgba(255,255,255,0.12)'); haze.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = haze; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineCap = 'round';
  const spokes = []; for (let i = 0; i < 17; i++) { const a = (i + hash(i, 1) * 0.6) / 17 * 6.283, r = R * (0.82 + hash(i, 2) * 0.18); spokes.push([a, r]);
    g.lineWidth = 1.3; g.beginPath(); g.moveTo(...hub); g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); g.stroke(); }
  g.lineWidth = 0.9; for (let ring = 10; ring < R; ring += 7 + hash(ring, 3) * 6) { g.beginPath(); spokes.forEach(([a, r], i) => { if (ring > r) return; const k = ring + hash(ring, i) * 4;
      const x = hub[0] + (128 - hub[0]) * k / R + Math.cos(a) * k, y = hub[1] + (128 - hub[1]) * k / R + Math.sin(a) * k; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 0.7; for (let i = 0; i < 70; i++) { const a = hash(i, 4) * 6.283, b = a + 0.4 + hash(i, 5) * 2, r1 = R * (0.2 + hash(i, 6) * 0.75), r2 = R * (0.2 + hash(i, 7) * 0.75);
    g.beginPath(); g.moveTo(128 + Math.cos(a) * r1, 128 + Math.sin(a) * r1); g.lineTo(128 + Math.cos(b) * r2, 128 + Math.sin(b) * r2); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (WM = new THREE.MeshStandardMaterial({ map: t, color: 0xf2f0e8, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -4, emissive: 0x302e2a })); } // (a faint glow of its own, so a web still shows by moonlight)
// draped over the ground: strung a hand's width up at its rim (on stalks and stones), sagging toward the hub
function webGeo(x, z, r) { const g = new THREE.PlaneGeometry(r * 2, r * 2, 10, 10); g.rotateX(-Math.PI / 2); const p = g.attributes.position, G = floorY(x, z) > groundY(x, z) + 0.05 ? floorY : groundY; // (on a floor only when its middle is: one beside a stoop stays on the dirt)
  for (let i = 0; i < p.count; i++) { const vx = p.getX(i), vz = p.getZ(i), k = Math.min(1, Math.hypot(vx, vz) / r); p.setXYZ(i, x + vx, G(x + vx, z + vz) + 0.04 + k * k * 0.12, z + vz); } // (a house's floor, not the dirt under it: the quality pass)
  g.computeVertexNormals(); g.computeBoundingSphere(); return g; }
export function addWeb(x, z, { r = 1.6, life = 40, key = null, perm = null } = {}) {
  if (!scene || (key && webs.some(w => w.key === key))) return null;
  const mesh = new THREE.Mesh(webGeo(x, z, r), webMat()); mesh.rotation.y = 0; mesh.renderOrder = 2; mesh.receiveShadow = true; scene.add(mesh);
  const w = { x, z, r, until: perm ? Infinity : clock() + life, key, perm, mesh }; webs.push(w);
  while (webs.length > 60) { const i = webs.findIndex(q => !q.perm); if (i < 0) break; dropWeb(i); } // (the oldest roaming one goes first)
  return w; }
function dropWeb(i) { const w = webs[i]; scene?.remove(w.mesh); w.mesh.geometry.dispose(); webs.splice(i, 1); }
export function clearWebs() { while (webs.length) dropWeb(webs.length - 1); }
// how much a web slows someone at (x, z) with their feet at y: 0.4 inside one (feet on the ground), else 1
export function webSlow(x, z, y) { for (const w of webs) if (Math.hypot(x - w.x, z - w.z) < w.r * 0.92 && y < floorY(x, z) + 0.7) return 0.4; return 1; }

// ── Nests ──
let SITES = null;
export let nestSites = []; // (this world's, once a game has started)
function findNestSites() { if (SITES) return SITES; const cand = [], s0 = SEED % 9973;
  for (let z = -HALF + 80; z <= HALF - 80; z += 12) for (let x = -HALF + 80; x <= HALF - 80; x += 12) { const b = biomeAt(x, z); if (b !== 'ruins' && b !== 'fungal') continue;
    if (Math.hypot(x, z) < SAFE_R + 40 || slopeAt(x, z) > 0.3 || groundY(x, z) < WATER_Y + 0.8) continue;
    if (![[16, 0], [-16, 0], [0, 16], [0, -16]].every(([a, c]) => biomeAt(x + a, z + c) === b)) continue; // (well inside its biome)
    if (nearColliders(x, z).some(c => c.r && Math.hypot(c.x - x, c.z - z) < colR(c, x, z) + 3.5)) continue; // (room for the mound and its webs)
    cand.push({ x, z, b, k: hash(x, z, s0) }); }
  cand.sort((a, b) => a.k - b.k); SITES = [];
  for (const q of cand) if (SITES.filter(s => s.b === q.b).length < 3 && SITES.every(s => Math.hypot(s.x - q.x, s.z - q.z) > 110)) SITES.push({ x: q.x, z: q.z, b: q.b });
  return SITES; }

// ── A new game: the webs go; the host's game sets the nests down (a joined one gets them from the host) ──
let drops = new WeakMap(); // player -> seconds to their next drop
export function startSpiders(sc, host, spawn) { scene = sc; clearWebs(); clearGlobs(); drops = new WeakMap(); if (host) for (const s of (nestSites = findNestSites())) spawn(s.x, s.z, 'spider_nest').home = s; }

// where a spider can come down by player q: under the nearest tree, giant mushroom or ruined wall within 9 m
function anchorNear(q) { let best = null, bd = 9;
  for (const [type, h] of [['deadtree', 6.5], ['oak', 6.5], ['shroom', 0]]) for (const t of placed[type] || []) { const dx = q.x - t.x, dz = q.z - t.z; if (Math.abs(dx) > bd || Math.abs(dz) > bd) continue;
    const d = Math.hypot(dx, dz); if (d < bd && d > 1.2) { bd = d; best = { x: t.x, z: t.z, h: h || Math.min(6.5, t.s * 0.7), tree: true }; } }
  for (const b of buildings) { if (b.kind !== 'house' && b.kind !== 'tower') continue; const dx = q.x - b.x, dz = q.z - b.z; if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue;
    const lx = dx * b.ca + dz * b.sa, lz = -dx * b.sa + dz * b.ca, cx = Math.max(-b.w / 2, Math.min(b.w / 2, lx)), cz = Math.max(-b.d / 2, Math.min(b.d / 2, lz));
    const d = Math.hypot(lx - cx, lz - cz); if (d < 1 || d >= bd) continue; // (outside it, by a wall: its top is where the spider waits)
    const ox = (lx - cx) / d * 0.9, oz = (lz - cz) / d * 0.9; bd = d; best = { x: b.x + (cx + ox) * b.ca - (cz + oz) * b.sa, z: b.z + (cx + ox) * b.sa + (cz + oz) * b.ca, h: b.h ?? 3, wall: true }; }
  if (!best) return null;
  // beside the player, not on them: a tree's spider comes down 1.8 m to one side of the line to them (the open side)
  if (best.tree) { const dx = q.x - best.x, dz = q.z - best.z, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
    const fy = q.faceYaw ?? q.f ?? 0, fx = -Math.sin(fy), fz = -Math.cos(fy), ahead = (side) => (-uz * side) * fx + (ux * side) * fz; // (round 2: the side in front of where they face first, so the third-person camera sees it come down)
    for (const side of ahead(1) >= ahead(-1) ? [1, -1] : [-1, 1]) { const x = best.x + ux * Math.min(1.2, d * 0.4) - uz * 1.8 * side, z = best.z + uz * Math.min(1.2, d * 0.4) + ux * 1.8 * side;
      if (slopeAt(x, z) < 0.8 && groundY(x, z) > WATER_Y && !nearColliders(x, z).some(c => c.r && Math.hypot(c.x - x, c.z - z) < colR(c, x, z) + 0.5)) return { ...best, x, z }; }
    return null; }
  return best; }

// ── Every frame (every game; what only the host decides is marked) ──
// ctx: { scene, enemies, players (every player still in the game), host, spawn(x, z, type) -> enemy, log, logEvent, t, me (this game's player) }
let webSaid = -1e9;
const threads = new Map(); // spider -> its thread mesh
// ── Web globs (#66): the pale spider's spit. Every game flies each glob (the host's game launches it and tells the others),
// and each tests it against its own player only, so a dodge counts where it was made. held: this game's player's feet ──
export const globs = [], held = { t: 0, slow: 0 };
const GRAV = 3; let GLOB = null;
export function spit(o, v) { GLOB ||= new THREE.MeshStandardMaterial({ color: 0xeeeae0, roughness: 0.5, transparent: true, opacity: 0.9 });
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), GLOB); m.position.set(...o); scene.add(m);
  globs.push({ m, v: new THREE.Vector3(...v), t: 0 }); sfx('web', { x: o[0], z: o[2] }, 1.2); }
// walking pace while held (none) or slowed (half)
export const holdK = () => held.t > 0 ? 0 : held.slow > 0 ? 0.5 : 1;
const inBody = (p, q) => Math.hypot(p.x - q.x, p.z - q.z) < 0.6 && p.y > (q.y ?? groundY(q.x, q.z)) - 0.1 && p.y < (q.y ?? groundY(q.x, q.z)) + 1.9;
function tickGlobs(dt, me, easy, log, players) {
  if (held.t > 0) held.t -= dt; else if (held.slow > 0) held.slow -= dt;
  if (me?.dead || me?.down > 0) held.t = held.slow = 0;
  for (let i = globs.length - 1; i >= 0; i--) { const g = globs[i], p = g.m.position; g.t += dt; g.v.y -= GRAV * dt; p.addScaledVector(g.v, dt); g.m.rotation.x += dt * 6;
    const hit = me && !me.dead && inBody(p, me), ground = p.y < groundY(p.x, p.z) + 0.1;
    // (the stranger's review) another player's body stops it too, with no web (their own game holds them), and so does a trunk,
    // a rock or a wall; over water it sinks without a web
    const stop = players.some(q => q !== me && inBody(p, q)) || p.y < WATER_Y || nearColliders(p.x, p.z).some(c => c.r && p.y < groundY(p.x, p.z) + 3 && Math.hypot(c.x - p.x, c.z - p.z) < colR(c, p.x, p.z));
    if (!hit && !ground && !stop && g.t < 3) continue;
    if (hit) { const sp = ENEMY.spider_pale.spit; if (!(held.t > 0 || held.slow > 0)) { held.t = easy ? 0 : sp.hold; held.slow = sp.slow + (easy ? sp.hold : 0); }
      sfx('web', me, 1.3); floatText(new THREE.Vector3(me.x - Math.sin(me.yaw) * 2.5, me.y + 1.5, me.z - Math.cos(me.yaw) * 2.5), easy ? /* (ahead of the eyes: seen in first person too) */ 'Webbed! Slowed' : 'Stuck in a web!', '#f4f0e6', true); log?.(easy ? 'A web glob sticks to you: you wade on.' : 'A web glob pins your feet for a moment!'); }
    else if (ground && !stop) addWeb(p.x, p.z, { r: 1.3, life: 15 }); // a miss: a sticky patch where it lands
    g.m.removeFromParent(); g.m.geometry.dispose(); globs.splice(i, 1); } }
export function clearGlobs() { for (const g of globs) { g.m.removeFromParent(); g.m.geometry.dispose(); } globs.length = 0; held.t = held.slow = 0; }

export function tickSpiders(dt, { scene: sc, enemies, players, host, spawn, log, logEvent, t, me, easy }) {
  scene = sc; const C = clock(); spiderGlow(); tickGlobs(dt, me, easy, log, players);
  for (let i = webs.length - 1; i >= 0; i--) { const w = webs[i]; if (C > w.until || (w.perm && w.perm.dead) || (w.until !== Infinity && C < w.until - 1e5)) dropWeb(i); } // (a reset clock clears the roaming ones too; review: Infinity - 1e5 is Infinity, which dropped and rebuilt every nest's webs each frame)
  for (const e of enemies) {
    if (e.type === 'spider_nest') { const u = e.mesh.userData;
      if (!e.dead && !u.col) { u.col = addCollider(e.x, e.z, 1.05, null); u.dispose = () => { u.col.r = 0; }; } // (solid while it stands)
      if (e.dead) { if (u.col) u.col.r = 0; if (!e.said) { e.said = true; log('The spider nest is torn apart.'); sfx('crash', e, 0.6); } continue; }
      for (let k = 0; k < 4; k++) { const a = k * 1.571 + hash(e.id, k) * 0.8, r = 2.6 + hash(k, e.id) * 1.2; addWeb(e.x + Math.cos(a) * r, e.z + Math.sin(a) * r, { r: 1.5, key: `n${e.id}:${k}`, perm: e }); }
      if (!host) continue;
      let near = 1e9; for (const q of players) near = Math.min(near, Math.hypot(q.x - e.x, q.z - e.z)); if (near > 75) continue;
      const night = nightK() > 0.5, kids = enemies.filter(o => o.nest === e && !o.dead).length;
      if ((e.spawnT = (e.spawnT ?? 4) - dt) > 0 || kids >= (night ? 4 : 3)) continue;
      e.spawnT = night ? 7 : 12; const m = e.mesh.userData.mouth.getWorldPosition(new THREE.Vector3());
      const s = spawn(m.x, m.z, KIND[e.home?.b] || 'spider'); s.nest = e; s.home = e; s.pack = e.pack; s.yaw = e.mesh.userData.mouthYaw; if (near < 35) s.state = 'chase'; sfx('spider', s, 0.8); continue; }
    if (!isSpider(e.type)) continue;
    if (e.sized !== e.id) { const st = ENEMY[e.type], k = sizeOf(e.id, st.spider); e.mesh.scale.setScalar(st.scale * k); if (host && e.sized == null) e.hp = e.maxHp = Math.round(st.hp * k); e.sized = e.id; } // (a bigger one is tougher)
    // its web, every 8 s while it hunts (by the shared clock: the same slots on every game)
    if (!e.dead && HUNT.has(e.state)) { const slot = Math.floor((C + e.id % 8) / 8); if (e.webSlot != null && slot !== e.webSlot) addWeb(e.x, e.z, { key: `${e.id}:${slot}` }); e.webSlot = slot; } else e.webSlot = null;
    // on its thread: still at the top, a fast drop, a hang at head height, then it lets go (the host decides when)
    if (e.state === 'drop' && !e.dead) { const H = e.dropTop ??= dropHeightAt(e.x, e.z); /* (a joined game is not sent the height: it finds the same tree or wall) */ e.dropT = (e.dropT ?? 0) + dt; let h = H;
      if (e.dropT > 0.35) { h = Math.max(1.3, H - (e.dropT - 0.35) * 9); if (h <= 1.3) { e.hangT = (e.hangT ?? 0) + dt; h = 1.3 + Math.sin(e.hangT * 13) * 0.07 * Math.max(0, 1 - e.hangT / 0.7); if (host && e.hangT > 0.75) { e.state = 'chase'; e.fallV = 0; } } }
      e.dropH = h; }
    else if (e.dropH > 0) { e.fallV = (e.fallV ?? 0) + 9.8 * dt; e.dropH = Math.max(0, e.dropH - e.fallV * dt); if (e.dropH === 0) { dustPuff(new THREE.Vector3(e.x, floorY(e.x, e.z), e.z), 10); sfx('thud', e, 0.5); }
      if (e.dead) e.mesh.position.y = floorY(e.x, e.z) + e.dropH; } // (killed on its thread: it falls; game.js does not move a corpse)
    const want = e.state === 'drop' && !e.dead && !e.gone && e.dropH > 0.05; let th = threads.get(e);
    if (want) { if (!th) { th = new THREE.Mesh(threadGeo(), threadMat()); threads.set(e, th); scene.add(th); }
      const a = e.mesh.userData.spinneret.getWorldPosition(new THREE.Vector3()), top = groundY(e.x, e.z) + e.dropTop + 0.8, L = Math.max(0.05, top - a.y);
      th.position.copy(a); th.scale.set(1, L, 1); }
    else if (th) { scene.remove(th); threads.delete(e); } }
  for (const [e, th] of threads) if (e.gone || !enemies.includes(e)) { scene.remove(th); threads.delete(e); }
  // feedback: the first frame in a web (at most every 20 s)
  if (me && !me.dead && webSlow(me.x, me.z, me.y ?? groundY(me.x, me.z)) < 1) { if (t - webSaid > 20) { log('A web clings to your legs: you wade through it.'); sfx('web', me); } webSaid = t; }
  if (!host) return;
  // the drop
  const night = nightK() > 0.5;
  for (const q of players) { const b = biomeAt(q.x, q.z);
    if (!night || (b !== 'ruins' && b !== 'fungal') || Math.hypot(q.x, q.z) < SAFE_R || q.dead || q.down > 0) { drops.delete(q); continue; }
    if (!drops.has(q)) drops.set(q, 5 + Math.random() * 7); const left = drops.get(q) - dt; drops.set(q, left); if (left > 0) continue;
    const a = anchorNear(q); if (!a) { drops.set(q, 1); continue; } drops.set(q, 55 + Math.random() * 45);
    const s = spawn(a.x, a.z, KIND[b] || 'spider'); Object.assign(s, { state: 'drop', dropTop: a.h, dropH: a.h, dropT: 0, hangT: 0, yaw: Math.atan2(-(q.x - a.x), -(q.z - a.z)), hunter: { until: t + 30 } });
    sfx('spiderdrop', s); logEvent?.('drop', { enemy: 'spider', from: a.tree ? 'tree' : 'wall', d: +Math.hypot(q.x - a.x, q.z - a.z).toFixed(1) }); } }
// the height a spider at (x, z) came down from: the tree, giant mushroom or wall it is under (as anchorNear placed it)
function dropHeightAt(x, z) { for (const [type, h] of [['deadtree', 6.5], ['oak', 6.5], ['shroom', 0]]) for (const t of placed[type] || []) if (Math.abs(x - t.x) < 2.6 && Math.abs(z - t.z) < 2.6 && Math.hypot(x - t.x, z - t.z) < 2.6) return h || Math.min(6.5, t.s * 0.7);
  for (const b of buildings) { const dx = x - b.x, dz = z - b.z; if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue; const lx = dx * b.ca + dz * b.sa, lz = -dx * b.sa + dz * b.ca;
    if (Math.abs(lx) < b.w / 2 + 1.5 && Math.abs(lz) < b.d / 2 + 1.5) return b.h ?? 3; }
  return 6; }
let TG = null, TM = null;
const threadGeo = () => TG ??= new THREE.CylinderGeometry(0.011, 0.011, 1, 4).translate(0, 0.5, 0);
const threadMat = () => TM ??= new THREE.MeshBasicMaterial({ color: 0xe8e6dc, transparent: true, opacity: 0.75 });
