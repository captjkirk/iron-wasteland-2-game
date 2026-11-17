// Creature AI: spawning, packs, hunts, threat marks, climbing, and the creatures' part of each frame (tickCreatures, called
// from update() in game.js). game.js re-exports what it exported before, so older imports from game.js keep working.
import * as THREE from 'three';
import {
  ENEMY,
  WATER_Y,
  SAFE_R,
  PASS_N,
  HALF,
  BIOME,
  CAMP,
  WAKE_RADIUS,
  CLOSE,
  CHARS,
  PX,
  WARN_T,
  EASY_CALM,
  CHARGE,
  SPIT_GAP,
  PASS_OUT,
} from './config.js';
import { campfire } from './camp.js';
import { buildings, raiderCamps, lampSpots } from './buildings.js';
import { nightK, isNight } from './daynight.js';
import { rng } from './noise.js';
import { groundY, biomeAt, PASSES, slopeAt } from './world.js';
import { nearColliders, colR, floorAt, headroom, standAt } from './props.js';
import { buildCreature } from './creatures.js';
import { places } from './places.js';
import { caveAt, caveDepth } from './cavemap.js';
import { caveDark, caveLights } from './caves.js';
import { splash, dustPuff } from './effects.js';
import { sfx } from './audio.js';
import { logEvent } from './playlog.js';
import { level, LEVELS, send, joining, everyone, nearestP, gone, followHost, hurt } from './coop.js';
import { fireSpots, lightSpots, built } from './craft.js';
import { dropFrom } from './arrows.js';
import { torchWarm, carriedWarm, FEARS_FIRE, torchLights, torchOn, byFlame } from './torch.js';
import { wallAhead, fortSize, damageBuilt } from './build.js';
import { spit, held, tickSpiders } from './spiders.js';
import { scene, enemies, camera, renderer, player, nameOf, upgraded, log } from './state.js';
import { running, collide, AURA_R, charm, enemyShot } from './game.js';

let spawnTick = -1;
let packN = 0,
  enemyN = 0;
