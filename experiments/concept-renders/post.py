"""
post.py - captions, time-lapse assembly (GIF + MP4 via ffmpeg), plan annotation, catalogue + contact sheets.

    python3 post.py
"""
import json, math, os, shutil, subprocess
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
FFMPEG = '/opt/homebrew/bin/ffmpeg'


def font(name, size):
    p = {'regular': '/Library/Fonts/Roboto-Regular.ttf', 'bold': '/Library/Fonts/Roboto-Bold.ttf',
         'medium': '/Library/Fonts/Roboto-Medium.ttf', 'mono': '/System/Library/Fonts/Menlo.ttc'}[name]
    return ImageFont.truetype(p, size) if os.path.exists(p) else ImageFont.load_default()


# ------------------------------------------------------------------------------------------ captions (also used by the notes)
CAPTIONS = {
    'a_blame.png': ('(a) BLAME! - the void', 'Megablocks around a bottomless void; lit settlements on sheer walls, bridges at every depth, light shafts, far floor slab.'),
    'a_blame_close.png': ('(a) BLAME! - settlement detail', 'A capsule settlement bolted to a wall ledge between light shafts; scale comes from the tiny lit windows.'),
    'b_glt.png': ("(b) Girls' Last Tour - strata", 'Three stacked city strata; the silent top layer under snow, broken slab edges, pipes, a stalled train, haze below.'),
    'b_glt_close.png': ("(b) Girls' Last Tour - top layer", 'Snow on every upward face (shader), ruins with empty windows, derelict crane, pipes along the streets.'),
    'c_kowloon.png': ('(c) Kowloon accretion - dusk', 'Lot-by-lot accretion with floor-by-floor overhangs, add-on rooms, neon blade signs, antenna forest, low-rise context.'),
    'c_kowloon_close.png': ('(c) Kowloon - facade detail', 'Window grids, AC boxes, window cages, blade signs, roof shacks and the rooftop passage network.'),
    'd_solarpunk.png': ('(d) Solarpunk arcology - golden hour', 'Terraced timber-and-glass hill: gardens on every step, blossoms, cascades to a lake, solar + wind towers, tram.'),
    'd_solarpunk_close.png': ('(d) Solarpunk - terraces', 'Low-poly trees and flowering canopies on each terrace; units with ribbon glazing along the step risers.'),
    'e_mixed.png': ('(e) Mixed directions', 'Inner corner of a shaft: towers grow sideways off both walls (orient +x/-y), hang from a ceiling (-z), stand on ledges.'),
    'f_arcology.png': ('Canonical arcology (overcast)', 'Supports (megacolumn grid, 4 decks, trusses) + capsule infill capped at 50%/level, atria, tube, viaduct, roof garden.'),
    'v1_full.png': ('Level views 1 - full', 'The canonical arcology cropped to its site like an architectural model; poche on the crop faces.'),
    'v2_cutaway_L8.png': ('Level views 2 - cutaway at level 8', 'Everything above L8 removed; cut faces capped with hatched poche; capsule interiors and the tube train exposed.'),
    'v2b_cutaway_L14.png': ('Level views 2b - cutaway at level 14', 'Same, one stratum higher.'),
    'v3_ghost_L8.png': ('Level views 3 - ghosted upper levels', 'Below L8 solid with poche; above L8 as translucent blueprint massing (one box per part).'),
    'v4_exploded.png': ('Level views 4 - exploded axonometric', 'Strata split at the deck soffits and lifted apart; dashed leader lines at the site corners.'),
    'v5_section_x13.png': ('Level views 5 - vertical section', 'Plane cut at x = 13 cells through a megacolumn line; decks, columns and the tube in poche.'),
    'v6_plan_L12_annotated.png': ('Level views 6 - plan, level 12', 'Top-down orthographic cut 1.75 m above the L12 deck; lower levels fade with depth; 4 m grid.'),
    'l_arcology_overcast.png': ('Lighting - overcast day', 'Soft sun (28 deg angle), grey sky fill, light height/depth haze.'),
    'l_arcology_dusk.png': ('Lighting - dusk', 'Low warm sun from the back-left, violet sky, warm emissive windows, bloom.'),
    'l_arcology_night.png': ('Lighting - night', 'Moonlight fill only; emissive windows, lamps and trains carry the image; strong bloom.'),
    'l_kowloon_night.png': ('Lighting - Kowloon night', 'Neon and windows at night; context city recedes.'),
    'l_blame_night.png': ('Lighting - BLAME! night', 'The void at night: settlements and bridge lamps only.'),
    'l_solarpunk_dusk.png': ('Lighting - solarpunk dusk', 'Same terraces at dusk; warm windows through the gardens.'),
    'p1_sprite_strip.png': ('Sprite pipeline - strip', '3D render -> aliased 32 px/tile sprite -> kit64 palette-locked sprite at 4x.'),
    'p2_sprite_rotations.png': ('Sprite pipeline - 4 rotations', 'Model turned under a fixed camera and sun; 3 stages x 4 rotations.'),
    'p3_sprite_sheet.png': ('Sprite pipeline - sheet', 'Palette-locked sprites for two buildings x 4 rotations, kit buildings, ground tiles.'),
    'p4_ingame_mock.png': ('Sprite pipeline - in-game mock', 'SC2K-style tile map composed only from kit64 sprites, farm included twice.'),
    'p5_agent_loop.png': ('Sprite pipeline - agent loop', 'Spec excerpt; validator output for the flawed v1 draft (8 errors) and the fixed v2 (PASS).'),
    'p6_palette_compare.png': ('Sprite pipeline - palettes', 'Raw vs adaptive 64 (median cut) vs kit64 master palette.'),
    'catalog_sheet.png': ('Kit-of-parts catalogue', 'One of each part type, same camera and light.'),
}


