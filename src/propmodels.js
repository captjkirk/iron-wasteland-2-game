// Realistic props built at load: textured boulders (Poly Haven rock), saguaro cacti, ferns, reeds and wildflowers
// (textures drawn in code), scrap piles from Poly Haven barrels and tyres with rusty corrugated iron, car wrecks with a
// rusty painted body, and broken stone walls. Every builder returns scatter parts: [{ geo, mat, cast }].
import * as THREE from 'three';
import { Q } from './config.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const loader = new THREE.TextureLoader();
function tex(url, srgb, rep = 1) { const t = loader.load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
export function pbr(name, opts = {}) { return new THREE.MeshStandardMaterial({ map: tex(`assets/${name}_diff.jpg`, true, opts.rep || 1), normalMap: tex(`assets/${name}_nor.jpg`, false, opts.rep || 1),
  roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0, color: opts.color ?? 0xffffff, side: opts.side ?? THREE.FrontSide, vertexColors: !!opts.vc }); }

// small seeded 3D value noise for rock shapes
function h3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function n3(x, y, z) { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t, c = (i, j, k) => h3(xi + i, yi + j, zi + k);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w); }
const f3 = (x, y, z) => n3(x, y, z) * 0.55 + n3(x * 2.1 + 5, y * 2.1, z * 2.1) * 0.3 + n3(x * 4.3, y * 4.3 + 3, z * 4.3) * 0.15;

// box-projected UVs in metres (seams fall on hard edges, which rocks and walls have anyway)
export function boxUV(g, tile) { const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)), x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const [u, v] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y]; uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; }

