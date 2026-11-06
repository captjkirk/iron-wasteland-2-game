// What a player builds (slice 11): the craftbench, the bed and the torch (the campfire is camp.js's buildFire; the torch's
// flame is camp.js's addFlame, added by craft.js). Each
// model's origin is on the ground at its centre; it faces -Z (the side a player stands at).
import * as THREE from 'three';
import { pbr as phPbr } from './propmodels.js';

let M = null;
function mats() { if (M) return M;
  const planks = phPbr('props/planks', { rough: 0.8, color: 0xa87a50 }), bark = phPbr('props/logbark', { rough: 0.95, color: 0x9a8a7a }), canvas = phPbr('props/canvas', { rough: 0.95 }); // the plank texture is grey: tinted to oiled pine, as the houses' floors are
  M = { planks, bark, iron: new THREE.MeshStandardMaterial({ map: phPbr('props/iron', {}).map, color: 0xb0a090, metalness: 0.45, roughness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xa8acb0, metalness: 1, roughness: 0.3 }), handle: new THREE.MeshStandardMaterial({ color: 0x6a4424, roughness: 0.7 }),
    linen: new THREE.MeshStandardMaterial({ map: canvas.map, normalMap: canvas.normalMap, color: new THREE.Color().setRGB(1.7, 1.45, 1.05), roughness: 0.95 }),
    wool: new THREE.MeshStandardMaterial({ map: canvas.map, normalMap: canvas.normalMap, color: 0x8a3a2a, roughness: 0.95 }),
    wrap: new THREE.MeshStandardMaterial({ map: canvas.map, color: 0x4a3626, roughness: 1 }), endGrain: new THREE.MeshStandardMaterial({ color: 0x9a7a52, roughness: 0.9 }) };
  return M; }
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
function put(g, geo, mat, p, r = [0, 0, 0]) { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); m.castShadow = m.receiveShadow = true; g.add(m); return m; }

// a heavy plank bench on four square legs with a shelf, a vice at one end, a saw, a hammer and a few cut boards on top
export function benchMesh() { const m = mats(), g = new THREE.Group();
  put(g, box(1.9, 0.09, 0.85), m.planks, [0, 0.88, 0]);
  for (const x of [-0.85, 0.85]) for (const z of [-0.33, 0.33]) put(g, box(0.1, 0.84, 0.1), m.planks, [x, 0.42, z]);
  put(g, box(1.7, 0.05, 0.7), m.planks, [0, 0.2, 0]);
  for (const z of [-0.33, 0.33]) put(g, box(1.7, 0.08, 0.05), m.planks, [0, 0.32, z]);
  // the vice: a jaw block, a screw and a T-handle, on the left end
  put(g, box(0.22, 0.16, 0.12), m.iron, [-0.8, 1.0, -0.36]); put(g, box(0.22, 0.16, 0.06), m.iron, [-0.8, 1.0, -0.5]);
  put(g, new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8).rotateX(Math.PI / 2), m.steel, [-0.8, 0.98, -0.6]);
  put(g, new THREE.CylinderGeometry(0.012, 0.012, 0.24, 6).rotateZ(Math.PI / 2), m.steel, [-0.8, 0.98, -0.75]);
  // a saw: a tapered steel blade and a wooden grip
  const saw = new THREE.Shape(); saw.moveTo(0, 0); saw.lineTo(0.55, 0.02); saw.lineTo(0.55, 0.1); saw.lineTo(0, 0.14); saw.closePath();
  put(g, new THREE.ExtrudeGeometry(saw, { depth: 0.004, bevelEnabled: false }).rotateX(-Math.PI / 2), m.steel, [0.1, 0.93, 0.15], [0, 0.3, 0]);
  put(g, box(0.14, 0.03, 0.12), m.handle, [0.04, 0.94, 0.14], [0, 0.3, 0]);
  // a hammer lying on its side
  put(g, new THREE.CylinderGeometry(0.016, 0.02, 0.34, 8).rotateZ(Math.PI / 2), m.handle, [0.62, 0.95, -0.15], [0, -0.5, 0]);
  put(g, box(0.05, 0.05, 0.13), m.iron, [0.76, 0.95, -0.24], [0, -0.5, 0]);
  // cut boards stacked at the back
  for (let k = 0; k < 3; k++) put(g, box(0.7, 0.03, 0.14), m.planks, [-0.2 + k * 0.03, 0.945 + k * 0.03, 0.28 - k * 0.02], [0, 0.05 * k, 0]);
  // logs under the shelf, ends showing
  for (const [x, y] of [[-0.3, 0.32], [0.05, 0.32], [-0.12, 0.47]]) { put(g, new THREE.CylinderGeometry(0.09, 0.1, 0.62, 10).rotateX(Math.PI / 2), m.bark, [x, y, 0]);
    for (const s of [-1, 1]) put(g, new THREE.CircleGeometry(0.09, 10), m.endGrain, [x, y, s * 0.311], [0, s < 0 ? Math.PI : 0, 0]); }
  // a tool board at the back on two posts: a bow saw, an axe, a mallet and a coil of rope hang from pegs
  for (const x of [-0.85, 0.85]) put(g, box(0.08, 1.7, 0.08), m.planks, [x, 0.85, 0.4]);
  put(g, box(1.8, 0.62, 0.04), m.planks, [0, 1.42, 0.42]); put(g, box(1.86, 0.06, 0.08), m.planks, [0, 1.76, 0.42]);
  for (const x of [-0.6, -0.1, 0.35, 0.72]) put(g, new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6).rotateX(Math.PI / 2), m.handle, [x, 1.62, 0.37]);
  const bs = new THREE.Shape(); bs.moveTo(-0.28, 0); bs.lineTo(0.28, 0); bs.lineTo(0.28, 0.035); bs.lineTo(-0.28, 0.035); bs.closePath();
  put(g, new THREE.ExtrudeGeometry(bs, { depth: 0.003, bevelEnabled: false }), m.steel, [-0.6, 1.3, 0.392]); // the saw's blade
  put(g, new THREE.TorusGeometry(0.2, 0.012, 6, 20, Math.PI), m.handle, [-0.6, 1.335, 0.39]); // its bow frame
  put(g, box(0.035, 0.42, 0.03), m.handle, [-0.1, 1.42, 0.385]); put(g, box(0.14, 0.09, 0.025), m.iron, [-0.1, 1.61, 0.38]); // the axe, head up
  put(g, box(0.03, 0.3, 0.03), m.handle, [0.35, 1.47, 0.385]); put(g, new THREE.CylinderGeometry(0.05, 0.05, 0.13, 10).rotateZ(Math.PI / 2), m.planks, [0.35, 1.6, 0.375]); // a mallet
  put(g, new THREE.TorusGeometry(0.11, 0.022, 8, 18), m.wrap, [0.72, 1.5, 0.375]); put(g, new THREE.TorusGeometry(0.09, 0.02, 8, 18), m.wrap, [0.74, 1.47, 0.36], [0.2, 0.3, 0]); // rope
  return g; }

