#!/bin/sh
# Web copies of out/ for index.html: renders as JPEG at most 1400 px wide, pixel art as PNG at full size.
# out/ stays off the published site (it's ~90 MB of full-size PNGs); web/ is what the page shows. Needs macOS sips.
#   ./web.sh
cd "$(dirname "$0")" && rm -rf web && mkdir web
jpg() { sips -s format jpeg -s formatOptions 82 --resampleWidth 1400 "out/$1.png" --out "web/$2.jpg" >/dev/null; }
for f in scene_dusk_labelled scene_golden scene_dusk_close scene_vs_stock log_panel; do jpg $f $f; done
for b in bridge_market hanging_garden hydro_stack rooftop_village solar_chimney tube_interchange; do
  jpg concept/$b concept_$b
  jpg sheets/$b sheet_$b
  for v in out/iter/${b}_v*_concept.png; do n=$(basename "$v" .png); jpg iter/$n iter_$n; done
done
for f in extensions_before_after agent_sprite_sheet ingame_mock; do cp "out/$f.png" web/; done
du -sh web
