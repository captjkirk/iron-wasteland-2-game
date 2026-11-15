// House kinds (slice 36, #68 and #71). Jared, November 14, 2026, on the porches seen on Dev: "the porches don't look like they are
// actually touching structurally and also just adding a porch doesn't make a house interesting or unique. I feel like there needs
// to start with like 10 different kinds of houses, whether they are multiple stories or by levels or split levels or different
// layouts or whatever, and then we can plan on them being different levels of destroyed." And: "at least some houses should be more
// than a single room." Ten kinds, each its own footprint, floors and rooms, at real scale (a storey 2.9 m floor to floor, doors
// 1.2 by 2.15 m, stairs of 18.5 cm risers on 27 cm treads): the farmhouse, the split-level, the L-shaped ranch, the A-frame
// cabin, the row of three houses, the shop with a flat above, the stilt house, the adobe courtyard house, the tall townhouse and
// the trailer. Every floor and stair is walked on (surfaces), every outside door has its step or stoop, a porch hangs off a ledger
// bolted to the wall and stands on posts on piers, and the rooms are furnished with scanned props (buildings.js's KITS) placed
// against the walls clear of doors, windows and stairs. Their plan (where they stand, their footprints) is plan.js's; damage
// levels come later, with Jared (#68 part 2). Random worlds only: the classic world keeps its houses.
import * as THREE from 'three';
import { box, gAt, collideRun, surface, wall, cache, kitRoom, kit, ladders, bar, hangLamp, stock, shelfAt, mats } from './buildings.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxUV } from './propmodels.js';
import { colliders } from './props.js';
import { toW } from './plan.js';
import { canvasTex } from './propmodels.js';

