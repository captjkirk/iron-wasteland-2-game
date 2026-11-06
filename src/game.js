// Gameplay from the prototype: player, enemies, loot, input (keyboard, mouse, gamepads), the three cameras and the HUD.
import * as THREE from 'three';
import { QUALITY_KEY, PX, params, HALF, WATER_Y, WAKE_RADIUS, CHARS, ENEMY, BIOME, SAFE_R } from './config.js';
import { campfire } from './camp.js';
import { caches, raiderCamps, ladderAt } from './buildings.js';
import { tickDeep, resetDeep } from './water.js';
import { day, tickDay, resetDay, nightK, isNight, phase } from './daynight.js';
const DEEP_BITE = 20; // the lake serpent's bite (slice 13: 15 before, from the shadow)
import { rng } from './noise.js';
import { groundY, biomeAt, slopeAt } from './world.js';
import { nearColliders, colR, placed, hideOccluders, addCollider, standAt, steps, STEP } from './props.js';
import { markDirty } from './scatter.js';
import { part, box, rockG, MAT, merged } from './models.js';
import { buildCreature } from './creatures.js';
import { initEffects, tickEffects, hitBurst, splash, dustPuff, floatText, healthBars, hitMarker, buildLoot, nameTags } from './effects.js';
import { unlockAudio, toggleMute, isMuted, sfx, setListener, windLevel, ambient } from './audio.js';
import { W } from './weather.js';
const BIOME_WIND = { tundra: 0.03, waste: 0.025, desert: 0.02 };
import { buildCharacter, buildViewModel } from './characters.js';
import { logEvent, tickLog, savePlayLog, startVideo } from './playlog.js';
import { others, coop, joining, gone, nearestP, everyone, hurt, salvagedProp, requestJoin, tickCoop, followHost, net, send, clearOthers } from './coop.js';
import { craftOpen, toggleCraft, craftKey, craftPad, renderMenu, bedNear, sleep, wake, tickSleep, bedRespawn, fireSpots, benchNear } from './craft.js';
import { tickHarvest, harvestTarget, harvestName, prepHarvest } from './harvest.js';
import { quiver, useArrow, stick, dropFrom, tickArrows, clearArrows } from './arrows.js';
import { building, buildKey, buildPad, placeNow, endBuild, rotateBuild, tickBuild, tickTear, tearTarget, pieceName, refundOf, gateNear, toggleGate, wallAhead, fortSize, damageBuilt, pieceBars } from './build.js';
import { built } from './craft.js';
import { attachGear, eatPose } from './characters.js';
import { ammo, resetSupplies, tickSupplies, fought, useRound, useFlower, reload, addRounds, clipSize, foodCount, fireNear, HEAL, MAX_ROUNDS } from './supplies.js';

let scene, camera, renderer, env, viewModel;
const muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })); muzzleFlash.t = 0;
export function initGame(ctx) { ({ scene, camera, renderer, env } = ctx); viewModel = new THREE.Group(); camera.add(viewModel); muzzleFlash.position.set(0.24, 0.03, -0.85); muzzleFlash.visible = false; camera.add(muzzleFlash); initEffects(scene, camera); bindInput(); buildMenu(); bindSettings(); prepHarvest(); }

export const enemies = [];
let packN = 0, enemyN = 0;
export function spawnEnemy(x, z, type, pack = ++packN, slot = 0, size = 1) {
  const st = ENEMY[type], mesh = buildCreature(type); mesh.scale.setScalar(st.scale); mesh.position.set(x, groundY(x, z), z); scene.add(mesh);
  mesh.add(...threatMarks(type));
  const lurk = type === 'bog_lurker';
  enemies.push({ id: ++enemyN, type, mesh, x, z, hp: st.hp, maxHp: st.hp, vx: 0, vz: 0, yaw: rng() * 6.28, state: lurk ? 'lurk' : 'idle', wander: 0, atkT: 0, stag: 0, flashT: 0, dead: 0,
    pack, slot, size, flank: (slot - (size - 1) / 2) * 0.85, circle: rng() < 0.5 ? 1 : -1, voiceT: 2 + rng() * 4, barT: 0, emT: 0, wT: 0, rT: 0 });
}
// Under every creature: a soft dark contact blob (it grounds them and lifts them off bright ground at range), and a
// red threat ring that shows while it hunts you and flares during a wind-up, so a pack at 20 m is easy to pick out.
let MARKS = null;
function threatMarks(type) {
  if (!MARKS) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    MARKS = { blob: new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      ring: new THREE.RingGeometry(0.78, 0.92, 40).rotateX(-Math.PI / 2), disc: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2) }; }
  const len = { wolf: 1.9, dust_hound: 1.7, bear: 2.2, rat: 1.6, ice_crawler: 1.9, bog_lurker: 1.8 }[type] || 1.8;
  const blob = new THREE.Mesh(MARKS.disc, MARKS.blob); blob.scale.set(len * 0.62, 1, len); blob.position.y = 0.04; blob.name = 'blob';
  const ring = new THREE.Mesh(MARKS.ring, new THREE.MeshBasicMaterial({ color: 0xff3a22, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.scale.setScalar(len * 0.62); ring.position.y = 0.06; ring.visible = false; ring.name = 'threat'; return [blob, ring];
}
function spawnAround(cx, cz, count, minD = 25, maxD = 90) {
  let made = 0, tries = 0;
  while (made < count && tries++ < count * 20) { const a = rng() * 6.28, d = minD + rng() * (maxD - minD), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (Math.abs(x) > HALF - 60 || Math.abs(z) > HALF - 60 || Math.hypot(x, z) < SAFE_R + 12) continue; /* nothing spawns in the safe valley */ if (groundY(x, z) < (biomeAt(x, z) === 'swamp' ? WATER_Y - 0.4 : WATER_Y + 0.4) || slopeAt(x, z) > 0.7) continue;
    const list = BIOME[biomeAt(x, z)].enemies; const type = list[Math.floor(rng() * list.length)];
    // wolves and hounds run in packs of 2 to 4, rats in twos and threes
    const pack = (type === 'wolf' || type === 'dust_hound' ? 2 + Math.floor(rng() * 3) : type === 'rat' ? 1 + Math.floor(rng() * 3) : 1) + (isNight() && type !== 'bear' ? 1 : 0), id = ++packN; // (slice 13: a pack runs one bigger at night)
    for (let k = 0; k < pack; k++) spawnEnemy(x + (rng() - 0.5) * 5, z + (rng() - 0.5) * 5, type, id, k, pack); made += pack; }
}
function alertPack(e) { for (const o of enemies) if (o.pack === e.pack && !o.dead && (o.state === 'idle' || o.state === 'lurk')) {
  if (o.state === 'lurk') { o.state = 'emerge'; o.emT = 0.8; } else o.state = 'chase'; }
  sfx(e.type, e); }

// ── Pickups and projectiles ─────────────────────────────────────────────
export const pickups = []; const shots = []; let lootN = 0;
export function dropLoot(x, z, kind) { const a = rng() * 6.28, s = 1 + rng() * 1.5, v = [Math.cos(a) * s, 3.5 + rng() * 1.5, Math.sin(a) * s], id = ++lootN;
  addPickup(id, kind, x, z, false, v); send('all', { t: 'loot', id, kind, x: +x.toFixed(2), z: +z.toFixed(2), v: v.map(q => +q.toFixed(2)) }); }
// a pickup on the ground (co-op: the host's; a joined game draws the ones the host tells it of, landed when it joins late)
export function addPickup(id, kind, x, z, landed, v = [0, 0, 0]) { const m = buildLoot(kind); m.position.set(x, groundY(x, z) + (landed ? 0.35 : 0.6), z); scene.add(m);
  pickups.push({ id, kind, mesh: m, t: rng() * 6, vx: v[0], vy: v[1], vz: v[2], landed, age: 0 }); }
const PROJ = {};
function projMesh(kind) {
  if (!PROJ.gun) { const glow = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.9, 5).rotateX(Math.PI / 2), tracerMat = glow(0xffe0a0); // shared: raiders fire often
    PROJ.gun = () => new THREE.Mesh(tracerGeo, tracerMat);
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.6 }), steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 1, roughness: 0.35 }), feather = new THREE.MeshStandardMaterial({ color: 0xa8482e, roughness: 0.85, side: THREE.DoubleSide }); // red fletching: a spent arrow is found in the grass
    PROJ.ranger = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.75, 6).rotateX(Math.PI / 2), wood));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 4).rotateX(Math.PI / 2), steel); tip.position.z = 0.4; g.add(tip); // the tip leads: lookAt turns +Z along the flight
      for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.13), feather); f.position.z = -0.32; f.rotation.set(Math.PI / 2, k * 2.09, 0); f.position.x = Math.cos(k * 2.09) * 0.024; f.position.y = Math.sin(k * 2.09) * 0.024; g.add(f); } g.userData.arrow = true; return g; };
    const petal = new THREE.MeshStandardMaterial({ color: 0xff7ab0, roughness: 0.6 }), petal2 = new THREE.MeshStandardMaterial({ color: 0xfff0f4, roughness: 0.6 }), stem = new THREE.MeshStandardMaterial({ color: 0x4a7a32, roughness: 0.7 });
    PROJ.charmer = () => { const g = new THREE.Group(); for (let k = 0; k < 5; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), k % 2 ? petal2 : petal); b.position.set(Math.cos(k * 1.3) * 0.05, Math.sin(k * 1.3) * 0.05, -0.05); g.add(b); }
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.2, 5).rotateX(Math.PI / 2), stem)); g.children.at(-1).position.z = 0.08; return g; }; }
  if (!PROJ.shield) { const paint = new THREE.MeshStandardMaterial({ color: 0x4a6d8c, metalness: 0.3, roughness: 0.5 }), rim = new THREE.MeshStandardMaterial({ color: 0xb8b0a0, metalness: 1, roughness: 0.35 });
    // (tilted on its line of flight, so it reads as a thrown shield and not a plate floating flat: round 2 of slice 12)
    PROJ.shield = () => { const g = new THREE.Group(), h = new THREE.Group(); h.add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 22), paint), new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.025, 6, 26).rotateX(Math.PI / 2), rim)); const boss = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 6), rim); boss.position.y = 0.04; h.add(boss); h.rotation.z = 0.6; g.add(h); return g; };
    const nail = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 1, roughness: 0.3 }), streak = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    PROJ.nail = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.13, 5).rotateX(Math.PI / 2), nail)); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.6, 4).rotateX(Math.PI / 2), streak); t.position.z = -0.32; g.add(t); return g; };
    PROJ.ember = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }); }
  return PROJ[kind === 'gunslinger' ? 'gun' : kind]();
}
let auraNext = false;
// each kind of shot: speed (m/s), life (s), gravity, its sound
const SHOT = { gunslinger: [70, 1.4, 0, 'shot'], charmer: [22, 1.4, 9, 'toss'], ranger: [42, 3, 2, 'bow'], shield: [18, 3, 0, 'heavy'], nail: [55, 0.4, 0, 'thunk'] };
export function fireShot(origin, dir, dmg, kind, hostile = false, turret = false, ghost = false) {
  const m = projMesh(kind), [sp, life, grav, snd] = SHOT[kind]; m.position.copy(origin); m.lookAt(origin.clone().add(dir)); scene.add(m);
  const s = { mesh: m, v: dir.clone().multiplyScalar(sp), life, dmg, grav, kind, hostile, ghost, o: origin.clone() }; shots.push(s);
  // slice 12: Abigail's fire arrows (an ember at the tip) and Lauren's charm aura are upgrades; others' games are told
  if (!ghost && !hostile && !turret && kind === 'ranger' && upgraded('ranger')) s.boom = true;
  if (!ghost && kind === 'charmer' && auraNext) s.aura = true; // (the charm flower only, not her bouquet toss)
  if (ghost === 'boom') s.boom = true; if (ghost === 'aura') s.aura = true; if (s.boom) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), PROJ.ember); e.position.z = 0.42; m.add(e); }
  if (!ghost && (hostile || !turret)) send('all', { t: 'shot', o: origin.toArray().map(q => +q.toFixed(2)), d: dir.toArray().map(q => +q.toFixed(3)), k: kind, h: hostile ? 1 : 0, u: s.boom || s.aura ? 1 : 0 });
  sfx(snd, ghost ? { x: origin.x, z: origin.z } : undefined, kind === 'nail' ? 0.7 : 1); // another game's shot sounds from where it is
  if (kind === 'gunslinger' && (hostile || turret || camMode !== 'first')) hitBurst(origin, dir, 'dust', turret ? 8 : 5); // not in the first-person camera's face
  if (kind === 'gunslinger' && !hostile && !turret && !ghost && camMode === 'first') muzzleFlash.t = 0.06;
  return s;
}

// a raider's shot: a tracer from about its gun hand toward the player's chest, wider of the mark the further away
// (slice 12: the same spread rule as the players' shots, on a steadier base wobble of its own)
function enemyShot(e, dmg, tg) { const o = new THREE.Vector3(e.x, e.mesh.position.y + 1.35, e.z), aim = new THREE.Vector3(tg.x, tg.y + 1.2, tg.z), d = o.distanceTo(aim);
  const dir = spreadDir(aim.sub(o).normalize(), 0.1 + spreadAt(d)); o.addScaledVector(dir, 0.6);
  fireShot(o, dir, dmg, 'gunslinger', true).from = e.type; }
// where an arrow struck: in a creature, the point on its flight nearest the body's middle, at body height; otherwise the
// surface between the last clear sample a and the struck one b, found by halving (a trunk's bark is inside its collider)
function struck(s, a, b, stop) { const e = s.inE;
  if (e) { const dir = s.v.clone().normalize(), hit = new THREE.Raycaster(b.clone().addScaledVector(dir, -2.5), dir, 0, 5).intersectObject(e.mesh, true).find(h => h.object.isMesh && h.object.name !== 'blob' && h.object.name !== 'threat' && !h.object.parent?.userData.arrow);
    if (hit) return hit.point.addScaledVector(dir, 0.24); // its body, skinned pose and all: the head well in
    const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((e.x - a.x) * dx + (e.z - a.z) * dz) / L)), q = a.clone().lerp(b, t), y0 = e.mesh.position.y, h = e.mesh.userData.height * ENEMY[e.type].scale;
    q.y = Math.max(y0 + h * 0.3, Math.min(y0 + h * 0.45, q.y)); return q.addScaledVector(dir, 0.2); }
  const inside = (q) => q.y < groundY(q.x, q.z) || (stop && Math.hypot(stop.x - q.x, stop.z - q.z) < colR(stop, q.x, q.z) * (stop.ref && /pine|oak|aspen|tree/.test(stop.ref.type) ? 0.7 : 1));
  const lo = a.clone(), hi = b.clone(), m = new THREE.Vector3(); for (let k = 0; k < 8; k++) { m.copy(lo).add(hi).multiplyScalar(0.5); if (inside(m)) hi.copy(m); else lo.copy(m); } return hi; }
