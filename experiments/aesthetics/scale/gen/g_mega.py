"""Megaforms as landscapes: ordinary buildings slotted into structures 10-1000x bigger.  Eight scenes (a)-(h)."""
import math, random
from sc import Spec, write_jobs, town_hi, town_lo, PT, rpath
from g_powers import rib_profile

JOBS = []


def protos(s, dome=0.0):
    s.proto('town_hi', lambda t: town_hi(t, n=40, rows=3))
    s.proto('town_lo', lambda t: town_lo(t))
    s.proto('village', lambda t: town_lo(t, w=120, d=90, n=22))
    s.proto('forest', lambda t: t.add('forestpatch', 0, 0, 0, 160, 110, 1, n=40, size=[12, 22]))
    s.proto('city', lambda t: t.add('citytile', 0, 0, 0, 1200, 1200, 1, n=6, hmin=30, hmax=160, gap=0.3))
    s.proto('santorini', lambda t: t.add('town', 0, 0, 0, 80, 50, 10, n=34, rows=3, step=3.2, trees=1, dome=0.55,
                                         walls=['town_white', 'town_white', 'town_white', 'town_ochre'], roof='flat',
                                         base_mat='town_white'))
    s.proto('solar', lambda t: t.add('solar', 0, 0, 0, 120, 80, 1))


def side_of(t):
    return (t[1], -t[0], 0.0)


def ledge_points(path_a, path_b, ledges, every, jitter, rng, skip=0.35, which=None):
    """Instance points along each ledge of a straight megasweep (world coords): [x, y, z, yaw, s]."""
    ax, ay = path_a[0], path_a[1]
    bx, by = path_b[0], path_b[1]
    L = math.hypot(bx - ax, by - ay)
    t = ((bx - ax) / L, (by - ay) / L)
    sd = side_of(t)
    yaw = math.degrees(math.atan2(t[1], t[0]))
    out = []
    for k, (sa, sb, z) in enumerate(ledges):
        if which is not None and k not in which:
            continue
        u = rng.uniform(0, every)
        while u < L - 60:
            if rng.random() > skip:
                sm = sa - 12.0 - rng.uniform(0, max(1.0, (sa - sb) - 110.0))
                out.append([ax + t[0] * u + sd[0] * sm, ay + t[1] * u + sd[1] * sm, z, yaw, rng.uniform(0.9, 1.6)])
            u += every * rng.uniform(1.0 - jitter, 1.0 + jitter)
    return out


