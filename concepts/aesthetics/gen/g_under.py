"""(c) one underground section in three palettes; (d) heterogeneous section: dense layers, void, borehole, hangar."""
import math
import random
from common import Spec, write_jobs

rng = random.Random(9)

# ------------------------------------------------------------------------------------------------ (c) underground palettes
s = Spec('c_under', style='ug_grit', light='ug_grit', seed=41)
X1, Y1, D = 96.0, 44.0, 52.0      # diorama: x 0..96, y 0..44 (cut at y = 12), depth 52
rooms = [
    [2, 2, -12, 94, 42, -2.5],        # L-1 concourse
    [2, 2, -25, 94, 42, -14.5],       # L-2 services
    [2, 2, -50, 60, 42, -27.5],       # L-3/4 tall hall
    [62, 16, -50, 90, 42, -27.5],     # L-3/4 transit tunnel hall
    [70, 20, -14.5, 80, 30, -12],     # lift slot through the slab
]
s.add('earth2', 0, 0, -D, X1, Y1, D, mat='rock', voids=[[v[0], v[1], v[2] + D, v[3], v[4], v[5] + D] for v in rooms])
# L-1 concourse: columns, light strips, signs, planters, people, a kiosk
s.add('lining', 2, 2, -12, 92, 40, 9.5, walls='nw', lights='strip', light_mat='ug_light', power=260, cols=[6, 2], col=1.0,
      people=26, signs=4, plants=4)
for x in (12, 40, 66):
    s.add('cblock', x, 26, -11.75, 8, 5, 3.2, mat='ug_wall2', v=0.5, top=0.3)
    s.add('cblock', x + 0.5, 25.8, -9.5, 7, 0.3, 0.8, mat='ug_sign', v=0, top=0)
s.add('stairs', 80, 20, -12, 12, 3.6, 9.5, mat='ug_col', rail=True)
# L-2 services: pipe racks, ducts, trays, a fan, machines, crates
s.add('lining', 2, 2, -25, 92, 40, 10.5, walls='nw', lights='strip', light_mat='ug_light', power=220, light_step=6.0, stripe=True)
s.add('piperack', 0, 0, 0, 1, 1, 1, path=[[4, 34, -18], [70, 34, -18], [70, 26, -18], [92, 26, -18]], pipes=[
    [0.55, 'ug_pipe'], [0.4, 'ug_pipe2'], [0.7, 'ug_duct'], [0.35, 'ug_pipe'], [0.45, 'ug_pipe2']], racks=6, ground=-24.7, fillet=2.5)
s.add('piperack', 0, 0, 0, 1, 1, 1, path=[[4, 20, -21.8], [60, 20, -21.8], [60, 12, -21.8]], pipes=[
    [0.3, 'ug_pipe2'], [0.3, 'ug_pipe'], [0.5, 'ug_duct']], racks=5, ground=-24.7, fillet=2.0, posts=True)
s.add('fan', 20, 41.4, -24.5, 9, 1, 9, mat='ug_steel', R=3.6, blades=7)
for x in (34, 48):
    s.add('hub', x, 24, -24.75, 6, 6, 4.5, mat='ug_duct', kind='drum', band='ug_accent')
for k in range(10):
    s.add('cblock', rng.uniform(4, 90), rng.uniform(4, 16), -24.75, 1.6, 1.6, 1.4, mat=rng.choice(['crate_a', 'crate_b', 'ug_trim']), v=0.1, top=0.1)
