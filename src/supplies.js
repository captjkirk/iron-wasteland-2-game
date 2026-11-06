// Supplies (slice 12, two rulings by the owner on 2026-11-04):
// Food: "its way to easy to stay alive while fighting a horde by grabbing the food while you fight. maybe we need to set it
// so that you cant 'eat' to heal while in combat, but you can pick up the food. and if you HAVE food in your inventory, you
// can eat to heal with a button hold but getting hit resets eating progress... or something like that. be ambitious!"
// So food picked up goes into the pack; hold G (d-pad down) to eat (1.8 s, slowed to a walk, a ring round the crosshair,
// the hand to the mouth); a hit stops it, and no one eats within 4 s of taking or dealing a blow. Raw food mends 10;
// cooked mends 30: hold E at a campfire (the camp's or one you built) to cook raw food, one piece every 2.2 s.
// Rounds and flowers: "yes, rounds and flowers should run out (similar to IW1)". The Gunslinger has an 8-round clip
// (12 with his bench upgrade) and a reserve, 40 rounds at most in all (IW1: 8 + 32 at the start); he reloads by himself
// when the clip runs dry, or with R (d-pad up); rounds come from raiders' drops (+3, and only a Gunslinger picks them up)
// and the Ammo Pack (+8). Lauren's charm flower takes a flower (3 at the start: IW1 started her at none, which leaves a
// new player with a secondary that never works; the Flower Bouquet gives +8, 24 at most).
// Each game owns its own counts (co-op: the host hands a pickup to the player it goes to, as slice 10's loot does).
import * as THREE from 'three';
import { player, log, upgraded } from './game.js';
import { campfire } from './camp.js';
import { fireSpots } from './craft.js';
import { raiderCamps } from './buildings.js';
import { sfx } from './audio.js';
import { floatText } from './effects.js';
import { logEvent } from './playlog.js';

export const EAT_T = 1.8, COOK_T = 2.2, FIGHT_T = 4, HEAL = { cooked: 30, food: 10 }, MAX_ROUNDS = 40, MAX_FLOWERS = 24;
export const ammo = { clip: 8, reserve: 32, flowers: 3 };
export const clipSize = () => upgraded('gunslinger') ? 12 : 8;
export function resetSupplies() { Object.assign(ammo, { clip: 8, reserve: 32, flowers: 3 }); Object.assign(player, { eat: null, cook: null, fightT: 0, reloadT: 0 }); }
const say = (k, s) => { if (!(player['hint' + k] > 0)) { player['hint' + k] = 3; log(s); } };
const at = (dy = 2) => new THREE.Vector3(player.x, player.y + dy, player.z);

// ── In a fight: a blow taken or dealt stops eating and keeps it from starting for 4 s ──
export function fought(hit) { player.fightT = FIGHT_T; if (hit && player.eat) { player.eat = null; log('Hit! You stop eating.'); sfx('chitin', null, 0.4); } }
// any fire cooks, a raider camp's too (the owner, 2026-11-05); only your own fires heal and keep the night off
export const fireNear = () => [campfire, ...fireSpots(), ...raiderCamps].find(f => Math.hypot(player.x - f.x, player.z - f.z) < 3.2);
export const foodCount = () => (player.inv.cooked || 0) + (player.inv.food || 0);

// every frame: eating (G held), cooking (E held at a fire: true then, so holding E chops nothing), reloading
export function tickSupplies(dt, eatHeld, useHeld) { const inv = player.inv; player.fightT = Math.max(0, (player.fightT || 0) - dt);
  for (const k of ['Eat', 'Out', 'Fl']) player['hint' + k] = (player['hint' + k] || 0) - dt;
  const able = !player.dead && !(player.down > 0) && !player.out;
  if (eatHeld && able && foodCount() && player.hp < player.maxHp) {
    if (player.fightT > 0) { player.eat = null; say('Eat', `In a fight: you can eat ${Math.ceil(player.fightT)} s after the last blow.`); }
    else { const e = player.eat ||= { t: 0, T: EAT_T, what: inv.cooked ? 'cooked' : 'food', bite: 0 }; e.t += dt;
      if ((e.bite -= dt) <= 0) { e.bite = 0.45; sfx('eat', null, 0.6); }
      if (e.t >= e.T) { inv[e.what]--; const h = Math.min(HEAL[e.what], player.maxHp - player.hp); player.hp += h; player.eat = null;
        floatText(at(), `+${h} HP`, '#8aff9a'); logEvent('eat', { what: e.what, healed: h }); log(`You eat the ${e.what === 'cooked' ? 'roast meat' : 'raw meat'}: +${h}.`); } } }
  else player.eat = null;
  const fire = able && !player.eat && inv.food > 0 && useHeld ? fireNear() : null;
  if (fire) { const c = player.cook ||= { t: 0, T: COOK_T }; c.t += dt; if (Math.random() < dt * 3) sfx('salvage', null, 0.15);
    if (c.t >= c.T) { inv.food--; inv.cooked = (inv.cooked || 0) + 1; player.cook = null; sfx('craft', null, 0.5); floatText(at(), '+1 cooked', '#ffb07a'); logEvent('cook', { food: inv.food, cooked: inv.cooked }); } }
  else player.cook = null;
  if (player.reloadT > 0 && (player.reloadT -= dt) <= 0) { const n = Math.min(clipSize() - ammo.clip, ammo.reserve); ammo.clip += n; ammo.reserve -= n; sfx('craft', null, 0.4); }
  return !!fire; }

// ── The Gunslinger's rounds ──
export function reload() { if (player.ch?.id !== 'gunslinger' || player.reloadT > 0 || ammo.clip >= clipSize() || !ammo.reserve) return false; player.reloadT = 1.3; sfx('salvage', null, 0.5); logEvent('reload', { ...ammo }); return true; }
// one round for a shot: false (a dry click, a reload if there is a reserve) when the clip is empty or he is reloading
export function useRound() { if (player.ch?.id !== 'gunslinger') return true; if (player.reloadT > 0) return false;
  if (ammo.clip > 0) { ammo.clip--; if (!ammo.clip) reload(); return true; }
  sfx('chitin', null, 0.5); if (!reload()) say('Out', 'Out of rounds: raiders drop them, or craft an Ammo Pack (Tab).'); return false; }
export function addRounds(n) { const room = MAX_ROUNDS - ammo.clip - ammo.reserve, k = Math.max(0, Math.min(n, room)); ammo.reserve += k; return k; }
// ── Lauren's flowers ──
export function useFlower() { if (player.ch?.id !== 'charmer') return true; if (ammo.flowers > 0) { ammo.flowers--; return true; }
  sfx('chitin', null, 0.5); say('Fl', 'No flowers left: craft a Flower Bouquet (Tab).'); return false; }
export const addFlowers = (n) => { const k = Math.max(0, Math.min(n, MAX_FLOWERS - ammo.flowers)); ammo.flowers += k; return k; };
