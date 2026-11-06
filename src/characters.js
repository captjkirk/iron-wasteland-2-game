// Player characters: Quaternius CC0 rigged humanoids (Modular Character Outfits - Fantasy, Universal Base Characters,
// Universal Animation Library 1 and 2), each dressed with its own gear built in code, animated by an AnimationMixer.
// loadCharacters() once, then buildCharacter(ch) for the third-person body and buildViewModel(ch) for first person.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DIR = new URL('../assets/chars/', import.meta.url).href;
const docs = {}; let clips = null;
const loader = new GLTFLoader();
async function loadDoc(name) {
  const txt = await (await fetch(DIR + name + '.json')).text();
  return new Promise((res, rej) => loader.parse(txt, DIR, res, rej));
}

// Bones that belong to the upper body (attacks and hit reactions play only on these while the legs keep walking).
const LOWER = /^(root|pelvis|thigh|calf|foot|ball)/;
// The animation mannequin's bone lengths differ a little from the outfits': keep rotations, and only the pelvis moves.
function cleanClip(c, upperOnly) {
  const tracks = [];
  for (const t of c.tracks) {
    const [bone, prop] = [t.name.slice(0, t.name.lastIndexOf('.')), t.name.slice(t.name.lastIndexOf('.') + 1)];
    if (prop === 'scale') continue;
    if (prop === 'position' && bone !== 'pelvis') continue;
    if (upperOnly && (LOWER.test(bone) || prop === 'position')) continue;
    tracks.push(t);
  }
  return new THREE.AnimationClip(c.name + (upperOnly ? '_upper' : ''), c.duration, tracks);
}

export async function loadCharacters(progress) {
  if (clips) return;
  const names = ['male_ranger', 'female_ranger', 'male_peasant', 'female_peasant', 'head_male', 'head_female', 'hair_long', 'hair_buns',
    'hair_simpleparted', 'hair_beard', 'hair_buzzed', 'eyebrows_regular', 'eyebrows_female', 'anims'];
  let n = 0; await Promise.all(names.map(async k => { docs[k] = await loadDoc(k); progress?.(`Loading characters… ${++n}/${names.length}`); }));
  clips = {};
  for (const c of docs.anims.animations) {
    // make loops in place: the pelvis keeps its height and sway but not its drift along the walk
    const pos = c.tracks.find(t => t.name === 'pelvis.position');
    if (pos && /Loop|Idle/.test(c.name)) { const v = pos.values, x0 = v[0], y0 = v[1]; for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 1] = y0; } }
    clips[c.name] = cleanClip(c, false); clips[c.name + '_upper'] = cleanClip(c, true);
  }
}

// ── Materials ─────────────────────────────────────────────────────────────
// Recolour a hue band of the outfit texture (the cloth) to the character's colour; leather and skin stay.
const REMAP_GLSL = /* glsl */`
uniform vec3 uHueFrom; uniform vec3 uHueTo; uniform vec4 uLight;
vec3 iwHsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));
  float d=q.x-min(q.w,q.y); return vec3(abs(q.z+(q.w-q.y)/(6.*d+1e-10)),d/(q.x+1e-10),q.x); }
vec3 iwRgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y); }
vec3 iwRemap(vec3 c){ vec3 s=pow(max(c,vec3(0.)),vec3(1./2.2)); vec3 h=iwHsv(s);
  float dh=abs(fract(h.x-uHueFrom.x+0.5)-0.5);
  float m=(1.-smoothstep(uHueFrom.y*0.55,uHueFrom.y,dh))*smoothstep(uHueFrom.z,uHueFrom.z+0.12,h.y);
  vec3 t=iwRgb(vec3(uHueTo.x,clamp(h.y*uHueTo.y,0.,1.),clamp(h.z*uHueTo.z,0.,1.)));
  s=mix(s,t,m);
  float l=(1.-smoothstep(0.12,0.3,h.y))*smoothstep(0.4,0.7,h.z); s=mix(s,s*uLight.rgb,l*uLight.a);
  return pow(s,vec3(2.2)); }
`;
function remapMaterial(mat, r) {
  const m = mat.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHueFrom = { value: new THREE.Vector3(...(r.from || [0, 0, 2])) };
    sh.uniforms.uHueTo = { value: new THREE.Vector3(...(r.to || [0, 1, 1])) };
    sh.uniforms.uLight = { value: new THREE.Vector4(...(r.light || [1, 1, 1, 0])) };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + REMAP_GLSL)
      .replace('#include <map_fragment>', '#ifdef USE_MAP\nvec4 sampledDiffuseColor = texture2D( map, vMapUv );\nsampledDiffuseColor.rgb = iwRemap( sampledDiffuseColor.rgb );\ndiffuseColor *= sampledDiffuseColor;\n#endif');
  };
  m.customProgramCacheKey = () => 'iwremap' + JSON.stringify(r);
  return m;
}

