# Floating joystick and pickup reward verification

## Implemented
- Touching the playable field anchors a neutral floating joystick exactly at the first touch. Release hides it; the next touch chooses a fresh origin. Decorative overflow is clipped at viewport edges, without moving the input origin. UI buttons are separate hit targets above the field.
- One movement pointer owns the joystick. A second finger can press boost without moving or resetting it. Pointer cancellation, lost capture, resize, blur, backgrounding, connection changes and phase transitions reset movement. Cancellation also discards queued boost; normal release preserves an intentional boost tap.
- Server `pickupSeq` increments only for successfully collected batteries. It survives same-round reconnection, resets for a new round, and cannot be supplied by input. Cargo cap remains 20.
- Client compares consecutive local-player sequences only in play. Initial/reconnect/missing/reset snapshots remain silent. Cargo changes, drops/deposits and other players never imply pickup rewards.
- Pickups aggregate into one `⚡ +N` label and six inward-moving warm sparks. Reduced effects keep a stationary label, without sparks or movement. Background/disconnect clear in-flight feedback.
- Existing pickup sample now plays at modest 0.25 gain with a 220 ms cap/fade and 240 ms start-to-start limit. A batch plays one sound. Sound-off remains respected.

## Checks
- `cd client && npm test`: 55 tests passed, including pointer ownership, second-finger boost, all cancellation paths, no ghost motion, queued-dash cancellation versus ordinary release, pickup authority/baselines, hidden/reconnect handling, aggregation, reduced motion, cargo rack, boost flame and stun regressions.
- `cd client && npm run build`: passed TypeScript and Vite. Existing large-bundle warning remains (~1.51 MB uncompressed); npm environment warning remains.
- `SKYNET_ROOT=/workspace/scratch/0811cde7f1f9/pluto-aoi-integration/vendor/skynet ./server/test.sh`: all eight Lua suites and real WebSocket integration passed. New real WebSocket checks drive to an actual battery, reject forged pickup credit, verify another player's sequence stays unchanged, and reconnect the collector with sequence/cargo retained.
- Tests were added first and observed failing for missing joystick/authority/reward behavior and queued-boost cancellation, then implemented to green.
- Logs: `verification/floating-pickup/`.

## Limits
No physical phone, rendered-browser screenshot, speaker audition or actual mobile touch-feel validation was performed. The existing browser IPC access blocker is documented separately; no access-control workaround was attempted. VM DOM/renderer tests are behavior tests, not browser/device visual verification. No deployment or local-computer operation was performed. Branch publication is a separate handoff step after review.
