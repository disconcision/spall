"""
sprites.py - Pillow half of the agent-authored-building pipeline.

    python3 sprites.py

Inputs : out/sprites/*_lo.png (aliased low-res renders, 32 px per tile), *_hi.png (6x, anti-aliased), *_lo.cam.json
Outputs: out/sprites/*_pal.png        palette-locked game assets (kit64, no dither, binary alpha)
         out/p1_sprite_strip.png      3D render -> low-res sprite -> palette-locked sprite at integer upscale (rotation 0)
         out/p2_sprite_rotations.png  the same three stages for all 4 rotations
         out/p3_sprite_sheet.png      final sprite sheet (farm + capsule stack, 4 rotations) with the palette
         out/p4_ingame_mock.png       SC2K-style tile map composed only from palette-locked kit sprites
         out/p5_agent_loop.png        spec excerpt + validator feedback (draft v1 FAIL -> v2 PASS)
         out/p6_palette_compare.png   kit64 lock vs per-sprite adaptive 64 colours vs raw
"""
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SP = os.path.join(HERE, 'out', 'sprites')
OUT = os.path.join(HERE, 'out')

# ------------------------------------------------------------------------------------------ fonts
def font(name, size):
    cands = {'regular': ['/Library/Fonts/Roboto-Regular.ttf', '/System/Library/Fonts/Helvetica.ttc'],
             'bold': ['/Library/Fonts/Roboto-Bold.ttf', '/System/Library/Fonts/Helvetica.ttc'],
             'medium': ['/Library/Fonts/Roboto-Medium.ttf', '/System/Library/Fonts/Helvetica.ttc'],
             'mono': ['/System/Library/Fonts/Menlo.ttc', '/System/Library/Fonts/Monaco.ttf']}[name]
    for c in cands:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()


# ------------------------------------------------------------------------------------------ palette
# "kit64": a hand-built 64-colour master palette in the spirit of SC2K's VGA palette (not the original).
# Ramps: neutral greys, warm greys, timber, foliage, water/glass, teal, terracotta, sodium/window warm,
# neon accents, whites.  Every sprite in the game is locked to this one palette.
KIT64 = [
    '0d0e11', '1f2126', '33363c', '4b4e55', '666a70', '858a8f', 'a9adb0', 'd2d5d6',         # greys
    '4a4239', '6b6155', '8f8474', 'b3a794', 'd4c9b4', 'efe7d6',                             # warm greys
    '3b2616', '5a3a20', '7c522c', '9e6c3c', 'bf8a52', 'd9ac74',                             # timber / soil
    '1d2e16', '2c4420', '3d5c29', '4f7532', '648f3c', '7ba84a', '98c15d', 'bddb85',         # foliage
    '142133', '1f3550', '2f4d6e', '44678a', '6285a6', '8aa9c4', 'b8cfe0',                   # blues
    '0f2b2e', '1e4a4f', '32686c', '57908f', '8cbab5',                                       # teal / glass
    '4a1d16', '74302a', '9e4a3a', 'c26a52', 'dd9478',                                       # terracotta
    '7a4a14', 'b06c1c', 'd9902a', 'f2b447', 'fbd57a', 'fff0c0',                             # warm light
    '5a2a4a', '8c3f78', 'c86aa8', 'f0a5d0',                                                 # pinks
    'ff3a50', '3ae6ff', '5aff8c', 'ffe13a',                                                 # neon
    'c69a7a', '7a3f22', 'b8b0d8', 'f4f4f0', 'ffffff',                                       # skin, rust, lavender, whites
]
assert len(KIT64) == 64, len(KIT64)
PAL = np.array([[int(h[i:i + 2], 16) for i in (0, 2, 4)] for h in KIT64], dtype=np.float64)


def srgb_to_lab(rgb):
    c = rgb / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1)


PAL_LAB = srgb_to_lab(PAL)


def binarize_alpha(im, thr=128):
    a = np.array(im.convert('RGBA'))
    a[..., 3] = np.where(a[..., 3] >= thr, 255, 0)
    return a


