# Round 3: scale, megaforms that become ground, nested levels

Scale-focused mock-ups for the broader Stratum megastructure track, made on 2026-09-30. The page is `index.html` in this folder: self-contained, with WebP images. The brief is the "Think bigger" addendum in `notes/2026-09-30-megastructure-and-multiscale.md`, read with `notes/multiscale-simulation.md` (nested levels, lift/restrict).

The user corrected two things mid-round, and both are applied:
- **No landscape mimicry.** The mountain-range massif, the caldera, the forested ridge and the river-valley conduit were dropped. Their replacements read as architecture at every scale. Landscape quality comes only from size: haze, and small buildings settling on vast surfaces.
- **No tetrapod theme.** Unusual cast concrete appears across the set instead: faceted buttresses and brackets, splayed cast feet, haunched frame nodes, and one colossal tetrapod as a cast node.

## Rebuild

```sh
cd stratum/concepts/aesthetics/scale/gen
python3 g_powers.py && python3 g_mega2.py && python3 g_pixel_scale.py
cd ../..
B=/Applications/Blender.app/Contents/MacOS/Blender
for j in powers mega2 legibility pixel_scale; do
  "$B" --background --factory-startup --python kitc.py -- --jobs scale/jobs/$j.json
done
python3 scale/post_powers.py
python3 scale/post_pixel.py
python3 scale/build_page.py
```

- **Run time:** about 2.5 minutes of renders on the M1 Max, plus about 1 minute to encode the page.
- **Scene size:** scenes span 10 m to 1000 km and stay at 2–400 k real vertices plus up to about 1,500 instances each.

## What was added to the kit

