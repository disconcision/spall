"""sc.py - helpers for the scale generators (imports the round-2 Spec helper)."""
import json, math, os, random, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SCALE = os.path.dirname(HERE)
AES = os.path.dirname(SCALE)
sys.path.insert(0, os.path.join(AES, 'gen'))
sys.path.insert(0, AES)
from common import Spec as _Spec, C, rpath, CELL, LEVEL   # noqa: E402
import paths as PT   # noqa: E402


def cells(v):
    return v / CELL


class Spec(_Spec):
    def __init__(self, name, **kw):
        super().__init__(name, **kw)
        self.meta['protos'] = {}

    def proto(self, key, build):
        """build(s) adds parts to a fresh Spec; its parts become meta.protos[key] (grid units, origin at 0)."""
        t = _Spec('_p', style=self.meta['style'])
        build(t)
        self.meta['protos'][key] = t.parts

    def scatter(self, key, pts, tags=None):
        if not pts:
            return
        self.add('scatter', 0, 0, 0, 1, 1, 1, key=key, pts=[[round(c, 2) for c in p] for p in pts], tags=tags)

    def write(self, path=None):
        path = path or os.path.join(SCALE, 'specs', self.meta['name'] + '.json')
        with open(path, 'w') as fh:
            json.dump(dict(meta=self.meta, parts=self.parts), fh, separators=(',', ':'))
        print('%s: %d parts, %d protos' % (os.path.relpath(path, SCALE), len(self.parts), len(self.meta['protos'])))
        return os.path.relpath(path, AES)


def write_jobs(name, jobs, **defaults):
    d = dict(res=[1600, 1000], samples=32)
    d.update(defaults)
    for j in jobs:
        if not j['out'].startswith('scale/'):
            j['out'] = 'scale/' + j['out']
    path = os.path.join(SCALE, 'jobs', name + '.json')
    with open(path, 'w') as fh:
        json.dump(dict(defaults=d, jobs=jobs), fh, indent=1)
    print('scale/jobs/%s.json: %d jobs' % (name, len(jobs)))
    return os.path.relpath(path, AES)


def town_hi(t, seed=0, w=90.0, d=60.0, rows=3, n=36, dome=0.0, walls=None):
    kw = dict(n=n, rows=rows, step=3.2, trees=2, plaza=True, dome=dome)
    if walls:
        kw['walls'] = walls
    t.add('town', 0, 0, 0, w, d, 10, **kw)


def town_lo(t, w=90.0, d=60.0, n=14):
    rng = random.Random(3)
    for i in range(n):
        x, y = rng.uniform(0, w - 12), rng.uniform(0, d - 10)
        t.add('cblock', x, y, 0, rng.uniform(7, 12), rng.uniform(6, 10), rng.choice((3.2, 6.4, 9.6)),
              mat=rng.choice(['town_white', 'town_white', 'town_ochre', 'town_terra']), v=0, top=0)


def lowcity(t, size=600.0, seed=5):
    """An ordinary city tile: 20 m streets, blocks of low buildings (the scale reference at the foot of megaforms)."""
    rng = random.Random(seed)
    blk, st = 80.0, 20.0
    n = int(size / (blk + st))
    for i in range(n):
        for j in range(n):
            x0, y0 = i * (blk + st), j * (blk + st)
            if rng.random() < 0.08:
                t.add('cblock', x0, y0, 0, blk, blk, 0.6, mat='grass', v=0, top=0)
                continue
            x = x0
            while x < x0 + blk - 12:
                w = rng.uniform(14, 30)
                for (yy, dd) in ((y0, rng.uniform(14, 26)), (y0 + blk - 22, 22)):
                    h = rng.choice((9.6, 12.8, 16.0, 19.2, 25.6))
                    t.add('cblock', x, yy, 0, min(w, x0 + blk - x), dd, h,
                          mat=rng.choice(['town_white', 'town_ochre', 'town_terra', 'town_grey', 'town_white']), v=0, top=0)
                x += w + rng.uniform(0, 4)
