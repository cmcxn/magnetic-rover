# Collision redesign runtime verification — 2026-10-24

## Passed

- `../pluto-aoi-integration/vendor/skynet/3rd/lua/lua tests/collision_scenarios.lua verification/collision-redesign/scenarios.json`
  - Exact production `server/game.lua` and collision/battery modules, seeded only in this test process.
  - Four deterministic cases: ordinary collision, one frontal boost, two frontal boosts, three cars beside the wall.
  - All recorded frames enforce circle radius 60, center radius ≤ 440 and pair separation ≥ 120.
  - Ordinary contact: both stunned; carried 12 + 12 unchanged; no drops.
  - Frontal boost: attacker not stunned; target cargo 20 → 15; exactly five ground batteries.
  - Double boost: both stunned, cargo 20 → 15 each; exactly ten ground batteries.
  - Minimum recorded separation gaps (world units): normal 3.50, boost 4.75, double-boost 22.17, wall-three 1.52.
- `ROVER_BIND=127.0.0.1 server/run.sh` with `python tests/collision_redesign_runtime.py`
  - **25 checks passed** against real Skynet and independent WebSocket clients.
  - Only normal join, room, ready and input messages; no teleport/debug API, no score edits, no clock overrides.
  - Target cargo was genuinely collected from the live random supply before boost tests.
  - Ordinary collision stuns both and produces no dropped batteries.
  - One boost: target loses 2, exactly 2 drops; attacker remains unstunned.
  - Double boost: both lose 2, exactly 4 drops; both stun.
  - Stunned input and forged cargo/score/stun/radius values rejected; sampled circles stay solid and inside walls; one hit event during the sampled recoil sequence.
  - `runtime.json` records inputs' resulting authoritative snapshots, not guest tokens. `"token"` is absent.
  - This is live protocol/core proof, not browser/mobile UI proof. Sustained contact beyond protection expiry is covered by the separate server core suite, not this short runtime sequence.

- Final whole-match regression: `python tests/multi_room.py --report verification/collision-redesign/full-match-multi-room.json` passed **32/32** checks. Real match99.96 s, result phase10.014 s; room isolation, spectator equality, reconnect, fresh readiness, freeze and next round passed. This is protocol validation, not browser validation.

## Browser screenshots: blocked, not passed

Browser sandbox startup and access to the local HTTP preview were blocked
before a game page opened. No gameplay screenshots or visual pixel inspection
were completed. Automated game-logic and WebSocket results above do not prove
browser rendering, mobile touch feel or device FPS.

No security settings were changed and no substitute image is presented as a
gameplay screenshot. To finish visual acceptance, run the included screenshot
script in a browser environment that permits the local game preview.

## Reproduction artifacts

- `tests/collision_scenarios.lua`: deterministic real-game snapshot producer and assertions.
- `tests/collision_redesign_runtime.py`: real input-only Skynet integration driver.
- `client/tests/collision-redesign.browser.mjs`: Playwright screenshot/replay harness for a permitted browser environment.
- `tests/build_collision_review.py`: generates a local-only packaged review page, embedding current built client and assets without adding a physics engine.
- `verification/collision-redesign/scenarios.json`: exact production-core scenario frames.
- `verification/collision-redesign/runtime.json`: latest passed live WebSocket report.
- Review pages can be generated locally with the script above; generated bundles are not included in this source delivery.

Screenshots from a snapshot replay must be labeled as production-simulation replay, not live-network screenshots. Keep the live network results alongside them.
