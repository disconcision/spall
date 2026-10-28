"""
check.py - validator for agent-authored building types (spec + gameplay logic).

    python3 check.py specs/hydro_capsule_stack.json [--logic logic/hydro_capsule_stack.json] [--json out.json] [--fill]

Two layers:
  STOCK     ../concept-renders/agent_check.py, run unchanged (its vocabulary is extended in memory with kitx_schema).
  EXTENDED  checks this experiment added (see kitx_schema.py / notes):
     * orient-aware boxes (geom.world_box): footprint, overlap and support for sideways (+x/-x/+y/-y) and hanging (-z)
       parts, which the stock checker skips or measures with the wrong box;
     * 'context' tag: host structure a building attaches to (cores, shaft wall, roof, riser).  Rendered in concept views,
       left out of sprites, exempt from the footprint, and it counts as support;
     * connectivity: every part must reach the host (level 0 or a context part) through the support graph;
     * construction steps: every part carries exactly one step:<name> tag from the logic's construction list, and
       each part is supported by parts of the same or an earlier step (so drones can build in that order);
     * footprint.host ('floor' | 'roof' | 'span' | 'wall' | 'ceiling'): for span/wall/ceiling buildings level 0 is not
       ground - every part must reach a context part; 'ambient' tag = people/props that are not construction steps;
     * bridge decks lie below their level like decks; flat parts may bear on a solid's face at their ends;
     * sprite safety: parts thinner than ~1.5 px at 32 px/tile are flagged;
     * logic: the gameplay definition's schema, closed service vocabulary, and consistency with the geometry.
"""
import json, math, os, sys
sys.dont_write_bytecode = True   # never write __pycache__ into ../concept-renders (read-only)

HERE = os.path.dirname(os.path.abspath(__file__))
CR = os.path.normpath(os.path.join(HERE, '..', 'concept-renders'))
sys.path.insert(0, HERE)
sys.path.insert(0, CR)

import kitschema          # noqa: E402 (stock vocabulary, extended in memory below)
import kitx_schema        # noqa: E402
kitx_schema.extend(kitschema)
import agent_check        # noqa: E402 (stock validator, unmodified)
from geom import world_box, base_face, overlap1, FLAT_BELOW  # noqa: E402

PART_TYPES = kitschema.PART_TYPES
NONCARRYING = {'light', 'snow', 'plane', 'figure', 'lamp', 'antenna', 'sign', 'laundry', 'tree', 'rubble', 'builder',
               'vehicle', 'crane', 'turbine', 'waterfall', 'lightwell', 'void', 'lantern', 'vines'}
EXEMPT_SUPPORT = {'light', 'snow', 'plane'}
THIN_OK = {'figure', 'lamp', 'light', 'antenna', 'sign', 'laundry', 'pipe', 'snow', 'plane', 'lantern', 'vines', 'tree',
           'builder', 'turbine', 'crane', 'stairs', 'ramp', 'bridge'}
SERVICES = {'power', 'water', 'air', 'light', 'transit', 'food', 'data', 'waste', 'heat'}


def cat_of(msg):
    m = msg.lower()
    for key, cat in (('unknown part type', 'vocab'), ('not in the palette', 'material'), ('ignored by the renderer', 'param'),
                     ('unknown key', 'schema'), ('missing required', 'schema'), ('must be positive', 'schema'),
                     ('orient must', 'orient'), ('leaves the', 'footprint'), ('exceeds max_levels', 'height'),
                     ('unsupported', 'support'), ('floating', 'support'), ('not attached', 'support'),
                     ('interpenetrate', 'overlap'), ('step', 'steps'), ('built before', 'order'), ('sub-pixel', 'sprite'),
                     ('logic', 'logic'), ('infill covers', 'fill')):
        if key in m:
            return cat
    return 'other'


