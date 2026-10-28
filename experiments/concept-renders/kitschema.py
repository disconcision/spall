"""
kitschema.py - the kit-of-parts vocabulary an agent writes against (pure Python, no bpy).

This is the contract between an LLM agent that authors a building type and the fixed renderer (kit.py).
Each part type lists its role (support / infill / transit / landscape / service / detail), whether it is solid for
overlap checks, and the params it understands.  kit.py asserts that every type here has a builder.
"""

PART_TYPES = {
    # type:        (role,        solid, params)
    'megacolumn': ('support', True, {'bands', 'capital', 'plinth', 'ribs'}),
    'column': ('support', True, {'bands', 'capital', 'plinth', 'ribs'}),
    'core': ('support', True, {'cabs', 'louvre', 'cap'}),
    'elevator': ('support', False, {'cabs'}),
    'truss': ('support', False, {'r'}),
    'deck': ('support', True, {'t', 'top', 'fascia', 'rail', 'rail_mat', 'beams', 'beam_mat'}),
    'slab': ('support', True, {'t', 'top', 'rail', 'rail_mat', 'beams', 'beam_mat'}),
    'floor': ('support', True, {'t', 'top', 'rail', 'rail_mat'}),
    'ground': ('support', True, {'t', 'grid'}),
    'block': ('support', True, {'shaft', 'shaft_floor', 'dots', 'dots_lit', 'slots', 'ledges', 'parapet', 'openings', 'ribs', 'rib_w', 'rib_d'}),
    'wall': ('support', True, {'shaft', 'dots', 'dots_lit', 'slots', 'ledges', 'parapet', 'openings', 'ribs'}),
    'capsule': ('infill', True, {'win', 'sides', 'module', 'win_w', 'win_h', 'sill', 'lit', 'interior', 'balcony', 'ac', 'cage',
                                 'roof', 'roof_mat', 'wall', 'broken'}),
    'unit': ('infill', True, {'win', 'sides', 'module', 'lit', 'interior', 'balcony', 'ac', 'cage', 'roof', 'broken'}),
    'greenhouse': ('infill', False, {'tiers', 'roof', 'roof_mat', 'floor_mat'}),
    'ruin': ('infill', True, {'broken', 'style', 'roofless'}),
    'shack': ('infill', True, {'roof_mat', 'lit'}),
    'tube': ('transit', False, {'rib', 'floor', 'train', 'train_len', 'lights'}),
    'viaduct': ('transit', True, {'t', 'tracks', 'mast', 'train', 'train_len'}),
    'pier': ('transit', True, set()),
    'bridge': ('transit', False, {'t', 'keel', 'keel_mat', 'enclosed', 'eh', 'rail', 'rail_mat', 'post', 'lamps'}),
    'stairs': ('transit', False, {'rail'}),
    'ramp': ('transit', False, {'rail'}),
    'train': ('transit', False, set()),
    'lightwell': ('landscape', False, {'rims', 'vines', 'shaft_light', 'skylight', 'rail_mat'}),
    'void': ('landscape', False, {'rims', 'vines', 'shaft_light', 'skylight'}),
    'terrace': ('landscape', False, {'surface', 'path', 'edge', 'trees', 'ntrees', 'tree_h', 'benches', 'rail', 'rail_mat', 'pool',
                                     'planter_mat'}),
    'tree': ('landscape', False, {'height', 'species'}),
    'planter': ('landscape', False, {'ph', 'planter_mat'}),
    'water': ('landscape', False, {'rim', 'rim_mat', 'rim_w'}),
    'waterfall': ('landscape', False, set()),
    'pipe': ('service', False, {'axis', 'n', 'r', 'flange'}),
    'duct': ('service', False, set()),
    'tank': ('service', False, {'legs', 'axis'}),
    'solar': ('service', False, set()),
    'turbine': ('service', False, {'blade'}),
    'antenna': ('detail', False, {'r', 'bars', 'dish', 'lightpt', 'beacon'}),
    'crane': ('detail', False, {'mast', 'jib', 'hook_at', 'drop', 'payload', 'payload_win', 'payload_mat', 'lightpt'}),
    'machine': ('detail', False, {'arm'}),
    'sign': ('detail', False, {'color', 'blade', 'proj'}),
    'laundry': ('detail', False, set()),
    'figure': ('detail', False, {'scale'}),
    'builder': ('detail', False, {'scale', 'weld', 'lightpt'}),
    'rubble': ('detail', False, {'n'}),
    'vehicle': ('detail', False, {'scale', 'headlight', 'power'}),
    'snow': ('detail', False, {'n', 'r'}),
    'lamp': ('detail', False, {'color', 'power'}),
    'light': ('detail', False, {'color', 'power', 'radius'}),
    'plane': ('detail', False, {'length'}),
}

