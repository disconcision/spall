"""
prims.py - bevel / chamfer / hew primitives for kit Parts (Blender side).

Every primitive works in the part's local metres and emits closed meshes through P.poly, so the kit's
cutaway / section / crop machinery (bmesh bisection + cap fill) keeps working on them.

  outline()     CCW plan outline of a rectangle with sharp / chamfered / rounded / stepped corners
  cbox()        box with independent vertical-edge, top-edge and bottom-edge treatment (the workhorse)
  loft()        connect rings of equal size into a closed solid
  prism()       regular n-gon prism / tapered leg between two arbitrary points, with chamfered ends
  sweep()       a 2D profile swept along a 3D path (pipes, cables, decks, troughs, belts)
  hewn()        cbox + oblique plane cuts ("tuning blocks by hewing away their edges")
"""
import math
import random

import paths as PT

EPS = 1e-3


# ----------------------------------------------------------------------------------------------- outlines
_CORNERS = (  # corner point selector, incoming and outgoing travel directions for a CCW walk SW -> SE -> NE -> NW
    (0, 0, (0.0, -1.0), (1.0, 0.0)),
    (1, 0, (1.0, 0.0), (0.0, 1.0)),
    (1, 1, (0.0, 1.0), (-1.0, 0.0)),
    (0, 1, (-1.0, 0.0), (0.0, -1.0)),
)


def corner_count(mode, seg=1, steps=2):
    return {'sharp': 1, 'chamfer': 2, 'round': seg + 1, 'step': 2 * steps + 1}[mode]


def outline(x0, y0, x1, y1, c=0.0, mode='chamfer', seg=3, steps=2, cs=None):
    """CCW (from +z) outline of the rectangle with its corners cut.  cs = per-corner cuts (SW, SE, NE, NW)."""
    if mode == 'sharp':
        return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    lim = min(x1 - x0, y1 - y0) / 2 - 1e-4
    out = []
    for k, (ix, iy, tin, tout) in enumerate(_CORNERS):
        cc = cs[k] if cs else c
        cc = max(EPS, min(cc, lim))
        K = (x1 if ix else x0, y1 if iy else y0)
        P0 = (K[0] - cc * tin[0], K[1] - cc * tin[1])
        if mode == 'chamfer':
            out += [P0, (K[0] + cc * tout[0], K[1] + cc * tout[1])]
        elif mode == 'round':
            cx, cy = P0[0] + cc * tout[0], P0[1] + cc * tout[1]
            a0 = math.atan2(-tout[1], -tout[0])
            for j in range(seg + 1):
                a = a0 + (math.pi / 2) * j / seg
                out.append((cx + cc * math.cos(a), cy + cc * math.sin(a)))
        else:  # step
            p = P0
            out.append(p)
            s = cc / steps
            for j in range(steps):
                p = (p[0] + s * tout[0], p[1] + s * tout[1]); out.append(p)
                p = (p[0] + s * tin[0], p[1] + s * tin[1]); out.append(p)
    return out


def _cut_after_inset(c, d, mode):
    if mode == 'chamfer':
        return max(EPS, c - (2 - math.sqrt(2)) * d)
    return max(EPS, c - d)


def _edge_profile(t, z, which, mode, seg, steps):
    """[(inset, z)] for a top ('top') or bottom ('bot') edge treatment of size t, listed bottom-to-top."""
    if which == 'top':
        if mode == 'round':
            return [(t - t * math.cos(math.pi / 2 * j / seg), z - t + t * math.sin(math.pi / 2 * j / seg)) for j in range(seg + 1)]
        if mode == 'step':
            out, i, zz, s = [(0.0, z - t)], 0.0, z - t, t / steps
            for j in range(steps):
                zz += s; out.append((i, zz)); i += s; out.append((i, zz))
            return out
        return [(0.0, z - t), (t, z)]
    if mode == 'round':
        return [(t - t * math.cos(math.pi / 2 * j / seg), z + t - t * math.sin(math.pi / 2 * j / seg)) for j in range(seg, -1, -1)]
    if mode == 'step':
        out, i, zz, s = [(t, z)], t, z, t / steps
        for j in range(steps):
            zz += s; out.append((i, zz)); i -= s; out.append((i, zz))
        return out
    return [(t, z), (0.0, z + t)]