# ====================================================================================== (a) terraced massif
def massif():
    rng = random.Random(1)
    s = Spec('m_a_massif', style='scale', light='aerial_warm', seed=101)
    protos(s)
    s.add('ground', -30000, -20000, 0, 60000, 45000, 1, mat='plain', t=2.0)
    s.add('cblock', -30000, -6000, 0.05, 60000, 900, 0.4, mat='lake', v=0, top=0)
    hi, lo, fo = [], [], []
    ridges = [((-9000, 0), (6000, 1200), dict(front=[320, 280, 360, 300, 340, 280, 320, 300, 360, 280], crest=700,
                                                  back=[(500, 450)] * 6, hr=150, ch=30)),
              ((-4000, 3500), (7000, 4300), dict(front=[260, 240, 300, 260, 280, 260, 240, 300, 260, 280, 250, 240, 260],
                                                   crest=600, back=[(400, 500)] * 6, hr=160, ch=30)),
              ((1500, -2600), (9500, -1800), dict(front=[300, 260, 340, 300, 280], crest=900, back=[(600, 400)] * 3, hr=140, ch=24)),
              ((-12000, -1800), (-5000, -800), dict(front=[300, 340, 280, 320, 300, 260], crest=800, back=[(500, 400)] * 3, hr=145, ch=24))]
    for (a, b, kw) in ridges:
        prof, ledges, ztop = rib_profile(**kw)
        s.add('megasweep', 0, 0, 0, 1, 1, 1, mat='mega_step', path=[[a[0], a[1], 0], [b[0], b[1], 0]], profile=prof)
        pts = ledge_points(a, b, ledges, 520.0, 0.4, rng, skip=0.3)
        for p in pts:
            r = rng.random()
            (hi if (r < 0.25 and abs(p[0]) < 5000) else lo if r < 0.7 else fo).append(p)
    s.scatter('town_hi', hi)
    s.scatter('town_lo', lo)
    s.scatter('forest', fo)
    # villages and forests on the plain
    s.scatter('village', [[rng.uniform(-26000, 26000), rng.uniform(-18000, -5200), 0, rng.uniform(0, 360), rng.uniform(1, 1.6)]
                          for _ in range(140)])
    s.scatter('forest', [[rng.uniform(-28000, 28000), rng.uniform(-19000, -4200), 0, rng.uniform(0, 360), rng.uniform(2, 5)]
                         for _ in range(260)])
    # falls
    for q in range(18):
        x = rng.uniform(-8000, 5000)
        s.add('cblock', x, -150 + 0.08 * (x + 9000) * 1200 / 15000 - 1500 + rng.uniform(0, 600), 0, 12, 6, 1100, mat='waterfall', v=0, top=0)
    # a cloud layer at mid-height of the massif
    s.add('clouds', -20000, -9000, 900, 36000, 20000, 260, n=110, size=[500, 1500], clump=5, tags=['clouds'])
    sp = s.write()
    JOBS.append(dict(spec=sp, out='out/mega/a1_massif.png', light='aerial_warm', style='scale', res=[1800, 1000],
                     camera=dict(az=18, el=24, target=[-500, 800, 900], ortho_scale=17500),
                     fog=dict(h=0.25, gamma=1.6, d=0.35, z_lo=0, z_hi=2600, d_start=0.1)))
    JOBS.append(dict(spec=sp, out='out/mega/a2_massif_ledges.png', light='aerial_warm', style='scale',
                     camera=dict(az=18, el=24, target=[-1500, 200, 800], ortho_scale=4200),
                     fog=dict(h=0.15, gamma=1.6, d=0.2, z_lo=0, z_hi=2600, d_start=0.1)))
    return sp


# ====================================================================================== (b) caldera
def caldera():
    rng = random.Random(2)
    s = Spec('m_b_caldera', style='scale', light='aerial', seed=102)
    protos(s)
    S, H = 6000.0, 760.0
    s.add('ground', -14000, -14000, 0, 28000, 28000, 1, mat='plain', t=2.0)
    bands = [[150, 160], [130, 150], [120, 170], [120, 150], [120, 140], [120, 0]]
    s.add('caldera', -S / 2, -S / 2, 0, S, S, H, mat='mega_step', fill_mat='mega_blank', R=2150.0, bands=bands, n=96,
          alcoves=[4, 10, 12, 10, 8, 6], alcove=[70.0, 40.0], lake=True)
    # Santorini towns on the rim and on each terrace ledge, facing the pit
    R = 2150.0
    z = H
    pts = []
    for bi, (bh, sin) in enumerate(bands):
        z -= bh
        r_ledge = R - sin * 0.5 - 25.0
        R -= sin
        if sin < 60:
            continue
        n = int(2 * math.pi * r_ledge / 260)
        for k in range(n):
            if rng.random() < 0.45:
                continue
            a = 2 * math.pi * k / n + rng.uniform(-0.02, 0.02)
            pts.append([r_ledge * math.cos(a), r_ledge * math.sin(a), z, math.degrees(a) + 90, rng.uniform(0.9, 1.3)])
    for k in range(70):
        a = 2 * math.pi * k / 70
        if rng.random() < 0.3:
            continue
        pts.append([(2150 + 90) * math.cos(a), (2150 + 90) * math.sin(a), H, math.degrees(a) + 90, rng.uniform(1.0, 1.4)])
    s.scatter('santorini', pts)
    s.scatter('village', [[rng.uniform(-13000, 13000), rng.uniform(-13000, -3400), 0, rng.uniform(0, 360), 1.3] for _ in range(60)])
    s.scatter('forest', [[rng.uniform(-13000, 13000), rng.uniform(-13000, 13000), 0, rng.uniform(0, 360), rng.uniform(2, 5)]
                         for _ in range(260) if True])
    sp = s.write()
    JOBS.append(dict(spec=sp, out='out/mega/b1_caldera.png', light='aerial', style='scale',
                     camera=dict(az=30, el=38, target=[0, 0, 300], ortho_scale=7600),
                     fog=dict(h=0.08, gamma=1.6, d=0.18, z_lo=0, z_hi=1500, d_start=0.2)))
    JOBS.append(dict(spec=sp, out='out/mega/b2_caldera_wall.png', light='aerial', style='scale',
                     camera=dict(az=30, el=24, target=[-900, 1500, 420], ortho_scale=1700),
                     fog=dict(h=0.05, gamma=1.6, d=0.1, z_lo=0, z_hi=1500, d_start=0.2)))
    return sp


