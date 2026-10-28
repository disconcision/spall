"""
make_jobs.py - derived scene specs + render jobs for the UI mock-ups (plain python3, no Blender).

Reads ../../concept-renders/specs/*.json (never writes there); writes specs/*.json and jobs.json here.
Every world position used by an HTML overlay is also exported to out/anchors.json, so the mock-ups
place labels, ghosts and cursors from the same numbers the renderer used.
"""
import json, math, os, copy

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.normpath(os.path.join(HERE, '..', '..', 'concept-renders'))
ARC = os.path.join(KIT, 'specs', 'arcology.json')
CELL, LH = 4.0, 3.5
W, H = 2560, 1440
CROP = [-1.5, -2.0, 23.0, 17.0]


def cam_axes(az=45.0, el=30.0):
    a, e = math.radians(az), math.radians(el)
    fwd = (-math.cos(e) * math.sin(a), math.cos(e) * math.cos(a), -math.sin(e))
    right = (math.cos(a), math.sin(a), 0.0)
    up = (right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0])
    n = math.sqrt(sum(c * c for c in up))
    return right, tuple(c / n for c in up), fwd


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cam_for(center_world, screen_xy, ppm, az=45.0, el=30.0, res=(W, H)):
    """Camera (ortho_scale + target) that puts world point center_world at pixel screen_xy with ppm px per metre."""
    r, u, f = cam_axes(az, el)
    rx, ry = res
    cx = dot(center_world, r) - (screen_xy[0] - rx / 2) / ppm
    cy = dot(center_world, u) + (screen_xy[1] - ry / 2) / ppm
    t = [r[i] * cx + u[i] * cy for i in range(3)]
    return dict(ortho_scale=rx / ppm, target=t, az=az, el=el)


def M(x, y, level):
    """grid cells / levels -> metres"""
    return (x * CELL, y * CELL, level * LH)


def load(p):
    return json.load(open(p))


def save_spec(name, spec):
    p = os.path.join(HERE, 'specs', name + '.json')
    json.dump(spec, open(p, 'w'))
    return 'specs/' + name + '.json'


def nid(spec):
    return max(p.get('id', i) for i, p in enumerate(spec['parts'])) + 1


GHOST_ENV = {"ghost_col": [0.36, 0.58, 1.0], "wire_col": [0.12, 0.42, 1.0], "ghost_alpha": 0.10, "wire_e": 2.4}
GHOST_ENV_DUSK = {"ghost_col": [0.30, 0.55, 1.0], "wire_col": [0.10, 0.36, 1.0], "ghost_alpha": 0.16, "wire_e": 1.5}

jobs = []
anchors = {}

# =============================================================================================== M1 level HUD
# cutaway at L8 (+0.5), levels below dimmed via a z-mask, structure of the next 3.8 levels as ghost massing
m1cam = cam_for(M(10, 8, 3.2), (1210, 800), 13.0)
jobs += [
    dict(name='m1_beauty', spec=ARC, light='overcast', out='out/m1_beauty.png', camera=m1cam,
         view=dict(mode='cutaway', level=8, cut=0.5, crop=CROP)),
    dict(name='m1_zmask', spec=ARC, light='overcast', out='out/m1_zmask.png', camera=m1cam, zmask=8.0, zmask_fade=3.0, samples=16,
         view=dict(mode='cutaway', level=8, cut=0.5, crop=CROP)),
    dict(name='m1_ghost', spec=ARC, light='overcast', out='out/m1_ghost.png', camera=m1cam, transparent=True,
         objects=['ghost'], view=dict(mode='ghost', level=8, cut=0.5, crop=CROP, ghost_zmax=12.3, ghost_tags=['support']),
         env={"ghost_col": [0.50, 0.67, 0.91], "wire_col": [0.11, 0.33, 0.75], "ghost_alpha": 0.05, "wire_e": 1.3}),
]

