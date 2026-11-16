// Caves (#8; Jared, November 15, 2026: docs/decisions/2026-11-15-caves-relics.md): where each cave's inside lies and its shape,
// as data (no Three.js: scripts/worlds.mjs plans them in Node). A cave's mouth stands in its land (src/plan.js places it);
// its inside is built beyond the world's north edge, out of sight of the open world (no sky, no sun), and walking into the
// mouth fades you there (src/caves.js). Inside, src/world.js's groundY answers with the cave's floor, so everything that
// walks, falls, drops loot or flies an arrow works there as outside.
// A cave's inside: one shape made of round-ended tunnels and round chambers (capsules on the ground plan, each with its own
// ceiling height): the mouth chamber, lit from the opening; a winding tunnel; a side room off it (the loot); the back
// chamber (where the boss and the relic will stand, slice 3). Its floor falls gently away from the mouth.
import { HALF, SEED } from './config.js';
import { mulberry32, vnoise } from './noise.js';

// the five kinds, one per land (D1, C1): the foe each surprise brings (D4) and the look caves.js gives it
export const CAVE_KINDS = {
  ice: { biome: 'tundra', names: ['The Ice Cave', 'The Frozen Grotto', 'The Blue Hollow'], foe: 'ice_crawler' },
  fungal: { biome: 'fungal', names: ['The Glowing Cavern', 'The Spore Grotto', 'The Lantern Caps'], foe: 'spider_pale' },
  mine: { biome: 'ruins', names: ['The Old Mine', 'The Deep Shaft', 'The Copper Drift'], foe: 'rat' },
  crystal: { biome: 'desert', names: ['The Crystal Cave', 'The Glass Grotto', 'The Amber Vault'], foe: 'dust_hound' },
  roots: { biome: 'swamp', names: ['The Root Hollow', 'The Drowned Roots', 'The Mire Den'], foe: 'bog_lurker' } };
// (Jared, November 15, 2026: more than one cave in each land: two, three in the two lands a world leans toward. The first of each
// land's is its relic cave (slice 2); the others hold loot and surprises)
export const caves = [];
// the insides lie in a row past the north edge: each in its own 190 m slot, the mouth chamber at the slot's west end
export const CAVE_Z = -HALF - 80, CAVE_Y = 150; // (high enough that no water or ground level counts: groundY there is the cave's)
const SLOT = 190, X0 = -HALF + 40, ROW = 110; // (five insides to a row; a world's later caves take the rows further north)
export const beyond = (z) => z < -HALF - 8; // past the world's edge: only a cave's inside lies there

// capsule distance on the ground plan: how far (x, z) is inside part p (positive inside), and p's ceiling there
function inner(p, x, z) { const dx = p.b[0] - p.a[0], dz = p.b[1] - p.a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((x - p.a[0]) * dx + (z - p.a[1]) * dz) / L2)) : 0;
  const d = Math.hypot(x - p.a[0] - dx * t, z - p.a[1] - dz * t), r = p.ra + (p.rb - p.ra) * t; return { d: r - d, r, h: p.ha + (p.hb - p.ha) * t, dist: d }; }

