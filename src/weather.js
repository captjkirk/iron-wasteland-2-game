// Weather per biome (slice 13): snow falling over the Frostline, dust blowing through the Waste and the desert with a storm
// now and then (the fog closes in brown), spores drifting up in the fungal wood (the Bog's mist is its fog, bog.js). Each
// is a cloud of points wrapped round the camera, moved on the graphics card; how much shows follows the biome under the
// camera and a slow swell over time. Each game draws its own (it is only a look, and it matches: the same clock).
import * as THREE from 'three';
import { biomeW, forestAt } from './world.js';
import { Q } from './config.js';
import { skyLight } from './environment.js';
import { W as WIND, windSpeed } from './wind.js';

const BOX = 40,
  KINDS = {
    snow: { n: 5000, fall: -1.6, carry: 0.4, sway: 0.6, size: 0.13, color: 0xf2f6ff, biomes: ['tundra'] },
    dust: {
      n: 9000,
      fall: -0.2,
      carry: 0.9,
      sway: 1.4,
      size: 0.1,
      color: 0xc8a878,
      lift: 0.4, // (lift: some of its own light, so blown dust is not black specks against a dusk sky, the owner's play 2026-11-04)
      biomes: ['waste', 'desert'],
    },
    spores: {
      n: 2400,
      fall: 0.35,
      carry: 0.08,
      sway: 0.8,
      size: 0.085,
      color: 0xa8ff9a,
      biomes: ['fungal'],
      glow: true,
    },
    // ticket 91: what the wind carries near the ground, by land (motes: a low band round the camera, few in a calm, more in a gust;
    // Low draws none): leaves tumbling off the green lands' trees, sand grains over the Waste and the desert, snow grains on the Frostline
    leaves: {
      n: 700,
      fall: -0.45,
      carry: 0.75,
      sway: 1.1,
      size: 0.055,
      color: 0x7a8a3a,
      color2: 0xb08a40,
      biomes: ['grass', 'swamp', 'ruins'],
      motes: 8,
      tumble: 1,
    },
    sand: {
      n: 1800,
      fall: -0.15,
      carry: 1.0,
      sway: 0.4,
      size: 0.035,
      color: 0xc8b088,
      biomes: ['desert', 'waste'],
      motes: 4,
      lift: 0.3,
    },
    grains: { n: 1400, fall: -0.3, carry: 1.0, sway: 0.4, size: 0.035, color: 0xf2f6ff, biomes: ['tundra'], motes: 4 },
  };
if (Q.label === 'Low') for (const k in KINDS) if (KINDS[k].motes) delete KINDS[k];
// (uH, uLow: the height of the band round the camera, and how much of it is below the camera; uDen: the share of points shown;
// uTumble: a leaf turns over as it goes, flat then edge-on)
const VS = `uniform float uTime, uSize, uSway, uH, uLow, uDen, uTumble, uNear; uniform vec3 uCam, uOff; attribute float aSeed; varying float vA, vSeed, vRot;
  void main() { vec3 p = mod(position + uOff - uCam + ${BOX / 2}.0, ${BOX}.0) - ${BOX / 2}.0; p.y = mod(position.y / ${BOX}.0 * uH + uOff.y - uCam.y + uH * uLow, uH) - uH * uLow;
    p.x += sin(uTime * 0.9 + aSeed * 40.0) * uSway; p.z += cos(uTime * 0.7 + aSeed * 31.0) * uSway; p += uCam;
    vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
    float d = length(p - uCam); vA = smoothstep(${BOX / 2}.0, ${BOX / 2 - 8}.0, d) * smoothstep(uNear, uNear * 3.0, d); // fades at the box's edge and right at the lens (a carried leaf further off: up close it filled the view)
    vA *= step(aSeed, uDen); vSeed = fract(aSeed * 13.7); vRot = uTime * (2.0 + vSeed * 3.0) + aSeed * 40.0;
    gl_PointSize = uSize * 700.0 / -mv.z * (0.6 + aSeed * 0.8) * mix(1.0, 0.45 + 0.55 * abs(sin(vRot * 1.7)), uTumble); }`;
const FS = `uniform vec3 uColor, uColor2, uSky; uniform float uA, uGlow, uTumble; varying float vA, vSeed, vRot;
  void main() { vec2 c = gl_PointCoord - 0.5; float cr = cos(vRot), sr = sin(vRot); c = mix(c, mat2(cr, -sr, sr, cr) * c * vec2(1.0, 2.4), uTumble); float r = dot(c, c); if (r > 0.25) discard;
    gl_FragColor = vec4(mix(uColor, uColor2, vSeed) * mix(uSky, vec3(1.0), uGlow), uA * vA * mix(1.0 - r * 4.0, 1.0, uTumble)); }`;
