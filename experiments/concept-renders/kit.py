"""
kit.py - data-driven kit-of-parts renderer for megastructure concept renders (Blender 5.0, headless).

    Blender --background --factory-startup --python kit.py -- --jobs jobs/foo.json
    Blender --background --factory-startup --python kit.py -- --spec specs/x.json --out out/x.png [--light dusk] [--view '{"mode":"cutaway","level":9}']

A scene spec is JSON: {"meta": {...}, "parts": [{type,x,y,level,w,d,h,rot,material,tags,params,orient}, ...]}
  x, y, w, d are in grid cells (meta.grid.cell metres); level, h are in levels (meta.grid.level metres).
  rot (0..3) spins the part's local frame inside its world footprint; orient ('up','+x','-x','+y','-y','-z')
  re-points the part's local up axis, so structures can grow sideways off walls or hang from ceilings.
Every part type is a small Python builder that emits boxes / hexahedra / cylinders / icospheres into
per-material mesh buffers.  View modes (cutaway, ghost, exploded, section, plan, sprite) are applied to the
buffers with bmesh bisection; cut faces are capped with a hatched poche material.
"""
import bpy, bmesh, json, math, os, random, sys, time
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
SQ2 = math.sqrt(2.0)
T0 = time.time()


def log(*a):
    print("[kit %6.1fs]" % (time.time() - T0), *a, flush=True)


# =====================================================================================  geometry buffers
BOX_FACES = ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7))


class Buf:
    __slots__ = ("v", "f", "m")

    def __init__(self):
        self.v, self.f, self.m = [], [], []

    def extend(self, o):
        base = len(self.v)
        self.v.extend(o.v)
        self.f.extend(tuple(base + i for i in f) for f in o.f)
        self.m.extend(o.m)

    def aabb(self):
        if not self.v:
            return None
        xs = [p[0] for p in self.v]; ys = [p[1] for p in self.v]; zs = [p[2] for p in self.v]
        return (min(xs), min(ys), min(zs), max(xs), max(ys), max(zs))

    def translated(self, dx, dy, dz):
        b = Buf(); b.v = [(p[0] + dx, p[1] + dy, p[2] + dz) for p in self.v]; b.f = list(self.f); b.m = list(self.m)
        return b


class MatTable:
    def __init__(self):
        self.names, self.idx = [], {}

    def mid(self, name):
        i = self.idx.get(name)
        if i is None:
            i = len(self.names); self.names.append(name); self.idx[name] = i
        return i


ORIENT = {
    'up': None,
    '+x': ((0, 0, 1), (0, 1, 0), (-1, 0, 0)),
    '-x': ((0, 0, -1), (0, 1, 0), (1, 0, 0)),
    '+y': ((1, 0, 0), (0, 0, 1), (0, -1, 0)),
    '-y': ((1, 0, 0), (0, 0, -1), (0, 1, 0)),
    '-z': ((1, 0, 0), (0, -1, 0), (0, 0, -1)),
}


def make_xf(X0, Y0, Z0, W, D, rot, orient):
    if rot == 0:
        f = lambda u, v: (u, v)
    elif rot == 1:
        f = lambda u, v: (W - v, u)
    elif rot == 2:
        f = lambda u, v: (W - u, D - v)
    else:
        f = lambda u, v: (v, D - u)
    R = ORIENT.get(orient)
    if R is None:
        def xf(p):
            a, b = f(p[0], p[1])
            return (X0 + a, Y0 + b, Z0 + p[2])
    else:
        (r00, r01, r02), (r10, r11, r12), (r20, r21, r22) = R
        def xf(p):
            a, b = f(p[0], p[1]); c = p[2]
            return (X0 + r00 * a + r01 * b + r02 * c, Y0 + r10 * a + r11 * b + r12 * c, Z0 + r20 * a + r21 * b + r22 * c)
    return xf


class Part:
    """One spec entry, with its local frame and emit helpers (all coordinates local metres)."""

    def __init__(self, d, grid, idx, seed, mats, style):
        self.d = d
        self.type = d['type']
        c, lh = grid['cell'], grid['level']
        self.cell, self.lh = c, lh
        self.X0, self.Y0, self.Z0 = d.get('x', 0) * c, d.get('y', 0) * c, d.get('level', 0) * lh
        self.W, self.D, self.H = d.get('w', 1) * c, d.get('d', 1) * c, d.get('h', 1) * lh
        self.rot = int(d.get('rot', 0)) % 4
        self.orient = d.get('orient', 'up')
        self.lx, self.ly = (self.W, self.D) if self.rot in (0, 2) else (self.D, self.W)
        self.lz = self.H
        self.mat = d.get('material')
        self.tags = d.get('tags', [])
        self.p = d.get('params', {}) or {}
        self.id = d.get('id', idx)
        self.rng = random.Random("%s:%s" % (seed, self.id))
        self.xf = make_xf(self.X0, self.Y0, self.Z0, self.W, self.D, self.rot, self.orient)
        self.mats = mats
        self.style = style
        self.buf = Buf()
        self.lights = []  # (world pos, colour, power, radius)

    def g(self, k, default=None):
        return self.p.get(k, default)

    def M(self, name):
        return self.mats.mid(self.style.remap(name))

    # ---- emit primitives (local coordinates) -----------------------------------------
    def poly(self, verts, faces, mat):
        b = self.buf; base = len(b.v); xf = self.xf
        b.v.extend(xf(p) for p in verts)
        mi = self.M(mat)
        for f in faces:
            b.f.append(tuple(base + i for i in f)); b.m.append(mi)

    def box(self, mat, x0, y0, z0, x1, y1, z1):
        if x1 < x0: x0, x1 = x1, x0
        if y1 < y0: y0, y1 = y1, y0
        if z1 < z0: z0, z1 = z1, z0
        if x1 - x0 < 1e-5 or y1 - y0 < 1e-5 or z1 - z0 < 1e-5:
            return
        self.poly(((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                   (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)), BOX_FACES, mat)

    def hexa(self, mat, c):
        """8 corners in the same order as box()."""
        self.poly(c, BOX_FACES, mat)

    def obox(self, mat, center, ax, ay, az, hx, hy, hz):
        """Oriented box: center + axes (unit Vectors) * half sizes."""
        C = Vector(center); ax, ay, az = Vector(ax) * hx, Vector(ay) * hy, Vector(az) * hz
        pts = []
        for sz in (-1, 1):
            for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                pts.append(tuple(C + ax * sx + ay * sy + az * sz))
        self.poly(pts, BOX_FACES, mat)

    def cyl(self, mat, p0, p1, r, n=8, caps=True, r1=None, phase=0.0):
        p0, p1 = Vector(p0), Vector(p1)
        ax = p1 - p0
        L = ax.length
        if L < 1e-6:
            return
        ax.normalize()
        t = Vector((0, 0, 1)) if abs(ax.z) < 0.9 else Vector((1, 0, 0))
        u = ax.cross(t).normalized(); v = ax.cross(u).normalized()
        r1 = r if r1 is None else r1
        vs = []
        for i in range(n):
            a = phase + 2 * math.pi * i / n
            d = u * math.cos(a) + v * math.sin(a)
            vs.append(tuple(p0 + d * r))
        for i in range(n):
            a = phase + 2 * math.pi * i / n
            d = u * math.cos(a) + v * math.sin(a)
            vs.append(tuple(p1 + d * r1))
        faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
        if caps:
            faces.append(tuple(reversed(range(n))))
            faces.append(tuple(range(n, 2 * n)))
        self.poly(vs, faces, mat)

    def strut(self, mat, p0, p1, r):
        self.cyl(mat, p0, p1, r, n=4, phase=math.pi / 4)

    def cone(self, mat, base, r, h, n=6, phase=0.0):
        bx, by, bz = base
        vs = [(bx + r * math.cos(phase + 2 * math.pi * i / n), by + r * math.sin(phase + 2 * math.pi * i / n), bz) for i in range(n)]
        vs.append((bx, by, bz + h))
        faces = [(i, (i + 1) % n, n) for i in range(n)] + [tuple(reversed(range(n)))]
        self.poly(vs, faces, mat)

    def ico(self, mat, c, r, rng=None, jitter=0.0, sz=1.0):
        vs = []
        for p in ICO_V:
            j = 1.0 + (rng.uniform(-jitter, jitter) if (rng and jitter) else 0.0)
            vs.append((c[0] + p[0] * r * j, c[1] + p[1] * r * j, c[2] + p[2] * r * j * sz))
        self.poly(vs, ICO_F, mat)

    def light(self, pos, color, power, radius=0.3):
        self.lights.append((self.xf(pos), color, power, radius))


def _icosa():
    t = (1.0 + math.sqrt(5.0)) / 2.0
    v = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
         (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    n = math.sqrt(1 + t * t)
    v = [(a / n, b / n, c / n) for a, b, c in v]
    f = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6),
         (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10),
         (8, 6, 7), (9, 8, 1)]
    return v, f


ICO_V, ICO_F = _icosa()


# =====================================================================================  part builders
def railing(P, mat, x0, y0, x1, y1, z, h=1.05, post=1.8, r=0.04):
    """Posts + top rail + mid rail along a straight local segment at height z."""
    L = math.hypot(x1 - x0, y1 - y0)
    if L < 0.05:
        return
    n = max(1, int(L / post))
    for i in range(n + 1):
        t = i / n
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        P.box(mat, x - r, y - r, z, x + r, y + r, z + h)
    P.strut(mat, (x0, y0, z + h), (x1, y1, z + h), r * 1.2)
    P.strut(mat, (x0, y0, z + h * 0.5), (x1, y1, z + h * 0.5), r * 0.8)


def rail_sides(P, sides, z, mat='steel', inset=0.1, h=1.05):
    lx, ly = P.lx, P.ly
    segs = {'s': (0, inset, lx, inset), 'n': (0, ly - inset, lx, ly - inset),
            'w': (inset, 0, inset, ly), 'e': (lx - inset, 0, lx - inset, ly)}
    if sides is True or sides == 'all':
        sides = 'snwe'
    for s in (sides or ''):
        if s in segs:
            railing(P, mat, *segs[s], z, h=h)


def b_megacolumn(P):
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'concrete'
    P.box(m, 0, 0, 0, lx, ly, lz)
    k = 0.10 * min(lx, ly)
    bands = P.g('bands', 0)
    if bands:
        step = bands * P.lh
        z = step
        while z < lz - 1.0:
            P.box(m, -k * 0.6, -k * 0.6, z - 0.35, lx + k * 0.6, ly + k * 0.6, z + 0.35)
            z += step
    if P.g('capital', True):
        P.box(m, -k, -k, lz - 1.2, lx + k, ly + k, lz)
    if P.g('plinth', True):
        P.box(m, -k, -k, 0, lx + k, ly + k, min(lz, 1.6))
    ribs = P.g('ribs', 0)
    if ribs:
        rw = min(lx, ly) * 0.08
        for i in range(1, ribs + 1):
            t = i / (ribs + 1)
            P.box(m, lx * t - rw, -rw, 0, lx * t + rw, 0, lz)
            P.box(m, lx, ly * t - rw, 0, lx + rw, ly * t + rw, lz)
            P.box(m, lx * t - rw, ly, 0, lx * t + rw, ly + rw, lz)
            P.box(m, -rw, ly * t - rw, 0, 0, ly * t + rw, lz)


def b_core(P):
    """Service / elevator core: solid mass with a glazed lift slot on its local -y face."""
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'concrete'
    sw = min(2.4, lx * 0.4); sd = 1.6
    xs0 = lx / 2 - sw / 2; xs1 = lx / 2 + sw / 2
    P.box(m, 0, 0, 0, xs0, ly, lz)
    P.box(m, xs1, 0, 0, lx, ly, lz)
    P.box(m, xs0, sd, 0, xs1, ly, lz)
    # lift cabs in the slot
    ncab = P.g('cabs', 2)
    for i in range(ncab):
        z = P.rng.uniform(1.0, max(1.5, lz - 4))
        P.box('lamp', xs0 + 0.2, 0.3, z, xs1 - 0.2, sd - 0.1, z + 2.6)
    P.box('glass', xs0, 0.05, 0, xs1, 0.2, lz)
    # vents / louvres band every few levels
    lv = P.g('louvre', 4)
    if lv:
        z = lv * P.lh
        while z < lz - 2:
            P.box('steel_dark', lx * 0.1, -0.08, z, xs0 - 0.4, 0.01, z + 1.2)
            z += lv * P.lh
    # machine room
    if P.g('cap', True):
        P.box(m, lx * 0.15, ly * 0.15, lz, lx * 0.85, ly * 0.85, lz + 2.4)
        P.box('steel_dark', lx * 0.25, ly * 0.3, lz + 2.4, lx * 0.6, ly * 0.7, lz + 3.0)


def b_elevator(P):
    """Free-standing glazed lift tower with cabs."""
    lx, ly, lz = P.lx, P.ly, P.lz
    fr = P.mat or 'steel'
    r = 0.18
    for (x, y) in ((0, 0), (lx, 0), (lx, ly), (0, ly)):
        P.box(fr, x - r, y - r, 0, x + r, y + r, lz + 2.5)
    z = 0
    while z <= lz + 0.01:
        P.box(fr, -r, -r, z, lx + r, r, z + 0.25)
        P.box(fr, -r, ly - r, z, lx + r, ly + r, z + 0.25)
        P.box(fr, -r, -r, z, r, ly + r, z + 0.25)
        P.box(fr, lx - r, -r, z, lx + r, ly + r, z + 0.25)
        z += P.lh
    P.box('glass_clear', 0.05, 0.05, 0, lx - 0.05, ly - 0.05, lz)
    for i in range(P.g('cabs', 2)):
        zc = P.rng.uniform(0.5, max(0.8, lz - 3))
        P.box('lamp', 0.4, 0.4, zc, lx - 0.4, ly - 0.4, zc + 2.6)
    P.box(fr, -0.3, -0.3, lz + 2.5, lx + 0.3, ly + 0.3, lz + 3.6)


def b_truss(P):
    """Lattice truss along local x; section ly x lz."""
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'steel'
    r = P.g('r', max(0.08, min(ly, lz) * 0.05))
    for (y, z) in ((0, 0), (ly, 0), (0, lz), (ly, lz)):
        P.box(m, 0, y - r, z - r, lx, y + r, z + r)
    n = max(1, int(round(lx / max(lz, 1.0))))
    step = lx / n
    for i in range(n + 1):
        x = i * step
        for y in (0, ly):
            P.box(m, x - r, y - r, 0, x + r, y + r, lz)
        P.box(m, x - r * 0.8, 0, lz - r * 0.8, x + r * 0.8, ly, lz + r * 0.8)
        P.box(m, x - r * 0.8, 0, -r * 0.8, x + r * 0.8, ly, r * 0.8)
        if i < n:
            for y in (0, ly):
                if i % 2 == 0:
                    P.strut(m, (x, y, 0), (x + step, y, lz), r * 0.75)
                else:
                    P.strut(m, (x, y, lz), (x + step, y, 0), r * 0.75)


def b_deck(P):
    """Structural deck: slab whose TOP sits at the part level; optional fascia, trim, railings, top finish."""
    lx, ly = P.lx, P.ly
    m = P.mat or 'deck'
    t = P.g('t', 1.0)
    P.box(m, 0, 0, -t, lx, ly, 0)
    top = P.g('top')
    if top:
        P.box(top, 0.05, 0.05, 0, lx - 0.05, ly - 0.05, 0.08)
    fas = P.g('fascia', 'concrete_dark')
    if fas:
        e = 0.12
        P.box(fas, -e, -e, -t - 0.05, lx + e, ly + e, -t + min(0.35, t * 0.4))
    rail = P.g('rail')
    if rail:
        rail_sides(P, rail, 0.0, P.g('rail_mat', 'steel'))
    under = P.g('beams', 0)
    if under:
        # downstand beams every `under` metres along x
        x = under
        while x < lx - 0.5:
            P.box(P.g('beam_mat', m), x - 0.35, 0, -t - 1.2, x + 0.35, ly, -t)
            x += under


def b_slab(P):
    P.p.setdefault('t', 0.35)
    P.p.setdefault('fascia', None)
    b_deck(P)


def b_ground(P):
    lx, ly = P.lx, P.ly
    t = P.g('t', 2.0)
    P.box(P.mat or 'ground', 0, 0, -t, lx, ly, 0)
    grid = P.g('grid')
    if grid:  # paving joints as thin darker strips
        step, mat = grid
        x = step
        while x < lx:
            P.box(mat, x - 0.06, 0, 0, x + 0.06, ly, 0.02); x += step
        y = step
        while y < ly:
            P.box(mat, 0, y - 0.06, 0, lx, y + 0.06, 0.02); y += step


WIN_LIT = ('win_a', 'win_b', 'win_c')


