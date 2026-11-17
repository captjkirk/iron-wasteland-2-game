// Caves (#8; Jared, November 15, 2026: docs/decisions/2026-11-15-caves-relics.md): the meshes, walls and crates of every cave
// (its mouth in its land, its inside past the north edge: cavemap.js), the fade in and out at the mouth, the dark inside (no sun, no
// sky, black fog: the torch matters, D4), and each cave's own surprise as you walk deeper (D4: spiders drop from the glowing
// cavern's ceiling, ice crawlers break out of the ice cave's walls, rats pour out of the mine's side holes, dust hounds' eyes open in
// the crystal cave's dark before they charge, bog lurkers rise from the root hollow's pools). Easy brings fewer of them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mergeStill } from './mergestill.js';
import { caves, caveAt, caveDepth, floorOf } from './cavemap.js';
import { groundY } from './world.js';
import { fbm, mulberry32 } from './noise.js';
import { SEED, CLASSIC } from './config.js';
import { pbr, canvasTex } from './propmodels.js';
import { addCollider } from './props.js';
import { cache } from './buildings.js';
import { others, rules } from './coop.js';
import { dustPuff } from './effects.js';
import { caveAudio } from './audio.js';

export { caves, caveAt };
const FRAME = { x: 0, z: 0, ca: 1, sa: 0, a: 0 }; // (cache()'s frame: the world's own)
const LOOK = {
  // each kind's skin: wall and floor textures with their tints, and what grows there
  ice: {
    wall: ['terrain/snow', 0xbcd8f2],
    floor: ['terrain/snow', 0xdce8f4],
    glow: 0x10304a,
    amb: [0x9cc8ff, 0.5],
    mouth: 0xc8d8e6,
    fog: [0x0a1622, 3, 40],
    mote: [0xd8f0ff, 0.05, 0.5],
    wet: true,
  },
  fungal: {
    wall: ['terrain/rock', 0x7c7494],
    floor: ['terrain/moss', 0x7d8c70],
    glow: 0x05100e,
    amb: [0x6af0d8, 0.22],
    mouth: 0x8e9088,
    fog: [0x041412, 3, 34],
    mote: [0x7affe0, 0.08, 0.9],
    wet: true,
  },
  mine: {
    wall: ['terrain/rock', 0x948e86],
    floor: ['terrain/gravel', 0x8c8272],
    glow: 0x000000,
    amb: [0xffd0a0, 0.14],
    mouth: 0x9a9086,
    fog: [0x110d09, 4, 42],
    mote: [0xc8b090, 0.05, 0.35],
  },
  crystal: {
    wall: ['terrain/rock', 0xd6cab4],
    floor: ['terrain/sand', 0xdcc4a2],
    glow: 0x0c0804,
    amb: [0xffd8a0, 0.22],
    mouth: 0xd8c4a6,
    fog: [0x16100a, 4, 42],
    mote: [0xffd8a0, 0.05, 0.45],
  },
  roots: {
    wall: ['terrain/rock', 0x6f735c],
    floor: ['terrain/mud', 0x6a5c4a],
    glow: 0x020402,
    amb: [0x9ff0e8, 0.32],
    mouth: 0x8a7a64,
    fog: [0x081208, 3, 32],
    mote: [0xb8ffcc, 0.07, 0.7],
    wet: true,
  },
}; // (fog: its haze's colour, near and far; mote: what drifts in the torchlight, spores, dust or ice glitter: colour, size, brightness; wet: drips, or dry: grit and rumbles) // (amb: the faint light the cave's own glow casts: dark, but a player is never lost in black)
// the vault's rough surface over the smooth shape (the same everywhere it is asked: the mesh, the cracks, a spider's thread)
const vaultBump = (L, x, z, c) => (fbm(x * 0.21 + L.i * 7, z * 0.21, 3) - 0.5) * 1.6 * Math.min(1, c / 2);
export const vaultY = (L, x, z) => {
  const q = caveDepth(L, x, z);
  return floorOf(L, x, z) + q.ceil + vaultBump(L, x, z, q.ceil);
};
const DOOR = 1.0; // a mouth's doorway takes you in within this of its middle; inside, the opening takes you out (cavemap: x0 + 2.4)
let G = null,
  here = null,
  fade = null,
  cool = 0,
  el = null,
  hemi = null,
  lamps = [];

// ── Building (once, at load) ─────────────────────────────────────────────────────────────────────────────────────
// the motes: one cloud of spores, dust or ice glitter round the player while in a cave (drifting; wrapped in an 18 m box)
let motes = null;
const MB = 18,
  MH = 7;
