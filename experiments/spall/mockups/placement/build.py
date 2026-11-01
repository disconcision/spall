#!/usr/bin/env python3
"""Build the placement study page: page.html with shots (local/shots), the section diagram and toy.js inlined.
usage: python3 build.py  ->  local/placement.html (single file; images as data URIs)"""
import base64, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'local', 'shots')


def data_uri(name):
    for ext, mime in (('.webp', 'image/webp'), ('.png', 'image/png')):
        p = os.path.join(SHOTS, name + ext)
        if os.path.exists(p):
            return f'data:{mime};base64,' + base64.b64encode(open(p, 'rb').read()).decode()
    raise SystemExit('missing shot ' + name)


# ---- the section along the view line: s = x + y (depth toward the viewer), z = height in levels ----
def sx(s): return 30 + (s - 50) * 15
def sy(z): return 272 - z * 19


def svg():
    o = ['<svg viewBox="0 0 680 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Section along the view line showing where each tool picks its point">',
         '<style>.t{font:600 11px "IBM Plex Mono",monospace;fill:#a39c8e}.tb{font:600 11px "IBM Plex Mono",monospace}</style>']
    poly = lambda pts, fill: o.append('<polygon fill="%s" points="%s"/>' % (fill, ' '.join('%.1f,%.1f' % (sx(s), sy(z)) for s, z in pts)))
    # ground, water, far mass with its roof and the lip deck, near mass
    poly([(50, 0), (92, 0), (92, 2), (50, 2)], '#26241f')
    poly([(64, 2), (80, 2), (80, 2.25), (64, 2.25)], '#2f6a66')
    poly([(50, 2), (63.6, 2), (63.6, 8.11), (50, 8.11)], '#4a4740')
    poly([(56, 8.11), (60, 8.11), (60, 10), (56, 10)], '#3d3a33')
    poly([(56, 10), (64, 10), (64, 10.25), (56, 10.25)], '#8d877a')
    poly([(80, 2), (92, 2), (92, 11), (80, 11)], '#4a4740')
    # working band under the cut, and the cut itself
    o.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="#e8a83c" fill-opacity="0.09"/>' % (sx(50), sy(11.58), sx(92) - sx(50), sy(9.08) - sy(11.58)))
    o.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#e8a83c" stroke-width="1.5" stroke-dasharray="6 4"/>' % (sx(50), sy(11.58), sx(92), sy(11.58)))
    o.append('<text class="tb" fill="#e8a83c" x="%.1f" y="%.1f">CUT L9</text>' % (sx(86.4), sy(11.58) - 6))
    o.append('<text class="t" x="%.1f" y="%.1f">WORKING BAND, 2.5 LEVELS</text>' % (sx(50.4), sy(9.08) - 6))
    # a girder crossing the section inside the band
    o.append('<rect x="%.1f" y="%.1f" width="10" height="10" fill="#a9b6bf" stroke="#f4f8fa" stroke-width="1"/>' % (sx(67.2) - 5, sy(9.3) - 5))
    o.append('<text class="t" x="%.1f" y="%.1f">GIRDER</text>' % (sx(67.2) - 22, sy(9.3) - 13))
    # the view line: solid down to the roof it hits, dotted below
    z_of = lambda s: 11.58 - (74 - s) / 3
    o.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#ffffff" stroke-width="1.5"/>' % (sx(78.5), sy(z_of(78.5)), sx(63.6), sy(z_of(63.6))))
    o.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1.5" stroke-dasharray="2 4"/>' % (sx(63.6), sy(z_of(63.6)), sx(57.5), sy(z_of(57.5))))
    # the eye at the top end, looking down the line (arrowhead points into the scene)
    ex, ey = sx(78.5), sy(z_of(78.5)); dx, dy = sx(77.0) - ex, sy(z_of(77.0)) - ey; n = (dx * dx + dy * dy) ** 0.5; dx, dy = dx / n, dy / n
    ax, ay = ex + dx * 26, ey + dy * 26
    o.append('<polygon fill="#ffffff" points="%.1f,%.1f %.1f,%.1f %.1f,%.1f"/>' % (ax + dx * 8, ay + dy * 8, ax - dy * 5, ay + dx * 5, ax + dy * 5, ay - dx * 5))
    o.append('<ellipse cx="%.1f" cy="%.1f" rx="9" ry="5" fill="none" stroke="#ffffff" stroke-width="1.5"/><circle cx="%.1f" cy="%.1f" r="2.2" fill="#ffffff"/>' % (ex + 4, ey - 2, ex + 4, ey - 2))
    o.append('<text class="t" x="%.1f" y="%.1f">ONE SCREEN PIXEL, SEEN SIDE-ON</text>' % (sx(76.2), sy(z_of(78.5)) - 10))
    dot = lambda s, z, c, r=5: o.append('<circle cx="%.1f" cy="%.1f" r="%d" fill="%s" stroke="#0e0f11" stroke-width="2"/>' % (sx(s), sy(z), r, c))
    # today: stack and girder on the cut level, cable on the first surface
    dot(72.3, 11.0, '#5fd3f2'); dot(72.55, 11.08, '#e8a83c', 4)
    o.append('<text class="tb" fill="#5fd3f2" x="%.1f" y="%.1f">TODAY: STACK + GIRDER, L9</text>' % (sx(73.3), sy(11.0) + 15))
    dot(63.6, 8.11, '#e8735a')
    o.append('<text class="tb" fill="#e8735a" x="%.1f" y="%.1f">TODAY: CABLE, FIRST SURFACE L6</text>' % (sx(50.4), sy(8.11) + 16))
    # proposed: the joint in the band wins
    o.append('<circle cx="%.1f" cy="%.1f" r="10" fill="none" stroke="#ffe9a8" stroke-width="2"/>' % (sx(67.2), sy(9.3)))
    o.append('<text class="tb" fill="#ffe9a8" x="%.1f" y="%.1f">PROPOSED: THE JOINT IN THE BAND</text>' % (sx(68.4), sy(9.3) + 20))
    # axes
    o.append('<text class="t" x="%.1f" y="292">FAR</text><text class="t" x="%.1f" y="292" text-anchor="end">NEAR  (DEPTH ALONG THE VIEW)</text>' % (sx(50), sx(92)))
    o.append('</svg>')
    return '\n'.join(o)


page = open(os.path.join(HERE, 'page.html')).read()
page = re.sub(r'\{\{img:([a-z0-9_]+)\}\}', lambda m: data_uri(m.group(1)), page)
page = page.replace('{{svg}}', svg()).replace('{{toy}}', open(os.path.join(HERE, 'sandbox.js')).read())
out = os.path.join(HERE, 'local', 'placement.html')
open(out, 'w').write(page)
print(out, os.path.getsize(out))