# =============================================================================================== M2 / M7 section
# the arcology plus a two-level undercroft (B1 pumps + transformer hall, B2 cisterns) so the section has a basement
sec = copy.deepcopy(load(ARC))
k = nid(sec)
for p in sec['parts']:
    if p['type'] == 'ground':
        p['params']['t'] = 0.8
und = []
und.append(dict(type='slab', x=-1.0, y=-1.5, level=-2.0, w=22.0, d=18.5, h=0.3, material='concrete_dark', params=dict(t=1.0)))
und.append(dict(type='slab', x=-1.0, y=-1.5, level=-1.0, w=22.0, d=18.5, h=0.3, material='concrete', params=dict(t=0.5)))
for (x, y, w, d) in ((-1.0, -1.5, 22.0, 0.15), (-1.0, 16.85, 22.0, 0.15), (-1.0, -1.5, 0.15, 18.5), (20.85, -1.5, 0.15, 18.5)):
    und.append(dict(type='slab', x=x, y=y, level=-0.23, w=w, d=d, h=0.1, material='concrete_dark', params=dict(t=7.2)))
for p in load(ARC)['parts']:
    if p['type'] == 'megacolumn' and p['level'] == 0:
        und.append(dict(type='megacolumn', x=p['x'], y=p['y'], level=-2, w=p['w'], d=p['d'], h=2, material='concrete',
                        params=dict(bands=2, capital=False)))
    if p['type'] == 'core' and p['level'] == 0:
        und.append(dict(type='core', x=p['x'], y=p['y'], level=-2, w=p['w'], d=p['d'], h=2, params=dict(cap=False, cabs=0)))
for i, y in enumerate((1.0, 3.6, 6.2, 12.4)):
    und.append(dict(type='tank', x=13.2, y=y, level=-2, w=2.2, d=2.2, h=0.82, material='steel_light', params=dict(legs=0.0)))
    und.append(dict(type='tank', x=15.4, y=y, level=-2, w=2.2, d=2.2, h=0.82, material='steel_light', params=dict(legs=0.0)))
for i, y in enumerate((0.8, 3.4, 6.4, 12.6, 14.0)):
    und.append(dict(type='machine', x=14.6, y=y, level=-1, w=2.6, d=1.6, h=0.72, material='steel', params=dict(arm=False)))
for (x, y, lv) in ((12.0, 2.5, -1), (12.0, 9.0, -1), (12.0, 14.5, -1), (12.0, 5.0, -2), (12.0, 11.0, -2)):
    und.append(dict(type='light', x=x, y=y, level=lv + 0.7, w=0.2, d=0.2, h=0.2, params=dict(power=160, color=[1.0, 0.72, 0.42])))
for p in und:
    p['id'] = k; k += 1
    p.setdefault('tags', []).append('undercroft')
sec['parts'] += und
secpath = save_spec('arcology_section', sec)

# vertical section through core B on grid line x = 16 cells, looking -x (screen right = +y), no perspective tilt
m2cam = cam_for(M(16, 7.5, 14.0), (905, 712), 11.2, az=90.0, el=0.0)
SEC = dict(mode='section', axis='x', at=16.0, crop=CROP)
jobs += [
    dict(name='m2_section', spec=secpath, light='overcast', out='out/m2_section.png', camera=m2cam, view=SEC,
         fog=dict(d=0.28)),
    dict(name='m7_section_night', spec=secpath, light='night', out='out/m7_section_night.png', camera=m2cam, view=SEC,
         fog=dict(d=0.22), exposure=1.1),
]

# =============================================================================================== M3 pattern book
arc = load(ARC)
m3 = copy.deepcopy(arc)
k = nid(m3)
M3CROP = [2.5, 3.5, 17.2, 13.8]
# the high rows before this pattern ran: clear L19+ infill inside the design frame
for p in m3['parts']:
    if p['type'] in ('capsule', 'stairs', 'bridge', 'figure') and p.get('level', 0) >= 18.5 \
            and M3CROP[0] - 1 < p['x'] < M3CROP[2] and M3CROP[1] - 1 < p['y'] < M3CROP[3]:
        p.setdefault('tags', []).append('ui:hide')


