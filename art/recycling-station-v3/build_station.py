"""Portable Blender4.3+ procedural source. No source model/font/network dependency.
Run: blender -b -t8 --python art/recycling-station-v3/build_station.py
"""
import bpy,math,json,os
from mathutils import Vector
from math import sin,cos,pi
P=os.path.dirname(os.path.abspath(__file__));REPO=os.path.dirname(os.path.dirname(P));RUNTIME=os.path.join(REPO,'client','public','assets','cartoon')
REF=json.load(open(P+'/scene-reference.json'))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(n,c,metal=0,rough=.35,emit=0):
 m=bpy.data.materials.new(n);m.use_nodes=True;m.diffuse_color=(*c,1);p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;p.inputs['Specular IOR Level'].default_value=.25;p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=emit;return m
stone=mat('Station cool stone gray',(.35,.40,.385),.06,.42);rim=mat('Station pale metal stone rim',(.29,.33,.31),.12,.40);dark=mat('Station recessed graphite',(.025,.045,.037),.15,.4);green=mat('Station emerald disk',(.009,.18,.065),.04,.38);bodygreen=mat('Station dark green wall',(.018,.12,.065),.12,.4);neon=mat('Station restrained green strips',(.015,.52,.20),.12,.3,.65);white=mat('Station ivory recycling symbol',(.93,.98,.91),.04,.32);metal=mat('Station entrance satin metal',(.29,.34,.30),.4,.31)
root=bpy.data.objects.new('STATION_ROOT • ground circle center',None);bpy.context.collection.objects.link(root)
def finish(o,m,b=.025):
 o.data.materials.append(m);o.parent=root
 if b:
  md=o.modifiers.new('Soft manufactured edges','BEVEL');md.width=b;md.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 for f in o.data.polygons:f.use_smooth=True
 return o
def mesh(n,v,f,m,b=.025):
 me=bpy.data.meshes.new(n);me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(n,me);bpy.context.collection.objects.link(o);return finish(o,m,b)
def box(n,loc,size,m,b=.03):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=n;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,m,b)
def cyl(n,r,h,z,m):
 bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=r,depth=h,location=(0,0,z));o=bpy.context.object;o.name=n;return finish(o,m,.025)
def band(n,r0,r1,a0,a1,z0,z1,m,N=12):
 pts=[(r1*cos(a0+(a1-a0)*i/N),r1*sin(a0+(a1-a0)*i/N)) for i in range(N+1)]+[(r0*cos(a1-(a1-a0)*i/N),r0*sin(a1-(a1-a0)*i/N)) for i in range(N+1)]
 return prism(n,pts,z0,z1,m,.015)
def prism(n,pts,z0,z1,m,b=.015):
 N=len(pts);v=[(x,y,z) for z in [z0,z1] for x,y in pts];return mesh(n,v,[tuple(range(N-1,-1,-1)),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)],m,b)
# Short segmented circular kiosk, open collector mouth on -X, not a tall tower.
cyl('Ground_foundation',1.39,.15,.075,dark);cyl('Lower_green_ring',1.29,.18,.17,bodygreen)
cyl('Interior_dark_floor',1.13,.055,.245,dark)
# Body ring is actually hollow; the front sector is omitted for collection entrance.
for i in range(12):
 mid=2*pi*i/12
 if abs((mid-pi+pi)%(2*pi)-pi)<math.radians(29):continue
 band('Wall_segment_%02d'%i,1.00,1.20,mid-pi/12+.012,mid+pi/12-.012,.21,1.04,bodygreen,8)
# Roof disk and carefully separated rim sectors.
cyl('Roof_shadow_gasket',1.35,.08,1.045,dark);cyl('Green_recycling_sign_disk',1.17,.105,1.118,green)
for i in range(12):
 mid=2*pi*i/12;band('Roof_rim_segment_%02d'%i,1.16,1.38,mid-pi/12+.008,mid+pi/12-.008,1.065,1.205,rim,10)
# Radial buttresses: strong readable low-poly structural pieces, no tiny greebles.
for i,ang in enumerate([0,pi/3,2*pi/3,4*pi/3,5*pi/3]):
 v=[]
 for z,r0,r1,w in [(0.14,1.13,1.46,.22),(1.10,1.08,1.32,.16)]:
  for rr,yy in [(r0,-w),(r1,-w),(r1,w),(r0,w)]:v.append((rr*cos(ang)-yy*sin(ang),rr*sin(ang)+yy*cos(ang),z))
 mesh('Structural_stone_rib_%02d'%i,v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],stone,.055)
 o=box('Green_rib_light_%02d'%i,(1.455*cos(ang),1.455*sin(ang),.39),(.075,.23,.20),neon,.035);o.rotation_euler.z=ang
