"""
make_jobs.py - render jobs for the agent-authored buildings (camera, light, view, output) -> jobs/*.json

    python3 make_jobs.py                      # jobs/buildings.json: concept view + 4-rotation sprites (lo + 6x hi) for all
    python3 make_jobs.py iter <id> <draft>    # jobs/iter_<id>.json: quick look at a draft (concept + sprite r0/r1)

Sprite camera = the concept-renders convention (orthographic, az 45, el 30, 32 px per 4 m tile, studio light, sprite
style, no fog, filter 0, transparent).  Unlike the original, each canvas is sized from the building's own bounds so
overhangs are never clipped, and the target is placed with an exact vertical offset instead of a relative pan.
"""
import json, math, os, sys
from geom import spec_bounds, rotate_box_corners, project, UP

HERE = os.path.dirname(os.path.abspath(__file__))
CELL = 4.0
PX_TILE = 32
PPM = PX_TILE / (CELL * math.sqrt(2))
HI = 6
# sprite-safe material substitution (pipeline extension): dithered-alpha glass becomes opaque tinted glass in sprites
SPRITE_REMAP = {'glass_clear': 'glass_px', 'glass_green': 'glass_green_px'}

# id -> concept view settings (style + light + camera tweaks); the spec's own meta.style ('sprite') is used for sprites
BUILDINGS = {
    'hydro_stack': dict(title='Hydroponic capsule stack', light='dusk', style='arcology', cam=dict(margin=0.08),
                        view=dict(mode='ghost', level=5.7, cut=0.0),
                        env=dict(ghost_col=[0.52, 0.66, 0.9], wire_col=[0.36, 0.6, 1.0], ghost_alpha=0.06, wire_e=1.4)),
    'bridge_market': dict(title='Sky-bridge market', light='dusk', style='kowloon', cam=dict(target=[8.0, 4.0, -0.5], ortho_scale=40, az=12, el=28),
                          env=dict(lantern=2.6)),
    'hanging_garden': dict(title='Hanging garden', light='golden', style='solarpunk', cam=dict(target=[4.0, 1.0, 9.0], ortho_scale=34),
                           env=dict(sun_az=300, sun_el=34)),
    'tube_interchange': dict(title='Tube interchange', light='golden', style='arcology', cam=dict(target=[6.0, 6.0, 6.0], ortho_scale=58)),
    'solar_chimney': dict(title='Solar chimney light well', light='dusk', style='arcology', cam=dict(target=[3.0, 5.0, 11.5], ortho_scale=44),
                          view=dict(mode='full', crop=[-3.0, 0.42, 1.58, 5.0]), split_context=True),
    'rooftop_village': dict(title='Rooftop squatter village', light='dusk', style='kowloon', cam=dict(target=[5.5, 6.5, 2.0], ortho_scale=30),
                            env=dict(lantern=2.6)),
}


def sprite_canvas(spec):
    """Canvas (rx, ry) and per-rotation camera targets covering the building (context parts excluded)."""
    fp = spec['meta']['footprint']
    fw, fd = fp['w'], fp['d']
    bb = spec_bounds(spec)
    pad = 6
    ext = []
    for k in range(4):
        tw, td = (fd, fw) if k % 2 else (fw, fd)
        t = (tw * CELL / 2, td * CELL / 2, 0.0)
        ts = project(t)
        pts = [project(p) for p in rotate_box_corners(bb, k, fw * CELL, fd * CELL)]
        ext.append((min(p[0] for p in pts) - ts[0], max(p[0] for p in pts) - ts[0],
                    min(p[1] for p in pts) - ts[1], max(p[1] for p in pts) - ts[1]))
    half_w = max(max(-e[0], e[1]) for e in ext) * PPM
    top = max(e[3] for e in ext) * PPM
    bot = max(-e[2] for e in ext) * PPM
    rx = int(math.ceil(2 * half_w)) + 2 * pad
    rx += rx % 2
    y_target = int(math.ceil(top)) + pad
    ry = y_target + int(math.ceil(bot)) + pad
    ry += ry % 2
    targets = []
    for k in range(4):
        tw, td = (fd, fw) if k % 2 else (fw, fd)
        dlt = (y_target - ry / 2.0) / PPM          # shift the camera so the footprint centre lands on row y_target
        t = [tw * CELL / 2 + UP[0] * dlt, td * CELL / 2 + UP[1] * dlt, UP[2] * dlt]
        targets.append([round(v, 5) for v in t])
    return rx, ry, targets


