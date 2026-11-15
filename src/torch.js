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
import { player, log } from './game.js';
import { others, gone } from './coop.js';
import { built, fireSpots } from './craft.js';
import { CAMP } from './config.js';
import { sfx } from './audio.js';
import { canvasTex } from './propmodels.js';
import { nightK } from './daynight.js';
// a flame's glow, painted rather than lit (the game allows only a few real lights, 3 on Medium, and the nearest fires take them):
// a soft halo round each torch flame, and under a wall torch a warm pool on the ground and the wall; both fade in with the night
let GLOW = null, POOL = null;
const radial = (stops) => canvasTex(128, 128, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); for (const [k, c] of stops) g.addColorStop(k, c); x.fillStyle = g; x.fillRect(0, 0, w, h); }, '#ff9a48'); // (an orange ground under the fading edge, so it never goes green)
function mats() { if (GLOW) return; GLOW = new THREE.SpriteMaterial({ map: radial([[0, 'rgba(255,190,110,0.9)'], [0.25, 'rgba(255,140,50,0.35)'], [1, 'rgba(255,110,30,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  POOL = new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(255,150,70,0.55)'], [0.5, 'rgba(255,120,40,0.18)'], [1, 'rgba(255,100,30,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, polygonOffset: true, polygonOffsetFactor: -4 }); }
export function halo(parent, size) { mats(); const s = new THREE.Sprite(GLOW); s.scale.setScalar(size); s.position.y = 0.12; s.renderOrder = 4; parent.add(s); return s; }
// a wall torch's light on the ground below it and on its wall (`mesh` is the torch in its own frame: +z out from the wall, at 1.6 m)
export function wallGlow(mesh, ground) { mats(); const p = new THREE.Mesh(new THREE.CircleGeometry(2.4, 24).rotateX(-Math.PI / 2), POOL); p.position.set(0, ground + 0.06, 0.9); p.renderOrder = 3; mesh.add(p);
  const w = new THREE.Mesh(new THREE.CircleGeometry(1.3, 20), POOL); w.position.set(0, 0.1, -0.05); w.renderOrder = 3; mesh.add(w); }

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

export function lightTorch() { const had = !!player.torch; player.torch = { fuel: TORCH_FUEL, on: true }; sfx('craft', null, 0.6);
  log(had ? 'A fresh torch, burning.' : 'You light a torch: it burns about a night. T puts it away; any fire lights it again.'); }
export function toggleTorch() { const t = player.torch; if (!t) { log('No torch: craft a hand torch (Tab) from wood and fiber.'); return; }
  if (t.fuel <= 0) { log('Your torch has burnt out: hold it by a fire to light it again.'); return; } if (!t.on && player.under) { log('Not under the water: surface first.'); return; } t.on = !t.on; sfx('toss', null, 0.3); log(t.on ? 'Torch out and burning.' : 'Torch put away.'); }

// the torch in a hand: a short stake, its head in pitch-soaked rags, burning
function handTorch() { const g = torchMesh(); g.scale.setScalar(0.38); const f = addFlame(g, 1.52, 0.6, 0); /* (no embers: up close they read as squares) */ halo(f.h, 2.2); g.traverse(m => { if (m.isMesh && !m.material.blending) m.castShadow = true; }); return g; }
// held in the left hand, but kept upright whatever the arm is doing (a flame leans with the wind, not with the wrist), tipped a
// little forward
const _q = new THREE.Quaternion(), _up = new THREE.Quaternion();
function hold(mesh, on) { const u = mesh?.userData; if (!u) return; if (on && !u.htorch) { u.htorch = handTorch(); attachGear(mesh, 'hand_l', u.htorch, [0, 0.05, 0]); }
  if (!u.htorch) return; u.htorch.visible = on; if (!on || !u.htorch.parent) return;
  u.htorch.parent.getWorldQuaternion(_q); _up.setFromEuler(new THREE.Euler(0.35, mesh.rotation.y, 0.5, 'YXZ')); /* (held out from the body, so it reads as carried) */ u.htorch.quaternion.copy(_q.invert().multiply(_up)); }
let fp = null;
// every frame: the local torch burns down, catches again by a fire; every carried torch shows (first person: one in view)
export function tickTorch(dt, camera, first) { const t = player.torch; if (GLOW) { const k = nightK(); GLOW.opacity = 0.25 + 0.75 * k; POOL.opacity = k; }
  if (t?.on && player.under) { t.on = false; sfx('splash', null, 0.3); log('Your torch hisses out under the water. T lights it again once you surface.'); } // (the quality pass: it burned on at the bottom of a lake)
  if (t?.on && !gone(player)) { t.fuel -= dt; /* (downed or dead: it does not burn) */ if (t.fuel <= 0) { t.fuel = 0; t.on = false; sfx('splash', null, 0.25); log('Your torch has burnt out. Hold it by a fire to light it again.'); } }
  if (t && t.fuel < TORCH_FUEL && !gone(player)) { const near = [{ x: CAMP.x, z: CAMP.z, r: 3 }, ...fireSpots().map(f => ({ ...f, r: 2.5 })), ...flames().filter(b => b.key !== 'campfire').map(b => ({ x: b.x, z: b.z, r: 1.6 }))].some(f => Math.hypot(player.x - f.x, player.z - f.z) < f.r);
    if (near) { if (t.fuel <= 0) { t.on = true; sfx('craft', null, 0.5); log('Your torch catches from the fire.'); } t.fuel = TORCH_FUEL; } }
  hold(player.mesh, !!player.torch?.on && !gone(player) && !first); for (const o of others.values()) hold(o.mesh, !!o.tc && !gone(o));
  if (!fp && camera) { fp = handTorch(); fp.scale.setScalar(0.3); fp.position.set(-0.46, -0.56, -0.86); fp.rotation.set(0.2, 0, 0.3); camera.add(fp); }
  if (fp) fp.visible = !!player.torch?.on && first && !gone(player); }