ORIENTS = {'up', '+x', '-x', '+y', '-y', '-z'}

MATERIALS = {
    'concrete', 'concrete_light', 'concrete_dark', 'deck', 'panel', 'capsule_white', 'corrugated', 'steel', 'steel_dark',
    'steel_light', 'rust', 'pipe', 'pipe2', 'tube', 'train', 'crane', 'builder', 'olive', 'timber', 'timber_dark', 'glass',
    'glass_clear', 'glass_green', 'win_dark', 'win_a', 'win_b', 'win_c', 'lamp', 'void_dark', 'foliage', 'foliage2', 'foliage3',
    'grass', 'soil', 'planter', 'paving', 'ground', 'asphalt', 'water', 'solar', 'accent_a', 'accent_b', 'accent_c',
    'k_cream', 'k_pink', 'k_green', 'k_grey', 'k_blue', 'k_tile', 'cloth_a', 'cloth_b', 'cloth_c', 'cloth_d', 'furn_a', 'furn_b',
    'furn_c', 'blossom', 'blossom2', 'foliage_lime', 'crop', 'crop2', 'neon_red', 'neon_green', 'neon_cyan', 'neon_yellow',
    'neon_pink', 'neon_orange', 'neon_white',
}

PART_KEYS = {'id', 'type', 'x', 'y', 'level', 'w', 'd', 'h', 'rot', 'orient', 'material', 'tags', 'params'}

# words an LLM is likely to reach for -> the kit part that covers them (used for "did you mean" feedback)
ALIASES = {
    'hydroponic': 'greenhouse', 'rack': 'greenhouse', 'farm': 'greenhouse', 'glasshouse': 'greenhouse', 'grow': 'greenhouse',
    'room': 'capsule', 'apartment': 'capsule', 'flat': 'capsule', 'house': 'capsule', 'pod': 'capsule', 'module': 'capsule',
    'home': 'capsule', 'office': 'capsule', 'shop': 'capsule', 'pillar': 'megacolumn', 'post': 'column', 'beam': 'truss',
    'girder': 'truss', 'platform': 'deck', 'balcony': 'terrace', 'garden': 'terrace', 'park': 'terrace', 'roof_garden': 'terrace',
    'plant': 'planter', 'shrub': 'planter', 'lift': 'elevator', 'monorail': 'tube', 'maglev': 'tube', 'metro': 'tube',
    'rail': 'viaduct', 'road': 'viaduct', 'walkway': 'bridge', 'skybridge': 'bridge', 'catwalk': 'bridge', 'ladder': 'stairs',
    'staircase': 'stairs', 'atrium': 'lightwell', 'shaft': 'lightwell', 'pool': 'water', 'fountain': 'water', 'cascade': 'waterfall',
    'duct': 'duct', 'vent': 'duct', 'cistern': 'tank', 'silo': 'tank', 'panel': 'solar', 'pv': 'solar', 'windmill': 'turbine',
    'mast': 'antenna', 'dish': 'antenna', 'billboard': 'sign', 'neon': 'sign', 'robot': 'builder', 'drone': 'builder',
    'person': 'figure', 'citizen': 'figure', 'lamp_post': 'lamp', 'streetlight': 'lamp', 'monolith': 'block',
}

MAT_ALIASES = {
    'chrome': 'steel_light', 'metal': 'steel', 'aluminium': 'steel_light', 'aluminum': 'steel_light', 'iron': 'steel_dark',
    'wood': 'timber', 'oak': 'timber', 'bamboo': 'timber', 'brick': 'accent_a', 'terracotta': 'accent_a', 'copper': 'rust',
    'glass': 'glass_clear', 'window': 'win_a', 'white': 'capsule_white', 'plaster': 'panel', 'stone': 'concrete_light',
    'grass': 'grass', 'lawn': 'grass', 'dirt': 'soil', 'mud': 'soil', 'plants': 'foliage', 'leaves': 'foliage', 'gold': 'accent_c',
}
