"""
parts_scale.py - parts for km-scale scenes (Blender side).

  scatter     geometry-nodes instances of a prototype (params: key, proto (inline parts) or meta.protos[key],
              pts [[x, y, z, yaw_deg, s], ...] in local metres)
  megasweep   a 2D profile swept along a path (ridges, slabs, monuments, walls at km scale)
  megaprism   a polygon extruded between two heights (plan outline, CCW), optional per-ring inset (batter)
  clouds      a cloud layer: clusters of flattened faceted blobs at an altitude
  town        a small settlement generated in the footprint (the usual prototype): houses of mixed height on terraces,
              lanes, a plaza, trees, pitched or flat roofs, optional domes (Santorini) and cliff-hugging stacks
  citytile    a km-scale tile of towers with procedural facades (far-LOD city)
  forestpatch a clump of trees scaled for km views
  caldera     a square megablock with a terraced circular pit; cliff alcoves (Mesa Verde) cut into the walls
"""
import math
import random

import paths as PT
import prims

KIT = None


def b_scatter(P):
    import kitscale
    key = P.g('key')
    pos, rot, scl = [], [], []
    base_yaw = [0.0, math.pi / 2, math.pi, 3 * math.pi / 2][P.rot]
    for q in P.g('pts', []):
        x, y, z = q[0], q[1], q[2]
        yaw = math.radians(q[3]) if len(q) > 3 else 0.0
        s = q[4] if len(q) > 4 else 1.0
        pos.append(P.xf((x, y, z)))
        rot.append((0.0, 0.0, yaw + base_yaw))
        scl.append((s, s, s * (q[5] if len(q) > 5 else 1.0)))
    kitscale.INSTANCES.append(dict(key=key, parts=P.g('proto'), pos=pos, rot=rot, scl=scl))


def b_megasweep(P):
    pts = [tuple(p) for p in P.g('path')]
    prof = [tuple(p) for p in P.g('profile')]
    step = P.g('step', 0)
    if step:
        pts = PT.resample(pts, step)
    if P.g('fillet'):
        pts = PT.resample(PT.fillet(pts, P.g('fillet'), 12), step or 50.0)
    prims.sweep(P, P.mat or 'mega_step', pts, prof, mode=P.g('mode', 'up'))


def b_megaprism(P):
    """params: outline [[x, y], ...] CCW local m, z0, z1 (local m), inset (m at the top, all sides), mat."""
    ol = [tuple(p) for p in P.g('outline')]
    z0, z1 = P.g('z0', 0.0), P.g('z1', P.lz)
    ins = P.g('inset', 0.0)
    if ins:
        cx = sum(p[0] for p in ol) / len(ol); cy = sum(p[1] for p in ol) / len(ol)
        top = []
        for (x, y) in ol:
            dx, dy = x - cx, y - cy
            L = math.hypot(dx, dy) or 1.0
            top.append((x - dx / L * ins, y - dy / L * ins))
    else:
        top = ol
    prims.loft(P, P.mat or 'mega_step', [[(x, y, z0) for x, y in ol], [(x, y, z1) for x, y in top]])


def b_clouds(P):
    """params: n, size [lo, hi] (m), flat (z squash), clump (blobs per cloud), mat."""
    rng = P.rng
    lx, ly, lz = P.lx, P.ly, P.lz
    lo, hi = P.g('size', [300.0, 900.0])
    av = P.g('avoid')
    for i in range(P.g('n', 40)):
        cx, cy = rng.uniform(0, lx), rng.uniform(0, ly)
        cz = rng.uniform(0, lz)
        s = rng.uniform(lo, hi)
        if av:
            wx, wy, _ = P.xf((cx, cy, 0.0))
            if math.hypot(wx - av[0], wy - av[1]) < av[2] + s:
                continue
        for k in range(P.g('clump', 5)):
            ox, oy = rng.gauss(0, s * 0.45), rng.gauss(0, s * 0.3)
            r = s * rng.uniform(0.35, 0.6)
            vs = []
            for p in KIT.ICO_V:
                j = 1.0 + rng.uniform(-0.12, 0.12)
                z = p[2] * r * P.g('flat', 0.32) * j
                vs.append((cx + ox + p[0] * r * j, cy + oy + p[1] * r * j * 0.8, cz + max(z, -r * 0.05)))
            P.poly(vs, KIT.ICO_F, P.mat or 'cloud')


WALLS = ('town_white', 'town_white', 'town_ochre', 'town_terra', 'town_grey')


