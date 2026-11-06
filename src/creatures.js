// Enemies. Rigged and animated CC0 animals where they exist, built ones where they do not:
//  wolf        Quaternius "Ultimate Animated Animals" Wolf (12 clips), shell fur
//  dust_hound  Quaternius Fox, recoloured sand and lean, shell fur
//  bear        the Quaternius wolf rig reshaped by bone scale (heavy shoulders, big head, stub tail), long brown fur
//  rat         Poly Haven "Street Rat" (static, scanned-quality textures), legs and tail moved in the vertex shader
//  ice_crawler built in code: a six-legged ice-armoured arthropod, procedural tripod gait
//  bog_lurker  built in code: a wet-skinned amphibian ambusher, procedural crawl
//  brawler, shooter, heavy  raiders (IW1's human enemies): the player characters' rigged bodies in raider looks
// loadCreatures() once; buildCreature(type) returns a Group whose userData.anim has update(dt, {speed}), attack(),
// hit(side), die(); userData.flash(k) tints it white for a hit; userData.setDetail(near) toggles fur shells.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { Q } from './config.js';
import { buildCharacter } from './characters.js';

const DIR = new URL('../assets/beasts/', import.meta.url).href;
const docs = {};
async function loadDoc(name) {
  const txt = await (await fetch(DIR + name + '.json')).text();
  return new Promise((res, rej) => new GLTFLoader().parse(txt, DIR, res, rej));
}
export async function loadCreatures() { await Promise.all(['wolf', 'fox', 'rat'].map(async k => { docs[k] = await loadDoc(k); }));
  // the Quaternius animals are flat-shaded: weld the split vertices and smooth the normals (fur wants a soft surface)
  for (const k of ['wolf', 'fox']) docs[k].scene.traverse(o => { if (o.isSkinnedMesh) { const g = o.geometry.clone(); g.deleteAttribute('normal'); const w = mergeVertices(g, 1e-4); w.computeVertexNormals(); o.geometry = w; } }); }

const SHELLS = Q.furShells ?? 8;

