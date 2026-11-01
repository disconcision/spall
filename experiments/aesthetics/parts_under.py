"""
parts_under.py - underground, voids, boreholes and hangars (Blender side).

  earth      solid ground block minus a list of box voids, decomposed greedily into closed boxes (so crops cap it
             with strata poche); the carved faces are raw rock
  borehole   round shaft in a square void: rock fill, segmental liner, helical ramp, light rings, lift tower,
             service pipes, cantilevered landings
  lining     finishes a box void as a room (floor / wall panels / ceiling / light strips / columns) in ug_* palette slots
  tunnel     service or transit tunnel along local x: vault or box section, trays, pipes, strip lights, rails
  walkway    sparse walkway along a path (flat runs, slopes), railings, hangers or keel, lamps
  pendant    hanging lamps on long cables;  cablespan: sagging cables between two points
  hangar     hall shell: floor + markings, portal ribs or vault, crane runways, bridge cranes with loads, lights
  tbm        tunnel boring machine (cutterhead, shield, back-up gantries); state 'assembly' adds scaffolds + gaps
  robotarm, scaffold, fan, striplight
"""
import math
import random

import paths as PT
import prims

KIT = None


def _cb(P, mat, *a, **k):
    import parts_concrete
    return parts_concrete.cb(P, mat, *a, **k)


# ------------------------------------------------------------------------------------------------ earth
def b_earth(P):
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'rock'
    voids = [v for v in P.g('voids', [])]

    def axis(lo, hi, i0, i1):
        s = {lo, hi}
        for v in voids:
            for c in (v[i0], v[i1]):
                if lo < c < hi:
                    s.add(c)
        return sorted(s)
    xs, ys, zs = axis(0.0, lx, 0, 3), axis(0.0, ly, 1, 4), axis(0.0, lz, 2, 5)
    # extra horizontal cuts so tall blocks stay reasonable for the sectioning code
    step = P.g('zstep', 0)
    if step:
        zs = sorted(set(zs) | {z for z in [k * step for k in range(1, int(lz / step) + 1)] if 0 < z < lz})
    nx, ny, nz = len(xs) - 1, len(ys) - 1, len(zs) - 1
    solid = [[[True] * nx for _ in range(ny)] for _ in range(nz)]
    for v in voids:
        for k in range(nz):
            zc = (zs[k] + zs[k + 1]) / 2
            if not (v[2] < zc < v[5]):
                continue
            for j in range(ny):
                yc = (ys[j] + ys[j + 1]) / 2
                if not (v[1] < yc < v[4]):
                    continue
                row = solid[k][j]
                for i in range(nx):
                    xc = (xs[i] + xs[i + 1]) / 2
                    if v[0] < xc < v[3]:
                        row[i] = False
    seen = [[[False] * nx for _ in range(ny)] for _ in range(nz)]

    def ok(k, j, i):
        return solid[k][j][i] and not seen[k][j][i]
    nbox = 0
    for k in range(nz):
        for j in range(ny):
            for i in range(nx):
                if not ok(k, j, i):
                    continue
                i1 = i
                while i1 + 1 < nx and ok(k, j, i1 + 1):
                    i1 += 1
                j1 = j
                while j1 + 1 < ny and all(ok(k, j1 + 1, ii) for ii in range(i, i1 + 1)):
                    j1 += 1
                k1 = k
                while k1 + 1 < nz and all(ok(k1 + 1, jj, ii) for jj in range(j, j1 + 1) for ii in range(i, i1 + 1)):
                    k1 += 1
                for kk in range(k, k1 + 1):
                    for jj in range(j, j1 + 1):
                        for ii in range(i, i1 + 1):
                            seen[kk][jj][ii] = True
                P.raw_box(m, xs[i], ys[j], zs[k], xs[i1 + 1], ys[j1 + 1], zs[k1 + 1])
                nbox += 1
    top = P.g('top')
    if top:
        # a thin surface layer where the block is solid at the top
        P.raw_box(top, 0, 0, lz, lx, ly, lz + 0.02) if not voids else None


# ------------------------------------------------------------------------------------------------ borehole
def _sq(a, h):
    return h / max(abs(math.cos(a)), abs(math.sin(a)))


