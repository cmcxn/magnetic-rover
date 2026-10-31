# Rover v3 production assets

Car-only prerendered visual replacement. No battery, tray, gameplay, network or physics artwork/logic is supplied here.

## Source and generation

`rover-source.blend` is the actual recovered `magnetic_rover_v3_direction_source.blend`, preserving all vehicle geometry and the original fixed orthographic camera and studio lights. Magnet/front is model +X; vehicle left +Y; up +Z. Original embedded text blocks were removed; generation never depends on automatic execution. Source is approximately 1.9 MiB. The portable Blender script uses only Blender's bundled Python. Packing/validation require Python 3 and Pillow.

```sh
# Run from this folder. Intermediates deliberately live outside the repository.
blender --disable-autoexec -b rover-source.blend -P render.py -- --output /tmp/rover-v3 --sample
# Inspect the four cardinal previews before the full render.
blender --disable-autoexec -b rover-source.blend -P render.py -- --output /tmp/rover-v3-production
python pack.py --input /tmp/rover-v3-production --output ../../client/public/assets/cartoon/rover-v3
python validate.py
```

`--start N --end M` supports disjoint heading batches; all16 heading metadata files must exist before packing. Existing individual PNGs are resumable, so use an empty directory when changing render settings. Source `.blend` is saved with wheels straight/root yaw zero at the beginning of a batch starting at heading0; Blender `.blend1` backups are not deliverables.

## Rendering and independent poses

- 192×192 fixed reference canvas, transparent film, Cycles64 samples, four CPU threads, three bounce maximum, Standard colour transform, no compositor glow and no denoiser (this Blender build has no OpenImageDenoise). Production crops are at most192px chassis/96px wheel.
- Invert the camera's projected ground-plane affine transform to solve16 **screen-uniform** clockwise headings. The metadata separately records the nonuniform model yaw and projected magnet-front angle.
- `steeringSign=-1` converts clockwise screen steering into source localZ (camera ground-projection determinant−1106.8612). Front steering is actual wheel-pivot local-Z rotation −25/0/+25°. Rear pivots remain straight. Rolling is actual local-Y rotation of the wheel meshes about their own axle, independently below steering.
- The source has18 identical tread periods. Four phases are0/5/10/15° within one20° tread period;90° phase intervals would alias alternating duplicate silhouettes. Metadata discloses the physical angles. Runtime signed travel selects these four visual phases; one lookup cycle is one tread period, **not** a full revolution. `heading.wheelTravelPerCycle` provides the projected travel for this period, using source tire radius.565 and the per-heading camera projection. The manifest also provides their mean. This does not change physics.
- Body is rendered without wheels. Each wheel is rendered with **every other vehicle surface (including the other three wheels) replaced by holdout geometry**. This preserves physical per-pixel chassis/wheel occlusion without brittle foreground/background rectangular patches. Wheel layers may safely composite over the complete body: only wheel surfaces actually visible in front of the chassis survive the mask.
- Hubs alone have a separate neutral shaded-radiance render with all non-hub geometry held out. Packing bakes8 colour variants into tiny cropped hub overlays. Rubber is never globally tinted. Body accents and lights are rendered8 times with real theme materials. White shell and red-N/blue-S magnet materials are unchanged. No runtime multiply tint is used.

## Manifest v1

See `schema.json`. `palettes` contains8 six-digit hex strings, no `#`. `atlases` supplies Phaser texture keys and PNG/JSON basenames. `headings[16]` uses radians; angle0 is screen-right, increasing clockwise. `body[palette]` is an array. A wheel's `poses[steer][phase]` is its neutral base array; `accents[palette][steer][phase]` is its theme hub array. Front steering keys are`-1,0,1`; rear only`0`; phase keys`0,1,2,3`.

Each layer has `texture,frame,width,height,anchorX,anchorY,offsetX,offsetY,depthOrder`. `anchorX/Y` are normalized cropped-sprite origins (both0). `offsetX/Y` are crop top-left relative to the ground-root projection in **reference pixels**. Never recenter individual crops. Apply one common scale `worldWidth/referenceSize=160/192`; `worldWidth` denotes the complete192px reference canvas, not the crop. Draw body before neutral wheels and selected baked hub layers, ordered by `depthOrder`.

