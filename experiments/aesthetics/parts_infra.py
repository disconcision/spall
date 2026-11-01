"""
parts_infra.py - infrastructure swept along paths (Blender side).  All paths are params.path = [[x,y,z],...] in
the part's local metres.

  highway     box-girder deck, jersey barriers, lane markings, cars with head/tail lights, hammerhead piers
  conveyor    belt on stringers, A-frame legs, crates / ore / pods; optional covered gallery
  ptube       pneumatic-tube bundle (glass tubes with capsules), bracket rings, end hubs
  slide       water slide: open trough with water or closed tube, on posts
  cabletree   cable trunk that splits into branches (each cable continuous through the splits), clamps, casings
  piperack    colour-coded pipe bundle on portal frames, filleted elbows, flanges
  hub         junction node (box or drum) where tubes / cables / pipes land
"""
import math
import random

import paths as PT
import prims

KIT = None


def _P(P):
    return [tuple(p) for p in P.g('path')]


def _ground(P):
    return P.g('ground', 0.0)


# ------------------------------------------------------------------------------------------------ highway
def b_highway(P):
    """params: path, lanes (per direction), dirs (1|2), lane_w, t (deck depth), piers (spacing m, 0 = none),
    pier_mat, deck_mat, cars (per 100 m per lane), fillet (m), markings, lit (car lights on)."""
    raw = _P(P)
    f = P.g('fillet', 0.0)
    pts = PT.resample(PT.fillet(raw, f, 10) if f else raw, P.g('step', 2.0))
    lanes, dirs, lw = P.g('lanes', 2), P.g('dirs', 2), P.g('lane_w', 3.6)
    W = lanes * dirs * lw + 2.4 + (1.2 if dirs == 2 else 0.0)
    t = P.g('t', 2.0)
    dm = P.mat or 'bconc_light'
    prof = [(-W / 2, -0.45), (-W * 0.3, -t), (W * 0.3, -t), (W / 2, -0.45), (W / 2, 0.0), (-W / 2, 0.0)]
    prims.sweep(P, dm, pts, prof, mode='up')
    prims.sweep(P, P.g('surface', 'asphalt2'), pts, prims.rect_prof(W - 0.9, 0.06, 0.0, center=False, bottom=0.0), mode='up')
    jersey = [(-0.3, 0.0), (0.3, 0.0), (0.25, 0.28), (0.09, 0.85), (-0.09, 0.85), (-0.25, 0.28)]
    for s in (-1, 1):
        e = PT.offset_path(pts, s * (W / 2 - 0.3), 0.0, mode='up')
        prims.sweep(P, P.g('barrier_mat', 'barrier'), e, jersey, mode='up')
    if dirs == 2:
        prims.sweep(P, P.g('barrier_mat', 'barrier'), pts, jersey, mode='up')
    F = PT.frames(pts, 'up')
    L = PT.polylen(pts)
    if P.g('markings', True):
        offs = []
        for d in range(dirs):
            sg = 1 if d == 0 else -1
            for k in range(1, lanes):
                offs.append(sg * ((0.6 if dirs == 2 else 0.0) + k * lw) - (0.0 if dirs == 2 else lanes * lw / 2))
        s = 2.0
        while s < L - 3.0:
            p, tg = PT.point_at(pts, s)
            side = PT.norm(PT.cross(tg, (0, 0, 1)))
            for o in offs:
                c = PT.add(p, PT.mul(side, o))
                P.obox('lane_white', (c[0], c[1], c[2] + 0.08), tg, side, (0, 0, 1), 1.5, 0.08, 0.02)
            s += 9.0
    dens = P.g('cars', 3.0)
    rng = P.rng
    ncar = int(L / 100.0 * dens * lanes * dirs)
    for q in range(ncar):
        s = rng.uniform(4.0, L - 4.0)
        p, tg = PT.point_at(pts, s)
        side = PT.norm(PT.cross(tg, (0, 0, 1)))
        d = rng.randrange(dirs)
        k = rng.randrange(lanes)
        sg = 1 if d == 0 else -1
        off = (sg * ((0.6 if dirs == 2 else 0.0) + (k + 0.5) * lw)) if dirs == 2 else (k + 0.5) * lw - lanes * lw / 2
        c = PT.add(p, PT.mul(side, off))
        fwd = tg if (dirs == 1 or sg < 0) else PT.mul(tg, -1.0)
        if dirs == 2 and sg > 0:
            fwd = PT.mul(tg, -1.0)
        big = rng.random() < 0.15
        ln, wd, ht = (9.0, 2.5, 3.2) if big else (4.4, 1.9, 1.3)
        body = rng.choice(('car_a', 'car_b', 'car_c', 'car_d', 'car_a')) if not big else rng.choice(('white_paint', 'blue_paint', 'orange_paint'))
        up = (0, 0, 1)
        sd = PT.norm(PT.cross(up, fwd))
        P.obox(body, (c[0], c[1], c[2] + 0.1 + ht / 2), fwd, sd, up, ln / 2, wd / 2, ht / 2)
        if not big:
            P.obox('glass', (c[0] - fwd[0] * 0.3, c[1] - fwd[1] * 0.3, c[2] + 0.1 + ht + 0.3), fwd, sd, up, ln * 0.28, wd * 0.45, 0.32)
        if P.g('lit', True):
            h0 = PT.add(c, PT.mul(fwd, ln / 2 + 0.02))
            t0 = PT.add(c, PT.mul(fwd, -ln / 2 - 0.02))
            P.obox('headlight', (h0[0], h0[1], c[2] + 0.7), fwd, sd, up, 0.05, wd * 0.45, 0.12)
            P.obox('taillight', (t0[0], t0[1], c[2] + 0.7), fwd, sd, up, 0.05, wd * 0.45, 0.12)
    ps = P.g('piers', 30.0)
    if ps:
        g = _ground(P)
        s = P.g('pier0', ps / 2)
        while s < L:
            p, tg = PT.point_at(pts, s)
            side = PT.norm(PT.cross(tg, (0, 0, 1)))
            zc = p[2] - t - 0.2
            if zc - g > 3.0:
                pm = P.g('pier_mat', dm)
                ch = min(2.6, (zc - g) * 0.25)
                P.obox(pm, (p[0], p[1], zc - ch / 2), side, tg, (0, 0, 1), W * 0.36, 1.3, ch / 2)
                prims.leg(P, pm, (p[0], p[1], g), (p[0], p[1], zc - ch + 0.1), P.g('pier_r', 1.4), P.g('pier_r', 1.4) * 0.92, n=8)
            s += ps


