// Buildings (run 2, slice 8): the ruined town at the heart of The Ruins (stone houses along its broken streets, a few
// still roofed, most roofless shells with fallen timbers and rubble, and a watchtower like IW1's), one landmark per
// biome (the Waste's gas station after IW1's structures.js, a Frostline stone hut, a Glass Desert adobe, a Bog cabin, a
// Greenbelt farmhouse beyond the ring, an overgrown Fungal Hollow ruin), raider camps (tents round a fire, a scrap
// barricade, a guarded supply crate) and supply crates to search (E). Walls collide as chains of small circles with real
// gaps at the doorways. planBuildings() runs before the props are placed (they keep out of every footprint, and it adds
// the camps' scrap and the station's wrecks); buildBuildings() makes the meshes, colliders and crates; tickBuildings()
// lifts the roof off the building the player is in (third-person cameras) and hides far buildings.
// The places worth going to are built in src/places/ (one file per kind; PLACE_BUILD below lists them) and their rooms
// furnished from src/interiors.js; this file still exports all it did.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Q, SEED, DEFAULT_SEED, CLASSIC, WATER_Y } from './config.js';
import { vnoise, mulberry32 } from './noise.js';
import { groundY } from './world.js';
import { buildings, raiderCamps, places, R, apart, toW, toL } from './plan.js';
import { islands } from './world.js';
import './landmarks.js'; // (nothing of it is used here now: kept so the modules load in the order they did)
import { addCollider, surfaces, colliders, dropColliders } from './props.js';
import { buildKind, dressDoor, dressWindow, porchOn } from './houses.js';
import { pbr, boxUV, loadMesh, canvasTex } from './propmodels.js';
import { buildFire, buildTent } from './camp.js';
import './wind.js'; // (nothing of it is used here now: kept so the modules load in the order they did)
import { placeMats } from './places/shared.js';
import { buildRadio, radioShack } from './places/radio.js';
import { buildPlane, PLANE_KEYS } from './places/plane.js';
import { KITS, GAS_KIT, loadKit, kitRoom, stock, litLantern, shelfAt, radioRoom, hermitRoom } from './interiors.js';
import { outpost } from './places/outpost.js';
import { buildBarge } from './places/barge.js';
import { hermitYard } from './places/island.js';
import { buildShrooms } from './places/shrooms.js';
import { buildCrater } from './places/crater.js';

export const caches = [];
export { buildings, raiderCamps, clearOf, indoors, planBuildings, solidWays } from './plan.js';
export {
  FOOD_EACH,
  larder,
  foodName,
  foodNear,
  takeFood,
  kitRoom,
  stock,
  woodpile,
  hangLamp,
  litLantern,
  shelfAt,
} from './interiors.js';
export { smoke } from './places/island.js';

// ── Building: meshes, colliders, crates ────────────────────────────────────────────────────────────────────────
let MAT = null,
  CRATE = null;
const TILE = {
  hull: 2.4,
  snow: 3,
  wall: 2.2,
  brick: 2,
  plaster: 1.6,
  planks: 2,
  roof: 2.4,
  ceil: 2,
  concrete: 3,
  floor: 2,
  paint: 1.5,
  iron: 2,
  beam: 2,
  moss: 2.2,
  seat: 0.6,
  carpet: 1.6,
  earth: 4,
  inwall: 1.8,
  adobe: 2.0,
}; // (inwall, slice 36: a kind's painted plaster inside) // (the last three: the plane's, made with it)
export function mats() {
  if (MAT) return MAT;
  const base = {}; // one load per texture: variants are clones, which share the maps
  const t = (n, o = {}) => {
    const m = (base[n] ||= pbr('props/' + n)).clone();
    m.roughness = o.rough ?? 0.92;
    m.metalness = o.metal ?? 0;
    m.color.set(o.color ?? 0xffffff);
    m.side = o.side ?? THREE.FrontSide;
    return m;
  };
  MAT = {
    wall: t('wall'),
    brick: t('brick'),
    plaster: t('plaster', { color: 0xe6c8a0 }),
    planks: t('planks', { rough: 0.85, color: 0xd8a878 }),
    roof: t('rooftile'),
    ceil: t('planks', { color: 0xc89870, side: THREE.DoubleSide }),
    beam: t('planks', { color: 0xa07850 }),
    concrete: t('concrete'),
    floor: pbr('terrain/paving', { rough: 0.95, color: 0xd0b898 }),
    paint: t('iron', { color: 0xc04a36, metal: 0.3, rough: 0.6 }),
    hull: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.15,
      roughness: 0.78,
      side: THREE.DoubleSide,
      map: canvasTex(
        256,
        256,
        (x, w, h) => {
          // riveted panels, streaked with grime
          x.fillStyle = 'rgba(40,38,32,0.55)';
          for (let i = 0; i <= 2; i++) {
            x.fillRect(0, (i * h) / 2 - 1, w, 3);
            x.fillRect((i * w) / 2 - 1, 0, 3, h);
          }
          x.fillStyle = 'rgba(30,28,24,0.6)';
          for (let i = 0; i < 2; i++)
            for (let k = 4; k < w; k += 10) {
              x.fillRect(k, (i * h) / 2 + 6, 2, 2);
              x.fillRect((i * w) / 2 + 6, k, 2, 2);
            }
          for (let i = 0; i < 70; i++) {
            x.fillStyle = `rgba(${60 + Math.random() * 50},${50 + Math.random() * 30},30,${0.06 + Math.random() * 0.12})`;
            x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 20 + Math.random() * 90);
          }
        },
        '#8a8c84',
      ),
    }),
    glass: new THREE.MeshStandardMaterial({ color: 0x24323c, metalness: 0.6, roughness: 0.18 }),
    pane: new THREE.MeshStandardMaterial({
      color: 0x9fb2bb,
      metalness: 0.2,
      roughness: 0.06,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
    /* (slice 36: a window's glass) */ snow: new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.95 }),
    /* (slice 23: a plane's bare aluminium, the outpost's snowed roof) */ iron: t('iron', {
      metal: 0.35,
      rough: 0.75,
      side: THREE.DoubleSide,
    }),
    moss: t('wall', { color: 0x7a8a6a }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x7a3426, roughness: 0.95 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffb050 }),
    ring: new THREE.MeshBasicMaterial({
      color: 0xffc860,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    sign: new THREE.MeshStandardMaterial({
      roughness: 0.7,
      map: canvasTex(
        256,
        128,
        (x, w, h) => {
          x.fillStyle = '#e8dcc0';
          x.font = 'bold 74px sans-serif';
          x.textAlign = 'center';
          x.fillText('FUEL', w / 2, 92);
          x.fillStyle = 'rgba(70,40,20,0.5)';
          for (let i = 0; i < 300; i++) x.fillRect(Math.random() * w, Math.random() * h, 3, 2);
        },
        '#8a2a1e',
      ),
    }),
  };
  // indoors seen from a third-person camera, every building is cut away above the player's waist (and its roof lifted)
  MAT.plaster.normalScale.set(2.2, 2.2); // the clay plaster reads flat at its own relief
  MAT.inwall = new THREE.MeshStandardMaterial({
    color: 0xb3a487,
    roughness: 0.95,
    normalMap: MAT.plaster.normalMap,
    normalScale: new THREE.Vector2(0.3, 0.3),
  });
  MAT.adobe = new THREE.MeshStandardMaterial({
    color: 0xdcc39c,
    roughness: 0.97,
    normalMap: MAT.plaster.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
  }); // (the courtyard house's lime-washed adobe) // (slice 36: the house kinds' rooms, a pale painted plaster)
  for (const m of Object.values(MAT)) m.clippingPlanes = [CUT];
  return MAT;
}
const CUT = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
function tinted(hex) {
  return (MAT['roof' + hex] ||= (() => {
    const m = MAT.roof.clone();
    m.color.set(hex);
    m.clippingPlanes = [CUT];
    return m;
  })());
} // snow on the hut, a dark Bog roof
export const box = (P, k, sx, sy, sz, x, y, z, ry = 0, rx = 0, rz = 0) =>
  P[k].push(new THREE.BoxGeometry(sx, sy, sz).rotateZ(rz).rotateX(rx).rotateY(ry).translate(x, y, z));
// ground height under a point of the building's frame, as an offset from its base
export const gAt = (b, lx, lz) => {
  const [x, z] = toW(b, lx, lz);
  return groundY(x, z);
};

