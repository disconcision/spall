"""
mock.py - SC2K-style in-game mock: the six agent-authored buildings among the stock kit sprites (p4_ingame_mock style).

    python3 mock.py      -> out/ingame_mock.png (3x, labelled, 1x inset) and out/sprites/ingame_mock_1x.png

Every pixel comes from a kit64 palette-locked sprite rendered by kit.py with the same camera.  Stock sprites and
ground tiles are read (read-only) from ../concept-renders/out/sprites; placement uses each sprite's camera JSON so
its world origin lands on the tile corner, and elevated buildings are lifted by level x 3.5 m x cos30 x 5.657 px/m.
"""
import json, math, os, sys
sys.dont_write_bytecode = True   # never write __pycache__ into ../concept-renders (read-only)
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
CR = os.path.normpath(os.path.join(HERE, '..', 'concept-renders'))
sys.path.insert(0, CR)
from sprites import up, font  # stock helpers

MINE = os.path.join(HERE, 'out', 'sprites')
STOCK = os.path.join(CR, 'out', 'sprites')
PX_LEVEL = 3.5 * math.cos(math.radians(30)) * 32 / (4 * math.sqrt(2))   # 17.15 px per level

_cache = {}


def sprite(name, r):
    key = (name, r)
    if key not in _cache:
        d = MINE if os.path.exists(os.path.join(MINE, '%s_r%d_pal.png' % (name, r))) else STOCK
        im = Image.open(os.path.join(d, '%s_r%d_pal.png' % (name, r))).convert('RGBA')
        c = json.load(open(os.path.join(d, '%s_r%d_lo.cam.json' % (name, r))))
        ppm = im.width / c['scale']
        _cache[key] = (im, im.width / 2 - c['cx'] * ppm, im.height / 2 + c['cy'] * ppm, d == MINE)
    return _cache[key]


NX, NY = 22, 18


def ground_map():
    g = {(x, y): 'tile_grass' for x in range(NX) for y in range(NY)}
    for x in range(0, 12):
        for y in range(12, NY):
            g[(x, y)] = 'tile_paving'                 # Kowloon quarter
    for x in range(13, NX):
        for y in range(5, NY):
            g[(x, y)] = 'tile_deck'                   # megastructure quarter
    for x in range(0, 12):
        for y in range(0, 11):
            if (x * 5 + y * 3) % 7 in (0, 3):
                g[(x, y)] = 'tile_paving'             # transit quarter plazas
    for x in range(13, NX):
        g[(x, 0)] = 'tile_water'
    for x in range(NX):
        g[(x, 11)] = 'tile_road'
    for y in range(NY):
        g[(12, y)] = 'tile_road'
    return g


# (name, rot, mx, my, level, w, d, bias)  - w, d = footprint in tiles after rotation
B = []


def add(name, mx, my, w=1, d=1, level=0.0, rot=0, bias=0):
    B.append((name, rot, mx, my, level, w, d, bias))


# --- transit quarter: interchange + two tube lines at different levels
add('tube_interchange', 4, 3, 3, 3)
for x in (0, 1, 2, 3, 7, 8, 9, 10):
    add('ctx_tubeA_pier' if x in (1, 8) else 'ctx_tubeA', x, 4, bias=(1 if x == 7 else 0))
for y in (0, 1, 2, 6, 7, 8, 9):
    add('ctx_tubeB_pier' if y in (1, 8) else 'ctx_tubeB', 5, y)
add('spr_plaza', 7, 1); add('spr_plaza', 8, 2); add('spr_park', 1, 1); add('spr_park', 2, 1); add('spr_res_tower', 0, 7)
add('spr_res_tower', 9, 7); add('spr_park', 8, 8); add('spr_capsule_stack', 1, 9, 2, 1); add('spr_plaza', 3, 7); add('spr_park', 10, 1)
# --- Kowloon quarter: rooftop village on a tenement, hanging garden on a shaft-wall block
add('ctx_tenement', 1, 13, 3, 3)
add('rooftop_village', 1, 13, 3, 3, level=4.0)
add('ctx_wallblock', 8, 14, 3, 2)
add('hanging_garden', 8, 13, 2, 1, level=2.0)
add('agent_vertical_farm', 9, 16, 2, 2, rot=1)
add('spr_res_tower', 0, 17); add('spr_res_tower', 6, 17); add('spr_capsule_stack', 4, 16, 2, 1)
add('spr_park', 5, 13); add('spr_park', 10, 12); add('spr_plaza', 6, 12); add('spr_plaza', 4, 13)
# --- megastructure quarter (south of the road): support nodes behind, hydro stack + riser in front of them
for (x, y) in ((13, 7), (16, 8), (19, 7)):
    add('spr_megacolumn', x, y, 2, 2)
