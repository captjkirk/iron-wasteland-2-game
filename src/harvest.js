// Harvesting (slice 11, IW1's in 3D): hold E (B on a pad) by a tree to chop it. Every swing bites chips out of the trunk
// and shakes the tree; when it goes it creaks, falls away from you, crashes down and breaks into 2 or 3 logs of wood; a
// stump stays. Hold E by a bush to pull fiber from it. IW1's times: the Architect 1.5 s, the Gunslinger 4 s, others 2.5 s.
// Co-op: the world's trees are the host's. A joined game chops, then asks (`chop`); the host fells it for everyone
// (`fell`, and in `welcome` for late joiners) and drops the logs as loot it owns. Each swing's shake is shown to all.
// Slice 26 (Jared, 2026-11-14: "would be nice to be able to dig up stumps", "would be nice if trees grew back over time if the
// stump was left?", "why can't I cut down the giant mushrooms?"): hold E by a stump to dig it up (a little wood and a root
// fiber; the ground clear to build on). A stump left in the ground sprouts a sapling after a day and a half of game time, which
// grows into the whole tree, solid again, by day four and a half; a dug one never comes back. The Hollow's giant mushrooms
// chop down too (the cap topples, a stalk stays) for fiber and food, and grow back in a day and a half. Every game works the
// stage out from the shared clock and when the tree fell (the `felled` list carries it), so a late joiner sees the same.
import * as THREE from 'three';
import { placed, nearColliders, addCollider } from './props.js';
import { markDirty } from './scatter.js';
import { pbr } from './propmodels.js';
import { BARK, SPECIES } from './trees.js';
import { groundY } from './world.js';
import { hitBurst, dustPuff, grainDisc, splash } from './effects.js';
import { ripple } from './water.js';
import { WATER_Y } from './config.js';
// slice 21 (Jared, 2026-11-14: "water splashes ... if a harvested tree falls in it?"): where the falling trunk meets water it splashes, not dusts
const thud = (x, z, n) => {
  if (groundY(x, z) < WATER_Y - 0.05) {
    splash(new THREE.Vector3(x, WATER_Y, z), n * 2);
    ripple(x, z, 3, 0.45);
  } else dustPuff(new THREE.Vector3(x, groundY(x, z), z), n);
};
import { sfx } from './audio.js';
import { logEvent } from './playlog.js';
import { rng } from './noise.js';
import { player, scene3, dropLoot, log } from './game.js';
import { day, onNewGame } from './daynight.js';
import { send, joining } from './coop.js';

export const TREES = new Set(['pine', 'oak', 'aspen', 'snowpine', 'deadtree', 'swamptree', 'shroom']);
const BUSHES = Object.keys(SPECIES).filter((k) => SPECIES[k].bush),
  NAME = {
    pine: 'pine',
    oak: 'oak',
    aspen: 'aspen',
    snowpine: 'pine',
    deadtree: 'dead tree',
    swamptree: 'swamp tree',
    bush: 'bush',
    drybush: 'dry bush',
    shroom: 'giant mushroom',
    berrybush: 'berry bush',
    flowerbush: 'flowering shrub',
    sage: 'sagebrush',
    juniper: 'juniper',
    thornscrub: 'thorn scrub',
  }; // (ticket 56: each biome's own shrubs)
const CHOP = { architect: 1.5, gunslinger: 4 };
export const chopTime = (ch, it) =>
  (CHOP[ch.id] ?? 2.5) * (it.felled ? 1.2 : it.type === 'shroom' ? 0.7 : TREES.has(it.type) ? 1 : 0.4); // (a stump digs a little slower than its tree chopped)
