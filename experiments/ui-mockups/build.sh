#!/bin/sh
# build.sh - rebuild every mock-up from scratch: render passes -> composites -> pixel map -> icons -> screenshots -> sheet.
# Reads ../concept-renders and ../agent-buildings; writes only inside this folder.
set -e
cd "$(dirname "$0")"
BLENDER="/Applications/Blender.app/Contents/MacOS/Blender"
t0=$(date +%s)
python3 render/make_jobs.py                     # derived specs + jobs + world anchors
python3 render/stats.py > /dev/null             # per-level fill / residents / light from the spec
"$BLENDER" --background --factory-startup --python render/kit_ui.py -- --jobs render/jobs.json 2>&1 | grep '\[kit_ui\]'
python3 render/composite.py                     # M1 focus-level composite, section thumbnail, src/js/data.js
PYTHONDONTWRITEBYTECODE=1 python3 pixel/compose.py   # M8 district map (kit64 palette lock)
python3 pixel/icons.py > /dev/null              # build-menu icons (integer scale only)
python3 capture.py                              # headless Chrome, 2560 x 1440
python3 contact_sheet.py
echo "build.sh: $(( $(date +%s) - t0 )) s"
