local c=require 'game_config'
local S={}
function S.place(players,stations)
 local placed={}
 local function available(x,y)
  if x*x+y*y>(c.arenaRadius-c.collisionRadius-2)^2 then return false end
  for _,s in ipairs(stations) do if (x-s.x)^2+(y-s.y)^2<((s.bodyRadius or s.r)+c.collisionRadius+12)^2 then return false end end
  for _,q in ipairs(placed) do if (x-q.x)^2+(y-q.y)^2<(2*c.collisionRadius+8)^2 then return false end end
  return true
 end
 for restart=1,64 do
 placed={}
 local complete=true
 for _,p in ipairs(players) do if p.connected then
  local found=false
  for attempt=1,2000 do
   local s=stations[math.random(#stations)]
   local inward=math.atan(-s.y,-s.x)
   local a=inward+(math.random()-.5)*2.8
   local d=(s.bodyRadius or s.r)+c.collisionRadius+28+math.random()*115
   local x,y=s.x+math.cos(a)*d,s.y+math.sin(a)*d
   if (s.y>=0 or y-s.y<=130) and available(x,y) then
    p.x=x;p.y=y;p.angle=math.atan(s.y-y,s.x-x);p.kx=0;p.ky=0
    placed[#placed+1]=p;found=true;break
   end
  end
  if not found then complete=false;break end
 end end
 if complete then return end
 end
 error('no safe station-adjacent spawn')
end
return S
