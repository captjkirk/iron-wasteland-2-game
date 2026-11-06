// Boot: renderer, world, environment, game loop, and the test hooks the headless check uses.
import * as THREE from 'three';
import { CAMP, CHARS, BIOME, Q, QUALITY, QUALITY_KEY, setQuality, WATER_Y, HALF, SEED_TEXT, params, cleanSeed, JOINER } from './config.js';
import { groundY, findBiome, seeds, river, lakes, biomeAt, forestAt, slopeAt, canyonAt, PASSES, SHAPE, LEAN, reachable } from './world.js';
import { buildTerrain } from './terrain.js';
import { buildEnvironment, FOG_COLOR } from './environment.js';
import { buildBog, localFog } from './bog.js';
import { buildDeepWater, S as deepShadow } from './water.js';
import { buildProps, placed, nearColliders, colR, standAt } from './props.js';
import { buildCamp, tickCamp } from './camp.js';
import { buildBuildings, tickBuildings, buildings, caches, raiderCamps, ladders } from './buildings.js';
import { snapFrame, logEvent, frameTime, playlogState } from './playlog.js';
import { tickWatch, checkCrates, checkMsg, solidAt } from './watch.js';
import { updateScatter, scatterStats } from './scatter.js';
import { buildGrass, updateGrass, grassStats } from './grass.js';
import { wind } from './trees.js';
import { loadCharacters } from './characters.js';
import { loadCreatures, eyeShine } from './creatures.js';
import { initPortraits, drawPortraits, endPortraits } from './menu3d.js';
import { net, netReady } from './net.js';
import { others, deliver } from './coop.js';
import { craft, built, toggleCraft, craftOpen, placeSpot, sleep, bedNear, bedRespawn, lightSpots } from './craft.js';
import { day, nightK, DAY_S } from './daynight.js';
import { buildWeather, tickWeather } from './weather.js';
import { RECIPES } from './recipes.js';
import { startBuild, placeNow, endBuild, building, rotateBuild, damageBuilt, toggleGate, tearTarget, refundOf, clearBuilt, wallAhead, PIECE, putPiece } from './build.js';
import { ammo, clipSize } from './supplies.js';
import { felled, fell, harvestTarget } from './harvest.js';
import { quiver, stuckArrows } from './arrows.js';
import { pickups, initGame, hurtPlayer, gotPickup, selected, liveShots, spreadAt, upgraded, aimGround, togglePause, startGame, setCam, update, placeCamera, hud, menuPad, isRunning, getCamMode, player, enemies, spawnEnemy, attack, teleport, look, hitEnemy, press, secondary, turrets, dropLoot } from './game.js';

const status = document.getElementById('loading');
const renderer = new THREE.WebGLRenderer({ antialias: Q.antialias, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pixelRatio)); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.62;
renderer.localClippingEnabled = true; // buildings cut away round the player indoors (buildings.js)
renderer.shadowMap.enabled = Q.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, Q.drawDist); scene.add(camera);

// quality picker on the menu (a change reloads the page, since antialiasing is fixed at start)
const qrow = document.getElementById('quality');
for (const [k, v] of Object.entries(QUALITY)) { const b = document.createElement('button'); b.textContent = v.label; b.className = 'q' + (k === QUALITY_KEY ? ' on' : '');
  b.onclick = () => { if (k !== QUALITY_KEY) { logEvent('quality', { from: QUALITY_KEY, to: k }); setQuality(k); } }; qrow.appendChild(b); }

