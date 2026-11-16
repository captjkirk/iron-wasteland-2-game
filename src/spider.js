// The giant spider and its nest (slice 22, #51). A wolf-spider-like hunter the size of a big dog, built in metres for
// ENEMY.spider.scale 1 (a bigger one, the queen of #53, is the same build at a larger scale and its own palette):
// a hairy cephalothorax with pale bands and eight eyes (the big ones shine at night, as real spiders' eyes do in a torch
// beam), a velvet abdomen with a pale heart mark and chevrons, chelicerae with curved fangs, pedipalps that feel the
// air, and eight long jointed legs, knees high above the body, each foot planted where it lands (gait.js) on an
// alternating-tetrapod gait. It rears up with its front legs raised to strike, flinches when hit, hangs head down
// with its legs spread while it drops on a thread, and dies by flipping onto its back with its legs curled in.
// The nest: a silk mound with a dark funnel mouth, egg sacs, guy lines and wrapped prey (its ground webs: spiders.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Legs, ease } from './gait.js';

const BY = 0.34; // the body's height at rest
// palettes: [carapace, carapace bands, abdomen, abdomen marks, legs, leg bands, belly]
// Jared, November 14, 2026: "I want there to be maybe 3-5 varieties of spiders if possible": four kinds (config.js ENEMY
// spider*), the queen (#53) a fifth. Each kind has a palette here and a build in FORM: ring (the colour at the joints), abd
// (the abdomen's size), legW (leg thickness), reach (leg length), hair (how hairy), gloss (a shiny shell), glow (a faint light of its own)
const PAL = {
  wolf: [0x5a4836, 0x9c8a6a, 0x4e3e2e, 0xa89270, 0x6a5844, 0xb0a084, 0x241c14], // the wolf spider of the Ruins (round 1: the grey-brown of a real one, not near black)
  pale: [0xc8c0ae, 0x4a4038, 0xd2cab8, 0x3a302a, 0xb0a690, 0xe8e0cc, 0x6a6254], // the pale hollow spider: bone-white with dark chevrons, glowing faintly, like the Hollow's mushrooms
  widow: [0x161214, 0x2c2426, 0x0e0b0c, 0xb8160c, 0x161214, 0x2c2426, 0x0a0808], // the widow: glossy black, a red hourglass under it and red spots on its back
  brute: [0x3a2618, 0x8a5a34, 0x2e1e14, 0x7a4a2a, 0x342216, 0x8a4a26, 0x160e08], // the brute: a huge shaggy dark-brown tarantula-like spider with rust knees
  queen: [0x1c1412, 0x7a2a1a, 0x16100e, 0xa8341e, 0x18110e, 0x6a2418, 0x0c0808],
}; // (for #53's queen: black with blood-red marks)
const FORM = {
  wolf: { ring: 0x1c150f, abd: [1, 1, 1], legW: 1, reach: 1, hair: 1 },
  pale: { ring: 0x2a2420, abd: [0.95, 0.95, 1.08], legW: 0.82, reach: 1.12, hair: 0.6, glow: 0x0c3a30 },
  widow: { ring: 0x050404, abd: [1.45, 1.5, 1.25], legW: 0.88, reach: 1.1, hair: 0.2, gloss: true },
  brute: { ring: 0xa84a1c, abd: [1.15, 1.1, 1.05], legW: 1.4, reach: 0.86, hair: 1.9 },
  queen: { ring: 0x5a1a10, abd: [1.3, 1.3, 1.4], legW: 1.2, reach: 1, hair: 1, gloss: true },
};
const C = new THREE.Color(),
  C2 = new THREE.Color(),
  V = () => new THREE.Vector3();
const _v = V(),
  _w = V();