Existing cargo can use `cargoProjection` without a new model: `origin + xAxis*(legacyX*.046+.481) + yAxis*(legacyY*.042)`, then the same common scale. `origin` is root-relative projection at source planeZ1.55; basis vectors represent one model-space unit. These factors register the existing25×24 legacy cargo region over the1.22×1.10 source roof.

## Validation and measured budget

The initial validator was executed before outputs existed and failed with `FileNotFoundError: manifest.json`, as intended. Final validation checks8 palettes,16 calibrated headings,128 body/512 wheel/4096 hub records, steering/phase coverage, finite anchors/depths, atlas frame resolution, reference bounds, transparent atlas padding, and crop budgets. Additional hub records are deliberately tiny baked mask variants rather than4096 new Blender wheel renders.

Four-heading pilot16sample run:36 images, average0.483s/image, range0.315–1.141s.64sample rerender visually inspected both at gameplay scale and4× enlarged: wheel attachment, physical occlusion and magnet direction passed. Texture/PNG measurements and production render timings are recorded below after generation.

### Final production measurements (2026-10-31)

-1152 actual Blender renders:128 chassis+512 neutral wheels+512 neutral shaded hub masks. Two disjoint heading jobs completed with exit0 in approximately18m29s wall time. Summed per-render timings2184.558s; mean1.896s, median1.405s, range.540–10.112s under shared CPU contention. These are workstation generation timings, **not** phone FPS.
-4736 runtime layer records reference4067 unique packed frames after lossless exact-pixel deduplication. Fully transparentRGB is cleared before packing; no visible-pixel quantization or lossy compression.
-2 atlases, each2048×2048: **33,554,432bytes /32MiB decoded RGBA**. PNG payload3,770,092bytes; runtime directory including manifest/atlasJSON **5,393,775bytes**. This excludes other game textures, decoded CPU image copies and driver overhead. This package alone exceeds4MiB onceJSON is included; mini-game main/subpackage placement must be verified by the integrator, not assumed eligible for publication.
-Largest crops: chassis134×111, wheel49×48, hub33×28. All reference-canvas edges clear; no clipping.
-Editable source1,985,328bytes, SHA256`8a65b022ec5b0858ae5a3818556b02957ba370b8f77b8b843f4131bf75520c37`.
-Per-heading tread-cycle travel4.642615–6.439909 world units, mean5.431536. Use per-heading values for projected geometric consistency.

`quality.json` records actual packed-pixel phase differences: premultipliedRGB RMS5.043/4.941/5.066 out255 for successive0→5→10→15° phases, alpha-silhouette changes179/174/179pixels (31/29/31 exceed16alpha levels). An independently repeated identical phase0 render is **decodedRGBA byte-for-byte identical**, with RGB/alphaRMS0. Thus the small phase differences are not random render grain. Tread motion remains intentionally subtle at gameplay scale.

```sh
# Optional reproducible deterministic-noise baseline and packed-pixel QA:
blender --disable-autoexec -b rover-source.blend -P render.py -- --output /tmp/rover-v3-production --sample --end 1 --repeat-check
python pixel_qa.py --repeat /tmp/rover-v3-production --output quality.json
python preview.py --output /tmp/rover-v3-final-qa
python -m unittest test_validate.py
```

Final production validator and5calibration unit tests passed. Final contact sheets reconstructed **from atlas pixels** were inspected for all16headings, all8themes and3steering×4rolling combinations; camera lighting, source front/rear, wheel attachment and holdout occlusion remain consistent. Browser/mini-game/cargo integration and physical device performance are separate coordinator checks, not asserted by this asset-only verification.

## Runtime boost effect

The unchanged boost state may add pooled thin cyan strips by cropping and colour-filling duplicates of the already masked wheel atlas frame. These temporary effects retain the wheel alpha and per-car depth, then disappear on boost end/reduced effects. No new bitmap, per-frame canvas or global car tint is generated; normal body, rubber, magnet and theme artwork remain untinted.

Known minor: baked hub overlays retain their neutral base underneath partially transparent antialias pixels, so tiny edges can be slightly less saturated than a fully separately theme-rendered wheel. Enlarged palette inspection found no objectionable halo.
