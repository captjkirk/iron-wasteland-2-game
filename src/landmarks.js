// Landmarks: the Fungal Hollow's giant glowing mushrooms and natural sandstone arches. Every builder returns scatter parts like propmodels.js: { parts, far? }, built in unit space.
// Everything is one parametric-surface helper (surf) plus value noise; textures are drawn in code or are the repo's rock texture.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pbr } from './propmodels.js';

const TAU = Math.PI * 2, sst = THREE.MathUtils.smoothstep, lerp = THREE.MathUtils.lerp, clamp = THREE.MathUtils.clamp;
// seeded 3D value noise (same family as propmodels.js, which does not export its own)
function h3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function n3(x, y, z) { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t, c = (i, j, k) => h3(xi + i, yi + j, zi + k);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w); }
const f3 = (x, y, z) => n3(x, y, z) * 0.55 + n3(x * 2.1 + 5, y * 2.1, z * 2.1) * 0.3 + n3(x * 4.3, y * 4.3 + 3, z * 4.3) * 0.15;
const rng = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const fr = (x) => x - Math.floor(x);

// Parametric surface: fn(u, v) -> [x, y, z], u wraps around (closed seam, one shared normal), v runs along. A row that collapses
// to a point (a pole) gets one normal all round. Winding: with u turning anticlockwise seen from +y, v up gives outward normals;
// flip reverses it (use it when v runs outward, as on a cap).
function surf(nu, nv, fn, uvf, flip) {
  const W = nu + 1, pos = new Float32Array(W * (nv + 1) * 3), uv = new Float32Array(W * (nv + 1) * 2), idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const k = j * W + i, p = fn(i / nu, j / nv, k); pos.set(p, k * 3); uv.set(uvf ? uvf(i / nu, j / nv, p) : [i / nu, j / nv], k * 2); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const n = g.attributes.normal, v = new THREE.Vector3(), mix = (a, b) => { v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize(); n.setXYZ(a, v.x, v.y, v.z); n.setXYZ(b, v.x, v.y, v.z); };
  for (let j = 0; j <= nv; j++) { const r0 = j * W, r1 = r0 + nu, m = r0 + (nu >> 1), dx = pos[r0 * 3] - pos[m * 3], dy = pos[r0 * 3 + 1] - pos[m * 3 + 1], dz = pos[r0 * 3 + 2] - pos[m * 3 + 2];
    if (dx * dx + dy * dy + dz * dz < 1e-10) { v.set(0, 0, 0); for (let i = 0; i <= nu; i++) v.add(new THREE.Vector3(n.getX(r0 + i), n.getY(r0 + i), n.getZ(r0 + i))); v.normalize(); for (let i = 0; i <= nu; i++) n.setXYZ(r0 + i, v.x, v.y, v.z); }
    else mix(r0, r1); }
  return g;
}
function paint(g, fn) { const p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) c.set(fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), i), i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; }
function flipped(g) { g = g.clone(); const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); return g; }
function ctex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; }

// ═══ Giant fantasy mushrooms ═══
// Canvas textures (made once, on first use; builders run in a browser)
function stemTexture() { return ctex(256, 512, (x, w, h) => { const R = rng(11); x.fillStyle = '#bdb4ca'; x.fillRect(0, 0, w, h);
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(120,100,150,0.25)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(90,70,110,0.3)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 800; i++) { const px = R() * w, py = R() * h, len = 40 + R() * 280, dark = R() < 0.55; // vertical fibres; drawn at +-w too so they wrap across the u seam
    x.strokeStyle = dark ? `rgba(92,78,112,${0.1 + R() * 0.24})` : `rgba(246,240,248,${0.12 + R() * 0.32})`; x.lineWidth = 0.6 + R() * 2.2; const dx = (R() - 0.5) * 6;
    for (const o of [0, w, -w]) { x.beginPath(); x.moveTo(px + o, py); x.lineTo(px + o + dx, py + len); x.stroke(); } } }); }
