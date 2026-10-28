"""
parts_slope.py - large-scale diagonals at grid-rational slopes (Blender side).

Slopes are given as grid ratios [run_cells, rise_levels] (cell 4 m, level 3.5 m by default) so they stay representable
as rational-slope cells and read as clean lines in 2:1 pixel isometric.  1:1 = one cell in per level up.

  earth2     ground block minus voids: boxes, sheared boxes (inclined shafts) and battered boxes (sloped walls);
             decomposed into convex column pieces so crops cap it with strata
  slopemass  battered block: any side may slope at a rational ratio; smooth or stepped (terraced) variants;
             optional window bands / slots along the slope, planted steps
  incline    inclined megastructure plane: thick slab rising along local x at a rational slope, on piers, carrying
             stepped housing units, a smooth plaza or a road
  ibore      inclined bore from A to B: rock fill + segmental liner (vertical end faces), with escalators,
             a funicular (rails + stepped car) or an empty shaft with light rings
"""
import math
import random

import paths as PT
import prims

KIT = None


def ratio_inset(P, r, h):
    """Horizontal inset (m) over height h (m) for a [run_cells, rise_levels] ratio."""
    run, rise = r
    return h / (rise * P.lh) * (run * P.cell)


# ------------------------------------------------------------------------------------------------ earth with sloped voids
def _void_interval(v, x, y):
    """(zlo, zhi) of void v at plan point (x, y), or None."""
    x0, y0, z0, x1, y1, z1 = v['box']
    sh = v.get('shear', (0.0, 0.0))
    bt = v.get('batter', (0.0, 0.0))
    bx, by = bt
    lo, hi = z0, z1
    H = z1 - z0
    # battered: the footprint grows by bx (x) / by (y) from the bottom to the top (negative shrinks)
    if bx or by:
        def need(dist, b):   # height above z0 at which the void reaches `dist` beyond its base edge
            return dist / b * H if b > 0 else None
        if x < x0:
            if bx <= 0 or x < x0 - bx:
                return None
            lo = max(lo, z0 + (x0 - x) / bx * H)
        elif x > x1:
            if bx <= 0 or x > x1 + bx:
                return None
            lo = max(lo, z0 + (x - x1) / bx * H)
        if y < y0:
            if by <= 0 or y < y0 - by:
                return None
            lo = max(lo, z0 + (y0 - y) / by * H)
        elif y > y1:
            if by <= 0 or y > y1 + by:
                return None
            lo = max(lo, z0 + (y - y1) / by * H)
        if bx < 0:
            ins = min(x - x0, x1 - x)
            if ins < -bx:
                hi = min(hi, z0 + ins / (-bx) * H)
        if by < 0:
            ins = min(y - y0, y1 - y)
            if ins < -by:
                hi = min(hi, z0 + ins / (-by) * H)
        if hi <= lo:
            return None
        return lo, hi
    if not (x0 - 1e-6 <= x <= x1 + 1e-6 and y0 - 1e-6 <= y <= y1 + 1e-6):
        return None
    dz = sh[0] * (x - x0) + sh[1] * (y - y0)
    return lo + dz, hi + dz