// collision along a solid run of wall: circles of 0.3 m every 0.45 m, inset so a doorway keeps its full width
// topAt(lx, lz) is the solid's top there (shots pass over lower walls)
export function collideRun(b, lx0, lz0, lx1, lz1, r = 0.3, topAt = () => b.y + 3) {
  const L = Math.hypot(lx1 - lx0, lz1 - lz0);
  if (L < 0.05) {
    const [x, z] = toW(b, lx0, lz0);
    Object.assign(addCollider(x, z, r, b), { vr: 0, top: topAt(lx0, lz0), stand: r > 0.2 ? topAt(lx0, lz0) : null });
    return;
  }
  const n = Math.max(1, Math.ceil((L - 2 * r) / 0.45));
  for (let k = 0; k <= n; k++) {
    const s = L <= 2 * r ? L / 2 : r + ((L - 2 * r) * k) / n,
      lx = lx0 + ((lx1 - lx0) * s) / L,
      lz = lz0 + ((lz1 - lz0) * s) / L,
      [x, z] = toW(b, lx, lz);
    Object.assign(addCollider(x, z, r, b), { vr: 0, top: topAt(lx, lz), stand: r > 0.2 ? topAt(lx, lz) : null });
  }
}
// a box-shaped solid lying at yaw in the building's frame (a shipping container): rows of circles filling its width, its ends reaching its ends,
// its footprint kept on b.solids for the walk test (Jared, November 15, 2026: one run of circles down its middle stopped 0.6 m short at each end)
export function collideBox(b, lx, lz, len, wid, yaw, topAt) {
  const ax = Math.sin(yaw),
    az = Math.cos(yaw),
    n = Math.max(1, Math.round(wid / 1.2)),
    r = wid / (2 * n);
  for (let i = 0; i < n; i++) {
    const s = r * (2 * i + 1) - wid / 2,
      cx = lx + az * s,
      cz = lz - ax * s;
    collideRun(b, cx - (ax * len) / 2, cz - (az * len) / 2, cx + (ax * len) / 2, cz + (az * len) / 2, r, topAt);
  }
  const [x, z] = toW(b, lx, lz),
    [x1, z1] = toW(b, lx + ax, lz + az);
  (b.solids ||= []).push({ x, z, ux: x1 - x, uz: z1 - z, len, wid, top: topAt(lx, lz) });
}
// a roof or floor a foot can stand on: at(lx, lz) gives its height in the building's frame, or null off its edge
export function surface(b, at, o = {}) {
  surfaces.push({
    ...o,
    x: b.x,
    z: b.z,
    r: Math.max(Math.abs(b.cx || 0) + b.w / 2, Math.abs(b.cz || 0) + b.d / 2) + 1.5,
    at: (x, z) => {
      const [lx, lz] = toL(b, x, z);
      return at(lx, lz);
    },
  });
}
export const ladders = []; // the tower's: y0 to y1, at(y) is where the climber's feet are at that height, off the step-off point at the top
export function ladderAt(x, z, y) {
  for (const l of ladders) {
    if (y < l.y0 - 0.3 || y > l.y1 + 0.1) continue;
    const [lx, lz] = l.at(Math.min(l.y1, Math.max(l.y0, y)));
    if (Math.hypot(lx - x, lz - z) < 0.7) return l;
  }
  return null;
}
// a straight wall along the frame's x or z axis, from (x0, z0) to (x1, z1): solid runs between the openings (a door is a
// gap with a lintel, a window a gap between sill and head); a ruined wall breaks into blocks that lose their tops
// (slice 36, the house kinds: o.lv raises its base that far above the floor, b.y (an upper storey's wall stands on its floor
// and has a bottom its colliders keep, bot, so the floor below walks on under it); o.ext marks an outside wall, the ones the
// walk test walks into; o.line lines its inner side, the -normal side, with that material; a door's y0 lifts its sill (a
// doorway at a half-landing). A house kind (b.dress) gets frames, sills, glass and doors in its openings)
export function wall(b, P, k, x0, z0, x1, z1, h, holes = [], o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0),
    ux = (x1 - x0) / L,
    uz = (z1 - z0) / L,
    along = Math.abs(ux) > 0.5,
    t = b.t || 0.45,
    ruin = b.ruin || 0,
    lv = o.lv || 0,
    base = b.y + lv;
  // (o.footed: walls raised on a solid footing, the split-level's upper half, have no bottom to walk under: on ground falling 2 m away,
  // the classic town's, a player walked under them into the stone, November 15, 2026)
  const bot = o.footed ? undefined : lv > 0.05 ? base : o.bot,
    kind = !!b.style;
  const hs = holes
    .map((o) => ({ ...o, s0: L / 2 + o.at - o.w / 2, s1: L / 2 + o.at + o.w / 2 }))
    .sort((p, q) => p.s0 - q.s0);
  const piece = (s0, s1, y0, y1) => {
    if (s1 - s0 < 0.02 || y1 - y0 < 0.02) return;
    const c = (s0 + s1) / 2;
    box(P, k, along ? s1 - s0 : t, y1 - y0, along ? t : s1 - s0, x0 + ux * c, (y0 + y1) / 2, z0 + uz * c);
    if (o.line) {
      const ly0 = Math.max(y0, base),
        d = t / 2 + 0.012;
      if (y1 - ly0 > 0.02)
        box(
          P,
          o.line,
          along ? s1 - s0 - 0.006 : 0.02,
          y1 - ly0 - 0.006,
          along ? 0.02 : s1 - s0 - 0.006,
          x0 + ux * c - uz * d,
          (ly0 + y1) / 2,
          z0 + uz * c + ux * d,
        );
    }
  }; // (3 mm short of every edge: its ends lay in the door and window casings' inner faces and flickered there, Jared's "z-fighting?", the quality pass)
  const foot = (s) =>
    kind
      ? lv > 0.05
        ? base
        : (o.foot ?? Math.min(gAt(b, x0 + ux * s, z0 + uz * s), b.y) - 0.8)
      : Math.min(gAt(b, x0 + ux * s, z0 + uz * s), b.y) - 0.8; // walls run on down into the ground
  const top = (s) => {
    if (!ruin) return base + h;
    const e = Math.min(1, Math.min(s, L - s) / 1.4),
      v = vnoise((x0 + ux * s) * 0.7 + b.seed, (z0 + uz * s) * 0.7); // corners stand tallest
    return base + h * Math.max(b.minTop ?? 0.18, 1 - ruin * Math.min(1, v * 1.5) * (0.35 + 0.65 * e));
  };
  const topAt = (lx, lz) => top((lx - x0) * ux + (lz - z0) * uz);
  const run = (s0, s1, tp = topAt, bt = bot) => {
    const n0 = colliders.length;
    collideRun(b, x0 + ux * s0, z0 + uz * s0, x0 + ux * s1, z0 + uz * s1, 0.3, tp);
    if (bt != null) for (let i = n0; i < colliders.length; i++) colliders[i].bot = bt;
  };
  let s = 0;
  const runs = [];
  for (const o of hs) {
    runs.push([s, o.s0]);
    s = o.s1;
  }
  runs.push([s, L]);
  for (const [s0, s1] of runs) {
    const n = ruin ? Math.max(1, Math.round((s1 - s0) / 0.7)) : 1;
    for (let i = 0; i < n; i++) {
      const a = s0 + ((s1 - s0) * i) / n,
        c = s0 + ((s1 - s0) * (i + 1)) / n;
      piece(a, c, Math.min(foot(a), foot(c)), top((a + c) / 2));
    }
    run(s0, s1);
  }
  for (const q of hs) {
    const tp = top((q.s0 + q.s1) / 2),
      mid = (q.s0 + q.s1) / 2;
    if (q.type === 'door') {
      const y0 = q.y0 || 0;
      if (tp > base + y0 + q.hgt + 0.2) {
        const ys = [base + y0 + q.hgt, ...(q.gaps || []).flat().map((v) => base + v), tp]; // (q.gaps, a kind's: windows over the door)
        for (let i = 0; i < ys.length; i += 2) piece(q.s0, q.s1, ys[i], Math.min(ys[i + 1], tp));
        if (kind) run(q.s0, q.s1, () => tp, base + y0 + q.hgt); // (a kind's lintel stops shots and a climber's head)
        if (kind)
          for (const [g0, g1] of q.gaps || [])
            dressWindow(b, P, x0 + ux * mid, z0 + uz * mid, ux, uz, base + g0, base + g1, q.w, o);
      }
      if (y0 > 0) {
        piece(q.s0, q.s1, Math.min(foot(q.s0), foot(q.s1)), base + y0);
        run(q.s0, q.s1, () => base + y0 - 0.55);
      } // (its solid sill: 55 cm under the doorway, so the stair's last steps up to it are not blocked; still too high to step up onto from the floor below)
      const d = { lx: x0 + ux * mid, lz: z0 + uz * mid, nx: uz, nz: -ux, lv: lv + y0, w: q.w };
      if (!kind || (o.ext && !q.int && lv + y0 < 1.5)) b.doors.push(d);
      else if (kind) (b.inner ||= []).push(d);
      if (kind) dressDoor(b, P, x0 + ux * mid, z0 + uz * mid, ux, uz, base + y0, q, o);
    } else {
      const ys = [Math.min(foot(q.s0), foot(q.s1)), ...q.gaps.flat().map((v) => base + v), tp]; // stone between and around the openings
      for (let i = 0; i < ys.length; i += 2) piece(q.s0, q.s1, ys[i], Math.min(ys[i + 1], tp));
      run(q.s0, q.s1);
      if (kind)
        for (const [g0, g1] of q.gaps)
          dressWindow(b, P, x0 + ux * mid, z0 + uz * mid, ux, uz, base + g0, base + g1, q.w, o);
    }
  }
  // a solid spot on this wall for the walk test: the longest run's middle, if the wall still stands above 1.2 m there
  const [r0, r1] = runs.reduce((p, q) => (q[1] - q[0] > p[1] - p[0] ? q : p));
  const m = (r0 + r1) / 2;
  if ((!kind || (o.ext && lv < 1.5)) && r1 - r0 > (kind ? 2.0 : 1.2) && top(m) > b.y + 1.2)
    b.walls.push({ lx: x0 + ux * m, lz: z0 + uz * m, nx: uz, nz: -ux }); // (a kind's: a stretch over 2 m, its middle a metre from any opening or corner, where the walker cannot slide round into one)
}
export const door = (at = 0, w = 1.6, hgt = 2.2, y0 = 0) => ({ type: 'door', at, w, hgt, y0 }),
  win = (at, w = 0.9, gaps = [[0.95, 1.9]]) => ({ type: 'window', at, w, gaps });
// four walls round a w x d room, wound so every wall's outward normal is (uz, -ux); the front (-z) holds the door
function room(b, P, k, w, d, h, front, back = [], left = [], right = []) {
  const t = b.t || 0.45,
    hw = w / 2,
    hd = d / 2;
  wall(b, P, k, -hw - t / 2, -hd, hw + t / 2, -hd, h, front);
  wall(b, P, k, hw + t / 2, hd, -hw - t / 2, hd, h, back);
  wall(b, P, k, -hw, hd - t / 2, -hw, -hd + t / 2, h, left);
  wall(b, P, k, hw, -hd + t / 2, hw, hd - t / 2, h, right);
}
// a floor that follows the ground inside the walls
function floor(b, P, k, w, d, cx = 0, cz = 0, lift = 0.04) {
  const g = new THREE.PlaneGeometry(w, d, Math.ceil(w / 1.5), Math.ceil(d / 1.5)).rotateX(-Math.PI / 2),
    p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, gAt(b, cx + p.getX(i), cz + p.getZ(i)) + lift);
  g.translate(cx, 0, cz);
  g.computeVertexNormals();
  P[k].push(g);
}
// a gable roof over w x d (ridge along x) with plank boarding underneath and the gable ends in the wall stone
// (the walls' centrelines are at x = +-w/2 and z = +-d/2; roof parts go in b.PR, which lifts off when the player is inside)
function gable(b, P, w, d, h, rh, k) {
  const t = b.t || 0.45,
    top = b.y + h,
    D = d / 2 + t / 2,
    half = D + 0.45,
    sl = Math.atan2(rh, D),
    len = half / Math.cos(sl),
    yE = top - (0.45 * rh) / D;
  surface(b, (lx, lz) =>
    Math.abs(lx) <= (w + t + 0.7) / 2 && Math.abs(lz) <= half ? top + rh * (1 - Math.abs(lz) / D) + 0.16 : null,
  );
  for (const s of [-1, 1]) {
    const zm = (s * half) / 2,
      ym = (yE + top + rh) / 2 + 0.07;
    box(b.PR, 'roof', w + t + 0.7, 0.14, len, 0, ym, zm, 0, s * sl);
    box(b.PR, 'ceil', w - t, 0.03, len - 0.6, 0, ym - 0.12, zm * 0.95, 0, s * sl);
  }
  box(b.PR, 'roof', w + t + 0.75, 0.16, 0.3, 0, top + rh + 0.12, 0);
  const tri = new THREE.Shape([new THREE.Vector2(-D, 0), new THREE.Vector2(D, 0), new THREE.Vector2(0, rh)]);
  for (const s of [-1, 1])
    P[k].push(
      new THREE.ExtrudeGeometry(tri, { depth: t, bevelEnabled: false })
        .rotateY(Math.PI / 2)
        .translate((s * w) / 2 - t / 2, top, 0),
    );
}
// stone chunks in a heap
function rubble(b, P, k, lx, lz, s = 1, n = 9) {
  for (let i = 0; i < n; i++) {
    const a = R() * 6.283,
      r = R() * s,
      q = 0.18 + R() * 0.4 * s,
      x = lx + Math.cos(a) * r,
      z = lz + Math.sin(a) * r;
    box(
      P,
      k,
      q * (1 + R()),
      q * (0.6 + R() * 0.5),
      q * (1 + R()),
      x,
      gAt(b, x, z) + q * 0.25 * (1.3 - r / s),
      z,
      R() * 3,
      R() * 0.6,
      R() * 0.6,
    );
  }
}
function table(b, P, x, z, ry) {
  const y = gAt(b, x, z);
  box(P, 'planks', 1.4, 0.06, 0.8, x, y + 0.76, z, ry);
  for (const [a, c] of [
    [0.62, 0.32],
    [-0.62, 0.32],
    [0.62, -0.32],
    [-0.62, -0.32],
  ])
    box(
      P,
      'beam',
      0.07,
      0.74,
      0.07,
      x + a * Math.cos(ry) + c * Math.sin(ry),
      y + 0.37,
      z - a * Math.sin(ry) + c * Math.cos(ry),
    );
}
function stool(b, P, x, z) {
  const y = gAt(b, x, z);
  box(P, 'planks', 0.38, 0.05, 0.38, x, y + 0.45, z, R());
  for (const [a, c] of [
    [0.13, 0.13],
    [-0.13, 0.13],
    [0.13, -0.13],
    [-0.13, -0.13],
  ])
    box(P, 'beam', 0.05, 0.44, 0.05, x + a, y + 0.22, z + c);
}
// a supply crate to search: a Poly Haven crate with a soft gold ring on the ground while it is still full
export function cache(b, g, lx, lz, camp = null, o = {}) {
  const [x, z] = toW(b, lx, lz),
    m = new THREE.Mesh(CRATE.geo, CRATE.mat),
    y = o.y ?? groundY(x, z); // (o, slice 23: a place's crate: its loot k, rounds, a deck or cap it stands on)
  m.scale.setScalar(1.25);
  m.position.set(x, y, z);
  m.rotation.y = -b.a + (o.ry ?? R() * 0.6);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32).rotateX(-Math.PI / 2), mats().ring);
  ring.position.set(x, y + 0.05, z);
  g.add(ring);
  const col = Object.assign(addCollider(x, z, 0.6, b), { vr: 0, top: y + 0.8, stand: y + CRATE.h });
  // a few hits smash it (game.js): the crate is gone, its collider with it
  col.cache = {
    x,
    z,
    y,
    camp,
    hp: 3,
    opened: false,
    open() {
      this.opened = true;
      ring.visible = false;
      m.rotation.z = 0.12;
      m.position.y -= 0.05;
    },
    smash() {
      this.broken = true;
      this.opened = true;
      ring.visible = false;
      m.visible = false;
      col.r = 0;
    },
  };
  Object.assign(col.cache, o);
  caches.push(col.cache);
  return col.cache;
}
// a corner of the room, not the same one in every house (the door's corners are at -z)
const corner = (w, d) =>
  [
    [-1, 1],
    [1, -1],
    [-1, -1],
  ][Math.floor(R() * 3)].map((s, i) => s * ((i ? d : w) / 2 - 0.75));

