# Client/server integration review

Reviewed 2026-10-18 UTC. Scope: `client/src` against `server/main.lua` and `server/game.lua`. The review did not modify business source; implementation fixes were made by the client author. No push was performed.

## Verified fixes

- Reconnection tokens are scoped to canonical WebSocket URLs. The obsolete unscoped `rover.token` is not read or sent. Switching to a previously unused server sends no token.
- Connection attempts reset joined/connected/input state. Stale socket open/error callbacks cannot affect a replacement socket; join is sent through the captured socket.
- Join rejection survives socket close and appears on the reconnect screen. Errors do not cause automatic retry loops or silently erase identity tokens. Unknown tokens follow server behavior: a lobby may create a new guest, whereas a running match rejects the join. An already-connected guest must close the other session.
- WebSocket addresses reject embedded credentials, fragments and HTTPS-to-insecure-WebSocket mixed content; synchronous construction errors are handled.
- Live and final rankings use shared competition ranks for ties.
- Phase changes reset mouse-driving mode and input state. The HUD, leaderboard and minimap block pointer events from reaching the arena. Hidden-page and pointer cancellation input cleanup is present.
- HUD control binding occurs only when the phase changes, rather than on each snapshot.
- Player `x`, `y`, `angle` (radians), `cargo`, `score`, `cooldown`, connected state, stations and phase fields agree with the authoritative snapshot. The rendered car points along +X and matches server `atan(y,x)` movement orientation.
- Mobile following-camera and medium-width/short-landscape CSS adjustments are present. These are static findings, not confirmation of rendered appearance or usability.

## Reproducible checks

From `client/`:

```sh
node --test tests/*.test.mjs
npx tsc --noEmit
```

Result: **12/12 tests passed; TypeScript check passed.** The wildcard command is intentional: the package's current `npm test` command selects only `tests/client.test.mjs` and does not include the new connection-flow file.

`tests/connection-flow.test.mjs` parses the real `main.ts`, removes imports using the TypeScript AST, transpiles it, and executes its real connection handlers in an isolated Node VM. This remains compatible with multiline/Prettier-formatted imports. Browser APIs, DOM, sockets and audio are mocked. Four tests exercise:

1. Token isolation for two known servers and omission of the legacy token for a third server.
2. Stale socket open/error callbacks after replacement.
3. Join-error retention, retry UI, retained identity and absence of automatic retries.
4. Invalid-address rejection followed by a valid retry.

The original eight pure-function tests cover movement normalization, HTML escaping, colors, canonical token keys, unsafe addresses and shared ranking.

From `server/`:

```sh
../../pluto-aoi-integration/vendor/skynet/3rd/lua/lua test_game.lua
```

Result: all printed game, limits, mechanics and regression groups passed, including simulated 180-second match, reconnect, token privacy, scoring, collision order and station safety.

## Limits and remaining acceptance work

This review did not launch a browser, produce screenshots, test real pointer hitboxes/audio playback, or validate mobile visual layout. The VM tests do not substitute for browser playtesting, real WebSocket timing or a real multiplayer match. Live 18080-port acceptance is handled separately; this review did not connect to or mutate that server.
