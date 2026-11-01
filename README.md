# Spall

*Working title; it was "Stratum".* Spall is what concrete does when the steel inside it rusts and swells: it breaks away from within.

A pixel-art isometric megastructure builder. The setting is an ancient arcology failing under its own weight and complexity. You work in it with agents and a swarm of robot workers, raising new structure and keeping the old alive a little longer. Cables, ties, posts and girders hang across open voids. Live lighting reaches down through the gaps. You can cut through the stack at any level.

## Run it

```bash
python3 -m http.server 5190 --bind 127.0.0.1 --directory experiments
```

Then open http://127.0.0.1:5190/. The front page lists the main build, the builds in flight, the studies and the archive. The main build is http://127.0.0.1:5190/spall/: plain JavaScript in `experiments/spall/src/`, joined into `index.html` by `experiments/spall/build.sh`.

## What's where

- **Builds** open as one interactive game.
- **Studies** are documents, some with live parts.
- **The archive** is the Stratum era, kept as it was.

Conventions for agents and people working here (names, folders, commits, testing) are in `CLAUDE.md`.

| Folder | What it is |
|---|---|
| `experiments/index.html` | **The front page.** Its `ENTRIES` list is the map; `home/` holds the thumbnails and `home/shoot.mjs`, which makes them. |
| `experiments/spall/` | **The main build.** Physics cables with sliding ties, girders, posts, demolish; live lighting (sun, sky, occlusion, mist, shafts); birds; a 64×64×30 world on a pedestal over an undercity backdrop; claude as an agent; the band (bot chatter in the feed); presets and save slots. |
| `experiments/spall/mockups/` | Studies on the main build: UI chrome concepts (`ui.html`), highlight styles, 1× vs 2× fidelity (`hires.html`), lighting (`light.html`), wire looks (`index.html`, `v1`–`v3`), the placement study (`placement/`) and the gameplay zine (`zine/`). |
| `experiments/spall-3d/` | Build: the main build drawn by WebGL with a free orbit camera and smooth zoom (press 3). Reads `../spall/src`. `README.md` has the findings. |
| `experiments/spall-multimodal/` | Build: the main build plus talk, point and sketch input (Web Speech or Moonshine; pixel ink anchored in 3D; one timeline for an agent). `sync.py` keeps it current with main; `notes.html` has the findings. |
| `experiments/spall-backdrop/` | Study: the backdrop, now merged into the main build. Keeps its shot and page tools; its pages are in `local/`. |
| `experiments/agent-chat-reference/` | Study: art reference for the band, a sidebar of agents and bots talking in symbolic languages. |
| `experiments/megastructure-layers/` | Archive: the original layer-view prototype, the touchstone for the look. |
| `experiments/lines-and-voids/` | Archive: a rejected renderer study. `tools/cdp.mjs` is the headless-Chrome tool the tests use. |
| `experiments/concept-renders/` | Archive: Blender kit-of-parts renderer, concept renders and the accretion time-lapse (needs Blender). |
| `experiments/agent-buildings/` | Archive: building types an agent designed from requests. Uses `concept-renders/`. |
| `experiments/ui-mockups/` | Archive: early game-screen mock-ups composited over renders. |
| `concepts/aesthetics/` | Aesthetic studies built from the kit renders. |
| `notes/` | Design notes: megastructure, multiscale simulation, creative brief. |

## Not in git

Everything in this folder is committed except:

- `node_modules/`, `__pycache__/`, `*.pyc`, `.DS_Store`: rebuildable.
- **Any folder named `local/`**, wherever it is. Put big or throwaway artifacts there: long recordings, render dumps, scratch exports. The project lives in Dropbox, so those files are still synced; they just aren't versioned.

A pre-commit hook refuses files over 20 MB and says to move them into a `local/` folder. It lives in `.githooks/`; enable it in a fresh clone with `git config core.hooksPath .githooks`.

## History

Split out on 28 Oct 2026 from the earlier Stratum folder. On 31 Oct the Stratum-named folders became `spall` (was `stratum-wires`) and `spall-multimodal` (was `stratum-multimodal`), and every build's page became `index.html`. That folder continues as a separate SimCity 2000 project: the SC2K fork, the Micropolis agent, the SC4 probe, the agent kit, the voice gateway and the original research report. Nothing from it, and no Maxis or other third-party game assets, is in this repository.