# ====================================================================================== (c) continuous monument
def monument():
    rng = random.Random(3)
    s = Spec('m_c_monument', style='scale', light='aerial', seed=103)
    protos(s)
    field = dict(seed=11, amp=420.0, scale=9000.0, base=-60.0, river=[(-40000, 9000), (0, 4000), (40000, -12000)], river_w=500.0,
                 river_depth=40.0)
    s.add('terrain', -45000, -30000, 0, 90000, 60000, 1, field=field, res=500.0, bottom=-600.0, mat='terrain')
    s.add('cblock', -45000, -30000, -8, 90000, 60000, 6, mat='sea', v=0, top=0)
    s.add('megasweep', 0, 0, 0, 1, 1, 1, mat='grid_white', path=[[-60000, 0, 0], [60000, 0, 0]],
          profile=[[-520, -600], [520, -600], [520, 560], [-520, 560]])
    # towns and fields on the roof
    roof = []
    for q in range(260):
        roof.append([rng.uniform(-44000, 44000), rng.uniform(-470, 380), 560, rng.choice((0, 180)), rng.uniform(1.0, 1.8)])
    s.scatter('town_lo', roof)
    s.scatter('forest', [[rng.uniform(-44000, 44000), rng.uniform(-460, 360), 560, 0, rng.uniform(1.0, 2.0)] for _ in range(200)])
    # towns in the lee (north side), on the terrain
    import sys
    sys.path.insert(0, '..')
    import terrain as TR
    F = TR.Field(seed=11, amp=420.0, scale=9000.0, base=-60.0, river=[(-40000, 9000), (0, 4000), (40000, -12000)], river_w=500.0,
                 river_depth=40.0)
    lee = []
    for q in range(420):
        x = rng.uniform(-44000, 44000)
        y = 520 + abs(rng.gauss(0, 1800)) + 40
        z = F.height(x + 45000, y + 30000)
        if z > 1:
            lee.append([x, y, z - 2, rng.uniform(0, 360), rng.uniform(1.0, 1.6)])
    s.scatter('village', lee)
    fo = []
    for q in range(900):
        x, y = rng.uniform(-44000, 44000), rng.uniform(-29000, 29000)
        if abs(y) < 900:
            continue
        z = F.height(x + 45000, y + 30000)
        if z > 5:
            fo.append([x, y, z - 3, rng.uniform(0, 360), rng.uniform(3, 7)])
    s.scatter('forest', fo)
    s.add('clouds', -45000, -30000, 1500, 90000, 60000, 400, n=90, size=[1500, 4500], clump=5)
    sp = s.write()
    JOBS.append(dict(spec=sp, out='out/mega/c1_monument.png', light='aerial', style='scale', res=[1800, 1000],
                     camera=dict(type='persp', loc=[-7000.0, -6500.0, 2400.0], target=[9000.0, 600.0, 200.0], lens=30),
                     fog=dict(h=0.2, gamma=1.6, d=0.75, z_lo=-100, z_hi=2500, d_start=0.0), clip=[5.0, 200000.0]))
    JOBS.append(dict(spec=sp, out='out/mega/c2_monument_roof.png', light='aerial', style='scale',
                     camera=dict(az=35, el=30, target=[1500, 0, 560], ortho_scale=3600),
                     fog=dict(h=0.08, gamma=1.6, d=0.15, z_lo=-100, z_hi=2500, d_start=0.2)))
    return sp


