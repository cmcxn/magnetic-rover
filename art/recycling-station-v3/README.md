# Recycling station v3

Editable real Blender model authored from the **third panel of the user's actual gameplay-guide screenshot** (`1000088020.jpg`) and the current game's `station.png`. The short segmented circular structure, green recycling lid, front receiving entrance/ramp and restrained green strips follow that reference. Hidden back/underside are conservative inferences, not new gameplay structures.

## Files / reproduction

- `recycling-station-v3.blend`: editable named meshes, ground-center root at `(0,0,0)`.
- `build_station.py`: `blender -b -t 8 --python art/recycling-station-v3/build_station.py` from any working directory. No network, external font or source .blend dependency.
- `scene-reference.json`: camera rotation, world lighting and color management extracted from the approved rover's `magnetic_rover_v3_direction_source.blend`.
- `recycle-symbol-mesh.json`: canonical U+267B outline baked to mesh; source DejaVu Sans attribution/license in `SYMBOL_FONT_NOTICE.txt`. The portable generator reads the mesh directly and does not require the font.
- `station-hero.png`: transparent1024 large reference render. `station-preview.png`: labelled chat preview.
- Runtime: `client/public/assets/cartoon/station-v3.png` (256x256 RGBA) and `station-v3.json`.

## Integration contract (agreed with implementation owner)

Runtime JSON fields: `version`, `width`, `height`, `anchorX`, `anchorY`, `groundFootprintDiameterPx`.
Place the texture at existing `(station.x,station.y)` with origin `(anchorX,anchorY)`.
Set displayed canvas width/height to `(station.r+5)*2*metadata.width/groundFootprintDiameterPx` (height analogously).
Main circular ground footprint radius is 1.39 model units. The receiving ramp protrudes visually beyond it. Camera matches rover rotation; front entrance is model -X.

**Do not alter station center, r65/default radius, deposit rules, score or collision behavior.** Production sprite is transparent with self-shading only, no baked ground shadow. The original texture remains a runtime fallback owned by the integrator.

Only these art files and the station runtime PNG/JSON were authored by this asset worker. No world.ts edits, commits or remote push.
