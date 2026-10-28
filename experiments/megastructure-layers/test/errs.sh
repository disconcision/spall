#!/bin/sh
cd "$(dirname "$0")/.."
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
timeout 90 "$CH" --headless=new ${GPU:---disable-gpu} --no-first-run --no-default-browser-check --user-data-dir="$TMPDIR/chd_$$" --window-size=${2:-1400},${3:-900} --virtual-time-budget=${4:-4000} --dump-dom "file://$PWD/test/test.html#$1" 2>/dev/null | grep -o 'ERRS:\[.*' | head -c 4000; echo
rm -rf "$TMPDIR/chd_$$"
