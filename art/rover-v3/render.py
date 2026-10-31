"""Blender CLI: blender -b rover-source.blend -P render.py -- --output /tmp/rover-v3 [--sample]."""
import bpy, math, os, json, argparse, sys, time
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view
ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);ap.add_argument('--sample',action='store_true');ap.add_argument('--repeat-check',action='store_true');ap.add_argument('--start',type=int,default=0);ap.add_argument('--end',type=int,default=16);a=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
os.makedirs(a.output,exist_ok=True)
s=bpy.context.scene;cam=s.camera
s.render.engine='CYCLES';s.cycles.samples=64;s.cycles.use_denoising=False;s.cycles.max_bounces=3;s.render.threads_mode='FIXED';s.render.threads=4
s.render.resolution_x=s.render.resolution_y=192;s.render.resolution_percentage=100;s.render.film_transparent=True;s.use_nodes=False;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA';s.render.image_settings.color_depth='8'
s.view_settings.view_transform='Standard';s.view_settings.look='None';s.view_settings.exposure=0;s.view_settings.gamma=1
root=next(o for o in bpy.data.objects if o.name.startswith('ROVER_ROOT'))
pivots=sorted([o for o in bpy.data.objects if o.name.startswith('WheelPivot')],key=lambda o:o.name)
wheels={('front' if p.location.x>0 else 'rear')+'-'+('left' if p.location.y>0 else 'right'):p for p in pivots}
geom=[o for o in bpy.data.objects if o.type in {'MESH','CURVE','FONT'} and o.name!='Studio_ground']
bpy.data.objects['Studio_ground'].hide_render=True
original={o:tuple(o.data.materials) for o in geom}
wheel_geom={k:list(p.children) for k,p in wheels.items()};all_wheel=set(o for objects in wheel_geom.values() for o in objects);body=[o for o in geom if o not in all_wheel]
accent_names={'Saturated royal blue enamel','Electric blue illuminated hubs','Cyan-white light center'}
hubs={k:[o for o in objects if any(m.name in accent_names for m in original[o])] for k,objects in wheel_geom.items()}
palettes=['38bdf8','fb7185','a78bfa','facc15','34d399','fb923c','e879f9','cbd5e1']
hold=bpy.data.materials.new('Runtime occlusion holdout');hold.use_nodes=True;n=hold.node_tree.nodes;n.clear();out=n.new('ShaderNodeOutputMaterial');h=n.new('ShaderNodeHoldout');hold.node_tree.links.new(h.outputs[0],out.inputs['Surface'])
def linear(c):return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
def colour(hex):return tuple(linear(int(hex[i:i+2],16)/255) for i in (0,2,4))+(1,)
def palette(hex):
 for name in accent_names:
  m=bpy.data.materials[name]
  for n in m.node_tree.nodes:
   if n.type=='BSDF_PRINCIPLED':
    n.inputs['Base Color'].default_value=colour(hex)
    if 'Emission Color' in n.inputs:n.inputs['Emission Color'].default_value=colour(hex)
 def noop():pass

def restore():
 for o in geom:
  o.hide_render=False;o.data.materials.clear()
  for m in original[o]:o.data.materials.append(m)
def occlude(o):
 o.data.materials.clear();o.data.materials.append(hold)
def px(v):
 q=world_to_camera_view(s,cam,Vector(v));return [q.x*192,(1-q.y)*192]
# Inverse the camera's ground-plane affine projection: directions are SCREEN uniform.
root.rotation_euler=(0,0,0);bpy.context.view_layer.update();p0=px((0,0,0));ex=px((1,0,0));ey=px((0,1,0));A=Matrix(((ex[0]-p0[0],ey[0]-p0[0]),(ex[1]-p0[1],ey[1]-p0[1])))
meta={'version':1,'palettes':palettes,'referenceSize':192,'worldWidth':160,'rootAnchor':p0,'steeringSign':-1,'wheelRadiusModel':.565,'rollPeriodRadians':math.tau/18,'cargoLegacyMapping':{'xScale':.046,'xOffset':.481,'yScale':.042,'yOffset':0,'planeZ':1.55},'headings':[],'render':{'engine':'CYCLES','samples':64,'threads':4,'source':'rover-source.blend','frontAxis':'+X','rollFrameDegrees':[0,5,10,15],'steeringAxis':'local Z','rollingAxis':'local Y','wheelOcclusion':'all other geometry holdout'}}
def render(name):
 path=os.path.join(a.output,name+'.png')
 if os.path.exists(path):
  if a.repeat_check and name=='w-0-front-right-0-0':path=os.path.join(a.output,name+'-repeat.png')
  else:return
 s.render.filepath=path;t=time.monotonic();bpy.ops.render.render(write_still=True);print('BENCH',name,round(time.monotonic()-t,3),flush=True)
