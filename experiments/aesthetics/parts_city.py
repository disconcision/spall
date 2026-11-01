"""
parts_city.py - towers, superblocks and landscape (Blender side).

Facades use the procedural window materials (fac_*), so a whole city costs a few boxes per tower; detail levels add
geometry only where the camera will look.

  tower       one tower: setback segments with corner treatment, crown, style details
  superblock  podium + n x n towers in one of three styles ('dys' dystopian, 'brut' overgrown brutalist, 'solar'),
              detail 0 (far) .. 2 (close: bridges, signs, terraces, vines, spinners, walkways)
  terrain     heightfield diorama tile (terrain.Field) with strata skirts
  forest      trees scattered on the terrain by a clustered mask
  village     small gabled houses on the terrain
  spinners    flying vehicles with lights in a volume
"""
import math
import random

import paths as PT
import prims
import terrain as TR

KIT = None

STY = {
    'dys': dict(fmats=['fac_dark', 'fac_dark2', 'fac_dark'], roof='roof_dark', podium='fac_dark2', corner=('chamfer', 0.05),
                crown=('clutter', 'antenna', 'clutter', 'step'), accent='holo'),
    'brut': dict(fmats=['fac_conc', 'fac_conc2', 'fac_conc'], roof='roof_conc', podium='fac_conc2', corner=('chamfer', 0.14),
                 crown=('garden', 'step', 'garden', 'hewn'), accent='green'),
    'solar': dict(fmats=['fac_white', 'fac_timber', 'fac_white', 'fac_glass'], roof='roof_white', podium='fac_white', corner=('round', 0.16),
                  crown=('solar', 'garden', 'turbine', 'solar'), accent='sky'),
}


def _seg(P, mat, x0, y0, z0, x1, y1, z1, mode, c, top):
    if c > 0.05:
        prims.cbox(P, mat, x0, y0, z0, x1, y1, z1, v=c, top=top, mode=mode, seg=3)
    else:
        P.raw_box(mat, x0, y0, z0, x1, y1, z1)


