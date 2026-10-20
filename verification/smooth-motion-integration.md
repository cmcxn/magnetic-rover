# Smooth motion integration acceptance

Date: 2026-10-20 UTC. Independent real Skynet and Python WebSocket clients; no simulation clock shortening, debug endpoints, client-authoritative positions, or production deployment.

## Results

- `server/test.sh`: all Lua regressions and existing real WebSocket checks passed. Its deterministic motion protocol test proves input receipt and zero-physics-dt steps cannot advance the simulated acknowledgement.
- `python tests/smooth_motion_ws.py --full-match`: focused sequence validation, stale/duplicate rejection, legacy inputs, forged position/score/clock fields, reconnect sequence reset, and room isolation passed.
- The harness calls the existing `tests/multi_room.py` `run()` unchanged, with additional validation of every state. All existing checks passed. Observed full-round duration was 99.857 seconds and results settling lasted 10.112 seconds. Measurements begin at observed snapshots; they include snapshot arrival quantization.
- 6,216 state observations passed finite protocol-field checks and monotonic room-clock validation; round generation remained continuous through lobby, play, results, and the next round (0 → 1 → 2).
- `python tests/smooth_motion_ws.py --load-only --report verification/smooth-motion-eight-active.json`: eight active clients sent 400 intents each at 20 Hz for 20.102 seconds. Every client's final sequence was acknowledged, no disconnects or protocol/reader errors occurred, and final positions were bounded by the authoritative arena.
- 1,600 local WebSocket snapshot intervals: median 103.997 ms; p95 112.067 ms; maximum 155.309 ms. Both independent server logs had no error, traceback, failed, or exception entries.

## Scope and limits

This validates authoritative movement protocol and multiplayer regressions. Snapshot arrival timing is not render FPS, browser/mobile performance, Internet-latency characterization, or a production capacity guarantee. No Mac/browser/device acceptance was performed. The validation run itself performed no commits, pushes, or deployments. The first focused attempt exposed an overly strict test expectation: stale-input expiry legitimately zeroes direction while malformed input remains rejected. That assertion was corrected before the successful complete run.

Reports: `smooth-motion-integration.json` (combined), `smooth-motion-multi-room.json` (existing multi-room results), and `smooth-motion-eight-active.json` (eight-active-client measurement). No tokens are recorded.