def loft(P, mat, rings, cap0=True, cap1=True, closed=True):
    n = len(rings[0])
    verts = [p for r in rings for p in r]
    faces = []
    for k in range(len(rings) - 1):
        a, b = k * n, (k + 1) * n
        for i in range(n if closed else n - 1):
            j = (i + 1) % n
            faces.append((a + i, a + j, b + j, b + i))
    if cap0:
        faces.append(tuple(reversed(range(n))))
    if cap1:
        faces.append(tuple(range((len(rings) - 1) * n, len(rings) * n)))
    P.poly(verts, faces, mat)
    return verts, faces


def cbox_geom(x0, y0, z0, x1, y1, z1, v=0.0, top=0.0, bot=0.0, mode='chamfer', tmode=None, seg=3, steps=2, cs=None):
    """(verts, faces) of a box with treated edges.  v: vertical edges; top/bot: horizontal top/bottom edges.
    mode: plan-corner treatment ('chamfer' | 'round' | 'step'); tmode: top/bottom edge treatment (defaults to mode)."""
    if x1 < x0: x0, x1 = x1, x0
    if y1 < y0: y0, y1 = y1, y0
    if z1 < z0: z0, z1 = z1, z0
    w, d, h = x1 - x0, y1 - y0, z1 - z0
    lim = min(w, d) / 2 - 2 * EPS
    v = max(0.0, min(v, lim))
    top = max(0.0, min(top, lim * 0.96, h * 0.95))
    bot = max(0.0, min(bot, lim * 0.96, h * 0.95))
    if top + bot > h * 0.96:
        k = h * 0.96 / (top + bot); top *= k; bot *= k
    tmode = tmode or mode
    if tmode == 'sharp':
        tmode = 'chamfer'
    prof = []
    prof += _edge_profile(bot, z0, 'bot', tmode, seg, steps) if bot > EPS else [(0.0, z0)]
    prof += _edge_profile(top, z1, 'top', tmode, seg, steps) if top > EPS else [(0.0, z1)]
    clean = [prof[0]]
    for q in prof[1:]:
        if abs(q[0] - clean[-1][0]) > 1e-5 or abs(q[1] - clean[-1][1]) > 1e-5:
            clean.append(q)
    has_v = v > EPS or cs
    vm = mode if has_v else 'sharp'
    if vm == 'sharp' and len(clean) == 2:
        vs = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        return vs, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    rings = []
    for ins, z in clean:
        if has_v:
            ccs = [_cut_after_inset(c, ins, vm) for c in cs] if cs else None
            pts = outline(x0 + ins, y0 + ins, x1 - ins, y1 - ins, _cut_after_inset(v, ins, vm), vm, seg, steps, ccs)
        else:
            pts = outline(x0 + ins, y0 + ins, x1 - ins, y1 - ins, 0, 'sharp')
        rings.append([(x, y, z) for x, y in pts])
    n = len(rings[0])
    verts = [p for r in rings for p in r]
    faces = []
    for k in range(len(rings) - 1):
        a, b = k * n, (k + 1) * n
        for i in range(n):
            j = (i + 1) % n
            faces.append((a + i, a + j, b + j, b + i))
    faces.append(tuple(reversed(range(n))))
    faces.append(tuple(range((len(rings) - 1) * n, len(rings) * n)))
    return verts, faces


def cbox(P, mat, x0, y0, z0, x1, y1, z1, v=0.0, top=0.0, bot=0.0, mode='chamfer', tmode=None, seg=3, steps=2, cs=None):
    if abs(x1 - x0) < 1e-5 or abs(y1 - y0) < 1e-5 or abs(z1 - z0) < 1e-5:
        return
    vs, fs = cbox_geom(x0, y0, z0, x1, y1, z1, v, top, bot, mode, tmode, seg, steps, cs)
    P.poly(vs, fs, mat)