function buildMotes(scene) {
  const n = 320,
    p = new Float32Array(n * 3);
  for (let k = 0; k < n; k++)
    p.set([(Math.random() - 0.5) * MB, Math.random() * MH, (Math.random() - 0.5) * MB], k * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  motes = new THREE.Points(
    g,
    new THREE.PointsMaterial({
      map: glowTex(false),
      size: 0.06,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  motes.frustumCulled = false;
  motes.visible = false;
  scene.add(motes);
}
function tickMotes(dt) {
  if (!motes) return;
  motes.visible = !!here;
  if (!here) return;
  const P = G.player,
    [col, size, k] = LOOK[here.kind].mote,
    m = motes.material;
  m.color.setHex(col).multiplyScalar(k);
  m.size = size;
  const a = motes.geometry.attributes.position,
    t = performance.now() / 1000,
    base = floorOf(here.L, P.x, P.z);
  for (let i = 0; i < a.count; i++) {
    let x = a.getX(i) + Math.sin(t * 0.3 + i) * 0.08 * dt,
      y = a.getY(i) + (here.kind === 'fungal' || here.kind === 'roots' ? 0.05 : -0.04) * dt,
      z = a.getZ(i) + Math.cos(t * 0.27 + i * 1.7) * 0.08 * dt;
    y = ((y % MH) + MH) % MH;
    a.setXYZ(i, x, y, z);
  }
  a.needsUpdate = true;
  motes.position.set(Math.round(P.x / MB) * MB, base, Math.round(P.z / MB) * MB);
} // (the box steps with the player: the motes stay put in the cave)
// each cave's own sounds, round you in the dark (wet: drips and bubbles; dry: grit, creaking timbers and now and then a rumble in the rock
// that shakes dust down from the vault); every cave breathes a low hum
const SOUNDS = {
  ice: [
    ['drip', 0.6, 2.2, 0.55],
    ['creak', 9, 20, 0.25],
    ['hum', 6, 12, 1],
  ],
  fungal: [
    ['drip', 0.9, 2.8, 0.45],
    ['bubble', 6, 14, 0.25],
    ['hum', 6, 12, 1],
  ],
  roots: [
    ['drip', 0.4, 1.6, 0.6],
    ['bubble', 4, 10, 0.4],
    ['hum', 6, 12, 1],
  ],
  mine: [
    ['creak', 4, 11, 0.45],
    ['grit', 3, 8, 0.6],
    ['rumble', 28, 50, 1],
    ['hum', 7, 14, 1],
  ],
  crystal: [
    ['grit', 3.5, 9, 0.55],
    ['rumble', 35, 60, 1],
    ['hum', 7, 14, 1],
  ],
};
const sndT = {};
function tickSounds(dt) {
  if (!here) return;
  const P = G.player,
    L = here.L;
  for (const [name, a, b, vol] of SOUNDS[here.kind]) {
    const k = here.kind + name;
    if ((sndT[k] = (sndT[k] ?? a + Math.random() * (b - a)) - dt) > 0) continue;
    sndT[k] = a + Math.random() * (b - a);
    const ang = Math.random() * 6.28,
      r = 3 + Math.random() * 10,
      x = P.x + Math.cos(ang) * r,
      z = P.z + Math.sin(ang) * r;
    G.sfx(name, { x, z }, vol);
    if (name === 'rumble')
      for (let n = 0; n < 4; n++) {
        const px = P.x + (Math.random() - 0.5) * 10,
          pz = P.z + (Math.random() - 0.5) * 10,
          q = caveDepth(L, px, pz);
        if (q.d > 0.5) dustPuff(new THREE.Vector3(px, floorOf(L, px, pz) + q.ceil - 0.3, pz), 18);
      }
  }
}
// (the mouth stands in the world; the inside is drawn only for whoever is in it: from the north edge's mountains it would hang in the sky)
export function buildCaves(scene) {
  lamps = [];
  buildMotes(scene);
  for (const c of caves) {
    c.mg = new THREE.Group();
    c.g = new THREE.Group();
    c.g.name = 'cave ' + c.kind;
    c.g.visible = false;
    scene.add(c.mg, c.g);
    mouth(c);
    inside(c);
    watchers(c);
  }
}

// the mouth: a rock hill half sunk in the ground, two shoulders and a lintel framing a black throat, rubble in the yard, and the
// kind's own mark on it (snow and icicles, glowing caps, a timbered adit with its rails and cart, crystal shards, hanging roots)
function mouth(c) {
  const L = LOOK[c.kind],
    R = mulberry32(SEED ^ (c.L.i * 977 + 5)),
    { fx, fz } = c,
    sx = -fz,
    sz = fx,
    yaw = Math.atan2(fx, fz);
  const m = pbr('terrain/rock', { color: L.mouth, vc: true, rough: 0.95 }),
    top = {
      ice: [0.95, 0.97, 1],
      fungal: [0.55, 0.62, 0.45],
      crystal: [1, 0.92, 0.78],
      roots: [0.42, 0.48, 0.3],
      mine: [0.8, 0.74, 0.62],
    }[c.kind];
  const at = (f, s, up = 0) => {
    const x = c.door.x + fx * f + sx * s,
      z = c.door.z + fz * f + sz * s;
    return new THREE.Vector3(x, groundY(x, z) + up, z);
  };
  const rock = (p, sc, solid, rough = 0.5) => {
    const g = new THREE.IcosahedronGeometry(1, 4),
      q = g.attributes.position,
      cl = new Float32Array(q.count * 3),
      o = R() * 50;
    for (let k = 0; k < q.count; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(q, k),
        n = fbm(v.x * 1.3 + o, v.y * 1.3 + v.z * 1.1, 3),
        n2 = fbm(v.x * 4 + o, v.z * 4 - v.y, 2);
      v.multiplyScalar(0.78 + n * 0.4 + n2 * rough * 0.18);
      v.y = Math.max(v.y, -0.35);
      q.setXYZ(k, v.x, v.y, v.z);
      const u = Math.max(0, Math.min(1, (v.y - 0.2) * 2.2)),
        b = 0.75 + n2 * 0.4;
      cl.set([b + (top[0] - b) * u, b + (top[1] - b) * u, b + (top[2] - b) * u], k * 3);
    } // (its top takes the land's own cover)
    g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    g.computeVertexNormals();
    const r = new THREE.Mesh(g, m);
    r.scale.set(...sc);
    r.position.copy(p);
    r.rotation.y = yaw + (R() - 0.5) * 0.4;
    r.castShadow = r.receiveShadow = true;
    c.mg.add(r);
    if (solid) addCollider(p.x, p.z, solid, c);
    return r;
  };
  const hill = rock(at(-5.6, 0, -0.6), [9.5, 6.2, 5.0], 5.2, 0.3); // the hill (its face just behind the doorway)
  // the passage carved out of the hill: any of its rock inside the arch (1.35 m each side, 3.9 m up, 3.9 m back) pushed back behind it
  {
    hill.updateMatrixWorld(true);
    const P = hill.geometry.attributes.position,
      M = hill.matrixWorld,
      I = M.clone().invert(),
      v = new THREE.Vector3();
    let g0 = -1e9;
    for (let u = 0; u <= 2.2; u += 0.55) for (let w = -1.2; w <= 1.2; w += 0.6) g0 = Math.max(g0, at(-u, w).y); // (from the passage's own floor: it sits on the highest ground under it)
    for (let k = 0; k < P.count; k++) {
      v.fromBufferAttribute(P, k).applyMatrix4(M);
      const dx = v.x - c.door.x,
        dz = v.z - c.door.z,
        u = -(dx * fx + dz * fz),
        s = dx * sx + dz * sz,
        y = v.y - g0;
      if (Math.abs(s) < 1.35 && y < 4.0 && u < 2.4) {
        v.x -= fx * (2.4 - u);
        v.z -= fz * (2.4 - u);
        v.applyMatrix4(I);
        P.setXYZ(k, v.x, v.y, v.z);
      }
    }
    hill.geometry.computeVertexNormals();
  }
  const mine = c.kind === 'mine';
  rock(at(-0.4, 3.9, 0.3), [2.4, 3.4, 2.8], 2.2);
  rock(at(-0.4, -3.9, 0.2), [2.3, 3.1, 2.8], 2.2); // the shoulders (wide enough apart that the arch shows from the side too)
  if (!mine) rock(at(-0.8, 0, 4.75), [3.9, 1.3, 2.3]); // the lintel (above the arch)
  for (let k = 0; k < 6; k++) {
    const a = (R() - 0.5) * 2.6,
      d = 3 + R() * 4,
      s = 0.25 + R() * 0.45;
    rock(at(Math.cos(a) * d, Math.sin(a) * d * 1.4, s * 0.3), [s * 1.3, s, s * 1.1], null, 0.6);
  } // rubble
  // the throat: an arched passage of dark rock running back into black (its inside faces lit from the mouth, darker as it goes)
  const arch = new THREE.Shape();
  arch.moveTo(-1.25, -0.2);
  arch.lineTo(-1.25, 2.3);
  arch.quadraticCurveTo(-1.25, 3.7, 0, 3.75);
  arch.quadraticCurveTo(1.25, 3.7, 1.25, 2.3);
  arch.lineTo(1.25, -0.2);
  const tg = new THREE.ExtrudeGeometry(arch, { depth: 2.1, bevelEnabled: false, curveSegments: 10 }),
    tq = tg.attributes.position,
    tc = new Float32Array(tq.count * 3);
  for (let k = 0; k < tq.count; k++) {
    const v = Math.max(0.02, 0.5 * (1 - tq.getZ(k) / 2.1) ** 2);
    tc.set([v, v * 0.96, v * 0.92], k * 3);
  }
  tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  let gy = -1e9;
  for (let u = 0; u <= 2.2; u += 0.55) for (let w = -1.2; w <= 1.2; w += 0.6) gy = Math.max(gy, at(-u, w).y); // (the passage sits on the highest ground under it: no sand or snow pokes up inside)
  const t = new THREE.Mesh(tg, [
    new THREE.MeshBasicMaterial({ visible: false }),
    new THREE.MeshStandardMaterial({
      map: m.map,
      color: L.mouth,
      vertexColors: true,
      roughness: 1,
      side: THREE.BackSide,
    }),
  ]); // (its walls only: not its end caps)
  t.position.copy(at(-0.2, 0, 0)).setY(gy);
  t.rotation.y = yaw + Math.PI;
  c.mg.add(t);
  c.mouthMesh = t;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.9), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  back.position.copy(at(-2.2, 0, 0)).setY(gy + 1.75);
  back.rotation.y = yaw;
  c.mg.add(back);
  const put = (mesh, p, ry = yaw) => {
    mesh.position.copy(p);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    c.mg.add(mesh);
    return mesh;
  };
  if (c.kind === 'ice')
    for (let k = 0; k < 9; k++) {
      const l = 0.4 + R() * 1.1,
        ic = new THREE.Mesh(new THREE.ConeGeometry(0.1, l, 6).rotateX(Math.PI), ICE());
      put(ic, at(0.2 + R() * 0.4, (k - 4) * 0.42, 3.55 - l / 2));
    }
  if (c.kind === 'fungal')
    for (let k = 0; k < 7; k++) {
      const s = 0.4 + R() * 0.7,
        a = at(0.5 + R() * 2.5, (R() < 0.5 ? -1 : 1) * (1.6 + R() * 3), 0);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s * 2, 0.09 * s * 2, s * 1.2, 6), STEM());
      put(st, a.clone().setY(a.y + s * 0.6));
      const cp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), CAP());
      cp.scale.set(s * 1.4, s * 0.8, s * 1.4);
      put(cp, a.clone().setY(a.y + s * 1.15));
    }
  if (mine) {
    const wood = WOOD(),
      post = new THREE.BoxGeometry(0.34, 3.9, 0.34);
    for (const s of [-1.3, 1.3]) put(new THREE.Mesh(post, wood), at(0.1, s, 1.95));
    put(new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 0.42), wood), at(0.1, 0, 3.95));
    put(new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.2, 0.12), wood), at(-0.1, 0, 4.75)); // the cap and its boarding
    const ct = put(cart(), at(3.4, 1.8, 0), yaw + 0.25);
    addCollider(ct.position.x, ct.position.z, 0.9, c);
    for (let d = -1; d < 7; d += 0.8) put(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.22), wood), at(d, 0, 0.04));
  }
  if (c.kind === 'crystal')
    for (let k = 0; k < 8; k++) {
      const l = 0.8 + R() * 1.8,
        cr = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.24, l, 6).translate(0, l / 2, 0), CRYSTAL());
      const p =
        k < 5
          ? at(0.6 + R() * 1.6, (k % 2 ? 1 : -1) * (1.7 + R() * 1.6), 0)
          : at(-1.5 - R() * 3, (R() - 0.5) * 7, 2.5 + R() * 2); /* (most at the doorway's feet, where they show) */
      put(cr, p).rotation.set((R() - 0.5) * 0.9, R() * 6, (R() - 0.5) * 0.9);
    }
  if (c.kind === 'roots' || c.kind === 'fungal') {
    const geos = [],
      leaves = []; // (a tangle over the lintel and the shoulders, never a row: it read as teeth; roots narrowing to their tips, with side roots, and leafy vines among them)
    // (over the way in, 2.6 m either side of the doorway's middle, every point of a root or vine stays 2.2 m over the ground: no one walks through one)
    const okM = (p) => {
      const lat = Math.abs((p.x - c.door.x) * sx + (p.z - c.door.z) * sz),
        fw = (p.x - c.door.x) * fx + (p.z - c.door.z) * fz;
      return p.y - groundY(p.x, p.z) >= (lat < 2.6 && fw > -1 && fw < 5 ? 2.2 : 0.4);
    };
    c.mhangs = [];
    for (let k = 0; k < (c.kind === 'roots' ? 14 : 5); k++) {
      const s0 = (k % 2 ? 1 : -1) * (0.9 + R() * 2.7),
        a = at(1.2 + R() * 1.1, s0, 3.5 + R() * 1.2);
      hangRoot(R, a.x, a.y, a.z, 0.8 + R() * 1.8, 0.05 + R() * 0.07, geos, [fx * 0.5, fz * 0.5], okM, c.mhangs);
    }
    for (let k = 0; k < (c.kind === 'roots' ? 12 : 8); k++) {
      const s0 = (k % 2 ? 1 : -1) * (1.3 + R() * 2.3),
        a = at(0.9 + R() * 1.4, s0, 3.6 + R() * 1.2);
      hangVine(R, a.x, a.y, a.z, 1 + R() * 2.2, geos, leaves, okM, c.mhangs);
    }
    c.mg.add(new THREE.Mesh(mergeGeometries(geos), bark(c.kind === 'roots' ? 0x5a4632 : 0x6c6250)), leafMesh(leaves));
  }
  mergeStill(c.mg); // (lane E: the hill, shoulders, lintel and rubble share one rock and draw as one, as do the timbers)
}
const once = (f) => {
  let m = null;
  return () => (m ||= f());
};
// a fern frond, painted: a curving stem, leaflets each side that shrink to the tip, each with its own lobes and a lighter middle
// (the quality and detail pass, November 15, 2026: the first fern was a 64-pixel stamp of ovals)
let fernT = null;
const fernTex = () =>
  (fernT ||= canvasTex(
    128,
    128,
    (x, w, h) => {
      x.clearRect(0, 0, w, h);
      const P = (t) => [w / 2 + Math.sin(t * 2.2) * 9 * t, h - 2 - t * (h - 8)];
      x.strokeStyle = '#3e6428';
      x.lineWidth = 2.4;
      x.beginPath();
      for (let t = 0; t <= 1.001; t += 0.05) {
        const [px, py] = P(t);
        t ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.stroke();
      for (let k = 0; k < 17; k++) {
        const t = 0.08 + k * 0.053,
          [px, py] = P(t),
          l = 30 * (1 - t) ** 0.8 + 3;
        for (const sd of [-1, 1]) {
          x.save();
          x.translate(px, py);
          x.rotate(sd * (1.15 - t * 0.5));
          x.translate(0, -l / 2);
          for (let j = 0; j < 6; j++) {
            const yy = l / 2 - (j * l) / 6;
            x.fillStyle = j % 2 ? '#5a8a36' : '#4d7c2e';
            x.beginPath();
            x.ellipse(0, yy, 3.4 * (1 - j / 8), l / 11, 0, 0, 6.28);
            x.fill();
          }
          x.strokeStyle = '#86b25a';
          x.lineWidth = 0.8;
          x.beginPath();
          x.moveTo(0, l / 2);
          x.lineTo(0, -l / 2);
          x.stroke();
          x.restore();
        }
      }
    },
    'rgba(0,0,0,0)',
  ));
// a leaf for the vines: pointed, darker at the edge, a pale vein
let leafT = null;
const leafTex = () =>
  (leafT ||= canvasTex(
    64,
    64,
    (x, w, h) => {
      x.clearRect(0, 0, w, h);
      const g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#3d6a2a');
      g.addColorStop(0.5, '#5d9440');
      g.addColorStop(1, '#2f5422');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(2, h / 2);
      x.quadraticCurveTo(w * 0.45, 2, w - 2, h / 2);
      x.quadraticCurveTo(w * 0.45, h - 2, 2, h / 2);
      x.fill();
      x.strokeStyle = '#9cc77a';
      x.lineWidth = 1.2;
      x.beginPath();
      x.moveTo(2, h / 2);
      x.lineTo(w - 6, h / 2);
      x.stroke();
      x.lineWidth = 0.6;
      for (let k = 1; k < 5; k++)
        for (const sd of [-1, 1]) {
          x.beginPath();
          x.moveTo((k * w) / 5.5, h / 2);
          x.lineTo((k * w) / 5.5 + 7, h / 2 + sd * (h / 2 - 8) * (1 - Math.abs(k - 2.5) / 3.5));
          x.stroke();
        }
    },
    'rgba(0,0,0,0)',
  ));
// a root: a tube along pts (top first) that narrows from r0 to a fine tip, knotted a little, its uvs run along it for the bark
function taper(pts, r0, sides = 6) {
  const cv = new THREE.CatmullRomCurve3(pts),
    len = cv.getLength(),
    n = Math.max(3, Math.round(len * 3.5)),
    fr = cv.computeFrenetFrames(n, false),
    pos = [],
    uv = [],
    idx = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n,
      p = cv.getPointAt(u),
      r = r0 * (1 - u * 0.9) * (1 + 0.14 * Math.sin(u * 27 + r0 * 61)),
      N = fr.normals[i],
      B = fr.binormals[i];
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * 6.2832,
        cs = -Math.cos(a),
        sn = Math.sin(a);
      /* (three's own tube ring: faces out) */ pos.push(
        p.x + r * (cs * N.x + sn * B.x),
        p.y + r * (cs * N.y + sn * B.y),
        p.z + r * (cs * N.z + sn * B.z),
      );
      uv.push(j / sides, u * len * 1.6);
    }
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j,
        b = a + sides + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// a hanging root from (x, y, z), len long, with one to three side roots off it (each finer, reaching out and down); geos collects them
// ok(point) says whether a point of it may hang there (head height); a root that breaks it is tried again shorter, up to four times, then left
// out; rec collects every point of the ones kept (the walk test reads them)
function hangRoot(R, x, y, z, len, r0, geos, lean = [0, 0], ok = () => true, rec = null) {
  for (let t = 0; t < 4 && len >= 0.3; t++, len *= 0.7) {
    const sw = 0.12 + R() * 0.3,
      ph = R() * 6,
      pts = [],
      bps = [];
    for (let n = 0; n <= 6; n++) {
      const u = n / 6;
      pts.push(
        new THREE.Vector3(
          x + Math.sin(u * 3.1 + ph) * sw * u + lean[0] * u,
          y - u * len,
          z + Math.cos(u * 2.7 + ph) * sw * u + lean[1] * u,
        ),
      );
    }
    const cv = new THREE.CatmullRomCurve3(pts);
    for (let k = 0, nb = 1 + Math.floor(R() * 3); k < nb && len > 0.7; k++) {
      const u = 0.2 + R() * 0.5,
        p = cv.getPointAt(u),
        a = R() * 6.28,
        out = 0.2 + R() * 0.5,
        dn = (1 - u) * len * (0.4 + R() * 0.5),
        bp = [];
      for (let n = 0; n <= 4; n++) {
        const v = n / 4;
        bp.push(
          new THREE.Vector3(
            p.x + Math.cos(a) * out * Math.sqrt(v),
            p.y - dn * v * v,
            p.z + Math.sin(a) * out * Math.sqrt(v),
          ),
        );
      }
      bps.push({ bp, r: r0 * (1 - u * 0.9) * 0.55 });
    }
    const all = [...pts, ...bps.flatMap((q) => q.bp)];
    if (!all.every(ok)) continue;
    geos.push(taper(pts, r0, 5));
    for (const q of bps) geos.push(taper(q.bp, q.r, 4));
    rec?.push(...all);
    return true;
  }
  return false;
}
// a vine: a fine stem hanging from (x, y, z) with leaves along it in pairs, turned every way (leaves collects their spots)
function hangVine(R, x, y, z, len, geos, leaves, ok = () => true, rec = null) {
  for (let t = 0; t < 4 && len >= 0.3; t++, len *= 0.7) {
    const sw = 0.1 + R() * 0.25,
      ph = R() * 6,
      pts = [];
    for (let n = 0; n <= 6; n++) {
      const u = n / 6;
      pts.push(new THREE.Vector3(x + Math.sin(u * 4 + ph) * sw * u, y - u * len, z + Math.cos(u * 3.4 + ph) * sw * u));
    } /* (its top at the spot the vault was measured: no floating) */
    if (!pts.every(ok)) continue;
    geos.push(taper(pts, 0.016, 4));
    rec?.push(...pts);
    const cv = new THREE.CatmullRomCurve3(pts);
    for (let u = 0.06 + R() * 0.05; u < 0.98; u += 0.05 + R() * 0.05) {
      const p = cv.getPointAt(u);
      leaves.push({
        x: p.x,
        y: p.y,
        z: p.z,
        a: R() * 6.28,
        t: -0.3 - R() * 0.7,
        s: (0.6 + R() * 0.6) * (1.1 - u * 0.4),
      });
    }
    return true;
  }
  return false;
}
const leafGeo = once(() => new THREE.PlaneGeometry(0.16, 0.1).translate(0.08, 0, 0));
const LEAF = once(
  () => new THREE.MeshStandardMaterial({ map: leafTex(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }),
);
const BARK = {},
  barkM = once(() => pbr('props/logbark', { rough: 0.95, rep: 1 }));
const bark = (col) => (BARK[col] ||= Object.assign(barkM().clone(), { color: new THREE.Color(col) })); // (one texture pair, a tint each)
function leafMesh(leaves) {
  const m = new THREE.InstancedMesh(leafGeo(), LEAF(), leaves.length),
    o = new THREE.Object3D();
  leaves.forEach((q, k) => {
    o.position.set(q.x, q.y, q.z);
    o.rotation.set(0, q.a, q.t);
    o.scale.setScalar(q.s);
    o.updateMatrix();
    m.setMatrixAt(k, o.matrix);
  });
  return m;
}
// a crack in the vault: an irregular hole, facing down
function jagged(r) {
  const s = new THREE.Shape(),
    n = 11;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2,
      q = r * (0.45 + Math.random() * 0.7);
    k ? s.lineTo(Math.cos(a) * q, Math.sin(a) * q) : s.moveTo(q, 0);
  }
  return new THREE.ShapeGeometry(s).rotateX(Math.PI / 2);
}
// a beam of light: bright where it comes in, fading as it falls, with streaks of dust
let shaftT = null;
const shaftTex = () =>
  (shaftT ||= canvasTex(
    64,
    128,
    (x, w, h) => {
      x.clearRect(0, 0, w, h);
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,246,226,0.55)');
      g.addColorStop(1, 'rgba(255,246,226,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      for (let k = 0; k < 9; k++) {
        x.fillStyle = `rgba(255,250,236,${0.04 + Math.random() * 0.08})`;
        x.fillRect(Math.random() * w, 0, 1 + Math.random() * 3, h);
      }
    },
    'rgba(0,0,0,0)',
  ));
