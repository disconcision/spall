"""(b) Spartan concrete vs brutalism with plants (cultivated, not post-apocalyptic): one spec, vegetation tagged 'green'."""
import random
from common import Spec, write_jobs

rng = random.Random(7)
s = Spec('b_complex', style='brut_hewn', light='crisp_warm', seed=21)
G = ['green']
s.add('ground', -40, -50, 0, 240, 190, 1, mat='paving', t=1.5)
s.add('ground', -40, -50, 0.03, 240, 16, 1, mat='asphalt2', t=1.4)
# sunken court with a pool
s.add('water', 30, 2, 0.05, 50, 14, 1, rim_mat='bconc_light')

# 1. stepped terrace block (1:1 grid slope: one cell back per level), 8 levels
s.add('slopemass', 0, 22, 0, 130, 36, 28, mat='bconc', slopes={'s': [1, 1]}, stepped=True, step_levels=1, windows='bands', lit=0.45)
for k in range(1, 8):
    y = 22 + 4.0 * k
    z = 3.5 * k
    s.add('edgeplanter', 2, y - 3.2, z, 126, 1.2, 1, mat='planter', ph=0.7, vine_len=[1.2, 3.2], density=0.8, flower=0.12, tags=G)
    for q in range(3):
        if rng.random() < 0.6:
            s.add('tree', rng.uniform(6, 124), y - 2.0, z, 1, 1, 1, height=rng.uniform(3.0, 5.0), tags=G)
# 2. tall slab block behind, egg-crate on its south face
s.add('bmass', 0, 58, 0, 130, 17, 52, mat='bconc', faces=dict(s='eggcrate', n='slots', e='fins', w='blank'), base='recess',
      roof='plant', plant_w=0.3, plant_d=0.6, plant_x=0.2, hew=2, fh=3.5, fw=3.2, lit=0.4)
s.add('roofgarden', 44, 60, 53.6, 80, 13, 1, trees=1.4, tree_h=[4, 8], big=0.35, edge_vines='s', vine_len=[3, 9], flower=0.1, tags=G)
# trailing plants from a few spandrels of the slab (Barbican balconies)
for k, z in enumerate((17.5, 28.0, 38.5)):
    for x0 in (6, 48, 90):
        if rng.random() < 0.8:
            s.add('vines', x0, 56.6, 0, rng.uniform(18, 30), 1.0, z, sides='s', len=[1.5, 5.0], density=0.9, flower=0.12, leaf=0.32,
                  tags=G)
# 3. megaframe tower at the east end, pods infilled
s.add('megaframe', 136, 30, 0, 36, 36, 84, mat='bconc', bx=12, by=12, bz=3, col=2.2, beam=2.0, haunch=1.6, pods=0.55,
      pod_mat='capsule_white', decks=[1, 4, 8], lit=0.45)
s.add('roofgarden', 136, 30, 84.2, 36, 36, 1, trees=1.0, big=0.4, border=1.0, edge_vines='sw', vine_len=[4, 12], tags=G)
s.add('bigtree', 146, 26, 42.3, 10, 6, 1, height=11, roots=8, drop=14, edge='s', tags=G)
# 4. round service tower at the west end + ivy
s.add('btower', -22, 40, 0, 16, 16, 70, mat='bconc', shape='round', slits=10, crown=4, lit=0.35)
s.add('ivy', -22, 40, 0, 16, 16, 38, face='s', cover=0.9, leaf=0.6, tags=G)
s.add('bbeam', -6, 45, 40, 6.2, 6, 5.5, mat='bconc', windows=True, lit=0.5)
# 5. bridge from the slab to the megaframe
s.add('bbeam', 130, 62, 45.5, 6.2, 6, 5.5, mat='bconc', windows=True, lit=0.5)
# plaza trees with hanging roots over the court edge, planters along the street
for x in (8, 20, 90, 104, 118):
    s.add('bigtree', x - 4, 4, 0, 8, 8, 1, height=rng.uniform(8, 11), tags=G)
for x in range(-30, 200, 14):
    s.add('planter', x, -30, 0, 8, 2, 1, ph=0.8, tags=G)
    s.add('tree', x + 4, -29, 0.8, 1, 1, 1, height=rng.uniform(4.5, 6.5), tags=G)
for k in range(40):
    s.add('figure', rng.uniform(-30, 190), rng.uniform(-26, 18), 0, 1, 1, 1)
for k in range(10):
    s.add('vehicle', rng.uniform(-40, 200), rng.uniform(-48, -38), 0, 3, 1.5, 1)
s.write()

CAM = dict(frame_bb=[-30, -40, 0, 180, 80, 90], camera=dict(margin=0.0, zoom=0.8, target=[76, 30, 30]))
write_jobs('b_green', [
    dict(spec='specs/b_complex.json', out='out/b/b1_spartan.png', style='brut_hewn', light='crisp', drop_tags=['green'], **CAM),
    dict(spec='specs/b_complex.json', out='out/b/b2_overgrown.png', style='overgrown', light='crisp', **CAM),
    dict(spec='specs/b_complex.json', out='out/b/b3_overgrown_close.png', style='overgrown', light='crisp',
         camera=dict(target=[135, 35, 40], ortho_scale=78)),
    dict(spec='specs/b_complex.json', out='out/b/b4_spartan_close.png', style='brut_hewn', light='crisp', drop_tags=['green'],
         camera=dict(target=[135, 35, 40], ortho_scale=78)),
], samples=40)
