# Vehicle motion artwork v1

Approved imagegen masters based on the existing rover artwork. These are now integrated through lightweight runtime exports; the high-resolution masters stay outside the game package.

- motion-preview.png: concept illustration, not a runtime screenshot or an animation atlas.
- chassis.png: transparent wheel-less chassis, facing +X (right).
- tire.png: independent transparent tire, shared by four sprite instances.
- materials.json: source dimensions, alpha bounds and export information.

scripts/export-vehicle-assets.py technically normalizes the approved masters to chassis384x289 and tire128x78. World calibrates rear/front axles at x=-33/+22 and side offsets +/-25 in base world units, layering tires beneath the chassis. Eight fixed-silhouette tread phase textures are cached once at load time. See verification/vehicle-motion for actual screenshots and a recording.

The original rover.png remains for menus and compatibility fallback. Generated masters are not pixel-exact cutouts of that original image. Movement, steering, dust and boost flame are client presentation; server movement and collision rules remain unchanged. Audio integration uses an original synthesized motor loop.
