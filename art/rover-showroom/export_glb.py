"""Read-only source export. Blender4.3+: blender --disable-autoexec -b --python art/rover-showroom/export_glb.py
Evaluates approved modifiers, welds equal quantized vertices by material, exports portable glTF2 with no texture/decoder dependencies.
"""
import bpy,os,json,struct,hashlib,math
from collections import defaultdict
from pathlib import Path
from mathutils import Vector,Matrix
P=Path(__file__).resolve().parent;REPO=P.parents[1];SOURCE=REPO/'art/rover-v3/rover-source.blend';OUT=REPO/'client/public/assets/cartoon/rover-showroom';OUT.mkdir(parents=True,exist_ok=True)
source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
root=next(o for o in bpy.data.objects if o.name.startswith('ROVER_ROOT'));root.rotation_euler=(0,0,0)
for o in bpy.data.objects:
 if o.name.startswith('WheelPivot'):o.rotation_euler=(0,0,0)
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
MAP={'Saturated royal blue enamel':'theme_shellaccent','Electric blue illuminated hubs':'theme_hub','Cyan-white light center':'theme_light','Magnet N • red enamel':'fixed_magnet_n','Magnet S • blue enamel':'fixed_magnet_s','Magnet neutral connector • satin metal':'fixed_magnet_connector','Magnet pole lettering • ivory':'fixed_pole_letters','Porcelain ivory white shell':'fixed_white_shell','Soft graphite tire':'fixed_rubber','Broad molded tread':'fixed_tread','Deep blue chassis':'fixed_dark_chassis','Recesses and gasket':'fixed_gasket'}
# (X,Y,Z)Blender -> (X,Z,-Y)glTF is a proper rotation, not a reflection.
convert=Matrix(((1,0,0),(0,0,1),(0,-1,0)))
groups=defaultdict(list);boundslo=[1e9]*3;boundshi=[-1e9]*3;source_objects=[];triangle_count=0
for o in bpy.data.objects:
 if o.type not in {'MESH','CURVE','FONT'} or o.name=='Studio_ground' or o.hide_render:continue
 ev=o.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles();normal_matrix=convert@o.matrix_world.to_3x3().inverted().transposed();positions=[convert@(o.matrix_world@v.co) for v in me.vertices]
 for v in positions:
  for k in range(3):boundslo[k]=min(boundslo[k],v[k]);boundshi[k]=max(boundshi[k],v[k])
 for tri in me.loop_triangles:
  material=me.materials[tri.material_index].name;assert material in MAP,material
  corners=[]
  for li in tri.loops:
   n=normal_matrix@me.corner_normals[li].vector;n.normalize();v=positions[me.loops[li].vertex_index];corners.append((tuple(v),tuple(n)))
  if o.matrix_world.determinant()<0:corners.reverse()
  groups[material].append(corners)
 triangle_count+=len(me.loop_triangles);source_objects.append(o.name);ev.to_mesh_clear()
scale=max(boundshi[i]-boundslo[i] for i in range(3));blob=bytearray();views=[];accessors=[];materials=[];primitives=[];group_stats=[];max_error=0.;max_normal_error=0.
def append(data,target,stride=None):
 while len(blob)%4:blob.append(0)
 offset=len(blob);blob.extend(data);v={'buffer':0,'byteOffset':offset,'byteLength':len(data),'target':target}
 if stride:v['byteStride']=stride
 views.append(v);return len(views)-1
