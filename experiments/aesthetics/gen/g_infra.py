"""(e) Infrastructure district: stack interchange, cable trunk splitting into branches, pipe racks, pneumatic tubes,
conveyors (open + covered gallery), and a water-slide terrace."""
import math
import random
from common import Spec, write_jobs, rpath
import paths as PT

rng = random.Random(12)
s = Spec('e_infra', style='brut_hewn', light='crisp_warm', seed=61)
s.add('ground', -60, -80, 0, 380, 360, 1, mat='paving', t=1.5)
for (x0, y0, w, d) in ((-60, 24, 380, 22), (78, -80, 22, 360)):
    s.add('ground', x0, y0, 0.03, w, d, 1, mat='asphalt2', t=1.4)


def hump(pts, h):
    n = len(pts)
    return [(p[0], p[1], p[2] + h * math.sin(math.pi * i / (n - 1))) for i, p in enumerate(pts)]


# ---- stack interchange: A along x at 12 m, B along y at 26 m, four directional flyovers with humps
s.add('highway', 0, 0, 0, 1, 1, 1, path=[[-60, 35, 12], [320, 35, 12]], lanes=2, dirs=2, piers=28, cars=3.0, pier0=10)
s.add('highway', 0, 0, 0, 1, 1, 1, path=[[89, -80, 26], [89, 280, 26]], lanes=2, dirs=2, piers=30, cars=3.0, pier0=5)
ramps = [((170, 44, 12), (-1, 0), (96, 120, 26), (0, 1), 12.0),
         ((82, 120, 26), (0, -1), (10, 44, 12), (-1, 0), 18.0),
         ((10, 27, 12), (1, 0), (82, -50, 26), (0, -1), 12.0),
         ((96, -50, 26), (0, 1), (170, 27, 12), (1, 0), 18.0)]
for (a, ta, b, tb, hh) in ramps:
    k = 46.0
    c1 = (a[0] + ta[0] * k, a[1] + ta[1] * k, a[2])
    c2 = (b[0] - tb[0] * k, b[1] - tb[1] * k, b[2])
    pts = PT.bezier(a, c1, c2, b, 40)
    pts = hump(pts, hh)
    s.add('highway', 0, 0, 0, 1, 1, 1, path=rpath(pts), lanes=1, dirs=1, lane_w=4.0, piers=24, cars=5.0, t=1.6, step=2.0)

# ---- factory + silos + conveyors
s.add('bmass', 170, 96, 0, 84, 62, 21, mat='bconc', face='slots', faces=dict(e='blank'), base='recess', roof='plant', plant_w=0.25,
      plant_d=0.3, lit=0.5, band=0.55)
for (x, y) in ((206, 186), (226, 186), (206, 206), (226, 206)):
    s.add('tank', x, y, 0, 18, 18, 46, mat='white_paint', legs=0)
s.add('conveyor', 0, 0, 0, 1, 1, 1, path=[[212, 157, 22.5], [214, 176, 36], [215, 190, 47]], p_w=1.6, cargo='ore', cover=True,
      legs=0, ground=0.0)
s.add('conveyor', 0, 0, 0, 1, 1, 1, path=[[168, 110, 6], [120, 110, 6], [120, 70, 6]], p_w=1.6, cargo='crates', legs=5, fillet=6, ground=0.0)
s.add('conveyor', 0, 0, 0, 1, 1, 1, path=[[168, 124, 9], [132, 124, 9], [132, 150, 9]], p_w=1.2, cargo='pods', legs=5, fillet=5, ground=0.0)
# ---- pipe racks (colour-coded), riser up the factory wall
s.add('piperack', 0, 0, 0, 1, 1, 1, path=[[110, 84, 7], [160, 84, 7], [160, 92, 7], [172, 92, 7]], tiers=2, n=8, fillet=4.0, racks=6)
s.add('piperack', 0, 0, 0, 1, 1, 1, path=[[250, 160, 3], [250, 176, 3], [250, 176, 30], [260, 176, 30]], pipes=[
    [0.6, 'pipe_yellow'], [0.45, 'pipe_blue'], [0.8, 'insul']], fillet=3.0, racks=0, posts=False)
# ---- towers and the cable trunk that splits into them
s.add('bmass', 158, 200, 0, 28, 26, 70, mat='bconc', faces=dict(s='eggcrate', e='fins', n='blank', w='fins'), base='recess', roof='plant',
      hew=1, lit=0.45)
s.add('bmass', 108, 205, 0, 28, 26, 60, mat='bconc', faces=dict(s='fins', e='eggcrate', n='blank', w='blank'), base='recess', roof='parapet',
      lit=0.45)
