"""
kitc.py - the aesthetics-study renderer (Blender 5.0, headless).

Imports the UNMODIFIED kit-of-parts renderer ../../experiments/concept-renders/kit.py as a module and extends it in
memory only (nothing is written into concept-renders; bytecode writing is disabled):

  * bevel / chamfer as a first-class option on EVERY part: params.bevel (number or dict) or a style-level
    `bevel` policy turns the kit's plain boxes into chamfered / rounded / stepped boxes (prims.cbox), scaled to
    each box's size and filtered by material, so one spec renders blocky or hewn;
  * new part families (parts_*.py): brutalist + tetrapod/breakwater concrete, overgrowth, underground, voids,
    boreholes, hangars, infrastructure sweeps, city towers and terrain;
  * a richer material factory: procedural facade windows, moss / ivy / algae weathering, board-formed concrete,
    hazard stripes, earth strata, gloss; section caps chosen by the material that was cut (earth vs structure);
  * perspective cameras, extra suns, shadowed / coloured local lights, more lighting presets and styles.

    Blender --background --factory-startup --python kitc.py -- --jobs jobs/foo.json [--only 0,3]
"""
import json, math, os, random, sys, time

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
CR = os.path.normpath(os.path.join(HERE, '..', '..', 'experiments', 'concept-renders'))
sys.path.insert(0, HERE)
sys.path.insert(0, CR)

import bpy                     # noqa: E402
from mathutils import Vector   # noqa: E402
import kit                     # noqa: E402  (read-only import of the original renderer)
import prims                   # noqa: E402

C = kit.C
log = kit.log

# =====================================================================================  job-level globals
JOB = {}


# =====================================================================================  MatTable registry + cap choice
_orig_mt_init = kit.MatTable.__init__
CURRENT_MT = [None]


def _mt_init(self):
    _orig_mt_init(self)
    CURRENT_MT[0] = self


kit.MatTable.__init__ = _mt_init

EARTH = {'rock', 'rock_dark', 'earth', 'soil_deep', 'fill_rock', 'bedrock', 'clay'}


def clip_bm(bm, co, no, cap_mat):
    """kit.clip_bm, but each cap takes the poche variant of the material it cuts through (earth -> strata)."""
    import bmesh
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    res = bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=co, plane_no=no, clear_outer=True, clear_inner=False)
    if cap_mat is None:
        return
    cut = [g for g in res['geom_cut'] if isinstance(g, bmesh.types.BMEdge) and g.is_valid]
    be = [e for e in cut if len(e.link_faces) == 1]
    if not be:
        return
    mt = CURRENT_MT[0]
    try:
        r2 = bmesh.ops.holes_fill(bm, edges=be, sides=0)
    except Exception as ex:
        log("holes_fill failed", ex)
        return
    style_map = JOB.get('poche_map', {})
    default = JOB.get('poche', 'poche')
    for f in r2['faces']:
        src = None
        for e in f.edges:
            for lf in e.link_faces:
                if lf is not f and lf.material_index != cap_mat:
                    src = mt.names[lf.material_index] if mt else None
                    break
            if src:
                break
        name = style_map.get(src) or ('poche_earth' if src in EARTH else default)
        f.material_index = mt.mid(name) if mt else cap_mat


kit.clip_bm = clip_bm


# =====================================================================================  bevel as a first-class option
_orig_part_init = kit.Part.__init__
_orig_box = kit.Part.box


def _resolve_bevel(P, style):
    cfg = style.d.get('bevel')
    if 'bevel' in JOB:
        cfg = JOB['bevel']
    pb = P.p.get('bevel')
    if pb is not None:
        if pb is False or pb == 0:
            return None
        if isinstance(pb, (int, float)):
            base = dict(cfg) if isinstance(cfg, dict) else {}
            base.update(abs_v=float(pb), mats=None)
            return base
        base = dict(cfg) if isinstance(cfg, dict) else {}
        base.update(pb)
        return base
    if not cfg:
        return None
    if cfg.get('types') and P.type not in cfg['types']:
        return None
    return cfg


def _part_init(self, d, grid, idx, seed, mats, style):
    _orig_part_init(self, d, grid, idx, seed, mats, style)
    self._bev = _resolve_bevel(self, style)
    self.spots = []


def _box(self, mat, x0, y0, z0, x1, y1, z1):
    b = self._bev
    if b and not self.__dict__.get('_nobev'):
        ms = b.get('mats')
        if not ms or mat in ms:
            dx, dy, dz = abs(x1 - x0), abs(y1 - y0), abs(z1 - z0)
            m = min(dx, dy)
            if m >= b.get('min_dim', 0.9) and dz >= b.get('min_h', 0.5):
                if 'abs_v' in b:
                    v = b['abs_v']
                else:
                    v = min(b.get('max', 2.5), max(b.get('lo', 0.06), b.get('rel', 0.09) * m))
                t = min(b.get('top_max', 1.6), b.get('top_rel', 0.6) * v, dz * 0.4)
                bt = min(t * b.get('bot_k', 0.0), dz * 0.3)
                if not b.get('v', True):
                    v = 0.0
                return prims.cbox(self, mat, x0, y0, z0, x1, y1, z1, v=v, top=t, bot=bt, mode=b.get('mode', 'chamfer'),
                                  tmode=b.get('tmode'), seg=b.get('seg', 3), steps=b.get('steps', 2))
    return _orig_box(self, mat, x0, y0, z0, x1, y1, z1)


def _spot(self, pos, color, power, direction=(0, 0, -1), size=60.0, radius=0.2, shadow=False):
    wp = self.xf(pos)
    tip = self.xf(tuple(pos[i] + direction[i] for i in range(3)))
    self.lights.append((wp, color, power, radius, dict(spot=True, dir=tuple(tip[i] - wp[i] for i in range(3)), size=size,
                                                       shadow=shadow)))


kit.Part.__init__ = _part_init
kit.Part.box = _box
kit.Part.spot = _spot
kit.Part.raw_box = _orig_box


# =====================================================================================  materials
def M(**kw):
    return kw


