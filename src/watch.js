// Watchers (slice 13d): what went wrong even when nobody noticed, written into the play log (playlog.js) for
// scripts/findings.js to report. Twice a second: the player and every awake creature inside a solid, under the ground, out
// of the world or at a broken position; a hunting creature that has not moved for 5 s; loot that landed where nobody can
// reach it; once a game: every crate nobody can reach. In co-op the host sends a check every 10 s (coop.js) and a joined
// game compares it with its own world: drift. The world's coarse map goes in at the start, so the report can name the
// ground never visited. (Page errors, failed loads and long frames are playlog.js's own.)
import { HALF, WORLD, SEED, WATER_Y, ENEMY, BIOME_NAMES } from './config.js';
import { groundY, biomeAt, slopeAt } from './world.js';
import { nearColliders, colR, placed, standAt } from './props.js';
import { caches, buildings } from './buildings.js';
import { logEvent } from './playlog.js';
import { player, enemies, pickups } from './game.js';
import { others, net, everyone, joining } from './coop.js';
import { built } from './craft.js';
import { felled } from './harvest.js';
import { day } from './daynight.js';

const r1 = (v) => +v.toFixed(1), CAP = 40, said = {}; // at most CAP events of each kind a game: a flood says no more than a few
function note(type, data) { said[type] = (said[type] || 0) + 1; if (said[type] <= CAP) logEvent(type, data); }
// a solid's name as the checks write it ("rock#12", "ruinwall#3", "crate", "house")
function solidName(c) { if (c.cache) return 'crate'; const r = c.ref; if (!r) return c.gate ? 'gate' : 'camp';
  if (r.type && placed[r.type]) return `${r.type}#${placed[r.type].indexOf(r)}`; return r.kind || r.key || 'solid'; }
// the solid (x, z) is inside with its feet at y: further in than `depth` past its edge, below its top, not standing on it
export function solidAt(x, z, y, depth = 0.3, not = null) {
  for (const c of nearColliders(x, z)) { if (!c.r || c === not || c.gate?.open) continue;
    if ((c.stand != null && y >= c.stand - 0.1) || (c.top != null && y >= c.top - 0.05)) continue;
    if (Math.hypot(x - c.x, z - c.z) < colR(c, x, z) - depth) return c; }
  return null; }
const outside = (x, z) => Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1;
const broken = (...v) => v.some(q => !Number.isFinite(q));

// ── each game ──
let acc = 0, crated = false, sig = null; const was = new Map(), spell = new Set(), held = new Map(), watchedLoot = new WeakSet();
// the world's fingerprint: every placed prop, crate and building (a joined game must build the very same world)
export const worldSig = () => sig ??= [Object.values(placed).flat().reduce((s, q) => s + q.x * 1.3 + q.z, 0).toFixed(2), caches.length, buildings.length].join(' ');
// the world in 32 m cells, a letter each (the biome's initial; ~ water): for the report's ground never visited
function worldMap() { const n = 32, k = WORLD / n, rows = [];
  for (let j = 0; j < n; j++) { let s = ''; for (let i = 0; i < n; i++) { const x = -HALF + (i + 0.5) * k, z = -HALF + (j + 0.5) * k; s += groundY(x, z) < WATER_Y ? '~' : biomeAt(x, z)[0]; } rows.push(s); }
  return { n, cell: k, rows, key: Object.fromEntries(BIOME_NAMES.map(b => [b[0], b])) }; }
export function watchStart() { acc = 0; crated = false; was.clear(); spell.clear(); held.clear(); for (const k in said) delete said[k];
  logEvent('world', { seed: SEED, size: WORLD, map: worldMap(), sig: worldSig(), role: net.role || 'solo' }); }

// a problem that lasts: logged when seen at two checks in a row, once for as long as it lasts (key: who and what)
function lasting(key, bad, type, data) { if (!bad) { was.delete(key); spell.delete(key); return; }
  if (was.get(key) === bad && !spell.has(key)) { spell.add(key); note(type, data()); } was.set(key, bad); }

function body(who, id, x, z, y, extra = {}) { const k = who + ':' + id;
  if (broken(x, z, y)) return lasting(k + ':nan', 'nan', 'bad-pos', () => ({ who, x, z, y, ...extra }));
  lasting(k + ':out', outside(x, z) && 'out', 'out-of-world', () => ({ who, x: r1(x), z: r1(z), ...extra }));
  if (outside(x, z)) return;
  const g = groundY(x, z); lasting(k + ':under', y < g - 0.6 && 'under', 'under-ground', () => ({ who, x: r1(x), z: r1(z), y: r1(y), ground: r1(g), biome: biomeAt(x, z), ...extra }));
  const c = solidAt(x, z, y, who === 'player' ? 0.3 : 0.25); lasting(k + ':solid', c, 'in-solid', () => ({ who, x: r1(x), z: r1(z), y: r1(y), solid: solidName(c), biome: biomeAt(x, z), ...extra })); }

// a crate nobody can open: inside another solid, buried, floating with nothing under it, out of the world, or walled in
// (no spot 1.3 m round it where a player could stand)
function crateWhy(q) { const own = nearColliders(q.x, q.z).find(c => c.cache === q);
  if (outside(q.x, q.z)) return 'out of the world'; const g = groundY(q.x, q.z);
  if (q.y < g - 0.4) return `buried ${r1(g - q.y)} m`;
  if (q.y > g + 1 && standAt(q.x, q.z, q.y + 0.05) < q.y - 0.3) return `floating ${r1(q.y - g)} m up`;
  const c = solidAt(q.x, q.z, q.y + 0.2, 0, own); if (c) return 'inside ' + solidName(c);
  for (let a = 0; a < 8; a++) { const x = q.x + Math.cos(a * 0.785) * 1.3, z = q.z + Math.sin(a * 0.785) * 1.3;
    if (!outside(x, z) && slopeAt(x, z) < 1.2 && !solidAt(x, z, groundY(x, z), -0.35, own)) return null; }
  return 'walled in'; }
