"""
agent_check.py - validate a kit-of-parts spec before it is rendered or admitted into the game.

    python3 agent_check.py specs/agent_vertical_farm.v1.json      # prints a report, exit 1 on errors
    python3 agent_check.py specs/arcology.json --fill               # also checks the Friedman fill cap per level

Checks (cheap, deterministic, suitable as tool feedback for an LLM author):
  1. schema: required keys, numeric fields, unknown keys
  2. vocabulary: part type, params and material must exist in kitschema (closest-name suggestions)
  3. footprint: parts must stay inside the declared footprint + overhang allowance and under max_levels
  4. support: every part must rest on the ground / another part's top, or attach laterally (cantilever)
  5. overlap: solid parts must not interpenetrate (small tolerance)
  6. fill cap (optional): infill footprint per level <= 50% of the deck area beneath it
"""
import difflib, json, math, sys
from kitschema import PART_TYPES, MATERIALS, PART_KEYS, ORIENTS, ALIASES, MAT_ALIASES

FLAT_BELOW = {'deck', 'slab', 'floor', 'ground', 'viaduct'}  # solid lies below the part level


def nominal_box(p, cell, lh):
    """(x0,y0,z0,x1,y1,z1) in metres of the part's nominal volume (ignores orient for sideways parts)."""
    x0, y0 = p.get('x', 0) * cell, p.get('y', 0) * cell
    w, d = p.get('w', 1) * cell, p.get('d', 1) * cell
    z = p.get('level', 0) * lh
    h = p.get('h', 1) * lh
    if p['type'] in FLAT_BELOW:
        t = (p.get('params') or {}).get('t', {'deck': 1.0, 'ground': 2.0, 'viaduct': 1.4}.get(p['type'], 0.35))
        return (x0, y0, z - t, x0 + w, y0 + d, z)
    return (x0, y0, z, x0 + w, y0 + d, z + h)


def overlap1(a0, a1, b0, b1):
    return max(0.0, min(a1, b1) - max(a0, b0))


