"""contact_sheet.py - labelled contact sheet of the eight mock-ups (Pillow), drawn as a drawing-set index sheet.

    python3 contact_sheet.py   ->  out/contact_sheet.png (3000 x 4482)
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
FONT = os.path.join(HERE, 'src', 'fonts')


def F(name, size):
    return ImageFont.truetype(os.path.join(FONT, name), size)


SERIF = lambda s: F('InstrumentSerif-400-normal-latin.woff2', s)
COND = lambda s: F('BarlowCondensed-600-normal-latin.woff2', s)
COND7 = lambda s: F('BarlowCondensed-700-normal-latin.woff2', s)
UI = lambda s: F('BarlowSemiCondensed-400-normal-latin.woff2', s)
MONO = lambda s: F('IBMPlexMono-400-normal-latin.woff2', s)

PAPER, INK, INK2, ACC = (235, 232, 224), (28, 29, 32), (91, 93, 97), (255, 225, 58)

SHEETS = [
    ('m1_level_hud', 'A-108', 'Level navigation HUD',
     'Cutaway at L8 with the 3 levels below faded (value/saturation only) and structure to L12 as ghost massing. Level strip of '
     'named strata with fill vs the 50% cap and light; persistent slice-on banner; live section thumbnail; picked-capsule tooltip.'),
    ('m2_section_services', 'S-201', 'Section and services',
     'Section A-A through core B: six risers in the cut core, manifolds in each truss zone, lifts, cistern and substation in the '
     'undercroft. A level-aligned table gives fill vs the Friedman 50% cap, daylight, air and a land-value-by-height ramp.'),
    ('m3_pattern_book', 'P-012', 'Pattern book and stamping',
     'Capture, template and pattern tiers in an A Pattern Language-style book. P-12 is a context rule with template parameters '
     'and live variants. Its stamp in a floating design frame: ghosts, riser runs, and a ghost-claim-fetch-build queue with policies.'),
    ('m4_agent_cobuild', 'A-125', 'Embodied agent co-building',
     "Claude's cursor, gaze reticle and saccade trail on a ghost sky bridge inside a revision cloud. The proposal sheet lists cost, "
     'light, loads and steps; the player points with numbered chips; drones claim steps; an edge marker shows the off-level Surveyor.'),
    ('m5_mod_request', 'MR-0031', 'Mod request: a new building type',
     'A real agent-authored type (agent-buildings/hydro_stack): brief, spec excerpt, 4 kit64 rotations, concept view, validator '
     'history v1 FAIL to v4 PASS, a new part type flagged for review, an 8-seed A/B (mock numbers), Install, and the new build-menu tile.'),
    ('m6_accretion_timeline', 'T-005', 'Accretion timeline and runaway Builders',
     'Replay of the growing block (the concept time-lapse frames) scrubbed to phase 5, with the phase-6 blueprint in blue. Agent and '
     'crew lanes, a planned zone past now, and an armed "cut the Netsphere link" control whose projection is the BLAME! void.'),
    ('m7_sound_map', 'N-201', 'Sound design map',
     'Night section as a listening diagram: undercroft hum, street murmur, transit whoosh, shaft reverb, canopy wind, lift chimes '
     'and interiors as zones with dB contours. Per-level loudness, deck occlusion, a bus mixer, a zone detail and a spectrogram.'),
    ('m8_pixel_mode', 'A-108/px', 'Pixel mode: classic Maxis look',
     'The same block and slice rendered through the kit64 sprite camera and palette-locked (40 colours), set into a district of stock '
     'kit sprites. Same HUD grammar on a 2-px grid: level strip, slice banner, paper tooltip, dithered pixel ghost, agent cursor.'),
]


def wrap(draw, text, font, width):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=font) <= width:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines


def main():
    TW, TH = 1400, 788                 # thumbnail (2560 x 1440 at 0.547)
    M, G = 70, 60                      # margin, gutter
    CAP = 190                          # caption block under each thumbnail
    W = M * 2 + TW * 2 + G
    head = 250
    H = head + 4 * (TH + CAP + G) - G + M + 70
    im = Image.new('RGB', (W, H), PAPER)
    d = ImageDraw.Draw(im)
    # sheet border + title block across the top
    d.rectangle([24, 24, W - 25, H - 25], outline=INK, width=3)
    d.text((M, 58), 'TESSERA · UI MOCK-UPS · CONTACT SHEET', font=COND(30), fill=INK2)
    d.text((M, 96), 'Eight screens in one drawing-set language', font=SERIF(84), fill=INK)
    d.text((M, 196), 'Renders: concept-renders kit (Blender 5.0 EEVEE) re-run for exact overlays · agent-buildings sprites · HTML/CSS/SVG overlays '
                     'captured with headless Chrome at 2560 × 1440 · 2026-09-30', font=UI(26), fill=INK2)
    # legend swatches
    lx = W - M - 700
    for i, (c, t) in enumerate([(ACC, 'accent: focus, agent, action'), ((127, 176, 255), 'ghost: planned, not built'),
                                (INK, 'poche / panel ink'), ((221, 148, 120), 'problem only')]):
        y = 64 + i * 36
        d.rectangle([lx, y, lx + 26, y + 26], fill=c, outline=INK)
        d.text((lx + 40, y - 2), t, font=UI(25), fill=INK)
    d.line([M, head - 16, W - M, head - 16], fill=INK, width=3)

    for i, (name, sheet, title, desc) in enumerate(SHEETS):
        col, row = i % 2, i // 2
        x = M + col * (TW + G)
        y = head + row * (TH + CAP + G)
        th = Image.open(os.path.join(OUT, name + '.png')).convert('RGB').resize((TW, TH), Image.LANCZOS)
        im.paste(th, (x, y))
        d.rectangle([x - 1, y - 1, x + TW, y + TH], outline=INK, width=2)
        # caption: number bubble, title, sheet no., description
        cy = y + TH + 18
        d.ellipse([x, cy, x + 58, cy + 58], fill=INK)
        n = str(i + 1)
        tw = d.textlength(n, font=COND7(38))
        d.text((x + 29 - tw / 2, cy + 6), n, font=COND7(38), fill=PAPER)
        d.text((x + 78, cy - 6), title, font=SERIF(52), fill=INK)
        sw = d.textlength(sheet, font=MONO(30))
        d.rectangle([x + TW - sw - 30, cy + 6, x + TW, cy + 50], outline=INK, width=2)
        d.text((x + TW - sw - 15, cy + 10), sheet, font=MONO(30), fill=INK)
        for k, line in enumerate(wrap(d, desc, UI(25), TW - 80)[:3]):
            d.text((x + 78, cy + 64 + k * 32), line, font=UI(25), fill=INK2)
        d.text((x + 78, cy + 64 + 3 * 32 + 2), 'out/%s.png  ·  src/%s.html' % (name, name), font=MONO(19), fill=(124, 127, 129))
    im.save(os.path.join(OUT, 'contact_sheet.png'), optimize=True)
    print('contact sheet', im.size)


if __name__ == '__main__':
    main()