export const felled = []; // [type, index, fall heading, when (game days), state: 1 dug up, 2 grown back] of every tree felled and bush picked (for players who join later)
const GROW = { tree: [1.5, 4.5], shroom: [0.5, 1.5] }; // game days from felling to the sapling, and to the whole tree
const dayNow = () => day.n + day.t;
const stumps = new Set(); // felled trees whose stump (or sapling) still stands
// what you would do to it, for the prompt: `doing` while you do it
export function harvestDoing(it, doing) {
  const n = NAME[it.type] || it.type;
  if (it.felled)
    return `${doing ? 'digging up' : 'dig up'} the ${it.type === 'shroom' ? 'mushroom stalk' : n + ' stump'}`;
  if (SPECIES[it.type]?.loot === 'food') return `${doing ? 'picking' : 'pick'} berries from the ${n}`;
  return BUSHES.includes(it.type)
    ? `${doing ? 'pulling' : 'pull'} fiber from the ${n}`
    : `${doing ? 'chopping' : 'chop'} the ${n}`;
}
const live = new Map(),
  Y = new THREE.Vector3(0, 1, 0); // trees shaking or falling: item -> { g, shake, t, idle, fall }
const idx = (it) => (it.pi ??= placed[it.type].indexOf(it));

// what is in reach to harvest: the nearest standing trunk within 1.4 m of its bark, else a bush within 1.5 m
let bgrid = null;
function bushes(x, z) {
  if (!bgrid) {
    bgrid = new Map();
    for (const t of BUSHES)
      for (const it of placed[t] || []) {
        const k = Math.floor(it.x / 8) + ',' + Math.floor(it.z / 8);
        (bgrid.get(k) || bgrid.set(k, []).get(k)).push(it);
      }
  }
  const out = [];
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++) out.push(...(bgrid.get(Math.floor(x / 8) + a + ',' + (Math.floor(z / 8) + b)) || []));
  return out;
}
const reach = (it, x, z) =>
  Math.hypot(it.x - x, it.z - z) - (it.felled ? it.sr || 0 : TREES.has(it.type) ? it.col.r : 0);
export function harvestTarget(x, z, slack = 0) {
  let best = null,
    bd = 1.4 + slack;
  for (const c of nearColliders(x, z)) {
    const it = c.ref;
    if (
      !it ||
      !c.r ||
      !TREES.has(it.type) ||
      it.felled ||
      it.col !== c ||
      performance.now() - (it.asked || -1e9) < 4000
    )
      continue;
    /* asked the host: wait for its word */ const d = reach(it, x, z);
    if (d < bd) {
      bd = d;
      best = it;
    }
  }
  if (best) return best;
  bd = 1.2 + slack;
  for (const it of stumps) {
    if (it.sapling?.visible || performance.now() - (it.asked || -1e9) < 4000) continue;
    const d = reach(it, x, z);
    if (d < bd) {
      bd = d;
      best = it;
    }
  } // slice 26: a stump
  if (best) return best;
  bd = 1.5 + slack;
  for (const it of bushes(x, z)) {
    if (it.felled || performance.now() - (it.asked || -1e9) < 4000) continue;
    const d = reach(it, x, z);
    if (d < bd) {
      bd = d;
      best = it;
    }
  }
  return best;
}

