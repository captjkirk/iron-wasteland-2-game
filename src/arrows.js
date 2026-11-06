// Abigail's arrows (slice 11; the owner, 2026-11-03: "arrows dont show up stuck into things when fired- would be cool to
// have a limited number of arrows BUT they can be retrieved from corpses or terrain or scenery, or crafted").
// A limited quiver; an arrow that lands stays where it struck (ground, a trunk, a rock, a wall, a creature), and she
// picks it back up by walking over it; the ones in a creature fall beside its body when it dies. Recipes.js crafts more.
// Each game keeps its own (its quiver and its spent arrows); another player's arrows stick here too, and fade.
import * as THREE from 'three';
import { WATER_Y } from './config.js';
import { groundY } from './world.js';
import { floatText, splash } from './effects.js';
import { sfx } from './audio.js';
import { logEvent } from './playlog.js';
import { player, scene3 } from './game.js';
import { rng } from './noise.js';

export const quiver = { n: 20, max: 30, start: 20 };
const stuck = []; // { m, own, t, on: the creature it is in (its model carries it) or null }
export const stuckArrows = () => stuck;
// one arrow from the quiver (only the Ranger counts them); false when it is empty
export function useArrow() { if (player.ch?.id !== 'ranger') return true; if (quiver.n <= 0) return false; quiver.n--; return true; }
function drop(i) { const a = stuck[i]; a.m.removeFromParent(); stuck.splice(i, 1); }
// the arrow m, flying along dir, struck at `at` (on the surface): its tip goes 0.16 m in; in a creature it moves with it
export function stick(m, at, dir, own, enemy = null) {
  if (at.y < WATER_Y - 0.2 && !enemy) { splash(at, 8); m.removeFromParent(); return; } // into the water: gone
  m.position.copy(at).addScaledVector(dir, -0.24); m.lookAt(m.position.clone().add(dir));
  if (enemy) enemy.mesh.attach(m); stuck.push({ m, own, t: 0, on: enemy }); sfx('thunk', at, 0.5);
  while (stuck.length > 80) drop(0); }
// a creature's arrows fall beside its body (called as the body starts to sink, or when it is cleared away)
export function dropFrom(e) { for (const a of stuck) if (a.on === e) { a.on = null; scene3().attach(a.m);
  const x = e.x + (rng() - 0.5) * 1.2, z = e.z + (rng() - 0.5) * 1.2, yaw = rng() * 6.28, d = new THREE.Vector3(Math.cos(yaw), -0.3, Math.sin(yaw)).normalize();
  a.m.position.set(x, groundY(x, z) + 0.08, z).addScaledVector(d, -0.24); a.m.lookAt(a.m.position.clone().add(d)); } }
export function clearArrows() { while (stuck.length) drop(0); }
// every frame: the Ranger picks up her own spent arrows within reach; another game's arrows fade after 15 s
export function tickArrows(dt) { let got = 0; const can = player.ch?.id === 'ranger' && !player.dead && !(player.down > 0);
  for (let i = stuck.length - 1; i >= 0; i--) { const a = stuck[i]; a.t += dt;
    if (!a.own) { if (a.t > 15) drop(i); continue; }
    if (a.on) { if (a.on.gone) drop(i); continue; }
    const p = a.m.position; if (can && quiver.n < quiver.max && Math.hypot(p.x - player.x, p.z - player.z) < 1.4 && Math.abs(p.y - player.y - 0.8) < 1.8) { quiver.n++; got++; drop(i); } }
  if (got) { sfx('pickup', null, 0.5); floatText(new THREE.Vector3(player.x, player.y + 2, player.z), `+${got} arrow${got > 1 ? 's' : ''}`, '#efe6b0'); logEvent('arrows-back', { n: got, quiver: quiver.n }); } }
