"""post_pixel.py - Stratum-palette lock of the nested-scale renders, composed with outlines of the next finer view."""
import json, os, sys
sys.dont_write_bytecode = True
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__))
AES = os.path.dirname(HERE)
sys.path.insert(0, AES)
import pixel as PX   # noqa: E402  (Stratum palette + lock)
RAW = os.path.join(HERE, 'out', 'pixel', 'raw')
OUT = os.path.join(HERE, 'out', 'pixel')
st = {os.path.basename(s['out']): s['camera'] for s in json.load(open(os.path.join(AES, 'out', 'stats_pixel_scale.json')))}


def lock(name):
    im = Image.open(os.path.join(RAW, name + '.png')).convert('RGBA')
    out, _ = PX.SP.palette_lock(im, PX.PAL_S, PX.PAL_S_LAB)
    return out.convert('RGB')


def box_in(coarse, fine, im_c, im_f):
    cc, cf = st[coarse + '.png'], st[fine + '.png']
    Wc = im_c.width
    ppm_c = Wc / cc['scale']
    wf = cf['scale'] * ppm_c
    hf = wf * im_f.height / im_f.width
    cx = Wc / 2 + (cf['cx'] - cc['cx']) * ppm_c
    cy = im_c.height / 2 - (cf['cy'] - cc['cy']) * ppm_c
    return [cx - wf / 2, cy - hf / 2, cx + wf / 2, cy + hf / 2]


def panel(names, labels, k, out, title):
    ims = [lock(n) for n in names]
    boxes = [box_in(names[i], names[i + 1], ims[i], ims[i + 1]) for i in range(len(names) - 1)]
    shown = []
    for i, im in enumerate(ims):
        big = im.resize((im.width * k[i], im.height * k[i]), Image.NEAREST)
        d = ImageDraw.Draw(big)
        if i < len(boxes):
            b = [v * k[i] for v in boxes[i]]
            d.rectangle(b, outline=(255, 107, 74), width=3)
        shown.append(big)
    pad, top = 22, 64
    W = sum(s.width for s in shown) + pad * (len(shown) + 1)
    H = max(s.height for s in shown) + top + 50
    P = Image.new('RGB', (W, H), (27, 27, 26))
    d = ImageDraw.Draw(P)
    d.text((pad, 16), title, fill=(236, 226, 204), font=PX.font(24, True))
    x = pad
    for s, lb in zip(shown, labels):
        P.paste(s, (x, top))
        d.text((x, top + s.height + 10), lb, fill=(200, 192, 176), font=PX.font(16))
        x += s.width + pad
    P.save(os.path.join(OUT, out))
    print(out, P.size)


panel(['s1_landscape', 's2_district', 's3_building'],
      ['16 px per 256 m cell: the megaform as a landscape-scale sprite (2x)', '16 px per 16 m: terraces as districts (1x)',
       '16 px per 4 m: one terrace is the ground; build here (1x)'], [2, 1, 1], 'nested_stepped.png',
      'One place at three nested scales (Stratum palette); coral boxes mark the next view')
panel(['v1_frames', 'v2_bays'], ['16 px per 64 m: two megaframes and the void between (1x)', '16 px per 4 m: one bay, buildings slotted in (1x)'],
      [1, 1], 'nested_void.png', 'Megaframe bays as building plots (Stratum palette)')