// ── Every frame: the local player's chopping (hold is E or B held), and every shaking or falling tree ──
let freshE = true; // (E let go since the last chop: only then does a hold dig a stump)
export function tickHarvest(dt, hold) {
  if (!hold) freshE = true;
  else if (player.chop && !player.chop.dig) freshE = false;
  const c = player.chop;
  let it =
    hold && !player.dead && !(player.down > 0)
      ? c && (c.dig ? !c.it.dug : !c.it.felled) && reach(c.it, player.x, player.z) < 2
        ? c.it
        : harvestTarget(player.x, player.z)
      : null;
  if (it?.felled && !freshE && !(c?.dig && c.it === it)) {
    player.chop = null;
    it = null;
  } // (the stump of the tree just felled stays, unless E is pressed again)
  if (!it) player.chop = null;
  else {
    if (!c || c.it !== it) player.chop = { it, t: 0, T: chopTime(player.ch, it), next: 0, dig: !!it.felled };
    const h = player.chop,
      dx = it.x - player.x,
      dz = it.z - player.z,
      d = Math.hypot(dx, dz) || 1;
    h.t += dt;
    h.next -= dt;
    player.faceYaw = Math.atan2(-dx, -dz);
    if (h.next <= 0) {
      h.next = 0.5;
      swing(it, dx / d, dz / d);
    }
    if (h.t >= h.T && h.dig) {
      player.chop = null;
      const k = it.type,
        i = idx(it);
      logEvent('dug', { type: k, i });
      if (joining()) {
        send('host', { t: 'dig', k, i });
        it.asked = performance.now();
      } else dig(k, i, true);
    } else if (h.t >= h.T) {
      player.chop = null;
      const k = it.type,
        i = idx(it),
        fd = +Math.atan2(dx, dz).toFixed(2);
      logEvent('chopped', { type: k, i });
      if (joining()) {
        send('host', { t: 'chop', k, i, d: fd });
        it.asked = performance.now();
      } else fell(k, i, fd, true);
    }
  }
  for (const [q, L] of live) tickLive(q, L, dt);
  if ((growT -= dt) <= 0) {
    growT = 0.5;
    tickGrow();
  }
}
let growT = 0;
function swing(it, nx, nz) {
  if (it.felled) {
    const at = new THREE.Vector3(it.x - nx * (it.sr || 0.3), groundY(it.x, it.z) + 0.15, it.z - nz * (it.sr || 0.3)); // digging: earth and splinters fly
    player.swing = 1;
    player.mesh.userData.anim.attack(false);
    dustPuff(at, 8);
    hitBurst(at, new THREE.Vector3(-nx, 0.8, -nz), 'wood', 8, false);
    sfx('thud', at, 0.5);
    send('all', { t: 'a', d: [+nx.toFixed(2), +nz.toFixed(2)], r: 0 });
    return;
  }
  const tree = TREES.has(it.type),
    r = tree ? it.col.r : 0.3,
    at = new THREE.Vector3(it.x - nx * r * 0.9, groundY(it.x, it.z) + (tree ? 1.0 : 0.5), it.z - nz * r * 0.9);
  player.swing = 1;
  player.mesh.userData.anim.attack(false);
  hitBurst(at, new THREE.Vector3(-nx, 0.4, -nz), tree ? 'wood' : 'leaf', tree ? 14 : 16, false);
  sfx(tree ? 'chop' : 'swing', at, 0.9);
  if (tree) shake(it);
  send('all', { t: 'a', d: [+nx.toFixed(2), +nz.toFixed(2)], r: 0 });
  if (tree) send('all', { t: 'shake', k: it.type, i: idx(it) });
}

// a tree that is shaking or falling is drawn on its own (its instanced copy is hidden): the same parts, as one-instance meshes
function lift(it) {
  let L = live.get(it);
  if (L) return L;
  const g = new THREE.Group();
  g.position.set(it.x, it.y, it.z);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(),
    new THREE.Quaternion().setFromAxisAngle(Y, it.ry || 0),
    new THREE.Vector3(it.s, it.s, it.s),
  );
  for (const im of it.layer.near) {
    const c = new THREE.InstancedMesh(im.geometry, im.material, 1);
    c.setMatrixAt(0, m);
    c.castShadow = im.castShadow;
    c.receiveShadow = im.receiveShadow;
    c.customDepthMaterial = im.customDepthMaterial;
    c.frustumCulled = false;
    g.add(c);
  }
  scene3().add(g);
  it.gone = true;
  markDirty();
  L = { g, shake: 0, t: 0, idle: 0, fall: null };
  live.set(it, L);
  return L;
}
function unlift(it) {
  const L = live.get(it);
  L.g.removeFromParent();
  for (const c of L.g.children) c.dispose();
  live.delete(it);
  if (!it.felled) {
    it.gone = false;
    markDirty();
  }
}
function shake(it) {
  const L = lift(it);
  L.shake = 1;
  L.idle = 0;
}
export function onShake(m) {
  const it = placed[m.k]?.[m.i];
  if (it && !it.felled) shake(it);
}