// the world's seed (slice 13c): its name on the menu and the pause screen; New world rolls another, a typed name plays that one
{ const name = document.getElementById('seedname'), inp = document.getElementById('seedin'), play = document.getElementById('playseed');
  name.textContent = SEED_TEXT; document.getElementById('pauseworld').innerHTML = `World <b>${SEED_TEXT}</b> · type its name on the start menu to play it again`;
  const go = (t) => { logEvent('world-pick', { from: SEED_TEXT, to: t || 'random' }); if (t) params.set('seed', t); else params.delete('seed'); location.search = params.toString(); };
  // what this world is like: the two lands it leans toward (world.js), or the classic world
  const like = LEAN.length ? `Mostly ${BIOME[LEAN[0]].label} and ${BIOME[LEAN[1]].label}. ` : 'The classic world. ', note = document.getElementById('seednote');
  note.textContent = like + note.textContent;
  if (JOINER) { document.getElementById('seedtools').remove(); note.textContent = like + 'The host\'s world: every game that joins builds the same one.'; }
  else { document.getElementById('newworld').onclick = () => go(null);
    inp.addEventListener('input', () => { play.disabled = !cleanSeed(inp.value) || cleanSeed(inp.value) === SEED_TEXT; });
    // (the menu's own keys, 1 to 5 and Enter, must not fire while a name is typed)
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !play.disabled) go(cleanSeed(inp.value)); });
    inp.addEventListener('keyup', (e) => e.stopPropagation()); play.onclick = () => go(cleanSeed(inp.value)); } }
const env = buildEnvironment(scene, renderer, camera);
const charsLoading = Promise.all([loadCharacters(), loadCreatures()]); // in parallel with the terrain and trees
status.textContent = 'Loading terrain textures…';
// when each stage of the load ended (ms from the page's start), for the play log: a family MacBook took 35 s to load
// against the host's 2 s, and the log could not say where the time went (the gate of slice 12)
// code: when the last code file arrived (Zach's Mac spent 26 to 28 s before boot, an M1 2.4 s: this says whether that is
// fetching the code or running it, slice 13a)
const stages = { code: Math.round(Math.max(0, ...performance.getEntriesByType('resource').filter(e => /\.m?js(\?|$)/.test(e.name)).map(e => e.responseEnd))), boot: Math.round(performance.now()) }, stage = (k) => { stages[k] = Math.round(performance.now()); };
await buildTerrain(scene, renderer); stage('terrain');
await buildProps(scene, renderer, (t) => status.textContent = t); stage('props');
buildGrass(scene); buildBog(scene, env.normals); buildDeepWater(scene, env.normals); buildWeather(scene); await buildCamp(scene); await buildBuildings(scene); stage('world');
await charsLoading; stage('chars');
initGame({ scene, camera, renderer, env }); initPortraits(scene); stage('init');
// the offline cache (sw.js) keeps everything this load fetched, the CDN's Three.js too (slice 13a)
navigator.serviceWorker?.ready.then(r => r.active?.postMessage(performance.getEntriesByType('resource').map(e => e.name)));
status.textContent = ''; document.getElementById('go').disabled = false;
// LAN co-op (slice 10): the menu says how to play together
netReady.then(() => { const el = document.getElementById('netinfo'); if (!net.role) return; el.classList.remove('hidden');
  // this page was reloaded to build the host's world (coop.js): join as the player already asked
  let again = null; try { again = sessionStorage.getItem('iw2.rejoin'); sessionStorage.removeItem('iw2.rejoin'); } catch { /* no storage: press JOIN again */ }
  if (net.role === 'join' && again !== null && CHARS[+again]) startGame(+again);
  if (net.role === 'join') { el.textContent = `Playing together: this joins the game hosted at ${location.host}. Pick who walks out.`; document.getElementById('go').textContent = 'JOIN THE GAME'; }
  else el.textContent = net.info.lan ? `Play together: on the family's other computers, open ${net.info.addr} in a browser and press JOIN.` : 'Play together on the home network: start the server with  python3 scripts/serve.py --lan'; }); logEvent('loaded', { seed: SEED_TEXT, quality: QUALITY_KEY, ms: Math.round(performance.now()), w: innerWidth, h: innerHeight, ...device(), stages });