def b_earth2(P):
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'rock'
    voids = []
    for v in P.g('voids', []):
        voids.append({'box': v} if isinstance(v, (list, tuple)) else v)
    xs, ys = {0.0, lx}, {0.0, ly}
    for v in voids:
        x0, y0, z0, x1, y1, z1 = v['box']
        bx, by = v.get('batter', (0.0, 0.0))
        for c in (x0, x1, x0 - max(0, bx), x1 + max(0, bx), x0 - min(0, bx), x1 + min(0, bx)):
            if 0 < c < lx:
                xs.add(c)
        for c in (y0, y1, y0 - max(0, by), y1 + max(0, by), y0 - min(0, by), y1 + min(0, by)):
            if 0 < c < ly:
                ys.add(c)
    step = P.g('split', 0.0)
    if step:
        xs |= {k * step for k in range(1, int(lx / step)) if 0 < k * step < lx}
        ys |= {k * step for k in range(1, int(ly / step)) if 0 < k * step < ly}
    xs, ys = sorted(xs), sorted(ys)
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            xa, xb, ya, yb = xs[i], xs[i + 1], ys[j], ys[j + 1]
            xc, yc = (xa + xb) / 2, (ya + yb) / 2
            corners = ((xa, ya), (xb, ya), (xb, yb), (xa, yb))
            ivs = []
            for v in voids:
                if _void_interval(v, xc, yc) is None:
                    continue
                vals = []
                for (x, y) in corners:
                    # evaluate the void's planar bounds at the corner using the centre's active planes
                    xx = min(max(x, xa + 1e-4), xb - 1e-4)
                    yy = min(max(y, ya + 1e-4), yb - 1e-4)
                    iv = _void_interval(v, xx, yy)
                    if iv is None:
                        iv = _void_interval(v, xc, yc)
                    vals.append(iv)
                zlo = [max(0.0, min(lz, a)) for a, b in vals]
                zhi = [max(0.0, min(lz, b)) for a, b in vals]
                ivs.append((sum(zlo) / 4, zlo, zhi))
            ivs.sort(key=lambda t: t[0])
            cur = [0.0] * 4
            pieces = []
            for _, zlo, zhi in ivs:
                pieces.append((cur, zlo))
                cur = [max(c, h) for c, h in zip(cur, zhi)]
            pieces.append((cur, [lz] * 4))
            for bot, top in pieces:
                if max(t - b for t, b in zip(top, bot)) < 0.05:
                    continue
                top = [max(t, b) for t, b in zip(top, bot)]
                P.hexa(m, [(xa, ya, bot[0]), (xb, ya, bot[1]), (xb, yb, bot[2]), (xa, yb, bot[3]),
                           (xa, ya, top[0]), (xb, ya, top[1]), (xb, yb, top[2]), (xa, yb, top[3])])


# ------------------------------------------------------------------------------------------------ battered / stepped masses
def b_slopemass(P):
    """params: slopes {s,n,e,w: [run_cells, rise_levels]} (sides not listed stay vertical), stepped (bool: terraces
    of `step_levels` levels), step_levels (1), windows ('bands' | 'slots' | 'none'), plant (bool: planted steps),
    top_mat, lit."""
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'bconc'
    sl = P.g('slopes', {'s': [1, 1]})
    ins = {s: (ratio_inset(P, sl[s], lz) if s in sl else 0.0) for s in 'snew'}
    import parts_concrete as PC
    lit = P.g('lit', 0.35)
    if P.g('stepped'):
        sv = P.g('step_levels', 1)
        sh = sv * P.lh
        n = max(1, int(round(lz / sh)))
        for k in range(n):
            z0, z1 = k * sh, (k + 1) * sh
            t = k / n
            x0 = ins['w'] * t; x1 = lx - ins['e'] * t
            y0 = ins['s'] * t; y1 = ly - ins['n'] * t
            PC.cb(P, m, x0, y0, z0, x1, y1, z1, k=0.35, top=None)
            # window band in each riser that faces a sloped side
            if P.g('windows', 'bands') != 'none':
                for s in sl:
                    if s == 's':
                        P.raw_box(KIT.pick_win(P, lit), x0 + 0.8, y0 - 0.05, z0 + 0.7, x1 - 0.8, y0 + 0.05, z1 - 0.6)
                    elif s == 'e':
                        P.raw_box(KIT.pick_win(P, lit), x1 - 0.05, y0 + 0.8, z0 + 0.7, x1 + 0.05, y1 - 0.8, z1 - 0.6)
                    elif s == 'w':
                        P.raw_box(KIT.pick_win(P, lit), x0 - 0.05, y0 + 0.8, z0 + 0.7, x0 + 0.05, y1 - 0.8, z1 - 0.6)
                    elif s == 'n':
                        P.raw_box(KIT.pick_win(P, lit), x0 + 0.8, y1 - 0.05, z0 + 0.7, x1 - 0.8, y1 + 0.05, z1 - 0.6)
            if P.g('plant') and k < n - 1:
                import parts_green as PG
                t2 = (k + 1) / n
                if 's' in sl:
                    ya, yb = y0, ins['s'] * t2
                    if yb - ya > 1.2:
                        for q in range(int((x1 - x0) / 2.2)):
                            PG.blob(P, P.rng.choice(P.style.foliage), (x0 + 1.2 + q * 2.2 + P.rng.uniform(-0.4, 0.4), (ya + yb) / 2, z1 + 0.4),
                                    P.rng.uniform(0.6, 1.0), 1.0, 1.0, 0.7, P.rng)
        return
    corners = [(0.0, 0.0), (lx, 0.0), (lx, ly), (0.0, ly)]
    top = [(ins['w'], ins['s']), (lx - ins['e'], ins['s']), (lx - ins['e'], ly - ins['n']), (ins['w'], ly - ins['n'])]
    P.hexa(m, [(x, y, 0.0) for x, y in corners] + [(x, y, lz) for x, y in top])
    # stylised slot windows along each sloped face: short horizontal bands that follow the slope
    wmode = P.g('windows', 'slots')
    if wmode != 'none':
        nf = int(lz / P.lh)
        for s in sl:
            for k in range(1, nf):
                z = k * P.lh + P.lh * 0.45
                t = z / lz
                if s == 's':
                    y = ins['s'] * t
                    xa, xb = ins['w'] * t + 1.5, lx - ins['e'] * t - 1.5
                    n = max(1, int((xb - xa) / 3.2))
                    for q in range(n):
                        if P.rng.random() < 0.8:
                            a = xa + (xb - xa) * (q + 0.2) / n
                            P.raw_box(KIT.pick_win(P, lit), a, y - 0.2, z, a + (xb - xa) / n * 0.6, y + 0.12, z + 0.9)
                elif s == 'e':
                    x = lx - ins['e'] * t
                    ya, yb = ins['s'] * t + 1.5, ly - ins['n'] * t - 1.5
                    n = max(1, int((yb - ya) / 3.2))
                    for q in range(n):
                        if P.rng.random() < 0.8:
                            a = ya + (yb - ya) * (q + 0.2) / n
                            P.raw_box(KIT.pick_win(P, lit), x - 0.12, a, z, x + 0.2, a + (yb - ya) / n * 0.6, z + 0.9)