def b_borehole(P):
    """params: liner (m), n (segments, multiple of 8), ramp (width m, 0 = none), turns, ramp_top/ramp_bot (z m),
    rings (m spacing of light rings), lift (bool), pipes (n), landings (list of z), fill (rock material)."""
    lx, ly, lz = P.lx, P.ly, P.lz
    h = min(lx, ly) / 2
    cx, cy = lx / 2, ly / 2
    R = P.g('R', h - 0.6)
    t = P.g('liner', 1.2)
    n = P.g('n', 48)
    fill = P.g('fill', 'rock')
    lm = P.mat or 'liner'
    ring_h = P.g('ring_h', 7.0)
    zz = [0.0]
    while zz[-1] + ring_h < lz - 0.5:
        zz.append(zz[-1] + ring_h)
    zz.append(lz)
    for i in range(n):
        a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
        c0, s0, c1, s1 = math.cos(a0), math.sin(a0), math.cos(a1), math.sin(a1)
        q0, q1 = _sq(a0, h), _sq(a1, h)
        for zi in range(len(zz) - 1):
            z0, z1 = zz[zi], zz[zi + 1]
            # rock fill between the circle and the square boundary
            P.hexa(fill, [(cx + R * c0, cy + R * s0, z0), (cx + q0 * c0, cy + q0 * s0, z0), (cx + q1 * c1, cy + q1 * s1, z0),
                          (cx + R * c1, cy + R * s1, z0), (cx + R * c0, cy + R * s0, z1), (cx + q0 * c0, cy + q0 * s0, z1),
                          (cx + q1 * c1, cy + q1 * s1, z1), (cx + R * c1, cy + R * s1, z1)])
            # liner segment (stagger joints between rings)
            ri = R - t
            gap = 0.04
            b0, b1 = a0 + (gap if (i + zi) % 3 == 0 else 0.0), a1
            cb0, sb0, cb1, sb1 = math.cos(b0), math.sin(b0), math.cos(b1), math.sin(b1)
            P.hexa(lm, [(cx + ri * cb0, cy + ri * sb0, z0 + gap), (cx + R * cb0, cy + R * sb0, z0 + gap), (cx + R * cb1, cy + R * sb1, z0 + gap),
                        (cx + ri * cb1, cy + ri * sb1, z0 + gap), (cx + ri * cb0, cy + ri * sb0, z1 - gap), (cx + R * cb0, cy + R * sb0, z1 - gap),
                        (cx + R * cb1, cy + R * sb1, z1 - gap), (cx + ri * cb1, cy + ri * sb1, z1 - gap)])
    Ri = R - t
    # light rings
    rs = P.g('rings', 14.0)
    if rs:
        z = rs * 0.5
        k = 0
        while z < lz:
            for i in range(0, n, 2):
                a = 2 * math.pi * (i + 0.5) / n
                P.obox(P.g('ring_mat', 'sodium'), (cx + (Ri - 0.12) * math.cos(a), cy + (Ri - 0.12) * math.sin(a), z),
                       (math.cos(a), math.sin(a), 0), (-math.sin(a), math.cos(a), 0), (0, 0, 1), 0.1, 0.35, 0.12)
            if k % 2 == 0:
                for q in range(3):
                    a = 2 * math.pi * q / 3 + k
                    P.light((cx + (Ri - 2.0) * math.cos(a), cy + (Ri - 2.0) * math.sin(a), z), P.g('ring_col', (1.0, 0.72, 0.4)),
                            P.g('ring_power', 2500), 0.5)
            z += rs
            k += 1
    # helical ramp
    rw = P.g('ramp', 0.0)
    if rw:
        zt, zb = P.g('ramp_top', lz - 1.0), P.g('ramp_bot', 0.0)
        turns = P.g('turns', (zt - zb) / (2 * math.pi * (Ri - rw / 2) * 0.08))
        path = PT.helix(cx, cy, Ri - rw / 2 - 0.05, zt, zb, turns, a0=P.g('ramp_a0', -90), step=1.5)
        prims.sweep(P, P.g('ramp_mat', 'bconc_light'), path, prims.rect_prof(rw, 0.7, 0.0, center=False, bottom=-0.7), mode='up')
        inner = PT.helix(cx, cy, Ri - rw - 0.05, zt + 1.0, zb + 1.0, turns, a0=P.g('ramp_a0', -90), step=1.5)
        prims.sweep(P, P.g('rail_mat', 'ug_rail'), inner, prims.circle(0.06, 4), mode='pt')
        for k in range(0, len(inner), 2):
            p = inner[k]
            P.box(P.g('rail_mat', 'ug_rail'), p[0] - 0.04, p[1] - 0.04, p[2] - 1.0, p[0] + 0.04, p[1] + 0.04, p[2])
        # a lamp every few metres along the ramp
        for k in range(0, len(path), 9):
            p = path[k]
            P.light((p[0], p[1], p[2] + 2.0), (1.0, 0.75, 0.45), 120, 0.2)
            P.box('lamp', p[0] - 0.12, p[1] - 0.12, p[2] + 0.05, p[0] + 0.12, p[1] + 0.12, p[2] + 0.35)
    # lift tower against the wall
    if P.g('lift', True):
        a = math.radians(P.g('lift_a', 30))
        lr = Ri - 2.4
        lxp, lyp = cx + lr * math.cos(a), cy + lr * math.sin(a)
        s = 1.8
        for (dx, dy) in ((-s, -s), (s, -s), (s, s), (-s, s)):
            P.box('ug_steel', lxp + dx - 0.15, lyp + dy - 0.15, 0, lxp + dx + 0.15, lyp + dy + 0.15, lz)
        z = 0.0
        while z < lz:
            P.box('ug_steel', lxp - s, lyp - s, z, lxp + s, lyp + s, z + 0.25)
            z += 4.0
        for q in range(P.g('cabs', 2)):
            zc = P.rng.uniform(4, lz - 6)
            P.box('lamp', lxp - s + 0.3, lyp - s + 0.3, zc, lxp + s - 0.3, lyp + s - 0.3, zc + 3.0)
            P.light((lxp, lyp, zc + 1.5), (1.0, 0.9, 0.75), 300, 0.4)
    # service pipes down the wall
    for q in range(P.g('pipes', 3)):
        a = math.radians(P.g('pipe_a', 140)) + q * 0.07
        pr = Ri - 0.5
        mm = ('ug_pipe', 'ug_pipe2', 'ug_duct')[q % 3]
        P.cyl(mm, (cx + pr * math.cos(a), cy + pr * math.sin(a), 0), (cx + pr * math.cos(a), cy + pr * math.sin(a), lz), 0.35, n=8)
    for zl in P.g('landings', []):
        a = math.radians(P.rng.uniform(0, 360))
        w = P.g('landing_w', 8.0)
        d = P.g('landing_d', 5.0)
        # cantilevered slab tangent to the wall
        cxl, cyl = cx + (Ri - d / 2) * math.cos(a), cy + (Ri - d / 2) * math.sin(a)
        P.obox('bconc_light', (cxl, cyl, zl - 0.35), (math.cos(a), math.sin(a), 0), (-math.sin(a), math.cos(a), 0), (0, 0, 1),
               d / 2, w / 2, 0.35)