const hash = (a, b, c = 0) => {
  const n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return n - Math.floor(n);
}; // (a position hash for speckle, not a random generator)
const sm = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// a geometry made non-indexed with position, normal and colour only (so the parts merge)
function plain(g, col) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const p = g.attributes.position,
    c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const [r, gg, b] = col(p.getX(i), p.getY(i), p.getZ(i));
    c[i * 3] = r;
    c[i * 3 + 1] = gg;
    c[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
// bristles: thin three-sided spikes, dark at the root and pale at the tip (the grizzled look of a hairy spider)
function bristles(list) {
  const pos = [],
    nor = [],
    col = [],
    a = V(),
    b = V(),
    t = V(),
    n = V();
  for (const { p, d, len, w, c0, c1 } of list) {
    a.set(0, 1, 0);
    if (Math.abs(d.y) > 0.9) a.set(1, 0, 0);
    a.cross(d).normalize();
    b.copy(d).cross(a).normalize();
    t.copy(p).addScaledVector(d, len);
    const q = [0, 1, 2].map((k) =>
      p
        .clone()
        .addScaledVector(a, Math.cos(k * 2.094) * w)
        .addScaledVector(b, Math.sin(k * 2.094) * w),
    );
    for (let k = 0; k < 3; k++) {
      const q0 = q[k],
        q1 = q[(k + 1) % 3];
      n.copy(q0).add(q1).multiplyScalar(0.5).sub(p).normalize();
      for (const [v, c] of [
        [q0, c0],
        [q1, c0],
        [t, c1],
      ]) {
        pos.push(v.x, v.y, v.z);
        nor.push(n.x, n.y, n.z);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

const GEO = {};
function geos(pal) {
  if (GEO[pal]) return GEO[pal];
  const P = PAL[pal].map((h) => new THREE.Color(h)),
    [cara, band, abd, mark, leg, legBand, belly] = P,
    F = FORM[pal],
    ring = new THREE.Color(F.ring);
  let seed = 1;
  const rnd = () => hash(seed++, 7.3, pal.length);
  // an ellipsoid with a pattern painted by position (unit-sphere coordinates: +y up, +z toward the rear) and hair
  const ellipsoid = (rx, ry, rz, pattern, nHair, hairLen, lie) => {
    const s = plain(new THREE.SphereGeometry(1, 40, 28), (x, y, z) => pattern(x, y, z).toArray());
    s.scale(rx, ry, rz);
    {
      const p = s.attributes.position,
        n = s.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        _v.set(p.getX(i) / rx / rx, p.getY(i) / ry / ry, p.getZ(i) / rz / rz).normalize();
        n.setXYZ(i, _v.x, _v.y, _v.z);
      }
    } // (smooth: the ellipsoid's own normal)
    const L = [];
    for (let i = 0; i < nHair; i++) {
      const u = rnd() * 2 - 1,
        th = rnd() * 6.283,
        r = Math.sqrt(1 - u * u),
        x = r * Math.cos(th),
        y = u,
        z = r * Math.sin(th);
      if (y < -0.35) continue;
      const c0 = pattern(x, y, z).clone(),
        p = new THREE.Vector3(x * rx, y * ry, z * rz),
        n = new THREE.Vector3(x / rx, y / ry, z / rz).normalize();
      L.push({
        p,
        d: n.add(lie).normalize(),
        len: hairLen * (0.6 + rnd() * 0.8),
        w: 0.0035,
        c0,
        c1: c0.clone().lerp(band, 0.5).multiplyScalar(1.15),
      });
    }
    return mergeGeometries([s, bristles(L)]);
  };
  // the carapace: pale bands either side and down the middle, dark radiating striae, darker round the eyes
  const caraPat = (x, y, z) => {
    const ax = Math.abs(x),
      str = Math.max(0, Math.sin(Math.atan2(x, z) * 9)) ** 6 * 0.5;
    C.copy(cara).lerp(
      band,
      Math.max(sm(0.42, 0.52, ax) * (1 - sm(0.7, 0.8, ax)), (1 - sm(0.1, 0.17, ax)) * 0.85) * sm(-0.2, 0.2, y),
    );
    C.lerp(C2.set(0x0e0a08), str * sm(0, 0.4, y) + (1 - sm(-0.75, -0.45, z)) * 0.8).lerp(belly, 1 - sm(-0.4, 0.05, y));
    /* (the face dark round the eyes: critic, not white tufts) */ return C.multiplyScalar(
      0.85 + hash(x * 9, y * 9, z * 9) * 0.3,
    );
  };
  // the abdomen: a pale lance-shaped heart mark at the front, chevrons toward the spinnerets, speckled flanks, black belly
  const abdPat = (x, y, z) => {
    const ax = Math.abs(x),
      w = 0.2 * Math.max(0, Math.sin((Math.PI * (z + 1)) / 1.15)),
      top = sm(0.2, 0.5, y);
    const heart = z < 0.15 ? (1 - sm(w * 0.8, w, ax)) * top : 0,
      rim = z < 0.15 ? (1 - sm(w * 1.25, w * 1.5, ax)) * top * (1 - heart) : 0;
    const f = (((z * 5.2 + ax * 3.2) % 1) + 1) % 1,
      chev = z > 0.05 && ax < 0.62 ? (f < 0.22 ? 1 : 0) * sm(0.25, 0.45, y) * (1 - sm(0.5, 0.62, ax)) : 0;
    const speck =
      hash(Math.round(x * 30), Math.round(y * 30), Math.round(z * 30)) > 0.94 ? sm(-0.3, 0.1, y) * (1 - top) * 0.4 : 0;
    if (pal === 'widow') {
      const hz = Math.abs(z - 0.05),
        spot = ax < 0.09 + 0.05 * Math.sin(z * 9) && z > -0.7 && y > 0.25 ? 1 : 0,
        hg = (y < -0.55 || (y < 0.1 && z > 0.75)) && hz < 0.36 && ax < 0.05 + hz * 0.55 ? 1 : 0; // (critic: a red stripe down its back that shows from above, and the hourglass under it)
      return C.copy(abd)
        .lerp(belly, 1 - sm(-0.45, -0.1, y))
        .lerp(mark, Math.max(spot, hg))
        .multiplyScalar(0.9 + hash(x * 13, y * 13, z * 13) * 0.2);
    }
    C.copy(abd)
      .lerp(mark, Math.max(heart, chev * 0.85, speck))
      .lerp(C2.set(0x080605), rim * 0.8)
      .lerp(belly, 1 - sm(-0.45, -0.1, y));
    return C.multiplyScalar(0.85 + hash(x * 13, y * 13, z * 13) * 0.3);
  };
  const ceph = ellipsoid(0.26, 0.15, 0.32, caraPat, 420 * F.hair, 0.022 * F.hair ** 0.5, new THREE.Vector3(0, 0, 0.9));
  const abdomen = ellipsoid(
    0.27 * F.abd[0],
    0.22 * F.abd[1],
    0.37 * F.abd[2],
    abdPat,
    900 * F.hair,
    0.028 * F.hair ** 0.5,
    new THREE.Vector3(0, 0, 1.2),
  ); // (round 1: about the carapace's size, as on the photo, not a beetle's bulk)
  // a leg segment along +x from the joint: tapering, banded pale at its far joint, bristling with hairs that lie toward the tip
  const segs = new Map(),
    seg = (r0, r1, len, hair = 1) => {
      const k = [r0, r1, len.toFixed(3), hair].join();
      if (segs.has(k)) return segs.get(k);
      const c = new THREE.CylinderGeometry(r1, r0, len, 8, 4);
      c.rotateZ(-Math.PI / 2);
      c.translate(len / 2, 0, 0);
      const col = (x) => {
        const u = x / len,
          m = hash(Math.round(x * 60), 3.1, len);
        return C.copy(leg)
          .multiplyScalar(0.8 + m * 0.4)
          .lerp(legBand, sm(0.5, 0.58, u) * (1 - sm(0.66, 0.74, u)) * 0.45)
          .lerp(ring, Math.max(sm(0.86, 0.97, u), 1 - sm(0, 0.06, u)) * (pal === 'brute' ? 0.9 : 0.6))
          .toArray();
      }; // (round 2: a faint pale band mid-segment too, as on the photo) // (critic 1: mottled grey-brown, darker at the joints, not pale-capped pipes)
      const L = [];
      for (let i = 0; i < len * 200 * hair * F.hair; i++) {
        const t = 0.04 + rnd() * 0.92,
          th = rnd() * 6.283,
          r = r0 + (r1 - r0) * t,
          n = new THREE.Vector3(0, Math.cos(th), Math.sin(th)),
          spine = rnd() < 0.06; // (fine hair lying along the leg, and a few long spines standing out)
        const c0 = new THREE.Color().fromArray(col(t * len));
        L.push({
          p: new THREE.Vector3(t * len, n.y * r, n.z * r),
          d: n
            .clone()
            .add(new THREE.Vector3(spine ? 0.6 : 1.8, 0, 0))
            .normalize(),
          len: (spine ? 0.05 + rnd() * 0.03 : 0.014 + rnd() * 0.016) * F.hair ** 0.5,
          w: spine ? 0.0025 : 0.002,
          c0,
          c1: c0.clone().lerp(legBand, spine ? 0.2 : 0.7),
        });
      }
      const g = mergeGeometries([plain(c, col), bristles(L)]);
      segs.set(k, g);
      return g;
    };
  const ball = plain(new THREE.SphereGeometry(1, 12, 9), () => leg.toArray()),
    sball = new THREE.SphereGeometry(1, 16, 12);
  // a fang: a curved dark tooth along a bezier, from the chelicera's tip
  const fang = new THREE.TubeGeometry(
    new THREE.QuadraticBezierCurve3(V(), new THREE.Vector3(0, -0.05, -0.01), new THREE.Vector3(0.035, -0.075, 0.02)),
    8,
    0.008,
    6,
  );
  const spinner = plain(new THREE.ConeGeometry(0.025, 0.07, 6), () => leg.toArray());
  spinner.rotateX(Math.PI / 2); // (round 2: the hair material paints by vertex colour; a part without one drew black)
  const jaw = ellipsoid(
    0.05,
    0.085,
    0.05,
    () => C.copy(leg).multiplyScalar(0.85),
    60,
    0.02,
    new THREE.Vector3(0, -1, 0.3),
  ); // a chelicera: hairy, the leg's grey-brown
  return (GEO[pal] = { ceph, abdomen, seg, ball, sball, fang, spinner, jaw, F });
}
let GLOW = null;
function glowMat(eye) {
  if (GLOW) return GLOW;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'),
    gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  GLOW = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    color: 0xb8ffe0,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
  });
  GLOW.eye = eye;
  return GLOW;
}
export function spiderGlow() {
  if (GLOW) GLOW.opacity = Math.min(0.8, (GLOW.eye.emissiveIntensity / 2.2) * 0.8);
} // (once a frame: follows the eyes' night shine)
const MATS = {};
function mats(pal) {
  const F = FORM[pal],
    o = (m) => {
      if (F.gloss) Object.assign(m, { roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15, sheen: 0 });
      if (F.glow) m.emissive.set(F.glow);
      return m;
    }; // (the widow's shell shines; the pale one glows faintly)
  return (MATS[pal] ??= {
    hair: o(
      new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.82,
        sheen: 0.7,
        sheenColor: new THREE.Color(0x8a6a46),
        sheenRoughness: 0.55,
      }),
    ),
    shell: o(
      new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.6,
        clearcoat: 0.25,
        clearcoatRoughness: 0.5,
        sheen: 0.4,
        sheenColor: new THREE.Color(0x9a7a52),
      }),
    ),
    fang: new THREE.MeshPhysicalMaterial({ color: 0x1e0a06, roughness: 0.2, clearcoat: 1 }),
    eyeSmall: new THREE.MeshPhysicalMaterial({ color: 0x050404, roughness: 0.1, clearcoat: 1 }),
  });
}
const mk = (geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.rotation.set(...r);
  m.scale.set(...s);
  m.castShadow = true;
  return m;
};
const X = new THREE.Vector3(1, 0, 0);
// a straight segment mesh from a joint (its parent) along `to` (parent space)
function limb(geo, mat, to) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.quaternion.setFromUnitVectors(X, to.clone().normalize());
  return m;
}

