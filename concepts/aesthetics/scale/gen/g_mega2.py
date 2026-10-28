"""Megaforms, round 3 revised: architecture and engineered structure at 10-1000x, never landscape mimicry.
Landscape quality only from sheer size (haze, small buildings settling on vast surfaces).  Ordinary low-rise city
fabric at the base is the scale reference.  Unusual cast concrete (faceted buttresses, splayed cast feet, haunched
nodes, an occasional tetrapod) appears across the set.

  (a) stepped cast mass       (b) open void between megaframes     (c) continuous monument
  (d) interior void           (e) inclined slab (+ solarpunk)      (h) infrastructure spine
"""
import math, random
from sc import Spec, write_jobs, town_hi, town_lo, lowcity, PT, rpath

JOBS = []
LEG = []


def protos(s):
    s.proto('town_hi', lambda t: town_hi(t, n=40, rows=3))
    s.proto('town_lo', lambda t: town_lo(t))
    s.proto('lowcity', lambda t: lowcity(t, 600.0, 5))
    s.proto('lowcity2', lambda t: lowcity(t, 600.0, 9))
    s.proto('city', lambda t: t.add('citytile', 0, 0, 0, 600, 600, 1, n=5, hmin=40, hmax=140, gap=0.35))

    def bay(t):
        rng = random.Random(4)
        for q in range(7):
            w, d = rng.uniform(25, 60), rng.uniform(25, 60)
            x, y = rng.uniform(0, 150 - w), rng.uniform(0, 150 - d)
            t.add('cblock', x, y, 0, w, d, rng.choice((12.8, 19.2, 25.6, 38.4, 51.2, 76.8)),
                  mat=rng.choice(['town_white', 'town_ochre', 'town_terra', 'town_grey', 'town_white']), v=0, top=0)
        t.add('tree', 70, 20, 0, 1, 1, 1, height=9.0)
    s.proto('bay', bay)
    s.proto('solar', lambda t: t.add('solar', 0, 0, 0, 120, 80, 1))
    s.proto('grove', lambda t: t.add('forestpatch', 0, 0, 0, 90, 60, 1, n=14, size=[9, 15]))