# Shallow front mouth with side pillars and a sloping receiving ramp.
for side in [-1,1]:
 o=box('Entrance_stone_pillar_'+str(side),(-1.105,side*.55,.57),(.32,.23,.92),stone,.055);o.rotation_euler.y=.12
 box('Entrance_edge_light_'+str(side),(-1.285,side*.565,.39),(.028,.085,.30),neon,.015)
box('Entrance_header',(-1.13,0,1.02),(.30,1.20,.17),rim,.035)
box('Dark_collection_recess',(-.81,0,.60),(.06,.86,.69),dark,.025)
mesh('Collection_ramp',[(-1.85,-.46,.025),(-1.85,.46,.025),(-1.02,.46,.285),(-1.02,-.46,.285),(-1.85,-.46,.005),(-1.85,.46,.005),(-1.02,.46,.22),(-1.02,-.46,.22)],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],metal,.02)
for side in [-1,1]:
 o=box('Ramp_raised_rail_'+str(side),(-1.43,side*.46,.20),(.87,.075,.11),rim,.025);o.rotation_euler.y=.30
# Canonical recycle emblem, portable baked outline mesh with included font notice.
symbol=json.load(open(P+'/recycle-symbol-mesh.json'))
mesh('Canonical_three_arrow_recycling_symbol',[(x,y,z+1.178) for x,y,z in symbol['vertices']],symbol['faces'],white,0)
# A restrained thin ring frames the icon without an overpowering bloom halo.
band('Green_sign_edge',1.105,1.135,0,2*pi,1.175,1.183,neon,96)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=96;scene.cycles.use_denoising=False;scene.cycles.max_bounces=5;scene.cycles.diffuse_bounces=2
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.world.use_nodes=True;bg=scene.world.node_tree.nodes.get('Background');bg.inputs[0].default_value=REF['world_color'];bg.inputs[1].default_value=REF['world_strength']
scene.view_settings.view_transform=REF['view_transform'];scene.view_settings.look=REF['look'];scene.view_settings.exposure=REF['exposure'];scene.view_settings.gamma=REF['gamma']
bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='Fixed_rover_matched_ortho_camera';cam.rotation_euler=REF['camera_rotation_xyz'];target=Vector((-.12,0,.48));cam.location=target+cam.rotation_euler.to_quaternion()@Vector((0,0,15));cam.data.type='ORTHO';cam.data.ortho_scale=4.25;scene.camera=cam
for spec in REF['lights']:
 bpy.ops.object.light_add(type=spec['type'],location=spec['location']);o=bpy.context.object;o.name=spec['name'];o.rotation_euler=spec['rotation'];o.data.energy=spec['energy'];o.data.color=spec['color'];o.data.shape=spec['shape'];o.data.size=spec['size']
scene['reference']='Actual user gameplay screenshot1000088020.jpg, third guide panel; original game station.png. Back and underside inferred conservatively.'
scene['scope']='Static prerendered station asset only; no changes to recycling radius/score/deposit logic.'
from bpy_extras.object_utils import world_to_camera_view
q=world_to_camera_view(scene,cam,Vector((0,0,0)));anchor=[q.x,1-q.y]
# Main circular footprint, not projecting the ramp into the gameplay-radius definition.
footprint_diameter=2*1.39/cam.data.ortho_scale*256
meta={'version':1,'texture':'station-v3.png','width':256,'height':256,'anchorX':anchor[0],'anchorY':anchor[1],'anchor':{'x':anchor[0],'y':anchor[1]},'groundAnchorNormalized':anchor,'groundAnchorPx':[a*256 for a in anchor],'groundFootprintDiameterPx':footprint_diameter,'mainGroundRadiusModel':1.39,'camera':{'projection':'ORTHO','orthoScale':cam.data.ortho_scale,'rotationXYZ':list(cam.rotation_euler),'location':list(cam.location)},'placement':'Align ground anchor with unchanged station center; displayCanvasSize=(r+5)*2*256/groundFootprintDiameterPx. Do not change gameplay radius. Ramp can extend beyond circular footprint.','entranceModelDirection':'-X','shadow':'Transparent production sprite, no ground cast-shadow baked. Self-shadow only.','reference':'User gameplay guide third panel; conservative hidden geometry.'}
os.makedirs(RUNTIME,exist_ok=True)
scene.render.resolution_x=256;scene.render.resolution_y=256;scene.render.resolution_percentage=100;scene.render.filepath=RUNTIME+'/station-v3.png';bpy.ops.wm.save_as_mainfile(filepath=P+'/recycling-station-v3.blend');bpy.ops.render.render(write_still=True)
for path in [P+'/station-v3.json',RUNTIME+'/station-v3.json']:open(path,'w').write(json.dumps(meta,indent=2))
# Larger transparent hero for chat, source remains saved in production-oriented state.
scene.render.resolution_x=1024;scene.render.resolution_y=1024;scene.cycles.samples=128;scene.render.filepath=P+'/station-hero.png';bpy.ops.render.render(write_still=True)
print('STATION_ASSET_COMPLETE',json.dumps(meta))