// a mine cart: an open iron tub on four wheels
function cart() {
  const g = new THREE.Group(),
    m = RAIL(),
    box = (w, h, d, x, y, z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      b.castShadow = true;
      g.add(b);
    };
  box(1.1, 0.08, 1.6, 0, 0.45, 0);
  box(0.08, 0.6, 1.6, -0.55, 0.75, 0);
  box(0.08, 0.6, 1.6, 0.55, 0.75, 0);
  box(1.1, 0.6, 0.08, 0, 0.75, -0.8);
  box(1.1, 0.6, 0.08, 0, 0.75, 0.8);
  for (const x of [-0.5, 0.5])
    for (const z of [-0.5, 0.5]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 12).rotateZ(Math.PI / 2), m);
      w.position.set(x * 1.18, 0.22, z * 1.3);
      g.add(w);
    }
  return mergeStill(g);
}
// the shared materials (made once)
const ICE = once(
  () =>
    new THREE.MeshStandardMaterial({
      color: 0xe6f4ff,
      emissive: 0x3d7fb0,
      emissiveIntensity: 0.55,
      roughness: 0.15,
      transparent: true,
      opacity: 0.85,
    }),
);
const STEM = once(() => new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.8 }));
const CAP = once(
  () => new THREE.MeshStandardMaterial({ color: 0x2c8a7c, emissive: 0x58f0d0, emissiveIntensity: 1.3, roughness: 0.4 }),
);
const CRYSTAL = once(
  () =>
    new THREE.MeshStandardMaterial({
      color: 0xffe2b0,
      emissive: 0xffa848,
      emissiveIntensity: 1.25,
      roughness: 0.08,
      metalness: 0.2,
      transparent: true,
      opacity: 0.82,
    }),
);
const WOOD = once(() => pbr('props/planks', { color: 0x7a5c40, rough: 0.9 }));
const RAIL = once(() => new THREE.MeshStandardMaterial({ color: 0x5a5048, metalness: 0.6, roughness: 0.5 }));
// a soft-edged painted glow: the opening's arch of daylight and its pool on the floor
const glowTex = (arch) =>
  canvasTex(
    128,
    128,
    (x, w, h) => {
      x.clearRect(0, 0, w, h);
      if (arch) {
        const g = x.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(205,225,255,1)');
        g.addColorStop(0.6, 'rgba(255,248,232,1)');
        g.addColorStop(1, 'rgba(255,240,210,1)');
        x.fillStyle = g;
        x.filter = 'blur(5px)';
        x.beginPath();
        x.moveTo(14, h);
        x.lineTo(14, 52);
        x.quadraticCurveTo(14, 8, w / 2, 8);
        x.quadraticCurveTo(w - 14, 8, w - 14, 52);
        x.lineTo(w - 14, h);
        x.fill();
      } else {
        const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, 'rgba(255,244,220,0.55)');
        g.addColorStop(1, 'rgba(255,244,220,0)');
        x.fillStyle = g;
        x.fillRect(0, 0, w, h);
      }
    },
    'rgba(0,0,0,0)',
  );

