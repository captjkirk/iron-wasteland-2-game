// LAN co-op (slice 10): the other players and what the games say to one another (the transport is net.js).
// The host's game owns the world: enemies (where they are, their health, who they hunt), loot on the ground, crates and
// who wins a hit. Each game moves its own player and works out its own attacks, then tells the host what it hit.
// Each game sends its player 15 times a second; the host sends every enemy 12 times a second.
import * as THREE from 'three';
import { CHARS, ENEMY } from './config.js';
import { groundY } from './world.js';
import { caches } from './buildings.js';
import { placed } from './props.js';
import { markDirty } from './scatter.js';
import { buildCharacter, eatPose } from './characters.js';
import { nameTags } from './effects.js';
import { sfx } from './audio.js';
import { net, send as post, flush, onMessage } from './net.js';
import { logEvent } from './playlog.js';
import { deepMsg, tickGhostDeep, dropGhostDeep } from './water.js';
import { day, setDay } from './daynight.js';
import { builtMsg, addBuilt, onBuildReq, onBuilt, onNoBuild } from './craft.js';
import { felled, applyFelled, onChop, onFell, onShake } from './harvest.js';
import { dropFrom } from './arrows.js';
import { onTearReq, onGateReq, onGone, onBst } from './build.js';
import { player, enemies, spawnEnemy, hitEnemy, charm, scare, crateOpen, smashCrate, hurtPlayer, log, fireShot, deployTurret, slash, gameOver, startGame, isRunning, pickups, addPickup, scene3, gotPickup, turrets, applyUp, upBits } from './game.js';

export const others = new Map(); // id -> { id, c, name, x, y, z, f, hp, mx, down, out, rv, rt, mesh, seen }
export const coop = () => others.size > 0;
// a new game or the menu forgets the other players (a stale avatar kept its death pose into the next game: review, slice 10)
export function clearOthers() { for (const o of others.values()) { scene3()?.remove(o.mesh); dropGhostDeep(o.id); } others.clear(); }
// a host with nobody joined sends nothing
export function send(to, msg) { if (net.role === 'join' || others.size) post(to, msg); }
export const joining = () => net.role === 'join';
export const gone = (p) => !!(p.dead || p.down > 0 || p.out);
// the nearest player still on their feet (enemies hunt it), or null
export function nearestP(x, z) { let best = null, bd = 1e9;
  for (const p of everyone()) { if (gone(p)) continue; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } } return best; }
// every player still in the game (the local one only while it plays)
export const everyone = () => [...(running() ? [player] : []), ...others.values()].filter(p => !p.out);
const running = () => isRunning() && !!player.ch;
// a hit on a player: the local one takes it here, another game is told
// (from: where the blow came from, for the Knight's shield block: slice 12)
export function hurt(p, dmg, by, from) { if (p === player) hurtPlayer(dmg, by, from); else send(p.id, { t: 'hurt', dmg, by, ...(from && { fx: +from.x.toFixed(1), fz: +from.z.toFixed(1) }) }); }
export const salvaged = []; // [type, index] of every scrap pile and wreck salvaged, for players who join later
export function salvagedProp(q) { const i = placed[q.type].indexOf(q); salvaged.push([q.type, i]); send('all', { t: 'salv', k: q.type, i }); }
function applySalvage(k, i) { const q = placed[k]?.[i]; if (!q) return; if (k === 'scrap') { q.gone = true; markDirty(); q.col.r = 0; q.col.vr = 0; } else q.salvaged = true; }

// ── Joining: a joiner's WALK OUT asks the host first, and walks out when the host welcomes it ──
// (the play log notes each step, and a join with no answer says so on screen: the gate of slice 12, after a joined game
// on the family's LAN play waited with no trace of why)
let joinT = 0, wantCh = 0, waitLogged = false, joinAt = 0, hellos = 0, stalled = false;
export function requestJoin(i) { if (!joinT) { joinAt = performance.now(); hellos = 0; stalled = false; logEvent('join-ask', { ch: CHARS[i].id, stream: net.stream }); } wantCh = i; joinT = 0.01; document.getElementById('loading').textContent = 'Looking for the host\'s game…'; }
setInterval(() => { if (joinT && !running()) { send('host', { t: 'hello', c: wantCh }); hellos++; const s = Math.round((performance.now() - joinAt) / 1000);
  if (s >= 8 && !waitLogged) { if (!stalled) { stalled = true; logEvent('join-stall', { s, hellos, stream: net.stream, fails: net.fails }); }
    document.getElementById('loading').textContent = net.stream !== 'open' ? `No link to the host computer (${s} s): check its server still runs (serve.py --lan) and this computer is on the same network, then reload.` : `No answer from the host's game yet (${s} s). Is the host computer in a game? This keeps trying.`; } }
  flush(); }, 1000);

