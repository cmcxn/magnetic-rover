local native=require 'native'
local cfg=require 'game_config'
local worlds=setmetatable({},{__mode='k'})
return function(cars,dt,callback,stations,n)
 local room=worlds[stations]
 if room and (#cars~=#room.players or cars[1]~=room.players[1] or not cars[1].lastPhysicsX) then
  native.close(room.world)
  worlds[stations]=nil
  room=nil
 end
 if #cars==0 then return {} end
 if not room then
  room={players={table.unpack(cars)},world=native.new(cars,stations,cfg.arenaRadius,cfg.collisionRadius)}
  worlds[stations]=room
 end
 local w=room.world
 for _,p in ipairs(cars) do
  p.steerOmega=nil
  if p.bodyAngle and (p.ix~=0 or p.iy~=0) then
   local delta=p.angle-p.bodyAngle
   local error=math.atan(math.sin(delta),math.cos(delta))
   p.steerOmega=p.omega+math.max(-12*dt,math.min(12*dt,4*error-p.omega))
  elseif p.lastPhysicsX and p.vx==0 and p.vy==0 then
   local drag=math.exp(-8*dt)
   p.vx=p.lastPhysicsX*drag;p.vy=p.lastPhysicsY*drag
  end
 end
 local contacts,state=native.step(w,cars,dt,n)
 local events,paths={},{}
 for _,e in ipairs(contacts) do
  local i,j,nx,ny,time,avx,avy,bvx,bvy=table.unpack(e)
  if i==0 or (j~=0 and i>j) then
   i,j,nx,ny=j,i,-nx,-ny
   avx,avy,bvx,bvy=bvx,bvy,avx,avy
  end
  local a,b=cars[i],cars[j]
  events[#events+1]={a=a,b=b,nx=nx,ny=ny,time=time,avx=avx,avy=avy,bvx=bvx,bvy=bvy}
 end
 for i,p in ipairs(cars) do
  local s=state[i]
  local previous={x=p.x,y=p.y}
  local segments={}
  for j=1,n do
   local k=j==n and 1 or 5+j*2
   local point={x=s[k],y=s[k+1]}
   segments[j]={a=previous,b=point,t0=(j-1)/n,t1=j/n}
   previous=point
  end
  paths[p]=segments
  p.x,p.y,p.vx,p.vy,p.bodyAngle,p.omega=table.unpack(s)
  p.lastPhysicsX,p.lastPhysicsY=p.vx,p.vy
 end
 callback(events)
 return paths
end
