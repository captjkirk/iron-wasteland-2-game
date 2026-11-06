// Deep water (slice 9b, the owner's pick "Something lives in it"): the lakes darken where they are deep, and something
// lives there. Slice 13 (the owner on 9b's shadow, 2026-11-04: "it looks like one giant stupid fish that can dissapear
// into the shoreline, and it is not frequent enough"): it is now a lake serpent about 12 m long that only ever swims where
// the water is deeper than its body (it steers round shallows and its body follows the head's own path), shown by a dark
// shape under the surface, a ragged fin that cuts the water with a wake, bubbles, a low growl, then a lunge: its head and
// neck burst out with a splash and the jaws snap. It finds a swimmer within 2 s of their reaching deep water and comes
// back after every bite; near deep water its fin passes by now and then. Each game's serpent hunts its own player; the
// others' show here as ghosts (co-op, from the `dq` field of each player's message).
// (Slow swimming, the dive and the breath meter are in game.js; the underwater fog in main.js.)
import * as THREE from 'three';
import { HALF, CELL, SEG, N, WATER_Y } from './config.js';
import { H, groundY, biomeAt } from './world.js';
import { splash } from './effects.js';
import { sfx } from './audio.js';

// a dark veil on the water, clear in the shallows and near black where it is deep (the mirror water alone looks the same
// at every depth); built from the height field like the Bog's water
export function buildDeepWater(scene, normals) { SCENE = scene; NORMALS = normals;
  const pos = [], col = [], idx = [], vid = new Map();
  const vert = (i, j) => { const k = j * N + i; if (vid.has(k)) return vid.get(k);
    pos.push(-HALF + i * CELL, WATER_Y + 0.02, -HALF + j * CELL); col.push(0.01, 0.04, 0.06, Math.min(0.78, Math.max(0, (WATER_Y - H[k] - 0.8) / 3.2)));
    vid.set(k, pos.length / 3 - 1); return pos.length / 3 - 1; };
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
    if (Math.min(H[j * N + i], H[j * N + i + 1], H[(j + 1) * N + i], H[(j + 1) * N + i + 1]) > WATER_Y - 0.6) continue;
    const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1); idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx);
  const veil = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
  veil.renderOrder = 1; veil.name = 'deep water'; scene.add(veil);
}

// ── The serpent's body: a head and K spine points 0.75 m apart; each point is pulled after the one in front, so the body
// follows the head's own path (deep water only) and never cuts across a shore ──
const K = 14, GAP = 0.75, RS = 10, NE = 5, UP = new THREE.Vector3(0, 1, 0);
const RAD = (i) => i <= 4 ? 0.42 + 0.08 * i : 0.06 + 0.68 * Math.pow(1 - (i - 4) / (K - 4), 0.8);
const DORSAL = [[1, 0.7], [2, 1.15], [3, 1.4], [4, 1.35], [5, 1.15], [6, 0.85], [7, 0.45]], TAIL = [10, 11, 12, 13, 14];
export const SURF = WATER_Y - 0.8, DEEP = WATER_Y - 2.1; // the body's depth with its fin out of the water, and under it
export const deepAt = (x, z) => groundY(x, z) < WATER_Y - 2 && biomeAt(x, z) !== 'swamp'; // (the Bog is the lurker's)
let SCENE = null, NORMALS = null, MATS = null;
function mats() { if (MATS) return MATS; const n = NORMALS.clone(); n.repeat.set(5, 2); n.needsUpdate = true;
  const wet = { roughness: 0.42, metalness: 0.05, normalMap: n, normalScale: new THREE.Vector2(1.1, 1.1), envMapIntensity: 0.55 };
  MATS = { skin: new THREE.MeshStandardMaterial({ vertexColors: true, ...wet }), head: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, envMapIntensity: 0.55 }),
    jaw: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, envMapIntensity: 0.5 }), // (no ripple map on the head: it pinched at the sphere's poles)
    maw: new THREE.MeshStandardMaterial({ color: 0x3a0c0c, roughness: 0.6 }),
    tooth: new THREE.MeshStandardMaterial({ color: 0xe4dcc4, roughness: 0.35 }), horn: new THREE.MeshStandardMaterial({ color: 0x2f2a22, roughness: 0.5 }),
    fin: new THREE.MeshStandardMaterial({ color: 0x24302b, roughness: 0.45, side: THREE.DoubleSide }),
    eye: new THREE.MeshStandardMaterial({ color: 0x1a1a08, emissive: 0xd8e070, emissiveIntensity: 1.4, roughness: 0.2 }), // pale eyes that show at night too
    shadow: new THREE.MeshBasicMaterial({ color: 0x000000, vertexColors: true, transparent: true, depthWrite: false, opacity: 0 }),
    ring: new THREE.RingGeometry(0.55, 1, 40, 2).rotateX(-Math.PI / 2) };
  { const g = MATS.ring, p = g.attributes.position, a = []; for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getZ(i)); a.push(1, 1, 1, r < 0.6 ? 0 : r > 0.95 ? 0 : 1); } g.setAttribute('color', new THREE.Float32BufferAttribute(a, 4)); } // soft at both edges
  return MATS; }
