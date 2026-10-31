#!/usr/bin/env python3
"""Contact sheets from final packed runtime pixels, preserving root registration."""
import argparse,json,pathlib
from PIL import Image,ImageDraw
ap=argparse.ArgumentParser();ap.add_argument('--assets',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[2]/'client/public/assets/cartoon/rover-v3');ap.add_argument('--output',type=pathlib.Path,required=True);a=ap.parse_args();a.output.mkdir(parents=True,exist_ok=True);m=json.loads((a.assets/'manifest.json').read_text());atl={v['key']:(Image.open(a.assets/v['image']).convert('RGBA'),json.loads((a.assets/v['data']).read_text())) for v in m['atlases']}
def car(heading,palette,steer=0,phase=0):
 h=m['headings'][heading];layers=list(h['body'][palette])
 for w in h['wheels']:
  st=str(steer if w['front'] else 0);ph=str(phase);layers+=w['poses'][st][ph]+w['accents'][palette][st][ph]
 im=Image.new('RGBA',(192,192))
 for r in sorted(layers,key=lambda r:r['depthOrder']):
  sheet,j=atl[r['texture']];f=j['frames'][r['frame']]['frame'];crop=sheet.crop((f['x'],f['y'],f['x']+f['w'],f['y']+f['h']));im.alpha_composite(crop,(round(r['offsetX']+m['rootAnchor'][0]),round(r['offsetY']+m['rootAnchor'][1])))
 return im
sheet=Image.new('RGBA',(768,768),(45,50,58,255));d=ImageDraw.Draw(sheet)
for i in range(16):
 xy=((i%4)*192,(i//4)*192);sheet.alpha_composite(car(i,m['palettes'][0]),xy);d.text((xy[0]+5,xy[1]+5),f'{i}: {i*22.5:g}deg',fill='white')
sheet.save(a.output/'sixteen-headings.png')
sheet=Image.new('RGBA',(768,384),(45,50,58,255));d=ImageDraw.Draw(sheet)
for i,p in enumerate(m['palettes']):
 xy=((i%4)*192,(i//4)*192);sheet.alpha_composite(car(0,p),xy);d.text((xy[0]+5,xy[1]+5),p,fill='white')
sheet.save(a.output/'eight-palettes.png')
sheet=Image.new('RGBA',(768,576),(45,50,58,255));d=ImageDraw.Draw(sheet)
for i,st in enumerate([-1,0,1]):
 for ph in range(4):
  xy=(ph*192,i*192);sheet.alpha_composite(car(0,m['palettes'][0],st,ph),xy);d.text((xy[0]+5,xy[1]+5),f'localZ {st*25:+d} roll {ph*5}deg',fill='white')
sheet.save(a.output/'steer-roll.png')
print(a.output)