def check(spec, fill=False):
    errs, warns, notes = [], [], []
    meta = spec.get('meta', {})
    grid = meta.get('grid', {'cell': 4.0, 'level': 3.5})
    cell, lh = grid['cell'], grid['level']
    parts = spec.get('parts', [])
    fp = meta.get('footprint')
    boxes = []
    for i, p in enumerate(parts):
        tag = '#%d %s' % (i, p.get('type', '?'))
        for k in ('type', 'x', 'y', 'level', 'w', 'd', 'h'):
            if k not in p:
                errs.append('%s: missing required field "%s"' % (tag, k))
        for k in p:
            if k not in PART_KEYS:
                warns.append('%s: unknown key "%s"' % (tag, k))
        t = p.get('type')
        if t not in PART_TYPES:
            words = str(t).lower().replace('-', '_').split('_') + [str(t).lower()]
            sug = sorted({ALIASES[w] for w in words if w in ALIASES})
            sug = sug or difflib.get_close_matches(str(t), list(PART_TYPES), n=2, cutoff=0.3)
            errs.append('%s: unknown part type "%s"%s' % (tag, t, (' (did you mean %s?)' % ' / '.join(sug)) if sug else ''))
            boxes.append(None)
            continue
        role, solid, allowed = PART_TYPES[t]
        for k in (p.get('params') or {}):
            if k not in allowed:
                pre = sorted((x for x in allowed if k.startswith(x) or x.startswith(k)), key=len)
                sug = pre[:1] or difflib.get_close_matches(k, list(allowed), n=1, cutoff=0.4)
                warns.append('%s: param "%s" is ignored by the renderer%s' % (tag, k, (' (did you mean "%s"?)' % sug[0]) if sug else ''))
        m = p.get('material')
        if m and m not in MATERIALS:
            sug = [MAT_ALIASES[m]] if m in MAT_ALIASES else difflib.get_close_matches(m, list(MATERIALS), n=2, cutoff=0.3)
            errs.append('%s: material "%s" is not in the palette%s' % (tag, m, (' (try %s)' % ' / '.join(sug)) if sug else ''))
        if p.get('orient', 'up') not in ORIENTS:
            errs.append('%s: orient must be one of %s' % (tag, sorted(ORIENTS)))
        if any(k not in p for k in ('x', 'y', 'level', 'w', 'd', 'h')):
            boxes.append(None)
            continue
        if min(p['w'], p['d'], p['h']) <= 0:
            errs.append('%s: w, d and h must be positive' % tag)
        boxes.append(nominal_box(p, cell, lh))
    # footprint
    if fp:
        ov = fp.get('overhang', 0.5) * cell
        X0, Y0 = fp.get('x', 0) * cell - ov, fp.get('y', 0) * cell - ov
        X1, Y1 = (fp.get('x', 0) + fp['w']) * cell + ov, (fp.get('y', 0) + fp['d']) * cell + ov
        zmax = fp.get('max_levels', 99) * lh
        for i, b in enumerate(boxes):
            if not b:
                continue
            if b[0] < X0 - 1e-6 or b[1] < Y0 - 1e-6 or b[3] > X1 + 1e-6 or b[4] > Y1 + 1e-6:
                errs.append('#%d %s: leaves the %gx%g footprint by more than the %.1f-cell overhang allowance' %
                            (i, parts[i]['type'], fp['w'], fp['d'], fp.get('overhang', 0.5)))
            if b[5] > zmax + 1e-6 and parts[i]['type'] not in ('antenna', 'turbine', 'crane'):
                errs.append('#%d %s: top at %.1f m exceeds max_levels (%.1f m)' % (i, parts[i]['type'], b[5], zmax))
    # support
    tol = 0.06 * lh
    for i, b in enumerate(boxes):
        if not b or parts[i].get('orient', 'up') != 'up':
            continue
        t = parts[i]['type']
        if t in ('light', 'snow', 'plane'):
            continue
        base = b[2]
        if base <= tol:
            continue
        ok = False
        for j, c in enumerate(boxes):
            if i == j or not c:
                continue
            xy = overlap1(b[0], b[3], c[0], c[3]) * overlap1(b[1], b[4], c[1], c[4])
            if xy > 0 and abs(c[5] - base) <= tol:
                ok = True; break          # rests on c
            if xy > 0 and c[2] < base < c[5] and PART_TYPES.get(parts[j]['type'], ('', False))[1]:
                ok = True; break          # sits inside/on a solid (e.g. terrace on a deck)
            if xy > 0 and abs(c[2] - b[5]) <= tol + 0.3 and PART_TYPES.get(parts[j]['type'], ('', False))[1]:
                ok = True; notes.append('#%d %s: hangs from #%d %s' % (i, t, j, parts[j]['type'])); break
            touch_x = (abs(b[0] - c[3]) < 0.05 or abs(b[3] - c[0]) < 0.05) and overlap1(b[1], b[4], c[1], c[4]) > 0
            touch_y = (abs(b[1] - c[4]) < 0.05 or abs(b[4] - c[1]) < 0.05) and overlap1(b[0], b[3], c[0], c[3]) > 0
            if (touch_x or touch_y) and overlap1(b[2], b[5], c[2], c[5]) > 0.5:
                ok = True; notes.append('#%d %s: cantilevered off #%d %s' % (i, t, j, parts[j]['type'])); break
        if not ok:
            below = max([c[5] for j, c in enumerate(boxes) if c and j != i and c[5] < base and
                         overlap1(b[0], b[3], c[0], c[3]) * overlap1(b[1], b[4], c[1], c[4]) > 0] or [0.0])
            errs.append('#%d %s: unsupported - its base is at %.2f m but the nearest top below is at %.2f m (gap %.2f m = %.2f levels)'
                        % (i, t, base, below, base - below, (base - below) / lh))
    # overlaps between solids
    solid_idx = [i for i, b in enumerate(boxes) if b and PART_TYPES[parts[i]['type']][1]]
    for a in range(len(solid_idx)):
        for c in range(a + 1, len(solid_idx)):
            i, j = solid_idx[a], solid_idx[c]
            bi, bj = boxes[i], boxes[j]
            v = overlap1(bi[0], bi[3], bj[0], bj[3]) * overlap1(bi[1], bi[4], bj[1], bj[4]) * overlap1(bi[2], bi[5], bj[2], bj[5])
            ti, tj = parts[i]['type'], parts[j]['type']
            if {ti, tj} & {'megacolumn', 'column', 'ground', 'block', 'core'}:
                continue                      # cores and columns penetrate slabs by design
            if ti in FLAT_BELOW or tj in FLAT_BELOW:
                dk, ot = (bi, bj) if ti in FLAT_BELOW else (bj, bi)
                if dk[2] - 0.05 <= ot[5] <= dk[5] + 0.05:
                    continue                  # the storey below tucks under the slab (slab = its ceiling)
            if v > 1.0:
                warns.append('#%d %s and #%d %s interpenetrate (%.1f m3)' % (i, parts[i]['type'], j, parts[j]['type'], v))
    # Friedman fill cap
    if fill:
        decks = [(boxes[i], parts[i]) for i in range(len(parts)) if boxes[i] and parts[i]['type'] in ('deck', 'ground')]
        levels = {}
        for i, p in enumerate(parts):
            if boxes[i] and PART_TYPES.get(p['type'], ('',))[0] == 'infill' and p.get('orient', 'up') == 'up':
                lv0, lv1 = int(math.floor(p['level'] + 1e-6)), int(math.ceil(p['level'] + p['h'] - 1e-6))
                for lv in range(lv0, lv1):
                    levels.setdefault(lv, 0.0)
                    levels[lv] += p['w'] * p['d']
        worst = 0.0
        for lv, a in sorted(levels.items()):
            # deck area under this level: the nearest deck/ground whose top is at or below lv
            tops = sorted({round(bp['level']) for bb, bp in decks if bp['level'] <= lv + 1e-6})
            if not tops:
                continue
            L = tops[-1]
            area = sum(bp['w'] * bp['d'] for bb, bp in decks if round(bp['level']) == L and bp['type'] == 'deck') or \
                sum(1 for _ in range(0))
            if area <= 0:
                continue
            ratio = a / area
            worst = max(worst, ratio)
            if ratio > 0.5 + 1e-6:
                errs.append('level %d: infill covers %.0f%% of the deck below (cap 50%%)' % (lv, 100 * ratio))
        notes.append('fill cap: worst level covers %.0f%% of its deck (cap 50%%)' % (100 * worst))
    roles = {}
    for p in parts:
        r = PART_TYPES.get(p.get('type'), ('unknown',))[0]
        roles[r] = roles.get(r, 0) + 1
    valid = [b for b in boxes if b]
    if valid:
        top = max(b[5] for b in valid)
        notes.append('%d parts (%s); height %.1f m' % (len(parts), ', '.join('%s %d' % kv for kv in sorted(roles.items())), top))
    return errs, warns, notes


def report(path, fill=False):
    spec = json.load(open(path))
    errs, warns, notes = check(spec, fill)
    lines = ['validate %s  (revision %s)' % (path, spec.get('meta', {}).get('revision', '-'))]
    for e in errs:
        lines.append('  ERROR  ' + e)
    for w in warns:
        lines.append('  warn   ' + w)
    attach = [n for n in notes if 'cantilevered off' in n or 'hangs from' in n]
    other = [n for n in notes if n not in attach]
    if len(attach) > 6:
        other.insert(0, '%d parts attach laterally or hang (e.g. %s)' % (len(attach), '; '.join(a_.split(': ', 1)[1] for a_ in attach[:2])))
        attach = []
    for n in attach + other:
        lines.append('  note   ' + n)
    lines.append('  => %s (%d errors, %d warnings)' % ('PASS' if not errs else 'FAIL', len(errs), len(warns)))
    return '\n'.join(lines), not errs


if __name__ == '__main__':
    fill = '--fill' in sys.argv
    ok_all = True
    for pth in [a for a in sys.argv[1:] if not a.startswith('--')]:
        txt, ok = report(pth, fill)
        print(txt)
        ok_all &= ok
    sys.exit(0 if ok_all else 1)