const dyn = (n, idx) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); if (idx) g.setIndex(idx); return g; };
// a sphere mottled like the body: dark above, pale below, blotched (vertex colours, so the head is not one plastic tone)
function mottled(top, belly) { const g = new THREE.SphereGeometry(1, 22, 14), p = g.attributes.position, c = new THREE.Color(), a = new THREE.Color(top), b = new THREE.Color(belly), col = [];
  for (let i = 0; i < p.count; i++) { const f = Math.max(0, p.getZ(i)); p.setXYZ(i, p.getX(i) * (1 - 0.38 * f), p.getY(i) * (1 - 0.3 * f) - (p.getY(i) > 0 ? 0.12 * f : 0), p.getZ(i)); } // narrowing to the snout
  g.computeVertexNormals();
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = Math.min(1, Math.max(0, (-y - 0.1) / 0.5)), m = 0.65 + 0.35 * Math.abs(Math.sin(x * 9.1 + z * 13.7) * Math.cos(z * 6.3 - y * 8.9));
    c.copy(a).lerp(b, k).multiplyScalar(k > 0.5 ? 1 : m); col.push(c.r, c.g, c.b); } g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return g; }
function makeHead(m) { const h = new THREE.Group(), add = (geo, mat, p, s, r) => { const o = new THREE.Mesh(geo, mat); o.position.set(...p); if (s) o.scale.set(...s); if (r) o.rotation.set(...r); h.add(o); return o; };
  const sph = mottled(0x1b2722, 0x58553f), jawG = mottled(0x2a3029, 0x6a6650), tooth = new THREE.ConeGeometry(1, 1, 6);
  add(sph, m.head, [0, 0.08, 0.95], [0.58, 0.4, 1.12]); // the skull, snout forward (+z), its back at the neck
  for (const s of [-1, 1]) { add(sph, m.head, [s * 0.3, 0.27, 1.1], [0.16, 0.1, 0.42], [0, s * 0.3, 0]); // brow ridges
    add(new THREE.SphereGeometry(1, 10, 8), m.eye, [s * 0.37, 0.2, 1.32], [0.085, 0.085, 0.085]);
    const horn = add(tooth, m.horn, [s * 0.3, 0.38, 0.25], [0.06, 0.7, 0.06]); horn.rotation.set(-2.2, 0, s * 0.35); // swept back
    for (let k = 0; k < 9; k++) { const z = 0.55 + k * 0.15, zl = (z - 0.95) / 1.12, f = Math.max(0, zl), w = 0.58 * Math.sqrt(Math.max(0, 1 - zl * zl)) * (1 - 0.38 * f) * 0.82; // (along the tapered jaw line)
      add(tooth, m.tooth, [s * w, 0.08 - 0.4 * (1 - 0.3 * f) * 0.72, z], [0.035, 0.17 - k * 0.006, 0.035], [Math.PI, 0, 0]); } }
  add(new THREE.SphereGeometry(1, 16, 10), m.maw, [0, -0.14, 0.95], [0.44, 0.2, 0.92]); // the gullet, seen when the jaw drops
  const jaw = new THREE.Group(); jaw.position.set(0, -0.14, 0.12); h.add(jaw);
  const lj = new THREE.Mesh(jawG, m.jaw); lj.scale.set(0.5, 0.16, 1.02); lj.position.set(0, -0.08, 0.86); jaw.add(lj);
  for (const s of [-1, 1]) for (let k = 0; k < 8; k++) { const z = 0.45 + k * 0.15, zl = (z - 0.86) / 1.02, w = 0.5 * Math.sqrt(Math.max(0, 1 - zl * zl)) * (1 - 0.38 * Math.max(0, zl)) * 0.8, t = new THREE.Mesh(tooth, m.tooth);
    t.position.set(s * w, 0.06, z); t.scale.set(0.03, 0.14, 0.03); jaw.add(t); }
  h.userData.jaw = jaw; return h; }
