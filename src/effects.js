// Combat feedback: blood-free hit sparks and puffs (one Points system), floating damage numbers and enemy health bars
// (DOM, projected each frame), a crosshair hit marker, and the loot pickups' models (built in code; rusted metal uses
// the Poly Haven corrugated-iron texture already in assets/props).
import * as THREE from 'three';

let scene, camera;
const MAX = 600;
let pts, pos, col, siz, vel, life, maxLife, grav, head = 0;
export function initEffects(s, c) {
  scene = s; camera = c;
  const g = new THREE.BufferGeometry();
  pos = new Float32Array(MAX * 3); col = new Float32Array(MAX * 3); siz = new Float32Array(MAX); vel = new Float32Array(MAX * 3); life = new Float32Array(MAX); maxLife = new Float32Array(MAX); grav = new Float32Array(MAX);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(siz, 1));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    uniforms: { uScale: { value: innerHeight / 2 } },
    vertexShader: `attribute float size; varying vec3 vC; uniform float uScale; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(vC * (1. - d * 1.6), 1.); }` });
  pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
  // a second, normal-blended set for dust, fur tufts, mud and ice chips (additive would glow)
  const g2 = g.clone(); dpos = g2.attributes.position.array; dcol = g2.attributes.color.array; dsiz = g2.attributes.size.array;
  const mat2 = mat.clone(); mat2.blending = THREE.NormalBlending; mat2.uniforms = { uScale: mat.uniforms.uScale };
  mat2.fragmentShader = `varying vec3 vC; void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(vC, (1. - d * 2.) * .9); }`;
  dust = new THREE.Points(g2, mat2); dust.frustumCulled = false; scene.add(dust);
  addEventListener('resize', () => mat.uniforms.uScale.value = innerHeight / 2);
}
let dust, dpos, dcol, dsiz; const dvel = new Float32Array(MAX * 3), dlife = new Float32Array(MAX), dmax = new Float32Array(MAX), dgrav = new Float32Array(MAX); let dhead = 0;

const PUFF = { leaf: [0x4a6a2a, 0x8aa050], petal: [0xff7ab0, 0xfff0f4], fur: [0x6a6258, 0x8a8070], hound: [0x9a8460, 0xc4b08c], bear: [0x3a2a1e, 0x5a4430], rat: [0x4a3e34, 0x6a5a4a], ice: [0xbfe6ff, 0xffffff], mud: [0x2e3320, 0x4a4a30], dust: [0x8a7a62, 0xb0a084], wood: [0x6a4a2a, 0xa07a4a], stone: [0x77736c, 0xa39d92], fire: [0xff7a22, 0xffd27a] };
const tmpC = new THREE.Color();
// sparks: bright, fast, short; puff: matte bits of fur, ice or mud that fall
export function hitBurst(p, dir, kind = 'fur', n = 22, spark = true) { // spark: false for an axe in wood (chips, no flash)
  for (let i = 0; spark && i < n; i++) { const k = head = (head + 1) % MAX; const a = Math.random() * 6.28, up = Math.random() * 0.8 + 0.2, sp = 3 + Math.random() * 5;
    pos.set([p.x, p.y, p.z], k * 3); vel.set([Math.cos(a) * sp * 0.6 + dir.x * sp, up * sp, Math.sin(a) * sp * 0.6 + dir.z * sp], k * 3);
    tmpC.setHSL(0.11 + Math.random() * 0.04, 1, 0.6 + Math.random() * 0.3); col.set([tmpC.r * 1.6, tmpC.g * 1.6, tmpC.b * 1.6], k * 3);
    siz[k] = 0.07 + Math.random() * 0.06; life[k] = maxLife[k] = 0.18 + Math.random() * 0.2; grav[k] = 9; }
  const pal = PUFF[kind] || PUFF.fur;
  for (let i = 0; i < n; i++) { const k = dhead = (dhead + 1) % MAX; const a = Math.random() * 6.28, sp = 1 + Math.random() * 2.5;
    dpos.set([p.x + (Math.random() - 0.5) * 0.2, p.y + (Math.random() - 0.5) * 0.2, p.z + (Math.random() - 0.5) * 0.2], k * 3);
    dvel.set([Math.cos(a) * sp + dir.x * 2, Math.random() * 2.5, Math.sin(a) * sp + dir.z * 2], k * 3);
    tmpC.set(pal[Math.random() < 0.5 ? 0 : 1]); dcol.set([tmpC.r, tmpC.g, tmpC.b], k * 3); dsiz[k] = kind === 'ice' ? 0.08 : 0.1 + Math.random() * 0.08;
    dlife[k] = dmax[k] = 0.5 + Math.random() * 0.5; dgrav[k] = kind === 'fur' || kind === 'hound' || kind === 'bear' || kind === 'leaf' ? 2.5 : 9; }
}
export function splash(p, n = 30) { for (let i = 0; i < n; i++) { const k = dhead = (dhead + 1) % MAX, a = Math.random() * 6.28, sp = 0.6 + Math.random() * 2;
  dpos.set([p.x + Math.cos(a) * 0.4, p.y, p.z + Math.sin(a) * 0.4], k * 3); dvel.set([Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp], k * 3);
  tmpC.set(Math.random() < 0.6 ? 0x9ab0a8 : 0x5a6450); dcol.set([tmpC.r, tmpC.g, tmpC.b], k * 3); dsiz[k] = 0.06 + Math.random() * 0.05; dlife[k] = dmax[k] = 0.7 + Math.random() * 0.4; dgrav[k] = 9; } }
