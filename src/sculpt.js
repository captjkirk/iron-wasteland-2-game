// Sculpted creature bodies (slice 19): one smooth signed-distance shape built from capsules (rounded cones) and
// ellipsoids, blended with smooth unions and carved with smooth subtractions, meshed by marching cubes and skinned to
// the creature's own skeleton by how near each surface point is to each part. Each part names the bones it follows
// (two bones split along its length, so a body capsule bends with the spine), a region tag (colour and fur length),
// and how softly it blends. The geometry is built once per creature type and shared by every spawn.
import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const smin = (a, b, k) => {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
};
const smax = (a, b, k) => -smin(-a, -b, k);
// distance from p to part q (and how far along it, 0..1)
function dist(q, x, y, z, out) {
  if (q.ell) {
    const [rx, ry, rz] = q.ell,
      px = x - q.a[0],
      py = y - q.a[1],
      pz = z - q.a[2];
    const k0 = Math.hypot(px / rx, py / ry, pz / rz),
      k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
    out.h = Math.max(0, Math.min(1, (rz - pz) / (2 * rz)));
    return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
  }
  const ax = x - q.a[0],
    ay = y - q.a[1],
    az = z - q.a[2],
    h = Math.max(0, Math.min(1, (ax * q.d[0] + ay * q.d[1] + az * q.d[2]) * q.il));
  out.h = h;
  return Math.hypot(ax - q.d[0] * h, ay - q.d[1] * h, az - q.d[2] * h) - (q.ra + (q.rb - q.ra) * h);
}
// parts: { a, b, ra, rb } capsule (bones split a to b) or { a, ell: [rx, ry, rz] } ellipsoid (bones split back to front); k blend (m); bones [A, B]; tag; sub: carve
export function sculpt(parts, { res = 88, nBones, colors = {}, fur = {}, tint, lump = 0 } = {}) {
  const P = parts.map((q) => {
    const o = { k: 0.06, tag: 'body', ...q };
    o.rb ??= o.ra;
    o.bones ??= [0, 0];
    if (!o.ell) {
      o.b ??= o.a;
      o.d = [o.b[0] - o.a[0], o.b[1] - o.a[1], o.b[2] - o.a[2]];
      o.il = 1 / Math.max(1e-9, o.d[0] ** 2 + o.d[1] ** 2 + o.d[2] ** 2);
    }
    const r = o.ell ? Math.max(...o.ell) : Math.max(o.ra, o.rb),
      b = o.ell ? o.a : o.b;
    o.lo = [0, 1, 2].map((i) => Math.min(o.a[i], b[i]) - r - o.k);
    o.hi = [0, 1, 2].map((i) => Math.max(o.a[i], b[i]) + r + o.k);
    return o;
  });
  const lo = [0, 1, 2].map((i) => Math.min(...P.filter((q) => !q.sub).map((q) => q.lo[i])) - 0.04),
    hi = [0, 1, 2].map((i) => Math.max(...P.filter((q) => !q.sub).map((q) => q.hi[i])) + 0.04);
  const S = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]),
    ctr = [0, 1, 2].map((i) => (lo[i] + hi[i]) / 2),
    R = res,
    vox = S / (R - 1);
  const D = new Float32Array(R * R * R).fill(1e3),
    o = {},
    pos = (i, c) => (c / (R - 1) - 0.5) * S + ctr[i],
    cell = (i, v) => Math.max(0, Math.min(R - 1, Math.round(((v - ctr[i]) / S) * (R - 1) + (R - 1) / 2)));
  for (const pass of [false, true])
    for (const q of P) {
      if (!!q.sub !== pass) continue;
      const [x0, y0, z0] = [0, 1, 2].map((i) => cell(i, q.lo[i])),
        [x1, y1, z1] = [0, 1, 2].map((i) => cell(i, q.hi[i]));
      for (let z = z0; z <= z1; z++) {
        const pz = pos(2, z);
        for (let y = y0; y <= y1; y++) {
          const py = pos(1, y);
          for (let x = x0; x <= x1; x++) {
            const i = x + y * R + z * R * R,
              e = dist(q, pos(0, x), py, pz, o);
            D[i] = q.sub ? smax(D[i], -e, q.k) : smin(D[i], e, q.k);
          }
        }
      }
    }
  const mc = new MarchingCubes(R, new THREE.MeshBasicMaterial(), false, false, 400000),
    F = mc.field;
  for (let z = 0; z < R; z++)
    for (let y = 0; y < R; y++)
      for (let x = 0; x < R; x++) {
        const i = x + y * R + z * R * R,
          edge = !x || !y || !z || x === R - 1 || y === R - 1 || z === R - 1;
        let d = D[i];
        if (lump) d += Math.sin(pos(0, x) * 31) * Math.sin(pos(1, y) * 27) * Math.sin(pos(2, z) * 29) * lump;
        F[i] = edge ? 0 : 80 - (d / vox) * 20;
      }
  mc.isolation = 80;
  mc.update();
  const n = mc.count,
    src = mc.positionArray,
    pa = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) pa[i * 3 + c] = (src[i * 3 + c] * S) / 2 + ctr[c];
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pa, 3));
  g = mergeVertices(g, vox * 0.02);
  g.computeVertexNormals();
  // skin, colour and fur length: every part near a point weighs in by how near it is (its two bones split along its length)
  const cnt = g.attributes.position.count,
    J = new Uint16Array(cnt * 4),
    W = new Float32Array(cnt * 4),
    C = new Float32Array(cnt * 3),
    FL = new Float32Array(cnt);
  const NB = nBones || Math.max(...P.map((q) => Math.max(...q.bones))) + 1,
    bw = new Float32Array(NB),
    add = P.filter((q) => !q.sub),
    col = new THREE.Color(),
    tmp = new THREE.Color();
  const ds = new Float32Array(add.length),
    hs = new Float32Array(add.length),
    p = g.attributes.position.array;
  for (let v = 0; v < cnt; v++) {
    const x = p[v * 3],
      y = p[v * 3 + 1],
      z = p[v * 3 + 2];
    let m = 1e9;
    for (let k = 0; k < add.length; k++) {
      ds[k] = dist(add[k], x, y, z, o);
      hs[k] = o.h;
      if (ds[k] < m) m = ds[k];
    }
    bw.fill(0);
    let tw = 0,
      fl = 0;
    col.setRGB(0, 0, 0);
    for (let k = 0; k < add.length; k++) {
      const q = add[k],
        w = Math.exp(-(ds[k] - m) / 0.03);
      if (w < 0.01) continue;
      const s = hs[k] * hs[k] * (3 - 2 * hs[k]);
      bw[q.bones[0]] += w * (1 - s);
      bw[q.bones[1]] += w * s;
      tw += w;
      tmp.set(colors[q.tag] ?? colors.body ?? 0x806040);
      col.r += tmp.r * w;
      col.g += tmp.g * w;
      col.b += tmp.b * w;
      fl += (fur[q.tag] ?? fur.body ?? 1) * w;
    }
    col.multiplyScalar(1 / tw);
    if (tint) tint(col, x, y, z);
    C[v * 3] = col.r;
    C[v * 3 + 1] = col.g;
    C[v * 3 + 2] = col.b;
    FL[v] = fl / tw;
    const top = [...bw.keys()].sort((a, b) => bw[b] - bw[a]).slice(0, 4),
      sw = top.reduce((s, i) => s + bw[i], 0);
    top.forEach((i, k) => {
      J[v * 4 + k] = i;
      W[v * 4 + k] = bw[i] / sw;
    });
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(J, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(W, 4));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.setAttribute('fur', new THREE.BufferAttribute(FL, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// Bones at the given joints, all at rest with no rotation (so a bone's rest direction is simply its child's offset):
// defs [name, parentName|null, [x, y, z] in creature space]. Returns { bones: {name: Bone}, list, at, index, root }; make
// the THREE.Skeleton once the root is in the scene graph with its world matrices current (it reads them for the bind).
export function skeleton(defs) {
  const bones = {},
    list = [],
    at = {};
  for (const [name, parent, p] of defs) {
    const b = new THREE.Bone();
    b.name = name;
    at[name] = new THREE.Vector3(...p);
    if (parent) {
      b.position.copy(at[name]).sub(at[parent]);
      bones[parent].add(b);
    } else b.position.copy(at[name]);
    bones[name] = b;
    list.push(b);
  }
  return { bones, list, at, index: Object.fromEntries(list.map((b, i) => [b.name, i])), root: list[0] };
}
