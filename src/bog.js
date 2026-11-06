// The Bog's standing water: a dark, still, algae-skinned surface laid just above the world's water plane wherever the
// swamp's pools are, so the Bog reads as black peat water and green scum instead of the bright mirror of the lakes.
// Its edge fades with the swamp's biome weight. Also exports the Bog's mist (fog closes in and turns olive there).
import * as THREE from 'three';
import { HALF, CELL, SEG, N, WATER_Y } from './config.js';
import { H, biomeW } from './world.js';
import { vnoise, fbm } from './noise.js';

export const BOG_Y = WATER_Y + 0.62; // the Bog's water table sits a little above the lakes

function scumTexture() { // dark water with drifting duckweed and algae blotches, tiling (noise sampled on a torus)
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const cx = cv.getContext('2d'), img = cx.createImageData(S, S);
  const R = S / (2 * Math.PI), tor = (x, y, f) => { const a = x / S * 2 * Math.PI, b = y / S * 2 * Math.PI;
    return fbm(Math.cos(a) * R * f + 50, Math.sin(a) * R * f + Math.cos(b) * R * f * 0.7, 3) * 0.5 + fbm(Math.sin(b) * R * f + 9, Math.cos(b) * R * f * 0.9 + 3, 3) * 0.5; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const big = tor(x, y, 0.035), fine = vnoise(x * 0.9, y * 0.9), weed = Math.min(1, Math.max(0, (big - 0.5) * 6)) * (0.55 + fine * 0.6);
    const dot = fine > 0.86 ? 0.5 : 0, w = Math.min(1, weed + dot * (big > 0.42 ? 1 : 0)), o = (y * S + x) * 4;
    img.data[o] = 24 + w * 46 + fine * 6; img.data[o + 1] = 28 + w * 62 + fine * 6; img.data[o + 2] = 18 + w * 16; img.data[o + 3] = 255; }
  cx.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildBog(scene, waterNormals) {
  const pos = [], col = [], idx = []; const vid = new Map();
  const vert = (i, j) => { const k = j * N + i; if (vid.has(k)) return vid.get(k);
    const x = -HALF + i * CELL, z = -HALF + j * CELL, w = biomeW(x, z, 'swamp'), a = Math.min(1, Math.max(0, (w - 0.15) / 0.3));
    pos.push(x, BOG_Y, z); col.push(1, 1, 1, a); vid.set(k, pos.length / 3 - 1); return pos.length / 3 - 1; };
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
    const x = -HALF + (i + 0.5) * CELL, z = -HALF + (j + 0.5) * CELL;
    if (biomeW(x, z, 'swamp') < 0.15) continue;
    const lo = Math.min(H[j * N + i], H[j * N + i + 1], H[(j + 1) * N + i], H[(j + 1) * N + i + 1]); if (lo > BOG_Y - 0.02) continue;
    const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1); idx.push(a, c, b, b, c, d); }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, k) => k % 3 === 1 ? 1 : 0), 3));
  const uv = new Float32Array(pos.length / 3 * 2); for (let k = 0; k < pos.length / 3; k++) { uv[k * 2] = pos[k * 3] / 14; uv[k * 2 + 1] = pos[k * 3 + 2] / 14; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere();
  const nm = waterNormals.clone(); nm.repeat.set(1, 1); nm.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ map: scumTexture(), vertexColors: true, transparent: true, roughness: 0.62, metalness: 0, envMapIntensity: 0.12, color: 0xb8b8a8,
    normalMap: nm, normalScale: new THREE.Vector2(0.12, 0.12), depthWrite: false });
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.renderOrder = 1; mesh.name = 'bog water'; scene.add(mesh);
  return mesh;
}

// Fog per place: the Bog's mist closes in and turns olive-grey; elsewhere the clear-air fog of environment.js.
// Fungal Hollow has a thinner violet spore haze.
const BOG_FOG = new THREE.Color(0x7d8670), SPORE_FOG = new THREE.Color(0x8a7aa0), tmp = new THREE.Color();
const ease = (fog, key, k) => { const was = fog[key] ?? k; return fog[key] = Math.abs(k - was) > 0.5 ? k : was + (k - was) * 0.04; }; // eases while walking, snaps on a teleport
export function localFog(fog, base, near, far, x, z) {
  const s = ease(fog, '__k', Math.min(1, Math.max(0, (biomeW(x, z, 'swamp') - 0.2) / 0.6))), f = ease(fog, '__f', Math.min(1, Math.max(0, (biomeW(x, z, 'fungal') - 0.2) / 0.6)));
  fog.near = near + (6 - near) * s + (10 - near) * f * (1 - s); fog.far = far + (170 - far) * s + (300 - far) * f * (1 - s);
  fog.color.copy(tmp.copy(base).lerp(SPORE_FOG, f * 0.8).lerp(BOG_FOG, s));
}
