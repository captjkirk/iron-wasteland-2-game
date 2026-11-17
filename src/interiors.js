// Interiors (slice 23 polish, #52): the scanned props that furnish the places' rooms and the gas station, the food on
// their shelves, and the rooms themselves (the radio shack, the frozen outpost, the hermit's shack, the barge's deckhouse).
// Moved here unchanged from src/buildings.js (the code cleanup, November 16, 2026); buildings.js still exports all of it
// and still loads the props (buildBuildings) and holds them (KIT).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise.js';
import { indoors } from './plan.js';
import { pbr, loadMesh, canvasTex } from './propmodels.js';
import { mats, CUT, box, gAt, collideRun, lampAt, KIT } from './buildings.js';
import { slot, flush } from './places/shared.js';
import { rod } from './places/barge.js';

// The rooms are furnished with scanned CC0 props from Poly Haven (CREDITS.md), at their real size: loaded once by buildBuildings,
// placed per room, each prop's copies in a room merged into one mesh. KITS: [mesh file, texture set when it shares one, material]
const KITS = {
  desk: ['metal_office_desk', 0, { rough: 0.55, metal: 0.35 }],
  shelves: ['steel_frame_shelves_01', 0, { rough: 0.6, metal: 0.3 }],
  chair: ['painted_wooden_chair_01'],
  table: ['wooden_table_02'],
  bed: ['vintage_day_bed', 0, { rough: 0.95 }],
  heater: ['scandinavian_masonry_heater', 0, { rough: 0.45, metal: 0.5 }],
  radio: ['radio_set', 0, { rough: 0.6, metal: 0.25 }],
  radioKit: ['radio_kit', 0, { rough: 0.55, metal: 0.3 }],
  lamp: ['hanging_industrial_lamp', 0, { rough: 0.45, metal: 0.45, side: THREE.DoubleSide }],
  clip: ['clipboard'],
  medic: ['medical_box', 0, { rough: 0.5, metal: 0.35 }],
  pot: ['pot_enamel_01', 0, { rough: 0.3, metal: 0.1 }],
  bucket: ['wooden_bucket_01'],
  meter: ['retro_multimeter', 0, { rough: 0.5 }],
  jerry: ['metal_jerrycan_green', 0, { rough: 0.55, metal: 0.1 }],
  sheet: ['paper_sheet', 'office_notepads', { side: THREE.DoubleSide }],
  papers: ['paper_stack', 'office_notepads'],
  pad: ['notepad', 'office_notepads'],
  salt: ['salt_box', 'russian_food_cans_01'],
  tin: ['can_cond', 'russian_food_cans_01', { rough: 0.35, metal: 0.55 }],
  fish: ['can_fish', 'russian_food_cans_01', { rough: 0.35, metal: 0.55 }],
  crate: ['wooden_crate_02'],
  crate1: ['wooden_crate_01'],
  lantern: ['wooden_lantern_01'],
  axe: ['wooden_axe'],
  // (slice 36, the house kinds' rooms: more scanned CC0 furniture from Poly Haven, CREDITS.md)
  sofa: ['sofa_02', 0, { rough: 0.95 }],
  armchair: ['arm_chair_01', 0, { rough: 0.9 }],
  cabinet: ['painted_wooden_cabinet'],
  bookshelf: ['wooden_bookshelf_worn'],
  bed2: ['gothic_bed_01', 0, { rough: 0.85 }],
  rocker: ['rockingchair_01'],
  nightstand: ['painted_wooden_nightstand'],
  stove: ['electric_stove', 0, { rough: 0.5, metal: 0.3 }],
  till: ['cash_register_01', 0, { rough: 0.5, metal: 0.5 }],
  clock: ['wall_clock'],
  coffee: ['coffee_table_01'],
  dining: ['dining_table'],
  bench: ['painted_wooden_bench'],
  tyre: ['old_tyre', 'tyre', { rough: 0.9 }],
  barrel: ['barrel_03', 0, { rough: 0.85, metal: 0.05, color: 0xb09880 }],
}; // (the gas station's detail pass)
const GAS_KIT = [
  'till',
  'papers',
  'shelves',
  'tin',
  'fish',
  'salt',
  'meter',
  'jerry',
  'clock',
  'crate',
  'lantern',
  'tyre',
  'barrel',
]; // (the gas station's: all a classic world loads)
async function loadKit(keys = Object.keys(KITS), K = {}) {
  await Promise.all(
    Object.entries(KITS)
      .filter(([k]) => keys.includes(k) && !K[k])
      .map(async ([k, [n, tx, o = {}]]) => {
        const geo = await loadMesh(n),
          mat = pbr('props/' + (tx || n), { rough: 0.8, ...o });
        mat.clippingPlanes = [CUT];
        mat.map.flipY = mat.normalMap.flipY = false;
        K[k] = { geo, mat };
      }),
  ); // (glTF's uv start at the image's top: unflipped)
  if (K.extra) return K; // (a second call only adds the props a new world needs)
  const glowTex = canvasTex(
    64,
    64,
    (x, w, h) => {
      const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, w, h);
    },
    '#fff',
  );
  const add = (o) =>
    Object.assign(o, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTex });
  K.extra = {
    bulb: new THREE.MeshBasicMaterial({ color: 0xfff1d0 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffa040 }),
    slot: new THREE.MeshBasicMaterial({ color: 0xff7a20 }),
    iron: mats().iron.clone(),
    pool: new THREE.MeshBasicMaterial(add({ color: 0x705030 })),
    map: new THREE.MeshStandardMaterial({ roughness: 0.9, map: chartTex() }),
    note: new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide, map: noteTex() }),
    bark: pbr('props/logbark', { rough: 0.95, color: 0xa89a88 }),
    cut: new THREE.MeshStandardMaterial({ color: 0xc9a476, roughness: 0.85 }),
  };
  for (const m of Object.values(K.extra)) m.clippingPlanes = [CUT];
  K.halo = (c) =>
    (K['halo' + c] ||= Object.assign(new THREE.SpriteMaterial(add({ color: c })), { clippingPlanes: [CUT] }));
  return K;
}
// a room's props. put(kind, x, y, z, ry, o) stands one with its base at (x, y, z) in the building's frame, turned by ry (o: s its
// scale, rx and rz tilts, c a tint); put.geo(material, geometry) adds plain geometry (a bulb, logs, a glow); put.halo(x, y, z, size,
// colour) a soft light. put.done() merges it all, through m (a tilted hull's frame) when given, onto the building's group
// places round 2 (Jared, 2026-11-15: "if the scenery includes stuff like food it should be able to be picked up"): the tins, fish
// tins and salt in every room are taken with E, FOOD_EACH food apiece; larder lists them all in the order the world built them,
// so an index names the same tin in every game (taken ones: coop.js shares them, late joiners too)
export const FOOD_EACH = 1,
  larder = [];
