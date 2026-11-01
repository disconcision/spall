"""
parts_green.py - overgrowth: cultivated, not post-apocalyptic (Blender side).

  vines       trailing plants hanging from an edge line (ledges, balconies, parapets, planters)
  roots       aerial roots hanging below a slab, some reaching the ground and thickening (banyan-like)
  ivy         a climbing-plant patch on a wall face
  roofgarden  lush roof: soil, lawn, shrub borders, trees (incl. big canopy and weeping species), path
  edgeplanter planter box on a ledge with shrubs and trailing plants
  bigtree     a large canopy tree, optionally with hanging aerial roots draping over an edge
Moss, algae streaks and ivy tint on concrete come from the style (kitc.MatFactoryX), not from geometry.
"""
import math
import random

import paths as PT
import prims

KIT = None


def blob(P, mat, c, r, sx=1.0, sy=1.0, sz=1.0, rng=None, jit=0.2):
    vs = []
    for p in KIT.ICO_V:
        j = 1.0 + ((rng.uniform(-jit, jit)) if rng else 0.0)
        vs.append((c[0] + p[0] * r * sx * j, c[1] + p[1] * r * sy * j, c[2] + p[2] * r * sz * j))
    P.poly(vs, KIT.ICO_F, mat)


def strand(P, mats, x, y, z, L, rng, lean=(0.0, 0.0), w=0.34, leaf=0.32, flower=0.0):
    """One trailing strand hanging from (x, y, z) down by L: a thin core with leaf clumps, tapering."""
    n = max(2, int(L / 0.55))
    px, py = x, y
    for k in range(n):
        t = k / max(1, n - 1)
        zz = z - L * t
        px += lean[0] * 0.55 + rng.uniform(-0.06, 0.06)
        py += lean[1] * 0.55 + rng.uniform(-0.06, 0.06)
        r = leaf * (1.0 - 0.55 * t) * rng.uniform(0.8, 1.2)
        mat = rng.choice(mats)
        if flower and rng.random() < flower:
            mat = rng.choice(('vine_flower', 'vine_flower2', 'blossom'))
        blob(P, mat, (px, py, zz), r, 1.0, 1.0, 1.25, rng, 0.25)


def _edge_points(P, side, inset=0.15):
    lx, ly = P.lx, P.ly
    return {'s': ((0, inset), (lx, inset), (0, -1)), 'n': ((0, ly - inset), (lx, ly - inset), (0, 1)),
            'w': ((inset, 0), (inset, ly), (-1, 0)), 'e': ((lx - inset, 0), (lx - inset, ly), (1, 0))}[side]


def b_vines(P):
    """params: sides ('s'), len [min,max] m, density (strands per m), mats, flower (0..1), z (hang height, default top),
    lean (outward lean per step), line [[x0,y0],[x1,y1]] explicit local line instead of sides, clump (edge shrub)."""
    rng = P.rng
    lmin, lmax = P.g('len', [2.0, 7.0])
    dens = P.g('density', 1.2)
    mats = P.g('mats', ['ivy', 'ivy2', 'foliage', 'vine_light'])
    z = P.g('z', P.lz)
    flower = P.g('flower', 0.0)
    lines = []
    if P.g('line'):
        (x0, y0), (x1, y1) = P.g('line')
        nx, ny = P.g('out', (0, -1))
        lines.append(((x0, y0), (x1, y1), (nx, ny)))
    else:
        for s in P.g('sides', 's'):
            lines.append(_edge_points(P, s, P.g('inset', 0.15)))
    for (a, b, o) in lines:
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        n = max(1, int(L * dens))
        for i in range(n):
            t = (i + rng.uniform(0.1, 0.9)) / n
            x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            ll = rng.uniform(lmin, lmax) * (rng.uniform(0.3, 1.0) if rng.random() < 0.35 else 1.0)
            lean = (o[0] * P.g('lean', 0.03), o[1] * P.g('lean', 0.03))
            strand(P, mats, x + o[0] * 0.1, y + o[1] * 0.1, z, ll, rng, lean, leaf=P.g('leaf', 0.3), flower=flower)
            if P.g('clump', True) and rng.random() < 0.6:
                blob(P, rng.choice(mats), (x, y, z + 0.15), rng.uniform(0.4, 0.75), 1.3, 1.3, 0.7, rng, 0.3)


