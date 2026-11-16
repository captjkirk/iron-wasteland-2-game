// Relics and the altar (#53, slice 2; Jared, November 15, 2026: docs/decisions/2026-11-15-caves-relics.md D1 to D3). One relic rests on
// the plinth in the back hall of each land's relic cave (the first of its caves); held Interact beside it takes it. It glows over its
// carrier's head, and creatures come for whoever carries it (D3: none on Easy, a pack now and then on Normal, packs often on Hard). A
// carrier who goes down drops it where they fell, and anyone can take it up. Brought to the altar by the start camp, it is set down
// (walking up to the altar is enough); the last one set wins: the win plate, and the score saved on this computer (D2; the last stand
// that follows is slice 4). The host's game owns every relic, as it owns the crates: a joined player asks to take one, and the host
// tells every game where each one is.
import * as THREE from 'three';
import { caves, caveAt, floorOf } from './cavemap.js';
import { groundY } from './world.js';
import { addCollider } from './props.js';
import { CAMP, SAFE_R, SEED_TEXT } from './config.js';

// the relic of each kind of cave: its name and its glow
const LOOK = { ice: ['the Ice Heart', 0x9ad8ff], fungal: ['the Glow Heart', 0x7dffb0], mine: ['the Ember Heart', 0xffa050], crystal: ['the Glass Heart', 0xd09aff], roots: ['the Root Heart', 0xd8f070] };
// and its shape, so no relic and no socket is told apart by colour alone (Jared is colourblind; colour never carries meaning by itself):
// the Ice Heart a long shard, the Glow Heart a mushroom's cap, the Ember Heart a block of ore, the Glass Heart a six-sided crystal, the
// Root Heart a knot; each socket on the altar shows its relic's shape, small, over its cup
const SHAPE = { ice: (s) => new THREE.OctahedronGeometry(s, 0).scale(1, 1.6, 1), fungal: (s) => new THREE.SphereGeometry(s * 1.1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), mine: (s) => new THREE.BoxGeometry(s * 1.3, s * 1.3, s * 1.3),
  crystal: (s) => new THREE.CylinderGeometry(s * 0.6, s * 0.6, s * 2.2, 6), roots: (s) => new THREE.TorusKnotGeometry(s * 0.6, s * 0.2, 40, 6) };
const shapeOf = (k, s) => (SHAPE[k] || SHAPE.ice)(s);
// TAKE: seconds Interact is held to take one; NEAR: how close to it; ALTAR_R: how close to the altar's middle sets it down;
// HUNT: seconds between the packs sent at a carrier out in the open, by difficulty (the first comes after half the shorter wait)
const TAKE = 1.5, NEAR = 2.2, ALTAR_R = 3.2, HUNT = { easy: null, normal: [40, 60], hard: [18, 28] }, AT = ['plinth', 'held', 'ground', 'altar'];
export const relics = [], altar = { x: CAMP.x - 4.8, z: CAMP.z - 3.4, y: 0, sockets: [], marks: [] };
let G = null, scene = null, holdT = 0, won = false, plate = null, plateT = 0, t = 0;
export const stats = { hunts: 0 }; // (for the checks)

// built with the world: a relic on each relic cave's plinth, and the altar by the camp (five stone posts round a dais)
export function buildRelics(sc) { scene = sc; relics.length = 0;
  const glow = haloTex();
  for (const c of caves.filter(q => q.relic)) { const [name, color] = LOOK[c.kind] || ['the relic', 0xffe2a0], m = new THREE.Group();
    const gem = new THREE.Mesh(shapeOf(c.kind, 0.3), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.1 }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); halo.scale.setScalar(2.2);
    m.add(gem, halo); m.userData.gem = gem; relics.push({ i: relics.length, c, name, color, m, at: 'plinth', by: null, x: 0, y: 0, z: 0, huntT: null }); }
  altar.y = groundY(altar.x, altar.z); const g = new THREE.Group(); g.name = 'altar'; g.position.set(altar.x, altar.y, altar.z); scene.add(g);
  const stone = new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.95 });
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.35, 10), stone); dais.position.y = 0.1; g.add(dais);
  altar.sockets = relics.map((r, k) => { const a = k / Math.max(5, relics.length) * Math.PI * 2, x = Math.cos(a) * 1.05, z = Math.sin(a) * 1.05;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.9, 7), stone); post.position.set(x, 0.72, z); g.add(post);
    const cup = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 5, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: r.color, emissive: r.color, emissiveIntensity: 0.35 })); cup.position.set(x, 1.19, z); g.add(cup);
    const mark = new THREE.Mesh(shapeOf(r.c.kind, 0.1), new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.6 })); mark.position.set(x, 1.36, z); g.add(mark); // (pale stone: its shape, not its colour, says whose)
    altar.marks[k] = mark; return { x: altar.x + x, y: altar.y + 1.55, z: altar.z + z }; });
  addCollider(altar.x, altar.z, 1.6, null);
  for (const r of relics) home(r); }

