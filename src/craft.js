// Crafting (slice 11): IW1's craft menu over recipes.js, what players build (the craftbench, the bed, a campfire, a torch),
// sleeping in a bed, and waking at it after a fall (IW1's bed-respawn.js: half health, half of each resource).
// Co-op: what is built is world state, so the host owns it. A joined game pays, asks the host (`build`), and the host
// either builds it and tells every game (`built`, and in `welcome` for late joiners) or says no (`nobuild`: the joined
// game is paid back). Inventories, the menu and where each player wakes stay each game's own.
// Slice 12: a build recipe now opens build mode (build.js: the grid, the ghost, rotation, paying on placement, teardown),
// addBuilt makes walls, gates and traps through build.js, and the upgrade recipes are bought here (each game's own).
import * as THREE from 'three';
import { WATER_Y } from './config.js';
import { RECIPES, RES, BENCH_R } from './recipes.js';
import { groundY, slopeAt } from './world.js';
import { addCollider } from './props.js';
import { PIECE, makePiece, startBuild, spotFree, slotOf, pieceState } from './build.js';
import { buildFire, addFlame } from './camp.js';
import { benchMesh, bedMesh, torchMesh } from './craftmodels.js';
import { dustPuff, floatText } from './effects.js';
import { sfx } from './audio.js';
import { logEvent } from './playlog.js';
import { player, log, scene3, teleport, enemies, getCamMode, upgraded, upgradeFx } from './game.js';
import { send, joining, net, others, gone } from './coop.js';
import { day, nightK, isNight, SUNSET } from './daynight.js';
import { quiver } from './arrows.js';
import { ammo, addRounds, addFlowers, MAX_ROUNDS, MAX_FLOWERS } from './supplies.js';

// ── Resources: what a recipe costs, whether you have it, paying ──
export const short = (cost) => RES.filter(k => (cost[k] || 0) > (player.inv[k] || 0)).map(k => `${cost[k] - (player.inv[k] || 0)} ${k}`);
export function spend(cost, sign = 1) { for (const k in cost) player.inv[k] = Math.max(0, (player.inv[k] || 0) - sign * cost[k]); }
const costText = (cost) => RES.filter(k => cost[k]).map(k => `${cost[k]} ${k}`).join(', ');

// ── What players have built (the host's list; every game draws it) ──
export const built = []; let builtN = 0;
export const FOOT = { craftbench: 1.05, bed: 1.2, campfire: 1.0, torch: 0.3, spike_trap: 0.75 }; // clear ground round a thing placed in a grid cell (m)
const name = (k) => PIECE[k]?.name || k;
export const nextBuiltId = () => ++builtN;
export const benchNear = (x, z) => built.some(b => b.key === 'craftbench' && Math.hypot(b.x - x, b.z - z) < BENCH_R);
export const bedNear = (x, z, r = 2.4) => built.find(b => b.key === 'bed' && Math.hypot(b.x - x, b.z - z) < r);
// the heal spots (built campfires mend like the camp's) and the light spots (slice 13 lights the night with them)
export const fireSpots = () => built.filter(b => b.key === 'campfire').map(b => ({ x: b.x, z: b.z, r: 5 }));
export const lightSpots = () => built.filter(b => b.key === 'campfire' || b.key === 'torch').map(b => ({ x: b.x, y: b.y + (b.key === 'torch' ? 1.55 : 0.9), z: b.z, key: b.key }));

// where a build goes and whether it fits there: build.js (the grid); re-exported for the test hooks
export { placeSpot, spotFree } from './build.js';

// put one built thing in the world (every game, from the host's word); colliders make it solid and its top standable
export function addBuilt(id, key, x, y, z, f, by, hp, st) { if (built.some(b => b.id === id)) return; builtN = Math.max(builtN, id);
  const scene = scene3(), b = { id, key, x, y, z, f, by, cols: [], slot: slotOf(x, z) }, ax = Math.cos(f), az = -Math.sin(f), bx = Math.sin(f), bz = Math.cos(f); // its own x and z axes
  const col = (dx, dz, r, h) => b.cols.push(Object.assign(addCollider(x + dx, z + dz, r, null), { vr: 0, top: y + h + 0.1, stand: y + h, base: y }));
  if (PIECE[key]?.edge || key === 'spike_trap') makePiece(b, hp, st); /* slice 12: walls, gates, traps */
  else if (key === 'campfire') { b.mesh = buildFire(scene, x, z, false); b.mesh.position.y = y; } /* on a floor or a rock, not under it */
  else { b.mesh = key === 'craftbench' ? benchMesh() : key === 'bed' ? bedMesh() : torchMesh(); b.mesh.position.set(x, y, z); b.mesh.rotation.y = f; scene.add(b.mesh); }
  if (key === 'craftbench') for (const k of [-0.5, 0.5]) col(ax * k, az * k, 0.47, 0.93);
  if (key === 'bed') for (const k of [-0.55, 0.45]) col(bx * k, bz * k, 0.56, 0.5);
  if (key === 'torch') { col(0, 0, 0.12, 1.5); b.flame = addFlame(b.mesh, 1.5, 0.3, 10); }
  built.push(b); dustPuff(new THREE.Vector3(x, y, z), 14); sfx('craft', { x, z }); logEvent('built', { key, x: +x.toFixed(1), z: +z.toFixed(1), mine: by === net.id || !net.role });
  return b; }