// ── Ranged spread (slice 12; the owner, 2026-11-04: "a bit more spread to where you hit the further away you are from
// your target"): the aim wanders by an angle that is nil out to 8 m and grows with the distance to what the shot is
// aimed at (an enemy near the line of aim, else the ground), so close shots land and long ones can miss. The wander is
// half as much up and down as side to side, so the crosshair still means something.
export const spreadAt = (d) => Math.max(0, Math.min(0.09, (d - 8) * 0.0032));
function aimDist(o, dir) { let best = 1e9;
  for (const e of enemies) { if (e.dead || e.state === 'lurk') continue; const c = enemyCentre(e).sub(o), t = c.dot(dir); if (t > 0 && t < best && c.addScaledVector(dir, -t).length() < 1 + t * 0.04) best = t; }
  if (best < 1e9) return best; const q = new THREE.Vector3(); for (let t = 1; t < 60; t++) { q.copy(o).addScaledVector(dir, t); if (q.y < groundY(q.x, q.z)) return t; } return 60; }
export function spreadDir(dir, a) { if (!(a > 0)) return dir; const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)); if (right.lengthSq() < 1e-6) right.set(1, 0, 0); right.normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize(); return dir.clone().addScaledVector(right, (rng() + rng() - 1) * a).addScaledVector(up, (rng() + rng() - 1) * a * 0.5).normalize(); }
const aimed = (o, dir) => spreadDir(dir, spreadAt(aimDist(o, dir)));
// how close a shot's path this frame came to the point (x, z), in the ground plane
function segD(a, b, x, z) { const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L)); return Math.hypot(a.x + dx * t - x, a.z + dz * t - z); }

// ── Player ────────────────────────────────────────────────────────────
export const player = { ch: null, mesh: null, x: 0, z: 0, y: 0, vy: 0, yaw: 0, pitch: -0.15, hp: 1, onGround: true, atkT: 0, swing: 0, walk: 0,
  inv: { wood: 0, metal: 0, fiber: 0, food: 0 }, up: {}, kills: 0, hurtT: 0, faceYaw: 0, secT: 0, rallyT: 0, fan: 0, fanT: 0, swimY: WATER_Y - 1.25, breath: 1, under: false, mantle: null, climbing: false };
const CAMS = ['first', 'angled', 'top'], CAM_LABEL = { first: 'First person', angled: 'Angled (third person)', top: 'Top-down' };
let camMode = params.get('cam') && CAMS.includes(params.get('cam')) ? params.get('cam') : 'angled', topYaw = 0, running = false, paused = false;

export function startGame(i) {
  if (joining() && !net.host) return requestJoin(i); // walks out when the host welcomes it (coop.js)
  // (the other players are forgotten: each comes back with their next message, standing)
  clearOthers(); const ch = CHARS[i]; player.ch = ch; player.maxHp = ch.maxHp; player.hp = ch.maxHp; player.startT = performance.now(); player.kills = 0; player.inv = { wood: 0, metal: 0, fiber: 0, food: 0 };
  quiver.n = quiver.start; clearArrows(); player.bed = null; player.chop = null; toggleCraft(false); // slice 11: a full quiver, no bed to wake in yet
  player.up = {}; player.tear = null; player.shieldT = 0; endBuild(); resetSupplies(); player.inv.cooked = 0; // slice 12: upgrades are bought again each game; what is built stays in the world
  if (player.mesh) scene.remove(player.mesh); player.mesh = buildCharacter(ch); scene.add(player.mesh);
  viewModel.clear(); viewModel.add(buildViewModel(ch)); player.dead = 0; player.down = 0; player.out = false; player.revT = 0; player.secT = player.rallyT = player.fan = 0; player.blow = false;
  for (const q of turrets) removeTurret(q); turrets.length = 0; strikeCD.clear(); player.knifeT = 0; muzzleFlash.t = 0; for (const q of pulses) q.t = q.T; // a new game starts clean
  player.breath = 1; player.drownT = 0; player.mantle = null; player.fallTop = null; resetDeep(); player.sleep = null; if (!joining()) resetDay(); // (a joined game takes the host's clock)
  // spawn on dry, flat ground at the centre of the safe valley, a few steps from the camp
  for (let r = 0; r < 60; r += 2) { let found = false; for (let a = 0; a < 6.28; a += 0.4) { const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (groundY(x, z) > WATER_Y + 1 && slopeAt(x, z) < 0.3 && !nearColliders(x, z).some(c => Math.hypot(c.x - x, c.z - z) < c.r + 1.5)) { player.x = x; player.z = z; found = true; break; } } if (found) break; }
  player.y = groundY(player.x, player.z);
  for (const e of enemies) scene.remove(e.mesh); enemies.length = 0;
  if (!joining()) { spawnAround(0, 0, 26, SAFE_R + 15, SAFE_R + 230); // out beyond the ring: the valley is safe
  // each raider camp's crew, round its fire; they keep to the camp until they see you
  raiderCamps.forEach((c, i) => c.raiders.forEach((type, k) => { const a = c.a0 + 0.4 + k * 1.9; spawnEnemy(c.x + Math.cos(a) * 3, c.z + Math.sin(a) * 3, type, 9000 + i, k, c.raiders.length); enemies.at(-1).home = c; })); }
  document.getElementById('menu').classList.add('hidden'); for (const id of ['hud-tl', 'hud-tr', 'hud-b']) document.getElementById(id).classList.remove('hidden'); running = true; log(`${ch.player} walks out as ${ch.title}. (F9 saves a play log.)`); setCam(camMode); logEvent('start', { ch: ch.id, cam: camMode }); startVideo(renderer.domElement);
}
export function setCam(m) { camMode = m; snapCam = true; if (running) logEvent('cam', { cam: m }); document.getElementById('cam').textContent = 'Camera: ' + CAM_LABEL[m] + '  (V)';
  document.getElementById('cross').classList.toggle('hidden', m === 'top'); viewModel.visible = m === 'first';
  if (player.mesh) { player.mesh.visible = m !== 'first'; player.mesh.userData.ring.visible = m === 'top'; } if (m === 'top' && document.pointerLockElement) document.exitPointerLock(); }

// ── Input: keyboard and mouse, plus the Gamepad API (Xbox and PlayStation pads on a Mac) ──
function bindInput() {
addEventListener('pointerdown', unlockAudio);
addEventListener('keydown', e => { if (e.code === 'Tab') { e.preventDefault(); if (e.repeat) return; } if (running && !paused && (craftKey(e) || buildKey(e))) return; // the craft menu's keys (slice 11), build mode's (slice 12)
  if (!paused || e.code === 'KeyP' || e.code === 'Escape') keys.add(e.code); unlockAudio(); if (!running) { const n = Number(e.key); if (n >= 1 && n <= 5) selectCard(n - 1); if (e.code === 'Enter') startGame(sel); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'F9') { logEvent('mark', { x: +player.x.toFixed(1), z: +player.z.toFixed(1), y: +player.y.toFixed(1), biome: biomeAt(player.x, player.z) }); savePlayLog(); log('Spot marked and play log saved (a JSON file in your downloads).'); }
  if (e.code === 'KeyM') { log(toggleMute() ? 'Sound off (M).' : 'Sound on (M).'); document.getElementById('snd').checked = !isMuted(); }
  if (paused) return; // (in co-op the world runs on behind the pause screen: no war cry or turret from it)
  if (e.code === 'KeyV') setCam(CAMS[(CAMS.indexOf(camMode) + 1) % 3]);
  if (e.code === 'KeyF' && !e.repeat) secondary();
  if (e.code === 'KeyZ' && !e.repeat && !e.metaKey && !e.ctrlKey && !building()) attack(true); // the Gunslinger's pistol-whip
  if (e.code === 'Tab' && !player.dead && !(player.down > 0)) { toggleCraft(true); keys.clear(); mouseDown = false; }
  if (e.code === 'KeyE' && !e.repeat && camMode !== 'top') interact();
  if (e.code === 'KeyE' && !e.repeat && camMode === 'top') { if (!interact(true) && !harvestTarget(player.x, player.z)) topYaw -= Math.PI / 4; }
  if (e.code === 'KeyQ' && camMode === 'top') topYaw += Math.PI / 4;
  if (e.code === 'KeyR' && !e.repeat && !building()) reload(); });
addEventListener('keyup', e => keys.delete(e.code));
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
renderer.domElement.addEventListener('mousedown', e => { if (!running || craftOpen()) return;
  if (building() && (document.pointerLockElement || camMode === 'top' || lockFailed)) { if (e.button === 2) endBuild(); else if (e.button === 0) placeNow(); return; } // build mode: click places, right click ends
  if (e.button === 2) { if (document.pointerLockElement || camMode === 'top') secondary(); return; } if (camMode !== 'top' && !document.pointerLockElement && !lockFailed) { try { const r = renderer.domElement.requestPointerLock?.(); r?.catch?.(() => lockFailed = true); } catch { lockFailed = true; } return; } if (e.button === 0) mouseDown = true; });
addEventListener('mouseup', () => mouseDown = false);
addEventListener('wheel', e => { if (running && building()) rotateBuild(e.deltaY > 0 ? 1 : -1); }, { passive: true });
addEventListener('mousemove', e => { mouseNDC.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (camMode !== 'top' && (document.pointerLockElement || (e.buttons & 2))) { const k = 0.0024 * settings.sens; player.yaw -= e.movementX * k; player.pitch = Math.max(-1.35, Math.min(1.2, player.pitch - e.movementY * k * (settings.invertY ? -1 : 1))); } });
}
const keys = new Set(); let mouseDown = false, mouseNDC = new THREE.Vector2();
let padPrev = [], lockFailed = false; document.addEventListener('pointerlockerror', () => { lockFailed = true; log('Mouse lock blocked here: right-drag or arrow keys to look.'); });
export function readPad() { const p = [...(navigator.getGamepads?.() || [])].find(Boolean); if (!p) return null;
  const dz = v => Math.abs(v) < 0.15 ? 0 : v, b = i => p.buttons[i]?.pressed, edge = i => b(i) && !padPrev[i];
  const out = { mx: dz(p.axes[0]), mz: dz(p.axes[1]), lx: dz(p.axes[2]), ly: dz(p.axes[3]), atk: b(7) || b(2), jump: edge(0), jumpHeld: b(0), dive: b(10), use: edge(1), useHeld: b(1), sec: edge(4) || edge(6), cam: edge(3), pause: edge(9), left: edge(14), right: edge(15), menu: edge(8), up: edge(12), down: edge(13), downHeld: b(13), rb: edge(5), tearHeld: b(5), close: edge(11) };
  padPrev = p.buttons.map(x => x.pressed); return out; }
export function togglePause(on = !paused) { if (!running) return; paused = on; if (on) { keys.clear(); mouseDown = false; } logEvent(on ? 'pause' : 'resume'); document.getElementById('pause').classList.toggle('hidden', !paused);
  document.getElementById(paused ? 'pause-settings' : 'menu-settings').appendChild(document.getElementById('settings'));
  if (paused && document.pointerLockElement) document.exitPointerLock?.(); }
// Settings (menu and pause screen share one panel): mouse/stick look sensitivity, invert up/down, sound. Quality is in main.js.
export const settings = { sens: 1, invertY: false };
try { const s = JSON.parse(localStorage.getItem('iw2.settings') || '{}'); if (s.sens > 0) settings.sens = s.sens; settings.invertY = !!s.invertY; } catch { /* storage blocked */ }
function saveSettings() { logEvent('settings', { ...settings }); try { localStorage.setItem('iw2.settings', JSON.stringify(settings)); } catch { /* fine */ } }
function bindSettings() {
  const sens = document.getElementById('sens'), sv = document.getElementById('sensv'), inv = document.getElementById('invy'), snd = document.getElementById('snd');
  sens.value = settings.sens; sv.textContent = settings.sens.toFixed(1) + 'x';
  sens.oninput = () => { settings.sens = +sens.value; sv.textContent = settings.sens.toFixed(1) + 'x'; saveSettings(); };
  inv.checked = settings.invertY; inv.onchange = () => { settings.invertY = inv.checked; saveSettings(); };
  snd.checked = !isMuted(); snd.onchange = () => { if (snd.checked === isMuted()) toggleMute(); };
  document.getElementById('resume').onclick = () => togglePause(false);
  document.getElementById('tomenu').onclick = () => location.reload();
  // losing the mouse lock mid-game (Esc) opens the pause screen
  // (in build mode, Esc lets the mouse go and ends building instead: slice 12)
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && running && !paused && camMode !== 'top' && !craftOpen()) { if (building()) endBuild(); else togglePause(true); } });
}

// ── Gameplay ───────────────────────────────────────────────────────────
const logEl = document.getElementById('log'); const lines = [];
function log(s) { lines.push(s); if (lines.length > 5) lines.shift(); logEl.innerHTML = lines.map(l => `<div>${l}</div>`).join(''); }
function aimDir() { // the direction an attack goes
  if (camMode === 'top') { const ray = new THREE.Raycaster(); ray.setFromCamera(mouseNDC, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(player.y + 1.2)), hit = new THREE.Vector3();
    if (padActive || !ray.ray.intersectPlane(plane, hit)) return new THREE.Vector3(-Math.sin(player.faceYaw), 0, -Math.cos(player.faceYaw));
    const d = hit.sub(new THREE.Vector3(player.x, player.y + 1.2, player.z)); d.y = 0; return d.normalize(); }
  const d = new THREE.Vector3(); camera.getWorldDirection(d); return d;
}
// close: the Gunslinger's pistol-whip, a melee blow on its own cooldown (it spends no round and never holds up his shot)
export function attack(close = false) {
  const ch = player.ch, s = close ? ch.close : ch, melee = close || ch.atk === 'melee'; if (!s || player.dead) return; if (player.sleep) return wake('You get up.');
  if (close) { if (player.closeT > 0) return; player.closeT = s.cd; } else { if (player.atkT > 0 || !attackGate()) return; player.atkT = ch.cd; }
  player.swing = 1; player.blow = close;
  const dir = aimDir(); player.faceYaw = Math.atan2(-dir.x, -dir.z); player.mesh.userData.anim.attack(player.moving, close);
  send('all', { t: 'a', d: [+dir.x.toFixed(2), +dir.z.toFixed(2)], r: melee ? s.range : 0, c: close ? 1 : 0 }); // the others see the swing
  const o = new THREE.Vector3(player.x, player.y + (camMode === 'first' ? 1.6 : 1.4), player.z).addScaledVector(dir, 0.6);
  if (melee) { slash(dir, s.range); sfx(ch.id === 'knight' ? 'heavy' : 'swing'); meleeHit(dir, s.range, s.dmg, s.cleave || 1);
    // slice 12's bench upgrades: the Architect's nail gun fires a nail with each swing; the Knight throws his shield (it flies back to him)
    if (ch.id === 'architect' && upgraded('architect')) fireShot(o.clone().addScaledVector(dir, 0.2), aimed(o, dir), 14, 'nail');
    if (ch.id === 'knight' && upgraded('knight') && !(player.shieldT > 0)) { player.shieldT = 2.2; const d2 = dir.clone(); d2.y *= 0.3; d2.normalize();
      fireShot(new THREE.Vector3(player.x, player.y + 1.25, player.z).addScaledVector(d2, 0.9), d2, 28, 'shield').owner = player; const sh = player.mesh.userData.offhand; if (sh) sh.visible = false; } }
  else fireShot(o, aimed(o, dir), ch.dmg, ch.id);
}
// Abigail's bow takes an arrow from the quiver (slice 11); empty, she cannot shoot (her knife still works)
function attackGate() { if (player.ch.id === 'gunslinger') { if (useRound()) return true; player.atkT = 0.3; return false; } /* slice 12: his rounds run out */
  if (player.ch.id !== 'ranger' || useArrow()) return true; player.atkT = 0.6; if (!(player.emptyT > 0)) { player.emptyT = 3; log('Quiver empty: walk over your spent arrows to pick them up, or craft more (Tab).'); sfx('chitin', null, 0.4); } return false; }