def city_ring(s, rng, x0, y0, x1, y1, avoid, n, key='lowcity', tags=None, cx=0.0, cy=0.0, r_full=6000.0, r_zero=14000.0):
    """Continuous ordinary city fabric on a 600 m grid, thinning out with distance from (cx, cy)."""
    pts = []
    for gx in range(int(x0 // 600), int(x1 // 600) + 1):
        for gy in range(int(y0 // 600), int(y1 // 600) + 1):
            x, y = gx * 600.0, gy * 600.0
            if any(a - 600 < x < c and b - 600 < y < d for a, b, c, d in avoid):
                continue
            r = math.hypot(x + 300 - cx, y + 300 - cy)
            p = 1.0 if r < r_full else max(0.0, 1.0 - (r - r_full) / (r_zero - r_full))
            if rng.random() < p * 0.92:
                pts.append([x, y, 0, 0, 1.0])
    k2 = [p for i, p in enumerate(pts) if i % 3 == 1]
    k1 = [p for i, p in enumerate(pts) if i % 3 != 1]
    s.scatter(key, k1, tags=tags)
    s.scatter('lowcity2', k2, tags=tags)


# ====================================================================================== (a) stepped cast mass
def stepped_mass():
    rng = random.Random(11)
    s = Spec('n_a_stepped', style='scale', light='aerial_warm', seed=201)
    protos(s)
    s.add('ground', -16000, -16000, 0, 32000, 32000, 1, mat='ground_city', t=2.0)
    X0, Y0, ins, H, N, GX = 3300.0, 2300.0, 160.0, 110.0, 12, 350.0
    towns_hi, towns_lo = [], []
    for k in range(N):
        xa, xb = -X0 + k * ins, X0 - k * ins
        ya, yb = -Y0 + k * ins, Y0 - k * ins
        for (a, b) in ((xa, -GX), (GX, xb)):
            s.add('cblock', a, ya, k * H, b - a, yb - ya, H, mat='mega_step', v=180.0 if (a == xa or b == xb) else 0.0, top=10.0)
        # faceted cast buttresses leaning on the lower south risers
        if 0 < k <= 4:
            for bx in list(range(int(xa) + 400, -int(GX) - 200, 620)) + list(range(int(GX) + 300, int(xb) - 300, 620)):
                s.add('cwedge', bx, ya - 110, (k - 1) * H + 0.0, 70, 110, H, mat='mega_conc')
        # neighbourhoods on the ledge in front of this level (south and east sides) and on the top plateau
        if k > 0:
            z = k * H
            y_led = ya - ins + 18
            x = xa - ins + 60
            while x < xb + ins - 200:
                if not (-GX - 60 < x < GX + 40) and rng.random() < 0.8:
                    (towns_hi if abs(x) < 1600 and k < 7 else towns_lo).append([x, y_led + rng.uniform(0, 40), z, 0, rng.uniform(0.9, 1.3)])
                x += rng.uniform(170, 300)
            y = ya - ins + 60
            while y < yb + ins - 200:
                if rng.random() < 0.7:
                    towns_lo.append([xb + 18 + rng.uniform(0, 30), y, z, 90, rng.uniform(1.0, 1.4)])
                y += rng.uniform(170, 320)
    for q in range(40):
        x = rng.choice((rng.uniform(-X0 + N * ins, -GX - 120), rng.uniform(GX + 20, X0 - N * ins - 120)))
        towns_hi.append([x, rng.uniform(-Y0 + N * ins, Y0 - N * ins - 80), N * H, rng.choice((0, 90)), 1.2])
    s.scatter('town_hi', towns_hi, tags=['towns'])
    s.scatter('town_lo', towns_lo, tags=['towns'])
    s.add('clouds', -9000, -9000, 560, 18000, 16000, 160, n=80, size=[350, 1100], clump=5, tags=['clouds'])
    # bridges across the canyon and a town strung along the canyon floor
    for (k, yb) in ((3, -900), (6, 300), (9, 1200), (5, -1600)):
        s.add('cblock', -GX, yb, k * H - 30, 2 * GX, 60, 30, mat='mega_step', v=0, top=0)
    s.scatter('lowcity2', [[-300, y, 0, 0, 1.0] for y in range(-2400, 2400, 600)], tags=['city'])
    # an occasional colossal tetrapod: a cast node at the canyon mouth
    s.add('tetrapod', -260, -Y0 - 700, 0, 520, 520, 400, mat='mega_conc', size=260.0, yaw=35)
    city_ring(s, rng, -14000, -14000, 14000, 12000, [(-X0, -Y0, X0, Y0)], 0, tags=['city'])
    s.scatter('city', [[rng.uniform(-9000, 9000), rng.uniform(-9000, -3000), 0, 0, 1.0] for _ in range(14)], tags=['city'])
    sp = s.write()
    JOBS.append(dict(spec=sp, out='out/mega2/a1_stepped_mass.png', light='aerial_warm', style='scale', res=[1800, 1000], drop_tags=['clouds'],
                     camera=dict(az=24, el=28, target=[0, 0, 350], ortho_scale=10500),
                     fog=dict(h=0.12, gamma=1.6, d=0.16, z_lo=0, z_hi=1800, d_start=0.1)))
    cam = dict(az=24, el=28, target=[0, 0, 350], ortho_scale=10500)
    noclouds = ['clouds']
    LEG.extend([
        dict(spec=sp, out='out/legibility/l1_bare.png', light='aerial_warm', style='scale', camera=cam, drop_tags=['towns', 'city', 'clouds'],
             nofog=True, name='l1'),
        dict(spec=sp, out='out/legibility/l2_buildings.png', light='aerial_warm', style='scale', camera=cam, drop_tags=noclouds, nofog=True,
             name='l2'),
        dict(spec=sp, out='out/legibility/l3_aerial.png', light='aerial', style='scale', camera=cam, drop_tags=noclouds,
             fog=dict(h=0.1, gamma=1.6, d=0.5, z_lo=0, z_hi=1800, d_start=0.0), name='l3'),
        dict(spec=sp, out='out/legibility/l4_bands_clouds.png', light='aerial', style='scale', camera=cam,
             fog=dict(h=0.08, gamma=1.6, d=0.35, z_lo=0, z_hi=1800, d_start=0.0, bands=[[240, 140, 0.35], [900, 120, 0.18]]), name='l4'),
        dict(spec=sp, out='out/legibility/l5_night.png', light='aerial_dusk', style='scale', camera=cam, drop_tags=noclouds,
             fog=dict(h=0.1, gamma=1.6, d=0.3, z_lo=0, z_hi=1800, d_start=0.0), env=dict(win=5.0), max_lights=120, name='l5'),
        dict(spec=sp, out='out/legibility/l6_street.png', light='aerial_warm', style='scale', res=[1800, 1000], drop_tags=noclouds,
             camera=dict(type='persp', loc=[1200.0, -3600.0, 8.0], target=[600.0, -1500.0, 700.0], lens=18),
             fog=dict(h=0.06, gamma=1.6, d=0.45, z_lo=0, z_hi=1800, d_start=0.0), clip=[0.5, 60000.0], name='l6'),
    ])
    JOBS.append(dict(spec=sp, out='out/mega2/a2_stepped_canyon.png', light='aerial_warm', style='scale', drop_tags=['clouds'],
                     camera=dict(az=24, el=24, target=[0, -1400, 520], ortho_scale=2700),
                     fog=dict(h=0.06, gamma=1.6, d=0.12, z_lo=0, z_hi=1800, d_start=0.1)))
    return sp


# ====================================================================================== (b) open void between megaframes
def frame_void():
    rng = random.Random(12)
    s = Spec('n_b_framevoid', style='scale', light='aerial', seed=202)
    protos(s)
    s.add('ground', -12000, -12000, 0, 24000, 24000, 1, mat='ground_city', t=2.0)
    BX, BZ, NY, NZ = 180.0, 150.0, 20, 12
    for (x0, name) in ((-1140.0, 'west'), (600.0, 'east')):
        s.add('megaframe', x0, -1800, 0, 540, 3600, 1800, mat='mega_conc', bx=BX, by=BX, bz=BZ / 3.5, col=46, beam=30, haunch=34,
              pods=0, decks=list(range(1, NZ)), deck_mat='mega_step', bevel=10.0)
        bays = []
        for k in range(NZ):
            for i in range(3):
                for j in range(NY):
                    if rng.random() < 0.62:
                        bays.append([x0 + i * BX + 15, -1800 + j * BX + 15, k * BZ, 0, rng.uniform(0.95, 1.05)])
        s.scatter('bay', bays)
    for (k, yb) in ((4, -900), (7, 300), (10, 1200), (2, 900), (8, -1500)):
        s.add('cblock', -600, yb, k * BZ - 26, 1200, 44, 26, mat='mega_step', v=0, top=0)
    s.scatter('lowcity', [[-600, y, 0, 0, 1.0] for y in range(-1800, 1800, 600)] + [[0, y, 0, 0, 1.0] for y in range(-1800, 1800, 600)])
    city_ring(s, rng, -9000, -9000, 9000, 9000, [(-1200, -1900, 1200, 1900)], 0)
    sp = s.write()
    JOBS.append(dict(spec=sp, out='out/mega2/b1_frame_void.png', light='aerial', style='scale', res=[1800, 1000],
                     camera=dict(type='persp', loc=[0.0, -2900.0, 360.0], target=[0.0, 1400.0, 760.0], lens=20),
                     fog=dict(h=0.1, gamma=1.4, d=0.45, z_lo=0, z_hi=2000, d_start=0.02, bands=[[260, 180, 0.18]]),
                     clip=[2.0, 60000.0]))
    JOBS.append(dict(spec=sp, out='out/mega2/b2_frame_void_overview.png', light='aerial', style='scale',
                     camera=dict(az=24, el=30, target=[0, 0, 700], ortho_scale=6200),
                     fog=dict(h=0.06, gamma=1.4, d=0.18, z_lo=0, z_hi=2000, d_start=0.1)))
    return sp


# ====================================================================================== (c) continuous monument
def monument():
    rng = random.Random(13)
    s = Spec('n_c_monument', style='scale', light='aerial', seed=203)
    protos(s)
    import terrain as TR
    kw = dict(seed=11, amp=260.0, scale=10000.0, base=-40.0, river=[(-40000, 9000), (0, 4000), (40000, -12000)], river_w=500.0,
              river_depth=30.0)
    F = TR.Field(**kw)
    s.add('terrain', -45000, -30000, 0, 90000, 60000, 1, field=dict(kw, river=[list(p) for p in kw['river']]), res=500.0, bottom=-600.0,
          mat='terrain')
    s.add('cblock', -45000, -30000, -8, 90000, 60000, 6, mat='sea', v=0, top=0)
    s.add('megasweep', 0, 0, 0, 1, 1, 1, mat='grid_white', path=[[-60000, 0, 0], [60000, 0, 0]],
          profile=[[-520, -600], [520, -600], [520, 560], [-520, 560]])
    s.scatter('town_lo', [[rng.uniform(-44000, 44000), rng.uniform(-470, 380), 560, rng.choice((0, 180)), rng.uniform(1.0, 1.8)]
                          for _ in range(320)])
    s.scatter('grove', [[rng.uniform(-44000, 44000), rng.uniform(-460, 380), 560, 0, rng.uniform(1.0, 1.6)] for _ in range(60)])
    lee = []
    for q in range(300):
        x = rng.uniform(-44000, 44000)
        y = 560 + abs(rng.gauss(0, 900))
        z = F.height(x + 45000, y + 30000)
        if z > 1:
            lee.append([round(x / 600) * 600, round(y / 600) * 600, z - 4, 0, 1.0])
    s.scatter('lowcity', list({(p[0], p[1]): p for p in lee}.values()))
    s.add('clouds', -45000, -30000, 2100, 90000, 60000, 300, n=22, size=[1500, 3500], clump=4, avoid=[-2000.0, -2000.0, 9000.0])
    sp = s.write()
    JOBS.append(dict(spec=sp, out='out/mega2/c1_monument.png', light='aerial', style='scale', res=[1800, 1000],
                     camera=dict(type='persp', loc=[-3600.0, -3300.0, 1150.0], target=[7000.0, 700.0, 250.0], lens=28),
                     fog=dict(h=0.15, gamma=1.6, d=0.7, z_lo=-100, z_hi=2500, d_start=0.0), clip=[5.0, 200000.0]))
    JOBS.append(dict(spec=sp, out='out/mega2/c2_monument_roof.png', light='aerial', style='scale',
                     camera=dict(az=35, el=30, target=[1500, 0, 560], ortho_scale=3600),
                     fog=dict(h=0.08, gamma=1.6, d=0.15, z_lo=-100, z_hi=2500, d_start=0.2)))
    return sp


# ====================================================================================== (d) interior void
def interior_void():
    rng = random.Random(14)
    s = Spec('n_d_void', style='scale', light='void', seed=204)
    protos(s)
    X, Y, Z, T = 7000.0, 4600.0, 2600.0, 260.0
    s.add('cblock', -T, -T, -T, X + 2 * T, Y + 2 * T, T, mat='mega_conc', v=0, top=0)
    s.add('cblock', -T, Y, 0, X + 2 * T, T, Z, mat='mega_step', v=0, top=0)
    s.add('cblock', -T, -T, 0, T, Y + T, Z, mat='mega_step', v=0, top=0)
    s.add('cblock', X, -T, 0, T, Y + T, Z, mat='mega_step', v=0, top=0)
    s.add('cblock', -T, -T, 0, X + 2 * T, T, Z, mat='mega_step', v=0, top=0, tags=['frontwall'])
    holes = [(1400, 1500, 500, 700), (4200, 2600, 700, 500), (5600, 900, 450, 450)]
    step = 350.0
    for i in range(int((X + 2 * T) / step) + 1):
        for j in range(int((Y + 2 * T) / step) + 1):
            x, y = -T + i * step, -T + j * step
            if any(hx <= x + step / 2 <= hx + hw and hy <= y + step / 2 <= hy + hd for hx, hy, hw, hd in holes):
                continue
            s.add('cblock', x, y, Z, step, step, T, mat='mega_conc', v=0, top=0)
    for (hx, hy, hw, hd) in holes:
        for ins in (0.0, 80.0):
            s.add('cblock', hx + ins, hy + ins, 0, hw - 2 * ins, hd - 2 * ins, Z, mat='lightshaft', v=0, top=0)
    towns = []
    for (zz, depth) in ((420, 520), (820, 380), (1300, 600), (1800, 420), (2200, 300)):
        x = rng.uniform(0, 600)
        while x < X - 800:
            w = rng.uniform(900, 2200)
            s.add('cblock', x, Y - depth, zz - 40, w, depth, 40, mat='mega_step', v=0, top=0)
            s.add('cwedge', x + w * 0.5 - 60, Y - depth * 0.6, zz - 40 - depth * 0.6, 120, depth * 0.6, depth * 0.6, mat='mega_conc',
                  flip=True)
            for q in range(int(w / 240)):
                if rng.random() < 0.75:
                    towns.append([x + 60 + q * 240, Y - depth + rng.uniform(10, max(12, depth - 120)), zz, 0, rng.uniform(1.4, 2.0)])
            x += w + rng.uniform(300, 1400)
        for (wx, sgn) in ((0.0, 1), (X, -1)):
            y = rng.uniform(0, 800)
            while y < Y - 1200:
                w = rng.uniform(700, 1600)
                x0 = wx if sgn > 0 else wx - depth * 0.8
                s.add('cblock', x0, y, zz - 40, depth * 0.8, w, 40, mat='mega_step', v=0, top=0)
                for q in range(int(w / 240)):
                    if rng.random() < 0.6:
                        towns.append([x0 + 20, y + 40 + q * 240, zz, 90, rng.uniform(1.2, 1.7)])
                y += w + rng.uniform(400, 1500)
    s.scatter('town_hi', towns)
    fl = [[rng.uniform(200, X - 900), rng.uniform(600, Y - 1400), 0, 0, 1.0] for _ in range(60)]
    s.scatter('lowcity', [[round(p[0] / 600) * 600, round(p[1] / 600) * 600, 0, 0, 1.0] for p in fl])
    s.add('cblock', 2600, 1800, 0.2, 1900, 900, 1, mat='lake', v=300, top=0)
    s.add('clouds', 300, 1400, 1250, X - 600, Y - 1800, 200, n=12, size=[250, 600], clump=4)
    sp = s.write()
    JOBS.append(dict(spec=sp, out='out/mega2/d1_interior_void.png', light='void', style='scale', res=[1800, 1000], drop_tags=['frontwall'],
                     camera=dict(type='persp', loc=[3600.0, 260.0, 700.0], target=[3300.0, 4600.0, 900.0], lens=17),
                     fog=dict(h=0.05, gamma=1.4, d=0.32, z_lo=0, z_hi=2600, d_start=0.05, bands=[[450, 260, 0.14], [1300, 200, 0.1]]),
                     clip=[2.0, 30000.0], max_lights=60, env=dict(shaft=0.45), shadow_pool='2048'))
    JOBS.append(dict(spec=sp, out='out/mega2/d2_interior_section.png', light='void', style='scale', drop_tags=['frontwall'],
                     camera=dict(az=0, el=16, target=[3500, 2300, 1150], ortho_scale=8600), env=dict(shaft=0.45),
                     fog=dict(h=0.04, gamma=1.4, d=0.08, z_lo=0, z_hi=2600, bands=[[500, 300, 0.16], [1250, 240, 0.12]]),
                     shadow_pool='2048'))
    return sp


# ====================================================================================== (e) inclined slab (+ solarpunk)
def slab(variant='conc'):
    rng = random.Random(15)
    white = variant == 'solar'
    s = Spec('n_e_slab_' + variant, style='scale', light='aerial_warm', seed=205)
    protos(s)
    s.add('ground', -12000, -12000, 0, 30000, 26000, 1, mat='ground_city', t=2.0)
    run, rise, n = 320.0, 140.0, 17
    Tk = 260.0
    X1, Z1 = run * n, rise * n
    prof = [(0.0, -Tk), (X1, Z1 - Tk), (X1, Z1)]
    x, z = X1, Z1
    for k in range(n):
        prof.append((x - run, z)); x -= run
        prof.append((x, z - rise)); z -= rise
    W = 2600.0
    s.add('megasweep', 0, 0, 0, 1, 1, 1, mat='mega_white' if white else 'mega_step', path=[[0, 0, 0], [0, W, 0]], profile=prof)
    for px in (900, 1900, 2900, 3900, 4900):
        zt = Z1 * px / X1 - Tk
        for py in (350, 1300, 2250):
            s.add('bcol', px - 90, py - 90, 0, 180, 180, zt, mat='mega_white' if white else 'mega_conc', shape='octagon',
                  capital='tree' if white else 'flare', foot='flare')
    pts = []
    for k in range(n):
        xz = X1 - run * (k + 1)
        zz = Z1 - rise * k
        yy = rng.uniform(0, 160)
        while yy < W - 180:
            if rng.random() < 0.85:
                pts.append([xz + rng.uniform(20, 150), yy, zz, 90, rng.uniform(1.0, 1.5)])
            yy += rng.uniform(200, 360)
    if white:
        s.scatter('town_hi', [p for i, p in enumerate(pts) if i % 3 == 0])
        s.scatter('solar', [[p[0] + 40, p[1], p[2], 90, 1.0] for i, p in enumerate(pts) if i % 3 == 1])
        s.scatter('grove', [[p[0] + 20, p[1], p[2], 90, 1.0] for i, p in enumerate(pts) if i % 3 == 2 and rng.random() < 0.6])
    else:
        s.scatter('town_hi', [p for p in pts if p[2] < 1500])
        s.scatter('town_lo', [p for p in pts if p[2] >= 1500])
    city_ring(s, rng, -9000, -9000, 12000, 12000, [(-200, -200, X1 + 200, W + 200)], 0, cx=2800, cy=1300)
    s.scatter('lowcity', [[x, y, 0, 0, 1.0] for x in range(0, int(X1), 600) for y in range(0, int(W), 600) if x < 3600])
    sp = s.write()
    JOBS.append(dict(spec=sp, out='out/mega2/e%d_slab_%s.png' % (1 if not white else 3, variant), light='aerial_warm' if not white else 'aerial',
                     style='scale', res=[1800, 1000], camera=dict(az=-38, el=26, target=[2800, 1300, 1000], ortho_scale=9800),
                     fog=dict(h=0.05, gamma=1.6, d=0.15, z_lo=0, z_hi=3000, d_start=0.1)))
    if not white:
        JOBS.append(dict(spec=sp, out='out/mega2/e2_slab_terraces.png', light='aerial_warm', style='scale',
                         camera=dict(az=-38, el=26, target=[2400, 1000, 1100], ortho_scale=2400),
                         fog=dict(h=0.06, gamma=1.6, d=0.1, z_lo=0, z_hi=3000, d_start=0.1)))
    return sp


# ====================================================================================== (h) infrastructure spine
def spine():
    rng = random.Random(16)
    s = Spec('n_h_spine', style='scale', light='aerial_warm', seed=206)
    protos(s)
    s.add('ground', -20000, -12000, 0, 40000, 24000, 1, mat='ground_city', t=2.0)
    L = 16000.0
    decks = [140.0, 230.0, 320.0, 410.0]
    for dz in decks:
        s.add('megasweep', 0, 0, 0, 1, 1, 1, mat='mega_step', path=[[-L, 0, dz], [L, 0, dz]], profile=[[-430, -14], [430, -14], [430, 0], [-430, 0]])
    for x in range(-int(L), int(L) + 1, 400):
        for yc in (-430, -143, 143, 430):
            s.add('cblock', x - 25, yc - 25, 0, 50, 50, 440, mat='mega_conc', v=12, top=0)
        s.add('cblock', x - 30, -470, 410, 60, 940, 34, mat='mega_conc', v=0, top=8)
        if (x // 400) % 2 == 0:
            for yc in (-430, 430):
                s.add('tripod', x - 110, yc - 110, 0, 220, 220, 90, mat='mega_conc', r=26, splay=100, node=0.35, legs=3,
                      yaw=90 if yc < 0 else 270)
    # transit and services on the decks
    for (dz, yc) in ((140.0, -250.0), (140.0, 250.0)):
        s.add('highway', 0, 0, 0, 1, 1, 1, path=[[-L, yc, dz + 0.1], [L, yc, dz + 0.1]], lanes=4, dirs=2, piers=0, cars=1.2, t=1.8,
              step=40.0, markings=False)
    s.add('piperack', 0, 0, 0, 1, 1, 1, path=[[-L, -300, 320.2 + 12], [L, -300, 320.2 + 12]], pipes=[[10, 'pipe_yellow'], [8, 'pipe_blue'],
          [14, 'insul'], [7, 'pipe_red'], [10, 'pipe_green']], gap=4.0, racks=0, fillet=0, flanges=0, step=80.0)
    tree = dict(path=rpath([(-L, 280, 332), (L, 280, 332)]), n=30, casing=[0.0, 0.0])
    s.add('cabletree', 0, 0, 0, 1, 1, 1, tree=tree, r=5.0, clamps=500.0, step=100.0, cstep=100.0)
    s.add('conveyor', 0, 0, 0, 1, 1, 1, path=[[-L, 60, 230.5], [L, 60, 230.5]], p_w=14.0, cargo='crates', legs=0, spacing=40.0, step=40.0,
          crate_mats=['crate_a', 'crate_b', 'crate_c'])
    # towns built into the structure: on decks 2 and 4 between the lanes, and stacks on deck 3's north side
    t2, t4, t3 = [], [], []
    x = -L + rng.uniform(0, 300)
    while x < L - 200:
        if rng.random() < 0.8:
            t2.append([x, -330 + rng.uniform(0, 80), 230.0, 0, rng.uniform(0.9, 1.2)])
        if rng.random() < 0.85:
            t4.append([x + rng.uniform(-60, 60), -380 + rng.uniform(0, 500), 410.0, 0, rng.uniform(1.0, 1.4)])
        if rng.random() < 0.5:
            t3.append([x, 120 + rng.uniform(0, 100), 320.0, 0, 0.55])
        x += rng.uniform(220, 420)
    s.scatter('town_hi', t2 + t4)
    s.scatter('bay', t3)
    city_ring(s, rng, -19000, -11000, 19000, 11000, [], 0, r_full=9000, r_zero=16000)
    sp = s.write()
    JOBS.append(dict(spec=sp, out='out/mega2/h1_spine.png', light='aerial_warm', style='scale', res=[1800, 1000],
                     camera=dict(az=24, el=28, target=[0, 0, 250], ortho_scale=7200),
                     fog=dict(h=0.05, gamma=1.6, d=0.16, z_lo=0, z_hi=1200, d_start=0.1)))
    JOBS.append(dict(spec=sp, out='out/mega2/h2_spine_below.png', light='aerial_warm', style='scale', res=[1800, 1000],
                     camera=dict(type='persp', loc=[700.0, -1500.0, 22.0], target=[-600.0, 0.0, 300.0], lens=20),
                     fog=dict(h=0.08, gamma=1.6, d=0.45, z_lo=0, z_hi=1200, d_start=0.0), clip=[1.0, 80000.0]))
    JOBS.append(dict(spec=sp, out='out/mega2/h3_spine_decks.png', light='aerial_warm', style='scale',
                     camera=dict(az=24, el=26, target=[400, 0, 300], ortho_scale=1500),
                     fog=dict(h=0.04, gamma=1.6, d=0.1, z_lo=0, z_hi=1200, d_start=0.1)))
    return sp


if __name__ == '__main__':
    for f in (stepped_mass, frame_void, monument, interior_void, lambda: slab('conc'), lambda: slab('solar'), spine):
        f()
    write_jobs('mega2', JOBS, samples=32, max_lights=80)
    write_jobs('legibility', LEG, samples=32, max_lights=80)