export function dustPuff(p, n = 10) { for (let i = 0; i < n; i++) { const k = dhead = (dhead + 1) % MAX, a = Math.random() * 6.28, sp = 0.4 + Math.random();
  dpos.set([p.x, p.y + 0.1, p.z], k * 3); dvel.set([Math.cos(a) * sp, 0.4 + Math.random() * 0.6, Math.sin(a) * sp], k * 3);
  tmpC.set(PUFF.dust[i % 2]); dcol.set([tmpC.r, tmpC.g, tmpC.b], k * 3); dsiz[k] = 0.25 + Math.random() * 0.25; dlife[k] = dmax[k] = 0.8 + Math.random() * 0.5; dgrav[k] = -0.2; } }

export function tickEffects(dt) {
  if (!pts) return;
  for (let k = 0; k < MAX; k++) {
    if (life[k] > 0) { life[k] -= dt; vel[k * 3 + 1] -= grav[k] * dt; for (let j = 0; j < 3; j++) pos[k * 3 + j] += vel[k * 3 + j] * dt; if (life[k] <= 0) siz[k] = 0; }
    if (dlife[k] > 0) { dlife[k] -= dt; dvel[k * 3 + 1] -= dgrav[k] * dt; const dr = Math.exp(-dt * 2.5); dvel[k * 3] *= dr; dvel[k * 3 + 2] *= dr;
      for (let j = 0; j < 3; j++) dpos[k * 3 + j] += dvel[k * 3 + j] * dt; if (dlife[k] <= 0) dsiz[k] = 0; }
  }
  for (const a of ['position', 'size', 'color']) { pts.geometry.attributes[a].needsUpdate = true; dust.geometry.attributes[a].needsUpdate = true; }
  tickFloaters(dt);
}

// ── Floating damage numbers and enemy health bars (DOM over the canvas) ──
const layer = document.createElement('div'); layer.id = 'fx'; layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden'; document.body.appendChild(layer); // (hidden under the free camera: it projects from the game's camera)
const floaters = [], v3 = new THREE.Vector3();
function screen(p) { v3.copy(p).project(camera); return v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1 ? [(v3.x + 1) / 2 * innerWidth, (1 - v3.y) / 2 * innerHeight] : null; }
export function floatText(p, text, color = '#ffe8b0', big = false) {
  const d = document.createElement('div'); d.textContent = text;
  d.style.cssText = `position:absolute;font:700 ${big ? 20 : 15}px ui-monospace,Menlo,Consolas,monospace;color:${color};text-shadow:0 1px 2px #000,0 0 6px rgba(0,0,0,.6);transform:translate(-50%,-50%);white-space:nowrap`;
  layer.appendChild(d); floaters.push({ d, p: p.clone(), t: 0, dx: (Math.random() - 0.5) * 30 });
}
function tickFloaters(dt) { for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.t += dt; const s = screen(f.p);
  if (!s || f.t > 0.9) { if (f.t > 0.9) { f.d.remove(); floaters.splice(i, 1); continue; } f.d.style.display = 'none'; continue; }
  f.d.style.display = ''; f.d.style.left = (s[0] + f.dx * f.t) + 'px'; f.d.style.top = (s[1] - f.t * 60) + 'px'; f.d.style.opacity = String(Math.min(1, (0.9 - f.t) * 3)); } }

const bars = [];
for (let i = 0; i < 10; i++) { const d = document.createElement('div'); d.style.cssText = 'position:absolute;width:56px;height:6px;margin-left:-28px;background:rgba(20,14,10,.75);border:1px solid rgba(240,220,180,.45);border-radius:3px;display:none;overflow:hidden';
  const f = document.createElement('div'); f.style.cssText = 'height:100%;background:linear-gradient(#e0683f,#a83a22);width:100%'; d.appendChild(f); layer.appendChild(d); bars.push({ d, f }); }
