"""
stats.py - summarise the authoring log (log/iterations.jsonl) into out/stats.json and a panel image (out/log_panel.png).

Counts come from the log; the root-cause label for each problem (my mistake / validator blind spot / kit limit /
renderer-palette issue) is taken from the issue tags I recorded at each 'look' step, plus the MISTAKES table below,
which lists every concrete authoring mistake with the draft where it happened and what caught it.
"""
import json, os, sys
sys.dont_write_bytecode = True   # never write __pycache__ into ../concept-renders (read-only)
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'concept-renders'))
from sprites import font

IDS = ['hydro_stack', 'bridge_market', 'hanging_garden', 'tube_interchange', 'solar_chimney', 'rooftop_village']
SHORT = {'hydro_stack': '(a) hydro stack', 'bridge_market': '(b) bridge market', 'hanging_garden': '(c) hanging garden',
         'tube_interchange': '(d) tube interchange', 'solar_chimney': '(e) solar chimney', 'rooftop_village': '(f) rooftop village'}

# every concrete authoring mistake I made, where, its class, and what caught it
MISTAKES = [
    ('hydro_stack', 'v1', 'height', 'header tank on top of the core: stack needs 5.5 levels, declared 5 (would not fit the undercroft)', 'validator (+logic cross-check)'),
    ('bridge_market', 'v1', 'scale', 'counters + slab canopies on 0.28 m posts read as floating tables over crates', 'looking'),
    ('bridge_market', 'v1', 'orientation', 'front stall row turned its backs to the r0 camera and hid the aisle', 'looking'),
    ('hanging_garden', 'v1', 'orientation', 'garden grew off the +x face, which every light preset leaves in shadow', 'looking'),
    ('hanging_garden', 'v2', 'floating', 'irrigation riser placed just past the trellis end, touching it only along an edge', 'validator (build-order check)'),
    ('tube_interchange', 'v1', 'floating', 'upper platform 12.5 m up had no supports of its own', 'validator'),
    ('tube_interchange', 'v1', 'overlap', 'stair flight ran straight through the concourse hall', 'my own review (validator blind: stairs are non-solid)'),
    ('tube_interchange', 'v1', 'circulation', 'stair top landed 0.6 m short of platform A, in mid-air', 'my own review (not checkable yet)'),
    ('tube_interchange', 'v2', 'floating', 'the landing slab I added was itself unsupported', 'validator'),
    ('tube_interchange', 'v3', 'orientation', 'lift tower on the SE corner sat on the r0 sight-line and hid the crossing', 'looking'),
    ('tube_interchange', 'v3', 'scale', 'concourse kiosk toy-sized next to 4 m tubes', 'looking'),
    ('solar_chimney', 'v1', 'overlap', 'roof collar at level 6.03 sank 0.2 m into the host roof deck', 'validator (stock overlap warning)'),
    ('solar_chimney', 'v3', 'height', 'new chimney stack topped out at 25.2 m over a 24.5 m (7-level) declaration', 'validator (+logic cross-check)'),
]
# problems that were NOT my geometry mistakes
OTHER = [
    ('validator blind spot', 'stock checker has no host/context notion: 11-42 errors per spec on host parts (cores, walls, decks, roofs)'),
    ('validator blind spot', 'stock checker cannot see bridges/walkways bearing between two parts (bridge not a flat type, 0.5 m lateral rule)'),
    ('validator blind spot', 'stock checker measures sideways/hanging parts with the upright box (false height errors; blind to their support)'),
    ('validator blind spot', 'stock schema bug: "wall" uses the block builder but rejects its rib_w/rib_d params'),
    ('validator blind spot', 'non-solid parts (stairs, bridges, greenhouses, lift frames) are never overlap-checked'),
    ('kit limit', 'no sprite-safe glazing: greenhouse glass + grow-lights vanish/speckle at 32 px -> growpod part'),
    ('kit limit', 'no lantern or string-light part (antenna beacons = 2 px dots) -> lantern part'),
    ('kit limit', 'vines only as lightwell rims, random 2-9 m, pole-like -> vines part (climbing / trailing)'),
    ('kit limit', 'no mirror/heliostat: solar panels recoloured via an undocumented meta.style_overrides remap'),
    ('kit limit', 'no market stall/awning, bracket, ladder, landing or door parts (composed from shacks, ramps, stairs, slabs)'),
    ('kit limit', 'stock lightwell glow is BLENDED transparency: invisible or hazy in 32 px sprites'),
    ('renderer/palette', 'stock growlight renders (238,209,230) under AgX and locks to white -> calibrated growlight_px'),
    ('renderer/palette', 'dithered-alpha glass becomes kit64 noise -> sprite jobs remap to opaque calibrated glass_px (then re-tuned to lock blue)'),
    ('renderer/palette', 'emissives shared the "lamp" strength (x5 at dusk) and bleached -> own "lantern" emission key'),
    ('renderer/palette', '"lamp" core washed to white -> calibrated sunpipe_px warm yellow'),
    ('renderer/palette', 'nearest-colour kit64 lock speckles mottled greys/whites (stock farm too) - not fixed'),
    ('camera/framing', 'fixed 2:1 camera: a core taller than a bridge always hides its near end (concept: frontal camera; mock: low east core)'),
]