// ── Rocks: a displaced sphere, flattened below, with moss, snow or sand settling on the upward faces ──
function rockGeo(seed, detail, cover) {
  let g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const p = g.attributes.position, v = new THREE.Vector3(), sq = 0.55 + h3(seed, 1, 2) * 0.35, st = 0.8 + h3(seed, 3, 4) * 0.5;
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i);
    const d = 1 + (f3(v.x * 1.3 + seed * 7, v.y * 1.3, v.z * 1.3) - 0.5) * 0.9 + (n3(v.x * 5 + seed, v.y * 5, v.z * 5) - 0.5) * 0.08;
    v.multiplyScalar(d); v.x *= st; v.y *= sq; if (v.y < -0.15) v.y = -0.15 + (v.y + 0.15) * 0.25; p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); boxUV(g, 1.6);
  const n = g.attributes.normal, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const up = n.getY(i), k = THREE.MathUtils.smoothstep(up + (n3(p.getX(i) * 3, p.getY(i) * 3, p.getZ(i) * 3) - 0.5) * 0.5, 0.45, 0.8);
    const c = cover ? new THREE.Color(cover).lerp(new THREE.Color(1, 1, 1), 1 - k) : new THREE.Color(1, 1, 1); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.translate(0, 0.1, 0); return g;
}
let rockMats = null;
export function rockParts(kind, seed) {
  if (!rockMats) rockMats = {
    rock: pbr('terrain/rock', { color: 0xc8c4bc, vc: true, rough: 0.9 }), icerock: pbr('terrain/rock', { color: 0xb8c4cc, vc: true, rough: 0.75 }),
    sandrock: pbr('terrain/rock', { color: 0xe8c49a, vc: true, rough: 0.92 }), wasterock: pbr('terrain/rock', { color: 0xb4a490, vc: true, rough: 0.92 }) };
  const cover = { rock: 0x88a058, icerock: 0x2a2a2a, sandrock: null, wasterock: null }[kind]; // icerock: snow is drawn brighter below
  for (const m of Object.values(rockMats)) if (!m.userData.tri) { m.userData.tri = true; m.normalMap = null;
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying vec3 vOP; varying vec3 vON;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position * 0.62; vON = normal;');
      sh.fragmentShader = 'varying vec3 vOP; varying vec3 vON;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
        vec3 bw = pow(abs(normalize(vON)), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
        vec4 tc = texture2D(map, vOP.zy) * bw.x + texture2D(map, vOP.xz) * bw.y + texture2D(map, vOP.xy) * bw.z;
        diffuseColor *= tc;`); };
    m.customProgramCacheKey = () => 'iw-rock-tri'; m.needsUpdate = true; }
  const near = rockGeo(seed, 4, kind === 'icerock' ? null : cover), far = rockGeo(seed, 1, kind === 'icerock' ? null : cover);
  if (kind === 'icerock') for (const g of [near, far]) { const n = g.attributes.normal, c = g.attributes.color; // snow caps: vertex colour above 1 brightens the dark rock
    for (let i = 0; i < n.count; i++) { const k = THREE.MathUtils.smoothstep(n.getY(i), 0.5, 0.8) * 2.6; c.setXYZ(i, 1 + k, 1 + k * 1.02, 1 + k * 1.06); } }
  return { parts: [{ geo: near, mat: rockMats[kind], cast: true, name: kind }], far: [{ geo: far, mat: rockMats[kind], cast: false, name: kind + ' far' }] };
}

// ── Saguaro cactus: ribbed trunk and arms ──
let cactusMat = null;
export function cactusParts(seed) {
  cactusMat = cactusMat || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const rib = (g, r0) => { const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = Math.cos(a * 14); const s = 1 + k * 0.05; p.setX(i, p.getX(i) * s); p.setZ(i, p.getZ(i) * s);
      const c = new THREE.Color(0x34462a).lerp(new THREE.Color(0x667a4c), k * 0.5 + 0.5); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g; };
  const trunk = rib(new THREE.CylinderGeometry(0.3, 0.36, 4, 28, 10).translate(0, 2, 0));
  const cap = rib(new THREE.SphereGeometry(0.3, 28, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 4, 0));
  const arms = []; const na = 1 + Math.floor(h3(seed, 2, 3) * 2.5);
  for (let k = 0; k < na; k++) { const a = k * 2.4 + seed, y0 = 1.5 + h3(seed, k, 1) * 1.2, out = 0.8, up = 1.0 + h3(k, seed, 4) * 0.9;
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, y0, 0), new THREE.Vector3(Math.cos(a) * out * 0.8, y0 + 0.1, Math.sin(a) * out * 0.8), new THREE.Vector3(Math.cos(a) * out, y0 + 0.5, Math.sin(a) * out), new THREE.Vector3(Math.cos(a) * out, y0 + up, Math.sin(a) * out)]);
    const t = new THREE.TubeGeometry(curve, 12, 0.2, 14, false); t.deleteAttribute('uv'); arms.push(rib(t));
    const tip = new THREE.SphereGeometry(0.2, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(Math.cos(a) * out, y0 + up, Math.sin(a) * out); tip.deleteAttribute('uv'); arms.push(rib(tip)); }
  [trunk, cap].forEach(g => g.deleteAttribute('uv'));
  return { parts: [{ geo: mergeGeometries([trunk, cap, ...arms]), mat: cactusMat, cast: true, name: 'cactus' }] };
}

// ── Canvas-drawn foliage textures (alpha cut-outs): fern frond, flower heads ──
// Cut-outs are drawn twice: once over a solid leaf-coloured ground (the colour) and once over nothing (the alpha), so
// the transparent texels carry leaf colour and mipmaps do not bleed black into the edges (which read as dark jaggies).
export function canvasTex(w, h, draw, bg = '#4f7a2c') {
  const mk = (fill) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true });
    if (fill) { x.fillStyle = fill; x.fillRect(0, 0, w, h); } draw(x, w, h); return x.getImageData(0, 0, w, h).data; };
  const col = mk(bg), al = mk(null), data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) { const o = ((h - 1 - y) * w + i) * 4, q = (y * w + i) * 4; // rows flipped: uv (0,0) at the bottom
    data[o] = col[q]; data[o + 1] = col[q + 1]; data[o + 2] = col[q + 2]; data[o + 3] = al[q + 3]; }
  const t = new THREE.DataTexture(data, w, h); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t; }
let fernMat = null, flowerMat = null, reedMat = null;
// two-sided cards keep their up-facing normal on the back too (otherwise the undersides render near-black)
function upFacing(m) { m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0')); }; return m; }
function frondTexture() { return canvasTex(128, 512, (x, w, h) => {
  x.strokeStyle = '#5a6a2a'; x.lineWidth = 4; x.beginPath(); x.moveTo(w / 2, h); x.lineTo(w / 2, 0); x.stroke();
  for (let y = h - 30; y > 6; y -= 11) { const t = y / h, len = (w / 2 - 6) * Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.95 + 4;
    for (const s of [-1, 1]) { x.save(); x.translate(w / 2, y); x.rotate(s * (1.15 - t * 0.2)); const g = x.createLinearGradient(0, 0, 0, -len);
      g.addColorStop(0, '#4f7a2c'); g.addColorStop(1, '#7aa848'); x.fillStyle = g; x.beginPath(); x.ellipse(0, -len / 2, 4.2, len / 2, 0, 0, Math.PI * 2); x.fill(); x.restore(); } } }); }
export function fernParts(seed) {
  fernMat = fernMat || new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.45, alphaToCoverage: Q.antialias, side: THREE.DoubleSide, roughness: 0.8, color: 0xd0d8c0 }); upFacing(fernMat);
  const pos = [], uv = [], nor = [], idx = []; const nf = 8 + Math.floor(h3(seed, 1, 1) * 5);
  for (let f = 0; f < nf; f++) { const a = f / nf * Math.PI * 2 + h3(seed, f, 2), len = 0.7 + h3(seed, f, 3) * 0.5, lift = 0.9 + h3(f, seed, 5) * 0.5, base = pos.length / 3, S = 6;
    const dx = Math.cos(a), dz = Math.sin(a), rx = -dz, rz = dx;
    for (let s = 0; s <= S; s++) { const t = s / S, r = t * len, y = Math.sin(t * Math.PI * 0.75) * lift * len * 0.7 - t * t * 0.15, wdt = 0.16 * len;
      for (const side of [-1, 1]) { pos.push(dx * r + rx * wdt * side, y + 0.02, dz * r + rz * wdt * side); uv.push(side < 0 ? 0 : 1, t); nor.push(0, 1, 0); } }
    for (let s = 0; s < S; s++) { const o = base + s * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  return { parts: [{ geo: g, mat: fernMat, cast: false, name: 'fern' }] };
}
const FLOWER_COLS = [['#f4f2e8', '#e8c030'], ['#f0c828', '#c07818'], ['#9a6ad0', '#f0e080'], ['#e05a48', '#402018']];
export function flowerParts(kind) {
  flowerMat = flowerMat || new THREE.MeshStandardMaterial({ map: canvasTex(512, 128, (x) => { FLOWER_COLS.forEach(([petal, eye], k) => { const cx = k * 128 + 64, cy = 64;
      x.fillStyle = petal; for (let p = 0; p < 9; p++) { x.save(); x.translate(cx, cy); x.rotate(p / 9 * Math.PI * 2); x.beginPath(); x.ellipse(0, -30, 11, 30, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
      x.fillStyle = eye; x.beginPath(); x.arc(cx, cy, 14, 0, Math.PI * 2); x.fill(); x.fillStyle = '#ffffff'; x.fillRect(k * 128, 0, 8, 8); }); }, '#b8b088'), alphaTest: 0.5, alphaToCoverage: Q.antialias, side: THREE.DoubleSide, roughness: 0.7 });
  const pos = [], uv = [], nor = [], col = [], idx = []; const n = 9;
  const quad = (pts, uvs, c, nn) => { const b = pos.length / 3; pts.forEach(p => pos.push(...p)); uvs.forEach(u => uv.push(...u)); for (let i = 0; i < 4; i++) { nor.push(...nn); col.push(...c); } idx.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  for (let i = 0; i < n; i++) { const a = i * 2.39996, r = Math.sqrt(i / n) * 0.35, x = Math.cos(a) * r, z = Math.sin(a) * r, hgt = 0.28 + (i % 3) * 0.08, s = 0.05 + (i % 2) * 0.012;
    // stem: a thin upright strip on the cell's solid white corner texel, coloured green by vertex colour
    const su = kind * 0.25 + 0.004, sv = 1 - 4 / 128;
    quad([[x - 0.006, 0, z], [x + 0.006, 0, z], [x + 0.006, hgt, z], [x - 0.006, hgt, z]], [[su, sv], [su, sv], [su, sv], [su, sv]], [0.25, 0.4, 0.15], [0, 1, 0]);
    const u0 = kind * 0.25, u1 = u0 + 0.25; // head: a horizontal-ish card facing up
    quad([[x - s, hgt, z - s], [x + s, hgt, z - s], [x + s, hgt + 0.02, z + s], [x - s, hgt + 0.02, z + s]], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]], [1, 1, 1], [0, 1, 0]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  flowerMat.vertexColors = true; flowerMat.map.wrapS = THREE.ClampToEdgeWrapping; upFacing(flowerMat);
  return { parts: [{ geo: g, mat: flowerMat, cast: false, name: 'flowers' }] };
}
export function reedParts(seed) {
  reedMat = reedMat || new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.75 });
  const pos = [], col = [], nor = [], idx = []; const nb = 22;
  for (let b = 0; b < nb; b++) { const a = h3(seed, b, 1) * 6.283, r = Math.sqrt(h3(b, seed, 2)) * 0.45, x0 = Math.cos(a) * r, z0 = Math.sin(a) * r, hgt = 1.1 + h3(seed, b, 3) * 1.1,
      lean = (h3(b, b, seed) - 0.5) * 0.5, la = h3(seed, seed, b) * 6.283, w = 0.025 + h3(b, 2, seed) * 0.015, base = pos.length / 3, S = 4;
    for (let s = 0; s <= S; s++) { const t = s / S, y = t * hgt, off = lean * t * t * hgt, cx = x0 + Math.cos(la) * off, cz = z0 + Math.sin(la) * off, ww = w * (1 - t * 0.9);
      const c = new THREE.Color(0x3a5224).lerp(new THREE.Color(0xa8a060), t * 0.8);
      for (const side of [-1, 1]) { pos.push(cx + Math.cos(la + 1.57) * ww * side, y, cz + Math.sin(la + 1.57) * ww * side); col.push(c.r, c.g, c.b); nor.push(Math.cos(la) * 0.3, 0.9, Math.sin(la) * 0.3); } }
    for (let s = 0; s < S; s++) { const o = base + s * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    if (b % 5 === 0) { const ty = hgt * 0.92, o = pos.length / 3, tx = x0 + Math.cos(la) * lean * 0.85 * hgt, tz = z0 + Math.sin(la) * lean * 0.85 * hgt; // cattail head
      for (const [dx, dz] of [[0.03, 0], [0, 0.03], [-0.03, 0], [0, -0.03]]) for (const dy of [0, 0.2]) { pos.push(tx + dx, ty + dy, tz + dz); col.push(0.22, 0.13, 0.07); nor.push(dx * 30, 0.2, dz * 30); }
      for (let k = 0; k < 4; k++) { const a0 = o + k * 2, a1 = o + ((k + 1) % 4) * 2; idx.push(a0, a1, a0 + 1, a1, a1 + 1, a0 + 1); } } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  return { parts: [{ geo: g, mat: reedMat, cast: false, name: 'reeds' }] };
}

// ── Poly Haven meshes in the game's JSON format (scripts/convert_gltf.py) ──
const b64 = (s, T) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new T(u.buffer); };
export async function loadMesh(name) { const j = await (await fetch(`assets/props/${name}.json`)).json();
  return mergeGeometries(j.primitives.map(p => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(b64(p.position, Float32Array), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(b64(p.normal, Float32Array), 3)); g.setAttribute('uv', new THREE.BufferAttribute(b64(p.uv, Float32Array), 2));
    g.setIndex(new THREE.BufferAttribute(b64(p.index, p.index32 ? Uint32Array : Uint16Array), 1)); return g; })); }
const place = (g, { p = [0, 0, 0], r = [0, 0, 0], s = 1 }) => g.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(s, s, s)));

// corrugated iron sheet, bent and torn, about 2 x 1 m
function sheet(seed) { const g = new THREE.PlaneGeometry(2, 1, 40, 6), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.sin(x * 40) * 0.018 + (x * x * 0.12 + y * 0.1) * (h3(seed, 1, 1) - 0.3)); }
  g.rotateX(-Math.PI / 2); g.computeVertexNormals(); return g; }
let M = null;
export async function loadPropMeshes() {
  const [tyre, barrelA, barrelB] = await Promise.all(['old_tyre', 'barrel_03', 'barrel_01'].map(loadMesh));
  M = { tyre, barrelA, barrelB,
    mats: { tyre: pbr('props/tyre', { rough: 0.9, side: THREE.DoubleSide }), barrelA: pbr('props/barrel_03', { rough: 0.9, metal: 0.25, side: THREE.DoubleSide, color: 0x6e5a48 }),
      barrelB: pbr('props/barrel_01', { rough: 0.9, metal: 0.25, side: THREE.DoubleSide, color: 0x5e5246 }), iron: pbr('props/iron', { rough: 0.75, metal: 0.35, side: THREE.DoubleSide, rep: 1 }),
      body: pbr('props/car_rust', { rough: 0.7, metal: 0.35, rep: 0.45 }), glass: new THREE.MeshStandardMaterial({ color: 0x2a2c2c, roughness: 0.35, metalness: 0.2, side: THREE.DoubleSide }),
      wall: pbr('props/wall', { rough: 0.95 }) } };
}

// scrap heap, 2 to 4 m across, laid out from the variant seed: a mound of bent corrugated sheets and pipes with
// rusted barrels (standing, fallen, half sunk) and old tyres; every variant is a different layout
const pipe = (len, r) => new THREE.CylinderGeometry(r, r, len, 10, 1, true).rotateZ(Math.PI / 2);
export function scrapParts(v) {
  const R = (k) => h3(v * 13.7 + 1, k * 3.1, 7.7), t = M.tyre, A = M.barrelA, B = M.barrelB, tyres = [], As = [], Bs = [], iron = [];
  const spread = 1.2 + R(0) * 1.0, nSheets = 3 + Math.floor(R(1) * 4);
  for (let k = 0; k < nSheets; k++) { const a = R(10 + k) * 6.283, d = R(20 + k) * spread * 0.7;
    iron.push(place(sheet(v * 7 + k), { p: [Math.cos(a) * d, 0.15 + R(30 + k) * 0.5, Math.sin(a) * d], r: [(R(40 + k) - 0.5) * 1.4, R(50 + k) * 6.28, (R(60 + k) - 0.5) * 0.9] })); }
  for (let k = 0; k < 2 + Math.floor(R(2) * 3); k++) { const a = R(70 + k) * 6.283, d = R(80 + k) * spread;
    iron.push(place(pipe(1.2 + R(90 + k) * 1.8, 0.04 + R(95 + k) * 0.06), { p: [Math.cos(a) * d, 0.08 + R(97 + k) * 0.4, Math.sin(a) * d], r: [0, R(99 + k) * 6.28, (R(98 + k) - 0.5) * 0.6] })); }
  const nb = 1 + Math.floor(R(3) * 3);
  for (let k = 0; k < nb; k++) { const a = R(100 + k) * 6.283, d = spread * (0.5 + R(110 + k) * 0.5), mode = R(120 + k), x = Math.cos(a) * d, z = Math.sin(a) * d;
    const o = mode < 0.35 ? { p: [x, -0.25 - R(125 + k) * 0.25, z], r: [(R(126 + k) - 0.5) * 0.4, 0, (R(127 + k) - 0.5) * 0.4] }   // half sunk
      : mode < 0.7 ? { p: [x, 0.28, z], r: [Math.PI / 2, R(130 + k) * 6.28, 0] } : { p: [x, -0.03, z], r: [0, R(131 + k) * 6.28, 0] };
    (R(140 + k) < 0.5 ? As : Bs).push(place(R(140 + k) < 0.5 ? A : B, o)); }
  const nt = Math.floor(R(4) * 4);
  for (let k = 0; k < nt; k++) { const a = R(150 + k) * 6.283, d = spread * (0.3 + R(160 + k) * 0.8), flat = R(170 + k) < 0.6;
    tyres.push(place(t, flat ? { p: [Math.cos(a) * d, 0.02 + (k % 2) * 0.16, Math.sin(a) * d], r: [Math.PI / 2, 0, R(175 + k)] } : { p: [Math.cos(a) * d, 0.22, Math.sin(a) * d], r: [0.4, R(180 + k) * 6.28, 0] })); }
  const parts = [{ geo: mergeGeometries(iron.map(g => { const q = g.index ? g.toNonIndexed() : g; for (const n of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(n)) q.deleteAttribute(n); return q; })), mat: M.mats.iron, cast: true, name: 'scrap iron' }];
  if (tyres.length) parts.push({ geo: mergeGeometries(tyres), mat: M.mats.tyre, cast: true, name: 'scrap tyres' });
  if (As.length) parts.push({ geo: mergeGeometries(As), mat: M.mats.barrelA, cast: true, name: 'scrap barrels' });
  if (Bs.length) parts.push({ geo: mergeGeometries(Bs), mat: M.mats.barrelB, cast: true, name: 'scrap barrels 2' });
  return { parts };
}

// car wreck: an extruded sedan body (wheel arches cut), dark empty window holes, old tyres (some missing)
export function wreckParts(v) {
  const s = new THREE.Shape(); s.moveTo(-2.2, 0.32); s.lineTo(-2.28, 0.72); s.quadraticCurveTo(-2.2, 0.86, -1.9, 0.9); s.lineTo(-0.9, 1.0); s.lineTo(-0.35, 1.42);
  s.quadraticCurveTo(0.2, 1.48, 0.95, 1.42); s.lineTo(1.55, 1.02); s.lineTo(2.15, 0.98); s.quadraticCurveTo(2.3, 0.9, 2.28, 0.42); s.lineTo(2.2, 0.32);
  s.lineTo(1.8, 0.32); s.absarc(1.38, 0.32, 0.42, 0, Math.PI, false); s.lineTo(-0.96, 0.32); s.absarc(-1.38, 0.32, 0.42, 0, Math.PI, false); s.lineTo(-2.2, 0.32);
  const body = new THREE.ExtrudeGeometry(s, { depth: 1.62, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2, curveSegments: 10 }).translate(0, 0, -0.81);
  // dents: push the roof and one side in a little
  const p = body.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setY(i, y - Math.max(0, y - 1.2) * (0.25 + 0.2 * Math.sin(x * 2 + v)) * (v === 1 ? 1.4 : 0.6)); p.setZ(i, z + (z > 0 ? -1 : 1) * 0.05 * Math.max(0, Math.sin(x * 1.7 + v * 2))); }
  body.computeVertexNormals();
  const w = new THREE.Shape(); w.moveTo(-0.82, 1.04); w.lineTo(-0.34, 1.38); w.lineTo(0.92, 1.38); w.lineTo(1.45, 1.04); w.lineTo(-0.82, 1.04);
  const win = mergeGeometries([new THREE.ShapeGeometry(w).translate(0, 0, 0.9), new THREE.ShapeGeometry(w).translate(0, 0, -0.9),
    new THREE.PlaneGeometry(1.5, 0.62).rotateY(-Math.PI / 2).rotateZ(-0.9).translate(-0.64, 1.24, 0)]);
  win.deleteAttribute('uv'); const wins = win;
  const wheels = [[-1.38, 0.86], [1.38, 0.86], [-1.38, -0.86], [1.38, -0.86]].filter((_, k) => !(v === 1 && (k === 1 || k === 2)) && !(v === 2 && k === 0));
  const ty = mergeGeometries(wheels.map(([x, z]) => place(M.tyre, { p: [x, v === 1 ? 0.2 : 0.33, z], s: 1.2 })));
  const parts = [{ geo: body, mat: M.mats.body, cast: true, name: 'wreck body' }, { geo: wins, mat: M.mats.glass, cast: false, name: 'wreck windows' }];
  if (wheels.length) parts.push({ geo: ty, mat: M.mats.tyre, cast: true, name: 'wreck tyres' });
  if (v === 1) for (const q of parts) q.geo = q.geo.clone().translate(0, -0.14, 0); // sunk to the hubs, wheels gone
  return { parts };
}

// broken stone wall: blocks with a ragged top and a fallen piece
export function wallParts(v) {
  const blocks = []; let x = -2.6;
  while (x < 2.6) { const w = 0.6 + h3(v, x, 1) * 0.9, hgt = 1.2 + h3(x, v, 2) * 2.4 * (1 - Math.abs(x) / 4); blocks.push(new THREE.BoxGeometry(w, hgt, 0.7).translate(x + w / 2, hgt / 2, 0)); x += w; }
  blocks.push(new THREE.BoxGeometry(1.1, 0.5, 0.6).rotateY(0.4).rotateZ(0.15).translate(1.2 + v * 0.4, 0.2, 1.1));
  const g = mergeGeometries(blocks.map(b => b.toNonIndexed())); boxUV(g, 2.2);
  return { parts: [{ geo: g, mat: M.mats.wall, cast: true, name: 'ruin wall' }] };
}

// ── Landforms: rock spires (hoodoos) (the arches are in landmarks.js), built in metres so the triplanar rock texture keeps its
// scale; horizontal strata are baked into the vertex colour (sandstone bands; ice spires get snow on the ledges) ──
export function rockMat(kind) { rockParts(kind, 1); return rockMats[kind]; }
function strata(g, kind, seed) {
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), up = n.getY(i), w = n3(p.getX(i) * 0.4, y * 0.4 + seed, p.getZ(i) * 0.4);
    const band = Math.sin(y * 1.9 + w * 2.5 + seed) * 0.5 + 0.5, band2 = Math.sin(y * 0.55 + seed * 3) * 0.5 + 0.5;
    if (kind === 'icerock') { const k = THREE.MathUtils.smoothstep(up, 0.45, 0.75) * 2.6; col.set([1 + k, 1 + k * 1.02, 1 + k * 1.06], i * 3); continue; }
    const r = 0.86 + band * 0.18 + band2 * 0.08, gC = 0.8 + band * 0.14 + band2 * 0.04, b = 0.74 + band * 0.12 - band2 * 0.04;
    const dust = THREE.MathUtils.smoothstep(up, 0.55, 0.85) * 0.15; col.set([r + dust, gC + dust, b + dust * 0.6], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
export const SPIRE_REACH = {}; // each spire's own width at a walker's height (its collider, props.js), by kind + variant
export function spireParts(v, kind) {
  const H = [11, 17, 25][v], rb = [3.2, 4.2, 5.4][v], seed = v * 7.3 + (kind === 'icerock' ? 40 : 0);
  let g = new THREE.CylinderGeometry(1, 1, 1, 22, Math.round(H / 0.7), false); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
  const p = g.attributes.position, q = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { q.fromBufferAttribute(p, i); const t = q.y + 0.5, a = Math.atan2(q.z, q.x), rad = Math.hypot(q.x, q.z);
    // a hoodoo: a broad foot, a waist, ledges where harder beds stand out, and a wider caprock
    let R = rb * (1 - t * 0.62) + rb * 0.42 * THREE.MathUtils.smoothstep(t, 0.86, 0.93) * (1 - THREE.MathUtils.smoothstep(t, 0.97, 1.0) * 0.5);
    const ledge = Math.pow(Math.abs(Math.sin(t * H * 0.62 + seed)), 6) * 0.3;
    R *= 1 + ledge + (f3(Math.cos(a) * 1.4 + seed, t * H * 0.18, Math.sin(a) * 1.4) - 0.5) * 0.55 + (n3(Math.cos(a) * 5, t * H * 0.7, Math.sin(a) * 5 + seed) - 0.5) * 0.2 + (n3(Math.cos(a) * 11, t * H * 1.6, Math.sin(a) * 11 + seed) - 0.5) * 0.1; // fine fretting, so it reads as weathered rock, not clay
    const lean = (f3(seed, t * 1.5, 3) - 0.5) * H * 0.12 * t;
    q.set(Math.cos(a) * R * rad + lean, t * H - 1.2, Math.sin(a) * R * rad); if (t >= 0.999 && rad < 1e-3) q.y += 0.35; p.setXYZ(i, q.x, q.y, q.z); }
  g.computeVertexNormals(); strata(g, kind, seed);
  let reach = 0; for (let i = 0; i < p.count; i++) if (p.getY(i) > -0.5 && p.getY(i) < 2) reach = Math.max(reach, Math.hypot(p.getX(i), p.getZ(i)));
  SPIRE_REACH[kind + v] = reach * 0.92; // (a circle a little inside its widest bulge, from its own model: a fixed 2.6 m let walkers into the two bigger shapes, the owner's play 2026-11-04)
  return { parts: [{ geo: g, mat: rockMat(kind), cast: true, name: kind + ' spire' }] };
}
// ── Fungal Hollow: giant mushrooms (pale fibrous stems, mottled caps, glowing gills and spots) and glowcap clusters ──
const SHROOM = [{ cap: 0x4a2266, cap2: 0x7a4a9a, glow: 0x5fe8d0 }, { cap: 0x1d4a58, cap2: 0x3f7f86, glow: 0xb070ff }, { cap: 0x6a2c22, cap2: 0xb0623a, glow: 0x9cff70 }];
let shroomMats = null;
function lathe(profile, segs = 22) { const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(1e-3, r), y)), segs); g.deleteAttribute('uv'); return mergeVertices(g); }
export function shroomParts(v) {
  if (!shroomMats) shroomMats = { stem: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), cap: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
    glow: SHROOM.map(s => new THREE.MeshStandardMaterial({ color: 0x223040, emissive: s.glow, emissiveIntensity: 1.6, roughness: 0.6 })) };
  const S = SHROOM[v], H = [5.5, 7.5, 4.2][v], Rc = [3.2, 3.6, 2.9][v], bend = [0.7, -1.0, 0.4][v], seed = v * 3.7 + 1;
  // stem: a flared foot, a slight bend, rings of torn veil under the cap
  const sp = []; for (let k = 0; k <= 16; k++) { const t = k / 16; sp.push([0.62 * (1 - t) ** 3 + 0.34 + 0.05 * Math.sin(t * 19) * (t > 0.7 ? 1 : 0.2) + (t > 0.78 && t < 0.83 ? 0.12 : 0), t * H]); }
  const stem = lathe(sp, 18), p = stem.attributes.position, sc = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), t = y / H, a = Math.atan2(p.getZ(i), p.getX(i)); p.setX(i, p.getX(i) * (1 + (n3(Math.cos(a) * 3, y * 1.2, Math.sin(a) * 3 + seed) - 0.5) * 0.25) + bend * t * t);
    const fib = 0.78 + n3(Math.cos(a) * 9, y * 0.5, Math.sin(a) * 9) * 0.2 - (1 - t) * 0.12; sc.set([fib * 0.92, fib * 0.88, fib * 0.8], i * 3); }
  stem.computeVertexNormals(); stem.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  // cap: a domed top with an in-rolled rim; gills underneath
  const top = [], y0 = H - 0.2; for (let k = 0; k <= 14; k++) { const a = k / 14 * Math.PI * 0.5; top.push([Rc * Math.cos(a) * (1 + 0.06 * Math.sin(a * 2)), y0 + Rc * 0.52 * Math.sin(a) ** 0.9]); }
  top[0] = [Rc * 0.97, y0 - 0.25]; top.reverse();
  const cap = lathe(top, 30), cp = cap.attributes.position, cc = new Float32Array(cp.count * 3), c1 = new THREE.Color(S.cap), c2 = new THREE.Color(S.cap2), tc = new THREE.Color();
  for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z);
    const wob = 1 + (n3(Math.cos(a) * 2.5 + seed, 0, Math.sin(a) * 2.5) - 0.5) * 0.18; cp.setXYZ(i, x * wob + bend, y + (wob - 1) * 1.2 * (r / Rc), z * wob);
    const mott = n3(x * 1.4 + seed, y * 1.4, z * 1.4); tc.copy(c1).lerp(c2, Math.min(1, mott * 0.9 + (r / Rc) * 0.3)); cc.set([tc.r, tc.g, tc.b], i * 3); }
  cap.computeVertexNormals(); cap.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const gills = lathe([[0.38, y0 - 0.05], [Rc * 0.55, y0 - 0.32], [Rc * 0.95, y0 - 0.27]], 30).translate(bend, 0, 0);
  const spots = []; for (let k = 0; k < 14; k++) { const a = h3(k, v, 1) * 6.283, r = Math.sqrt(h3(k, v, 2)) * Rc * 0.85, yy = y0 + Rc * 0.52 * Math.sqrt(Math.max(0, 1 - (r / Rc) ** 2)) - 0.04;
    spots.push(new THREE.SphereGeometry(0.12 + h3(k, v, 3) * 0.18, 7, 4).scale(1, 0.35, 1).translate(Math.cos(a) * r + bend, yy, Math.sin(a) * r)); }
  const glowG = mergeGeometries([gills.toNonIndexed(), ...spots.map(s => { const q = s.toNonIndexed(); q.deleteAttribute('uv'); return q; })]); glowG.computeVertexNormals();
  return { parts: [{ geo: stem, mat: shroomMats.stem, cast: true, name: 'shroom stem' }, { geo: cap, mat: shroomMats.cap, cast: true, name: 'shroom cap' }, { geo: glowG, mat: shroomMats.glow[v], cast: false, name: 'shroom glow' }] };
}
export function glowcapParts(v) {
  if (!shroomMats) shroomParts(0);
  const stems = [], caps = [];
  for (let k = 0; k < 7; k++) { const a = h3(k, v, 5) * 6.283, r = h3(k, v, 6) * 0.35, hh = 0.08 + h3(k, v, 7) * 0.22, cr = 0.04 + hh * 0.3, x = Math.cos(a) * r, z = Math.sin(a) * r;
    stems.push(new THREE.CylinderGeometry(cr * 0.3, cr * 0.4, hh, 6, 1, true).translate(x, hh / 2, z));
    caps.push(new THREE.SphereGeometry(cr, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(x, hh, z)); }
  const fix = (l) => { const g = mergeGeometries(l.map(q => { q.deleteAttribute('uv'); return q.toNonIndexed(); })); return g; };
  const sg = fix(stems), sc = new Float32Array(sg.attributes.position.count * 3).fill(0.85); sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  return { parts: [{ geo: sg, mat: shroomMats.stem, cast: false, name: 'glowcap stems' }, { geo: fix(caps), mat: shroomMats.glow[v % 3], cast: false, name: 'glowcaps' }] };
}
