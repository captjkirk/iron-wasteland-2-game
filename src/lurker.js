// The bog lurker (slice 19), rebuilt: a giant salamander of the mud, modelled on the hellbender. A flat wide body with
// loose wrinkled folds of skin down each flank, a broad flat head with a lipped mouth and tiny eyes on top, sprawling
// legs with splayed four-fingered hands, and a tall paddle of a tail; wet olive skin with dark blotches and a pale belly.
// It walks as salamanders do (diagonal pairs, the spine swinging side to side with each stride, feet planted: gait.js),
// lunges with its mouth gaping to bite, recoils when hit, and dies rolling over to show its belly.
import * as THREE from 'three';
import { sculpt, skeleton } from './sculpt.js';
import { Legs, lookAt, ease } from './gait.js';

const SCALE = 1.1, K = 1 / SCALE; // config ENEMY.bog_lurker.scale; built in metres
const JOINTS = (() => { const d = [['root', null, [0, 0, 0]], ['pelvis', 'root', [0, 0.22, 0.35]], ['spine', 'pelvis', [0, 0.23, 0]], ['chest', 'spine', [0, 0.23, -0.35]],
  ['head', 'chest', [0, 0.22, -0.6]], ['jaw', 'head', [0, 0.17, -0.62]], ['tail1', 'pelvis', [0, 0.21, 0.6]], ['tail2', 'tail1', [0, 0.2, 0.86]], ['tail3', 'tail2', [0, 0.19, 1.1]], ['tail4', 'tail3', [0, 0.17, 1.3]]];
  for (const [s, n] of [[-1, 'L'], [1, 'R']]) d.push(['sh' + n, 'chest', [s * 0.2, 0.19, -0.38]], ['el' + n, 'sh' + n, [s * 0.37, 0.22, -0.4]], ['wr' + n, 'el' + n, [s * 0.45, 0.03, -0.46]],
    ['hp' + n, 'pelvis', [s * 0.2, 0.19, 0.38]], ['kn' + n, 'hp' + n, [s * 0.39, 0.22, 0.42]], ['an' + n, 'kn' + n, [s * 0.47, 0.03, 0.5]]);
  return d; })();