const FOOD = { tin: 'tin', fish: 'fish tin', salt: 'box of salt' },
  GONE = new THREE.Matrix4().makeScale(0, 0, 0);
export const foodName = (f) => FOOD[f.k];
// the piece of food in reach of (x, y feet, z): the nearest within 1.5 m at the feet's floor, and of a stack, the top one
// (a tin indoors is taken only from indoors: not through the wall; up to 2.7 m over the feet: a tall shelf's top board is 2.5 m up,
// the floor above 2.9 m)
export function foodNear(x, y, z) {
  let best = null,
    bd = 1.5;
  const inn = indoors(x, z);
  for (const f of larder) {
    if (f.gone || f.y < y - 0.4 || f.y > y + 2.7 || (f.in && !inn)) continue;
    const d = Math.hypot(f.x - x, f.z - z);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  for (let up = best; up; ) {
    best = up;
    up = larder.find(
      (f) =>
        !f.gone &&
        f.mesh === best.mesh &&
        f.y > best.y + 0.01 &&
        f.y < best.y + 0.2 &&
        Math.hypot(f.x - best.x, f.z - best.z) < 0.04,
    );
  }
  return best;
}
// the piece at larder index i taken away (true when it was still there)
export function takeFood(i) {
  const f = larder[i];
  if (!f || f.gone) return false;
  f.gone = true;
  f.mesh.setMatrixAt(f.i, GONE);
  f.mesh.instanceMatrix.needsUpdate = true;
  return true;
}
export function kitRoom(b, m = null) {
  const L = {},
    G = {},
    e = new THREE.Euler(),
    q = new THREE.Quaternion(),
    V = THREE.Vector3;
  const put = (k, x, y, z, ry = 0, o = {}) => {
    const s = o.s || 1,
      M = new THREE.Matrix4().compose(
        new V(x, y, z),
        q.setFromEuler(e.set(o.rx || 0, ry, o.rz || 0, 'YXZ')),
        new V(s, s, s),
      );
    (L[k + '|' + (o.c ?? '')] ||= []).push(M);
  };
  put.geo = (k, geo) => (G[k] ||= []).push(geo);
  put.halo = (x, y, z, s, c = 0xffc890) => {
    const p = new V(x, y, z);
    if (m) p.applyMatrix4(m);
    const sp = new THREE.Sprite(KIT.halo(c));
    sp.position.copy(p);
    sp.scale.setScalar(s);
    sp.renderOrder = 2;
    b.group.add(sp);
    lampAt(b, p, c === 0xffd6a0 ? 'lamp' : c === 0xff8a40 ? 'stove' : 'lantern');
  };
  put.done = () => {
    b.group.updateWorldMatrix(true, false);
    for (const key in L) {
      const [k, c] = key.split('|'),
        K = KIT[k];
      if (FOOD[k] && !c) {
        const im = new THREE.InstancedMesh(K.geo, K.mat, L[key].length);
        im.castShadow = im.receiveShadow = true; // (food: one instanced mesh, so each piece can go when taken)
        L[key].forEach((M, i) => {
          if (m) M.premultiply(m);
          im.setMatrixAt(i, M);
          const p = new V().setFromMatrixPosition(M).applyMatrix4(b.group.matrixWorld);
          larder.push({ k, mesh: im, i, x: p.x, y: p.y, z: p.z, in: indoors(p.x, p.z) });
        });
        im.computeBoundingSphere();
        b.group.add(im);
        continue;
      }
      const geo = mergeGeometries(L[key].map((M) => K.geo.clone().applyMatrix4(m ? M.premultiply(m) : M)));
      const mat = c
          ? (K['c' + c] ||= (() => {
              const n = K.mat.clone();
              n.color.set(+c);
              return n;
            })())
          : K.mat,
        mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      b.group.add(mesh);
    }
    for (const k in G) {
      const geo = mergeGeometries(
          G[k].map((g) => {
            const n = g.index ? g.toNonIndexed() : g;
            return m ? n.applyMatrix4(m) : n;
          }),
        ),
        mesh = new THREE.Mesh(geo, KIT.extra[k]);
      mesh.receiveShadow = k === 'bark' || k === 'cut';
      mesh.castShadow = mesh.receiveShadow;
      b.group.add(mesh);
    }
  };
  return put;
}
// a survey sheet pinned to the walls: contours round two hills, a lake and a river, tracks, a grid, pencilled marks and its title
function chartTex() {
  return canvasTex(
    512,
    384,
    (x, w, h) => {
      const r = mulberry32(5),
        hill = [
          [150, 140, 120],
          [380, 250, 95],
          [300, 90, 60],
        ],
        H = (px, py) =>
          hill.reduce((a, [cx, cy, s]) => a + Math.exp(-((px - cx) ** 2 + (py - cy) ** 2) / (2 * s * s)), 0) +
          0.08 * Math.sin(px * 0.03 + py * 0.02);
      x.fillStyle = '#e7dfc6';
      x.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        x.fillStyle = `rgba(120,100,60,${r() * 0.05})`;
        x.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 6);
      }
      x.fillStyle = 'rgba(110,160,200,0.55)';
      x.beginPath();
      x.ellipse(110, 300, 70, 38, 0.3, 0, 6.283);
      x.fill();
      x.strokeStyle = 'rgba(60,110,170,0.8)';
      x.lineWidth = 2;
      x.stroke();
      x.beginPath();
      x.moveTo(170, 290);
      x.bezierCurveTo(260, 330, 300, 260, 512, 300);
      x.stroke();
      for (let py = 0; py < h; py += 2)
        for (let px = 0; px < w; px += 2) {
          const v = H(px, py) * 8,
            f = v - Math.floor(v);
          if (f < 0.09) {
            x.fillStyle = Math.floor(v) % 5 ? 'rgba(150,95,45,0.55)' : 'rgba(130,75,30,0.85)';
            x.fillRect(px, py, 2, 2);
          }
        }
      x.strokeStyle = 'rgba(40,40,40,0.75)';
      x.setLineDash([8, 5]);
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(0, 210);
      x.bezierCurveTo(150, 230, 230, 160, 330, 180);
      x.lineTo(512, 120);
      x.stroke();
      x.setLineDash([]);
      x.strokeStyle = 'rgba(60,90,160,0.35)';
      x.lineWidth = 1;
      for (let i = 64; i < w; i += 64) {
        x.beginPath();
        x.moveTo(i, 0);
        x.lineTo(i, h);
        x.stroke();
      }
      for (let j = 64; j < h; j += 64) {
        x.beginPath();
        x.moveTo(0, j);
        x.lineTo(w, j);
        x.stroke();
      }
      x.strokeStyle = 'rgba(190,30,30,0.85)';
      x.lineWidth = 3;
      for (const [cx, cy] of [
        [150, 140],
        [330, 180],
        [395, 255],
      ]) {
        x.beginPath();
        x.arc(cx, cy, 13, 0, 6.283);
        x.stroke();
      }
      x.fillStyle = '#f2ecda';
      x.fillRect(w - 170, h - 62, 160, 52);
      x.strokeStyle = '#333';
      x.lineWidth = 2;
      x.strokeRect(w - 170, h - 62, 160, 52);
      x.fillStyle = '#222';
      x.font = 'bold 17px serif';
      x.fillText('SURVEY SHEET 7', w - 160, h - 38);
      x.font = '12px serif';
      x.fillText('1 : 25 000   contours 10 m', w - 160, h - 20);
      x.strokeStyle = '#333';
      x.lineWidth = 3;
      x.strokeRect(4, 4, w - 8, h - 8);
      x.strokeStyle = 'rgba(0,0,0,0.08)';
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(w / 2, 0);
      x.lineTo(w / 2, h);
      x.moveTo(0, h / 2);
      x.lineTo(w, h / 2);
      x.stroke();
    },
    '#e7dfc6',
  );
}
// a page of the station's log: a typed heading and columns, the entries in pencil, ruled lines, a coffee ring
function noteTex() {
  return canvasTex(
    256,
    362,
    (x, w, h) => {
      const r = mulberry32(9);
      x.fillStyle = '#f1eee4';
      x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(80,110,170,0.35)';
      x.lineWidth = 1;
      for (let y = 70; y < h - 10; y += 14) {
        x.beginPath();
        x.moveTo(12, y);
        x.lineTo(w - 12, y);
        x.stroke();
      }
      x.strokeStyle = 'rgba(190,60,60,0.4)';
      x.beginPath();
      x.moveTo(52, 50);
      x.lineTo(52, h - 10);
      x.stroke();
      x.fillStyle = '#222';
      x.font = 'bold 18px monospace';
      x.fillText('LOG', 14, 30);
      x.font = '11px monospace';
      x.fillText('TIME   FREQ    CALL   REMARKS', 14, 56);
      x.strokeStyle = 'rgba(40,45,70,0.8)';
      x.lineWidth = 1.2;
      for (let y = 82; y < h - 60; y += 14) {
        if (r() < 0.12) continue;
        x.beginPath();
        let px = 16;
        x.moveTo(px, y);
        for (const end of [44, 60 + r() * 40, 110 + r() * 30, 150 + r() * 90]) {
          while (px < end) {
            px += 2 + r() * 3;
            x.lineTo(px, y - 1 - r() * 5);
          }
          px += 8;
          x.moveTo(px, y);
        }
        x.stroke();
      }
      x.strokeStyle = 'rgba(120,80,40,0.25)';
      x.lineWidth = 5;
      x.beginPath();
      x.arc(190, 300, 30, 0.3, 5.6);
      x.stroke();
    },
    '#f1eee4',
  );
}
// a page pinned flat to a wall at (x, y, z) facing ry, tilted rz
function note(put, x, y, z, ry, rz = 0, d = 0.006) {
  put.geo(
    'note',
    new THREE.PlaneGeometry(0.21, 0.297)
      .rotateZ(rz)
      .rotateY(ry)
      .translate(x + Math.sin(ry) * d, y, z + Math.cos(ry) * d),
  );
}
// that sheet on a wall at (x, y, z) facing ry, wide wd, with four pins
function chart(put, x, y, z, ry, wd = 1) {
  const hh = wd * 0.75,
    c = Math.cos(ry),
    s = Math.sin(ry);
  put.geo(
    'map',
    new THREE.PlaneGeometry(wd, hh)
      .rotateZ(Math.sin(x * 7 + z * 3) * 0.015)
      .rotateY(ry)
      .translate(x, y, z),
  );
  for (const [u, v] of [
    [-0.47, 0.45],
    [0.47, 0.45],
    [-0.47, -0.45],
    [0.47, -0.45],
  ])
    put.geo(
      'slot',
      new THREE.SphereGeometry(0.008, 6, 4).translate(
        x + u * wd * c + s * 0.004,
        y + v * hh,
        z - u * wd * s + c * 0.004,
      ),
    );
}
// a shelf's levels filled with stores, two rows deep: tins, fish tins and salt (some stacked), now and then a crate on the bottom
export function stock(put, S, levels, rnd, full = 0.8) {
  for (const lv of levels)
    for (const v of [0.16, 0.34])
      for (let u = -0.46; u <= 0.46; u += 0.09 + rnd() * 0.05) {
        if (rnd() > full) continue;
        const k = ['tin', 'tin', 'fish', 'salt'][Math.floor(rnd() * 4)],
          p = S(u, lv, v + (rnd() - 0.5) * 0.04);
        put(k, ...p, rnd() * 6, { s: 2 });
        if (k === 'tin' && rnd() < 0.5) put('tin', p[0], p[1] + 0.076, p[2], rnd() * 6, { s: 2 });
        if (k === 'fish' && rnd() < 0.6) put('fish', p[0], p[1] + 0.04, p[2], rnd() * 6, { s: 2 });
      }
}
// stacked firewood along z: rows of split logs (bark, their cut ends pale), n long, r a log's radius
export function woodpile(put, x, y, z, n, rows = 3, len = 0.42, r = 0.065, rnd = Math.random) {
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < n - j; i++) {
      const lx = x + (i - (n - j - 1) / 2) * r * 2.05,
        ly = y + r + j * r * 1.75,
        a = rnd() * 6.28;
      put.geo(
        'bark',
        new THREE.CylinderGeometry(r * (0.85 + rnd() * 0.3), r, len * (0.9 + rnd() * 0.2), 7, 1, true)
          .rotateY(a)
          .rotateX(Math.PI / 2)
          .translate(lx, ly, z + (rnd() - 0.5) * 0.05),
      );
      for (const s of [-1, 1])
        put.geo(
          'cut',
          new THREE.CircleGeometry(r * 0.97, 7)
            .rotateY(s > 0 ? 0 : Math.PI)
            .rotateZ(a)
            .translate(lx, ly, z + s * len * 0.47),
        );
    }
}
// the hanging lamp: shade and chain from the ceiling at (x, yc, z), its bulb, its light on the floor below (fy) and a soft glow
export function hangLamp(put, x, yc, z, fy, s = 1) {
  put('lamp', x, yc, z, 0, { s });
  const yb = yc - 1.25 * s;
  /* (s: smaller, for a house room's low ceiling: the quality pass) */ put.geo(
    'bulb',
    new THREE.SphereGeometry(0.05, 10, 8).scale(1, 1.25, 1).translate(x, yb, z),
  );
  put.halo(x, yb - 0.05, z, 1.2, 0xffd6a0);
  put.geo('pool', new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2).translate(x, fy + 0.015, z));
}
// a lantern standing at (x, y, z) with its flame lit
export function litLantern(put, x, y, z, ry = 0) {
  put('lantern', x, y, z, ry);
  put.geo('flame', new THREE.SphereGeometry(0.018, 8, 6).scale(1, 2, 1).translate(x, y + 0.2, z));
  put.halo(x, y + 0.22, z, 0.75, 0xffb060);
}
// a shelf unit's spots: (u along it from its middle, level 0..4 from the floor up, v from its back) to the room's frame
export const shelfAt =
  (sx, sy, sz, ry) =>
  (u, lv, v = 0.25) => {
    const c = Math.cos(ry),
      s = Math.sin(ry),
      lz = v - 0.25;
    return [sx + u * c + lz * s, sy + [0.13, 0.64, 1.14, 1.65, 2.14][lv], sz - u * s + lz * c];
  };

