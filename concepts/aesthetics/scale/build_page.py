"""build_page.py - scale/index.html: self-contained (WebP data URIs), grouped by theme, short captions."""
import base64, html, io, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
O = os.path.join(HERE, 'out')
TOTAL = [0]


def uri(path, max_w=1600, q=84, lossless=False):
    im = Image.open(os.path.join(O, path))
    im = im.convert('RGB')
    if im.width > max_w:
        im = im.resize((max_w, int(im.height * max_w / im.width)), Image.NEAREST if lossless else Image.LANCZOS)
    b = io.BytesIO()
    if lossless:
        im.save(b, 'WEBP', lossless=True, quality=100, method=6)
    else:
        im.save(b, 'WEBP', quality=q, method=6)
    TOTAL[0] += b.tell()
    return 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode(), im.width, im.height


def fig(path, cap, cls='', pix=False, max_w=1600, q=84):
    u, w, h = uri(path, max_w=max_w, lossless=pix, q=q)
    return ('<figure class="%s"><img class="zoom%s" src="%s" width="%d" height="%d" alt="%s" loading="lazy">'
            '<figcaption>%s</figcaption></figure>' % (cls, ' pix' if pix else '', u, w, h, html.escape(cap, quote=True), cap))


def section(sid, title, intro, body):
    return '<section id="%s"><h2>%s</h2><p class="intro">%s</p>%s</section>' % (sid, title, intro, body)


def grid(n, *figs):
    return '<div class="grid g%d">%s</div>' % (n, ''.join(figs))


S = []
P = 'powers/lab_p%d_%s.png'
S.append(section('powers', 'Powers of Ten',
    'One continuous place, one fixed camera, frames from 10 m to 1000 km. At each step, what read as ground turns out to be structure, and '
    'every frame is inhabited. The white outline is the previous frame. At the Rib\'s scale (10 km) the extra cues are an ordinary city at '
    'its foot and a cloud deck below its crest. Everything outside the focus is instanced, at a level of detail matched to its distance.',
    grid(3, fig(P % (1, '10m'), '10 m: a roof terrace in a small town.'),
         fig(P % (2, '100m'), '100 m: the town sits on a terrace; the wall below it is full of windows.'),
         fig(P % (3, '1km'), '1 km: the terrace is one step of a cast face, with towns on every step.'),
         fig(P % (4, '10km'), '10 km: the Rib, a stepped concrete mass 1.7 km high, rises out of ordinary city.'),
         fig(P % (5, '100km'), '100 km: one of 48 ribs, with ordinary cities between them.'),
         fig(P % (6, '1000km'), '1000 km: the ribs are spokes of the Hub.'))))

M = 'mega2/'
S.append(section('mega', 'Megaforms: buildings slotted into structures 10 to 1000 times bigger',
    'Every megaform reads as architecture at every scale: stepped masses, frames, voids, slabs and spines. Any landscape quality comes only from '
    'size: haze, and small buildings settling on vast surfaces. Ordinary low-rise city fabric at the base sets the scale. Unusual cast concrete '
    'recurs across the set: faceted buttresses, splayed cast feet, haunched nodes, and one colossal tetrapod.',
    '<h3>(a) A stepped cast mass</h3>'
    + grid(2, fig(M + 'a1_stepped_mass.png', '6.6 × 4.6 km, 12 steps of 110 m, cut by a 700 m canyon street. Neighbourhoods on every terrace, the city at its foot.'),
           fig(M + 'a2_stepped_canyon.png', 'The canyon: bridges between the halves, towns on the terraces, a street city on the canyon floor, faceted buttresses.'))
    + '<h3>(b) An open void between megaframes</h3>'
    + grid(2, fig(M + 'b1_frame_void.png', 'From the void floor: two 1.8 km frames with 180 m bays, ordinary buildings slotted into the bays, bridges overhead.'),
           fig(M + 'b2_frame_void_overview.png', 'Overview: each bay is a building plot, and the frames are the ground the plots sit on.'))
    + '<h3>(c) A continuous monument</h3>'
    + grid(2, fig(M + 'c1_monument.png', 'After Superstudio: a 1 km wide gridded bar crossing 90 km of country, with ordinary city in its lee.'),
           fig(M + 'c2_monument_roof.png', 'Towns and groves on its roof; the grid is 48 m.'))
    + '<h3>(d) An interior void</h3>'
    + grid(2, fig(M + 'd1_interior_void.png', 'Inside a 7 × 4.6 × 2.6 km void: inhabited walls, shelves carrying towns, a city floor, haze bands, clouds, light wells.'),
           fig(M + 'd2_interior_section.png', 'In section: shelves at five heights, cast brackets, weather between the floors.'))
    + '<h3>(e) An inclined slab</h3>'
    + grid(3, fig(M + 'e1_slab_conc.png', '5.4 km rising 2.4 km at exactly 2:1 in building-grid terms, on flared cast piers over the city.'),
           fig(M + 'e2_slab_terraces.png', 'A neighbourhood on each of the 17 terraces.'),
           fig(M + 'e3_slab_solar.png', 'Solarpunk variant: white and timber, solar canopies, groves, tree-capital piers.'))
    + '<h3>(h) An infrastructure spine</h3>'
    + grid(3, fig(M + 'h1_spine.png', '32 km long, four decks 860 m wide: highways, a freight conveyor, pipe bundles, a cable trunk.'),
           fig(M + 'h2_spine_below.png', 'From the street below: frames every 400 m stand on splayed cast feet.'),
           fig(M + 'h3_spine_decks.png', 'Towns built into the decks, between the lanes.'))))

