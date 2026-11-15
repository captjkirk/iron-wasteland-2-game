// The start menu: three screens over the live world, each but the first with Back (Jared, 2026-11-14, from the mockups at
// https://claude.ai/artifact/GygMU9DT8FvquRLL2tTAnQ: "a title screen ... then a screen where you decide what you want to play
// (mode, difficulty, etc), then the player select screen"; "need 'Back' buttons for menus in case you want to go change a
// setting"). The title (Press Enter); what are we playing (ready-made game nights that mix the mode and the creatures, or
// set it yourself; the host's to choose, so a joining game skips it); who walks out (a carousel of the five characters).
// Keys: Enter (A on a pad) goes on, Esc (B) goes back, ← → (the d-pad) and 1 to 5 pick a character, ↑ ↓ move on the setup
// screen. Settings and How to play open over the title. Why: docs/decisions/2026-11-14-game-modes-and-menus.md
import { CHARS, JOINER, SEED_TEXT } from './config.js';
import { logEvent } from './playlog.js';
import { startGame, readPad, isRunning } from './game.js';
import { armTour } from './tour.js';
import { rules, setRules, modeName, net } from './coop.js';

const $ = (id) => document.getElementById(id), menu = $('menu'), cards = $('cards');
const STEPS = ['title', 'setup', 'chars'];
let sel = 0, step = 'title', custom = false;
export const selected = () => sel;
const joiner = () => JOINER || net.role === 'join';
const openDialog = () => document.querySelector('dialog[open]');
export const menuStep = () => step;

// ready-made game nights: a mode and a creature difficulty together (Brawl only where others can join)
const NIGHTS = [
  { id: 'family', name: 'Family night', text: 'Everyone together, gentle creatures. Good with the little ones.', ffa: false, lvl: 'easy' },
  { id: 'adventure', name: 'Adventure', text: 'The wasteland as it is meant to be: packs, nights and raider camps.', ffa: false, lvl: 'normal' },
  { id: 'brawl', name: 'Brawl', text: 'Every player for themselves. A creature scores 1, knocking out a rival 3.', ffa: true, lvl: 'normal', together: true },
  { id: 'survival', name: 'Survival', text: 'For the big kids: hungrier packs and harder nights, together.', ffa: false, lvl: 'hard' }];
const LVL = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

export function buildMenu() {
  CHARS.forEach((c, i) => { const b = document.createElement('button'); b.className = 'card'; b.type = 'button';
    b.innerHTML = `<canvas class="pv"></canvas><span class="nm">${c.title}</span>`; b.setAttribute('aria-label', `${c.title}, ${c.player}`);
    b.onclick = () => { if (i === sel) next(); else selectCard(i); }; cards.appendChild(b); });
  const list = $('nights');
  for (const n of NIGHTS) { const b = document.createElement('button'); b.type = 'button'; b.className = 'night'; b.dataset.id = n.id;
    b.innerHTML = `<b>${n.name}</b><span>${n.text}</span><em>${n.ffa ? 'Free-for-all' : 'Co-op'} · ${LVL[n.lvl]}</em>`;
    b.onclick = () => { custom = false; setRules({ ffa: n.ffa, lvl: n.lvl }); logEvent('menu-night', { night: n.id }); showNights(); }; list.appendChild(b); }
  const own = document.createElement('button'); own.type = 'button'; own.className = 'night own'; own.dataset.id = 'own';
  own.innerHTML = '<b>Set it yourself</b><span>Pick the game and the creatures below.</span>'; own.onclick = () => { custom = true; showNights(); $('mode-coop').focus(); };
  list.appendChild(own);
  for (const id of ['mode-coop', 'mode-ffa', 'mode-easy', 'mode-normal', 'mode-hard']) $(id).addEventListener('click', () => queueMicrotask(showNights)); // (set it yourself stays open while its rows are changed)
  $('title-go').onclick = next; $('setup-next').onclick = next; $('setup-back').onclick = back; $('chars-back').onclick = back; $('go').onclick = () => walkOut();
  $('prev-ch').onclick = () => selectCard((sel + CHARS.length - 1) % CHARS.length); $('next-ch').onclick = () => selectCard((sel + 1) % CHARS.length);
  $('open-settings').onclick = () => $('dlg-settings').showModal(); $('open-help').onclick = () => $('dlg-help').showModal();
  selectCard(0); showStep('title');
}