export const builtMsg = () => built.map(b => [b.id, b.key, +b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2), +b.f.toFixed(3), b.by, b.max ? Math.round(b.hp) : null, pieceState(b)]);
// co-op: the host's answer to a joined game's `build`, and every game's side of `built` and `nobuild`
export function onBuildReq(m, from) { if (net.role !== 'host') return; const r = RECIPES.find(q => q.key === m.key), s = r && r.type === 'build' && !r.later && PIECE[m.key] ? spotFree(m.key, m.x, m.y, m.z, m.f) : { ok: false, why: 'That cannot be built yet.' };
  if (!s.ok) { send(from, { t: 'nobuild', key: m.key, why: s.why }); return; }
  const id = ++builtN; addBuilt(id, m.key, m.x, m.y, m.z, m.f, from); send('all', { t: 'built', id, key: m.key, x: m.x, y: m.y, z: m.z, f: m.f, by: from }); }
export function onBuilt(m) { addBuilt(m.id, m.key, m.x, m.y, m.z, m.f, m.by); if (m.by === net.id) log(`Your ${name(m.key)} is built.`); }
export function onNoBuild(m) { const r = RECIPES.find(q => q.key === m.key); if (r) spend(r.cost, -1); log(`Could not build there: ${m.why} (paid back)`); }

// ── Crafting one recipe ──
export function craft(r) {
  if (!r || player.dead || player.down > 0) return false;
  if (r.later) { log(`${r.label}: ${r.later}`); sfx('chitin', null, 0.4); return false; }
  if (r.bench && !benchNear(player.x, player.z)) { log(`${r.label} needs a craftbench: stand within ${BENCH_R} m of one.`); return false; }
  const miss = short(r.cost); if (miss.length) { log(`${r.label}: you need ${miss.join(', ')} more.`); return false; }
  if (r.key === 'med_kit') { if (player.hp >= player.maxHp) { log('You are already at full health.'); return false; }
    spend(r.cost); const h = Math.min(40, player.maxHp - player.hp); player.hp += h; floatText(new THREE.Vector3(player.x, player.y + 2, player.z), `+${h} HP`, '#8aff9a'); }
  else if (r.key === 'arrows') { if (quiver.n >= quiver.max) { log(`Your quiver is full (${quiver.max}).`); return false; }
    spend(r.cost); const n = Math.min(10, quiver.max - quiver.n); quiver.n += n; floatText(new THREE.Vector3(player.x, player.y + 2, player.z), `+${n} arrows`, '#efe6b0'); }
  else if (r.key === 'ammo_pack' || r.key === 'flower_bouquet') { const gun = r.key === 'ammo_pack'; if (gun ? ammo.clip + ammo.reserve >= MAX_ROUNDS : ammo.flowers >= MAX_FLOWERS) { log(gun ? `You carry all the rounds you can (${MAX_ROUNDS}).` : `You carry all the flowers you can (${MAX_FLOWERS}).`); return false; }
    spend(r.cost); const n = gun ? addRounds(8) : addFlowers(8); floatText(new THREE.Vector3(player.x, player.y + 2, player.z), `+${n} ${gun ? 'rounds' : 'flowers'}`, '#efe6b0'); } // slice 12: they run out now (the owner)
  else if (r.type === 'build') { toggleCraft(false); startBuild(r); return true; } // slice 12: paid when it is placed (build.js)
  else if (r.type === 'upgrade') { if (upgraded(r.charId)) { log(`${r.label}: you have it already.`); return false; }
    spend(r.cost); player.up[r.charId] = true; upgradeFx(r.charId); log(`${r.label}: ${r.tip}`); floatText(new THREE.Vector3(player.x, player.y + 2.3, player.z), 'UPGRADED', '#ffd27a', true); }
  sfx('craft'); logEvent('craft', { key: r.key, ...player.inv }); renderMenu(true); return true; }