# ====================================================================================== (d) interior void
def void():
    rng = random.Random(4)
    s = Spec('m_d_void', style='scale', light='void', seed=104)
    protos(s)
    X, Y, Z, T = 7000.0, 4600.0, 2600.0, 260.0
    s.add('cblock', -T, -T, -T, X + 2 * T, Y + 2 * T, T, mat='mega_blank', v=0, top=0)                  # floor
    s.add('cblock', -T, Y, 0, X + 2 * T, T, Z, mat='mega_step', v=0, top=0)                             # back wall (north)
    s.add('cblock', -T, -T, 0, T, Y + T, Z, mat='mega_step', v=0, top=0)                                # west wall
    s.add('cblock', X, -T, 0, T, Y + T, Z, mat='mega_step', v=0, top=0)                                 # east wall
    s.add('cblock', -T, -T, 0, X + 2 * T, T, Z, mat='mega_step', v=0, top=0, tags=['frontwall'])        # front wall
    # ceiling with openings (light wells)
    holes = [(1400, 1500, 500, 700), (4200, 2600, 700, 500), (5600, 900, 450, 450)]
    step = 350.0
    xs = [(-T + i * step) for i in range(int((X + 2 * T) / step) + 1)]
    ys = [(-T + j * step) for j in range(int((Y + 2 * T) / step) + 1)]
    for x in xs:
        for y in ys:
            if any(hx <= x + step / 2 <= hx + hw and hy <= y + step / 2 <= hy + hd for hx, hy, hw, hd in holes):
                continue
            s.add('cblock', x, y, Z, step, step, T, mat='mega_blank', v=0, top=0)
    for (hx, hy, hw, hd) in holes:
        for k, ins in enumerate((0.0, 60.0, 130.0)):
            s.add('cblock', hx + ins, hy + ins, 0, hw - 2 * ins, hd - 2 * ins, Z, mat='lightshaft', v=0, top=0)
    # shelves on the walls with towns, stacks hanging below them
    towns, stacks = [], []
    for (zz, depth) in ((420, 520), (820, 380), (1300, 600), (1800, 420), (2200, 300)):
        # back wall shelf segments
        x = rng.uniform(0, 600)
        while x < X - 800:
            w = rng.uniform(900, 2200)
            s.add('cblock', x, Y - depth, zz - 40, w, depth, 40, mat='mega_step', v=0, top=0)
            for q in range(int(w / 260)):
                if rng.random() < 0.7:
                    towns.append([x + 60 + q * 260, Y - depth + rng.uniform(10, max(12, depth - 90)), zz, 0, rng.uniform(0.9, 1.4)])
            x += w + rng.uniform(300, 1400)
        # west and east wall shelves
        for (wx, sgn) in ((0.0, 1), (X, -1)):
            y = rng.uniform(0, 800)
            while y < Y - 1200:
                w = rng.uniform(700, 1600)
                x0 = wx if sgn > 0 else wx - depth * 0.8
                s.add('cblock', x0, y, zz - 40, depth * 0.8, w, 40, mat='mega_step', v=0, top=0)
                for q in range(int(w / 260)):
                    if rng.random() < 0.6:
                        towns.append([x0 + 20, y + 40 + q * 260, zz, 90, rng.uniform(0.8, 1.2)])
                y += w + rng.uniform(400, 1500)
    s.scatter('town_hi', towns)
    # the floor city: towns, city tiles, forests, a lake
    fl = []
    for q in range(160):
        fl.append([rng.uniform(200, X - 1300), rng.uniform(900, Y - 1600), 0, rng.choice((0, 90)), rng.uniform(0.8, 1.2)])
    s.scatter('city', fl[:40])
    s.scatter('town_lo', [[p[0], p[1], 0, p[3], p[4] * 2] for p in fl[40:]])
    s.scatter('forest', [[rng.uniform(100, X - 300), rng.uniform(300, Y - 300), 0, 0, rng.uniform(2, 4)] for _ in range(120)])
    s.add('cblock', 2600, 1800, 0.2, 1900, 900, 1, mat='lake', v=300, top=0)
    # weather inside: a cloud layer at mid-height
    s.add('clouds', 300, 700, 1150, X - 600, Y - 1400, 250, n=45, size=[250, 700], clump=5)
    sp = s.write()
    JOBS.append(dict(spec=sp, out='out/mega/d1_void.png', light='void', style='scale', res=[1800, 1000], drop_tags=['frontwall'],
                     camera=dict(type='persp', loc=[3600.0, 220.0, 1050.0], target=[3300.0, 4600.0, 900.0], lens=17),
                     fog=dict(h=0.1, gamma=1.4, d=0.55, z_lo=0, z_hi=2600, d_start=0.05, bands=[[500, 320, 0.28], [1250, 260, 0.2]]),
                     clip=[2.0, 30000.0], max_lights=60))
    JOBS.append(dict(spec=sp, out='out/mega/d2_void_section.png', light='void', style='scale',
                     camera=dict(az=0, el=18, target=[3500, 2300, 1200], ortho_scale=8800), drop_tags=['frontwall'],
                     fog=dict(h=0.05, gamma=1.4, d=0.1, z_lo=0, z_hi=2600, bands=[[500, 320, 0.2], [1250, 260, 0.15]])))
    return sp