function capTexture() { return ctex(512, 512, (x, w, h) => { const R = rng(23), c = w / 2; x.fillStyle = '#7a3c9c'; x.fillRect(0, 0, w, h);
  const g = x.createRadialGradient(c, c, 0, c, c, c); g.addColorStop(0, '#1f1858'); g.addColorStop(0.5, '#4b2a8a'); g.addColorStop(1, '#6e3a9e'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 140; i++) { const a = R() * TAU, d = Math.sqrt(R()) * c, px = c + Math.cos(a) * d, py = c + Math.sin(a) * d, r = 20 + R() * 40; // darker mottling
    const m = x.createRadialGradient(px, py, 0, px, py, r); m.addColorStop(0, 'rgba(12,6,48,0.22)'); m.addColorStop(1, 'rgba(12,6,48,0)'); x.fillStyle = m; x.fillRect(px - r, py - r, r * 2, r * 2); }
  for (let i = 0; i < 420; i++) { const a = R() * TAU, d = Math.sqrt(R()) * c * 0.98, px = c + Math.cos(a) * d, py = c + Math.sin(a) * d, r = 2.5 + R() * R() * 20, al = 0.4 + R() * 0.5; // pale scales and spots
    x.save(); x.translate(px, py); x.rotate(R() * 3); x.scale(1, 0.7 + R() * 0.3); const m = x.createRadialGradient(0, 0, 0, 0, 0, r); m.addColorStop(0, `rgba(232,222,252,${al})`); m.addColorStop(0.7, `rgba(208,196,240,${al * 0.8})`); m.addColorStop(1, 'rgba(200,190,236,0)');
    x.fillStyle = m; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fill(); x.restore(); }
  for (let i = 0; i < 160; i++) { const a = R() * TAU, r0 = c * (0.7 + R() * 0.25); x.strokeStyle = `rgba(12,6,40,${0.15 + R() * 0.3})`; x.lineWidth = 0.8 + R() * 1.5; // short cracks near the rim
    x.beginPath(); x.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); x.lineTo(c + Math.cos(a + (R() - 0.5) * 0.1) * (r0 - 15 - R() * 40), c + Math.sin(a + (R() - 0.5) * 0.1) * (r0 - 15 - R() * 40)); x.stroke(); } }); }
// gills: radial stripes, u = around, v = 0 at the stem to 1 at the rim (canvas y runs the other way); every other gill is short
function gillTexture(glow) { return ctex(1024, 128, (x, w, h) => { const N = 96, R = rng(5); x.fillStyle = glow ? '#0a4048' : '#12303a'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < N; i++) { const px = (i + 0.5) / N * w, long = i % 2 === 0, y1 = long ? h : h * (0.5 + R() * 0.15), g = x.createLinearGradient(0, 0, 0, h);
    if (glow) { g.addColorStop(0, '#9dfff2'); g.addColorStop(0.6, '#38e8d0'); g.addColorStop(1, '#128c92'); } else { g.addColorStop(0, '#3a6c74'); g.addColorStop(1, '#1a3c48'); }
    x.strokeStyle = g; x.globalAlpha = 0.3; x.lineWidth = long ? 8 : 5.5; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, y1); x.stroke(); // soft halo, then the bright edge
    x.globalAlpha = 0.7 + R() * 0.3; x.lineWidth = long ? 3.6 : 2.4; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, y1); x.stroke(); } }); }
let MM = null;
function mushMats() { if (MM) return MM; const ct = capTexture(), gl = gillTexture(true);
  return MM = {
    stem: new THREE.MeshStandardMaterial({ map: stemTexture(), vertexColors: true, roughness: 0.82 }),
    cap: new THREE.MeshStandardMaterial({ map: ct, roughness: 0.42, emissive: 0x6a46d8, emissiveMap: ct, emissiveIntensity: 0.22 }),
    gill: new THREE.MeshStandardMaterial({ map: gillTexture(false), roughness: 0.8, emissive: 0xffffff, emissiveMap: gl, emissiveIntensity: 1.6 }),
    farBody: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
    farGill: new THREE.MeshStandardMaterial({ color: 0x103038, emissive: 0x30ffe0, emissiveIntensity: 0.9, roughness: 0.8 }) }; }