# ------------------------------------------------------------------------------------------------ conveyor
def b_conveyor(P):
    """params: path, w (belt), cargo crates|ore|pods|none, spacing (m), legs (spacing m), cover (bool), fillet."""
    raw = _P(P)
    f = P.g('fillet', 0.0)
    pts = PT.resample(PT.fillet(raw, f, 8) if f else raw, P.g('step', 1.0))
    w = P.g('w', 1.4)
    fm = P.g('frame_mat', 'yellow_paint')
    prims.sweep(P, 'belt', pts, prims.rect_prof(w, 0.18, 0.0, center=False, bottom=-0.18), mode='up')
    for s in (-1, 1):
        e = PT.offset_path(pts, s * (w / 2 + 0.12), 0.0, mode='up')
        prims.sweep(P, fm, e, prims.rect_prof(0.16, 0.55, 0.0, center=False, bottom=-0.45), mode='up')
    L = PT.polylen(pts)
    g = _ground(P)
    ls = P.g('legs', 5.0)
    if ls:
        s = ls / 2
        while s < L:
            p, tg = PT.point_at(pts, s)
            side = PT.norm(PT.cross(tg, (0, 0, 1)))
            if p[2] - g > 1.0:
                for sg in (-1, 1):
                    a = PT.add(p, PT.mul(side, sg * (w / 2 + 0.12)))
                    b = PT.add(p, PT.mul(side, sg * (w / 2 + 0.8)))
                    P.cyl(fm, (a[0], a[1], a[2] - 0.45), (b[0], b[1], g), 0.08, n=4)
            s += ls
    cargo = P.g('cargo', 'crates')
    sp = P.g('spacing', 2.6)
    rng = P.rng
    s = rng.uniform(0.5, sp)
    while s < L - 1.0 and cargo != 'none':
        p, tg = PT.point_at(pts, s)
        side = PT.norm(PT.cross(tg, (0, 0, 1)))
        up = PT.norm(PT.cross(side, tg))
        if cargo == 'crates':
            sz = rng.uniform(0.5, 0.75) * w
            c = PT.add(p, PT.mul(up, sz / 2 + 0.01))
            P.obox(rng.choice(P.g('crate_mats', ['crate_a', 'crate_b', 'crate_c', 'crate_a'])), c, tg, side, up, sz / 2 * 1.2, sz / 2, sz / 2)
        elif cargo == 'ore':
            c = PT.add(p, PT.mul(up, 0.15))
            P.ico(P.g('ore_mat', 'ore'), c, w * 0.38, rng, 0.3, sz=0.45)
        elif cargo == 'pods':
            c = PT.add(p, PT.mul(up, w * 0.45))
            P.obox(rng.choice(('capsule_white', 'pod_teal', 'pod_amber')), c, tg, side, up, w * 0.7, w * 0.42, w * 0.42)
        s += sp * rng.uniform(0.7, 1.3)
    if P.g('cover'):
        prims.sweep(P, P.g('cover_mat', 'galv'), pts, prims.rect_prof(w + 1.6, 2.6, 0.25, center=False, bottom=-0.9), mode='up')
        for s2 in (-1, 1):
            e = PT.offset_path(pts, s2 * ((w + 1.6) / 2 + 0.02), 0.8, mode='up')
            prims.sweep(P, P.g('band_mat', 'win_a'), e, prims.rect_prof(0.06, 0.45), mode='up')


