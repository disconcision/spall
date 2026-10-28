"""
compose.py - the pixel-mode map for mock-up 8.

Block 07 cut at L8.5 (rendered by render/kit_ui.py through the kit64 sprite camera) is palette-locked to kit64 and
set into a district built only from the concept-renders kit64 sprites (tiles, towers, capsule stacks, parks, station,
megacolumn nodes, the stand-in vertical farm).  Every sprite shares one pixel lattice: tile (mx, my) has its world
origin at M0 + (16 (mx + my), 8 (mx - my)), exactly as in concept-renders/sprites.py.
Writes pixel/out/m8_map_2x.png (2x nearest, cropped to the 2560 x 1440 stage) + pixel/out/m8_map.json (lattice origin).
"""
import json, os, sys
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.normpath(os.path.join(HERE, '..', '..', 'concept-renders'))
sys.path.insert(0, KIT)
import sprites                                   # noqa: E402  (KIT64 + palette_lock; read-only use)
from PIL import Image                            # noqa: E402

SP = os.path.join(KIT, 'out', 'sprites')
RO = os.path.normpath(os.path.join(HERE, '..', 'render', 'out'))
OUT = os.path.join(HERE, 'out')


def load(name, r=0):
    return Image.open(os.path.join(SP, '%s_r%d_pal.png' % (name, r))).convert('RGBA')


def origin(name, r=0):
    c = json.load(open(os.path.join(SP, '%s_r%d_lo.cam.json' % (name, r))))
    im = Image.open(os.path.join(SP, '%s_r%d_lo.png' % (name, r)))
    rx, ry = im.size
    ppm = rx / c['scale']
    return rx / 2 - c['cx'] * ppm, ry / 2 + c['cy'] * ppm


GHOST_RAMP = ['1f3550', '2f4d6e', '44678a', '6285a6', '8aa9c4', 'b8cfe0']


