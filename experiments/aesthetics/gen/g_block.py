"""(a) The same brutalist block: blocky vs chamfered (same spec, style policy) vs tetrapod-inspired (spec variant)."""
import random
from common import Spec, write_jobs


def block(s, tetra=False):
    M = 'tetra' if tetra else 'bconc'
    s.add('ground', -30, -30, 0, 170, 140, 1, mat='paving', t=1.5, tags=['ground'])
    s.add('ground', -30, -30, 0.03, 170, 22, 1, mat='asphalt2', t=1.4, tags=['ground'])
    # podium: 2 storeys with a recessed glazed ground floor (tetrapod: battered base behind an armour revetment)
    if tetra:
        # no podium: a plaza ringed by a placed tetrapod revetment
        s.add('slab', 10, 10, 0.0, 60, 40, 0.8, mat='paving')
        s.add('armour', 2, -4, 0, 76, 12, 4, mat=M, unit='tetrapod', size=2.6, h0=2.0, slope_face='s', layers=1,
              mats=['tetra', 'tetra', 'tetra_old'])
        s.add('armour', 74, 6, 0, 10, 46, 4, mat=M, unit='tetrapod', size=2.6, h0=2.0, slope_face='e', layers=1,
              mats=['tetra', 'tetra', 'tetra_old'])
    else:
        s.add('bmass', 10, 10, 0, 60, 40, 7.0, mat=M, face='slots', faces=dict(n='blank', w='blank'), base='recess', roof='none', fh=3.5,
              lit=0.3, band=0.62)
        s.add('slab', 10, 10, 7.0, 60, 40, 0.4, mat='paving')
    # two cores rising through everything
    s.add('btower', 12, 21, 0, 11, 11, 58, mat=M, shape='round', slits=8, crown=3.5, lit=0.35)
    s.add('bmass', 57, 20, 0, 12, 12, 58, mat=M, face='blank', base='none', roof='plant', plant_h=3.5, plant_w=0.7, plant_d=0.7, hew=1)
    if tetra:
        from math import radians
        s.add('tetrapod', 10.5, 19.5, 58, 14, 14, 8, mat=M, size=6.0, yaw=30)
    # bar 1 on legs above the podium
    y0, y1 = 15, 35
    for x in (24, 34, 44, 54):
        for y in (y0 + 2.5, y1 - 2.5):
            if tetra:
                pass
            else:
                s.add('bcol', x - 1.2, y - 1.2, 7.4, 2.4, 2.4, 7.0, mat=M, shape='square', capital='flare')
    if tetra:
        # the bar rides on the upturned legs of giant standing tetrapods
        for k, x in enumerate((22, 34, 46, 58)):
            s.add('tetrapod', x - 10, 15, 0.0, 20, 20, 16, mat=M, size=10.6, yaw=(0 if k % 2 else 60))
    s.add('bmass', 14, y0, 14.4, 52, y1 - y0, 24.5, mat=M, faces=dict(s='eggcrate', n='eggcrate', e='fins', w='fins'), base='none',
          roof='parapet', parapet_h=1.8, fh=3.5, fw=3.25, dp=1.2, lit=0.45)
    # bar 2: cantilevered cross-bar on top
    s.add('bmass', 31, 0, 40.6, 18, 60, 14.0, mat=M, faces=dict(s='fins', n='fins', e='slots', w='slots'), base='none', roof='plant',
          plant_h=4.0, plant_w=0.55, plant_d=0.35, fh=3.5, fw=3.0, dp=1.0, lit=0.5, hew=2)
    if tetra:
        # diagonal tetrapod struts carrying the cantilevers down to the podium (1:1 in grid terms)
        # inverted-V tetrapod legs carry both cantilevers to the ground (about 1:3 in grid terms)
        for yc in (4.0, 56.0):
            for sx in (-1, 1):
                s.add('strut', 0, 0, 0, 1, 1, 1, mat=M, a=[40 + sx * 16.0, yc, 0.0], b=[40 + sx * 1.5, yc, 40.4], r0=1.7, r1=1.1, cap0=0.3)
        for i in range(8):
            s.add('tetrapod', 31.2 + i * 2.2, 0.4, 56.4, 2.2, 2.2, 2.0, mat=M, size=1.05, yaw=i * 37)
            s.add('tetrapod', 31.2 + i * 2.2, 57.4, 56.4, 2.2, 2.2, 2.0, mat=M, size=1.05, yaw=i * 53)
    # sky bridge to a stair tower
    s.add('bbeam', 69, 22.5, 26, 24, 6, 6.2, mat=M, windows=True, fh=3.1, lit=0.5, haunch=1.5)
    s.add('btower', 92, 19, 0, 12, 12, 40, mat=M, shape='octagon', slits=6, crown=2.5, lit=0.3)
    if tetra:
        s.add('tripod', 91, 18, 0, 14, 14, 12, mat=M, r=1.6, splay=6.5, node=0.6, legs=3, yaw=30)
    # people and a few cars for scale
    rng = random.Random(4)
    for k in range(26):
        s.add('figure', rng.uniform(-10, 100), rng.uniform(-10, 8), 0, 1, 1, 1)
    for k in range(9):
        s.add('vehicle', rng.uniform(-20, 140), rng.uniform(-22, -12), 0, 3, 1.5, 1, headlight=False)


s = Spec('a_block', style='brut', light='crisp', seed=11)
block(s)
s.write()
t = Spec('a_block_tetra', style='brut_hewn', light='crisp', seed=11)
block(t, tetra=True)
t.write()

CAM = dict(frame_bb=[-8, -10, 0, 106, 62, 58], frame_clip=False, camera=dict(margin=0.0, zoom=0.86))
common = dict(light='crisp', samples=40, **CAM)
write_jobs('a_block', [
    dict(spec='specs/a_block.json', out='out/a/a1_blocky.png', style='brut', **common),
    dict(spec='specs/a_block.json', out='out/a/a2_chamfered.png', style='brut_hewn', **common),
    dict(spec='specs/a_block_tetra.json', out='out/a/a3_tetrapod.png', style='brut_hewn', **common),
    dict(spec='specs/a_block.json', out='out/a/a2b_chamfered_close.png', style='brut_hewn', light='crisp_warm', samples=40,
         camera=dict(target=[40, 20, 30], ortho_scale=62)),
    dict(spec='specs/a_block_tetra.json', out='out/a/a3b_tetrapod_close.png', style='brut_hewn', light='crisp_warm', samples=40,
         camera=dict(target=[30, 8, 12], ortho_scale=58)),
])