export function buildSpider({ eye, perMeshFlash, palette = 'wolf' }) {
  const g = geos(palette),
    M = mats(palette),
    F = g.F,
    root = new THREE.Group(),
    body = new THREE.Group();
  body.position.y = BY;
  root.add(body);
  const ceph = new THREE.Group();
  ceph.position.z = -0.17;
  body.add(ceph);
  ceph.add(mk(g.ceph, M.shell, [0, 0.02, 0], [0.08, 0, 0]));
  // the waist (pedicel) and the abdomen behind it, carried a little high, swaying as it runs
  const abd = new THREE.Group();
  abd.position.set(0, 0.05, 0.16);
  body.add(abd);
  abd.add(mk(g.abdomen, M.hair, [0, 0.07 * F.abd[1], 0.32 * F.abd[2]], [-0.15, 0, 0]));
  const spin = new THREE.Group();
  spin.position.set(0, 0.0, 0.32 * F.abd[2] + 0.36 * F.abd[2]);
  abd.add(spin);
  for (const sx of [-1, 1]) spin.add(mk(g.spinner, M.hair, [sx * 0.025, 0, 0], [0.4, sx * 0.25, 0]));
  // eight eyes: a row of four small ones low on the face, two big ones above, two more behind them on the crown
  for (const [x, y, z, r, big] of [
    [0.035, 0.06, -0.3, 0.016, 0],
    [0.085, 0.055, -0.285, 0.014, 0],
    [0.05, 0.115, -0.26, 0.03, 1],
    [0.08, 0.13, -0.16, 0.022, 1],
  ])
    for (const sx of [-1, 1]) ceph.add(mk(g.sball, big ? eye : M.eyeSmall, [sx * x, y, z], [0, 0, 0], [r, r, r]));
  // chelicerae: two bulky hairy jaws hanging at the front, each with a curved fang; pedipalps either side
  const jaws = [-1, 1].map((sx) => {
    const j = new THREE.Group();
    j.position.set(sx * 0.05, 0.0, -0.28);
    ceph.add(j);
    j.add(mk(g.jaw, M.hair, [0, -0.06, -0.015], [0.25, 0, 0]));
    const f = mk(g.fang, M.fang, [0, -0.13, -0.03], [0, sx > 0 ? Math.PI : 0, 0]);
    j.add(f);
    return j;
  });
  const palps = [-1, 1].map((sx) => {
    const a = new THREE.Group();
    a.position.set(sx * 0.1, -0.02, -0.27);
    ceph.add(a);
    const k1 = new THREE.Vector3(sx * 0.05, 0.03, -0.12),
      k2 = new THREE.Vector3(sx * 0.02, -0.12, -0.08);
    a.add(limb(g.seg(0.022, 0.018, k1.length(), 0.6), M.hair, k1));
    const b = new THREE.Group();
    b.position.copy(k1);
    a.add(b);
    b.add(limb(g.seg(0.018, 0.02, k2.length(), 0.8), M.hair, k2));
    return { a, b };
  });
  // the legs: four pairs from the carapace's rim, front pair reaching forward, back pair back; the knee (the femur's end)
  // stands high over the body, the foot planted out at the rest point, the leg resting at about seven tenths of its reach
  const legs = [],
    ANG = [-1.05, -0.42, 0.32, 0.95],
    REACH = [1.5, 1.3, 1.27, 1.56],
    HZ = [-0.13, -0.05, 0.04, 0.12]; // (round 1: longer, the span about three body lengths, as on the photo)
  for (let i = 0; i < 4; i++)
    for (const sx of [-1, 1]) {
      const R = REACH[i] * F.reach,
        W = F.legW,
        dir = new THREE.Vector3(sx * Math.cos(ANG[i]), 0, Math.sin(ANG[i])),
        hipAt = new THREE.Vector3(sx * 0.17, 0, ceph.position.z + HZ[i]);
      const knee = dir
          .clone()
          .multiplyScalar(0.4 * R)
          .setY(0.26 * R),
        foot = dir
          .clone()
          .multiplyScalar(0.52 * R)
          .setY(-(BY + knee.y) + 0.012); // (critic 1: a lower, wider stance, the body near the ground)
      const hip = new THREE.Group();
      hip.position.copy(hipAt);
      body.add(hip);
      hip.add(mk(g.ball, M.hair, [0, 0, 0], [0, 0, 0], [0.075 * W, 0.065 * W, 0.075 * W])); // the coxa
      const kn = new THREE.Group();
      kn.position.copy(knee);
      hip.add(kn);
      kn.add(mk(g.ball, M.hair, [0, 0, 0], [0, 0, 0], [0.05 * W, 0.05 * W, 0.05 * W])); // the patella
      hip.add(limb(g.seg(0.072 * W, 0.048 * W, knee.length()), M.hair, knee)); // (thick, hairy legs tapering to a point: critic 1)
      // the lower leg bends once more at the ankle (tibia, then a thinner metatarsus and tarsus): a fixed kink, outward
      const ank = foot
          .clone()
          .multiplyScalar(0.5)
          .addScaledVector(dir, 0.05)
          .add(new THREE.Vector3(0, 0.03, 0)),
        rest = foot.clone().sub(ank);
      kn.add(limb(g.seg(0.046 * W, 0.032 * W, ank.length()), M.hair, ank));
      const a = new THREE.Group();
      a.position.copy(ank);
      kn.add(a);
      a.add(limb(g.seg(0.03 * W, 0.007 * W, rest.length(), 1.2), M.hair, rest));
      legs.push({
        upper: hip,
        lower: kn,
        end: foot.clone(),
        home: hipAt.clone().setY(BY).add(knee).add(foot).setY(0.012),
        pole: new THREE.Vector3(sx * 0.35, 1, 0),
        lift: 0.14,
        off: ((i + (sx > 0 ? 1 : 0)) % 2) * 0.5 + i * 0.04,
        sx,
        i,
        hz: hipAt.z,
        hx: hipAt.x,
      });
    }
  const gait = new Legs(root, legs, { stride: 0.55, duty: 0.5, settle: 3.5 });
  let t = Math.random() * 9,
    atk = 0,
    hit = 0,
    hitS = 1,
    die = 0,
    air = 0,
    rear = 0,
    rearOn = false,
    cph = 0; // rear: #66, the pale spider's back end up to spit
  const toW = (L, x, y, z) => body.localToWorld(_w.set(x, y, z)); // a body-space point in the world
  const anim = {
    dead: false,
    attack() {
      if (!this.dead) atk = 0.001;
    },
    rear(on) {
      rearOn = !!on && !this.dead;
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
      atk = 0;
      rearOn = false;
    },
    get rearing() {
      return rearOn;
    },
    update(dt, { speed = 0, ground = null, climb = 0, cs = 0 } = {}) {
      // climb: 0 to 1, how far it is tipped onto a wall (game.js); cs: its climbing speed
      t += dt;
      gait.ground = ground;
      gait.settle = this.dead ? 0 : 3.5;
      // in the air (dropping on its thread, or falling from it): legs spread, head down while it hangs
      const h = ground ? (root.position.y - ground(root.position.x, root.position.z)) / root.scale.x : 0;
      air += ((h > 0.15 && !this.dead && climb < 0.05 ? 1 : 0) - air) * Math.min(1, dt * 7); // (on a wall it is not hanging)
      gait.step(dt, this.dead || air > 0.5 ? 0 : speed, { stride: Math.min(0.95, 0.4 + speed * 0.12), duty: 0.5 });
      const ph = gait.ph * Math.PI * 2,
        mv = gait.moving,
        sl = gait.slope(-0.6, 0.6),
        sc = gait.sc;
      body.position.set(0, BY + ((sl.front + sl.back) / 2 - sl.mid) / sc - Math.abs(Math.sin(ph * 2)) * 0.025 * mv, 0);
      body.rotation.set(Math.atan2(sl.front - sl.back, 1.2 * sc) - air * 1.35, Math.sin(ph) * 0.03 * mv, 0);
      rear += ((rearOn ? 1 : 0) - rear) * Math.min(1, dt * 7);
      body.rotation.x += rear * 0.22; // (its head dips as its back end rises: a pose, not a colour)
      abd.rotation.set(
        -0.04 + Math.sin(t * 1.6) * 0.03 + air * 0.25 - rear * (0.75 + Math.sin(t * 20) * 0.04),
        -Math.sin(ph) * 0.06 * mv,
        Math.sin(ph) * 0.04 * mv,
      );
      jaws.forEach((j, k) => j.rotation.set(Math.sin(t * 3 + k) * 0.05, (k ? -1 : 1) * 0.04 * Math.sin(t * 6), 0));
      palps.forEach((p, k) => {
        p.a.rotation.set(Math.sin(t * 2.6 + k * 1.7) * 0.25 + mv * 0.15, Math.sin(t * 1.9 + k) * 0.2, 0);
        p.b.rotation.set(Math.sin(t * 3.1 + k) * 0.2, 0, 0);
      });
      for (const L of legs) L.over = null;
      root.updateMatrixWorld(true);
      // on a wall (the follow-ups to #66): the root is tipped up, belly to the wall, so the ground plane of its body is the wall.
      // Each foot grips there and is moved by a climbing stroke: pulled back along the body while down (the body going up past
      // it), then lifted off the wall and reached forward again, alternate legs (their walking offsets) half a stroke apart
      if (climb > 0.02 && !this.dead) {
        cph = (cph + (cs / 0.45) * dt) % 1;
        for (const L of legs) {
          const u = (cph + L.off) % 1,
            down = u < 0.5,
            k = down ? u / 0.5 : (u - 0.5) / 0.5,
            z = down ? -0.18 + 0.36 * k : 0.18 - 0.36 * k,
            lift = down ? 0 : Math.sin(k * Math.PI) * 0.12;
          L.over = (L.ov ||= V())
            .copy(L.cur)
            .lerp(toW(L, L.home.x, -BY + 0.012 + lift, L.home.z + z), Math.min(1, climb * 1.5));
        }
      }
      if (air > 0.02) {
        body.rotation.z += Math.sin(t * 1.7) * 0.16 * air;
        root.updateMatrixWorld(true); // hanging: swaying on its thread, the legs curled toward you as if to grab, twitching
        for (const L of legs) {
          const s = 1 + Math.sin(t * 9 + L.i * 1.3 + L.sx) * 0.07;
          L.over = (L.ov ||= V())
            .copy(L.cur)
            .lerp(toW(L, L.hx + L.sx * 0.45 * s, 0.42 + (1.5 - Math.abs(L.i - 1.5)) * 0.06, L.hz * 2.6 * s - 0.1), air);
        }
      } // (critic 1: not splayed flat; body +y faces you while it hangs head down)
      if (atk > 0) {
        atk += dt / 0.8;
        const a = atk,
          up = ease(a / 0.4) * (1 - ease((a - 0.55) / 0.3)),
          snap = ease((a - 0.4) / 0.12) * (1 - ease((a - 0.65) / 0.3));
        body.rotation.x += up * 0.55 - snap * 0.25;
        body.position.y += up * 0.12 - snap * 0.06;
        body.position.z = -snap * 0.15;
        jaws.forEach((j, k) => (j.rotation.x = up * 0.5 - snap * 0.6));
        root.updateMatrixWorld(true);
        for (const L of legs)
          if (L.i < 2)
            L.over = (L.ov ||= V())
              .copy(L.cur)
              .lerp(toW(L, L.hx + L.sx * (0.25 - L.i * 0.08), 0.5 - L.i * 0.15, -0.75 + L.i * 0.12), up);
        if (atk >= 1) atk = 0;
      }
      if (hit > 0) {
        hit = Math.max(0, hit - dt / 0.3);
        const k = Math.sin(hit * Math.PI);
        body.rotation.z += hitS * 0.2 * k;
        body.position.y += 0.06 * k;
        body.rotation.y += hitS * 0.12 * k;
      }
      // dying, in seconds (Jared, November 14, 2026: "too fast so it looks bad. can they shrivle up slower?"): it flips over in about 1 s, then the
      // legs draw in over about 2.8 s with a few twitches that weaken as they go; done by 3.6 s, before the loot drops (game.js: 3.8 s) and it sinks (4 s)
      if (die > 0) {
        die = Math.min(4.5, die + dt);
        const d = ease(die),
          c = ease((die - 0.8) / 2.8);
        body.rotation.set(0, 0, d * Math.PI * 0.96);
        body.position.y = BY + Math.sin(Math.min(1, die) * Math.PI) * 0.4 - d * 0.2 - c * 0.05;
        root.updateMatrixWorld(true);
        for (const L of legs) {
          const tw = die > 0.8 ? Math.max(0, Math.sin(die * 5.5 + L.i * 2.3 + L.sx * 1.1)) ** 6 * (1 - c) * 0.5 : 0;
          L.over = (L.ov ||= V())
            .copy(L.cur)
            .lerp(toW(L, L.sx * 0.14, -0.3, L.hz * 0.7 + 0.05), Math.max(0, Math.max(d * 0.3, c) - tw));
        }
      } // (body space: the belly side, which is up once it has flipped)
      gait.solve();
    },
  };
  // at night its eyes catch the light: a soft cold glow over the eye cluster (critic 1: two small dots did not read in the dark)
  const glow = new THREE.Sprite(glowMat(eye));
  glow.position.set(0, 0.12, -0.24);
  glow.scale.setScalar(0.3);
  ceph.add(glow);
  root.userData = {
    anim,
    palette,
    torso: body,
    height: 0.85,
    spinneret: spin,
    setDetail() {},
    flash: perMeshFlash(root),
    legs: gait,
  };
  return root;
}

