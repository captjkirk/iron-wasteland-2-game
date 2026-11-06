# Credits
Every third-party asset or library used by Iron Wasteland 2: what it is, where it came from, its license.

| What | Source | License |
|---|---|---|
| Three.js 0.170.0 (core, Sky, Water, BufferGeometryUtils addons) | https://cdn.jsdelivr.net/npm/three@0.170.0/ | MIT |
| Terrain layer "grass": Rocky Terrain 02, diffuse 1k + normal (GL) | https://polyhaven.com/a/rocky_terrain_02 | CC0 |
| Terrain layer "forest": Forest Leaves 04, diffuse 1k + normal (GL) | https://polyhaven.com/a/forest_leaves_04 | CC0 |
| Terrain layer "dirt": Dry Ground Rocks, diffuse 1k + normal (GL) | https://polyhaven.com/a/dry_ground_rocks | CC0 |
| Terrain layer "rock": Rock Face 03, diffuse 1k + normal (GL) | https://polyhaven.com/a/rock_face_03 | CC0 |
| Terrain layer "sand": Sand 01, diffuse 1k + normal (GL) | https://polyhaven.com/a/sand_01 | CC0 |
| Terrain layer "snow": Snow 02, diffuse 1k + normal (GL) | https://polyhaven.com/a/snow_02 | CC0 |
| Terrain layer "mud": Brown Mud 02, diffuse 1k + normal (GL) | https://polyhaven.com/a/brown_mud_02 | CC0 |
| Terrain layer "paving" (ruins streets): Mossy Cobblestone, diffuse 1k + normal (GL) | https://polyhaven.com/a/mossy_cobblestone | CC0 |
| Terrain layer "gravel" (river bars, scree, canyon washes): River Small Rocks, diffuse 1k + normal (GL) | https://polyhaven.com/a/river_small_rocks | CC0 |
| Terrain layer "moss" (Fungal Hollow floor, tinted violet in the shader): Mossy Rock, diffuse 1k + normal (GL) | https://polyhaven.com/a/mossy_rock | CC0 |
| Camp crates: Wooden Crate 01 and Wooden Crate 02 (mesh + diffuse/normal) | https://polyhaven.com/a/wooden_crate_01, https://polyhaven.com/a/wooden_crate_02 | CC0 |
| Camp lantern: Wooden Lantern 01 (mesh + diffuse/normal; its glass panes are left out, the glow is drawn in code) | https://polyhaven.com/a/wooden_lantern_01 | CC0 |
| Camp chopping stump and axe: Tree Stump 01, Wooden Axe (mesh + diffuse/normal) | https://polyhaven.com/a/tree_stump_01, https://polyhaven.com/a/wooden_axe | CC0 |
| Camp tent canvas, bedroll and sack: Rough Linen, diffuse + normal (GL), 512 px | https://polyhaven.com/a/rough_linen | CC0 |
| Building floors, doors, furniture and the Bog cabin's walls: Brown Planks 05, diffuse + normal (GL), 1k | https://polyhaven.com/a/brown_planks_05 | CC0 |
| House roofs: Clay Roof Tiles 02, diffuse + normal (GL), 1k | https://polyhaven.com/a/clay_roof_tiles_02 | CC0 |
| Plastered houses and the desert adobe: Clay Plaster, diffuse + normal (GL), 1k | https://polyhaven.com/a/clay_plaster | CC0 |
| The gas station's concrete: Brushed Concrete 03, diffuse + normal (GL), 1k | https://polyhaven.com/a/brushed_concrete_03 | CC0 |
| The ruined town's watchtower: Castle Brick 07, diffuse + normal (GL), 1k | https://polyhaven.com/a/castle_brick_07 | CC0 |
| Camp log seats: Bark Brown 01, diffuse + normal (GL), 512 px | https://polyhaven.com/a/bark_brown_01 | CC0 |
| ez-tree 1.1.0 (procedural tree generator, used at load for every tree and bush) | https://cdn.jsdelivr.net/npm/@dgreenheck/ez-tree@1.1.0/ (npm `@dgreenheck/ez-tree`, Daniel Greenheck) | MIT |
| Bark textures bundled in ez-tree: oak (Bark Brown 02), willow (Bark Willow 02) | https://polyhaven.com/a/bark_brown_02, https://polyhaven.com/a/bark_willow_02 | CC0 |
| Bark textures bundled in ez-tree: birch, pine | https://www.texturecan.com/details/221/, https://www.texturecan.com/details/588/ | CC0 |
| Leaf card textures bundled in ez-tree (ash, aspen, oak, pine) | https://github.com/dgreenheck/ez-tree (package `src/lib/assets/leaves/`) | MIT (part of the package) |
| Old tyre (mesh + diffuse/normal) | https://polyhaven.com/a/old_tyre | CC0 |
| Barrel 03 (mesh + diffuse/normal) | https://polyhaven.com/a/barrel_03 | CC0 |
| Barrel 01 (mesh + diffuse/normal) | https://polyhaven.com/a/Barrel_01 | CC0 |
| Rusty Painted Metal (car wreck body), diffuse + normal | https://polyhaven.com/a/rusty_painted_metal | CC0 |
| Rusty Corrugated Iron (scrap sheets), diffuse + normal | https://polyhaven.com/a/rusty_corrugated_iron | CC0 |
| Rustic Stone Wall (ruin walls), diffuse + normal | https://polyhaven.com/a/rustic_stone_wall | CC0 |
| Character outfits (Male/Female Ranger, Male/Female Peasant: rigged meshes + textures), Quaternius "Modular Character Outfits - Fantasy [Standard]" | https://quaternius.com (pack page; files taken from the CC0 mirror https://github.com/Mesh2Motion/mesh2motion-assets, `CC0-packs/Quaternius/Modular Character Outfits - Fantasy[Standard]`, which includes the pack's License_Standard.txt) | CC0 |
| Character heads (cut from Superhero Male/Female FullBody), hairstyles (Long, Buns, Simple Parted, Beard, Buzzed) and eyebrows, Quaternius "Universal Base Characters [Standard]" | https://quaternius.com/packs/universalbasecharacters.html (files from the copy in https://github.com/kirbycope/godot-3d-player-controller-v2, `assets/universal_base_characters/`, with License_Standard.txt) | CC0 |
| Character animations (27 clips: idle, walk, jog, sprint, sword, shield, pistol, spell, throw, hit, death, swim, jump), Quaternius "Universal Animation Library" 1 and 2 | https://quaternius.com (files from https://github.com/kirbycope/godot-3d-player-controller-v2, `assets/universal_animation_library*/`, with License.txt) | CC0 |