function makeBeast() { const m = mats(), root = new THREE.Group(); root.name = 'deep serpent'; root.visible = false; SCENE.add(root);
  const B = { root, P: Array.from({ length: K + 1 }, () => new THREE.Vector3(0, DEEP, 0)), R: Array.from({ length: K + 1 }, () => new THREE.Vector3()), T: [], Sd: [], U: [],
    t: Math.random() * 10, lp: 0, headY: DEEP, vis: 0, snout: new THREE.Vector3() };
  for (let i = 0; i <= K; i++) { B.T.push(new THREE.Vector3()); B.Sd.push(new THREE.Vector3()); B.U.push(new THREE.Vector3()); }
  // the body: a tube of rings round the spine, dark and mottled above, pale below (the seam runs under the belly)
  const idx = [], uv = [], col = [], top = new THREE.Color(0x17211d), belly = new THREE.Color(0x5e5a44), c = new THREE.Color();
  for (let i = 0; i <= K; i++) for (let k = 0; k <= RS; k++) { const th = -Math.PI / 2 + k / RS * Math.PI * 2, b = Math.min(1, Math.max(0, (-Math.sin(th) - 0.2) / 0.5)), mott = 0.7 + 0.3 * Math.abs(Math.sin(i * 12.9 + k * 7.3));
    c.copy(top).lerp(belly, b).multiplyScalar(b > 0.5 ? 1 : mott); col.push(c.r, c.g, c.b); uv.push(k / RS, i / K * 3); }
  for (let i = 0; i < K; i++) for (let k = 0; k < RS; k++) { const a = i * (RS + 1) + k, b = a + RS + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  B.tube = new THREE.Mesh(dyn((K + 1) * (RS + 1), idx), m.skin); B.tube.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); B.tube.geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  B.head = makeHead(m); root.add(B.tube, B.head);
  // the dorsal sail (spines with a ragged membrane between) and the tail's paddle above and below
  const strip = (n) => { const ix = []; for (let j = 0; j < n - 1; j++) { const a = j * 2; ix.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } return ix; };
  B.sail = new THREE.Mesh(dyn(DORSAL.length * 2, strip(DORSAL.length)), m.fin);
  B.tail = new THREE.Mesh(dyn(TAIL.length * 4, [...strip(TAIL.length), ...strip(TAIL.length).map(v => v + TAIL.length * 2)]), m.fin);
  const spineG = new THREE.CylinderGeometry(0.012, 0.055, 1, 6).translate(0, 0.5, 0);
  B.spines = DORSAL.map(() => { const s = new THREE.Mesh(spineG, m.horn); root.add(s); return s; }); root.add(B.sail, B.tail);
  // its shape under the surface, seen from above: dark in the middle, soft at the rim (snout to tail)
  const NS = K + 4, sidx = [], sa = [];
  for (let i = 0; i < NS; i++) sa.push(0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0);
  for (let i = 0; i < NS - 1; i++) for (let k = 0; k < 3; k++) { const a = i * 4 + k, b = a + 4; sidx.push(a, b, a + 1, a + 1, b, b + 1); }
  B.shadow = new THREE.Mesh(dyn(NS * 4, sidx), m.shadow.clone()); B.shadow.geometry.setAttribute('color', new THREE.Float32BufferAttribute(sa, 4)); B.shadow.renderOrder = 2; B.shadow.frustumCulled = false;
  SCENE.add(B.shadow); B.shadow.visible = false;
  root.traverse(o => { o.frustumCulled = false; }); return B; }