// the radio shack (4.4 x 3.6 m inside the walls): the operator's steel desk along the back wall, the set on it (its microphone,
// morse key and speaker), a second receiver, the logbook and papers, a chair; a steel rack of spare sets and stores on the left
// wall; a table under the window with the kettle pot, tins and a lantern; a crate and a jerrycan in the corner; a green enamel
// lamp hanging over it all. place.radio (0, d/2 - 1) is just in front of the set, the way to it from the door clear
function radioRoom(b, P, w, d) {
  const t = b.t || 0.45,
    IX = w / 2 - t / 2,
    IZ = d / 2 - t / 2,
    F = (x, z) => gAt(b, x, z) + 0.07,
    put = kitRoom(b),
    rnd = mulberry32(Math.round(b.seed * 1000) + 71),
    PI = Math.PI;
  const dx = -0.1,
    dz = IZ - 0.48,
    f = F(dx, dz),
    T = f + 0.79;
  put('desk', dx, f, dz, PI, { c: 0x9c9e9a });
  put('radio', 0.02, T, IZ - 0.3, PI);
  put('radioKit', 0.02, T, IZ - 0.3, PI);
  put('radio', -0.52, T, IZ - 0.26, PI + 0.06);
  put('radio', -0.52, T + 0.137, IZ - 0.27, PI - 0.03);
  put('pad', 0.5, T, IZ - 0.62, PI + 0.25);
  put('papers', 0.72, T, IZ - 0.3, 0.2);
  put('sheet', -0.32, T + 0.012, IZ - 0.74, 2.7);
  put('sheet', 0.62, T + 0.012, IZ - 0.55, PI - 0.5);
  put('meter', 0.8, T, IZ - 0.2, PI - 0.35);
  put('tin', -0.85, T, IZ - 0.6, 0, { s: 2 });
  put('clip', -0.8, T + 0.003, IZ - 0.3, PI + 0.15);
  put('chair', 0.18, F(0.18, IZ - 1.25), IZ - 1.25, -0.3, { c: 0xb8b2a6 });
  collideRun(b, dx - 0.8, dz + 0.06, dx + 0.8, dz + 0.06, 0.42, () => f + 0.8);
  // on the back wall over the desk: the frequency list and a log on clipboards, papers pinned up
  chart(put, -0.3, b.y + 1.72, IZ - 0.008, PI, 0.95);
  put('clip', 0.5, b.y + 1.45, IZ - 0.02, PI, { rx: PI / 2, rz: 0.05 });
  note(put, 0.5, b.y + 1.45 - 0.025, IZ - 0.02, PI, 0.05, 0.03);
  note(put, 0.85, b.y + 1.6, IZ - 0.012, PI, 0.06);
  note(put, -IX + 0.012, b.y + 1.55, 0.75, PI / 2, -0.04);
  // the rack on the left wall: spare sets on the top shelves, the first-aid box and a meter, tins and salt, a jerrycan and papers below
  {
    const sx = -IX + 0.27,
      sz = -0.12,
      sy = F(sx, sz),
      S = shelfAt(sx, sy, sz, PI / 2);
    put('shelves', sx, sy, sz, PI / 2);
    for (const u of [-0.27, 0.22]) put('radio', ...S(u, 3, 0.3), PI / 2 + (rnd() - 0.5) * 0.2);
    put('radio', ...S(-0.05, 4, 0.3), PI / 2 - 0.1);
    put('papers', ...S(0.33, 4, 0.25), PI / 2 + 0.1);
    put('medic', ...S(-0.2, 2, 0.24), PI / 2 + 0.04);
    put('meter', ...S(0.32, 2, 0.3), PI / 2 - 0.3);
    stock(put, S, [1], rnd, 0.85);
    put('jerry', ...S(-0.2, 0, 0.27), PI / 2);
    put('papers', ...S(0.28, 0, 0.25), PI / 2 + 0.2);
    put('papers', ...S(0.28, 0, 0.25).map((v, i) => (i === 1 ? v + 0.012 : v)), PI / 2 - 0.15);
    collideRun(b, sx, sz - 0.4, sx, sz + 0.4, 0.3, () => sy + 2.15);
  }
  // the table under the window: the pot for water, tins, the lantern, a notepad
  {
    const tx = IX - 0.37,
      tz = -0.52,
      ty = F(tx, tz),
      T2 = ty + 0.8;
    put('table', tx, ty, tz, PI / 2);
    put('pot', tx + 0.05, T2, tz - 0.3, 0.4);
    put('tin', tx - 0.12, T2, tz + 0.05, 0, { s: 2 });
    put('fish', tx + 0.08, T2, tz + 0.1, 0, { s: 2 });
    put('salt', tx + 0.15, T2, tz - 0.02, 1, { s: 2 });
    litLantern(put, tx, T2, tz + 0.36);
    put('pad', tx - 0.1, T2, tz - 0.05, 1.2);
    collideRun(b, tx, tz - 0.4, tx, tz + 0.4, 0.33, () => T2);
  }
  // the back-right corner: a long crate, a jerrycan on the floor
  {
    const cx = IX - 0.32,
      cz = IZ - 0.62,
      cy = F(cx, cz);
    put('crate', cx, cy, cz, 0.02);
    put('jerry', 1.12, F(1.12, IZ - 0.15), IZ - 0.12, PI - 0.1);
    collideRun(b, cx, cz - 0.4, cx, cz + 0.4, 0.33, () => cy + 0.46);
  }
  // the lamp over the desk's front, hung from the ceiling boards (the roof's underside at that z)
  {
    const rh = Math.min(2, d * 0.32),
      Dd = d / 2 + t / 2,
      z = 0.3;
    hangLamp(put, 0.05, b.y + b.h + rh * (1 - z / Dd) - 0.17, z, F(0.05, z));
  }
  put.done();
}

