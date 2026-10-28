# Multi-scale simulation for Stratum: related work and a proposal

30 September 2026. Follows "Multi-scale simulation (renormalization-group flavour)" in [2026-09-30-megastructure-and-multiscale.md](2026-09-30-megastructure-and-multiscale.md). The toy is [multiscale-toy.html](multiscale-toy.html): one self-contained file, open it in any browser. There is also a private copy as a [claude.ai artifact](https://claude.ai/artifact/8XDMu1CpULUgBSBCA5CvSN).

**Scope.** This is for the broader Stratum megastructure version: the de novo layered engine that the report recommends (TypeScript, deterministic, cells indexed by (x, y, level); see [the report](../reports/SimCity%20foundation%20for%20agentic%20modding.md)), with its own pixel-art aesthetic, for which the layer prototype is the touchstone. The SC2K version keeps SimCity 2000's flat grid and is not the target. It appears only where an idea can be tried there cheaply first.

## The short version

- **Lift and restrict.** Treat every level of the hierarchy as a pair of operators, as equation-free computing and multigrid do:
  - **lift** turns a macrostate into one consistent microstate, seeded and created on demand;
  - **restrict** turns a microstate back into a macrostate by summing, averaging or taking the mode.

  The invariant is restrict(lift(x)) = x, and it is checked every time.
- **The coarse simulation never stops.** Detail is a cache on top of it.
  - Each cell keeps a small **genome**: a few bytes per lot (generation counter, tier, build year).
  - The genome makes lifting deterministic and stable. The same streets and buildings come back, updated by whatever happened while you were away.
- **Conservation is booked at the seams.** When anything crosses between a detailed cell and a coarse one, the detailed side decides exactly what crosses and the coarse side receives exactly that. This is adaptive mesh refinement's refluxing.
- **Memory records.** Whatever the player or an agent touched, named, pointed at or looked at closely becomes a small delta over the seeded generation.
  - Each record has a salience score that rises with attention and decays without it.
  - A fixed budget and eviction by salience keep memory bounded.
  - Forgetting bakes the structure into the genome and drops everything else.
- **Relaxation.** Areas relax on a schedule: live (on screen), then warm (cached, not saved), then cold (genome, macrostate and records only). Detail is added only after the camera settles on an area and dropped as soon as the area leaves view, with hysteresis at the threshold.
- **Re-entry tells a story.** The coarse history keeps running while you are away, so a re-lift shows real changes, and the event log becomes a "while you were away" digest. The same log produces rumours about districts you aren't watching. When you go and look, the rumours turn out to be true.
- **Art follows the same contract.** The art workstream's zoom sprites must coarse-grain back to the original, so art and simulation can share keys, caches and the salience ledger.

---

## Part 1. Related work

Compiled on 2026-09-30 from six parallel literature passes. The dates are the publication dates of the sources. Markers used below:

- **(unverified):** the source for this claim could not be loaded.
- **(decompiled)** and **(community):** the source is unofficial.

### The three most useful

1. **Sunshine-Hill's alibi generation and LOD trader** (2010, 2013).
   - Detail is instantiated only when observed, as a fair sample conditioned on everything already seen.
   - What to keep is decided by expected attention and time until the player returns, under a hard budget.
   - This is the whole idea, already published, for city crowds.
2. **Equation-free computing, multigrid's full approximation scheme (FAS) and adaptive mesh refinement's refluxing** (2003, 1977, 1989). Together they give the vocabulary and invariants for the interface between levels:
   - lift, heal and restrict;
   - a coarse level corrected by what the fine level knew (the τ-correction);
   - flows across a coarse–fine seam booked once, in both ledgers.
3. **Dwarf Fortress site realization and RimWorld's world-pawn garbage collector, with No Man's Sky's protected edit budget.**
   - These show in shipped games that storing a seed, counts and a change log works.
   - They also give explicit rules for which individuals are kept.

### Games

#### Colony and sandbox simulations

**Dwarf Fortress: site realization and historical figures** (dev logs 2013; DF Wiki for v53).
- **What:** A site is stored as a realization seed plus population and crop counts. It is realized into a map with units only when someone comes near.
  - Units are rebuilt from historical-figure records.
  - Damage survives re-realization.
  - Only notable creatures become historical figures: nobles, named killers, bonded animals.
  - Adams kept promotion lazy and budgeted, because a promoted figure is hard to demote again.
- **Steal:** seed + counts + change log; promotion that is lazy, budgeted and, unlike DF's, revocable.
- Sources: [Dev log 2013](https://www.bay12games.com/dwarves/dev_2013.html) · [Historical figure](https://dwarffortresswiki.org/index.php/Historical_figure) · [df.site.xml](https://github.com/DFHack/df-structures/blob/master/df.site.xml) (reverse-engineered)

**Dwarf Fortress: world activation** (0.40.01, 7 Jul 2014; Steam release 6 Dec 2022).
- **What:** While you play a fortress, history keeps running at world-map scale.
  - Groups that move are army objects with a goal state machine: invade, harass, patrol, reclaim, found a site.
  - Caravans and migrants teleport; armies walk.
  - Adams once had to fix nearby sites being offloaded too often.
- **Steal:** coarse proxies with goal states for anything off-map; teleporting for cheap flows; hysteresis.
- Sources: [Release 0.40.01](https://dwarffortresswiki.org/index.php/DF2014:Release_information/0.40.01) · [Dev log 2014](https://www.bay12games.com/dwarves/dev_2014.html) · [df.army_controller.xml](https://github.com/DFHack/df-structures/blob/master/df.army_controller.xml)

**RimWorld: world pawns** (1.0 in 2018 to 1.6 in 2025; decompiled).
- **What:** Off-map people live in a pool that a garbage collector sweeps every 15,000 ticks. It keeps:
  - pawns with a reason to exist: ever a colonist, faction leader, bonded, kidnapped, in a caravan, in the battle log or a tale, reserved by a quest;
  - their relatives, one hop out;
  - ten random humanlikes.

  Everyone else is discarded. Idle pawns are batch-ticked and caught up later. New pawns reuse free world pawns, with a probability that grows with the size of the pool.
- **Steal:** the reason-to-keep list, one-hop closure, a few seeded random keeps, and reuse before generating.
- **Avoid:** a hand-maintained list of reasons; later versions kept having to add new ones.
- Sources: [WorldPawnGC.cs (1.0)](https://github.com/josh-m/RW-Decompile/blob/master/RimWorld.Planet/WorldPawnGC.cs) · [RimworldDecompile (1.6)](https://github.com/Dyyrlysh/RimworldDecompile)

**Rain World: abstract and realized creatures** (2017; community wiki).
- **What:** Each creature is a persistent abstract record. Its physics and AI object is built when its room is realized and dropped when the room is abstracted. Cosmetics are regenerated from the entity ID every time.
- **Steal:** ID-seeded regeneration; store identity and changes, not appearance.
- Sources: [AbstractWorldEntity](https://rainworldmodding.miraheze.org/wiki/Rain_World_Code_Structure/AbstractWorldEntity)

**Minecraft: chunk tickets, random ticks, inhabited time** (Java 1.21.x; Minecraft Wiki).
- **What:** A chunk is either simulated at a load level, set by reference-counted tickets with lifetimes, or frozen.
  - Nothing catches up: crops in an unloaded chunk simply stop.
  - Random ticks hit 3 blocks per 16³ section per tick.
  - Each chunk accumulates `InhabitedTime`, which raises local difficulty.
  - Spawn chunks were removed in 1.21.9.
  - Chunks are saved in full once generated, so saves grow with exploration.
- **Steal:** tickets with time-to-live; per-chunk attention time as a free salience signal.
- **Avoid:** freezing without catch-up; saving everything that was ever visited.
- Sources: [Chunk](https://minecraft.wiki/w/Chunk) · [Tick](https://minecraft.wiki/w/Tick) · [Local difficulty](https://minecraft.wiki/w/Local_difficulty) · [Chunk format](https://minecraft.wiki/w/Chunk_format)

**Factorio: sleeping entities and per-chunk fields** (Friday Facts 2017–2024).
- **What:** There is no spatial level of detail. Everything updates everywhere, in deterministic lockstep. That is affordable because of:
  - entities that sleep, woken by a queue processed in a fixed order;
  - belt runs merged into single records that store only the gaps between items;
  - fields held per chunk. Pollution spreads 2% to each neighbour every 64 ticks once above a threshold, and spawners spend the pollution they absorb on attacks.
- **Steal:** sleeping with deterministic wakeups; merging runs of identical things; per-chunk scalar fields as the coupling between scales.
- Sources: [FFF #176](https://www.factorio.com/blog/post/fff-176) (3 Feb 2017) · [FFF #364](https://factorio.com/blog/post/fff-364) (29 Jan 2021) · [FFF #421](https://www.factorio.com/blog/post/fff-421) (26 Jul 2024) · [Pollution](https://wiki.factorio.com/Pollution)

**Noita** (2019–2020).
- **What:** Every pixel is simulated, but only in loaded 64×64 chunks, and only inside dirty rectangles. A keep-alive component pins the chunks around an entity.
- **Steal:** dirty rects; an explicit "keep simulating here" pin.
- Sources: [GDC 2019 talk](https://www.gdcvault.com/play/1025695/Exploring-the-Tech-and-Design) · [StreamingKeepAliveComponent](https://noita.wiki.gg/wiki/Documentation:_StreamingKeepAliveComponent)

#### Seeded universes with stored deltas

**No Man's Sky** (2016–).
- **What:** The universe regenerates from a seed as you approach.
  - Servers store discoveries and shared bases.
  - Terrain edits live as deltas in a fixed-size store.
  - Since the Synthesis update (Nov 2019), edits inside a base are protected from regeneration. That implies unprotected edits are evicted back to the seed when the store fills.
- **Steal:** a seed plus a fixed delta budget, split into protected and evictable classes. Eviction then works as relaxation.
- **Avoid:** silent first-in-first-out eviction, which players read as a bug. Evict by salience and show the budget.
- Sources: [Synthesis update](https://www.nomanssky.com/synthesis-update/) · [Continuous World Generation, GDC 2017](https://www.gdcvault.com/play/1024265/Continuous_World_Generation_in__No_Man_s_Sky_)

**Elite Dangerous: Stellar Forge and the Background Simulation** (2014–).
- **What:**
  - About 400 billion systems are generated from galactic models, anchored by roughly 150,000 real catalogue stars.
  - On top of that, each system's factions hold influence shares. A daily tick recomputes them from the aggregate of player actions, with a cap on change per tick and states that lag (pending → active → recovering).
  - The original Elite (1984) stored only seeds: 8 galaxies of 256 systems.
- **Steal:** a coarse layer with its own clock; capped change per tick; states with lag; player input only in aggregate; authored anchors inside a procedural fill.
- **Avoid:** the Background Simulation's opacity. Show why a cell moved.
- Sources: [Elite Dangerous](https://en.wikipedia.org/wiki/Elite_Dangerous) · [Beyond Chapter Four factions](https://www.pcgamesn.com/elite-dangerous/beyond-chapter-four-factions) (25 Oct 2018) · [BGS guide](https://sinc.science/guides/sinc/) (community, 2024) · [Elite galaxy seeds](https://elite.bbcelite.com/deep_dives/galaxy_and_system_seeds.html)

**Star Citizen: persistent entity streaming** (Alpha 3.18, Mar 2023).
- **What:** Every dynamic entity persists in a shard's entity graph and streams in and out of server nodes by proximity.
  - A planned rule stows a player's own items into their inventory once nobody is near.
  - The cleanup rules for everything else are undocumented, and players complain about them.
- **Steal:** ownership as a salience flag; compressing a detailed object into a compact owned record when it streams out.
- **Avoid:** persisting everything and then sweeping it up later.
- Sources: [Server Meshing and Persistent Streaming Q&A](https://robertsspaceindustries.com/comm-link/transmission/18397-Server-Meshing-And-Persistent-Streaming-Q-A) (10 Nov 2021) · [Alpha 3.18.0](https://starcitizen.tools/Update:Star_Citizen_Alpha_3.18.0)

#### City builders

**SimCity (2013), GlassBox** (GDC 2012).
- **What:** The engine is built from resources in bins, units that own the bins, maps, rules that move and convert resources, and agents that carry them (the target was 10,000+ agents).
  - Sims had no persistent home or job. Each morning they took the nearest open job, and each evening the nearest vacant house.
  - That trade-off saved computation but produced visible absurdities and cost the game players' trust.
  - Cities in a region traded over fixed links through EA's servers.
- **Steal:** the resource/unit/rule/map vocabulary for the micro level.
- **Avoid:** agents without identity wherever identity is visible. Household records with a home and a job are cheap.
- Sources: [Inside GlassBox](https://www.andrewwillmott.com/talks/inside-glassbox) (Willmott, GDC 2012) · [Kotaku's guide to the launch](https://kotaku.com/your-complete-guide-to-the-simcity-disaster-5991077) (18 Mar 2013)

**SimCity 4 regions** (2003).
- **What:** Only the city being played advances. The region view stitches together the other cities' saved snapshots and totals.
  - Commuting and demand are computed against those stale snapshots.
  - Players therefore rotate between tiles until the numbers converge.
- **Steal:** a region view that is purely an aggregate of per-cell summaries.
- **Avoid:** frozen fine levels with no coarse simulation running under them.
- Sources: [SC4 Deluxe manual](https://www.simtropolis.com/library/maxis/sc4/tools/SC4rh_deluxe_manual.pdf)

**Cities: Skylines (2015) and Cities: Skylines II (2023).**
- **What:**
  - CS1 separates citizen records (up to about a million) from walking instances (65,536) and moving vehicles (16,384), so the population outnumbers the visible agents. These figures come from a community guide (unverified).
  - CS2 makes every citizen an ECS entity with a life path.
  - CS2's launch problems were mostly rendering without LODs, not simulation.
- **Steal:** records versus instances. Households and jobs are persistent records; agents spawn only for trips or near the camera.
- Sources: [Dev Diary #11: Citizen simulation](https://colossalorder.fi/?p=1851) (28 Aug 2023) · [CS2 performance teardown](https://blog.paavo.me/cities-skylines-2-performance/) (5 Nov 2023)

#### Generated history

**Caves of Qud: sultan histories** (Grinblat & Bucklew, FDG 2017).
- **What:** World creation generates five periods, each centred on a sultan with domains.
  - Events are rolled first. A grammar then writes causes drawn from the sultan's state, and if no cause fits, the event adds one to the state.
  - History surfaces lazily, one gospel per shrine or painting, as you find them.
- **Steal for re-entry:** the coarse simulation decides what changed. A narrative layer then invents why from the cell's state and writes the cause back, so later lifts agree with it. Surface history through artifacts only once they are seen.
- Sources: [Paper](https://www.freeholdgames.com/papers/Generation_of_Mythic_Biographies_in_CavesofQud.pdf)

**Ultima Ratio Regum** (Mark R. Johnson, 2011–).
- **What:** "Chains of meaning": later generators read earlier outputs (plants → remedies → symbols → phrases). Johnson follows two rules: a finished generator is never rebuilt, and new generators always run last.
- **Steal:** append-only generator pipelines as a determinism contract, so existing seeds keep producing the same world after updates. Derive micro detail from coarse facts, not from independent dice rolls.
- Sources: [The 10-year journey](https://www.gamedeveloper.com/design/the-10-year-journey-of-ultima-ratio-regum-the-culture-generating-roguelike) (8 Apr 2021)

#### Off-screen simulation in open worlds and MMOs

**S.T.A.L.K.E.R. A-Life** (2007).
- **What:** One global simulation covers every NPC.
  - Near the player (about 150 m) an NPC is online, with full AI.
  - Elsewhere it is offline: it moves on a coarse graph, fights are resolved by formula, and it still trades.
  - The engine switches an NPC online inside d·(1−f) and offline outside d·(1+f).
- **Steal:** coarse-graph movement for offline agents, and the hysteresis band.
- **Avoid:** leaving the offline record's schema implicit.
- Sources: [Interview: inside the AI of S.T.A.L.K.E.R.](https://www.gamedeveloper.com/game-platforms/interview-inside-the-ai-of-i-s-t-a-l-k-e-r-i-) (12 Mar 2008) · [alife_switch_manager_inline.h](https://github.com/OpenXRay/xray-16/blob/dev/src/xrGame/alife_switch_manager_inline.h)

**Watch Dogs: Legion, Census** (2020).
- **What:** Citizens are generated on demand from constraints on what the player has already seen. A visible job implies an income, which implies a neighbourhood and a home.
  - Background people are deleted when you leave.
  - People you engage with are promoted to persistent status, together with their family and friends.
  - Promoted people keep their schedules and memories when unseen.
- **Steal:** generation conditioned on observation; tiered promotion.
- **Avoid:** unbounded promotion of whole social networks. Cap the number of hops.
- Sources: [GDC 2021 talk](https://www.gdcvault.com/play/1027018/Census-The-Systemic-Backbone-Behind) · [How Legion's simulation works](https://www.gamedeveloper.com/design/how-watch-dogs-legion-s-play-as-anyone-simulation-works) (9 Dec 2020)

**Middle-earth: Shadow of Mordor, the Nemesis system** (2014).
- **What:** Generic orcs are promoted to named, remembered captains by events such as killing the player. A record of past encounters drives their dialogue.
- **Steal:** a compact event record per salient entity; showing the changes as a board when the player returns.
- **Avoid:** copying it closely. It is patented (US 10,926,179, 2021).
- Sources: [Patent](https://patents.google.com/patent/US10926179B2/en)

**Crusader Kings II and III: pruning and reuse** (2012, 2020).
- **What:**
  - CK2 prunes irrelevant dead characters. It exempts characters shown in the chronicle and scripted historical ones.
  - CK3 reuses unlanded characters who wander the map before it generates new ones.
- **Steal:** an explicit relevance rule with pins; reuse before generation.
- Sources: [CK2 patch 2.2.X](https://ck2.paradoxwikis.com/Patch_2.2.X) (18 Nov 2014) · [Patch 2.4.X](https://ck2.paradoxwikis.com/Patch_2.4.X) (2015) · [CK3 FAQ](https://ck3.paradoxwikis.com/FAQ)

**The Sims 3 story progression (2009) and The Sims 4 Neighbourhood Stories (2021–22).**
- **What:** Households nobody is playing age, marry, change jobs, move and die by rule.
  - Sims 3 had one global switch, and its results were chaotic.
  - Sims 4 weights events by traits, adds toggles per household and per story type, and puts a digest of recent stories in the mailbox.
- **Steal:** trait-weighted event tables at the coarse level; opt-outs per entity; a digest.
- Sources: [Introducing Neighborhood Stories](https://www.ea.com/games/the-sims/the-sims-4/news/introducing-neighborhood-stories) (23 Nov 2021)

**Bethesda's Radiant AI, off-screen schedules** (Oblivion, 2006).
- **What:** NPCs in unloaded cells follow their schedule packages at a low processing level. They hop from cell to cell by estimated travel time and never interact with each other.
- **Steal:** position as a function of schedule and time, evaluated only on re-entry. Routine lives then need no ticking at all.
- Sources: [What was Radiant AI, anyway?](https://blog.paavo.me/radiant-ai/) (7 Jun 2025) · [AI Package](https://cs.uesp.net/wiki/AI_Package)

**X3 and X4: Foundations, out-of-sector simulation** (2005–).
- **What:** Away from the player, combat is resolved by simplified rules: no line-of-fire checks, and damage is averaged. As a result fleets often do better unobserved, and players learn to look away. This comes from community sources; Egosoft hasn't documented it.
- **Avoid:** the core failure, where looking changes the outcome. Calibrate the coarse model against the fine one, and bias coarse outcomes slightly against the player rather than in their favour.
- Sources: [Egosoft forum: new OOS battle code](http://forum.egosoft.com/viewtopic.php?p=3750547) (15 Dec 2011) · [Steam discussion](https://steamcommunity.com/app/392160/discussions/0/840627496100645234/)

**Total War and Mount & Blade autoresolve.**
- **What:** A formula stands in for a detailed battle. Players reportedly distrust it for the unit types it misjudges (unverified; no source could be reached).
- **Steal:** show the coarse prediction before the player commits to it.

**MMO interest management** (2006–2019).
- **What:** Each player subscribes only to state near them.
  - In Boulanger et al. (2006), tile-based schemes cap a player's subscriptions at 9 tiles, and visibility-aware schemes cut update messages by up to 6×.
  - Unreal's Replication Graph, built for Fortnite, uses persistent spatial nodes, plus dormancy for actors that rarely change.
  - SpatialOS gave each component its own interest radius.
  - EVE Online's Time Dilation slows a busy node's clock to as little as 10%, while server-time processes keep running at full speed.
- **Steal:** grid-based interest with a radius per detail tier; dormancy; a world clock that never slows.
- Sources: [Boulanger, Kienzle & Verbrugge](https://www.sable.mcgill.ca/~clump/papers/boulanger-06-comparing.pdf) (NetGames 2006) · [Replication Graph](https://dev.epicgames.com/documentation/unreal-engine/replication-graph-in-unreal-engine) · [Introducing Time Dilation](https://www.eveonline.com/news/view/introducing-time-dilation-tidi) (22 Apr 2011)

#### While you were away

**Animal Crossing and idle games.**
- **What:** Real-time clocks make absence visible but keep the damage bounded.
  - Animal Crossing grows weeds and brings cockroaches after about a week away. Since New Horizons, villagers ask before they leave.
  - Idle games compute offline gains in one step, at a reduced rate, with a cap. Cookie Clicker's exact figures are unverified.
- **Steal:** one-step catch-up with caps; cosmetic signs of neglect first; a letter; consent before any irreversible loss.
- Sources: [Cockroach](https://nookipedia.com/wiki/Cockroach) · [Time travel](https://nookipedia.com/wiki/Time_travel)

### Research

#### Simulation level of detail and LOD AI

**Alibi generation** (Sunshine-Hill & Badler, AIIDE 2010).
- **What:** A full pedestrian model of the city is built offline. At runtime only the agents in view exist.
  - When a street segment comes into view, its agents are sampled from the full model's steady state.
  - An agent's destination and backstory (its alibi) are generated only when the player looks closely. The alibi is a fair sample conditioned on everything already observed, drawn by Metropolis–Hastings in about 9 ms, and then committed.
  - A cell that leaves view keeps running until its population has turned over.
- **Steal:** the core model. The macrostate is a distribution; the microstate is a seeded sample conditioned on observations and committed once seen.
- **Avoid:** its steady-state assumption. Stratum's blocks grow and change.
- Sources: [Paper](https://ojs.aaai.org/index.php/AIIDE/article/view/12389) · [PhD thesis, Perceptually Driven Simulation](https://repository.upenn.edu/edissertations/435/) (2011)

**The LOD trader** (Sunshine-Hill, MIG 2013 / Game AI Pro).
- **What:** Each frame it picks a detail level for every entity within CPU and memory budgets, minimising the chance that the player notices a break in realism. An entity's importance combines:
  - its size on screen;
  - the player's attention;
  - the player's memory of it (learned fast, forgotten slowly);
  - the expected time until the player returns.

  Save-file space can also be treated as a budgeted resource.
- **Steal:** this is the retention policy. Keep what is salient and likely to be revisited, under a hard budget.
- Sources: [Game AI Pro chapter](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter14_Phenomenal_AI_Level-of-Detail_Control_with_the_LOD_Trader.pdf)

**Proxy simulations** (Chenney, Arikan & Forsyth, Eurographics 2001).
- **What:** A cheap discrete-event proxy runs everything out of view. It must produce plausible arrivals into view, plausible state on re-entry, and a much lower cost.
  - When a road is revealed, just that road is re-simulated from its first car's entry.
  - Result: 12,800 cars against 2,000 for the full simulation, with travel times within about 1%.
- **Steal:** designer-defined observables that the coarse model must match, checked by regression tests; local re-simulation on reveal.
- Sources: [Paper](http://www.okanarikan.com/assets/Papers/ProxySimulations/paper.pdf)

**Origins of simulation LOD, and LOD AI** (Carlson & Hodgins 1997; O'Sullivan et al. 2002; Brom, Šerý & Poch 2007; Wißner, Kistler & André 2010).
- **What:**
  - Carlson & Hodgins switch each character between dynamic, hybrid and kinematic simulation by importance.
  - O'Sullivan et al. grade detail for geometry, motion and conversation. In "role passing", generic agents temporarily take on specific roles.
  - Brom et al. make LOD gradual and align it with a goal hierarchy, so behaviour can resume at the right depth.
  - Wißner et al. evaluate with blinded perception tests.
- **Steal:** align the detail tree with the spatial tree and the goal tree; role passing as a lightweight alibi ("the shopkeeper you argued with"); test coarse models on players, not only on numbers.
- Sources: [Carlson & Hodgins](https://www.semanticscholar.org/paper/Simulation-Levels-of-Detail-for-Real-time-Animation-Carlson-Hodgins/56c840d0875bad9f1520e73eb2d654253965565b) · [O'Sullivan et al.](https://www.tara.tcd.ie/items/ae2032bc-86bb-4f22-ba97-30079048fcdd) · [Brom et al.](https://link.springer.com/chapter/10.1007/978-3-540-74997-4_1) · [Wißner et al.](https://link.springer.com/chapter/10.1007/978-3-642-16958-8_20)

#### Traffic and crowds between micro and macro

**Queue-based mesoscopic traffic** (Gawron 1998; MATSim QSim).
- **What:** Each road link is a first-in, first-out queue. A vehicle leaves after its free-flow travel time, subject to the link's outflow capacity and space downstream, and spillback emerges from this. Agents keep their identities.
- **Steal:** the default coarse traffic model for blocks: integer, deterministic and cheap. Because identities survive, zooming in needs no reconstruction. Iterated re-planning can resettle a region after the player has been away.
- Sources: [Gawron](https://doi.org/10.1142/S0129183198000303) · [The MATSim book](https://doi.org/10.5334/baw) (2016, open access)

**Hybrid traffic** (Sewall, Wilkie & Lin, SIGGRAPH Asia 2011).
- **What:** Individual vehicles in regions of interest, and a continuum model everywhere else.
  - Vehicles entering the continuum are averaged into lane cells.
  - Flow into a detailed region accumulates in a "flux capacitor" until a whole vehicle can be emitted.
  - Flipping a region's type quickly keeps counts stable but makes positions incoherent.
- **Steal:** flux accumulators at cell borders (deterministic, integer emission), with hysteresis; keep the identities of vehicles the player touched.
- Sources: [Paper](http://gamma-web.iacs.umd.edu/HYBRID_TRAFFIC/hybrid-traffic-2011.pdf)

**Flow reconstruction** (Wilkie, Sewall & Lin, SIGGRAPH 2013).
- **What:** Produces individual vehicles that match sparse aggregate data. The aggregates are smoothed into a density and velocity field, which then drives agents through boundary conditions.
- **Steal:** a zoom-in recipe: edge counts → field → agents. Procedural targets work as input too.
- Sources: [Project page](http://gamma.cs.unc.edu/TrafficFlowRecon/)

**The macroscopic fundamental diagram** (Geroliminis & Daganzo 2008).
- **What:** A whole urban network has a low-scatter curve from the number of vehicles in the network to the rate at which trips complete.
- **Steal:** a congestion law with a single variable per superblock. Use queues inside detailed blocks, because the curve scatters when load is uneven.
- Sources: [Paper](https://doi.org/10.1016/j.trb.2008.02.002)

**LWR and the cell transmission model** (1955–56; Daganzo 1994).
- **What:** Flow between two cells is the minimum of what upstream can send and what downstream can receive. Queues propagate backwards.
- **Steal:** conservative, integer-friendly corridors between blocks. Any coarse traffic model must get these backward waves right. SUMO's mesoscopic mode reportedly doesn't (Ni et al., arXiv, June 2026).
- Sources: [Daganzo](https://doi.org/10.1016/0191-2615(94)90002-7) · [SUMO meso](https://sumo.dlr.de/docs/Simulation/Meso.html) · [Ni et al. 2026](https://arxiv.org/abs/2606.09282)

**Hybrid meso–micro traffic: Mezzo** (Burghout, KTH 2004).
- **What:** Couples a microsimulator to an event-based mesoscopic model that stays vehicle-based.
  - It gives a checklist for consistency: route choice and network representation; queues that carry across boundaries; comparable performance in both submodels; transparent data exchange.
  - "Virtual links" summarise each micro sub-path so that coarse route choice stays consistent.
- **Steal:** the checklist; virtual links as the travel-time summary that a detailed block exports.
- Sources: [Thesis](https://kth.diva-portal.org/smash/get/diva2:14700/FULLTEXT01.pdf)

**Continuum and hybrid crowds** (Treuille, Cooper & Popović 2006; Narain et al. 2009).
- **What:** Treuille et al. give each goal group a dynamic potential field. Narain et al. keep a discrete representation and a continuum one at the same time.
- **Steal:** one potential field per destination class on the coarse grid can drive both aggregate flows and instantiated walkers, so the levels agree by construction.
- Sources: [Continuum Crowds](https://doi.org/10.1145/1141911.1142008) · [Aggregate dynamics](https://doi.org/10.1145/1661412.1618468)

#### Multi-resolution and multi-level agent-based modelling

**Consistency maintenance and Multiple Resolution Entities** (Reynolds, Natrajan & Srinivasan, ACM TOMACS 1997).
- **What:** Classic aggregate/disaggregate designs suffer from chain disaggregation (zooming into one entity drags the entities it interacts with down to detail too), and they waste resources. Instead, each entity keeps all its levels at once and keeps a set of core attributes consistent across them.
- **Steal:** treat a block as such an entity. Its core attributes are authoritative, and micro instances must sum to them. Route interactions across levels through the coarse interface, so zooming into one block never forces its neighbours to instantiate.
- Sources: [Paper](https://dl.acm.org/doi/10.1145/259207.259235)

**Families of models across resolutions** (Davis & Hillestad 1993; Davis & Bigelow, RAND 1998).
- **What:** Variables are arranged as a tree in which each aggregate is an explicit function of the variables below it. Models are calibrated across levels.
- **Steal:** specify the macro variables as such a tree. It doubles as the spec of what a microstate must sum to.
- Sources: [RAND MR-1004](https://www.rand.org/pubs/monograph_reports/MR1004.html)

**Dynamic LOD for urban agents, and the mesoscopic level** (Navarro, Flacher & Corruble 2011; Navarro et al. 2013).
- **What:**
  - Agents are aggregated into groups by an affinity over both their external and internal (mental) state.
  - Quality is measured as dissimilarity from a full-detail run.
  - An intermediate group level lets transitions happen in steps.
- **Steal:** cohorts (same employer, same route, same building) as what is kept after the player leaves; dissimilarity from full detail as a CI metric.
- Sources: [HAL 2011](https://hal.science/hal-01288047) · [HAL 2013](https://hal.science/hal-01559195)

**Surveys and platforms** (Morvan 2012; Morvan & Kubera 2017; GAMA; Gil-Quijano et al. 2012).
- **What:**
  - Morvan: multi-level ABM addresses three problems: interaction across levels, coupling different kinds of model, and dynamic LOD.
  - Morvan & Kubera: influence/reaction scheduling makes updates across levels independent of order.
  - GAMA has capture, release and migrate statements for moving agents between levels, but leaves open what state survives the move.
  - Gil-Quijano et al.: in one model, a dormant tumour core becomes a single agent that interacts only at its border.
- **Steal:** influence/reaction scheduling (compute all influences from the start-of-tick state, then apply them); defining exactly what survives a relax; a dormant district as one agent that interacts only at its border.
- Sources: [Morvan](https://arxiv.org/abs/1205.0561) · [Morvan & Kubera](https://arxiv.org/abs/1703.02399) · [GAMA multi-level](https://gama-platform.org/wiki/MultiLevelArchitecture) · [Gil-Quijano et al.](https://link.springer.com/chapter/10.1007/978-3-642-25920-3_45)

#### Coarse-graining and multiscale mathematics, as analogies

**Equation-free computing** (Kevrekidis et al. 2003; Kevrekidis & Samaey 2009).
- **What:** One coarse step is restriction ∘ (a short micro run) ∘ lifting, where lifting produces one of many consistent microstates.
  - Lifted detail starts out wrong. It must *heal* (relax until it depends only on the macro variables) before it can be trusted.
  - Projective integration takes large coarse steps estimated from short micro bursts.
  - The gap-tooth scheme and patch dynamics simulate micro detail only in small patches, each shielded by a buffer zone.
- **Steal:**
  - the API: `lift`, `heal` and `restrict`, with healing done while totals are pinned (unconstrained healing drifts them);
  - detailed regions as patches with an untrusted buffer ring;
  - catch-up as a short burst followed by a coarse jump.
- Sources: [Kevrekidis et al.](https://doi.org/10.4310/CMS.2003.v1.n4.a5) · [Review](https://doi.org/10.1146/annurev.physchem.59.032607.093610) · [Patch dynamics with buffers](https://doi.org/10.1016/j.jcp.2005.08.010)

**The heterogeneous multiscale method** (E & Engquist 2003; review 2007).
- **What:** A macro solver of known form whose missing data (fluxes, constitutive laws) come from small micro runs constrained to the local macrostate, run on the fly or precomputed. Compression and reconstruction satisfy QR = I.
- **Steal:** coarse rules as formulas with unknown coefficients (how vacancies respond, how commuting responds to distance), fitted per block archetype by short micro runs and cached. Focus areas are local defects in the method's terms; calibration is the global case.
- Sources: [E & Engquist](https://doi.org/10.4310/CMS.2003.v1.n1.a8) · [Review](https://web.math.princeton.edu/multiscale/review.pdf)

**Multigrid, the full approximation scheme and τ-correction** (Brandt 1977).
- **What:** Coarse levels fix smooth, large-scale error cheaply.
  - The full approximation scheme stores the whole solution on the coarse grid and adds τ = A_c(R u) − R A_f(u), so the coarse level reproduces what the fine level knows.
  - The fine state is updated by interpolating the coarse *change*; it is not overwritten.
- **Steal:** when detail relaxes, keep a per-cell τ (what the coarse model gets wrong about this place) and let it decay. When a warm cell is re-entered, apply the coarse change since you left instead of regenerating.
- Sources: [Brandt](https://doi.org/10.1090/S0025-5718-1977-0431719-X) · [FAS tutorial](https://arxiv.org/abs/2101.05408)

**Adaptive mesh refinement: subcycling and refluxing** (Berger & Oliger 1984; Berger & Colella 1989).
- **What:** Finer grids are overlaid where needed.
  - They take several smaller time steps per coarse step, then synchronise (subcycling).
  - Coarse cells on a coarse–fine border are corrected by the difference between their own flux and the summed fine fluxes (refluxing), so conserved quantities stay conserved.
- **Steal:** the seam rule. Every commuter, tonne of freight or megawatt that crosses a detailed region's edge is booked once, identically, in both ledgers. Detailed cells may subcycle; global couplings such as markets stay on coarse ticks.
- Sources: [Berger & Colella](https://doi.org/10.1016/0021-9991(89)90035-1)

**Adaptive resolution (AdResS), the quasicontinuum method and backmapping** (Praprotnik et al. 2005; Tadmor et al. 1996; Wassenaar et al. 2014).
- **What:**
  - AdResS: molecules change resolution as they cross a hybrid band. It needs a compensating force, because naive coupling piles up or depletes density at the edge.
  - Quasicontinuum: continuum mechanics refined down to atoms only near defects. The seam produces spurious "ghost forces".
  - Backmapping: coarse-grained configurations are turned back into atomistic ones by template placement followed by restrained relaxation.
- **Steal:**
  - a hybrid ring where agents gain or shed detail gradually;
  - watching for pile-ups at the edge of detail, and correcting them with a calibrated bias;
  - refining where something is happening, not only where the camera is;
  - a seam test: a steady city must stay steady across the boundary of a detailed region;
  - two-phase lifting: templates first, then constrained relaxation.
- Sources: [AdResS](https://doi.org/10.1063/1.2132286) · [Quasicontinuum](https://doi.org/10.1080/01418619608243000) · [Going backward](https://doi.org/10.1021/ct400617g)

**Coarse-grained stochastic lattices** (Katsoulakis, Majda & Vlachos 2003; Trashorras & Tsagkarogiannis 2010).
- **What:**
  - Coarse Monte Carlo dynamics on block occupation counts, derived from the micro rules so that fluctuations come out right, not just averages.
  - Micro configurations are reconstructed from distributions close, in relative entropy, to the equilibrium conditioned on the coarse data.
- **Steal:** give unobserved cells seeded noise of the right size. A coarse model that evolves only means makes every revisited area regress to the same bland average.
- Sources: [PNAS 2003](https://doi.org/10.1073/pnas.242741499) · [SIAM 2010](https://doi.org/10.1137/080722382)

**Lumpability and Mori–Zwanzig** (Kemeny & Snell 1960; Zwanzig 1961; Mori 1965).
- **What:** Grouping a Markov chain's states gives an exact Markov chain at the coarse level only if every state in a group has the same probability of jumping into each other group. Otherwise the exact coarse dynamics need a memory term and a noise term.
- **Steal:**
  - A lumpability test during development: lift many microstates for one macrostate, run one tick, and compare the macro outcomes. Their spread measures the hidden state the coarse level is missing.
  - The fix: a few history variables per cell (trend, age, recent shocks) plus seeded noise.
- Sources: [Lumpability](https://en.wikipedia.org/wiki/Lumpability) · [Chorin, Hald & Kupferman](https://doi.org/10.1016/S0167-2789(02)00446-3)

**Maximum entropy and I-projection** (Jaynes 1957; Ireland & Kullback 1968; Csiszár 1975).
- **What:** When only macro constraints are known, the least-biased distribution is the maximum-entropy one. More generally (I-projection), choose the distribution closest in KL divergence to a prior among those that meet the constraints. IPF computes exactly this for tables with fixed marginals.
- **Steal:** lifting is a seeded sample from the I-projection of a regional style prior onto the cell's totals. When the totals move, I-project the retained microstate onto the new totals. That is the smallest change consistent with the new macrostate.
- Sources: [Jaynes](https://doi.org/10.1103/PhysRev.106.620) · [Ireland & Kullback](https://doi.org/10.1093/biomet/55.1.179) · [Csiszár](https://doi.org/10.1214/aop/1176996454)

#### Synthetic populations and spatial microsimulation

**Quasirandom integer sampling (QIWS)** (Smith, Lovelace & Birkin, JASSS 2017).
- **What:** Builds a population directly from integer marginals by sampling without replacement, so that each draw decrements its category. The marginals therefore match exactly by construction. It needs no seed sample and no iteration, and it lands close to maximum entropy.
- **Steal:** this is the closest published match to "instantiate a microstate from a macrostate".
  - Split a parent's integer totals among its children the same way, so the children always sum to the parent.
  - Subtract pinned households from the marginals and synthesise only the rest.
  - Use hash-keyed draws instead of Sobol sequences, so each cell can be reproduced on its own.
- Sources: [Paper](https://www.jasss.org/20/4/14.html)

**Iterative proportional updating (IPU) and controls at several resolutions** (Ye et al., TRB 2009; Konduri et al. 2016; PopGen).
- **What:** Reweights sample households so that household-level and person-level totals both match, by sweeping through the constraints in turn. Later work accepts controls given at different geographic resolutions.
- **Steal:** this is exactly our nested case: households contain persons, and district contains block contains lot. Fix the sweep order for determinism, then integerise exactly.
- Sources: [Ye et al.](https://scag.ca.gov/sites/default/files/old/file-attachments/populationsynthesizerpaper_trb.pdf) · [Konduri et al.](https://doi.org/10.3141/2563-08) · [PopGen](https://github.com/foss-transportationmodeling/popgen)

**Iterative proportional fitting (IPF) and synthetic baselines** (Deming & Stephan 1940; Beckman, Baggerly & McKay 1996).
- **What:** Rescale a seed table's marginals in turn until they match known totals, then draw households to match the fitted table (as in TRANSIMS).
  - Cells that are zero in the seed stay zero.
  - Cost grows with the number of table cells, which grows exponentially with the number of attributes.
  - Person totals drift if only households are controlled.
- **Steal:** the principle: the least-surprising microstate given the macro marginals and a style prior.
- **Avoid:** full N-way tables over many attributes.
- Sources: [Deming & Stephan](https://projecteuclid.org/journals/annals-of-mathematical-statistics/volume-11/issue-4/On-a-Least-Squares-Adjustment-of-a-Sampled-Frequency-Table/10.1214/aoms/1177731829.full) · [Beckman et al.](https://econpapers.repec.org/RePEc:eee:transa:v:30:y:1996:i:6:p:415-429) · [Spatial Microsimulation with R, ch. 5](https://spatial-microsim-book.robinlovelace.net/smsimr) (2016)

**Truncate, replicate, sample (TRS) integerisation** (Lovelace & Ballas 2013).
- **What:** Truncate fractional weights, replicate the integer parts, then sample the remaining units in proportion to the fractional parts. Totals come out exact; the other marginals only approximately.
- **Steal:** turning a fitted macrostate into countable households, with the sampling keyed by hash. The toy uses a divisor method instead, which is exact and house-monotone for a single marginal.
- Sources: [arXiv](https://arxiv.org/abs/1303.5228)

**Entropy-maximising spatial interaction** (Wilson 1967).
- **What:** The most probable trip matrix, given origin totals, destination totals and a budget for total travel cost, has the form T_ij = A_i O_i B_j D_j exp(−β c_ij). It is solved by alternating proportional updates.
- **Steal:**
  - home-to-job and goods flows inside a lifted cell that are consistent with its totals;
  - the same formula as the coarse flow model, so the levels agree;
  - β as a knob players can see: how far people will travel.
- Sources: [Wilson](https://www.semanticscholar.org/paper/A-statistical-theory-of-spatial-distribution-models-Wilson/2f8308996a9bf467ad7548fcdd357504938c2ad6)

**Multi-level fitting and generative synthesis** (Müller & Axhausen 2012; Farooq et al. 2013; Sun & Erath 2015; Borysov, Rich & Pereira 2019).
- **What:**
  - Müller & Axhausen unify IPU and hierarchical IPF as generalised raking, whose theory says when constraints are infeasible.
  - The others use MCMC, Bayesian networks or variational autoencoders to learn the joint distribution of attributes and sample varied agents. They match marginals only statistically.
- **Steal:** a small hand-written Bayesian network as the style prior, followed by exact integer fitting.
- **Avoid:** neural models inside the simulation loop (weight files, floating-point nondeterminism).
- Sources: [Müller & Axhausen](https://www.research-collection.ethz.ch/server/api/core/bitstreams/83669863-8055-4c33-85cd-bfaf1310d2ea/content) · [Farooq et al.](https://transp-or.epfl.ch/documents/technicalReports/FaroBierHurtFloe_PopSyn2013.pdf) · [Borysov et al.](https://orbit.dtu.dk/en/publications/how-to-generate-micro-agents-a-deep-generative-modeling-approach-)

#### Constraint-based and conditional generation

**Chunked wave function collapse (WFC) that doesn't depend on generation order** (Boris the Brave 2021; marian42 2023).
- **What:**
  - Boris the Brave uses four layers of blocks, each offset by half a block. Each block depends only on a fixed, finite set of blocks in the layer before, so any block can be generated alone, in any order, with the same result.
  - marian42 starts from pre-generated patches whose edges already match, then regenerates at an offset to hide the seams.
- **Steal:** the answer to "neighbours lifted in any order must agree".
- **Avoid:** backtracking across a growing frontier, which makes content depend on the order the player explored in.
- Sources: [Infinite modifying in blocks](https://www.boristhebrave.com/2021/11/08/infinite-modifying-in-blocks/) (8 Nov 2021) · [Infinite WFC](https://marian42.de/article/infinite-wfc/) (20 Jun 2023)

**Model synthesis and WFC** (Merrell 2007, 2021; Gumin 2016; Karth & Smith 2017).
- **What:** Constraint propagation over a lattice, learned from an example. Model synthesis solves block by block, so failures stay local. Merrell calls WFC two versions of the same algorithm. WFC guarantees local adjacency but not global counts, and restarts on a contradiction.
- **Steal:** bitset domains and propagation, which are cheap in TypeScript; solving one block at a time.
- Sources: [Model synthesis vs WFC](https://paulmerrell.org/wp-content/uploads/2021/07/comparison.pdf) · [WFC](https://github.com/mxgmn/WaveFunctionCollapse) · [Karth & Smith](https://escholarship.org/content/qt1f29235t/qt1f29235t.pdf)

**Wang tiles, direct stochastic tiling and complete tilesets** (Cohen et al. 2003; Lagae & Dutré 2005; Nie et al. 2023).
- **What:** Hash lattice coordinates to edge colours, so the tile at any position can be computed locally without storing the tiling. With a complete (or sub-complete) tileset, no sub-grid ever needs backtracking.
- **Steal:** make each cell's boundary state a pure function hash(seed, level, edge), then fill interiors independently; tileset completeness as an authoring check.
- Sources: [Wang tiles](https://dl.acm.org/doi/10.1145/1201775.882265) · [N-WFC](https://arxiv.org/abs/2308.07307)

**Hierarchical semantic WFC** (Alaka & Bidarra, FDG 2023).
- **What:** Abstract meta-tiles are fixed first and refined into concrete leaf tiles later.
- **Steal:** a natural fit for zoom. Coarse labels are the meta-tiles; relaxing drops the leaves and keeps the meta-tiles.
- Sources: [Paper](https://dl.acm.org/doi/10.1145/3582437.3587209)

**Grammars** (Stiny & Gips 1971; Wonka et al. 2003; Müller et al. 2006; Parish & Müller 2001).
- **What:**
  - Split grammars guarantee that the parts exactly tile their parent.
  - CGA shape adds scopes, repeats and context queries.
  - Procedural city generation separates global goals (density maps propose road segments) from local constraints (legality checks accept or fix them).
- **Steal:**
  - massing and megastructure bays by split rules chosen from macro attributes: the geometric counterpart of exact coarse-graining;
  - arterial roads grown in the coarse simulation, with local streets derived per block.
- **Avoid:** context queries across chunk boundaries, which make results depend on generation order.
- Sources: [Instant architecture](https://www.cg.tuwien.ac.at/research/publications/2003/Wonka-2003-Ins/) · [CGA shape](https://dl.acm.org/doi/10.1145/1141911.1141931) · [Procedural modeling of cities](https://dl.acm.org/doi/10.1145/383259.383292)

**Steering generators toward targets** (Talton et al. 2011; Ritchie et al. 2015; Smith & Mateas 2011).
- **What:**
  - Talton et al. (MCMC) and Ritchie et al. (sequential Monte Carlo) search over grammar derivations toward a high-level target.
  - Smith & Mateas use answer set programming, which enforces exact global constraints such as "exactly 12 dwellings", at NP-hard cost.
- **Steal:** offline tuning of generators toward target macro statistics; answer set programming for prototyping constraints and validating tilesets.
- **Avoid:** any of these at runtime.
- Sources: [Metropolis procedural modeling](https://doi.org/10.1145/1944846.1944851) · [Stochastically-ordered SMC](https://history.siggraph.org/learning/controlling-procedural-modeling-programs-with-stochastically-ordered-sequential-monte-carlo-by-ritchie-mildenhall-goodman-and-hanrahan/) · [ASP for PCG](https://www.researchgate.net/publication/224240207_Answer_Set_Programming_for_Procedural_Content_Generation_A_Design_Space_Approach)

**Exact downsampling consistency** (Bahat & Michaeli, CVPR 2020; Wang, Yu & Zhang, ICLR 2023).
- **What:**
  - Bahat & Michaeli: a consistency-enforcing module with no learned parameters guarantees that a super-resolved image downsamples exactly to its input.
  - DDNM does the same inside diffusion sampling, for any linear degradation, by generating only the part of the image the degradation can't see.
- **Steal (art):** "coarse-graining gives back the original" as the contract between sprite levels, enforced by a final projection whatever produced the image. Palette quantisation breaks exactness, so either use a discrete coarse-graining (majority colour) or alternate projection and clamping.
- Sources: [Explorable super-resolution](https://arxiv.org/abs/1912.01839) · [DDNM](https://arxiv.org/abs/2212.00490)

**Multi-scale generation** (Wang et al., Generative Powers of Ten, CVPR 2024; Menon et al., PULSE, CVPR 2020; RePaint 2022; CityDreamer 2024).
- **What:**
  - Generative Powers of Ten jointly denoises a zoom stack so that the scales agree where they overlap. Agreement is encouraged, not exact.
  - PULSE gets consistency only through a loss term, so it drifts.
  - RePaint-style inpainting keeps pinned pixels and regenerates the rest.
  - Unbounded-city generators go layout → buildings → appearance.
- **Steal (art):** joint stacks plus the exact projection above; inpainting for detail the player has touched; layout-first ordering, which is our macrostate-first ordering.
- Sources: [Powers of Ten](https://arxiv.org/abs/2312.02149) · [PULSE](https://arxiv.org/abs/2003.03808) · [RePaint](https://arxiv.org/abs/2201.09865) · [CityDreamer](https://arxiv.org/abs/2309.00610)

#### Deterministic keyed randomness

**Noise-based RNG** (Squirrel Eiserloh, GDC 2017), with **counter-based and splittable generators** (Salmon et al. 2011; Steele, Lea & Flood 2014; Jarzynski & Olano 2020).
- **What:** Replace stateful random-number generators with a function noise(position, seed). Draws can happen in any order, parallelise trivially and replay exactly.
  - Philox and Threefry where quality matters.
  - SplitMix for seed trees.
  - pcg3d as a fast 32-bit hash of (x, y, level).
- **Steal:**
  - Every random decision is hash(worldSeed, purpose, level, x, y, gen, k).
  - Mix each coordinate through the hash in turn; folding coordinates into one number linearly causes collisions.
  - Pin the hash with a golden-output test, so it can't change silently.
- Sources: [Noise-Based RNG](https://www.gdcvault.com/play/1024365/Math-for-Game-Programmers-Noise) · [Random123](https://www.thesalmons.org/john/random123/papers/random123sc11.pdf) · [SplitMix](https://dl.acm.org/doi/10.1145/2660193.2660195) · [Hash functions for GPU rendering](https://www.jcgt.org/published/0009/03/02/paper.pdf)

#### The renormalization group, as an intuition pump

**Block spins and flows** (Kadanoff 1966; Wilson 1971, 1975; Tong's lecture notes; Mehta & Schwab 2014; Koch-Janusz & Ringel 2018).
- **What:**
  - Replace each block of spins with a single block variable. The coarse system looks like the fine one, but with different parameters.
  - Those parameters change with scale and flow toward fixed points.
  - Relevant parameters grow under coarse-graining; irrelevant ones fade.
  - Many different micro models share one coarse behaviour (universality).
  - A learned coarse variable should keep the most information about distant surroundings (Koch-Janusz & Ringel).
- **Steal:**
  - Each level has its own parameters, fitted from the level below ("running couplings").
  - Classify micro detail as relevant (carried up into macro variables) or irrelevant (dropped on relax and regenerated from the seed).
  - Choose macro variables by how well they predict neighbours.
  - Stale regions flow toward their style's fixed point unless memory holds them off.
- Sources: [Kadanoff](https://doi.org/10.1103/PhysicsPhysiqueFizika.2.263) · [Wilson 1975](https://doi.org/10.1103/RevModPhys.47.773) · [Tong, Statistical Field Theory](https://davidtong.org/teaching/statistical-field-theory/) · [Mehta & Schwab](https://arxiv.org/abs/1410.3831) · [Koch-Janusz & Ringel](https://arxiv.org/abs/1704.06279)

---

## Part 2. Proposal for the layered engine

### 2.1 The contract between levels

Every level has a macro type and a micro type, plus four operations:

```ts
interface Level<Macro, Micro> {
  lift(cell: CellKey, macro: Macro, genome: Genome, memory: MemoryRecord[], seed: number): Micro; // deterministic
  heal(micro: Micro, macro: Macro, ticks: number): Micro;   // short relaxation with totals pinned
  restrict(micro: Micro): Macro;                             // sums, weighted means, modes or histograms, boundary fluxes
  step(macro: Macro, boundary: Fluxes, dt: number): Macro;   // this level's coarse rule
}
```

These invariants are checked in tests, and cheaply at runtime:

1. **Consistency.** restrict(lift(x)) = x, exactly for extensive and categorical variables and within a tolerance for intensive ones.
2. **Determinism.** Lifting depends only on its arguments. There is no stateful random-number generator, and generators are versioned and append-only.
3. **Stability.** A small change in x makes a small change in lift(x). This comes from house-monotone apportionment and slot-keyed identities.
4. **Conservation at seams.** Anything crossing a boundary between cells at different levels is booked once, identically, on both sides.
5. **Order independence.** Lifting neighbours in any order gives the same result. This comes from boundary state that is a hash of the edge, and from influence/reaction updates.
6. **No observer bias.** On average, a region's coarse trajectory doesn't depend on whether anyone watched it. CI checks this statistically.

### 2.2 The hierarchy of cells

The lattice is (x, y, level).
- **Horizontally,** cells nest 4× per side.
- **Vertically,** coarse cells carry a profile over strata, the player-named bands that the report recommends.
- **Detail follows the cutting plane:** only the active level and its neighbours are lifted.

The sizes below are placeholders.

| Cell | Extent | In a 1024² world | Reads on screen as | Runs when |
|---|---|---|---|---|
| Region | 256×256 tiles, all levels | 16 | a landscape: coast, ridges, trunk lines, a dozen dark or pale blocks | always (monthly tick) |
| Superblock | 64×64 tiles, profile over strata | 256 | from far away, one city block (the Blade Runner 2049 reading) | always |
| Block | 16×16 tiles × one stratum | 4,096 per stratum | streets, massing, shafts and voids | near the player or recently visited; bridged on return |
| Lot | 4×4 tiles × the structure's levels | 65,536 per stratum | one building or megastructure bay | live or warm |
| Building | per-level slabs of one structure | — | floors, flats, shops, corridors, conveyors | live, on the active level ± 1 |
| Interior | rooms, units, agents | — | households, workers, drones, walkers | live, on screen |

Why these cuts:
- the superblock is the unit players read at landscape scale;
- the block is the unit of streets and redevelopment;
- the lot is the unit of the genome (one structure, one generation counter);
- everything below the lot can be regenerated.

### 2.3 Macrostate variables

Each variable has a type that decides how it restricts, and that also decides how it is lifted.

| Type | Restrict by | Lift by | Examples |
|---|---|---|---|
| Extensive | sum | integer apportionment or iterative proportional updating (IPU), within capacities | households; residents; jobs by sector; floor area by use; service capacity (school seats, clinic beds); power and water demand; goods produced and consumed; construction backlog |
| Intensive | weighted mean | seeded offsets that sum to zero around the mean, then heal | land value, pollution, noise, daylight, crime, upkeep, happiness |
| Categorical | mode, or a small histogram | sample from the histogram, fitted exactly | style and palette (bare brutalist, brutalist with plants, clean white underground, gritty industrial); zoning tier; culture; distributions of building height and household size |
| Flow | sum over the coarse boundary; internal flows become throughput | flux accumulators and reconstruction (queues, potential fields) | commuters, freight, water, power, data, waste; traffic per portal with its travel time; vertical flows through lifts and shafts |
| History | kept at the coarse level | conditions lifting and history bridges | founding year, histogram of building ages, growth trend, recent shocks, bounded event log, τ |
| Genome | none (it is the seed of the level below) | read directly | per lot: generation counter, tier, build year, kind override, generator version; per edge: boundary hash |

Roughly, per level:
- **Region:** demand by sector; migration balance; trade with other regions; trunk capacity (power, water, freight); climate; the style prior (the regional mix of looks).
- **Superblock:**
  - the extensive totals, intensive means and style histogram;
  - a vertical profile: floor area, void fraction and population per stratum;
  - portal flows and history.
- **Block (per stratum):** the same, at a finer scale, plus the genome of its 16 lots and its voids. Shafts, hangars and halls spanning several levels are block-level features that cross strata; they are stored as "void" entries in the profile.
- **Lot and below:** microstate only (regenerable), apart from memory records.

History variables matter more than they look. Coarse dynamics that carry only means drift toward the average (see Mori–Zwanzig and Katsoulakis in Part 1). So every coarse cell keeps a trend, an age mix, recent shocks, and seeded noise of the right size.

### 2.4 Coarse dynamics and coupling

| Level | Tick | Rule (fun first, then plausible) |
|---|---|---|
| Region | month | demand from the regional economy and trade; migration in and out; trunk capacity; disasters |
| Superblock | month (a week near the player) | growth toward a capacity set by zoning and style; land value diffusing from neighbours and amenities; service supply matched to demand with an entropy-maximising gravity model; congestion from a macroscopic fundamental diagram; utilities as capacity-limited network flows; styles spreading like fashion, weighted by land value; events: fires, projects, protests |
| Block | a week, or a day when active | occupancy and vacancy; redevelopment, infill, abandonment and fire as edits to the genome; arterials as first-in, first-out queues; updates to the vertical profile |
| Lot and building | a day, live only | households moving in, out and between flats; shops opening and closing; upkeep; drones building blueprint steps |
| Interior | real time, on screen only | agents with schedules and paths |

How levels couple:
- **Down.** A coarse level hands its children integer targets and boundary fluxes: "12 households arrive this month", "40 cars an hour cross the east portal". The children realise them exactly.
- **Up.** Restriction updates the parent, and boundary fluxes are refluxed. A detailed child also reports data the coarse rule is missing, such as the observed travel time on its links (the heterogeneous multiscale method's missing data; Mezzo's virtual links).
- **τ-correction.** While a cell is detailed, record the gap between what the coarse rule predicted and what restriction delivered. When the cell relaxes, keep τ and let it decay. The coarse model then keeps behaving like the fine one did there for a while.
- **Time.** Detailed cells subcycle (several fine ticks per coarse tick) and synchronise at coarse tick boundaries. City-wide couplings such as demand and prices only move on coarse ticks.
- **Order.** Compute all influences from the start-of-tick state, then apply them (influence/reaction). The toy already does this for migration.
- **Calibration.** Fit the coarse coefficients offline, per block archetype, by lifting samples and running short micro bursts (equation-free computing, the heterogeneous multiscale method). These are the "running couplings": each level's parameters come from the level below.

### 2.5 Downscaling: instantiating a microstate

The lift pipeline for one cell is deterministic from end to end:

1. **Key.** seed = hash(worldSeed, level, x, y, stratum, gen, generatorVersion, purpose, k). The randomness is stateless and keyed, so any cell can be lifted in any order, on any machine.
2. **Structure,** from the genome:
   - massing by split grammar;
   - streets, walkways, pipes and conveyors by wave function collapse (WFC) over a complete tileset, with each boundary fixed by hash(edge), so neighbours agree without communicating.
3. **Capacities,** from the structure: flats, workplaces, seats, beds.
4. **Constraints.** The macro totals, minus whatever memory pins: followed families, remembered tenants, authored buildings.
5. **Fit.** Integer allocation of households and jobs to the capacities.
   - For a single marginal: a house-monotone divisor method (what the toy uses).
   - For joint household and person constraints: IPU followed by exact integerisation, or QIWS-style sampling without replacement.
   - Attributes come from a regional style prior. In I-projection terms, the result is the least surprising given the totals.
6. **Identities.** Slot-keyed: household k in lot l at generation g always has the same name and traits (as in Rain World). Adding one household to a block adds one household to one building without reshuffling the rest.
7. **Heal.** A few ticks of micro relaxation with the totals pinned: families of six move out of studios, shops move toward footfall, overlaps are resolved.
8. **Verify.** Check restrict(result) = macro. On failure, fall back lot by lot to a conservative template. The art pipeline's `project_fallback` makes the same move.
9. **Commit.** Record the observation (first look, time of lift) for salience and for the "while you were away" card.

In the toy, this pipeline takes about 2 ms in Chrome on this Mac for its largest block: 1,116 households, 2,692 residents and 768 jobs.

### 2.6 Upscaling: restriction

- **Aggregate** each variable by its type: sum extensive ones, take weighted means of intensive ones, and take the mode or a histogram of categorical ones. Sum fluxes across the parent's boundary, and record internal flows as throughput.
- **Bake** structural change into the genome: a demolition, a new tower, a park the city no longer remembers you made.
- **Extract memory.** Anything salient becomes a record (§2.8). Everything else is irrelevant detail in the renormalization-group sense, and is dropped.
- **Store τ,** and the snapshot that the "while you were away" card will compare against.
- **Keep or drop** the microstate: keep it in the warm cache, or discard it.

### 2.7 Catching up on re-entry

The region and superblock levels never stop, so the macrostate is always current. What is missing on re-entry is the history of the levels in between. There are three cases:

1. **Warm cell** (the microstate is still cached). Apply the coarse change since you left, as multigrid does, instead of regenerating: add arrivals, remove leavers, apply genome events. Identities survive.
2. **Cold cell whose own level kept running** (the toy's case). Lift from the current genome and macrostate. The event log already holds the dated events.
3. **Cold cell whose level was dormant** (only its parent ran). Build a **history bridge**, then lift. The bridge samples the cell's events over the gap, conditioned on both end states. For example, if the parent grew 20% and its tier rose:
   - allocate the growth among the children by attractiveness;
   - date the redevelopments within the gap;
   - pick the affected lots by hash, protecting salient ones.

   A Brownian bridge is the mental model: a path sampled to fit both endpoints.

Rules that keep catch-up plausible and fun:
- **Bounded change.** How much changes grows sublinearly with the length of the absence, with caps, as in idle games.
- **Cosmetic neglect first.** Grime, vines over concrete, closed shutters. This fits the brutalism-plus-plants mood: districts that relax literally overgrow.
- **Consent or a story.** Irreversible loss of something the player cares about needs either their consent or a story (Animal Crossing's lesson).
- **Causes after the fact.** The narrative layer invents causes from the cell's state and writes them back, so later lifts and the digest agree (Caves of Qud's method).
- **Long absences** use coarse projective integration: short micro bursts, then large coarse steps.

### 2.8 Retention: salience, deltas and relaxation

**Salience** belongs to each record. It is a sum of weighted signals, each with its own half-life:

| Signal | Weight | Half-life |
|---|---|---|
| The player edited it (built, cleared, added floors) | high | 10–20 game years |
| The player named it | high | 20 years |
| The player listed it | pinned | never |
| The player pointed at it in speech ("this one") | medium | 5 years |
| The player inspected it or zoomed deep into it | low, cumulative | 2–5 years |
| Time on screen (like Minecraft's `InhabitedTime`) | low, cumulative | 2 years |
| Unique or a landmark: tallest, oldest, only one of its kind, a shaft through six strata | medium | slow |
| Appears in the history, a digest, rumours or quests | medium | as long as it's cited |
| Built or planned by an agent | medium-high | 10 years (agents refer back to their own work) |
| One hop from something salient: the family of a followed household, the neighbours of a listed building | a fraction of the parent's | the parent's |
| Expected return (from the LOD trader): near the player's usual haunts | multiplier | — |

**Tiers:**
- **Pinned:** listed buildings and followed families. The player can see how many there are, and the cap is small. Never evicted.
- **Records:** small deltas over the seeded generation: names, structural edits, snapshots of tenants you looked at, authored buildings. Saved.
- **Warm cache:** whole microstates of recently seen cells. Bounded, never saved.
- **Cold:** genome, macrostate, history and τ only.

**Record format.** Also append each record to the command log, so a replay reproduces memory:

```ts
interface MemoryRecord {
  cell: CellKey; gen: number;            // tied to one generation of one lot: redevelopment retires it
  kind: 'name' | 'list' | 'edit' | 'tenants' | 'follow' | 'authored' | 'art';
  payload: unknown;                      // the delta itself: a name, extra floors, a tenant list, a sprite hash
  author: 'player' | 'agent';
  salience: number; lastTouched: GameTime; bytes: number;
}
```

**Relaxation schedule:**
- A cell goes from live to warm as soon as it leaves view.
- It goes from warm to cold after a few game years unseen, or earlier under cache pressure; eviction takes the least recently seen first, then the shortest-lived.
- Records decay by their half-life unless reinforced.
- Over budget, the record with the lowest salience × chance of return is evicted.

**Forgetting bakes.** The structure moves into the genome and the metadata goes. The forgetting shows in the world ("nobody calls it Ilse's Kiosk any more") instead of as a silent reset; that is No Man's Sky's lesson.

**Budgets keep this bounded by construction:**
- the genome and macrostate are a fixed size per cell;
- records are capped per region and globally;
- the warm cache is capped by count and by bytes;
- followed families and listings have small caps that the player can see. The toy uses 20 records, 5 families and 6 listings.

Memory therefore grows with what the player cared about, not with how far they wandered (unlike Minecraft).

### 2.9 Compute, memory and what runs where

The engine is TypeScript, deterministic and able to run headless, as the report recommends, so the same simulation runs in the browser and in Node.

| Where | What | Budget to start with |
|---|---|---|
| Main thread | LOD selection (add detail once the camera settles, drop it as soon as an area leaves view, with hysteresis); rendering; input | LOD pass under 0.5 ms per frame |
| Sim worker | coarse ticks for every region and superblock; block ticks within the active radius; live micro | coarse: every cell, under 1 ms per tick (the toy's 48 blocks: 0.16 ms per simulated year); live micro: at most 16 blocks at full rate, about 4 ms per frame |
| Lift worker pool | lift, heal and verify; prefetch along the camera's path | under 20 ms per block, off the main thread |
| Agent host (Node, Agent SDK) | queries at any level; lifts inside sandboxes and projections (the agent-kit's `sandbox()` and `project()`), never in the player's live state | lifts on request |
| Art generator (separate process) | zoom art keyed by genome, cached by salience | in the background, cancellable |
| Save file | genome, macrostate, history, τ, records and command log; never the warm cache | genome about 4 bytes per lot (256 KB per stratum of a 1024² world); records capped at about 1 MB |

The replay log must include LOD changes and their timing. When detailed cells decide who crosses a seam, what the player looked at becomes an input to history (see §2.14, question 1).

### 2.10 Agents and pointing across levels of detail

- **Pointing resolves at the level where you pointed.**
  - At landscape zoom, a pin is a superblock ref, described with macro facts.
  - At close zoom, it's a lot, a household or a conveyor.
  - The adapter writes the description at the matching level (`describeRef`).
  - Pointing in speech ("this family", "that district") is a strong salience signal, so deixis promotes.
- **Agent views work at several resolutions.** `summary()` and `viewRegion()` take a level: superblock tables, block maps with rulers, lot detail. This matches the glance, card and focused views planned in the research notes. The agent reads coarse numbers cheaply and asks for a lift only when it needs detail.
- **Agent lifts are sandboxed and deterministic.** Lifting is a pure function of genome, macrostate and memory, so the agent sees the same microstate the player will see, without committing it or bloating memory. An agent's look counts toward salience only if it then acts.
- **Agents can act at any level.**
  - Coarse acts (rezone a superblock, set a style parameter, route a trunk line) are telegraphed as ghost macro targets on the map.
  - Fine acts run their dry run on a sandboxed lift.
  - Plat selectors can name cells at any level.
- **Agents are observers.** Interest management treats an agent's cursor and gaze like the player's: a district an agent is working in stays live, and its gaze visibly pulls detail in.
- **Agents remember their own work.** Structures they author become records with author `agent`, so "the vertical farm I built for you in C4 last spring" stays true.
- **Agents narrate.** A small model (Haiku, in the agent-kit's role table) writes the digest and the rumours from the event log. They are grounded in logged events, so they never invent facts. Verification checks in forked projections (`project()`) can run cheaply at the coarse level.

### 2.11 The fun angle

- **"While you were away."** On re-entry, a card (or a letter, or the in-game paper) shows the change in households and land value, the three most notable events with dates, and what happened to things you care about. The toy has this card.
- **Rumours from coarse districts.** They are generated from real events in cells you aren't watching. Go and look, and what you heard is there, because the lift reads the same history. Rumours pull the player across the map.
- **Listing as a mechanic.** A few heritage slots: a listed building is protected from redevelopment and never forgotten. The memory budget becomes a choice about what your city keeps.
- **Following people.** Adopt a family. They keep living wherever they go (babies, moves, a grown child leaving), like the Nemesis system but gentler.
- **First look.** The first lift of a place is an event. The first deep zoom into a building generates its interior, and the game can say so.
- **Visible memory.** Districts you haven't visited for decades overgrow and weather; places you love stay crisp. Detail and memory become part of the aesthetic rather than a hidden optimisation.
- **The Blade Runner reveal, earned.** From far away, a superblock is a single block, because its picture is the coarse-graining of its towers.
- **Archaeology.** Forgotten names survive in rumours and on plaques, and a demolished tower still appears in the history panel.

### 2.12 The art side: one contract for sprites and simulation

The multires workstream (`stratum/sc2k/multires/tools/`) already treats sprites this way. Its `rg.py` defines:
- coarse-graining C_s in two modes: `mode` (the most frequent palette index per s×s block, which is palette-exact) and `box` (mean linear colour, used for perceptual scores);
- a `consistency` score;
- `project()`, the minimal recolouring that makes a zoomed-in sprite coarse-grain back to the original exactly;
- `project_fallback()`, for blocks where that fails.

That is the simulation's lift, verify and fallback, done in pixels.

| | Simulation | Art |
|---|---|---|
| Lift | seeded instantiation fitted to totals | zoom-in generation (MMPX, EPX, diffusion) |
| Restrict | sum / mean / mode | `box` mean / `mode` |
| Invariant | restrict(lift(x)) = x | C_s(zoom(sprite)) = sprite |
| Repair | fit and heal with totals pinned | `project()`, `project_fallback()` |
| Key | hash(seed, cell, gen, generator version) | the same key |
| Retention | memory records by salience | cached deep zooms by salience |

Proposals:
- **Shared keys.** Key generated art by the same genome key as the building it depicts. Redevelopment (gen + 1) then retires both at once, and art regenerates on demand like any other microstate.
- **One salience ledger for both.** Deep zooms are an attention signal, and cached zoom art is a record kind (`art`) with a byte cost in the same budget.
- **Consistent far views.** Make a block's coarse picture the coarse-graining of its lots' pictures, or generate it and then project it to consistency. The toy does the first literally: its single-tone block is the average of its lot tones. Either way, check the invariant.
- **Categorical variables coarse-grain by mode in both systems.** The style histogram at superblock level is then exactly what the art pipeline needs to pick a palette for the far view.
- **The SC2K sprites are the cheap testbed** for the art contract, and that work is already underway. The contract itself carries over to the new engine's kit-rendered sprites.

### 2.13 What the toy shows

[`notes/multiscale-toy.html`](multiscale-toy.html) is one self-contained file. Open it in any browser; it contains no Maxis art.

- **Coarse simulation everywhere.** 8×6 blocks, each with a 16-lot genome, are always simulated coarsely:
  - households drift to better neighbours, arrive and depart;
  - jobs follow nearby labour, and land value diffuses;
  - redevelopment, infill, abandonment, fire and rezoning edit the genomes.
- **Lifting.** Click or zoom into a block and it is lifted into buildings, named households of various sizes, and jobs, whose totals match exactly (Webster apportionment, slot-keyed identities).
- **Conservation checks.** Every year the ledger checks macro against Σ micro, and the city's books (start + in − out = now).
- **Seams.** When households cross between a detailed block and a coarse one, the detailed side chooses who moves and the coarse side receives exactly those households. Inside live blocks, households also change flats, which is invisible at block level.
- **Relaxation.** Zoom out and blocks go warm (cached). They relax to coarse after three unseen years, or sooner when the cache is full. Lifting again gives the same streets and buildings, updated.
- **Memory.** Naming, listing, adding floors, clearing for a park, following a family, or just clicking a lot each creates a memory record with salience. Records are shown against a 20-record budget, decay 15% a year unseen, and are forgotten or baked into the genome when over budget.
- **Stories.** Rumours come from blocks you aren't watching, and a "while you were away" card appears on re-entry.
- **LOD.** Detail is added once the camera settles and dropped as soon as a block leaves view, with hysteresis: lift at 250 px per block, drop below 188 px.

I checked it headlessly (puppeteer-core with Chrome):
- 400 random operations (zooms, clicks, edits, follows, years) over 350 simulated years, with no conservation errors;
- lifting is deterministic;
- no console errors;
- no horizontal scroll at 390 px wide.

Not in the toy: intermediate levels and history bridges (the block level runs everywhere), vertical levels, traffic, τ, agents and art.

### 2.14 Open questions

1. **Who leads at seams?**
   - In the toy, the detailed side decides who crosses, so history depends on where the player looked. It is still deterministic, given the log of views.
   - The alternative is "coarse leads": coarse fluxes are authoritative, and fine cells realise them exactly. That is a subset-sum problem on household sizes, solvable by letting individuals move between households.
   - Leaning: coarse leads for city-scale aggregates and fine leads for local detail, plus an observer-bias test.
2. **Which macro variables?** Pick them by prediction: the variables that best predict the neighbours and next year's restriction (Koch-Janusz & Ringel's criterion). The lumpability test measures what's missing.
3. **Vertical coarse-graining.**
   - Do strata split at the same level as blocks, or is the vertical profile enough until the active level?
   - How do shafts and halls spanning several levels (block-level voids) interact with per-stratum cells?
4. **Agents crossing LOD boundaries** (walkers, drones, freight). Flux accumulators are fine for anonymous flows. Salient individuals need their identity handed over, like S.T.A.L.K.E.R.'s online/offline record.
5. **Generator versioning.** When a generator improves, lots nobody remembers change on their next lift. Accept that, since they are irrelevant detail, or pin generator versions per lot in the genome, at a byte per lot?
6. **How visible is memory?** The toy shows the budget. Should the game? A visible budget turns retention into gameplay (listing slots), but it exposes the machinery.
7. **Should the warm cache be saved** for the area around the player, for instant reload? Probably yes, for the current view only.
8. **Where does the art cache live, and how big is it?** Deep-zoom art is expensive to regenerate. The byte budget for `art` records needs numbers from the multires workstream.
9. **Bridges between neighbouring dormant cells** must agree on the fluxes between them. Solve the fluxes at the parent level first, then bridge each child independently, given its boundary.
10. **Multiplayer later.** Several observers share one interest-management system. Is salience per player, or shared?
11. **The budgets are guesses** until a world with a million households has been profiled.

### 2.15 Phased path

| Phase | Build | Done when |
|---|---|---|
| 0. Toy (done) | `notes/multiscale-toy.html`: two levels, conservation, memory, relaxation, rumours | You've played with it and marked what feels right or wrong |
| 1. Lifting kernel (2–3 days) | A TypeScript module in the new engine: typed variables (extensive, intensive, categorical, flow, history); keyed hash RNG with a golden test; divisor apportionment and IPU; restrict; verify; memory records | Property tests pass: restrict∘lift = identity, determinism, house-monotonicity, order independence, save/load round trip |
| 2. Vertical slice on the lattice (1–2 weeks) | Superblock → block → lot, with levels; queue links between blocks and a macroscopic fundamental diagram per superblock; flux accumulators at seams; τ-correction; history bridges for dormant blocks; detail following the cutting plane | CI runs the lumpability, seam and observer-bias tests; plan and section views show live, warm and cold cells |
| 3. Agent integration (about 1 week) | The agent-kit adapter at several resolutions: `summary()` and `viewRegion()` by level; coarse pointer refs; sandboxed lifts; authored records; digest and rumour narration on Haiku | A live agent turn plans at superblock level, zooms into one block to place a building, and the digest mentions it a year later |
| 4. Art contract | Render LOD from coarse-graining; zoom art keyed by genome; a salience ledger and byte budget shared with the multires work | A block's far view is the coarse-graining of its near view, and redevelopment retires both |
| 5. Scale and save | A world with a million households; budget tuning; predictive lifting; saves; absences of 100 years | Frame and tick budgets hold; saves stay under a few MB; a century away reads as a story |

Cheap experiments in the SC2K fork, before or alongside Phase 1. None of them needs levels.
- **A "while you were away" digest from the headless simulation.** Run a city with `tools/sim.sh --days N --dump`, diff the JSON states, and have Haiku write the digest and a few rumours from the diff. This tests the narration and the tone of the rumours without any multiscale machinery.
- **Salience signals.** Through the agent bridge, log what the player points at, inspects and zooms into, and set the salience weights from real play.
- **Sprite consistency.** Already underway in `sc2k/multires`.