onMessage((m, from) => onMsg(m, from));
function onMsg(m, from) {
  switch (m.t) {
    case 'hello': if (net.role !== 'host') break; // a game asks to join
      // (post, not send: nobody has joined yet, and a host with nobody joined sends nothing)
      if (!running()) { post(from, { t: 'wait' }); break; }
      post(from, { t: 'welcome', crates: caches.flatMap((c, i) => c.broken ? [[i, 2]] : c.opened ? [[i, 1]] : []), salv: salvaged, pickups: pickups.map(k => [k.id, k.kind, +k.mesh.position.x.toFixed(2), +k.mesh.position.z.toFixed(2)]),
        tur: turrets.map(q => [+q.x.toFixed(2), +q.z.toFixed(2), +q.head.rotation.y.toFixed(2), +q.life.toFixed(1)]), // turrets already out, so a late joiner sees them
        fell: felled, built: builtMsg(), d: [day.t, day.n, day.speed] }); break; // (slice 13: the time of day) // slice 11: trees felled, bushes picked, and what players built
    case 'wait': if (!waitLogged) { waitLogged = true; logEvent('join-wait'); } document.getElementById('loading').textContent = 'The host is still on the start menu: walk out there first.'; break;
    case 'welcome': if (!joinT || running()) break; joinT = 0; net.host = from; logEvent('join-welcome', { ms: Math.round(performance.now() - joinAt), hellos });
      for (const [i, s] of m.crates) { const c = caches[i]; if (!c) continue; s === 2 ? c.smash() : c.open(); }
      for (const [k, i] of m.salv) applySalvage(k, i);
      applyFelled(m.fell || []); for (const b of m.built || []) addBuilt(...b); if (m.d) setDay(...m.d);
      startGame(wantCh); joinT = 0; for (const [id, kind, x, z] of m.pickups) addPickup(id, kind, x, z, true);
      for (const [x, z, f, life] of m.tur || []) { deployTurret(x, z, f, true); turrets.at(-1).life = life; } break;
    case 'p': { let o = others.get(from); // a player's state
      if (!o) { if (!running() && net.role === 'join') break; o = { id: from, c: m.c, x: m.x, y: m.y, z: m.z, f: m.f, mesh: buildCharacter(CHARS[m.c]), down: 0, out: 0 }; o.name = CHARS[m.c].player;
        o.mesh.userData.ring.visible = false; scene3().add(o.mesh); others.set(from, o); log(from === net.host && net.role === 'join' ? `You joined ${o.name}'s game (${CHARS[m.c].title}).` : `${o.name} (${CHARS[m.c].title}) joined the game.`); logEvent('coop-in', { who: o.name, host: from === net.host || undefined }); }
      if (o.c !== m.c) { scene3().remove(o.mesh); o.mesh = buildCharacter(CHARS[m.c]); o.mesh.userData.ring.visible = false; scene3().add(o.mesh); o.c = m.c; o.name = CHARS[m.c].player; o.u = 0; }
      if ((m.u || 0) !== (o.u || 0)) { o.u = m.u || 0; applyUp(o.mesh, CHARS[o.c].id, !!(o.u & (1 << o.c))); } // slice 12: their upgrade shows here too
      const wasDown = o.down > 0;
      track(o, from, m.ts ?? performance.now(), m.x, m.y, m.z, m.f);
      Object.assign(o, { hp: m.hp, mx: m.mx, down: m.dn, out: m.out, rv: m.rv, rt: m.rt, sw: m.sw, g: m.g, ea: m.ea, dq: m.dq, sl: m.sl, seen: performance.now() });
      if (m.dn > 0 && !wasDown) { o.mesh.userData.anim.die(); log(`${o.name} is down! Stand close and hold E (B on a pad) to revive them.`); }
      if (!(m.dn > 0) && wasDown && !m.out) { o.mesh.userData.anim.revive(); log(`${o.name} is back up.`); }
      if (m.out && !o.wasOut) { o.wasOut = true; log(`${o.name} is out of the game.`); } o.mesh.visible = !m.out; break; }
    case 'left': { const o = others.get(from); clocks.delete(from); dropGhostDeep(from); if (o) { scene3().remove(o.mesh); others.delete(from); log(`${o.name} left the game.`); logEvent('coop-out', { who: o.name }); }
      if (from === net.host && running()) { net.host = null; gameOver('The host\'s game ended.'); } break; }
    case 'a': { const o = others.get(from); if (!o) break; o.mesh.userData.anim.attack(true, !!m.c); // a player attacked: their swing shows here
      if (m.r) slash(new THREE.Vector3(m.d[0], 0, m.d[1]), m.r, o); break; }
    case 'shot': { const s = fireShot(new THREE.Vector3(...m.o), new THREE.Vector3(...m.d), 0, m.k, !!m.h, false, m.u ? (m.k === 'ranger' ? 'boom' : 'aura') : true); s.owner = others.get(from); break; } // seen, not felt
    case 'tur': deployTurret(m.x, m.z, m.f, true); break;
    case 'hurt': hurtPlayer(m.dmg, m.by, m.fx != null ? { x: m.fx, z: m.fz } : null); break;
    case 'log': log(m.s); break;
    case 'gotc': crateOpen(null, null, m.got); break; // the host opened a crate for this player: its loot
    case 'got': gotPickup(m.kind); break;
    case 'kill': player.kills++; log(m.s); break;
    case 'salv': applySalvage(m.k, m.i); salvaged.push([m.k, m.i]); break;
    case 'crated': { const c = caches[m.i]; if (c && !c.opened) c.open(); break; }
    case 'smashed': { const c = caches[m.i]; if (c && !c.broken) c.smash(); break; }
    case 'loot': if (joining() && running()) addPickup(m.id, m.kind, m.x, m.z, false, m.v); break;
    case 'take': { const i = pickups.findIndex(k => k.id === m.id); if (i >= 0) { scene3().remove(pickups[i].mesh); pickups.splice(i, 1); } break; }
    case 'end': if (running()) gameOver(); break;
    // the host's side of another player's actions
    case 'hit': if (net.role === 'host') { const e = enemies.find(q => q.id === m.id); if (e) hitEnemy(e, m.dmg, m.nx, m.nz, null, from); } break;
    case 'charm': if (net.role === 'host') { const e = enemies.find(q => q.id === m.id); if (e && !e.dead) charm(e); } break;
    case 'cry': if (net.role === 'host') scare(m.x, m.z); break;
    case 'crate': if (net.role === 'host' && caches[m.i]) crateOpen(caches[m.i], from); break;
    case 'smash': if (net.role === 'host' && caches[m.i]) smashCrate(caches[m.i], null, null, from); break;
    case 'w': if (joining() && running()) applyWorld(m, from); break;
    // a game whose window was hidden (a tab switch, a minimised window, a closed lid) stops: its browser stops drawing it.
    // The host's stopping holds the whole world (2026-11-04: the host's window went to the background and a joined
    // Gunslinger shot a frozen bog lurker 21 times for nothing), so every game says when it goes and comes back.
    case 'away': { const o = others.get(from); if (!o || !!o.away === !!m.on) break; o.away = !!m.on;
      log(m.on ? `${o.name}'s game went into the background${from === net.host ? ': the world waits until it is back.' : '.'}` : `${o.name}'s game is back${from === net.host ? ': the world moves again.' : '.'}`); break; }
    // slice 11: trees, bushes and what players build are the host's (harvest.js, craft.js)
    case 'chop': if (net.role === 'host') onChop(m); break;
    case 'fell': onFell(m); break;
    case 'shake': onShake(m); break;
    case 'build': if (net.role === 'host') onBuildReq(m, from); break;
    case 'built': onBuilt(m); break;
    case 'nobuild': onNoBuild(m); break;
    // slice 12: tearing down, gates and the pieces' health and state (build.js)
    case 'tear': if (net.role === 'host') onTearReq(m, from); break;
    case 'gate': if (net.role === 'host') onGateReq(m); break;
    case 'gone': onGone(m); break;
    case 'bst': onBst(m); break;
  }
}

