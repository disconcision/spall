"""(f) The Blade Runner 2049 reveal: far away it reads as ordinary city blocks; closer, each 'block' is a superblock of
towers.  Three styles x four camera distances.  Detail rings: centre superblock detail 2, its neighbours 1, rest 0."""
import json, math, os, random
from common import Spec, write_jobs, ROOT

N, S, ST = 13, 240.0, 64.0       # superblocks per side, superblock size, street (canyon) width
P = S + ST
C = N // 2
STY = {
    'dys': dict(style='city', light='br_night', n=4, gap=12.0, podium=26.0, hmin=190.0, hmax=330.0, uniform=0.75, ground='asphalt2',
                street='rock_dark', landmark='monolith'),
    'brut': dict(style='overgrown', light='green_day', n=4, gap=14.0, podium=22.0, hmin=120.0, hmax=230.0, uniform=0.55, ground='paving',
                 street='asphalt2', landmark='terraces'),
    'solar': dict(style='city', light='solar_day', n=4, gap=16.0, podium=14.0, hmin=80.0, hmax=210.0, uniform=0.3, ground='grass',
                  street='paving', landmark='park'),
}


def city(key):
    cfg = STY[key]
    s = Spec('f_city_' + key, style=cfg['style'], light=cfg['light'], seed=71)
    L = N * P
    s.add('ground', -ST, -ST, 0, L + ST, L + ST, 1, mat=cfg['street'], t=2.0)
    rng = random.Random(7)
    for i in range(N):
        for j in range(N):
            x0, y0 = i * P, j * P
            dist = max(abs(i - C), abs(j - C))
            det = 2 if dist == 0 else (1 if dist == 1 else 0)
            if (i, j) == (C + 3, C - 2):
                if cfg['landmark'] == 'monolith':
                    s.add('slopemass', x0 - 10, y0 - 10, 0, S + 20, S + 20, 420, mat='fac_dark2',
                          slopes={'s': [1, 2], 'e': [1, 2], 'n': [1, 2], 'w': [1, 2]}, windows='none')
                elif cfg['landmark'] == 'terraces':
                    s.add('slopemass', x0, y0, 0, S, S, 140, mat='fac_conc', slopes={'s': [2, 1], 'e': [2, 1]}, stepped=True,
                          step_levels=3, windows='bands', plant=True)
                else:
                    s.add('ground', x0, y0, 0.2, S, S, 1, mat='grass', t=0.5)
                    s.add('forest', x0, y0, 0.3, S, S, 1, density=40, size=[10, 18], cover=0.9, mask=200)
                    s.add('water', x0 + 60, y0 + 70, 0.4, 110, 80, 1, rim_mat='paving')
                continue
            if key == 'solar' and rng.random() < 0.08:
                s.add('ground', x0, y0, 0.2, S, S, 1, mat='grass', t=0.5)
                s.add('forest', x0, y0, 0.3, S, S, 1, density=30, size=[9, 16], cover=0.85, mask=160)
                continue
            s.add('superblock', x0, y0, 0, S, S, 1, style=('dys' if key == 'dys' else key), detail=det, n=cfg['n'], gap=cfg['gap'],
                  podium=cfg['podium'] * rng.uniform(0.8, 1.2), hmin=cfg['hmin'], hmax=cfg['hmax'], uniform=cfg['uniform'],
                  spin=(60 if (det == 2 and key == 'dys') else (14 if det >= 1 and key == 'dys' else 0)), bridges=0.35)
    return s.write()


jobs = []
CX, CY = C * P + S / 2, C * P + S / 2
views = [
    ('1_far', dict(az=45, el=76, target=[CX, CY, 0], ortho_scale=3300)),
    ('2_district', dict(az=45, el=56, target=[CX, CY, 60], ortho_scale=1100)),
    ('3_superblock', dict(az=45, el=40, target=[CX, CY, 120], ortho_scale=430)),
    ('4_canyon', dict(type='persp', loc=[CX - S / 2 - ST / 2 + 6, CY - S / 2 - 80, 95], target=[CX - S / 2 - ST / 2 + 2, CY + 420, 150],
                      lens=24)),
]
for key in STY:
    sp = city(key)
    for name, cam in views:
        j = dict(spec=sp, out='out/f/f_%s_%s.png' % (key, name), light=STY[key]['light'], style=STY[key]['style'], camera=cam,
                 frame_bb=[0, 0, 0, N * P, N * P, 300], name='%s_%s' % (key, name), max_lights=300)
        k = 1.0 if key == 'dys' else (0.45 if key == 'brut' else 0.7)
        if name == '1_far':
            j['fog'] = dict(h=0.4 * k, gamma=1.4, d=0.3 * k, z_lo=0, z_hi=360)
        elif name == '2_district':
            j['fog'] = dict(h=0.55 * k, gamma=1.5, d=0.45 * k, z_lo=0, z_hi=360)
        elif name == '3_superblock':
            j['fog'] = dict(h=0.6 * k, gamma=1.7, d=0.5 * k, z_lo=0, z_hi=380)
        else:
            j['fog'] = dict(h=0.55 * k, gamma=1.8, d=0.8 * k, z_lo=0, z_hi=420)
        jobs.append(j)
write_jobs('f_city', jobs, samples=32)
