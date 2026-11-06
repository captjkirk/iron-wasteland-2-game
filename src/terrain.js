// Terrain: 64 m chunks with three levels of detail (2, 4 and 8 m), smooth normals from the heightfield, and a
// MeshStandardMaterial extended to blend ten Poly Haven texture layers by the per-vertex weights from world.js.
// Rock is sampled triplanar so cliffs do not stretch; every layer is sampled twice at different scales to hide tiling.
import * as THREE from 'three';
import { HALF, CELL, SEG, N, LAYERS, Q } from './config.js';
import { H, NORMAL, SPLAT_A, SPLAT_B, SPLAT_C } from './world.js';

const CHUNK = 32; // cells per chunk side (64 m)

async function loadImage(src) { const img = new Image(); img.src = src; await img.decode(); return img; }
async function layerArray(kind, res, srgb, maxAniso) {
  const data = new Uint8Array(res * res * 4 * LAYERS.length), cv = document.createElement('canvas'); cv.width = cv.height = res;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const imgs = await Promise.all(LAYERS.map(l => loadImage(`assets/terrain/${l.name}_${kind}.jpg`)));
  imgs.forEach((img, i) => { cx.drawImage(img, 0, 0, res, res); data.set(cx.getImageData(0, 0, res, res).data, i * res * res * 4); });
  const t = new THREE.DataArrayTexture(data, res, res, LAYERS.length);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}

const TINT = [[0.95, 1.0, 0.9], [0.95, 0.95, 0.9], [1.0, 0.95, 0.9], [0.86, 0.88, 0.92], [1.75, 1.05, 0.5], [1, 1, 1], [0.46, 0.37, 0.24], [0.9, 0.9, 0.88], [1.0, 0.96, 0.9], [0.44, 0.32, 0.6]];
const f = (x) => x.toFixed(4);
// The blend is generated per layer (unrolled, constants inlined): no loops or dynamic array indexing, which keeps
// it cheap on weak GPUs and in software rendering. Each active layer adds its albedo (and, near the camera, its
// normal) weighted by w^2 times its brightness, so raised, lighter texels win at borders (a soft height blend).
function layerCode(i, antiTile) {
  const L = LAYERS[i], s = 1 / L.tile, t = TINT[i], w = ['vSA.x', 'vSA.y', 'vSA.z', 'vSA.w', 'vSB.x', 'vSB.y', 'vSB.z', 'vSC.x', 'vSC.y', 'vSC.z'][i];
  if (i === 3) return `
    if (${w} > 0.004) { // rock: biplanar (top plus the dominant side) so cliffs do not stretch
      vec3 P = vWPos * ${f(s)}; vec3 dPx = dpx3 * ${f(s)}, dPy = dpy3 * ${f(s)};
      bool sx = abs(wn.x) > abs(wn.z);
      vec2 su = sx ? P.zy : P.xy; vec2 sgx = sx ? dPx.zy : dPx.xy, sgy = sx ? dPy.zy : dPy.xy;
      vec3 a = textureGrad(tAlb, vec3(P.xz, 3.0), dPx.xz, dPy.xz).rgb * topW + textureGrad(tAlb, vec3(su, 3.0), sgx, sgy).rgb * (1.0 - topW);
      a *= vec3(${t.map(f).join(', ')});
      float h = dot(a, LUMA) + 0.12; float b = ${w} * ${w} * h * h;
      col += a * b; tot += b; rough += ${f(L.rough)} * b;
      if (nearN) { vec2 n1 = textureGrad(tNor, vec3(P.xz, 3.0), dPx.xz, dPy.xz).xy * 2.0 - 1.0, n2 = textureGrad(tNor, vec3(su, 3.0), sgx, sgy).xy * 2.0 - 1.0;
        vec3 side = sx ? vec3(0.0, -n2.y, n2.x) : vec3(n2.x, -n2.y, 0.0);
        pn += (vec3(n1.x, 0.0, -n1.y) * topW + side * (1.0 - topW)) * b; }
    }`;
  return `
    if (${w} > 0.004) {
      vec2 uv = vWPos.xz * ${f(s)}; vec2 gx = dpx * ${f(s)}, gy = dpy * ${f(s)};
      vec3 a = textureGrad(tAlb, vec3(uv, ${i}.0), gx, gy).rgb;
      ${antiTile ? `a = mix(a, textureGrad(tAlb, vec3(ROT * uv * 0.29 + 0.37, ${i}.0), ROT * gx * 0.29, ROT * gy * 0.29).rgb, mixK);` : ''}
      a *= vec3(${t.map(f).join(', ')});
      float h = dot(a, LUMA) + 0.12; float b = ${w} * ${w} * h * h;
      col += a * b; tot += b; rough += ${f(L.rough)} * b;
      if (nearN) { vec2 n = textureGrad(tNor, vec3(uv, ${i}.0), gx, gy).xy * 2.0 - 1.0; pn += vec3(n.x, 0.0, -n.y) * b; }
    }`;
}

