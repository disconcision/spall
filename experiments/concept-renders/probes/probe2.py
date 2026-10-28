import bpy, sys, time, math
scene = bpy.context.scene
for vt in ['AgX','Filmic','Standard','Khronos PBR Neutral']:
    try:
        scene.view_settings.view_transform = vt
        print("VT ok", vt)
    except Exception as e:
        print("VT fail", vt, e)
scene.view_settings.view_transform = 'AgX'
print("looks:", [e.identifier for e in scene.view_settings.bl_rna.properties['look'].enum_items_static][:5])
try:
    scene.view_settings.look = 'AgX - Punchy'
    print('look ok')
except Exception as e:
    print('look fail', e)
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 800
scene.render.resolution_y = 500
scene.render.resolution_percentage = 100
scene.eevee.taa_render_samples = 16
# simple scene
bpy.ops.mesh.primitive_cube_add(size=2)
cam = bpy.data.objects['Camera']
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 10
el = math.atan(0.5)
az = math.radians(45)
d = 30
cam.location = (d*math.cos(el)*math.cos(az), -d*math.cos(el)*math.sin(az), d*math.sin(el))
cam.rotation_euler = (math.pi/2 - el, 0, math.radians(45))
scene.render.filepath = '/tmp/claude-501/probe_eevee.png'
t=time.time()
bpy.ops.render.render(write_still=True)
print("EEVEE render time", time.time()-t)
# compositor probe
ng = bpy.data.node_groups.new("Comp", "CompositorNodeTree")
scene.compositing_node_group = ng
print("comp node types:", [n for n in dir(bpy.types) if n.startswith('CompositorNode')][:200])
g = ng.nodes.new('CompositorNodeGlare')
print("glare inputs", [(i.name, i.type) for i in g.inputs])
print("glare props", [p.identifier for p in g.bl_rna.properties])