# ====================================================================================== (e) diagonal slab
def slab():
    rng = random.Random(5)
    s = Spec('m_e_slab', style='scale', light='aerial_warm', seed=105)
    protos(s)
    s.add('ground', -12000, -12000, 0, 30000, 26000, 1, mat='plain', t=2.0)
    run, rise, n = 320.0, 140.0, 17          # 320 m : 140 m = 2 cells : 1 level at the building grid (8 m : 3.5 m)
    Tk = 260.0
    X1, Z1 = run * n, rise * n
    prof = [(0.0, -Tk), (X1, Z1 - Tk), (X1, Z1)]
    x, z = X1, Z1
    for k in range(n):
        prof.append((x - run, z))
        x -= run
        prof.append((x, z - rise))
        z -= rise
    prof = [p for i, p in enumerate(prof) if i == 0 or p != prof[i - 1]]
    if prof[-1][1] <= -Tk + 1e-6:
        prof.pop()
    W = 2600.0
    s.add('megasweep', 0, 0, 0, 1, 1, 1, mat='mega_step', path=[[0, 0, 0], [0, W, 0]], profile=prof)
    # piers
    for px in (900, 1900, 2900, 3900, 4900):
        zt = Z1 * px / X1 - Tk
        for py in (350, 1300, 2250):
            s.add('bcol', px - 90, py - 90, 0, 180, 180, zt, mat='bconc', shape='octagon', capital='flare')
    # neighbourhoods on every terrace
    pts = []
    for k in range(n):
        xz = X1 - run * (k + 1)
        zz = Z1 - rise * k
        yy = rng.uniform(0, 200)
        while yy < W - 200:
            if rng.random() < 0.8:
                pts.append([xz + rng.uniform(20, 160), yy, zz, 90, rng.uniform(0.9, 1.4)])
            yy += rng.uniform(220, 420)
    s.scatter('town_hi', [p for p in pts if p[2] < 1400])
    s.scatter('town_lo', [p for p in pts if p[2] >= 1400])
    # the city in its shade and around
    s.scatter('city', [[rng.uniform(-6000, 9000), rng.uniform(-6000, 9000), 0, 0, rng.uniform(0.5, 1.0)] for _ in range(70)])
    s.scatter('village', [[rng.uniform(-9000, 12000), rng.uniform(-9000, 12000), 0, rng.uniform(0, 360), 1.5] for _ in range(80)])
    s.scatter('forest', [[rng.uniform(-11000, 14000), rng.uniform(-11000, 13000), 0, 0, rng.uniform(2, 5)] for _ in range(200)])
    sp = s.write()
    JOBS.append(dict(spec=sp, out='out/mega/e1_slab.png', light='aerial_warm', style='scale', res=[1800, 1000],
                     camera=dict(az=-38, el=26, target=[2800, 1300, 1000], ortho_scale=9800),
                     fog=dict(h=0.12, gamma=1.6, d=0.25, z_lo=0, z_hi=3000, d_start=0.1)))
    JOBS.append(dict(spec=sp, out='out/mega/e2_slab_terraces.png', light='aerial_warm', style='scale',
                     camera=dict(az=-38, el=26, target=[2400, 1000, 1100], ortho_scale=2400),
                     fog=dict(h=0.06, gamma=1.6, d=0.1, z_lo=0, z_hi=3000, d_start=0.1)))
    return sp