def house(P, x, y, z, w, d, h, rng, walls=WALLS, roof='mix', dome=0.0):
    m = rng.choice(walls)
    P.raw_box(m, x, y, z, x + w, y + d, z + h)
    r = roof if roof != 'mix' else rng.choice(('flat', 'flat', 'pitch'))
    if r == 'pitch':
        rm = rng.choice(('roof_terra', 'roof_terra', 'roof_slate'))
        if w >= d:
            prims.prism3(P, rm, [(x - 0.3, y - 0.3, z + h), (x - 0.3, y + d + 0.3, z + h), (x - 0.3, y + d / 2, z + h + d * 0.4)], (w + 0.6, 0, 0))
        else:
            prims.prism3(P, rm, [(x - 0.3, y - 0.3, z + h), (x + w + 0.3, y - 0.3, z + h), (x + w / 2, y - 0.3, z + h + w * 0.4)], (0, d + 0.6, 0))
    else:
        P.raw_box(m, x - 0.15, y - 0.15, z + h, x + w + 0.15, y + d + 0.15, z + h + 0.6)
        if dome and rng.random() < dome:
            P.ico('dome_blue', (x + w / 2, y + d / 2, z + h + 0.6), min(w, d) * 0.32, sz=0.9)


def b_town(P):
    """Settlement in the footprint: params n (houses), rows (terraces stepping up along local +y), step (m per row),
    lanes, trees, plaza, walls, roof, dome, hi (storeys range), cliff (bool: stacks against the back edge)."""
    lx, ly = P.lx, P.ly
    rng = P.rng
    rows = P.g('rows', 1)
    step = P.g('step', 0.0)
    walls = P.g('walls', list(WALLS))
    n = P.g('n', 30)
    lo, hi = P.g('hi', [1, 3])
    dome = P.g('dome', 0.0)
    roof = P.g('roof', 'mix')
    rh = ly / rows
    for r in range(rows):
        zb = r * step
        y0 = r * rh
        if step:
            P.raw_box(P.g('base_mat', 'bconc_light'), 0, y0, zb - step if r else -0.5, lx, y0 + rh, zb)
        k = n // rows
        x = rng.uniform(0, 3)
        while x < lx - 4 and k > 0:
            w = rng.uniform(5.0, 11.0)
            d = min(rh - 3.0, rng.uniform(6.0, 11.0))
            if d < 3:
                break
            hh = rng.randint(lo, hi) * 3.2
            yy = y0 + rng.uniform(0.5, max(0.6, rh - d - 2.5))
            house(P, x, yy, zb, w, d, hh, rng, walls, roof, dome)
            x += w + rng.choice((0.0, 0.0, 1.5, 3.0, 6.0))
            k -= 1
        for t in range(P.g('trees', 3)):
            KIT.tree(P, rng.uniform(1, lx - 1), rng.uniform(y0 + 1, y0 + rh - 1), zb, rng.uniform(4, 8), None, rng)
    if P.g('plaza'):
        P.raw_box('paving', lx * 0.35, 0.5, -0.4, lx * 0.65, min(ly, 16), 0.05)


def b_citytile(P):
    """km-scale city tile: n x n towers with procedural facades; params n, hmin, hmax, fmats, podium."""
    lx, ly = P.lx, P.ly
    rng = P.rng
    n = P.g('n', 6)
    g = P.g('gap', 0.25)
    cw, cd = lx / n, ly / n
    fm = P.g('fmats', ['city_far', 'fac_conc', 'fac_white', 'city_far'])
    for i in range(n):
        for j in range(n):
            if rng.random() < P.g('holes', 0.1):
                continue
            h = rng.uniform(P.g('hmin', 30), P.g('hmax', 160))
            x0, y0 = i * cw + cw * g / 2, j * cd + cd * g / 2
            P.raw_box(rng.choice(fm), x0, y0, 0, x0 + cw * (1 - g), y0 + cd * (1 - g), h)


def b_forestpatch(P):
    """A clump of trees for km views (few big primitives): params n, size [lo, hi] (m)."""
    rng = P.rng
    lx, ly = P.lx, P.ly
    lo, hi = P.g('size', [12.0, 22.0])
    for i in range(P.g('n', 12)):
        x, y = rng.uniform(0, lx), rng.uniform(0, ly)
        h = rng.uniform(lo, hi)
        fol = rng.choice(P.style.foliage)
        if rng.random() < P.g('conifer', 0.3):
            P.cone(fol, (x, y, 0), h * 0.3, h, n=5, phase=rng.uniform(0, 1))
        else:
            P.ico(fol, (x, y, h * 0.55), h * 0.4, rng, 0.2, sz=0.85)


