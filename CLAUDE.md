# Spall: working here

Spall is a pixel-art isometric megastructure builder (working title; it was "Stratum"). Several agent sessions work in this repo, often at once. These are the house rules.

## Layout

`experiments/` is served on port 5190; `experiments/index.html` is the front page and the map of everything. Every push to `main` also publishes `experiments/` to https://andrewblinn.com/spall/ (`.github/workflows/pages.yml`); `local/` folders and the Blender render dumps (`out/` in the archive folders) stay off it.

- **Main build:** `experiments/spall/`. The game. Sources in `src/`, joined into `index.html` by `build.sh`. Everything else is measured against it.
- **Builds:** folders that open as one interactive game, each the main build plus something. They read main's sources rather than keeping copies:
  - `spall-3d/build.sh` reads `../spall/src` in the order `../spall/build.sh` lists it.
  - `spall-multimodal/sync.py` copies main's sources and applies its hooks. Re-run it after main changes; never hand-edit the copied files.
- **Studies:** documents (findings, comparisons, concept pages), some with live parts. Examples: `spall-multimodal/notes.html`, `agent-chat-reference/`, `spall/mockups/`.
- **Archive:** the Stratum-era prototypes and retired tools (`megastructure-layers/`, `ui-mockups/`, `lines-and-voids/`, `concept-renders/`, `agent-buildings/`, `aesthetics/`). Leave them as they are. `concept-renders/` and `agent-buildings/` have gallery pages that show web copies of `out/` (`web.sh` makes them).

## Names

- Call it Spall in anything people read: titles, folders, pages, notes.
- Archived things keep their Stratum names.
- Internal identifiers stay as they are: `window.STRATUM`, `stratum.*` storage keys, the `stratum.stream` schema. Renaming them drops saved settings.

## Where new work goes

- **A new variant of the game:** a build folder, `experiments/spall-<what>/`, that reads main's sources (a build list or a sync script, never a hand copy).
- **A write-up, comparison or concept page:** a study, beside the work it's about.
- **Big or throwaway files** (recordings, render dumps, built report pages with inlined media): a `local/` folder. Dropbox syncs it; git ignores it.
- **The front page:** add every new build or study to `ENTRIES` in `experiments/index.html`, with a one-line plain description (what it is, no pitch or flavor). `node --experimental-websocket experiments/home/shoot.mjs <id>` makes its thumbnail.

## Main is shared

- Keep changes to `experiments/spall/` scoped.
- After changing it, run `./build.sh`, then check that the builds reading it still build: `spall-3d/build.sh` and `spall-multimodal/sync.py`.
- If an anchor in `sync.py` moved, fix the anchor in `sync.py`, not the game.
- Build UI from the shared parts listed at the top of `src/00_head.html`: tokens for every colour, `.pn`/`.bar`/`.ttl`/`.float` surfaces, the shared controls, and the one feed row. Canvas drawing takes colours from `ROLE` (`10_util.js`). `build.sh` lists colours written straight into CSS; fix them, or mark a deliberate one with a `raw-colour` comment.

## Commits

- Commit your own work as you go, in small, well-scoped commits. The message says what changed and why.
- Commit only the files you changed. Other sessions' uncommitted work may be in the tree. Check `git status` and don't sweep it into your commit; mention it to the user instead.
- Never stash, reset, rebase or check out over others' work. Don't push without the user's OK: a push to `main` publishes the site.
- Branches or worktrees are welcome for large or risky changes, but not required.
- The pre-commit hook refuses files over 20 MB. Enable it in a fresh clone with `git config core.hooksPath .githooks`.

## Testing

- Use the headless tools:
  - `experiments/lines-and-voids/tools/cdp.mjs`;
  - `experiments/spall-multimodal/test/cdp_nomic.mjs` for anything with speech. It removes the microphone and Web Speech before the page loads.
- Builds boot asynchronously: wait for `window.__booted`.
- Never start Web Speech or click a mic button in a headless or automated browser. Chrome's recognizer records the real microphone whatever the fake-device flags say.

## Assets

No Maxis or other third-party game assets, ever. Everything here is original or generated.

## Sessions

Start Spall sessions in `~/Dropbox/projects/spall`. `~/Dropbox/projects/stratum` is now the separate SimCity 2000 project.
