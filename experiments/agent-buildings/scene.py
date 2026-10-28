"""
scene.py - a megastructure district (stock kit parts, arcology style) built around the host requirements of the six
agent-authored buildings, which are then placed as kitx composite instances (each built by kit.py's own builders).

    python3 scene.py        -> specs/scene_district.json (context only) + jobs/scene.json (instances + cameras)

Host sites: an undercroft under the level-6 deck with a water riser (hydro stack); two aligned cores 4 cells apart
(bridge market at level 10, the east core stops at the bridge so it does not hide it); a megablock shaft wall
(hanging garden at level 4); a ground plaza where tube line A (level 1.2, east-west) and tube line B (level 3.4,
north-south) cross (interchange); a 1x1 hole through the level-6 deck (solar chimney, head on the deck); a 4-level
tenement standing on the deck (rooftop village on its roof at level 10).
"""
import json, math, os, random, sys
sys.dont_write_bytecode = True   # never write __pycache__ into ../concept-renders (read-only)

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'concept-renders'))
from gen import Spec, rect_cells, rects_from_mask   # stock generator helpers (read-only import)

rng = random.Random(77)
S = Spec('scene_district', 'arcology', 4.0, 3.5, 77, light='golden',
         description='Megastructure district hosting the six agent-authored building types (context parts only; '
                     'the buildings are composite instances in jobs/scene.json).')
C = ['context']


def add(*a, **k):
    k.setdefault('tags', C)
    return S.add(*a, **k)


# ------------------------------------------------------------------ ground, canal, plaza
add('ground', -14, -12, 0, 44, 44, 1, material='ground', t=2.0, grid=[8.0, 'concrete_dark'])
add('water', -14, -11, 0, 44, 3, 1)
add('ground', -6, -6, 0.004, 10, 10, 1, material='paving', t=0.05)
# ------------------------------------------------------------------ tube lines crossing at the interchange (instance at 0,0)
for (x0, x1) in ((-14, -0.5), (3.5, 30)):
    add('tube', x0, 1.0, 1.2, x1 - x0, 1.0, 1.143, train=(x0 > 0), train_len=30.0)
for x in (-12, -6, 6, 12, 24):
    add('pier', x + 0.35, 1.25, 0, 0.3, 0.5, 1.2)
for (y0, y1) in ((-12, -0.5), (3.5, 30)):
    add('tube', 1.0, y0, 3.4, 1.0, y1 - y0, 1.143, rot=1, train=(y0 > 0), train_len=30.0)
for y in (-9, -4, 7, 13, 19, 25):
    add('pier', 1.25, y + 0.35, 0, 0.5, 0.3, 3.4)
# ------------------------------------------------------------------ megastructure: columns + level-6 deck with holes
cols_x, cols_y = [6.2, 12.2, 18.2], [4.2, 11.2, 18.2]
for cx in cols_x:
    for cy in cols_y:
        add('megacolumn', cx, cy, 0, 1.6, 1.6, 6.3, material='concrete', bands=6)
deck = rect_cells(5, 3, 23, 22)
holes = rect_cells(8, 14, 10, 16) | rect_cells(14, 14, 16, 16) | {(16, 8)}      # core A, core B, chimney pipe
deck -= holes
for (x, y, w, d) in rects_from_mask(deck):
    add('deck', x, y, 6, w, d, 0.3, t=1.0, beams=0)
for cy in cols_y:
    for a, b in zip(cols_x[:-1], cols_x[1:]):
        add('truss', a + 1.6, cy + 0.65, 5, b - a - 1.6, 0.3, 0.7, r=0.12)
add('pipe', 6, 9.5, 5.4, 17, 0.5, 0.25, n=3, r=0.22)
# undercroft extras: the riser the hydro stack taps (stack at 9,6 -> riser at +2.4, +0.8), lamps, a few capsule stacks
add('pipe', 11.4, 6.8, 0, 0.25, 0.3, 6, material='pipe2', axis='z', n=2, r=0.3, flange=3.5)
for (x, y) in ((8, 5), (12, 5), (16, 5), (20, 5)):
    add('lamp', x, y, 0, 0.1, 0.1, 1.2, power=120)
for (x, y, w, d, h, m) in ((19.5, 13.5, 2, 1, 4, 'accent_a'), (6.5, 19.0, 2, 2, 3, 'panel'), (20.0, 19.5, 1, 2, 5, 'capsule_white')):
    for lv in range(h):
        add('capsule', x, y, lv, w, d, 1, material=m, win=rng.choice(('grid', 'band')), lit=0.5, interior=False, ac=0.3)
for i in range(18):
    add('figure', rng.uniform(5, 22), rng.uniform(3, 21), 0, 0.3, 0.3, 1)
# ------------------------------------------------------------------ cores for the sky-bridge market (instance at 10,14 L10)
add('core', 8, 14, 0, 2, 2, 15, material='concrete', cabs=3, louvre=3, cap=True)
add('core', 14, 14, 0, 2, 2, 10, material='concrete', cabs=2, louvre=3, cap=False)
add('slab', 14, 14, 10, 2, 2, 0.1, material='concrete_light', t=0.3, rail='sne')
add('capsule', 14.9, 14.9, 10, 1, 1, 1, material='concrete', win='grid', lit=0.6, interior=False)
# ------------------------------------------------------------------ megablock shaft wall for the hanging garden (instance at -7,11 L4)
add('block', -10, 12, 0, 8, 6, 17, material='concrete', dots=0.003, dots_lit=0.5, slots=8, openings=3, parapet=True, ribs=4,
    rib_w=1.0, rib_d=0.6)
