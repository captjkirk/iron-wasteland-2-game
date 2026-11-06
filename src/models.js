// Placeholder models from the prototype, all made in code: low-poly characters, enemies, props and weapons.
// Slices 2 to 4 replace these with realistic models; the game code only needs these function names.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ENEMY } from './config.js';

// ── Low-poly part builder: every model is boxes, cones and cylinders with baked colours ──
function part(geo, color, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.deleteAttribute('uv');
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s)));
  const c = new THREE.Color(color), a = []; for (let i = 0; i < g.attributes.position.count; i++) a.push(c.r, c.g, c.b);
  g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d), cone = (r, h, n = 6) => new THREE.ConeGeometry(r, h, n),
      cyl = (a, b, h, n = 6) => new THREE.CylinderGeometry(a, b, h, n), rockG = (r) => new THREE.IcosahedronGeometry(r, 0);
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
const merged = (...parts) => mergeGeometries(parts);

const PROP = {
  pine:      merged(part(cyl(0.18, 0.25, 1.6), 0x5a4030, { p: [0, 0.8, 0] }), part(cone(1.5, 2.6, 7), 0x3f6a34, { p: [0, 2.6, 0] }), part(cone(1.15, 2.1, 7), 0x4a7a3c, { p: [0, 3.8, 0] }), part(cone(0.75, 1.6, 7), 0x55884a, { p: [0, 4.9, 0] })),
  snowpine:  merged(part(cyl(0.18, 0.25, 1.6), 0x4a3a2e, { p: [0, 0.8, 0] }), part(cone(1.5, 2.6, 7), 0x3a5a44, { p: [0, 2.6, 0] }), part(cone(1.15, 2.1, 7), 0xdde8ee, { p: [0, 3.8, 0] }), part(cone(0.75, 1.6, 7), 0xf2f6f8, { p: [0, 4.9, 0] })),
  deadtree:  merged(part(cyl(0.12, 0.3, 3.4, 5), 0x4a3c30, { p: [0, 1.7, 0] }), part(cyl(0.05, 0.12, 1.6, 4), 0x4a3c30, { p: [0.45, 2.6, 0], r: [0, 0, -0.9] }), part(cyl(0.05, 0.1, 1.2, 4), 0x4a3c30, { p: [-0.35, 3.0, 0.1], r: [0.3, 0, 0.8] })),
  swamptree: merged(part(cyl(0.2, 0.45, 2.6, 6), 0x3a3324, { p: [0, 1.3, 0] }), part(rockG(1.6), 0x3c5030, { p: [0, 3.3, 0], s: [1.2, 0.7, 1.2] }), part(rockG(1.0), 0x4a5e36, { p: [0.6, 3.0, 0.4], s: [1, 0.6, 1] })),
  rock:      part(rockG(1), 0x7a7068),
  icerock:   part(rockG(1), 0xb8d4e2),
  sandrock:  part(rockG(1), 0xb08a5a),
  bush:      merged(part(rockG(0.7), 0x5a7a38, { s: [1, 0.7, 1] }), part(rockG(0.5), 0x6a8a44, { p: [0.4, 0.15, 0.2], s: [1, 0.7, 1] })),
  reeds:     merged(...[0, 1, 2, 3, 4].map(k => part(cyl(0.02, 0.04, 1.4 + k * 0.1, 3), 0x7a8a48, { p: [Math.cos(k * 1.3) * 0.3, 0.7, Math.sin(k * 1.3) * 0.3], r: [Math.sin(k) * 0.15, 0, Math.cos(k) * 0.15] }))),
  scrap:     merged(part(box(1.2, 0.5, 0.9), 0x8a4a2a, { p: [0, 0.25, 0], r: [0, 0.3, 0.08] }), part(box(0.8, 0.4, 0.6), 0x6a6a6e, { p: [0.3, 0.65, -0.1], r: [0.2, 0.9, 0] }), part(cyl(0.15, 0.15, 1.3, 6), 0x9a6a3a, { p: [-0.3, 0.6, 0.3], r: [0, 0, 1.2] }), part(box(0.5, 0.5, 0.5), 0xb07a30, { p: [-0.45, 0.25, -0.35], r: [0, 0.6, 0] })),
  hulk:      merged(part(box(4.2, 1.1, 1.9), 0x7a4430, { p: [0, 0.75, 0] }), part(box(2.2, 0.9, 1.7), 0x6a3a28, { p: [-0.3, 1.7, 0] }), part(box(2.0, 0.6, 1.72), 0x2a2c30, { p: [-0.3, 1.75, 0] }), ...[[-1.4, 0.95], [1.4, 0.95], [-1.4, -0.95], [1.4, -0.95]].map(([x, z]) => part(cyl(0.42, 0.42, 0.3, 8), 0x26262a, { p: [x, 0.35, z], r: [Math.PI / 2, 0, 0] }))),
  ruinwall:  merged(part(box(5, 3.2, 0.7), 0x8a857c, { p: [0, 1.6, 0] }), part(box(1.6, 1.4, 0.72), 0x6a655e, { p: [-0.8, 3.6, 0] }), part(box(1.0, 1.2, 0.8), 0x5a3a2c, { p: [1.3, 0.6, 0] })),
  cactus:    merged(part(cyl(0.32, 0.36, 3.0, 7), 0x5a7a3a, { p: [0, 1.5, 0] }), part(cyl(0.2, 0.22, 1.2, 6), 0x5a7a3a, { p: [0.55, 1.6, 0], r: [0, 0, 0] }), part(cyl(0.2, 0.2, 0.5, 6), 0x5a7a3a, { p: [0.33, 1.15, 0], r: [0, 0, Math.PI / 2] })),
};
const PROP_VR = { pine: 1.6, snowpine: 1.6, swamptree: 1.9, deadtree: 0.6, hulk: 2.3, ruinwall: 2.6, cactus: 0.7, rock: 1.0, icerock: 1.0, sandrock: 1.0 }, PROP_TOP = { pine: 5.8, snowpine: 5.8, swamptree: 4.2, deadtree: 3.6, hulk: 2.2, ruinwall: 4.3, cactus: 3, rock: 1.0, icerock: 1.0, sandrock: 1.0 };
const PROP_R = { pine: 0.6, snowpine: 0.6, deadtree: 0.4, swamptree: 0.7, rock: 1.0, icerock: 1.0, sandrock: 1.0, bush: 0, reeds: 0, scrap: 0.9, hulk: 2.1, ruinwall: 2.5, cactus: 0.5 };

