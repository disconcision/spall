"""(h) pixel-art renders: aliased EEVEE at a fixed px-per-metre (the prototype's 16 px per 4 m cell), fixed 2:1 camera.
Isolated sprites render on transparency; 'scene' crops render opaque like in-game views."""
import json, math, os
from common import Spec, write_jobs, ROOT, C

PPM16 = 16.0 / (4.0 * math.sqrt(2.0))      # 16 px per 4 m cell (prototype density)


def basis(az=45.0, el=30.0):
    a, e = math.radians(az), math.radians(el)
    fwd = (-math.cos(e) * math.sin(a), math.cos(e) * math.cos(a), -math.sin(e))
    right = (math.cos(a), math.sin(a), 0.0)
    up = (right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0])
    return right, up


def frame(bb, ppm, pad=6):
    right, up = basis()
    xs, ys = [], []
    for x in (bb[0], bb[3]):
        for y in (bb[1], bb[4]):
            for z in (bb[2], bb[5]):
                xs.append(x * right[0] + y * right[1] + z * right[2])
                ys.append(x * up[0] + y * up[1] + z * up[2])
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    # target point with the same screen centre (solve on the plane z = 0 is not needed: pass world centre)
    tgt = [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2]
    res = [int(math.ceil(w * ppm)) + 2 * pad, int(math.ceil(h * ppm)) + 2 * pad]
    res = [r + (r % 2) for r in res]
    return tgt, res


def sprite(spec, out, bb, ppm=PPM16, style=None, light='crisp', transparent=True, **kw):
    tgt, res = frame(bb, ppm)
    j = dict(spec=spec, out=out, light=light, res=res, camera=dict(az=45, el=30, target=tgt, px_per_m=ppm), filter_size=0.0,
             transparent=transparent, samples=16, bloom=0.0, nofog=True, max_lights=120)
    if style:
        j['style'] = style
    j.update(kw)
    return j


# single-superblock specs for the LOD demo
for key, st, light in (('brut', 'overgrown', 'green_day'), ('dys', 'city', 'br_night'), ('solar', 'city', 'solar_day')):
    s = Spec('h_superblock_' + key, style=st, light=light, seed=91)
    s.add('ground', -30, -30, 0, 300, 300, 1, mat={'brut': 'paving', 'dys': 'asphalt2', 'solar': 'grass'}[key], t=1.0)
    s.add('superblock', 0, 0, 0, 240, 240, 1, style=key, detail=2, n=4, gap=14, podium=20, hmin=110, hmax=190, uniform=0.55,
          spin=(30 if key == 'dys' else 0))
    s.write()
# slope study on a pixel-exact grid: a level is exactly 8 px at 16 px / cell
steps = json.load(open(os.path.join(ROOT, 'specs', 'd_steps.json')))
steps['meta']['grid'] = dict(cell=4.0, level=8.0 / (PPM16 * math.cos(math.radians(30))))
json.dump(steps, open(os.path.join(ROOT, 'specs', 'd_steps_px.json'), 'w'))

jobs = [
    sprite('specs/a_block.json', 'out/h/raw/a_blocky.png', [-6, -4, 0, 106, 62, 60], style='brut', drop_tags=['ground']),
    sprite('specs/a_block.json', 'out/h/raw/a_chamfered.png', [-6, -4, 0, 106, 62, 60], style='brut_hewn', drop_tags=['ground']),
    sprite('specs/a_block_tetra.json', 'out/h/raw/a_tetrapod.png', [-6, -8, 0, 106, 66, 60], style='brut_hewn', drop_tags=['ground']),
    sprite('specs/d_steps_px.json', 'out/h/raw/d_steps16.png', [-4, -4, 0, 272, 40, 44], style='brut_hewn', drop_tags=[]),
    sprite('specs/d_steps_px.json', 'out/h/raw/d_steps32.png', [-4, -4, 0, 272, 40, 44], ppm=PPM16 * 2, style='brut_hewn'),
    sprite('specs/d_wall.json', 'out/h/raw/d_wall.png', [-56, -20, 0, 226, 86, 68], style='brut_hewn', light='crisp_warm'),
    sprite('specs/b_complex.json', 'out/h/raw/b_spartan.png', [-26, -8, 0, 176, 78, 88], style='brut_hewn', drop_tags=['green']),
    sprite('specs/b_complex.json', 'out/h/raw/b_overgrown.png', [-26, -8, 0, 176, 78, 88], style='overgrown'),
    sprite('specs/h_superblock_brut.json', 'out/h/raw/f_brut16.png', [-4, -4, 0, 244, 244, 215], style='overgrown', light='green_day'),
    sprite('specs/h_superblock_brut.json', 'out/h/raw/f_brut08.png', [-4, -4, 0, 244, 244, 215], ppm=PPM16 / 2, style='overgrown',
           light='green_day'),
    sprite('specs/h_superblock_brut.json', 'out/h/raw/f_brut32.png', [-4, -4, 0, 244, 244, 215], ppm=PPM16 * 2, style='overgrown',
           light='green_day'),
    sprite('specs/h_superblock_dys.json', 'out/h/raw/f_dys16.png', [-4, -4, 0, 244, 244, 215], style='city', light='br_haze'),
    sprite('specs/h_superblock_solar.json', 'out/h/raw/f_solar16.png', [-4, -4, 0, 244, 244, 215], style='city', light='solar_day'),
    # in-game style crops (opaque)
    dict(sprite('specs/e_infra.json', 'out/h/raw/e_interchange.png', [-10, -60, 0, 190, 130, 40], transparent=False, light='crisp_warm'),
         style='brut_hewn'),
    dict(sprite('specs/c_under.json', 'out/h/raw/c_gritty.png', [-2, 12, -54, 98, 46, 10], style='ug_grit', light='ug_grit', transparent=False),
         view=dict(mode='full', crop=[-0.2, 3.0, 24.05, 11.5]), poche='poche_dark'),
    dict(sprite('specs/c_under.json', 'out/h/raw/c_clean.png', [-2, 12, -54, 98, 46, 10], style='ug_clean', light='ug_clean', transparent=False),
         view=dict(mode='full', crop=[-0.2, 3.0, 24.05, 11.5]), poche='poche_light', poche_map={'rock': 'poche_light'}),
    dict(sprite('specs/d_shafts.json', 'out/h/raw/d_shafts.png', [-8, 20, -120, 172, 40, 26], style='brut_hewn', light='section',
                transparent=False), view=dict(mode='full', crop=[-2.5, 5.0, 42.5, 10.0]), poche='poche_dark'),
]
write_jobs('h_pixel', jobs)