// a melee blow lands on the one enemy nearest the aim (the Knight's cleave also catches the next, for half); a miss hits scenery
function meleeHit(dir, range, dmg, cleave = 1) {
  const near = [];
  for (const e of enemies) { if (e.dead) continue; const dx = e.x - player.x, dz = e.z - player.z, d = Math.hypot(dx, dz) || 1e-3, fw = (dx * dir.x + dz * dir.z) / d;
    if (d < range + ENEMY[e.type].scale * 0.6 && fw > 0.25) near.push({ e, n: [dx / d, dz / d], score: d * (1.6 - fw) }); }
  near.sort((a, b) => a.score - b.score).slice(0, cleave).forEach((h, k) => hitEnemy(h.e, k ? Math.round(dmg / 2) : dmg, ...h.n));
  if (near.length) return;
  let best = null, bd = range * 0.8; for (const c of nearColliders(player.x, player.z)) { if (!c.r) continue; const dx = c.x - player.x, dz = c.z - player.z, d = Math.hypot(dx, dz) || 1e-3, edge = d - colR(c, player.x, player.z);
    if (edge < bd && (dx * dir.x + dz * dir.z) / d > 0.5) { bd = edge; best = { c, at: new THREE.Vector3(player.x + dx / d * edge, player.y + 1.1, player.z + dz / d * edge) }; } }
  if (best) hitScenery(best.c, best.at, dir); }
// ── Secondaries (F, right mouse, LB/LT), from IW1: the Knight's war cry, the Architect's auto-turret, Lauren's charm
// flower, Abigail's knife; IW1's Gunslinger secondary is a reload (no ammo here), so he fans the hammer: six fast shots.
export function secondary() {
  const ch = player.ch; if (!running || paused || player.dead) return; if (player.secT > 0) { log(`${ch.sec}: ready in ${Math.ceil(player.secT)} s.`); return; }
  if (ch.id === 'charmer' && !useFlower()) return; // slice 12: each charm flower takes a flower
  player.secT = ch.secCd; const dir = aimDir(); player.faceYaw = Math.atan2(-dir.x, -dir.z); logEvent('secondary', { ch: ch.id });
  if (ch.id === 'knight') { // enemies within 8 m run for 5 s; the Knight moves half again as fast for 5 s
    sfx('rally'); pulse(0xffd25a, 3, 0.8); pulse(0xaaddff, 8, 0.7); player.rallyT = 5; player.mesh.userData.anim.attack(false);
    if (joining()) { send('host', { t: 'cry', x: player.x, z: player.z }); log('War cry!'); } else { const n = scare(player.x, player.z); log(`War cry! ${n ? n + ' flee' + (n === 1 ? 's' : '') : 'Nothing near to scare'}.`); } }
  else if (ch.id === 'architect') { const x = player.x - Math.sin(player.faceYaw) * 1.6, z = player.z - Math.cos(player.faceYaw) * 1.6; deployTurret(x, z, player.faceYaw); send('all', { t: 'tur', x, z, f: player.faceYaw }); log('Turret deployed: 30 s of covering fire.'); }
  else if (ch.id === 'charmer') { const o = new THREE.Vector3(player.x, player.y + 1.4, player.z).addScaledVector(dir, 0.6); auraNext = upgraded('charmer'); fireShot(o, aimed(o, dir), 20, 'charmer'); auraNext = false; Object.assign(shots.at(-1), { charm: true, grav: 3, wide: 0.45 }); shots.at(-1).v.multiplyScalar(1.25); shots.at(-1).mesh.scale.setScalar(2.6); sfx('charm'); player.swing = 1; }
  else if (ch.id === 'ranger') { player.swing = 1; player.knifeT = 0.45; if (player.mesh.userData.knife) player.mesh.userData.knife.visible = true; player.mesh.userData.anim.attack(player.moving); sfx('swing'); const r = 1.9; slash(dir, r); meleeHit(dir, r, 26); }
  else { if (!ammo.clip) { useRound(); player.secT = 0; return; } player.fan = Math.min(upgraded('gunslinger') ? 10 : 6, ammo.clip); player.fanT = 0; } // slice 12: the fan spends rounds from the clip (ten once upgraded: the gate)
}
// ── Slice 12: the five bench upgrades (each game's own: bought in the craft menu at a bench, lost with a new game) ──
export const upgraded = (id) => !!(player.up && player.up[id] && player.ch?.id === id);
export const upBits = () => player.ch && upgraded(player.ch.id) ? 1 << CHARS.indexOf(player.ch) : 0;
// what shows on a character once upgraded: the Architect's nail gun on his left forearm, Lauren's charm aura round her feet
const AURA = new THREE.MeshBasicMaterial({ color: 0xff8ac8, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
export const AURA_R = 4.5;
export function applyUp(root, id, on) { const u = root.userData;
  if (id === 'architect' && on && !u.nailgun) { const steel = new THREE.MeshStandardMaterial({ color: 0x8a8e92, metalness: 0.9, roughness: 0.35 }), paint = new THREE.MeshStandardMaterial({ color: 0x3e5236, roughness: 0.6, metalness: 0.4 }), g = new THREE.Group();
    const put = (geo, m, p) => { const q = new THREE.Mesh(geo, m); q.position.set(...p); q.castShadow = true; g.add(q); };
    put(new THREE.BoxGeometry(0.075, 0.2, 0.09), paint, [0, 0, 0]); put(new THREE.CylinderGeometry(0.018, 0.022, 0.14, 8), steel, [0, 0.16, 0.015]); put(new THREE.BoxGeometry(0.03, 0.17, 0.05), steel, [0, -0.02, 0.07]); put(new THREE.BoxGeometry(0.09, 0.04, 0.1), steel, [0, -0.1, 0]);
    u.nailgun = g; attachGear(root, 'lowerarm_l', g, [-0.075, 0.13, 0.0]); }
  if (id === 'charmer' && on && !u.aura) { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.RingGeometry(AURA_R - 0.18, AURA_R, 64).rotateX(-Math.PI / 2), AURA));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(AURA_R - 0.18, 48).rotateX(-Math.PI / 2), AURA.clone()); fill.material.opacity = 0.08; g.add(fill); g.position.y = 0.22; u.aura = g; root.add(g); } }
export function upgradeFx(id) { pulse(0xffd25a, 3.5, 0.9); pulse(0xffffff, 1.6, 0.5); applyUp(player.mesh, id, true); logEvent('upgrade', { ch: id });
  if (id === 'gunslinger') { const k = Math.min(clipSize() - ammo.clip, ammo.reserve); ammo.clip += k; ammo.reserve -= k; } } // the bigger clip comes loaded from the reserve (the gate of slice 12)
// Abigail's fire arrow bursts where it strikes an enemy: 20 to everything else within 2.5 m (IW1)
const blasts = [];
function blast(p, ghost, skip) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.copy(p); scene.add(m); blasts.push({ m, t: 0 }); hitBurst(p, new THREE.Vector3(0, 1, 0), 'fire', 34); dustPuff(p, 12); sfx('thud', p); sfx('shot', p, 0.5);
  if (Math.hypot(p.x - player.x, p.z - player.z) < 12) player.shake = Math.max(player.shake || 0, 0.15); if (ghost) return 0; let n = 0;
  for (const e of enemies) if (!e.dead && e.state !== 'lurk' && Math.hypot(e.x - p.x, e.z - p.z) < 2.5 && e !== skip) { const d = Math.hypot(e.x - p.x, e.z - p.z) || 1; hitEnemy(e, 20, (e.x - p.x) / d, (e.z - p.z) / d); n++; }
  return n; }
function tickBlasts(dt) { for (let i = blasts.length - 1; i >= 0; i--) { const b = blasts[i]; b.t += dt; b.m.scale.setScalar(0.3 + b.t * 9); b.m.material.opacity = Math.max(0, 0.85 * (1 - b.t / 0.3)); if (b.t > 0.3) { scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); blasts.splice(i, 1); } } }
// Lauren's charm flower, upgraded: it charms every enemy within 4 m of where it lands, with a ring of petals
function charmBurst(p, ghost) { pulse(0xff8ac8, 4, 0.7, p); hitBurst(p, new THREE.Vector3(0, 1, 0), 'petal', 30); if (ghost) return;
  for (const e of enemies) if (!e.dead && e.state !== 'lurk' && e.state !== 'charmed' && Math.hypot(e.x - p.x, e.z - p.z) < 4) charm(e); }
// the war cry: enemies within 8 m of (x, z) run for 5 s (the host's game runs it for every player)
export function scare(x, z) { let n = 0; for (const e of enemies) if (!e.dead && e.state !== 'lurk' && Math.hypot(e.x - x, e.z - z) < 8) { e.state = 'flee'; e.fleeT = 5; n++; } return n; }
function tickSecondary(dt) {
  player.secT = Math.max(0, player.secT - dt); player.rallyT = Math.max(0, player.rallyT - dt);
  muzzleFlash.t -= dt; muzzleFlash.visible = muzzleFlash.t > 0 && camMode === 'first'; if (muzzleFlash.visible) muzzleFlash.scale.set(1.6, 1.6, 3).multiplyScalar(0.8 + Math.random() * 0.5);
  if (player.knifeT > 0 && (player.knifeT -= dt) <= 0 && player.mesh.userData.knife) player.mesh.userData.knife.visible = false;
  if (player.fan > 0 && (player.fanT -= dt) <= 0 && !useRound()) player.fan = 0;
  if (player.fan > 0 && player.fanT <= 0) { player.fanT = 0.09; player.fan--; player.swing = 1; player.blow = false; const d = aimDir(), a = (rng() - 0.5) * 0.22, c = Math.cos(a), s = Math.sin(a);
    const dir = new THREE.Vector3(d.x * c - d.z * s, d.y + (rng() - 0.5) * 0.06, d.z * c + d.x * s).normalize(); fireShot(new THREE.Vector3(player.x, player.y + (camMode === 'first' ? 1.6 : 1.4), player.z).addScaledVector(dir, 0.6), dir, 12, 'gunslinger'); }
  for (let i = turrets.length - 1; i >= 0; i--) { const q = turrets[i]; q.life -= dt; q.fireT -= dt;
    if (q.life <= 0) { removeTurret(q); dustPuff(new THREE.Vector3(q.x, q.y + 0.5, q.z), 12); turrets.splice(i, 1); continue; }
    let tgt = null, bd = 12; for (const e of enemies) { if (e.dead || e.state === 'lurk') continue; const d = Math.hypot(e.x - q.x, e.z - q.z); if (d < bd) { bd = d; tgt = e; } }
    if (!tgt) continue; const aimYaw = Math.atan2(-(tgt.x - q.x), -(tgt.z - q.z)); let dd = aimYaw - q.head.rotation.y; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); q.head.rotation.y += dd * Math.min(1, dt * 10);
    if (q.fireT <= 0 && Math.abs(dd) < 0.3) { q.fireT = 0.8; const o = new THREE.Vector3(q.x, q.y + 1.42, q.z), dir = spreadDir(enemyCentre(tgt).sub(o).normalize(), spreadAt(bd)); o.addScaledVector(dir, 1.2); fireShot(o, dir, 18, 'gunslinger', false, true, q.ghost); q.flash = 0.12; }
    q.muzzle.visible = q.flash > 0; q.light.material.color.setHex(q.flash > 0 ? 0xffe0a0 : 0x6aff8a); q.flash -= dt; } }
// the Knight's thrown shield: out along the throw for about half a second (or until it strikes something), then back to
// the thrower's hand; it hits each enemy once on its way. True when it is home (or lost).
function tickShield(s, dt) { s.t = (s.t || 0) + dt; const p = s.mesh.position, own = s.owner && (s.owner === player || others.has(s.owner.id)) ? s.owner : null; s.mesh.rotateY(dt * 24);
  if (!s.back && s.t > 0.55) s.back = true;
  if (s.back) { if (!own) return true; const to = new THREE.Vector3(own.x, own.y + 1.25, own.z).sub(p), L = to.length();
    if (L < 0.9 || s.t > 4) { if (own === player && player.mesh.userData.offhand) player.mesh.userData.offhand.visible = true; if (L < 0.9) sfx('chitin', own, 0.5); return true; } s.v.copy(to.multiplyScalar(20 / L)); }
  p.addScaledVector(s.v, dt);
  if (!s.back && (p.y < groundY(p.x, p.z) + 0.15 || nearColliders(p.x, p.z).some(c => c.r && !c.gate && Math.hypot(c.x - p.x, c.z - p.z) < colR(c, p.x, p.z) && p.y < (c.top ?? 99)))) { s.back = true; hitBurst(p.clone(), s.v.clone().negate().normalize(), 'stone', 8); sfx('chitin', p, 0.6); }
  for (const e of enemies) { if (e.dead || e.state === 'lurk' || s.hitE?.has(e)) continue; const sc = ENEMY[e.type].scale, y0 = e.mesh.position.y;
    if (Math.hypot(e.x - p.x, e.z - p.z) < 0.55 * sc + 0.45 && p.y > y0 - 0.2 && p.y < y0 + e.mesh.userData.height * sc + 0.4) { (s.hitE ||= new Set()).add(e); const v = s.v.clone().setY(0).normalize();
      if (!s.ghost) hitEnemy(e, s.dmg, v.x * 0.8, v.z * 0.8, p.clone()); else hitBurst(p.clone(), v, 'stone', 8); s.back = true; } }
  return false; }
// an expanding ring on the ground round the player (the war cry)
const pulses = [];
function pulse(color, r, T, at = player) { const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.position.set(at.x, (at === player ? player.y : groundY(at.x, at.z)) + 0.08, at.z); scene.add(m); pulses.push({ m, t: 0, T, r }); }
function tickPulses(dt) { for (let i = pulses.length - 1; i >= 0; i--) { const q = pulses[i]; q.t += dt; const k = q.t / q.T; q.m.scale.setScalar(0.3 + q.r * Math.min(1, k * 1.4)); q.m.material.opacity = 0.8 * Math.max(0, 1 - k);
  if (k >= 1) { scene.remove(q.m); q.m.geometry.dispose(); q.m.material.dispose(); pulses.splice(i, 1); } } }