// lay the body out coiled at the head (it unspools as the head swims off, so it never starts across a shore)
function place(B, x, y, z) { for (const p of B.P) p.set(x, y, z); B.headY = y; }
const ripples = []; // rings spreading on the surface where the fin cuts it and where it bubbles (shared by every serpent)
function ripple(x, z, r = 2.4, a = 0.4) { const m = mats(); let q = ripples.find(o => o.t >= o.T);
  if (!q) { if (ripples.length >= 24) return; q = { mesh: new THREE.Mesh(m.ring, new THREE.MeshBasicMaterial({ color: 0xdde8e8, vertexColors: true, transparent: true, depthWrite: false })) }; q.mesh.renderOrder = 3; SCENE.add(q.mesh); ripples.push(q); }
  Object.assign(q, { t: 0, T: 1.6, r, a }); q.mesh.position.set(x, WATER_Y + 0.05, z); q.mesh.visible = true; }
function tickRipples(dt) { for (const q of ripples) { if (q.t >= q.T) { q.mesh.visible = false; continue; } q.t += dt; const k = q.t / q.T; q.mesh.scale.setScalar(0.3 + q.r * k); q.mesh.material.opacity = q.a * (1 - k); } }
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), NK = { c: new THREE.Vector3(), S: new THREE.Vector3(), U: new THREE.Vector3() };
// pose one serpent: its head point at (hx, hy, hz) heading yaw, the body resting at depth dy, lp the lunge (0 none, 0 to 1
// rising, biting at 0.5, falling back), bub its bubbles, vis how much shows (0 to 1)
function pose(B, dt, hx, hy, hz, yaw, dy, lp, bub, vis) { B.t += dt; const P = B.P, R = B.R, at = { x: hx, z: hz };
  const moved = Math.hypot(hx - P[0].x, hz - P[0].z) / Math.max(dt, 1e-3);
  P[0].set(hx, hy, hz);
  for (let i = 1; i <= K; i++) { const p = P[i], q = P[i - 1]; v1.subVectors(p, q); const L = v1.length(); if (L > GAP) p.copy(q).addScaledVector(v1, GAP / L);
    const hump = dy > DEEP + 0.4 ? Math.max(0, Math.sin(B.t * 1.6 - i * 0.5)) * 0.55 * Math.min(1, (dy - DEEP - 0.4) / 0.6) * (i > 2 && i < 12 ? 1 : 0) : 0; // coils of its back roll up through the surface
    const rest = Math.max(dy + hump, groundY(p.x, p.z) + RAD(i)); p.y += (rest - p.y) * Math.min(1, dt * (0.8 + i * 0.5)); }
  // the strike: the neck rears out of the water in an arc from the body (point NE) up and over to the head, which reaches
  // forward to bite; shaped as a curve from the body through a point above it to the head, blended in and out by sh
  const sh = lp <= 0 ? 0 : lp < 0.45 ? ease(lp / 0.45) : lp < 0.6 ? 1 : 1 - ease((lp - 0.6) / 0.4);
  if (sh > 0) { const b = P[NE], fx = Math.sin(yaw), fz = Math.cos(yaw), Hx = hx + fx * 1.6 * sh, Hy = hy + (WATER_Y + 1.5 - hy) * sh, Hz = hz + fz * 1.6 * sh;
    for (let i = 0; i < NE; i++) { const u = 1 - i / NE, a = (1 - u) * (1 - u), m = 2 * u * (1 - u), c2 = u * u;
      v1.set(a * b.x + m * (b.x + fx * 0.6) + c2 * Hx, a * b.y + m * Hy + c2 * Hy, a * b.z + m * (b.z + fz * 0.6) + c2 * Hz); P[i].lerp(v1, sh); } }
  const headUp = P[0].y; B.snout.set(P[0].x + Math.sin(yaw) * 1.9, headUp, P[0].z + Math.cos(yaw) * 1.9);
  if (headUp > WATER_Y + 0.2 && B.headY <= WATER_Y + 0.2) { for (let k = 0; k < 3; k++) splash(new THREE.Vector3(hx + (Math.random() - 0.5) * 1.6, WATER_Y, hz + (Math.random() - 0.5) * 1.6), 40); sfx('splash', at); ripple(hx, hz, 4, 0.4); ripple(hx, hz, 2.5, 0.35); }
  if (headUp < WATER_Y && B.headY >= WATER_Y) { for (let k = 0; k < 2; k++) splash(new THREE.Vector3(B.snout.x + (Math.random() - 0.5), WATER_Y, B.snout.z + (Math.random() - 0.5)), 30); sfx('splash', at, 0.7); ripple(B.snout.x, B.snout.z, 3.5, 0.35); }
  if (lp >= 0.5 && B.lp < 0.5) sfx('snap', at); B.lp = lp; B.headY = headUp;
  // swimming: a wave runs down the body, stronger toward the tail and when it moves fast
  const sw = Math.min(1, 0.35 + moved / 6);
  for (let i = 0; i <= K; i++) { const a = P[Math.max(0, i - 1)], b = P[Math.min(K, i + 1)]; v1.set(-(a.z - b.z), 0, a.x - b.x); const l = v1.length() || 1;
    R[i].copy(P[i]).addScaledVector(v1, Math.sin(B.t * 5 - i * 0.6) * 0.22 * (i / K) * sw / l); }
  // a frame along the body (carried from ring to ring, so a neck rising straight up never flips)
  B.Sd[0].set(Math.cos(yaw), 0, -Math.sin(yaw));
  for (let i = 0; i <= K; i++) { const T = B.T[i]; T.subVectors(R[Math.max(0, i - 1)], R[Math.min(K, i + 1)]); if (i === 0) T.subVectors(R[0], R[1]); if (T.lengthSq() < 1e-6) T.set(Math.sin(yaw), 0, Math.cos(yaw)); T.normalize();
    const S = B.Sd[i]; if (i) S.copy(B.Sd[i - 1]); S.addScaledVector(T, -S.dot(T)); if (S.lengthSq() < 1e-6) S.set(Math.cos(yaw), 0, -Math.sin(yaw)); S.normalize(); B.U[i].crossVectors(T, S); }
  // the head: along the neck, but rearing up as it rises and striking down at the bite
  const w = sh, pitch = lp < 0.4 ? 0.45 : lp < 0.55 ? 0.45 - (lp - 0.4) / 0.15 * 1.1 : -0.65;
  v3.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)); v2.copy(B.T[0]).lerp(v3, w).normalize();
  B.head.position.copy(R[0]); B.head.lookAt(v1.copy(R[0]).add(v2)); B.head.updateMatrix();
  // the neck grows into the skull: its first ring sits inside the head, turned with it and the size of the skull's
  // section there, so the body flows into the head and bends with it instead of ending under it
  NK.c.set(0, 0.08, 0.3).applyMatrix4(B.head.matrix); NK.S.setFromMatrixColumn(B.head.matrix, 0); NK.U.setFromMatrixColumn(B.head.matrix, 1);
  const pa = B.tube.geometry.attributes.position;
  for (let i = 0; i <= K; i++) { const r = RAD(i), c = i ? R[i] : NK.c, S = i ? B.Sd[i] : NK.S, U = i ? B.U[i] : NK.U, rw = i ? r * 1.05 : 0.44, rh = i ? r : 0.3 / 0.85;
    for (let k = 0; k <= RS; k++) { const th = -Math.PI / 2 + k / RS * Math.PI * 2, ridge = i ? Math.max(0, Math.sin(th)) ** 6 * 0.18 : 0;
      v2.copy(c).addScaledVector(S, Math.cos(th) * rw).addScaledVector(U, Math.sin(th) * rh * (0.85 + ridge)); pa.setXYZ(i * (RS + 1) + k, v2.x, v2.y, v2.z); } }
  pa.needsUpdate = true; B.tube.geometry.computeVertexNormals(); B.tube.geometry.computeBoundingSphere();
  B.head.userData.jaw.rotation.x = lp > 0.1 && lp < 0.56 ? (lp < 0.5 ? 0.72 * Math.min(1, (lp - 0.1) / 0.22) : 0.72 * (0.56 - lp) / 0.06) : 0.06 + 0.04 * Math.sin(B.t * 2);
  // the sail: each spine stands from the top of its ring, swept back; the membrane joins them below their tips
  const sp = B.sail.geometry.attributes.position; DORSAL.forEach(([i, h], j) => { const s = B.spines[j]; v1.copy(B.U[i]).multiplyScalar(0.8).addScaledVector(B.T[i], -0.6).normalize();
    v2.copy(R[i]).addScaledVector(B.U[i], RAD(i) * 0.8); s.position.copy(v2); s.quaternion.setFromUnitVectors(UP, v1); s.scale.set(1, h, 1);
    sp.setXYZ(j * 2, v2.x, v2.y, v2.z); v3.copy(v2).addScaledVector(v1, h * (0.78 + 0.12 * Math.sin(j * 3.7))); sp.setXYZ(j * 2 + 1, v3.x, v3.y, v3.z);
    // where the fin cuts the surface: a wake of spreading rings
    if (vis > 0.5 && moved > 1.5 && j % 2 === 1 && v3.y > WATER_Y && v2.y < WATER_Y && Math.random() < dt * 1.2) ripple(v2.x + (v3.x - v2.x) * 0.5, v2.z + (v3.z - v2.z) * 0.5, 1.8, 0.2); });
  sp.needsUpdate = true; B.sail.geometry.computeVertexNormals(); B.sail.geometry.computeBoundingSphere();
  const tp = B.tail.geometry.attributes.position, n2 = TAIL.length * 2; TAIL.forEach((i, j) => { const h = 0.25 + j * 0.12, r = RAD(i);
    for (const [o, s] of [[0, 1], [n2, -0.8]]) { v2.copy(R[i]).addScaledVector(B.U[i], r * s); tp.setXYZ(o + j * 2, v2.x, v2.y, v2.z); v2.addScaledVector(B.U[i], h * s).addScaledVector(B.T[i], -0.15); tp.setXYZ(o + j * 2 + 1, v2.x, v2.y, v2.z); } });
  tp.needsUpdate = true; B.tail.geometry.computeVertexNormals(); B.tail.geometry.computeBoundingSphere();
  if (bub && Math.random() < dt * 4) { const s = v1.copy(R[0]).addScaledVector(B.T[0], 1.2); ripple(s.x + (Math.random() - 0.5), s.z + (Math.random() - 0.5), 1.2, 0.5); splash(new THREE.Vector3(s.x, WATER_Y, s.z), 4); if (Math.random() < 0.3) sfx('bubble', at, 0.6); }
  // the shape under the surface: darker the shallower it swims
  const shd = B.shadow, sa = shd.geometry.attributes.position, pts = [[2.0, 0.3], [1.4, 0.5], [0.7, 0.58]];
  for (let n = 0; n < K + 4; n++) { let c, wd, side;
    if (n < 3) { c = v2.copy(R[0]).addScaledVector(B.T[0], pts[n][0]); wd = pts[n][1]; side = B.Sd[0]; } else { const i = n - 3; c = R[i]; wd = RAD(i) * 1.1; side = B.Sd[i]; }
    const sx = side.x, sz = side.z, l = Math.hypot(sx, sz) || 1, ox = sx / l, oz = sz / l;
    [-(wd + 0.7), -wd, wd, wd + 0.7].forEach((d, k) => sa.setXYZ(n * 4 + k, c.x + ox * d, WATER_Y + 0.03, c.z + oz * d)); }
  sa.needsUpdate = true; const deepK = Math.min(1, Math.max(0, (WATER_Y - P[3].y - 0.4) / 2.2));
  shd.material.opacity = vis * (0.78 - 0.4 * deepK); shd.visible = vis > 0.01 && !S.camUnder; B.root.visible = vis > 0.01;
}