def caption(path):
    return CAPTIONS.get(os.path.basename(path), (os.path.basename(path), ''))


def wrap(d, text, f, width):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=f) <= width:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines


# ------------------------------------------------------------------------------------------ time-lapse
def timelapse():
    jobs = json.load(open(os.path.join(HERE, 'jobs', 'timelapse.json')))['jobs']
    src = [os.path.join(HERE, j['out']) for j in jobs]
    labels = [j['label'] for j in jobs]
    capd = os.path.join(OUT, 'timelapse', 'captioned')
    if os.path.isdir(capd):
        shutil.rmtree(capd)
    os.makedirs(capd)
    capt = []
    for i, (p, lab) in enumerate(zip(src, labels)):
        im = Image.open(p).convert('RGB')
        W, H = im.size
        d = ImageDraw.Draw(im, 'RGBA')
        d.rectangle([0, H - 86, W, H], fill=(20, 22, 26, 200))
        d.text((36, H - 70), 'ACCRETION  phase %s' % lab, font=font('bold', 30), fill=(240, 238, 232))
        sub = 'supports first, then transit, then infill (capped at 50%/level), then gardens and lights; blue = the agents\' next blueprint'
        d.text((36, H - 32), sub, font=font('regular', 17), fill=(190, 190, 196))
        for k in range(len(src)):
            x = W - 40 - (len(src) - k) * 28
            d.ellipse([x, H - 58, x + 16, H - 42], fill=(240, 180, 70, 255) if k <= i else (90, 92, 100, 255))
        cp = os.path.join(capd, 'cap_%02d.png' % i)
        im.save(cp)
        capt.append(cp)
    # sequence with holds + crossfades at 12 fps, piped straight into ffmpeg as raw RGB (no temp PNGs)
    ims = [Image.open(c).convert('RGB') for c in capt]
    W, H = ims[0].size
    mp4 = os.path.join(OUT, 'accretion_timelapse.mp4')
    gif = os.path.join(OUT, 'accretion_timelapse.gif')
    proc = subprocess.Popen([FFMPEG, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H),
                             '-r', '12', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', mp4],
                            stdin=subprocess.PIPE)
    n = 0
    for i, im in enumerate(ims):
        raw = im.tobytes()
        for _ in range(16 if i < len(ims) - 1 else 30):
            proc.stdin.write(raw); n += 1
        if i < len(ims) - 1:
            for t in range(1, 7):
                proc.stdin.write(Image.blend(im, ims[i + 1], t / 7.0).tobytes()); n += 1
    proc.stdin.close()
    proc.wait()
    pal = os.path.join(OUT, 'timelapse', 'palette.png')
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', mp4, '-vf', 'fps=12,scale=800:-1:flags=lanczos,palettegen=stats_mode=diff', pal],
                   check=True)
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', mp4, '-i', pal, '-lavfi',
                    'fps=12,scale=800:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4', '-loop', '0', gif], check=True)
    print('time-lapse: %d frames -> %s (%.1f MB), %s (%.1f MB)' % (n, os.path.basename(mp4), os.path.getsize(mp4) / 1e6,
                                                                   os.path.basename(gif), os.path.getsize(gif) / 1e6))
    return capt