// the stump left behind: a short, slightly tapered trunk in log bark (Poly Haven, CC0) with a pale sawn top showing its
// rings and a ragged hinge of splinters where it broke; solid, and low enough to stand on
let STUMP = null;
export function prepHarvest() {
  STUMP = {
    stalk: new THREE.MeshStandardMaterial({ color: 0xe2d6c4, roughness: 0.75 }),
    flesh: new THREE.MeshStandardMaterial({ color: 0xf3eadc, roughness: 0.9 }),
    bark: pbr('props/logbark', { rough: 0.95, color: 0xb8a490 }),
    grain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    splinter: new THREE.MeshStandardMaterial({ color: 0xc8a070, roughness: 0.9 }),
  };
}
// slice 21 (Jared, 2026-11-14: "cutting down a tree that looks like a birch tree leaves a different kind of stump"): a stump
// wears its own tree's bark (the aspen's white), its texture tiled to a stump's size
const STUMP_BARK = {};
const stumpBark = (k) => {
  const b = BARK[k];
  if (!b) return STUMP.bark;
  if (STUMP_BARK[k]) return STUMP_BARK[k];
  const m = b.clone();
  for (const t of ['map', 'normalMap'])
    if (b[t]) {
      m[t] = b[t].clone();
      m[t].repeat.set(2, 0.5);
      m[t].needsUpdate = true;
    }
  return (STUMP_BARK[k] = m);
};
function stump(it, r, d) {
  const y = groundY(it.x, it.z),
    h = 0.38 + r * 0.5,
    g = new THREE.Group(),
    sh = it.type === 'shroom'; // (a giant mushroom leaves a pale stalk)
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 1.22, h + 0.25, 16, 1),
    sh ? STUMP.stalk : stumpBark(it.type),
  );
  body.position.y = (h - 0.25) / 2;
  g.add(body);
  const top = new THREE.Mesh(
    sh ? new THREE.CircleGeometry(r * 0.97, 16).rotateX(-Math.PI / 2) : grainDisc(r * 0.97).rotateX(-Math.PI / 2),
    sh ? STUMP.flesh : STUMP.grain,
  );
  top.position.y = h + 0.002;
  g.add(top);
  // the hinge: splinters standing on the side the tree fell toward
  for (let k = 0; k < 5; k++) {
    const a = d + (k - 2) * 0.28,
      s = new THREE.Mesh(new THREE.ConeGeometry(r * 0.16, 0.12 + rng() * 0.16, 4), sh ? STUMP.stalk : STUMP.splinter);
    s.position.set(Math.sin(a) * r * 0.72, h + 0.06, Math.cos(a) * r * 0.72);
    s.rotation.set((rng() - 0.5) * 0.4, rng() * 3, (rng() - 0.5) * 0.4);
    g.add(s);
  }
  g.position.set(it.x, y - 0.02, it.z);
  g.traverse((m) => {
    m.castShadow = m.receiveShadow = true;
  });
  scene3().add(g);
  it.stump = g;
  it.stumpCol = Object.assign(addCollider(it.x, it.z, r * 1.05, null), {
    vr: 0,
    top: y + h,
    stand: y + h - 0.04,
    base: y,
  });
}