NEW_MATS = {
    # --- brutalist / infrastructure concrete
    'bconc': M(base=C('aaa498'), rough=0.93, var=0.10, vscale=0.025, streak=0.30, boards=0.45, weather=True),
    'bconc_light': M(base=C('c7c0b3'), rough=0.92, var=0.08, vscale=0.025, streak=0.22, boards=0.45, weather=True),
    'bconc_dark': M(base=C('736f67'), rough=0.95, var=0.10, vscale=0.03, streak=0.30, weather=True),
    'bconc_warm': M(base=C('b8a58c'), rough=0.93, var=0.10, vscale=0.025, streak=0.25, boards=0.45, weather=True),
    'precast': M(base=C('bdb7aa'), rough=0.85, var=0.07, vscale=0.04, streak=0.18, panel=True, weather=True),
    'tetra': M(base=C('cdc6b8'), rough=0.97, var=0.16, vscale=0.12, streak=0.18, weather=True),
    'tetra_old': M(base=C('8f8a7e'), rough=0.97, var=0.22, vscale=0.12, streak=0.45, weather=True),
    'tetra_wet': M(base=C('5f5c55'), rough=0.35, var=0.18, vscale=0.12, streak=0.3),
    'liner': M(base=C('9c988f'), rough=0.9, var=0.08, vscale=0.05, streak=0.25, weather=True),
    'asphalt2': M(base=C('35373a'), rough=0.9, var=0.12, vscale=0.04),
    'lane_white': M(base=C('e8e6de'), rough=0.7, var=0.0),
    'lane_yellow': M(base=C('e0b43a'), rough=0.7, var=0.0),
    'barrier': M(base=C('c9c4b9'), rough=0.9, var=0.06, vscale=0.05, streak=0.15),
    # --- steel / industrial
    'galv': M(base=C('9ea3a6'), rough=0.45, metal=0.8, var=0.12, vscale=0.3),
    'grating': M(base=C('3b3e42'), rough=0.6, metal=0.7, var=0.15, vscale=0.5),
    'rubber': M(base=C('1d1e20'), rough=0.75, var=0.06, vscale=0.4),
    'belt': M(base=C('26272a'), rough=0.8, var=0.1, vscale=0.6),
    'yellow_paint': M(base=C('e0a82a'), rough=0.55, metal=0.2, var=0.10, vscale=0.4),
    'orange_paint': M(base=C('d8622a'), rough=0.55, metal=0.2, var=0.10, vscale=0.4),
    'blue_paint': M(base=C('2f5f8f'), rough=0.55, metal=0.2, var=0.10, vscale=0.4),
    'white_paint': M(base=C('e3e1da'), rough=0.45, metal=0.1, var=0.05, vscale=0.4),
    'hazard': M(base=C('e2b02a'), rough=0.6, var=0.0, stripes=(0.9, C('e2b02a'), C('1e1e1e'))),
    'copper': M(base=C('b8703e'), rough=0.35, metal=1.0, var=0.2, vscale=0.5),
    'copper_old': M(base=C('5f9c86'), rough=0.7, metal=0.3, var=0.3, vscale=0.5),
    'cable_black': M(base=C('1b1c1e'), rough=0.55, var=0.05, vscale=0.5),
    'cable_grey': M(base=C('4d5054'), rough=0.55, var=0.05, vscale=0.5),
    'cable_red': M(base=C('a8322a'), rough=0.5, var=0.05),
    'cable_blue': M(base=C('2f5da0'), rough=0.5, var=0.05),
    'cable_yellow': M(base=C('d9ad2c'), rough=0.5, var=0.05),
    'cable_green': M(base=C('3f7a45'), rough=0.5, var=0.05),
    'cable_orange': M(base=C('d76a26'), rough=0.5, var=0.05),
    'pipe_yellow': M(base=C('d6a933'), rough=0.5, metal=0.3, var=0.12, vscale=0.3),
    'pipe_blue': M(base=C('3f6c9a'), rough=0.5, metal=0.3, var=0.12, vscale=0.3),
    'pipe_green': M(base=C('4f7f5c'), rough=0.5, metal=0.3, var=0.12, vscale=0.3),
    'pipe_red': M(base=C('a8443a'), rough=0.5, metal=0.3, var=0.12, vscale=0.3),
    'pipe_white': M(base=C('d7d6d0'), rough=0.45, metal=0.2, var=0.08, vscale=0.3),
    'pipe_grey': M(base=C('7d8185'), rough=0.5, metal=0.5, var=0.12, vscale=0.3),
    'pipe_rust': M(base=C('7a4a2c'), rough=0.85, metal=0.3, var=0.35, vscale=0.5, streak=0.2),
    'insul': M(base=C('c9c7c0'), rough=0.5, metal=0.6, var=0.08, vscale=0.6),
    'tube_glass': M(base=C('b9d6de'), rough=0.05, alpha=0.22, var=0.0, spec=0.9),
    'tube_frame': M(base=C('c4c8cc'), rough=0.35, metal=0.8, var=0.05),
    'pod_red': M(base=C('c8402e'), rough=0.35, emit=C('ff6a3a'), estr='lamp', emult=0.05, var=0.0),
    'pod_teal': M(base=C('2e9c9a'), rough=0.35, emit=C('4affe8'), estr='lamp', emult=0.05, var=0.0),
    'pod_amber': M(base=C('d9962a'), rough=0.35, emit=C('ffc04a'), estr='lamp', emult=0.05, var=0.0),
    'pod_white': M(base=C('e6e6e2'), rough=0.3, emit=C('ffffff'), estr='lamp', emult=0.04, var=0.0),
    'slide_teal': M(base=C('17a3a6'), rough=0.18, var=0.0, spec=0.8),
    'slide_yellow': M(base=C('f1bb24'), rough=0.18, var=0.0, spec=0.8),
    'slide_red': M(base=C('d9432f'), rough=0.18, var=0.0, spec=0.8),
    'slide_blue': M(base=C('2c69c9'), rough=0.18, var=0.0, spec=0.8),
    'slide_white': M(base=C('eef0ee'), rough=0.2, var=0.0, spec=0.8),
    'slide_water': M(base=C('8fe3ef'), rough=0.05, emit=C('7fe0f0'), estr='lamp', emult=0.03, var=0.0, spec=1.0),
    'pool': M(base=C('39b7c9'), rough=0.05, spec=1.0, var=0.0, water=True, emit=C('2aa8c0'), estr='lamp', emult=0.04),
    'pool_tile': M(base=C('e9f2f0'), rough=0.3, var=0.02),
    'car_a': M(base=C('b8bcc0'), rough=0.3, metal=0.6, var=0.0),
    'car_b': M(base=C('2d2f33'), rough=0.3, metal=0.6, var=0.0),
    'car_c': M(base=C('9c2a22'), rough=0.3, metal=0.6, var=0.0),
    'car_d': M(base=C('d8d5cc'), rough=0.3, metal=0.6, var=0.0),
    'headlight': M(base=C('fff4dc'), emit=C('fff1d6'), estr='lamp', rough=0.4, var=0.0),
    'taillight': M(base=C('ff2a1a'), emit=C('ff2a1a'), estr='neon', rough=0.4, var=0.0),
    'worklight': M(base=C('ffffff'), emit=C('fff6e8'), estr='lamp', emult=1.4, rough=0.4, var=0.0),
    'sodium': M(base=C('ffb54a'), emit=C('ffa436'), estr='lamp', emult=1.2, rough=0.4, var=0.0),
    'coolwhite': M(base=C('f4f8ff'), emit=C('eaf2ff'), estr='lamp', emult=1.2, rough=0.4, var=0.0),
    'warmwhite': M(base=C('fff3df'), emit=C('ffe8c4'), estr='lamp', emult=1.2, rough=0.4, var=0.0),
    'molten': M(base=C('ff8a2a'), emit=C('ff7a1a'), estr='neon', emult=1.4, rough=0.6, var=0.2, vscale=2.0),
    'ore': M(base=C('5a4d40'), rough=1.0, var=0.3, vscale=1.5),
    'spoil': M(base=C('6f6250'), rough=1.0, var=0.3, vscale=1.0),
    'crate_a': M(base=C('b0763a'), rough=0.8, var=0.15),
    'crate_b': M(base=C('3f6a8a'), rough=0.6, metal=0.3, var=0.1),
    'crate_c': M(base=C('b7412e'), rough=0.6, metal=0.3, var=0.1),
    # --- earth
    'rock': M(base=C('5b544b'), rough=0.97, var=0.25, vscale=0.08),
    'rock_dark': M(base=C('3a3632'), rough=0.97, var=0.25, vscale=0.08),
    'poche_earth': M(strata=True, base=C('6b5d4c'), rough=0.98),
    'poche_dark': M(base=C('2a2826'), rough=0.95, var=0.05, vscale=0.05),
    'poche_light': M(base=C('d8d3c8'), rough=0.95, var=0.02),
    # --- greenery
    'moss': M(base=C('5d7a2f'), rough=0.95, var=0.35, vscale=1.2),
    'ivy': M(base=C('2f4d23'), rough=0.85, var=0.35, vscale=1.4),
    'ivy2': M(base=C('44672b'), rough=0.85, var=0.35, vscale=1.4),
    'vine_light': M(base=C('7c9b3a'), rough=0.85, var=0.3, vscale=1.4),
    'vine_flower': M(base=C('b25a8e'), rough=0.85, var=0.3, vscale=1.4),
    'vine_flower2': M(base=C('e0a23a'), rough=0.85, var=0.3, vscale=1.4),
    'root': M(base=C('5d4a3a'), rough=0.9, var=0.2, vscale=0.8),
    'fern': M(base=C('567f2b'), rough=0.85, var=0.3, vscale=1.4),
    # --- underground palette slots (gritty defaults; the ug_* styles override them)
    'ug_wall': M(base=C('6a6560'), rough=0.9, var=0.14, vscale=0.05, streak=0.45, panel=True),
    'ug_wall2': M(base=C('565149'), rough=0.9, var=0.14, vscale=0.05, streak=0.4),
    'ug_floor': M(base=C('4a4743'), rough=0.8, var=0.15, vscale=0.08, streak=0.1),
    'ug_ceiling': M(base=C('3e3b37'), rough=0.9, var=0.1, vscale=0.05),
    'ug_trim': M(base=C('d3a02e'), rough=0.6, var=0.1, vscale=0.3),
    'ug_accent': M(base=C('e2b02a'), rough=0.6, var=0.0, stripes=(0.9, C('e2b02a'), C('1e1e1e'))),
    'ug_pipe': M(base=C('7a4a2c'), rough=0.8, metal=0.4, var=0.3, vscale=0.5, streak=0.2),
    'ug_pipe2': M(base=C('5d6b64'), rough=0.6, metal=0.4, var=0.2, vscale=0.3),
    'ug_duct': M(base=C('7e8185'), rough=0.5, metal=0.6, var=0.15, vscale=0.3),
    'ug_steel': M(base=C('3f4246'), rough=0.6, metal=0.7, var=0.15, vscale=0.3),
    'ug_col': M(base=C('77716a'), rough=0.9, var=0.14, vscale=0.05, streak=0.45),
    'ug_light': M(base=C('ffb54a'), emit=C('ffa436'), estr='lamp', emult=1.3, rough=0.4, var=0.0),
    'ug_light2': M(base=C('d9f0ff'), emit=C('bfe6ff'), estr='lamp', emult=0.7, rough=0.4, var=0.0),
    'ug_sign': M(base=C('2b8a4a'), emit=C('3dff7a'), estr='neon', emult=0.4, rough=0.4, var=0.0),
    'ug_glass': M(base=C('9fb8c0'), rough=0.08, alpha=0.3, var=0.0, spec=0.9),
    'ug_rail': M(base=C('d3a02e'), rough=0.6, metal=0.3, var=0.1),
    'ug_plant': M(base=C('4d7a2e'), rough=0.85, var=0.35, vscale=0.7),
    'ug_planter': M(base=C('5a5650'), rough=0.9, var=0.1),
    # --- city facades (procedural windows)
    'fac_dark': M(base=C('2c2e33'), rough=0.6, var=0.08, vscale=0.01, facade=dict(fw=2.6, fh=3.6, ww=0.55, wh=0.5, sill=0.3, lit=0.13,
                  glass=C('14171b'), c1=C('ffb866'), c2=C('ffd9a0'), bsz=37.0)),
    'fac_dark2': M(base=C('3a3b3e'), rough=0.6, var=0.08, vscale=0.01, facade=dict(fw=4.0, fh=3.6, ww=1.0, wh=0.42, sill=0.34, lit=0.1,
                   band=True, glass=C('15181c'), c1=C('7fc8ff'), c2=C('ffb866'), bsz=41.0, emult=0.8)),
    'fac_conc': M(base=C('9b958a'), rough=0.9, var=0.1, vscale=0.02, streak=0.35, weather=True,
                  facade=dict(fw=3.0, fh=3.5, ww=0.45, wh=0.45, sill=0.3, lit=0.25, glass=C('1b1e21'), c1=C('ffbf73'), c2=C('ffe2b0'), bsz=33.0)),
    'fac_conc2': M(base=C('b2ab9e'), rough=0.9, var=0.1, vscale=0.02, streak=0.3, weather=True,
                   facade=dict(fw=3.6, fh=3.5, ww=1.0, wh=0.36, sill=0.38, lit=0.2, band=True, glass=C('1d2023'), c1=C('ffc67e'), c2=C('ffe6ba'), bsz=29.0)),
    'fac_white': M(base=C('e4e0d6'), rough=0.6, var=0.05, vscale=0.02, facade=dict(fw=3.2, fh=3.5, ww=0.62, wh=0.55, sill=0.25, lit=0.12,
                   glass=C('45606e'), c1=C('ffe7c2'), c2=C('fff4de'), bsz=31.0)),
    'fac_timber': M(base=C('a47a4f'), rough=0.75, var=0.12, vscale=0.3, facade=dict(fw=2.4, fh=3.5, ww=0.7, wh=0.6, sill=0.2, lit=0.15,
                    glass=C('3d5663'), c1=C('ffe0b0'), c2=C('fff0d8'), bsz=27.0)),
    'fac_glass': M(base=C('33434f'), rough=0.12, spec=0.9, var=0.04, vscale=0.01, facade=dict(fw=1.6, fh=3.6, ww=0.9, wh=0.8, sill=0.1, lit=0.2,
                   glass=C('223038'), c1=C('bfe6ff'), c2=C('ffe2b8'), bsz=35.0)),
    'roof_dark': M(base=C('2b2c2f'), rough=0.9, var=0.15, vscale=0.05),
    'roof_conc': M(base=C('8a857c'), rough=0.95, var=0.15, vscale=0.05, weather=True),
    'roof_white': M(base=C('d9d6cf'), rough=0.8, var=0.08, vscale=0.05),
    'holo_cyan': M(base=C('39e8ff'), emit=C('39e8ff'), estr='neon', emult=1.0, alpha=0.75, rough=0.3, var=0.0),
    'holo_pink': M(base=C('ff4fb5'), emit=C('ff4fb5'), estr='neon', emult=1.0, alpha=0.75, rough=0.3, var=0.0),
    'holo_amber': M(base=C('ffb13b'), emit=C('ffb13b'), estr='neon', emult=1.0, alpha=0.75, rough=0.3, var=0.0),
    'spinner': M(base=C('c9ccd0'), emit=C('ffe9c8'), estr='lamp', emult=0.5, rough=0.3, metal=0.5, var=0.0),
    # --- terrain
    'terrain': M(base=C('6b7f45'), rough=0.97, terrain=True),
    'fields': M(base=C('93904f'), rough=0.97, fields=True),
    'sand': M(base=C('c8b58c'), rough=0.97, var=0.12, vscale=0.05),
    'sea': M(base=C('2d6f84'), rough=0.08, spec=0.8, var=0.0, water=True, emit=C('2a6f86'), estr='lamp', emult=0.05),
    'road_rural': M(base=C('4a4a47'), rough=0.9, var=0.1, vscale=0.03),
}
kit.MATS.update(NEW_MATS)

