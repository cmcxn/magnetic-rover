# Independent whole-branch final source/art review — 2026-10-31

Reviewed baseline `91c8ccc58c05d744ebc4d6c98c0659caa7f2500a` through `a0b1cd7`, final-review.diff reconciled against current source, approved design/plan and superseding ledger rulings (station runtime replacement and battery source-only). No implementation edits, commits, push or subagents. Full viewport browser sweep is separately in progress; this review does **not** assert its completion.

## Verdict

**Changes requested: one Important visual-effects regression.** No Critical finding and no gameplay/protocol/physics change found. Other listed review-focus checks pass source/art review. Readiness remains conditional on resolving the boost-streak finding, verifying that correction, and completing/reviewing the actual browser sweep. Native mini-game/device and live-backend testing remain disclosed acceptance gaps, not inferred passes.

## Important

### 1. Prerendered wheels occlude their own approved boost streaks

- `client/src/world.ts:288` creates `wheelG` at depth **3.5**. New v3 layers at `world.ts:871–887` all render at **4 or higher**, including the neutral wheel pixels.
- Unchanged boost drawing at `world.ts:1143–1157` explicitly calls for streaks **ON the tires**, above tires and below chassis. The previous tire sprites were depth3; every v3 tire is now above the streak graphics. Opaque tire pixels necessarily erase their overlaid cyan/white streaks. Protruding line trails can remain, but are not the same approved effect. Halo, flame and boost label remain, so this is a visual regression rather than lost gameplay feedback entirely.
- The stroke geometry also still uses legacy rotated wheel coordinates rather than the new projected wheel registration, so simply moving the one shared graphics layer above all cars risks stray strokes across bodies and unrelated overlapping cars.
- Independent packed-alpha calculation at phase0/time0 intersected the actual wheel masks with the existing line geometry. For headings0/4/8/12, respectively, **185/681/232/373 reference pixels** of boost-line intersections are under wheel alpha>=250 (234/884/284/482 intersections at any alpha). Thus this is not merely a theoretical depth concern; there are actual on-wheel pixels that the new ordering hides. This was a mathematical packed-pixel check, not a browser screenshot.
- Existing `client/tests/world-render.test.mjs:611–643` asserts24 line calls, not resulting overlay depth/visibility or v3 wheel registration, so it does not prevent this regression.

**Required:** retain visible, registered on-tire boost streaks on the new artwork with correct per-car/body occlusion (do not globally lift all streaks above all cars). Add a v3 depth/registration or pixel regression test and inspect an actual boosted v3 capture. Re-review the focused fix and rerun affected tests/build before handoff.

## Minor / nonblocking

1. **Companion .blend output paths retain the cloud checkout.** `art/recycling-station-v3/build_station.py:79` and `art/battery-v3/build_battery.py:38` save sources while render.filepath is absolute. Independently opened all three deliverables in Blender with `--disable-autoexec`: rover uses `//preview.png`, but station and battery retain `/workspace/scratch/0811cde7f1f9/rover-visual-upgrade-20261031/repo/...`. Models have no external image dependencies or embedded text blocks, and generators derive paths from `__file__`, so regeneration remains portable; direct render-output saving from the transferred .blend requires choosing a new path. Prefer relative saved output paths or document this small handoff caveat.
2. **Known neutral hub AA edge:** `art/rover-v3/pack.py:36–40,52–54` overlays recoloured hub radiance on a wheel containing its neutral hub. Fractional-alpha edges can retain neutral energy. Previously quantified in asset-source-review.md; final eight-theme sheet was independently inspected here and this remains acceptable/nonblocking, not whole-wheel tint.
3. `git diff --check` reports two trailing-space lines in the preserved font-license notice only; no code whitespace issue. No need to alter license text for this review.

## Passed source/art checks