def pick_win(P, lit=None):
    lit = P.style.lit if lit is None else lit
    if P.g('lit') is not None:
        lit = P.g('lit')
    if P.rng.random() < lit:
        return P.rng.choice(WIN_LIT)
    return 'win_dark'


def facade_windows(P, face, L, z0, z1, depth_out=0.05, style='grid', module=1.6, lit=None, x0=0.0):
    """Windows on one wall face. face in 's','n','w','e' (local), L = face length."""
    lx, ly = P.lx, P.ly
    ww, wh, sill = P.g('win_w', 0.9), P.g('win_h', 1.25), P.g('sill', 0.85)
    rows = max(1, int(round((z1 - z0) / P.lh)))
    rowh = (z1 - z0) / rows

    def emit(a0, a1, zz0, zz1, mat):
        o = depth_out
        if face == 's':
            P.box(mat, a0, -o, zz0, a1, 0.03, zz1)
        elif face == 'n':
            P.box(mat, a0, ly - 0.03, zz0, a1, ly + o, zz1)
        elif face == 'w':
            P.box(mat, -o, a0, zz0, 0.03, a1, zz1)
        else:
            P.box(mat, lx - 0.03, a0, zz0, lx + o, a1, zz1)

    for rr in range(rows):
        zb = z0 + rr * rowh
        if style == 'band':
            emit(0.35, L - 0.35, zb + sill * 0.8, zb + min(rowh - 0.4, sill * 0.8 + wh * 1.1), pick_win(P, lit))
            continue
        if style == 'slit':
            n = max(1, int((L - 0.4) / 1.1))
            step = (L - 0.4) / n
            for i in range(n):
                c = 0.2 + step * (i + 0.5)
                emit(c - 0.14, c + 0.14, zb + 0.4, zb + rowh - 0.45, pick_win(P, lit))
            continue
        if style == 'round':
            c = L / 2; rad = min(0.75, rowh * 0.3, L * 0.3)
            zc = zb + rowh * 0.5
            mat = pick_win(P, lit)
            # porthole as a 12-gon prism on the face
            if face in ('s', 'n'):
                y = -depth_out if face == 's' else ly + depth_out
                y2 = 0.03 if face == 's' else ly - 0.03
                P.cyl(mat, (c, y, zc), (c, y2, zc), rad, n=12)
                P.cyl('steel_light', (c, y - 0.02 if face == 's' else y + 0.02, zc), (c, y2, zc), rad * 1.18, n=12)
            else:
                x = -depth_out if face == 'w' else lx + depth_out
                x2 = 0.03 if face == 'w' else lx - 0.03
                P.cyl(mat, (x, c, zc), (x2, c, zc), rad, n=12)
                P.cyl('steel_light', (x - 0.02 if face == 'w' else x + 0.02, c, zc), (x2, c, zc), rad * 1.18, n=12)
            continue
        n = max(1, int((L - 0.3) / module))
        step = (L - 0.3) / n
        for i in range(n):
            c = 0.15 + step * (i + 0.5)
            emit(c - ww / 2, c + ww / 2, zb + sill, zb + min(rowh - 0.35, sill + wh), pick_win(P, lit))


def b_capsule(P):
    """Hollow infill unit: floor, roof, 4 walls, window grid, optional interior, balcony, AC boxes."""
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'panel'
    t, tf = P.g('wall', 0.22), 0.28
    broken = P.g('broken', 0.0)
    roof = P.g('roof', True) and not (broken and P.rng.random() < broken)
    P.box(m, 0, 0, 0, lx, ly, tf)
    if roof:
        P.box(P.g('roof_mat', m), 0, 0, lz - tf, lx, ly, lz)
    zt = lz - (tf if roof else 0)
    walls = (('s', (0, 0, tf, lx, t, zt), lx), ('n', (0, ly - t, tf, lx, ly, zt), lx),
             ('w', (0, t, tf, t, ly - t, zt), ly), ('e', (lx - t, t, tf, lx, ly - t, zt), ly))
    for face, (a, b, c, d, e, f), L in walls:
        if broken and P.rng.random() < broken * 0.6:
            f = c + (f - c) * P.rng.uniform(0.2, 0.8)
        P.box(m, a, b, c, d, e, f)
    ws = P.g('win', 'grid')
    sides = P.g('sides', 'snwe')
    if ws and ws != 'none':
        for face, L in (('s', lx), ('n', lx), ('w', ly), ('e', ly)):
            if face in sides:
                facade_windows(P, face, L, tf, zt, style=ws, module=P.g('module', 1.6),
                               lit=None if not broken else 0.0)
    if P.g('interior', True) and lx > 2.2 and ly > 2.2 and lz > 2.2:
        rng = P.rng
        fm = rng.choice(('furn_a', 'furn_b', 'furn_c'))
        bx = rng.uniform(t + 0.1, max(t + 0.15, lx - 2.2))
        P.box(fm, bx, t + 0.1, tf, bx + 1.9, t + 1.0, tf + 0.45)
        tx = rng.uniform(t + 0.2, max(t + 0.25, lx - 1.2)); ty = rng.uniform(t + 1.2, max(t + 1.25, ly - 1.0))
        P.box('furn_b', tx, ty, tf, tx + 0.8, ty + 0.8, tf + 0.75)
        if not broken:
            P.box('lamp', tx + 0.3, ty + 0.3, tf + 0.75, tx + 0.5, ty + 0.5, tf + 1.05)
    if P.g('balcony'):
        bd = 1.1
        P.box(m, 0.3, -bd, 0, lx - 0.3, 0, 0.18)
        railing(P, 'steel', 0.3, -bd + 0.05, lx - 0.3, -bd + 0.05, 0.18, h=1.0, post=1.0)
    ac = P.g('ac', 0.0)
    if ac:
        rows = max(1, int(round(lz / P.lh)))
        for rr in range(rows):
            for face in ('s', 'e'):
                if P.rng.random() < ac:
                    z = rr * P.lh + 0.3
                    if face == 's':
                        c = P.rng.uniform(0.6, lx - 0.6)
                        P.box('steel_light', c - 0.35, -0.45, z, c + 0.35, 0.0, z + 0.5)
                    else:
                        c = P.rng.uniform(0.6, ly - 0.6)
                        P.box('steel_light', lx, c - 0.35, z, lx + 0.45, c + 0.35, z + 0.5)
    cage = P.g('cage', 0.0)
    if cage and P.rng.random() < cage:  # Kowloon window cages on the s face
        c = P.rng.uniform(1.0, lx - 1.0)
        z = P.rng.randrange(max(1, int(round(lz / P.lh)))) * P.lh + 0.6
        P.box('rust', c - 0.9, -0.7, z, c + 0.9, 0.0, z + 0.08)
        for i in range(7):
            x = c - 0.9 + i * 0.3
            P.box('rust', x - 0.025, -0.7, z, x + 0.025, -0.65, z + 1.4)
        P.box('rust', c - 0.9, -0.7, z + 1.4, c + 0.9, 0.0, z + 1.46)


def ring_segments(P, mat, x0, x1, R, t, n=16, a0=0.0, a1=2 * math.pi, cy=None, cz=None, mats=None):
    """Hollow cylinder along local x built from n closed wedge blocks (so cuts cap as an annulus)."""
    cy = P.ly / 2 if cy is None else cy
    cz = P.lz / 2 if cz is None else cz
    for i in range(n):
        u0 = a0 + (a1 - a0) * i / n; u1 = a0 + (a1 - a0) * (i + 1) / n
        mm = mats(u0, u1) if mats else mat
        ri, ro = R - t, R
        c = [(x0, cy + ri * math.cos(u0), cz + ri * math.sin(u0)), (x1, cy + ri * math.cos(u0), cz + ri * math.sin(u0)),
             (x1, cy + ro * math.cos(u0), cz + ro * math.sin(u0)), (x0, cy + ro * math.cos(u0), cz + ro * math.sin(u0)),
             (x0, cy + ri * math.cos(u1), cz + ri * math.sin(u1)), (x1, cy + ri * math.cos(u1), cz + ri * math.sin(u1)),
             (x1, cy + ro * math.cos(u1), cz + ro * math.sin(u1)), (x0, cy + ro * math.cos(u1), cz + ro * math.sin(u1))]
        P.hexa(mm, c)


def train(P, x0, x1, y0, y1, z0, h=3.0, car=11.0, gap=0.7, mat='train'):
    x = x0
    while x + car <= x1:
        P.box(mat, x, y0, z0 + 0.5, x + car, y1, z0 + h)
        P.box('steel_dark', x + 0.8, y0 + 0.2, z0, x + car - 0.8, y1 - 0.2, z0 + 0.5)
        P.box('win_train', x + 0.6, y0 - 0.04, z0 + 1.5, x + car - 0.6, y1 + 0.04, z0 + 2.3)
        P.box('steel_light', x + 0.3, y0 + 0.3, z0 + h, x + car - 0.3, y1 - 0.3, z0 + h + 0.25)
        x += car + gap


def b_tube(P):
    """Enclosed transit tube along local x: glazed upper wall, solid belly, ribs, floor, optional train."""
    lx, ly, lz = P.lx, P.ly, P.lz
    R = min(ly, lz) / 2
    t = 0.25
    body = P.mat or 'tube'

    def seg_mat(u0, u1):
        um = (u0 + u1) / 2
        return 'glass_clear' if math.sin(um) > -0.15 else body
    ring_segments(P, body, 0, lx, R, t, n=16, mats=seg_mat)
    rib = P.g('rib', 6.0)
    x = rib / 2
    while x < lx:
        ring_segments(P, 'steel', x - 0.25, x + 0.25, R + 0.18, 0.2, n=16)
        x += rib
    fz = lz / 2 - R * 0.55
    P.box(P.g('floor', 'steel_dark'), 0, ly / 2 - R * 0.8, fz - 0.3, lx, ly / 2 + R * 0.8, fz)
    if P.g('train', True):
        w = min(2.8, R * 1.1)
        tl = P.g('train_len', min(lx * 0.6, 48.0))
        tx = P.rng.uniform(0, max(0.0, lx - tl))
        train(P, tx, tx + tl, ly / 2 - w / 2, ly / 2 + w / 2, fz, h=min(3.0, R * 1.2))
        if P.g('lights', True):
            P.light((tx + tl / 2, ly / 2, fz + 1.8), (1.0, 0.8, 0.6), 400, 1.0)


def b_viaduct(P):
    """Open rail viaduct along local x; deck top at part level (z=0)."""
    lx, ly = P.lx, P.ly
    m = P.mat or 'concrete'
    t = P.g('t', 1.4)
    P.box(m, 0, 0, -t, lx, ly, 0)
    P.box(m, 0, ly * 0.1, -t - 0.8, lx, ly * 0.9, -t)
    P.box(m, 0, 0, 0, lx, 0.3, 1.1)
    P.box(m, 0, ly - 0.3, 0, lx, ly, 1.1)
    tracks = P.g('tracks', 2)
    for k in range(tracks):
        yc = ly * (k + 0.5) / tracks
        for dy in (-0.72, 0.72):
            P.box('steel', 0, yc + dy - 0.05, 0, lx, yc + dy + 0.05, 0.18)
        P.box('ballast', 0, yc - 1.3, 0, lx, yc + 1.3, 0.08)
    mast = P.g('mast', 12.0)
    x = mast / 2
    while x < lx:
        P.box('steel', x - 0.12, 0.05, 0, x + 0.12, 0.3, 6.2)
        P.box('steel', x - 0.1, 0.05, 5.9, x + 0.1, ly * 0.8, 6.1)
        x += mast
    if P.g('train', False):
        tl = P.g('train_len', min(lx * 0.5, 45.0))
        tx = P.rng.uniform(0, max(0.0, lx - tl))
        yc = ly * 0.5 / tracks
        train(P, tx, tx + tl, yc - 1.4, yc + 1.4, 0.18)


def b_pier(P):
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'concrete'
    k = 0.25
    P.hexa(m, [(lx * k, ly * k, 0), (lx * (1 - k), ly * k, 0), (lx * (1 - k), ly * (1 - k), 0), (lx * k, ly * (1 - k), 0),
               (0, 0, lz - 1.5), (lx, 0, lz - 1.5), (lx, ly, lz - 1.5), (0, ly, lz - 1.5)])
    P.box(m, 0, 0, lz - 1.5, lx, ly, lz)


def b_bridge(P):
    """Sky bridge along local x: thin deck, railings, optional glazed enclosure."""
    lx, ly = P.lx, P.ly
    m = P.mat or 'steel'
    t = P.g('t', 0.35)
    P.box(m, 0, 0, -t, lx, ly, 0)
    if P.g('keel', True):
        P.box(P.g('keel_mat', m), 0, ly * 0.3, -t - min(1.2, lx * 0.02 + 0.3), lx, ly * 0.7, -t)
    if P.g('enclosed'):
        h = P.g('eh', 2.8)
        for y in (0, ly):
            P.box('steel', 0, y - 0.08, 0, lx, y + 0.08, 0.3)
            P.box('steel', 0, y - 0.08, h - 0.2, lx, y + 0.08, h)
        x = 0
        while x <= lx:
            for y in (0, ly):
                P.box('steel', x - 0.08, y - 0.08, 0, x + 0.08, y + 0.08, h)
            x += 3.0
        P.box('glass_clear', 0, 0.05, 0.3, lx, ly - 0.05, h - 0.2)
        P.box('steel', 0, 0, h, lx, ly, h + 0.2)
    elif P.g('rail', True):
        railing(P, P.g('rail_mat', 'steel'), 0, 0.06, lx, 0.06, 0, post=P.g('post', 2.0))
        railing(P, P.g('rail_mat', 'steel'), 0, ly - 0.06, lx, ly - 0.06, 0, post=P.g('post', 2.0))
    for i in range(P.g('lamps', 0)):
        x = lx * (i + 0.5) / P.g('lamps', 0)
        P.box('steel', x - 0.05, 0.05, 0, x + 0.05, 0.15, 2.6)
        P.box('lamp', x - 0.15, 0.0, 2.5, x + 0.15, 0.3, 2.7)
        P.light((x, ly / 2, 2.4), (1.0, 0.75, 0.45), 60, 0.2)