// Scratched-metal roughness and a leather grain, drawn once on canvases.
function noiseTex(size, base, amp, streaks, seed = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const img = g.createImageData(size, size); let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < size * size; i++) { const v = base + (rnd() - 0.5) * amp; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.max(0, Math.min(255, v)); img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < streaks; k++) { g.strokeStyle = `rgba(${rnd() < 0.5 ? 255 : 0},${0},${0},0)`; const v = Math.floor(base + (rnd() - 0.3) * 120);
    g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = rnd() * 1.5 + 0.3; g.beginPath(); const x = rnd() * size, y = rnd() * size, a = rnd() * 6.28, l = rnd() * size * 0.3;
    g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
// Hammered plate: a normal map from soft dents (a few hundred overlapping bumps), tiling.
function dentNormals(size = 256, seed = 11) {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, h = new Float32Array(size * size);
  for (let k = 0; k < 420; k++) { const cx = rnd() * size, cy = rnd() * size, r = 4 + rnd() * 14, a = (rnd() - 0.4) * 1.0;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = Math.hypot(x, y) / r; if (d >= 1) continue;
      const i = ((Math.floor(cy + y) % size + size) % size) * size + ((Math.floor(cx + x) % size + size) % size); h[i] += a * (1 - d * d) ** 2; } }
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const i = y * size + x, dx = h[y * size + (x + 1) % size] - h[y * size + (x - 1 + size) % size], dy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x];
    const l = Math.hypot(dx, dy, 1); img.data[i * 4] = (-dx / l * 0.5 + 0.5) * 255; img.data[i * 4 + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
let M = null;
function mats() {
  if (M) return M;
  const scratch = noiseTex(256, 85, 40, 260, 7), grain = noiseTex(128, 170, 70, 40, 3);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M = {
    steel: std({ color: 0xa8aeb6, metalness: 1, roughness: 1, roughnessMap: scratch, normalMap: dentNormals(), normalScale: new THREE.Vector2(0.55, 0.55), envMapIntensity: 0.95 }),
    darksteel: std({ color: 0x6a6e74, metalness: 1, roughness: 0.55, roughnessMap: scratch, normalMap: dentNormals(128, 5), normalScale: new THREE.Vector2(0.4, 0.4) }),
    brass: std({ color: 0xc8a04a, metalness: 1, roughness: 0.38 }),
    gold: std({ color: 0xe0b850, metalness: 1, roughness: 0.3 }),
    leather: std({ color: 0x5a3a22, roughness: 0.75, roughnessMap: grain }),
    darkleather: std({ color: 0x33221a, roughness: 0.8, roughnessMap: grain }),
    wood: std({ color: 0x7a5232, roughness: 0.6, roughnessMap: grain }),
    darkwood: std({ color: 0x4a2e1c, roughness: 0.55, roughnessMap: grain }),
    felt: std({ color: 0x6a4626, roughness: 0.92, roughnessMap: grain, side: THREE.DoubleSide }),
    cloth: (hex) => std({ color: hex, roughness: 0.9, side: THREE.DoubleSide }),
    string: std({ color: 0xe8e0c8, roughness: 0.6 }),
    glass: std({ color: 0x9fd0e0, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.55 }),
    petal: (hex) => std({ color: hex, roughness: 0.65, side: THREE.DoubleSide }),
    leaf: std({ color: 0x3f6a2a, roughness: 0.7, side: THREE.DoubleSide }),
    feather: std({ color: 0xece4d4, roughness: 0.85, side: THREE.DoubleSide }),
  };
  return M;
}

// ── Gear geometry (metres; built along +Y unless noted) ─────────────────────
const lathe = (pts, seg = 20, phiStart = 0, phiLen = Math.PI * 2) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg, phiStart, phiLen);
function mesh(geo, mat, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); m.scale.set(...s); m.castShadow = true; return m;
}
const grp = (...kids) => { const g = new THREE.Group(); for (const k of kids) g.add(k); return g; };

function knife() { const k = sword(); k.scale.setScalar(0.38); k.visible = false; return k; } // the sword's shape at dagger size
function sword() { const m = mats();
  const blade = new THREE.Shape(); blade.moveTo(-0.026, 0); blade.lineTo(0.026, 0); blade.lineTo(0.021, 0.74); blade.lineTo(0, 0.84); blade.lineTo(-0.021, 0.74); blade.closePath();
  const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.007, bevelSegments: 1 }); bg.translate(0, 0, -0.0015);
  const fuller = new THREE.PlaneGeometry(0.012, 0.58);
  const g = grp(mesh(bg, m.steel, { p: [0, 0.16, 0] }),
    ...[1, -1].map(z => mesh(fuller, m.darksteel, { p: [0, 0.47, z * 0.0062], r: [0, z < 0 ? Math.PI : 0, 0] })),
    mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.24, 8), m.brass, { p: [0, 0.15, 0], r: [0, 0, Math.PI / 2] }),
    ...[1, -1].map(x => mesh(new THREE.SphereGeometry(0.02, 10, 8), m.brass, { p: [x * 0.125, 0.15, 0] })),
    mesh(new THREE.BoxGeometry(0.05, 0.04, 0.03), m.brass, { p: [0, 0.165, 0] }),
    mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.15, 10), m.darkleather, { p: [0, 0.07, 0] }));
  for (let i = 0; i < 6; i++) g.add(mesh(new THREE.TorusGeometry(0.018, 0.003, 4, 10), m.leather, { p: [0, 0.01 + i * 0.024, 0], r: [Math.PI / 2 + 0.3, 0, 0] }));
  g.add(mesh(new THREE.SphereGeometry(0.028, 12, 8), m.brass, { p: [0, -0.015, 0], s: [1, 1.2, 0.8] }));
  return g;
}
function cuisse() { const m = mats(); return grp(mesh(lathe([[0.095, 0], [0.105, 0.08], [0.1, 0.22], [0.088, 0.32]], 16, Math.PI * 0.25, Math.PI * 1.5), m.steel),
  mesh(new THREE.SphereGeometry(0.06, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.steel, { p: [0, 0.4, -0.04], r: [-Math.PI / 2, 0, 0], s: [1, 1, 0.8] })); }
function shield(color) { const m = mats();
  const sh = new THREE.Shape(); sh.moveTo(0, -0.42); sh.quadraticCurveTo(0.3, -0.12, 0.29, 0.26); sh.lineTo(-0.29, 0.26); sh.quadraticCurveTo(-0.3, -0.12, 0, -0.42);
  const face = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.018, bevelSegments: 2, curveSegments: 16 });
  const paint = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.8), roughness: 0.7, roughnessMap: m.steel.roughnessMap, metalness: 0.05 });
  const rim = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.03, bevelSegments: 1, curveSegments: 16 });
  const cross = grp(mesh(new THREE.BoxGeometry(0.07, 0.6, 0.02), m.brass, { p: [0, -0.06, 0.048] }), mesh(new THREE.BoxGeometry(0.44, 0.07, 0.02), m.brass, { p: [0, 0.1, 0.048] }));
  const g = grp(mesh(rim, m.steel, { p: [0, 0, -0.005], s: [1, 1, 1] }), mesh(face, paint, { p: [0, 0, 0.006], s: [0.93, 0.93, 1] }), cross,
    mesh(new THREE.SphereGeometry(0.06, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.steel, { p: [0, 0.03, 0.05], r: [Math.PI / 2, 0, 0] }));
  g.scale.setScalar(0.78); return g;
}
function helmet(plume) { const m = mats();
  const dome = lathe([[0, 0.25], [0.06, 0.245], [0.11, 0.225], [0.14, 0.18], [0.152, 0.12], [0.155, 0.04], [0.155, -0.04], [0.148, -0.1], [0.14, -0.12]].reverse(), 24);
  const g = grp(mesh(dome, m.steel, { s: [1, 1, 1.1] }));
  // visor slit: a dark band across the eyes, with a raised brow ridge and a nasal bar
  g.add(mesh(new THREE.TorusGeometry(0.155, 0.012, 6, 24, Math.PI * 0.9), m.steel, { p: [0, 0.075, 0], r: [Math.PI / 2, 0, Math.PI * 0.05], s: [1, 1.1, 1] }));
  g.add(mesh(new THREE.BoxGeometry(0.24, 0.022, 0.03), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }), { p: [0, 0.045, 0.158] }));
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.13, 0.03), m.steel, { p: [0, -0.01, 0.168] }));
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 6), new THREE.MeshStandardMaterial({ color: 0x050505 }), { p: [sx * 0.05, -0.04 - k * 0.025, 0.163], r: [Math.PI / 2, 0, 0] }));
  const crest = new THREE.Shape(); crest.moveTo(-0.16, 0); crest.quadraticCurveTo(-0.08, 0.24, 0.24, 0.2); crest.quadraticCurveTo(0.08, 0.1, 0.17, 0); crest.closePath();
  const cg = new THREE.ExtrudeGeometry(crest, { depth: 0.035, bevelEnabled: false }); cg.translate(0, 0, -0.0175);
  g.add(mesh(cg, m.cloth(plume), { p: [0, 0.2, -0.03], r: [0, -Math.PI / 2, 0] }));
  g.scale.setScalar(0.8); return g;
}
function pauldron() { const m = mats(); return grp(
  mesh(new THREE.SphereGeometry(0.12, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), m.steel, { s: [1, 0.8, 1.1] }),
  mesh(new THREE.SphereGeometry(0.135, 18, 6, 0, Math.PI * 2, Math.PI * 0.32, Math.PI * 0.16), m.steel, { p: [0, 0.015, 0], s: [1, 0.85, 1.1] })); }