def b_caldera(P):
    """Square megablock with a terraced circular pit.  params: R (top radius), bands (list of [height, step_in]),
    n (angular segments, multiple of 8), alcoves (per band: count), alcove [depth, height], mat, fill_mat, lake."""
    lx, ly, lz = P.lx, P.ly, P.lz
    cx, cy = lx / 2, ly / 2
    h = min(lx, ly) / 2
    n = P.g('n', 64)
    R = P.g('R', h * 0.6)
    bands = P.g('bands', [[lz / 4, 60.0]] * 4)
    m = P.mat or 'mega_step'
    fm = P.g('fill_mat', m)
    rng = P.rng
    ad, ah = P.g('alcove', [40.0, 25.0])
    z = lz
    r = R
    alc = []
    for bi, (bh, sin) in enumerate(bands):
        z0, z1 = z - bh, z
        na = P.g('alcoves', [0] * len(bands))[bi] if bi < len(P.g('alcoves', [])) else 0
        pick = set(rng.sample(range(n), min(n, na))) if na else set()
        for i in range(n):
            a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            c0, s0, c1, s1 = math.cos(a0), math.sin(a0), math.cos(a1), math.sin(a1)
            q0 = h / max(abs(c0), abs(s0)); q1 = h / max(abs(c1), abs(s1))

            def wedge(ri, za, zb, mat):
                P.hexa(mat, [(cx + ri * c0, cy + ri * s0, za), (cx + q0 * c0, cy + q0 * s0, za), (cx + q1 * c1, cy + q1 * s1, za),
                             (cx + ri * c1, cy + ri * s1, za), (cx + ri * c0, cy + ri * s0, zb), (cx + q0 * c0, cy + q0 * s0, zb),
                             (cx + q1 * c1, cy + q1 * s1, zb), (cx + ri * c1, cy + ri * s1, zb)])
            if i in pick and bh > ah * 1.6:
                za = z0 + bh * rng.uniform(0.25, 0.55)
                wedge(r, z0, za, m)
                wedge(r + ad, za, za + ah, m)
                wedge(r, za + ah, z1, m)
                am = (a0 + a1) / 2
                alc.append((cx + (r + ad * 0.55) * math.cos(am), cy + (r + ad * 0.55) * math.sin(am), za, am))
            else:
                wedge(r, z0, z1, m)
        z = z0
        r = max(10.0, r - sin)
    # floor + lake
    P.raw_box(fm, 0, 0, z - 20, lx, ly, z)
    if P.g('lake', True):
        P.cyl('lake', (cx, cy, z - 1), (cx, cy, z + 2), r * 0.9, n=48)
    # cliff dwellings in the alcoves
    for (x, y, za, am) in alc:
        tx, ty = -math.sin(am), math.cos(am)
        for k in range(rng.randint(4, 8)):
            off = rng.uniform(-ad * 0.5, ad * 0.5)
            w, d = rng.uniform(4, 8), rng.uniform(4, 7)
            hx = x + tx * off + math.cos(am) * rng.uniform(-6, 6)
            hy = y + ty * off + math.sin(am) * rng.uniform(-6, 6)
            house(P, hx - w / 2, hy - d / 2, za, w, d, rng.choice((3.2, 6.4, 9.6)), rng, ('town_ochre', 'town_terra', 'k_cream'), 'flat', 0)
    P._alcoves = alc


def b_cwedge(P):
    """Faceted cast wedge: a buttress leaning on a wall at the local +y side (or, with flip, a bracket under a shelf),
    with its sloped face broken into two facets (the cast / hewn look)."""
    w, d, h = P.lx, P.ly, P.lz
    m = P.mat or 'mega_conc'
    if P.g('flip'):
        tri = [(0.0, d, 0.0), (0.0, d, h), (0.0, 0.0, h)]
    else:
        tri = [(0.0, 0.0, 0.0), (0.0, d, 0.0), (0.0, d, h)]
    prims.prism3(P, m, tri, (w, 0.0, 0.0))
    # a second facet: a thinner, steeper wedge proud of the first
    k = 0.55
    if P.g('flip'):
        tri2 = [(w * 0.2, d, h * (1 - k)), (w * 0.2, d, h), (w * 0.2, d * (1 - k * 1.2), h)]
    else:
        tri2 = [(w * 0.2, d * (1 - k), 0.0), (w * 0.2, d, 0.0), (w * 0.2, d, h * 1.08)]
    prims.prism3(P, m, tri2, (w * 0.6, 0.0, 0.0))


def b_umbrella(P):
    cx, cy, h = P.lx / 2, P.ly / 2, P.lz
    P.cyl('steel_light', (cx, cy, 0), (cx, cy, h), 0.04, n=5)
    P.cone(P.mat or 'cloth_a', (cx, cy, h - 0.55), min(P.lx, P.ly) / 2, 0.6, n=8)


BUILDERS = {'cwedge': b_cwedge, 'umbrella': b_umbrella, 'scatter': b_scatter, 'megasweep': b_megasweep, 'megaprism': b_megaprism, 'clouds': b_clouds, 'town': b_town,
            'citytile': b_citytile, 'forestpatch': b_forestpatch, 'caldera': b_caldera}


def register(kit):
    global KIT
    KIT = kit
