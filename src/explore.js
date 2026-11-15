// Fog of war, first part (issue #19): the game remembers which 32 m squares of the world this computer's player has been
// near, and the fog's reach follows it: over ground nobody has seen it closes in to about a fifth of its usual reach, over
// seen ground it opens back out. The memory lives in this game only (nothing is saved or sent; co-op sharing, the map
// and the compass are the rest of #19).
import { HALF } from './config.js';

const CELL = 32, SEEN_R = 56, N = Math.ceil(2 * HALF / CELL), cells = new Uint8Array(N * N);
const ix = v => Math.floor((v + HALF) / CELL), at = (x, z) => { const i = ix(x), j = ix(z); return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i; };
let count = 0, k = 0, floor = 0.2, seenR = SEEN_R; // (floor, seenR: slice 23, the radio tower lifts them) // k: how much of the ground 90 to 220 m round the player is seen (0 to 1), eased
export const resetExplored = () => { cells.fill(0); count = 0; k = 1; floor = 0.2; seenR = SEEN_R; };
// the radio tower's reward (slice 23, IW1: it doubled the fog's reveal radius): the fog over unseen ground lifts halfway, and
// the ground seen round a player reaches twice as far
export const liftFog = () => { floor = 0.6; seenR = SEEN_R * 2; }; // k = 1: the menu shows full reach, so a new game eases in from it (no pop)
// the player is at (x, z): every square within SEEN_R of them is now seen
export function markExplored(x, z) {
  for (let dz = -seenR; dz <= seenR; dz += CELL / 2) for (let dx = -seenR; dx <= seenR; dx += CELL / 2) {
    if (dx * dx + dz * dz > seenR * seenR) continue; const c = at(x + dx, z + dz); if (c >= 0 && !cells[c]) { cells[c] = 1; count++; } }
}
// the fog's reach multiplier at (x, z): 0.2 over unseen ground up to 1 over seen ground (sampled on three rings round the player)
export function fogReach(x, z, dt) {
  let s = 0, n = 0; for (const r of [90, 150, 220]) for (let a = 0; a < 8; a++) { const c = at(x + Math.cos(a * Math.PI / 4) * r, z + Math.sin(a * Math.PI / 4) * r); if (c >= 0) { s += cells[c]; } n++; }
  const t = s / n; k += (t - k) * Math.min(1, dt * 1.5); return floor + (1 - floor) * k; // eased over a second or two, so it opens as you walk
}
export const exploredStats = { floor: () => floor, count: () => count, has: (x, z) => { const c = at(x, z); return c >= 0 && cells[c] === 1; } };
