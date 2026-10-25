# Hard-circle collision implementation plan


**Goal:** Make the visible car circles solid and implement the approved directional collision and battery-drop rules.

**Architecture:** Retain Lua/Skynet authority. Continuous circle time-of-impact resolution with persistent impulse velocity, contact episodes and finite constraint projection; client predicts presentation but cannot award hits or drops. Battery motion is server-owned and exposed as render metadata.

**Tech Stack:** Lua, Skynet, Phaser 3, TypeScript, Node test runner, existing Playwright/Chromium.

**Spec:** `docs/superpowers/specs/2026-10-24-hard-circle-collision.md`

## Global constraints
- Base is verified `origin/fix/mobile-collision-supply` @ `58100e77eb30bebb47994a9fb307a8ee4f0850a7`; new branch `feat/hard-circle-collision-redesign` in a separate checkout.
- No new engine/dependencies, production deployment, push or merge. Preserve previous checkout.
- Never expose test controls on production WebSocket protocol. Screenshot harness may drive the real game core on loopback only.
- Safe-zone policy confirmed: no drops, ordinary both stun/recoil, solidity unconditional.

## Review focus
- Fast opposing motion and long steps never swap sides or penetrate.
- Initial overlap, wall piles, three or eight participants resolve deterministically.
- Expired shields during sustained contact never cause repeated losses.
- Boost cone/closing-direction and simultaneous hits are independent of player array order.
- Client prediction, stale snapshots and correction never visibly overlap circles; dropped cargo remains conserved at walls/stations.

### Task 1: Authoritative collision and drops
**Files:** `server/vehicle_collision.lua`, `server/game.lua`, `server/game_config.lua`, server collision/boost/fast-movement tests, new `server/test_collision_redesign.lua`.
**Interfaces:** `C.sweep(a,finishA,angleA,b,finishB,angleB,padding)` returns circle enter/leave fractions; `C.resolve(players,dt,onContacts)` advances solid circles using per-tick velocity, returns actual traveled paths. `G:drop(p,n,nx,ny)` conserves actual carried value. Snapshot adds `collisionRadius`, `kx`,`ky`,`impactSeq`, battery `z`,`vx`,`vy`,`source`,`unlock`.
- [x] Write and observe failing tests for hard-circle tangent/sweep, normal both stun/no loss, frontal boost, double boost, grazing/separating movement, protected solidity, contact hysteresis, 3+ cars/walls, battery conservation and settled exclusion.
- [x] Implement minimal continuous solver and gameplay outcomes with server-owned knockback decay, safe spawn/drop positioning and bounded scatter.
- [x] Run all Lua tests, update superseded ordinary-loss/rectangle expectations without weakening unrelated protocol tests.
- [x] Commit authoritative rules after passing tests.

### Task 2: Client boundary/prediction/drop presentation
**Files:** `client/src/types.ts`, `client/src/motion.ts`, `client/src/world.ts`, focused client tests.
**Interfaces:** Consume Task 1 metadata; keep old-server optional-field fallbacks. Display circle radius60, fit body/cargo, show airborne battery height, clamp displayed circles and local prediction against peers and walls; collision authority is unchanged.
- [x] Add failing behavioral tests for circle render radius, contained cargo, hop height and local/display no-overlap under opposing/interpolated movement.
- [x] Implement and run `cd client && npm test && npm run build`.
- [x] Commit client change after passing tests.

### Task 3: Runtime verification, screenshots and review
**Files:** `tests/collision_redesign_runtime.py`, `client/tests/collision-redesign.browser.mjs`, verification report and screenshots.
- [x] Run full server/client suites and multi-client real Skynet checks.
- [x] Produce real production Lua before/contact/after snapshots and browser replay harness. Actual browser rendering/capture is BLOCKED; do not claim visual verification.
- [ ] Capture desktop and mobile and inspect pixels — BLOCKED before page navigation by browser/sandbox policies; zero screenshots. Failure reported explicitly.
- [x] Independent review checks full branch against approved spec; add regression tests for material findings and rerun affected/full suites.
- [x] Verify final git diff/status/commit and deliver local branch, screenshots and exact test results without deployment.