def tower(P, x0, y0, z0, w, d, h, style, detail, rng, fmat=None):
    S = STY[style]
    fm = fmat or rng.choice(S['fmats'])
    mode, k = S['corner']
    c = min(w, d) * k * rng.uniform(0.7, 1.3)
    segs = []
    # setbacks: 1-3 segments
    z = z0
    ww, dd, ox, oy = w, d, x0, y0
    nseg = rng.choice((1, 1, 2, 2, 3))
    fr = sorted(rng.uniform(0.55, 0.92) for _ in range(nseg - 1)) + [1.0]
    for i, f in enumerate(fr):
        zt = z0 + h * f
        tc = c * 0.5 if style != 'dys' else c * 0.25
        if style == 'brut' and i == len(fr) - 1:
            tc = min(ww, dd) * 0.18
        _seg(P, fm, ox, oy, z, ox + ww, oy + dd, zt, mode, c, tc if i == len(fr) - 1 else 0.0)
        segs.append((ox, oy, z, ox + ww, oy + dd, zt))
        if i < len(fr) - 1:
            sx, sy = ww * rng.uniform(0.08, 0.2), dd * rng.uniform(0.08, 0.2)
            ox += sx * rng.uniform(0.3, 1.0); oy += sy * rng.uniform(0.3, 1.0)
            ww -= sx * 1.6; dd -= sy * 1.6
            c *= 0.8
            if detail >= 1 and style in ('brut', 'solar'):
                # setback terrace with trees
                import parts_green as PG
                for q in range(int(ww * dd / 120) + 1):
                    KIT.tree(P, rng.uniform(ox - sx * 0.5, ox + ww), rng.uniform(oy - sy * 0.5, oy), zt, rng.uniform(4, 8), None, rng)
        z = zt
    # crown
    x0c, y0c, _, x1c, y1c, zt = segs[-1]
    cw, cd = x1c - x0c, y1c - y0c
    cr = rng.choice(S['crown'])
    if detail >= 0:
        if cr == 'clutter' or style == 'dys':
            for q in range(rng.randint(2, 5)):
                bw, bd = cw * rng.uniform(0.12, 0.35), cd * rng.uniform(0.12, 0.35)
                bx, by = rng.uniform(x0c + c, x1c - c - bw), rng.uniform(y0c + c, y1c - c - bd)
                P.raw_box(S['roof'], bx, by, zt, bx + bw, by + bd, zt + rng.uniform(2.0, 7.0))
            if rng.random() < 0.5:
                ax, ay = rng.uniform(x0c + cw * 0.3, x1c - cw * 0.3), rng.uniform(y0c + cd * 0.3, y1c - cd * 0.3)
                ah = rng.uniform(12, 40)
                P.cyl('steel_dark', (ax, ay, zt), (ax, ay, zt + ah), 0.5, n=6, r1=0.2)
                P.ico('beacon', (ax, ay, zt + ah + 0.4), 0.9)
                if detail >= 1:
                    P.light((ax, ay, zt + ah + 1.5), (1.0, 0.15, 0.08), 3000, 0.3)
        if cr == 'garden' and detail >= 1:
            import parts_green as PG
            P.raw_box('grass', x0c + c * 0.7, y0c + c * 0.7, zt, x1c - c * 0.7, y1c - c * 0.7, zt + 0.5)
            for q in range(int(cw * cd / 90) + 2):
                sp = 'canopy' if rng.random() < 0.3 else None
                PG.tree_x(P, rng.uniform(x0c + c + 2, x1c - c - 2), rng.uniform(y0c + c + 2, y1c - c - 2), zt + 0.5,
                          rng.uniform(5, 10), sp or rng.choice(P.style.trees), rng)
        elif cr == 'garden':
            P.raw_box('foliage3' if style == 'brut' else 'grass', x0c + c * 0.7, y0c + c * 0.7, zt, x1c - c * 0.7, y1c - c * 0.7, zt + 1.5)
        elif cr == 'solar':
            n = max(1, int(cw / 4.0))
            for q in range(n):
                xa = x0c + c * 0.6 + q * (cw - c * 1.2) / n
                P.hexa('solar', [(xa, y0c + c, zt + 0.5), (xa + (cw - c * 1.2) / n - 0.5, y0c + c, zt + 0.5),
                                 (xa + (cw - c * 1.2) / n - 0.5, y1c - c, zt + 2.2), (xa, y1c - c, zt + 2.2),
                                 (xa, y0c + c, zt + 0.7), (xa + (cw - c * 1.2) / n - 0.5, y0c + c, zt + 0.7),
                                 (xa + (cw - c * 1.2) / n - 0.5, y1c - c, zt + 2.4), (xa, y1c - c, zt + 2.4)])
        elif cr == 'turbine':
            cx, cy = (x0c + x1c) / 2, (y0c + y1c) / 2
            th = min(cw, cd) * 0.9
            P.cyl('white_paint', (cx, cy, zt), (cx, cy, zt + th), 0.5, n=8, r1=0.3)
            for q in range(3):
                a = rng.uniform(0, 1) + q * 2 * math.pi / 3
                dvec = (0, math.cos(a), math.sin(a))
                P.obox('white_paint', (cx - 0.8, cy + dvec[1] * th * 0.3, zt + th + dvec[2] * th * 0.3), dvec, (1, 0, 0),
                       PT.cross(dvec, (1, 0, 0)), th * 0.3, 0.12, 0.5)
        elif cr == 'hewn':
            import parts_concrete as PC
            prims.hewn(P, S['roof'], x0c + cw * 0.2, y0c + cd * 0.2, zt, x1c - cw * 0.2, y1c - cd * 0.2, zt + min(cw, cd) * 0.35,
                       v=min(cw, cd) * 0.06, top=min(cw, cd) * 0.05, rng=rng, n_cuts=2, depth=(0.25, 0.5))
    # style accents at detail >= 1
    if detail >= 1:
        if style == 'dys' and S['accent'] == 'holo':
            for q in range(rng.randint(0, 3)):
                face = rng.choice('se')
                hz = z0 + rng.uniform(4, min(h * 0.4, 90))
                sh = rng.uniform(8, 22); sw = rng.uniform(2.5, 6)
                mat = rng.choice(('holo_cyan', 'holo_pink', 'holo_amber', 'holo_pink'))
                if face == 's':
                    a = rng.uniform(x0 + 2, x0 + w - sw - 2)
                    P.raw_box(mat, a, y0 - 0.6, hz, a + sw, y0 - 0.3, hz + sh)
                    P.light((a + sw / 2, y0 - 4, hz + sh / 2), (1.0, 0.3, 0.7) if 'pink' in mat else (0.2, 0.9, 1.0) if 'cyan' in mat else (1, .7, .3), 3500, 1.0)
                else:
                    a = rng.uniform(y0 + 2, y0 + d - sw - 2)
                    P.raw_box(mat, x0 + w + 0.3, a, hz, x0 + w + 0.6, a + sw, hz + sh)
                    P.light((x0 + w + 4, a + sw / 2, hz + sh / 2), (1.0, 0.3, 0.7) if 'pink' in mat else (0.2, 0.9, 1.0) if 'cyan' in mat else (1, .7, .3), 3500, 1.0)
        if style == 'brut' and detail >= 2:
            import parts_green as PG
            # planted balcony bands: every ~7 floors a ledge with trailing plants on the two camera faces
            zz = z0 + 18.0
            while zz < z0 + h * fr[0] - 10:
                if rng.random() < 0.55:
                    P.raw_box(fm, x0 + c, y0 - 1.2, zz - 0.5, x0 + w - c, y0, zz)
                    for q in range(int((w - 2 * c) / 1.6)):
                        xx = x0 + c + 0.8 + q * 1.6
                        PG.strand(P, ['ivy', 'ivy2', 'foliage', 'vine_light'], xx, y0 - 0.9, zz + 0.2, rng.uniform(2, 9), rng, (0, -0.01),
                                  leaf=0.55, flower=0.05)
                zz += 3.5 * rng.choice((5, 7, 9))
        if style == 'solar' and detail >= 2:
            import parts_green as PG
            zz = z0 + 25.0
            while zz < z0 + h * fr[0] - 12:
                if rng.random() < 0.5:
                    P.raw_box('glass_green', x0 + c, y0 - 0.2, zz, x0 + w - c, y0 + 0.2, zz + 7.0)
                    for q in range(int((w - 2 * c) / 3)):
                        PG.blob(P, rng.choice(P.style.foliage), (x0 + c + 1.5 + q * 3, y0 + 1.5, zz + 2.5), 1.8, 1.0, 1.0, 1.2, rng)
                zz += 3.5 * rng.choice((6, 8, 10))
    return segs


