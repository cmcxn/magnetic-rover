"""Independent reference-matched battery source; Blender4.3+, no external assets/fonts.
Source-only this phase: generated sprites remain under art/, NOT runtime assets.
"""
import bpy,json,os,math
from mathutils import Vector
P=os.path.dirname(os.path.abspath(__file__));REF=json.load(open(P+'/scene-reference.json'))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(n,c,metal=0,rough=.3):
 m=bpy.data.materials.new(n);m.use_nodes=True;m.diffuse_color=(*c,1);p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;p.inputs['Specular IOR Level'].default_value=.25;return m
yellow=mat('Glossy yellow battery casing',(.95,.59,.004),.12,.23);graphite=mat('Dark graphite end caps',(.022,.033,.052),.25,.25);silver=mat('Silver positive terminal',(.61,.69,.80),.7,.24);white=mat('White lightning mark',(.98,.98,.94),0,.32)
yp=yellow.node_tree.nodes.get('Principled BSDF');yp.inputs['Emission Color'].default_value=(.95,.59,.004,1);yp.inputs['Emission Strength'].default_value=.10
root=bpy.data.objects.new('BATTERY_ROOT • bottom ground anchor Z0',None);bpy.context.collection.objects.link(root)
def finish(o,m,b=.015):
 o.parent=root;o.data.materials.append(m)
 if b:
  md=o.modifiers.new('Rounded manufactured edges','BEVEL');md.width=b;md.segments=4;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 for p in o.data.polygons:p.use_smooth=True
 return o
def cyl(n,r,h,z,m):
 bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=r,depth=h,location=(0,0,z));o=bpy.context.object;o.name=n;return finish(o,m)
def box(n,loc,size,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=n;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,m,.004)
cyl('Battery_yellow_body',.326,.90,.57,yellow);cyl('Battery_bottom_graphite_cap',.342,.15,.085,graphite);cyl('Battery_top_graphite_cap',.342,.19,1.045,graphite);cyl('Battery_positive_terminal_dark_seat',.215,.035,1.155,graphite);cyl('Battery_positive_terminal_silver',.164,.11,1.21,silver)
box('Positive_plus_horizontal',(0,0,1.268),(.145,.023,.007),graphite);box('Positive_plus_vertical',(0,0,1.268),(.023,.145,.007),graphite)
# True modeled white bolt; faces hero camera, no raster texture dependency.
theta=math.atan2(-8.2,-6.0);normal=Vector((math.cos(theta),math.sin(theta),0));tangent=Vector((-math.sin(theta),math.cos(theta),0))
pts=[(-.035,.91),(.145,.91),(.016,.66),(.14,.66),(-.13,.29),(-.025,.57),(-.15,.57)]
v=[tuple(normal*.337+tangent*u+Vector((0,0,z))) for u,z in pts];me=bpy.data.meshes.new('Lightning_vector_geometry');me.from_pydata(v,[],[tuple(range(len(v)))]);me.update();o=bpy.data.objects.new('Battery_white_lightning',me);bpy.context.collection.objects.link(o);finish(o,white,0);o.data.polygons[0].use_smooth=False;md=o.modifiers.new('Thin embossed print','SOLIDIFY');md.thickness=.002
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=96;scene.cycles.use_denoising=False;scene.cycles.max_bounces=5;scene.cycles.diffuse_bounces=2;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.world.use_nodes=True;p=scene.world.node_tree.nodes.get('Background');p.inputs[0].default_value=REF['world_color'];p.inputs[1].default_value=REF['world_strength'];scene.view_settings.view_transform=REF['view_transform'];scene.view_settings.look=REF['look'];scene.view_settings.exposure=REF['exposure'];scene.view_settings.gamma=REF['gamma']
bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='Rover_matched_battery_camera';cam.rotation_euler=REF['camera_rotation_xyz'];cam.location=Vector((0,0,.62))+cam.rotation_euler.to_quaternion()@Vector((0,0,15));cam.data.type='ORTHO';cam.data.ortho_scale=1.65;scene.camera=cam
for spec in REF['lights']:
 bpy.ops.object.light_add(type=spec['type'],location=spec['location']);o=bpy.context.object;o.name=spec['name'];o.rotation_euler=spec['rotation'];o.data.energy=spec['energy'];o.data.color=spec['color'];o.data.shape=spec['shape'];o.data.size=spec['size']
from bpy_extras.object_utils import world_to_camera_view
scene.render.resolution_x=256;scene.render.resolution_y=256;scene.render.resolution_percentage=100
bpy.context.view_layer.update()
q=world_to_camera_view(scene,cam,Vector((0,0,0)))
meta={'version':1,'width':256,'height':256,'anchorX':q.x,'anchorY':1-q.y,'groundFootprintDiameterPx':.684/1.65*256,'meshParts':8,'upAxis':'+Z','sourceReference':'Actual current client/public/assets/cartoon/battery.png: yellow cylinder, white bolt, graphite caps and silver positive terminal.','scope':'Editable model and source sprite; export_runtime.py promotes it to ground/pickup runtime artwork. Cargo remains unchanged.','cameraRotationXYZ':list(cam.rotation_euler),'cameraOrthoScale':cam.data.ortho_scale,'shadow':'Transparent sprite, no ground cast-shadow baked.'}
scene['scope']=meta['scope'];scene['source_reference']=meta['sourceReference']
scene.render.resolution_x=256;scene.render.resolution_y=256;scene.render.resolution_percentage=100;scene.render.filepath=P+'/battery-v3-256.png';bpy.ops.wm.save_as_mainfile(filepath=P+'/battery-v3.blend');bpy.ops.render.render(write_still=True)
scene.render.resolution_x=1024;scene.render.resolution_y=1024;scene.cycles.samples=96;scene.render.filepath=P+'/battery-hero.png';bpy.ops.render.render(write_still=True)
open(P+'/battery-v3.json','w').write(json.dumps(meta,indent=2));print('BATTERY_SOURCE_COMPLETE')
