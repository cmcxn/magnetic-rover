"""Optional same-camera source/import comparison; output defaults to /tmp/rover-showroom-qa."""
import bpy,os
from pathlib import Path
P=Path(__file__).resolve().parent;R=P.parents[1];O=Path(os.environ.get('ROVER_QA_OUTPUT','/tmp/rover-showroom-qa'));O.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(R/'art/rover-v3/rover-source.blend'))
for o in bpy.data.objects:
 if o.name.startswith(('ROVER_ROOT','WheelPivot')):o.rotation_euler=(0,0,0)
s=bpy.context.scene;s.render.resolution_x=512;s.render.resolution_y=512;s.render.resolution_percentage=100;s.render.film_transparent=True
s.render.engine='CYCLES';s.cycles.samples=32;s.cycles.use_denoising=False
bpy.context.view_layer.update();s.render.filepath=str(O/'source.png');bpy.ops.render.render(write_still=True)
for o in list(bpy.data.objects):
 if o.type in {'MESH','CURVE','FONT','EMPTY'} and o.name!='Studio_ground':bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(R/'client/public/assets/cartoon/rover-showroom/rover.glb'))
bpy.context.view_layer.update();s.render.filepath=str(O/'glb.png');bpy.ops.render.render(write_still=True)
print('QA_IMAGES',O)
