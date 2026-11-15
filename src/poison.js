// Widow poison (Jared's play on Dev, November 14, 2026: "spiders are AMZING. but too easy to kill. maybe poison bites?"; he chose
// tougher spiders and a poison bite for the widow only). A widow's bite keeps hurting after it lands (config.js ENEMY.spider_widow
// .poison: 2 health a second for 5 s at Normal, scaled by the difficulty as bites are); each bite adds its own dose; it wears
// off by itself. Each game runs it for its own player: a joined player bitten by the host's widow gets the host's 'hurt' message,
// which names the biter, so the poison runs on their own game. On screen: the word "Poisoned" with the seconds left, in a
// dashed box, and a slow pulse round the screen's edge (words and motion, not colour alone: Jared is colourblind; the pulse
// holds still under reduced motion).
import { ENEMY } from './config.js';
import { level } from './coop.js';

const doses = []; let acc = 0, label = null, edge = null;
export function poison(by) { const z = ENEMY[by]?.poison; if (z) doses.push({ dps: z.dps * level().bite, t: z.secs }); }
export function clearPoison() { doses.length = 0; acc = 0; show(0); }
// one frame of it: the whole health it takes this frame (the caller hurts the player by that)
export function tickPoison(dt) { let left = 0;
  for (let i = doses.length - 1; i >= 0; i--) { const d = doses[i]; acc += d.dps * Math.min(dt, d.t); d.t -= dt; if (d.t <= 0) doses.splice(i, 1); else left = Math.max(left, d.t); }
  show(left); const n = Math.floor(acc); acc -= n; return n; }
function show(secs) {
  if (!label) { if (!secs) return; const st = document.createElement('style');
    st.textContent = `#poison { position: fixed; top: 64px; left: 50%; transform: translateX(-50%); z-index: 20; pointer-events: none; font: 700 18px/1.2 system-ui, sans-serif;
        color: #f4ffd8; background: rgba(24, 32, 12, .82); border: 2px dashed #c8ec5a; border-radius: 8px; padding: 6px 14px; letter-spacing: .04em; }
      #poison-edge { position: fixed; inset: 0; pointer-events: none; z-index: 19; box-shadow: inset 0 0 70px 24px rgba(170, 225, 70, .5); animation: poisonPulse 1.1s ease-in-out infinite alternate; }
      @keyframes poisonPulse { from { opacity: .3 } to { opacity: 1 } }
      @media (prefers-reduced-motion: reduce) { #poison-edge { animation: none; opacity: .7 } }`;
    label = Object.assign(document.createElement('div'), { id: 'poison' }); edge = Object.assign(document.createElement('div'), { id: 'poison-edge' }); document.head.append(st); document.body.append(edge, label); }
  label.hidden = edge.hidden = !secs; if (secs) { const t = `☠ Poisoned · ${Math.ceil(secs)} s`; if (label.textContent !== t) label.textContent = t; } }
