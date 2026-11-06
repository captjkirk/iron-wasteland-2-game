// Seeded randomness and value noise (same family as IW1's _makeMulberry32).
import { SEED } from './config.js';

export function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const rng = mulberry32(SEED);
export function hash2(x, y) { let h = (x * 374761393 + y * 668265263 + SEED * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function vnoise(x, y) { const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0), b = hash2(x0 + 1, y0), c = hash2(x0, y0 + 1), d = hash2(x0 + 1, y0 + 1);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy; }
export function fbm(x, y, oct = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f + i * 17.3, y * f - i * 9.1); n += a; a *= 0.5; f *= 2.03; } return s / n; }
// Ridged noise: sharp crests, for mountain ranges. 0..1.
export function ridged(x, y, oct = 5) { let s = 0, a = 0.5, f = 1, n = 0, prev = 1;
  for (let i = 0; i < oct; i++) { let r = 1 - Math.abs(vnoise(x * f + i * 31.7, y * f + i * 5.3) * 2 - 1); r *= r; s += a * r * prev; prev = r; n += a; a *= 0.5; f *= 2.1; } return s / n; }
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
