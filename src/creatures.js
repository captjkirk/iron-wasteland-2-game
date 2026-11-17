// Enemies. Rigged and animated CC0 animals where they exist, built ones where they do not:
//  wolf        Quaternius "Ultimate Animated Animals" Wolf (12 clips), shell fur
//  dust_hound  Quaternius Fox, recoloured sand and lean, shell fur
//  bear        bear.js: its own skeleton and sculpted body, a procedural gait with planted feet (slice 19)
//  rat         Poly Haven "Street Rat" (static, scanned-quality textures), legs and tail moved in the vertex shader
//  ice_crawler crawler.js: a frost isopod, twelve planted legs (slice 19)
//  bog_lurker  lurker.js: a giant salamander sculpted on its own skeleton, planted legs (slice 19)
//  spider      spider.js: a giant hairy hunting spider, eight planted legs; spider_nest its silk mound (slice 22)
//  brawler, shooter, heavy  raiders (IW1's human enemies): the player characters' rigged bodies in raider looks
// loadCreatures() once; buildCreature(type) returns a Group whose userData.anim has update(dt, {speed}), attack(),
// hit(side), die(); userData.flash(k) tints it white for a hit; userData.setDetail(near) toggles fur shells.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ENEMY } from './config.js';
import { buildCharacter } from './characters.js';
import { furMaterial, SHELLS } from './fur.js';
import { buildBear } from './bear.js';
import { buildCrawler } from './crawler.js';
import { buildLurker } from './lurker.js';
import { buildSpider, buildNest } from './spider.js';

const DIR = new URL('../assets/beasts/', import.meta.url).href;
const docs = {};
async function loadDoc(name) {
  const txt = await (await fetch(DIR + name + '.json')).text();
  return new Promise((res, rej) => new GLTFLoader().parse(txt, DIR, res, rej));
}
export async function loadCreatures() {
  await Promise.all(
    ['wolf', 'fox', 'rat'].map(async (k) => {
      docs[k] = await loadDoc(k);
    }),
  );
  // the Quaternius animals are flat-shaded: weld the split vertices and smooth the normals (fur wants a soft surface)
  for (const k of ['wolf', 'fox'])
    docs[k].scene.traverse((o) => {
      if (o.isSkinnedMesh) {
        const g = o.geometry.clone();
        g.deleteAttribute('normal');
        const w = mergeVertices(g, 1e-4);
        w.computeVertexNormals();
        o.geometry = w;
      }
    });
}

