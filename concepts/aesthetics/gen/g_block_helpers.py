"""Small shared composition helpers for the concrete scenes."""


def knuckles(s, x, y, z, w, d, mat, size=3.2):
    """Tetrapod 'knuckles' at the four lower corners of a mass: a unit whose legs poke out of the corner."""
    for (cx, cy, yaw) in ((x, y, 225), (x + w, y, 315), (x + w, y + d, 45), (x, y + d, 135)):
        s.add('tetrapod', cx - size, cy - size, z - size * 0.9, size * 2, size * 2, size * 2, mat=mat, size=size, yaw=yaw)