// the inside: the floor and the vault (one height field each, meeting at the wall), the walls' colliders, what grows, the crates
function inside(c) {
  const L = c.L,
    K = LOOK[c.kind],
    S = 0.7,
    [x0, x1, z0, z1] = L.box,
    nx = Math.ceil((x1 - x0) / S) + 1,
    nz = Math.ceil((z1 - z0) / S) + 1,
    n = nx * nz;
  const fp = new Float32Array(n * 3),
    cp = new Float32Array(n * 3),
    fc = new Float32Array(n * 3),
    cc = new Float32Array(n * 3),
    fu = new Float32Array(n * 2),
    cu = new Float32Array(n * 2),
    D = new Float32Array(n);
  const col = new THREE.Color(),
    dep = (x, z) => caveDepth(L, x, z).d;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      let x = x0 + i * S,
        z = z0 + j * S;
      const q = caveDepth(L, x, z);
      D[k] = q.d;
      let ceil = q.ceil > 0 ? q.ceil + vaultBump(L, x, z, q.ceil) : -0.4;
      // D6 ("we'll want the cave walls and ceilings to look less boring"): the walls pushed back in upright ribs and hollows (only ever
      // outward, away from where you walk; the wall's foot stays put, so nothing opens at the floor)
      if (q.d > 0 && q.d < 2.6 && ceil > 0.6) {
        const gx = dep(x + 0.15, z) - dep(x - 0.15, z),
          gz = dep(x, z + 0.15) - dep(x, z - 0.15),
          gl = Math.hypot(gx, gz) || 1,
          tng = (z * gx - x * gz) / gl;
        const rib =
          Math.pow(0.5 + 0.5 * Math.sin(tng * 2.1 + fbm(x * 0.3, z * 0.3, 2) * 5), 3) *
          0.6 *
          Math.min(1, (ceil - 0.6) / 1.2) *
          (1 - q.d / 2.6);
        x -= (gx / gl) * rib;
        z -= (gz / gl) * rib;
      }
      if (q.d < 0 && q.d > -1.5 * S) {
        const gx = dep(x + 0.1, z) - dep(x - 0.1, z),
          gz = dep(x, z + 0.1) - dep(x, z - 0.1),
          gl = Math.hypot(gx, gz) || 1;
        x -= (gx / gl) * q.d;
        z -= (gz / gl) * q.d;
        ceil = -0.25;
      } // (onto the wall's foot: no saw-tooth)
      const f = floorOf(L, x, z);
      fp.set([x, f, z], k * 3);
      cp.set([x, f + ceil, z], k * 3);
      fu.set([x * 0.25, z * 0.25], k * 2);
      cu.set(
        [(x + f + ceil) * 0.25, (z + f + ceil) * 0.25],
        k * 2,
      ); /* (the height counts fully: no smear down a steep wall) */
      const v = 0.72 + fbm(x * 0.09, z * 0.09 + 40, 2) * 0.5;
      col.setScalar(v);
      fc.set([col.r, col.g, col.b], k * 3);
      col.setScalar(
        v *
          (0.75 + 0.35 * Math.min(1, ceil / 4)) *
          (0.84 + 0.16 * Math.sin((f + ceil) * 2.6 + fbm(x * 0.05, z * 0.05, 2) * 6)),
      );
      /* (the rock's layers) */ cc.set([col.r, col.g, col.b], k * 3);
    }
  const fi = [],
    ci = [];
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i,
        b = a + 1,
        d = a + nx,
        e = d + 1;
      if (Math.max(D[a], D[b], D[d], D[e]) < -S * 1.5) continue;
      fi.push(a, d, b, b, d, e);
      ci.push(a, b, d, b, e, d);
    }
  const mesh = (p, u, cl, idx, look) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(u, 2));
    g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = pbr(look[0], { color: look[1], vc: true, rough: 0.92 });
    m.emissive.setHex(K.glow);
    const o = new THREE.Mesh(g, m);
    o.receiveShadow = true;
    c.g.add(o);
    return o;
  };
  c.floor = mesh(fp, fu, fc, fi, K.floor);
  c.vault = mesh(cp, cu, cc, ci, K.wall);
  // the walls: a post every half metre along the wall's foot, just outside it, overlapping (a player stops about 0.35 m inside it)
  for (let z = Math.ceil(z0); z < z1; z += 0.5)
    for (let x = Math.ceil(x0); x < x1; x += 0.5) {
      const d = dep(x, z);
      if (d <= -0.7 || d > 0.1) continue;
      addCollider(x, z, 0.7, c);
    }
  // the opening: daylight (or night) at the mouth chamber's west end; walking into it takes you out
  const ox = L.x0 - 0.7,
    oy = floorOf(L, ox, L.mouth.z),
    o = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0, 2.9),
      new THREE.MeshBasicMaterial({ map: glowTex(true), transparent: true, fog: false, depthWrite: false }),
    );
  o.rotation.y = Math.PI / 2;
  o.position.set(ox, oy + 1.45, L.mouth.z);
  c.g.add(o);
  c.opening = o;
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: glowTex(false),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  pool.position.set(ox + 2.6, oy + 0.06, L.mouth.z);
  c.g.add(pool);
  c.pool = pool;
  // the plinth in the back hall, where the relic will rest (slice 2), and the crates (the side room's two, the hall's one)
  if (L.hall) {
    // (only a relic cave has its hall and plinth: Jared, November 15, 2026, "only the cave with the boss/artifact should have end room/pedistal")
    const hy = floorOf(L, L.hall.x, L.hall.z),
      pl = new THREE.Mesh(
        new THREE.CylinderGeometry(1.05, 1.35, 1.1, 12),
        pbr('terrain/rock', { color: 0x8a8680, rough: 0.9 }),
      );
    pl.position.set(L.hall.x, hy + 0.55, L.hall.z);
    c.g.add(pl);
    c.plinth = pl;
    pl.material.color.setHex(0xc8c2b6);
    pl.material.emissive.setHex(0x1a1810);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.88, 0.05, 6, 40).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffc860, emissiveIntensity: 1.2 }),
    );
    ring.position.set(L.hall.x, hy + 1.12, L.hall.z);
    c.g.add(ring); /* (where the relic will rest) */
    Object.assign(addCollider(L.hall.x, L.hall.z, 1.35, c), { stand: hy + 1.1, top: hy + 1.1 });
    for (const s of [-1, 1]) {
      const x = L.hall.x - 2.5,
        z = L.hall.z + s * 3,
        y = floorOf(L, x, z),
        lamp = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.3, 0.2),
          new THREE.MeshStandardMaterial({ color: 0xffd090, emissive: 0xffa040, emissiveIntensity: 2 }),
        );
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 }),
      );
      post.position.set(x, y + 0.8, z);
      lamp.position.set(x, y + 1.75, z);
      c.g.add(post, lamp);
      lamps.push({ c, x, y: y + 1.7, z, key: 'torch', i: 8, dist: 14 });
    } // (an old lantern each side of the plinth: the hall is where the family will gather)
  }
  c.crates = L.crates.map(
    (p, j) =>
      cache(FRAME, c.g, p.x, p.z, null, {
        y: floorOf(L, p.x, p.z),
        k: j === L.crates.length - 1 ? 4 : 3,
        cave: c.kind,
        deep: j / Math.max(1, L.crates.length - 1),
      }) /* (the last, the deepest, the richest: crateOpen) */,
  );
  if (CLASSIC) for (const k of c.crates) k.isNew = true; // (a new thing's crates on the classic world, as buildings.js's fresh(): housecheck's old crates stay main's)
  grow(c);
}