// the frozen outpost (8 x 6 m inside): a round iron heater on its sheet in the back-right corner (place.heater is its spot), a heat
// shield behind it, the flue up through the roof, firewood under its side and a bucket; two day beds (the back wall and the left);
// a table with chairs, a lantern and supper in the middle under a hanging lamp; the instrument bench (a steel desk with the radio,
// a meter and logs) under the right window with its chair; steel racks of stores on the back and right walls; jerrycans by the door
function outpostRoom(b, P, w, d) {
  const t = b.t || 0.45,
    IX = w / 2 - t / 2,
    IZ = d / 2 - t / 2,
    F = (x, z) => gAt(b, x, z) + 0.07,
    put = kitRoom(b),
    rnd = mulberry32(Math.round(b.seed * 1000) + 73),
    PI = Math.PI;
  const rh = Math.min(2, d * 0.32),
    Dd = d / 2 + t / 2,
    top = b.y + b.h,
    roofAt = (z) => top + rh * (1 - Math.abs(z) / Dd);
  // the heater: its flue (at its back) up through the roof with a collar and a cap; its fire under the door, warm on the floor
  {
    const hx = w / 2 - 1.6,
      hz = d / 2 - 1.4,
      yh = F(hx, hz),
      fx = hx + 0.025,
      fz = hz + 0.29;
    put('heater', hx, yh, hz, PI);
    box(P, 'iron', 1.25, 0.02, 1.25, hx, yh + 0.005, hz - 0.15);
    box(P, 'hull', 1.3, 2.3, 0.03, hx, yh + 1.15, d / 2 - t / 2 - 0.03);
    {
      const fy = roofAt(fz) + 0.9,
        L = fy - yh - 2.36;
      P.iron.push(
        new THREE.CylinderGeometry(0.085, 0.085, L, 10).translate(fx, yh + 2.36 + L / 2, fz),
        new THREE.ConeGeometry(0.22, 0.18, 10).translate(fx, fy + 0.2, fz),
        new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10).translate(fx, roofAt(fz) + 0.05, fz),
      );
    }
    put.geo('slot', new THREE.PlaneGeometry(0.26, 0.022).rotateY(PI).translate(hx, yh + 0.19, hz - 0.47));
    put.halo(hx, yh + 0.3, hz - 0.6, 0.9, 0xff8a40);
    const Q = slot();
    Q.heat.push(new THREE.PlaneGeometry(2.4, 2.4).rotateX(-PI / 2).translate(hx, yh + 0.02, hz - 0.9));
    flush(b, Q);
    woodpile(put, IX - 0.32, yh, hz + 0.15, 4, 3, 0.42, 0.065, rnd);
    put('bucket', hx - 0.75, F(hx - 0.75, hz - 0.55), hz - 0.55, 0.6);
    put('axe', IX - 0.12, yh + 0.22, hz - 0.45, -PI / 2, { rz: 0.25 });
    collideRun(b, hx, hz, hx, hz, 0.5, () => yh + 2.36);
    collideRun(b, IX - 0.32, hz - 0.05, IX - 0.32, hz + 0.35, 0.28, () => yh + 0.4);
  }
  // the beds: one along the back wall, one along the left, blankets and pillows on them, a clipboard log on the wall between
  {
    const bz = IZ - 0.48,
      bx = -IX + 1.0;
    put('bed', bx, F(bx, bz), bz, PI);
    collideRun(b, bx - 0.8, bz + 0.05, bx + 0.8, bz + 0.05, 0.42, () => F(bx, bz) + 0.55);
    const lx = -IX + 0.48,
      lz = 0.55;
    put('bed', lx, F(lx, lz), lz, PI / 2, { c: 0xd8d0c4 });
    collideRun(b, lx - 0.05, lz - 0.8, lx - 0.05, lz + 0.8, 0.42, () => F(lx, lz) + 0.55);
    put('clip', -1.0, b.y + 1.45, IZ - 0.02, PI, { rx: PI / 2 });
    note(put, -1.0, b.y + 1.45 - 0.025, IZ - 0.02, PI, 0, 0.03);
    note(put, -1.0, b.y + 1.75, IZ - 0.012, PI, 0.05);
  }
  // the table in the middle, two chairs, the lantern, the pot, tins, cards and papers; the lamp over it
  {
    const tx = -0.9,
      tz = -0.1,
      ty = F(tx, tz),
      T = ty + 0.8;
    put('table', tx, ty, tz, PI / 2 + 0.05);
    collideRun(b, tx, tz - 0.4, tx, tz + 0.4, 0.38, () => T);
    put('chair', tx - 0.75, F(tx - 0.75, tz - 0.25), tz - 0.25, PI / 2 - 0.2, { c: 0x9fb4c0 });
    put('chair', tx + 0.7, F(tx + 0.7, tz + 0.3), tz + 0.3, -PI / 2 + 0.35, { c: 0x9fb4c0 });
    litLantern(put, tx + 0.05, T, tz + 0.3);
    put('pot', tx - 0.1, T, tz - 0.3, 1.2);
    put('tin', tx + 0.15, T, tz - 0.05, 0, { s: 2 });
    put('fish', tx - 0.12, T, tz + 0.05, 0, { s: 2 });
    put('pad', tx + 0.1, T, tz - 0.42, 0.3);
    put('sheet', tx - 0.15, T + 0.012, tz + 0.48, 0.8);
    hangLamp(put, tx, roofAt(tz) - 0.17, tz, ty);
  }
  // the instrument bench under the right window: the radio and its kit, a meter, the logs, papers; a chair at it
  {
    const bx = IX - 0.48,
      bz = -1.6,
      by = F(bx, bz),
      T = by + 0.79;
    put('desk', bx, by, bz, -PI / 2, { c: 0x9c9e9a });
    collideRun(b, bx + 0.06, bz - 0.8, bx + 0.06, bz + 0.8, 0.42, () => T);
    put('radio', bx + 0.18, T, bz - 0.55, -PI / 2);
    put('radioKit', bx + 0.18, T, bz - 0.55, -PI / 2);
    put('meter', bx + 0.2, T, bz + 0.15, -PI / 2 + 0.3);
    put('medic', bx + 0.12, T, bz + 0.6, -PI / 2 + 0.1);
    put('clip', bx - 0.15, T + 0.003, bz - 0.05, -PI / 2 - 0.2);
    put('papers', bx - 0.05, T, bz + 0.25, 0.2);
    put('pad', bx - 0.2, T, bz + 0.38, -1.4);
    put('sheet', bx - 0.1, T + 0.012, bz - 0.25, 2.2);
    put('chair', bx - 0.75, F(bx - 0.75, bz - 0.2), bz - 0.2, PI / 2 + 0.25, { c: 0x9fb4c0 });
    put('clip', IX - 0.02, b.y + 1.5, -2.35, -PI / 2, { rx: PI / 2 });
    note(put, IX - 0.02, b.y + 1.5 - 0.025, -2.35, -PI / 2, 0, 0.03);
    note(put, IX - 0.012, b.y + 1.45, -0.15, -PI / 2, -0.05);
  }
  // the racks of stores: tins, salt, the pot, jerrycans, papers, the bucket
  for (const [sx, sz, ry] of [
    [1.02, IZ - 0.27, PI],
    [IX - 0.27, 0.2, -PI / 2],
  ]) {
    const sy = F(sx, sz),
      S = shelfAt(sx, sy, sz, ry);
    put('shelves', sx, sy, sz, ry);
    stock(put, S, [1, 2, 3], rnd, 0.85);
    if (ry === PI) put('crate1', ...S(0, 0, 0.27), ry);
    else {
      put('jerry', ...S(-0.22, 0, 0.27), ry);
      put('papers', ...S(0.3, 0, 0.25), ry + 0.2);
    }
    put('papers', ...S(0.2, 4, 0.25), ry - 0.1);
    put('pot', ...S(-0.25, 4, 0.25), ry + 0.5);
    collideRun(
      b,
      sx - Math.cos(ry) * 0.4,
      sz + Math.sin(ry) * 0.4,
      sx + Math.cos(ry) * 0.4,
      sz - Math.sin(ry) * 0.4,
      0.3,
      () => sy + 2.15,
    );
  }
  // jerrycans by the door; the survey sheet on the left wall over the stores' crate, a weather log beside the door
  for (const [x, ry] of [
    [-1.25, 0.15],
    [-1.68, -0.1],
  ])
    put('jerry', x, F(x, -IZ + 0.15), -IZ + 0.15, ry);
  chart(put, -IX + 0.008, b.y + 1.65, -1.55, PI / 2, 1.2);
  put('clip', -1.4, b.y + 1.5, -IZ + 0.02, 0, { rx: PI / 2 });
  note(put, -1.4, b.y + 1.5 - 0.025, -IZ + 0.02, 0, 0, 0.03);
  note(put, -2.1, b.y + 1.55, -IZ + 0.012, 0, 0.05);
  put.done();
}

