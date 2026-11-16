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
import { addCollider, nearColliders } from './props.js';
import { campTent } from './camp.js';
import { rockMat } from './propmodels.js';
import { mulberry32 } from './noise.js';
import { CAMP, SAFE_R, SEED_TEXT, WATER_Y } from './config.js';

// the relic of each kind of cave: its name and its glow
const LOOK = {
  ice: ['the Ice Heart', 0x9ad8ff],
  fungal: ['the Glow Heart', 0x7dffb0],
  mine: ['the Ember Heart', 0xffa050],
  crystal: ['the Glass Heart', 0xd09aff],
  roots: ['the Root Heart', 0xd8f070],
};
// and its shape, so no relic and no socket is told apart by colour alone (Jared is colourblind; colour never carries meaning by itself):
// the Ice Heart a long shard, the Glow Heart a mushroom's cap, the Ember Heart a block of ore, the Glass Heart a six-sided crystal, the
// Root Heart a knot; each socket on the altar shows its relic's shape, small, over its cup
const SHAPE = {
  ice: (s) => new THREE.OctahedronGeometry(s, 0).scale(1, 1.6, 1),
  fungal: (s) => new THREE.SphereGeometry(s * 1.1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2),
  mine: (s) => new THREE.BoxGeometry(s * 1.3, s * 1.3, s * 1.3),
  crystal: (s) => new THREE.CylinderGeometry(s * 0.6, s * 0.6, s * 2.2, 6),
  roots: (s) => new THREE.TorusKnotGeometry(s * 0.6, s * 0.2, 40, 6),
};
const shapeOf = (k, s) => (SHAPE[k] || SHAPE.ice)(s);
// TAKE: seconds Interact is held to take one; NEAR: how close to it; ALTAR_R: how close to the altar's middle sets it down;
// HUNT: seconds between the packs sent at a carrier out in the open, by difficulty (the first comes after half the shorter wait)
const TAKE = 1.5,
  NEAR = 2.2,
  ALTAR_R = 4.8,
  HUNT = { easy: null, normal: [40, 60], hard: [18, 28] },
  AT = ['plinth', 'held', 'ground', 'altar'];
export const relics = [],
  altar = { x: CAMP.x - 4.8, z: CAMP.z - 3.4, y: 0, sockets: [], marks: [] };
let G = null,
  scene = null,
  holdT = 0,
  won = false,
  plate = null,
  plateT = 0,
  t = 0;
export const stats = { hunts: 0 }; // (for the checks)

