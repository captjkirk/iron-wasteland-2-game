// Caves (#8; Jared, November 15, 2026: docs/decisions/2026-11-15-caves-relics.md): where each cave's inside lies and its shape,
// as data (no Three.js: scripts/worlds.mjs plans them in Node). A cave's mouth stands in its land (src/plan.js places it);
// its inside is built beyond the world's north edge, out of sight of the open world (no sky, no sun), and walking into the
// mouth fades you there (src/caves.js). Inside, src/world.js's groundY answers with the cave's floor, so everything that
// walks, falls, drops loot or flies an arrow works there as outside.
// A cave's inside: one shape made of round-ended tunnels and round chambers (capsules on the ground plan, each with its own
// ceiling height): the mouth chamber, lit from the opening, then a maze of passages and rooms (layout, below); a relic cave's back
// hall (where the boss and the relic stand) past the maze. Its floor falls gently away from the mouth.
import { HALF, SEED } from './config.js';
import { mulberry32, vnoise } from './noise.js';

// the five kinds, one per land (D1, C1): the foe each surprise brings (D4) and the look caves.js gives it
export const CAVE_KINDS = {
  ice: { biome: 'tundra', names: ['The Ice Cave', 'The Frozen Grotto', 'The Blue Hollow'], foe: 'ice_crawler' },
  fungal: {
    biome: 'fungal',
    names: ['The Glowing Cavern', 'The Spore Grotto', 'The Lantern Caps'],
    foe: 'spider_pale',
  },
  mine: { biome: 'ruins', names: ['The Old Mine', 'The Deep Shaft', 'The Copper Drift'], foe: 'rat' },
  crystal: { biome: 'desert', names: ['The Crystal Cave', 'The Glass Grotto', 'The Amber Vault'], foe: 'dust_hound' },
  roots: { biome: 'swamp', names: ['The Root Hollow', 'The Drowned Roots', 'The Mire Den'], foe: 'bog_lurker' },
};
// what each kind of cave's crates hold that nothing outside does (Jared, November 15, 2026, 10:05 PM: "all the loot in the caves seems to
// be ammo... not cool!"): its name and colour. Any of them pays for the bench upgrades that call for cave finds (recipes.js)
export const FINDS = {
  ice: ['frost shard', 0x9ad8ff],
  fungal: ['glow spore', 0x8affc0],
  mine: ['copper ore', 0xd88a50],
  crystal: ['crystal', 0xd8a8ff],
  roots: ['amber', 0xffb540],
};
// (Jared, November 15, 2026: more than one cave in each land: two, three in the two lands a world leans toward. The first of each
// land's is its relic cave (slice 2); the others hold loot and surprises)
export const caves = [];
// the insides lie in a row past the north edge: each in its own 190 m slot, the mouth chamber at the slot's west end
export const CAVE_Z = -HALF - 80,
  CAVE_Y = 150; // (high enough that no water or ground level counts: groundY there is the cave's)
const SLOT = 190,
  X0 = -HALF + 40,
  ROW = 110; // (five insides to a row; a world's later caves take the rows further north)
export const beyond = (z) => z < -HALF - 8; // past the world's edge: only a cave's inside lies there

// capsule distance on the ground plan: how far (x, z) is inside part p (positive inside), and p's ceiling there
function inner(p, x, z) {
  const dx = p.b[0] - p.a[0],
    dz = p.b[1] - p.a[1],
    L2 = dx * dx + dz * dz,
    t = L2 ? Math.max(0, Math.min(1, ((x - p.a[0]) * dx + (z - p.a[1]) * dz) / L2)) : 0;
  const d = Math.hypot(x - p.a[0] - dx * t, z - p.a[1] - dz * t),
    r = p.ra + (p.rb - p.ra) * t;
  return { d: r - d, r, h: p.ha + (p.hb - p.ha) * t, dist: d };
}

