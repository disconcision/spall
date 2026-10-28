"""
contact.py - the before/after panel for the kit extensions and the labelled contact sheet.

    python3 contact.py  -> out/extensions_before_after.png, out/contact_sheet.png
"""
import json, os, sys
sys.dont_write_bytecode = True   # never write __pycache__ into ../concept-renders (read-only)
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'concept-renders'))
from sprites import palette_lock, crop_alpha, up, font, ncolors, checker

OUT = os.path.join(HERE, 'out')
BG, INK, GREY = (236, 233, 226), (30, 30, 34), (90, 88, 84)


def pal_of(path):
    return crop_alpha(palette_lock(Image.open(path).convert('RGBA'))[0], 1)


def extensions_panel():
    pairs = [
        ('hydro_stack', 'out/iter/hydro_stack_v2_r0_lo.png', 'v2: stock greenhouse pods', 'growpod + growlight_px',
         'transparent glazing + pale grow-lights -> speckle; stripes survive the lock'),
        ('bridge_market', 'out/iter/bridge_market_v1_r0_lo.png', 'v1: antenna "lanterns"', 'lantern part + spine layout',
         '2 px red dots -> paper-lantern strings; stall fronts face both aisles'),
        ('hanging_garden', 'out/iter/hanging_garden_v1_r0_lo.png', 'v1: lightwell rim vines', 'vines part + trellis, reoriented',
         'random 2-9 m green poles -> controlled trailing/climbing vines'),
        ('tube_interchange', 'out/iter/tube_interchange_v3_r0_lo.png', 'v3: dithered glass', 'sprite glass remap (glass_px)',
         'glass locks to noise -> flat panes that lock to kit64 blues'),
        ('solar_chimney', 'out/iter/solar_chimney_v2_r0_lo.png', 'v2: lamp core + lightwell glow', 'sunpipe_px + dark frame',
         'white-on-white haze -> warm light pipe in a dark frame'),
    ]
    K = 3
    cells = []
    for bid, before, bl, al, why in pairs:
        b = pal_of(os.path.join(HERE, before))
        a = crop_alpha(Image.open(os.path.join(OUT, 'sprites', '%s_r0_pal.png' % bid)).convert('RGBA'), 1)
        cells.append((bid, up(b, K), up(a, K), bl, al, why, ncolors(b), ncolors(a)))
    colw = max(max(c[1].width, c[2].width) for c in cells) + 30
    rowh = max(max(c[1].height, c[2].height) for c in cells)
    W = 60 + len(cells) * (colw + 20)
    H = 150 + 2 * (rowh + 80) + 70
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((40, 22), 'Where the stock kit limited the look - kit64 sprites (32 px/tile, 3x) before and after each extension',
           font=font('bold', 28), fill=INK)
    d.text((40, 62), 'top: last draft using only the stock kit / stock materials;  bottom: final spec with the extension (all in agent-buildings/, '
           'kit.py unmodified)', font=font('regular', 17), fill=GREY)
    for i, (bid, b, a, bl, al, why, nb, na) in enumerate(cells):
        x = 40 + i * (colw + 20)
        for r, (img, lab, n) in enumerate(((b, bl, nb), (a, al, na))):
            y = 110 + r * (rowh + 80)
            bgc = checker(colw, rowh + 10, 8)
            im.paste(bgc, (x, y))
            im.paste(img, (x + (colw - img.width) // 2, y + rowh - img.height + 5), img)
            d.text((x, y + rowh + 16), '%s  (%d col)' % (lab, n), font=font('medium', 17), fill=INK if r else (150, 60, 50))
        words, lines, cur = why.split(), [], ''
        for w_ in words:
            t_ = (cur + ' ' + w_).strip()
            if d.textlength(t_, font=font('regular', 15)) <= colw - 10:
                cur = t_
            else:
                lines.append(cur); cur = w_
        lines.append(cur)
        for li, ln in enumerate(lines):
            d.text((x, 110 + 2 * (rowh + 80) - 22 + li * 20), ln, font=font('regular', 15), fill=GREY)
    im.save(os.path.join(OUT, 'extensions_before_after.png'))
    return im


def thumb(path, w, h):
    im = Image.open(path).convert('RGB')
    s = min(w / im.width, h / im.height)
    return im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)


def contact():
    W = 2400
    items = [
        ('section', 'Six agent-authored building types - 3D concept views (EEVEE, host context shown)'),
        ('grid3', [('out/concept/hydro_stack.png', '(a) hydroponic capsule stack in the undercroft (ghosted deck above)'),
                   ('out/concept/bridge_market.png', '(b) sky-bridge market between two cores, dusk'),
                   ('out/concept/hanging_garden.png', '(c) hanging garden on a shaft wall, growth in every direction'),
                   ('out/concept/tube_interchange.png', '(d) tube interchange: line A at L1.2, line B at L3.4'),
                   ('out/concept/solar_chimney.png', '(e) solar chimney: light pipe through six decks (context cropped)'),
                   ('out/concept/rooftop_village.png', '(f) rooftop squatter village on a Kowloon tenement')]),
        ('section', 'Sprites (32 px/tile, 4 rotations, kit64) and the SC2K-style in-game mock'),
        ('grid2', [('out/agent_sprite_sheet.png', 'agent_sprite_sheet.png - 6 types x 4 rotations, palette-locked'),
                   ('out/ingame_mock.png', 'ingame_mock.png - among stock kit sprites, on their hosts (3x + 1x inset)')]),
        ('section', 'Megastructure scene - the six specs placed as instances in a district of stock kit parts'),
        ('grid2', [('out/scene_golden_labelled.png', 'scene_golden_labelled.png - golden hour, labelled'),
                   ('out/scene_dusk.png', 'scene_dusk.png - dusk (grow-lights, lanterns, sun pipe, windows)')]),
        ('grid2', [('out/scene_vs_stock.png', 'scene_vs_stock.png - stock f_arcology.png vs the agent district'),
                   ('out/scene_dusk_close.png', 'scene_dusk_close.png - bridge market, village, chimney head, hydro stack')]),
        ('section', 'Per-building sheets (concept + 4 rotations x hi / 32 px / kit64 + gameplay numbers)'),
        ('grid3', [('out/sheets/%s.png' % b, 'sheets/%s.png' % b) for b in
                   ('hydro_stack', 'bridge_market', 'hanging_garden', 'tube_interchange', 'solar_chimney', 'rooftop_village')]),
        ('section', 'Honest log: kit limits and extensions, mistakes, validator blind spots'),
        ('grid2', [('out/extensions_before_after.png', 'extensions_before_after.png - stock-kit draft vs extension (kit64, 3x)'),
                   ('out/log_panel.png', 'log_panel.png - drafts, validator runs, reviews, every mistake and what caught it')]),
    ]
    blocks = []
    y = 120
    for kind, val in items:
        if kind == 'section':
            blocks.append(('text', y, val)); y += 56
            continue
        n = 3 if kind == 'grid3' else 2
        cw = (W - 80 - (n - 1) * 30) // n
        ch = int(cw * (0.66 if n == 3 else 0.72))
        rows = [val[i:i + n] for i in range(0, len(val), n)]
        for row in rows:
            ts = [thumb(os.path.join(HERE, p), cw, int(ch * 1.35)) for p, cap in row]
            rh = max(t.height for t in ts)
            for k, ((p, cap), t) in enumerate(zip(row, ts)):
                blocks.append(('img', (40 + k * (cw + 30) + (cw - t.width) // 2, y + (rh - t.height)), t, (40 + k * (cw + 30), y + rh + 8), cap))
            y += rh + 50
        y += 10
    H = y + 30
    im = Image.new('RGB', (W, H), (26, 28, 34))
    d = ImageDraw.Draw(im)
    d.text((40, 28), 'Agent-authored building types: spec -> validator -> fixed renderer (contact sheet)', font=font('bold', 36), fill=(236, 233, 226))
    d.text((40, 76), 'experiments/agent-buildings - six briefs written as kit-of-parts JSON specs + gameplay JSON by the agent, validated, rendered by the '
           'unmodified concept-renders/kit.py (Blender 5.0 EEVEE) with 3 extension parts', font=font('regular', 18), fill=(170, 170, 176))
    for b in blocks:
        if b[0] == 'text':
            d.text((40, b[1] + 10), b[2], font=font('medium', 26), fill=(250, 214, 122))
        else:
            _, pos, t, cpos, cap = b
            im.paste(t, pos)
            d.text(cpos, cap, font=font('regular', 17), fill=(206, 208, 214))
    im.save(os.path.join(OUT, 'contact_sheet.png'))
    print('contact_sheet.png', im.size)


if __name__ == '__main__':
    extensions_panel()
    contact()
