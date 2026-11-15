// Ticket #16 (Jared, November 15, 2026; docs/decisions/2026-11-15-tutorial.md): controls that teach themselves, and a
// first-time tour. Every key hint is a key cap for whichever was used last: the keyboard's key, or a small drawing of the pad's
// buttons with the one to press lit ("show the button pattern visually rather than a letter or shape"), which reads the same
// on an Xbox or a PlayStation pad and needs no reading. The tour starts on a computer's first walk-out, is learned by doing in
// the real world, never pauses, moves on by itself after about 20 s, and is skipped from the pause screen.
import { player, isPadActive, isRunning, togglePause } from './game.js';
import { craftOpen } from './craft.js';

// what each action is on a keyboard, and where it sits on a pad
const ACT = { use: ['E', 'b'], jump: ['Space', 'a'], attack: ['Click', 'rt'], special: ['F', 'lb'], craft: ['Tab', 'view'], pause: ['Esc', 'menu'],
  look: ['Mouse', 'rs'], move: ['W A S D', 'ls'], eat: ['G', 'down'], repair: ['H', 'right'], tear: ['X', 'rb'], go: ['Enter', 'a'], pick: ['↑↓', 'up'], close: ['Tab', 'b'] };
// the pad's buttons by group, drawn in a 32 x 22 box: the face diamond, the d-pad cross, the shoulders, the sticks, the middle two
const PARTS = {
  face: { y: '<circle cx="16" cy="4.5" r="3"', b: '<circle cx="22.5" cy="11" r="3"', a: '<circle cx="16" cy="17.5" r="3"', x: '<circle cx="9.5" cy="11" r="3"' },
  dpad: { up: '<rect x="14.3" y="1.5" width="3.4" height="7" rx="1"', down: '<rect x="14.3" y="13.5" width="3.4" height="7" rx="1"', left: '<rect x="6.5" y="9.3" width="7" height="3.4" rx="1"', right: '<rect x="18.5" y="9.3" width="7" height="3.4" rx="1"' },
  top: { lt: '<rect x="4" y=".6" width="7" height="5" rx="2.5"', rt: '<rect x="21" y=".6" width="7" height="5" rx="2.5"', lb: '<rect x="3.5" y="6.6" width="9" height="3" rx="1.5"', rb: '<rect x="19.5" y="6.6" width="9" height="3" rx="1.5"' },
  sticks: { ls: '<circle cx="11" cy="12.5" r="3.4"', rs: '<circle cx="21" cy="12.5" r="3.4"' },
  mid: { view: '<rect x="11.5" y="6" width="4" height="2.8" rx="1.4"', menu: '<rect x="16.5" y="6" width="4" height="2.8" rx="1.4"' } };
// the sticks and the two middle buttons sit inside a faint outline of the controller, so they read as a controller's parts
const BODY = '<path class="body" d="M7 2.5h18c3.4 0 5.4 3 5.9 7.4l.5 6.2c.3 3-2.6 4.6-4.6 3l-4-3.4H9.2l-4 3.4c-2 1.6-4.9 0-4.6-3l.5-6.2C1.6 5.5 3.6 2.5 7 2.5z"/>';
// the shoulders and triggers sit on the top edge of a lower, flatter outline, so they read as the controller's top (critic round 2)
const LOW = '<path class="body" d="M7 11h18c2.5 0 4.2 2 4.6 5l.4 3c.2 2-1.8 3-3.3 2l-3-2.5H9.3l-3 2.5c-1.5 1-3.5 0-3.3-2l.4-3C3.8 13 5.5 11 7 11z"/>';
// a stick to push gets four small arrows round it (a stick drawn alone read as "press it", critic round 2)
const PUSH = { ls: [11, 12.5], rs: [21, 12.5] }, arrows = ([x, y]) => `<path class="on" d="M${x} ${y - 5.8}l-1.4 1.7h2.8zM${x} ${y + 5.8}l-1.4-1.7h2.8zM${x - 5.8} ${y}l1.7-1.4v2.8zM${x + 5.8} ${y}l-1.7-1.4v2.8z"/>`;
const NAME = { a: 'A', b: 'B', x: 'X', y: 'Y', up: 'd-pad up', down: 'd-pad down', left: 'd-pad left', right: 'd-pad right', lt: 'LT', rt: 'RT', lb: 'LB', rb: 'RB', ls: 'left stick', rs: 'right stick', view: 'View', menu: 'Menu' };
function padGlyph(b) { const g = Object.values(PARTS).find(p => p[b]);
  return `<svg viewBox="0 0 32 22" aria-hidden="true">${g === PARTS.sticks || g === PARTS.mid ? BODY : g === PARTS.top ? LOW : ''}${Object.entries(g).map(([k, s]) => `${s} data-b="${k}"${k === b ? ' class="on"' : ''}/>`).join('')}${PUSH[b] ? arrows(PUSH[b]) : ''}</svg>`; }
