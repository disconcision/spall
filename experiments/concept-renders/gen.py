"""
gen.py - seeded procedural generators that emit kit-of-parts scene specs (JSON) for kit.py.

    python3 gen.py            # writes specs/*.json for every variant with the default seeds
    python3 gen.py kowloon 11 # one variant, custom seed

Everything is deterministic for a given (variant, seed).  Coordinates: x,y,w,d in grid cells; level,h in levels.
Design rules encoded here (not in the renderer):
  * supports vs infill (Habraken): megacolumns, cores, decks, trusses are tagged 'support'; capsules 'infill'
  * Friedman fill cap: infill footprint per level <= FILL_CAP of the deck area it stands on
  * phases: 'phase:N' / 'until:N' tags drive the accretion time-lapse (supports -> transit -> infill -> gardens -> lights)
"""
import json, math, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
FILL_CAP = 0.5


class Spec:
    def __init__(self, name, style, cell, level, seed, light='overcast', **meta):
        self.meta = dict(name=name, style=style, seed=seed, grid=dict(cell=cell, level=level), light=light)
        self.meta.update(meta)
        self.parts = []

    def add(self, type, x, y, level, w, d, h, rot=0, material=None, tags=(), orient=None, **params):
        p = dict(id=len(self.parts), type=type, x=round(x, 3), y=round(y, 3), level=round(level, 3),
                 w=round(w, 3), d=round(d, 3), h=round(h, 3))
        if rot:
            p['rot'] = rot
        if orient and orient != 'up':
            p['orient'] = orient
        if material:
            p['material'] = material
        if tags:
            p['tags'] = list(tags)
        if params:
            p['params'] = params
        self.parts.append(p)
        return p

    def save(self, path=None):
        path = path or os.path.join(HERE, 'specs', self.meta['name'] + '.json')
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w') as fh:
            json.dump(dict(meta=self.meta, parts=self.parts), fh, separators=(',', ':'))
        return path


def rect_cells(x0, y0, x1, y1):
    return {(x, y) for x in range(int(x0), int(x1)) for y in range(int(y0), int(y1))}


def rects_from_mask(cells):
    """Greedy decomposition of a set of integer cells into rectangles (x, y, w, d)."""
    cells = set(cells)
    used = set()
    out = []
    for (x, y) in sorted(cells, key=lambda c: (c[1], c[0])):
        if (x, y) in used:
            continue
        w = 1
        while (x + w, y) in cells and (x + w, y) not in used:
            w += 1
        d = 1
        while all((x + i, y + d) in cells and (x + i, y + d) not in used for i in range(w)):
            d += 1
        for i in range(w):
            for j in range(d):
                used.add((x + i, y + j))
        out.append((x, y, w, d))
    return out


def cells_of(x, y, w, d):
    return rect_cells(math.floor(x + 1e-6), math.floor(y + 1e-6), math.ceil(x + w - 1e-6), math.ceil(y + d - 1e-6))