// ── The local serpent's mind: it hunts this game's player ──
// off -> hunt (2 s after they reach deep water: the fin shows about 15 m off and circles closer, then dives under and
// bubbles) -> lunge (within 5.5 m: up, bite, back down) -> leave (6.5 s, then it comes again); near deep water and out of
// it, a pass now and then (the fin cuts by and sinks)
export const S = { mode: 'off', t: 0, deepT: 0, cool: 0, passT: 25, x: 0, z: 0, y: DEEP, yaw: 0, dy: DEEP, lp: 0, a: 0, dir: 1, bub: false, vis: 0, bit: false, lx: 0, lz: 0, nearT: 0, near: false, camUnder: false, B: null, get mesh() { return this.B?.root; } };
export function resetDeep() { Object.assign(S, { mode: 'off', t: 0, deepT: 0, cool: 0, lp: 0, vis: 0, bub: false }); if (S.B) { S.B.root.visible = false; S.B.shadow.visible = false; } }
const ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// head toward (tx, tz), turning at most `turn` rad/s, never into water too shallow for the body
function steer(dt, tx, tz, speed, turn = 2.2) { let h = S.yaw + Math.max(-turn * dt, Math.min(turn * dt, ang(Math.atan2(tx - S.x, tz - S.z) - S.yaw)));
  const ok = (a) => deepAt(S.x + Math.sin(a) * 1.5, S.z + Math.cos(a) * 1.5) && deepAt(S.x + Math.sin(a) * 3.2, S.z + Math.cos(a) * 3.2);
  if (!ok(h)) { let f = null; for (const k of [0.35, 0.7, 1.05, 1.4, 1.75, 2.1, 2.6, 3.1]) { if (ok(h + k)) { f = h + k; break; } if (ok(h - k)) { f = h - k; break; } } if (f === null) return; h = f; }
  S.yaw = ang(h); const nx = S.x + Math.sin(h) * speed * dt, nz = S.z + Math.cos(h) * speed * dt; if (deepAt(nx, nz)) { S.x = nx; S.z = nz; } }