export function spawnEnemy(x, z, type, pack = ++packN, slot = 0, size = 1) {
  const st = ENEMY[type],
    mesh = buildCreature(type);
  mesh.scale.setScalar(st.scale);
  mesh.position.set(x, groundY(x, z), z);
  scene.add(mesh);
  mesh.add(...threatMarks(type));
  const lurk = type === 'bog_lurker' && (biomeAt(x, z) === 'swamp' || groundY(x, z) < WATER_Y + 0.3); // (issue #44: on the Fungal Hollow's dry ground it roams in sight)
  const e = {
    id: ++enemyN,
    type,
    mesh,
    x,
    z,
    hp: st.hp,
    maxHp: st.hp,
    vx: 0,
    vz: 0,
    yaw: rng() * 6.28,
    state: lurk ? 'lurk' : 'idle',
    wander: 0,
    atkT: 0,
    stag: 0,
    flashT: 0,
    dead: 0,
    pack,
    slot,
    size,
    flank: (slot - (size - 1) / 2) * 0.85,
    circle: rng() < 0.5 ? 1 : -1,
    voiceT: 2 + rng() * 4,
    barT: 0,
    emT: 0,
    wT: 0,
    rT: 0,
  };
  enemies.push(e);
  if (mesh.userData.anim && 'ph' in mesh.userData.anim) mesh.userData.anim.ph = (slot * 0.618034) % 1; // (a pack out of step: each its own point in the stride, by its place in the pack; creatures.js)
  return e;
}
// slice 22 (#51): a pack of n of one kind set down round (x, z), one pack that wakes together; returns them (for #52's radio-tower
// guards: set each one's `home` to keep them by the tower until they see someone, as the raiders keep to their camps)
export function spawnPack(x, z, type, n = 4) {
  const id = ++packN;
  return Array.from({ length: n }, (_, k) => {
    const a = (k / n) * 6.283;
    return spawnEnemy(x + Math.cos(a) * 2.5, z + Math.sin(a) * 2.5, type, id, k, n);
  });
}
// issue #44: the 1.1 s freeze 32 s into Jared's play, as the first bears and wolves came into view: the first creature of
// each kind on screen compiled its shaders then (on this Mac's M5 GPU 150 to 600 ms a kind, more on older machines). While
// the world loads, one of each (fur shells on, threat ring showing) is compiled and drawn once in front of the camera, so
// play starts with them ready. They are kept (not disposed): disposing their own materials would free the shared programs
export async function warmCreatures() {
  const g = new THREE.Group();
  camera.updateMatrixWorld();
  g.position.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(9));
  g.quaternion.copy(camera.quaternion);
  Object.keys(ENEMY).forEach((type, i) => {
    const m = buildCreature(type);
    m.scale.setScalar(ENEMY[type].scale);
    m.add(...threatMarks(type));
    m.userData.setDetail?.(true);
    const ring = m.getObjectByName('threat');
    ring.visible = true;
    ring.material.opacity = 0.5;
    m.position.set((i - 4) * 1.8, -1, 0);
    g.add(m);
  });
  // (none culled: at load the camera is far from the sun's shadow box (40 m round the start), so the shadow pass skipped every
  // culled piece and the raiders' double-sided gear built its shadow program on the first raider in view, November 15, 2026)
  g.traverse((o) => {
    o.frustumCulled = false;
  });
  scene.add(g);
  scene.updateMatrixWorld();
  try {
    await renderer.compileAsync(g, camera, scene);
  } catch {
    /* (compiled by the draw below) */
  }
  renderer.render(scene, camera);
  scene.remove(g);
  WARM = g;
}
let WARM = null;
// Under every creature: a soft dark contact blob (it grounds them and lifts them off bright ground at range), and a
// red threat ring that shows while it hunts you and flares during a wind-up, so a pack at 20 m is easy to pick out.
let MARKS = null;
function threatMarks(type) {
  if (!MARKS) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d'),
      gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(0.6, 'rgba(0,0,0,0.3)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    MARKS = {
      blob: new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      ring: new THREE.RingGeometry(0.78, 0.92, 40).rotateX(-Math.PI / 2),
      disc: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    };
  }
  const len =
    {
      wolf: 1.9,
      dust_hound: 1.7,
      bear: 2.2,
      rat: 1.6,
      ice_crawler: 1.9,
      bog_lurker: 1.8,
      spider: 2.3,
      spider_pale: 2.3,
      spider_widow: 2.3,
      spider_brute: 2.3,
      spider_nest: 3.4,
    }[type] || 1.8;
  const blob = new THREE.Mesh(MARKS.disc, MARKS.blob);
  blob.scale.set(len * 0.62, 1, len);
  blob.position.y = 0.04;
  blob.name = 'blob';
  const ring = new THREE.Mesh(
    ENEMY[type]?.danger ? (MARKS.teeth ||= toothed()) : MARKS.ring,
    new THREE.MeshBasicMaterial({
      color: 0xff3a22,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  ); // (its fade with the fog is ringSeen's)
  ring.scale.setScalar(len * 0.62);
  ring.position.y = 0.06;
  ring.visible = false;
  ring.name = 'threat';
  return [blob, ring];
}
// #66 follow-up (Jared, 2026-11-15, playing Dev: "enemies with the circles are too obvious in places where you can't otherwise
// see"): the ring is unlit and glows, so it showed creatures the dark, the fog or a wall hid. Now it is never plainer than its
// creature: dimmed by the same dark (unless a flame is near it), faded by the same fog, and gone when no line from the eye reaches it.
const LIT = []; // (this frame's flames: carried and built torches, fires, lamps)
function ringSeen(e) {
  const f = scene.fog,
    c = camera.position,
    d = Math.hypot(e.x - c.x, e.z - c.z);
  const fk = f?.isFog ? Math.min(1, Math.max(0, (f.far - d) / Math.max(1, f.far - f.near))) : 1;
  let lk = 1 - 0.95 * Math.max(nightK(), caveDark());
  /* (a cave is as dark as night, as main.js lights it) */ for (const q of LIT)
    lk = Math.max(lk, Math.min(1, Math.max(0, (10 - Math.hypot(q.x - e.x, q.z - e.z)) / 6))); // (full within 4 m of a flame, none past 10 m)
  return e.inEye ? fk * lk : 0;
}
// is any of it in the eye's line: its middle or either side, past the ground and every solid circle the line crosses (each circle
// tested against the whole line, so a thin wall run cannot slip between samples)
function inEye(e, h) {
  const c = camera.position,
    dx = e.x - c.x,
    dz = e.z - c.z,
    L = Math.hypot(dx, dz) || 1,
    sx = (-dz / L) * 0.6,
    sz = (dx / L) * 0.6,
    ty = e.mesh.position.y + h * 0.5,
    qs = new Set();
  for (let u = 0; u < L + 6; u += 6)
    for (const q of nearColliders(c.x + dx * Math.min(1, u / L), c.z + dz * Math.min(1, u / L)))
      if (q.r && q.top != null) qs.add(q); // (8 m cells: every 6 m covers the line)
  for (const k of [0, 1, -1]) {
    const tx = e.x + sx * k,
      tz = e.z + sz * k,
      ex = tx - c.x,
      ez = tz - c.z,
      L2 = ex * ex + ez * ez || 1;
    let clear = true;
    for (let i = 1; i < 16 && clear; i++) {
      const t = i / 16;
      if (groundY(c.x + ex * t, c.z + ez * t) > c.y + (ty - c.y) * t) clear = false;
    }
    for (const q of qs) {
      if (!clear) break;
      const t = ((q.x - c.x) * ex + (q.z - c.z) * ez) / L2;
      if (t <= 0 || t >= 1) continue; // (not the circle it stands in, nor one at the eye)
      const px = c.x + ex * t,
        pz = c.z + ez * t,
        py = c.y + (ty - c.y) * t;
      if (Math.hypot(q.x - px, q.z - pz) < colR(q, px, pz) && q.top > py && !(q.bot > py)) clear = false;
    }
    if (clear) return true;
  }
  return false;
}
// #66: a danger's warning, on every game (the host's, and a joined one from the host's world message): it rears and roars,
// and the ground shakes by how near this game's own player is (not on Easy: the stranger's review)
export function dangerCue(e) {
  e.mesh.userData.anim.attack();
  sfx(e.type, e, 1.3);
  sfx('thud', e);
  const pd = Math.hypot(player.x - e.x, player.z - e.z);
  if (level() !== LEVELS.easy && pd < 30 && running) player.shake = Math.max(player.shake || 0, 0.3 * (1 - pd / 30));
}
// #66: a danger's ring has twelve teeth round its rim (a shape, not a colour, says "this one is different": Jared is colourblind)
function toothed() {
  const sh = new THREE.Shape(),
    n = 12,
    hole = new THREE.Path();
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2,
      r = i % 2 ? 1.12 : 0.9;
    sh[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
  }
  hole.absarc(0, 0, 0.76, 0, Math.PI * 2, true);
  sh.holes.push(hole);
  return new THREE.ShapeGeometry(sh, 4).rotateX(-Math.PI / 2);
}
// the follow-ups to #66 (Jared: the narrow passes out of the Greenbelt were crowded): the ring's mountains are too steep to
// spawn on, so every spawn round a player near the valley's edge landed in a pass, 41 of them after a minute at each mouth
// on the classic world, none just beyond. Now a spawn into a pass's narrow part is refused once that pass holds PASS_N
// creatures, and each pass has a few waiting where it opens onto its land (topped up while a player is within 200 m of the spot)
const inPass = (x, z) => {
  const r = Math.hypot(x, z),
    a = Math.atan2(z, x);
  return r < 250 ? PASSES.findIndex((q) => Math.abs(Math.atan2(Math.sin(a - q.a), Math.cos(a - q.a))) * r < 32) : -1;
};
const outside = (q) => ({ x: Math.cos(q.a) * 285, z: Math.sin(q.a) * 285 }),
  around = (o, R) => enemies.filter((e) => !e.dead && !e.home && Math.hypot(e.x - o.x, e.z - o.z) < R).length;
const crowded = (x, z, n) => {
  const k = inPass(x, z);
  return (
    k >= 0 &&
    enemies.filter((e) => !e.dead && !e.home && Math.hypot(e.x, e.z) >= SAFE_R && inPass(e.x, e.z) === k).length + n >
      PASS_N
  );
}; // (n: the whole pack, so one never overfills a pass; the stranger's review)
// round 4 (gilded-hollow-29: a rat stood for minutes in a sealed pocket between a ruins house's walls, a pack member set down
// 2.5 m from its pack's middle): no creature is spawned in a building's footprint (and a metre round it) or in a solid
const clearSpot = (x, z) =>
  !buildings.some((b) => {
    if (!b.w) return false;
    const dx = x - b.x,
      dz = z - b.z,
      lx = dx * b.ca + dz * b.sa,
      lz = -dx * b.sa + dz * b.ca;
    return Math.abs(lx - (b.cx || 0)) < b.w / 2 + 1 && Math.abs(lz - (b.cz || 0)) < b.d / 2 + 1;
  }) &&
  !nearColliders(x, z).some(
    (c) => c.r && !(c.bot != null && groundY(x, z) + 1.7 < c.bot) && Math.hypot(c.x - x, c.z - z) < colR(c, x, z) + 0.5,
  );
export function spawnAround(cx, cz, count, minD = 25, maxD = 90, land = null, ok = null) {
  let made = 0,
    tries = 0;
  while (made < count && tries++ < count * 20) {
    const a = rng() * 6.28,
      d = minD + rng() * (maxD - minD),
      x = cx + Math.cos(a) * d,
      z = cz + Math.sin(a) * d;
    if (Math.abs(x) > HALF - 60 || Math.abs(z) > HALF - 60 || Math.hypot(x, z) < SAFE_R + 12)
      continue; /* nothing spawns in the safe valley */
    if (
      groundY(x, z) < (biomeAt(x, z) === 'swamp' ? WATER_Y - 0.4 : WATER_Y + 0.4) ||
      slopeAt(x, z) > 0.7 ||
      (ok && !ok(x, z)) ||
      !clearSpot(x, z)
    )
      continue;
    const list = BIOME[land || biomeAt(x, z)].enemies;
    const type = list[Math.floor(rng() * list.length)];
    // wolves and hounds run in packs, rats in small swarms
    // (slice 21: wolves and hounds 3 to 5, rats 2 to 4)
    const pack = Math.max(
        1,
        Math.round(
          ((type === 'wolf' || type === 'dust_hound'
            ? 3 + Math.floor(rng() * 3)
            : type === 'rat'
              ? 2 + Math.floor(rng() * 3)
              : 1) +
            (isNight() && type !== 'bear' ? 1 : 0)) *
            level().pack,
        ),
      ),
      id = ++packN; // (slice 33: the difficulty) // (slice 13: a pack runs one bigger at night)
    if (crowded(x, z, pack)) continue;
    for (let k = 0; k < pack; k++) {
      const px = x + (rng() - 0.5) * 5,
        pz = z + (rng() - 0.5) * 5,
        free = clearSpot(px, pz);
      spawnEnemy(free ? px : x, free ? pz : z, type, id, k, pack);
    }
    made += pack;
  } // (a member's spot shut in: at the pack's middle, which is clear; the crowd push spreads them)
}
// issue #44 (Jared's play, 2026-11-12: "no enemies really showing up?"): a steady trickle of threats. A player out of the
// valley whom nothing has hunted for 45 to 75 s (a third less at night) has a pack sent at them: an idle pack 35 to 62 m
// off (within 10 m of their height) is woken, or else a pack of their own land's creatures comes from 45 to 60 m out. It does not give up on the way
// (until it has come within its notice range, or 30 s pass). The host's game only, as every spawn; never in the valley
// slice 21 (#50, 2026-11-14: "too easy (few enemies)"; no creature within 40 m half the time): 25 to 45 s, half that at night
const HUNT_WAIT = (nk) => (25 + rng() * 20) * (1 - 0.35 * nk) * level().hunt; // (the stranger's review: night stacked too hard for the youngest players; slice 33: Easy sends them less often)
function sendHunt(q, t, nk) {
  // (from where it can run to them: within 10 m of their height, and the straight way in has no deep water and no rise too
  // steep to scramble; a pack sent across the river sat on its far bank, the walk check's first try)
  const qy = groundY(q.x, q.z),
    level = (x, z) => {
      if (Math.abs(groundY(x, z) - qy) >= 10) return false;
      const L = Math.hypot(q.x - x, q.z - z),
        n = Math.ceil(L / 2.5);
      for (let k = 1; k < n; k++) {
        const px = x + ((q.x - x) * k) / n,
          pz = z + ((q.z - z) * k) / n,
          y = groundY(px, pz),
          y0 = groundY(x + ((q.x - x) * (k - 1)) / n, z + ((q.z - z) * (k - 1)) / n);
        if (y < WATER_Y - 0.6 || (slopeAt(px, pz) > 1.3 && y > y0)) return false;
      }
      return true;
    };
  let pick = null,
    bd = 1e9;
  for (const e of enemies) {
    if (e.dead || e.home || e.posed || e.hunter?.until > t || (e.state !== 'idle' && e.state !== 'lurk')) continue;
    const d = Math.hypot(e.x - q.x, e.z - q.z);
    if (d > 35 && d < 62 && level(e.x, e.z) && Math.abs(d - 50) < bd) {
      bd = Math.abs(d - 50);
      pick = e;
    }
  }
  const land = biomeAt(q.x, q.z),
    n0 = enemies.length;
  if (!pick) spawnAround(q.x, q.z, 1, 45, 60, BIOME[land] ? land : null, level);
  const pack = pick ? enemies.filter((o) => o.pack === pick.pack && !o.dead) : enemies.slice(n0);
  if (!pack.length) return;
  for (const e of pack) {
    e.hunter = { until: t + 30 };
    if (e.state === 'lurk') {
      e.state = 'emerge';
      e.emT = 0.8;
    } else e.state = 'chase';
  }
  if (pack[0].type === 'wolf') wolfSay('wolfcall', pack[0]); // (a pack sent at you calls as it sets off)
  logEvent('hunt', {
    enemy: pack[0].type,
    n: pack.length,
    d: Math.round(Math.hypot(pack[0].x - q.x, pack[0].z - q.z)),
    woke: !!pick,
    biome: land,
    at: nameOf(q),
    night: nk > 0.5 || undefined,
  });
  sfx(pack[0].type, pack[0]);
  return true;
}
function alertPack(e) {
  for (const o of enemies)
    if (o.pack === e.pack && !o.dead && (o.state === 'idle' || o.state === 'lurk')) {
      if (o.state === 'lurk') {
        o.state = 'emerge';
        o.emT = 0.8;
      } else o.state = 'chase';
    }
  sfx(e.type, e);
  if (e.type === 'wolf') wolfSay('wolfcall', e);
}
// wolves (the follow-ups to #66, Jared: wolves seemed silent until they bit): their calls carry (half as loud at 20 m, heard to
// 120 m; a howl to 170 m) and come from where they stand, on every player's game. A pack that has seen you and is watching
// gives a low call (from 45 m, before it comes for you); one that comes for you gives a sharp yipping call, and its wolves
// call again now and then on the way; at night, now and then, a pack 50 to 160 m off howls (no longer a howl from nowhere)
function wolfSay(n, e, k = 1) {
  sfx(n, e, k);
  send('all', { t: 'say', n, x: +e.x.toFixed(1), z: +e.z.toFixed(1), k });
}
// hunting animals run down a walking player (IW1's speeds are a wander; at them the player outran every wolf)
export const CHASE = { wolf: 2.0, dust_hound: 1.4, bear: 2.2 };
// spiders climb (the follow-ups to #66; Jared: spiders that climb walls, the radio tower, cliffs and trunks, but never a
// ceiling or the underside of an overhang, and a climb a little slower than a run): a spider whose quarry stands up out
// of reach looks for a solid within 4 m of them that rises to their height and reaches the ground, with nothing overhead
// on the side it would climb (no floor, deck or platform above that spot below the quarry's height); it runs to the foot of
// it, climbs straight up at CLIMB_K of its running speed, steps over the lip and walks on up there (e.y: its feet's height
// while off the ground), and drops off an edge it walks over. A steep slope it walks up, at the same slower pace
export const CLIMB_K = 0.6;
const climber = (e) => ENEMY[e.type].spider && e.type !== 'spider_nest';
const eFeet = (e) => e.y ?? groundY(e.x, e.z);
function climbSpot(e, tg, ty) {
  let best = null,
    bd = 1e9;
  for (const c of nearColliders(tg.x, tg.z)) {
    if (!c.r || c.gate || c.bp || c.top == null || c.top < ty - 0.3 || Math.hypot(c.x - tg.x, c.z - tg.z) > 4) continue;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * 6.283,
        nx = Math.cos(a),
        nz = Math.sin(a);
      let R = colR(c, c.x + nx * c.r, c.z + nz * c.r);
      const wx = c.x + nx * R,
        wz = c.z + nz * R;
      R = colR(c, wx, wz);
      const x = c.x + nx * (R + 0.05),
        z = c.z + nz * (R + 0.05),
        g0 = groundY(x, z),
        g = floorAt(x, z, g0); // (its floor there: the ground, or a pad or deck on it)
      if (
        g0 < WATER_Y + 0.2 ||
        (c.bot != null && c.bot > g + 0.3) ||
        headroom(x, z, g - 1.15) < ty + 1 ||
        Math.hypot(x - tg.x, z - tg.z) > 4.5
      )
        continue; // (anything over this spot below the top of the climb, the quarry's own floor too, is an overhang)
      if (nearColliders(x, z).some((q) => q !== c && q.r && Math.hypot(q.x - x, q.z - z) < colR(q, x, z))) continue; // (inside another solid; a wall run's next circle is 0.57 m off)
      const dd = Math.hypot(x - e.x, z - e.z);
      if (dd < bd) {
        bd = dd;
        best = { x, z, g, nx, nz, top: ty, ph: 'go' };
      }
    }
  }
  return best;
}
// pinned against something on the way (a fence, a wall, a rock) while hunting: the spot on its face to climb straight over it.
// Not the player's own pieces (the fort rules decide those), nothing over 12 m, and nowhere with a ceiling over the spot
// the nearest open ground 2 to 5 m from a creature that is stuck: not too deep, not steep, no more than 1.5 m above or below it,
// clear of every solid; of the nearest ring that has any, the spot nearest its quarry
function openNear(e, r, q) {
  const g0 = groundY(e.x, e.z);
  for (let R = 2; R <= 5; R += 0.5) {
    let best = null,
      bd = 1e9; // (2 m at least: out of the trap's reach, not back in it)
    for (let k = 0; k < 16; k++) {
      const x = e.x + Math.cos((k * Math.PI) / 8) * R,
        z = e.z + Math.sin((k * Math.PI) / 8) * R,
        g = groundY(x, z);
      if (
        (g < WATER_Y - 0.8 && e.type !== 'bog_lurker') ||
        slopeAt(x, z) > 1.0 ||
        Math.abs(g - g0) > 1.5 ||
        Math.abs(x) > HALF - 2 ||
        Math.abs(z) > HALF - 2
      )
        continue;
      if (nearColliders(x, z).some((c) => c.r && Math.hypot(c.x - x, c.z - z) < colR(c, x, z) + r)) continue;
      const d = q ? Math.hypot(q.x - x, q.z - z) : 0;
      if (d < bd) {
        bd = d;
        best = { x, z };
      }
    }
    if (best) return best;
  }
  return null;
}
function overSpot(e, hx, hz, maxH = 12, ahead = 0.3) {
  const L = Math.hypot(hx, hz) || 1,
    r = 0.45 * ENEMY[e.type].scale;
  let best = null,
    bd = 1e9;
  for (const c of nearColliders(e.x, e.z)) {
    if (!c.r || c.gate || c.bp || c.top == null) continue;
    const R = colR(c, e.x, e.z),
      dx = e.x - c.x,
      dz = e.z - c.z,
      d = Math.hypot(dx, dz) || 1;
    if (d > R + r + 0.3 || (dx * hx + dz * hz) / (d * L) > -ahead) continue; // (touching it, and it is ahead)
    const x = c.x + (dx / d) * (R + 0.05),
      z = c.z + (dz / d) * (R + 0.05),
      g = floorAt(x, z, groundY(x, z));
    const lx = x - (dx / d) * (0.95 + r),
      lz = z - (dz / d) * (0.95 + r); // (where it comes down on the far side)
    if (
      c.top - g < 0.6 ||
      c.top - g > maxH ||
      headroom(x, z, g - 1.15) < c.top + 1 ||
      headroom(lx, lz, c.top - 0.9) < Infinity ||
      d >= bd
    )
      continue;
    bd = d;
    best = { x, z, g, nx: dx / d, nz: dz / d, top: c.top, ph: 'up', over: true };
  }
  return best;
}
// one frame of a climb; returns the way to go (on the way to its foot) or true (held by the climb itself)
function climbStep(e, tg, ty, dt, spd) {
  let c = e.cl;
  if (c && Math.abs(c.top - ty) > 1 && c.ph === 'go') c = e.cl = null; // (the quarry moved on: plan again)
  if (!c && !(e.clT > 0)) {
    c = e.cl = climbSpot(e, tg, ty);
    if (!c) e.clT = 1 + rng() * 0.5;
  } // (no way up: look again in a second or so, a pack not all at once)
  if (!c) return null;
  if (c.ph === 'go' && (c.T = (c.T || 0) + dt) > 8) {
    e.cl = null;
    e.clT = 2;
    return null;
  } // (8 s and still not at its foot: water or something in the way; think again)
  if (c.ph === 'go') {
    const r = 0.45 * ENEMY[e.type].scale + 0.15,
      gx = c.x + c.nx * r,
      gz = c.z + c.nz * r,
      dx = gx - e.x,
      dz = gz - e.z,
      L = Math.hypot(dx, dz);
    if (L > 0.35) {
      const o = overSpot(e, dx, dz, 4, 0.7);
      if (o) {
        e.cl = o;
        return true;
      }
      return { mx: dx / L, mz: dz / L };
    }
    c.ph = 'up';
    e.y = c.g;
  } // (a fence or wall square in the way to its foot: over that first)
  if (c.ph === 'up') {
    if (e.y == null) e.y = c.g;
    const f = Math.min(1, (e.y - c.g) / Math.max(0.5, c.top - c.g));
    let ax = c.x,
      az = c.z; // (up a leaning mast: in toward the top as it rises, ending a metre short of its quarry)
    if (!c.over) {
      const dx = tg.x - c.x,
        dz = tg.z - c.z,
        L = Math.hypot(dx, dz) || 1,
        k = (Math.max(0, L - 1) / L) * f;
      ax += dx * k;
      az += dz * k;
    }
    e.x += (ax - e.x) * Math.min(1, dt * 6);
    e.z += (az - e.z) * Math.min(1, dt * 6);
    e.yaw = Math.atan2(c.nx, c.nz); // (facing the wall, its belly to it)
    e.y += spd * CLIMB_K * dt;
    e.cs = spd * CLIMB_K;
    if (e.y >= c.top) {
      const dx = tg.x - e.x,
        dz = tg.z - e.z,
        L = Math.hypot(dx, dz) || 1;
      e.y = c.top;
      c.ph = 'over';
      c.k = 0;
      c.sx = e.x;
      c.sz = e.z;
      c.ox = dx / L;
      c.oz = dz / L;
      c.oL = Math.min(1.5, Math.max(0.6, L - 1));
      if (c.over) {
        c.ox = -c.nx;
        c.oz = -c.nz;
        c.oL = 0.9 + 0.45 * ENEMY[e.type].scale;
      } /* (a fence or wall: across it, then down the far side) */
    }
    return true;
  }
  c.k = Math.min(1, c.k + dt / 0.5);
  e.x = c.sx + c.ox * c.oL * c.k;
  e.z = c.sz + c.oz * c.oL * c.k;
  e.cs = 1; // over the lip, toward the quarry
  if (c.k >= 1) {
    e.cl = null;
    e.cs = 0;
    e.fallV = 0;
    if (standAt(e.x, e.z, e.y + 0.35) < e.y - 0.4) e.clT = 3;
  }
  return true;
} // (nothing under it at the top: it drops, and waits before trying again)
// a hunter's way round what pins it: the nearest reachable spot to (x1, z1) on a 0.5 m grid 32 m square round it, open where
// creatureCollide() would let a creature stand (an open gate does not block) and bad() allows; the path from
// that spot back, the next waypoint last; null if it is already as close as it can get. ponytail: plain breadth-first, ~4k cells
// at most once in 3 s a creature (a cap at 2500 cells stopped a hound short of its own doorway); A* if a pack pins at once and it shows in the frame time
function wayRound(x0, z0, x1, z1, r, bad) {
  const K = 0.5,
    N = 64,
    H = N / 2,
    ox = x0 - H * K,
    oz = z0 - H * K,
    s0 = H + H * N;
  const open = (x, z) =>
    !bad(x, z) &&
    !nearColliders(x, z).some(
      (c) =>
        c.r &&
        !(c.bot != null && groundY(x, z) + 1.7 < c.bot) &&
        !c.gate?.open &&
        Math.hypot(c.x - x, c.z - z) < colR(c, x, z) + r * 0.6,
    ); // (an upper floor's wall blocks a creature as creatureCollide() does: from the ground. 0.6 of its width: a 0.5 m grid misses a gap it fits through, and collide() keeps it off the walls)
  const from = new Int16Array(N * N).fill(-1),
    Q = [s0];
  from[s0] = s0;
  let best = s0,
    bd = Math.hypot(x1 - x0, z1 - z0) - 0.5;
  for (let h = 0; h < Q.length; h++) {
    const k = Q[h],
      i = k % N,
      j = (k - i) / N,
      d = Math.hypot(x1 - ox - i * K, z1 - oz - j * K);
    if (d < bd) {
      bd = d;
      best = k;
    }
    if (d < 1.2) break;
    for (const [a, b] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ii = i + a,
        jj = j + b,
        kk = ii + jj * N;
      if (ii < 0 || jj < 0 || ii >= N || jj >= N || from[kk] >= 0) continue;
      from[kk] = k;
      if (open(ox + ii * K, oz + jj * K)) Q.push(kk);
    }
  }
  if (best === s0) return null;
  const path = [];
  for (let k = best; k !== s0; k = from[k]) path.push([ox + (k % N) * K, oz + Math.floor(k / N) * K]);
  return path;
}
// a creature: its feet on the ground for walls with a bottom (a stilt house's stand on its floor: it walked through them, the review of
// November 15, 2026), and no gates or steps
export const creatureCollide = (e, r) => collide(e, r, undefined, groundY(e.x, e.z));
const FLOOR = (x, z) => floorAt(x, z, groundY(x, z)); // (a creature's feet on a house floor)
const HUNTS = ['chase', 'windup', 'recover', 'emerge', 'siege'],
  SMELL = new Set(['wolf', 'dust_hound', 'bear']);