# ------------------------------------------------------------------------------------------------ rooms and tunnels
def b_lining(P):
    """Finish a box void as a room.  params: floor, walls (sides string), ceiling (bool), lights ('strip'|'panel'|'none'),
    light_mat, cols [nx, ny] column grid, col (m), wall_mat, floor_mat, ceil_mat, plants (n planters), signs (n)."""
    lx, ly, lz = P.lx, P.ly, P.lz
    fm, wm, cm = P.g('floor_mat', 'ug_floor'), P.g('wall_mat', 'ug_wall'), P.g('ceil_mat', 'ug_ceiling')
    if P.g('floor', True):
        P.raw_box(fm, 0, 0, 0, lx, ly, 0.25)
        if P.g('stripe', True):
            P.raw_box(P.g('stripe_mat', 'ug_trim'), 0.6, 0.6, 0.25, lx - 0.6, 0.85, 0.27)
    for s in P.g('walls', 'nw'):
        if s == 'n':
            _cb(P, wm, 0, ly - 0.35, 0, lx, ly, lz, k=0.3, top=0.0)
        elif s == 's':
            _cb(P, wm, 0, 0, 0, lx, 0.35, lz, k=0.3, top=0.0)
        elif s == 'w':
            _cb(P, wm, 0, 0, 0, 0.35, ly, lz, k=0.3, top=0.0)
        elif s == 'e':
            _cb(P, wm, lx - 0.35, 0, 0, lx, ly, lz, k=0.3, top=0.0)
    if P.g('ceiling', True):
        P.raw_box(cm, 0, 0, lz - 0.3, lx, ly, lz)
    lt = P.g('lights', 'strip')
    lmat = P.g('light_mat', 'ug_light')
    if lt == 'strip':
        n = max(1, int(ly / P.g('light_step', 4.0)))
        for i in range(n):
            y = (i + 0.5) * ly / n
            P.raw_box(lmat, 1.0, y - 0.12, lz - 0.42, lx - 1.0, y + 0.12, lz - 0.3)
            for k in range(max(1, int(lx / 12))):
                P.light(((k + 0.5) * lx / max(1, int(lx / 12)), y, lz - 1.2), P.g('light_col', (1.0, 0.75, 0.45)), P.g('power', 350), 0.8)
    elif lt == 'panel':
        for i in range(max(1, int(lx / 5))):
            for j in range(max(1, int(ly / 5))):
                x, y = (i + 0.5) * lx / max(1, int(lx / 5)), (j + 0.5) * ly / max(1, int(ly / 5))
                P.raw_box(lmat, x - 1.2, y - 1.2, lz - 0.34, x + 1.2, y + 1.2, lz - 0.3)
        for i in range(max(1, int(lx / 10))):
            for j in range(max(1, int(ly / 10))):
                P.light(((i + 0.5) * lx / max(1, int(lx / 10)), (j + 0.5) * ly / max(1, int(ly / 10)), lz - 1.5),
                        P.g('light_col', (1.0, 0.97, 0.92)), P.g('power', 500), 1.5)
    cols = P.g('cols')
    if cols:
        cs = P.g('col', 0.9)
        for i in range(cols[0]):
            for j in range(cols[1]):
                x, y = (i + 0.5) * lx / cols[0], (j + 0.5) * ly / cols[1]
                _cb(P, P.g('col_mat', 'ug_col'), x - cs / 2, y - cs / 2, 0.25, x + cs / 2, y + cs / 2, lz - 0.3, top=0.0)
    for q in range(P.g('plants', 0)):
        x, y = P.rng.uniform(1.5, lx - 3.5), P.rng.uniform(1.5, ly - 3.5)
        _cb(P, 'ug_planter', x, y, 0.25, x + 2.0, y + 2.0, 0.95, k=0.5)
        KIT.tree(P, x + 1.0, y + 1.0, 0.95, P.rng.uniform(2.2, 3.6), 'round')
    for q in range(P.g('signs', 0)):
        x = P.rng.uniform(2, lx - 4)
        P.raw_box('ug_sign', x, ly - 0.45, lz * 0.55, x + 2.4, ly - 0.35, lz * 0.55 + 0.7)
    for q in range(P.g('people', 0)):
        x, y = P.rng.uniform(1, lx - 1), P.rng.uniform(1, ly - 1)
        F = P.rng.choice(('cloth_a', 'cloth_b', 'cloth_c', 'cloth_d'))
        P.raw_box('steel_dark', x - 0.16, y - 0.1, 0.25, x + 0.16, y + 0.1, 1.1)
        P.raw_box(F, x - 0.22, y - 0.13, 1.1, x + 0.22, y + 0.13, 1.75)
        P.ico('skin', (x, y, 1.9), 0.13)


