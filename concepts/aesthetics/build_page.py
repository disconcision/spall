"""build_page.py - index.html: self-contained (WebP data URIs), grouped by theme, with short captions.

    python3 build_page.py
"""
import base64, html, io, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
O = os.path.join(HERE, 'out')
TOTAL = [0]


def uri(path, max_w=1600, q=80, lossless=False):
    im = Image.open(os.path.join(O, path))
    im = im.convert('RGBA' if lossless and im.mode == 'RGBA' else 'RGB')
    if im.width > max_w:
        im = im.resize((max_w, int(im.height * max_w / im.width)), Image.NEAREST if lossless else Image.LANCZOS)
    b = io.BytesIO()
    if lossless:
        im.save(b, 'WEBP', lossless=True, quality=100, method=6)
    else:
        im.save(b, 'WEBP', quality=q, method=6)
    TOTAL[0] += b.tell()
    return 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode(), im.width, im.height


def fig(path, cap, cls='', pix=False, max_w=1600, q=86):
    u, w, h = uri(path, max_w=max_w, lossless=pix, q=q)
    pc = ' pix' if pix else ''
    return ('<figure class="%s"><img class="zoom%s" src="%s" width="%d" height="%d" alt="%s" loading="lazy">'
            '<figcaption>%s</figcaption></figure>' % (cls, pc, u, w, h, html.escape(cap, quote=True), cap))


def section(sid, title, intro, body):
    return '<section id="%s"><h2>%s</h2><p class="intro">%s</p>%s</section>' % (sid, title, intro, body)


def grid(n, *figs):
    return '<div class="grid g%d">%s</div>' % (n, ''.join(figs))


S = []
S.append(section('edges', 'Hewn edges: blocky, chamfered, tetrapod',
    'One brutalist block, same camera and light. Blocky and chamfered are the <em>same spec</em>: a style-level bevel policy turns every '
    'concrete box into a chamfered one sized to the box, the egg-crate grids stop short of the cut corners, and the roof masses get '
    'oblique "hewn" cuts. The tetrapod version swaps parts: the bar rides on giant standing tetrapods, inverted-V tetrapod legs carry '
    'both cantilevers, and a placed revetment rings the plaza.',
    grid(3, fig('a/a1_blocky.png', 'Blocky: the earlier kit\'s look, kept in the repertoire.'),
         fig('a/a2_chamfered.png', 'Chamfered: same spec, style <code>brut_hewn</code>. Corners, attic bands, cores and podium edges are cut.'),
         fig('a/a3_tetrapod.png', 'Tetrapod-inspired: tetrapod stilts, diagonal V-legs, a breakwater revetment, rows of small units on the roof.'))
    + grid(2, fig('a/a2b_chamfered_close.png', 'Close-up: a chamfered attic band over the egg-crate grid, which stops short of the corner cut.'),
           fig('a/a3b_tetrapod_close.png', 'Close-up: the placed revetment (staggered rows, alternating yaw) and a tetrapod leg under the bar.'))
    + grid(2, fig('k/k1_catalog_blocky.png', 'Catalogue, blocky: sharp, chamfer, round, step and hewn blocks; tetrapod, dolos and cube units; '
                  'armour pile; tripod; megaframe; brutalist mass; pier.'),
           fig('k/k2_catalog_hewn.png', 'The same catalogue under the hewn policy.'))))

S.append(section('green', 'Spartan concrete vs brutalism with plants',
    'One spec. Every plant is a tagged part, so the spartan render just drops the tag. The overgrown render adds a style that tints '
    'up-facing concrete with crisp-edged moss. It is cultivated rather than ruined: windows stay lit, and the planting is roof gardens, '
    'planted terraces, Barbican-style trailing plants, climbing plants and a ledge tree dropping aerial roots.',
    grid(2, fig('b/b1_spartan.png', 'Spartan: stepped terraces (1:1), an egg-crate slab, a pod-infilled megaframe and a round service tower.'),
         fig('b/b2_overgrown.png', 'Overgrown: roof forest on the megaframe, planted terraces, trailing plants, plane trees, climbing plants on the tower.'))
    + grid(2, fig('b/b4_spartan_close.png', 'Close-up, spartan.'),
           fig('b/b3_overgrown_close.png', 'Close-up, overgrown: a ledge tree with aerial roots, moss on horizontal surfaces, planters with trailing plants.'))))

