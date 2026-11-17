// The Bog's standing water: a dark, still, algae-skinned surface laid just above the world's water plane wherever the
// swamp's pools are, so the Bog reads as black peat water and green scum instead of the bright mirror of the lakes.
// Its edge fades with the swamp's biome weight. Also exports the Bog's mist (fog closes in and turns olive there).
import * as THREE from 'three';
import { HALF, CELL, SEG, N, WATER_Y, Q } from './config.js';
import { H, biomeW } from './world.js';
import { vnoise, fbm } from './noise.js';

// the Bog's water is the world's water: its dark skin lies on the one water plane (4 cm up, over the deep-water veil at 2 cm),
// so wading, swimming and the view under it all meet one surface (Jared, November 16, 2026: at 0.62 m up, a camera dipped
// under the skin saw the clear lake water as a second layer below it, and a swimmer's eye, held 0.4 m up, was always between)
export const BOG_Y = WATER_Y + 0.04;

function scumTexture() {
  // dark peat water, tiling (noise sampled on a torus)
  const S = 256,
    cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const cx = cv.getContext('2d'),
    img = cx.createImageData(S, S);
  const R = S / (2 * Math.PI),
    tor = (x, y, f) => {
      const a = (x / S) * 2 * Math.PI,
        b = (y / S) * 2 * Math.PI;
      return (
        fbm(Math.cos(a) * R * f + 50, Math.sin(a) * R * f + Math.cos(b) * R * f * 0.7, 3) * 0.5 +
        fbm(Math.sin(b) * R * f + 9, Math.cos(b) * R * f * 0.9 + 3, 3) * 0.5
      );
    };
  // an even, dark, still peat sheet with soft broad shading and a faint grain, no duckweed blotches (Jared, November 16, 2026:
  // "I think the bog water looks patchy and bad")
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const v = (tor(x, y, 0.035) - 0.5) * 2, // (soft broad shading, about -1 to 1)
        grain = vnoise(x * 0.9, y * 0.9) - 0.5,
        o = (y * S + x) * 4;
      img.data[o] = 26 + v * 4 + grain * 3;
      img.data[o + 1] = 30 + v * 5 + grain * 3;
      img.data[o + 2] = 19 + v * 2 + grain * 2;
      img.data[o + 3] = 255;
    }
  cx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildBog(scene, waterNormals) {
  const pos = [],
    col = [],
    idx = [];
  const vid = new Map();
  const vert = (i, j) => {
    const k = j * N + i;
    if (vid.has(k)) return vid.get(k);
    const x = -HALF + i * CELL,
      z = -HALF + j * CELL,
      w = biomeW(x, z, 'swamp'),
      a = Math.min(1, Math.max(0, (w - 0.15) / 0.3));
    pos.push(x, BOG_Y, z);
    col.push(1, 1, 1, a);
    vid.set(k, pos.length / 3 - 1);
    return pos.length / 3 - 1;
  };
  for (let j = 0; j < SEG; j++)
    for (let i = 0; i < SEG; i++) {
      const x = -HALF + (i + 0.5) * CELL,
        z = -HALF + (j + 0.5) * CELL;
      if (biomeW(x, z, 'swamp') < 0.15) continue;
      const lo = Math.min(H[j * N + i], H[j * N + i + 1], H[(j + 1) * N + i], H[(j + 1) * N + i + 1]);
      if (lo > BOG_Y - 0.02) continue;
      const a = vert(i, j),
        b = vert(i + 1, j),
        c = vert(i, j + 1),
        d = vert(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      new Float32Array(pos.length).map((_, k) => (k % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let k = 0; k < pos.length / 3; k++) {
    uv[k * 2] = pos[k * 3] / 40;
    uv[k * 2 + 1] = pos[k * 3 + 2] / 40;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const nm = waterNormals.clone();
  nm.repeat.set(1, 1);
  nm.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({
    map: scumTexture(),
    vertexColors: true,
    transparent: true,
    roughness: 0.7,
    metalness: 0,
    envMapIntensity: 0.12,
    color: 0xb8b8a8,
    normalMap: nm,
    normalScale: new THREE.Vector2(0.04, 0.04), // (still water: faint ripples, so the sky does not catch in light patches)
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.name = 'bog water';
  scene.add(mesh);
  if (Q.water === 'mirror') mesh.add(skinMask(pos, col, idx));
  return mesh;
}

// The mirror water under the solid skin, hidden from the reflection's "is any water in view?" test (environment.js): where
// all four corners of a square of skin are fully solid (alpha 1: the material's opacity is 1, the peat texture has no
// alpha, and the colour's alpha is the biome weight), nothing of the water below shows, yet the water still drew there and
// so kept the whole scene's second draw for its reflection going in every view of the Bog (about 900 of 2,000 draws at the
// worst Bog view on Medium). This writes depth only, 1 cm above the water, before the water draws, so the water under it
// draws no pixel and counts none. 1 cm, not the skin's 4: the deep-water veil (water.js, 2 cm) draws over the skin
// after it and must still pass. A child of the skin, so it is never drawn without it. HIDDEN RULE: correct only while the
// skin is fully opaque there; if the skin is ever made see-through or glossy to show the mirror, remove this.
// scripts/bogskincheck.js fails if the skin stops being opaque while this mask is in place.
function skinMask(pos, col, idx) {
  const mp = new Float32Array(pos);
  for (let k = 1; k < mp.length; k += 3) mp[k] = WATER_Y + 0.01;
  const solid = (v) => col[v * 4 + 3] === 1,
    mi = [];
  for (let k = 0; k < idx.length; k += 6) {
    const a = idx[k],
      c = idx[k + 1],
      b = idx[k + 2],
      d = idx[k + 5];
    if (solid(a) && solid(b) && solid(c) && solid(d)) mi.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  g.setIndex(mi);
  g.computeBoundingSphere();
  const mask = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ colorWrite: false }));
  mask.renderOrder = 0.5; // (after the land, which already hides it under hills; before the water at 1)
  mask.name = 'bog water mask';
  mask.matrixAutoUpdate = false;
  return mask;
}

// Fog per place: the Bog's mist closes in and turns olive-grey; elsewhere the clear-air fog of environment.js.
// Fungal Hollow has a thinner violet spore haze.
const BOG_FOG = new THREE.Color(0x7d8670),
  SPORE_FOG = new THREE.Color(0x8a7aa0),
  tmp = new THREE.Color();
const ease = (fog, key, k) => {
  const was = fog[key] ?? k;
  return (fog[key] = Math.abs(k - was) > 0.5 ? k : was + (k - was) * 0.04);
}; // eases while walking, snaps on a teleport
export function localFog(fog, base, near, far, x, z) {
  const s = ease(fog, '__k', Math.min(1, Math.max(0, (biomeW(x, z, 'swamp') - 0.2) / 0.6))),
    f = ease(fog, '__f', Math.min(1, Math.max(0, (biomeW(x, z, 'fungal') - 0.2) / 0.6)));
  fog.near = near + (6 - near) * s + (10 - near) * f * (1 - s);
  fog.far = far + (170 - far) * s + (300 - far) * f * (1 - s);
  fog.color.copy(
    tmp
      .copy(base)
      .lerp(SPORE_FOG, f * 0.8)
      .lerp(BOG_FOG, s),
  );
}
