# Executed commands / reproduction

Working directory: /Users/chenmin/Documents/magnetic-rover, branch codex/network-sync.
No production deployment. Original service on 18080 untouched by this task.
Docker local images provide Node 24.18.1 dependencies and the pinned Skynet Lua.
Host python3 lacks websockets; WS acceptance uses Node native WebSocket.

## Baseline
- git status --short; git branch --show-current; git rev-parse HEAD
- git diff --stat f7cd31c6486b82effca2d6a67f0f10cf42730311 HEAD; git diff --cached --stat
- rg --files -g AGENTS.md -g CLAUDE.md -g GEMINI.md . (and parent rules checked)
- unzip -q -n /Users/chenmin/Downloads/magnetic_rover_codex_handoff_20261030.zip -d /tmp/rover-network-handoff
- Read all five requested documents.
- docker build -t magnetic-rover:build-fix-validation . => Docker Hub metadata DeadlineExceeded.
- Reproduced Docker test_tuning double execution; fixed and independently ran the exact RUN command.

## Tests / typechecks / build
From repo root:
```sh
docker run --rm -v "$PWD:/workspace" -w /workspace --entrypoint sh magnetic-rover:frontend-validation -c '
 node --test client/tests/*.test.mjs minigame/tests/*.test.mjs &&
 /build/client/node_modules/.bin/tsc --noEmit -p client/tsconfig.json &&
 /build/client/node_modules/.bin/tsc --noEmit -p minigame/tsconfig.json &&
 cd client && /build/client/node_modules/.bin/vite build'
./scripts/build-wechat.sh

docker run --rm -v "$PWD/server:/tests" -w /tests --entrypoint sh magnetic-rover:skynet-runtime-f1baee5 -c '
 sh test_base_speed.sh && sh test_tuning.sh && sh test_arena_supply.sh &&
 for test in test_*.lua; do
  if [ "$test" != test_base_speed.lua ] && [ "$test" != test_tuning.lua ]; then
   ROVER_MAP_SCALE=1 ROVER_SUPPLY_SPEED=1 ROVER_BASE_SPEED=240 ROVER_VEHICLE_SCALE=1 ROVER_BOOST_MULTIPLIER=3 ROVER_BOOST_COOLDOWN=4 ROVER_BOOST_DURATION=.32 /skynet/3rd/lua/lua "$test" || exit 1
  fi
 done'
```

## Independent raw-state oracle + product byte budget
```sh
docker run --rm -v "$PWD:/workspace" -w /workspace --entrypoint /skynet/3rd/lua/lua magnetic-rover:skynet-runtime-f1baee5 tests/network_fixture.lua 20261030 normal fine > /tmp/trace.jsonl
docker run --rm -v "$PWD:/workspace" -v /tmp:/hosttmp -w /workspace --entrypoint node magnetic-rover:frontend-validation tests/network_replay.mjs /hosttmp/trace.jsonl verification/network-sync/replay-20261030.json
```
Repeat seeds 20261031 and 20261101. For comparisons use conservative; for stress
use dense. JSONL contains original snapshot, original Lua JSON byte count, actual
product message / byte count, both 20Hz controls and time. Tests project raw State
with an independently listed field table, freeze old published objects, compare
all restored fields/events, then replay the existing Motion class under identical
control times and message arrival/sample times. Dense early stress report retained
full raw snapshots but not odd-tick control history: its prediction figures cover
snapshot/extrapolation only, not 20Hz input replay. Three normal runs cover all
2000 controls each.

During final tuning original captured raw trajectories were re-encoded with the
current product Encoder and original Lua json.encode, avoiding costly repeated
physics simulation; the commands above regenerate them directly from scratch.
Historical handoff budget.lua was not used as product acceptance.

## Isolated real transport
Local derivative runtime image (no registry request), mounted current server and
client/dist in isolated containers on 18083, 18086 and 18089. Node client:
```sh
docker run --rm --network host -v "$PWD:/workspace" -w /workspace --entrypoint node magnetic-rover:frontend-validation tests/sync_protocol_ws.mjs --uri ws://127.0.0.1:18089/ws --report verification/network-sync/final-real-ws.json
```
--smoke runs compatibility/resync/reconnect without waiting a full round.
The script accepts loopback only, leaves rooms and closes all test connections.
Real slow receive test used python3 tests/slow_sync_socket.py (standard library,
SO_RCVBUF=1024, read pause 45 seconds) while room 000001 was active on 18083.

Browser smoke used installed Playwright + Microsoft Edge on 812×375; H5 ran a real
AI match on isolated Skynet; packaged mini JS ran through a wx bridge at 18088.
Scripts: python3 tests/network_wx_bridge.py and tests/network_browser.mjs. This is
browser evidence, not native WeChat or iPhone testing.