function cuirass(color) { const m = mats();
  const shell = lathe([[0.13, -0.22], [0.155, -0.15], [0.175, -0.02], [0.185, 0.1], [0.17, 0.2], [0.11, 0.26]], 24);
  const g = grp(mesh(shell, m.steel, { s: [1.2, 1, 0.92] }));
  for (let k = 0; k < 3; k++) g.add(mesh(lathe([[0.17 + k * 0.012, 0], [0.18 + k * 0.012, -0.06]], 20), m.steel, { p: [0, -0.2 - k * 0.05, 0], s: [1.2, 1, 0.95] }));
  g.add(mesh(new THREE.TorusGeometry(0.17, 0.012, 6, 24), m.brass, { p: [0, -0.02, 0], r: [Math.PI / 2, 0, 0], s: [1.13, 0.84, 1] }));
  // tabard strip in the character's colour hanging below the belt, front and back
  const tab = new THREE.PlaneGeometry(0.2, 0.36, 1, 4); tab.translate(0, -0.18, 0);
  for (const z of [1, -1]) g.add(mesh(tab, m.cloth(color), { p: [0, -0.2, z * 0.15], r: [z * 0.12, 0, 0] }));
  return g;
}
function gorget() { const m = mats(); // overlapping neck lames over the collar
  const g = grp(); for (let k = 0; k < 3; k++) g.add(mesh(lathe([[0.1 - k * 0.012, -0.03], [0.095 - k * 0.012, 0.0], [0.082 - k * 0.012, 0.03]], 20), m.steel, { p: [0, k * 0.032, 0], s: [1.15, 1, 1.05] }));
  g.add(mesh(new THREE.TorusGeometry(0.098, 0.006, 4, 20), m.brass, { p: [0, -0.03, 0], r: [Math.PI / 2, 0, 0], s: [1.15, 1.05, 1] })); return g; }
