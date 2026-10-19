# Magnetic rover raster assets

Generated on 2026-10-18 using OpenAI's built-in image_gen tool, one independent call per asset, with `transparent_background: true`. All originals are preserved as 1254 × 1254 RGBA PNGs with alpha range 0–255. Full prompts and original generation paths are in `prompts.json`. These assets are AI-generated; this record makes no CC0 or copyright-clearance guarantee.

Style references inspected before generation:
- `rover_concepts/磁力小车_02_开局采集.png`
- `rover_concepts/磁力小车_地图01_开放圆场.png`

| File | Orientation | Visible bounds (alpha > 8) |
| --- | --- | --- |
| rover.png | Front points right/east; default rotation 0 radians | (101, 271, 1194, 1034) |
| battery.png | Positive terminal points up | (401, 175, 852, 1081) |
| recycle-station.png | Circular, directly overhead | (50, 42, 1204, 1196) |

Bounds are left, top, right-exclusive, bottom-exclusive. Extremely faint alpha noise is present outside the visible silhouette. Define texture frames using the visible bounds, retaining the original alpha. Files were visually inspected: each contains a single requested object with no terrain or text. The rover's neutral body supports runtime tinting, or use colored outlines/ground rings to preserve the painted detail.

Keep grass, sandy ground, safe-zone boundaries, shadows and animated particles procedural. Avoid a full baked map image: independent sprites support camera zoom, vehicle rotation and gameplay feedback.