// list: [{ p: Vector3 (above the head), frac: 0..1 }], nearest first
export function healthBars(list) { for (let i = 0; i < bars.length; i++) { const b = bars[i], it = list[i], s = it && screen(it.p);
  if (!s) { b.d.style.display = 'none'; continue; } b.d.style.display = ''; b.d.style.left = s[0] + 'px'; b.d.style.top = s[1] + 'px'; b.f.style.width = (it.frac * 100).toFixed(0) + '%'; } }

// co-op (slice 10): the other players' names over their heads, with a health bar. list: [{ p, text, color, frac }]
const tags = [];
export function nameTags(list) { while (tags.length < list.length) { const d = document.createElement('div'), t = document.createElement('div'), b = document.createElement('div'), f = document.createElement('div');
    d.style.cssText = 'position:absolute;transform:translate(-50%,-100%);text-align:center;display:none'; t.style.cssText = 'font:700 13px ui-monospace,Menlo,Consolas,monospace;text-shadow:0 1px 2px #000,0 0 6px rgba(0,0,0,.7);white-space:nowrap';
    b.style.cssText = 'width:48px;height:5px;margin:3px auto 0;background:rgba(20,14,10,.75);border:1px solid rgba(240,220,180,.45);border-radius:3px;overflow:hidden'; f.style.cssText = 'height:100%;background:linear-gradient(#8fe07a,#3e9a32)';
    b.appendChild(f); d.append(t, b); layer.appendChild(d); tags.push({ d, t, b, f }); }
  tags.forEach((g, i) => { const it = list[i], s = it && screen(it.p); if (!s) { g.d.style.display = 'none'; return; }
    g.d.style.display = ''; g.d.style.left = s[0] + 'px'; g.d.style.top = s[1] + 'px'; if (g.t.textContent !== it.text) g.t.textContent = it.text; g.t.style.color = it.color;
    g.b.style.display = it.bar || it.frac > 0 ? '' : 'none'; g.f.style.width = (it.frac * 100).toFixed(0) + '%'; g.f.style.background = it.fill || 'linear-gradient(#8fe07a,#3e9a32)'; }); }

let markT = 0; const cross = document.getElementById('cross');
export function hitMarker() { markT = 0.15; cross?.classList.add('hit'); clearTimeout(hitMarker.t); hitMarker.t = setTimeout(() => cross?.classList.remove('hit'), 150); }

// a sawn end of wood: pale rings round a darker heart, the sapwood's edge, then the bark's rim (vertex colours, no texture)
export function grainDisc(r, seg = 24) { const g = new THREE.RingGeometry(0, r, seg, 9), p = g.attributes.position, c = new Float32Array(p.count * 3), a = new THREE.Color(0xe2c08a), b = new THREE.Color(0xb88a58), rim = new THREE.Color(0x5a3e28), t = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const k = Math.hypot(p.getX(i), p.getY(i)) / r; t.copy(k > 0.93 ? rim : (Math.round(k * 9) % 2 ? a : b)); if (k < 0.15) t.lerp(rim, 0.35); c.set([t.r, t.g, t.b], i * 3); }
  return g.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
// ── Loot models: a rusted gear and nut (metal), smoked haunch on the bone (food), a coil of plant twine (fiber), split logs (wood) ──
let LM = null;
function lootMats() { if (LM) return LM; const tl = new THREE.TextureLoader(), dir = new URL('../assets/props/', import.meta.url).href;
  const iron = tl.load(dir + 'iron_diff.jpg'); iron.colorSpace = THREE.SRGBColorSpace; iron.wrapS = iron.wrapT = THREE.RepeatWrapping;
  const bark = tl.load(dir + 'logbark_diff.jpg'); bark.colorSpace = THREE.SRGBColorSpace; bark.wrapS = bark.wrapT = THREE.RepeatWrapping; bark.repeat.set(1, 0.5);
  LM = { rust: new THREE.MeshStandardMaterial({ map: iron, color: 0xd0a080, metalness: 0.6, roughness: 0.75 }), steel: new THREE.MeshStandardMaterial({ color: 0x8a8a88, metalness: 1, roughness: 0.4 }),
    meat: new THREE.MeshStandardMaterial({ color: 0x7a3a22, roughness: 0.55 }), crust: new THREE.MeshStandardMaterial({ color: 0x5a2c16, roughness: 0.7 }), bone: new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.5 }),
    fiber: new THREE.MeshStandardMaterial({ color: 0xc8b47a, roughness: 0.95 }), band: new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.8 }),
    bark: new THREE.MeshStandardMaterial({ map: bark, color: 0xc0a088, roughness: 0.95 }), grain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }) };
  return LM; }