// a key cap for an action, for the keyboard or the pad (whichever was used last)
// (the mouse's two get a drawing too, beside the word: its body with arrows to look, its left button lit to click; critic round 1)
const MOUSE = { Mouse: '<path class="on" d="M.5 11l3.5-3v6zM27.5 11l-3.5-3v6z"/>', Click: '<path class="on" d="M14 2.6v6.9H8.2V9a5.8 5.8 0 0 1 5.8-6.4z"/>' };
export function kc(act, pad = isPadActive()) { const [k, b] = ACT[act];
  return pad ? `<kbd class="kc pad" aria-label="${NAME[b]} button">${padGlyph(b)}</kbd>`
    : `<kbd class="kc">${MOUSE[k] ? `<svg class="ms" viewBox="0 0 28 22" aria-hidden="true"><rect data-b="m" x="8" y="2" width="12" height="18" rx="6"/><path data-b="m" d="M14 2v7.5M8 9.5h12"/>${MOUSE[k]}</svg>` : ''}${k}</kbd>`; }

// the prompt line's text ("Hold E · chop the tree") drawn with a key cap for its key
const LABEL = { E: 'use', B: 'use', Tab: 'craft', View: 'craft', X: 'tear', RB: 'tear', H: 'repair', 'd-pad right': 'repair', G: 'eat', 'd-pad down': 'eat' };
const esc = (s) => s.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
export function capLine(t) { const m = /^(Hold )?([^·]+?) · ([\s\S]*)$/.exec(t); return m && LABEL[m[2]] ? `${m[1] || ''}${kc(LABEL[m[2]])} ${esc(m[3])}` : esc(t); }

// the hints outside play, kept on the last-used device: the title's press line, the pause screen's resume line, the craft menu's keys
const $ = (id) => document.getElementById(id);
let shown = null;
export function hintsTick() { const pad = isPadActive(), on = !!tour; if (shown === pad + ' ' + on) return; shown = pad + ' ' + on;
  $('title-go').innerHTML = `PRESS ${pad ? kc('go', true) : 'ENTER'}`; // (the keyboard keeps the words: a cap inside the amber button read as a second button)
  $('pause').querySelector('.sub').innerHTML = pad ? `${kc('pause', true)} to resume` : 'P or Esc to resume';
  $('craft').querySelector('.ch small').innerHTML = pad ? `${kc('pick', true)} pick · ${kc('go', true)} craft · ${kc('close', true)} close` : '↑↓ pick · Enter craft · Tab close';
  $('tour-skip').hidden = !on; }

// ── the tour ──
const STEPS = [
  { id: 'look', act: 'look', say: 'Look around' }, { id: 'move', act: 'move', say: 'Walk' }, { id: 'jump', act: 'jump', say: 'Jump' },
  { id: 'chop', act: 'use', hold: true, say: 'Chop a tree' }, { id: 'swing', act: 'attack', say: 'Swing' }, { id: 'craft', act: 'craft', say: 'Open the craft menu' },
  { id: 'end', say: 'Next: build a craftbench, then a bed to wake in.' }];
