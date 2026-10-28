"""Powers of Ten: one continuous location from a roof terrace (10 m) to a continent-scale hub (1000 km).

The focus F is the roof terrace of a house at the origin.  Everything nests around it:
  ring A  (~10 m)    terrace props
  ring B  (~100 m)   the hill town on ledge 5 of the Rib; the ledge edge in front, the inhabited riser behind
  ring C  (~1 km)    the Rib's terraced face: stepped megasweep with windows, instanced towns / forests / falls
  ring D  (~10 km)   the whole Rib cross-section over plains with villages and forest patches
  ring E  (~100 km)  48 radial ribs (far LOD: smooth prisms painted with the same terraces), cities between them
  ring F  (~1000 km) the ribs are spokes of the Hub; coast, sea, cloud layers
"""
import math, random
from sc import Spec, write_jobs, town_hi, town_lo, PT

rng = random.Random(10)
HR = 140.0
FRONT = [300, 260, 360, 300, 340, 280, 320, 260, 300, 280, 320]     # front ledge depths (m), bottom to top
CREST = 900.0
BACK = [(500, 420), (600, 420), (700, 440), (800, 420)]              # back steps (ledge depth, drop)
FOCUS_LEDGE = 4                                                      # ledge index carrying the focal town
CH = 5.0                                                             # chamfer at riser tops (hewn edge)


def rib_profile(front=None, crest=None, back=None, hr=None, ch=None):
    """CCW (s, n) profile; +s faces the camera (south).  Returns (profile, ledges [(s_front, s_back, z)], crest z)."""
    front = FRONT if front is None else front
    crest = CREST if crest is None else crest
    back = BACK if back is None else back
    hr = HR if hr is None else hr
    ch = CH if ch is None else ch
    s_f = sum(front) + crest * 0.5
    s, z = s_f, 0.0
    body = [(s_f, 0.0)]
    ledges = []
    for ld in front:
        body += [(s, z + hr - ch), (s - ch, z + hr)]
        z += hr
        ledges.append((s - ch, s - ld, z))
        s -= ld
        body.append((s, z))
    body += [(s, z + hr - ch), (s - ch, z + hr)]
    z += hr
    ztop = z
    s -= crest
    body.append((s, z))
    for (ld, drop) in back:
        z = max(0.0, z - drop)
        body.append((s, z))
        if z <= 0.0:
            break
        s -= ld
        body.append((s, z))
    if z > 0.0:
        body.append((s, 0.0))
    s_end = body[-1][0]
    prof = [(s_end, 0.0)] + body[:-1]
    return prof, ledges, ztop


PROF, LEDGES, ZTOP = rib_profile()
_crest = [p for p in PROF if p[1] >= max(q[1] for q in PROF) - 1e-6]
ENVELOPE = [PROF[0], PROF[1], (max(p[0] for p in _crest), _crest[0][1]), (min(p[0] for p in _crest), _crest[0][1])]
sa, sb, ZL = LEDGES[FOCUS_LEDGE]
S_F = sa - 28.0          # the focal house sits 28 m back from the ledge edge
Y_RIB = S_F              # sweep path y so that F lies at y = 0 (side = -y)
ROOF = ZL + 9.6


