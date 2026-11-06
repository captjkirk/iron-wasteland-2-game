// Trees and bushes grown with ez-tree (MIT, @dgreenheck/ez-tree), baked once at load into unit-height geometry
// (instance scale = height in metres), drawn with our own PBR materials, plus an 8-view impostor atlas per species
// for the far billboards. Bark textures are ez-tree's (Poly Haven and TextureCan, both CC0); leaf cards are ez-tree's.
import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';
import { Q } from './config.js';
import { skyLight } from './environment.js';

export const wind = { value: 0 };
const VIEWS = 8;

// Lighter geometry than the presets: fewer ring sections and sides, fewer but larger leaf cards.
function lighten(o, k) {
  for (const l in o.branch.sections) o.branch.sections[l] = Math.max(3, Math.round(o.branch.sections[l] * k.sec));
  for (const l in o.branch.segments) o.branch.segments[l] = Math.max(3, Math.min(o.branch.segments[l], l === '0' ? k.seg0 : 4));
  o.leaves.count = Math.max(1, Math.round(o.leaves.count * k.leaf)); o.leaves.size *= k.leafSize;
}
// height range (m), ez-tree preset, variant tweaks, leaf/bark tints
export const SPECIES = {
  pine:      { h: [14, 24], preset: ['Pine Large', 'Pine Medium', 'Pine Large'], k: { sec: 0.6, seg0: 6, leaf: 0.6, leafSize: 1.25 }, leaf: 0x9fb08a, bark: 0xc8b8a8, crown: 0.62 },
  oak:       { h: [11, 17], preset: ['Oak Large', 'Oak Medium', 'Ash Large'], k: { sec: 0.6, seg0: 7, leaf: 0.65, leafSize: 1.2 }, leaf: 0xb8c890, bark: 0xd8ccbc, crown: 0.6 },
  aspen:     { h: [13, 19], preset: ['Aspen Large', 'Aspen Medium'], k: { sec: 0.6, seg0: 6, leaf: 0.8, leafSize: 1.1 }, leaf: 0xd8e098, bark: 0xffffff, crown: 0.65 },
  snowpine:  { h: [10, 20], preset: ['Pine Medium', 'Pine Large'], k: { sec: 0.6, seg0: 6, leaf: 0.6, leafSize: 1.25 }, leaf: 0xc8d4d4, bark: 0xb0a8a0, crown: 0.6, snow: true },
  deadtree:  { h: [6, 11], preset: ['Ash Medium', 'Oak Medium'], k: { sec: 0.6, seg0: 6, leaf: 0, leafSize: 1 }, leaf: 0xffffff, bark: 0x9a9088, crown: 0.6, dead: true },
  swamptree: { h: [8, 13], preset: ['Oak Medium', 'Ash Medium'], k: { sec: 0.6, seg0: 6, leaf: 0.5, leafSize: 1.3 }, leaf: 0x6c7450, bark: 0x8a8070, crown: 0.55, droop: true },
  bush:      { h: [1.3, 2.6], preset: ['Bush 1', 'Bush 2', 'Bush 3'], k: { sec: 0.45, seg0: 4, leaf: 0.7, leafSize: 1.35 }, leaf: 0xa8bc88, bark: 0xb0a090, crown: 0.5, bush: true },
  drybush:   { h: [0.8, 1.6], preset: ['Bush 2', 'Bush 1'], k: { sec: 0.45, seg0: 4, leaf: 0.35, leafSize: 1.0 }, leaf: 0xc8a070, bark: 0x9a8a78, crown: 0.5, bush: true },
};

function grow(sp, v) {
  const t = new Tree(); t.loadPreset(sp.preset[v % sp.preset.length]); const o = t.options;
  o.seed = 1000 + v * 7919 + sp.h[0] * 13; lighten(o, sp.k);
  if (sp.dead) { o.leaves.count = 0; o.branch.gnarliness[1] += 0.12; o.branch.gnarliness[2] += 0.12; o.branch.levels = Math.min(o.branch.levels, 3); }
  if (sp.droop) { o.branch.force.strength = -0.06; o.bark.type = 'willow'; o.branch.gnarliness[1] += 0.08; }
  if (sp.snow) o.leaves.type = 'pine';
  t.generate();
  const bg = t.branchesMesh.geometry, lg = t.leavesMesh.geometry; bg.computeBoundingBox();
  const lb = o.leaves.count ? (lg.computeBoundingBox(), lg.boundingBox) : bg.boundingBox;
  const top = Math.max(bg.boundingBox.max.y, lb.max.y), k = 1 / top;
  bg.scale(k, k, k); if (o.leaves.count) lg.scale(k, k, k);
  // canopy normals point out from the crown's centre, so the whole crown shades like a volume, not a pile of cards
  if (o.leaves.count) { const p = lg.attributes.position, n = lg.attributes.normal, c = new THREE.Vector3(0, sp.crown, 0), a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { a.fromBufferAttribute(p, i).sub(c); a.y *= 1.4; a.normalize(); b.fromBufferAttribute(n, i);
      a.multiplyScalar(0.8).addScaledVector(b, 0.2); a.y = a.y * 0.6 + 0.55; a.normalize(); /* tipped skywards: crown undersides still see the sky */ n.setXYZ(i, a.x, a.y, a.z); } }
  return { bark: bg, leaves: o.leaves.count ? lg : null, barkSrc: t.branchesMesh.material, leafSrc: t.leavesMesh.material, tree: t };
}

