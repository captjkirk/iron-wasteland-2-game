// ── Tracks (slice 43, issue #81; IW1's src/tracks.js): the prints walkers leave on the ground ──
// Players and raiders leave boot prints, left and right foot in turn; bears and wolves leave paw prints, spiders a scatter of
// leg dots. The ground under a print sets how long it lasts and how dark it is, as in IW1: snow 60 s, mud 45 s, sand and dirt
// 30 s, grass 20 s, stone 15 s (a blend of grounds, a blend of both); water and floors take none. A print holds, then fades over
// the last quarter of its life. Every machine lays the prints of everyone it sees (its own player, the others, the creatures),
// so co-op needs no messages. The cost is flat: one fixed ring of CAP prints (by quality) in a single draw; a new print takes
// the oldest slot, and a print's fade runs on the graphics chip from its birth time, so nothing is touched per print per frame.
import * as THREE from 'three';
import { HALF, CELL, SEG, N, WATER_Y, Q } from './config.js';
import { groundY, SPLAT_A, SPLAT_B, SPLAT_C } from './world.js';

// per ground layer (world.js order: grass, forest, dirt, rock, sand, snow, mud, paving, gravel, moss)
const LIFE = [20, 20, 30, 15, 30, 60, 45, 15, 15, 20],
  DARK = [0.2, 0.22, 0.34, 0.08, 0.42, 0.62, 0.78, 0.08, 0.12, 0.24];
const TINT = [0x2b2219, 0x2b2219, 0x2b2219, 0x2b2219, 0x6e5232, 0x5f6f88, 0x140b04, 0x2b2219, 0x2b2219, 0x2b2219]; // (snow: a blue-grey hollow; mud: wet and dark; sand: a darker sand)
// who leaves what: atlas cell, print size (m), stride (m), feet apart (m)
const BOOT = { cell: 0, w: 0.42, l: 0.42, stride: 0.75, gait: 0.13 } /* (the sole fills about half its cell's width) */,
  KIND = {
    bear: { cell: 1, w: 0.36, l: 0.4, stride: 0.95, gait: 0.3 },
    wolf: { cell: 1, w: 0.16, l: 0.18, stride: 0.6, gait: 0.1 },
    spider: { cell: 2, w: 0.5, l: 0.5, stride: 0.7, gait: 0.12 },
    spider_pale: { cell: 2, w: 0.45, l: 0.45, stride: 0.7, gait: 0.12 },
    spider_widow: { cell: 2, w: 0.38, l: 0.38, stride: 0.6, gait: 0.1 },
    spider_brute: { cell: 2, w: 0.75, l: 0.75, stride: 0.95, gait: 0.16 },
    brawler: BOOT,
    shooter: BOOT,
    heavy: BOOT,
  };
const FADE = 0.25;

let mesh = null,
  next = 0,
  CAP = 0;
const at = new WeakMap(),
  _m = new THREE.Matrix4(),
  _c = new THREE.Color(),
  _x = new THREE.Vector3(),
  _y = new THREE.Vector3(),
  _z = new THREE.Vector3();
const stats = { placed: 0, water: 0 };

