// The craft menu's recipes (slice 11): IW1's sixteen (its src/recipes.js, the same order and the same costs) plus
// Abigail's arrows (the owner, 2026-11-03: arrows are limited, and can be picked back up or crafted). Data only:
// craft.js lists this table, charges `cost` (instant items and upgrades now, build items when they are placed in build
// mode: build.js) and greys out a row whose `later` is set (slice 12 cleared it on the walls, gate, trap and upgrades).
//   type    build (placed on the grid in build mode, paid on placement), instant (paid and used now), upgrade (each
//           character's one bench upgrade: game.js does what it gives)
//   bench   true: you must stand within BENCH_R of a craftbench
//   charId  only that character sees the row
//   later   listed, not craftable yet; the text says why
export const RES = ['wood', 'metal', 'fiber', 'food', 'cooked']; // (cooked: food roasted at a campfire, slice 12)
export const BENCH_R = 4;
export const RECIPES = [
  { label: 'Wall',                key: 'wall',               cost: { wood: 3 },                     bench: false, type: 'build',   tip: 'A timber palisade on the grid (200 HP). Walls join at the corners: close a ring and enemies must break in.' },
  { label: 'Gate',                key: 'gate',               cost: { wood: 4, metal: 2 },           bench: false, type: 'build',   tip: 'Players pass, enemies do not. E holds it open or shuts it, for everyone (200 HP).' },
  { label: 'Campfire',            key: 'campfire',           cost: { wood: 5 },                     bench: false, type: 'build',   tip: 'Slowly mends everyone who stands near it, and gives light.' },
  { label: 'Torch',               key: 'torch',              cost: { wood: 2, fiber: 1 },           bench: false, type: 'build',   tip: 'Lights a small patch of ground. Cheap: put them round your camp.' },
  { label: 'Spike Trap',          key: 'spike_trap',         cost: { wood: 2, metal: 1 },           bench: false, type: 'build',   tip: '35 damage to the first enemy that steps on it, then it is spent.' },
  { label: 'Craftbench',          key: 'craftbench',         cost: { wood: 5, metal: 3 },           bench: false, type: 'build',   tip: 'Stand by it to craft the bed, the med kit and the upgrades.' },
  { label: 'Bed',                 key: 'bed',                cost: { wood: 8, fiber: 6, metal: 2 }, bench: true,  type: 'build',   tip: 'Sleep in it (E) and you wake here when you fall, with half your health and half your things.' },
  { label: 'Reinforced Wall',     key: 'reinforced_wall',    cost: { wood: 4, metal: 3 },           bench: true,  type: 'build',   tip: 'Dressed stone: half again as strong as a timber wall (300 HP).' },
  { label: 'Med Kit (+40 HP)',    key: 'med_kit',            cost: { fiber: 3, food: 2 },           bench: true,  type: 'instant', tip: 'Mends 40 health now.' },
  { label: 'Ammo Pack (+8)',      key: 'ammo_pack',          cost: { metal: 2 },                    bench: false, type: 'instant', charId: 'gunslinger', tip: 'Eight rounds for the revolver\'s reserve (40 at most in all).' },
  { label: 'Arrows (+10)',        key: 'arrows',             cost: { wood: 1, fiber: 2 },           bench: false, type: 'instant', charId: 'ranger', tip: 'Ten arrows for the quiver. Spent arrows can be picked up where they stuck.' },
  { label: 'Knight Upgrade',      key: 'knight_upgrade',     cost: { metal: 3, fiber: 2 },          bench: true,  type: 'upgrade', charId: 'knight',     tip: 'Each swing throws the shield (it flies back), and blows from the front lose 60% on it.' },
  { label: 'Architect Upgrade',   key: 'architect_upgrade',  cost: { metal: 3, wood: 2 },           bench: true,  type: 'upgrade', charId: 'architect',  tip: 'A nail gun: each wrench swing also fires a nail.' },
  { label: 'Gunslinger Upgrade',  key: 'gunslinger_upgrade', cost: { metal: 2, fiber: 1 },          bench: true,  type: 'upgrade', charId: 'gunslinger', tip: 'A bigger clip: twelve rounds, not eight.' },
  { label: 'Flower Bouquet (+8)', key: 'flower_bouquet',     cost: { wood: 1, fiber: 1 },           bench: false, type: 'instant', charId: 'charmer',    tip: 'Eight flowers for the charm flower (24 at most).' },
  { label: 'Lauren Upgrade',      key: 'charmer_upgrade',    cost: { metal: 2, fiber: 2 },          bench: true,  type: 'upgrade', charId: 'charmer',    tip: 'A charm aura: animals that close in on her are charmed, and a charm flower charms all round where it lands.' },
  { label: 'Abigail Upgrade',     key: 'ranger_upgrade',     cost: { metal: 3, wood: 2 },           bench: true,  type: 'upgrade', charId: 'ranger',     tip: 'Fire arrows: an arrow that strikes an enemy bursts, hurting everything near it.' },
];