// One mushroom in unit space, base at (ox, 0, oz). o: sr stem radius, yr cap rim plane height, T dome height above it, Tb curl below it,
// rise how far the underside climbs to the stem, R cap radius, q dome flatness (<1 flatter), lean/ang stem bend, det detail scale.
function shroom(o, lod) {
  const { sr, yr, T, Tb, rise, R, q, lean, ang, seed, ox = 0, oz = 0, det = 1 } = o, hs = yr + rise + 0.012, dx = Math.cos(ang), dz = Math.sin(ang), pale = lod ? [0.55, 0.5, 0.6] : [1, 1, 1];
  const bend = (y) => { const t = Math.max(0, y) / hs; return lean * hs * t * t; };
  const rad = (t) => sr * (1 + 0.8 * Math.exp(-t * 9) + 0.14 * t * t * t - 0.12 * Math.sin(Math.PI * t));
  const N = (a, b, m = 8) => lod ? b : Math.max(m, Math.round(a * det));
  // stem: swollen foot, slight waist, fibrous grooves, leaning
  const stem = surf(N(20, 6), N(20, 4), (u, v) => { const a = u * TAU, y = -0.03 + (hs + 0.03) * v, t = y / hs, ca = Math.cos(a), sa = Math.sin(a);
    const r = rad(Math.max(t, 0)) * (1 + Math.sin(a * 13 + n3(ca * 2 + seed, y * 4, sa * 2) * 6) * 0.04 + (f3(ca * 1.7 + seed, y * 6, sa * 1.7) - 0.5) * 0.14), b = bend(y);
    return [b * dx + r * ca, y, b * dz + r * sa]; }, (u, v) => [u * 3, v]);
  paint(stem, (x, y) => { const t = y / hs, k = lerp(0.45, 1, sst(t, -0.02, 0.22)) * lerp(0.7, 1, 1 - sst(t, 0.8, 1)); return [k * pale[0], k * 0.96 * pale[1], k * 1.05 * pale[2]]; });
  // the ragged ring (annulus): two thin sheets, one facing up and one down, ragged edge, drooping
  const yR = yr + rise - 0.045, rr = rad(yR / hs) * 0.95, Wd = R * 0.32, ringFn = (dy) => (u, v) => { const a = u * TAU, ca = Math.cos(a), sa = Math.sin(a), rag = 0.55 + 0.9 * f3(ca * 3 + seed, 7, sa * 3);
    const r = rr + Wd * v * rag * (1 + 0.15 * Math.sin(a * 9)), y = yR - v * v * Wd * 0.8 * (0.5 + rag * 0.5) + dy, b = bend(y); return [b * dx + r * ca, y, b * dz + r * sa]; };
  const ruv = (u, v) => [u * 3, 0.2 + v * 0.15], rn = N(28, 8), rv = lod ? 1 : 3;
  const ringUp = surf(rn, rv, ringFn(0), ruv, true), ringDn = surf(rn, rv, ringFn(-0.006), ruv, false);
  for (const g of [ringUp, ringDn]) paint(g, () => [0.82 * pale[0], 0.78 * pale[1], 0.84 * pale[2]]);
  // cap: a thick dome whose rim curls under; the underside (gills) is its own surface. lobes and ripples scallop the rim.
  const phiM = Math.PI / 2 + 0.3, cM = -Math.cos(phiM), rin = rad(1) * 0.8;
  const lobe = (a) => 0.05 * Math.sin(5 * a + seed) + 0.035 * Math.sin(9 * a + seed * 2) + (n3(Math.cos(a) * 2 + seed, Math.sin(a) * 2, 0.5) - 0.5) * 0.06;
  const cp = (a, rho, yl) => { const r = R * rho * (1 + lobe(a)), x = r * Math.cos(a), z = r * Math.sin(a), y = yl + T * 0.1 * Math.sin(7 * a + seed * 1.3) * rho ** 3 + T * 0.06 * Math.sin(11 * a + seed * 3.1) * rho ** 3 + 0.012 * Math.sin(23 * a) * rho ** 8 + (f3(x * 7 + seed, 1.3, z * 7) - 0.5) * 0.025; return [x, y, z]; };
  // texture coordinates by distance along the dome from the apex (planar mapping smears the spots into streaks on the steep sides)
  const prof = (v) => { const phi = v * phiM, c = Math.cos(phi); return [R * Math.sin(phi), c >= 0 ? T * c ** q : -Tb * (-c / cM) ** q]; }, arc = [0]; let pp = prof(0);
  for (let i = 1; i <= 64; i++) { const c = prof(i / 64); arc.push(arc[i - 1] + Math.hypot(c[0] - pp[0], c[1] - pp[1])); pp = c; }
  const arcLen = arc[64], arcAt = (v) => { const f = v * 64, i = Math.min(63, Math.floor(f)); return lerp(arc[i], arc[i + 1], f - i); };
  const cap = surf(N(44, 10), N(16, 4), (u, v) => { const phi = v * phiM, c = Math.cos(phi); return cp(u * TAU, Math.sin(phi), yr + (c >= 0 ? T * c ** q : -Tb * (-c / cM) ** q)); },
    (u, v) => { const s = arcAt(v) / arcLen * 0.49, a = u * TAU; return [0.5 + s * Math.cos(a), 0.5 + s * Math.sin(a)]; }, true);
  const under = surf(N(44, 10), N(5, 2, 3), (u, v) => { const w = 1 - v, rho = lerp(rin / R, Math.sin(phiM), v); return cp(u * TAU, rho, yr - Tb + (rise + Tb) * w ** 1.8); }, (u, v) => [u, v]);
  const piv = yr + rise, tilt = Math.atan(2 * lean), bp = bend(piv), M = new THREE.Matrix4().makeTranslation(bp * dx, 0, bp * dz)
    .multiply(new THREE.Matrix4().makeTranslation(0, piv, 0)).multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(dz, 0, -dx), tilt)).multiply(new THREE.Matrix4().makeTranslation(0, -piv, 0));
  cap.applyMatrix4(M); under.applyMatrix4(M);
  const T3 = new THREE.Matrix4().makeTranslation(ox, 0, oz), body = mergeGeometries([stem, ringUp, ringDn]);
  body.applyMatrix4(T3); cap.applyMatrix4(T3); under.applyMatrix4(T3); return { body, cap, under };
}
// the fused foot of the cluster variant: a lumpy mound the stems grow from
function mound(cx, cz, Rm, lod) { const g = surf(lod ? 8 : 18, lod ? 3 : 6, (u, v) => { const a = u * TAU, phi = v * Math.PI / 2, r = Rm * Math.sin(phi) * (1 + (f3(Math.cos(a) * 2 + 9, 1, Math.sin(a) * 2) - 0.5) * 0.35);
    return [cx + r * Math.cos(a), -0.03 + 0.085 * Math.cos(phi) * (0.8 + 0.4 * f3(cx + r * Math.cos(a) * 5, 3, cz + r * Math.sin(a) * 5)), cz + r * Math.sin(a)]; }, (u, v) => [u * 3, v * 0.3], true);
  return paint(g, () => lod ? [0.3, 0.26, 0.34] : [0.5, 0.44, 0.54]); }

