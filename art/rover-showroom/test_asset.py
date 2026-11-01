"""Binary/runtime contract. Missing GLB, wrong theme/pole materials, bloated payload or unexpected external asset must fail."""
import json,struct,unittest,math
from pathlib import Path
P=Path(__file__).resolve().parent;D=P.parents[1]/'client/public/assets/cartoon/rover-showroom'
def read_glb(p):
 b=p.read_bytes();magic,v,n=struct.unpack_from('<III',b);assert magic==0x46546c67 and v==2 and n==len(b)
 size,kind=struct.unpack_from('<II',b,12);assert kind==0x4e4f534a;j=json.loads(b[20:20+size]);return b,j
class ShowroomAsset(unittest.TestCase):
 def test_glb_contract_and_fixed_poles(self):
  self.assertTrue((D/'rover.glb').exists(),'Showroom GLB not exported yet')
  b,j=read_glb(D/'rover.glb');self.assertLess(len(b),1100000);self.assertFalse(j.get('images'));self.assertFalse(j.get('textures'));self.assertFalse(j.get('cameras'));self.assertFalse(j.get('animations'))
  names={m['name']:m for m in j['materials']};self.assertEqual({n for n in names if n.startswith('theme_')},{'theme_shellaccent','theme_hub','theme_light'})
  for n in ['fixed_magnet_n','fixed_magnet_s','fixed_magnet_connector','fixed_pole_letters']:self.assertIn(n,names)
  n=names['fixed_magnet_n']['pbrMetallicRoughness']['baseColorFactor'];s=names['fixed_magnet_s']['pbrMetallicRoughness']['baseColorFactor'];self.assertGreater(n[0],n[2]*5);self.assertGreater(s[2],s[0]*5)
  self.assertLessEqual(sum(len(m['primitives']) for m in j['meshes']),12)
  self.assertNotIn('KHR_draco_mesh_compression',j.get('extensionsRequired',[]));self.assertNotIn('EXT_meshopt_compression',j.get('extensionsRequired',[]))
 def test_manifest_budget_and_y_up(self):
  self.assertTrue((D/'manifest.json').exists(),'Showroom manifest not exported yet')
  m=json.loads((D/'manifest.json').read_text());self.assertEqual(m['upAxis'],'+Y');self.assertEqual(m['frontAxis'],'+X');self.assertEqual(m['sourceTriangleCount'],86348);self.assertEqual(m['exportedTriangleCount'],86348)
  self.assertLess(m['maxPositionQuantizationError'],.0001);self.assertEqual(len(m['palettes']),8);self.assertEqual(m['themeMaterials'],{'shellaccent':'theme_shellaccent','hub':'theme_hub','light':'theme_light'})
  self.assertEqual(m['sourceUnmodified'],True);self.assertEqual(m['externalDecoderRequired'],False)
if __name__=='__main__':unittest.main(verbosity=2)
