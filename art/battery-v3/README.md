# Independent battery v3 source

Real editable Blender battery modeled after the actual current `client/public/assets/cartoon/battery.png`, visually inspected: glossy yellow cylinder, white lightning symbol, graphite end caps, silver positive terminal. The white lightning and positive mark are geometry, not a repainted image.

- `battery-v3.blend`: eight named mesh parts under `BATTERY_ROOT`, origin at ground/base Z0, up +Z.
- `build_battery.py`: `blender -b -t 6 --python art/battery-v3/build_battery.py` (portable; standard Blender only).
- `scene-reference.json`: approved rover's camera rotation, world lighting and color management.
- `battery-v3-256.png`: transparent reusable sprite, source for the runtime pickup sprite.
- `battery-hero.png`, `battery-preview.png`: hero model image and labelled chat preview.
- `battery-v3.json`: dimensions and ground-anchor metadata calibrated at the actual 256×256 render aspect.

The user subsequently requested runtime replacement. Run `python art/battery-v3/export_runtime.py` to copy the unchanged production PNG and export calibrated metadata to `client/public/assets/cartoon`. Visible alpha height is 28 world units, aspect ratio is preserved, and the ground root follows the existing shadow center at `(x, y+6)`; server airborne height is subtracted once. Old battery texture remains a load-failure fallback. **Cargo/20-slot display and gameplay remain unchanged.**

Validation: `python -m unittest discover -s art/battery-v3 -p test_runtime.py`. Ground anchor Y is 0.760409683; the earlier 0.962950554 was computed at Blender’s default non-square aspect and has been corrected.
