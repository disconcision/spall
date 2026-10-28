"""Large-scale diagonals at grid-rational slopes (cell 4 m, level 3.5 m; ratios are [run cells, rise levels])."""
import math
import random
from common import Spec, write_jobs, CELL, LEVEL

rng = random.Random(5)


def inset(r, h):
    return h / (r[1] * LEVEL) * (r[0] * CELL)


# ------------------------------------------------------------------------------------------ D1 battered wall-city
s = Spec('d_wall', style='brut_hewn', light='crisp_warm', seed=31)
s.add('ground', -60, -70, 0, 300, 220, 1, mat='paving', t=1.5)
s.add('ground', -60, -70, 0.03, 300, 18, 1, mat='asphalt2', t=1.4)
# the wall city: 16 levels, south face battered 1:2, slot windows following the slope
s.add('slopemass', 0, 40, 0, 168, 44, 56, mat='bconc', slopes={'s': [1, 2]}, windows='slots', lit=0.4)
# a stepped version of the same wall continues to the east (1:2 stepped every 2 levels)
s.add('slopemass', 168, 40, 0, 56, 44, 56, mat='bconc', slopes={'s': [1, 2]}, stepped=True, step_levels=2, windows='bands', lit=0.45)
# ridge on top with a crown of plant rooms
s.add('bmass', 0, 72, 56, 224, 12, 10.5, mat='bconc', faces=dict(s='slots', n='blank', e='blank', w='blank'), base='none',
      roof='parapet', lit=0.35)
# inclined housing plane rising east at 2:1 against the wall, on piers
run = 96.0
s.add('incline', 20, 6, 0, run, 26, 1, mat='bconc', ratio=[2, 1], t=2.6, piers=16, top='units', unit_w=8.0, unit_levels=1,
      rows=[[1.4, 12.0], [14.0, 24.6]], unit_mat='bconc_light', lit=0.5, z0=0.0)
# its landing tower
s.add('bmass', 116, 6, 0, 22, 26, 45.5, mat='bconc', faces=dict(s='fins', e='eggcrate', w='blank', n='blank'), base='recess', roof='plant',
      hew=1, lit=0.45)
# battered bastion at the west end: two faces sloped 1:3 toward the viewer
s.add('slopemass', -52, 14, 0, 44, 44, 42, mat='bconc_warm', slopes={'s': [1, 3], 'e': [1, 3]}, windows='slots', lit=0.35)
# a ramp at 4:1 climbing onto the wall's lowest terrace (the ramp drawn as an incline with a road)
s.add('incline', 150, -12, 0, 64, 14, 1, mat='bconc_light', ratio=[4, 1], t=1.8, piers=12, top='road')
for k in range(30):
    s.add('figure', rng.uniform(-40, 230), rng.uniform(-44, 4), 0, 1, 1, 1)
for k in range(12):
    s.add('vehicle', rng.uniform(-50, 240), rng.uniform(-68, -56), 0, 3, 1.5, 1)
s.write()

# ------------------------------------------------------------------------------------------ D2 stepped vs smooth
t = Spec('d_steps', style='brut_hewn', light='crisp', seed=32)
t.add('ground', -20, -30, 0, 300, 90, 1, mat='concrete_dark', t=1.0)
x = 0.0
for r in ([1, 1], [1, 2], [2, 1]):
    h = {(1, 1): 24.5, (1, 2): 42.0, (2, 1): 14.0}[tuple(r)]
    t.add('slopemass', x, 0, 0, 36, 36, h, mat='bconc', slopes={'s': r, 'e': r}, windows='none')
    t.add('slopemass', x + 44, 0, 0, 36, 36, h, mat='bconc', slopes={'s': r, 'e': r}, stepped=True, step_levels=1 if r != [1, 2] else 2,
          windows='bands', lit=0.4)
    x += 96.0
t.write()

# ------------------------------------------------------------------------------------------ D3 inclined shafts (section)
u = Spec('d_shafts', style='brut_hewn', light='section', seed=33)
Y0, Y1 = 0.0, 40.0
cy = 20.0
# bores: escalators 1:1 east-down, funicular 2:1 west-down
e_a, e_b = (58.0, cy, -14.0), (58.0 + 40.0, cy, -14.0 - 35.0)
f_a, f_b = (104.0, cy, -55.0), (104.0 - 56.0, cy, -55.0 - 24.5)
Re, he = 4.6, 5.4
Rf, hf = 3.4, 4.2


def sheared_void(a, b, h):
    sx = (b[2] - a[2]) / (b[0] - a[0])
    th = math.atan(abs(sx))
    hv = h / math.cos(th)
    x0, x1 = min(a[0], b[0]), max(a[0], b[0])
    zA = a[2] if a[0] < b[0] else b[2]
    return {'box': [x0, cy - h, zA - hv, x1, cy + h, zA + hv], 'shear': [sx, 0.0]}


voids = [
    [26.0, 12.0, -18.0, 36.0, 28.0, 0.5],        # lift shaft from the street
    [8.0, 2.0, -20.0, 60.0, 38.0, -7.0],        # upper concourse
    [98.0, 2.0, -60.0, 170.0, 38.0, -42.0],     # platform hall
    {'box': [14.0, 2.0, -110.0, 58.0, 38.0, -80.0], 'batter': [12.0, 0.0]},   # hangar with battered (sloped) walls
    sheared_void(e_a, e_b, he),
    sheared_void(f_a, f_b, hf),
]
u.add('earth2', 0, Y0, -118, 170, Y1 - Y0, 118, mat='rock', voids=[
    ([v[0], v[1] - Y0, v[2] + 118, v[3], v[4] - Y0, v[5] + 118] if isinstance(v, list) else
     dict(v, box=[v['box'][0], v['box'][1] - Y0, v['box'][2] + 118, v['box'][3], v['box'][4] - Y0, v['box'][5] + 118]))
    for v in voids])
