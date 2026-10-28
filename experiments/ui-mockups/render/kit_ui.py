"""
kit_ui.py - render passes for the UI mock-ups, built on ../../concept-renders/kit.py (imported, never modified).

    Blender --background --factory-startup --python kit_ui.py -- --jobs jobs.json [--only name1,name2]

Additions (all patched in at runtime; the concept-renders folder is only read):
  * part tag 'ui:ghost'   -> the part is drawn with its real geometry in the blueprint-ghost material
                             (faces translucent + every edge as a thin emissive strut), never casts shadows
  * part tag 'ui:hide'    -> part skipped
  * view.ghost_tags       -> in 'ghost' mode, only parts carrying one of these tags get massing ghosts
  * view.ghost_zmax       -> in 'ghost' mode, massing ghosts stop at this level (e.g. "3 levels above")
  * job.objects           -> keep only these output objects (e.g. ['ghost'] for a ghost-only pass)
  * job.zmask             -> every material becomes flat emission: white where world z >= zmask (levels),
                             black below; used to composite a focus level over dimmed lower levels
  * job.camera_from       -> re-use the exact camera of an earlier pass (cam json written by this script)
  * part type 'drone'     -> hovering quad-rotor builder drone with an amber beacon
  * a camera json (right/up/fwd, cx/cy, ortho scale, resolution) is written next to every output, so
    overlays can project world points to pixels exactly:
        u = rx/2 + (p.right - cx) * rx/scale ;  v = ry/2 - (p.up - cy) * rx/scale
"""
import sys, os, json, math, time
sys.dont_write_bytecode = True          # do not leave __pycache__ inside concept-renders/
HERE = os.path.dirname(os.path.abspath(__file__))
KIT_DIR = os.path.normpath(os.path.join(HERE, '..', '..', 'concept-renders'))
sys.path.insert(0, KIT_DIR)
import kit                              # noqa: E402  (the original renderer)
import bpy                              # noqa: E402
from mathutils import Vector            # noqa: E402

_orig_build_scene = kit.build_scene
_orig_massing_ghost = kit.massing_ghost
_orig_matbuild = kit.MatFactory.build
CUR = {}                                # the job being rendered (read by the patches)


# ------------------------------------------------------------------------------------------ drone part
def b_drone(P):
    """Quad-rotor builder drone (~1.6 m across): body, arms, rotor discs, beacon, skids."""
    s = P.g('scale', 1.0)
    m = P.mat or 'builder'
    cx, cy, cz = P.lx / 2, P.ly / 2, P.g('hover', 0.0)
    b = 0.34 * s
    P.box(m, cx - b, cy - b, cz, cx + b, cy + b, cz + 0.32 * s)
    P.box('steel_dark', cx - b * 0.7, cy - b * 0.7, cz - 0.12 * s, cx + b * 0.7, cy + b * 0.7, cz)
    for dx, dy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        tip = (cx + dx * 0.78 * s, cy + dy * 0.78 * s, cz + 0.26 * s)
        P.strut('steel_dark', (cx, cy, cz + 0.2 * s), tip, 0.05 * s)
        P.cyl('steel_light', (tip[0], tip[1], tip[2] + 0.02 * s), (tip[0], tip[1], tip[2] + 0.06 * s), 0.42 * s, n=10)
    P.ico('beacon_amber', (cx, cy, cz + 0.42 * s), 0.1 * s)
    if P.g('lightpt', True):
        P.light((cx, cy, cz + 0.6 * s), (1.0, 0.55, 0.1), 25 * s, 0.1)
    if P.g('cargo'):
        P.box('panel', cx - 0.5 * s, cy - 0.35 * s, cz - 0.9 * s, cx + 0.5 * s, cy + 0.35 * s, cz - 0.2 * s)
        P.strut('steel_dark', (cx, cy, cz - 0.2 * s), (cx, cy, cz - 0.12 * s), 0.03 * s)


kit.BUILDERS['drone'] = b_drone


