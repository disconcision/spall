#!/usr/bin/env python3
"""Bring this fork up to date with the main build (../spall), then build.

The fork is the game plus src/67_sense.js (talk, point, sketch) and src/67_sense.css. This copies
every other source file from the game as it is now (its working tree, committed or not), puts the
sense files into the build, and applies the few hooks below. Each hook is an anchored replacement:
if the game moved an anchor, it stops and names it, and the hook needs a new anchor here.

usage: ./sync.py            (from anywhere)
"""
import os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.join(HERE, '..', 'spall')
OWN = {'67_sense.js', '67_sense.css'}

# the mic as pixels in the text colour: X solid, W faint
MIC = ['..XXXXX..', '.XWWWWWX.', '.XWWWWWX.', '.XWWWWWX.', '.XWWWWWX.', 'X.XWWWX.X', 'X..XXX..X', '.X.....X.', '..XXXXX..', '....X....', '....X....', '..XXXXX..']
FAINT = ' opacity=".3"'
MIC_SVG = '<svg width="9" height="12" viewBox="0 0 9 12" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">' + ''.join(
    f'<rect x="{x}" y="{y}" width="1" height="1"{"" if c == "X" else FAINT}/>' for y, row in enumerate(MIC) for x, c in enumerate(row) if c != '.') + '</svg>'


def hooks():
    css = open(os.path.join(HERE, 'src', '67_sense.css')).read()
    return {
        'src/00_head.html': [
            ('</style>', css + '</style>'),
            ('<title>Spall</title>', '<title>Spall · talk, point, sketch</title>'),
            ('<div id="toast" class="float" hidden></div>',
             '<div id="toast" class="float" hidden></div>\n      <div id="cap" hidden><span class="who">you</span><span class="fin"></span><i class="int"></i><span class="lat"></span></div>'),
            # the mic goes after the send button: setupUI fills the form's first button with the send glyph
            ('<form id="chatf" autocomplete="off"><input id="chatIn"',
             '<div id="micEng">speech <select aria-label="Speech engine"></select><i class="st"></i>'
             '<button type="button" id="bExport" data-tip="Download everything (voice, pointer, ink, views) as JSON">⤓ json</button></div>\n'
             '      <form id="chatf" autocomplete="off"><input id="chatIn"'),
            ('aria-label="Send"></button></form>',
             'aria-label="Send"></button><button type="button" id="bMic" aria-pressed="false" aria-label="Talk" data-tip="Talk: click for an open mic, or hold Space">'
             + MIC_SVG + '<i id="micLv"></i></button></form>'),
        ],
        'src/80_ui.js': [
            ("{ id: 'point', n: 'Point', k: 'P' }]", "{ id: 'point', n: 'Point', k: 'P' }, { id: 'sketch', n: 'Sketch', k: 'N' }]"),
            ("point: [['click', 'pin for claude']],", "point: [['click', 'pin for claude']], sketch: [['drag', 'draw'], ['hold Space', 'talk'], ['⌫', 'undo']],"),
            ("icon('demolish', bulldozerIcon);", "icon('demolish', bulldozerIcon);\n  icon('sketch', inkIcon);"),
            ("    case 'demolish': return {", "    case 'sketch': return inkOpts();\n    case 'demolish': return {"),
            ("t !== 'point' && (S.mode", "t !== 'point' && t !== 'sketch' && (S.mode"),
            ("  text = text.trim(); if (!text) return;\n", "  text = text.trim(); if (!text) return;\n  mmText(text);\n"),
        ],
        'src/85_input.js': [
            ("    P.wire = e.button === 0 && wireDown(bx, by, e);",
             "    P.ink = e.button === 0 && inkDown(bx, by, e);\n    if (P.ink) { clearTimeout(P.lp); return; }\n    P.wire = e.button === 0 && wireDown(bx, by, e);"),
            ("    P.lastCss = [cx, cy];\n", "    P.lastCss = [cx, cy];\n    if (P.ink) { inkAdd(bx, by); S.hover = pickAt(bx, by); updateTip(null); return; }\n"),
            ("    if (P.wire) { P.wire = false; const [bx, by] = toBuf(e); wireUp(bx, by); return; }",
             "    if (P.ink) { P.ink = false; inkUp(); return; }\n    if (P.wire) { P.wire = false; const [bx, by] = toBuf(e); wireUp(bx, by); return; }"),
        ],
        'src/90_main.js': [
            ("  if (S.mode === 'plan') renderPlan(ctx, S.time);\n  else if (S.mode === 'section') renderSec(ctx, S.time);\n  else renderIso(ctx, S.time);",
             "  if (S.mode === 'plan') { renderPlan(ctx, S.time); drawInkPlan(ctx); }\n  else if (S.mode === 'section') renderSec(ctx, S.time);\n  else { renderIso(ctx, S.time); drawInkIso(ctx); }"),
            ("setupUI(); setupInput(); resize();", "setupUI(); setupInput(); setupSense(); resize();"),
            ("window.STRATUM = {\n",
             "window.STRATUM = {\n  MM, MIC, MOON, simSpeech, worldAt, streamJSON, inkUndo, inkClear, engPick,\n"
             "  speakClip: url => { if (MIC.on || !isMoon()) return false; micStart(false, url); return true; },   // tests: a recorded clip into Moonshine, never the mic\n"),
        ],
    }


def main():
    src, gsrc = os.path.join(HERE, 'src'), os.path.join(GAME, 'src')
    game = sorted(f for f in os.listdir(gsrc) if f.endswith(('.js', '.html')))
    changed = []
    for f in game:
        a, b = os.path.join(gsrc, f), os.path.join(src, f)
        if f in OWN: sys.exit(f'the game has its own {f}: rename one of them')
        if not os.path.exists(b) or open(a, 'rb').read() != open(b, 'rb').read(): changed.append(f)
        shutil.copyfile(a, b)
    gone = [f for f in os.listdir(src) if f.endswith(('.js', '.html')) and f not in game and f not in OWN]
    for f in gone: os.remove(os.path.join(src, f))
    shutil.copyfile(os.path.join(GAME, 'test', 'hook.html'), os.path.join(HERE, 'test', 'hook.html'))
    # the build: the game's, with the sense module after the demolish tool
    bs = open(os.path.join(GAME, 'build.sh')).read()
    if 'src/66_demolish.js ' not in bs: sys.exit('build.sh: no "src/66_demolish.js " to put 67_sense.js after')
    open(os.path.join(HERE, 'build.sh'), 'w').write(bs.replace('src/66_demolish.js ', 'src/66_demolish.js src/67_sense.js ', 1))
    os.chmod(os.path.join(HERE, 'build.sh'), 0o755)
    for path, reps in hooks().items():
        p = os.path.join(HERE, path); s = open(p).read()
        for old, new in reps:
            n = s.count(old)
            if n != 1: sys.exit(f'{path}: anchor found {n} times, expected once:\n  {old[:100]!r}')
            s = s.replace(old, new)
        open(p, 'w').write(s)
    print(f'synced from the game: {len(game)} files, {len(changed)} changed' + (f' ({", ".join(changed)})' if changed else '') + (f'; removed {", ".join(gone)}' if gone else ''))
    subprocess.run([os.path.join(HERE, 'build.sh')], check=True)


if __name__ == '__main__':
    main()