| Addition | What it does |
|---|---|
| `kitscale.py` | Instancing via geometry nodes. A `scatter` part registers points and a prototype key. `run_job_x` builds each prototype once through the normal kit builders, hides it, and places it with an Instance on Points modifier driven by per-point rotation and scale attributes. Prototypes are declared once in `meta.protos`. It also adds per-job clip distances and the scale materials and light presets. |
| Level of detail | One focal area gets detailed prototypes (`town_hi`, 600 verts). Rings further out use `town_lo` (112 verts) and `lowcity` tiles, and continental distances use `city` tiles. The Powers of Ten world is about 63 k real vertices plus 1,434 instances from 10 m to 1000 km. |
| `mega_step` | Megaform material. Risers carry ordinary-scale procedural windows (the habitation inside the mass). Up-facing faces become paved terraces with restrained planting, chosen by surface normal. |
| `mega_far` | The same look painted onto smooth far-LOD geometry: terraces become bands in z, so swapping LODs keeps the read. This is the art contract restrict(lift(x)) ≈ x in material form. |
| `grid_white` | A Superstudio grid material. |
| Clouds and fog bands | Cloud layers (flat-bottomed faceted clusters, with an exclusion zone around the camera's line of sight), and stratified fog bands (`fog.bands`). |
| `parts_scale.py` | `scatter`, `megasweep` (a profile along a path), `megaprism`, `clouds`, `town`, `citytile`, `forestpatch`, `cwedge` (faceted cast buttress or bracket), `umbrella`, `caldera` (unused after the correction, kept). |
| Kit fixes | `MatFactoryX` now uses `super()`; the old call recursed. The cable tree, pipe rack and conveyor take sampling steps, so they can run at km scale. |

## The renders

### Powers of Ten (`gen/g_powers.py`, `post_powers.py`)

- **Setup:** one location, fixed camera (azimuth 0, elevation 38°, orthographic), frame widths 10 m to 1000 km.
- **What changes between frames:** what reads as ground at one frame turns out to be structure at the next, and every frame is inhabited.
- **Overlays:** each frame has a scale bar and the outline of the previous frame.

| Frame | What it shows |
|---|---|
| 10 m | A roof terrace. |
| 100 m | The town sits on a terrace; the wall below it is full of windows. |
| 1 km | The terrace is one step of the Rib's cast face. |
| 10 km | The Rib: a stepped concrete mass 1.7 km high and 6 km across, rising out of ordinary city. |
| 100 km | One of 48 ribs, with ordinary cities between them. |
| 1000 km | The ribs are spokes of the Hub. |

The focus sits at the world origin so float precision holds where the detail is. The 1000 km scene uses coordinates up to about 1e6 m.

### Megaforms (`gen/g_mega2.py`)

Every megaform stands in ordinary low-rise city fabric (600 m tiles of streets and 3–8 storey blocks), which is the scale reference.

| | Megaform | Ratio | Renders |
|---|---|---|---|
| (a) | **Stepped cast mass:** 6.6 × 4.6 km, 12 steps of 110 m, split by a 700 m canyon street with bridges. Neighbourhoods on every terrace, faceted buttresses on the lower risers, a colossal tetrapod at the canyon mouth. | ~100× the towns on it | `a1`, `a2` |
| (b) | **Open void between two megaframes:** 1.8 km tall, 180 m bays, haunched chamfered members. Ordinary buildings are slotted into about 60 % of the bays; bridges cross the 1.2 km void; a city lies on its floor. | a bay is ~10× a building, a frame ~100× | `b1` (perspective from the floor), `b2` |
| (c) | **Continuous monument** after Superstudio: a 1 km × 560 m gridded bar crossing 90 km of terrain, towns on its roof, ordinary city in its lee. | ~100–1000× | `c1`, `c2` |
| (d) | **Interior void:** 7 × 4.6 × 2.6 km, inhabited walls, shelves carrying towns, cast brackets, a city floor, haze bands and a cloud layer inside, light wells. | | `d1`, `d2` |
| (e) | **Inclined slab:** 5.4 km rising 2.4 km at exactly 2:1 in building-grid terms (320 m run : 140 m rise = 2 cells : 1 level), on flared cast piers, with a neighbourhood on each of 17 terraces over the city. A solarpunk variant in white and timber carries solar canopies and groves. | | `e1`, `e2`, `e3` |
| (h) | **Infrastructure spine:** 32 km, four decks 860 m wide carrying highways, a freight conveyor, pipe bundles and a cable trunk. Towns are built into decks 2 and 4, building stacks sit on deck 3, and frames every 400 m stand on splayed cast tripod feet over the city. | | `h1`, `h2` (street level looking up), `h3` |

### Scale legibility (`legibility` jobs)

The same stepped mass from the same camera, with one cue added at a time:

| Render | Cue | Verdict |
|---|---|---|
| `l1` | Bare massing | **Fails.** It reads as a table-top model; nothing says kilometres. |
| `l2` | Ordinary buildings: towns on the terraces, city at the base | **Strongest cue in isometric.** Familiar building sizes carry the scale, and they are what the game will always have on screen. |
| `l3` | Aerial perspective (depth fog) | **Helps, but washes out quickly.** It fights the crisp stylised look. Use lightly, cool-tinted, only at far tiers. |
| `l4` | Stratified haze band plus a cloud layer at mid-height | **Very strong and cheap.** A cloud deck cutting the mass at 560 m says "this thing is taller than weather" at once. Keep the clouds sparse: dense clouds hide the form. |
| `l5` | Night light patterns | **Strong.** Lit windows on the risers show the mass is inhabited through its whole height, and the city grid glows around it. |
| `l6` | Ground-level perspective looking up | **The most convincing view.** It's not a game camera, but good for an "enter"/photo mode and for cinematics. |

Also useful: long cast shadows falling across the city (`b1`, `h1`); repeated ordinary-scale modules (window grids, floor bands) on the megaform; and haze between layers in voids (`b1`, `d1`).

### Pixel art at nested scales (`gen/g_pixel_scale.py`, `post_pixel.py`)

These are aliased renders at a fixed pixels-per-metre and the 2:1 camera, locked to the 72-colour Stratum palette from round 2.

- **`nested_stepped`:** the same stepped mass three ways:
  - 16 px per 256 m cell: the megaform is one landscape-scale sprite;
  - 16 px per 16 m: its terraces read as districts;
  - 16 px per 4 m: one terrace is the ground, with a town, the inhabited riser behind, and the drop in front.
- **`nested_void`:** the frames at 16 px per 64 m, then one bay at 16 px per 4 m with buildings slotted in.
- **Lesson:** at the coarsest tier, raw geometry aliases into noise (the city fabric speckles). Far tiers need their own sprites: coarse-grained by mode from the finer tier (as `rg.py` does), or the painted `mega_far` look.

## How this could work in the game

### 1. Megaforms are terrain for the next tier down

A megaform is authored like any kit spec, but at a coarser tier, and it **declares surfaces as slots**:

| Slot | What it is | Examples |
|---|---|---|
| `terrace` / `roof` | A horizontal buildable plane: local frame, extent on the finer grid, clearance, load, access points (ramps, lifts, bridges). | the stepped mass's steps, the slab's terraces, the monument's roof, spine decks |
| `bay` | A cavity volume inside a frame, with a floor plate and a clearance height. | megaframe bays, spine deck 3 |
| `ledge` / `shelf` | A narrow horizontal strip against a wall, with an edge condition (a drop). | interior-void shelves |
| `wall` | A vertical face that accepts hung or attached units. | cliff dwellings, hung stacks |
| `shaft` / `void` | Volumes that stay open, with docking points. | the canyon, the frame void, light wells |
| `lane` | Reserved strips on infrastructure decks, which the finer tier must not build over. | spine decks |

**At the finer tier, a slot is ground:**
- the terrace plane becomes the tile layer;
- the riser behind becomes a boundary wall, whose windows are the megaform's own interior (a lot type of its own);
- the edge in front becomes a cliff edge tile. SC2K's edge and slope tiles are the precedent.

This matches what the pixel panels show.

### 2. Grid ratios between tiers

Use the simulation's nesting: **4× per side per tier.**

| Tier | Cell |
|---|---|
| Tile | 4 m |
| Lot | 16 m |
| Block | 64 m |
| Superblock | 256 m |
| Region | 1024 m |

- **Tier geometry:** megaform geometry lives on its tier's grid, with "mega-levels" that are integer multiples of the building level. For example 32 levels = 112 m, and the renders use 110–150 m risers.
- **Slopes:** round 2's rational slopes apply unchanged at every tier. The slab's 320 m : 140 m is exactly 2 cells : 1 level at the building grid, so a tier-3 slope and a tier-0 slope draw the same pixel line family.
- **Slots:** slot extents snap to whole cells of the child tier. A 256 m terrace is 64 tiles deep.

### 3. Art LODs and the continuous-zoom swap

- **Native density.** Each tier has sprites at the same 16 px per cell, so zooming out by 4× lands exactly on the next tier's native density.
- **The swap.** Within a tier, zoom scales the sprites. Past about 2× below native, cross-fade to the parent tier's sprites.
- **Consistency.** The invariant is the art contract from `multiscale-simulation.md` §2.12: the parent sprite is the coarse-graining (mode) of its children's sprites, or is generated and then projected to consistency.
- **Worked example.** `mega_step` → `mega_far` in these renders is the same move in 3D: the far LOD paints the terraces the near LOD actually has.
- **What the far tier needs.** The pixel panel shows raw far geometry aliasing, so the far tier needs its own sprites. They are also cheaper: a region sprite is one image per megaform, not thousands of towns.

### 4. Mapping onto lift/restrict

A megaform is a structure owned by a superblock or region cell.

| Operation | What it does |
|---|---|
| **Macrostate** | Interior population and jobs per mega-level (the vertical profile), plus per-slot totals, style histograms and flows through its portals (bridges, lifts, spine lanes). |
| **Lift** | Instantiate the towns, bay fills and hung units in the slots near the camera, seeded by `hash(world, tier, cell, slot, gen)` and fitted to the slot totals. The megaform's own interior lifts only for a cut-plane view. |
| **Restrict** | Sum the slots back into the megaform's profile, and roll the megaform into its region cell. |
| **Relaxation** | Distant slots relax to a coarser tier, and the far LOD shows them as texture. The Powers of Ten frames are exactly the tiers that would be live at each zoom. |
| **Nesting** | A megaform inside a megaform, such as a town on a terrace of a mass inside a hub's rib, is just more tiers. The invariants are the same, and a slot's genome lives on the parent's lot. |

### 5. UI for moving between scales

- **Scale bar with tier names** (tile, lot, block, superblock, region, world), shown as in the Powers of Ten frames: the current tier is highlighted and zoom snaps softly at tier boundaries.
- **Enter a megaform.** Clicking a megaform at a coarse tier zooms into it. The view re-anchors to the slot's local grid and the chosen surface becomes the ground; the parent recedes into haze and context. Breadcrumbs show the path back, for example World › Hub › Rib 12 › Terrace 5 › Town. Leaving pops back up.
- **Tier-appropriate tools:**
  - region: place megaforms and trunk infrastructure;
  - superblock and block: declare slots, zone, route lanes;
  - lot and tile: build.

  The agent works at any tier. "Put a neighbourhood on terrace 5" is a slot-level request.
- **Cut plane and levels** from the layer prototype apply inside the entered megaform, over its strata.
- **Legibility helpers** from the study:
  - a cloud deck toggle at mid-height;
  - night mode to read habitation;
  - a street-level peek (photo mode) to feel the size.

## Known issues / next steps

- **Cost of far LODs.** The Powers of Ten world's far LODs are still geometry (painted ribs, city tiles). A real build would use tier sprites.
- **Instancing and view modes.** Instancing skips the kit's section/crop machinery: instances aren't bisected. Cutaways of instanced scenes need prototypes realised first, or cut planes in the prototype's own frame.
- **Night lighting.** Prototype lights are only copied for the first N instances (`inst_lights`), so large night scenes rely on window emission.
- **Clouds in the line of sight.** At low elevations the kit's orthographic camera sits far back, so a cloud layer can block the view entirely. Cloud exclusion zones around the line of sight fix this.
