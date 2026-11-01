"""post_city.py - compose each city style's four views into a strip, with outlines marking where the next view looks."""
import json, math, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
F = os.path.join(HERE, 'out', 'f')
jobs = json.load(open(os.path.join(HERE, 'jobs', 'f_city.json')))['jobs']
stats = {s['out']: s for s in json.load(open(os.path.join(HERE, 'out', 'stats_f_city.json')))}


def font(size, bold=False):
    for c in (['/Library/Fonts/Roboto-Bold.ttf'] if bold else []) + ['/Library/Fonts/Roboto-Regular.ttf', '/System/Library/Fonts/Helvetica.ttc']:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()


def basis(az, el):
    a, e = math.radians(az), math.radians(el)
    fwd = (-math.cos(e) * math.sin(a), math.cos(e) * math.cos(a), -math.sin(e))
    right = (math.cos(a), math.sin(a), 0.0)
    up = (right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0])
    return fwd, right, up


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def project(st, p, res):
    cam = st['camera']
    W, H = res
    s = cam['scale']
    return (W / 2 + (dot(p, cam['right']) - cam['cx']) * W / s, H / 2 - (dot(p, cam['up']) - cam['cy']) * W / s)


def footprint(job, st, z):
    """World points where the corners of an ortho view's frame meet the plane z."""
    cam = job['camera']
    fwd, right, up = basis(cam['az'], cam['el'])
    W, H = job['res'] if 'res' in job else (1600, 1000)
    s = st['camera']['scale']
    pts = []
    for (u, v) in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)):
        du, dv = u * s, v * s * H / W
        c = [st['camera']['right'][i] * (st['camera']['cx'] + du) + st['camera']['up'][i] * (st['camera']['cy'] + dv) for i in range(3)]
        t = (z - c[2]) / fwd[2]
        pts.append([c[i] + fwd[i] * t for i in range(3)])
    return pts


LABEL = {'1_far': '1  far: ordinary city blocks', '2_district': '2  closer: blocks resolve into towers',
         '3_superblock': '3  one "block" is a superblock', '4_canyon': '4  inside the canyon'}
NAMES = {'dys': 'Dystopian', 'brut': 'Overgrown brutalist', 'solar': 'Solarpunk'}
for key in ('dys', 'brut', 'solar'):
    js = [j for j in jobs if j['name'].startswith(key + '_')]
    ims = []
    for i, j in enumerate(js):
        out = j['out']
        im = Image.open(os.path.join(HERE, out)).convert('RGB')
        d = ImageDraw.Draw(im)
        if i + 1 < len(js) and js[i + 1]['camera'].get('type') != 'persp':
            nj = js[i + 1]
            fp = footprint(dict(nj, res=[1600, 1000]), stats[nj['out']], nj['camera']['target'][2] * 0.5)
            poly = [project(stats[out], p, (1600, 1000)) for p in fp]
            d.line(poly + [poly[0]], fill=(255, 190, 90), width=5)
        elif i + 1 < len(js):
            loc = js[i + 1]['camera']['loc']
            tgt = js[i + 1]['camera']['target']
            cyc = js[i]['camera']['target'][1]
            a = project(stats[out], (loc[0], cyc - 150.0, 40.0), (1600, 1000))
            b = project(stats[out], (loc[0], cyc + 40.0, 40.0), (1600, 1000))
            hd = project(stats[out], (loc[0], cyc + 40.0, 40.0), (1600, 1000))
            d.polygon([(hd[0], hd[1] - 22), (hd[0] - 16, hd[1] + 8), (hd[0] + 16, hd[1] + 8)], fill=(255, 190, 90))
            d.ellipse([a[0] - 16, a[1] - 16, a[0] + 16, a[1] + 16], outline=(255, 190, 90), width=5)
            d.line([a, b], fill=(255, 190, 90), width=5)
        d.rectangle([0, 0, 1600, 58], fill=(20, 20, 20))
        d.text((20, 12), LABEL[j['name'].split('_', 1)[1]], fill=(236, 226, 204), font=font(30, True))
        ims.append(im)
    tw = 800
    th = 500
    S = Image.new('RGB', (tw * 4 + 30, th), (20, 20, 20))
    for i, im in enumerate(ims):
        S.paste(im.resize((tw, th), Image.LANCZOS), (i * (tw + 10), 0))
    S.save(os.path.join(F, 'strip_%s.png' % key))
    for i, im in enumerate(ims):
        im.save(os.path.join(F, 'boxed_%s_%d.png' % (key, i + 1)))
    print('strip', key)