function bracer(r = 0.05, h = 0.2, mat) { return mesh(lathe([[r * 0.85, 0], [r, 0.03], [r * 1.12, h], [r * 1.2, h + 0.01]], 16), mat || mats().steel); }
function revolver() { const m = mats();
  const g = grp(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.2, 12), m.darksteel, { p: [0, 0.1, 0] }),
    mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.05, 6), m.darksteel, { p: [0, -0.01, -0.005] }),
    mesh(new THREE.BoxGeometry(0.03, 0.09, 0.04), m.darksteel, { p: [0, -0.01, -0.025] }),
    mesh(new THREE.BoxGeometry(0.026, 0.035, 0.11), m.wood, { p: [0, -0.06, -0.075], r: [-0.45, 0, 0] }),
    mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 12, Math.PI), m.darksteel, { p: [0, -0.05, -0.02], r: [0, Math.PI / 2, 0] }));
  return g;
}
function cowboyHat() { const m = mats();
  const brim = lathe([[0, 0], [0.12, 0.005], [0.2, 0.012], [0.25, 0.04], [0.26, 0.05], [0.25, 0.045], [0.2, 0.004], [0.12, -0.006], [0, -0.008]], 28);
  const crown = lathe([[0.112, 0], [0.115, 0.06], [0.11, 0.12], [0.085, 0.145], [0.03, 0.135], [0, 0.125]], 24);
  return grp(mesh(brim, m.felt, { s: [1, 1, 1.18] }), mesh(crown, m.felt, { s: [1, 1, 1.2] }), mesh(new THREE.CylinderGeometry(0.117, 0.117, 0.025, 24, 1, true), m.darkleather, { p: [0, 0.018, 0], s: [1, 1, 1.2] }));
}
function wrench() { const m = mats();
  const s = new THREE.Shape(); s.moveTo(-0.02, 0.0); s.lineTo(0.02, 0.0); s.lineTo(0.018, 0.4);
  s.lineTo(0.05, 0.43); s.lineTo(0.06, 0.5); s.lineTo(0.03, 0.54); s.lineTo(0.018, 0.47); s.lineTo(-0.018, 0.47); s.lineTo(-0.03, 0.54); s.lineTo(-0.06, 0.5); s.lineTo(-0.05, 0.43); s.lineTo(-0.018, 0.4); s.closePath();
  const box = new THREE.Path(); box.absarc(0, -0.035, 0.022, 0, Math.PI * 2, true);
  const end = new THREE.Shape(); end.absarc(0, -0.035, 0.045, 0, Math.PI * 2, false); end.holes.push(box);
  const opts = { depth: 0.016, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 6 };
  const g1 = new THREE.ExtrudeGeometry(s, opts), g2 = new THREE.ExtrudeGeometry(end, opts); for (const g of [g1, g2]) g.translate(0, -0.08, -0.008);
  return grp(mesh(g1, m.steel), mesh(g2, m.steel), mesh(new THREE.BoxGeometry(0.03, 0.2, 0.024), m.cloth(0x2a6a3a), { p: [0, 0.06, 0] }));
}
function goggles() { const m = mats();
  const g = grp(); for (const sx of [-1, 1]) { g.add(mesh(new THREE.TorusGeometry(0.03, 0.009, 8, 16), m.brass, { p: [sx * 0.042, 0, 0] })); g.add(mesh(new THREE.CircleGeometry(0.03, 16), m.glass, { p: [sx * 0.042, 0, 0.002] })); }
  g.add(mesh(new THREE.TorusGeometry(0.11, 0.008, 4, 28), m.darkleather, { p: [0, 0, -0.1], r: [Math.PI / 2, 0, 0], s: [0.95, 1.0, 1] }));
  return g;
}
function toolBelt() { const m = mats();
  const g = grp(mesh(new THREE.TorusGeometry(0.17, 0.022, 6, 28), m.leather, { r: [Math.PI / 2, 0, 0], s: [1.08, 0.82, 1.8] }));
  for (const [x, z, w] of [[0.15, 0.06, 0.09], [-0.15, 0.06, 0.08], [0.11, -0.12, 0.07]]) g.add(mesh(new THREE.BoxGeometry(w, 0.1, 0.05), m.leather, { p: [x, -0.05, z], r: [0, Math.atan2(x, z), 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8), m.wood, { p: [-0.18, -0.08, -0.04], r: [0.1, 0, 0.15] }));
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.05, 0.11), m.darksteel, { p: [-0.18, 0.04, -0.04], r: [0.1, 0, 0.15] }));
  return g;
}
function bouquet() { const m = mats(); const g = grp();
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.015, 0.18, 10), m.leaf, { p: [0, 0.02, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.038, 0.03, 0.05, 10), m.cloth(0xf0d0e0), { p: [0, 0.0, 0] }));
  const cols = [0xd03a6a, 0xf0a0c0, 0xf4e8f0, 0xe85a8a, 0xf0d050, 0xc02858, 0xf6b0d0];
  for (let i = 0; i < 11; i++) { const a = i * 2.4, rr = i ? 0.04 + (i % 3) * 0.014 : 0, f = grp(), c = m.petal(cols[i % cols.length]);
    for (let k = 0; k < 6; k++) f.add(mesh(new THREE.SphereGeometry(0.022, 6, 4), c, { p: [Math.cos(k * 1.05) * 0.016, 0, Math.sin(k * 1.05) * 0.016], s: [1, 0.35, 0.6], r: [0, -k * 1.05, 0.5] }));
    f.add(mesh(new THREE.SphereGeometry(0.009, 6, 4), m.petal(0xf0d050)));
    f.position.set(Math.cos(a) * rr, 0.14 - rr * 0.35, Math.sin(a) * rr); f.rotation.set(Math.sin(a) * rr * 8, 0, -Math.cos(a) * rr * 8); g.add(f); }
  for (let i = 0; i < 5; i++) { const a = i * 1.26; g.add(mesh(new THREE.ConeGeometry(0.015, 0.08, 4), m.leaf, { p: [Math.cos(a) * 0.06, 0.1, Math.sin(a) * 0.06], r: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], s: [1, 1, 0.3] })); }
  return g;
}
function flowerCrown() { const m = mats(); const g = grp(mesh(new THREE.TorusGeometry(0.105, 0.008, 6, 32), m.leaf, { r: [Math.PI / 2, 0, 0], s: [1, 1.15, 1] }));
  const cols = [0xf4e8f0, 0xe85a8a, 0xf0d050, 0xf0a0c0];
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; g.add(mesh(new THREE.IcosahedronGeometry(0.017, 0), m.petal(cols[i % 4]), { p: [Math.cos(a) * 0.105, 0, Math.sin(a) * 0.121], s: [1, 0.6, 1] })); }
  return g;
}
// The bow: a recurved limb, a two-part string meeting at the nock, and a nocked arrow. userData.draw(k, nocked) pulls
// the string back k (0..1, about 0.32 m at full draw) and shows or hides the arrow on the string.
function bow() { const m = mats();
  const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16 * 2 - 1; pts.push(new THREE.Vector3(0, t * 0.68, -0.1 * (1 - t * t) + 0.05 * Math.pow(Math.abs(t), 4))); }
  const limb = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.014, 6);
  const g = grp(mesh(limb, m.darkwood), mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.13, 8), m.leather, { p: [0, 0, -0.1] }));
  for (const y of [-0.08, 0.08]) g.add(mesh(new THREE.TorusGeometry(0.02, 0.004, 4, 10), m.brass, { p: [0, y, -0.1], r: [Math.PI / 2, 0, 0] }));
  const sg = new THREE.CylinderGeometry(0.0022, 0.0022, 1, 4), top = mesh(sg, m.string), bot = mesh(sg, m.string); g.add(top, bot);
  const arw = arrow(0.72); arw.rotation.x = -Math.PI / 2; g.add(arw);
  const A = new THREE.Vector3(0, 0.68, 0.05), B = new THREE.Vector3(0, -0.68, 0.05), nock = new THREE.Vector3(), d = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const span = (o, a, b) => { d.subVectors(b, a); o.position.copy(a).addScaledVector(d, 0.5); o.scale.set(1, d.length(), 1); o.quaternion.setFromUnitVectors(Y, d.normalize()); };
  g.userData.draw = (k, nocked) => { nock.set(0, 0, 0.051 + k * 0.32); span(top, nock, A); span(bot, B, nock); arw.visible = nocked; arw.position.set(0.016, 0, nock.z); };
  g.userData.draw(0.1, true); return g;
}
function arrow(len = 0.75) { const m = mats(); return grp(mesh(new THREE.CylinderGeometry(0.005, 0.005, len, 5), m.wood, { p: [0, len / 2, 0] }),
  mesh(new THREE.ConeGeometry(0.012, 0.05, 4), m.darksteel, { p: [0, len + 0.02, 0] }),
  ...[0, 2.1, 4.2].map(a => mesh(new THREE.PlaneGeometry(0.02, 0.09), m.feather, { p: [Math.cos(a) * 0.01, 0.07, Math.sin(a) * 0.01], r: [0, -a, 0] }))); }
