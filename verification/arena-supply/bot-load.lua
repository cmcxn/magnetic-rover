-- Run manually in the pinned runtime with ROVER_MAP_SCALE=4; not a CI timing gate.
package.path='./?.lua;'..package.path
local G=require 'game';local B=require 'bot';local config=require 'game_config';local rooms={}
for i=1,32 do
 local g=G.new();local p=g:join({},'AI','#fb923c');g:join(1,'Human','#38bdf8');g:start();g:replenish(config.resources.groundCap);p.bot=B.new();rooms[i]={g,p}
end
local start=os.clock();for _,v in ipairs(rooms) do B.input(v[2].bot,v[1],v[2],0) end
local elapsed=os.clock()-start
print('32 rooms, '..config.resources.groundCap..' natural batteries/room, initial AI decision CPU: '..elapsed..' seconds')
assert(elapsed<.25,'AI batch exceeds 250ms verification budget on this machine')