# ------------------------------------------------------------------------------------------------ pneumatic tubes
def b_ptube(P):
    """params: path, n tubes, r (m), gap, arrangement row|stack|bundle, pods (per 10 m), pod_mats, glass, fillet, rings."""
    raw = _P(P)
    f = P.g('fillet', 3.0)
    pts = PT.resample(PT.fillet(raw, f, 10) if f else raw, 0.8)
    n = P.g('n', 3)
    r = P.g('r', 0.55)
    gap = P.g('gap', 0.25)
    arr = P.g('arrangement', 'row')
    if arr == 'bundle':
        offs = PT.hexpack(n, r + gap / 2)
    elif arr == 'stack':
        offs = [(0.0, (k - (n - 1) / 2) * (2 * r + gap)) for k in range(n)]
    else:
        offs = [((k - (n - 1) / 2) * (2 * r + gap), 0.0) for k in range(n)]
    rng = P.rng
    pm = P.g('pod_mats', ['pod_red', 'pod_teal', 'pod_amber', 'pod_white'])
    for k, (du, dv) in enumerate(offs):
        tp = PT.offset_path(pts, du, dv, mode='up')
        prims.sweep(P, P.g('glass', 'tube_glass'), tp, prims.circle(r, 12), mode='pt')
        L = PT.polylen(tp)
        npod = int(L / 10.0 * P.g('pods', 1.2))
        mat = pm[k % len(pm)]
        for q in range(npod):
            s = rng.uniform(1.0, L - 1.0)
            p, tg = PT.point_at(tp, s)
            a = PT.sub(p, PT.mul(tg, 0.8)); b = PT.add(p, PT.mul(tg, 0.8))
            P.cyl(mat, a, b, r * 0.72, n=10)
            P.cyl(mat, b, PT.add(b, PT.mul(tg, 0.25)), r * 0.72, n=10, r1=r * 0.4)
            P.cyl(mat, a, PT.sub(a, PT.mul(tg, 0.25)), r * 0.72, n=10, r1=r * 0.4)
    # bracket rings around the whole bundle
    L = PT.polylen(pts)
    rs = P.g('rings', 8.0)
    ext = max(math.hypot(a, b) for a, b in offs) + r + 0.15
    s = rs / 2
    while s < L:
        p, tg = PT.point_at(pts, s)
        if arr == 'row':
            side = PT.norm(PT.cross(tg, (0, 0, 1))) if abs(tg[2]) < 0.95 else (1, 0, 0)
            up = PT.norm(PT.cross(side, tg))
            P.obox(P.g('frame_mat', 'tube_frame'), p, tg, side, up, 0.12, ext, r + 0.12)
        else:
            P.cyl(P.g('frame_mat', 'tube_frame'), PT.sub(p, PT.mul(tg, 0.08)), PT.add(p, PT.mul(tg, 0.08)), ext * 0.92, n=12)
        s += rs
    for end in P.g('hubs', []):
        p = pts[0] if end == 0 else pts[-1]
        s = ext * 1.6
        P.box(P.g('hub_mat', 'tube_frame'), p[0] - s, p[1] - s, p[2] - s, p[0] + s, p[1] + s, p[2] + s)