def extended(spec, logic=None):
    errs, warns, notes = [], [], []
    meta = spec.get('meta', {})
    g = meta.get('grid', {'cell': 4.0, 'level': 3.5})
    cell, lh = g['cell'], g['level']
    parts = spec.get('parts', [])
    fp = meta.get('footprint')
    tol = 0.06 * lh
    boxes = []
    for p in parts:
        try:
            boxes.append(world_box(p, cell, lh) if p.get('type') in PART_TYPES else None)
        except Exception:
            boxes.append(None)
    ctx = [('context' in p.get('tags', [])) for p in parts]
    # footprint.host: what the building attaches to.  'floor' (default): level 0 is a ground/deck/roof surface.
    # 'span' / 'wall' / 'ceiling': nothing is grounded at level 0 - every part must reach a context part.
    host = (fp or {}).get('host', 'floor')
    if host not in ('floor', 'roof', 'span', 'wall', 'ceiling'):
        errs.append('footprint.host must be one of floor, roof, span, wall, ceiling (got %r)' % host)
    if host == 'roof':
        host = 'floor'
    if host != 'floor' and not any(ctx):
        errs.append('footprint.host is %r but the spec has no context parts to attach to' % host)
    oriented = [p.get('orient', 'up') != 'up' for p in parts]

    # ---- footprint + height with true boxes (oriented parts only; the stock pass covers 'up' parts)
    if fp:
        ov = fp.get('overhang', 0.5) * cell
        X0, Y0 = fp.get('x', 0) * cell - ov, fp.get('y', 0) * cell - ov
        X1, Y1 = (fp.get('x', 0) + fp['w']) * cell + ov, (fp.get('y', 0) + fp['d']) * cell + ov
        zmax = fp.get('max_levels', 99) * lh
        zmin = -fp.get('below_levels', 0) * lh
        for i, b in enumerate(boxes):
            if not b or ctx[i] or not oriented[i]:
                continue
            if b[0] < X0 - 1e-6 or b[1] < Y0 - 1e-6 or b[3] > X1 + 1e-6 or b[4] > Y1 + 1e-6:
                errs.append('#%d %s (orient %s): true box leaves the %gx%g footprint + %.1f-cell overhang' %
                            (i, parts[i]['type'], parts[i]['orient'], fp['w'], fp['d'], fp.get('overhang', 0.5)))
            if b[5] > zmax + 1e-6 or b[2] < zmin - 1e-6:
                errs.append('#%d %s (orient %s): true box spans %.1f..%.1f m, outside 0..%.1f m (max_levels)' %
                            (i, parts[i]['type'], parts[i]['orient'], b[2], b[5], zmax))

    # ---- support graph with true boxes (all parts)
    def carries(j):
        return boxes[j] and parts[j]['type'] not in NONCARRYING

    def solid(j):
        return PART_TYPES.get(parts[j]['type'], ('', False))[1] or ctx[j]

    supporters = {i: [] for i in range(len(parts))}
    grounded = set()
    for i, b in enumerate(boxes):
        if not b:
            continue
        t = parts[i]['type']
        if ctx[i] or t in EXEMPT_SUPPORT:
            grounded.add(i)
            continue
        ax, val, sgn = base_face(parts[i], cell, lh)
        if host == 'floor' and ax == 'z' and sgn > 0 and b[2] <= tol:
            grounded.add(i)                              # stands on the host surface (level 0)
        kk = {'x': 0, 'y': 1, 'z': 2}[ax]
        o1, o2 = [q for q in range(3) if q != kk]
        for j, c in enumerate(boxes):
            if i == j or not c or not carries(j):
                continue
            ov_plane = overlap1(b[o1], b[o1 + 3], c[o1], c[o1 + 3]) * overlap1(b[o2], b[o2 + 3], c[o2], c[o2 + 3])
            # 1. grows from c's face (rests on / is bolted to / hangs from its base plane)
            face = c[kk + 3] if sgn > 0 else c[kk]
            if ov_plane > 1e-4 and abs(face - val) <= tol:
                supporters[i].append(j); continue
            # 2. base plane embedded in a solid (terrace on a deck, stair foot in a slab)
            if ov_plane > 1e-4 and c[kk] - 1e-6 <= val <= c[kk + 3] + 1e-6 and solid(j) and not (
                    b[kk] >= c[kk] - 1e-6 and b[kk + 3] <= c[kk + 3] + 1e-6 and ax != 'z'):
                supporters[i].append(j); continue
            if parts[i]['type'] in FLAT_BELOW and solid(j):
                # 5. a deck/slab/bridge end bearing on a wall, core or column face (any thickness)
                tx = (abs(b[0] - c[3]) < 0.05 or abs(b[3] - c[0]) < 0.05) and overlap1(b[1], b[4], c[1], c[4]) > 0.2
                ty = (abs(b[1] - c[4]) < 0.05 or abs(b[4] - c[1]) < 0.05) and overlap1(b[0], b[3], c[0], c[3]) > 0.2
                if (tx or ty) and overlap1(b[2], b[5], c[2], c[5]) > 0.1:
                    supporters[i].append(j); continue
            if ax == 'z' and sgn > 0:
                xy = overlap1(b[0], b[3], c[0], c[3]) * overlap1(b[1], b[4], c[1], c[4])
                # 3. hangs from a solid directly above its top
                if xy > 1e-4 and abs(c[2] - b[5]) <= tol + 0.3 and solid(j):
                    supporters[i].append(j); continue
                # 4. cantilevered: bolted laterally to a carrying part over > 0.5 m of height (as the stock rule)
                tx = (abs(b[0] - c[3]) < 0.05 or abs(b[3] - c[0]) < 0.05) and overlap1(b[1], b[4], c[1], c[4]) > 0
                ty = (abs(b[1] - c[4]) < 0.05 or abs(b[4] - c[1]) < 0.05) and overlap1(b[0], b[3], c[0], c[3]) > 0
                if (tx or ty) and overlap1(b[2], b[5], c[2], c[5]) > 0.5:
                    supporters[i].append(j); continue
    # connectivity from the host
    reached = set(grounded)
    changed = True
    while changed:
        changed = False
        for i in range(len(parts)):
            if i not in reached and boxes[i] and any(j in reached for j in supporters[i]):
                reached.add(i); changed = True
    for i, b in enumerate(boxes):
        if b and i not in reached:
            t = parts[i]['type']
            if supporters[i]:
                errs.append('#%d %s: floating cluster - supported only by parts that never reach the host (%s)' %
                            (i, t, ', '.join('#%d %s' % (j, parts[j]['type']) for j in supporters[i][:3])))
            else:
                ax, val, sgn = base_face(parts[i], cell, lh)
                errs.append('#%d %s: not attached - its base face (%s=%.2f m, orient %s) touches no carrying part' %
                            (i, t, ax, val, parts[i].get('orient', 'up')))

    # ---- overlaps between solids with true boxes (only pairs involving an oriented part; stock covers the rest)
    sidx = [i for i, b in enumerate(boxes) if b and PART_TYPES[parts[i]['type']][1] and not ctx[i]]
    for a in range(len(sidx)):
        for c_ in range(a + 1, len(sidx)):
            i, j = sidx[a], sidx[c_]
            if not (oriented[i] or oriented[j]):
                continue
            if {parts[i]['type'], parts[j]['type']} & {'megacolumn', 'column', 'ground', 'block', 'core'}:
                continue
            bi, bj = boxes[i], boxes[j]
            v = overlap1(bi[0], bi[3], bj[0], bj[3]) * overlap1(bi[1], bi[4], bj[1], bj[4]) * overlap1(bi[2], bi[5], bj[2], bj[5])
            if v > 1.0:
                warns.append('#%d %s and #%d %s interpenetrate (%.1f m3, true boxes)' % (i, parts[i]['type'], j, parts[j]['type'], v))

    # ---- sprite safety at 32 px/tile (1 px = 0.177 m)
    for i, p in enumerate(parts):
        if not boxes[i] or ctx[i] or p['type'] in THIN_OK:
            continue
        b = boxes[i]
        dims = sorted([b[3] - b[0], b[4] - b[1], b[5] - b[2]])
        if p['type'] not in FLAT_BELOW and dims[0] < 0.26 and dims[1] < 1.0:
            warns.append('#%d %s: %.2f x %.2f m section is sub-pixel at 32 px/tile (1 px = 0.18 m); it will flicker or vanish' %
                         (i, p['type'], dims[0], dims[1]))

    # ---- construction steps and build order
    steps = []
    if logic:
        steps = [s['name'] for s in logic.get('construction', [])]
    else:
        steps = [s if isinstance(s, str) else s.get('name') for s in (meta.get('logic', {}) or {}).get('blueprint_steps', [])]
    if steps:
        order = {s: k for k, s in enumerate(steps)}
        pstep = {}
        used = set()
        for i, p in enumerate(parts):
            if ctx[i] or 'ambient' in p.get('tags', []):
                continue
            st = [t[5:] for t in p.get('tags', []) if t.startswith('step:')]
            if len(st) != 1:
                errs.append('#%d %s: needs exactly one step:<name> tag (has %d)' % (i, p['type'], len(st)))
                continue
            if st[0] not in order:
                errs.append('#%d %s: step "%s" is not in the construction list %s' % (i, p['type'], st[0], steps))
                continue
            pstep[i] = order[st[0]]
            used.add(st[0])
        for s in steps:
            if s not in used:
                warns.append('construction step "%s" has no parts (drones would have nothing to build)' % s)
        for i, k in pstep.items():
            if i in grounded:
                continue
            ok = [j for j in supporters[i] if ctx[j] or pstep.get(j, 999) <= k]
            if supporters[i] and not ok:
                j = supporters[i][0]
                errs.append('#%d %s (step "%s") would be built before its support #%d %s (step "%s")' %
                            (i, parts[i]['type'], steps[k], j, parts[j]['type'], steps[pstep[j]] if j in pstep else '?'))
    notes.append('%d parts (%d context), %d oriented; %d attach to the host directly' %
                 (len(parts), sum(ctx), sum(1 for i in range(len(parts)) if oriented[i]), len(grounded) - sum(ctx)))
    return errs, warns, notes, dict(supporters=supporters, grounded=sorted(grounded), boxes=boxes)