// the shape of cave i (its kind k): parts, the mouth's opening, the spots its surprises and crates use; deterministic from the seed.
// D6 (Jared, November 15, 2026: "Caves should not always be easy either, some maze like, some big, some long sections ... Boss should
// usually be in a larger 'room' though"): each cave takes a style from the seed: a maze (branching side passages, dead ends holding
// the loot, and a loop back), grand (a run of big chambers), long (one long winding passage), or mixed (half long, a chamber, then
// branches). Every style ends in the large back hall
export const STYLES = ['maze', 'grand', 'long', 'mixed'];
export function layout(i, k, relic = false) { const R = mulberry32(SEED ^ (0xca7e5 + i * 7919)), x0 = X0 + (i % 5) * SLOT, zc = CAVE_Z - Math.floor(i / 5) * ROW, parts = [], ends = [], style = STYLES[Math.floor(R() * 4)];
  const part = (a, b, ra, rb, ha, hb, tag) => { const p = { a, b, ra, rb: rb ?? ra, ha, hb: hb ?? ha, tag }; parts.push(p); return p; };
  const clampZ = (z, r) => Math.max(zc - 42 + r, Math.min(zc + 42 - r, z)), xMax = x0 + SLOT - (relic ? 70 : 34); // (the hall's reach stays in the slot; a relic hall's is wider)
  // the mouth chamber: the opening at its west end
  const mouth = [x0 + 9, zc]; part([x0 + 2, zc], mouth, 3.6, 6.5, 4.2, 6.5, 'mouth');
  let at = mouth; const main = []; // the main way's legs, in order
  const leg = (len, wander, r, h, tag = 'tunnel') => { const to = [Math.min(xMax, at[0] + len), clampZ(at[1] + wander, r)]; const p = part(at, to, r * (0.9 + R() * 0.2), r * (0.9 + R() * 0.2), h + R() * 0.8, h + R() * 0.8, tag); main.push(p); at = to; return p; };
  const room = (r, h) => { const c = [Math.min(xMax, at[0] + r * 0.9), clampZ(at[1] + (R() - 0.5) * 6, r)]; main.push(part(at, c, r * 0.55, r, h * 0.8, h, 'chamber')); at = c; const out = [Math.min(xMax, c[0] + r * 0.6), clampZ(c[1] + (R() - 0.5) * r, r)]; main.push(part(c, out, r * 0.85, r * 0.5, h, h * 0.75, 'chamber')); at = out; };
  // a side passage from (x, z): its own wander, ending in a small room (a dead end: loot) when room is true
  const branch = (from, len, dir, roomy) => { let p = from; const n = 1 + Math.floor(R() * 2); for (let s = 0; s < n; s++) { const to = [Math.max(x0 + 12, Math.min(xMax, p[0] + (R() - 0.4) * len)), clampZ(p[1] + dir * len * (0.6 + R() * 0.4), 3)];
      part(p, to, 2.1 + R() * 0.5, 2.1 + R() * 0.5, 3.4 + R() * 0.6, 3.4 + R() * 0.6, 'neck'); p = to; } if (roomy) { const r = [p[0] + (R() - 0.5) * 6, clampZ(p[1] + dir * 6, 6)]; part(p, r, 3.6, 5.4, 4.4, 5.6, 'side'); p = r; } ends.push(p); return p; };
  if (style === 'long') { for (let n = 0; n < 7; n++) leg(12 + R() * 5, (R() - 0.5) * 22 * (n % 2 ? 1 : -1), 2.5 + R() * 0.4, 4.0); branch(main[3].b, 10, Math.sign(zc - main[3].b[1]) || 1, true); }
  if (style === 'grand') { leg(12 + R() * 4, (R() - 0.5) * 12, 3.0, 4.6); room(7.5 + R() * 1.5, 7.5); leg(10 + R() * 4, (R() - 0.5) * 16, 2.8, 4.4); room(8 + R() * 2, 8.5); leg(9 + R() * 4, (R() - 0.5) * 10, 3.0, 4.6);
    branch(main[1].b, 9, Math.sign(zc - main[1].b[1]) || 1, true); }
  if (style === 'maze') { for (let n = 0; n < 5; n++) leg(11 + R() * 4, (R() - 0.5) * 26, 2.5 + R() * 0.3, 3.9);
    for (const [n, roomy] of [[0, false], [1, true], [2, false], [3, true]]) branch(main[n].b, 9 + R() * 5, R() < 0.5 ? 1 : -1, roomy);
    const a = main[1].b, b = main[3].a, side = Math.sign(zc - (a[1] + b[1]) / 2) || 1, m = [(a[0] + b[0]) / 2, clampZ((a[1] + b[1]) / 2 + side * 14, 3)]; part(a, m, 2.3, 2.3, 3.6, 3.6, 'neck'); part(m, b, 2.3, 2.3, 3.6, 3.6, 'neck'); } // (the loop)
  if (style === 'mixed') { for (let n = 0; n < 3; n++) leg(12 + R() * 4, (R() - 0.5) * 20 * (n % 2 ? 1 : -1), 2.6 + R() * 0.3, 4.2); room(7 + R() * 1.5, 7.5); leg(10 + R() * 4, (R() - 0.5) * 14, 2.6, 4.0);
    branch(main[1].b, 10, R() < 0.5 ? 1 : -1, true); branch(main.at(-1).a, 9, R() < 0.5 ? 1 : -1, false); }
  // the back hall: always large, room to fight (D6)
  // a relic cave's is bigger still (Jared, November 15, 2026: "Relic rooms should be bigger. I don't want these bosses to be small, so
  // there needs to be room to run around, and maybe some side halls to run in and out of"): 16 m across from its middle, a 13 m vault,
  // and three side halls, each out of the hall and back into it (north, south, round the back), too low for a big boss to follow
  const loops = []; let hall;
  if (!relic) { hall = [Math.min(xMax + 18, at[0] + 15), clampZ(zc + (R() - 0.5) * 8, 13)]; part(at, hall, 3.2, 11.5, 4.6, 10, 'hall'); part(hall, [hall[0] + 6, hall[1]], 11.5, 9, 10, 8.5, 'hall'); }
  else { hall = [at[0] + 18, clampZ(zc + (R() - 0.5) * 8, 27)]; const [hx, hz] = hall; part(at, hall, 3.2, 16, 4.6, 13, 'hall'); part(hall, [hx + 8, hz], 16, 14, 13, 11, 'hall');
    for (const pts of [[[hx - 8, hz - 12], [hx - 2, hz - 23], [hx + 10, hz - 22], [hx + 14, hz - 10]], [[hx - 8, hz + 12], [hx - 1, hz + 23], [hx + 11, hz + 22], [hx + 14, hz + 10]],
      [[hx + 19, hz - 7], [hx + 28, hz - 3], [hx + 28, hz + 4], [hx + 19, hz + 7]]]) { for (let n = 1; n < pts.length; n++) part(pts[n - 1], pts[n], 2.8, 2.8, 4.4, 4.4, 'loop'); loops.push({ x: (pts[1][0] + pts[2][0]) / 2, z: (pts[1][1] + pts[2][1]) / 2, way: pts }); } }
  const xs = parts.flatMap(p => [p.a[0] - p.ra, p.b[0] + p.rb]), zs = parts.flatMap(p => [p.a[1] - p.ra, p.a[1] + p.ra, p.b[1] - p.rb, p.b[1] + p.rb]);
  // the surprises: along the main way at about a third, a half and four fifths of it (a long or maze cave one more)
  const along = (f) => { const p = main[Math.min(main.length - 1, Math.floor(f * main.length))]; return mid(p); };
  const traps = [0.3, 0.55, 0.82, ...(style === 'long' || style === 'maze' ? [0.68] : [])].map(f => along(f)).map(([x, z]) => ({ x, z }));
  // the crates: at the dead ends and side rooms (the far one first), and one in the hall
  const crates = [...ends.map(([x, z]) => ({ x, z })), relic ? { x: loops[2].x + 1, z: loops[2].z } : { x: hall[0] + 6, z: hall[1] + 4 }]; // (a relic cave's in the back side hall, to one side of the way through)
  return { i, k, style, x0, parts, mouth: { x: x0 + 3.2, z: zc, in: [x0 + 8, zc] }, hall: { x: hall[0] + (relic ? 4 : 2), z: hall[1] }, loops, traps, crates, main,
    box: [Math.min(...xs) - 2, Math.max(...xs) + 2, Math.min(...zs) - 2, Math.max(...zs) + 2] }; }
