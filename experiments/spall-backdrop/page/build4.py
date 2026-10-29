# Round four page: template4 + stills and clips from local/u4 as data URIs.
# Inputs come from tools/cdp.mjs runs of shots/_u4full.json (made by shots/u4_full.py).
# usage: python3 page/build4.py  ->  local/backdrop4.html
import base64, os, re
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE); U4 = os.path.join(ROOT, 'local', 'u4')
def uri(path, mime):
    with open(path, 'rb') as f: return f'data:{mime};base64,' + base64.b64encode(f.read()).decode()
img = lambda n: uri(os.path.join(U4, 'web', n + '.webp'), 'image/webp')
vid = lambda n: uri(os.path.join(U4, 'vid', n + '.mp4'), 'video/mp4')
page = open(os.path.join(HERE, 'template4.html')).read()
page = re.sub(r'\{\{IMG:(\w+)\}\}', lambda m: img(m.group(1)), page)
page = re.sub(r'\{\{VID:(\w+)\}\}', lambda m: vid(m.group(1)), page)
# the other lights for each switchable figure (morning is the image already on the page)
sets = ['2d_top', '3d_hz']
page = page.replace('{{SHOTS}}', 'const SHOTS = {' + ','.join(f'"{s}_{t}":"{img(s + "_" + t)}"' for s in sets for t in ['day', 'dusk', 'night']) + '};')
out = os.path.join(ROOT, 'local', 'backdrop4.html'); open(out, 'w').write(page)
print(out, round(os.path.getsize(out) / 1e6, 2), 'MB')
open(os.path.join(ROOT, 'local', 'backdrop4-standalone.html'), 'w').write('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0">' + page + '</body></html>')