function cloneTex(t, rx, ry) { const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(rx, ry); c.needsUpdate = true; return c; }
function leafMaterial(src, tint, snow) {
  const m = new THREE.MeshStandardMaterial({ map: src.map, color: tint, alphaTest: 0.5, alphaToCoverage: Q.antialias, side: THREE.DoubleSide, roughness: 0.82, metalness: 0, envMapIntensity: 0.85 });
  m.customProgramCacheKey = () => snow ? 'iw-leaf-snow' : 'iw-leaf';
  m.onBeforeCompile = (sh) => { sh.uniforms.uWind = wind;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 wp = instanceMatrix[3].xz; float ph = dot(wp, vec2(0.13, 0.11));
        transformed.xz += vec2(sin(uWind * 1.3 + ph + position.y * 3.0), cos(uWind * 1.1 + ph * 1.3)) * 0.012 * position.y * uv.y;
      #endif
      vSnowUp = normal.y;`).replace('void main() {', 'varying float vSnowUp;\nvoid main() {');
    sh.fragmentShader = 'varying float vSnowUp;\n' + sh.fragmentShader;
    if (snow) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.97), smoothstep(0.05, 0.6, vSnowUp) * 0.85);`);
    // light through the leaves (translucency): leaves facing away from the sun still glow a little with its colour
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
        float iwBack = 0.35 + 0.65 * max(0.0, -dot(normal, directionalLights[0].direction));
        reflectedLight.indirectDiffuse += diffuseColor.rgb * directionalLights[0].color * 0.045 * iwBack;
      #endif`);
    // canopy normals are already outward: do not flip them on back faces
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
  };
  return m;
}

// ── Impostors: render each variant from 8 directions into an atlas row; billboards pick the nearest view ──
function bakeAtlas(renderer, variants, mats, res, bg) {
  const W = res * VIEWS, H = res * variants.length;
  const rt = new THREE.WebGLRenderTarget(W, H, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.SRGBColorSpace, samples: 0 });
  const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xd8e4f0, 0x5a5040, 1.5));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.6); scene.add(sun, sun.target);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, 0, 0.01, 10);
  const prev = { rt: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), auto: renderer.autoClear, sh: renderer.shadowMap.enabled };
  renderer.setRenderTarget(rt); renderer.setClearColor(bg, 0); /* the species' own mid colour: edge texels and mipmaps fade to it, not to black */ renderer.autoClear = false; renderer.clear(); renderer.shadowMap.enabled = false;
  variants.forEach((v, row) => {
    const g = new THREE.Group(); g.add(new THREE.Mesh(v.bark, mats.bark)); if (v.leaves) g.add(new THREE.Mesh(v.leaves, mats.leafBake)); scene.add(g);
    const hw = v.halfW; cam.left = -hw; cam.right = hw; cam.top = 1.02; cam.bottom = -0.02; cam.updateProjectionMatrix();
    for (let k = 0; k < VIEWS; k++) { const a = k * Math.PI * 2 / VIEWS; cam.position.set(Math.sin(a) * 4, 0.5, Math.cos(a) * 4); cam.lookAt(0, 0.5, 0);
      // the sun keeps its world height and swings with the view so every frame is lit from the same side of the screen
      sun.position.set(Math.sin(a) * 2 + Math.cos(a) * 2.5, 3, Math.cos(a) * 2 - Math.sin(a) * 2.5);
      rt.viewport.set(k * res, row * res, res, res); rt.scissor.set(k * res, row * res, res, res); rt.scissorTest = true;
      renderer.setRenderTarget(rt); renderer.render(scene, cam); }
    scene.remove(g);
  });
  rt.scissorTest = false; rt.viewport.set(0, 0, W, H);
  renderer.setRenderTarget(prev.rt); renderer.setClearColor(prev.color, prev.alpha); renderer.autoClear = prev.auto; renderer.shadowMap.enabled = prev.sh;
  return rt.texture;
}
const impVS = `
  uniform vec2 uCell; uniform float uRow, uHalfW;
  varying vec2 vUv; varying float vShade;
  #include <fog_pars_vertex>
  void main() {
    vec3 base = instanceMatrix[3].xyz; float s = length(instanceMatrix[1].xyz);
    float yaw = atan(-instanceMatrix[0].z, instanceMatrix[0].x);
    vec3 toCam = cameraPosition - base; float th = atan(toCam.x, toCam.z);
    float a = th - yaw; float k = mod(floor(a / 6.2831853 * ${VIEWS}.0 + 0.5), ${VIEWS}.0);
    vec3 right = vec3(cos(th), 0.0, -sin(th));
    vec3 wp = base + right * position.x * uHalfW * s + vec3(0.0, position.y * s, 0.0);
    vUv = vec2((k + position.x * 0.5 + 0.5) * uCell.x, (uRow + (position.y + 0.02) / 1.04) * uCell.y);
    vShade = 0.9 + 0.1 * fract(sin(dot(base.xz, vec2(12.9898, 78.233))) * 43758.5453);
    vec4 mvPosition = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const impFS = `
  uniform sampler2D uMap; uniform float uBright; uniform vec4 uTint; uniform vec3 uSky;
  varying vec2 vUv; varying float vShade;
  #include <fog_pars_fragment>
  void main() {
    vec4 c = texture2D(uMap, vUv); if (c.a < 0.5) discard;
    gl_FragColor = vec4(mix(c.rgb * uBright, uTint.rgb, uTint.a) * vShade * uSky, 1.0); // (uSky: the light of the hour, slice 13)
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;
function impostorMaterial(tex, row, rows, halfW, bright, tint = [0, 0, 0, 0]) {
  return new THREE.ShaderMaterial({ vertexShader: impVS, fragmentShader: impFS, fog: true, side: THREE.DoubleSide,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uMap: { value: tex }, uCell: { value: new THREE.Vector2(1 / VIEWS, 1 / rows) },
      uRow: { value: row }, uHalfW: { value: halfW }, uBright: { value: bright }, uTint: { value: new THREE.Vector4(...tint) }, uSky: skyLight } });
}
const quad = new THREE.PlaneGeometry(2, 1, 1, 1).translate(0, 0.5, 0);