// which graphics chip and screen this is, and how many pixels each frame draws (the play log's loaded event)
function device() { const gl = renderer.getContext(), x = gl.getExtension('WEBGL_debug_renderer_info');
  return { gpu: String(x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)), dpr: devicePixelRatio, pr: renderer.getPixelRatio(), px: `${renderer.domElement.width}x${renderer.domElement.height}`, cores: navigator.hardwareConcurrency || 0 }; }
// automatic render scale (the gate of slice 12: a family MacBook played at 21 fps on Medium and 25 to 35 on Low): while
// a game runs under 28 fps for 5 s, each frame draws 15% fewer pixels across, down to 60% of the preset's; the log notes each step
let scale = 1, slowRun = 0; const baseRatio = renderer.getPixelRatio();
function autoScale(dt) { if (navigator.webdriver || !isRunning() || fps <= 0) return; slowRun = fps < 28 ? slowRun + dt : 0; if (slowRun < 5 || scale < 0.62) return;
  slowRun = 0; scale = Math.max(0.6, scale * 0.85); renderer.setPixelRatio(baseRatio * scale); renderer.setSize(innerWidth, innerHeight); logEvent('res-scale', { scale: +scale.toFixed(2), fps, px: `${renderer.domElement.width}x${renderer.domElement.height}` }); }

// the raider camps' fires (the camp's own fire has its own light, camp.js)
let CF = null; const campFires = () => CF ||= raiderCamps.map(c => ({ x: c.x, y: groundY(c.x, c.z) + 0.4, z: c.z, key: 'campfire' }));