// ── Characters: chunky low-poly figures, one hat or helmet each ──────────────
const SKIN = 0xe0b08a;
const brighten = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();
function buildCharacter(ch0) {
  const ch = { ...ch0, color: brighten(ch0.color, 1.45), dark: brighten(ch0.dark, 1.3) };
  const root = new THREE.Group(), mk = (geo) => { const m = new THREE.Mesh(geo, MAT); m.castShadow = true; return m; };
  const legL = mk(part(box(0.26, 0.8, 0.3), ch.dark, { p: [0, -0.4, 0] })), legR = legL.clone();
  legL.position.set(-0.17, 0.82, 0); legR.position.set(0.17, 0.82, 0);
  const torso = mk(merged(part(box(0.72, 0.78, 0.42), ch.color, { p: [0, 1.22, 0] }), part(box(0.76, 0.12, 0.46), ch.dark, { p: [0, 0.9, 0] }),
    part(box(0.34, 0.3, 0.04), ch.dark, { p: [0, 1.3, -0.22] })));
  const head = mk(part(box(0.42, 0.42, 0.4), SKIN, { p: [0, 1.85, 0] }));
  const eyes = mk(merged(part(box(0.07, 0.07, 0.02), 0x1a1410, { p: [-0.1, 1.88, -0.205] }), part(box(0.07, 0.07, 0.02), 0x1a1410, { p: [0.1, 1.88, -0.205] })));
  const armL = mk(part(box(0.2, 0.7, 0.22), ch.color, { p: [0, -0.33, 0] })), armR = armL.clone(); armL.position.set(-0.47, 1.56, 0); armR.position.set(0.47, 1.56, 0);
  let hat;
  if (ch.id === 'knight') hat = merged(part(box(0.5, 0.36, 0.48), 0x9aa4ae, { p: [0, 1.98, 0] }), part(box(0.44, 0.06, 0.02), 0x1a1c20, { p: [0, 1.9, -0.25] }), part(box(0.08, 0.22, 0.4), 0xb04030, { p: [0, 2.24, 0.04] }));
  if (ch.id === 'gunslinger') hat = merged(part(cyl(0.52, 0.52, 0.06, 10), 0x6a4422, { p: [0, 2.08, 0] }), part(cyl(0.24, 0.27, 0.3, 8), 0x6a4422, { p: [0, 2.24, 0] }));
  if (ch.id === 'architect') hat = merged(part(cyl(0.28, 0.3, 0.2, 8), 0xe0b030, { p: [0, 2.1, 0] }), part(cyl(0.34, 0.34, 0.04, 10), 0xe0b030, { p: [0, 2.01, -0.05] }));
  if (ch.id === 'charmer') hat = merged(part(box(0.46, 0.18, 0.46), 0x7a3a2a, { p: [0, 2.08, 0.04] }), part(box(0.46, 0.4, 0.12), 0x7a3a2a, { p: [0, 1.82, 0.22] }), part(rockG(0.1), 0xf0e050, { p: [0.2, 2.12, -0.18] }), part(rockG(0.08), 0xffffff, { p: [0.28, 2.06, -0.12] }));
  if (ch.id === 'ranger') hat = merged(part(cone(0.34, 0.5, 6), ch.dark, { p: [0, 2.2, 0.04] }), part(box(0.48, 0.42, 0.14), ch.dark, { p: [0, 1.86, 0.2] }));
  const hatM = mk(hat);
  const weapon = mk(weaponGeo(ch)); weapon.position.set(0, -0.62, -0.12); armR.add(weapon);
  if (ch.id === 'knight') { const sh = mk(merged(part(cyl(0.36, 0.36, 0.07, 10), 0xb8c2ca, { r: [0, 0, Math.PI / 2] }), part(cyl(0.29, 0.29, 0.08, 10), 0x2f5ea8, { r: [0, 0, Math.PI / 2] }), part(box(0.09, 0.3, 0.07), 0xe8c040, { p: [-0.05, 0, 0] }), part(box(0.09, 0.07, 0.3), 0xe8c040, { p: [-0.05, 0, 0] }))); sh.position.set(-0.16, -0.38, 0.05); sh.rotation.y = 0.5; armL.add(sh); }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: brighten(ch0.color, 2.2), transparent: true, opacity: 0.85, depthWrite: false }));
  ring.position.y = 0.06; ring.visible = false;
  root.add(legL, legR, torso, head, eyes, armL, armR, hatM, ring);
  root.userData = { legL, legR, armL, armR, weapon, ring };
  return root;
}
function weaponGeo(ch, fp) {
  if (ch.id === 'knight') return merged(part(cyl(0.07, 0.06, 1.0, 4), 0xdfe6ec, { p: [0, 0, -0.62], r: [-Math.PI / 2, 0, 0], s: [1, 1, 0.3] }), part(cone(0.06, 0.2, 4), 0xeef3f6, { p: [0, 0, -1.22], r: [-Math.PI / 2, 0, 0], s: [1, 1, 0.3] }), part(box(0.32, 0.05, 0.06), 0xc0a050, { p: [0, 0, -0.1] }), part(box(0.045, 0.045, 0.16), 0x4a3020, { p: [0, 0, 0.0] }), part(rockG(0.045), 0xc0a050, { p: [0, 0, 0.1] }));
  if (ch.id === 'gunslinger') return merged(part(box(0.09, 0.1, 0.42), 0x3a3a40, { p: [0, 0.06, -0.2] }), part(cyl(0.07, 0.07, 0.12, 8), 0x55555c, { p: [0, 0.05, -0.06], r: [Math.PI / 2, 0, 0] }), part(box(0.09, 0.24, 0.11), 0x6a4422, { p: [0, -0.1, 0.06], r: [0.25, 0, 0] }));
  if (ch.id === 'architect') return merged(part(box(0.07, 0.07, 0.8), 0x9aa0a6, { p: [0, 0, -0.35] }), part(box(0.22, 0.08, 0.14), 0x9aa0a6, { p: [0, 0, -0.78] }));
  if (ch.id === 'charmer') return merged(part(cyl(0.03, 0.03, 0.5, 4), 0x4a8a3a, { p: [0, 0, -0.2], r: [Math.PI / 2, 0, 0] }), part(rockG(0.12), 0xe85a8a, { p: [0, 0, -0.48] }), part(rockG(0.09), 0xf0d050, { p: [0.08, 0.06, -0.44] }));
  return merged(part(cyl(0.025, 0.025, 1.3, 4), 0x6a4a2a, { p: [0, 0, -0.1] }), part(box(0.02, 1.2, 0.02), 0xe0d8c8, { p: [0, 0, 0.12] }));
}