WEATHER_OLD = {'concrete', 'concrete_light', 'concrete_dark', 'deck', 'panel', 'planter'}

NEW_LIGHTS = {
    'hazy': dict(sun_az=235, sun_el=38, sun=C('fff0dc'), sun_e=3.4, sun_ang=6, world=C('a3b0bd'), world_e=0.95,
                 fill=0.25, win=0.5, lamp=1.5, neon=1.5, shaft=0.4, fall=0.3, snowflake=0.5, spark=20,
                 bloom=0.0, exposure=0.0, look='AgX - Medium High Contrast', local=False,
                 fog_low=C('b7bfc6'), fog_high=C('d9dee2'), back_top=C('c9d4de'), back_bot=C('e9e6df')),
    'warm': dict(sun_az=222, sun_el=30, sun=C('ffd9a8'), sun_e=4.4, sun_ang=4, world=C('93a7c4'), world_e=0.85,
                 fill=0.22, win=1.2, lamp=3.0, neon=2.5, shaft=0.6, fall=0.5, snowflake=0.5, spark=20,
                 bloom=0.2, bloom_thr=1.3, exposure=0.0, look='AgX - Medium High Contrast', local=True, local_scale=0.3,
                 fog_low=C('cdbfa6'), fog_high=C('ebe1cd'), back_top=C('a8bfd8'), back_bot=C('f1dcc0')),
    'ug_grit': dict(sun_az=235, sun_el=40, sun=C('ffd2a0'), sun_e=1.3, sun_ang=6, world=C('4a3a2c'), world_e=0.75,
                    fill=0.0, win=6.0, lamp=9.0, neon=7.0, shaft=0.8, fall=0.6, snowflake=0.5, spark=60,
                    bloom=0.5, bloom_thr=1.1, exposure=0.55, look='AgX - Medium High Contrast', local=True, local_scale=2.4,
                    fog_low=C('0e0c0b'), fog_high=C('3a3029'), back_top=C('3a332d'), back_bot=C('1d1916')),
    'ug_mid': dict(sun_az=235, sun_el=40, sun=C('fff1dc'), sun_e=1.6, sun_ang=6, world=C('585650'), world_e=0.8,
                   fill=0.0, win=5.0, lamp=6.0, neon=5.0, shaft=0.8, fall=0.6, snowflake=0.5, spark=60,
                   bloom=0.3, bloom_thr=1.2, exposure=0.5, look='AgX - Medium High Contrast', local=True, local_scale=1.8,
                   fog_low=C('151513'), fog_high=C('45443f'), back_top=C('4a4944'), back_bot=C('26251f')),
    'ug_clean': dict(sun_az=235, sun_el=40, sun=C('ffffff'), sun_e=2.2, sun_ang=6, world=C('c9d3de'), world_e=0.75,
                     fill=0.0, win=3.0, lamp=4.0, neon=3.0, shaft=0.6, fall=0.5, snowflake=0.5, spark=40,
                     bloom=0.2, bloom_thr=1.6, exposure=0.1, look='AgX - Medium High Contrast', local=True, local_scale=0.9,
                     fog_low=C('b8c2cc'), fog_high=C('eef2f5'), back_top=C('6f7b87'), back_bot=C('9aa5b0')),
    'br_night': dict(sun_az=240, sun_el=35, sun=C('8fa3c7'), sun_e=0.45, sun_ang=10, world=C('26303f'), world_e=1.0,
                     fill=0.05, win=2.4, lamp=6.0, neon=5.0, shaft=0.8, fall=0.6, snowflake=0.5, spark=60,
                     bloom=0.45, bloom_thr=1.25, exposure=0.1, look='AgX - Medium High Contrast', local=True, local_scale=1.0,
                     fog_low=C('4b5361'), fog_high=C('6e7787'), back_top=C('283140'), back_bot=C('5c6574')),
    'br_haze': dict(sun_az=205, sun_el=14, sun=C('ffb070'), sun_e=2.4, sun_ang=6, world=C('6e5e52'), world_e=0.6,
                    fill=0.1, win=4.0, lamp=6.0, neon=7.0, shaft=0.8, fall=0.6, snowflake=0.5, spark=60,
                    bloom=0.6, bloom_thr=1.0, exposure=0.1, look='AgX - Medium High Contrast', local=True, local_scale=1.0,
                    fog_low=C('7a5a44'), fog_high=C('c89066'), back_top=C('8a6a55'), back_bot=C('d7a070')),
    'green_day': dict(sun_az=228, sun_el=36, sun=C('fff0d2'), sun_e=4.0, sun_ang=4, world=C('9fb1c0'), world_e=0.9,
                      fill=0.22, win=0.8, lamp=2.0, neon=2.0, shaft=0.5, fall=0.4, snowflake=0.5, spark=20,
                      bloom=0.1, bloom_thr=1.5, exposure=0.05, look='AgX - Medium High Contrast', local=True, local_scale=0.2,
                      fog_low=C('b5bda9'), fog_high=C('dde2d4'), back_top=C('b3c7d6'), back_bot=C('e6e7da')),
    'solar_day': dict(sun_az=232, sun_el=44, sun=C('fff6e6'), sun_e=4.3, sun_ang=3, world=C('8fb0d8'), world_e=0.95,
                      fill=0.2, win=0.6, lamp=1.5, neon=1.5, shaft=0.4, fall=0.3, snowflake=0.5, spark=20,
                      bloom=0.08, bloom_thr=1.6, exposure=0.05, look='AgX - Medium High Contrast', local=False,
                      fog_low=C('bfd0e0'), fog_high=C('e6eef5'), back_top=C('8fb4de'), back_bot=C('e4eef4')),
    'crisp': dict(sun_az=228, sun_el=34, sun=C('fff1dc'), sun_e=4.6, sun_ang=1.5, world=C('9fb0c4'), world_e=0.62,
                  fill=0.12, win=1.2, lamp=3.0, neon=2.5, shaft=0.5, fall=0.4, snowflake=0.5, spark=20,
                  bloom=0.12, bloom_thr=1.4, exposure=0.05, look='AgX - Medium High Contrast', local=True, local_scale=0.25,
                  fog_low=C('c9ccc8'), fog_high=C('e4e4de'), back_top=C('b8c7d4'), back_bot=C('ebe7dd')),
    'crisp_warm': dict(sun_az=218, sun_el=24, sun=C('ffd8a6'), sun_e=4.8, sun_ang=1.5, world=C('8ea3c2'), world_e=0.6,
                       fill=0.12, win=2.2, lamp=4.0, neon=3.0, shaft=0.6, fall=0.5, snowflake=0.5, spark=20,
                       bloom=0.25, bloom_thr=1.2, exposure=0.05, look='AgX - Medium High Contrast', local=True, local_scale=0.4,
                       fog_low=C('d8c4a4'), fog_high=C('efe3cf'), back_top=C('a3bad6'), back_bot=C('f3dcbc')),
    'section': dict(sun_az=235, sun_el=48, sun=C('fff2de'), sun_e=3.2, sun_ang=6, world=C('7f8a96'), world_e=0.75,
                    fill=0.2, win=3.0, lamp=6.0, neon=5.0, shaft=0.6, fall=0.5, snowflake=0.5, spark=40,
                    bloom=0.35, bloom_thr=1.2, exposure=0.1, look='AgX - Medium High Contrast', local=True, local_scale=0.8,
                    fog_low=C('0d0c0b'), fog_high=C('b9c2ca'), back_top=C('c3ccd4'), back_bot=C('1a1917')),
}
kit.LIGHTS.update(NEW_LIGHTS)

