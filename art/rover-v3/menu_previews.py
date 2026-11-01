"""Compose menu previews from production rover atlas layers; requires Pillow."""
import json
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parents[2]
base = root / 'client/public/assets/cartoon/rover-v3'
out = base.parent / 'rover-menu'
out.mkdir(exist_ok=True)
m = json.loads((base / 'manifest.json').read_text())
atlases = {a['key']: (Image.open(base / a['image']).convert('RGBA'), json.loads((base / a['data']).read_text())['frames']) for a in m['atlases']}
h = m['headings'][15]
for palette in m['palettes']:
    layers = list(h['body'][palette])
    for w in h['wheels']:
        layers += w['poses']['0']['0'] + w['accents'][palette]['0']['0']
    canvas = Image.new('RGBA', (384, 384))
    for layer in sorted(layers, key=lambda l: l['depthOrder']):
        atlas, frames = atlases[layer['texture']]
        f = frames[layer['frame']]['frame']
        sprite = atlas.crop((f['x'], f['y'], f['x']+f['w'], f['y']+f['h']))
        canvas.alpha_composite(sprite, (round(192+layer['offsetX']), round(192+layer['offsetY'])))
    canvas = canvas.crop(canvas.getbbox())
    canvas.save(out / (palette+'.png'))