// ── The nest ──
// (round 1: the white dome read as a snow pile. Now a dead snag strung with sheets of grey, dirty silk down to the ground,
// a low lumpy mound under them with a dark funnel going in, egg sacs caught in the sheets and a wrapped prey hanging)
let NG = null;
function silkTex(base, n, dirt) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = `rgba(255,255,255,${base})`;
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < dirt; i++) {
    x.fillStyle = `rgba(${70 + hash(i, 11) * 40},${60 + hash(i, 12) * 30},${45},${0.12 + hash(i, 13) * 0.25})`;
    x.beginPath();
    x.ellipse(
      hash(i, 14) * 256,
      hash(i, 15) * 256,
      4 + hash(i, 16) * 18,
      3 + hash(i, 17) * 10,
      hash(i, 18) * 3,
      0,
      6.3,
    );
    x.fill();
  }
  for (let i = 0; i < n; i++) {
    const a = hash(i, 1),
      b = hash(i, 2),
      r = hash(i, 3);
    x.strokeStyle = `rgba(255,255,255,${0.25 + r * 0.6})`;
    x.lineWidth = 0.4 + r * 1.1;
    x.beginPath();
    x.moveTo(a * 256, b * 256);
    x.quadraticCurveTo(hash(i, 4) * 256, hash(i, 5) * 256, hash(i, 6) * 256, hash(i, 7) * 256);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// a sheet of silk from a high point down to two ground points, sagging in the middle (a grid, u from the apex down)
function sheet(A, G1, G2) {
  const N = 8,
    pos = [],
    uv = [],
    idx = [];
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) {
      const u = i / N,
        v = j / N,
        G = G1.clone().lerp(G2, v),
        P = A.clone().lerp(G, u),
        w = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
      P.y -= w * 0.22;
      P.x += (hash(i, j, 5) - 0.5) * 0.25 * w;
      P.z += (hash(j, i, 6) - 0.5) * 0.25 * w;
      /* (critic 1: torn and uneven, not a glass cone) */ pos.push(P.x, P.y, P.z);
      uv.push(v * 1.5, u * 1.5);
    }
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const a = i * (N + 1) + j;
      if (i === 0 && j > 0) continue;
      idx.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function nestGeos() {
  if (NG) return NG;
  const mound = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.55),
    p = mound.attributes.position,
    v = V();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x),
      ridge = Math.abs(Math.sin(a * 3.5)) ** 0.5;
    const r = 1 + (hash(Math.round(v.x * 8), Math.round(v.z * 8)) - 0.5) * 0.18;
    v.x *= r;
    v.z *= r;
    v.y *= 0.55 + ridge * 0.3 + hash(Math.round(v.x * 5), Math.round(v.y * 5), 3) * 0.15;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  mound.computeVertexNormals();
  const tube = new THREE.CylinderGeometry(0.3, 0.18, 1.1, 20, 1, true);
  tube.rotateX(Math.PI / 2); // the funnel, going in
  const line = new THREE.CylinderGeometry(0.006, 0.006, 1, 4);
  line.translate(0, 0.5, 0);
  const wood = new THREE.CylinderGeometry(0.5, 1, 1, 7);
  wood.translate(0, 0.5, 0); // (a branch: scaled per piece)
  return (NG = {
    sheetTex: silkTex(0.08, 700, 8),
    moundTex: silkTex(0.85, 500, 40),
    mound,
    tube,
    line,
    wood,
    sac: new THREE.SphereGeometry(1, 16, 12),
  });
}
let NM = null;
export function buildNest({ perMeshFlash }) {
  const g = nestGeos(),
    root = new THREE.Group(),
    body = new THREE.Group();
  root.add(body);
  NM ??= {
    sheet: new THREE.MeshStandardMaterial({
      color: 0xcfc9ba,
      map: g.sheetTex,
      transparent: true,
      roughness: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    silk: new THREE.MeshStandardMaterial({ color: 0x8f887a, map: g.moundTex, roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 1, side: THREE.DoubleSide }),
    sac: new THREE.MeshStandardMaterial({ color: 0xb8ad8c, map: g.moundTex, roughness: 0.7 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.95 }),
    line: new THREE.MeshBasicMaterial({ color: 0xe8e6de, transparent: true, opacity: 0.45, depthWrite: false }),
    prey: new THREE.MeshStandardMaterial({ color: 0xbdb49c, map: g.moundTex, roughness: 0.9 }),
  };
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  // the snag: a dead stump leaning over the mound, with three bare branches the sheets hang from
  const branch = (from, to, r) => {
    const d = to.clone().sub(from),
      m = new THREE.Mesh(g.wood, NM.wood);
    m.position.copy(from);
    m.scale.set(r, d.length(), r);
    m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
    m.castShadow = true;
    body.add(m);
  };
  const top = V3(0.3, 2.3, 0.25),
    tips = [V3(-0.9, 2.0, 0.6), V3(1.2, 1.7, -0.3), V3(0.1, 1.6, 1.3)];
  branch(V3(0.1, -0.1, 0.1), top, 0.11);
  for (const q of tips) branch(top.clone().lerp(V3(0.1, 0, 0.1), 0.3), q, 0.05);
  body.add(mk(g.mound, NM.silk, [0, -0.08, 0.1], [0, 0, 0], [1.15, 0.9, 1.05]));
  // the sheets: from the snag's tips and crown down to the ground all round (the mouth's side left open)
  const hi = [top, ...tips],
    ring = 10;
  for (let k = 0; k < ring; k++) {
    const a0 = (k / ring) * 6.283 + 0.35,
      a1 = ((k + 1) / ring) * 6.283 + 0.35;
    if (k === 7) continue;
    const R0 = 2.1 + hash(k, 21) * 0.9,
      R1 = 2.1 + hash(k + 1, 21) * 0.9,
      A = hi[k % hi.length];
    const m = new THREE.Mesh(
      sheet(A, V3(Math.sin(a0) * R0, 0.05, -Math.cos(a0) * R0), V3(Math.sin(a1) * R1, 0.05, -Math.cos(a1) * R1)),
      NM.sheet,
    );
    m.renderOrder = 1;
    body.add(m);
  }
  // the funnel's mouth at the front (-z), dark inside, ringed with denser silk
  body.add(mk(g.tube, NM.dark, [0, 0.3, -0.92], [0.45, 0, 0], [1, 1, 1]));
  body.add(mk(g.tube, NM.silk, [0, 0.3, -1.0], [0.45, 0, 0], [1.15, 1.15, 0.5]));
  // egg sacs caught in the silk, and two wrapped prey: one lying, one hung from a branch on a thread
  [
    [0.75, 0.55, 0.35, 0.15],
    [0.9, 0.42, 0.05, 0.12],
    [-0.7, 0.62, 0.55, 0.13],
    [-0.25, 1.1, 0.7, 0.11],
  ].forEach(([x, y, z, r]) => body.add(mk(g.sac, NM.sac, [x, y, z], [0, 0, 0], [r, r * 0.9, r])));
  body.add(mk(g.sac, NM.prey, [1.7, 0.14, 0.9], [0, 0.7, 0.2], [0.16, 0.14, 0.55]));
  const hang = mk(g.sac, NM.prey, [1.15, 1.05, -0.3], [0.15, 0, 0.1], [0.14, 0.42, 0.13]);
  body.add(hang);
  branch(V3(1.18, 1.45, -0.3), V3(1.2, 1.7, -0.3), 0.004);
  // guy lines from the snag and the mound out to the ground
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * 6.283 + hash(i, 9) * 0.4,
      from =
        i % 3
          ? V3(Math.cos(a) * (0.8 + hash(i, 8) * 0.3), 0.35 + hash(i, 7) * 0.4, Math.sin(a) * (0.8 + hash(i, 8) * 0.3))
          : hi[i % 4].clone(),
      R = 2.6 + hash(i, 6) * 1.4;
    const to = V3(Math.cos(a) * R, 0.02, Math.sin(a) * R),
      d = to.clone().sub(from),
      m = new THREE.Mesh(g.line, NM.line);
    m.position.copy(from);
    m.scale.set(1, d.length(), 1);
    m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
    body.add(m);
  }
  body.rotation.y = Math.random() * 6.283;
  const mouth = new THREE.Object3D();
  mouth.position.set(0, 0, -1.8);
  body.add(mouth); // (where its spiders come out)
  let hit = 0,
    die = 0,
    t = 0;
  const anim = {
    dead: false,
    attack() {},
    hit() {
      hit = 1;
    },
    die() {
      this.dead = true;
      die = 0.001;
    },
    update(dt) {
      t += dt;
      hit = Math.max(0, hit - dt / 0.35);
      const k = Math.sin(hit * Math.PI);
      body.scale.set(1 + k * 0.05, 1 - k * 0.06, 1 + k * 0.05);
      hang.rotation.z = 0.1 + Math.sin(t * 0.9) * 0.08; // (the hung prey turns slowly on its thread)
      if (die > 0) {
        die = Math.min(1, die + dt / 1.2);
        const d = ease(die);
        body.scale.set(1 + d * 0.3, Math.max(0.12, 1 - d), 1 + d * 0.3);
      }
    },
  };
  root.userData = { anim, height: 1.2, mouth, mouthYaw: body.rotation.y, setDetail() {}, flash: perMeshFlash(root) };
  return root;
}