# ------------------------------------------------------------------------------------------ ghost helpers
def edge_struts(buf, mats, r=0.035, min_len=0.25):
    """Every distinct mesh edge of buf as a thin 4-sided strut (ghost_wire material)."""
    wi = mats.mid('ghost_wire')
    out = kit.Buf()
    seen = set()
    for f in buf.f:
        n = len(f)
        for k in range(n):
            a, b = f[k], f[(k + 1) % n]
            pa, pb = tuple(round(c, 3) for c in buf.v[a]), tuple(round(c, 3) for c in buf.v[b])
            key = (pa, pb) if pa <= pb else (pb, pa)
            if key in seen:
                continue
            seen.add(key)
            p0, p1 = Vector(pa), Vector(pb)
            d = p1 - p0
            if d.length < min_len:
                continue
            ax = d.normalized()
            t = Vector((0, 0, 1)) if abs(ax.z) < 0.9 else Vector((1, 0, 0))
            u = ax.cross(t).normalized() * r
            v = ax.cross(u).normalized() * r
            vb = len(out.v)
            for p in (p0, p1):
                out.v.extend([tuple(p - u - v), tuple(p + u - v), tuple(p + u + v), tuple(p - u + v)])
            for fc in ((0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (0, 3, 2, 1), (4, 5, 6, 7)):
                out.f.append(tuple(vb + i for i in fc)); out.m.append(wi)
    return out


def massing_ghost_ui(parts, zc, mats, clamp=None):
    view = (CUR.get('view') or {})
    tags = set(view.get('ghost_tags') or [])
    zmax = view.get('ghost_zmax')
    lh = CUR.get('_lh', 3.5)
    sel = []
    for P, bb in parts:
        if bb is None:
            continue
        if tags and not (tags & set(P.tags)):
            continue
        if zmax is not None:
            zm = zmax * lh
            if bb[2] >= zm - 0.05:
                continue
            bb = (bb[0], bb[1], bb[2], bb[3], bb[4], min(bb[5], zm))
        sel.append((P, bb))
    return _orig_massing_ghost(sel, zc, mats, clamp)


kit.massing_ghost = massing_ghost_ui


# ------------------------------------------------------------------------------------------ build_scene wrapper
def build_scene_ui(spec, job):
    grid = spec.get('meta', {}).get('grid', {'cell': 4.0, 'level': 3.5})
    CUR['_lh'] = grid['level']
    keep, ghosts, boxes = [], [], []
    for d in spec['parts']:
        tg = d.get('tags', [])
        if 'ui:hide' in tg:
            continue
        if 'ui:ghostbox' in tg:
            boxes.append(d)
        elif 'ui:ghost' in tg:
            ghosts.append(d)
        else:
            keep.append(d)
    spec2 = dict(spec); spec2['parts'] = keep
    out, mats, lights, all_bb, style, grid = _orig_build_scene(spec2, job)
    zmin = (job.get('view') or {}).get('zmin')
    if zmin is not None:            # bottom clip plane: a floating sectional chunk, capped with poche
        pm = mats.mid('poche')
        clipped = []
        for name, buf, flags in out:
            if flags.get('ghost') or not buf.v:
                clipped.append((name, buf, flags)); continue
            bm = kit.to_bmesh(buf)
            kit.clip_bm(bm, (0, 0, zmin * grid['level']), (0, 0, -1), pm)
            clipped.append((name, kit.bm_to_buf(bm), flags)); bm.free()
        out = clipped
        lights = [l for l in lights if l[0][2] >= zmin * grid['level']]
    if ghosts:
        gi = mats.mid('ghost')
        faces, wires = kit.Buf(), kit.Buf()
        seed = spec.get('meta', {}).get('seed', 0)
        for i, d in enumerate(ghosts):
            P = kit.Part(d, grid, 100000 + i, seed, mats, style)
            kit.BUILDERS[P.type](P)
            P.buf.m = [gi] * len(P.buf.m)
            faces.extend(P.buf)
            wires.extend(edge_struts(P.buf, mats, r=d.get('params', {}).get('ghost_r', 0.035)))
        out.append(('uighost', faces, {'ghost': True}))
        out.append(('uighost_wire', wires, {'noshadow': True}))
    if boxes:
        seed = spec.get('meta', {}).get('seed', 0)
        pb = []
        for i, d in enumerate(boxes):
            P = kit.Part(d, grid, 200000 + i, seed, mats, style)
            kit.BUILDERS[P.type](P)
            pb.append((P, P.buf.aabb()))
        g = _orig_massing_ghost(pb, -1e9, mats, None)
        out.append(('uighostbox', g, {'ghost': True}))
    objs = job.get('objects')
    if objs:
        out = [o for o in out if o[0] in objs]
    return out, mats, lights, all_bb, style, grid


kit.build_scene = build_scene_ui


# ------------------------------------------------------------------------------------------ z-mask materials
def matbuild_ui(self, name):
    zm = CUR.get('zmask')
    if zm is None:
        return _orig_matbuild(self, name)
    lh = CUR.get('_lh', 3.5)
    mat = bpy.data.materials.new('zmask_' + name)
    nt = mat.node_tree; nt.nodes.clear()
    B = kit.NB(nt)
    out = B.n('ShaderNodeOutputMaterial')
    geo = B.n('ShaderNodeNewGeometry')
    sep = B.n('ShaderNodeSeparateXYZ'); B.set(sep.inputs[0], geo.outputs['Position'])
    fade = CUR.get('zmask_fade', 0.0)
    if fade > 0:   # grey ramp over `fade` levels below the focus level, white at and above it
        w = B.maprange(sep.outputs['Z'], (zm - fade) * lh, zm * lh - 0.02, 0.0, 0.999)
        w = B.math('ADD', w, B.math('GREATER_THAN', sep.outputs['Z'], zm * lh - 0.02))
        w = B.math('MINIMUM', w, 1.0)
    else:
        w = B.math('GREATER_THAN', sep.outputs['Z'], zm * lh - 0.02)
    em = B.n('ShaderNodeEmission')
    B.set(em.inputs['Color'], B.mix(w, (0, 0, 0), (1, 1, 1)))
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return mat


kit.MatFactory.build = matbuild_ui


# ------------------------------------------------------------------------------------------ jobs
def cam_target(cam):
    r, u = Vector(cam['right']), Vector(cam['up'])
    return list(r * cam['cx'] + u * cam['cy'])


def run(job):
    CUR.clear(); CUR.update(job)
    if job.get('camera_from'):
        cf = json.load(open(os.path.join(HERE, job['camera_from'])))
        camj = dict(job.get('camera') or {})
        camj.update(ortho_scale=cf['scale'], target=cam_target(cf), az=cf.get('az', 45.0), el=cf.get('el', 30.0))
        camj.pop('pan', None); camj.pop('zoom', None); camj.pop('margin', None)
        job['camera'] = camj
    if job.get('zmask') is not None:
        job.update(nofog=True, bloom=0, transparent=True)
    out = job['out'] if os.path.isabs(job['out']) else os.path.join(HERE, job['out'])
    job['out'] = out
    st = kit.run_job(job)
    cam = dict(st['camera'])
    camj = job.get('camera') or {}
    cam.update(res=job['res'], az=camj.get('az', 45.0), el=camj.get('el', 30.0),
               grid=dict(cell=4.0, level=3.5))
    with open(os.path.splitext(out)[0] + '.cam.json', 'w') as fh:
        json.dump(cam, fh, indent=1)
    st['name'] = job.get('name')
    return st


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--jobs', default=os.path.join(HERE, 'jobs.json'))
    ap.add_argument('--only', default=None)
    a = ap.parse_args(argv)
    J = json.load(open(a.jobs))
    sel = None if not a.only else set(a.only.split(','))
    stats = []
    for j in J['jobs']:
        if sel is not None and j['name'] not in sel:
            continue
        job = dict(J.get('defaults', {})); job.update(j)
        if not os.path.isabs(job['spec']):
            job['spec'] = os.path.normpath(os.path.join(HERE, job['spec']))
        t0 = time.time()
        stats.append(run(job))
        print('[kit_ui] %-28s %.1fs' % (j['name'], time.time() - t0), flush=True)
    sp = os.path.join(HERE, 'out', 'stats.json')
    old = {}
    if os.path.exists(sp):
        try:
            old = {s['name']: s for s in json.load(open(sp))}
        except Exception:
            old = {}
    for s in stats:
        old[s['name']] = s
    with open(sp, 'w') as fh:
        json.dump(list(old.values()), fh, indent=1)


main()
