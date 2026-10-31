#!/usr/bin/env python3
"""Pixel-level tread evidence; optional exact repeated-render baseline."""
import argparse,json,math,pathlib
from PIL import Image

def difference(a,b):
 pairs=[(x,y) for x,y in zip(zip(*[iter(a.tobytes())]*4),zip(*[iter(b.tobytes())]*4)) if max(x[3],y[3])>0]
 rgbPairs=[([round(x[k]*x[3]/255) for k in range(3)],[round(y[k]*y[3]/255) for k in range(3)]) for x,y in pairs]
 rgb=[abs(x[k]-y[k]) for x,y in rgbPairs for k in range(3)];alpha=[abs(x[3]-y[3]) for x,y in pairs]
 return {'visiblePixels':len(pairs),'rgbChangedPixels':sum(any(x[k]!=y[k] for k in range(3)) for x,y in rgbPairs),'rgbMax':max(rgb,default=0),'rgbRMS':math.sqrt(sum(v*v for v in rgb)/max(1,len(rgb))),'alphaChangedPixels':sum(v>0 for v in alpha),'alphaDifferenceOver16':sum(v>16 for v in alpha),'alphaMax':max(alpha,default=0),'alphaRMS':math.sqrt(sum(v*v for v in alpha)/max(1,len(alpha)))}

def assess_roll(m,p):
 atl={a['key']:(Image.open(p/a['image']).convert('RGBA'),json.loads((p/a['data']).read_text())) for a in m['atlases']}
 wheel=next(w for w in m['headings'][0]['wheels'] if w['id']=='front-right');ims=[]
 for ph in range(4):
  r=wheel['poses']['0'][str(ph)][0];sheet,j=atl[r['texture']];f=j['frames'][r['frame']]['frame'];crop=sheet.crop((f['x'],f['y'],f['x']+f['w'],f['y']+f['h']));im=Image.new('RGBA',(192,192));im.paste(crop,(round(r['offsetX']+m['rootAnchor'][0]),round(r['offsetY']+m['rootAnchor'][1])));ims.append(im)
 metrics=[difference(ims[i],ims[i+1]) for i in range(3)]
 for d in metrics:
  assert d['rgbRMS']>1 and d['alphaDifferenceOver16']>5,('non-distinct rolling geometry',d)
 return {'representative':'screen heading0 near front-right wheel, steering0','phaseDegrees':[0,5,10,15],'rgbMetric':'premultiplied RGB; fully transparent colour excluded','transitions':metrics,'interpretation':'Tread change is subtle at gameplay scale; alpha silhouette differences demonstrate geometry change, not only shaded RGB noise.'}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--assets',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[2]/'client/public/assets/cartoon/rover-v3');ap.add_argument('--repeat',type=pathlib.Path);ap.add_argument('--output',type=pathlib.Path);a=ap.parse_args();m=json.loads((a.assets/'manifest.json').read_text());q=assess_roll(m,a.assets)
 if a.repeat:
  base=Image.open(a.repeat/'w-0-front-right-0-0.png').convert('RGBA');repeat=Image.open(a.repeat/'w-0-front-right-0-0-repeat.png').convert('RGBA');q['identicalPoseRepeat']=difference(base,repeat);q['identicalPoseRepeat']['decodedRGBAEqual']=base.tobytes()==repeat.tobytes();assert q['identicalPoseRepeat']['rgbMax']==0 and q['identicalPoseRepeat']['alphaMax']==0,'repeat baseline changed; do not attribute all phase change solely to geometry'
 s=json.dumps(q,indent=2);print(s)
 if a.output:a.output.write_text(s+'\n')
if __name__=='__main__':main()
