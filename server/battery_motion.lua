-- Dropped units remain individual authoritative batteries, never visual-only loot.
local config=require 'game_config'
local B={}
local radius=10
local function allowed(g,b)
 if b.x*b.x+b.y*b.y>(config.arenaRadius-radius)^2+1e-6 then return false end
 for _,s in ipairs(g.stations) do if (b.x-s.x)^2+(b.y-s.y)^2<(s.r+radius)^2 then return false end end
 for _,p in ipairs(g.players) do if not p.removed and (b.x-p.x)^2+(b.y-p.y)^2<(config.collisionRadius+radius)^2-1e-5 then return false end end
 return true
end
function B.place(g,b)
 for _=1,40 do
  local d=math.sqrt(b.x*b.x+b.y*b.y)
  if d>config.arenaRadius-radius then b.x=b.x*(config.arenaRadius-radius)/d;b.y=b.y*(config.arenaRadius-radius)/d end
  local function exclude(p,r)
   local x,y=b.x-p.x,b.y-p.y;local d=math.sqrt(x*x+y*y)
   if d<r then if d<1e-8 then x=1;y=0;d=1 end;b.x=p.x+x/d*(r+1e-5);b.y=p.y+y/d*(r+1e-5) end
  end
  for _,s in ipairs(g.stations) do exclude(s,s.r+radius) end
  for _,p in ipairs(g.players) do if not p.removed then exclude(p,config.collisionRadius+radius) end end
  if allowed(g,b) then return end
 end
 -- A dense wall pile still cannot delete cargo: find the nearest valid slot.
 local ox,oy=b.x,b.y
 for ring=1,100 do for i=1,32 do
  local a=i*math.pi/16;b.x=ox+math.cos(a)*ring*10;b.y=oy+math.sin(a)*ring*10
  if allowed(g,b) then return end
 end end
 error('no free battery location in arena')
end
function B.advance(g,dt)
 for _,b in ipairs(g.batteries) do if b.source=='drop' then
  local remaining=dt
  while remaining>1e-8 do
   local step=math.min(.025,remaining);remaining=remaining-step
   local oldx,oldy=b.x,b.y;local decay=math.exp(-4*step)
   b.x=b.x+(b.vx or 0)*(1-decay)/4;b.y=b.y+(b.vy or 0)*(1-decay)/4
   b.vx=(b.vx or 0)*decay;b.vy=(b.vy or 0)*decay
   b.z=(b.z or 0)+(b.vz or 0)*step-300*step*step;b.vz=(b.vz or 0)-600*step
   if b.z<0 then b.z=0;if b.vz < -50 and not b.bounced then b.vz=-b.vz*.22;b.bounced=true else b.vz=0 end end
   B.place(g,b)
   if math.abs(b.x-oldx)>30 or math.abs(b.y-oldy)>30 then b.vx=b.vx*.3;b.vy=b.vy*.3 end
  end
 end end
end
return B
