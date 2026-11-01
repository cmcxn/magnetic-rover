# Real selected-car3D browser evidence

**Passed:** actual H5 lobby at1200×900 and390×844, plus844×390smoke; actual CartoonPanel/World/Showroom3D shared-WebGL1 browser fixture; visible preview-button/helper contract. `summary.json` identifies two successful final runs and exact limits. This is runtime Chromium evidence, not Blender-only renders.

## Three tracked screenshots

- `h5-1200-lobby-ready.png`: actual H5 own-player lobby card, larger fitted3D car.
- `h5-844-lobby-ready.png`: actual short-landscape H5 card; preview/name remain separate.
- `mini-experimental-webgl1-preconnect.png`: actual CartoonPanel preconnect hero, same canvas WebGL1/PhaserExtern and visible switch-back button.

All other theme/portrait/fallback/context/gameplay/default-density PNGs and full raw reports are outside the repository at `../rover-showroom-qa-20261101/` relative to repository root. `budget.json` belongs to the asset/package audit.

## What passed

H5: preview only on own actual lobby card; slow automatic yaw; horizontal drag; vertical drag/wheel do not pitch/zoom; eight themes preserve yaw and fixed red/blue magnets/white letters; twelve roster redraws reuse one model; unchanged packets preserve active capture; real host replacement/outside release permits another drag and resumes auto-yaw; playing removes/disposes preview, reentry preserves yaw; missingGLB static fallback; actual WebGL context loss/restoration.

Mini browser fixture: imports/bundles the actual CartoonPanel and density/helper source, actual World and actual shared Showroom3D; WebGL1 explicitly verified. Preconnect and own-lobby card, all eight themes, fixed camera, repeated UI redraw, viewport/scissor/depth/framebuffer preservation, real gameplay render after3D disposal, and actual context loss/restore all passed with GLerror0. Default Canvas density1/2/3 produced900×700/1800×1400/2700×2100 buffers at logical900×700.

Visible default-Canvas and room buttons were clicked through actual panel hit geometry. Actual `requestPreviewMode` ran with mock wx modal/storage callbacks: cancel preserves settings, confirm stores next-start preference and shows restart-pending text without hot-changing renderer/density. **This is not a real native WeChat modal capture.**

## Important limits

- WeChat default remains high-density **Canvas with static preview**. True3D is an explicit experimental option, applied only after closing/reopening.
- Experimental shared-WebGL1 deliberately stays1×:900×700 framebuffer at browserDPR2. Screenshot pixels are1800×1400 due browser compositing, not a native2× WebGL buffer. Do not claim high-DPR experimental3D support.
- Actual native WeChat/device, platform bootstrap, live server/network and publication were not verified. Fixture HUD `60FPS` is synthetic model data, not a measurement. No phone-FPS claim.
- Observer-only test instrumentation records actual class state/materials/GL restoration. Production files are not patched by this harness.

## Reproduce

With Vite serving `client` at127.0.0.1:5178 and Playwright/Chromium installed, from repository root:

```sh
BASE_URL=http://127.0.0.1:5178 SCREENSHOTS=../rover-showroom-qa-20261101 node client/tests/showroom.browser.mjs
```

`SHOWROOM_ONLY=mini` reruns actual panel/density/button cases; `SHOWROOM_SMOKE=1` captures first H5 ready frame only. `--check-ready` checks source/GLB readiness. Successful full and mini-with-button runs are distinguished in the summary; neither is mislabeled native-device proof.