u.add('ibore', 0, 0, 0, 1, 1, 1, mat='liner', a=list(e_a), b=list(e_b), R=Re, hs=he, liner=0.8, content='escalator', escalators=3,
      lights=4.5, people=10)
u.add('ibore', 0, 0, 0, 1, 1, 1, mat='liner', a=list(f_a), b=list(f_b), R=Rf, hs=hf, liner=0.7, content='funicular', car_at=0.45,
      car_len=11.0, ring_lights=6.0)
# rooms
u.add('lining', 8, 2, -20, 52, 36, 13, walls='nw', lights='strip', light_mat='warmwhite', light_col=[1.0, 0.85, 0.65], power=300,
      cols=[4, 2], col=1.1, people=14, signs=2, floor_mat='bconc_light', wall_mat='bconc', ceil_mat='bconc_dark', stripe_mat='lane_yellow')
u.add('lining', 98, 2, -60, 72, 36, 18, walls='n', lights='strip', light_mat='warmwhite', light_col=[1.0, 0.85, 0.65], power=400,
      cols=[5, 1], col=1.4, people=16, signs=3, floor_mat='bconc_light', wall_mat='bconc', ceil_mat='bconc_dark', stripe_mat='lane_yellow')
u.add('tube', 104, 22, -58.5, 66, 10, 8, mat='tube', train=True, train_len=48)
# battered hangar: floor, inclined ribs along both sloped walls, a goliath gantry over a TBM being assembled
u.add('cblock', 14, 2, -111, 44, 36, 1.2, mat='bconc_light', v=0, top=0)
for yq in (6.0, 16.0, 26.0, 36.0):
    u.add('strut', 0, 0, 0, 1, 1, 1, mat='bconc', a=[14.2, yq, -110.0], b=[2.2, yq, -80.0], r0=0.8, r1=0.7)
    u.add('strut', 0, 0, 0, 1, 1, 1, mat='bconc', a=[57.8, yq, -110.0], b=[69.8, yq, -80.0], r0=0.8, r1=0.7)
    u.add('bbeam', 2.0, yq - 0.7, -81.6, 68, 1.4, 1.6, mat='bconc')
u.add('tbm', 20, 8, -110, 34, 24, 16, R=7.0, state='assembly', gantries=2)
for xq in (18.0, 54.0):
    u.add('bcol', xq - 0.8, 4, -110, 1.6, 1.6, 22, mat='yellow_paint', shape='square')
    u.add('bcol', xq - 0.8, 34.4, -110, 1.6, 1.6, 22, mat='yellow_paint', shape='square')
u.add('bbeam', 17, 3.6, -88, 38, 2.4, 2.2, mat='yellow_paint')
u.add('bbeam', 17, 34.0, -88, 38, 2.4, 2.2, mat='yellow_paint')
u.add('pendant', 10, 4, -95, 56, 32, 14, n=7, drop=[2, 6], col=[1.0, 0.8, 0.5], power=900, mat='sodium')
for k in range(10):
    u.add('builder', rng.uniform(14, 56), rng.uniform(6, 34), -109.8, 1, 1, 1, scale=0.6, weld=(k % 3 == 0))
# surface: street, a pavilion over the lift, two small blocks
u.add('ground', -10, -10, 0, 190, 60, 1, mat='paving', t=0.5)
u.add('bmass', 22, 21, 0, 18, 16, 7, mat='bconc', face='fins', faces=dict(n='blank', w='blank'), base='none', roof='parapet', lit=0.6)
u.add('bmass', 70, 21, 0, 34, 17, 24.5, mat='bconc', faces=dict(s='eggcrate', e='fins', n='blank', w='blank'), base='recess', roof='plant', lit=0.45)
u.add('bmass', 124, 21, 0, 30, 17, 14, mat='bconc_warm', face='slots', base='recess', roof='parapet', lit=0.45)
for k in range(12):
    u.add('figure', rng.uniform(0, 170), rng.uniform(21, 38), 0, 1, 1, 1)
u.write()

write_jobs('d_diag', [
    dict(spec='specs/d_wall.json', out='out/d/d1_battered_wall.png', light='crisp_warm', frame_bb=[-50, -40, 0, 225, 85, 70],
         camera=dict(margin=0.0, zoom=0.82)),
    dict(spec='specs/d_steps.json', out='out/d/d2_stepped_vs_smooth.png', light='crisp', frame_bb=[-6, -6, 0, 270, 40, 42],
         camera=dict(margin=0.02)),
    dict(spec='specs/d_shafts.json', out='out/d/d3_inclined_shafts.png', light='section', res=[1600, 1150],
         view=dict(mode='full', crop=[-2.5, 5.0, 42.5, 10.0]), frame_bb=[-8, 20, -120, 172, 40, 26],
         camera=dict(az=28, el=16, margin=0.01), poche='poche_dark', nofog=False,
         fog=dict(h=0.55, gamma=2.2, d=0.0, z_lo=-125, z_hi=30), max_lights=260),
], samples=40)