# ------------------------------------------------------------------------------------------ plan annotation
def plan_annotate():
    p = os.path.join(OUT, 'v6_plan_L12.png')
    cam = json.load(open(os.path.join(OUT, 'v6_plan_L12.cam.json')))
    im = Image.open(p).convert('RGB')
    W, H = im.size
    ppm = W / cam['scale']
    cx, cy = cam['cx'], cam['cy']

    def px(X, Y):
        return (X - cx) * ppm + W / 2, H / 2 - (Y - cy) * ppm
    d = ImageDraw.Draw(im, 'RGBA')
    cell = 4.0
    for gx in range(-1, 24):
        x0, y0 = px(gx * cell, -2 * cell); x1, y1 = px(gx * cell, 17 * cell)
        d.line([(x0, y0), (x1, y1)], fill=(40, 60, 90, 38 if gx % 5 else 80), width=1)
    for gy in range(-2, 18):
        x0, y0 = px(-1.5 * cell, gy * cell); x1, y1 = px(23 * cell, gy * cell)
        d.line([(x0, y0), (x1, y1)], fill=(40, 60, 90, 38 if gy % 5 else 80), width=1)
    # axis labels on the 5-cell lines
    f = font('regular', 14)
    for gx in range(0, 24, 5):
        x, y = px(gx * cell, 17.2 * cell)
        d.text((x - 6, y - 20), str(gx), font=f, fill=(40, 60, 90, 200))
    for gy in range(0, 18, 5):
        x, y = px(-1.8 * cell, gy * cell)
        d.text((x - 22, y - 8), str(gy), font=f, fill=(40, 60, 90, 200))
    # title block
    d.rectangle([W - 470, H - 150, W - 30, H - 30], fill=(250, 248, 242, 235), outline=(40, 40, 44, 255), width=2)
    d.text((W - 450, H - 138), 'LEVEL 12 PLAN', font=font('bold', 28), fill=(30, 30, 34))
    d.text((W - 450, H - 100), 'cut +1.75 m above deck 12  |  grid 4 m (5-cell lines bold)', font=font('regular', 15), fill=(60, 60, 64))
    # scale bar 20 m
    sx0, sy = W - 450, H - 60
    L = 20 * ppm
    for i in range(4):
        d.rectangle([sx0 + i * L / 4, sy, sx0 + (i + 1) * L / 4, sy + 10], fill=(30, 30, 34) if i % 2 == 0 else (250, 248, 242),
                    outline=(30, 30, 34))
    d.text((sx0 + L + 10, sy - 4), '20 m', font=font('regular', 15), fill=(30, 30, 34))
    # north arrow (+y up)
    ax, ay = W - 90, H - 95
    d.polygon([(ax, ay - 32), (ax - 12, ay + 8), (ax, ay), (ax + 12, ay + 8)], fill=(30, 30, 34))
    d.text((ax - 6, ay + 10), 'N', font=font('bold', 16), fill=(30, 30, 34))
    out = os.path.join(OUT, 'v6_plan_L12_annotated.png')
    im.save(out)
    return out