def main():
    rows = [json.loads(l) for l in open(os.path.join(HERE, 'log', 'iterations.jsonl'))]
    per = {}
    for bid in IDS:
        R = [r for r in rows if r.get('id') == bid]
        checks = [r for r in R if r['kind'] == 'check']
        VIS = {'legibility', 'palette-speckle', 'palette-colour', 'framing', 'occlusion', 'orientation', 'scale', 'kit-limit',
               'concept-occlusion', 'concept-section', 'lighting', 'detail', 'floating-looking', 'none'}
        looks = [r for r in R if r['kind'] == 'look' and (r['verdict'] == 'accept' or set(r['issues']) & VIS)]
        renders = [r for r in R if r['kind'] == 'render']
        final = [r for r in R if r['kind'] == 'final'][-1]['draft']
        drafts = sorted({r['draft'] for r in checks}, key=lambda d: int(d[1:]))
        spec = json.load(open(os.path.join(HERE, 'specs', bid + '.json')))
        body = [p for p in spec['parts'] if 'context' not in p.get('tags', [])]
        ext = sorted({p['type'] for p in body if p['type'] in ('growpod', 'lantern', 'vines')})
        mats = sorted({p.get('material') for p in body if p.get('material') in ('growlight_px', 'sunpipe_px')})
        if any(p['type'] in ('tube', 'elevator') or (p['type'] == 'bridge' and (p.get('params') or {}).get('enclosed')) for p in body):
            mats.append('sprite glass remap')
        first = checks[0]
        per[bid] = dict(
            drafts=len(drafts), final=final, validator_runs=len(checks), render_rounds=len(renders), visual_reviews=len(looks),
            first_run_extended_pass=first['pass_'], first_run_stock_pass=first['stock_pass'],
            first_run_stock_errors=first['stock_errors'], first_run_stock_context_errors=first['stock_context_errors'],
            extended_errors_total=sum(r['errors'] for r in checks),
            parts=len(body), context_parts=len(spec['parts']) - len(body), extensions=ext + mats,
            mistakes=[dict(draft=m[1], cls=m[2], what=m[3], caught_by=m[4]) for m in MISTAKES if m[0] == bid])
    cls = {}
    caught = {}
    for m in MISTAKES:
        cls[m[2]] = cls.get(m[2], 0) + 1
        k = 'validator' if m[4].startswith('validator') else ('looking at renders' if m[4] == 'looking' else 'own review')
        caught[k] = caught.get(k, 0) + 1
    tot = dict(buildings=len(IDS), drafts=sum(p['drafts'] for p in per.values()), validator_runs=sum(p['validator_runs'] for p in per.values()),
               render_rounds=sum(p['render_rounds'] for p in per.values()), visual_reviews=sum(p['visual_reviews'] for p in per.values()),
               first_run_extended_pass=sum(p['first_run_extended_pass'] for p in per.values()),
               first_run_stock_pass=sum(p['first_run_stock_pass'] for p in per.values()),
               mistakes=len(MISTAKES), mistakes_by_class=cls, mistakes_caught_by=caught,
               parts_total=sum(p['parts'] for p in per.values()))
    out = dict(totals=tot, per_building=per, other_problems=[dict(kind=k, what=w) for k, w in OTHER])
    with open(os.path.join(HERE, 'out', 'stats.json'), 'w') as fh:
        json.dump(out, fh, indent=1)
    panel(out)
    print(json.dumps(tot, indent=1))