// ── Rigged beasts (Quaternius wolf and fox) ──
const BEAST = {
  // (round 1: shorter, softer coats with a real pattern, coat(); thicker legs on the wolf)
  wolf: {
    doc: 'wolf',
    height: 1.0,
    mats: { Main: 0xffffff, Main_Light: 0xffffff },
    fur: 0.03,
    dens: 160,
    tip: 1.0,
    root: 0.85,
    walk: 1.5,
    run: 4.5,
    coat: 'wolf',
    shape: {
      FrontUpperLegL: [1.22, 1, 1.22],
      FrontUpperLegR: [1.22, 1, 1.22],
      FrontLowerLegL: [1.3, 1, 1.3],
      FrontLowerLegR: [1.3, 1, 1.3],
      BackUpperLegL: [1.15, 1, 1.15],
      BackUpperLegR: [1.15, 1, 1.15],
      BackLowerLegL: [1.3, 1, 1.3],
      BackLowerLegR: [1.3, 1, 1.3],
    },
  },
  dust_hound: {
    doc: 'fox',
    height: 1.0,
    mats: { Main: 0xffffff, Main_Light: 0xffffff, Grey: 0xffffff },
    fur: 0.022,
    dens: 170,
    tip: 1.0,
    root: 0.85,
    walk: 1.5,
    run: 4.6,
    lean: true,
    coat: 'hound',
    shape: { 'Tail1': 0.6, 'Ear1L': 0.85, 'Ear1R': 0.85 },
  },
};
const COMB = null; // (combed fur made the wolf read shaggy, slice 19: the Quaternius coats keep their strands standing; the bear's coat is combed)
// every creature gets its own fur materials (same shader program), so a hit flash tints only the one that was hit
function furSet(type, dens) {
  const b = BEAST[type],
    set = {};
  for (const [name, col] of Object.entries(b.mats)) {
    const vcol = !!b.coat;
    set[name] = { base: furMaterial(col, { dens, tip: b.tip, comb: COMB, vcol, root: b.root }), shells: [] };
    for (let k = 1; k <= SHELLS; k++)
      set[name].shells.push(
        furMaterial(col, { h: k / SHELLS, dens, len: 0, tip: b.tip, comb: COMB, vcol, root: b.root }),
      );
  }
  return set;
}
// a coat pattern painted into the geometry's vertex colours (in the model's rest space: +y up, +z toward the nose; the
// wolf's nose is at z 2.5, its tail tip at z -3, its back at y 2.2): a grey wolf's dark saddle and tail tip over buff
// flanks, a cream belly, chest, throat, inner legs and muzzle; the hound a sandy coat with a pale throat and dark socks
const COATS = {
  wolf: (x, y, z, light) => {
    const ax = Math.abs(x),
      C = (h) => _cc.set(h);
    const c = C(light ? 0xa89c86 : 0x847866);
    const saddle = sm(1.55, 1.95, y) * sm(-1.6, -0.9, z) * (1 - sm(0.9, 1.5, z)) * (1 - sm(0.32, 0.5, ax) * 0.6); // the dark saddle over the back
    const belly = (1 - sm(1.0, 1.35, y)) * sm(-1.4, -0.9, z) * (1 - sm(1.4, 1.7, z)) * (1 - sm(0.16, 0.36, ax) * 0.75); // belly and inner legs
    const chest = sm(0.9, 1.3, z) * (1 - sm(1.35, 1.65, y)) * (1 - sm(0.2, 0.36, ax)) * (1 - sm(2.0, 2.2, z)); // chest and throat
    const muzzle = sm(2.1, 2.35, z) * (1 - sm(2.05, 2.2, y)),
      cheek = sm(1.85, 2.05, z) * (1 - sm(1.9, 2.02, y)) * sm(0.15, 0.3, ax);
    const tail = 1 - sm(-2.55, -2.3, z),
      legs = (1 - sm(0.6, 1.0, y)) * (1 - belly * 0.6),
      face = sm(1.7, 1.95, z) * sm(1.95, 2.25, y);
    c.lerp(_c2.set(0x3e3a34), saddle * 0.85)
      .lerp(_c2.set(0xd6cbb2), Math.max(belly * 0.85, chest, muzzle * 0.8, cheek * 0.6))
      .lerp(_c2.set(0x8c7458), legs * 0.75)
      .lerp(_c2.set(0x5e5648), face * 0.6)
      .lerp(_c2.set(0x23201c), tail * 0.9);
    return c;
  },
  hound: (x, y, z, light) => {
    const ax = Math.abs(x),
      c = _cc.set(light ? 0xe0cfa8 : 0xc0975e);
    const back = sm(1.9, 2.3, y) * sm(-1.4, -0.8, z) * (1 - sm(0.9, 1.4, z));
    const throat = sm(1.0, 1.5, z) * (1 - sm(1.7, 2.0, y)) * (1 - sm(0.22, 0.42, ax)),
      belly = (1 - sm(1.2, 1.55, y)) * (1 - sm(0.2, 0.4, ax) * 0.5);
    const socks = 1 - sm(0.55, 0.85, y),
      tail = 1 - sm(-2.9, -2.6, z);
    c.lerp(_c2.set(0x8a6236), back * 0.6)
      .lerp(_c2.set(0xeadfc6), Math.max(throat, belly * 0.8))
      .lerp(_c2.set(0x3a2c20), socks * 0.9)
      .lerp(_c2.set(0xeee6d6), tail * 0.8);
    return c;
  },
};
const _cc = new THREE.Color(),
  _c2 = new THREE.Color(),
  sm = (a, b, v) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