// the hermit's shack (5 x 4.6 m inside): a round iron heater against the left gable, its pipe out through the wall to his stone
// chimney, firewood and a bucket by it, an axe; his day bed along the back wall; a table and two chairs with a lantern, the pot and
// tins; a rack of stores (on the back wall, or the right if his crate is in that corner); a jerrycan by the door. c: the crate's corner
function hermitRoom(b, P, w, d, c) {
  const t = b.t || 0.45,
    IX = w / 2 - t / 2,
    IZ = d / 2 - t / 2,
    F = (x, z) => gAt(b, x, z) + 0.04,
    put = kitRoom(b),
    rnd = mulberry32(Math.round(b.seed * 1000) + 79),
    PI = Math.PI;
  {
    const hx = -IX + 0.5,
      hz = 0.5,
      yh = F(hx, hz),
      fx = hx - 0.29,
      fz = hz + 0.025;
    put('heater', hx, yh, hz, PI / 2, { c: 0xb8b0a4 });
    box(P, 'iron', 1.2, 0.02, 1.2, hx + 0.15, yh + 0.005, hz);
    rod(P, 'iron', fx, yh + 2.33, fz, fx, yh + 2.45, fz, 0.085, 10);
    rod(P, 'iron', fx, yh + 2.45, fz, -w / 2 - 0.75, yh + 2.45, fz, 0.085, 10);
    put.geo('slot', new THREE.PlaneGeometry(0.26, 0.022).rotateY(PI / 2).translate(hx + 0.47, yh + 0.19, hz));
    put.halo(hx + 0.6, yh + 0.3, hz, 0.9, 0xff8a40);
    const Q = slot();
    Q.heat.push(new THREE.PlaneGeometry(2.2, 2.2).rotateX(-PI / 2).translate(hx + 0.9, yh + 0.02, hz));
    flush(b, Q);
    woodpile(put, hx + 0.1, F(hx, hz - 0.95), hz - 0.95, 4, 3, 0.4, 0.06, rnd);
    put('bucket', hx + 0.65, F(hx + 0.65, hz + 0.65), hz + 0.65, 2.2);
    put('axe', hx + 0.45, F(hx, hz - 0.95) + 0.22, hz - 0.95, 0.2, { rz: -0.3 });
    collideRun(b, hx, hz, hx, hz, 0.5, () => yh + 2.36);
    collideRun(b, hx + 0.1, hz - 1.1, hx + 0.1, hz - 0.8, 0.3, () => yh + 0.4);
  }
  {
    const bx = 1.12,
      bz = IZ - 0.48;
    put('bed', bx, F(bx, bz), bz, PI, { c: 0xd8c8b0 });
    chart(put, bx, b.y + 1.65, IZ - 0.008, PI, 0.8);
    collideRun(b, bx - 0.8, bz + 0.05, bx + 0.8, bz + 0.05, 0.42, () => F(bx, bz) + 0.55);
  }
  {
    const tx = 0.45,
      tz = -0.4,
      ty = F(tx, tz),
      T = ty + 0.8;
    put('table', tx, ty, tz, 0.08);
    collideRun(b, tx - 0.4, tz, tx + 0.4, tz, 0.38, () => T);
    put('chair', tx - 0.25, F(tx - 0.25, tz - 0.7), tz - 0.7, -0.15, { c: 0x8a7a66 });
    put('chair', tx + 0.85, F(tx + 0.85, tz + 0.1), tz + 0.1, -PI / 2 - 0.3, { c: 0x8a7a66 });
    litLantern(put, tx - 0.3, T, tz + 0.12);
    put('pot', tx + 0.2, T, tz + 0.05, 0.7);
    put('tin', tx + 0.05, T, tz - 0.2, 0, { s: 2 });
    put('fish', tx - 0.05, T, tz - 0.1, 0, { s: 2 });
    put('salt', tx + 0.38, T, tz - 0.15, 0.4, { s: 2 });
  }
  {
    const back = !(c[0] < 0 && c[1] > 0),
      sx = back ? -1.3 : IX - 0.27,
      sz = back ? IZ - 0.27 : 0.6,
      ry = back ? PI : -PI / 2,
      sy = F(sx, sz),
      S = shelfAt(sx, sy, sz, ry);
    put('shelves', sx, sy, sz, ry, { c: 0xc8bca8 });
    stock(put, S, [1, 2, 3], rnd, 0.7);
    put('jerry', ...S(-0.22, 0, 0.27), ry);
    put('bucket', ...S(0.28, 0, 0.25), ry);
    put('lantern', ...S(0.25, 4, 0.25), ry);
    put('medic', ...S(-0.15, 4, 0.24), ry);
    collideRun(
      b,
      sx - Math.cos(ry) * 0.4,
      sz + Math.sin(ry) * 0.4,
      sx + Math.cos(ry) * 0.4,
      sz - Math.sin(ry) * 0.4,
      0.3,
      () => sy + 2.15,
    );
  }
  put('jerry', -0.3, F(-0.3, IZ - 0.2), IZ - 0.2, 0.1);
  put.done();
}