# ------------------------------------------------------------------------------------------------ inclined planes
def b_incline(P):
    """Inclined slab rising along local x.  params: ratio [run_cells, rise_levels] (overrides lz), t (slab depth),
    piers (spacing m), top 'units'|'plaza'|'road'|'none', unit_w (m), lit, pier_mat."""
    lx, ly = P.lx, P.ly
    r = P.g('ratio', [2, 1])
    H = lx / (r[0] * P.cell) * (r[1] * P.lh)
    m = P.mat or 'bconc'
    t = P.g('t', 2.5)
    z0 = P.g('z0', 0.0)
    rise = lambda x: z0 + H * x / lx
    import parts_concrete as PC
    P.hexa(m, [(0, 0, rise(0) - t), (lx, 0, rise(lx) - t), (lx, ly, rise(lx) - t), (0, ly, rise(0) - t),
               (0, 0, rise(0)), (lx, 0, rise(lx)), (lx, ly, rise(lx)), (0, ly, rise(0))])
    # edge beams (upstands) on both long sides
    for (ya, yb) in ((-0.3, 0.9), (ly - 0.9, ly + 0.3)):
        P.hexa(m, [(0, ya, rise(0) - t - 0.6), (lx, ya, rise(lx) - t - 0.6), (lx, yb, rise(lx) - t - 0.6), (0, yb, rise(0) - t - 0.6),
                   (0, ya, rise(0) + 1.1), (lx, ya, rise(lx) + 1.1), (lx, yb, rise(lx) + 1.1), (0, yb, rise(0) + 1.1)])
    ps = P.g('piers', 16.0)
    g = P.g('ground', 0.0)
    if ps:
        x = ps / 2
        while x < lx:
            zt = rise(x) - t
            if zt - g > 2.0:
                for y in (ly * 0.22, ly * 0.78):
                    PC.cb(P, P.g('pier_mat', m), x - 1.1, y - 1.1, g, x + 1.1, y + 1.1, zt, top=0.0)
            x += ps
    top = P.g('top', 'units')
    if top == 'units':
        uw = P.g('unit_w', P.cell * r[0])
        n = int(lx / uw)
        for i in range(n):
            xa = i * uw
            zb = rise(xa)
            zt = rise(xa + uw)
            hh = (zt - zb) + P.lh * P.g('unit_levels', 1)
            for (ya, yb) in P.g('rows', [[1.2, ly * 0.45], [ly * 0.55, ly - 1.2]]):
                PC.cb(P, P.g('unit_mat', 'bconc_light'), xa + 0.25, ya, zb, xa + uw - 0.25, yb, zb + hh, k=0.4)
                # glazed front on the downhill face (local -x)
                P.raw_box(KIT.pick_win(P, P.g('lit', 0.4)), xa + 0.15, ya + 0.6, zb + 0.5, xa + 0.3, yb - 0.6, zb + hh - 0.6)
                if P.rng.random() < 0.5:
                    import parts_green as PG
                    PG.blob(P, P.rng.choice(P.style.foliage), (xa + uw * 0.5, (ya + yb) / 2, zb + hh + 0.4), 0.9, 1.6, 1.0, 0.6, P.rng)
    elif top == 'plaza':
        import parts_green as PG
        for q in range(int(lx * ly / 60)):
            x, y = P.rng.uniform(2, lx - 2), P.rng.uniform(2, ly - 2)
            KIT.tree(P, x, y, rise(x), P.rng.uniform(3.5, 6.0), None)
    elif top == 'road':
        pts = [(0.0, ly / 2, rise(0) + 0.05), (lx, ly / 2, rise(lx) + 0.05)]
        prims.sweep(P, 'asphalt2', pts, prims.rect_prof(ly - 3.0, 0.06, 0.0, center=False), mode='up')