// the shape of cave i (its kind k): parts, the mouth's opening, the spots its surprises and crates use; deterministic from the seed.
// A maze to get lost in (Jared, playing Dev, November 15, 2026, 9:30 PM: "I would love it to be a little more maze like though, currently,
// its like short halls with a chest at the end and a clear path to the boss room... I want to be able to get lost"): the passages run
// between the cells of a rough grid, carved as one winding tree (each cell reached once, so most turns lead on and some end blind), with a
// few more openings that make loops; round rooms open at some forks and some blind ends; the crates lie in the blind ends, spread from
// near to far. Every cell can be reached, so the way out can always be found (the mine's rails follow the way in). Only a relic cave has
// an end hall, entered from the far side of the maze (Jared: "only the cave with the boss/artifact should have end room/pedistal"); the
// others end in a small room in the maze's deepest corner with the richest crate. The style (D6) sets the maze's grain: maze (small cells,
// narrow), grand (big cells, wide, many rooms), long (cells stretched east to west: long runs), mixed (between)
export const STYLES = ['maze', 'grand', 'long', 'mixed'];
const GRAIN = {
  maze: { cw: 12, ch: 12, r: 2.3, h: 3.8, rooms: 0.12, loops: 3, run: 0.45 },
  grand: { cw: 15, ch: 15, r: 2.9, h: 4.8, rooms: 0.35, loops: 2, run: 0.55 },
  long: { cw: 17, ch: 11.5, r: 2.4, h: 4.0, rooms: 0.1, loops: 2, run: 0.7 },
  mixed: { cw: 13, ch: 13, r: 2.6, h: 4.2, rooms: 0.22, loops: 3, run: 0.5 },
};
const segD = (x, z, p) => {
  const dx = p.b[0] - p.a[0],
    dz = p.b[1] - p.a[1],
    l2 = dx * dx + dz * dz,
    t = l2 ? Math.max(0, Math.min(1, ((x - p.a[0]) * dx + (z - p.a[1]) * dz) / l2)) : 0;
  return Math.hypot(x - p.a[0] - dx * t, z - p.a[1] - dz * t);
}; // (a point's distance to a part's centre line)
export function layout(i, k, relic = false) {
  const R = mulberry32(SEED ^ (0xca7e5 + i * 7919)),
    x0 = X0 + (i % 5) * SLOT,
    zc = CAVE_Z - Math.floor(i / 5) * ROW,
    parts = [],
    style = STYLES[Math.floor(R() * 4)],
    G = GRAIN[style];
  const part = (a, b, ra, rb, ha, hb, tag) => {
    const p = { a, b, ra, rb: rb ?? ra, ha, hb: hb ?? ha, tag };
    parts.push(p);
    return p;
  };
  const clampZ = (z, r) => Math.max(zc - 42 + r, Math.min(zc + 42 - r, z));
  // the mouth chamber: the opening at its west end
  const mouth = [x0 + 9, zc];
  part([x0 + 2, zc], mouth, 3.6, 6.5, 4.2, 6.5, 'mouth');
  // the grid's cells: from 24 m in to where a relic cave's hall begins (the others as far), rows across up to 34 m each side; each a little off its place
  const gx0 = x0 + 24,
    nx = Math.max(3, Math.floor((x0 + SLOT - 66 - gx0) / G.cw) + 1),
    nz = Math.floor(68 / G.ch) + 1,
    jx = G.cw * 0.15,
    jz = G.ch * 0.15,
    id = (a, b) => a * nz + b;
  const node = [];
  for (let a = 0; a < nx; a++)
    for (let b = 0; b < nz; b++)
      node.push([gx0 + a * G.cw + (R() - 0.5) * 2 * jx, zc - ((nz - 1) * G.ch) / 2 + b * G.ch + (R() - 0.5) * 2 * jz]);
  const nbrs = (u) => {
    const a = Math.floor(u / nz),
      b = u % nz;
    return [
      [a + 1, b],
      [a - 1, b],
      [a, b + 1],
      [a, b - 1],
    ]
      .filter(([p, q]) => p >= 0 && p < nx && q >= 0 && q < nz)
      .map(([p, q]) => id(p, q));
  };
  // carved as a winding tree from the cell by the mouth (from a cell already reached, on to a new neighbour: most often the newest, so
  // passages run on and turn; now and then an older one, so they fork), then a few loops. A relic cave's way in enters its hall from the
  // east side, by the row nearest the hall's middle; the other caves end in their deepest cell. Carved again (up to 150 times, keeping the
  // best) until it is a maze to get lost in: 7 forks or more, 5 blind ends, a way in 1.6 times the straight line with 4 forks on it
  const start = id(0, Math.floor(nz / 2)),
    len = (u, v) => Math.hypot(node[u][0] - node[v][0], node[u][1] - node[v][1]),
    hz = relic ? clampZ(zc + (R() - 0.5) * 8, 27) : 0;
  const rg = relic ? id(nx - 1, Math.max(0, Math.min(nz - 1, Math.round((hz - zc) / G.ch + (nz - 1) / 2)))) : -1;
  if (relic) node[rg][0] = Math.max(...node.filter((_, u) => Math.floor(u / nz) === nx - 1).map((p) => p[0])) + 1; // (the cell into the hall is the one nearest it; moved before the maze is carved and scored, so the way in it scores is the way the cave has: gap-194)
  const carve = () => {
    const adj = node.map(() => new Set()),
      seen = new Set([start]),
      live = [start],
      join = (u, v) => {
        adj[u].add(v);
        adj[v].add(u);
      };
    while (live.length) {
      const j = R() < G.run ? live.length - 1 : Math.floor(R() * live.length),
        u = live[j],
        open = nbrs(u).filter((v) => !seen.has(v));
      if (!open.length) {
        live.splice(j, 1);
        continue;
      }
      const v = open[Math.floor(R() * open.length)];
      seen.add(v);
      join(u, v);
      live.push(v);
    }
    for (let n = 0, t = 0; n < G.loops && t < 200; t++) {
      const u = Math.floor(R() * node.length),
        o = nbrs(u).filter((v) => !adj[u].has(v));
      if (!o.length || u === start) continue;
      join(u, o[Math.floor(R() * o.length)]);
      n++;
    }
    // how far each cell is from the mouth along the passages, and the way back from it
    const dist = node.map(() => Infinity),
      prev = node.map(() => -1),
      done = new Set();
    dist[start] = 0;
    for (;;) {
      let u = -1;
      for (let j = 0; j < node.length; j++)
        if (!done.has(j) && dist[j] < Infinity && (u < 0 || dist[j] < dist[u])) u = j;
      if (u < 0) break;
      done.add(u);
      for (const v of adj[u])
        if (dist[u] + len(u, v) < dist[v]) {
          dist[v] = dist[u] + len(u, v);
          prev[v] = u;
        }
    }
    const goal = relic ? rg : node.reduce((b, _, j) => (dist[j] > dist[b] ? j : b), start);
    const deg = (u) => adj[u].size + (u === start ? 1 : 0),
      forks = node.filter((_, u) => deg(u) >= 3).length,
      blind = node.filter((_, u) => deg(u) === 1 && u !== goal).length;
    let choices = 0;
    for (let j = prev[goal]; j >= 0 && j !== start; j = prev[j]) if (deg(j) >= 3) choices++;
    const ratio =
      (dist[goal] + Math.hypot(node[start][0] - mouth[0], node[start][1] - mouth[1])) /
      Math.max(
        1,
        Math.hypot(node[goal][0] - mouth[0], node[goal][1] - mouth[1]),
      ); /* (measured as the worlds check measures it) */
    const score = Math.min(forks / 7, blind / 5, choices / 4, ratio / 1.6);
    return { adj, dist, prev, goal, score };
  };
  let M = carve();
  for (let t = 0; t < 150 && M.score < 1; t++) {
    const m = carve();
    if (m.score > M.score) M = m;
  }
  const { adj, dist, prev, goal } = M;
  let hall = null;
  const loops = [];
  if (relic) hall = [node[goal][0] + G.cw * 0.5 + 22, hz];
  const way = [];
  for (let j = goal; j >= 0; j = prev[j]) way.unshift(j);
  const onWay = new Set(way.slice(1).map((v, n) => [way[n], v].sort().join()));
  // the passages: the way in is a tunnel (the mine lays its rails along it), the rest are necks
  // (a relic cave's way in is wide and tall the whole way, 6.4 m by 5.5 m and more, so its boss can come out after you: D10, "they would
  // need to be mobile!")
  const wide = (r) => (relic ? Math.max(3.2, r) : r),
    tall = (h) => (relic ? Math.max(5.5, h) : h);
  part(mouth, node[start], wide(G.r * 1.15), wide(G.r), tall(G.h + 0.4), tall(G.h), 'tunnel');
  for (const [u, set] of adj.entries())
    for (const v of set)
      if (u < v) {
        const w = onWay.has([u, v].sort().join()),
          ra = G.r * (0.9 + R() * 0.2),
          rb = G.r * (0.9 + R() * 0.2),
          ha = G.h + R() * 0.8,
          hb = G.h + R() * 0.8;
        part(
          node[u],
          node[v],
          w ? wide(ra) : ra,
          w ? wide(rb) : rb,
          w ? tall(ha) : ha,
          w ? tall(hb) : hb,
          w ? 'tunnel' : 'neck',
        );
      }
  // round rooms at some forks and blind ends (kept off the next passage: a room never opens a way the maze does not have)
  const roomed = new Set(),
    room = (u, r, h, tag) => {
      roomed.add(u);
      const [x, z] = node[u],
        clear = Math.min(
          ...parts
            .filter((p) => p.a !== node[u] && p.b !== node[u])
            .map((p) => segD(x, z, p) - Math.max(p.ra, p.rb) - 1.8),
        );
      /* (rock of 1.8 m and more to every passage and room it does not open on: salt-stag-50's long cave, rows 11.5 m apart, had a 5 m room 8 m from a relic way 3.2 m wide) */ part(
        [x, z],
        [x, z],
        Math.max(G.r, Math.min(r, clear, 41 - Math.abs(z - zc))),
        undefined,
        h,
        undefined,
        tag,
      );
    };
  if (!relic) room(goal, 5.5, 6.2, 'end');
  for (const u of node.keys())
    if (u !== start && u !== goal && adj[u].size && R() < G.rooms && !nbrs(u).some((v) => roomed.has(v)))
      room(u, G.r * 2.1, G.h * 1.5, adj[u].size === 1 ? 'side' : 'chamber');
  if (relic) {
    const [hx, hz] = hall;
    part(node[goal], hall, 3.2, 16, 4.6, 13, 'hall');
    part(hall, [hx + 8, hz], 16, 14, 13, 11, 'hall');
    // a relic cave's hall (Jared, November 15, 2026: "Relic rooms should be bigger. I don't want these bosses to be small, so there needs
    // to be room to run around, and maybe some side halls to run in and out of"): 16 m across from its middle, a 13 m vault, and three side
    // halls, each out of the hall and back into it (north, south, round the back), too low for a big boss to follow
    for (const pts of [
      [
        [hx - 8, hz - 12],
        [hx - 2, hz - 23],
        [hx + 10, hz - 22],
        [hx + 14, hz - 10],
      ],
      [
        [hx - 8, hz + 12],
        [hx - 1, hz + 23],
        [hx + 11, hz + 22],
        [hx + 14, hz + 10],
      ],
      [
        [hx + 19, hz - 7],
        [hx + 28, hz - 3],
        [hx + 28, hz + 4],
        [hx + 19, hz + 7],
      ],
    ]) {
      for (let n = 1; n < pts.length; n++) part(pts[n - 1], pts[n], 2.8, 2.8, 4.4, 4.4, 'loop');
      loops.push({ x: (pts[1][0] + pts[2][0]) / 2, z: (pts[1][1] + pts[2][1]) / 2, way: pts });
    }
  }
  const xs = parts.flatMap((p) => [p.a[0] - p.ra, p.b[0] + p.rb]),
    zs = parts.flatMap((p) => [p.a[1] - p.ra, p.a[1] + p.ra, p.b[1] - p.rb, p.b[1] + p.rb]);
  // the way in, leg by leg from the mouth (the walk test walks it; the surprises wait along it at about a third, a half and four fifths, a maze or long cave one more)
  const main = [
    { a: mouth, b: node[start] },
    ...way.slice(1).map((v, n) => ({ a: node[way[n]], b: node[v] })),
    ...(relic ? [{ a: node[goal], b: hall }] : []),
  ];
  const traps = [0.3, 0.55, 0.82, ...(style === 'long' || style === 'maze' ? [0.68] : [])]
    .map((f) => mid(main[Math.min(main.length - 1, Math.floor(f * main.length))]))
    .map(([x, z]) => ({ x, z }));
  // the crates: in up to four blind ends, spread from the nearest to the farthest; the last, the richest, in the end room (a relic cave's in its back side hall)
  const blind = [...node.keys()]
      .filter((u) => adj[u].size === 1 && u !== start && u !== goal)
      .sort((u, v) => dist[u] - dist[v]),
    m = Math.min(4, blind.length);
  const crates = [
    ...Array.from({ length: m }, (_, j) => node[blind[m < 2 ? 0 : Math.round((j * (blind.length - 1)) / (m - 1))]]).map(
      ([x, z]) => ({ x, z }),
    ),
    relic ? { x: loops[2].x + 1, z: loops[2].z } : { x: node[goal][0] + 1.5, z: node[goal][1] + 1 },
  ];
  const end = relic ? { x: hall[0] + 4, z: hall[1] } : { x: node[goal][0], z: node[goal][1] };
  return {
    i,
    k,
    style,
    x0,
    parts,
    mouth: { x: x0 + 3.2, z: zc, in: [x0 + 8, zc] },
    end,
    hall: relic ? end : null,
    loops,
    traps,
    crates,
    main,
    box: [Math.min(...xs) - 2, Math.max(...xs) + 2, Math.min(...zs) - 2, Math.max(...zs) + 2],
  };
}
const mid = (p) => [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2];