// fell a tree or pick a bush (the host decides; every game shows it). quick: no animation (a late joiner's world)
export function fell(k, i, d, host, quick = false, at = dayNow(), st = 0) {
  const it = placed[k]?.[i];
  if (!it || it.felled) return false;
  it.felled = true;
  const e = [k, i, d, +at.toFixed(3), st];
  felled.push(e);
  it.fe = e;
  if (host) send('all', { t: 'fell', k, i, d, at: e[3] }); // (when it fell: every game grows its sapling from the same moment)
  if (TREES.has(k)) {
    const r =
      k === 'shroom' ? Math.max(0.25, Math.min(0.7, it.col.r * 0.8)) : Math.max(0.2, Math.min(0.42, it.col.r * 0.75));
    it.r0 = it.col.r;
    it.vr0 = it.col.vr;
    it.sr = r;
    it.col.r = 0;
    it.col.vr = 0;
    if (st === 1) it.dug = true;
    else {
      stump(it, r, d);
      stumps.add(it);
    }
    if (quick) {
      if (live.has(it)) unlift(it);
      it.gone = true;
      markDirty();
    } else {
      const L = lift(it),
        L0 = it.s,
        fx = Math.sin(d),
        fz = Math.cos(d),
        hEnd = groundY(it.x + fx * L0 * 0.6, it.z + fz * L0 * 0.6) - groundY(it.x, it.z);
      L.fall = {
        a: 0.03,
        w: 0.12,
        t: 0,
        land: 0,
        host,
        axis: new THREE.Vector3(fz, 0, -fx),
        fx,
        fz,
        max: Math.max(1.15, Math.min(1.75, Math.PI / 2 - Math.atan2(hEnd, L0 * 0.6))),
      };
      sfx('creak', it);
      if (Math.hypot(it.x - player.x, it.z - player.z) < 30) log(`Timber! The ${NAME[k]} comes down.`);
    }
  } else {
    it.gone = true;
    markDirty();
    if (!quick) {
      const at = new THREE.Vector3(it.x, groundY(it.x, it.z) + 0.5, it.z);
      hitBurst(at, Y, 'leaf', 26, false);
      sfx('salvage', it, 0.5);
    }
    if (host && !quick) {
      const n = 1 + (rng() < 0.5 ? 1 : 0);
      for (let j = 0; j < n; j++) dropLoot(it.x, it.z, SPECIES[k]?.loot || 'fiber');
    }
  }
  return true;
}
export const onChop = (m) => fell(m.k, m.i, m.d, true);
export const onFell = (m) => fell(m.k, m.i, m.d, false, false, m.at ?? dayNow());
export function onGrew(m) {
  const it = placed[m.k]?.[m.i];
  if (it?.felled && !it.dug) regrow(it);
}
export function applyFelled(list) {
  for (const e of list) {
    if (e[4] === 2) felled.push(e);
    else fell(e[0], e[1], e[2], false, true, e[3] ?? dayNow(), e[4] || 0);
  }
} // (one grown back stands: kept in the list, so both games count alike)

// ── Slice 26: digging a stump up (the host decides; every game shows it) ──
export function dig(k, i, host) {
  const it = placed[k]?.[i];
  if (!it || !it.felled || it.dug) return false;
  it.dug = true;
  if (it.fe) it.fe[4] = 1;
  stumps.delete(it);
  const at = new THREE.Vector3(it.x, groundY(it.x, it.z) + 0.2, it.z);
  if (it.stump) {
    dustPuff(at, 22);
    hitBurst(at, Y, 'wood', 14, false);
    sfx('thud', at, 0.7);
    it.stump.removeFromParent();
    it.stump = null;
  }
  if (it.stumpCol) {
    it.stumpCol.r = 0;
    it.stumpCol.vr = 0;
  }
  unsap(it);
  if (host) {
    send('all', { t: 'dug', k, i });
    dropLoot(it.x, it.z, k === 'shroom' ? 'food' : 'wood');
    dropLoot(it.x, it.z, 'fiber');
  }
  return true;
}
export const onDig = (m) => dig(m.k, m.i, true);
export const onDug = (m) => dig(m.k, m.i, false);