// ── Enemies ────────────────────────────────────────────────────────────
function buildEnemy(type) {
  const e = ENEMY[type], g = new THREE.Group(), mk = (geo) => { const m = new THREE.Mesh(geo, MAT.clone()); m.castShadow = true; return m; };
  let body;
  if (type === 'ice_crawler') body = merged(part(box(0.9, 0.42, 1.3), e.body, { p: [0, 0.5, 0] }), part(box(0.6, 0.3, 0.5), e.belly, { p: [0, 0.48, -0.85] }),
    ...[-1, 1].map(sx => part(box(0.08, 0.3, 0.6), 0x6a9ab8, { p: [sx * 0.2, 0.42, -1.25], r: [0.3, sx * 0.4, 0] })), part(cone(0.18, 0.5, 4), 0xe8f6ff, { p: [0, 0.9, 0.2] }));
  else if (type === 'bog_lurker') body = merged(part(rockG(0.7), e.body, { p: [0, 0.6, 0], s: [1.1, 0.75, 1.3] }), part(box(0.9, 0.16, 0.5), 0x2a1a14, { p: [0, 0.55, -0.82] }), part(box(0.9, 0.1, 0.5), e.belly, { p: [0, 0.68, -0.8] }));
  else if (type === 'bear') body = merged(part(box(1.0, 0.85, 1.6), e.body, { p: [0, 0.95, 0] }), part(box(0.66, 0.6, 0.6), e.body, { p: [0, 1.15, -1.0] }), part(box(0.86, 0.36, 0.7), e.body, { p: [0, 1.45, -0.4] }), part(box(0.34, 0.26, 0.3), e.belly, { p: [0, 1.02, -1.38] }),
    ...[-1, 1].map(sx => part(box(0.16, 0.16, 0.1), e.body, { p: [sx * 0.24, 1.5, -0.95] })));
  else body = merged(part(box(0.6, 0.55, 1.3), e.body, { p: [0, 0.82, 0] }), part(box(0.5, 0.18, 1.1), e.belly, { p: [0, 0.55, 0] }), part(box(0.46, 0.44, 0.5), e.body, { p: [0, 1.0, -0.82] }),
    part(box(0.26, 0.2, 0.32), e.belly, { p: [0, 0.9, -1.18] }), ...[-1, 1].map(sx => part(cone(0.09, 0.26, 4), e.body, { p: [sx * 0.15, 1.33, -0.78] })),
    part(box(0.12, 0.12, 0.7), e.body, { p: [0, 0.98, 0.95], r: [0.6, 0, 0] }));
  const bm = mk(body); g.add(bm);
  const eyes = new THREE.Mesh(merged(part(box(0.08, 0.06, 0.02), 0xff3a20, { p: [-0.13, type === 'bear' ? 1.25 : type === 'ice_crawler' ? 0.6 : type === 'bog_lurker' ? 0.85 : 1.08, type === 'bear' ? -1.31 : type === 'ice_crawler' ? -1.1 : type === 'bog_lurker' ? -0.9 : -1.08] }),
    part(box(0.08, 0.06, 0.02), 0xff3a20, { p: [0.13, type === 'bear' ? 1.25 : type === 'ice_crawler' ? 0.6 : type === 'bog_lurker' ? 0.85 : 1.08, type === 'bear' ? -1.31 : type === 'ice_crawler' ? -1.1 : type === 'bog_lurker' ? -0.9 : -1.08] })),
    new THREE.MeshBasicMaterial({ vertexColors: true })); g.add(eyes);
  const legs = [];
  const legGeo = type === 'ice_crawler' ? part(box(0.1, 0.5, 0.1), 0x6a9ab8, { p: [0, -0.25, 0] }) : part(box(0.16, 0.56, 0.18), e.body, { p: [0, -0.28, 0] });
  const legPos = type === 'ice_crawler' ? [[-0.5, 0.55, -0.4], [0.5, 0.55, -0.4], [-0.55, 0.55, 0.1], [0.55, 0.55, 0.1], [-0.5, 0.55, 0.55], [0.5, 0.55, 0.55]]
    : type === 'bog_lurker' ? [[-0.5, 0.45, -0.4], [0.5, 0.45, -0.4], [-0.5, 0.45, 0.45], [0.5, 0.45, 0.45]]
    : type === 'bear' ? [[-0.36, 0.62, -0.55], [0.36, 0.62, -0.55], [-0.36, 0.62, 0.55], [0.36, 0.62, 0.55]]
    : [[-0.2, 0.6, -0.45], [0.2, 0.6, -0.45], [-0.2, 0.6, 0.45], [0.2, 0.6, 0.45]];
  for (const lp of legPos) { const l = mk(legGeo); l.position.set(...lp); if (type === 'ice_crawler') l.rotation.z = Math.sign(lp[0]) * 0.6; if (type === 'bear') l.scale.set(1.5, 1.2, 1.5); g.add(l); legs.push(l); }
  g.scale.setScalar(e.scale); g.userData = { legs, mats: [bm.material, ...legs.map(l => l.material)] };
  return g;
}

export { part, box, cone, cyl, rockG, MAT, merged, PROP, PROP_VR, PROP_TOP, PROP_R, buildCharacter, weaponGeo, buildEnemy, brighten };