add('hydro_stack', 15, 4, 2, 2)
add('ctx_riser', 17, 4)
add('spr_park', 13, 2); add('spr_plaza', 14, 1); add('spr_station', 18, 1, 2, 1); add('spr_plaza', 20, 3); add('spr_park', 13, 4)
# --- core quarter (north of the road): the sky-bridge market between a tall core and a low core; solar chimney
add('ctx_core', 13, 15, 2, 2)
add('bridge_market', 15, 15, 4, 2, level=5.0)
add('ctx_core_low', 19, 15, 2, 2)
add('solar_chimney', 19, 12, 2, 2)
add('spr_park', 16, 12); add('spr_plaza', 17, 13); add('spr_park', 14, 13)

LABEL_OFF = {'solar_chimney': (190, -40), 'bridge_market': (-120, -60), 'hanging_garden': (120, -10), 'hydro_stack': (60, 0)}
LABELS = {'hydro_stack': '(a) hydroponic stack + riser, undercroft', 'bridge_market': '(b) sky-bridge market between two cores',
          'hanging_garden': '(c) hanging garden on a shaft wall', 'tube_interchange': '(d) tube interchange, lines at 2 levels',
          'solar_chimney': '(e) solar chimney light well', 'rooftop_village': '(f) rooftop village on a tenement'}


def compose():
    M0 = (40, 8 * NY + 520)
    W, H = 16 * (NX + NY) + 80, 8 * (NX + NY) + 620
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    where = {}

    def put(name, r, mx, my, level=0.0):
        im, ox, oy, _ = sprite(name, r)
        X = M0[0] + 16 * (mx + my)
        Y = M0[1] + 8 * (mx - my) - level * PX_LEVEL
        pos = (int(round(X - ox)), int(round(Y - oy)))
        canvas.alpha_composite(im, pos)
        return pos, im.size
    g = ground_map()
    for (x, y) in sorted(g, key=lambda c: (c[0] - c[1], c[0])):
        put(g[(x, y)], 0, x, y)
    for (name, r, mx, my, level, w, d, bias) in sorted(B, key=lambda b: ((b[2] + b[5] - 1) - b[3] + b[7], -b[3], b[4])):
        pos, size = put(name, r, mx, my, level)
        if name in LABELS:
            where[name] = (pos, size)
    bb = canvas.getbbox()
    off = (bb[0] - 10, bb[1] - 10)
    canvas = canvas.crop((bb[0] - 10, bb[1] - 10, bb[2] + 10, bb[3] + 10))
    where = {k: ((p[0] - off[0], p[1] - off[1]), s) for k, (p, s) in where.items()}
    return canvas, where


def main():
    canvas, where = compose()
    canvas.save(os.path.join(MINE, 'ingame_mock_1x.png'))
    K = 3
    big = up(canvas, K)
    W, H = big.width + 80, big.height + 170 + 330
    im = Image.new('RGB', (W, H), (26, 28, 34))
    im.paste(big, (40, 130), big)
    d = ImageDraw.Draw(im)
    d.text((40, 24), 'In-game mock: six agent-authored building types among the stock kit sprites (3x)', font=font('bold', 32), fill=(236, 233, 226))
    d.text((40, 70), '%dx%d tiles at 32 px/tile, painter-sorted; every pixel is a kit64 palette-locked sprite from the same kit.py camera. '
           'Agent buildings sit on their hosts: bridge at level 5 between cores, garden 2 levels up a wall, village on a 4-level roof.' % (NX, NY),
           font=font('regular', 17), fill=(170, 170, 176))
    fL = font('medium', 22)
    for name, ((px, py), (sw, sh)) in where.items():
        # anchor = top-centre of the sprite's opaque bbox in the big image
        im1, _, _, _ = sprite(name, 0)
        bb = im1.getbbox()
        ax = 40 + (px + (bb[0] + bb[2]) / 2) * K
        ay = 130 + (py + bb[1]) * K
        lab = LABELS[name]
        tw = d.textlength(lab, font=fL)
        dx, dy = LABEL_OFF.get(name, (0, 0))
        tx = min(max(20, ax - tw / 2 + dx), W - tw - 20)
        ty = max(100, ay - 70 + dy)
        d.line([(ax, ay - 4), (min(max(ax, tx), tx + tw), ty + 30)], fill=(250, 214, 122), width=3)
        d.rectangle([tx - 8, ty - 4, tx + tw + 8, ty + 30], fill=(40, 42, 50), outline=(250, 214, 122), width=2)
        d.text((tx, ty), lab, font=fL, fill=(250, 214, 122))
    inset = canvas
    ix, iy = W - inset.width - 40, H - inset.height - 40
    d.rectangle([ix - 10, iy - 34, ix + inset.width + 10, iy + inset.height + 10], fill=(40, 42, 50))
    im.paste(inset, (ix, iy), inset)
    d.text((ix, iy - 28), 'actual size (1x)', font=font('regular', 15), fill=(170, 170, 176))
    im.save(os.path.join(HERE, 'out', 'ingame_mock.png'))
    print('out/ingame_mock.png', im.size, ' 1x', canvas.size)


if __name__ == '__main__':
    main()
