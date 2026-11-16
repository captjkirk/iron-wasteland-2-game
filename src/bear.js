// The bear (slice 19), rebuilt from scratch: no CC0 rigged bear exists, and run 1's bear (a sculpt on the wolf's rig)
// moved like a wolf. This one has its own skeleton with a brown bear's build, measured in metres: a shoulder hump of
// muscle over the forelimbs, a broad skull with a dished face (the brow rises from a concave stop above the muzzle),
// small round ears set wide, heavy forelimbs, long pale fore-claws, flat-footed (plantigrade) feet with the heel down,
// a stub of a tail, and a grizzled coat (dark legs, a lighter-tipped hump and back, a tan muzzle). It walks with a
// bear's lateral four-beat gait (hind foot, then the fore foot on the same side), its head low and swinging, and breaks
// into a gallop when it charges; feet stay planted where they land (gait.js). It rears and swipes to attack, flinches
// from the side it was hit, follows its quarry with its head, and dies by staggering, buckling and rolling onto its side.
import * as THREE from 'three';
import { sculpt, skeleton } from './sculpt.js';
import { furMaterial, SHELLS } from './fur.js';
import { Legs, lookAt, ease } from './gait.js';

const SCALE = 1.6,
  K = 1 / SCALE; // the game scales a bear by 1.6 (config ENEMY.bear.scale): built in metres, shrunk by that
const JOINTS = (() => {
  const d = [
    ['root', null, [0, 0, 0]],
    ['hips', 'root', [0, 1.0, 0.5]],
    ['spine', 'hips', [0, 1.06, 0.05]],
    ['chest', 'spine', [0, 1.08, -0.33]],
    ['neck', 'chest', [0, 1.1, -0.6]],
    ['head', 'neck', [0, 1.1, -0.9]],
    ['jaw', 'head', [0, 1.0, -1.0]],
    ['tail', 'hips', [0, 1.02, 0.86]],
  ];
  for (const [s, n] of [
    [-1, 'L'],
    [1, 'R'],
  ])
    d.push(
      ['sh' + n, 'chest', [s * 0.27, 0.88, -0.33]],
      ['el' + n, 'sh' + n, [s * 0.28, 0.48, -0.22]],
      ['wr' + n, 'el' + n, [s * 0.27, 0.1, -0.37]],
      ['hp' + n, 'hips', [s * 0.25, 0.9, 0.55]],
      ['kn' + n, 'hp' + n, [s * 0.28, 0.5, 0.38]],
      ['an' + n, 'kn' + n, [s * 0.27, 0.1, 0.62]],
    );
  return d;
})();
let GEO = null;
const _tan = new THREE.Color(0x8a6640),
  _choc = new THREE.Color(0x5a3c26);