def stack(x, y, lv0, n, state, spec, tag_extra=()):
    """Capsule Stack <n>: 2x1 bay, n capsules, balcony every 2nd, side stair, planter roof.
    state: list per floor: 'built' | 'ghost'."""
    global k
    out = []
    mats = ['panel', 'accent_b', 'capsule_white', 'accent_a']
    for i in range(n):
        st = state[i]
        tags = ['infill', 'm3:stack'] + list(tag_extra) + (['ui:ghostbox'] if st == 'ghost' else [])
        out.append(dict(id=k, type='capsule', x=x + (0.12 if i % 2 else 0.0), y=y, level=lv0 + i, w=1.88, d=1, h=1,
                        material=mats[(i + int(x)) % len(mats)], tags=tags,
                        params=dict(win='grid' if i % 2 == 0 else 'band', balcony=(i % 2 == 1), ac=0.5, lit=0.6)))
        k += 1
    top = state[-1]
    out.append(dict(id=k, type='terrace', x=x + 0.1, y=y + 0.05, level=lv0 + n, w=1.8, d=0.9, h=0.2,
                    tags=['garden', 'm3:stack'] + (['ui:hide'] if top == 'ghost' else []),
                    params=dict(trees=0.03, edge='', benches=0, path=False, rail='snwe')))
    k += 1
    spec['parts'].extend(out)
    return out


# built / under construction / ghosts (all on deck 18, levels 18-20; cut at 21.5 shows them whole)
stamps = [((11, 12), ['built', 'built', 'built'], 'built'),
          ((11, 11), ['built', 'ghost', 'ghost'], 'building'),
          ((11, 10), ['ghost', 'ghost', 'ghost'], 'claimed'),
          ((4, 9), ['ghost', 'ghost', 'ghost'], 'queued'),
          ((4, 8), ['ghost', 'ghost', 'ghost'], 'queued'),
          ((4, 7), ['ghost', 'ghost', 'ghost'], 'queued'),
          ((7, 11), ['ghost', 'ghost', 'ghost'], 'blocked'),
          ((7, 10), ['ghost', 'ghost', 'ghost'], 'queued')]
anchors['m3_stamps'] = []
for (x, y), st, state in stamps:
    stack(x, y, 18, 3, st, m3)
    anchors['m3_stamps'].append(dict(x=x, y=y, w=2, d=1, level=18, h=3, state=state))
# builders at work on the partly-built stack (drones hover beside the next floor)
m3['parts'] += [
    dict(id=k, type='drone', x=13.0, y=11.1, level=19.55, w=0.6, d=0.6, h=0.3, tags=['m3:drone'], params=dict(cargo=True, scale=1.5)),
    dict(id=k + 1, type='drone', x=10.2, y=11.2, level=20.1, w=0.6, d=0.6, h=0.3, tags=['m3:drone'], params=dict(scale=1.5, weld=True)),
    dict(id=k + 2, type='drone', x=12.6, y=9.35, level=19.3, w=0.6, d=0.6, h=0.3, tags=['m3:drone'], params=dict(cargo=True, scale=1.5)),
]
anchors['m3_drones'] = [dict(id='D-04', x=13.3, y=11.4, level=19.55 + 0.2, task='hauling floor 2 panels'),
                        dict(id='D-09', x=10.5, y=11.5, level=20.1 + 0.2, task='welding floor 2 frame'),
                        dict(id='D-12', x=12.9, y=9.65, level=19.3 + 0.2, task='claimed stack #3')]
