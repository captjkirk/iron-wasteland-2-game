// The radio tower (slice 23, #52): its mast, wires and flag (buildRadio) and the outside of the radio shack beside it
// (radioShack; the room inside is radioRoom in src/interiors.js). src/places.js is what happens there. Moved here unchanged
// from src/buildings.js (the code cleanup, November 16, 2026); buildings.js still exports all of it.
import * as THREE from 'three';
import { toW } from '../plan.js';
import { canvasTex } from '../propmodels.js';
import { windShader } from '../wind.js';
import { box, gAt, collideRun, surface, ladders, floor, UP, bar } from '../buildings.js';
import { placeMats, slot, flush, signAt } from './shared.js';

// a quad from (x0, y0, z0) to (x1, y1, z1) along its bottom, h tall (a fence bay, a gate leaf)
function quad(x0, y0, z0, x1, y1, z1, h) {
  const q = new THREE.PlaneGeometry(1, 1),
    p = q.attributes.position;
  p.setXYZ(0, x0, y0 + h, z0);
  p.setXYZ(1, x1, y1 + h, z1);
  p.setXYZ(2, x0, y0, z0);
  p.setXYZ(3, x1, y1, z1);
  q.computeVertexNormals();
  return q;
}

// the radio tower (IW1's): a 30 m lattice mast on a concrete pad, guyed three ways, a caged ladder up its front to a railed
// grating platform at 18 m (the view: you can see most of the world from it), sector antennas at 27 m, microwave dishes at
// 20 to 24 m, its feeder cables down a leg and along a cable bridge into the shack, and a red lamp on its whip that blinks
// (src/places.js), seen for kilometres. Round it a real site: a chain-link compound with barbed wire (its gate swung open, a bay
// fallen on the far side), warning signs, equipment cabinets on a slab, a generator and its drums. The shack is its own house
// record (furnish 'radio'), its door toward the mast
// ticket 91: cloth on the wind. A flag hung from (x, y, z) in its building's frame; the graphics card lays it out downwind from
// the pole each frame (L long, H deep), sagging toward the pole as the wind drops, waves running along it faster in a gust
let FLAG = null;
function windFlag(x, y, z, L = 1.3, H = 0.8) {
  FLAG ||= canvasTex(
    128,
    80,
    (c, w, h) => {
      c.fillStyle = '#b8462e';
      c.beginPath();
      c.moveTo(0, 0); // (faded red, the fly end torn ragged, a few holes)
      for (let k = 0; k <= 8; k++) c.lineTo(w * (0.78 + 0.2 * Math.abs(Math.sin(k * 2.7))), (h * k) / 8);
      c.lineTo(0, h);
      c.fill();
      c.fillStyle = '#d8c8a8';
      c.fillRect(0, h * 0.38, w * 0.8, h * 0.24);
      c.globalCompositeOperation = 'destination-out';
      for (const [hx, hy, r] of [
        [0.55, 0.2, 4],
        [0.68, 0.7, 5],
        [0.4, 0.82, 3],
      ]) {
        c.beginPath();
        c.arc(w * hx, h * hy, r, 0, 6.283);
        c.fill();
      }
    },
    '#b8462e',
  );
  const m = new THREE.MeshStandardMaterial({ map: FLAG, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 }),
    pole = { value: new THREE.Vector3(x, y, z) };
  m.onBeforeCompile = (sh) => {
    const head = windShader(sh);
    sh.uniforms.uPole = pole;
    sh.vertexShader =
      head +
      'uniform vec3 uPole;\n' +
      sh.vertexShader
        .replace(
          '#include <beginnormal_vertex>',
          'vec3 objectNormal = transpose(mat3(modelMatrix)) * vec3(-uWindDir.y, 0.0, uWindDir.x);',
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed; { vec3 pw = (modelMatrix * vec4(uPole, 1.0)).xyz; float w = iwWind(pw.xz), u = uv.x, limp = 1.0 - smoothstep(0.02, 0.45, w);
        float wave = sin(u * 7.0 - uWindT * (4.0 + 9.0 * w)) * (0.05 + 0.14 * w) * u;
        vec3 wp = pw + vec3(uWindDir.x, 0.0, uWindDir.y) * u * ${L.toFixed(2)} * (1.0 - 0.75 * limp) + vec3(0.0, (uv.y - 1.0) * ${H.toFixed(2)} - u * ${L.toFixed(2)} * 0.7 * limp, 0.0) + vec3(-uWindDir.y, 0.0, uWindDir.x) * wave;
        transformed = transpose(mat3(modelMatrix)) * (wp - modelMatrix[3].xyz); }`,
        );
  };
  m.customProgramCacheKey = () => 'iw-flag';
  const f = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 14, 4), m);
  f.frustumCulled = false;
  f.name = 'flag';
  return f;
}
function buildRadio(b, P, g) {
  const H = 30,
    w0 = 1.8,
    w1 = 0.32,
    hw = (y) => w0 + ((w1 - w0) * y) / H,
    C = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ],
    PY = 18,
    M = placeMats(),
    Q = slot();
  // the footing: a pad (a step up, stood on) with a plinth and base plate under each leg
  const pad = Math.max(b.y, ...[-2.4, 2.4].flatMap((x) => [-2.4, 2.4].map((z) => gAt(b, x, z)))) + 0.14;
  box(P, 'concrete', 4.8, pad - b.y + 0.9, 4.8, 0, (pad + b.y - 0.9) / 2, 0);
  surface(b, (lx, lz) => (Math.abs(lx) <= 2.4 && Math.abs(lz) <= 2.4 ? pad : null));
  for (const [sx, sz] of C) {
    for (let s = 0; s < 10; s++) {
      const f0 = s / 10,
        f1 = (s + 1) / 10,
        yy = (f) => b.y - 0.4 + (H + 0.4) * f,
        xx = (f) => sx * (w0 + (w1 - w0) * f),
        zz = (f) => sz * (w0 + (w1 - w0) * f);
      bar(P, s % 2 ? 'snow' : 'paint', xx(f0), yy(f0), zz(f0), xx(f1), yy(f1), zz(f1), 0.24);
    }
    box(P, 'concrete', 0.9, 0.5, 0.9, sx * w0, pad + 0.2, sz * w0);
    box(P, 'iron', 0.62, 0.05, 0.62, sx * w0, pad + 0.47, sz * w0);
    collideRun(b, sx * w0, sz * w0, sx * w0, sz * w0, 0.5, () => b.y + H);
  }
  for (let y = 1, i = 0; y < H - 1; y += 3, i++) {
    const a = hw(y),
      c = hw(Math.min(H, y + 3)),
      ya = b.y + y,
      yb = b.y + Math.min(H, y + 3);
    for (let q = 0; q < 4; q++) {
      const [ax, az] = C[q],
        [bx, bz] = C[(q + 1) % 4];
      bar(P, 'iron', ax * a, ya, az * a, bx * a, ya, bz * a, 0.09);
      if (i % 2) bar(P, 'iron', ax * a, ya, az * a, bx * c, yb, bz * c, 0.07);
      else bar(P, 'iron', bx * a, ya, bz * a, ax * c, yb, az * c, 0.07);
    }
  }
  // the platform: a steel frame and joists under open grating (a hatch where the ladder comes up), a rail, mid-rail and toe board
  const pw = 1.45,
    py = b.y + PY;
  surface(b, (lx, lz) => (Math.abs(lx) <= pw && Math.abs(lz) <= pw ? py + 0.05 : null));
  for (const s of [-1, 1]) {
    box(P, 'iron', pw * 2 + 0.1, 0.16, 0.08, 0, py - 0.04, s * pw);
    box(P, 'iron', 0.08, 0.16, pw * 2, s * pw, py - 0.04, 0);
    box(P, 'iron', 0.06, 0.12, pw * 2, s * 0.55, py - 0.05, 0);
  }
  for (const [x0, x1, z0, z1] of [
    [-pw, pw, -0.95, pw],
    [-pw, -0.42, -pw, -0.95],
    [0.42, pw, -pw, -0.95],
  ])
    Q.grate.push(
      new THREE.PlaneGeometry(x1 - x0, z1 - z0)
        .rotateX(-Math.PI / 2)
        .translate((x0 + x1) / 2, py + 0.04, (z0 + z1) / 2),
    );
  for (const [x0, z0, x1, z1] of [
    [-pw, pw, pw, pw],
    [-pw, -pw, -pw, pw],
    [pw, -pw, pw, pw],
    [-pw, -pw, -0.45, -pw],
    [0.45, -pw, pw, -pw],
  ]) {
    for (const h of [1.05, 0.55]) bar(P, 'iron', x0, py + h, z0, x1, py + h, z1, 0.05);
    box(P, 'iron', Math.abs(x1 - x0) || 0.02, 0.1, Math.abs(z1 - z0) || 0.02, (x0 + x1) / 2, py + 0.1, (z0 + z1) / 2);
    for (const [x, z] of [
      [x0, z0],
      [x1, z1],
    ])
      bar(P, 'iron', x, py, z, x, py + 1.05, z, 0.06);
    collideRun(b, x0, z0, x1, z1, 0.12, () => py + 1.1);
  }
  // ticket 91: a tattered flag on a pole at the platform's corner, flown by the world wind (wind.js): limp in a calm, out and flapping in a gust
  bar(P, 'iron', pw, py + 1.05, pw, pw, py + 3.7, pw, 0.035);
  b.group.add(windFlag(pw, py + 3.65, pw));
  // the ladder up the front face (it leans in with the mast), caged from 2.4 m: hoops round the climber and five straps up them
  const lz = (y) => -(hw(y) + 0.32),
    cz = (y) => lz(y) - 0.36;
  for (const sx of [-0.26, 0.26]) bar(P, 'iron', sx, b.y, lz(0), sx, b.y + PY + 1, lz(PY + 1), 0.05);
  for (let y = 0.35; y < PY; y += 0.35) box(P, 'iron', 0.52, 0.04, 0.04, 0, b.y + y, lz(y));
  ladders.push({ b, y0: b.y, y1: b.y + PY + 0.05, off: toW(b, 0, -0.6), at: (y) => toW(b, 0, lz(y - b.y) - 0.12) });
  const hoop = new THREE.TorusGeometry(0.42, 0.022, 4, 12, Math.PI).rotateX(-Math.PI / 2);
  for (let y = 2.4; y <= PY + 1.05; y += 0.8) {
    P.iron.push(hoop.clone().translate(0, b.y + y, cz(y)));
    for (const s of [-1, 1]) bar(P, 'iron', s * 0.42, b.y + y, cz(y), s * 0.27, b.y + y, lz(y), 0.025);
  }
  for (let k = 0; k <= 4; k++) {
    const t = (k / 4) * Math.PI,
      x = Math.cos(t) * 0.42,
      dz = -Math.sin(t) * 0.42;
    bar(P, 'iron', x, b.y + 2.4, cz(2.4) + dz, x, b.y + PY + 1, cz(PY + 1) + dz, 0.03);
  }
  // microwave dishes: a shrouded dish with a flat radome, a back housing, clamped to a pipe on the mast by two struts
  const dish = (dx, dz, y, r) => {
    const d = new THREE.Vector3(dx, 0, dz),
      q = new THREE.Quaternion().setFromUnitVectors(UP, d),
      o = hw(y) + 0.3 + r * 0.3,
      at = (geo, k) => Q[k].push(geo.applyQuaternion(q).translate(d.x * o, b.y + y, d.z * o));
    at(new THREE.CylinderGeometry(r, r, 0.42, 22, 1, true), 'white');
    at(new THREE.CircleGeometry(r, 22).rotateX(-Math.PI / 2).translate(0, 0.2, 0), 'white');
    at(
      new THREE.SphereGeometry(r, 18, 4, 0, 6.283, 0, 1.0)
        .rotateX(Math.PI)
        .scale(1, 0.45, 1)
        .translate(0, -0.21 + Math.cos(1) * r * 0.45, 0),
      'white',
    );
    const m = hw(y) + 0.1;
    bar(P, 'iron', d.x * m, b.y + y - r - 0.3, d.z * m, d.x * m, b.y + y + r + 0.3, d.z * m, 0.07);
    for (const s of [-1, 1])
      bar(
        P,
        'iron',
        d.x * m,
        b.y + y + s * r * 0.5,
        d.z * m,
        d.x * (o - 0.3),
        b.y + y + s * r * 0.4,
        d.z * (o - 0.3),
        0.04,
      );
  };
  dish(1, 0, 22, 0.62);
  dish(-1, 0, 20.5, 0.9);
  dish(0, 1, 24, 0.45);
  // sector antennas: three pairs of panels on arms round the top, each on its mount pipe
  for (const a of [0.35, 2.45, 4.55]) {
    const ca = Math.cos(a),
      sa = Math.sin(a),
      r0 = hw(26.6),
      r1 = 1.2,
      ry = Math.atan2(ca, sa);
    for (const y of [25.9, 27.3]) {
      bar(P, 'iron', ca * r0, b.y + y, sa * r0, ca * r1, b.y + y, sa * r1, 0.06);
      bar(
        P,
        'iron',
        ca * r1 + sa * 0.4,
        b.y + y,
        sa * r1 - ca * 0.4,
        ca * r1 - sa * 0.4,
        b.y + y,
        sa * r1 + ca * 0.4,
        0.05,
      );
    }
    for (const s of [-0.28, 0.28]) {
      const x = ca * (r1 + 0.12) - sa * s,
        z = sa * (r1 + 0.12) + ca * s;
      bar(
        P,
        'iron',
        ca * r1 - sa * s,
        b.y + 25.6,
        sa * r1 + ca * s,
        ca * r1 - sa * s,
        b.y + 27.7,
        sa * r1 + ca * s,
        0.05,
      );
      box(Q, 'white', 0.3, 1.45, 0.13, x, b.y + 26.6, z, ry);
    }
  }
  // feeder cables down the back-right leg to 2.4 m, across to the cable bridge and along it into the shack's front wall
  const TH = b.y + 2.25,
    tx = 1.6;
  for (let i = 0; i < 4; i++) {
    const o = i * 0.055 - 0.08,
      at = (y) => hw(y) - 0.14;
    bar(Q, 'cable', at(26.4) + o, b.y + 26.4, at(26.4), at(2.4) + o, b.y + 2.4, at(2.4), 0.04);
    bar(Q, 'cable', at(2.4) + o, b.y + 2.4, at(2.4), tx + o, TH + 0.06, 2.0, 0.04);
    bar(Q, 'cable', tx + o, TH + 0.06, 2.0, tx + o, TH + 0.06, 5.45, 0.04);
  }
  for (const s of [-1, 1]) box(P, 'iron', 0.04, 0.1, 3.6, tx + s * 0.22, TH, 3.68);
  for (let z = 1.95; z < 5.45; z += 0.45) box(P, 'iron', 0.46, 0.03, 0.05, tx, TH - 0.04, z);
  {
    const gy = gAt(b, tx, 3.7) - 0.3;
    P.iron.push(new THREE.CylinderGeometry(0.06, 0.06, TH - gy, 8).translate(tx, (TH + gy) / 2, 3.7));
    box(P, 'iron', 0.6, 0.06, 0.06, tx, TH - 0.08, 3.7);
    box(P, 'iron', 0.6, 0.35, 0.05, tx, TH, 5.47);
    collideRun(b, tx, 3.7, tx, 3.7, 0.12, () => TH);
  }
  // obstruction lights half way up, and a housing under the beacon
  for (const [sx, sz] of [
    [-1, -1],
    [1, 1],
  ])
    Q.red.push(new THREE.SphereGeometry(0.14, 10, 6).translate(sx * (hw(15) + 0.14), b.y + 15, sz * (hw(15) + 0.14)));
  // equipment cabinets on a slab to the right of the mast, a conduit to the pad
  {
    const cx = 4.3,
      cy = Math.max(gAt(b, cx, -0.9), gAt(b, cx, 1.9), gAt(b, cx, 0.5)) + 0.12;
    box(P, 'concrete', 1.4, cy - b.y + 0.6, 3.2, cx, (cy + b.y - 0.6) / 2, 0.5);
    for (const [z, h, wd] of [
      [-0.35, 1.7, 0.85],
      [0.6, 1.7, 0.85],
      [1.45, 1.15, 0.7],
    ]) {
      box(Q, 'cab', 0.7, h, wd, cx, cy + h / 2, z);
      box(P, 'iron', 0.8, 0.05, wd + 0.08, cx, cy + h + 0.03, z);
      box(P, 'iron', 0.5, 0.1, wd - 0.1, cx, cy + 0.05, z);
    }
    bar(Q, 'cable', cx - 0.36, cy + 0.06, 0.2, 2.4, pad + 0.03, 0.2, 0.06);
    collideRun(b, cx, -0.75, cx, 1.8, 0.5, () => cy + 1.75);
  }
  // the generator on its skids (exhaust, control panel, a cable to the shack) and its fuel drums by the shack's side
  {
    const gx = -4.4,
      gz = 3.3,
      gy = gAt(b, gx, gz);
    for (const s of [-1, 1]) box(P, 'iron', 0.1, 0.12, 2.3, gx + s * 0.45, gy + 0.06, gz);
    box(P, 'iron', 1.0, 0.3, 2.1, gx, gy + 0.27, gz);
    box(Q, 'gen', 1.0, 1.0, 1.9, gx, gy + 0.92, gz);
    box(P, 'iron', 1.05, 0.05, 1.95, gx, gy + 1.44, gz);
    P.iron.push(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 8).translate(gx + 0.25, gy + 1.8, gz + 0.6));
    box(P, 'iron', 0.15, 0.03, 0.15, gx + 0.25, gy + 2.19, gz + 0.6, 0, 0.35);
    box(Q, 'cab', 0.06, 0.45, 0.55, gx - 0.53, gy + 1.05, gz - 0.45);
    bar(Q, 'cable', gx + 0.5, gy + 0.3, gz + 0.9, -2.45, b.y + 0.35, 6.4, 0.05);
    collideRun(b, gx, gz - 0.85, gx, gz + 0.85, 0.55, () => gy + 1.45);
    for (const [x, z, k] of [
      [-5.15, 6.3, 'drumR'],
      [-5.75, 6.85, 'drumB'],
      [-5.05, 7.0, 'drumR'],
      [-5.55, 7.6, 'drumY'],
    ])
      Q[k].push(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14).translate(x, gAt(b, x, z) + 0.44, z));
    Q.drumB.push(
      new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14)
        .rotateZ(Math.PI / 2)
        .rotateY(0.4)
        .translate(-4.2, gAt(b, -4.2, 8.9) + 0.29, 8.9),
    );
    collideRun(b, -5.4, 6.3, -5.4, 7.6, 0.5, () => b.y + 0.9);
    collideRun(b, -4.6, 8.75, -3.8, 9.05, 0.3, () => b.y + 0.6);
  }
  // the compound: chain-link on posts every 3 m with a top rail and three strands of barbed wire on arms leaning out; the gate's
  // two leaves stand open at the front, and a bay on the right side has fallen flat (two ways in, nothing traps a player)
  const F = [
      [-6.5, -6.5],
      [6.5, -6.5],
      [6.5, 11.5],
      [-6.5, 11.5],
    ],
    GAP = [[[4.5, 8.5]], [[9.5, 12.5]], [], []];
  const post = (x, z, ox, oz, r = 0.04, h = 2.1) => {
    const y = gAt(b, x, z);
    P.iron.push(new THREE.CylinderGeometry(r, r, h + 0.5, 6).translate(x, y + h / 2 - 0.25, z));
    bar(P, 'iron', x, y + 2.05, z, x + ox * 0.36, y + 2.45, z + oz * 0.36, 0.035);
  };
  F.forEach(([x0, z0], i) => {
    const [x1, z1] = F[(i + 1) % 4],
      L = Math.hypot(x1 - x0, z1 - z0),
      ux = (x1 - x0) / L,
      uz = (z1 - z0) / L,
      ox = uz,
      oz = -ux;
    let s = 0;
    const runs = [];
    for (const [a, c] of GAP[i]) {
      runs.push([s, a]);
      s = c;
    }
    runs.push([s, L]);
    for (const [a, c] of runs) {
      const n = Math.max(1, Math.ceil((c - a) / 3)),
        P0 = (t) => [x0 + ux * t, z0 + uz * t];
      for (let k = 0; k <= n; k++) {
        const [x, z] = P0(a + ((c - a) * k) / n);
        post(x, z, ox, oz, k === 0 || k === n ? 0.06 : 0.04);
      }
      for (let k = 0; k < n; k++) {
        const [xa, za] = P0(a + ((c - a) * k) / n),
          [xb, zb] = P0(a + ((c - a) * (k + 1)) / n),
          ya = gAt(b, xa, za),
          yb = gAt(b, xb, zb);
        Q.chain.push(quad(xa, ya + 0.06, za, xb, yb + 0.06, zb, 1.98));
        bar(P, 'iron', xa, ya + 2.05, za, xb, yb + 2.05, zb, 0.045);
        for (const f of [0.35, 0.68, 1])
          bar(
            P,
            'iron',
            xa + ox * 0.36 * f,
            ya + 2.05 + 0.4 * f,
            za + oz * 0.36 * f,
            xb + ox * 0.36 * f,
            yb + 2.05 + 0.4 * f,
            zb + oz * 0.36 * f,
            0.014,
          );
      }
      const [xa, za] = P0(a),
        [xb, zb] = P0(c);
      collideRun(b, xa, za, xb, zb, 0.12, () => b.y + 2.4);
    }
  });
  // the gate's leaves, hinged on the gate posts and swung out
  for (const [hx, ang] of [
    [-2, -1.25],
    [2, Math.PI + 0.95],
  ]) {
    const ux = Math.cos(ang),
      uz = Math.sin(ang),
      ex = hx + ux * 1.95,
      ez = -6.5 + uz * 1.95,
      ya = gAt(b, hx, -6.5) + 0.1,
      yb = gAt(b, ex, ez) + 0.1;
    Q.chain.push(quad(hx, ya, -6.5, ex, yb, ez, 1.8));
    for (const h of [0, 0.9, 1.8]) bar(P, 'iron', hx, ya + h, -6.5, ex, yb + h, ez, 0.045);
    bar(P, 'iron', ex, yb, ez, ex, yb + 1.8, ez, 0.045);
    bar(P, 'iron', hx, ya, -6.5, ex, yb + 1.8, ez, 0.03);
    collideRun(b, hx + ux * 0.3, -6.5 + uz * 0.3, ex, ez, 0.1, () => b.y + 2);
  }
  {
    const y = gAt(b, 7.6, 4.5);
    Q.chain.push(
      new THREE.PlaneGeometry(1.95, 2.9)
        .rotateX(-Math.PI / 2)
        .rotateY(0.12)
        .translate(7.7, y + 0.07, 4.5),
    );
    bar(P, 'iron', 7.0, y + 0.08, 3.1, 7.2, y + 0.1, 5.9, 0.045);
    bar(P, 'iron', 6.5, y - 0.3, 4.6, 7.5, y + 1.6, 4.9, 0.04);
  }
  // signs: danger and RF on the fence either side of the gate, RF on the mast by the ladder
  signAt(b, M.danger, -3.6, gAt(b, -3.6, -6.5) + 1.35, -6.54, Math.PI);
  signAt(b, M.rf, 3.6, gAt(b, 3.6, -6.5) + 1.35, -6.54, Math.PI);
  signAt(b, M.rf, -0.85, pad + 1.9, -hw(1.9) - 0.06, Math.PI, 0.5, 0.375);
  // the whip; three guy wires to anchors with turnbuckles
  bar(P, 'iron', 0, b.y + H, 0, 0, b.y + H + 4, 0, 0.08);
  P.iron.push(new THREE.CylinderGeometry(0.22, 0.28, 0.3, 10).translate(0, b.y + H + 3.75, 0));
  for (let k = 0; k < 3; k++) {
    const a = k * 2.094 + 0.5,
      x = Math.cos(a) * 15,
      z = Math.sin(a) * 15,
      y = gAt(b, x, z);
    bar(P, 'iron', Math.cos(a) * hw(25), b.y + 25, Math.sin(a) * hw(25), x, y + 0.5, z, 0.035);
    bar(P, 'iron', x, y + 0.45, z, x - Math.cos(a) * 0.45, y + 1.2, z - Math.sin(a) * 0.45, 0.07);
    box(P, 'concrete', 0.8, 0.5, 0.8, x, y + 0.15, z);
    collideRun(b, x, z, x, z, 0.45, () => y + 0.4);
  }
  flush(b, Q);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false }),
  );
  /* (seen through the haze from far off) */ lamp.position.set(0, b.y + H + 4.2, 0);
  b.group.add(lamp);
  if (b.place) b.place.lamp = lamp;
}

// (slice 23 polish) the radio shack's outside: the right window lit, a lamp over the door, an air-conditioner on its side (its
// room is radioRoom, with the interiors above)
function radioShack(b, P, w, d) {
  const Q = slot(),
    hw = w / 2 - 0.45,
    hd = d / 2 - 0.45,
    t = b.t || 0.45;
  floor(b, P, 'concrete', w - 0.45, d - 0.45, 0, 0, 0.07);
  Q.lit.push(new THREE.PlaneGeometry(0.9, 0.95).rotateY(Math.PI / 2).translate(w / 2 + 0.05, b.y + 1.425, -d * 0.15));
  box(P, 'beam', 0.06, 0.95, 0.06, w / 2 + t / 2 - 0.02, b.y + 1.425, -d * 0.15);
  box(P, 'beam', 0.06, 0.06, 0.9, w / 2 + t / 2 - 0.02, b.y + 1.425, -d * 0.15);
  box(P, 'beam', 0.14, 0.06, 1.05, w / 2 + t / 2 + 0.04, b.y + 0.92, -d * 0.15);
  box(P, 'iron', 0.22, 0.1, 0.2, 0, b.y + 2.45, -d / 2 - t / 2 - 0.1);
  P.glow.push(new THREE.BoxGeometry(0.16, 0.05, 0.14).translate(0, b.y + 2.38, -d / 2 - t / 2 - 0.1));
  box(Q, 'cab', 0.42, 0.62, 0.8, w / 2 + t / 2 + 0.21, b.y + 1.0, d * 0.22);
  Q.cable.push(
    new THREE.CircleGeometry(0.24, 14).rotateY(Math.PI / 2).translate(w / 2 + t / 2 + 0.43, b.y + 1.0, d * 0.22),
  );
  box(P, 'iron', 0.3, 0.04, 0.04, w / 2 + t / 2 + 0.15, b.y + 0.66, d * 0.22 - 0.3);
  flush(b, Q);
}

// for the other parts of the split (src/buildings.js, src/interiors.js, src/places/)
export { buildRadio, radioShack };