def check_logic(spec, logic):
    """Gameplay definition: schema, closed vocabularies, consistency with the geometry."""
    errs, warns = [], []
    need = ['id', 'spec', 'title', 'category', 'footprint', 'placement', 'capacity', 'jobs', 'services', 'effects',
            'economy', 'construction']
    for k in need:
        if k not in logic:
            errs.append('logic: missing "%s"' % k)
    if errs:
        return errs, warns
    meta = spec['meta']
    fp = meta.get('footprint', {})
    lf = logic['footprint']
    if [lf.get('cells_w'), lf.get('cells_d')] != [fp.get('w'), fp.get('d')]:
        errs.append('logic: footprint cells %sx%s != spec footprint %sx%s' % (lf.get('cells_w'), lf.get('cells_d'), fp.get('w'), fp.get('d')))
    if lf.get('levels') != fp.get('max_levels'):
        errs.append('logic: footprint levels %s != spec max_levels %s' % (lf.get('levels'), fp.get('max_levels')))
    g = meta.get('grid', {'cell': 4.0, 'level': 3.5})
    tops = [world_box(p, g['cell'], g['level'])[5] for p in spec['parts'] if 'context' not in p.get('tags', [])
            and p['type'] not in ('antenna', 'turbine', 'crane', 'light', 'tree')]
    used_levels = math.ceil(max(tops) / g['level'] - 1e-6) if tops else 0
    if used_levels > lf.get('levels', 0):
        errs.append('logic: geometry uses %d levels but footprint declares %s' % (used_levels, lf.get('levels')))
    sv = logic['services']
    for side in ('needs', 'provides'):
        for k in sv.get(side, {}):
            if k not in SERVICES:
                errs.append('logic: service "%s" in %s is not one of %s' % (k, side, sorted(SERVICES)))
    for k, v in logic['effects'].items():
        if k not in ('light_air', 'land_value', 'noise', 'pollution', 'safety', 'footfall'):
            warns.append('logic: effect "%s" is not simulated yet' % k)
        if isinstance(v, dict) and 'radius_cells' in v and not (0 <= v['radius_cells'] <= 12):
            errs.append('logic: effect %s radius %s out of range 0..12 cells' % (k, v['radius_cells']))
    j = logic['jobs']
    if j.get('total', 0) != sum(r.get('n', 0) for r in j.get('roles', [])):
        errs.append('logic: jobs.total %s != sum of roles %s' % (j.get('total'), sum(r.get('n', 0) for r in j.get('roles', []))))
    names = [s['name'] for s in logic['construction']]
    if len(set(names)) != len(names):
        errs.append('logic: duplicate construction step names')
    for s in logic['construction']:
        for k in ('name', 'drones', 'days'):
            if k not in s:
                errs.append('logic: construction step %s is missing "%s"' % (s.get('name', '?'), k))
    days = sum(s.get('days', 0) for s in logic['construction'])
    if abs(days - logic['economy'].get('build_days', days)) > 1e-6:
        errs.append('logic: construction days sum to %s but economy.build_days is %s' % (days, logic['economy'].get('build_days')))
    return errs, warns