s.add('cablespan', 0, 0, 0, 1, 1, 1, a=[4, 40, -15.8], b=[92, 40, -15.8], n=6, sag=0.4, r=0.09)
# L-3/4 tall hall: a workshop floor with a mezzanine walkway, crane, a shaft in the floor
s.add('lining', 2, 2, -50, 58, 40, 22.5, walls='nw', lights='panel', light_mat='ug_light2', power=520, cols=[3, 1], col=1.6)
s.add('walkway', 0, 0, 0, 1, 1, 1, path=[[4, 38, -38], [56, 38, -38]], p_w=2.4, mat='grating', rail_mat='ug_rail', hang=-27.8, lamps=7)
s.add('walkway', 0, 0, 0, 1, 1, 1, path=[[30, 38, -38], [30, 14, -38], [58, 14, -38]], p_w=1.8, mat='grating', rail_mat='ug_rail', hang=-27.8, lamps=8)
s.add('hangar', 4, 4, -49.75, 54, 36, 21.5, shell='none', cranes=1, runway_z=17.0, rib_mat='ug_col', crane_mat='ug_trim',
      floor_mat='ug_floor', markings=True, lights=0, loads=[[30, 22, 10, 8, 4, 'ug_wall2']], runway_mat='ug_col')
for k in range(3):
    s.add('robotarm', 10 + k * 12, 8, -49.75, 3, 3, 3, mat='ug_trim', reach=5.0, weld=(k == 1))
s.add('conveyor', 0, 0, 0, 1, 1, 1, path=[[4, 12, -48.5], [56, 12, -48.5]], p_w=1.4, cargo='crates', frame_mat='ug_trim', legs=4, ground=-49.75,
      crate_mats=['crate_a', 'crate_b', 'ug_wall2'])
# transit hall with a train
s.add('lining', 62, 16, -50, 28, 26, 22.5, walls='n', lights='strip', light_mat='ug_light', power=420, cols=[2, 1], col=1.4, people=10)
s.add('tube', 60, 24, -49.5, 36, 9, 7, mat='ug_steel', train=True, train_len=34)
# lift core and shaft through all levels
s.add('elevator', 71, 21, -50, 8, 8, 50, mat='ug_trim', cabs=3)
# surface cap: a plaza with pavilions
s.add('ground', -4, -4, 0, 104, 52, 1, mat='paving', t=0.4)
s.add('bmass', 66, 17, 0, 18, 18, 7, mat='bconc', face='fins', base='none', roof='parapet', lit=0.5, faces=dict(w='blank'))
for k in range(12):
    s.add('tree', rng.uniform(4, 60), rng.uniform(14, 40), 0, 1, 1, 1, height=rng.uniform(5, 8))
for k in range(20):
    s.add('figure', rng.uniform(4, 94), rng.uniform(13, 40), 0, 1, 1, 1)
s.write()

CROP = [-0.2, 3.0, 24.05, 11.5]   # cells: x -0.8..96.2, y 12..46
FR = [-2, 12, -54, 98, 46, 10]
common = dict(view=dict(mode='full', crop=CROP), frame_bb=FR, camera=dict(az=36, el=22, margin=0.02), res=[1600, 1100],
              fog=dict(h=0.0, d=0.0), max_lights=300)
write_jobs('c_under', [
    dict(spec='specs/c_under.json', out='out/c/c1_gritty.png', style='ug_grit', light='ug_grit', poche='poche_dark', **common),
    dict(spec='specs/c_under.json', out='out/c/c2_between.png', style='ug_mid', light='ug_mid', poche='poche_dark', **common),
    dict(spec='specs/c_under.json', out='out/c/c3_clean.png', style='ug_clean', light='ug_clean', poche='poche_light',
         poche_map={'rock': 'poche_light'}, **common),
], samples=40)