def ghostify(im):
    """kit64 blueprint ghost: luminance -> blue ramp, checkerboard-dithered alpha, solid outline."""
    im = im.convert('RGBA')
    px = im.load()
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    po = out.load()
    ramp = [tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) for h in GHOST_RAMP]
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 128:
                continue
            edge = any(px[x + dx, y + dy][3] < 128 if 0 <= x + dx < w and 0 <= y + dy < h else True
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255
            if edge:
                po[x, y] = ramp[5] + (255,)
            elif (x + y) % 2 == 0:
                po[x, y] = ramp[min(4, 1 + int(lum * 4))] + (255,)
    return out


def main():
    # the arcology sprite (palette-locked) and its world-origin pixel
    arc_raw = Image.open(os.path.join(RO, 'm8_arc_px.png')).convert('RGBA')
    arc, _ = sprites.palette_lock(arc_raw)
    c = json.load(open(os.path.join(RO, 'm8_arc_px.cam.json')))
    rx, ry = c['res']; ppm = rx / c['scale']
    aox, aoy = rx / 2 - c['cx'] * ppm, ry / 2 + c['cy'] * ppm

    X0, X1, Y0, Y1 = -16, 38, -18, 28                 # tile extents of the district
    W = (X1 - X0 + Y1 - Y0) * 16 + 64
    H = (X1 - X0 + Y1 - Y0) * 8 + 520
    M0 = (32 + 16 * (0 - X0 + 0 - Y0) - 16 * (0 - Y0) * 2 + 0, 0)   # placeholder, fixed below
    # choose M0 so that tile (X0, Y1) (left-most) lands at x = 32 and tile (X0, Y0)... keep simple: centre the lattice
    M0 = (32 - 16 * (X0 + Y0), 400 - 8 * (X0 - Y1))
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))

    def put(name, r, mx, my, ghost=False):
        spr = load(name, r)
        if ghost:
            spr = ghostify(spr)
        ox, oy = origin(name, r)
        X = M0[0] + 16 * (mx + my); Y = M0[1] + 8 * (mx - my)
        canvas.alpha_composite(spr, (int(round(X - ox)), int(round(Y - oy))))

    # ---- ground
    ground = {}
    for x in range(X0, X1):
        for y in range(Y0, Y1):
            ground[(x, y)] = 'tile_grass' if (x * 7 + y * 3) % 11 else 'tile_paving'
    def fill(x0, x1, y0, y1, t):
        for x in range(x0, x1):
            for y in range(y0, y1):
                ground[(x, y)] = t
    fill(X0, X1, -9, -4, 'tile_water')                 # front canal (spec: y -8..-4)
    fill(24, 28, -4, 22, 'tile_water')                 # side canal (spec: x 24..28)
    fill(X0, 24, -4, -2, 'tile_paving')                # quay promenade
    fill(22, 24, -2, 18, 'tile_paving')
    fill(X0, X1, -11, -9, 'tile_road')                 # canal road
    fill(28, 30, Y0, Y1, 'tile_road')                  # east avenue
    fill(-5, -3, -4, Y1, 'tile_road')                  # west street
    fill(X0, 28, 19, 21, 'tile_road')                  # back street
    fill(30, X1, -9, 19, 'tile_deck')                  # neighbouring megastructure podium (east)
    fill(-3, 23, 17, 19, 'tile_paving')
    for (x, y) in list(ground):
        if -2 <= x < 23 and -2 <= y < 17:
            ground[(x, y)] = 'tile_paving'             # under Block 07 (hidden by its own slab)
    for (x, y) in sorted(ground, key=lambda k: (k[0] - k[1], k[0])):
        put(ground[(x, y)], 0, x, y)

    # ---- buildings (name, rot, mx, my, w, d)
    bld = [
        # canal quarter, across the water (front)
        ('spr_res_tower', 0, 2, -14, 1, 1), ('spr_res_tower', 0, 4, -13, 1, 1), ('spr_capsule_stack', 0, 7, -13, 2, 1),
        ('spr_capsule_stack', 2, 11, -14, 2, 1), ('spr_res_tower', 0, 14, -13, 1, 1), ('spr_park', 0, 15, -14, 1, 1),
        ('spr_plaza', 0, 16, -13, 1, 1), ('agent_vertical_farm', 0, 18, -15, 2, 2), ('spr_res_tower', 0, 21, -13, 1, 1),
        ('spr_park', 0, 9, -13, 1, 1), ('spr_park', 0, 0, -13, 1, 1), ('spr_capsule_stack', 1, -3, -15, 1, 2),
        ('spr_res_tower', 0, -7, -13, 1, 1), ('spr_plaza', 0, -9, -14, 1, 1), ('spr_park', 0, 24, -14, 1, 1),
        ('spr_capsule_stack', 0, 25, -13, 2, 1), ('spr_res_tower', 0, 31, -13, 1, 1), ('spr_park', 0, 33, -14, 1, 1),
        # east podium: support nodes + tube station where T1 leaves the block
        ('spr_megacolumn', 0, 31, 12, 2, 2), ('spr_megacolumn', 0, 31, 5, 2, 2), ('spr_megacolumn', 0, 35, 8, 2, 2),
        ('spr_station', 0, 31, 2, 2, 1), ('spr_plaza', 0, 34, 2, 1, 1), ('spr_park', 0, 34, -4, 1, 1), ('spr_park', 0, 35, -2, 1, 1),
        ('agent_vertical_farm', 1, 34, 14, 2, 2), ('spr_res_tower', 0, 33, -7, 1, 1),
        # west + back streets
        ('spr_station', 0, -8, 2, 2, 1), ('spr_res_tower', 0, -9, 6, 1, 1), ('spr_capsule_stack', 1, -8, 9, 1, 2),
        ('spr_park', 0, -7, -2, 1, 1), ('spr_plaza', 0, -9, -1, 1, 1), ('spr_res_tower', 0, -12, 12, 1, 1), ('spr_park', 0, -10, 15, 1, 1),
        ('spr_capsule_stack', 0, 2, 23, 2, 1), ('spr_res_tower', 0, 6, 23, 1, 1), ('spr_park', 0, 9, 22, 1, 1),
        ('spr_capsule_stack', 2, 13, 23, 2, 1), ('spr_res_tower', 0, 18, 22, 1, 1), ('spr_park', 0, 21, 23, 1, 1),
        ('spr_res_tower', 0, -2, 22, 1, 1),
        ('ghost:spr_capsule_stack', 0, 12, -12, 2, 1),      # queued stamp (pixel blueprint ghost)
    ]
    items = [((mx + w - 1) - my, mx + my, 'b', (n, r, mx, my)) for (n, r, mx, my, w, d) in bld]
    items.append(((22) - (-2), 20, 'arc', None))      # Block 07: front-most tile (22, -2)
    for key in sorted(items, key=lambda t: (t[0], t[1])):
        if key[2] == 'arc':
            X = M0[0]; Y = M0[1]                        # world origin of the arcology = tile (0, 0) corner
            canvas.alpha_composite(arc, (int(round(X - aox)), int(round(Y - aoy))))
        else:
            n, r, mx, my = key[3]
            if n.startswith('ghost:'):
                put(n[6:], r, mx, my, ghost=True)
            else:
                put(n, r, mx, my)

    bb = canvas.getbbox()
    canvas = canvas.crop(bb)
    M0c = (M0[0] - bb[0], M0[1] - bb[1])
    canvas.save(os.path.join(OUT, 'm8_map_1x.png'))
    # 2x nearest; crop a 1280 x 720 (1x) window so the stage is exactly 2560 x 1440
    cx1, cy1 = M0c[0] + 16 * (10.5 + 8) - 640 + 70, M0c[1] + 8 * (10.5 - 8) - 360 - 95
    win = canvas.crop((int(cx1), int(cy1), int(cx1) + 1280, int(cy1) + 720))
    bg = Image.new('RGBA', win.size, (13, 14, 17, 255))
    bg.alpha_composite(win)
    big = bg.resize((2560, 1440), Image.NEAREST)
    big.convert('RGB').save(os.path.join(OUT, 'm8_map_2x.png'))
    meta = dict(M0=[(M0c[0] - int(cx1)) * 2, (M0c[1] - int(cy1)) * 2], scale=2, tile=[32, 16],
                note='page px of the world origin (tile 0,0 corner, z = 0); tile (mx,my) -> M0 + 2*(16(mx+my), 8(mx-my))')
    json.dump(meta, open(os.path.join(OUT, 'm8_map.json'), 'w'), indent=1)
    # minimap: the whole district at 1/4, nearest, on the void colour, with the view window outlined
    mm = Image.new('RGBA', canvas.size, (13, 14, 17, 255)); mm.alpha_composite(canvas)
    mm = mm.resize((canvas.width // 4, canvas.height // 4), Image.NEAREST).convert('RGB')
    from PIL import ImageDraw
    d = ImageDraw.Draw(mm)
    d.rectangle([int(cx1) // 4, int(cy1) // 4, (int(cx1) + 1280) // 4, (int(cy1) + 720) // 4], outline=(255, 225, 58))
    mm.save(os.path.join(OUT, 'm8_minimap.png'))
    print('map', canvas.size, '-> stage 2560x1440; origin', meta['M0'])


if __name__ == '__main__':
    main()
