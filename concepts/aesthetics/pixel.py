"""pixel.py - palette-lock the aliased renders to the Stratum palette (derived from the layer prototype's colours) and
build the pixel-art panels.  One panel repeats a subject with the SC2K-style kit64 palette for comparison.

    python3 pixel.py
"""
import math, os, sys
sys.dont_write_bytecode = True
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, '..', '..', 'experiments', 'concept-renders')))
import sprites as SP   # noqa: E402  (read-only reuse: srgb_to_lab, palette_lock, KIT64)

RAW = os.path.join(HERE, 'out', 'h', 'raw')
OUT = os.path.join(HERE, 'out', 'h')

# "stratum72": ramps taken from the Stratum layer prototype (experiments/megastructure-layers/src) plus a cool-white ramp
# for clean interiors and the prototype's own accents (coral cursor, signal yellow, mint, neon).
STRATUM = [
    # warm concrete / ink ramp
    '141312', '1d1915', '2a2724', '3a3835', '4f4a44', '6f695e', '8d877b', '9a9283', 'b2ac9d', 'cec7b5', 'd8d0bf', 'ece2cc', 'f6f1e4',
    # slate deck blues
    '1c2630', '2c3234', '3d4246', '565d61', '5a6b7c', '8796a5', 'a9b8c4',
    # terracotta / brick
    '5a2f22', '784331', '9c5c43', 'b3643c', 'cf8a5e',
    # ochre / sand
    '6e5a3c', '977e56', 'a58c62', 'c3a878', 'ca9c4a', 'e7c77e',
    # sage and foliage greens
    '44503f', '5e6c5b', '83947f', '2f4a24', '3f5f2c', '56733f', '6f9b4a', '8fb85c', 'b6c39b',
    # teal water
    '1f3b39', '23504b', '3f7d73', '6b958b', 'a8c3ba', '6fd0b8',
    # earth strata
    '231c16', '3b3129', '4f3f31', '6d5843', '8a7458',
    # lights at night
    '5a4a2a', 'b08a4e', 'd8a052', 'ffcf73', 'ffe0a0', 'fff4d6',
    # accents
    'ff6b4a', 'f4d35e', 'e8a83c', '9b2e1c', 'c86aa8', '3ae6ff', '2f5da0',
    # clean whites
    'b8c4cc', 'd4dde2', 'eef2f4', 'ffffff', '7b8894', '4a5563',
]
PAL_S = np.array([[int(h[i:i + 2], 16) for i in (0, 2, 4)] for h in STRATUM], dtype=np.float64)
PAL_S_LAB = SP.srgb_to_lab(PAL_S)


def font(size, bold=False):
    for c in (['/Library/Fonts/Roboto-Bold.ttf'] if bold else []) + ['/Library/Fonts/Roboto-Regular.ttf', '/System/Library/Fonts/Helvetica.ttc']:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()


def lock(name, pal='stratum'):
    im = Image.open(os.path.join(RAW, name + '.png')).convert('RGBA')
    if pal == 'stratum':
        out, _ = SP.palette_lock(im, PAL_S, PAL_S_LAB)
    else:
        out, _ = SP.palette_lock(im)
    return out


def on(im, bg=(46, 44, 41)):
    b = Image.new('RGB', im.size, bg)
    b.paste(im, (0, 0), im)
    return b


def up(im, k):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


def ncol(im):
    a = np.array(im.convert('RGBA'))
    op = a[a[..., 3] > 0][:, :3]
    return len(np.unique(op, axis=0)) if len(op) else 0


def panel(items, k, title, sub, out, bg=(46, 44, 41), cols=None, crop=True, max_w=2400):
    """items: [(image RGBA, caption)] -> labelled row(s) at integer upscale k."""
    ims = []
    for im, cap in items:
        if crop and im.mode == 'RGBA':
            bb = im.getbbox()
            if bb:
                im = im.crop((max(0, bb[0] - 4), max(0, bb[1] - 4), min(im.width, bb[2] + 4), min(im.height, bb[3] + 4)))
        ims.append((up(on(im, bg) if im.mode == 'RGBA' else im.convert('RGB'), k), cap))
    cols = cols or len(ims)
    pad, top, capw = 24, 70, 34
    rows = [ims[i:i + cols] for i in range(0, len(ims), cols)]
    W = max(sum(i.width for i, _ in r) + pad * (len(r) + 1) for r in rows)
    H = top + sum(max(i.height for i, _ in r) + capw + pad for r in rows) + pad
    S = Image.new('RGB', (W, H), (27, 27, 26))
    d = ImageDraw.Draw(S)
    d.text((pad, 14), title, fill=(236, 226, 204), font=font(24, True))
    d.text((pad, 44), sub, fill=(160, 152, 138), font=font(15))
    y = top
    for r in rows:
        x = pad
        rh = max(i.height for i, _ in r)
        for im, cap in r:
            S.paste(im, (x, y + (rh - im.height)))
            d.text((x, y + rh + 8), cap, fill=(200, 192, 176), font=font(15))
            x += im.width + pad
        y += rh + capw + pad
    if S.width > max_w:
        S = S.resize((max_w, int(S.height * max_w / S.width)), Image.NEAREST)
    S.save(out)
    print(out, S.size)