def world(s, lod_far=True):
    # ---------------- prototypes
    s.proto('town_hi', lambda t: town_hi(t, n=40, rows=3))
    s.proto('town_lo', lambda t: town_lo(t))
    s.proto('forest', lambda t: t.add('forestpatch', 0, 0, 0, 160, 110, 1, n=40, size=[12, 22]))
    s.proto('city', lambda t: t.add('citytile', 0, 0, 0, 2400, 2400, 1, n=8, hmin=30, hmax=220, gap=0.3))
    s.proto('village', lambda t: town_lo(t, w=120, d=90, n=22))
    from sc import lowcity
    s.proto('lowcity', lambda t: lowcity(t, 600.0, 5))

    # ---------------- ring A: the roof terrace of the focal house (centre at the origin)
    x0, y0 = -6.0, -5.0
    s.add('cblock', x0, y0, ZL, 12, 10, 9.6, mat='town_white', v=0, top=0)
    s.add('cblock', x0 - 0.2, y0 - 0.2, ROOF, 12.4, 10.4, 0.15, mat='tile_floor', v=0, top=0)
    for (a, b, c, d) in ((x0 - 0.2, y0 - 0.2, 12.4, 0.3), (x0 - 0.2, y0 + 9.9, 12.4, 0.3), (x0 - 0.2, y0 - 0.2, 0.3, 10.4),
                         (x0 + 11.9, y0 - 0.2, 0.3, 10.4)):
        s.add('cblock', a, b, ROOF, c, d, 1.0, mat='town_white', v=0, top=0)
    s.add('cblock', x0 + 8.4, y0 + 6.4, ROOF, 3.2, 3.2, 2.6, mat='town_white', v=0, top=0)      # stair hut
    s.add('cblock', x0 + 9.2, y0 + 6.35, ROOF, 1.1, 0.1, 2.1, mat='timber', v=0, top=0)        # its door
    s.add('cblock', -1.2, -0.8, ROOF + 0.15, 1.4, 1.0, 0.75, mat='timber', v=0, top=0)          # table
    for (cx, cy) in ((-1.9, -0.6), (0.5, -0.6)):
        s.add('cblock', cx, cy, ROOF + 0.15, 0.5, 0.5, 0.45, mat='timber_dark', v=0, top=0)
    s.add('bcol', -0.6, -0.4, ROOF + 0.9, 0.12, 0.12, 1.4, mat='steel_light', shape='round')
    s.add('figure', -0.8, 0.4, ROOF + 0.15, 0.6, 0.6, 1)
    s.add('figure', 2.2, 2.4, ROOF + 0.15, 0.6, 0.6, 1)
    for (px, py) in ((-5.4, -4.4), (-5.4, 3.6), (1.5, -4.4), (4.2, -4.4), (-5.4, 0.0)):
        s.add('planter', px, py, ROOF + 0.15, 1.2, 0.8, 1, ph=0.55)
    s.add('laundry', -5.0, 1.4, ROOF + 0.15, 4.4, 0.6, 1)
    s.add('tank', 3.8, 2.4, ROOF + 0.15, 1.4, 1.4, 1.6, mat='white_paint', legs=0.4)
    s.add('solar', 1.6, 2.8, ROOF + 0.15, 2.2, 2.4, 1)
    s.add('umbrella', -2.2, -2.0, ROOF + 0.15, 3.0, 3.0, 2.6, mat='cloth_a')
    s.add('tree', 4.6, -3.8, ROOF + 0.9, 1, 1, 1, height=2.4, species='bush')

    # ---------------- ring B: the hill town on the focal ledge (explicit, around the house) + ledge furniture
    for (tx, tw) in ((-150.0, 138.0), (12.0, 138.0)):
        s.add('town', tx, -22.0, ZL, tw, 34.0, 10, n=40, rows=2, step=0.0, trees=5, plaza=False, dome=0.0)
    s.add('town', -150.0, 16.0, ZL, 300.0, 90.0, 10, n=80, rows=4, step=3.2, trees=8, dome=0.0)
    s.add('cblock', -160.0, -27.0, ZL - 0.2, 320.0, 130.0, 0.4, mat='paving', v=0, top=0)
    s.add('vines', -700.0, -29.2, ZL - HR, 1400.0, 1.0, HR, sides='s', len=[6, 34], density=0.05, leaf=1.1)

    # ---------------- ring C/D: the Rib itself (detailed, stepped) and its far continuation (smooth, painted)
    L_det = 11000.0
    s.add('megasweep', 0, 0, 0, 1, 1, 1, mat='mega_step', path=[[-L_det, Y_RIB, 0.0], [L_det, Y_RIB, 0.0]], profile=PROF, step=0)
    if lod_far:
        far = ENVELOPE
        s.add('megasweep', 0, 0, 0, 1, 1, 1, mat='mega_far', path=[[L_det, Y_RIB, 0.0], [230000.0, Y_RIB, 0.0]], profile=far)
        s.add('megasweep', 0, 0, 0, 1, 1, 1, mat='mega_far', path=[[-160000.0, Y_RIB, 0.0], [-L_det, Y_RIB, 0.0]], profile=far)
    # towns, forests, falls on the ledges
    hi, lo, fo = [], [], []
    for k, (a, b, z) in enumerate(LEDGES):
        depth = a - b
        x = -L_det + rng.uniform(0, 300)
        while x < L_det - 200:
            gap = rng.uniform(150, 700)
            yy = -(a - 10.0) + rng.uniform(0, max(1.0, depth - 80.0))   # footprint min-y within the ledge
            if abs(x) < 320 and k == FOCUS_LEDGE:
                x += 400
                continue
            if rng.random() < 0.85:
                if abs(x) < 2600 and abs(k - FOCUS_LEDGE) <= 2:
                    hi.append([x, yy, z, 0, rng.uniform(0.9, 1.3)])
                else:
                    lo.append([x, yy, z, 0, rng.uniform(1.0, 2.2)])
            else:
                fo.append([x, yy, z, 0, rng.uniform(1.0, 2.5)])
            x += 110 + gap
    s.scatter('town_hi', hi)
    s.scatter('town_lo', lo)
    s.scatter('forest', fo)
    for q in range(26):
        k = rng.randrange(len(LEDGES) - 1)
        a, b, z = LEDGES[k + 1]
        x = rng.uniform(-L_det, L_det)
        if abs(x) < 600:
            continue
        s.add('cblock', x, -(LEDGES[k][1]) - 4, LEDGES[k][2], 14, 5, HR, mat='waterfall', v=0, top=0)

    # ---------------- ring D/E: plains, villages, forests, cities, lakes; the other ribs
    s.add('cblock', -600000, -600000, -6, 1200000, 1200000, 4, mat='sea', v=0, top=0)
    HUB = (-250000.0, 0.0)
    land = []
    for i in range(72):
        a = 2 * math.pi * i / 72
        r = 520000.0 * (1 + 0.08 * math.sin(5 * a) + 0.05 * math.sin(11 * a + 1.0))
        land.append([HUB[0] + r * math.cos(a), HUB[1] + r * math.sin(a)])
    s.add('megaprism', 0, 0, 0, 1, 1, 1, mat='plain', outline=land, z0=-3.0, z1=0.0)
    vil, fpatch, cities = [], [], []
    for q in range(900):
        r = 1500 * (1.0 + rng.random() * 60)
        a = rng.uniform(0, 2 * math.pi)
        x, y = r * math.cos(a), r * math.sin(a)
        if Y_RIB - PROF[1][0] - 200 < y < Y_RIB - PROF[0][0] + 200:
            continue   # under the rib
        if r < 12000 or rng.random() < 0.5:
            vil.append([round(x / 600) * 600, round(y / 600) * 600, 0, 0, 1.0])
        elif rng.random() < 0.3:
            fpatch.append([x, y, 0, rng.uniform(0, 360), rng.uniform(3, 7)])
    s.scatter('lowcity', list({(p[0], p[1]): p for p in vil}.values()))
    s.scatter('forest', fpatch)
    # radial ribs from the hub (48 spokes), ours is the spoke through F at angle 0
    for i in range(48):
        ang = 2 * math.pi * i / 48
        if i == 0:
            continue
        r0, r1 = 85000.0, rng.uniform(380000.0, 470000.0)
        p0 = (HUB[0] + r0 * math.cos(ang), HUB[1] + r0 * math.sin(ang), 0.0)
        p1 = (HUB[0] + r1 * math.cos(ang), HUB[1] + r1 * math.sin(ang), 0.0)
        sc = rng.uniform(0.8, 1.15)
        prof = [(x * sc, z * sc) for (x, z) in ENVELOPE]
        s.add('megasweep', 0, 0, 0, 1, 1, 1, mat='mega_far', path=[list(p0), list(p1)], profile=prof)
    # cities between the spokes (and near the focus, on the plains)
    for q in range(420):
        ang = rng.uniform(0, 2 * math.pi)
        rr = rng.uniform(95000, 470000)
        k = round(ang / (2 * math.pi / 48))
        if abs(ang - k * 2 * math.pi / 48) * rr < 9000:
            continue
        cities.append([HUB[0] + rr * math.cos(ang), HUB[1] + rr * math.sin(ang), 0, rng.uniform(0, 90), rng.uniform(0.6, 2.2)])
    s.scatter('city', cities)
    # lakes
    for q in range(60):
        ang, rr = rng.uniform(0, 2 * math.pi), rng.uniform(100000, 500000)
        cx, cy = HUB[0] + rr * math.cos(ang), HUB[1] + rr * math.sin(ang)
        if abs(cy) < 12000 and cx > -40000:
            continue
        w = rng.uniform(4000, 18000)
        s.add('cblock', cx, cy, 0.05, w, w * rng.uniform(0.4, 0.9), 0.4, mat='lake', v=w * 0.2, top=0)
    # ---------------- ring F: the Hub (a ring of 32 mega-blocks around a crater), clouds
    for i in range(32):
        a0, a1 = 2 * math.pi * i / 32, 2 * math.pi * (i + 1) / 32
        ri, ro = 45000.0, 85000.0
        ol = [[HUB[0] + ri * math.cos(a0), HUB[1] + ri * math.sin(a0)], [HUB[0] + ro * math.cos(a0), HUB[1] + ro * math.sin(a0)],
              [HUB[0] + ro * math.cos(a1), HUB[1] + ro * math.sin(a1)], [HUB[0] + ri * math.cos(a1), HUB[1] + ri * math.sin(a1)]]
        s.add('megaprism', 0, 0, 0, 1, 1, 1, mat='mega_far', outline=ol, z0=0.0, z1=rng.uniform(7000, 9500), inset=2500.0)
    s.add('cblock', HUB[0] - 45000, HUB[1] - 45000, 0.2, 90000, 90000, 0.5, mat='lake', v=30000, top=0)
    # cloud layers: a mid layer over the ribs (never over the focus corridor), a high layer at continental scale
    # a low layer below the crest: a mid-height cue at the 10 km scale (kept 2.6 km from the focus)
    s.add('clouds', -9000, -6000, 950, 18000, 14000, 350, n=60, size=[350, 900], clump=5, avoid=[0.0, -1100.0, 2600.0])
    # clouds: never in the sight line to the focus (the camera looks north at 38 degrees)
    for (x0, y0, w, d, z, hh, n, sz) in ((-140000, 14000, 280000, 120000, 2600, 900, 110, [2500, 7000]),
                                         (-140000, -160000, 280000, 128000, 2600, 900, 90, [2500, 7000]),
                                         (-600000, -560000, 1100000, 1100000, 5500, 2500, 170, [18000, 60000])):
        s.add('clouds', x0, y0, z, w, d, hh, n=n, size=sz, clump=5, avoid=[0.0, -z / math.tan(math.radians(38.0)),
                                                                            32000.0 if z > 5000 else 11000.0])