def b_tunnel(P):
    """Tunnel along local x.  params: shape vault|box, trays (bool), pipes (n), rails (bool), lights (spacing m),
    light_mat, wall_mat, floor_mat, train (bool)."""
    lx, ly, lz = P.lx, P.ly, P.lz
    wm, fm = P.g('wall_mat', 'ug_wall'), P.g('floor_mat', 'ug_floor')
    t = 0.5
    P.raw_box(fm, 0, 0, 0, lx, ly, 0.3)
    if P.g('shape', 'vault') == 'vault':
        R = ly / 2
        zc = lz - R
        P.raw_box(wm, 0, -t, 0, lx, 0, zc)
        P.raw_box(wm, 0, ly, 0, lx, ly + t, zc)
        KIT.ring_segments(P, wm, 0, lx, R + t, t, n=12, a0=0.0, a1=math.pi, cy=ly / 2, cz=zc)
    else:
        P.raw_box(wm, 0, -t, 0, lx, 0, lz)
        P.raw_box(wm, 0, ly, 0, lx, ly + t, lz)
        P.raw_box(wm, 0, -t, lz, lx, ly + t, lz + t)
    if P.g('trays', True):
        for z in (lz * 0.55, lz * 0.62):
            P.raw_box('ug_steel', 0, ly - 0.7, z, lx, ly - 0.05, z + 0.08)
            P.raw_box('cable_black', 0, ly - 0.65, z + 0.08, lx, ly - 0.1, z + 0.22)
    for q in range(P.g('pipes', 2)):
        z = lz * 0.3 + q * 0.55
        P.cyl(('ug_pipe', 'ug_pipe2', 'ug_duct')[q % 3], (0, 0.45, z), (lx, 0.45, z), 0.22, n=8)
    if P.g('rails', False):
        for dy in (-0.72, 0.72):
            P.raw_box('steel', 0, ly / 2 + dy - 0.05, 0.3, lx, ly / 2 + dy + 0.05, 0.45)
    sp = P.g('lights', 6.0)
    x = sp / 2
    while x < lx:
        P.raw_box(P.g('light_mat', 'ug_light'), x - 0.8, ly / 2 - 0.1, lz - 0.15 if P.g('shape', 'vault') != 'vault' else lz - 0.25,
                  x + 0.8, ly / 2 + 0.1, lz - 0.05 if P.g('shape', 'vault') != 'vault' else lz - 0.1)
        if int(x / sp) % 2 == 0:
            P.light((x, ly / 2, lz - 1.0), P.g('light_col', (1.0, 0.72, 0.42)), P.g('power', 250), 0.4)
        x += sp
    if P.g('train'):
        KIT.train(P, P.rng.uniform(0, lx * 0.3), P.rng.uniform(lx * 0.5, lx), ly / 2 - 1.4, ly / 2 + 1.4, 0.45)


# ------------------------------------------------------------------------------------------------ sparse walkways
def b_walkway(P):
    """Walkway along params.path ([[x,y,z],...] local m).  params: w (1.8), mat ('grating'), rail_mat, t (0.25),
    hang (z of the ceiling to hang from, or None), keel (bool), lamps (spacing m, 0 = none), lamp_col, stairs (bool:
    render slopes as steps)."""
    path = [tuple(p) for p in P.g('path')]
    w = P.g('w', 1.8)
    m = P.mat or 'grating'
    rm = P.g('rail_mat', 'ug_rail')
    t = P.g('t', 0.25)
    pts = PT.resample(path, 1.0) if not P.g('fillet') else PT.resample(PT.fillet(path, P.g('fillet'), 6), 1.0)
    prims.sweep(P, m, pts, prims.rect_prof(w, t, 0.0, center=False, bottom=-t), mode='up')
    if P.g('keel', True):
        prims.sweep(P, P.g('keel_mat', m), pts, prims.rect_prof(w * 0.35, t * 2.5, 0.0, center=False, bottom=-t * 3.2), mode='up')
    for side in (-1, 1):
        rail = PT.offset_path(pts, side * (w / 2 - 0.05), 1.05, mode='up')
        prims.sweep(P, rm, rail, prims.circle(0.045, 4), mode='pt')
        mid = PT.offset_path(pts, side * (w / 2 - 0.05), 0.5, mode='up')
        prims.sweep(P, rm, mid, prims.circle(0.03, 4), mode='pt')
        base = PT.offset_path(pts, side * (w / 2 - 0.05), 0.0, mode='up')
        for k in range(0, len(base), 2):
            p, q = base[k], rail[k]
            P.box(rm, p[0] - 0.035, p[1] - 0.035, p[2], p[0] + 0.035, p[1] + 0.035, q[2])
    hz = P.g('hang')
    if hz is not None:
        every = P.g('hang_every', 6)
        for side in (-1, 1):
            base = PT.offset_path(pts, side * (w / 2 - 0.05), 0.0, mode='up')
            for k in range(0, len(base), every):
                p = base[k]
                P.cyl(P.g('hang_mat', 'ug_steel'), p, (p[0], p[1], hz), 0.035, n=4)
    lp = P.g('lamps', 0)
    if lp:
        k = 0
        acc = 0.0
        for i in range(1, len(pts)):
            acc += PT.length(PT.sub(pts[i], pts[i - 1]))
            if acc >= lp:
                acc = 0.0
                p = pts[i]
                P.box('lamp', p[0] - 0.12, p[1] - 0.12, p[2] + 2.3, p[0] + 0.12, p[1] + 0.12, p[2] + 2.55)
                P.cyl(rm, p, (p[0], p[1], p[2] + 2.3), 0.04, n=4)
                P.light((p[0], p[1], p[2] + 2.1), tuple(P.g('lamp_col', (1.0, 0.72, 0.42))), P.g('lamp_power', 150), 0.2)
                k += 1