const HEATERS = () => places.filter((q) => q.heater).map((q) => ({ ...q.heater, heater: true })); // slice 23
const strikeCD = new Map(); // player -> seconds until the next enemy may wind up at them
const spitAt = new Map(); // #66: player -> game time before which no pale spider (or bog lurker) spits at them
// a spitter spits only down a clear line (bog lurker spit, November 15, 2026): not through a rock, a tree, a house wall, the ground
// or a cave's side (wallAhead sees only the walls players build); the solid test is the watcher's (watch.js solidAt)
function clearShot(e, q) {
  const y0 = e.mesh.position.y + 0.7,
    y1 = (q.y ?? groundY(q.x, q.z)) + 1.1,
    dx = q.x - e.x,
    dz = q.z - e.z,
    L = Math.hypot(dx, dz),
    cv = caveAt(e.x, e.z);
  for (let s = 0.8; s < L - 0.6; s += 0.5) {
    const k = s / L,
      x = e.x + dx * k,
      z = e.z + dz * k,
      y = y0 + (y1 - y0) * k;
    if ((cv && caveDepth(cv.L, x, z).d < 0.3) || groundY(x, z) > y) return false; // (in a cave: the glob's width inside the passage)
    for (const c of nearColliders(x, z))
      if (
        c.r &&
        !c.gate?.open &&
        !(c.stand != null && y >= c.stand - 0.1) &&
        !(c.top != null && y >= c.top) &&
        Math.hypot(x - c.x, z - c.z) < colR(c, x, z)
      )
        return false;
  }
  return true;
}
export function tickCreatures(dt, t) {
  // enemies (dormant beyond the wake radius, as in IW1)
  // turns: one enemy winds up at a time, and the next waits a moment after it (his first play: four raiders struck inside a second)
  const NK = nightK(),
    fires = [campfire, ...fireSpots(), ...HEATERS(), ...torchWarm()],
    carried = carriedWarm(),
    near = (L, q) => L.some((f) => Math.hypot(q.x - f.x, q.z - f.z) < f.r + 1.5),
    warm = (q, type) => near(fires, q) || (FEARS_FIRE.has(type) && near(carried, q)); // (a carried torch: only against the animals that fear fire)
  let alive = 0;
  const striking = new Set(enemies.filter((e) => !e.dead && e.state === 'windup').map((e) => e.tg)),
    awake = [];
  for (const [k, v] of strikeCD) strikeCD.set(k, v - dt);
  const ppl = joining() ? null : everyone();
  LIT.length = 0;
  LIT.push(...torchLights(), ...lightSpots(), ...raiderCamps, CAMP, ...caveLights());
  if (nightK() > 0.3) LIT.push(...lampSpots());
  for (const e of enemies) {
    const st = ENEMY[e.type],
      u = e.mesh.userData,
      an = u.anim;
    if (e.dead) {
      e.dead -= dt;
      if (e.ck) {
        e.ck = e.ckW = 0;
        e.mesh.rotation.x = 0;
        e.mesh.position.y = Math.max(groundY(e.x, e.z), standAt(e.x, e.z, e.mesh.position.y + 0.35));
      }
      /* (killed on a wall: it drops to what is below) */ const tr = e.mesh.getObjectByName('threat');
      if (tr) tr.visible = false;
      an.update(dt, { speed: 0, scale: st.scale, ground: groundY });
      if (e.dead < 1.2 && !e.dropped) {
        e.dropped = true;
        dropFrom(e);
      }
      /* its arrows fall beside it */ if (e.dead < 1) e.mesh.position.y -= dt * 0.6;
      if (e.dead <= 0) {
        scene.remove(e.mesh);
        e.mesh.userData.dispose?.();
        e.gone = true;
      }
      continue;
    }
    alive++;
    const tg = joining() ? player : nearestP(e.x, e.z) || player,
      tgGone = gone(tg);
    if (joining()) followHost(e, dt); // a joined game's enemies go where the host's are
    const dx = tg.x - e.x,
      dz = tg.z - e.z,
      d = Math.hypot(dx, dz) || 1e-3,
      tx = dx / d,
      tz = dz / d;
    if (st.nest) {
      e.mesh.visible = d < 200;
      e.flashT = Math.max(0, e.flashT - dt);
      e.barT = Math.max(0, e.barT - dt);
      u.flash(e.flashT / 0.15);
      an.update(dt);
      continue;
    } // slice 22: a nest stands still (spiders.js sends its spiders out)
    // #60 (2026-11-14: two dust hounds stood frozen over Jared's body for 5 s, still "chasing"): asleep only when every player
    // is far off, a downed one too, whose camera is still on the spot. Measured to the quarry alone, a creature whose quarry
    // fell took the next one 200 m away as its quarry and froze mid-chase; awake, it gives up the hunt below and wanders off
    const wd = ppl ? ppl.reduce((m, q) => Math.min(m, Math.hypot(q.x - e.x, q.z - e.z)), d) : d;
    if (wd > WAKE_RADIUS && !(e.hunter?.until > t)) {
      e.mesh.visible = wd < 200;
      continue;
    }
    e.mesh.visible = true;
    awake.push(e); // (a pack sent hunting stays awake on its way: issue #44)
    u.setDetail(camera.position.distanceTo(e.mesh.position) < 32); // fur shells near the camera
    e.stag = Math.max(0, e.stag - dt);
    if (e.angry > 0) e.angry -= dt;
    e.flashT = Math.max(0, e.flashT - dt);
    e.barT = Math.max(0, e.barT - dt);
    u.flash(e.flashT / 0.15);
    {
      const ring = e.mesh.getObjectByName('threat'),
        hunt = HUNTS.includes(e.state);
      let want = hunt ? (e.state === 'windup' ? 1.0 : 0.55 + 0.12 * Math.sin(t * 5)) : 0; // (no ring on a creature that is not hunting)
      if (want) {
        if (!(e.eyeT > 0)) {
          e.eyeT = 0.2 + Math.random() * 0.1;
          e.inEye = inEye(e, u.height * e.mesh.scale.x);
        }
        e.eyeT -= dt;
        want *= ringSeen(e);
      } else e.eyeT = 0; // (a pack rechecks out of step; a fresh hunt looks at once) // (never plainer than the creature itself)
      ring.material.opacity += (want - ring.material.opacity) * Math.min(1, dt * 6);
      ring.visible = ring.material.opacity > 0.02;
    }
    // slice 13: at night an animal sees further, runs faster and bites harder (IW1: 1.35), unless its quarry is by a fire
    const nb = NK && !warm(tg, e.type) ? NK : 0,
      aggro = (st.aggro / 12) * (1 + 0.35 * nb) * (FEARS_FIRE.has(e.type) && torchOn(tg) ? 0.7 : 1),
      /* slice 26: a carried flame: it notices you later */ reach = 0.9 + st.scale * 0.75,
      bite = Math.max(1, Math.round(st.dmg * (e.sz || 1) * (1 + 0.35 * nb) * level().bite));
    /* (e.sz: a spider's own size, spiders.js: a half-size one bites for half) */ e.nb = nb; // (slice 33: the difficulty; e.nb: its night boost, for the checks)
    // issue #44: an idle animal notices a little further than IW1's sight (1.19x: the night check keeps a day wolf at 19 m
    // idle), and wolves, hounds and bears smell blood: a player under half health from twice IW1's sight; one dug in the mud
    // still only close. A creature below a player stood up on a ledge or a rock strikes up at them: its reach grows with the
    // rise, as far as it can rear (1.2 m + its size: a bear 2.8 m, a wolf 2.2 m); anyone higher than that it cannot reach,
    // and one stood up on a rock or a roof out of its reach it backs off from and circles (a slope it climbs instead)
    const blood = SMELL.has(e.type) && tg.hp < (tg.maxHp ?? tg.mx ?? Infinity) * 0.5,
      notice = aggro * (e.state === 'lurk' ? 1 : blood ? 2 : 1.19);
    const ty0 = tg.y ?? groundY(tg.x, tg.z),
      rise = ty0 - eFeet(e),
      rear = 1.2 + st.scale,
      up = rise <= rear,
      reachUp = reach + (rise > 0.4 && up ? Math.min(1.6, rise * 0.7) : 0);
    const high = !up && ty0 - groundY(tg.x, tg.z) > 0.3; // (stood up on a rock or a roof out of reach: it circles; up a slope it climbs on)
    const hunting = HUNTS.includes(e.state);
    // perception: a pack wakes together; giving up only far away; rats and hounds run when badly hurt
    // the safe valley: nothing follows the player in; anything inside the ring wanders back out
    const safe = Math.hypot(tg.x, tg.z) < SAFE_R - 12,
      inside = Math.hypot(e.x, e.z) < SAFE_R,
      host = !joining();
    if (host) {
      if (tgGone || (safe && !e.posed)) {
        if (e.state !== 'lurk' && e.state !== 'idle') {
          e.state = 'idle';
          e.wander = 0;
        }
      }
      if (inside && e.state === 'idle' && !e.posed) {
        e.wyaw = Math.atan2(e.x, e.z);
        e.wmove = true;
        e.wander = Math.max(e.wander, 1);
      }
      if (tgGone || (safe && !e.posed)) {
        /* no new hunts */
      } else if ((e.state === 'idle' || e.state === 'lurk') && d < notice && !(e.calmT > t && d > CLOSE))
        alertPack(e); // (#66: an Easy danger that warned you off lets you go)
      else if (e.type === 'wolf' && e.state === 'idle' && d < 45 && !(e.watchT > t)) {
        const w = t + 7 + rng() * 6;
        for (const o of enemies) if (o.pack === e.pack) o.watchT = w;
        wolfSay('wolfwatch', e);
      } // (watching you: once a pack, every 7 to 13 s)
      else if (
        e.state !== 'idle' &&
        e.state !== 'lurk' &&
        d > Math.max(aggro * 2.6, notice * 1.3) &&
        !(e.hunter?.until > t) &&
        !(e.angry > 0)
      )
        e.state = 'idle'; // (a sent pack holds on until it arrives)
      // (Jared, November 15, 2026, co-op on storm-heron-59: bears shot from range "chased him, then stopped and walked away while being
      // hit": past the give-up distance, about 63 m by day, a bear quit even mid-hit; now a blow holds its hunt 10 s: e.angry)
      if (e.hunter && (d < notice || tgGone || safe)) e.hunter.until = 0;
      if (hunting && !tgGone && d < 45) tg.huntedAt = t; // (the trickle waits while anything near hunts them)
      if ((e.type === 'rat' || e.type === 'dust_hound') && !e.fled && e.hp < e.maxHp * 0.3 && e.state !== 'idle') {
        e.state = 'flee';
        e.fleeT = 3;
        e.fled = true;
      }
      // slice 12: an upgraded Lauren's charm aura: an animal that closes in on her is charmed (each one at most every 10 s)
      if (!st.raider && (e.state === 'chase' || e.state === 'windup') && !(e.auraT > t))
        for (const q of everyone())
          if (
            !gone(q) &&
            (q === player ? upgraded('charmer') : q.u & 8 && CHARS[q.c]?.id === 'charmer') &&
            Math.hypot(q.x - e.x, q.z - e.z) < AURA_R
          ) {
            e.auraT = t + 10;
            charm(e);
            break;
          }
    }
    let mx = 0,
      mz = 0,
      spd = st.speed * PX * (1 + 0.15 * nb),
      face = false;
    if (e.state !== 'chase' || e.dead) e.spitW = 0;
    an.rear?.(e.spitW > 0); // #66: a pale spider's back end is up only while it means to spit (a joined game: from the host's world)
    if (e.cl && e.state !== 'chase') {
      e.cl = null;
      e.cs = 0;
    } // (stopped hunting on the way up: it lets go)
    if (host)
      switch (e.state) {
        case 'lurk':
          break; // buried in the mud, waiting
        case 'emerge':
          e.emT -= dt;
          if (e.emT <= 0) {
            e.state = 'chase';
          }
          face = true;
          break;
        case 'idle':
          e.warned = false;
          e.cueAt = 0;
          e.callT = 0;
          e.chargeT = 0;
          e.spitW = 0;
          e.wander -= dt;
          if (e.wander <= 0) {
            e.wander = 2 + rng() * 4;
            e.wyaw = rng() * 6.28;
            e.wmove = rng() < 0.55;
          }
          if (e.home && Math.hypot(e.x - e.home.x, e.z - e.home.z) > 9) {
            e.wyaw = Math.atan2(e.home.x - e.x, e.home.z - e.z);
            e.wmove = true;
          } // raiders drift back to their fire
          if (e.wmove) {
            mx = Math.sin(e.wyaw);
            mz = Math.cos(e.wyaw);
            spd *= 0.35;
          }
          break;
        case 'charmed':
          e.chT -= dt;
          if (e.chT <= 0) e.state = 'chase';
          e.wander -= dt;
          if (e.wander <= 0) {
            e.wander = 1 + rng() * 2;
            e.wyaw = rng() * 6.28;
          }
          mx = Math.sin(e.wyaw);
          mz = Math.cos(e.wyaw);
          spd *= 0.3;
          break;
        case 'flee':
          mx = -tx;
          mz = -tz;
          spd *= 1.15;
          e.fleeT -= dt;
          if (e.fleeT <= 0) e.state = 'chase';
          break;
        case 'windup':
          face = true;
          e.wT -= dt;
          mx = tx * 0.15;
          mz = tz * 0.15;
          if (e.wT <= 0) {
            if (st.shoot && d > reach + 0.7) {
              enemyShot(e, bite, tg);
              strikeCD.set(tg, Math.max(strikeCD.get(tg) || 0, d / 70 + 0.45));
            } /* the turn lasts until the bullet lands */ else {
              e.vx += tx * 5;
              e.vz += tz * 5;
              if (d < reachUp + 0.7 && up && !wallAhead(e.x, e.z, tx, tz, 0.2, d - 0.3)) hurt(tg, bite, e.type, e);
            }
            e.state = 'recover';
            e.rT = (st.atk / 1000) * 0.75;
          }
          break;
        case 'recover':
          e.rT -= dt;
          face = true;
          if (e.type === 'wolf' || e.type === 'dust_hound' || e.type === 'rat') {
            if (e.rT > (st.atk / 1000) * 0.4) {
              mx = -tx;
              mz = -tz;
              spd *= 0.7;
            }
          }
          if (e.rT <= 0) e.state = 'chase';
          break;
        case 'chase': {
          if (e.type === 'wolf' && d > 8 && !(e.callT > t)) {
            if (e.callT) wolfSay('wolfcall', e, 0.6);
            e.callT = t + 2.5 + rng() * 3;
          } // (calling on the way in)
          // #66: a danger that sees you rears and roars before it comes (on Easy it leaves you be unless you hurt it or come close),
          // then charges
          // (Jared, November 15, 2026, several bears at once: "they're in sync": a group that sees you together now rears and roars
          // one after another, each a third of a second or so after the last that began within 40 m in the last 1.5 s)
          if (st.danger && !e.warned) {
            const k = enemies.filter(
              (o) => o !== e && !o.dead && o.warnAt > t - 1.5 && Math.hypot(o.x - e.x, o.z - e.z) < 40,
            ).length;
            e.warned = true;
            e.warnAt = t;
            e.cueAt = t + ((k * 0.35) % 1.05) + rng() * 0.08;
            e.warnT = WARN_T + e.cueAt - t;
          }
          if (e.cueAt && t >= e.cueAt) {
            e.cueAt = 0;
            dangerCue(e);
            logEvent('danger', { enemy: e.type, d: Math.round(d) });
          }
          if (e.warnT > 0) {
            e.warnT -= dt;
            face = true;
            if (e.warnT <= 0) {
              if (level() === LEVELS.easy && e.hp >= e.maxHp && d > CLOSE) {
                e.state = 'idle';
                e.calmT = t + EASY_CALM;
                e.hunter = null;
                e.warned = false;
              } else e.chargeT = CHARGE.t;
            }
            break;
          }
          if (e.chargeT > 0) {
            e.chargeT -= dt;
            spd *= CHARGE.k;
          }
          // #66: the pale spider stands with its back end up, hissing, then spits a web glob at where its quarry stands now
          const sp = st.spit;
          if (sp && e.spitW > 0) {
            e.spitW -= dt;
            face = true;
            const q = e.spitTg;
            if (e.spitW <= 0 && q && !gone(q)) {
              const qx = q.x - e.x,
                qz = q.z - e.z,
                ql = Math.hypot(qx, qz) || 1,
                o = new THREE.Vector3(e.x, e.mesh.position.y + 0.7 * st.scale, e.z).addScaledVector(
                  new THREE.Vector3(qx / ql, 0, qz / ql),
                  0.5 * st.scale,
                ),
                aim = new THREE.Vector3(q.x, (q.y ?? groundY(q.x, q.z)) + 1.1, q.z),
                /* (at the one it hissed at, not whoever is nearest now: review) */ L = o.distanceTo(aim),
                fly = L / sp.speed,
                v = aim.sub(o).multiplyScalar(1 / fly);
              v.y += 0.5 * 3 * fly;
              /* (its arc: the glob falls at 3 m/s/s) */ const m = {
                t: 'glob',
                o: o.toArray().map((q) => +q.toFixed(2)),
                v: v.toArray().map((q) => +q.toFixed(2)),
                k: e.type,
              };
              spit(m.o, m.v, m.k);
              send('all', m);
              logEvent('spit', { d: Math.round(d), by: e.type, at: nameOf(q) });
            }
            break;
          }
          if (
            sp &&
            !tgGone &&
            d > sp.near &&
            d < sp.far &&
            !(e.spitAt > t) &&
            !(spitAt.get(tg) > t) &&
            !(tg === player && (held.t > 0 || held.slow > 0)) &&
            !wallAhead(e.x, e.z, tx, tz, 0.3, d - 0.5) &&
            clearShot(e, tg)
          ) {
            e.spitW = sp.tele;
            e.spitTg = tg;
            e.spitAt = t + sp.tele + sp.every;
            spitAt.set(tg, t + sp.tele + SPIT_GAP);
            sfx('hiss', e);
            face = true;
            break;
          }
          const aim = st.shoot && d > reach && d < st.shoot * PX; // shooters and heavies fire from range
          const turn = !striking.has(tg) && !(strikeCD.get(tg) > 0) && !tgGone;
          // slice 12: a wall or a shut gate in the way: an enemy at a fort (3 or more pieces) always breaks in; at a lone
          // wall it does sometimes (IW1), and otherwise goes round, unless it is still stuck at it after 3 s
          const blk = aim ? null : wallAhead(e.x, e.z, tx, tz, 0.4 * st.scale, Math.min(d - 0.3, 1.4 + 0.6 * st.scale));
          if (blk) {
            if (e.rollFor !== blk) {
              e.rollFor = blk;
              e.rollSiege = fortSize(blk) >= 3 || rng() < 0.35;
              e.blkT = 0;
            }
            e.blkT += dt;
            if (e.rollSiege || e.blkT > 3) {
              e.state = 'siege';
              e.wall = blk;
              e.sT = 0.35;
              logEvent('siege', { enemy: e.type, key: blk.key });
              break;
            }
          }
          // slice 26: at night an animal that fears fire will not close on someone by a torch or a fire: it circles at 4.5 m, snarling
          if (NK > 0.3 && FEARS_FIRE.has(e.type) && d < 6 && byFlame(tg)) {
            const k = (d - 4.5) * 0.6;
            mx = -tz * e.circle + tx * k;
            mz = tx * e.circle + tz * k;
            spd *= 0.55;
            face = true;
            break;
          }
          if (climber(e) && !aim && (high || e.cl) && host) {
            if (e.clT > 0) e.clT -= dt;
            const w = climbStep(e, tg, ty0, dt, spd);
            if (w === true) break;
            if (w) {
              mx = w.mx;
              mz = w.mz;
              break;
            }
          }
          if (high && !aim && d < 7) {
            const k = (d - 5) * 0.5;
            mx = -tz * e.circle + tx * k;
            mz = tx * e.circle + tz * k;
            spd *= 0.5;
            face = true;
            break;
          } // out of reach above: back off to 5 m and circle, waiting
          if (((d <= reachUp && up && !blk) || aim) && turn) {
            e.state = 'windup';
            e.wT = aim ? 0.5 : e.type === 'bear' ? 0.6 : e.type === 'bog_lurker' ? 0.45 : 0.32;
            e.tg = tg;
            striking.add(tg);
            strikeCD.set(tg, e.wT + 0.45);
            an.attack();
            if (rng() < 0.4) sfx(e.type, e, 0.7);
            face = true;
            break;
          }
          if (!turn && (d < 5.5 || aim)) {
            // someone else's turn: circle at a few metres (shooters sidestep) and wait for an opening
            const k = d < 5.5 ? (d - 3.6) * 0.5 : 0;
            mx = -tz * e.circle + tx * k;
            mz = tx * e.circle + tz * k;
            spd *= 0.55;
            face = true;
            break;
          }
          // flanking: pack members curve out to their own side and close from different angles
          const f = e.size > 1 ? e.flank * Math.min(1, Math.max(0, (d - 2.5) / 7)) : 0,
            c = Math.cos(f),
            s = Math.sin(f);
          mx = tx * c - tz * s;
          mz = tz * c + tx * s;
          spd *= CHASE[e.type] || 1;
          e.voiceT -= dt;
          if (e.voiceT <= 0) {
            e.voiceT = 3 + rng() * 4;
            sfx(e.type, e, 0.6);
          }
          break;
        }
        // slice 12: at the wall in its way: up to it, then a blow every 1.4 s for 0.7 of its damage (IW1) until it falls or
        // the way is clear again
        case 'siege': {
          const w = e.wall;
          if (!w || !(w.hp > 0) || !built.includes(w) || tgGone) {
            e.state = 'chase';
            break;
          }
          let cd = 1e9,
            cx = 0,
            cz = 0;
          for (const c of w.cols) {
            const q = Math.hypot(c.x - e.x, c.z - e.z) - c.r;
            if (q < cd) {
              cd = q;
              cx = c.x;
              cz = c.z;
            }
          }
          const wl = Math.hypot(cx - e.x, cz - e.z) || 1;
          e.wfx = (cx - e.x) / wl;
          e.wfz = (cz - e.z) / wl;
          if (cd > 0.25 + st.scale * 0.35) {
            mx = e.wfx;
            mz = e.wfz;
            spd *= 0.8;
          } else if ((e.sT -= dt) <= 0) {
            e.sT = 1.4 - 0.5 * nb;
            an.attack();
            if (rng() < 0.5) sfx(e.type, e, 0.6);
            damageBuilt(w, bite * 0.7, e); /* (IW1: a blow every 0.9 s at night) */
            if (!wallAhead(e.x, e.z, tx, tz, 0.4 * st.scale, Math.min(d, 2.6))) e.state = 'chase';
          }
          break;
        }
      }
    else if (e.state === 'siege' && (e.sT = (e.sT ?? 0) - dt) <= 0) {
      e.sT = 1.4;
      an.attack();
    } // a joined game shows the host's enemies at walls
    else if (e.state === 'chase' && (e.voiceT -= dt) <= 0) {
      e.voiceT = 3 + rng() * 4;
      sfx(e.type, e, 0.6);
    } // a joined game voices the host's hunters too
    if (e.stag > 0) mx = mz = 0;
    // round 4 (gilded-hollow-29: a rat and a dust hound hunted Jared from inside a ruins house for minutes, the rat boxed in a
    // corner by the walls and the table): a way found round (below) is followed, a waypoint at a time, for up to 8 s, and dropped
    // once the quarry is 4 m off where it was found (a wolf galloping round a player 40 m off kept to a stale way, its head turned 64
    // degrees off its heading against 55.6 without the way round: the head check's 60); a new way may then be looked for at once (a
    // hound shut in a house hunting a running player, the review), and one that scrambles free (below) drops its way
    if (host && e.path) {
      let q = e.path.at(-1);
      if (Math.hypot(q[0] - e.x, q[1] - e.z) < 0.4) {
        e.path.pop();
        q = e.path.at(-1);
      }
      if (
        !q ||
        e.state !== 'chase' ||
        (e.pathT -= dt) <= 0 ||
        (Math.hypot(tg.x - e.pathTo[0], tg.z - e.pathTo[1]) > 4 && (e.sinceWay = 3))
      )
        e.path = null;
      else if (!e.stag) {
        const l = Math.hypot(q[0] - e.x, q[1] - e.z) || 1;
        mx = (q[0] - e.x) / l;
        mz = (q[1] - e.z) / l;
        e.detT = 0;
      }
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    const mx0 = mx,
      mz0 = mz;
    if (e.detT > 0) {
      e.detT -= dt;
      const c = Math.cos(e.det),
        s = Math.sin(e.det);
      [mx, mz] = [mx * c - mz * s, mz * c + mx * s];
    } // going round
    e.vx *= Math.exp(-dt * 6);
    e.vz *= Math.exp(-dt * 6);
    if (climber(e) && e.y == null && slopeAt(e.x, e.z) > 1.0) spd *= CLIMB_K; // (up a cliff: slower than a run)
    const ex = e.x,
      ez = e.z;
    if (!e.cl || e.cl.ph === 'go') {
      e.x += (mx * spd + e.vx) * dt;
      e.z += (mz * spd + e.vz) * dt;
    }
    if (host && !(e.cl && e.cl.ph !== 'go')) {
      if (e.y == null) creatureCollide(e, 0.45 * st.scale);
      else collide(e, 0.45 * st.scale, e.y);
    } // (up on something: its own feet)
    // too steep or too deep: slide along it one axis at a time, as the player does; still pinned while meaning to move for
    // a third of a second, turn off to one side for a second or two (the other side if that pins too). His log, 2026-11-03:
    // hunting wolves and hounds held one distance for 5 to 10 s at the foot of slopes they could not climb
    const bad = (x, z) =>
      (!climber(e) && slopeAt(x, z) > (hunting ? 1.4 : 1.0) && groundY(x, z) > groundY(ex, ez)) ||
      (groundY(x, z) < WATER_Y - 0.8 && groundY(x, z) < groundY(ex, ez) && e.type !== 'bog_lurker'); // (deeper only: an ice crawler already in deep water froze there, every step undone, silent-marsh-90)
    if (host && e.y == null && bad(e.x, e.z)) {
      if (!bad(e.x, ez)) e.z = ez;
      else if (!bad(ex, e.z)) e.x = ex;
      else {
        e.x = ex;
        e.z = ez;
      }
      e.wander = 0;
    }
    const want = Math.hypot(mx, mz) * spd * dt;
    e.pin = host && want > 1e-3 && Math.hypot(e.x - ex, e.z - ez) < want * 0.3 ? (e.pin || 0) + dt : 0;
    // pinned: try headings further and further off to one side, then the other, for the first whose next 1 and 2.5 m are
    // neither too steep nor too deep nor solid (a single fixed turn left a wolf in a cliff's notch for 8 s, 2026-11-04); a
    // heading that pinned it again is not tried twice in a row
    if (e.pin > 0.35 && host && climber(e) && e.state === 'chase' && !e.cl && e.y == null) {
      const c = overSpot(e, mx0, mz0);
      if (c) {
        e.cl = c;
        e.pin = 0;
      }
    } // (a spider climbs what pins it)
    // pinned while hunting: find the way round on a 0.5 m grid before trying headings to one side (at most once in 3 s)
    e.sinceWay = (e.sinceWay ?? 9) + dt;
    if (e.pin > 0.35) {
      if (
        e.sinceWay > 3 &&
        ((e.sinceWay = 0), true) &&
        e.state === 'chase' &&
        !tgGone &&
        !e.path &&
        (e.path = wayRound(e.x, e.z, tg.x, tg.z, 0.45 * st.scale, bad))
      ) {
        e.pathT = 8;
        e.pathTo = [tg.x, tg.z];
        e.pin = 0;
      }
    }
    if (e.pin > 0.35) {
      const side = e.detT > 0 ? -Math.sign(e.det) : rng() < 0.5 ? 1 : -1,
        L = Math.hypot(mx0, mz0) || 1,
        r = 0.45 * st.scale,
        failed = e.detT > 0 ? e.det : null;
      const clear = (a) => {
        if (a === failed) return false;
        const c = Math.cos(a),
          s = Math.sin(a),
          hx = (mx0 * c - mz0 * s) / L,
          hz = (mz0 * c + mx0 * s) / L;
        return [0.3, 1, 2.5].every((k) => {
          const x = e.x + hx * k,
            z = e.z + hz * k;
          return (
            !bad(x, z) && !nearColliders(x, z).some((q) => q.r && Math.hypot(q.x - x, q.z - z) < colR(q, x, z) + r)
          );
        });
      };
      e.det = side * Math.PI;
      for (const a of [0.8, 1.35, 1.9, 2.5]) {
        if (clear(a * side)) {
          e.det = a * side;
          break;
        }
        if (clear(-a * side)) {
          e.det = -a * side;
          break;
        }
      }
      e.detT = 1.2 + rng() * 1.2;
      e.pin = 0;
    }
    // the play logs of 2026-11-15: a hunting wolf in water just too deep for it, a hound in a crack in a dune and an ice crawler in
    // a pocket among rocks went nowhere for 5 to 14 s (every step undone, every turn off blocked). One that has gone nowhere for
    // 1.5 s while meaning to move scrambles out to the nearest open ground 2 to 5 m off (on the side of its quarry), over half a second
    if (host && e.y == null && !e.cl) {
      const a = (e.prog ||= { x: e.x, z: e.z, t: 0 });
      if (e.scr) {
        const k = Math.min(1, dt / Math.max(dt, e.scr.t));
        e.x += (e.scr.x - e.x) * k;
        e.z += (e.scr.z - e.z) * k;
        e.pin = 0;
        if ((e.scr.t -= dt) <= 0) e.scr = null;
      }
      if (want <= 1e-3 || e.scr || Math.hypot(e.x - a.x, e.z - a.z) > 0.6) {
        a.x = e.x;
        a.z = e.z;
        a.t = 0;
      } else if ((a.t += dt) > 1.5) {
        a.t = 0;
        const o = openNear(e, 0.45 * st.scale, tg);
        if (o) {
          e.scr = { x: o.x, z: o.z, t: 0.5 };
          e.path = null;
        }
      }
    }
    const ty = joining()
      ? (e.nyaw ?? e.yaw)
      : e.state === 'siege' && e.wfx != null
        ? Math.atan2(-e.wfx, -e.wfz)
        : face
          ? Math.atan2(-tx, -tz)
          : mx || mz
            ? Math.atan2(-mx, -mz)
            : e.yaw;
    let dd = ty - e.yaw;
    dd = Math.atan2(Math.sin(dd), Math.cos(dd));
    e.yaw += dd * Math.min(1, dt * 8);
    if (host && e.y != null && (!e.cl || e.cl.ph === 'go')) {
      const u = standAt(e.x, e.z, e.y + 0.35),
        g = groundY(e.x, e.z); // up on something: its feet go with what it stands on; off the edge, it drops
      if (u >= e.y - 0.4 && u > g + 0.3) {
        e.y = u;
        e.fallV = 0;
      } else {
        e.fallV = (e.fallV || 0) + 18 * dt;
        e.y -= e.fallV * dt;
        if (e.y <= Math.max(g, u)) {
          e.y = null;
          e.fallV = 0;
        }
      }
    }
    if (!e.cl && e.cs) e.cs = 0;
    const g0 = groundY(e.x, e.z),
      fo = floorAt(e.x, e.z, g0) - g0;
    e.fo = e.fo == null ? fo : e.fo + (fo - e.fo) * Math.min(1, dt * 10); // (onto a house floor or deck eased, not snapped: the quality pass)
    const gy = g0 + e.fo,
      sink = e.state === 'lurk' ? 0.85 : e.state === 'emerge' ? 0.85 * Math.max(0, e.emT / 0.8) : 0;
    if (e.state === 'emerge' && e.emT > 0.7) {
      const at = new THREE.Vector3(e.x, Math.max(gy, WATER_Y), e.z);
      if (gy < WATER_Y + 0.2) {
        splash(at);
        sfx('splash', e);
      } else dustPuff(at, 14);
      e.emT = 0.7;
    }
    e.mesh.position.set(e.x, e.y ?? Math.max(gy, WATER_Y - 0.55 * st.scale) - sink * st.scale + (e.dropH || 0), e.z);
    e.mesh.rotation.y = e.yaw;
    if (climber(e)) {
      const want = host ? (e.cl && e.cl.ph === 'up' ? 1 : e.cl && e.cl.ph === 'over' ? 1 - e.cl.k : 0) : e.ckW || 0;
      e.ck = (e.ck || 0) + (want - (e.ck || 0)) * Math.min(1, dt * 8);
      e.mesh.rotation.order = 'YXZ';
      e.mesh.rotation.x = (e.ck * Math.PI) / 2;
    } // (on a wall: tipped up, belly to it) // (dropH: a spider on its thread, slice 22)
    e.mesh.visible = e.state !== 'lurk' || d < 4;
    // slice 19: built creatures plant their feet on the ground and turn their heads to the one they hunt
    const eyes =
      !tgGone && ['chase', 'windup', 'recover', 'emerge', 'siege'].includes(e.state)
        ? (e.lookV ||= new THREE.Vector3()).set(tg.x, groundY(tg.x, tg.z) + 1.3, tg.z)
        : null;
    if (d < 80)
      an.update(dt, {
        speed: joining() ? e.spd || 0 : Math.hypot(e.x - ex, e.z - ez) / Math.max(dt, 1e-3),
        scale: st.scale,
        ground: e.y != null ? () => e.y : e.fo > 0.01 ? FLOOR : groundY,
        look: eyes,
        climb: e.ck || 0,
        cs: e.cs || (e.ck > 0.5 ? 2 : 0),
      }); // (on a house's floor, its feet too: the quality pass found wolves walking with only their heads above the boards)
  }
  // keep awake enemies from stacking on one another
  for (let i = 0; i < awake.length; i++)
    for (let j = i + 1; j < awake.length; j++) {
      const a = awake[i],
        b = awake[j];
      if (a.state === 'lurk' || b.state === 'lurk') continue;
      const r = 0.45 * (a.mesh.scale.x + b.mesh.scale.x),
        dx = b.x - a.x,
        dz = b.z - a.z,
        d = Math.hypot(dx, dz);
      if (d < r && d > 1e-4) {
        const push = (r - d) / 2 / d;
        a.x -= dx * push;
        a.z -= dz * push;
        b.x += dx * push;
        b.z += dz * push;
      }
    }
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].gone) enemies.splice(i, 1);
  tickSpiders(dt, {
    scene,
    enemies,
    players: everyone().filter((q) => !gone(q)),
    host: !joining(),
    spawn: spawnEnemy,
    log,
    logEvent,
    t,
    me: running ? player : null,
    easy: level() === LEVELS.easy,
  }); // slice 22: webs, nests, the drop at night
  // the land round the player stays alive: spawns follow them (the cap counts only animals within 150 m), far idle ones are cleared
  // (co-op: round every player; the host's game spawns for all)
  if (!joining() && Math.floor(t) % 4 === 0 && Math.floor(t) !== spawnTick) {
    spawnTick = Math.floor(t);
    const P = everyone();
    if (NK > 0.6)
      for (const q of P) {
        if (q.howlAt > t || gone(q) || Math.hypot(q.x, q.z) < SAFE_R) continue; // (never in the safe valley)
        const w = enemies.find(
          (e) =>
            e.type === 'wolf' &&
            !e.dead &&
            e.state === 'idle' &&
            Math.hypot(e.x - q.x, e.z - q.z) > 50 &&
            Math.hypot(e.x - q.x, e.z - q.z) < 160,
        );
        if (w) {
          q.howlAt = t + 30 + rng() * 45;
          wolfSay('howl', w);
        }
      }
    for (const e of enemies)
      if (!e.home && !e.posed && e.state === 'idle' && P.every((q) => Math.hypot(e.x - q.x, e.z - q.z) > 320)) {
        dropFrom(e);
        scene.remove(e.mesh);
        e.mesh.userData.dispose?.();
        e.gone = true;
      }
    for (const q of P)
      if (
        enemies.filter((e) => !e.dead && !e.home && Math.hypot(e.x - q.x, e.z - q.z) < 150).length <
        20 + Math.round(12 * NK)
      )
        spawnAround(q.x, q.z, 4 + Math.round(3 * NK), 50, 105); // (busier at night: slice 13; slice 21 raised the cap from 12 + 6)
    for (const k of PASSES) {
      const o = outside(k);
      if (P.some((q) => Math.hypot(q.x - o.x, q.z - o.z) < 200) && around(o, 35) < PASS_OUT - 1)
        spawnAround(o.x, o.z, 2, 0, 20);
    }
    for (const q of P) {
      if (gone(q) || q.away) continue; // (away: a hidden window; no pack is sent at a player who is not there) issue #44: the hunting trickle (sendHunt); the clock waits in the valley, and starts afresh on a teleport or a respawn
      if (q.huntedAt == null || Math.hypot(q.x, q.z) < SAFE_R) {
        q.huntedAt = t;
        q.huntWait = HUNT_WAIT(NK);
        continue;
      }
      if (t - q.huntedAt >= q.huntWait) {
        q.huntedAt = t;
        q.huntWait = HUNT_WAIT(NK);
        sendHunt(q, t, NK);
      }
    }
  }
}

export { spitAt, strikeCD, outside, sendHunt, alertPack, HUNT_WAIT, HEATERS };