# ====================================================================================== (f) km-scale tetrapods on a coast
def tetrapods():
    rng = random.Random(6)
    s = Spec('m_f_tetrapods', style='scale', light='aerial', seed=106)
    protos(s)
    s.add('cblock', -30000, -30000, -40, 60000, 60000, 38, mat='sea', v=0, top=0)
    s.add('ground', -30000, 600, 0, 60000, 30000, 1, mat='plain', t=40.0)
    s.add('cblock', -30000, 200, -2, 60000, 420, 2.5, mat='sand', v=0, top=0)
    L = 1500.0
    th = math.acos(-1.0 / 3.0)
    town_pts = []
    for i, x in enumerate(range(-13500, 14000, 3400)):
        y = rng.uniform(-900, 300)
        yaw = rng.uniform(0, 360)
        s.add('tetrapod', x - L, y - L, -30, 2 * L, 2 * L, 2 * L, mat='mega_step', size=L, yaw=yaw)
        # towns along the upper surfaces of the three lower legs
        cz = -30 + L / 3.0
        for k in range(3):
            a = math.radians(yaw) + 2 * math.pi * k / 3
            dvec = (math.sin(th) * math.cos(a), math.sin(th) * math.sin(a), math.cos(th))
            for tt in (0.3, 0.45, 0.6, 0.75):
                r = L * (0.3 + (0.18 - 0.3) * tt)
                px, py = x + dvec[0] * L * tt, y + dvec[1] * L * tt
                pz = cz + dvec[2] * L * tt + r * 0.95
                if rng.random() < 0.75:
                    town_pts.append([px, py, pz, math.degrees(a), rng.uniform(0.5, 0.8)])
    s.scatter('town_hi', town_pts)
    s.scatter('village', [[rng.uniform(-28000, 28000), rng.uniform(900, 16000), 0, rng.uniform(0, 360), rng.uniform(1.0, 1.6)]
                          for _ in range(260)])
    s.scatter('forest', [[rng.uniform(-28000, 28000), rng.uniform(1500, 28000), 0, 0, rng.uniform(2, 6)] for _ in range(400)])
    s.add('clouds', -30000, -9000, 1100, 60000, 30000, 300, n=50, size=[600, 1800], clump=5)
    sp = s.write()
    JOBS.append(dict(spec=sp, out='out/mega/f1_tetrapods.png', light='aerial', style='scale', res=[1800, 1000],
                     camera=dict(az=12, el=26, target=[0, 900, 400], ortho_scale=21000),
                     fog=dict(h=0.12, gamma=1.6, d=0.35, z_lo=-40, z_hi=2500, d_start=0.1)))
    JOBS.append(dict(spec=sp, out='out/mega/f2_tetrapod_close.png', light='aerial', style='scale',
                     camera=dict(az=12, el=24, target=[-3400 + 200, 200, 300], ortho_scale=4200),
                     fog=dict(h=0.05, gamma=1.6, d=0.12, z_lo=-40, z_hi=2500, d_start=0.1)))
    return sp