// ── The world from the host, on a joined game ──
const ST = ['idle', 'lurk', 'emerge', 'chase', 'windup', 'recover', 'flee', 'charmed', 'siege'];
function applyWorld(m, from) { const seen = new Set(); if (m.d) setDay(...m.d); // the host's clock (slice 13)
  for (const [id, type, x, z, yaw, s, hp, maxHp] of m.e) { seen.add(id); let e = enemies.find(q => q.id === id);
    if (!e) { if (hp <= 0) continue; spawnEnemy(x, z, type); e = enemies.at(-1); e.id = id; e.yaw = yaw; } // a corpse this game already cleared stays gone
    const st = ST[s] || 'idle', u = e.mesh.userData;
    if (st === 'windup' && e.state !== 'windup') { u.anim.attack(); if (Math.random() < 0.4) sfx(e.type, e, 0.7); }
    if (st === 'chase' && (e.state === 'idle' || e.state === 'lurk')) sfx(e.type, e); // it has seen someone
    if (hp < e.hp && !e.dead) { e.flashT = 0.15; e.barT = 6; }
    track(e, from, m.ts ?? performance.now(), x, 0, z, yaw); Object.assign(e, { state: st, hp, maxHp });
    if (hp <= 0 && !e.dead) { e.dead = 5; u.anim.die(); u.flash(0); sfx(e.type, e, 0.8); sfx('thud', e, 0.6); } }
  for (const e of enemies) if (!seen.has(e.id) && !e.gone) { dropFrom(e); scene3().remove(e.mesh); e.gone = true; } }