// a new game: every relic back on its plinth (a joined game then takes the host's word for where each is: coop.js's welcome)
export function startRelics(g) { G = g; holdT = 0; won = false; plateT = 0; if (plate) plate.classList.add('hidden'); for (const r of relics) { r.at = 'plinth'; r.by = null; r.huntT = null; home(r); } }

// where each relic is: on its plinth, over its carrier, on the ground, or in its socket on the altar
function home(r) { if (r.at === 'plinth') { const L = r.c.L; Object.assign(r, { x: L.hall.x, z: L.hall.z, y: floorOf(L, L.hall.x, L.hall.z) + 1.75 }); }
  if (r.at === 'altar') Object.assign(r, altar.sockets[r.i]); if (altar.marks[r.i]) altar.marks[r.i].visible = r.at !== 'altar'; // (the relic itself shows there once set)
  const parent = r.at === 'plinth' ? r.c.g : r.at === 'ground' && caveAt(r.x, r.z) ? caveAt(r.x, r.z).g : scene; // (in a cave: shown and hidden with it)
  if (parent && r.m.parent !== parent) parent.add(r.m); r.m.position.set(r.x, r.y, r.z); }
const me = () => G.net.id;
const holder = (by) => by === me() ? (G.running() ? G.player : null) : G.others.get(by) || null;
const who = (by) => by === me() ? 'You' : G.others.get(by)?.name || 'Someone';
const left = () => relics.filter(r => r.at !== 'altar').length;

// the prompt line by a relic, and what a carrier is told while carrying (game.js asks)
export const relicNear = (P) => relics.find(r => (r.at === 'plinth' || r.at === 'ground') && Math.hypot(r.x - P.x, r.z - P.z) < NEAR && Math.abs(r.y - 1.4 - P.y) < 2.6) || null;
export function relicPrompt(P, E) { const r = relicNear(P); return r && !relics.some(q => q.by === me()) ? (holdT > 0 ? `Hold ${E} · taking ${r.name}` : `Hold ${E} · take ${r.name}`) : null; }
export function carryPrompt(P) { const c = relics.find(q => q.by === me()); if (!c) return null; const d = Math.round(Math.hypot(altar.x - P.x, altar.z - P.z) / 10) * 10;
  return `Carrying ${c.name} · take it to the altar by the camp${d > 10 ? ` (${d} m)` : ''}; creatures can sense it`; }

// the host's game (or a game alone) decides; a joined game asks (coop.js passes 'relic-take' on)
export function takeRelic(i, by) { const r = relics[i]; if (G.joining() || !r || (r.at !== 'plinth' && r.at !== 'ground') || relics.some(q => q.by === by)) return;
  const was = { ...r }; r.at = 'held'; r.by = by; r.huntT = null; changed(r, was); }
function changed(r, was) { home(r); note(r, was); if (!G.joining()) G.send('all', { t: 'relics', s: state() }); if (!left() && !won) win(); }
export const state = () => relics.map(r => [AT.indexOf(r.at), r.by || 0, +r.x.toFixed(2), +r.y.toFixed(2), +r.z.toFixed(2)]);
// the host's word (its 'relics' message, or the welcome of a joined game)
export function applyRelics(s) { if (!Array.isArray(s)) return; s.forEach(([a, by, x, y, z], i) => { const r = relics[i]; if (!r) return; const was = { ...r };
  Object.assign(r, { at: AT[a] || 'plinth', by: by || null, x, y, z }); if (was.at !== r.at || was.by !== r.by) changed(r, was); else home(r); }); }

// what everyone is told when a relic changes hands
function note(r, was) { const n = relics.length - left(), name = r.name.replace(/^the /, 'The ');
  if (r.at === 'held' && was.at !== 'held') { G.log(r.by === me() ? `You take ${r.name}. It glows: carry it to the altar by the camp, and watch out, creatures can sense it.` : `${who(r.by)} takes ${r.name}.`); G.logEvent('relic-take', { kind: r.c.kind, who: r.by === me() ? 'me' : 'friend' }); G.sfx('dawn'); }
  else if (r.at === 'ground' && was.at === 'held') { G.log(`${name} falls where ${was.by === me() ? 'you' : who(was.by)} fell. Anyone can take it up again.`); G.logEvent('relic-drop', { kind: r.c.kind }); }
  else if (r.at === 'altar') { G.log(`${name} rests on the altar: ${n} of ${relics.length}.`); G.logEvent('relic-altar', { kind: r.c.kind, n }); G.sfx('salvage'); } }