// built with the world: a relic on each relic cave's plinth, and the altar by the camp (five stone posts round a dais)
export function buildRelics(sc) {
  scene = sc;
  relics.length = 0;
  const glow = haloTex();
  for (const c of caves.filter((q) => q.relic)) {
    const [name, color] = LOOK[c.kind] || ['the relic', 0xffe2a0],
      m = new THREE.Group();
    const gem = new THREE.Mesh(
      shapeOf(c.kind, 0.3),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.6,
        roughness: 0.2,
        metalness: 0.1,
      }),
    );
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow,
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.scale.setScalar(2.2);
    m.add(gem, halo);
    m.userData.gem = gem;
    m.userData.halo = halo;
    relics.push({ i: relics.length, c, name, color, m, at: 'plinth', by: null, x: 0, y: 0, z: 0, huntT: null });
  }
  // the altar (Jared, November 16, 2026: "bigger", "old and run down", in the green zone but not right by the tent): a ruin of worn,
  // chipped stone with moss and lichen on it, cracks, flagstones gone astray and a fallen post, on clear flat ground 22 to 30 m from the tent
  const A = placeAltar();
  altar.x = A.x;
  altar.z = A.z;
  altar.y = groundY(altar.x, altar.z) - 0.08;
  const g = new THREE.Group();
  g.name = 'altar';
  g.position.set(altar.x, altar.y, altar.z);
  g.rotation.y = A.a;
  scene.add(g);
  const stone = rockMat('rock').clone(); // (a copy: the world's own rocks keep their colour)
  stone.color.setHex(0xeef1f4); // (Jared, November 16, 2026: "Yes, grey stone"; the rock look alone came out brown, like stumps)
  const dark = stone.clone();
  dark.color.multiplyScalar(0.62);
  const moss = new THREE.MeshStandardMaterial({ color: 0x46592c, roughness: 1, flatShading: true }),
    lichen = new THREE.MeshStandardMaterial({ color: 0x8f8f5c, roughness: 1, flatShading: true }),
    crack = new THREE.MeshBasicMaterial({ color: 0x1a1814 });
  const add = (geo, mat, x, y, z, ry = 0, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };
  add(worn(new THREE.CylinderGeometry(3.1, 3.35, 0.45, 11, 1), 0.24, 1), dark, 0, 0.12, 0);
  add(worn(new THREE.CylinderGeometry(2.45, 2.7, 0.5, 10, 1), 0.2, 2), stone, 0, 0.55, 0); // (two worn steps)
  for (const [x, z, l, r] of [
    [0.4, 0.5, 2.3, 0.6],
    [-1.2, -0.6, 1.4, 2.1],
    [2.75, -0.9, 0.9, 1.2],
  ])
    add(new THREE.BoxGeometry(l, 0.04, 0.06), crack, x, x > 2.5 ? 0.35 : 0.81, z, r); // (cracks across the steps)
  for (let k = 0; k < 7; k++) {
    const t = k * 0.9 + 0.3,
      d = 3.7 + (k % 3) * 0.45;
    add(
      worn(new THREE.BoxGeometry(1.1 - (k % 2) * 0.3, 0.18, 0.8), 0.14, 10 + k),
      k % 2 ? stone : dark,
      Math.cos(t) * d,
      0.04,
      Math.sin(t) * d,
      t + k,
      0,
      ((k % 3) - 1) * 0.07,
    );
  } // (flagstones, gone astray)
  for (let k = 0; k < 7; k++) {
    const t = k * 1.13 + 0.5,
      d = 1.2 + (k % 3) * 0.55;
    add(
      worn(new THREE.SphereGeometry(0.38 + (k % 3) * 0.14, 7, 4), 0.14, 20 + k).scale(1, 0.22, 1),
      k % 3 ? moss : lichen,
      Math.cos(t) * d,
      0.8,
      Math.sin(t) * d,
    );
  } // (moss and lichen in patches)
  add(worn(new THREE.CylinderGeometry(0.27, 0.33, 1.2, 7, 2), 0.1, 50), stone, 3.9, 0.27, 1.4, 0.4, 0, Math.PI / 2);
  add(worn(new THREE.BoxGeometry(0.7, 0.45, 0.6), 0.16, 51), dark, 4.5, 0.18, 0.4, 0.9); // (a fallen post, and a block broken off it)
  altar.sockets = relics.map((r, k) => {
    const t = (k / Math.max(5, relics.length)) * Math.PI * 2,
      x = Math.cos(t) * 1.75,
      z = Math.sin(t) * 1.75,
      h = 1.5 - (k % 3) * 0.14,
      top = 0.8 + h;
    add(
      worn(new THREE.CylinderGeometry(0.25, 0.34, h, 7, 3), 0.09, 30 + k),
      stone,
      x,
      0.8 + h / 2,
      z,
      t,
      (k % 2 ? 1 : -1) * 0.035,
    ); // (a worn post, leaning a little)
    add(
      worn(new THREE.SphereGeometry(0.34, 6, 3), 0.1, 40 + k).scale(1.1, 0.4, 1.1),
      k % 2 ? moss : lichen,
      x,
      0.84,
      z,
    ); // (moss at its foot)
    const cup = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.06, 5, 14).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: r.color, emissive: r.color, emissiveIntensity: 0.2, roughness: 0.8 }),
    );
    cup.position.set(x, top + 0.03, z);
    g.add(cup);
    const mark = new THREE.Mesh(
      shapeOf(r.c.kind, 0.33),
      new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.9, flatShading: true }),
    );
    mark.position.set(x, top + 0.42, z);
    g.add(mark); // (pale stone, the relic's own shape, a little bigger: its shape, not its colour, says whose)
    altar.marks[k] = mark;
    const w = new THREE.Vector3(x, top + 0.45, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), A.a);
    return { x: altar.x + w.x, y: altar.y + w.y, z: altar.z + w.z };
  });
  addCollider(altar.x, altar.z, 3.1, null);
  for (const r of relics) home(r);
}

