#!/bin/sh
set -eu
cd "$(dirname "$0")"
LUA="${SKYNET_ROOT:?Set SKYNET_ROOT}/3rd/lua/lua"
env -u ROVER_BASE_SPEED "$LUA" test_base_speed.lua 480
for value in 1 180 240 480 180.5; do
 ROVER_BASE_SPEED="$value" "$LUA" test_base_speed.lua "$value"
done
for value in '' invalid NaN nan inf Infinity 1e999 -1 0 0.5 481; do
 ROVER_BASE_SPEED="$value" "$LUA" test_base_speed.lua 480
done