let GEO = null, LG = null; const _mud = new THREE.Color(0x1c160a), _wart = new THREE.Color(0xa89a6a);
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5; return s - Math.floor(s); };
function blot(x, z) { let v = 0, a = 0.5; for (let o = 0; o < 3; o++) { const f = 6 * 2 ** o, ix = Math.floor(x * f), iz = Math.floor(z * f), fx = x * f - ix, fz = z * f - iz, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  v += a * ((hash(ix, iz) * (1 - sx) + hash(ix + 1, iz) * sx) * (1 - sz) + (hash(ix, iz + 1) * (1 - sx) + hash(ix + 1, iz + 1) * sx) * sz); a /= 2; } return v / 0.875; }
function lurkerGeometry(ix) {
  if (GEO) return GEO;
  const B = (...n) => n.map(x => ix[x]), C = (a, b, ra, rb, bones, tag = 'body', k = 0.05) => ({ a, b, ra, rb, bones, tag, k }), E = (a, ell, bones, tag = 'body', k = 0.05) => ({ a, ell, bones, tag, k });
  const P = [
    E([0, 0.21, 0.0], [0.31, 0.14, 0.5], B('pelvis', 'chest'), 'body', 0.08),     // the flat wide body (round 2: wider through the middle, so it is not a log of even width)
    E([0, 0.15, 0.0], [0.25, 0.08, 0.46], B('pelvis', 'chest'), 'belly', 0.08),
    C([0, 0.21, -0.32], [0, 0.21, -0.55], 0.19, 0.18, B('chest', 'head'), 'body', 0.08),
    E([0, 0.222, -0.64], [0.3, 0.08, 0.21], B('head', 'head'), 'head', 0.06),    // the broad flat head (round 1: broader and flatter, a hellbender's shovel)
    E([0, 0.205, -0.78], [0.23, 0.06, 0.11], B('head', 'head'), 'head', 0.05),
    E([0, 0.152, -0.67], [0.25, 0.05, 0.19], B('jaw', 'jaw'), 'belly', 0.04),       // lower jaw (lipped, pale under)
    E([0, 0.178, -0.68], [0.255, 0.02, 0.185], B('head', 'head'), 'lip', 0.012),   // the fleshy lip along the wide mouth line
    E([0, 0.205, 0.76], [0.13, 0.11, 0.26], B('tail1', 'tail1'), 'body', 0.1),    // the tail: taller than wide, a paddle
    E([0, 0.2, 0.99], [0.085, 0.105, 0.24], B('tail2', 'tail2'), 'body', 0.1), E([0, 0.19, 1.2], [0.055, 0.095, 0.2], B('tail3', 'tail3'), 'body', 0.09), E([0, 0.17, 1.37], [0.03, 0.075, 0.15], B('tail4', 'tail4'), 'body', 0.08),
    ...[[0.98, 'tail2'], [1.2, 'tail3'], [1.36, 'tail4']].map(([z, b]) => E([0, 0.29 - (z - 1) * 0.15, z], [0.012, 0.05, 0.14], B(b, b), 'fold', 0.03)), // the tail's fin
  ];
  // loose folds of skin down each flank, a wrinkle every 9 cm
  for (const s of [-1, 1]) for (let z = -0.36; z <= 0.42; z += 0.08) P.push(E([s * 0.29, 0.16 + Math.sin(z * 31) * 0.012, z], [0.065, 0.034, 0.036], B(z < -0.15 ? 'chest' : z < 0.15 ? 'spine' : 'pelvis', z < -0.15 ? 'chest' : z < 0.15 ? 'spine' : 'pelvis'), 'fold', 0.025));
  for (const [s, n] of [[-1, 'L'], [1, 'R']]) for (const [u, l, f, z0] of [['sh', 'el', 'wr', -0.38], ['hp', 'kn', 'an', 0.38]]) {
    const J = (j) => JOINTS.find(d => d[0] === j + n)[2], a = J(u), b = J(l), c = J(f);
    // short stout limbs
    P.push(C(a, b, 0.08, 0.062, B(u + n, u + n), 'body', 0.06), C(b, c, 0.062, 0.048, B(l + n, l + n), 'body', 0.05), E([c[0], 0.03, c[2]], [0.06, 0.022, 0.055], B(f + n, f + n), 'toe', 0.03));
    for (let k = 0; k < (f === 'wr' ? 4 : 5); k++) { const nk = f === 'wr' ? 4 : 5, ang = (k - (nk - 1) / 2) * 0.55 + (f === 'wr' ? -0.35 : 0.35) * s, dx = Math.sin(ang) * s, dz = -Math.cos(ang); // splayed fingers (four in front, five behind), the hands turned in, the feet out
      P.push(C([c[0] + dx * 0.04, 0.025, c[2] + dz * 0.04], [c[0] + dx * 0.14, 0.016, c[2] + dz * 0.14], 0.019, 0.013, B(f + n, f + n), 'toe', 0.015), E([c[0] + dx * 0.145, 0.016, c[2] + dz * 0.145], [0.017, 0.012, 0.017], B(f + n, f + n), 'toe', 0.01)); } }
  GEO = sculpt(P, { res: 96, nBones: JOINTS.length, lump: 0.005,
    // (round 1: an olive-brown, the mottling soft-edged and brown rather than crisp camouflage, pale warts, the folds lighter on their crests)
    colors: { body: 0x5e5028, head: 0x625429, belly: 0x847650, fold: 0x564a2c, toe: 0x4c4026, lip: 0x76643e },
    tint: (c, x, y, z) => { const b = blot(x + 3, z + 7), k = Math.min(1, Math.max(0, (b - 0.56) / 0.12)), up = Math.min(1, Math.max(0, (y - 0.12) / 0.06)), w = hash(x * 40, z * 40);
      c.lerp(_mud, up * k * 0.6); if (w > 0.97) c.lerp(_wart, 0.12 * up); } }); // brown mottling over the back and flanks
  return GEO;
}
export function buildLurker({ eye, perMeshFlash, M }) {
  const sk = skeleton(JOINTS), b = sk.bones, root = new THREE.Group(), inner = new THREE.Group(); inner.scale.setScalar(K); root.add(inner); inner.add(sk.root);
  root.updateMatrixWorld(true); const skel = new THREE.Skeleton(sk.list);
  const skin = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.62, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 0.2 }); // wet: a slick clearcoat over a warm skin (round 1: less sky reflected, which made it blue-grey plastic)
  const body = new THREE.SkinnedMesh(lurkerGeometry(sk.index), skin); body.castShadow = true; body.frustumCulled = false; inner.add(body); body.bind(skel);
  const at = sk.at, put = (bone, geo, mat, p, r = [0, 0, 0], s = [1, 1, 1]) => { const m = new THREE.Mesh(geo, mat); m.position.set(p[0] - at[bone].x, p[1] - at[bone].y, p[2] - at[bone].z); m.rotation.set(...r); m.scale.set(...s); m.castShadow = true; b[bone].add(m); return m; };
  LG ??= { eye: new THREE.SphereGeometry(0.02, 12, 8), pupil: new THREE.BoxGeometry(0.006, 0.022, 0.01), mouth: new THREE.SphereGeometry(1, 16, 8), tooth: new THREE.ConeGeometry(0.008, 0.026, 4) }; // (shared by every lurker)
  for (const s of [-1, 1]) { put('head', LG.eye, eye, [s * 0.15, 0.285, -0.7]); put('head', LG.pupil, M.pupil, [s * 0.152, 0.286, -0.719]); }
  put('head', LG.mouth, M.mouth, [0, 0.17, -0.67], [0, 0, 0], [0.235, 0.032, 0.172]);
  const tooth = LG.tooth; for (let k = 0; k < 16; k++) { const a = (k / 15 - 0.5) * 2.4; put('head', tooth, M.teeth, [Math.sin(a) * 0.22, 0.17, -0.67 - Math.cos(a) * 0.16], [Math.PI, 0, 0]); }
  const L = (up, lo, ft, s) => ({ upper: b[up], lower: b[lo], foot: b[ft], end: at[ft].clone().sub(at[lo]), home: at[ft].clone().multiplyScalar(K), pole: new THREE.Vector3(s, 1.2, 0), lift: 0.09 * K, off: 0 });
  const gait = new Legs(root, [L('shL', 'elL', 'wrL', -1), L('shR', 'elR', 'wrR', 1), L('hpL', 'knL', 'anL', -1), L('hpR', 'knR', 'anR', 1)], { stride: 0.75 * K, duty: 0.6, settle: 2 });
  [0, 0.5, 0.5, 0].forEach((o, i) => gait.legs[i].off = o); gait.legs.forEach(l => l.pitchK = 0.3);
  const rest = Object.fromEntries(Object.entries(b).map(([k, o]) => [k, o.position.clone()]));
  let t = Math.random() * 9, atk = 0, hit = 0, hitS = 1, die = 0, rear = 0, rearOn = false; const look = {}, tmp = new THREE.Vector3();
  const anim = { dead: false, submerged: 0,
    attack() { if (!this.dead) atk = 0.001; }, rear(on) { rearOn = !!on && !this.dead; }, get rearing() { return rearOn; }, hit(side = 1) { if (!this.dead) { hit = 1; hitS = side; } }, die() { this.dead = true; die = 0.001; atk = 0; },
    update(dt, { speed = 0, ground = null, look: target = null } = {}) {
      t += dt; gait.ground = ground; gait.settle = this.dead ? 0 : 2;
      gait.step(dt, this.dead ? 0 : speed, { stride: Math.min(0.72, 0.4 + speed * 0.12) * K, duty: 0.6 }); // (a longer stride outreaches the short legs)
      for (const [k, o] of Object.entries(b)) { o.position.copy(rest[k]); o.quaternion.identity(); }
      const ph = gait.ph * Math.PI * 2, mv = gait.moving, sl = gait.slope(-0.45 * K, 0.45 * K), sc = gait.sc, sw = Math.sin(ph);
      b.pelvis.position.y += ((sl.front + sl.back) / 2 - sl.mid) / sc * SCALE; b.pelvis.rotation.x = Math.atan2(sl.front - sl.back, 0.9 * sc);
      // the salamander's walk: the spine swings to the side of the foot that reaches forward; the tail sweeps after it
      b.pelvis.rotation.y = sw * 0.16 * mv; b.spine.rotation.y = -sw * 0.14 * mv; b.chest.rotation.y = -sw * 0.18 * mv; b.head.rotation.y = sw * 0.16 * mv;
      ['tail1', 'tail2', 'tail3', 'tail4'].forEach((n, i) => b[n].rotation.y = Math.sin(ph - 1 - i * 0.9) * (0.22 + i * 0.06) * mv + Math.sin(t * 0.8 - i * 0.7) * 0.08 * (1 - mv));
      b.jaw.rotation.x = -Math.max(0, Math.sin(t * 0.9)) * 0.04; b.chest.scale.setScalar(1 + Math.sin(t * 1.7) * 0.012); // a slow throat pulse
      for (const l of gait.legs) l.over = null;
      rear += ((rearOn && !this.dead ? 1 : 0) - rear) * Math.min(1, dt * 7); // about to spit (Jared, November 15, 2026): it rears its head, gapes and swells its throat
      if (rear > 0.01) { b.chest.rotation.x += rear * 0.35; b.head.rotation.x += rear * 0.2; b.jaw.rotation.x = -0.6 * rear; b.chest.scale.setScalar(1 + rear * 0.18); }
      if (atk > 0) { atk += dt / 0.9; const a = atk, rise = ease(a / 0.4) * (1 - ease((a - 0.55) / 0.3)), snap = ease((a - 0.4) / 0.1) * (1 - ease((a - 0.65) / 0.3));
        b.chest.rotation.x = rise * 0.3 - snap * 0.2; b.chest.position.z -= snap * 0.12; b.head.rotation.x = rise * 0.15; b.jaw.rotation.x = -0.75 * Math.max(0, rise - snap * 0.9); if (atk >= 1) atk = 0; }
      if (hit > 0) { hit = Math.max(0, hit - dt / 0.35); const h = Math.sin(hit * Math.PI); b.spine.rotation.y += hitS * 0.3 * h; b.chest.rotation.z -= hitS * 0.12 * h; b.head.rotation.x += 0.2 * h; b.jaw.rotation.x -= 0.3 * h; }
      if (die > 0) { die = Math.min(2, die + dt / 1.1); const d = ease(die / 0.8); b.pelvis.rotation.z = d * Math.PI * 0.92; b.pelvis.position.y += Math.sin(Math.min(1, die / 0.8) * Math.PI) * 0.18 + d * 0.06;
        b.head.rotation.x = -0.3 * d; b.jaw.rotation.x = -0.3 * d; root.updateMatrixWorld(true); const m = b.pelvis.matrixWorld;
        gait.legs.forEach((l, i) => { const j = at[l.upper.name]; tmp.set(j.x * 1.9, j.y - 0.05, j.z + (i < 2 ? -0.1 : 0.1)).sub(at.pelvis).applyMatrix4(m); l.over = (l.ov ||= new THREE.Vector3()).copy(l.cur).lerp(tmp, d); }); }
      else if (target) { root.updateMatrixWorld(true); lookAt(b.head, target, 0.7, look, { yaw: 0.5, pitch: 0.3, dt }); }
      gait.solve(); } };
  root.userData = { anim, torso: b.pelvis, height: 0.8, setDetail() {}, flash: perMeshFlash(root), legs: gait };
  return root;
}