# ------------------------------------------------------------------------------------------------ water slide
def b_slide(P):
    """params: path, kind trough|tube, w, mat, posts (spacing m), post_mat, water (bool), fillet."""
    raw = _P(P)
    f = P.g('fillet', 0.0)
    pts = PT.resample(PT.fillet(raw, f, 10) if f else raw, 0.6)
    w = P.g('w', 1.5)
    m = P.mat or 'slide_teal'
    if P.g('kind', 'trough') == 'trough':
        prims.sweep(P, m, pts, prims.trough_prof(w, w * 0.45, 0.14, 10), mode='up', caps=True)
        if P.g('water', True):
            wp = PT.offset_path(pts, 0.0, -w * 0.33, mode='up')
            prims.sweep(P, 'slide_water', wp, prims.rect_prof(w * 0.5, 0.06), mode='up')
    else:
        prims.sweep(P, m, pts, prims.circle(w / 2, 14), mode='up')
        # translucent stripe rings
        L = PT.polylen(pts)
        s = 1.0
        while s < L:
            p, tg = PT.point_at(pts, s)
            P.cyl(P.g('ring_mat', 'slide_white'), PT.sub(p, PT.mul(tg, 0.2)), PT.add(p, PT.mul(tg, 0.2)), w / 2 + 0.05, n=14)
            s += P.g('ring_every', 3.0)
    ps = P.g('posts', 5.0)
    if ps:
        L = PT.polylen(pts)
        g = _ground(P)
        s = ps / 2
        while s < L:
            p, tg = PT.point_at(pts, s)
            if p[2] - g > 1.2 and not P.g('no_posts_above') or (P.g('no_posts_above') and p[2] < P.g('no_posts_above')):
                if p[2] - g > 1.2:
                    P.cyl(P.g('post_mat', 'white_paint'), (p[0], p[1], g), (p[0], p[1], p[2] - w * 0.45), 0.16, n=6)
            s += ps


# ------------------------------------------------------------------------------------------------ cable trunks
def _cable_mats(P, n, rng):
    mats = P.g('mats', None)
    if mats:
        return [rng.choice(mats) for _ in range(n)]
    pal = ['cable_black'] * 7 + ['cable_grey'] * 3 + ['cable_red', 'cable_blue', 'cable_yellow', 'cable_green', 'cable_orange']
    return [rng.choice(pal) for _ in range(n)]