S.append(section('diag', 'Large-scale diagonals at grid-rational slopes',
    'Slopes are integer ratios of the grid (run cells : rise levels; a cell is 4 m, a level 3.5 m): 1:1, 1:2, 2:1, plus 1:3 and 4:1 '
    'for bastions and ramps. They are battered masses, inclined planes, and sheared or battered voids in the ground, so sections stay '
    'correct. The pixel versions set a level to exactly 8 px, so every slope edge is an integer pixel ratio.',
    fig('d/d1_battered_wall.png', 'A wall-city with a 1:2 battered face and slot windows that follow the slope; the same wall stepped every two levels to the east; '
        'a 2:1 inclined housing plane on piers; a 1:3 bastion; a 4:1 ramp.', 'wide')
    + fig('d/d2_stepped_vs_smooth.png', 'Stepped vs smooth at 1:1, 1:2 and 2:1: the same envelopes as smooth faces and as terraces of whole levels.', 'wide')
    + grid(2, fig('d/d3_inclined_shafts.png', 'Diagonal shafts in section: a 1:1 escalator bore, a 2:1 funicular bore, and a hangar with battered '
                  'walls where a boring machine is being assembled.'),
           fig('h/h8_d_shafts.png', 'The same section as pixel art (16 px per cell, Stratum palette).', pix=True))
    + grid(2, fig('h/h2_slopes16.png', 'Slopes as sprites at 16 px per cell.', pix=True),
           fig('h/h4_wall_pixels.png', 'The battered wall-city as a sprite.', pix=True))))

S.append(section('under', 'Underground: gritty, in-between, clean',
    'One underground section, three palettes: a concourse, a services level with colour-coded pipes, and a tall workshop hall with a crane and '
    'mezzanine walkways beside a transit hall. The palette slots (<code>ug_wall</code>, <code>ug_pipe</code>, <code>ug_light</code> and so on) '
    'are remapped by style, and the clean version also switches the cut to a white-model fill. There are no grime textures: the grit comes from '
    'the palette, sodium light and clutter.',
    grid(3, fig('c/c1_gritty.png', 'Gritty industrial: rust and yellow-black trim, sodium light, dark strata.'),
         fig('c/c2_between.png', 'In-between, civic: cream tile, green trim, painted services, warm-white light.'),
         fig('c/c3_clean.png', 'Clean white: gloss panels, rounded bevels (the style\'s bevel policy is <code>round</code>), cool light, white-model cut.'))
    + grid(2, fig('h/h8_c_gritty.png', 'Pixel art, gritty.', pix=True), fig('h/h8_c_clean.png', 'Pixel art, clean.', pix=True))))

S.append(section('hetero', 'A heterogeneous section',
    'The layers are not uniformly dense. From the top: surface towers with a roof garden; five dense strata of cut-open capsule infill; a void '
    'spanning about eleven levels with sparse walkways, pendant lights and hanging roots; a borehole 44 m across with a helical ramp, light rings and '
    'a lift, cut through its axis; and a rib-framed hangar where a tunnel boring machine is being assembled under two bridge cranes.',
    '<div class="split">' + fig('dd/dd1_section.png', 'The full section.', max_w=1300)
    + '<div>' + fig('dd/dd2_void_close.png', 'The void: sparse walkways at different heights and angles, hung from the ceiling.')
    + fig('dd/dd3_hangar_close.png', 'The hangar: the TBM mid-assembly, scaffolded, with welding sparks and a spoil conveyor to the shaft.') + '</div></div>'))