Texture files in `assets/terrain/` were re-encoded smaller (diffuse 1024 px JPEG q80, normals 512 px JPEG q85).
The water ripple normal map is generated in code (`src/environment.js`), not a downloaded file.

Prop meshes in `assets/props/*.json` were converted from the Poly Haven 1k glTF files by `scripts/convert_gltf.py`
(same geometry, stored as base64 arrays); their textures were re-encoded at 512 px (car body and wall diffuse 1024 px).
Rocks, cacti, ferns, reeds, flowers, grass blades, the car body shape and the wall blocks are generated in code; the
fern frond and flower textures are drawn in code on a canvas.

Character files in `assets/chars/` were converted by `scripts/convert_chars.py`: glTF re-packed as JSON with the buffer
embedded, only position/normal/uv/skin attributes kept, heads cut from the full bodies by skin weight (Head and neck
bones), animation channels that never change reduced to one key, textures re-encoded as JPEG (colour and normal 1024 px,
roughness/ORM and hair 512 px). Armour, helmet, shield, sword, revolver, hat, wrench, goggles, tool belt, bouquet, flower
crown, bow and quiver are built in code (`src/characters.js`); their scratched-metal and grain textures are drawn on a canvas.

## Creatures (slice 4)

| What | Source | License |
|---|---|---|
| Wolf and Fox (rigged meshes and 12 animation clips each: idle, walk, gallop, attack, hit reacts, death), Quaternius "Ultimate Animated Animals" (July 2021) | https://quaternius.com (pack page; files from the copy in https://github.com/francisb1996/brave-chicken-assets, `quaternius/ultimate_animated_animals_july_2021/`, which includes the pack's License.txt, copied to `assets/beasts/License_Quaternius_Animals.txt`) | CC0 |
| Street Rat (mesh + diffuse, normal and ARM textures) | https://polyhaven.com/a/street_rat (Sean Buckley) | CC0 |

`assets/beasts/*.json` were converted by `scripts/convert_animals.py` (same compact glTF-JSON format as the characters;
scale channels dropped; rat textures re-encoded at 512 px). The wolf mesh is also the bear (reshaped at load by bone
scale), the fox is the dust hound (recoloured, leaner). Fur, the ice crawler, the bog lurker, the loot models, hit
sparks and every sound are made in code (`src/creatures.js`, `src/effects.js`, `src/audio.js`, Web Audio synthesis, no
audio files); the scrap gear reuses the Poly Haven corrugated-iron texture listed above.

## Harvest and craft (slice 11)

No new files. The stump a felled tree leaves is built in code (Bark Brown 01's bark, listed above, round a sawn top whose rings are vertex colours).
The craftbench, bed and torch players build (`src/craftmodels.js`) are made in code from textures already listed: Brown
Planks 05 (bench, bed frame), Rough Linen (mattress, pillow, blanket, torch rags), Rusty Corrugated Iron (the vice),
and Bark Brown 01 (the camp's log seats) for the bench's logs and the torch's stake. The log loot model, the craft menu and the new sounds (axe, creak, crash, hammering,
an arrow striking) are made in code.

**Slice 12 (building): no new files.** The palisade wall, its posts, the gate, the spike trap and their rubble
(`src/buildmodels.js`) are built in code from Bark Brown 01 (the logs) and Brown Planks 05 (rails, the gate's boards),
listed above; the stone (reinforced) wall and its pillars use Rustic Stone Wall (listed above, the ruin walls); the iron
bands and hinges use Rusty Corrugated Iron. The thrown shield, the nail gun, nails, the fire arrows' embers and burst and
the charm aura are made in code.

**Slice 13a (installable, offline): one new file pair.** The app icon (`assets/icon-192.png`, `assets/icon-512.png`),
the camp ringed by mountains, is drawn in SVG for this game and rendered to PNG here: own work, CC0.

## The desktop app (slice 13b; shipped inside the Mac app only, never loaded by the web game)
| What | Source | License |
|---|---|---|
| Electron 44.9.3 (the app's window and runtime; Chromium and Node inside it carry their own notices in the app's `LICENSES.chromium.html`) | https://www.npmjs.com/package/electron | MIT |
| bonjour-service 1.4.4 (Bonjour: announcing and finding games on the home network) | https://www.npmjs.com/package/bonjour-service | MIT |
| multicast-dns 7, dns-packet 5, @leichtgewicht/ip-codec 2, thunky 1, fast-deep-equal 3 (bonjour-service's own parts) | https://www.npmjs.com/package/multicast-dns and the others by name | MIT |
| @electron/packager 20.3.0 (build tool only, not shipped) | https://www.npmjs.com/package/@electron/packager | BSD-2-Clause |