def b_tower(P):
    tower(P, 0, 0, 0, P.lx, P.ly, P.lz, P.g('style', 'dys'), P.g('detail', 1), P.rng, P.mat)


def b_superblock(P):
    """params: n, gap (m), podium (m), hmin, hmax, style, detail, uniform (0..1), bridges (per tower pair prob),
    walk (canyon walkways at the podium top), spin (number of spinners in the gaps)."""
    lx, ly = P.lx, P.ly
    rng = P.rng
    st = P.g('style', 'dys')
    S = STY[st]
    n = P.g('n', 4)
    g = P.g('gap', 10.0)
    hp = P.g('podium', 24.0)
    det = P.g('detail', 0)
    hmin, hmax = P.g('hmin', 120.0), P.g('hmax', 260.0)
    uni = P.g('uniform', 0.6)
    base_h = rng.uniform(hmin, hmax)
    # podium (slightly inset) with a chamfered edge
    pm = P.g('podium_mat', S['podium'])
    mode, k = S['corner']
    prims.cbox(P, pm, 0, 0, 0, lx, ly, hp, v=min(lx, ly) * 0.02, top=1.0 if st != 'dys' else 0.3, mode=mode, seg=3)
    tw, td = (lx - g * (n + 1)) / n, (ly - g * (n + 1)) / n
    tops = {}
    for i in range(n):
        for j in range(n):
            if rng.random() < P.g('holes', 0.04):
                continue
            h = base_h * uni + rng.uniform(hmin, hmax) * (1 - uni)
            h *= rng.uniform(0.85, 1.12)
            fw, fd = tw * rng.uniform(0.82, 1.0), td * rng.uniform(0.82, 1.0)
            x0 = g + i * (tw + g) + (tw - fw) / 2
            y0 = g + j * (td + g) + (td - fd) / 2
            tower(P, x0, y0, hp, fw, fd, h, st, det, rng)
            tops[(i, j)] = (x0, y0, fw, fd, hp + h)
    if det >= 1:
        # sky bridges between neighbours
        bm = S['fmats'][0]
        for (i, j), (x0, y0, fw, fd, zt) in tops.items():
            for (di, dj) in ((1, 0), (0, 1)):
                o = tops.get((i + di, j + dj))
                if not o or rng.random() > P.g('bridges', 0.35):
                    continue
                zb = hp + rng.uniform(20, min(zt, o[4]) - hp - 20) if min(zt, o[4]) - hp > 45 else None
                if zb is None:
                    continue
                if di:
                    yc = max(y0, o[1]) + rng.uniform(2, max(3, min(fd, o[3]) - 8))
                    P.raw_box(bm, x0 + fw - 1, yc, zb, o[0] + 1, yc + 5, zb + 4.5)
                else:
                    xc = max(x0, o[0]) + rng.uniform(2, max(3, min(fw, o[2]) - 8))
                    P.raw_box(bm, xc, y0 + fd - 1, zb, xc + 5, o[1] + 1, zb + 4.5)
    if det >= 2 and P.g('walk', True):
        # canyon-floor walkways and lights on the podium top
        for i in range(1, n):
            x = i * (tw + g) + g / 2
            P.raw_box('bconc_dark' if st == 'dys' else 'paving', x - 2.0, 0, hp, x + 2.0, ly, hp + 0.3)
            for q in range(int(ly / 12)):
                P.light((x, q * 12 + 6, hp + 3), (1.0, 0.7, 0.4) if st == 'dys' else (1.0, 0.9, 0.7), 400, 0.5)
        for j in range(1, n):
            y = j * (td + g) + g / 2
            P.raw_box('bconc_dark' if st == 'dys' else 'paving', 0, y - 2.0, hp, lx, y + 2.0, hp + 0.3)
    for q in range(P.g('spin', 0)):
        # flying vehicles: in the gaps between towers
        i = rng.randrange(1, n) if n > 1 else 0
        x = i * (tw + g) + g / 2 + rng.uniform(-2, 2)
        y = rng.uniform(0, ly)
        z = hp + rng.uniform(8, 120)
        if rng.random() < 0.5:
            x, y = y, x
        P.raw_box('spinner', x - 1.2, y - 2.2, z, x + 1.2, y + 2.2, z + 1.1)
        P.raw_box('taillight', x - 0.8, y - 2.3, z + 0.3, x + 0.8, y - 2.2, z + 0.6)
        P.light((x, y, z - 1.5), (1.0, 0.85, 0.6), 250, 0.2)


