# Megastructure aesthetics, round 2: notes

Concept mock-ups for the broader Stratum megastructure track (not the SC2K version), made on 2026-09-30. The page is `index.html`. It is self-contained (images are WebP data URIs), grouped by theme, and has captions.

The input was `notes/2026-09-30-megastructure-and-multiscale.md`, including two same-day addenda:

- **Large-scale diagonals** at grid-rational slopes.
- **Style: its own thing, not realism.**

Pixel art uses a Stratum palette built from the layer prototype (`experiments/megastructure-layers`), with one SC2K-palette panel for comparison only.

## Rebuild

```sh
cd stratum/concepts/aesthetics
./run_all.sh      # generators -> Blender renders -> sprites -> strips -> index.html
```

- **Requirements:** Blender 5.0 at `/Applications/Blender.app`, plus python3 with Pillow and numpy.
- **Run time:** about 5 minutes on the M1 Max. That covers about 70 EEVEE renders at 16–40 samples, each 0.3–5 s, while another GPU job was running. Writing the WebP page takes about 1 minute of that.
- **Read-only dependency:** the renderer imports `../../experiments/concept-renders/kit.py` and `sprites.py` read-only. Bytecode writing is disabled, and nothing is written into `concept-renders/`.

## Files

| File | What it is |
|---|---|
| `kitc.py` | Runner that imports the original `kit.py` and patches it in memory. It adds the bevel policy on `Part.box`, section caps chosen by material (earth vs structure), a richer material factory (procedural facade windows, moss, board lines, stripes, strata, terrain, fields), perspective cameras, spot and extra lights, new materials, light presets and styles, and a job runner with `drop_tags` / `keep_tags`. |
| `prims.py` | Geometry primitives: `outline` (sharp, chamfer, round or stepped corners), `cbox` (a box with independent vertical, top and bottom edge treatment and per-corner cuts), `hewn` (a cbox plus seeded or explicit plane cuts via bmesh), `loft`, `leg` (tapered n-gon prism with chamfered ends), `sweep` (a profile along a path with up or parallel-transport frames), `prism3`, and profiles (circle, chamfered rectangle, trough). |
| `paths.py` | Pure-Python paths: resample, fillet (elbows), Catmull-Rom, Bezier, helix, arc, frames, offsets, hex packing. Used by the generators and the builders. |
| `terrain.py` | Deterministic fbm heightfield with a river valley and flattened pads, shared by generators and builders. |
| `parts_concrete.py` | `cblock`, `bmass`, `bcol`, `bbeam`, `btower`, `tetrapod` (tetrapod, dolos or cube), `armour` (placed or dumped revetment), `tripod`, `strut`, `megaframe`, `diamond` (tetrapod lattice), `cpier`. |
| `parts_green.py` | `vines`, `roots`, `ivy`, `roofgarden`, `edgeplanter`, `bigtree`, plus the `canopy` and `weeping` tree species. |
| `parts_under.py` | `earth` (box voids), `borehole`, `lining` (a room finished in `ug_*` palette slots), `tunnel`, `walkway`, `pendant`, `cablespan`, `hangar` (ribs or vault, bridge cranes with loads), `tbm`, `robotarm`, `scaffold`, `fan`, `striplight`. |
| `parts_slope.py` | `earth2` (box, sheared and battered voids, decomposed into convex column pieces), `slopemass` (battered or stepped at `[run cells, rise levels]`), `incline` (inclined slab with units, plaza or road), `ibore` (inclined bore with escalators, funicular or empty shaft). |
| `parts_infra.py` | Path sweeps: `highway`, `conveyor`, `ptube`, `slide`, `cabletree`, `piperack`, and `hub`. |
| `parts_city.py` | `tower`, `superblock` (styles `dys` / `brut` / `solar`, detail 0–2), `terrain`, `forest`, `village`. |
| `gen/*.py` | Scene generators. They write `specs/*.json` (kit-of-parts JSON in metres, converted to the 4 m / 3.5 m grid) and `jobs/*.json`. |
| `pixel.py` | Palette lock (Stratum 72 or kit64, nearest colour in CIELAB, no dithering) and the pixel panels. |
| `post_city.py` | The Blade Runner strips and the zoom outlines, projected from the saved camera data. |
| `build_page.py` | Builds `index.html`. |
| `out/` | Every render. `out/stats_*.json` holds per-render timings, vertex counts and cameras. |

## How bevel became first-class

Any part can take `params.bevel`:

- **A number:** chamfer every box of that part by that many metres.
- **A dict:** a policy.

