// Sky, sun, fog, image-based ambient light, shadows that follow the player, and water. Slice 13: the sun moves (setTime),
// sets in colour and gives way to the moon and the stars; built fires and torches light the night (fireLights).
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { WORLD, WATER_Y, Q, HALF, CELL, SEG, N } from './config.js';
import { H, river } from './world.js';
import { vnoise, smooth, clamp01 } from './noise.js';
import { sunElev, sunAz, moonElev, moonAz, nightK } from './daynight.js';
// what the far trees (baked billboards, unlit) are multiplied by: the light of the hour (trees.js)
export const skyLight = { value: new THREE.Color(1, 1, 1) };

const SUN_ELEV = 34, SUN_AZ = 205; // degrees: a mid-afternoon sun from the south-west
export const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - SUN_ELEV), THREE.MathUtils.degToRad(SUN_AZ));
export const FOG_COLOR = new THREE.Color(0xa9bccc);

export function buildEnvironment(scene, renderer, camera) {
  const sky = new Sky(); const u = sky.material.uniforms;
  u.turbidity.value = 5.5; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.78; u.sunPosition.value.copy(SUN_DIR);
  sky.scale.setScalar(Q.drawDist * 0.5); sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);

  // ambient light from the sky itself (prefiltered environment map)
  const pmrem = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(), envSky = new Sky();
  envSky.material.uniforms = THREE.UniformsUtils.clone(sky.material.uniforms); envSky.scale.setScalar(900);
  envScene.add(envSky);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(800, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5a5444 }));
  ground.position.y = -40; envScene.add(ground);
  scene.environment = pmrem.fromScene(envScene, 0, 1, 2000).texture; pmrem.dispose();

  // clouds: a drifting fbm layer on a plane high over the camera, lit from the sun's side, thinning to the horizon
  const cloudMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uSun: { value: SUN_DIR.clone() }, uR: { value: Q.drawDist * 0.95 }, uTint: { value: new THREE.Color(1, 1, 1) }, uA: { value: 0.8 } },
    vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime, uR, uA; uniform vec3 uSun, uTint; varying vec3 vW;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
      void main() {
        vec2 p = vW.xz * 0.0042 + vec2(uTime * 0.006, uTime * 0.0025);
        float c = fbm(p), d = fbm(p * 2.6 + 4.0);
        float cov = smoothstep(0.44, 0.72, c * 0.8 + d * 0.3);
        float r = length(vW.xz - cameraPosition.xz) / uR, fade = 1.0 - smoothstep(0.6, 1.0, r);
        float lit = 0.78 + 0.22 * smoothstep(-0.2, 0.3, fbm(p + uSun.xz * 0.06) - c);
        vec3 col = mix(vec3(0.74, 0.77, 0.82), vec3(1.0, 0.98, 0.95), lit) * (0.9 + 0.1 * (1.0 - cov)) * uTint;
        gl_FragColor = vec4(col, cov * fade * uA);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(Q.drawDist * 2, Q.drawDist * 2).rotateX(Math.PI / 2), cloudMat);
  clouds.frustumCulled = false; clouds.renderOrder = -0.5; clouds.name = 'clouds'; scene.add(clouds);

  scene.fog = new THREE.Fog(FOG_COLOR, Q.drawDist * 0.2, Q.drawDist * 1.35);
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x5a4a36, 0.35); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0dc, 3.0); sun.castShadow = Q.shadows;
  sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
  const e = Q.shadowExtent; Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: 900 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06 * (e / 70); scene.add(sun, sun.target);

  // the sun's shadow box follows the focus point, snapped to whole shadow texels so edges do not crawl
  // (L: the direction the light comes from, the sun's by day and the moon's by night)
  const texel = (2 * e) / Q.shadowSize, L = SUN_DIR.clone(), right = new THREE.Vector3(), up = new THREE.Vector3(), f = new THREE.Vector3();
  function follow(p) { right.crossVectors(L, new THREE.Vector3(0, 1, 0)).normalize(); up.crossVectors(right, L).normalize();
    const a = Math.round(p.dot(right) / texel) * texel, b = Math.round(p.dot(up) / texel) * texel, c = p.dot(L);
    f.copy(right).multiplyScalar(a).addScaledVector(up, b).addScaledVector(L, c);
    sun.target.position.copy(f); sun.position.copy(f).addScaledVector(L, 400); sky.position.copy(camera.position); night.position.copy(camera.position);
    clouds.position.set(camera.position.x, Math.max(camera.position.y, 0) + 140, camera.position.z);
  }
  // the night sky: stars (they come out as the light goes) and the moon with a soft halo, both following the camera
  const night = new THREE.Group(), R = Q.drawDist * 0.9, sp = [], sc = []; night.renderOrder = -0.8; scene.add(night);
  for (let k = 0; k < 2200; k++) { const u = Math.random(), v = Math.random() * 0.96 + 0.04, th = u * Math.PI * 2, y = v, r = Math.sqrt(1 - y * y); sp.push(Math.cos(th) * r * R, y * R, Math.sin(th) * r * R);
    const b = 0.35 + Math.random() ** 3 * 0.9, w = Math.random(); sc.push(b * (w < 0.2 ? 0.8 : 1), b * 0.92, b * (w > 0.8 ? 0.75 : 1)); }
  // behind them a dome, deep blue overhead and a little lighter at the horizon (the day sky's own night is a muddy grey)
  const domeG = new THREE.SphereGeometry(R * 1.02, 24, 12), dp = domeG.attributes.position, dc = [];
  for (let i = 0; i < dp.count; i++) { const y = Math.max(0, dp.getY(i) / (R * 1.02)); dc.push(0.045 - 0.035 * y, 0.06 - 0.045 * y, 0.11 - 0.07 * y); } domeG.setAttribute('color', new THREE.Float32BufferAttribute(dc, 3));
  const dome = new THREE.Mesh(domeG, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false })); dome.frustumCulled = false; dome.renderOrder = -0.9; night.add(dome);
  // a haze over the whole sky, in the fog's colour, for a dust storm or heavy snow (weather.js)
  const hazeM = new THREE.Mesh(new THREE.SphereGeometry(R * 1.01, 24, 12), new THREE.MeshBasicMaterial({ side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  hazeM.frustumCulled = false; hazeM.renderOrder = -0.85; hazeM.visible = false; night.add(hazeM);
  const haze = (col, a) => { hazeM.visible = a > 0.01; hazeM.material.opacity = a; hazeM.material.color.copy(col); };
  const starG = new THREE.BufferGeometry(); starG.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); starG.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  const stars = new THREE.Points(starG, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  stars.frustumCulled = false; night.add(stars);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(R * 0.035, 40), new THREE.MeshBasicMaterial({ color: 0xe8ecf4, fog: false, transparent: true, depthWrite: false }));
  const halo = new THREE.Mesh(new THREE.RingGeometry(R * 0.036, R * 0.16, 40, 3), new THREE.MeshBasicMaterial({ color: 0x8aa0d0, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.25 }));
  { const p = halo.geometry.attributes.position, a = []; for (let i = 0; i < p.count; i++) { const k = (Math.hypot(p.getX(i), p.getY(i)) - R * 0.036) / (R * 0.124); a.push(1, 1, 1, Math.pow(1 - k, 3)); }
    halo.geometry.setAttribute('color', new THREE.Float32BufferAttribute(a, 4)); halo.material.vertexColors = true; }
  for (const m of [moon, halo]) { m.frustumCulled = false; night.add(m); }
  // the shapes of its seas, darker patches on the face
  for (const [x, y, r] of [[-0.3, 0.25, 0.32], [0.25, 0.1, 0.24], [0.05, -0.35, 0.2], [-0.2, -0.1, 0.16]]) { const d = new THREE.Mesh(new THREE.CircleGeometry(R * 0.035 * r, 24), new THREE.MeshBasicMaterial({ color: 0xb8bfcc, fog: false, transparent: true, depthWrite: false }));
    d.position.set(x * R * 0.035, y * R * 0.035, 0.01); d.frustumCulled = false; moon.add(d); }

  let water; FLOW_U.flowMap.value = flowMap();
  if (Q.water === 'mirror') {
    water = new Water(new THREE.PlaneGeometry(WORLD + 600, WORLD + 600), { textureWidth: Q.waterRes, textureHeight: Q.waterRes, waterNormals: waterNormals(),
      sunDirection: SUN_DIR.clone(), sunColor: 0xfff2dc, waterColor: 0x10292e, distortionScale: 1.2, fog: true });
    water.material.uniforms.size.value = 3.0;
    // slice 31: the ripples run with the water (two phases of the flow, crossfaded), and foam laps at the shore
    const m = water.material; Object.assign(m.uniforms, FLOW_U);
    m.fragmentShader = m.fragmentShader.replace('varying vec4 worldPosition;', 'varying vec4 worldPosition;\n' + FLOW_GLSL)
      .replace('vec4 noise = getNoise( worldPosition.xz * size );', `vec4 noise = getNoise( worldPosition.xz * size );
        #ifdef FLOW
        vec4 fl = flowAt( worldPosition.xz ); vec3 ph = flowPhase( fl );
        noise = getNoise( ( worldPosition.xz - fl.xy * ph.x ) * size ) * ph.z + getNoise( ( worldPosition.xz - fl.xy * ph.y ) * size ) * ( 1.0 - ph.z );
        vec2 fu0 = ( worldPosition.xz - fl.xy * ph.x ) / 16.0, fu1 = ( worldPosition.xz - fl.xy * ph.y ) / 16.0, st = fl.xy * 0.04; // (two taps 0.6 m apart along the flow per phase: streaks, not spots)
        float foam = foamAt( fl, ( texture2D( normalSampler, fu0 ).w + texture2D( normalSampler, fu0 - st ).w ) * 0.5 * ph.z + ( texture2D( normalSampler, fu1 ).w + texture2D( normalSampler, fu1 - st ).w ) * 0.5 * ( 1.0 - ph.z ) + 0.04, worldPosition.xz ); // (the foam's own finer pattern, as on Low)
        #endif`)
      .replace('gl_FragColor = vec4( outgoingLight, alpha );', `#ifdef FLOW
        outgoingLight = mix( outgoingLight, vec3( 0.86, 0.9, 0.9 ) * ( sunColor * ( 0.8 + 0.9 * max( sunDirection.y, 0.0 ) ) * getShadowMask() + 0.12 ), foam ); // (bright enough to stand out against the mirrored sky)
        #endif
        gl_FragColor = vec4( outgoingLight, alpha );`);
    m.defines = { ...m.defines, FLOW: '' };
  } else {
    water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD + 600, WORLD + 600), new THREE.MeshStandardMaterial({ color: 0x24434a, roughness: 0.06, metalness: 0.0,
      normalMap: waterNormals(), normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.88, envMapIntensity: 1.2 }));
    water.material.normalMap.repeat.set(160, 160);
    // slice 31 on Low: the same running ripples and foam on the plain material, from one extra normal sample and the flow map
    const m = water.material; m.defines = { FLOW: '' };
    m.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, FLOW_U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <project_vertex>', '#include <project_vertex>\nvWp = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;\n' + FLOW_GLSL)
        .replace('#include <color_fragment>', `#include <color_fragment>
          #ifdef FLOW
          vec4 fl = flowAt( vWp.xz ); vec3 ph = flowPhase( fl ); vec2 nuv = vWp.xz / 10.0 + vec2( flowT * 0.003, 0.0 );
          vec4 fN = texture2D( normalMap, nuv - fl.xy * ph.x / 10.0 ) * ph.z + texture2D( normalMap, nuv - fl.xy * ph.y / 10.0 ) * ( 1.0 - ph.z );
          float foam = foamAt( fl, fN.w, vWp.xz );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.86, 0.9, 0.9 ), foam ); diffuseColor.a = mix( diffuseColor.a, 1.0, foam );
          #endif`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n#ifdef FLOW\nroughnessFactor = mix( roughnessFactor, 0.85, foam );\n#endif')
        .replace('#include <normal_fragment_maps>', `#ifdef FLOW
          vec3 mapN = fN.xyz * 2.0 - 1.0; mapN.xy *= normalScale * ( 1.0 - foam ); normal = normalize( tbn * mapN );
          #else
          #include <normal_fragment_maps>
          #endif`); };
  }
  water.name = 'water'; water.userData.flowT = FLOW_U.flowT; /* (the water check reads the flow's clock) */ water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y; water.receiveShadow = true; scene.add(water);
  // (the wind's ripples drift slowly now, 0.2 not 0.5, so on the river the current, not the wind, is what moves)
  function tick(dt) { cloudMat.uniforms.uTime.value += dt; FLOW_U.flowT.value += dt; if (water.material.uniforms?.time) water.material.uniforms.time.value += dt * 0.2;
    else water.material.normalMap.offset.x += dt * 0.004; }

  // ── the hour: t is how far through the day (daynight.js) ──
  const fogTint = new THREE.Color(1, 1, 1), c = new THREE.Color(), SUNC = { noon: new THREE.Color(0xfff0dc), low: new THREE.Color(0xff8a4a) }, MOONC = new THREE.Color(0x9ab0ff),
    sunV = new THREE.Vector3(), moonV = new THREE.Vector3(), NIGHT_FOG = new THREE.Color(0.045, 0.06, 0.1), DUSK_FOG = new THREE.Color(1.05, 0.72, 0.58);
  const dir = (v, elev, az) => v.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), az);
  function setTime(t) { const se = sunElev(t), nk = nightK(t), low = 1 - THREE.MathUtils.smoothstep(se, 2, 22); // low: near the horizon
    dir(sunV, se, sunAz(t)); dir(moonV, Math.max(6, moonElev(t)), moonAz(t)); u.sunPosition.value.copy(sunV); cloudMat.uniforms.uSun.value.copy(sunV);
    // the one shadow-casting light: the sun until it sets, then the moon (fading through between, so it never jumps lit)
    const sunUp = THREE.MathUtils.smoothstep(se, -3, 5), moonUp = THREE.MathUtils.smoothstep(-se, 3, 10);
    if (se > -3) { L.copy(sunV); sun.color.copy(SUNC.noon).lerp(SUNC.low, low); sun.intensity = 3.0 * sunUp * (1 - 0.35 * low); }
    else { L.copy(moonV); sun.color.copy(MOONC); sun.intensity = 0.32 * moonUp; }
    if (L.y < 0.12) L.y = 0.12; L.normalize();
    hemi.intensity = 0.35 - 0.25 * nk; hemi.color.setRGB(0.81, 0.88, 1).lerp(c.setRGB(1, 0.62, 0.55), low * (1 - nk) * 0.7).lerp(c.setRGB(0.35, 0.45, 0.75), nk); // (rose at sunrise and sunset)
    scene.environmentIntensity = 1 - 0.86 * nk - 0.65 * low * (1 - nk);
    renderer.toneMappingExposure = 0.62 + 0.3 * nk; // the eye adjusts a little
    fogTint.setRGB(1, 1, 1).lerp(DUSK_FOG, low * (1 - nk)).lerp(NIGHT_FOG, nk);
    skyLight.value.setRGB(1, 1, 1).lerp(c.setRGB(1.0, 0.78, 0.62), low * (1 - nk) * 0.6).lerp(c.setRGB(0.1, 0.13, 0.22), nk);
    cloudMat.uniforms.uTint.value.setRGB(1, 1, 1).lerp(c.setRGB(1.2, 0.75, 0.55), low * (1 - nk)).lerp(c.setRGB(0.09, 0.1, 0.14), nk); cloudMat.uniforms.uA.value = 0.8 - 0.35 * nk;
    if (water.material.uniforms?.sunDirection) { water.material.uniforms.sunDirection.value.copy(L); water.material.uniforms.sunColor.value.copy(sun.color).multiplyScalar(se > -3 ? sunUp : 0.4 * moonUp); }
    stars.material.opacity = THREE.MathUtils.smoothstep(nk, 0.4, 0.95); dome.material.opacity = 0.96 * THREE.MathUtils.smoothstep(nk, 0.2, 0.9); dome.visible = nk > 0.2; moon.position.copy(moonV).multiplyScalar(R * 0.92); moon.lookAt(night.position); halo.position.copy(moon.position); halo.quaternion.copy(moon.quaternion);
    moon.material.opacity = halo.material.opacity = THREE.MathUtils.smoothstep(nk, 0.2, 0.8) * (moonElev(t) > -2 ? 1 : 0); halo.material.opacity *= 0.3;
    for (const d of moon.children) d.material.opacity = moon.material.opacity; }

  // ── firelight: a few warm point lights, always in the scene (adding or removing a light recompiles every material), given to
  // the flames that matter most on screen: the nearest in view first (one behind the camera counts as ten times as far), a
  // campfire before the torches round it, and a flame that has a light keeps it unless another is clearly nearer. A light
  // moving to another flame fades out, then in (about half a second in all), so no flame goes dark in one frame; every torch
  // also paints its own glow on the ground (torch.js), so a torch without a real light still lights its patch of ground
  // (slice 26 follow-up, Jared 2026-11-15: "torch light seems to stop working when you're a few steps away?") ──
  const pool = []; for (let k = 0; k < Q.fireLights; k++) { const l = new THREE.PointLight(0xff8a3a, 0, 26, 1.25); l.userData = { id: null, s: null, w: 0 }; scene.add(l); pool.push(l); }
  const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere(undefined, 1.5), FADE = 4; let lastT = 0;
  const sid = (s) => s.who ?? `${s.key}${s.x.toFixed(1)},${s.y.toFixed(1)},${s.z.toFixed(1)}`; // (a carried torch moves: it goes by its carrier)
  function fireLights(spots, cam, nk, t) { cam.updateMatrixWorld(); const at = cam.position, dt = Math.min(0.05, Math.max(0, t - lastT)); lastT = t;
    _fr.setFromProjectionMatrix(_pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)); const held = new Set(pool.map(l => l.userData.id)), all = new Map(), rank = [];
    for (const s of spots) { const id = sid(s), d2 = (s.x - at.x) ** 2 + (s.z - at.z) ** 2; all.set(id, s); if (d2 > 70 * 70) continue; _sph.center.set(s.x, s.y, s.z);
      rank.push([id, d2 * (s.w ?? (s.key === 'torch' ? 2.5 : 1)) * (_fr.intersectsSphere(_sph) ? 1 : 10) * (held.has(id) ? 0.7 : 1)]); }
    const want = new Set(rank.sort((a, b) => a[1] - b[1]).slice(0, pool.length).map(q => q[0]));
    for (const l of pool) { const u = l.userData; if (u.id && want.has(u.id) && all.has(u.id)) u.w = Math.min(1, u.w + dt * FADE); else { u.w = Math.max(0, u.w - dt * FADE); if (!u.w) u.id = null; } u.s = all.get(u.id) ?? u.s; }
    for (const id of want) if (!held.has(id)) { const l = pool.find(q => !q.userData.id); if (!l) break; Object.assign(l.userData, { id, s: all.get(id), w: 0 }); } // (a free light starts dark and fades in)
    pool.forEach((l, k) => { const u = l.userData, s = u.s; if (!s || !u.w) { l.intensity = 0; return; } const fl = 1 + Math.sin(t * 13 + k * 1.7) * 0.1 + Math.sin(t * 7.3 + k) * 0.08 + Math.sin(t * 23.1 + k * 3) * 0.05;
      l.color.setHex(s.c ?? 0xff8a3a); /* (a place's lamp: its own warmth) */ l.position.set(s.x, s.y + (s.dy ?? (s.key === 'torch' ? 0.15 : 0.5)), s.z); l.distance = s.dist ?? (s.key === 'torch' ? 16 : 26); l.intensity = (s.i ?? (s.key === 'torch' ? 9 : 18)) * /* (slice 26: a carried torch is brighter) */ fl * (0.12 + 0.88 * nk) * u.w; }); } // (slice 21, Jared 2026-11-14: "fires and torches dont seem to be putting off a lot of light": the glow reached about 3 m; now about 8 to 10)
  return { sky, sun, water, follow, tick, setTime, fireLights, haze, fogTint, normals: waterNormals(), fogNear: Q.drawDist * 0.2, fogFar: Q.drawDist * 1.35 };
}

