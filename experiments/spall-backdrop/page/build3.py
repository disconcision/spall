# Round three page: template3 + stills and clips from local/u3f as data URIs.
# Inputs come from tools/cdp.mjs runs of shots/_u3full.json (made by shots/u3_full.py).
# usage: python3 page/build3.py  ->  local/backdrops3.html
import base64, os, re
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE); U3 = os.path.join(ROOT, 'local', 'u3f')
def uri(path, mime):
    with open(path, 'rb') as f: return f'data:{mime};base64,' + base64.b64encode(f.read()).decode()
img = lambda n: uri(os.path.join(U3, 'web', n + '.webp'), 'image/webp')
vid = lambda n: uri(os.path.join(U3, 'vid', n + '.mp4'), 'video/mp4')
page = open(os.path.join(HERE, 'template3.html')).read()
page = re.sub(r'\{\{IMG:(\w+)\}\}', lambda m: img(m.group(1)), page)
page = re.sub(r'\{\{VID:(\w+)\}\}', lambda m: vid(m.group(1)), page)
# the other times of day for each switchable figure (day is the image already on the page)
sets = ['under_3d_hz', 'under_2d_top', 'abyss_2d_top', 'abyss_3d_hz']
page = page.replace('{{SHOTS}}', 'const SHOTS = {' + ','.join(f'"{s}_{t}":"{img(s + "_" + t)}"' for s in sets for t in ['dusk', 'night']) + '};')
out = os.path.join(ROOT, 'local', 'backdrops3.html'); open(out, 'w').write(page)
print(out, round(os.path.getsize(out) / 1e6, 2), 'MB')
open(os.path.join(ROOT, 'local', 'backdrops3-standalone.html'), 'w').write('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0">' + page + '</body></html>')