# ------------------------------------------------------------------------------------------ catalogue
def catalog_sheet():
    spec = json.load(open(os.path.join(HERE, 'specs', 'catalog.json')))
    labels = {}
    for p in spec['parts']:
        i = int([t for t in p['tags'] if t.startswith('cat:')][0][4:])
        labels[i] = [t for t in p['tags'] if t.startswith('label:')][0][6:]
    files = sorted(f for f in os.listdir(os.path.join(OUT, 'catalog')) if f.endswith('.png'))
    cols, cw, chh = 6, 300, 300
    rows = math.ceil(len(files) / cols)
    W, H = cols * cw + 80, rows * (chh + 40) + 150
    im = Image.new('RGB', (W, H), (236, 233, 226))
    d = ImageDraw.Draw(im)
    d.text((40, 28), 'Kit-of-parts catalogue (%d part types rendered by kit.py; the spec vocabulary an agent composes)' % len(files),
           font=font('bold', 28), fill=(30, 30, 34))
    d.text((40, 72), 'each tile: one part with default params, same orthographic 2:1 camera and studio light; parts also accept rot, '
                     'orient (+x/-x/+y/-y/-z), material and params', font=font('regular', 17), fill=(90, 88, 84))
    for k, f in enumerate(files):
        t = Image.open(os.path.join(OUT, 'catalog', f)).convert('RGBA')
        t.thumbnail((cw - 20, chh - 20), Image.LANCZOS)
        x, y = 40 + (k % cols) * cw, 120 + (k // cols) * (chh + 40)
        d.rectangle([x + 4, y + 4, x + cw - 8, y + chh - 8], fill=(246, 244, 239))
        im.paste(t, (x + (cw - t.width) // 2, y + (chh - t.height) // 2), t)
        i = int(f[:2])
        d.text((x + 10, y + chh - 4), labels.get(i, f[3:-4]), font=font('medium', 17), fill=(30, 30, 34))
    out = os.path.join(OUT, 'catalog_sheet.png')
    im.save(out)
    return out


# ------------------------------------------------------------------------------------------ contact sheets
def contact(name, title, subtitle, files, cols=3, tw=620, th=None, bg=(24, 25, 30), fg=(236, 233, 226), sub=(165, 166, 172)):
    th = th or int(tw * 0.625)
    items = []
    for f in files:
        p = f if os.path.isabs(f) else os.path.join(OUT, f)
        if not os.path.exists(p):
            print('missing', p); continue
        im = Image.open(p).convert('RGB')
        sc = min(tw / im.width, th / im.height)
        items.append((p, im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc))), Image.LANCZOS)))
    rows = math.ceil(len(items) / cols)
    fT, fS = font('medium', 19), font('regular', 15)
    tmp = ImageDraw.Draw(Image.new('RGB', (10, 10)))
    caph = []
    for r in range(rows):
        row = items[r * cols:(r + 1) * cols]
        caph.append(max(len(wrap(tmp, caption(p)[1] + '  [%s]' % os.path.relpath(p, OUT), fS, tw)) for p, _ in row) * 19 + 40)
    W = cols * (tw + 30) + 50
    H = 130 + sum(th + c + 30 for c in caph) + 10
    sheet = Image.new('RGB', (W, H), bg)
    d = ImageDraw.Draw(sheet)
    d.text((40, 28), title, font=font('bold', 32), fill=fg)
    d.text((40, 76), subtitle, font=font('regular', 17), fill=sub)
    y = 130
    for r in range(rows):
        for c, (p, t) in enumerate(items[r * cols:(r + 1) * cols]):
            x = 40 + c * (tw + 30)
            d.rectangle([x, y, x + tw - 1, y + th - 1], fill=tuple(min(255, v + 10) for v in bg))
            sheet.paste(t, (x + (tw - t.width) // 2, y + (th - t.height) // 2))
            ti, s = caption(p)
            d.text((x, y + th + 10), ti, font=fT, fill=fg)
            yy = y + th + 38
            for ln in wrap(d, s + '  [%s]' % os.path.relpath(p, OUT), fS, tw):
                d.text((x, yy), ln, font=fS, fill=sub); yy += 19
        y += th + caph[r] + 30
    out = os.path.join(OUT, name)
    sheet.save(out)
    print('sheet', name, sheet.size)
    return out


if __name__ == '__main__':
    capt = timelapse()
    plan_annotate()
    catalog_sheet()
    for i, lab in enumerate(json.load(open(os.path.join(HERE, 'jobs', 'timelapse.json')))['jobs']):
        CAPTIONS['cap_%02d.png' % i] = ('Frame %d' % i, 'phase ' + lab['label'])
    contact('sheet_1_variants.png', 'Aesthetic variants - same 2:1 orthographic camera (elevation 30 deg, azimuth 45 deg)',
            'All scenes are JSON kit-of-parts specs from gen.py (seeded) rendered by kit.py in Blender 5.0 EEVEE; 1600x1000, 64 samples, 1-10 s each.',
            ['a_blame.png', 'a_blame_close.png', 'b_glt.png', 'b_glt_close.png', 'c_kowloon.png', 'c_kowloon_close.png',
             'd_solarpunk.png', 'd_solarpunk_close.png', 'e_mixed.png'])
    contact('sheet_2_levels.png', 'Level-view concepts on the canonical arcology',
            'Cutaways and sections are real geometry operations (bmesh bisect) with hatched poche caps; the ghost is per-part massing; the plan is a top-down ortho cut.',
            ['v1_full.png', 'v2_cutaway_L8.png', 'v2b_cutaway_L14.png', 'v3_ghost_L8.png', 'v4_exploded.png', 'v5_section_x13.png',
             'v6_plan_L12_annotated.png', 'f_arcology.png'], cols=3)
    contact('sheet_3_lighting.png', 'Lighting variants', 'Same specs, lighting presets swapped in kit.py (sun, sky, window/neon emission, bloom, haze colours).',
            ['l_arcology_overcast.png', 'l_arcology_dusk.png', 'l_arcology_night.png', 'l_kowloon_night.png', 'l_blame_night.png',
             'l_solarpunk_dusk.png'])
    contact('sheet_4_timelapse.png', 'Accretion time-lapse (10 frames; GIF + MP4 alongside)',
            'Parts carry phase:N / until:N tags; each frame renders parts with phase <= N; the next phase is drawn as blue blueprint massing.',
            capt, cols=4, tw=470)
    contact('sheet_5_sprites.png', 'Agent-authored building -> sprite pipeline',
            'Hand-written spec (stand-in for an LLM) -> agent_check.py -> kit.py sprite mode (aliased, 32 px/tile, 4 rotations) -> Pillow kit64 palette lock.',
            ['p1_sprite_strip.png', 'p2_sprite_rotations.png', 'p5_agent_loop.png', 'p3_sprite_sheet.png', 'p4_ingame_mock.png',
             'p6_palette_compare.png'], cols=3, tw=640, th=520)
    contact('sheet_0_overview.png', 'Megastructure city-builder concept renders - overview',
            'Kit-of-parts JSON -> Blender 5.0 (headless EEVEE, Apple M1 Max) -> Pillow. One image per deliverable; see the other sheets for the full sets.',
            ['a_blame.png', 'b_glt.png', 'c_kowloon.png', 'd_solarpunk.png', 'e_mixed.png', 'l_arcology_dusk.png', 'v2_cutaway_L8.png',
             'v4_exploded.png', 'v6_plan_L12_annotated.png', 'p1_sprite_strip.png', 'p4_ingame_mock.png', 'catalog_sheet.png'], cols=4, tw=470)