def b_roots(P):
    """Aerial roots below a slab underside at local z = lz (part top), hanging down; params: n, reach (fraction that
    reach the ground at z=0), r (root radius), spread."""
    rng = P.rng
    lx, ly, lz = P.lx, P.ly, P.lz
    n = P.g('n', 24)
    reach = P.g('reach', 0.3)
    r0 = P.g('r', 0.12)
    m = P.mat or 'root'
    for i in range(n):
        x, y = rng.uniform(0.3, lx - 0.3), rng.uniform(0.3, ly - 0.3)
        full = rng.random() < reach
        L = lz if full else lz * rng.uniform(0.15, 0.7)
        k = 5
        pts = [(x, y, lz)]
        for j in range(1, k + 1):
            t = j / k
            pts.append((x + rng.uniform(-0.6, 0.6) * t, y + rng.uniform(-0.6, 0.6) * t, lz - L * t))
        path = PT.catmull(pts, step=0.6)
        rr = r0 * rng.uniform(0.6, 1.4) * (1.6 if full else 1.0)
        N = len(path)
        prims.sweep(P, m, path, prims.circle(rr, 5), mode='pt',
                    scale=(lambda ii, N=N, full=full: (1.0 + 0.8 * (ii / N) ** 3) if full else (1.0 - 0.75 * ii / N)))
        if full:
            blob(P, m, (path[-1][0], path[-1][1], 0.1), rr * 2.2, 1.2, 1.2, 0.5, rng, 0.2)


def b_ivy(P):
    """Climbing plant patch on the local face `face` (s|n|e|w) of the part box, covering a noisy region.
    params: face, cover (0..1), leaf (m), mats, top_heavy (more at the top)."""
    rng = P.rng
    lx, ly, lz = P.lx, P.ly, P.lz
    face = P.g('face', 's')
    L = lx if face in 'sn' else ly
    cover = P.g('cover', 0.6)
    leaf = P.g('leaf', 0.45)
    mats = P.g('mats', ['ivy', 'ivy2', 'foliage3'])
    n = int(L * lz * cover / (leaf * leaf * 2.2))
    for i in range(n):
        a = rng.uniform(0, L)
        zt = rng.random() ** (0.6 if P.g('top_heavy', True) else 1.0)
        z = lz * (1 - zt * rng.uniform(0.4, 1.0)) if P.g('top_heavy', True) else rng.uniform(0, lz)
        # density falls off with a coarse noise along the face so the patch has ragged edges
        if math.sin(a * 0.35 + P.rng.random() * 0.3) * 0.5 + 0.5 < 0.25 * rng.random():
            continue
        r = leaf * rng.uniform(0.7, 1.3)
        if face == 's':
            c, s = (a, -0.08, z), (1.0, 0.35, 1.0)
        elif face == 'n':
            c, s = (a, ly + 0.08, z), (1.0, 0.35, 1.0)
        elif face == 'w':
            c, s = (-0.08, a, z), (0.35, 1.0, 1.0)
        else:
            c, s = (lx + 0.08, a, z), (0.35, 1.0, 1.0)
        blob(P, rng.choice(mats), c, r, *s, rng=rng, jit=0.3)


