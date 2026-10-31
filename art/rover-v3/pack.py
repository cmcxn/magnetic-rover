#!/usr/bin/env python3
"""Crop without recentering, bake theme-only hub radiance and pack Phaser JSON atlases."""
import argparse,json,pathlib,math,time,hashlib
from PIL import Image,ImageChops
ap=argparse.ArgumentParser();ap.add_argument('--input',required=True);ap.add_argument('--output',required=True);a=ap.parse_args();src=pathlib.Path(a.input);out=pathlib.Path(a.output);out.mkdir(parents=True,exist_ok=True)
metas=[json.loads((src/f'meta-{i}.json').read_text()) for i in range(16)];m=metas[0]['header'];m['headings']=[v['heading'] for v in metas];m['atlases']=[];m['worldWidth']=160
for h in m['headings']:
 c=h['cargoProjection']
 if 'x' in c:c['xAxis']=c.pop('x');c['yAxis']=c.pop('y')
 c.update(legacyXScale=.046,legacyXOffset=.481,legacyYScale=.042)
 h['wheelTravelPerCycle']=.565*(math.tau/18)*math.hypot(*c['xAxis'])*(160/192)
m.update(steeringSign=-1,wheelRadiusModel=.565,rollPeriodRadians=math.tau/18,wheelTravelPerCycle=sum(h['wheelTravelPerCycle'] for h in m['headings'])/16)
SIZE=2048;PAD=2;pages=[];frames=[];dedup={};physicalFrames=0;x=y=row=0
page=Image.new('RGBA',(SIZE,SIZE));data={}
def flush():
 global page,data,x,y,row
 idx=len(pages);height=min(SIZE,max(64,2**math.ceil(math.log2(max(1,y+row)))));page.crop((0,0,SIZE,height)).save(out/f'atlas-{idx}.png',optimize=True);(out/f'atlas-{idx}.json').write_text(json.dumps({'frames':data,'meta':{'app':'rover-v3/pack.py','version':'1','image':f'atlas-{idx}.png','format':'RGBA8888','size':{'w':SIZE,'h':height},'scale':'1'}},separators=(',',':')))
 m['atlases'].append({'key':f'rover-v3-{idx}','image':f'atlas-{idx}.png','data':f'atlas-{idx}.json','width':SIZE,'height':height});pages.append(idx);page=Image.new('RGBA',(SIZE,SIZE));data={};x=y=row=0
root=m['rootAnchor']
def put(name,image,depth,role):
 global x,y,row,physicalFrames
 bounds=image.getchannel('A').getbbox();bbox=bounds or (1,1,2,2)
 if bounds:assert 0<bbox[0]<bbox[2]<192 and 0<bbox[1]<bbox[3]<192,('reference clipping',name,bbox)
 im=image.crop(bbox);r,g,b,alpha=im.split();visible=alpha.point(lambda v:255 if v else 0);im=Image.merge('RGBA',tuple(ImageChops.multiply(c,visible) for c in (r,g,b))+(alpha,));w,h=im.size
 signature=(w,h,hashlib.sha256(im.tobytes()).digest())
 if signature in dedup:
  rec=dict(dedup[signature]);rec.update(offsetX=round(bbox[0]-root[0],6),offsetY=round(bbox[1]-root[1],6),depthOrder=depth,role=role);return rec
 assert w<=(192 if role=='body' else 96) and h<=(192 if role=='body' else 96),(name,w,h)
 if x+w+2*PAD>SIZE:x=0;y+=row;row=0
 if y+h+2*PAD>SIZE:flush()
 px=x+PAD;py=y+PAD;page.paste(im,(px,py));data[name]={'frame':{'x':px,'y':py,'w':w,'h':h},'rotated':False,'trimmed':False,'spriteSourceSize':{'x':0,'y':0,'w':w,'h':h},'sourceSize':{'w':w,'h':h}}
 rec={'texture':f'rover-v3-{len(pages)}','frame':name,'width':w,'height':h,'anchorX':0,'anchorY':0,'offsetX':round(bbox[0]-root[0],6),'offsetY':round(bbox[1]-root[1],6),'depthOrder':depth,'role':role}
 dedup[signature]=dict(rec);physicalFrames+=1
 x+=w+2*PAD;row=max(row,h+2*PAD);return rec
def load(name):return Image.open(src/(name+'.png')).convert('RGBA')
def themed(im,hex):
 # Radiance-preserving per-channel mask recolouring, never whole-wheel tint.
 r,g,b,alpha=im.split();rgb=[int(hex[i:i+2],16) for i in (0,2,4)]
 # Original rendered hub colour is neutral 188sRGB; each mask pixel retains light/shade.
 return Image.merge('RGBA',(r.point(lambda v:min(255,round(v*rgb[0]/188))),g.point(lambda v:min(255,round(v*rgb[1]/188))),b.point(lambda v:min(255,round(v*rgb[2]/188))),alpha))
for hi,h in enumerate(m['headings']):
 h['body']={hex:[put(f'b-{hi}-{hex}',load(f'b-{hi}-{hex}'),0,'body')] for hex in m['palettes']}
 for wi,w in enumerate(h['wheels']):
  c=h['cargoProjection'];wx=.85 if w['front'] else -.86;wy=1 if w['id'].endswith('left') else -1
  w['groundAnchor']=[c['xAxis'][j]*wx+c['yAxis'][j]*wy for j in range(2)]
  w['poses']={};w['accents']={hex:{} for hex in m['palettes']}
  for st in ([-1,0,1] if w['front'] else [0]):
   st=str(st);w['poses'][st]={}
   for hex in m['palettes']:w['accents'][hex][st]={}
   for ph in range(4):
    ph=str(ph);name=f'{hi}-{w["id"]}-{st}-{ph}';depth=1+wi*.02
    w['poses'][st][ph]=[put('w-'+name,load('w-'+name),depth,'wheel')]
    hub=load('h-'+name)
    for hex in m['palettes']:w['accents'][hex][st][ph]=[put('h-'+name+'-'+hex,themed(hub,hex),depth+.001,'hub')]
flush();m['provenance']={'recoveredSourceSHA256':'7731c9ab49e3d140e4b53c5c434a217fe8c60dd7d9d06a50a6adf65320e69a03','editableSourceSHA256':hashlib.sha256((pathlib.Path(__file__).parent/'rover-source.blend').read_bytes()).hexdigest(),'generator':'art/rover-v3/render.py + pack.py','geometry':'recovered v3 unchanged; no battery or tray'}
m['budget']={'atlasCount':len(pages),'atlasRGBABytes':sum(a['width']*a['height']*4 for a in m['atlases']),'atlasPNGBytes':sum((out/f'atlas-{i}.png').stat().st_size for i in pages),'bodyRecords':128,'wheelRecords':512,'hubAccentRecords':4096,'totalRecords':4736,'uniqueAtlasFrames':physicalFrames}
(out/'manifest.json').write_text(json.dumps(m,separators=(',',':')))
print(json.dumps(m['budget'],indent=2))
