#!/bin/sh
# Concatenate src/ parts into the single-file page, syntax-check, and make the local test wrapper.
cd "$(dirname "$0")"
{ cat src/00_head.html; printf '<script>\n'; cat src/10_util.js src/20_world.js src/30_sprites.js src/32_facades.js src/40_iso.js src/41_light.js src/42_lighting.js src/45_drawings.js src/50_life.js src/60_build.js src/62_wires.js src/63_birds.js src/64_presets.js src/65_agent.js src/66_demolish.js src/70_audio.js src/80_ui.js src/85_input.js src/90_main.js src/93_backdrop.js src/95_demo.js src/96_mocks.js src/97_sheet.js src/98_windows.js src/99_flora.js; printf '</script>\n'; } > stratum.html
awk '/^<script>$/{f=1;next} /^<\/script>$/{f=0} f' stratum.html > test/_script.js
node --check test/_script.js && echo "syntax ok"
{ printf '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script>window.__errs=[];window.addEventListener("error",function(e){window.__errs.push(e.message+" @"+e.lineno+":"+e.colno);});</script></head><body style="margin:0">\n'; cat stratum.html; cat test/hook.html; printf '</body></html>\n'; } > test/test.html
wc -c stratum.html