export function checkCrates() { let n = 0; caches.forEach((q, i) => { if (q.broken) return; const why = crateWhy(q); if (why) { n++; note('crate-unreachable', { i, x: r1(q.x), z: r1(q.z), biome: biomeAt(q.x, q.z), why, camp: !!q.camp }); } }); return n; }

// a hunting (or fleeing) creature that has gone nowhere for 5 s while its quarry is more than 5 m off; a shooter at range
// stands still on purpose
function stuckCreature(e, dt) { const live = e.state === 'chase' || e.state === 'flee';
  let h = held.get(e); if (!live) { held.delete(e); return; } if (!h || h.state !== e.state) held.set(e, h = { x: e.x, z: e.z, t: 0, state: e.state, said: false });
  h.t += dt; if (Math.hypot(e.x - h.x, e.z - h.z) > 1) { if (Math.hypot(e.x - h.x, e.z - h.z) > 3) h.said = false; h.x = e.x; h.z = e.z; h.t = 0; return; }
  if (h.t < 5 || h.said) return; let d = 1e9; for (const p of everyone()) d = Math.min(d, Math.hypot(p.x - e.x, p.z - e.z));
  if (d < 5 || (ENEMY[e.type]?.shoot && e.state === 'chase')) return; h.said = true;
  note('creature-stuck', { who: e.type, id: e.id, state: e.state, secs: Math.round(h.t), x: r1(e.x), z: r1(e.z), quarry: Math.round(d), biome: biomeAt(e.x, e.z) }); }

// game.js calls this every frame the game runs; the checks call it straight after planting a problem
export function tickWatch(dt) { acc += dt; if (acc < 0.5) return; const step = acc; acc = 0;
  if (!player.dead && !player.out && !player.mantle && !player.climbing && !player.sleep) body('player', 'me', player.x, player.z, player.y, { swim: !!player.swim || undefined });
  if (joining()) return; // the host owns the world: its creatures, loot and crates are watched there
  if (!crated) { crated = true; checkCrates(); }
  for (const e of enemies) { if (e.dead || e.gone || e.state === 'lurk' || e.state === 'emerge') continue; /* (buried in the mud on purpose) */ let near = false; for (const p of everyone()) if (Math.hypot(p.x - e.x, p.z - e.z) < 70) { near = true; break; }
    if (!near) { held.delete(e); continue; } // asleep: out of everyone's waking range
    body(e.type, e.id, e.x, e.z, e.mesh.position.y + 0.05, { state: e.state }); stuckCreature(e, step); }
  for (const k of pickups) { if (!k.landed || watchedLoot.has(k)) continue; watchedLoot.add(k); const { x, z } = k.mesh.position;
    const why = outside(x, z) ? 'out of the world' : (c => c && 'inside ' + solidName(c))(solidAt(x, z, groundY(x, z) + 0.1, 0.1));
    if (why) note('loot-unreachable', { kind: k.kind, x: r1(x), z: r1(z), biome: biomeAt(x, z), why }); }
}

// ── co-op drift: the host's check, and a joined game's comparison ──
const CRATE = ['full', 'opened', 'smashed'], crateState = () => caches.map(c => c.broken ? 2 : c.opened ? 1 : 0).join('');
const alive = () => enemies.filter(e => !e.dead && !e.gone).length;
export const checkMsg = () => ({ t: 'chk', seed: SEED, w: worldSig(), cr: crateState(), b: built.length, f: felled.length, k: pickups.length, e: alive(),
  p: [r1(player.x), r1(player.z)], d: +day.t.toFixed(4) });
const drift = new Map(); // what -> the mismatch seen at the last check (two checks in a row log it, once until it clears)
export function onCheck(m, from) { if (!joining() || from !== net.host) return;
  const o = others.get(from), dd = Math.abs(m.d - day.t), cr = crateState(), off = o ? Math.hypot(o.x - m.p[0], o.z - m.p[1]) : 0;
  const diff = (a, b) => { const out = []; for (let i = 0; i < Math.max(a.length, b.length) && out.length < 6; i++) if (a[i] !== b[i]) out.push(i); return out; };
  const seen = {
    world: m.seed !== SEED || m.w !== worldSig() ? `host ${m.seed} ${m.w}, here ${SEED} ${worldSig()}` : null,
    crates: m.cr !== cr ? diff(m.cr, cr).map(i => `crate ${i} ${CRATE[m.cr[i]] || 'missing'} on the host, ${CRATE[cr[i]] || 'missing'} here`).join('; ') : null,
    built: m.b !== built.length ? `host ${m.b} pieces, here ${built.length}` : null,
    felled: m.f !== felled.length ? `host ${m.f}, here ${felled.length}` : null,
    loot: Math.abs(m.k - pickups.length) > 1 ? `host ${m.k}, here ${pickups.length}` : null,
    creatures: Math.abs(m.e - alive()) > 1 ? `host ${m.e}, here ${alive()}` : null,
    host: off > 6 ? `the host is drawn ${Math.round(off)} m from where it is` : null,
    clock: Math.min(dd, 1 - dd) > 0.01 ? `host ${m.d}, here ${+day.t.toFixed(4)}` : null };
  for (const [what, s] of Object.entries(seen)) {
    const prev = drift.get(what); if (!s) { drift.delete(what); continue; }
    if (prev && prev !== 'said') note('coop-drift', { what, said: s, x: r1(player.x), z: r1(player.z) });
    drift.set(what, prev ? 'said' : s); } }
