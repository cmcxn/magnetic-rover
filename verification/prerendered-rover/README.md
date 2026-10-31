# Prerendered rover: actual browser evidence

## True-viewport Chromium verification

The authorized desktop-shell route subsequently completed the full headless sweep: **120 PNG captures, zero page errors, all assertions passed** at390×844,844×390 and1200×800. Coverage includes16headings,8palettes, signed forward/reverse/idle/lateral travel, per-render steering transitions, cargo0/10/20, zero atlas rotation/pixel budgets, overlap depth, boost alpha reuse/reduced cleanup, removal/reset, missing-atlas fallback and repeated navigation. See `headless-summary.json` for the final run and timing/memory measurements. These are real Chromium viewport sizes, not physical-phone or touch-driver validation.

The first attempt exposed a test-harness-only issue: Vite rewrote the Phaser default import to a CommonJS interop identifier. The discovery regex now accepts that observed identifier while requiring the Phaser module URL. Production World, atlases and assertions were unchanged. An outside-repository diagnostic copy established the fix before the minimal harness amendment.

## Earlier authorized CUA verification

`cua-browser-report.json`: **24 authorized browser checks passed**, plus16headings×8palettes with72registered layers per heading. Actual production `World` imported through Vite; synthetic snapshots, not a backend replay.

- Fixed Phaser canvases390×844,844×390,1200×800; cargo0/10/20 and player removal/reset verified at each size.
- All16heading crops inspected: magnet/front continuity including15→0, wheel registration/occlusion, eight accents, invariant rubber/metal, readable existing20-cell cargo.
- Forward phase+10.7358; reverse−10.7601; idle/lateral0; stationary steering transitions0→1.
- Whole-car overlap depth ordering, missing-manifest fallback, reduced effects,12cropped wheel-alpha boost strips and cleanup, three repeated navigations.
- Eight short-sequence screenshots in `motion/`, with actual wheel atlas frame names and signed phases recorded in the JSON. Tread changes are deliberately subtle at gameplay scale.
- Rover atlas RGBA estimate33,554,432bytes(32MiB). All loaded raster source estimate40,931,240bytes, deduplicating texture-manager and scene-child image/canvas objects, including labels/legacy/island overhead. Excludes decoded CPU copies, driver allocations and mipmaps.
-90desktop-browser RAF intervals;89after warmup: median16.7ms,p9516.7ms,max16.8ms. **Not physical-phone FPS.**

Representative JPEGs: four `eight-palettes-heading-*` crops, portrait cargo20+station, landscape boost, overlap, final fallback, and motion sequence. Full diagnostics accompany selected captures. JPEG screenshots are browser-produced, not artwork renders.

## Limits

The earlier CUA browser viewport remained1188×761; its requested sizes were fixed Phaser canvases. That original limitation is superseded by the later dedicated Chromium sweep above. `headless-launch-blocker.json` records the earlier sandbox launch failure, not the final result. Cloud headless performance can differ from the earlier CUA timing sample; use the separate raw timings in `headless-summary.json`, not a universal FPS claim.

No native mini-game simulator, real-device performance, live networking/reconnect, authoritative station deposit behavior, or publication/upload eligibility is proven here. The fixture keeps station radius65; source/rules audits are separate.

## Reproduce the true-viewport sweep locally

Start Vite in `client`, then from repository root:

```sh
BASE_URL=http://127.0.0.1:5173 SCREENSHOTS=/tmp/rover-browser-final node client/tests/rover-visual.browser.mjs
```

If Playwright is absent, optional local setup (no lockfile changes):

```sh
cd client
npm install --no-save --package-lock=false playwright
npx playwright install chromium
```

`BROWSER_EXECUTABLE` overrides the executable; otherwise system `/usr/bin/chromium` is used when present, then Playwright's installed browser. The full sweep produces120screenshots and asserts actual signed rolling, steering transitions sampled every rendered frame, frame pixel budgets, zero sprite rotation, cargo cases, boost alpha reuse, overlap, fallback and lifecycle cleanup. `ALLOW_LEGACY=1` is a baseline-only escape hatch, never acceptance.

`client/rover-visual-fixture.html` is the verification-only DOM-control route: query parameters `w`,`h`,`heading`,`palette`,`cargo`,`grid=1`,`overlap=1`,`station=1`,`fallback=1`. It does not change production app behavior. The fallback case suppresses manifest preload in a verification-only subclass and uses the unchanged production fallback selector.
