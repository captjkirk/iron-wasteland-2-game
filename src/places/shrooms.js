// The mushroom ring (slice 23, #52): its seven giant caps, their materials and the fairy ring round it. Moved here
// unchanged from src/buildings.js (the code cleanup, November 16, 2026); buildings.js still exports all of it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../noise.js';
import { groundY } from '../world.js';
import { toW } from '../plan.js';
import { mushroomParts } from '../landmarks.js';
import { addCollider } from '../props.js';
import { canvasTex, glowcapParts } from '../propmodels.js';
import { cache, UP } from '../buildings.js';
import { TAU } from './plane.js';

// the mushroom ring: seven giant caps in a ring, each 0.9 m higher than the last (a spiral stair you climb cap to cap, 1.5 m
// to 6.9 m), round a clearing where a spore cloud hangs; the rare loot is on the middle cap, a jump down from the top step.
// Slice 23 polish (Jared, November 14, 2026: the same scale and detail check as the plane; a critic: the ring and the stair did
// not read, a purple mass with no glow): the ring is its own species, not the Hollow's purple: dark caps flattened into treads
// whose rims and warts glow spore-green (each step's edge is lit), lime gills, roots and bracket fungi on the stems, an even gap
// between every two caps; a fairy ring of glowcaps round it; a column of spores turning over the clearing, seen from outside;
// a gold glow over the crate until it is searched
let SHROOM = null,
  RINGM = null;