def palette_lock(im, pal=PAL, pal_lab=PAL_LAB):
    """Nearest palette colour in CIELAB (no dithering); alpha binarised; returns RGBA Image + index map."""
    a = binarize_alpha(im)
    rgb = a[..., :3].reshape(-1, 3).astype(np.float64)
    lab = srgb_to_lab(rgb)
    d = ((lab[:, None, :] - pal_lab[None, :, :]) ** 2).sum(-1)
    idx = d.argmin(1)
    out = pal[idx].reshape(a.shape[0], a.shape[1], 3).astype(np.uint8)
    res = np.dstack([out, a[..., 3]])
    res[a[..., 3] == 0] = 0
    return Image.fromarray(res, 'RGBA'), idx.reshape(a.shape[:2])


def adaptive_lock(ims, n=64):
    """One median-cut palette of n colours shared across several sprites (e.g. the 4 rotations)."""
    arrs = [binarize_alpha(im) for im in ims]
    opaque = np.concatenate([a[a[..., 3] > 0][:, :3] for a in arrs])
    strip = Image.fromarray(opaque.reshape(1, -1, 3).astype(np.uint8), 'RGB')
    q = strip.quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = np.array(q.getpalette()[:n * 3]).reshape(-1, 3).astype(np.float64)
    pal_lab = srgb_to_lab(pal)
    return [palette_lock(im, pal, pal_lab)[0] for im in ims], pal


def ncolors(im):
    a = np.array(im.convert('RGBA'))
    op = a[a[..., 3] > 0][:, :3]
    return len(np.unique(op, axis=0)) if len(op) else 0


def crop_alpha(im, pad=2):
    bb = im.getbbox()
    if not bb:
        return im
    return im.crop((max(0, bb[0] - pad), max(0, bb[1] - pad), min(im.width, bb[2] + pad), min(im.height, bb[3] + pad)))


def up(im, k):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


