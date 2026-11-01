#!/bin/sh
# Web copies of out/ for index.html: renders as JPEG at most 1400 px wide, pixel art as PNG at full size.
# out/ stays off the published site (it's ~90 MB of full-size PNGs); web/ is what the page shows. Needs macOS sips.
#   ./web.sh
cd "$(dirname "$0")" && rm -rf web && mkdir web
for f in a_blame a_blame_close b_glt b_glt_close c_kowloon c_kowloon_close d_solarpunk d_solarpunk_close e_mixed f_arcology \
         v1_full v2_cutaway_L8 v2b_cutaway_L14 v3_ghost_L8 v4_exploded v5_section_x13 v6_plan_L12_annotated \
         l_arcology_overcast l_arcology_dusk l_arcology_night l_kowloon_night l_blame_night l_solarpunk_dusk \
         sheet_4_timelapse catalog_sheet; do
  sips -s format jpeg -s formatOptions 82 --resampleWidth 1400 "out/$f.png" --out "web/$f.jpg" >/dev/null
done
for f in p1_sprite_strip p2_sprite_rotations p3_sprite_sheet p4_ingame_mock p5_agent_loop p6_palette_compare; do
  cp "out/$f.png" web/
done
cp out/accretion_timelapse.mp4 web/
du -sh web
