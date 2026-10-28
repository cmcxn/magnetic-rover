# Cartoon clients implementation plan

> **For agentic workers:** use superpowers:executing-plans inline.

**Goal:** Implement the six references across H5 and WeChat with 100-second gameplay and floating joystick/circular cooldown boost.
**Architecture:** Existing shared Phaser World plus shared pure presentation helpers; DOM H5 and Phaser WeChat platform shells. Server remains authoritative.
**Tech Stack:** Phaser 3, TypeScript, Vite, esbuild, WeChat native touch.
**Spec:** docs/superpowers/specs/2026-10-28-cartoon-clients-design.md

## Global Constraints
100 seconds; both clients; shared assets; no backend rule changes; keep WeChat main package below 4 MB; do not deploy remotely.

## Review Focus
- Multi-touch ownership, boost finger release must not stop driving.
- Stale snapshots must not visually unlock cooldown early.
- Eight player cards and long names fit short landscape screens.
- Canvas 2D supports every generated texture and graphic operation.
- Disconnection/background/resize cannot leave movement stuck.

### Task 1: Shared presentation and input geometry
- [x] Add failing behavior tests for default joystick origin, relocated active origin, safe-area layout and server-gated cooldown.
- [x] Implement client/src/presentation.ts; consume in both clients.
- [x] Run new and existing joystick tests.

### Task 2: Shared world and H5 theme
- [x] Add isolated environment asset with original assets preserved.
- [x] Upgrade cached environment, colored rover presentation, bounded pickup/hit/boost feedback in world.ts.
- [x] Unify login/results and existing room UI; circular skill and idle floating joystick.
- [x] Build H5, run regressions and inspect browser at desktop and mobile landscape.

### Task 3: WeChat UI parity
- [x] Extract themed Phaser panel into minigame/src/panel.ts with platform callbacks.
- [x] Support nickname/color, room list/code/paging/spectate, ready/results, HUD/ranking/minimap, circular boost and joystick.
- [x] Integrate fresh snapshot cooldown and multi-touch lifecycle.
- [x] Build ES2017 package, run clock and frontend suites, inspect WeChat simulator.

### Task 4: Review and evidence
- [x] Verify local two-client round and 100-second server timer; capture screenshots.
- [x] Record commands/results and remaining real-device boundary below.

## Evidence and boundaries
- Source review and checks: 139 Node tests (129 frontend + 10 minigame), both strict TypeScript projects, H5 production build and ES2017 minigame package all pass.
- Main 1284 KiB; art 2413 KiB; total 3697 KiB, beneath the previous preview limit.
- H5 844×390 and minigame same-bundle browser bridge 1280×720: actual WSS connection, independent colors, room 000010, ready -> 01:40 match, collected cargo, server-confirmed 3.8-second boost cooldown, automatic return to waiting room observed. Browser consoles clean.
- Native WeChat IDE 2.02.2609240: updated Canvas2D package renders; native automated clicks did not reach wx touch listeners (lastTouch stayed null). This is not recorded as a native touch pass. Device multitouch feel and phone performance remain for physical-device preview.
- Docker Hub metadata fetch timed out; local frontend-validation and existing Skynet image were used for an offline local frontend image update. Server source, protocol, rules and remote deployment unchanged.
- New art generated with built-in image_gen. Full sources preserved under assets/generated/cartoon; runtime assets under client/public/assets/cartoon. Static background is one image; twelve concurrent pickup trails maximum; color textures cached once, supported on Canvas2D.

- Independent source review (review_cartoon_clients): no actionable important issues; native touch delivery not certified by static review.
- CLI preview not generated: IDE service port is disabled. No security settings were changed; preview remains available through the IDE UI.

- Final local runtime verified at http://127.0.0.1:18080 (latest cartoon CSS, reserved wheel clearance, island GET 200). Temporary Vite/bridge servers and remote test connections were cleaned up.
- Visual review follow-ups: translucent cargo deck retains car artwork; production sprites omit redundant debug-like roof badge/side charge bars; short-phone eight-player ranking uses two columns above the boost. Final 139 tests and minigame strict type check remain green.
