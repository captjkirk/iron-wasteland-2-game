// The crashed plane (slice 23, #52): the airliner broken in three, its materials and its pieces. src/places.js is what
// happens there. Moved here unchanged from src/buildings.js (the code cleanup, November 16, 2026); buildings.js still
// exports all of it.
import * as THREE from 'three';
import { mulberry32 } from '../noise.js';
import { biomeAt } from '../world.js';
import { toW } from '../plan.js';
import { addCollider } from '../props.js';
import { pbr, canvasTex } from '../propmodels.js';
import { MAT, CUT, box, gAt, collideRun, surface, cache, bar } from '../buildings.js';

// the crashed plane (slice 23, rebuilt at real scale; Jared, November 14, 2026: "if it's meant to be like a commercial airliner, the
// scale should make sense and the detail needs improved"): a narrow-body airliner the size of an A320 (fuselage 3.9 m across and 38 m
// long, wings 34 m tip to tip) of a made-up airline, Solmere, broken in three where it ploughed in. The nose has dug in nose-down, the
// middle (the wing box) lies sunk in its own furrow with the right wing still on, the tail lies slewed and rolled with its fin leaning.
// The left wing tore off and lies propped on its own engine; the right engine fell off and lies ahead of the right wing. Walk into the
// middle through either break (a torn floor panel ramps down to the sand); the cargo crate is at the back of the cabin, seen from the
// rear break. Everything is built in a design frame (y 0 on the fuselage's centreline, -z the nose, z -19 to 19) and each piece is
// moved into the building's frame by its own pose.
const FZ0 = -19,
  FRX = 1.95,
  FRY = 2.02,
  FLOOR = -0.77,
  TAU = Math.PI * 2;