// what grows or stands in each kind of cave (none of it solid but the mine's cart)
function grow(c) {
  const L = c.L,
    R = mulberry32(SEED ^ (c.L.i * 4421 + 17)),
    [x0, x1, z0, z1] = L.box,
    pick = (dMin, dMax) => {
      for (let t = 0; t < 60; t++) {
        const x = x0 + R() * (x1 - x0),
          z = z0 + R() * (z1 - z0),
          q = caveDepth(L, x, z);
        if (q.d > dMin && q.d < dMax) return { x, z, y: floorOf(L, x, z), ceil: q.ceil };
      }
      return null;
    };
  const inst = (geo, mat, list, place) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length),
      o = new THREE.Object3D();
    list.forEach((p, k) => {
      place(o, p, k);
      o.updateMatrix();
      m.setMatrixAt(k, o.matrix);
    });
    m.castShadow = false;
    c.g.add(m);
    return m;
  };
  const glowMat = (color, emissive, k = 1, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: k, roughness: 0.4, ...extra });
  const spots = (N, a, b) => Array.from({ length: N }, () => pick(a, b)).filter(Boolean);
  c.traps = L.traps.map((p) => ({ ...p, y: floorOf(L, p.x, p.z), armed: true }));
  // D6: hanging and standing stone in every cave (the ice cave hangs icicles instead), a few pillars in its wide places
  const rockM = pbr(LOOK[c.kind].wall[0], { color: LOOK[c.kind].wall[1], rough: 0.9 });
  rockM.emissive.setHex(LOOK[c.kind].glow);
  if (c.kind !== 'ice')
    inst(new THREE.ConeGeometry(0.22, 1, 7).rotateX(Math.PI), rockM, spots(110, 0.8, 9), (o, p) => {
      const l = 0.4 + R() * 1.8;
      o.position.set(p.x, vaultY(L, p.x, p.z) - l / 2 + 0.2, p.z);
      o.scale.set(0.7 + R() * 0.8, l, 0.7 + R() * 0.8);
    });
  inst(new THREE.ConeGeometry(0.3, 1, 7), rockM, spots(70, 0.15, 1.3), (o, p) => {
    const l = 0.3 + R() * 1.6;
    o.position.set(p.x, p.y + l / 2 - 0.05, p.z);
    o.scale.set(0.8 + R() * 0.9, l, 0.8 + R() * 0.9);
  });
  const keep = [L.end, ...L.crates, ...L.traps, { x: L.mouth.in[0], z: L.mouth.in[1] }];
  let pillars = 0;
  for (const part of L.parts.filter((q) => Math.max(q.ra, q.rb) >= 7))
    for (let n = 0; n < 6 && pillars < 5; n++) {
      const t = R(),
        ax = part.a[0] + (part.b[0] - part.a[0]) * t,
        az = part.a[1] + (part.b[1] - part.a[1]) * t,
        ang = R() * 6.28,
        r = 3 + R() * 4,
        x = ax + Math.cos(ang) * r,
        z = az + Math.sin(ang) * r,
        q = caveDepth(L, x, z);
      if (q.d < 2.5 || q.d > 4.5 || q.ceil < 5 || keep.some((p) => Math.hypot(p.x - x, p.z - z) < 4)) continue;
      const f = floorOf(L, x, z),
        h = vaultY(L, x, z) - f + 0.4,
        b = 0.7 + R() * 0.4,
        prof = [];
      for (let s = 0; s <= 10; s++) {
        const y = s / 10;
        prof.push(
          new THREE.Vector2(
            b * (1 - 0.35 * Math.sin(Math.PI * y) + (R() - 0.5) * 0.12) * (y < 0.08 || y > 0.92 ? 1.3 : 1),
            y * h,
          ),
        );
      }
      const pm = new THREE.Mesh(new THREE.LatheGeometry(prof, 12), rockM);
      pm.position.set(x, f - 0.1, z);
      pm.castShadow = pm.receiveShadow = true;
      c.g.add(pm);
      addCollider(x, z, b + 0.15, c);
      (c.pillars ||= []).push({ x, z, r: b + 0.15 });
      pillars++;
    }
  // D6 ("will need to account for SOME light in caves"): a shaft of daylight through a crack in the vault: one on the hall's plinth,
  // one in a side room or chamber (they dim to moonlight at night)
  c.shafts = [];
  const lit = [
    L.end,
    ...L.parts
      .filter((q) => q.tag === 'side' || q.tag === 'chamber')
      .slice(0, 1)
      .map((q) => ({ x: q.b[0], z: q.b[1] })),
  ];
  for (const p of lit) {
    const f = floorOf(L, p.x, p.z),
      h = vaultY(L, p.x, p.z) - f;
    if (h < 3) continue;
    const beam = new THREE.Group(),
      bm = new THREE.MeshBasicMaterial({
        map: shaftTex(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
    for (let k = 0; k < 3; k++) {
      const card = new THREE.Mesh(new THREE.PlaneGeometry(3.2, h).translate(0, h / 2, 0), bm);
      card.rotation.y = (k * Math.PI) / 3;
      beam.add(card);
    }
    beam.material = bm; // (three soft cards crossed: no hard edge from any side)
    beam.position.set(p.x, f, p.z);
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(2.1, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: glowTex(false),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    pool.position.set(p.x, f + 0.05, p.z);
    const crack = new THREE.Mesh(jagged(0.45), new THREE.MeshBasicMaterial({ color: 0xd8cfbe, fog: false }));
    crack.position.set(p.x, f + h - 0.06, p.z);
    c.g.add(beam, pool, crack);
    c.shafts.push(beam, pool, crack);
  }
  // (Jared, November 15, 2026: "Less boring walls can also be things like roots hanging down, and some cave plant life"): roots down
  // through the vault (not in ice or crystal), ferns where daylight reaches (round the opening and under each shaft), moss in the wet caves
  // (the quality and detail pass: roots narrow to their tips and branch, barked; where you walk, more than a metre from the wall, a tip
  // stays 3 m and more over the floor, above every head and the angled camera's eye; by the walls 2 m)
  c.hangs = [];
  const okIn = (q) => q.y - floorOf(L, q.x, q.z) >= (caveDepth(L, q.x, q.z).d > 1 ? 3.0 : 2.0); // (every point, side roots and sway too: over the walk 3 m up, clear of the angled camera; by the walls 2 m: a long one by the camera filled the view like a black pole)
  const hang = (N, col, a, b, r0) => {
    const geos = [],
      leaves = [];
    for (const p of spots(N, a, b)) {
      const top = vaultY(L, p.x, p.z),
        d = caveDepth(L, p.x, p.z).d,
        low = d > 1 ? p.y + 3.0 : p.y + 2.0;
      const l = Math.min(0.6 + R() * 2.0, top + 0.1 - low);
      if (l < 0.35) continue;
      hangRoot(R, p.x, top + 0.2, p.z, l, r0 * (0.7 + R() * 0.6), geos, [0, 0], okIn, c.hangs);
    }
    if (c.kind === 'roots' || c.kind === 'fungal')
      for (const q of lightSpots.slice(0, 1))
        for (let k = 0; k < 10; k++) {
          const x = q.x + (R() - 0.3) * q.r * 1.4,
            z = q.z + (R() - 0.5) * q.r * 1.6,
            dd = caveDepth(L, x, z).d;
          if (dd < 0.4) continue; // (vines where the daylight comes in)
          const top = vaultY(L, x, z),
            fl = floorOf(L, x, z),
            lowV = dd > 1 ? fl + 3.0 : fl + 2.0,
            l = Math.min(0.8 + R() * 2, top + 0.1 - lowV);
          if (l < 0.4) continue;
          hangVine(R, x, top + 0.2, z, l, geos, leaves, okIn, c.hangs);
        }
    if (geos.length) c.g.add(new THREE.Mesh(mergeGeometries(geos), bark(col)));
    if (leaves.length) c.g.add(leafMesh(leaves));
  };
  const lightSpots = [
      { x: L.x0 + 4, z: L.mouth.z, r: 6 },
      ...(c.shafts || []).filter((m, k) => k % 3 === 0).map((m) => ({ x: m.position.x, z: m.position.z, r: 3.2 })),
    ],
    ferns = [];
  if (c.kind === 'fungal') hang(40, 0x9a8c74, 0.5, 4, 0.05);
  if (c.kind === 'mine') hang(22, 0x5a4630, 0.4, 2.5, 0.045);
  if (c.kind === 'roots') hang(95, 0x4a3a28, 0.3, 7, 0.07);
  for (const q of lightSpots)
    for (let k = 0; k < 14; k++) {
      const a = R() * 6.28,
        r = q.r * Math.sqrt(R()),
        x = q.x + Math.cos(a) * r,
        z = q.z + Math.sin(a) * r,
        d = caveDepth(L, x, z).d;
      if (d < 0.3 || (q.r < 4 && r < 1.4)) continue;
      ferns.push({ x, z, y: floorOf(L, x, z), s: 0.5 + R() * 0.7, a: R() * 3 });
    }
  if (c.kind !== 'ice' && c.kind !== 'crystal' && ferns.length) {
    const fm = new THREE.MeshStandardMaterial({
        map: fernTex(),
        alphaTest: 0.4,
        side: THREE.DoubleSide,
        roughness: 0.9,
      }),
      fg = mergeGeometries(
        [0, 1, 2, 3, 4].map((k) => {
          const f = new THREE.PlaneGeometry(0.55, 0.95, 1, 6),
            q = f.attributes.position;
          for (let i = 0; i < q.count; i++) {
            const v = q.getY(i) + 0.475;
            q.setY(i, v * 0.8 - v * v * 0.35);
            q.setZ(i, v * v * 0.55);
          }
          /* (each frond arches out and droops) */ f.computeVertexNormals();
          return f.rotateY((k * Math.PI * 2) / 5 + 0.3);
        }),
      );
    inst(fg, fm, ferns, (o, p) => {
      o.position.set(p.x, p.y, p.z);
      o.rotation.set(0, p.a, 0);
      o.scale.setScalar(p.s);
    });
  }
  if (c.kind === 'roots' || c.kind === 'fungal' || c.kind === 'ice') {
    const mossy =
      c.kind === 'fungal'
        ? new THREE.MeshStandardMaterial({ color: 0x2c6a5c, emissive: 0x1a8a70, emissiveIntensity: 0.5, roughness: 1 })
        : new THREE.MeshStandardMaterial({ color: c.kind === 'ice' ? 0x8aa0a8 : 0x3e5a2c, roughness: 1 });
    inst(
      new THREE.SphereGeometry(0.5, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      mossy,
      spots(c.kind === 'ice' ? 25 : 90, 0.05, 0.9),
      (o, p) => {
        o.position.set(p.x, p.y - 0.05, p.z);
        o.scale.set(0.4 + R() * 0.9, 0.08 + R() * 0.12, 0.4 + R() * 0.9);
      },
    );
  }
  if (c.kind === 'ice') {
    // icicles from the vault, ice crystals from the walls' feet, and a bulge of clear ice at each surprise
    inst(new THREE.ConeGeometry(0.13, 1, 6).rotateX(Math.PI), ICE(), spots(160, 0.8, 6), (o, p) => {
      const l = 0.5 + R() * 1.6;
      o.position.set(p.x, p.y + p.ceil - l / 2 + 0.1, p.z);
      o.scale.set(1, l, 1);
    });
    inst(
      new THREE.OctahedronGeometry(0.5, 0),
      glowMat(0x9fd4ff, 0x2f74a8, 0.9, { transparent: true, opacity: 0.8 }),
      spots(70, 0.1, 1.2),
      (o, p) => {
        o.position.set(p.x, p.y + 0.3, p.z);
        o.scale.set(0.35 + R() * 0.3, 1 + R() * 1.6, 0.35 + R() * 0.3);
        o.rotation.set((R() - 0.5) * 0.8, R() * 6, (R() - 0.5) * 0.8);
      },
    );
  }
  if (c.kind === 'fungal') {
    // glowing caps on thin stems, and a few giants in the hall
    const caps = spots(140, 0.2, 2.2)
      .map((p) => ({ ...p, s: 0.25 + R() * 0.55 }))
      .concat(spots(9, 3, 9).map((p) => ({ ...p, s: 1.4 + R() * 1.2 })));
    inst(
      new THREE.CylinderGeometry(0.07, 0.1, 1, 6),
      new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.8 }),
      caps,
      (o, p) => {
        o.position.set(p.x, p.y + p.s * 0.6, p.z);
        o.scale.set(p.s, p.s * 1.2, p.s);
      },
    );
    inst(
      new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      glowMat(0x2c8a7c, 0x58f0d0, 1.3),
      caps,
      (o, p) => {
        o.position.set(p.x, p.y + p.s * 1.15, p.z);
        o.scale.set(p.s * 1.4, p.s * 0.8, p.s * 1.4);
      },
    );
  }
  if (c.kind === 'crystal') {
    // warm crystal prisms in clusters along the walls
    const cl = spots(45, 0.1, 1.4).flatMap((p) =>
      Array.from({ length: 3 + Math.floor(R() * 3) }, () => ({
        ...p,
        a: R() * 6.28,
        t: 0.2 + R() * 0.6,
        l: 0.8 + R() * 2.2,
      })),
    );
    inst(new THREE.CylinderGeometry(0.02, 0.22, 1, 6).translate(0, 0.5, 0), CRYSTAL(), cl, (o, p) => {
      o.position.set(p.x, p.y, p.z);
      o.rotation.set(Math.cos(p.a) * p.t, 0, Math.sin(p.a) * p.t);
      o.scale.set(1 + p.l * 0.3, p.l, 1 + p.l * 0.3);
    });
  }
  if (c.kind === 'roots') {
    // dark pools (the lurkers' at each surprise), glow-worms overhead
    // (its hanging roots are hang()'s, above, with the other caves')
    const pool = new THREE.MeshStandardMaterial({
      color: 0x24302a,
      emissive: 0x0a1c18,
      roughness: 0.04,
      metalness: 0.5,
    }); // (dark water with a sheen: pure black read as a hole)
    for (const p of spots(6, 2, 6)) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1.4 + R() * 0.8, 20).rotateX(-Math.PI / 2), pool);
      m.position.set(p.x, p.y + 0.04, p.z);
      c.g.add(m);
    }
    const worms = spots(520, 0.5, 9),
      gp = new Float32Array(worms.length * 3);
    worms.forEach((p, k) => gp.set([p.x, p.y + p.ceil - 0.1, p.z], k * 3));
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(gp, 3));
    c.g.add(
      new THREE.Points(
        gg,
        new THREE.PointsMaterial({
          color: 0xbff8ff,
          size: 0.16,
          map: glowTex(false),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    );
  }
  if (c.kind === 'mine') {
    // timber sets along every tunnel, rails down its middle, lanterns (lit: the fire lights take them), a cart, side holes at each surprise
    const wood = pbr('props/planks', { color: 0x7a5c40, rough: 0.9 }),
      post = new THREE.BoxGeometry(0.26, 1, 0.26),
      beam = new THREE.BoxGeometry(1, 0.28, 0.3),
      sets = [];
    for (const p of L.parts.filter((q) => q.tag === 'tunnel' || q.tag === 'neck')) {
      const dx = p.b[0] - p.a[0],
        dz = p.b[1] - p.a[1],
        len = Math.hypot(dx, dz),
        ux = dx / len,
        uz = dz / len;
      for (let s = 2.5; s < len - 1; s += 4.5) {
        const x = p.a[0] + ux * s,
          z = p.a[1] + uz * s,
          w = Math.min(p.ra, p.rb) - 0.75,
          h = Math.min(caveDepth(L, x, z).ceil - 0.3, 3.3);
        sets.push({ x, z, ux, uz, w, h, y: floorOf(L, x, z) });
      }
    }
    inst(
      post,
      wood,
      sets.flatMap((s) => [-1, 1].map((k) => ({ ...s, k }))),
      (o, s) => {
        o.position.set(s.x - s.uz * s.w * s.k, s.y + s.h / 2, s.z + s.ux * s.w * s.k);
        o.scale.set(1, s.h, 1);
        o.rotation.set(0, Math.atan2(s.ux, s.uz), 0);
      },
    );
    inst(beam, wood, sets, (o, s) => {
      o.position.set(s.x, s.y + s.h, s.z);
      o.scale.set(s.w * 2 + 0.4, 1, 1);
      o.rotation.set(0, Math.atan2(-s.ux, -s.uz), 0);
    }); // (across the tunnel)
    const lampM = new THREE.MeshStandardMaterial({ color: 0xffd090, emissive: 0xffa040, emissiveIntensity: 2 });
    sets.forEach((s, k) => {
      if (k % 3) return;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.18), lampM),
        x = s.x - s.uz * (s.w - 0.25),
        z = s.z + s.ux * (s.w - 0.25);
      m.position.set(x, s.y + s.h - 0.45, z);
      c.g.add(m);
      lamps.push({ c, x, y: s.y + s.h - 0.5, z, key: 'torch', i: 7, dist: 11 });
    });
    const rail = new THREE.MeshStandardMaterial({ color: 0x5a5048, metalness: 0.6, roughness: 0.5 }),
      ties = [];
    for (const p of L.parts.filter((q) => q.tag === 'tunnel')) {
      const dx = p.b[0] - p.a[0],
        dz = p.b[1] - p.a[1],
        len = Math.hypot(dx, dz);
      for (let s = 0; s < len; s += 0.8)
        ties.push({ x: p.a[0] + (dx * s) / len, z: p.a[1] + (dz * s) / len, r: Math.atan2(-dz, dx) });
    }
    inst(new THREE.BoxGeometry(0.22, 0.08, 1.4), wood, ties, (o, t) => {
      o.position.set(t.x, floorOf(L, t.x, t.z) + 0.04, t.z);
      o.rotation.set(0, t.r, 0);
    });
    inst(
      new THREE.BoxGeometry(0.85, 0.07, 0.07),
      rail,
      ties.flatMap((t) => [-0.5, 0.5].map((k) => ({ ...t, k }))),
      (o, t) => {
        o.position.set(t.x - Math.sin(t.r) * t.k, floorOf(L, t.x, t.z) + 0.12, t.z - Math.cos(t.r) * t.k);
        o.rotation.set(0, t.r, 0);
      },
    );
    const cx = L.end.x - (L.hall ? 5 : 2.5),
      cz = L.end.z - (L.hall ? 3 : 1.5),
      ct = cart();
    /* (in a relic cave's hall, or the other caves' end room) */ ct.position.set(cx, floorOf(L, cx, cz), cz);
    ct.rotation.set(0.04, 0.4, 0.12);
    c.g.add(ct);
    addCollider(cx, cz, 1.0, c);
  }
  for (const t of c.traps) lay(c, t, R);
}
// what waits at a surprise's spot, by the surprise (cavemap.js's SURPRISE): a bulge in the wall (clear ice in an ice cave, crystal in a
// crystal cave, rock elsewhere), dark cracks in a tall vault with threads hanging, a black hole low in a wall, eyes not yet open, a dark pool
function lay(c, t, R) {
  const L = c.L;
  if (t.how === 'drop') {
    t.drops = [];
    for (let a = 0; a < 60 && t.drops.length < 4; a++) {
      const x = t.x + (R() - 0.5) * 12,
        z = t.z + (R() - 0.5) * 12,
        q = caveDepth(L, x, z),
        f = floorOf(L, x, z),
        top = q.d > 0 ? vaultY(L, x, z) - f : 0;
      if (q.d < 2.0 || top < 4.0 || t.drops.some((p) => Math.hypot(p.x - x, p.z - z) < 1.6)) continue;
      t.drops.push({ x, z, top });
      const cr = new THREE.Mesh(jagged(0.55), new THREE.MeshBasicMaterial({ color: 0x050403 }));
      cr.position.set(x, f + top - 0.05, z);
      c.g.add(cr);
      const wp = [];
      for (let k = 0; k < 6; k++) {
        const ang = k * 1.05 + R(),
          r = 0.3 + R() * 0.35;
        wp.push(
          x + Math.cos(ang) * r,
          f + top - 0.05,
          z + Math.sin(ang) * r,
          x + Math.cos(ang) * r * 0.4,
          f + top - 0.5 - R() * 0.6,
          z + Math.sin(ang) * r * 0.4,
        );
      }
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
      c.g.add(
        new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0xbdb8ae, transparent: true, opacity: 0.55 })),
      );
    }
    if (!t.drops.length) t.how = 'pour';
    else return;
  } // (no vault tall enough after all: they pour from the wall instead; else the trap stays where it was, out in the open under the cracks)
  if (t.how === 'rise') {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 20).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x24302a, emissive: 0x0a1c18, roughness: 0.04, metalness: 0.5 }),
    );
    const e = 0.6,
      n = new THREE.Vector3(
        floorOf(L, t.x - e, t.z) - floorOf(L, t.x + e, t.z),
        2 * e,
        floorOf(L, t.x, t.z - e) - floorOf(L, t.x, t.z + e),
      ).normalize(); // (lying on the floor's slope)
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    m.position.set(t.x, t.y + 0.04, t.z);
    c.g.add(m);
    return;
  }
  if (t.how === 'quiet') return;
  const w = wallBy(L, t);
  Object.assign(t, w);
  if (t.how === 'burst') {
    t.block = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.1, 0),
      c.kind === 'ice'
        ? new THREE.MeshStandardMaterial({
            color: 0xbfe4ff,
            emissive: 0x234e70,
            emissiveIntensity: 0.7,
            roughness: 0.4,
            transparent: true,
            opacity: 0.75,
          })
        : c.kind === 'crystal'
          ? CRYSTAL()
          : pbr('terrain/rock', { color: 0x6a645c, rough: 0.95 }),
    );
    t.block.position.set(w.x, t.y + 1.0, w.z);
    t.block.scale.set(1, 1.5, 1);
    c.g.add(t.block);
  }
  if (t.how === 'pour') {
    const h = new THREE.Mesh(new THREE.CircleGeometry(0.75, 14), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    h.position.set(w.x, t.y + 0.55, w.z);
    h.lookAt(t.x, t.y + 0.55, t.z);
    c.g.add(h);
  }
  if (t.how === 'eyes') {
    t.eyes = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: EYE[c.kind], fog: false });
    for (let k = 0; k < 3; k++)
      for (const s of [-0.12, 0.12]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), m);
        e.position.set(w.x + (k - 1) * 0.9 + s, t.y + 0.7 + (k % 2) * 0.25, w.z);
        t.eyes.add(e);
      }
    t.eyes.visible = false;
    c.g.add(t.eyes);
  }
}
// the nearest point of the wall to a surprise's spot, a hand inside it (where a crawler breaks out, the rats pour from, the eyes open)
function wallBy(L, t) {
  let best = null;
  for (let a = 0; a < 6.28; a += 0.2)
    for (let r = 0.5; r < 14; r += 0.25) {
      const x = t.x + Math.cos(a) * r,
        z = t.z + Math.sin(a) * r;
      if (caveDepth(L, x, z).d < 0.35) {
        if (!best || r < best.r) best = { r, x, z };
        break;
      }
    }
  return best ? { x: best.x, z: best.z } : { x: t.x, z: t.z };
}