function quiver() { const m = mats(); const g = grp(mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.5, 12, 1, true), m.leather, { p: [0, 0.25, 0] }),
  mesh(new THREE.CircleGeometry(0.045, 12), m.leather, { p: [0, 0.001, 0], r: [Math.PI / 2, 0, 0] }), mesh(new THREE.TorusGeometry(0.055, 0.006, 4, 16), m.brass, { p: [0, 0.48, 0], r: [Math.PI / 2, 0, 0] }));
  for (let i = 0; i < 6; i++) { const a = arrow(0.7); a.position.set(Math.cos(i) * 0.025, 0.03, Math.sin(i) * 0.025); a.rotation.set(Math.sin(i) * 0.06, 0, Math.cos(i) * 0.06); g.add(a); }
  return g;
}
function dusterSkirt() { const m = mats(), mat = m.felt.clone(); mat.color.set(0x7a4a24);
  return mesh(lathe([[0.19, 0.05], [0.22, -0.1], [0.27, -0.42]].reverse(), 20, Math.PI * 0.12, Math.PI * 1.76), mat, { s: [1, 1, 0.8] }); }
// a raider's club: a tapered length of wood, an iron band and nails driven through the head
function club() { const m = mats(); const g = grp(mesh(new THREE.CylinderGeometry(0.042, 0.02, 0.62, 10), m.wood, { p: [0, 0.31, 0] }),
  mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.05, 10), m.darksteel, { p: [0, 0.5, 0] }), mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 8), m.darkleather, { p: [0, 0.05, 0] }));
  for (let k = 0; k < 7; k++) { const a = k * 2.4, y = 0.42 + (k % 3) * 0.06; g.add(mesh(new THREE.ConeGeometry(0.006, 0.05, 4), m.darksteel, { p: [Math.cos(a) * 0.05, y, Math.sin(a) * 0.05], r: [Math.sin(a) * Math.PI / 2, 0, -Math.cos(a) * Math.PI / 2] })); }
  return g; }
function bandana(color) { const c = mats().cloth(color); c.color.multiplyScalar(0.7);
  const g = grp(mesh(lathe([[0.085, -0.035], [0.088, 0.0], [0.078, 0.025]], 18), c, { s: [1, 1, 1.15] }));
  const tri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.07, 0, 0), new THREE.Vector3(0.07, 0, 0), new THREE.Vector3(0, -0.1, 0.02)]); tri.computeVertexNormals();
  g.add(mesh(tri, c, { p: [0, -0.02, 0.095], r: [0.25, 0, 0] })); return g; }

