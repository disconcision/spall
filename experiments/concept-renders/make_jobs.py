"""
make_jobs.py - writes jobs/*.json describing every final render (camera, lighting, view mode) for kit.py.

    python3 make_jobs.py
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
J = os.path.join(HERE, 'jobs')
os.makedirs(J, exist_ok=True)
RES = [1600, 1000]
SAMPLES = 64


def C(h):
    h = h.lstrip('#')
    s = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return [round(((c / 12.92) if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4), 5) for c in s]


def write(name, defaults, jobs):
    with open(os.path.join(J, name + '.json'), 'w') as fh:
        json.dump(dict(defaults=defaults, jobs=jobs), fh, indent=1)
    print('jobs/%s.json: %d jobs' % (name, len(jobs)))


# ---------------------------------------------------------------------------------------------- variants
BLAME_FOG = {"z_lo": -90, "z_hi": 330, "h": 1.0, "gamma": 1.0, "d": 0.1}
variants = [
    dict(spec='specs/blame.json', out='out/a_blame.png', light='blame', camera=dict(target=[150, 150, 72], ortho_scale=320), fog=BLAME_FOG),
    dict(spec='specs/blame.json', out='out/a_blame_close.png', light='blame', camera=dict(target=[80, 165, 110], ortho_scale=76), fog=BLAME_FOG),
    dict(spec='specs/glt.json', out='out/b_glt.png', light='snow', camera=dict(target=[90, 100, 128], ortho_scale=280)),
    dict(spec='specs/glt.json', out='out/b_glt_close.png', light='snow', camera=dict(target=[62, 100, 160], ortho_scale=125)),
    dict(spec='specs/kowloon.json', out='out/c_kowloon.png', light='dusk', frame_bb=[-10, -10, 0, 130, 88, 50], frame_clip=True),
    dict(spec='specs/kowloon.json', out='out/c_kowloon_close.png', light='dusk', camera=dict(target=[100, 20, 18], ortho_scale=80)),
    dict(spec='specs/solarpunk.json', out='out/d_solarpunk.png', light='golden', frame_bb=[-10, -30, 0, 150, 125, 160], frame_clip=True),
    dict(spec='specs/solarpunk.json', out='out/d_solarpunk_close.png', light='golden', camera=dict(target=[70, 50, 30], ortho_scale=90)),
    dict(spec='specs/mixed.json', out='out/e_mixed.png', light='mixed', camera=dict(target=[62, 92, 70], ortho_scale=262),
         fog={"z_lo": -80, "z_hi": 170}),
    dict(spec='specs/arcology.json', out='out/f_arcology.png', light='overcast', frame_bb=[-8, -12, 0, 92, 72, 140], frame_clip=True),
]
write('variants', dict(res=RES, samples=SAMPLES), variants)

# ---------------------------------------------------------------------------------------------- lighting variants
lighting = [
    dict(spec='specs/arcology.json', out='out/l_arcology_overcast.png', light='overcast'),
    dict(spec='specs/arcology.json', out='out/l_arcology_dusk.png', light='dusk'),
    dict(spec='specs/arcology.json', out='out/l_arcology_night.png', light='night'),
    dict(spec='specs/kowloon.json', out='out/l_kowloon_night.png', light='night', frame_bb=[-10, -10, 0, 130, 88, 50], frame_clip=True),
    dict(spec='specs/blame.json', out='out/l_blame_night.png', light='night', camera=dict(target=[150, 150, 72], ortho_scale=320),
         fog=BLAME_FOG),
    dict(spec='specs/solarpunk.json', out='out/l_solarpunk_dusk.png', light='dusk', frame_bb=[-10, -30, 0, 150, 125, 160], frame_clip=True),
]
for j in lighting:
    if 'arcology' in j['spec']:
        j.update(frame_bb=[-8, -12, 0, 92, 72, 140], frame_clip=True)
write('lighting', dict(res=RES, samples=SAMPLES), lighting)

# ---------------------------------------------------------------------------------------------- level views (arcology)
CROP = [-1.5, -2.0, 23.0, 17.0]
SITE_BB = [-8, -12, -10, 95, 72, 140]
lv = dict(spec='specs/arcology.json', light='overcast', frame_bb=SITE_BB, frame_clip=True)
levels = [
    dict(lv, out='out/v1_full.png', view=dict(mode='full', crop=CROP)),
    dict(lv, out='out/v2_cutaway_L8.png', view=dict(mode='cutaway', level=8, cut=0.5, crop=CROP)),
    dict(lv, out='out/v2b_cutaway_L14.png', view=dict(mode='cutaway', level=14, cut=0.55, crop=CROP)),
    dict(lv, out='out/v3_ghost_L8.png', view=dict(mode='ghost', level=8, cut=0.5, crop=CROP),
         env=dict(ghost_col=C('bcd6f5'), wire_col=C('5d9be0'), ghost_alpha=0.08, wire_e=1.6)),
    dict(lv, out='out/v4_exploded.png', view=dict(mode='exploded', crop=CROP, bands=[0, 5.7, 11.7, 17.7, 23.7, 40], gap=7,
                                                   guides=[[0.2, 0.2], [19.8, 0.2], [19.8, 15.8], [0.2, 15.8]]),
         frame_bb=False, res=[1400, 1600]),
    dict(lv, out='out/v5_section_x13.png', view=dict(mode='section', axis='x', at=13, crop=CROP)),
    dict(lv, out='out/v6_plan_L12.png', light='plan', view=dict(mode='plan', level=12, cut=0.5, crop=CROP),
         frame_bb=[-6, -10, 0, 92, 68, 60], frame_clip=True, fog=dict(d=0.8, plan_d0=2.0, plan_d1=45.0),
         style_overrides=dict(flat=0.35, panel=None), camera_out='out/v6_plan_L12.cam.json'),
]
write('levels', dict(res=RES, samples=SAMPLES), levels)

# ---------------------------------------------------------------------------------------------- accretion time-lapse
BLUE = dict(ghost_col=C('9cc4ff'), wire_col=C('4fa3ff'), ghost_alpha=0.12, wire_e=2.2)
tl = []
labels = ['0 site + canal', '1 megacolumns, cores, first deck', '2 upper decks + trusses', '3 transit tube + viaduct',
          '4 infill: ground stratum', '5 infill: stratum 1 + bridges', '6 infill: upper strata', '7 gardens, terraces, roof',
          '8 lights on (dusk)', '9 night']
for k in range(10):
    ph = min(k, 8)
    light = 'overcast' if k < 8 else ('dusk' if k == 8 else 'night')
    j = dict(out='out/timelapse/frame_%02d.png' % k, phase=ph, light=light, label=labels[k], frame_all=False,
             frame_bb=[-7, -9, -3, 93, 69, 121], frame_clip=False, camera=dict(margin=0.03))
    if k < 8:
        j['blueprint'] = True
        j['env'] = BLUE
    tl.append(j)
write('timelapse', dict(spec='specs/arcology.json', res=[1600, 1000], samples=48,
                        view=dict(mode='full', crop=CROP)), tl)

# ---------------------------------------------------------------------------------------------- sprites
CELL = 4.0
PX_TILE = 32
PPM = PX_TILE / (CELL * math.sqrt(2))
HI = 6


def sprite_jobs(spec, fw, fd, height_m, rots, hi=True, name=None):
    name = name or os.path.splitext(os.path.basename(spec))[0]
    pad = 6
    rx = (fw + fd) * 16 + 2 * pad + 16
    rx += rx % 2
    diamond_below = (fw + fd) * 4
    ry = int(math.ceil(height_m * math.cos(math.radians(30)) * PPM)) + (fw + fd) * 8 + 2 * pad + 12
    ry += ry % 2
    y_target = ry - pad - diamond_below          # image row of the footprint centre at ground level
    pan = (y_target - ry / 2) / ry
    jobs = []
    for r in rots:
        tw, td = (fd, fw) if r % 2 else (fw, fd)      # footprint after the quarter-turns
        target = [tw * CELL / 2, td * CELL / 2, 0]
        base = dict(spec=spec, view=dict(mode='sprite', rot=r, footprint=[0, 0, fw, fd]), transparent=True, nofog=True, bloom=0)
        jobs.append(dict(base, out='out/sprites/%s_r%d_lo.png' % (name, r), res=[rx, ry], samples=16, filter_size=0.0,
                         camera=dict(target=target, px_per_m=PPM, pan=[0, pan]),
                         camera_out='out/sprites/%s_r%d_lo.cam.json' % (name, r)))
        if hi:
            jobs.append(dict(base, out='out/sprites/%s_r%d_hi.png' % (name, r), res=[rx * HI, ry * HI], samples=64,
                             camera=dict(target=target, px_per_m=PPM * HI, pan=[0, pan])))
    return jobs


sp = []
sp += sprite_jobs('specs/agent_vertical_farm.json', 2, 2, 46, [0, 1, 2, 3])
sp += sprite_jobs('specs/spr_capsule_stack.json', 2, 1, 40, [0, 1, 2, 3])
for nm, fw, fd, hm in (('spr_res_tower', 1, 1, 30), ('spr_park', 1, 1, 9), ('spr_plaza', 1, 1, 5), ('spr_megacolumn', 2, 2, 28),
                       ('spr_station', 2, 1, 10), ('tile_grass', 1, 1, 1), ('tile_paving', 1, 1, 1), ('tile_road', 1, 1, 1),
                       ('tile_water', 1, 1, 1), ('tile_deck', 1, 1, 1)):
    sp += sprite_jobs('specs/%s.json' % nm, fw, fd, hm, [0], hi=nm.startswith('spr_'))
write('sprites', dict(light='studio', style='sprite'), sp)

# ---------------------------------------------------------------------------------------------- kit catalogue
spec = json.load(open(os.path.join(HERE, 'specs', 'catalog.json')))
cat = []
for p in spec['parts']:
    idx = [t for t in p['tags'] if t.startswith('cat:')][0]
    cat.append(dict(out='out/catalog/%02d_%s.png' % (int(idx[4:]), p['type']), only_tags=[idx], camera=dict(margin=0.1)))
write('catalog', dict(spec='specs/catalog.json', light='studio', res=[420, 420], samples=32, transparent=True, nofog=True, bloom=0), cat)