function bearGeometry(ix) {
  if (GEO) return GEO;
  const B = (...n) => n.map((x) => ix[x]),
    C = (a, b, ra, rb, bones, tag = 'body', k = 0.08) => ({ a, b, ra, rb, bones, tag, k }),
    E = (a, ell, bones, tag = 'body', k = 0.08) => ({ a, ell, bones, tag, k });
  const P = [
    E([0, 1.04, 0.12], [0.36, 0.36, 0.74], B('hips', 'chest')), // the body: the back sloping from hump to rump (round 2: the belly higher, so the legs show their length)
    E([0, 0.98, 0.5], [0.34, 0.33, 0.36], B('hips', 'spine')), // rump (lower than the hump)
    E([0, 0.98, -0.3], [0.35, 0.41, 0.38], B('spine', 'chest')), // deep chest
    C([0, 0.86, 0.22], [0, 0.82, -0.36], 0.24, 0.27, B('spine', 'chest'), 'belly', 0.14), // belly
    E([0, 1.37, -0.25], [0.26, 0.22, 0.32], B('chest', 'chest'), 'hump', 0.1), // the shoulder hump (muscle over the forelimbs; round 2: it stands clearly above the rump)
    C([0, 1.12, -0.46], [0, 1.12, -0.7], 0.31, 0.27, B('chest', 'neck')), // thick neck
    C([0, 1.12, -0.7], [0, 1.1, -0.9], 0.27, 0.22, B('neck', 'head'), 'head'),
    E([0, 1.13, -0.98], [0.22, 0.19, 0.2], B('head', 'head'), 'head', 0.06), // broad skull
    E([0, 1.21, -1.0], [0.15, 0.08, 0.12], B('head', 'head'), 'head', 0.06), // brow
    ...[-1, 1].map((s) => E([s * 0.12, 1.05, -1.0], [0.13, 0.11, 0.13], B('head', 'head'), 'head', 0.06)), // jowls
    C([0, 1.09, -1.1], [0, 1.04, -1.36], 0.095, 0.07, B('head', 'head'), 'muzzle', 0.05), // the muzzle (round 2: longer, tapering)
    { a: [0, 1.235, -1.17], ra: 0.075, bones: B('head', 'head'), k: 0.05, sub: true }, // the dish: a concave stop between brow and muzzle
    C([0, 1.0, -1.02], [0, 0.98, -1.25], 0.075, 0.058, B('jaw', 'jaw'), 'muzzle', 0.04), // lower jaw
    ...[-1, 1].map((s) => E([s * 0.16, 1.32, -0.93], [0.085, 0.085, 0.04], B('head', 'head'), 'ear', 0.035)), // small round ears, set wide (round 1: big enough to read)
    C([0, 1.03, 0.84], [0, 0.97, 0.97], 0.07, 0.045, B('tail', 'tail'), 'body', 0.06), // stub tail
  ];
  for (const [s, n] of [
    [-1, 'L'],
    [1, 'R'],
  ])
    P.push(
      C([s * 0.26, 0.92, -0.34], [s * 0.28, 0.48, -0.22], 0.2, 0.16, B('sh' + n, 'sh' + n), 'leg', 0.09), // upper arm
      C([s * 0.28, 0.48, -0.22], [s * 0.27, 0.12, -0.37], 0.155, 0.12, B('el' + n, 'el' + n), 'leg', 0.07), // heavy forearm
      E([s * 0.27, 0.065, -0.47], [0.115, 0.06, 0.135], B('wr' + n, 'wr' + n), 'paw', 0.05), // broad fore paw
      C([s * 0.24, 0.92, 0.57], [s * 0.28, 0.5, 0.38], 0.25, 0.17, B('hp' + n, 'hp' + n), 'leg', 0.1), // haunch and thigh
      C([s * 0.28, 0.5, 0.38], [s * 0.27, 0.12, 0.62], 0.15, 0.11, B('kn' + n, 'kn' + n), 'leg', 0.06), // shin
      C([s * 0.27, 0.07, 0.66], [s * 0.27, 0.065, 0.37], 0.09, 0.095, B('an' + n, 'an' + n), 'paw', 0.05),
    ); // the long flat hind foot, heel down
  GEO = sculpt(P, {
    res: 92,
    nBones: JOINTS.length,
    lump: 0.004,
    // (round 1: the legs and belly a dark chocolate, not black, shading lighter toward the body; a shorter coat on the face so eyes and ears show)
    colors: {
      body: 0x5e3f28,
      hump: 0x825a36,
      belly: 0x553925,
      leg: 0x452d1a,
      paw: 0x342315,
      head: 0x72502f,
      muzzle: 0x9c7a50,
      ear: 0x45301c,
    }, // (round 2: a lighter brown; the game's light made the round 1 coat near black)
    fur: { body: 1, hump: 1.45, belly: 1.1, leg: 0.85, paw: 0.35, head: 0.32, muzzle: 0.1, ear: 0.28 },
    // grizzled: the top of the back and hump lighter, the coat darkening down the flanks
    tint: (c, x, y, z) => {
      const t = Math.max(0, Math.min(1, (y - 1.05) / 0.35)) * (z < 0.7 && z > -0.75 ? 1 : 0.4);
      c.lerp(_tan, t * 0.35);
      if (y < 0.75) c.lerp(_choc, Math.max(0, Math.min(1, (y - 0.15) / 0.6)) * 0.55);
    },
  }); // legs: darkest at the paw, warming up toward the body
  return GEO;
}

const W = [0.25, 0.75, 0, 0.5],
  G = [0.5, 0.6, 0, 0.1]; // phase offsets, legs [FL, FR, HL, HR]: walk (lateral sequence) and gallop
