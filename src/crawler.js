// The ice crawler (slice 19), rebuilt: a frost isopod the size of a big dog, after the giant deep-sea isopod. Seven domed
// armour plates whose rear rims lap over the next (dark seams, frost-pale rims), a fan tail with paddle uropods, a shield
// head with big compound eyes at its corners, hooked mandibles and two pairs of antennae, six pairs of thin jointed legs
// tucked under the plate rims on a rippling gait with every foot planted where it lands (gait.js), and small ice
// crystals growing from its back. It rears with its mandibles wide to strike, jolts and spreads its legs when hit, and
// dies by flipping onto its back with its legs curling in, like a dead beetle.
import * as THREE from 'three';
import { Legs, lookAt, ease } from './gait.js';

const SCALE = 0.9, K = 1 / SCALE, BY = 0.21; // BY: the body's height (round 1: low, hugging the ground) // config ENEMY.ice_crawler.scale; built in metres
const mk = (geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); m.scale.set(...s); m.castShadow = true; return m; };
let G = null, PM = null; const _v = new THREE.Vector3(), _h = new THREE.Vector3(), _q = new THREE.Quaternion(); // (scratch)
const C3 = (h) => new THREE.Color(h);
function geos() {
  if (G) return G;
  // a dorsal plate (tergite): a dome whose side rims curl down past the equator over the legs; per-vertex colour gives the
  // seams: dark at the front (tucked under the plate ahead), slate on the crown, frost-pale along the rear and side rims
  const plate = new THREE.SphereGeometry(1, 36, 16, 0, Math.PI * 2, 0, Math.PI * 0.6);
  const p = plate.attributes.position, v = new THREE.Vector3(), col = new Float32Array(p.count * 3), c = new THREE.Color();
  const dark = C3(0x24222a), crown = C3(0x5e5a64), mid = C3(0x7c7884), frost = C3(0xdfe4e8); // (round 1: ash-lilac frost grey, not glossy blue)
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const r = Math.hypot(v.x, v.z);
    if (v.z > 0) v.y += v.z * 0.22 * Math.max(0, v.y); // the rear rim stands proud over the next plate
    const side = Math.max(0, Math.abs(v.x) - 0.6) / 0.4; v.z += side * side * 0.45 * (1 - Math.max(0, v.y)); // the side flanges sweep back to points, as on an isopod
    v.y += Math.sin(Math.atan2(v.x, v.z) * 14) * 0.012 * r * r; // fine ribbing toward the rim
    p.setXYZ(i, v.x, v.y, v.z);
    const front = Math.min(1, Math.max(0, (-v.z + 0.15) / 0.35)), rim = Math.min(1, Math.max(0, (r - 0.8) / 0.18)) * Math.min(1, Math.max(0, (v.z + 0.35) / 0.5)), ridge = Math.max(0, 1 - Math.abs(v.x) / 0.12) * 0.4;
    const n = Math.sin(v.x * 91.7 + v.z * 47.3) * 43758.5, rn = Math.sin(v.x * 5.3 + v.z * 3.1) * 0.6 + Math.sin(v.x * 11.7 - v.z * 6.9) * 0.4; // rime: a frost crust in patches over the crown
    c.copy(crown).lerp(mid, Math.min(1, r * 0.9 + ridge)).lerp(frost, Math.max(rim * 0.8, Math.min(0.45, Math.max(0, rn - 0.2) * 0.9) * Math.max(0, v.y))).lerp(dark, front * 0.9); c.multiplyScalar(0.88 + (n - Math.floor(n)) * 0.24); col.set([c.r, c.g, c.b], i * 3); } // (a speckle: a position hash, not a random generator)
  plate.setAttribute('color', new THREE.BufferAttribute(col, 3)); plate.computeVertexNormals();
  const under = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5); under.scale(0.9, 0.35, 0.9);
  const segs = new Map(), seg = (r0, r1, len) => { const k = [r0, r1, len.toFixed(3)].join(); if (!segs.has(k)) { const g = new THREE.CylinderGeometry(r1, r0, len, 7); g.rotateZ(Math.PI / 2); g.translate(len / 2, 0, 0); segs.set(k, g); } return segs.get(k); }; // along +x from the joint (shared by size)
  const crystal = new THREE.CylinderGeometry(0.018, 0.03, 0.08, 4); crystal.translate(0, 0.04, 0); const tip = new THREE.ConeGeometry(0.018, 0.05, 4); tip.translate(0, 0.105, 0); // (round 1: small jagged shards, not candy spikes)
  // the long second antenna: a thin tube sweeping out and back along the flank
  const ant = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0, 0, 0], [0.12, 0.04, -0.12], [0.3, 0.06, -0.08], [0.45, 0.03, 0.15], [0.52, -0.02, 0.4]].map(a => new THREE.Vector3(...a))), 24, 0.007, 5);
  const ant1 = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0, 0, 0], [0.04, 0.05, -0.08], [0.1, 0.07, -0.13]].map(a => new THREE.Vector3(...a))), 8, 0.006, 5);
  const claw = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0.02, 0.01, 0), new THREE.Vector3(0.06, -0.01, 0)), 6, 0.009, 5);
  return (G = { plate, under, seg, crystal, tip, ant, ant1, claw, knee: new THREE.SphereGeometry(1, 10, 8), eye: new THREE.SphereGeometry(1, 16, 12), mand: new THREE.ConeGeometry(0.025, 0.16, 6) });
}
export function buildCrawler({ M, eye, perMeshFlash }) {
  const g = geos(), root = new THREE.Group(), inner = new THREE.Group(); inner.scale.setScalar(K); root.add(inner);
  PM ??= { shell: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.8, clearcoat: 0.06, clearcoatRoughness: 0.7, envMapIntensity: 0.6 }), eyes: new THREE.MeshPhysicalMaterial({ color: 0x15131a, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 }) }; // matte to satin; dark compound eyes
  const body = new THREE.Group(); body.position.set(0, BY, 0); inner.add(body);
  // segments from the head back (+z): [z, half-width, length, dome height]; each plate's rear rim laps over the next
  const SEG = [[-0.3, 0.32, 0.2, 0.2], [-0.1, 0.37, 0.2, 0.24], [0.1, 0.39, 0.2, 0.26], [0.3, 0.38, 0.2, 0.25], [0.49, 0.34, 0.19, 0.22], [0.67, 0.29, 0.17, 0.19], [0.83, 0.23, 0.15, 0.15]];
  const segs = []; let parent = body, pz = 0;
  SEG.forEach(([z, w, l, h], i) => { const s = new THREE.Group(); s.position.z = z - pz; pz = z; parent.add(s); parent = s; segs.push(s);
    s.add(mk(g.plate, PM.shell, [0, 0.0, 0.02], [-0.06, 0, 0], [w * 1.38, h * 0.78, l * 1.08])); // (round 1: wider, flatter roof-tile plates whose flanges hang over the legs)
    s.add(mk(g.under, M.chitinDark, [0, -0.02, 0], [0, 0, 0], [w * 1.2, 0.2, l * 0.9]));
    // ice: small crystal clusters growing from the crown of three middle plates
    if (i >= 1 && i <= 3) for (let k = 0; k < (i === 2 ? 3 : 2); k++) { const a = (k / 2 - 0.5) * 0.9 + (i % 2) * 0.25, ht = 0.55 + ((i * 7 + k * 3) % 5) * 0.12, cg = new THREE.Group();
      cg.position.set(Math.sin(a) * w * 0.3, h * 0.92, (k % 2 ? 0.03 : -0.03)); cg.rotation.set(-0.3 + (k % 2) * 0.2, 0, -a * 0.9); cg.scale.set(1, ht, 1); s.add(cg);
      cg.add(mk(g.crystal, M.ice), mk(g.tip, M.ice)); } });
  // the tail: a fan-shaped pleotelson with a pair of paddle uropods either side
  const tail = new THREE.Group(); tail.position.set(0, 0, 0.16); segs[6].add(tail);
  tail.add(mk(g.plate, PM.shell, [0, -0.01, 0.05], [-0.12, 0, 0], [0.22, 0.1, 0.2]));
  for (const sx of [-1, 1]) tail.add(mk(g.plate, PM.shell, [sx * 0.17, -0.04, 0.08], [-0.1, sx * 0.45, 0], [0.07, 0.04, 0.17]));
  // head: a broad shield, big compound eyes at the front corners, mandibles, two pairs of antennae
  const head = new THREE.Group(); head.position.set(0, -0.02, -0.46); body.add(head);
  head.add(mk(g.plate, PM.shell, [0, 0.0, 0], [0.12, 0, 0], [0.27, 0.16, 0.16]), mk(g.under, M.chitinDark, [0, 0.0, 0], [0, 0, 0], [0.26, 0.3, 0.16]));
  for (const sx of [-1, 1]) head.add(mk(g.eye, PM.eyes, [sx * 0.19, 0.035, -0.06], [0, sx * 0.5, 0], [0.05, 0.035, 0.07]));
  const mand = [-1, 1].map(sx => { const j = new THREE.Group(); j.position.set(sx * 0.07, -0.05, -0.13); head.add(j);
    j.add(mk(g.mand, M.mandible, [sx * 0.02, 0, -0.07], [-Math.PI / 2, 0, sx * 0.45])); return j; });
  const feel = [-1, 1].map(sx => { const f = new THREE.Group(); f.position.set(sx * 0.1, 0.0, -0.15); f.scale.set(sx, 1, 1); head.add(f);
    f.add(mk(g.ant, M.chitinDark, [0, 0, 0], [0, 0, 0], [0.62, 0.8, 0.62])); const a1 = mk(g.ant1, M.chitinDark, [-0.05, 0.02, 0]); f.add(a1); return f; });
  // legs: 6 pairs, one under each of the first six plates; the hip tucked under the plate's rim, the knee just showing past
  // it, the shin angled down to a hooked claw; each leg is a thin jointed limb, not a strut
  const legs = [], parts = [];
  for (let i = 0; i < 7; i++) for (const sx of [-1, 1]) { // (round 1: seven pairs, as an isopod has, short and mostly under the shell)
    const s = segs[i], w = SEG[i][1], hip = new THREE.Group(); hip.position.set(sx * w * 0.62, -0.05, 0); s.add(hip);
    const fz = (i - 3) * 0.08, knee = new THREE.Vector3(sx * 0.2, 0.06, fz * 0.4), foot = new THREE.Vector3(sx * 0.04, -(BY - 0.05 + 0.06 - 0.02), fz * 0.6); // (the knee high under the plate rim, the foot under the knee: the leg rests at two thirds of its reach, so a stride cannot outreach it)
    const kn = new THREE.Group(); kn.position.copy(knee); hip.add(kn); const ft = new THREE.Group(); ft.position.copy(foot); kn.add(ft);
    const up = mk(g.seg(0.036, 0.028, knee.length()), M.chitinDark), lo = mk(g.seg(0.03, 0.014, foot.length()), M.chitinDark);
    kn.add(mk(g.knee, M.chitinDark, [0, 0, 0], [0, 0, 0], [0.036, 0.036, 0.036]));
    ft.add(mk(g.claw, M.chitinPale, [0, 0.0, 0], [0, sx > 0 ? 0 : Math.PI, 0])); // a hooked claw at the tip (the dactyl)
    up.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), knee.clone().normalize()); lo.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), foot.clone().normalize());
    hip.add(up); kn.add(lo);
    const hipAt = new THREE.Vector3(sx * w * 0.62, BY - 0.05, SEG[i][0]);
    legs.push({ upper: hip, lower: kn, end: foot.clone(), home: hipAt.clone().add(knee).add(foot).setY(0.02).multiplyScalar(K), pole: new THREE.Vector3(sx * 0.5, 1, 0), lift: 0.1 * K,
      off: ((i + (sx > 0 ? 1 : 0)) % 2) * 0.5 + i * 0.06, sx, i });
    parts.push({ hip, kn, sx }); }
  // the legs hang from hip groups that carry no rotation of their own: the IK turns `hip` (upper) and `kn` (lower)
  const gait = new Legs(root, legs, { stride: 0.9 * K, duty: 0.55, settle: 3 });
  let t = Math.random() * 9, atk = 0, hit = 0, hitS = 1, die = 0; const look = {};
  const anim = { dead: false,
    attack() { if (!this.dead) atk = 0.001; }, hit(side = 1) { if (!this.dead) { hit = 1; hitS = side; } }, die() { this.dead = true; die = 0.001; atk = 0; },
    update(dt, { speed = 0, ground = null, look: target = null } = {}) {
      t += dt; gait.ground = ground; gait.settle = this.dead ? 0 : 3;
      // the body is posed before the legs step, so the step judges each planted foot's reach from where the hips are this
      // frame (November 16, 2026: posed after, the chained segments' sway carried a rear hip up to 9% past a planted foot's
      // reach once the step had judged it in reach, and the leg dragged the foot 4 cm, near the walk test's 6 cm limit)
      root.updateMatrixWorld(true); const sc = root.getWorldScale(_v).x, ph = gait.ph * Math.PI * 2, mv = gait.moving, sl = gait.slope(-0.4 * K, 0.6 * K);
      body.position.set(0, BY + ((sl.front + sl.back) / 2 - sl.mid) / sc * SCALE - Math.abs(Math.sin(ph * 2)) * 0.02 * mv, 0); body.rotation.set(Math.atan2(sl.front - sl.back, 1.0 * sc), 0, 0);
      segs.forEach((s, i) => { s.rotation.set(0, i ? Math.sin(ph - i * 0.7) * 0.07 * mv + Math.sin(t * 1.3 - i) * 0.02 : 0, 0); });
      head.rotation.set(0, 0, 0); mand.forEach((m, k) => m.rotation.set(0, (k ? -1 : 1) * (0.15 + 0.08 * Math.sin(t * 7)), 0));
      feel.forEach((f, k) => f.rotation.set(Math.sin(t * 2.3 + k) * 0.12, Math.sin(t * 1.7 + k * 2) * 0.15, 0));
      let up = 0, d = 0;
      if (atk > 0) { atk += dt / 0.75; const a = atk, snap = ease((a - 0.35) / 0.12) * (1 - ease((a - 0.6) / 0.3)); up = ease(a / 0.35) * (1 - ease((a - 0.45) / 0.3));
        body.rotation.x += up * 0.4 - snap * 0.15; body.position.y += up * 0.1; head.rotation.x = -snap * 0.25; mand.forEach((m, k) => m.rotation.y = (k ? -1 : 1) * (0.15 + up * 0.75 - snap * 0.5)); }
      if (hit > 0) { hit = Math.max(0, hit - dt / 0.3); const h = Math.sin(hit * Math.PI); body.rotation.z += hitS * 0.18 * h; body.position.y += 0.05 * h; body.rotation.y += hitS * 0.15 * h; }
      if (die > 0) { die = Math.min(2, die + dt / 0.9); d = ease(die / 0.7); body.rotation.z = d * Math.PI * 0.97; body.position.y = BY + Math.sin(Math.min(1, die / 0.7) * Math.PI) * 0.35 - d * 0.06; }
      gait.step(dt, this.dead ? 0 : speed, { stride: Math.min(0.5, 0.26 + speed * 0.06) * K, duty: 0.55 }); // short quick strides, as an isopod scuttles (a longer stride outreaches the legs)
      for (const L of legs) L.over = null;
      if (atk > 0) { root.updateMatrixWorld(true); for (const L of legs.slice(0, 2)) { const q = _v.set(L.sx * 0.4, 0.35 * up, -0.75).multiplyScalar(K).applyMatrix4(root.matrixWorld); L.over = (L.ov ||= new THREE.Vector3()).copy(L.cur).lerp(q, up); }
        if (atk >= 1) atk = 0; }
      if (die > 0) { root.updateMatrixWorld(true); const curl = ease((die - 0.4) / 0.8);
        for (const L of legs) { const hp = L.upper.getWorldPosition(_h), q = _v.set(L.sx * 0.18, -0.22, (L.i - 3) * 0.08).multiplyScalar(K);
          q.applyQuaternion(body.getWorldQuaternion(_q)).multiplyScalar(sc).add(hp); L.over = (L.ov ||= new THREE.Vector3()).copy(L.cur).lerp(q, Math.max(d, curl)); } }
      else if (target) { root.updateMatrixWorld(true); lookAt(head, target, 0.8, look, { yaw: 0.5, pitch: 0.3, dt }); }
      gait.solve(); } };
  root.userData = { anim, torso: body, height: 0.8, setDetail() {}, flash: perMeshFlash(root), legs: gait };
  return root;
}
