"""post_powers.py - scale bars, labels and the previous frame's outline on each Powers of Ten frame; a strip and a grid."""
import json, math, os
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__))
AES = os.path.dirname(HERE)
st = {os.path.basename(s['out']): s for s in json.load(open(os.path.join(AES, 'out', 'stats_powers.json')))}
jobs = json.load(open(os.path.join(HERE, 'jobs', 'powers.json')))['jobs']
CAPS = ['a roof terrace in a small town', 'the town sits on a terrace; the wall below it is inhabited',
        'the terrace is one step of the Rib\'s cast face', 'the Rib: a stepped concrete mass 1.7 km high, 6 km across',
        'one of 48 ribs, with ordinary cities between them', 'the ribs are spokes of the Hub']
LBL = ['10 m', '100 m', '1 km', '10 km', '100 km', '1000 km']


def font(size, bold=False):
    for c in (['/Library/Fonts/Roboto-Bold.ttf'] if bold else []) + ['/Library/Fonts/Roboto-Regular.ttf', '/System/Library/Fonts/Helvetica.ttc']:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()


def nice(v):
    e = 10 ** math.floor(math.log10(v))
    for m in (5, 2, 1):
        if m * e <= v:
            return m * e
    return e


def fmt(m):
    return ('%g km' % (m / 1000)) if m >= 1000 else ('%g m' % m)


outs = []
for i, j in enumerate(jobs):
    name = os.path.basename(j['out'])
    im = Image.open(os.path.join(AES, j['out'])).convert('RGB')
    W, H = im.size
    cam = st[name]['camera']
    ppm = W / cam['scale']
    d = ImageDraw.Draw(im, 'RGBA')
    if i > 0:
        pc = st[os.path.basename(jobs[i - 1]['out'])]['camera']
        w = pc['scale'] * ppm
        h = w * H / W
        cx = W / 2 + (pc['cx'] - cam['cx']) * ppm
        cy = H / 2 - (pc['cy'] - cam['cy']) * ppm
        d.rectangle([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], outline=(255, 255, 255, 255), width=3)
        d.rectangle([cx - w / 2 - 2, cy - h / 2 - 2, cx + w / 2 + 2, cy + h / 2 + 2], outline=(0, 0, 0, 140), width=1)
    L = nice(cam['scale'] / 5)
    bl = L * ppm
    x0, y0 = 40, H - 60
    d.rectangle([x0 - 14, y0 - 46, x0 + bl + 110, y0 + 26], fill=(20, 20, 20, 170))
    d.rectangle([x0, y0, x0 + bl, y0 + 8], fill=(255, 255, 255, 255))
    d.rectangle([x0, y0, x0 + bl / 2, y0 + 8], fill=(40, 40, 40, 255), outline=(255, 255, 255, 255))
    d.text((x0 + bl + 12, y0 - 8), fmt(L), fill=(255, 255, 255), font=font(24, True))
    d.text((x0, y0 - 40), 'scale  ~' + LBL[i] + ' across', fill=(236, 226, 204), font=font(22))
    d.rectangle([0, 0, W, 64], fill=(20, 20, 20, 190))
    d.text((24, 12), '%d   %s' % (i + 1, LBL[i]), fill=(232, 168, 60), font=font(34, True))
    d.text((230, 20), CAPS[i], fill=(236, 226, 204), font=font(26))
    o = os.path.join(HERE, 'out', 'powers', 'lab_' + name)
    im.save(o)
    outs.append(im)
tw, th = 800, 500
G = Image.new('RGB', (tw * 3 + 20, th * 2 + 10), (18, 18, 18))
for k, im in enumerate(outs):
    G.paste(im.resize((tw, th), Image.LANCZOS), ((k % 3) * (tw + 10), (k // 3) * (th + 10)))
G.save(os.path.join(HERE, 'out', 'powers', 'grid.png'))
print('labelled', len(outs))