def b_cabletree(P):
    """params: tree = {path, n, children:[...], casing:[s0,s1] (fraction range in a conduit)}, r (cable radius),
    clamps (spacing m), clamp_mat, casing_mat."""
    tree = P.g('tree')
    r = P.g('r', 0.16)
    rng = P.rng
    pitch = r * 2.15
    cables = {}   # id -> list of points

    def node_frames(pts):
        return PT.frames(pts, 'pt')

    def walk(node, ids, entry_slots=None):
        pts = PT.resample(PT.fillet([tuple(p) for p in node['path']], node.get('fillet', 4.0), 8), P.g('step', 1.2))
        slots = PT.hexpack(len(ids), pitch / 2)
        F = node_frames(pts)
        # order the ids so each keeps close to its entry offset (slot matching by angle)
        if entry_slots:
            ids = sorted(ids, key=lambda i: math.atan2(entry_slots[i][1], entry_slots[i][0]))
            order = sorted(range(len(slots)), key=lambda k: math.atan2(slots[k][1], slots[k][0]))
            slot_of = {ids[j]: slots[order[j]] for j in range(len(ids))}
        else:
            slot_of = {i: slots[j] for j, i in enumerate(ids)}
        for i in ids:
            du, dv = slot_of[i]
            seq = [PT.add(PT.add(p, PT.mul(f[1], du)), PT.mul(f[2], dv)) for p, f in zip(pts, F)]
            if i in cables:
                cables[i].extend(seq[2:] if len(seq) > 3 else seq[1:])
            else:
                cables[i] = seq
        # clamps
        cs = P.g('clamps', 6.0)
        R = max(math.hypot(*slot_of[i]) for i in ids) + r + 0.08
        L = PT.polylen(pts)
        cas = node.get('casing')
        s = cs * 0.5
        while s < L:
            p, tg = PT.point_at(pts, s)
            if not (cas and cas[0] * L <= s <= cas[1] * L):
                cl = r * 0.5
                P.cyl(P.g('clamp_mat', 'steel_dark'), PT.sub(p, PT.mul(tg, cl)), PT.add(p, PT.mul(tg, cl)), R * 0.98, n=12)
            s += cs
        if cas:
            a, b = cas
            sub = [p for k, p in enumerate(pts) if a * (len(pts) - 1) <= k <= b * (len(pts) - 1)]
            if len(sub) > 1:
                prims.sweep(P, P.g('casing_mat', 'galv'), sub, prims.circle(R + 0.35, 16), mode='pt')
                sl = PT.polylen(sub)
                q = 1.5
                while q < sl:
                    p, tg = PT.point_at(sub, q)
                    P.cyl(P.g('casing_rib', 'steel_dark'), PT.sub(p, PT.mul(tg, 0.2)), PT.add(p, PT.mul(tg, 0.2)), R + 0.55, n=16)
                    q += 3.0
        kids = node.get('children', [])
        if not kids:
            return
        end_f = F[-1]
        # sort child sectors by the angle of their initial direction in the end frame
        angs = []
        for c in kids:
            cp = c['path']
            d = PT.norm(PT.sub(tuple(cp[min(2, len(cp) - 1)]), tuple(cp[0])))
            angs.append(math.atan2(PT.dot(d, end_f[2]), PT.dot(d, end_f[1])))
        order = sorted(range(len(kids)), key=lambda k: angs[k])
        byang = sorted(ids, key=lambda i: math.atan2(slot_of[i][1], slot_of[i][0]))
        # rotate the ring so the first child's sector is centred on its direction
        start = 0
        a0 = angs[order[0]]
        best = min(range(len(byang)), key=lambda j: abs(((math.atan2(slot_of[byang[j]][1], slot_of[byang[j]][0]) - a0) + math.pi) % (2 * math.pi) - math.pi))
        byang = byang[best:] + byang[:best]
        pos = 0
        for k in order:
            c = kids[k]
            cnt = min(c['n'], len(byang) - pos)
            walk(c, byang[pos:pos + cnt], {i: slot_of[i] for i in byang[pos:pos + cnt]})
            pos += cnt
    ids = list(range(tree['n']))
    walk(tree, ids)
    mats = _cable_mats(P, tree['n'], rng)
    for i, pts in cables.items():
        sm = PT.catmull(pts, step=P.g('cstep', 0.9))
        prims.sweep(P, mats[i], sm, prims.circle(r * rng.uniform(0.85, 1.1), 6), mode='pt')