// the Architect's auto-turret: a painted steel box on a tripod that turns to the nearest enemy within 12 m and fires every 0.8 s for 30 s (IW1: 18 damage)
export const turrets = []; let TUR = null;
// geometry and most materials are shared by every turret (built once); only the status light's material is its own
const removeTurret = (q) => { scene.remove(q.mesh); q.col.r = 0; q.light.material.dispose(); };
const SHAPE = { leg: () => new THREE.CylinderGeometry(0.03, 0.04, 0.95, 6), foot: () => new THREE.BoxGeometry(0.1, 0.03, 0.14), post: () => new THREE.CylinderGeometry(0.08, 0.1, 0.32, 10),
  barrel: () => new THREE.CylinderGeometry(0.04, 0.04, 0.62, 10).rotateX(Math.PI / 2), brake: () => new THREE.CylinderGeometry(0.065, 0.065, 0.12, 10).rotateX(Math.PI / 2), flash: () => new THREE.ConeGeometry(0.12, 0.35, 8).rotateX(-Math.PI / 2),
  light: () => new THREE.SphereGeometry(0.035, 8, 6), body: () => new THREE.BoxGeometry(0.46, 0.3, 0.6), shield: () => new THREE.BoxGeometry(0.62, 0.42, 0.05), drum: () => new THREE.CylinderGeometry(0.13, 0.13, 0.12, 14).rotateZ(Math.PI / 2), sight: () => new THREE.BoxGeometry(0.06, 0.08, 0.22) };
// ghost: another player's turret, seen here (its own game's copy does the damage)
export function deployTurret(x, z, yaw, ghost = false) {
  if (!TUR) TUR = { paint: new THREE.MeshStandardMaterial({ color: 0x3e5236, roughness: 0.6, metalness: 0.5 }), steel: new THREE.MeshStandardMaterial({ color: 0x5a5e62, roughness: 0.4, metalness: 0.9 }) };
  const g = new THREE.Group(), y = groundY(x, z), head = new THREE.Group(); g.position.set(x, y, z);
  const G = TUR.geo || (TUR.geo = {}), M = (geo, mat, p, r = [0, 0, 0]) => { const m = new THREE.Mesh(G[geo] || (G[geo] = SHAPE[geo]()), mat); m.position.set(...p); m.rotation.set(...r); return m; };
  TUR.flash = TUR.flash || new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let k = 0; k < 3; k++) { const a = k * 2.094; g.add(M('leg', TUR.steel, [Math.sin(a) * 0.24, 0.42, Math.cos(a) * 0.24], [-Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5]));
    g.add(M('foot', TUR.steel, [Math.sin(a) * 0.46, 0.015, Math.cos(a) * 0.46], [0, a, 0])); } // splayed legs on feet
  g.add(M('post', TUR.steel, [0, 0.86, 0]));
  const barrel = M('barrel', TUR.steel, [0, 0.03, -0.5]), brake = M('brake', TUR.steel, [0, 0.03, -0.82]);
  const flash = M('flash', TUR.flash, [0, 0.03, -1.05]); flash.visible = false;
  const light = M('light', new THREE.MeshBasicMaterial({ color: 0x6aff8a }), [0.17, 0.2, 0.12]);
  head.add(M('body', TUR.paint, [0, 0, 0]), M('shield', TUR.paint, [0, 0.04, -0.36], [-0.15, 0, 0]), M('drum', TUR.steel, [-0.3, -0.02, 0.05]), M('sight', TUR.steel, [0.1, 0.19, -0.05]), barrel, brake, flash, light); // body, sloped shield plate, ammo drum, sight
  head.position.y = 1.12; head.rotation.y = yaw; g.add(head); g.scale.setScalar(1.25); g.traverse(o => { o.castShadow = o !== flash; }); scene.add(g); sfx('deploy');
  const col = Object.assign(addCollider(x, z, 0.55, null), { vr: 0, top: y + 1.7 }); turrets.push({ mesh: g, head, light, muzzle: flash, x, z, y, life: 30, fireT: 0.4, col, flash: 0, ghost }); }
// a pale arc where a melee swing passes, fading in a quarter second (shows the attack's reach from any camera)
const slashes = [];
export function slash(dir, reach = player.ch.range, at = player) { const r = reach * 0.75, g = new THREE.RingGeometry(r * 0.82, r, 24, 1, -0.9, 1.8).rotateX(-Math.PI / 2).rotateY(Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xfff4dc, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.position.set(at.x, at.y + 1.1, at.z); m.rotation.set(0, Math.atan2(-dir.x, -dir.z), 0.35); scene.add(m); slashes.push({ m, t: 0.25 }); }
function tickSlashes(dt) { for (let i = slashes.length - 1; i >= 0; i--) { const s = slashes[i]; s.t -= dt; s.m.material.opacity = Math.max(0, s.t / 0.25) * 0.75; s.m.rotation.y += dt * 4;
  if (s.t <= 0) { scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); slashes.splice(i, 1); } } }
// hunting animals run down a walking player (IW1's speeds are a wander; at them the player outran every wolf)
const CHASE = { wolf: 2.0, dust_hound: 1.4, bear: 2.2 };
const PUFFK = { wolf: 'fur', dust_hound: 'hound', bear: 'bear', rat: 'rat', ice_crawler: 'ice', bog_lurker: 'mud', brawler: 'dust', shooter: 'dust', heavy: 'dust' };
const LABEL = { wolf: 'Wolf', dust_hound: 'Dust hound', bear: 'Bear', rat: 'Rat', ice_crawler: 'Ice crawler', bog_lurker: 'Bog lurker', brawler: 'Raider', shooter: 'Raider shooter', heavy: 'Raider heavy', 'Thing in the deep': 'the lake serpent', fall: 'Long drop' };
function enemyCentre(e) { const st = ENEMY[e.type]; return new THREE.Vector3(e.x, e.mesh.position.y + e.mesh.userData.height * st.scale * 0.6, e.z); }
export function hitEnemy(e, dmg, nx, nz, at, by = null) {
  if (e.dead) return; const st = ENEMY[e.type], heavy = e.type === 'bear';
  if (!by) fought(false); // (a blow dealt: in a fight, no eating for a few seconds: slice 12)
  if (joining()) { send('host', { t: 'hit', id: e.id, dmg, nx: +nx.toFixed(2), nz: +nz.toFixed(2) }); e.flashT = 0.15; e.barT = 6; e.mesh.userData.anim.hit(1); // the host's game keeps its health
    const p = at || enemyCentre(e); hitBurst(p, new THREE.Vector3(nx, 0, nz), PUFFK[e.type]); floatText(p, String(dmg), dmg >= 20 ? '#ffd27a' : '#fff0d8', dmg >= 20); hitMarker(); sfx(dmg >= 20 ? 'hitHard' : 'hit', e); logEvent('hit', { enemy: e.type, dmg }); return; }
  e.hp -= dmg; e.flashT = 0.15; e.barT = 6; e.stag = heavy ? 0.12 : 0.3; e.vx += nx * (heavy ? 2 : 6); e.vz += nz * (heavy ? 2 : 6);
  if (e.state === 'windup' && !heavy) { e.state = 'recover'; e.rT = 0.4; }
  if (e.state === 'idle' || e.state === 'lurk') alertPack(e); else if (e.state !== 'flee' && e.state !== 'windup' && e.state !== 'recover' && e.state !== 'emerge') e.state = 'chase';
  const side = Math.sign(Math.cos(e.yaw) * nz - Math.sin(e.yaw) * nx) || 1; e.mesh.userData.anim.hit(side);
  const p = at || enemyCentre(e); hitBurst(p, new THREE.Vector3(nx, 0, nz), PUFFK[e.type]); floatText(p, String(dmg), dmg >= 20 ? '#ffd27a' : '#fff0d8', dmg >= 20); if (!by) hitMarker();
  sfx(e.type === 'ice_crawler' ? 'chitin' : dmg >= 20 ? 'hitHard' : 'hit', e);
  if (e.hp <= 0) { e.dead = 5; e.mesh.userData.anim.die(); e.mesh.userData.flash(0); sfx(e.type, e, 0.8); sfx('thud', e, 0.6);
    for (const k of st.loot) if (rng() < 0.75) dropLoot(e.x, e.z, k); if (by) send(by, { t: 'kill', s: `${LABEL[e.type]} down.` }); else { player.kills++; log(`${LABEL[e.type]} down.`); } }
  logEvent('hit', { enemy: e.type, dmg, hp: Math.max(0, e.hp), killed: e.hp <= 0 }); }
// Lauren's flower: the enemy it hits forgets the fight for 4 s and wanders (hitting it again breaks the charm)
export function charm(e) { if (joining()) send('host', { t: 'charm', id: e.id }); else { e.state = 'charmed'; e.chT = 4; e.wander = 0; } hitBurst(enemyCentre(e), new THREE.Vector3(0, 1, 0), 'petal', 18); floatText(enemyCentre(e).setY(e.mesh.position.y + 2.2), 'charmed', '#ff9ad0'); }
// a crate's loot (a raider camp's stays shut while any of its crew lives, as in IW1); false when it is still guarded
const guarded = (cache) => cache.camp && enemies.some(e => e.home === cache.camp && !e.dead);
export function crateOpen(cache, who = null, got = null) {
  if (!got) { if (joining()) { send('host', { t: 'crate', i: caches.indexOf(cache) }); return true; }
    if (guarded(cache)) { if (who) send(who, { t: 'log', s: 'Raiders still guard this crate.' }); else { log('Raiders still guard this crate.'); logEvent('crate-locked'); } return false; }
    if (cache.opened) return true; const k = cache.camp ? 2 : 1; got = { metal: (2 + Math.floor(rng() * 3)) * k, food: (1 + Math.floor(rng() * 2)) * k, fiber: (2 + Math.floor(rng() * 2)) * k };
    cache.open(); send('all', { t: 'crated', i: caches.indexOf(cache) }); if (who) { send(who, { t: 'gotc', got }); return true; } }
  for (const q in got) player.inv[q] += got[q];
  log(`Searched the crate: ${got.metal} metal, ${got.food} food, ${got.fiber} fiber.`); logEvent('crate', { ...got, camp: !!cache?.camp }); sfx('salvage');
  floatText(new THREE.Vector3(player.x, player.y + 2, player.z), `+${got.metal} metal  +${got.fiber} fiber`, '#ffc070'); return true; }
// three hits smash a crate (a full one spills its loot first)
export function smashCrate(cache, at, dir, who = null) { if (cache.broken) return; if (at) { hitBurst(at, dir, 'wood', 14); sfx('hit', null, 0.6); }
  if (joining()) { send('host', { t: 'smash', i: caches.indexOf(cache) }); return; } if (guarded(cache)) return; // the crew's crate holds while they live
  if (--cache.hp > 0) return; crateOpen(cache, who); hitBurst(new THREE.Vector3(cache.x, cache.y + 0.5, cache.z), dir || new THREE.Vector3(0, 1, 0), 'wood', 40); sfx('thud'); cache.smash(); send('all', { t: 'smashed', i: caches.indexOf(cache) }); logEvent('crate-smashed'); if (!who) log('The crate splinters apart.'); }
// what a hit on scenery throws up: splinters off wood, chips off stone and walls, sparks off scrap and wrecks
const PROP_PUFF = { wall: 'wood', gate: 'wood', reinforced_wall: 'stone', pine: 'wood', oak: 'wood', aspen: 'wood', snowpine: 'wood', deadtree: 'wood', swamptree: 'wood', cactus: 'wood', shroom: 'mud', scrap: 'dust', hulk: 'dust' };
function hitScenery(c, at, dir) { if (c.cache) return smashCrate(c.cache, at, dir); const kind = c.ref ? PROP_PUFF[c.ref.type] || 'stone' : 'wood'; // the camp's props are wood
  hitBurst(at, dir, kind, kind === 'dust' ? 18 : 12); sfx(kind === 'dust' ? 'chitin' : 'hit', null, 0.45); }
// E: search a crate, salvage metal from a scrap pile or a wreck, or sleep in a bed (slice 11); holding E chops (harvest.js)
function interact(quiet) {
  // a supply crate first (a raider camp's stays shut while any of its crew lives, as in IW1)
  const cache = caches.find(c => !c.opened && Math.hypot(c.x - player.x, c.z - player.z) < 2.4);
  if (cache) { crateOpen(cache); return true; }
  // (a bed comes before a gate or a fire, as the prompt says: a bed beside a campfire could not be slept in with raw meat
  // in the pack; the review of slice 12)
  const bed = bedNear(player.x, player.z); if (bed) { sleep(bed); return true; }
  const gate = gateNear(player.x, player.z); if (gate) { log(gate.open ? 'You shut the gate.' : 'You hold the gate open: enemies can come through until it is shut.'); toggleGate(gate); return true; } // slice 12
  if (player.inv.food > 0 && fireNear()) return true; // (holding E there cooks: slice 12)
  const near = (placed.scrap || []).concat(placed.hulk || []).find(p => !p.gone && !p.salvaged && Math.hypot(p.x - player.x, p.z - player.z) < (p.type === 'hulk' ? 4 : 2.6));
  if (!near) { if (!quiet && !harvestTarget(player.x, player.z) && ![...others.values()].some(o => o.down > 0)) log('Nothing to search, salvage or chop here.'); return false; }
  const n = near.type === 'hulk' ? 6 : 3; player.inv.metal += n; salvagedProp(near); logEvent('salvage', { what: near.type, n }); log(`Salvaged ${n} metal from the ${near.type === 'hulk' ? 'wreck' : 'scrap'}.`); sfx('salvage'); floatText(new THREE.Vector3(player.x, player.y + 2, player.z), `+${n} metal`, '#ffc070');
  if (near.type === 'scrap') { near.gone = true; markDirty(); near.col.r = 0; near.col.vr = 0; }
  else near.salvaged = true; return true; }
export function hurtPlayer(d, by, from = null) { if (player.dead) return; if (player.sleep) wake('Something is attacking you in your sleep!');
  // slice 12: the Knight's upgraded shield takes 60% of a blow from the front (within 70 degrees of where he faces), while it is on his arm
  if (from && upgraded('knight') && player.mesh.userData.offhand?.visible !== false) { const dx = from.x - player.x, dz = from.z - player.z, L = Math.hypot(dx, dz) || 1;
    if ((-Math.sin(player.faceYaw) * dx - Math.cos(player.faceYaw) * dz) / L > 0.34) { const was = d; d = Math.max(1, Math.round(d * 0.4)); const at = new THREE.Vector3(player.x + dx / L * 0.5, player.y + 1.25, player.z + dz / L * 0.5);
      hitBurst(at, new THREE.Vector3(dx / L, 0.4, dz / L), 'stone', 10); floatText(at.clone().setY(at.y + 0.7), 'BLOCK', '#9ad0ff', true); sfx('chitin', null, 0.8); logEvent('block', { from: was, to: d }); } }
  player.hp -= d; fought(true); logEvent('hurt', { dmg: d, by, hp: Math.max(0, Math.round(player.hp)) }); player.hurtT = 0.35; player.shake = 0.25; sfx('hurt');
  if (player.hp <= 0) { player.hp = 0; player.killedBy = by; logEvent('died', { by, x: +player.x.toFixed(1), z: +player.z.toFixed(1), coop: coop() }); player.mesh.userData.anim.die();
    if (coop()) { player.dead = 1e9; player.down = 15; player.revT = 0; log(`${player.ch.player} is down! A friend can revive you: they stand close and hold E.`); } else { player.dead = 3; log(`${player.ch.player} went down…`); } }
  else player.mesh.userData.anim.hit(); }
