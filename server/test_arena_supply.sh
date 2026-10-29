#!/bin/sh
set -eu
cd "$(dirname "$0")"
LUA="${SKYNET_ROOT:?Set SKYNET_ROOT}/3rd/lua/lua"
env -u ROVER_MAP_SCALE -u ROVER_SUPPLY_SPEED "$LUA" test_arena_supply.lua 2 2
ROVER_MAP_SCALE=1 ROVER_SUPPLY_SPEED=1 "$LUA" test_arena_supply.lua 1 1
ROVER_MAP_SCALE=1.5 ROVER_SUPPLY_SPEED=4 "$LUA" test_arena_supply.lua 1.5 4
ROVER_MAP_SCALE=4 ROVER_SUPPLY_SPEED=.25 "$LUA" test_arena_supply.lua 4 .25
for value in '' invalid NaN inf 1e999 -1 0; do
 ROVER_MAP_SCALE="$value" ROVER_SUPPLY_SPEED="$value" "$LUA" test_arena_supply.lua 2 2
done
ROVER_MAP_SCALE=.5 ROVER_SUPPLY_SPEED=11 "$LUA" test_arena_supply.lua 2 2