L = 'legibility/'
S.append(section('cues', 'Scale legibility: which cues work',
    'The same stepped mass, same camera, adding one cue at a time. <b>Verdict:</b> ordinary buildings on and around the megaform are the strongest '
    'cue in isometric. A cloud deck at mid-height and night window patterns are strong and cheap. Aerial fog helps but washes out quickly. A '
    'street-level view looking up is the most convincing of all: not a game camera, but good for an "enter" or photo mode.',
    grid(3, fig(L + 'l1_bare.png', 'Bare massing: reads as a table-top model. Fails.'),
         fig(L + 'l2_buildings.png', 'Plus ordinary buildings: towns on the terraces, city at the base. Strongest.'),
         fig(L + 'l3_aerial.png', 'Plus aerial perspective: helps, but washes out and fights the crisp style. Use lightly.'),
         fig(L + 'l4_bands_clouds.png', 'Plus a haze band and a cloud deck at mid-height: very strong. Keep clouds sparse.'),
         fig(L + 'l5_night.png', 'Night: lit risers show the mass is inhabited through its whole height. Strong.'),
         fig(L + 'l6_street.png', 'Street level, looking up past ordinary buildings: the most convincing view.'))))

S.append(section('pixel', 'Nested scales in pixel art',
    'Aliased renders at a fixed pixels-per-metre and the game\'s 2:1 camera, locked to the 72-colour Stratum palette. The coral boxes mark the '
    'next, finer view. Cells nest 4× per side per tier, as in the simulation\'s hierarchy. At the coarsest tier raw geometry aliases into '
    'noise, so far tiers need their own sprites, coarse-grained from the finer tier.',
    fig('pixel/nested_stepped.png', 'The stepped mass at 16 px per 256 m (a landscape-scale sprite), 16 px per 16 m (terraces as districts) and '
        '16 px per 4 m (one terrace is the ground: a town, the inhabited riser behind, the drop in front).', 'wide', pix=True, max_w=3300)
    + fig('pixel/nested_void.png', 'Megaframes at 16 px per 64 m, then one bay at 16 px per 4 m with buildings slotted in.', 'wide', pix=True, max_w=1600)))

GAME = """<section id="game"><h2>How this could work in the game</h2><ul class="kit">
<li><b>Megaforms are terrain for the next tier down.</b> A megaform spec declares surfaces as slots: terrace or roof (a buildable plane with its
own grid, clearance, load and access), bay (a cavity in a frame), ledge or shelf, wall (for hung units), shaft or void (kept open), and lane
(reserved on infrastructure decks). At the finer tier a slot is ground. The terrace becomes the tile layer, the riser behind becomes a boundary
wall whose windows are the megaform's own interior, and the drop in front becomes an edge tile.</li>
<li><b>Grid ratios:</b> 4× per side per tier, as in the simulation (tile 4 m, lot 16 m, block 64 m, superblock 256 m, region 1 km).
Mega-levels are integer multiples of the building level, and round 2's rational slopes apply unchanged at every tier.</li>
<li><b>Art LODs:</b> 16 px per cell at every tier, so zooming out 4× lands on the next tier's native density. Cross-fade below about 2×.
Each parent sprite is the coarse-graining of its children, which is the art contract. Here the far material paints the terraces the near
geometry actually has.</li>
<li><b>Lift and restrict:</b> the megaform's macrostate is its interior profile per mega-level plus per-slot totals, styles and portal flows.
Lift fills the slots near the camera, seeded by hash(world, tier, cell, slot, gen). Restrict sums them back. Distant slots relax into texture.
Nested megaforms are just more tiers under the same invariants.</li>
<li><b>UI:</b> a scale bar with tier names that snaps softly at boundaries, and an <em>Enter</em> action. Clicking a megaform re-anchors the view
on a slot, which becomes the ground, with breadcrumbs back (World › Hub › Rib 12 › Terrace 5 › Town). Tools change with the tier (region:
megaforms and trunks; block: slots and zoning; lot: building). Cloud-deck, night and street-peek toggles help read scale.</li></ul>
<p class="intro small">Details, per-render notes and what the kit gained (geometry-nodes instancing, LOD prototypes, megaform materials, fog bands,
clouds): <code>stratum/concepts/aesthetics/scale/NOTES.md</code>.</p></section>"""

