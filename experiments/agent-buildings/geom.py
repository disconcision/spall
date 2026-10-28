"""
geom.py - pure-Python part geometry shared by the extended validator (check.py) and the job maker.

world_box(p) mirrors kit.make_xf: a part's local box [0,W]x[0,D]x[z0,z1] (z0 = -t for flat parts, whose solid lies
*below* the part level) is re-pointed by `orient` exactly as kit.py does, so sideways ('+x','-x','+y','-y') and
hanging ('-z') parts get their true world AABB.  (The stock agent_check.py uses the 'up' box for every part.)
"""
import math

FLAT_BELOW = {'deck', 'slab', 'floor', 'ground', 'viaduct', 'bridge'}   # 'bridge' added: its deck is drawn at -t..0
FLAT_T = {'deck': 1.0, 'ground': 2.0, 'viaduct': 1.4, 'bridge': 0.35}


def local_z(p, lh):
    """(z0, z1) of the part's nominal volume in its local frame (metres)."""
    if p['type'] in FLAT_BELOW:
        t = (p.get('params') or {}).get('t', FLAT_T.get(p['type'], 0.35))
        return -t, 0.0
    return 0.0, p.get('h', 1) * lh


def world_box(p, cell=4.0, lh=3.5):
    """(x0, y0, z0, x1, y1, z1) in metres, orient-aware."""
    X0, Y0, Z0 = p.get('x', 0) * cell, p.get('y', 0) * cell, p.get('level', 0) * lh
    W, D = p.get('w', 1) * cell, p.get('d', 1) * cell
    c0, c1 = local_z(p, lh)
    o = p.get('orient', 'up')
    if o == 'up':
        return (X0, Y0, Z0 + c0, X0 + W, Y0 + D, Z0 + c1)
    if o == '+x':
        return (X0 + c0, Y0, Z0 - W, X0 + c1, Y0 + D, Z0)
    if o == '-x':
        return (X0 - c1, Y0, Z0, X0 - c0, Y0 + D, Z0 + W)
    if o == '+y':
        return (X0, Y0 + c0, Z0 - D, X0 + W, Y0 + c1, Z0)
    if o == '-y':
        return (X0, Y0 - c1, Z0, X0 + W, Y0 - c0, Z0 + D)
    if o == '-z':
        return (X0, Y0 - D, Z0 - c1, X0 + W, Y0, Z0 - c0)
    raise ValueError('bad orient %r' % o)


def base_face(p, cell=4.0, lh=3.5):
    """The face a part grows from (its local z=z0 plane) as (axis, value, sign):
    the part must touch a solid across this plane.  sign = +1 means the part lies on the + side of the plane."""
    b = world_box(p, cell, lh)
    o = p.get('orient', 'up')
    return {'up': ('z', b[2], +1), '-z': ('z', b[5], -1), '+x': ('x', b[0], +1), '-x': ('x', b[3], -1),
            '+y': ('y', b[1], +1), '-y': ('y', b[4], -1)}[o]


def visual_pad(p, cell=4.0, lh=3.5):
    """Rough extra extent (m) beyond the nominal box that builders draw (for canvas sizing only)."""
    t = p['type']
    pr = p.get('params') or {}
    if t == 'tree':
        return max(0.0, pr.get('height', 6.0) - p.get('h', 1) * lh) + 1.5
    if t in ('terrace',):
        return 8.0 if pr.get('ntrees', 1) or pr.get('trees') else 1.0
    if t in ('core', 'elevator'):
        return 3.6
    if t in ('sign',):
        return pr.get('proj', 1.6) + 0.2
    if t in ('antenna', 'turbine'):
        return 2.0
    if t in ('shack', 'capsule', 'unit', 'greenhouse', 'lamp'):
        return 1.2
    return 0.6


def spec_bounds(spec, drop_tags=('context',)):
    """World AABB of a spec (metres), with visual padding; parts carrying any drop tag are ignored."""
    g = spec['meta'].get('grid', {'cell': 4.0, 'level': 3.5})
    cell, lh = g['cell'], g['level']
    bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]
    for p in spec['parts']:
        if set(p.get('tags', [])) & set(drop_tags):
            continue
        b = world_box(p, cell, lh)
        pad = visual_pad(p, cell, lh)
        lo = (b[0] - 0.4, b[1] - 0.4, b[2])
        hi = (b[3] + 0.4, b[4] + 0.4, b[5] + pad)
        for k in range(3):
            bb[k] = min(bb[k], lo[k]); bb[k + 3] = max(bb[k + 3], hi[k])
    return bb


def overlap1(a0, a1, b0, b1):
    return max(0.0, min(a1, b1) - max(a0, b0))


# 2:1 dimetric sprite camera used by concept-renders (az 45, el 30)
RIGHT = (math.cos(math.radians(45)), math.sin(math.radians(45)), 0.0)
UP = (-0.3535533845424652, 0.3535533845424652, 0.866025447845459)


def project(pt):
    return (pt[0] * RIGHT[0] + pt[1] * RIGHT[1] + pt[2] * RIGHT[2], pt[0] * UP[0] + pt[1] * UP[1] + pt[2] * UP[2])


def rotate_box_corners(bb, k, fw_m, fd_m):
    """Corners of bb after k quarter turns about the footprint centre, re-anchored like kit.py sprite mode."""
    cx, cy = fw_m / 2.0, fd_m / 2.0
    if k % 2:
        ncx, ncy = fd_m / 2.0, fw_m / 2.0
    else:
        ncx, ncy = cx, cy
    pts = []
    for x in (bb[0], bb[3]):
        for y in (bb[1], bb[4]):
            for z in (bb[2], bb[5]):
                u, v = x - cx, y - cy
                for _ in range(k % 4):
                    u, v = -v, u
                pts.append((u + ncx, v + ncy, z))
    return pts