s = Spec('p_world', style='scale', light='aerial', seed=77)
world(s)
sp = s.write()
S = [10.0, 100.0, 1000.0, 10000.0, 100000.0, 1000000.0]
LBL = ['10 m', '100 m', '1 km', '10 km', '100 km', '1000 km']
jobs = []
for i, sc in enumerate(S):
    fog = dict(h=[0.0, 0.0, 0.05, 0.15, 0.1, 0.12][i], gamma=1.4, d=[0.0, 0.05, 0.12, 0.25, 0.2, 0.25][i], z_lo=0.0,
               z_hi=[800, 800, 1800, 3000, 9000, 12000][i], d_start=0.0)
    tgt = [[0.0, 0.0, ROOF], [0.0, -22.0, ZL - 22.0], [0.0, 0.0, ZL], [0.0, 0.0, ZL], [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]][i]
    jobs.append(dict(spec=sp, out='out/powers/p%d_%s.png' % (i + 1, LBL[i].replace(' ', '')), light='powers', style='scale',
                     camera=dict(az=0.0, el=38.0, target=tgt, ortho_scale=sc * 1.0), fog=fog, name='p%d' % (i + 1),
                     max_lights=80, samples=40, clip=[0.05, 3.0e6]))
write_jobs('powers', jobs)
