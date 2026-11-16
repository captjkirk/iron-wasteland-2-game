// Slice 26 (Jared, 2026-11-14: "would be nice to be able to put torches on walls, or carry a torch with you"): a hand torch,
// crafted from wood and fiber, is carried lit in the off hand. It throws a flickering light round you at night (one of the fire
// lights main.js hands out to the nearest flames: no new lights and no shadows, so the frame rate holds), the animals that fear
// fire notice you later (game.js), and it burns down in four minutes, about a night. By any fire (the camp's, a campfire, a
// torch) it catches again. T (a pad's d-pad left) puts it away (it stops burning) or takes it out; downed, it does not burn. Co-op: each game sends whether its torch is lit
// (`tc` in its `p` message, coop.js), and every game draws its friends' torches and their light.
import * as THREE from 'three';
import { addFlame } from './camp.js';
import { attachGear } from './characters.js';
import { torchMesh } from './craftmodels.js';
import { player, log, scene3 } from './game.js';
import { others, gone } from './coop.js';
import { built, fireSpots } from './craft.js';
import { CAMP } from './config.js';
import { sfx } from './audio.js';
import { canvasTex } from './propmodels.js';
import { nightK } from './daynight.js';
import { caveLights } from './caves.js';
import { groundY } from './world.js';
// a flame's glow, painted rather than lit (the game allows only a few real lights, 3 on Medium, and the nearest fires take them):
// a soft halo round each torch flame, and under a wall torch a warm pool on the ground and the wall; both fade in with the night
let GLOW = null, POOL = null, AURA = null;
const radial = (stops) => canvasTex(128, 128, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); for (const [k, c] of stops) g.addColorStop(k, c); x.fillStyle = g; x.fillRect(0, 0, w, h); }, '#ff9a48'); // (an orange ground under the fading edge, so it never goes green)
function mats() { if (GLOW) return; GLOW = new THREE.SpriteMaterial({ map: radial([[0, 'rgba(255,120,40,0.45)'], [0.25, 'rgba(255,100,30,0.28)'], [1, 'rgba(255,90,20,0)']]), /* (orange to the middle: a whiter core summed with the flame read white) */ blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false });
  POOL = new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(255,95,20,0.5)'], [0.3, 'rgba(255,85,15,0.3)'], [0.6, 'rgba(255,75,10,0.1)'], [1, 'rgba(255,70,10,0)']]), /* (deep orange and a long soft edge: a paler tint on snow summed to cream, and far off it read as a hard streak) */ blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, polygonOffset: true, polygonOffsetFactor: -4, fog: false, toneMapped: false }); // (no fog and no tone mapping: added light, fogged and tone-mapped, went grey-white far off)
  AURA = new THREE.SpriteMaterial({ map: radial([[0, 'rgba(255,110,30,0.35)'], [0.4, 'rgba(255,90,20,0.14)'], [1, 'rgba(255,80,15,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false }); const k = nightK(); GLOW.opacity = 0.25 + 0.75 * k; POOL.opacity = AURA.opacity = k; } // (at the night's strength from the first frame)
// a torch's light in the air round it, faint and wide: what reads from far off, where its pool on the ground is a thin line
export function aura(parent, x, y, z, size) { mats(); const s = new THREE.Sprite(AURA); s.scale.setScalar(size); s.position.set(x, y, z); s.renderOrder = 4; parent.add(s); return s; }
export function halo(parent, size) { mats(); const s = new THREE.Sprite(GLOW); s.scale.setScalar(size); s.position.y = 0.12; s.renderOrder = 4; parent.add(s); return s; }
// a warm pool of light on the ground, laid over the ground's own shape (`fit`, again when it moves): a flat disc sinks into a slope
export function groundGlow(parent, x, y, z, r) { mats(); const p = new THREE.Mesh(new THREE.RingGeometry(0, r, 20, 3).rotateX(-Math.PI / 2), POOL); p.position.set(x, y, z); p.renderOrder = 3; p.userData.glow = 1; parent.add(p); fit(p); return p; }
const _w = new THREE.Vector3(), _l = new THREE.Vector3();
export function fit(p) { const a = p.geometry.attributes.position; p.updateWorldMatrix(true, false); const inv = p.matrixWorld.clone().invert();
  for (let k = 0; k < a.count; k++) { _l.set(a.getX(k), 0, a.getZ(k)); _w.copy(_l).applyMatrix4(p.matrixWorld); _w.y = groundY(_w.x, _w.z) + 0.07; _w.applyMatrix4(inv); a.setY(k, _w.y); }
  a.needsUpdate = true; p.geometry.computeBoundingSphere(); }
// a wall torch's light on the ground below it and on its wall (`mesh` is the torch in its own frame: +z out from the wall, at 1.6 m)
// a torch taken down or fallen: its painted light goes out and its pool's shape is freed
export function freeGlow(mesh) { mesh?.traverse(o => { if (o.userData.glow) { o.geometry.dispose(); o.visible = false; } else if (o.isSprite && o.material === AURA) o.visible = false; }); }
export function wallGlow(mesh, ground) { groundGlow(mesh, 0, ground + 0.06, 0.9, 3.6); aura(mesh, 0, ground / 2, 0.7, 4.5);
  const w = new THREE.Mesh(new THREE.CircleGeometry(1.3, 20), POOL); w.position.set(0, 0.1, -0.05); w.renderOrder = 3; w.userData.glow = 1; mesh.add(w); }

export const TORCH_FUEL = 240; // seconds of burning (a night is about 230)
export const FEARS_FIRE = new Set(['wolf', 'dust_hound', 'rat']); // (a bear, a lurker or a crawler does not care)
export const torchOn = (q) => q === player ? !!player.torch?.on : !!q?.tc;
const carriers = () => [player, ...others.values()].filter(q => q && !gone(q) && torchOn(q));
// built flames: the standing torch, the wall torch, the campfire
const flames = () => built.filter(b => b.key === 'torch' || b.key === 'wall_torch' || b.key === 'campfire');
// for the night rule (game.js `warm`): a torch on a wall or a stake warms 1.5 m round it, for every animal
export const torchWarm = () => built.filter(b => b.key === 'torch' || b.key === 'wall_torch').map(b => ({ x: b.x, z: b.z, r: 1.5 }));
// a carried one warms its carrier, but only against the animals that fear fire (FEARS_FIRE): a bear keeps its night boost
export const carriedWarm = () => carriers().map(q => ({ x: q.x, z: q.z, r: 0 }));
// at night an animal that fears fire will not close on someone within 3.2 m of a built flame (game.js)
export const byFlame = (q) => flames().some(b => Math.hypot(b.x - q.x, b.z - q.z) < 3.2);
// the carried torches' light for main.js's fire lights (`who`: 'me' or the friend's id, for the checks)
export const torchLights = () => carriers().map(q => ({ x: q.x, y: q.y + 1.25, z: q.z, key: 'torch', i: 15, dist: 18, who: q === player ? 'me' : q.id }));

// D6 (Jared, November 15, 2026: "torches should have a timer of some kind and be able to be relit!"): while you carry a torch, how long
// it has left, in minutes and seconds beside a bar that shortens (words as well as length, never colour alone), and what to do when it
// is out. The one HUD piece the caves add, kept small, over the middle of the bottom row (built here, so index.html stays as it is)
let barEl = null, hudB = null;
function fuelBar(t, show) { if (!barEl) { barEl = document.createElement('div'); barEl.id = 'torch-fuel';
    barEl.style.cssText = 'position:fixed;left:50%;bottom:58px;transform:translateX(-50%);pointer-events:none;z-index:15;font:12px/1.2 ui-monospace,Menlo,monospace;color:var(--ink,#f3e6cc);text-shadow:0 1px 3px #000;display:none;align-items:center;gap:8px;letter-spacing:.04em';
    barEl.innerHTML = '<span></span><i style="display:block;width:110px;height:6px;border:1px solid rgba(243,230,204,.55);border-radius:3px;overflow:hidden"><b style="display:block;height:100%;background:var(--ink,#f3e6cc)"></b></i>'; document.body.appendChild(barEl); }
  barEl.style.display = show && t ? 'flex' : 'none'; if (!show || !t) return; const s = Math.ceil(t.fuel), clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  barEl.firstChild.textContent = t.fuel <= 0 ? 'Torch out: hold it by a fire or lantern' : `Torch ${clock}${t.on ? (t.fuel < 30 ? ' · low' : '') : ' · put away (T)'}`; barEl.querySelector('b').style.width = `${(t.fuel / TORCH_FUEL) * 100}%`; }
export const torchBar = () => barEl && barEl.style.display !== 'none' ? barEl.firstChild.textContent : null; // (for the checks)
export function lightTorch() { const had = !!player.torch; player.torch = { fuel: TORCH_FUEL, on: true }; sfx('craft', null, 0.6);
  log(had ? 'A fresh torch, burning.' : 'You light a torch: it burns about a night. T puts it away; any fire lights it again.'); }
export function toggleTorch() { const t = player.torch; if (!t) { log('No torch: craft a hand torch (Tab) from wood and fiber.'); return; }
  if (t.fuel <= 0) { log('Your torch has burnt out: hold it by a fire to light it again.'); return; } if (!t.on && player.under) { log('Not under the water: surface first.'); return; } t.on = !t.on; sfx('toss', null, 0.3); log(t.on ? 'Torch out and burning.' : 'Torch put away.'); }

// the torch in a hand: a short stake, its head in pitch-soaked rags, burning
function handTorch() { const g = torchMesh(); g.scale.setScalar(0.38); const f = addFlame(g, 1.52, 0.6, 0, true); /* (no embers: up close they read as squares) */ halo(f.h, 2.2); g.traverse(m => { if (m.isMesh && !m.material.blending) m.castShadow = true; }); return g; }
// held in the left hand, but kept upright whatever the arm is doing (a flame leans with the wind, not with the wrist), tipped a
// little forward
const _q = new THREE.Quaternion(), _up = new THREE.Quaternion();
function hold(mesh, on) { const u = mesh?.userData; if (!u) return; if (on && !u.htorch) { u.htorch = handTorch(); attachGear(mesh, 'hand_l', u.htorch, [0, 0.05, 0]); }
  if (!u.htorch) return; u.htorch.visible = on; if (!on || !u.htorch.parent) return;
  u.htorch.parent.getWorldQuaternion(_q); _up.setFromEuler(new THREE.Euler(0.35, mesh.rotation.y, 0.5, 'YXZ')); /* (held out from the body, so it reads as carried) */ u.htorch.quaternion.copy(_q.invert().multiply(_up)); }
let fp = null; const pools = new Map(); // (a carried torch's glow on the ground round its carrier: in the scene, so it shows in first person too)
// every frame: the local torch burns down, catches again by a fire; every carried torch shows (first person: one in view)
export function tickTorch(dt, camera, first, dark = nightK()) { const t = player.torch; if (GLOW) { const k = dark; /* (#8: a cave's dark too) */ GLOW.opacity = 0.25 + 0.75 * k; POOL.opacity = AURA.opacity = k; }
  if (t?.on && player.under) { t.on = false; sfx('splash', null, 0.3); log('Your torch hisses out under the water. T lights it again once you surface.'); } // (the quality pass: it burned on at the bottom of a lake)
  if (t?.on && !gone(player)) { t.fuel -= dt; /* (downed or dead: it does not burn) */ if (t.fuel <= 0) { t.fuel = 0; t.on = false; sfx('splash', null, 0.25); log('Your torch has burnt out. Hold it by a fire to light it again.'); } }
  if (t && t.fuel < TORCH_FUEL && !gone(player)) { const near = [{ x: CAMP.x, z: CAMP.z, r: 3 }, ...fireSpots().map(f => ({ ...f, r: 2.5 })), ...flames().filter(b => b.key !== 'campfire').map(b => ({ x: b.x, z: b.z, r: 1.6 })), ...caveLights().map(l => ({ x: l.x, z: l.z, r: 1.8 })), ...(t.fuel <= 0 ? [...others.values()].filter(q => !gone(q) && torchOn(q)).map(q => ({ x: q.x, z: q.z, r: 1.6 })) : [])].some( /* (a friend's torch lights an out one; it does not top two up forever) */ /* (#8: a cave's lanterns too, and a friend's lit torch: Jared, "A torch should be able to relight a torch") */f => Math.hypot(player.x - f.x, player.z - f.z) < f.r);
    // (it takes half a second held to the flame: Jared, ".5 second relight time cost")
    t.catchT = near ? (t.catchT || 0) + dt : 0; if (t.catchT >= 0.5) { t.catchT = 0; if (t.fuel <= 0) { t.on = true; sfx('craft', null, 0.5); log('Your torch catches from the flame.'); } t.fuel = TORCH_FUEL; } }
  else if (t) t.catchT = 0; // (away from a flame, or full: a later touch starts the half second again)
  const cs = carriers(); for (const [q, m] of pools) if (!cs.includes(q)) { m.removeFromParent(); m.geometry.dispose(); pools.delete(q); }
  for (const q of cs) { const m = pools.get(q) ?? pools.set(q, groundGlow(scene3(), 0, 0, 0, 4)).get(q); if (m.position.x !== q.x || m.position.z !== q.z) { m.position.set(q.x, q.y, q.z); fit(m); } }
  fuelBar(t, !(hudB ||= document.getElementById('hud-b'))?.classList.contains('hidden'));
  hold(player.mesh, !!player.torch?.on && !gone(player) && !first); for (const o of others.values()) hold(o.mesh, !!o.tc && !gone(o));
  if (!fp && camera) { fp = handTorch(); fp.scale.setScalar(0.3); fp.position.set(-0.46, -0.56, -0.86); fp.rotation.set(0.2, 0, 0.3); camera.add(fp); }
  if (fp) fp.visible = !!player.torch?.on && first && !gone(player); }