def checker(w, h, s=8, c1=(226, 223, 216), c2=(214, 210, 202)):
    bg = Image.new('RGB', (w, h), c1)
    d = ImageDraw.Draw(bg)
    for y in range(0, h, s):
        for x in range(0, w, s):
            if ((x // s) + (y // s)) % 2:
                d.rectangle([x, y, x + s - 1, y + s - 1], fill=c2)
    return bg


def on_bg(im, bg=(233, 230, 223), checkered=False):
    base = checker(im.width, im.height) if checkered else Image.new('RGB', im.size, bg)
    base.paste(im, (0, 0), im)
    return base


def swatch(pal_hex, cols=16, s=18):
    rows = math.ceil(len(pal_hex) / cols)
    im = Image.new('RGB', (cols * s, rows * s), (255, 255, 255))
    d = ImageDraw.Draw(im)
    for i, h in enumerate(pal_hex):
        x, y = (i % cols) * s, (i // cols) * s
        d.rectangle([x, y, x + s - 1, y + s - 1], fill='#' + h)
    return im


def arrow(d, x0, y, x1, col=(120, 116, 108), w=4):
    d.line([(x0, y), (x1 - 12, y)], fill=col, width=w)
    d.polygon([(x1, y), (x1 - 16, y - 9), (x1 - 16, y + 9)], fill=col)


def load(name, r, kind):
    return Image.open(os.path.join(SP, '%s_r%d_%s.png' % (name, r, kind))).convert('RGBA')


# ------------------------------------------------------------------------------------------ build all palette-locked sprites
def lock_all():
    stats = {}
    for f in sorted(os.listdir(SP)):
        if f.endswith('_lo.png'):
            im = Image.open(os.path.join(SP, f)).convert('RGBA')
            pl, idx = palette_lock(im)
            pl.save(os.path.join(SP, f.replace('_lo.png', '_pal.png')))
            stats[f] = (ncolors(im), ncolors(pl))
    return stats


# ------------------------------------------------------------------------------------------ p1: the strip (rotation 0)
def strip(name='agent_vertical_farm', title='Agent-authored building -> sprite pipeline', r=0):
    hi = load(name, r, 'hi'); lo = load(name, r, 'lo'); pl = load(name, r, 'pal')
    hi_c, lo_c, pl_c = crop_alpha(hi, 6), crop_alpha(lo, 1), crop_alpha(pl, 1)
    K = 4
    H = pl_c.height * K                                             # the palette-locked upscale sets the row height
    hi_s = hi_c.resize((int(hi_c.width * H / hi_c.height), H), Image.LANCZOS)
    lo_up, pl_up = up(lo_c, K), up(pl_c, K)
    pad, gap = 40, 120
    W = pad + hi_s.width + gap + lo_c.width + 30 + lo_up.width + gap + pl_up.width + 60 + 300 + pad
    Ht = 150 + H + 200
    im = Image.new('RGB', (W, Ht), (236, 233, 226))
    d = ImageDraw.Draw(im)
    fT, fH, fS, fM = font('bold', 34), font('medium', 22), font('regular', 18), font('mono', 16)
    d.text((pad, 28), title, font=fT, fill=(30, 30, 34))
    d.text((pad, 76), 'specs/agent_vertical_farm.json  (33 parts, hand-written stand-in for an LLM author)  ->  kit.py (Blender 5.0 EEVEE)  ->  sprites.py (Pillow)',
           font=fS, fill=(90, 88, 84))
    y0 = 130
    x = pad
    im.paste(on_bg(hi_s, (236, 233, 226)), (x, y0), hi_s)
    d.text((x, y0 + H + 16), '1  3D render', font=fH, fill=(30, 30, 34))
    d.text((x, y0 + H + 46), 'EEVEE, 64 samples, AA on\n%dx%d px (6x scale)' % hi.size, font=fS, fill=(90, 88, 84))
    x += hi_s.width + 20
    arrow(d, x, y0 + H // 2, x + gap - 40)
    x += gap - 20
    im.paste(lo_c, (x, y0 + H - lo_c.height), lo_c)
    d.text((x - 6, y0 + H + 16), '1x', font=fS, fill=(90, 88, 84))
    x2 = x + lo_c.width + 30
    im.paste(lo_up, (x2, y0), lo_up)
    d.text((x, y0 + H + 16 + 30), '', font=fS)
    d.text((x2, y0 + H + 16), '2  low-res sprite, no AA', font=fH, fill=(30, 30, 34))
    d.text((x2, y0 + H + 46), '32 px/tile, 16 samples, filter 0 px\n%dx%d px, %d colours, alpha 0/255\nshown at 4x nearest' %
           (lo.size[0], lo.size[1], ncolors(lo)), font=fS, fill=(90, 88, 84))
    x = x2 + lo_up.width + 20
    arrow(d, x, y0 + H // 2, x + gap - 40)
    x += gap - 20
    im.paste(pl_up, (x, y0), pl_up)
    d.text((x, y0 + H + 16), '3  palette-locked sprite', font=fH, fill=(30, 30, 34))
    d.text((x, y0 + H + 46), 'nearest kit64 colour in CIELAB, no dither\n%d of 64 colours used, 4x integer upscale' % ncolors(pl),
           font=fS, fill=(90, 88, 84))
    x += pl_up.width + 60
    sw = swatch(KIT64, cols=8, s=34)
    im.paste(sw, (x, y0 + 30))
    d.text((x, y0), 'kit64 master palette', font=fH, fill=(30, 30, 34))
    d.text((x, y0 + 30 + sw.height + 12), 'one palette for every\nsprite in the game;\nSC2K-inspired ramps\n(not the original data)',
           font=fS, fill=(90, 88, 84))
    im.save(os.path.join(OUT, 'p1_sprite_strip.png'))
    return im


# ------------------------------------------------------------------------------------------ p2: all rotations
def rotations(name='agent_vertical_farm', label='Vertical Farm Tower Mk I'):
    his = [crop_alpha(load(name, r, 'hi'), 6) for r in range(4)]
    los = [crop_alpha(load(name, r, 'lo'), 1) for r in range(4)]
    pls = [crop_alpha(load(name, r, 'pal'), 1) for r in range(4)]
    K = 3
    ch = max(p.height for p in pls) * K
    cw = max(p.width for p in pls) * K
    pad, lab = 40, 250
    W = lab + 4 * (cw + pad) + pad
    Hh = 120 + 3 * (ch + 50) + 20
    im = Image.new('RGB', (W, Hh), (236, 233, 226))
    d = ImageDraw.Draw(im)
    d.text((pad, 26), '%s - 4 rotations x 3 stages' % label, font=font('bold', 32), fill=(30, 30, 34))
    d.text((pad, 70), 'rotations are produced by turning the model under a fixed camera + sun, so lighting stays screen-consistent',
           font=font('regular', 18), fill=(90, 88, 84))
    rows = [('3D render', 'AA, 64 spp'), ('low-res sprite', 'no AA, 4x'), ('palette-locked', 'kit64, 4x')]
    for ri, (t, s) in enumerate(rows):
        y = 120 + ri * (ch + 50)
        d.text((pad, y + ch // 2 - 30), t, font=font('medium', 24), fill=(30, 30, 34))
        d.text((pad, y + ch // 2 + 2), s, font=font('regular', 18), fill=(90, 88, 84))
        for r in range(4):
            x = lab + r * (cw + pad)
            if ri == 0:
                src = his[r]
                sc = min(cw / src.width, ch / src.height)
                spr = src.resize((int(src.width * sc), int(src.height * sc)), Image.LANCZOS)
            else:
                spr = up((los if ri == 1 else pls)[r], K)
            im.paste(spr, (x + (cw - spr.width) // 2, y + ch - spr.height), spr)
            if ri == 2:
                d.text((x + cw // 2 - 20, y + ch + 8), 'rot %d' % r, font=font('regular', 18), fill=(90, 88, 84))
    im.save(os.path.join(OUT, 'p2_sprite_rotations.png'))
    return im


# ------------------------------------------------------------------------------------------ p3: sprite sheet
def sheet():
    names = [('agent_vertical_farm', 4), ('spr_capsule_stack', 4), ('spr_res_tower', 1), ('spr_megacolumn', 1), ('spr_station', 1),
             ('spr_park', 1), ('spr_plaza', 1), ('tile_grass', 1), ('tile_paving', 1), ('tile_road', 1), ('tile_water', 1), ('tile_deck', 1)]
    cells = []
    for n, k in names:
        for r in range(k):
            cells.append((n, r, crop_alpha(load(n, r, 'pal'), 0)))
    K = 2
    pad = 24
    x, y, rowh = pad, 110, 0
    W = 1900
    placed = []
    for n, r, spr in cells:
        s = up(spr, K)
        if x + s.width + pad > W - 380:
            x = pad; y += rowh + 60; rowh = 0
        placed.append((x, y, s, n, r))
        x += s.width + pad
        rowh = max(rowh, s.height)
    Ht = y + rowh + 90
    im = checker(W, Ht, 10)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 90], fill=(236, 233, 226))
    d.text((pad, 20), 'Palette-locked sprite sheet (2x) - every sprite shares kit64, the same sun and the same camera',
           font=font('bold', 28), fill=(30, 30, 34))
    d.text((pad, 58), 'agent farm + capsule stack in 4 rotations; kit buildings and ground tiles; transparent = checkerboard',
           font=font('regular', 18), fill=(90, 88, 84))
    for (px, py, s, n, r) in placed:
        base_y = py + rowh_of(placed, py) - s.height
        im.paste(s, (px, base_y), s)
        lab = n.replace('agent_', '').replace('spr_', '').replace('tile_', 'tile ')
        d.text((px, py + rowh_of(placed, py) + 6), '%s r%d' % (lab, r), font=font('regular', 14), fill=(60, 58, 54))
    sw = swatch(KIT64, cols=8, s=40)
    im.paste(sw, (W - 350, 120))
    d.text((W - 350, 120 + sw.height + 10), 'kit64', font=font('medium', 20), fill=(30, 30, 34))
    im.save(os.path.join(OUT, 'p3_sprite_sheet.png'))
    return im


def rowh_of(placed, py):
    return max(s.height for (x, y, s, n, r) in placed if y == py)


# ------------------------------------------------------------------------------------------ p4: in-game mock
def cam_origin(name, r):
    c = json.load(open(os.path.join(SP, '%s_r%d_lo.cam.json' % (name, r))))
    im = Image.open(os.path.join(SP, '%s_r%d_lo.png' % (name, r)))
    rx, ry = im.size
    ppm = rx / c['scale']
    return rx / 2 - c['cx'] * ppm, ry / 2 + c['cy'] * ppm


def mock():
    N = 14
    ground = {(x, y): 'tile_grass' for x in range(N) for y in range(N)}
    for x in range(0, 7):
        for y in range(0, 7):
            ground[(x, y)] = 'tile_paving'
    for x in range(0, 7):
        for y in range(8, N):
            ground[(x, y)] = 'tile_paving' if (x * 3 + y) % 4 else 'tile_grass'
    for x in range(8, N):
        for y in range(8, N):
            ground[(x, y)] = 'tile_deck'
    for x in range(10, N):
        for y in range(0, 4):
            ground[(x, y)] = 'tile_water'
    for x in range(N):
        ground[(x, 7)] = 'tile_road'
    for y in range(N):
        ground[(7, y)] = 'tile_road'
    # (name, rot, mx, my, w, d) - footprint in tiles after rotation
    bld = [('agent_vertical_farm', 0, 4, 3, 2, 2),                       # the hero, front-left quadrant
           ('spr_plaza', 0, 3, 2, 1, 1), ('spr_plaza', 0, 6, 3, 1, 1), ('spr_park', 0, 4, 1, 1, 1), ('spr_park', 0, 5, 1, 1, 1),
           ('spr_res_tower', 0, 1, 1, 1, 1), ('spr_res_tower', 0, 1, 4, 1, 1), ('spr_park', 0, 2, 4, 1, 1),
           ('spr_capsule_stack', 1, 0, 2, 1, 2), ('spr_plaza', 0, 2, 1, 1, 1),
           # back-left: taller housing
           ('spr_capsule_stack', 0, 1, 10, 2, 1), ('spr_capsule_stack', 2, 4, 11, 2, 1), ('spr_res_tower', 0, 0, 12, 1, 1),
           ('spr_res_tower', 0, 3, 9, 1, 1), ('spr_res_tower', 0, 5, 9, 1, 1), ('agent_vertical_farm', 1, 1, 12, 2, 2),
           ('spr_park', 0, 4, 9, 1, 1), ('spr_park', 0, 6, 12, 1, 1),
           # back-right: megastructure deck with support nodes
           ('spr_megacolumn', 0, 8, 11, 2, 2), ('spr_megacolumn', 0, 11, 11, 2, 2), ('spr_megacolumn', 0, 11, 8, 2, 2),
           ('spr_megacolumn', 0, 8, 8, 2, 2), ('spr_plaza', 0, 10, 10, 1, 1),
           # front-right: station on the road, parks by the water
           ('spr_station', 0, 8, 5, 2, 1), ('spr_park', 0, 9, 3, 1, 1), ('spr_park', 0, 8, 1, 1, 1), ('spr_plaza', 0, 9, 4, 1, 1),
           ('spr_res_tower', 0, 12, 5, 1, 1), ('spr_park', 0, 11, 5, 1, 1)]
    pw, ph = N * 32 + 64, N * 16 + 480
    M0 = (32, 400)
    canvas = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))

    def put(name, r, mx, my):
        spr = load(name, r, 'pal')
        ox, oy = cam_origin(name, r)
        X = M0[0] + 16 * (mx + my)
        Y = M0[1] + 8 * (mx - my)
        canvas.alpha_composite(spr, (int(round(X - ox)), int(round(Y - oy))))
    for (x, y) in sorted(ground, key=lambda c: (c[0] - c[1], c[0])):        # back (small x-y) to front
        put(ground[(x, y)], 0, x, y)
    for (n, r, mx, my, w, d) in sorted(bld, key=lambda b: ((b[2] + b[4] - 1) - b[3], b[2] + b[3])):
        put(n, r, mx, my)
    bb = canvas.getbbox()
    canvas = canvas.crop((bb[0] - 8, bb[1] - 8, bb[2] + 8, bb[3] + 8))
    K = 3
    big = up(canvas, K)
    W, H = big.width + 80, big.height + 150
    im = Image.new('RGB', (W, H), (26, 28, 34))
    im.paste(big, (40, 120), big)
    d = ImageDraw.Draw(im)
    d.text((40, 24), 'In-game mock: the agent-authored farm among kit sprites (3x)', font=font('bold', 30), fill=(236, 233, 226))
    d.text((40, 66), '14x14 tiles at 32 px/tile, painter-sorted. Every pixel comes from a kit64 palette-locked sprite rendered by the same kit.py '
                     'camera; the farm appears twice (rotations 0 and 1).', font=font('regular', 17), fill=(170, 170, 176))
    inset = canvas
    ix, iy = W - inset.width - 40, H - inset.height - 40
    d.rectangle([ix - 10, iy - 34, ix + inset.width + 10, iy + inset.height + 10], fill=(40, 42, 50))
    im.paste(inset, (ix, iy), inset)
    d.text((ix, iy - 28), 'actual size (1x)', font=font('regular', 15), fill=(170, 170, 176))
    im.save(os.path.join(OUT, 'p4_ingame_mock.png'))
    canvas.save(os.path.join(SP, 'ingame_mock_1x.png'))
    return im


# ------------------------------------------------------------------------------------------ p5: agent loop panel
def agent_loop():
    v1 = subprocess.run([sys.executable, 'agent_check.py', 'specs/agent_vertical_farm.v1.json'], cwd=HERE, capture_output=True, text=True).stdout
    v2 = subprocess.run([sys.executable, 'agent_check.py', 'specs/agent_vertical_farm.json'], cwd=HERE, capture_output=True, text=True).stdout
    spec = json.load(open(os.path.join(HERE, 'specs', 'agent_vertical_farm.json')))
    lines = ['{', '  "meta": {', '    "name": "agent_vertical_farm",', '    "title": "%s",' % spec['meta']['title'],
             '    "footprint": {"w": 2, "d": 2, "max_levels": 14, "overhang": 0.5},', '    "logic": {']
    for k in ('category', 'inputs', 'outputs', 'housing'):
        lines.append('      "%s": %s,' % (k, json.dumps(spec['meta']['logic'][k])))
    lines.append('      "blueprint_steps": [%s ...]' % ', '.join('"%s"' % s for s in spec['meta']['logic']['blueprint_steps'][:3]))
    lines += ['    },', '    "sprite": {"px_per_tile": 32, "rotations": 4, "palette": "kit64"}', '  },', '  "parts": [']
    for p in spec['parts'][:1] + spec['parts'][3:5] + spec['parts'][12:14] + spec['parts'][27:28]:
        q = {k: p[k] for k in ('type', 'x', 'y', 'level', 'w', 'd', 'h') if k in p}
        if 'params' in p:
            q['params'] = p['params']
        js = json.dumps(q)
        lines.append('    ' + (js[:92] + '...' if len(js) > 92 else js) + ',')
    lines += ['    ... 33 parts', '  ]', '}']
    fM = font('mono', 15)
    W, H = 2100, 760
    im = Image.new('RGB', (W, H), (24, 25, 30))
    d = ImageDraw.Draw(im)
    d.text((40, 26), 'The agent loop: structured spec -> deterministic validator -> fixed renderer', font=font('bold', 30), fill=(236, 233, 226))
    d.text((40, 70), 'An LLM writes JSON against the kit vocabulary (kitschema.py); agent_check.py returns precise, actionable errors; only a PASS goes to kit.py.',
           font=font('regular', 17), fill=(170, 170, 176))
    y = 120
    d.text((40, y), 'specs/agent_vertical_farm.json (excerpt)', font=font('medium', 20), fill=(250, 214, 122))
    y += 34
    for ln in lines:
        d.text((40, y), ln, font=fM, fill=(206, 208, 214))
        y += 21
    x2, y = 1000, 120
    for title, txt in (('draft v1 (typical first-draft slips)', v1), ('revision 2 after feedback', v2)):
        d.text((x2, y), title, font=font('medium', 20), fill=(250, 214, 122))
        y += 34
        for ln in txt.strip().split('\n'):
            col = (206, 208, 214)
            if 'ERROR' in ln or 'FAIL' in ln:
                col = (255, 120, 110)
            elif 'PASS' in ln:
                col = (120, 230, 140)
            elif 'warn' in ln:
                col = (240, 200, 110)
            wrapped = [ln[i:i + 118] for i in range(0, len(ln), 118)]
            for w_ in wrapped:
                d.text((x2, y), w_, font=font('mono', 13), fill=col)
                y += 18
        y += 26
    im.save(os.path.join(OUT, 'p5_agent_loop.png'))
    return im


# ------------------------------------------------------------------------------------------ p6: palette comparison
def palette_compare(name='agent_vertical_farm'):
    los = [load(name, r, 'lo') for r in range(4)]
    ad, apal = adaptive_lock(los, 64)
    pls = [load(name, r, 'pal') for r in range(4)]
    K = 3
    cols = [('raw render (no AA)', los), ('adaptive 64 (median cut, shared by 4 rotations)', ad), ('kit64 master palette lock', pls)]
    c0 = crop_alpha(los[0], 1)
    bb = los[0].getbbox()
    cw, ch = (bb[2] - bb[0] + 2) * K, (bb[3] - bb[1] + 2) * K
    W = 3 * (cw * 2 + 60) + 80
    H = ch + 260
    im = Image.new('RGB', (W, H), (236, 233, 226))
    d = ImageDraw.Draw(im)
    d.text((40, 24), 'Palette strategies (rotations 0 and 1, 3x)', font=font('bold', 30), fill=(30, 30, 34))
    for ci, (t, ims) in enumerate(cols):
        x = 40 + ci * (cw * 2 + 60)
        d.text((x, 80), t, font=font('medium', 19), fill=(30, 30, 34))
        for r in range(2):
            s = up(ims[r].crop((bb[0] - 1, bb[1] - 1, bb[2] + 1, bb[3] + 1)), K)
            im.paste(s, (x + r * (cw + 10), 120), s)
        d.text((x, 130 + ch), 'colours: %s' % ' / '.join(str(ncolors(ims[r])) for r in range(4)), font=font('regular', 17),
               fill=(90, 88, 84))
    d.text((40, H - 70), 'Adaptive palettes look closest to the render but drift per building; a master palette is what keeps a whole city of\n'
                         'agent-authored buildings coherent (and enables SC2K-style palette animation for windows and water).',
           font=font('regular', 17), fill=(90, 88, 84))
    im.save(os.path.join(OUT, 'p6_palette_compare.png'))
    return im


if __name__ == '__main__':
    st = lock_all()
    for k, (a, b) in sorted(st.items()):
        if 'farm' in k or 'capsule' in k:
            print('%-40s colours %4d -> %2d' % (k, a, b))
    strip()
    rotations()
    sheet()
    mock()
    agent_loop()
    palette_compare()
    print('wrote p1..p6 to out/')