UG_CLEAN = {
    'ug_wall': M(base=C('eceae4'), rough=0.25, var=0.03, vscale=0.05, panel=True, spec=0.7),
    'ug_wall2': M(base=C('d9d8d3'), rough=0.3, var=0.03, vscale=0.05),
    'ug_floor': M(base=C('d5d6d4'), rough=0.12, var=0.03, vscale=0.08, spec=0.9),
    'ug_ceiling': M(base=C('f2f1ec'), rough=0.4, var=0.02),
    'ug_trim': M(base=C('b9bec4'), rough=0.2, metal=0.8, var=0.02),
    'ug_accent': M(base=C('3fa7b8'), rough=0.3, var=0.0),
    'ug_pipe': M(base=C('e4e4e0'), rough=0.3, metal=0.2, var=0.02),
    'ug_pipe2': M(base=C('c9ced3'), rough=0.3, metal=0.5, var=0.02),
    'ug_duct': M(base=C('eeeeea'), rough=0.35, var=0.02),
    'ug_steel': M(base=C('c7cbcf'), rough=0.25, metal=0.8, var=0.02),
    'ug_col': M(base=C('f0eee8'), rough=0.3, var=0.02, spec=0.7),
    'ug_light': M(base=C('ffffff'), emit=C('f2f7ff'), estr='lamp', emult=1.4, rough=0.4, var=0.0),
    'ug_light2': M(base=C('ffffff'), emit=C('e8f4ff'), estr='lamp', emult=1.0, rough=0.4, var=0.0),
    'ug_sign': M(base=C('3fa7b8'), emit=C('6fe3f5'), estr='neon', emult=0.25, rough=0.4, var=0.0),
    'ug_glass': M(base=C('d5e6ea'), rough=0.04, alpha=0.22, var=0.0, spec=0.9),
    'ug_rail': M(base=C('d6dadd'), rough=0.2, metal=0.9, var=0.0),
    'ug_plant': M(base=C('5f9a3a'), rough=0.8, var=0.3, vscale=0.7),
    'ug_planter': M(base=C('f0eee8'), rough=0.3, var=0.02),
    'rock': M(base=C('8c877e'), rough=0.97, var=0.2, vscale=0.08),
    'liner': M(base=C('e6e4de'), rough=0.35, var=0.03, vscale=0.05, panel=True),
    'grating': M(base=C('c3c7ca'), rough=0.3, metal=0.8, var=0.05),
}
UG_MID = {
    'ug_wall': M(base=C('c9bfa8'), rough=0.55, var=0.08, vscale=0.05, streak=0.2, panel=True),
    'ug_wall2': M(base=C('a99f8a'), rough=0.6, var=0.08, vscale=0.05, streak=0.2),
    'ug_floor': M(base=C('8c8579'), rough=0.45, var=0.08, vscale=0.08),
    'ug_ceiling': M(base=C('9d978b'), rough=0.7, var=0.06),
    'ug_trim': M(base=C('3f7a5c'), rough=0.5, var=0.05),
    'ug_accent': M(base=C('c46a2e'), rough=0.5, var=0.05),
    'ug_pipe': M(base=C('3f6c9a'), rough=0.5, metal=0.3, var=0.1, vscale=0.3),
    'ug_pipe2': M(base=C('c9a23e'), rough=0.5, metal=0.3, var=0.1, vscale=0.3),
    'ug_duct': M(base=C('9ea3a6'), rough=0.45, metal=0.6, var=0.1, vscale=0.3),
    'ug_steel': M(base=C('5b6064'), rough=0.5, metal=0.7, var=0.1, vscale=0.3),
    'ug_col': M(base=C('b8ae98'), rough=0.6, var=0.08, vscale=0.05, streak=0.2),
    'ug_light': M(base=C('fff3df'), emit=C('ffe6c0'), estr='lamp', emult=1.2, rough=0.4, var=0.0),
    'ug_light2': M(base=C('fff3df'), emit=C('fff0d8'), estr='lamp', emult=0.8, rough=0.4, var=0.0),
    'ug_sign': M(base=C('3f7a5c'), emit=C('8dffb8'), estr='neon', emult=0.3, rough=0.4, var=0.0),
    'ug_rail': M(base=C('3f7a5c'), rough=0.5, metal=0.3, var=0.05),
    'ug_planter': M(base=C('8c8579'), rough=0.6, var=0.05),
    'liner': M(base=C('b7ad97'), rough=0.6, var=0.06, vscale=0.05, panel=True),
}