export const F = 2.9; // a storey, floor to floor
const RISE = 0.185, TREAD = 0.27, DIRS = { x: [1, 0], '-x': [-1, 0], z: [0, 1], '-z': [0, -1] };
// a number in [0, 1) from a place in a house: whole-number arithmetic only, so every computer (and browser) in a co-op game builds
// the same rooms (a sine-based hash can differ in its last bits between engines, and these choose furniture that is solid)
const hash = (b, x, z, k = 0) => { let h = Math.imul(Math.round(x * 100), 73856093) ^ Math.imul(Math.round(z * 100), 19349663) ^ Math.imul(Math.round(b.seed * 1000), 83492791) ^ Math.imul(Math.round(k * 100), 668265263);
  h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const since = (n0, o) => { for (let i = n0; i < colliders.length; i++) for (const k in o) if (o[k] !== undefined) colliders[i][k] = o[k]; };
const rng = (f) => { let s = Math.floor(f * 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const bag = () => new Proxy({}, { get: (o, k) => (o[k] ||= []) });

// ── what wall() adds in a kind's openings ──────────────────────────────────────────────────────────────────────────────
// a window: its frame in the opening, the sill standing proud outside with head and side trim, two sashes and four panes of
// glass (one window in four has lost a pane or two)
export function dressWindow(b, P, x, z, ux, uz, y0, y1, w, o) { const t = b.t || 0.3, nx = uz, nz = -ux, along = Math.abs(ux) > 0.5, h = y1 - y0, ym = (y0 + y1) / 2;
  const bx = (k, a, hh, d, off, y, n = 0) => box(P, k, along ? a : d, hh, along ? d : a, x + ux * off + nx * n, y, z + uz * off + nz * n);
  const rv = o.reveal || 'beam'; bx(rv, w, 0.05, t, 0, y1 - 0.025); bx(rv, w, 0.05, t, 0, y0 + 0.025); for (const s of [-1, 1]) bx(rv, 0.06, h, t, s * (w / 2 - 0.03), ym); // (the reveal: wood in a frame wall, the wall's own plaster in a masonry one)
  if (o.ext && o.stone) { const out = t / 2; bx('concrete', w + 0.3, 0.09, 0.2, 0, y0 - 0.04, out + 0.05); bx('concrete', w + 0.36, 0.24, 0.06, 0, y1 + 0.12, out + 0.02); } // (masonry: a stone sill and lintel)
  else if (o.ext) { const out = t / 2; bx('beam', w + 0.24, 0.06, 0.18, 0, y0 - 0.02, out + 0.05); bx('beam', w + 0.24, 0.13, 0.05, 0, y1 + 0.065, out + 0.025);
    for (const s of [-1, 1]) bx('beam', 0.08, h + 0.06, 0.045, s * (w / 2 + 0.07), ym, out + 0.022); }
  const r = hash(b, x, z + y0); bx('beam', w - 0.1, 0.05, 0.06, 0, ym); bx('beam', 0.045, h - 0.08, 0.05, 0, ym);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { if (r < 0.25 && hash(b, x + sx, z + sy, y0) < 0.5) continue; bx('pane', w / 2 - 0.08, h / 2 - 0.07, 0.012, sx * w / 4, ym + sy * h / 4); } }
// a doorway: its casing on both faces and the threshold; the door itself (planks) swung open into the room against its jamb
// (a third of the inside doorways have lost theirs)
export function dressDoor(b, P, x, z, ux, uz, y0, q, o) { const t = b.t || 0.3, nx = uz, nz = -ux, along = Math.abs(ux) > 0.5, w = q.w, hg = q.hgt;
  const bx = (k, a, hh, d, off, y, n = 0) => box(P, k, along ? a : d, hh, along ? d : a, x + ux * off + nx * n, y, z + uz * off + nz * n);
  for (const n of [t / 2 + 0.02, -(t / 2 + 0.02)]) { bx('beam', w + 0.22, 0.11, 0.04, 0, y0 + hg + 0.055, n); for (const s of [-1, 1]) bx('beam', 0.11, hg, 0.04, s * (w / 2 + 0.055), y0 + hg / 2, n); }
  bx('beam', w, 0.04, t, 0, y0 + 0.02);
  if (q.leaf === false || (!o.ext && hash(b, x, z, 7) < 0.35)) return;
  const lw = w - 0.1, px = x + ux * (w / 2 - 0.04) - nx * (t / 2 + lw / 2), pz = z + uz * (w / 2 - 0.04) - nz * (t / 2 + lw / 2);
  box(P, 'beam', along ? 0.05 : lw, hg - 0.06, along ? lw : 0.05, px, y0 + hg / 2, pz); // (a ledged door: its boards and three ledges across them on the room side)
  for (const y of [0.25, 1.05, 1.85]) box(P, 'planks', along ? 0.03 : lw - 0.1, 0.12, along ? lw - 0.1 : 0.03, px - nx * 0 + (along ? (ux > 0 ? 1 : -1) * 0.04 : 0), y0 + y, pz + (along ? 0 : (uz > 0 ? 1 : -1) * 0.04));
  box(P, 'iron', along ? 0.07 : 0.05, 0.05, along ? 0.05 : 0.07, px - ux * 0.04 - nx * (lw / 2 - 0.08), y0 + 1.0, pz - uz * 0.04 - nz * (lw / 2 - 0.08)); } // its handle

// ── the builder's kit: a kind is written with these, in its own frame (x across, -z its front) ───────────────────────
function mk(b, P, g) { const t = b.t, H = { b, P, g, wins: [], segs: [], rooms: [], occ: [], holes: [], decks: [], put: kitRoom(b) };
  b.stairs = []; b.inner = []; b.floors = [];
  H.D = (c, w = 1.2, hgt = 2.15, y0 = 0, o = {}) => ({ type: 'door', c, w, hgt, y0, ...o });
  H.W = (c, w = 1.0, ...gaps) => ({ type: 'window', c, w, gaps: gaps.length ? gaps : [[0.9, 2.05]] });
  H.W2 = (c, w = 1.0, lv = 0) => H.W(c, w, [lv + 0.9, lv + 2.05], [lv + F + 0.9, lv + F + 2.05]);
  H.WU = (c, w = 1.0, lv = F) => H.W(c, w, [lv + 0.9, lv + 2.05]);
  // a wall along an axis, its holes placed at absolute positions along it (c), o as wall()'s
  H.wall = (k, x0, z0, x1, z1, h, holes = [], o = {}) => { const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, along = Math.abs(ux) > 0.5, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const hs = holes.map(q => ({ ...q, at: along ? (q.c - mx) * ux : (q.c - mz) * uz }));
    { const r = hs.map(q => [q.c - q.w / 2, q.c + q.w / 2]).sort((p, q) => p[0] - q[0]); for (let i = 1; i < r.length; i++) if (r[i][0] < r[i - 1][1] + 0.05) console.error(`house ${b.style}: two openings overlap in a wall at ${r[i][0].toFixed(2)} (a window over a door goes in the door's gaps)`); } // (a mechanical check: the screenshot check fails on any console error)
    for (const q of hs) if (q.type === 'window') for (const [g0, g1] of q.gaps) H.wins.push({ along, line: along ? mz : mx, c: q.c, w: q.w, y0: (o.lv || 0) + g0 });
    H.segs.push({ along, line: along ? mz : mx, a0: Math.min(along ? x0 : z0, along ? x1 : z1), a1: Math.max(along ? x0 : z0, along ? x1 : z1), y0: o.lv || 0, y1: (o.lv || 0) + h }); // (where real walls stand: furniture goes only against these)
    wall(b, P, k, x0, z0, x1, z1, h, hs, { stone: k === 'brick' || k === 'wall', reveal: k === 'brick' || k === 'wall' ? 'inwall' : k === 'adobe' ? 'adobe' : 'beam', ...o }); };
  // the outside walls round a polygon (corners in order: along the front (-z) first, so every wall's outward side is its
  // (uz, -ux)); holes[i] are edge i's; o.skip lists edges another part builds; lined inside with o.line (plaster)
  H.out = (k, pts, h, holes = {}, o = {}) => { for (let i = 0; i < pts.length; i++) { if (o.skip?.includes(i)) continue; const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length], L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
    H.wall(k, x0 - ux * t / 2, z0 - uz * t / 2, x1 + ux * t / 2, z1 + uz * t / 2, h, holes[i] || [], { ext: !o.inner?.includes(i), line: o.line === undefined ? 'inwall' : o.line, lv: o.lv || 0, stone: o.stone }); } }; // (o.inner: edges shared with another wing, inside walls)
  // an inside wall between two walls' inner faces, standing on the floor at lv
  H.part = (x0, z0, x1, z1, lv, h, holes = [], k = 'inwall') => H.wall(k, x0, z0, x1, z1, h, holes, { lv });
  const inR = (r, x, z) => x >= r[0] && x <= r[1] && z >= r[2] && z <= r[3];
  // a floor at lv over rects [x0, x1, z0, z1] less holes (stairwells): boards on a 22 cm slab you stand on; o.plinth: the
  // foundation under it, stone from below the ground up to the floor (its rects grown to the walls' outer faces)
  H.floor = (rects, lv, o = {}) => { const holes = o.holes || [], Y = b.y + lv, th = o.th ?? 0.22, k = o.k || 'planks';
    for (const r of rects) { const xs = [...new Set([r[0], r[1], ...holes.flatMap(h => [h[0], h[1]]).filter(v => v > r[0] && v < r[1])])].sort((p, q) => p - q);
      const zs = [...new Set([r[2], r[3], ...holes.flatMap(h => [h[2], h[3]]).filter(v => v > r[2] && v < r[3])])].sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) { const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2; if (holes.some(h => inR(h, cx, cz))) continue;
        box(P, k, xs[i + 1] - xs[i], 0.05, zs[j + 1] - zs[j], cx, Y - 0.025, cz); if (lv > 0.5 && !o.plinth) box(P, 'ceil', xs[i + 1] - xs[i], th - 0.05, zs[j + 1] - zs[j], cx, Y - 0.05 - (th - 0.05) / 2, cz); }
      if (o.plinth) { const e = o.plinth === true ? t / 2 : o.plinth, y0 = (b.ground ?? b.y) - 0.5; box(P, o.pk || 'wall', r[1] - r[0] + 2 * e, Y - 0.05 - y0, r[3] - r[2] + 2 * e, (r[0] + r[1]) / 2, (Y - 0.05 + y0) / 2, (r[2] + r[3]) / 2); } }
    for (const h of holes) H.holes.push([...h, lv]);
    surface(b, (lx, lz) => rects.some(r => inR(r, lx, lz)) && !holes.some(h => inR(h, lx, lz)) ? Y : null); if (lv > 0.5) b.floors.push(lv); };
  // a straight flight of stairs from its first riser at (x, z), climbing along d ('x', '-x', 'z', '-z'), w wide, from lv0 to lv1;
  // solid blocks to o.base (open treads on stringers with o.open), a handrail and a solid side (a collider from the flight's foot
  // to 1 m over its top, so no one walks in under it or falls off its open side) on o.sides (+1 or -1, across = (-dz, dx))
  H.stair = (x, z, d, w, lv0, lv1, o = {}) => { const [dx, dz] = DIRS[d], ax = -dz, az = dx, n = Math.max(2, Math.round((lv1 - lv0) / RISE)), r = (lv1 - lv0) / n, run = (n - 1) * TREAD, Y = b.y + lv0, k = o.k || 'planks';
    const at = (s, c) => [x + dx * s + ax * c, z + dz * s + az * c], AX = Math.abs(dx) > 0.5;
    for (let i = 1; i < n; i++) { const [cx, cz] = at((i - 0.5) * TREAD, 0), top = Y + i * r, hg = o.open ? 0.05 : top - (o.base ?? Y) + 0.02;
      box(P, k, AX ? TREAD + 0.03 : w, hg, AX ? w : TREAD + 0.03, cx, top - hg / 2, cz); if (!o.open) box(P, 'beam', AX ? 0.03 : w, Math.min(hg, r), AX ? w : 0.03, cx - dx * TREAD / 2, top - Math.min(hg, r) / 2, cz - dz * TREAD / 2); }
    if (o.open) for (const s of [-1, 1]) { const [x0, z0] = at(-0.05, s * (w / 2 - 0.04)), [x1, z1] = at(run + 0.05, s * (w / 2 - 0.04)); bar(P, 'beam', x0, Y - 0.15, z0, x1, Y + (n - 1) * r - 0.1, z1, 0.06); }
    surface(b, (lx, lz) => { const s = (lx - x) * dx + (lz - z) * dz, c = (lx - x) * ax + (lz - z) * az; if (Math.abs(c) > w / 2 + 0.05 || s < 0 || s > run + (o.lip ?? 0.45)) return null;
      return s >= run ? Y + n * r : Y + Math.min(n - 1, Math.floor(s / TREAD) + 1) * r; }, { climb: 0.75 });
    for (const s of o.sides ?? [-1, 1]) { const [x0, z0] = at(0, s * w / 2), [x1, z1] = at(run + (o.landing || 0), s * w / 2), n0 = colliders.length; collideRun(b, x0, z0, x1, z1, 0.1);
      since(n0, { top: Y + n * r + 1, stand: Y + n * r + 1, bot: lv0 > 0.5 ? Y - 0.05 : undefined });
      if (lv1 > 0.5 && !o.open && o.rail !== false) { const [r0, q0] = at(Math.max(0, run - 2.4), s * w / 2), [r1, q1] = at(run, s * w / 2); for (let f = 0; f <= 1.001; f += 0.25) box(P, 'beam', 0.06, 1.0, 0.06, r0 + (r1 - r0) * f, Y + n * r + 0.5, q0 + (q1 - q0) * f); bar(P, 'beam', r0, Y + n * r + 0.95, q0, r1, Y + n * r + 0.95, q1, 0.07); } // (the floor's own rail along the stairwell's edge, its last stretch up top)
      if (o.rail !== false) { const [a0, c0] = at(0.1, s * (w / 2 - 0.05)), [a1, c1] = at(run + (o.landing || 0) - 0.05, s * (w / 2 - 0.05)); bar(P, 'beam', a0, Y + r + 0.9, c0, a1, Y + n * r + 0.9, c1, 0.06);
        for (let q = 0.1; q <= run + (o.landing || 0); q += 0.9) { const [px, pz] = at(q, s * (w / 2 - 0.05)), y = Y + (q >= run ? n : Math.min(n - 1, Math.floor(q / TREAD) + 1)) * r; box(P, 'beam', 0.06, 0.9, 0.06, px, y + 0.45, pz); } } }
    const [ax0, az0] = at(-0.9, 0), [ax1, az1] = at(run + (o.landing ? o.landing / 2 + 0.1 : 0.9), 0); // (the top: on the floor past it, or its landing's middle)
    if (o.check !== false) b.stairs.push({ a: [ax0, az0], lv0, z: [ax1, az1], lv1 });
    H.occ.push([Math.min(ax0, ax1) - (AX ? 0 : w / 2), Math.max(ax0, ax1) + (AX ? 0 : w / 2), Math.min(az0, az1) - (AX ? w / 2 : 0), Math.max(az0, az1) + (AX ? w / 2 : 0), lv0, lv1]);
    return { run, n, r }; };
  // a railing (posts, handrail, mid rail) along a floor's edge at lv: solid to a walker on that floor, passed under from below
  H.rail = (x0, z0, x1, z1, lv, k = 'beam') => { const Y = b.y + lv, L = Math.hypot(x1 - x0, z1 - z0), n0 = colliders.length; collideRun(b, x0, z0, x1, z1, 0.1);
    since(n0, { top: Y + 1, stand: Y + 1, bot: lv > 0.5 ? Y - 0.05 : undefined });
    for (const y of [0.95, 0.5]) bar(P, k, x0, Y + y, z0, x1, Y + y, z1, y > 0.9 ? 0.07 : 0.045);
    const m = Math.max(1, Math.round(L / 0.12)); for (let i = 0; i <= m; i++) { const f = i / m, big = i % 8 === 0 || i === m; box(P, k, big ? 0.08 : 0.035, big ? 1.0 : 0.45, big ? 0.08 : 0.035, x0 + (x1 - x0) * f, Y + (big ? 0.5 : 0.725), z0 + (z1 - z0) * f); } };
  // a gable roof: its ridge len long along axis ('x' or 'z') over the middle of a span-wide body whose walls' tops are at lv, rh
  // high; tiles on boarding, fascia, barge boards, a ridge cap, gutters and downpipes; the gable ends in the wall's own k at ends
  // (o.over: the eaves' overhang, or [the -v side's, the +v side's]: a roof that dies into a taller wing's wall stops at its face)
  H.gable = (cx, cz, len, span, lv, rh, axis, k, o = {}) => { const R = bag(), Q = bag(), D = span / 2 + t / 2, ovs = Array.isArray(o.over) ? o.over : [o.over ?? 0.45, o.over ?? 0.45], top = b.y + lv, sl = Math.atan2(rh, D), ow = len + t + (o.endOver ?? 0.7);
    const hv = (s) => D + ovs[(s + 1) / 2], half = Math.max(hv(-1), hv(1));
    for (const s of [-1, 1]) { const ov = ovs[(s + 1) / 2], hs = D + ov, L = hs / Math.cos(sl), yE = top - ov * rh / D, ym = (yE + top + rh) / 2 + 0.07, zm = s * hs / 2;
      box(R, o.roofK || 'roof', ow, 0.14, L, 0, ym, zm, 0, s * sl); box(R, 'ceil', len - t, 0.03, Math.max(0.2, L - 0.6), 0, ym - 0.12, zm * 0.95, 0, s * sl);
      if (ov < 0.1) continue; // (no eave on a side that stops at a wall)
      box(R, 'beam', ow, 0.22, 0.045, 0, yE - 0.03, s * (hs + 0.03));
      for (const e of [-1, 1]) box(R, 'beam', 0.05, 0.24, L, e * (ow / 2 + 0.02), ym - 0.02, zm, 0, s * sl);
      if (o.gutter !== false) { R.iron.push(new THREE.CylinderGeometry(0.075, 0.075, ow, 8, 1, true, Math.PI, Math.PI).rotateZ(Math.PI / 2).translate(0, yE - 0.12, s * (hs + 0.11)));
        for (const e of o.spouts ?? [-1, 1]) { const xe = e * (len / 2 + t / 2 + 0.08), zw = s * (D + 0.08), yt = yE - 0.45; // (a downpipe: from the gutter's end, a swan neck in to the wall, down it to the ground)
          R.iron.push(new THREE.CylinderGeometry(0.045, 0.045, yt - b.y + 0.3, 8).translate(xe, (yt + b.y - 0.3) / 2, zw)); bar(R, 'iron', xe, yt, zw, xe, yE - 0.14, s * (hs + 0.11), 0.09); for (let y = b.y + 0.6; y < yt; y += 1.6) box(R, 'iron', 0.12, 0.03, 0.1, xe, y, zw - s * 0.03); } } }
    box(R, o.roofK || 'roof', ow + 0.05, 0.16, 0.32, 0, top + rh + 0.12, 0);
    const tri = new THREE.Shape([new THREE.Vector2(-D, 0), new THREE.Vector2(D, 0), new THREE.Vector2(0, rh)]);
    for (const s of o.ends ?? [-1, 1]) Q[k].push(new THREE.ExtrudeGeometry(tri, { depth: t, bevelEnabled: false }).rotateY(Math.PI / 2).translate(s * len / 2 - t / 2, top, 0));
    const rot = axis === 'z' ? Math.PI / 2 : 0, mv = (from, into) => { for (const key in from) for (const q of from[key]) into[key].push(q.rotateY(rot).translate(cx, 0, cz)); };
    mv(R, b.PR); mv(Q, P);
    surface(b, (lx, lz) => { const u = axis === 'z' ? cz - lz : lx - cx, v = axis === 'z' ? lx - cx : lz - cz; return Math.abs(u) <= ow / 2 && Math.abs(v) <= hv(Math.sign(v) || 1) ? top + rh * (1 - Math.abs(v) / D) + 0.16 : null; }); };
  // a flat roof over rects at lv (its top lv + 0.25), lifted off with the roof in the cut-away; walked on
  H.flat = (rects, lv, k = 'concrete') => { for (const r of rects) box(b.PR, k, r[1] - r[0] + t, 0.25, r[3] - r[2] + t, (r[0] + r[1]) / 2, b.y + lv + 0.125, (r[2] + r[3]) / 2);
    surface(b, (lx, lz) => rects.some(r => lx >= r[0] - t / 2 && lx <= r[1] + t / 2 && lz >= r[2] - t / 2 && lz <= r[3] + t / 2) ? b.y + lv + 0.25 : null); };
  // a chimney stack from below the ground to top (above the floor), with its cap and two pots
  H.chimney = (x, z, sx, sz, top, k = 'brick', from = null) => { const y0 = from == null ? (b.ground ?? b.y) - 0.4 : b.y + from, y1 = b.y + top; box(P, k, sx, y1 - y0, sz, x, (y0 + y1) / 2, z); box(P, 'concrete', sx + 0.14, 0.12, sz + 0.14, x, y1 + 0.06, z);
    for (const s of [-1, 1]) P.iron.push(new THREE.CylinderGeometry(0.09, 0.11, 0.4, 10).translate(x + (sx > sz ? s * sx / 4 : 0), y1 + 0.32, z + (sx > sz ? 0 : s * sz / 4))); };
  // a porch on the front (-z) of a wall whose outer face is at z1: its deck from x0 to x1 and out to z0 at lv (touching the sill),
  // boards on joists between a ledger bolted to the wall and a rim on the posts; posts on stone piers carry a beam, rafters run
  // from a second ledger on the wall at roof[0] down over the beam (at roof[1]) to the eave, under a sheet of o.roofK; railings
  // round its edge and its steps down at steps.c
  H.porch = (o) => { const Y = b.y + o.lv, mx = (o.x0 + o.x1) / 2, W = o.x1 - o.x0, zb = o.z0 + 0.15, yb = b.y + o.roof[1], yl = b.y + o.roof[0], k = o.roofK || 'roof';
    box(P, 'planks', W, 0.05, o.z1 - o.z0, mx, Y - 0.025, (o.z0 + o.z1) / 2); box(P, 'beam', W, 0.26, 0.08, mx, Y - 0.18, o.z0 + 0.04); box(P, 'beam', W, 0.22, 0.08, mx, Y - 0.16, o.z1 - 0.04);
    for (let x = o.x0 + 0.1; x < o.x1; x += 0.6) box(P, 'beam', 0.06, 0.2, o.z1 - o.z0 - 0.12, x, Y - 0.15, (o.z0 + o.z1) / 2);
    for (const x of o.posts) { const g0 = gAt(b, x, zb); if (Y - 0.3 > g0 - 0.3) box(P, 'wall', 0.34, Y - 0.3 - g0 + 0.4, 0.34, x, (Y - 0.3 + g0 - 0.4) / 2, zb);
      box(P, 'beam', 0.16, yb - Y + 0.3, 0.16, x, (yb + Y - 0.3) / 2, zb); collideRun(b, x, zb, x, zb, 0.13);
      for (const s of [-1, 1]) if (x + s * 0.6 > o.x0 && x + s * 0.6 < o.x1) bar(P, 'beam', x, yb - 0.55, zb, x + s * 0.55, yb, zb, 0.07); }
    box(P, 'beam', W + 0.3, 0.24, 0.18, mx, yb + 0.12, zb); box(P, 'beam', W, 0.22, 0.09, mx, yl - 0.11, o.z1 - 0.045);
    const ze = o.z0 - 0.4, sl = (yl - yb - 0.24) / (o.z1 - zb), ye = yb + 0.24 - sl * (zb - ze), a = Math.atan2(yl - ye, o.z1 - ze), Lr = Math.hypot(yl - ye, o.z1 - ze);
    for (let x = o.x0 + 0.05; x <= o.x1; x += 0.6) bar(P, 'beam', x, yl - 0.05, o.z1 - 0.05, x, ye, ze, 0.07);
    box(P, k, W + 0.5, 0.06, Lr + 0.1, mx, (yl + ye) / 2 + 0.08, (o.z1 + ze) / 2, 0, -a); box(P, 'iron', W + 0.5, 0.03, 0.22, mx, yl + 0.12, o.z1 - 0.06, 0, -a * 0.5); // the sheet, its flashing on the wall
    box(P, 'beam', W + 0.5, 0.18, 0.04, mx, ye - 0.02, ze - 0.02);
    surface(b, (lx, lz) => lx >= o.x0 && lx <= o.x1 && lz >= o.z0 && lz <= o.z1 + 0.05 ? Y : null); H.decks.push([o.x0, o.x1, o.z0, o.z1 + 0.3]);
    const st = o.steps; let g = gAt(b, st.c, o.z0 - 0.4) - b.y, n = Math.round((o.lv - g) / RISE); for (let k = 0; k < 3; k++) { g = Math.min(g, gAt(b, st.c, o.z0 - n * TREAD - 0.3) - b.y); n = Math.round((o.lv - g) / RISE); }
    for (const [xa, xb] of [[o.x0 + 0.1, st.c - st.w / 2], [st.c + st.w / 2, o.x1 - 0.1]]) if (xb - xa > 0.3) H.rail(xa, zb, xb, zb, o.lv);
    for (const x of [o.x0 + 0.08, o.x1 - 0.08]) H.rail(x, zb, x, o.z1 - 0.2, o.lv);
    if (n >= 2) H.stair(st.c, o.z0 - (n - 1) * TREAD, 'z', st.w, o.lv - n * ((o.lv - g) / n), o.lv, { base: b.y + g - 0.3, check: false }); };
  // a stoop up to each outside door that stands above the ground outside it (not one on a porch or a landing)
  H.stoops = () => { for (const d of b.doors) { const px = d.lx + d.nx * (t / 2 + 0.6), pz = d.lz + d.nz * (t / 2 + 0.6); if (H.decks.some(r => inR(r, px, pz))) continue;
    let g = gAt(b, px, pz) - b.y, n = Math.round((d.lv - g) / RISE); for (let k = 0; k < 3; k++) { g = Math.min(g, gAt(b, d.lx + d.nx * (t / 2 + n * TREAD + 0.3), d.lz + d.nz * (t / 2 + n * TREAD + 0.3)) - b.y); n = Math.round((d.lv - g) / RISE); } // (its foot on the ground where the stoop ends: on a slope that is lower)
    if (n < 2) continue; const run = (n - 1) * TREAD, dir = Math.abs(d.nx) > 0.5 ? (d.nx > 0 ? '-x' : 'x') : (d.nz > 0 ? '-z' : 'z');
    const sx = d.lx + d.nx * (t / 2 + run), sz = d.lz + d.nz * (t / 2 + run); H.stair(sx, sz, dir, d.w + 0.5, d.lv - n * ((d.lv - g) / n), d.lv, { base: b.y + g - 0.3, k: 'concrete', check: false, rail: n > 3 }); } };
  // furniture: put(k, x, lv, z, ry) stands one (solid when it is big), a room is furnished when the house is done
  // (its foot on the floor: a mesh whose lowest point is above or below its origin is set down onto it; b.items records where each went)
  H.item = (k, x, lv, z, ry = 0, o = {}) => { const bb = box3(k), s = o.s || 1; H.put(k, x, b.y + lv + (o.dy ?? -bb.min.y * s), z, ry, o);
    const W = (bb.max.x - bb.min.x) * s, Dp = (bb.max.z - bb.min.z) * s, hg = (bb.max.y - bb.min.y) * s, c0 = Math.cos(ry), s0 = Math.sin(ry), hx = Math.abs(c0) * W / 2 + Math.abs(s0) * Dp / 2, hz = Math.abs(s0) * W / 2 + Math.abs(c0) * Dp / 2;
    const cxm = x + (bb.min.x + bb.max.x) / 2 * s * c0 + (bb.min.z + bb.max.z) / 2 * s * s0, czm = z - (bb.min.x + bb.max.x) / 2 * s * s0 + (bb.min.z + bb.max.z) / 2 * s * c0;
    (b.items ||= []).push({ k, lv, box: [cxm - hx, cxm + hx, czm - hz, czm + hz], solid: o.solid !== false && o.dy == null }); if (o.solid !== false && o.dy == null) H.occ.push([cxm - hx, cxm + hx, czm - hz, czm + hz, lv, lv]);
    if (o.flue) H.P.iron.push(new THREE.CylinderGeometry(0.085, 0.085, o.flue - hg + 0.35, 10).translate(cxm, b.y + lv + (hg + o.flue + 0.35) / 2, czm)); // (a stove's pipe from its top up through the ceiling)
    if (o.solid === false) return; if (hg < 0.4 || Math.max(W, Dp) < 0.6) return;
    const c = Math.cos(ry), sn = Math.sin(ry), lx = (bb.min.x + bb.max.x) / 2 * s, lz = (bb.min.z + bb.max.z) / 2 * s, mx = x + lx * c + lz * sn, mz = z - lx * sn + lz * c, rr = Math.max(0.21, Math.min(0.35, Math.min(W, Dp) / 2));
    const long = W >= Dp, ex = (Math.max(W, Dp) / 2 - rr), vx = long ? c : sn, vz = long ? -sn : c, n0 = colliders.length;
    collideRun(b, mx - vx * ex, mz - vz * ex, mx + vx * ex, mz + vz * ex, rr, () => b.y + lv + hg); since(n0, { bot: lv > 0.5 ? b.y + lv - 0.05 : undefined }); };
  H.room = (type, x0, x1, z0, z1, lv, o = {}) => H.rooms.push({ type, x0, x1, z0, z1, lv, o });
  H.cache = (x, z, lv) => { const n0 = colliders.length; cache(b, g, x, z, null, { y: b.y + lv }); since(n0, { bot: lv > 0.5 ? b.y + lv - 0.05 : undefined }); /* (upstairs: the floor below walks on under it) */ H.occ.push([x - 0.8, x + 0.8, z - 0.8, z + 0.8, lv, lv]); };
  H.done = () => { H.stoops(); const n0 = b.group.children.length; furnish(H); H.put.done(); b.inside = new THREE.Group(); b.group.add(b.inside); b.inside.add(...b.group.children.slice(n0, -1)); // (its furniture in a group of its own: drawn only up close, buildings.js tickBuildings)
    b.rooms = H.rooms.map(r => ({ type: r.type, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, lv: r.lv })); }; // (rooms: the checks' pictures stand in them)
  return H; }
// a kitchen counter (made here, not scanned): a run of cupboards 1.8 m long with doors and drawers, a worn top, an enamel sink set in it
function counterKit() { const K = kit(); if (K.counter) return; const T = bag(), add = (k, sx, sy, sz, x, y, z) => box(T, k, sx, sy, sz, x, y, z);
  add('planks', 1.8, 0.82, 0.58, 0, 0.45, -0.01); add('beam', 1.86, 0.06, 0.64, 0, 0.89, 0.01); add('beam', 1.8, 0.1, 0.5, 0, 0.05, 0.03);
  for (const x of [-0.6, 0, 0.6]) { add('beam', 0.54, 0.5, 0.02, x, 0.4, 0.28); add('beam', 0.54, 0.14, 0.02, x, 0.76, 0.28); add('iron', 0.1, 0.02, 0.03, x, 0.76, 0.3); add('iron', 0.02, 0.1, 0.03, x + 0.2, 0.45, 0.3); }
  add('concrete', 0.55, 0.03, 0.4, 0.45, 0.905, 0.0); add('iron', 0.5, 0.16, 0.36, 0.45, 0.84, 0.0); add('iron', 0.03, 0.25, 0.03, 0.45, 1.02, -0.2); add('iron', 0.03, 0.03, 0.15, 0.45, 1.13, -0.13);
  const M = mats(), one = (ks) => boxUV(mergeGeometries(ks.flatMap(k => T[k].map(q => q.toNonIndexed()))), 1.2);
  K.counter = { geo: one(['planks', 'beam']), mat: M.planks }; K.sink = { geo: one(['iron', 'concrete']), mat: M.iron }; } // (two meshes: the woodwork and the sink and its tap)
const box3 = (k) => { const g = kit()[k].geo; if (!g.boundingBox) g.computeBoundingBox(); return g.boundingBox; };

// ── furnishing: each room gets its pieces against its walls (their backs to the wall, facing in), clear of every doorway (1.1 m
// each side), window (anything taller than a sill), stair and its landings, and of each other; a table in the open middle ──
const SETS = { living: ['sofa', 'coffee', 'armchair', 'bookshelf', 'rocker', 'clock', 'lamp'], bedroom: ['bed', 'nightstand', 'cabinet', 'chair', 'crate'],
  kitchen: ['counter', 'cabinet', 'shelves', 'table'], dining: ['dining', 'cabinet', 'clock', 'lamp'], den: ['sofa', 'coffee', 'bookshelf', 'armchair'],
  store: ['shelves', 'crate', 'crate1', 'bench', 'jerry'], garage: ['shelves', 'table', 'jerry', 'jerry', 'crate'], study: ['desk', 'chair', 'bookshelf', 'armchair', 'clock'] };
function furnish(H) { const { b } = H, doors = [...b.doors, ...b.inner];
  for (const R of H.rooms) { const occ = H.occ.filter(o => R.lv >= o[4] - 0.3 && R.lv <= o[5] + 0.3).map(o => o.slice(0, 4)), put = [];
    for (const d of doors) if (Math.abs(d.lv - R.lv) < 0.7) { const along = Math.abs(d.nz) > 0.5, a = d.w / 2 + 0.25; occ.push(along ? [d.lx - a, d.lx + a, d.lz - 1.1, d.lz + 1.1] : [d.lx - 1.1, d.lx + 1.1, d.lz - a, d.lz + a]); } // (a clear lane through every doorway, 1.1 m each side of it)
    for (const h of H.holes) if (Math.abs(h[4] - R.lv) < 0.3) occ.push([h[0] - 0.3, h[1] + 0.3, h[2] - 0.3, h[3] + 0.3]);
    const free = (r) => r[0] >= R.x0 - 0.01 && r[1] <= R.x1 + 0.01 && r[2] >= R.z0 - 0.01 && r[3] <= R.z1 + 0.01 && !occ.some(o => r[0] < o[1] && r[1] > o[0] && r[2] < o[3] && r[3] > o[2]);
    const winOn = (side, c0, c1) => H.wins.some(w => Math.abs(w.y0 - R.lv - 0.9) < 0.6 && w.along === (side === '-z' || side === '+z') && Math.abs(w.line - ({ '-z': R.z0, '+z': R.z1, '-x': R.x0, '+x': R.x1 })[side]) < 0.45 && c0 < w.c + w.w / 2 + 0.1 && c1 > w.c - w.w / 2 - 0.1);
    const sides = ['-z', '+z', '-x', '+x'].filter(s => !(R.o.no || []).includes(s));
    // a side with a real wall behind the whole piece (an open side, the edge of a stair or the open end of a room, has none)
    const backed = (side, c0, c1) => { const ax = side === '-z' || side === '+z', e = { '-z': R.z0, '+z': R.z1, '-x': R.x0, '+x': R.x1 }[side];
      return H.segs.some(q => q.along === ax && Math.abs(q.line - e) < 0.45 && q.a0 <= c0 + 0.05 && q.a1 >= c1 - 0.05 && q.y0 <= R.lv + 0.1 && q.y1 >= R.lv + 1.0); };
    // against a wall: the first spot along it, from its middle out, that is free; it returns where it went
    const onWall = (k, o = {}) => { const bb = box3(k), W = bb.max.x - bb.min.x, Dp = bb.max.z - bb.min.z, hg = bb.max.y - bb.min.y, mxl = (bb.min.x + bb.max.x) / 2;
      for (const s of o.side ? [o.side] : sides) { const ax = s === '-z' || s === '+z', a0 = ax ? R.x0 : R.z0, a1 = ax ? R.x1 : R.z1, mid = o.near ?? (a0 + a1) / 2;
        for (let i = 0; i < 40; i++) { const c = mid + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.2; if (c - W / 2 < a0 || c + W / 2 > a1) continue;
          const r = s === '-z' ? [c - W / 2, c + W / 2, R.z0, R.z0 + Dp + 0.03] : s === '+z' ? [c - W / 2, c + W / 2, R.z1 - Dp - 0.03, R.z1] : s === '-x' ? [R.x0, R.x0 + Dp + 0.03, c - W / 2, c + W / 2] : [R.x1 - Dp - 0.03, R.x1, c - W / 2, c + W / 2];
          if (!free(r) || (hg > 0.85 && !o.low && winOn(s, c - W / 2, c + W / 2)) || !backed(s, c - W / 2, c + W / 2)) continue;
          const [x, z, ry] = s === '-z' ? [c - mxl, R.z0 + 0.03 - bb.min.z, 0] : s === '+z' ? [c + mxl, R.z1 - 0.03 + bb.min.z, Math.PI] : s === '-x' ? [R.x0 + 0.03 - bb.min.z, c + mxl, Math.PI / 2] : [R.x1 - 0.03 + bb.min.z, c - mxl, -Math.PI / 2];
          occ.push(r); H.item(k, x, R.lv, z, ry, o); const p = { k, x, z, ry, side: s, c, r }; put.push(p); return p; } } return null; };
    // a table in the open, chairs round it: the free spot nearest the room's middle with room for the chairs
    const centre = (k, chairs) => { const bb = box3(k), cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2, e = chairs ? 0.55 : 0.35, pts = [], turn = (R.x1 - R.x0 < R.z1 - R.z0) !== (bb.max.x - bb.min.x < bb.max.z - bb.min.z), W = turn ? bb.max.z - bb.min.z : bb.max.x - bb.min.x, Dp = turn ? bb.max.x - bb.min.x : bb.max.z - bb.min.z, ry0 = turn ? Math.PI / 2 : 0; // (long side along the room's)
      for (let dx = -3; dx <= 3; dx += 0.25) for (let dz = -3; dz <= 3; dz += 0.25) pts.push([cx + dx, cz + dz]); pts.sort((p, q) => Math.hypot(p[0] - cx, p[1] - cz) - Math.hypot(q[0] - cx, q[1] - cz));
      for (const [x, z] of pts) { const r = [x - W / 2 - e, x + W / 2 + e, z - Dp / 2 - e, z + Dp / 2 + e]; if (!free(r)) continue; occ.push(r); H.item(k, x, R.lv, z, ry0);
        if (chairs) for (const [sx, sz, ry] of chairs === 4 ? [[0, -1, 0], [0, 1, Math.PI], [-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2]] : [[0, -1, 0], [0, 1, Math.PI]]) H.item('chair', x + sx * (W / 2 + 0.28), R.lv, z + sz * (Dp / 2 + 0.28), ry + (hash(b, x, z, sx + sz * 3) - 0.5) * 0.4, { solid: false });
        return true; } return false; };
    const lamp = () => { if (R.o.ceil) hangLamp(H.put, (R.x0 + R.x1) / 2, b.y + R.lv + R.o.ceil - 0.05, (R.z0 + R.z1) / 2, b.y + R.lv, Math.max(0.4, Math.min(1, (R.o.ceil - 0.05 - 2.1) / 1.25))); }; // (the quality pass: the radio shack's 1.25 m drop hung a house's bulb at chest height in the room's middle; scaled, its bulb hangs 2.1 m up)
    for (const k of R.o.set || SETS[R.type]) {
      if (k === 'lamp') lamp();
      else if (k === 'coffee') { const s = put.find(p => p.k === 'sofa'); if (!s) continue; const bb = box3('coffee'), n = { '-z': [0, 1], '+z': [0, -1], '-x': [1, 0], '+x': [-1, 0] }[s.side], o = 0.95 + (bb.max.z - bb.min.z) / 2;
        const x = s.x + n[0] * o, z = s.z + n[1] * o, W = bb.max.x - bb.min.x, Dp = bb.max.z - bb.min.z, r = n[0] ? [x - Dp / 2, x + Dp / 2, z - W / 2, z + W / 2] : [x - W / 2, x + W / 2, z - Dp / 2, z + Dp / 2]; if (free(r)) { occ.push(r); H.item('coffee', x, R.lv, z, s.ry); } }
      else if (k === 'nightstand') { const s = put.find(p => p.k === 'bed' || p.k === 'bed2'); if (s) onWall('nightstand', { side: s.side, near: s.c + 1.35 }) || onWall('nightstand', { side: s.side, near: s.c - 1.35 }); }
      else if (k === 'clock') { const bb = box3('clock'); for (const s of sides) { const ax = s === '-z' || s === '+z', c = ax ? (R.x0 + R.x1) / 2 + 0.6 : (R.z0 + R.z1) / 2 + 0.6; if (!backed(s, c - 0.2, c + 0.2) || winOn(s, c - 0.3, c + 0.3) || doors.some(d => Math.hypot(d.lx - (ax ? c : s === '-x' ? R.x0 : R.x1), d.lz - (ax ? (s === '-z' ? R.z0 : R.z1) : c)) < 1.2)) continue;
        const [x, z, ry] = s === '-z' ? [c, R.z0 + 0.01, 0] : s === '+z' ? [c, R.z1 - 0.01, Math.PI] : s === '-x' ? [R.x0 + 0.01, c, Math.PI / 2] : [R.x1 - 0.01, c, -Math.PI / 2]; H.item('clock', x, R.lv, z, ry, { dy: 1.95 - bb.min.y, solid: false }); break; } }
      else if (k === 'table' || k === 'dining') { if (!centre(k, k === 'dining' ? 4 : 2) && k === 'dining') centre('table', 2); } // (a room too tight for the long table gets the small one)
      else if (k === 'desk') onWall('desk', { low: true }) && null;
      else if (k === 'bed') { onWall(hash(b, R.x0, R.z0, R.lv) < 0.75 ? 'bed2' : 'bed', { low: true }) || onWall('bed', { low: true }); } // (most beds a bedstead with its head to the wall, some the daybed)
      else if (k === 'counter') { const p = onWall('counter', { low: true }); if (p) { const sv = onWall('stove', { low: true, side: p.side, near: p.c + 1.3 }) || onWall('stove', { low: true, side: p.side, near: p.c - 1.3 }); if (sv) H.put('pot', sv.x, b.y + R.lv + 0.86, sv.z, sv.ry); H.put('sink', p.x, b.y + R.lv, p.z, p.ry); } }
      else { const lo = { low: ['bed', 'sofa', 'nightstand', 'stove', 'bench', 'chair', 'crate', 'crate1', 'jerry', 'bucket', 'armchair', 'rocker', 'coffee', 'cabinet'].includes(k), flue: k === 'heater' ? R.o.ceil ?? (b.style === 'courtyard' ? 3.2 : b.style === 'stilt' ? 2.5 : F - 0.22) : 0 }, p = (k === 'heater' && R.o.heat && onWall(k, { ...lo, side: R.o.heat })) || onWall(k, lo);
        if (p && k === 'shelves') stock(H.put, shelfAt(p.x, b.y + R.lv, p.z, p.ry), [1, 2], rng(hash(b, p.x, p.z)), 0.45);
        if (p && k === 'stove') H.put('pot', p.x + Math.sin(p.ry) * 0.05, b.y + R.lv + 0.86, p.z + Math.cos(p.ry) * 0.05, p.ry); } } } }

// the old one-room house's porch (#17), rebuilt the kinds' way: its deck at the floor against the front wall either side of the door
export function porchOn(b, P, g) { const H = mk(b, P, g), zf = -b.d / 2 - (b.t || 0.45) / 2;
  H.porch({ x0: -1.75, x1: 1.75, z0: zf - 1.9, z1: zf, lv: 0, roof: [Math.min(2.65, b.h - 0.2), 2.3], posts: [-1.6, 1.6], steps: { c: 0, w: 1.4 } }); }

// ── the ten kinds ──────────────────────────────────────────────────────────────────────────────────────────────────────
const EAVES = { farmhouse: 2 * F, splitlevel: 5.4, ranch: 2.7, aframe: 6.8, rowhouses: 2 * F, shop: 2 * F, stilt: 2.5, courtyard: 3.2, townhouse: 3 * F, trailer: 2.25 }; // (its walls' height: above it you are on its roof)
export function buildKind(b, P, g) { counterKit(); b.t = b.style === 'courtyard' ? 0.5 : b.style === 'trailer' ? 0.2 : 0.3; b.h = EAVES[b.style]; b.roofBox = { cx: b.cx, cz: b.cz, w: b.w, d: b.d }; const H = mk(b, P, g); KIND[b.style](H, b); H.done(); }
const KIND = {
  // 1. Two-storey farmhouse: a centre hall with the stair, parlour and kitchen on one side, the living room with its stove under
  // the chimney on the other, three rooms upstairs; weatherboard over a stone footing, a porch the width of the front
  farmhouse(H, b) { const { D, W2, WU, W } = H, top = 2 * F;
    H.out('planks', [[-5, -4.2], [5, -4.2], [5, 4.2], [-5, 4.2]], top, { 0: [D(0), W2(-3.2), W2(3.2), WU(-1.3, 0.8), WU(1.3, 0.8)], 1: [W2(-2.2), W2(2.2)], 2: [D(2.6), W2(3.9, 0.9), W2(-3.2), W2(0)], 3: [W2(-1.9), W2(1.9)] });
    H.floor([[-5, 5, -4.2, 4.2]], 0, { plinth: true });
    H.part(-1.6, -4.05, -1.6, 4.05, 0, F, [D(-2.4)]); H.part(1.6, -4.05, 1.6, 4.05, 0, F, [D(-2.4), D(2.9)]); H.part(1.75, 0.3, 4.85, 0.3, 0, F, [D(3.3)]);
    H.stair(0.75, 2.3, '-z', 1.4, 0, F, { sides: [-1] }); // (climbing to the front: across -1 is -x, its open side)
    H.floor([[-4.85, 4.85, -4.05, 4.05]], F, { holes: [[0.05, 1.45, -1.75, 2.3]] }); H.rail(0.05, 2.3, 1.45, 2.3, F);
    H.part(-1.6, -4.05, -1.6, 4.05, F, F, [D(-2.6)]); H.part(1.6, -4.05, 1.6, 4.05, F, F, [D(-2.6), D(3.0)]); H.part(1.75, 0.3, 4.85, 0.3, F, F);
    H.floor([[-4.85, 4.85, -4.05, 4.05]], top, { k: 'ceil', th: 0.12 }); b.floors.pop();
    H.gable(0, 0, 10, 8.4, top, 2.6, 'x', 'planks'); H.chimney(-5.45, 0, 0.6, 1.1, top + 3.4);
    H.porch({ x0: -5.15, x1: 5.15, z0: -6.6, z1: -4.35, lv: 0, roof: [3.2, 2.7], posts: [-4.95, -1.6, 1.6, 4.95], steps: { c: 0, w: 2.0 } });
    H.item('heater', -4.85 + 0.48 + 0.03, 0, 0, Math.PI / 2, { flue: F - 0.22 }); // (the stove against the chimney wall)
    H.room('living', -4.85, -1.75, -4.05, 4.05, 0, { ceil: F - 0.22, set: ['sofa', 'coffee', 'armchair', 'bookshelf', 'rocker', 'clock', 'lamp'] }); H.room('dining', 1.75, 4.85, -4.05, 0.15, 0, { ceil: F - 0.22 }); H.room('kitchen', 1.75, 4.85, 0.45, 4.05, 0);
    H.room('bedroom', -4.85, -1.75, -4.05, 4.05, F); H.room('bedroom', 1.75, 4.85, -4.05, 0.15, F); H.room('store', 1.75, 4.85, 0.45, 4.05, F); H.cache(-4.1, 3.3, F); },

  // 2. Split-level: the living room and kitchen half a storey up over a raised footing, its door up a stoop; half a flight down
  // from it to the den behind the garage, half a flight up to the bedrooms over the garage. Brick below, boards above, two roofs
  splitlevel(H, b) { const { D, W } = H, U = 2.6, M = 1.3;
    H.out('brick', [[-5, -3.8], [0, -3.8], [0, 3.8], [-5, 3.8]], U + 2.8, { 0: [D(-2.5, 2.6, 2.25, 0, { leaf: false, gaps: [[U + 0.9, U + 2.0]] }), W(-4.35, 0.7, [U + 0.9, U + 2.0]), W(-0.7, 0.7, [U + 0.9, U + 2.0])],
      1: [D(2.85, 1.2, 2.1, M, { int: true }), D(-1.35, 1.2, 2.1, U, { int: true })], 2: [W(-3.4, 1.2, [0.9, 2.05], [U + 0.9, U + 2.0]), W(-1.4, 0.9, [U + 0.9, U + 2.0])], 3: [W(2.0, 1.1, [0.9, 2.05], [U + 0.9, U + 2.0]), W(-2.0, 0.9, [1.4, 2.0], [U + 0.9, U + 2.0])] }, { inner: [1] });
    H.out('planks', [[0, -3.8], [5, -3.8], [5, 3.8], [0, 3.8]], 3.4, { 0: [D(2.2), W(4.0, 1.4, [0.6, 2.1])], 1: [W(-1.5, 1.2), W(1.8)], 2: [W(3.5, 1.2)] }, { skip: [3], lv: M });
    box(H.P, 'iron', 2.5, 1.0, 0.06, -2.5, b.y + 1.75, -3.86); // the garage's roll door, stuck half up
    H.floor([[-4.85, -0.15, -3.65, 0.15]], 0, { plinth: true, k: 'concrete' }); H.floor([[-4.85, -0.15, 0.15, 3.65]], 0, { plinth: true });
    H.floor([[0.15, 4.85, -3.65, 3.65]], M, { plinth: 0.15 });
    H.part(-4.85, 0.3, -0.15, 0.3, 0, U, [D(-3.6)]);
    H.stair(-1.77, 2.85, 'x', 1.2, 0, M, { sides: [-1] }); // half a flight down to the den (climbing it, across -1 is -z)
    H.floor([[-4.85, 0.0, -3.65, 3.65]], U, { holes: [[-1.95, 0.0, 2.2, 3.65]] }); H.rail(-1.95, 2.2, -0.15, 2.2, U); H.rail(-1.95, 2.2, -1.95, 3.6, U);
    H.part(-4.85, 0.3, -0.15, 0.3, U, 2.8, [D(-1.0)]);
    H.stair(0.8, 0.9, '-z', 1.3, M, U, { sides: [1], landing: 1.25 }); H.floor([[-0.16, 1.45, -1.95, -0.72]], U); // half a flight up, its landing at the bedrooms' door
    box(H.P, 'inwall', 0.06, U - M - 0.22, 1.25, 1.45, b.y + (M + U - 0.22) / 2, -1.335); box(H.P, 'inwall', 1.3, U - M - 0.22, 0.06, 0.8, b.y + (M + U - 0.22) / 2, -1.95); H.rail(0.15, -1.95, 1.45, -1.95, U); // (the cupboard under the landing, closed)
    H.floor([[-4.85, -0.15, -3.65, 3.65]], U + 2.8, { k: 'ceil', th: 0.12 }); b.floors.pop();
    H.gable(-2.5, 0, 7.6, 5, U + 2.8, 1.7, 'z', 'brick'); H.gable(2.5, 0, 7.6, 5, M + 3.4, 1.7, 'z', 'planks', { over: [-0.15, 0.45] }); // (its west side stops at the brick wing's face. The quality pass: walls 0.5 m taller, so the half flight's landing under these eaves has a grown-up's headroom, and the roof meets the brick, no gap showing its tiles' edge inside)
    H.room('garage', -4.85, -0.15, -3.65, 0.15, 0); H.room('den', -4.85, -0.15, 0.45, 3.65, 0); H.room('living', 1.6, 4.85, -3.65, 0.6, M, { no: ['-x', '+z'] }); H.room('kitchen', 1.6, 4.85, 0.9, 3.65, M, { no: ['-x', '-z'] });
    H.room('bedroom', -4.85, -0.15, -3.65, 0.15, U); H.room('bedroom', -4.85, -0.15, 0.45, 3.65, U); H.cache(-4.2, 3.0, 0); },

  // 3. L-shaped ranch: one storey in two wings round a yard, the living room and kitchen across the front, the bedrooms down the
  // back wing off a hall; a carport roofed in the angle between the wings; long low windows; plaster
  ranch(H, b) { const { D, W } = H, h = 2.7, rw = (c, w = 1.6) => W(c, w, [1.0, 2.05]);
    H.out('plaster', [[-5.4, -3.9], [4.6, -3.9], [4.6, 6.2], [-0.6, 6.2], [-0.6, 0.6], [-5.4, 0.6]], h, { 0: [D(-3.0), rw(-4.6, 1.0), rw(-1.3), rw(1.5), rw(3.4, 1.4)], 1: [W(-2.0), W(2.0), W(4.8)], 2: [D(0.25), W(2.8)], 3: [W(2.2), W(4.8)], 4: [D(-1.6), W(-3.8)], 5: [W(-2.0)] });
    H.floor([[-5.4, 4.6, -3.9, 0.6], [-0.6, 4.6, 0.6, 6.2]], 0, { plinth: true });
    H.part(-0.6, -3.75, -0.6, 0.45, 0, h, [D(-1.6, 1.6)]); H.part(-0.45, 0.6, 4.45, 0.6, 0, h, [D(0.25)]); H.part(1.0, 0.75, 1.0, 6.05, 0, h, [D(2.0), D(4.8)]); H.part(1.15, 3.4, 4.45, 3.4, 0, h);
    H.floor([[-5.25, 4.45, -3.75, 0.45], [-0.45, 4.45, 0.45, 6.05]], h, { k: 'ceil', th: 0.12 }); b.floors.pop(); // (flat ceilings under the roofs)
    H.gable(-1.9, -1.65, 7, 4.5, h, 1.3, 'x', 'plaster', { ends: [-1], endOver: 0.35, spouts: [-1] }); H.gable(2.0, 1.15, 10.1, 5.2, h, 1.5, 'z', 'plaster');
    // the carport: a flat iron roof hung on ledgers on both wings, its outer corner on three posts
    const yc = b.y + 2.55; box(H.P, 'beam', 4.8, 0.2, 0.08, -3.0, yc - 0.1, 0.79); box(H.P, 'beam', 0.08, 0.2, 5.0, -0.79, yc - 0.1, 3.1);
    for (const [x, z] of [[-5.2, 5.5], [-5.2, 2.9], [-2.6, 5.5]]) { const g0 = gAt(b, x, z); box(H.P, 'beam', 0.14, yc - g0, 0.14, x, (yc + g0) / 2, z); box(H.P, 'concrete', 0.3, 0.3, 0.3, x, g0, z); collideRun(b, x, z, x, z, 0.12); }
    box(H.P, 'beam', 0.16, 0.22, 3.0, -5.2, yc - 0.05, 4.2); box(H.P, 'beam', 2.9, 0.22, 0.16, -3.85, yc - 0.05, 5.5);
    for (let x = -5.3; x < -0.8; x += 0.7) box(H.P, 'beam', 0.06, 0.16, 5.0, x, yc + 0.06, 3.1);
    box(H.P, 'iron', 4.9, 0.04, 5.2, -3.05, yc + 0.16, 3.05, 0, -0.04);
    H.room('living', -5.25, -0.75, -3.75, 0.45, 0, { ceil: h }); H.room('kitchen', -0.45, 4.45, -3.75, 0.45, 0, { set: ['counter', 'cabinet', 'shelves', 'dining'] });
    H.room('bedroom', 1.15, 4.45, 0.75, 3.25, 0); H.room('bedroom', 1.15, 4.45, 3.55, 6.05, 0); H.cache(3.8, 5.4, 0); },

  // 4. A-frame cabin: the roof comes down to the ground on both sides, the front all glass over the door, a sleeping loft at the
  // back up a ladder, a stove in the middle and a deck in front
  aframe(H, b) { const P = H.P, hw = 3.6, L = 4.5, R = 6.8, pitch = R / hw, t = b.t;
    H.floor([[-hw + 0.1, hw - 0.1, -L, L]], 0, { plinth: 0.1 });
    // the gable walls: front (a door and a wall of glass) and back (one window), boards, holes cut in the shape
    const end = (s) => { const sh = new THREE.Shape(s < 0 ? [[-hw, 0], [-0.62, 0], [-0.62, 2.15], [0.62, 2.15], [0.62, 0], [hw, 0], [0, R]].map(([x, y]) => new THREE.Vector2(x, y)) : [[-hw, 0], [hw, 0], [0, R]].map(([x, y]) => new THREE.Vector2(x, y)));
      const holes = s < 0 ? [[[-1.7, 2.7], [1.7, 2.7], [1.7, 4.5], [-1.7, 4.5]], [[-0.9, 4.9], [0.9, 4.9], [0, 5.9]]] : [[[-0.7, 3.2], [0.7, 3.2], [0.7, 4.4], [-0.7, 4.4]]];
      for (const h of holes) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
      P.planks.push(new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false }).translate(0, b.y, s * L - t / 2));
      for (const h of holes) { const xs = h.map(p => p[0]), ys = h.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        if (h.length === 4) { box(P, 'pane', x1 - x0, y1 - y0, 0.012, (x0 + x1) / 2, b.y + (y0 + y1) / 2, s * L); for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / (s < 0 ? 4 : 2)) box(P, 'beam', 0.06, y1 - y0, t + 0.04, x, b.y + (y0 + y1) / 2, s * L); for (const y of [y0, y1, (y0 + y1) / 2]) box(P, 'beam', x1 - x0, 0.06, t + 0.04, (x0 + x1) / 2, b.y + y, s * L); }
        else { box(P, 'pane', 0.8, 0.5, 0.012, 0, b.y + 5.25, s * L); box(P, 'beam', 1.8, 0.06, t + 0.04, 0, b.y + 4.9, s * L); } }
      collideRun(b, -hw + 0.4, s * L, s < 0 ? -0.62 - 0.3 : hw - 0.4, s * L, 0.3, () => b.y + R); if (s < 0) collideRun(b, 0.92, s * L, hw - 0.4, s * L, 0.3, () => b.y + R);
      b.walls.push({ lx: -2.2, lz: s * L, nx: 0, nz: s }); };
    end(-1); end(1); for (const s of [-1, 1]) H.segs.push({ along: true, line: s * L, a0: -hw, a1: hw, y0: 0, y1: R });
    b.doors.push({ lx: 0, lz: -L, nx: 0, nz: -1, lv: 0, w: 1.24 }); dressDoor(b, P, 0, -L, 1, 0, b.y, { w: 1.24, hgt: 2.15 }, { ext: true });
    // the roof: shingles on boarding from ridge to ground, the boarding seen inside; the walker stays clear of the slope
    const sl = Math.atan2(R, hw), len = Math.hypot(R, hw) + 0.35;
    for (const s of [-1, 1]) { box(H.b.PR, 'roof', 0.16, len, 2 * L + 0.7, s * (hw / 2 + 0.07), b.y + R / 2 + 0.04, 0, 0, 0, s * (Math.PI / 2 - sl));
      box(P, 'ceil', 0.04, len - 0.4, 2 * L - 0.1, s * (hw / 2 - 0.06), b.y + R / 2 - 0.03, 0, 0, 0, s * (Math.PI / 2 - sl));
      collideRun(b, s * (hw - 0.25), -L + 0.3, s * (hw - 0.25), L - 0.3, 0.3, () => b.y + 0.5); b.walls.push({ lx: s * hw, lz: 1.5, nx: s, nz: 0 });
      const n0 = colliders.length; collideRun(b, s * 2.45, -L + 0.4, s * 2.45, L - 0.4, 0.1); since(n0, { top: b.y + 2.6, stand: null });
      box(P, 'wall', 0.4, 0.5, 2 * L + 0.4, s * (hw - 0.05), b.y - 0.1, 0); }
    box(H.b.PR, 'roof', 0.3, 0.2, 2 * L + 0.75, 0, b.y + R + 0.12, 0);
    // the loft: a floor over the back half on joists, a rail along its front and a ladder up to it (climbed facing the back)
    H.floor([[-2.2, 2.2, 0.6, L - 0.15]], 2.7); for (let x = -2.0; x <= 2.0; x += 0.5) box(P, 'beam', 0.08, 0.2, L - 0.75, x, b.y + 2.4, (0.6 + L - 0.15) / 2);
    H.rail(-2.2, 0.6, 0.62, 0.6, 2.7); H.rail(1.72, 0.6, 2.2, 0.6, 2.7); for (const x of [-2.2, 2.2]) { const n0 = colliders.length; collideRun(b, x, 0.7, x, L - 0.2, 0.1); since(n0, { top: b.y + 3.7, stand: b.y + 3.7, bot: b.y + 2.65 }); }
    const lx = 1.17, lz = 0.42, Y1 = b.y + 2.7; ladders.push({ b, y0: b.y, y1: Y1, off: toW(b, lx, 1.25), at: (y) => toW(b, lx, lz - 0.32 - (y - b.y) * 0.05) });
    for (const s of [-0.24, 0.24]) box(P, 'beam', 0.06, 3.5, 0.08, lx + s, b.y + 1.65, lz - 0.08, 0, 0.05); for (let y = 0.3; y < 3.3; y += 0.3) box(P, 'beam', 0.5, 0.05, 0.05, lx, b.y + y, lz - y * 0.05 + 0.0);
    b.loft = { lv: 2.7, at: [lx, lz - 0.6] };
    // the deck in front, at the floor, under the roof's eaves
    box(P, 'planks', 4.8, 0.05, 1.8, 0, b.y - 0.025, -L - 0.95); box(P, 'beam', 4.8, 0.24, 0.08, 0, b.y - 0.17, -L - 1.82); for (const x of [-2.3, 2.3]) { const g0 = gAt(b, x, -L - 1.75); box(P, 'wall', 0.3, b.y - g0 + 0.2, 0.3, x, (b.y + g0 - 0.2) / 2 - 0.1, -L - 1.75); }
    surface(b, (x, z) => Math.abs(x) <= 2.4 && z <= -L && z >= -L - 1.9 ? b.y : null); H.decks.push([-2.4, 2.4, -L - 1.9, -L + 0.2]);
    { let gq = gAt(b, 0, -L - 2.2) - b.y, n = Math.round(-gq / RISE); for (let k = 0; k < 3; k++) { gq = Math.min(gq, gAt(b, 0, -L - 1.85 - n * TREAD - 0.3) - b.y); n = Math.round(-gq / RISE); } if (n >= 2) H.stair(0, -L - 1.85 - (n - 1) * TREAD, 'z', 1.6, -n * (-gq / n), 0, { base: b.y + gq - 0.3, check: false }); }
    H.rail(-2.35, -L - 1.8, -0.9, -L - 1.8, 0); H.rail(0.9, -L - 1.8, 2.35, -L - 1.8, 0);
    // the stove and its pipe up through the roof
    H.item('heater', 0, 0, -0.4, 0, { flue: R - 0.4 }); // (the stove under the open front half, its pipe straight up to the ridge)
    H.room('living', -1.9, 1.9, -L + 0.2, 1.9, 0, { set: ['table', 'bench', 'armchair'], no: ['-x', '+x'] }); H.room('bedroom', -1.6, 1.6, 0.75, L - 0.2, 2.7, { set: ['bed', 'crate'], no: ['-x', '+x', '-z'] });
    H.cache(-1.3, 1.45, 2.7); },

  // 5. A row of three narrow two-storey houses sharing their walls, each its front room, kitchen, stair and two bedrooms; a door
  // broken through between two kitchens; brick, a flat roof behind a parapet and a cornice, chimneys on the party walls
  rowhouses(H, b) { const { D, W2, W } = H, top = 2 * F, X = [-4.6, 0, 4.6];
    H.out('brick', [[-6.9, -4.2], [6.9, -4.2], [6.9, 4.2], [-6.9, 4.2]], top + 0.9, { 0: X.flatMap(o => [D(o - 1.2, 1.2, 2.15, 0, { gaps: [[F + 0.9, F + 2.05]] }), W2(o + 0.55, 0.9)]),
      1: [W2(-1.0), W2(2.0)], 2: X.flatMap(o => [D(o - 1.0, 1.2, 2.15, 0, { gaps: [[F + 0.9, F + 2.05]] }), W2(o + 1.4, 0.9)]), 3: [W2(-1.0), W2(2.0)] });
    for (const o of X) { const x = o - 1.2; box(H.P, 'roof', 1.7, 0.08, 0.75, x, b.y + 2.62, -4.55, 0, 0.18); box(H.P, 'beam', 1.6, 0.14, 0.12, x, b.y + 2.5, -4.24); // a hood over each door on two brackets
      for (const s of [-0.7, 0.7]) bar(H.P, 'beam', x + s, b.y + 2.2, -4.2, x + s, b.y + 2.55, -4.8, 0.06); }
    for (const x of [-2.3, 2.3]) { H.part(x, -4.05, x, 4.05, 0, top + 1.2, x > 0 ? [D(2.8, 1.1)] : [], 'brick'); H.chimney(x, 0.6, 0.6, 1.0, top + 2.2, 'brick', top); }
    for (const y of [F - 0.1, top + 0.35]) box(H.P, 'brick', 14.1, 0.16, 0.12, 0, b.y + y, -4.42); // a string course and the cornice
    box(H.P, 'concrete', 14.2, 0.1, 0.5, 0, b.y + top + 0.95, -4.3); box(H.P, 'concrete', 14.2, 0.1, 0.5, 0, b.y + top + 0.95, 4.3);
    for (const o of X) { const x0 = o - 2.15, x1 = o + 2.15;
      H.floor([[x0, x1, -4.05, 4.05]], 0, { plinth: true }); H.part(x0, 0.4, o + 0.8, 0.4, 0, F, [D(o - 0.7)]);
      H.stair(o + 1.475, -1.9, 'z', 1.35, 0, F, { sides: [1] }); // (climbing to the back, across +1 is -x)
      H.floor([[x0, x1, -4.05, 4.05]], F, { holes: [[o + 0.8, x1, -1.9, 2.15]] }); H.rail(o + 0.8, -1.9, x1, -1.9, F); H.part(x0, -0.4, o + 0.8, -0.4, F, F, [D(o - 0.7)]);
      H.room('living', x0, x1, -4.05, 0.25, 0, { ceil: F - 0.22, set: ['sofa', 'coffee', 'armchair', 'clock', 'lamp'] }); H.room('kitchen', x0, o + 0.65, 0.55, 4.05, 0);
      H.room('bedroom', x0, x1, -4.05, -0.55, F); H.room('bedroom', x0, o + 0.65, -0.25, 4.05, F, { set: ['bed', 'nightstand', 'chair'] }); }
    H.floor([[-6.75, 6.75, -4.05, 4.05]], top, { k: 'ceil', th: 0.12 }); b.floors.pop(); H.flat([[-6.9, 6.9, -4.2, 4.2]], top);
    // each house of the row its own parapet: one raised with a stepped pediment, one with a coping band, their party walls between
    for (const [i, o] of X.entries()) { const e = [0, 0.75, 0.35][i], y0 = b.y + top + 0.9; if (!e) continue;
      for (const z of [-4.2, 4.2]) { box(H.P, 'brick', 4.3, e, 0.3, o, y0 + e / 2, z); box(H.P, 'concrete', 4.45, 0.1, 0.42, o, y0 + e + 0.05, z); }
      if (i === 1) { box(H.P, 'brick', 1.6, 0.45, 0.3, o, y0 + e + 0.22, -4.2); box(H.P, 'concrete', 1.75, 0.1, 0.42, o, y0 + e + 0.5, -4.2); } }
    H.cache(-5.9, 3.2, F); },

  // 6. A shop with a flat over it: the shopfront's two big windows and double door under its sign, the counter with the till and
  // the stores behind it, a storeroom at the back; the flat reached only by its own stairs up the side to a landing
  shop(H, b) { const { D, W, WU } = H, top = 2 * F, P = H.P;
    H.out('brick', [[-4.5, -5], [4.5, -5], [4.5, 5], [-4.5, 5]], top + 0.8, { 0: [D(0, 1.5), W(-2.65, 2.2, [0.6, 2.5], [F + 0.9, F + 2.05]), W(2.65, 2.2, [0.6, 2.5], [F + 0.9, F + 2.05])],
      1: [W(-2.3, 1.1, [0.9, 2.05], [F + 0.9, F + 2.05]), D(1.2, 1.1, 2.1, F), WU(3.6)], 2: [D(2.5), WU(-2.0), WU(0.5)], 3: [WU(-2.0), WU(2.0)] });
    H.floor([[-4.5, 4.5, -5, 5]], 0, { plinth: true, k: 'planks' });
    H.part(-4.35, 2.3, 4.35, 2.3, 0, F, [D(-2.4), D(2.6)]);
    // the counter: an L of panelled boxes with a worn top; the till on it, the way behind it at its end
    for (const [x0, x1, z0, z1] of [[-3.2, 1.4, 0.3, 0.9], [0.8, 1.4, -1.6, 0.3]]) { box(P, 'planks', x1 - x0, 0.9, z1 - z0, (x0 + x1) / 2, b.y + 0.45, (z0 + z1) / 2); box(P, 'beam', x1 - x0 + 0.06, 0.05, z1 - z0 + 0.06, (x0 + x1) / 2, b.y + 0.93, (z0 + z1) / 2);
      const n0 = colliders.length; collideRun(b, x1 - x0 > z1 - z0 ? x0 + 0.3 : (x0 + x1) / 2, x1 - x0 > z1 - z0 ? (z0 + z1) / 2 : z0 + 0.3, x1 - x0 > z1 - z0 ? x1 - 0.3 : (x0 + x1) / 2, x1 - x0 > z1 - z0 ? (z0 + z1) / 2 : z1 - 0.3, 0.3, () => b.y + 0.95); }
    H.put('till', -1.2, b.y + 0.955, 0.6, Math.PI); H.occ.push([-3.4, 1.6, -2.2, 2.2, 0, 0]);
    for (const x of [-2.6, -0.6]) { H.put('shelves', x, b.y, 2.15 - 0.25, Math.PI); stock(H.put, shelfAt(x, b.y, 2.15 - 0.25, Math.PI), [1, 2, 3], rng(hash(b, x, 2)), 0.55); }
    for (const z of [-3.6, -2.4, -0.4]) { H.put('shelves', -4.1, b.y, z, Math.PI / 2); stock(H.put, shelfAt(-4.1, b.y, z, Math.PI / 2), [1, 2], rng(hash(b, z, 1)), 0.45); } { const n0 = colliders.length; collideRun(b, -4.1, -4.0, -4.1, 0.0, 0.25, () => b.y + 2.1); }
    // the sign over the shopfront
    const sign = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.62, 0.08), [mats_().beam, mats_().beam, mats_().beam, mats_().beam, mats_().beam, signMat()]); sign.position.set(0, b.y + 2.95, -5.2); sign.castShadow = true; b.group.add(sign);
    // the stairs up the side (open treads on stringers, posts under the landing) to the flat's door
    { let g = Math.min(0, gAt(b, 5.45, -3.6) - b.y); const n = Math.round((F - g) / RISE); g = Math.min(g, gAt(b, 5.45, 0.6 - (n - 1) * TREAD - 0.4) - b.y); const n2 = Math.round((F - g) / RISE); // (from the ground at its foot)
      H.stair(5.45, 0.6 - (n2 - 1) * TREAD, 'z', 1.6, F - n2 * ((F - g) / n2), F, { open: true, sides: [-1], base: b.y + g, landing: 1.5 }); } H.floor([[4.3, 6.25, 0.6, 2.1]], F);
    for (const [x, z] of [[6.15, 2.0], [6.15, 0.65], [4.75, 2.0]]) { const g0 = gAt(b, x, z); box(P, 'beam', 0.14, b.y + F - g0, 0.14, x, (b.y + F + g0) / 2, z); }
    H.rail(4.75, 2.1, 6.25, 2.1, F);
    H.floor([[-4.35, 4.35, -4.85, 4.85]], F); H.part(-4.35, 0.4, 4.35, 0.4, F, F, [D(-1.4), D(3.0)]); H.part(1.6, 0.55, 1.6, 4.85, F, F);
    H.floor([[-4.35, 4.35, -4.85, 4.85]], top, { k: 'ceil', th: 0.12 }); b.floors.pop(); H.flat([[-4.5, 4.5, -5, 5]], top); H.chimney(-3.0, 5.15, 1.0, 0.5, top + 1.8);
    H.room('shop', -4.35, 4.35, -4.85, 2.15, 0, { set: [] }); H.room('store', -4.35, 4.35, 2.45, 4.85, 0, { set: ['shelves', 'crate', 'crate1', 'crate', 'jerry'] }); H.room('living', -4.35, 4.35, -4.85, 0.25, F, { ceil: F - 0.22 }); H.room('kitchen', 1.75, 4.35, 0.55, 4.85, F);
    H.room('bedroom', -4.35, 1.45, 0.55, 4.85, F); H.cache(-0.4, 1.6, 0); },

  // 7. Stilt house: a plank cabin on posts 1.9 m over the Bog, braced, a covered deck in front reached by a stair, a stove room and
  // a bedroom, a tin roof
  stilt(H, b) { const { D, W } = H, P = H.P, h = 2.5;
    H.out('planks', [[-3.4, -2.8], [3.4, -2.8], [3.4, 2.8], [-3.4, 2.8]], h, { 0: [D(-1.0), W(1.6)], 1: [W(0)], 2: [W(-2.0), W(1.6, 0.8)], 3: [W(0.8)] }, { line: 'planks' });
    H.floor([[-3.4, 3.4, -2.8, 2.8]], 0);
    const posts = []; for (const x of [-3.4, 0, 3.4]) for (const z of [-2.8, 0, 2.8]) posts.push([x, z]); box(P, 'beam', 7.0, 0.25, 5.8, 0, b.y - 0.17, 0); // the floor's frame
    for (const [x, z] of posts) { const g0 = gAt(b, x, z); box(P, 'beam', 0.2, b.y - g0 + 0.6, 0.2, x, (b.y + g0 - 0.6) / 2 - 0.1, z); collideRun(b, x, z, x, z, 0.14); }
    for (const z of [-2.8, 2.8]) for (const s of [-1, 1]) bar(P, 'beam', s * 3.4, b.y - 0.3, z, 0, gAt(b, 0, z) + 0.2, z, 0.09);
    for (const x of [-3.4, 3.4]) bar(P, 'beam', x, b.y - 0.3, -2.8, x, gAt(b, x, 2.8) + 0.2, 2.8, 0.09);
    box(P, 'beam', 7.0, 0.3, 0.12, 0, b.y - 0.2, -2.8); box(P, 'beam', 7.0, 0.3, 0.12, 0, b.y - 0.2, 2.8);
    H.part(1.0, -2.65, 1.0, 2.65, 0, h, [D(-1.4)], 'planks');
    H.gable(0, 0, 6.8, 5.6, h, 1.4, 'x', 'planks', { roofK: 'iron', gutter: false });
    H.porch({ x0: -3.5, x1: 3.5, z0: -5.15, z1: -2.95, lv: 0, roof: [h - 0.1, 2.2], posts: [-3.4, 0, 3.4], steps: { c: -2.0, w: 1.3 }, roofK: 'iron' });
    H.room('kitchen', -3.25, 0.85, -2.65, 2.65, 0, { set: ['heater', 'table', 'shelves', 'bucket'] }); H.room('bedroom', 1.15, 3.25, -2.65, 2.65, 0, { set: ['bed', 'chair', 'crate'] }); H.cache(2.6, 2.0, 0); },

  // 8. Adobe courtyard house: thick plaster walls round an open court with a well; the way in through a passage in the front
  // range, a room each side of it, a room in each side range, the main room and the kitchen at the back; flat roofs on log beams
  courtyard(H, b) { const { D, W } = H, h = 3.2, c = 2.6, P = H.P, e = 6;
    H.out('adobe', [[-e, -e], [e, -e], [e, e], [-e, e]], h + 0.5, { 0: [D(0, 1.6, 2.4), W(-3.6, 0.8, [1.3, 2.1]), W(3.6, 0.8, [1.3, 2.1])], 1: [W(0, 0.8, [1.3, 2.1])], 2: [W(-3.4, 0.8, [1.3, 2.1]), W(3.4, 0.8, [1.3, 2.1])], 3: [W(0, 0.8, [1.3, 2.1])] }, { line: false, stone: true });
    H.floor([[-c + 0.25, c - 0.25, -c + 0.25, c - 0.25]], 0, { plinth: true, k: 'floor', pk: 'adobe' }); H.floor([[-e, e, -e, -c + 0.25], [-e, e, c - 0.25, e], [-e, -c + 0.25, -c + 0.25, c - 0.25], [c - 0.25, e, -c + 0.25, c - 0.25]], 0, { plinth: true, k: 'adobe', pk: 'adobe' }); // (clay floors in the rooms, flags in the court)
    H.part(-e + 0.25, -c, e - 0.25, -c, 0, h, [D(0, 1.6, 2.4), W(-3.5, 1.0), W(3.5, 1.0)]); H.part(e - 0.25, c, -e + 0.25, c, 0, h, [D(1.0), D(-1.8), W(3.6, 1.0)]);
    H.part(-c, -c + 0.25, -c, c - 0.25, 0, h, [D(0)]); H.part(c, c - 0.25, c, -c + 0.25, 0, h, [D(0)]);
    for (const s of [-1, 1]) H.part(s * 0.85, -e + 0.25, s * 0.85, -c - 0.25, 0, h, [D(-4.3)]); H.part(0.4, c + 0.25, 0.4, e - 0.25, 0, h, [D(4.3)]);
    const roofs = [[-e, e, -e, -c], [-e, e, c, e], [-e, -c, -c, c], [c, e, -c, c]]; H.flat(roofs, h, 'adobe');
    for (const r of roofs) { const ax = r[1] - r[0] > r[3] - r[2]; for (let u = (ax ? r[0] : r[2]) + 0.5; u < (ax ? r[1] : r[3]) - 0.3; u += 0.8) { const g = new THREE.CylinderGeometry(0.1, 0.11, (ax ? r[3] - r[2] : r[1] - r[0]) + 1.0, 7).rotateX(Math.PI / 2);
      if (!ax) g.rotateY(Math.PI / 2); P.beam.push(g.translate(ax ? u : (r[0] + r[1]) / 2, b.y + h - 0.12, ax ? (r[2] + r[3]) / 2 : u)); } }
    for (const [x, z, ry] of [[-3.5, -e, 0], [3.5, e, Math.PI], [-e, 1.5, Math.PI / 2], [e, -1.5, -Math.PI / 2]]) box(P, 'iron', 0.16, 0.12, 0.8, x - Math.sin(ry) * 0.35, b.y + h + 0.3, z - Math.cos(ry) * 0.35, ry); // canales
    // the way in: a portal of posts and a log beam under a little flat roof, a bench against the wall under it
    for (const x of [-1.5, 1.5]) { const g0 = gAt(b, x, -e - 1.6); box(P, 'beam', 0.18, b.y + 2.45 - g0, 0.18, x, (b.y + 2.45 + g0) / 2, -e - 1.6); collideRun(b, x, -e - 1.6, x, -e - 1.6, 0.14); }
    P.beam.push(new THREE.CylinderGeometry(0.12, 0.12, 3.6, 8).rotateZ(Math.PI / 2).translate(0, b.y + 2.55, -e - 1.6)); for (let x = -1.6; x <= 1.6; x += 0.53) P.beam.push(new THREE.CylinderGeometry(0.07, 0.07, 2.1, 6).rotateX(Math.PI / 2).translate(x, b.y + 2.72, -e - 0.75)); // (its latillas run back into the wall)
    box(P, 'planks', 3.7, 0.08, 2.0, 0, b.y + 2.82, -e - 0.85); box(P, 'adobe', 3.8, 0.18, 2.1, 0, b.y + 2.95, -e - 0.85);
    // the well: a stone curb, a wooden frame and its bucket on a rope
    P.wall.push(new THREE.CylinderGeometry(0.85, 0.9, 0.9, 16, 1, true).translate(0, b.y + 0.45, 0)); P.wall.push(new THREE.TorusGeometry(0.85, 0.09, 6, 16).rotateX(Math.PI / 2).translate(0, b.y + 0.9, 0));
    P.glass.push(new THREE.CircleGeometry(0.78, 16).rotateX(-Math.PI / 2).translate(0, b.y + 0.2, 0)); for (const s of [-1, 1]) box(P, 'beam', 0.1, 1.9, 0.1, s * 0.85, b.y + 0.95, 0); box(P, 'beam', 1.9, 0.1, 0.1, 0, b.y + 1.9, 0);
    bar(P, 'beam', 0, b.y + 1.85, 0, 0, b.y + 1.3, 0, 0.012); H.put('bucket', -0.05, b.y + 1.0, 0, 0); collideRun(b, 0, 0, 0, 0, 0.95, () => b.y + 0.9);
    H.room('bedroom', -e + 0.25, -1.0, -e + 0.25, -c - 0.25, 0); H.room('store', 1.0, e - 0.25, -e + 0.25, -c - 0.25, 0, { set: ['shelves', 'crate', 'jerry', 'bench'] });
    H.room('bedroom', -e + 0.25, -c - 0.25, -c + 0.25, c - 0.25, 0, { set: ['bed', 'chair', 'crate'] }); H.room('store', c + 0.25, e - 0.25, -c + 0.25, c - 0.25, 0, { set: ['crate', 'crate1', 'shelves'] });
    H.room('living', -e + 0.25, 0.25, c + 0.25, e - 0.25, 0, { set: ['heater', 'bench', 'table', 'armchair', 'rocker'] }); H.room('kitchen', 0.55, e - 0.25, c + 0.25, e - 0.25, 0); H.cache(-4.8, -1.6, 0); },

  // 9. Tall townhouse: three storeys on a narrow lot, a stair up each floor (switching sides), the parlour and kitchen on the
  // ground floor, a sitting room on the first, two bedrooms on the second; stone, a steep front gable to the street
  townhouse(H, b) { const { D, W2, W, WU } = H, top = 3 * F, P = H.P;
    H.out('wall', [[-2.9, -4.3], [2.9, -4.3], [2.9, 4.3], [-2.9, 4.3]], top, { 0: [D(-1.4, 1.2, 2.15, 0, { gaps: [[F + 0.9, F + 2.05], [2 * F + 0.9, 2 * F + 2.05]] }), W(1.0, 1.1, [0.9, 2.05], [F + 0.9, F + 2.05], [2 * F + 0.9, 2 * F + 2.05])],
      1: [W(-2.0, 0.8, [F + 0.9, F + 2.05]), W(2.6, 0.8, [2 * F + 0.9, 2 * F + 2.05])], 2: [D(1.5), W(-1.2, 0.9, [F + 0.9, F + 2.05], [2 * F + 0.9, 2 * F + 2.05])], 3: [W(-3.0, 0.8, [0.9, 2.05], [2 * F + 0.9, 2 * F + 2.05]), W(1.8, 0.8, [0.9, 2.05])] });
    for (const lv of [F, 2 * F]) box(P, 'concrete', 6.1, 0.16, 0.1, 0, b.y + lv - 0.08, -4.5);
    H.floor([[-2.75, 2.75, -4.15, 4.15]], 0, { plinth: true }); H.part(-2.75, 0.6, 1.3, 0.6, 0, F, [D(-1.0)]);
    H.stair(2.1, -2.0, 'z', 1.3, 0, F, { sides: [1] });
    H.floor([[-2.75, 2.75, -4.15, 4.15]], F, { holes: [[1.45, 2.75, -2.0, 2.05]] }); H.rail(1.45, -2.0, 2.75, -2.0, F);
    H.stair(-2.1, 2.05, '-z', 1.3, F, 2 * F, { sides: [1] });
    H.floor([[-2.75, 2.75, -4.15, 4.15]], 2 * F, { holes: [[-2.75, -1.45, -2.0, 2.05]] }); H.rail(-2.75, 2.05, -1.45, 2.05, 2 * F); H.part(-1.3, 0.3, 2.75, 0.3, 2 * F, F, [D(0.6)]);
    H.floor([[-2.75, 2.75, -4.15, 4.15]], top, { k: 'ceil', th: 0.12 }); b.floors.pop();
    H.gable(0, 0, 8.6, 5.8, top, 3.0, 'z', 'wall'); H.chimney(2.9, 2.9, 0.5, 0.9, top + 3.4);
    H.room('living', -2.75, 1.3, -4.15, 0.45, 0, { ceil: F - 0.22, set: ['sofa', 'armchair', 'bookshelf', 'clock', 'lamp'] }); H.room('kitchen', -2.75, 1.3, 0.75, 4.15, 0, { set: ['counter', 'cabinet', 'table'] });
    H.room('study', -1.3, 1.3, -4.15, 4.15, F, { set: ['bookshelf', 'armchair', 'rocker', 'clock'] }); H.room('bedroom', -1.3, 2.75, -4.15, 0.15, 2 * F); H.room('bedroom', -1.3, 2.75, 0.45, 4.15, 2 * F, { set: ['bed', 'cabinet', 'chair'] });
    H.cache(2.1, 3.5, 2 * F); },

  // 10. Trailer: a long single-wide on concrete blocks, ribbed metal skin, a bedroom at each end and the living room and kitchen
  // between, metal steps to the door, a lean-to on posts along its front and a fenced yard
  trailer(H, b) { const { D, W } = H, P = H.P, h = 2.25;
    b.y = b.ground + 0.7;
    H.out('iron', [[-6.6, -1.8], [6.6, -1.8], [6.6, 1.8], [-6.6, 1.8]], h, { 0: [W(-4.6, 1.1, [0.95, 1.8]), D(2.0, 1.1, 2.0), W(-0.6, 1.4, [0.95, 1.8]), W(4.8, 1.1, [0.95, 1.8])], 1: [W(0, 0.9, [0.95, 1.8])], 2: [W(-4.8, 1.1, [0.95, 1.8]), W(0.5, 1.0, [0.95, 1.8]), W(2.4, 0.7, [1.3, 1.8]), W(4.6, 1.1, [0.95, 1.8])], 3: [W(0, 0.9, [0.95, 1.8])] }, { line: 'inwall' });
    H.floor([[-6.6, 6.6, -1.8, 1.8]], 0); box(P, 'beam', 13.2, 0.3, 3.6, 0, b.y - 0.2, 0); // (the floor on its chassis)
    H.flat([[-6.6, 6.6, -1.8, 1.8]], h, 'iron'); box(P, 'ceil', 13.0, 0.03, 3.4, 0, b.y + h - 0.02, 0); for (const z of [-1.9, 1.9]) box(P, 'iron', 13.3, 0.1, 0.06, 0, b.y + h - 0.05, z);
    for (let x = -6; x <= 6; x += 2) for (const z of [-1.4, 1.4]) { const g0 = gAt(b, x, z); box(P, 'concrete', 0.4, b.y - g0 + 0.1, 0.4, x, (b.y + g0) / 2 - 0.15, z); }
    for (const s of [-1, 1]) for (const [x0, x1] of [[-6.6, -0.2], [2.0, 6.6]]) box(P, 'planks', x1 - x0, 0.55, 0.04, (x0 + x1) / 2, b.y - 0.38, s * 1.82); // the skirting, a stretch of it gone
    bar(P, 'iron', 6.6, b.y - 0.2, -1.0, 8.0, b.y - 0.35, 0, 0.1); bar(P, 'iron', 6.6, b.y - 0.2, 1.0, 8.0, b.y - 0.35, 0, 0.1); // the hitch
    { const gj = gAt(b, 7.6, 0); box(P, 'iron', 0.08, b.y - 0.35 - gj, 0.08, 7.6, (b.y - 0.35 + gj) / 2, 0); box(P, 'iron', 0.2, 0.04, 0.2, 7.6, gj + 0.02, 0); } // its jack
    for (const x of [0.4, 1.3]) for (const s of [-1, 1]) { const gy = b.y - 0.62; P.glass.push(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 16).rotateX(Math.PI / 2).translate(x, gy + 0.36 - 0.1, s * 1.45)); } // (two axles of wheels behind the skirting's broken panels)
    box(P, 'iron', 1.0, 0.08, 3.0, 0.85, b.y - 0.5, 0); box(P, 'iron', 13.3, 0.14, 0.14, 0, b.y + h + 0.08, -1.86); box(P, 'iron', 13.3, 0.14, 0.14, 0, b.y + h + 0.08, 1.86); // the axle beam, the roof's rolled edges
    H.part(-2.6, -1.65, -2.6, 1.65, 0, h, [D(0.35, 1.1, 2.0)]); H.part(3.6, -1.65, 3.6, 1.65, 0, h, [D(0.35, 1.1, 2.0)]);
    // the lean-to: a ledger on the trailer's side, rafters down to a beam on three posts, a tin sheet
    const yl = b.y + h - 0.1, yp = b.y + 1.75, zp = -3.9; box(P, 'beam', 5.6, 0.18, 0.08, -3.2, yl, -1.86);
    for (const x of [-5.8, -3.2, -0.6]) { const g0 = gAt(b, x, zp); box(P, 'beam', 0.14, yp - g0, 0.14, x, (yp + g0) / 2, zp); collideRun(b, x, zp, x, zp, 0.12); }
    box(P, 'beam', 5.6, 0.18, 0.14, -3.2, yp + 0.09, zp); for (let x = -5.9; x <= -0.5; x += 0.6) bar(P, 'beam', x, yl, -1.9, x, yp + 0.12, zp - 0.3, 0.06);
    box(P, 'iron', 5.9, 0.04, Math.hypot(yl - yp, 2.4) + 0.2, -3.2, (yl + yp) / 2 + 0.12, (-1.9 + zp - 0.3) / 2, 0, -Math.atan2(yl - yp, 2.4 - 0.3));
    // the yard's fence: posts and three rails, its gate open at the steps
    const fence = (x0, z0, x1, z1) => { const n0 = colliders.length; collideRun(b, x0, z0, x1, z1, 0.08); since(n0, { top: b.ground + 1.2 });
      const L = Math.hypot(x1 - x0, z1 - z0); for (let s = 0; s <= L + 0.01; s += 1.8) { const x = x0 + (x1 - x0) * s / L, z = z0 + (z1 - z0) * s / L, gq = gAt(b, x, z); box(P, 'beam', 0.1, 1.25, 0.1, x, gq + 0.5, z); }
      for (const y of [0.3, 0.7, 1.05]) bar(P, 'beam', x0, gAt(b, x0, z0) + y, z0, x1, gAt(b, x1, z1) + y, z1, 0.05); };
    fence(-7.2, -4.4, 1.15, -4.4); fence(2.85, -4.4, 7.2, -4.4); fence(-7.2, -4.4, -7.2, -1.9); fence(7.2, -4.4, 7.2, -1.9);
    H.room('bedroom', -6.45, -2.75, -1.65, 1.65, 0, { set: ['bed', 'nightstand', 'cabinet'] }); H.room('living', -2.45, 1.0, -1.65, 1.65, 0, { set: ['sofa', 'armchair', 'clock'], no: ['-z', '+x'] });
    H.room('kitchen', 1.0, 3.45, -1.65, 1.65, 0, { set: ['counter', 'cabinet', 'shelves'], no: ['-x'] }); H.room('bedroom', 3.75, 6.45, -1.65, 1.65, 0, { set: ['bed', 'chair'] }); H.cache(-6.0, 1.1, 0); },
};
// a stove's flue: a black pipe from the top of the stove at (x, z) up through the ceiling (at ceil over the floor lv); wx: or across to the chimney wall
function flue(H, x, z, lv, ceil, wx) { const b = H.b, y0 = b.y + lv + 1.0, y1 = b.y + lv + ceil + 0.3; if (wx == null) { H.P.iron.push(new THREE.CylinderGeometry(0.085, 0.085, y1 - y0, 10).translate(x, (y0 + y1) / 2, z)); return; }
  const ym = b.y + lv + 1.75; H.P.iron.push(new THREE.CylinderGeometry(0.085, 0.085, ym - y0, 10).translate(x, (y0 + ym) / 2, z)); bar(H.P, 'iron', x, ym, z, wx, ym, z, 0.17); }
let MATS = null; const mats_ = () => MATS ||= { beam: new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.9 }) };
let SIGN = null; function signMat() { return SIGN ||= new THREE.MeshStandardMaterial({ roughness: 0.8, map: canvasTex(512, 64, (x, w, h) => { x.fillStyle = '#e9dfc8'; x.font = 'bold 44px serif'; x.textAlign = 'center'; x.fillText('GENERAL  STORE', w / 2, 47);
  x.fillStyle = 'rgba(60,40,25,0.35)'; for (let i = 0; i < 400; i++) x.fillRect(Math.random() * w, Math.random() * h, 3, 2); }, '#3c2e22') }); }