function furnish(b, P, g, w, d) {
  const hw = w / 2 - 0.45,
    hd = d / 2 - 0.45; // the door is at (0, -d/2): the way in stays clear
  if (b.furnish === 'home' && b.hermit) {
    R();
    R();
    const c = corner(w, d);
    hermitRoom(b, P, w, d, c);
    cache(b, g, ...c);
  } // (slice 23 polish: the hermit's room in scanned props; the two stools' draws kept)
  else if (b.furnish === 'home') {
    table(b, P, hw * 0.35, hd * 0.25, 0.1);
    stool(b, P, hw * 0.35 - 0.95, hd * 0.25);
    stool(b, P, hw * 0.35 + 0.95, hd * 0.25 + 0.1);
    // a bed in the back corner, a shelf on the left wall
    const bx = hw - 0.5,
      bz = hd - 1.05,
      by = gAt(b, bx, bz);
    box(P, 'beam', 0.95, 0.35, 2.05, bx, by + 0.2, bz);
    P.cloth.push(new THREE.BoxGeometry(0.88, 0.12, 1.55).translate(bx, by + 0.42, bz + 0.2));
    const sx = -hw + 0.2,
      sy = gAt(b, sx, 0);
    for (const y of [0.4, 1.0, 1.6]) box(P, 'planks', 0.32, 0.04, 1.6, sx, sy + y, 0);
    for (const z of [-0.78, 0.78]) box(P, 'beam', 0.32, 1.8, 0.05, sx, sy + 0.9, z);
    cache(b, g, ...corner(w, d));
  } else if (b.furnish === 'radio') {
    R();
    radioRoom(b, P, w, d);
    radioShack(b, P, w, d);
  } // (slice 23; polish: scanned props, radioRoom. The stool that stood here drew from the world's stream: it draws as it did)
  else if (b.furnish === 'outpost')
    outpost(b, P, g, w, d); // (slice 23 polish: a small polar research station, below with the places)
  else {
    rubble(b, P, b.moss ? 'moss' : b.mat, hw - 0.8, hd - 0.8, 1.4, 14);
    rubble(b, P, b.moss ? 'moss' : b.mat, -hw + 0.9, 0.4, 1.1, 10);
    const y = gAt(b, -0.5, hd * 0.4);
    box(P, 'beam', w * 0.85, 0.18, 0.2, -0.3, y + 0.55, hd * 0.4, 0.15, 0, 0.18); // a fallen roof beam
    if (R() < 0.6) cache(b, g, ...corner(w, d));
  }
}

function buildHouse(b, P, g) {
  const { w, d, h } = b,
    k = b.moss ? 'moss' : b.mat;
  room(
    b,
    P,
    k,
    w,
    d,
    h,
    [door(0), ...(w > 6.2 ? [win(-w * 0.3), win(w * 0.3)] : [])],
    w > 5.2 ? [win(0)] : [],
    d > 5.4 ? [win(0)] : [],
    [win(-d * 0.15)],
  );
  floor(b, P, b.furnish === 'home' ? 'planks' : 'floor', w - 0.45, d - 0.45);
  if (b.hermit) {
    const gz = (z) => Math.max(gAt(b, -0.8, z), gAt(b, 0, z), gAt(b, 0.8, z)),
      z0 = -d / 2 - 1.2,
      y0 = gz(z0) + 0.24;
    let k = 1;
    for (let z = z0 - 0.5; z > z0 - 11; z -= 0.5) k = Math.min(k, (y0 - gz(z) - 0.14) / (z0 - z));
    const jy = (b.jy = (z) => Math.max(y0 - Math.max(0, k) * (z0 - z), WATER_Y + 0.45)); // (one even ramp down from his door to the water, then level) // (slice 23) the hermit's jetty (polish: on the ground ashore, level over the water, on stringers)
    for (let z = -d / 2 - 1.2; z > -d / 2 - 12; z -= 0.5)
      box(P, 'planks', 1.6, 0.07, 0.45, 0, jy(z) - 0.035, z, R() * 0.06 - 0.03);
    for (let z = -d / 2 - 1.2; z > -d / 2 - 11.6; z -= 1.05)
      for (const sx of [-0.6, 0.6]) bar(P, 'beam', sx, jy(z) - 0.13, z, sx, jy(z - 1.05) - 0.13, z - 1.05, 0.12);
    for (let z = -d / 2 - 2; z > -d / 2 - 12; z -= 2.5)
      for (const sx of [-0.75, 0.75]) box(P, 'beam', 0.14, 2.4, 0.14, sx, Math.max(gAt(b, sx, z), 0) - 0.6, z);
    surface(b, (lx, lz) => (Math.abs(lx) <= 0.8 && lz < -d / 2 - 1 && lz > -d / 2 - 12 ? jy(lz) : null));
    hermitYard(b, P);
  }
  if (b.roof === 'gable') {
    gable(b, P, w, d, h, Math.min(2, d * 0.32), k);
    // the door itself, standing open into the room against its jamb (solid: thin posts keep the walk off it)
    const [dl] = b.doors;
    box(P, 'planks', 0.06, 2.15, 1.5, dl.lx + 0.76, b.y + 1.08, dl.lz + 0.75, 0);
    collideRun(b, dl.lx + 0.76, dl.lz + 0.2, dl.lx + 0.76, dl.lz + 1.4, 0.1);
  } else if (b.roof === 'flat') {
    // adobe: a flat roof on log beams (their ends stick out of the wall), fallen in at the back
    box(b.PR, 'plaster', w + 0.3, 0.22, d * 0.55, 0, b.y + h + 0.05, -d * 0.22);
    surface(b, (lx, lz) =>
      Math.abs(lx) <= (w + 0.3) / 2 && Math.abs(lz + d * 0.22) <= d * 0.275 ? b.y + h + 0.16 : null,
    );
    for (let x = -w / 2 + 0.5; x < w / 2; x += 0.85)
      P.beam.push(
        new THREE.CylinderGeometry(0.09, 0.1, d * 0.62, 7)
          .rotateX(Math.PI / 2)
          .translate(x, b.y + h - 0.14, -d * 0.31 - 0.05),
      );
  } else if (b.roof === 'fallen') {
    // a few rafters fell in: each leans from the back wall's top down to the floor (they used to
    // tilt up into the room from the wall, unsupported, and read as floating: the owner, 2026-11-03); the rest of the roof lies on the floor
    const top = h * (1 - (b.ruin || 0) * 0.3) - 0.2;
    for (let x = -w / 2 + 0.6; x < w / 2 - 0.3; x += 1.3) {
      const len = 1.2 + R() * d * 0.45;
      if (R() < 0.35) continue;
      const a = Math.asin(Math.min(0.95, top / len));
      box(
        P,
        'beam',
        0.14,
        0.18,
        len,
        x,
        b.y + 0.05 + (len * Math.sin(a)) / 2,
        d / 2 - 0.2 - (len * Math.cos(a)) / 2,
        0,
        -a,
      );
    }
    box(P, 'roof', w * 0.45, 0.14, d * 0.4, w * 0.15, gAt(b, w * 0.15, -d * 0.05) + 0.55, -d * 0.05, 0.3, 0.32, 0.12);
  }
  // a porch (issue #17): a deck, two posts and a lean-to roof in front of the door of about a third of the intact gable houses; it is
  // picked from the house's place, never from the world's random stream (nothing else moves), and in the classic world only on what is new there
  if (
    b.roof === 'gable' &&
    (SEED !== DEFAULT_SEED || b.isNew) &&
    (((Math.round(b.x * 10) * 73856093) ^ (Math.round(b.z * 10) * 19349663)) >>> 0) % 3 === 0 &&
    (() => {
      const pz = -d / 2 - 1.1,
        ys = [-1.6, 1.6].flatMap((x) => [pz - 0.9, pz + 0.9].map((z) => gAt(b, x, z)));
      return Math.max(...ys) - Math.min(...ys) < 0.3;
    })()
  ) {
    b.porch = true; // (only on level ground: on a slope the deck would hover or sink)
    porchOn(b, P, g);
  } // (slice 36, Jared, November 14, 2026: "the porches don't look like they are actually touching structurally": now a ledger on the wall, posts on piers, the deck at the sill)
  furnish(b, P, g, w, d);
}

// IW1's watchtower: a square brick tower with arrow slits, crenellations and a broken crown, a ladder inside
function buildTower(b, P, g) {
  const { w, d, h } = b,
    slit = (at) => [
      win(at, 0.32, [
        [3.6, 4.8],
        [7.2, 8.4],
      ]),
    ];
  b.minTop = 0.85;
  room(b, P, 'brick', w, d, h, [door(0, 1.7, 2.5), ...slit(-1.9), ...slit(1.9)], slit(0), slit(0), slit(0));
  for (const y of [b.y + 2.9, b.y + 6.2])
    for (const [sx, sz] of [
      [w + b.t + 0.16, 0.16],
      [0.16, d + b.t + 0.16],
    ])
      for (const s of [-1, 1]) // stone string courses
        box(P, 'wall', sx, 0.24, sz, sx > 1 ? 0 : (s * (w + b.t)) / 2, y, sx > 1 ? (s * (d + b.t)) / 2 : 0);
  const t = b.t,
    top = b.y + h; // merlons along the parapet (missing where the crown has fallen)
  for (const [x0, z0, x1, z1] of [
    [-w / 2, -d / 2, w / 2, -d / 2],
    [w / 2, d / 2, -w / 2, d / 2],
    [-w / 2, d / 2, -w / 2, -d / 2],
    [w / 2, -d / 2, w / 2, d / 2],
  ])
    for (let s = 0.4; s < 1; s += 0.3) {
      const x = x0 + (x1 - x0) * s,
        z = z0 + (z1 - z0) * s;
      if (vnoise(x * 0.7 + b.seed, z * 0.7) > 0.55) continue;
      box(P, 'brick', 0.8, 0.9, 0.8, x, top - h * 0.1 + 0.2, z);
    }
  floor(b, P, 'floor', w - t, d - t);
  const fw = (w - t) / 2,
    z0 = -d * 0.005,
    z1 = d * 0.445,
    hz = d / 2 - t / 2 - 1.55; // the old upper floor, half gone, with a hatch the ladder comes up through
  for (const s of [-1, 1]) box(P, 'beam', fw - 0.55, 0.2, z1 - z0, (s * (fw + 0.55)) / 2, b.y + 5.6, (z0 + z1) / 2);
  box(P, 'beam', 1.1, 0.2, hz - z0, 0, b.y + 5.6, (z0 + hz) / 2);
  surface(b, (lx, lz) =>
    Math.abs(lx) <= fw && lz >= z0 && lz <= z1 && !(Math.abs(lx) < 0.55 && lz > hz) ? b.y + 5.7 : null,
  ); // the ladder climbs to it (slice 9b)
  // (face: off the ladder turned along the floor, not at its broken edge 0.7 m ahead: Jared, November 15, 2026, the ladder that kept bouncing)
  ladders.push({
    b,
    y0: b.y,
    y1: b.y + 5.7,
    off: toW(b, 0, hz - 0.5),
    face: [b.ca, b.sa],
    at: (y) => toW(b, 0, d / 2 - t / 2 - 0.25 - (y - b.y) * 0.08 - 0.42),
  });
  for (const s of [-0.25, 0.25]) box(P, 'beam', 0.07, 5.8, 0.08, s, b.y + 2.85, d / 2 - t / 2 - 0.25, 0, -0.08);
  for (let y = 0.4; y < 5.6; y += 0.35) box(P, 'beam', 0.5, 0.05, 0.05, 0, b.y + y, d / 2 - t / 2 - 0.25 - y * 0.08);
  rubble(b, P, 'brick', w / 2 - 1.2, -d / 2 + 1.3, 1.1, 12);
  cache(b, g, -w / 2 + 1, -d / 2 + 1.1);
}