NEW_STYLES = {
    'brut': dict(lit=0.4, panel=(3.5, 6.0), fog=dict(h=0.08, gamma=1.6, d=0.06), trees=('round', 'round', 'conifer')),
    'brut_hewn': dict(lit=0.4, panel=(3.5, 6.0), fog=dict(h=0.08, gamma=1.6, d=0.06), trees=('round', 'round', 'conifer'),
                      bevel=dict(rel=0.15, max=3.6, lo=0.1, top_rel=0.75, top_max=2.4, min_dim=1.0, min_h=0.6,
                                 mats=['bconc', 'bconc_light', 'bconc_dark', 'bconc_warm', 'precast', 'tetra', 'concrete',
                                       'concrete_light', 'concrete_dark', 'deck', 'liner'])),
    'overgrown': dict(lit=0.45, panel=(3.5, 6.0), fog=dict(h=0.22, gamma=1.6, d=0.14),
                      trees=('round', 'round', 'round', 'conifer', 'bush'),
                      foliage=('foliage', 'foliage2', 'foliage3', 'foliage2', 'foliage_lime', 'foliage'),
                      moss=dict(amount=0.9, scale=0.22, lo=0.47, hi=0.53, col=C('6b8a3a'), col2=C('86a349')),
                      ivy=dict(amount=0.0, scale=0.14, lo=0.56, hi=0.6, col=C('3d5f2c'), col2=C('557a34')),
                      algae=0.35,
                      bevel=dict(rel=0.15, max=3.6, lo=0.1, top_rel=0.75, top_max=2.4, min_dim=1.0, min_h=0.6,
                                 mats=['bconc', 'bconc_light', 'bconc_dark', 'bconc_warm', 'precast', 'tetra', 'concrete',
                                       'concrete_light', 'concrete_dark', 'deck', 'liner'])),
    'ug_grit': dict(lit=0.5, panel=(3.5, 4.0), fog=dict(h=0.0, gamma=1.0, d=0.0), algae=0.2),
    'ug_mid': dict(lit=0.5, panel=(3.5, 4.0), fog=dict(h=0.0, gamma=1.0, d=0.0), mats=UG_MID),
    'ug_clean': dict(lit=0.5, panel=(3.5, 4.0), fog=dict(h=0.0, gamma=1.0, d=0.0), mats=UG_CLEAN,
                     bevel=dict(rel=0.12, max=0.9, lo=0.05, top_rel=0.8, top_max=0.6, min_dim=0.5, min_h=0.3, mode='round', seg=3,
                                mats=['ug_wall', 'ug_wall2', 'ug_col', 'ug_planter', 'ug_ceiling', 'liner'])),
    'city': dict(lit=0.4, panel=None, fog=dict(h=0.35, gamma=1.4, d=0.35)),
    'land': dict(lit=0.4, panel=None, fog=dict(h=0.2, gamma=1.5, d=0.55),
                 trees=('round', 'round', 'conifer', 'conifer', 'bush'),
                 foliage=('foliage', 'foliage2', 'foliage3', 'foliage3')),
}
# Stylised, not realist: every study style damps noise / streak / board texture to a trace (flat), keeps crisp edges,
# and gets its character from palette, light and geometry rather than grime.
for _k, _v in NEW_STYLES.items():
    _v.setdefault('flat', 0.28)
    _v.pop('algae', None)
kit.STYLES.update(NEW_STYLES)
kit.MASSING |= {'bblock', 'megaframe', 'tower', 'superblock', 'hangar', 'cblock', 'tetrapod_block', 'hall'}


