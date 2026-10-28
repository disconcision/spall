"""icons.py - build-menu icons from palette-locked sprites (crop to content, integer scale only, never resampled)."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT = os.path.normpath(os.path.join(HERE, '..', 'src', 'img', 'icons'))
SRC = {
    'hydro_stack': 'agent-buildings/out/sprites/hydro_stack_r0_pal.png',
    'bridge_market': 'agent-buildings/out/sprites/bridge_market_r0_pal.png',
    'hanging_garden': 'agent-buildings/out/sprites/hanging_garden_r0_pal.png',
    'tube_interchange': 'agent-buildings/out/sprites/tube_interchange_r0_pal.png',
    'solar_chimney': 'agent-buildings/out/sprites/solar_chimney_r0_pal.png',
    'rooftop_village': 'agent-buildings/out/sprites/rooftop_village_r0_pal.png',
    'farm': 'concept-renders/out/sprites/agent_vertical_farm_r0_pal.png',
    'res_tower': 'concept-renders/out/sprites/spr_res_tower_r0_pal.png',
    'capsule_stack': 'concept-renders/out/sprites/spr_capsule_stack_r0_pal.png',
    'megacolumn': 'concept-renders/out/sprites/spr_megacolumn_r0_pal.png',
    'park': 'concept-renders/out/sprites/spr_park_r0_pal.png',
    'plaza': 'concept-renders/out/sprites/spr_plaza_r0_pal.png',
    'station': 'concept-renders/out/sprites/spr_station_r0_pal.png',
}
os.makedirs(OUT, exist_ok=True)
for k, p in SRC.items():
    im = Image.open(os.path.join(EXP, p)).convert('RGBA')
    im = im.crop(im.getbbox())
    box = 84
    if im.width > box or im.height > box:          # integer reduction only (keeps pixels square)
        f = max(-(-im.width // box), -(-im.height // box))
        im = im.resize((im.width // f, im.height // f), Image.NEAREST)
    canvas = Image.new('RGBA', (box, box), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((box - im.width) // 2, box - im.height))
    canvas.save(os.path.join(OUT, k + '.png'))
    print(k, im.size)