# ====================================================================================== (g) solarpunk forested ridge
def green_ridge():
    rng = random.Random(7)
    s = Spec('m_g_green', style='scale_green', light='aerial_warm', seed=107)
    protos(s)
    s.add('ground', -20000, -20000, 0, 40000, 40000, 1, mat='plain', t=2.0)
    s.add('cblock', -20000, -3400, 0.05, 40000, 500, 0.4, mat='lake', v=0, top=0)
    prof, ledges, ztop = rib_profile(front=[240, 260, 220, 280, 240, 260, 230, 250, 270], crest=500, back=[(420, 360)] * 5,
                                     hr=120, ch=20)
    a, b = (-9000, 0), (3500, 0)
    s.add('megasweep', 0, 0, 0, 1, 1, 1, mat='mega_green', path=[[a[0], a[1], 0], [b[0], b[1], 0]], profile=prof)
    pts = ledge_points(a, b, ledges, 200.0, 0.3, rng, skip=0.05)
    s.scatter('forest', [p[:3] + [0, rng.uniform(1.0, 1.8)] for p in pts if rng.random() < 0.72])
    s.scatter('solar', [p[:3] + [0, 1.0] for p in pts if rng.random() < 0.08])
    s.scatter('town_hi', [p[:3] + [0, 1.0] for p in pts if rng.random() < 0.1 and p[0] > -3000])
    # forest on the crest, on the back, and all over the plain (the ridge reads as a forested mountain)
    s.scatter('forest', [[rng.uniform(-9000, 3500), rng.uniform(1500, 4000), 0, 0, 2.0] for _ in range(60)])
    s.scatter('forest', [[rng.uniform(-19000, 19000), rng.uniform(-19000, -3500), 0, 0, rng.uniform(2, 5)] for _ in range(420)])
    s.scatter('village', [[rng.uniform(-18000, 18000), rng.uniform(-18000, -3000), 0, rng.uniform(0, 360), 1.4] for _ in range(70)])
    # cable cars climbing the face, falls
    for q in range(5):
        x = rng.uniform(-8000, 3000)
        k = rng.randrange(0, 4)
        sa, sb, z0 = ledges[k]
        sa2, sb2, z1 = ledges[k + 4]
        s.add('cablespan', 0, 0, 0, 1, 1, 1, a=[x, -sa + 40, z0 + 30], b=[x + 300, -sa2 + 40, z1 + 30], n=2, sag=18.0, r=1.2,
              mats=['steel_dark'])
    for q in range(10):
        x = rng.uniform(-8500, 3000)
        k = rng.randrange(1, len(ledges))
        s.add('cblock', x, -ledges[k - 1][1] - 8, ledges[k - 1][2], 10, 5, 120, mat='waterfall', v=0, top=0)
    sp = s.write()
    JOBS.append(dict(spec=sp, out='out/mega/g1_green_ridge.png', light='aerial_warm', style='scale_green', res=[1800, 1000],
                     camera=dict(az=36, el=24, target=[-1500, 800, 500], ortho_scale=9500),
                     fog=dict(h=0.12, gamma=1.6, d=0.25, z_lo=0, z_hi=2000, d_start=0.1)))
    JOBS.append(dict(spec=sp, out='out/mega/g2_green_cut.png', light='aerial_warm', style='scale_green',
                     camera=dict(az=48, el=20, target=[3300, 600, 500], ortho_scale=2600),
                     fog=dict(h=0.06, gamma=1.6, d=0.1, z_lo=0, z_hi=2000, d_start=0.1)))
    return sp


