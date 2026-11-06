// Sky, sun, fog, image-based ambient light, shadows that follow the player, and water. Slice 13: the sun moves (setTime),
// sets in colour and gives way to the moon and the stars; built fires and torches light the night (fireLights).
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { WORLD, WATER_Y, Q } from './config.js';
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

  let water;
  if (Q.water === 'mirror') {
    water = new Water(new THREE.PlaneGeometry(WORLD + 600, WORLD + 600), { textureWidth: Q.waterRes, textureHeight: Q.waterRes, waterNormals: waterNormals(),
      sunDirection: SUN_DIR.clone(), sunColor: 0xfff2dc, waterColor: 0x10292e, distortionScale: 1.2, fog: true });
    water.material.uniforms.size.value = 3.0;
  } else {
    water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD + 600, WORLD + 600), new THREE.MeshStandardMaterial({ color: 0x24434a, roughness: 0.06, metalness: 0.0,
      normalMap: waterNormals(), normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.88, envMapIntensity: 1.2 }));
    water.material.normalMap.repeat.set(160, 160);
  }
  water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y; water.receiveShadow = true; scene.add(water);
  function tick(dt) { cloudMat.uniforms.uTime.value += dt; if (water.material.uniforms?.time) water.material.uniforms.time.value += dt * 0.5;
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

  // ── firelight: a few warm point lights, always in the scene (adding or removing a light recompiles every material),
  // put on the fires nearest the camera; brighter as the light goes ──
  const pool = []; for (let k = 0; k < Q.fireLights; k++) { const l = new THREE.PointLight(0xff8a3a, 0, 16, 1.6); scene.add(l); pool.push(l); }
  function fireLights(spots, at, nk, t) { const near = spots.map(s => [s, ((s.x - at.x) ** 2 + (s.z - at.z) ** 2) * (s.key === 'torch' ? 2.5 : 1)]).filter(q => q[1] < 70 * 70).sort((a, b) => a[1] - b[1]); // (a campfire before the torches round it)
    pool.forEach((l, k) => { const q = near[k]; if (!q) { l.intensity = 0; return; } const s = q[0], fl = 1 + Math.sin(t * 13 + k * 1.7) * 0.1 + Math.sin(t * 7.3 + k) * 0.08 + Math.sin(t * 23.1 + k * 3) * 0.05;
      l.position.set(s.x, s.y + (s.key === 'torch' ? 0.15 : 0.5), s.z); l.distance = s.key === 'torch' ? 11 : 16; l.intensity = (s.key === 'torch' ? 3.2 : 6) * fl * (0.12 + 0.88 * nk); }); }
  return { sky, sun, water, follow, tick, setTime, fireLights, haze, fogTint, normals: waterNormals(), fogNear: Q.drawDist * 0.2, fogFar: Q.drawDist * 1.35 };
}

// A tiling ripple normal map made in code (sums of whole-number sine waves wrap seamlessly).
function waterNormals() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const cx = cv.getContext('2d'), img = cx.createImageData(S, S);
  const waves = []; let a = 12345; const r = () => (a = (a * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 90; k++) { let fx = 0, fz = 0; while (!fx && !fz) { fx = Math.round((r() - 0.5) * 34); fz = Math.round((r() - 0.5) * 34); } waves.push({ fx, fz, ph: r() * 6.28, amp: 1 / Math.hypot(fx, fz) }); }
  const hgt = (x, z) => { let s = 0; for (const w of waves) s += Math.sin((w.fx * x + w.fz * z) * 2 * Math.PI / S + w.ph) * w.amp; return s; };
  const hf = new Float32Array(S * S); for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) hf[z * S + x] = hgt(x, z);
  for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
    const dx = (hf[z * S + (x + 1) % S] - hf[z * S + (x - 1 + S) % S]) * 0.9, dz = (hf[((z + 1) % S) * S + x] - hf[((z - 1 + S) % S) * S + x]) * 0.9, l = Math.hypot(dx, dz, 1), o = (z * S + x) * 4;
    img.data[o] = (-dx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (-dz / l * 0.5 + 0.5) * 255; img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255; }
  cx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