def sprite_jobs(bid, spec_path, rots=(0, 1, 2, 3), hi=True, outdir='out/sprites', tag=''):
    spec = json.load(open(os.path.join(HERE, spec_path)))
    rx, ry, targets = sprite_canvas(spec)
    fp = spec['meta']['footprint']
    jobs = []
    for r in rots:
        base = dict(spec=spec_path, view=dict(mode='sprite', rot=r, footprint=[0, 0, fp['w'], fp['d']]), transparent=True,
                    nofog=True, bloom=0, drop_tags=['context'], light='studio', style='sprite',
                    style_overrides=dict(remap=SPRITE_REMAP))
        jobs.append(dict(base, out='%s/%s%s_r%d_lo.png' % (outdir, bid, tag, r), res=[rx, ry], samples=16, filter_size=0.0,
                         camera=dict(target=targets[r], px_per_m=PPM), camera_out='%s/%s%s_r%d_lo.cam.json' % (outdir, bid, tag, r)))
        if hi:
            jobs.append(dict(base, out='%s/%s%s_r%d_hi.png' % (outdir, bid, tag, r), res=[rx * HI, ry * HI], samples=64,
                             camera=dict(target=targets[r], px_per_m=PPM * HI)))
    return jobs


def concept_job(bid, spec_path, out, res=(1400, 1050), samples=64, **kw):
    b = BUILDINGS[bid]
    j = dict(spec=spec_path, out=out, light=b['light'], style=b['style'], res=list(res), samples=samples,
             camera=dict(b.get('cam', {})))
    for k in ('view', 'env', 'fog', 'frame_bb', 'frame_clip'):
        if k in b:
            j[k] = b[k]
    if b.get('split_context'):
        # crop/section only the host context; merge the building itself uncut (kitx composite instance)
        j['keep_tags'] = ['context']
        j['instances'] = [dict(spec=spec_path, at=[0, 0, 0], rot=0, drop_tags=['context'])]
    j.update(kw)
    return j


def write(name, jobs, defaults=None):
    os.makedirs(os.path.join(HERE, 'jobs'), exist_ok=True)
    p = os.path.join(HERE, 'jobs', name + '.json')
    with open(p, 'w') as fh:
        json.dump(dict(defaults=defaults or {}, jobs=jobs), fh, indent=1)
    print('jobs/%s.json: %d jobs' % (name, len(jobs)))
    return p


if __name__ == '__main__':
    if sys.argv[1:2] == ['context']:
        jobs = []
        for f in sorted(os.listdir(os.path.join(HERE, 'specs', 'context'))):
            jobs += sprite_jobs(f[:-5], 'specs/context/' + f, rots=(0, 1), hi=False)
        write('context_sprites', jobs)
    elif sys.argv[1:2] == ['iter']:
        bid, draft = sys.argv[2], sys.argv[3]
        sp = 'specs/drafts/%s.%s.json' % (bid, draft) if not draft.endswith('.json') else draft
        jobs = [concept_job(bid, sp, 'out/iter/%s_%s_concept.png' % (bid, draft), res=(1000, 750), samples=24)]
        jobs += sprite_jobs(bid, sp, rots=(0, 1), hi=True, outdir='out/iter', tag='_' + draft)
        write('iter_%s' % bid, jobs)
    else:
        ids = sys.argv[1:] or list(BUILDINGS)
        jobs = []
        for bid in ids:
            sp = 'specs/%s.json' % bid
            if not os.path.exists(os.path.join(HERE, sp)):
                print('skip', bid, '(no final spec yet)')
                continue
            jobs.append(concept_job(bid, sp, 'out/concept/%s.png' % bid))
            jobs += sprite_jobs(bid, sp)
        write('buildings' if not sys.argv[1:] else 'buildings_' + '_'.join(ids), jobs)
