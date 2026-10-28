# Megastructure, aesthetics and multi-scale: notes to retain

From the user on 2026-09-30, for when the arcology / layers / megastructure work resumes. Organised from a voice note; nothing here is decided yet.

**Scope:** these notes are for the broader Stratum megastructure version, a general city/megastructure simulation with its own aesthetic, not for the SimCity 2000 version. The two are separate tracks, each maintained independently:
- the **sc2k version** keeps SimCity 2000's aesthetic;
- the **broader version** brings in pixel-art city-simulation aesthetics without being SimCity 2000 (the Stratum layer prototype is a good touchstone).

Some of these ideas won't fit SimCity 2000. Attempts to fit them are interesting explorations, not the goal.

## Heterogeneous megastructure at landscape scale

- Layers are the foundation, but the goal is heterogeneous megastructure across large landscapes: some sections super dense, others much less so.
- Inspiration: the Blade Runner 2049 approach to New LA. From far away the city reads as ordinary city blocks; as the camera closes in, each "block" turns out to be a superblock of skyscrapers. That version is dystopian, but several variants should exist so players can build different styles of megacity.

## Multi-resolution art and continuous zoom

- Offer continuous zoom. Generate pixel art at several resolutions and swap levels of detail as the player zooms in or out, so true megastructures stay legible at every scale.
- Start by generating different resolutions of the original SimCity 2000 art: zoomed-out versions (limited, since sprites only get so big, but worth it for large buildings such as the 4×4 arcologies) and zoomed-in versions, both of whole buildings and of details of particular parts.
- Eventually generate on demand, live in game: deep zooms into a building shouldn't all be pre-baked. This needs a cache that retains what players have zoomed into.
- Open questions: which generation services to use (pixel-art specialists aren't required; try a variety), what's static vs dynamic, and how cache retention works.

## Multi-scale simulation (renormalization-group flavour)

- Performance: probably only some loaded chunks are simulated in detail at any time.
- Idea: simulate at different fidelities at different scales, e.g. one simulation at the level of top-level blocks with its own parameters. Loading an area at finer levels of abstraction instantiates a microstate consistent with the macrostate; microstates exist only when needed.
- Retain some detail of microstates after the player moves on, without the naive version accumulating ever more computation. Areas left alone for a long time can relax back to a coarser simulation, while keeping details the player expressed interest in or interacted with.
- Speculative, and meant to be fun and interesting rather than physically grounded. Look for related work.

## Aesthetic mix (all should be part of the repertoire)

- Blocky is good, but also add bevelled and chamfered edges: blocks tuned by hewing away their edges.
- Concrete brutalist megastructures with chamfered edges, inspired by tetrapods and other infrastructure concrete (breakwaters and the like). Two moods:
  - sparse, Spartan, concrete only;
  - brutalism plus plants: vines and trees growing on top, verging on but not quite post-apocalyptic.
- Underground: gritty industrial is good; also offer white, gleaming, clean underground; and variations between them. Different palettes suit the narrative the player has in mind for their place.
- Heterogeneity underground: not every layer fully dense. Large open spaces spanning several consecutive layers with sparse walkways and paths between them; vast shafts like a huge borehole; large open hangars with big construction projects or factories inside.
- Factories and conveyor belts play some part, though the game stays firmly on the city side of the Factorio line.
- Infrastructure should be significant:
  - large highways, conveyor belts, pneumatic-tube systems;
  - fun things like water slides;
  - interleaved wires and vast trunks of wires splitting off one another into giant conduits of bundled wires and pipes;
  - pipes generally.

## Addenda (same day)

### Large-scale diagonals

- The engine is intentionally isometric, but it should still support large-scale diagonals, especially for brutalist concrete: big sloping concrete surfaces, and diagonal shafts underground. "Not quite pyramids, but not just straight up-and-down stuff at scale."
- Diagonals should work as long as their slopes are integer multiples or ratios of the grid (e.g. 1:1, 1:2, 2:1 in grid units), so they stay representable and read cleanly in 2:1 pixel isometric. Explore how to accomplish this; SimCity 2000's sloped terrain tiles are a precedent.

### Style: its own thing, not realism

- Cities: Skylines and, to a lesser degree, SimCity 4 were aesthetic missteps by aiming for realism. SimCity (2013) was better.
- Not cartoony, but not realistic either. A bit like a model city, though even that isn't quite right; it should be its own thing.
- For zoomed-in generation, the goal is not "realistic zoom-ins". It's an aesthetic congruent with how the original looked, interpolated to how it would look more zoomed in.

### Think bigger: orders of magnitude, buildings as landscapes (later the same day)

- Round 2 of the aesthetic mock-ups was mostly at the scale of real existing buildings. We'll want that, but also much, much bigger: at least one, possibly two to three orders of magnitude bigger, perhaps more in future.
- Some of those giant structures will be built on. Some buildings effectively become landscapes that other buildings are slotted into: nested, multi-scale megastructure.
- Ties directly to continuous zoom and multi-resolution art, and to the RG-style multi-scale simulation (notes/multiscale-simulation.md).
- Corrections: tetrapods were shorthand for *interestingly shaped large concrete* (interlocking, chamfered, faceted, cast forms), not a theme; occasional tetrapods are fine. And megastructures should stay architecture at every scale: very large buildings may *evoke* landscape through sheer size, but only extraordinarily subtly, never as literal or cutesy landscapes (no fake mountains, ridges or calderas).