// ── Loop ──
let last = performance.now(), frames = 0, fpsT = 0, fps = 0, clock = 0, rendered = 0, freeCam = null;
const menuCam = { a: 2.2 };
function frame(now) {
  requestAnimationFrame(frame); frameTime(now - last, isRunning()); const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
  frames++; fpsT += dt; if (fpsT > 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
  if (isRunning()) { update(dt, clock); placeCamera(dt); hud(fps, dt); autoScale(dt); }
  else { menuPad(); drawPortraits(renderer, dt, selected()); menuCam.a += dt * 0.03; const x = 20 + Math.cos(menuCam.a) * 150, z = Math.sin(menuCam.a) * 150;
    camera.position.set(x, Math.max(groundY(x, z), WATER_Y) + 55, z); camera.lookAt(40, 8, 0); env.follow(new THREE.Vector3(40, groundY(40, 0), 0)); }
  if (freeCam) { camera.position.copy(freeCam.pos); camera.lookAt(freeCam.target); camera.fov = freeCam.fov; camera.updateProjectionMatrix(); env.follow(freeCam.target); }
  // slice 13: the hour lights the world: sky, sun or moon, fog, the far trees; fires and torches light the night
  env.setTime(day.t); eyeShine(nightK()); env.fireLights(isRunning() ? [...lightSpots(), ...campFires()] : [], camera.position, nightK(), clock);
  localFog(scene.fog, FOG_COLOR, env.fogNear, env.fogFar, camera.position.x, camera.position.z); scene.fog.color.multiply(env.fogTint);
  { const nk = nightK(), f = scene.fog; f.near += (Math.min(f.near, 10) - f.near) * nk; f.far += (Math.min(f.far, 150) - f.far) * nk; } // the night closes in (the owner: "view distance = less at night")
  tickWeather((day.n + day.t) * DAY_S, camera.position, scene.fog, nightK(), env.haze);
  const under = player.under && camera.position.y < WATER_Y; if (under) { scene.fog.color.set(0x0a262b).multiply(env.fogTint); scene.fog.near = 0.5; scene.fog.far = 20; } document.body.classList.toggle('under', under); deepShadow.camUnder = under; // under the surface
  wind.value = clock; updateScatter(camera.position); updateGrass(camera.position);
  tickBuildings(camera.position, player.x, player.z, player.y, isRunning() && getCamMode() === 'first' && !freeCam);
  env.tick(dt); tickCamp(dt, clock); renderer.render(scene, camera); snapFrame(renderer.domElement); rendered++;
}
requestAnimationFrame(frame);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// Test hooks for the headless check (scripts/shots.js): not used by play.
window.__iw = { others, net, built, deliver, /* the gate of slice 12 */ logEvent, playlogState, tickWatch, checkCrates, checkMsg, solidAt, pickups, HALF, /* slice 13d */
  // a build recipe opens build mode; for the checks, craft() of one places it at once where the ghost stands (slice 12)
  craft: (key) => { const r = RECIPES.find(q => q.key === key); if (r.type !== 'build') return craft(r); if (!craft(r)) return false; const ok = placeNow(); endBuild(); return ok; },
  startBuild: (key) => startBuild(RECIPES.find(q => q.key === key)), placeNow, endBuild, building, rotateBuild, damageBuilt, toggleGate, tearTarget, refundOf, clearBuilt, wallAhead, PIECE, putPiece, liveShots, ammo, clipSize, gotPickup, spreadAt, upgraded, aimGround, /* slice 12 */ toggleCraft, craftOpen, placeSpot, sleep, bedNear, bedRespawn, felled, fell, harvestTarget, quiver, stuckArrows, // slice 11
   hurtPlayer, get running() { return isRunning(); }, togglePause, renderer, scene, camera, startGame, player, setCam, attack, secondary, turrets, dropLoot, spawnEnemy, enemies, hitEnemy, seeds, river, lakes, findBiome, teleport, look, groundY, quality: QUALITY_KEY,
  get rendered() { return rendered; },
  get state() { return { x: +player.x.toFixed(1), z: +player.z.toFixed(1), y: +player.y.toFixed(1), hp: player.hp, cam: getCamMode(), enemies: enemies.length, fps, biome: biomeAt(player.x, player.z),
    props: Object.fromEntries(Object.entries(placed).map(([k, v]) => [k, v.length])), calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; },
  seed: SEED_TEXT, SHAPE, LEAN, reachable, /* slice 13c */ placed, PASSES, CAMP, canyonAt, day, nightK, DAY_S, /* slice 13 */ press, nearColliders, colR, slopeAt, buildings, caches, raiderCamps, ladders, standAt, deepShadow,
  findCanyon() { let best = null, bd = 1e9; // the nearest stretch of canyon floor
    for (let z = -440; z < 440; z += 4) for (let x = -440; x < 440; x += 4) { if (canyonAt(x, z) < 0.92 || groundY(x, z) < WATER_Y + 1) continue; const d = Math.hypot(x, z); if (d < bd) { bd = d; best = { x, z }; } } return best; },
  findForest() { let best = null, bd = 1e9; // a walkable spot inside a grass-biome forest, nearest the spawn
    for (let z = -400; z < 400; z += 6) for (let x = -400; x < 400; x += 6) { if (biomeAt(x, z) !== 'grass' || forestAt(x, z) < 0.85 || groundY(x, z) < WATER_Y + 1 || slopeAt(x, z) > 0.3) continue;
      const d = Math.hypot(x, z); if (d < bd) { bd = d; best = { x, z }; } } return best; },
  // a still creature at (x, z) facing yaw: idle, not wandering (for the lineup shots)
  pose(type, x, z, yaw) { spawnEnemy(x, z, type); const e = enemies[enemies.length - 1]; e.posed = true; e.yaw = yaw; e.wander = 1e9; e.wmove = false; if (e.state === 'lurk') e.state = 'idle'; return e; },
  get veg() { return { scatter: scatterStats(), grass: grassStats() }; },
  view(px, py, pz, tx, ty, tz, fov = 60) { freeCam = px === null ? null : { pos: new THREE.Vector3(px, py, pz), target: new THREE.Vector3(tx, ty, tz), fov };
    document.body.classList.toggle('freecam', !!freeCam); for (const c of camera.children) c.visible = !freeCam && getCamMode() === 'first'; } };