function worldMsg() { return { t: 'w', ts: Math.round(performance.now()), d: [+day.t.toFixed(5), day.n, day.speed], e: enemies.filter(e => !e.gone).map(e => [e.id, e.type, +e.x.toFixed(2), +e.z.toFixed(2), +e.yaw.toFixed(2), Math.max(0, ST.indexOf(e.state)), Math.max(0, e.hp), e.maxHp]) }; }

// ── Smooth playback (the gate of slice 12, from the family's LAN play of 2026-11-04, "working but a little choppy") ──
// Each 'p' and 'w' carries its sender's clock (ms). Over Wi-Fi they arrive unevenly (two or three at once, then none), and
// the old chase toward the newest one moved avatars and enemies in jerks. Now each game plays the others back a little
// behind the sender's clock, between the two samples either side of that moment, so uneven arrival never shows. How far
// behind follows each sender's own jitter (one send interval plus the worst lateness of the last few seconds), and
// changes slowly (playback runs at most a tenth fast or slow while it does), so nothing ever steps back.
const clocks = new Map(); // sender -> { off: this clock minus its clock at the quickest delivery seen, j: lateness (ms), d: delay (ms) }
function track(q, from, ts, ...v) { const s = performance.now() - ts; let c = clocks.get(from); if (!c) clocks.set(from, c = { off: s, j: 0, d: 120 });
  if (s < c.off) { c.j += c.off - s; c.off = s; } c.j = Math.max(c.j, s - c.off);
  const b = q.buf ||= []; if (!b.length || ts > b.at(-1)[0]) b.push([ts, ...v]); if (b.length > 60) b.shift(); }
let clockT = performance.now();
function tickClocks() { const n = performance.now(), dt = Math.min(1, (n - clockT) / 1000); clockT = n; for (const c of clocks.values()) { c.j *= Math.exp(-dt / 8); c.d += Math.max(-100 * dt, Math.min(100 * dt, Math.min(400, 90 + c.j) - c.d)); } }
// [x, y, z, facing] where q was on its sender's clock that long ago; a late sample is made up for by carrying the last
// motion on for up to 0.1 s; a jump of over 8 m (a teleport, a respawn) is taken at once, never slid
function playback(q, from) { const b = q.buf, c0 = clocks.get(from); if (!b?.length || !c0) return null; const t = performance.now() - c0.off - c0.d;
  while (b.length > 2 && b[1][0] <= t) b.shift(); const a = b[0], c = b[1]; if (!c || t <= a[0]) return a.slice(1);
  if (Math.hypot(c[1] - a[1], c[3] - a[3]) > 8) return (t >= c[0] ? c : a).slice(1);
  const u = Math.min((t - a[0]) / (c[0] - a[0]), 1 + 100 / (c[0] - a[0])); let d = c[4] - a[4]; d = Math.atan2(Math.sin(d), Math.cos(d));
  return [a[1] + (c[1] - a[1]) * u, a[2] + (c[2] - a[2]) * u, a[3] + (c[3] - a[3]) * u, a[4] + d * u]; }