# ====================================================================================== (h) a conduit trunk as big as a valley
def conduit():
    rng = random.Random(8)
    s = Spec('m_h_conduit', style='scale', light='aerial_warm', seed=108)
    protos(s)
    import sys
    sys.path.insert(0, '..')
    import terrain as TR
    riv = [(-30000, -2000), (-15000, 1500), (-4000, -800), (6000, 1200), (18000, -1500), (30000, 800)]
    fld = dict(seed=21, amp=900.0, scale=11000.0, base=40.0, river=[(x + 30000, y + 20000) for x, y in riv], river_w=1600.0,
               river_depth=60.0)
    F = TR.Field(seed=21, amp=900.0, scale=11000.0, base=40.0, river=[(x + 30000, y + 20000) for x, y in riv], river_w=1600.0,
                 river_depth=60.0)
    s.add('terrain', -30000, -20000, 0, 60000, 40000, 1, field=fld, res=400.0, bottom=-600.0, mat='terrain')
    trunk = [(x, y, -40.0 + 230.0) for x, y in riv]
    tree = dict(path=rpath(PT.catmull(trunk, 800.0)), n=34, casing=[0.0, 0.0], fillet=2000.0, children=[])
    # tributary branches splitting off toward cities in side valleys
    tree['path'] = rpath(PT.catmull(trunk[:4], 800.0))
    tree['children'] = [
        dict(path=rpath(PT.catmull([trunk[3], (9000, 2400, 190), (18000, 800, 200), (30000, 1400, 200)], 800.0)), n=20, fillet=2000.0),
        dict(path=rpath(PT.catmull([trunk[3], (8000, -1800, 210), (11000, -7000, 400), (12500, -13000, 700)], 800.0)), n=8,
             fillet=2000.0),
        dict(path=rpath(PT.catmull([trunk[3], (7500, 3600, 210), (9000, 9000, 420), (9500, 15000, 700)], 800.0)), n=6, fillet=2000.0)]
    s.add('cabletree', 0, 0, 0, 1, 1, 1, tree=tree, r=26.0, clamps=1400.0, clamp_mat='bconc', step=160.0, cstep=120.0)
    # towns riding on the trunk (on top of the bundle) and along the valley sides; cities at the branch ends
    top = []
    for p in PT.resample([tuple(q) for q in tree['path']], 700.0):
        if rng.random() < 0.8:
            top.append([p[0], p[1], p[2] + 150, rng.uniform(0, 360), rng.uniform(0.9, 1.3)])
    s.scatter('town_hi', top)
    side = []
    for q in range(500):
        x, y = rng.uniform(-29000, 29000), rng.uniform(-19000, 19000)
        z = F.height(x + 30000, y + 20000)
        if 5 < z < 400:
            side.append([x, y, z - 3, rng.uniform(0, 360), rng.uniform(1.0, 1.6)])
    s.scatter('village', side[:200])
    fo = []
    for q in range(900):
        x, y = rng.uniform(-29000, 29000), rng.uniform(-19000, 19000)
        z = F.height(x + 30000, y + 20000)
        if z > 60:
            fo.append([x, y, z - 5, 0, rng.uniform(3, 7)])
    s.scatter('forest', fo)
    s.scatter('city', [[30000 - 1500, 1400, F.height(58500, 21400), 0, 1.2], [12500 - 600, -13000, F.height(42500, 7000), 0, 0.9],
                       [9500 - 600, 15000, F.height(39500, 35000), 0, 0.9]])
    s.add('clouds', -30000, -20000, 1500, 60000, 40000, 400, n=70, size=[1200, 3500], clump=5)
    sp = s.write()
    JOBS.append(dict(spec=sp, out='out/mega/h1_conduit.png', light='aerial_warm', style='scale', res=[1800, 1000],
                     camera=dict(az=28, el=30, target=[0, 0, 200], ortho_scale=30000),
                     fog=dict(h=0.12, gamma=1.6, d=0.3, z_lo=0, z_hi=2500, d_start=0.1)))
    JOBS.append(dict(spec=sp, out='out/mega/h2_conduit_close.png', light='aerial_warm', style='scale',
                     camera=dict(az=28, el=26, target=[5000, 800, 250], ortho_scale=5200),
                     fog=dict(h=0.06, gamma=1.6, d=0.12, z_lo=0, z_hi=2500, d_start=0.1)))
    return sp


if __name__ == '__main__':
    for f in (massif, caldera, monument, void, slab, tetrapods, green_ridge, conduit):
        f()
    write_jobs('mega', JOBS, samples=32, max_lights=80)
