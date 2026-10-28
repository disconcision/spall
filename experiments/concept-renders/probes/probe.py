import bpy, sys, time
print("VERSION", bpy.app.version_string)
eng = bpy.types.RenderSettings.bl_rna.properties['engine']
print("ENGINES", [e.identifier for e in eng.enum_items])
scene = bpy.context.scene
print("current engine", scene.render.engine)
# eevee props
try:
    scene.render.engine = 'BLENDER_EEVEE'
    print("set BLENDER_EEVEE ok")
except Exception as e:
    print("BLENDER_EEVEE fail", e)
try:
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    print("set BLENDER_EEVEE_NEXT ok")
except Exception as e:
    print("BLENDER_EEVEE_NEXT fail", e)
ee = scene.eevee
print("EEVEE props", [p.identifier for p in ee.bl_rna.properties][:200])
print("view_settings looks", [e.identifier for e in scene.view_settings.bl_rna.properties['view_transform'].enum_items])
print("compositor", hasattr(scene, 'compositing_node_group'), hasattr(scene, 'node_tree'))
print("scene props with comp", [p.identifier for p in scene.bl_rna.properties if 'comp' in p.identifier.lower() or 'node' in p.identifier.lower()])
