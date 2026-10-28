#!/bin/sh
# usage: test/shot.sh out.png "hash" [width height budget]
cd "$(dirname "$0")/.."
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
W=${3:-1400}; H=${4:-900}; B=${5:-5000}
timeout 90 "$CH" --headless=new ${GPU:---disable-gpu} --no-first-run --no-default-browser-check --hide-scrollbars --user-data-dir="$TMPDIR/chr_$$" --window-size=$W,$H --virtual-time-budget=$B --screenshot="$1" "file://$PWD/test/test.html#$2" >/dev/null 2>&1
rm -rf "$TMPDIR/chr_$$"
ls -la "$1" | awk '{print $5, $9}'