const WAIT = 20, FLASH = 0.5, END = 8; // seconds: a step moves on by itself after WAIT (nobody gets stuck), the tick shows FLASH, the last card stays END
const KEY = 'iw2.tour', stored = () => { try { return localStorage.getItem(KEY); } catch { return null; } }, store = (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* storage blocked */ } $('tourrep').checked = !v; }; // (Settings' box follows: the tour ending ticks it off)
let tour = null; // { i, t, flash, log, base, prev }
// on walking out from the start menu (menu.js): the tour runs once per computer, until it ends or is skipped
export function armTour() { tour = stored() === 'done' ? null : { i: 0, t: 0, flash: 0, log: [], base: null, prev: null }; draw(); }
export function skipTour() { if (tour) tour.log.push({ id: STEPS[tour.i].id, how: 'skip' }); finish(); if (isRunning()) togglePause(false); }
function finish() { tour = null; store('done'); draw(); }
// a game that ends mid-tour drops it without counting it as seen: the next walk-out starts it again (the review)
export function endTour() { tour = null; draw(); }
export const tourState = () => tour ? { on: true, step: STEPS[tour.i].id, log: tour.log, stored: stored() } : { on: false, stored: stored() };
// what counts as done for each step, from where the player was when it began
const DONE = {
  look: (b, p) => (b.turn += Math.abs(player.yaw - p.yaw) + Math.abs(player.pitch - p.pitch)) > 0.9,
  move: (b) => Math.hypot(player.x - b.x, player.z - b.z) > 5,
  jump: () => player.vy > 2,
  chop: (b) => (player.inv.wood || 0) > b.wood,
  swing: (b, p) => player.atkT > p.atk + 1e-3, // (a new swing since the last frame: one made before the step began does not count, the review)
  craft: () => craftOpen(),
  end: () => false };
// each frame of play (game.js update), and by the checks with a big dt to move the clock on
export function tourTick(dt) { if (!tour) return; const s = STEPS[tour.i];
  if (player.dead || player.down > 0) { tour.prev = null; return draw(); } // (down: the card waits, and so does its clock)
  if (!tour.base) tour.base = { x: player.x, z: player.z, wood: player.inv.wood || 0, turn: 0 };
  if (tour.flash > 0) { if ((tour.flash -= dt) <= 0) next(); return draw(); }
  const doneNow = tour.prev && DONE[s.id](tour.base, tour.prev); tour.prev = { yaw: player.yaw, pitch: player.pitch, atk: player.atkT }; tour.t += dt;
  if (s.id === 'end') { if (tour.t >= END) { tour.log.push({ id: 'end', how: 'done' }); finish(); } return draw(); }
  if (doneNow || tour.t >= WAIT) { tour.log.push({ id: s.id, how: doneNow ? 'done' : 'time' }); if (doneNow) tour.flash = FLASH; else next(); }
  draw(); }
function next() { Object.assign(tour, { i: tour.i + 1, t: 0, flash: 0, base: null, prev: null }); }
// the card: the key cap large, a few words, a dot for each step
let card = null, drawn = '';
function draw() { card ??= $('tour');
  const s = tour && STEPS[tour.i], hide = !s || !isRunning() || player.dead || player.down > 0;
  const html = hide ? '' : `${s.act ? `<div class="tk">${(s.hold ? 'Hold ' : '') + kc(s.act)}</div>` : ''}<div class="tw">${s.say}</div>` // (the last card has no key: no empty gap, critic round 1)
    + `<div class="td" aria-label="Step ${Math.min(tour.i + 1, 6)} of 6">${STEPS.slice(0, 6).map((q, n) => `<i${n < tour.i || (n === tour.i && tour.flash > 0) ? ' class="on"' : ''}></i>`).join('')}</div><small>${kc('pause')} to skip</small>`; // (skipping teaches pause too)
  card.classList.toggle('hidden', hide); card.classList.toggle('tick', !!tour && tour.flash > 0); if (html !== drawn) { drawn = html; card.innerHTML = html; } }
export const tourOn = () => !!tour;
// Settings: "Show the tour next game" (for a new player on the same computer)
export function bindTour() { const c = $('tourrep'); c.checked = stored() !== 'done'; c.onchange = () => store(c.checked ? null : 'done'); $('tour-skip').onclick = skipTour; }
