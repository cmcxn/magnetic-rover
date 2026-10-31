"""Rotate the actual station root for three inward-facing entrances.
Blender4.3+: blender -b -t8 --python art/recycling-station-v3/render_directions.py
No GUI, mesh redesign, 2D sprite rotation or gameplay edits. Keeps original fallback.
"""
import bpy,os,json,math,hashlib
from mathutils import Vector,Matrix
from bpy_extras.object_utils import world_to_camera_view
P=os.path.dirname(os.path.abspath(__file__));RUNTIME=os.path.join(os.path.dirname(os.path.dirname(P)),'client','public','assets','cartoon')
SOURCE=os.path.join(P,'recycling-station-v3.blend');POSITIONS=[(-330,-220),(330,-220),(0,380)]
bpy.ops.wm.open_mainfile(filepath=SOURCE);scene=bpy.context.scene;cam=scene.camera;root=bpy.data.objects['STATION_ROOT • ground circle center']
assert tuple(root.location)==(0.,0.,0.);root.rotation_euler=(0,0,0);scene.render.resolution_x=256;scene.render.resolution_y=256;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True;scene.cycles.samples=96
# Keep the exact approved camera and lights. Solve world XY from their actual projected basis.
def pixel(p):
 bpy.context.view_layer.update()
 q=world_to_camera_view(scene,cam,Vector(p));return Vector((q.x*256,(1-q.y)*256))
origin=pixel((0,0,0));ex=pixel((1,0,0))-origin;ey=pixel((0,1,0))-origin
basis=Matrix(((ex.x,ey.x),(ex.y,ey.y)));assert abs(basis.determinant())>1e-6
camera_matrix=[list(r) for r in cam.matrix_world];lights={o.name:[list(r) for r in o.matrix_world] for o in bpy.data.objects if o.type=='LIGHT'}
meta0=json.load(open(os.path.join(P,'station-v3.json')));frames=[]
for i,(sx,sy) in enumerate(POSITIONS):
 angle=math.atan2(-sy,-sx);world=basis.inverted()@Vector((math.cos(angle),math.sin(angle)));world.normalize()
 yaw=math.atan2(world.y,world.x)-math.pi;yaw=math.atan2(math.sin(yaw),math.cos(yaw));root.rotation_euler.z=yaw;bpy.context.view_layer.update()
 # Ground point beneath the physical ramp end. Direction from ground root is immune to height parallax.
 door_ground=root.matrix_world@Vector((-1.85,0,0));door=pixel(door_ground);measured=math.atan2(door.y-origin.y,door.x-origin.x);assert abs(math.atan2(math.sin(measured-angle),math.cos(measured-angle)))<1e-6
 assert [list(r) for r in cam.matrix_world]==camera_matrix
 assert {o.name:[list(r) for r in o.matrix_world] for o in bpy.data.objects if o.type=='LIGHT'}==lights
 name=f'station-v3-{i}.png';scene.render.filepath=os.path.join(RUNTIME,name);bpy.ops.render.render(write_still=True)
 frames.append({'key':f'station-v3-{i}','image':name,'screenAngle':angle,'modelYaw':yaw,'width':256,'height':256,'anchorX':origin.x/256,'anchorY':origin.y/256,'groundFootprintDiameterPx':meta0['groundFootprintDiameterPx'],'entranceAnchorPx':list(door),'rootAnchorPx':list(origin),'sourceStation':{'x':sx,'y':sy,'r':65}})
 print('STATION_DIRECTION_READY',i,'screenDegrees',math.degrees(angle),'modelYawDegrees',math.degrees(yaw),flush=True)
manifest={'version':1,'frames':frames,'screenConvention':'Radians clockwise from screen-right (screenY down). Select nearest inward angle atan2(-station.y,-station.x), not index-only.','modelConvention':'Actual root localZ yaw. Canonical entrance is -X. Camera and lights fixed.','entranceAnchorDefinition':'Projection of model ground point(-1.85,0,0), beneath receiving ramp end. The physical ramp tip is0.025 above ground.','sourceBlend':'art/recycling-station-v3/recycling-station-v3.blend','sourceBlendSha256':hashlib.sha256(open(SOURCE,'rb').read()).hexdigest(),'camera':{'rotationXYZ':list(cam.rotation_euler),'orthoScale':cam.data.ortho_scale},'groundGameplay':'Original centers/radii/deposit logic unchanged; ramp protrusion remains visual only.'}
for path in [os.path.join(P,'station-v3-directions.json'),os.path.join(RUNTIME,'station-v3-directions.json')]:open(path,'w').write(json.dumps(manifest,indent=2))
print('THREE_STATION_DIRECTIONS_COMPLETE')