// ── Sleeping in a bed sets where you wake; a fall with a bed to wake in is not the end ──
const veil = document.getElementById('veil');
function fade(text) { veil.querySelector('div').textContent = text; veil.classList.remove('show'); void veil.offsetWidth; veil.classList.add('show'); }
export function sleep(b) { if (player.dead || player.down > 0 || player.sleep) return;
  if (enemies.some(e => !e.dead && ['chase', 'windup', 'recover', 'emerge', 'siege'].includes(e.state) && Math.hypot(e.x - player.x, e.z - player.z) < 22)) { log('You cannot sleep with enemies hunting you.'); return; }
  const first = player.bed !== b.id; player.bed = b.id;
  if (first) log('This bed is where you wake now if you fall (with half your health and half your things).');
  // slice 13: from dusk a bed is slept in until morning (IW1): you mend 8 every 2 s, and with every player asleep the night
  // runs 12 times as fast; moving, a blow or the sun wakes you. By day it is a short rest, as before.
  if (nightK() > 0.25 || day.t > SUNSET - 0.02) { player.sleep = { b: b.id, t: 0, h: 0, z: 0 }; sleepEl.classList.add('on'); sfx('sleep'); logEvent('sleep', { bed: b.id, night: true }); log('You lie down for the night. Move to get up.'); return; }
  const h = Math.min(Math.round(player.maxHp * 0.3), player.maxHp - player.hp); player.hp += h;
  fade(first ? 'You sleep a while. If you fall, you will wake here.' : 'You sleep a while.'); sfx('sleep'); logEvent('sleep', { bed: b.id, healed: h });
  if (!first) log('Rested.'); }
const sleepEl = document.getElementById('sleep');
export function wake(why) { if (!player.sleep) return; player.sleep = null; sleepEl.classList.remove('on'); if (why) log(why); logEvent('wake', { why: why || '' }); }
export function tickSleep(dt) { const s = player.sleep; if (!s) return; s.t += dt;
  if (!built.some(q => q.id === s.b) || player.dead || player.down > 0) return wake();
  if ((s.h += dt) >= 2) { s.h = 0; const h = Math.min(8, player.maxHp - player.hp); if (h > 0) { player.hp += h; floatText(new THREE.Vector3(player.x, player.y + 2, player.z), `+${h}`, '#8aff9a'); } }
  if ((s.z += dt) >= 2.5) { s.z = 0; floatText(new THREE.Vector3(player.x, player.y + 1.9, player.z), 'z z z', '#c8b8ff'); }
  if (!isNight() && day.t < 0.35 && s.t > 1) return wake(`Day ${day.n}. You wake with the sun, rested.`);
  const rest = [...others.values()].filter(o => !gone(o)), awake = rest.filter(o => !o.sl).map(o => o.name);
  sleepEl.firstChild.textContent = day.speed > 1 ? 'Asleep · the night passes…' : awake.length ? `Asleep · waiting for ${awake.join(' and ')} to sleep too (${rest.length - awake.length + 1} of ${rest.length + 1} in bed)` : 'Asleep…'; }
export function bedRespawn() { const b = built.find(q => q.id === player.bed && q.key === 'bed'); if (!b) return false;
  teleport(b.x + Math.cos(b.f) * 1.25, b.z - Math.sin(b.f) * 1.25); player.y = Math.max(player.y, b.y); // beside the bed, on its floor
  Object.assign(player, { dead: 0, down: 0, out: false, revT: 0, hp: Math.ceil(player.maxHp / 2) }); for (const k of RES) player.inv[k] = Math.floor((player.inv[k] || 0) / 2); quiver.n = Math.floor(quiver.n / 2); ammo.reserve = Math.floor(ammo.reserve / 2); ammo.flowers = Math.floor(ammo.flowers / 2);
  player.mesh.visible = getCamMode() !== 'first'; player.mesh.userData.anim.revive();
  fade('You wake at your bed, with half your health and half your things.'); logEvent('bed-respawn', { hp: player.hp, ...player.inv });
  log(`${player.ch.player} woke at the bed with half health and half of everything.`); return true; }

