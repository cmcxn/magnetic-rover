import unittest,json,pathlib
from PIL import Image
P=pathlib.Path(__file__).resolve().parent
R=P.parents[1]/'client/public/assets/cartoon'
class BatteryRuntime(unittest.TestCase):
 def test_ground_anchor_is_calibrated_at_actual_square_render_aspect(self):
  source=json.loads((P/'battery-v3.json').read_text())
  self.assertAlmostEqual(source['anchorY'],.7604096829891205,places=6)
 def test_runtime_is_existing_actual_model_sprite_with_safe_alpha_and_aspect(self):
  m=json.loads((R/'battery-v3.json').read_text());im=Image.open(R/'battery-v3.png')
  self.assertEqual(im.mode,'RGBA');self.assertEqual(im.size,(m['width'],m['height']));self.assertEqual((R/'battery-v3.png').read_bytes(),(P/'battery-v3-256.png').read_bytes())
  b=im.getchannel('A').getbbox();self.assertTrue(0<b[0]<b[2]<256 and 0<b[1]<b[3]<256)
  self.assertEqual(m['visibleHeightPx'],b[3]-b[1]);self.assertEqual(m['worldVisibleHeight'],28)
  self.assertAlmostEqual(m['anchorY'],.7604096829891205,places=6)
if __name__=='__main__':unittest.main()
