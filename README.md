# Spall

*Working title; it was "Stratum".* Spall is what concrete does when the steel inside it rusts and swells: it breaks away from within.

A pixel-art isometric megastructure builder. The setting is an ancient arcology failing under its own weight and complexity. You work in it with agents and a swarm of robot workers, raising new structure and keeping the old alive a little longer. Cables, ties, posts and girders hang across open voids. Live lighting reaches down through the gaps. You can cut through the stack at any level.

## Run it

```bash
python3 -m http.server 5190 --bind 127.0.0.1 --directory experiments
```

Then open http://127.0.0.1:5190/stratum-wires/stratum.html. The game is plain JavaScript in `experiments/stratum-wires/src/`, concatenated into `stratum.html` by `experiments/stratum-wires/build.sh`.

## What's where

| Folder | What it is |
|---|---|
| `experiments/stratum-wires/` | **The current prototype.** Physics cables with sliding ties, girders, posts, demolish, live lighting (sun, sky, occlusion, mist, shafts), birds, a 64×64×30 world, presets and save slots. |
| `experiments/stratum-wires/mockups/` | Concept pages: `ui.html` (UI chrome concepts with a code mixer), `hires.html` (1× vs 2× fidelity), `light.html` (lighting studies), `index.html` (cable looks). |
| `experiments/stratum-multimodal/` | A fork with talk, point and sketch input. Voice via Web Speech; pixel ink anchored in 3D; one timeline. `notes.html` has the findings. |
| `experiments/agent-chat-reference/` | Art reference: a sidebar full of agents and bots talking, some in symbolic languages. |
| `experiments/megastructure-layers/` | The original layer-view prototype, the touchstone for the look. |
| `experiments/lines-and-voids/` | A rejected renderer study. `tools/cdp.mjs` is the headless-Chrome screenshot and test tool everything else uses. |
| `experiments/concept-renders/` | Blender kit-of-parts renderer, concept renders and the accretion time-lapse (needs Blender). |
| `experiments/agent-buildings/` | Building types an agent designed from requests. Uses `concept-renders/`. |
| `experiments/ui-mockups/` | Early game-screen mock-ups composited over renders. |
| `concepts/aesthetics/` | Aesthetic studies built from the kit renders. |
| `notes/` | Design notes: megastructure, multiscale simulation, creative brief. |

## Not in git

Everything in this folder is committed except:

- `node_modules/`, `__pycache__/`, `*.pyc`, `.DS_Store`: rebuildable.
- **Any folder named `local/`**, wherever it is. Put big or throwaway artifacts there: long recordings, render dumps, scratch exports. The project lives in Dropbox, so those files are still synced; they just aren't versioned.

A pre-commit hook refuses files over 20 MB and says to move them into a `local/` folder. It lives in `.githooks/`; enable it in a fresh clone with `git config core.hooksPath .githooks`.

## History

Split out on 28 Oct 2026 from the earlier Stratum folder. That folder continues as a separate SimCity 2000 project: the SC2K fork, the Micropolis agent, the SC4 probe, the agent kit, the voice gateway and the original research report. Nothing from it, and no Maxis or other third-party game assets, is in this repository.