# ------------------------------------------------------------------------------------------------ pipe racks
def b_piperack(P):
    """params: path, pipes [[r, mat], ...] (or n), gap, fillet (elbow radius), racks (spacing m), rack_mat, tiers (1|2),
    flanges (spacing m), posts (bool: portal legs down to ground)."""
    raw = _P(P)
    pipes = P.g('pipes')
    rng = P.rng
    if not pipes:
        pal = ['pipe_yellow', 'pipe_blue', 'pipe_green', 'pipe_red', 'pipe_grey', 'pipe_white', 'insul']
        pipes = [[rng.choice((0.35, 0.5, 0.7, 0.9)), rng.choice(pal)] for _ in range(P.g('n', 5))]
    gap = P.g('gap', 0.25)
    tiers = P.g('tiers', 1)
    per = int(math.ceil(len(pipes) / tiers))
    f = P.g('fillet', 4.0)
    base = PT.fillet(raw, f, 10) if f else raw
    base = PT.resample(base, P.g('step', 0.8))
    width = 0.0
    offs = []
    for t in range(tiers):
        row = pipes[t * per:(t + 1) * per]
        W = sum(2 * p[0] for p in row) + gap * (len(row) - 1)
        width = max(width, W)
        x = -W / 2
        for p in row:
            offs.append((x + p[0], t * 2.2 + p[0], p))
            x += 2 * p[0] + gap
    for du, dv, (r, m) in offs:
        pp = PT.offset_path(base, du, dv, mode='up')
        prims.sweep(P, m, pp, prims.circle(r, 10), mode='up')
        fl = P.g('flanges', 12.0)
        if fl:
            L = PT.polylen(pp)
            s = fl / 2
            while s < L:
                p, tg = PT.point_at(pp, s)
                P.cyl('steel_dark', PT.sub(p, PT.mul(tg, 0.12)), PT.add(p, PT.mul(tg, 0.12)), r * 1.22, n=10)
                s += fl
    rs = P.g('racks', 6.0)
    if rs:
        L = PT.polylen(base)
        g = _ground(P)
        rm = P.g('rack_mat', 'steel')
        s = rs / 2
        while s < L:
            p, tg = PT.point_at(base, s)
            if abs(tg[2]) > 0.5:
                s += rs
                continue
            side = PT.norm(PT.cross(tg, (0, 0, 1)))
            for t in range(tiers):
                zb = p[2] + t * 2.2 - 0.12
                P.obox(rm, (p[0], p[1], zb), side, tg, (0, 0, 1), width / 2 + 0.5, 0.15, 0.12)
            if P.g('posts', True) and p[2] - g > 1.0:
                for sg in (-1, 1):
                    q = PT.add(p, PT.mul(side, sg * (width / 2 + 0.4)))
                    P.box(rm, q[0] - 0.14, q[1] - 0.14, g, q[0] + 0.14, q[1] + 0.14, p[2] + (tiers - 1) * 2.2)
            s += rs


def b_hub(P):
    """Junction node: drum or chamfered box at the footprint.  params: kind drum|box, mat, band (accent material)."""
    lx, ly, lz = P.lx, P.ly, P.lz
    m = P.mat or 'galv'
    if P.g('kind', 'box') == 'drum':
        P.cyl(m, (lx / 2, ly / 2, 0), (lx / 2, ly / 2, lz), min(lx, ly) / 2, n=20)
        P.cyl(P.g('band', 'hazard'), (lx / 2, ly / 2, lz * 0.45), (lx / 2, ly / 2, lz * 0.55), min(lx, ly) / 2 + 0.05, n=20)
    else:
        prims.cbox(P, m, 0, 0, 0, lx, ly, lz, v=min(lx, ly) * 0.15, top=min(lx, ly) * 0.1)
        P.raw_box(P.g('band', 'hazard'), -0.05, -0.05, lz * 0.45, lx + 0.05, ly + 0.05, lz * 0.55)


BUILDERS = {'highway': b_highway, 'conveyor': b_conveyor, 'ptube': b_ptube, 'slide': b_slide, 'cabletree': b_cabletree,
            'piperack': b_piperack, 'hub': b_hub}


def register(kit):
    global KIT
    KIT = kit