- Same-texture frame changes call `setFrame`; pooled sprites reset origin, rotation and dimensions. Stable layer slots are swept when absent; pose maps clear on reset/round and removed players.
- Signed midpoint-forward displacement drives roll. Idle/perpendicular/in-place motion does not invent roll; reverse decreases phase. Invalid/stale/reset/inactive and teleport samples rebase. Wrapped yaw and hysteresis preserve the heading seam.
- Actual production manifest has `steeringSign:-1`, sixteen screen-uniform projected headings and one20° tread period (`2π/18`) in four5° steps. Front pivots steer about localZ; roll is localY child geometry, restored after each phase. Rear stays straight. Runtime uses scaled per-heading tread-cycle travel.
- Production atlas contact sheets inspected: all16headings,8themes and3steer×4roll poses. No detached wheels, flipped front/back/magnet, clipped reference canvas or inappropriate visible wheel-body patch found. Prior independent geometry/holdout evidence remains bounded as documented, not re-labelled exhaustive.
- All8 body/light/hub accents are selected without globally tinting invariant tires/metal/white shell/magnet. Current source hash independently matches manifest provenance.
- All complete selected records/frames are checked before v3 enabling; missing manifest/atlas/frame retains fallback. Shared loader adds both PNG and JSON from manifest on H5 and mini-game override. Recursive mini-game copy is unchanged and includes new directories.
- Vehicle layers are grouped by displayedY with their internal depth preserved; actual internal wheel/hub depth range is1.001–1.061, well inside the per-car depth interval for the game's small player count. Cargo stays at existing global depth5 as before.
- Cargo clamp/floor/count0–20 and cell loop remain unchanged; only registration is mapped onto the projected roof. Actual cargo20/station screenshot was inspected; visible cells are registered/readable. Count/projection tests cover0/1/5/10/19/20 and source roof coordinates.
- Dust now uses the common v3/legacy contact path with existing reduced-effects/rate/speed gates; earlier Important dust issue is resolved.
- Station uses ground-center anchor and display-only scaling; existing center/radius and authoritative deposit rules are untouched. Battery new source/previews remain under art; runtime pickup/cargo battery assets and logic are unchanged.
- No server, protocol, Motion, control, dependency or lockfile modifications in the branch. New source assets are self-contained; editable models, scripts, palettes, runtime PNG/JSON and provenance are present.

## Evidence and limits

Read final logs rather than duplicate full runs:184client tests pass; H5 build pass;38mini tests pass; mini build pass;2postbuild asset-path tests pass; production asset validator pass. Coordinator additionally reports5asset metadata unit tests pass. Independently verified manifest/source SHA match, opened three .blend files read-only for dependencies/output paths, inspected actual packed sheets and cargo20/station screenshot, and performed the boost-mask intersection check above.

Measured budget:2×2048² RGBA=33,554,432bytes (32MiB), PNG3,770,092bytes, runtime folder5,393,775bytes. Mini-game main1,357,680bytes/art8,317,561bytes/total9,675,241bytes are build measurements, not native upload eligibility. No phone performance claim. Actual full true-viewport browser replay and its resulting pixel inspection are **pending** at review time; the already-inspected CUA image has a390×844 canvas inside a larger desktop browser viewport, not emulated mobile-browser proof.

## Integrator disposition after the review

The Important boost finding is fixed by commit `3329570`: actual wheel-frame alpha is reused for three cropped strips per wheel, pooled within the same vehicle depth group. Regression observed RED(0 instead of12 strips) then GREEN;185/185client tests, H5build,38mini tests/build and2postbuildpath checks pass. Actual browser rendered12correctly registered strips; reduced effects/boostend remove them. No global graphics-depth raise or new canvas was introduced.

At the initial handoff the headless runner was blocked by the shell environment and desktop launch authority was pending. The authorized existing browser therefore completed24actual-production-renderer checks across fixed390×844/844×390/1200×800 Phaser canvases, all16headings×8palette inspections,8motionframes, signed forward/reverse/idle/lateral, steering, cargo, boost/reduced, removal/reset, fallback and navigation. See `cua-browser-report.json`. This is deliberately not called mobile-browser viewport emulation, live-network proof, nativeWeChat or real-phone performance.

Both disclosed minor findings remain documented. No Critical/Important runtime finding remains open after the tested fix; local native/device acceptance is still required.


### Subsequent true-viewport closure

With explicit desktop-process authorization, the full Chromium sweep subsequently passed120captures across390×844,844×390,1200×800 with zero page errors. A minimal test-harness regex correction accepts Vite's observed CommonJS Phaser import alias; runtime source/assets/assertions are unchanged. See `headless-summary.json`. Native WeChat, physical-phone/touch performance and live-backend acceptance remain untested.