# ------------------------------------------------------------------------------------------------ inclined bores
def b_ibore(P):
    """Inclined bore from params.a to params.b (local m, rising or falling along local x).  params: R, h (square
    half-size of the rock fill), liner, n (segments), ring (m, liner ring length), content escalator|funicular|shaft,
    lights (spacing m), fill (rock material)."""
    A, Bp = tuple(P.g('a')), tuple(P.g('b'))
    R = P.g('R', 5.0)
    h = P.g('hs', R + 0.8)
    t = P.g('liner', 0.9)
    n = P.g('n', 32)
    fill = P.g('fill', 'rock')
    lm = P.mat or 'liner'
    ax = PT.norm(PT.sub(Bp, A))
    u = PT.norm(PT.cross(ax, (0, 0, 1)))
    v = PT.cross(u, ax)
    L = PT.length(PT.sub(Bp, A))
    ringL = P.g('ring', 2.0)
    nr = max(1, int(L / ringL))

    def at(s, a, r):
        c = PT.add(A, PT.mul(ax, s))
        return PT.add(c, PT.add(PT.mul(u, r * math.cos(a)), PT.mul(v, r * math.sin(a))))

    def vert_end(p, x_plane):
        # slide p along the axis onto the vertical plane x = x_plane
        if abs(ax[0]) < 1e-6:
            return p
        s = (x_plane - p[0]) / ax[0]
        return PT.add(p, PT.mul(ax, s))
    for i in range(n):
        a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
        q0 = h / max(abs(math.cos(a0)), abs(math.sin(a0)))
        q1 = h / max(abs(math.cos(a1)), abs(math.sin(a1)))
        for k in range(nr):
            s0, s1 = L * k / nr, L * (k + 1) / nr
            pts = []
            for (s, rr_in, rr_out) in ((s0, R, None), (s1, R, None)):
                pass
            fz = [at(s0, a0, R), at(s0, a0, q0), at(s0, a1, q1), at(s0, a1, R), at(s1, a0, R), at(s1, a0, q0), at(s1, a1, q1), at(s1, a1, R)]
            lz = [at(s0 + 0.03, a0, R - t), at(s0 + 0.03, a0, R), at(s0 + 0.03, a1, R), at(s0 + 0.03, a1, R - t),
                  at(s1 - 0.03, a0, R - t), at(s1 - 0.03, a0, R), at(s1 - 0.03, a1, R), at(s1 - 0.03, a1, R - t)]
            if k == 0:
                fz[:4] = [vert_end(p, A[0]) for p in fz[:4]]
                lz[:4] = [vert_end(p, A[0]) for p in lz[:4]]
            if k == nr - 1:
                fz[4:] = [vert_end(p, Bp[0]) for p in fz[4:]]
                lz[4:] = [vert_end(p, Bp[0]) for p in lz[4:]]
            P.hexa(fill, fz)
            P.hexa(lm, lz)
    Ri = R - t
    content = P.g('content', 'escalator')
    fl = -Ri * 0.55     # floor chord height (in v units)
    half = math.sqrt(max(0.1, Ri * Ri - fl * fl))
    s_in, s_out = 0.0, L

    def line(du, dv):
        return [PT.add(PT.add(PT.add(A, PT.mul(ax, s)), PT.mul(u, du)), PT.mul(v, dv)) for s in (s_in, s_out)]
    # floor slab (chord)
    prims.sweep(P, P.g('floor_mat', 'bconc_light'), line(0.0, fl), prims.rect_prof(half * 2 - 0.2, 0.6, 0.0, center=False, bottom=-0.6),
                mode='pt', caps=True)
    if content == 'escalator':
        k = P.g('escalators', 3)
        ew = min(1.6, (half * 2 - 1.0) / k - 0.5)
        for e in range(k):
            du = (e - (k - 1) / 2) * (ew + 0.9)
            prims.sweep(P, 'steel_dark', line(du, fl + 0.02), prims.rect_prof(ew, 0.12, 0.0, center=False), mode='pt')
            for sg in (-1, 1):
                prims.sweep(P, P.g('bal_mat', 'white_paint'), line(du + sg * (ew / 2 + 0.18), fl), prims.rect_prof(0.3, 1.0, 0.0, center=False), mode='pt')
                prims.sweep(P, 'rubber', line(du + sg * (ew / 2 + 0.18), fl + 1.0), prims.rect_prof(0.16, 0.1, 0.0, center=False), mode='pt')
        # torchere lamps along the gaps between escalators
        ls = P.g('lights', 5.0)
        s = ls / 2
        while s < L:
            for e in range(k - 1):
                du = (e - (k - 2) / 2) * (ew + 0.9)
                c = PT.add(PT.add(PT.add(A, PT.mul(ax, s)), PT.mul(u, du)), PT.mul(v, fl + 1.0))
                P.cyl('steel_dark', c, PT.add(c, (0, 0, 1.4)), 0.05, n=4)
                P.ico(P.g('lamp_mat', 'warmwhite'), PT.add(c, (0, 0, 1.55)), 0.2)
            c = PT.add(PT.add(A, PT.mul(ax, s)), PT.mul(v, Ri - 0.8))
            P.light(c, tuple(P.g('lamp_col', (1.0, 0.85, 0.6))), P.g('power', 300), 0.5)
            s += ls
        for q in range(P.g('people', 8)):
            s = P.rng.uniform(1.0, L - 1.0)
            e = P.rng.randrange(k)
            du = (e - (k - 1) / 2) * (ew + 0.9)
            c = PT.add(PT.add(PT.add(A, PT.mul(ax, s)), PT.mul(u, du)), PT.mul(v, fl + 0.14))
            cl = P.rng.choice(('cloth_a', 'cloth_b', 'cloth_c', 'cloth_d'))
            P.box('steel_dark', c[0] - 0.15, c[1] - 0.12, c[2], c[0] + 0.15, c[1] + 0.12, c[2] + 0.85)
            P.box(cl, c[0] - 0.2, c[1] - 0.14, c[2] + 0.85, c[0] + 0.2, c[1] + 0.14, c[2] + 1.5)
            P.ico('skin', (c[0], c[1], c[2] + 1.65), 0.13)
    elif content == 'funicular':
        for du in (-0.75, 0.75):
            prims.sweep(P, 'steel', line(du, fl + 0.02), prims.rect_prof(0.12, 0.18, 0.0, center=False), mode='pt')
        # stepped car: sections that stay level while the chassis follows the slope
        sc = P.g('car_at', 0.55) * L
        cl = P.g('car_len', 12.0)
        nsec = 4
        for q in range(nsec):
            s = sc - cl / 2 + cl * (q + 0.5) / nsec
            c = PT.add(PT.add(A, PT.mul(ax, s)), PT.mul(v, fl + 0.3))
            w = min(2.6, half * 2 - 1.0)
            hl = cl / nsec / 2
            P.box(P.g('car_mat', 'orange_paint'), c[0] - hl * abs(ax[0]), c[1] - w / 2, c[2], c[0] + hl * abs(ax[0]), c[1] + w / 2, c[2] + 2.6)
            P.box('win_b', c[0] - hl * abs(ax[0]) * 0.8, c[1] - w / 2 - 0.03, c[2] + 1.2, c[0] + hl * abs(ax[0]) * 0.8, c[1] + w / 2 + 0.03, c[2] + 2.1)
        c = PT.add(PT.add(A, PT.mul(ax, sc)), PT.mul(v, fl + 2.0))
        P.light(c, (1.0, 0.85, 0.6), 400, 0.5)
    # light rings for every content type
    ls = P.g('ring_lights', 8.0)
    if ls:
        s = ls / 2
        while s < L:
            for q in range(6):
                a = math.pi * (0.2 + 0.6 * q / 5)
                c = at(s, a, Ri - 0.1)
                P.obox(P.g('ring_mat', 'warmwhite'), c, ax, u, v, 0.35, 0.1, 0.1)
            s += ls


BUILDERS = {'earth2': b_earth2, 'slopemass': b_slopemass, 'incline': b_incline, 'ibore': b_ibore}


def register(kit):
    global KIT
    KIT = kit
