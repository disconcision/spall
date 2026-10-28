"""
post.py - Pillow half of the pipeline for the agent-authored buildings.

    python3 post.py

  * palette-locks every out/sprites/*_lo.png to kit64 with the STOCK palette_lock (concept-renders/sprites.py) -> *_pal.png
  * writes out/sprites/anchors.json: for every sprite, the pixel where world (0,0,0) (footprint min corner at level 0) lands
  * out/sheets/<id>.png: concept view + 4 rotations x (hi render, 32 px/tile sprite, kit64 sprite) + key logic numbers
  * out/agent_sprite_sheet.png: all six buildings x 4 rotations, kit64, 2x
"""
import json, math, os, sys
sys.dont_write_bytecode = True   # never write __pycache__ into ../concept-renders (read-only)
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'concept-renders'))
from sprites import palette_lock, crop_alpha, up, font, ncolors, checker, swatch, KIT64  # stock helpers

SP = os.path.join(HERE, 'out', 'sprites')
OUT = os.path.join(HERE, 'out')
IDS = ['hydro_stack', 'bridge_market', 'hanging_garden', 'tube_interchange', 'solar_chimney', 'rooftop_village']
TITLES = {'hydro_stack': '(a) Hydroponic Capsule Stack', 'bridge_market': '(b) Sky-Bridge Market',
          'hanging_garden': '(c) Hanging Garden', 'tube_interchange': '(d) Tube Interchange',
          'solar_chimney': '(e) Solar Chimney Light Well', 'rooftop_village': '(f) Rooftop Squatter Village'}
BG = (236, 233, 226)
INK = (30, 30, 34)
GREY = (90, 88, 84)


def origin_px(cam_path, png_path):
    c = json.load(open(cam_path))
    rx, ry = Image.open(png_path).size
    ppm = rx / c['scale']
    return rx / 2 - c['cx'] * ppm, ry / 2 + c['cy'] * ppm


def lock_all(sp=SP):
    stats, anchors = {}, {}
    for f in sorted(os.listdir(sp)):
        if not f.endswith('_lo.png'):
            continue
        p = os.path.join(sp, f)
        im = Image.open(p).convert('RGBA')
        pl, _ = palette_lock(im)
        pl.save(p.replace('_lo.png', '_pal.png'))
        stats[f] = (ncolors(im), ncolors(pl))
        cam = p.replace('.png', '.cam.json')
        if os.path.exists(cam):
            ox, oy = origin_px(cam, p)
            anchors[f.replace('_lo.png', '')] = dict(origin=[round(ox, 2), round(oy, 2)], size=list(im.size))
    with open(os.path.join(sp, 'anchors.json'), 'w') as fh:
        json.dump(anchors, fh, indent=1)
    return stats


def load(bid, r, kind):
    return Image.open(os.path.join(SP, '%s_r%d_%s.png' % (bid, r, kind))).convert('RGBA')


def logic_lines(bid):
    L = json.load(open(os.path.join(HERE, 'logic', bid + '.json')))
    fp = L['footprint']
    sv = L['services']

    def fmt_s(d):
        out = []
        for k, v in d.items():
            if isinstance(v, dict):
                nums = [('%s %s' % (kk, vv)) for kk, vv in v.items() if isinstance(vv, (int, float)) and not isinstance(vv, bool)][:2]
                out.append('%s (%s)' % (k, ', '.join(nums)) if nums else k)
            else:
                out.append(k)
        return '; '.join(out)
    eff = L['effects']
    e = []
    for k in ('light_air', 'land_value', 'noise'):
        if k in eff:
            v = eff[k]
            d = v.get('daylight_delta', v.get('delta', v.get('db', v.get('air_delta'))))
            e.append('%s %+g r%s' % (k, d if d is not None else 0, v.get('radius_cells', '-')))
    cap = ', '.join('%s %s' % (k, v) for k, v in L['capacity'].items() if isinstance(v, (int, float)) and v)
    steps = ' > '.join(s['name'] for s in L['construction'])
    return [
        'footprint %dx%d cells x %d levels, anchor: %s' % (fp['cells_w'], fp['cells_d'], fp['levels'], fp['anchor']),
        'capacity: %s' % cap,
        'jobs: %d  |  build %s cr, upkeep %s/day, %s days' % (L['jobs']['total'], L['economy']['build_cost'],
                                                            L['economy']['upkeep_per_day'], L['economy']['build_days']),
        'needs: %s' % fmt_s(sv.get('needs', {})),
        'provides: %s' % fmt_s(sv.get('provides', {})),
        'effects: %s' % ';  '.join(e),
        'drone steps: %s' % steps,
    ]