// the fuselage's top and bottom lines and half-width at z: a round nose with the windscreen sloping back, the tail cone swept up
function fprof(z) {
  if (z < -13.5) {
    const t = Math.max(0.002, (z + 19) / 5.5),
      e = Math.sqrt(1 - (1 - t) ** 2);
    return { top: -0.55 + (FRY + 0.55) * e ** 0.85, bot: -0.55 - (FRY - 0.55) * e ** 0.55, hw: FRX * e ** 0.7 };
  }
  if (z > 6) {
    const t = Math.min(1, (z - 6) / 13);
    return {
      top: FRY - (FRY - 1.05) * t ** 2.2,
      bot: -FRY + (FRY + 0.6) * t ** 1.35,
      hw: FRX + (0.24 - FRX) * t ** 1.5,
    };
  }
  return { top: FRY, bot: -FRY, hw: FRX };
}
// a point of the skin at z, angle f round from the crown (toward +x first), inset d
const fpt = (z, f, d = 0) => {
  const p = fprof(z),
    hh = (p.top - p.bot) / 2;
  return [Math.max(0.01, p.hw - d) * Math.sin(f), (p.top + p.bot) / 2 + Math.max(0.01, hh - d) * Math.cos(f)];
};
// a stretch of skin from z0 to z1: o.d inset, o.j0 / o.j1 the torn ends (metres added to z, by angle), o.dent crumpling, o.f0..o.f1 the
// angles it covers; its uv runs along the body (u, 38 m) and round it from the crown (v), so one painted livery wraps every piece
function skinGeo(z0, z1, o = {}) {
  const na = o.na || 40,
    f0 = o.f0 ?? 0,
    f1 = o.f1 ?? TAU,
    nz = Math.max(1, Math.ceil((z1 - z0) / (o.dz || 0.5))),
    d = o.d || 0,
    pos = [],
    uv = [],
    idx = [];
  for (let i = 0; i <= nz; i++) {
    const s = i / nz;
    for (let k = 0; k <= na; k++) {
      const f = f0 + ((f1 - f0) * k) / na;
      let z = z0 + (z1 - z0) * s;
      if (o.j0) z += o.j0(f) * (1 - s) ** 6;
      if (o.j1) z += o.j1(f) * s ** 6;
      const [x, y] = fpt(z, f, d - (o.dent ? o.dent(f, z) : 0));
      pos.push(x, y, z);
      uv.push((z - FZ0) / 38, (((f % TAU) + TAU) % TAU) / TAU);
    }
  }
  for (let i = 0; i < nz; i++)
    for (let k = 0; k < na; k++) {
      const a = i * (na + 1) + k,
        b = a + 1,
        c = a + na + 1,
        e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (f1 - f0 >= TAU - 1e-6) {
    const n = g.attributes.normal;
    for (let i = 0; i <= nz; i++) {
      const a = i * (na + 1),
        b = a + na,
        v = new THREE.Vector3(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
      n.setXYZ(a, v.x, v.y, v.z);
      n.setXYZ(b, v.x, v.y, v.z);
    }
  } // (no seam along the crown)
  if (o.uvAt) {
    const p = g.attributes.position,
      u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const [a, c] = o.uvAt(p.getX(i), p.getY(i), p.getZ(i), u.getX(i), u.getY(i));
      u.setXY(i, a, c);
    }
  }
  return g;
}
// an airfoil surface through stations { x, y, z (leading edge), c (chord), t (thickness / chord), v (texture row) }, span along x
// (o.sym: a symmetric section, for the fin; o.caps: stations to close)
function wingGeo(st, o = {}) {
  const N = 8,
    R = 2 * N + 1,
    pos = [],
    uv = [],
    idx = [];
  const cs = (s) => 0.5 - 0.5 * Math.cos(Math.PI * s),
    th = (s) => 5 * (0.2969 * Math.sqrt(s) - 0.126 * s - 0.3516 * s * s + 0.2843 * s ** 3 - 0.1036 * s ** 4);
  for (const q of st)
    for (let i = 0; i < R; i++) {
      const up = i <= N,
        s = cs(up ? 1 - i / N : (i - N) / N),
        h = th(s) * q.t * q.c * (o.sym ? (up ? 1 : -1) : up ? 1.12 : -0.78),
        cam = o.sym ? 0 : 0.012 * q.c * Math.sin(Math.PI * s);
      pos.push(q.x, q.y + cam + h, q.z + s * q.c);
      uv.push(s, q.v ?? 0);
    }
  for (let j = 0; j < st.length - 1; j++)
    for (let i = 0; i < R - 1; i++) {
      const a = j * R + i,
        b = a + 1,
        c = a + R,
        d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  for (const j of o.caps || []) for (let i = 1; i < R - 2; i++) idx.push(j * R, j * R + i, j * R + i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// the wing's upper surface height over its chord line at chord fraction s (the same section as wingGeo's)
const wingTopAt = (q, s) =>
  q.y +
  0.012 * q.c * Math.sin(Math.PI * s) +
  5 * (0.2969 * Math.sqrt(s) - 0.126 * s - 0.3516 * s * s + 0.2843 * s ** 3 - 0.1036 * s ** 4) * q.t * q.c * 1.12;
// the wing's planform (design frame, the right wing; x < 0 mirrors): leading edge swept 27 degrees, the inboard trailing edge straight
const WD = Math.tan(0.087 + 0.05); // (5 degrees of dihedral and 3 more where the wing buckled up at its root)
function wingStation(x) {
  const a = Math.abs(x),
    z = -4.3 + (a - 1.6) * 0.51,
    zt = -4.3 + 15 * 0.51; // (the tip's leading edge, at 16.6 m)
  const te = a <= 6.3 ? 2.3 : 2.3 + ((zt + 1.55 - 2.3) * (a - 6.3)) / 10.3; // (the trailing edge: straight inboard, then swept to the tip)
  return { x, y: -1.25 + (a - 1.6) * WD, z, c: te - z, t: 0.15 - (0.04 * (a - 1.6)) / 15, v: (a - 1.6) / 4 };
}
// a turbofan in its own frame: the intake lip at z 0, the exhaust at the back (+z); the cowl turned on a lathe, a dark intake, the
// fan and its spinner, the core's nozzle and plug
function engineGeo(T) {
  const pts = [
    [0.84, 0.78],
    [0.86, 0.42],
    [0.9, 0.12],
    [0.98, 0],
    [1.06, 0.06],
    [1.1, 0.32],
    [1.1, 1.3],
    [1.04, 2.3],
    [0.9, 2.95],
    [0.76, 3.32],
    [0.72, 3.26],
  ].map(([r, a]) => new THREE.Vector2(r, a));
  T.nacelle.push(new THREE.LatheGeometry(pts, 32).rotateX(Math.PI / 2));
  T.dark.push(new THREE.CircleGeometry(0.86, 24).translate(0, 0, 0.82)); // (behind the fan: no seeing through the engine)
  T.chrome.push(new THREE.ConeGeometry(0.3, 0.5, 16).rotateX(-Math.PI / 2).translate(0, 0, 0.5)); // the spinner
  for (let k = 0; k < 22; k++)
    T.dark.push(
      new THREE.BoxGeometry(0.025, 0.55, 0.2)
        .rotateY(0.65)
        .translate(0, 0.57, 0.68)
        .rotateZ((k / 22) * TAU),
    );
  T.dark.push(new THREE.CylinderGeometry(0.58, 0.64, 0.7, 20, 1, true).rotateX(Math.PI / 2).translate(0, 0, 3.4)); // the core nozzle
  T.chrome.push(new THREE.ConeGeometry(0.44, 1.0, 16).rotateX(Math.PI / 2).translate(0, 0, 4.1));
} // the plug
// the pylon, in the engine's frame: from the cowl's top up and back to the wing's underside
function pylonGeo(T, cut = 1) {
  const s = new THREE.Shape(
    [
      [0.5, 1.0],
      [3.7 * cut, 1.0],
      [4.6 * cut, 1.0 + 0.75 * cut],
      [2.2, 1.7],
      [1.1, 1.4],
    ].map(([z, y]) => new THREE.Vector2(z, y)),
  );
  T.white.push(
    new THREE.ExtrudeGeometry(s, { depth: 0.34, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(0.17, 0, 0),
  );
}
// a triple seat row in its own frame (feet on the floor at y 0, facing -z, 1.5 m wide)
function seatGeo(T, M) {
  const add = (k, g) => T[k].push(g.applyMatrix4(M));
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.5;
    add('seat', new THREE.BoxGeometry(0.46, 0.13, 0.5).translate(x, 0.44, 0));
    add('seat', new THREE.BoxGeometry(0.46, 0.7, 0.1).translate(0, 0.35, 0).rotateX(0.2).translate(x, 0.48, 0.24));
    add('snow', new THREE.BoxGeometry(0.4, 0.2, 0.11).translate(0, 0.58, -0.006).rotateX(0.2).translate(x, 0.48, 0.24));
    add(
      'dark',
      new THREE.BoxGeometry(0.36, 0.26, 0.012).translate(0, 0.3, 0.056).rotateX(0.2).translate(x, 0.48, 0.24),
    );
  } // (the tray table on its back)
  for (let j = 0; j < 4; j++)
    add('dark', new THREE.BoxGeometry(0.05, 0.05, 0.42).translate(-0.75 + j * 0.5, 0.64, 0.02));
  for (const x of [-0.55, 0.55])
    for (const z of [-0.18, 0.18]) add('chrome', new THREE.BoxGeometry(0.04, 0.4, 0.04).translate(x, 0.2, z));
  add('chrome', new THREE.BoxGeometry(1.4, 0.04, 0.04).translate(0, 0.37, 0));
}
// a geometry painted one colour (the luggage, the oxygen masks: one material, coloured by vertex)
const tint = (g, hex) => {
  const c = new THREE.Color(hex),
    n = g.attributes.position.count,
    a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};

// the plane's painted textures and materials, made the first time a plane is built (the classic world never has one)
function planeMats(b) {
  if (MAT.livery) return MAT;
  const rnd = mulberry32(5150),
    std = (o) => {
      const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...o });
      m.clippingPlanes = [CUT];
      return m;
    };
  const rep = (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const rr = (x, px, py, w, h, r) => {
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
  };
  // the fuselage: 4096 along the body (38 m) by 1024 round it; y on the side maps to an angle round from the crown
  const sides = (W, H, RY) => {
    const X = (z) => ((z - FZ0) / 38) * W,
      PH = (y, s) => {
        const f = Math.acos(Math.max(-1, Math.min(1, y / RY)));
        return s > 0 ? f : TAU - f;
      },
      Y = (f) => H * (1 - f / TAU);
    return { X, PH, Y, row: (y, s) => Y(PH(y, s)) };
  };
  const band = (x, S, from, to, top, bot, col) => {
    for (const s of [1, -1]) {
      x.fillStyle = col;
      x.beginPath();
      for (let z = from; z <= to + 1e-6; z += 0.25) x.lineTo(S.X(z), S.row(top(z), s));
      for (let z = to; z >= from - 1e-6; z -= 0.25) x.lineTo(S.X(z), S.row(bot(z), s));
      x.closePath();
      x.fill();
    }
  };
  const up = (z) => (z > 6.5 ? ((z - 6.5) / 12.5) ** 1.5 * 2.6 : 0); // (the cheatline sweeps up the tail cone toward the fin)
  const WIN = [];
  for (let z = -12.9; z < 10.4; z += 0.533) WIN.push(z);
  const soot = (x, S, W, H, zb, spread, a0, n) => {
    for (let i = 0; i < n; i++) {
      const dz = (rnd() - 0.5) * 2 * spread * rnd(),
        f = rnd() * TAU,
        a = a0 * Math.exp(-Math.abs(dz) / (spread * 0.35)) * (0.4 + rnd() * 0.6);
      blob(x, S.X(zb + dz), S.Y(f), 8 + rnd() * 50, 0.4 + rnd() * 0.5, Math.min(0.3, a));
    }
  };
  const blob = (x, cx, cy, r, sq, a) => {
    x.save();
    x.translate(cx, cy);
    x.scale(1, sq);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(20,17,13,${a.toFixed(3)})`);
    g.addColorStop(1, 'rgba(20,17,13,0)');
    x.fillStyle = g;
    x.fillRect(-r, -r, 2 * r, 2 * r);
    x.restore();
  }; // (a soft smudge of soot)
  const livery = canvasTex(
    4096,
    1024,
    (x, W, H) => {
      const S = sides(W, H, FRY);
      for (let i = 0; i < 260; i++) {
        const g = (226 + rnd() * 14) | 0;
        x.fillStyle = `rgba(${g},${g - 2},${g - 6},0.35)`;
        x.fillRect(S.X(-19 + rnd() * 38), rnd() * H, 60 + rnd() * 160, 30 + rnd() * 90);
      } // (panels repainted at different times)
      band(
        x,
        S,
        -19,
        19,
        () => -0.98,
        () => -FRY - 0.01,
        '#8c9096',
      ); // the grey belly
      band(
        x,
        S,
        -19,
        19,
        (z) => -0.46 + up(z),
        (z) => -0.82 + up(z) * 0.92,
        '#1d4f6e',
      ); // the teal cheatline
      band(
        x,
        S,
        -19,
        19,
        (z) => -0.33 + up(z),
        (z) => -0.4 + up(z),
        '#d9a441',
      ); // its gold pinstripe
      band(
        x,
        S,
        -19,
        -17.6,
        () => FRY,
        () => -FRY,
        'rgba(120,124,128,0.35)',
      ); // the radome, a shade greyer
      // panel seams and rivet rows
      x.fillStyle = 'rgba(70,70,66,0.28)';
      for (let z = -17.6; z < 18; z += 1.6) x.fillRect(S.X(z), 0, 2, H);
      for (const y of [1.72, 1.02, -0.12, -1.18])
        for (const s of [1, -1]) {
          const r = S.row(y, s);
          x.fillRect(0, r, W, 2);
        }
      x.fillStyle = 'rgba(60,60,56,0.22)';
      for (let z = -17.6; z < 18; z += 1.6) for (let r = 0; r < H; r += 7) x.fillRect(S.X(z) + 5, r, 2, 2);
      for (const y of [1.72, 1.02, -0.12, -1.18])
        for (const s of [1, -1]) {
          const r = S.row(y, s);
          for (let px = 0; px < W; px += 8) x.fillRect(px, r + 5, 2, 2);
        }
      // the cabin windows (one row each side), dark glass in a grey frame with the sky caught in the top
      for (const s of [1, -1])
        for (const z of WIN) {
          const w = (0.235 * W) / 38,
            h = (0.36 / FRY / TAU) * H,
            cx = S.X(z),
            cy = S.row(0.3, s);
          x.fillStyle = '#8f918e';
          rr(x, cx - w / 2 - 3, cy - h / 2 - 3, w + 6, h + 6, w * 0.5);
          x.fill();
          const gr = x.createLinearGradient(0, cy + (h / 2) * s, 0, cy - (h / 2) * s);
          gr.addColorStop(0, '#5d6d7a');
          gr.addColorStop(0.45, '#26313a');
          gr.addColorStop(1, '#151b20');
          x.fillStyle = gr;
          rr(x, cx - w / 2, cy - h / 2, w, h, w * 0.45);
          x.fill();
          x.fillStyle = 'rgba(70,64,56,0.12)';
          for (let k = 0; k < 2; k++) {
            const L = ((0.3 + rnd() * 0.9) / FRY / TAU) * H;
            x.fillRect(cx - w / 3 + rnd() * w * 0.6, s > 0 ? cy - h / 2 - L : cy + h / 2, 2 + rnd() * 3, L);
          }
        } // (rain streaks below)
      // doors: the front and rear passenger doors, two overwing exits, each a seam with a small window and handle
      const door = (z0, z1, y0, y1, s, win) => {
        const a = S.row(y1, s),
          c = S.row(y0, s),
          t = Math.min(a, c),
          h = Math.abs(c - a);
        x.strokeStyle = 'rgba(80,80,76,0.85)';
        x.lineWidth = 3;
        rr(x, S.X(z0), t, S.X(z1) - S.X(z0), h, 14);
        x.stroke();
        x.strokeStyle = 'rgba(255,255,255,0.35)';
        x.lineWidth = 1;
        rr(x, S.X(z0) + 3, t + 3, S.X(z1) - S.X(z0) - 6, h - 6, 12);
        x.stroke();
        if (win) {
          x.fillStyle = '#1e262d';
          rr(x, S.X((z0 + z1) / 2) - 11, S.row(0.42, s) - 13, 22, 26, 10);
          x.fill();
        }
        x.fillStyle = '#6a6a66';
        x.fillRect(S.X(z0 + 0.12), S.row(0.05, s) - 4, 18, 8);
      };
      for (const s of [1, -1]) {
        door(-14.75, -13.93, -0.77, 1.12, s, true);
        door(10.9, 11.72, -0.6, 1.25, s, true);
        door(-1.68, -1.16, -0.15, 0.78, s, false);
        door(-0.84, -0.32, -0.15, 0.78, s, false);
      }
      // the cockpit's windows, painted: two windscreens and two side windows a side, in a dark frame
      for (const s of [1, -1])
        for (const q of [
          [
            [-16.95, 0.1],
            [-16.3, 0.1],
            [-16.3, 0.62],
            [-16.95, 0.7],
          ],
          [
            [-16.22, 0.66],
            [-15.66, 0.68],
            [-15.66, 1.04],
            [-16.22, 1.02],
          ],
          [
            [-15.58, 0.7],
            [-15.08, 0.72],
            [-15.1, 1.02],
            [-15.58, 1.04],
          ],
        ]) {
          x.beginPath();
          q.forEach(([z, f]) => x.lineTo(S.X(z), S.Y(s > 0 ? f : TAU - f)));
          x.closePath();
          x.fillStyle = '#12181d';
          x.fill();
          x.strokeStyle = '#3a3d40';
          x.lineWidth = 5;
          x.stroke();
          x.fillStyle = 'rgba(120,150,175,0.25)';
          x.beginPath();
          q.slice(0, 3).forEach(([z, f], i) => x.lineTo(S.X(z) + (i === 2 ? -10 : 0), S.Y(s > 0 ? f : TAU - f)));
          x.fill();
        }
      // the name, in the airline's teal over the forward cabin (read the right way round on both sides), the registration near the tail
      const word = (txt, z, y, hgt, col, s) => {
        x.save();
        x.translate(S.X(z), S.row(y, s));
        if (s > 0) x.rotate(Math.PI);
        x.scale(1.32 * (W / 4096), 1);
        x.fillStyle = col;
        x.font = `bold ${Math.round((hgt / FRY / TAU) * H * 1.38)}px sans-serif`;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText(txt, 0, 0);
        x.restore();
      };
      for (const s of [1, -1]) {
        word('SOLMERE', -6.6, 1.2, 0.72, '#1d4f6e', s);
        word('IW-SLM', 14.6, 0.55, 0.3, '#3a3d40', s);
      }
      // grime: dust low on the body, the belly scraped raw, soot round both breaks and where the left wing burned
      for (let i = 0; i < 3200; i++) {
        const f = rnd() * TAU,
          low = Math.max(0, 0.35 - Math.cos(f));
        x.fillStyle = `rgba(${(130 + rnd() * 30) | 0},${(108 + rnd() * 24) | 0},${(78 + rnd() * 18) | 0},${(0.015 + 0.09 * low * rnd()).toFixed(3)})`;
        x.fillRect(rnd() * W, S.Y(f) - 6, 10 + rnd() * 60, 4 + rnd() * 16);
      }
      for (const s of [1, -1]) {
        const a = S.row(0.5, s),
          c = S.row(-1.5, s),
          g = x.createLinearGradient(0, a, 0, c);
        g.addColorStop(0, 'rgba(150,124,88,0)');
        g.addColorStop(1, 'rgba(150,124,88,0.26)');
        x.fillStyle = g;
        x.fillRect(0, Math.min(a, c), W, Math.abs(c - a));
      } // (sand blown up the sides)
      for (let i = 0; i < 520; i++) {
        x.fillStyle = `rgba(150,156,162,${(0.3 + rnd() * 0.45).toFixed(2)})`;
        x.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 12, 1 + rnd() * 5);
      } // (paint chipped to the bare metal)
      for (let i = 0; i < 700; i++) {
        const f = rnd() * TAU,
          z = -19 + rnd() * 38;
        x.fillStyle = `rgba(96,84,66,${(0.04 + rnd() * 0.07).toFixed(3)})`;
        const L = 30 + rnd() * 160,
          y0 = S.Y(f);
        x.fillRect(S.X(z), f < Math.PI ? y0 - L : y0, 2 + rnd() * 4, L);
      } // (dirt run down from the crown)
      for (let i = 0; i < 500; i++) {
        const f = Math.PI + (rnd() - 0.5) * 1.6,
          c = rnd() < 0.5 ? 'rgba(220,220,214,0.3)' : 'rgba(40,36,30,0.25)';
        x.fillStyle = c;
        x.fillRect(rnd() * W, S.Y(f), 40 + rnd() * 400, 1 + rnd() * 2);
      }
      soot(x, S, W, H, -8, 2.2, 0.4, 1100);
      soot(x, S, W, H, 6.5, 2.4, 0.4, 1200);
      for (let i = 0; i < 700; i++) {
        const z = -5 + rnd() * 8,
          f = TAU - (Math.PI * 0.62 + rnd() * rnd() * Math.PI * 0.7);
        blob(x, S.X(z), S.Y(f), 12 + rnd() * 60, 0.5 + rnd() * 0.4, 0.06 + rnd() * 0.22);
      } // (where the left wing burned)
      for (let i = 0; i < 160; i++) {
        const z = -19 + rnd() * 38,
          f = rnd() * TAU;
        x.fillStyle = `rgba(90,80,64,${(0.05 + rnd() * 0.08).toFixed(3)})`;
        x.fillRect(S.X(z), S.Y(f), 2 + rnd() * 3, 20 + rnd() * 80);
      }
    },
    '#ebe9e3',
  );
  // the cabin's lining: cream sidewalls with a bezel round each window (lit by the day outside), green primer below the floor
  const LW = 2048,
    LH = 512,
    lining = (glow) =>
      canvasTex(
        LW,
        LH,
        (x, W, H) => {
          const S = sides(W, H, FRY - 0.1);
          if (!glow) {
            band(
              x,
              S,
              -19,
              19,
              () => -0.72,
              () => -FRY - 0.01,
              '#3f493b',
            );
            x.fillStyle = 'rgba(30,34,28,0.6)';
            for (let z = -18.5; z < 19; z += 0.533)
              x.fillRect(S.X(z), S.row(-0.75, 1), 3, S.row(-0.75, -1) - S.row(-0.75, 1));
            band(
              x,
              S,
              -19,
              19,
              () => FRY,
              () => 1.45,
              '#e3dfd6',
            );
            x.fillStyle = 'rgba(90,86,78,0.35)';
            for (let z = -17.6; z < 18; z += 1.066) x.fillRect(S.X(z), 0, 2, H);
          }
          for (const s of [1, -1])
            for (const z of WIN) {
              const cx = S.X(z),
                cy = S.row(0.3, s),
                w = (0.4 * W) / 38,
                h = (0.6 / FRY / TAU) * H;
              if (!glow) {
                x.fillStyle = '#ece8df';
                rr(x, cx - w / 2, cy - h / 2, w, h, w * 0.4);
                x.fill();
                x.strokeStyle = 'rgba(90,86,78,0.4)';
                x.lineWidth = 2;
                x.stroke();
              }
              x.fillStyle = glow ? '#fff4e0' : '#b9cfe0';
              rr(x, cx - w * 0.27, cy - h * 0.29, w * 0.54, h * 0.58, w * 0.22);
              x.fill();
            }
          if (!glow) {
            for (let i = 0; i < 1500; i++) {
              x.fillStyle = `rgba(60,52,40,${(0.02 + rnd() * 0.06).toFixed(3)})`;
              x.fillRect(rnd() * W, rnd() * H, 4 + rnd() * 30, 2 + rnd() * 12);
            }
            soot(x, S, W, H, -8, 2, 0.6, 500);
            soot(x, S, W, H, 6.5, 2, 0.6, 500);
          }
        },
        glow ? '#000000' : '#d6d0c2',
      );
  // the wings: light grey paint, a bare metal leading edge, spar and panel seams, the flap hinge line; 4 m of span to a repeat
  const wing = rep(
    canvasTex(
      512,
      512,
      (x, W, H) => {
        x.fillStyle = '#d2d5d8';
        x.fillRect(0, 0, W * 0.07, H);
        x.fillStyle = 'rgba(60,62,64,0.35)';
        for (const u of [0.07, 0.16, 0.34, 0.52, 0.64]) x.fillRect(u * W, 0, 2, H);
        x.fillStyle = 'rgba(30,30,32,0.7)';
        x.fillRect(0.76 * W, 0, 3, H);
        x.fillRect(0.76 * W, 0, W * 0.24, 4);
        for (let r = 0; r < H; r += 128) {
          x.fillStyle = 'rgba(60,62,64,0.3)';
          x.fillRect(0, r, W, 2);
        }
        x.fillStyle = 'rgba(50,50,52,0.25)';
        for (const u of [0.16, 0.34, 0.52, 0.64]) for (let r = 0; r < H; r += 6) x.fillRect(u * W + 4, r, 2, 2);
        for (let i = 0; i < 700; i++) {
          x.fillStyle = `rgba(${(70 + rnd() * 40) | 0},${(64 + rnd() * 30) | 0},${(54 + rnd() * 20) | 0},${(0.03 + rnd() * 0.08).toFixed(3)})`;
          x.fillRect(rnd() * W, rnd() * H, 30 + rnd() * 200, 1 + rnd() * 4);
        }
      },
      '#aeb3b7',
    ),
  );
  // the fin: the airline's teal with its gold sun rising over a white horizon
  const fin = canvasTex(
    512,
    512,
    (x, W, H) => {
      const g = x.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#24607f');
      g.addColorStop(1, '#173f58');
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
      const cx = W * 0.6,
        cy = H * 0.42,
        r = W * 0.13;
      x.fillStyle = '#e0a83a';
      for (let k = 0; k < 14; k++) {
        x.save();
        x.translate(cx, cy);
        x.rotate((k / 14) * TAU);
        x.beginPath();
        x.moveTo(-r * 0.16, -r * 1.2);
        x.lineTo(0, -r * 1.75);
        x.lineTo(r * 0.16, -r * 1.2);
        x.fill();
        x.restore();
      }
      x.beginPath();
      x.arc(cx, cy, r, 0, TAU);
      x.fill();
      x.fillStyle = '#ffffff';
      x.fillRect(0, cy + r * 0.55, W, H * 0.035);
      x.fillStyle = '#173f58';
      x.fillRect(0, cy + r * 0.55 + H * 0.035, W, H);
      x.fillStyle = 'rgba(255,255,255,0.08)';
      x.fillRect(0, cy + r * 0.55 + H * 0.06, W, H * 0.015);
      x.fillStyle = 'rgba(20,24,28,0.4)';
      x.save();
      x.beginPath();
      x.moveTo(W * 0.74, H);
      x.lineTo(W * 0.98, 0);
      x.lineWidth = 3;
      x.strokeStyle = 'rgba(10,14,18,0.6)';
      x.stroke();
      x.restore(); // (the rudder's hinge line)
      for (let i = 0; i < 500; i++) {
        x.fillStyle = `rgba(${(40 + rnd() * 50) | 0},${(36 + rnd() * 30) | 0},${(30 + rnd() * 20) | 0},${(0.03 + rnd() * 0.08).toFixed(3)})`;
        x.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 6, 20 + rnd() * 120);
      }
    },
    '#1d4f6e',
  );
  // the engine's cowl along its profile: a dark intake, the polished lip, a white cowl with a teal band, the grey nozzle
  const nacelle = canvasTex(
    256,
    256,
    (x, W, H) => {
      const at = (v0, v1, c) => {
        x.fillStyle = c;
        x.fillRect(0, H * (1 - v1), W, H * (v1 - v0));
      };
      at(0, 0.21, '#2a2c2f');
      at(0.21, 0.42, '#c7cbcf');
      at(0.42, 0.82, '#e5e3dd');
      at(0.6, 0.66, '#1d4f6e');
      at(0.66, 0.675, '#d9a441');
      at(0.82, 1, '#808386');
      for (let i = 0; i < 300; i++) {
        x.fillStyle = `rgba(40,34,28,${(0.03 + rnd() * 0.1).toFixed(3)})`;
        x.fillRect(rnd() * W, H * (0.1 + rnd() * 0.75), 1 + rnd() * 3, 6 + rnd() * 40);
      }
    },
    '#e5e3dd',
  );
  const seat = rep(
    canvasTex(
      128,
      128,
      (x, W, H) => {
        for (let i = 0; i < 900; i++) {
          const v = rnd();
          x.fillStyle = `rgba(${v > 0.5 ? '70,90,130' : '20,26,40'},${(0.1 + rnd() * 0.2).toFixed(2)})`;
          x.fillRect(rnd() * W, rnd() * H, 2, 1);
        }
        x.fillStyle = 'rgba(15,18,28,0.5)';
        x.fillRect(0, 0, W, 2);
        x.fillRect(0, 0, 2, H);
      },
      '#2c3a5c',
    ),
  );
  const carpet = rep(
    canvasTex(
      256,
      256,
      (x, W, H) => {
        x.fillStyle = 'rgba(120,128,150,0.35)';
        for (let a = 0; a < W; a += 32)
          for (let c = 0; c < H; c += 32) {
            x.beginPath();
            x.moveTo(a + 16, c + 8);
            x.lineTo(a + 24, c + 16);
            x.lineTo(a + 16, c + 24);
            x.lineTo(a + 8, c + 16);
            x.fill();
          }
        for (let i = 0; i < 2000; i++) {
          x.fillStyle = `rgba(20,20,24,${(0.05 + rnd() * 0.1).toFixed(2)})`;
          x.fillRect(rnd() * W, rnd() * H, 2, 2);
        }
        for (let i = 0; i < 14; i++) {
          x.fillStyle = `rgba(70,58,40,${(0.1 + rnd() * 0.2).toFixed(2)})`;
          x.beginPath();
          x.ellipse(rnd() * W, rnd() * H, 8 + rnd() * 30, 6 + rnd() * 20, rnd() * 3, 0, TAU);
          x.fill();
        }
      },
      '#474d5c',
    ),
  );
  const sootTex = canvasTex(
    256,
    256,
    (x, W, H) => {
      for (let i = 0; i < 260; i++) {
        const a = rnd() * TAU,
          r = Math.sqrt(rnd()) * W * 0.42,
          k = 1 - r / (W * 0.45);
        x.fillStyle = `rgba(0,0,0,${(0.05 + 0.25 * k * rnd()).toFixed(3)})`;
        x.beginPath();
        x.ellipse(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r, 10 + rnd() * 40, 8 + rnd() * 30, rnd() * 3, 0, TAU);
        x.fill();
      }
      const g = x.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.45);
      g.addColorStop(0, 'rgba(0,0,0,0.75)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
    },
    '#191512',
  );
  const desert = biomeAt(b.x, b.z) === 'desert',
    earth = pbr(desert ? 'terrain/sand' : 'terrain/gravel', { rough: 1 });
  earth.color.setRGB(...(desert ? [1.55, 0.92, 0.46] : [1.16, 0.92, 0.64]));
  rep(earth.map);
  rep(earth.normalMap);
  earth.clippingPlanes = [CUT]; // (the ground's own layer, the turned earth a shade darker)
  const gouge = rep(
    canvasTex(
      256,
      512,
      (x, W, H) => {
        for (let i = 0; i < 900; i++) {
          const u = rnd(),
            k = Math.sin(Math.PI * u) ** 1.5;
          x.fillStyle = `rgba(${(40 + rnd() * 30) | 0},${(30 + rnd() * 20) | 0},${(20 + rnd() * 12) | 0},${(0.06 + 0.3 * k * rnd()).toFixed(3)})`;
          x.fillRect(u * W, rnd() * H, 1 + rnd() * 5, 30 + rnd() * 200);
        }
        const g = x.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.25, 'rgba(50,38,26,0.35)');
        g.addColorStop(0.5, 'rgba(40,30,20,0.5)');
        g.addColorStop(0.75, 'rgba(50,38,26,0.35)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g;
        x.fillRect(0, 0, W, H);
      },
      '#3a2c1e',
    ),
  );
  Object.assign(MAT, {
    livery: std({ map: livery, roughness: 0.5, metalness: 0.18 }),
    lining: std({
      map: lining(false),
      emissiveMap: lining(true),
      emissive: 0xffffff,
      emissiveIntensity: 0.85,
      roughness: 0.85,
    }),
    wing: std({ map: wing, roughness: 0.45, metalness: 0.4 }),
    fin: std({ map: fin, roughness: 0.5, metalness: 0.15 }),
    nacelle: std({ map: nacelle, roughness: 0.4, metalness: 0.35 }),
    seat: std({ map: seat, roughness: 0.95 }),
    carpet: std({ map: carpet, roughness: 1 }),
    earth,
    dark: std({ color: 0x1e2023, roughness: 0.55, metalness: 0.5 }),
    chrome: std({ color: 0xb4b8bc, roughness: 0.32, metalness: 0.85 }),
    white: std({ color: 0xe2e0da, roughness: 0.5, metalness: 0.15 }),
    rubber: std({ color: 0x18181a, roughness: 0.92 }),
    plastic: std({ color: 0xd8d2c4, roughness: 0.6, emissive: 0x7a766c }),
    bags: std({ vertexColors: true, roughness: 0.8 }),
    alu: std({ color: 0x8c9196, roughness: 0.5, metalness: 0.6 }),
    gouge: Object.assign(
      new THREE.MeshStandardMaterial({
        map: gouge,
        transparent: true,
        depthWrite: false,
        roughness: 1,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
      { clippingPlanes: [CUT] },
    ),
    soot: Object.assign(
      new THREE.MeshStandardMaterial({
        map: sootTex,
        opacity: 0.75,
        transparent: true,
        depthWrite: false,
        roughness: 1,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      { clippingPlanes: [CUT] },
    ),
  });
  return MAT;
}

function buildPlane(b, P, g) {
  planeMats(b);
  const rnd = mulberry32(Math.round(b.seed * 1000) + 23),
    rr = (a, c) => a + rnd() * (c - a),
    V = (x, y, z) => new THREE.Vector3(x, y, z);
  const pose = (pivot, pos, yaw, pitch, roll) =>
    new THREE.Matrix4()
      .makeTranslation(pos.x, pos.y, pos.z)
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ')))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
  const part = () => Object.fromEntries(Object.keys(P).map((k) => [k, []])),
    put = (T, M) => {
      for (const k in T) for (const q of T[k]) P[k].push(M ? q.applyMatrix4(M) : q);
    };
  const at = (M, x, y, z) => V(x, y, z).applyMatrix4(M),
    ga = (x, z) => gAt(b, x, z),
    post = (lx, lz, r, top, stand) => {
      const [x, z] = toW(b, lx, lz);
      Object.assign(addCollider(x, z, r, b), { vr: 0, top, stand });
    };
  const earthMound = (x, z, sx, sy, sz, ry = 0, sink = 0.15) => {
    const NR = 7,
      NA = 20,
      pos = [],
      idx = [],
      s0 = rnd() * 50,
      c = Math.cos(ry),
      sn = Math.sin(ry); // a heap of turned earth, sloping out to the ground
    for (let i = 0; i <= NR; i++)
      for (let k = 0; k < NA; k++) {
        const r = i / NR,
          a = (k / NA) * TAU,
          rn = 1 + 0.18 * Math.sin(a * 3 + s0) + 0.1 * Math.sin(a * 7 - s0),
          lx = Math.cos(a) * r * rn * sx,
          lz = Math.sin(a) * r * rn * sz,
          wx = x + lx * c + lz * sn,
          wz = z - lx * sn + lz * c;
        const h = sy * (1 - r * r) ** 1.6 * (1 + 0.25 * Math.sin(lx * 2.3 + s0) * Math.sin(lz * 2.9 - s0));
        pos.push(wx, ga(wx, wz) + h - sink * (1 - r) + 0.03, wz);
      }
    for (let i = 0; i < NR; i++)
      for (let k = 0; k < NA; k++) {
        const a = i * NA + k,
          b2 = i * NA + ((k + 1) % NA),
          d = a + NA,
          e = b2 + NA;
        idx.push(a, b2, d, b2, e, d);
      }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    m.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    m.setIndex(idx);
    m.computeVertexNormals();
    P.earth.push(m);
  };
  const sootAt = (x, z, w, d, ry = 0) => {
    const q = new THREE.PlaneGeometry(w, d, 8, 8).rotateX(-Math.PI / 2).rotateY(ry),
      p = q.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const wx = x + p.getX(i),
        wz = z + p.getZ(i);
      p.setXYZ(i, wx, ga(wx, wz) + 0.09, wz);
    }
    q.computeVertexNormals();
    const m = new THREE.Mesh(q, MAT.soot);
    m.receiveShadow = true;
    m.renderOrder = 1;
    b.group.add(m);
  };
  const wiggle = (sd) => (f) =>
    0.22 * Math.sin(3 * f + sd) +
    0.14 * Math.sin(7 * f + sd * 2.3) +
    0.08 * Math.sin(13 * f + sd * 4.1) +
    0.05 * Math.sin(31 * f + sd * 0.7);
  const notch = (nf, nw, nd) => (f) => {
    const a = Math.atan2(Math.sin(f - nf), Math.cos(f - nf)),
      q = Math.max(0, 1 - (a / nw) ** 2);
    return nd * q * q;
  };
  const dent = (ends) => (f, z) => {
    let k = 0;
    for (const e of ends) k = Math.max(k, Math.exp(-Math.abs(z - e) / 1.1));
    return k * 0.1 * Math.sin(f * 5 + z * 2.3) * Math.sin(f * 3 - z * 1.7 + 1);
  };

  // ── a section of fuselage, in the design frame: skin, lining, torn ends (an edge, ribs and stringers where the skin is gone, a few
  // petals of skin peeled back), the floor, bulkheads ──
  function section(T, z0, z1, ends) {
    const dn = dent(ends.map((e) => e.z));
    const j0 = ends.find((e) => e.side < 0),
      j1 = ends.find((e) => e.side > 0);
    T.livery.push(skinGeo(z0, z1, { j0: j0?.j, j1: j1?.j, dent: dn, dz: 0.45 }));
    const l0 = j0 ? z0 : Math.max(z0, -14.75),
      l1 = j1 ? z1 : Math.min(z1, 11.85); // (the lining stops at the cockpit's and the aft galley's bulkheads)
    T.lining.push(
      skinGeo(l0, l1, {
        d: 0.1,
        j0: j0 && ((f) => j0.j(f) + 0.06),
        j1: j1 && ((f) => j1.j(f) - 0.06),
        dent: dn,
        dz: 0.5,
        na: 36,
      }),
    );
    for (const e of ends) {
      const zE = (f) => e.z + e.j(f),
        na = 40,
        pos = [],
        idx = [];
      for (let k = 0; k <= na; k++) {
        const f = (k / na) * TAU,
          z = zE(f),
          [ax, ay] = fpt(z, f, -dn(f, z)),
          [bx, by] = fpt(z - e.side * 0.06, f, 0.1 - dn(f, z));
        pos.push(ax, ay, z, bx, by, z - e.side * 0.06);
      }
      for (let k = 0; k < na; k++) {
        const a = k * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      const eg = new THREE.BufferGeometry();
      eg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      eg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
      eg.setIndex(idx);
      eg.computeVertexNormals();
      T.alu.push(eg);
      // the frames (ribs) the skin tore back from, and the stringers along them, bent where they broke
      const D = e.deep || 1.2;
      for (let m = 0; 0.25 + m * 0.53 < D + 0.3; m++) {
        const zf = e.z - e.side * (0.25 + m * 0.53),
          p = fprof(zf),
          hh = (p.top - p.bot) / 2;
        T.alu.push(
          new THREE.TorusGeometry(1, 0.03, 4, 40)
            .scale(p.hw - 0.05, hh - 0.05, 2)
            .translate(0, (p.top + p.bot) / 2, zf),
        );
      }
      for (let f = e.nf - e.nw * 0.85; f <= e.nf + e.nw * 0.85; f += 0.13) {
        const zA = e.z - e.side * (D + 0.4),
          zB = e.z + e.side * rr(-0.2, 0.45),
          [ax, ay] = fpt(zA, f, 0.05),
          [bx, by] = fpt(zB, f, 0.05 + rr(-0.25, 0.15));
        bar(T, 'alu', ax, ay, zA, bx, by, zB, 0.045);
      }
      for (let i = 0; i < 4; i++) {
        let f = rnd() * TAU;
        if (Math.abs(Math.atan2(Math.sin(f - e.nf), Math.cos(f - e.nf))) < e.nw * 1.2) f += Math.PI;
        const w = rr(0.18, 0.38),
          L = rr(0.4, 1.0),
          out = rr(0.25, 0.7);
        const zs = (ff) => zE(ff) - e.side * 0.05,
          pg = skinGeo(0, 1, { f0: f - w / 2, f1: f + w / 2, na: 4, dz: 0.25 }),
          p = pg.attributes.position; // (a petal: out past the tear, curling outward, narrowing)
        for (let k = 0; k < p.count; k++) {
          const s = Math.floor(k / 5) / 4,
            fk = f - w / 2 + (w * (k % 5)) / 4,
            fn = f + (fk - f) * (1 - 0.6 * s),
            z = zs(fn) + e.side * s * L,
            [px, py] = fpt(z, fn, -out * s * s);
          p.setXYZ(k, px, py, z);
          pg.attributes.uv.setXY(k, (z - FZ0) / 38, (((fn % TAU) + TAU) % TAU) / TAU);
        }
        pg.computeVertexNormals();
        T.livery.push(pg);
      }
      // the floor's beams stick out of the break, cables hang from the ceiling
      for (let x = -1.4; x <= 1.45; x += 0.7)
        if (rnd() < 0.75)
          bar(
            T,
            'alu',
            x,
            FLOOR - 0.12,
            e.z - e.side * 0.6,
            x + rr(-0.12, 0.12),
            FLOOR - 0.12 + rr(-0.25, 0.04),
            e.z + e.side * rr(-0.1, 0.3),
            0.06,
          );
      for (let i = 0; i < 5; i++) {
        const x = rr(-0.9, 0.9),
          zc = e.z - e.side * rr(0, 0.4),
          yb = rr(-0.1, 0.7);
        bar(T, 'dark', x, 1.5, zc, x + rr(-0.15, 0.15), yb, zc + e.side * rr(0, 0.3), 0.025);
      }
    }
    return T;
  }
  // the cabin's floor, seats, bins and ceiling panels between za and zb (design frame); o.left / o.right: rows still standing on that side
  function cabin(T, za, zb, o) {
    const half = (z, y, d) => {
      const p = fprof(z),
        hh = (p.top - p.bot) / 2 - d,
        r = (y - (p.top + p.bot) / 2) / hh;
      return Math.abs(r) >= 1 ? 0 : (p.hw - d) * Math.sqrt(1 - r * r);
    };
    for (let z = za; z < zb - 1e-6; z += 0.5) {
      const z2 = Math.min(zb, z + 0.5),
        w = Math.min(1.68, half(z2, FLOOR, 0.1), half(z, FLOOR, 0.1)) * 2,
        zc = (z + z2) / 2; // (the floor narrows with the body)
      T.carpet.push(new THREE.BoxGeometry(w, 0.08, z2 - z).translate(0, FLOOR - 0.04, zc));
      for (const x of [-1.32, -0.82, 0.82, 1.32])
        if (Math.abs(x) < w / 2 - 0.05)
          T.chrome.push(new THREE.BoxGeometry(0.04, 0.02, z2 - z).translate(x, FLOOR + 0.01, zc));
      if (half(zc, 1.47, 0.1) > 0.8) T.plastic.push(new THREE.BoxGeometry(1.5, 0.04, z2 - z).translate(0, 1.47, zc));
    }
    for (let z = za + 0.45; z < zb - 0.3; z += 0.79)
      for (const sx of [-1, 1]) {
        if (!(sx < 0 ? o.left : o.right)(z) || (z > -1.8 && z < -0.2 && o.exits) || half(z, 0.5, 0.1) < 1.72) continue;
        seatGeo(T, new THREE.Matrix4().makeTranslation(sx * 1.0, FLOOR, z));
      }
    for (let z = za + 0.6; z < zb - 0.6; z += 1.25)
      for (const sx of [-1, 1]) {
        const keep = (sx < 0 ? o.binL : o.binR)(z);
        if (!keep || half(z, 1.2, 0.1) < 1.47) continue;
        T.plastic.push(new THREE.BoxGeometry(0.5, 0.38, 1.2).rotateZ(sx * 0.25).translate(sx * 1.2, 1.17, z));
        if (keep === 2)
          T.plastic.push(
            new THREE.BoxGeometry(0.02, 0.4, 1.16)
              .translate(0, -0.2, 0)
              .rotateZ(-sx * 1.2)
              .translate(sx * 0.96, 1.0, z),
          );
      }
  } // (a bin hanging open)

  // ── where the pieces lie: the ground under the middle decides its tilt; the nose digs in, the tail rests slewed and rolled ──
  const gF = (ga(-1.6, -6) + ga(1.6, -6)) / 2,
    gB = (ga(-1.6, 6) + ga(1.6, 6)) / 2,
    gL = (ga(-1.6, -6) + ga(-1.6, 6)) / 2,
    gR = (ga(1.6, -6) + ga(1.6, 6)) / 2,
    gC = (gF + gB) / 2,
    cl = (v, m) => Math.max(-m, Math.min(m, v));
  const MM = pose(
    V(0, 0, -0.75),
    V(0, gC + FRY - 0.95, 0),
    0,
    -cl(Math.atan((gB - gF) / 12), 0.08),
    cl(Math.atan((gR - gL) / 3.2), 0.06),
  );
  const nPos = V(0.9, ga(0.9, -10.3) - 0.7, -10.3),
    nTip = ga(0.9 - 11 * Math.sin(0.17), -10.3 - 11 * Math.cos(0.17)),
    nPitch = -Math.asin(cl((nPos.y + 1.47 - (nTip - 0.75)) / 11, 0.3));
  const MN = pose(V(0, -FRY, -8), nPos, 0.17, Math.min(-0.05, nPitch), -0.09);
  const MT = pose(V(0, -FRY, 6.5), V(-1.3, ga(-1.3, 10.7) - 0.65, 10.7), -0.24, -0.03, 0.22);
  const breakA = wiggle(1.3),
    breakB = wiggle(4.1);
  // the nose: the cockpit (its door shut in the bulkhead), six rows behind it, torn off behind the front door
  {
    const T = part(),
      nn = notch(4.3, 0.55, 1.0);
    section(T, -18.98, -8, [{ z: -8, side: 1, j: (f) => breakA(f) - nn(f), nf: 4.3, nw: 0.55, deep: 1.0 }]);
    cabin(T, -13.7, -8.3, { left: () => true, right: () => true, binL: () => 1, binR: (z) => (z < -10 ? 1 : 2) });
    const p = fprof(-14.8),
      hh = (p.top - p.bot) / 2;
    T.plastic.push(
      new THREE.CircleGeometry(1, 28).scale(p.hw - 0.1, hh - 0.1, 1).translate(0, (p.top + p.bot) / 2, -14.78),
    );
    T.dark.push(new THREE.BoxGeometry(0.8, 1.9, 0.05).translate(0, FLOOR + 0.95, -14.74));
    T.plastic.push(
      new THREE.BoxGeometry(1.0, 1.9, 0.8).translate(1.2, FLOOR + 0.95, -14.3),
      new THREE.BoxGeometry(0.9, 1.9, 0.8).translate(-1.25, FLOOR + 0.95, -14.3),
    ); // (the galley and a lavatory)
    put(T, MN);
  }
  // the middle: the wing box, the right wing still on it, the left torn off at the root; seats on the left, the right side torn out
  {
    const T = part(),
      na = notch(5.4, 0.6, 1.5),
      nb = notch(0.95, 0.6, 1.6);
    section(T, -8, 6.5, [
      { z: -8, side: -1, j: (f) => breakA(f) + na(f), nf: 5.4, nw: 0.6, deep: 1.5 },
      { z: 6.5, side: 1, j: (f) => breakB(f) - nb(f), nf: 0.95, nw: 0.6, deep: 1.6 },
    ]);
    cabin(T, -7.75, 6.1, {
      left: (z) => z < 5.4,
      right: () => false,
      exits: true,
      binL: (z) => (Math.round(z * 7) % 3 === 0 ? 2 : 1),
      binR: (z) => (z < -5.5 ? 2 : 0),
    });
    // (the third row stood on end at 2.2 m, and the bin fallen at 3.3 m went through it: a critic saw a white wedge through the seats; places round 2)
    for (const [x, z, ry, rx, rz] of [
      [1.35, -4.4, 1.57, -1.5, 0],
      [1.4, -0.6, 1.5, 0, 0.25],
      [1.38, 1.8, 1.62, -1.45, 0.1],
    ])
      seatGeo(
        T,
        new THREE.Matrix4()
          .makeTranslation(x, FLOOR + 0.35, z)
          .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)))
          .multiply(new THREE.Matrix4().makeTranslation(0, -0.35, 0)),
      );
    for (const [x, z, rz] of [
      [1.35, -2.4, 0.4],
      [1.4, 3.3, -0.3],
      [1.3, -6.2, 0.15],
    ])
      T.plastic.push(
        new THREE.BoxGeometry(0.56, 0.4, 1.2)
          .rotateY(rr(-0.3, 0.3))
          .rotateZ(rz)
          .translate(x, FLOOR + 0.22, z),
      ); // (bins fallen from the right side)
    for (let z = -6.6; z < 5; z += rr(1.4, 3.2))
      for (let k = 0; k < 3; k++) {
        if (rnd() < 0.3) continue;
        const x = -1.05 + k * 0.5 + rr(-0.05, 0.05),
          L = rr(0.15, 0.45);
        T.bags.push(
          tint(new THREE.CylinderGeometry(0.006, 0.006, L, 3).translate(x, 0.75 - L / 2, z - 0.3), 0x8a8a84),
          tint(new THREE.BoxGeometry(0.1, 0.07, 0.08).translate(x, 0.75 - L - 0.03, z - 0.3), 0xf0c020),
        );
      } // (oxygen masks)
    for (let z = -6.8; z < 5.6; z += 0.9)
      if (rnd() < 0.7) T.glow.push(new THREE.BoxGeometry(0.03, 0.012, 0.35).translate(0.12, FLOOR + 0.006, z)); // (the emergency path lights, some still lit)
    // the wings' roots: the right wing whole to its tip (with its sharklet and flap fairings, the pylon torn where its engine fell),
    // the left a jagged stub with the spars sticking out
    const st = [1.6, 3.5, 6.3, 9.5, 13, 16.6].map(wingStation);
    T.wing.push(wingGeo(st, { caps: [st.length - 1] }));
    const tip = st.at(-1);
    T.wing.push(
      wingGeo(
        [0, 1.2, 2.3].map((h, i) => ({ x: h, y: 0, z: i * 0.75, c: [1.5, 1.0, 0.55][i], t: 0.09, v: h / 4 })),
        { sym: true, caps: [2] },
      )
        .rotateZ(Math.PI / 2 - 0.2)
        .translate(tip.x - 0.05, tip.y + 0.05, tip.z),
    );
    for (const x of [4.2, 8.6, 12.4]) {
      const q = wingStation(x);
      T.white.push(
        new THREE.CylinderGeometry(0.03, 0.24, 2.2, 8).rotateX(Math.PI / 2).translate(x, q.y - 0.24, q.z + q.c - 0.35),
      );
    }
    {
      const q = wingStation(5.75);
      T.white.push(new THREE.BoxGeometry(0.34, 0.55, 2.4).translate(5.75, q.y - 0.5, q.z + 0.6));
      for (let i = 0; i < 5; i++)
        bar(
          T,
          'iron',
          5.75 + rr(-0.15, 0.15),
          q.y - 0.75,
          q.z + rr(-0.4, 1.6),
          5.75 + rr(-0.3, 0.3),
          q.y - rr(0.95, 1.3),
          q.z + rr(-0.6, 1.8),
          0.05,
        );
    }
    const sl = [-1.6, -2.6, -3.7].map(wingStation);
    T.wing.push(wingGeo(sl, {}));
    T.dark.push(
      wingGeo(
        [
          { ...sl.at(-1), x: -3.62, t: 0.13 },
          { ...sl.at(-1), x: -3.6, t: 0.13 },
        ],
        { caps: [0] },
      ),
    );
    {
      const q = sl.at(-1);
      for (const s of [0.15, 0.62])
        for (let k = 0; k < 3; k++)
          bar(
            T,
            'iron',
            -3.4,
            q.y + rr(-0.25, 0.25),
            q.z + s * q.c,
            -3.6 - rr(0.3, 1.0),
            q.y + rr(-0.3, 0.3),
            q.z + s * q.c + rr(-0.2, 0.2),
            0.08,
          );
    }
    put(T, MM);
  }
  // the tail: slewed off the furrow and rolled onto its side, the fin leaning; the aft galley closes it, a few rows before that
  {
    const T = part(),
      nc = notch(1.5, 0.5, 1.0);
    section(T, 6.5, 18.98, [{ z: 6.5, side: -1, j: (f) => breakB(f) + nc(f), nf: 1.5, nw: 0.5, deep: 1.0 }]);
    cabin(T, 6.9, 11.8, { left: (z) => z < 10.2, right: (z) => z < 10.2, binL: () => 1, binR: () => 1 });
    const p = fprof(11.85),
      hh = (p.top - p.bot) / 2;
    T.plastic.push(
      new THREE.CircleGeometry(1, 28).scale(p.hw - 0.1, hh - 0.1, 1).translate(0, (p.top + p.bot) / 2, 11.85),
    );
    for (let k = 0; k < 3; k++)
      T.chrome.push(new THREE.BoxGeometry(0.32, 1.0, 0.8).translate(-0.6 + k * 0.4, FLOOR + 0.5, 11.4)); // (the galley's carts)
    T.dark.push(
      new THREE.CircleGeometry(0.22, 12)
        .translate(0, 0, 18.99)
        .translate(0, (fprof(18.99).top + fprof(18.99).bot) / 2, 0),
    ); // (the APU's exhaust)
    // the fin, swept and tall (6 m over the body), and the stabilisers
    for (const fg of [
      wingGeo(
        [0, 3.4, 6.8].map((h) => ({ x: h, y: 0, z: 11.4 + h * 0.74, c: 5.8 - h * 0.56, t: 0.1, v: 0 })),
        { sym: true, caps: [2] },
      ),
      wingGeo(
        [
          { x: 0, y: 0, z: 9.3, c: 2.6, t: 0.08 },
          { x: 1.05, y: 0, z: 12.1, c: 0.1, t: 0.08 },
        ],
        { sym: true },
      ),
    ]) {
      // the fin and its dorsal fillet
      fg.rotateZ(Math.PI / 2).translate(0, 1.2, 0);
      const p2 = fg.attributes.position,
        u = fg.attributes.uv;
      for (let i = 0; i < p2.count; i++) u.setXY(i, (p2.getZ(i) - 11.4) / 6.8, (p2.getY(i) - 1.2) / 6.8);
      T.fin.push(fg);
    }
    const sc = fprof(15.2),
      sy = (sc.top + sc.bot) / 2;
    for (const sx of [-1, 1]) {
      const hs = [0.25, 3.2, 6.25].map((x) => ({
          x: sx * x,
          y: sy + x * 0.1,
          z: 14.3 + x * 0.55,
          c: 3.4 - x * 0.34,
          t: 0.1,
          v: x / 4,
        })),
        gq = wingGeo(hs, { caps: [2] });
      T.wing.push(gq);
    }
    put(T, MT);
  }

  // ── the left wing, torn off, lying propped on its own engine with its tip in the sand and its torn root up in the air ──
  {
    const T = part(),
      st = [-3.75, -6.3, -9.5, -13, -16.6].map(wingStation);
    T.wing.push(wingGeo(st, { caps: [st.length - 1] }));
    T.dark.push(
      wingGeo(
        [
          { ...st[0], x: -3.8 },
          { ...st[0], x: -3.78 },
        ],
        { caps: [0] },
      ),
    );
    const tip = st.at(-1);
    T.wing.push(
      wingGeo(
        [0, 1.2, 2.3].map((h, i) => ({ x: h, y: 0, z: i * 0.75, c: [1.5, 1.0, 0.55][i], t: 0.09, v: 0 })),
        { sym: true, caps: [2] },
      )
        .rotateZ(Math.PI / 2 + 0.2)
        .translate(tip.x + 0.05, tip.y + 0.05, tip.z),
    );
    for (const x of [-8.6, -12.4]) {
      const q = wingStation(x);
      T.white.push(
        new THREE.CylinderGeometry(0.03, 0.24, 2.2, 8).rotateX(Math.PI / 2).translate(x, q.y - 0.24, q.z + q.c - 0.35),
      );
    }
    {
      const q = st[0];
      for (const s of [0.15, 0.62])
        for (let k = 0; k < 3; k++)
          bar(
            T,
            'iron',
            -3.95,
            q.y + rr(-0.3, 0.3),
            q.z + s * q.c,
            -3.5 + rr(0.0, 0.9),
            q.y + rr(-0.4, 0.4),
            q.z + s * q.c + rr(-0.3, 0.3),
            0.08,
          );
      for (let i = 0; i < 6; i++)
        bar(
          T,
          'dark',
          -3.8,
          q.y + rr(-0.2, 0.2),
          q.z + rr(0.5, 4),
          -3.6 + rr(-0.2, 0.3),
          q.y - rr(0.4, 1.4),
          q.z + rr(0.5, 4),
          0.03,
        );
    }
    const qe = wingStation(-5.75),
      E = { x: -5.75, y: qe.y - 1.62, z: qe.z - 2.3 },
      ET = part();
    engineGeo(ET);
    pylonGeo(ET);
    const ME = new THREE.Matrix4().makeTranslation(E.x, E.y, E.z);
    for (const k in ET) for (const q of ET[k]) T[k].push(q.applyMatrix4(ME));
    // propped: turned about the engine's bottom so the tip comes down to the sand, then slewed round and laid out to the left
    const c = V(E.x, E.y - 1.1, E.z + 1.6),
      tipLow = V(tip.x, tip.y - 0.1, tip.z + tip.c * 0.4),
      dx = tipLow.x - c.x,
      dy = tipLow.y - c.y,
      Rr = Math.hypot(dx, dy),
      yaw = 0.93,
      lx = -9.6,
      lz = -3.4;
    const gE = ga(lx, lz) - 0.35,
      roll0 = Math.PI - Math.atan2(dy, dx),
      guess = at(pose(c, V(lx, gE, lz), yaw, 0, roll0), tipLow.x, tipLow.y, tipLow.z),
      gT2 = ga(guess.x, guess.z) - 0.2;
    const roll = Math.PI - Math.asin(cl((gT2 - gE) / Rr, 0.9)) - Math.atan2(dy, dx);
    const MW = pose(c, V(lx, gE, lz), yaw, 0, roll);
    put(T, MW);
    const Pw = (x, y, z) => at(MW, x, y, z);
    b.lwing = {
      tip: Pw(tip.x, tip.y, tip.z + tip.c / 2),
      root: Pw(st[0].x, st[0].y, st[0].z + st[0].c / 2),
      eng: Pw(E.x, E.y, E.z + 1.6),
    };
    // colliders: the engine, and the wing's planform wherever its underside is lower than a head
    {
      const e0 = Pw(E.x, E.y, E.z),
        e1 = Pw(E.x, E.y, E.z + 3.6);
      collideRun(b, e0.x, e0.z, e1.x, e1.z, 1.05, () => Math.max(e0.y, e1.y) + 1.1);
      earthMound(e0.x, e0.z, 2.2, 0.7, 1.6, -yaw, 0.2);
    }
    for (let x = -4; x > -16.6; x -= 0.9) {
      const q = wingStation(x),
        n = Math.ceil(q.c / 1.5);
      for (let i = 0; i < n; i++) {
        const s = (i + 0.5) / n,
          p = Pw(x, q.y, q.z + s * q.c),
          under = p.y - 0.35 * q.t * q.c - ga(p.x, p.z);
        if (under < 1.9) post(p.x, p.z, Math.max(0.45, q.c / n / 2 + 0.05), p.y + 0.4 * q.t * q.c, p.y + 0.1);
      }
    }
    earthMound(b.lwing.tip.x, b.lwing.tip.z, 1.6, 0.45, 1.2, 0.3, 0.1);
  }
  // ── the right engine, fallen off, lying on its side ahead of the right wing with a scrap of its pylon ──
  {
    const T = part();
    engineGeo(T);
    pylonGeo(T, 0.55);
    for (let i = 0; i < 5; i++)
      bar(T, 'iron', rr(-0.15, 0.15), 1.6, rr(1.2, 2.6), rr(-0.3, 0.3), rr(1.9, 2.4), rr(1.0, 2.8), 0.05);
    const ex = 8.6,
      ez = -9.4,
      M = pose(V(0, 0, 1.7), V(ex, ga(ex, ez) + 0.75, ez), 0.55, 0.06, 1.25);
    put(T, M);
    const a0 = at(M, 0, 0, 0),
      a1 = at(M, 0, 0, 3.6);
    collideRun(b, a0.x, a0.z, a1.x, a1.z, 1.05, () => a0.y + 1.1);
    earthMound(a0.x - 0.4, a0.z - 0.9, 1.8, 0.6, 1.4, 0.4, 0.2);
  }

  // ── the ground: the furrow it ploughed (dark earth between two berms), mounds where the nose dug in and along the middle, soot ──
  {
    const n = 40,
      cxAt = (z) => -1.2 + 1.4 * Math.sin((z - 8) / 30),
      strip = (X, Hh, lift, z0) => {
        const pts = [],
          uv = [],
          idx = [],
          m = X.length;
        for (let i = 0; i <= n; i++) {
          const z = z0 + (i * (76 - z0)) / n,
            f = 1 - i / n,
            rise = Math.min(1, Math.max(0, (z - z0) / 6)),
            cx = cxAt(z);
          for (let k = 0; k < m; k++) {
            const x = cx + X[k] * (0.2 + 0.8 * f);
            pts.push(x, ga(x, z) + Hh[k] * (0.3 + 0.7 * f) * rise + lift, z);
            uv.push(k / (m - 1), z / 9);
          }
        }
        for (let i = 0; i < n; i++)
          for (let k = 0; k < m - 1; k++) {
            const a = i * m + k,
              c2 = a + m;
            idx.push(a, c2, a + 1, a + 1, c2, c2 + 1);
          }
        const fg = new THREE.BufferGeometry();
        fg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        fg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        fg.setIndex(idx);
        fg.computeVertexNormals();
        return fg;
      };
    for (const s of [-1, 1])
      P.earth.push(
        strip(
          [4.9, 4.1, 3.4, 2.7, 2.2].map((v) => v * s),
          [0, 0.22, 0.4, 0.22, 0],
          0.02,
          9,
        ),
      ); // (the berms it threw up)
    const gm = new THREE.Mesh(strip([-3.2, -1.6, 0, 1.6, 3.2], [0.1, 0.03, 0.02, 0.03, 0.1], 0.08, -6), MAT.gouge);
    gm.receiveShadow = true;
    gm.renderOrder = 1;
    b.group.add(gm);
  }
  for (const s of [-1, 1]) earthMound(s * 3.0, 0.5, 1.6, 0.6, 8, 0, 0.1); // (berms along the middle where it settled)
  const nose = at(MN, 0, -0.55, -18.9);
  earthMound(nose.x - Math.sin(0.17) * 0.8, nose.z - Math.cos(0.17) * 0.8, 3.4, 1.5, 2.6, 0.17, 0.2);
  earthMound(nose.x + 2.4, nose.z + 1.5, 1.6, 0.7, 2.2, 0.5, 0.1);
  earthMound(nose.x - 2.3, nose.z + 1.2, 1.5, 0.6, 2.0, -0.3, 0.1);
  const tf = at(MT, 0, -FRY, 6.6);
  earthMound(tf.x, tf.z - 1.2, 2.6, 0.55, 1.2, -0.24, 0.1);
  for (const [x, z, w, d] of [
    [-3.6, 0, 7, 11],
    [0.6, -9, 6, 5],
    [-0.6, 9, 6, 6],
    [b.lwing.eng.x, b.lwing.eng.z, 9, 9],
    [-1.5, 20, 6, 9],
    [-0.5, 33, 5, 8],
    [7, -8.5, 6, 5],
  ])
    sootAt(x, z, w, d, rnd() * 3);

  // ── the debris field, thinning out back along the furrow: seats, luggage burst open, torn panels of skin, a main wheel set ──
  const strewn = (x, z) => [x, z, ga(x, z)];
  for (const [x, z] of [
    [4.2, 13.5],
    [-5.4, 16],
    [2.2, 24],
    [-3.8, 29],
    [5.6, -4],
  ]) {
    const [, , y] = strewn(x, z),
      M = new THREE.Matrix4()
        .makeTranslation(x, y + 0.25, z)
        .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rr(-1.5, 1.5), rr(0, TAU), rr(-1.6, 1.6))));
    const T = part();
    seatGeo(T, M.multiply(new THREE.Matrix4().makeTranslation(0, -0.35, 0)));
    put(T);
  }
  const bagCols = [0x23293a, 0x5a2420, 0x1a1a1c, 0x3e4430, 0x55585c, 0x7a6040, 0x24474f];
  for (let i = 0; i < 16; i++) {
    const a = rr(0, TAU),
      r = rr(5, 26),
      x = Math.cos(a) * r * 0.6 + (i % 2 ? 3 : -3),
      z = Math.abs(Math.sin(a)) * r + 4,
      y = ga(x, z),
      w = rr(0.38, 0.55),
      h = rr(0.55, 0.78),
      t = rr(0.2, 0.3),
      ry = rr(0, TAU),
      lay = rnd() < 0.7;
    P.bags.push(
      tint(
        new THREE.BoxGeometry(w, lay ? t : h, lay ? h : t).rotateY(ry).translate(x, y + (lay ? t : h) / 2 - 0.03, z),
        bagCols[i % 7],
      ),
      tint(
        new THREE.BoxGeometry(0.16, 0.04, 0.03)
          .translate(0, lay ? t / 2 + 0.02 : h / 2 + 0.02, lay ? h * 0.3 : 0)
          .rotateY(ry)
          .translate(x, y + (lay ? t : h) / 2 - 0.03, z),
        0x101012,
      ),
    );
    if (rnd() < 0.4)
      for (let k = 0; k < 3; k++)
        P.bags.push(
          tint(
            new THREE.BoxGeometry(rr(0.2, 0.5), 0.04, rr(0.2, 0.5))
              .rotateY(rr(0, 3))
              .translate(x + rr(-0.8, 0.8), y + 0.03, z + rr(-0.8, 0.8)),
            [0x7a3a30, 0xb8b09c, 0x34465e, 0x4a5a40][(k + i) & 3],
          ),
        );
  } // (clothes spilled from it)
  for (let i = 0; i < 9; i++) {
    const za = rr(-12, 14),
      fa = rr(0, TAU),
      x = (i % 2 ? 1 : -1) * rr(4, 12),
      z = rr(-6, 34),
      y = ga(x, z),
      pg = skinGeo(za, za + rr(0.8, 2.2), { f0: fa, f1: fa + rr(0.4, 1.1), na: 6, dz: 0.4 });
    pg.translate(0, -FRY + 0.2, -za)
      .applyMatrix4(
        new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rr(-0.4, 0.4), rr(0, TAU), Math.PI + rr(-0.5, 0.5))),
      )
      .translate(x, y + rr(0.05, 0.3), z);
    P.livery.push(pg);
  }
  {
    const x = 3.6,
      z = 18.5,
      y = ga(x, z),
      T = part(),
      M = pose(V(0, 0, 0), V(x, y + 0.5, z), 0.6, 0, 1.45); // the main gear: a strut, its torque links and two wheels, lying on its side
    for (const s of [-1, 1]) {
      T.rubber.push(new THREE.TorusGeometry(0.42, 0.2, 10, 24).rotateY(Math.PI / 2).translate(s * 0.42, 0, 0));
      T.chrome.push(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 16).rotateZ(Math.PI / 2).translate(s * 0.42, 0, 0));
    }
    T.chrome.push(
      new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8).rotateZ(Math.PI / 2),
      new THREE.CylinderGeometry(0.12, 0.14, 2.0, 10).translate(0, 1.0, 0),
    );
    bar(T, 'chrome', 0, 0.3, 0.1, 0, 1.1, 0.35, 0.06);
    bar(T, 'iron', 0, 2.0, 0, 0.2, 2.5, 0.3, 0.1);
    put(T, M);
    collideRun(b, x, z, x, z, 0.75, () => y + 0.9);
  }

  // ── inside the middle: walls along both sides (open at the breaks), the left's seat rows, the floor and the torn panels ramping down ──
  const fl0 = at(MM, 0, FLOOR, -0.75),
    flz = at(MM, 0, FLOOR, 5.25),
    flx = at(MM, 1, FLOOR, -0.75),
    sZ = (flz.y - fl0.y) / (flz.z - fl0.z),
    sX = (flx.y - fl0.y) / (flx.x - fl0.x);
  const floorAt = (lx, lz) => fl0.y + (lz - fl0.z) * sZ + (lx - fl0.x) * sX,
    top = at(MM, 0, FRY, -0.75).y,
    Z0 = -7.0,
    Z1 = 6.85,
    RL = 1.9;
  for (const sx of [-1, 1]) collideRun(b, sx * 1.8, Z0 + 0.1, sx * 1.8, Z1 - 0.15, 0.3, () => top);
  collideRun(b, -0.42, -6.6, -0.42, 5.4, 0.26, (lx, lz) => floorAt(lx, lz) + 1.15);
  for (const [z, d] of [
    [Z0, -1],
    [Z1, 1],
  ]) {
    const y0 = floorAt(0.7, z),
      y1 = ga(0.7, z + d * RL) + 0.02;
    box(
      P,
      'alu',
      1.3,
      0.05,
      Math.hypot(RL, y0 - y1) + 0.1,
      0.7,
      (y0 + y1) / 2 - 0.02,
      z + (d * RL) / 2,
      0,
      d * Math.atan2(y0 - y1, RL),
    );
    box(
      P,
      'carpet',
      1.1,
      0.02,
      RL * 0.7,
      0.6 + rr(-0.1, 0.1),
      y0 * 0.65 + y1 * 0.35 + 0.01,
      z + d * RL * 0.35,
      rr(-0.1, 0.1),
      d * Math.atan2(y0 - y1, RL),
    );
  }
  // under the floor's open ends, all the way across (the ramp too): on a slope the floor stands a metre over the ground there, and a walker
  // went in under it (the quality pass, round 3: storm-heron-59's plane moved onto a hillside when its ponds moved, and the barge check walked
  // under it). 0.9 m in from the end, under the floor where nobody sees them: a walker on the ground (its body 0.45 m wider than a post) stops at
  // the floor's end, and one up the ramp meets them only once it stands on the floor 0.15 m in, their top a little under the floor there
  for (const [z, d] of [
    [Z0, -1],
    [Z1, 1],
  ])
    for (let lx = -1.5; lx < 1.6; lx += 0.35) {
      const f = floorAt(lx, z),
        t = Math.min(floorAt(lx, z - d * 0.9), floorAt(lx, z - d * 0.15)) - 0.03;
      if (f - ga(lx, z + d * 0.3) > 0.45) post(lx, z - d * 0.9, 0.3, t, t);
    }
  // the wing's top is a floor too (up from its root, out to the tip); a chain of posts holds the planform where it is low
  const MMi = MM.clone().invert(),
    wTop = (lx, lz) => {
      const d = V(lx, fl0.y + 1, lz).applyMatrix4(MMi),
        a = Math.abs(d.x);
      if (a < 1.9 || a > 16.5 || (d.x < 0 && a > 3.6)) return null;
      const q = wingStation(d.x),
        s = (d.z - q.z) / q.c;
      if (s < 0.01 || s > 0.99) return null;
      return at(MM, d.x, wingTopAt(q, s), d.z).y;
    };
  surface(b, (lx, lz) => {
    let h = null;
    if (Math.abs(lx) <= 1.7 && lz >= Z0 && lz <= Z1) h = floorAt(lx, lz);
    for (const [z, d] of [
      [Z0, -1],
      [Z1, 1],
    ])
      if (Math.abs(lx - 0.7) <= 0.65 && (lz - z) * d >= 0 && (lz - z) * d <= RL) {
        const t = ((lz - z) * d) / RL;
        h = Math.max(h ?? -1e9, floorAt(0.7, z) * (1 - t) + (ga(lx, lz) + 0.02) * t);
      }
    const w = wTop(lx, lz);
    return w != null ? Math.max(h ?? -1e9, w) : h;
  });
  for (const sx of [1, -1])
    for (let x = 2.3; x < (sx > 0 ? 16.5 : 3.7); x += 0.85) {
      const q = wingStation(sx * x),
        n = Math.ceil(q.c / 1.5);
      for (let i = 0; i < n; i++) {
        const s = (i + 0.5) / n,
          p = at(MM, sx * x, q.y, q.z + s * q.c),
          lowTop = Math.min(at(MM, sx * x, wingTopAt(q, 0.02), q.z).y, at(MM, sx * x, wingTopAt(q, 0.97), q.z + q.c).y);
        if (p.y - 0.35 * q.t * q.c - ga(p.x, p.z) < 1.9)
          post(p.x, p.z, Math.min(0.9, q.c / n / 2 + 0.05), lowTop + 0.3, lowTop - 0.3);
      }
    } // (stand well under the skin: a foot on the wing is never pushed off it)
  // the nose and the tail: closed all round (their insides are seen through the breaks, not walked)
  const ring = (M, za, zb, step = 0.9) => {
    const pts = [];
    for (let z = za; z <= zb + 1e-6; z += step) pts.push([fprof(z).hw - 0.15, z]);
    for (let i = pts.length - 1; i >= 0; i--) pts.push([-pts[i][0], pts[i][1]]);
    pts.push(pts[0]);
    for (let i = 0; i < pts.length - 1; i++) {
      const p = at(M, pts[i][0], 0, pts[i][1]),
        q = at(M, pts[i + 1][0], 0, pts[i + 1][1]);
      const tp = Math.max(at(M, pts[i][0], fprof(pts[i][1]).top, pts[i][1]).y, ga(p.x, p.z) + 0.6);
      collideRun(b, p.x, p.z, q.x, q.z, 0.3, () => tp);
    }
  };
  ring(MN, -18.4, -8.1);
  ring(MT, 6.6, 18.4);
  for (const sx of [-1, 1])
    for (let x = 1.2; x < 6.3; x += 0.8) {
      const z = 14.3 + x * 0.55 + (3.4 - x * 0.34) / 2,
        p = at(MT, sx * x, (fprof(15.2).top + fprof(15.2).bot) / 2 + x * 0.1, z); // (a stabiliser rolled down to head height)
      if (p.y - ga(p.x, p.z) < 2.0) post(p.x, p.z, 0.55, p.y + 0.15, p.y - 0.3);
    }
  // the third-person cut-away covers the middle's cabin; the crate is near the back, seen from the rear break
  b.roofBox = { cz: (Z0 + Z1) / 2, w: 3.3, d: Z1 - Z0 };
  b.h = top - b.y - 0.1; // (inside the walls only: one on the wing's root by the body is not inside)
  cache(b, g, 0.75, 4.7, b.place, { k: 3, ammo: 9, y: floorAt(0.75, 4.7) });
}
const PLANE_KEYS = [
  'livery',
  'lining',
  'wing',
  'fin',
  'nacelle',
  'dark',
  'chrome',
  'white',
  'rubber',
  'plastic',
  'bags',
  'alu',
]; // (the plane's own materials, which keep their own uv)

// for the other parts of the split (src/buildings.js, src/interiors.js, src/places/)
export { TAU, buildPlane, PLANE_KEYS };