def b_stairs(P):
    """Stair flight rising along local +x from z=0 to z=lz; stringers + railing."""
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'concrete'
    n = max(2, int(round(lz / 0.2)))
    run, rise = lx / n, lz / n
    for i in range(n):
        P.box(m, i * run, 0, i * rise + rise - 0.18, (i + 1) * run, ly, (i + 1) * rise)
    th = 0.35
    for y0, y1 in ((0, 0.12), (ly - 0.12, ly)):
        P.hexa(m, [(0, y0, -th), (lx, y0, lz - th), (lx, y1, lz - th), (0, y1, -th),
                   (0, y0, rise), (lx, y0, lz + rise), (lx, y1, lz + rise), (0, y1, rise)])
    if P.g('rail', True):
        for y in (0.06, ly - 0.06):
            P.strut('steel', (0, y, 1.0), (lx, y, lz + 1.0), 0.04)
            for i in range(0, n + 1, max(1, n // 4)):
                P.box('steel', i * run - 0.03, y - 0.03, i * rise, i * run + 0.03, y + 0.03, i * rise + 1.0)


def b_ramp(P):
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'concrete'
    th = 0.35
    P.hexa(m, [(0, 0, -th), (lx, 0, lz - th), (lx, ly, lz - th), (0, ly, -th),
               (0, 0, 0), (lx, 0, lz), (lx, ly, lz), (0, ly, 0)])
    if P.g('rail', True):
        for y in (0.06, ly - 0.06):
            P.strut('steel', (0, y, 1.0), (lx, y, lz + 1.0), 0.04)
            n = max(1, int(lx / 1.8))
            for i in range(n + 1):
                x = lx * i / n
                P.box('steel', x - 0.03, y - 0.03, lz * x / lx, x + 0.03, y + 0.03, lz * x / lx + 1.0)


def b_lightwell(P):
    """A void through the decks: railings at its rim, optional light shaft and hanging vines."""
    lx, ly, lz = P.lx, P.ly, P.lz
    levels = P.g('rims', [0])
    for lv in levels:
        z = lv * P.lh
        rail_sides(P, 'snwe', z, P.g('rail_mat', 'steel'), inset=-0.05)
        if P.g('vines', 0):
            for side in range(4):
                n = int(P.g('vines', 0) * (lx if side < 2 else ly) / 4)
                for i in range(n):
                    L = P.rng.uniform(2.0, 9.0)
                    a = P.rng.uniform(0.3, (lx if side < 2 else ly) - 0.3)
                    if side == 0:
                        x, y = a, 0.15
                    elif side == 1:
                        x, y = a, ly - 0.15
                    elif side == 2:
                        x, y = 0.15, a
                    else:
                        x, y = lx - 0.15, a
                    P.box(P.rng.choice(('foliage', 'foliage2')), x - 0.18, y - 0.12, z - L, x + 0.18, y + 0.12, z)
    if P.g('shaft_light'):
        for ins in (0.2, 0.18 * min(lx, ly), 0.33 * min(lx, ly)):
            P.box('lightshaft', ins, ins, 0, lx - ins, ly - ins, lz)
    if P.g('skylight'):
        P.box('glass_clear', 0, 0, lz, lx, ly, lz + 0.15)
        x = 0
        while x <= lx:
            P.box('steel', x - 0.08, 0, lz, x + 0.08, ly, lz + 0.35); x += 2.0


def tree(P, x, y, z, h=6.0, species=None, rng=None):
    rng = rng or P.rng
    species = species or rng.choice(P.style.trees)
    fol = rng.choice(P.style.foliage)
    if species == 'conifer':
        P.cyl('bark', (x, y, z), (x, y, z + h * 0.35), 0.12 * h / 6, n=5)
        for k, (s, r) in enumerate(((0.2, 0.32), (0.45, 0.25), (0.68, 0.17))):
            P.cone(fol, (x, y, z + h * s), r * h, h * 0.45, n=6, phase=rng.uniform(0, 1))
    elif species == 'bush':
        P.ico(fol, (x, y, z + h * 0.35), h * 0.45, rng, 0.2, sz=0.7)
    elif species == 'palm':
        P.cyl('bark', (x, y, z), (x + 0.3, y, z + h), 0.12, n=5)
        for i in range(6):
            a = i * math.pi / 3 + rng.uniform(0, 0.4)
            P.obox(fol, (x + 0.3 + math.cos(a) * 1.3, y + math.sin(a) * 1.3, z + h - 0.3),
                   (math.cos(a), math.sin(a), -0.35), (-math.sin(a), math.cos(a), 0), (0, 0, 1), 1.4, 0.35, 0.05)
    else:  # round broadleaf, 2-3 jittered blobs
        P.cyl('bark', (x, y, z), (x, y, z + h * 0.5), 0.1 * h / 5 + 0.05, n=5)
        n = rng.choice((1, 2, 3))
        for k in range(n):
            ox, oy = rng.uniform(-0.25, 0.25) * h * 0.4, rng.uniform(-0.25, 0.25) * h * 0.4
            r = h * rng.uniform(0.26, 0.36)
            P.ico(fol, (x + ox, y + oy, z + h * 0.62 + rng.uniform(-0.1, 0.12) * h), r, rng, 0.18, sz=0.85)


def b_tree(P):
    tree(P, P.lx / 2, P.ly / 2, 0.0, P.g('height', 6.0), P.g('species'))


def planter(P, x0, y0, x1, y1, z, h=0.7, bush=True):
    P.box(P.g('planter_mat', 'planter'), x0, y0, z, x1, y1, z + h)
    P.box('soil', x0 + 0.1, y0 + 0.1, z + h, x1 - 0.1, y1 - 0.1, z + h + 0.05)
    if bush:
        L = max(x1 - x0, y1 - y0)
        n = max(1, int(L / 1.4))
        for i in range(n):
            t = (i + 0.5) / n
            bx = x0 + (x1 - x0) * t if (x1 - x0) >= (y1 - y0) else (x0 + x1) / 2
            by = y0 + (y1 - y0) * t if (y1 - y0) > (x1 - x0) else (y0 + y1) / 2
            r = min(x1 - x0, y1 - y0) * P.rng.uniform(0.45, 0.7)
            P.ico(P.rng.choice(P.style.foliage), (bx, by, z + h + r * 0.5), r, P.rng, 0.2, sz=0.8)


def b_planter(P):
    planter(P, 0, 0, P.lx, P.ly, 0.0, h=P.g('ph', 0.7))


def b_terrace(P):
    """Garden terrace on top of an existing deck: grass, paths, planters, trees, edge railing."""
    lx, ly = P.lx, P.ly
    rng = P.rng
    P.box(P.g('surface', 'grass'), 0.2, 0.2, 0.0, lx - 0.2, ly - 0.2, 0.12)
    # a paved path along the long axis
    if P.g('path', True) and min(lx, ly) > 5:
        if lx >= ly:
            y = rng.uniform(ly * 0.3, ly * 0.6)
            P.box('paving', 0.2, y, 0.0, lx - 0.2, y + 1.6, 0.15)
        else:
            x = rng.uniform(lx * 0.3, lx * 0.6)
            P.box('paving', x, 0.2, 0.0, x + 1.6, ly - 0.2, 0.15)
    edge = P.g('edge', 's')
    for s in edge:
        if s == 's':
            planter(P, 0.3, 0.3, lx - 0.3, 1.2, 0.12)
        elif s == 'e':
            planter(P, lx - 1.2, 0.3, lx - 0.3, ly - 0.3, 0.12)
        elif s == 'n':
            planter(P, 0.3, ly - 1.2, lx - 0.3, ly - 0.3, 0.12)
        elif s == 'w':
            planter(P, 0.3, 0.3, 1.2, ly - 0.3, 0.12)
    dens = P.g('trees', 0.02)
    n = P.g('ntrees', int(lx * ly * dens))
    for i in range(n):
        x, y = rng.uniform(1.5, max(1.6, lx - 1.5)), rng.uniform(1.5, max(1.6, ly - 1.5))
        tree(P, x, y, 0.12, rng.uniform(*P.g('tree_h', (3.5, 7.5))))
    for i in range(P.g('benches', 0)):
        x, y = rng.uniform(1, lx - 2), rng.uniform(1, ly - 1)
        P.box('timber', x, y, 0.12, x + 1.6, y + 0.45, 0.55)
    if P.g('rail'):
        rail_sides(P, P.g('rail'), 0.12, P.g('rail_mat', 'steel'))
    if P.g('pool'):
        px0, py0, px1, py1 = P.g('pool')
        P.box('concrete_light', px0 - 0.3, py0 - 0.3, 0.0, px1 + 0.3, py1 + 0.3, 0.45)
        P.box('water', px0, py0, 0.0, px1, py1, 0.35)


def b_pipe(P):
    """Pipe run (or bundle) along the part's longest local axis; flanges and brackets."""
    lx, ly, lz = P.lx, P.ly, P.lz
    axis = P.g('axis') or max((('x', lx), ('y', ly), ('z', lz)), key=lambda a: a[1])[0]
    n = P.g('n', 1)
    m = P.mat or 'pipe'
    L = {'x': lx, 'y': ly, 'z': lz}[axis]
    other = {'x': (ly, lz), 'y': (lx, lz), 'z': (lx, ly)}[axis]
    r = P.g('r', min(other) / (2 * n) * 0.85)
    fl = P.g('flange', 6.0)
    for k in range(n):
        off = (k + 0.5) / n
        rr = r * (1.0 if n == 1 else P.rng.choice((0.6, 0.8, 1.0)))
        mm = m if n == 1 else P.rng.choice((m, m, 'pipe2', 'rust'))
        if axis == 'x':
            a, b = (0, ly * off, lz / 2), (lx, ly * off, lz / 2)
        elif axis == 'y':
            a, b = (lx * off, 0, lz / 2), (lx * off, ly, lz / 2)
        else:
            a, b = (lx * off, ly / 2, 0), (lx * off, ly / 2, lz)
        P.cyl(mm, a, b, rr, n=8)
        if fl:
            s = fl / 2
            while s < L:
                t = s / L
                c = [a[i] + (b[i] - a[i]) * t for i in range(3)]
                d = [(b[i] - a[i]) / L * 0.15 for i in range(3)]
                P.cyl('steel_dark', [c[i] - d[i] for i in range(3)], [c[i] + d[i] for i in range(3)], rr * 1.25, n=8)
                s += fl


def b_duct(P):
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'steel_light'
    P.box(m, 0, 0, 0, lx, ly, lz)
    x = 1.5
    while x < lx:
        P.box('steel_dark', x - 0.08, -0.05, -0.05, x + 0.08, ly + 0.05, lz + 0.05); x += 3.0


def b_antenna(P):
    lx, ly, lz = P.lx, P.ly, P.lz
    cx, cy = lx / 2, ly / 2
    m = P.mat or 'steel'
    P.cyl(m, (cx, cy, 0), (cx, cy, lz), P.g('r', 0.12), n=6)
    for i in range(P.g('bars', 3)):
        z = lz * (0.55 + 0.4 * i / max(1, P.g('bars', 3)))
        w = P.rng.uniform(0.8, 1.6)
        a = P.rng.uniform(0, math.pi)
        P.strut(m, (cx - math.cos(a) * w, cy - math.sin(a) * w, z), (cx + math.cos(a) * w, cy + math.sin(a) * w, z), 0.04)
    if P.g('dish'):
        z = lz * 0.5
        P.cyl('steel_light', (cx + 0.2, cy - 0.2, z), (cx + 0.5, cy - 0.5, z + 0.2), 0.9, n=10, r1=0.3)
    if P.g('beacon', True):
        P.ico('beacon', (cx, cy, lz + 0.15), 0.22)
    if P.g('lightpt', True) and P.g('beacon', True):
        P.light((cx, cy, lz + 0.4), (1.0, 0.1, 0.05), 25, 0.1)


def b_crane(P):
    """Tower crane (Plug-in City): lattice mast, jib along local +x, counter-jib, hook with optional payload."""
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'crane'
    s = P.g('mast', 2.2)
    cx, cy = s / 2, ly / 2
    # mast as vertical lattice
    r = 0.12
    for (x, y) in ((0, cy - s / 2), (s, cy - s / 2), (s, cy + s / 2), (0, cy + s / 2)):
        P.box(m, x - r, y - r, 0, x + r, y + r, lz)
    z = 0.0
    k = 0
    while z < lz - 0.1:
        z1 = min(lz, z + s)
        P.strut(m, (0, cy - s / 2, z), (s, cy - s / 2, z1) if k % 2 == 0 else (s, cy - s / 2, z), 0.06)
        P.strut(m, (s, cy - s / 2, z), (s, cy + s / 2, z1), 0.06)
        P.strut(m, (s, cy + s / 2, z), (0, cy + s / 2, z1), 0.06)
        P.strut(m, (0, cy + s / 2, z), (0, cy - s / 2, z1), 0.06)
        z = z1; k += 1
    jib = P.g('jib', max(lx, 20.0))
    cj = jib * 0.3
    zj = lz
    # jib: triangular lattice
    P.box(m, -cj, cy - 0.8, zj, jib, cy - 0.6, zj + 0.2)
    P.box(m, -cj, cy + 0.6, zj, jib, cy + 0.8, zj + 0.2)
    P.box(m, -cj, cy - 0.1, zj + 1.6, jib, cy + 0.1, zj + 1.8)
    x = -cj
    while x < jib:
        P.strut(m, (x, cy - 0.7, zj + 0.1), (x + 1.5, cy, zj + 1.7), 0.05)
        P.strut(m, (x, cy + 0.7, zj + 0.1), (x + 1.5, cy, zj + 1.7), 0.05)
        x += 3.0
    P.box('concrete_dark', -cj, cy - 1.2, zj - 1.5, -cj + 3.0, cy + 1.2, zj + 0.2)
    P.box(m, s * 0.5, cy - 0.2, zj + 1.8, s * 0.5 + 0.4, cy + 0.2, zj + 6.5)  # apex
    P.strut('steel', (s * 0.5, cy, zj + 6.5), (jib * 0.75, cy, zj + 1.8), 0.03)
    P.strut('steel', (s * 0.5, cy, zj + 6.5), (-cj, cy, zj + 0.2), 0.03)
    P.box('win_a', s + 0.2, cy + 0.9, zj - 2.2, s + 2.2, cy + 2.4, zj - 0.2)  # cab
    hx = jib * P.g('hook_at', 0.7)
    drop = P.g('drop', lz * 0.4)
    P.box(m, hx - 0.6, cy - 0.9, zj - 0.4, hx + 0.6, cy + 0.9, zj)  # trolley
    P.strut('steel_dark', (hx, cy, zj - 0.4), (hx, cy, zj - drop), 0.03)
    P.box('crane', hx - 0.4, cy - 0.4, zj - drop - 0.6, hx + 0.4, cy + 0.4, zj - drop)
    pay = P.g('payload')
    if pay:
        pw, pd, ph = pay
        top = zj - drop - 0.6
        for dx in (-pw / 2 + 0.3, pw / 2 - 0.3):
            P.strut('steel_dark', (hx, cy, top), (hx + dx, cy - pd / 2 + 0.3, top - 1.8), 0.02)
            P.strut('steel_dark', (hx, cy, top), (hx + dx, cy + pd / 2 - 0.3, top - 1.8), 0.02)
        Q = Part({'type': 'capsule', 'params': {'interior': False, 'lit': 0.0}}, {'cell': 1, 'level': P.lh}, 0, 0, P.mats, P.style)
        Q.lx, Q.ly, Q.lz = pw, pd, ph
        Q.rng = P.rng
        Q.p = {'interior': False, 'lit': 0.0, 'win': P.g('payload_win', 'round')}
        Q.mat = P.g('payload_mat', 'capsule_white')
        base_xf = P.xf
        ox, oy, oz = hx - pw / 2, cy - pd / 2, top - 1.8 - ph
        Q.xf = lambda p, bx=base_xf: bx((p[0] + ox, p[1] + oy, p[2] + oz))
        Q.buf = P.buf
        b_capsule(Q)
    if P.g('lightpt', True):
        P.ico('beacon', (jib, cy, zj + 0.4), 0.2)


def b_water(P):
    """Pool / canal sitting on a deck or ground: basin floor at z=0, surface at +0.55, rim to +0.8."""
    lx, ly = P.lx, P.ly
    P.box('water', 0, 0, 0.0, lx, ly, 0.55)
    rim = P.g('rim', True)
    if rim:
        sides = 'snwe' if rim is True else rim
        m = P.g('rim_mat', 'concrete')
        r = P.g('rim_w', 0.35)
        if 's' in sides: P.box(m, -r, -r, 0, lx + r, 0, 0.8)
        if 'n' in sides: P.box(m, -r, ly, 0, lx + r, ly + r, 0.8)
        if 'w' in sides: P.box(m, -r, 0, 0, 0, ly, 0.8)
        if 'e' in sides: P.box(m, lx, 0, 0, lx + r, ly, 0.8)


def b_waterfall(P):
    lx, ly, lz = P.lx, P.ly, P.lz
    P.box('waterfall', 0, ly / 2 - 0.12, 0, lx, ly / 2 + 0.12, lz)
    P.box('foam', -0.3, ly / 2 - 0.9, 0, lx + 0.3, ly / 2 + 0.9, 0.35)


def b_sign(P):
    """Signage panel. params: color, blade (perpendicular blade sign on local -y face)."""
    lx, ly, lz = P.lx, P.ly, P.lz
    col = 'neon_' + P.g('color', P.rng.choice(P.style.neon))
    if P.g('blade', True):
        # blade: thin in x, sticks out in -y from the facade line y=0
        w = P.g('proj', 1.6)
        c = lx / 2
        P.box('steel_dark', c - 0.12, -w - 0.1, 0, c + 0.12, 0.05, lz)
        P.box(col, c - 0.16, -w, 0.15, c + 0.16, -0.1, lz - 0.15)
    else:
        P.box('steel_dark', 0, -0.1, 0, lx, 0.02, lz)
        P.box(col, 0.1, -0.16, 0.1, lx - 0.1, -0.05, lz - 0.1)


def b_tank(P):
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'steel_light'
    r = min(lx, ly) / 2 * 0.9
    cx, cy = lx / 2, ly / 2
    if P.g('axis', 'z') == 'z':
        leg = P.g('legs', 0.0)
        if leg:
            for a in range(4):
                ang = a * math.pi / 2 + math.pi / 4
                P.box('steel', cx + math.cos(ang) * r * 0.7 - 0.1, cy + math.sin(ang) * r * 0.7 - 0.1, 0,
                      cx + math.cos(ang) * r * 0.7 + 0.1, cy + math.sin(ang) * r * 0.7 + 0.1, leg)
        P.cyl(m, (cx, cy, leg), (cx, cy, lz - r * 0.3), r, n=12)
        P.cone(m, (cx, cy, lz - r * 0.3), r, r * 0.3, n=12)
    else:
        P.cyl(m, (0.3, cy, r), (lx - 0.3, cy, r), r, n=12)
        P.box('steel_dark', lx * 0.2, cy - r * 0.7, 0, lx * 0.2 + 0.4, cy + r * 0.7, r)
        P.box('steel_dark', lx * 0.8, cy - r * 0.7, 0, lx * 0.8 + 0.4, cy + r * 0.7, r)


def b_machine(P):
    """Abandoned machinery: seeded composite of tanks, housings, pipes, a gantry arm."""
    lx, ly, lz = P.lx, P.ly, P.lz
    rng = P.rng
    m = P.mat or 'rust'
    P.box('steel_dark', 0, 0, 0, lx, ly, 0.6)
    for i in range(rng.randint(3, 6)):
        w, d = rng.uniform(0.2, 0.5) * lx, rng.uniform(0.2, 0.5) * ly
        x, y = rng.uniform(0, lx - w), rng.uniform(0, ly - d)
        h = rng.uniform(0.3, 1.0) * lz
        if rng.random() < 0.5:
            P.box(rng.choice((m, 'steel', 'rust')), x, y, 0.6, x + w, y + d, 0.6 + h)
        else:
            r = min(w, d) / 2
            P.cyl(rng.choice((m, 'steel_light')), (x + r, y + r, 0.6), (x + r, y + r, 0.6 + h), r, n=10)
    for i in range(rng.randint(1, 3)):
        a = (rng.uniform(0, lx), rng.uniform(0, ly), rng.uniform(0.6, lz))
        b = (rng.uniform(0, lx), rng.uniform(0, ly), rng.uniform(0.6, lz))
        P.cyl('pipe', a, (b[0], a[1], a[2]), rng.uniform(0.15, 0.4), n=8)
        P.cyl('pipe', (b[0], a[1], a[2]), (b[0], a[1], b[2]), rng.uniform(0.15, 0.4), n=8)
    if P.g('arm', True):
        x, y = rng.uniform(0.2, 0.8) * lx, rng.uniform(0.2, 0.8) * ly
        P.box(m, x - 0.4, y - 0.4, 0.6, x + 0.4, y + 0.4, lz)
        a = rng.uniform(0, 2 * math.pi)
        L = rng.uniform(0.6, 1.2) * max(lx, ly)
        P.strut(m, (x, y, lz), (x + math.cos(a) * L, y + math.sin(a) * L, lz + rng.uniform(-2, 3)), 0.3)


def b_solar(P):
    lx, ly = P.lx, P.ly
    rows = max(1, int(ly / 2.4))
    for r in range(rows):
        y = r * ly / rows + 0.2
        d = ly / rows - 0.6
        for x0 in range(0, max(1, int(lx / 3.2))):
            x = x0 * 3.2 + 0.2
            if x + 3.0 > lx: break
            P.hexa('solar', [(x, y, 0.4), (x + 3.0, y, 0.4), (x + 3.0, y + d, 1.3), (x, y + d, 1.3),
                             (x, y, 0.47), (x + 3.0, y, 0.47), (x + 3.0, y + d, 1.37), (x, y + d, 1.37)])
            P.box('steel', x + 0.2, y + d - 0.2, 0, x + 0.3, y + d - 0.1, 1.3)
            P.box('steel', x + 2.7, y + d - 0.2, 0, x + 2.8, y + d - 0.1, 1.3)


def b_turbine(P):
    lx, ly, lz = P.lx, P.ly, P.lz
    cx, cy = lx / 2, ly / 2
    P.cyl('steel_light', (cx, cy, 0), (cx, cy, lz), 0.25, n=8, r1=0.15)
    P.box('steel_light', cx - 0.4, cy - 0.3, lz - 0.3, cx + 1.2, cy + 0.3, lz + 0.3)
    hub = Vector((cx - 0.5, cy, lz))
    bl = P.g('blade', lz * 0.35)
    a0 = P.rng.uniform(0, math.pi)
    for i in range(3):
        a = a0 + i * 2 * math.pi / 3
        d = Vector((0, math.cos(a), math.sin(a)))
        P.obox('capsule_white', tuple(hub + d * bl / 2), d, Vector((1, 0, 0)), d.cross(Vector((1, 0, 0))), bl / 2, 0.06, 0.28)


def b_shack(P):
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'corrugated'
    h = lz * 0.8
    P.box(m, 0, 0, 0, lx, ly, h)
    P.hexa(P.g('roof_mat', 'rust'), [(-0.2, -0.3, h), (lx + 0.2, -0.3, h), (lx + 0.2, ly + 0.3, h + 0.5), (-0.2, ly + 0.3, h + 0.5),
                                       (-0.2, -0.3, h + 0.12), (lx + 0.2, -0.3, h + 0.12), (lx + 0.2, ly + 0.3, h + 0.62), (-0.2, ly + 0.3, h + 0.62)])
    P.box(pick_win(P), lx * 0.5, -0.04, h * 0.4, lx * 0.5 + 0.8, 0.02, h * 0.8)
    P.box('steel_dark', lx * 0.15, -0.04, 0, lx * 0.15 + 0.8, 0.02, h * 0.85)


def b_laundry(P):
    lx, ly = P.lx, P.ly
    rng = P.rng
    P.box('steel', 0, ly / 2 - 0.04, 0, 0.08, ly / 2 + 0.04, 2.0)
    P.box('steel', lx - 0.08, ly / 2 - 0.04, 0, lx, ly / 2 + 0.04, 2.0)
    P.strut('steel_dark', (0, ly / 2, 1.9), (lx, ly / 2, 1.9), 0.015)
    x = 0.3
    while x < lx - 0.6:
        w = rng.uniform(0.4, 0.9)
        h = rng.uniform(0.5, 1.1)
        P.box(rng.choice(('cloth_a', 'cloth_b', 'cloth_c', 'cloth_d')), x, ly / 2 - 0.02, 1.9 - h, x + w, ly / 2 + 0.02, 1.9)
        x += w + rng.uniform(0.05, 0.3)


def b_figure(P):
    rng = P.rng
    cx, cy = P.lx / 2, P.ly / 2
    s = P.g('scale', 1.0)
    col = rng.choice(('cloth_a', 'cloth_b', 'cloth_c', 'cloth_d', 'furn_c'))
    P.box('steel_dark', cx - 0.16 * s, cy - 0.1 * s, 0, cx + 0.16 * s, cy + 0.1 * s, 0.85 * s)
    P.box(col, cx - 0.22 * s, cy - 0.13 * s, 0.85 * s, cx + 0.22 * s, cy + 0.13 * s, 1.5 * s)
    P.ico('skin', (cx, cy, 1.64 * s), 0.13 * s)


def b_builder(P):
    """In-game construction agent / BLAME!-style Builder: tracked body, arm, warning light."""
    lx, ly, lz = P.lx, P.ly, P.lz
    rng = P.rng
    s = P.g('scale', 1.0)
    m = P.mat or 'builder'
    L, Wd = 3.2 * s, 2.0 * s
    P.box('steel_dark', 0, 0, 0, L, 0.5 * s, 0.8 * s)
    P.box('steel_dark', 0, Wd - 0.5 * s, 0, L, Wd, 0.8 * s)
    P.box(m, 0.3 * s, 0.3 * s, 0.6 * s, L - 0.3 * s, Wd - 0.3 * s, 1.8 * s)
    P.box('win_a', L - 0.35 * s, 0.6 * s, 1.1 * s, L - 0.25 * s, Wd - 0.6 * s, 1.5 * s)
    a = rng.uniform(-0.6, 0.6)
    p0 = Vector((L * 0.4, Wd / 2, 1.8 * s))
    p1 = p0 + Vector((math.cos(a) * 2.5 * s, math.sin(a) * 2.5 * s, 2.2 * s))
    p2 = p1 + Vector((math.cos(a) * 2.2 * s, math.sin(a) * 2.2 * s, -1.6 * s))
    P.strut(m, tuple(p0), tuple(p1), 0.18 * s)
    P.strut(m, tuple(p1), tuple(p2), 0.14 * s)
    P.box('steel_dark', p2.x - 0.3 * s, p2.y - 0.3 * s, p2.z - 0.5 * s, p2.x + 0.3 * s, p2.y + 0.3 * s, p2.z)
    P.ico('beacon_amber', (L * 0.25, Wd / 2, 2.0 * s), 0.2 * s)
    if P.g('lightpt', True):
        P.light((L * 0.25, Wd / 2, 2.4 * s), (1.0, 0.55, 0.1), 30 * s, 0.1)
    if P.g('weld'):
        P.ico('spark', tuple(p2 + Vector((0, 0, -0.6 * s))), 0.25 * s)
        P.light(tuple(p2 + Vector((0, 0, -0.8 * s))), (0.6, 0.8, 1.0), 80 * s, 0.1)


def b_block(P):
    """Monolith / megastructure wall.  params: shaft [x,y,w,d] (local m) hollow core, dots density, slots."""
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'concrete'
    rng = P.rng
    sh = P.g('shaft')
    if sh:
        sx, sy, sw, sd = sh
        P.box(m, 0, 0, 0, sx, ly, lz)
        P.box(m, sx + sw, 0, 0, lx, ly, lz)
        P.box(m, sx, 0, 0, sx + sw, sy, lz)
        P.box(m, sx, sy + sd, 0, sx + sw, ly, lz)
        if P.g('shaft_floor') is not None:
            P.box('concrete_dark', sx, sy, P.g('shaft_floor'), sx + sw, sy + sd, P.g('shaft_floor') + 1.0)
    else:
        P.box(m, 0, 0, 0, lx, ly, lz)
    # horizontal slots (dark recessed bands) on visible faces
    slots = P.g('slots', 0)
    for i in range(slots):
        z = rng.uniform(0.1, 0.95) * lz
        hh = rng.choice((0.6, 1.2, 2.4))
        for face in ('s', 'e'):
            L = lx if face == 's' else ly
            a0 = rng.uniform(0, L * 0.5); a1 = min(L, a0 + rng.uniform(L * 0.2, L * 0.8))
            if face == 's':
                P.box('void_dark', a0, -0.06, z, a1, 0.02, z + hh)
            else:
                P.box('void_dark', lx - 0.02, a0, z, lx + 0.06, a1, z + hh)
    dots = P.g('dots', 0.0)
    if dots:
        for face in ('s', 'e', 'n', 'w'):
            L = lx if face in 'sn' else ly
            n = int(L * lz * dots)
            for i in range(n):
                a = rng.uniform(0.5, L - 0.5)
                z = rng.randrange(1, max(2, int(lz / P.lh))) * P.lh + 1.0
                mat = rng.choice(WIN_LIT) if rng.random() < P.g('dots_lit', 0.6) else 'win_dark'
                w = rng.choice((0.8, 0.8, 1.6, 3.2))
                if face == 's':
                    P.box(mat, a, -0.05, z, a + w, 0.02, z + 1.0)
                elif face == 'n':
                    P.box(mat, a, ly - 0.02, z, a + w, ly + 0.05, z + 1.0)
                elif face == 'w':
                    P.box(mat, -0.05, a, z, 0.02, a + w, z + 1.0)
                else:
                    P.box(mat, lx - 0.02, a, z, lx + 0.05, a + w, z + 1.0)
    # giant dark openings (hangar mouths / exposed interior) on visible faces
    for i in range(P.g('openings', 0)):
        face = rng.choice('se')
        L = lx if face == 's' else ly
        w = rng.uniform(0.08, 0.35) * L
        hh = rng.uniform(1.5, 6.0) * P.lh
        a = rng.uniform(0, L - w)
        z = rng.uniform(0.1, 0.9) * (lz - hh)
        if face == 's':
            P.box('void_dark', a, -0.1, z, a + w, 0.03, z + hh)
            P.box(m, a - 0.4, -0.6, z - 0.5, a + w + 0.4, 0.0, z)
        else:
            P.box('void_dark', lx - 0.03, a, z, lx + 0.1, a + w, z + hh)
            P.box(m, lx, a - 0.4, z - 0.5, lx + 0.6, a + w + 0.4, z)
    ribs = P.g('ribs', 0)
    if ribs:
        rw = P.g('rib_w', 1.2); rd = P.g('rib_d', 1.0)
        for i in range(1, ribs + 1):
            t = i / (ribs + 1)
            h0 = rng.uniform(0, 0.3) * lz
            P.box(m, lx * t - rw / 2, -rd, h0, lx * t + rw / 2, 0, lz)
            P.box(m, lx, ly * t - rw / 2, h0, lx + rd, ly * t + rw / 2, lz)
    # ledges
    for i in range(P.g('ledges', 0)):
        face = rng.choice('se')
        z = rng.uniform(0.2, 0.9) * lz
        w = rng.uniform(4, 14); dpt = rng.uniform(1.5, 4.0)
        if face == 's':
            a = rng.uniform(0, max(0.1, lx - w))
            P.box(m, a, -dpt, z - 0.6, a + w, 0, z)
        else:
            a = rng.uniform(0, max(0.1, ly - w))
            P.box(m, lx, a, z - 0.6, lx + dpt, a + w, z)
    # rooftop clutter: parapet + vents
    if P.g('parapet', True):
        e = 0.4
        P.box(m, 0, 0, lz, lx, e, lz + 1.2)
        P.box(m, 0, ly - e, lz, lx, ly, lz + 1.2)
        P.box(m, 0, 0, lz, e, ly, lz + 1.2)
        P.box(m, lx - e, 0, lz, lx, ly, lz + 1.2)


def b_ruin(P):
    """Ruined multi-storey building (GLT): floors, irregular empty windows, broken top, rubble."""
    lx, ly, lz = P.lx, P.ly, P.lz
    rng = P.rng
    m = P.mat or 'concrete'
    floors = max(1, int(round(lz / P.lh)))
    t = 0.3
    brk = P.g('broken', 0.5)
    style = P.g('style', rng.choice(('piers', 'piers', 'solid', 'frame')))
    lost = set()
    for f in range(floors):
        z0 = f * P.lh
        top = f == floors - 1
        # a partially collapsed corner on the upper floors
        if f >= floors - 2 and rng.random() < brk * 0.5:
            lost.add(f)
        if not (top and rng.random() < brk):
            P.box(m, -0.15, -0.15, z0, lx + 0.15, ly + 0.15, z0 + 0.3)
        walls = ((0, 0, lx, t, 's'), (0, ly - t, lx, ly, 'n'), (0, t, t, ly - t, 'w'), (lx - t, t, lx, ly - t, 'e'))
        for (x0, y0, x1, y1, face) in walls:
            h = P.lh
            if top:
                h *= rng.uniform(0.15, 1.0) if rng.random() < brk else 1.0
            if f in lost and face in ('s', 'e') and rng.random() < 0.7:
                continue
            L = x1 - x0 if face in 'sn' else y1 - y0
            if style == 'solid':
                if face in 'sn':
                    P.box(m, x0, y0, z0 + 0.3, x1, y1, z0 + h)
                else:
                    P.box(m, x0, y0, z0 + 0.3, x1, y1, z0 + h)
                facade_windows(P, face, L, z0 + 0.3, z0 + P.lh, style='grid', module=2.0, lit=0.0) if h > 2.2 else None
                continue
            if style == 'frame':
                for a in (0.0, L - 0.4):
                    if face in 'sn':
                        P.box(m, x0 + a, y0, z0 + 0.3, x0 + a + 0.4, y1, z0 + h)
                    else:
                        P.box(m, x0, y0 + a, z0 + 0.3, x1, y0 + a + 0.4, z0 + h)
                if h > 2.4:
                    if face in 'sn':
                        P.box(m, x0, y0, z0 + 2.7, x1, y1, z0 + h)
                    else:
                        P.box(m, x0, y0, z0 + 2.7, x1, y1, z0 + h)
                continue
            n = max(1, int(L / 2.2))
            step = L / n
            for i in range(n):
                a0 = i * step; a1 = a0 + step * rng.uniform(0.3, 0.55)
                if face in 'sn':
                    P.box(m, x0 + a0, y0, z0 + 0.3, x0 + a1, y1, z0 + h)
                else:
                    P.box(m, x0, y0 + a0, z0 + 0.3, x1, y0 + a1, z0 + h)
            if h > 2.4:
                if face in 'sn':
                    P.box(m, x0, y0, z0 + 2.4, x1, y1, z0 + h)
                    P.box(m, x0, y0, z0 + 0.3, x1, y1, z0 + 1.0)
                else:
                    P.box(m, x0, y0, z0 + 2.4, x1, y1, z0 + h)
                    P.box(m, x0, y0, z0 + 0.3, x1, y1, z0 + 1.0)
        P.box('void_dark', t + 0.05, t + 0.05, z0 + 0.3, lx - t - 0.05, ly - t - 0.05, z0 + 0.32)
    if not P.g('roofless', False) and rng.random() > brk:
        P.box(m, 0, 0, lz, lx, ly, lz + 0.3)
    for i in range(int(lx * ly * 0.05)):
        s = rng.uniform(0.3, 1.2)
        a = rng.uniform(0, math.pi)
        P.obox(m, (rng.uniform(-1, lx + 1), rng.uniform(-1, ly + 1), s * 0.3), (math.cos(a), math.sin(a), rng.uniform(-0.3, 0.3)),
               (-math.sin(a), math.cos(a), 0), (0, rng.uniform(-0.3, 0.3), 1), s, s * 0.6, s * 0.3)


def b_rubble(P):
    rng = P.rng
    m = P.mat or 'concrete'
    for i in range(P.g('n', 12)):
        s = rng.uniform(0.3, 1.4)
        a = rng.uniform(0, math.pi)
        P.obox(m, (rng.uniform(0, P.lx), rng.uniform(0, P.ly), s * 0.3), (math.cos(a), math.sin(a), rng.uniform(-0.4, 0.4)),
               (-math.sin(a), math.cos(a), 0), (0, rng.uniform(-0.4, 0.4), 1), s, s * 0.7, s * 0.3)


def b_vehicle(P):
    """A small half-track (GLT homage) with two riders."""
    s = P.g('scale', 1.0)
    P.box('steel_dark', 0, 0, 0, 2.0 * s, 0.35 * s, 0.6 * s)
    P.box('steel_dark', 0, 0.85 * s, 0, 2.0 * s, 1.2 * s, 0.6 * s)
    P.box('olive', 0.1 * s, 0.25 * s, 0.4 * s, 2.2 * s, 0.95 * s, 1.0 * s)
    P.cyl('steel_dark', (2.6 * s, 0.6 * s, 0.35 * s), (2.6 * s, 0.7 * s, 0.35 * s), 0.35 * s, n=8)
    P.box('olive', 2.0 * s, 0.45 * s, 0.6 * s, 2.7 * s, 0.75 * s, 1.1 * s)
    for i, x in enumerate((0.6, 1.3)):
        P.box('cloth_b' if i else 'cloth_c', x * s, 0.4 * s, 1.0 * s, (x + 0.45) * s, 0.8 * s, 1.6 * s)
        P.ico('skin', ((x + 0.22) * s, 0.6 * s, 1.75 * s), 0.14 * s)
    if P.g('headlight'):
        P.box('lamp', 2.7 * s, 0.5 * s, 0.9 * s, 2.85 * s, 0.7 * s, 1.1 * s)
        P.light((3.6 * s, 0.6 * s, 1.2 * s), (1.0, 0.72, 0.42), P.g('power', 350), 0.15)
        P.light((0.9 * s, 0.6 * s, 2.4 * s), (1.0, 0.68, 0.38), P.g('power', 350) * 0.4, 0.3)


def b_train(P):
    train(P, 0, P.lx, 0.1, P.ly - 0.1, 0.0, h=min(3.2, P.lz), mat=P.mat or 'train')


def b_snow(P):
    rng = P.rng
    for i in range(P.g('n', 400)):
        P.ico('snowflake', (rng.uniform(0, P.lx), rng.uniform(0, P.ly), rng.uniform(0, P.lz)), P.g('r', 0.18))


def b_lamp(P):
    h = P.lz
    P.box('steel_dark', -0.06, -0.06, 0, 0.06, 0.06, h)
    P.box('steel_dark', -0.06, -0.06, h - 0.1, 0.8, 0.06, h)
    P.box('lamp', 0.5, -0.12, h - 0.25, 0.9, 0.12, h - 0.1)
    P.light((0.7, 0, h - 0.4), tuple(P.g('color', (1.0, 0.7, 0.4))), P.g('power', 120), 0.2)


def b_light(P):
    """Bare point light (no geometry)."""
    P.light((P.lx / 2, P.ly / 2, P.lz / 2), tuple(P.g('color', (1.0, 0.7, 0.4))), P.g('power', 200), P.g('radius', 0.5))


def b_greenhouse(P):
    """Glazed box with planting racks - for farms and solarpunk."""
    lx, ly, lz = P.lx, P.ly, P.lz
    fr = P.mat or 'timber'
    P.box(P.g('floor_mat', 'concrete_light'), 0, 0, 0, lx, ly, 0.3)
    r = 0.12
    for x in (0, lx):
        for y in (0, ly):
            P.box(fr, x - r, y - r, 0, x + r, y + r, lz)
    x = 0
    while x <= lx + 0.01:
        P.box(fr, x - 0.05, -0.05, 0.3, x + 0.05, 0.05, lz)
        P.box(fr, x - 0.05, ly - 0.05, 0.3, x + 0.05, ly + 0.05, lz)
        x += 1.5
    P.box(fr, -r, -r, lz - 0.25, lx + r, ly + r, lz)
    P.box('glass_green', 0.05, 0.05, 0.3, lx - 0.05, ly - 0.05, lz - 0.25)
    # racks with crops (a few tiers)
    tiers = P.g('tiers', 3)
    rows = max(1, int((ly - 1.0) / 1.4))
    for rr in range(rows):
        y0 = 0.6 + rr * (ly - 1.2) / rows
        for k in range(tiers):
            z = 0.5 + k * (lz - 0.9) / tiers
            P.box('steel_light', 0.5, y0, z, lx - 0.5, y0 + 0.6, z + 0.06)
            P.box(P.rng.choice(('crop', 'crop2', 'foliage2')), 0.55, y0 + 0.05, z + 0.06, lx - 0.55, y0 + 0.55, z + 0.28)
            P.box('growlight', 0.6, y0 + 0.2, z + (lz - 0.9) / tiers - 0.12, lx - 0.6, y0 + 0.4, z + (lz - 0.9) / tiers - 0.08)
    if P.g('roof', True):
        P.box(P.g('roof_mat', 'concrete_light'), 0, 0, lz, lx, ly, lz + 0.3)


def b_plane(P):
    """Low-poly airliner (Kai Tak approach over Kowloon)."""
    L = P.g('length', 45.0)
    P.cyl('capsule_white', (0, 0, 0), (L * 0.85, 0, 0), 2.0, n=10)
    P.cyl('capsule_white', (L * 0.85, 0, 0), (L, 0, 0.4), 2.0, n=10, r1=0.4)
    P.cyl('capsule_white', (0, 0, 0), (-L * 0.12, 0, 0.9), 2.0, n=10, r1=0.3)
    P.hexa('capsule_white', [(L * 0.35, -1, -0.8), (L * 0.55, -1, -0.8), (L * 0.52, -17, -0.2), (L * 0.44, -17, -0.2),
                             (L * 0.35, -1, -0.5), (L * 0.55, -1, -0.5), (L * 0.52, -17, 0.0), (L * 0.44, -17, 0.0)])
    P.hexa('capsule_white', [(L * 0.44, 17, -0.2), (L * 0.52, 17, -0.2), (L * 0.55, 1, -0.8), (L * 0.35, 1, -0.8),
                             (L * 0.44, 17, 0.0), (L * 0.52, 17, 0.0), (L * 0.55, 1, -0.5), (L * 0.35, 1, -0.5)])
    P.hexa('neon_red', [(-L * 0.1, -0.2, 1.0), (L * 0.06, -0.2, 1.0), (L * 0.02, -0.2, 7.5), (-L * 0.1, -0.2, 7.5),
                        (-L * 0.1, 0.2, 1.0), (L * 0.06, 0.2, 1.0), (L * 0.02, 0.2, 7.5), (-L * 0.1, 0.2, 7.5)])
    P.box('win_a', L * 0.1, -2.05, 0.3, L * 0.8, 2.05, 0.7)
    P.ico('beacon', (L * 0.48, -17, 0), 0.4)
    P.ico('lamp', (L, 0, 0.2), 0.5)
    P.light((L + 3, 0, 0), (1, 0.95, 0.85), 3000, 0.5)


BUILDERS = {
    'megacolumn': b_megacolumn, 'column': b_megacolumn, 'core': b_core, 'elevator': b_elevator, 'truss': b_truss,
    'deck': b_deck, 'slab': b_slab, 'floor': b_slab, 'ground': b_ground, 'capsule': b_capsule, 'unit': b_capsule,
    'tube': b_tube, 'viaduct': b_viaduct, 'pier': b_pier, 'bridge': b_bridge, 'stairs': b_stairs, 'ramp': b_ramp,
    'lightwell': b_lightwell, 'void': b_lightwell, 'terrace': b_terrace, 'tree': b_tree, 'planter': b_planter,
    'pipe': b_pipe, 'duct': b_duct, 'antenna': b_antenna, 'crane': b_crane, 'water': b_water, 'waterfall': b_waterfall,
    'sign': b_sign, 'tank': b_tank, 'machine': b_machine, 'solar': b_solar, 'turbine': b_turbine, 'shack': b_shack,
    'laundry': b_laundry, 'figure': b_figure, 'builder': b_builder, 'block': b_block, 'wall': b_block, 'ruin': b_ruin,
    'rubble': b_rubble, 'vehicle': b_vehicle, 'train': b_train, 'snow': b_snow, 'lamp': b_lamp, 'light': b_light,
    'greenhouse': b_greenhouse, 'plane': b_plane,
}

# the agent-facing vocabulary (kitschema.py) must match the builders exactly
try:
    sys.path.insert(0, HERE)
    import kitschema
    _missing = set(kitschema.PART_TYPES) ^ set(BUILDERS)
    if _missing:
        log('WARNING kitschema/BUILDERS mismatch:', sorted(_missing))
except ImportError:
    pass

# parts that make up the "massing" shown in ghost mode
MASSING = {'megacolumn', 'column', 'core', 'elevator', 'deck', 'slab', 'floor', 'capsule', 'unit', 'tube', 'viaduct',
           'bridge', 'block', 'wall', 'ruin', 'greenhouse', 'truss', 'stairs', 'ramp'}


# =====================================================================================  styles & lighting
def C(h):
    """hex -> linear rgb tuple"""
    h = h.lstrip('#')
    s = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(((c / 12.92) if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in s)


# base material table: name -> dict
MATS = {
    'concrete': dict(base=C('8f8c86'), rough=0.92, var=0.08, vscale=0.015, streak=0.32, panel=True),
    'concrete_light': dict(base=C('b9b4aa'), rough=0.9, var=0.07, vscale=0.02, streak=0.18, panel=True),
    'concrete_dark': dict(base=C('55534f'), rough=0.95, var=0.08, vscale=0.02, streak=0.25),
    'deck': dict(base=C('8a8781'), rough=0.9, var=0.07, vscale=0.015, streak=0.15),
    'panel': dict(base=C('a7a39a'), rough=0.8, var=0.12, vscale=0.3, streak=0.25),
    'capsule_white': dict(base=C('d9d6cf'), rough=0.55, var=0.08, vscale=0.3, streak=0.2),
    'corrugated': dict(base=C('7d7a72'), rough=0.7, metal=0.3, var=0.25, vscale=0.5, streak=0.3),
    'steel': dict(base=C('4c4f53'), rough=0.55, metal=0.7, var=0.15, vscale=0.3),
    'steel_dark': dict(base=C('2b2d30'), rough=0.6, metal=0.6, var=0.1, vscale=0.3),
    'steel_light': dict(base=C('9a9d9f'), rough=0.5, metal=0.5, var=0.1, vscale=0.3),
    'rust': dict(base=C('6e3a1f'), rough=0.9, var=0.35, vscale=0.4, streak=0.2),
    'pipe': dict(base=C('6f6a60'), rough=0.6, metal=0.5, var=0.2, vscale=0.3),
    'pipe2': dict(base=C('5d6b64'), rough=0.6, metal=0.4, var=0.2, vscale=0.3),
    'tube': dict(base=C('7c8288'), rough=0.45, metal=0.6, var=0.1, vscale=0.2),
    'train': dict(base=C('c8c4ba'), rough=0.4, metal=0.3, var=0.05),
    'crane': dict(base=C('d69a2b'), rough=0.6, metal=0.2, var=0.15, vscale=0.5),
    'builder': dict(base=C('c98f2a'), rough=0.6, metal=0.2, var=0.1),
    'olive': dict(base=C('5b5a3c'), rough=0.8, var=0.1),
    'timber': dict(base=C('9a6a3e'), rough=0.75, var=0.2, vscale=0.8),
    'timber_dark': dict(base=C('5e3e24'), rough=0.8, var=0.2, vscale=0.8),
    'glass': dict(base=C('1c2328'), rough=0.08, spec=0.9, var=0.0),
    'glass_clear': dict(base=C('9fb8c0'), rough=0.05, alpha=0.28, var=0.0, spec=0.9),
    'glass_green': dict(base=C('a7c7b4'), rough=0.05, alpha=0.3, var=0.0, spec=0.9),
    'win_dark': dict(base=C('1a1f24'), rough=0.15, spec=0.8, var=0.0),
    'win_a': dict(base=C('2a2622'), rough=0.2, emit=C('ffb866'), estr='win', var=0.0),
    'win_b': dict(base=C('2a2622'), rough=0.2, emit=C('ffd49a'), estr='win', var=0.0),
    'win_c': dict(base=C('24282c'), rough=0.2, emit=C('ff9a4a'), estr='win', var=0.0),
    'win_train': dict(base=C('2a2622'), rough=0.2, emit=C('fff0d0'), estr='win', var=0.0),
    'lamp': dict(base=C('ffe7c2'), rough=0.5, emit=C('ffcf8a'), estr='lamp', var=0.0),
    'growlight': dict(base=C('ffd0ff'), rough=0.5, emit=C('ff7ad9'), estr='lamp', var=0.0),
    'beacon': dict(base=C('ff2a10'), rough=0.5, emit=C('ff2a10'), estr='neon', var=0.0),
    'beacon_amber': dict(base=C('ff9a10'), rough=0.5, emit=C('ff9a10'), estr='neon', var=0.0),
    'spark': dict(base=C('cfe8ff'), rough=0.5, emit=C('cfe8ff'), estr='spark', var=0.0),
    'void_dark': dict(base=C('101113'), rough=0.95, var=0.0),
    'furn_a': dict(base=C('8a5a3c'), rough=0.8, var=0.1),
    'furn_b': dict(base=C('c2b8a3'), rough=0.8, var=0.1),
    'furn_c': dict(base=C('4e6a7a'), rough=0.8, var=0.1),
    'skin': dict(base=C('c69a7a'), rough=0.7, var=0.0),
    'cloth_a': dict(base=C('b03a2e'), rough=0.9, var=0.1),
    'cloth_b': dict(base=C('2e5aa8'), rough=0.9, var=0.1),
    'cloth_c': dict(base=C('d9c9a0'), rough=0.9, var=0.1),
    'cloth_d': dict(base=C('3c8a5a'), rough=0.9, var=0.1),
    'foliage': dict(base=C('3f6a2a'), rough=0.85, var=0.35, vscale=0.7),
    'foliage2': dict(base=C('5a7d2e'), rough=0.85, var=0.35, vscale=0.7),
    'foliage3': dict(base=C('2c5230'), rough=0.85, var=0.35, vscale=0.7),
    'foliage_autumn': dict(base=C('9a6a2a'), rough=0.85, var=0.35, vscale=0.7),
    'blossom': dict(base=C('e7a3b8'), rough=0.85, var=0.25, vscale=0.7),
    'blossom2': dict(base=C('f2e3a0'), rough=0.85, var=0.25, vscale=0.7),
    'foliage_lime': dict(base=C('7fa33a'), rough=0.85, var=0.3, vscale=0.7),
    'crop': dict(base=C('6d9a2e'), rough=0.8, var=0.3, vscale=2.0),
    'crop2': dict(base=C('8aa83a'), rough=0.8, var=0.3, vscale=2.0),
    'bark': dict(base=C('4a3524'), rough=0.9, var=0.1),
    'grass': dict(base=C('5e7d37'), rough=0.95, var=0.3, vscale=0.25),
    'soil': dict(base=C('3e2f22'), rough=0.95, var=0.2),
    'planter': dict(base=C('a39c8e'), rough=0.9, var=0.15),
    'paving': dict(base=C('b3aa98'), rough=0.9, var=0.15, vscale=0.4),
    'ground': dict(base=C('6e6c66'), rough=0.95, var=0.08, vscale=0.01),
    'accent_a': dict(base=C('a4644a'), rough=0.7, var=0.08, vscale=0.3, streak=0.2),
    'accent_b': dict(base=C('4f7a78'), rough=0.7, var=0.08, vscale=0.3, streak=0.2),
    'accent_c': dict(base=C('c9a23e'), rough=0.7, var=0.08, vscale=0.3, streak=0.2),
    'asphalt': dict(base=C('3a3b3d'), rough=0.95, var=0.15, vscale=0.05),
    'ballast': dict(base=C('5b5750'), rough=1.0, var=0.2),
    'water': dict(base=C('1b3a40'), rough=0.04, spec=1.0, var=0.0, water=True),
    'waterfall': dict(base=C('b9dde6'), rough=0.2, emit=C('9fd0dc'), estr='fall', alpha=0.8, var=0.3, vscale=0.6, streak=0.6),
    'foam': dict(base=C('e6f2f2'), rough=0.6, var=0.2, vscale=2.0),
    'solar': dict(base=C('1b2a44'), rough=0.15, metal=0.3, spec=0.9, var=0.05),
    'snowflake': dict(base=C('f4f6fa'), rough=0.9, emit=C('f4f6fa'), estr='snowflake', var=0.0, nofog=False),
    'lightshaft': dict(glow=True, emit=C('e9eef5'), estr='shaft', var=0.0, nofog=True),
    'neon_red': dict(base=C('ff2a3a'), emit=C('ff2a3a'), estr='neon', rough=0.4, var=0.0),
    'neon_pink': dict(base=C('ff3fa8'), emit=C('ff3fa8'), estr='neon', rough=0.4, var=0.0),
    'neon_cyan': dict(base=C('2ee6ff'), emit=C('2ee6ff'), estr='neon', rough=0.4, var=0.0),
    'neon_yellow': dict(base=C('ffd21e'), emit=C('ffd21e'), estr='neon', rough=0.4, var=0.0),
    'neon_green': dict(base=C('3dff7a'), emit=C('3dff7a'), estr='neon', rough=0.4, var=0.0),
    'neon_white': dict(base=C('f0f4ff'), emit=C('f0f4ff'), estr='neon', rough=0.4, var=0.0),
    'neon_orange': dict(base=C('ff8a1e'), emit=C('ff8a1e'), estr='neon', rough=0.4, var=0.0),
    'k_cream': dict(base=C('b9ad92'), rough=0.9, var=0.28, vscale=0.35, streak=0.45),
    'k_pink': dict(base=C('b08d86'), rough=0.9, var=0.28, vscale=0.35, streak=0.45),
    'k_green': dict(base=C('8e9f8a'), rough=0.9, var=0.28, vscale=0.35, streak=0.45),
    'k_grey': dict(base=C('8b8d8f'), rough=0.9, var=0.28, vscale=0.35, streak=0.45),
    'k_blue': dict(base=C('8497a3'), rough=0.9, var=0.28, vscale=0.35, streak=0.45),
    'k_tile': dict(base=C('cfcabb'), rough=0.6, var=0.2, vscale=0.35, streak=0.4),
    'poche': dict(hatch=True),
    'ghost': dict(ghost=True),
    'ghost_wire': dict(wire=True),
    'guide': dict(guide=True),
    'gridline': dict(guide=True),
}

LIGHTS = {
    # sun: azimuth (deg, from +x toward +y) and elevation of the sun position
    'overcast': dict(sun_az=250, sun_el=58, sun=C('fff6ea'), sun_e=2.2, sun_ang=28, world=C('9aa6b3'), world_e=0.9,
                     fill=0.25, win=0.9, lamp=2.0, neon=2.0, shaft=0.6, fall=0.35, snowflake=0.6, spark=20,
                     bloom=0.0, exposure=0.0, look='AgX - Medium High Contrast', local=False,
                     fog_low=C('8d96a0'), fog_high=C('c3cad1'), back_top=C('cfd6dc'), back_bot=C('97a1ab')),
    'day': dict(sun_az=240, sun_el=48, sun=C('fff1dc'), sun_e=4.0, sun_ang=3, world=C('87a4c8'), world_e=0.8,
                fill=0.2, win=0.6, lamp=1.5, neon=1.5, shaft=0.4, fall=0.3, snowflake=0.5, spark=20,
                bloom=0.0, exposure=0.0, look='AgX - Medium High Contrast', local=False,
                fog_low=C('9fb0c2'), fog_high=C('d4dfe9'), back_top=C('bcd3ea'), back_bot=C('e3ebf0')),
    'golden': dict(sun_az=215, sun_el=24, sun=C('ffc98a'), sun_e=4.2, sun_ang=4, world=C('8fa0c4'), world_e=0.75,
                   fill=0.22, win=2.5, lamp=4.0, neon=3.0, shaft=0.8, fall=0.6, snowflake=0.6, spark=20,
                   bloom=0.35, bloom_thr=1.2, exposure=0.1, look='AgX - Medium High Contrast', local=True, local_scale=0.4,
                   fog_low=C('d7b98f'), fog_high=C('f0dcc0'), back_top=C('a9c0dc'), back_bot=C('f6d7ae')),
    'dusk': dict(sun_az=200, sun_el=9, sun=C('ff9a55'), sun_e=3.2, sun_ang=3, world=C('3b4266'), world_e=0.55,
                 fill=0.15, win=7.0, lamp=10.0, neon=9.0, shaft=1.2, fall=1.0, snowflake=0.5, spark=60,
                 bloom=0.7, bloom_thr=1.0, exposure=0.1, look='AgX - Medium High Contrast', local=True, local_scale=1.0,
                 fog_low=C('3a3550'), fog_high=C('b7867a'), back_top=C('2c3356'), back_bot=C('d99a74')),
    'night': dict(sun_az=250, sun_el=40, sun=C('9fb4ff'), sun_e=0.35, sun_ang=2, world=C('16203a'), world_e=0.8,
                  fill=0.05, win=14.0, lamp=18.0, neon=16.0, shaft=1.6, fall=1.5, snowflake=0.4, spark=80,
                  bloom=1.0, bloom_thr=0.8, exposure=0.0, look='AgX - Medium High Contrast', local=True, local_scale=2.0,
                  fog_low=C('06080f'), fog_high=C('1a2238'), back_top=C('0a0f1f'), back_bot=C('1c2438')),
    'blame': dict(sun_az=215, sun_el=52, sun=C('e6ecf5'), sun_e=3.6, sun_ang=4, world=C('3c4650'), world_e=0.45,
                  fill=0.10, win=8.0, lamp=12.0, neon=8.0, shaft=0.05, fall=0.6, snowflake=0.5, spark=80,
                  bloom=0.7, bloom_thr=0.9, exposure=0.0, look='AgX - Medium High Contrast', local=True, local_scale=1.0,
                  fog_low=C('030405'), fog_high=C('8c979f'), back_top=C('aab3ba'), back_bot=C('050607')),
    'mixed': dict(sun_az=205, sun_el=62, sun=C('ffe2bf'), sun_e=4.0, sun_ang=4, world=C('6f7f96'), world_e=0.8,
                  fill=0.25, win=3.5, lamp=6.0, neon=5.0, shaft=0.8, fall=0.8, snowflake=0.5, spark=60,
                  bloom=0.45, bloom_thr=1.1, exposure=0.0, look='AgX - Medium High Contrast', local=True, local_scale=0.6,
                  fog_low=C('2a2f3a'), fog_high=C('c7c2b8'), back_top=C('cfc9bd'), back_bot=C('20242c')),
    'snow': dict(sun_az=250, sun_el=50, sun=C('f2f4ff'), sun_e=1.4, sun_ang=35, world=C('b8c2cc'), world_e=1.1,
                 fill=0.3, win=0.6, lamp=1.5, neon=1.5, shaft=0.4, fall=0.3, snowflake=1.2, spark=20,
                 bloom=0.0, exposure=0.15, look='AgX - Medium High Contrast', local=False,
                 fog_low=C('a9b3bd'), fog_high=C('dfe4ea'), back_top=C('e6eaee'), back_bot=C('b4bec8')),
    'studio': dict(sun_az=235, sun_el=50, sun=C('fff8f0'), sun_e=3.2, sun_ang=6, world=C('a8b0b8'), world_e=1.0,
                   fill=0.35, win=1.2, lamp=2.0, neon=2.0, shaft=0.4, fall=0.4, snowflake=0.5, spark=20,
                   bloom=0.0, exposure=0.0, look='AgX - Medium High Contrast', local=False,
                   fog_low=C('ffffff'), fog_high=C('ffffff'), back_top=C('e9ecef'), back_bot=C('e9ecef')),
    'plan': dict(sun_az=235, sun_el=62, sun=C('fffaf2'), sun_e=2.6, sun_ang=12, world=C('b2b8be'), world_e=1.0,
                 fill=0.3, win=0.8, lamp=1.5, neon=1.5, shaft=0.3, fall=0.3, snowflake=0.5, spark=20,
                 bloom=0.0, exposure=0.0, look='AgX - Medium High Contrast', local=False,
                 fog_low=C('e8e4da'), fog_high=C('e8e4da'), back_top=C('efebe2'), back_bot=C('efebe2')),
}


class Style:
    """Palette + fog + defaults for one aesthetic variant."""

    def __init__(self, name, spec_style=None):
        base = STYLES.get(name, STYLES['arcology'])
        self.name = name
        self.d = dict(base)
        if spec_style:
            self.d.update(spec_style)
        self.lit = self.d.get('lit', 0.55)
        self.trees = self.d.get('trees', ('round', 'round', 'conifer'))
        self.foliage = self.d.get('foliage', ('foliage', 'foliage2', 'foliage3'))
        self.neon = self.d.get('neon', ('red', 'cyan', 'yellow', 'pink', 'green'))
        self.map = self.d.get('remap', {})

    def remap(self, name):
        return self.map.get(name, name)

    def mat(self, name):
        m = dict(MATS.get(name, MATS['concrete']))
        m.update(self.d.get('mats', {}).get(name, {}))
        return m


STYLES = {
    'arcology': dict(lit=0.55, panel=(3.5, 8.0), fog=dict(h=0.28, gamma=1.6, d=0.18)),
    'blame': dict(lit=0.9, panel=(14.0, 12.0), trees=('conifer',),
                  fog=dict(h=0.93, gamma=1.1, d=0.3),
                  mats={'concrete': dict(base=C('8a8986'), var=0.18, vscale=0.02, streak=0.35),
                        'concrete_dark': dict(base=C('4a4a49')),
                        'deck': dict(base=C('7a7976'))},
                  env={'blame': {}}),
    'glt': dict(lit=0.0, panel=(3.5, 6.0), snow=dict(z0=70.0, z1=150.0, amount=1.0),
                fog=dict(h=0.85, gamma=1.6, d=0.12), trees=('conifer',), foliage=('foliage3',),
                mats={'concrete': dict(base=C('6d6c69'), streak=0.45), 'concrete_light': dict(base=C('8a877f')),
                      'concrete_dark': dict(base=C('3f3e3c')), 'panel': dict(base=C('7a776f')),
                      'rust': dict(base=C('7a3f22')), 'pipe': dict(base=C('5d5a52'))},
                env={'snow': dict(fog_low=C('39414b'), fog_high=C('c9d0d6'), back_top=C('dfe4e8'), back_bot=C('7d8791'),
                                  sun_e=2.2, world_e=0.9, local=True, local_scale=1.0, lamp=6.0)}),
    'kowloon': dict(lit=0.45, panel=(3.0, 3.0), fog=dict(h=0.75, gamma=2.4, d=0.1),
                    neon=('red', 'cyan', 'yellow', 'pink', 'green', 'orange', 'white'),
                    trees=('round', 'bush'),
                    env={'dusk': dict(win=2.6, neon=7.0, lamp=6.0, bloom=0.55, bloom_thr=1.1, sun_e=3.2, world_e=0.95,
                                      world=C('4a5a8a'), sun=C('ff9d5c')),
                         'night': dict(win=6.0, neon=12.0, lamp=12.0, bloom=0.9)}),
    'solarpunk': dict(lit=0.5, panel=(3.5, 4.0), fog=dict(h=0.12, gamma=2.0, d=0.12),
                      trees=('round', 'round', 'round', 'conifer', 'bush'),
                      foliage=('foliage', 'foliage2', 'foliage3', 'foliage2', 'foliage_lime', 'blossom', 'foliage', 'blossom2'),
                      env={'golden': dict(fog_low=C('c9b79a'), fog_high=C('e9dcc6'), sun_e=4.8, world_e=0.9, world=C('9fb6d6'),
                                          back_top=C('9ab8dc'), back_bot=C('f1d9b8'))},
                      mats={'concrete': dict(base=C('c8c0b0'), streak=0.12, var=0.12),
                            'concrete_light': dict(base=C('ddd5c5'), streak=0.08),
                            'deck': dict(base=C('b8ae9c')),
                            'panel': dict(base=C('d8cfbf')),
                            'steel': dict(base=C('8b8f8c')),
                            'grass': dict(base=C('6f9a3c')),
                            'water': dict(base=C('1e5360'))}),
    'mixed': dict(lit=0.55, panel=(7.0, 8.0), fog=dict(h=0.8, gamma=1.2, d=0.08)),
    'sprite': dict(lit=0.5, panel=None, flat=0.25, fog=dict(h=0.0, gamma=1.0, d=0.0),
                   mats={'water': dict(base=C('3f79ad'), rough=0.3, spec=0.6, emit=C('2d6aa3'), estr='lamp', emult=0.12),
                         'grass': dict(base=C('6d9a3e')), 'glass_green': dict(base=C('b9d8c6'), alpha=0.35)}),
}


# =====================================================================================  materials
class NB:
    """Tiny node-graph helper."""

    def __init__(self, nt):
        self.nt = nt

    def n(self, typ, **kw):
        node = self.nt.nodes.new(typ)
        for k, v in kw.items():
            setattr(node, k, v)
        return node

    def set(self, sock, val):
        if isinstance(val, bpy.types.NodeSocket):
            self.nt.links.new(val, sock)
        else:
            if isinstance(val, (tuple, list)) and len(val) == 3 and sock.type == 'RGBA':
                val = (val[0], val[1], val[2], 1.0)
            sock.default_value = val

    def math(self, op, a, b=None, clamp=False):
        node = self.n('ShaderNodeMath', operation=op, use_clamp=clamp)
        self.set(node.inputs[0], a)
        if b is not None:
            self.set(node.inputs[1], b)
        return node.outputs[0]

    def vmath(self, op, a, b=None):
        node = self.n('ShaderNodeVectorMath', operation=op)
        self.set(node.inputs[0], a)
        if b is not None:
            self.set(node.inputs[1], b)
        return node.outputs['Value'] if op in ('DOT_PRODUCT', 'LENGTH', 'DISTANCE') else node.outputs['Vector']

    def mix(self, fac, a, b):
        node = self.n('ShaderNodeMix', data_type='RGBA')
        self.set(node.inputs[0], fac)
        self.set(node.inputs[6], a)
        self.set(node.inputs[7], b)
        return [o for o in node.outputs if o.type == 'RGBA'][0]

    def maprange(self, v, a0, a1, b0=0.0, b1=1.0, clamp=True):
        node = self.n('ShaderNodeMapRange', clamp=clamp)
        self.set(node.inputs['Value'], v)
        node.inputs['From Min'].default_value = a0
        node.inputs['From Max'].default_value = a1
        node.inputs['To Min'].default_value = b0
        node.inputs['To Max'].default_value = b1
        return node.outputs['Result']

    def noise(self, vec, scale, detail=2.0):
        node = self.n('ShaderNodeTexNoise')
        self.set(node.inputs['Vector'], vec)
        node.inputs['Scale'].default_value = scale
        node.inputs['Detail'].default_value = detail
        return node.outputs['Fac']


class MatFactory:
    def __init__(self, style, env, fog):
        self.style, self.env, self.fog = style, env, fog
        self.cache = {}

    def get(self, name):
        if name in self.cache:
            return self.cache[name]
        m = self.build(name)
        self.cache[name] = m
        return m

    def fog_mix(self, B, shader_out, spec):
        """Height + depth atmospheric fog mixed over the surface shader."""
        f = self.fog
        if not f or spec.get('nofog') or (f['h'] <= 0 and f['d'] <= 0):
            return shader_out
        geo = B.n('ShaderNodeNewGeometry')
        pos = geo.outputs['Position']
        sep = B.n('ShaderNodeSeparateXYZ'); B.set(sep.inputs[0], pos)
        z = sep.outputs['Z']
        th = B.maprange(z, f['z_lo'], f['z_hi'])
        inv = B.math('SUBTRACT', 1.0, th)
        fh = B.math('MULTIPLY', B.math('POWER', inv, f['gamma']), f['h'])
        dep = B.vmath('DOT_PRODUCT', pos, tuple(f['fwd']))
        fd = B.maprange(dep, f['d0'], f['d1'], 0.0, f['d'])
        fac = B.math('SUBTRACT', B.math('ADD', fh, fd), B.math('MULTIPLY', fh, fd), clamp=True)
        col = B.mix(th, f['low'], f['high'])
        em = B.n('ShaderNodeEmission'); B.set(em.inputs['Color'], col); em.inputs['Strength'].default_value = 1.0
        ms = B.n('ShaderNodeMixShader')
        B.set(ms.inputs[0], fac)
        B.nt.links.new(shader_out, ms.inputs[1])
        B.nt.links.new(em.outputs[0], ms.inputs[2])
        return ms.outputs[0]

    def build(self, name):
        spec = self.style.mat(name)
        env = self.env
        mat = bpy.data.materials.new(name)
        nt = mat.node_tree
        nt.nodes.clear()
        B = NB(nt)
        out = B.n('ShaderNodeOutputMaterial')
        if spec.get('hatch'):
            geo = B.n('ShaderNodeNewGeometry')
            sep = B.n('ShaderNodeSeparateXYZ'); B.set(sep.inputs[0], geo.outputs['Position'])
            s = B.math('ADD', B.math('ADD', sep.outputs['X'], sep.outputs['Y']), sep.outputs['Z'])
            fr = B.math('FRACT', B.math('MULTIPLY', s, 1.0 / env.get('hatch_step', 0.7)))
            ln = B.math('LESS_THAN', fr, 0.22)
            col = B.mix(ln, env.get('poche_a', C('1d1c1f')), env.get('poche_b', C('6a6164')))
            em = B.n('ShaderNodeEmission'); B.set(em.inputs['Color'], col); em.inputs['Strength'].default_value = 1.0
            nt.links.new(em.outputs[0], out.inputs['Surface'])
            return mat
        if spec.get('ghost'):
            bs = B.n('ShaderNodeBsdfPrincipled')
            B.set(bs.inputs['Base Color'], env.get('ghost_col', C('cfe3f7')))
            bs.inputs['Alpha'].default_value = env.get('ghost_alpha', 0.10)
            bs.inputs['Roughness'].default_value = 0.4
            B.set(bs.inputs['Emission Color'], env.get('ghost_col', C('d6e6f5')))
            bs.inputs['Emission Strength'].default_value = 0.15
            nt.links.new(bs.outputs[0], out.inputs['Surface'])
            mat.surface_render_method = 'DITHERED'
            return mat
        if spec.get('glow'):
            tr = B.n('ShaderNodeBsdfTransparent')
            em = B.n('ShaderNodeEmission')
            B.set(em.inputs['Color'], spec.get('emit', (1, 1, 1)))
            f = self.fog
            if f:
                geo = B.n('ShaderNodeNewGeometry')
                sep = B.n('ShaderNodeSeparateXYZ'); B.set(sep.inputs[0], geo.outputs['Position'])
                th = B.maprange(sep.outputs['Z'], f['z_lo'], f['z_hi'])
                B.set(em.inputs['Strength'], B.math('MULTIPLY', B.math('POWER', th, 1.5), env.get(spec.get('estr', 'shaft'), 0.3)))
            else:
                em.inputs['Strength'].default_value = env.get(spec.get('estr', 'shaft'), 0.3)
            add = B.n('ShaderNodeAddShader')
            nt.links.new(tr.outputs[0], add.inputs[0]); nt.links.new(em.outputs[0], add.inputs[1])
            nt.links.new(add.outputs[0], out.inputs['Surface'])
            mat.surface_render_method = 'BLENDED'
            if hasattr(mat, 'use_transparent_shadow'):
                mat.use_transparent_shadow = True
            return mat
        if spec.get('wire') or spec.get('guide'):
            em = B.n('ShaderNodeEmission')
            B.set(em.inputs['Color'], env.get('wire_col', C('f2f8ff')) if spec.get('wire') else env.get('guide_col', C('5a6068')))
            em.inputs['Strength'].default_value = env.get('wire_e', 1.2) if spec.get('wire') else 1.0
            nt.links.new(em.outputs[0], out.inputs['Surface'])
            return mat

        bs = B.n('ShaderNodeBsdfPrincipled')
        base = spec.get('base', (0.5, 0.5, 0.5))
        geo = B.n('ShaderNodeNewGeometry')
        pos = geo.outputs['Position']
        col = base
        flat = self.style.d.get('flat', 1.0)
        var = spec.get('var', 0.0) * flat
        if var:
            nz = B.noise(pos, spec.get('vscale', 0.1) * 10.0, 3.0)
            k = B.maprange(nz, 0.3, 0.7, 1.0 - var, 1.0 + var * 0.5)
            dark = tuple(c * 0.55 for c in base)
            col = B.mix(B.maprange(k, 1.0 - var, 1.0 + var * 0.5), dark, base)
        streak = spec.get('streak', 0.0) * flat
        if streak:
            sc = B.vmath('MULTIPLY', pos, (0.9, 0.9, 0.06))
            nz = B.noise(sc, 1.8, 4.0)
            s = B.maprange(nz, 0.45, 0.75, 0.0, streak)
            col = B.mix(s, col, tuple(c * 0.45 for c in base))
        pnl = self.style.d.get('panel')
        if spec.get('panel') and pnl:
            pz, pxy = pnl
            sep = B.n('ShaderNodeSeparateXYZ'); B.set(sep.inputs[0], pos)
            fz = B.math('FRACT', B.math('MULTIPLY', sep.outputs['Z'], 1.0 / pz))
            lz = B.math('LESS_THAN', fz, 0.12 / pz * 1.6)
            fxy = B.math('FRACT', B.math('MULTIPLY', B.math('ADD', sep.outputs['X'], sep.outputs['Y']), 1.0 / pxy))
            lxy = B.math('LESS_THAN', fxy, 0.1 / pxy * 1.6)
            nsep = B.n('ShaderNodeSeparateXYZ'); B.set(nsep.inputs[0], geo.outputs['Normal'])
            vert = B.math('LESS_THAN', B.math('ABSOLUTE', nsep.outputs['Z']), 0.5)
            ln = B.math('MULTIPLY', B.math('MAXIMUM', lz, lxy), vert)
            col = B.mix(B.math('MULTIPLY', ln, 0.55), col, tuple(c * 0.5 for c in base))
        rough = spec.get('rough', 0.8)
        snow = self.style.d.get('snow')
        if snow and not spec.get('emit') and not spec.get('water') and not spec.get('alpha'):
            nsep = B.n('ShaderNodeSeparateXYZ'); B.set(nsep.inputs[0], geo.outputs['Normal'])
            up = B.maprange(nsep.outputs['Z'], 0.5, 0.85)
            nz = B.maprange(B.noise(pos, snow.get('scale', 0.12), 4.0), snow.get('lo', 0.28), snow.get('hi', 0.46))
            sep2 = B.n('ShaderNodeSeparateXYZ'); B.set(sep2.inputs[0], pos)
            hz = B.maprange(sep2.outputs['Z'], snow['z0'], snow['z1'], 0.0, snow.get('amount', 1.0))
            sf = B.math('MULTIPLY', B.math('MULTIPLY', up, nz), hz, clamp=True)
            col = B.mix(sf, col, C('eef1f6'))
        B.set(bs.inputs['Base Color'], col)
        bs.inputs['Roughness'].default_value = rough
        bs.inputs['Metallic'].default_value = spec.get('metal', 0.0)
        if 'spec' in spec:
            bs.inputs['Specular IOR Level'].default_value = spec['spec']
        if spec.get('emit'):
            B.set(bs.inputs['Emission Color'], spec['emit'])
            bs.inputs['Emission Strength'].default_value = env.get(spec.get('estr', 'win'), 1.0) * spec.get('emult', 1.0)
        if spec.get('alpha') is not None:
            bs.inputs['Alpha'].default_value = spec['alpha']
            mat.surface_render_method = 'DITHERED'
        if spec.get('water'):
            bs.inputs['Coat Weight'].default_value = 0.5
        sh = self.fog_mix(B, bs.outputs[0], spec)
        nt.links.new(sh, out.inputs['Surface'])
        return mat


# =====================================================================================  scene assembly
def part_phase(tags):
    ph, until = 0, 999
    for t in tags:
        if t.startswith('phase:'):
            ph = int(t.split(':')[1])
        elif t.startswith('until:'):
            until = int(t.split(':')[1])
    return ph, until


def aabb_side(bb, co, no):
    """Return -1 if AABB fully on the kept (negative) side, +1 if fully removed, 0 if straddling."""
    xs = (bb[0], bb[3]); ys = (bb[1], bb[4]); zs = (bb[2], bb[5])
    vals = [(x - co[0]) * no[0] + (y - co[1]) * no[1] + (z - co[2]) * no[2] for x in xs for y in ys for z in zs]
    if max(vals) <= 1e-4:
        return -1
    if min(vals) >= -1e-4:
        return 1
    return 0


def to_bmesh(buf):
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in buf.v]
    for f, m in zip(buf.f, buf.m):
        try:
            face = bm.faces.new([vs[i] for i in f])
            face.material_index = m
        except ValueError:
            pass
    return bm


def clip_bm(bm, co, no, cap_mat):
    """Remove geometry on the +no side of the plane; cap the cut with cap_mat (or leave open if None)."""
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    res = bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=co, plane_no=no, clear_outer=True, clear_inner=False)
    if cap_mat is None:
        return
    cut = [g for g in res['geom_cut'] if isinstance(g, bmesh.types.BMEdge) and g.is_valid]
    be = [e for e in cut if len(e.link_faces) == 1]
    if not be:
        return
    try:
        r2 = bmesh.ops.holes_fill(bm, edges=be, sides=0)
        for f in r2['faces']:
            f.material_index = cap_mat
    except Exception as ex:
        log("holes_fill failed", ex)


def bm_to_buf(bm):
    b = Buf()
    bm.verts.index_update()
    b.v = [tuple(v.co) for v in bm.verts]
    for f in bm.faces:
        b.f.append(tuple(v.index for v in f.verts)); b.m.append(f.material_index)
    return b


def massing_ghost(parts, zc, mats, clamp=None):
    """Ghost of the upper levels: one translucent box + edge struts per massing part (clipped at zc, and to clamp xy)."""
    gi, wi = mats.mid('ghost'), mats.mid('ghost_wire')
    b = Buf()
    for P, bb in parts:
        if P.type not in MASSING or bb is None or bb[5] <= zc + 0.05:
            continue
        x0, y0, z0, x1, y1, z1 = bb
        if clamp:
            x0, y0, x1, y1 = max(x0, clamp[0]), max(y0, clamp[1]), min(x1, clamp[2]), min(y1, clamp[3])
            if x1 - x0 < 0.05 or y1 - y0 < 0.05:
                continue
        z0 = max(z0, zc)
        if P.type in ('deck', 'slab', 'floor'):
            pass
        base = len(b.v)
        b.v.extend([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)])
        for f in BOX_FACES:
            b.f.append(tuple(base + i for i in f)); b.m.append(gi)
        r = 0.045 if (x1 - x0) * (y1 - y0) < 400 else 0.09
        corners = b.v[base:base + 8]
        for a, c in ((0, 1), (1, 2), (2, 3), (3, 0), (4, 5), (5, 6), (6, 7), (7, 4), (0, 4), (1, 5), (2, 6), (3, 7)):
            p0, p1 = Vector(corners[a]), Vector(corners[c])
            d = p1 - p0
            if d.length < 1e-4:
                continue
            ax = d.normalized()
            t = Vector((0, 0, 1)) if abs(ax.z) < 0.9 else Vector((1, 0, 0))
            u = ax.cross(t).normalized() * r; v = ax.cross(u).normalized() * r
            vb = len(b.v)
            for p in (p0, p1):
                b.v.extend([tuple(p - u - v), tuple(p + u - v), tuple(p + u + v), tuple(p - u + v)])
            for f in ((0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (0, 3, 2, 1), (4, 5, 6, 7)):
                b.f.append(tuple(vb + i for i in f)); b.m.append(wi)
    return b


def build_scene(spec, job):
    """Emit all parts, apply the view mode.  Returns (list of (name, Buf, flags)), mats, lights, part list, bounds_all."""
    meta = spec.get('meta', {})
    grid = meta.get('grid', {'cell': 4.0, 'level': 3.5})
    seed = meta.get('seed', 0)
    so = dict(meta.get('style_overrides') or {})
    so.update(job.get('style_overrides') or {})
    style = Style(job.get('style') or meta.get('style', 'arcology'), so)
    mats = MatTable()
    view = job.get('view', {}) or {}
    mode = view.get('mode', 'full')
    phase = job.get('phase')
    lh = grid['level']
    only = set(job.get('only_tags', []))
    skip_types = set(view.get('skip_types', []))

    parts = []
    blueprint = []
    lights = []
    all_bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]
    t0 = time.time()
    for i, d in enumerate(spec['parts']):
        if d['type'] not in BUILDERS:
            log("unknown part type", d['type']); continue
        P = Part(d, grid, i, seed, mats, style)
        ph, until = part_phase(P.tags)
        try:
            BUILDERS[P.type](P)
        except Exception as ex:
            log("builder failed", P.type, ex); raise
        bb = P.buf.aabb()
        if bb:
            for k in range(3):
                all_bb[k] = min(all_bb[k], bb[k]); all_bb[k + 3] = max(all_bb[k + 3], bb[k + 3])
        if phase is not None and ph == phase + 1 and job.get('blueprint') and until >= 999:
            blueprint.append((P, bb))
        if phase is None and until < 999:
            continue
        if phase is not None and not (ph <= phase <= until):
            continue
        if only and not (only & set(P.tags)):
            continue
        if P.type in skip_types:
            continue
        parts.append((P, bb))
        lights.extend(P.lights)
    log("emitted %d parts (%d verts) in %.1fs" % (len(parts), sum(len(P.buf.v) for P, _ in parts), time.time() - t0))

    poche = mats.mid('poche')
    out = []
    crop = view.get('crop')
    crop_planes = []
    if crop:
        cx0, cy0, cx1, cy1 = [v * grid['cell'] for v in crop]
        crop_planes = [((cx0, 0, 0), (-1, 0, 0)), ((cx1, 0, 0), (1, 0, 0)), ((0, cy0, 0), (0, -1, 0)), ((0, cy1, 0), (0, 1, 0))]
    if mode in ('full', 'sprite') and not crop_planes:
        b = Buf()
        for P, bb in parts:
            b.extend(P.buf)
        out.append(('main', b, {}))
    elif mode in ('full', 'sprite', 'cutaway', 'plan', 'ghost', 'section'):
        planes = list(crop_planes)
        zc = None
        if mode == 'section':
            ax = view.get('axis', 'x')
            at = view['at'] * grid['cell']
            if ax == 'x':
                planes.append(((at, 0, 0), (1, 0, 0)))
            elif ax == '-y':
                planes.append(((0, at, 0), (0, -1, 0)))
            else:
                planes.append(((0, at, 0), (0, 1, 0)))
            if 'top' in view:
                planes.append(((0, 0, view['top'] * lh), (0, 0, 1)))
        elif mode in ('cutaway', 'plan', 'ghost'):
            zc = (view['level'] + view.get('cut', 0.5)) * lh
            planes.append(((0, 0, zc), (0, 0, 1)))
        keep, span = Buf(), Buf()
        for P, bb in parts:
            if bb is None:
                continue
            sides = [aabb_side(bb, co, no) for co, no in planes]
            if any(sd == 1 for sd in sides):
                continue
            if all(sd == -1 for sd in sides):
                keep.extend(P.buf)
            else:
                span.extend(P.buf)
        if span.v:
            t1 = time.time()
            bm = to_bmesh(span)
            for co, no in planes:
                clip_bm(bm, co, no, poche)
            span = bm_to_buf(bm); bm.free()
            log("clipped span geometry in %.1fs" % (time.time() - t1))
        keep.extend(span)
        out.append(('main', keep, {}))
        if mode == 'ghost':
            gparts = parts
            if crop:
                gparts = [(P, bb) for P, bb in parts if bb and all(aabb_side(bb, co, no) == -1 for co, no in crop_planes)]
            g = massing_ghost(gparts, zc, mats)
            out.append(('ghost', g, {'ghost': True}))
    elif mode == 'exploded':
        bands = [b * lh for b in view['bands']]
        gap = view.get('gap', 1.0) * lh
        nb = len(bands) - 1
        lo = [bands[k] for k in range(nb)]
        hi = [bands[k + 1] for k in range(nb)]
        lo[0] = -1e9; hi[-1] = 1e9
        keeps = [Buf() for _ in range(nb)]
        spans = [Buf() for _ in range(nb)]
        for P, bb in parts:
            if bb is None:
                continue
            csides = [aabb_side(bb, co, no) for co, no in crop_planes]
            if any(sd == 1 for sd in csides):
                continue
            cropped = any(sd == 0 for sd in csides)
            hit = [k for k in range(nb) if bb[5] > lo[k] + 1e-4 and bb[2] < hi[k] - 1e-4]
            if not hit:
                hit = [0 if bb[2] < bands[0] else nb - 1]
            if len(hit) == 1 and not cropped:
                keeps[hit[0]].extend(P.buf)
            else:
                for k in hit:
                    spans[k].extend(P.buf)
        for k in range(nb):
            b = keeps[k]
            if spans[k].v:
                bm = to_bmesh(spans[k])
                for co, no in crop_planes:
                    clip_bm(bm, co, no, poche)
                if lo[k] > -1e8:
                    clip_bm(bm, (0, 0, lo[k]), (0, 0, -1), poche)
                if hi[k] < 1e8:
                    clip_bm(bm, (0, 0, hi[k]), (0, 0, 1), poche)
                b.extend(bm_to_buf(bm)); bm.free()
            out.append(('band%d' % k, b.translated(0, 0, k * gap), {}))
        # leader lines between bands at the listed guide points
        g = Buf(); gi = mats.mid('guide')
        for (gx, gy) in view.get('guides', []):
            X, Y = gx * grid['cell'], gy * grid['cell']
            for k in range(nb - 1):
                za = hi[k] + k * gap
                zb = lo[k + 1] + (k + 1) * gap
                z = za + 0.6
                while z < zb - 0.6:
                    z1 = min(zb - 0.6, z + 1.6)
                    b0 = len(g.v)
                    r = 0.12
                    g.v.extend([(X - r, Y - r, z), (X + r, Y - r, z), (X + r, Y + r, z), (X - r, Y + r, z),
                                (X - r, Y - r, z1), (X + r, Y - r, z1), (X + r, Y + r, z1), (X - r, Y + r, z1)])
                    for f in BOX_FACES:
                        g.f.append(tuple(b0 + i for i in f)); g.m.append(gi)
                    z += 3.0
        if g.v:
            out.append(('guides', g, {'noshadow': True}))
        lights = [(Vector(p) + Vector((0, 0, 0)), c, pw, r) for (p, c, pw, r) in lights]  # (lights not shifted; minor)
    else:
        raise ValueError("unknown view mode " + mode)
    if blueprint:
        cl = [v * grid['cell'] for v in crop] if crop else None
        g = massing_ghost(blueprint, -1e9, mats, cl)
        out.append(('blueprint', g, {'ghost': True}))
    if mode == 'sprite' and view.get('rot', 0) % 4:
        k = view.get('rot', 0) % 4
        fp = view.get('footprint', [0, 0, 1, 1])
        cx = (fp[0] + fp[2] / 2.0) * grid['cell']; cy = (fp[1] + fp[3] / 2.0) * grid['cell']

        # after an odd quarter-turn a w x d footprint becomes d x w: re-anchor it on the tile grid
        fw, fd = fp[2] * grid['cell'], fp[3] * grid['cell']
        if k % 2:
            ncx, ncy = fp[0] * grid['cell'] + fd / 2.0, fp[1] * grid['cell'] + fw / 2.0
        else:
            ncx, ncy = cx, cy

        def R(p):
            x, y, z = p[0] - cx, p[1] - cy, p[2]
            for _ in range(k):
                x, y = -y, x
            return (x + ncx, y + ncy, z)
        for name, b, flags in out:
            b.v = [R(p) for p in b.v]
        lights = [(R(p), c, pw, r) for (p, c, pw, r) in lights]
    return out, mats, lights, all_bb, style, grid