// a new game: every relic back on its plinth (a joined game then takes the host's word for where each is: coop.js's welcome)
export function startRelics(g) {
  G = g;
  holdT = 0;
  won = false;
  plateT = 0;
  if (plate) plate.classList.add('hidden');
  for (const r of relics) {
    r.at = 'plinth';
    r.by = null;
    r.huntT = null;
    home(r);
  }
}

// where each relic is: on its plinth, over its carrier, on the ground, or in its socket on the altar
function home(r) {
  if (r.at === 'plinth') {
    const L = r.c.L;
    Object.assign(r, { x: L.hall.x, z: L.hall.z, y: floorOf(L, L.hall.x, L.hall.z) + 1.75 });
  }
  if (r.at === 'altar') Object.assign(r, altar.sockets[r.i]);
  if (altar.marks[r.i]) altar.marks[r.i].visible = r.at !== 'altar'; // (the relic itself shows there once set)
  const set = r.at === 'altar';
  r.m.userData.halo.scale.setScalar(set ? 1.1 : 2.2);
  r.m.userData.gem.material.emissiveIntensity = set ? 0.7 : 1.6; // (set, it glows low: the altar's stone still shows round it)
  const parent = r.at === 'plinth' ? r.c.g : r.at === 'ground' && caveAt(r.x, r.z) ? caveAt(r.x, r.z).g : scene; // (in a cave: shown and hidden with it)
  if (parent && r.m.parent !== parent) parent.add(r.m);
  r.m.position.set(r.x, r.y, r.z);
}
// where the altar stands: the flattest clear ground 22 to 30 m from the tent, away from it first, inside the safe valley and out of water
function placeAltar() {
  const away = Math.atan2(campTent.z - CAMP.z, campTent.x - CAMP.x);
  let best = null;
  for (const d of [24, 27, 30, 22])
    for (let k = 0; k < 24; k++) {
      const a = away + ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI) / 12,
        x = campTent.x + Math.cos(a) * d,
        z = campTent.z + Math.sin(a) * d;
      if (Math.hypot(x, z) > SAFE_R - 25 || groundY(x, z) < WATER_Y + 1) continue;
      const near = nearColliders(x, z).filter((c) => Math.hypot(c.x - x, c.z - z) < c.r + 6).length;
      let tilt = 0;
      for (let q = 0; q < 8; q++)
        tilt = Math.max(
          tilt,
          Math.abs(groundY(x + Math.cos(q * 0.785) * 4, z + Math.sin(q * 0.785) * 4) - groundY(x, z)),
        );
      const s = tilt * 10 + near * 100 + Math.ceil(k / 2) * 0.1 + Math.abs(d - 24) * 0.05;
      if (!best || s < best.s) best = { x, z, s, a: Math.atan2(CAMP.x - x, CAMP.z - z) };
    }
  return best || { x: CAMP.x - 4.8, z: CAMP.z - 3.4, a: 0 };
} // (none clear: by the fire, as before)
// weathered: every corner of a stone shape knocked a little out of true (the same corner moved alike on every face, so it stays whole),
// each corner its own shade of worn stone, and some of the upward ones gone green with moss (the rock look takes its colours by the corner)
function worn(geo, amt, seed) {
  const p = geo.attributes.position,
    R = mulberry32(seed * 7919 + 13),
    at = new Map(),
    col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
    if (!at.has(k)) {
      const v = 0.55 + R() * 0.35,
        m = p.getY(i) > 0 && R() < 0.3;
      at.set(k, [
        (R() - 0.5) * amt,
        (R() - 0.5) * amt * 0.6,
        (R() - 0.5) * amt,
        m ? [v * 0.62, v * 0.8, v * 0.45] : [v * 1.08, v * 1.12, v * 1.16],
      ]);
    }
    const [a, b, c, rgb] = at.get(k);
    p.setXYZ(i, p.getX(i) + a, p.getY(i) + b, p.getZ(i) + c);
    col.set(rgb, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}
const me = () => G.net.id;
const holder = (by) => (by === me() ? (G.running() ? G.player : null) : G.others.get(by) || null);
const who = (by) => (by === me() ? 'You' : G.others.get(by)?.name || 'Someone');
const left = () => relics.filter((r) => r.at !== 'altar').length;

// the prompt line by a relic, and what a carrier is told while carrying (game.js asks)
export const relicNear = (P) =>
  relics.find(
    (r) =>
      (r.at === 'plinth' || r.at === 'ground') &&
      Math.hypot(r.x - P.x, r.z - P.z) < NEAR &&
      Math.abs(r.y - 1.4 - P.y) < 2.6,
  ) || null;
export function relicPrompt(P, E) {
  const r = relicNear(P);
  return r && !relics.some((q) => q.by === me())
    ? holdT > 0
      ? `Hold ${E} · taking ${r.name}`
      : `Hold ${E} · take ${r.name}`
    : null;
}
export function carryPrompt(P) {
  const c = relics.find((q) => q.by === me());
  if (!c) return null;
  const d = Math.round(Math.hypot(altar.x - P.x, altar.z - P.z) / 10) * 10;
  return `Carrying ${c.name} · take it to the altar by the camp${d > 10 ? ` (${d} m)` : ''}; creatures can sense it`;
}

// the host's game (or a game alone) decides; a joined game asks (coop.js passes 'relic-take' on)
export function takeRelic(i, by) {
  const r = relics[i];
  if (G.joining() || !r || (r.at !== 'plinth' && r.at !== 'ground') || relics.some((q) => q.by === by)) return;
  const was = { ...r };
  r.at = 'held';
  r.by = by;
  r.huntT = null;
  changed(r, was);
}
function changed(r, was) {
  home(r);
  note(r, was);
  if (!G.joining()) G.send('all', { t: 'relics', s: state() });
  if (!left() && !won) win();
}
export const state = () =>
  relics.map((r) => [AT.indexOf(r.at), r.by || 0, +r.x.toFixed(2), +r.y.toFixed(2), +r.z.toFixed(2)]);
// the host's word (its 'relics' message, or the welcome of a joined game)
export function applyRelics(s) {
  if (!Array.isArray(s)) return;
  s.forEach(([a, by, x, y, z], i) => {
    const r = relics[i];
    if (!r) return;
    const was = { ...r };
    Object.assign(r, { at: AT[a] || 'plinth', by: by || null, x, y, z });
    if (was.at !== r.at || was.by !== r.by) changed(r, was);
    else home(r);
  });
}

// what everyone is told when a relic changes hands
function note(r, was) {
  const n = relics.length - left(),
    name = r.name.replace(/^the /, 'The ');
  if (r.at === 'held' && was.at !== 'held') {
    G.log(
      r.by === me()
        ? `You take ${r.name}. It glows: carry it to the altar by the camp, and watch out, creatures can sense it.`
        : `${who(r.by)} takes ${r.name}.`,
    );
    G.logEvent('relic-take', { kind: r.c.kind, who: r.by === me() ? 'me' : 'friend' });
    G.sfx('dawn');
  } else if (r.at === 'ground' && was.at === 'held') {
    G.log(`${name} falls where ${was.by === me() ? 'you' : who(was.by)} fell. Anyone can take it up again.`);
    G.logEvent('relic-drop', { kind: r.c.kind });
  } else if (r.at === 'altar') {
    G.log(`${name} rests on the altar: ${n} of ${relics.length}.`);
    G.logEvent('relic-altar', { kind: r.c.kind, n });
    G.sfx('salvage');
  }
}

export function tickRelics(dt, holding) {
  if (!G || !relics.length) return;
  const P = G.player;
  t += dt;
  // taking one: Interact held beside it (letting go drains it back), one relic to a carrier
  const r0 = relicNear(P),
    busy = relics.some((q) => q.by === me());
  if (r0 && holding && !busy && !G.gone(P)) {
    if ((holdT += dt) >= TAKE) {
      holdT = 0;
      if (G.joining()) G.send('host', { t: 'relic-take', i: r0.i });
      else takeRelic(r0.i, me());
    }
  } else holdT = Math.max(0, holdT - dt * 2);
  if (!G.joining())
    for (const r of relics) {
      if (r.at !== 'held') continue;
      const q = holder(r.by);
      if (!q || G.gone(q)) {
        const was = { ...r };
        r.at = 'ground';
        r.by = null;
        r.y = (q ? q.y : r.y - 2.3) + 0.6;
        changed(r, was);
        continue;
      } // (a carrier down, out or gone: it falls where they were)
      if (Math.hypot(q.x - altar.x, q.z - altar.z) < ALTAR_R && Math.abs(q.y - altar.y) < 3) {
        const was = { ...r };
        r.at = 'altar';
        r.by = null;
        changed(r, was);
        continue;
      }
      // D3: hunted, by difficulty, while out in the open (not in the safe valley, not in a cave)
      const w = HUNT[G.level()];
      if (!w || Math.hypot(q.x, q.z) < SAFE_R || caveAt(q.x, q.z)) continue;
      if (r.huntT == null) r.huntT = w[0] / 2;
      if ((r.huntT -= dt) > 0) continue;
      if (G.hunt(q)) {
        stats.hunts++;
        r.huntT = w[0] + Math.random() * (w[1] - w[0]);
        G.logEvent('relic-hunt', { kind: r.c.kind, lvl: G.level() });
      } else r.huntT = 2;
    } // (nowhere to send one from: try again soon)
  // over its carrier's head, bobbing and turning
  for (const r of relics) {
    if (r.at === 'held') {
      const q = holder(r.by);
      if (q) {
        r.x = q.x;
        r.z = q.z;
        r.y = q.y + 2.3;
      }
    }
    r.m.position.set(r.x, r.y + Math.sin(t * 2 + r.i) * 0.08, r.z);
    r.m.userData.gem.rotation.y += dt * 1.2;
  }
  if (plateT > 0 && (plateT -= dt) <= 0) plate.classList.add('hidden');
}

// D2: the win. The plate across the top for a while, and the score kept on this computer (the last 50, newest last)
function win() {
  won = true;
  const P = G.player,
    secs = Math.max(1, Math.round((performance.now() - P.startT) / 1000)),
    lvl = G.level(),
    clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  let all = [];
  try {
    all = JSON.parse(localStorage.getItem('iw2.wins') || '[]');
    if (!Array.isArray(all)) all = [];
  } catch {
    /* storage blocked */
  }
  const prev = all.filter((w) => w.lvl === lvl).reduce((b, w) => Math.min(b, w.secs), Infinity),
    entry = {
      date: new Date().toISOString(),
      seed: SEED_TEXT,
      secs,
      kills: P.kills,
      lvl,
      mode: G.mode(),
      players: 1 + G.others.size,
    };
  all.push(entry);
  try {
    localStorage.setItem('iw2.wins', JSON.stringify(all.slice(-50)));
  } catch {
    /* fine: the plate still shows */
  }
  G.logEvent('win', entry);
  G.sfx('dawn');
  if (!plate) {
    plate = document.createElement('div');
    plate.id = 'win';
    plate.setAttribute('role', 'status');
    plate.append(document.createElement('h2'), document.createElement('p'));
    document.body.appendChild(plate);
  }
  plate.querySelector('h2').textContent = 'The relics are home';
  plate.querySelector('p').textContent =
    `All ${relics.length} rest on the altar after ${clock(secs)}, with ${P.kills} kill${P.kills === 1 ? '' : 's'}, on ${G.levelName()}.${prev < Infinity ? ` Your best on ${G.levelName()}: ${clock(Math.min(prev, secs))}.` : ''} The score is saved.`;
  plate.classList.remove('hidden');
  plateT = 14;
  G.log('All the relics are on the altar. You win! The score is saved.');
}

// a soft round glow for the halo (drawn once)
function haloTex() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const x = cv.getContext('2d'),
    gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.3)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}
