#!/bin/sh
# Rebuild every spec, render every image and assemble the sheets.  ~4 minutes on an M1 Max.
# Requires: Blender 5.0 at /Applications/Blender.app, python3 with Pillow + numpy, ffmpeg at /opt/homebrew/bin/ffmpeg.
set -e
cd "$(dirname "$0")"
B="/Applications/Blender.app/Contents/MacOS/Blender"
run() { "$B" --background --factory-startup --python kit.py -- --jobs "jobs/$1.json" 2>&1 | grep -E "^\[kit.*rendered|Traceback|Error:" | grep -v "Shadow buffer" || true; }

python3 gen.py                                  # seeded specs -> specs/*.json (+ sprite set)
python3 agent_check.py specs/agent_vertical_farm.v1.json || true   # the flawed draft: expected FAIL
python3 agent_check.py specs/agent_vertical_farm.json           # the fixed revision: PASS
python3 agent_check.py specs/arcology.json --fill               # megastructure: support + 50% fill cap
python3 make_jobs.py                            # jobs/*.json (cameras, lights, view modes)
for j in variants lighting levels timelapse sprites catalog; do run "$j"; done
python3 sprites.py                              # palette lock, strips, sheet, in-game mock, agent loop panel
python3 post.py                                 # time-lapse GIF/MP4, plan annotation, catalogue + contact sheets