# =====================================================================================  canonical arcology
def gen_arcology(seed=7, name='arcology', style='arcology'):
    """Readable canonical megastructure used for level views and the accretion time-lapse."""
    rng = random.Random(seed)
    S = Spec(name, style, 4.0, 3.5, seed, light='overcast', strata=[0, 6, 12, 18, 24],
             description='Canonical arcology: megacolumn grid + 4 structural decks (supports), capsule infill capped at '
                         '50% per level, atrium light wells, transit tube, viaduct, roof garden, cranes.')
    NX, NY = 20, 16
    strata = [0, 6, 12, 18, 24]
    site = rect_cells(0, 0, NX, NY)
    deck_mask = {6: site, 12: site - rect_cells(16, 0, 20, 5), 18: rect_cells(0, 2, 17, 16) - rect_cells(13, 2, 17, 5),
                 24: rect_cells(0, 5, 14, 16)}
    atrium = rect_cells(8, 4, 11, 7)
    well2 = rect_cells(9, 10, 11, 13)
    voids = atrium | well2
    col_x, col_y = [1, 7, 13, 19], [1, 8, 15]
    cs = 1.6
    blocked = set()
    cols = []
    for cx in col_x:
        for cy in col_y:
            top = max(L for L, m in deck_mask.items() if (int(cx), int(cy)) in m or (int(cx) - 1, int(cy)) in m) + 1.6
            cols.append((cx - cs / 2, cy - cs / 2, top))
            blocked |= cells_of(cx - cs / 2, cy - cs / 2, cs, cs)
    cores = [(3, 4, 2, 2, 26), (15, 10, 2, 2, 26)]
    for (x, y, w, d, h) in cores:
        blocked |= rect_cells(x, y, x + w, y + d)
    # ---------------------------------------------------------------- ground + canal (phase 0)
    S.add('ground', -12, -10, 0, 42, 34, 1, material='ground', tags=['phase:0', 'ground'], t=2.0, grid=[8.0, 'concrete_dark'])
    S.add('water', -12, -8, 0, 44, 4, 1, tags=['phase:0'])
    S.add('water', 24, -2.5, 0, 4, 24, 1, tags=['phase:0'])
    # ---------------------------------------------------------------- supports (phase 1-2)
    for (x, y, top) in cols:
        if top <= 12:
            S.add('megacolumn', x, y, 0, cs, cs, top, material='concrete', tags=['phase:1', 'support'], bands=6)
            continue
        S.add('megacolumn', x, y, 0, cs, cs, 12, material='concrete', tags=['phase:1', 'support'], bands=6, capital=False)
        S.add('megacolumn', x, y, 12, cs, cs, top - 12, material='concrete', tags=['phase:2', 'support'], bands=6, plinth=False)
    for (x, y, w, d, h) in cores:
        S.add('core', x, y, 0, w, d, 12, tags=['phase:1', 'support'], cap=False)
        S.add('core', x, y, 12, w, d, h - 12, tags=['phase:2', 'support'])
    S.add('elevator', 5, -1.3, 0, 1, 1, 25, tags=['phase:2', 'support'], cabs=3)
    for L in (6, 12, 18, 24):
        m = deck_mask[L] - voids
        ph = 1 if L == 6 else 2
        for (x, y, w, d) in rects_from_mask(m):
            S.add('deck', x, y, L, w, d, 0.3, tags=['phase:%d' % ph, 'support', 'deck'], t=1.0)
        # deep trusses on the column lines in the service level below each deck
        for cy in col_y:
            for a, b in zip(col_x[:-1], col_x[1:]):
                x0, x1 = a + cs / 2, b - cs / 2
                if all((int(xx), int(cy)) in deck_mask[L] for xx in (x0 + 0.5, x1 - 0.5)):
                    S.add('truss', x0, cy - 0.15, L - 1, x1 - x0, 0.3, 0.7, tags=['phase:%d' % ph, 'support'], r=0.12)
        for cx in col_x:
            for a, b in zip(col_y[:-1], col_y[1:]):
                y0, y1 = a + cs / 2, b - cs / 2
                if all((int(cx), int(yy)) in deck_mask[L] for yy in (y0 + 0.5, y1 - 0.5)):
                    S.add('truss', cx - 0.15, y0, L - 1, 0.3, y1 - y0, 0.7, rot=1, tags=['phase:%d' % ph, 'support'], r=0.12)
        # service pipes under the deck
        for py in (4.5, 11.5):
            xs = [x for x in range(NX) if (x, int(py)) in deck_mask[L]]
            if xs:
                S.add('pipe', min(xs), py, L - 0.62, max(xs) - min(xs) + 1, 0.5, 0.25, tags=['phase:%d' % (ph + 4), 'service'], n=3, r=0.22)
    # lightwell rims + vines + a skylight over the atrium
    for (vx, vy, vw, vd) in rects_from_mask(atrium):
        S.add('lightwell', vx, vy, 6, vw, vd, 18, tags=['phase:7'], rims=[0, 6, 12], vines=1.5)
    for (vx, vy, vw, vd) in rects_from_mask(well2):
        S.add('lightwell', vx, vy, 6, vw, vd, 18, tags=['phase:7'], rims=[0, 6, 12, 18], vines=1.0)
    # ---------------------------------------------------------------- transit (phase 3)
    S.add('tube', -16, 2.4, 7.4, 52, 1.25, 1.45, tags=['phase:3', 'transit'], train=True, train_len=46)
    for px in (-14, -8, -2, 22, 28, 34):
        S.add('pier', px, 2.52, 0, 1, 1, 7.45, tags=['phase:3'])
    S.add('viaduct', 20.3, -12, 12.45, 1.5, 44, 0.3, rot=1, tags=['phase:3', 'transit'], train=True, train_len=44)
    for py in (-10, -4, 20, 27):
        S.add('pier', 20.55, py, 0, 1, 1, 12.05, tags=['phase:3'])
    transit_cells = {(x, y, lv) for x in range(NX) for y in (2, 3) for lv in range(7, 10)}
    # ---------------------------------------------------------------- infill capsules (phase 4-6)
    fill = {}
    stacks = []
    kinds = [((1, 1), 'pod'), ((2, 1), 'flat'), ((1, 2), 'flat'), ((2, 2), 'maison')]
    for si, L0 in enumerate(strata[:-1]):
        floor_mask = (deck_mask.get(L0, site) if L0 else site) - voids - blocked
        area = len(floor_mask)
        usable_levels = list(range(L0, L0 + 5))
        occupied = {lv: set() for lv in usable_levels}
        ph = 4 if si == 0 else (5 if si == 1 else 6)
        tries = 0
        cand = sorted(floor_mask)
        rng.shuffle(cand)
        for (x, y) in cand:
            tries += 1
            (w, d), kind = rng.choice(kinds)
            fp = rect_cells(x, y, x + w, y + d)
            if not fp <= floor_mask:
                continue
            # keep 1-cell alleys between stacks at the base level
            halo = rect_cells(x - 1, y - 1, x + w + 1, y + d + 1)
            if any(c in occupied[L0] for c in halo) and rng.random() < 0.8:
                continue
            hmax = rng.choice((1, 2, 2, 3, 3, 4, 5))
            h = 0
            for lv in usable_levels[:hmax]:
                if len(occupied[lv]) + len(fp) > FILL_CAP * area:
                    break
                if any((c[0], c[1], lv) in transit_cells for c in fp):
                    break
                if fp & occupied[lv]:
                    break
                h += 1
            if h == 0:
                continue
            for lv in usable_levels[:h]:
                occupied[lv] |= fp
            stacks.append((x, y, w, d, L0, h, kind, ph))
        for lv in usable_levels:
            fill[lv] = round(len(occupied[lv]) / max(1, area), 3)
    S.meta['fill_per_level'] = fill
    for (x, y, w, d, L0, h, kind, ph) in stacks:
        lv = L0
        while lv < L0 + h:
            if kind == 'maison' and lv + 2 <= L0 + h:
                hh = 2
            else:
                hh = 1
            mat = rng.choice(('panel', 'panel', 'capsule_white', 'accent_a', 'accent_b', 'panel'))
            win = 'round' if (kind == 'pod' and rng.random() < 0.6) else rng.choice(('grid', 'grid', 'band'))
            S.add('capsule', x, y, lv, w, d, hh, material=mat,
                  tags=['phase:%d' % ph, 'infill'], win=win, balcony=(rng.random() < 0.25), ac=0.3, rot=rng.randrange(4) if w == d else (0 if w > d else 1) * 0)
            lv += hh
    # sky bridges between stacks at a shared level
    by_level = {}
    for st in stacks:
        by_level.setdefault(st[4], []).append(st)
    nb = 0
    for L0, sts in by_level.items():
        for a in sts:
            for b in sts:
                if a is b or nb > 26:
                    continue
                ax, ay, aw, ad, _, ah, _, aph = a
                bx, by, bw, bd, _, bh, _, bph = b
                common = min(ah, bh)
                if common < 2:
                    continue
                lv = L0 + rng.randrange(1, common)
                if bx >= ax + aw + 1 and bx - (ax + aw) <= 4 and max(ay, by) < min(ay + ad, by + bd):
                    yy = max(ay, by) + 0.25
                    if any(((int(xx), int(yy)) in voids) for xx in range(ax + aw, bx)) and rng.random() < 0.5:
                        pass
                    S.add('bridge', ax + aw, yy, lv, bx - (ax + aw), 0.5, 0.2, tags=['phase:%d' % max(aph, bph), 'infill'], t=0.3)
                    nb += 1
                elif by >= ay + ad + 1 and by - (ay + ad) <= 4 and max(ax, bx) < min(ax + aw, bx + bw) and rng.random() < 0.5:
                    xx = max(ax, bx) + 0.25
                    S.add('bridge', xx, ay + ad, lv, 0.5, by - (ay + ad), 0.2, rot=1, tags=['phase:%d' % max(aph, bph), 'infill'], t=0.3)
                    nb += 1
    # external stairs on some stacks
    for (x, y, w, d, L0, h, kind, ph) in stacks:
        if h >= 2 and rng.random() < 0.3 and (x + w + 1, y) not in blocked:
            S.add('stairs', x + w, y, L0, 0.45, min(d, 1), 1, rot=1, tags=['phase:%d' % ph])
    # ---------------------------------------------------------------- gardens, terraces, roof (phase 7)
    tops = sorted(deck_mask)
    for i, L in enumerate(tops):
        above = deck_mask[tops[i + 1]] if i + 1 < len(tops) else set()
        exposed = deck_mask[L] - above - voids - blocked
        # only big exposed patches become terraces
        for (x, y, w, d) in rects_from_mask(exposed):
            if w * d < 3:
                continue
            S.add('terrace', x, y, L, w, d, 0.2, tags=['phase:7', 'garden'], trees=0.018 if L < 24 else 0.014,
                  edge='s' if y == 0 else '', benches=1, path=(w * d > 12), rail='snwe' if L != 24 else 'se')
    S.add('water', 1, 12, 24, 4, 2.5, 1, tags=['phase:7'])
    S.add('solar', 8, 13, 24, 5, 2.5, 1, tags=['phase:7'])
    S.add('antenna', 1.1, 8.6, 25.6, 0.5, 0.5, 5, tags=['phase:7'], dish=True)
    S.add('antenna', 13.2, 15.2, 25.6, 0.5, 0.5, 7, tags=['phase:7'])
    S.add('tank', 11, 6, 24, 1.2, 1.2, 1.4, tags=['phase:7'], legs=1.8)
    # ground cranes raise the supports; roof cranes (Plug-in City) then plug capsules in - and stay: never finished
    S.add('crane', 21.5, 9, 0, 1, 1.2, 30, rot=2, tags=['phase:1', 'until:2', 'crane'], jib=42, hook_at=0.55, drop=30,
          payload=[6, 6, 1.0], payload_win='none', payload_mat='concrete')
    S.add('crane', -2.5, 4, 0, 1, 1.2, 27, tags=['phase:1', 'until:2', 'crane'], jib=36, hook_at=0.7, drop=40)
    S.add('crane', 12, 6.5, 24, 1, 1.2, 8, tags=['phase:3', 'crane'], jib=34, hook_at=0.78, drop=16, payload=[8, 4, 3.0])
    S.add('crane', 3, 13, 24, 1, 1.2, 6, rot=3, tags=['phase:3', 'crane'], jib=26, hook_at=0.6, drop=9)
    # ground: plaza trees along the canal, people, lamps
    for i in range(14):
        S.add('tree', -10 + i * 3, -3.6, 0, 1, 1, 1, tags=['phase:7'], height=rng.uniform(5, 8))
    for i in range(40):
        x, y = rng.uniform(-8, 24), rng.uniform(-3, 0)
        S.add('figure', x, y, 0, 0.3, 0.3, 1, tags=['phase:7'])
    for L in (6, 12, 18, 24):
        m = sorted(deck_mask[L] - voids - blocked)
        for i in range(10):
            x, y = rng.choice(m)
            S.add('figure', x + rng.random() * 0.6, y + rng.random() * 0.6, L, 0.3, 0.3, 1, tags=['phase:7'])
    for i in range(8):
        S.add('lamp', -8 + i * 4.5, -0.8, 0, 0.3, 0.3, 1.3, tags=['phase:8'], power=160)
    # builders: in-game agents at the growth frontier (only visible during their phase)
    for ph, L0 in ((4, 6), (5, 12), (6, 18)):
        m = sorted(deck_mask[L0] - voids - blocked)
        for i in range(4):
            x, y = rng.choice(m)
            S.add('builder', x, y, L0, 1, 1, 1, tags=['phase:%d' % ph, 'until:%d' % ph], weld=True)
    S.add('builder', 6, 8.5, 24, 1, 1, 1, tags=['phase:7'], weld=True)
    return S