# ------------------------------------------------------------------------------------------------ (d) heterogeneous section
h = Spec('d_hetero', style='overgrown', light='section', seed=51)
W, DY, TOP, BOT = 150.0, 48.0, 0.0, -190.0
BX, BY, BR = 118.0, 18.0, 22.0          # borehole centre and radius (the section cuts through its axis)
void = [4, 2, -96, 146, 46, -58]        # the multi-level void (38 m, ~11 levels)
hang = [4, 2, -160, 86, 46, -118]       # hangar
bore_sq = [BX - BR - 1.5, BY - BR - 1.5, BOT, BX + BR + 1.5, BY + BR + 1.5, -96]
dense = [0, 0, -52, W, DY, 0]          # dense layers are built, not earth
voids = [dense, void, hang, bore_sq, [86, 18, -150, 97, 34, -122]]
h.add('earth2', 0, 0, BOT, W, DY, -BOT, mat='rock', voids=[[v[0], v[1], v[2] - BOT, v[3], v[4], v[5] - BOT] for v in voids])
# dense layers: decks every 3 levels with packed capsule infill (Kowloon-dense), columns, a tube and service decks
for k, z in enumerate((-52, -41.5, -31, -20.5, -10)):
    h.add('deck', 0, 0, z + 1.0, W, DY, 1.0, mat='bconc', t=1.0, fascia='bconc_dark')
    x = 0.0
    while x < W - 4:
        w = rng.choice((6, 8, 8, 10, 12))
        y = 0.0
        while y < DY - 4:
            d = rng.choice((6, 8, 10))
            if rng.random() < 0.85:
                hh = rng.choice((1, 2, 2, 3)) * 3.5 - 0.3
                h.add('capsule', x + 0.3, y + 0.3, z + 1.0, w - 0.6, d - 0.6, min(hh, 9.0), mat=rng.choice(
                    ['panel', 'capsule_white', 'k_cream', 'k_grey', 'panel', 'bconc_light']),
                    win=rng.choice(['grid', 'grid', 'band']), lit=0.55, interior=True, ac=0.3)
            y += d
        x += w
for x in (0, 30, 60, 90, 120, 148):
    h.add('megacolumn', x, 22, -96, 2.4, 2.4, 44, mat='bconc', capital=False, plinth=False)
h.add('tube', 0, 30, -41.0, W, 8, 8, mat='tube', train=True, train_len=60)
# the void: sparse walkways at several heights and angles, stairs, platforms, pendants, cables
wk = dict(p_w=2.0, mat='grating', rail_mat='steel', lamps=9, lamp_col=[1.0, 0.75, 0.45])
h.add('walkway', 0, 0, 0, 1, 1, 1, path=[[4, 32, -66], [60, 32, -66], [90, 22, -66]], hang=-58.2, **wk)
h.add('walkway', 0, 0, 0, 1, 1, 1, path=[[20, 46, -78], [20, 21, -78], [84, 21, -78]], hang=-58.2, **wk)
h.add('walkway', 0, 0, 0, 1, 1, 1, path=[[44, 19, -88], [44, 46, -88]], keel=True, **wk)
h.add('walkway', 0, 0, 0, 1, 1, 1, path=[[4, 24, -84], [40, 24, -84], [90, 40, -72]], **wk)
h.add('stairs', 60, 26, -78, 14, 2.4, 12, mat='steel', rail=True)
for (x, y, z) in ((4, 36, -70), (4, 24, -90), (70, 38, -80)):
    h.add('cblock', x, y, z - 0.8, 8, 6, 0.8, mat='bconc_light', v=0.3, top=0.2)
h.add('pendant', 10, 20, -96, 80, 26, 38, n=14, drop=[5, 22], col=[1.0, 0.72, 0.42], power=1400)
h.add('cablespan', 0, 0, 0, 1, 1, 1, a=[4, 44, -61], b=[146, 44, -63], n=5, sag=5.0)
h.add('cablespan', 0, 0, 0, 1, 1, 1, a=[4, 6, -60], b=[88, 24, -60], n=3, sag=7.0, r=0.12)
h.add('roots', 30, 20, -96, 40, 24, 38, n=18, reach=0.15, r=0.14)
h.add('vines', 4, 43, -96, 80, 1, 38, sides='s', len=[3, 14], density=0.5, leaf=0.45)
for k in range(10):
    h.add('figure', rng.uniform(8, 58), 32, -66, 1, 1, 1)
