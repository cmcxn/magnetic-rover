"""Promote the already rendered model sprite without modifying its pixels.
Run python3 art/battery-v3/export_runtime.py; Pillow is needed for alpha bounds.
Regenerate the source with build_battery.py first if the model changes.
"""
from pathlib import Path
from PIL import Image
import json,shutil
P=Path(__file__).resolve().parent
R=P.parents[1]/'client/public/assets/cartoon'
source=P/'battery-v3-256.png';im=Image.open(source).convert('RGBA');bounds=im.getchannel('A').getbbox()
assert bounds and 0<bounds[0]<bounds[2]<im.width and 0<bounds[1]<bounds[3]<im.height
m=json.loads((P/'battery-v3.json').read_text())
assert (m['width'],m['height'])==im.size
m.update(texture='battery-v3.png',visibleHeightPx=bounds[3]-bounds[1],alphaBounds=list(bounds),worldVisibleHeight=28,
 scope='Runtime ground/pickup sprite replacement. Existing cargo cells and all gameplay remain unchanged.',
 placement='Uniform scale worldVisibleHeight/visibleHeightPx. Place ground anchor at (battery.x,battery.y+6-battery.z); original ground shadow stays at y+6. Do not rotate the image.',
 calibration='Camera projection evaluated after resolution256x256 and view-layer update, matching the rendered PNG.')
R.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,R/'battery-v3.png');(R/'battery-v3.json').write_text(json.dumps(m,indent=2)+'\n')
print('Exported unchanged model battery sprite; visibleheight',m['visibleHeightPx'],'anchor',m['anchorX'],m['anchorY'])