s.add('hub', 122, 150, 0, 16, 16, 6, mat='bconc', kind='box', band='hazard')
tree = dict(path=rpath([(130, 158, 5), (130, 158, 26), (140, 168, 33), (152, 178, 35)]), n=76, casing=[0.0, 0.42], children=[
    dict(path=rpath([(152, 178, 35), (160, 188, 37), (166, 196, 40), (168, 199.5, 42)]), n=32, children=[
        dict(path=rpath([(168, 199.5, 42), (164, 199.8, 48), (163, 200.2, 52)]), n=14),
        dict(path=rpath([(168, 199.5, 42), (176, 199.8, 40), (178, 200.2, 38)]), n=18)]),
    dict(path=rpath([(152, 178, 35), (140, 190, 38), (128, 200, 42), (124, 204.6, 44)]), n=24),
    dict(path=rpath([(152, 178, 35), (168, 176, 31), (186, 168, 24), (196, 160.5, 17)]), n=20)])
s.add('cabletree', 0, 0, 0, 1, 1, 1, tree=tree, r=0.24, clamps=11.0)
# ---- pneumatic tubes between the towers and down to the factory roof hub
s.add('ptube', 0, 0, 0, 1, 1, 1, path=[[136, 214, 46], [148, 213, 50], [158, 212, 50]], n=4, r=0.7, arrangement='row', pods=2.0, fillet=6)
s.add('ptube', 0, 0, 0, 1, 1, 1, path=[[176, 200, 58], [184, 186, 56], [200, 168, 44], [214, 150, 28.4]], n=4, r=0.65, arrangement='bundle',
      pods=1.6, fillet=10, hubs=[1])
s.add('ptube', 0, 0, 0, 1, 1, 1, path=[[108, 216, 30], [80, 216, 30], [80, 180, 22.5], [60, 160, 22.5]], n=3, r=0.6, arrangement='stack',
      pods=1.6, fillet=8)
# ---- water-slide terrace on a building roof
s.add('bmass', 4, 128, 0, 80, 64, 18, mat='bconc', face='slots', faces=dict(n='blank', w='blank'), base='recess', roof='none', lit=0.5, band=0.6)
s.add('slab', 4, 128, 18, 80, 64, 0.5, mat='paving')
s.add('cblock', 42, 138, 18.2, 36, 40, 1.4, mat='pool_tile', v=1.2, top=0.3)
s.add('cblock', 43.2, 139.2, 18.4, 33.6, 37.6, 1.3, mat='pool', v=0.9, top=0.0)
s.add('btower', 14, 146, 18, 12, 12, 34, mat='bconc_light', shape='octagon', slits=0, crown=0)
s.add('cblock', 11, 143, 52, 18, 18, 1.5, mat='bconc_light', v=2.0, top=0.5)
top = 53.0
sl = [('slide_teal', 'trough', PT.helix(20, 152, 10.5, top, 21.5, 2.25, a0=0, step=1.2)),
      ('slide_yellow', 'tube', PT.helix(20, 152, 15.5, top - 1.0, 21.5, 1.5, a0=120, step=1.2)),
      ('slide_red', 'trough', PT.catmull([(26, 152, top - 2), (40, 150, 46), (40, 180, 38), (20, 184, 31), (36, 170, 25), (52, 162, 21.2)], 1.2))]
for (m, kind, pts) in sl:
    pts = list(pts) + [(pts[-1][0] + 2.0 * (1 if pts[-1][0] < 60 else -1), pts[-1][1], pts[-1][2] - 0.4)]
    s.add('slide', 0, 0, 0, 1, 1, 1, path=rpath(pts), mat=m, kind=kind, p_w=1.6, posts=6.0, ground=18.5)
for k in range(30):
    s.add('figure', rng.uniform(10, 80), rng.uniform(132, 190), 18.5, 1, 1, 1)
for k in range(40):
    s.add('figure', rng.uniform(-40, 300), rng.uniform(-60, 250), 0, 1, 1, 1)
s.write()

write_jobs('e_infra', [
    dict(spec='specs/e_infra.json', out='out/e/e1_district.png', light='crisp_warm', frame_bb=[-50, -70, 0, 270, 240, 60],
         camera=dict(margin=0.0, zoom=0.86)),
    dict(spec='specs/e_infra.json', out='out/e/e2_interchange.png', light='crisp_warm', camera=dict(target=[90, 36, 14], ortho_scale=200)),
    dict(spec='specs/e_infra.json', out='out/e/e3_conduits.png', light='crisp_warm', camera=dict(target=[160, 180, 32], ortho_scale=110)),
    dict(spec='specs/e_infra.json', out='out/e/e4_slides.png', light='crisp_warm', camera=dict(target=[40, 160, 30], ortho_scale=90)),
], samples=40, max_lights=150)
