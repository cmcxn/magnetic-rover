# Selected-car 3D preview — isolated acceptance branch

Branch `feat/rover-3d-selection-preview`, based on main `fbd4bc6bf4884ddbd23b228c081300ea735cbb78` (1.9.9). No merge, deployment, WeChat upload/version bump or server changes.

## What changes

- H5: your own car in a room's color-selection roster is real3D; other cars remain static.
- Mini-game: pre-connect selection hero and own room car can use the experimental shared-canvas3D path below.
- Fixed camera, slow yaw auto-turn and horizontal drag only. No pitch/zoom. Eight existing themes share one GLB; fixed white/rubber and red-N/blue-S magnet are not recolored. Angle survives recolor/rebuild.
- Matches still use existing prerendered sprites. Static selection art remains while loading or if GLB/renderer fails.

## Important mini-game gate

**Default is still legacy Canvas with the original device-pixel-density behavior.** This protects existing game/UI quality.

**Visible switch:** on the initial car-selection screen, tap **3D预览（实验）** below the enter-lobby button; in a room, the same button is at the upper left beside the room code. Read the native confirmation, then confirm and close/reopen the mini-game. It saves settings only; the current canvas does not hot-swap. **切回普通预览** restores the old mode after the same restart. Cancel changes nothing. A pending-restart label remains visible.

Alternatively, in WeChat Developer Tools console:

```js
wx.setStorageSync('rover.showroom3D', true);
wx.removeStorageSync('rover.forceCanvas');
// Restart/recompile the mini-game (must happen before the first getContext).
// After restart: GameGlobal.__roverRenderer.mode should be "webgl".
```

The experimental path uses shared **WebGL1** on the existing on-screen canvas and currently a **1x logical framebuffer**. It is intentionally not enabled by default: Phaser3.90 does not expose a safe drop-in high-DPR WebGL setting and naive sizing corrupts projections/scissor. It may look softer than default Canvas on high-DPR phones. To return to the old renderer:

```js
wx.setStorageSync('rover.forceCanvas', true);
wx.removeStorageSync('rover.showroom3D');
// Restart/recompile. GameGlobal.__roverRenderer.mode should then be "canvas".
```

WebGL acquisition failure before a context exists falls back to Canvas. Once a WebGL context exists, a renderer fault cannot magically switch that same canvas to2D; use the restart flag. Missing GLB uses static car art. No Tencent review approval or native-device result is claimed.

## Local validation

```sh
git fetch origin feat/rover-3d-selection-preview
git switch feat/rover-3d-selection-preview
cd client
npm ci
npm test
npm run build
cd ..
client/node_modules/.bin/tsc --noEmit -p minigame/tsconfig.json
node --test minigame/tests/*.test.mjs
node minigame/build.mjs
```

Use Node24 as in cloud tests. Start the existing backend workflow plus `cd client && npm run dev`; enter a room as a player, drag only your own car, change colors, leave/re-enter and start a match. Browser evidence uses synthetic authoritative-shaped snapshots, not a claim of online server testing.

For mini acceptance, import the existing mini project after build. Test default Canvas atDPR1/2/3, then explicitly enable3D and restart. Check selection drag/color, room roster refresh while holding a pointer, back/re-entry, background/foreground, context recovery, missing asset, full match UI/controls, performance and memory on actual Android/iOS. Revert forceCanvas if needed. Native WeChat tools/phones are not available in this cloud run.

## Version and resources

Three is pinned to0.162.0 (last WebGL1-compatible line), not latest; upgrading to r163+ without changing the shared-context architecture is invalid. No remote scripts, external textures, HDR maps or geometry decoder downloads. GLB comes from the existing source, static geometry merged by material, with native `KHR_mesh_quantization`.

Model/export scripts/validation: `art/rover-showroom/`; production GLB+manifest: `client/public/assets/cartoon/rover-showroom/`. Original `.blend` is unchanged. Three MIT notices ship in H5 licenses and mini licenses. See verification/showroom-3d for actual browser results and measured size report.

Reference constraints: [Three migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide#162--r163) documents removal of WebGL1 inr163; [Phaser3.90 Extern](https://docs.phaser.io/api-documentation/3.90.0/class/gameobjects-extern) documents third-party rendering handoff. Package reports are local byte checks, not proof of Tencent upload acceptance or review approval.

## Verified cloud result (2026-11-01)

Client: 215 tests passed and production build passed. Mini: 72 tests passed, TypeScript check and package build passed. Asset validation and real GLTFLoader parse passed. Independent final review found no unresolved P1/P2. Chromium replay passed at 1200×900, 390×844 and 844×390; shared WebGL1 preview/context recovery/gameplay return and default Canvas DPR1/2/3 passed. The visible mini toggle uses the actual panel and helper with a mocked platform modal response, not a native WeChat modal test.

Measured mini main package: 1,937,714 bytes; all packages: 11,836,279 bytes. Increase over the same-toolchain baseline: 1,632,020 bytes (1.56 MiB), including the 1,053,736-byte GLB. See `verification/showroom-3d/summary.json` and `budget.json`, plus three actual runtime screenshots. Real phone performance, WeChat DevTools, Tencent upload/review and live multiplayer backend remain untested.