# =====================================================================================  camera, world, render
def cam_basis(az_deg, el_deg):
    az, el = math.radians(az_deg), math.radians(el_deg)
    fwd = Vector((-math.cos(el) * math.sin(az), math.cos(el) * math.cos(az), -math.sin(el)))
    # az here is the camera rotation about Z (45 => camera sits at +x,-y looking toward -x,+y)
    right = Vector((math.cos(az), math.sin(az), 0.0))
    up = right.cross(fwd).normalized()
    return fwd, right, up


def setup_camera(scene, pts_min_max, job, grid):
    """pts: numpy array Nx3 (world points to frame)."""
    import numpy as np
    view = job.get('view', {}) or {}
    camj = job.get('camera', {}) or {}
    rx, ry = job['res']
    aspect = rx / ry
    cam_data = bpy.data.cameras.new('Cam')
    cam_data.type = 'ORTHO'
    cam_data.sensor_fit = 'HORIZONTAL'   # ortho_scale is always the frame width
    cam = bpy.data.objects.new('Cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    if view.get('mode') == 'plan':
        fwd, right, up = Vector((0, 0, -1)), Vector((1, 0, 0)), Vector((0, 1, 0))
        rot = (0.0, 0.0, 0.0)
    else:
        el = camj.get('el', 30.0)
        az = camj.get('az', 45.0)
        fwd, right, up = cam_basis(az, el)
        rot = (math.pi / 2 - math.radians(el), 0.0, math.radians(az))
    pts = pts_min_max
    sx = pts @ np.array(right); sy = pts @ np.array(up); sf = pts @ np.array(fwd)
    x0, x1, y0, y1 = sx.min(), sx.max(), sy.min(), sy.max()
    margin = camj.get('margin', 0.06)
    w, h = (x1 - x0), (y1 - y0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    scale = max(w, h * aspect) * (1 + 2 * margin)
    if 'ortho_scale' in camj:
        scale = camj['ortho_scale']
    scale *= camj.get('zoom', 1.0)
    if 'target' in camj:
        t = Vector(camj['target'])
        cx, cy = t.dot(right), t.dot(up)
    cx += camj.get('pan', [0, 0])[0] * scale
    cy += camj.get('pan', [0, 0])[1] * scale / aspect
    if 'px_per_m' in camj:  # pixel-exact sprite framing
        scale = rx / camj['px_per_m']
        ppm = camj['px_per_m']
        # snap centre so that the world origin lands on a pixel corner
        cx = round(cx * ppm) / ppm + (0.0 if rx % 2 == 0 else 0.5 / ppm)
        cy = round(cy * ppm) / ppm + (0.0 if ry % 2 == 0 else 0.5 / ppm)
    fmin = sf.min() - 50.0
    loc = right * cx + up * cy + fwd * fmin
    cam.location = loc
    cam.rotation_euler = rot
    cam_data.ortho_scale = scale
    cam_data.clip_start = 0.1
    cam_data.clip_end = float(sf.max() - fmin + 100.0)
    info = dict(fwd=tuple(fwd), right=tuple(right), up=tuple(up), cx=cx, cy=cy, scale=scale, fmin=fmin,
                d0=float(sf.min()), d1=float(sf.max()), res=(rx, ry))
    return cam, info


def add_backdrop(scene, cam, info, env):
    """Camera-parented gradient card behind everything (ortho world backgrounds are flat)."""
    rx, ry = info['res']
    s = info['scale']
    w, h = s * 1.2, s / (rx / ry) * 1.2
    me = bpy.data.meshes.new('Backdrop')
    me.from_pydata([(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name='UV')
    for li, l in enumerate(me.loops):
        v = me.vertices[l.vertex_index].co
        uv.data[li].uv = ((v.x + w / 2) / w, (v.y + h / 2) / h)
    ob = bpy.data.objects.new('Backdrop', me)
    scene.collection.objects.link(ob)
    ob.parent = cam
    ob.location = (0, 0, -(cam.data.clip_end - 5.0))
    for attr in ('visible_shadow', 'visible_diffuse', 'visible_glossy'):
        setattr(ob, attr, False)
    mat = bpy.data.materials.new('backdrop')
    nt = mat.node_tree; nt.nodes.clear(); B = NB(nt)
    out = B.n('ShaderNodeOutputMaterial')
    tc = B.n('ShaderNodeTexCoord')
    sep = B.n('ShaderNodeSeparateXYZ'); B.set(sep.inputs[0], tc.outputs['UV'])
    t = B.maprange(sep.outputs['Y'], env.get('back_lo', 0.0), env.get('back_hi', 1.0))
    col = B.mix(t, env['back_bot'], env['back_top'])
    em = B.n('ShaderNodeEmission'); B.set(em.inputs['Color'], col); em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    me.materials.append(mat)
    return ob


def setup_world_and_lights(scene, env, lights, job):
    world = bpy.data.worlds.new('World')
    scene.world = world
    nt = world.node_tree
    bg = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeBackground'][0]
    bg.inputs['Color'].default_value = tuple(env['world']) + (1.0,)
    bg.inputs['Strength'].default_value = env['world_e']

    def sun(name, az, el, color, energy, angle, shadow=True):
        ld = bpy.data.lights.new(name, 'SUN')
        ld.energy = energy
        ld.color = color
        ld.angle = math.radians(angle)
        ld.use_shadow = shadow
        if hasattr(ld, 'use_shadow_jitter'):
            ld.use_shadow_jitter = angle > 5
        ob = bpy.data.objects.new(name, ld)
        scene.collection.objects.link(ob)
        a, e = math.radians(az), math.radians(el)
        pos = Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)))
        ob.rotation_euler = (-pos).to_track_quat('-Z', 'Y').to_euler()
        return ob

    sun('Sun', env['sun_az'], env['sun_el'], env['sun'], env['sun_e'], env['sun_ang'])
    if env.get('fill', 0) > 0:
        sun('Fill', env['sun_az'] + 150, 35, env['world'], env['sun_e'] * env['fill'] + 0.3 * env['fill'], 30, shadow=False)
    if env.get('local') and lights:
        sc = env.get('local_scale', 1.0)
        maxn = job.get('max_lights', 160)
        rng = random.Random(7)
        L = list(lights)
        if len(L) > maxn:
            L = rng.sample(L, maxn)
        for i, (p, c, pw, r) in enumerate(L):
            ld = bpy.data.lights.new('pt%d' % i, 'POINT')
            ld.energy = pw * sc
            ld.color = c
            ld.shadow_soft_size = r
            ld.use_shadow = False
            ob = bpy.data.objects.new('pt%d' % i, ld)
            ob.location = p
            scene.collection.objects.link(ob)


def setup_render(scene, job, env):
    scene.render.engine = job.get('engine', 'BLENDER_EEVEE')
    rx, ry = job['res']
    scene.render.resolution_x, scene.render.resolution_y = rx, ry
    scene.render.resolution_percentage = 100
    ee = scene.eevee
    ee.taa_render_samples = job.get('samples', 32)
    ee.use_shadows = True
    try:
        ee.use_raytracing = job.get('raytrace', True)
        ee.ray_tracing_options.resolution_scale = '2'
        ee.use_fast_gi = True
        ee.fast_gi_method = 'GLOBAL_ILLUMINATION'
        ee.fast_gi_distance = job.get('gi_distance', 6.0)
        ee.fast_gi_resolution = '2'
    except Exception as ex:
        log('raytrace opts', ex)
    ee.shadow_resolution_scale = job.get('shadow_res', 1.0)
    try:
        ee.shadow_pool_size = job.get('shadow_pool', '1024')   # MB; the 512 default overflows on big close-ups
    except Exception as ex:
        log('shadow pool', ex)
    ee.shadow_ray_count = 2
    ee.shadow_step_count = 8
    scene.render.film_transparent = job.get('transparent', False)
    scene.render.filter_size = job.get('filter_size', 1.5)
    scene.view_settings.view_transform = 'AgX'
    try:
        scene.view_settings.look = env.get('look', 'AgX - Medium High Contrast')
    except Exception:
        pass
    scene.view_settings.exposure = env.get('exposure', 0.0) + job.get('exposure', 0.0)
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA' if job.get('transparent') else 'RGB'
    scene.render.use_compositing = True
    bloom = job.get('bloom', env.get('bloom', 0.0))
    if bloom > 0:
        ng = bpy.data.node_groups.new('Comp', 'CompositorNodeTree')
        ng.interface.new_socket(name='Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        rl = ng.nodes.new('CompositorNodeRLayers')
        go = ng.nodes.new('NodeGroupOutput')
        gl = ng.nodes.new('CompositorNodeGlare')
        gl.inputs['Type'].default_value = 'Bloom'
        gl.inputs['Threshold'].default_value = env.get('bloom_thr', 1.0)
        gl.inputs['Strength'].default_value = bloom
        gl.inputs['Size'].default_value = job.get('bloom_size', 0.55)
        ng.links.new(rl.outputs['Image'], gl.inputs['Image'])
        ng.links.new(gl.outputs['Image'], go.inputs[0])
        scene.compositing_node_group = ng


def reset():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds, bpy.data.node_groups,
                 bpy.data.images):
        for d in list(coll):
            coll.remove(d)


def run_job(job):
    import numpy as np
    t_start = time.time()
    reset()
    scene = bpy.context.scene
    spec_path = job['spec'] if os.path.isabs(job['spec']) else os.path.join(HERE, job['spec'])
    with open(spec_path) as fh:
        spec = json.load(fh)
    meta = spec.get('meta', {})
    light = job.get('light') or meta.get('light', 'overcast')
    env = dict(LIGHTS[light])
    stylename = job.get('style') or meta.get('style', 'arcology')
    env.update(STYLES.get(stylename, {}).get('env', {}).get(light, {}))
    env.update(meta.get('env', {}).get(light, {}))
    env.update(job.get('env', {}))
    objs, mats, lights, all_bb, style, grid = build_scene(spec, job)
    view = job.get('view', {}) or {}
    t_build = time.time()

    # create meshes
    created = []
    for name, buf, flags in objs:
        if not buf.v:
            continue
        me = bpy.data.meshes.new(name)
        me.from_pydata(buf.v, [], buf.f)
        used = sorted(set(buf.m))
        remap = {m: i for i, m in enumerate(used)}
        me.polygons.foreach_set('material_index', [remap[m] for m in buf.m])
        ob = bpy.data.objects.new(name, me)
        scene.collection.objects.link(ob)
        if flags.get('ghost') or flags.get('noshadow'):
            ob.visible_shadow = False
        created.append((ob, me, [mats.names[m] for m in used]))
    # frame
    if job.get('frame_all', False):
        x0, y0, z0, x1, y1, z1 = all_bb
        pts = np.array([(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)])
    else:
        arrs = []
        for ob, me, _ in created:
            a = np.empty(len(me.vertices) * 3, dtype=np.float32)
            me.vertices.foreach_get('co', a)
            arrs.append(a.reshape(-1, 3))
        pts = np.concatenate(arrs) if arrs else np.zeros((1, 3))
        if job.get('frame_bb'):
            x0, y0, z0, x1, y1, z1 = job['frame_bb']
            if job.get('frame_clip'):
                pts = np.clip(pts, [x0, y0, z0], [x1, y1, z1])
            else:
                pts = np.array([(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)])
    cam, info = setup_camera(scene, pts, job, grid)

    # fog parameters from framing
    fcfg = dict(style.d.get('fog', {}))
    fcfg.update(meta.get('fog', {}))
    fcfg.update(job.get('fog', {}))
    zlo = fcfg.get('z_lo', float(pts[:, 2].min()))
    zhi = fcfg.get('z_hi', float(pts[:, 2].max()))
    fog = dict(h=fcfg.get('h', 0.3), gamma=fcfg.get('gamma', 1.5), d=fcfg.get('d', 0.2), z_lo=zlo, z_hi=zhi,
               fwd=info['fwd'], d0=fcfg.get('d0', info['d0'] + (info['d1'] - info['d0']) * 0.25), d1=info['d1'],
               low=env['fog_low'], high=env['fog_high'])
    if view.get('mode') == 'plan':
        fog.update(h=0.0, d=fcfg.get('d', 0.55), d0=info['d0'] + fcfg.get('plan_d0', 2.0), d1=info['d0'] + fcfg.get('plan_d1', 30.0))
    if job.get('nofog'):
        fog = None
    mf = MatFactory(style, env, fog)
    for ob, me, names in created:
        for n in names:
            me.materials.append(mf.get(n))
    if not job.get('transparent'):
        add_backdrop(scene, cam, info, env)
    setup_world_and_lights(scene, env, lights, job)
    setup_render(scene, job, env)
    out = job['out'] if os.path.isabs(job['out']) else os.path.join(HERE, job['out'])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    scene.render.filepath = out
    t_r = time.time()
    bpy.ops.render.render(write_still=True)
    nverts = sum(len(me.vertices) for _, me, _ in created)
    nfaces = sum(len(me.polygons) for _, me, _ in created)
    stats = dict(out=os.path.relpath(out, HERE), build_s=round(t_build - t_start, 2), mesh_s=round(t_r - t_build, 2),
                 render_s=round(time.time() - t_r, 2), verts=nverts, faces=nfaces, lights=len(lights),
                 camera=dict(scale=info['scale'], cx=info['cx'], cy=info['cy'], right=info['right'], up=info['up']))
    log("rendered", stats['out'], "build %.1fs mesh %.1fs render %.1fs  verts %d faces %d" %
        (stats['build_s'], stats['mesh_s'], stats['render_s'], nverts, nfaces))
    if job.get('camera_out'):
        with open(os.path.join(HERE, job['camera_out']), 'w') as fh:
            json.dump(stats['camera'], fh, indent=1)
    return stats


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--jobs')
    ap.add_argument('--spec')
    ap.add_argument('--out')
    ap.add_argument('--light')
    ap.add_argument('--style')
    ap.add_argument('--view', default='{}')
    ap.add_argument('--res', default='1600x1000')
    ap.add_argument('--samples', type=int, default=32)
    ap.add_argument('--only', default=None, help='comma list of job indices to run')
    a = ap.parse_args(argv)
    if a.jobs:
        with open(a.jobs if os.path.isabs(a.jobs) else os.path.join(HERE, a.jobs)) as fh:
            jobs = json.load(fh)
        defaults = jobs.get('defaults', {})
        joblist = jobs['jobs']
    else:
        defaults = {}
        joblist = [dict(spec=a.spec, out=a.out, light=a.light, style=a.style, view=json.loads(a.view),
                        res=[int(v) for v in a.res.split('x')], samples=a.samples)]
    sel = None if a.only is None else set(int(s) for s in a.only.split(','))
    stats = []
    for i, j in enumerate(joblist):
        if sel is not None and i not in sel:
            continue
        job = dict(defaults); job.update({k: v for k, v in j.items() if v is not None})
        job.setdefault('res', [1600, 1000])
        stats.append(run_job(job))
    if a.jobs:
        sp = os.path.join(HERE, 'out', 'stats_' + os.path.splitext(os.path.basename(a.jobs))[0] + '.json')
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