add('bridge', -2, 13.2, 6, 7, 0.5, 0.2, material='steel_dark', t=0.4, lamps=2, post=2.5)
# ------------------------------------------------------------------ deck life: terraces, infill, tenement for the village
add('terrace', 5.2, 3.2, 6, 2.6, 5.5, 0.2, trees=0.03, edge='', benches=1, path=False, rail='sw')
add('terrace', 10.0, 18.5, 6, 4.5, 3.2, 0.2, trees=0.03, edge='', benches=1, path=False, rail='')
for (x, y, w, d, h, m) in ((7.0, 10.0, 2, 2, 3, 'accent_b'), (11.0, 11.0, 1, 2, 2, 'panel'), (20.5, 11.0, 2, 1, 3, 'capsule_white'),
                           (9.5, 3.4, 2, 1, 2, 'accent_a'), (21.0, 17.5, 1, 2, 4, 'panel'), (5.5, 14.5, 2, 2, 4, 'capsule_white'),
                           (6.0, 17.0, 1, 1, 5, 'accent_b'), (12.0, 19.0, 2, 1, 3, 'accent_a'), (15.5, 19.5, 2, 2, 2, 'panel'),
                           (18.0, 19.5, 1, 2, 3, 'k_cream'), (21.0, 7.0, 1, 1, 2, 'accent_b')):
    for lv in range(h):
        add('capsule', x, y, 6 + lv, w, d, 1, material=m, win=rng.choice(('grid', 'band', 'round')), lit=0.5, interior=False,
            balcony=rng.random() < 0.3, ac=0.3)
add('capsule', 17, 15, 6, 3, 3, 1, material='steel_dark', win='band', lit=0.8, interior=False)
add('capsule', 17, 15, 7, 3, 3, 3, material='k_grey', win='grid', module=1.3, lit=0.5, interior=False, ac=0.5, cage=0.5)
add('sign', 18.0, 15, 7.2, 0.1, 0.1, 0.8, color='red', blade=True, proj=1.4)
add('crane', 22.0, 21.0, 6, 1, 1.2, 10, rot=2, jib=24, hook_at=0.7, drop=12, payload=[6, 4, 3.0])
for (x, y, h) in ((6.2, 15.0, 1.3), (12.3, 19.3, 1.0), (15.8, 20.0, 0.9), (21.3, 18.0, 1.2), (7.4, 10.4, 1.0)):
    add('antenna', x, y, 6 + (4 if x < 6.5 else 2), 0.1, 0.1, h, r=0.06, bars=3, beacon=True, lightpt=True)
add('tank', 5.8, 15.6, 10, 0.5, 0.5, 0.6, legs=0.8)
add('tank', 12.6, 19.2, 9, 0.5, 0.5, 0.6, legs=0.6)
for i in range(14):
    add('figure', rng.uniform(5.5, 22), rng.uniform(3.5, 21), 6, 0.3, 0.3, 1)
add('tree', -4.5, -3.5, 0, 1, 1, 1, height=6.5)
add('tree', 5.5, -2.0, 0, 1, 1, 1, height=5.5)
add('tree', -3.0, 5.5, 0, 1, 1, 1, height=6.0)
for i in range(12):
    add('figure', rng.uniform(-5, 4), rng.uniform(-5, 4), 0, 0.3, 0.3, 1)
S.save(os.path.join(HERE, 'specs', 'scene_district.json'))

INST = [
    dict(spec='specs/tube_interchange.json', at=[0, 0, 0], rot=0),
    dict(spec='specs/hydro_stack.json', at=[9, 6, 0], rot=0),
    dict(spec='specs/solar_chimney.json', at=[15.5, 7.5, 0], rot=0),
    dict(spec='specs/bridge_market.json', at=[10, 14, 10], rot=0),
    dict(spec='specs/hanging_garden.json', at=[-7, 11, 4], rot=0),
    dict(spec='specs/rooftop_village.json', at=[17, 15, 10], rot=0),
]
base = dict(spec='specs/scene_district.json', instances=INST, res=[1800, 1200], samples=64, style='arcology',
            frame_bb=[-40, -40, -2, 96, 92, 62], frame_clip=True, env=dict(lantern=2.2), max_lights=220)
jobs = [
    dict(base, out='out/scene_golden.png', light='golden', camera=dict(target=[28, 36, 22], ortho_scale=128),
         fog=dict(h=0.12, d=0.06)),
    dict(base, out='out/scene_dusk.png', light='dusk', exposure=0.35, camera=dict(target=[28, 36, 22], ortho_scale=128)),
    dict(base, out='out/scene_dusk_close.png', light='dusk', exposure=0.3, camera=dict(target=[49, 57, 20], ortho_scale=90)),
]
with open(os.path.join(HERE, 'jobs', 'scene.json'), 'w') as fh:
    json.dump(dict(defaults={}, jobs=jobs), fh, indent=1)
print('specs/scene_district.json: %d context parts; jobs/scene.json: %d jobs, %d instances' % (len(S.parts), len(jobs), len(INST)))