# ------------------------------------------------------------------------------------------------ landscape
def _field(P):
    f = P.g('field', {})
    return TR.Field(seed=f.get('seed', 3), amp=f.get('amp', 90.0), scale=f.get('scale', 1400.0), base=f.get('base', -8.0),
                    river=[tuple(p) for p in f.get('river', [])], flats=[tuple(q) for q in f.get('flats', [])],
                    river_w=f.get('river_w', 90.0), river_depth=f.get('river_depth', 14.0))


def b_terrain(P):
    """Heightfield diorama tile over the footprint.  params: field (terrain.Field kwargs, in the part's local metres),
    res (m), bottom (z of the slab underside), mat."""
    lx, ly = P.lx, P.ly
    F = _field(P)
    res = P.g('res', 25.0)
    nx, ny = max(2, int(lx / res)), max(2, int(ly / res))
    H = [[F.height(lx * i / nx, ly * j / ny) for i in range(nx + 1)] for j in range(ny + 1)]
    verts = []
    for j in range(ny + 1):
        for i in range(nx + 1):
            verts.append((lx * i / nx, ly * j / ny, H[j][i]))
    faces = []
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    P.poly(verts, faces, P.mat or 'terrain')
    bot = P.g('bottom', -80.0)
    # skirts
    sk = P.g('skirt_mat', 'poche_earth')
    for (pts) in ([(lx * i / nx, 0.0, H[0][i]) for i in range(nx + 1)],
                  [(lx, ly * j / ny, H[j][nx]) for j in range(ny + 1)],
                  [(lx * i / nx, ly, H[ny][i]) for i in range(nx, -1, -1)],
                  [(0.0, ly * j / ny, H[j][0]) for j in range(ny, -1, -1)]):
        vs = list(pts) + [(p[0], p[1], bot) for p in pts]
        m = len(pts)
        fs = [(i + m, i + 1 + m, i + 1, i) for i in range(m - 1)]
        P.poly(vs, fs, sk)
    P.poly([(0, 0, bot), (lx, 0, bot), (lx, ly, bot), (0, ly, bot)], [(0, 3, 2, 1)], sk)