// ── Running water (slice 31, issue #61; Jared, November 14, 2026: "river water should look like its 'running'") ──
// The flow map: per 2 m square of the world, which way and how fast the water runs (the river downstream, its points' own
// order, faster in its narrows; lakes and ponds still), how deep it is (the shore's foam and lapping), and a slow random phase
// (so the lapping is not in step all round a lake). Made once from the height field; a 512 x 512 texture, 1 MB.
const FLOW_MAX = 3; // m/s at full scale in the map
function flowMap() {
  const S = SEG, d = new Uint8Array(S * S * 4), hAt = (x, z) => H[Math.min(SEG, Math.max(0, Math.round((z + HALF) / CELL))) * N + Math.min(SEG, Math.max(0, Math.round((x + HALF) / CELL)))];
  const halfW = river.map((p, k) => { const a = river[Math.max(0, k - 1)], b = river[Math.min(river.length - 1, k + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
    let w = 0; for (const s of [1, -1]) { let t = 0; while (t < 40 && hAt(p.x + nx * s * t, p.z + nz * s * t) < WATER_Y) t++; w += t; } return Math.max(4, w / 2); }); // (wade out both ways to dry ground)
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const h = H[j * N + i], o = (j * S + i) * 4, x = -HALF + i * CELL, z = -HALF + j * CELL;
    d[o] = d[o + 1] = 128; d[o + 2] = clamp01((WATER_Y - h + 1) / 5) * 255; d[o + 3] = vnoise(i * 0.05, j * 0.05) * 255;
    if (h > WATER_Y + 1) continue;
    let best = 1e9, bk = -1, bt = 0;
    for (let k = 0; k < river.length - 1; k++) { const a = river[k], b = river[k + 1], ex = b.x - a.x, ez = b.z - a.z, t = clamp01(((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez)), q = (x - a.x - ex * t) ** 2 + (z - a.z - ez * t) ** 2;
      if (q < best) { best = q; bk = k; bt = t; } }
    if (bk < 0) continue;
    const w = halfW[bk] + (halfW[bk + 1] - halfW[bk]) * bt, fade = 1 - smooth(w + 2, w + 10, Math.sqrt(best)); if (fade <= 0) continue;
    const a = river[bk], b = river[bk + 1], l = Math.hypot(b.x - a.x, b.z - a.z), sp = Math.min(2.6, 1.6 * 12 / w) * fade; // (about 1.3 m/s where it is 30 m wide, faster in the narrows)
    d[o] = 128 + (b.x - a.x) / l * sp / FLOW_MAX * 127; d[o + 1] = 128 + (b.z - a.z) / l * sp / FLOW_MAX * 127; }
  const t = new THREE.DataTexture(d, S, S); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}
const FLOW_U = { flowMap: { value: null }, flowT: { value: 0 } };
// boulders standing in the water (props.js): the flow map takes each one as a shore, so foam rings it
export function rocksInWater(list) { const t = FLOW_U.flowMap.value; if (!t) return; const d = t.image.data;
  for (const r of list) { const R = r.s * 0.9 + 1.5, i0 = Math.round((r.x + HALF) / CELL), j0 = Math.round((r.z + HALF) / CELL);
    for (let j = j0 - 3; j <= j0 + 3; j++) for (let i = i0 - 3; i <= i0 + 3; i++) { if (i < 0 || j < 0 || i >= SEG || j >= SEG) continue;
      const e = Math.hypot(-HALF + i * CELL - r.x, -HALF + j * CELL - r.z) - R; if (e > 2) continue; const o = (j * SEG + i) * 4;
      d[o + 2] = Math.min(d[o + 2], clamp01((1 + Math.max(0, e) * 0.25) / 5) * 255); } }
  t.needsUpdate = true; }
const FLOW_GLSL = `
  uniform sampler2D flowMap; uniform float flowT;
  // x, y: the water's velocity (m/s); z: its depth (m, below 0 on land); w: a slow random phase
  vec4 flowAt( vec2 w ) { vec4 f = texture2D( flowMap, ( w + ${(HALF + CELL / 2).toFixed(1)} ) / ${WORLD.toFixed(1)} ); return vec4( ( f.xy * 2.0 - 1.0 ) * ${FLOW_MAX.toFixed(1)}, f.z * 5.0 - 1.0, f.w ); }
  // two phases 1.2 s apart, each sliding the ripples along the flow for 2.4 s; z is the first's weight (zero as it jumps back)
  vec3 flowPhase( vec4 f ) { float p0 = fract( flowT / 2.4 + f.w ), p1 = fract( p0 + 0.5 ); return vec3( ( p0 - 0.5 ) * 2.4, ( p1 - 0.5 ) * 2.4, 1.0 - abs( 2.0 * p0 - 1.0 ) ); }
  // foam: a line where the water meets the shore, ripples of it coming in over the shallows, and broken white where the river
  // runs; pat (0..1) is the foam's own pattern, moving with the water, that breaks it up
  float foamAt( vec4 f, float pat, vec2 w ) { float d = f.z, run = smoothstep( 0.2, 1.4, length( f.xy ) );
    // how far away from the waterline (m), from the depth and how steeply it falls (the screen's derivatives give its slope),
    // so the foam is about as wide on a gravel bar as under a steep bank
    vec2 ax = dFdx( w ), ay = dFdy( w ); float det = ax.x * ay.y - ax.y * ay.x, gx = dFdx( d ), gy = dFdy( d );
    float slope = clamp( length( vec2( gx * ay.y - gy * ax.y, ax.x * gy - ay.x * gx ) / ( abs( det ) > 1e-6 ? det : 1e-6 ) ), 0.04, 1.2 ), away = max( d, 0.0 ) / slope;
    float edge = 1.0 - smoothstep( 0.0, 0.45 + 0.6 * f.w + 0.35 * sin( flowT * 1.3 + f.w * 25.0 ), away ); // the line where it meets the shore, breathing in and away
    float wave = smoothstep( 0.86, 1.0, fract( away / 1.3 + flowT * 0.3 + f.w * 4.0 ) ) * ( 1.0 - smoothstep( 0.5, 4.0, away ) ) * ( 1.0 - smoothstep( 0.15, 0.5, fwidth( away / 1.3 ) ) ); // ripples coming in (faded where a pixel spans too many to draw cleanly)
    float fleck = smoothstep( 0.64 - 0.06 * run, 0.88, pat ) * run * ( 0.6 + 0.4 * ( 1.0 - smoothstep( 0.0, 5.0, away ) ) ); // broken white on running water, more along its banks
    return clamp( edge * ( 0.45 + 0.55 * smoothstep( 0.35, 0.65, pat ) ) + wave * 0.75 * smoothstep( 0.35, 0.75, pat ) + fleck * 0.9, 0.0, 1.0 ); }
`;

// A tiling ripple normal map made in code (sums of whole-number sine waves wrap seamlessly). Slice 31: its alpha holds the foam's
// pattern, a finer field of the same kind whose peaks are small blobs (a data texture, so the alpha does not spoil the normals)
let WN = null; // (the pattern is made once; each caller gets its own texture of it)
function waterNormals() {
  const S = 256; if (WN) return wnTex(WN, S); const d = WN = new Uint8Array(S * S * 4); let a = 12345; const r = () => (a = (a * 16807) % 2147483647) / 2147483647;
  const field = (n, lo, hi, flat) => { const waves = []; for (let k = 0; k < n; k++) { let fx = 0, fz = 0; while (Math.hypot(fx, fz) < lo) { fx = Math.round((r() - 0.5) * hi * 2); fz = Math.round((r() - 0.5) * hi * 2); } waves.push({ fx, fz, ph: r() * 6.28, amp: flat ? 1 : 1 / Math.hypot(fx, fz) }); }
    const hf = new Float32Array(S * S); for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) { let s = 0; for (const w of waves) s += Math.sin((w.fx * x + w.fz * z) * 2 * Math.PI / S + w.ph) * w.amp; hf[z * S + x] = s; } return hf; };
  const hf = field(90, 1, 17, false), fo = field(70, 8, 22, true); let lo = 1e9, hi = -1e9; for (const v of fo) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
    const dx = (hf[z * S + (x + 1) % S] - hf[z * S + (x - 1 + S) % S]) * 0.9, dz = (hf[((z + 1) % S) * S + x] - hf[((z - 1 + S) % S) * S + x]) * 0.9, l = Math.hypot(dx, dz, 1), o = (z * S + x) * 4;
    d[o] = (-dx / l * 0.5 + 0.5) * 255; d[o + 1] = (-dz / l * 0.5 + 0.5) * 255; d[o + 2] = (1 / l * 0.5 + 0.5) * 255; d[o + 3] = (fo[z * S + x] - lo) / (hi - lo) * 255; }
  return wnTex(d, S);
}
function wnTex(d, S) { const t = new THREE.DataTexture(d, S, S); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t; }