# the borehole: from the void floor to the bottom of the diorama and beyond
h.add('borehole', BX - BR - 1.5, BY - BR - 1.5, BOT, 2 * BR + 3, 2 * BR + 3, -96 - BOT, mat='liner', R=BR, liner=1.4, n=48,
      ramp=4.0, ramp_top=-97.0, ramp_bot=BOT + 2, ramp_a0=-90, rings=12.0, ring_power=3500, lift=True, lift_a=40, pipes=4,
      pipe_a=160, landings=[-120, -145], ring_h=7.0)
# the hangar: portal ribs, two cranes, a TBM being assembled beside the borehole it will enter, conveyors to the shaft
h.add('hangar', 4, 2, -160, 82, 44, 42, shell='ribs', rib=10.0, cranes=2, runway_z=30, crane_mat='yellow_paint', rib_mat='bconc',
      floor_mat='bconc_light', lights=5, power=6000, door='e',
      loads=[[30, 22, 12, 10, 5, 'galv'], [60, 30, 8, 8, 6, 'yellow_paint']])
h.add('tbm', 10, 21, -159.7, 66, 24, 22, R=10.0, state='assembly', gantries=3)
h.add('conveyor', 0, 0, 0, 1, 1, 1, path=[[70, 30, -150], [88, 30, -150], [99, 30, -150]], p_w=1.6, cargo='ore', cover=False, legs=4,
      ground=-159.7)
for k in range(14):
    h.add('builder', rng.uniform(10, 80), rng.uniform(4, 44), -159.7, 1, 1, 1, scale=0.7, weld=(k % 4 == 0))
# surface: street, towers with roof gardens
h.add('ground', -6, -6, 0, W + 12, DY + 12, 1, mat='paving', t=0.6)
h.add('bmass', 6, 14, 0, 30, 24, 38.5, mat='bconc', faces=dict(s='eggcrate', e='fins', n='blank', w='blank'), base='recess', roof='parapet', lit=0.45)
h.add('roofgarden', 6, 14, 40.1, 30, 24, 1, trees=1.4, big=0.4, edge_vines='se', vine_len=[3, 10])
h.add('slopemass', 46, 14, 0, 56, 30, 28, mat='bconc', slopes={'s': [1, 1]}, stepped=True, step_levels=1, windows='bands', lit=0.5)
h.add('btower', 112, 16, 0, 18, 18, 56, mat='bconc', shape='round', slits=10, crown=3)
for k in range(16):
    h.add('tree', rng.uniform(0, W), rng.uniform(12, 46), 0, 1, 1, 1, height=rng.uniform(5, 9))
h.write()

CROP_D = [-0.1, 4.5, 37.6, 12.1]     # x -0.4..150.4, y 18..48.4 (through the borehole axis)
write_jobs('d_hetero', [
    dict(spec='specs/d_hetero.json', out='out/dd/dd1_section.png', style='brut_hewn', light='section', res=[1300, 1800],
         view=dict(mode='full', crop=CROP_D), frame_bb=[-2, 18, -192, 152, 48, 60], camera=dict(az=30, el=14, margin=0.015),
         poche='poche_dark', fog=dict(h=0.75, gamma=3.2, d=0.0, z_lo=-200, z_hi=60), max_lights=320, samples=40),
    dict(spec='specs/d_hetero.json', out='out/dd/dd2_void_close.png', style='brut_hewn', light='section',
         view=dict(mode='full', crop=CROP_D), camera=dict(az=30, el=14, target=[62, 30, -76], ortho_scale=100),
         poche='poche_dark', fog=dict(h=0.5, gamma=3.2, d=0.0, z_lo=-200, z_hi=60), max_lights=320, samples=40),
    dict(spec='specs/d_hetero.json', out='out/dd/dd3_hangar_close.png', style='brut_hewn', light='section',
         view=dict(mode='full', crop=CROP_D), camera=dict(az=30, el=14, target=[80, 30, -136], ortho_scale=120),
         poche='poche_dark', fog=dict(h=0.5, gamma=3.2, d=0.0, z_lo=-200, z_hi=60), max_lights=320, samples=40),
])
