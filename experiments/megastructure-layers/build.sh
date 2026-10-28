#!/bin/sh
# Concatenate src/ parts into the single-file page, syntax-check, and make the local test wrapper.
cd "$(dirname "$0")"
{ cat src/00_head.html; printf '<script>\n'; cat src/10_util.js src/20_world.js src/30_sprites.js src/40_iso.js src/45_drawings.js src/50_life.js src/60_build.js src/65_agent.js src/70_audio.js src/80_ui.js src/85_input.js src/90_main.js; printf '</script>\n'; } > stratum.html
awk '/^<script>$/{f=1;next} /^<\/script>$/{f=0} f' stratum.html > test/_script.js
node --check test/_script.js && echo "syntax ok"
{ printf '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script>window.__errs=[];window.addEventListener("error",function(e){window.__errs.push(e.message+" @"+e.lineno+":"+e.colno);});</script></head><body style="margin:0">\n'; cat stratum.html; cat test/hook.html; printf '</body></html>\n'; } > test/test.html
wc -c stratum.html