// the barge's deckhouse (in the hull's tilted frame m, its floor at y 0; x within +-hw, z from Z0 to Z1, H high): the round heater in
// the back-left corner under the pipe on the roof (scaled to fit the low room), firewood; a bunk (the day bed) along the left wall;
// the chart table (a steel desk) under the front windows with the radio, the log and a lantern, a chair; a rack of stores on the back
// wall; a crate and a jerrycan in the back-right corner. colAt makes colliders in that frame
function deckhouseRoom(b, m, colAt, hw, Z0, Z1, H) {
  const put = kitRoom(b, m),
    rnd = mulberry32(Math.round(b.seed * 1000) + 83),
    PI = Math.PI,
    x0 = -hw + 0.05,
    x1 = hw - 0.05,
    z0 = Z0 + 0.05,
    z1 = Z1 - 0.05;
  {
    const s = 0.92,
      hx = -1.7 + 0.29 * s,
      hz = Z1 - 0.5 - 0.025 * s;
    put('heater', hx, 0, hz, PI / 2, { s });
    put.geo(
      'iron',
      new THREE.CylinderGeometry(0.08, 0.08, H + 0.15 - 2.33 * s, 10).translate(
        -1.7,
        (H + 0.15 + 2.33 * s) / 2,
        Z1 - 0.5,
      ),
    );
    put.geo('slot', new THREE.PlaneGeometry(0.24, 0.02).rotateY(PI / 2).translate(hx + 0.44, 0.18, hz));
    put.halo(hx + 0.55, 0.28, hz, 0.8, 0xff8a40);
    put.geo('pool', new THREE.PlaneGeometry(1.8, 1.8).rotateX(-PI / 2).translate(hx + 0.8, 0.02, hz));
    put('bucket', -0.85, 0, Z1 - 1.25, 0.7);
    colAt(hx, hz, hx, hz, 0.45, 2.2);
  }
  {
    const lx = x0 + 0.47,
      lz = Z0 + 1.05;
    put('bed', lx, 0, lz, PI / 2, { c: 0xc8c0b4 });
    colAt(lx - 0.05, lz - 0.8, lx - 0.05, lz + 0.8, 0.42, 0.55);
  }
  {
    const dx = -0.28,
      dz = z0 + 0.47,
      T = 0.79;
    put('desk', dx, 0, dz, 0, { c: 0x9c9e9a });
    colAt(dx - 0.8, dz - 0.05, dx + 0.8, dz - 0.05, 0.42, T);
    put('radio', dx + 0.45, T, dz - 0.22, 0);
    put('radioKit', dx + 0.45, T, dz - 0.22, 0);
    put('clip', dx - 0.1, T + 0.003, dz + 0.05, 0.3);
    put('papers', dx - 0.5, T, dz - 0.1, -0.2);
    put('sheet', dx - 0.45, T + 0.012, dz + 0.15, 0.9);
    put('pad', dx + 0.1, T, dz + 0.2, -0.4);
    litLantern(put, dx - 0.82, T, dz - 0.18);
    put('tin', dx + 0.82, T, dz + 0.1, 0, { s: 2 });
    put('chair', dx + 0.15, 0, dz + 0.8, PI + 0.3, { c: 0x8f9a8a });
  }
  {
    const sx = 0,
      sz = z1 - 0.27,
      S = shelfAt(sx, 0, sz, PI);
    put('shelves', sx, 0, sz, PI, { s: 0.98 });
    stock(put, S, [1, 2], rnd, 0.8);
    chart(put, x1 - 0.008, 1.5, (Z0 + Z1) / 2, -PI / 2, 0.75);
    put('medic', ...S(-0.15, 3, 0.24), PI);
    put('meter', ...S(0.3, 3, 0.3), PI + 0.3);
    put('jerry', ...S(-0.22, 0, 0.27), PI);
    put('bucket', ...S(0.28, 0, 0.25), PI);
    put('pot', ...S(0.1, 4, 0.25), PI);
    colAt(sx - 0.4, sz, sx + 0.4, sz, 0.3, 2.1);
  }
  {
    const cx = x1 - 0.32,
      cz = z1 - 0.65;
    put('crate', cx, 0, cz, 0.03);
    put('jerry', cx - 0.05, 0.454, cz + 0.1, 1.4);
    colAt(cx, cz - 0.4, cx, cz + 0.4, 0.33, 0.5);
  }
  put.done();
}

// for the other parts of the split (src/buildings.js, src/interiors.js, src/places/)
export { KITS, GAS_KIT, loadKit, radioRoom, outpostRoom, hermitRoom, deckhouseRoom };