def _bm_cut(verts, faces, planes):
    """Cut a closed mesh by planes (co, no): removes the +no side and caps the hole.  Returns (verts, faces)."""
    import bmesh
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in verts]
    for f in faces:
        try:
            bm.faces.new([vs[i] for i in f])
        except ValueError:
            pass
    for co, no in planes:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        res = bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=co, plane_no=no, clear_outer=True)
        cut = [g for g in res['geom_cut'] if isinstance(g, bmesh.types.BMEdge) and g.is_valid]
        be = [e for e in cut if len(e.link_faces) == 1]
        if be:
            try:
                bmesh.ops.holes_fill(bm, edges=be, sides=0)
            except Exception:
                pass
    bm.verts.index_update()
    ov = [tuple(v.co) for v in bm.verts]
    of = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    return ov, of


def hewn(P, mat, x0, y0, z0, x1, y1, z1, v=0.0, top=0.0, bot=0.0, mode='chamfer', tmode=None, seg=3, steps=2, cs=None,
         cuts=None, rng=None, n_cuts=0, depth=(0.1, 0.25)):
    """cbox, then oblique plane cuts.  `cuts` = explicit [(co, no)]; or n_cuts random corner/edge facets whose depth
    is a fraction (depth range) of the smaller plan dimension."""
    vs, fs = cbox_geom(x0, y0, z0, x1, y1, z1, v, top, bot, mode, tmode, seg, steps, cs)
    planes = list(cuts or [])
    if n_cuts and rng:
        w, d, h = x1 - x0, y1 - y0, z1 - z0
        m = min(w, d, h * 1.5)
        for _ in range(n_cuts):
            sx, sy = rng.choice((-1, 1)), rng.choice((-1, 1))
            kind = rng.random()
            if kind < 0.45:      # top corner facet
                K = (x1 if sx > 0 else x0, y1 if sy > 0 else y0, z1)
                no = PT.norm((sx * rng.uniform(0.6, 1.4), sy * rng.uniform(0.6, 1.4), rng.uniform(0.7, 1.6)))
            elif kind < 0.8:     # top edge slope
                if rng.random() < 0.5:
                    K = (x1 if sx > 0 else x0, (y0 + y1) / 2, z1)
                    no = PT.norm((sx, rng.uniform(-0.15, 0.15), rng.uniform(0.8, 2.2)))
                else:
                    K = ((x0 + x1) / 2, y1 if sy > 0 else y0, z1)
                    no = PT.norm((rng.uniform(-0.15, 0.15), sy, rng.uniform(0.8, 2.2)))
            else:                # vertical corner slice, slightly tilted
                K = (x1 if sx > 0 else x0, y1 if sy > 0 else y0, (z0 + z1) / 2)
                no = PT.norm((sx, sy * rng.uniform(0.5, 2.0), rng.uniform(-0.2, 0.35)))
            s = m * rng.uniform(*depth)
            co = PT.sub(K, PT.mul(no, s))
            planes.append((co, no))
    if planes:
        vs, fs = _bm_cut(vs, fs, planes)
    P.poly(vs, fs, mat)


# ----------------------------------------------------------------------------------------------- prisms and legs
def ngon(n, r, phase=0.0):
    return [(r * math.cos(phase + 2 * math.pi * i / n), r * math.sin(phase + 2 * math.pi * i / n)) for i in range(n)]


def _basis(axis):
    t = PT.norm(axis)
    ref = (0.0, 0.0, 1.0) if abs(t[2]) < 0.9 else (1.0, 0.0, 0.0)
    u = PT.norm(PT.cross(t, ref))
    v = PT.cross(t, u)
    return t, u, v