def b_pendant(P):
    """Hanging lamps from the part top (ceiling) down to random heights; params: n, drop [lo,hi], mat, col, power."""
    lx, ly, lz = P.lx, P.ly, P.lz
    for i in range(P.g('n', 6)):
        x, y = P.rng.uniform(0.5, lx - 0.5), P.rng.uniform(0.5, ly - 0.5)
        d = P.rng.uniform(*P.g('drop', [4.0, 12.0]))
        P.cyl('steel_dark', (x, y, lz), (x, y, lz - d), 0.025, n=4)
        P.cyl(P.g('shade', 'steel_dark'), (x, y, lz - d), (x, y, lz - d - 0.5), 0.12, n=8, r1=0.55)
        P.cyl(P.mat or 'lamp', (x, y, lz - d - 0.45), (x, y, lz - d - 0.55), 0.45, n=8)
        P.light((x, y, lz - d - 1.0), tuple(P.g('col', (1.0, 0.75, 0.45))), P.g('power', 300), 0.3)


def b_cablespan(P):
    """Sagging cables from params.a to params.b (local m); params: n, sag (m), r, mats."""
    a, b = P.g('a'), P.g('b')
    n = P.g('n', 5)
    sag = P.g('sag', 3.0)
    mats = P.g('mats', ['cable_black', 'cable_black', 'cable_grey', 'cable_red'])
    for k in range(n):
        off = (k - (n - 1) / 2) * P.g('spread', 0.35)
        s2 = sag * P.rng.uniform(0.7, 1.3)
        pts = []
        for i in range(21):
            t = i / 20
            p = PT.lerp(a, b, t)
            pts.append((p[0] + off * 0.3, p[1] + off, p[2] - 4 * s2 * t * (1 - t)))
        prims.sweep(P, P.rng.choice(mats), pts, prims.circle(P.g('r', 0.07), 4), mode='pt')


# ------------------------------------------------------------------------------------------------ hangar
def gantry_crane(P, x0, x1, y, zr, span_y0, span_y1, hook_x=None, drop=10.0, load=None, mat='yellow_paint'):
    """Bridge crane along local y between runways at x0/x1 (runway height zr); hook at hook_x."""
    gw = 1.4
    _cb(P, mat, x0 - 0.3, y - gw / 2, zr, x1 + 0.3, y + gw / 2, zr + 2.2, k=0.3)
    _cb(P, mat, x0 - 0.3, y - gw * 1.6, zr - 0.4, x0 + 1.2, y + gw * 1.6, zr + 2.6, k=0.3)
    _cb(P, mat, x1 - 1.2, y - gw * 1.6, zr - 0.4, x1 + 0.3, y + gw * 1.6, zr + 2.6, k=0.3)
    hx = (x0 + x1) / 2 if hook_x is None else hook_x
    P.box('steel_dark', hx - 1.2, y - 1.4, zr + 2.2, hx + 1.2, y + 1.4, zr + 3.4)
    P.box('hazard', hx - 1.2, y - 1.45, zr + 2.2, hx + 1.2, y - 1.35, zr + 2.6)
    for dy in (-0.4, 0.4):
        P.cyl('steel_dark', (hx, y + dy, zr), (hx, y + dy, zr - drop), 0.04, n=4)
    P.box(mat, hx - 0.5, y - 0.6, zr - drop - 0.8, hx + 0.5, y + 0.6, zr - drop)
    P.box('hazard', hx - 0.52, y - 0.62, zr - drop - 0.8, hx + 0.52, y + 0.62, zr - drop - 0.6)
    return (hx, y, zr - drop - 0.8)