k += 3
m3path = save_spec('arcology_m3', m3)
m3cam = cam_for(M(9.85, 8.65, 19.6), (1812, 640), 21.5)
jobs += [dict(name='m3_stamp', spec=m3path, light='overcast', out='out/m3_stamp.png', camera=m3cam,
              view=dict(mode='cutaway', level=21, cut=0.5, crop=M3CROP, zmin=17.7),
              env={"ghost_col": [0.33245, 0.55201, 1.0], "wire_col": [0.07819, 0.36625, 1.0], "ghost_alpha": 0.12, "wire_e": 2.2})]
anchors['m3_crop'] = M3CROP

# unit thumbnails for the pattern book (studio light, transparent)
def unit_spec(name, parts, desc):
    return save_spec(name, dict(meta=dict(name=name, style='arcology', seed=11, grid=dict(cell=CELL, level=LH), description=desc),
                                parts=parts))


def ustack(n, mat_shift=0):
    ps = []
    mats = ['panel', 'accent_b', 'capsule_white', 'accent_a']
    for i in range(n):
        ps.append(dict(type='capsule', x=(0.12 if i % 2 else 0.0), y=0, level=i, w=1.88, d=1, h=1,
                       material=mats[(i + mat_shift) % 4],
                       params=dict(win='grid' if i % 2 == 0 else 'band', balcony=(i % 2 == 1), ac=0.5, lit=0.6)))
    ps.append(dict(type='terrace', x=0.1, y=0.05, level=n, w=1.8, d=0.9, h=0.2,
                   params=dict(trees=0.03, edge='', benches=0, path=False, rail='snwe')))
    ps.append(dict(type='slab', x=-0.2, y=-0.2, level=-0.15, w=2.4, d=1.4, h=0.15, material='deck'))
    return ps


units = {
    'u_stack3': (ustack(3), 'Capsule Stack <3>'),
    'u_stack2': (ustack(2, 1), 'Capsule Stack <2>'),
    'u_stack5': (ustack(5, 2), 'Capsule Stack <5>'),
}
# a captured chunk of the real arcology: bay x 11..14, y 9..13, levels 6..9 (exact copy)
cap = [dict(p) for p in arc['parts'] if p['type'] in ('capsule', 'stairs', 'bridge', 'terrace', 'deck', 'lamp', 'figure')
       and 11 <= p['x'] < 14 and 9 <= p['y'] < 13 and 6 <= p['level'] < 9.5]
for p in cap:
    p['x'] -= 11; p['y'] -= 9; p['level'] -= 6
    p.pop('id', None)
    if p['type'] == 'deck':
        p['x'], p['y'] = max(p['x'], 0), max(p['y'], 0)
        p['w'], p['d'] = min(p['w'], 3), min(p['d'], 4)
cap.append(dict(type='slab', x=0, y=0, level=-0.1, w=3, d=4, h=0.1, material='deck'))
units['u_captured'] = (cap, 'Captured: Lantern Court, L6 bay F3')
# pattern: bridge every third level across a void between two support faces
br = [dict(type='core', x=0, y=0, level=0, w=1.0, d=1.0, h=10, material='concrete', params=dict(cap=False, cabs=1, louvre=3)),
      dict(type='core', x=4.0, y=0, level=0, w=1.0, d=1.0, h=10, material='concrete', params=dict(cap=False, cabs=1, louvre=3))]
for lv in (1, 4, 7):
    br.append(dict(type='bridge', x=1.0, y=0.2, level=lv, w=3.0, d=0.6, h=0.2, params=dict(t=0.45, lamps=2)))
br.append(dict(type='slab', x=-0.3, y=-0.3, level=-0.1, w=5.6, d=1.6, h=0.1, material='deck'))
units['u_pat_bridge'] = (br, 'Pattern: bridge every 3rd level')
gr = [dict(type='capsule', x=0, y=0, level=0, w=2, d=2, h=1, material='panel', params=dict(win='grid', lit=0.5)),
      dict(type='capsule', x=0.3, y=0.2, level=1, w=1.4, d=1.6, h=1, material='accent_b', params=dict(win='band', lit=0.5)),
      dict(type='terrace', x=0, y=0, level=1, w=2, d=2, h=0.2, params=dict(trees=0.06, edge='', benches=1, path=True, rail='snwe')),
      dict(type='slab', x=-0.2, y=-0.2, level=-0.1, w=2.4, d=2.4, h=0.1, material='deck')]