// Build every species: returns { name: { variants: [{ parts, far, halfW }] } } ready for scatter layers.
const loaded = (t) => new Promise(r => { const ok = () => t?.image && t.image.complete !== false && (t.image.naturalWidth ?? 1) > 0;
  if (!t || ok()) return r(); const id = setInterval(() => { if (ok()) { clearInterval(id); r(); } }, 30); });
export async function buildTrees(renderer, names) {
  const out = {};
  for (const name of names) {
    const sp = SPECIES[name], nv = sp.bush ? 3 : sp.preset.length === 3 ? 3 : 2, vs = [];
    for (let v = 0; v < nv; v++) vs.push(grow(sp, v));
    const src = vs[0];
    await Promise.all([loaded(src.barkSrc.map), loaded(src.barkSrc.normalMap), loaded(src.leafSrc.map)]);
    const bark = new THREE.MeshStandardMaterial({ map: cloneTex(src.barkSrc.map, sp.bush ? 1 : 2, sp.bush ? 2 : 6), normalMap: cloneTex(src.barkSrc.normalMap, sp.bush ? 1 : 2, sp.bush ? 2 : 6),
      color: sp.bark, roughness: 0.92, metalness: 0, normalScale: new THREE.Vector2(1.2, 1.2) });
    const leaf = src.leaves ? leafMaterial(src.leafSrc, sp.leaf, sp.snow) : null;
    const leafBake = src.leaves ? new THREE.MeshStandardMaterial({ map: src.leafSrc.map, color: sp.snow ? 0xe0e8ec : sp.leaf, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }) : null;
    if (leafBake) leafBake.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0')); };
    for (const v of vs) { const b = new THREE.Box3().setFromBufferAttribute(v.bark.attributes.position); if (v.leaves) b.union(new THREE.Box3().setFromBufferAttribute(v.leaves.attributes.position));
      v.halfW = Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z) * 1.04; }
    const atlas = bakeAtlas(renderer, vs, { bark, leafBake }, Q.impostorRes, new THREE.Color(src.leaves && name !== 'drybush' ? sp.leaf : sp.bark).multiplyScalar(src.leaves && name !== 'drybush' ? 0.32 : 0.6));
    out[name] = { variants: vs.map((v, row) => ({ halfW: v.halfW,
      parts: [{ geo: v.bark, mat: bark, cast: true, name: name + ' bark' }, ...(v.leaves ? [{ geo: v.leaves, mat: leaf, cast: true, receive: false, name: name + ' leaves' }] : [])],
      far: [{ geo: quad, mat: impostorMaterial(atlas, row, vs.length, v.halfW, sp.dead || name === 'drybush' ? 1.35 : sp.bush ? 0.85 : 0.8, sp.dead ? [0.3, 0.27, 0.23, 0.75] : [0, 0, 0, 0]), cast: false, receive: false, name: name + ' impostor' }] })) };
    for (const v of vs) v.tree.leavesMesh.material.dispose?.();
  }
  return out;
}