function makeMaterial(alb, nor) {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, envMapIntensity: 0.55 });
  const antiTile = Q.albedoRes >= 1024;
  m.onBeforeCompile = (s) => {
    s.uniforms.tAlb = { value: alb }; s.uniforms.tNor = { value: nor };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 splatA; attribute vec4 splatB; attribute vec4 splatC; varying vec4 vSA; varying vec4 vSB; varying vec4 vSC; varying vec3 vWPos; varying vec3 vWN;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vSA = splatA; vSB = splatB; vSC = splatC; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2DArray tAlb; uniform sampler2DArray tNor;
        varying vec4 vSA; varying vec4 vSB; varying vec4 vSC; varying vec3 vWPos; varying vec3 vWN;
        const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8); const vec3 LUMA = vec3(0.3, 0.59, 0.11);`)
      .replace('#include <map_fragment>', `
        vec3 wn = normalize(vWN);
        vec2 dpx = dFdx(vWPos.xz), dpy = dFdy(vWPos.xz); vec3 dpx3 = dFdx(vWPos), dpy3 = dFdy(vWPos);
        float macro = vSB.w, mixK = 0.3 + 0.35 * macro, topW = smoothstep(0.55, 0.8, wn.y);
        bool nearN = distance(vWPos, cameraPosition) < 140.0;
        vec3 col = vec3(0.0), pn = vec3(0.0); float tot = 0.0, rough = 0.0;
        ${LAYERS.map((_, i) => layerCode(i, antiTile)).join('')}
        tot = max(tot, 1e-5); col /= tot; pn /= tot; rough /= tot;
        col *= 0.86 + 0.28 * macro;
        diffuseColor.rgb *= col;
        vec3 terrainN = normalize(wn + pn * 0.9);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = rough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(terrainN, 0.0)).xyz);');
  };
  m.customProgramCacheKey = () => 'iw2-terrain-' + antiTile;
  return m;
}

function chunkGeometry(ci, cj, step, cx, cy, cz) {
  const n = CHUNK / step, i0 = ci * CHUNK, j0 = cj * CHUNK, verts = (n + 1) * (n + 1), skirt = 4 * (n + 1);
  const pos = new Float32Array((verts + skirt) * 3), nor = new Float32Array((verts + skirt) * 3);
  const sa = new Uint8Array((verts + skirt) * 4), sb = new Uint8Array((verts + skirt) * 4), sc = new Uint8Array((verts + skirt) * 4), idx = [];
  const put = (v, gi, gj, drop) => { const k = gj * N + gi;
    pos[v * 3] = -HALF + gi * CELL - cx; pos[v * 3 + 1] = H[k] - cy - drop; pos[v * 3 + 2] = -HALF + gj * CELL - cz;
    nor.set(NORMAL.subarray(k * 3, k * 3 + 3), v * 3); sa.set(SPLAT_A.subarray(k * 4, k * 4 + 4), v * 4); sb.set(SPLAT_B.subarray(k * 4, k * 4 + 4), v * 4); sc.set(SPLAT_C.subarray(k * 4, k * 4 + 4), v * 4); };
  for (let b = 0; b <= n; b++) for (let a = 0; a <= n; a++) put(b * (n + 1) + a, i0 + a * step, j0 + b * step, 0);
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) { const v = b * (n + 1) + a; // same diagonal as groundY()
    idx.push(v, v + n + 1, v + 1, v + n + 2, v + 1, v + n + 1); }
  // skirts: a 3-8 m curtain hanging under each edge hides cracks between chunks of different detail
  const drop = 2 + step * 1.5; let v = verts;
  const edges = [[...Array(n + 1).keys()].map(a => a), [...Array(n + 1).keys()].map(a => n * (n + 1) + a), [...Array(n + 1).keys()].map(b => b * (n + 1)), [...Array(n + 1).keys()].map(b => b * (n + 1) + n)];
  for (const e of edges) { const start = v;
    for (const t of e) { const a = t % (n + 1), b = Math.floor(t / (n + 1)); put(v++, i0 + a * step, j0 + b * step, drop); }
    for (let q = 0; q < n; q++) { const t0 = e[q], t1 = e[q + 1], s0 = start + q, s1 = start + q + 1; idx.push(t0, s0, t1, t1, s0, s1, t0, t1, s0, t1, s1, s0); } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('splatA', new THREE.BufferAttribute(sa, 4, true)); g.setAttribute('splatB', new THREE.BufferAttribute(sb, 4, true)); g.setAttribute('splatC', new THREE.BufferAttribute(sc, 4, true));
  g.setIndex(idx); g.computeBoundingSphere(); return g;
}

export async function buildTerrain(scene, renderer) {
  const aniso = Math.min(Q.anisotropy, renderer.capabilities.getMaxAnisotropy());
  const [alb, nor] = await Promise.all([layerArray('diff', Q.albedoRes, true, aniso), layerArray('nor', Q.albedoRes / 2, false, aniso)]);
  const mat = makeMaterial(alb, nor), group = new THREE.Group(); group.name = 'terrain';
  const per = SEG / CHUNK;
  for (let cj = 0; cj < per; cj++) for (let ci = 0; ci < per; ci++) {
    const cx = -HALF + (ci + 0.5) * CHUNK * CELL, cz = -HALF + (cj + 0.5) * CHUNK * CELL;
    let cy = 0; for (let b = 0; b <= CHUNK; b += 8) for (let a = 0; a <= CHUNK; a += 8) cy += H[(cj * CHUNK + b) * N + ci * CHUNK + a]; cy /= 25;
    const lod = new THREE.LOD(); lod.position.set(cx, cy, cz);
    [[1, 0], [2, Q.lod0], [4, Q.lod0 * 2]].forEach(([step, dist]) => {
      const m = new THREE.Mesh(chunkGeometry(ci, cj, step, cx, cy, cz), mat); m.receiveShadow = true; m.castShadow = step < 4; lod.addLevel(m, dist); });
    group.add(lod);
  }
  scene.add(group); return group;
}