# Save portable source with cleared text blocks, no auto-execution, neutral straight pose.
for text in list(bpy.data.texts):bpy.data.texts.remove(text)
if a.start==0 and not a.repeat_check:
 for p in pivots:p.rotation_euler=(0,0,0)
 root.rotation_euler=(0,0,0);palette(palettes[0]);restore()
 s.render.filepath='//preview.png'
 s['runtime_generation']='render.py; fixed camera/light; 192px reference; car only'
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(os.path.abspath(__file__)),'rover-source.blend'))
for hi in range(a.start,a.end):
 if a.sample and hi not in [0,4,8,12]:continue
 theta=hi*math.tau/16;v=A.inverted()@Vector((math.cos(theta),math.sin(theta)));yaw=math.atan2(v.y,v.x)
 root.rotation_euler.z=yaw
 for p in pivots:p.rotation_euler=(0,0,0)
 bpy.context.view_layer.update();f=px((math.cos(yaw),math.sin(yaw),0));origin=px((0,0,1.55));cx=px((math.cos(yaw),math.sin(yaw),1.55));cy=px((-math.sin(yaw),math.cos(yaw),1.55))
 heading={'screenAngle':theta,'modelYaw':yaw,'projectedFrontAngle':math.atan2(f[1]-p0[1],f[0]-p0[0])%math.tau,'wheelTravelPerCycle':.565*(math.tau/18)*math.hypot(cx[0]-origin[0],cx[1]-origin[1])*(160/192),'cargoProjection':{'origin':[origin[i]-p0[i] for i in range(2)],'xAxis':[cx[i]-origin[i] for i in range(2)],'yAxis':[cy[i]-origin[i] for i in range(2)],'legacyXScale':.046,'legacyXOffset':.481,'legacyYScale':.042},'wheels':[]}
 for pi,hex in enumerate(palettes):
  if a.sample and pi:continue
  restore();palette(hex)
  for o in all_wheel:o.hide_render=True
  render(f'b-{hi}-{hex}')
 # Neutral radiance hub render is recoloured at packing, exclusively within hub alpha.
 palette('bcbcbc')
 for wi,(wid,pivot) in enumerate(wheels.items()):
  isfront=pivot.location.x>0;wd={'id':wid,'front':isfront,'poses':{}}
  # Source mesh transforms are axle-local: steering parent Z, rolling child local Y.
  child_rots={o:o.rotation_euler.copy() for o in wheel_geom[wid]}
  for steer in ([-1,0,1] if isfront else [0]):
   pivot.rotation_euler.z=math.radians(25*steer)
   for phase in range(4):
    if a.sample and (steer!=0 or phase!=0):continue
    # 18 repeated treads: phase evenly spans ONE tread period, not 90deg (which aliases).
    roll=phase*math.tau/18/4
    R=Matrix.Rotation(roll,4,'Y')
    originals={o:o.matrix_basis.copy() for o in wheel_geom[wid]}
    for o in wheel_geom[wid]:o.matrix_basis=R@originals[o]
    bpy.context.view_layer.update()
    for mode in ('w','h'):
     restore()
     for o in geom:
      if o not in wheel_geom[wid] or (mode=='h' and o not in hubs[wid]):occlude(o)
     render(f'{mode}-{hi}-{wid}-{steer}-{phase}')
    for o in wheel_geom[wid]:o.matrix_basis=originals[o]
   pivot.rotation_euler.z=0
  heading['wheels'].append({'id':wid,'front':isfront,'groundAnchor':[(cx[j]-origin[j])*pivot.location.x+(cy[j]-origin[j])*pivot.location.y for j in range(2)]})
 meta['headings'].append(heading)
 open(os.path.join(a.output,f'meta-{hi}.json'),'w').write(json.dumps({'header':{k:v for k,v in meta.items() if k!='headings'},'heading':heading}))
restore();root.rotation_euler.z=0
print('RENDER_COMPLETE',flush=True)