A style can also carry a policy, which applies to every part of a spec. For example, `brut_hewn` uses `rel 0.15, max 3.6 m, top_rel 0.75, mats [concrete family]`. Under a policy:

- the kit's own `box()` calls become `prims.cbox`, sized to each box, so old builders (decks, megacolumns, capsules, blocks) are chamfered too;
- new builders read the policy through `bv()` and `cb()`, so they can make architectural moves:
  - egg-crate and fin grids stop short of a cut corner;
  - attic bands and parapets chamfer and step;
  - roof masses take `hew` plane cuts.

Modes:

- `chamfer`, `round` (n segments) and `step` (n steps);
- separate vertical, top and bottom edge amounts;
- per-corner cuts (`corners`);
- random or explicit oblique cuts (`hew`, `cuts`).

So "blocky" versus "chamfered" is a style switch on an unchanged spec (render a2), while "tetrapod" is a spec variant (a3).

## Style decisions (the "not realism" addendum)

- **Stylised surfaces.** Every study style has `flat 0.28`. Texture noise, streaks and board lines are damped to a trace. The kit's full-range 45 % noise blotch was replaced by a small tonal drift, and algae streaks were removed.
- **Character from geometry and palette.** Grit comes from palette, light and clutter (rust and hazard trim, sodium light, crates, pipes), never from grime textures. The clean underground is literally a white model.
- **Crisp light.** A 1.5° sun, cool fill and warm key (`crisp`, `crisp_warm`), a light AgX medium-high-contrast look, and fog only where it helps depth.
- **Readable silhouettes.** Chamfers catch light as one- or two-pixel facets in the sprites. Vegetation is chunky low-poly clumps with crisp-edged moss. Wall ivy is geometry: the shader version read as stains, so it is off.

## Grid-rational diagonals, and how the engine could represent them

- **The rule.** Slopes are `[run cells : rise levels]` with small integers: 1:1, 1:2, 2:1, and 1:3 or 4:1 for bastions and ramps. Every sloped face is then a plane through lattice points, so it stays representable in the same (x, y, level) grid.
- **Clean pixel lines.** In 2:1 isometric at 16 px per cell, a cell step along a grid axis moves ±8 px across and ±4 px vertically on screen. If one level is also a whole number of pixels (8 px here, so a level is 3.27 m in the pixel study instead of 3.5 m), then every slope edge is an integer pixel vector:
  - (8n, ±4n − 8k) for k levels over n cells;
  - so 1:1 gives lines of 2:1 and 2:3;
  - 1:2 gives horizontal runs and 1:1 diagonals;
  - 2:1 gives long, shallow steps.

  Each face therefore tiles with a short repeating stair pattern instead of Bresenham noise (`h2_slopes16`, `h3_slopes32`). At the kit's usual 3.5 m level (8.57 px), the patterns drift.