// a hidden window says so, and says when it is back (see 'away' above); the play log notes both
document.addEventListener('visibilitychange', () => { logEvent(document.hidden ? 'hidden' : 'shown'); if (net.role && running()) { send('all', { t: 'away', on: document.hidden ? 1 : 0 }); flush(); } });
export const deliver = (m, from) => onMsg(m, from); // (for the checks: a message as if it came over the network)

// ── Every frame: other players move smoothly to where they were a moment ago; this game sends its own ──
let sendT = 0, worldT = 0;
export function tickCoop(dt) {
  const now = performance.now(), tags = []; tickClocks();
  for (const o of others.values()) {
    if (now - o.seen > (o.away ? 120000 : 12000)) { scene3().remove(o.mesh); others.delete(o.id); log(`${o.name} lost connection.`); dropGhostDeep(o.id); continue; }
    const px = o.x, pz = o.z, s = playback(o, o.id); if (s) [o.x, o.y, o.z, o.f] = s;
    o.mesh.position.set(o.x, o.y, o.z); o.mesh.rotation.y = o.f;
    o.mesh.userData.anim.update(dt, { speed: Math.hypot(o.x - px, o.z - pz) / Math.max(dt, 1e-3), onGround: o.g !== 0, swimming: !!o.sw, kneel: !!o.rv });
    eatPose(o.mesh, o.ea ? 0.9 : 0); // a friend eating (slice 12)
    tickGhostDeep(o.id, o.out ? null : o.dq, dt); // the serpent hunting them, if one is (slice 13)
    // the tag sits just over the head, or just over the body while they are down, with the revive's progress as its bar
    const dn = o.down > 0; if (!o.out) tags.push({ p: new THREE.Vector3(o.x, o.y + (dn ? 0.75 : 2.02), o.z), text: dn ? `${o.name} · DOWN ${Math.ceil(o.down)} s${o.rt ? ' · reviving' : ' · hold E to revive'}` : o.name + (o.sl ? ' · asleep' : ''),
      color: dn ? '#ff8a6a' : '#' + CHARS[o.c].color.toString(16).padStart(6, '0'), frac: dn ? (o.rt || 0) / 100 : Math.max(0, o.hp / o.mx), bar: true, fill: dn ? 'linear-gradient(#ffd27a,#e08a2a)' : null }); }
  nameTags(tags);
  if (!net.role || !running()) return;
  if ((sendT += dt) >= 1 / 15 && (coop() || joining())) { sendT = 0;
    send('all', { t: 'p', ts: Math.round(performance.now()), c: CHARS.indexOf(player.ch), x: +player.x.toFixed(2), y: +player.y.toFixed(2), z: +player.z.toFixed(2), f: +player.faceYaw.toFixed(2), hp: Math.round(player.hp), mx: player.maxHp,
      dn: +(player.down || 0).toFixed(1), out: player.out ? 1 : 0, rv: player.rv ? 1 : 0, rt: Math.round((player.revT || 0) / 2.5 * 100), sw: player.swim ? 1 : 0, g: player.onGround ? 1 : 0, u: upBits(), ea: player.eat ? 1 : 0, dq: deepMsg(), sl: player.sleep ? 1 : 0 }); }
  if (net.role === 'host' && coop() && (worldT += dt) >= 1 / 12) { worldT = 0; send('all', worldMsg()); }
  flush();
}
// a joined game's enemies glide to the host's positions (game.js calls this in place of their own thinking)
export function followHost(e, dt) { const s = playback(e, net.host); if (!s) return; const x = e.x, z = e.z; e.x = s[0]; e.z = s[2]; e.nyaw = s[3];
  e.spd = Math.hypot(e.x - x, e.z - z) / Math.max(dt, 1e-3); } // for its walk cycle
export { net };