def tree_x(P, x, y, z, h, species, rng, fol=None):
    """kit.tree plus 'canopy' (broad multi-blob crown) and 'weeping' (drooping curtain) species."""
    fol = fol or rng.choice(P.style.foliage)
    if species == 'canopy':
        P.cyl('bark', (x, y, z), (x, y, z + h * 0.55), 0.09 * h / 4 + 0.1, n=6)
        for k in range(3):
            a = rng.uniform(0, 2 * math.pi)
            P.strut('bark', (x, y, z + h * 0.45), (x + math.cos(a) * h * 0.25, y + math.sin(a) * h * 0.25, z + h * 0.7), 0.05 * h / 4 + 0.05)
        for k in range(rng.randint(4, 7)):
            a = rng.uniform(0, 2 * math.pi); d = rng.uniform(0, h * 0.32)
            r = h * rng.uniform(0.2, 0.3)
            blob(P, rng.choice(P.style.foliage), (x + math.cos(a) * d, y + math.sin(a) * d, z + h * rng.uniform(0.65, 0.85)),
                 r, 1.15, 1.15, 0.72, rng, 0.2)
    elif species == 'weeping':
        P.cyl('bark', (x, y, z), (x, y, z + h * 0.6), 0.08 * h / 4 + 0.06, n=5)
        blob(P, fol, (x, y, z + h * 0.78), h * 0.3, 1.1, 1.1, 0.7, rng, 0.2)
        for k in range(10):
            a = 2 * math.pi * k / 10 + rng.uniform(-0.2, 0.2)
            rr = h * 0.3
            strand(P, [fol], x + math.cos(a) * rr, y + math.sin(a) * rr, z + h * 0.72, h * rng.uniform(0.35, 0.6), rng,
                   leaf=h * 0.05 + 0.1)
    else:
        KIT.tree(P, x, y, z, h, species, rng)


def b_roofgarden(P):
    """Lush roof on top of a slab at local z=0.  params: trees (count per 100 m2, 1.2), tree_h [lo,hi], big (fraction of
    canopy trees), weeping, border (shrub border width), lawn, path, soil_h, edge_vines (trailing plants over the edges:
    sides string), vine_len [lo,hi]."""
    lx, ly = P.lx, P.ly
    rng = P.rng
    sh = P.g('soil_h', 0.5)
    P.raw_box('planter', 0, 0, 0, lx, ly, sh)
    P.raw_box(P.g('surface', 'grass'), 0.25, 0.25, sh, lx - 0.25, ly - 0.25, sh + 0.12)
    z = sh + 0.12
    if P.g('path', True) and min(lx, ly) > 8:
        if lx > ly:
            yy = rng.uniform(ly * 0.35, ly * 0.55)
            P.raw_box('paving', 0.25, yy, z - 0.1, lx - 0.25, yy + 1.8, z + 0.02)
        else:
            xx = rng.uniform(lx * 0.35, lx * 0.55)
            P.raw_box('paving', xx, 0.25, z - 0.1, xx + 1.8, ly - 0.25, z + 0.02)
    bw = P.g('border', 1.2)
    if bw:
        for (x0, y0, x1, y1) in ((0.3, 0.3, lx - 0.3, 0.3 + bw), (0.3, ly - 0.3 - bw, lx - 0.3, ly - 0.3),
                                 (0.3, 0.3, 0.3 + bw, ly - 0.3), (lx - 0.3 - bw, 0.3, lx - 0.3, ly - 0.3)):
            L = max(x1 - x0, y1 - y0)
            n = max(1, int(L / 1.1))
            for i in range(n):
                t = (i + 0.5) / n
                bx = x0 + (x1 - x0) * t if (x1 - x0) >= (y1 - y0) else (x0 + x1) / 2
                by = y0 + (y1 - y0) * t if (y1 - y0) > (x1 - x0) else (y0 + y1) / 2
                blob(P, rng.choice(P.style.foliage), (bx, by, z + 0.35), rng.uniform(0.55, 0.95), 1.0, 1.0, 0.75, rng, 0.25)
    nt = int(lx * ly / 100.0 * P.g('trees', 1.2))
    lo, hi = P.g('tree_h', [4.0, 9.0])
    for i in range(nt):
        x, y = rng.uniform(1.5, lx - 1.5), rng.uniform(1.5, ly - 1.5)
        r = rng.random()
        if r < P.g('big', 0.25):
            sp = 'canopy'
        elif r < P.g('big', 0.25) + P.g('weeping', 0.08):
            sp = 'weeping'
        else:
            sp = rng.choice(P.style.trees)
        tree_x(P, x, y, z, rng.uniform(lo, hi) * (1.3 if sp == 'canopy' else 1.0), sp, rng)
    ev = P.g('edge_vines', '')
    if ev:
        vl = P.g('vine_len', [2.0, 6.0])
        for s in ev:
            (a, b, o) = _edge_points(P, s, 0.2)
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            n = int(L * P.g('vine_density', 0.9))
            for i in range(n):
                t = (i + rng.uniform(0.1, 0.9)) / n
                x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
                strand(P, ['ivy', 'ivy2', 'foliage', 'vine_light'], x + o[0] * 0.35, y + o[1] * 0.35, sh, rng.uniform(*vl), rng,
                       (o[0] * 0.02, o[1] * 0.02), flower=P.g('flower', 0.0))