def b_forest(P):
    """params: field (same as terrain), density (trees per hectare in a full cluster), avoid [[x0,y0,x1,y1],...],
    zmin, zmax, size [lo,hi], mask (noise scale m), cover (0..1)."""
    lx, ly = P.lx, P.ly
    F = _field(P)
    rng = P.rng
    dens = P.g('density', 18.0)
    step = 100.0 / math.sqrt(dens)
    avoid = P.g('avoid', [])
    lo, hi = P.g('size', [9.0, 16.0])
    zmin, zmax = P.g('zmin', 1.0), P.g('zmax', 140.0)
    ms = P.g('mask', 700.0)
    cover = P.g('cover', 0.5)
    y = step / 2
    while y < ly:
        x = step / 2
        while x < lx:
            px, py = x + rng.uniform(-0.45, 0.45) * step, y + rng.uniform(-0.45, 0.45) * step
            mval = TR.fbm((px + P.X0) / ms, (py + P.Y0) / ms, 77, 3)
            if mval > 1.0 - cover and not any(a <= px + P.X0 <= c and b <= py + P.Y0 <= d for a, b, c, d in avoid):
                z = F.height(px + P.g('fx', 0.0), py + P.g('fy', 0.0))
                if zmin < z < zmax:
                    h = rng.uniform(lo, hi)
                    fol = rng.choice(P.style.foliage)
                    if rng.random() < P.g('conifer', 0.35):
                        P.cyl('bark', (px, py, z), (px, py, z + h * 0.3), h * 0.03, n=4)
                        P.cone(fol, (px, py, z + h * 0.2), h * 0.28, h * 0.85, n=5, phase=rng.uniform(0, 1))
                    else:
                        P.cyl('bark', (px, py, z), (px, py, z + h * 0.45), h * 0.03, n=4)
                        P.ico(fol, (px, py, z + h * 0.62), h * 0.33, rng, 0.2, sz=0.85)
            x += step
        y += step


def b_village(P):
    """Gabled houses at params.points [[x,y],...] (local m) on the terrain; params: field, size [lo,hi], roofs, walls."""
    F = _field(P)
    rng = P.rng
    walls = P.g('walls', ['k_cream', 'k_pink', 'concrete_light', 'k_tile'])
    roofs = P.g('roofs', ['accent_a', 'concrete_dark', 'accent_a', 'k_grey'])
    for (x, y) in P.g('points', []):
        z = F.height(x + P.g('fx', 0.0), y + P.g('fy', 0.0))
        w, d = rng.uniform(*P.g('size', [7.0, 12.0])), rng.uniform(6.0, 9.0)
        hh = rng.choice((3.0, 3.0, 6.0))
        a = rng.choice((0, 1))
        if a:
            w, d = d, w
        P.raw_box(rng.choice(walls), x - w / 2, y - d / 2, z - 1.0, x + w / 2, y + d / 2, z + hh)
        rm = rng.choice(roofs)
        if w > d:
            prims.prism3(P, rm, [(x - w / 2 - 0.3, y - d / 2 - 0.4, z + hh), (x - w / 2 - 0.3, y + d / 2 + 0.4, z + hh),
                                 (x - w / 2 - 0.3, y, z + hh + d * 0.45)], (w + 0.6, 0, 0))
        else:
            prims.prism3(P, rm, [(x - w / 2 - 0.4, y - d / 2 - 0.3, z + hh), (x + w / 2 + 0.4, y - d / 2 - 0.3, z + hh),
                                 (x, y - d / 2 - 0.3, z + hh + w * 0.45)], (0, d + 0.6, 0))


BUILDERS = {'tower': b_tower, 'superblock': b_superblock, 'terrain': b_terrain, 'forest': b_forest, 'village': b_village}


def register(kit):
    global KIT
    KIT = kit
