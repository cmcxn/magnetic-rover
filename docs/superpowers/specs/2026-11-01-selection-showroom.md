# Selection-only real 3D preview

User requested an isolated feature branch based on current main, implementation, testing screenshots and GitHub push for local acceptance. No merge, production deployment, WeChat upload or physics/network changes.

Use the existing rover Blender model exported as one lightweight GLB with three explicitly named theme materials; fixed white shell/rubber and red-N/blue-S magnet stay unchanged. Eight existing palettes share geometry. Camera is fixed; only model yaw changes via slow auto rotation and horizontal drag. No pitch, zoom or wheel-driving simulation. Color changes preserve angle.

Locations: H5 room's own-player selection card; WeChat pre-connect selection image and room's own-player card. Other players and match rendering stay static/current. Preserve current static PNG while loading or if 3D fails. Hidden/playing views do not animate; resources/listeners are cleaned up and re-entry works.

Approach: a shared Three.js 0.162 renderer (WebGL1-compatible, deliberately not latest WebGL2-only release). H5 uses an owned canvas; mini-game uses Phaser3.90 Extern on the existing canvas/context, never a second on-screen canvas. Export without external textures/decoder if measured size permits. Target total added runtime bytes 1–2MB; measure actual model, JS and mini main/total package delta, not source blend size. This is a version-pinned branch for acceptance, not a claim that old Three is the recommended evergreen baseline.

Alternatives: pre-rendered yaw frames would not satisfy requested true3D; a separate WebGL2 mini canvas conflicts with single-screen-canvas/state assumptions. Native WeChat/device and Tencent review remain unverified without those tools. Actual browser shared-context tests are necessary but not native proof.

## Mini-game compatibility gate

Actual main explicitly selects Canvas, and boot/platform obtain2D before Phaser. Phaser3.90 lacks a safe drop-in DPR scaling setting for WebGL. Therefore legacy Canvas remains the default with existing high-DPR quality. This branch exposes `wx.setStorageSync("rover.showroom3D", true)` then restart for experimental shared-WebGL1 preview; `rover.forceCanvas=true` overrides it. The opt-in path currently uses logical1x framebuffer and must be assessed on target devices. No claim of unchanged native rendering performance/quality. H5 preview is enabled normally. Promoting the mini path to default requires a separate DPR/device-validation gate.