def b_hangar(P):
    """Hall shell (interior volume = part box).  params: shell ribs|vault|none, rib (m spacing), cranes (n bridge
    cranes), runway_z (m), wall_mat, rib_mat, crane_mat, floor_mat, markings (bool), lights (n), light_mat, light_col,
    door ('e'|'w'|None), loads: list of [x, y, w, d, h, mat] hanging loads (one per crane)."""
    lx, ly, lz = P.lx, P.ly, P.lz
    fm = P.g('floor_mat', 'ug_floor')
    rm = P.g('rib_mat', 'bconc')
    P.raw_box(fm, 0, 0, 0, lx, ly, 0.3)
    if P.g('markings', True):
        for y in (ly * 0.2, ly * 0.8):
            P.raw_box('lane_yellow', 1.0, y - 0.12, 0.3, lx - 1.0, y + 0.12, 0.32)
        P.raw_box('hazard', lx * 0.08, ly * 0.2 + 0.4, 0.3, lx * 0.08 + 1.2, ly * 0.8 - 0.4, 0.32)
    shell = P.g('shell', 'ribs')
    rib = P.g('rib', 9.0)
    nr = max(2, int(lx / rib))
    zr = P.g('runway_z', lz * 0.72)
    for i in range(nr + 1):
        x = i * lx / nr
        if shell == 'vault':
            R = ly / 2
            zc = lz - R
            pts = [(x, ly / 2 + R * math.cos(a), zc + R * math.sin(a)) for a in [math.pi * k / 16 for k in range(17)]]
            pts = [(x, 0.0, 0.0)] + pts + [(x, ly, 0.0)]
            prims.sweep(P, rm, PT.resample(PT.fillet(pts, 3.0, 6), 1.2), prims.rect_prof(1.0, 1.2), mode='pt')
        elif shell == 'ribs':
            for y0, y1 in ((0.0, 1.2), (ly - 1.2, ly)):
                _cb(P, rm, x - 0.6, y0, 0.3, x + 0.6, y1, lz, top=0.0)
            _cb(P, rm, x - 0.6, 0.0, lz - 2.4, x + 0.6, ly, lz, top=0.0, bot=0.6)
            for y0, sg in ((1.2, 1), (ly - 1.2, -1)):
                prims.prism3(P, rm, [(x - 0.6, y0, lz - 2.4), (x - 0.6, y0 + sg * 3.0, lz - 2.4), (x - 0.6, y0, lz - 5.4)], (1.2, 0, 0))
    # runway beams on corbels
    for y0, y1 in ((1.2, 2.2), (ly - 2.2, ly - 1.2)):
        _cb(P, P.g('runway_mat', 'bconc'), 0, y0, zr - 1.4, lx, y1, zr, k=0.4, top=0.0, bot=0.6)
    cm = P.g('crane_mat', 'yellow_paint')
    loads = P.g('loads', [])
    for q in range(P.g('cranes', 2)):
        xq = (q + 0.5) * lx / max(1, P.g('cranes', 2)) + P.rng.uniform(-lx * 0.08, lx * 0.08)
        ld = loads[q] if q < len(loads) else None
        # a load is [x, y, w, d, h, mat, clearance]; it hangs `clearance` m above the floor under the hook
        hx = xq
        hy = ld[1] if ld else ly * P.rng.uniform(0.35, 0.65)
        gw = 1.4
        _cb(P, cm, xq - gw / 2, 1.0, zr, xq + gw / 2, ly - 1.0, zr + 2.2, k=0.3)
        _cb(P, cm, xq - gw * 1.6, 1.0, zr - 0.4, xq + gw * 1.6, 2.6, zr + 2.6, k=0.3)
        _cb(P, cm, xq - gw * 1.6, ly - 2.6, zr - 0.4, xq + gw * 1.6, ly - 1.0, zr + 2.6, k=0.3)
        P.box('steel_dark', hx - 1.4, hy - 1.2, zr + 2.2, hx + 1.4, hy + 1.2, zr + 3.4)
        if ld:
            lw, ldd, lh = ld[2], ld[3], ld[4]
            lmat = ld[5] if len(ld) > 5 else 'bconc_light'
            clr = ld[6] if len(ld) > 6 else zr * 0.3
            ltop = 0.3 + clr + lh
            hook_z = min(zr - 2.0, ltop + 2.8)
        else:
            hook_z = zr - P.g('drop', zr * 0.45)
        for dx in (-0.4, 0.4):
            P.cyl('steel_dark', (hx + dx, hy, zr), (hx + dx, hy, hook_z), 0.04, n=4)
        P.box(cm, hx - 0.6, hy - 0.5, hook_z - 0.8, hx + 0.6, hy + 0.5, hook_z)
        if ld:
            top = hook_z - 0.8
            for (sx, sy) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                P.cyl('steel_dark', (hx, hy, top), (hx + sx * lw * 0.35, hy + sy * ldd * 0.35, ltop), 0.03, n=4)
            _cb(P, lmat, hx - lw / 2, hy - ldd / 2, ltop - lh, hx + lw / 2, hy + ldd / 2, ltop, k=0.5)
    # lights
    lc = tuple(P.g('light_col', (1.0, 0.95, 0.85)))
    for i in range(P.g('lights', 6)):
        x = (i + 0.5) * lx / max(1, P.g('lights', 6))
        for y in (ly * 0.3, ly * 0.7):
            P.box(P.g('light_mat', 'worklight'), x - 0.8, y - 0.8, lz - 2.8, x + 0.8, y + 0.8, lz - 2.6)
            P.spot((x, y, lz - 3.0), lc, P.g('power', 9000), direction=(0, 0, -1), size=100, radius=0.6)
    door = P.g('door')
    if door:
        xd = 0.0 if door == 'w' else lx
        P.raw_box('hazard', xd - 0.3, ly * 0.2, 0.3, xd + 0.3, ly * 0.2 + 0.6, lz * 0.75)
        P.raw_box('hazard', xd - 0.3, ly * 0.8 - 0.6, 0.3, xd + 0.3, ly * 0.8, lz * 0.75)


