"""terrain.py - deterministic fbm heightfield shared by the landscape generator and the terrain builder (no bpy)."""
import math


def _hash(ix, iy, seed):
    h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def vnoise(x, y, seed):
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = _hash(ix, iy, seed); b = _hash(ix + 1, iy, seed)
    c = _hash(ix, iy + 1, seed); d = _hash(ix + 1, iy + 1, seed)
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy


def fbm(x, y, seed, octaves=5):
    s, amp, f, norm = 0.0, 1.0, 1.0, 0.0
    for o in range(octaves):
        s += amp * vnoise(x * f, y * f, seed + o * 17)
        norm += amp
        amp *= 0.5
        f *= 2.03
    return s / norm


class Field:
    """height(x, y) in metres: fbm hills + a river valley + flattened pads (x0,y0,x1,y1,z,blend)."""

    def __init__(self, seed=3, amp=90.0, scale=1400.0, base=-8.0, river=None, flats=(), river_w=90.0, river_depth=14.0):
        self.seed, self.amp, self.scale, self.base = seed, amp, scale, base
        self.river = river or []
        self.flats = list(flats)
        self.rw, self.rd = river_w, river_depth

    def raw(self, x, y):
        n = fbm(x / self.scale, y / self.scale, self.seed)
        r = fbm(x / (self.scale * 0.35), y / (self.scale * 0.35), self.seed + 99, 3)
        h = self.base + self.amp * (max(0.0, n - 0.32) ** 1.6) * 2.4 + r * 6.0
        return h

    def river_dist(self, x, y):
        best = 1e9
        R = self.river
        for i in range(len(R) - 1):
            ax, ay = R[i]; bx, by = R[i + 1]
            dx, dy = bx - ax, by - ay
            L2 = dx * dx + dy * dy
            t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / L2))
            px, py = ax + dx * t, ay + dy * t
            best = min(best, math.hypot(x - px, y - py))
        return best

    def height(self, x, y):
        h = self.raw(x, y)
        if self.river:
            d = self.river_dist(x, y)
            if d < self.rw * 3:
                k = max(0.0, 1.0 - d / (self.rw * 3))
                k = k * k * (3 - 2 * k)
                h = h * (1 - k) + (-self.rd if d < self.rw else h * 0.3 - 2.0) * k
        for (x0, y0, x1, y1, z, bl) in self.flats:
            dx = max(x0 - x, 0.0, x - x1)
            dy = max(y0 - y, 0.0, y - y1)
            d = math.hypot(dx, dy)
            if d < bl:
                k = 1.0 - d / bl
                k = k * k * (3 - 2 * k)
                h = h * (1 - k) + z * k
        return h
