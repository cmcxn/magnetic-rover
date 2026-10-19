# Magnetic Rover Skynet server

This is an independent, local-only prototype. It does not alter the existing integration repository. One real Skynet service owns all game state; WebSocket clients provide normalized movement intent only. No public deployment, persistence, account registration, payments, or password handling.

## Start

From the `magnetic-rover` directory:

```sh
./server/run.sh
```

Open `http://127.0.0.1:18080` after the frontend has built `client/dist`. The same listener serves static files and real WebSockets at `/ws`. It binds loopback only. Override `SKYNET_ROOT` (a trailing `/` is optional) or `ROVER_CLIENT` if relocating. `run.sh` finds the sibling `pluto-aoi-integration/vendor/skynet` by default. Skynet must already be built.

To play two guests on one machine, use separate browser profiles/private windows. Reusing a live guest token deliberately cannot evict the original connection.

## Tests

```sh
./server/test.sh
```

Requires the existing Skynet Lua binary and Python `websockets` (tested with 16.0). The script refuses to run if port 18080 is occupied, launches an isolated server, runs two real WebSocket clients, and stops its own server. `test_game.lua` drives the exact production game core with a deterministic simulated clock, including a full 180-second match. It does not expose debug, score-changing, teleport, or time-control messages over the network.

Verified 2026-10-18:
- Game-core tests pass: exactly-once pickup/deposit; malformed and oversized numeric inputs; NaN; normalized diagonal movement; circular world bound; stale input stop; collision drop amount; victim protection and drop lock; reconnect; ten-second removal; finish/restart.
- Limits pass: eight players; nickname Unicode validation/sanitization; allowlisted colors; no station-zone resource spawn; last-ten-seconds refill stop; shared score ties; no token disclosure; full match timer.
- Mechanics pass: twenty cargo maximum, loaded speed 80%, boost double speed, cooldown cannot be reset by repeated inputs.
- Two-client integration passes: Chinese nicknames, different random tokens, array encoding, two-player start requirement, live-token takeover rejection, authoritative movement, fabricated score/action rejection, shared state, reconnect retains guest identity.

## Implementation

- 20 Hz fixed-step simulation, 10 Hz snapshots, absolute monotonic wake targets and match deadline. Full-room broadcast for at most eight guests; AOI optimization is intentionally unnecessary at this demo scale.
- Six regions are replenished to 18 batteries every five seconds except the last ten seconds. The server validates station exclusion and arena bounds.
- Car motion, boost, collision drops, pickup, deposit, score, timer, results and rematch are exclusively server-owned. Station areas are safe zones. All collision losses resolve before the separate pickup/deposit phase, independent of player join order.
- Colors: `#38bdf8`, `#fb7185`, `#a78bfa`, `#facc15`, `#34d399`, `#fb923c`.
- Nicknames are trimmed, control/angle-bracket stripped, valid UTF-8, truncated to 16 Unicode code points. Clients must render as text, not HTML.
- Production guest tokens use 24 random bytes from Skynet crypt and never enter snapshots/logs. Pure-Lua tests use internal deterministic test identities.
- Pure Lua JSON codec copied from existing `skynet_llm/json.lua`, with explicit array encoding; no C JSON dependency required.
- Incoming text message cap 2 KiB; up to 60 processed messages per connection per second; unjoined WebSocket timeout ten seconds. Unknown actions and malformed inputs cannot mutate score or position.

## Explicit prototype boundaries

- Guests/tokens/scores live in process memory only and disappear when the server restarts. Tokens are bearer identities, not full accounts. Local HTTP/WS is unencrypted and must not be exposed publicly.
- Reconnect with the same token works during/after the ten-second grace period while that match still exists; live tokens cannot take over. A disconnected player's score is retained for results; after ten seconds their car is removed and cargo drops. A rematch removes disconnected guests and their old tokens.
- Disconnected lobby guests reserve their slots for ten seconds, then are removed and slots become available.
- No late new guests may enter a playing/finished room; reconnecting existing tokens may. Any joined guest may start once two are connected, or return a finished match to the lobby.
- Dropped batteries landing inside a station are omitted because station zones exclude pickups. Match duration uses a monotonic 180-second deadline, independent of fixed 50 ms physics. Catch-up is capped at five steps; long pauses age timeouts and cooldowns while discarding stale movement, and never simulate physics after the deadline. Snapshots can arrive late if the process is stalled. No production-grade DoS defense or horizontal scaling is claimed.

Clock regressions: test_clock.lua verifies execution-overhead drift, exact deadline boundaries, bounded catch-up, stale-input/cooldown expiry during long pauses, expired boost suppression, no post-deadline movement, rematch reset, and backwards timestamp clamping.
