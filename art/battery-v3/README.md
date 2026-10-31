# Independent battery v3 source

Real editable Blender battery modeled after the actual current `client/public/assets/cartoon/battery.png`, visually inspected: glossy yellow cylinder, white lightning symbol, graphite end caps, silver positive terminal. The white lightning and positive mark are geometry, not a repainted image.

- `battery-v3.blend`: eight named mesh parts under `BATTERY_ROOT`, origin at ground/base Z0, up +Z.
- `build_battery.py`: `blender -b -t 6 --python art/battery-v3/build_battery.py` (portable; standard Blender only).
- `scene-reference.json`: approved rover's camera rotation, world lighting and color management.
- `battery-v3-256.png`: transparent reusable sprite, **art reference only** in this phase.
- `battery-hero.png`, `battery-preview.png`: hero model image and labelled chat preview.
- `battery-v3.json`: dimensions and ground-anchor metadata for potential future reuse.

**No runtime ground-pickup texture replacement and no cargo/20-slot changes in this phase.** Existing gameplay and display remain owned by the implementation lead. The user separately requested a persistent source model now.
