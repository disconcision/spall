"""
kitx_parts.py - extension part builders for the agent-buildings experiment (Blender side).

Registered into the unmodified kit.py at runtime by kitx.py (kit.BUILDERS / kit.MATS are extended in memory).
The agent-facing vocabulary for these parts lives in kitx_schema.py so the validator and renderer agree.
Each extension was added only after a brief was blocked by the stock kit (see log/iterations.jsonl).

Design rule for every builder here: "sprite-safe" - no feature thinner than ~0.23 m (1.3 px at 32 px/tile), no
transparent materials on the parts that carry identity, so the look survives the aliased 32 px render and the
nearest-colour kit64 palette lock.
"""
import math

KIT = None   # the kit module, set by register()


def C(h):
    """hex -> linear rgb (same as kit.C)"""
    h = h.lstrip('#')
    s = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(((c / 12.92) if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in s)


def b_growpod(P):
    """Plug-in hydroponic pod: opaque shell; its grow-windows are horizontal stripes of rack shelf / crop / emissive
    grow-light on the long faces (sprite-safe, no transparency).  params: tiers (2), sides ('sn'), glow ('growlight'),
    mullion (1.6 m panel spacing), crop (material), ends ('hatch' | 'window' | 'none')."""
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'capsule_white'
    t = 0.3
    P.box(m, 0, 0, 0, lx, ly, t)                      # floor
    P.box(m, 0, 0, lz - t, lx, ly, lz)                # roof
    P.box(m, 0, 0, t, t, ly, lz - t)                  # end walls
    P.box(m, lx - t, 0, t, lx, ly, lz - t)
    P.box('steel_dark', t, t, t, lx - t, ly - t, lz - t)   # interior mass (reads dark in cutaways)
    tiers = max(1, int(P.g('tiers', 2)))
    glow = P.g('glow', 'growlight_px')
    crop = P.g('crop')
    sides = P.g('sides', 'sn')
    hz = (lz - 2 * t) / tiers

    def stripe(face, a0, a1, z0, z1, mat, o=0.04):
        if face == 's':
            P.box(mat, a0, -o, z0, a1, 0.02, z1)
        elif face == 'n':
            P.box(mat, a0, ly - 0.02, z0, a1, ly + o, z1)
        elif face == 'w':
            P.box(mat, -o, a0, z0, 0.02, a1, z1)
        else:
            P.box(mat, lx - 0.02, a0, z0, lx + o, a1, z1)
    for face in sides:
        L = lx if face in 'sn' else ly
        a0, a1 = t, L - t
        for k in range(tiers):
            z = t + k * hz
            cm = crop or P.rng.choice(('crop', 'crop2', 'foliage2'))
            stripe(face, a0, a1, z, z + 0.2 * hz, 'steel_dark')                 # rack shelf
            stripe(face, a0, a1, z + 0.2 * hz, z + 0.58 * hz, cm)              # crop band
            stripe(face, a0, a1, z + 0.58 * hz, z + hz, glow)                  # grow-light band
        mu = P.g('mullion', 1.6)
        if mu:
            n = max(1, int(round((a1 - a0) / mu)))
            for i in range(1, n):
                c = a0 + (a1 - a0) * i / n
                stripe(face, c - 0.12, c + 0.12, t, lz - t, m, o=0.07)
    ends = P.g('ends', 'hatch')
    for face in 'we':
        if face in sides:
            continue
        L = ly
        if ends == 'hatch':           # service hatch + vent grille on the end walls
            stripe(face, L * 0.2, L * 0.5, t + 0.1, lz - t - 0.3, 'steel_light', o=0.06)
            for k in range(3):
                z = t + 0.4 + k * 0.5
                stripe(face, L * 0.6, L * 0.85, z, z + 0.25, 'steel_dark', o=0.06)
        elif ends == 'window':
            stripe(face, L * 0.25, L * 0.75, lz * 0.35, lz * 0.75, glow, o=0.06)


LANTERN_MATS = {'red': 'lantern_red', 'orange': 'lantern_orange', 'yellow': 'lantern_yellow', 'white': 'lantern_white',
                'pink': 'lantern_pink', 'green': 'lantern_green'}


def b_lantern(P):
    """String of paper lanterns hung from a sagging cable along local x at height lz (anchored at x=0 and x=lx).
    params: n (lanterns; default one per 1.4 m), colors (list of red/orange/yellow/white/pink/green), size (0.5 m),
    sag (0.45 m), posts (false: anchor on neighbours; true: timber posts at both ends), light (true)."""
    lx, ly, lz = P.lx, P.ly, P.lz
    n = int(P.g('n', max(1, int(lx / 1.4))))
    cols = P.g('colors', ['red', 'orange', 'red', 'yellow'])
    size = P.g('size', 0.5)
    sag = P.g('sag', 0.45)
    yc = ly / 2

    def zc(x):                       # parabolic sag between the anchors
        u = x / lx if lx > 0 else 0.5
        return lz - 4 * sag * u * (1 - u)
    if P.g('posts', False):
        for x in (0.0, lx):
            P.box('timber_dark', x - 0.11, yc - 0.11, 0, x + 0.11, yc + 0.11, lz + 0.15)
    segs = 8
    for k in range(segs):
        x0, x1 = lx * k / segs, lx * (k + 1) / segs
        P.strut('steel_dark', (x0, yc, zc(x0)), (x1, yc, zc(x1)), 0.035)
    for i in range(n):
        x = lx * (i + 0.5) / n
        z = zc(x) - 0.1
        mat = LANTERN_MATS.get(cols[i % len(cols)], cols[i % len(cols)])
        h = size * 1.15
        P.box('steel_dark', x - 0.02, yc - 0.02, z - 0.02, x + 0.02, yc + 0.02, z + 0.1)          # hanger
        P.cyl('steel_dark', (x, yc, z - 0.06), (x, yc, z), size * 0.3, n=8)                      # cap
        P.cyl(mat, (x, yc, z - 0.06 - h), (x, yc, z - 0.06), size / 2, n=10)                     # paper body
        P.cyl('steel_dark', (x, yc, z - 0.12 - h), (x, yc, z - 0.06 - h), size * 0.3, n=8)       # base ring
        if P.g('light', True) and i % 2 == 0:
            P.light((x, yc, z - 0.06 - h / 2), (1.0, 0.55, 0.3), 40, 0.25)


def b_vines(P):
    """Curtain of vine strands rooted along the local z=0 plane and growing to local +z with controllable lengths:
    orient 'up' = climbing vines, '-z' = trailing vines hanging from a ledge soffit, '+x'.. = sideways.
    params: density (strands per metre of lx, 1.4), lmin / lmax (m; default 0.35*lz .. lz), width (0.28 m),
    leaves (leaf clumps per strand, 1.5 average), mats (foliage materials)."""
    lx, ly, lz = P.lx, P.ly, P.lz
    rng = P.rng
    n = max(1, int(lx * P.g('density', 1.4)))
    lmax = min(lz, P.g('lmax', lz))
    lmin = min(lmax, P.g('lmin', 0.35 * lz))
    w = P.g('width', 0.28)
    mats = P.g('mats', ['foliage', 'foliage2', 'foliage3', 'foliage_lime'])
    leaves = P.g('leaves', 1.5)
    for i in range(n):
        x = (i + rng.uniform(0.15, 0.85)) * lx / n
        y = rng.uniform(0, max(0.0, ly - w))
        L = rng.uniform(lmin, lmax)
        m = rng.choice(mats)
        P.box(m, x - w / 2, y, 0.0, x + w / 2, y + w, L * 0.55)                 # thicker root half
        P.box(m, x - w * 0.4, y + w * 0.1, L * 0.55, x + w * 0.4, y + w * 0.9, L)  # thinner tip half
        k = int(leaves) + (1 if rng.random() < leaves - int(leaves) else 0)
        for _ in range(k):
            zc = rng.uniform(0.15, 0.95) * L
            P.ico(rng.choice(mats), (x + rng.uniform(-0.1, 0.1), y + w / 2, zc), rng.uniform(0.28, 0.45), rng, 0.25, sz=1.3)


NEW_BUILDERS = {'growpod': b_growpod, 'lantern': b_lantern, 'vines': b_vines}
NEW_MATS = {
    # saturated grow-light: the stock 'growlight' renders ~(238,209,230) under AgX and locks to white in kit64;
    # this one renders ~(228,171,206) at sprite exposure and locks cleanly to kit64 'f0a5d0' (calibrated, see log)
    'growlight_px': dict(base=C('c86aa8'), rough=0.5, emit=C('ff66cc'), estr='lamp', emult=0.5, var=0.0),
    # sprite-safe glass (pipeline extension): sprite jobs remap the dithered-alpha glass materials to these opaque ones
    # through a style_overrides remap, so glazing reads as flat tinted panes instead of kit64-locked noise
    'glass_px': dict(base=C('6f9cc9'), rough=0.12, spec=0.9, var=0.0),
    'glass_green_px': dict(base=C('a9c9b6'), rough=0.12, spec=0.9, var=0.0),
    # warm 'sun pipe' light core (solar chimney): lands on kit64 warm yellows instead of washing to white like 'lamp'
    'sunpipe_px': dict(base=C('fbd57a'), rough=0.4, emit=C('ffc24a'), estr='lamp', emult=0.5, var=0.0),
    # paper lanterns: own emission key 'lantern' (kit env default 1.0; a render may raise it, e.g. dusk 2.2) so
    # AgX does not bleach them at dusk the way the shared 'lamp' key (x5 at dusk) did
    'lantern_red': dict(base=C('c0302a'), rough=0.6, emit=C('ff3a28'), estr='lantern', emult=0.9, var=0.0),
    'lantern_orange': dict(base=C('d9702a'), rough=0.6, emit=C('ff8a2a'), estr='lantern', emult=0.9, var=0.0),
    'lantern_yellow': dict(base=C('e0b040'), rough=0.6, emit=C('ffcf5a'), estr='lantern', emult=0.8, var=0.0),
    'lantern_white': dict(base=C('e8e0cc'), rough=0.6, emit=C('fff0d0'), estr='lantern', emult=0.7, var=0.0),
    'lantern_pink': dict(base=C('c86aa8'), rough=0.6, emit=C('ff66cc'), estr='lantern', emult=0.9, var=0.0),
    'lantern_green': dict(base=C('3c8a5a'), rough=0.6, emit=C('5aff8c'), estr='lantern', emult=0.7, var=0.0),
}


def register(kit):
    global KIT
    KIT = kit
    for name, fn in NEW_BUILDERS.items():
        kit.BUILDERS[name] = fn
    for name, m in NEW_MATS.items():
        kit.MATS[name] = m
    kit.MASSING.update({'growpod'})
