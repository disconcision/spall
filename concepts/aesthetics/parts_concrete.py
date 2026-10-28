"""
parts_concrete.py - brutalist, tetrapod and breakwater concrete (Blender side).

Every builder reads the part's resolved bevel policy (P._bev, from params.bevel or the style) through bv(),
so the same spec renders blocky (no policy), chamfered (style 'brut_hewn') or rounded (a 'round' policy).

  cblock     generic block: chamfer / round / step edges per group, random or explicit hewing cuts
  bmass      brutalist mass with facade treatments per face (eggcrate, fins, slots, blank); chamfered corners
             make the facade grids stop short and turn the corner as a blank board-formed facet
  bcol       column: square / octagonal / tapered / tree-capital / tripod foot
  bbeam      deep beam or girder with chamfered soffit and haunches
  btower     round or octagonal service / stair tower with slit windows
  tetrapod   one tetrapod unit;  dolos, acube: other breakwater units
  armour     a revetment / pile of armour units over the footprint, sloping to a toe
  tripod     a tetrapod-derived support: a shaft that splays into three (or four) legs
  megaframe  orthogonal concrete frame with chamfered members, haunched joints, optional pods
  diamond    tetrapod lattice (diamond-cubic bonds, [111] vertical) with waisted struts and nodes
  cpier      bridge / viaduct pier with cutwaters and a hammerhead cap
"""
import math
import random

import paths as PT
import prims

KIT = None


def bv(P, size, k=1.0):
    """Chamfer size for an element of cross-section `size` under the part's bevel policy (0 when blocky)."""
    b = getattr(P, '_bev', None)
    if not b:
        return 0.0
    if 'abs_v' in b:
        return min(b['abs_v'] * k, size * 0.3)
    return min(b.get('max', 2.5) * k, max(b.get('lo', 0.06), b.get('rel', 0.09) * size * k), size * 0.3)


def bmode(P):
    b = getattr(P, '_bev', None) or {}
    return b.get('mode', 'chamfer'), b.get('seg', 3), b.get('steps', 2)


def cb(P, mat, x0, y0, z0, x1, y1, z1, k=1.0, top=None, bot=0.0, vk=1.0, cs=None):
    """Box that follows the part's bevel policy even for small members (fins, beams, spandrels)."""
    size = min(abs(x1 - x0), abs(y1 - y0))
    c = bv(P, size, k)
    if c <= 1e-3:
        return P.raw_box(mat, x0, y0, z0, x1, y1, z1)
    mode, seg, steps = bmode(P)
    t = c * 0.6 if top is None else top
    return prims.cbox(P, mat, x0, y0, z0, x1, y1, z1, v=c * vk, top=min(t, abs(z1 - z0) * 0.4), bot=bot * c, mode=mode, seg=seg,
                      steps=steps, cs=cs)


# ------------------------------------------------------------------------------------------------ generic block
def b_cblock(P):
    """params: v, top, bot (m), mode, tmode, seg, steps, corners [SW,SE,NE,NW] (per-corner cuts), hew (n random
    cuts), cuts [[co],[no]] explicit, depth [lo,hi]; if v/top are absent the bevel policy sizes them."""
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'bconc'
    auto = bv(P, min(lx, ly))
    v = P.g('v', auto)
    top = P.g('top', auto * 0.55)
    bot = P.g('bot', 0.0)
    mode, seg, steps = bmode(P)
    mode = P.g('mode', mode)
    hew = P.g('hew', 0) if (P._bev or P.g('force_hew')) else 0
    cuts = [(tuple(c[0]), tuple(c[1])) for c in P.g('cuts', [])]
    if hew or cuts:
        prims.hewn(P, m, 0, 0, 0, lx, ly, lz, v=v, top=top, bot=bot, mode=mode, tmode=P.g('tmode'), seg=P.g('seg', seg),
                   steps=P.g('steps', steps), cs=P.g('corners'), cuts=cuts, rng=P.rng, n_cuts=hew,
                   depth=tuple(P.g('depth', (0.12, 0.3))))
    else:
        prims.cbox(P, m, 0, 0, 0, lx, ly, lz, v=v, top=top, bot=bot, mode=mode, tmode=P.g('tmode'), seg=P.g('seg', seg),
                   steps=P.g('steps', steps), cs=P.g('corners'))


# ------------------------------------------------------------------------------------------------ brutalist mass
def _win(P, lit):
    return KIT.pick_win(P, lit)


def _face_frame(face, lx, ly):
    """Return a mapper (a, depth, z) -> local (x, y, z) for a face; a runs along the face left->right as seen from
    outside, depth > 0 points out of the face."""
    if face == 's':
        return lambda a, d, z: (a, -d, z), lx
    if face == 'n':
        return lambda a, d, z: (lx - a, ly + d, z), lx
    if face == 'w':
        return lambda a, d, z: (-d, ly - a, z), ly
    return lambda a, d, z: (lx + d, a, z), ly