function ringMats() {
  if (RINGM) return RINGM;
  const capTex = (glow) =>
    canvasTex(
      512,
      512,
      (x, w, h) => {
        const r = mulberry32(77),
          c = w / 2;
        if (glow) {
          x.fillStyle = '#000000';
          x.fillRect(0, 0, w, h);
        } else {
          const g = x.createRadialGradient(c, c, 0, c, c, c);
          g.addColorStop(0, '#140f24');
          g.addColorStop(0.5, '#1b2838');
          g.addColorStop(0.84, '#234640');
          g.addColorStop(1, '#16302c');
          x.fillStyle = g;
          x.fillRect(0, 0, w, h);
        }
        for (let i = 0; i < 120; i++) {
          const a = r() * TAU,
            d = Math.sqrt(r()) * c,
            px = c + Math.cos(a) * d,
            py = c + Math.sin(a) * d,
            s = 18 + r() * 40;
          if (glow) continue; // darker mottling
          const m = x.createRadialGradient(px, py, 0, px, py, s);
          m.addColorStop(0, 'rgba(4,8,14,0.3)');
          m.addColorStop(1, 'rgba(4,8,14,0)');
          x.fillStyle = m;
          x.fillRect(px - s, py - s, s * 2, s * 2);
        }
        // the rim's glowing band, the tread's edge (the cap's uv runs out from its crown: the rim is at about 0.9 of the radius)
        const band = x.createRadialGradient(c, c, c * 0.76, c, c, c);
        band.addColorStop(0, 'rgba(150,255,120,0)');
        band.addColorStop(0.6, `rgba(176,255,140,${glow ? 1 : 0.6})`);
        band.addColorStop(0.8, `rgba(120,230,110,${glow ? 0.5 : 0.35})`);
        band.addColorStop(1, 'rgba(40,120,70,0)');
        x.fillStyle = band;
        x.fillRect(0, 0, w, h);
        for (let i = 0; i < 300; i++) {
          const a = r() * TAU,
            d = Math.pow(r(), 0.6) * c * 0.86,
            px = c + Math.cos(a) * d,
            py = c + Math.sin(a) * d,
            s = 1.5 + r() * r() * 11,
            al = 0.5 + r() * 0.5; // glowing warts, more toward the rim
          const m = x.createRadialGradient(px, py, 0, px, py, s);
          m.addColorStop(0, `rgba(214,255,176,${al})`);
          m.addColorStop(0.6, `rgba(150,240,120,${al * 0.7})`);
          m.addColorStop(1, 'rgba(120,220,100,0)');
          x.fillStyle = m;
          x.beginPath();
          x.arc(px, py, s, 0, TAU);
          x.fill();
        }
        for (let i = 0; i < 180; i++) {
          const a = r() * TAU,
            r0 = c * (0.93 + r() * 0.06),
            r1 = r0 - 10 - r() * 34;
          if (glow) continue; // fine dark ribs at the edge
          x.strokeStyle = `rgba(6,10,14,${0.2 + r() * 0.3})`;
          x.lineWidth = 0.8 + r() * 1.4;
          x.beginPath();
          x.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
          x.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
          x.stroke();
        }
      },
      glow ? '#000000' : '#16302c',
    );
  const dot = canvasTex(
    64,
    64,
    (x, w) => {
      const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, w);
    },
    '#ffffff',
  );
  // a soft upward fade with streaks (the spore column's sleeve, the crate's glow)
  const shaft = canvasTex(
    128,
    256,
    (x, w, h) => {
      const r = mulberry32(5);
      for (let i = 0; i < 60; i++) {
        const px = r() * w,
          wd = 3 + r() * 12,
          g = x.createLinearGradient(0, h, 0, h * (0.05 + r() * 0.5));
        g.addColorStop(0, `rgba(255,255,255,${0.06 + r() * 0.3})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g;
        for (const o of [0, w, -w]) x.fillRect(px - wd / 2 + o, 0, wd, h);
      }
      const f = x.createLinearGradient(0, h, 0, 0);
      f.addColorStop(0, 'rgba(255,255,255,0.22)');
      f.addColorStop(0.45, 'rgba(255,255,255,0.08)');
      f.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = f;
      x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'destination-in';
      const e = x.createLinearGradient(0, h, 0, 0);
      e.addColorStop(0, 'rgba(0,0,0,0)');
      e.addColorStop(0.12, 'rgba(0,0,0,1)');
      e.addColorStop(0.6, 'rgba(0,0,0,0.7)');
      e.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = e;
      x.fillRect(0, 0, w, h);
    },
    '#ffffff',
  );
  const gill = SHROOM.parts[2].mat.clone();
  gill.emissive.set(0xb4ff8c);
  gill.emissiveIntensity = 2.6;
  const glow = (color, opacity) =>
    new THREE.MeshBasicMaterial({
      map: shaft,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
  return (RINGM = {
    cap: new THREE.MeshStandardMaterial({
      map: capTex(false),
      emissive: 0xffffff,
      emissiveMap: capTex(true),
      emissiveIntensity: 1.2,
      roughness: 0.5,
    }),
    gill,
    shelf: new THREE.MeshStandardMaterial({ color: 0xb4946a, roughness: 0.85 }),
    spore: new THREE.PointsMaterial({
      map: dot,
      color: 0xa8ff86,
      size: 4,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    shaft: glow(0x8cff6a, 0.32),
    beam: glow(0xffc860, 0.7),
  });
}
// a root or a tapering bar along points (thick at the first, a quarter of it at the last)
function taper(pts, r0, T = 8, S = 5) {
  const cv = new THREE.CatmullRomCurve3(pts),
    g = new THREE.TubeGeometry(cv, T, r0, S, false),
    p = g.attributes.position,
    v = new THREE.Vector3();
  for (let i = 0; i <= T; i++) {
    const c = cv.getPointAt(i / T),
      k = 1 - (0.75 * i) / T;
    for (let j = 0; j <= S; j++) {
      const q = i * (S + 1) + j;
      v.fromBufferAttribute(p, q).sub(c).multiplyScalar(k).add(c);
      p.setXYZ(q, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}
const shade = (g, k) =>
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(k), 3));
function buildShrooms(b, P, g) {
  if (!SHROOM) {
    SHROOM = mushroomParts(1);
    const bb = new THREE.Box3().setFromBufferAttribute(SHROOM.parts[1].geo.attributes.position);
    SHROOM.top = bb.max.y;
    SHROOM.R = (bb.max.x - bb.min.x + bb.max.z - bb.min.z) / 4;
    SHROOM.c = bb.getCenter(new THREE.Vector3());
  }
  const M = ringMats(),
    rnd = mulberry32(Math.round(b.x * 31 + b.z * 17) + 52),
    G = { body: [], cap: [], under: [], shelf: [] },
    m4 = new THREE.Matrix4(),
    q4 = new THREE.Quaternion(),
    V = new THREE.Vector3();
  // one giant: its cap's middle at (lx, lz), its tread's top h over the ground at the ring's middle (at least 1.2 m over its own), its
  // cap rc wide; the unit model's cap is flattened (0.58 of its width's scale) so its top reads as a tread, the stem thickened
  const giant = (lx, lz, h, rc, ry) => {
    const [x, z] = toW(b, lx, lz),
      y = groundY(x, z),
      top = Math.max(y + 1.2, b.y + h),
      s = rc / SHROOM.R,
      sc = s * 0.58,
      ss = s * 1.2;
    q4.setFromAxisAngle(UP, ry);
    const o = V.set(SHROOM.c.x * s, 0, SHROOM.c.z * s).applyQuaternion(q4),
      bx = x - o.x,
      bz = z - o.z,
      y0 = top - SHROOM.top * sc,
      base = Math.min(groundY(bx, bz), y) - 0.05;
    G.cap.push(
      SHROOM.parts[1].geo
        .clone()
        .applyMatrix4(m4.compose(new THREE.Vector3(bx, y0, bz), q4, new THREE.Vector3(s, sc, s))),
    );
    G.under.push(SHROOM.parts[2].geo.clone().applyMatrix4(m4));
    G.body.push(
      SHROOM.parts[0].geo
        .clone()
        .applyMatrix4(
          m4.compose(
            new THREE.Vector3(bx, base, bz),
            q4,
            new THREE.Vector3(ss, (y0 - base + 0.85 * sc + 0.05) / 0.862, ss),
          ),
        ),
    );
    // roots spread from the swollen foot into the ground
    for (let k = 0, nr = 4 + Math.floor(rnd() * 4); k < nr; k++) {
      const a = ry + ((k + rnd() * 0.7) / nr) * TAU,
        L = 0.9 + rnd() * 1.6,
        bend = (rnd() - 0.5) * 0.9,
        pt = (d, up) => {
          const aa = a + (bend * d) / (L + 0.6),
            px = bx + Math.cos(aa) * d,
            pz = bz + Math.sin(aa) * d;
          return new THREE.Vector3(px, groundY(px, pz) + up, pz);
        };
      G.body.push(
        shade(
          taper(
            [pt(0.4, 0.42 + rnd() * 0.25), pt(0.8, 0.22), pt(0.4 + L * 0.6, 0.06 + rnd() * 0.08), pt(0.45 + L, -0.16)],
            0.15 + rnd() * 0.08,
          ),
          0.55 + rnd() * 0.12,
        ),
      );
    }
    // bracket fungi in tiers up the stem (the stem leans 0.084 of the unit model's height toward 2.2 rad, turned with the giant)
    const lean = new THREE.Vector3(Math.cos(2.2), 0, Math.sin(2.2)).applyQuaternion(q4),
      hs = y0 + 0.75 * sc - base;
    for (let k = 0; k < (hs > 3 ? 3 : 1); k++) {
      const a = rnd() * TAU,
        t = 0.28 + k * 0.2 + rnd() * 0.08,
        sx = bx + (lean.x * 0.48 * t * t * ss) / 5.6,
        sz = bz + (lean.z * 0.48 * t * t * ss) / 5.6,
        sr = (0.46 * ss) / 5.6;
      for (let j = 0; j < 3; j++) {
        const rb = (0.4 + rnd() * 0.25) * (1 - j * 0.22),
          aj = a + (rnd() - 0.5) * 0.4;
        G.shelf.push(
          new THREE.CylinderGeometry(rb, rb * 0.75, 0.1, 10, 1, false, -Math.PI / 2, Math.PI)
            .scale(0.8, 1, 1.1)
            .rotateX(-0.1)
            .rotateY(Math.atan2(Math.cos(aj), Math.sin(aj)))
            .translate(sx + Math.cos(aj) * sr * 0.8, base + hs * t + j * 0.2, sz + Math.sin(aj) * sr * 0.8),
        );
      }
    }
    Object.assign(addCollider(x, z, rc * 0.97, b), { vr: 0, top, stand: top });
    return top;
  };
  // the ring, 7.8 m out, an even 0.8 m between every two caps (a jump and a climb from each to the next); the gap at the eighth
  // place is the way into the clearing
  const RR = 7.8,
    A = (i) => ((i + 0.5) / 8) * TAU;
  b.caps = [];
  [1.5, 2.4, 3.3, 4.2, 5.1, 6.0, 6.9].forEach((h, i) =>
    b.caps.push(giant(Math.cos(A(i)) * RR, Math.sin(A(i)) * RR, h, 2.6, rnd() * TAU)),
  );
  // the middle cap, a little toward the top step; the crate on it, under a gold glow until it is searched
  const mx = Math.cos(A(6)) * 0.2,
    mz = Math.sin(A(6)) * 0.2,
    top = giant(mx, mz, 5.9, 2.3, rnd() * TAU),
    cr = cache(b, g, mx + 0.3, mz - 0.2, b.place, { k: 4, ammo: 6, y: top - 0.15 });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 7, 16, 1, true), M.beam);
  beam.position.set(cr.x, top + 3.3, cr.z);
  beam.renderOrder = 2;
  g.add(beam);
  beam.onBeforeRender = (r, sc, cam) => {
    beam.material.opacity = cr.opened
      ? 0
      : (0.45 + 0.15 * Math.sin(performance.now() / 600)) *
        Math.min(1, Math.max(0.1, (Math.hypot(cam.position.x - cr.x, cam.position.z - cr.z) - 3) / 6));
  };
  for (const [k, mat, cast] of [
    ['body', SHROOM.parts[0].mat, true],
    ['cap', M.cap, true],
    ['under', M.gill, false],
    ['shelf', M.shelf, true],
  ]) {
    const m = new THREE.Mesh(mergeGeometries(G[k]), mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    g.add(m);
  }
  // a fairy ring of glowcaps round the outside, and a few in the clearing
  const gc = glowcapParts(2),
    n = 84,
    im = gc.parts.map((p) => {
      const m = new THREE.InstancedMesh(p.geo, p.mat, n);
      m.receiveShadow = true;
      g.add(m);
      return m;
    });
  for (let i = 0; i < n; i++) {
    const inner = i >= 72,
      a = inner ? rnd() * TAU : ((i + rnd() * 0.6) / 72) * TAU,
      d = inner ? 2.7 + rnd() * 2 : 11.3 + (rnd() - 0.5) * 0.8,
      [x, z] = toW(b, Math.cos(a) * d, Math.sin(a) * d),
      s = 0.8 + rnd() * 0.6;
    m4.compose(
      new THREE.Vector3(x, groundY(x, z) - 0.02, z),
      q4.setFromAxisAngle(UP, rnd() * TAU),
      new THREE.Vector3(s, s, s),
    );
    for (const m of im) m.setMatrixAt(i, m4);
  }
  // the spores: a low cloud over the clearing (where they hurt, src/places.js), a sleeve of them rising and widening out of it to
  // 17 m (it turns, src/places.js), loose motes round the caps; a faint glowing veil marks the column from afar
  const N = 1600,
    pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const k = i % 10,
      a = rnd() * TAU;
    let r, y;
    if (k < 3) {
      r = 2.5 + Math.sqrt(rnd()) * 3.6;
      y = 0.15 + rnd() * 2.2;
    } else if (k < 9) {
      y = Math.pow(rnd(), 1.5) * 17;
      r = (3.0 + (rnd() - 0.5) * 2.2) * (1 + y / 22);
    } else {
      r = 4 + rnd() * 8;
      y = rnd() * 8;
    }
    pos.set([Math.cos(a) * r, b.y + y, Math.sin(a) * r], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const cloud = new THREE.Points(geo, M.spore);
  cloud.position.set(b.x, 0, b.z);
  g.add(cloud);
  /* (its points are round the ring's middle: it was at the world's) */ if (b.place) b.place.cloud = cloud;
  for (const [r0, r1, hh] of [
    [3.1, 4.6, 16],
    [2.5, 3.9, 13],
  ]) {
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(r1, r0, hh, 28, 1, true).rotateY(r0).translate(0, b.y + hh / 2 + 0.4, 0),
      M.shaft,
    );
    sleeve.renderOrder = 2;
    cloud.add(sleeve);
    sleeve.onBeforeRender = (r, sc, cam) => {
      M.shaft.opacity =
        0.32 * Math.min(1, Math.max(0.15, (Math.hypot(cam.position.x - b.x, cam.position.z - b.z) - 4) / 8));
    };
  }
} // (faint seen from inside it)

// for the other parts of the split (src/buildings.js, src/interiors.js, src/places/)
export { taper, buildShrooms };