// the gas station (IW1's GAS STATION; its detail pass, Jared, November 15, 2026: "the gas station still needs the detail/quality
// pass"): a cracked concrete forecourt with oil stains and faded lane arrows; a steel canopy on four posts (guard collars at their
// feet), its fascia in the old brand's livery, panels and dead light fittings under it, one panel hanging; two pump islands, each a
// painted curb with bollards at its ends and a pump in the brand's red (its face, dial and grade buttons, hoses on their nozzles,
// one hose cut); the shop and service bay at the back (a glass shop door hung open, its front window and sign board, the bay's
// roller door stuck up over head height, a boarded window, rust down the walls, the roof's coping and a dead air conditioner);
// inside: the counter and its till, shelves of tins, a drinks fridge, a car lift in the bay, the workbench under a pegboard, tyres
// and drums; a lantern on the counter, one on the bench and one hung under the canopy, so the place reads at night; the pole sign
// with its price board, a number missing. Everything solid between waist and head height has a collider (walktest 'gas')
let GM = null;
function gasMats() {
  if (GM) return GM;
  const r = mulberry32(31),
    rnd = (a, c) => a + r() * (c - a);
  const wear = (x, w, h, n = 120, rust = 0.5) => {
    for (let i = 0; i < n; i++) {
      const rs = r() < rust;
      x.fillStyle = rs
        ? `rgba(${110 + r() * 50},${50 + r() * 30},20,${0.15 + r() * 0.35})`
        : `rgba(30,28,24,${0.05 + r() * 0.15})`;
      x.fillRect(r() * w, r() * h, 1 + r() * (rs ? 6 : 3), 1 + r() * (rs ? 8 : 3));
    }
  };
  const drips = (x, w, y0, n, len) => {
    for (let i = 0; i < n; i++) {
      x.fillStyle = `rgba(${105 + r() * 40},${48 + r() * 22},18,${0.12 + r() * 0.3})`;
      x.fillRect(r() * w, y0 + r() * 6, 1.5 + r() * 3, len * (0.3 + r()));
    }
  };
  const logo = (x, cx, cy, s) => {
    x.fillStyle = '#b8261b';
    x.beginPath();
    x.arc(cx, cy, s, 0, 6.283);
    x.fill();
    x.fillStyle = '#ece8dc';
    x.beginPath();
    x.moveTo(cx - s * 0.7, cy + s * 0.35);
    x.lineTo(cx - s * 0.15, cy - s * 0.45);
    x.lineTo(cx + s * 0.15, cy - s * 0.05);
    x.lineTo(cx + s * 0.35, cy - s * 0.3);
    x.lineTo(cx + s * 0.75, cy + s * 0.35);
    x.closePath();
    x.fill();
  };
  const S = (o, cut = false) => {
      const m = new THREE.MeshStandardMaterial({ roughness: 0.7, ...o });
      if (cut) m.clippingPlanes = [CUT];
      return m;
    },
    rep = (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    };
  const decal = (map) =>
    S({
      map,
      transparent: true,
      depthWrite: false,
      roughness: 0.95,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  GM = {
    // the canopy's fascia, 4 m of it a repeat: cream panels, the brand's red and blue bands, its name and mark, rust run down from the joints
    fascia: S({
      roughness: 0.55,
      metalness: 0.2,
      map: rep(
        canvasTex(
          512,
          102,
          (x, w, h) => {
            x.fillStyle = '#b8261b';
            x.fillRect(0, h * 0.66, w, h * 0.2);
            x.fillStyle = '#1d3f74';
            x.fillRect(0, h * 0.88, w, h * 0.07);
            logo(x, w * 0.2, h * 0.36, 26);
            x.fillStyle = '#b8261b';
            x.font = 'bold 52px sans-serif';
            x.textAlign = 'left';
            x.fillText('RIDGE', w * 0.29, h * 0.55);
            x.fillStyle = '#1d3f74';
            x.font = 'bold 22px sans-serif';
            x.fillText('FUEL', w * 0.66, h * 0.55);
            x.fillStyle = 'rgba(40,36,30,0.55)';
            for (const u of [0, w / 2]) x.fillRect(u, 0, 2, h);
            drips(x, w, 0, 40, 46);
            drips(x, w, h * 0.66, 40, 34);
            wear(x, w, h, 700, 0.5);
            x.fillStyle = 'rgba(80,66,46,0.26)';
            x.fillRect(0, 0, w, h);
            for (let i = 0; i < 6; i++) {
              const gr = x.createLinearGradient(0, 0, 0, h),
                u = r() * w;
              gr.addColorStop(0, 'rgba(60,48,34,0.45)');
              gr.addColorStop(1, 'rgba(60,48,34,0)');
              x.fillStyle = gr;
              x.fillRect(u, 0, 30 + r() * 60, h);
            }
          },
          '#d8d0bd',
        ),
      ),
    }),
    // under the canopy: painted steel panels, water stains
    soffit: S({
      roughness: 0.8,
      side: THREE.DoubleSide,
      map: canvasTex(
        256,
        256,
        (x, w, h) => {
          x.fillStyle = '#9a968c';
          for (let i = 0; i <= w; i += 64) {
            x.fillRect(i - 1, 0, 2, h);
            x.fillRect(0, i - 1, w, 2);
          }
          for (let i = 0; i < 9; i++) {
            const gr = x.createRadialGradient(0, 0, 0, 0, 0, 1),
              cx = r() * w,
              cy = r() * h,
              s = 10 + r() * 30;
            gr.addColorStop(0, 'rgba(120,90,50,0.28)');
            gr.addColorStop(1, 'rgba(120,90,50,0)');
            x.save();
            x.translate(cx, cy);
            x.scale(s, s * 0.6);
            x.fillStyle = gr;
            x.fillRect(-1, -1, 2, 2);
            x.restore();
          }
          wear(x, w, h, 140, 0.25);
        },
        '#cfcbc0',
      ),
    }),
    lens: S({ color: 0x8e918c, roughness: 0.45 }),
    steel: S({
      roughness: 0.6,
      metalness: 0.35,
      map: rep(
        canvasTex(
          128,
          128,
          (x, w, h) => {
            drips(x, w, 0, 14, 70);
            wear(x, w, h, 160, 0.55);
          },
          '#7c7a74',
        ),
      ),
    }),
    drinks: S(
      {
        roughness: 0.5,
        map: canvasTex(
          256,
          48,
          (x, w, h) => {
            x.fillStyle = '#b8261b';
            x.font = 'bold 30px sans-serif';
            x.textAlign = 'center';
            x.fillText('COLD DRINKS', w / 2, 35);
            wear(x, w, h, 50, 0.3);
          },
          '#ece8dc',
        ),
      },
      true,
    ),
    glow: Object.assign(
      new THREE.MeshBasicMaterial({
        color: 0xa8743c,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        map: canvasTex(
          64,
          64,
          (x, w, h) => {
            const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
            gr.addColorStop(0, 'rgba(255,255,255,1)');
            gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
            gr.addColorStop(1, 'rgba(255,255,255,0)');
            x.fillStyle = gr;
            x.fillRect(0, 0, w, h);
          },
          '#000',
        ),
      }),
      { clippingPlanes: [CUT] },
    ),
    // the pump's face: the brand's header, the dial (sale and gallons), the price strip, three grade buttons, the nozzle's bay
    face: S({
      roughness: 0.5,
      metalness: 0.15,
      map: canvasTex(
        256,
        512,
        (x, w, h) => {
          x.fillStyle = '#ece8dc';
          x.fillRect(10, 10, w - 20, 76);
          logo(x, 58, 48, 24);
          x.fillStyle = '#b8261b';
          x.font = 'bold 40px sans-serif';
          x.textAlign = 'left';
          x.fillText('RIDGE', 92, 64);
          x.fillStyle = '#d8d4c8';
          x.fillRect(22, 108, w - 44, 170);
          x.fillStyle = '#1b1d1c';
          x.fillRect(30, 116, w - 60, 154);
          x.fillStyle = '#e8e4d8';
          x.font = 'bold 15px sans-serif';
          x.fillText('TOTAL SALE  $', 40, 140);
          x.fillText('GALLONS', 40, 212);
          x.fillStyle = '#5a4a2a';
          x.font = 'bold 42px monospace';
          x.textAlign = 'right';
          x.fillText('00.00', w - 40, 186);
          x.fillText('0.000', w - 40, 258);
          x.fillStyle = 'rgba(255,255,255,0.08)';
          x.fillRect(30, 116, w - 60, 40);
          x.fillStyle = '#ece8dc';
          x.fillRect(22, 292, w - 44, 44);
          x.fillStyle = '#1b1d1c';
          x.textAlign = 'left';
          x.font = 'bold 17px sans-serif';
          x.fillText('PRICE PER GALLON', 32, 320);
          x.font = 'bold 24px monospace';
          x.fillText('1.29', w - 92, 322);
          for (const [k, [c, t]] of [
            ['#d8a420', '87'],
            ['#2f6fc0', '89'],
            ['#2a8a46', '93'],
          ].entries()) {
            x.fillStyle = '#1b1d1c';
            x.fillRect(26 + k * 72, 350, 62, 46);
            x.fillStyle = c;
            x.fillRect(30 + k * 72, 354, 54, 38);
            x.fillStyle = '#111';
            x.font = 'bold 22px sans-serif';
            x.textAlign = 'center';
            x.fillText(t, 57 + k * 72, 381);
          }
          x.fillStyle = '#5a1712';
          x.fillRect(40, 412, w - 80, 84);
          x.fillStyle = 'rgba(0,0,0,0.35)';
          x.fillRect(40, 412, w - 80, 8);
          drips(x, w, 90, 20, 60);
          drips(x, w, 400, 14, 50);
          wear(x, w, h, 260, 0.6);
        },
        '#bf2c22',
      ),
    }),
    body: S({
      roughness: 0.55,
      metalness: 0.2,
      map: rep(
        canvasTex(
          128,
          128,
          (x, w, h) => {
            drips(x, w, 0, 12, 50);
            wear(x, w, h, 120, 0.6);
          },
          '#b42c22',
        ),
      ),
    }),
    band: S(
      {
        roughness: 0.6,
        metalness: 0.1,
        map: rep(
          canvasTex(
            128,
            128,
            (x, w, h) => {
              drips(x, w, 0, 10, 60);
              wear(x, w, h, 90, 0.5);
            },
            '#b42c22',
          ),
        ),
      },
      true,
    ),
    white: S({
      roughness: 0.6,
      metalness: 0.2,
      map: rep(
        canvasTex(
          128,
          128,
          (x, w, h) => {
            drips(x, w, 0, 16, 90);
            wear(x, w, h, 160, 0.55);
          },
          '#d8d4c8',
        ),
      ),
    }),
    // worn yellow and black: the islands' curbs and the posts' guard collars; the bollards' bands
    hazard: S({
      roughness: 0.75,
      map: rep(
        canvasTex(
          128,
          128,
          (x, w, h) => {
            x.fillStyle = '#1c1b18';
            for (let i = -w; i < w * 2; i += 32) {
              x.beginPath();
              x.moveTo(i, 0);
              x.lineTo(i + 16, 0);
              x.lineTo(i + 16 + h, h);
              x.lineTo(i + h, h);
              x.closePath();
              x.fill();
            }
            for (let i = 0; i < 260; i++) {
              x.fillStyle = r() < 0.5 ? 'rgba(160,150,130,0.6)' : 'rgba(70,50,30,0.4)';
              x.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 3);
            }
          },
          '#d8a820',
        ),
      ),
    }),
    bollard: S({
      roughness: 0.6,
      metalness: 0.3,
      map: canvasTex(
        64,
        128,
        (x, w, h) => {
          x.fillStyle = '#1c1b18';
          x.fillRect(0, 8, w, 14);
          x.fillRect(0, 34, w, 14);
          wear(x, w, h, 70, 0.6);
        },
        '#d8a820',
      ),
    }),
    // the shop's sign board, the pole sign's face and its price board (a figure fallen off)
    board: S({
      roughness: 0.6,
      map: canvasTex(
        512,
        96,
        (x, w, h) => {
          x.fillStyle = '#b8261b';
          x.fillRect(0, 0, w, 10);
          x.fillRect(0, h - 10, w, 10);
          logo(x, 50, h / 2, 28);
          x.fillStyle = '#1d3f74';
          x.font = 'bold 34px sans-serif';
          x.textAlign = 'left';
          x.fillText('FOOD · DRINKS · SERVICE', 92, 61);
          drips(x, w, h - 10, 30, 40);
          wear(x, w, h, 200, 0.45);
        },
        '#ece8dc',
      ),
    }),
    signFace: S({
      roughness: 0.55,
      metalness: 0.1,
      map: canvasTex(
        256,
        136,
        (x, w, h) => {
          x.strokeStyle = '#ece8dc';
          x.lineWidth = 6;
          x.strokeRect(10, 10, w - 20, h - 20);
          logo(x, 62, h / 2, 34);
          x.fillStyle = '#ece8dc';
          x.beginPath();
          x.arc(62, h / 2, 34, 0, 6.283);
          x.lineWidth = 4;
          x.stroke();
          x.font = 'bold 54px sans-serif';
          x.textAlign = 'left';
          x.fillText('FUEL', 106, 86);
          x.font = 'bold 15px sans-serif';
          x.fillText('RIDGE OIL CO.', 108, 112);
          drips(x, w, 10, 22, 50);
          wear(x, w, h, 180, 0.55);
        },
        '#a8241a',
      ),
    }),
    price: S({
      roughness: 0.6,
      map: canvasTex(
        256,
        128,
        (x, w, h) => {
          x.fillStyle = '#1b1d1c';
          x.font = 'bold 20px sans-serif';
          x.textAlign = 'left';
          x.fillText('UNLEADED', 14, 44);
          x.fillText('DIESEL', 14, 100);
          const tile = (cx, cy, t) => {
            x.fillStyle = '#1b1d1c';
            x.fillRect(cx, cy, 24, 36);
            if (t) {
              x.fillStyle = '#ece8dc';
              x.font = 'bold 28px monospace';
              x.textAlign = 'center';
              x.fillText(t, cx + 12, cy + 28);
            }
          };
          [
            ['1', 120],
            ['.', 0],
            ['2', 150],
            [null, 176],
            ['9', 202],
          ].forEach(([t, cx]) => {
            if (cx) tile(cx, 16, t);
            else {
              x.fillStyle = '#1b1d1c';
              x.fillRect(146, 46, 4, 4);
            }
          });
          x.strokeStyle = 'rgba(30,30,30,0.35)';
          x.lineWidth = 2;
          x.strokeRect(176, 16, 24, 36);
          x.fillStyle = '#ece8dc';
          x.fillRect(178, 18, 20, 32); // (the missing figure: its clean square)
          [
            ['1', 120],
            ['3', 150],
            ['9', 176],
            ['9', 202],
          ].forEach(([t, cx]) => tile(cx, 72, t));
          x.fillStyle = '#1b1d1c';
          x.fillRect(146, 102, 4, 4);
          drips(x, w, 0, 18, 60);
          wear(x, w, h, 160, 0.5);
        },
        '#e2ddce',
      ),
    }),
    ice: S({
      roughness: 0.5,
      map: canvasTex(
        256,
        128,
        (x, w, h) => {
          x.fillStyle = '#2a5aa8';
          x.font = 'bold 72px sans-serif';
          x.textAlign = 'center';
          x.fillText('ICE', w / 2, 88);
          x.fillStyle = 'rgba(42,90,168,0.6)';
          x.fillRect(0, h - 18, w, 10);
          drips(x, w, h - 30, 24, 40);
          wear(x, w, h, 120, 0.5);
        },
        '#e6ecef',
      ),
    }),
    peg: S(
      {
        roughness: 0.9,
        map: canvasTex(
          256,
          128,
          (x, w, h) => {
            x.fillStyle = '#3a2a1c';
            for (let i = 6; i < w; i += 10) for (let j = 6; j < h; j += 10) x.fillRect(i, j, 3, 3);
            x.strokeStyle = 'rgba(235,230,215,0.7)';
            x.lineWidth = 3;
            for (const [a, c, d, e] of [
              [30, 20, 14, 80],
              [70, 24, 10, 70],
              [150, 30, 50, 12],
              [210, 18, 12, 90],
            ])
              x.strokeRect(a, c, d, e);
            x.beginPath();
            x.arc(110, 50, 16, 0, 6.283);
            x.stroke();
            wear(x, w, h, 80, 0.2);
          },
          '#8a6a48',
        ),
      },
      true,
    ),
    // the forecourt's marks: oil, cracks, a faded lane arrow; rust run down the shop's walls
    oil: decal(
      canvasTex(
        128,
        128,
        (x, w, h) => {
          for (let i = 0; i < 7; i++) {
            const gr = x.createRadialGradient(0, 0, 0, 0, 0, 1);
            gr.addColorStop(0, 'rgba(16,14,12,0.75)');
            gr.addColorStop(0.7, 'rgba(16,14,12,0.35)');
            gr.addColorStop(1, 'rgba(16,14,12,0)');
            x.save();
            x.translate(w / 2 + rnd(-30, 30), h / 2 + rnd(-30, 30));
            x.rotate(r() * 3);
            x.scale(rnd(14, 40), rnd(10, 30));
            x.fillStyle = gr;
            x.fillRect(-1, -1, 2, 2);
            x.restore();
          }
        },
        '#141210',
      ),
    ),
    crack: decal(
      canvasTex(
        256,
        256,
        (x, w, h) => {
          x.strokeStyle = 'rgba(26,22,18,0.8)';
          for (let k = 0; k < 3; k++) {
            let px = rnd(20, 60),
              py = rnd(20, w - 20);
            x.lineWidth = 2.5;
            x.beginPath();
            x.moveTo(px, py);
            while (px < w - 20) {
              px += rnd(8, 22);
              py += rnd(-14, 14);
              x.lineTo(px, py);
              if (r() < 0.2) {
                x.stroke();
                x.lineWidth = Math.max(0.8, x.lineWidth * 0.8);
                x.beginPath();
                x.moveTo(px, py);
              }
            }
            x.stroke();
          }
        },
        '#1a1612',
      ),
    ),
    arrow: decal(
      canvasTex(
        128,
        256,
        (x, w, h) => {
          x.fillStyle = 'rgba(232,228,214,0.65)';
          x.fillRect(w / 2 - 14, 90, 28, 150);
          x.beginPath();
          x.moveTo(w / 2, 14);
          x.lineTo(w / 2 + 50, 96);
          x.lineTo(w / 2 - 50, 96);
          x.closePath();
          x.fill();
          x.globalCompositeOperation = 'destination-out';
          for (let i = 0; i < 500; i++) {
            x.fillStyle = `rgba(0,0,0,${0.4 + r() * 0.6})`;
            x.fillRect(r() * w, r() * h, 1 + r() * 5, 1 + r() * 4);
          }
        },
        '#e8e4d6',
      ),
    ),
    streak: decal(
      canvasTex(
        64,
        256,
        (x, w, h) => {
          for (let i = 0; i < 26; i++) {
            const gr = x.createLinearGradient(0, 0, 0, h),
              a = 0.2 + r() * 0.4;
            gr.addColorStop(0, `rgba(110,56,22,${a})`);
            gr.addColorStop(rnd(0.3, 1), 'rgba(110,56,22,0)');
            x.fillStyle = gr;
            x.fillRect(r() * w, 0, 1 + r() * 4, h);
          }
        },
        '#6e381a',
      ),
    ),
  };
  GM.streak.clippingPlanes = [CUT];
  for (const k of ['steel', 'white', 'body']) {
    GM[k + 'In'] = GM[k].clone();
    if (k === 'steel') GM.steelIn.color.set(0xc4c8c4);
    GM[k + 'In'].clippingPlanes = [CUT];
  } // (the shop's own steel, fridge and lift: cut away with its walls; the canopy's and the sign's stay whole)
  return GM;
}
// a pump island at sx: the curb and its paint, a pump (the face to each lane), its hoses on their nozzles (cut: the second side's
// hose lies on the island), a bollard at each end; and their colliders
function gasIsland(b, P, G, sx, cut) {
  const z0 = -5.6,
    z1 = -2.4,
    top = Math.max(...[z0, -4, z1].flatMap((z) => [sx - 0.5, sx + 0.5].map((x) => gAt(b, x, z)))) + 0.2;
  box(P, 'concrete', 1.0, top - b.y + 0.5, z1 - z0, sx, (top + b.y - 0.5) / 2, (z0 + z1) / 2);
  box(G, 'hazard', 1.012, 0.16, z1 - z0 + 0.012, sx, top - 0.085, (z0 + z1) / 2);
  surface(b, (lx, lz) => (Math.abs(lx - sx) <= 0.5 && lz >= z0 && lz <= z1 ? top : null));
  for (const e of [-0.2, 0.2]) collideRun(b, sx + e, z0, sx + e, z1, 0.3, () => top); // (on a slope its low side is a wall; where it is a step, stepped onto)
  const y = top;
  box(P, 'concrete', 0.6, 0.12, 0.92, sx, y + 0.06, -4);
  box(G, 'steel', 0.46, 0.14, 0.82, sx, y + 0.19, -4);
  box(G, 'body', 0.42, 1.42, 0.78, sx, y + 0.97, -4);
  box(G, 'steel', 0.48, 0.05, 0.86, sx, y + 1.7, -4);
  for (const s of [-1, 1]) {
    G.face.push(new THREE.PlaneGeometry(0.74, 1.4).rotateY((s * Math.PI) / 2).translate(sx + s * 0.214, y + 0.97, -4));
    box(P, 'iron', 0.06, 0.16, 0.1, sx + s * 0.24, y + 0.72, -3.72); // the nozzle's holster
    const n = [sx + s * 0.29, y + 0.68, -3.72];
    box(P, 'iron', 0.07, 0.08, 0.24, n[0], n[1] + 0.06, n[2] + 0.02, 0, -0.5);
    box(P, 'iron', 0.03, 0.14, 0.03, n[0], n[1] - 0.02, n[2] + 0.12, 0, 0.3);
    const pts =
      cut && s > 0
        ? [
            [sx + 0.22, y + 1.35, -4.3],
            [sx + 0.36, y + 1.0, -4.42],
            [sx + 0.42, y + 0.3, -4.5],
            [sx + 0.45, y + 0.04, -4.85],
            [sx + 0.4, y + 0.04, -5.25],
          ] // (cut: down the side and along the curb)
        : [
            [sx + s * 0.22, y + 1.35, -4.3],
            [sx + s * 0.34, y + 1.05, -4.42],
            [sx + s * 0.36, y + 0.55, -4.1],
            [sx + s * 0.32, y + 0.62, -3.8],
            [n[0], n[1] + 0.08, n[2] - 0.1],
          ];
    G.hose.push(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 16, 0.024, 6, false),
    );
  }
  for (const z of [z0 + 0.2, z1 - 0.2]) {
    G.bollard.push(new THREE.CylinderGeometry(0.09, 0.09, 1.0, 12).translate(sx, y + 0.5, z));
    P.iron.push(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 12).translate(sx, y + 1.01, z));
    collideRun(b, sx, z, sx, z, 0.15, () => y + 1.0);
  }
  collideRun(b, sx, -4.3, sx, -3.7, 0.45, () => y + 1.72);
}
function buildGas(b, P, g) {
  floor(b, P, 'concrete', 16, 11, 0, -3, 0.06);
  const gw = 8,
    gd = 6.5,
    gz = 5.6,
    Z0 = gz - gd / 2,
    Z1 = gz + gd / 2,
    IX = gw / 2 - 0.175,
    F = (x, z) => gAt(b, x, z) + 0.07,
    G = Object.fromEntries(
      Object.keys(gasMats())
        .concat('hose')
        .map((k) => [k, []]),
    ),
    rnd = mulberry32(Math.round(b.seed * 1000) + 89),
    PI = Math.PI;
  for (let i = 0; i < 54; i++) R(); // (the old garage's rubble drew 54 from the world's stream; still drawn, so nothing built after the station moves. ponytail: drop once the classic world is re-baselined)
  b.roofBox = { cz: gz, w: gw, d: gd };
  b.t = 0.35;
  b.ruin = 0;
  b.h = 3.6; // the shop and bay, in the station's frame
  // the front: the shop's window and its glass door (hung open), the bay's roller door; a window in the back wall and one in the right (boarded)
  const IN = { line: 'inwall' };
  wall(
    b,
    P,
    'plaster',
    -gw / 2 - 0.175,
    Z0,
    gw / 2 + 0.175,
    Z0,
    3.6,
    [win(-3.0, 1.4, [[0.9, 2.1]]), door(-1.3, 1.1, 2.2), door(1.9, 3.0, 2.8)],
    IN,
  ); // (the stretch between the doors under 1.2 m: no wall spot for the walk test there)
  wall(b, P, 'plaster', gw / 2 + 0.175, Z1, -gw / 2 - 0.175, Z1, 3.6, [win(0, 1.6, [[1.1, 2.0]])], IN);
  wall(b, P, 'plaster', -gw / 2, Z1 - 0.175, -gw / 2, Z0 + 0.175, 3.6, [], IN);
  wall(b, P, 'plaster', gw / 2, Z0 + 0.175, gw / 2, Z1 - 0.175, 3.6, [win(0.6, 1.4, [[1.1, 2.0]])], IN);
  floor(b, P, 'concrete', gw - 0.35, gd - 0.35, 0, gz, 0.07);
  // the roof (it lifts off with the cut-away): the slab, its coping, a dead air conditioner and a vent stack
  box(b.PR, 'concrete', gw + 0.5, 0.25, gd + 0.5, 0, b.y + 3.72, gz);
  box(b.PR, 'ceil', gw - 0.36, 0.02, gd - 0.36, 0, b.y + 3.585, gz);
  /* (boards under the slab: not a black void from inside) */ for (const s of [-1, 1]) {
    box(b.PR, 'iron', gw + 0.6, 0.12, 0.08, 0, b.y + 3.9, gz + s * (gd / 2 + 0.26));
    box(b.PR, 'iron', 0.08, 0.12, gd + 0.6, s * (gw / 2 + 0.26), b.y + 3.9, gz);
  }
  box(b.PR, 'iron', 1.2, 0.7, 0.9, 1.8, b.y + 4.2, gz + 1.6);
  box(b.PR, 'iron', 0.8, 0.04, 0.8, 1.8, b.y + 4.57, gz + 1.6, 0.3);
  b.PR.iron.push(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 10).translate(-2.4, b.y + 4.3, gz + 2.3));
  // the shop's frontage: the window's frame (one pane left whole, a shard of the other), the door's frame and its leaf swung back against the
  // wall inside, the sign board over both, the red band round the walls at the eaves, rust run down from the band and the roof
  const fz = Z0 - 0.175;
  for (const [cx, w0, y0, y1] of [
    [-3.0, 1.4, 0.9, 2.1],
    [-1.3, 1.1, 0, 2.2],
  ]) {
    for (const s of [-1, 1]) box(G, 'steelIn', 0.06, y1 - y0, 0.12, cx + s * (w0 / 2 - 0.03), b.y + (y0 + y1) / 2, Z0);
    box(G, 'steelIn', w0, 0.06, 0.12, cx, b.y + y1 - 0.03, Z0);
    if (y0) box(G, 'steelIn', w0 + 0.1, 0.05, 0.3, cx, b.y + y0, fz + 0.1);
  }
  box(G, 'steelIn', 0.05, 1.08, 0.08, -3.0, b.y + 1.5, Z0);
  box(P, 'pane', 0.6, 1.08, 0.012, -3.33, b.y + 1.5, Z0);
  const shard = (pts, z) => {
    const g0 = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))),
      cx = pts.reduce((a, q) => a + q[0], 0) / pts.length;
    P.pane.push(g0.clone().translate(0, b.y, z), g0.translate(-cx, 0, 0).rotateY(PI).translate(cx, b.y, z));
  }; // (seen from both sides)
  shard(
    [
      [-2.95, 0.96],
      [-2.36, 0.96],
      [-2.36, 1.62],
      [-2.62, 1.31],
      [-2.8, 1.12],
    ],
    Z0,
  );
  {
    const hz = Z0 + 0.175 + 0.07,
      x0 = -0.72,
      x1 = x0 + 1.05;
    box(G, 'steelIn', x1 - x0, 2.1, 0.05, (x0 + x1) / 2, F(x0, hz) + 1.07, hz);
    box(P, 'pane', x1 - x0 - 0.14, 1.3, 0.06, (x0 + x1) / 2, F(x0, hz) + 1.3, hz);
    box(P, 'iron', 0.04, 0.04, 0.22, x1 - 0.15, F(x0, hz) + 1.0, hz - 0.08);
  }
  box(G, 'steel', 3.6, 0.62, 0.08, -2.2, b.y + 2.72, fz - 0.06);
  G.board.push(new THREE.PlaneGeometry(3.5, 0.54).rotateY(PI).translate(-2.2, b.y + 2.72, fz - 0.104));
  for (const [x0, z0, x1, z1] of [
    [-gw / 2 - 0.175, fz, gw / 2 + 0.175, fz],
    [gw / 2 + 0.175, Z1 + 0.175, -gw / 2 - 0.175, Z1 + 0.175],
    [-gw / 2 - 0.175, Z1 + 0.175, -gw / 2 - 0.175, fz],
    [gw / 2 + 0.175, fz, gw / 2 + 0.175, Z1 + 0.175],
  ]) {
    const L = Math.hypot(x1 - x0, z1 - z0),
      ux = (x1 - x0) / L,
      uz = (z1 - z0) / L,
      nx = uz,
      nz = -ux,
      ry = Math.atan2(nx, nz);
    box(G, 'band', L + 0.02, 0.32, 0.03, (x0 + x1) / 2 + nx * 0.016, b.y + 3.22, (z0 + z1) / 2 + nz * 0.016, ry);
    for (let s = 0.3; s < L - 0.3; s += 0.9 + rnd() * 1.4) {
      const h = 0.8 + rnd() * 1.4,
        w = 0.25 + rnd() * 0.5,
        cx = x0 + ux * s,
        cz = z0 + uz * s;
      if (
        (z0 === fz &&
          z1 === fz &&
          [
            [-3, 0.7],
            [-1.3, 0.55],
            [1.9, 1.5],
            [-2.2, 1.8],
          ].some(([hx, hw]) => Math.abs(cx - hx) < hw + w / 2)) ||
        (z0 === Z1 + 0.175 && Math.abs(cx) < 0.8 + w / 2) ||
        (x0 === gw / 2 + 0.175 && Math.abs(cz - gz - 0.6) < 0.7 + w / 2)
      )
        continue;
      /* (none over the front's openings, nor behind its sign board) */ G.streak.push(
        new THREE.PlaneGeometry(w, h).rotateY(ry).translate(cx + nx * 0.035, b.y + 3.06 - h / 2, cz + nz * 0.035),
      );
    }
  }
  // the bay's roller door: its drum housing over the opening inside and the curtain's last slats, stuck up over head height
  box(G, 'steelIn', 3.2, 0.42, 0.42, 1.9, b.y + 3.05, Z0 + 0.4);
  for (let k = 0; k < 5; k++)
    box(G, 'steelIn', 3.0, 0.1, 0.04 + (k % 2) * 0.02, 1.9, b.y + 2.79 - k * 0.1 - 0.02 * (k === 4), Z0 + 0.2);
  // the right window boarded over (outside), the back window's glass gone but a shard
  {
    const x = gw / 2 + 0.175 + 0.03;
    for (const [a, c] of [
      [0.5, 0.35],
      [-0.45, -0.3],
      [0.05, 0.1],
    ])
      box(P, 'planks', 0.025, 0.16, 1.75, x, b.y + 1.55 + c * 0.3, gz + 0.6, 0, a);
  }
  shard(
    [
      [-0.78, 1.12],
      [-0.2, 1.12],
      [-0.5, 1.5],
    ],
    Z1,
  );
  for (const [along, c, w0] of [
    [true, Z1, 1.6],
    [false, gw / 2, 1.4],
  ]) {
    const m = along ? [0, c] : [c, gz + 0.6],
      B = (a, h, x, y) =>
        along
          ? box(G, 'steelIn', a, h, 0.1, m[0] + x, b.y + y, m[1])
          : box(G, 'steelIn', 0.1, h, a, m[0], b.y + y, m[1] + x);
    for (const s of [-1, 1]) B(0.06, 0.9, s * (w0 / 2 - 0.03), 1.55);
    B(w0, 0.06, 0, 1.97);
    B(w0, 0.06, 0, 1.13);
    B(0.04, 0.84, 0, 1.55);
  } // (the back and right windows' frames)
  // the canopy: a steel deck, its fascia all round, panels and light fittings under it (one fitting dead and hanging, a panel down at
  // one end), four posts in guard collars; the islands and their pumps (the right one's far hose cut)
  const cy = b.y + 4.55,
    CW = 12,
    CD = 7.2,
    cz = -4;
  box(G, 'steel', CW, 0.3, CD, 0, cy, cz);
  G.soffit.push(new THREE.PlaneGeometry(CW - 0.04, CD - 0.04).rotateX(PI / 2).translate(0, cy - 0.16, cz));
  for (const [L, x, z, ry] of [
    [CW + 0.1, 0, cz - CD / 2 - 0.03, PI],
    [CW + 0.1, 0, cz + CD / 2 + 0.03, 0],
    [CD + 0.1, -CW / 2 - 0.03, cz, -PI / 2],
    [CD + 0.1, CW / 2 + 0.03, cz, PI / 2],
  ]) {
    const f = new THREE.BoxGeometry(L, 0.8, 0.04),
      uv = f.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * L) / 4);
    G.fascia.push(f.rotateY(ry).translate(x, cy + 0.12, z));
  }
  for (const x of [-3.4, 0, 3.4])
    for (const z of [cz - 1.8, cz + 1.8]) {
      if (!(x === 3.4 && z > cz)) box(G, 'lens', 1.2, 0.08, 0.45, x, cy - 0.2, z);
      box(G, 'steel', 1.26, 0.04, 0.5, x, cy - 0.17, z);
    }
  // (hung on its wire)
  for (const sx of [-4.8, 4.8])
    for (const sz of [cz - 2.6, cz + 2.6]) {
      const y0 = gAt(b, sx, sz);
      box(G, 'white', 0.3, cy - y0 - 0.1, 0.3, sx, (cy + y0) / 2 - 0.05, sz);
      box(G, 'hazard', 0.5, 1.0, 0.5, sx, y0 + 0.45, sz);
      box(P, 'concrete', 0.56, 0.06, 0.56, sx, y0 + 0.97, sz);
      collideRun(b, sx, sz, sx, sz, 0.36, () => cy + 0.2);
    }
  gasIsland(b, P, G, -1.7, false);
  gasIsland(b, P, G, 1.7, true);
  // the forecourt's marks, and outside the shop an ice chest and a stack of tyres
  const mark = (k, x, z, w, d, ry = 0) =>
    G[k].push(
      new THREE.PlaneGeometry(w, d)
        .rotateX(-PI / 2)
        .rotateY(ry)
        .translate(x, gAt(b, x, z) + 0.075, z),
    );
  for (const [x, z, s] of [
    [-0.6, -4.2, 1.6],
    [0.7, -3.3, 1.1],
    [-3.2, -3.6, 1.4],
    [3.1, -4.6, 1.8],
    [2.1, 4.9, 1.6],
    [2.6, 0.8, 1.0],
    [-5.6, -1.2, 0.9],
  ])
    mark('oil', x, z, s, s * 0.8, rnd() * 3);
  for (const [x, z, s] of [
    [-4.5, -7.0, 2.6],
    [5.6, -2.0, 2.6],
    [-6.4, 0.6, 2.4],
    [1.0, -7.2, 2.2],
    [6.8, -7.3, 2.0],
  ])
    mark('crack', x, z, s, s, rnd() * 3);
  for (const x of [-3.25, 3.25]) mark('arrow', x, -4.6, 0.9, 1.8, x < 0 ? 0 : PI);
  const put = kitRoom(b);
  {
    const x = -3.3,
      z = Z0 - 0.62,
      y = gAt(b, x, z) + 0.06;
    box(G, 'white', 1.1, 0.86, 0.6, x, y + 0.43, z);
    G.ice.push(new THREE.PlaneGeometry(0.9, 0.45).rotateY(PI).translate(x, y + 0.5, z - 0.302));
    box(P, 'iron', 1.14, 0.06, 0.64, x, y + 0.89, z);
    collideRun(b, x - 0.55, z, x + 0.55, z, 0.32, () => y + 0.92);
  } // (a run's end circles sit r in from its ends)
  {
    const x = gw / 2 + 0.75,
      z = Z0 + 1.2,
      y = gAt(b, x, z);
    for (let i = 0; i < 3; i++)
      put('tyre', x + (rnd() - 0.5) * 0.05, y + 0.08 + i * 0.16, z + (rnd() - 0.5) * 0.05, rnd() * 3, { rx: PI / 2 });
    put('tyre', x + 0.1, y + 0.29, z + 0.75, 0.2, { rx: 0.15 });
    collideRun(b, x, z - 0.3, x, z + 1.05, 0.4, () => y + 0.7);
  }
  // the pole sign: its cabinet's two faces and frame, the price board under it, a step bracket
  {
    const [px, pz] = [7.6, -9],
      y = gAt(b, px, pz);
    box(G, 'steel', 0.2, 7.2, 0.2, px, y + 3.6, pz);
    collideRun(b, px, pz, px, pz, 0.3, () => y + 7);
    box(G, 'steel', 2.7, 1.5, 0.34, px, y + 6.4, pz);
    box(G, 'steel', 2.3, 1.2, 0.14, px, y + 5.0, pz);
    for (const s of [-1, 1]) {
      G.signFace.push(
        new THREE.PlaneGeometry(2.56, 1.36).rotateY(s > 0 ? 0 : PI).translate(px, y + 6.4, pz + s * 0.172),
      );
      G.price.push(new THREE.PlaneGeometry(2.2, 1.1).rotateY(s > 0 ? 0 : PI).translate(px, y + 5.0, pz + s * 0.072));
    }
  }
  // inside: the counter (its till, a lantern lit on it), two shelf units of tins and a drinks fridge on the shop's side; the car lift,
  // the workbench under its pegboard (a vise, a meter, a jerrycan, a lantern), tyres and drums in the bay
  {
    const z = Z0 + 2.1,
      x0 = -IX,
      x1 = -2.25,
      y = F(-3, z);
    box(P, 'planks', x1 - x0 + 0.04, 0.05, 0.66, (x0 + x1) / 2, y + 1.0, z);
    box(G, 'band', x1 - x0, 0.95, 0.06, (x0 + x1) / 2, y + 0.48, z - 0.27);
    box(P, 'beam', x1 - x0, 0.95, 0.5, (x0 + x1) / 2, y + 0.48, z + 0.02);
    put('till', -2.8, y + 1.025, z, -PI / 2 - 0.2);
    litLantern(put, -3.45, y + 1.025, z + 0.1);
    G.glow.push(new THREE.PlaneGeometry(3.2, 3.2).rotateX(-PI / 2).translate(-3.0, F(-3.0, z - 0.8) + 0.02, z - 0.8));
    put('papers', -3.2, y + 1.025, z - 0.15, 0.4);
    G.glow.push(new THREE.PlaneGeometry(1.5, 1.4).rotateY(PI).translate(-3.0, b.y + 1.5, Z0 + 0.3));
    /* (the lantern's light in the window, seen from outside) */ collideRun(
      b,
      x0 + 0.2,
      z,
      x1 + 0.1,
      z,
      0.33,
      () => y + 1.03,
    );
  }
  for (const z of [Z0 + 3.4, Z0 + 4.55]) {
    const S = shelfAt(-IX + 0.27, F(-3.5, z), z, PI / 2);
    put('shelves', -IX + 0.27, F(-3.5, z), z, PI / 2);
    stock(put, S, [1, 2, 3], rnd, 0.35);
    /* (picked over: and the scanned tins are the station's heaviest part) */ collideRun(
      b,
      -IX + 0.27,
      z - 0.58,
      -IX + 0.27,
      z + 0.58,
      0.3,
      () => F(-3.5, z) + 2.14,
    );
  }
  {
    const x = -2.1,
      z = Z1 - 0.175 - 0.36,
      y = F(x, z);
    box(G, 'whiteIn', 0.9, 1.9, 0.04, x, y + 0.95, z + 0.31);
    for (const s of [-1, 1]) box(G, 'whiteIn', 0.04, 1.9, 0.66, x + s * 0.43, y + 0.95, z);
    box(G, 'whiteIn', 0.9, 0.22, 0.66, x, y + 1.79, z);
    box(G, 'whiteIn', 0.9, 0.24, 0.66, x, y + 0.12, z);
    G.drinks.push(new THREE.PlaneGeometry(0.8, 0.15).rotateY(PI).translate(x, y + 1.79, z - 0.332));
    box(P, 'glass', 0.82, 1.44, 0.02, x, y + 0.96, z + 0.28);
    for (const sy of [0.24, 0.66, 1.08, 1.48]) {
      box(G, 'steelIn', 0.82, 0.02, 0.56, x, y + sy, z + 0.02);
      for (let u = -0.32; u <= 0.33; u += 0.1)
        if (rnd() < 0.35)
          put(rnd() < 0.7 ? 'tin' : 'fish', x + u, y + sy + 0.01, z - 0.05 + rnd() * 0.15, rnd() * 6, { s: 2 });
    }
    box(P, 'pane', 0.82, 1.44, 0.012, x, y + 0.96, z - 0.325);
    box(G, 'steelIn', 0.03, 0.5, 0.04, x + 0.36, y + 1.0, z - 0.355);
    collideRun(b, x - 0.25, z, x + 0.25, z, 0.36, () => y + 1.9);
  }
  for (const x of [0.55, 3.25]) {
    const z = gz + 0.4,
      y = F(x, z);
    box(G, 'steelIn', 0.32, 3.0, 0.32, x, y + 1.5, z);
    box(G, 'steelIn', 0.5, 0.06, 0.5, x, y + 0.03, z);
    box(G, 'bodyIn', 0.06, 1.9, 0.08, x + (x < 2 ? 0.19 : -0.19), y + 1.2, z);
    for (const s of [-1, 1])
      box(G, 'steelIn', 0.1, 0.06, 1.0, x + (x < 2 ? 0.55 : -0.55), y + 0.22, z + s * 0.35, s * (x < 2 ? 0.5 : -0.5));
    collideRun(b, x, z, x, z, 0.3, () => y + 3);
  }
  box(G, 'steelIn', 2.9, 0.16, 0.16, 1.9, F(1.9, gz + 0.4) + 3.05, gz + 0.4);
  {
    const x = IX - 0.38,
      z0 = Z1 - 1.55,
      z1 = Z1 - 0.3,
      y = F(x, (z0 + z1) / 2);
    box(P, 'planks', 0.7, 0.07, z1 - z0, x, y + 0.9, (z0 + z1) / 2);
    for (const zz of [z0 + 0.08, z1 - 0.08])
      for (const dx of [-0.28, 0.28]) box(P, 'beam', 0.07, 0.86, 0.07, x + dx, y + 0.43, zz);
    box(P, 'planks', 0.6, 0.04, z1 - z0 - 0.1, x, y + 0.2, (z0 + z1) / 2);
    box(G, 'steelIn', 0.16, 0.16, 0.22, x - 0.2, y + 1.02, z0 + 0.25);
    box(G, 'steelIn', 0.3, 0.03, 0.03, x - 0.32, y + 1.08, z0 + 0.25);
    G.peg.push(new THREE.PlaneGeometry(z1 - z0, 0.85).rotateY(-PI / 2).translate(IX - 0.004, y + 1.6, (z0 + z1) / 2));
    for (const [dz, h] of [
      [0.2, 0.3],
      [0.5, 0.26],
      [0.9, 0.34],
    ])
      box(P, 'iron', 0.02, h, 0.04, IX - 0.02, y + 1.75 - h / 2, z0 + dz);
    put('meter', x + 0.1, y + 0.935, z0 + 0.75, -PI / 2);
    litLantern(put, x + 0.05, y + 0.935, z1 - 0.25);
    G.glow.push(
      new THREE.PlaneGeometry(3.0, 3.0).rotateX(-PI / 2).translate(x - 0.7, F(x - 0.7, z1 - 0.4) + 0.02, z1 - 0.4),
    );
    put('jerry', x + 0.05, y + 0.24, z0 + 0.4, PI / 2);
    for (const e of [-0.15, 0.15]) collideRun(b, x + e, z0, x + e, z1, 0.25, () => y + 0.94);
  }
  {
    const x = 0.95,
      z = Z1 - 0.62,
      y = F(x, z);
    for (let i = 0; i < 2; i++) put('tyre', x, y + 0.08 + i * 0.16, z, rnd() * 3, { rx: PI / 2 });
    collideRun(b, x, z, x, z, 0.32, () => y + 0.34);
    for (const [dx, dz] of [
      [1.0, 0.05],
      [1.62, -0.1],
    ]) {
      put('barrel', x + dx, F(x + dx, z + dz), z + dz, rnd() * 6);
      collideRun(b, x + dx, z + dz, x + dx, z + dz, 0.33, () => y + 0.93);
    }
  }
  put('clock', -1.0, b.y + 2.55, Z1 - 0.175 - 0.002, PI);
  put('crate', 2.9, F(2.9, Z0 + 0.9), Z0 + 0.9, 0.15);
  collideRun(b, 2.9, Z0 + 0.5, 2.9, Z0 + 1.3, 0.3, () => F(2.9, Z0 + 0.9) + 0.45);
  // the lantern hung under the canopy between the islands, on its wire, its light on the forecourt
  bar(G, 'steel', 0, cy - 0.16, cz + 0.6, 0, cy - 1.42, cz + 0.6, 0.012);
  litLantern(put, 0, cy - 1.95, cz + 0.6);
  G.glow.push(new THREE.PlaneGeometry(3.4, 3.4).rotateX(-PI / 2).translate(0, gAt(b, 0, cz + 0.6) + 0.085, cz + 0.6));
  put.done();
  gasFlush(b, G);
  cache(b, g, -2.6, gz + 1.4);
  cache(b, g, 0, -4.9);
}
// the station's own materials' geometry merged, one mesh per material (box-mapped where it has no uv of its own to keep)
function gasFlush(b, G) {
  const M = gasMats();
  for (const k in G) {
    if (!G[k].length) continue;
    const geo = mergeGeometries(G[k].map((q) => (q.index ? q.toNonIndexed() : q)));
    if (['body', 'band', 'white', 'hazard', 'lens', 'steel', 'steelIn', 'whiteIn', 'bodyIn'].includes(k))
      boxUV(geo, k === 'hazard' ? 0.5 : 1);
    const m = new THREE.Mesh(geo, k === 'hose' ? placeMats().cable : M[k]);
    m.castShadow = !['oil', 'crack', 'arrow', 'streak', 'glow'].includes(k);
    m.receiveShadow = true;
    b.group.add(m);
  }
}

