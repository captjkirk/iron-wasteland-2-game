// The game's shared state: the player, the creatures, pickups, turrets, the bench upgrades, the 3D scene and the message
// log. Other modules read it from here; game.js re-exports all of it, so older imports from game.js keep working.
import { WATER_Y } from './config.js';
import { logEvent } from './playlog.js';

let scene, camera, renderer, env;
export function setScene(ctx) {
  ({ scene, camera, renderer, env } = ctx);
}

export const enemies = [];
export const pickups = [];
export const player = {
  ch: null,
  mesh: null,
  x: 0,
  z: 0,
  y: 0,
  vy: 0,
  yaw: 0,
  pitch: -0.15,
  hp: 1,
  onGround: true,
  atkT: 0,
  swing: 0,
  walk: 0,
  inv: { wood: 0, metal: 0, fiber: 0, food: 0 },
  up: {},
  kills: 0,
  hurtT: 0,
  faceYaw: 0,
  secT: 0,
  rallyT: 0,
  fan: 0,
  fanT: 0,
  swimY: WATER_Y - 1.25,
  breath: 1,
  under: false,
  mantle: null,
  climbing: false,
};
const logEl = document.getElementById('log');
const lines = [];
let msgs = 0;
function log(s) {
  // (every message shown is in the play log too, the first 400: a refused meal or an empty gun said why, review of November 16, 2026)
  if (++msgs <= 400)
    logEvent('msg', {
      s: String(s)
        .replace(/<[^>]*>/g, '')
        .slice(0, 140),
    });
  lines.push(s);
  if (lines.length > 5) lines.shift();
  logEl.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
}
export const upgraded = (id) => !!(player.up && player.up[id] && player.ch?.id === id);
// the Architect's auto-turret: a painted steel box on a tripod that turns to the nearest enemy within 12 m and fires every 0.8 s for 30 s (IW1: 18 damage)
export const turrets = [];
const nameOf = (q) => (q === player ? player.ch?.player : q?.name); // (a player's name, this game's or another's)
export const scene3 = () => scene;

export { scene, camera, renderer, env, log, nameOf };