// eyes in the dark (Jared, November 15, 2026: "bright eyes in the darkness is creepy and awesome"): in every cave a few pairs watch from
// black cracks low in the walls, blink now and then, and are gone with a scrabble of grit when your light comes within 8 m; they come
// back once you are 16 m off. Seen from afar only (fog does not dim them: they are the brightest thing in the dark)
const EYE = { ice: 0x9fe8ff, fungal: 0xc8ff70, mine: 0xffc040, crystal: 0xffe9a0, roots: 0xff6040 };
let haloT = null,
  eyeG = null;
const halo = (color) =>
  new THREE.PointsMaterial({
    color,
    size: 0.42,
    map: (haloT ||= glowTex(false)),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  }); // (one glow texture, one eye ball, shared by all)
function watchers(c) {
  const L = c.L,
    R = mulberry32(SEED ^ (L.i * 6151 + 3)),
    eye = new THREE.MeshBasicMaterial({ color: EYE[c.kind], fog: false }),
    black = new THREE.MeshBasicMaterial({ color: 0x020202, side: THREE.DoubleSide });
  c.watch = [];
  const glow = halo(EYE[c.kind]);
  eyeG ||= new THREE.SphereGeometry(0.06, 8, 6);
  const legs = L.parts.filter(
    (p) => p.tag !== 'mouth' && p.tag !== 'hall' && Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) > 3,
  ); // (a passage, not a round room)
  for (let k = 0; k < 40 && c.watch.length < 6; k++) {
    const p = legs[Math.floor(R() * legs.length)],
      f = 0.2 + R() * 0.6,
      t = { x: p.a[0] + (p.b[0] - p.a[0]) * f, z: p.a[1] + (p.b[1] - p.a[1]) * f };
    if (t.x < L.x0 + 22 || c.watch.some((q) => Math.hypot(q.x - t.x, q.z - t.z) < 14)) continue; // (none at the mouth, none two together)
    const wp = wallBy(L, t),
      dx = t.x - wp.x,
      dz = t.z - wp.z,
      l = Math.hypot(dx, dz) || 1,
      ux = dx / l,
      uz = dz / l,
      y = floorOf(L, wp.x, wp.z) + Math.min(0.45 + R() * 1.1, caveDepth(L, wp.x, wp.z).ceil - 0.3); // (under the vault where a low tunnel's wall curves in)
    const g = new THREE.Group(),
      cr = new THREE.Mesh(jagged(0.42).rotateX(-Math.PI / 2), black);
    cr.position.set(wp.x + ux * 0.05, y, wp.z + uz * 0.05);
    cr.lookAt(t.x, y, t.z);
    c.g.add(cr);
    g.position.set(wp.x + ux * 0.18, y + 0.04, wp.z + uz * 0.18);
    const gp = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(eyeG, eye);
      e.position.set(-uz * 0.12 * s, 0, ux * 0.12 * s);
      g.add(e);
      gp.push(-uz * 0.12 * s, 0, ux * 0.12 * s);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    const hp = new THREE.Points(gg, glow);
    g.add(hp); // (a soft glow round each: a bare dot is lost at 10 m) // (blinking squashes the group about the eyes)
    c.g.add(g);
    const al = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) || 1; // (a spot down the passage, out of their reach but in sight: the checks and pictures stand there)
    const far = [11, 10, 9, 10.5]
      .flatMap((k) =>
        [1, -1].map((sg) => [t.x + ((p.b[0] - p.a[0]) / al) * k * sg, t.z + ((p.b[1] - p.a[1]) / al) * k * sg]),
      )
      .find(([x, z]) => Math.hypot(x - wp.x, z - wp.z) > 8.6 && caveDepth(L, x, z).d > 1);
    c.watch.push({ x: wp.x, z: wp.z, ux, uz, far, g, hp, gone: false, blink: 1 + R() * 4 });
  }
}
function tickWatch(dt) {
  if (!here?.watch) return;
  const P = G.player;
  for (const w of here.watch) {
    const d = Math.hypot(P.x - w.x, P.z - w.z);
    if (!w.gone && d < 8) {
      w.gone = true;
      w.g.visible = false;
      G.sfx('grit', { x: w.x, z: w.z }, 0.35);
    } else if (w.gone && d > 16) {
      w.gone = false;
      w.g.visible = true;
    }
    if ((w.blink -= dt) < 0) w.blink = 2 + Math.random() * 5;
    w.g.scale.y = w.blink < 0.13 ? 0.15 : 1;
    w.hp.visible = w.blink >= 0.13;
  }
} // (a glow sprite ignores the squash: it goes out for the blink)