// ── The five looks ───────────────────────────────────────────────────────
// outfit, head, hair, which outfit parts to hide, cloth recolour (hue band -> hue), gear per bone.
// Bone frames (from the rig): +Y runs along each bone towards its child; on the hands +Y points to the fingers.
const LOOKS = {
  knight: { outfit: 'male_peasant', head: 'head_male', hair: ['hair_buzzed', 'eyebrows_regular'], scale: 1.03, gloves: [0.42, 0.45, 0.5],
    remap: { from: [0.07, 0.1, 0.12], to: [0.6, 0.55, 1.25] },
    gear: (ch) => [
      ['Head', helmet(0xa83228), [0, 0.07, 0.025], [0, 0, 0]],
      ['spine_02', cuirass(ch.color), [0, 0.1, 0.03], [0, 0, 0]],
      ['neck_01', gorget(), [0, -0.02, 0.01], [0, 0, 0]],
      ['upperarm_l', pauldron(), [-0.035, 0.05, 0], [0, 0, Math.PI / 2], 'shoulder'], ['upperarm_r', pauldron(), [0.035, 0.05, 0], [0, 0, -Math.PI / 2], 'shoulder'],
      ['lowerarm_l', bracer(0.048, 0.19), [0, 0.04, 0], [0, 0, 0]], ['lowerarm_r', bracer(0.048, 0.19), [0, 0.04, 0], [0, 0, 0]],
      ['calf_l', bracer(0.062, 0.3), [0, 0.06, 0], [0, 0, 0]], ['calf_r', bracer(0.062, 0.3), [0, 0.06, 0], [0, 0, 0]],
      ['thigh_l', cuisse(), [0, 0.04, 0], [0, 0, 0]], ['thigh_r', cuisse(), [0, 0.04, 0], [0, 0, 0]],
      ['upperarm_l', bracer(0.055, 0.17), [0, 0.07, 0], [0, 0, 0]], ['upperarm_r', bracer(0.055, 0.17), [0, 0.07, 0], [0, 0, 0]],
      ['hand_r', sword(), [-0.02, 0.085, -0.02], GRIP_R, 'weapon'],
      ['lowerarm_l', shield(ch.color), [-0.055, 0.13, 0], basis([0, -1, 0], [-1, 0, 0]), 'offhand'],
    ], hide: /Hair/ },
  gunslinger: { outfit: 'male_ranger', head: 'head_male', hair: ['hair_simpleparted', 'eyebrows_regular'], hide: /Hood|Pauldron/,
    remap: { from: [0.3, 0.12, 0.15], to: [0.075, 0.95, 1.05] },
    gear: (ch) => [
      ['Head', cowboyHat(), [0, 0.15, 0.01], [-0.08, 0, 0]],
      ['neck_01', bandana(0x9a2a22), [0, 0.0, 0.0], [0, 0, 0]],
      ['spine_01', dusterSkirt(), [0, 0.02, -0.01], [0, 0, 0]],
      ['hand_r', revolver(), [-0.03, 0.13, 0.07], [0, 0, 0], 'weapon'],
    ] },
  architect: { outfit: 'male_peasant', head: 'head_male', hair: ['hair_simpleparted', 'hair_beard', 'eyebrows_regular'],
    remap: { from: [0.11, 0.06, 0.25], to: [0.38, 0.85, 0.9] },
    gear: () => [
      ['Head', goggles(), [0, 0.165, 0.085], [-0.55, 0, 0]],
      ['pelvis', toolBelt(), [0, 0.05, 0], [0, 0, 0]],
      ['hand_r', wrench(), [-0.02, 0.085, -0.04], GRIP_R, 'weapon'],
    ] },
  charmer: { outfit: 'female_peasant', head: 'head_female', hair: ['hair_long', 'eyebrows_female'], scale: 0.98,
    remap: { from: [0.1, 0.07, 0.2], to: [0.93, 0.5, 1.45], light: [1, 0.84, 0.92, 0.75] },
    gear: () => [
      ['Head', flowerCrown(), [0, 0.12, -0.005], [-0.25, 0, 0]],
      ['hand_r', bouquet(), [-0.02, 0.08, -0.04], GRIP_R, 'weapon'],
    ] },
  ranger: { outfit: 'female_ranger', head: 'head_female', hair: ['eyebrows_female'], scale: 0.98,
    gear: () => [
      ['hand_l', bow(), [0.02, -0.02, 0.0], basis([0, 0, 1], [0, -1, 0]), 'weapon'],
      ['spine_03', quiver(), [-0.06, -0.05, -0.17], [0.25, 0, 0.4]],
      ['hand_r', knife(), [-0.02, 0.085, -0.04], GRIP_R, 'knife'], // shown only for the knife strike
    ] },
  // raiders (IW1's brawler, shooter and heavy): the same rigged bodies in dirty clothes and scrap armour (creatures.js rusts the metal)
  brawler: { outfit: 'male_peasant', head: 'head_male', hair: ['hair_buzzed', 'hair_beard', 'eyebrows_regular'], scale: 1.04,
    remap: { from: [0.11, 0.06, 0.25], to: [0.03, 0.55, 0.5] },
    gear: () => [
      ['neck_01', bandana(0x3a2a20), [0, 0, 0], [0, 0, 0]],
      ['upperarm_l', pauldron(), [-0.035, 0.05, 0], [0, 0, Math.PI / 2], 'shoulder'],
      ['lowerarm_l', bracer(0.05, 0.19, mats().leather), [0, 0.04, 0], [0, 0, 0]],
      ['hand_r', club(), [-0.02, 0.085, -0.04], GRIP_R, 'weapon'],
    ] },
  shooter: { outfit: 'male_ranger', head: 'head_male', hair: ['hair_simpleparted', 'eyebrows_regular'], hide: /Pauldron/,
    remap: { from: [0.3, 0.12, 0.15], to: [0.2, 0.25, 0.55] },
    gear: () => [
      ['neck_01', bandana(0x5a1a14), [0, 0, 0], [0, 0, 0]],
      ['hand_r', revolver(), [-0.03, 0.13, 0.07], [0, 0, 0], 'weapon'],
    ] },
  heavy: { outfit: 'male_peasant', head: 'head_male', hair: ['hair_buzzed', 'hair_beard', 'eyebrows_regular'], scale: 1.14,
    remap: { from: [0.07, 0.1, 0.12], to: [0.08, 0.3, 0.45] },
    gear: () => { const gun = revolver(); gun.scale.setScalar(1.6); return [
      ['spine_02', cuirass(0x3a3028), [0, 0.1, 0.03], [0, 0, 0]],
      ['upperarm_l', pauldron(), [-0.035, 0.05, 0], [0, 0, Math.PI / 2], 'shoulder'], ['upperarm_r', pauldron(), [0.035, 0.05, 0], [0, 0, -Math.PI / 2], 'shoulder'],
      ['Head', goggles(), [0, 0.165, 0.085], [-0.55, 0, 0]],
      ['hand_r', gun, [-0.03, 0.13, 0.07], [0, 0, 0], 'weapon'],
    ]; } },
};
// The clips each character uses: base idle, attack (and an alternate), and how fast the attack plays.
const KIT = {
  knight: { idle: 'Idle_Shield_Loop', atk: ['Sword_Regular_A', 'Sword_Regular_B'], atkSpeed: 1.0, fpIdle: 'Pistol_Idle_Loop', fpAt: [0.22, -0.28, -0.5], fpTilt: [-0.4, 0, -0.55] },
  gunslinger: { idle: 'Idle_Loop', atk: ['Pistol_Shoot'], atkSpeed: 2.2, close: 'Melee_Hook', fpIdle: 'Pistol_Idle_Loop', fpAt: [0.2, -0.24, -0.45] },
  architect: { idle: 'Idle_Loop', atk: ['Sword_Regular_B', 'Melee_Hook'], atkSpeed: 1.0, fpIdle: 'Pistol_Idle_Loop', fpAt: [0.22, -0.28, -0.5], fpTilt: [-0.4, 0, -0.55] },
  charmer: { idle: 'Idle_Loop', atk: ['OverhandThrow'], atkSpeed: 2.2, fpIdle: 'Pistol_Idle_Loop', fpAt: [0.24, -0.26, -0.48] },
  ranger: { idle: 'Idle_Loop', atk: ['Spell_Simple_Shoot'], atkSpeed: 1.4, fpIdle: 'Pistol_Idle_Loop', fpHand: 'hand_l', fpAt: [-0.16, -0.24, -0.5] },
  brawler: { idle: 'Idle_Loop', atk: ['Melee_Hook', 'Sword_Regular_B'], atkSpeed: 1.1 },
  shooter: { idle: 'Idle_Loop', atk: ['Pistol_Shoot'], atkSpeed: 1.6 },
  heavy: { idle: 'Idle_Loop', atk: ['Pistol_Shoot'], atkSpeed: 1.2 },
};

// A rotation that sends the gear's +Y axis to `y` and its +Z axis to `z` (in the bone's frame).
function basis(y, z) { const Y = new THREE.Vector3(...y).normalize(), Z = new THREE.Vector3(...z).normalize(), X = new THREE.Vector3().crossVectors(Y, Z);
  return new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z)); }
// Held items: the grip runs along the hand's +Z (thumb side), the hand's +Y runs along the fingers, the palm is -X on the
// right hand and +X on the left. Blades and handles point along +Z, their flats face the palm.
const GRIP_R = basis([0, 0, 1], [-1, 0, 0]), GRIP_L = basis([0, 0, 1], [1, 0, 0]);
function findBone(root, name) { let b = null; root.traverse(o => { if (!b && o.isBone && o.name === name) b = o; }); return b; }

