// Places worth going to (slice 23, #52): what happens at them. Jared, November 14, 2026: "there really weren't many unique points
// of interest (like IW1 had the radio tower for instance)". src/plan.js puts them on every world (the classic one too since November 15, 2026); buildings.js builds them.
// Here: each names itself on screen the first time you arrive (and the play log notes it), is noted when first seen, and the
// pause screen lists what you know of them (with where they lie from you), so the family can pick where to go next. The
// radio tower's radio, held 10 s (IW1), lifts the fog by half and names every place on the radio; the mushroom ring's spores
// hurt on the ground in its middle; the outpost's heater mends (game.js counts it with the fires). The map (#19) can read places.
import { places } from './plan.js';
import { groundY } from './world.js';
import { liftFog } from './explore.js';

export { places };
const HOLD = 10, SEE = { radio: 420, crater: 160 }, DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
const dirTo = (p, q) => DIRS[(Math.round(Math.atan2(q.z - p.z, q.x - p.x) / (Math.PI / 4)) + 8) % 8]; // (north is -z: the classic river runs north to south)
let pending = false; export const radioLater = () => { pending = true; }; // (a friend joining after the radio came on: coop.js's welcome)
let G = null, holdT = 0, sporeT = 0, t = 0, titleT = 0, titleEl = null, listEl = null, dirty = true;

// a new game: everything unknown again; the host sets each place's guards round it (they keep to it, as raiders to their fire)
export function startPlaces(g) { G = g; holdT = 0; sporeT = 0; dirty = true; titleT = 0; if (titleEl) titleEl.style.opacity = 0; // (no name left over from the last game)
  for (const q of places) Object.assign(q, { seen: false, reached: false, heard: false, on: false });
  if (!g.joining()) for (const q of places) q.guards.forEach((type, k) => { const a = k * 2.4 + 0.7, r = q.kind === 'shrooms' ? 4.2 : 5.5;
    g.spawnEnemy(q.x + Math.cos(a) * r, q.z + Math.sin(a) * r, type, 9500 + places.indexOf(q), k, q.guards.length); g.enemies.at(-1).home = q; });
  if (pending) { pending = false; radioOn('Someone before you'); }
  if (places.length) g.log(`Rumour has it this land holds ${places.length} places worth finding: ${[...new Set(places.map(q => q.name.replace(/^The /, 'a ').replace(/^a Hermit/, 'a hermit').toLowerCase()))].join(', ')}. P lists what you know of them.`); }

const near = (q, P, r) => Math.hypot(P.x - q.x, P.z - q.z) < r;
export const radioNear = (P) => places.find(q => q.kind === 'radio' && !q.on && near(q.radio, P, 1.9)) || null;
// what the prompt line says by the radio (game.js asks)
export const placePrompt = (P, E) => { const q = radioNear(P); return q ? (holdT > 0 ? `Hold ${E} · tuning the radio (${Math.ceil(HOLD - holdT)} s)` : `Hold ${E} · tune the radio (10 s)`) : null; };
export const holdProgress = () => holdT / HOLD;

// the radio comes on: here (it lifts this computer's fog), and from a friend's game (coop.js, { t: 'radio' })
export function radioOn(from = null) { if (!G) { pending = true; return; } const q = places.find(p => p.kind === 'radio'); if (!q || q.on) return; q.on = true; liftFog(); dirty = true;
  for (const p of places) p.heard = true; const P = G.player;
  G.log(`${from ? from + ' got the radio going' : 'The radio crackles to life'}. Voices on it name every place out there, and the fog thins: ${places.filter(p => p !== q).map(p => `${p.name} (${Math.round(Math.hypot(p.x - P.x, p.z - P.z) / 10) * 10} m ${dirTo(P, p)})`).join(', ')}.`);
  G.logEvent('radio', { from: from || 'me' }); G.sfx('dawn'); if (!from) G.send('all', { t: 'radio', n: G.player.ch?.player }); }

export function tickPlaces(dt, holding) { if (!G) return; const P = G.player; t += dt;
  for (const q of places) { const d = Math.hypot(P.x - q.x, P.z - q.z);
    if (!q.seen && d < (SEE[q.kind] || 180)) { q.seen = true; dirty = true; G.logEvent('place-seen', { kind: q.kind }); if (!q.reached && d > q.r) G.log(`You spot ${q.name} to the ${dirTo(P, q)}.`); }
    if (!q.reached && d < q.r && !P.dead) { q.reached = true; q.seen = true; dirty = true; title(q.name); G.log(`You have found ${q.name}.`); G.logEvent('place', { kind: q.kind, name: q.name }); G.sfx('salvage'); } }
  // the radio: hold Interact beside it 10 s; its guards come for you when you start (a hit does not stop it, letting go drains it back)
  const rq = radioNear(P);
  if (rq && holding && !P.dead) { if (holdT === 0) { for (const e of G.enemies) if (e.home === rq && !e.dead && e.state === 'idle') e.state = 'chase'; G.logEvent('radio-hold'); }
    holdT += dt; if (holdT >= HOLD) { holdT = 0; radioOn(); } }
  else holdT = Math.max(0, holdT - dt * 2);
  // the mushroom ring's spores: on the ground in its middle they hurt (3 every half second); up on a cap they do not
  const sq = places.find(q => q.kind === 'shrooms' && near(q, P, q.spore));
  if (sq && !P.dead && P.y < groundY(P.x, P.z) + 1) { /* (on the clearing's floor only: the lowest cap is 1.5 m up) */ if ((sporeT += dt) >= 0.5) { sporeT = 0; G.hurt(3, 'Spores'); } } else sporeT = 0;
  for (const q of places) { if (q.lamp) q.lamp.visible = t % 1.6 < 0.45; if (q.cloud) { q.cloud.rotation.y += dt * 0.12; q.cloud.position.y = Math.sin(t * 0.7) * 0.25; } }
  if (titleT > 0 && (titleT -= dt) <= 0) titleEl.style.opacity = 0;
  if (dirty || (t % 1 < dt)) list(); } // (once a second: the distances and bearings follow the player)

// the name, large and fading, across the top of the screen (its look: #place-title in index.html, with the other screens)
function title(s) { if (!titleEl) { titleEl = document.createElement('div'); titleEl.id = 'place-title';
    document.body.appendChild(titleEl); }
  titleEl.innerHTML = '<small>Discovered</small>'; titleEl.append(s); titleEl.style.opacity = 1; titleT = 5; }
// the pause screen's list: found, seen, heard on the radio, or still to find
function list() { dirty = false; const pw = document.getElementById('pauseworld'); if (!pw || !places.length) return;
  if (!listEl) { listEl = document.createElement('div'); listEl.id = 'pauseplaces'; listEl.className = 'sub'; listEl.style.cssText = 'margin-top:8px;line-height:1.5'; pw.after(listEl); }
  const P = G.player, known = places.filter(q => q.reached || q.seen || q.heard), left = places.length - known.length;
  listEl.innerHTML = '<b>Places</b><br>' + (known.length ? known.map(q => `${q.reached ? '✔' : q.seen ? '◉' : '◌'} ${q.name} <span style="opacity:.7">(${q.reached ? 'found' : q.seen ? 'seen' : 'heard on the radio'}, ${Math.round(Math.hypot(q.x - P.x, q.z - P.z) / 10) * 10} m ${dirTo(P, q)})</span>`).join('<br>') : 'none found yet')
    + (left ? `<br>${left} still to find${places.some(q => q.kind === 'radio' && !q.on) ? ' (the radio tower would tell of them)' : ''}` : ''); }
