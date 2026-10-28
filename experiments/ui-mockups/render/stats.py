"""stats.py - per-level numbers derived from the arcology spec (fill, dwellings, residents, daylight access).
Writes out/levels.json; the HTML mock-ups quote these numbers."""
import json, math, os, collections
HERE = os.path.dirname(os.path.abspath(__file__))
spec = json.load(open(os.path.join(HERE, '..', '..', 'concept-renders', 'specs', 'arcology.json')))
P = spec['parts']
def cells(p):
    x0, y0, w, d = p['x'], p['y'], p.get('w', 1), p.get('d', 1)
    return [(x, y) for x in range(math.floor(x0 + 1e-6), math.ceil(x0 + w - 1e-6)) for y in range(math.floor(y0 + 1e-6), math.ceil(y0 + d - 1e-6))]
occ = collections.defaultdict(set)      # capsule cells per level
block = collections.defaultdict(set)    # anything that blocks sky (decks, capsules, cores, columns)
void = set()
for p in P:
    t, L0, h = p['type'], p.get('level', 0), p.get('h', 1)
    if t == 'lightwell':
        void |= set(cells(p)); continue
    if t in ('capsule',):
        for L in range(math.floor(L0), math.ceil(L0 + h - 1e-6)):
            occ[L] |= set(cells(p)); block[L] |= set(cells(p))
    elif t in ('deck', 'core', 'megacolumn', 'terrace'):
        for L in range(math.floor(L0), max(math.floor(L0) + 1, math.ceil(L0 + h - 1e-6))):
            block[L] |= set(cells(p))
levels = []
tot = 0
for L in range(0, 26):
    cs = occ[L]
    n = len(cs)
    lit = 0
    for (x, y) in cs:
        sky = not any((x, y) in block[k] for k in range(L + 1, 27))
        facade = x <= 0 or x >= 19 or y <= 0 or y >= 15
        nearvoid = any((x + dx, y + dy) in void for dx in (-1, 0, 1) for dy in (-1, 0, 1))
        if sky or facade or nearvoid:
            lit += 1
    fill = spec['meta']['fill_per_level'].get(str(L), 0.0)
    res = round(n * 1.9)                  # ~1.9 residents per 16 m2 capsule cell
    tot += res
    levels.append(dict(level=L, fill=fill, cells=n, residents=res, light=round(100 * lit / n) if n else None))
json.dump(dict(levels=levels, residents=tot), open(os.path.join(HERE, 'out', 'levels.json'), 'w'), indent=1)
for l in levels:
    print(l)
print('total residents', tot)