def b_edgeplanter(P):
    """Planter trough along local x on a ledge; shrubs; trailing plants down the local -y face.
    params: ph (planter height), vine_len [lo,hi], density, flower."""
    lx, ly = P.lx, P.ly
    rng = P.rng
    ph = P.g('ph', 0.8)
    KIT.planter(P, 0, 0, lx, ly, 0.0, h=ph, bush=True)
    vl = P.g('vine_len', [1.5, 4.5])
    n = int(lx * P.g('density', 1.0))
    for i in range(n):
        x = (i + rng.uniform(0.1, 0.9)) * lx / max(1, n)
        strand(P, ['ivy', 'ivy2', 'foliage', 'vine_light'], x, -0.12, ph + 0.1, rng.uniform(*vl), rng, (0, -0.02),
               flower=P.g('flower', 0.15))


def b_bigtree(P):
    """A big canopy tree at the footprint centre; params: height, roots (n aerial roots), drop (m roots hang below z=0),
    edge (s|n|e|w: roots drape over that edge of the footprint)."""
    rng = P.rng
    h = P.g('height', 12.0)
    cx, cy = P.lx / 2, P.ly / 2
    tree_x(P, cx, cy, 0.0, h, 'canopy', rng)
    nr = P.g('roots', 0)
    edge = P.g('edge', 's')
    drop = P.g('drop', 8.0)
    for i in range(nr):
        if edge == 's':
            ex, ey, ox, oy = rng.uniform(0.5, P.lx - 0.5), 0.0, 0, -1
        elif edge == 'n':
            ex, ey, ox, oy = rng.uniform(0.5, P.lx - 0.5), P.ly, 0, 1
        elif edge == 'w':
            ex, ey, ox, oy = 0.0, rng.uniform(0.5, P.ly - 0.5), -1, 0
        else:
            ex, ey, ox, oy = P.lx, rng.uniform(0.5, P.ly - 0.5), 1, 0
        L = drop * rng.uniform(0.4, 1.0)
        pts = [(cx, cy, 0.3), ((cx + ex) / 2, (cy + ey) / 2, 0.25), (ex + ox * 0.3, ey + oy * 0.3, 0.0),
               (ex + ox * 0.5, ey + oy * 0.5, -L * 0.3), (ex + ox * 0.4 + rng.uniform(-0.5, 0.5), ey + oy * 0.4, -L)]
        path = PT.catmull(pts, step=0.5)
        N = len(path)
        prims.sweep(P, 'root', path, prims.circle(rng.uniform(0.1, 0.22), 5), mode='pt', scale=lambda ii, N=N: 1.0 - 0.7 * ii / N)


BUILDERS = {'vines': b_vines, 'roots': b_roots, 'ivy': b_ivy, 'roofgarden': b_roofgarden, 'edgeplanter': b_edgeplanter,
            'bigtree': b_bigtree}


def register(kit):
    global KIT
    KIT = kit
