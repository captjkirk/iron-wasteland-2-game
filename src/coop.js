// LAN co-op (slice 10): the other players and what the games say to one another (the transport is net.js).
// The host's game owns the world: enemies (where they are, their health, who they hunt), loot on the ground, crates and
// who wins a hit. Each game moves its own player and works out its own attacks, then tells the host what it hit.
// Each game sends its player 15 times a second; the host sends every enemy 12 times a second.
import * as THREE from 'three';
import { CHARS, ENEMY, SEED_TEXT, params, JOINER, KEEP, randomSeed } from './config.js';
import { EDGE } from './edgefog.js';
import { groundY } from './world.js';
import { radioOn, radioLater, places } from './places.js';
import { state as relicState, applyRelics, takeRelic } from './relics.js'; // #53
import { caches, takeFood } from './buildings.js';
import { placed, nearColliders, colR } from './props.js';
import { markDirty } from './scatter.js';
import { buildCharacter, eatPose } from './characters.js';
import { nameTags, eye } from './effects.js';
import { sfx } from './audio.js';
import { net, netReady, send as post, flush, onMessage } from './net.js';
import { logEvent } from './playlog.js';
import { checkMsg, onCheck } from './watch.js';
import { deepMsg, tickGhostDeep, dropGhostDeep } from './water.js';
import { day, setDay } from './daynight.js';
import { builtMsg, addBuilt, onBuildReq, onBuilt, onNoBuild } from './craft.js';
import { felled, applyFelled, onChop, onFell, onShake, onDig, onDug, onGrew } from './harvest.js';
import { dropFrom } from './arrows.js';
import { spit } from './spiders.js';
import { onTearReq, onGateReq, onGone, onBst, onFixReq } from './build.js';
import {
  player,
  score,
  enemies,
  spawnEnemy,
  hitEnemy,
  charm,
  scare,
  crateOpen,
  smashCrate,
  hurtPlayer,
  log,
  fireShot,
  deployTurret,
  slash,
  gameOver,
  ALL_OUT,
  startGame,
  isRunning,
  dangerCue,
  pickups,
  addPickup,
  scene3,
  gotPickup,
  turrets,
  applyUp,
  upBits,
} from './game.js';