const nightNow = () => NIGHTS.find(n => n.ffa === rules.ffa && n.lvl === rules.lvl && (!n.together || net.role === 'host'));
function showNights() { const on = custom ? null : nightNow();
  for (const b of $('nights').children) { const n = NIGHTS.find(q => q.id === b.dataset.id); const is = on ? b.dataset.id === on.id : b.dataset.id === 'own'; b.classList.toggle('on', is); b.setAttribute('aria-pressed', String(is)); b.classList.toggle('hidden', !!n?.together && net.role !== 'host'); }
  $('modes-wrap').classList.toggle('hidden', !!on); $('setup-next').querySelector('span').textContent = modeName(); }

export function showStep(s) { if (s === 'setup' && joiner()) s = 'chars'; step = s; menu.dataset.step = s;
  (s === 'chars' ? $('go') : s === 'setup' ? $('setup-next').parentElement : $('title-go')).after($('loading')); // (the status line goes with the screen: a joiner waits on the characters, the quality pass)
  for (const k of STEPS) $('step-' + k).classList.toggle('hidden', k !== s);
  if (s === 'setup') { if (!nightNow()) custom = true; showNights(); }
  if (s === 'chars') { place(); $('chars-summary').textContent = joiner() ? 'Joining the host\'s game: the host chose what you play' : `${modeName()} · World ${SEED_TEXT}`; }
  if (menu.classList.contains('hidden')) return; logEvent('menu-step', { step: s });
  const first = s === 'title' ? $('title-go') : s === 'setup' ? $('nights').querySelector('.on') : $('go'); if (first && !first.disabled) first.focus({ preventScroll: true }); }
function next() { if (step === 'title') showStep('setup'); else if (step === 'setup') showStep('chars'); else if (!$('go').disabled) walkOut(); }
// walking out from the menu starts the first-time tour on a computer that has not had it (#16; games the checks start directly have none)
function walkOut() { armTour(); startGame(sel); }
function back() { if (step === 'chars') showStep(joiner() ? 'title' : 'setup'); else if (step === 'setup') showStep('title'); }

export function selectCard(i) { if (i !== sel) logEvent('menu-pick', { ch: CHARS[i].id }); sel = i; place(); }
// the carousel: the chosen one large in the middle, two either side, smaller and fainter (moved by transform only)
function place() { const n = CHARS.length, c = CHARS[sel];
  [...cards.children].forEach((el, i) => { let o = ((i - sel) % n + n) % n; if (o > 2) o -= n; const a = Math.abs(o);
    el.style.setProperty('--x', `${o === 0 ? 0 : Math.sign(o) * (a === 1 ? 236 : 390)}px`); el.style.setProperty('--s', [1, 0.62, 0.46][a]); el.style.setProperty('--a', [1, 0.82, 0.5][a]);
    el.style.zIndex = 3 - a; el.classList.toggle('sel', o === 0); el.setAttribute('aria-pressed', String(o === 0)); });
  $('chosen-of').textContent = `${sel + 1} OF ${n} · ${c.player.toUpperCase()}`; $('chosen-name').textContent = c.title;
  $('chosen-desc').textContent = `${c.desc} ${c.maxHp} HP · special: ${c.sec}`;
  $('go').innerHTML = `<b>${joiner() ? 'JOIN' : 'WALK OUT'} AS ${c.title.replace(/^The /, '').toUpperCase()}</b><span>Enter · A on a pad</span>`; }

