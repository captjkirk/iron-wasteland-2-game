// Grass: wind-animated blades, instanced per 8 m tile in a disc around the camera (radius Q.grassDist). Each blade is
// a five-vertex tapered card bent in the vertex shader; density follows the terrain's grass, forest-floor, mud and dirt
// weights with clumping noise, and colour and height follow the biome. Blades shrink away over the outer 30% of the
// disc so there is no visible edge. Tiles are cached and rebuilt as the camera moves.
import * as THREE from 'three';
import { HALF, CELL, SEG, N, WATER_Y, Q } from './config.js';
import { groundY, biomeAt, slopeAt, SPLAT_A, SPLAT_B, SPLAT_C } from './world.js';
import { indoors } from './buildings.js';
import { vnoise } from './noise.js';
import { wind } from './trees.js';

const TILE = 8, PER_M2 = 26 * Q.grassDensity, R = Q.grassDist;
// per biome: height range (m), base and tip colours
const LOOK = {
  grass:  { h: [0.35, 0.8], base: 0x2c4416, tip: 0x8aa646, w: 0.055 },
  swamp:  { h: [0.55, 1.15], base: 0x2e3a16, tip: 0x7c8a40, w: 0.06 },
  tundra: { h: [0.22, 0.5], base: 0x4a4a2c, tip: 0xb0aa7a, w: 0.045 },
  waste:  { h: [0.25, 0.6], base: 0x4a3e22, tip: 0xb09a5a, w: 0.05 },
  desert: { h: [0.3, 0.55], base: 0x6a5530, tip: 0xc8b078, w: 0.045 },
  ruins:  { h: [0.3, 0.75], base: 0x37401c, tip: 0x9aa050, w: 0.05 },
  fungal: { h: [0.12, 0.3], base: 0x2a2036, tip: 0x7a6a9a, w: 0.07 },
};
const DENS = { grass: 1.15, swamp: 0.9, tundra: 0.55, waste: 0.5, desert: 0.1, ruins: 0.75, fungal: 0.45 };

const blade = new THREE.BufferGeometry();
blade.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.36, 0.45, 0, 0.36, 0.45, 0, 0, 1, 0], 3));
blade.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);