def leg(P, mat, p0, p1, r0, r1=None, n=8, phase=None, cap0=0.0, cap1=0.0, rings_extra=None):
    """Tapered n-gon prism from p0 (radius r0) to p1 (radius r1), each end optionally chamfered by cap0/cap1 (m).
    n=8 with phase pi/8 gives an octagonal (chamfered-square) section."""
    r1 = r0 if r1 is None else r1
    ax = PT.sub(p1, p0)
    L = PT.length(ax)
    if L < 1e-6:
        return
    t, u, v = _basis(ax)
    phase = (math.pi / n) if phase is None else phase
    base = ngon(n, 1.0, phase)

    def ring(s, r):
        c = PT.add(p0, PT.mul(t, s))
        return [PT.add(c, PT.add(PT.mul(u, x * r), PT.mul(v, y * r))) for x, y in base]
    rs = []
    if cap0 > 0:
        rs.append(ring(0.0, max(0.05, r0 - cap0)))
        rs.append(ring(min(cap0, L * 0.3), r0 + (r1 - r0) * min(cap0, L * 0.3) / L))
    else:
        rs.append(ring(0.0, r0))
    if cap1 > 0:
        s = max(L - min(cap1, L * 0.3), 0.0)
        rs.append(ring(s, r0 + (r1 - r0) * s / L))
        rs.append(ring(L, max(0.05, r1 - cap1)))
    else:
        rs.append(ring(L, r1))
    # the ring orientation must be CCW seen from +t: the ngon in (u, v) with u x v = t is CCW
    loft(P, mat, rs)


def sweep(P, mat, pts, profile, mode='pt', caps=True, closed=True, scale=None):
    """Sweep a 2D profile [(s, n)] (s along the side vector, n along the normal) along pts.  scale(i) -> factor."""
    pts = PT.dedupe(pts)
    if len(pts) < 2:
        return
    F = PT.frames(pts, mode)
    rings = []
    for i, (p, (t, s, nn)) in enumerate(zip(pts, F)):
        k = scale(i) if scale else 1.0
        rings.append([PT.add(p, PT.add(PT.mul(s, a * k), PT.mul(nn, b * k))) for a, b in profile])
    # orientation: profile must be CCW seen from +t; (side, normal) basis has side x normal = -t, so reverse
    rings = [list(reversed(r)) for r in rings]
    loft(P, mat, rings, cap0=caps and closed, cap1=caps and closed, closed=closed)


def circle(r, n=8, phase=0.0):
    return ngon(n, r, phase)


def rect_prof(w, h, c=0.0, center=True, bottom=0.0):
    """Rectangle profile (side width w, normal height h); chamfer c on all four corners."""
    x0, x1 = -w / 2, w / 2
    y0 = -h / 2 if center else bottom
    y1 = y0 + h
    if c <= 0:
        return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    return outline(x0, y0, x1, y1, c, 'chamfer')


def trough_prof(w, h, t=0.15, n=10):
    """U-channel (open-top half pipe) as a closed polygon: outer arc then inner arc back."""
    R = w / 2
    outer = [(R * math.cos(math.pi + math.pi * i / n), -R * math.sin(math.pi * i / n) * (h / R)) for i in range(n + 1)]
    inner = [((R - t) * math.cos(math.pi * i / n), -(R - t) * math.sin(math.pi * i / n) * (h / R)) for i in range(n + 1)]
    return outer + inner


def prism3(P, mat, tri, d):
    """Triangular prism: triangle `tri` (3 points) extruded by vector d; orientation fixed automatically."""
    a, b, c = tri
    n = PT.cross(PT.sub(b, a), PT.sub(c, a))
    if PT.dot(n, d) < 0:
        b, c = c, b
    loft(P, mat, [[a, b, c], [PT.add(a, d), PT.add(b, d), PT.add(c, d)]])


def jitter_ring(pts, rng, amt):
    return [(x + rng.uniform(-amt, amt), y + rng.uniform(-amt, amt)) for x, y in pts]
