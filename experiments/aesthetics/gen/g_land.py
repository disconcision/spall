"""(g) Landscape with heterogeneous density: two dense megastructure cores, a linear wall-city, sparse districts, open land."""
import math, random
from common import Spec, write_jobs, rpath
import paths as PT
import terrain as TR

rng = random.Random(3)
LX, LY = 4200.0, 3000.0
river = [(-100, 2300), (700, 2050), (1500, 1650), (2300, 1500), (3000, 1150), (3700, 900), (4400, 700)]
coreA = (500, 700, 1400, 1450, 6.0)          # superblock core (west)
coreB = (2700, 1700, 3700, 2600, 14.0)       # arcology mountain (north-east)
wall = (1500, 1250, 3000, 1400, 4.0)         # linear wall-city along the river's south bank
farms = [(1500, 300, 2600, 1050, 3.0), (100, 1700, 800, 2150, 5.0)]
flats = [coreA + (160.0,), coreB + (200.0,), wall + (120.0,)] + [f + (140.0,) for f in farms]
field = dict(seed=5, amp=130.0, scale=1300.0, base=-4.0, river=river, flats=flats, river_w=70.0, river_depth=10.0)
F = TR.Field(seed=5, amp=130.0, scale=1300.0, base=-4.0, river=river, flats=[tuple(f) for f in flats], river_w=70.0, river_depth=10.0)

s = Spec('g_land', style='land', light='crisp_warm', seed=81)
s.add('terrain', 0, 0, 0, LX, LY, 1, field=field, res=30.0, bottom=-160.0, mat='terrain')
s.add('cblock', 0, 0, -9.2, LX, LY, 7.8, mat='sea', v=0, top=0)          # water table
for (x0, y0, x1, y1, z) in farms:
    s.add('ground', x0 + 60, y0 + 60, z + 0.3, x1 - x0 - 120, y1 - y0 - 120, 1, mat='fields', t=0.3)
# forests everywhere else
s.add('forest', 0, 0, 0, LX, LY, 1, field=field, density=10.0, size=[14, 24], cover=0.55, mask=650, zmin=2.0, zmax=150,
      avoid=[list(f[:4]) for f in [coreA, coreB, wall] + farms])
# core A: 3 x 3 superblocks of dark glass towers + a ring of lower superblocks
S, ST = 240.0, 50.0
for i in range(3):
    for j in range(3):
        x0, y0 = coreA[0] + 40 + i * (S + ST), coreA[1] + 40 + j * (S + ST)
        s.add('superblock', x0, y0, coreA[4], S, S, 1, style='dys', detail=0, n=4, gap=12, podium=24, hmin=160 if (i, j) == (1, 1) else 90,
              hmax=280 if (i, j) == (1, 1) else 170, uniform=0.6)
# core B: the arcology mountain: stepped terraces (2:1) on a battered base + towers on top
x0, y0, x1, y1, z = coreB
s.add('slopemass', x0 + 80, y0 + 80, z, 760, 700, 150, mat='fac_conc', slopes={'s': [2, 1], 'e': [2, 1], 'w': [2, 1], 'n': [2, 1]},
      stepped=True, step_levels=3, windows='bands', plant=True, lit=0.3)
s.add('superblock', x0 + 300, y0 + 280, z + 150, 280, 260, 1, style='brut', detail=0, n=3, gap=16, podium=10, hmin=90, hmax=180, uniform=0.5)
# the wall-city: a 1.5 km battered wall along the river (1:2 on the river side)
x0, y0, x1, y1, z = wall
s.add('slopemass', x0, y0, z, x1 - x0, y1 - y0, 84, mat='fac_conc2', slopes={'n': [1, 2]}, windows='slots', lit=0.3)
s.add('bmass', x0, y0, z + 84, x1 - x0, 40, 14, mat='bconc', face='slots', base='none', roof='parapet', lit=0.3)
# sparse districts: villages and a few small towers along the roads
for (cx, cy, n) in ((2000, 2400, 26), (3300, 450, 22), (1100, 2600, 18), (300, 250, 14)):
    pts = [(cx + rng.gauss(0, 90), cy + rng.gauss(0, 70)) for _ in range(n)]
    s.add('village', 0, 0, 0, 1, 1, 1, field=field, points=[[round(x, 1), round(y, 1)] for x, y in pts], size=[10, 18])
    for k in range(3):
        tx, ty = cx + rng.uniform(-150, 150), cy + rng.uniform(-120, 120)
        s.add('tower', tx, ty, F.height(tx, ty) - 1, 22, 22, rng.uniform(30, 60), style='brut', detail=0, mat='fac_conc')
# highways between the cores (draped on the terrain, lifted on piers across the river)


def road(pts, lift=6.0):
    out = []
    for p in PT.resample(pts, 20.0):
        z = max(F.height(p[0], p[1]), 0.0) + lift
        out.append((p[0], p[1], z))
    return out


h1 = road([(1000, 1450, 0), (1300, 1600, 0), (2000, 1900, 0), (2600, 2050, 0), (2900, 2100, 0)], lift=14.0)
h2 = road([(-100, 900, 0), (500, 1000, 0)], 10.0)
h3 = road([(1400, 900, 0), (2100, 1000, 0), (3000, 800, 0), (4300, 600, 0)], 10.0)
h4 = road([(2050, 1050, 0), (2100, 1300, 0), (2200, 1600, 0), (2300, 2400, 0), (2100, 3000, 0)], 12.0)
for pts in (h1, h2, h3, h4):
    s.add('highway', 0, 0, 0, 1, 1, 1, path=rpath(PT.catmull(pts, 10.0)), lanes=2, dirs=2, piers=60, cars=1.0, t=2.4, step=8.0,
          ground=-2.0, markings=False)
# a conveyor gallery from a quarry in the hills to core A
q = road([(300, 2400, 0), (600, 2000, 0), (800, 1600, 0), (900, 1450, 0)], 18.0)
s.add('conveyor', 0, 0, 0, 1, 1, 1, path=rpath(q), p_w=3.0, cover=True, cargo='none', legs=30.0, ground=-2.0)
s.write()

write_jobs('g_land', [
    dict(spec='specs/g_land.json', out='out/g/g1_landscape.png', light='crisp_warm', res=[2000, 1100],
         camera=dict(az=45, el=32, target=[LX / 2, LY / 2, 0], ortho_scale=4500), frame_bb=[0, 0, -100, LX, LY, 400],
         fog=dict(h=0.1, gamma=1.6, d=0.14, z_lo=-20, z_hi=420), samples=40, max_lights=60),
    dict(spec='specs/g_land.json', out='out/g/g2_landscape_cores.png', light='crisp_warm',
         camera=dict(az=45, el=34, target=[2400, 1700, 60], ortho_scale=2400), frame_bb=[0, 0, -100, LX, LY, 400],
         fog=dict(h=0.1, gamma=1.6, d=0.12, z_lo=-20, z_hi=420), samples=40, max_lights=60),
])