units['u_pat_garden'] = (gr, 'Pattern: sky garden on exposed roof')
lw = [dict(type='lightwell', x=1, y=0, level=0, w=2, d=2, h=5, params=dict(rims=[2, 4], vines=1.0))]
for lv in range(4):
    lw.append(dict(type='capsule', x=0, y=0 if lv % 2 == 0 else 0.15, level=lv, w=1, d=1.8, h=1, material=['panel', 'accent_a', 'capsule_white', 'accent_b'][lv],
                   params=dict(win='grid', lit=0.7, balcony=(lv % 2 == 1))))
    lw.append(dict(type='capsule', x=3, y=0.1, level=lv, w=1, d=1.7, h=1, material=['accent_b', 'panel', 'accent_a', 'panel'][lv],
                   params=dict(win='band' if lv % 2 else 'grid', lit=0.7)))
lw.append(dict(type='slab', x=-0.2, y=-0.2, level=-0.1, w=4.4, d=2.4, h=0.1, material='deck'))
units['u_pat_lightwell'] = (lw, 'Pattern: lantern row on a light well')
st = [dict(type='slab', x=-0.2, y=-0.2, level=-0.1, w=4.6, d=1.6, h=0.1, material='deck'),
      dict(type='stairs', x=0.3, y=0.1, level=0, w=2.4, d=0.5, h=1.5, params=dict()),
      dict(type='deck', x=2.7, y=-0.2, level=1.5, w=1.8, d=1.6, h=0.3, params=dict(t=0.5, rail='nse')),
      dict(type='stairs', x=0.3, y=0.7, level=1.5, w=2.4, d=0.5, h=1.5, rot=2, params=dict()),
      dict(type='deck', x=-0.2, y=-0.2, level=3.0, w=1.2, d=1.6, h=0.3, params=dict(t=0.5, rail='nsw'))]
units['u_pat_stair'] = (st, 'Pattern: stair between decks')
thumb_jobs = []
for name, (parts, desc) in units.items():
    sp = unit_spec(name, parts, desc)
    thumb_jobs.append(dict(name='m3_' + name, spec=sp, light='studio', style='arcology', transparent=True, nofog=True, bloom=0,
                           out='out/m3_%s.png' % name, res=[520, 520], samples=48, camera=dict(margin=0.08)))
jobs += thumb_jobs