function atlas() {
  // three 64 px cells, white shapes on clear: a boot sole, a paw, a spider's leg dots (toe toward +y)
  const cv = document.createElement('canvas');
  cv.width = 192;
  cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  const blob = (x, y, rx, ry) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  };
  g.filter = 'blur(1.2px)'; // (soft edges: pressed in, not painted on)
  // the boot (a right one; the left is it mirrored): a wide toe leaning to the big-toe side, a narrow arch, a separate heel block,
  // densest in the middle; its tread a little lighter
  const sole = g.createRadialGradient(31, 22, 3, 31, 22, 18);
  sole.addColorStop(0, '#fff');
  sole.addColorStop(1, 'rgba(255,255,255,0.72)');
  g.fillStyle = sole;
  g.beginPath();
  g.ellipse(30, 19, 13, 15, -0.14, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(21, 28);
  g.quadraticCurveTo(27, 38, 25, 42);
  g.lineTo(37, 42);
  g.quadraticCurveTo(37, 34, 42, 26);
  g.closePath();
  g.fill(); // (the arch)
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.roundRect(22, 45, 19, 16, 7);
  g.fill(); // (the heel)
  g.filter = 'none';
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let k = 0; k < 6; k++) g.fillRect(18, 7 + k * 5, 26, 1.6);
  for (let k = 0; k < 3; k++) g.fillRect(22, 48 + k * 5, 19, 1.6);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#fff';
  g.filter = 'blur(1px)';
  blob(96, 42, 15, 13);
  for (const [dx, dy] of [
    [-15, 22],
    [-5, 17],
    [5, 17],
    [15, 22],
  ])
    blob(96 + dx, 42 - dy, 5, 6); // the paw: a pad and four toes
  for (const [dx, dy] of [
    [-22, -18],
    [-26, -4],
    [-24, 10],
    [-18, 22],
    [22, -18],
    [26, -4],
    [24, 10],
    [18, 22],
  ])
    blob(160 + dx, 32 + dy, 3.5, 3.5); // eight leg tips
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function build(scene) {
  CAP = Q.tracks;
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); // (flat, toe toward -z: the walk direction)
  const born = new Float32Array(CAP).fill(-1e9),
    life = new Float32Array(CAP).fill(1),
    dark = new Float32Array(CAP),
    cell = new Float32Array(CAP);
  geo.setAttribute('aBorn', new THREE.InstancedBufferAttribute(born, 1));
  geo.setAttribute('aLife', new THREE.InstancedBufferAttribute(life, 1));
  geo.setAttribute('aDark', new THREE.InstancedBufferAttribute(dark, 1));
  geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 1));
  const mat = new THREE.MeshLambertMaterial({
    map: atlas(),
    transparent: true,
    depthWrite: false,
    /* (lit like the ground: dark at night, warm by a fire) */ polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const uT = { value: 0 };
  mat.onBeforeCompile = (s) => {
    s.uniforms.uT = uT;
    s.vertexShader =
      'attribute float aBorn, aLife, aDark, aCell; uniform float uT; varying float vA;\n' +
      s.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>\n  vMapUv = vec2((abs(aCell) - 1.0 + (aCell < 0.0 ? 1.0 - uv.x : uv.x)) / 3.0, uv.y); /* (a negative cell: the left foot, the right one mirrored) */\n  { float age = uT - aBorn, left = aLife - age; vA = age < -0.05 || left <= 0.0 ? 0.0 : aDark * min(1.0, left / (aLife * ${FADE})); }`,
      );
    s.fragmentShader =
      'varying float vA;\n' +
      s.fragmentShader.replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n  diffuseColor.a *= vA; if (diffuseColor.a < 0.004) discard;',
      );
  };
  mesh = new THREE.InstancedMesh(geo, mat, CAP);
  mesh.userData.uT = uT;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.name = 'tracks';
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
  for (let k = 0; k < CAP; k++) mesh.setMatrixAt(k, _m.makeScale(0, 0, 0));
  scene.add(mesh);
}

// the ground at a spot: its blend of layers (nearest grid point), and so how long a print lasts there, how dark, what tint
export function groundOf(x, z) {
  const i = Math.min(SEG, Math.max(0, Math.round((x + HALF) / CELL))),
    j = Math.min(SEG, Math.max(0, Math.round((z + HALF) / CELL))),
    k = (j * N + i) * 4;
  const w = [
    SPLAT_A[k],
    SPLAT_A[k + 1],
    SPLAT_A[k + 2],
    SPLAT_A[k + 3],
    SPLAT_B[k],
    SPLAT_B[k + 1],
    SPLAT_B[k + 2],
    SPLAT_C[k],
    SPLAT_C[k + 1],
    SPLAT_C[k + 2],
  ];
  let t = 0,
    life = 0,
    dark = 0,
    top = 0;
  const r = [0, 0, 0];
  for (let l = 0; l < 10; l++) {
    const a = w[l] * w[l];
    if (!a) continue;
    /* (squared: the main ground rules a blend, as the eye reads it) */ t += a;
    life += a * LIFE[l];
    dark += a * DARK[l];
    _c.setHex(TINT[l]);
    r[0] += a * _c.r;
    r[1] += a * _c.g;
    r[2] += a * _c.b;
    if (w[l] > w[top]) top = l;
  }
  t ||= 1;
  return {
    life: life / t,
    dark: dark / t,
    rgb: r.map((v) => v / t),
    top: ['grass', 'forest', 'dirt', 'rock', 'sand', 'snow', 'mud', 'paving', 'gravel', 'moss'][top],
  };
}

function place(x, z, yaw, foot, k, t) {
  const y = groundY(x, z);
  if (y < WATER_Y + 0.05) {
    stats.water++;
    return;
  } // (water takes no print)
  const g = groundOf(x, z),
    e = 0.25,
    s = next;
  next = (next + 1) % CAP; // (the ring: the oldest slot goes first)
  _y.set(groundY(x - e, z) - groundY(x + e, z), 2 * e, groundY(x, z - e) - groundY(x, z + e)).normalize(); // lie on the slope
  _z.set(Math.sin(yaw), 0, Math.cos(yaw));
  _x.crossVectors(_z, _y).normalize();
  _z.crossVectors(_y, _x); // (a right-handed frame: the print faces up, not culled)
  _m.makeBasis(_x.multiplyScalar(k.w), _y, _z.multiplyScalar(-k.l)).setPosition(x, y + 0.02, z); // (toe forward)
  mesh.setMatrixAt(s, _m);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.setColorAt(s, _c.setRGB(...g.rgb));
  mesh.instanceColor.needsUpdate = true;
  const a = mesh.geometry.attributes;
  a.aBorn.array[s] = t;
  a.aLife.array[s] = g.life;
  a.aDark.array[s] = g.dark;
  a.aCell.array[s] = (k.cell + 1) * (foot ? -1 : 1);
  for (const n of ['aBorn', 'aLife', 'aDark', 'aCell']) a[n].needsUpdate = true;
  stats.placed++;
}

// one walker: a print each stride its feet cover, each exactly a stride on from the last (steady spacing); off the ground
// (a floor, a roof, a jump, a ladder) or a sudden jump in place (a teleport, a respawn) lays none
function step(w, x, y, z, k, t) {
  let st = at.get(w);
  if (!st) at.set(w, (st = { x, z, foot: 0 }));
  let dx = x - st.x,
    dz = z - st.z,
    d = Math.hypot(dx, dz);
  if (d > k.stride * 4 || Math.abs(y - groundY(x, z)) > 0.3) {
    st.x = x;
    st.z = z;
    return;
  }
  for (let n = 0; d >= k.stride && n < 3; n++) {
    const ux = dx / d,
      uz = dz / d,
      sd = st.foot ? -1 : 1;
    st.x += ux * k.stride;
    st.z += uz * k.stride;
    place(st.x - uz * k.gait * sd, st.z + ux * k.gait * sd, Math.atan2(ux, uz), st.foot, k, t);
    st.foot ^= 1;
    dx = x - st.x;
    dz = z - st.z;
    d = Math.hypot(dx, dz);
  }
}

// only walkers within NEAR m of the camera: the ring is for what you can see (a far pack would wrap it in seconds, the stranger's review);
// a walker skipped (far, down, dead) loses its anchor, so it lays no stray prints from where it was
const NEAR = 70;
export function tickTracks(scene, t, people, creatures, cam) {
  if (!mesh) build(scene);
  mesh.userData.uT.value = t;
  const near = (x, z) => (x - cam.x) ** 2 + (z - cam.z) ** 2 < NEAR * NEAR;
  for (const p of people)
    if (!p.dead && !(p.down > 0) && near(p.x, p.z)) step(p, p.x, p.y, p.z, BOOT, t);
    else at.delete(p);
  for (const e of creatures) {
    const k = KIND[e.type] || (e.type === 'dust_hound' ? KIND.wolf : null);
    if (k && !e.dead && e.mesh && near(e.x, e.z)) step(e, e.x, e.mesh.position.y, e.z, k, t);
    else at.delete(e);
  }
}
export function clearTracks() {
  if (!mesh) return;
  mesh.geometry.attributes.aBorn.array.fill(-1e9);
  mesh.geometry.attributes.aBorn.needsUpdate = true;
} // (a new game: no prints from the last)
export const trackStats = () => ({
  cap: CAP,
  count: mesh?.count ?? 0,
  ...stats,
  live: mesh
    ? Array.from({ length: CAP }, (_, s) => {
        const a = mesh.geometry.attributes,
          age = mesh.userData.uT.value - a.aBorn.array[s];
        return age > -0.05 && age < a.aLife.array[s]
          ? /* (the birth time is stored rounded to 32 bits) */ {
              s,
              cell: Math.abs(a.aCell.array[s]) - 1,
              life: +a.aLife.array[s].toFixed(1),
              x: +mesh.instanceMatrix.array[s * 16 + 12].toFixed(2),
              z: +mesh.instanceMatrix.array[s * 16 + 14].toFixed(2),
            }
          : null;
      }).filter(Boolean)
    : [],
});
export const tracksMesh = () => mesh;
export function fillTracks(x, z, n) {
  const t = mesh.userData.uT.value;
  for (let k = 0; k < n; k++) place(x + (k % 20) * 0.4, z + Math.floor(k / 20) * 0.5, 0, k & 1, BOOT, t);
} // (checks: the ring when full)
