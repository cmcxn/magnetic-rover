"""Technical normalization of approved sprite masters; no new artwork is painted."""
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
source=root/'images/vehicle-motion-v1'
out=root/'client/public/assets/cartoon'
body=Image.open(source/'chassis.png').convert('RGBA')
body.resize((384,289),Image.Resampling.LANCZOS).save(out/'rover-chassis.png',optimize=True)
tire=Image.open(source/'tire.png').convert('RGBA')
bounds=tire.getchannel('A').point(lambda a:255 if a>=32 else 0).getbbox()
tire.crop(bounds).resize((128,78),Image.Resampling.LANCZOS).save(out/'rover-tire.png',optimize=True)
print('Exported approved chassis384x289 and tire128x78')
