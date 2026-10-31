#!/usr/bin/env python3
"""Validate production atlas topology, registration, alpha bounds and theme coverage."""
import json, math, pathlib, sys
from PIL import Image
from pixel_qa import assess_roll
ROOT=pathlib.Path(__file__).resolve().parents[2]
def assert_pose_metadata(m):
 assert m['steeringSign']==-1, 'approved camera projection reverses local Z steering'
 assert math.isfinite(m['wheelTravelPerCycle']) and 3<m['wheelTravelPerCycle']<8
 for h in m['headings']:
  assert math.isfinite(h['wheelTravelPerCycle']) and 3<h['wheelTravelPerCycle']<8, 'lookup cycle is20deg tread period, not full turn'

def main():
 p=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'client/public/assets/cartoon/rover-v3'
 m=json.loads((p/'manifest.json').read_text()); assert m['version']==1
 assert len(m['palettes'])==8 and len(set(m['palettes']))==8
 assert len(m['headings'])==16
 assert_pose_metadata(m)
 atl={a['key']:json.loads((p/a['data']).read_text()) for a in m['atlases']}
 ims={a['key']:Image.open(p/a['image']).convert('RGBA') for a in m['atlases']}
 counts={'body':0,'wheel':0,'accent':0}
 def check(r,kind):
  counts[kind]+=1
  for k in ('width','height','anchorX','anchorY','offsetX','offsetY','depthOrder'): assert math.isfinite(r[k]),(k,r)
  f=atl[r['texture']]['frames'][r['frame']]['frame'];im=ims[r['texture']]
  assert 0<=f['x']<im.width and 0<=f['y']<im.height
  assert f['x']+f['w']<=im.width and f['y']+f['h']<=im.height
  assert f['w']==r['width'] and f['h']==r['height']
  assert ims[r['texture']].crop((f['x']-1,f['y']-1,f['x']+f['w']+1,f['y']+f['h']+1)).getchannel('A').getbbox() in (None,(1,1,f['w']+1,f['h']+1)),('alpha bounds',r['frame'])
  for axis,extent in [('X',r['width']),('Y',r['height'])]:
   v=r['offset'+axis]+m['rootAnchor'][0 if axis=='X' else 1];assert 0<=v and v+extent<=192
  assert r['width']<=(192 if kind=='body' else 96) and r['height']<=(192 if kind=='body' else 96)
 for i,h in enumerate(m['headings']):
  assert abs(h['screenAngle']-i*math.tau/16)<1e-6
  assert abs(math.atan2(math.sin(h['projectedFrontAngle']-h['screenAngle']),math.cos(h['projectedFrontAngle']-h['screenAngle'])))<1e-5
  assert set(h['body'])==set(m['palettes'])
  for rr in h['body'].values():
   for r in rr:check(r,'body')
  assert len(h['wheels'])==4
  for w in h['wheels']:
   assert set(w['poses'])==({'-1','0','1'} if w['front'] else {'0'})
   for phases in w['poses'].values():
    assert set(phases)=={'0','1','2','3'}
    for rr in phases.values():
     for r in rr:check(r,'wheel')
   assert set(w['accents'])==set(m['palettes'])
   for poses in w['accents'].values():
    for phases in poses.values():
     for rr in phases.values():
      for r in rr:check(r,'accent')
 assert counts=={'body':128,'wheel':512,'accent':4096},counts
 assess_roll(m,p)
 print('PASS',counts,'atlas PNG bytes',sum((p/a['image']).stat().st_size for a in m['atlases']),'RGBA bytes',sum(im.width*im.height*4 for im in ims.values()))

if __name__=='__main__':main()
