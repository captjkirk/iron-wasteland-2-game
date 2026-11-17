// The frozen outpost (slice 23 polish, #52): everything of the polar research station but its room (outpostRoom in
// src/interiors.js). It stands in a house (src/plan.js's furnish: 'outpost'), so buildings.js's furnish() calls it.
// Moved here unchanged from src/buildings.js (the code cleanup, November 16, 2026); buildings.js still exports all of it.
import * as THREE from 'three';
import { R } from '../plan.js';
import { box, gAt, collideRun, floor, cache, bar } from '../buildings.js';
import { placeMats, slot, flush, signAt } from './shared.js';
import { outpostRoom } from '../interiors.js';

// a snow drift: a flattened dome, r across, sunk a little (into a slot's drift)
const drift = (b, Q, x, z, r, sx = 1.6, sy = 0.45, ry = 0) =>
  Q.drift.push(
    new THREE.SphereGeometry(r, 18, 6, 0, 6.283, 0, 1.3)
      .scale(sx, sy, 1)
      .rotateY(ry)
      .translate(x, gAt(b, x, z) - 0.15, z),
  );
// (slice 23 polish) the frozen outpost: a small polar research station. The main hut (8 x 6 m, red insulated walls, snow on the
// roof with a cornice and icicles at the eaves) holds a cast-iron stove whose fire shows through the front-right window (src/plan.js
// puts place.heater at the same spot: x = w/2 - 1.6, z = d/2 - 1.4), bunks, a table, a bench of instruments under the right
// window, parkas by the door and the locked stores (the guarded crate). Outside: an antenna mast with a Yagi and an HF wire to the
// gable, a weather mast (cup anemometer, vane, a louvred screen), solar panels, a fuel tank and drums, a sled, aluminium cases,
// a snow fence half buried, a radome on its base, marker flags out from the door, and drifts against everything
function outpost(b, P, g, w, d) {
  const Q = slot(),
    M = placeMats(),
    hw = w / 2 - 0.45,
    hd = d / 2 - 0.45,
    t = b.t || 0.45,
    W = w / 2,
    D0 = d / 2,
    F = (x, z) => gAt(b, x, z);
  floor(b, P, 'planks', w - 0.45, d - 0.45, 0, 0, 0.07); // (a timber floor over the paving)
  // the stove's spot (src/plan.js puts place.heater there) and the roof's line, for the flue and the snow
  const hx = W - 1.6,
    hz = D0 - 1.4,
    yh = F(hx, hz),
    rh = Math.min(2, d * 0.32),
    Dd = d / 2 + t / 2,
    top = b.y + b.h,
    roofAt = (z) => top + rh * (1 - Math.abs(z) / Dd);
  // the room: outpostRoom (with the interiors, below). The three stools that stood here drew from the world's stream: it draws as it did
  R();
  R();
  R();
  outpostRoom(b, P, w, d);
  cache(b, g, -hw + 0.8, -hd + 1.0, b.place, { k: 3 });
  // the windows: front-left and left lit, frames and sills on all (the front-right one open on the stove)
  Q.lit.push(
    new THREE.PlaneGeometry(0.9, 0.95).rotateY(Math.PI).translate(-w * 0.3, b.y + 1.425, -D0 - 0.06),
    new THREE.PlaneGeometry(0.9, 0.95).rotateY(-Math.PI / 2).translate(-W - 0.06, b.y + 1.425, 0),
  );
  for (const [x, z, ry] of [
    [-w * 0.3, -D0, 0],
    [w * 0.3, -D0, 0],
    [0, D0, 0],
    [-W, 0, 1.57],
    [W, -d * 0.15, 1.57],
  ]) {
    const o = t / 2 + 0.03,
      nx = ry ? Math.sign(x) : 0,
      nz = ry ? 0 : Math.sign(z);
    box(P, 'beam', 1.1, 0.07, 0.16, x + nx * o, b.y + 0.9, z + nz * o, ry);
    box(P, 'beam', 1.05, 0.1, 0.08, x + nx * o, b.y + 1.95, z + nz * o, ry);
    box(P, 'beam', 0.05, 0.95, 0.05, x + nx * (o - 0.02), b.y + 1.425, z + nz * (o - 0.02), ry);
    box(P, 'beam', 0.9, 0.05, 0.05, x + nx * (o - 0.02), b.y + 1.425, z + nz * (o - 0.02), ry);
    P.snow.push(new THREE.BoxGeometry(1.0, 0.07, 0.14).rotateY(ry).translate(x + nx * o, b.y + 0.96, z + nz * o));
  }
  // the station's sign by the door, a lamp over it, a shovel leaning on the wall
  signAt(b, M.station, 1.4, b.y + 1.55, -D0 - t / 2 - 0.02, Math.PI, 0.72, 0.54);
  box(P, 'iron', 0.22, 0.1, 0.2, 0, b.y + 2.45, -D0 - t / 2 - 0.1);
  P.glow.push(new THREE.BoxGeometry(0.16, 0.05, 0.14).translate(0, b.y + 2.38, -D0 - t / 2 - 0.1));
  bar(P, 'beam', -1.05, F(-1.05, -D0 - 0.6) + 0.05, -D0 - 0.62, -1.15, b.y + 1.25, -D0 - t / 2 - 0.04, 0.04);
  box(P, 'iron', 0.26, 0.34, 0.03, -1.05, F(-1.05, -D0 - 0.6) + 0.15, -D0 - 0.62, 0, 0.15);
  // snow on the roof, a cornice along each eave, icicles under it
  {
    const half = Dd + 0.45,
      sl = Math.atan2(rh, Dd),
      len = half / Math.cos(sl),
      yE = top - (0.45 * rh) / Dd;
    for (const s of [-1, 1]) {
      box(b.PR, 'snow', w + t + 0.8, 0.22, len * 0.97, 0, (yE + top + rh) / 2 + 0.22, (s * half) / 2, 0, s * sl);
      b.PR.snow.push(
        new THREE.CylinderGeometry(0.17, 0.17, w + t + 0.85, 8)
          .rotateZ(Math.PI / 2)
          .translate(0, yE + 0.16, s * (half - 0.02)),
      );
      for (let x = -W - 0.4; x < W + 0.4; x += 0.22) {
        if (R() < 0.3) continue;
        const L = 0.12 + R() * R() * 0.6;
        Q.ice.push(
          new THREE.ConeGeometry(0.035 + L * 0.06, L, 5)
            .rotateX(Math.PI)
            .translate(x + R() * 0.1, yE - 0.02 - L / 2, s * (half - 0.08)),
        );
      }
    }
  }
  // the antenna mast at the right: a Yagi on top, two whips on an arm, a bracket to the wall, guys, an HF wire to the gable
  {
    const ax = W + 1.3,
      az = -1.8,
      ay = F(ax, az),
      top9 = ay + 9;
    P.iron.push(new THREE.CylinderGeometry(0.05, 0.07, 9.4, 8).translate(ax, ay + 4.5, az));
    bar(P, 'iron', ax, ay + 2.6, az, W + t / 2, b.y + 2.6, az, 0.05);
    bar(P, 'iron', ax - 1.1, top9 - 0.2, az, ax + 1.1, top9 - 0.2, az, 0.05);
    for (let k = 0; k < 6; k++) {
      const x = ax - 1.0 + k * 0.4,
        L = 1.05 - k * 0.06;
      bar(P, 'iron', x, top9 - 0.2, az - L / 2, x, top9 - 0.2, az + L / 2, 0.02);
    }
    bar(P, 'iron', ax, top9 - 1.6, az - 0.7, ax, top9 - 1.6, az + 0.7, 0.04);
    for (const s of [-1, 1]) bar(P, 'iron', ax, top9 - 1.6, az + s * 0.7, ax, top9 + 0.2, az + s * 0.7, 0.02);
    for (const a of [-0.5, 0.9, -2.0]) {
      const gx = ax + Math.cos(a) * 2.6,
        gz = az + Math.sin(a) * 2.6;
      bar(Q, 'cable', ax, ay + 6.5, az, gx, F(gx, gz) + 0.05, gz, 0.015);
      box(P, 'iron', 0.12, 0.3, 0.12, gx, F(gx, gz) + 0.05, gz);
    }
    bar(Q, 'cable', ax, top9 - 0.6, az, W + 0.35, roofAt(0) + 0.1, 0, 0.012);
    collideRun(b, ax, az, ax, az, 0.15, () => top9);
  }
  // the weather mast behind it: cup anemometer and vane on a cross-arm, a logger box and a small panel; a louvred screen beside
  {
    const mx = W + 3,
      mz = D0 + 1.5,
      my = F(mx, mz),
      T = my + 7;
    P.iron.push(new THREE.CylinderGeometry(0.045, 0.06, 7.2, 8).translate(mx, my + 3.5, mz));
    bar(P, 'iron', mx - 0.75, T - 0.4, mz, mx + 0.75, T - 0.4, mz, 0.04);
    bar(P, 'iron', mx, T - 0.2, mz, mx, T + 0.6, mz, 0.015);
    const ax = mx + 0.7,
      ay = T - 0.1;
    P.iron.push(new THREE.CylinderGeometry(0.035, 0.035, 0.35, 8).translate(ax, ay - 0.15, mz));
    for (let k = 0; k < 3; k++) {
      const a = k * 2.094 + 0.3,
        ex = ax + Math.cos(a) * 0.22,
        ez = mz + Math.sin(a) * 0.22;
      bar(P, 'iron', ax, ay, mz, ex, ay, ez, 0.012);
      Q.white.push(
        new THREE.SphereGeometry(0.055, 8, 4, 0, 6.283, 0, Math.PI / 2)
          .rotateX(Math.PI / 2)
          .rotateY(-a)
          .translate(ex, ay, ez),
      );
    }
    const vx = mx - 0.7;
    P.iron.push(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6).translate(vx, T - 0.25, mz));
    bar(P, 'iron', vx - 0.35, T - 0.1, mz + 0.1, vx + 0.25, T - 0.1, mz - 0.07, 0.018);
    box(Q, 'white', 0.02, 0.16, 0.24, vx - 0.33, T - 0.08, mz + 0.1, 1.85);
    P.iron.push(
      new THREE.ConeGeometry(0.035, 0.1, 6)
        .rotateZ(-Math.PI / 2)
        .rotateY(0.28)
        .translate(vx + 0.27, T - 0.1, mz - 0.075),
    );
    box(Q, 'cab', 0.32, 0.42, 0.16, mx, my + 1.4, mz - 0.13);
    bar(Q, 'cable', mx, my + 1.6, mz - 0.06, mx, T - 0.45, mz - 0.06, 0.015);
    box(Q, 'solar', 0.42, 0.03, 0.55, mx, my + 3.1, mz - 0.35, 0, -1.0);
    for (const a of [0.2, 2.3, 4.4]) {
      const gx = mx + Math.cos(a) * 2.5,
        gz = mz + Math.sin(a) * 2.5;
      bar(Q, 'cable', mx, my + 5.5, mz, gx, F(gx, gz) + 0.05, gz, 0.012);
      box(P, 'iron', 0.1, 0.25, 0.1, gx, F(gx, gz) + 0.05, gz);
    }
    collideRun(b, mx, mz, mx, mz, 0.12, () => T);
    const sx = W + 4.6,
      sz = D0 + 3.4,
      sy = F(sx, sz);
    for (const [a, c] of [
      [-0.25, -0.2],
      [0.25, -0.2],
      [-0.25, 0.2],
      [0.25, 0.2],
    ])
      box(Q, 'white', 0.05, 1.2, 0.05, sx + a, sy + 0.6, sz + c);
    box(Q, 'white', 0.62, 0.5, 0.5, sx, sy + 1.45, sz);
    box(Q, 'white', 0.74, 0.05, 0.62, sx, sy + 1.73, sz, 0, 0.12);
    for (let k = 0; k < 5; k++) box(P, 'iron', 0.6, 0.015, 0.02, sx, sy + 1.25 + k * 0.09, sz - 0.26);
    collideRun(b, sx, sz, sx, sz, 0.4, () => sy + 1.8);
  }
  // solar panels in a row at the front right, steep for the low sun, on frames; a battery box behind
  {
    const pz = -D0 - 2.4,
      tilt = 1.05;
    for (let k = 0; k < 3; k++) {
      const px = W + 0.75 + k * 1.08,
        py = F(px, pz);
      box(Q, 'solar', 1.0, 0.04, 1.65, px, py + 0.55 + 0.82 * Math.sin(tilt), pz, 0, -tilt);
      for (const s of [-0.45, 0.45]) {
        bar(
          P,
          'iron',
          px + s,
          py - 0.1,
          pz - 0.82 * Math.cos(tilt),
          px + s,
          py + 0.55,
          pz - 0.82 * Math.cos(tilt),
          0.05,
        );
        bar(
          P,
          'iron',
          px + s,
          py - 0.1,
          pz + 0.82 * Math.cos(tilt),
          px + s,
          py + 0.55 + 1.64 * Math.sin(tilt),
          pz + 0.82 * Math.cos(tilt),
          0.05,
        );
      }
    }
    box(Q, 'cab', 0.9, 0.7, 0.5, W + 1.83, F(W + 1.83, pz + 1.3) + 0.35, pz + 1.3);
    bar(Q, 'cable', W + 1.83, F(W + 1.83, pz + 1.3) + 0.6, pz + 1.05, W + t / 2, b.y + 0.6, -D0 + 0.4, 0.03);
    collideRun(b, W + 0.4, pz, W + 3.6, pz, 0.45, () => F(W + 2, pz) + 2);
    drift(b, Q, W + 1.9, pz - 0.6, 0.6, 2.6, 0.7);
  }
  // the fuel tank on its saddles at the left, a line to the wall, drums behind it
  {
    const fx = -W - 2.2,
      fz = -1.0,
      fy = F(fx, fz);
    for (const s of [-0.85, 0.85]) box(P, 'concrete', 1.1, 0.5, 0.25, fx, fy + 0.15, fz + s);
    P.hull.push(new THREE.CylinderGeometry(0.62, 0.62, 2.6, 18).rotateX(Math.PI / 2).translate(fx, fy + 1.0, fz));
    for (const s of [-1, 1])
      P.iron.push(
        new THREE.CylinderGeometry(0.64, 0.64, 0.06, 18).rotateX(Math.PI / 2).translate(fx, fy + 1.0, fz + s * 1.0),
      );
    P.iron.push(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 10).translate(fx, fy + 1.7, fz - 0.6));
    box(P, 'snow', 0.7, 0.12, 2.4, fx, fy + 1.64, fz);
    bar(P, 'iron', fx + 0.6, fy + 0.6, fz + 0.5, -W - t / 2, b.y + 0.45, fz + 0.5, 0.04);
    collideRun(b, fx, fz - 1.2, fx, fz + 1.2, 0.68, () => fy + 1.7);
    for (const [x, z, k] of [
      [-W - 1.9, 1.15, 'drumR'],
      [-W - 2.55, 1.35, 'drumB'],
      [-W - 2.2, 1.9, 'drumY'],
    ])
      Q[k].push(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14).translate(x, F(x, z) + 0.44, z));
    Q.drumR.push(
      new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14)
        .rotateZ(Math.PI / 2)
        .rotateY(0.3)
        .translate(-W - 1.4, F(-W - 1.4, 2.5) + 0.29, 2.5),
    );
    collideRun(b, -W - 2.6, 1.3, -W - 1.5, 1.9, 0.45, () => fy + 0.9);
    drift(b, Q, fx - 0.7, fz + 0.3, 0.9, 1.4, 0.75, 1.5);
  }
  // the sled at the front left: runners turned up at the front, slats, stanchions, a tarp-lashed load
  {
    const sx = -2.9,
      sz = -D0 - 3.4,
      ry = 0.35,
      sy = F(sx, sz),
      S = { beam: [], planks: [], cloth: [], hull: [] };
    for (const v of [-0.36, 0.36]) {
      S.beam.push(
        new THREE.BoxGeometry(2.3, 0.06, 0.06).translate(-0.1, 0.05, v),
        new THREE.BoxGeometry(0.42, 0.06, 0.06).rotateZ(0.8).translate(1.18, 0.2, v),
      );
      for (let k = 0; k < 4; k++)
        S.beam.push(new THREE.BoxGeometry(0.04, 0.26, 0.04).translate(-0.95 + k * 0.6, 0.2, v));
      S.beam.push(new THREE.BoxGeometry(2.1, 0.05, 0.05).translate(-0.1, 0.55, v));
    }
    for (let k = 0; k < 9; k++)
      S.planks.push(new THREE.BoxGeometry(0.1, 0.03, 0.8).translate(-1.05 + k * 0.24, 0.34, 0));
    S.hull.push(new THREE.BoxGeometry(0.75, 0.42, 0.55).translate(-0.55, 0.57, 0));
    S.cloth.push(new THREE.BoxGeometry(1.1, 0.38, 0.68).translate(0.45, 0.55, 0));
    for (const k in S) for (const geo of S[k]) P[k].push(geo.rotateY(ry).translate(sx, sy, sz));
    bar(Q, 'cable', sx + 0.6, sy + 0.75, sz - 0.35, sx + 0.3, sy + 0.75, sz + 0.4, 0.015);
    collideRun(
      b,
      sx - Math.cos(ry) * 1.1,
      sz + Math.sin(ry) * 1.1,
      sx + Math.cos(ry) * 1.2,
      sz - Math.sin(ry) * 1.2,
      0.45,
      () => sy + 0.8,
    );
  }
  // aluminium cases stacked by the door's right, snow on them
  {
    const cx = 2.6,
      cz = -D0 - 1.6,
      cy = F(cx, cz);
    box(P, 'hull', 0.85, 0.45, 0.58, cx, cy + 0.23, cz, 0.1);
    box(P, 'hull', 0.85, 0.45, 0.58, cx + 0.95, cy + 0.23, cz + 0.1, -0.08);
    box(P, 'hull', 0.7, 0.38, 0.5, cx + 0.4, cy + 0.65, cz + 0.05, 0.3);
    box(P, 'snow', 0.62, 0.05, 0.44, cx + 0.4, cy + 0.86, cz + 0.05, 0.3);
    collideRun(b, cx - 0.2, cz, cx + 1.2, cz + 0.1, 0.45, () => cy + 0.85);
  }
  // the radome on its base at the back left: geodesic panels on a ring, a door, a cable to the hut
  {
    const rx = -W - 2.8,
      rz = D0 + 2.0,
      ry = F(rx, rz);
    box(P, 'paint', 2.6, 2.4, 2.6, rx, ry + 0.4, rz);
    box(P, 'iron', 2.75, 0.12, 2.75, rx, ry + 1.66, rz);
    box(P, 'iron', 0.9, 1.85, 0.06, rx + 1.31, ry + 0.95, rz, Math.PI / 2);
    P.iron.push(new THREE.CylinderGeometry(1.35, 1.35, 0.14, 18).translate(rx, ry + 1.78, rz));
    Q.dome.push(new THREE.IcosahedronGeometry(1.75, 2).translate(rx, ry + 2.85, rz));
    P.iron.push(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6).translate(rx, ry + 4.95, rz));
    Q.red.push(new THREE.SphereGeometry(0.07, 8, 6).translate(rx, ry + 5.38, rz));
    bar(Q, 'cable', rx + 1.3, ry + 0.2, rz - 0.6, -W - t / 2, b.y + 0.3, D0 - 0.6, 0.035);
    collideRun(b, rx, rz - 0.4, rx, rz + 0.4, 1.35, () => ry + 4.6);
    drift(b, Q, rx - 0.6, rz + 1.5, 1.0, 1.8, 0.7, 0.4);
  }
  // the snow fence behind: slatted bays on posts, a gap in the middle, half buried on its lee side
  {
    const fz = D0 + 5.0;
    for (const [x0, x1] of [
      [-5.5, -0.6],
      [0.9, 5.0],
    ]) {
      const n = Math.ceil((x1 - x0) / 2);
      for (let k = 0; k <= n; k++) {
        const x = x0 + ((x1 - x0) * k) / n;
        box(P, 'beam', 0.1, 1.9, 0.1, x, F(x, fz) + 0.5, fz);
      }
      for (const h of [0.35, 1.05]) bar(P, 'beam', x0, F(x0, fz) + h, fz - 0.06, x1, F(x1, fz) + h, fz - 0.06, 0.06);
      for (let x = x0 + 0.1; x < x1 - 0.05; x += 0.21) {
        if (R() < 0.06) continue;
        box(P, 'planks', 0.1, 1.15 + R() * 0.1, 0.025, x, F(x, fz) + 0.62, fz - 0.1, 0, 0, (R() - 0.5) * 0.06);
      }
      collideRun(b, x0, fz, x1, fz, 0.12, () => F((x0 + x1) / 2, fz) + 1.3);
      drift(b, Q, (x0 + x1) / 2, fz - 1.0, (x1 - x0) * 0.3, 1.6, 0.32);
    }
  }
  // marker flags out from the door, and drifts against the hut and round the place
  for (const [x, z] of [
    [-1.5, -D0 - 2.6],
    [-1.7, -D0 - 5.6],
    [-2.0, -D0 - 8.6],
  ]) {
    const y = F(x, z);
    bar(P, 'beam', x, y - 0.2, z, x + 0.05, y + 1.9, z, 0.03);
    Q.orange.push(new THREE.PlaneGeometry(0.34, 0.26).translate(x + 0.2, y + 1.74, z));
  }
  {
    const o = t / 2,
      e = (r) => o + r * 0.8; /* (each drift's near edge stays outside the wall it leans on) */
    for (const [x, z, r, sx, sy, ry] of [
      [-W - e(1.0), 1.7, 1.0, 1.8, 0.8, 1.57],
      [W + e(0.9), 1.3, 0.9, 1.6, 0.75, 1.57],
      [0.3, D0 + e(1.0), 1.0, 2.2, 0.7, 0],
      [-W - 1.3, D0 + 1.1, 0.9, 1.6, 0.8, 0.8],
      [W + 1.3, D0 + 1.1, 0.9, 1.6, 0.75, -0.8],
      [W - 0.7, -D0 - e(0.7), 0.7, 1.6, 0.7, 0],
      [-W + 0.6, -D0 - e(0.7), 0.7, 1.7, 0.7, 0.2],
    ])
      drift(b, Q, x, z, r, sx, sy, ry);
  }
  flush(b, Q);
}

// for the other parts of the split (src/buildings.js, src/interiors.js, src/places/)
export { outpost };
