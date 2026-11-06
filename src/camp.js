// The camp at the heart of the safe valley (IW1: the start is a grass clearing with a campfire that heals): a stone
// fire ring with logs, live flames, embers and a flickering firelight; a canvas A-frame tent with its door tied back,
// a bedroll, supply crates with a lantern (Poly Haven), a stump with an axe in it, and two log seats. All of it is built once at CAMP; tickCamp animates every fire (buildFire and buildTent also furnish the raider camps).
import * as THREE from 'three';
import { CAMP } from './config.js';
import { groundY } from './world.js';
import { addCollider } from './props.js';
import { rockMat, loadMesh, pbr as phPbr } from './propmodels.js';
import { nightK } from './daynight.js';

const loader = new THREE.TextureLoader();
function tex(name, srgb, rep = 1) { const t = loader.load(`assets/props/${name}.jpg`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
const pbr = (name, o = {}) => new THREE.MeshStandardMaterial({ map: tex(name + '_diff', true, o.rep), normalMap: tex(name + '_nor', false, o.rep), color: o.color ?? 0xffffff, roughness: o.rough ?? 0.9, side: o.side ?? THREE.FrontSide });

const fires = []; // the camp's and the raider camps'
export const campfire = { x: CAMP.x, z: CAMP.z, r: 5.5 };
let MATS = null;
function campMats() { if (MATS) return MATS;
  MATS = { canvas: pbr('canvas', { color: new THREE.Color().setRGB(2.0, 1.1, 0.36), side: THREE.DoubleSide, rep: 3 }) /* the linen texture is blue-grey: this turns it khaki */, bark: pbr('logbark', { color: 0x9a8a7a, rep: 1 }),
    endGrain: new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 }), char: new THREE.MeshStandardMaterial({ color: 0x2e2219, roughness: 1, emissive: 0x6a1e06, emissiveIntensity: 0.55 }) /* charred, with a coal's glow */ };
  MATS.rag = MATS.canvas.clone(); MATS.rag.color.setRGB(1.25, 0.72, 0.3); // raider tents: dirty, darker canvas
  return MATS; }

