# Implementation review and verification

Baseline `91c8ccc58c05d744ebc4d6c98c0659caa7f2500a`; feature branch `feat/prerendered-rover-v3`. No main merge, deployment, server, network protocol, authoritative motion or capacity/rule changes.

## Verified local checks

- Baseline:165 client tests and H5 production build passed before implementation.
- Final code after boost correction:185 client tests and H5 production build passed.
- Mini-game:38 tests, local build, then2 post-build atlas/path checks passed.
- Production assets: manifest/frame/alpha/registration validator passed;5 steering/travel calibration tests passed.
- Actual decoded same-pose repeat render is byte-identical; four tread phases have genuine silhouette differences, not merely stochastic grain.
- Independent source inspection compared all128 recovered rover meshes: names, parenting, vertex/polygon hashes and local transforms are unchanged.
- Independent physical occlusion experiment compared both front wheels at±25° across8 headings, opposite front straight versus identically steered:32 alpha comparisons were exactly identical. No observed inter-wheel masking hole in those cases; this was not an exhaustive proof of arbitrary future geometry.

- Subsequent authorized desktop-shell Chromium sweep:120true-viewport captures at390×844/844×390/1200×800; all assertions and page-error checks passed after a one-line harness import-discovery fix. Production runtime/assets were unchanged. See `headless-summary.json`; cloud headless timings are not phone FPS.

## Independent review findings and disposition

One final Important finding was corrected: the legacy on-tire boost graphics were below the new wheel sprites. A regression test failed with0 versus12 expected wheel strips before the fix. The new strips pool duplicates of the actual masked wheel atlas frame, crop two-reference-pixel bands, and use source alpha and each car's depth group. They neither paint hidden body regions nor appear over a nearer car. Reduced effects and expired boost remove them. The185-test suite/build passed after the correction; actual browser diagnostics confirmed12 registered cropped strips and zero after reduced effects.

Earlier review caught camera steering handedness and disabled tire dust; both were fixed and covered before final review. Screen-positive steering maps to model local-Z negative under the fixed camera. Existing dust emission is shared by both rendering paths.

### Deferred minor limitations

- Neutral hub pixels remain underneath the coloured hub overlay at fractional antialias alpha. Tiny edges can be slightly desaturated. Enlarged eight-palette sheets showed no objectionable halo; no global body/rubber/magnet tint is applied.
- Station/battery `.blend` files retain the cloud output filepath for a manual render. The geometry is editable and portable generators compute local paths; set a local Output path when rendering those saved scenes directly.

## Engineering rulings

- Latest requested theme colours include hubs and lights, superseding the earlier draft's neutral-hub suggestion.
- Four lookup phases span one20° repeated tread segment, not four90° wheel rotations; physical travel per lookup cycle is heading-calibrated. Four-frame animation can still alias at some speeds, so physical-phone visual/performance acceptance remains local.
- Existing cargo cells are mapped onto a source-projected roof plane; no new20-slot model or gameplay change was made. The separately requested battery is source/preview only. Station art was additionally authorized and uses ground-anchor metadata without changing deposit radii.
- Actual atlas budget fit without a runtime theme-mask tint or speculative resource-package splitting. Mini-game and mini-program size rules were not conflated; Developer Tools remains the final platform/account check.

See `README.md` and browser JSON for actual renderer evidence and precise limitations. Synthetic snapshot playback is not live-backend or phone evidence.