const SHROOMS = [
  [{ sr: 0.058, yr: 0.72, T: 0.28, Tb: 0.05, rise: 0.10, R: 0.36, q: 0.8, lean: 0.07, ang: 0.6, seed: 1 }],
  [{ sr: 0.085, yr: 0.78, T: 0.22, Tb: 0.045, rise: 0.07, R: 0.55, q: 0.55, lean: 0.10, ang: 2.2, seed: 2 }],
  [{ sr: 0.055, yr: 0.74, T: 0.26, Tb: 0.05, rise: 0.09, R: 0.30, q: 0.8, lean: 0.05, ang: 0.5, seed: 3 },
   { sr: 0.045, yr: 0.50, T: 0.20, Tb: 0.04, rise: 0.08, R: 0.24, q: 0.8, lean: 0.12, ang: 0.38, seed: 4, ox: 0.30, oz: 0.12, det: 0.75 },
   { sr: 0.04, yr: 0.34, T: 0.16, Tb: 0.035, rise: 0.06, R: 0.19, q: 0.8, lean: 0.14, ang: -2.22, seed: 5, ox: -0.20, oz: -0.26, det: 0.65 }]];
// collision circles per variant: [stem radius, cap radius]; the cluster's stem circle is widened to cover its three stems' foot
export const MUSHROOM_R = [[0.09, 0.36], [0.12, 0.55], [0.2, 0.5]];
export function mushroomParts(v) {
  const M = mushMats(), S = SHROOMS[v];
  const build = (lod) => { const bits = S.map(o => shroom(o, lod)), bodies = bits.map(b => b.body); if (v === 2) bodies.push(mound(0.04, -0.05, 0.36, lod));
    return { body: mergeGeometries(bodies), cap: mergeGeometries(bits.map(b => b.cap)), under: mergeGeometries(bits.map(b => b.under)) }; };
  const nr = build(0), fa = build(1);
  paint(fa.cap, (x, y, z, nx, ny) => { const k = 0.8 + 0.4 * ny; return [0.1 * k, 0.045 * k, 0.3 * k]; });
  const farBody = mergeGeometries([fa.body, fa.cap]);
  return { parts: [{ geo: nr.body, mat: M.stem, cast: true, name: 'mushroom stem' }, { geo: nr.cap, mat: M.cap, cast: true, name: 'mushroom cap' }, { geo: nr.under, mat: M.gill, cast: false, name: 'mushroom gills' }],
    far: [{ geo: farBody, mat: M.farBody, cast: false, name: 'mushroom far' }, { geo: fa.under, mat: M.farGill, cast: false, name: 'mushroom gills far' }] };
}