// a fire ring with a tipi of logs, shader flames, rising embers and (for the camp only: lights cost every material) a flickering light
export function buildFire(parent, x, z, withLight) {
  const { bark, char } = campMats(), g = new THREE.Group(), fy = groundY(x, z); g.position.set(x, fy, z); parent.add(g);
  const at = (o, dx, dz, lift = 0) => { o.position.set(dx, groundY(x + dx, z + dz) - fy + lift, dz); g.add(o); o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };
  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.95, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x241c16, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
  at(ash, 0, 0, 0.03).castShadow = false;
  const stoneG = new THREE.IcosahedronGeometry(0.2, 1); stoneG.setAttribute('color', new THREE.Float32BufferAttribute(new Array(stoneG.attributes.position.count * 3).fill(0.75), 3));
  for (let k = 0; k < 11; k++) { const a = k / 11 * Math.PI * 2, s = new THREE.Mesh(stoneG, rockMat('rock')); s.scale.set(1 + (k % 3) * 0.25, 0.7 + (k % 2) * 0.3, 1.1); s.rotation.set(k, k * 2, 0); at(s, Math.cos(a) * 0.82, Math.sin(a) * 0.82, 0.05); }
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + 0.3, l = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.95, 7), k % 2 ? bark : char);
    l.position.set(Math.cos(a) * 0.22, 0.32, Math.sin(a) * 0.22); l.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); const holder = new THREE.Group(); holder.add(l); at(holder, 0, 0); }
  const fire = addFlame(g, groundY(x, z) - fy, 1); fire.light = withLight ? new THREE.PointLight(0xff8a3a, 6, 16, 1.6) : null; if (fire.light) { fire.light.position.set(0, 1.1, 0); g.add(fire.light); }
  addCollider(x, z, 0.9, null).top = fy + 0.6; // shots fly over it
  return g;
}
// flames: three crossed cards with an animated flame shader, additive; embers rise and fade (tickCamp animates them).
// Used by every fire and by the torches players build (slice 11: s scales it down to a torch's flame).
export function addFlame(parent, y, s = 1, nEmbers = 40) { const h = new THREE.Group(); h.position.y = y; h.scale.setScalar(s); parent.add(h);
  const flameMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { t: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float t; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){ vec2 uv = vUv; float y = uv.y; vec2 q = vec2(uv.x * 4.0, y * 3.0 - t * 2.6);
        float turb = n(q) * 0.6 + n(q * 2.3 + 7.0) * 0.4; float w = (0.42 - y * 0.34) * (0.75 + turb * 0.5);
        float body = smoothstep(w, w * 0.25, abs(uv.x - 0.5 + (turb - 0.5) * 0.18 * y)) * smoothstep(1.0, 0.25, y + turb * 0.25) * smoothstep(0.0, 0.08, y);
        vec3 c = mix(vec3(1.0, 0.95, 0.6), vec3(1.0, 0.38, 0.06), smoothstep(0.1, 0.6, y + (1.0 - body) * 0.3));
        gl_FragColor = vec4(c * body * 1.6, body); }` });
  const flames = new THREE.Group();
  for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.25), flameMat); f.position.y = 0.66; f.rotation.y = k * Math.PI / 3; f.renderOrder = 3; flames.add(f); }
  flames.position.y = 0.05; h.add(flames); flames.traverse(m => { m.castShadow = false; m.receiveShadow = false; });
  const EN = nEmbers, ep = new Float32Array(EN * 3), eSeed = Array.from({ length: EN }, () => Math.random());
  const embers = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(ep, 3)),
    new THREE.PointsMaterial({ color: 0xffa040, size: 0.05, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  embers.frustumCulled = false; embers.position.y = 0.3; h.add(embers);
  const f = { flameMat, light: null, embers, ep, eSeed, flames, h }; fires.push(f); return f; }


// an A-frame canvas tent with a sag, its door flaps tied back, poles, guy lines and stakes; the open end faces +X
export function buildTent(raider) {
  const canvas = raider ? campMats().rag : campMats().canvas;
  const tent = new THREE.Group(), L = 2.6, W = 2.2, Ht = 1.55;
  for (const s of [-1, 1]) { const pg = new THREE.PlaneGeometry(L, Math.hypot(W / 2, Ht), 10, 6), p = pg.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i) / L + 0.5, v = p.getY(i) / Math.hypot(W / 2, Ht) + 0.5, sag = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.13 + Math.sin(u * Math.PI * 4) * Math.sin(v * Math.PI) * 0.02; // slack between the poles, creased at the seams
      p.setXYZ(i, p.getX(i), Ht * v, s * (W / 2) * (1 - v) - s * sag); }
    pg.computeVertexNormals(); tent.add(new THREE.Mesh(pg, canvas)); }
  const back = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-L / 2, 0, -W / 2, -L / 2, 0, W / 2, -L / 2, Ht, 0], 3)).setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  back.computeVertexNormals(); tent.add(new THREE.Mesh(back, canvas));
  for (const s of [-1, 1]) { const flap = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([L / 2, 0, s * W / 2, L / 2 + 0.55, 0, s * W * 0.62, L / 2, Ht, 0], 3)).setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
    flap.computeVertexNormals(); tent.add(new THREE.Mesh(flap, canvas)); }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, W).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a3428, roughness: 1 })); floor.position.y = 0.02; tent.add(floor);
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a5038, roughness: 0.8 }), rope = new THREE.MeshStandardMaterial({ color: 0xb8a882, roughness: 0.9 });
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, L + 0.3, 6).rotateZ(Math.PI / 2), wood); ridge.position.y = Ht + 0.01; tent.add(ridge);
  for (const s of [-1, 1]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, Ht + 0.15, 6), wood); pole.position.set(s * (L / 2 + 0.06), (Ht + 0.15) / 2, 0); tent.add(pole);
    // a guy line from the pole top to a stake out along the ridge
    const a = new THREE.Vector3(s * (L / 2 + 0.06), Ht + 0.1, 0), b = new THREE.Vector3(s * (L / 2 + 1.3), 0.02, 0), mid = a.clone().add(b).multiplyScalar(0.5);
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, a.distanceTo(b), 4), rope); line.position.copy(mid); line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); tent.add(line);
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.012, 0.3, 5), wood); stake.position.copy(b); stake.rotation.z = s * 0.4; tent.add(stake); }
  tent.traverse(m => { if (m.material === canvas) m.userData.thin = true; }); // a thin two-sided sheet shadows itself black: it casts but does not receive
  return tent;
}

export async function buildCamp(scene) {
  const [crateA, crateB, lantern, stump, axe] = await Promise.all(['wooden_crate_01', 'wooden_crate_02', 'wooden_lantern_01', 'tree_stump_01', 'wooden_axe'].map(loadMesh));
  const g = new THREE.Group(); g.name = 'camp'; scene.add(g);
  const fx = CAMP.x, fz = CAMP.z, fy = groundY(fx, fz);
  const at = (o, dx, dz, lift = 0) => { o.position.set(fx + dx, groundY(fx + dx, fz + dz) + lift, fz + dz); g.add(o); o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = !m.userData.thin; } }); return o; };
  const { canvas, bark, endGrain } = campMats();
  buildFire(g, fx, fz, true);

  // log seats on two sides of the fire
  for (const [dx, dz, ry] of [[2.1, 0.6, 0.3], [-0.4, -2.2, 1.6]]) { const seat = new THREE.Group();
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 1.9, 12).rotateZ(Math.PI / 2), bark); seat.add(log);
    for (const s of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CircleGeometry(0.24, 12).rotateY(s * Math.PI / 2), endGrain); cap.position.x = s * 0.95; seat.add(cap); }
    seat.rotation.y = ry; at(seat, dx, dz, 0.2);
    for (const k of [-0.6, 0, 0.6]) addCollider(fx + dx + Math.cos(ry) * k, fz + dz - Math.sin(ry) * k, 0.3, null); }


  const tent = buildTent(false);
  tent.rotation.y = Math.atan2(3.6, 4.4); // the open end (+X) faces the fire (it was 78 degrees off before slice 8)
  at(tent, -4.4, 3.6); addCollider(fx - 4.4, fz + 3.6, 1.5, null).vr = 0;

  // the bedroll, unrolled at the tent's mouth, with a rolled blanket for a pillow
  const wool = new THREE.MeshStandardMaterial({ map: canvas.map, normalMap: canvas.normalMap, color: 0x8a3a2a, roughness: 0.95 });
  const roll = new THREE.Group(), pad = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.06, 1.85, 4, 1, 8), wool); pad.position.y = 0.03; roll.add(pad);
  const pillow = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.72, 12).rotateZ(Math.PI / 2), wool); pillow.position.set(0, 0.13, -0.82); roll.add(pillow);
  const fold = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.05, 0.7), new THREE.MeshStandardMaterial({ map: canvas.map, color: 0x5a6a4a, roughness: 0.95 })); fold.position.set(0, 0.08, 0.45); fold.rotation.x = 0.04; roll.add(fold);
  roll.rotation.y = tent.rotation.y + Math.PI / 2; at(roll, -2.3, 1.9);

  // supply crates: two long ones side by side, a small one stacked and turned, a lantern glowing on top; a sack leaning on them
  const mesh = (geo, mat, k) => { const m = new THREE.Mesh(geo, mat); m.scale.setScalar(k); return m; };
  const crateMatA = phPbr('props/wooden_crate_01', { rough: 0.85 }), crateMatB = phPbr('props/wooden_crate_02', { rough: 0.85 });
  const cx = 3.4, cz = 3.2;
  for (const [dx, dz, ry] of [[0, 0, 0.2], [0.78, 0.18, 0.12]]) { const c = mesh(crateB, crateMatB, 1.35); c.rotation.y = ry; at(c, cx + dx, cz + dz); }
  const top = mesh(crateA, crateMatA, 1.5); top.rotation.y = 0.9; at(top, cx + 0.4, cz + 0.1, 0.6);
  const lamp = new THREE.Group(); lamp.add(mesh(lantern, phPbr('props/wooden_lantern_01', { rough: 0.7 }), 1.6));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc070 })); glow.position.y = 0.26; glow.scale.set(1, 1.5, 1); lamp.add(glow);
  lamp.rotation.y = 0.4; at(lamp, cx + 0.3, cz + 0.05, 1.12); glow.castShadow = false;
  addCollider(fx + cx + 0.45, fz + cz + 0.12, 0.95, null);
  // a stump for splitting wood, the axe left standing in it
  const stumpM = mesh(stump, phPbr('props/tree_stump_01', { rough: 0.9 }), 0.8); at(stumpM, 1.2, -3.0, 0.12);
  const axeM = mesh(axe, phPbr('props/wooden_axe', { rough: 0.6 }), 1.7); axeM.rotation.set(Math.PI - 0.35, 0.6, 0); at(axeM, 1.2, -3.0, 0.32 + 0.41 * 1.7 * 0.94);
  addCollider(fx + 1.2, fz - 3.0, 0.6, null);
  const sack = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8).scale(1, 1.35, 0.85), new THREE.MeshStandardMaterial({ map: canvas.map, normalMap: canvas.normalMap, color: 0xa08a60, roughness: 1 }));
  sack.rotation.z = 0.25; at(sack, cx - 0.55, cz + 0.4, 0.35);
  return g;
}

export function tickCamp(dt, t) {
  for (const fire of fires) {
    fire.flameMat.uniforms.t.value = t;
    if (fire.light) fire.light.intensity = (5.2 + Math.sin(t * 13) * 0.6 + Math.sin(t * 7.3 + 1) * 0.5 + Math.sin(t * 23.1) * 0.3) * (1 + 0.6 * nightK()); // (brighter at night: slice 13)
    const p = fire.ep; for (let i = 0; i < fire.eSeed.length; i++) { const s = fire.eSeed[i], life = (t * (0.35 + s * 0.3) + s * 7) % 1;
      p[i * 3] = Math.sin(s * 40 + t * (1 + s)) * 0.25 * (0.4 + life); p[i * 3 + 1] = life * (2.2 + s * 1.5); p[i * 3 + 2] = Math.cos(s * 33 + t * (0.8 + s)) * 0.25 * (0.4 + life); }
    fire.embers.geometry.attributes.position.needsUpdate = true;
    fire.flames.rotation.y += dt * 0.4;
  }
}