def run(spec_path, logic_path=None, fill=False):
    spec = json.load(open(spec_path))
    logic = json.load(open(logic_path)) if logic_path and os.path.exists(logic_path) else None
    se, sw, sn = agent_check.check(spec, fill)
    # the stock checker has no notion of context parts: report what it says, but tag errors caused only by context parts
    ctx_idx = {i for i, p in enumerate(spec['parts']) if 'context' in p.get('tags', [])}
    stock_ctx = [e for e in se if e.startswith('#') and int(e[1:].split()[0]) in ctx_idx]
    ee, ew, en, info = extended(spec, logic)
    le, lw = check_logic(spec, logic) if logic else ([], [])
    # final verdict: stock errors on non-context parts that the orient-aware pass does not overrule, plus extended + logic
    oriented = {i for i, p in enumerate(spec['parts']) if p.get('orient', 'up') != 'up'}
    keep_stock, overruled = [], []
    reached = set(info['grounded'])
    ch = True
    while ch:
        ch = False
        for i, sup in info['supporters'].items():
            if i not in reached and any(j in reached for j in sup):
                reached.add(i); ch = True
    for e in se:
        if e.startswith('#'):
            i = int(e[1:].split()[0])
            if i in ctx_idx or (i in oriented and ('leaves the' in e or 'exceeds max_levels' in e)):
                continue
            if 'unsupported' in e and i in reached:
                overruled.append(e)          # held by host structure (context) the stock checker cannot see
                continue
        keep_stock.append(e)
    errs = keep_stock + ee + le
    warns = sw + ew + lw
    res = dict(spec=os.path.relpath(spec_path, HERE), revision=spec['meta'].get('revision'),
               stock=dict(errors=se, warnings=sw, notes=sn, pass_=not se, context_errors=len(stock_ctx), overruled=overruled),
               extended=dict(errors=ee, warnings=ew, notes=en), logic=dict(errors=le, warnings=lw),
               errors=errs, warnings=warns, pass_=not errs,
               categories={})
    for e in errs:
        res['categories'][cat_of(e)] = res['categories'].get(cat_of(e), 0) + 1
    return res


