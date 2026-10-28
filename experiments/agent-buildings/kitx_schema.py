"""
kitx_schema.py - vocabulary extensions for the agent-buildings experiment (pure Python, no bpy).

extend(kitschema) adds new part types / materials / aliases to the stock vocabulary IN MEMORY (the stock file is
not modified), so the stock validator and the extended one both accept them.  kitx_parts.py holds the matching
Blender builders.  Initially empty: parts are only added when a brief is blocked (see log/).
"""

NEW_PART_TYPES = {
    # type: (role, solid, params)
    'growpod': ('infill', True, {'tiers', 'sides', 'glow', 'mullion', 'crop', 'ends'}),   # ext 1 (hydro_stack)
    'lantern': ('detail', False, {'n', 'colors', 'size', 'sag', 'posts', 'light'}),        # ext 2 (bridge_market)
    'vines': ('landscape', False, {'density', 'lmin', 'lmax', 'width', 'leaves', 'mats'}),  # ext 3 (hanging_garden)
}
NEW_MATERIALS = {'growlight_px', 'sunpipe_px', 'glass_px', 'glass_green_px', 'lantern_red', 'lantern_orange', 'lantern_yellow', 'lantern_white', 'lantern_pink', 'lantern_green'}
NEW_ALIASES = {
    'hydroponics': 'growpod', 'growpod': 'growpod', 'grow_pod': 'growpod', 'pod_farm': 'growpod',
    'vine': 'vines', 'ivy': 'vines', 'creeper': 'vines', 'trailing_plants': 'vines', 'climbers': 'vines',
    'lanterns': 'lantern', 'string_lights': 'lantern', 'fairy_lights': 'lantern', 'bunting': 'lantern', 'paper_lantern': 'lantern',
}


def extend(kitschema):
    kitschema.PART_TYPES.update(NEW_PART_TYPES)
    kitschema.MATERIALS.update(NEW_MATERIALS)
    kitschema.ALIASES.update(NEW_ALIASES)
    return kitschema
