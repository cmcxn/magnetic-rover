#!/bin/sh
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SKYNET_ROOT="${SKYNET_ROOT:-$HERE/../../pluto-aoi-integration/vendor/skynet/}"
cd "$HERE"
"$SKYNET_ROOT/3rd/lua/lua" test_game.lua
"$SKYNET_ROOT/3rd/lua/lua" test_clock.lua
if python -c "import socket; s=socket.socket(); s.settimeout(.2); exit(0 if s.connect_ex(('127.0.0.1',18080))==0 else 1)"; then
 echo 'Port 18080 already in use; stop the demo before isolated integration tests.' >&2
 exit 1
fi
./run.sh > test-server.log 2>&1 & PID=$!
trap 'kill "$PID" 2>/dev/null || true' EXIT INT TERM
sleep 1
python test_ws.py