# ------------------------------------------------------------------------------------------------ tunnel boring machine
def b_tbm(P):
    """Tunnel boring machine along local +x (cutterhead at the +x end).  params: R (m), state 'assembly'|'ready',
    gantries (n back-up gantries), shield_mat, head_mat."""
    lx, ly = P.lx, P.ly
    R = P.g('R', min(ly, P.lz) / 2 * 0.95)
    cy, cz = ly / 2, R + 0.4
    hm = P.g('head_mat', 'yellow_paint')
    sm = P.g('shield_mat', 'galv')
    asm = P.g('state', 'assembly') == 'assembly'
    L_sh = R * 1.3
    x_head = lx - 1.2
    # shield (cylinder shell as ring segments so sections read) + thrust ring
    x0 = x_head - L_sh
    gap_seg = (3, 4) if asm else ()

    def segmat(u0, u1):
        return sm
    for i in range(24):
        if asm and i in (5, 6, 7):
            continue      # missing shield plates during assembly
        a0, a1 = 2 * math.pi * i / 24, 2 * math.pi * (i + 1) / 24
        KIT.ring_segments(P, sm, x0, x_head, R, 0.35, n=1, a0=a0, a1=a1, cy=cy, cz=cz)
    KIT.ring_segments(P, 'steel_dark', x0 - 0.8, x0, R * 0.98, 1.2, n=24, cy=cy, cz=cz)
    P.cyl('steel_dark', (x0, cy, cz), (x_head, cy, cz), R * 0.55, n=16)
    # cutterhead: disc, spokes, cutters
    P.cyl(hm, (x_head, cy, cz), (x_head + 1.2, cy, cz), R * 1.02, n=32)
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.2
        c = (x_head + 1.25, cy + math.cos(a) * R * 0.5, cz + math.sin(a) * R * 0.5)
        P.obox('steel_dark', c, (1, 0, 0), (0, math.cos(a), math.sin(a)), (0, -math.sin(a), math.cos(a)), 0.25, R * 0.48, R * 0.07)
        for j in range(5):
            rr = R * (0.25 + 0.15 * j)
            cc = (x_head + 1.35, cy + math.cos(a + 0.18) * rr, cz + math.sin(a + 0.18) * rr)
            P.cyl('steel_light', (cc[0] - 0.1, cc[1], cc[2]), (cc[0] + 0.2, cc[1], cc[2]), R * 0.05, n=8)
    P.cyl('steel_dark', (x_head + 1.2, cy, cz), (x_head + 1.8, cy, cz), R * 0.18, n=12)
    # back-up gantries on rails
    ng = P.g('gantries', 3)
    gl = (x0 - 1.0) / max(1, ng)
    for g in range(ng):
        gx0, gx1 = g * gl + 0.4, (g + 1) * gl - 0.4
        for y in (cy - R * 0.7, cy + R * 0.7):
            P.box('steel_dark', gx0, y - 0.3, 0.0, gx1, y + 0.3, 0.5)
            for x in (gx0 + 0.6, gx1 - 0.6):
                P.box(hm, x - 0.25, y - 0.25, 0.5, x + 0.25, y + 0.25, R * 1.6)
        P.box(hm, gx0, cy - R * 0.75, R * 1.6, gx1, cy + R * 0.75, R * 1.6 + 0.4)
        for k in range(2):
            z = 0.8 + k * R * 0.7
            bw = P.rng.uniform(0.3, 0.6) * R
            P.box(P.rng.choice(('steel_light', 'galv', 'blue_paint', 'white_paint')), gx0 + 0.6, cy - bw, z, gx1 - 0.6, cy + bw * 0.6, z + R * 0.45)
        P.box('worklight', gx0 + 0.5, cy - R * 0.76, R * 1.35, gx0 + 1.1, cy - R * 0.74, R * 1.5)
        P.light(((gx0 + gx1) / 2, cy - R * 0.9, R * 1.4), (1.0, 0.9, 0.7), 600, 0.4)
    # spoil conveyor running back along the gantries
    P.box('belt', 0, cy + R * 0.1, R * 1.25, x0, cy + R * 0.4, R * 1.3)
    for x in range(1, int(x0), 3):
        P.box('spoil', x, cy + R * 0.12, R * 1.3, x + 1.4, cy + R * 0.38, R * 1.3 + P.rng.uniform(0.1, 0.4))
    if asm:
        # scaffold around the shield top + workers + welding light
        s = Part2(P)
        _scaffold(P, x0 - 1.0, cy - R - 1.5, 0.0, x_head, cy + R + 1.5, cz + R + 2.5, bay=2.2, lift=2.0)
        P.ico('spark', (x0 + L_sh * 0.4, cy - R * 0.4, cz + R * 0.92), 0.35)
        P.light((x0 + L_sh * 0.4, cy - R * 0.6, cz + R * 1.0), (0.6, 0.8, 1.0), 1500, 0.1)


def Part2(P):
    return P


def _scaffold(P, x0, y0, z0, x1, y1, z1, bay=2.0, lift=2.0, mat='galv', board='timber', sides='sn'):
    nx = max(1, int((x1 - x0) / bay))
    nz = max(1, int((z1 - z0) / lift))
    for side in sides:
        y = y0 if side == 's' else y1
        yi = y + (1.1 if side == 's' else -1.1)
        for i in range(nx + 1):
            x = x0 + (x1 - x0) * i / nx
            for yy in (y, yi):
                P.cyl(mat, (x, yy, z0), (x, yy, z1), 0.045, n=4)
        for k in range(1, nz + 1):
            z = z0 + (z1 - z0) * k / nz
            for yy in (y, yi):
                P.cyl(mat, (x0, yy, z), (x1, yy, z), 0.04, n=4)
            P.box(board, x0, min(y, yi), z - 0.06, x1, max(y, yi), z)
        for i in range(nx):
            xa, xb = x0 + (x1 - x0) * i / nx, x0 + (x1 - x0) * (i + 1) / nx
            P.cyl(mat, (xa, y, z0), (xb, y, z1 if i % 2 else z0 + (z1 - z0) * 0.5), 0.035, n=4)


