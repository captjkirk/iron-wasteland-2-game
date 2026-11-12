// Fireflies (issue #27): small yellow-green lights that drift and blink over meadows, forest edges, the Bog and the
// Fungal Hollow after dusk; none by day, few in the cold and dry biomes. One additive Points draw, up to MAX of them
// on any preset (150 at most, cheap enough for Low). They live in a ring round the player and are re-placed when they
// fall out of it, so nothing is stored per world.
import * as THREE from 'three';
import { groundY, biomeAt } from './world.js';
import { nightK } from './daynight.js';
import { Q, WATER_Y } from './config.js';

// how thick the fireflies are in each biome (1 = the full count); the cold, bare ones get a few
const DENSITY = { grass: 1, swamp: 1, fungal: 0.6, tundra: 0.15, ruins: 0.15, waste: 0.1, desert: 0 };
const MAX = Q.grassDensity < 0.5 ? 60 : Q.grassDensity < 0.9 ? 110 : 150; // Low / Medium / High
const RING = 28;                                                           // metres round the player
let pts, pos, ph, siz, alive, wait, mat, tNow = 0;
const home = new Float32Array(MAX * 3);

export function initFireflies(scene) {
  pos = new Float32Array(MAX * 3); ph = new Float32Array(MAX); siz = new Float32Array(MAX); alive = new Uint8Array(MAX); wait = new Float32Array(MAX);
  for (let i = 0; i < MAX; i++) ph[i] = Math.random() * 6.283;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('phase', new THREE.BufferAttribute(ph, 1)); g.setAttribute('size', new THREE.BufferAttribute(siz, 1));
  mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uScale: { value: innerHeight / 2 }, uTime: { value: 0 } },
    vertexShader: `attribute float phase, size; varying float vA; uniform float uScale, uTime;
      void main(){ float b = smoothstep(.25, .85, sin(uTime * (1.3 + .5 * fract(phase)) + phase * 7.)); vA = b; // each one blinks on its own beat
        vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = max(5., size * uScale / -mv.z) * (.7 + .5 * b); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard; float k = (pow(1. - d * 2., 1.2) + .5 * step(d, .12)) * vA; gl_FragColor = vec4(vec3(.9, 1., .4) * k * 1.4, 1.); }` });
  pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.visible = false; scene.add(pts);
  addEventListener('resize', () => mat.uniforms.uScale.value = innerHeight / 2);
}
// put firefly i at a random spot in the ring if the biome's roll and the ground allow it (dry ground, or the Bog's shallows); false if not
function place(i, cx, cz) {
  {
    const a = Math.random() * 6.283, r = 6 + Math.random() * (RING - 6), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, b = biomeAt(x, z), y = groundY(x, z);
    if (Math.random() > (DENSITY[b] || 0) || y < WATER_Y - (b === 'swamp' ? 0.4 : -0.3)) return false; // one roll: the cold biomes' low density comes from most rolls failing
    home.set([x, y + 0.6 + Math.random() * 2.2, z], i * 3); pos.set([x, y + 1.2, z], i * 3); return true; }
  return false;
}
// one frame; cam: the camera's position (the ring follows the player's view)
export function tickFireflies(dt, cam, running) {
  if (!pts) return;
  tNow += dt; const k = running ? Math.min(1, Math.max(0, (nightK() - 0.35) / 0.4)) : 0, want = Math.round(MAX * k); // none by day, all of them by deep night
  pts.visible = want > 0; if (!pts.visible) { alive.fill(0); return; }
  mat.uniforms.uTime.value = tNow;
  for (let i = 0; i < MAX; i++) {
    wait[i] -= dt; const far = Math.hypot(home[i * 3] - cam.x, home[i * 3 + 2] - cam.z) > RING + 4;
    if (i >= want) { alive[i] = 0; siz[i] = 0; continue; }
    if ((!alive[i] && wait[i] <= 0) || far) { alive[i] = place(i, cam.x, cam.z) ? 1 : 0; if (!alive[i]) { wait[i] = 2 + Math.random() * 3; home.set([cam.x, 0, cam.z], i * 3); } } // (a failed roll tries again in 2 to 5 s)
    if (!alive[i]) { siz[i] = 0; continue; }
    const s = tNow * 0.35 + ph[i] * 5; // a slow, wandering drift round its spot
    pos[i * 3] = home[i * 3] + Math.sin(s) * 1.4; pos[i * 3 + 1] = home[i * 3 + 1] + Math.sin(s * 1.7) * 0.5; pos[i * 3 + 2] = home[i * 3 + 2] + Math.cos(s * 0.8) * 1.4;
    siz[i] = 0.2;
  }
  pts.geometry.attributes.position.needsUpdate = true; pts.geometry.attributes.size.needsUpdate = true;
}
export const fireflyStats = { max: MAX, lit: () => { let n = 0; for (let i = 0; i < MAX; i++) n += pts && pts.visible && alive[i] ? 1 : 0; return n; } };
