"""Asset contract tests: a wrong yaw, reversed entrance or clipped sprite must fail.
Run with Python3 + Pillow: python art/recycling-station-v3/test_directions.py
"""
import unittest,json,math
from pathlib import Path
from PIL import Image
P=Path(__file__).resolve().parent;RUNTIME=P.parents[1]/'client/public/assets/cartoon'
POSITIONS=[(-330,-220),(330,-220),(0,380)]
def angle_delta(a,b):return abs(math.atan2(math.sin(a-b),math.cos(a-b)))
def actual_screen_angle(yaw):
 # Independent analytic camera-inverse projection of model entrance -X.
 a,b,c=json.loads((P/'scene-reference.json').read_text())['camera_rotation_xyz'];ca,sa,cb,sb,cc,sc=math.cos(a),math.sin(a),math.cos(b),math.sin(b),math.cos(c),math.sin(c)
 camera_right=(cc*cb,sc*cb,-sb)
 camera_up=(cc*sb*sa-sc*ca,sc*sb*sa+cc*ca,cb*sa)
 x,y=-math.cos(yaw),-math.sin(yaw)
 return math.atan2(-(camera_up[0]*x+camera_up[1]*y),camera_right[0]*x+camera_right[1]*y)
class StationDirections(unittest.TestCase):
 def test_three_frames_point_ground_entrances_inward(self):
  path=RUNTIME/'station-v3-directions.json';self.assertTrue(path.exists(),'Missing three-direction station manifest')
  m=json.loads(path.read_text());self.assertEqual(m['version'],1);self.assertEqual(len(m['frames']),3)
  for i,(frame,(x,y)) in enumerate(zip(m['frames'],POSITIONS)):
   with self.subTest(station=i):
    target=math.atan2(-y,-x);self.assertEqual(frame['key'],f'station-v3-{i}');self.assertEqual(frame['image'],f'station-v3-{i}.png')
    self.assertLess(angle_delta(frame['screenAngle'],target),1e-6)
    self.assertLess(angle_delta(actual_screen_angle(frame['modelYaw']),target),1e-6)
    root=frame['rootAnchorPx'];door=frame['entranceAnchorPx'];self.assertLess(angle_delta(math.atan2(door[1]-root[1],door[0]-root[0]),target),1e-6)
    self.assertAlmostEqual(root[0],frame['anchorX']*frame['width'],places=5);self.assertAlmostEqual(root[1],frame['anchorY']*frame['height'],places=5)
    self.assertGreater(frame['groundFootprintDiameterPx'],100);self.assertLess(frame['groundFootprintDiameterPx'],256)
    im=Image.open(RUNTIME/frame['image']);self.assertEqual(im.mode,'RGBA');self.assertEqual(im.size,(256,256));self.assertEqual((frame['width'],frame['height']),im.size)
    b=im.getchannel('A').getbbox();self.assertIsNotNone(b);self.assertGreater(min(b[:2]),3);self.assertLess(max(b[2:]),253)
 def test_fallback_anchor_matches_calibrated_direction_root(self):
  m=json.loads((RUNTIME/'station-v3-directions.json').read_text());old=json.loads((RUNTIME/'station-v3.json').read_text())
  for frame in m['frames']:
   self.assertAlmostEqual(old['anchorX'],frame['anchorX'],places=6)
   self.assertAlmostEqual(old['anchorY'],frame['anchorY'],places=6)
 def test_original_fallback_remains_available(self):
  self.assertTrue((RUNTIME/'station-v3.png').exists());self.assertTrue((RUNTIME/'station-v3.json').exists())
if __name__=='__main__':unittest.main(verbosity=2)