S.append(section('infra', 'Infrastructure',
    'Everything in this section is swept along paths: box-girder highways with hammerhead piers, conveyors (open and covered), pneumatic-tube '
    'bundles carrying lit pods, water slides, colour-coded pipe racks, and a cable trunk whose cables stay continuous as it splits into branches.',
    fig('e/e1_district.png', 'The district: a four-ramp stack interchange, a factory with silos and a covered conveyor gallery, towers fed by a '
        'cable trunk and tube bundles, and a water-slide terrace.', 'wide')
    + grid(3, fig('e/e2_interchange.png', 'Stack interchange: two crossing highways and four humped flyovers at different heights.'),
           fig('e/e3_conduits.png', 'The trunk rises out of a vault in a ribbed casing, then splits into branches (and branches of branches) that '
               'enter the towers; tube bundles run above.'),
           fig('e/e4_slides.png', 'Water slides: two helices (open trough and closed tube) around a slide tower, and a free-form flume into the pool.'))))

f_body = ''
for key, name, cap in (('dys', 'Dystopian', 'Night, grey-blue haze, dark glass towers, holographic signs and flying vehicles in the canyons.'),
                       ('brut', 'Overgrown brutalist', 'Concrete superblocks with hewn crowns, roof forests and planted balconies; green haze.'),
                       ('solar', 'Solarpunk', 'White and timber towers with rounded corners, solar crowns, turbines, sky gardens and whole blocks of park.')):
    f_body += '<h3>%s</h3><p class="intro small">%s</p>' % (name, cap)
    f_body += grid(4, *[fig('f/boxed_%s_%d.png' % (key, i), c, q=84) for i, c in
                        ((1, 'Far: an ordinary grid of city blocks.'), (2, 'Closer: each block resolves into towers.'),
                         (3, 'One "block" is a 240 m superblock of 16 towers.'), (4, 'In the canyon: the street is 64 m wide.'))])
S.append(section('reveal', 'The Blade Runner 2049 reveal',
    'A 13 × 13 grid of superblocks, each 240 m square with 64 m canyons between. The far view reads as ordinary city blocks; each amber outline '
    'marks where the next view looks. The same city generator runs in three styles, and detail is spent only where the camera will look: '
    'the centre superblock gets bridges, signs, walkways and vehicles, its neighbours get crowns and bridges, and the rest are boxes with '
    'procedural window facades.', f_body))

S.append(section('land', 'Landscape with heterogeneous density',
    'A 4.2 × 3 km terrain tile, finished like a model with strata on its edges. Dense cores (a cluster of superblocks and a stepped arcology mountain '
    'at 2:1) sit beside a 1.5 km battered wall-city on the river. Villages and small towers form sparse districts; farms, forests and a river fill '
    'the open land. Highways and a covered conveyor from a quarry tie it together.',
    fig('g/g1_landscape.png', 'The whole tile.', 'wide', max_w=2000)
    + fig('g/g2_landscape_cores.png', 'Closer on the wall-city and the arcology mountain.', 'wide')))

S.append(section('pixel', 'Pixel art through the sprite pipeline',
    'Aliased EEVEE renders (filter width 0) at a fixed pixels-per-metre and a fixed 2:1 camera, locked with no dithering to a 72-colour '
    '<strong>Stratum palette</strong>. The palette is built from the layer prototype\'s own ramps: warm concrete, slate decks, terracotta, '
    'ochre, sage and foliage, teal water, night ambers and its coral/yellow/mint accents, plus a cool-white ramp for clean interiors. '
    'The prototype\'s density is 16 px per 4 m cell. One panel compares the palette with the earlier SC2K-style palette.',
    fig('h/h1_block_pixels.png', 'The same block, blocky / chamfered / tetrapod, at 16 px per cell. The chamfers survive as one- and two-pixel facets.', 'wide', pix=True, max_w=2150)
    + fig('h/h6_lod.png', 'Continuous-zoom LOD: one superblock from one spec at 8, 16 and 32 px per cell. Windows and vines appear as the density rises.', 'wide', pix=True, max_w=2400)
    + grid(2, fig('h/h5_green_pixels.png', 'Spartan vs overgrown as sprites.', pix=True, max_w=2400),
           fig('h/h7_styles.png', 'Superblocks in the three city styles (dystopian at dusk here, for legibility).', pix=True, max_w=2400))
    + grid(2, fig('h/h8_e_interchange.png', 'The stack interchange as an in-game-style crop.', pix=True),
           fig('h/h3_slopes32.png', 'Slopes at 32 px per cell.', pix=True, max_w=2400))
    + fig('h/h9_palettes.png', 'Palette comparison on the chamfered block: the raw render, locked to the Stratum palette, and locked to the '
          'SC2K-style kit64 palette.', 'wide', pix=True, max_w=2304)))