// fall damage (the owner, 2026-11-04: "we need fall damage"): a drop of up to 4 m is free (a jump on flat ground is 1.3 m,
// off the ladder's top 7 m), then 10 HP a metre, so 16 m kills the Gunslinger and the Ranger and 24 m the Knight; water breaks any fall
const FALL_SAFE = 4, FALL_HP = 10;
function fallHurt(h, gy) { const d = Math.round((h - FALL_SAFE) * FALL_HP); if (d <= 0 || player.dead) return; // (a body already down takes no more)
  if (WATER_Y - groundY(player.x, player.z) > 0.4 && gy < WATER_Y) { logEvent('fall', { h: +h.toFixed(1), dmg: 0, water: true }); return; }
  logEvent('fall', { h: +h.toFixed(1), dmg: d }); floatText(new THREE.Vector3(player.x, player.y + 2, player.z), `-${d}`, '#ff8a6a', d >= 20); hurtPlayer(d, 'fall'); }
// no bed, no respawn (the owner's ruling, 2026-11-03; IW1 respawns you only at a bed you built): death ends the game
export function gameOver(why = null) { toggleCraft(false); running = false; paused = false; net.host = null; clearOthers(); nameTags([]); const t = Math.round((performance.now() - player.startT) / 1000), by = LABEL[player.killedBy] || 'the wasteland';
  logEvent('game-over', { by: player.killedBy, secs: t, kills: player.kills, ...player.inv });
  if (document.pointerLockElement) document.exitPointerLock(); for (const id of ['hud-tl', 'hud-tr', 'hud-b', 'cross', 'pause', 'breath', 'prompt']) document.getElementById(id).classList.add('hidden');
  document.querySelector('#menu .sub').textContent = why || `${player.ch.player} fell to ${/^[AEIOU]/.test(by) ? 'an' : 'a'} ${by.toLowerCase()} after ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}, with ${player.kills} kills. No bed to wake in: next time build a craftbench, then a bed, and sleep in it (Tab crafts, E sleeps). Pick who walks out next.`;
  document.getElementById('go').textContent = 'WALK OUT AGAIN'; document.getElementById('menu').classList.remove('hidden'); }
// a few passes: pushing out of one circle can push into its neighbour; feet at or above a solid's top pass over it
// (slice 12: a gate lets players through; enemies only while it is held open. Only the player's own move passes feet.)
function collide(o, radius, feet) { for (let pass = 0; pass < 3; pass++) for (const c of nearColliders(o.x, o.z)) { if (!c.r || (feet != null && c.stand != null && steps(c, feet)) || (c.gate && (feet != null || c.gate.open))) continue; const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz), m = colR(c, o.x, o.z) + radius;
  if (d < m && d > 1e-4) { o.x = c.x + dx / d * m; o.z = c.z + dz / d * m; } }
  const lim = HALF - 6; o.x = Math.max(-lim, Math.min(lim, o.x)); o.z = Math.max(-lim, Math.min(lim, o.z)); }

// a roast leg of meat held up to the first-person camera while eating (slice 12)
let MEAT = null; function meat() { if (MEAT) return MEAT; MEAT = new THREE.Group(); const crust = new THREE.MeshStandardMaterial({ color: 0x7a3a1c, roughness: 0.6 }), bone = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.7 });
  // (a drumstick: a glossy roast bulb, a bare bone and its knuckle, big enough to read; round 2 of slice 12)
  crust.roughness = 0.38; const a = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), crust); a.scale.set(1, 0.9, 1.45); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.15, 8).rotateX(Math.PI / 2), bone); b.position.z = 0.17;
  const n1 = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), bone), n2 = n1.clone(); n1.position.set(0.016, 0, 0.25); n2.position.set(-0.016, 0, 0.25); MEAT.add(a, b, n1, n2); MEAT.rotation.set(0.5, 0.6, 0); MEAT.visible = false; camera.add(MEAT); return MEAT; }
