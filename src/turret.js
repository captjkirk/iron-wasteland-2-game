// The Architect's auto-turret, built by hand from scrap (Jared, November 15, 2026: "turret texture could probably use some
// love"): a bevelled, olive-painted gun body with rust run down it, a riveted shield plate, a ribbed ammo drum feeding a sagging
// brass belt, a perforated cooling sleeve and muzzle brake in bare worn steel, a carry handle, and a rusty tripod held down by
// sandbags. Textures are the ones already in assets/props: the rusty car body recoloured to olive paint (its dark rust kept),
// the rusty iron recoloured to bare steel, the iron itself for the rust, and the camp's canvas recoloured to burlap for the sandbags.
// Geometry and materials are built once and shared by every turret (co-op ghost turrets too): one mesh per material for the
// tripod and one per material for the turning head; only the status light's material is each turret's own.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { pbr, boxUV } from './propmodels.js';

// a diffuse texture from assets/props redrawn pixel by pixel into a fixed 512 canvas (filled with `fill` until it loads)
function recolour(name, fill, f) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = fill;
  x.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const img = new Image();
  img.onload = () => {
    x.drawImage(img, 0, 0, 512, 512);
    const d = x.getImageData(0, 0, 512, 512),
      a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      const o = f(a[i], a[i + 1], a[i + 2]);
      a[i] = o[0];
      a[i + 1] = o[1];
      a[i + 2] = o[2];
    }
    x.putImageData(d, 0, 0);
    t.needsUpdate = true;
  };
  img.src = `assets/props/${name}_diff.jpg`;
  return t;
}
const NOR = {},
  nor = (name) =>
    (NOR[name] ||= Object.assign(new THREE.TextureLoader().load(`assets/props/${name}_nor.jpg`), {
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      anisotropy: 4,
    })); // each normal map loaded once
const ss = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

let MATS = null;
export function turretMats() {
  if (MATS) return MATS;
  // olive paint where the car's paint was (its bright pixels), its rust where the rust was (the dark streaks and patches)
  const paint = recolour('car_rust', '#4f5e42', (r, g, b) => {
    const L = (0.3 * r + 0.59 * g + 0.11 * b) / 255,
      p = ss(0.2, 0.36, L),
      k = Math.min(1.25, 0.55 + L);
    return [r * 0.8 * (1 - p) + 84 * k * p, g * 0.8 * (1 - p) + 92 * k * p, b * 0.8 * (1 - p) + 58 * k * p];
  });
  const bare = recolour('iron', '#6a6c6e', (r, g, b) => {
    const L = 0.3 * r + 0.59 * g + 0.11 * b,
      v = 70 + L * 0.8;
    return [v, v, v];
  }); // brushed, grey
  const sack = recolour('canvas', '#8a7250', (r, g, b) => {
    const L = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
    return [52 + L * 86, 42 + L * 68, 28 + L * 44];
  }); // burlap, dull
  MATS = {
    paint: new THREE.MeshStandardMaterial({ map: paint, normalMap: nor('car_rust'), roughness: 0.72, metalness: 0.3 }),
    steel: new THREE.MeshStandardMaterial({ map: bare, normalMap: nor('iron'), roughness: 0.6, metalness: 0.3 }),
    rust: pbr('props/iron', { rough: 0.75, metal: 0.35, color: 0xf0d8c0 }), // (its normal map is a second load of iron_nor, once per game)
    brass: new THREE.MeshStandardMaterial({ map: bare, color: 0xd8a848, roughness: 0.35, metalness: 0.85 }),
    sack: new THREE.MeshStandardMaterial({ map: sack, normalMap: nor('canvas'), roughness: 0.95 }),
    flash: new THREE.MeshBasicMaterial({
      color: 0xffd890,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  };
  return MATS;
}

// a geometry placed: position p, rotation r (x, y, z), scale s
const at = (g, p, r = [0, 0, 0], s = [1, 1, 1]) =>
  g.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(...p),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
      new THREE.Vector3(...s),
    ),
  );
