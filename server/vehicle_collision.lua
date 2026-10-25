-- Server-owned continuous circle constraints. Heading affects attacks, not shape.
local config=require 'game_config'
local C={}
local EPS=1e-7
local function normal(a,b)
 local x,y=b.x-a.x,b.y-a.y;local d=math.sqrt(x*x+y*y)
 if d<EPS then return 1,0,0 end
 return x/d,y/d,d
end
function C.sweep(a,finishA,angleA,b,finishB,angleB,padding)
 local r=2*config.collisionRadius+2*(padding or 0)
 local x,y=b.x-a.x,b.y-a.y
 local dx,dy=finishB.x-b.x-finishA.x+a.x,finishB.y-b.y-finishA.y+a.y
 local c=x*x+y*y-r*r;local aa=dx*dx+dy*dy
 if aa<EPS*EPS then if c<=EPS then return 0,1 end;return end
 local dot=x*dx+y*dy;local disc=dot*dot-aa*c
 if disc < -EPS then return end
 local root=math.sqrt(math.max(0,disc));local first,last=(-dot-root)/aa,(-dot+root)/aa
 if last < -EPS or first>1+EPS then return end
 return math.max(0,first),math.min(1,last)
end
function C.project(players)
 local bound=500-config.collisionRadius;local diameter=2*config.collisionRadius
 -- Stable ID order gives the same result regardless of room array order.
 for _=1,512 do
  local error=0
  for _,p in ipairs(players) do
   local d=math.sqrt(p.x*p.x+p.y*p.y)
   if d>bound then error=math.max(error,d-bound);p.x=p.x*bound/d;p.y=p.y*bound/d end
  end
  for i,a in ipairs(players) do for j=i+1,#players do
   local b=players[j];local nx,ny,d=normal(a,b);local overlap=diameter-d
   if overlap>EPS then
    error=math.max(error,overlap);local shift=(overlap+EPS)/2
    a.x=a.x-nx*shift;a.y=a.y-ny*shift;b.x=b.x+nx*shift;b.y=b.y+ny*shift
   end
  end end
  if error<EPS then return end
 end
end
function C.resolve(players,dt,onContacts)
 table.sort(players,function(a,b)return tonumber(a.id)<tonumber(b.id) end)
 C.project(players)
 local paths={};for _,p in ipairs(players) do paths[p]={} end
 local time=0
 local function advance(delta)
  if delta<=0 then return end
  for _,p in ipairs(players) do
   local a={x=p.x,y=p.y};p.x=p.x+p.vx*delta;p.y=p.y+p.vy*delta
   paths[p][#paths[p]+1]={a=a,b={x=p.x,y=p.y},t0=time/dt,t1=(time+delta)/dt}
  end
  time=time+delta
 end
 for _=1,96 do
  local remaining=dt-time;if remaining<EPS then break end
  local first=remaining+1;local events={}
  local function candidate(t,event)
   if t<first-EPS then first=t;events={event}
   elseif math.abs(t-first)<=EPS then events[#events+1]=event end
  end
  for i,a in ipairs(players) do
   for j=i+1,#players do
    local b=players[j];local nx,ny=normal(a,b)
    local t=C.sweep(a,{x=a.x+a.vx*remaining,y=a.y+a.vy*remaining},0,b,{x=b.x+b.vx*remaining,y=b.y+b.vy*remaining},0)
    if t then
     local ax,ay=a.x+a.vx*remaining*t,a.y+a.vy*remaining*t
     local bx,by=b.x+b.vx*remaining*t,b.y+b.vy*remaining*t
     local d=math.sqrt((bx-ax)^2+(by-ay)^2)
     if d>EPS then nx=(bx-ax)/d;ny=(by-ay)/d end
     if (a.vx-b.vx)*nx+(a.vy-b.vy)*ny>EPS then candidate(t*remaining,{a=a,b=b,nx=nx,ny=ny}) end
    end
   end
   local bound=500-config.collisionRadius
   local aa=a.vx*a.vx+a.vy*a.vy;local dot=a.x*a.vx+a.y*a.vy
   if aa>EPS then
    local disc=dot*dot-aa*(a.x*a.x+a.y*a.y-bound*bound)
    local t=(-dot+math.sqrt(math.max(0,disc)))/aa
    if t>=-EPS and t<=remaining and (t>EPS or dot>EPS) then candidate(math.max(0,t),{a=a,wall=true}) end
   end
  end
  if first>remaining then advance(remaining);break end
  advance(first)
  -- Freeze incoming velocities for simultaneous classification before any impulse.
  for _,e in ipairs(events) do
   e.time=time;e.avx=e.a.vx;e.avy=e.a.vy
   if e.b then e.bvx=e.b.vx;e.bvy=e.b.vy end
  end
  for _,e in ipairs(events) do
   local a,b=e.a,e.b
   if b then
    local closing=(e.avx-e.bvx)*e.nx+(e.avy-e.bvy)*e.ny
    local impulse=.7*closing
    a.vx=a.vx-e.nx*impulse;a.vy=a.vy-e.ny*impulse
    b.vx=b.vx+e.nx*impulse;b.vy=b.vy+e.ny*impulse
   else
    local d=math.sqrt(a.x*a.x+a.y*a.y);local nx,ny=a.x/d,a.y/d
    local outward=a.vx*nx+a.vy*ny
    if outward>0 then a.vx=a.vx-1.25*outward*nx;a.vy=a.vy-1.25*outward*ny end
   end
  end
  if onContacts then onContacts(events) end
 end
 -- In an overconstrained pile the unconsumed fraction stays still, never tunnels.
 C.project(players)
 for _,p in ipairs(players) do
  if #paths[p]==0 then paths[p][1]={a={x=p.x,y=p.y},b={x=p.x,y=p.y},t0=0,t1=1} end
 end
 return paths
end
return C