const LGEO = {};
function lootGeo(kind) { if (LGEO[kind]) return LGEO[kind];
  if (kind === 'metal') { const s = new THREE.Shape(), T = 10; for (let i = 0; i < T * 2; i++) { const a = i / (T * 2) * Math.PI * 2, r = i % 2 ? 0.13 : 0.16; const a2 = a + Math.PI / (T * 2);
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r); s.lineTo(Math.cos(a2) * r, Math.sin(a2) * r); }
    const hole = new THREE.Path(); hole.absarc(0, 0, 0.05, 0, Math.PI * 2, true); s.holes.push(hole);
    LGEO.metal = [new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 1 }), new THREE.CylinderGeometry(0.06, 0.06, 0.05, 6)]; }
  if (kind === 'food') { LGEO.food = [new THREE.SphereGeometry(0.13, 16, 12), new THREE.CylinderGeometry(0.025, 0.03, 0.22, 8), new THREE.SphereGeometry(0.035, 8, 6)]; }
  if (kind === 'fiber') { LGEO.fiber = [new THREE.TorusGeometry(0.12, 0.05, 10, 20), new THREE.TorusGeometry(0.1, 0.045, 8, 18), new THREE.CylinderGeometry(0.058, 0.058, 0.04, 12)]; }
  if (kind === 'wood') { LGEO.wood = [new THREE.CylinderGeometry(0.075, 0.085, 0.46, 12).rotateZ(Math.PI / 2), grainDisc(0.074)]; }
  return LGEO[kind]; }
const BEAM = { metal: 0xffb040, food: 0xff7050, fiber: 0xe8e0a0, wood: 0xe0a860, ammo: 0xffe08a };
export function buildLoot(kind) {
  const m = lootMats(), g = kind === 'ammo' ? [] : lootGeo(kind), root = new THREE.Group(), item = new THREE.Group(); root.add(item);
  const add = (geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => { const o = new THREE.Mesh(geo, mat); o.position.set(...p); o.rotation.set(...r); o.scale.set(...s); o.castShadow = true; item.add(o); return o; };
  if (kind === 'metal') { add(g[0], m.rust, [0, 0, -0.02], [0.3, 0, 0]); add(g[1], m.steel, [0.12, -0.08, 0.06], [0.4, 0, 0.9]); }
  if (kind === 'food') { add(g[0], m.crust, [0, 0, 0], [0, 0, 0], [1, 0.8, 1.35]); add(g[1], m.bone, [0, 0.03, 0.22], [Math.PI / 2 - 0.2, 0, 0]); add(g[2], m.bone, [0.015, 0.06, 0.33]); add(g[2], m.bone, [-0.015, 0.05, 0.33]); }
  if (kind === 'fiber') { add(g[0], m.fiber, [0, 0, 0], [Math.PI / 2, 0, 0]); add(g[1], m.fiber, [0, 0.07, 0], [Math.PI / 2, 0, 0.3]); add(g[2], m.band, [0.12, 0.03, 0], [0, 0, Math.PI / 2]); }
  // wood (slice 11): two split logs, bark round them and pale end grain showing
  if (kind === 'wood') for (const [y, z, r] of [[0, -0.06, 0.1], [0.12, 0.05, -0.15]]) { add(g[0], m.bark, [0, y, z], [0, r, 0]); for (const sx of [-1, 1]) add(g[1], m.grain, [sx * 0.231 * Math.cos(r), y, z - sx * 0.231 * Math.sin(r)], [0, r + sx * Math.PI / 2, 0]); }
  // rounds (slice 12): a small card box of brass cartridges, a few spilled beside it
  if (kind === 'ammo') { const brass = m.brass ||= new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 }), card = m.card ||= new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 });
    add(new THREE.BoxGeometry(0.16, 0.08, 0.1), card); for (let k = 0; k < 3; k++) add(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 8), brass, [-0.04 + k * 0.04, 0.07, 0]); add(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 8), brass, [0.12, -0.03, 0.05], [0, 0, Math.PI / 2]); }
  item.scale.setScalar(2.2);
  // a faint light column and ground ring so drops are found in grass
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.2, 2.6, 10, 1, true), new THREE.MeshBasicMaterial({ color: BEAM[kind], transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 1.3; root.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: BEAM[kind], transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  root.add(ring); root.userData = { item, ring, beam };
  return root;
}
