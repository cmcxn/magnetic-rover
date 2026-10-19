# Skynet + Pluto AOI runtime verification

Verified 2026-10-18 on Linux x86_64, GCC/G++ 14.2.0.

## Source identity

- Parent checkout: `pluto-aoi-integration`
- Branch: `feat/pluto-aoi-submodule`
- Parent commit: `3e1b6135fab7992b58806c64dd1c1d444b2d18bc`
- Skynet: `64391f732e76507ea6615f312cb71be1fd7bfbdd`
- Pluto: `0fdadf37ed121cb3e8c86d8cfa08ec00f0f84738`
- lua-cjson: `ed0db2e29d94eaeb4267430c04abf8a930d8573e`
- Bundled Lua: 5.5.1
- Parent and submodule tracked working trees remained clean. No business source modified.

## Executed checks

1. Existing checkout Skynet make succeeded (incremental, no rebuild required).
2. Forced native AOI recompilation: `make -B -C components/skynet-aoi` passed.
3. `./scripts/test-aoi.sh native` passed 23 standalone Lua checks and the same 23 checks in a real Skynet service. Each suite includes a deterministic 500-operation differential visibility/query test.
4. Copied Skynet to `/tmp/skynet-rover-verification/skynet`, ran `make clean`, rebuilt all Skynet services/native libraries, then separately cleaned bundled Lua and rebuilt Lua plus the executable. Command: `make linux -j4 MALLOC_STATICLIB= SKYNET_DEFINES=-DNOUSE_JEMALLOC TLS_MODULE=ltls TLS_LIB=/usr/lib/x86_64-linux-gnu TLS_INC=/usr/include`. Both builds exited 0. This uses Skynet's supported system allocator, not jemalloc.
5. Re-ran all 23 AOI tests in the newly compiled Skynet runtime: passed.
6. Started upstream `examples/simplewebsocket.lua` with an isolated config. A Python websockets client successfully performed a real handshake on localhost:9948, exact ASCII/Chinese/65,536-character text round trips, ping/pong, and orderly client close. Test server was terminated afterward.
7. Built the repository's noninteractive client module in the isolated Skynet layout, started the original example server, and ran `tests/demo-client.lua`. All 3 checks passed: handshake, set/get, official demo round trip. Server was terminated afterward.
8. Final `git diff --check` passed; tracked worktrees remain clean.

Raw temporary logs: `/tmp/skynet-rover-verification/{build,lua-build,aoi,websocket,demo}.log`.

## Limits

Docker and CodeGraph are not installed. Docker packaging, Windows/MinGW/Wine, macOS, external HTTPS and real model API calls were not tested here. No claim about those platforms follows from the Linux results.

## Independent game component recommendation

Keep the game in `magnetic-rover/server`, separate from the existing AOI branch. Point its config at this pinned Skynet's service/loader/native libraries; add AOI wrapper and native module paths and lua-cjson native module path. Use `require "http.websocket"` directly for game WebSocket connections and `require "skynet_aoi"` for the protected AOI API.

Keep one authoritative room/map simulation and AOI space in a single Skynet Lua service. AOI spaces cannot be shared across services. Position values must be integers within the configured map. Width/height are full view sizes, not radii. Read AOI event triples after each mutation because the next mutation replaces them. Movement LEAVE events require explicit `enable_leave_event(true)`. The layer argument does not isolate rooms; separate rooms require separate spaces. Retain server-authoritative simulation and transmit bounded snapshots/deltas; the upstream WebSocket implementation caps a frame at 256 KiB.
