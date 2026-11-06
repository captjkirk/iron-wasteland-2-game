// Instanced scatter with distance LOD. Every prop type (a tree species variant, a rock shape, a scrap pile) is a Layer:
// its items are positions in the world; each update the layer fills a "near" set of instanced meshes with the items
// inside nearR of the camera and a "far" set (an impostor billboard or a low-poly mesh) with those out to farR.
// Layers without a far set shrink their items in over the last 15% of nearR so they grow in rather than pop.
// Items can be hidden (camera occluders) or gone (salvaged); both just skip the item at the next fill.
import * as THREE from 'three';

const layers = [];
let lastFocus = null, dirty = true;
export function markDirty() { dirty = true; }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
function makeSet(scene, parts, cap) {
  return parts.map(p => { const im = new THREE.InstancedMesh(p.geo, p.mat, Math.max(1, cap)); im.count = 0; im.frustumCulled = false;
    im.castShadow = !!p.cast; im.receiveShadow = p.receive !== false; if (p.depthMat) im.customDepthMaterial = p.depthMat; im.name = p.name || '';
    scene.add(im); return im; });
}

// parts: [{ geo, mat, cast, receive }] drawn near; far: same shape or null. items: { x, y, z, s, ry, sy? }
export function addLayer(scene, { name, parts, far = null, nearR, farR = 0, items }) {
  const L = { name, items, nearR, farR, near: makeSet(scene, parts, items.length), far: far ? makeSet(scene, far, items.length) : [], counts: [0, 0] };
  const e = new Float32Array(items.length * 16);
  items.forEach((it, i) => { it.layer = L; it.index = i; _q.setFromAxisAngle(_Y, it.ry || 0);
    _m.compose(_v.set(it.x, it.y, it.z), _q, _s.set(it.s * (it.sx || 1), it.s * (it.sy || 1), it.s * (it.sx || 1)));
    if (it.tilt) _m.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(it.tilt[0], 0, it.tilt[1])));
    _m.toArray(e, i * 16); });
  L.elems = e; layers.push(L); dirty = true; return L;
}

export function updateScatter(focus, force) {
  if (!force && !dirty && lastFocus && lastFocus.distanceToSquared(focus) < 16) return;
  lastFocus = (lastFocus || new THREE.Vector3()).copy(focus); dirty = false;
  const fx = focus.x, fz = focus.z;
  for (const L of layers) {
    const n2 = L.nearR * L.nearR, f2 = L.farR * L.farR, grow = L.far.length ? 0 : L.nearR * 0.85, g2 = grow * grow;
    let nc = 0, fc = 0; const E = L.elems, items = L.items;
    const nArr = L.near.map(im => im.instanceMatrix.array), fArr = L.far.map(im => im.instanceMatrix.array);
    for (let i = 0; i < items.length; i++) {
      const it = items[i]; if (it.gone || it.hidden) continue;
      const dx = it.x - fx, dz = it.z - fz, d2 = dx * dx + dz * dz;
      if (d2 < n2) {
        const o = nc * 16; for (const a of nArr) a.set(E.subarray(i * 16, i * 16 + 16), o);
        if (!L.far.length && d2 > g2) { const k = Math.max(0.05, 1 - (Math.sqrt(d2) - grow) / (L.nearR - grow));
          for (const a of nArr) for (let c = 0; c < 11; c++) if (c % 4 !== 3) a[o + c] *= k; }
        nc++;
      } else if (d2 < f2 && fArr.length) { for (const a of fArr) a.set(E.subarray(i * 16, i * 16 + 16), fc * 16); fc++; }
    }
    for (const im of L.near) { im.count = nc; im.instanceMatrix.needsUpdate = true; }
    for (const im of L.far) { im.count = fc; im.instanceMatrix.needsUpdate = true; }
    L.counts = [nc, fc];
  }
}
export function scatterStats() { const o = {}; for (const L of layers) { const k = L.name.split('#')[0]; o[k] = o[k] || [0, 0, 0]; o[k][0] += L.items.length; o[k][1] += L.counts[0]; o[k][2] += L.counts[1]; } return o; }