function paintCoat(geo, kind, light) {
  if (geo.userData.coat) return;
  const p = geo.attributes.position,
    col = new Float32Array(p.count * 3),
    f = COATS[kind];
  for (let i = 0; i < p.count; i++) {
    const c = f(p.getX(i), p.getY(i), p.getZ(i), light);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.userData.coat = true;
}
function beastClips(doc) {
  if (doc.userData.clips) return doc.userData.clips;
  const c = {};
  for (const a of doc.animations) {
    const tr = a.tracks.filter((t) => !t.name.endsWith('.scale'));
    c[a.name] = new THREE.AnimationClip(a.name, a.duration, tr);
  }
  return (doc.userData.clips = c);
}

// slice 13: animals' eyes shine in the dark (the glow of an eye catching the light), brighter as night comes
const EYES = [],
  EYE_MATS = new Map(); // (one shining eye material per creature type and eye, shared by every spawn: a clone per spawn grew EYES without end)
function shine(m) {
  m.emissive = new THREE.Color(0xffb848);
  m.emissiveIntensity = 0;
  EYES.push(m);
  return m;
}
export function eyeShine(k) {
  for (const m of EYES) m.emissiveIntensity = k * 2.2;
}
function buildBeast(type) {
  const b = BEAST[type],
    doc = docs[b.doc],
    src = SkeletonUtils.clone(doc.scene);
  const root = new THREE.Group(),
    inner = new THREE.Group();
  root.add(inner);
  inner.add(src);
  inner.rotation.y = Math.PI; // the model faces +Z; the game's forward is -Z
  // reshape by bone scale (bear); these bones carry no scale keys, so the pose keeps it
  const bones = {};
  src.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
  });
  // shape values are the scale each bone's own part should end up with; a bone's scale also carries down the chain,
  // so each local scale is divided by its parent's (otherwise torso x neck x head compound into a huge head)
  if (b.shape) {
    const eff = new Map(),
      want = (n) => {
        const s = b.shape[n];
        return s === undefined ? null : Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s);
      };
    src.traverse((o) => {
      if (!o.isBone) return;
      const pe = eff.get(o.parent) || new THREE.Vector3(1, 1, 1),
        w =
          want(o.name) ||
          (o.name.startsWith('Tail') || o.name.startsWith('Ear') ? pe.clone() : new THREE.Vector3(1, 1, 1));
      o.scale.copy(w).divide(pe);
      eff.set(o, w);
    });
  }
  src.updateMatrixWorld(true);
  let skinned = [];
  src.traverse((o) => {
    if (o.isSkinnedMesh) skinned.push(o);
  });
  const box = new THREE.Box3();
  for (const s of skinned) {
    s.computeBoundingBox();
    box.union(s.boundingBox.clone().applyMatrix4(s.matrixWorld));
  }
  const k = b.height / (box.max.y - box.min.y);
  src.scale.multiplyScalar(k);
  src.position.y -= box.min.y * k;
  const ms = skinned[0].matrixWorld.getMaxScaleOnAxis(),
    perM = 1 / (k * ms); // geometry units per metre
  const set = furSet(type, b.dens / perM);
  const shells = [],
    mats = [];
  for (const s of skinned) {
    if (!s.visible) continue;
    s.castShadow = true;
    // skipped when off screen (lane E, November 16, 2026: every near beast and each of its fur shells was drawn in the main
    // and mirror passes even behind the camera): the culling sphere is the rest pose's box doubled, so no stride, lunge or
    // fall reaches past it and a beast in view is never skipped. The shells share it (they hang off the same parent).
    s.boundingSphere = s.boundingBox.getBoundingSphere(new THREE.Sphere());
    s.boundingSphere.radius *= 2;
    const name = s.material.name,
      f = set[name];
    if (!f) {
      const ek = type + name;
      if (name.startsWith('Eye')) {
        if (!EYE_MATS.has(ek)) {
          const m = s.material.clone();
          m.roughness = 0.15;
          EYE_MATS.set(ek, shine(m));
        }
        s.material = EYE_MATS.get(ek);
        continue;
      }
      s.material = s.material.clone();
      s.material.roughness = 0.5;
      continue;
    }
    if (b.coat) paintCoat(s.geometry, b.coat, name === 'Main_Light'); // (the geometry is shared by every clone: painted once)
    s.material = f.base;
    mats.push(f.base);
    f.shells.forEach((m, i) => {
      const sm = new THREE.SkinnedMesh(s.geometry, m);
      sm.bind(s.skeleton, s.bindMatrix);
      sm.boundingSphere = s.boundingSphere.clone().applyMatrix4(s.matrix); // (the shell sits at its parent's origin, the base mesh at s.matrix)
      sm.castShadow = false;
      m.userData.u.uLen.value = b.fur * perM;
      s.parent.add(sm);
      shells.push(sm);
      mats.push(m);
    });
  }
  if (b.lean) for (const s of skinned) leanGeo(s, 0.88);
  const anim = new BeastAnimator(src, beastClips(doc), b);
  anim.speeds = { Walk: clipSpeed(type, doc, k, 'Walk'), Gallop: clipSpeed(type, doc, k, 'Gallop') };
  anim.root = root;
  anim.yaw = 0;
  anim.neck = bones.Neck2 || bones.Neck1;
  anim.head = bones.Head;
  root.userData = {
    anim,
    mats,
    height: b.height,
    setDetail(near) {
      for (const s of shells) s.visible = near;
    },
    flash: flasher(mats),
    paws: pawTips(src),
  };
  return root;
}
// the hound's lean: its body narrower side to side, as the Torso and Torso2 bones scaled 0.88 across once did (so 0.88 at the
// torso, 0.88 x 0.88 from Torso2 on: chest, neck, head, front legs). Done in the shared geometry, once, in the model's rest space
// (x is across the body there, the spine on x 0), weighted by each vertex's bones. (slice 25, #54: a bone scaled unevenly shears
// every bone below it as they turn: the hound's head stretched up to a quarter as its neck moved, and the head turn, reading its
// rotation back from that sheared neck, resized the head a little every frame, without end: the giant fox head)
function leanGeo(s, k) {
  const g = s.geometry;
  if (g.userData.lean) return;
  const f = s.skeleton.bones.map((bn) => {
    let n = 0;
    for (let o = bn; o; o = o.parent) if (o.name === 'Torso' || o.name === 'Torso2') n++;
    return k ** n;
  });
  const p = g.attributes.position,
    si = g.attributes.skinIndex,
    sw = g.attributes.skinWeight;
  for (let i = 0; i < p.count; i++) {
    let m = 0;
    for (let j = 0; j < 4; j++) m += sw.getComponent(i, j) * f[si.getComponent(i, j)];
    p.setX(i, p.getX(i) * m);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  g.userData.lean = true;
}
// a hit flash: all of a type's creatures share materials, so the flash is per creature through onBeforeRender
function flasher(mats) {
  return (k) => {
    for (const m of mats) m.userData.u ? (m.userData.u.uFlash.value = k) : m.emissive?.setScalar(k * 0.6);
  };
}

class BeastAnimator {
  constructor(model, clips, b) {
    this.mixer = new THREE.AnimationMixer(model);
    this.clips = clips;
    this.b = b;
    this.acts = {};
    this.base = null;
    this.one = null;
    this.dead = false;
    this.ph = 0;
    this.rate = 0.92 + Math.random() * 0.16;
    this.mixer.addEventListener('finished', (e) => {
      if (this.one && e.action === this.one) {
        this.one.fadeOut(0.2);
        this.one = null;
      }
    });
    this.setBase('Idle', 0);
    this.mixer.update(Math.random() * 3);
  }
  get(n) {
    return this.acts[n] || (this.acts[n] = this.clips[n] && this.mixer.clipAction(this.clips[n]));
  }
  // (Jared, November 15, 2026, several creatures at once: "they're in sync with animations": a pack alerted together started its
  // gallop on the same frame and ran in lockstep. A pack's members now start a clip each at its own point in the cycle (ph, set
  // by its place in the pack: game.js spawnEnemy; a creature on its own starts at the beginning, as before), and each idles a
  // little faster or slower than its neighbours; the walk and gallop rates still follow its feet)
  setBase(n, fade = 0.25) {
    if (this.baseName === n) return;
    const a = this.get(n);
    if (!a) return;
    a.reset().setEffectiveWeight(1).play();
    if (n !== 'Death') a.time = this.ph * a.getClip().duration;
    if (this.base) this.base.crossFadeTo(a, fade, false);
    this.base = a;
    this.baseName = n;
  }
  play(n, speed = 1, weight = 6) {
    const a = this.get(n);
    if (!a) return;
    if (this.one) this.one.stop();
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.timeScale = speed;
    a.setEffectiveWeight(weight);
    a.fadeIn(0.08);
    a.play();
    this.one = a;
  }
  attack() {
    if (!this.dead) this.play('Attack', 1.3);
  }
  hit(side) {
    if (!this.dead) this.play(side > 0 ? 'Idle_HitReact_Right' : 'Idle_HitReact_Left', 1.4, 4);
  }
  die() {
    this.dead = true;
    if (this.one) {
      this.one.stop();
      this.one = null;
    }
    const a = this.get('Death');
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.play();
    if (this.base) this.base.crossFadeTo(a, 0.15, false);
    this.base = a;
    this.baseName = 'Death';
  }
  // slice 19: the walk and gallop play at the rate their own feet travel (measured from the clips: clipSpeed), so the
  // paws stay put on the ground instead of skating; a hunter turns its head toward its quarry
  // (gate fix: the gait is picked from the speed eased over about a tenth of a second, with a margin each way, so a
  // one-frame shove in a fight no longer flips idle, gallop, idle and restarts the clip each time; on stopping, the
  // stride it was in holds still while it blends to the idle pose (it ran on in place for the blend, the paws skating
  // 10 to 30 cm a frame under a body standing still))
  update(dt, { speed = 0, idle = 'Idle', scale = 1, look = null } = {}) {
    if (!this.dead) {
      const v = this.speeds,
        cur = this.baseName,
        moving = cur === 'Walk' || cur === 'Gallop';
      this.sv = (this.sv ?? 0) + (speed / scale - (this.sv ?? 0)) * Math.min(1, dt * 12);
      const s = this.sv;
      let n = idle,
        ts = this.rate;
      if (s > v.Walk * (cur === 'Gallop' ? 1.5 : 1.9)) {
        n = 'Gallop';
        ts = s / v.Gallop;
      } else if (s > (moving ? 0.12 : 0.4)) {
        n = 'Walk';
        ts = s / v.Walk;
      }
      if (moving && n === idle) {
        this.base.timeScale = 0;
        this.setBase(n, 0.18);
      } else this.setBase(n, 0.25);
      this.base.timeScale = Math.min(2.2, Math.max(0.35, ts));
    }
    // (slice 25, #54: the mixer writes a bone only when the clip's value changed since its last write, so where a clip holds the neck
    // or head still (the gallop does) last frame's turn stayed on and the next one piled on top: the head spun round and round. The
    // clip's own pose is put back before the mixer runs, so each frame's turn starts from it)
    if (this.rest) for (const [bone, q] of this.rest) bone.quaternion.copy(q);
    this.mixer.update(dt);
    if (this.root && this.neck) {
      this.rest ||= [this.neck, this.head].map((b) => [b, new THREE.Quaternion()]);
      for (const [bone, q] of this.rest) q.copy(bone.quaternion);
      let yaw = 0;
      if (look && !this.dead) {
        const q = this.root.worldToLocal(_lk.copy(look));
        yaw = Math.max(-0.65, Math.min(0.65, Math.atan2(-q.x, -q.z)));
      }
      this.yaw += (yaw - this.yaw) * Math.min(1, dt * 5);
      if (Math.abs(this.yaw) > 1e-3) {
        this.root.updateMatrixWorld(true);
        for (const [bone, k] of [
          [this.neck, 0.4],
          [this.head, 0.6],
        ])
          turnWorldY(bone, this.yaw * k);
      }
    }
  }
}
const _lk = new THREE.Vector3(),
  _q1 = new THREE.Quaternion(),
  _q2 = new THREE.Quaternion(),
  _q3 = new THREE.Quaternion(),
  _up = new THREE.Vector3(0, 1, 0);
// turn a bone about the world's up axis, whatever its own axes are (the Quaternius bones point along their own +Y)
// (slice 25, #54: under a bone scaled unevenly, as the hound's torso bones were, the parent's matrix is sheared and the rotation read
// back from it is a little longer or shorter than a true one, so each turn also resized the head; normalised, the turn only turns)
function turnWorldY(bone, a) {
  const pq = bone.parent.getWorldQuaternion(_q1).normalize();
  bone.quaternion.premultiply(_q2.copy(pq).invert().multiply(_q3.setFromAxisAngle(_up, a)).multiply(pq));
  bone.updateMatrixWorld(true);
}
// how fast a clip's feet travel along the ground while planted (model units a second, after the model's scale k): the
// rate that makes it play without sliding; measured once per animal and clip
const SPEEDS = {};
// the paws: each lower-leg bone carries the point its paw sat at in the rest pose (where the rig's foot-control bones
// stand). The control bones themselves (FF, FFB) do not follow the deforming legs through the clips, so they are no
// guide to where a paw is; the deform chain is. Returns [{ bone, tip }]: a paw is bone.localToWorld(tip.clone())
function pawTips(model) {
  const by = {};
  model.traverse((o) => {
    if (o.isBone) by[o.name] = o;
  });
  model.updateMatrixWorld(true);
  const out = [];
  for (const [c, l] of [
    ['FFL', 'FrontLowerLegL'],
    ['FFR', 'FrontLowerLegR'],
    ['FFBL', 'BackLowerLegL'],
    ['FFBR', 'BackLowerLegR'],
  ])
    if (by[c] && by[l]) out.push({ bone: by[l], tip: by[l].worldToLocal(by[c].getWorldPosition(new THREE.Vector3())) });
  return out;
}
function clipSpeed(type, doc, k, name) {
  const key = type + name;
  if (SPEEDS[key]) return SPEEDS[key];
  const m = SkeletonUtils.clone(doc.scene);
  m.scale.setScalar(k);
  const clip = beastClips(doc)[name],
    mix = new THREE.AnimationMixer(m);
  mix.clipAction(clip).play();
  const feet = pawTips(m);
  if (!feet.length) return (SPEEDS[key] = name === 'Walk' ? 1.5 : 4.5);
  const N = 48,
    tr = feet.map(() => []),
    p = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    mix.setTime((clip.duration * i) / N);
    m.updateMatrixWorld(true);
    feet.forEach((f, j) => {
      f.bone.localToWorld(p.copy(f.tip));
      tr[j].push([p.y, p.z]);
    });
  }
  let sum = 0,
    n = 0;
  for (const t of tr) {
    const lo = Math.min(...t.map((q) => q[0])),
      cut = lo + 0.025; // (planted: within 2.5 cm of its lowest, as the walk test judges a paw on the ground)
    for (let i = 1; i <= N; i++)
      if (t[i][0] < cut && t[i - 1][0] < cut) {
        sum += Math.abs(t[i][1] - t[i - 1][1]);
        n++;
      }
  }
  return (SPEEDS[key] = n ? ((sum / n) * N) / clip.duration : name === 'Walk' ? 1.5 : 4.5);
}