const mat = new THREE.MeshStandardMaterial({ vertexColors: false, side: THREE.DoubleSide, roughness: 0.88, metalness: 0, envMapIntensity: 0.8 });
const uR = { value: R };
mat.onBeforeCompile = (sh) => {
  sh.uniforms.uWind = wind; sh.uniforms.uR = uR;
  sh.vertexShader = `uniform float uWind, uR; attribute vec4 aOff; attribute vec4 aPar; attribute vec3 aBase; attribute vec3 aTip; varying vec3 vGrassCol;\n` +
    sh.vertexShader.replace('#include <begin_vertex>', `
      float t = position.y, yaw = aOff.w, hgt = aPar.x, wdt = aPar.y, lean = aPar.z;
      float fade = 1.0 - smoothstep(uR * 0.7, uR, distance(aOff.xz, cameraPosition.xz)); hgt *= fade;
      vec2 fw = vec2(cos(yaw), sin(yaw)), side = vec2(-fw.y, fw.x);
      float gust = sin(uWind * 1.7 + dot(aOff.xz, vec2(0.21, 0.13))) * 0.55 + sin(uWind * 3.1 + dot(aOff.xz, vec2(0.7, -0.5))) * 0.2 + 0.35;
      vec2 bend = fw * lean + vec2(0.8, 0.45) * gust * 0.35;
      vec3 transformed = vec3(aOff.x, aOff.y, aOff.z);
      transformed.xz += side * position.x * wdt + bend * t * t * hgt;
      transformed.y += t * hgt * (1.0 - 0.25 * dot(bend, bend));
      vGrassCol = mix(aBase, aTip, t * t * 0.9 + t * 0.1);`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(transformed, 1.0); gl_Position = projectionMatrix * mvPosition;')
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(transformed, 1.0);');
  sh.fragmentShader = 'varying vec3 vGrassCol;\n' + sh.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.rgb *= vGrassCol;')
    .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
};

function weight(x, z) { // terrain layers that carry grass, from the nearest grid vertex
  const i = Math.min(SEG, Math.max(0, Math.round((x + HALF) / CELL))), j = Math.min(SEG, Math.max(0, Math.round((z + HALF) / CELL))), k = (j * N + i) * 4;
  const g = SPLAT_A[k] / 255, f = SPLAT_A[k + 1] / 255, d = SPLAT_A[k + 2] / 255, sand = SPLAT_B[k] / 255, snow = SPLAT_B[k + 1] / 255, mud = SPLAT_B[k + 2] / 255;
  const pave = SPLAT_C[k] / 255, grav = SPLAT_C[k + 1] / 255, moss = SPLAT_C[k + 2] / 255; // weeds in the cracks, a little on gravel, short fuzz on moss
  return (g * 1.0 + f * 0.45 + d * 0.55 + mud * 0.55 + sand * 0.25 + pave * 0.3 + grav * 0.12 + moss * 0.6) * Math.max(0, 1 - snow * 1.6);
}
const tiles = new Map(); let group = null;
function buildTile(tx, tz) {
  let seed = (tx * 73856093) ^ (tz * 19349663); const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const n = Math.round(TILE * TILE * PER_M2), off = [], par = [], base = [], tip = [];
  const x0 = tx * TILE, z0 = tz * TILE; let ymin = 1e9, ymax = -1e9;
  for (let b = 0; b < n; b++) {
    const x = x0 + rnd() * TILE, z = z0 + rnd() * TILE, bio = biomeAt(x, z), y = groundY(x, z);
    if (y < WATER_Y + 0.15 || y > 70 || indoors(x, z)) continue;
    // tufts (fine noise), meadow patches and bare openings (coarse noise), so the cover is clumped and uneven
    const cn = vnoise(x * 0.35 + 3, z * 0.35), patch = vnoise(x * 0.06 + 11, z * 0.06 - 4), sparse = bio === 'waste' || bio === 'desert' || bio === 'ruins';
    const clump = sparse ? Math.pow(cn, 2.5) * 3.4 : (0.15 + Math.pow(cn, 1.5) * 1.5) * Math.min(1, Math.max(0, (patch - 0.18) * 3.2)), keep = weight(x, z) * DENS[bio] * clump;
    if (rnd() > keep) { rnd(); rnd(); rnd(); rnd(); continue; }
    if (slopeAt(x, z) > 0.75) continue;
    const L = LOOK[bio], hv = rnd(), cv = rnd() * 0.25 - 0.1, dryP = vnoise(x * 0.045 - 30, z * 0.045 + 8), tall = 0.55 + patch * 0.9;
    // a few broad blades among the fine ones, and tall seedy stems in the long grass
    const kind = rnd(), broad = kind < 0.12 ? 1.9 : kind > 0.94 ? 0.55 : 1, stem = kind > 0.94 ? 1.45 : 1;
    off.push(x, y - 0.03, z, rnd() * 6.283); par.push((L.h[0] + (L.h[1] - L.h[0]) * hv * (0.6 + clump * 0.4)) * tall * stem, L.w * (0.6 + hv * 0.7) * broad, (rnd() - 0.5) * 0.7, 0);
    // dry, straw-coloured drifts through the green, and darker lush hollows
    const dryK = Math.min(1, Math.max(0, (dryP - 0.52) * 3.5)) * (sparse ? 0.3 : 0.75), lush = Math.min(1, Math.max(0, (0.4 - dryP) * 3));
    const bc = new THREE.Color(L.base).lerp(new THREE.Color(0x5a4e2a), dryK * 0.6), tc = new THREE.Color(L.tip).lerp(new THREE.Color(0xc4b070), dryK).offsetHSL(cv * 0.08 + lush * 0.015, lush * 0.05, cv * 0.35 - lush * 0.06);
    base.push(bc.r, bc.g, bc.b); tip.push(tc.r, tc.g, tc.b); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
  }
  if (!off.length) return null;
  const g = new THREE.InstancedBufferGeometry(); g.index = blade.index; g.setAttribute('position', blade.attributes.position); g.setAttribute('normal', blade.attributes.normal);
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(off), 4)); g.setAttribute('aPar', new THREE.InstancedBufferAttribute(new Float32Array(par), 4));
  g.setAttribute('aBase', new THREE.InstancedBufferAttribute(new Float32Array(base), 3)); g.setAttribute('aTip', new THREE.InstancedBufferAttribute(new Float32Array(tip), 3));
  g.instanceCount = off.length / 4;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(x0 + TILE / 2, (ymin + ymax) / 2 + 0.5, z0 + TILE / 2), TILE * 0.75 + (ymax - ymin) / 2 + 1.2);
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = false; return m;
}

export function buildGrass(scene) { group = new THREE.Group(); group.name = 'grass'; scene.add(group); }
// keep the tiles inside the disc around the focus; build at most `budget` new tiles a frame unless most are missing
export function updateGrass(focus) {
  if (!group || PER_M2 <= 0) return;
  const ctx = Math.floor(focus.x / TILE), ctz = Math.floor(focus.z / TILE), rt = Math.ceil(R / TILE) + 1, want = [];
  for (let dz = -rt; dz <= rt; dz++) for (let dx = -rt; dx <= rt; dx++) { const tx = ctx + dx, tz = ctz + dz;
    const cx = tx * TILE + TILE / 2 - focus.x, cz = tz * TILE + TILE / 2 - focus.z, d = Math.hypot(cx, cz) - TILE * 0.71;
    if (d < R) want.push([tx, tz, d]); }
  const keys = new Set(want.map(w => w[0] + ',' + w[1]));
  for (const [k, m] of tiles) if (!keys.has(k)) { if (m) { group.remove(m); m.geometry.dispose(); } tiles.delete(k); }
  const missing = want.filter(w => !tiles.has(w[0] + ',' + w[1])).sort((a, b) => a[2] - b[2]);
  const budget = missing.length > want.length * 0.5 ? missing.length : 6;
  for (const [tx, tz] of missing.slice(0, budget)) { const m = buildTile(tx, tz); tiles.set(tx + ',' + tz, m); if (m) group.add(m); }
}
export function grassStats() { let b = 0, t = 0; for (const m of tiles.values()) if (m) { t++; b += m.geometry.instanceCount; } return { tiles: t, blades: b }; }