def building_sheet(bid):
    his = [crop_alpha(load(bid, r, 'hi'), 6) for r in range(4)]
    los = [crop_alpha(load(bid, r, 'lo'), 1) for r in range(4)]
    pls = [crop_alpha(load(bid, r, 'pal'), 1) for r in range(4)]
    con = Image.open(os.path.join(OUT, 'concept', bid + '.png')).convert('RGB')
    K = 3 if max(p.height for p in pls) < 170 else 2
    cw = max(max(p.width for p in pls) * K, 220)
    ch_s = max(p.height for p in pls) * K
    ch_h = int(ch_s * 1.0)
    pad = 30
    cols_w = 4 * (cw + pad)
    cth = 2 * ch_h + ch_s + 150
    con_s = con.resize((int(con.width * cth / con.height), cth), Image.LANCZOS) if con.height > cth else con
    if con_s.width > 900:
        s = 900 / con_s.width
        con_s = con_s.resize((900, int(con_s.height * s)), Image.LANCZOS)
    W = pad + con_s.width + 40 + 150 + cols_w + pad
    H = 110 + max(con_s.height, 3 * max(ch_h, ch_s) + 3 * 40) + 230
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((pad, 22), TITLES[bid], font=font('bold', 34), fill=INK)
    spec = json.load(open(os.path.join(HERE, 'specs', bid + '.json')))
    body = [p for p in spec['parts'] if 'context' not in p.get('tags', [])]
    d.text((pad, 68), 'brief: "%s"   |   spec: %d parts (+%d context), accepted draft %s' % (
        spec['meta']['brief'], len(body), len(spec['parts']) - len(body), spec['meta'].get('accepted_from', '?')),
        font=font('regular', 17), fill=GREY)
    y0 = 110
    im.paste(con_s, (pad, y0))
    d.text((pad, y0 + con_s.height + 6), '3D concept view (EEVEE, 64 spp; context parts shown)', font=font('regular', 15), fill=GREY)
    x0 = pad + con_s.width + 40
    rows = [('3D render', 'AA, 6x', his, None), ('32 px/tile', 'no AA, %dx' % K, los, K), ('kit64 lock', 'nearest CIELAB, %dx' % K, pls, K)]
    rh = max(ch_h, ch_s)
    for ri, (t, s, arr, k) in enumerate(rows):
        y = y0 + ri * (rh + 40)
        d.text((x0, y + rh // 2 - 24), t, font=font('medium', 20), fill=INK)
        d.text((x0, y + rh // 2 + 2), s, font=font('regular', 15), fill=GREY)
        for r in range(4):
            x = x0 + 150 + r * (cw + pad)
            if k is None:
                src = arr[r]
                sc = min(cw / src.width, rh / src.height)
                spr = src.resize((max(1, int(src.width * sc)), max(1, int(src.height * sc))), Image.LANCZOS)
            else:
                spr = up(arr[r], k)
            im.paste(spr, (x + (cw - spr.width) // 2, y + rh - spr.height), spr)
            if ri == 2:
                d.text((x + cw // 2 - 50, y + rh + 6), 'rot %d  (%d col)' % (r, ncolors(pls[r])), font=font('regular', 15), fill=GREY)
    ly = H - 215
    d.rectangle([pad, ly - 10, W - pad, H - 20], fill=(226, 222, 213))
    for i, ln in enumerate(logic_lines(bid)):
        d.text((pad + 14, ly + i * 27), ln[:190], font=font('mono' if i else 'medium', 16), fill=INK)
    os.makedirs(os.path.join(OUT, 'sheets'), exist_ok=True)
    im.save(os.path.join(OUT, 'sheets', bid + '.png'))
    return im


def sprite_sheet():
    cells = []
    for bid in IDS:
        for r in range(4):
            cells.append((bid, r, crop_alpha(load(bid, r, 'pal'), 0)))
    K = 2
    pad = 22
    W = 2300
    x, y, rowh, placed = pad, 120, 0, []
    fl = font('regular', 13)
    dd = ImageDraw.Draw(Image.new('RGB', (10, 10)))
    for bid, r, spr in cells:
        s = up(spr, K)
        cw = max(s.width, int(dd.textlength('%s r%d' % (bid, r), font=fl)) + 6)
        if x + cw + pad > W - 330:
            x = pad; y += rowh + 50; rowh = 0
        placed.append([x, y, s, bid, r])
        x += cw + pad
        rowh = max(rowh, s.height)
    Ht = y + rowh + 80
    im = checker(W, Ht, 10)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 100], fill=BG)
    d.text((pad, 18), 'Agent-authored buildings: palette-locked sprites (kit64, 32 px/tile, 2x) - same camera, sun and palette as the stock kit',
           font=font('bold', 26), fill=INK)
    d.text((pad, 60), 'six building types x 4 rotations; every sprite rendered by the unmodified kit.py builders (+3 extension parts) '
           'from a spec written by the agent', font=font('regular', 17), fill=GREY)
    rows = {}
    for p in placed:
        rows.setdefault(p[1], []).append(p)
    for yy, ps in rows.items():
        rh = max(p[2].height for p in ps)
        for (px, py, s, bid, r) in ps:
            im.paste(s, (px, py + rh - s.height), s)
            d.text((px, py + rh + 6), '%s r%d' % (bid, r), font=font('regular', 13), fill=(50, 50, 54))
    sw = swatch(KIT64, cols=8, s=36)
    im.paste(sw, (W - 310, 130))
    d.text((W - 310, 130 + sw.height + 8), 'kit64 master palette', font=font('medium', 18), fill=INK)
    im.save(os.path.join(OUT, 'agent_sprite_sheet.png'))
    return im


if __name__ == '__main__':
    st = lock_all()
    for k, (a, b) in sorted(st.items()):
        print('%-40s colours %4d -> %2d' % (k, a, b))
    with open(os.path.join(OUT, 'palette_stats.json'), 'w') as fh:
        json.dump({k: dict(raw=a, locked=b) for k, (a, b) in st.items()}, fh, indent=1)
    for bid in IDS:
        building_sheet(bid)
        print('sheet', bid)
    sprite_sheet()
    print('wrote out/sheets/*.png, out/agent_sprite_sheet.png')
