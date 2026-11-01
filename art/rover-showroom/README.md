# Rover selection-showroom GLB

Read-only conversion of `art/rover-v3/rover-source.blend` for the selection screen, not a replacement gameplay model or print conversion. The source SHA-256 is recorded in the manifest. No source geometry is simplified: all 86,348 evaluated triangles, including pole letters, are retained. Static geometry is merged into 12 material primitives (12 draw calls). No texture, camera, studio ground, light, animation, Draco, or Meshopt decoder is shipped.

## Reproduction and checks

From repository root (Blender 4.3.2; Python standard library):

```sh
blender --disable-autoexec -b --python art/rover-showroom/export_glb.py
python art/rover-showroom/test_asset.py
# After installing the client dependencies:
node art/rover-showroom/test_loader.mjs
# Optional visual comparison, writes /tmp/rover-showroom-qa by default:
blender --disable-autoexec -b --python art/rover-showroom/verify_render.py
```

Runtime files live in `client/public/assets/cartoon/rover-showroom/`. The GLB is 1,053,736 bytes. Agreed asset ceiling is 1,100,000 bytes, retaining a simple TRIANGLES mesh rather than risking a more complex representation to save 5 KB; the complete feature remains subject to the implementation's 1–2 MB budget.

## Coordinate and material contract

- glTF Y-up, magnet/front +X, original ground-center pivot (0,0,0). Rotate the scene around Y for the turntable. Bounds are recorded in manifest.json; do not assume its geometric center equals the pivot.
- `theme_shellaccent`: roof/blue panels/hub centers; change `.color`.
- `theme_hub`: illuminated hub rings/arch; change `.color` and `.emissive`, preserve emissive intensity 1.3.
- `theme_light`: light center; change `.color` and `.emissive`, preserve emissive intensity 2.0.
- Use `THREE.Color.set('#38bdf8')` (CSS sRGB converted to linear), not raw hex-byte division into linear factors.
- Every `fixed_*` material remains unchanged, particularly red `fixed_magnet_n`, blue `fixed_magnet_s`, connector, and ivory N/S letters. Neutral shell, rubber and dark chassis are fixed.
- Eight palette hex values are in manifest.json and match game constants.

## Precision / portability

KHR_mesh_quantization is the only required extension, natively supported by Three GLTFLoader without a decoder. Positions use normalized unsigned-short coordinates with one uniform node scale; max measured error is 0.000043 model units. Normals use normalized signed bytes; max measured angular error is 0.371 degrees. PBR base colors, metalness, roughness, specular and emissive factors are copied from Blender, in linear space. World-space geometry preserves modifier results and corrected winding. Runtime lighting/tone mapping may differ naturally from Cycles; it must be checked in the actual browser separately.

Tests validate file budget, geometry counts, theme/fixed material contract, no external assets, and actual Three GLTFLoader parsing and world bounds. The optional Blender import render comparison checks source versus shipped geometry under the same camera and lights without saving the source.