// ── The rat: Poly Haven scan, moved in the vertex shader (legs scurry, body bobs, tail swings) ──
let ratGeo = null,
  ratMatBase = null;
function buildRat() {
  if (!ratGeo) {
    let m0;
    docs.rat.scene.traverse((o) => {
      if (o.isMesh) m0 = o;
    });
    ratGeo = m0.geometry.clone();
    ratGeo.computeBoundingBox();
    ratMatBase = m0.material;
  }
  const bb = ratGeo.boundingBox,
    len = bb.max.z - bb.min.z,
    k = 3.2 / len; // nose to tail tip 3.2 m before the type's scale
  const u = { uPh: { value: 0 }, uAmp: { value: 0 }, uTail: { value: 0 }, uFlash: { value: 0 }, uLook: { value: 0 } };
  const m = ratMatBase.clone();
  m.userData.u = u;
  const zTail = bb.min.z + len * 0.56,
    yLeg = bb.min.y + (bb.max.y - bb.min.y) * 0.32,
    zMid = bb.min.z + len * 0.75,
    sz = len;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uPh, uAmp, uTail, uLook;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        { float legW = 1. - smoothstep(${(yLeg * 0.4).toFixed(5)}, ${yLeg.toFixed(5)}, position.y);
          float front = step(${zMid.toFixed(5)}, position.z), side = step(0., position.x);
          float ph = uPh + side * 3.1416 + front * 3.1416;
          transformed.z += sin(ph) * uAmp * ${(sz * 0.05).toFixed(5)} * legW * step(${zTail.toFixed(5)}, position.z);
          transformed.y += max(0., cos(ph)) * uAmp * ${(sz * 0.02).toFixed(5)} * legW * step(${zTail.toFixed(5)}, position.z);
          transformed.y += sin(uPh * 2.) * uAmp * ${(sz * 0.006).toFixed(5)};
          float t = max(0., ${zTail.toFixed(5)} - position.z) / ${(len * 0.56).toFixed(5)};
          transformed.x += sin(uTail - t * 4.) * t * t * ${(sz * 0.12).toFixed(5)}; transformed.y += t * t * ${(sz * 0.025).toFixed(5)}; // (round 2: the tail's tip curves up off the ground, where it shows)
          float hd = smoothstep(${(bb.max.z - len * 0.12).toFixed(5)}, ${bb.max.z.toFixed(5)}, position.z);
          transformed.x += uLook * hd * ${(sz * 0.03).toFixed(5)}; }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFlash;')
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\ndiffuseColor.rgb = mix(min(vec3(0.6), diffuseColor.rgb * vec3(3.7, 3.55, 3.4)), vec3(1., .95, .85), uFlash);',
      );
  }; // (round 1: the scan's albedo is near black, about 0.04 linear: a brown rat's coat is about four times lighter, a touch greyer)
  m.customProgramCacheKey = () => 'iwrat';
  const mesh = new THREE.Mesh(ratGeo, m);
  mesh.castShadow = true;
  mesh.scale.setScalar(k);
  mesh.position.y = -bb.min.y * k;
  mesh.rotation.y = Math.PI;
  const root = new THREE.Group();
  root.add(mesh);
  let ph = Math.random() * 6,
    tl = 0,
    dying = 0,
    lunge = 0,
    pitch = 0;
  const anim = {
    dead: false,
    update(dt, { speed = 0, scale = 1, ground = null } = {}) {
      const s = speed / scale;
      if (ground) {
        const y = root.rotation.y,
          fx = -Math.sin(y),
          fz = -Math.cos(y),
          d = 0.5 * scale,
          x = root.position.x,
          z = root.position.z; // (round 2: the body lies along the slope, so the tail does not sink into a hill)
        pitch +=
          (Math.atan2(ground(x + fx * d, z + fz * d) - ground(x - fx * d, z - fz * d), 2 * d) - pitch) *
          Math.min(1, dt * 8);
      }
      ph += dt * (s > 0.1 ? 6 + s * 5 : 0);
      tl += dt * (2 + s * 3);
      u.uPh.value = ph;
      u.uAmp.value += ((s > 0.1 ? 1 : 0) - u.uAmp.value) * Math.min(1, dt * 10);
      u.uTail.value = tl;
      u.uLook.value = Math.sin(tl * 0.7) * (s > 0.1 ? 0.2 : 1);
      lunge = Math.max(0, lunge - dt * 4);
      mesh.position.z = -Math.sin(lunge * Math.PI) * 0.25;
      mesh.rotation.x = pitch - Math.sin(lunge * Math.PI) * 0.25;
      if (dying) {
        dying = Math.min(1, dying + dt * 4);
        mesh.rotation.z = dying * Math.PI * 0.95;
      }
    },
    attack() {
      lunge = 1;
    },
    hit() {
      lunge = 0.5;
    },
    die() {
      this.dead = true;
      dying = 0.01;
    },
  };
  root.userData = {
    anim,
    mats: [m],
    height: 0.8,
    setDetail() {},
    flash: (v) => {
      u.uFlash.value = v;
    },
  };
  return root;
}