export const RIVAL = '#ff5a48'; // (slice 33: a rival's name tag and score in free-for-all)
export const others = new Map(); // id -> { id, c, name, x, y, z, f, hp, mx, down, out, rv, rt, mesh, seen }
export const coop = () => others.size > 0;
// a new game or the menu forgets the other players (a stale avatar kept its death pose into the next game: review, slice 10)
export function clearOthers() {
  for (const o of others.values()) {
    scene3()?.remove(o.mesh);
    dropGhostDeep(o.id);
  }
  others.clear();
}
// a host with nobody joined sends nothing
export function send(to, msg) {
  if (net.role === 'join' || others.size) post(to, msg);
}
export const joining = () => net.role === 'join';
export const gone = (p) => !!(p.dead || p.down > 0 || p.out); // (a hidden window's player is not gone: what is already on them still bites, so hiding is no pause; the hunt skips them: game.js)
// the nearest player still on their feet (enemies hunt it), or null
export function nearestP(x, z) {
  let best = null,
    bd = 1e9;
  for (const p of everyone()) {
    if (gone(p)) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}
// every player still in the game (the local one only while it plays)
export const everyone = () => [...(running() ? [player] : []), ...others.values()].filter((p) => !p.out);
const running = () => isRunning() && !!player.ch;
// a hit on a player: the local one takes it here, another game is told
// (from: where the blow came from, for the Knight's shield block: slice 12)
export function hurt(p, dmg, by, from) {
  if (p === player) hurtPlayer(dmg, by, from);
  else send(p.id, { t: 'hurt', dmg, by, ...(from && { fx: +from.x.toFixed(1), fz: +from.z.toFixed(1) }) });
}
export const salvaged = []; // [type, index] of every scrap pile and wreck salvaged, for players who join later
export const eaten = []; // places round 2: the larder index of every piece of food taken, for players who join later
export function ateFood(i) {
  eaten.push(i);
  send('all', { t: 'food', i });
}
export function salvagedProp(q) {
  const i = placed[q.type].indexOf(q);
  salvaged.push([q.type, i]);
  send('all', { t: 'salv', k: q.type, i });
}
// ── The game's rules (slice 33, #63; Jared, 2026-11-14: "we should also have a co-op vs free for all (friendly fire on/off) mode
// options"). The host picks them on its start menu or pause screen; every joined game plays by the host's (in the welcome, and
// again whenever the host changes them). Co-op: players cannot hurt each other and revive a downed friend. Free-for-all
// (Jared, the same day: "co-op and free for all should be the only modes. Friendly fire would be the same as free for all",
// so co-op's quarter-damage friendly fire of the first build is gone): every weapon hurts everyone, nobody revives a rival, a knocked-out
// player comes back at their bed or the camp, and each player scores (a creature 1, a rival knocked out 3)
// Difficulty (beside the mode; a review of slice 21 found a night pack could surround the youngest players and kill the Charmer
// in about 5 s): Easy is creatures' bites and pack sizes about 0.6 of Normal's, packs sent at a player half as often and none
// at nightfall; Normal is slice 21's numbers; Hard is more of everything. The host's game applies it (it runs the creatures)
export const LEVELS = {
  easy: { bite: 0.6, pack: 0.6, hunt: 1.6, night: false, label: 'Easy' },
  normal: { bite: 1, pack: 1, hunt: 1, night: true, label: 'Normal' },
  hard: { bite: 1.3, pack: 1.3, hunt: 0.75, night: true, label: 'Hard' },
};
export const rules = { ffa: false, lvl: 'normal' };
const takeRules = (r) => {
  rules.ffa = !!r?.ffa;
  rules.lvl = LEVELS[r?.lvl] ? r.lvl : 'normal';
};
const saved = () => {
  try {
    takeRules(JSON.parse(localStorage.getItem('iw2.rules') || '{}'));
  } catch {
    /* co-op, Normal */
  }
}; // (a host's last pick; a page with no server plays as before, review)
export const level = () => LEVELS[rules.lvl] || LEVELS.normal;
// the share of a blow one player's attack does to another
export const pvp = () => (rules.ffa ? 1 : 0);
export const modeName = () => (rules.ffa ? 'Free-for-all' : 'Co-op') + ' · ' + level().label;
export const modeKey = () => (rules.ffa ? 'ffa' : 'coop');
export function setRules(r) {
  if (joining()) return;
  Object.assign(rules, r);
  try {
    localStorage.setItem('iw2.rules', JSON.stringify(rules));
  } catch {
    /* this game only */
  }
  showRules();
  if (!isRunning()) return;
  send('all', { t: 'rules', ...rules });
  logEvent('rules', { mode: modeKey(), lvl: rules.lvl });
  log(`The game is now ${modeName()}.`);
}
const NOTE = {
  ffa: 'Every player for themselves: weapons hurt everyone, nobody revives a rival, and a knocked-out player is back at their bed or the camp. A creature scores 1, knocking out a rival 3.',
  coop: 'A team against the wasteland: you cannot hurt each other, and you revive a friend who is down.',
};
// what a fall does in each kind of game (Jared, 2026-11-15: "its not clear what setting makes you respawn vs game over at death")
export const FALL = {
  solo: 'When you fall: you wake at your bed if you slept in it. No bed: game over.',
  coop: 'When you fall: a friend has 15 seconds to revive you, then you wake at your bed if you slept in it. Game over only when nobody is left standing.',
  ffa: 'When you fall: back in 6 seconds at your bed, or the camp if you have none. Never game over.',
};
function showRules() {
  const $ = (id) => document.getElementById(id);
  const on = (id, v) => {
    $(id).classList.toggle('on', v);
    $(id).setAttribute('aria-pressed', String(v));
  }; // (the chosen one says so without colour: a check mark and aria-pressed, index.html)
  for (const k in LEVELS) on('mode-' + k, rules.lvl === k);
  on('mode-coop', !rules.ffa);
  on('mode-ffa', rules.ffa);
  $('modenote').textContent = NOTE[modeKey()];
  const host = net.role === 'host'; // (the Game row shows only where others can join: a lone game gets its one line; the chosen mode's says so without colour, a check mark)
  $('modefall').innerHTML = (host ? ['coop', 'ffa'] : ['solo'])
    .map(
      (k) =>
        `<p${!host || k === modeKey() ? ' class="on"' : ''}>${host ? `${k === modeKey() ? '✓ ' : ''}<b>${k === 'ffa' ? 'Free-for-all' : 'Co-op'}</b> · ` : ''}${FALL[k]}</p>`,
    )
    .join('');
  $('pausemode').innerHTML = `Game: <b>${modeName()}</b>${joining() ? " · the host's choice" : ''}`;
  $('pausemode').title = NOTE[modeKey()];
  $('pausemode').classList.toggle('hidden', !net.role);
}
document.getElementById('mode-coop').onclick = () => setRules({ ffa: false });
document.getElementById('mode-ffa').onclick = () => setRules({ ffa: true });
for (const k in LEVELS) document.getElementById('mode-' + k).onclick = () => setRules({ lvl: k });
// (the creatures are every host's and every lone player's to set; the mode only where others can join; a joining game sets nothing)
netReady.then(() => {
  if (net.role === 'host' && !JOINER) saved();
  document.getElementById('modes').classList.toggle('hidden', joining() || JOINER);
  document.getElementById('mode-game-row').classList.toggle('hidden', net.role !== 'host');
  showRules();
});
showRules();

function applySalvage(k, i) {
  const q = placed[k]?.[i];
  if (!q) return;
  if (k === 'scrap') {
    q.gone = true;
    markDirty();
    q.col.r = 0;
    q.col.vr = 0;
  } else q.salvaged = true;
}

// ── Joining: a joiner's WALK OUT asks the host first, and walks out when the host welcomes it ──
// (the play log notes each step, and a join with no answer says so on screen: the gate of slice 12, after a joined game
// on the family's LAN play waited with no trace of why)
let joinT = 0,
  wantCh = 0,
  waitLogged = false,
  joinAt = 0,
  hellos = 0,
  stalled = false;
export function requestJoin(i) {
  if (!joinT) {
    joinAt = performance.now();
    hellos = 0;
    stalled = false;
    logEvent('join-ask', { ch: CHARS[i].id, stream: net.stream });
  }
  wantCh = i;
  joinT = 0.01;
  document.getElementById('loading').textContent = "Looking for the host's game…";
}
setInterval(() => {
  if (joinT && !running()) {
    send('host', { t: 'hello', c: wantCh });
    hellos++;
    const s = Math.round((performance.now() - joinAt) / 1000);
    if (s >= 8 && !waitLogged) {
      if (!stalled) {
        stalled = true;
        logEvent('join-stall', { s, hellos, stream: net.stream, fails: net.fails });
      }
      document.getElementById('loading').textContent =
        net.stream !== 'open'
          ? `No link to the host computer (${s} s): check its server still runs (serve.py --lan) and this computer is on the same network, then reload.`
          : `No answer from the host's game yet (${s} s). Is the host computer in a game? This keeps trying.`;
    }
  }
  flush();
}, 1000);

// build the host's world, then join as asked. The address lists each world this join reloaded for: one met again (two host
// pages open on different worlds would bounce a joiner between them) says so instead of reloading round and round; any other
// is a real change of world and is followed (November 15, 2026: a once-only guard left two joiners stuck on the old world)
function reseed(s) {
  const was = (params.get('reseed') || '').split('.').filter(Boolean),
    again = was.includes(s);
  joinT = 0;
  logEvent('join-reseed', { mine: SEED_TEXT, host: s, again });
  if (again) {
    document.getElementById('loading').textContent =
      'The host computer has two games open on different worlds: close one, then reload this page.';
    return;
  }
  document.getElementById('loading').textContent = "Building the host's world…";
  carry(wantCh);
  params.set('seed', s);
  params.set('reseed', [...was, s].join('.'));
  location.search = params.toString();
}
// what the reloaded page needs: who to walk out as (main.js), and the last game's result for the title
function carry(i) {
  try {
    sessionStorage.setItem('iw2.rejoin', String(i));
    const f = document.getElementById('fallen');
    if (!f.classList.contains('hidden'))
      sessionStorage.setItem(
        'iw2.fallen',
        JSON.stringify([f.querySelector('h2').textContent, f.querySelector('p').textContent]),
      );
  } catch {
    /* the player walks out again */
  }
}
// Everyone is down (Jared, November 15, 2026: "when everyone dies, the map should be respawned"): the host's next walk-out
// builds a new world, unless its name was typed on the start menu or it is the classic one (KEEP), and each joined game
// follows the host into it by itself: it asks to join again, builds the world the host names, and walks out when the host does.
// (2 s on: the game-over news reaches the host before the first ask, or a still-running host would welcome it back to the old game)
export let nextSeed = '';
export function nextGame() {
  if (!joining()) {
    if (!KEEP) nextSeed ||= randomSeed();
    return;
  }
  const i = CHARS.indexOf(player.ch);
  setTimeout(() => {
    if (!running() && i >= 0) requestJoin(i);
  }, 2000);
}
// startGame: the walk-out after a game over, on a page built for the new world
export function freshWorld(i) {
  if (!nextSeed) return false;
  logEvent('world-new', { from: SEED_TEXT, to: nextSeed });
  carry(i);
  params.set('seed', nextSeed);
  params.delete('keep');
  location.search = params.toString();
  return true;
}

onMessage((m, from) => onMsg(m, from));
function onMsg(m, from) {
  switch (m.t) {
    case 'hello':
      if (net.role !== 'host') break; // a game asks to join
      // (post, not send: nobody has joined yet, and a host with nobody joined sends nothing)
      if (!running()) {
        post(from, { t: 'wait', seed: nextSeed || SEED_TEXT });
        break;
      } // (the world it will build next: a joiner builds it meanwhile)
      post(from, {
        t: 'welcome',
        crates: caches.flatMap((c, i) => (c.broken ? [[i, 2]] : c.opened ? [[i, 1]] : [])),
        salv: salvaged,
        food: eaten,
        pickups: pickups.map((k) => [k.id, k.kind, +k.mesh.position.x.toFixed(2), +k.mesh.position.z.toFixed(2)]),
        tur: turrets.map((q) => [+q.x.toFixed(2), +q.z.toFixed(2), +q.head.rotation.y.toFixed(2), +q.life.toFixed(1)]), // turrets already out, so a late joiner sees them
        fell: felled,
        built: builtMsg(),
        d: [day.t, day.n, day.speed, day.g],
        seed: SEED_TEXT,
        edge: EDGE,
        rules: { ...rules },
        radio: places.some((q) => q.on) ? 1 : 0,
        relics: relicState(),
      });
      /* (slice 23: the radio tower's radio, on) */ break; // (slice 13: the time of day) // slice 11: trees felled, bushes picked, and what players built
    case 'seed?':
      if (net.role === 'host') post(from, { t: 'seed', s: nextSeed || SEED_TEXT });
      break; // a joiner, before it builds anything (config.js)
    case 'wait':
      if (joinT && m.seed && m.seed !== SEED_TEXT) {
        reseed(m.seed);
        break;
      }
      if (!waitLogged) {
        waitLogged = true;
        logEvent('join-wait');
      }
      document.getElementById('loading').textContent = 'The host is still on the start menu: walk out there first.';
      break;
    case 'welcome':
      if (!joinT || running()) break;
      if (m.radio) radioLater();
      // another world than this page built (the host rolled a new one after this page loaded): build the host's, then join
      // as asked (slice 13c; a joining page normally gets the host's seed before it builds anything, config.js)
      if (m.seed && m.seed !== SEED_TEXT) {
        reseed(m.seed);
        break;
      }
      // the host's edge (?edge=, picked on its page; the mist is set up as the page loads): load again with it
      if ((m.edge || 'mountains') !== EDGE) {
        params.set('edge', m.edge || 'mountains');
        location.search = params.toString();
        break;
      }
      if (params.has('reseed')) {
        params.delete('reseed');
        history.replaceState(null, '', '?' + params.toString() + location.hash);
      } // (in: the next world change is followed too)
      joinT = 0;
      net.host = from;
      logEvent('join-welcome', { ms: Math.round(performance.now() - joinAt), hellos });
      for (const [i, s] of m.crates) {
        const c = caches[i];
        if (!c) continue;
        s === 2 ? c.smash() : c.open();
      }
      for (const [k, i] of m.salv) applySalvage(k, i);
      for (const i of m.food || []) if (takeFood(i)) eaten.push(i);
      if (m.d) setDay(...m.d);
      applyFelled(m.fell || []);
      for (const b of m.built || []) addBuilt(...b); // (the host's clock first: a new game count restarts this page's own stumps, not the host's)
      takeRules(m.rules);
      showRules(); // (slice 33: the host's rules, before the start event logs them)
      startGame(wantCh);
      joinT = 0;
      applyRelics(m.relics);
      /* (#53: where the host's relics are) */ for (const [id, kind, x, z] of m.pickups)
        addPickup(id, kind, x, z, true);
      for (const [x, z, f, life] of m.tur || []) {
        deployTurret(x, z, f, true);
        turrets.at(-1).life = life;
      }
      break;
    case 'p': {
      let o = others.get(from); // a player's state
      if (!o) {
        if (!running() && net.role === 'join') break;
        o = { id: from, c: m.c, x: m.x, y: m.y, z: m.z, f: m.f, mesh: buildCharacter(CHARS[m.c]), down: 0, out: 0 };
        o.name = CHARS[m.c].player;
        o.mesh.userData.ring.visible = false;
        scene3().add(o.mesh);
        others.set(from, o);
        log(
          from === net.host && net.role === 'join'
            ? `You joined ${o.name}'s game (${CHARS[m.c].title}). ${modeName()}.`
            : `${o.name} (${CHARS[m.c].title}) joined the game.`,
        );
        logEvent('coop-in', { who: o.name, host: from === net.host || undefined });
      }
      if (o.c !== m.c) {
        scene3().remove(o.mesh);
        o.mesh = buildCharacter(CHARS[m.c]);
        o.mesh.userData.ring.visible = false;
        scene3().add(o.mesh);
        o.c = m.c;
        o.name = CHARS[m.c].player;
        o.u = 0;
      }
      if ((m.u || 0) !== (o.u || 0)) {
        o.u = m.u || 0;
        applyUp(o.mesh, CHARS[o.c].id, !!(o.u & (1 << o.c)));
      } // slice 12: their upgrade shows here too
      const wasDown = o.down > 0;
      track(o, from, m.ts ?? performance.now(), m.x, m.y, m.z, m.f);
      Object.assign(o, {
        k: m.k || 0,
        pk: m.pk || 0,
        hp: m.hp,
        mx: m.mx,
        down: m.dn,
        out: m.out,
        rv: m.rv,
        rt: m.rt,
        sw: m.sw,
        g: m.g,
        ea: m.ea,
        dq: m.dq,
        sl: m.sl,
        tc: m.tc,
        sfEnd: performance.now() + (m.sf || 0) * 1000,
        seen: performance.now(),
      });
      if (m.dn > 0 && !wasDown) {
        o.mesh.userData.anim.die();
        log(
          rules.ffa
            ? `${o.name} is knocked out.`
            : `${o.name} is down! Stand close and hold E (B on a pad) to revive them.`,
        );
      }
      if (!(m.dn > 0) && wasDown && !m.out) {
        o.mesh.userData.anim.revive();
        log(rules.ffa ? `${o.name} is back in the game.` : `${o.name} is back up.`);
      }
      if (m.out && !o.wasOut) {
        o.wasOut = true;
        log(`${o.name} is out of the game.`);
      }
      o.mesh.visible = !m.out;
      break;
    }
    case 'left': {
      const o = others.get(from);
      clocks.delete(from);
      dropGhostDeep(from);
      if (o) {
        scene3().remove(o.mesh);
        others.delete(from);
        log(`${o.name} left the game.`);
        logEvent('coop-out', { who: o.name });
      }
      if (from === net.host && running()) {
        net.host = null;
        gameOver("The host's game ended.");
      }
      break;
    }
    case 'a': {
      const o = others.get(from);
      if (!o) break;
      o.mesh.userData.anim.attack(true, !!m.c); // a player attacked: their swing shows here
      if (m.r) slash(new THREE.Vector3(m.d[0], 0, m.d[1]), m.r, o);
      break;
    }
    case 'shot': {
      const s = fireShot(
        new THREE.Vector3(...m.o),
        new THREE.Vector3(...m.d),
        0,
        m.k,
        !!m.h,
        false,
        m.u ? (m.k === 'ranger' ? 'boom' : 'aura') : true,
      );
      s.owner = others.get(from);
      break;
    } // seen, not felt
    case 'tur':
      deployTurret(m.x, m.z, m.f, true);
      break;
    case 'hurt':
      hurtPlayer(m.dmg, m.by, m.fx != null ? { x: m.fx, z: m.fz } : null, m.by === 'player' ? from : null);
      break; // (slice 33: another player's blow says whose)
    case 'ko':
      logEvent('ko', { who: m.n, mode: modeKey() });
      player.pk = (player.pk || 0) + 1;
      log(`You knocked out ${m.n}! (+3)`);
      sfx('rally', null, 0.6);
      break; // slice 33: a rival this game knocked out
    case 'rules':
      if (from === net.host && joining()) {
        takeRules(m);
        showRules();
        logEvent('rules', { mode: modeKey(), lvl: rules.lvl });
        log(`The host changed the game: ${modeName()}.`);
      }
      break;
    case 'log':
      log(m.s);
      break;
    case 'say':
      if (running()) sfx(m.n, { x: m.x, z: m.z }, m.k || 1);
      break; // a wolf's call, from where it stands (the follow-ups to #66)
    case 'glob':
      if (running()) spit(m.o, m.v, m.k);
      break; // #66: a pale spider's web glob, flown on this game too (it holds only this game's player)
    case 'radio':
      radioOn(m.n || 'A friend');
      break; // slice 23: a friend got the radio tower's radio going
    case 'gotc':
      crateOpen(null, null, m.got);
      break; // the host opened a crate for this player: its loot
    case 'got':
      gotPickup(m.kind);
      break;
    case 'kill':
      player.kills++;
      log(m.s);
      break;
    case 'salv':
      applySalvage(m.k, m.i);
      salvaged.push([m.k, m.i]);
      break;
    case 'food':
      if (takeFood(m.i)) eaten.push(m.i);
      break; // places round 2: a piece of food another player took
    case 'relics':
      if (net.role === 'join') applyRelics(m.s);
      break; // #53: the host's word on where each relic is
    case 'relic-take':
      if (net.role === 'host') takeRelic(m.i, from);
      break; // #53: a joined player asks to take one
    case 'crated': {
      const c = caches[m.i];
      if (c && !c.opened) c.open();
      break;
    }
    case 'smashed': {
      const c = caches[m.i];
      if (c && !c.broken) c.smash();
      break;
    }
    case 'loot':
      if (joining() && running()) addPickup(m.id, m.kind, m.x, m.z, false, m.v);
      break;
    case 'claim':
      if (!joining()) {
        const i = pickups.findIndex((k) => k.id === m.id),
          o = others.get(from); // (slice 21: a joined player touched it first)
        if (i < 0) {
          send(from, { t: 'take', id: m.id });
          break;
        } // (gone already: the claimer drops its copy)
        if (o && !gone(o) && !(pickups[i].kind === 'ammo' && CHARS[o.c]?.id !== 'gunslinger')) {
          send(from, { t: 'got', kind: pickups[i].kind });
          scene3().remove(pickups[i].mesh);
          pickups.splice(i, 1);
          send('all', { t: 'take', id: m.id });
        }
      }
      break;
    case 'take': {
      const i = pickups.findIndex((k) => k.id === m.id);
      if (i >= 0) {
        scene3().remove(pickups[i].mesh);
        pickups.splice(i, 1);
      }
      break;
    }
    case 'end':
      if (running()) {
        gameOver(null, ALL_OUT);
        nextGame();
      }
      break;
    // the host's side of another player's actions
    case 'hit':
      if (net.role === 'host') {
        const e = enemies.find((q) => q.id === m.id);
        if (e) hitEnemy(e, m.dmg, m.nx, m.nz, null, from);
      }
      break;
    case 'charm':
      if (net.role === 'host') {
        const e = enemies.find((q) => q.id === m.id);
        if (e && !e.dead) charm(e);
      }
      break;
    case 'cry':
      if (net.role === 'host') scare(m.x, m.z);
      break;
    case 'crate':
      if (net.role === 'host' && caches[m.i]) crateOpen(caches[m.i], from);
      break;
    case 'smash':
      if (net.role === 'host' && caches[m.i]) smashCrate(caches[m.i], null, null, from);
      break;
    case 'w':
      if (joining() && running()) applyWorld(m, from);
      break;
    case 'chk':
      if (joining() && running()) onCheck(m, from);
      break; // slice 13d: the host's world against this one (watch.js)
    // a game whose window was hidden (a tab switch, a minimised window, a closed lid) stops: its browser stops drawing it.
    // The host's stopping holds the whole world (2026-11-04: the host's window went to the background and a joined
    // Gunslinger shot a frozen bog lurker 21 times for nothing), so every game says when it goes and comes back.
    case 'away': {
      const o = others.get(from);
      if (!o || !!o.away === !!m.on) break;
      o.away = !!m.on;
      logEvent('away', { who: o.name, on: m.on ? 1 : 0, host: from === net.host || undefined }); // (slice 21: a joined player's world stood still unrecorded)
      log(m.on ? `${o.name}'s game went into the background.` : `${o.name}'s game is back.`);
      break;
    } // (slice 21: a hidden host's world runs on, main.js bgClock)
    // slice 11: trees, bushes and what players build are the host's (harvest.js, craft.js)
    case 'chop':
      if (net.role === 'host') onChop(m);
      break;
    case 'fell':
      onFell(m);
      break;
    case 'dig':
      if (net.role === 'host') onDig(m);
      break; // slice 26: a stump dug up
    case 'dug':
      onDug(m);
      break;
    case 'grew':
      onGrew(m);
      break; // the host says a stump is a tree again
    case 'shake':
      onShake(m);
      break;
    case 'build':
      if (net.role === 'host') onBuildReq(m, from);
      break;
    case 'built':
      onBuilt(m);
      break;
    case 'nobuild':
      onNoBuild(m);
      break;
    // slice 12: tearing down, gates and the pieces' health and state (build.js)
    case 'tear':
      if (net.role === 'host') onTearReq(m, from);
      break;
    case 'gate':
      if (net.role === 'host') onGateReq(m);
      break;
    case 'fix':
      onFixReq(m, from);
      break; // slice 32: a joined player mends a wall
    case 'gone':
      onGone(m);
      break;
    case 'bst':
      onBst(m);
      break;
  }
}

// ── The world from the host, on a joined game ──
const ST = ['idle', 'lurk', 'emerge', 'chase', 'windup', 'recover', 'flee', 'charmed', 'siege', 'drop']; // (drop: a spider on its thread, slice 22)
function applyWorld(m, from) {
  const seen = new Set();
  if (m.d) setDay(...m.d); // the host's clock (slice 13)
  for (const [id, type, x, z, yaw, s, hp, maxHp, cue = 0, y = null, ck = 0] of m.e) {
    seen.add(id);
    let e = enemies.find((q) => q.id === id);
    if (!e) {
      if (hp <= 0) continue;
      spawnEnemy(x, z, type);
      e = enemies.at(-1);
      e.id = id;
      e.yaw = yaw;
    } // a corpse this game already cleared stays gone
    const st = ST[s] || 'idle',
      u = e.mesh.userData;
    e.y = y;
    e.ckW = ck; // (a spider up a wall or on top of something: the follow-ups to #66)
    if (st === 'windup' && e.state !== 'windup') {
      u.anim.attack();
      if (Math.random() < 0.4) sfx(e.type, e, 0.7);
    }
    if (st === 'chase' && (e.state === 'idle' || e.state === 'lurk')) sfx(e.type, e); // it has seen someone
    if (cue & 1 && !(e.cue & 1)) dangerCue(e);
    if (cue & 2 && !(e.cue & 2)) sfx('hiss', e);
    e.cue = cue;
    e.spitW = cue & 2 ? 1 : 0; // #66 (the stranger's review: a joined player saw no warning)
    if (hp < e.hp && !e.dead) {
      e.flashT = 0.15;
      e.barT = 6;
    }
    track(e, from, m.ts ?? performance.now(), x, 0, z, yaw);
    Object.assign(e, { state: st, hp, maxHp });
    if (hp <= 0 && !e.dead) {
      e.dead = 5;
      u.anim.die();
      u.flash(0);
      sfx(e.type, e, 0.8);
      sfx('thud', e, 0.6);
    }
  }
  for (const e of enemies)
    if (!seen.has(e.id) && !e.gone) {
      dropFrom(e);
      scene3().remove(e.mesh);
      e.gone = true;
    }
}
function worldMsg() {
  return {
    t: 'w',
    ts: Math.round(performance.now()),
    d: [+day.t.toFixed(5), day.n, day.speed, day.g],
    e: enemies
      .filter((e) => !e.gone)
      .map((e) => [
        e.id,
        e.type,
        +e.x.toFixed(2),
        +e.z.toFixed(2),
        +e.yaw.toFixed(2),
        Math.max(0, ST.indexOf(e.state)),
        Math.max(0, e.hp),
        e.maxHp,
        (e.warnT > 0 && !e.cueAt ? 1 : 0) | (e.spitW > 0 ? 2 : 0),
        e.y != null ? +e.y.toFixed(2) : null,
        +(e.ck || 0).toFixed(2),
      ]),
  };
} // (the last: #66's cues, a danger's warning and a pale spider about to spit)

// ── Smooth playback (the gate of slice 12, from the family's LAN play of 2026-11-04, "working but a little choppy") ──
// Each 'p' and 'w' carries its sender's clock (ms). Over Wi-Fi they arrive unevenly (two or three at once, then none), and
// the old chase toward the newest one moved avatars and enemies in jerks. Now each game plays the others back a little
// behind the sender's clock, between the two samples either side of that moment, so uneven arrival never shows. How far
// behind follows each sender's own jitter (one send interval plus the worst lateness of the last few seconds), and
// changes slowly (playback runs at most a tenth fast or slow while it does), so nothing ever steps back.
const clocks = new Map(); // sender -> { off: this clock minus its clock at the quickest delivery seen, j: lateness (ms), d: delay (ms) }
function track(q, from, ts, ...v) {
  const s = performance.now() - ts;
  let c = clocks.get(from);
  if (!c) clocks.set(from, (c = { off: s, j: 0, d: 120 }));
  if (s < c.off) {
    c.j += c.off - s;
    c.off = s;
  }
  c.j = Math.max(c.j, s - c.off);
  const b = (q.buf ||= []);
  if (!b.length || ts > b.at(-1)[0]) b.push([ts, ...v]);
  if (b.length > 60) b.shift();
}
let clockT = performance.now();
function tickClocks() {
  const n = performance.now(),
    dt = Math.min(1, (n - clockT) / 1000);
  clockT = n;
  for (const c of clocks.values()) {
    c.j *= Math.exp(-dt / 8);
    c.d += Math.max(-100 * dt, Math.min(100 * dt, Math.min(400, 90 + c.j) - c.d));
  }
}
// [x, y, z, facing] where q was on its sender's clock that long ago; a late sample is made up for by carrying the last
// motion on for up to 0.1 s; a jump of over 8 m (a teleport, a respawn) is taken at once, never slid
function playback(q, from) {
  const b = q.buf,
    c0 = clocks.get(from);
  if (!b?.length || !c0) return null;
  const t = performance.now() - c0.off - c0.d;
  while (b.length > 2 && b[1][0] <= t) b.shift();
  const a = b[0],
    c = b[1];
  if (!c || t <= a[0]) return a.slice(1);
  if (Math.hypot(c[1] - a[1], c[3] - a[3]) > 8) return (t >= c[0] ? c : a).slice(1);
  const u = Math.min((t - a[0]) / (c[0] - a[0]), 1 + 100 / (c[0] - a[0]));
  let d = c[4] - a[4];
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return [a[1] + (c[1] - a[1]) * u, a[2] + (c[2] - a[2]) * u, a[3] + (c[3] - a[3]) * u, a[4] + d * u];
}
// a hidden window says so, and says when it is back (see 'away' above); the play log notes both
document.addEventListener('visibilitychange', () => {
  logEvent(document.hidden ? 'hidden' : 'shown');
  player.away = document.hidden && !!net.role;
  if (net.role && running()) {
    send('all', { t: 'away', on: document.hidden ? 1 : 0 });
    flush();
  }
});
export const deliver = (m, from) => onMsg(m, from); // (for the checks: a message as if it came over the network)

// Jared, 2026-11-15: "nametags for other players are currently always visible- maybe update to make them only visible when
// 'nearby'?". A friend's tag shows within TAG_NEAR m, fades out over the last TAG_FADE m, and hides while a wall or hill is
// between the camera and it. A co-op friend who is down keeps theirs at any range, since it is how you find them to revive
export const TAG_NEAR = 30,
  TAG_FADE = 6;
const hit = (x, y, z) =>
  y < groundY(x, z) - 0.05 ||
  nearColliders(x, z).some(
    (c) => c.r && !c.gate && Math.hypot(c.x - x, c.z - z) < colR(c, x, z, y) && y < (c.top ?? 99) && !(y < c.bot),
  );
function sightBlocked(x, y, z, p) {
  const n = Math.ceil(Math.hypot(p.x - x, p.z - z) / 0.25); // a sample every 1/4 m (a wall is 0.6 m thick)
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (hit(x + (p.x - x) * t, y + (p.y - y) * t, z + (p.z - z) * t)) return true;
  }
  return false;
}