def fmt(res):
    L = ['validate %s  (revision %s)' % (res['spec'], res['revision'])]
    st = res['stock']
    L.append('  stock agent_check.py: %s (%d errors%s, %d warnings)' % (
        'PASS' if st['pass_'] else 'FAIL', len(st['errors']),
        (', %d of them on context parts' % st['context_errors']) if st['context_errors'] else '', len(st['warnings'])))
    for e in st.get('overruled', []):
        L.append('  (stock support error overruled - part is attached to host/context structure: %s)' % e)
    for e in res['errors']:
        L.append('  ERROR  ' + e)
    for w in res['warnings']:
        L.append('  warn   ' + w)
    for n in res['extended']['notes'] + [n for n in st['notes'] if 'parts (' in n or 'fill cap' in n]:
        L.append('  note   ' + n)
    L.append('  => %s (%d errors, %d warnings)' % ('PASS' if res['pass_'] else 'FAIL', len(res['errors']), len(res['warnings'])))
    return '\n'.join(L)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:]]
    fill = '--fill' in args
    logic_path = args[args.index('--logic') + 1] if '--logic' in args else None
    jpath = args[args.index('--json') + 1] if '--json' in args else None
    specs = [a for i, a in enumerate(args) if not a.startswith('--') and (i == 0 or args[i - 1] not in ('--logic', '--json'))]
    ok = True
    for sp in specs:
        lp = logic_path
        if lp is None:
            guess = os.path.join(HERE, 'logic', os.path.basename(sp).split('.')[0] + '.json')
            lp = guess if os.path.exists(guess) else None
        r = run(sp, lp, fill)
        print(fmt(r))
        ok &= r['pass_']
        if jpath:
            with open(jpath, 'w') as fh:
                json.dump({k: v for k, v in r.items()}, fh, indent=1)
    sys.exit(0 if ok else 1)