KIT = """<section id="kit"><h2>What the kit now supports</h2><ul class="kit">
<li><b>Bevel as a first-class option.</b> Every part takes <code>params.bevel</code>, a size or a policy dict. A style-level policy chamfers
every qualifying box in proportion to its size, filtered by material. Modes are chamfer, round and stepped, with separate vertical, top and bottom
edges, per-corner cuts, and seeded or explicit plane cuts ("hewn").</li>
<li><b>Concrete:</b> brutalist masses with egg-crate, fin, slot and blank faces; chamfer-aware columns, beams and towers; tetrapod, dolos and cube
units; placed revetments; tripods; diagonal struts; orthogonal megaframes; a tetrapod (diamond) lattice; piers with cutwaters.</li>
<li><b>Overgrowth:</b> trailing plants, aerial roots, climbing plants, roof gardens, edge planters, big and weeping trees; moss by style.</li>
<li><b>Underground:</b> earth with box, sheared and battered voids, decomposed so sections cap as strata; boreholes and inclined bores; room
linings with palette slots; tunnels; walkways; pendants; cable spans; hangars with bridge cranes; a TBM; robot arms; scaffolds; fans.</li>
<li><b>Infrastructure:</b> path sweeps for highways, conveyors, pneumatic tubes, water slides, branching cable trunks and pipe racks, plus hubs.</li>
<li><b>City and landscape:</b> procedural window facades, towers, superblocks in three styles with detail levels, terrain tiles, forests, villages.</li>
<li><b>Renderer:</b> section caps chosen by the material they cut, perspective cameras, spot and extra lights, stylised materials with no grime,
new light presets, and a palette-locked sprite pipeline at any density.</li></ul>
<p class="intro small">Code, specs and the per-render notes: <code>stratum/concepts/aesthetics/</code> (see <code>NOTES.md</code>; rebuild everything
with <code>./run_all.sh</code>).</p></section>"""

NAV = ''.join('<a href="#%s">%s</a>' % (a, b) for a, b in (('edges', 'Hewn edges'), ('green', 'Plants'), ('diag', 'Diagonals'),
                                                          ('under', 'Underground'), ('hetero', 'Section'), ('infra', 'Infrastructure'),
                                                          ('reveal', 'BR2049 reveal'), ('land', 'Landscape'), ('pixel', 'Pixel art'),
                                                          ('kit', 'Kit')))