// ── Every frame: other players move smoothly to where they were a moment ago; this game sends its own ──
let sendT = 0,
  worldT = 0,
  chkT = 0;
export function tickCoop(dt) {
  const now = performance.now(),
    tags = [];
  tickClocks();
  for (const o of others.values()) {
    if (now - o.seen > (o.away ? 120000 : 12000)) {
      scene3().remove(o.mesh);
      others.delete(o.id);
      log(`${o.name} lost connection.`);
      dropGhostDeep(o.id);
      continue;
    }
    const px = o.x,
      pz = o.z,
      s = playback(o, o.id);
    if (s) [o.x, o.y, o.z, o.f] = s;
    o.mesh.position.set(o.x, o.y, o.z);
    o.mesh.rotation.y = o.f;
    o.mesh.userData.anim.update(dt, {
      speed: Math.hypot(o.x - px, o.z - pz) / Math.max(dt, 1e-3),
      onGround: o.g !== 0,
      swimming: !!o.sw,
      kneel: !!o.rv,
    });
    eatPose(o.mesh, o.ea ? 0.9 : 0); // a friend eating (slice 12)
    tickGhostDeep(o.id, o.out ? null : o.dq, dt); // the serpent hunting them, if one is (slice 13)
    // the tag sits just over the head, or just over the body while they are down, with the revive's progress as its bar
    // (slice 33: in free-for-all a rival's tag is in the rivals' red, with their score, and nobody revives them)
    const dn = o.down > 0,
      tp = new THREE.Vector3(o.x, o.y + (dn ? 0.75 : 2.02), o.z),
      d = Math.hypot(o.x - player.x, o.z - player.z),
      always = dn && !rules.ffa;
    if ((o.sightT = (o.sightT || 0) - dt) <= 0) {
      o.sightT = 0.25;
      o.hid = !always && d < TAG_NEAR && sightBlocked(eye().x, eye().y, eye().z, tp);
    } // (4 times a second)
    const want = always ? 1 : o.hid ? 0 : Math.min(1, Math.max(0, (TAG_NEAR - d) / TAG_FADE));
    o.tagA = (o.tagA ?? 0) + (want - (o.tagA ?? 0)) * Math.min(1, dt * 6);
    if (!o.out && o.tagA > 0.02)
      tags.push({
        p: tp,
        a: o.tagA,
        text: rules.ffa
          ? `${o.name} · ${dn ? 'KNOCKED OUT' : '★ ' + score(o) + (o.sfEnd > performance.now() ? ' · safe' : '')}`
          : dn
            ? `${o.name} · DOWN ${Math.ceil(o.down)} s${o.rt ? ' · reviving' : ' · hold E to revive'}`
            : o.name + (o.sl ? ' · asleep' : ''),
        color: rules.ffa
          ? dn
            ? '#c86a5a'
            : RIVAL
          : dn
            ? '#ff8a6a'
            : '#' + CHARS[o.c].color.toString(16).padStart(6, '0'),
        frac: dn ? (o.rt || 0) / 100 : Math.max(0, o.hp / o.mx),
        bar: true,
        fill: dn ? 'linear-gradient(#ffd27a,#e08a2a)' : null,
      });
  }
  nameTags(tags);
  if (!net.role || !running()) return;
  if ((sendT += dt) >= 1 / 15 && (coop() || joining())) {
    sendT = 0;
    send('all', {
      t: 'p',
      ts: Math.round(performance.now()),
      c: CHARS.indexOf(player.ch),
      x: +player.x.toFixed(2),
      y: +player.y.toFixed(2),
      z: +player.z.toFixed(2),
      f: +player.faceYaw.toFixed(2),
      hp: Math.round(player.hp),
      mx: player.maxHp,
      dn: +(player.down || 0).toFixed(1),
      out: player.out ? 1 : 0,
      k: player.kills,
      pk: player.pk || 0,
      rv: player.rv ? 1 : 0,
      rt: Math.round(((player.revT || 0) / 2.5) * 100),
      sw: player.swim ? 1 : 0,
      g: player.onGround ? 1 : 0,
      u: upBits(),
      ea: player.eat ? 1 : 0,
      dq: deepMsg(),
      sl: player.sleep ? 1 : 0,
      tc: player.torch?.on ? 1 : 0,
      sf: +(player.graceT || 0).toFixed(1),
    });
  } // (#86: sf, the safe seconds left after a respawn)
  if (net.role === 'host' && coop() && (worldT += dt) >= 1 / 12) {
    worldT = 0;
    send('all', worldMsg());
  }
  if (net.role === 'host' && coop() && (chkT += dt) >= 10) {
    chkT = 0;
    send('all', checkMsg());
  } // slice 13d: drift (watch.js)
  flush();
}
// a joined game's enemies glide to the host's positions (game.js calls this in place of their own thinking)
export function followHost(e, dt) {
  const s = playback(e, net.host);
  if (!s) return;
  const x = e.x,
    z = e.z;
  e.x = s[0];
  e.z = s[2];
  e.nyaw = s[3];
  e.spd = Math.hypot(e.x - x, e.z - z) / Math.max(dt, 1e-3);
} // for its walk cycle
export { net };