const cyl = (r0, r1, h, n, open = false) => new THREE.CylinderGeometry(r0, r1, h, n, 1, open);
const ring = (r, tube, n = 10) => new THREE.TorusGeometry(r, tube, 3, n);
// every part of one material merged and given texture coordinates in metres (tile: metres per texture repeat)
const merge = (parts, tile) => boxUV(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g))), tile);

let GEO = null;
function turretGeo() {
  if (GEO) return GEO;
  const legs = [],
    sacks = [],
    paint = [],
    steel = [],
    rust = [],
    brass = [];
  for (let k = 0; k < 3; k++) {
    const a = k * 2.094,
      s = Math.sin(a),
      c = Math.cos(a); // splayed legs on foot plates, each held by two sandbags
    legs.push(
      at(cyl(0.03, 0.04, 0.95, 8), [s * 0.24, 0.42, c * 0.24], [-c * 0.5, 0, s * 0.5]),
      at(new THREE.BoxGeometry(0.12, 0.03, 0.16), [s * 0.46, 0.015, c * 0.46], [0, a, 0]),
    );
    for (const e of [-1, 1])
      sacks.push(
        at(cyl(0.05, 0.05, 0.03, 8), [s * 0.42 + c * e * 0.16, 0.06, c * 0.42 - s * e * 0.16], [0, a, Math.PI / 2]),
      ); // ties pinching the ends
    sacks.push(
      at(new RoundedBoxGeometry(0.34, 0.11, 0.19, 1, 0.05), [s * 0.42, 0.06, c * 0.42], [0, a + 1.571, 0.04]),
      at(
        new RoundedBoxGeometry(0.28, 0.1, 0.17, 1, 0.045),
        [s * 0.36 + c * 0.06, 0.16, c * 0.36 - s * 0.06],
        [0, a + 1.85, -0.08],
      ),
    );
  }
  legs.push(
    at(cyl(0.08, 0.1, 0.32, 10), [0, 0.86, 0]),
    at(ring(0.095, 0.018), [0, 1.0, 0], [Math.PI / 2, 0, 0]),
    at(ring(0.1, 0.015), [0, 0.72, 0], [Math.PI / 2, 0, 0]),
  ); // post with welded collars
  // the head, in its own frame (0 at its pivot; the barrel points along -z)
  paint.push(
    new RoundedBoxGeometry(0.46, 0.3, 0.6, 2, 0.035),
    at(new THREE.BoxGeometry(0.54, 0.4, 0.05), [0, 0.03, -0.325], [-0.1, 0, 0]),
  ); // body, sloped shield plate
  const onShield = (x, y, g) => at(at(g, [x, y, -0.03]), [0, 0.03, -0.325], [-0.1, 0, 0]);
  for (let x = -0.23; x < 0.24; x += 0.092)
    for (const y of [-0.16, 0.16]) steel.push(onShield(x, y, cyl(0.014, 0.014, 0.014, 6).rotateX(Math.PI / 2))); // rivets round the plate
  for (const y of [-0.05, 0.05])
    for (const x of [-0.23, 0.23]) steel.push(onShield(x, y, cyl(0.014, 0.014, 0.014, 6).rotateX(Math.PI / 2)));
  for (const z of [-0.16, 0.2]) rust.push(at(new THREE.BoxGeometry(0.48, 0.32, 0.03), [0, 0, z])); // straps welded round the body
  for (const x of [-0.2, 0.2])
    for (const y of [-0.1, 0.1]) rust.push(at(new THREE.BoxGeometry(0.04, 0.03, 0.08), [x, y, -0.3])); // brackets holding the plate on
  for (const x of [-0.236, 0.236])
    rust.push(at(new THREE.BoxGeometry(0.008, 0.12, 0.16), [x, -0.04, 0.04], [0.12, 0, 0])); // a patch welded over a hole each side
  steel.push(at(new THREE.TorusGeometry(0.075, 0.012, 5, 10, Math.PI), [-0.07, 0.15, 0.1], [0, Math.PI / 2, 0])); // carry handle, worn bare
  steel.push(
    at(cyl(0.04, 0.04, 0.62, 10), [0, 0.03, -0.5], [Math.PI / 2, 0, 0]),
    at(cyl(0.06, 0.06, 0.4, 12, true), [0, 0.03, -0.42], [Math.PI / 2, 0, 0]),
  ); // barrel in a cooling sleeve
  for (let k = 0; k < 7; k++) steel.push(at(ring(0.062, 0.008), [0, 0.03, -0.24 - k * 0.06])); // the sleeve's ribs
  steel.push(
    at(cyl(0.065, 0.065, 0.12, 10), [0, 0.03, -0.82], [Math.PI / 2, 0, 0]),
    at(ring(0.066, 0.01), [0, 0.03, -0.79]),
    at(ring(0.066, 0.01), [0, 0.03, -0.85]),
  ); // muzzle brake
  steel.push(
    at(new THREE.BoxGeometry(0.06, 0.08, 0.22), [0.1, 0.19, -0.05]),
    at(ring(0.026, 0.006), [0.1, 0.25, -0.15]),
  ); // sight and its ring
  rust.push(at(cyl(0.13, 0.13, 0.12, 14), [-0.3, -0.02, 0.05], [0, 0, Math.PI / 2])); // ammo drum, ribbed, with a hub
  for (const x of [-0.25, -0.35]) steel.push(at(ring(0.13, 0.01, 14), [x, -0.02, 0.05], [0, Math.PI / 2, 0]));
  steel.push(at(cyl(0.035, 0.035, 0.02, 8), [-0.37, -0.02, 0.05], [0, 0, Math.PI / 2]));
  for (let k = 0; k < 9; k++) {
    const t = k / 8,
      x = -0.3 + t * 0.22,
      z = -0.06 - t * 0.06,
      y = -0.12 - Math.sin(t * Math.PI) * 0.12 + t * 0.02; // a belt of rounds sagging from the drum into the gun
    brass.push(
      at(cyl(0.011, 0.011, 0.065, 6), [x, y, z], [0, 0, 0]),
      at(new THREE.ConeGeometry(0.011, 0.02, 6), [x, y + 0.042, z]),
    );
  }
  steel.push(
    at(cyl(0.012, 0.012, 0.14, 6), [0.17, 0.22, 0.14]),
    at(cyl(0.05, 0.055, 0.03, 10), [0.17, 0.29, 0.14]),
    at(ring(0.055, 0.007), [0.17, 0.34, 0.14], [Math.PI / 2, 0, 0]),
    at(ring(0.055, 0.006), [0.17, 0.34, 0.14]),
    at(ring(0.055, 0.006), [0.17, 0.34, 0.14], [0, Math.PI / 2, 0]),
  ); // the status light on a post, in a wire cage, clear of the plate from the front
  GEO = {
    legs: merge(legs, 0.4),
    sacks: merge(sacks, 0.35),
    paint: merge(paint, 0.55),
    steel: merge(steel, 0.3),
    rust: merge(rust, 0.4),
    brass: merge(brass, 0.15),
    flash: new THREE.ConeGeometry(0.12, 0.35, 8).rotateX(-Math.PI / 2),
    light: new THREE.SphereGeometry(0.05, 10, 8),
  };
  return GEO;
}

// one turret: the tripod group (head pivot at 1.12) with the head, its muzzle flash and its own status light
export function turretModel() {
  const M = turretMats(),
    G = turretGeo(),
    g = new THREE.Group(),
    head = new THREE.Group(),
    mesh = (geo, mat) => new THREE.Mesh(geo, mat);
  g.add(mesh(G.legs, M.rust), mesh(G.sacks, M.sack));
  const flash = mesh(G.flash, M.flash);
  flash.position.set(0, 0.03, -1.05);
  flash.visible = false;
  const light = mesh(G.light, new THREE.MeshBasicMaterial({ color: 0x6aff8a }));
  light.position.set(0.17, 0.34, 0.14);
  head.add(mesh(G.paint, M.paint), mesh(G.steel, M.steel), mesh(G.rust, M.rust), mesh(G.brass, M.brass), flash, light);
  head.position.y = 1.12;
  g.add(head);
  return { g, head, flash, light };
}