// ═══ Rock landforms ═══
// Triplanar rock: the repo's rock texture sampled by object-space position (no stretching on steep eroded faces), desaturated so
// the vertex-colour strata carry the hue, with a cheap texture-luminance bump. k = texture repeats per unit-space unit.
const rockMats = {};
function landRock(name, k) { if (rockMats[name]) return rockMats[name]; const m = pbr('terrain/rock', { vc: true, rough: 0.95 }); m.normalMap = null;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vOP; varying vec3 vON;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\nvOP = position * ${k.toFixed(3)}; vON = normal;`);
    sh.fragmentShader = 'varying vec3 vOP; varying vec3 vON;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      vec3 bw = pow(abs(normalize(vON)), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
      vec4 tc = texture2D(map, vOP.zy) * bw.x + texture2D(map, vOP.xz) * bw.y + texture2D(map, vOP.xy) * bw.z;
      float tl = dot(tc.rgb, vec3(0.3, 0.59, 0.11)); tc.rgb = mix(vec3(tl * 1.6), tc.rgb * 1.2, 0.3);
      diffuseColor *= tc;`); };
  m.customProgramCacheKey = () => 'iw-landrock-' + name; m.needsUpdate = true; return rockMats[name] = m; }

// sandstone strata in vertex colour: horizontal bands (resistant pale layers, red-brown soft ones), warped by noise, darker in
// cavities (d < 0) and under overhangs, dusty at the foot. Colours may exceed 1: they multiply a desaturated mid-grey texture.
const PAL = { desert: { lo: [1.0, 0.6, 0.4], mid: [1.4, 1.0, 0.68], hi: [1.8, 1.5, 1.08], dust: [1.7, 1.42, 1.0] }, waste: { lo: [0.82, 0.68, 0.58], mid: [1.12, 0.96, 0.82], hi: [1.4, 1.24, 1.08], dust: [1.35, 1.22, 1.04] } };
function strata(P, x, y, z, ny, d, sd, kf) {
  const yw = y + (n3(x * 2 + sd, y * 1.5, z * 2) - 0.5) * 0.12 / kf, b = n3(yw * 3.3 * kf + sd, sd, 1) * 0.55 + n3(yw * 11 * kf + sd, 2, sd) * 0.3 + n3(yw * 35 * kf, sd, 3) * 0.15;
  const c = [0, 1, 2].map(i => lerp(lerp(P.lo[i], P.mid[i], sst(b, 0.3, 0.5)), P.hi[i], sst(b, 0.62, 0.8)));
  const cl = 0.92 + (n3(x * 6, y * 6, z * 6) - 0.5) * 0.2, dk = clamp(1 + d * 1.1, 0.55, 1.2) * (ny < 0 ? 0.72 + 0.28 * (1 + ny) : 1), du = 1 - sst(y, -0.05, 0.12);
  return c.map((v, i) => lerp(v * cl * dk, P.dust[i] * 0.95, du * 0.6)); }
