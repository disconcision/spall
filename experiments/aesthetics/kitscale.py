"""
kitscale.py - scale support for the kit (Blender side): geometry-nodes instancing, prototypes with LOD, megaform
materials and light presets.

Instancing: a 'scatter' part (parts_scale.py) registers points + a prototype key; run_job_x builds each prototype once
(through the normal kit builders), hides it, and places it with a Geometry Nodes "Instance on Points" modifier on a
point cloud carrying per-point rotation and scale.  Prototypes can be declared once in spec meta['protos'].
"""
import json, math, os, time

import bpy

KIT = None
KITC = None
INSTANCES = []
PROTOS = {}


def C(h):
    h = h.lstrip('#')
    s = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(((c / 12.92) if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in s)


def M(**kw):
    return kw


LEDGE = dict(a=C('c6bfae'), b=C('aea899'), c=C('71904f'), scale=0.004)   # paved terraces, restrained planting
MATS = {
    # stepped megaform faces: concrete risers with ordinary-scale windows; ledges are landscape / paving
    'mega_step': M(base=C('bbb4a5'), rough=0.9, var=0.06, vscale=0.004, ledge=LEDGE,
                   facade=dict(fw=3.2, fh=3.5, ww=0.5, wh=0.42, sill=0.32, lit=0.16, glass=C('2a2d31'), c1=C('ffbf73'),
                               c2=C('ffe2b0'), bsz=90.0)),
    'mega_step_warm': M(base=C('c7b394'), rough=0.9, var=0.06, vscale=0.004, ledge=LEDGE,
                        facade=dict(fw=3.2, fh=3.5, ww=0.5, wh=0.42, sill=0.32, lit=0.16, glass=C('2d2a27'), c1=C('ffbf73'),
                                    c2=C('ffe2b0'), bsz=90.0)),
    'mega_blank': M(base=C('b3ac9d'), rough=0.92, var=0.06, vscale=0.003),
    'mega_conc': M(base=C('a8a295'), rough=0.92, var=0.05, vscale=0.003),
    'mega_dark': M(base=C('6f6b64'), rough=0.9, var=0.05, vscale=0.003,
                   facade=dict(fw=3.2, fh=3.5, ww=0.5, wh=0.42, sill=0.32, lit=0.2, glass=C('1f2124'), c1=C('ffbf73'), c2=C('ffe2b0'), bsz=90.0)),
    'mega_white': M(base=C('e6e2d8'), rough=0.6, var=0.03, vscale=0.003, ledge=dict(a=C('d8d2c2'), b=C('c9c3b3'), c=C('6f9a4a'), scale=0.004),
                    facade=dict(fw=3.0, fh=3.5, ww=0.7, wh=0.55, sill=0.22, lit=0.12, glass=C('4b6470'), c1=C('ffe0b0'), c2=C('fff0d8'), bsz=80.0)),
    # the same look for smooth far-LOD geometry: terraces painted as bands
    'mega_far': M(base=C('a39c8e'), rough=0.92, var=0.05, vscale=0.001,
                  far=dict(band=140.0, ledge_frac=0.3, a=C('c6bfae'), b=C('aea899'), win=0.6, win_col=C('5d5850'), scale=0.0012)),
    'mega_far_night': M(base=C('5a5650'), rough=0.92, var=0.05, vscale=0.001,
                        far=dict(band=140.0, ledge_frac=0.28, a=C('3e4632'), b=C('55524a'), win=0.6, win_col=C('2a2826'), glow=0.25,
                                 glow_col=C('ffb866'), scale=0.0012)),
    'mega_green': M(base=C('8a7f6a'), rough=0.9, var=0.06, vscale=0.004,
                    ledge=dict(a=C('4f7a3a'), b=C('6b8f45'), c=C('3a5d2e'), scale=0.005),
                    facade=dict(fw=3.0, fh=3.5, ww=0.8, wh=0.55, sill=0.2, lit=0.12, glass=C('3d5663'), c1=C('ffe0b0'), c2=C('fff0d8'),
                                bsz=80.0)),
    'grid_white': M(base=C('eeece6'), rough=0.6, var=0.02, vscale=0.002, grid=dict(g=48.0, w=0.045, line=C('8f959c'))),
    'grid_white_fine': M(base=C('eeece6'), rough=0.6, var=0.02, vscale=0.002, grid=dict(g=12.0, w=0.08, line=C('a2a7ad'))),
    'cloud': M(base=C('f5f5f2'), rough=1.0, var=0.0, emit=C('ffffff'), estr='lamp', emult=0.02, nofog=False),
    'town_white': M(base=C('eee8dc'), rough=0.85, var=0.04, vscale=0.3,
                    facade=dict(fw=2.4, fh=3.2, ww=0.38, wh=0.42, sill=0.3, lit=0.2, glass=C('34383c'), c1=C('ffc37a'), c2=C('ffe2b0'), bsz=13.0)),
    'town_ochre': M(base=C('dcb782'), rough=0.85, var=0.04, vscale=0.3,
                    facade=dict(fw=2.4, fh=3.2, ww=0.38, wh=0.42, sill=0.3, lit=0.2, glass=C('34383c'), c1=C('ffc37a'), c2=C('ffe2b0'), bsz=13.0)),
    'town_terra': M(base=C('c9785a'), rough=0.85, var=0.04, vscale=0.3,
                    facade=dict(fw=2.4, fh=3.2, ww=0.38, wh=0.42, sill=0.3, lit=0.2, glass=C('34383c'), c1=C('ffc37a'), c2=C('ffe2b0'), bsz=13.0)),
    'town_grey': M(base=C('a9aaa5'), rough=0.85, var=0.04, vscale=0.3,
                   facade=dict(fw=2.4, fh=3.2, ww=0.38, wh=0.42, sill=0.3, lit=0.2, glass=C('34383c'), c1=C('ffc37a'), c2=C('ffe2b0'), bsz=13.0)),
    'roof_terra': M(base=C('b25a3c'), rough=0.8, var=0.05, vscale=0.3),
    'roof_slate': M(base=C('50575f'), rough=0.8, var=0.05, vscale=0.3),
    'dome_blue': M(base=C('2f62a6'), rough=0.4, var=0.0),
    'city_far': M(base=C('8f8b83'), rough=0.9, var=0.08, vscale=0.01,
                  facade=dict(fw=3.2, fh=3.5, ww=0.5, wh=0.45, sill=0.3, lit=0.25, glass=C('2b2e33'), c1=C('ffb866'), c2=C('ffd9a0'), bsz=40.0)),
    'lake': M(base=C('3f7f93'), rough=0.06, spec=0.8, var=0.0, water=True, emit=C('2f7f96'), estr='lamp', emult=0.05),
    'plain': M(base=C('7f9a4f'), rough=0.97, var=0.22, vscale=0.0004),
    'haze_card': M(base=C('d9dde0'), rough=1.0, var=0.0),
    'ground_city': M(base=C('7b776e'), rough=0.95, var=0.1, vscale=0.002),
    'tile_floor': M(base=C('dcd3c1'), rough=0.8, var=0.02, vscale=0.5, grid=dict(g=0.6, w=0.06, line=C('b8ad97'))),
}

LIGHTS = {
    'powers': dict(sun_az=168, sun_el=30, sun=C('fff0da'), sun_e=4.6, sun_ang=1.5, world=C('9fb2c8'), world_e=0.62,
                   fill=0.14, win=1.6, lamp=3.0, neon=2.0, shaft=0.5, fall=0.4, snowflake=0.5, spark=20,
                   bloom=0.1, bloom_thr=1.4, exposure=0.1, look='AgX - Medium High Contrast', local=False,
                   fog_low=C('b9c6d3'), fog_high=C('dfe7ee'), back_top=C('8fb0d4'), back_bot=C('dfe6ec')),
    'aerial': dict(sun_az=222, sun_el=32, sun=C('fff0da'), sun_e=4.4, sun_ang=1.5, world=C('9fb2c8'), world_e=0.7,
                   fill=0.12, win=1.0, lamp=2.5, neon=2.0, shaft=0.5, fall=0.4, snowflake=0.5, spark=20,
                   bloom=0.08, bloom_thr=1.5, exposure=0.05, look='AgX - Medium High Contrast', local=False,
                   fog_low=C('b9c6d3'), fog_high=C('dfe7ee'), back_top=C('8fb0d4'), back_bot=C('dfe6ec')),
    'aerial_warm': dict(sun_az=212, sun_el=20, sun=C('ffcf98'), sun_e=4.6, sun_ang=1.5, world=C('8da2c2'), world_e=0.65,
                        fill=0.12, win=2.0, lamp=3.5, neon=3.0, shaft=0.6, fall=0.5, snowflake=0.5, spark=20,
                        bloom=0.2, bloom_thr=1.3, exposure=0.05, look='AgX - Medium High Contrast', local=True, local_scale=0.3,
                        fog_low=C('d3c3aa'), fog_high=C('efe2cc'), back_top=C('93b0d2'), back_bot=C('f2d9b8')),
    'aerial_dusk': dict(sun_az=205, sun_el=6, sun=C('ff9a55'), sun_e=2.6, sun_ang=2, world=C('3d4670'), world_e=0.7,
                        fill=0.1, win=4.0, lamp=7.0, neon=6.0, shaft=1.0, fall=0.8, snowflake=0.5, spark=40,
                        bloom=0.55, bloom_thr=1.1, exposure=0.15, look='AgX - Medium High Contrast', local=True, local_scale=1.0,
                        fog_low=C('5a5a78'), fog_high=C('c08a7a'), back_top=C('2d3558'), back_bot=C('dc9b77')),
    'void': dict(sun_az=230, sun_el=70, sun=C('e8eef6'), sun_e=1.6, sun_ang=3, world=C('59636e'), world_e=0.9,
                 fill=0.1, win=3.0, lamp=6.0, neon=5.0, shaft=1.2, fall=0.8, snowflake=0.5, spark=40,
                 bloom=0.4, bloom_thr=1.1, exposure=0.1, look='AgX - Medium High Contrast', local=True, local_scale=1.2,
                 fog_low=C('6a7079'), fog_high=C('b8c0c8'), back_top=C('9aa4ae'), back_bot=C('3c4148')),
}

STYLES = {
    'scale': dict(lit=0.4, panel=None, flat=0.28, fog=dict(h=0.2, gamma=1.5, d=0.3), trees=('round', 'round', 'conifer', 'bush'),
                  foliage=('foliage', 'foliage2', 'foliage3', 'foliage2')),
    'scale_green': dict(lit=0.4, panel=None, flat=0.28, fog=dict(h=0.2, gamma=1.5, d=0.3),
                        trees=('round', 'round', 'round', 'conifer', 'bush'),
                        foliage=('foliage', 'foliage2', 'foliage3', 'foliage_lime', 'foliage2'),
                        moss=dict(amount=0.7, scale=0.05, lo=0.47, hi=0.53, col=C('6b8a3a'), col2=C('86a349'))),
}


def register(kit, kitc):
    global KIT, KITC
    KIT, KITC = kit, kitc
    kit.MATS.update(MATS)
    kit.LIGHTS.update(LIGHTS)
    kit.STYLES.update(STYLES)


# ------------------------------------------------------------------------------------------------ instancing
def _ng_for(proto):
    ng = bpy.data.node_groups.new('scatter_' + proto.name, 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N = ng.nodes
    gi, go = N.new('NodeGroupInput'), N.new('NodeGroupOutput')
    iop = N.new('GeometryNodeInstanceOnPoints')
    oi = N.new('GeometryNodeObjectInfo')
    oi.inputs['Object'].default_value = proto
    oi.transform_space = 'ORIGINAL'
    ra = N.new('GeometryNodeInputNamedAttribute'); ra.data_type = 'FLOAT_VECTOR'; ra.inputs['Name'].default_value = 'rot'
    sa = N.new('GeometryNodeInputNamedAttribute'); sa.data_type = 'FLOAT_VECTOR'; sa.inputs['Name'].default_value = 'scl'
    e2r = N.new('FunctionNodeEulerToRotation')
    L = ng.links
    L.new(gi.outputs[0], iop.inputs['Points'])
    L.new(oi.outputs['Geometry'], iop.inputs['Instance'])
    L.new(ra.outputs['Attribute'], e2r.inputs[0])
    L.new(e2r.outputs[0], iop.inputs['Rotation'])
    L.new(sa.outputs['Attribute'], iop.inputs['Scale'])
    L.new(iop.outputs['Instances'], go.inputs[0])
    return ng


def _mesh_from_buf(name, buf, mats, scene):
    me = bpy.data.meshes.new(name)
    me.from_pydata(buf.v, [], buf.f)
    used = sorted(set(buf.m))
    remap = {m: i for i, m in enumerate(used)}
    me.polygons.foreach_set('material_index', [remap[m] for m in buf.m])
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob, me, [mats.names[m] for m in used]


def run_job_x(job):
    """kit.run_job with geometry-nodes instancing of prototypes (and per-job clip distances)."""
    import numpy as np
    kit = KIT
    t_start = time.time()
    kit.reset()
    for ng in list(bpy.data.node_groups):
        bpy.data.node_groups.remove(ng)
    INSTANCES.clear()
    PROTOS.clear()
    scene = bpy.context.scene
    with open(job['spec']) as fh:
        spec = json.load(fh)
    meta = spec.get('meta', {})
    PROTOS.update(meta.get('protos', {}))
    light = job.get('light') or meta.get('light', 'overcast')
    env = dict(kit.LIGHTS[light])
    stylename = job.get('style') or meta.get('style', 'arcology')
    env.update(kit.STYLES.get(stylename, {}).get('env', {}).get(light, {}))
    env.update(meta.get('env', {}).get(light, {}))
    env.update(job.get('env', {}))
    objs, mats, lights, all_bb, style, grid = kit.build_scene(spec, job)
    t_build = time.time()
    created = []
    for name, buf, flags in objs:
        if not buf.v:
            continue
        ob, me, names = _mesh_from_buf(name, buf, mats, scene)
        if flags.get('ghost') or flags.get('noshadow'):
            ob.visible_shadow = False
        created.append((ob, me, names, True))
    # ---- instancing
    groups = {}
    for req in INSTANCES:
        groups.setdefault(req['key'], []).append(req)
    n_inst, inst_verts = 0, 0
    for key, reqs in groups.items():
        parts = reqs[0].get('parts') or PROTOS.get(key)
        if not parts:
            kit.log('no prototype for', key)
            continue
        pspec = {'meta': {'grid': grid, 'seed': meta.get('seed', 0) + hash(key) % 1000, 'style': stylename}, 'parts': parts}
        pjob = {k: v for k, v in job.items() if k in ('style', 'style_overrides')}
        pjob['view'] = {'mode': 'full'}
        pobjs, pmats, plights, _, _, _ = kit.build_scene(pspec, pjob)
        pbuf = kit.Buf()
        for name, b, flags in pobjs:
            pbuf.extend(b)
        if not pbuf.v:
            continue
        pob, pme, pnames = _mesh_from_buf('proto_' + key, pbuf, pmats, scene)
        pob.hide_render = True
        created.append((pob, pme, pnames, False))
        pos = [p for r in reqs for p in r['pos']]
        rot = [c for r in reqs for q in r['rot'] for c in q]
        scl = [c for r in reqs for q in r['scl'] for c in q]
        pm = bpy.data.meshes.new('pts_' + key)
        pm.from_pydata(pos, [], [])
        a = pm.attributes.new('rot', 'FLOAT_VECTOR', 'POINT'); a.data.foreach_set('vector', rot)
        b = pm.attributes.new('scl', 'FLOAT_VECTOR', 'POINT'); b.data.foreach_set('vector', scl)
        po = bpy.data.objects.new('inst_' + key, pm)
        scene.collection.objects.link(po)
        mod = po.modifiers.new('scatter', 'NODES')
        mod.node_group = _ng_for(pob)
        created.append((po, pm, [], True))
        n_inst += len(pos)
        inst_verts += len(pos) * len(pbuf.v)
        # a budget of the prototype's lights, copied to the first instances (offsets not rotated; they are small)
        if plights and job.get('inst_lights', 0):
            for (px, py, pz) in pos[:job['inst_lights']]:
                for (lp, lc, lw, lr) in [l[:4] for l in plights[:2]]:
                    lights.append(((px + lp[0], py + lp[1], pz + lp[2]), lc, lw, lr))
        kit.log('instanced %s x%d (%d verts each)' % (key, len(pos), len(pbuf.v)))
    # ---- frame
    if job.get('frame_bb'):
        x0, y0, z0, x1, y1, z1 = job['frame_bb']
        pts = np.array([(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)])
    else:
        arrs = []
        for ob, me, _, fr in created:
            if not fr or not len(me.vertices):
                continue
            a = np.empty(len(me.vertices) * 3, dtype=np.float32)
            me.vertices.foreach_get('co', a)
            arrs.append(a.reshape(-1, 3))
        pts = np.concatenate(arrs) if arrs else np.zeros((1, 3))
    cam, info = kit.setup_camera(scene, pts, job, grid)
    if job.get('clip'):
        cam.data.clip_start, cam.data.clip_end = job['clip']
    fcfg = dict(style.d.get('fog', {}))
    fcfg.update(meta.get('fog', {}))
    fcfg.update(job.get('fog', {}))
    zlo = fcfg.get('z_lo', float(pts[:, 2].min()))
    zhi = fcfg.get('z_hi', float(pts[:, 2].max()))
    fog = dict(h=fcfg.get('h', 0.3), gamma=fcfg.get('gamma', 1.5), d=fcfg.get('d', 0.2), z_lo=zlo, z_hi=zhi,
               fwd=info['fwd'], d0=fcfg.get('d0', info['d0'] + (info['d1'] - info['d0']) * fcfg.get('d_start', 0.25)),
               d1=fcfg.get('d1', info['d1']), low=env['fog_low'], high=env['fog_high'])
    if job.get('nofog'):
        fog = None
    mf = kit.MatFactory(style, env, fog)
    for ob, me, names, _ in created:
        for n in names:
            me.materials.append(mf.get(n))
    if not job.get('transparent'):
        kit.add_backdrop(scene, cam, info, env)
    kit.setup_world_and_lights(scene, env, lights, job)
    kit.setup_render(scene, job, env)
    out = job['out']
    os.makedirs(os.path.dirname(out), exist_ok=True)
    scene.render.filepath = out
    t_r = time.time()
    bpy.ops.render.render(write_still=True)
    nverts = sum(len(me.vertices) for _, me, _, fr in created if fr)
    stats = dict(out=out, build_s=round(t_build - t_start, 2), mesh_s=round(t_r - t_build, 2), render_s=round(time.time() - t_r, 2),
                 verts=nverts, instances=n_inst, inst_verts=inst_verts, lights=len(lights),
                 camera=dict(scale=info['scale'], cx=info['cx'], cy=info['cy'], right=info['right'], up=info['up'],
                             fwd=info['fwd'], persp=bool(info.get('persp'))))
    if info.get('persp'):
        stats['camera'].update(loc=list(cam.location), fov=info['fov'], res=list(info['res']),
                               shift=[cam.data.shift_x, cam.data.shift_y])
    kit.log("rendered", os.path.basename(out), "build %.1fs render %.1fs verts %d instances %d (%d M inst verts)" %
            (stats['build_s'], stats['render_s'], nverts, n_inst, inst_verts // 1000000))
    return stats
