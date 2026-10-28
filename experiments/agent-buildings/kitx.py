"""
kitx.py - Blender-side runner for the agent-buildings experiment.

It imports the UNMODIFIED renderer ../concept-renders/kit.py as a module and adds, in memory only:
  * the extension part builders from kitx_parts.py (registered into kit.BUILDERS / kit.MATS),
  * job-level spec preprocessing: "drop_tags" (e.g. leave out 'context' parts in sprites) and "keep_tags",
  * composite scenes: a job may list "instances" = [{"spec", "at": [x, y, level], "rot": k, "drop_tags": [...]}, ...];
    each instance is built by kit's own builders, then rotated/translated at mesh level and merged (materials remapped),
  * stats are written to agent-buildings/out/, never into concept-renders/.

    Blender --background --factory-startup --python kitx.py -- --jobs jobs/foo.json [--only 0,3]
"""
import json, math, os, sys, time
sys.dont_write_bytecode = True   # never write __pycache__ into ../concept-renders (read-only)

HERE = os.path.dirname(os.path.abspath(__file__))
CR = os.path.normpath(os.path.join(HERE, '..', 'concept-renders'))
sys.path.insert(0, HERE)
sys.path.insert(0, CR)

import kit          # noqa: E402  (the original renderer, imported read-only)
import kitx_parts   # noqa: E402  (extension builders + materials)

kitx_parts.register(kit)
_orig_build_scene = kit.build_scene
SCRATCH = os.environ.get('KITX_SCRATCH', os.path.join(HERE, 'out', '_tmp'))


def load_spec(path):
    p = path if os.path.isabs(path) else os.path.join(HERE, path)
    with open(p) as fh:
        return json.load(fh)


def filter_parts(spec, drop_tags=(), keep_tags=()):
    drop, keep = set(drop_tags or ()), set(keep_tags or ())
    parts = []
    for p in spec['parts']:
        tags = set(p.get('tags', []))
        if drop and tags & drop:
            continue
        if keep and not (tags & keep):
            continue
        parts.append(p)
    s = dict(spec)
    s['parts'] = parts
    return s


def rot_xy(p, k, cx, cy):
    x, y = p[0] - cx, p[1] - cy
    for _ in range(k % 4):
        x, y = -y, x
    return x, y


def build_scene_composite(spec, job):
    """kit.build_scene + extra building instances merged at mesh level (translation + quarter turns)."""
    out, mats, lights, all_bb, style, grid = _orig_build_scene(spec, job)
    insts = job.get('instances') or []
    if not insts:
        return out, mats, lights, all_bb, style, grid
    cell, lh = grid['cell'], grid['level']
    main = [o for o in out if o[0] == 'main'][0][1]
    for inst in insts:
        ispec = filter_parts(load_spec(inst['spec']), inst.get('drop_tags', ['context']), inst.get('keep_tags'))
        ispec['meta'] = dict(ispec['meta'])
        ispec['meta']['grid'] = grid                          # the host grid wins
        ijob = {k: v for k, v in job.items() if k not in ('instances', 'view', 'phase', 'only_tags', 'blueprint')}
        ijob['view'] = {'mode': 'full'}
        iout, imats, ilights, ibb, _, _ = _orig_build_scene(ispec, ijob)
        remap = [mats.mid(n) for n in imats.names]
        fp = ispec['meta'].get('footprint', {'w': 1, 'd': 1})
        k = int(inst.get('rot', 0)) % 4
        fw, fd = fp['w'] * cell, fp['d'] * cell
        cx, cy = fw / 2.0, fd / 2.0
        tw, td = (fd, fw) if k % 2 else (fw, fd)
        ax, ay, al = inst['at']
        ox, oy, oz = ax * cell + tw / 2.0, ay * cell + td / 2.0, al * lh

        def T(p):
            x, y = rot_xy(p, k, cx, cy)
            return (x + ox, y + oy, p[2] + oz)
        for name, b, flags in iout:
            b.v = [T(p) for p in b.v]
            b.m = [remap[m] for m in b.m]
            if name == 'main':
                main.extend(b)
            else:
                out.append((name + '_i', b, flags))
        for (p, c, pw, r) in ilights:
            lights.append((T(p), c, pw, r))
        bb = main.aabb()
        if bb:
            for q in range(3):
                all_bb[q] = min(all_bb[q], bb[q]); all_bb[q + 3] = max(all_bb[q + 3], bb[q + 3])
    return out, mats, lights, all_bb, style, grid


kit.build_scene = build_scene_composite


def prep_job(job, idx):
    """Resolve paths; apply drop/keep tags by writing a filtered temp spec."""
    job = dict(job)
    for key in ('spec', 'out', 'camera_out'):
        if job.get(key) and not os.path.isabs(job[key]):
            job[key] = os.path.join(HERE, job[key])
    for inst in job.get('instances') or []:
        if not os.path.isabs(inst['spec']):
            inst['spec'] = os.path.join(HERE, inst['spec'])
    # a job-level style remap (e.g. the sprite glass remap) must not clobber the spec's own meta remap: merge them,
    # the spec's entries winning (kit.build_scene would otherwise dict.update the whole 'remap' key away)
    jr = (job.get('style_overrides') or {}).get('remap')
    if jr is not None:
        meta_so = (load_spec(job['spec']).get('meta', {}).get('style_overrides') or {})
        merged = dict(jr)
        merged.update(meta_so.get('remap', {}))
        so = dict(job['style_overrides'])
        so['remap'] = merged
        job['style_overrides'] = so
    if job.get('drop_tags') or job.get('keep_tags'):
        spec = filter_parts(load_spec(job['spec']), job.get('drop_tags'), job.get('keep_tags'))
        os.makedirs(SCRATCH, exist_ok=True)
        tmp = os.path.join(SCRATCH, 'job%03d_%s' % (idx, os.path.basename(job['spec'])))
        with open(tmp, 'w') as fh:
            json.dump(spec, fh)
        job['spec'] = tmp
    return job


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--jobs', required=True)
    ap.add_argument('--only', default=None)
    a = ap.parse_args(argv)
    jp = a.jobs if os.path.isabs(a.jobs) else os.path.join(HERE, a.jobs)
    with open(jp) as fh:
        jobs = json.load(fh)
    defaults = jobs.get('defaults', {})
    sel = None if a.only is None else set(int(s) for s in a.only.split(','))
    stats = []
    for i, j in enumerate(jobs['jobs']):
        if sel is not None and i not in sel:
            continue
        job = dict(defaults)
        job.update({k: v for k, v in j.items() if v is not None})
        job.setdefault('res', [1600, 1000])
        job = prep_job(job, i)
        st = kit.run_job(job)
        st['out'] = os.path.relpath(job['out'], HERE)
        stats.append(st)
    sp = os.path.join(HERE, 'out', 'stats_' + os.path.splitext(os.path.basename(jp))[0] + '.json')
    old = []
    if os.path.exists(sp) and sel is not None:
        try:
            old = json.load(open(sp))
        except Exception:
            old = []
    keep = {s['out']: s for s in old}
    for s in stats:
        keep[s['out']] = s
    with open(sp, 'w') as fh:
        json.dump(list(keep.values()), fh, indent=1)


if __name__ == '__main__':
    main()