class MatFactoryX(kit.MatFactory):
    """kit.MatFactory plus: facade windows, moss / ivy / algae, boards, stripes, strata, terrain, fields."""

    def __init__(self, style, env, fog):
        if fog is not None and JOB.get('fog', {}).get('bands'):
            fog = dict(fog)
            fog['bands'] = JOB['fog']['bands']
            if JOB['fog'].get('band_col'):
                fog['band_col'] = JOB['fog']['band_col']
        super().__init__(style, env, fog)

    def _sep(self, B, v):
        s = B.n('ShaderNodeSeparateXYZ'); B.set(s.inputs[0], v)
        return s.outputs['X'], s.outputs['Y'], s.outputs['Z']

    def _comb(self, B, x, y, z):
        c = B.n('ShaderNodeCombineXYZ')
        B.set(c.inputs['X'], x); B.set(c.inputs['Y'], y); B.set(c.inputs['Z'], z)
        return c.outputs[0]

    def _white(self, B, vec):
        w = B.n('ShaderNodeTexWhiteNoise'); w.noise_dimensions = '3D'
        B.set(w.inputs['Vector'], vec)
        return w.outputs['Value'], w.outputs['Color']

    def _sep_rgb(self, B, col):
        s = B.n('ShaderNodeSeparateColor'); B.set(s.inputs[0], col)
        return s.outputs[0], s.outputs[1], s.outputs[2]

    def fog_mix(self, B, shader_out, spec):
        """kit fog plus optional stratified bands: fog['bands'] = [[z_centre, half_width, strength], ...]."""
        f = self.fog
        if not f or spec.get('nofog') or (f['h'] <= 0 and f['d'] <= 0 and not f.get('bands')):
            return shader_out
        geo = B.n('ShaderNodeNewGeometry')
        pos = geo.outputs['Position']
        sep = B.n('ShaderNodeSeparateXYZ'); B.set(sep.inputs[0], pos)
        z = sep.outputs['Z']
        th = B.maprange(z, f['z_lo'], f['z_hi'])
        inv = B.math('SUBTRACT', 1.0, th)
        fh = B.math('MULTIPLY', B.math('POWER', inv, f['gamma']), f['h'])
        for (zc, hw, st) in f.get('bands', []):
            t = B.math('DIVIDE', B.math('SUBTRACT', z, zc), hw)
            bump = B.math('MAXIMUM', B.math('SUBTRACT', 1.0, B.math('MULTIPLY', t, t)), 0.0)
            fh = B.math('ADD', fh, B.math('MULTIPLY', bump, st))
        fh = B.math('MINIMUM', fh, 1.0)
        dep = B.vmath('DOT_PRODUCT', pos, tuple(f['fwd']))
        fd = B.maprange(dep, f['d0'], f['d1'], 0.0, f['d'])
        fac = B.math('SUBTRACT', B.math('ADD', fh, fd), B.math('MULTIPLY', fh, fd), clamp=True)
        col = B.mix(th, f['low'], f['high'])
        if f.get('band_col'):
            col = f['band_col'] if not f.get('h') else col
        em = B.n('ShaderNodeEmission'); B.set(em.inputs['Color'], col); em.inputs['Strength'].default_value = 1.0
        ms = B.n('ShaderNodeMixShader')
        B.set(ms.inputs[0], fac)
        B.nt.links.new(shader_out, ms.inputs[1])
        B.nt.links.new(em.outputs[0], ms.inputs[2])
        return ms.outputs[0]

    def build(self, name):
        spec = self.style.mat(name)
        special = spec.get('hatch') or spec.get('ghost') or spec.get('glow') or spec.get('wire') or spec.get('guide')
        if special:
            return super().build(name)
        env = self.env
        mat = bpy.data.materials.new(name)
        nt = mat.node_tree
        nt.nodes.clear()
        B = kit.NB(nt)
        out = B.n('ShaderNodeOutputMaterial')
        bs = B.n('ShaderNodeBsdfPrincipled')
        base = spec.get('base', (0.5, 0.5, 0.5))
        geo = B.n('ShaderNodeNewGeometry')
        pos = geo.outputs['Position']
        nrm = geo.outputs['Normal']
        px, py, pz = self._sep(B, pos)
        nx, ny, nz = self._sep(B, nrm)
        col = base
        flat = self.style.d.get('flat', 1.0)
        sd = self.style.d
        emis_str = None
        emis_col = None

        if spec.get('strata'):
            wob = B.maprange(B.noise(pos, 0.035, 3.0), 0.3, 0.7, -3.0, 3.0)
            zz = B.math('ADD', pz, wob)
            band = B.math('FLOOR', B.math('MULTIPLY', zz, 1.0 / spec.get('band', 3.2)))
            r, rc = self._white(B, self._comb(B, band, 0.0, 0.0))
            ramp = spec.get('ramp', (C('4a4036'), C('6b5d4c'), C('7d705c'), C('5c5046'), C('8a7d69')))
            c0 = B.mix(B.maprange(r, 0.0, 0.5), ramp[0], ramp[1])
            c1 = B.mix(B.maprange(r, 0.5, 1.0), ramp[2], ramp[3])
            col = B.mix(B.math('GREATER_THAN', r, 0.5), c0, c1)
            fine = B.maprange(B.noise(pos, 0.9, 3.0), 0.3, 0.7, 0.0, 1.0)
            col = B.mix(B.math('MULTIPLY', fine, 0.35), col, tuple(c * 0.6 for c in ramp[0]))
            depth = B.maprange(pz, spec.get('z_dark', -200.0), 0.0, 0.0, 1.0)
            col = B.mix(depth, tuple(c * 0.45 for c in ramp[0]), col)
        if spec.get('terrain'):
            # grass low, forest band, rock on steep slopes, sand at the shore; noise breaks every boundary
            n1 = B.noise(pos, 0.004, 4.0)
            slope = B.maprange(nz, 0.78, 0.93, 1.0, 0.0)
            hz = B.math('ADD', pz, B.maprange(n1, 0.3, 0.7, -12.0, 12.0))
            grass = B.mix(B.maprange(B.noise(pos, 0.012, 3.0), 0.35, 0.65), C('5f8a42'), C('87a052'))
            forest = C('3c5530')
            col = B.mix(B.maprange(hz, 18.0, 40.0), grass, forest)
            col = B.mix(B.maprange(hz, 70.0, 110.0), col, C('7c7a70'))
            col = B.mix(slope, col, C('7b7568'))
            col = B.mix(B.maprange(pz, 0.9, 0.2), col, C('c2b089'))
        if spec.get('fields'):
            vor = B.n('ShaderNodeTexVoronoi')
            B.set(vor.inputs['Vector'], B.vmath('MULTIPLY', pos, (1.0, 1.0, 0.0)))
            vor.inputs['Scale'].default_value = spec.get('fscale', 0.012)
            vor.inputs['Randomness'].default_value = 0.85
            cellc = vor.outputs['Color']
            r, g, b = self._sep_rgb(B, cellc)
            c0 = B.mix(B.maprange(r, 0.0, 0.33), C('a39b5a'), C('7f8f45'))
            c1 = B.mix(B.maprange(g, 0.0, 1.0), C('c2ad6a'), C('6e7f3e'))
            col = B.mix(B.math('GREATER_THAN', b, 0.55), c0, c1)
            col = B.mix(B.math('LESS_THAN', b, 0.12), col, C('7d6a4c'))
            rows = B.math('LESS_THAN', B.math('FRACT', B.math('MULTIPLY', B.math('ADD', px, B.math('MULTIPLY', r, 40.0)), 0.55)), 0.35)
            col = B.mix(B.math('MULTIPLY', rows, 0.18), col, C('4f5a30'))
            edge = B.math('LESS_THAN', vor.outputs['Distance'], 0.0)
        var = spec.get('var', 0.0) * flat
        if var and not spec.get('strata') and not spec.get('terrain') and not spec.get('fields'):
            # stylised: a gentle tonal drift (amplitude ~ var), not the kit's full-range blotches
            nzs = B.noise(pos, spec.get('vscale', 0.1) * 10.0, 2.0)
            fac_v = B.maprange(nzs, 0.3, 0.7, 0.0, min(1.0, var * 2.2))
            col = B.mix(fac_v, base, tuple(c * 0.7 for c in base))
        if spec.get('boards'):
            bh = spec.get('board_h', 0.3)
            fz = B.math('FRACT', B.math('MULTIPLY', pz, 1.0 / bh))
            line = B.math('LESS_THAN', fz, 0.07)
            bid = B.math('FLOOR', B.math('MULTIPLY', pz, 1.0 / bh))
            hx = B.math('FLOOR', B.math('MULTIPLY', B.math('ADD', px, py), 1.0 / 2.4))
            r, _ = self._white(B, self._comb(B, bid, hx, 0.0))
            vert = B.math('LESS_THAN', B.math('ABSOLUTE', nz), 0.5)
            tint = B.math('MULTIPLY', B.math('MULTIPLY', r, spec['boards'] * 0.35 * flat), vert)
            col = B.mix(tint, col, tuple(c * 0.78 for c in base))
            col = B.mix(B.math('MULTIPLY', B.math('MULTIPLY', line, vert), 0.45 * spec['boards'] * flat), col, tuple(c * 0.55 for c in base))
        streak = spec.get('streak', 0.0) * flat
        if streak:
            sc = B.vmath('MULTIPLY', pos, (0.9, 0.9, 0.06))
            nzs = B.noise(sc, 1.8, 4.0)
            s = B.maprange(nzs, 0.45, 0.75, 0.0, streak)
            scol = tuple(c * 0.45 for c in base)
            if sd.get('algae') and (spec.get('weather') or name in WEATHER_OLD):
                scol = (0.05, 0.075, 0.035)
                s = B.math('MULTIPLY', s, 1.0 + sd['algae'])
            col = B.mix(s, col, scol)
        pnl = sd.get('panel')
        if spec.get('panel') and pnl:
            pzz, pxy = pnl
            fz = B.math('FRACT', B.math('MULTIPLY', pz, 1.0 / pzz))
            lz = B.math('LESS_THAN', fz, 0.12 / pzz * 1.6)
            fxy = B.math('FRACT', B.math('MULTIPLY', B.math('ADD', px, py), 1.0 / pxy))
            lxy = B.math('LESS_THAN', fxy, 0.1 / pxy * 1.6)
            vert = B.math('LESS_THAN', B.math('ABSOLUTE', nz), 0.5)
            ln = B.math('MULTIPLY', B.math('MAXIMUM', lz, lxy), vert)
            col = B.mix(B.math('MULTIPLY', ln, 0.55), col, tuple(c * 0.5 for c in base))
        if spec.get('stripes'):
            w, ca, cb = spec['stripes']
            s = B.math('LESS_THAN', B.math('FRACT', B.math('MULTIPLY', B.math('ADD', B.math('ADD', px, py), pz), 1.0 / w)), 0.5)
            col = B.mix(s, cb, ca)
        fac = spec.get('facade')
        if fac:
            ax, ay, az = B.math('ABSOLUTE', nx), B.math('ABSOLUTE', ny), B.math('ABSOLUTE', nz)
            usex = B.math('GREATER_THAN', ay, ax)
            h = B.math('ADD', py, B.math('MULTIPLY', usex, B.math('SUBTRACT', px, py)))
            dco = B.math('ADD', px, B.math('MULTIPLY', usex, B.math('SUBTRACT', py, px)))
            u = B.math('MULTIPLY', h, 1.0 / fac.get('fw', 3.0))
            v = B.math('MULTIPLY', B.math('SUBTRACT', pz, fac.get('z0', 0.0)), 1.0 / fac.get('fh', 3.5))
            fu, fv = B.math('FRACT', u), B.math('FRACT', v)
            cu, cv = B.math('FLOOR', u), B.math('FLOOR', v)
            sill, wh = fac.get('sill', 0.3), fac.get('wh', 0.5)
            iny = B.math('MULTIPLY', B.math('GREATER_THAN', fv, sill), B.math('LESS_THAN', fv, sill + wh))
            if fac.get('band'):
                win = iny
                cu = B.math('FLOOR', B.math('MULTIPLY', u, 1.0 / 3.0))
            else:
                ww = fac.get('ww', 0.5)
                inx = B.math('MULTIPLY', B.math('GREATER_THAN', fu, (1 - ww) / 2), B.math('LESS_THAN', fu, (1 + ww) / 2))
                win = B.math('MULTIPLY', inx, iny)
            vert = B.math('LESS_THAN', az, 0.45)
            win = B.math('MULTIPLY', win, vert)
            r1, rc = self._white(B, self._comb(B, cu, cv, B.math('FLOOR', B.math('MULTIPLY', dco, 0.31))))
            bsz = fac.get('bsz', 35.0)
            rb, _ = self._white(B, self._comb(B, B.math('FLOOR', B.math('MULTIPLY', px, 1.0 / bsz)),
                                              B.math('FLOOR', B.math('MULTIPLY', py, 1.0 / bsz)), 7.0))
            lf = B.math('MULTIPLY', B.maprange(rb, 0.0, 1.0, 0.25, 1.75), sd.get('lit_scale', 1.0) * fac.get('lit', 0.3))
            # whole floors switch on together sometimes
            rf, _ = self._white(B, self._comb(B, cv, B.math('FLOOR', B.math('MULTIPLY', dco, 0.31)), 3.0))
            lf = B.math('ADD', lf, B.math('MULTIPLY', B.math('GREATER_THAN', rf, 0.9), 0.18))
            lit = B.math('LESS_THAN', r1, lf)
            cr, _, _ = self._sep_rgb(B, rc)
            ecol = B.mix(cr, fac.get('c1', C('ffb866')), fac.get('c2', C('ffd9a0')))
            col = B.mix(win, col, fac.get('glass', C('15181b')))
            E = env.get('win', 1.0) * fac.get('emult', 1.0)
            emis_str = B.math('MULTIPLY', B.math('MULTIPLY', win, lit), E)
            emis_col = ecol
        ledge = spec.get('ledge')
        if ledge:
            # stepped megaform faces: up-facing surfaces are ledges (landscape / paving mix), the rest keep the riser look
            up = B.maprange(nz, 0.8, 0.92)
            lc = B.mix(B.maprange(B.noise(pos, ledge.get('scale', 0.004), 3.0), 0.4, 0.6), ledge['a'], ledge['b'])
            if ledge.get('c'):
                lc = B.mix(B.math('GREATER_THAN', B.noise(pos, ledge.get('scale', 0.004) * 2.7, 2.0), 0.62), lc, ledge['c'])
            col = B.mix(up, col, lc)
            if emis_str is not None:
                emis_str = B.math('MULTIPLY', emis_str, B.math('SUBTRACT', 1.0, up))
        far = spec.get('far')
        if far:
            # smooth LOD geometry painted with the same terraces: bands in z, the top of each band is ledge-coloured
            t = B.math('FRACT', B.math('MULTIPLY', B.math('SUBTRACT', pz, far.get('z0', 0.0)), 1.0 / far.get('band', 150.0)))
            isl = B.math('GREATER_THAN', t, 1.0 - far.get('ledge_frac', 0.3))
            upf = B.maprange(nz, 0.35, 0.7)
            lc = B.mix(B.maprange(B.noise(pos, far.get('scale', 0.0015), 3.0), 0.4, 0.6), far['a'], far['b'])
            f2 = B.math('MAXIMUM', B.math('MULTIPLY', isl, B.math('SUBTRACT', 1.0, upf)), upf)
            col = B.mix(f2, col, lc)
            if far.get('win'):
                wv = B.math('MULTIPLY', B.math('SUBTRACT', 1.0, f2), B.math('LESS_THAN', B.math('FRACT', B.math('MULTIPLY', pz, 1.0 / 12.0)), 0.4))
                col = B.mix(B.math('MULTIPLY', wv, far['win']), col, far.get('win_col', C('3a3a3c')))
                if far.get('glow'):
                    emis_col = far.get('glow_col', C('ffb866'))
                    emis_str = B.math('MULTIPLY', wv, far['glow'] * env.get('win', 1.0))
        grid = spec.get('grid')
        if grid:
            g, w = grid.get('g', 40.0), grid.get('w', 0.06)
            ln = None
            for comp, ncomp in ((px, nx), (py, ny), (pz, nz)):
                l = B.math('LESS_THAN', B.math('FRACT', B.math('MULTIPLY', comp, 1.0 / g)), w)
                l = B.math('MULTIPLY', l, B.math('SUBTRACT', 1.0, B.math('ABSOLUTE', ncomp)))
                ln = l if ln is None else B.math('MAXIMUM', ln, l)
            col = B.mix(B.math('GREATER_THAN', ln, 0.5), col, grid.get('line', C('3c3f44')))
        rough = spec.get('rough', 0.8)
        weather = spec.get('weather') or name in WEATHER_OLD
        snow = sd.get('snow')
        if snow and not spec.get('emit') and not spec.get('water') and not spec.get('alpha'):
            up = B.maprange(nz, 0.5, 0.85)
            nzs = B.maprange(B.noise(pos, snow.get('scale', 0.12), 4.0), snow.get('lo', 0.28), snow.get('hi', 0.46))
            hz = B.maprange(pz, snow['z0'], snow['z1'], 0.0, snow.get('amount', 1.0))
            sf = B.math('MULTIPLY', B.math('MULTIPLY', up, nzs), hz, clamp=True)
            col = B.mix(sf, col, C('eef1f6'))
        moss = sd.get('moss')
        if moss and weather:
            up = B.maprange(nz, 0.55, 0.9)
            nzs = B.maprange(B.noise(pos, moss.get('scale', 0.3), 4.0), moss.get('lo', 0.42), moss.get('hi', 0.6))
            mf = B.math('MULTIPLY', B.math('MULTIPLY', up, nzs), moss.get('amount', 0.8), clamp=True)
            mc = B.mix(B.maprange(B.noise(pos, 1.3, 3.0), 0.35, 0.65), moss.get('col', C('5f7a32')), moss.get('col2', C('7f9642')))
            col = B.mix(mf, col, mc)
        ivy = sd.get('ivy')
        if ivy and weather:
            vert = B.maprange(B.math('ABSOLUTE', nz), 0.5, 0.2)
            sc = B.vmath('MULTIPLY', pos, (1.0, 1.0, 0.33))
            nzs = B.maprange(B.noise(sc, ivy.get('scale', 0.2), 5.0), ivy.get('lo', 0.52), ivy.get('hi', 0.6))
            fine = B.maprange(B.noise(pos, 2.2, 2.0), 0.3, 0.7)
            f = B.math('MULTIPLY', B.math('MULTIPLY', vert, nzs), ivy.get('amount', 0.5), clamp=True)
            ic = B.mix(fine, ivy.get('col', C('33502a')), ivy.get('col2', C('4d6d31')))
            col = B.mix(f, col, ic)
        B.set(bs.inputs['Base Color'], col)
        bs.inputs['Roughness'].default_value = rough
        bs.inputs['Metallic'].default_value = spec.get('metal', 0.0)
        if 'spec' in spec:
            bs.inputs['Specular IOR Level'].default_value = spec['spec']
        if spec.get('emit'):
            B.set(bs.inputs['Emission Color'], spec['emit'])
            bs.inputs['Emission Strength'].default_value = env.get(spec.get('estr', 'win'), 1.0) * spec.get('emult', 1.0)
        elif emis_str is not None:
            B.set(bs.inputs['Emission Color'], emis_col)
            B.set(bs.inputs['Emission Strength'], emis_str)
        if spec.get('alpha') is not None:
            bs.inputs['Alpha'].default_value = spec['alpha']
            mat.surface_render_method = 'DITHERED'
        if spec.get('water'):
            bs.inputs['Coat Weight'].default_value = 0.5
        sh = self.fog_mix(B, bs.outputs[0], spec)
        nt.links.new(sh, out.inputs['Surface'])
        return mat