// ── Fur: the base surface gets fine colour noise, and SHELLS offset copies along the skinned normal draw strands ──
const FUR_GLSL = /* glsl */`
varying vec3 vRest; uniform float uH; uniform float uDens; uniform vec3 uTip; uniform float uFlash;
float iwH3(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float iwN3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(mix(iwH3(i), iwH3(i+vec3(1,0,0)), f.x), mix(iwH3(i+vec3(0,1,0)), iwH3(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(iwH3(i+vec3(0,0,1)), iwH3(i+vec3(1,0,1)), f.x), mix(iwH3(i+vec3(0,1,1)), iwH3(i+vec3(1,1,1)), f.x), f.y), f.z); }
`;
function furMaterial(color, { h = 0, dens = 18, len = 0.1, tip = 1.25, rough = 0.95 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  const u = { uH: { value: h }, uLen: { value: len }, uDens: { value: dens }, uTip: { value: new THREE.Color(color).multiplyScalar(tip) }, uFlash: { value: 0 } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRest; uniform float uH; uniform float uLen;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\ntransformed += normalize(objectNormal) * uLen * uH;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FUR_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float big = iwN3(vRest * uDens * 0.08), mid = iwN3(vRest * uDens * 0.35);
        vec3 c = vRest * uDens; vec3 id = floor(c); vec3 f = fract(c) - 0.5;
        float hs = iwH3(id); vec3 jit = vec3(iwH3(id + 7.1), iwH3(id + 3.3), iwH3(id + 9.7)) - 0.5;
        float strand = 1. - smoothstep(0.18, 0.5, length(f - jit * 0.35) / max(0.15, 1. - uH));
        if (uH > 0.001) { if (hs < uH * 0.75 || strand < 0.5) discard; }
        diffuseColor.rgb *= mix(0.78, 1.18, big) * mix(0.85, 1.1, mid) * mix(0.9, 1.08, hs);
        diffuseColor.rgb = mix(diffuseColor.rgb * mix(0.55, 1., smoothstep(0., 0.25, uH)), uTip * mix(0.9, 1.1, hs), smoothstep(0.5, 1., uH) * 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.95, 0.85), uFlash);`);
  };
  m.customProgramCacheKey = () => 'iwfur' + (h > 0 ? 's' : 'b');
  return m;
}

// ── Rigged beasts (Quaternius wolf and fox) ──
const BEAST = {
  wolf: { doc: 'wolf', height: 1.0, mats: { Main: 0x968e82, Main_Light: 0xd6cebe }, fur: 0.07, dens: 70, tip: 1.12, walk: 1.5, run: 4.5 },
  dust_hound: { doc: 'fox', height: 1.0, mats: { Main: 0xc0a274, Main_Light: 0xe6d6b0, Grey: 0x6a5a44 }, fur: 0.04, dens: 85, tip: 1.1, walk: 1.5, run: 4.6, lean: true, shape: { 'Tail1': 0.6, 'Ear1L': 0.85, 'Ear1R': 0.85 } },
  bear: { doc: 'wolf', height: 1.0, mats: { Main: 0x6e4e34 }, fur: 0.055, dens: 110, tip: 1.3, walk: 1.2, run: 3.6, sculpt: true },
};
// every creature gets its own fur materials (same shader program), so a hit flash tints only the one that was hit
function furSet(type, dens) {
  const b = BEAST[type], set = {};
  for (const [name, col] of Object.entries(b.mats)) {
    set[name] = { base: furMaterial(col, { dens, tip: b.tip }), shells: [] };
    for (let k = 1; k <= SHELLS; k++) set[name].shells.push(furMaterial(col, { h: k / SHELLS, dens, len: 0, tip: b.tip }));
  }
  return set;
}
function beastClips(doc) { if (doc.userData.clips) return doc.userData.clips; const c = {};
  for (const a of doc.animations) { const tr = a.tracks.filter(t => !t.name.endsWith('.scale')); c[a.name] = new THREE.AnimationClip(a.name, a.duration, tr); }
  return (doc.userData.clips = c); }

// ── The bear: no CC0 bear exists that we could find, so its body is sculpted here as a smooth signed-distance shape
// (barrel body, shoulder hump, thick legs, broad skull, short muzzle, round ears), meshed by marching cubes and skinned
// to the wolf's skeleton by distance to each bone, so it moves with the wolf's 12 clips and wears the same fur.
let bearGeo = null;
function boneSegs(skel, bindInv) {
  const P = {}; skel.bones.forEach((bo, i) => { P[bo.name] = new THREE.Vector3().applyMatrix4(new THREE.Matrix4().copy(skel.boneInverses[i]).invert()).applyMatrix4(bindInv); });
  const segs = [], add = (a, bn, end) => { const i = skel.bones.findIndex(x => x.name === a); if (i >= 0 && P[a]) segs.push({ i, a: P[a], b: end || P[bn] }); };
  add('Back', 'Torso'); add('Torso', 'Torso2'); add('Torso2', 'Torso3'); add('Torso3', 'Neck1'); add('Neck1', 'Neck2'); add('Neck2', 'Neck3'); add('Neck3', 'Head');
  add('Head', null, P.Head.clone().add(new THREE.Vector3(0, 0.0, 0.55)));
  for (const s of ['L', 'R']) { add('FrontUpperLeg' + s, 'FrontLowerLeg' + s); add('FrontLowerLeg' + s, 'IKFrontLeg' + s); add('IKFrontLeg' + s, 'FF' + s);
    add('BackLeg' + s, 'BackUpperLeg' + s); add('BackUpperLeg' + s, 'BackLowerLeg' + s); add('BackLowerLeg' + s, 'IKBackLeg' + s); add('IKBackLeg' + s, 'FFB' + s);
    add('Ear1' + s, 'Ear3' + s); }
  add('Tail1', 'Tail2');
  return { P, segs };
}
function bearGeometry(wolfMesh) {
  if (bearGeo) return bearGeo;
  const skel = wolfMesh.skeleton, bindInv = new THREE.Matrix4().copy(wolfMesh.bindMatrix).invert(), { P, segs } = boneSegs(skel, bindInv), V = (x, y, z) => new THREE.Vector3(x, y, z);
  // primitives in the wolf's bind space (about 2.7 units tall, head towards +Z): [a, b, ra, rb] capsules (rounded cones)
  const C = [], cap = (a, b, ra, rb = ra) => C.push([a, b, ra, rb]);
  const hip = P.Back.clone(), chest = P.Torso3.clone(), mid = P.Torso2.clone();
  cap(hip.clone().add(V(0, -0.15, -0.1)), chest.clone().add(V(0, -0.2, 0)), 0.62, 0.66);         // barrel body
  cap(mid.clone().add(V(0, -0.35, 0)), chest.clone().add(V(0, -0.45, 0)), 0.5, 0.5);             // deep chest and belly
  cap(chest.clone().add(V(0, 0.25, -0.25)), chest.clone().add(V(0, 0.3, 0.15)), 0.42, 0.4);      // shoulder hump
  cap(chest, P.Neck3, 0.5, 0.4);                                                                 // thick neck
  cap(P.Head.clone().add(V(0, 0.02, -0.05)), P.Head.clone().add(V(0, 0.0, 0.12)), 0.36, 0.34);   // broad skull
  cap(P.Head.clone().add(V(0, -0.02, 0.2)), P.Head.clone().add(V(0, -0.1, 0.55)), 0.2, 0.13);    // short muzzle
  for (const s of ['L', 'R']) { const sx = s === 'L' ? 1 : -1;
    cap(P['Ear1' + s].clone().add(V(-sx * 0.04, -0.02, -0.02)), P['Ear1' + s].clone().add(V(0, 0.06, 0)), 0.1, 0.09);  // round ears
    cap(P['FrontUpperLeg' + s].clone().add(V(-sx * 0.05, 0.1, 0)), P['FrontLowerLeg' + s], 0.3, 0.24);
    cap(P['FrontLowerLeg' + s], P['IKFrontLeg' + s], 0.22, 0.19);
    cap(P['IKFrontLeg' + s].clone().add(V(0, -0.05, -0.05)), P['FF' + s].clone().add(V(0, 0.02, 0.06)), 0.17, 0.14);  // paw
    cap(P['BackLeg' + s].clone().add(V(-sx * 0.05, 0, 0)), P['BackUpperLeg' + s], 0.4, 0.3);      // big haunch
    cap(P['BackUpperLeg' + s], P['BackLowerLeg' + s], 0.27, 0.2);
    cap(P['BackLowerLeg' + s], P['IKBackLeg' + s], 0.2, 0.18);
    cap(P['IKBackLeg' + s].clone().add(V(0, -0.05, -0.08)), P['FFB' + s].clone().add(V(0, 0.02, 0.08)), 0.17, 0.14); }
  cap(P.Tail1, P.Tail1.clone().add(V(0, -0.05, -0.15)), 0.12, 0.08);                            // stub tail
  const sdCap = (p, [a, b, ra, rb]) => { const ba = b.clone().sub(a), pa = p.clone().sub(a), h = Math.max(0, Math.min(1, pa.dot(ba) / ba.lengthSq())); return pa.sub(ba.multiplyScalar(h)).length() - (ra + (rb - ra) * h); };
  const smin = (a, b, k) => { const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k)); return b + (a - b) * h - k * h * (1 - h); };
  const box = new THREE.Box3(); for (const c of C) { box.expandByPoint(c[0]); box.expandByPoint(c[1]); } box.expandByScalar(0.75);
  const size = box.getSize(new THREE.Vector3()), S = Math.max(size.x, size.y, size.z), ctr = box.getCenter(new THREE.Vector3()), R = 48;
  const mc = new MarchingCubes(R, new THREE.MeshBasicMaterial(), false, false, 200000);
  const F = C.map(([a, b, ra, rb]) => { const bx = b.x - a.x, by = b.y - a.y, bz = b.z - a.z; return [a.x, a.y, a.z, bx, by, bz, 1 / Math.max(1e-9, bx * bx + by * by + bz * bz), ra, rb - ra]; });
  for (let z = 0; z < R; z++) for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const px = (x / (R - 1) - 0.5) * S + ctr.x, py = (y / (R - 1) - 0.5) * S + ctr.y, pz = (z / (R - 1) - 0.5) * S + ctr.z;
    let d = 1e9; for (const f of F) { const ax = px - f[0], ay = py - f[1], az = pz - f[2]; const h = Math.max(0, Math.min(1, (ax * f[3] + ay * f[4] + az * f[5]) * f[6]));
      const qx = ax - f[3] * h, qy = ay - f[4] * h, qz = az - f[5] * h, e = Math.sqrt(qx * qx + qy * qy + qz * qz) - (f[7] + f[8] * h); d = smin(d, e, 0.16); }
    d += (Math.sin(px * 23) * Math.sin(py * 19) * Math.sin(pz * 21)) * 0.012; // a little lumpiness under the fur
    const edge = x === 0 || y === 0 || z === 0 || x === R - 1 || y === R - 1 || z === R - 1;
    mc.field[x + y * R + z * R * R] = edge ? 0 : 80 - d * 600; }
  mc.isolation = 80; mc.update();
  // MarchingCubes writes positions in [-1, 1] with x/y/z along the field's axes
  const n = mc.count, pos = new Float32Array(n * 3), src = mc.positionArray;
  for (let i = 0; i < n; i++) { pos[i * 3] = src[i * 3] * S / 2 + ctr.x; pos[i * 3 + 1] = src[i * 3 + 1] * S / 2 + ctr.y; pos[i * 3 + 2] = src[i * 3 + 2] * S / 2 + ctr.z; }
  let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g = mergeVertices(g, 1e-4); g.computeVertexNormals();
  // skin: the three nearest bone segments, weighted by closeness
  const cnt = g.attributes.position.count, J = new Uint16Array(cnt * 4), W = new Float32Array(cnt * 4), q = new THREE.Vector3(), ds = [];
  for (let v = 0; v < cnt; v++) { q.fromBufferAttribute(g.attributes.position, v); ds.length = 0;
    for (const sg of segs) { const ba = sg.b.clone().sub(sg.a), pa = q.clone().sub(sg.a), h = Math.max(0, Math.min(1, pa.dot(ba) / Math.max(1e-6, ba.lengthSq()))); ds.push([pa.sub(ba.multiplyScalar(h)).length(), sg.i]); }
    ds.sort((a, b) => a[0] - b[0]); let tw = 0; const seen = new Set(), pick = [];
    for (const [d, i] of ds) { if (seen.has(i)) continue; seen.add(i); pick.push([Math.exp(-(d - ds[0][0]) / 0.03), i]); if (pick.length === 2) break; }
    for (const [w] of pick) tw += w; pick.forEach(([w, i], k) => { J[v * 4 + k] = i; W[v * 4 + k] = w / tw; }); }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(J, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(W, 4));
  return (bearGeo = g);
}
// slice 13: animals' eyes shine in the dark (the glow of an eye catching the light), brighter as night comes
const EYES = [], EYE_MATS = new Map(); // (one shining eye material per creature type and eye, shared by every spawn: a clone per spawn grew EYES without end)
function shine(m) { m.emissive = new THREE.Color(0xffb848); m.emissiveIntensity = 0; EYES.push(m); return m; }
export function eyeShine(k) { for (const m of EYES) m.emissiveIntensity = k * 2.2; }
// eyes and nose ride the head bone
function addBearFace(mesh, skel) {
  const head = skel.bones.find(b => b.name === 'Head'), bindInv = new THREE.Matrix4().copy(mesh.bindMatrix).invert();
  const hp = new THREE.Vector3().applyMatrix4(new THREE.Matrix4().copy(skel.boneInverses[skel.bones.indexOf(head)]).invert()).applyMatrix4(bindInv);
  const put = (geo, mat, off) => { const m = new THREE.Mesh(geo, mat); m.position.copy(head.worldToLocal(mesh.localToWorld(hp.clone().add(off)))); m.scale.setScalar(1 / head.getWorldScale(new THREE.Vector3()).x * mesh.getWorldScale(new THREE.Vector3()).x); head.add(m); };
  const eye = EYE_MATS.get('bear') || EYE_MATS.set('bear', shine(new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.15 }))).get('bear'), nose = new THREE.MeshStandardMaterial({ color: 0x141010, roughness: 0.35 });
  for (const sx of [1, -1]) put(new THREE.SphereGeometry(0.04, 10, 8), eye, new THREE.Vector3(sx * 0.16, 0.1, 0.36));
  put(new THREE.SphereGeometry(0.07, 12, 8).scale(1.3, 0.85, 1), nose, new THREE.Vector3(0, -0.09, 0.59));
}

function buildBeast(type) {
  const b = BEAST[type], doc = docs[b.doc], src = SkeletonUtils.clone(doc.scene);
  const root = new THREE.Group(), inner = new THREE.Group(); root.add(inner); inner.add(src); inner.rotation.y = Math.PI; // the model faces +Z; the game's forward is -Z
  // reshape by bone scale (bear); these bones carry no scale keys, so the pose keeps it
  const bones = {}; src.traverse(o => { if (o.isBone) bones[o.name] = o; });
  // shape values are the scale each bone's own part should end up with; a bone's scale also carries down the chain,
  // so each local scale is divided by its parent's (otherwise torso x neck x head compound into a huge head)
  if (b.shape) { const eff = new Map(), want = (n) => { const s = b.shape[n]; return s === undefined ? null : Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s); };
    src.traverse(o => { if (!o.isBone) return; const pe = eff.get(o.parent) || new THREE.Vector3(1, 1, 1), w = want(o.name) || (o.name.startsWith('Tail') || o.name.startsWith('Ear') ? pe.clone() : new THREE.Vector3(1, 1, 1));
      o.scale.copy(w).divide(pe); eff.set(o, w); }); }
  if (b.lean) for (const n of ['Torso', 'Torso2']) bones[n]?.scale.set(0.88, 1, 1);
  src.updateMatrixWorld(true);
  let skinned = []; src.traverse(o => { if (o.isSkinnedMesh) skinned.push(o); });
  if (b.sculpt) { const w = skinned[0], bear = new THREE.SkinnedMesh(bearGeometry(w), new THREE.MeshStandardMaterial({ name: 'Main' }));
    for (const o of skinned) o.visible = false; w.parent.add(bear); bear.bind(w.skeleton, w.bindMatrix); addBearFace(bear, w.skeleton); skinned = [bear]; src.updateMatrixWorld(true); }
  const box = new THREE.Box3(); for (const s of skinned) { s.computeBoundingBox(); box.union(s.boundingBox.clone().applyMatrix4(s.matrixWorld)); }
  const k = b.height / (box.max.y - box.min.y); src.scale.multiplyScalar(k); src.position.y -= box.min.y * k;
  const ms = skinned[0].matrixWorld.getMaxScaleOnAxis(), perM = 1 / (k * ms); // geometry units per metre
  const set = furSet(type, b.dens / perM);
  const shells = [], mats = [];
  for (const s of skinned) {
    if (!s.visible) continue; s.castShadow = true; s.frustumCulled = false; const name = s.material.name, f = set[name];
    if (!f) { const ek = type + name; if (name.startsWith('Eye')) { if (!EYE_MATS.has(ek)) { const m = s.material.clone(); m.roughness = 0.15; EYE_MATS.set(ek, shine(m)); } s.material = EYE_MATS.get(ek); continue; }
      s.material = s.material.clone(); s.material.roughness = 0.5; continue; }
    s.material = f.base; mats.push(f.base);
    f.shells.forEach((m, i) => { const sm = new THREE.SkinnedMesh(s.geometry, m); sm.bind(s.skeleton, s.bindMatrix); sm.frustumCulled = false; sm.castShadow = false;
      m.userData.u.uLen.value = b.fur * perM; s.parent.add(sm); shells.push(sm); mats.push(m); });
  }
  const anim = new BeastAnimator(src, beastClips(doc), b);
  root.userData = { anim, mats, height: b.height, setDetail(near) { for (const s of shells) s.visible = near; }, flash: flasher(mats) };
  return root;
}
// a hit flash: all of a type's creatures share materials, so the flash is per creature through onBeforeRender
function flasher(mats) { return (k) => { for (const m of mats) m.userData.u ? (m.userData.u.uFlash.value = k) : (m.emissive?.setScalar(k * 0.6)); }; }

class BeastAnimator {
  constructor(model, clips, b) { this.mixer = new THREE.AnimationMixer(model); this.clips = clips; this.b = b; this.acts = {}; this.base = null; this.one = null; this.dead = false;
    this.mixer.addEventListener('finished', (e) => { if (this.one && e.action === this.one) { this.one.fadeOut(0.2); this.one = null; } });
    this.setBase('Idle', 0); this.mixer.update(Math.random() * 3); }
  get(n) { return this.acts[n] || (this.acts[n] = this.clips[n] && this.mixer.clipAction(this.clips[n])); }
  setBase(n, fade = 0.25) { if (this.baseName === n) return; const a = this.get(n); if (!a) return; a.reset().setEffectiveWeight(1).play();
    if (this.base) this.base.crossFadeTo(a, fade, false); this.base = a; this.baseName = n; }
  play(n, speed = 1, weight = 6) { const a = this.get(n); if (!a) return; if (this.one) this.one.stop();
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.timeScale = speed; a.setEffectiveWeight(weight); a.fadeIn(0.08); a.play(); this.one = a; }
  attack() { if (!this.dead) this.play('Attack', 1.3); }
  hit(side) { if (!this.dead) this.play(side > 0 ? 'Idle_HitReact_Right' : 'Idle_HitReact_Left', 1.4, 4); }
  die() { this.dead = true; if (this.one) { this.one.stop(); this.one = null; } const a = this.get('Death'); a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play();
    if (this.base) this.base.crossFadeTo(a, 0.15, false); this.base = a; this.baseName = 'Death'; }
  update(dt, { speed = 0, idle = 'Idle', scale = 1 } = {}) {
    if (!this.dead) { const s = speed / scale; let n = idle, ts = 1;
      if (s > this.b.walk * 1.6) { n = 'Gallop'; ts = s / this.b.run; } else if (s > 0.2) { n = 'Walk'; ts = s / this.b.walk; }
      this.setBase(n, 0.25); this.base.timeScale = Math.min(1.8, Math.max(0.5, ts)); }
    this.mixer.update(dt); }
}

// ── The rat: Poly Haven scan, moved in the vertex shader (legs scurry, body bobs, tail swings) ──
let ratGeo = null, ratMatBase = null;
function buildRat() {
  if (!ratGeo) { let m0; docs.rat.scene.traverse(o => { if (o.isMesh) m0 = o; }); ratGeo = m0.geometry.clone(); ratGeo.computeBoundingBox(); ratMatBase = m0.material; }
  const bb = ratGeo.boundingBox, len = bb.max.z - bb.min.z, k = 3.2 / len; // nose to tail tip 3.2 m before the type's scale
  const u = { uPh: { value: 0 }, uAmp: { value: 0 }, uTail: { value: 0 }, uFlash: { value: 0 }, uLook: { value: 0 } };
  const m = ratMatBase.clone(); m.userData.u = u;
  const zTail = bb.min.z + len * 0.56, yLeg = bb.min.y + (bb.max.y - bb.min.y) * 0.32, zMid = bb.min.z + len * 0.75, sz = len;
  m.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uPh, uAmp, uTail, uLook;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float legW = 1. - smoothstep(${(yLeg * 0.4).toFixed(5)}, ${yLeg.toFixed(5)}, position.y);
          float front = step(${zMid.toFixed(5)}, position.z), side = step(0., position.x);
          float ph = uPh + side * 3.1416 + front * 3.1416;
          transformed.z += sin(ph) * uAmp * ${(sz * 0.05).toFixed(5)} * legW * step(${zTail.toFixed(5)}, position.z);
          transformed.y += max(0., cos(ph)) * uAmp * ${(sz * 0.02).toFixed(5)} * legW * step(${zTail.toFixed(5)}, position.z);
          transformed.y += sin(uPh * 2.) * uAmp * ${(sz * 0.006).toFixed(5)};
          float t = max(0., ${zTail.toFixed(5)} - position.z) / ${(len * 0.56).toFixed(5)};
          transformed.x += sin(uTail - t * 4.) * t * t * ${(sz * 0.12).toFixed(5)};
          float hd = smoothstep(${(bb.max.z - len * 0.12).toFixed(5)}, ${bb.max.z.toFixed(5)}, position.z);
          transformed.x += uLook * hd * ${(sz * 0.03).toFixed(5)}; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFlash;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb * 1.15, vec3(1., .95, .85), uFlash);'); };
  m.customProgramCacheKey = () => 'iwrat';
  const mesh = new THREE.Mesh(ratGeo, m); mesh.castShadow = true; mesh.scale.setScalar(k); mesh.position.y = -bb.min.y * k; mesh.rotation.y = Math.PI;
  const root = new THREE.Group(); root.add(mesh);
  let ph = Math.random() * 6, tl = 0, dying = 0, lunge = 0;
  const anim = { dead: false,
    update(dt, { speed = 0, scale = 1 } = {}) { const s = speed / scale; ph += dt * (s > 0.1 ? 6 + s * 5 : 0); tl += dt * (2 + s * 3);
      u.uPh.value = ph; u.uAmp.value += ((s > 0.1 ? 1 : 0) - u.uAmp.value) * Math.min(1, dt * 10); u.uTail.value = tl;
      u.uLook.value = Math.sin(tl * 0.7) * (s > 0.1 ? 0.2 : 1);
      lunge = Math.max(0, lunge - dt * 4); mesh.position.z = -Math.sin(lunge * Math.PI) * 0.25; mesh.rotation.x = -Math.sin(lunge * Math.PI) * 0.25;
      if (dying) { dying = Math.min(1, dying + dt * 4); mesh.rotation.z = dying * Math.PI * 0.95; } },
    attack() { lunge = 1; }, hit() { lunge = 0.5; }, die() { this.dead = true; dying = 0.01; } };
  root.userData = { anim, mats: [m], height: 0.8, setDetail() {}, flash: (v) => { u.uFlash.value = v; } };
  return root;
}

// ── Built creatures: materials ──
function canvasTex(size, draw, repeat = 1) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
let BM = null;
function builtMats() {
  if (BM) return BM;
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // chitin: blue-grey plates with frost speckle and dark seams
  const chitin = canvasTex(256, (g, n) => { g.fillStyle = '#5d7d92'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 900; i++) { const v = 120 + rnd() * 120; g.fillStyle = `rgba(${v * 0.85},${v * 0.95},${v},${0.15 + rnd() * 0.3})`; g.beginPath(); g.arc(rnd() * n, rnd() * n, rnd() * 5 + 0.5, 0, 6.3); g.fill(); }
    g.strokeStyle = 'rgba(20,30,40,0.55)'; for (let i = 0; i < 40; i++) { g.lineWidth = 0.5 + rnd() * 1.5; g.beginPath(); const x = rnd() * n, y = rnd() * n; g.moveTo(x, y); g.bezierCurveTo(x + rnd() * 40 - 20, y + rnd() * 40 - 20, x + rnd() * 60 - 30, y + rnd() * 60 - 30, x + rnd() * 80 - 40, y + rnd() * 80 - 40); g.stroke(); } });
  // wet amphibian skin: olive with dark blotches, pale warts
  const skin = canvasTex(512, (g, n) => { const gr = g.createLinearGradient(0, 0, 0, n); gr.addColorStop(0, '#2c3220'); gr.addColorStop(1, '#3a3e26'); g.fillStyle = gr; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(${20 + rnd() * 20},${26 + rnd() * 20},${12},${0.35 + rnd() * 0.4})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 6 + rnd() * 26, 5 + rnd() * 18, rnd() * 3, 0, 6.3); g.fill(); }
    for (let i = 0; i < 1400; i++) { const v = 90 + rnd() * 80; g.fillStyle = `rgba(${v},${v * 1.02},${v * 0.7},${0.25 + rnd() * 0.4})`; g.beginPath(); g.arc(rnd() * n, rnd() * n, 0.6 + rnd() * 2.6, 0, 6.3); g.fill(); } }, 2);
  const belly = canvasTex(256, (g, n) => { g.fillStyle = '#8a8458'; g.fillRect(0, 0, n, n); for (let i = 0; i < 600; i++) { const v = 110 + rnd() * 60; g.fillStyle = `rgba(${v},${v * 0.95},${v * 0.6},0.4)`; g.fillRect(rnd() * n, rnd() * n, 2, 2); } });
  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  BM = {
    chitin: P({ map: chitin, color: 0x8c9ca6, roughness: 0.62, metalness: 0.0, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
    chitinDark: P({ map: chitin, color: 0x4a5a66, roughness: 0.6, clearcoat: 0.2, clearcoatRoughness: 0.5 }),
    ice: P({ color: 0xd8f0ff, roughness: 0.08, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.82, emissive: 0x2a5068, emissiveIntensity: 0.4, envMapIntensity: 1.6 }),
    mandible: P({ color: 0x1c2228, roughness: 0.25, clearcoat: 1 }),
    eyeGlow: new THREE.MeshBasicMaterial({ color: 0x9ff4ff }),
    skin: new THREE.MeshStandardMaterial({ map: skin, color: 0xb0a890, roughness: 0.88 }),
    belly: new THREE.MeshStandardMaterial({ map: belly, color: 0x847c68, roughness: 0.9 }),
    mouth: new THREE.MeshStandardMaterial({ color: 0x3a2220, roughness: 0.6 }),
    teeth: P({ color: 0xd8d0b0, roughness: 0.3 }),
    lurkEye: shine(P({ color: 0x6a5a20, roughness: 0.2, clearcoat: 0.5 })),
    pupil: new THREE.MeshBasicMaterial({ color: 0x050505 }),
  };
  return BM;
}
const mk = (geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); m.scale.set(...s); m.castShadow = true; return m; };
// lumpy sphere: noise-displaced, smooth normals
function lumpy(r, w, h, seed, amp = 0.12) { const g = new THREE.SphereGeometry(r, w, h), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = Math.sin(v.x * 9 + seed) * Math.sin(v.y * 7 + seed * 2) * Math.sin(v.z * 8 + seed * 3) + 0.5 * Math.sin(v.x * 23 + v.z * 17 + seed);
    v.multiplyScalar(1 + n * amp); p.setXYZ(i, v.x, v.y, v.z); } g.computeVertexNormals(); return g; }

// ── Ice crawler: segmented body, six two-part legs, crystal spines; facing -Z ──
function buildCrawler() {
  const M = builtMats(), root = new THREE.Group(), body = new THREE.Group(); root.add(body); body.position.y = 0.55;
  const segs = [];
  const segDef = [[0.0, 0.30, 0.42], [0.36, 0.34, 0.40], [0.72, 0.30, 0.36], [1.02, 0.24, 0.30], [1.26, 0.17, 0.24]];
  let parent = body;
  segDef.forEach(([z, r, w], i) => { const g = new THREE.Group(); g.position.z = i ? z - segDef[i - 1][0] : 0; parent.add(g); parent = g; segs.push(g);
    g.add(mk(lumpy(r, 18, 12, i * 3.1, 0.05), M.chitin, [0, 0, 0], [0, 0, 0], [w / r, 0.72, 1.0]));
    g.add(mk(new THREE.SphereGeometry(r * 0.98, 16, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), M.chitinDark, [0, -0.02, 0], [0, 0, 0], [w / r * 0.95, 0.7, 0.95]));
    // crystal spines along the back
    for (let k = 0; k < (i < 4 ? 3 : 1); k++) { const sx = (k - 1) * w * 0.55 * (i < 4 ? 1 : 0), hgt = (0.22 + (i === 1 ? 0.15 : 0) - Math.abs(sx) * 0.5) * (i < 4 ? 1 : 0.6);
      g.add(mk(new THREE.ConeGeometry(0.06, hgt, 5), M.ice, [sx, r * 0.62 + hgt * 0.4, 0], [-0.5, 0, -sx * 1.2])); } });
  // head with mandibles and glowing eyes, at the front (-Z)
  const head = new THREE.Group(); head.position.set(0, 0.0, -0.36); body.add(head);
  head.add(mk(lumpy(0.22, 16, 12, 9, 0.06), M.chitin, [0, 0, 0], [0, 0, 0], [1.25, 0.75, 1.1]));
  const mand = [-1, 1].map(sx => { const g = new THREE.Group(); g.position.set(sx * 0.12, -0.06, -0.2); head.add(g);
    g.add(mk(new THREE.ConeGeometry(0.035, 0.32, 6), M.mandible, [sx * 0.04, 0, -0.14], [-Math.PI / 2, 0, sx * 0.5])); return g; });
  for (const sx of [-1, 1]) for (const k of [0, 1]) head.add(mk(new THREE.SphereGeometry(0.03, 8, 6), M.eyeGlow, [sx * (0.1 + k * 0.06), 0.08 - k * 0.03, -0.2 + k * 0.04]));
  // antennae
  for (const sx of [-1, 1]) head.add(mk(new THREE.CylinderGeometry(0.006, 0.012, 0.5, 4), M.chitinDark, [sx * 0.08, 0.15, -0.35], [-1.1, 0, sx * 0.35]));
  // legs: hip on segments 0..2, femur up and out, tibia down to the ground
  const legs = [];
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * segDef[i][2] * 0.85, -0.05, 0); segs[i].add(hip);
    const femur = new THREE.Group(); hip.add(femur); femur.rotation.z = sx * 0.9; femur.add(mk(new THREE.CylinderGeometry(0.035, 0.05, 0.5, 6), M.chitin, [sx * 0.25, 0, 0], [0, 0, Math.PI / 2]));
    const knee = new THREE.Group(); knee.position.x = sx * 0.5; femur.add(knee); knee.rotation.z = -sx * 2.1;
    knee.add(mk(new THREE.CylinderGeometry(0.012, 0.035, 0.62, 6), M.chitinDark, [sx * 0.31, 0, 0], [0, 0, Math.PI / 2]));
    knee.add(mk(new THREE.ConeGeometry(0.02, 0.1, 5), M.ice, [sx * 0.64, 0, 0], [0, 0, -sx * Math.PI / 2]));
    legs.push({ hip, femur, knee, sx, i, group: (i + (sx > 0 ? 1 : 0)) % 2 });
  }
  let ph = Math.random() * 6, atk = 0, dying = 0, hitT = 0;
  const anim = { dead: false,
    update(dt, { speed = 0, scale = 1 } = {}) { const s = speed / scale, moving = s > 0.15 ? 1 : 0; ph += dt * (moving ? 5 + s * 2.2 : 1.2);
      for (const L of legs) { const p = ph + L.group * Math.PI + L.i * 0.3; L.hip.rotation.y = Math.sin(p) * 0.45 * moving * -L.sx; L.femur.rotation.z = L.sx * (0.9 + Math.max(0, Math.cos(p)) * 0.35 * moving + (dying ? dying * 0.8 : 0)); }
      segs.forEach((g, i) => { if (i) g.rotation.y = Math.sin(ph * 0.5 - i * 0.8) * (moving ? 0.12 : 0.04); });
      body.position.y = 0.55 - (dying ? dying * 0.4 : 0) + Math.abs(Math.sin(ph)) * 0.025 * moving;
      atk = Math.max(0, atk - dt * 3); const a = Math.sin(atk * Math.PI); body.rotation.x = a * 0.35 - hitT * 0.4; head.position.z = -0.36 - a * 0.12;
      mand.forEach((m, k) => m.rotation.y = (k ? -1 : 1) * (0.25 + 0.6 * a + 0.12 * Math.sin(ph * 3)));
      hitT = Math.max(0, hitT - dt * 4); if (dying) { dying = Math.min(1, dying + dt * 2.5); body.rotation.z = dying * 2.6; } },
    attack() { atk = 1; }, hit() { hitT = 1; }, die() { this.dead = true; dying = 0.01; } };
  const mats = [M.chitin, M.chitinDark];
  root.userData = { anim, height: 0.8, setDetail() {}, flash: perMeshFlash(root) };
  return root;
}

// ── Bog lurker: a long wet amphibian, low and wide, big mouth; facing -Z ──
function buildLurker() {
  const M = builtMats(), root = new THREE.Group(), body = new THREE.Group(); root.add(body); body.position.y = 0.42;
  body.add(mk(lumpy(0.5, 28, 18, 2.2, 0.08), M.skin, [0, 0.02, 0.05], [0, 0, 0], [1.05, 0.6, 1.55]));
  body.add(mk(lumpy(0.48, 20, 12, 5.1, 0.03), M.belly, [0, -0.1, 0.05], [0, 0, 0], [1.0, 0.45, 1.45]));
  // warts / ridge
  for (let i = 0; i < 14; i++) body.add(mk(new THREE.SphereGeometry(0.03 + (i % 3) * 0.012, 8, 6), M.skin, [Math.sin(i * 2.3) * 0.3, 0.29 - Math.abs(Math.sin(i * 2.3)) * 0.05, -0.5 + i * 0.08], [0, 0, 0], [1.4, 0.5, 1.4]));
  // tail
  const tail = []; let tp = body;
  for (let i = 0; i < 5; i++) { const g = new THREE.Group(); g.position.z = i ? 0.24 : 0.72; tp.add(g); tp = g; tail.push(g); g.add(mk(lumpy(0.2 - i * 0.032, 12, 8, i, 0.05), M.skin, [0, 0, 0.1], [0, 0, 0], [1, 0.6, 1.6])); }
  // head: upper skull and a jaw that drops
  const head = new THREE.Group(); head.position.set(0, 0.04, -0.72); body.add(head);
  head.add(mk(lumpy(0.36, 22, 14, 7.7, 0.05), M.skin, [0, 0.05, -0.12], [0, 0, 0], [1.15, 0.45, 1.05]));
  const jaw = new THREE.Group(); jaw.position.set(0, -0.04, 0.12); head.add(jaw);
  jaw.add(mk(lumpy(0.34, 20, 10, 3.3, 0.03), M.belly, [0, -0.06, -0.24], [0, 0, 0], [1.1, 0.28, 1.0]));
  jaw.add(mk(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.mouth, [0, -0.02, -0.24], [0, 0, 0], [1.05, 0.25, 0.95]));
  for (let i = 0; i < 12; i++) { const a = (i / 11 - 0.5) * 2.6; head.add(mk(new THREE.ConeGeometry(0.018, 0.07, 4), M.teeth, [Math.sin(a) * 0.36, -0.03, -0.12 - Math.cos(a) * 0.33], [Math.PI, 0, 0])); }
  for (const sx of [-1, 1]) { head.add(mk(new THREE.SphereGeometry(0.085, 12, 8), M.skin, [sx * 0.22, 0.17, -0.02])); head.add(mk(new THREE.SphereGeometry(0.07, 12, 8), M.lurkEye, [sx * 0.23, 0.2, -0.05], [0, 0, 0], [0.8, 0.8, 0.8]));
    head.add(mk(new THREE.BoxGeometry(0.014, 0.08, 0.02), M.pupil, [sx * 0.235, 0.205, -0.115])); }
  // four splayed legs
  const legs = [];
  for (const [z, sx, k] of [[-0.45, -1, 0], [-0.45, 1, 1], [0.45, -1, 1], [0.45, 1, 0]]) { const hip = new THREE.Group(); hip.position.set(sx * 0.42, -0.05, z); body.add(hip);
    const up = mk(lumpy(0.1, 10, 8, z + sx, 0.05), M.skin, [sx * 0.22, -0.14, 0], [0, 0, sx * 0.9], [1, 3.0, 1]); hip.add(up);
    const foot = mk(lumpy(0.09, 10, 6, sx * 3, 0.1), M.skin, [sx * 0.45, -0.36, -0.04], [0, 0, 0], [1.4, 0.4, 1.6]); hip.add(foot); legs.push({ hip, sx, k }); }
  let ph = Math.random() * 6, atk = 0, dying = 0, hitT = 0, breathe = Math.random() * 6;
  const anim = { dead: false, submerged: 0,
    update(dt, { speed = 0, scale = 1 } = {}) { const s = speed / scale, moving = s > 0.15 ? 1 : 0; ph += dt * (moving ? 3 + s * 2 : 0); breathe += dt * 2;
      for (const L of legs) { const p = ph + L.k * Math.PI; L.hip.rotation.y = Math.sin(p) * 0.5 * moving * L.sx; L.hip.position.y = -0.05 + Math.max(0, Math.cos(p)) * 0.06 * moving; }
      body.rotation.y = Math.sin(ph) * 0.12 * moving; tail.forEach((g, i) => g.rotation.y = Math.sin(ph * (moving ? 1 : 0.3) + breathe * 0.2 - i * 0.7) * (0.18 + 0.08 * i) * (moving ? 1 : 0.4));
      body.scale.set(1 + Math.sin(breathe) * 0.015, 1 + Math.sin(breathe) * 0.03, 1);
      atk = Math.max(0, atk - dt * 2.4); const a = Math.sin(atk * Math.PI); jaw.rotation.x = 0.08 + a * 0.75 + (moving ? 0 : Math.max(0, Math.sin(breathe * 0.3)) * 0.06); head.rotation.x = -a * 0.35 + hitT * 0.3;
      body.position.y = 0.42 - (dying ? dying * 0.25 : 0); hitT = Math.max(0, hitT - dt * 4);
      if (dying) { dying = Math.min(1, dying + dt * 2); body.rotation.z = dying * 2.9; } },
    attack() { atk = 1; }, hit() { hitT = 1; }, die() { this.dead = true; dying = 0.01; } };
  root.userData = { anim, height: 0.8, setDetail() {}, flash: perMeshFlash(root) };
  return root;
}
// built creatures share materials across instances: a flash swaps in per-creature emissive clones
function perMeshFlash(root) { let on = false; const orig = new Map();
  return (k) => { if (k > 0.01 && !on) { on = true; root.traverse(o => { if (o.isMesh && o.material.emissive) { orig.set(o, o.material); o.material = o.material.clone(); } }); }
    if (on) { for (const o of orig.keys()) o.material.emissive.setRGB(k * 0.8, k * 0.75, k * 0.7); }
    if (k <= 0.01 && on) { on = false; for (const [o, m] of orig) { o.material.dispose(); o.material = m; } orig.clear(); } }; }

// Raiders are people: the player characters' rigged bodies in raider looks (characters.js), with their own materials
// (the hit flash brightens them; the shader recolour is kept) and the metal of their scrap armour rusted.
function buildRaider(type) { const m = buildCharacter({ id: type, color: 0x8a3a2a }), rust = new THREE.Color(0.62, 0.46, 0.34);
  m.traverse(o => { if (!o.isMesh || !o.material.emissive) return; const src = o.material, c = src.clone(); c.onBeforeCompile = src.onBeforeCompile; c.customProgramCacheKey = src.customProgramCacheKey;
    if (c.metalness > 0.9) { c.color.multiply(rust); c.roughness = Math.max(c.roughness, 0.75); } o.material = c; });
  const mats = []; m.traverse(o => { if (o.isMesh && o.material.emissive) mats.push(o.material); });
  Object.assign(m.userData, { height: 1.8, setDetail() {}, flash: (k) => { for (const c of mats) c.emissive.setRGB(k * 0.8, k * 0.75, k * 0.7); } });
  return m; }
export function buildCreature(type) {
  if (type === 'brawler' || type === 'shooter' || type === 'heavy') return buildRaider(type);
  if (type === 'rat') return buildRat();
  if (type === 'ice_crawler') return buildCrawler();
  if (type === 'bog_lurker') return buildLurker();
  return buildBeast(type);
}
