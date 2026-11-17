// The hermit's island (slice 23, #52): his yard outside the shack (hermitYard; buildings.js's buildHouse builds the shack
// and his jetty, src/interiors.js his room). Moved here unchanged from src/buildings.js (the code cleanup, November 16,
// 2026); buildings.js still exports all of it.
import * as THREE from 'three';
import { WATER_Y } from '../config.js';
import { R } from '../plan.js';
import { addSmoke } from '../camp.js';
import { box, gAt, collideRun, lampAt, bar } from '../buildings.js';
import { bag, rod, lantern, bake } from './barge.js';

// the hermit's yard (polish): a stone chimney up his shack's gable with smoke drifting off it, a fenced vegetable patch, his nets
// drying on frames, a rain barrel under the eave's gutter, a woodpile under a lean-to with the chopping block, lanterns by his
// door and at the jetty's end, and his rowboat tied alongside the jetty (the trees round the yard are props: src/plan.js)
export function smoke(b, x, y, z) {
  R();
  /* (its old drift's draw, kept so the world's later draws do not move) */ addSmoke(b.group, x, y, z, {
    n: 12,
    rise: 5,
    size: 3,
    alpha: 0.6,
  });
} // (ticket 91: the world wind carries it, camp.js)
function boatParts() {
  const Lb = 3.7,
    B = 1.3,
    Dp = 0.5,
    out = bag(),
    half = (f) =>
      (B / 2) * (f < 0.62 ? Math.pow(Math.sin(((f / 0.62) * Math.PI) / 2), 0.75) : 1 - 0.28 * ((f - 0.62) / 0.38) ** 2);
  const sheer = (f) => 0.2 * (1 - f) ** 3 + 0.05 * f * f,
    dep = (f) => Dp * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, f * 1.1))),
    sec = (f, th) => [-half(f) * Math.cos(th), sheer(f) - dep(f) * Math.pow(Math.sin(th), 0.6)];
  const g = new THREE.PlaneGeometry(1, 1, 18, 8),
    p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const f = p.getX(i) + 0.5,
      [x, y] = sec(f, (p.getY(i) + 0.5) * Math.PI);
    p.setXYZ(i, x, y, (f - 0.5) * Lb);
  }
  g.computeVertexNormals();
  out.ceil.push(g);
  const sh = new THREE.Shape();
  for (let k = 0; k <= 10; k++) {
    const [x, y] = sec(1, (k / 10) * Math.PI);
    k ? sh.lineTo(x, y) : sh.moveTo(x, y);
  }
  out.ceil.push(new THREE.ShapeGeometry(sh).translate(0, 0, Lb / 2));
  for (const s of [-1, 1])
    for (let k = 0; k < 8; k++) {
      const f0 = k / 8,
        f1 = (k + 1) / 8;
      bar(
        out,
        'beam',
        s * half(f0),
        sheer(f0) + 0.02,
        (f0 - 0.5) * Lb,
        s * half(f1),
        sheer(f1) + 0.02,
        (f1 - 0.5) * Lb,
        0.05,
      );
    }
  for (const f of [0.38, 0.72]) box(out, 'planks', 2 * half(f) - 0.08, 0.04, 0.24, 0, sheer(f) - 0.16, (f - 0.5) * Lb);
  for (const s of [-1, 1]) {
    rod(out, 'beam', s * 0.2, sheer(0.5) - 0.1, -1.3, s * 0.3, sheer(0.5) - 0.12, 1.0, 0.024, 6);
    box(out, 'planks', 0.14, 0.012, 0.5, s * 0.31, sheer(0.5) - 0.12, 1.25, 0.05);
  }
  out.bow = [0, sheer(0) + 0.02, -Lb / 2];
  return out;
}
function hermitYard(b, P) {
  const T = bag(),
    t = b.t || 0.45,
    hw = b.w / 2 + t / 2,
    hd = b.d / 2 + t / 2,
    gy = (x, z) => gAt(b, x, z),
    rh = Math.min(2, b.d * 0.32);
  // the chimney up the left gable (clear of the roof's overhang), its smoke
  {
    const x = -hw - 0.72,
      z = 0.5,
      y0 = gy(x, z) - 0.3,
      top = b.y + b.h + rh + 0.55;
    box(P, 'wall', 1.2, b.y + 2.1 - y0, 1.0, x + 0.12, (y0 + b.y + 2.1) / 2, z);
    box(P, 'wall', 0.62, top - b.y - 1.9, 0.62, x, (b.y + 1.9 + top) / 2, z);
    box(P, 'wall', 0.78, 0.1, 0.78, x, top + 0.05, z);
    P.brick.push(new THREE.CylinderGeometry(0.11, 0.13, 0.32, 8).translate(x, top + 0.26, z));
    collideRun(b, x + 0.1, z, x + 0.1, z, 0.62);
    smoke(b, x, top + 0.55, z);
  }
  // the vegetable patch: a raised bed edged in boards, four mounded rows (cabbages, leeks, beans up poles), a picket fence round it
  // with its gate toward the shack standing ajar
  {
    const x0 = hw + 0.75,
      x1 = x0 + 3.4,
      z0 = -1.9,
      z1 = 2.1,
      cz = (z0 + z1) / 2,
      ys = [
        [x0, z0],
        [x1, z0],
        [x0, z1],
        [x1, z1],
      ].map(([a, c]) => gy(a, c)),
      lo = Math.min(...ys),
      hi = Math.max(...ys),
      top = hi + 0.12;
    box(T, 'soil', x1 - x0 - 0.1, top - lo + 0.25, z1 - z0 - 0.1, (x0 + x1) / 2, (top + lo - 0.25) / 2, cz);
    for (const [sx, sz, x, z] of [
      [x1 - x0, 0.05, (x0 + x1) / 2, z0],
      [x1 - x0, 0.05, (x0 + x1) / 2, z1],
      [0.05, z1 - z0, x0, cz],
      [0.05, z1 - z0, x1, cz],
    ])
      box(P, 'planks', sx, top - lo + 0.32, sz, x, (top + lo - 0.2) / 2 + 0.04, z);
    for (let r = 0; r < 4; r++) {
      const x = x0 + 0.47 + r * 0.82;
      T.soil.push(
        new THREE.CylinderGeometry(0.24, 0.24, z1 - z0 - 0.4, 8, 1, false, 0, Math.PI)
          .rotateX(Math.PI / 2)
          .rotateZ(Math.PI / 2)
          .scale(1, 0.45, 1)
          .translate(x, top, cz),
      );
      for (let z = z0 + 0.45; z < z1 - 0.3; z += r < 2 ? 0.52 : 0.4) {
        const y = top + 0.08;
        if (r < 2) {
          T.cab.push(new THREE.SphereGeometry(0.16, 8, 6).scale(1, 0.82, 1).translate(x, y + 0.06, z));
          for (let k = 0; k < 4; k++) {
            const a = k * 1.571 + R();
            T.leaf.push(
              new THREE.CircleGeometry(0.15, 6)
                .rotateX(-1.1)
                .rotateY(a)
                .translate(x + Math.sin(a) * 0.14, y + 0.04, z + Math.cos(a) * 0.14),
            );
          }
        } else if (r === 2)
          for (let k = 0; k < 3; k++)
            T.leaf.push(
              new THREE.ConeGeometry(0.022, 0.42, 4)
                .translate(0, 0.21, 0)
                .rotateZ((R() - 0.5) * 0.5)
                .rotateX((R() - 0.5) * 0.5)
                .translate(x + (k - 1) * 0.05, y - 0.02, z),
            );
      }
      if (r === 3)
        for (const z of [z0 + 0.9, z1 - 0.9]) {
          for (const [a, c] of [
            [0.28, 0.28],
            [-0.28, 0.28],
            [0.28, -0.28],
            [-0.28, -0.28],
          ])
            rod(P, 'beam', x + a, top - 0.05, z + c, x, top + 1.75, z, 0.018, 4);
          for (let k = 0; k < 12; k++) {
            const f = 0.15 + R() * 0.75,
              a = (k % 4) * 1.571 + 0.785;
            T.leaf.push(
              new THREE.IcosahedronGeometry(0.1 + R() * 0.04, 0).translate(
                x + Math.cos(a) * 0.4 * (1 - f),
                top + f * 1.7,
                z + Math.sin(a) * 0.4 * (1 - f),
              ),
            );
          }
        }
    }
    const fx0 = x0 - 0.4,
      fx1 = x1 + 0.4,
      fz0 = z0 - 0.4,
      fz1 = z1 + 0.4;
    for (const [ax, az, bx, bz] of [
      [fx0, fz0, fx1, fz0],
      [fx1, fz0, fx1, fz1],
      [fx1, fz1, fx0, fz1],
      [fx0, fz1, fx0, 0.9],
      [fx0, -0.25, fx0, fz0],
    ]) {
      const l = Math.hypot(bx - ax, bz - az),
        n = Math.max(1, Math.ceil(l / 1.2)),
        al = Math.abs(bx - ax) > 0.01;
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n,
          z = az + ((bz - az) * k) / n;
        box(P, 'beam', 0.09, 1.1, 0.09, x, gy(x, z) + 0.45, z);
      }
      for (const h of [0.35, 0.8]) bar(P, 'planks', ax, gy(ax, az) + h, az, bx, gy(bx, bz) + h, bz, 0.05);
      for (let s = 0.12; s < l - 0.06; s += 0.16) {
        const x = ax + ((bx - ax) * s) / l,
          z = az + ((bz - az) * s) / l;
        box(
          P,
          'planks',
          al ? 0.08 : 0.025,
          0.9,
          al ? 0.025 : 0.08,
          x + (al ? 0 : 0.04),
          gy(x, z) + 0.42,
          z + (al ? 0.04 : 0),
        );
      }
      collideRun(b, ax, az, bx, bz, 0.12);
    }
    box(P, 'planks', 0.04, 0.85, 1.1, fx0 - 0.5, gy(fx0 - 0.5, 0) + 0.45, -0.02, 1.15);
  }
  // nets drying on two frames toward the water, a heap of net at the foot of one
  for (const [ax, az, bx, bz] of [
    [-hw - 1.0, -hd - 1.7, -hw - 3.6, -hd - 1.5],
    [-hw - 2.6, -0.9, -hw - 4.1, -2.9],
  ]) {
    const ya = gy(ax, az),
      yb = gy(bx, bz),
      l = Math.hypot(bx - ax, bz - az);
    rod(P, 'beam', ax, ya - 0.3, az, ax + 0.05, ya + 2.1, az, 0.06, 6);
    rod(P, 'beam', bx, yb - 0.3, bz, bx - 0.05, yb + 2.1, bz, 0.06, 6);
    rod(P, 'beam', ax, ya + 2.0, az, bx, yb + 2.0, bz, 0.04, 6);
    const net = new THREE.PlaneGeometry(l - 0.15, 1.75, 10, 6),
      p = net.attributes.position,
      uv = net.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / (l - 0.15) + 0.5,
        f = 0.5 - p.getY(i) / 1.75;
      p.setZ(i, 0.16 * Math.sin(Math.PI * u) * f * f);
      p.setY(i, p.getY(i) - 0.18 * Math.sin(Math.PI * u) * f);
      uv.setXY(i, (uv.getX(i) * l) / 0.6, (uv.getY(i) * 1.75) / 0.6);
    }
    T.net.push(
      net.rotateY(-Math.atan2(bz - az, bx - ax)).translate((ax + bx) / 2, (ya + yb) / 2 + 2.0 - 0.9, (az + bz) / 2),
    );
    for (let s = 0.2; s < l - 0.1; s += 0.35) {
      const f = s / l;
      T.buoy.push(
        new THREE.CylinderGeometry(0.045, 0.045, 0.11, 8)
          .rotateZ(Math.PI / 2)
          .rotateY(-Math.atan2(bz - az, bx - ax))
          .translate(ax + (bx - ax) * f, ya + (yb - ya) * f + 1.9, az + (bz - az) * f),
      );
    }
    collideRun(b, ax, az, ax, az, 0.12);
    collideRun(b, bx, bz, bx, bz, 0.12);
  }
  {
    const x = -hw - 3.0,
      z = -1.6;
    T.net.push(new THREE.IcosahedronGeometry(0.55, 1).scale(1.3, 0.32, 0.9).translate(x, gy(x, z) + 0.06, z));
  }
  // the rain barrel under the gutter
  {
    const x = 1.95,
      z = -hd - 0.5,
      y = gy(x, z),
      prof = [
        [0, 0],
        [0.29, 0],
        [0.33, 0.25],
        [0.34, 0.47],
        [0.33, 0.7],
        [0.29, 0.95],
        [0.27, 0.95],
      ].map(([r, h]) => new THREE.Vector2(r, h));
    P.planks.push(new THREE.LatheGeometry(prof, 14).translate(x, y, z));
    for (const h of [0.12, 0.47, 0.83])
      P.iron.push(new THREE.CylinderGeometry(0.343, 0.343, 0.04, 14, 1, true).translate(x, y + h, z));
    T.water.push(new THREE.CircleGeometry(0.28, 14).rotateX(-Math.PI / 2).translate(x, y + 0.86, z));
    const ye = b.y + b.h - (0.45 * rh) / hd - 0.12,
      ze = -(hd + 0.45) + 0.06;
    P.iron.push(
      new THREE.CylinderGeometry(0.07, 0.07, 2.4, 8, 1, true, 0, Math.PI)
        .rotateZ(-Math.PI / 2)
        .translate(x - 0.95, ye, ze),
    );
    rod(P, 'iron', x, ye, ze, x, y + 1.05, z, 0.04, 6);
    collideRun(b, x, z, x, z, 0.38, () => y + 0.95);
  }
  // the woodpile against the back wall under a lean-to of boards, the chopping block with the axe in it
  {
    const z = hd + 0.38,
      x0 = -1.9,
      x1 = 0.9,
      yc = b.y + 1.5;
    for (let row = 0; row < 4; row++)
      for (let x = x0 + 0.12 + (row % 2) * 0.1; x < x1 - 0.1; x += 0.21) {
        const r = 0.085 + R() * 0.03;
        P.beam.push(
          new THREE.CylinderGeometry(r, r, 0.55, 7)
            .rotateX(Math.PI / 2)
            .rotateZ(R() * 0.5)
            .translate(x, gy(x, z) + 0.1 + row * 0.19, z + (R() - 0.5) * 0.08),
        );
      }
    for (const x of [x0, x1]) {
      box(P, 'beam', 0.07, 1.0, 0.07, x, gy(x, z) + 0.4, z - 0.2);
      rod(P, 'beam', x, gy(x, z + 0.55) - 0.2, z + 0.55, x, yc - 0.12, z + 0.55, 0.045, 6);
    }
    box(P, 'planks', x1 - x0 + 0.5, 0.04, 1.08, (x0 + x1) / 2, yc, hd + 0.5, 0, 0.25);
    collideRun(b, x0, z, x1, z, 0.36, () => gy(0, z) + 0.85);
    const cx = 1.75,
      cz = hd + 0.95,
      cy = gy(cx, cz);
    P.beam.push(new THREE.CylinderGeometry(0.27, 0.3, 0.48, 10).translate(cx, cy + 0.2, cz));
    rod(P, 'beam', cx - 0.05, cy + 0.48, cz, cx + 0.3, cy + 1.05, cz + 0.22, 0.022, 6);
    box(P, 'iron', 0.04, 0.12, 0.2, cx - 0.06, cy + 0.5, cz - 0.02, 0.6);
    for (let k = 0; k < 4; k++)
      box(P, 'beam', 0.09, 0.09, 0.5, cx + 0.5 + R() * 0.5, cy + 0.04, cz + (R() - 0.5) * 0.8, R() * 3);
    collideRun(b, cx, cz, cx, cz, 0.3, () => cy + 0.45);
  }
  // lanterns: on a bracket by the door, on a pole at the jetty's end
  {
    const x = -1.15,
      y = b.y + 2.05;
    box(P, 'iron', 0.03, 0.03, 0.34, x, y, -hd - 0.17);
    lantern(P, x, y - 0.22, -hd - 0.32);
    lampAt(b, new THREE.Vector3(x, y - 0.22, -hd - 0.32), 'lantern');
  }
  {
    const jz = -b.d / 2 - 11.4,
      jy = b.jy(jz),
      x = 0.78;
    rod(P, 'beam', x, jy - 0.6, jz, x, jy + 1.65, jz, 0.06, 6);
    box(P, 'beam', 0.05, 0.05, 0.45, x, jy + 1.6, jz - 0.2);
    lantern(P, x, jy + 1.32, jz - 0.38);
    lampAt(b, new THREE.Vector3(x, jy + 1.32, jz - 0.38), 'lantern');
    collideRun(b, x, jz, x, jz, 0.1);
  }
  // the rowboat, tied alongside the jetty by its painter
  // (afloat 0.34 m deep, gunwale under the jetty's deck: at 0.14 m she rode on the ripples, keel in the air; places round 2)
  {
    const bx = 1.95,
      bz = -b.d / 2 - 10.0,
      by = Math.max(WATER_Y + 0.12, gy(bx, bz) + 0.5),
      ry = Math.PI + 0.08,
      Bt = boatParts(),
      m = new THREE.Matrix4().makeTranslation(bx, by, bz).multiply(new THREE.Matrix4().makeRotationY(ry));
    for (const k of ['ceil', 'planks', 'beam']) for (const q of Bt[k]) P[k].push(q.applyMatrix4(m));
    const bow = new THREE.Vector3(...Bt.bow).applyMatrix4(m),
      post = new THREE.Vector3(0.75, Math.max(gy(0.75, -b.d / 2 - 7), 0) + 0.58, -b.d / 2 - 7); // (the jetty's post ahead of her bow)
    for (let k = 0; k < 5; k++) {
      const f0 = k / 5,
        f1 = (k + 1) / 5,
        y = (f) => bow.y + (post.y - bow.y) * f - 0.25 * Math.sin(Math.PI * f);
      rod(
        P,
        'planks',
        bow.x + (post.x - bow.x) * f0,
        y(f0),
        bow.z + (post.z - bow.z) * f0,
        bow.x + (post.x - bow.x) * f1,
        y(f1),
        bow.z + (post.z - bow.z) * f1,
        0.016,
        4,
      );
    }
    box(P, 'planks', 0.7, 0.03, 1.9, bx, WATER_Y + 0.03, bz, ry); // (her bottom boards, just over the water: the lake showed through her open hull)
    collideRun(
      b,
      bx + Math.sin(ry) * 1.3,
      bz + Math.cos(ry) * 1.3,
      bx - Math.sin(ry) * 1.3,
      bz - Math.cos(ry) * 1.3,
      0.55,
      () => by - 0.25,
    );
  }
  bake(b, [[T, null]]);
}

// for the other parts of the split (src/buildings.js, src/interiors.js, src/places/)
export { hermitYard };