def b_scaffold(P):
    _scaffold(P, 0, 0, 0, P.lx, P.ly, P.lz, bay=P.g('bay', 2.0), lift=P.g('lift', 2.0), sides=P.g('sides', 'sn'))


def b_robotarm(P):
    """Industrial arm at the footprint centre; params: reach (m), mat, pose [yaw, a1, a2] degrees, weld (bool)."""
    rng = P.rng
    s = P.g('reach', 3.0)
    m = P.mat or 'orange_paint'
    cx, cy = P.lx / 2, P.ly / 2
    yaw, a1, a2 = [math.radians(v) for v in P.g('pose', [rng.uniform(0, 360), rng.uniform(25, 70), rng.uniform(-110, -40)])]
    P.cyl('steel_dark', (cx, cy, 0), (cx, cy, 0.35 * s / 3), 0.55 * s / 3, n=12)
    P.cyl(m, (cx, cy, 0.35 * s / 3), (cx, cy, 0.9 * s / 3), 0.42 * s / 3, n=12)
    sh = (cx, cy, 1.0 * s / 3)
    d = (math.cos(yaw), math.sin(yaw))
    L1, L2 = s * 0.55, s * 0.5
    el = (sh[0] + d[0] * L1 * math.cos(a1), sh[1] + d[1] * L1 * math.cos(a1), sh[2] + L1 * math.sin(a1))
    wr = (el[0] + d[0] * L2 * math.cos(a1 + a2), el[1] + d[1] * L2 * math.cos(a1 + a2), el[2] + L2 * math.sin(a1 + a2))
    prims.leg(P, m, sh, el, 0.28 * s / 3, 0.22 * s / 3, n=8)
    prims.leg(P, m, el, wr, 0.2 * s / 3, 0.15 * s / 3, n=8)
    P.ico('steel_dark', sh, 0.34 * s / 3)
    P.ico('steel_dark', el, 0.27 * s / 3)
    P.cyl('steel_dark', wr, (wr[0], wr[1], wr[2] - 0.5 * s / 3), 0.12 * s / 3, n=8)
    if P.g('weld'):
        P.ico('spark', (wr[0], wr[1], wr[2] - 0.6 * s / 3), 0.14 * s / 3)
        P.light((wr[0], wr[1], wr[2] - 0.7 * s / 3), (0.6, 0.8, 1.0), 200, 0.05)


def b_fan(P):
    """Ventilation fan set in the local -y face: frame ring + hub + blades.  params: R, blades."""
    lx, lz = P.lx, P.lz
    R = P.g('R', min(lx, lz) / 2 * 0.9)
    cx, cz = lx / 2, lz / 2
    KIT.ring_segments(P, P.mat or 'ug_steel', -0.1, 0.8, R + 0.5, 0.5, n=24, cy=cx, cz=cz) if False else None
    for i in range(24):
        a0, a1 = 2 * math.pi * i / 24, 2 * math.pi * (i + 1) / 24
        r0, r1 = R, R + 0.5
        P.hexa(P.mat or 'ug_steel', [(cx + r0 * math.cos(a0), -0.6, cz + r0 * math.sin(a0)), (cx + r1 * math.cos(a0), -0.6, cz + r1 * math.sin(a0)),
                                     (cx + r1 * math.cos(a1), -0.6, cz + r1 * math.sin(a1)), (cx + r0 * math.cos(a1), -0.6, cz + r0 * math.sin(a1)),
                                     (cx + r0 * math.cos(a0), 0.2, cz + r0 * math.sin(a0)), (cx + r1 * math.cos(a0), 0.2, cz + r1 * math.sin(a0)),
                                     (cx + r1 * math.cos(a1), 0.2, cz + r1 * math.sin(a1)), (cx + r0 * math.cos(a1), 0.2, cz + r0 * math.sin(a1))])
    P.cyl('steel_dark', (cx, -0.5, cz), (cx, 0.3, cz), R * 0.18, n=16)
    nb = P.g('blades', 7)
    for k in range(nb):
        a = 2 * math.pi * k / nb
        P.obox('steel_light', (cx + math.cos(a) * R * 0.55, -0.1, cz + math.sin(a) * R * 0.55), (math.cos(a), 0, math.sin(a)),
               (0, 1, 0), (-math.sin(a), 0.35, math.cos(a)), R * 0.4, 0.05, R * 0.12)
    P.raw_box('void_dark', cx - R, 0.25, cz - R, cx + R, 0.3, cz + R)


def b_striplight(P):
    """Emissive bar along local x with lights every `every` m.  params: mat, col, power, every."""
    lx = P.lx
    P.raw_box(P.mat or 'ug_light', 0, 0, 0, lx, P.ly, P.lz)
    ev = P.g('every', 8.0)
    x = ev / 2
    while x < lx:
        P.light((x, P.ly / 2, -0.6), tuple(P.g('col', (1.0, 0.75, 0.45))), P.g('power', 200), 0.3)
        x += ev


BUILDERS = {'earth': b_earth, 'borehole': b_borehole, 'lining': b_lining, 'tunnel': b_tunnel, 'walkway': b_walkway,
            'pendant': b_pendant, 'cablespan': b_cablespan, 'hangar': b_hangar, 'tbm': b_tbm, 'scaffold': b_scaffold,
            'robotarm': b_robotarm, 'fan': b_fan, 'striplight': b_striplight}


def register(kit):
    global KIT
    KIT = kit
