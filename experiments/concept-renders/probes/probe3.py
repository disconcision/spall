import bpy, sys, time, math
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 400
scene.render.resolution_y = 250
scene.eevee.taa_render_samples = 8
# emissive cube
bpy.ops.mesh.primitive_cube_add(size=2)
ob = bpy.context.active_object
mat = bpy.data.materials.new("emit")
print("mat use_nodes default", mat.use_nodes)
nt = mat.node_tree
print("mat nodes", [n.bl_idname for n in nt.nodes] if nt else None)
em = nt.nodes.new('ShaderNodeEmission')
em.inputs['Strength'].default_value = 20
em.inputs['Color'].default_value = (1,0.5,0.2,1)
out = [n for n in nt.nodes if n.bl_idname=='ShaderNodeOutputMaterial'][0]
nt.links.new(em.outputs[0], out.inputs['Surface'])
ob.data.materials.append(mat)
print("mat props render method", mat.surface_render_method if hasattr(mat,'surface_render_method') else 'none')
print("object vis props", [p for p in ['visible_shadow','visible_diffuse','visible_camera','visible_glossy'] if hasattr(ob,p)])
# compositor
ng = bpy.data.node_groups.new("Comp", "CompositorNodeTree")
print("interface", ng.interface)
s = ng.interface.new_socket(name="Image", in_out='OUTPUT', socket_type='NodeSocketColor')
rl = ng.nodes.new('CompositorNodeRLayers')
go = ng.nodes.new('NodeGroupOutput')
gl = ng.nodes.new('CompositorNodeGlare')
print("glare type menu items:", gl.inputs['Type'].default_value)
try:
    gl.inputs['Type'].default_value = 'Bloom'
    print("set Bloom ok")
except Exception as e:
    print("bloom set fail", e)
gl.inputs['Threshold'].default_value = 1.0
gl.inputs['Strength'].default_value = 1.0
gl.inputs['Size'].default_value = 0.5
print("rl outputs", [o.name for o in rl.outputs])
print("glare outputs", [o.name for o in gl.outputs])
ng.links.new(rl.outputs['Image'], gl.inputs['Image'])
ng.links.new(gl.outputs['Image'], go.inputs[0])
scene.compositing_node_group = ng
print("use_compositing", scene.render.use_compositing)
cam = bpy.data.objects['Camera']
cam.data.type='ORTHO'; cam.data.ortho_scale=8
el = math.radians(30); az = math.radians(45); d=30
cam.location = (d*math.cos(el)*math.cos(az), -d*math.cos(el)*math.sin(az), d*math.sin(el))
cam.rotation_euler = (math.pi/2 - el, 0, az)
scene.render.filepath = '/tmp/claude-501/probe_bloom.png'
t=time.time()
bpy.ops.render.render(write_still=True)
print("render time", time.time()-t)
# check other shader nodes exist
for n in ['ShaderNodeTexWhiteNoise','ShaderNodeMapRange','ShaderNodeMix','ShaderNodeValToRGB','ShaderNodeWireframe','ShaderNodeAttribute']:
    print(n, hasattr(bpy.types, n))
# test Mix node API
m = nt.nodes.new('ShaderNodeMix')
print("mix data_type", m.data_type, [i.name+':'+i.type for i in m.inputs])
