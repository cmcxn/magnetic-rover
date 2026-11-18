-- Only the interactive fixture uses this service. All socket handling is main.lua.
local game=require 'game'
local start=game.start
function game:start()
 local ok,err=start(self)
 if ok then
  for _,p in ipairs(self.players) do p.lastPhysicsX=nil;p.lastPhysicsY=nil;p.bodyAngle=nil end
  local a,b=table.unpack(self.players)
  a.x=-240;a.y=48;b.x=0;b.y=0;a.angle=0;b.angle=0
 end
 return ok,err
end
if os.getenv('POC_LUA_COMPARE')=='1' then
 dofile(os.getenv('ROVER_SERVER')..'main.lua')
 return
end
local adapt=require 'adapter'
require('vehicle_collision').resolve=function(cars,dt,cb,stations)
 local paths=adapt(cars,dt,cb,stations,3)
 for _,p in ipairs(cars) do
  if p.collisionAt then
   print('H5 contact',p.id,p.x,p.y,p.angle,p.bodyAngle,p.omega)
  end
 end
 return paths
end
dofile(os.getenv('ROVER_SERVER')..'main.lua')