// the classic world's new things build on their own stream (plan.js apart), their crates marked, so housecheck can show every old one
// is where it was on main
const fresh = (make) => {
  const c0 = caches.length;
  apart(make);
  if (CLASSIC) for (const c of caches.slice(c0)) c.isNew = true;
};
const pools = () =>
  Object.fromEntries(
    Object.keys(TILE)
      .concat('cloth', 'glow', 'glass', 'pane', ...PLANE_KEYS)
      .map((k) => [k, []]),
  );
// the classic one-room house a kind stands in for (plan.js classicKinds), built and thrown away so the world's stream draws what it drew
// on main and every crate and ruin built after it is as it was; its colliders, surfaces, crate and lamps go with it
function unseen(was) {
  const n = [colliders.length, surfaces.length, caches.length, ladders.length, LAMPS.length];
  Object.assign(was, { place: null, group: new THREE.Group(), PR: pools() });
  buildHouse(was, pools(), was.group);
  dropColliders(n[0]);
  surfaces.length = n[1];
  caches.length = n[2];
  ladders.length = n[3];
  LAMPS.length = n[4];
  delete was.group;
  delete was.PR;
} // (and its lamps: no light where no house is)

// the places' lit lanterns, hanging lamps and stove fires: each a spot the few real fire lights can go to (environment.js
// fireLights: the nearest flames in view get them), with a shorter, softer, warmer light than a torch's (Jared, 2026-11-15:
// "lanterns in the POI don't actually put off any light?"). A marker on the building's group, its world spot worked out once
const LAMPS = [],
  LAMP = {
    lantern: { i: 3, dist: 4, c: 0xffa040, dy: 0.1 },
    lamp: { i: 7, dist: 9, c: 0xffa860, dy: -0.1 },
    stove: { i: 4, dist: 6, c: 0xff6420, dy: 0.1 },
  };