// Plate gauntlets drawn onto the hands themselves: each vertex's weight on the hand and finger bones blends the
// texture to blued steel (metallic, scratched), so the knight's hands are armoured in both cameras.
function armHands(m, g) {
  const geo = m.geometry, J = geo.attributes.skinIndex, W = geo.attributes.skinWeight, a = new Float32Array(J.count);
  const isHand = m.skeleton.bones.map(b => /^(upperarm|lowerarm|hand|index|middle|ring|pinky|thumb|foot|ball)/.test(b.name)); // vambraces, gauntlets and sabatons
  for (let i = 0; i < J.count; i++) { let s = 0; for (let c = 0; c < 4; c++) if (isHand[J.getComponent(i, c)]) s += W.getComponent(i, c); a[i] = Math.min(1, s * 1.6); }
  geo.setAttribute('glove', new THREE.BufferAttribute(a, 1));
  const prev = m.material.onBeforeCompile, key = m.material.customProgramCacheKey?.() || '';
  m.material = m.material.clone(); m.material.roughnessMap = mats().steel.roughnessMap; m.material.normalMap = mats().steel.normalMap; m.material.normalScale = new THREE.Vector2(0.5, 0.5);
  m.material.onBeforeCompile = (sh, r) => { prev?.call(m.material, sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float glove; varying float vGlove;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlove = glove;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlove;')
      .replace('#include <color_fragment>', `#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${g.map(v => v.toFixed(3)).join(',')}), smoothstep(0.35, 0.7, vGlove));`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(metalnessFactor, 1.0, smoothstep(0.35, 0.7, vGlove));')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.42, smoothstep(0.35, 0.7, vGlove));'); };
  m.material.customProgramCacheKey = () => key + 'glove';
}

// Bind a skinned mesh from another document (head, hair) to the outfit's skeleton by bone name.
function graft(target, srcScene, armature) {
  const out = [];
  srcScene.traverse(o => { if (!o.isSkinnedMesh) return;
    const m = new THREE.SkinnedMesh(o.geometry, o.material);
    const bones = o.skeleton.bones.map(b => findBone(target, b.name));
    m.bind(new THREE.Skeleton(bones, o.skeleton.boneInverses), o.bindMatrix); m.name = o.name;
    armature.add(m); out.push(m); });
  return out;
}

function dress(ch) {
  const look = LOOKS[ch.id], body = SkeletonUtils.clone(docs[look.outfit].scene);
  let armature = null; body.traverse(o => { if (!armature && o.name === 'Armature') armature = o; }); armature ||= body;
  const meshes = [];
  body.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  for (const m of meshes) if (look.hide && look.hide.test(m.name)) m.visible = false;
  // recolour the cloth texture
  if (look.remap) for (const m of meshes) { const mm = m.material; if (/Ranger|Peasant/.test(mm.name)) m.material = remapMaterial(mm, look.remap); }
  if (look.gloves) for (const m of meshes) if (/Arms|Body|Feet|Legs/.test(m.name)) armHands(m, look.gloves);
  // head and hair from the base-character kit, bound to this skeleton
  const extra = graft(body, docs[look.head].scene, armature);
  for (const h of look.hair || []) extra.push(...graft(body, docs[h].scene, armature));
  for (const m of extra) if (/Hair|hair|Beard|brow/i.test(m.material.name + m.name) && m.material.color) { m.material = m.material.clone(); m.material.color.set(ch.id === 'charmer' ? 0x6a3a1c : ch.id === 'knight' ? 0x3a2a1c : 0x4a3020); }
  if (look.hide) for (const m of extra) if (look.hide.test(m.name)) m.visible = false;
  meshes.push(...extra);
  for (const m of meshes) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
  // gear
  const parts = {};
  for (const [bone, obj, p, r, role] of look.gear(ch)) { const b = findBone(body, bone); obj.position.set(...p); if (r.isEuler) obj.rotation.copy(r); else obj.rotation.set(...r); b.add(obj); if (role) parts[role] = obj; obj.userData.bone = bone; obj.userData.role = role; }
  return { body, meshes, parts };
}

// Third-person character. The model faces -Z like the rest of the game; userData.anim drives it.
export function buildCharacter(ch) {
  const root = new THREE.Group(), { body, parts } = dress(ch);
  body.rotation.y = Math.PI; body.scale.setScalar(LOOKS[ch.id].scale || 1); root.add(body);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(ch.color).multiplyScalar(2.2), transparent: true, opacity: 0.85, depthWrite: false }));
  ring.position.y = 0.06; ring.visible = false; root.add(ring);
  root.userData = { ring, weapon: parts.weapon, knife: parts.knife, offhand: parts.offhand, body, anim: new Animator(body, ch) };
  return root;
}
// slice 12: eating, the hand to the mouth (k 0..1), laid over whatever the animation did this frame: the right upper arm
// comes forward and up, the forearm folds, a leg of roast meat is in the hand and the weapon is put away meanwhile
let MEATM = null;
export function eatPose(root, k) { const u = root.userData; if (!u.eatB) u.eatB = ['upperarm_r', 'lowerarm_r', 'hand_r'].map(n => findBone(u.body, n));
  const [ua, la, hd] = u.eatB; if (!ua || !la) return;
  if (!u.meat && hd) { MEATM ||= [new THREE.MeshStandardMaterial({ color: 0x7a3a1c, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.7 })];
    const g = new THREE.Group(), a = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), MEATM[0]), b = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.09, 6), MEATM[1]); a.scale.set(1, 1.4, 0.85); b.position.y = -0.09; g.add(a, b); g.position.set(-0.02, 0.09, 0.02); g.visible = false; hd.add(g); u.meat = g; }
  if (u.meat) u.meat.visible = k > 0.05; if (u.weapon) u.weapon.visible = !(k > 0.05) && u.weapon.userData.keep !== false;
  if (k > 0) { ua.rotateX(-1.25 * k); ua.rotateZ(0.35 * k); la.rotateX(-1.9 * k); } }
// slice 12: gear added after the character is built (the Architect's nail gun once upgraded), on one of its bones
export function attachGear(root, bone, obj, p = [0, 0, 0], r = [0, 0, 0]) { const b = findBone(root.userData.body, bone); if (!b) return; obj.position.set(...p); obj.rotation.set(...r); b.add(obj); }