// how far (x, z) is inside cave L (negative outside), and the ceiling's height over the floor there (0 at the wall)
// (the parts blend smoothly where they meet, 1.4 m: no sharp rib of wall juts in where a tunnel joins a chamber; the vault follows the
// part you are deepest in, its curve run from the blended wall)
// (a maze has many parts and the floor, walls and creatures ask often: each 4 m square keeps the parts that come within 11 m of it, and
// is asked first; a part left out is so far off that it changes nothing where the answer matters, more than 8 m into the rock)
const NEAR = new WeakMap();
function partsNear(L, x, z) {
  let g = NEAR.get(L);
  if (!g) {
    g = new Map();
    NEAR.set(L, g);
    for (const p of L.parts) {
      const r = Math.max(p.ra, p.rb) + 11;
      for (
        let gx = Math.floor((Math.min(p.a[0], p.b[0]) - r) / 4);
        gx <= Math.floor((Math.max(p.a[0], p.b[0]) + r) / 4);
        gx++
      )
        for (
          let gz = Math.floor((Math.min(p.a[1], p.b[1]) - r) / 4);
          gz <= Math.floor((Math.max(p.a[1], p.b[1]) + r) / 4);
          gz++
        ) {
          const k = gx * 100003 + gz;
          if (!g.has(k)) g.set(k, []);
          g.get(k).push(p);
        }
    }
  }
  return g.get(Math.floor(x / 4) * 100003 + Math.floor(z / 4));
}
export function caveDepth(L, x, z) {
  const list = partsNear(L, x, z);
  if (list) {
    const q = depthIn(list, x, z);
    if (q.d > -8) return q;
  }
  return depthIn(L.parts, x, z);
}
function depthIn(parts, x, z) {
  let d = null,
    top = null;
  for (const p of parts) {
    const q = inner(p, x, z);
    if (d === null) d = q.d;
    else {
      const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (q.d - d)) / 1.4));
      d = d + (q.d - d) * h + 1.4 * h * (1 - h);
    }
    if (!top || q.d > top.d) top = q;
  }
  const u = Math.min(1, Math.max(0, d) / top.r);
  return { d, ceil: d > 0 ? top.h * Math.sqrt(1 - (1 - u) ** 2) : 0 };
}
// the floor: falling a metre every 12 m from the mouth, with a gentle unevenness
export const floorOf = (L, x, z) => CAVE_Y - (x - L.x0) / 12 + (vnoise(x * 0.18 + L.i * 31, z * 0.18) - 0.5) * 0.5;
// the cave whose inside holds (x, z), or null
export function caveAt(x, z) {
  if (!beyond(z)) return null;
  for (const c of caves) {
    const b = c.L.box;
    if (x > b[0] && x < b[1] && z > b[2] && z < b[3] && caveDepth(c.L, x, z).d > -1.5) return c;
  }
  return null;
}
// groundY's answer inside a cave (null elsewhere): src/world.js asks first when z is past the north edge
export function caveFloor(x, z) {
  const c = caveAt(x, z);
  return c ? floorOf(c.L, x, z) : null;
}
