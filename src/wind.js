// Ticket 91 (Jared, November 16, 2026: "how hard would it be to add something like the effect of wind in the world? Nothing
// crazy, just adding some slight life to the world. And remember, be ambitious."): one wind for the whole world. Its direction
// and strength drift over minutes and gusts roll across the land downwind, all worked out from the shared day clock and the
// world's seed, so every co-op game sees the same wind with nothing sent. Grass, trees, leaves, weather, smoke, cloth and the
// wind sound all read it: the shaders through U (below), the rest through windAt and W.
// Calm most of the time, a breezy spell now and then, stronger in a dust storm or falling snow; it never moves the player.
import * as THREE from 'three';
import { SEED } from './config.js';

// the world's own offsets (mulberry32 of the seed), so two worlds do not share a wind
const R = (() => {
  let a = SEED >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
const S = Array.from({ length: 8 }, () => R() * 6.2832);
const sm = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

// t: the day clock in seconds ((day.n + day.t) * DAY_S, the same in every co-op game)
export const windAngle = (t) => S[0] + 0.9 * Math.sin(t / 310 + S[1]) + 0.45 * Math.sin(t / 127 + S[2]); // where it blows toward (radians: 0 is +x, then toward +z)
// how hard the land's wind blows (0 to 1) before the weather: a light breeze most of the time, a breezy spell every few minutes
export const windBase = (t) => {
  const spell = 0.5 + 0.5 * Math.sin(t / 173 + S[3]) * Math.sin(t / 61 + S[4]);
  return 0.2 + 0.06 * Math.sin(t / 37 + S[5]) + 0.45 * sm(0.55, 0.9, spell);
};
// how gusty it is now (0.35 to 1): gusts come and go in spells of a minute or so
export const gustiness = (t) => 0.675 + 0.325 * Math.sin(t / 23 + S[6]) * Math.sin(t / 9.7 + S[7]);
// the gust passing over (x, z) at t (0 to 1): long waves rolling downwind at about 7 m/s, broken up across the wind.
// The same sum is in GLSL below (GUST): change both together.
export function gustAt(x, z, t, ang = windAngle(t)) {
  const dx = Math.cos(ang),
    dz = Math.sin(ang),
    a = x * dx + z * dz,
    b = -x * dz + z * dx;
  const g = 0.5 + 0.3 * Math.sin(a * 0.05 - t * 0.35) + 0.2 * Math.sin(a * 0.11 - t * 0.77 + b * 0.04 + 1.3);
  return sm(0.45, 1, g) * (0.55 + 0.45 * Math.sin(b * 0.025 + a * 0.012 + 2.1));
}

const WRAP = (400 * 2 * Math.PI) / 0.07; // (0.35 and 0.77 are 5 and 11 times 0.07: about 10 hours)
// the wind now, round the camera (tickWind): what the shaders, the weather, the smoke and the sound read
export const W = {
  t: 0,
  angle: 0,
  dir: new THREE.Vector2(1, 0),
  base: 0.2,
  boost: 0,
  strength: 0.2,
  gusty: 0.5,
  here: 0,
  off: false,
};
// the shaders' uniforms, shared by every material that sways (grass.js, trees.js, camp.js, props)
export const U = { uWindDir: { value: W.dir }, uWindS: { value: 0.2 }, uWindG: { value: 0.5 }, uWindT: { value: 0 } };
// the gust at a world point, in GLSL (the twin of gustAt): needs U's uniforms declared (DECL)
export const DECL = 'uniform vec2 uWindDir; uniform float uWindS, uWindG, uWindT;\n';
export const GUST = `
  float iwGust(vec2 p) { vec2 d = uWindDir; float a = dot(p, d), b = dot(p, vec2(-d.y, d.x));
    float g = 0.5 + 0.3 * sin(a * 0.05 - uWindT * 0.35) + 0.2 * sin(a * 0.11 - uWindT * 0.77 + b * 0.04 + 1.3);
    return smoothstep(0.45, 1.0, g) * (0.55 + 0.45 * sin(b * 0.025 + a * 0.012 + 2.1)); }
  float iwWind(vec2 p) { return uWindS * (0.3 + 0.7 * iwGust(p) * uWindG); }
  // (the trees' cheaper reading, for the frame rate: the same rolling gusts without the patchiness across the wind, two sines not three)
  float iwWindLite(vec2 p) { float a = dot(p, uWindDir), g = 0.5 + 0.3 * sin(a * 0.05 - uWindT * 0.35) + 0.2 * sin(a * 0.11 - uWindT * 0.77 + 1.3);
    return uWindS * (0.3 + 0.55 * smoothstep(0.45, 1.0, g) * uWindG); }\n`;
// how hard it blows at (x, z): the twin of iwWind
export const windAt = (x, z) => (W.off ? 0 : W.strength * (0.3 + 0.7 * gustAt(x, z, W.t, W.angle) * W.gusty));
// in metres a second (for what it carries): about 2 m/s in a calm, 10 in a storm
export const windSpeed = (x, z) => 1 + 9 * windAt(x, z);

// still water's ripples drift downwind (environment.js): metres blown so far, summed frame by frame so a turn of the wind never jumps
// (wrapped every 10 km, a jump of the ripples about once in five hours of play)
export const DRIFT = { value: new THREE.Vector2() };
let lastT = null;
// each frame: t the day clock in seconds; boost what the weather adds round the camera (a dust storm, snow); off in a cave
export function tickWind(t, cam, boost = 0, off = false) {
  W.t = t;
  W.angle = windAngle(t);
  W.dir.set(Math.cos(W.angle), Math.sin(W.angle));
  W.base = windBase(t);
  W.boost = boost;
  W.off = off;
  W.strength = off ? 0 : Math.min(1, W.base + boost);
  W.gusty = gustiness(t);
  W.here = windAt(cam.x, cam.z);
  const dt = lastT === null ? 0 : Math.min(0.1, Math.max(0, t - lastT));
  lastT = t;
  const d = DRIFT.value;
  d.x = (d.x + W.dir.x * (0.15 + 0.9 * W.here) * dt) % 10000;
  d.y = (d.y + W.dir.y * (0.15 + 0.9 * W.here) * dt) % 10000;
  U.uWindS.value = W.strength;
  U.uWindG.value = W.gusty;
  U.uWindT.value = t % WRAP; // (wrapped for the graphics card's precision, on a whole number of both gust waves' periods: the gusts never jump; the sway's own beats shuffle once, every 60 game days)
}
// how a fresh material joins the wind: its shader gets the uniforms and the gust function
export function windShader(sh) {
  Object.assign(sh.uniforms, U);
  return DECL + GUST;
}
