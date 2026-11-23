#!/usr/bin/env bash
# Minimal real Skynet Service require + space step check; not a standalone Lua test.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT"
[[ -x .build/skynet/skynet && -f .build/lib/moonchipmunk.so ]] || ./build.sh
mkdir -p .build/smoke logs
cat >.build/smoke/test.lua <<'LUA'
local skynet = require 'skynet'
require 'skynet.manager'
skynet.start(function()
  local cp = require 'moonchipmunk'
  assert(_VERSION == 'Lua 5.5')
  local s = cp.space_new()
  s:set_gravity({0, 0})
  local b = s:add_body(cp.body_new(1, 1))
  local shape = s:add_shape(cp.box_shape_new(b, 2, 2, 0))
  b:set_velocity({2, 0})
  s:step(0.05)
  assert(b:get_position()[1] > 0.09)
  s:remove_shape(shape); shape:free()
  s:remove_body(b); b:free()
  s:free()
  print('SKYNET_NATIVE_REQUIRE_STEP_PASS', _VERSION, cp._VERSION, cp._CHIPMUNK_VERSION)
  skynet.abort()
end)
LUA
python3 - "$ROOT" <<'PY'
import sys,json
from pathlib import Path
root=Path(sys.argv[1]); skynet=root/'.build/skynet'
paths={
 'cpath':str(skynet/'cservice/?.so'),
 'lua_path':str(skynet/'lualib/?.lua')+';'+str(skynet/'lualib/?/init.lua'),
 'lua_cpath':str(root/'.build/lib/?.so')+';'+str(skynet/'luaclib/?.so'),
 'luaservice':str(root/'.build/smoke/?.lua')+';'+str(skynet/'service/?.lua'),
 'lualoader':str(skynet/'lualib/loader.lua'),
}
(root/'.build/smoke/config').write_text('thread=4\nharbor=0\nstart="test"\nbootstrap="snlua bootstrap"\n'+''.join(k+'='+json.dumps(v)+'\n' for k,v in paths.items()))
PY
# timeout/coreutils is standard on the supported Linux target.
timeout 30 .build/skynet/skynet .build/smoke/config >logs/native-skynet-smoke-pass.log 2>&1
cat logs/native-skynet-smoke-pass.log
grep -q '^SKYNET_NATIVE_REQUIRE_STEP_PASS' logs/native-skynet-smoke-pass.log
! grep -q 'init service failed' logs/native-skynet-smoke-pass.log