let padActive = false; const breathEl = document.getElementById('breath');
export function update(dt, t) {
  const rawPad = readPad(); if (rawPad?.pause) togglePause(); if (paused && !coop()) return; // in co-op the world goes on behind the pause screen
  // the craft menu (slice 11): View on a pad opens and closes it; while it is open the pad drives it, and alone the world waits
  if (rawPad?.menu && !paused && !player.dead && !(player.down > 0)) toggleCraft(); const inMenu = craftOpen(); if (inMenu) { craftPad(rawPad); renderMenu(); if (!coop()) return; }
  // (the press that closed the menu does nothing else; that comment used to sit mid-line here and swallowed the padActive
  // line after it, so the prompts never showed pad buttons: found in slice 12)
  const pad = paused || inMenu ? null : rawPad;
  if (pad && (pad.mx || pad.mz || pad.lx || pad.ly || pad.atk)) padActive = true; if (keys.size || mouseDown) padActive = false;
  // build mode (slice 12): A places, B ends it, RB and the d-pad turn the piece; those presses do nothing else
  if (pad && building()) { buildPad(pad); pad.jump = pad.use = pad.atk = pad.sec = pad.rb = pad.left = pad.right = false; pad.useHeld = pad.tearHeld = false; }
  if (pad?.cam) setCam(CAMS[(CAMS.indexOf(camMode) + 1) % 3]);
  if (pad && camMode === 'top') { if (pad.left) topYaw += Math.PI / 4; if (pad.right) topYaw -= Math.PI / 4; }
  // look (arrow keys work everywhere, for pages that block mouse lock)
  if (camMode !== 'top') { player.yaw += ((keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0)) * 2.2 * dt;
    player.pitch = Math.max(-1.35, Math.min(1.2, player.pitch + ((keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0)) * 1.6 * dt)); }
  if (pad && camMode !== 'top') { player.yaw -= pad.lx * 2.6 * dt * settings.sens; player.pitch = Math.max(-1.35, Math.min(1.2, player.pitch - pad.ly * 2.0 * dt * settings.sens * (settings.invertY ? -1 : 1))); }
  // move, relative to the camera's heading
  let ix = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), iz = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0);
  if (pad) { ix += pad.mx; iz += pad.mz; } if (player.dead) { ix = iz = 0; player.dead -= dt; if (player.dead <= 0 && !bedRespawn()) gameOver(); } // a bed you slept in wakes you (slice 11)
  if (player.sleep) { if (ix || iz || mouseDown || pad?.atk || pad?.jump || keys.has('Space')) wake('You get up.'); ix = iz = 0; } // asleep in a bed (slice 13): moving wakes you
  // co-op: down for 15 s; a friend standing close with E held for 2.5 s gets you up at a third of your health, else you are out
  if (player.down > 0) { player.down -= dt; const helper = [...others.values()].find(o => o.rv && !gone(o) && Math.hypot(o.x - player.x, o.z - player.z) < 2.4);
    player.revT = helper ? player.revT + dt : Math.max(0, player.revT - dt);
    if (player.revT >= 2.5) { Object.assign(player, { down: 0, dead: 0, revT: 0, hp: Math.round(player.maxHp * 0.35) }); player.mesh.userData.anim.revive(); log(`${helper.name} got you back up.`); logEvent('revived', { by: helper.name }); }
    else if (player.down <= 0 && !bedRespawn()) { player.down = 0; player.out = true; player.mesh.visible = false; logEvent('out'); log('You are out: watching the others until they fall too.'); } }
  if (player.out && !everyone().some(q => q !== player)) { send('all', { t: 'end' }); gameOver(); return; } // everyone is out: the game ends for all
  player.rv = !player.dead && (keys.has('KeyE') || !!pad?.useHeld) && [...others.values()].some(o => o.down > 0 && !o.out && Math.hypot(o.x - player.x, o.z - player.z) < 2.4); // reviving a friend
  const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
  const heading = camMode === 'top' ? topYaw : player.yaw, sh = Math.sin(heading), chh = Math.cos(heading);
  const wx = ix * chh + iz * sh, wz = -ix * sh + iz * chh;
  const depth = WATER_Y - groundY(player.x, player.z), inWater = depth > 0.4 && player.y < WATER_Y, sprint = keys.has('ShiftLeft') ? 1.35 : 1;
  const sp = player.ch.speed * PX * sprint * (inWater ? (depth > 1.1 ? 0.4 : 0.55) : 1) * (player.rallyT > 0 ? 1.5 : 1) * (player.eat ? 0.45 : 1); // (slice 12: eating, you walk)
  const ox = player.x, oz = player.z, oy = groundY(ox, oz);
  player.x += wx * sp * dt; player.z += wz * sp * dt; collide(player, 0.45, player.y);
  // cliffs: too steep to walk up (sliding along them still works, and walking down is always allowed)
  if (slopeAt(player.x, player.z) > 1.05 && groundY(player.x, player.z) > oy + 0.02) {
    const tx = player.x, tz = player.z; player.z = oz; if (slopeAt(player.x, player.z) > 1.05 && groundY(player.x, player.z) > oy + 0.02) { player.x = ox; player.z = tz;
      if (slopeAt(player.x, player.z) > 1.05 && groundY(player.x, player.z) > oy + 0.02) player.z = oz; } }
  if (il > 0.1) { player.walk += dt * sp * 1.6; if ((camMode === 'top' || camMode === 'angled') && player.swing <= 0) { const target = Math.atan2(-wx, -wz); let d = target - player.faceYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); player.faceYaw += d * Math.min(1, dt * 12); } }
  if (camMode === 'first') player.faceYaw = player.yaw;
  tickHarvest(dt, (keys.has('KeyE') || !!pad?.useHeld) && !player.rv && !player.mantle && !player.climbing && !building() && !cooking); // hold E by a tree: chop it (slice 11)
  tickTear(dt, keys.has('KeyX') || !!pad?.tearHeld);
  // slice 12: hold G (d-pad down) to eat, hold E at a fire to cook; R or d-pad up reloads the revolver
  cooking = tickSupplies(dt, keys.has('KeyG') || !!pad?.downHeld, keys.has('KeyE') || !!pad?.useHeld); if (pad?.up) reload(); // hold X (RB) by your own piece: tear it down (slice 12)
  // jump and gravity
  // slice 9b: rocks, crates, walls and roofs hold the feet (standAt); jump held against a ledge within reach (up to 2.5 m
  // above the feet: house walls, roofs, tall rocks) pulls the player up onto it; W and S climb the tower's ladder
  const jumpKey = (keys.has('Space') || pad?.jumpHeld) && !player.dead, lad = !player.dead && !player.mantle && ladderAt(player.x, player.z, player.y);
  const deep = depth > 1.1, surf = WATER_Y - 1.25, diving = deep && (keys.has('KeyC') || pad?.dive) && !player.dead;
  player.swimY = !deep ? surf : diving ? Math.max(groundY(player.x, player.z) + 0.2, player.swimY - 2 * dt) : Math.min(surf, player.swimY + 2.5 * dt); // C dives, letting go floats up
  const wasClimbing = player.climbing; player.climbing = false; let gy = player.y;
  if (player.mantle) { const m = player.mantle; m.t = Math.min(1, m.t + dt / 0.45); const f = Math.max(0, m.t * 2 - 1); // up first, then over the edge
    player.y = m.y0 + (m.y1 - m.y0) * Math.min(1, m.t * 1.6); player.x = m.x0 + (m.x1 - m.x0) * f; player.z = m.z0 + (m.z1 - m.z0) * f; player.vy = 0;
    if (m.t >= 1) { player.mantle = null; player.onGround = true; } }
  else if (lad && ((wasClimbing && !jumpKey && player.y > lad.y0 + 0.02 && player.y < lad.y1 - 0.02) || (iz < -0.3 && player.y < lad.y1 - 0.02) || (iz > 0.3 && player.y > lad.y0 + 0.02))) { player.climbing = true; // holds on with no input; jump lets go
    player.y = Math.min(lad.y1, Math.max(lad.y0, player.y - (Math.abs(iz) > 0.3 ? iz : 0) * 2.2 * dt)); [player.x, player.z] = lad.at(player.y); player.vy = 0; player.onGround = true; player.faceYaw = Math.atan2(lad.b.sa, -lad.b.ca); // facing the wall
    if (iz < -0.3 && player.y >= lad.y1 - 0.02) { player.mantle = { t: 0, x0: player.x, y0: lad.y1, z0: player.z, x1: lad.off[0], y1: lad.y1, z1: lad.off[1] }; player.yaw += Math.PI; logEvent('ladder top'); } } // up through the hatch, turned to face the room
  else { gy = Math.max(groundY(player.x, player.z), player.swimY, standAt(player.x, player.z, player.y));
    if (jumpKey && !player.onGround && il > 0.1 && player.vy < 5 && !(standAt(player.x, player.z, Infinity) > player.y + 1.9)) { // not under a roof
      const ax = player.x + wx / il * 0.75, az = player.z + wz / il * 0.75, ledge = standAt(ax, az, Infinity);
      if (ledge > player.y + STEP && ledge < player.y + 2.5 && ledge > groundY(ax, az) + 0.3) { player.mantle = { t: 0, x0: player.x, y0: player.y, z0: player.z, x1: ax, y1: ledge, z1: az }; logEvent('climb', { h: +(ledge - groundY(ax, az)).toFixed(1) }); } }
    if ((keys.has('Space') || pad?.jump) && !player.dead && player.onGround && !diving) { player.vy = 8; player.onGround = false; } // a pad jumps once per press
    player.vy -= (player.y + 1.5 < WATER_Y ? 6 : 24) * dt; player.y += player.vy * dt;
    if (player.y <= gy || (player.onGround && player.vy <= 0 && player.y - gy < 0.3)) { if (!player.onGround) fallHurt((player.fallTop ?? gy) - gy, gy); player.y = gy; player.vy = 0; player.onGround = true; } else player.onGround = false; } // feet stick on the way down a slope; off an edge they fall
  player.fallTop = player.onGround || player.mantle ? player.y : Math.max(player.fallTop ?? player.y, player.y); // the highest the feet were since they left the ground (a ladder or a mantle holds them)
  // under the surface the breath runs out in 12 s (the meter shows only then), and after that the water hurts
  player.under = player.y + 1.62 < WATER_Y; /* the eye is under */ player.breath = Math.min(1, Math.max(0, player.breath + (player.under ? -dt / 12 : dt / 3)));
  if (player.under && player.breath <= 0 && (player.drownT = (player.drownT || 0) - dt) <= 0) { player.drownT = 1; hurtPlayer(8, 'Lack of air'); }
  breathEl.classList.toggle('hidden', !player.under); breathEl.firstElementChild.style.width = player.breath * 100 + '%';
  tickDeep(dt, player.x, player.z, deep && player.y < WATER_Y - 0.5 && !player.dead, () => { logEvent('lurker'); floatText(new THREE.Vector3(player.x, WATER_Y + 2.2, player.z), 'Something moves below…', '#9fd8ff'); },
    () => { hurtPlayer(DEEP_BITE, 'Thing in the deep'); floatText(new THREE.Vector3(player.x, WATER_Y + 2, player.z), 'Bitten!', '#ff8a6a'); logEvent('bitten'); });
  // attack
  player.atkT -= dt; player.shieldT = (player.shieldT || 0) - dt; if ((mouseDown || pad?.atk) && !building()) attack(); if (pad?.close && !building()) attack(true); player.closeT = (player.closeT || 0) - dt; if (pad?.sec) secondary(); tickSecondary(dt); tickPulses(dt); tickBlasts(dt); AURA.opacity = 0.42 + 0.12 * Math.sin(t * 2.4); player.swing = Math.max(0, player.swing - dt * 4);
  // the bow: the arrow leaves on the shot, a new one is nocked a moment later and the string comes back to a half draw
  if (player.ch.id === 'ranger') { const p = 1 - Math.max(0, player.atkT) / player.ch.cd, k = Math.min(1, Math.max(0, (p - 0.4) / 0.6)), ease = k * k * (3 - 2 * k);
    const fpBow = viewModel.children[0]?.userData.weapon, tpBow = player.mesh.userData.weapon, snap = p < 0.4 ? Math.sin(p * 60) * 0.03 * (1 - p / 0.4) : 0;
    fpBow?.userData.draw?.(ease * 0.62 + snap, p > 0.4 && quiver.n > 0); tpBow?.userData.draw?.(ease * 0.18 + snap, p > 0.4 && quiver.n > 0); }
  player.emptyT = (player.emptyT || 0) - dt;
  if (pad?.use) interact();
  // the player model
  const pm = player.mesh, u = pm.userData; pm.position.set(player.x, player.y, player.z); pm.rotation.y = player.faceYaw;
  // animation: ground speed picks idle, walk, jog or sprint; deep water swims; off the ground for a moment is a jump
  const gs = Math.hypot(player.x - ox, player.z - oz) / Math.max(dt, 1e-3); player.moving = gs > 0.3;
  player.air = player.onGround ? 0 : (player.air || 0) + dt;
  u.anim.update(dt, { speed: player.climbing ? 1.8 : gs, // a ladder climb steps like a walk
     onGround: player.air < 0.15, swimming: groundY(player.x, player.z) < WATER_Y - 1.1 && player.y <= gy + 0.05, kneel: !!player.rv });
  eatPose(pm, player.eat ? Math.min(1, player.eat.t / 0.3) * (0.85 + 0.15 * Math.sin(player.eat.t * 14)) : 0); // the hand to the mouth (slice 12)
  // first person: the same arms; attacks are a procedural chop (melee) or recoil (ranged), with a walking bob
  const vm = viewModel.children[0];
  { const m = meat(), fp = camMode === 'first' && !document.body.classList.contains('freecam'); m.visible = !!player.eat && fp; viewModel.visible = fp && !player.eat; if (m.visible) { const k = Math.min(1, player.eat.t / 0.3), b = Math.sin(player.eat.t * 14) * 0.012; m.position.set(0.05, -0.16 + 0.07 * k + b, -0.38 + 0.06 * k); } }
  if (vm && camMode === 'first') { vm.userData.anim.update(dt); const sw = Math.sin(player.swing * Math.PI), bob = player.moving && player.onGround ? 1 : 0;
    const chop = player.ch.atk === 'melee' || player.blow; // the pistol-whip turns at the wrist: the gun comes up, then chops down (turning the whole arm swung the sleeve into view)
    if (player.ch.close) vm.userData.inner.parent.rotation.x = player.blow ? -Math.sin(player.swing * Math.PI * 2) * 0.6 : 0; // up, then down hard
    if (player.blow) vm.rotation.set(0, 0, 0); else if (chop) vm.rotation.set(-sw * 0.9, sw * 0.25, sw * 0.7); else vm.rotation.set(player.swing * 0.22, 0, 0);
    vm.position.set(Math.cos(player.walk * 2.2) * 0.012 * bob, Math.abs(Math.sin(player.walk * 2.2)) * 0.02 * bob - (chop ? 0 : player.swing * 0.03), player.blow ? -sw * 0.08 : chop ? 0 : player.swing * 0.06); }
  player.hurtT = Math.max(0, player.hurtT - dt); tickSlashes(dt);
  // enemies (dormant beyond the wake radius, as in IW1)
  // turns: one enemy winds up at a time, and the next waits a moment after it (his first play: four raiders struck inside a second)
  const NK = nightK(), fires = [campfire, ...fireSpots()], warm = (q) => fires.some(f => Math.hypot(q.x - f.x, q.z - f.z) < f.r + 1.5);
  let alive = 0; const striking = new Set(enemies.filter(e => !e.dead && e.state === 'windup').map(e => e.tg)), awake = []; for (const [k, v] of strikeCD) strikeCD.set(k, v - dt);
  for (const e of enemies) {
    const st = ENEMY[e.type], u = e.mesh.userData, an = u.anim;
    if (e.dead) { e.dead -= dt; const tr = e.mesh.getObjectByName('threat'); if (tr) tr.visible = false; an.update(dt, { speed: 0, scale: st.scale }); if (e.dead < 1.2 && !e.dropped) { e.dropped = true; dropFrom(e); } /* its arrows fall beside it */ if (e.dead < 1) e.mesh.position.y -= dt * 0.6; if (e.dead <= 0) { scene.remove(e.mesh); e.gone = true; } continue; }
    alive++; const tg = joining() ? player : nearestP(e.x, e.z) || player, tgGone = gone(tg); if (joining()) followHost(e, dt); // a joined game's enemies go where the host's are
    const dx = tg.x - e.x, dz = tg.z - e.z, d = Math.hypot(dx, dz) || 1e-3, tx = dx / d, tz = dz / d;
    if (d > WAKE_RADIUS) { e.mesh.visible = d < 200; continue; } e.mesh.visible = true; awake.push(e);
    u.setDetail(camera.position.distanceTo(e.mesh.position) < 32); // fur shells near the camera
    e.stag = Math.max(0, e.stag - dt); e.flashT = Math.max(0, e.flashT - dt); e.barT = Math.max(0, e.barT - dt); u.flash(e.flashT / 0.15);
    { const ring = e.mesh.getObjectByName('threat'), hunt = ['chase', 'windup', 'recover', 'emerge', 'siege'].includes(e.state), want = hunt ? (e.state === 'windup' ? 1.0 : 0.55 + 0.12 * Math.sin(t * 5)) : e.state !== 'lurk' && d < 45 ? 0.22 : 0; // a faint ring on idle creatures in range
      ring.material.opacity += (want - ring.material.opacity) * Math.min(1, dt * 6); ring.visible = ring.material.opacity > 0.02; }
    // slice 13: at night an animal sees further, runs faster and bites harder (IW1: 1.35), unless its quarry is by a fire
    const nb = NK && !warm(tg) ? NK : 0, aggro = st.aggro / 12 * (1 + 0.35 * nb), reach = 0.9 + st.scale * 0.75, bite = Math.round(st.dmg * (1 + 0.35 * nb));
    // perception: a pack wakes together; giving up only far away; rats and hounds run when badly hurt
    // the safe valley: nothing follows the player in; anything inside the ring wanders back out
    const safe = Math.hypot(tg.x, tg.z) < SAFE_R - 12, inside = Math.hypot(e.x, e.z) < SAFE_R, host = !joining();
    if (host) { if (tgGone || (safe && !e.posed)) { if (e.state !== 'lurk' && e.state !== 'idle') { e.state = 'idle'; e.wander = 0; } }
    if (inside && e.state === 'idle' && !e.posed) { e.wyaw = Math.atan2(e.x, e.z); e.wmove = true; e.wander = Math.max(e.wander, 1); }
    if (tgGone || (safe && !e.posed)) { /* no new hunts */ }
    else if ((e.state === 'idle' || e.state === 'lurk') && d < aggro) alertPack(e);
    else if (e.state !== 'idle' && e.state !== 'lurk' && d > aggro * 2.6) e.state = 'idle';
    if ((e.type === 'rat' || e.type === 'dust_hound') && !e.fled && e.hp < e.maxHp * 0.3 && e.state !== 'idle') { e.state = 'flee'; e.fleeT = 3; e.fled = true; }
    // slice 12: an upgraded Lauren's charm aura: an animal that closes in on her is charmed (each one at most every 10 s)
    if (!st.raider && (e.state === 'chase' || e.state === 'windup') && !(e.auraT > t)) for (const q of everyone()) if (!gone(q) && (q === player ? upgraded('charmer') : (q.u & 8) && CHARS[q.c]?.id === 'charmer') && Math.hypot(q.x - e.x, q.z - e.z) < AURA_R) { e.auraT = t + 10; charm(e); break; } }
    let mx = 0, mz = 0, spd = st.speed * PX * (1 + 0.15 * nb), face = false;
    if (host) switch (e.state) {
      case 'lurk': break; // buried in the mud, waiting
      case 'emerge': e.emT -= dt; if (e.emT <= 0) { e.state = 'chase'; } face = true; break;
      case 'idle': e.wander -= dt; if (e.wander <= 0) { e.wander = 2 + rng() * 4; e.wyaw = rng() * 6.28; e.wmove = rng() < 0.55; }
        if (e.home && Math.hypot(e.x - e.home.x, e.z - e.home.z) > 9) { e.wyaw = Math.atan2(e.home.x - e.x, e.home.z - e.z); e.wmove = true; } // raiders drift back to their fire
        if (e.wmove) { mx = Math.sin(e.wyaw); mz = Math.cos(e.wyaw); spd *= 0.35; } break;
      case 'charmed': e.chT -= dt; if (e.chT <= 0) e.state = 'chase'; e.wander -= dt; if (e.wander <= 0) { e.wander = 1 + rng() * 2; e.wyaw = rng() * 6.28; } mx = Math.sin(e.wyaw); mz = Math.cos(e.wyaw); spd *= 0.3; break;
      case 'flee': mx = -tx; mz = -tz; spd *= 1.15; e.fleeT -= dt; if (e.fleeT <= 0) e.state = 'chase'; break;
      case 'windup': face = true; e.wT -= dt; mx = tx * 0.15; mz = tz * 0.15;
        if (e.wT <= 0) { if (st.shoot && d > reach + 0.7) { enemyShot(e, bite, tg); strikeCD.set(tg, Math.max(strikeCD.get(tg) || 0, d / 70 + 0.45)); } /* the turn lasts until the bullet lands */ else { e.vx += tx * 5; e.vz += tz * 5; if (d < reach + 0.7 && !wallAhead(e.x, e.z, tx, tz, 0.2, d - 0.3)) hurt(tg, bite, e.type, e); } e.state = 'recover'; e.rT = st.atk / 1000 * 0.75; } break;
      case 'recover': e.rT -= dt; face = true; if (e.type === 'wolf' || e.type === 'dust_hound' || e.type === 'rat') { if (e.rT > st.atk / 1000 * 0.4) { mx = -tx; mz = -tz; spd *= 0.7; } }
        if (e.rT <= 0) e.state = 'chase'; break;
      case 'chase': {
        const aim = st.shoot && d > reach && d < st.shoot * PX; // shooters and heavies fire from range
        const turn = !striking.has(tg) && !(strikeCD.get(tg) > 0) && !tgGone;
        // slice 12: a wall or a shut gate in the way: an enemy at a fort (3 or more pieces) always breaks in; at a lone
        // wall it does sometimes (IW1), and otherwise goes round, unless it is still stuck at it after 3 s
        const blk = aim ? null : wallAhead(e.x, e.z, tx, tz, 0.4 * st.scale, Math.min(d - 0.3, 1.4 + 0.6 * st.scale));
        if (blk) { if (e.rollFor !== blk) { e.rollFor = blk; e.rollSiege = fortSize(blk) >= 3 || rng() < 0.35; e.blkT = 0; } e.blkT += dt;
          if (e.rollSiege || e.blkT > 3) { e.state = 'siege'; e.wall = blk; e.sT = 0.35; logEvent('siege', { enemy: e.type, key: blk.key }); break; } }
        if ((d <= reach && !blk || aim) && turn) { e.state = 'windup'; e.wT = aim ? 0.5 : e.type === 'bear' ? 0.6 : e.type === 'bog_lurker' ? 0.45 : 0.32; e.tg = tg; striking.add(tg); strikeCD.set(tg, e.wT + 0.45); an.attack(); if (rng() < 0.4) sfx(e.type, e, 0.7); face = true; break; }
        if (!turn && (d < 5.5 || aim)) { // someone else's turn: circle at a few metres (shooters sidestep) and wait for an opening
          const k = d < 5.5 ? (d - 3.6) * 0.5 : 0; mx = -tz * e.circle + tx * k; mz = tx * e.circle + tz * k; spd *= 0.55; face = true; break; }
        // flanking: pack members curve out to their own side and close from different angles
        const f = e.size > 1 ? e.flank * Math.min(1, Math.max(0, (d - 2.5) / 7)) : 0, c = Math.cos(f), s = Math.sin(f);
        mx = tx * c - tz * s; mz = tz * c + tx * s; spd *= CHASE[e.type] || 1;
        e.voiceT -= dt; if (e.voiceT <= 0) { e.voiceT = 3 + rng() * 4; sfx(e.type, e, 0.6); } break; }
      // slice 12: at the wall in its way: up to it, then a blow every 1.4 s for 0.7 of its damage (IW1) until it falls or
      // the way is clear again
      case 'siege': { const w = e.wall; if (!w || !(w.hp > 0) || !built.includes(w) || tgGone) { e.state = 'chase'; break; }
        let cd = 1e9, cx = 0, cz = 0; for (const c of w.cols) { const q = Math.hypot(c.x - e.x, c.z - e.z) - c.r; if (q < cd) { cd = q; cx = c.x; cz = c.z; } }
        const wl = Math.hypot(cx - e.x, cz - e.z) || 1; e.wfx = (cx - e.x) / wl; e.wfz = (cz - e.z) / wl;
        if (cd > 0.25 + st.scale * 0.35) { mx = e.wfx; mz = e.wfz; spd *= 0.8; }
        else if ((e.sT -= dt) <= 0) { e.sT = 1.4 - 0.5 * nb; an.attack(); if (rng() < 0.5) sfx(e.type, e, 0.6); damageBuilt(w, bite * 0.7, e); /* (IW1: a blow every 0.9 s at night) */
          if (!wallAhead(e.x, e.z, tx, tz, 0.4 * st.scale, Math.min(d, 2.6))) e.state = 'chase'; }
        break; }
    } else if (e.state === 'siege' && (e.sT = (e.sT ?? 0) - dt) <= 0) { e.sT = 1.4; an.attack(); } // a joined game shows the host's enemies at walls
    else if (e.state === 'chase' && (e.voiceT -= dt) <= 0) { e.voiceT = 3 + rng() * 4; sfx(e.type, e, 0.6); } // a joined game voices the host's hunters too
    if (e.stag > 0) mx = mz = 0;
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const mx0 = mx, mz0 = mz; if (e.detT > 0) { e.detT -= dt; const c = Math.cos(e.det), s = Math.sin(e.det); [mx, mz] = [mx * c - mz * s, mz * c + mx * s]; } // going round
    e.vx *= Math.exp(-dt * 6); e.vz *= Math.exp(-dt * 6);
    const ex = e.x, ez = e.z; e.x += (mx * spd + e.vx) * dt; e.z += (mz * spd + e.vz) * dt; if (host) collide(e, 0.45 * st.scale);
    // too steep or too deep: slide along it one axis at a time, as the player does; still pinned while meaning to move for
    // a third of a second, turn off to one side for a second or two (the other side if that pins too). His log, 2026-11-03:
    // hunting wolves and hounds held one distance for 5 to 10 s at the foot of slopes they could not climb
    const bad = (x, z) => (slopeAt(x, z) > 1.0 && groundY(x, z) > groundY(ex, ez)) || (groundY(x, z) < WATER_Y - 0.8 && e.type !== 'bog_lurker');
    if (host && bad(e.x, e.z)) { if (!bad(e.x, ez)) e.z = ez; else if (!bad(ex, e.z)) e.x = ex; else { e.x = ex; e.z = ez; } e.wander = 0; }
    const want = Math.hypot(mx, mz) * spd * dt; e.pin = host && want > 1e-3 && Math.hypot(e.x - ex, e.z - ez) < want * 0.3 ? (e.pin || 0) + dt : 0;
    // pinned: try headings further and further off to one side, then the other, for the first whose next 1 and 2.5 m are
    // neither too steep nor too deep nor solid (a single fixed turn left a wolf in a cliff's notch for 8 s, 2026-11-04); a
    // heading that pinned it again is not tried twice in a row
    if (e.pin > 0.35) { const side = e.detT > 0 ? -Math.sign(e.det) : rng() < 0.5 ? 1 : -1, L = Math.hypot(mx0, mz0) || 1, r = 0.45 * st.scale, failed = e.detT > 0 ? e.det : null;
      const clear = (a) => { if (a === failed) return false; const c = Math.cos(a), s = Math.sin(a), hx = (mx0 * c - mz0 * s) / L, hz = (mz0 * c + mx0 * s) / L;
        return [0.3, 1, 2.5].every(k => { const x = e.x + hx * k, z = e.z + hz * k; return !bad(x, z) && !nearColliders(x, z).some(q => q.r && Math.hypot(q.x - x, q.z - z) < colR(q, x, z) + r); }); };
      e.det = side * Math.PI; for (const a of [0.8, 1.35, 1.9, 2.5]) { if (clear(a * side)) { e.det = a * side; break; } if (clear(-a * side)) { e.det = -a * side; break; } }
      e.detT = 1.2 + rng() * 1.2; e.pin = 0; }
    const ty = joining() ? e.nyaw ?? e.yaw : e.state === 'siege' && e.wfx != null ? Math.atan2(-e.wfx, -e.wfz) : face ? Math.atan2(-tx, -tz) : (mx || mz) ? Math.atan2(-mx, -mz) : e.yaw; let dd = ty - e.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); e.yaw += dd * Math.min(1, dt * 8);
    const gy = groundY(e.x, e.z), sink = e.state === 'lurk' ? 0.85 : e.state === 'emerge' ? 0.85 * Math.max(0, e.emT / 0.8) : 0;
    if (e.state === 'emerge' && e.emT > 0.7) { const at = new THREE.Vector3(e.x, Math.max(gy, WATER_Y), e.z); if (gy < WATER_Y + 0.2) { splash(at); sfx('splash', e); } else dustPuff(at, 14); e.emT = 0.7; }
    e.mesh.position.set(e.x, Math.max(gy, WATER_Y - 0.55 * st.scale) - sink * st.scale, e.z); e.mesh.rotation.y = e.yaw;
    e.mesh.visible = e.state !== 'lurk' || d < 4;
    if (d < 80) an.update(dt, { speed: joining() ? e.spd || 0 : Math.hypot(e.x - ex, e.z - ez) / Math.max(dt, 1e-3), scale: st.scale });
  }
  // keep awake enemies from stacking on one another
  for (let i = 0; i < awake.length; i++) for (let j = i + 1; j < awake.length; j++) { const a = awake[i], b = awake[j]; if (a.state === 'lurk' || b.state === 'lurk') continue;
    const r = 0.45 * (ENEMY[a.type].scale + ENEMY[b.type].scale), dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d < r && d > 1e-4) { const push = (r - d) / 2 / d; a.x -= dx * push; a.z -= dz * push; b.x += dx * push; b.z += dz * push; } }
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].gone) enemies.splice(i, 1);
  // the land round the player stays alive: spawns follow them (the cap counts only animals within 150 m), far idle ones are cleared
  // (co-op: round every player; the host's game spawns for all)
  if (!joining() && Math.floor(t) % 4 === 0 && Math.floor(t) !== spawnTick) { spawnTick = Math.floor(t); const P = everyone();
    for (const e of enemies) if (!e.home && !e.posed && e.state === 'idle' && P.every(q => Math.hypot(e.x - q.x, e.z - q.z) > 320)) { dropFrom(e); scene.remove(e.mesh); e.gone = true; }
    for (const q of P) if (enemies.filter(e => !e.dead && !e.home && Math.hypot(e.x - q.x, e.z - q.z) < 150).length < 12 + Math.round(6 * NK)) spawnAround(q.x, q.z, 3 + Math.round(2 * NK), 60, 110); } // (busier at night: slice 13)
  // projectiles
  for (let i = shots.length - 1; i >= 0; i--) { const s = shots[i]; s.life -= dt; if (s.kind === 'shield') { if (tickShield(s, dt)) { scene.remove(s.mesh); shots.splice(i, 1); } continue; }
    s.v.y -= s.grav * dt; const p = s.mesh.position; const prev = p.clone(); p.addScaledVector(s.v, dt);
    if (s.grav) s.mesh.lookAt(p.clone().add(s.v)); if (s.kind === 'charmer') s.mesh.rotateZ(dt * 12);
    // ground, trunks, rocks and walls stop a shot: sampled every 0.3 m along this frame's path, so a fast one cannot skip a wall
    // (a frame's path is far shorter than a grid cell, so one lookup at its middle covers it; a collider stops shots below its top)
    let hit = false, stop = null, last = prev; const n = Math.max(1, Math.ceil(prev.distanceTo(p) / 0.3)), near = nearColliders((prev.x + p.x) / 2, (prev.z + p.z) / 2);
    for (let k = 1; k <= n && !hit; k++) { const q = prev.clone().lerp(p, k / n), gq = groundY(q.x, q.z); hit = q.y < gq;
      for (const c of near) if (c.r && !(c.gate && c.gate.open) && Math.hypot(c.x - q.x, c.z - q.z) < colR(c, q.x, q.z) && q.y < (c.top ?? gq + 4)) { hit = true; stop = c; } if (hit) p.copy(q); else last = q; }
    if (stop) hitScenery(stop, p.clone(), s.v.clone().setY(0).normalize()); else if (hit) dustPuff(prev, 4);
    if (stop?.bp && s.hostile && !s.ghost && !joining()) damageBuilt(stop.bp, s.dmg * 0.5, s.o); // a raider's bullet chips the wall it hits (slice 12)
    if (s.hostile && s.ghost) { /* another game's shot: seen here, felt there */ }
    else if (s.hostile) { if (!hit) for (const q of everyone()) if (!gone(q) && segD(prev, p, q.x, q.z) < 0.5 && p.y > q.y && p.y < q.y + 1.9) { hurt(q, s.dmg, s.from); hit = true; break; } }
    // (an enemy is tested along this frame's whole path, at its closest point: a fast shot tested only where the frame ended
    // could pass through a wolf, 2 m a frame for an arrow at 20 fps; found by slice 12's spread check)
    else for (const e of enemies) { if (e.dead || hit || e.state === 'lurk') continue; const sc = ENEMY[e.type].scale, top = e.mesh.position.y + e.mesh.userData.height * sc + 0.25;
      const sx = p.x - prev.x, sz = p.z - prev.z, L2 = sx * sx + sz * sz || 1, tt = Math.max(0, Math.min(1, ((e.x - prev.x) * sx + (e.z - prev.z) * sz) / L2)), cq = prev.clone().lerp(p, tt);
      if (Math.hypot(e.x - cq.x, e.z - cq.z) < 0.55 * sc + 0.3 + (s.wide || 0) && cq.y < top && cq.y > e.mesh.position.y - 0.2) { p.copy(cq); const v = s.v.clone().setY(0).normalize(); if (!s.ghost) hitEnemy(e, s.dmg + (s.boom ? 16 : 0), v.x * 0.6, v.z * 0.6, p.clone()); hit = true; s.inE = e; if (s.charm && !e.dead && !s.ghost) charm(e); } }
    // slice 12: a fire arrow that struck an enemy bursts (and burns up); an upgraded charm flower charms all round where it lands
    if (hit && s.boom && s.inE) { blast(p.clone(), s.ghost, s.inE); scene.remove(s.mesh); shots.splice(i, 1); continue; }
    if (hit && s.aura) charmBurst(p.clone(), s.ghost);
    // an arrow stays where it struck (slice 11): in the ground, a trunk, a rock or a wall, or in the creature it hit
    if (hit && s.kind === 'ranger') { stick(s.mesh, struck(s, last, p, stop), s.v.clone().normalize(), !s.ghost, s.inE); shots.splice(i, 1); }
    else if (hit || s.life <= 0) { scene.remove(s.mesh); shots.splice(i, 1); } }
  // pickups: pop out of the kill, settle, bob; drawn in when close
  for (let i = pickups.length - 1; i >= 0; i--) { const k = pickups[i], m = k.mesh, u = m.userData; k.t += dt; k.age += dt;
    const gy = groundY(m.position.x, m.position.z);
    if (!k.landed) { k.vy -= 14 * dt; m.position.x += k.vx * dt; m.position.z += k.vz * dt; m.position.y += k.vy * dt; if (m.position.y < gy + 0.3 && k.vy < 0) { k.landed = true; m.position.y = gy + 0.3; } }
    else { m.position.y = gy + 0.35 + Math.sin(k.t * 2.5) * 0.06; }
    u.item.rotation.y += dt * 1.6; u.ring.position.y = gy - m.position.y + 0.05; u.ring.scale.setScalar(1 + Math.sin(k.t * 3) * 0.08); u.beam.position.y = gy - m.position.y + 1.3;
    // the host's game hands each pickup to the nearest player standing (a joined game only draws them, until the host says)
    const q = joining() ? null : k.kind === 'ammo' ? nearestGun(m.position.x, m.position.z) : nearestP(m.position.x, m.position.z), dx = q ? q.x - m.position.x : 0, dz = q ? q.z - m.position.z : 0, dd = q ? Math.hypot(dx, dz) : 1e9;
    if (k.landed && dd < 2.6) { m.position.x += dx / dd * dt * 6; m.position.z += dz / dd * dt * 6; }
    if (dd < 0.8 || k.age > 180) { if (dd < 0.8) { if (q === player) gotPickup(k.kind); else send(q.id, { t: 'got', kind: k.kind }); } send('all', { t: 'take', id: k.id });
      scene.remove(m); pickups.splice(i, 1); } }
  for (const c of caches) if (!c.opened && !c.hinted && Math.hypot(c.x - player.x, c.z - player.z) < 2.8) { c.hinted = true;
    log(c.camp ? 'The raiders\' supply crate. Clear the camp, then search it (E).' : 'A supply crate. Search it (E).'); }
  tickArrows(dt); tickBuild(dt);
  // slice 13: the clock (the host's; a joined game follows the host's), nightfall and dawn, and sleeping the night away
  const turn = tickDay(dt, !!player.sleep && everyone().every(q => q === player || q.sl || gone(q)), joining());
  if (turn === 'night') { log('Night falls. Animals hunt bolder and bite harder in the dark: keep near a fire, behind walls, or sleep it off in a bed.'); sfx('night'); logEvent('night', { day: day.n }); }
  if (turn === 'day') { log(`Day ${day.n} dawns.`); sfx('dawn'); logEvent('dawn', { day: day.n }); }
  tickSleep(dt);
  // the campfire mends wounds, as in IW1 (every 2 s within a few metres); so does a campfire a player built (slice 11)
  if (!player.dead && [campfire, ...fireSpots()].some(f => Math.hypot(player.x - f.x, player.z - f.z) < f.r)) { campT += dt;
    if (!warmLogged) { log('The campfire\'s warmth mends your wounds.'); warmLogged = true; }
    if (campT > 2) { campT = 0; if (player.hp < player.maxHp) { const h = Math.min(8, player.maxHp - player.hp); player.hp += h; floatText(new THREE.Vector3(player.x, player.y + 2, player.z), `+${h}`, '#8aff9a'); } } }
  else { campT = 0; warmLogged = false; }
  tickLog(dt, { player, cam: camMode, biome: biomeAt(player.x, player.z), fps: lastFps, enemies }, il > 0.1 && !player.dead);
  tickCoop(dt); tickEffects(dt); setListener(player.x, player.z, camMode === 'top' ? topYaw : player.yaw);
  windLevel(0.03 + Math.min(0.06, Math.max(0, player.y - 20) / 600) + W.wind + (BIOME_WIND[biomeAt(player.x, player.z)] || 0)); ambient(dt, biomeAt(player.x, player.z), nightK(), Math.hypot(player.x, player.z) < SAFE_R); // (slice 13: storms, the open biomes' wind, the night's sounds)
}
let spawnTick = -1, campT = 0, warmLogged = false, lastFps = 0, cooking = false;