CSS = """
:root{--bg:#161615;--panel:#1f1e1c;--ink:#ece2cc;--muted:#a39b8c;--rule:#34322e;--accent:#e8a83c;--coral:#ff6b4a}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#161615;--panel:#1f1e1c;--ink:#ece2cc;--muted:#a39b8c}}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
header{padding:28px 16px 10px;max-width:1500px;margin:0 auto}
h1{font-size:26px;letter-spacing:.06em;text-transform:uppercase;margin:0 0 6px}
h1 span{color:var(--accent)}
.lede{color:var(--muted);max-width:980px;margin:0}
nav{position:sticky;top:0;z-index:5;background:rgba(22,22,21,.94);backdrop-filter:blur(6px);border-bottom:1px solid var(--rule);
 display:flex;gap:4px 14px;flex-wrap:wrap;padding:9px 16px;justify-content:center}
nav a{color:var(--muted);text-decoration:none;font-size:13px;letter-spacing:.04em}nav a:hover{color:var(--accent)}
main{max-width:1500px;margin:0 auto;padding:0 16px 60px}
section{padding-top:34px;border-top:1px solid var(--rule);margin-top:26px}
h2{font-size:20px;margin:0 0 6px;color:var(--ink)}h2::before{content:"";display:inline-block;width:10px;height:10px;background:var(--accent);margin-right:10px;vertical-align:1px}
h3{font-size:16px;margin:22px 0 2px;color:var(--accent)}
.intro{color:var(--muted);max-width:1050px;margin:0 0 14px}.intro.small{font-size:14px;margin-bottom:8px}
code{font:12.5px/1 ui-monospace,Menlo,monospace;color:#d8c9a8;background:#2a2926;padding:1px 4px;border-radius:3px}
figure{margin:0 0 14px;background:var(--panel);border:1px solid var(--rule);border-radius:6px;overflow:hidden}
figure img{display:block;width:100%;height:auto;cursor:zoom-in;background:#111}
img.pix{image-rendering:pixelated}
figcaption{padding:8px 11px 10px;color:#cfc6b4;font-size:13.5px}
.grid{display:grid;gap:14px}.g2{grid-template-columns:repeat(2,minmax(0,1fr))}.g3{grid-template-columns:repeat(3,minmax(0,1fr))}
.g4{grid-template-columns:repeat(4,minmax(0,1fr))}.g4 figcaption{font-size:12.5px}
.split{display:grid;grid-template-columns:minmax(0,0.9fr) minmax(0,1.1fr);gap:14px;align-items:start}
ul.kit{max-width:1100px;padding-left:18px;color:#d8cfbd}ul.kit li{margin:0 0 8px}
#lb{position:fixed;inset:0;background:rgba(8,8,8,.93);display:none;align-items:center;justify-content:center;z-index:20;cursor:zoom-out;padding:16px}
#lb img{max-width:100%;max-height:100%;box-shadow:0 0 40px #000}#lb.on{display:flex}
@media (max-width:900px){.g3,.g4{grid-template-columns:repeat(2,minmax(0,1fr))}.split{grid-template-columns:1fr}}
@media (max-width:560px){.g2,.g3,.g4{grid-template-columns:1fr}h1{font-size:21px}}
"""

JS = """
const lb=document.getElementById('lb'),li=lb.querySelector('img');
document.querySelectorAll('img.zoom').forEach(im=>im.addEventListener('click',()=>{li.src=im.src;li.style.imageRendering=im.classList.contains('pix')?'pixelated':'auto';lb.classList.add('on')}));
lb.addEventListener('click',()=>lb.classList.remove('on'));
document.addEventListener('keydown',e=>{if(e.key==='Escape')lb.classList.remove('on')});
"""

page = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Megastructure Aesthetics Round 2</title><style>%s</style></head><body>
<header><h1>Stratum <span>/</span> megastructure aesthetics, round 2</h1>
<p class="lede">Concept mock-ups for the broader Stratum megastructure track, made with the kit-of-parts renderer extended with bevels, chamfers and hewing, and with
new part families. The look is deliberately stylised rather than realist: crisp edges, simplified surfaces, a restrained palette with saturated
accents, readable silhouettes and no grime textures. Everything is generated from JSON specs; click any image to enlarge it.</p></header>
<nav>%s</nav><main>%s%s</main><div id="lb"><img alt="enlarged view"></div><script>%s</script></body></html>""" % (CSS, NAV, ''.join(S), KIT, JS)

out = os.path.join(HERE, 'index.html')
with open(out, 'w') as fh:
    fh.write(page)
print('index.html: %.2f MB (images %.2f MB)' % (os.path.getsize(out) / 1e6, TOTAL[0] * 4 / 3 / 1e6))