# =====================================================================================  BLAME!
def gen_blame(seed=3):
    """Looking down into a colossal void: tall back walls carry lit settlements, low front blocks anchor thin bridges."""
    rng = random.Random(seed)
    S = Spec('blame', 'blame', 4.0, 3.5, seed, light='blame',
             description='BLAME!-like: a colossal void between megablocks, thin bridges at every depth, a far floor, '
                         'tiny lit habitation clusters on sheer walls, runaway Builders on unfinished tops.')
    base = -110
    spans = [(0, 18), (30, 46), (58, 76)]
    blocks = {}
    tops = {(0, 0): 70, (0, 1): 88, (0, 2): 96, (1, 2): 86, (2, 2): 72, (1, 0): 8, (2, 1): 2, (2, 0): -18}
    for (i, j), top in tops.items():
        x0, x1 = spans[i]
        y0, y1 = spans[j]
        top += rng.randint(-3, 3)
        p = dict(dots=0.0035, dots_lit=0.25, slots=rng.randint(6, 12), ledges=rng.randint(1, 3), openings=rng.randint(2, 5),
                 ribs=rng.choice((0, 3, 5)))
        mat = rng.choice(('concrete', 'concrete', 'concrete_dark'))
        if (i, j) in ((0, 0), (2, 2)):
            sw, sd = (x1 - x0) * 0.4 * 4, (y1 - y0) * 0.4 * 4
            p['shaft'] = [((x1 - x0) * 4 - sw) / 2, ((y1 - y0) * 4 - sd) / 2, sw, sd]
        S.add('block', x0, y0, base, x1 - x0, y1 - y0, top - base, material=mat, tags=['support'], **p)
        if rng.random() < 0.6 and top > 40:
            cx0, cy0 = x0 + rng.uniform(2, 6), y0 + rng.uniform(2, 6)
            S.add('block', cx0, cy0, top, rng.uniform(5, 9), rng.uniform(5, 9), rng.randint(6, 16), material=mat,
                  dots=0.003, dots_lit=0.3, slots=3, openings=1, tags=['support'])
        blocks[(i, j)] = (x0, y0, x1, y1, top)
    # the far floor of the void (with a hole that keeps going down)
    for (x, y, w, d) in ((18, 18, 14, 40), (32, 18, 26, 16), (32, 44, 26, 14)):
        S.add('deck', x, y, -55, w, d, 1, material='concrete_dark', t=9.0, beams=12.0, beam_mat='concrete_dark', fascia=None)
    # megabeams spanning the void
    S.add('block', 18, 44, 40, 40, 5, 4, material='concrete_dark', parapet=False, slots=3, dots=0.006, dots_lit=0.5)
    S.add('block', 44, 18, 10, 5, 40, 3, material='concrete', parapet=False, slots=2, dots=0.005, dots_lit=0.4)

    # thin bridges: back-left wall (x=18) -> front-right block (x=58), and back-right wall (y=58) -> front-left block (y=18)
    for k in range(16):
        lv = rng.uniform(-45, 2)
        y = rng.uniform(31, 45)
        S.add('bridge', 18, y, lv, 40, rng.choice((0.3, 0.3, 0.45, 0.8)), 0.1, material='steel_dark', t=0.5, post=3.0,
              keel=rng.random() < 0.4, lamps=rng.choice((0, 0, 3, 5)))
    for k in range(16):
        lv = rng.uniform(-45, 8)
        x = rng.uniform(31, 45)
        S.add('bridge', x, 18, lv, rng.choice((0.3, 0.3, 0.45, 0.8)), 40, 0.1, rot=1, material='steel_dark', t=0.5, post=3.0,
              keel=rng.random() < 0.4, lamps=rng.choice((0, 0, 3, 5)))
    # a few long ones across the whole thing at height, between the tall back blocks
    S.add('bridge', 18, 50, 55, 12, 0.45, 0.1, material='steel_dark', t=0.5, post=3.0)
    S.add('bridge', 46, 58, 60, 12, 0.45, 0.1, material='steel_dark', t=0.5, post=3.0)
    S.add('bridge', 9, 18, 44, 0.45, 12, 0.1, rot=1, material='steel_dark', t=0.5, post=3.0)
    # giant pipes crossing and hanging
    for k in range(5):
        S.add('pipe', 18, rng.uniform(22, 56), rng.uniform(-40, 20), 40, 0.8, 0.8, material=rng.choice(('pipe', 'steel_dark', 'rust')), r=1.4, flange=10.0)
    for k in range(4):
        S.add('pipe', rng.uniform(22, 56), 18, rng.uniform(-40, 20), 0.8, 40, 0.8, material=rng.choice(('pipe', 'steel_dark', 'rust')), r=1.2, flange=10.0)
    for (key, face) in (((0, 1), 'e'), ((1, 2), 's'), ((0, 2), 'e'), ((0, 2), 's'), ((2, 2), 's'), ((0, 0), 'e')):
        b = blocks[key]
        for k in range(2):
            if face == 'e':
                S.add('pipe', b[2] + 0.05, rng.uniform(b[1] + 1, b[3] - 2), base, 0.8, 0.8, b[4] - base - rng.uniform(2, 30),
                      material='steel_dark', axis='z', r=rng.uniform(0.8, 1.6), flange=16.0)
            else:
                S.add('pipe', rng.uniform(b[0] + 1, b[2] - 2), b[1] - 0.9, base, 0.8, 0.8, b[4] - base - rng.uniform(2, 30),
                      material='pipe', axis='z', r=rng.uniform(0.8, 1.6), flange=16.0)

    def cluster_on_ledge(face, b, lv, n, at=None):
        """A tiny lit settlement on a ledge bolted to a block face ('s' = -y face, 'e' = +x face)."""
        if face == 's':
            cx = at if at is not None else rng.uniform(b[0] + 2, b[2] - 9)
            S.add('deck', cx - 1, b[1] - 4.5, lv, 8, 4.5, 0.3, material='steel_dark', tags=['ledge'], t=1.0, fascia=None, rail='sw',
                  beams=3.0, beam_mat='steel_dark')
            ox, oy = cx, b[1] - 4.2
        else:
            cy = at if at is not None else rng.uniform(b[1] + 2, b[3] - 9)
            S.add('deck', b[2], cy - 1, lv, 4.5, 8, 0.3, material='steel_dark', tags=['ledge'], t=1.0, fascia=None, rail='se',
                  beams=3.0, beam_mat='steel_dark')
            ox, oy = b[2] + 0.3, cy
        occ = {}
        for i in range(n):
            if face == 's':
                x, y = ox + rng.randrange(0, 6), oy + rng.randrange(0, 3)
            else:
                x, y = ox + rng.randrange(0, 3), oy + rng.randrange(0, 6)
            h = occ.get((x, y), 0)
            if h >= 5:
                continue
            occ[(x, y)] = h + 1
            S.add('capsule', x, y, lv + h * 0.9, 1, 1, 0.9, material=rng.choice(('panel', 'corrugated', 'rust', 'capsule_white', 'steel_light')),
                  tags=['infill', 'cluster'], win=rng.choice(('grid', 'slit', 'round')), lit=0.8, interior=False, ac=0.4)
        if face == 's':
            S.add('light', ox + 2.5, oy - 3, lv + 2, 1, 1, 1, power=9000, color=[1.0, 0.66, 0.36], radius=2.0)
            S.add('lamp', ox - 0.5, oy - 0.2, lv, 0.3, 0.3, 1.3, power=400)
            S.add('stairs', ox - 4, b[1] - 1.2, lv - 3, 3, 0.4, 3, material='steel_dark')
        else:
            S.add('light', ox + 4, oy + 2.5, lv + 2, 1, 1, 1, power=9000, color=[1.0, 0.66, 0.36], radius=2.0)
            S.add('lamp', ox + 3.8, oy - 0.5, lv, 0.3, 0.3, 1.3, power=400)
            S.add('stairs', b[2] + 0.1, oy - 4, lv - 3, 0.4, 3, 3, material='steel_dark', rot=1)
        for k in range(rng.randint(1, 3)):
            S.add('figure', ox + rng.uniform(0, 3), oy + rng.uniform(0, 1), lv, 0.2, 0.2, 1)

    # settlements on the void-facing walls at many heights
    for lv, at in ((52, 33), (30, 40), (12, 35), (-8, 44), (-26, 38)):
        cluster_on_ledge('e', blocks[(0, 1)], lv + rng.uniform(-3, 3), rng.randint(10, 20), at)
    for lv, at in ((60, 34), (38, 41), (18, 32), (-4, 38), (-22, 44)):
        cluster_on_ledge('s', blocks[(1, 2)], lv + rng.uniform(-3, 3), rng.randint(10, 20), at)
    cluster_on_ledge('e', blocks[(0, 2)], 70, 16, 62)
    cluster_on_ledge('s', blocks[(2, 2)], 40, 14, 62)
    cluster_on_ledge('e', blocks[(0, 0)], 30, 12, 6)
    # settlements on top of the low front blocks
    for key in ((1, 0), (2, 1)):
        b = blocks[key]
        cx, cy = (b[0] + b[2]) / 2 - 3, (b[1] + b[3]) / 2 - 3
        occ = {}
        for i in range(rng.randint(18, 28)):
            x, y = cx + rng.randrange(0, 6), cy + rng.randrange(0, 6)
            h = occ.get((x, y), 0)
            if h >= 4:
                continue
            occ[(x, y)] = h + 1
            S.add('capsule', x, y, b[4] + 0.35 + h * 0.9, 1, 1, 0.9, material=rng.choice(('panel', 'corrugated', 'rust', 'capsule_white')),
                  tags=['infill', 'cluster'], win=rng.choice(('grid', 'slit', 'round')), lit=0.8, interior=False, ac=0.4)
        S.add('light', cx + 3, cy - 2, b[4] + 3, 1, 1, 1, power=9000, color=[1.0, 0.66, 0.36], radius=2.0)
        S.add('antenna', cx + 6.5, cy + 5, b[4] + 0.35, 0.3, 0.3, 7, bars=3)
    # runaway Builders extending the unfinished tops of the tallest blocks
    for key in ((0, 2), (1, 2), (0, 1), (2, 2)):
        b = blocks[key]
        x, y = rng.uniform(b[0] + 3, b[2] - 5), rng.uniform(b[1] + 3, b[3] - 5)
        S.add('builder', x, y, b[4] + 0.35, 1, 1, 1, weld=True, scale=2.0)
        for k in range(rng.randint(5, 10)):
            S.add('megacolumn', x + rng.uniform(-5, 5), y + rng.uniform(-5, 5), b[4], 0.4, 0.4, rng.uniform(1.5, 7),
                  material='steel_dark', capital=False, plinth=False)
        S.add('truss', x - 4, y - 3, b[4] + 4, 8, 0.4, 0.7, material='steel_dark', r=0.1)
    # shafts of light falling into the void
    S.add('lightwell', 24, 24, -55, 5, 5, 150, rims=[], shaft_light=True)
    S.add('lightwell', 40, 34, -55, 3, 3, 150, rims=[], shaft_light=True)
    # a lone traveller on a bridge
    S.add('figure', 30, 38.2, 20.1, 0.2, 0.2, 1)
    return S


# =====================================================================================  Girls' Last Tour
def noisy_mask(rng, x0, y0, x1, y1, keep_fn):
    return {(x, y) for x in range(x0, x1) for y in range(y0, y1) if keep_fn(x, y)}