def main():
    os.makedirs(OUT, exist_ok=True)
    L = lambda n: lock(n)
    # 1. the block, three treatments
    items = [(L('a_blocky'), 'blocky'), (L('a_chamfered'), 'chamfered / hewn'), (L('a_tetrapod'), 'tetrapod-inspired')]
    panel(items, 2, 'The same block in pixel art: blocky, chamfered, tetrapod',
          '16 px per 4 m cell (the layer prototype\'s density), aliased EEVEE, locked to the 72-colour Stratum palette; shown at 2x',
          os.path.join(OUT, 'h1_block_pixels.png'))
    # 2. slopes: rational slopes at two densities
    s16, s32 = L('d_steps16'), L('d_steps32')
    panel([(s16, '16 px / cell: 1:1, 1:2, 2:1 (smooth | stepped)')], 3, 'Grid-rational slopes in 2:1 pixel isometric',
          'a level is set to exactly 8 px, so every slope edge is an integer pixel ratio; stepped versions are terraces of whole levels',
          os.path.join(OUT, 'h2_slopes16.png'))
    panel([(s32, '32 px / cell (zoomed LOD)')], 2, 'The same slopes at 32 px per cell',
          'doubling the density keeps the same grammar: 1:1 faces step 2 px across per 3 px up, 2:1 faces read as long shallow steps',
          os.path.join(OUT, 'h3_slopes32.png'))
    panel([(L('d_wall'), 'battered wall-city, inclined housing plane, bastion')], 2, 'Large-scale diagonals as sprites',
          '1:2 battered face with slot windows, 2:1 inclined plane, 1:3 bastion, 4:1 ramp', os.path.join(OUT, 'h4_wall_pixels.png'))
    # 3. spartan vs overgrown
    panel([(L('b_spartan'), 'spartan concrete'), (L('b_overgrown'), 'brutalism with plants')], 2, 'Spartan vs overgrown, as pixel art',
          'vegetation parts dropped by tag for the spartan version; moss and planting survive the palette lock as clean green ramps',
          os.path.join(OUT, 'h5_green_pixels.png'))
    # 4. LOD: one superblock at 8 / 16 / 32 px per cell
    panel([(L('f_brut08'), '8 px / cell'), (L('f_brut16'), '16 px / cell'), (L('f_brut32'), '32 px / cell')], 1,
          'One superblock at three pixel densities (continuous-zoom LOD)',
          'the same spec rendered at three resolutions; detail that is sub-pixel at 8 px (windows, vines) appears as the zoom closes in',
          os.path.join(OUT, 'h6_lod.png'))
    panel([(L('f_dys16'), 'dystopian'), (L('f_brut16'), 'overgrown brutalist'), (L('f_solar16'), 'solarpunk')], 1,
          'Superblock sprites in the three city styles', '16 px per cell, same camera, one palette', os.path.join(OUT, 'h7_styles.png'))
    # 5. in-game-like crops
    for n, t in (('e_interchange', 'Stack interchange at 16 px per cell'), ('c_gritty', 'Underground section, gritty palette'),
                 ('c_clean', 'Underground section, clean palette'), ('d_shafts', 'Inclined shafts in section')):
        panel([(L(n), '')], 2, t, 'opaque in-game-style crop, palette-locked', os.path.join(OUT, 'h8_%s.png' % n), crop=False)
    # 6. palette comparison: Stratum vs SC2K-style kit64 vs raw
    raw = Image.open(os.path.join(RAW, 'a_chamfered.png')).convert('RGBA')
    kit = lock('a_chamfered', 'kit64')
    st = lock('a_chamfered')
    panel([(raw, 'raw aliased render (%d colours)' % ncol(raw)), (st, 'Stratum palette (%d of %d)' % (ncol(st), len(STRATUM))),
           (kit, 'SC2K-style kit64 palette (%d of 64)' % ncol(kit))], 2, 'Palette comparison',
          'the Stratum palette keeps the warm-concrete / slate / terracotta ramps of the layer prototype; kit64 is the earlier SC2K-flavoured palette',
          os.path.join(OUT, 'h9_palettes.png'))
    # swatch
    sw = Image.new('RGB', (len(STRATUM) * 20, 28), (0, 0, 0))
    d = ImageDraw.Draw(sw)
    for i, h in enumerate(STRATUM):
        d.rectangle([i * 20, 0, i * 20 + 19, 27], fill='#' + h)
    sw.save(os.path.join(OUT, 'h0_palette.png'))


if __name__ == '__main__':
    main()
