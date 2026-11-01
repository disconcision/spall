"""
paths.py - pure-Python path helpers shared by the scene generators and the Blender builders (no bpy).

A path is a list of (x, y, z) tuples in metres.  Builders sweep profiles along paths (pipes, cables, decks, slides,
conveyors); generators use the same helpers to lay those paths out (helices, fillets, splines, branching).
"""
import math


def add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def mul(a, k): return (a[0] * k, a[1] * k, a[2] * k)
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def length(a): return math.sqrt(dot(a, a))
def lerp(a, b, t): return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def norm(a):
    L = length(a)
    return (a[0] / L, a[1] / L, a[2] / L) if L > 1e-12 else (0.0, 0.0, 0.0)


def polylen(pts):
    return sum(length(sub(pts[i + 1], pts[i])) for i in range(len(pts) - 1))


def dedupe(pts, eps=1e-4):
    out = [tuple(pts[0])]
    for p in pts[1:]:
        if length(sub(p, out[-1])) > eps:
            out.append(tuple(p))
    return out


def resample(pts, step):
    """Uniformly spaced points along a polyline (keeps both ends)."""
    pts = dedupe(pts)
    if len(pts) < 2:
        return pts
    L = polylen(pts)
    n = max(1, int(math.ceil(L / step)))
    out = []
    seg = 0
    acc = 0.0
    seglen = length(sub(pts[1], pts[0]))
    for k in range(n + 1):
        s = L * k / n
        while seg < len(pts) - 2 and acc + seglen < s - 1e-9:
            acc += seglen
            seg += 1
            seglen = length(sub(pts[seg + 1], pts[seg]))
        t = 0.0 if seglen < 1e-9 else min(1.0, max(0.0, (s - acc) / seglen))
        out.append(lerp(pts[seg], pts[seg + 1], t))
    return out


def point_at(pts, s):
    """Point and unit tangent at arc length s along a polyline."""
    acc = 0.0
    for i in range(len(pts) - 1):
        d = sub(pts[i + 1], pts[i])
        L = length(d)
        if acc + L >= s or i == len(pts) - 2:
            t = 0.0 if L < 1e-9 else min(1.0, max(0.0, (s - acc) / L))
            return lerp(pts[i], pts[i + 1], t), norm(d)
        acc += L
    return pts[-1], norm(sub(pts[-1], pts[-2]))


def fillet(pts, radius, seg=8):
    """Round every interior corner with a quadratic Bezier (reads as an elbow / curve of about `radius`)."""
    pts = dedupe(pts)
    if len(pts) < 3 or radius <= 0:
        return pts
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        A, B, Cc = pts[i - 1], pts[i], pts[i + 1]
        a = norm(sub(B, A)); b = norm(sub(Cc, B))
        cosang = max(-1.0, min(1.0, dot(a, b)))
        if cosang > 0.9999:
            out.append(B)
            continue
        phi = math.acos(cosang)          # turning angle
        t = radius * math.tan(phi / 2)
        t = min(t, length(sub(B, A)) * 0.49, length(sub(Cc, B)) * 0.49)
        T1 = sub(B, mul(a, t)); T2 = add(B, mul(b, t))
        n = max(2, int(seg * phi / (math.pi / 2)) + 1)
        for k in range(n + 1):
            u = k / n
            p = add(add(mul(T1, (1 - u) ** 2), mul(B, 2 * u * (1 - u))), mul(T2, u * u))
            out.append(p)
    out.append(pts[-1])
    return dedupe(out)


def catmull(pts, step=1.0, alpha=0.5):
    """Centripetal Catmull-Rom spline through the points, sampled about every `step` metres."""
    pts = dedupe(pts)
    if len(pts) < 3:
        return resample(pts, step)
    P = [sub(mul(pts[0], 2), pts[1])] + list(pts) + [sub(mul(pts[-1], 2), pts[-2])]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]

        def tj(ti, a, b):
            return ti + max(1e-6, length(sub(b, a))) ** alpha
        t0 = 0.0; t1 = tj(t0, p0, p1); t2 = tj(t1, p1, p2); t3 = tj(t2, p2, p3)
        n = max(2, int(math.ceil(length(sub(p2, p1)) / step)))
        for k in range(n):
            t = t1 + (t2 - t1) * k / n
            A1 = add(mul(p0, (t1 - t) / (t1 - t0)), mul(p1, (t - t0) / (t1 - t0)))
            A2 = add(mul(p1, (t2 - t) / (t2 - t1)), mul(p2, (t - t1) / (t2 - t1)))
            A3 = add(mul(p2, (t3 - t) / (t3 - t2)), mul(p3, (t - t2) / (t3 - t2)))
            B1 = add(mul(A1, (t2 - t) / (t2 - t0)), mul(A2, (t - t0) / (t2 - t0)))
            B2 = add(mul(A2, (t3 - t) / (t3 - t1)), mul(A3, (t - t1) / (t3 - t1)))
            out.append(add(mul(B1, (t2 - t) / (t2 - t1)), mul(B2, (t - t1) / (t2 - t1))))
    out.append(tuple(pts[-1]))
    return dedupe(out)