def panel(S):
    W, H = 2000, 1180
    im = Image.new('RGB', (W, H), (24, 25, 30))
    d = ImageDraw.Draw(im)
    fT, fH, fM, fS = font('bold', 30), font('medium', 19), font('mono', 16), font('regular', 16)
    t = S['totals']
    d.text((40, 24), 'Authoring log: 6 briefs -> %d drafts, %d validator runs, %d render rounds, %d visual reviews' % (
        t['drafts'], t['validator_runs'], t['render_rounds'], t['visual_reviews']), font=fT, fill=(236, 233, 226))
    d.text((40, 66), 'first drafts: extended validator PASS %d/6, stock agent_check PASS 0/6 (host/orient/bridge blind spots); %d real mistakes: %s; caught by %s' % (
        t['first_run_extended_pass'], t['mistakes'], ', '.join('%s %d' % kv for kv in sorted(t['mistakes_by_class'].items())),
        ', '.join('%s %d' % kv for kv in sorted(t['mistakes_caught_by'].items()))), font=fS, fill=(170, 170, 176))
    hdr = '%-22s %6s %6s %7s %7s %8s %6s  %s' % ('building', 'drafts', 'runs', 'renders', 'reviews', '1st run', 'parts', 'extensions used')
    y = 120
    d.text((40, y), hdr, font=fM, fill=(250, 214, 122)); y += 28
    for bid, p in S['per_building'].items():
        ln = '%-22s %6d %6d %7d %7d %8s %6d  %s' % (SHORT[bid], p['drafts'], p['validator_runs'], p['render_rounds'], p['visual_reviews'],
                                                  'PASS' if p['first_run_extended_pass'] else 'FAIL', p['parts'], ', '.join(p['extensions']) or '-')
        d.text((40, y), ln, font=fM, fill=(206, 208, 214)); y += 26
    y += 18
    d.text((40, y), 'My mistakes (what, draft, caught by)', font=fH, fill=(250, 214, 122)); y += 32
    for bid, p in S['per_building'].items():
        for m in p['mistakes']:
            col = {'floating': (255, 140, 120), 'overlap': (255, 190, 120), 'height': (240, 220, 120), 'orientation': (150, 200, 255),
                   'scale': (180, 230, 160), 'circulation': (220, 170, 255)}.get(m['cls'], (206, 208, 214))
            d.text((40, y), '%-9s %-18s %-3s %s  [%s]' % (m['cls'], SHORT[bid][4:], m['draft'], m['what'][:92], m['caught_by']), font=font('mono', 14), fill=col)
            y += 21
    y += 16
    d.text((40, y), 'Not my geometry: validator blind spots, kit limits, renderer/palette issues', font=fH, fill=(250, 214, 122)); y += 32
    for o in S['other_problems']:
        col = {'validator blind spot': (255, 170, 150), 'kit limit': (150, 210, 255), 'renderer/palette': (200, 230, 150), 'camera/framing': (220, 190, 255)}[o['kind']]
        d.text((40, y), '%-20s %s' % (o['kind'], o['what'][:130]), font=font('mono', 14), fill=col)
        y += 21
    im = im.crop((0, 0, W, min(H, y + 30)))
    im.save(os.path.join(HERE, 'out', 'log_panel.png'))


if __name__ == '__main__':
    main()