function lampAt(b, p, kind) {
  const o = new THREE.Object3D();
  o.position.copy(p);
  o.userData.lamp = kind;
  b.group.add(o);
  LAMPS.push(o);
}
let SPOTS = null; // (made once, on the first lit frame: the buildings never move)
export const lampSpots = () =>
  (SPOTS ||= LAMPS.map((o, k) => {
    const w = o.getWorldPosition(new THREE.Vector3());
    return { x: w.x, y: w.y, z: w.z, key: 'lamp', who: 'lamp' + k, w: 2.5, ...LAMP[o.userData.lamp] };
  }));
export async function buildBuildings(scene) {
  LAMPS.length = 0;
  SPOTS = null;
  if (!CRATE) {
    CRATE = { geo: await loadMesh('wooden_crate_01'), mat: pbr('props/wooden_crate_01', { rough: 0.85 }) };
    CRATE.geo.computeBoundingBox();
    CRATE.h = CRATE.geo.boundingBox.max.y * 1.25;
  }
  {
    const need =
      places.some((q) => q.kind !== 'cave') || buildings.some((b) => b.style)
        ? Object.keys(KITS)
        : buildings.some((b) => b.kind === 'gas')
          ? GAS_KIT
          : [];
    if (need.some((k) => !KIT?.[k])) KIT = await loadKit(need, KIT || {});
  } // (caves need none of it, #8) // (and for the house kinds, slice 36) // (slice 23 polish: the interiors' scanned props, only for a world with places)
  const M = mats(),
    root = new THREE.Group();
  root.name = 'buildings';
  scene.add(root);
  for (const b of buildings) {
    const g = new THREE.Group();
    g.position.set(b.x, 0, b.z);
    g.rotation.y = -b.a;
    root.add((b.group = g));
    const P = pools();
    b.place = places.find((q) => q.b === b || q.shack === b) || null;
    b.PR = Object.fromEntries(Object.keys(TILE).map((k) => [k, []]));
    const make = () => {
      if (b.style) buildKind(b, P, root);
      else if (b.kind === 'house') buildHouse(b, P, root);
      else if (b.kind === 'tower') buildTower(b, P, root);
      else if (PLACE_BUILD[b.kind]) PLACE_BUILD[b.kind](b, P, root);
      else buildGas(b, P, root);
    };
    if (b.was) unseen(b.was);
    if (b.isNew) fresh(make);
    else make();
    const roof = new THREE.Group();
    g.add(roof);
    b.roofGroup = roof;
    for (const [parts, into] of [
      [P, g],
      [b.PR, roof],
    ])
      for (const k in parts) {
        if (!parts[k].length) continue;
        const geo = mergeGeometries(parts[k].map((q) => (q.index ? q.toNonIndexed() : q)));
        if (TILE[k]) boxUV(geo, TILE[k]);
        const m = new THREE.Mesh(geo, k === 'roof' && b.tint ? tinted(b.tint) : M[k]);
        m.castShadow = k !== 'floor';
        m.receiveShadow = true;
        into.add(m);
      }
    delete b.PR;
  }
  // the town's street rubble
  if (buildings.town?.rubble.length) {
    const P = { wall: [] },
      t = { x: 0, z: 0, ca: 1, sa: 0 };
    for (const r of buildings.town.rubble) {
      rubble(t, P, 'wall', r.x, r.z, r.s * 1.4, 8);
      Object.assign(addCollider(r.x, r.z, r.s * 0.9, null), {
        vr: 0,
        top: groundY(r.x, r.z) + r.s * 0.6,
        stand: groundY(r.x, r.z) + r.s * 0.6,
      });
    }
    const geo = mergeGeometries(P.wall.map((q) => q.toNonIndexed()));
    boxUV(geo, TILE.wall);
    const m = new THREE.Mesh(geo, M.wall);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
  }
  // raider camps: three tents round a fire (no light: lights cost every material), a crate the raiders guard
  for (const c of raiderCamps) {
    const t = { x: c.x, z: c.z, a: c.a0, ca: Math.cos(c.a0), sa: Math.sin(c.a0) };
    buildFire(root, c.x, c.z, false);
    for (let k = 0; k < 3; k++) {
      const a = c.a0 + 0.9 + k * 2.1,
        dx = Math.cos(a) * 5.5,
        dz = Math.sin(a) * 5.5,
        tent = buildTent(true);
      tent.rotation.y = Math.atan2(dz, -dx);
      tent.position.set(c.x + dx, groundY(c.x + dx, c.z + dz), c.z + dz);
      tent.traverse((m) => {
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = !m.userData.thin;
        }
      });
      root.add(tent);
      Object.assign(addCollider(c.x + dx, c.z + dz, 1.5, c), { vr: 0, top: tent.position.y + 1.5 });
    }
    cache(t, root, 2.6, 0.4, c);
  }
  // (slice 23) the crater lakes' chests, at the bottom, and a crate on every island but the hermit's (his is in his shack)
  const W0 = { x: 0, z: 0, a: 0, ca: 1, sa: 0 };
  fresh(() => {
    for (const q of places) {
      if (q.kind === 'crater') {
        q.chest = cache(W0, root, q.x + 0.6, q.z - 0.4, null, { k: 4, ammo: 6, sunk: true });
        buildCrater(q, root);
      } // (its rim rocks, mist, glow, wreck and bones)
      if (q.kind === 'plane' || q.kind === 'barge' || q.kind === 'shrooms' || q.kind === 'outpost')
        q.crate = caches.find((c) => c.camp === q) || null;
    }
    for (const s of islands) if (s.crate) cache(W0, root, s.crate.x, s.crate.z, null, { k: 2 });
  });
}