// keys while no game runs (game.js passes them here)
export function menuKey(e) { if (isRunning()) return; const dlg = openDialog();
  if (dlg) { if (e.code === 'Escape') { e.preventDefault(); dlg.close(); } return; } // (Esc closes How to play or Settings; Tab moves inside them: game.js lets it through off play)
  const t = e.target, onButton = t?.tagName === 'BUTTON' && menu.contains(t);
  if (e.code === 'Escape') { e.preventDefault(); back(); return; }
  if (e.code === 'Enter') { if (t?.closest?.('.night:not(.own)')) { e.preventDefault(); t.click(); next(); } else if (!onButton || t.closest('.card')) { e.preventDefault(); next(); } return; } // (a focused button takes Enter itself; a game night is chosen and goes on)
  if (step === 'chars') { const k = Number(e.key); if (k >= 1 && k <= CHARS.length) selectCard(k - 1);
    if (e.code === 'ArrowLeft') selectCard((sel + CHARS.length - 1) % CHARS.length); if (e.code === 'ArrowRight') selectCard((sel + 1) % CHARS.length); }
  if (step === 'setup' && (e.code === 'ArrowDown' || e.code === 'ArrowUp')) { e.preventDefault(); moveFocus(e.code === 'ArrowDown' ? 1 : -1); }
  // the title: the arrows move between Press Enter, How to play and Settings (a keyboard alone reaches them)
  if (step === 'title' && /^Arrow(Up|Down|Left|Right)$/.test(e.code)) { e.preventDefault(); moveFocus(e.code === 'ArrowDown' || e.code === 'ArrowRight' ? 1 : -1); } }
export function moveFocus(d, box = $('step-' + step)) { const list = [...box.querySelectorAll('button:not([disabled]), input')].filter(b => b.offsetParent);
  const i = list.indexOf(document.activeElement); (list[i < 0 ? 0 : (i + d + list.length) % list.length])?.focus(); }
// a pad inside a box of controls (How to play, Settings, the pause screen): A presses the focused button or ticks the focused box,
// the d-pad moves up and down, and left and right slide a focused slider (or move, elsewhere)
export function padIn(box, p) { const f = box.contains(document.activeElement) ? document.activeElement : null;
  if (p.jump || p.pause) { if (f?.tagName === 'BUTTON' || f?.type === 'checkbox') f.click(); return; }
  if ((p.left || p.right) && f?.type === 'range') { p.right ? f.stepUp() : f.stepDown(); f.dispatchEvent(new Event('input', { bubbles: true })); return; }
  if (p.up || p.down || p.left || p.right) moveFocus(p.down || p.right ? 1 : -1, box); }
// the world-name box (main.js) hands these back to the menu: Esc leaves it for the chosen game night, Up and Down move on
export function leaveSeedBox(e) { e.preventDefault(); if (e.code === 'Escape') { e.stopPropagation(); ($('nights').querySelector('.on') || $('setup-next')).focus(); } }
// a pad: A presses the focused button (or goes on), B goes back, the d-pad moves
export function menuPad() { const p = readPad(); if (!p) return; const dlg = openDialog();
  // How to play or Settings open: B closes it, A presses the focused button (Close among them), the d-pad moves
  if (dlg) { if (p.use) dlg.close(); else padIn(dlg, p); return; }
  if (p.use) return back();
  if (p.jump || p.pause) { const f = document.activeElement; if (f?.tagName === 'BUTTON' && $('step-' + step).contains(f) && !f.closest('.card')) { f.click(); if (f.closest('.night:not(.own)')) next(); } else next(); return; }
  if (step === 'chars') { if (p.left) selectCard((sel + CHARS.length - 1) % CHARS.length); if (p.right) selectCard((sel + 1) % CHARS.length); }
  else if (p.up || p.down) moveFocus(p.down ? 1 : -1); }
