#!/bin/sh
# Rebuild every final artefact of the agent-buildings experiment from the specs (iteration history in out/iter and
# log/ is NOT regenerated).  Requires Blender 5.0 at /Applications/Blender.app, python3 + Pillow + numpy.
# Reads ../concept-renders (kit.py, kitschema.py, agent_check.py, sprites.py, gen.py, out/sprites) without modifying it.
set -e
cd "$(dirname "$0")"
export PYTHONDONTWRITEBYTECODE=1
B="/Applications/Blender.app/Contents/MacOS/Blender"
run() { "$B" --background --factory-startup --python kitx.py -- --jobs "jobs/$1.json" 2>&1 | grep -E "Traceback|Error:" || true; }

for b in hydro_stack bridge_market hanging_garden tube_interchange solar_chimney rooftop_village; do
  python3 check.py specs/$b.json --json log/final_$b.check.json | tail -1 | sed "s/^/$b: /"
done
python3 make_jobs.py            # jobs/buildings.json: concept view + 4 rotations x (32 px/tile, 6x hi) per building
python3 make_jobs.py context    # jobs/context_sprites.json: host sprites for the in-game mock
python3 scene.py                # specs/scene_district.json + jobs/scene.json (six instances)
run buildings; run context_sprites; run scene
python3 post.py                 # kit64 lock, anchors, per-building sheets, sprite sheet
python3 mock.py                 # SC2K-style in-game mock
python3 scene_post.py           # labelled scene + stock comparison
python3 stats.py                # log summary + panel
python3 contact.py              # extensions before/after + contact sheet