// ── Playing ─────────────────────────────────────────────────────────────────────────────────────────────────────
// a new game: every surprise armed again (g: what game.js lends, as places.js has it)
export function startCaves(g) {
  G = g;
  here = null;
  fade = null;
  cool = 0;
  for (const c of caves)
    for (const t of c.traps || []) {
      t.armed = true;
      t.rats = 0;
      t.eyesT = 0;
      if (t.block) t.block.visible = true;
      if (t.eyes) t.eyes.visible = false;
    }
  for (const c of caves)
    for (const w of c.watch || []) {
      w.gone = false;
      w.g.visible = true;
    }
}
export const caveHere = () => here; // the cave this computer's player is in (null outside)
export const caveDark = () => (here ? 1 : 0);
export const caveLights = () => (here ? lamps.filter((q) => q.c === here) : []);
export const caveFade = () => fade;

export function tickCaves(dt) {
  if (!G || !caves.length) return;
  const P = G.player;
  here = caveAt(P.x, P.z);
  cool = Math.max(0, cool - dt);
  if (fade) {
    fade.t += dt;
    if (!fade.done && fade.t >= 0.3) {
      fade.done = true;
      if (!P.dead && !P.down) go(fade.to, fade.out);
    }
    /* (fallen during the fade: you stay where you fell) */ if (fade.t >= 0.75) fade = null;
  } else if (!cool && !P.dead && !P.down) {
    if (here) {
      if (P.x < here.L.x0 + 2.4) fade = { t: 0, to: here, out: true };
    } else
      for (const c of caves)
        if (Math.hypot(P.x - (c.door.x - c.fx * 0.3), P.z - (c.door.z - c.fz * 0.3)) < DOOR) {
          fade = { t: 0, to: c, out: false };
          G.sfx('creak', null, 0.5);
          break;
        }
  }
  shade(fade ? (fade.t < 0.3 ? fade.t / 0.3 : Math.max(0, 1 - (fade.t - 0.3) / 0.45)) : 0);
  // (every game watches the spots, so a joined game sees the ice burst and the eyes too; only the host's spring brings creatures)
  for (const c of caves)
    for (const t of c.traps || []) {
      if (t.armed && [P, ...others.values()].some((q) => q && !q.dead && Math.hypot(q.x - t.x, q.z - t.z) < 7))
        spring(c, t);
      if (t.rats > 0 && (t.ratT -= dt) <= 0) {
        t.rats--;
        t.ratT = 0.26;
        const e = G.spawnEnemy(t.x, t.z, t.foe);
        Object.assign(e, { state: 'chase', cave: c });
        G.sfx('snap', e, 0.5);
      }
    }
  tickShards(dt);
  tickMotes(dt);
  tickSounds(dt);
  tickWatch(dt);
  for (const c of caves)
    for (const t of c.traps || [])
      if (t.eyesT > 0 && (t.eyesT -= dt) <= 0) {
        t.eyes.visible = false;
        hounds(c, t);
      }
}