const strikeCD = new Map(); // player -> seconds until the next enemy may wind up at them
// IW1: food picked up while hurt heals 15, else it is stored
// (slice 12, the owner: food picked up goes into the pack, eaten later with G; rounds are the Gunslinger's, +3 a box)
// rounds go only to a Gunslinger on his feet (the nearest), or lie there
function nearestGun(x, z) { let best = null, bd = 1e9; for (const q of everyone()) { if (gone(q) || (q === player ? player.ch.id : CHARS[q.c]?.id) !== 'gunslinger' || (q === player && ammo.clip + ammo.reserve >= MAX_ROUNDS)) continue; const d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; best = q; } } return best; }
export function gotPickup(kind) { if (kind === 'ammo') { const n = addRounds(3); sfx('pickup'); floatText(new THREE.Vector3(player.x, player.y + 2, player.z), `+${n} rounds`, '#ffe08a'); return; }
  player.inv[kind] = (player.inv[kind] || 0) + 1; sfx('pickup');
  floatText(new THREE.Vector3(player.x, player.y + 2, player.z), `+1 ${kind}`, { food: '#ff9a7a', metal: '#ffc070', wood: '#e8b878' }[kind] || '#efe6b0'); }
let snapCam = true; export function snapCamera() { snapCam = true; }
export function placeCamera(dt) {
  const k = snapCam ? 1 : null; snapCam = false;
  const P = player.out ? [...others.values()].find(o => !o.out) || player : player, drop = P !== player ? 0 : player.down > 0 ? 1.25 : player.dead ? Math.min(1.25, (3 - player.dead) * 1.2) : 0;
  const head = new THREE.Vector3(P.x, P.y + 1.62 - drop, P.z); // an out player watches a friend
  if (camMode === 'first') { camera.position.copy(head); camera.position.y = player.under ? head.y : Math.max(head.y, WATER_Y + 0.4); camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ'); camera.fov = 75; }
  else if (camMode === 'angled') { const p = Math.max(-0.2, -player.pitch + 0.25), right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const pivot = head.clone().addScaledVector(right, 0.75), back = new THREE.Vector3(Math.sin(player.yaw) * Math.cos(p), Math.sin(p), Math.cos(player.yaw) * Math.cos(p));
    const dist = 5;
    const want = pivot.clone().addScaledVector(back, dist); want.y += 0.5;
    want.y = Math.max(want.y, Math.max(groundY(want.x, want.z), WATER_Y) + 0.6); camera.position.lerp(want, k ?? Math.min(1, dt * 14));
    camera.lookAt(pivot.clone().add(new THREE.Vector3(-Math.sin(player.yaw) * 3, 0.1, -Math.cos(player.yaw) * 3))); camera.fov = 65; }
  else { const want = head.clone().add(new THREE.Vector3(Math.sin(topYaw) * 10.5, 19, Math.cos(topYaw) * 10.5)); camera.position.lerp(want, k ?? Math.min(1, dt * 10)); camera.lookAt(head); camera.fov = 50; }
  if (player.shake > 0) { player.shake -= dt; const k = player.shake * 0.12; camera.position.x += (Math.random() - 0.5) * k; camera.position.y += (Math.random() - 0.5) * k; }
  camera.updateProjectionMatrix(); hideOccluders(camera, camMode !== 'first' ? head : null);
  env.follow(new THREE.Vector3(P.x, P.y, P.z));
}
// performance hint: a steady low frame rate for 12 s on Medium or High suggests Low once (the headless check runs slow,
// so the hint is skipped when the page runs under automation)
let slowT = 0, slowHinted = false;
function perfHint(fps, dt) { if (slowHinted || navigator.webdriver || paused || QUALITY_KEY === 'low') return;
  slowT = fps > 0 && fps < 24 ? slowT + dt : 0; if (slowT > 12) { slowHinted = true; log('Running slowly here: try Quality → Low (P opens settings).'); } }
export function hud(fps, dt = 0) { perfHint(fps, dt); lastFps = fps;
  const watch = player.out && [...others.values()].find(o => !o.out); // co-op: down, or out and watching a friend
  document.getElementById('name').textContent = `${player.ch.player.toUpperCase()} · ${player.ch.title}   ` + (player.out ? `OUT${watch ? ' · watching ' + watch.name : ''}` : player.down > 0 ? `DOWN ${Math.ceil(player.down)} s · ${player.revT > 0 ? `${watch?.name || 'a friend'} is reviving you ${Math.round(player.revT / 2.5 * 100)}%` : 'a friend can revive you (they hold E beside you)'}` : `${Math.max(0, Math.ceil(player.hp))}/${player.maxHp}`);
  document.getElementById('hpfill').style.width = Math.max(0, player.hp / player.maxHp * 100) + '%';
  document.getElementById('biome').textContent = `${BIOME[biomeAt(player.x, player.z)].label} · Day ${day.n} · ${phase()}`; // (slice 13: the time of day)
  // the resources (slice 11), each chip bumping when it goes up; Abigail's arrows beside them
  for (const k of ['wood', 'metal', 'fiber', 'food', 'cooked']) chip(k, k[0].toUpperCase() + k.slice(1), player.inv[k] || 0);
  // what this character shoots and can run out of: Abigail's arrows, the Gunslinger's rounds (clip | reserve), Lauren's flowers (slice 12)
  const cid = player.ch.id, ammoEl = document.getElementById('inv-arrows'), shows = cid === 'ranger' || cid === 'gunslinger' || cid === 'charmer'; ammoEl.classList.toggle('hidden', !shows);
  if (cid === 'ranger') { chip('arrows', 'Arrows', quiver.n, `/${quiver.max}`); ammoEl.classList.toggle('empty', quiver.n === 0); }
  else if (cid === 'gunslinger') { chip('arrows', player.reloadT > 0 ? 'Reloading' : 'Rounds', ammo.clip, ` | ${ammo.reserve}`); ammoEl.classList.toggle('empty', ammo.clip === 0); }
  else if (cid === 'charmer') { chip('arrows', 'Flowers', ammo.flowers); ammoEl.classList.toggle('empty', ammo.flowers === 0); }
  // the ring round the crosshair while eating or cooking
  { const busy = player.eat || player.cook, el = document.getElementById('eat'); el.classList.toggle('hidden', !busy); if (busy) { el.style.setProperty('--p', (busy.t / busy.T * 100).toFixed(0)); el.classList.toggle('cook', !!player.cook); } }
  chip('kills', 'Kills', player.kills); prompt(dt);
  // co-op: each friend's name and a small health bar under the player's own (red and counting down while they are down)
  const team = [...others.values()].map(o => { const dn = o.down > 0 && !o.out, f = o.out ? 0 : dn ? o.down / 15 : Math.max(0, o.hp) / (o.mx || 1);
    return `<div class="mate"><span style="color:#${CHARS[o.c].color.toString(16).padStart(6, '0')}">${o.name}</span> ${o.out ? 'out' : o.away ? 'away (window hidden)' : performance.now() - o.seen > 3000 ? 'no word…' : dn ? `DOWN ${Math.ceil(o.down)} s` : `${Math.max(0, o.hp)}/${o.mx}`}<i><b style="width:${(f * 100).toFixed(0)}%${dn ? ';background:#ff8a6a' : ''}"></b></i></div>`; }).join(''), tEl = document.getElementById('team');
  if (tEl.innerHTML !== team) tEl.innerHTML = team; tEl.classList.toggle('hidden', !team);
  const sec = document.getElementById('sec'); sec.textContent = `F · ${player.ch.sec}${upgraded(player.ch.id) ? ' ★' : ''}` + (player.secT > 0 ? ` ${Math.ceil(player.secT)} s` : ''); sec.style.opacity = player.secT > 0 ? 0.55 : 1;
  document.getElementById('cross').style.opacity = player.atkT > 0 ? 0.35 : 1; // dim while the attack recovers
  document.getElementById('fps').textContent = fps + ' fps';
  const list = []; for (const e of enemies) { if (e.dead || e.state === 'lurk') continue; const d = Math.hypot(e.x - player.x, e.z - player.z);
    if (d < 28 && (e.barT > 0 || e.state === 'chase' || e.state === 'windup' || e.state === 'recover')) list.push({ d, p: new THREE.Vector3(e.x, e.mesh.position.y + e.mesh.userData.height * ENEMY[e.type].scale + 0.15, e.z), frac: Math.max(0, e.hp / e.maxHp) }); }
  list.push(...pieceBars(player.x, player.z)); // walls and gates hit lately (slice 12)
  list.sort((a, b) => a.d - b.d); healthBars(camMode === 'first' || camMode === 'angled' || camMode === 'top' ? list : []);
  document.getElementById('hurt').style.boxShadow = `inset 0 0 120px rgba(200,30,20,${player.hurtT > 0 ? 0.55 : 0})`;
}

const chipV = {};
// (redrawn when any of its text changes, not only its number: the reserve and Reloading went stale; the review of slice 12)
function chip(k, label, v, tail = '') { const txt = `${label} ${v}${tail}`; if (chipV[k + 't'] === txt) return; const el = document.getElementById('inv-' + k); el.lastChild.textContent = txt;
  if (chipV[k] !== undefined && v > chipV[k]) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } chipV[k] = v; chipV[k + 't'] = txt; }
