// The sunken barge (slice 23, #52): its hull, containers, rigging and materials. The hermit's yard (src/places/island.js)
// and his room use its bag, rod, lantern and bake too. Moved here unchanged from src/buildings.js (the code cleanup,
// November 16, 2026); buildings.js still exports all of it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y } from '../config.js';
import { groundY } from '../world.js';
import { R, toW } from '../plan.js';
import { boxUV, canvasTex } from '../propmodels.js';
import { CUT, box, gAt, collideRun, collideBox, surface, ladders, cache, lampAt, UP, bar } from '../buildings.js';
import { deckhouseRoom } from '../interiors.js';

// the sunken barge (polish, Jared, November 14, 2026: "the same sort of scale and quality/detail check" as the plane): a 28 m
// riveted river cargo barge, 7.6 m in the beam, run aground with its bow sunk in the water (its deck just awash there) and its
// stern up the bank. Its long hold has four hatch covers on a coaming, one lifted off and stacked (the hold below, half flooded);
// a derrick at the hold's head, its hook down the open hatch; a deckhouse aft you can walk into (windows, a door);
// a container on the covers and another gone overboard into the shallows with its loot spilled round it. A gangplank goes
// up onto the sunk bow; the deck is walkable, the hull, coaming and deckhouse solid. Two crates: the guarded one on the
// foredeck, another in the shallows by the bow
let BM = null;
const WLU = { value: 0 }; // (the barge's waterline, world y: its hull goes dark and green with slime below it)
const TILEB = { rust: 6, green: 4, cream: 4, sack: 0.8, soil: 1.5 }; // (metres a texture covers, box-projected; the rest carry their own uvs)
const seeded = (s) => () => (s = (s * 16807) % 2147483647) / 2147483647; // (a texture is drawn twice, its colour then its alpha: the same both times)
function slime(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWL = WLU;
    sh.vertexShader =
      'varying float vWY;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vWY = (modelMatrix * vec4(transformed, 1.0)).y;',
      );
    sh.fragmentShader =
      'uniform float uWL;\nvarying float vWY;\n' +
      sh.fragmentShader.replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n  { float s = smoothstep(uWL + 0.55, uWL - 0.15, vWY); diffuseColor.rgb *= mix(vec3(1.0), vec3(0.36, 0.41, 0.24), s); diffuseColor.rgb *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.12, abs(vWY - uWL - 0.45))); }',
      );
  };
  m.customProgramCacheKey = () => 'iw-slime';
}
function bargeMats() {
  if (BM) return BM;
  // a seamless sheet of weathered steel: paint faded in blotches, rust where it has gone, plate seams with rivet rows, rust run down
  // from them, pitting, scrapes from quays and locks (or a container's corrugations)
  const sheet = (paint, o, seed) => {
    const t = canvasTex(
      512,
      512,
      (x, w, h) => {
        const rnd = seeded(seed);
        const at = (cx, cy, r, f) => {
          for (const dx of [-w, 0, w])
            for (const dy of [-h, 0, h]) {
              const X = cx + dx,
                Y = cy + dy;
              if (X > -r && X < w + r && Y > -r && Y < h + r) f(X, Y);
            }
        };
        const blob = (cx, cy, r, c, a) =>
          at(cx, cy, r, (X, Y) => {
            const g = x.createRadialGradient(X, Y, 0, X, Y, r);
            g.addColorStop(0, `rgba(${c},${a})`);
            g.addColorStop(1, `rgba(${c},0)`);
            x.fillStyle = g;
            x.fillRect(X - r, Y - r, 2 * r, 2 * r);
          });
        for (let i = 0; i < 200; i++)
          blob(rnd() * w, rnd() * h, 12 + rnd() * 60, rnd() < 0.5 ? '255,248,230' : '0,0,0', 0.04 + rnd() * 0.07);
        if (o.corr)
          for (let k = 0; k < o.corr; k++) {
            const p = w / o.corr;
            x.fillStyle = 'rgba(0,0,0,0.22)';
            x.fillRect(p * k, 0, p * 0.3, h);
            x.fillStyle = 'rgba(255,255,255,0.1)';
            x.fillRect(p * k + p * 0.5, 0, p * 0.22, h);
          }
        const RU = ['118,56,24', '146,76,32', '92,42,20', '168,100,50'];
        for (let i = 0; i < o.rust; i++) {
          const cx = rnd() * w,
            cy = rnd() * h,
            n = 3 + rnd() * 7;
          for (let k = 0; k < n; k++)
            blob(cx + (rnd() - 0.5) * 44, cy + (rnd() - 0.5) * 30, 4 + rnd() * 16, RU[k % 4], 0.35 + rnd() * 0.45);
        }
        const ys = [],
          xs = [];
        for (let r = 0; r < (o.rows || 0); r++) {
          const y = (h / o.rows) * r;
          ys.push(y);
          for (const f of [0, 0.5]) xs.push([w * (f + (r % 2) * 0.25), y, h / o.rows]);
        }
        for (const y of ys) {
          x.fillStyle = 'rgba(20,16,12,0.6)';
          x.fillRect(0, y - 1, w, 2);
          x.fillStyle = 'rgba(255,240,220,0.13)';
          x.fillRect(0, y + 1, w, 1);
        }
        for (const [sx, y0, hh] of xs) {
          x.fillStyle = 'rgba(20,16,12,0.55)';
          x.fillRect(sx - 1, y0, 2, hh);
        }
        const rivet = (cx, cy) =>
          at(cx, cy, 3, (X, Y) => {
            x.fillStyle = 'rgba(14,11,9,0.75)';
            x.fillRect(X - 1.5, Y - 1, 3, 3);
            x.fillStyle = 'rgba(255,235,210,0.28)';
            x.fillRect(X - 1.5, Y - 1.5, 2, 1);
          });
        if (o.rivets) {
          for (const y of ys)
            for (let X = 3; X < w; X += 9) {
              rivet(X, y - 6);
              rivet(X + 4, y + 6);
            }
          for (const [sx, y0, hh] of xs)
            for (let Y = y0 + 6; Y < y0 + hh - 3; Y += 9) {
              rivet(sx - 6, Y);
              rivet(sx + 6, Y + 4);
            }
        }
        for (let i = 0; i < o.streaks; i++) {
          const X = rnd() * w,
            Y = ys.length && rnd() < 0.7 ? ys[Math.floor(rnd() * ys.length)] + 4 : rnd() * h,
            len = 20 + rnd() * 150,
            wd = 1 + rnd() * 3.5,
            c = RU[Math.floor(rnd() * 4)],
            a = 0.3 + rnd() * 0.4;
          at(X, Y + len / 2, len, (X1, Y1) => {
            const g = x.createLinearGradient(0, Y1 - len / 2, 0, Y1 + len / 2);
            g.addColorStop(0, `rgba(${c},${a})`);
            g.addColorStop(1, `rgba(${c},0)`);
            x.fillStyle = g;
            x.fillRect(X1, Y1 - len / 2, wd, len);
          });
        }
        for (let i = 0; i < 2500; i++) {
          x.fillStyle = `rgba(${rnd() < 0.5 ? '30,22,16' : '120,64,30'},${0.2 + rnd() * 0.4})`;
          x.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
        }
        for (let i = 0; i < (o.scuff || 0); i++) {
          x.fillStyle = `rgba(200,190,170,${0.08 + rnd() * 0.12})`;
          x.fillRect(rnd() * w, rnd() * h, 40 + rnd() * 160, 1 + rnd() * 2);
        }
      },
      paint,
    );
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const small = (n, bg, draw) => {
    const t = canvasTex(n, n, draw, bg);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const mk = (map, o = {}) => {
    const m = new THREE.MeshStandardMaterial({
      map,
      color: o.color ?? 0xffffff,
      roughness: o.rough ?? 0.8,
      metalness: o.metal ?? 0.2,
      side: THREE.DoubleSide,
      transparent: !!o.blend,
      opacity: o.opacity ?? 1,
      alphaTest: o.alpha ?? 0,
      depthWrite: !o.blend,
    });
    m.clippingPlanes = [CUT];
    if (o.slime) slime(m);
    return m;
  };
  const cont = sheet('#aaa69c', { corr: 11, rust: 40, streaks: 130 }, 41);
  const text = (lines, bg, w, h) =>
    canvasTex(
      w,
      h,
      (x) => {
        const rnd = seeded(5);
        x.textAlign = 'center';
        x.fillStyle = 'rgba(232,224,204,0.92)';
        for (const [s, f, y] of lines) {
          x.font = f;
          x.fillText(s, w / 2, y);
        }
        x.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < (w * h) / 70; i++) {
          x.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.7})`;
          x.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 4, 1 + rnd() * 3);
        }
      },
      bg,
    );
  BM = {
    rust: mk(sheet('#3a3c3a', { rows: 3, rivets: true, rust: 70, streaks: 220, scuff: 14 }, 11), {
      slime: true,
      metal: 0.3,
    }),
    green: mk(sheet('#56685a', { rows: 2, rivets: true, rust: 45, streaks: 120 }, 23), { metal: 0.25 }),
    cream: mk(sheet('#cbc4ac', { rows: 1, rust: 26, streaks: 150 }, 31), { rough: 0.75 }),
    contB: mk(cont, { color: 0x7090ac, slime: true }),
    contR: mk(cont, { color: 0xa85440, slime: true }),
    hole: new THREE.MeshBasicMaterial({ color: 0x0c0a08, side: THREE.DoubleSide }),
    water: mk(null, { color: 0x2c3123, rough: 0.1, metal: 0.25, blend: true, opacity: 0.9 }),
    rubber: mk(null, { color: 0x1e1d1c, rough: 0.95, metal: 0 }),
    buoy: mk(null, { color: 0xc8643c, rough: 0.7, metal: 0 }),
    leaf: mk(null, { color: 0x56753a, rough: 0.85, metal: 0 }),
    cab: mk(null, { color: 0x9fbb6e, rough: 0.7, metal: 0 }),
    sack: mk(
      small(128, '#9a8058', (x, w, h) => {
        for (let k = 0; k < w; k += 4) {
          x.fillStyle = 'rgba(60,44,24,0.35)';
          x.fillRect(k, 0, 1.5, h);
          x.fillRect(0, k, w, 1.5);
        }
      }),
      { rough: 0.95, metal: 0 },
    ),
    soil: mk(
      small(256, '#3c2c1f', (x, w, h) => {
        const rnd = seeded(3);
        for (let i = 0; i < 900; i++) {
          x.fillStyle = `rgba(${rnd() < 0.5 ? '20,14,9' : '96,74,52'},${0.25 + rnd() * 0.5})`;
          const r = 1 + rnd() * 4;
          x.fillRect(rnd() * w, rnd() * h, r, r * 0.8);
        }
      }),
      { rough: 1, metal: 0 },
    ),
    net: mk(
      small(128, '#3e4636', (x, w, h) => {
        x.strokeStyle = 'rgba(62,70,54,1)';
        x.lineWidth = 4.5;
        for (let k = -w; k <= 2 * w; k += 32) {
          x.beginPath();
          x.moveTo(k, 0);
          x.lineTo(k + h, h);
          x.moveTo(k, 0);
          x.lineTo(k - h, h);
          x.stroke();
        }
      }),
      { alpha: 0.5, rough: 0.9, metal: 0 },
    ),
    name: mk(
      text(
        [
          ['GREY HERON', 'bold 62px Georgia, serif', 84],
          ['LOWMARSH', 'bold 30px Georgia, serif', 136],
        ],
        '#e8e0cc',
        512,
        160,
      ),
      { alpha: 0.35, metal: 0 },
    ),
    code: mk(
      text(
        [
          ['IWLU 418207 3', 'bold 40px monospace', 56],
          ['22G1', 'bold 34px monospace', 104],
        ],
        '#e8e0cc',
        256,
        128,
      ),
      { alpha: 0.35, metal: 0 },
    ),
  };
  BM.hole.clippingPlanes = [CUT];
  return BM;
}
const bag = () => new Proxy({}, { get: (o, k) => (o[k] ||= []) }); // geometry lists by material, made as they are asked for
// a round bar between two points (a mast, a boom, a wire, a pole)
function rod(D, k, x0, y0, z0, x1, y1, z1, r, seg = 8) {
  const d = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0),
    L = d.length();
  D[k].push(
    new THREE.CylinderGeometry(r, r, L, seg)
      .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()))
      .translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
  );
}
// a chain of links from a to c, sagging by sag in its middle
function chain(D, k, a, c, sag, link = 0.12) {
  const n = Math.max(2, Math.round((a.distanceTo(c) * (1 + sag * 0.3)) / (link * 0.8))),
    p = (t) => new THREE.Vector3().lerpVectors(a, c, t).add(new THREE.Vector3(0, -4 * sag * t * (1 - t), 0));
  for (let i = 0; i < n; i++) {
    const p0 = p(i / n),
      p1 = p((i + 1) / n),
      q = new THREE.Quaternion().setFromUnitVectors(UP, p1.clone().sub(p0).normalize());
    D[k].push(
      new THREE.TorusGeometry(link * 0.36, link * 0.1, 4, 8)
        .scale(0.8, 1.4, 1)
        .rotateY(i % 2 ? Math.PI / 2 : 0)
        .applyQuaternion(q)
        .translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2),
    );
  }
}
// a ship's lantern: a lit glass box in a cage under a cap, hung by its bail
function lantern(D, x, y, z) {
  D.glow.push(new THREE.BoxGeometry(0.1, 0.16, 0.1).translate(x, y, z));
  D.iron.push(new THREE.ConeGeometry(0.11, 0.09, 4).rotateY(Math.PI / 4).translate(x, y + 0.13, z));
  box(D, 'iron', 0.15, 0.025, 0.15, x, y - 0.095, z);
  for (const [a, c] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ])
    box(D, 'iron', 0.015, 0.2, 0.015, x + a * 0.065, y, z + c * 0.065);
  D.iron.push(new THREE.TorusGeometry(0.045, 0.008, 4, 8).translate(x, y + 0.21, z));
}
// lists of geometry into meshes on the building's group: my own materials (box-projected in the frame they were made in, then
// moved by m), and the shared ones into P (or the roof's PR) for buildBuildings to merge
function bake(b, lists) {
  const M_ = bargeMats(),
    out = {};
  for (const [D, m] of lists)
    for (const k in D)
      for (const q of D[k]) {
        if (TILEB[k]) boxUV(q, TILEB[k]);
        if (m) q.applyMatrix4(m);
        (out[k] ||= []).push(q.index ? q.toNonIndexed() : q);
      }
  for (const k in out) {
    const mesh = new THREE.Mesh(mergeGeometries(out[k]), M_[k]);
    mesh.castShadow = !['water', 'hole', 'name', 'code', 'net'].includes(k);
    mesh.receiveShadow = true;
    b.group.add(mesh);
  }
}
const share = (D, m, into) => {
  for (const k in D) for (const q of D[k]) into[k].push(m ? q.applyMatrix4(m) : q);
};
// a 20 ft shipping container (6.06 x 2.44 x 2.59 m) in its own frame, its doors at +z: corrugated walls, corner posts and
// castings, the doors' locking bars; open swings the right-hand door out
function container(k, open) {
  const l = 6.06,
    w = 2.44,
    h = 2.59,
    D = bag(),
    plate = (sx, sy, sz, x, y, z, ry = 0) =>
      D[k].push(boxUV(new THREE.BoxGeometry(sx, sy, sz).rotateY(ry).translate(x, y, z), 3));
  for (const s of [-1, 1]) plate(0.05, h - 0.2, l - 0.2, s * (w / 2 - 0.04), h / 2, 0);
  plate(w - 0.1, 0.05, l - 0.1, 0, h - 0.05, 0);
  plate(w - 0.1, 0.05, l - 0.1, 0, 0.05, 0);
  plate(w - 0.1, h - 0.2, 0.05, 0, h / 2, -l / 2 + 0.05);
  plate(w / 2 - 0.06, h - 0.24, 0.05, -w / 4, h / 2, l / 2 - 0.05);
  if (open) {
    const f = 1.95;
    plate(w / 2 - 0.06, h - 0.24, 0.05, w / 2 - 0.06 + (Math.cos(f) * w) / 4, h / 2, l / 2 + (Math.sin(f) * w) / 4, f);
  } else plate(w / 2 - 0.06, h - 0.24, 0.05, w / 4, h / 2, l / 2 - 0.05);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      box(D, 'iron', 0.13, h, 0.13, sx * (w / 2 - 0.06), h / 2, sz * (l / 2 - 0.06));
      for (const y of [0.06, h - 0.06]) box(D, 'iron', 0.18, 0.12, 0.17, sx * (w / 2 - 0.08), y, sz * (l / 2 - 0.08));
    }
  for (const sx of [-1, 1])
    for (const y of [0.08, h - 0.08]) box(D, 'iron', 0.1, 0.13, l - 0.2, sx * (w / 2 - 0.05), y, 0);
  for (const sz of [-1, 1])
    for (const y of [0.08, h - 0.08]) box(D, 'iron', w - 0.2, 0.13, 0.1, 0, y, sz * (l / 2 - 0.05));
  for (const x of open ? [-0.95, -0.3] : [-0.95, -0.3, 0.3, 0.95]) {
    rod(D, 'iron', x, 0.15, l / 2 + 0.01, x, h - 0.15, l / 2 + 0.01, 0.022, 6);
    box(D, 'iron', 0.05, 0.05, 0.12, x + 0.06, h * 0.45, l / 2 + 0.06);
  }
  D.code.push(new THREE.PlaneGeometry(0.9, 0.45).translate(-0.62, h - 0.5, l / 2 - 0.02));
  return D;
}
function buildBarge(b, P, g) {
  const L = 28,
    W = 7.6,
    D = 2.7,
    cw = 2.25,
    hs = -10,
    he = 7,
    Z0 = 8.9,
    Z1 = 12.4,
    hw = 2.3,
    H = 2.35,
    wl = b.wl ?? WATER_Y,
    T = bag(),
    TP = bag(),
    TL = bag(),
    TR = bag();
  WLU.value = wl;
  // how it lies: the stern on the bank (its keel just in the ground), the bow down to the water, its deck just awash there, a slight list
  const gS = Math.max(...[0, -W / 2, W / 2].map((x) => gAt(b, x, L / 2 - 1))),
    gB = Math.max(...[0, -W / 2, W / 2].map((x) => gAt(b, x, -L / 2 + 1)));
  const dB = Math.max(wl + 0.12, gB + 0.3),
    tilt = Math.min(0.17, Math.max(0.035, Math.atan2(gS + D - 0.35 - dB, L))),
    roll = (b.seed % 2 < 1 ? 1 : -1) * 0.022,
    dMid = dB + (L / 2) * Math.sin(tilt);
  const M = new THREE.Matrix4()
      .makeTranslation(0, dMid, 0)
      .multiply(new THREE.Matrix4().makeRotationZ(roll))
      .multiply(new THREE.Matrix4().makeRotationX(-tilt)),
    Mi = M.clone().invert();
  const at = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(M),
    N = new THREE.Vector3(0, 1, 0).transformDirection(M),
    deckY = (lx, lz) => dMid - (N.x * lx + N.z * lz) / N.y,
    v = new THREE.Vector3();
  const colAt = (x0, z0, x1, z1, r, top = 1.1) => {
    const p = at(x0, 0, z0),
      q = at(x1, 0, z1);
    collideRun(b, p.x, p.z, q.x, q.z, r, (lx, lz) => deckY(lx, lz) + top);
  };
  // the hull (barge frame: the deck at y 0, the bow at -z): riveted sides with a spoon bow raked up from the keel and a counter
  // stern, a low bulwark, a rubbing strake and a wale, the deck plates; rust holes and a gash; her name aft on both sides and the stern
  const prof = new THREE.Shape(
    [
      [L / 2, 0.32],
      [L / 2, -0.9],
      [L / 2 - 1.6, -D],
      [-L / 2 + 3, -D],
      [-L / 2, -0.45],
      [-L / 2, 0.32],
    ].map(([z, y]) => new THREE.Vector2(-z, y)),
  );
  for (const s of [-1, 1])
    T.rust.push(
      new THREE.ExtrudeGeometry(prof, { depth: 0.08, bevelEnabled: false })
        .rotateY(Math.PI / 2)
        .translate((s * W) / 2 - 0.04, 0, 0),
    );
  box(T, 'rust', W, 0.08, L - 4.6, 0, -D, 0.7);
  {
    const l = Math.hypot(3, D - 0.45);
    box(T, 'rust', W, 0.08, l, 0, (-0.45 - D) / 2, -L / 2 + 1.5, 0, Math.asin((D - 0.45) / l));
  }
  {
    const l = Math.hypot(1.6, D - 0.9);
    box(T, 'rust', W, 0.08, l, 0, (-0.9 - D) / 2, L / 2 - 0.8, 0, -Math.asin((D - 0.9) / l));
  }
  box(T, 'rust', W, 0.45, 0.08, 0, -0.225, -L / 2);
  for (const s of [-1, 1]) box(T, 'rust', W / 2 - 0.75, 0.32, 0.08, s * (W / 4 + 0.375), 0.16, -L / 2); // (the bow's bulwark open in the middle: the gangplank's way)
  box(T, 'rust', W, 1.22, 0.08, 0, -0.29, L / 2);
  box(TP, 'iron', W - 0.1, 0.06, hs + L / 2, 0, -0.03, (hs - L / 2) / 2);
  box(TP, 'iron', W - 0.1, 0.06, L / 2 - he, 0, -0.03, (he + L / 2) / 2);
  for (const s of [-1, 1]) {
    box(TP, 'iron', W / 2 - cw - 0.05, 0.06, he - hs, (s * (W / 2 + cw)) / 2, -0.03, (hs + he) / 2);
    box(TP, 'iron', 0.2, 0.05, L + 0.05, (s * W) / 2, 0.345, 0);
    box(T, 'rust', 0.14, 0.2, L - 1.2, s * (W / 2 + 0.1), -0.32, 0.4);
    box(T, 'rust', 0.12, 0.16, L - 4, s * (W / 2 + 0.09), -1.25, 1.2);
    T.name.push(new THREE.PlaneGeometry(3.2, 1.0).rotateY((s * Math.PI) / 2).translate(s * (W / 2 + 0.05), -0.75, 7.5));
  }
  box(TP, 'iron', W, 0.05, 0.2, 0, 0.345, L / 2);
  T.name.push(new THREE.PlaneGeometry(3.4, 1.06).translate(0, -0.42, L / 2 + 0.05));
  for (const [s, z, y, r, sx] of [
    [-1, -6.2, -0.95, 0.34, 1.3],
    [1, 3.4, -1.55, 0.2, 1],
    [-1, 9.5, -0.5, 0.13, 1],
    [1, -9.2, -1.05, 0.55, 1.9],
    [1, 10.8, -0.65, 0.16, 1.2],
    [-1, 2.6, -1.8, 0.24, 1.4],
  ]) {
    const c = new THREE.CircleGeometry(r, 10),
      p = c.attributes.position;
    for (let i = 1; i < p.count; i++) {
      const f = 0.65 + R() * 0.55;
      p.setXY(i, p.getX(i) * f * sx, p.getY(i) * f);
    }
    T.hole.push(c.rotateY((s * Math.PI) / 2).translate(s * (W / 2 + 0.046), y, z));
  }
  // old tyres hung on ropes along her sides for fenders
  for (const [s, z] of [
    [-1, -3.5],
    [-1, 2.0],
    [-1, 11.2],
    [1, -1.0],
    [1, 4.6],
    [1, 11.6],
  ]) {
    T.rubber.push(
      new THREE.TorusGeometry(0.32, 0.12, 6, 14).rotateY(Math.PI / 2).translate(s * (W / 2 + 0.17), -0.62, z),
    );
    rod(TP, 'beam', s * (W / 2 + 0.04), 0.34, z, s * (W / 2 + 0.17), -0.28, z, 0.018, 4);
  }
  // rails on stanchions along her sides and across the stern and the bow's corners: a few gone, one bent
  const rail = (x0, z0, x1, z1, gone, bent) => {
    bar(TP, 'iron', x0, 0.34, z0, x0, 1.05, z0, 0.05);
    if (gone) return;
    if (bent) {
      const xm = (x0 + x1) / 2 + Math.sign(x0 || 1) * 0.18,
        zm = (z0 + z1) / 2;
      bar(TP, 'iron', x0, 1.05, z0, xm, 0.55, zm, 0.04);
      bar(TP, 'iron', xm, 0.55, zm, x1, 1.05, z1, 0.04);
    } else bar(TP, 'iron', x0, 1.05, z0, x1, 1.05, z1, 0.045);
    bar(TP, 'iron', x0, 0.7, z0, x1, 0.7, z1, 0.035);
  };
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.1);
    for (let z = -L / 2 + 0.1; z < L / 2 - 0.2; z += 1.5)
      rail(x, z, x, Math.min(z + 1.5, L / 2 - 0.1), R() < 0.1, R() < 0.06);
    rail(x, L / 2 - 0.1, x, L / 2 - 0.1, true);
    for (let x0 = s * (W / 2 - 0.1); Math.abs(x0) > 0.9; x0 -= s * 1.45)
      rail(x0, -L / 2 + 0.1, x0 - s * Math.min(1.45, Math.abs(x0) - 0.85), -L / 2 + 0.1, false, false);
    rail(s * 0.85, -L / 2 + 0.1, 0, 0, true);
  }
  for (let x = -W / 2 + 0.1; x < W / 2 - 0.2; x += 1.25)
    rail(x, L / 2 - 0.1, Math.min(x + 1.25, W / 2 - 0.1), L / 2 - 0.1, false, false);
  // double bitts at the bow and the stern
  for (const s of [-1, 1])
    for (const z of [-L / 2 + 1.1, L / 2 - 0.9]) {
      const x = s * (W / 2 - 0.6);
      box(T, 'rust', 0.36, 0.06, 1.0, x, 0.03, z);
      for (const d of [-0.3, 0.3]) {
        T.rust.push(new THREE.CylinderGeometry(0.13, 0.14, 0.5, 10).translate(x, 0.28, z + d));
        T.rust.push(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 10).translate(x, 0.55, z + d));
      }
      colAt(x, z - 0.3, x, z + 0.3, 0.2);
    }
  // the hold: a coaming round it (brackets outside), the tank top far below, a ladder down; four hatch covers on the coaming, the
  // second lifted and stacked askew on the first (the hold open under the derrick's hook), a container on the last two
  const hh = D - 0.25 + 0.9,
    hy = (0.9 - D + 0.25) / 2;
  for (const s of [-1, 1]) {
    box(T, 'green', 0.08, hh, he - hs, s * cw, hy, (hs + he) / 2);
    box(T, 'green', 0.22, 0.05, he - hs + 0.2, s * (cw + 0.05), 0.92, (hs + he) / 2);
    for (let z = hs + 0.7; z < he; z += 1.4) box(T, 'green', 0.22, 0.55, 0.04, s * (cw + 0.12), 0.3, z);
    colAt(s * (cw + 0.05), hs - 0.05, s * (cw + 0.05), he + 0.05, 0.15, 1.0);
  }
  // (the aft one open above the deck at the ladder: Jared, November 15, 2026, "an empty area in the center that you can't actually get to")
  const xl = -1.2;
  box(T, 'green', 2 * cw, hh, 0.08, 0, hy, hs);
  box(T, 'green', 2 * cw + 0.2, 0.05, 0.22, 0, 0.92, hs);
  colAt(-cw, hs, cw, hs, 0.15, 1.0);
  box(T, 'green', 2 * cw, D - 0.25, 0.08, 0, (0.25 - D) / 2, he);
  for (const [a, e] of [
    [-cw - 0.1, xl - 0.55],
    [xl + 0.55, cw + 0.1],
  ]) {
    box(T, 'green', e - a, 0.9, 0.08, (a + e) / 2, 0.45, he);
    box(T, 'green', e - a, 0.05, 0.22, (a + e) / 2, 0.92, he);
  }
  colAt(-cw, he, xl - 0.65, he, 0.15, 1.0);
  colAt(xl + 0.65, he, cw, he, 0.15, 1.0);
  colAt(xl - 0.5, he + 0.35, xl + 0.5, he + 0.35, 0.25, -0.1); // (and shut below the deck there: nobody walks from the hold in under it)
  const cover = (zc, dx = 0, dy = 0, ry = 0) => {
    const C = bag(),
      hf = cw + 0.18;
    for (const s of [-1, 1]) {
      box(C, 'green', hf, 0.1, 4.15, (s * hf) / 2, 1.06, 0, 0, 0, -s * 0.05);
      for (const z of [-1.55, -0.52, 0.52, 1.55])
        box(C, 'green', hf - 0.05, 0.07, 0.08, (s * hf) / 2, 1.14, z, 0, 0, -s * 0.05);
      box(C, 'green', 0.05, 0.24, 4.15, s * hf, 0.92, 0);
    }
    for (const z of [-2.05, 2.05]) box(C, 'green', 2 * hf, 0.24, 0.05, 0, 0.98, z);
    for (const q of C.green) T.green.push(q.rotateY(ry).translate(dx, dy, zc));
  };
  const slot = (k) => hs + 2.125 + 4.25 * k;
  cover(slot(0));
  cover(slot(0) + 0.3, 0.22, 0.3, 0.07);
  cover(slot(2));
  cover(slot(3));
  {
    const C = container('contB', false),
      m = new THREE.Matrix4()
        .makeTranslation(0.3, 1.12, slot(2) + 2.125)
        .multiply(new THREE.Matrix4().makeRotationY(0.06));
    for (const k in C) for (const q of C[k]) (k === 'iron' ? TP : T)[k].push(q.applyMatrix4(m));
  }
  box(TP, 'iron', 2 * cw - 0.1, 0.05, he - hs - 0.1, 0, -D + 0.25, (hs + he) / 2);
  for (const d of [-0.22, 0.22]) bar(TP, 'iron', xl + d, -D + 0.27, he - 0.12, xl + d, 0.95, he - 0.12, 0.045);
  for (let y = -D + 0.5; y < 0.1; y += 0.3) bar(TP, 'iron', xl - 0.22, y, he - 0.12, xl + 0.22, y, he - 0.12, 0.03);
  {
    const lo = at(xl, -D + 0.28, he - 0.45),
      hi = at(xl, 0.02, he - 0.45),
      o = at(xl, 0, he + 0.75); // (down into the hold and up out of it, the climber facing aft as on every ladder)
    ladders.push({
      b,
      y0: lo.y,
      y1: hi.y,
      off: toW(b, o.x, o.z),
      at: (y) => {
        const f = Math.min(1, Math.max(0, (y - lo.y) / (hi.y - lo.y)));
        return toW(b, lo.x + (hi.x - lo.x) * f, lo.z + (hi.z - lo.z) * f);
      },
    });
  }
  {
    const c = at(-1.3, -D + 0.28, -1.2),
      [cx, cz] = toW(b, c.x, c.z);
    cache(b, g, c.x, c.z, null, { k: 2, y: Math.max(c.y, groundY(cx, cz)), ry: 0.3, isNew: true });
  } // a crate left in the hold: worth the climb
  // (on the land where it fills the sunken hull above her floor: silent-marsh-90's sat 0.6 m into it, round 4's crate watch)
  for (const [x, z, ry] of [
    [0.9, -2.3, 0.2],
    [1.6, -2.5, -0.3],
    [1.2, -2.0, 1.4],
    [0.3, -2.4, 0.9],
    [1.4, -2.3, 0.1],
  ])
    T.sack.push(
      new THREE.SphereGeometry(0.4, 8, 6)
        .scale(0.95, 0.36, 0.6)
        .rotateY(ry)
        .translate(x, -D + 0.45 + (ry > 1 ? 0.28 : 0), z),
    );
  for (const [x, z, a] of [
    [-1.2, -3.0, 0.4],
    [-0.3, -4.9, 1.2],
  ])
    TP.paint.push(
      new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14)
        .rotateZ(Math.PI / 2)
        .rotateY(a)
        .translate(x, -D + 0.56, z),
    );
  {
    const p = at(0, -D + 0.28, hs),
      q = at(0, 0, (hs + he) / 2);
    if (wl > p.y + 0.05)
      TL.water.push(
        new THREE.PlaneGeometry(2 * cw - 0.1, (he - hs) * Math.cos(tilt) - 0.1)
          .rotateX(-Math.PI / 2)
          .translate(q.x, wl, q.z),
      );
  } // (flooded to the water outside)
  // the derrick at the hold's head: a mast with a crosstree and its lantern, a boom out over the open hatch, the hook down it; a
  // winch at its foot, stays to the bow and the sides; the anchor windlass on the foredeck, its chain out of the hawse into the water
  const mz = -10.75,
    tip = [0.55, 5.4, -3.6];
  T.cream.push(new THREE.CylinderGeometry(0.12, 0.18, 7.8, 10).translate(0, 3.9, mz));
  box(T, 'green', 0.7, 0.4, 0.7, 0, 0.2, mz);
  box(T, 'cream', 1.8, 0.1, 0.1, 0, 6.6, mz);
  rod(T, 'cream', 0, 1.5, mz + 0.2, ...tip, 0.11);
  rod(TP, 'iron', 0, 7.7, mz, ...tip, 0.02, 4);
  rod(TP, 'iron', ...tip, tip[0], 0.6, tip[2], 0.016, 4);
  box(TP, 'paint', 0.22, 0.38, 0.16, tip[0], 0.45, tip[2]);
  TP.iron.push(new THREE.TorusGeometry(0.1, 0.025, 5, 10, 4.2).translate(tip[0], 0.14, tip[2]));
  for (const s of [-1, 1]) {
    rod(TP, 'iron', 0, 7.6, mz, s * (W / 2 - 0.15), 0.36, -L / 2 + 0.6, 0.014, 4);
    rod(TP, 'iron', 0, 7.0, mz, s * (W / 2 - 0.15), 0.36, mz + 0.4, 0.014, 4);
  }
  T.green.push(new THREE.CylinderGeometry(0.2, 0.2, 0.7, 12).rotateZ(Math.PI / 2).translate(0, 0.5, mz - 0.6));
  for (const s of [-1, 1]) box(T, 'green', 0.06, 0.6, 0.5, s * 0.4, 0.3, mz - 0.6);
  colAt(0, mz - 0.7, 0, mz, 0.2);
  lantern(TP, 0.8, 6.25, mz);
  lampAt(b, new THREE.Vector3(0.8, 6.25, mz).applyMatrix4(M), 'lantern');
  rod(TP, 'iron', 0.8, 6.55, mz, 0.8, 6.46, mz, 0.008, 4);
  {
    const x = -1.6,
      z = -12.4;
    box(T, 'green', 1.1, 0.14, 0.7, x, 0.07, z);
    for (const d of [-0.45, 0.45]) box(T, 'green', 0.08, 0.7, 0.6, x + d, 0.42, z);
    T.rust.push(new THREE.CylinderGeometry(0.17, 0.17, 0.82, 12).rotateZ(Math.PI / 2).translate(x, 0.5, z));
    T.rust.push(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 7).rotateZ(Math.PI / 2).translate(x - 0.25, 0.5, z));
    colAt(x - 0.5, z, x + 0.5, z, 0.2);
    chain(TP, 'iron', new THREE.Vector3(x - 0.25, 0.2, z - 0.3), new THREE.Vector3(-2.3, 0.08, -L / 2 + 0.3), 0);
    TP.iron.push(new THREE.TorusGeometry(0.2, 0.06, 6, 12).translate(-2.3, -0.12, -L / 2 - 0.05));
    const e = at(-2.3, -0.15, -L / 2 - 0.06),
      f = [e.x - 0.5, e.z - 3.2];
    chain(P, 'iron', e, new THREE.Vector3(f[0], gAt(b, ...f) + 0.06, f[1]), 0.35);
  }
  // the deckhouse aft: windows round it (two broken), a door at its front standing open (its room left bare: another pass furnishes
  // the interiors); on its roof a rail, a mast with a lamp, a searchlight, a horn and the stove's pipe
  const wallB = (x0, z0, x1, z1, holes) => {
    const l = Math.hypot(x1 - x0, z1 - z0),
      ux = (x1 - x0) / l,
      uz = (z1 - z0) / l,
      al = Math.abs(ux) > 0.5;
    const piece = (s0, s1, y0, y1) => {
      if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return;
      const c = (s0 + s1) / 2;
      box(T, 'cream', al ? s1 - s0 : 0.1, y1 - y0, al ? 0.1 : s1 - s0, x0 + ux * c, (y0 + y1) / 2, z0 + uz * c);
    };
    let s = 0;
    for (const o of holes) {
      const a = l / 2 + o.c - o.w / 2,
        e = l / 2 + o.c + o.w / 2;
      piece(s, a, 0, H);
      piece(a, e, 0, o.y0);
      piece(a, e, o.y1, H);
      s = e;
      if (o.y0 > 0) {
        const cx = x0 + (ux * (a + e)) / 2,
          cz = z0 + (uz * (a + e)) / 2,
          sx = al ? o.w : 0.04,
          sz = al ? 0.04 : o.w;
        if (!o.broken) box(TP, 'glass', sx, o.y1 - o.y0, sz, cx, (o.y0 + o.y1) / 2, cz);
        else
          for (let k = 0; k < 3; k++)
            box(
              TP,
              'glass',
              al ? 0.16 + R() * 0.2 : 0.03,
              0.1 + R() * 0.25,
              al ? 0.03 : 0.16 + R() * 0.2,
              cx + ux * (k - 1) * o.w * 0.32,
              o.y0 + 0.12 + R() * 0.1,
              cz + uz * (k - 1) * o.w * 0.32,
              0,
              al ? 0 : R() * 0.6,
              al ? R() * 0.6 : 0,
            );
        for (const y of [o.y0, o.y1]) box(TP, 'iron', al ? o.w + 0.06 : 0.14, 0.05, al ? 0.14 : o.w + 0.06, cx, y, cz);
        for (const d of [-1, 1])
          box(
            TP,
            'iron',
            al ? 0.05 : 0.14,
            o.y1 - o.y0,
            al ? 0.14 : 0.05,
            cx + (ux * d * o.w) / 2,
            (o.y0 + o.y1) / 2,
            cz + (uz * d * o.w) / 2,
          );
      }
    }
    piece(s, l, 0, H);
  };
  const wn = (c, w = 0.9, broken = false) => ({ c, w, y0: 1.05, y1: 1.85, broken });
  wallB(-hw, Z0, hw, Z0, [wn(-1.45), wn(-0.3, 0.9, true), { c: 1.35, w: 1.0, y0: 0, y1: 2.05 }]);
  wallB(-hw, Z1, hw, Z1, [wn(-1.0, 0.8), wn(1.0, 0.8)]);
  wallB(-hw, Z0, -hw, Z1, [wn(-0.9, 0.85), wn(0.9, 0.85, true)]);
  wallB(hw, Z0, hw, Z1, [wn(-0.9, 0.85), wn(0.9, 0.85)]);
  box(T, 'cream', 0.05, 2.02, 0.98, 1.9, 1.02, Z0 - 0.5, 0.1);
  for (const y of [0.4, 1.0, 1.6]) box(TP, 'iron', 0.03, 0.05, 0.25, 1.88, y, Z0 - 0.12);
  colAt(1.9, Z0 - 0.15, 1.95, Z0 - 0.95, 0.1);
  colAt(-hw, Z0, 0.85, Z0, 0.15, H);
  colAt(1.85, Z0, hw, Z0, 0.15, H);
  colAt(-hw, Z1, hw, Z1, 0.15, H);
  for (const s of [-1, 1]) colAt(s * hw, Z0, s * hw, Z1, 0.15, H);
  deckhouseRoom(b, M, colAt, hw, Z0, Z1, H); // (polish: its room in scanned props, with the interiors)
  lantern(TP, 0.55, 2.0, Z0 - 0.3);
  lampAt(b, new THREE.Vector3(0.55, 2.0, Z0 - 0.3).applyMatrix4(M), 'lantern');
  box(TP, 'iron', 0.03, 0.03, 0.32, 0.55, 2.24, Z0 - 0.16);
  T.buoy.push(new THREE.TorusGeometry(0.3, 0.07, 8, 18).rotateY(Math.PI / 2).translate(hw + 0.1, 1.45, (Z0 + Z1) / 2));
  box(TR, 'iron', 2 * hw + 0.3, 0.1, Z1 - Z0 + 0.3, 0, H + 0.05, (Z0 + Z1) / 2);
  box(T, 'cream', 2 * hw + 0.34, 0.12, 0.05, 0, H - 0.02, Z0 - 0.15); // the roof (lifts off with the cutaway) and its drip edge
  for (const [x0, z0, x1, z1] of [
    [-hw, Z0, hw, Z0],
    [-hw, Z1, hw, Z1],
    [-hw, Z0, -hw, Z1],
    [hw, Z0, hw, Z1],
  ]) {
    bar(TP, 'iron', x0, H + 0.9, z0, x1, H + 0.9, z1, 0.04);
    for (let f = 0; f <= 1.001; f += 1 / 3)
      bar(
        TP,
        'iron',
        x0 + (x1 - x0) * f,
        H + 0.1,
        z0 + (z1 - z0) * f,
        x0 + (x1 - x0) * f,
        H + 0.9,
        z0 + (z1 - z0) * f,
        0.04,
      );
  }
  rod(TP, 'iron', 1.5, H + 0.1, Z1 - 0.6, 1.5, H + 2.3, Z1 - 0.6, 0.045, 6);
  box(TP, 'iron', 0.9, 0.05, 0.05, 1.5, H + 1.9, Z1 - 0.6);
  TP.glow.push(new THREE.SphereGeometry(0.09, 8, 6).translate(1.5, H + 2.38, Z1 - 0.6));
  T.cream.push(
    new THREE.CylinderGeometry(0.17, 0.14, 0.34, 12).rotateX(Math.PI / 2).translate(-1.4, H + 0.42, Z0 + 0.4),
  );
  TP.glass.push(new THREE.CircleGeometry(0.15, 12).rotateY(Math.PI).translate(-1.4, H + 0.42, Z0 + 0.22));
  rod(TP, 'iron', -1.4, H + 0.1, Z0 + 0.4, -1.4, H + 0.26, Z0 + 0.4, 0.04, 6);
  T.cream.push(new THREE.ConeGeometry(0.12, 0.4, 10).rotateX(-Math.PI / 2).translate(0.4, H + 0.3, Z0 + 0.35));
  rod(TP, 'iron', -1.7, H + 0.1, Z1 - 0.5, -1.7, H + 1.0, Z1 - 0.5, 0.08, 8);
  TP.iron.push(new THREE.ConeGeometry(0.16, 0.12, 8).translate(-1.7, H + 1.08, Z1 - 0.5));
  // the guarded crate on the foredeck, beside the derrick
  {
    const c = at(1.9, 0, -11.6);
    cache(b, g, c.x, c.z, b.place, { k: 3, y: deckY(c.x, c.z) });
  }
  // a gangplank up onto the sunk bow from the shallows (lying a little way along the deck first)
  const p = at(0, 0.05, -L / 2 + 0.05),
    gq = new THREE.Vector3(p.x, 0, p.z - 2.4);
  gq.y = Math.min(p.y - 0.15, gAt(b, gq.x, gq.z) + 0.06);
  {
    const len = p.distanceTo(gq),
      c = p.clone().add(gq).multiplyScalar(0.5),
      rx = -Math.asin((p.y - gq.y) / len);
    for (const d of [-0.29, 0.29]) {
      box(P, 'planks', 0.56, 0.06, len, p.x + d, c.y, c.z, 0, rx);
      box(TP, 'planks', 0.56, 0.06, 0.6, d, 0.03, -L / 2 + 0.35);
    }
    for (let s = 0.25; s < len - 0.15; s += 0.4) {
      const f = s / len;
      box(P, 'beam', 1.15, 0.04, 0.06, p.x, gq.y + (p.y - gq.y) * f + 0.05, gq.z + (p.z - gq.z) * f, 0, rx);
    }
  }
  surface(b, (lx, lz) => {
    if (Math.abs(lx - p.x) <= 0.6 && lz >= gq.z && lz <= p.z)
      return gq.y + 0.03 + ((p.y - gq.y) * (lz - gq.z)) / (p.z - gq.z);
    const B = v.set(lx, deckY(lx, lz), lz).applyMatrix4(Mi);
    if (Math.abs(B.x) > W / 2 - 0.2 || B.z < -L / 2 + 0.06 || B.z > L / 2 - 0.2) return null;
    return Math.abs(B.x) < cw + 0.06 && B.z > hs - 0.06 && B.z < he + 0.06
      ? deckY(lx, lz) - (D - 0.28) / N.y
      : deckY(lx, lz);
  }); // (the hold: its tank top)
  // the hull is solid along its gunwale (a player climbs it from the shallows where it is low), open at the bow for the gangplank
  for (const s of [-1, 1]) {
    colAt((s * W) / 2, -L / 2, (s * W) / 2, L / 2, 0.28, 0.32);
    colAt((s * W) / 2, -L / 2, s * 0.85, -L / 2, 0.28, 0.32);
  }
  colAt(-W / 2, L / 2, W / 2, L / 2, 0.28, 0.32);
  colAt(-0.9, -L / 2 + 0.8, 0.9, -L / 2 + 0.8, 0.25, -0.1); // (and under the bow's opening, just inside it, shut below the deck: Jared, November 15, 2026, "we also glitched under it")
  b.roofBox = { cz: at(0, 0, (Z0 + Z1) / 2).z, w: 2 * hw, d: Z1 - Z0 };
  b.h = at(0, H, (Z0 + Z1) / 2).y - b.y;
  // overboard: a container sunk to its knees in the shallows, leaning, off the port bow, one door open and its cargo spilled; drums, crates and
  // sacks lost round the bow, planks afloat, the second crate in the shallows to starboard; her stern moored by a chain to a stake
  {
    const o = at(-W / 2 - 3.2, 0, -4.4),
      yaw = Math.PI + 0.3,
      C = container('contR', true);
    // (sunk from the lowest ground under it, not its middle: on a bank that falls to the water one end hung in the air; places round 2)
    const cy =
      Math.min(
        ...[
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
          [0, 0],
        ].map(([u, v]) =>
          gAt(
            b,
            o.x + Math.cos(yaw) * u * 1.22 + Math.sin(yaw) * v * 3.03,
            o.z - Math.sin(yaw) * u * 1.22 + Math.cos(yaw) * v * 3.03,
          ),
        ),
      ) - 0.6;
    const m = new THREE.Matrix4()
      .makeTranslation(o.x, cy, o.z)
      .multiply(new THREE.Matrix4().makeRotationY(yaw))
      .multiply(new THREE.Matrix4().makeRotationX(0.07))
      .multiply(new THREE.Matrix4().makeRotationZ(0.13));
    for (const k in C) for (const q of C[k]) (k === 'iron' ? P : TL)[k].push(q.applyMatrix4(m));
    const ax = Math.sin(yaw),
      az = Math.cos(yaw);
    collideBox(b, o.x, o.z, 6.06, 2.44, yaw, () => cy + 2.5);
    for (const [d, s, k] of [
      [3.6, 0.4, 'planks'],
      [4.4, -0.6, 'planks'],
      [5.3, 0.3, 'sack'],
      [4.0, 1.1, 'sack'],
      [6.0, -0.5, 'planks'],
    ]) {
      const x = o.x + ax * d + az * s,
        z = o.z + az * d - ax * s,
        y = gAt(b, x, z);
      if (k === 'sack')
        TL.sack.push(
          new THREE.SphereGeometry(0.4, 8, 6)
            .scale(0.95, 0.36, 0.6)
            .rotateY(R() * 3)
            .translate(x, y + 0.1, z),
        );
      else {
        box(P, 'planks', 0.7, 0.55, 0.6, x, y + 0.12, z, R() * 3, (R() - 0.5) * 0.4, (R() - 0.5) * 0.4);
        collideRun(b, x, z, x, z, 0.4, () => y + 0.4);
      }
    }
  }
  for (const [bx, bz, lying, k] of [
    [-W / 2 - 1.2, -9.6, 1, 'paint'],
    [-W / 2 - 0.8, -12.6, 0, 'iron'],
    [W / 2 + 1.2, -12.4, 1, 'paint'],
    [-1.6, -L / 2 - 2.6, 1, 'iron'],
    [W / 2 + 1.0, -6.4, 0, 'paint'],
    [-W / 2 - 5.6, -0.6, 1, 'paint'],
    [2.2, -L / 2 - 1.8, 0, 'paint'],
  ]) {
    const c = at(bx, 0, bz),
      y = gAt(b, c.x, c.z),
      a = R() * 6.283,
      d = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14);
    P[k].push(
      lying
        ? d
            .rotateZ(Math.PI / 2)
            .rotateY(a)
            .translate(c.x, y + 0.2, c.z)
        : d.rotateX((R() - 0.5) * 0.3).translate(c.x, y + 0.3, c.z),
    );
    collideRun(b, c.x, c.z, c.x, c.z, lying ? 0.4 : 0.3, () => y + (lying ? 0.45 : 0.72));
  }
  if (wl > gB)
    for (const [bx, bz, l, a] of [
      [1.4, -L / 2 - 3.6, 2.2, 0.4],
      [-3.4, -L / 2 - 1.2, 1.6, 1.9],
      [W / 2 + 2.8, -11.0, 1.8, 2.6],
      [-W / 2 - 1.6, -8.0, 2.4, 0.9],
    ]) {
      const c = at(bx, 0, bz);
      box(P, 'planks', 0.22, 0.05, l, c.x, Math.max(wl, gAt(b, c.x, c.z) + 0.03), c.z, a);
    }
  {
    const c = at(W / 2 + 2.4, 0, -L / 2 + 4.6);
    cache(b, g, c.x, c.z, null, { k: 2 });
  }
  {
    const p0 = at(-(W / 2 - 0.6), 0.56, L / 2 - 0.6),
      e = at(-W / 2 - 0.05, 0.36, L / 2 - 0.4),
      sx = e.x - 4.2,
      sz = e.z + 3.4,
      sy = gAt(b, sx, sz);
    chain(P, 'iron', p0, e, 0);
    chain(P, 'iron', e, new THREE.Vector3(sx, sy + 1.05, sz), 0.6);
    box(TL, 'rust', 0.3, 2.0, 0.3, sx, sy + 0.2, sz, 0.3, 0.12, 0.08);
    collideRun(b, sx, sz, sx, sz, 0.2);
  }
  bake(b, [
    [T, M],
    [TL, null],
  ]);
  share(TP, M, P);
  share(TR, M, b.PR);
}

// for the other parts of the split (src/buildings.js, src/interiors.js, src/places/)
export { bag, rod, lantern, bake, buildBarge };