kit.MatFactory = MatFactoryX


# =====================================================================================  camera (adds perspective)
_orig_setup_camera = kit.setup_camera


def setup_camera(scene, pts, job, grid):
    import numpy as np
    camj = job.get('camera', {}) or {}
    if camj.get('type') != 'persp':
        return _orig_setup_camera(scene, pts, job, grid)
    rx, ry = job['res']
    cd = bpy.data.cameras.new('Cam')
    cd.type = 'PERSP'
    cd.sensor_fit = 'HORIZONTAL'
    cd.sensor_width = 36.0
    cd.lens = camj.get('lens', 35.0)
    cam = bpy.data.objects.new('Cam', cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    loc = Vector(camj['loc']); tgt = Vector(camj['target'])
    fwd = (tgt - loc).normalized()
    cam.location = loc
    cam.rotation_euler = fwd.to_track_quat('-Z', 'Y').to_euler()
    right = fwd.cross(Vector((0, 0, 1))).normalized()
    up = right.cross(fwd).normalized()
    cd.shift_x = camj.get('shift', [0, 0])[0]
    cd.shift_y = camj.get('shift', [0, 0])[1]
    sf = pts @ np.array(fwd)
    lf = float(loc.dot(fwd))
    cd.clip_start = camj.get('clip_start', 1.0)
    cd.clip_end = camj.get('clip_end', float(sf.max() - lf + 200.0))
    fov = 2 * math.atan(18.0 / cd.lens)
    info = dict(fwd=tuple(fwd), right=tuple(right), up=tuple(up), cx=0.0, cy=0.0, scale=0.0, fmin=lf,
                d0=max(float(sf.min()), lf), d1=float(sf.max()), res=(rx, ry), persp=True, fov=fov)
    return cam, info


kit.setup_camera = setup_camera
_orig_add_backdrop = kit.add_backdrop


def add_backdrop(scene, cam, info, env):
    if not info.get('persp'):
        return _orig_add_backdrop(scene, cam, info, env)
    rx, ry = info['res']
    dist = cam.data.clip_end - 5.0
    w = 2 * dist * math.tan(info['fov'] / 2) * 1.25 + abs(cam.data.shift_x) * dist * 4
    h = w / (rx / ry) * 1.25 + abs(cam.data.shift_y) * dist * 4
    me = bpy.data.meshes.new('Backdrop')
    me.from_pydata([(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name='UV')
    for li, l in enumerate(me.loops):
        v = me.vertices[l.vertex_index].co
        uv.data[li].uv = ((v.x + w / 2) / w, (v.y + h / 2) / h)
    ob = bpy.data.objects.new('Backdrop', me)
    scene.collection.objects.link(ob)
    ob.parent = cam
    ob.location = (cam.data.shift_x * dist * 2, cam.data.shift_y * dist * 2, -dist)
    for attr in ('visible_shadow', 'visible_diffuse', 'visible_glossy'):
        setattr(ob, attr, False)
    mat = bpy.data.materials.new('backdrop')
    nt = mat.node_tree; nt.nodes.clear(); B = kit.NB(nt)
    out = B.n('ShaderNodeOutputMaterial')
    tc = B.n('ShaderNodeTexCoord')
    sep = B.n('ShaderNodeSeparateXYZ'); B.set(sep.inputs[0], tc.outputs['UV'])
    t = B.maprange(sep.outputs['Y'], env.get('back_lo', 0.0), env.get('back_hi', 1.0))
    col = B.mix(t, env['back_bot'], env['back_top'])
    em = B.n('ShaderNodeEmission'); B.set(em.inputs['Color'], col); em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    me.materials.append(mat)
    return ob


kit.add_backdrop = add_backdrop


# =====================================================================================  world + lights (extra suns, spots, shadows)
def setup_world_and_lights(scene, env, lights, job):
    world = bpy.data.worlds.new('World')
    scene.world = world
    nt = world.node_tree
    bg = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeBackground'][0]
    bg.inputs['Color'].default_value = tuple(env['world']) + (1.0,)
    bg.inputs['Strength'].default_value = env['world_e']

    def sun(name, az, el, color, energy, angle, shadow=True):
        ld = bpy.data.lights.new(name, 'SUN')
        ld.energy = energy
        ld.color = color
        ld.angle = math.radians(angle)
        ld.use_shadow = shadow
        if hasattr(ld, 'use_shadow_jitter'):
            ld.use_shadow_jitter = False
        ob = bpy.data.objects.new(name, ld)
        scene.collection.objects.link(ob)
        a, e = math.radians(az), math.radians(el)
        p = Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)))
        ob.rotation_euler = (-p).to_track_quat('-Z', 'Y').to_euler()
        return ob

    if env.get('sun_e', 0) > 0:
        sun('Sun', env['sun_az'], env['sun_el'], env['sun'], env['sun_e'], env['sun_ang'])
    if env.get('fill', 0) > 0:
        sun('Fill', env['sun_az'] + 150, 35, env['world'], env['sun_e'] * env['fill'] + 0.3 * env['fill'], 30, shadow=False)
    for k, s in enumerate(env.get('suns', [])):
        sun('Sun%d' % k, s['az'], s['el'], tuple(s.get('color', (1, 1, 1))), s.get('e', 1.0), s.get('ang', 5), s.get('shadow', False))
    if env.get('local') and lights:
        sc = env.get('local_scale', 1.0)
        maxn = job.get('max_lights', 200)
        rng = random.Random(7)
        L = list(lights)
        if len(L) > maxn:
            keep = [l for l in L if len(l) > 4 and l[4].get('keep')]
            rest = [l for l in L if not (len(l) > 4 and l[4].get('keep'))]
            L = keep + rng.sample(rest, max(0, maxn - len(keep)))
        for i, l in enumerate(L):
            p, c, pw, r = l[:4]
            opt = l[4] if len(l) > 4 else {}
            if opt.get('spot'):
                ld = bpy.data.lights.new('sp%d' % i, 'SPOT')
                ld.spot_size = math.radians(opt.get('size', 60))
                ld.spot_blend = 0.6
            else:
                ld = bpy.data.lights.new('pt%d' % i, 'POINT')
            ld.energy = pw * sc
            ld.color = c
            ld.shadow_soft_size = r
            ld.use_shadow = bool(opt.get('shadow', False))
            ob = bpy.data.objects.new('L%d' % i, ld)
            ob.location = p
            if opt.get('spot'):
                ob.rotation_euler = Vector(opt['dir']).normalized().to_track_quat('-Z', 'Y').to_euler()
            scene.collection.objects.link(ob)