function findDeep(px, pz, r0, r1) { const a0 = Math.random() * 6.28; for (let k = 0; k < 20; k++) { const a = a0 + k * 2.4, r = r0 + (k % 4) / 3 * (r1 - r0), x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
  if (deepAt(x, z) && [0, 1.57, 3.14, 4.71].every(b => deepAt(x + Math.cos(b) * 3, z + Math.sin(b) * 3))) return { x, z }; } return null; }
const ease = (k) => k * k * (3 - 2 * k);
export function tickDeep(dt, px, pz, deep, onShow, onBite) {
  if (!SCENE) return; if (!S.B) S.B = makeBeast(); tickRipples(dt); const pdt = dt; if (S.hold) dt = 0; // (hold: the checks freeze it for a screenshot)
  S.cool = Math.max(0, S.cool - dt); S.deepT = deep ? S.deepT + dt : Math.max(0, S.deepT - dt * 2); S.t += dt; S.bub = false;
  const d = Math.hypot(px - S.x, pz - S.z);
  if (S.mode === 'off') { S.vis = 0;
    if (deep && S.deepT > 1.8 && !S.cool) { const p = findDeep(px, pz, 13, 18); if (p) { Object.assign(S, { mode: 'hunt', t: 0, x: p.x, z: p.z, dy: SURF, lp: 0, a: Math.atan2(p.z - pz, p.x - px), dir: Math.random() < 0.5 ? 1 : -1 });
      S.yaw = Math.atan2(px - p.x, pz - p.z) + S.dir * 1.3; place(S.B, p.x, DEEP, p.z); sfx('lurk', { x: p.x, z: p.z }); onShow(); } else S.cool = 2; }
    else if (!deep && (S.passT -= dt) <= 0) { S.passT = 3; tryPass(px, pz); } }
  else if (S.mode === 'hunt') { if (!deep) { S.mode = 'leave'; S.t = 0; S.cool = 3; }
    else { S.vis = Math.min(1, S.vis + dt / 1.2); const r = Math.max(3, 15 - S.t * 1.7); S.a += S.dir * Math.min(1.4, 5.5 / r) * dt;
      steer(dt, px + Math.cos(S.a) * r, pz + Math.sin(S.a) * r, S.t > 4.5 ? 6.5 : 5.5);
      S.dy = S.t < 4.5 ? SURF : SURF + (DEEP - SURF) * Math.min(1, (S.t - 4.5) / 1.2); S.bub = S.t > 5;
      if (S.t > 5.5 && d < 7.5) { Object.assign(S, { mode: 'lunge', lp: 0, lx: S.x, lz: S.z, bit: false }); S.yaw = Math.atan2(px - S.x, pz - S.z); }
      else if (S.t > 15) { S.mode = 'leave'; S.t = 0; S.cool = 4; } } }
  else if (S.mode === 'lunge') { S.lp = Math.min(1, S.lp + dt / 1.15); S.yaw += Math.max(-dt * 3, Math.min(dt * 3, ang(Math.atan2(px - S.x, pz - S.z) - S.yaw)));
    const tx = px - Math.sin(S.yaw) * 3.4, tz = pz - Math.cos(S.yaw) * 3.4, k = ease(Math.min(1, S.lp / 0.48)), nx = S.lx + (tx - S.lx) * k, nz = S.lz + (tz - S.lz) * k; if (deepAt(nx, nz)) { S.x = nx; S.z = nz; } // (its body stays in the deep: a swimmer in the shallows is out of reach)
    S.y += (S.dy - S.y) * Math.min(1, dt * 2);
    if (S.lp >= 0.5 && !S.bit) { S.bit = true; if (Math.hypot(px - S.B.snout.x, pz - S.B.snout.z) < 2.4) onBite(); }
    if (S.lp >= 1) { Object.assign(S, { mode: 'leave', t: 0, lp: 0, cool: 6.5 }); S.dy = DEEP; } }
  else if (S.mode === 'leave') { S.dy = DEEP - 0.5; S.vis = Math.max(0, 1 - S.t / 2.5); steer(dt, S.x + (S.x - px), S.z + (S.z - pz), 6); if (S.t > 2.5) S.mode = 'off'; }
  else if (S.mode === 'pass') { const k = S.t / S.passD; S.vis = Math.min(1, k * 4, (1 - k) * 4); S.dy = k > 0.8 ? DEEP - 0.4 : SURF; steer(dt, S.x + Math.sin(S.pyaw) * 10, S.z + Math.cos(S.pyaw) * 10, 3.6, 0.8);
    if (deep) { S.mode = 'off'; S.deepT = 1.8; } else if (k >= 1) S.mode = 'off'; }
  if (S.mode !== 'lunge') S.y += (S.dy - S.y) * Math.min(1, dt * 2);
  if (S.mode === 'off') { S.B.root.visible = S.B.shadow.visible = false; return; } // (nothing to pose while it is away)
  pose(S.B, pdt, S.x, S.y, S.z, S.yaw, S.dy, S.mode === 'lunge' ? S.lp : 0, S.bub, S.vis);
}
// out of the water but near it: the fin cuts across a stretch of deep water 18 to 40 m off, then sinks (every 45 to 90 s)
function tryPass(px, pz) { const a0 = Math.random() * 6.28; for (let k = 0; k < 12; k++) for (const r of [18, 28, 38]) { const a = a0 + k * 0.52, x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r; if (!deepAt(x, z)) continue;
  for (const s of [1, -1]) { const hx = -Math.sin(a) * s, hz = Math.cos(a) * s; // across the line of sight
    if ([4, 8, 12, 16, 20].every(L => deepAt(x + hx * L, z + hz * L))) { Object.assign(S, { mode: 'pass', t: 0, x, z, y: DEEP, dy: SURF, lp: 0, pyaw: Math.atan2(hx, hz), yaw: Math.atan2(hx, hz), passD: 6, vis: 0 }); place(S.B, x, DEEP, z);
      S.passT = 45 + Math.random() * 45; sfx('lurk', { x, z }, 0.5); return; } } } }

