// Weather per biome (slice 13): snow falling over the Frostline, dust blowing through the Waste and the desert with a storm
// now and then (the fog closes in brown), spores drifting up in the fungal wood (the Bog's mist is its fog, bog.js). Each
// is a cloud of points wrapped round the camera, moved on the graphics card; how much shows follows the biome under the
// camera and a slow swell over time. Each game draws its own (it is only a look, and it matches: the same clock).
import * as THREE from 'three';
import { biomeW } from './world.js';
import { skyLight } from './environment.js';

const BOX = 40, KINDS = {
  snow: { n: 5000, vel: [0.4, -1.6, 0.2], sway: 0.6, size: 0.13, color: 0xf2f6ff, biomes: ['tundra'] },
  dust: { n: 9000, vel: [7.5, -0.2, 2.5], sway: 1.4, size: 0.1, color: 0xc8a878, lift: 0.4, // (lift: some of its own light, so blown dust is not black specks against a dusk sky, the owner's play 2026-11-04)
    biomes: ['waste', 'desert'] },
  spores: { n: 2400, vel: [0.15, 0.35, 0.1], sway: 0.8, size: 0.085, color: 0xa8ff9a, biomes: ['fungal'], glow: true } };
const VS = `uniform float uTime, uSize, uSway; uniform vec3 uCam, uVel; attribute float aSeed; varying float vA;
  void main() { vec3 p = mod(position + uVel * uTime - uCam + ${BOX / 2}.0, ${BOX}.0) - ${BOX / 2}.0;
    p.x += sin(uTime * 0.9 + aSeed * 40.0) * uSway; p.z += cos(uTime * 0.7 + aSeed * 31.0) * uSway; p += uCam;
    vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
    float d = length(p - uCam); vA = smoothstep(${BOX / 2}.0, ${BOX / 2 - 8}.0, d) * smoothstep(0.6, 2.0, d); // fades at the box's edge and right at the lens
    gl_PointSize = uSize * 700.0 / -mv.z * (0.6 + aSeed * 0.8); }`;
const FS = `uniform vec3 uColor, uSky; uniform float uA, uGlow; varying float vA;
  void main() { vec2 c = gl_PointCoord - 0.5; float r = dot(c, c); if (r > 0.25) discard;
    gl_FragColor = vec4(uColor * mix(uSky, vec3(1.0), uGlow), uA * vA * (1.0 - r * 4.0)); }`;
const sets = [];
export function buildWeather(scene) {
  for (const [name, k] of Object.entries(KINDS)) { const pos = new Float32Array(k.n * 3), seed = new Float32Array(k.n);
    for (let i = 0; i < k.n; i++) { pos[i * 3] = Math.random() * BOX; pos[i * 3 + 1] = Math.random() * BOX; pos[i * 3 + 2] = Math.random() * BOX; seed[i] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: k.glow ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uTime: { value: 0 }, uSize: { value: k.size }, uSway: { value: k.sway }, uCam: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3(...k.vel) },
        uColor: { value: new THREE.Color(k.color) }, uSky: skyLight, uA: { value: 0 }, uGlow: { value: k.glow ? 0.7 : k.lift || 0 } } });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.visible = false; pts.name = 'weather ' + name; scene.add(pts); sets.push({ name, k, pts, m, w: 0 }); }
}
// how strong each is now (0 to 1) over time: snow swells and eases, dust storms blow up now and then, spores are steady
const swell = { snow: (t) => 0.45 + 0.55 * Math.max(0, Math.sin(t / 80)), dust: (t) => 0.25 + 0.75 * storm(t), spores: () => 0.8 };
export const storm = (t) => { const v = 0.5 + 0.5 * Math.sin(t / 70) * Math.sin(t / 23 + 1); return Math.min(1, Math.max(0, (v - 0.55) / 0.3)); };
const DUST = new THREE.Color(0x9a7a56), SNOW = new THREE.Color(0xc8d2dc);
// each frame: t is the day clock in seconds (the same in every co-op game); the fog closes in through a dust storm or heavy snow
export const W = { wind: 0 }; // the wind the weather adds to the wind sound (game.js)
export function tickWeather(t, cam, fog, nk, haze) { let wind = 0, hz = 0;
  for (const s of sets) { const w = Math.max(...s.k.biomes.map(b => biomeW(cam.x, cam.z, b))), a = w * swell[s.name](t); s.w += (a - s.w) * 0.02;
    s.pts.visible = s.w > 0.02; if (!s.pts.visible) continue; s.m.uniforms.uTime.value = t; s.m.uniforms.uCam.value.copy(cam); s.m.uniforms.uA.value = Math.min(1, s.w * 1.2) * (s.name === 'spores' ? 0.5 + 0.5 * nk : 0.85);
    if (s.name === 'dust') { const k = Math.min(1, s.w * storm(t) * 1.4); fog.near *= 1 - 0.97 * k; fog.far *= 1 - 0.96 * k; fog.color.lerp(c.copy(DUST).multiply(skyLight.value), k * 0.9); wind += k * 0.12; hz = Math.max(hz, k * 0.9); }
    if (s.name === 'snow') { const k = s.w * Math.max(0, Math.sin(t / 80)); fog.near *= 1 - 0.8 * k; fog.far *= 1 - 0.72 * k; fog.color.lerp(c.copy(SNOW).multiply(skyLight.value), k * 0.7); wind += k * 0.05; hz = Math.max(hz, k * 0.6); } }
  haze(fog.color, hz); // the sky goes into the same haze (the sky takes no fog)
  W.wind = wind; }
const c = new THREE.Color();