const sets = [];
export function buildWeather(scene) {
  for (const [name, k] of Object.entries(KINDS)) {
    const pos = new Float32Array(k.n * 3),
      seed = new Float32Array(k.n);
    for (let i = 0; i < k.n; i++) {
      pos[i * 3] = Math.random() * BOX;
      pos[i * 3 + 1] = Math.random() * BOX;
      pos[i * 3 + 2] = Math.random() * BOX;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      blending: k.glow ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: k.size },
        uSway: { value: k.sway },
        uCam: { value: new THREE.Vector3() },
        uOff: { value: new THREE.Vector3() },
        uH: { value: k.motes || BOX },
        uLow: { value: k.motes ? 0.3 : 0.5 },
        uNear: { value: k.motes ? 2.5 : 0.6 },
        uDen: { value: 1 },
        uTumble: { value: k.tumble || 0 },
        uColor2: { value: new THREE.Color(k.color2 ?? k.color) },
        uColor: { value: new THREE.Color(k.color) },
        uSky: skyLight,
        uA: { value: 0 },
        uGlow: { value: k.glow ? 0.7 : k.lift || 0 },
      },
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.visible = false;
    pts.name = 'weather ' + name;
    scene.add(pts);
    sets.push({ name, k, pts, m, w: 0 });
  }
}
// how strong each is now (0 to 1) over time: snow swells and eases, dust storms blow up now and then, spores are steady
const swell = {
  snow: (t) => 0.45 + 0.55 * Math.max(0, Math.sin(t / 80)),
  dust: (t) => 0.25 + 0.75 * storm(t),
  spores: () => 0.8,
  leaves: () => 1,
  sand: () => 1,
  grains: () => 1,
};
export const storm = (t) => {
  const v = 0.5 + 0.5 * Math.sin(t / 70) * Math.sin(t / 23 + 1);
  return Math.min(1, Math.max(0, (v - 0.55) / 0.3));
};
const DUST = new THREE.Color(0x9a7a56),
  SNOW = new THREE.Color(0xc8d2dc);
// each frame: t is the day clock in seconds (the same in every co-op game); the fog closes in through a dust storm or heavy snow
export const W = { wind: 0, boost: 0 }; // the wind the weather adds to the wind sound (game.js), and to the world wind (wind.js)
// ticket 91: each kind is carried on the world wind (wind.js), so snow, dust and spores go the way the grass and the trees lean;
// the distance blown is summed frame by frame (uOff), so a change of wind turns them without a jump
let lastT = null;
export function tickWeather(t, cam, fog, nk, haze) {
  let wind = 0,
    hz = 0,
    boost = 0;
  const dt = lastT === null ? 0 : Math.min(0.1, Math.max(0, t - lastT));
  lastT = t;
  const sp = windSpeed(cam.x, cam.z);
  for (const s of sets) {
    const o = s.m.uniforms.uOff.value;
    o.x = (o.x + WIND.dir.x * sp * s.k.carry * dt) % BOX;
    o.y = (o.y + s.k.fall * dt) % BOX;
    o.z = (o.z + WIND.dir.y * sp * s.k.carry * dt) % BOX;
    const w =
        Math.max(...s.k.biomes.map((b) => biomeW(cam.x, cam.z, b))) *
        (s.k.tumble ? 0.25 + 0.75 * forestAt(cam.x, cam.z) : 1),
      a = WIND.off ? 0 : w * swell[s.name](t);
    s.w += (a - s.w) * 0.02;
    if (s.k.motes) s.m.uniforms.uDen.value = 0.1 + 0.9 * Math.min(1, WIND.here * 1.6); // (sparse in a calm, more in a gust: the wind round the camera)
    s.pts.visible = s.w > 0.02;
    if (!s.pts.visible) continue;
    s.m.uniforms.uTime.value = t;
    s.m.uniforms.uCam.value.copy(cam);
    s.m.uniforms.uA.value = Math.min(1, s.w * 1.2) * (s.name === 'spores' ? 0.5 + 0.5 * nk : 0.85);
    if (s.name === 'dust') {
      const k = Math.min(1, s.w * storm(t) * 1.4);
      fog.near *= 1 - 0.97 * k;
      fog.far *= 1 - 0.96 * k;
      fog.color.lerp(c.copy(DUST).multiply(skyLight.value), k * 0.9);
      wind += k * 0.12;
      hz = Math.max(hz, k * 0.9);
      boost += k * 0.7;
    }
    if (s.name === 'snow') {
      const k = s.w * Math.max(0, Math.sin(t / 80));
      fog.near *= 1 - 0.8 * k;
      fog.far *= 1 - 0.72 * k;
      fog.color.lerp(c.copy(SNOW).multiply(skyLight.value), k * 0.7);
      wind += k * 0.05;
      hz = Math.max(hz, k * 0.6);
      boost += k * 0.35;
    }
  }
  haze(fog.color, hz); // the sky goes into the same haze (the sky takes no fog)
  W.wind = wind;
  W.boost = boost;
}
const c = new THREE.Color();