// ledges: a sawtooth in height that gently slopes out then drops, so weak layers recess
const ledge = (y, w) => { const f = fr(y + w), s = f < 0.85 ? f / 0.85 : (1 - f) / 0.15; return s ** 1.6 - 0.4; };

// ── Natural arch ──
export const ARCH_LEGS = [[-0.85, 0, 0.3], [0.85, 0, 0.3]];
function archGeo(v, nu, nv, pal) {
  const sd = v * 17 + 3, e = v ? 0.55 : 0.9, P = PAL[pal] || PAL.desert, ds = [];
  const path = (t) => { t = clamp(t, 0, 1); const f = Math.PI * t, s = Math.sin(f); return [-0.85 * Math.cos(f) + (v ? 0.08 * s : 0), -0.1 + 1.15 * s ** e]; };
  const disp = (x, y, z) => (f3(x * 3.2 + sd, y * 3.2, z * 3.2) - 0.5) * 0.36 + (f3(x * 7.5, y * 7.5 + 4, z * 7.5 + sd) - 0.5) * 0.16 + (n3(x * 16, y * 16, z * 16) - 0.5) * 0.06
    + ledge(y * 4.6, n3(x * 2, y * 2, z * 2) * 0.5) * 0.2;
  const g = surf(nu, nv, (u, t) => { const [cx, cy] = path(t), [x1, y1] = path(t + 0.003), [x0, y0] = path(t - 0.003), l = Math.hypot(x1 - x0, y1 - y0), tx = (x1 - x0) / l, ty = (y1 - y0) / l, nx = ty, ny = -tx;
    const s = Math.sin(Math.PI * clamp(t, 0, 1)), k = (1 - s) ** 1.5, fl = Math.exp(-(cy + 0.1) * 5), th = v ? 0.19 : 0.22, aLeg = v ? lerp(0.3, 0.24, t) : 0.28;
    const a = lerp(th, aLeg, k) + 0.14 * fl, b = lerp(v ? 0.3 : 0.34, 0.4, (1 - s) ** 1.2) + 0.1 * fl, th2 = u * TAU, sq = (c) => Math.sign(c) * Math.abs(c) ** 0.5, ca = sq(Math.cos(th2)), sa = sq(Math.sin(th2)); // a squarish, slab-like section: rock, not a pipe
    const px = cx + nx * a * ca, py = cy + ny * a * ca, pz = b * sa, d = disp(px, py, pz); ds.push(d);
    return [cx + nx * a * ca * (1 + d), cy + ny * a * ca * (1 + d), b * sa * (1 + d)]; });
  return paint(g, (x, y, z, nx, ny, nz, i) => strata(P, x, y, z, ny, ds[i], sd, 1));
}
export function archParts(v, pal = 'desert') {
  const m = landRock('arch', 5);
  return { parts: [{ geo: archGeo(v, 20, 80, pal), mat: m, cast: true, name: 'arch' }], far: [{ geo: archGeo(v, 8, 26, pal), mat: m, cast: false, name: 'arch far' }] };
}