export function tickRelics(dt, holding) { if (!G || !relics.length) return; const P = G.player; t += dt;
  // taking one: Interact held beside it (letting go drains it back), one relic to a carrier
  const r0 = relicNear(P), busy = relics.some(q => q.by === me());
  if (r0 && holding && !busy && !G.gone(P)) { if ((holdT += dt) >= TAKE) { holdT = 0; if (G.joining()) G.send('host', { t: 'relic-take', i: r0.i }); else takeRelic(r0.i, me()); } }
  else holdT = Math.max(0, holdT - dt * 2);
  if (!G.joining()) for (const r of relics) { if (r.at !== 'held') continue; const q = holder(r.by);
    if (!q || G.gone(q)) { const was = { ...r }; r.at = 'ground'; r.by = null; r.y = (q ? q.y : r.y - 2.3) + 0.6; changed(r, was); continue; } // (a carrier down, out or gone: it falls where they were)
    if (Math.hypot(q.x - altar.x, q.z - altar.z) < ALTAR_R && Math.abs(q.y - altar.y) < 3) { const was = { ...r }; r.at = 'altar'; r.by = null; changed(r, was); continue; }
    // D3: hunted, by difficulty, while out in the open (not in the safe valley, not in a cave)
    const w = HUNT[G.level()]; if (!w || Math.hypot(q.x, q.z) < SAFE_R || caveAt(q.x, q.z)) continue;
    if (r.huntT == null) r.huntT = w[0] / 2; if ((r.huntT -= dt) > 0) continue;
    if (G.hunt(q)) { stats.hunts++; r.huntT = w[0] + Math.random() * (w[1] - w[0]); G.logEvent('relic-hunt', { kind: r.c.kind, lvl: G.level() }); } else r.huntT = 2; } // (nowhere to send one from: try again soon)
  // over its carrier's head, bobbing and turning
  for (const r of relics) { if (r.at === 'held') { const q = holder(r.by); if (q) { r.x = q.x; r.z = q.z; r.y = q.y + 2.3; } }
    r.m.position.set(r.x, r.y + Math.sin(t * 2 + r.i) * 0.08, r.z); r.m.userData.gem.rotation.y += dt * 1.2; }
  if (plateT > 0 && (plateT -= dt) <= 0) plate.classList.add('hidden'); }

// D2: the win. The plate across the top for a while, and the score kept on this computer (the last 50, newest last)
function win() { won = true; const P = G.player, secs = Math.max(1, Math.round((performance.now() - P.startT) / 1000)), lvl = G.level(), clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  let all = []; try { all = JSON.parse(localStorage.getItem('iw2.wins') || '[]'); if (!Array.isArray(all)) all = []; } catch { /* storage blocked */ }
  const prev = all.filter(w => w.lvl === lvl).reduce((b, w) => Math.min(b, w.secs), Infinity), entry = { date: new Date().toISOString(), seed: SEED_TEXT, secs, kills: P.kills, lvl, mode: G.mode(), players: 1 + G.others.size };
  all.push(entry); try { localStorage.setItem('iw2.wins', JSON.stringify(all.slice(-50))); } catch { /* fine: the plate still shows */ }
  G.logEvent('win', entry); G.sfx('dawn');
  if (!plate) { plate = document.createElement('div'); plate.id = 'win'; plate.setAttribute('role', 'status'); plate.append(document.createElement('h2'), document.createElement('p')); document.body.appendChild(plate); }
  plate.querySelector('h2').textContent = 'The relics are home';
  plate.querySelector('p').textContent = `All ${relics.length} rest on the altar after ${clock(secs)}, with ${P.kills} kill${P.kills === 1 ? '' : 's'}, on ${G.levelName()}.${prev < Infinity ? ` Your best on ${G.levelName()}: ${clock(Math.min(prev, secs))}.` : ''} The score is saved.`;
  plate.classList.remove('hidden'); plateT = 14; G.log('All the relics are on the altar. You win! The score is saved.'); }

// a soft round glow for the halo (drawn once)
function haloTex() { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); }
