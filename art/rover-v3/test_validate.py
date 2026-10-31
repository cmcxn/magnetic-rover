import unittest
import validate
class PoseMetadataTests(unittest.TestCase):
 def valid(self):return {'steeringSign':-1,'wheelTravelPerCycle':5.5,'headings':[{'wheelTravelPerCycle':5.5} for _ in range(16)]}
 def test_accepts_calibrated_pose_metadata(self):validate.assert_pose_metadata(self.valid())
 def test_rejects_absent_sign(self):
  m=self.valid();del m['steeringSign']
  with self.assertRaises((KeyError,AssertionError)):validate.assert_pose_metadata(m)
 def test_rejects_reversed_sign(self):
  m=self.valid();m['steeringSign']=1
  with self.assertRaises(AssertionError):validate.assert_pose_metadata(m)
 def test_rejects_missing_heading_travel(self):
  m=self.valid();del m['headings'][0]['wheelTravelPerCycle']
  with self.assertRaises((KeyError,AssertionError)):validate.assert_pose_metadata(m)
 def test_rejects_full_circumference_alias(self):
  m=self.valid();m['headings'][0]['wheelTravelPerCycle']=60
  with self.assertRaises(AssertionError):validate.assert_pose_metadata(m)
if __name__=='__main__':unittest.main()