// ── The craft menu (Tab, or View on a pad): the recipes this character can use, what each costs, and what is short ──
const panel = document.getElementById('craft'), list = document.getElementById('craft-list'), tipEl = document.getElementById('craft-tip'), resEl = document.getElementById('craft-res');
let open = false, sel = 0, rows = [], lastSig = '';
export const craftOpen = () => open;
export function toggleCraft(on = !open) { if (on === open) return; open = on; panel.classList.toggle('hidden', !open); logEvent(open ? 'craft-open' : 'craft-close');
  if (open) { rows = RECIPES.filter(r => !r.charId || r.charId === player.ch.id).sort((a, b) => !!a.later - !!b.later); /* what you can make first, in IW1's order; what comes later below */ sel = Math.max(0, rows.findIndex(r => !r.later)); lastSig = ''; renderMenu(true); if (document.pointerLockElement) document.exitPointerLock(); } }
const status = (r) => r.later ? ['soon', 'Soon'] : r.type === 'upgrade' && upgraded(r.charId) ? ['have', 'Owned'] : r.bench && !benchNear(player.x, player.z) ? ['no', 'Needs bench'] : short(r.cost).length ? ['no', 'Short'] : ['ok', r.type === 'build' ? 'Build' : 'Craft'];
export function renderMenu(force) { if (!open) return; const sig = JSON.stringify([player.inv, sel, benchNear(player.x, player.z), quiver.n, ammo]); if (!force && sig === lastSig) return; lastSig = sig;
  resEl.innerHTML = RES.map(k => `<span class="rc ${k}"><i></i>${k[0].toUpperCase() + k.slice(1)} <b>${player.inv[k] || 0}</b></span>`).join('') + (player.ch.id === 'ranger' ? `<span class="rc arrows"><i></i>Arrows <b>${quiver.n}/${quiver.max}</b></span>` : player.ch.id === 'gunslinger' ? `<span class="rc arrows"><i></i>Rounds <b>${ammo.clip} | ${ammo.reserve}</b></span>` : player.ch.id === 'charmer' ? `<span class="rc arrows"><i></i>Flowers <b>${ammo.flowers}</b></span>` : '');
  list.innerHTML = rows.map((r, i) => { const [cls, txt] = status(r);
    const cost = RES.filter(k => r.cost[k]).map(k => `<i class="${(player.inv[k] || 0) >= r.cost[k] ? 'have' : 'miss'}">${r.cost[k]} ${k}</i>`).join('');
    return `<div class="cr ${cls}${i === sel ? ' sel' : ''}" data-i="${i}"><kbd>${i < 10 ? (i + 1) % 10 : ''}</kbd><span class="nm">${r.label}${r.bench ? ' <small>bench</small>' : ''}</span><span class="cost">${cost}</span><em>${txt}</em></div>`; }).join('');
  const r = rows[sel]; tipEl.innerHTML = r ? `<b>${r.label}</b> · ${costText(r.cost)}${r.bench ? ' · at a craftbench' : ''}<br>${r.later ? r.later : r.tip}` : ''; }
list.addEventListener('click', e => { const el = e.target.closest('.cr'); if (!el) return; sel = +el.dataset.i; craft(rows[sel]); renderMenu(true); });
list.addEventListener('mousemove', e => { const el = e.target.closest('.cr'); if (el && +el.dataset.i !== sel) { sel = +el.dataset.i; renderMenu(true); } });
// keys while the menu is open: true when the key was the menu's
export function craftKey(e) { if (!open) return false; if (e.repeat && !/Arrow|KeyW|KeyS/.test(e.code)) return true; /* a held key crafts once */ const c = e.code, n = c.startsWith('Digit') ? +c.slice(5) : -1;
  if (c === 'Tab' || c === 'Escape' || c === 'KeyC') toggleCraft(false);
  else if (c === 'ArrowUp' || c === 'KeyW') sel = (sel + rows.length - 1) % rows.length;
  else if (c === 'ArrowDown' || c === 'KeyS') sel = (sel + 1) % rows.length;
  else if (c === 'Enter' || c === 'Space' || c === 'KeyE') craft(rows[sel]);
  else if (n >= 0 && rows[(n + 9) % 10]) { sel = (n + 9) % 10; craft(rows[sel]); }
  else return c !== 'KeyP' && c !== 'KeyM' && c !== 'F9'; // pause, sound and the play log still work
  renderMenu(true); return true; }
// a pad: d-pad up and down pick, A crafts, B or View closes
export function craftPad(p) { if (!open || !p) return; if (p.up) sel = (sel + rows.length - 1) % rows.length; if (p.down) sel = (sel + 1) % rows.length;
  if (p.jump) craft(rows[sel]); if (p.use) toggleCraft(false); renderMenu(); }
