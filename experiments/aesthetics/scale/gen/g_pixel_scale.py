"""Nested scales in pixel art: the same place at landscape (16 px / 256 m), district (16 px / 16 m) and building
(16 px / 4 m) densities.  Opaque crops, fixed 2:1 camera, aliased, then locked to the Stratum palette."""
import json, math, os, sys
from sc import write_jobs, AES
sys.path.insert(0, os.path.join(AES, 'gen'))
from g_pixel import frame

def ppm(cell):
    return 16.0 / (cell * math.sqrt(2.0))

STEP = 'specs/n_a_stepped.json'
VOID = 'specs/n_b_framevoid.json'
views = [
    ('s1_landscape', STEP, ppm(256.0), [-5200, -4400, 0, 5200, 3600, 1400]),
    ('s2_district', STEP, ppm(16.0), [-2300, -2500, 150, -700, -1700, 700]),
    ('s3_building', STEP, ppm(4.0), [-1420, -2000, 300, -1180, -1800, 460]),
    ('v1_frames', VOID, ppm(64.0), [-1400, -2000, 0, 1400, 2000, 1850]),
    ('v2_bays', VOID, ppm(4.0), [-750, -300, 590, -600, -150, 760]),
]
jobs = []
for name, spec, p, bb in views:
    tgt, res = frame(bb, p, pad=0)
    res = [min(res[0], 1100), min(res[1], 760)]
    res = [r + (r % 2) for r in res]
    jobs.append(dict(spec='scale/' + spec, out='out/pixel/raw/%s.png' % name, light='aerial_warm', style='scale', res=res,
                     camera=dict(az=45, el=30, target=tgt, px_per_m=p), filter_size=0.0, samples=16, bloom=0.0, nofog=True,
                     drop_tags=['clouds'], max_lights=40, name=name))
write_jobs('pixel_scale', jobs)
