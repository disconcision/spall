"""common.py - helpers for the scene generators: parts in metres, spec / job writing, colour conversion."""
import json, math, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import paths as PT  # noqa: E402

CELL, LEVEL = 4.0, 3.5


def C(h):
    h = h.lstrip('#')
    s = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return [round(((c / 12.92) if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4), 5) for c in s]


class Spec:
    """Collects parts; positions and sizes are given in METRES and converted to the kit grid (4 m cells, 3.5 m levels)."""

    def __init__(self, name, style='brut', seed=1, light='hazy', **meta):
        self.meta = dict(name=name, style=style, seed=seed, light=light, grid=dict(cell=CELL, level=LEVEL))
        self.meta.update(meta)
        self.parts = []

    def add(self, typ, x, y, z, w=1.0, d=1.0, h=1.0, mat=None, rot=0, orient=None, tags=None, **params):
        p = dict(type=typ, x=round(x / CELL, 5), y=round(y / CELL, 5), level=round(z / LEVEL, 5),
                 w=round(w / CELL, 5), d=round(d / CELL, 5), h=round(h / LEVEL, 5))
        if mat:
            p['material'] = mat
        if rot:
            p['rot'] = rot
        if orient:
            p['orient'] = orient
        if tags:
            p['tags'] = list(tags)
        if params:
            # params that collide with the positional names (w, d, h) are passed as p_w, p_d, p_h
            p['params'] = {(k[2:] if k.startswith('p_') else k): v for k, v in params.items()}
        self.parts.append(p)
        return p

    def write(self, path=None):
        path = path or os.path.join(ROOT, 'specs', self.meta['name'] + '.json')
        with open(path, 'w') as fh:
            json.dump(dict(meta=self.meta, parts=self.parts), fh, separators=(',', ':'))
        print('%s: %d parts' % (os.path.relpath(path, ROOT), len(self.parts)))
        return os.path.relpath(path, ROOT)


def write_jobs(name, jobs, **defaults):
    d = dict(res=[1600, 1000], samples=32)
    d.update(defaults)
    path = os.path.join(ROOT, 'jobs', name + '.json')
    with open(path, 'w') as fh:
        json.dump(dict(defaults=d, jobs=jobs), fh, indent=1)
    print('jobs/%s.json: %d jobs' % (name, len(jobs)))


def rpath(pts, nd=3):
    return [[round(c, nd) for c in p] for p in pts]