// a plank bed frame with a tall headboard, a straw-stuffed linen mattress, a red wool blanket turned back, and a pillow
export function bedMesh() { const m = mats(), g = new THREE.Group();
  for (const x of [-0.5, 0.5]) { put(g, box(0.08, 0.2, 2.1), m.planks, [x, 0.28, 0]); for (const z of [-1.0, 1.0]) put(g, box(0.1, z > 0 ? 0.95 : 0.5, 0.1), m.planks, [x, z > 0 ? 0.475 : 0.25, z]); }
  put(g, box(1.0, 0.6, 0.05), m.planks, [0, 0.62, 1.0]); put(g, box(1.08, 0.06, 0.08), m.planks, [0, 0.96, 1.0]);
  put(g, box(1.0, 0.25, 0.05), m.planks, [0, 0.33, -1.0]);
  for (let k = -3; k <= 3; k++) put(g, box(0.96, 0.03, 0.12), m.planks, [0, 0.27, k * 0.28]);
  const mat = put(g, new THREE.BoxGeometry(0.9, 0.16, 1.92, 6, 2, 12), m.linen, [0, 0.37, 0]);
  { const p = mat.geometry.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, p.getY(i) - 0.025 * (Math.abs(p.getX(i)) / 0.45) ** 2); mat.geometry.computeVertexNormals(); }
  // the blanket: draped over the mattress and hanging down its sides, with soft folds
  { const bg = new THREE.PlaneGeometry(1.34, 1.3, 26, 22).rotateX(-Math.PI / 2), p = bg.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), o = Math.abs(x) - 0.46; let y = 0.012 * Math.sin(z * 17 + x * 4) + 0.008 * Math.sin(x * 23 - z * 5);
      if (o > 0) { y -= o * 1.25; p.setX(i, Math.sign(x) * (0.47 + o * 0.12)); } else y += 0.01 * Math.cos(x * 3.4); p.setY(i, y); }
    bg.computeVertexNormals(); const bl = put(g, bg, m.wool, [0, 0.47, -0.32]); bl.material = m.wool2 || (m.wool2 = Object.assign(m.wool.clone(), { side: THREE.DoubleSide })); }
  put(g, box(0.94, 0.07, 0.22), m.wool, [0, 0.48, 0.38], [0.25, 0, 0]);
  const pillow = put(g, new THREE.SphereGeometry(0.2, 14, 8), m.linen, [0, 0.52, 0.72]); pillow.scale.set(1.7, 0.45, 0.95);
  return g; }

// a stake driven into the ground, its head wrapped in pitch-soaked rags; flames are added by camp.js's addFlame
export function torchMesh() { const m = mats(), g = new THREE.Group();
  put(g, new THREE.CylinderGeometry(0.035, 0.05, 1.5, 8), m.bark, [0, 0.75, 0]);
  put(g, new THREE.CylinderGeometry(0.075, 0.06, 0.2, 10), m.wrap, [0, 1.46, 0]);
  put(g, new THREE.TorusGeometry(0.06, 0.012, 6, 14).rotateX(Math.PI / 2), m.iron, [0, 1.38, 0]);
  return g; }