# =============================================================================================== M4 agent co-building
m4 = copy.deepcopy(arc)
k = nid(m4)
# proposed sky bridge over the canopy at L25: core A north face -> corner landing -> core B west face
brg = dict(t=0.35, enclosed=True, eh=2.8, keel=True)
m4['parts'] += [
    dict(id=k, type='bridge', x=4.2, y=6.0, level=25, w=0.8, d=4.2, h=0.2, rot=1, tags=['ui:ghost', 'm4:bridge'], params=brg),
    dict(id=k + 1, type='deck', x=4.1, y=10.1, level=25, w=1.0, d=1.0, h=0.3, tags=['ui:ghost', 'm4:bridge'], params=dict(t=0.6)),
    dict(id=k + 2, type='bridge', x=5.0, y=10.2, level=25, w=10.0, d=0.8, h=0.2, tags=['ui:ghost', 'm4:bridge'], params=brg),
    dict(id=k + 3, type='pier', x=4.45, y=10.35, level=24.1, w=0.5, d=0.5, h=0.62, tags=['ui:ghost', 'm4:bridge']),
    # drones (real) claiming the first steps
    dict(id=k + 4, type='drone', x=5.2, y=6.35, level=25.7, w=0.6, d=0.6, h=0.3, tags=['m4:drone'], params=dict(cargo=True, scale=1.5)),
    dict(id=k + 5, type='drone', x=13.9, y=11.15, level=25.55, w=0.6, d=0.6, h=0.3, tags=['m4:drone'], params=dict(scale=1.5)),
    dict(id=k + 6, type='drone', x=9.0, y=9.0, level=26.6, w=0.6, d=0.6, h=0.3, tags=['m4:drone'], params=dict(cargo=True, scale=1.5)),
    dict(id=k + 7, type='drone', x=17.35, y=8.9, level=26.3, w=0.6, d=0.6, h=0.3, tags=['m4:drone'], params=dict(scale=1.5)),
]
anchors['m4'] = dict(
    seg1=[4.2, 6.0, 25, 5.0, 10.2, 25], landing=[4.1, 10.1, 25, 5.1, 11.1, 25], seg2=[5.0, 10.2, 25, 15.0, 11.0, 25],
    pier=[4.45, 10.35, 24.1, 4.95, 10.85, 24.72],
    coreA=[3, 4, 12, 5, 6, 26], coreB=[15, 10, 12, 17, 12, 26],
    drones=[dict(id='D-07', x=5.5, y=6.65, level=25.9, task='step 1 - bracket on core A', state='claimed'),
            dict(id='D-11', x=14.2, y=11.45, level=25.75, task='step 2 - bracket on core B', state='claimed'),
            dict(id='D-03', x=9.3, y=9.3, level=26.8, task='hauling truss T2 from depot L18', state='hauling'),
            dict(id='D-14', x=17.65, y=9.2, level=26.5, task='waiting: glazing x18 (stall)', state='waiting')])
m4path = save_spec('arcology_m4', m4)
m4cam = cam_for(M(9.5, 9.0, 25.0), (1020, 560), 19.0)
jobs += [dict(name='m4_agent', spec=m4path, light='dusk', out='out/m4_agent.png', camera=m4cam,
              view=dict(mode='full', crop=CROP), env=GHOST_ENV_DUSK, frame_bb=[-8, -12, -10, 95, 72, 140], frame_clip=True)]

# =============================================================================================== M6 accretion
m6cam = cam_for(M(10, 8, 10), (1010, 585), 6.6)
jobs += [dict(name='m6_phase5', spec=ARC, light='overcast', out='out/m6_phase5.png', camera=m6cam, phase=5, blueprint=True,
              view=dict(mode='full', crop=CROP),
              env={"ghost_col": [0.33245, 0.55201, 1.0], "wire_col": [0.07819, 0.36625, 1.0], "ghost_alpha": 0.12, "wire_e": 2.2})]

# =============================================================================================== M8 pixel mode
# Block 07 cut at L8.5 through the kit64 sprite camera: 32 px per 4 m tile, no AA, flat 'sprite' style, so it lands on
# the same pixel lattice as every kit sprite (the world origin snaps to a pixel corner).
PPM = 32 / (4 * math.sqrt(2))
jobs += [dict(name='m8_arc_px', spec=ARC, light='studio', style='sprite', out='out/m8_arc_px.png', res=[720, 540], samples=16,
              transparent=True, nofog=True, bloom=0, filter_size=0.0,
              camera=dict(target=[40.0, 32.0, 12.0], px_per_m=PPM, pan=[0, 0]),
              view=dict(mode='cutaway', level=8, cut=0.5, crop=CROP))]

json.dump(dict(defaults=dict(res=[W, H], samples=64), jobs=jobs), open(os.path.join(HERE, 'jobs.json'), 'w'), indent=1)
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
json.dump(anchors, open(os.path.join(HERE, 'out', 'anchors.json'), 'w'), indent=1)
print('wrote %d jobs' % len(jobs))