kit.setup_world_and_lights = setup_world_and_lights


# =====================================================================================  builders
import importlib   # noqa: E402

for modname in ('parts_concrete', 'parts_green', 'parts_under', 'parts_infra', 'parts_city', 'parts_slope', 'parts_scale'):
    try:
        mod = importlib.import_module(modname)
    except ModuleNotFoundError as ex:
        if ex.name == modname:
            continue
        raise
    if hasattr(mod, 'register'):
        mod.register(kit)
    kit.BUILDERS.update(mod.BUILDERS)


import kitscale   # noqa: E402  (instancing, scale materials, run_job_x)
kitscale.register(kit, sys.modules[__name__])


# =====================================================================================  job runner
def load_spec(path):
    with open(path) as fh:
        return json.load(fh)


def prep_job(job, idx):
    job = dict(job)
    for key in ('spec', 'out', 'camera_out'):
        if job.get(key) and not os.path.isabs(job[key]):
            job[key] = os.path.join(HERE, job[key])
    if job.get('drop_tags') or job.get('keep_tags'):
        spec = load_spec(job['spec'])
        drop, keep = set(job.get('drop_tags') or ()), set(job.get('keep_tags') or ())
        parts = []
        for p in spec['parts']:
            tg = set(p.get('tags', []))
            if drop and tg & drop:
                continue
            if keep and not (tg & keep):
                continue
            parts.append(p)
        spec['parts'] = parts
        tmp = os.path.join(HERE, 'out', '_tmp')
        os.makedirs(tmp, exist_ok=True)
        tp = os.path.join(tmp, 'job%03d_%s' % (idx, os.path.basename(job['spec'])))
        with open(tp, 'w') as fh:
            json.dump(spec, fh)
        job['spec'] = tp
    return job


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--jobs', required=True)
    ap.add_argument('--only', default=None)
    a = ap.parse_args(argv)
    jp = a.jobs if os.path.isabs(a.jobs) else os.path.join(HERE, a.jobs)
    with open(jp) as fh:
        jobs = json.load(fh)
    defaults = jobs.get('defaults', {})
    sel = None if a.only is None else set(s for s in a.only.split(','))
    stats = []
    for i, j in enumerate(jobs['jobs']):
        if sel is not None and str(i) not in sel and j.get('name') not in sel:
            continue
        job = dict(defaults)
        job.update({k: v for k, v in j.items() if v is not None})
        job.setdefault('res', [1600, 1000])
        job = prep_job(job, i)
        JOB.clear()
        JOB.update(job)
        t0 = time.time()
        st = kitscale.run_job_x(job)
        st['out'] = os.path.relpath(job['out'], HERE)
        st['wall_s'] = round(time.time() - t0, 2)
        stats.append(st)
    sp = os.path.join(HERE, 'out', 'stats_' + os.path.splitext(os.path.basename(jp))[0] + '.json')
    old = []
    if os.path.exists(sp):
        try:
            old = json.load(open(sp))
        except Exception:
            old = []
    keep = {s['out']: s for s in old}
    for s in stats:
        keep[s['out']] = s
    with open(sp, 'w') as fh:
        json.dump(list(keep.values()), fh, indent=1)


if __name__ == '__main__':
    main()