// co-op: what this game's serpent is doing, for the others to draw (null when it is away), and the others' serpents here
export const deepMsg = () => S.mode === 'off' || !S.B ? null : [+S.x.toFixed(2), +S.z.toFixed(2), +S.y.toFixed(2), +S.yaw.toFixed(2), +S.dy.toFixed(2), +(S.mode === 'lunge' ? S.lp : 0).toFixed(2), S.bub ? 1 : 0, +S.vis.toFixed(2)];
const ghosts = new Map(); // player id -> { B, s: [x, z, y, yaw, dy, lp, bub, vis] smoothed }
export function tickGhostDeep(id, dq, dt) { let g = ghosts.get(id); if (!dq && !g) return;
  if (!g) { g = { B: makeBeast(), s: dq.slice() }; place(g.B, dq[0], dq[2], dq[1]); ghosts.set(id, g); }
  const s = g.s; if (dq) { const f = Math.hypot(dq[0] - s[0], dq[1] - s[1]) > 8 ? 1 : Math.min(1, dt * 10); for (let k = 0; k < 8; k++) s[k] = k === 3 ? s[3] + ang(dq[3] - s[3]) * f : k === 5 ? dq[5] : s[k] + (dq[k] - s[k]) * f; if (Math.hypot(dq[0] - s[0], dq[1] - s[1]) > 8) place(g.B, dq[0], dq[2], dq[1]); }
  else s[7] = Math.max(0, s[7] - dt);
  if (!dq && s[7] <= 0) { g.B.root.visible = g.B.shadow.visible = false; return; }
  pose(g.B, dt, s[0], s[2], s[1], s[3], s[4], s[5], !!s[6], s[7]); }
export function dropGhostDeep(id) { const g = ghosts.get(id); if (!g) return; SCENE.remove(g.B.root, g.B.shadow); ghosts.delete(id); }