NAV = ''.join('<a href="#%s">%s</a>' % (a, b) for a, b in (('powers', 'Powers of Ten'), ('mega', 'Megaforms'), ('cues', 'Scale cues'),
                                                          ('pixel', 'Nested pixels'), ('game', 'In the game')))
CSS = """
:root{--bg:#161615;--panel:#1f1e1c;--ink:#ece2cc;--muted:#a39b8c;--rule:#34322e;--accent:#e8a83c}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
header{padding:28px 16px 10px;max-width:1500px;margin:0 auto}
h1{font-size:26px;letter-spacing:.06em;text-transform:uppercase;margin:0 0 6px}h1 span{color:var(--accent)}
.lede{color:var(--muted);max-width:1000px;margin:0}
nav{position:sticky;top:0;z-index:5;background:rgba(22,22,21,.94);backdrop-filter:blur(6px);border-bottom:1px solid var(--rule);
 display:flex;gap:4px 16px;flex-wrap:wrap;padding:9px 16px;justify-content:center}
nav a{color:var(--muted);text-decoration:none;font-size:13px;letter-spacing:.04em}nav a:hover{color:var(--accent)}
main{max-width:1500px;margin:0 auto;padding:0 16px 60px}
section{padding-top:34px;border-top:1px solid var(--rule);margin-top:26px}
h2{font-size:20px;margin:0 0 6px}h2::before{content:"";display:inline-block;width:10px;height:10px;background:var(--accent);margin-right:10px;vertical-align:1px}
h3{font-size:16px;margin:22px 0 8px;color:var(--accent)}
.intro{color:var(--muted);max-width:1080px;margin:0 0 14px}.intro.small{font-size:14px}
code{font:12.5px/1 ui-monospace,Menlo,monospace;color:#d8c9a8;background:#2a2926;padding:1px 4px;border-radius:3px}
figure{margin:0 0 14px;background:var(--panel);border:1px solid var(--rule);border-radius:6px;overflow:hidden}
figure img{display:block;width:100%;height:auto;cursor:zoom-in;background:#111}img.pix{image-rendering:pixelated}
figcaption{padding:8px 11px 10px;color:#cfc6b4;font-size:13.5px}
.grid{display:grid;gap:14px}.g2{grid-template-columns:repeat(2,minmax(0,1fr))}.g3{grid-template-columns:repeat(3,minmax(0,1fr))}
ul.kit{max-width:1100px;padding-left:18px;color:#d8cfbd}ul.kit li{margin:0 0 9px}
#lb{position:fixed;inset:0;background:rgba(8,8,8,.93);display:none;align-items:center;justify-content:center;z-index:20;cursor:zoom-out;padding:16px}
#lb img{max-width:100%;max-height:100%}#lb.on{display:flex}
@media (max-width:900px){.g3{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){.g2,.g3{grid-template-columns:1fr}h1{font-size:21px}}
"""
JS = """
const lb=document.getElementById('lb'),li=lb.querySelector('img');
document.querySelectorAll('img.zoom').forEach(im=>im.addEventListener('click',()=>{li.src=im.src;li.style.imageRendering=im.classList.contains('pix')?'pixelated':'auto';lb.classList.add('on')}));
lb.addEventListener('click',()=>lb.classList.remove('on'));document.addEventListener('keydown',e=>{if(e.key==='Escape')lb.classList.remove('on')});
"""
page = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Megastructure Scale Round 3</title><style>%s</style></head><body>
<header><h1>Stratum <span>/</span> scale: megaforms that become ground</h1>
<p class="lede">Round 3 of the megastructure aesthetics, thinking one to three orders of magnitude bigger. Structures 10 to 1000 times the size of
ordinary buildings act as the ground that ordinary buildings are slotted into. The work covers a Powers of Ten sequence through one place, six
megaforms, a study of which cues make scale legible, pixel art at nested densities, and how tiers, slots and zoom could work in the game. The
look is stylised rather than realist, as in round 2. Click any image to enlarge it.</p></header>
<nav>%s</nav><main>%s%s</main><div id="lb"><img alt="enlarged view"></div><script>%s</script></body></html>""" % (CSS, NAV, ''.join(S), GAME, JS)
out = os.path.join(HERE, 'index.html')
open(out, 'w').write(page)
print('scale/index.html: %.2f MB' % (os.path.getsize(out) / 1e6))