def gen_glt(seed=5):
    rng = random.Random(seed)
    S = Spec('glt', 'glt', 4.0, 3.5, seed, light='snow',
             description="Girls' Last Tour: stacked city strata; a silent snow-covered ruined top layer, pipes, abandoned "
                         'machinery, collapsed slab edges, darker hazy layers below.')
    N = 48
    # smooth-ish random field for jagged edges
    ph = [rng.uniform(0, 6.28) for _ in range(6)]

    def wob(x, y, k):
        return (math.sin(x * 0.31 + ph[k]) + math.sin(y * 0.27 + ph[k + 1]) + 0.6 * math.sin((x + y) * 0.53 + ph[k + 2]))

    strata = [0, 22, 44]
    masks = {
        0: rect_cells(-4, -4, N + 4, N + 4),
        22: noisy_mask(rng, 0, 0, N, N, lambda x, y: (x - y) < 30 + 5 * wob(x, y, 0) and not ((x - 34) ** 2 + (y - 10) ** 2 < 60 + 20 * wob(x, y, 1))),
        44: noisy_mask(rng, 0, 0, N, N, lambda x, y: (x - y) < 2 + 6 * wob(x, y, 2) and x < 40),
    }
    pillars = []
    for px in (6, 22, 38):
        for py in (6, 22, 38):
            pillars.append((px - 1.5, py - 1.5))
    pill_cells = set()
    for (px, py) in pillars:
        pill_cells |= cells_of(px, py, 3, 3)
    S.add('ground', -6, -6, 0, N + 12, N + 12, 1, material='concrete_dark', t=3.0)
    for (px, py) in pillars:
        top = 44 if (int(px + 1), int(py + 1)) in masks[44] else (22 if (int(px + 1), int(py + 1)) in masks[22] else 12)
        broken = top == 12
        S.add('megacolumn', px, py, 0, 3, 3, top + (rng.uniform(4, 10) if broken else 0), material='concrete',
              tags=['support'], bands=11, capital=not broken)
    # extra pillars continuing up past the top layer (a hint of more layers above)
    for (px, py) in ((6 - 1.5, 38 - 1.5),):
        S.add('megacolumn', px, py, 44, 3, 3, 30, material='concrete', tags=['support'], bands=11, plinth=False)
    S.add('deck', -8, 32, 70, 18, 22, 1, material='concrete', t=5.0, beams=8.0, fascia='concrete_dark')
    for L in (22, 44):
        for (x, y, w, d) in rects_from_mask(masks[L]):
            S.add('deck', x, y, L, w, d, 1, material='concrete', tags=['support', 'deck'], t=6.0, fascia=None, beams=12.0,
                  beam_mat='concrete_dark')
        # rebar stubs / dangling pipes along broken edges
        edge = [c for c in masks[L] if any((c[0] + dx, c[1] + dy) not in masks[L] for dx, dy in ((1, 0), (0, -1)))]
        for (x, y) in rng.sample(edge, min(len(edge), 40)):
            if rng.random() < 0.5:
                S.add('pipe', x + rng.random(), y + rng.random(), L - rng.uniform(4, 12), 0.2, 0.2, rng.uniform(3, 10),
                      material='rust', axis='z', r=0.25, flange=0)
            else:
                S.add('rubble', x, y, L, 1, 1, 0.3, n=4)
    # city on each stratum: ruins along a street grid, pipes, tanks, machines
    for L in (0, 22, 44):
        m = masks[L] - pill_cells
        street = {c for c in m if c[0] % 9 in (0, 1) or c[1] % 8 == 0}
        free = sorted(m - street)
        rng.shuffle(free)
        taken = set()
        nb = 0
        for (x, y) in free:
            w, d = rng.choice(((2, 2), (3, 2), (2, 3), (3, 3), (4, 3), (2, 4)))
            fp = rect_cells(x, y, x + w, y + d)
            if not fp <= (m - street) or fp & taken:
                continue
            taken |= fp
            floors = rng.choice((2, 3, 4, 5, 6, 8)) if L < 44 else rng.choice((2, 3, 3, 4, 5, 6))
            if L == 0:
                floors = rng.choice((3, 5, 7, 9, 12, 14))
                floors = min(floors, 20)
            S.add('ruin', x + 0.1, y + 0.1, L, w - 0.2, d - 0.2, floors, material=rng.choice(('concrete', 'concrete', 'concrete_light', 'panel')),
                  tags=['ruin'], broken=rng.uniform(0.3, 0.9))
            nb += 1
            if nb > (70 if L == 0 else 55):
                break
        # big pipes along streets, with vertical drops
        for k in range(10 if L else 6):
            if rng.random() < 0.5:
                y = rng.choice([c[1] for c in street]) + 0.3
                xs = sorted(c[0] for c in m if c[1] == int(y))
                if len(xs) < 6:
                    continue
                x0 = rng.choice(xs[:len(xs) // 2]); x1 = rng.choice(xs[len(xs) // 2:])
                S.add('pipe', x0, y, L + rng.uniform(0.2, 2.5), x1 - x0, 0.9, 0.5, material=rng.choice(('pipe', 'rust', 'pipe2')), r=rng.uniform(0.5, 1.1), flange=5.0)
            else:
                x = rng.choice([c[0] for c in street]) + 0.3
                ys = sorted(c[1] for c in m if c[0] == int(x))
                if len(ys) < 6:
                    continue
                y0 = rng.choice(ys[:len(ys) // 2]); y1 = rng.choice(ys[len(ys) // 2:])
                S.add('pipe', x, y0, L + rng.uniform(0.2, 2.5), 0.9, y1 - y0, 0.5, material=rng.choice(('pipe', 'rust', 'pipe2')), r=rng.uniform(0.5, 1.1), flange=5.0)
        cand = sorted(m - taken)
        for k in range(8 if L else 4):
            x, y = rng.choice(cand)
            S.add(rng.choice(('tank', 'machine', 'machine')), x, y, L, rng.choice((1, 2)), rng.choice((1, 2)), rng.uniform(1.2, 3),
                  material=rng.choice(('rust', 'steel_light', 'pipe')), legs=rng.choice((0, 1.5)), axis=rng.choice(('z', 'x')))
        for k in range(6 if L else 3):
            x, y = rng.choice(cand)
            S.add('antenna', x, y, L, 0.4, 0.4, rng.uniform(5, 12), bars=rng.randint(1, 4), lightpt=False)
    # vertical pipes hanging between strata
    for k in range(12):
        x, y = rng.uniform(2, 44), rng.uniform(2, 44)
        if (int(x), int(y)) in masks[44]:
            top = 44 - 6.3
        elif (int(x), int(y)) in masks[22]:
            top = 22 - 6.3
        else:
            continue
        bot = 22 if top > 30 and (int(x), int(y)) in masks[22] else 0
        S.add('pipe', x, y, bot, 0.6, 0.6, top - bot, material=rng.choice(('pipe', 'rust')), axis='z', r=rng.uniform(0.5, 1.2), flange=8.0)
    # derelict crane, a stalled train on a viaduct on the top layer, the half-track
    S.add('crane', 12, 12, 44, 1, 1.2, 9, rot=3, material='rust', jib=30, hook_at=0.5, drop=12, lightpt=False)
    S.add('viaduct', 0, 26, 47, 30, 1.4, 0.3, material='concrete', train=True, train_len=34, tracks=1)
    for px in (3, 11, 19, 27):
        S.add('pier', px, 26.2, 44, 1, 1, 3, material='concrete')
    S.add('vehicle', 13.2, 18.4, 44, 0.3, 0.3, 0.2, scale=1.0, headlight=True, power=900)
    S.add('lamp', 13.0, 17.6, 44, 0.2, 0.2, 1.2, power=500)
    S.add('vehicle', 24.2, 8.4, 22, 0.3, 0.3, 0.2, scale=1.0)
    # snowfall specks through the whole volume
    S.add('snow', -4, -4, 0, N + 8, N + 8, 75, n=2600, r=0.22)
    return S


# =====================================================================================  Kowloon
def gen_kowloon(seed=11):
    rng = random.Random(seed)
    S = Spec('kowloon', 'kowloon', 3.0, 2.9, seed, light='dusk',
             description='Kowloon-style accretion: dense organic stacking, overhangs and add-ons, rooftop passage network, '
                         'antenna forest, neon signage, dark alleys.')
    NX, NY = 40, 26
    S.add('ground', -40, -40, 0, NX + 80, NY + 80, 1, material='asphalt', t=2.0)
    # the surrounding low-rise city (context): 2-6 storey blocks beyond a ring road
    for (x0, y0, x1, y1) in ((-38, -38, NX + 38, -9), (-38, NY + 9, NX + 38, NY + 38), (-38, -9, -9, NY + 9), (NX + 9, -9, NX + 38, NY + 9)):
        x = x0
        while x < x1 - 3:
            w = rng.randint(4, 8)
            y = y0
            while y < y1 - 3:
                d = rng.randint(4, 7)
                h = rng.randint(2, 5)
                if rng.random() < 0.85:
                    S.add('capsule', x + 0.5, y + 0.5, 0, min(w, x1 - x) - 1, min(d, y1 - y) - 1, h, material=rng.choice(
                        ('k_grey', 'concrete_dark', 'k_tile', 'concrete')), win='grid', module=2.0, lit=0.14, interior=False,
                        tags=['context'])
                y += d
            x += w
    # lots by recursive split, with a few alleys
    alleys_x = {13, 27}
    alleys_y = {9, 18}
    lots = []

    def split(x0, y0, x1, y1, depth=0):
        w, d = x1 - x0, y1 - y0
        if (w <= 5 and d <= 5) or depth > 7:
            lots.append((x0, y0, x1, y1)); return
        if w >= d:
            c = rng.randint(x0 + 2, x1 - 2)
            split(x0, y0, c, y1, depth + 1); split(c, y0, x1, y1, depth + 1)
        else:
            c = rng.randint(y0 + 2, y1 - 2)
            split(x0, y0, x1, c, depth + 1); split(x0, c, x1, y1, depth + 1)

    xcuts = [0] + sorted(alleys_x) + [NX]
    ycuts = [0] + sorted(alleys_y) + [NY]
    for i in range(len(xcuts) - 1):
        for j in range(len(ycuts) - 1):
            x0 = xcuts[i] + (1 if i > 0 else 0); x1 = xcuts[i + 1]
            y0 = ycuts[j] + (1 if j > 0 else 0); y1 = ycuts[j + 1]
            split(x0, y0, x1, y1)
    ph = [rng.uniform(0, 6.28) for _ in range(4)]
    heights = {}
    for (x0, y0, x1, y1) in lots:
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        n = math.sin(cx * 0.23 + ph[0]) + math.sin(cy * 0.31 + ph[1]) + 0.5 * math.sin((cx - cy) * 0.4 + ph[2])
        h = int(round(12 + 1.3 * n + rng.uniform(-1.6, 1.6)))
        edge = min(cx, cy, NX - cx, NY - cy)
        if edge < 3 and rng.random() < 0.3:
            h -= rng.randint(2, 5)
        heights[(x0, y0, x1, y1)] = max(4, min(15, h))
    kmats = ('k_cream', 'k_pink', 'k_green', 'k_grey', 'k_blue', 'k_tile', 'k_cream', 'k_grey')
    roofs = []
    for lot in lots:
        x0, y0, x1, y1 = lot
        H = heights[lot]
        mat = rng.choice(kmats)
        outer_s = y0 == 0
        outer_e = x1 == NX
        outer_n = y1 == NY
        outer_w = x0 == 0
        on_alley_s = y0 - 1 in alleys_y
        on_alley_e = x1 in alleys_x
        # ground floor shops
        S.add('capsule', x0, y0, 0, x1 - x0, y1 - y0, 1, material='steel_dark', win='band', lit=0.8, interior=False,
              tags=['shop'])
        oh_s = oh_e = oh_n = oh_w = 0.0
        for lv in range(1, H):
            # overhangs grow (and occasionally step back) floor by floor on street-facing sides
            if outer_s or on_alley_s:
                oh_s = max(0.0, min(0.9 if outer_s else 0.3, oh_s + rng.choice((0, 0, 0.15, 0.3, -0.15))))
            if outer_e or on_alley_e:
                oh_e = max(0.0, min(0.9 if outer_e else 0.3, oh_e + rng.choice((0, 0, 0.15, 0.3, -0.15))))
            if outer_n:
                oh_n = max(0.0, min(0.6, oh_n + rng.choice((0, 0.15, -0.15))))
            if outer_w:
                oh_w = max(0.0, min(0.6, oh_w + rng.choice((0, 0.15, -0.15))))
            fx0, fy0 = x0 - oh_w, y0 - oh_s
            fx1, fy1 = x1 + oh_e, y1 + oh_n
            S.add('capsule', fx0, fy0, lv, fx1 - fx0, fy1 - fy0, 1, material=mat, win='grid', module=1.3, ac=0.45, cage=0.3,
                  interior=False, lit=0.4, tags=['infill'])
            # add-on rooms bolted to the facade
            if rng.random() < 0.12 and lv > 2:
                if outer_s or on_alley_s:
                    ax = rng.uniform(fx0, fx1 - 1.2)
                    S.add('capsule', ax, fy0 - 0.6, lv, 1.2, 0.6, 0.9, material=rng.choice(kmats + ('corrugated', 'rust')), win='grid',
                          module=1.2, interior=False, tags=['infill'])
                elif outer_e or on_alley_e:
                    ay = rng.uniform(fy0, fy1 - 1.2)
                    S.add('capsule', fx1, ay, lv, 0.6, 1.2, 0.9, material=rng.choice(kmats + ('corrugated', 'rust')), win='grid',
                          module=1.2, interior=False, tags=['infill'])
            # signage on outer faces at lower floors
            if lv <= 6 and (outer_s or outer_e) and rng.random() < 0.55:
                if outer_s and (not outer_e or rng.random() < 0.5):
                    sx = rng.uniform(fx0 + 0.2, fx1 - 0.6)
                    if rng.random() < 0.6:
                        S.add('sign', sx, fy0, lv + 0.1, 0.4, 0.3, rng.choice((1.5, 2.2, 3.0)), blade=True, proj=1.6)
                    else:
                        S.add('sign', sx, fy0, lv + 0.15, rng.uniform(1.0, 2.2), 0.2, 0.55, blade=False)
                else:
                    sy = rng.uniform(fy0 + 0.2, fy1 - 0.6)
                    if rng.random() < 0.6:
                        S.add('sign', fx1, sy, lv + 0.1, 0.4, 0.3, rng.choice((1.5, 2.2, 3.0)), rot=1, blade=True, proj=1.6)
                    else:
                        S.add('sign', fx1, sy, lv + 0.15, 0.2, rng.uniform(1.0, 2.2), 0.55, rot=1, blade=False)
        roofs.append((x0 - oh_w, y0 - oh_s, x1 + oh_e, y1 + oh_n, H))
    # rooftop world: tanks, antenna forest, shacks, laundry, railings, stairs between roofs, bridges over alleys
    for (x0, y0, x1, y1, H) in roofs:
        w, d = x1 - x0, y1 - y0
        for k in range(rng.randint(2, 6)):
            S.add('antenna', rng.uniform(x0, x1 - 0.3), rng.uniform(y0, y1 - 0.3), H, 0.3, 0.3, rng.uniform(1.2, 3.2),
                  bars=rng.randint(2, 4), lightpt=False, beacon=False, r=0.05)
        if rng.random() < 0.6:
            S.add('tank', rng.uniform(x0, x1 - 1), rng.uniform(y0, y1 - 1), H, 0.9, 0.9, 0.9, material=rng.choice(('steel_light', 'k_blue', 'rust')), legs=0.8)
        if rng.random() < 0.45 and w > 2 and d > 2:
            S.add('shack', rng.uniform(x0, x1 - 1.4), rng.uniform(y0, y1 - 1.2), H, 1.3, 1.1, 0.9, material=rng.choice(('corrugated', 'rust', 'k_cream')))
        if rng.random() < 0.4:
            S.add('laundry', rng.uniform(x0, x1 - 1.6), rng.uniform(y0, y1 - 0.3), H, 1.6, 0.3, 0.7)
        if rng.random() < 0.25:
            S.add('planter', rng.uniform(x0, x1 - 1.0), rng.uniform(y0, y1 - 0.4), H, 1.0, 0.35, 0.2, ph=0.4)
        if rng.random() < 0.2:
            S.add('figure', rng.uniform(x0, x1 - 0.3), rng.uniform(y0, y1 - 0.3), H, 0.3, 0.3, 1)
    # stairs/ladders between adjacent roofs with height difference
    for a in roofs:
        for b in roofs:
            if a is b:
                continue
            if abs(a[2] - b[0]) < 0.35 and b[4] - a[4] in (1, 2) and min(a[3], b[3]) - max(a[1], b[1]) > 1.0 and rng.random() < 0.5:
                y = max(a[1], b[1]) + 0.2
                S.add('stairs', a[2] - (b[4] - a[4]) * 1.2, y, a[4], (b[4] - a[4]) * 1.2, 0.35, b[4] - a[4], material='steel')
    for k in range(18):
        a = rng.choice(roofs)
        cands = [b for b in roofs if b is not a and abs(b[4] - a[4]) <= 1 and b[0] > a[2] and b[0] - a[2] < 2.5 and
                 min(a[3], b[3]) - max(a[1], b[1]) > 0.6]
        if cands:
            b = rng.choice(cands)
            y = max(a[1], b[1]) + 0.1
            S.add('bridge', a[2], y, max(a[4], b[4]), b[0] - a[2], 0.35, 0.1, material='steel', t=0.2, keel=False)
        cands = [b for b in roofs if b is not a and abs(b[4] - a[4]) <= 1 and b[1] > a[3] and b[1] - a[3] < 2.5 and
                 min(a[2], b[2]) - max(a[0], b[0]) > 0.6]
        if cands:
            b = rng.choice(cands)
            x = max(a[0], b[0]) + 0.1
            S.add('bridge', x, a[3], max(a[4], b[4]), 0.35, b[1] - a[3], 0.1, rot=1, material='steel', t=0.2, keel=False)
    # alleys: pipes and cables overhead, a few lamps (dark lower levels)
    for ax in alleys_x:
        for k in range(6):
            lv = rng.uniform(2, 9)
            S.add('pipe', ax - 0.1, rng.uniform(0, NY - 6), lv, 1.2, rng.uniform(3, 8), 0.1, n=rng.randint(1, 3), r=0.12, flange=0, axis='y')
        for k in range(4):
            S.add('lamp', ax + 0.3, rng.uniform(1, NY - 1), 0, 0.2, 0.2, 1.2, power=90)
    for ay in alleys_y:
        for k in range(6):
            lv = rng.uniform(2, 9)
            S.add('pipe', rng.uniform(0, NX - 6), ay - 0.1, lv, rng.uniform(3, 8), 1.2, 0.1, n=rng.randint(1, 3), r=0.12, flange=0, axis='x')
    # street life around the block
    for i in range(16):
        S.add('lamp', -1.5 + i * 3, -1.2, 0, 0.2, 0.2, 1.6, power=160)
    for i in range(10):
        S.add('lamp', NX + 1.2, -1 + i * 3, 0, 0.2, 0.2, 1.6, power=160, rot=1)
    for i in range(50):
        if rng.random() < 0.5:
            S.add('figure', rng.uniform(-6, NX + 2), rng.uniform(-5, -0.8), 0, 0.3, 0.3, 1)
        else:
            S.add('figure', rng.uniform(NX + 0.5, NX + 5), rng.uniform(-4, NY), 0, 0.3, 0.3, 1)
    for i in range(6):
        S.add('train', -12 + i * 12, -9, 0, 3.5, 0.9, 1, material=rng.choice(('cloth_a', 'k_cream', 'accent_c')))
    return S


# =====================================================================================  solarpunk
def gen_solarpunk(seed=21):
    rng = random.Random(seed)
    S = Spec('solarpunk', 'solarpunk', 4.0, 3.5, seed, light='golden',
             description='Solarpunk arcology: terraced timber-and-glass hill, gardens on every step, cascades into a lake, '
                         'greenhouses, solar and wind, tram viaduct.')
    NX, NY = 34, 30
    S.add('ground', -14, -16, 0, NX + 30, NY + 30, 1, material='grass', t=2.0)
    S.add('water', 18, -14, 0, 28, 12, 1, rim_mat='concrete_light')
    S.add('water', 34.5, -2, 0, 11, 30, 1, rim_mat='concrete_light')

    # terraced height field: nested, notched rectangles stepping down from the back-left corner (axis-aligned terraces)
    regions = []
    for k in range(1, 10):
        X = NX - 2 - k * 3.0 + rng.uniform(-0.8, 0.8)
        Y = 1 + k * 2.7 + rng.uniform(-0.8, 0.8)
        notch = None
        if rng.random() < 0.55 and k < 8:
            nw, nd = rng.randint(2, 5), rng.randint(2, 4)
            if rng.random() < 0.5:
                notch = (X - nw, rng.uniform(Y, NY - nd), X, None, nd)  # bite out of the +x edge
            else:
                notch = (rng.uniform(0, X - nw), Y, None, nw, nd)       # bite out of the -y edge
        regions.append((3 * k, X, Y, notch))

    def in_region(x, y, reg):
        L, X, Y, notch = reg
        if not (x < X and y > Y):
            return False
        if notch:
            if notch[2] is not None:  # +x edge bite: x in [X-nw, X], y in [y0, y0+nd]
                if x >= notch[0] and notch[1] <= y <= notch[1] + notch[4]:
                    return False
            else:
                if notch[0] <= x <= notch[0] + notch[3] and y <= Y + notch[4]:
                    return False
        return True

    def hlevel(x, y):
        h = 0
        for reg in regions:
            if in_region(x, y, reg):
                h = reg[0]
        return h
    H = {(x, y): hlevel(x + 0.5, y + 0.5) for x in range(NX) for y in range(NY)}
    levels = sorted(set(H.values()))
    # timber column grid
    for cx in range(2, NX, 5):
        for cy in range(2, NY, 5):
            h = H[(cx, cy)]
            if h >= 3:
                S.add('megacolumn', cx, cy, 0, 0.6, 0.6, h, material='timber_dark', capital=False, plinth=False, tags=['support'])
    # decks at each terrace level: every cell with H >= L gets a deck at L (interior floors every 3 levels)
    for L in levels:
        if L == 0:
            continue
        mask = {c for c, h in H.items() if h >= L}
        for (x, y, w, d) in rects_from_mask(mask):
            S.add('deck', x, y, L, w, d, 0.3, material='concrete_light', t=0.6, fascia='timber', tags=['support', 'deck'])
        # the step riser: units with glass fronts on cells whose neighbour (+x or -y) is lower
        riser = [c for c in mask if H.get((c[0] + 1, c[1]), -1) < L or H.get((c[0], c[1] - 1), -1) < L]
        for (x, y) in riser:
            for lv in range(L - 3, L):
                if lv < 0:
                    continue
                roll = rng.random()
                if roll < 0.18:
                    S.add('greenhouse', x + 0.03, y + 0.03, lv, 0.94, 0.94, 0.93, material='timber', tiers=2, roof=False, tags=['infill'])
                elif roll < 0.36:
                    S.add('capsule', x, y, lv, 1, 1, 1, material=rng.choice(('timber', 'panel')), win='grid', module=1.3, lit=0.45,
                          balcony=True, interior=True, tags=['infill'])
                else:
                    S.add('capsule', x, y, lv, 1, 1, 1, material=rng.choice(('timber', 'timber', 'panel', 'concrete_light')),
                          win='band', lit=0.45, balcony=False, interior=True, tags=['infill'])
        # hanging vines on some riser cells
        for (x, y) in riser:
            if rng.random() < 0.35:
                S.add('lightwell', x, y, L, 1, 1, 0.1, rims=[], vines=0)
        # exposed garden terraces on the cells where this level is the top
        exposed = {c for c, h in H.items() if h == L}
        for (x, y, w, d) in rects_from_mask(exposed):
            if w * d < 2:
                S.add('planter', x + 0.2, y + 0.2, L, 0.6, 0.6, 0.2)
                continue
            S.add('terrace', x, y, L, w, d, 0.2, trees=0.05, edge='s' if d >= 2 else '', path=w * d > 6,
                  benches=1 if w * d > 6 else 0, rail='', tags=['garden'], tree_h=(3.0, 7.5))
    # a water stair: pools on each terrace and sheets of water over each riser, down one column of the hill
    best = None
    for xc in range(8, NX - 8):
        steps = sum(1 for y in range(1, NY) if H[(xc, y)] - H[(xc, y - 1)] == 3)
        if best is None or steps > best[0]:
            best = (steps, xc)
    xc = best[1]
    for y in range(1, NY):
        hi, lo = H[(xc, y)], H[(xc, y - 1)]
        if hi - lo >= 3:
            S.add('water', xc - 0.2, y + 0.05, hi, 1.4, 1.3, 1, rim_mat='concrete_light', tags=['garden'])
            S.add('waterfall', xc - 0.05, y - 0.22, lo, 1.1, 0.16, hi - lo + 0.2, tags=['garden'])
    y0 = min(y for y in range(NY) if H[(xc, y)] > 0)
    S.add('water', xc - 1.5, y0 - 4, 0, 4, 3.6, 1, rim_mat='concrete_light', tags=['garden'])
    # towers at the back with sky gardens
    for (tx, ty, th) in ((3, 24, 40), (10, 26, 34)):
        base = H[(tx, ty)]
        S.add('core', tx, ty, base, 2, 2, th - base, material='concrete_light', cap=False, louvre=0)
        for lv in range(base, th, 4):
            S.add('deck', tx - 1, ty - 1, lv + 4, 4, 4, 0.3, material='concrete_light', t=0.5, fascia='timber', rail='snwe')
            for (ux, uy) in ((tx - 1, ty - 1), (tx + 2, ty - 1), (tx - 1, ty + 2), (tx + 2, ty + 2)):
                if rng.random() < 0.7:
                    S.add('capsule', ux, uy, lv + 1, 1, 1, 2.8, material=rng.choice(('timber', 'panel')), win='band', lit=0.5, interior=True)
            if (lv // 4) % 2 == 0:
                S.add('terrace', tx - 1, ty - 1, lv + 4, 4, 1, 0.2, ntrees=2, edge='', path=False, rail='')
            else:
                S.add('greenhouse', tx - 1, ty - 1, lv + 1, 3, 1, 0.9, roof=False)
        S.add('turbine', tx + 0.5, ty + 0.5, th + 0.5, 1, 1, 4.5)
        S.add('solar', tx - 1, ty - 1, th + 0.5, 4, 4, 1)
    S.add('bridge', 5, 24.3, 20, 5, 0.8, 0.2, material='timber', enclosed=False, lamps=2)
    S.add('planter', 6, 24.35, 20, 3, 0.35, 0.2, ph=0.35)
    # greenhouses and solar on high terraces
    for k in range(10):
        x, y = rng.randrange(0, NX - 3), rng.randrange(0, NY - 2)
        L = H[(x, y)]
        if L >= 9 and all(H.get((x + i, y + j)) == L for i in range(3) for j in range(2)):
            if rng.random() < 0.5:
                S.add('greenhouse', x + 0.2, y + 0.2, L + 0.05, 2.6, 1.6, 0.9, tiers=2)
            else:
                S.add('solar', x, y, L + 0.05, 3, 2, 1)
    # tram viaduct across the front on timber piers
    S.add('viaduct', -14, -4.5, 3, 64, 1.3, 0.3, material='concrete_light', train=True, train_len=30, tracks=1)
    for px in range(-12, 48, 7):
        S.add('pier', px, -4.35, 0, 1, 1, 2.7, material='timber_dark')
    # people and a few lamps
    cells = list(H.items())
    for i in range(60):
        (x, y), L = rng.choice(cells)
        if H.get((x, y)) == L:
            S.add('figure', x + rng.random() * 0.5, y + rng.random() * 0.5, L + 0.15, 0.3, 0.3, 1)
    for i in range(24):
        S.add('tree', rng.uniform(-12, 17), rng.uniform(-14, -6), 0, 1, 1, 1, height=rng.uniform(5, 9))
    for i in range(12):
        S.add('tree', rng.uniform(36, 46), rng.uniform(30, 40), 0, 1, 1, 1, height=rng.uniform(5, 9))
    return S


# =====================================================================================  mixed directions
def gen_mixed(seed=31):
    """Inner corner of a colossal shaft: towers grow sideways off both walls, hang from a ceiling, stand on ledges."""
    rng = random.Random(seed)
    CELL, LH = 4.0, 3.5
    S = Spec('mixed', 'mixed', CELL, LH, seed, light='mixed',
             description='Mixed directions: every surface is a ground. Towers grow sideways off the shaft walls (orient +x/-y), '
                         'hang from a ceiling slab (orient -z) and stand on ledges, all built from the same kit.')

    def M(type, X, Y, Z, W, D, H, orient='up', **kw):
        """Add a part using metres; the part's local frame is re-pointed by orient."""
        return S.add(type, X / CELL, Y / CELL, Z / LH, W / CELL, D / CELL, H / LH, orient=orient, **kw)

    WA_Y = 150.0   # wall A: plane x=0, spans y 0..WA_Y (faces +x)
    WB_X = 150.0   # wall B: plane y=WA_Y, spans x 0..WB_X (faces -y)
    ZB, ZT = -120.0, 170.0
    M('block', -16, -90, ZB, 16, WA_Y + 106, ZT - ZB + 60, material='concrete', dots=0.0012, dots_lit=0.35, slots=10, openings=4,
      parapet=False, ribs=6)
    M('block', 0, WA_Y, ZB, WB_X + 90, 16, ZT - ZB + 60, material='concrete', dots=0.0012, dots_lit=0.35, slots=10, openings=4,
      parapet=False, ribs=6)
    mats = ('panel', 'capsule_white', 'accent_a', 'accent_b', 'k_cream', 'panel', 'accent_c')

    def tower_A(y0, z_top, fy, fz, n, garden=True):
        """Sideways tower out of wall A: footprint fy (along +y) x fz (down from z_top), n storeys outward (+x)."""
        mat = rng.choice(mats)
        M('deck', 0.8, y0 - 1.0, z_top + 1.0, fz + 2.0, fy + 2.0, 0.3, orient='+x', material='concrete_dark', t=0.8, fascia=None)
        for k in range(n):
            M('capsule', 0.8 + k * LH, y0, z_top, fz, fy, LH * 0.9, orient='+x', material=mat,
              win=rng.choice(('grid', 'band', 'round')), lit=0.55, interior=False, ac=0.3, tags=['infill'])
        if garden:
            M('terrace', 0.8 + n * LH, y0, z_top, fz, fy, 0.7, orient='+x', ntrees=max(2, int(fy * fz / 25)), edge='', path=False,
              rail='', tree_h=(3.5, 6.5))
        return 0.8 + n * LH

    def tower_B(x0, z_bot, fx, fz, n, garden=True):
        """Sideways tower out of wall B: footprint fx (along +x) x fz (up from z_bot), n storeys outward (-y)."""
        mat = rng.choice(mats)
        M('deck', x0 - 1.0, WA_Y - 0.8, z_bot - 1.0, fx + 2.0, fz + 2.0, 0.3, orient='-y', material='concrete_dark', t=0.8, fascia=None)
        for k in range(n):
            M('capsule', x0, WA_Y - 0.8 - k * LH, z_bot, fx, fz, LH * 0.9, orient='-y', material=mat,
              win=rng.choice(('grid', 'band', 'round')), lit=0.55, interior=False, ac=0.3, tags=['infill'])
        if garden:
            M('terrace', x0, WA_Y - 0.8 - n * LH, z_bot, fx, fz, 0.7, orient='-y', ntrees=max(2, int(fx * fz / 25)), edge='',
              path=False, rail='', tree_h=(3.5, 6.5))
        return WA_Y - 0.8 - n * LH

    def tower_up(x0, y0, z0, fx, fy, n, garden=True, mat=None):
        mat = mat or rng.choice(mats)
        for k in range(n):
            M('capsule', x0, y0, z0 + k * LH, fx, fy, LH * 0.9, material=mat, win=rng.choice(('grid', 'band')), lit=0.55,
              interior=False, ac=0.3, tags=['infill'])
        if garden:
            M('terrace', x0, y0, z0 + n * LH, fx, fy, 0.7, ntrees=max(1, int(fx * fy / 25)), edge='', path=False, rail='',
              tree_h=(3.5, 6.0))

    def tower_hang(x0, y0, z_ceil, fx, fy, n, garden=True):
        """Hanging tower from the ceiling: footprint x0..x0+fx, y0..y0+fy, n storeys downward."""
        mat = rng.choice(mats)
        for k in range(n):
            M('capsule', x0, y0 + fy, z_ceil - k * LH, fx, fy, LH * 0.9, orient='-z', material=mat,
              win=rng.choice(('grid', 'band')), lit=0.6, interior=False, ac=0.3, tags=['infill'])
        if garden:
            M('terrace', x0, y0 + fy, z_ceil - n * LH, fx, fy, 0.7, orient='-z', ntrees=max(1, int(fx * fy / 25)), edge='',
              path=False, rail='', tree_h=(3.0, 5.0))
        return z_ceil - n * LH

    # ceiling slab over the back corner, hanging towers under it
    ZC = 118.0
    M('deck', 0, 70, ZC + 6, 95, WA_Y - 70, 1, material='concrete_dark', t=6.0, beams=8.0, beam_mat='concrete_dark', fascia=None)
    for (x0, y0, fx, fy, n) in ((10, 128, 12, 12, 6), (34, 118, 8, 16, 9), (58, 130, 12, 8, 4), (76, 100, 12, 12, 7),
                                (18, 86, 8, 8, 5), (50, 84, 16, 8, 3)):
        tower_hang(x0, y0, ZC, fx, fy, n)
    # floor ledge in the corner with upright towers
    ZF = -10.0
    M('deck', 0, 76, ZF, 64, WA_Y - 76, 1, material='concrete_dark', t=6.0, beams=8.0, beam_mat='concrete_dark', fascia='concrete',
      rail='sw')
    for (x0, y0, fx, fy, n) in ((6, 132, 12, 12, 8), (24, 118, 8, 8, 5), (40, 136, 12, 8, 10), (8, 96, 12, 8, 4), (30, 90, 16, 12, 3),
                                (50, 108, 8, 12, 6)):
        tower_up(x0, y0, ZF, fx, fy, n)
    M('terrace', 2, 78, ZF, 26, 14, 0.7, ntrees=10, edge='', path=True, rail='sw')
    # sideways towers out of wall A (their 'up' is +x)
    for (y0, zt, fy, fz, n) in ((10, 104, 12, 12, 5), (34, 70, 8, 16, 7), (58, 102, 16, 8, 3), (20, 40, 12, 12, 8),
                                (62, 50, 8, 8, 4), (40, 10, 16, 12, 6), (90, 60, 12, 8, 5), (16, 140, 12, 8, 4), (96, 26, 8, 8, 3)):
        tower_A(y0, zt, fy, fz, n)
    # sideways towers out of wall B (their 'up' is -y)
    for (x0, zb, fx, fz, n) in ((70, 80, 12, 12, 6), (96, 50, 16, 8, 4), (110, 94, 8, 16, 7), (80, 20, 12, 12, 8),
                                (124, 30, 8, 8, 4), (100, -20, 12, 16, 5), (66, 128, 16, 8, 3), (130, 120, 12, 8, 5)):
        tower_B(x0, zb, fx, fz, n)
    # bridges between surfaces and a transit tube across the shaft
    M('bridge', 0, 44, 62, 70, 1.6, 0.4, material='steel_dark', t=0.5, post=3.0, lamps=4)
    M('bridge', 100, 0, 76, 1.6, WA_Y, 0.4, rot=1, material='steel_dark', t=0.5, post=3.0, lamps=5)
    M('bridge', 30, 0, 32, 1.6, WA_Y, 0.4, rot=1, material='steel_dark', t=0.5, post=3.0, lamps=5)
    M('tube', 0, 22, 88, 180, 5.0, 5.0, train=True, train_len=60)
    M('pipe', 0, 8, 20, 160, 2.6, 2.6, material='pipe', r=1.2, flange=10.0)
    M('pipe', 2, 60, ZB, 3, 3, ZT - ZB - 20, material='rust', axis='z', r=1.3, flange=14.0)
    M('pipe', 120, WA_Y - 3.2, ZB, 3, 3, ZT - ZB - 20, material='pipe', axis='z', r=1.3, flange=14.0)
    # the ceiling is also a ground: upright towers on top of it
    for (x0, y0, fx, fy, n) in ((20, 100, 12, 8, 3), (48, 120, 8, 12, 5), (70, 90, 12, 12, 2)):
        tower_up(x0, y0, ZC + 6, fx, fy, n)
    M('terrace', 6, 74, ZC + 6, 30, 14, 0.7, ntrees=8, edge='', path=True, rail='sw')
    # a waterfall pouring out of wall A into the void
    M('pipe', 0, 120, 96, 6, 3, 3, material='rust', r=1.4, flange=0)
    M('waterfall', 5.0, 119.5, ZF + 6, 1.6, 4, 96 - ZF - 6 + 1.0, rot=1)
    for k in range(10):
        M('light', rng.uniform(10, 120), rng.uniform(10, 140), rng.uniform(-10, 120), 4, 4, 4, power=9000, color=[1.0, 0.75, 0.5],
          radius=3.0)
    M('builder', 44, 80, ZF, 4, 4, 4, weld=True, scale=1.5)
    for k in range(30):
        M('figure', rng.uniform(2, 60), rng.uniform(78, 146), ZF, 0.8, 0.8, 3.5)
    return S


# =====================================================================================  catalogue (one of each part)
CATALOG = [
    ('megacolumn', dict(w=1.5, d=1.5, h=6, params=dict(bands=3))),
    ('core', dict(w=2, d=2, h=6)),
    ('elevator', dict(w=1, d=1, h=6)),
    ('truss', dict(w=4, d=0.5, h=0.8)),
    ('deck', dict(w=3, d=3, h=0.3, params=dict(rail='se'))),
    ('capsule', dict(w=2, d=1, h=1, params=dict(balcony=True, ac=0.6))),
    ('capsule', dict(w=1, d=1, h=1, material='capsule_white', params=dict(win='round'), label='capsule (round)')),
    ('tube', dict(w=5, d=1.2, h=1.4)),
    ('viaduct', dict(w=5, d=1.4, h=0.3, params=dict(train=True, train_len=18, tracks=1))),
    ('bridge', dict(w=4, d=0.5, h=0.2, params=dict(enclosed=True), label='bridge (enclosed)')),
    ('stairs', dict(w=2, d=0.5, h=1.5)),
    ('ramp', dict(w=3, d=0.8, h=1)),
    ('lightwell', dict(w=2, d=2, h=3, params=dict(rims=[0], vines=2, shaft_light=False, skylight=True))),
    ('terrace', dict(w=3, d=3, h=0.2, params=dict(trees=0.06, edge='s', benches=1))),
    ('tree', dict(w=1, d=1, h=1, params=dict(height=7))),
    ('pipe', dict(w=4, d=0.6, h=0.4, params=dict(n=3))),
    ('antenna', dict(w=0.5, d=0.5, h=4, params=dict(dish=True))),
    ('crane', dict(w=1, d=1.2, h=5, params=dict(jib=18, payload=[5, 3, 2.8], drop=6))),
    ('water', dict(w=3, d=2, h=1)),
    ('greenhouse', dict(w=2, d=1.5, h=1)),
    ('solar', dict(w=2, d=2, h=1)),
    ('turbine', dict(w=1, d=1, h=4)),
    ('sign', dict(w=0.4, d=0.4, h=1)),
    ('tank', dict(w=1, d=1, h=1.5, params=dict(legs=1.5))),
    ('machine', dict(w=2, d=2, h=1.5)),
    ('shack', dict(w=1, d=1, h=1)),
    ('ruin', dict(w=2, d=2, h=3)),
    ('builder', dict(w=1, d=1, h=1, params=dict(weld=True))),
    ('block', dict(w=3, d=3, h=8, params=dict(shaft=[3, 3, 6, 6], dots=0.01, slots=3))),
    ('figure', dict(w=0.3, d=0.3, h=1)),
]


def gen_catalog():
    S = Spec('catalog', 'arcology', 4.0, 3.5, 1, light='studio', description='One of each kit part, for the catalogue sheet.')
    for i, (t, kw) in enumerate(CATALOG):
        x = (i % 6) * 10
        y = (i // 6) * -10
        kw = dict(kw)
        params = kw.pop('params', {})
        label = kw.pop('label', t)
        mat = kw.pop('material', None)
        S.add(t, x, y, 0, kw['w'], kw['d'], kw['h'], material=mat, tags=['cat:%d' % i, 'label:' + label], **params)
    return S


# =====================================================================================  sprite set for the in-game mock
def gen_sprites(seed=5):
    """Small kit buildings + ground tiles, each its own spec, rendered with the same sprite camera as the agent building."""
    rng = random.Random(seed)
    out = []

    def spec(name, fw, fd, desc):
        S = Spec(name, 'sprite', 4.0, 3.5, seed, light='studio', kind='building-type', footprint=dict(x=0, y=0, w=fw, d=fd),
                 description=desc)
        out.append(S)
        return S
    # capsule stack with a sky garden (Nakagin homage)
    S = spec('spr_capsule_stack', 2, 1, 'Capsule stack: core + round-window pods plugged on both sides, sky garden on top.')
    S.add('core', 0.7, 0.2, 0, 0.6, 0.6, 9, material='concrete_light', cabs=1, louvre=0, cap=False)
    for lv in range(0, 9):
        for side in (0, 1):
            if rng.random() < 0.85:
                x = 0.0 if side == 0 else 1.3
                S.add('capsule', x + 0.02, 0.15, lv, 0.68, 0.7, 0.95, material=rng.choice(('capsule_white', 'capsule_white', 'accent_b')),
                      win='round', lit=0.7, interior=False, rot=(1 if side == 0 else 3))
    S.add('deck', 0, 0, 9, 2, 1, 0.2, material='concrete_light', t=0.4, rail='snwe')
    S.add('terrace', 0, 0, 9, 2, 1, 0.2, ntrees=3, edge='', path=False, tree_h=(3, 5))
    # slim residential tower
    S = spec('spr_res_tower', 1, 1, 'Slim residential tower with balconies.')
    for lv in range(0, 7):
        S.add('capsule', 0.05, 0.05, lv, 0.9, 0.9, 1, material='panel', win='grid', lit=0.5, balcony=(lv % 2 == 1), interior=False, ac=0.4)
    S.add('tank', 0.2, 0.5, 7, 0.4, 0.4, 0.6, legs=1.0)
    S.add('antenna', 0.6, 0.2, 7, 0.2, 0.2, 1.5, beacon=False, lightpt=False)
    # park tile
    S = spec('spr_park', 1, 1, 'Pocket park.')
    S.add('terrace', 0, 0, 0, 1, 1, 0.2, ntrees=3, edge='', path=False, tree_h=(4, 7))
    # plaza tile
    S = spec('spr_plaza', 1, 1, 'Plaza with lamp and people.')
    S.add('ground', 0, 0, 0.03, 1, 1, 0.1, material='paving', t=0.1)
    S.add('lamp', 0.2, 0.2, 0.03, 0.1, 0.1, 1.2, power=10)
    for i in range(3):
        S.add('figure', rng.uniform(0.3, 0.8), rng.uniform(0.3, 0.8), 0.03, 0.1, 0.1, 1)
    S.add('planter', 0.55, 0.1, 0.03, 0.35, 0.2, 0.2, ph=0.5)
    # megastructure node: megacolumn carrying a deck fragment with a capsule on top
    S = spec('spr_megacolumn', 2, 2, 'Support node: megacolumn, deck fragment, plugged-in capsules.')
    S.add('megacolumn', 0.6, 0.6, 0, 0.8, 0.8, 6, material='concrete', bands=3)
    S.add('deck', 0, 0, 6, 2, 2, 0.3, material='deck', t=0.9, rail='se')
    S.add('capsule', 0.1, 0.1, 6, 1, 1, 1, material='accent_a', win='grid', lit=0.6, interior=False)
    S.add('capsule', 1.1, 0.1, 6, 0.8, 0.8, 1, material='capsule_white', win='round', lit=0.6, interior=False)
    S.add('truss', 0.0, 0.0, 5, 2, 0.12, 0.7, r=0.08)
    # transit station
    S = spec('spr_station', 2, 1, 'Tube station segment.')
    S.add('tube', 0, 0.05, 1.2, 2, 0.9, 1.3, train=True, train_len=7.5, lights=False)
    S.add('pier', 0.35, 0.25, 0, 0.5, 0.5, 1.25)
    S.add('pier', 1.35, 0.25, 0, 0.5, 0.5, 1.25)
    S.add('stairs', 1.0, 0.8, 0, 0.9, 0.2, 1.2, rot=0)
    # ground tiles
    for name, mat in (('tile_grass', 'grass'), ('tile_paving', 'paving'), ('tile_road', 'asphalt'), ('tile_deck', 'deck')):
        S = spec(name, 1, 1, 'Ground tile.')
        S.add('ground', 0, 0, 0, 1, 1, 0.1, material=mat, t=0.35)
        if name == 'tile_road':
            S.add('ground', 0.47, 0.0, 0.01, 0.06, 1, 0.1, material='concrete_light', t=0.05)
    S = spec('tile_water', 1, 1, 'Water tile.')
    S.add('ground', 0, 0, 0, 1, 1, 0.1, material='concrete_dark', t=0.35)
    S.add('ground', 0.03, 0.03, 0.02, 0.94, 0.94, 0.1, material='water', t=0.08)
    return out


GENS = dict(arcology=gen_arcology, blame=gen_blame, glt=gen_glt, kowloon=gen_kowloon, solarpunk=gen_solarpunk,
            mixed=gen_mixed, catalog=gen_catalog)

if __name__ == '__main__':
    if sys.argv[1:2] == ['sprites'] or not sys.argv[1:]:
        for S in gen_sprites():
            S.save()
        print('sprites    %d specs -> specs/spr_*.json, specs/tile_*.json' % len(gen_sprites()))
        if sys.argv[1:2] == ['sprites']:
            sys.exit(0)
    names = sys.argv[1:2] or list(GENS)
    for n in names:
        if len(sys.argv) > 2:
            S = GENS[n](int(sys.argv[2]))
        else:
            S = GENS[n]()
        p = S.save()
        types = {}
        for q in S.parts:
            types[q['type']] = types.get(q['type'], 0) + 1
        print('%-10s %5d parts -> %s' % (n, len(S.parts), os.path.relpath(p, HERE)))
        if n == 'arcology':
            print('   fill per level:', S.meta['fill_per_level'])