const mid = (p) => [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2];

// how far (x, z) is inside cave L (negative outside), and the ceiling's height over the floor there (0 at the wall)
// (the parts blend smoothly where they meet, 1.4 m: no sharp rib of wall juts in where a tunnel joins a chamber; the vault follows the
// part you are deepest in, its curve run from the blended wall)
export function caveDepth(L, x, z) { let d = null, top = null;
  for (const p of L.parts) { const q = inner(p, x, z); if (d === null) d = q.d; else { const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (q.d - d) / 1.4)); d = d + (q.d - d) * h + 1.4 * h * (1 - h); }
    if (!top || q.d > top.d) top = q; }
  const u = Math.min(1, Math.max(0, d) / top.r); return { d, ceil: d > 0 ? top.h * Math.sqrt(1 - (1 - u) ** 2) : 0 }; }
// the floor: falling a metre every 12 m from the mouth, with a gentle unevenness
export const floorOf = (L, x, z) => CAVE_Y - (x - L.x0) / 12 + (vnoise(x * 0.18 + L.i * 31, z * 0.18) - 0.5) * 0.5;
// the cave whose inside holds (x, z), or null
export function caveAt(x, z) { if (!beyond(z)) return null;
  for (const c of caves) { const b = c.L.box; if (x > b[0] && x < b[1] && z > b[2] && z < b[3] && caveDepth(c.L, x, z).d > -1.5) return c; } return null; }
// groundY's answer inside a cave (null elsewhere): src/world.js asks first when z is past the north edge
export function caveFloor(x, z) { const c = caveAt(x, z); return c ? floorOf(c.L, x, z) : null; }