// ── Slice 26: regrowth. Every half second each stump left standing checks its age on the shared clock: a sapling (the tree's
// own parts at a growing scale, drawn in one batch per kind of tree) from GROW[0] days, the whole tree back in the forest's instances at GROW[1] ──
// a new game's clock starts over, and so does every stump's growth (said outright by daynight.js, never guessed from the clock)
onNewGame(() => {
  const now = +dayNow().toFixed(3);
  for (const it of stumps) {
    if (it.fe) it.fe[3] = now;
    unsap(it);
  }
});
function tickGrow() {
  const now = dayNow();
  for (const it of [...stumps]) {
    const e = it.fe;
    if (!e) continue;
    const [g0, g1] = GROW[it.type === 'shroom' ? 'shroom' : 'tree'],
      age = now - e[3];
    if (age >= g1 && !joining()) {
      regrow(it);
      send('all', { t: 'grew', k: it.type, i: idx(it) });
    } else if (age >= g1) sapling(it, 1);
    else if (age >= g0) sapling(it, 0.12 + 0.88 * ((age - g0) / (g1 - g0)) ** 1.3);
  }
  for (const B of SAP.values()) if (B.dirty) drawSap(B);
}
// saplings are drawn in batches, one per forest layer: each of the layer's parts is one InstancedMesh holding every sapling of
// that kind (a draw call a part, however many stumps sprout), its geometry and materials the forest's own; a batch is freed when
// its last sapling grows into the tree or is dug up. `it.sapling` is the stump's place in it ({ k: its scale, visible, parent })
const SAP = new Map();
let sapMeshes = 0; // forest layer -> { g, parts, list, dirty }
function sapRoom(layer, n) {
  let B = SAP.get(layer);
  const cap = B?.parts[0]?.instanceMatrix.count || 0;
  if (B && cap >= n) return B;
  if (!B) {
    B = { g: new THREE.Group(), parts: [], list: [], dirty: true };
    B.g.name = 'saplings';
    scene3().add(B.g);
    SAP.set(layer, B);
  }
  for (const c of B.parts) {
    c.removeFromParent();
    c.dispose();
    sapMeshes--;
  }
  const size = Math.max(8, cap * 2, n);
  B.parts = layer.near.map((im) => {
    const c = new THREE.InstancedMesh(im.geometry, im.material, size);
    c.count = 0;
    c.receiveShadow = im.receiveShadow;
    B.g.add(c);
    sapMeshes++;
    return c;
  }); // (no shadow: a cleared stand's saplings would add a shadow pass)
  B.dirty = true;
  return B;
}
const _m = new THREE.Matrix4(),
  _p = new THREE.Vector3(),
  _q = new THREE.Quaternion(),
  _s = new THREE.Vector3();