const UP = new THREE.Vector3(0, 1, 0);
// a straight bar between two points of the frame, t thick (a mast's legs and braces, wires)
export function bar(P, k, x0, y0, z0, x1, y1, z1, t = 0.12) {
  const d = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0),
    L = d.length();
  P[k].push(
    new THREE.BoxGeometry(t, L, t)
      .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()))
      .translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
  );
}
let KIT = null;
export const kit = () => KIT; // (slice 36: houses.js sizes its furniture from the loaded meshes)
const PLACE_BUILD = { radio: buildRadio, plane: buildPlane, barge: buildBarge, shrooms: buildShrooms };

// the roof comes off the building the player stands in (not in first person: there it is the ceiling); far ones hide
export function tickBuildings(cam, x, z, y, firstPerson) {
  CUT.constant = 1e6;
  for (const b of buildings) {
    b.group.visible = Math.hypot(cam.x - b.x, cam.z - b.z) < Q.drawDist * 0.8;
    const [lx, lz] = toL(b, x, z),
      r = b.roofBox || { cz: 0, w: b.w, d: b.d };
    const inside =
      Math.abs(lx - (r.cx || 0)) < r.w / 2 + 0.5 &&
      Math.abs(lz - r.cz) < r.d / 2 + 0.5 &&
      !(y > b.y + (b.h ?? 99) - 0.2); // on the roof is not inside
    if (b.kind === 'radio' || b.kind === 'shrooms') continue; // (slice 23: a mast and a mushroom ring are not rooms: never cut away)
    if (b.inside) {
      const [mx, mz] = toW(b, b.cx, b.cz);
      b.inside.visible = b.group.visible && Math.hypot(cam.x - mx, cam.z - mz) < 24;
    } // (slice 36: a house kind's furniture, only up close)
    b.roofGroup.visible = firstPerson || !inside;
    if (inside && !firstPerson) CUT.constant = Math.max(groundY(x, z), y) + 1.3;
  }
}

// for the places and interiors moved out of this file (src/places/, src/interiors.js)
export { MAT, TILE, CUT, floor, lampAt, UP, KIT };
