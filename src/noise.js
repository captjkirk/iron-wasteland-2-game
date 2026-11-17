// Seeded randomness and value noise (same family as IW1's _makeMulberry32).
import { SEED } from './config.js';

export function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rng = mulberry32(SEED);
export function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263 + SEED * 1442695041) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, y) {
  const x0 = Math.floor(x),
    y0 = Math.floor(y),
    fx = x - x0,
    fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0),
    b = hash2(x0 + 1, y0),
    c = hash2(x0, y0 + 1),
    d = hash2(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c + (d - c) * sx - (a + (b - a) * sx)) * sy;
}
export function fbm(x, y, oct = 4) {
  let s = 0,
    a = 0.5,
    f = 1,
    n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f + i * 17.3, y * f - i * 9.1);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}
// Ridged noise: sharp crests, for mountain ranges. 0..1.
export function ridged(x, y, oct = 5) {
  let s = 0,
    a = 0.5,
    f = 1,
    n = 0,
    prev = 1;
  for (let i = 0; i < oct; i++) {
    let r = 1 - Math.abs(vnoise(x * f + i * 31.7, y * f + i * 5.3) * 2 - 1);
    r *= r;
    s += a * r * prev;
    prev = r;
    n += a;
    a *= 0.5;
    f *= 2.1;
  }
  return s / n;
}
export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
// small seeded 3D value noise (rock shapes in propmodels.js, landmarks.js)
export function h3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
export function n3(x, y, z) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z),
    xf = x - xi,
    yf = y - yi,
    zf = z - zi,
    u = xf * xf * (3 - 2 * xf),
    v = yf * yf * (3 - 2 * yf),
    w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t,
    c = (i, j, k) => h3(xi + i, yi + j, zi + k);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}
export const f3 = (x, y, z) =>
  n3(x, y, z) * 0.55 + n3(x * 2.1 + 5, y * 2.1, z * 2.1) * 0.3 + n3(x * 4.3, y * 4.3 + 3, z * 4.3) * 0.15;
