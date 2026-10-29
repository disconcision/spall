#!/bin/sh
# The 3D study: the current prototype's src/ parts (read from ../stratum-wires, unchanged)
# plus this folder's src/ parts, concatenated into one page; syntax-check; local test wrapper.
cd "$(dirname "$0")"
B=../stratum-wires/src
{ cat $B/00_head.html; printf '<script>\n'; cat $B/10_util.js $B/20_world.js $B/30_sprites.js $B/32_facades.js $B/40_iso.js $B/41_light.js $B/42_lighting.js $B/45_drawings.js $B/50_life.js $B/60_build.js $B/62_wires.js $B/63_birds.js $B/64_presets.js $B/65_agent.js $B/66_demolish.js $B/70_audio.js $B/80_ui.js $B/85_input.js $B/90_main.js $B/93_backdrop.js $B/95_demo.js $B/96_mocks.js $B/97_sheet.js $B/98_windows.js $B/99_flora.js src/*.js; printf '</script>\n'; } > spall3d.html
awk '/^<script>$/{f=1;next} /^<\/script>$/{f=0} f' spall3d.html > test/_script.js
node --check test/_script.js && echo "syntax ok"
{ printf '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script>window.__errs=[];window.addEventListener("error",function(e){window.__errs.push(e.message+" @"+e.lineno+":"+e.colno);});</script></head><body style="margin:0">\n'; cat spall3d.html; cat ../stratum-wires/test/hook.html; printf '</body></html>\n'; } > test/test.html
wc -c spall3d.html