// the small parts every bear shares (built once)
let BGEO = null;
function bearGeos() {
  if (BGEO) return BGEO;
  const cg = (len) => {
    const g = new THREE.ConeGeometry(0.011, len, 6);
    g.translate(0, len / 2, 0);
    g.rotateX(-Math.PI / 2 - 0.5);
    return g;
  };
  return (BGEO = {
    eye: new THREE.SphereGeometry(0.027, 12, 8),
    nose: new THREE.SphereGeometry(1, 16, 10),
    nostril: new THREE.SphereGeometry(0.012, 8, 6),
    nostrilMat: new THREE.MeshBasicMaterial({ color: 0x050403 }),
    mouth: new THREE.SphereGeometry(1, 14, 8),
    fang: new THREE.ConeGeometry(0.011, 0.05, 6),
    longC: cg(0.085),
    shortC: cg(0.06),
  });
}
export function buildBear({ eye, flasher }) {
  const sk = skeleton(JOINTS),
    b = sk.bones,
    root = new THREE.Group(),
    inner = new THREE.Group();
  inner.scale.setScalar(K);
  root.add(inner);
  inner.add(sk.root);
  root.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(sk.list);
  const geo = bearGeometry(sk.index),
    dens = 150,
    comb = [0, -0.55, 1];
  const base = furMaterial(0xffffff, { dens, tip: 1.35, vcol: true, furAttr: true, comb }),
    mats = [base],
    shells = [];
  const body = new THREE.SkinnedMesh(geo, base);
  body.castShadow = true;
  body.frustumCulled = false;
  inner.add(body);
  body.bind(skel);
  for (let k = 1; k <= SHELLS; k++) {
    const m = furMaterial(0xffffff, { h: k / SHELLS, dens, len: 0.075, tip: 1.35, vcol: true, furAttr: true, comb }),
      s = new THREE.SkinnedMesh(geo, m);
    s.frustumCulled = false;
    s.castShadow = false;
    inner.add(s);
    s.bind(skel);
    shells.push(s);
    mats.push(m);
  }
  // the face and claws ride their bones (rest rotations are all identity, so a part's offset is its rest point minus the joint's)
  const at = sk.at,
    put = (bone, geo, mat, p, r = [0, 0, 0]) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p[0] - at[bone].x, p[1] - at[bone].y, p[2] - at[bone].z);
      m.rotation.set(...r);
      m.castShadow = true;
      b[bone].add(m);
      return m;
    };
  const nose = new THREE.MeshStandardMaterial({ color: 0x1c1512, roughness: 0.5 }),
    mouth = new THREE.MeshStandardMaterial({ color: 0x3a1512, roughness: 0.7 }),
    tooth = new THREE.MeshStandardMaterial({ color: 0xe0d6bc, roughness: 0.35 }),
    claw = new THREE.MeshStandardMaterial({ color: 0xbcae92, roughness: 0.4 }),
    dark = new THREE.MeshStandardMaterial({ color: 0x2a221a, roughness: 0.45 });
  mats.push(nose, mouth, claw);
  const BG = bearGeos();
  // (gate, Nov 12 2026: the parts measured against the skin, not guessed: the eyes had sat 1 cm under it and the nose 7 cm
  // in front of the muzzle's top. Now each eye is set in the face just under the brow, showing about half, and the nose is a
  // flat damp pad wrapped over the muzzle's tip with the nostrils on its front.)
  for (const s of [-1, 1]) put('head', BG.eye, eye, [s * 0.082, 1.16, -1.134]);
  put('head', BG.nose, nose, [0, 1.055, -1.41]).scale.set(0.06, 0.042, 0.025);
  for (const s of [-1, 1]) put('head', BG.nostril, BG.nostrilMat, [s * 0.022, 1.05, -1.432]).scale.set(1, 0.7, 0.5);
  put('head', BG.mouth, mouth, [0, 1.005, -1.16]).scale.set(0.06, 0.03, 0.13);
  const fang = BG.fang;
  for (const s of [-1, 1]) {
    put('head', fang, tooth, [s * 0.042, 0.995, -1.285], [Math.PI, 0, 0]);
    put('jaw', fang, tooth, [s * 0.036, 1.005, -1.22]);
  }
  // claws: long and pale on the fore paws (a brown bear's dig), short and dark on the hind
  const longC = BG.longC,
    shortC = BG.shortC;
  for (const [s, n] of [
    [-1, 'L'],
    [1, 'R'],
  ])
    for (let j = 0; j < 5; j++) {
      const o = (j - 2) * 0.042,
        bend = Math.abs(j - 2);
      put('wr' + n, longC, claw, [s * 0.27 + o, 0.05, -0.585 + bend * 0.015], [0, -o * 2, 0]);
      put('an' + n, shortC, claw, [s * 0.27 + o * 0.95, 0.04, 0.32 + bend * 0.015], [0, -o * 2, 0]);
    } // (round 1: pale claws on every foot)
  // legs: [FL, FR, HL, HR]; homes and the joints in the root's space (metres x K)
  const L = (n, up, lo, foot, pole) => ({
    upper: b[up],
    lower: b[lo],
    foot: b[foot],
    end: at[foot].clone().sub(at[lo]),
    home: at[foot].clone().multiplyScalar(K),
    pole: new THREE.Vector3(...pole),
    lift: 0.16 * K,
    off: 0,
  });
  const legs = new Legs(
    root,
    [
      L('FL', 'shL', 'elL', 'wrL', [0, 0, 1]),
      L('FR', 'shR', 'elR', 'wrR', [0, 0, 1]),
      L('HL', 'hpL', 'knL', 'anL', [0, 0, -1]),
      L('HR', 'hpR', 'knR', 'anR', [0, 0, -1]),
    ],
    { stride: 1.3 * K, duty: 0.62, settle: 1.4 },
  );
  legs.legs.forEach((l, i) => (l.off = W[i]));
  b.head.scale.setScalar(1.18); // (round 1: the head 18% larger; the jaw and the face parts ride it)
  const rest = Object.fromEntries(Object.entries(b).map(([k, o]) => [k, o.position.clone()]));
  let g = 0,
    atk = 0,
    hit = 0,
    hitS = 1,
    die = 0,
    roll = 1,
    t = Math.random() * 10;
  const look = {},
    tmp = new THREE.Vector3();
  const anim = {
    dead: false,
    attack() {
      if (!this.dead) atk = 0.001;
    },
    hit(side = 1) {
      if (!this.dead) {
        hit = 1;
        hitS = side;
      }
    },
    die() {
      this.dead = true;
      die = 0.001;
      roll = Math.random() < 0.5 ? 1 : -1;
      atk = 0;
    },
    update(dt, { speed = 0, ground = null, look: target = null } = {}) {
      t += dt;
      legs.ground = ground;
      g += ((speed > 2.3 && !this.dead ? 1 : 0) - g) * Math.min(1, dt * 3);
      const gait = {
        stride: (Math.min(1.25, 0.9 + 0.3 * speed) * (1 - g) + 2.4 * g) * K,
        duty: 0.58 - 0.26 * g,
        offs: W.map((w, i) => w + (G[i] - w) * g),
      }; // (a walk of about 0.7 m/s, a charge of 4.3)
      legs.settle = this.dead ? 0 : 1.4;
      legs.step(dt, this.dead ? 0 : speed, gait);
      for (const [k, o] of Object.entries(b)) {
        o.position.copy(rest[k]);
        o.quaternion.identity();
      }
      const ph = legs.ph * Math.PI * 2,
        mv = legs.moving,
        sl = legs.slope(-0.37 * K, 0.62 * K),
        sc = legs.sc;
      // the body follows the ground under its feet, bobs twice a stride, rolls its shoulders, flexes its spine at a gallop
      const pitch = Math.atan2(sl.front - sl.back, 0.99 * sc);
      b.hips.position.y +=
        (((sl.front + sl.back) / 2 - sl.mid) / sc) * SCALE -
        Math.abs(Math.sin(ph * 2)) * 0.025 * mv * (1 - g) -
        Math.abs(Math.sin(ph)) * 0.05 * g;
      b.hips.rotation.x = pitch + Math.sin(ph) * 0.07 * g;
      b.chest.rotation.x = -Math.sin(ph) * 0.1 * g;
      b.chest.rotation.z = Math.sin(ph) * 0.045 * mv * (1 - g);
      b.chest.position.y += Math.sin(t * 1.6) * 0.004; // breathing
      b.neck.rotation.x = -0.12 * mv + Math.sin(ph * 2) * 0.04 * mv - 0.06 * g;
      b.neck.rotation.y = Math.sin(ph) * 0.09 * mv * (1 - g);
      b.tail.rotation.x = 0.2 + Math.sin(ph) * 0.1 * mv;
      // attack (1.15 s from the wind-up): rear onto the hind legs, raise a paw, swipe it down and across, jaws open
      for (const l of legs.legs) l.over = null;
      if (atk > 0 && !this.dead) {
        atk += dt / 1.15;
        const a = atk,
          rear = ease(a / 0.42) * (1 - ease((a - 0.52) / 0.22)),
          sw = ease((a - 0.42) / 0.16) * (1 - ease((a - 0.75) / 0.25));
        b.hips.rotation.x += rear * 0.55 - sw * 0.1;
        b.hips.position.y += rear * 0.05;
        b.neck.rotation.x += -rear * 0.25 + sw * 0.15;
        b.jaw.rotation.x = -0.5 * Math.max(rear * 0.6, sw);
        root.updateMatrixWorld(true);
        legs.legs.forEach((l, i) => {
          if (i > 1) return;
          const s = i ? 1 : -1,
            strike = i === 1;
          tmp
            .set(
              s * 0.3 - (strike ? sw * 0.5 : 0),
              0.1 + rear * (strike ? 1.1 : 0.6) - sw * 0.75,
              -0.5 - rear * 0.15 - sw * 0.35,
            )
            .multiplyScalar(K)
            .applyMatrix4(root.matrixWorld);
          l.over = (l.ov ||= new THREE.Vector3()).copy(l.cur).lerp(tmp, Math.min(1, rear * 1.4 + sw));
        });
        if (atk >= 1) atk = 0;
      }
      // a hit: flinch away from the side it came from, head thrown up, the body knocked back a step
      if (hit > 0) {
        hit = Math.max(0, hit - dt / 0.4);
        const h = Math.sin(hit * Math.PI);
        b.spine.rotation.y += hitS * 0.2 * h;
        b.neck.rotation.x += 0.22 * h;
        b.neck.rotation.z -= hitS * 0.15 * h;
        b.hips.position.z += 0.06 * h;
      }
      // death: a stagger, the hind legs buckle, then over onto its side, head down, legs slack
      if (die > 0) {
        die = Math.min(2, die + dt / 1.5);
        const d1 = ease(die / 0.45),
          d2 = ease((die - 0.3) / 0.55);
        b.hips.position.y -= d1 * 0.28 + d2 * 0.25;
        b.hips.rotation.x += d1 * 0.15 - d2 * 0.15;
        b.hips.rotation.z = roll * d2 * 1.42;
        b.neck.rotation.x -= 0.35 * d1;
        b.neck.rotation.y = -roll * 0.4 * d2;
        b.jaw.rotation.x = -0.18 * d2;
        root.updateMatrixWorld(true);
        const m = b.hips.matrixWorld;
        if (d2 > 0)
          legs.legs.forEach((l, i) => {
            const hp = i < 2 ? b['sh' + (i ? 'R' : 'L')] : b['hp' + (i === 2 ? 'L' : 'R')],
              bone = at[hp.name];
            tmp
              .set(bone.x * 1.3, bone.y - 0.72, bone.z + (i < 2 ? -0.25 : 0.25))
              .sub(at.hips)
              .applyMatrix4(m);
            l.over = (l.ov ||= new THREE.Vector3()).copy(l.cur).lerp(tmp, d2);
          });
      } else if (target) {
        root.updateMatrixWorld(true);
        lookAt(b.neck, target, 0.55, look.n || (look.n = {}), { yaw: 0.45, pitch: 0.25, dt });
        root.updateMatrixWorld(true);
        lookAt(b.head, target, 0.6, look.h || (look.h = {}), { yaw: 0.45, pitch: 0.3, dt });
      }
      legs.solve();
    },
  };
  root.userData = {
    anim,
    mats,
    torso: b.hips,
    dispose() {
      for (const m of [...mats, tooth, dark]) m.dispose();
    }, // (its materials are its own, for its flash; the geometry is shared)
    height: 1.0,
    setDetail(near) {
      for (const s of shells) s.visible = near;
    },
    flash: flasher(mats),
    legs,
  };
  return root;
}
