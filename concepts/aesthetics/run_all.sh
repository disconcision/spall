#!/bin/sh
# Rebuild every render, sprite, strip and the page.  Blender 5.0 at /Applications/Blender.app, python3 + Pillow + numpy.
# Reads ../../experiments/concept-renders (kit.py, sprites.py) without modifying it.
set -e
cd "$(dirname "$0")"
export PYTHONDONTWRITEBYTECODE=1
B="/Applications/Blender.app/Contents/MacOS/Blender"
(cd gen && for g in t_catalog g_block g_green g_diag g_under g_infra g_city g_land g_pixel; do python3 $g.py; done)
for j in t_catalog a_block b_green d_diag c_under d_hetero e_infra f_city g_land h_pixel; do
  "$B" --background --factory-startup --python kitc.py -- --jobs "jobs/$j.json" 2>&1 | grep -E "Traceback|Error:" || true
done
python3 pixel.py
python3 post_city.py
python3 build_page.py