def _fbox(P, mat, F, a0, a1, d0, d1, z0, z1, bevel=True, k=1.0):
    p0 = F(a0, d0, z0); p1 = F(a1, d1, z1)
    if bevel:
        cb(P, mat, min(p0[0], p1[0]), min(p0[1], p1[1]), z0, max(p0[0], p1[0]), max(p0[1], p1[1]), z1, k=k)
    else:
        P.raw_box(mat, min(p0[0], p1[0]), min(p0[1], p1[1]), z0, max(p0[0], p1[0]), max(p0[1], p1[1]), z1)


def b_bmass(P):
    """Brutalist mass.  params:
       faces {s,n,e,w: eggcrate|fins|slots|blank|none}, fw module (3.2), fh floor (P.lh), dp reveal depth (1.1),
       base: none|recess|open (ground floor recessed by dp*1.5 / open pilotis storey), roof: parapet|plant|none,
       lit (window fraction), corner (plan corner chamfer in m; default from the bevel policy), hew (random cuts on
       the roof mass), glass (material for dark glass)."""
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'bconc'
    fw, fh = P.g('fw', 3.2), P.g('fh', P.lh)
    dp = P.g('dp', 1.1)
    lit = P.g('lit', 0.4)
    faces = P.g('faces', {})
    default = P.g('face', 'eggcrate')
    corner = P.g('corner', bv(P, min(lx, ly), 1.0) * 1.6)
    base = P.g('base', 'recess')
    z_base = fh if base in ('recess', 'open') else 0.0
    mode, seg, steps = bmode(P)
    # the core mass (inset behind the facade elements)
    ins = {f: (dp if faces.get(f, default) in ('eggcrate', 'fins', 'slots') else 0.0) for f in 'snew'}
    x0, x1 = ins['w'], lx - ins['e']
    y0, y1 = ins['s'], ly - ins['n']
    ccut = max(0.0, corner - min(ins.values()) * 0.6)
    if base == 'recess':
        r = dp * 1.4
        cb(P, P.g('base_mat', 'bconc_dark'), x0 + r, y0 + r, 0, x1 - r, y1 - r, z_base, k=0.5)
        # glazed lobby band
        P.raw_box('glass', x0 + r - 0.05, y0 + r - 0.05, 0.2, x1 - r + 0.05, y1 - r + 0.05, z_base - 0.5)
    elif base == 'open':
        n = max(2, int(lx / (fw * 3)))
        for i in range(n + 1):
            for yy in (y0 + dp, y1 - dp):
                x = x0 + dp + (x1 - x0 - 2 * dp) * i / n
                s = P.g('col', 1.4)
                cb(P, m, x - s / 2, yy - s / 2, 0, x + s / 2, yy + s / 2, z_base, k=0.8)
    zt = lz
    top_c = min(bv(P, min(lx, ly)) * 0.8, 2.0)
    prims_mode = mode
    if ccut > 0.05:
        prims.cbox(P, m, x0, y0, z_base, x1, y1, zt, v=ccut, top=top_c * 0.5, bot=0.0, mode=prims_mode, seg=seg, steps=steps)
    else:
        P.raw_box(m, x0, y0, z_base, x1, y1, zt)
    # facades
    for face in 'snew':
        kind = faces.get(face, default)
        if kind in ('none', 'blank'):
            if kind == 'blank':
                F, L = _face_frame(face, lx, ly)
                # a few vertical slit windows on blank board-formed walls
                n = max(1, int(L / 9.0))
                for i in range(n):
                    a = (i + 0.5) * L / n
                    for zz in range(int(z_base // fh), int(zt // fh)):
                        if P.rng.random() < 0.55:
                            _fbox(P, _win(P, lit), F, a - 0.18, a + 0.18, -0.02, 0.06, zz * fh + 0.6, zz * fh + fh - 0.5, bevel=False)
            continue
        F, L = _face_frame(face, lx, ly)
        cl = ccut + (ins[face] if ccut > 0.05 else 0.0)
        a_lo, a_hi = cl, L - cl
        if a_hi - a_lo < fw:
            continue
        n = max(1, int(round((a_hi - a_lo) / fw)))
        mod = (a_hi - a_lo) / n
        nf = int(round((zt - z_base) / fh))
        fdp = ins[face]
        if kind == 'eggcrate':
            fin = P.g('fin', 0.42)
            for i in range(n + 1):
                a = a_lo + i * mod
                _fbox(P, m, F, a - fin / 2, a + fin / 2, -0.01, fdp, z_base, zt - 0.02, k=0.6)
            for j in range(nf + 1):
                z = z_base + j * fh
                sp = P.g('spandrel', 0.55)
                _fbox(P, m, F, a_lo, a_hi, -0.01, fdp, max(z_base, z - sp / 2), min(zt, z + sp / 2), k=0.5)
            for i in range(n):
                for j in range(nf):
                    a = a_lo + (i + 0.5) * mod
                    z = z_base + j * fh
                    _fbox(P, _win(P, lit), F, a - mod / 2 + 0.3, a + mod / 2 - 0.3, -0.06, 0.02, z + 0.45, z + fh - 0.35, bevel=False)
        elif kind == 'fins':
            fin = P.g('fin', 0.5)
            for i in range(n + 1):
                a = a_lo + i * mod
                _fbox(P, m, F, a - fin / 2, a + fin / 2, -0.01, fdp * 1.2, z_base, zt - 0.02, k=0.6)
            for i in range(n):
                a = a_lo + (i + 0.5) * mod
                for j in range(nf):
                    z = z_base + j * fh
                    _fbox(P, _win(P, lit), F, a - mod / 2 + 0.35, a + mod / 2 - 0.35, -0.06, 0.02, z + 0.3, z + fh - 0.3, bevel=False)
                    _fbox(P, 'steel_dark', F, a - mod / 2 + 0.35, a + mod / 2 - 0.35, -0.02, 0.1, z + fh - 0.3, z + fh - 0.05, bevel=False)
        elif kind == 'slots':
            for j in range(nf):
                z = z_base + j * fh
                band = P.g('band', 0.5)
                _fbox(P, m, F, a_lo, a_hi, -0.01, fdp, z + fh * band, z + fh, k=0.7)
                n2 = max(1, int((a_hi - a_lo) / 2.4))
                for i in range(n2):
                    a0 = a_lo + (a_hi - a_lo) * i / n2
                    _fbox(P, _win(P, lit), F, a0 + 0.1, a0 + (a_hi - a_lo) / n2 - 0.1, -0.06, 0.02, z + 0.25, z + fh * band - 0.1,
                          bevel=False)
    # roof
    roof = P.g('roof', 'parapet')
    if roof in ('parapet', 'plant'):
        ph = P.g('parapet_h', 1.6)
        # heavy attic band over the whole footprint (covers the facade tops); chamfered when a policy is active
        if ccut > 0.05:
            prims.cbox(P, m, -0.15, -0.15, zt, lx + 0.15, ly + 0.15, zt + ph, v=corner * 0.95, top=min(ph * 0.45, corner * 0.4),
                       bot=min(ph * 0.3, corner * 0.25), mode=mode, seg=seg, steps=steps)
        else:
            P.raw_box(m, -0.15, -0.15, zt, lx + 0.15, ly + 0.15, zt + ph)
        if roof == 'plant':
            w, d = (x1 - x0) * P.g('plant_w', 0.45), (y1 - y0) * P.g('plant_d', 0.5)
            px0 = x0 + (x1 - x0 - w) * P.g('plant_x', 0.5)
            py0 = y0 + (y1 - y0 - d) * P.g('plant_y', 0.5)
            hh = P.g('plant_h', 5.0)
            if P.g('hew', 0) and P._bev:
                prims.hewn(P, m, px0, py0, zt + ph, px0 + w, py0 + d, zt + ph + hh, v=bv(P, min(w, d)), top=bv(P, min(w, d)) * 0.6,
                           mode=mode, seg=seg, steps=steps, rng=P.rng, n_cuts=P.g('hew', 0), depth=(0.2, 0.45))
            else:
                cb(P, m, px0, py0, zt + ph, px0 + w, py0 + d, zt + ph + hh)
            # louvres on the plant room
            for k in range(3):
                zz = zt + 1.0 + k * 1.2
                P.raw_box('steel_dark', px0 + w * 0.2, py0 - 0.08, zz + ph, px0 + w * 0.8, py0 + 0.02, zz + ph + 0.5)


# ------------------------------------------------------------------------------------------------ columns / beams / towers
def b_bcol(P):
    """Column.  params: shape square|octagon|round, taper (top/base width ratio), capital none|flare|tree, foot none|flare,
    size (m, default min(lx,ly))."""
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'bconc'
    s = P.g('size', min(lx, ly))
    cx, cy = lx / 2, ly / 2
    shape = P.g('shape', 'square')
    taper = P.g('taper', 1.0)
    cap = P.g('capital', 'none')
    foot = P.g('foot', 'none')
    zc0 = 0.0
    zc1 = lz
    if foot == 'flare':
        fh = min(lz * 0.15, s * 1.2)
        prims.leg(P, m, (cx, cy, 0), (cx, cy, fh), s * 0.9, s * 0.52, n=8 if shape != 'round' else 16, cap0=0.0)
        zc0 = fh
    if cap in ('flare', 'tree'):
        chh = min(lz * 0.2, s * (1.6 if cap == 'tree' else 1.0))
        zc1 = lz - chh
        if cap == 'flare':
            prims.leg(P, m, (cx, cy, zc1), (cx, cy, lz), s * 0.52 * taper, s * 1.1, n=8 if shape != 'round' else 16)
        else:
            for k in range(4):
                a = math.pi / 4 + k * math.pi / 2
                tip = (cx + math.cos(a) * s * 1.6, cy + math.sin(a) * s * 1.6, lz)
                prims.leg(P, m, (cx, cy, zc1 - s * 0.3), tip, s * 0.36, s * 0.26, n=8, cap1=s * 0.05)
    if shape == 'square':
        c = bv(P, s)
        if taper != 1.0:
            prims.leg(P, m, (cx, cy, zc0), (cx, cy, zc1), s / 2 * 1.08, s / 2 * taper * 1.08, n=8 if c > 0.01 else 4,
                      phase=math.pi / 8 if c > 0.01 else math.pi / 4)
        else:
            cb(P, m, cx - s / 2, cy - s / 2, zc0, cx + s / 2, cy + s / 2, zc1, top=0.0)
    elif shape == 'octagon':
        prims.leg(P, m, (cx, cy, zc0), (cx, cy, zc1), s / 2 * 1.08, s / 2 * taper * 1.08, n=8)
    else:
        prims.leg(P, m, (cx, cy, zc0), (cx, cy, zc1), s / 2, s / 2 * taper, n=16)


def b_bbeam(P):
    """Beam / girder along local x: section ly x lz; params: haunch (m) at both ends, soffit chamfer via the policy,
    upstand (m) parapet on top edges, windows (bridge building: rows of windows on both long faces)."""
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'bconc'
    c = bv(P, min(ly, lz))
    mode, seg, steps = bmode(P)
    if c > 0.01:
        # rotate the idea: chamfer the long edges -> build as a loft along x of a chamfered section
        prof = prims.outline(0, 0, ly, lz, c, mode if mode != 'step' else 'chamfer', seg, steps)
        rings = [[(x, y, z) for (y, z) in prof] for x in (0.0, lx)]
        prims.loft(P, m, rings)
    else:
        P.raw_box(m, 0, 0, 0, lx, ly, lz)
    hn = P.g('haunch', 0.0)
    if hn:
        for x0, sgn in ((0.0, 1), (lx, -1)):
            prims.prism3(P, m, [(x0, 0.0, 0.0), (x0 + sgn * hn, 0.0, 0.0), (x0, 0.0, -hn)], (0.0, ly, 0.0))
    if P.g('windows'):
        fh = P.g('fh', 3.5)
        nf = max(1, int(lz / fh))
        n = max(1, int(lx / 2.6))
        for j in range(nf):
            z = j * fh + (lz - nf * fh) / 2
            for i in range(n):
                x = (i + 0.5) * lx / n
                for y, o in ((0.0, -1), (ly, 1)):
                    w = KIT.pick_win(P, P.g('lit', 0.5))
                    P.raw_box(w, x - 0.7, y - 0.06 if o < 0 else y - 0.02, z + 0.8, x + 0.7, y + 0.02 if o < 0 else y + 0.06, z + fh - 0.6)


def b_btower(P):
    """Round / octagonal / chamfered-square service tower with slit windows and a crown.
    params: shape round|octagon|square, slits (n per ring), crown (m), lit."""
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'bconc'
    shape = P.g('shape', 'round')
    r = min(lx, ly) / 2
    cx, cy = lx / 2, ly / 2
    n = {'round': 20, 'octagon': 8, 'square': 4}[shape]
    ph = math.pi / n if shape != 'square' else math.pi / 4
    rr = r if shape != 'square' else r * math.sqrt(2)
    if shape == 'square' and bv(P, 2 * r) > 0.01:
        cb(P, m, cx - r, cy - r, 0, cx + r, cy + r, lz)
    else:
        prims.leg(P, m, (cx, cy, 0), (cx, cy, lz), rr, rr, n=n, phase=ph)
    cr = P.g('crown', 3.0)
    if cr:
        prims.leg(P, m, (cx, cy, lz), (cx, cy, lz + cr), rr * 1.12, rr * 1.12, n=n, phase=ph, cap1=min(0.8, cr * 0.3))
    ns = P.g('slits', 6)
    fh = P.g('fh', P.lh)
    nf = int(lz / fh)
    for j in range(1, nf):
        if P.rng.random() > P.g('slit_p', 0.7):
            continue
        for k in range(ns):
            a = 2 * math.pi * (k + 0.5 * (j % 2)) / ns
            x, y = cx + math.cos(a) * r, cy + math.sin(a) * r
            P.obox(KIT.pick_win(P, P.g('lit', 0.4)), (x, y, j * fh + fh * 0.5), (math.cos(a), math.sin(a), 0),
                   (-math.sin(a), math.cos(a), 0), (0, 0, 1), 0.12, 0.2, fh * 0.32)


# ------------------------------------------------------------------------------------------------ breakwater units
TETRA_DIRS = None


def _rot_from(rng=None, up_only=False, yaw=None):
    from mathutils import Euler, Quaternion
    if up_only:
        return Euler((0, 0, yaw if yaw is not None else rng.uniform(0, 2 * math.pi))).to_matrix()
    u1, u2, u3 = rng.random(), rng.random(), rng.random()
    q = Quaternion((math.sqrt(1 - u1) * math.sin(2 * math.pi * u2), math.sqrt(1 - u1) * math.cos(2 * math.pi * u2),
                    math.sqrt(u1) * math.sin(2 * math.pi * u3), math.sqrt(u1) * math.cos(2 * math.pi * u3)))
    return q.to_matrix()


def tetrapod_at(P, mat, c, L, R, legs=4, n=8, r0k=0.3, r1k=0.18, cap=0.25):
    from mathutils import Vector
    """Tetrapod centred at c: legs of length L (centre to tip) in tetrahedral directions rotated by 3x3 R."""
    th = math.acos(-1.0 / 3.0)
    dirs = [(0.0, 0.0, 1.0)] + [(math.sin(th) * math.cos(a), math.sin(th) * math.sin(a), math.cos(th))
                                for a in (0.0, 2 * math.pi / 3, 4 * math.pi / 3)]
    for d in dirs[:legs] if legs <= 4 else dirs:
        v = R @ Vector(d)
        tip = (c[0] + v.x * L, c[1] + v.y * L, c[2] + v.z * L)
        prims.leg(P, mat, c, tip, L * r0k, L * r1k, n=n, cap1=L * r1k * cap)
    P.ico(mat, c, L * r0k * 1.12)


def dolos_at(P, mat, c, L, R, n=8):
    from mathutils import Vector
    a = L * 0.5
    b = L * 0.42
    ax = R @ Vector((1, 0, 0)); ay = R @ Vector((0, 1, 0)); az = R @ Vector((0, 0, 1))
    C = Vector(c)
    p0, p1 = C - ax * a, C + ax * a
    prims.leg(P, mat, tuple(p0), tuple(p1), L * 0.13, L * 0.13, n=n)
    prims.leg(P, mat, tuple(p0 - ay * b), tuple(p0 + ay * b), L * 0.16, L * 0.16, n=n, cap0=L * 0.04, cap1=L * 0.04)
    prims.leg(P, mat, tuple(p1 - az * b), tuple(p1 + az * b), L * 0.16, L * 0.16, n=n, cap0=L * 0.04, cap1=L * 0.04)


def acube_at(P, mat, c, L, R):
    """Chamfered armour cube (Antifer-like) rotated by R: built as a chamfered box then rotated vertex-wise."""
    from mathutils import Vector
    h = L / 2
    vs, fs = prims.cbox_geom(-h, -h, -h, h, h, h, v=L * 0.12, top=L * 0.1, bot=L * 0.1)
    vs = [tuple(Vector(c) + R @ Vector(p)) for p in vs]
    P.poly(vs, fs, mat)


def b_tetrapod(P):
    """One unit. params: unit tetrapod|dolos|cube, size (m, centre-to-tip for tetrapods), rest ('stand' = on 3 legs,
    'random'), yaw (deg)."""
    L = P.g('size', min(P.lx, P.ly) * 0.5)
    unit = P.g('unit', 'tetrapod')
    m = P.mat or 'tetra'
    rest = P.g('rest', 'stand')
    R = _rot_from(P.rng, up_only=(rest == 'stand'), yaw=math.radians(P.g('yaw', P.rng.uniform(0, 360))))
    cz = L / 3.0 if (unit == 'tetrapod' and rest == 'stand') else L * 0.45
    c = (P.lx / 2, P.ly / 2, cz + P.g('lift', 0.0))
    if unit == 'tetrapod':
        tetrapod_at(P, m, c, L, R)
    elif unit == 'dolos':
        dolos_at(P, m, c, L, R)
    else:
        acube_at(P, m, c, L, R)


def b_armour(P):
    """Pile / revetment of armour units over the footprint.  params: unit tetrapod|dolos|cube|mix, size, layers (2),
    slope_face (s|n|e|w|none: the toe side), h0 (m, pile top height at the back), mats (list), density (1.0)."""
    lx, ly = P.lx, P.ly
    L = P.g('size', 3.0)
    unit = P.g('unit', 'tetrapod')
    mats = P.g('mats', [P.mat or 'tetra', 'tetra', 'tetra_old'])
    layers = P.g('layers', 2)
    face = P.g('slope_face', 's')
    h0 = P.g('h0', L * 1.2)
    dens = P.g('density', 1.0)
    rng = P.rng
    step = L * 1.15 / math.sqrt(dens)
    nx, ny = max(1, int(lx / step)), max(1, int(ly / step))
    if P.g('pattern', True) and unit == 'tetrapod':
        # placed, not dumped: standing units in staggered rows, alternating yaw, each row stepping up the slope
        for layer in range(layers):
            for j in range(ny):
                for i in range(nx):
                    x = (i + 0.5 + (0.5 if (j + layer) % 2 else 0.0)) * lx / nx
                    y = (j + 0.5) * ly / ny
                    if not (0 <= x <= lx):
                        continue
                    t = {'s': y / ly, 'n': 1 - y / ly, 'w': x / lx, 'e': 1 - x / lx}.get(face, 1.0)
                    z = h0 * t * 0.8 + layer * L * 0.5
                    yaw = math.radians(60.0 * ((i + j + layer) % 2) + (30 if face in 'ew' else 0))
                    R = _rot_from(rng, up_only=True, yaw=yaw)
                    tetrapod_at(P, rng.choice(mats), (x, y, z + L / 3.0), L, R, n=6)
        return
    for layer in range(layers):
        for i in range(nx):
            for j in range(ny):
                if rng.random() > 0.93:
                    continue
                x = (i + 0.5 + (0.5 if (j + layer) % 2 else 0.0) * 0.8) * lx / nx + rng.uniform(-0.25, 0.25) * step
                y = (j + 0.5) * ly / ny + rng.uniform(-0.25, 0.25) * step
                if not (0 <= x <= lx and 0 <= y <= ly):
                    continue
                t = {'s': y / ly, 'n': 1 - y / ly, 'w': x / lx, 'e': 1 - x / lx}.get(face, 1.0)
                zb = h0 * t * 0.85 if face != 'none' else 0.0
                z = zb + layer * L * 0.55 + rng.uniform(0, L * 0.15)
                u = unit if unit != 'mix' else rng.choice(('tetrapod', 'tetrapod', 'dolos', 'cube'))
                R = _rot_from(rng)
                mm = rng.choice(mats)
                if u == 'tetrapod':
                    tetrapod_at(P, mm, (x, y, z + L * 0.35), L * rng.uniform(0.9, 1.05), R, n=6)
                elif u == 'dolos':
                    dolos_at(P, mm, (x, y, z + L * 0.35), L * 1.2, R, n=6)
                else:
                    acube_at(P, mm, (x, y, z + L * 0.4), L * 0.8, R)


def b_tripod(P):
    """Tetrapod-derived support: shaft from the top down to a node, three splayed legs to the ground (four with legs=4).
    params: node (0..1 of height where legs split, 0.4), splay (m, leg foot radius), r (shaft radius), legs, cap (top
    flare: 'tri' = three arms up as well, like a full tetrapod node)."""
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'tetra'
    cx, cy = lx / 2, ly / 2
    r = P.g('r', min(lx, ly) * 0.14)
    zn = lz * P.g('node', 0.4)
    sp = P.g('splay', min(lx, ly) * 0.5)
    nl = P.g('legs', 3)
    a0 = math.radians(P.g('yaw', 90))
    prims.leg(P, m, (cx, cy, zn), (cx, cy, lz), r * 1.05, r * 0.9, n=8)
    for k in range(nl):
        a = a0 + 2 * math.pi * k / nl
        foot = (cx + math.cos(a) * sp, cy + math.sin(a) * sp, 0.0)
        prims.leg(P, m, (cx, cy, zn + r * 0.3), foot, r * 1.1, r * 0.72, n=8, cap1=r * 0.2)
    P.ico(m, (cx, cy, zn + r * 0.2), r * 1.45)
    if P.g('cap', 'none') == 'tri':
        zt = lz
        for k in range(nl):
            a = a0 + math.pi / nl + 2 * math.pi * k / nl
            tip = (cx + math.cos(a) * sp * 0.55, cy + math.sin(a) * sp * 0.55, zt + r * 0.2)
            prims.leg(P, m, (cx, cy, zt - sp * 0.45), tip, r * 0.9, r * 0.6, n=8, cap1=r * 0.15)


# ------------------------------------------------------------------------------------------------ frames
def b_megaframe(P):
    """Orthogonal concrete megaframe.  params: bx, by (bay size m), bz (storeys per frame level), col (m), beam (m depth),
    haunch (m), pods (fill probability 0..1), pod_mat, decks (list of frame levels with a floor slab), roof_garden."""
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'bconc'
    bx, by = P.g('bx', 12.0), P.g('by', 12.0)
    fz = P.g('bz', 3) * P.lh
    col = P.g('col', 1.6)
    bd = P.g('beam', 1.8)
    hn = P.g('haunch', 1.2)
    nx, ny, nz = max(1, int(round(lx / bx))), max(1, int(round(ly / by))), max(1, int(round(lz / fz)))
    bx, by, fz = lx / nx, ly / ny, lz / nz
    c = bv(P, col)
    for i in range(nx + 1):
        for j in range(ny + 1):
            x, y = i * bx, j * by
            cb(P, m, x - col / 2, y - col / 2, 0, x + col / 2, y + col / 2, lz, top=0.0)
    for k in range(1, nz + 1):
        z = k * fz
        for j in range(ny + 1):
            y = j * by
            for i in range(nx):
                x0, x1 = i * bx + col / 2, (i + 1) * bx - col / 2
                cb(P, m, x0, y - col * 0.4, z - bd, x1, y + col * 0.4, z, k=0.7, top=0.0, bot=0.8)
                if hn and c > 0.01:
                    for xa, sg in ((x0, 1), (x1, -1)):
                        prims.prism3(P, m, [(xa, y - col * 0.35, z - bd), (xa + sg * hn, y - col * 0.35, z - bd),
                                            (xa, y - col * 0.35, z - bd - hn)], (0.0, col * 0.7, 0.0))
        for i in range(nx + 1):
            x = i * bx
            for j in range(ny):
                y0, y1 = j * by + col / 2, (j + 1) * by - col / 2
                cb(P, m, x - col * 0.4, y0, z - bd, x + col * 0.4, y1, z, k=0.7, top=0.0, bot=0.8)
    decks = P.g('decks', [])
    for k in decks:
        z = k * fz
        cb(P, P.g('deck_mat', m), 0, 0, z - 0.45, lx, ly, z - bd * 0.2, k=0.3)
    pods = P.g('pods', 0.0)
    if pods:
        pm = P.g('pod_mat', 'capsule_white')
        for i in range(nx):
            for j in range(ny):
                for k in range(nz):
                    if P.rng.random() > pods:
                        continue
                    x0, y0 = i * bx + col, j * by + col
                    x1, y1 = (i + 1) * bx - col, (j + 1) * by - col
                    z0 = k * fz + (0.0 if k == 0 else 0.0)
                    npod = P.rng.choice((1, 2, 2, 3))
                    ph = (fz - bd) / npod
                    for q in range(npod):
                        if P.rng.random() < 0.25:
                            continue
                        w = (x1 - x0) * P.rng.uniform(0.55, 0.95)
                        d = (y1 - y0) * P.rng.uniform(0.55, 0.95)
                        ox = x0 + P.rng.uniform(0, x1 - x0 - w)
                        oy = y0 + P.rng.uniform(0, y1 - y0 - d)
                        zz = z0 + q * ph + 0.1
                        Q = _sub(P, 'capsule', ox, oy, zz, w, d, ph - 0.2, pm, {'win': P.rng.choice(('grid', 'band', 'round')),
                                                                                  'interior': False, 'lit': P.g('lit', 0.45),
                                                                                  'balcony': P.rng.random() < 0.3})
                        KIT.b_capsule(Q)


def _sub(P, typ, x, y, z, w, d, h, mat, params):
    """A child Part in P's local metres sharing P's buffer (used to reuse kit builders inside a composite)."""
    Q = KIT.Part({'type': typ, 'material': mat, 'params': params}, {'cell': 1.0, 'level': P.lh}, 0, 0, P.mats, P.style)
    Q.lx, Q.ly, Q.lz = w, d, h
    Q.rng = random.Random(P.rng.random())
    Q.p = dict(params)
    Q.mat = mat
    base = P.xf
    Q.xf = lambda p, b=base: b((p[0] + x, p[1] + y, p[2] + z))
    Q.buf = P.buf
    Q.lights = P.lights
    Q._bev = P._bev
    return Q


def b_diamond(P):
    """Tetrapod lattice: diamond-cubic nodes (cube edge a) with [111] vertical, clipped to the footprint; each bond is
    two tapered legs meeting mid-span (waisted strut) and each node a bulb.  params: a (m), r (node leg radius),
    decks (list of z metres), pods (0..1)."""
    from mathutils import Matrix, Vector
    lx, ly, lz = P.lx, P.ly, P.lz
    a = P.g('a', 24.0)
    r = P.g('r', a * 0.055)
    m = P.mat or 'tetra'
    # rotation taking (1,1,1)/sqrt3 to +z
    v = Vector((1, 1, 1)).normalized()
    R = v.rotation_difference(Vector((0, 0, 1))).to_matrix()
    R = Matrix.Rotation(math.radians(P.g('yaw', 15)), 3, 'Z') @ R
    basis = [Vector((0, 0, 0)), Vector((0, .5, .5)), Vector((.5, 0, .5)), Vector((.5, .5, 0))]
    nodes = []
    N = int(max(lx, ly, lz) / a) + 3
    off = Vector((lx / 2, ly / 2, P.g('z0', 0.0)))
    for i in range(-N, N + 1):
        for j in range(-N, N + 1):
            for k in range(-N, N + 1):
                for b in basis:
                    for s in (Vector((0, 0, 0)), Vector((.25, .25, .25))):
                        p = R @ ((Vector((i, j, k)) + b + s) * a) + off
                        if -0.01 <= p.x <= lx + 0.01 and -0.01 <= p.y <= ly + 0.01 and -0.01 <= p.z <= lz + 0.01:
                            nodes.append((p, s.length > 0))
    bl = a * math.sqrt(3) / 4
    dirs = [Vector((1, 1, 1)), Vector((1, -1, -1)), Vector((-1, 1, -1)), Vector((-1, -1, 1))]
    dirs = [R @ (d.normalized()) for d in dirs]
    seen = set()
    for p, isB in nodes:
        P.ico(m, tuple(p), r * 1.7)
        for d in dirs:
            dd = d if not isB else -d
            q = p + dd * bl
            key = tuple(round(c, 2) for c in (p + q) / 2)
            if key in seen:
                continue
            inside = (-0.01 <= q.x <= lx + 0.01 and -0.01 <= q.y <= ly + 0.01 and -0.01 <= q.z <= lz + 0.01)
            if not inside and q.z > -0.01:
                # stub leg toward the outside, like a tetrapod leg
                prims.leg(P, m, tuple(p), tuple(p + dd * bl * 0.42), r * 1.3, r * 0.8, n=8, cap1=r * 0.2)
                continue
            if q.z < -0.01:
                # leg to the ground
                t = -p.z / (q.z - p.z) if abs(q.z - p.z) > 1e-6 else 1.0
                g = p + (q - p) * t
                prims.leg(P, m, tuple(p), tuple(g), r * 1.3, r * 1.05, n=8)
                continue
            seen.add(key)
            mid = (p + q) / 2
            prims.leg(P, m, tuple(p), tuple(mid), r * 1.3, r * 0.85, n=8)
            prims.leg(P, m, tuple(q), tuple(mid), r * 1.3, r * 0.85, n=8)
    for z in P.g('decks', []):
        cb(P, P.g('deck_mat', 'bconc_light'), 0, 0, z - 0.5, lx, ly, z, k=0.3)


def b_cpier(P):
    """Bridge pier: chamfered shaft with pointed cutwaters on its short faces and a hammerhead cap."""
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'bconc'
    w = P.g('w', min(lx, ly) * 0.35)
    capw = P.g('cap_w', max(lx, ly))
    caph = P.g('cap_h', 2.4)
    cx, cy = lx / 2, ly / 2
    along = 'x' if lx >= ly else 'y'
    L = (lx if along == 'x' else ly) * 0.5
    zc = lz - caph
    # shaft as an elongated hexagon (cutwater points on both ends)
    pts = [(-L * 0.5, 0), (-L * 0.5 + w * 0.6, -w / 2), (L * 0.5 - w * 0.6, -w / 2), (L * 0.5, 0), (L * 0.5 - w * 0.6, w / 2),
           (-L * 0.5 + w * 0.6, w / 2)]
    if along == 'y':
        pts = [(-y, x) for x, y in pts]
    rings = [[(cx + x, cy + y, z) for x, y in pts] for z in (0.0, zc)]
    prims.loft(P, m, rings)
    # hammerhead cap: chamfered box with a sloped underside
    if along == 'x':
        prims.cbox(P, m, cx - capw / 2, cy - w * 0.9, zc, cx + capw / 2, cy + w * 0.9, lz, v=bv(P, w) * 0.8, top=0.0, bot=caph * 0.45,
                   mode='chamfer')
    else:
        prims.cbox(P, m, cx - w * 0.9, cy - capw / 2, zc, cx + w * 0.9, cy + capw / 2, lz, v=bv(P, w) * 0.8, top=0.0, bot=caph * 0.45,
                   mode='chamfer')


def b_strut(P):
    """Straight (often diagonal) member from params.a to params.b (local m): octagonal, tapered r0 -> r1, chamfered ends."""
    a, b = tuple(P.g('a')), tuple(P.g('b'))
    r0 = P.g('r0', 1.0)
    prims.leg(P, P.mat or 'bconc', a, b, r0, P.g('r1', r0), n=P.g('n', 8), cap0=P.g('cap0', 0.0), cap1=P.g('cap1', r0 * 0.2))
    if P.g('node'):
        P.ico(P.mat or 'bconc', a, r0 * 1.35)


BUILDERS = {
    'strut': b_strut,
    'cblock': b_cblock, 'bmass': b_bmass, 'bcol': b_bcol, 'bbeam': b_bbeam, 'btower': b_btower,
    'tetrapod': b_tetrapod, 'armour': b_armour, 'tripod': b_tripod, 'megaframe': b_megaframe, 'diamond': b_diamond,
    'cpier': b_cpier,
}


def register(kit):
    global KIT
    KIT = kit
