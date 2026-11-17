// The crater lakes (slice 23, #52): the rim's rocks, the mist, the glow, the wreck and the bones (buildBuildings puts
// the chest). Moved here unchanged from src/buildings.js (the code cleanup, November 16, 2026); buildings.js still
// exports all of it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y, CAMP } from '../config.js';
import { mulberry32 } from '../noise.js';
import { groundY, biomeAt } from '../world.js';
import { addCollider } from '../props.js';
import { boxUV, canvasTex, rockMat } from '../propmodels.js';
import { TILE, mats, box, bar } from '../buildings.js';
import { TAU } from './plane.js';
import { taper } from './shrooms.js';

// the crater lakes (slice 23 polish; a critic: the water looked shallow, the rim low, no drama): jagged outcrops and boulders
// stand along the rim in broken clusters (a way out between every two, and the way in from the camp kept wide open), loose
// boulders lie rolled down the inner slope and half sunk at the shore, the deep middle goes near black, low mist lies over it, a faint gold glow on the
// water marks the sunken chest, and at the shore lie a wrecked rowboat and the bones of an old serpent, the Thing in the deep's kind
let CRM = null;
function craterMats() {
  if (CRM) return CRM;
  const mist = canvasTex(
    512,
    512,
    (x, w, h) => {
      const r = mulberry32(9),
        c = w / 2;
      for (let i = 0; i < 170; i++) {
        const a = r() * TAU,
          d = (0.2 + 0.65 * Math.sqrt(r())) * c,
          px = c + Math.cos(a) * d,
          py = c + Math.sin(a) * d,
          s = 24 + r() * 60,
          g = x.createRadialGradient(px, py, 0, px, py, s);
        g.addColorStop(0, `rgba(255,255,255,${0.05 + r() * 0.13})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g;
        x.fillRect(px - s, py - s, s * 2, s * 2);
      }
      x.globalCompositeOperation = 'destination-in';
      const e = x.createRadialGradient(c, c, c * 0.5, c, c, c * 0.98);
      e.addColorStop(0, 'rgba(0,0,0,1)');
      e.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = e;
      x.fillRect(0, 0, w, h);
    },
    '#ffffff',
  );
  const halo = canvasTex(
    128,
    128,
    (x, w) => {
      const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, w);
    },
    '#ffffff',
  );
  // (the deep: the water's own dark veil, src/water.js, lies 2 cm over the mirror and is lost at a distance; this one is pulled toward
  // the eye, black in the 8 m middle and clear at the shore)
  const deep = canvasTex(
    256,
    256,
    (x, w) => {
      const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.9)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.82)');
      g.addColorStop(0.86, 'rgba(0,0,0,0.4)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, w);
    },
    '#ffffff',
  );
  const lift = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  return (CRM = {
    mist: new THREE.MeshBasicMaterial({
      map: mist,
      color: 0xd4dee2,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
      ...lift,
    }),
    deep: new THREE.MeshBasicMaterial({ map: deep, color: 0x03141a, transparent: true, depthWrite: false, ...lift }),
    gold: new THREE.MeshBasicMaterial({
      map: halo,
      color: 0xffc860,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      ...lift,
    }),
    bone: new THREE.MeshStandardMaterial({ color: 0xd6ccb4, roughness: 0.78 }),
  });
}
// a jagged rock: a faceted lump, flat underneath, tapering to a ragged top; w wide, hgt tall, d deep, its own vertex colours
function shardGeo(rnd, w, hgt, d, taper = 0.5) {
  const g = new THREE.IcosahedronGeometry(1, 1),
    p = g.attributes.position,
    v = new THREE.Vector3(),
    sd = rnd() * 100,
    hsh = (x, y, z) => {
      const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + sd) * 43758.5453;
      return s - Math.floor(s);
    };
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + (hsh(v.x, v.y, v.z) - 0.5) * 0.55,
      t = (v.y + 1) / 2;
    v.multiplyScalar(k);
    if (v.y < -0.3) v.y = -0.3 + (v.y + 0.3) * 0.3;
    p.setXYZ(
      i,
      ((v.x * w) / 2) * (1 - taper * t * t),
      ((v.y + 0.3) / 1.3) * hgt,
      ((v.z * d) / 2) * (1 - taper * t * t),
    );
  }
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  boxUV(g, 1.6);
  const n = g.attributes.normal,
    col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 3) {
    const k = 0.78 + hsh(i, 1, 2) * 0.24 + Math.max(0, n.getY(i)) * 0.12;
    for (let j = 0; j < 3; j++) col.set([k, k * 0.98, k * 0.95], (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function buildCrater(q, root) {
  const l = q.lake,
    M = mats(),
    C = craterMats(),
    rnd = mulberry32(Math.round(l.x * 13 + l.z * 7) + 23),
    T = { rock: [], bone: [], planks: [], beam: [] };
  const kind =
      { tundra: 'icerock', waste: 'wasterock', desert: 'sandrock', ruins: 'wasterock' }[
        biomeAt(l.x + l.rx * 1.5, l.z)
      ] || 'rock',
    eC = 1 + l.rw,
    camp = Math.atan2(CAMP.z - l.z, CAMP.x - l.x);
  const at = (a, e) => [l.x + Math.cos(a) * l.rx * e, l.z + Math.sin(a) * l.rx * e];
  // (the way in from the camp: nothing within 5 m of its line, as a player walks it straight in and out)
  const open = (x, z, r) => {
    const dx = x - l.x,
      dz = z - l.z;
    return dx * Math.cos(camp) + dz * Math.sin(camp) > 0 && Math.abs(dz * Math.cos(camp) - dx * Math.sin(camp)) < 5 + r;
  };
  const rock = (x, z, w, hgt, d, a, lean, sink, stand = true) => {
    if (open(x, z, Math.max(w, d) / 2)) return;
    const y = groundY(x, z);
    T.rock.push(
      shardGeo(rnd, w, hgt, d, hgt > 2.4 ? 0.4 : 0.3)
        .rotateZ(-lean)
        .rotateY(-a)
        .translate(x, y - sink, z),
    );
    const rr = w * 0.42 + 0.1,
      n = Math.max(1, Math.ceil((d * 0.8) / (rr * 1.2))),
      tx = -Math.sin(a),
      tz = Math.cos(a); // (a row of circles along a slab's broad side)
    for (let i = 0; i < n; i++) {
      const f = n > 1 ? (i / (n - 1) - 0.5) * d * 0.8 : 0;
      Object.assign(addCollider(x + tx * f, z + tz * f, rr, null), {
        vr: 0,
        top: y - sink + hgt * 0.9,
        stand: stand && hgt < 2.6 ? y - sink + hgt * 0.85 : null,
      });
    }
  };
  // the rim: clusters of uplifted shards leaning outward (as a crater's rim rocks are thrown back) with boulders round them
  const nC = 9 + Math.floor(rnd() * 3);
  for (let c = 0; c < nC; c++) {
    const gate = c === 0 || c === nC - 1,
      a0 = gate ? camp + ((c ? -1 : 1) * 10.5) / (l.rx * eC) : camp + ((c + 0.5) / nC) * TAU + (rnd() - 0.5) * 0.2; // (the first and last flank the way in from the camp, a gate through the rim)
    for (let k = 0, nk = 2 + Math.floor(rnd() * 2); k < nk; k++) {
      const a = a0 + (rnd() - 0.5) * 0.16,
        [x, z] = at(a, eC + (rnd() - 0.6) * 0.08),
        ry = a + (rnd() - 0.5) * 0.5;
      rock(
        x,
        z,
        1.5 + rnd() * 1.1,
        (5 + rnd() * 4.5) * (gate ? 1.2 : 1),
        3.5 + rnd() * 2.5,
        ry,
        0.25 + rnd() * 0.4,
        0.6,
      );
    } // (slabs: thin across the rim, broad along it, tipped outward)
    for (let k = 0, nk = 3 + Math.floor(rnd() * 3); k < nk; k++) {
      const a = a0 + (rnd() - 0.5) * 0.32,
        [x, z] = at(a, eC + (rnd() - 0.5) * 0.22),
        s = 1.1 + rnd() * 1.5;
      rock(x, z, s * 1.3, s, s * (0.9 + rnd() * 0.4), rnd() * TAU, (rnd() - 0.5) * 0.3, 0.25);
    }
  }
  // the shore: a wrecked rowboat and a serpent's bones, each its own way round; boulders rolled down the slope and half sunk
  const aw = camp + (rnd() < 0.5 ? 1 : -1) * Math.PI * (0.42 + rnd() * 0.16),
    ab = camp + Math.PI + (rnd() - 0.5) * 0.6,
    /* (the bones across the water from the way in, seen as you come over the rim) */ off = (a) =>
      Math.min(
        Math.abs(Math.atan2(Math.sin(a - aw), Math.cos(a - aw))),
        Math.abs(Math.atan2(Math.sin(a - ab), Math.cos(a - ab))),
      ) < 0.35;
  for (let k = 0; k < 22; k++) {
    const a = rnd() * TAU,
      e = k < 9 ? 0.93 + rnd() * 0.08 : 1.03 + rnd() * (eC - 1.15);
    if (off(a)) continue;
    const [x, z] = at(a, e),
      s = 0.8 + rnd() * (k < 9 ? 1.7 : 1.2);
    rock(x, z, s * 1.2, s, s, rnd() * TAU, (rnd() - 0.5) * 0.4, s * 0.25);
  }
  if (T.rock.length) {
    const m = new THREE.Mesh(mergeGeometries(T.rock), rockMat(kind));
    m.castShadow = m.receiveShadow = true;
    root.add(m);
  }
  // the rowboat: a 3.8 m double-ender of planks on ribs, stern in the water, bow up the bank, listing on its side, planks gone
  {
    const L = 3.8,
      half = (z, k) => (0.42 + 0.13 * k) * Math.sqrt(Math.max(0, 1 - (z / (L / 2)) ** 2)),
      B = { planks: [], beam: [] };
    for (const sx of [-1, 1])
      for (let k = 0; k < 3; k++)
        for (let z0 = -L / 2; z0 < L / 2 - 0.01; z0 += L / 8) {
          if (rnd() < 0.18) continue;
          const z1 = z0 + L / 8,
            x0 = half(z0, k),
            x1 = half(z1, k),
            len = Math.hypot(z1 - z0, x1 - x0);
          box(
            B,
            'planks',
            0.035,
            0.19,
            len + 0.03,
            (sx * (x0 + x1)) / 2,
            0.14 + k * 0.19,
            (z0 + z1) / 2,
            Math.atan2(sx * (x1 - x0), z1 - z0),
            0,
            -sx * 0.12 * k,
          );
        }
    for (let z = -L / 2 + 0.45; z < L / 2 - 0.3; z += 0.42) {
      for (const sx of [-1, 1]) bar(B, 'beam', sx * half(z, 0) * 0.5, 0.06, z, sx * half(z, 2), 0.62, z, 0.06);
      box(B, 'planks', half(z, 0) * 1.2, 0.035, 0.36, 0, 0.06, z);
    }
    box(B, 'beam', 0.1, 0.12, L * 0.96, 0, 0.02, 0);
    box(B, 'planks', half(-0.5, 2) * 1.9, 0.04, 0.26, 0, 0.5, -0.5);
    box(B, 'beam', 0.07, 0.07, 2.4, 0.3, 0.12, 0.2, 0.15); // the keel, a thwart, a loose oar
    const [x, z] = at(aw, 0.99),
      [x2, z2] = at(aw, 1.08),
      y = Math.max(groundY(x, z), WATER_Y - 0.25),
      pitch = Math.atan2(groundY(x2, z2) - groundY(x, z), l.rx * 0.09);
    const Mb = new THREE.Matrix4()
      .makeTranslation(x, y - 0.12, z)
      .multiply(new THREE.Matrix4().makeRotationY(Math.atan2(Math.cos(aw), Math.sin(aw))))
      .multiply(new THREE.Matrix4().makeRotationX(-pitch * 0.8))
      .multiply(new THREE.Matrix4().makeRotationZ(0.42));
    for (const k in B) for (const geo of B[k]) T[k].push(geo.applyMatrix4(Mb));
    Object.assign(addCollider(x, z, 0.8, null), { vr: 0, top: y + 0.7, stand: null });
    q.wreck = { x, z };
  }
  for (const k of ['planks', 'beam']) {
    const geo = mergeGeometries(T[k].map((q) => (q.index ? q.toNonIndexed() : q)));
    boxUV(geo, TILE[k]);
    const m = new THREE.Mesh(geo, M[k]);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
  }
  // the serpent's bones: an 11 m spine snaking down the bank, its tail in the shallows, ribs curling down into the mud, the skull
  // on the bank with its jaw dropped open
  {
    const pts = [];
    for (let i = 0; i <= 5; i++) {
      const [x, z] = at(ab + (i - 2.5) * 0.055, 1.13 - i * 0.026 + Math.sin(i * 1.7) * 0.012);
      pts.push(new THREE.Vector3(x, 0, z));
    }
    const cv = new THREE.CatmullRomCurve3(pts),
      NV = 26,
      up = new THREE.Vector3(0, 1, 0),
      sy = (p) => Math.max(groundY(p.x, p.z), WATER_Y - 0.2) + 0.14;
    for (let i = 0; i < NV; i++) {
      const u = i / (NV - 1),
        p = cv.getPointAt(u),
        t = cv.getTangentAt(u),
        s = i < 4 ? 0.7 + i * 0.1 : Math.max(0.35, 1.05 - ((i - 4) / (NV - 4)) * 0.7),
        nx = -t.z,
        nz = t.x;
      p.y = sy(p);
      T.bone.push(
        new THREE.BoxGeometry(0.34 * s, 0.26 * s, 0.3).rotateY(Math.atan2(t.x, t.z)).translate(p.x, p.y, p.z),
        new THREE.ConeGeometry(0.07 * s, 0.32 * s, 5).translate(p.x, p.y + 0.26 * s, p.z),
      );
      if (i > 1 && i < NV - 3 && rnd() > 0.12)
        for (const sx of [-1, 1]) {
          if (rnd() < 0.15) continue;
          const k = s * (0.75 + rnd() * 0.2),
            Q = (a, b, c) =>
              new THREE.Vector3(p.x + nx * sx * a * k + t.x * c, p.y + b * k, p.z + nz * sx * a * k + t.z * c);
          T.bone.push(
            taper([Q(0.12, 0.05, 0), Q(0.5, 0.32, 0.08), Q(0.85, 0.05, 0.16), Q(0.82, -0.45, 0.2)], 0.065 * k, 6, 4),
          );
        }
    }
    const p = cv.getPointAt(0),
      t = cv.getTangentAt(0),
      hy = sy(p) + 0.18,
      ry = Math.atan2(-t.x, -t.z),
      hx = p.x - t.x * 0.9,
      hz = p.z - t.z * 0.9,
      skull = new THREE.BoxGeometry(0.6, 0.38, 1.3, 2, 1, 3),
      sp = skull.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const zz = sp.getZ(i),
        k = 1 - (Math.max(0, zz) / 0.65) * 0.55;
      sp.setXYZ(i, sp.getX(i) * k, sp.getY(i) * (zz > 0 ? 0.6 + 0.4 * k : 1), zz);
    }
    skull.computeVertexNormals();
    const Rm = new THREE.Matrix4().makeTranslation(hx, hy, hz).multiply(new THREE.Matrix4().makeRotationY(ry)),
      jaw = (sx) => new THREE.BoxGeometry(0.08, 0.1, 1.25).translate(sx * 0.2, -0.32, 0.45).rotateX(0.35);
    T.bone.push(skull.applyMatrix4(Rm), jaw(-1).applyMatrix4(Rm), jaw(1).applyMatrix4(Rm));
    for (let j = 0; j < 7; j++)
      for (const sx of [-1, 1])
        T.bone.push(
          new THREE.ConeGeometry(0.035, 0.15, 4)
            .rotateX(Math.PI)
            .translate(sx * 0.17 * (1 - (j / 7) * 0.45), -0.22, 0.05 + j * 0.11)
            .applyMatrix4(Rm),
          new THREE.ConeGeometry(0.03, 0.13, 4)
            .translate(sx * 0.2, -0.2, 0.25 + j * 0.13)
            .rotateX(0.35)
            .applyMatrix4(Rm),
        );
    const m = new THREE.Mesh(mergeGeometries(T.bone.map((q) => (q.index ? q.toNonIndexed() : q))), C.bone);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    Object.assign(addCollider(hx, hz, 0.55, null), { vr: 0, top: hy + 0.3, stand: hy + 0.2 });
    q.bones = { x: hx, z: hz };
  }
  const dk = new THREE.Mesh(new THREE.CircleGeometry(l.rx * 1.02, 48).rotateX(-Math.PI / 2), C.deep);
  dk.position.set(l.x, WATER_Y + 0.05, l.z);
  dk.renderOrder = 1;
  root.add(dk);
  // low mist over the water, three layers turning slowly against each other
  for (let k = 0; k < 3; k++) {
    const s = l.rx * (2.0 - k * 0.2),
      m = new THREE.Mesh(new THREE.PlaneGeometry(s, s).rotateX(-Math.PI / 2), C.mist);
    m.position.set(l.x, WATER_Y + 0.35 + k * 0.5, l.z);
    m.renderOrder = 3;
    root.add(m);
    m.onBeforeRender = () => {
      m.rotation.y = k * 2.1 + (performance.now() / 1000) * 0.012 * (k % 2 ? -1 : 1);
    };
  }
  // a faint gold glow on the water over the chest, breathing, gone once it is opened
  const ch = q.chest,
    glow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), C.gold);
  glow.position.set(ch.x, WATER_Y + 0.08, ch.z);
  glow.renderOrder = 2;
  root.add(glow);
  glow.onBeforeRender = () => {
    glow.material.opacity = ch.opened ? 0 : 0.45 + 0.2 * Math.sin(performance.now() / 900);
  };
}

// for the other parts of the split (src/buildings.js, src/interiors.js, src/places/)
export { buildCrater };
