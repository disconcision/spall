"""
scene_post.py - label the megastructure scene renders: each instance's top-centre is projected with the camera that
kit.py recorded in out/stats_scene.json, and a callout is drawn.  Also builds the side-by-side consistency panel
(stock f_arcology.png vs the district with the agent buildings).

    python3 scene_post.py  -> out/scene_golden_labelled.png, out/scene_dusk_labelled.png, out/scene_vs_stock.png
"""
import json, os, sys
sys.dont_write_bytecode = True   # never write __pycache__ into ../concept-renders (read-only)
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'concept-renders'))
from sprites import font
from geom import spec_bounds

CELL, LH = 4.0, 3.5
LAB = {'hydro_stack': '(a) hydroponic stack - undercroft, on the riser', 'bridge_market': '(b) sky-bridge market between cores',
       'hanging_garden': '(c) hanging garden on the shaft wall', 'tube_interchange': '(d) tube interchange',
       'solar_chimney': '(e) solar chimney through the deck', 'rooftop_village': '(f) rooftop village on a tenement'}
OFF = {'hydro_stack': (-260, 110), 'solar_chimney': (40, 150), 'bridge_market': (-80, -90), 'rooftop_village': (60, -120),
       'hanging_garden': (-40, -40), 'tube_interchange': (-160, -60)}


def project(p, cam, res):
    rx, ry = res
    sx = sum(a * b for a, b in zip(p, cam['right']))
    sy = sum(a * b for a, b in zip(p, cam['up']))
    ppm = rx / cam['scale']
    return rx / 2 + (sx - cam['cx']) * ppm, ry / 2 - (sy - cam['cy']) * ppm


def label(img_path, cam, insts, out_path, dark=True):
    im = Image.open(img_path).convert('RGB')
    d = ImageDraw.Draw(im)
    f = font('medium', 24)
    col = (250, 214, 122) if dark else (40, 36, 30)
    box = (30, 32, 40) if dark else (245, 240, 230)
    for inst in insts:
        bid = os.path.basename(inst['spec']).split('.')[0]
        spec = json.load(open(os.path.join(HERE, inst['spec'])))
        bb = spec_bounds(spec)
        ax, ay, al = inst['at']
        if bid == 'hydro_stack':      # under the deck: point at the visible front face, mid-height
            top = (bb[3] + ax * CELL - 4.0, bb[1] + ay * CELL + 1.0, (bb[2] + bb[5]) / 2 + al * LH - 2.0)
        else:
            top = ((bb[0] + bb[3]) / 2 + ax * CELL, (bb[1] + bb[4]) / 2 + ay * CELL, bb[5] + al * LH)
        px, py = project(top, cam, im.size)
        dx, dy = OFF.get(bid, (0, -80))
        t = LAB[bid]
        tw = d.textlength(t, font=f)
        tx = min(max(10, px + dx - tw / 2), im.width - tw - 10)
        ty = min(max(10, py + dy), im.height - 40)
        d.line([(px, py), (tx + tw / 2, ty + 16)], fill=col, width=3)
        d.ellipse([px - 6, py - 6, px + 6, py + 6], outline=col, width=3)
        d.rectangle([tx - 10, ty - 6, tx + tw + 10, ty + 34], fill=box, outline=col, width=2)
        d.text((tx, ty), t, font=f, fill=col)
    im.save(out_path)
    return im


def main():
    stats = {os.path.basename(s['out']): s for s in json.load(open(os.path.join(HERE, 'out', 'stats_scene.json')))}
    jobs = json.load(open(os.path.join(HERE, 'jobs', 'scene.json')))['jobs']
    insts = jobs[0]['instances']
    g = label(os.path.join(HERE, 'out', 'scene_golden.png'), stats['scene_golden.png']['camera'], insts,
              os.path.join(HERE, 'out', 'scene_golden_labelled.png'), dark=True)
    label(os.path.join(HERE, 'out', 'scene_dusk.png'), stats['scene_dusk.png']['camera'], insts,
          os.path.join(HERE, 'out', 'scene_dusk_labelled.png'), dark=True)
    # consistency panel: stock scene (existing art) next to the district with the six agent buildings
    stock = Image.open(os.path.join(HERE, '..', 'concept-renders', 'out', 'f_arcology.png')).convert('RGB')
    mine = Image.open(os.path.join(HERE, 'out', 'scene_golden_labelled.png')).convert('RGB')
    H = 900
    a = stock.resize((int(stock.width * H / stock.height), H), Image.LANCZOS)
    b = mine.resize((int(mine.width * H / mine.height), H), Image.LANCZOS)
    W = a.width + b.width + 90
    P = Image.new('RGB', (W, H + 150), (26, 28, 34))
    P.paste(a, (30, 110)); P.paste(b, (60 + a.width, 110))
    d = ImageDraw.Draw(P)
    d.text((30, 24), 'Same renderer, same kit, same camera: the stock canonical arcology (left) and a district built around the six agent-authored buildings (right)',
           font=font('bold', 26), fill=(236, 233, 226))
    d.text((30, 64), 'left: concept-renders/out/f_arcology.png (existing art, overcast)   |   right: out/scene_golden.png - six instances built by the unmodified kit.py builders (+3 extension parts) in one EEVEE render',
           font=font('regular', 17), fill=(170, 170, 176))
    P.save(os.path.join(HERE, 'out', 'scene_vs_stock.png'))
    print('wrote scene_*_labelled.png, scene_vs_stock.png')


if __name__ == '__main__':
    main()