- **Recommendation: fix the pixel grid first** (cell width and level height in pixels), then derive the metric level height.
- **Representation: rational-slope cells, following SC2K's terrain.** SC2K stores four corner heights per tile, differing by at most one step, and draws one of 14 slope sprites plus flat. Stratum can generalise that in two ways:
  1. A cell (or voxel column) holds a list of solid intervals. Each interval's top and bottom surfaces are planes, given as corner heights in level units: small rationals such as 0, ½, 1 or 2 per cell edge. This is exactly what `earth2` does to carve sheared shafts and battered halls. It supports overhangs, inclined bores and stacked layers, and every piece stays convex for cutting and sectioning.
  2. A slope is authored as a primitive: footprint, axis, `[run, rise]`, and smooth or stepped. The primitive rasterises into those cells. The smooth version renders as planes (or pre-generated slope sprites per ratio and orientation, like SC2K's slope tiles). The stepped version falls back to whole-level terraces and is always representable.
- **Gameplay.** Walkability can follow the grade: ramps up to 1:2 walkable, steeper faces as walls or escalators. Inclined shafts become routes with a fixed rational grade (escalators 1:1, funiculars 2:1).

## Per-render notes (what each shows and what it needs)

### (a) Hewn edges (`gen/g_block.py`)

| Render | Shows | Needs |
|---|---|---|
| `a/a1_blocky` | The reference brutalist block: podium with a recessed ground floor, round and square cores, an egg-crate bar on columns, a cantilevered cross-bar, and a sky bridge to an octagonal stair tower. | `bmass` (facade modes), `btower`, `bcol` (flare capitals), `bbeam` (windows, haunch) |
| `a/a2_chamfered` | The same spec under style `brut_hewn`. Corners and attic bands are chamfered and stepped, the facade grids stop short of the cut corners, and the plant room is hewn. | the bevel policy (`kitc._box`), `bv` / `cb`, `prims.hewn` |
| `a/a3_tetrapod` | Spec variant: the bar rides on four giant standing tetrapods, inverted-V tetrapod legs carry both cantilevers, the plaza is ringed by a placed revetment, and rows of small units sit on the roof. | `tetrapod`, `armour` (pattern mode), `strut` |
| `a/a2b`, `a/a3b` | Close-ups at warm light. | as above |
| `k/k1`, `k/k2` | Catalogue of edge modes (sharp, chamfer, round, step, hewn) and the concrete family, blocky vs hewn. | `cblock`, all concrete parts |

### (b) Spartan vs overgrown (`gen/g_green.py`)

| Render | Shows | Needs |
|---|---|---|
| `b/b1_spartan` | Stepped terraces at 1:1, an egg-crate slab, a pod-infilled megaframe, a round tower and a court pool. The `green` tag is dropped. | `slopemass` (stepped), `megaframe`, `bmass`, `btower`, `drop_tags` |
| `b/b2_overgrown` | The same spec with style `overgrown`: crisp moss on up-facing concrete, planted terraces with trailing plants, a roof forest, Barbican-style balcony plants, climbing plants on the tower, plane trees. | `edgeplanter`, `vines`, `roofgarden`, `ivy`, `bigtree`, `tree`; the style's `moss` |
| `b/b3`, `b/b4` | Close-ups: a ledge tree dropping aerial roots through the megaframe. | `bigtree` (roots), `roots` |

### Large-scale diagonals (`gen/g_diag.py`)

| Render | Shows | Needs |
|---|---|---|
| `d/d1_battered_wall` | A wall-city with a 1:2 battered face and slot windows that follow the slope; the same wall stepped every two levels; a 2:1 inclined housing plane on piers; a 1:3 bastion; a 4:1 ramp. | `slopemass` (smooth and stepped), `incline` (units, road) |
| `d/d2_stepped_vs_smooth` | The same envelopes at 1:1, 1:2 and 2:1, smooth and stepped. | `slopemass` |
| `d/d3_inclined_shafts` | Section: a 1:1 escalator bore (three escalators, torchère lamps, people), a 2:1 funicular bore (a stepped car that stays level), and a hangar with battered walls (about 1:3), inclined ribs, a goliath gantry and a TBM being assembled. | `earth2` (sheared and battered voids), `ibore`, `strut`, `tbm`, `lining`, crop and section caps |

### (c) Underground palettes (`gen/g_under.py`)

| Render | Shows | Needs |
|---|---|---|
| `c/c1_gritty`, `c/c2_between`, `c/c3_clean` | One section in three palettes. Levels: a concourse (columns, kiosks, signs, planters, stairs); services (two pipe racks, a fan, drums, crates, cables); a tall workshop hall (bridge crane with a hung load, robot arms, a conveyor, mezzanine walkways); a transit hall with a train; a lift core. The clean version rounds its bevels and cuts in white. | `lining`, `piperack`, `fan`, `hub`, `hangar` (shell `none`), `walkway`, `robotarm`, `conveyor`, `tunnel`/`tube`; styles `ug_grit` / `ug_mid` / `ug_clean`; `poche_map` |

### (d) Heterogeneous section (`gen/g_under.py`)

| Render | Shows | Needs |
|---|---|---|
| `dd/dd1_section` | From the top:<br>- towers with a roof garden;<br>- five dense strata of cut-open capsule infill (Kowloon-dense) and a transit tube;<br>- a void of about 11 levels with sparse walkways (hung, keeled, angled), stairs, pendants, cable spans, roots and vines;<br>- a 44 m borehole cut through its axis (liner rings, helical ramp, light rings, lift, pipes, landings) opening into the void;<br>- a rib-framed hangar with two bridge cranes and a TBM mid-assembly;<br>- rock between the rooms. | `earth2`, `borehole`, `walkway`, `pendant`, `cablespan`, `roots`, `vines`, `hangar`, `tbm`, `conveyor`, `capsule` / `deck` (kit), crop |
| `dd/dd2`, `dd/dd3` | Close-ups of the void and the hangar. | as above |

### (e) Infrastructure (`gen/g_infra.py`)

| Render | Shows | Needs |
|---|---|---|
| `e/e1_district` | The district overview. | everything below |
| `e/e2_interchange` | A stack interchange: highways at 12 m and 26 m, four humped Bezier flyovers, hammerhead piers, cars with lights, lane marks, jersey barriers. | `highway` |
| `e/e3_conduits` | A 76-cable trunk rises from a vault in a ribbed casing, then splits 32 / 24 / 20, and one branch splits again, into towers and the factory. Tube bundles (row and bundle) carry pods; colour-coded pipe racks run below. | `cabletree`, `ptube`, `piperack`, `hub` |
| `e/e4_slides` | Water-slide terrace: helical trough and tube slides around an octagonal tower, a free-form flume, and a pool. | `slide` (trough, tube) |

### (f) Blade Runner 2049 reveal (`gen/g_city.py`, `post_city.py`)

- **Renders:** `f/f_{dys,brut,solar}_{1_far,2_district,3_superblock,4_canyon}`, and `boxed_*` with the zoom outlines.
- **The city:** 13 × 13 superblocks (each 240 m with 16 towers) and 64 m canyons, with one landmark per style: a 1:2 battered monolith, a 2:1 stepped terrace hill, or a park block.
- **Views:**

  | View | Camera |
  |---|---|
  | Far | 76° |
  | District | 56° |
  | Superblock | 40° |
  | Canyon | Perspective, 24 mm |

- **Level of detail:** the centre superblock gets detail 2 (bridges, signs, walkways, spinners, vines, sky gardens) and its neighbours detail 1; the rest are boxes with procedural window facades. The whole city is about 200 k vertices.
- **Needs:** `superblock`, `tower`, the facade materials, perspective cameras, and `slopemass` / `forest` / `water` for the landmarks.

### (g) Landscape (`gen/g_land.py`)

- **Renders:** `g/g1_landscape`, `g/g2_landscape_cores`.
- **The tile:** 4.2 × 3 km with a river and strata skirts.
- **Features:**
  - a 3 × 3 superblock core;
  - a stepped 2:1 arcology mountain with towers on top;
  - a 1.5 km wall-city with a 1:2 battered river face;
  - villages and small towers;
  - fields, forests, four highways draped on the terrain, and a covered quarry conveyor.
- **Needs:** `terrain`, `forest`, `village`, `superblock`, `slopemass`, `highway`, `conveyor`, and the `terrain` / `fields` materials.

### (h) Pixel art (`gen/g_pixel.py`, `pixel.py`)

- **Method:**
  - aliased EEVEE (filter width 0), with `px_per_m` fixed so a 4 m cell is 16 px (the prototype's density), 2:1 camera (elevation 30°, azimuth 45°);
  - then nearest-colour lock in CIELAB to the 72-colour Stratum palette (`out/h/h0_palette.png`).
- **The palette:** built from the prototype's ramps:
  - warm concrete ink ramp, slate decks, terracotta, ochre, sage and foliage, teal water, earth strata, night ambers;
  - the prototype's accents: coral, signal yellow, mint, neon;
  - a cool-white ramp for clean interiors.
- **Panels:**

  | Panel | Shows |
  |---|---|
  | `h1` | The block in three treatments |
  | `h2`, `h3` | Slopes at 16 and 32 px per cell |
  | `h4` | The wall-city |
  | `h5` | Spartan vs overgrown |
  | `h6` | One superblock at 8, 16 and 32 px per cell (the continuous-zoom LOD idea) |
  | `h7` | Three city styles |
  | `h8_*` | In-game crops: interchange, underground gritty and clean, shafts |
  | `h9` | Stratum palette vs SC2K-style kit64 vs raw |

## Known issues / next steps

- **Palette locking.** Nearest-colour is clean on these flat materials but still bands on large gradients (fog, sky). The next step is per-material ramp mapping, using an ID pass plus luminance.
- **Crop mismatch.** The `earth2` corner columns of battered voids use the plane active at the column centre, so steeply battered corners are slightly approximate. Inclined bores slide their end faces onto vertical planes, so they meet box rooms cleanly, but only when the bore runs along x.
- **Section caps.** Caps take the material of the face they cut, so hollow parts built as closed pieces (capsule walls, liners) section correctly. The earth caps in `dd1` read as dark rock under the section light rather than showing strata.
- **Vegetation cost.** Geometry vegetation is the most expensive element: `b2` is 160 k faces and the brut superblock 190 k. Use detail levels, as the city does.
- **Tetrapod lattice.** `diamond` exists but is not featured in a render yet. It is ready for a lattice megastructure study.