// what E (B on a pad) does here, shown over the bottom bar, with the chopping's progress while E is held (slice 11)
const promptEl = document.getElementById('prompt'); let promptT = 0;
function prompt(dt) { const c = player.chop || player.tear || player.eat || player.cook, bar = promptEl.querySelector('i b'); promptEl.classList.toggle('busy', !!c); if (c) bar.style.width = Math.min(100, c.t / c.T * 100).toFixed(0) + '%';
  if ((promptT -= dt) > 0 && !c) return; promptT = 0.15; const E = padActive ? 'B' : 'E', TAB = padActive ? 'View' : 'Tab', x = player.x, z = player.z; let t = '';
  if (!running || player.dead || player.down > 0 || player.out || craftOpen()) t = '';
  else if (player.tear) t = `Hold ${padActive ? 'RB' : 'X'} · tearing down the ${pieceName(player.tear.b)}`;
  else if (player.eat) t = `Hold ${padActive ? 'd-pad down' : 'G'} · eating the ${player.eat.what === 'cooked' ? 'roast meat' : 'raw meat'} (a hit stops you)`;
  else if (player.cook) t = `Hold ${E} · cooking over the fire (${player.inv.food} raw left)`;
  else if (building()) t = '';
  else if (c) t = `Hold ${E} · ${c.it.type.endsWith('bush') ? 'pulling fiber from the ' : 'chopping the '}${harvestName(c.it)}`;
  else if ([...others.values()].some(o => o.down > 0 && !o.out && Math.hypot(o.x - x, o.z - z) < 2.4)) t = `Hold ${E} · revive`;
  else if (caches.some(q => !q.opened && Math.hypot(q.x - x, q.z - z) < 2.4)) t = `${E} · search the crate`;
  else if (gateNear(x, z)) t = `${E} · ${gateNear(x, z).open ? 'shut the gate' : 'hold the gate open'}`;
  else if (bedNear(x, z)) t = `${E} · sleep (you wake here if you fall)`;
  else if ((placed.scrap || []).concat(placed.hulk || []).some(q => !q.gone && !q.salvaged && Math.hypot(q.x - x, q.z - z) < (q.type === 'hulk' ? 4 : 2.6))) t = `${E} · salvage metal`;
  else { const h = harvestTarget(x, z); if (h) t = `Hold ${E} · ${h.type.endsWith('bush') ? 'pull fiber from the ' : 'chop the '}${harvestName(h)}`; }
  if (!t && benchNear(x, z) && !craftOpen() && running && !player.dead) t = `${TAB} · craft at the bench`;
  if (!t && running && !player.dead && player.inv.food > 0 && fireNear()) t = `Hold ${E} · cook raw meat (${player.inv.food}): it mends ${HEAL.cooked}, not ${HEAL.food}`;
  if (!t && running && !player.dead && !building() && foodCount() && player.hp < player.maxHp) { const G = padActive ? 'd-pad down' : 'G', w = player.inv.cooked ? `roast meat, +${HEAL.cooked}` : `raw meat, +${HEAL.food}`;
    t = player.fightT > 0 ? `In a fight · you can eat (${G}) ${Math.ceil(player.fightT)} s after the last blow` : `Hold ${G} · eat (${w})`; }
  if (!t && running && !player.dead && !building() && !craftOpen()) { const b = tearTarget(x, z); if (b) { const back = Object.entries(refundOf(b.key)).map(([k, v]) => `${v} ${k}`).join(', '); t = `Hold ${padActive ? 'RB' : 'X'} · tear down the ${pieceName(b)}${back ? ` (${back} back)` : ''}`; } }
  if (promptEl.firstChild.textContent !== t) promptEl.firstChild.textContent = t; promptEl.classList.toggle('hidden', !t); }

// ── Menu ─────────────────────────────────────────────────────────────
let sel = 0; const cards = document.getElementById('cards');
function buildMenu() {
CHARS.forEach((c, i) => { const d = document.createElement('div'); d.className = 'card'; d.innerHTML = `<canvas class="pv"></canvas><div class="sw" style="background:#${c.color.toString(16).padStart(6, '0')}"></div><b>${c.title}</b><small>${c.player} · ${i + 1}</small><p>${c.desc}<br>${c.maxHp} HP · ${c.atk}</p>`;
  d.onclick = () => selectCard(i); d.ondblclick = () => startGame(i); cards.appendChild(d); });
selectCard(0);
document.getElementById('go').onclick = () => startGame(sel);
}
function selectCard(i) { if (i !== sel) logEvent('menu-pick', { ch: CHARS[i].id }); sel = i; [...cards.children].forEach((c, k) => c.classList.toggle('sel', k === i)); }
export function menuPad() { const p = readPad(); if (!p) return; if (p.left) selectCard((sel + 4) % 5); if (p.right) selectCard((sel + 1) % 5); if (p.jump) startGame(sel); }

export const isRunning = () => running;
export const scene3 = () => scene;
export { log };
export const selected = () => sel;
export const getCamMode = () => camMode;
export const isPadActive = () => padActive;
export const liveShots = () => shots; // (for the checks)
// where the player aims on the ground, min to max metres off (build mode's ghost goes there, slice 12): the crosshair's
// ray in the first and angled cameras, the mouse in the top camera, else straight ahead
export function aimGround(min = 1.6, max = 6) { const clampTo = (x, z) => { const dx = x - player.x, dz = z - player.z, d = Math.hypot(dx, dz) || 1e-3, k = Math.min(max, Math.max(min, d)) / d; return { x: player.x + dx * k, z: player.z + dz * k }; };
  if (camMode === 'top') { const ray = new THREE.Raycaster(), hit = new THREE.Vector3(); ray.setFromCamera(mouseNDC, camera);
    if (!padActive && ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -player.y), hit)) return clampTo(hit.x, hit.z); }
  else { const o = camera.position, dir = new THREE.Vector3(), q = new THREE.Vector3(); camera.getWorldDirection(dir);
    for (let t = 0.5; t < 16; t += 0.25) { q.copy(o).addScaledVector(dir, t); if (q.y < groundY(q.x, q.z) + 0.05) return clampTo(q.x, q.z); } }
  const h = camMode === 'top' ? player.faceYaw : player.yaw; return clampTo(player.x - Math.sin(h) * max, player.z - Math.cos(h) * max); }
export function teleport(x, z) { player.x = x; player.z = z; player.y = Math.max(groundY(x, z), WATER_Y - 1.25); player.swimY = WATER_Y - 1.25; player.mantle = null; player.vy = 0; player.fallTop = null; snapCam = true; }
// test hook: hold a key (scripts/walktest.js drives the player through the real movement code)
export function press(code, on = true) { if (on) keys.add(code); else keys.delete(code); }
export function look(yaw, pitch) { player.yaw = yaw; player.pitch = pitch; player.faceYaw = yaw; snapCam = true; }