// First person: the same character's arms, sleeves and weapon, posed by the kit's first-person idle, with the camera at its eyes.
export function buildViewModel(ch) {
  const { body, meshes, parts } = dress(ch);
  // the whole arm from shoulder to fingertips, so the sleeve runs on past the screen's edge instead of ending in a
  // cut ring; triangles riding the collarbone, chest or head are dropped (nothing of the torso floats in view)
  const FORE = /^(upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)/;
  const oneHand = !!KIT[ch.id].fpTilt; // the tilted one-handed blades: drop the empty left hand (it crossed into view)
  for (const m of meshes) {
    m.visible = /Arms|Bracer/.test(m.name) && !/Pauldron/.test(m.name); if (!m.visible) continue;
    const g = m.geometry, J = g.attributes.skinIndex, W = g.attributes.skinWeight, ok = new Uint8Array(J.count);
    for (let i = 0; i < J.count; i++) { let best = 0, bw = -1; for (let c = 0; c < 4; c++) { const w = W.getComponent(i, c); if (w > bw) { bw = w; best = J.getComponent(i, c); } } const bn = m.skeleton.bones[best].name; ok[i] = FORE.test(bn) && !(oneHand && /_l$/.test(bn)) ? 1 : 0; }
    const idx = g.index.array, keep = []; for (let t = 0; t < idx.length; t += 3) if (ok[idx[t]] && ok[idx[t + 1]] && ok[idx[t + 2]]) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    const ng = g.clone(); ng.setIndex(keep); m.geometry = ng;
  }
  // gear on the head, torso and upper arms is hidden; gear on the forearms and hands stays
  body.traverse(o => { if (o.userData.bone && (!/arm|hand/.test(o.userData.bone) || o.userData.role === 'offhand' || o.userData.role === 'shoulder' || (oneHand && /_l$/.test(o.userData.bone)))) o.visible = false; });
  for (const m of meshes) m.castShadow = false;
  body.traverse(o => { if (o.isMesh) o.castShadow = false; });
  const holder = new THREE.Group(), inner = new THREE.Group(); body.rotation.y = Math.PI; inner.add(body); holder.add(inner);
  const anim = new Animator(body, ch, true); anim.update(0.001);
  // place the body so the weapon hand sits where a first-person weapon belongs (camera space: x right, y up, -z ahead)
  const k = KIT[ch.id], hand = findBone(body, k.fpHand || 'hand_r'); holder.updateMatrixWorld(true);
  const hp = hand.getWorldPosition(new THREE.Vector3()); holder.worldToLocal(hp);
  // a pivot at the hand tilts the weapon (melee blades lean right and away instead of standing up through the crosshair)
  const pivot = new THREE.Group(); pivot.position.set(...(k.fpAt || [0.24, -0.3, -0.5])); if (k.fpTilt) pivot.rotation.set(...k.fpTilt);
  holder.remove(inner); pivot.add(inner); holder.add(pivot); inner.position.copy(hp).negate();
  holder.userData = { anim, body, inner, head: findBone(body, 'Head'), weapon: parts.weapon };
  return holder;
}

// ── Animation ─────────────────────────────────────────────────────────────
class Animator {
  constructor(body, ch, fp = false) {
    this.mixer = new THREE.AnimationMixer(body); this.kit = KIT[ch.id]; this.fp = fp; this.acts = {}; this.base = null; this.oneShot = null; this.atkN = 0; this.dead = false;
    const get = (name) => { if (!this.acts[name]) { const c = clips[name]; if (!c) return null; this.acts[name] = this.mixer.clipAction(c); } return this.acts[name]; };
    this.get = get;
    this.setBase(fp ? this.kit.fpIdle : this.kit.idle, 0);
    this.mixer.addEventListener('finished', (e) => { if (this.oneShot && e.action === this.oneShot.a) { this.oneShot.a.fadeOut(0.15); this.oneShot = null; } });
  }
  setBase(name, fade = 0.25) {
    if (this.baseName === name) return; const a = this.get(name); if (!a) return;
    a.reset().setEffectiveWeight(1).play(); if (this.base) { this.base.crossFadeTo(a, fade, false); a.setEffectiveWeight(1); } this.base = a; this.baseName = name;
  }
  play(name, { upper = false, speed = 1, weight = 8 } = {}) {
    const a = this.get(upper ? name + '_upper' : name); if (!a) return;
    if (this.oneShot) this.oneShot.a.stop();
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; a.timeScale = speed; a.setEffectiveWeight(weight); a.fadeIn(0.06); a.play();
    this.oneShot = { a, name };
  }
  attack(moving, close = false) { const k = this.kit; if (close && k.close) return this.play(k.close, { upper: moving || this.fp, speed: 1.6 }); const n = k.atk[this.atkN++ % k.atk.length]; this.play(n, { upper: moving || this.fp, speed: k.atkSpeed }); }
  hit() { if (!this.dead) this.play(Math.random() < 0.5 ? 'Hit_Chest' : 'Hit_Head', { upper: true, speed: 1.2, weight: 4 }); }
  die() { this.dead = true; if (this.oneShot) { this.oneShot.a.stop(); this.oneShot = null; } const a = this.get('Death01'); a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
    a.setEffectiveWeight(1); this.base.crossFadeTo(a, 0.2, false); a.play(); this.base = a; this.baseName = 'Death01'; }
  revive() { this.dead = false; this.baseName = null; for (const a of Object.values(this.acts)) a.stop(); this.base = null; this.setBase(this.kit.idle, 0); }
  // speed in m/s along the ground; state flags from the game
  update(dt, { speed = 0, onGround = true, swimming = false, kneel = false } = {}) { // kneel: reviving a friend (co-op)
    if (!this.dead && !this.fp) {
      let name = this.kit.idle, ts = 1;
      if (swimming) name = speed > 0.5 ? 'Swim_Fwd_Loop' : 'Swim_Idle_Loop';
      else if (!onGround) name = 'Jump_Loop';
      else if (speed > 6.2) { name = 'Sprint_Loop'; ts = speed / 7.5; }
      else if (speed > 3.0) { name = 'Jog_Fwd_Loop'; ts = speed / 4.6; }
      else if (speed > 0.3) { name = 'Walk_Loop'; ts = Math.max(0.6, speed / 1.7); }
      else if (kneel) name = 'Fixing_Kneeling';
      this.setBase(name, 0.22); if (this.base) this.base.timeScale = Math.min(1.6, Math.max(0.5, ts));
    }
    this.mixer.update(dt);
  }
}

export const LOOK_IDS = Object.keys(LOOKS);