// ── Built creatures: materials ──
function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
let BM = null;
function builtMats() {
  if (BM) return BM;
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // chitin: blue-grey plates with frost speckle and dark seams
  const chitin = canvasTex(256, (g, n) => {
    g.fillStyle = '#6e6a74';
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 900; i++) {
      const v = 120 + rnd() * 120;
      g.fillStyle = `rgba(${v * 0.96},${v * 0.94},${v},${0.15 + rnd() * 0.3})`;
      g.beginPath();
      g.arc(rnd() * n, rnd() * n, rnd() * 5 + 0.5, 0, 6.3);
      g.fill();
    }
    g.strokeStyle = 'rgba(20,30,40,0.55)';
    for (let i = 0; i < 40; i++) {
      g.lineWidth = 0.5 + rnd() * 1.5;
      g.beginPath();
      const x = rnd() * n,
        y = rnd() * n;
      g.moveTo(x, y);
      g.bezierCurveTo(
        x + rnd() * 40 - 20,
        y + rnd() * 40 - 20,
        x + rnd() * 60 - 30,
        y + rnd() * 60 - 30,
        x + rnd() * 80 - 40,
        y + rnd() * 80 - 40,
      );
      g.stroke();
    }
  });
  // wet amphibian skin: olive with dark blotches, pale warts
  const skin = canvasTex(
    512,
    (g, n) => {
      const gr = g.createLinearGradient(0, 0, 0, n);
      gr.addColorStop(0, '#2c3220');
      gr.addColorStop(1, '#3a3e26');
      g.fillStyle = gr;
      g.fillRect(0, 0, n, n);
      for (let i = 0; i < 140; i++) {
        g.fillStyle = `rgba(${20 + rnd() * 20},${26 + rnd() * 20},${12},${0.35 + rnd() * 0.4})`;
        g.beginPath();
        g.ellipse(rnd() * n, rnd() * n, 6 + rnd() * 26, 5 + rnd() * 18, rnd() * 3, 0, 6.3);
        g.fill();
      }
      for (let i = 0; i < 1400; i++) {
        const v = 90 + rnd() * 80;
        g.fillStyle = `rgba(${v},${v * 1.02},${v * 0.7},${0.25 + rnd() * 0.4})`;
        g.beginPath();
        g.arc(rnd() * n, rnd() * n, 0.6 + rnd() * 2.6, 0, 6.3);
        g.fill();
      }
    },
    2,
  );
  const belly = canvasTex(256, (g, n) => {
    g.fillStyle = '#8a8458';
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 600; i++) {
      const v = 110 + rnd() * 60;
      g.fillStyle = `rgba(${v},${v * 0.95},${v * 0.6},0.4)`;
      g.fillRect(rnd() * n, rnd() * n, 2, 2);
    }
  });
  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  BM = {
    chitin: P({
      map: chitin,
      color: 0x9c98a2,
      roughness: 0.75,
      metalness: 0.0,
      clearcoat: 0.1,
      clearcoatRoughness: 0.6,
    }),
    chitinDark: P({ map: chitin, color: 0x58545e, roughness: 0.72, clearcoat: 0.1, clearcoatRoughness: 0.6 }), // (round 1: ash grey legs and underside, not blue)
    chitinPale: P({ map: chitin, color: 0xb8b4b0, roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.4 }),
    ice: P({
      color: 0xd8e8f0,
      roughness: 0.2,
      metalness: 0,
      clearcoat: 0.6,
      transparent: true,
      opacity: 0.75,
      emissive: 0x1a3040,
      emissiveIntensity: 0.25,
      envMapIntensity: 1.0,
    }),
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
// built creatures share materials across instances: a flash swaps in per-creature emissive clones
function perMeshFlash(root) {
  let on = false;
  const orig = new Map();
  return (k) => {
    if (k > 0.01 && !on) {
      on = true;
      root.traverse((o) => {
        if (o.isMesh && o.material.emissive) {
          orig.set(o, o.material);
          o.material = o.material.clone();
        }
      });
    }
    if (on) {
      for (const o of orig.keys()) o.material.emissive.setRGB(k * 0.8, k * 0.75, k * 0.7);
    }
    if (k <= 0.01 && on) {
      on = false;
      for (const [o, m] of orig) {
        o.material.dispose();
        o.material = m;
      }
      orig.clear();
    }
  };
}

// Raiders are people: the player characters' rigged bodies in raider looks (characters.js), with their own materials
// (the hit flash brightens them; the shader recolour is kept) and the metal of their scrap armour rusted.
function buildRaider(type) {
  const m = buildCharacter({ id: type, color: 0x8a3a2a }),
    rust = new THREE.Color(0.62, 0.46, 0.34);
  m.traverse((o) => {
    if (!o.isMesh || !o.material.emissive) return;
    const src = o.material,
      c = src.clone();
    c.onBeforeCompile = src.onBeforeCompile;
    c.customProgramCacheKey = src.customProgramCacheKey;
    if (c.metalness > 0.9) {
      c.color.multiply(rust);
      c.roughness = Math.max(c.roughness, 0.75);
    }
    o.material = c;
  });
  const mats = [];
  m.traverse((o) => {
    if (o.isMesh && o.material.emissive) mats.push(o.material);
  });
  Object.assign(m.userData, {
    height: 1.8,
    setDetail() {},
    flash: (k) => {
      for (const c of mats) c.emissive.setRGB(k * 0.8, k * 0.75, k * 0.7);
    },
  });
  return m;
}
export function buildCreature(type) {
  if (type === 'brawler' || type === 'shooter' || type === 'heavy') return buildRaider(type);
  if (type === 'rat') return buildRat();
  if (type === 'ice_crawler') {
    const M = builtMats();
    return buildCrawler({ M, eye: M.eyeGlow, perMeshFlash });
  }
  if (ENEMY[type]?.spider) {
    if (!EYE_MATS.has('spider')) {
      const m = shine(new THREE.MeshPhysicalMaterial({ color: 0x050404, roughness: 0.08, clearcoat: 1 }));
      m.emissive.set(0x3c8a6a);
      EYE_MATS.set('spider', m);
    } // (a spider's eyeshine is a cold green-white glint)
    return buildSpider({ eye: EYE_MATS.get('spider'), perMeshFlash, palette: ENEMY[type].spider });
  } // (every kind: config.js ENEMY spider*)
  if (type === 'spider_nest') return buildNest({ perMeshFlash });
  if (type === 'bog_lurker') {
    const M = builtMats();
    return buildLurker({ M, eye: M.lurkEye, perMeshFlash });
  }
  if (type === 'bear')
    return buildBear({
      eye:
        EYE_MATS.get('bear') ||
        EYE_MATS.set('bear', shine(new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.15 }))).get('bear'),
      flasher,
    });
  return buildBeast(type);
}