function drawSap(B) {
  B.dirty = false;
  let j = 0;
  for (const it of B.list) {
    const S = it.sapling;
    if (!S.visible) continue;
    _m.compose(_p.set(it.x, it.y, it.z), _q.setFromAxisAngle(Y, it.ry || 0), _s.setScalar(it.s * S.k));
    for (const c of B.parts) c.setMatrixAt(j, _m);
    j++;
  }
  for (const c of B.parts) {
    c.count = j;
    c.instanceMatrix.needsUpdate = true;
    c.boundingSphere = null;
  }
}
function sapling(it, k) {
  let S = it.sapling,
    B = SAP.get(it.layer);
  if (!S) {
    B = sapRoom(it.layer, (B?.list.length || 0) + 1);
    B.list.push(it);
    S = it.sapling = { k: -1, visible: false, parent: B.g };
    if (it.stump) it.stump.visible = false;
  } // (the stump becomes the sapling's foot)
  const vis = Math.hypot(it.x - player.x, it.z - player.z) < 90;
  if (vis !== S.visible) {
    S.visible = vis;
    B.dirty = true;
  }
  if (Math.abs(S.k - k) >= 0.01) {
    S.k = k;
    B.dirty = true;
  }
}
// a sapling gone (grown into the tree, dug up, or a new game): out of its batch; the batch's meshes freed with its last one
function unsap(it) {
  const S = it.sapling;
  if (!S) return;
  it.sapling = null;
  if (it.stump) it.stump.visible = true;
  const B = SAP.get(it.layer);
  if (!B) return;
  B.list.splice(B.list.indexOf(it), 1);
  if (B.list.length) {
    drawSap(B);
    return;
  }
  for (const c of B.parts) {
    c.removeFromParent();
    c.dispose();
    sapMeshes--;
  }
  B.g.removeFromParent();
  SAP.delete(it.layer);
}
export const saplingStats = () => ({
  batches: SAP.size,
  meshes: sapMeshes,
  saplings: [...SAP.values()].reduce((n, B) => n + B.list.length, 0),
}); // (for the checks)
function regrow(it) {
  stumps.delete(it);
  if (it.fe) it.fe[4] = 2;
  it.felled = false;
  it.dug = false;
  it.gone = false;
  markDirty();
  it.col.r = it.r0;
  it.col.vr = it.vr0;
  if (it.stumpCol) {
    it.stumpCol.r = 0;
    it.stumpCol.vr = 0;
  }
  unsap(it);
  it.stump?.removeFromParent();
  it.stump = null;
} // (its meshes share the forest's geometry and materials)

// shaking: a quick decaying wobble; falling: it tips over slowly, then faster (a toppling pole), crashes and bounces a
// little, lies there a moment, then breaks up into logs (the host drops them along the trunk) and sinks away
function tickLive(it, L, dt) {
  L.t += dt;
  if (!L.fall) {
    L.shake = Math.max(0, L.shake - dt * 2.2);
    const a = L.shake * 0.035;
    L.g.rotation.set(Math.sin(L.t * 31) * a, 0, Math.cos(L.t * 27) * a);
    if (L.shake <= 0 && (L.idle += dt) > 2.5) unlift(it);
    return;
  }
  const F = L.fall,
    len = it.s;
  F.t += dt;
  if (!F.land || F.t - F.land < 1.2) {
    F.w += (3.2 * Math.sin(F.a) + 0.2) * dt;
    F.a += F.w * dt;
    if (F.a >= F.max) {
      F.a = F.max;
      if (!F.land) {
        F.land = F.t;
        F.w = -F.w * 0.16;
        sfx('crash', it);
        for (let k = 2; k <= 8; k += 2) thud(it.x + (F.fx * len * k) / 10, it.z + (F.fz * len * k) / 10, 10);
        if (Math.hypot(it.x - player.x, it.z - player.z) < 25) player.shake = 0.3;
      } else F.w = 0;
    }
  }
  L.g.rotation.set(0, 0, 0);
  L.g.quaternion.setFromAxisAngle(F.axis, F.a);
  if (F.land && F.t - F.land > 1.6) {
    if (!F.broke) {
      F.broke = true;
      for (let k = 1; k <= 7; k += 2)
        dustPuff(
          new THREE.Vector3(
            it.x + (F.fx * len * k) / 10,
            groundY(it.x + (F.fx * len * k) / 10, it.z + (F.fz * len * k) / 10),
            it.z + (F.fz * len * k) / 10,
          ),
          12,
        );
      if (F.host) {
        const n = it.young ? 1 : 2 + (rng() < 0.5 ? 1 : 0);
        /* (ticket 56: a young tree is one log) */ for (let j = 0; j < n; j++) {
          const s = 0.12 + j * 0.13;
          dropLoot(
            it.x + F.fx * len * s,
            it.z + F.fz * len * s,
            it.type === 'shroom' ? (j ? 'fiber' : 'food') : 'wood',
          );
        }
      } /* (a mushroom: its flesh and fibers) */
    }
    L.g.position.y -= dt * 3;
    if (F.t - F.land > 2.4) unlift(it);
  }
}