def bezier(p0, p1, p2, p3, n=16):
    out = []
    for k in range(n + 1):
        t = k / n
        a, b, c, d = (1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3
        out.append(tuple(p0[i] * a + p1[i] * b + p2[i] * c + p3[i] * d for i in range(3)))
    return out


def helix(cx, cy, r, z0, z1, turns, a0=0.0, step=1.5, cw=False):
    """Helix from z0 to z1 (turns may be fractional); a0 in degrees."""
    L = abs(turns) * 2 * math.pi * r
    n = max(8, int(math.hypot(L, z1 - z0) / step))
    s = -1.0 if cw else 1.0
    out = []
    for k in range(n + 1):
        t = k / n
        a = math.radians(a0) + s * 2 * math.pi * turns * t
        out.append((cx + r * math.cos(a), cy + r * math.sin(a), z0 + (z1 - z0) * t))
    return out


def arc(cx, cy, r, a0, a1, z0, z1=None, step=1.5):
    """Circular arc in plan from angle a0 to a1 (degrees), optionally ramping z0 -> z1 (smoothstep grade)."""
    z1 = z0 if z1 is None else z1
    L = abs(math.radians(a1 - a0)) * r
    n = max(4, int(L / step))
    out = []
    for k in range(n + 1):
        t = k / n
        a = math.radians(a0 + (a1 - a0) * t)
        g = t * t * (3 - 2 * t)
        out.append((cx + r * math.cos(a), cy + r * math.sin(a), z0 + (z1 - z0) * g))
    return out


def ramp_z(pts, z0, z1, ease=True):
    """Re-grade a path's z linearly (or smoothstep) by arc length from z0 to z1."""
    L = polylen(pts)
    out, acc = [], 0.0
    for i, p in enumerate(pts):
        if i:
            acc += length(sub(p, pts[i - 1]))
        t = acc / L if L > 0 else 0
        if ease:
            t = t * t * (3 - 2 * t)
        out.append((p[0], p[1], z0 + (z1 - z0) * t))
    return out


def rotate_to(v, a, b):
    """Rotate vector v by the minimal rotation taking unit a to unit b (Rodrigues)."""
    axis = cross(a, b)
    s = length(axis)
    c = dot(a, b)
    if s < 1e-9:
        return v if c > 0 else mul(v, -1.0)
    k = mul(axis, 1.0 / s)
    ang = math.atan2(s, c)
    cs, sn = math.cos(ang), math.sin(ang)
    return add(add(mul(v, cs), mul(cross(k, v), sn)), mul(k, dot(k, v) * (1 - cs)))


def frames(pts, mode='up', up=(0.0, 0.0, 1.0)):
    """Per-point (tangent, side, normal) frames.  mode 'up' keeps the side vector horizontal (decks, conveyors:
    no banking); 'pt' uses parallel transport (pipes, cables: no twist, handles vertical runs)."""
    n = len(pts)
    T = []
    for i in range(n):
        a = pts[max(0, i - 1)]; b = pts[min(n - 1, i + 1)]
        T.append(norm(sub(b, a)))
    F = []
    prev_s = None
    for i in range(n):
        t = T[i]
        if mode == 'up':
            s = cross(t, up)
            if length(s) < 0.05:
                s = rotate_to(prev_s, T[i - 1], t) if prev_s else norm(cross(t, (1.0, 0.0, 0.0)))
            s = norm(s)
        else:
            if prev_s is None:
                s = cross(t, up)
                if length(s) < 0.05:
                    s = cross(t, (1.0, 0.0, 0.0))
                s = norm(s)
            else:
                s = norm(rotate_to(prev_s, T[i - 1], t))
                s = norm(sub(s, mul(t, dot(s, t))))
        nrm = cross(s, t)
        F.append((t, s, nrm))
        prev_s = s
    return F


def offset_path(pts, du, dv, mode='pt'):
    """Offset a path by (du along side, dv along normal) in its own frames."""
    F = frames(pts, mode)
    return [add(add(p, mul(f[1], du)), mul(f[2], dv)) for p, f in zip(pts, F)]


def hexpack(n, r):
    """n circle centres (radius r) in a roughly round hexagonal pack, sorted from the middle outward."""
    pts = []
    k = 0
    while len(pts) < n * 3 + 7:
        for i in range(-k, k + 1):
            for j in range(-k, k + 1):
                x = (i + 0.5 * (j % 2)) * 2 * r
                y = j * math.sqrt(3) * r
                if (x, y) not in pts:
                    pts.append((x, y))
        k += 1
    pts.sort(key=lambda p: (p[0] ** 2 + p[1] ** 2, math.atan2(p[1], p[0])))
    return pts[:n]
