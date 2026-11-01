#!/bin/sh
# The 3D study: the main build's src/ parts (read from ../spall, unchanged, in the order its build.sh lists
# them, so new game files come along) plus this folder's src/ parts, concatenated into one page;
# syntax-check; local test wrapper.
cd "$(dirname "$0")"
B=../spall
PARTS=$(grep -o 'src/[0-9A-Za-z_]*\.js' $B/build.sh | sed "s#^#$B/#")
[ -n "$PARTS" ] || { echo "no src parts found in $B/build.sh"; exit 1; }
{ cat $B/src/00_head.html; printf '<script>\n'; cat $PARTS src/*.js; printf '</script>\n'; } > index.html
awk '/^<script>$/{f=1;next} /^<\/script>$/{f=0} f' index.html > test/_script.js
node --check test/_script.js && echo "syntax ok"
{ printf '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script>window.__errs=[];window.addEventListener("error",function(e){window.__errs.push(e.message+" @"+e.lineno+":"+e.colno);});</script></head><body style="margin:0">\n'; cat index.html; cat $B/test/hook.html; printf '</body></html>\n'; } > test/test.html
wc -c index.html