// through the mouth: in, to just inside the mouth chamber facing in; out, to the yard facing away
function go(c, out) {
  const P = G.player;
  cool = 1.2;
  if (out) {
    G.teleport(c.x, c.z);
    G.look(Math.atan2(-c.fx, -c.fz), 0);
    G.log(`You come out of ${c.name.replace(/^The /, 'the ')}.`);
    G.logEvent('cave-out', { kind: c.kind });
  } else {
    G.teleport(c.L.mouth.in[0], c.L.mouth.in[1]);
    G.look(-Math.PI / 2, 0);
    G.log(
      `You step into ${c.name.replace(/^The /, 'the ')}. It is dark in here${P.torch?.on ? '' : ': a torch (T) would help'}.`,
    );
    G.logEvent('cave-in', { kind: c.kind });
  }
  here = caveAt(P.x, P.z);
}
// the black that the mouth fades through (built here: index.html stays as it is)
function shade(k) {
  if (!el) {
    el = document.createElement('div');
    el.id = 'cave-fade';
    el.style.cssText = 'position:fixed;inset:0;background:#000;pointer-events:none;z-index:19;opacity:0';
    document.body.appendChild(el);
  }
  el.style.opacity = k;
}

// a surprise springs: how many by the creature level (Easy one, Normal two, Hard three; spiders one more)
function spring(c, t) {
  t.armed = false;
  const n = { easy: 1, normal: 2, hard: 3 }[rules.lvl] ?? 2,
    P = G.player,
    host = !G.joining();
  G.logEvent('cave-surprise', { kind: c.kind, how: t.how, foe: t.foe, n });
  if (t.how === 'burst') {
    t.block.visible = false;
    dustPuff(new THREE.Vector3(t.x, t.y + 1, t.z), 30);
    G.sfx('crash', { x: t.x, z: t.z }, 0.8);
    shards(c, t);
  }
  if (t.how === 'eyes') {
    t.eyes.visible = true;
    t.eyesT = 1.6;
    t.n = n;
    G.sfx(t.foe === 'dust_hound' ? 'wolf' : 'grit', { x: t.x, z: t.z }, 0.5);
  }
  if (t.how === 'quiet') {
    G.sfx(
      Math.random() < 0.5 ? 'grit' : 'spiderdrop',
      { x: t.x + (Math.random() - 0.5) * 30, z: t.z + (Math.random() - 0.5) * 30 },
      0.3,
    );
    return;
  } // (something, off in the dark; nothing comes)
  if (!host) return; // (what follows brings creatures: the host's, sent to everyone as usual)
  if (t.how === 'drop')
    for (const [k, { x, z, top: t0 }] of (t.drops || []).slice(0, n + 1).entries()) {
      const top = t0 - 0.35;
      const e = G.spawnEnemy(x, z, t.foe);
      Object.assign(e, {
        state: 'drop',
        dropTop: top,
        dropH: top,
        dropT: -k * 0.3,
        hangT: 0,
        cave: c,
        yaw: Math.atan2(-(P.x - x), -(P.z - z)),
      });
      G.sfx('spiderdrop', e);
    }
  if (t.how === 'burst')
    for (let k = 0; k < n; k++) {
      const e = G.spawnEnemy(t.x + k * 0.7, t.z, t.foe);
      Object.assign(e, { state: 'chase', cave: c });
    } // (out of the wall and straight at you)
  if (t.how === 'pour') {
    t.rats = t.foe === 'rat' ? n * 3 : n + 1;
    t.ratT = 0;
  } // (one every quarter second, from tickCaves: a new game stops them)
  if (t.how === 'rise')
    for (let k = 0; k < Math.max(1, n - 1); k++) {
      const e = G.spawnEnemy(t.x + k * 1.2, t.z, t.foe);
      Object.assign(e, { state: 'emerge', emT: 0.8, cave: c });
      G.sfx('lurk', e);
    }
}
// the ice wall bursting: chunks of clear ice thrown out from it, falling and fading in about a second and a half
const flying = [];
function shards(c, t) {
  const dx = P0().x - t.x,
    dz = P0().z - t.z,
    l = Math.hypot(dx, dz) || 1;
  for (let k = 0; k < 10; k++) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07 + Math.random() * 0.13, 0), t.block.material);
    /* (pieces of whatever burst: ice, crystal or rock) */ m.position.set(t.x, t.y + 0.6 + Math.random() * 1.2, t.z);
    c.g.add(m);
    flying.push({
      m,
      v: new THREE.Vector3(
        (dx / l) * (3 + Math.random() * 4) + (Math.random() - 0.5) * 3,
        2 + Math.random() * 4,
        (dz / l) * (3 + Math.random() * 4) + (Math.random() - 0.5) * 3,
      ),
      t: 0,
    });
  }
}
const P0 = () => G.player;
function tickShards(dt) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i];
    f.t += dt;
    f.v.y -= 9.8 * dt;
    f.m.position.addScaledVector(f.v, dt);
    f.m.rotation.x += dt * 6;
    const fl = floorOf(here?.L || caves[0].L, f.m.position.x, f.m.position.z) + 0.1;
    if (f.m.position.y < fl) {
      f.m.position.y = fl;
      f.v.multiplyScalar(0.3);
      f.v.y = Math.abs(f.v.y);
    }
    if (f.t > 1.6) {
      f.m.removeFromParent();
      f.m.geometry.dispose();
      flying.splice(i, 1);
    }
  }
}
function hounds(c, t) {
  if (G.joining()) return;
  for (let k = 0; k < t.n; k++) {
    const e = G.spawnEnemy(t.x + (k - 1) * 0.9, t.z, t.foe);
    Object.assign(e, { state: 'chase', cave: c });
  }
}

// the dark (main.js, every frame after the sky and the weather): inside a cave no sun, no sky light, black fog, no rain
// (outside a cave it touches nothing but the openings' daylight: environment.js sets the sky's light every frame. Off play, a menu
// or a game over, nobody is in a cave)
let farBase = null;
export function caveScene(scene, env, camera, running) {
  if (!running && (here || fade)) {
    here = null;
    fade = null;
    shade(0);
  }
  caveAudio(here?.kind ?? null);
  if (motes && !here) motes.visible = false;
  hemi ||= scene.children.find((o) => o.isHemisphereLight);
  if (here && farBase == null) {
    farBase = camera.far;
    camera.far = 60;
    camera.updateProjectionMatrix();
  } // (nothing past 60 m draws in a cave: beyond is black anyway)
  else if (!here && farBase != null) {
    camera.far = farBase;
    farBase = null;
    camera.updateProjectionMatrix();
  }
  env.sky.visible = !here;
  for (const c of caves) c.g.visible = c === here;
  for (const c of caves)
    if (c.opening) {
      const day = 1 - (G?.nightK?.() ?? 0) * 0.85;
      c.opening.material.color.setRGB(
        day * 0.9 + 0.1 * (1 - day),
        day * 0.92 + 0.12 * (1 - day),
        day * 0.9 + 0.3 * (1 - day),
      );
      c.pool.material.opacity = day;
      for (const m of c.shafts || []) m.material.opacity = 0.15 + 0.85 * day;
    }
  if (!here) return;
  env.sun.intensity = 0;
  scene.environmentIntensity = 0.02;
  if (hemi) {
    const [col, k] = LOOK[here.kind].amb;
    hemi.color.setHex(col);
    hemi.intensity = k;
  }
  const [fc, fn, ff] = LOOK[here.kind].fog;
  scene.fog.color.setHex(fc);
  scene.fog.near = fn;
  scene.fog.far = ff; // (each cave's own haze: blue cold, teal spores, brown dust, green damp)
  for (const o of scene.children) if (o.name?.startsWith('weather')) o.visible = false;
}

// the angled camera kept inside the cave's walls and under its vault (looking from behind the player, it would see through the rock:
// the walls are one-sided). The top-down camera looks in from above through the vault, so it stays where it is
const _v = new THREE.Vector3();
export function caveCam(camera, P, mode) {
  if (!here || mode !== 'angled') return;
  const L = here.L,
    x0 = P.x,
    y0 = P.y + 1.6,
    z0 = P.z,
    d = camera.position.distanceTo(_v.set(x0, y0, z0));
  let ok = 0;
  for (let t = 0.25; t <= d; t += 0.25) {
    const k = t / d,
      x = x0 + (camera.position.x - x0) * k,
      y = y0 + (camera.position.y - y0) * k,
      z = z0 + (camera.position.z - z0) * k,
      q = caveDepth(L, x, z),
      f = floorOf(L, x, z);
    if (q.d < 0.6 || y > f + q.ceil - 0.45 || y < f + 0.3) break;
    ok = k;
  }
  ok = Math.max(ok, Math.min(1, 1.4 / Math.max(d, 1e-3))); // (never into the head: with a wall at your back the view goes through it instead)
  if (ok < 1)
    camera.position.set(
      x0 + (camera.position.x - x0) * ok,
      y0 + (camera.position.y - y0) * ok,
      z0 + (camera.position.z - z0) * ok,
    );
}