for source_name in sorted(groups,key=lambda n:MAP[n]):
 lookup={};vertices=[];indices=[]
 for tri in groups[source_name]:
  for pos,normal in tri:
   q=tuple(max(0,min(65535,round((pos[k]-boundslo[k])/scale*65535))) for k in range(3));n=tuple(max(-127,min(127,round(normal[k]*127))) for k in range(3));key=q+n
   if key not in lookup:lookup[key]=len(vertices);vertices.append(key)
   indices.append(lookup[key]);decoded=[q[k]/65535*scale+boundslo[k] for k in range(3)];max_error=max(max_error,math.dist(decoded,pos))
   qn=Vector(n).normalized();max_normal_error=max(max_normal_error,math.acos(max(-1,min(1,qn.dot(Vector(normal))))))
 assert len(vertices)<65536
 data=b''.join(struct.pack('<3H2x3b1x',*v) for v in vertices);view=append(data,34962,12)
 ai=len(accessors);accessors.append({'bufferView':view,'byteOffset':0,'componentType':5123,'normalized':True,'count':len(vertices),'type':'VEC3','min':[min(v[k] for v in vertices) for k in range(3)],'max':[max(v[k] for v in vertices) for k in range(3)]})
 accessors.append({'bufferView':view,'byteOffset':8,'componentType':5120,'normalized':True,'count':len(vertices),'type':'VEC3'})
 # Standard glTF triangle primitives: no decoder and no geometry simplification.
 original_triangles=len(indices)//3
 mode=4;decoded_triangles=original_triangles
 iv=append(struct.pack('<%dH'%len(indices),*indices),34963);ia=len(accessors);accessors.append({'bufferView':iv,'componentType':5123,'count':len(indices),'type':'SCALAR'})
 p=bpy.data.materials[source_name].node_tree.nodes.get('Principled BSDF');m={'name':MAP[source_name],'pbrMetallicRoughness':{'baseColorFactor':list(p.inputs['Base Color'].default_value),'metallicFactor':p.inputs['Metallic'].default_value,'roughnessFactor':p.inputs['Roughness'].default_value},'doubleSided':False,'extensions':{'KHR_materials_specular':{'specularFactor':min(1.,2*p.inputs['Specular IOR Level'].default_value)}}}
 emission=p.inputs['Emission Strength'].default_value
 if emission>0:m['emissiveFactor']=list(p.inputs['Emission Color'].default_value)[:3];m['extensions']['KHR_materials_emissive_strength']={'emissiveStrength':emission}
 materials.append(m);primitives.append({'attributes':{'POSITION':ai,'NORMAL':ai+1},'indices':ia,'material':len(materials)-1,'mode':mode});group_stats.append({'material':MAP[source_name],'vertices':len(vertices),'triangles':original_triangles,'primitiveMode':mode,'decodedTrianglesIncludingDegenerates':decoded_triangles})
while len(blob)%4:blob.append(0)
j={'asset':{'version':'2.0','generator':'Magnetic Rover approved-source quantized material-merged exporter'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':'ROVER_SHOWROOM_ROOT','children':[1],'extras':{'frontAxis':'+X','upAxis':'+Y','pivot':'original car ground center'}},{'name':'ROVER_GEOMETRY','mesh':0,'translation':boundslo,'scale':[scale]*3}],'meshes':[{'name':'ApprovedRoverMergedByMaterial','primitives':primitives}],'materials':materials,'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':accessors,'extensionsUsed':['KHR_mesh_quantization','KHR_materials_specular','KHR_materials_emissive_strength'],'extensionsRequired':['KHR_mesh_quantization']}
jbytes=json.dumps(j,separators=(',',':')).encode();jbytes+=b' '*((-len(jbytes))%4);total=12+8+len(jbytes)+8+len(blob)
glb=struct.pack('<III',0x46546c67,2,total)+struct.pack('<II',len(jbytes),0x4e4f534a)+jbytes+struct.pack('<II',len(blob),0x004e4942)+blob
(OUT/'rover.glb').write_bytes(glb);unchanged=hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_hash;assert unchanged
manifest={'version':1,'model':'rover.glb','source':'art/rover-v3/rover-source.blend','sourceSha256':source_hash,'sourceUnmodified':unchanged,'sourceObjectCount':len(source_objects),'sourceTriangleCount':triangle_count,'exportedTriangleCount':sum(g['triangles'] for g in group_stats),'fileBytes':len(glb),'drawCalls':len(primitives),'upAxis':'+Y','frontAxis':'+X','pivot':[0,0,0],'bounds':{'min':boundslo,'max':boundshi},'maxPositionQuantizationError':max_error,'maxNormalQuantizationErrorDegrees':math.degrees(max_normal_error),'externalDecoderRequired':False,'geometrySimplified':False,'textures':0,'themeMaterials':{'shellaccent':'theme_shellaccent','hub':'theme_hub','light':'theme_light'},'themeEmissionStrength':{'theme_hub':1.3,'theme_light':2.0},'fixedMagnetMaterials':['fixed_magnet_n','fixed_magnet_s','fixed_magnet_connector','fixed_pole_letters'],'palettes':['38bdf8','fb7185','a78bfa','facc15','34d399','fb923c','e879f9','cbd5e1'],'groups':group_stats,'colorAPI':'Use THREE.Color.set(hexString) for material.color and emissive on theme_hub/theme_light; glTF factors are linear, Three converts sRGB CSS hex. Never recolor fixed_ materials.','scope':'Selection showroom only, no gameplay/steering/print-source changes. Original source geometry evaluated with modifiers; only material grouping and sub0.0001unit numeric quantization.'}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2));(P/'export-report.json').write_text(json.dumps(manifest,indent=2));print('SHOWROOM_EXPORTED',len(glb),'bytes',sum(g['vertices'] for g in group_stats),'vertices',triangle_count,'triangles')
