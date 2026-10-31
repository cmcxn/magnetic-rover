local G={}; G.__index=G
local config=require 'game_config'
local vehicleCollision=require 'vehicle_collision'
local batteryMotion=require 'battery_motion'
local Bot=require 'bot'
local resources=config.resources
local palette={'#38bdf8','#fb7185','#a78bfa','#facc15','#34d399','#fb923c','#e879f9','#cbd5e1'}
local colors={['#38bdf8']=true,['#fb7185']=true,['#a78bfa']=true,['#facc15']=true,['#34d399']=true,['#fb923c']=true,['#e879f9']=true,['#cbd5e1']=true}
local function dist(a,b) return (a.x-b.x)^2+(a.y-b.y)^2 end
-- Entry/exit times along the frozen, clamped tick movement; nil means no contact.
local function circleInterval(a,b,p,r)
 local dx,dy=b.x-a.x,b.y-a.y;local x,y=a.x-p.x,a.y-p.y
 local length=dx*dx+dy*dy;local c=x*x+y*y-r*r
 if length==0 then if c<=0 then return 0,1 end;return end
 local dot=x*dx+y*dy;local disc=dot*dot-length*c
 if disc < -1e-9 then return end
 local root=math.sqrt(math.max(0,disc));local enter=(-dot-root)/length;local leave=(-dot+root)/length
 if leave<0 or enter>1 then return end
 return math.max(0,enter),math.min(1,leave)
end
local function pickupRadius(b) return b.source=='drop' and config.collisionRadius+config.droppedBatteryRadius+.001 or config.pickupRadius end
local function along(a,b,t) return {x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t} end
local function clamp(p) local d=math.sqrt(p.x*p.x+p.y*p.y);if d>config.arenaRadius then p.x=p.x*config.arenaRadius/d;p.y=p.y*config.arenaRadius/d end end
function G.new(tokenfn)
 return setmetatable({phase='lobby',remaining=config.matchDuration,time=0,roundId=0,players={},batteries={},contacts={},nextid=0,nextbat=0,stations={{x=-330*config.mapScale,y=-220*config.mapScale,r=65},{x=330*config.mapScale,y=-220*config.mapScale,r=65},{x=0,y=380*config.mapScale,r=65}},tokenfn=tokenfn},G)
end
function G:station(p) for _,s in ipairs(self.stations) do if dist(p,s)<=s.r^2 then return true end end return false end
function G:join(fd,name,color,token,deferNew)
 for _,p in ipairs(self.players) do
  if p.fd==fd then return nil,'Already joined' end
  if token and token==p.token then
   if p.connected then return nil,'Guest already connected; close the other tab first' end
   p.fd=fd;p.connected=true;p.removed=false;p.ix=0;p.iy=0;p.last=self.time;p.lastInputSeq=0;p.pendingSeq=0;p.inputSeq=0;p.inputElapsed=0;return p
  end
 end
 if type(name)~='string' or #name>256 then return nil,'Invalid nickname' end
 name=name:gsub('[%c<>]',''):match('^%s*(.-)%s*$');local ok,len=pcall(utf8.len,name)
 if not ok or not len or len<1 then return nil,'Nickname required' end
 if len>16 then name=name:sub(1,utf8.offset(name,17)-1) end
 if self.phase~='lobby' then return nil,'Match in progress; wait for the next lobby',self.phase end
 if #self.players>=8 then return nil,'Lobby full','full' end
 if deferNew then return nil,'Earlier guests are waiting','queued' end
 local used={};for _,q in ipairs(self.players) do if not q.removed then used[q.color]=true end end
 if not colors[color] or used[color] then for _,c in ipairs(palette) do if not used[c] then color=c;break end end end
 self.nextid=self.nextid+1;local n=self.nextid
 local p={id=tostring(n),token=self.tokenfn and self.tokenfn() or ('test-'..n),fd=fd,name=name,color=colors[color] and color or '#38bdf8',x=math.cos((n-1)*math.pi/4)*220*config.mapScale*math.max(1,config.vehicleScale),y=math.sin((n-1)*math.pi/4)*220*config.mapScale*math.max(1,config.vehicleScale),angle=0,cargo=0,score=0,cooldown=0,energy=1,boostHeld=false,boost=0,stun=0,hitSeq=0,impactSeq=0,kx=0,ky=0,pickupSeq=0,protect=0,connected=true,ix=0,iy=0,last=self.time,lastInputSeq=0,pendingSeq=0,inputSeq=0,inputElapsed=0}
 -- Reuse an actually free lobby slot, not nextid modulo eight after churn.
 for offset=0,7 do
  local angle=((n-1+offset)%8)*math.pi/4
  local x,y=math.cos(angle)*220*config.mapScale*math.max(1,config.vehicleScale),math.sin(angle)*220*config.mapScale*math.max(1,config.vehicleScale);local free=true
  for _,q in ipairs(self.players) do if not q.removed and (q.x-x)^2+(q.y-y)^2<(2*config.collisionRadius)^2 then free=false;break end end
  if free then p.x=x;p.y=y;break end
 end
 table.insert(self.players,p);return p
end
function G:disconnect(fd) for _,p in ipairs(self.players) do if p.fd==fd and p.connected then p.connected=false;p.boostHeld=false;p.disconnected=self.time;p.ix=0;p.iy=0;p.boost=0 end end end
function G:input(p,m)
 local x,y=m.x,m.y
 if type(x)~='number' or type(y)~='number' or x~=x or y~=y or math.abs(x)>1000 or math.abs(y)>1000 or (m.boost~=nil and type(m.boost)~='boolean') then return nil,'Invalid input' end
 if m.seq~=nil and (type(m.seq)~='number' or m.seq~=m.seq or m.seq<1 or m.seq>9007199254740991 or m.seq%1~=0) then return nil,'Invalid input sequence' end
 if self.phase~='playing' or not p.connected or p.removed then return false end
 if m.seq then
  if m.seq<=(p.lastInputSeq or 0) then return false end
  p.lastInputSeq=m.seq;p.pendingSeq=m.seq
 end
 if p.stun>0 then p.ix=0;p.iy=0;return false end
 local n=math.sqrt(x*x+y*y);if n>1 then x=x/n;y=y/n end
 p.ix=x;p.iy=y;p.last=self.time
 if not m.boost then p.boostHeld=false;p.boost=0
 elseif not p.boostHeld and p.energy>1e-9 then
  if n>=.1 then p.angle=math.atan(y,x) end
  p.bx=math.cos(p.angle);p.by=math.sin(p.angle);p.boost=p.energy*config.boostDuration;p.cooldown=config.boostCooldown
 end
 p.boostHeld=m.boost==true
 return true
end
function G:addbattery(x,y,unlock,source)
 local b={x=x,y=y,source=source or 'natural'};clamp(b);if self:station(b) then return end
 self.nextbat=self.nextbat+1;b.id=tostring(self.nextbat);b.unlock=unlock or 0;self.batteries[#self.batteries+1]=b;return b
end
function G:supply()
 local elapsed=config.matchDuration-self.remaining
 local index=1
 for i,stage in ipairs(resources.stages) do if elapsed>=stage.at then index=i end end
 local stage=resources.stages[index];local nextStage=resources.stages[index+1]
 return {stage=index,outerRadius=stage.outer,nextOuterRadius=nextStage and nextStage.outer or nil,
  secondsToShrink=nextStage and math.max(0,nextStage.at-elapsed) or nil,banking=self.remaining<=resources.stopRemaining}
end
function G:supplyPosition(index,sector)
 local stage=resources.stages[index];sector=sector or (math.random(resources.sectors)-1)
 for _=1,resources.attemptsPerBattery do
  local angle=(sector+math.random())*2*math.pi/resources.sectors
  local radius=math.sqrt(stage.inner^2+math.random()*(stage.outer^2-stage.inner^2))
  local p={x=math.cos(angle)*radius,y=math.sin(angle)*radius}
  if not self:station(p) then return p end
 end
end
function G:contractSupply()
 local index=self:supply().stage
 if self.supplyStage==index then return end
 local outer=resources.stages[index].outer
 for _,b in ipairs(self.batteries) do
  if b.source~='drop' and b.x*b.x+b.y*b.y>outer*outer then
   local p=self:supplyPosition(index)
   if p then b.x=p.x;b.y=p.y end
  end
 end
 self.supplyStage=index
end
function G:replenish(limit)
 local natural=0
 for _,b in ipairs(self.batteries) do if b.source~='drop' then natural=natural+1 end end
 local amount=math.min(limit or resources.refillBatch,math.max(0,resources.groundCap-natural))
 local offset=math.random(resources.sectors)-1
 for i=1,amount do
  local p=self:supplyPosition(self:supply().stage,(offset+i-1)%resources.sectors)
  if p then self:addbattery(p.x,p.y) end
 end
end
function G:start()
 if self.phase~='lobby' then return nil,'Not in lobby' end
 local count=0;for _,p in ipairs(self.players) do if p.connected then count=count+1 end end
 if count<2 then return nil,'At least two players required' end
 self.roundId=self.roundId+1;self.phase='playing';self.remaining=config.matchDuration;self.nextrefill=self.time+resources.refillInterval;self.supplyStage=1;self:replenish(resources.initial);return true
end
function G:again()
 if self.phase~='finished' then return nil,'Match not finished' end
 local keep={};for _,p in ipairs(self.players) do if p.connected then p.bot=nil;p.score=0;p.cargo=0;p.cooldown=0;p.energy=1;p.boostHeld=false;p.boost=0;p.stun=0;p.hitSeq=0;p.impactSeq=0;p.kx=0;p.ky=0;p.pickupSeq=0;p.angle=0;p.protect=0;p.ix=0;p.iy=0;p.x=math.cos(#keep*math.pi/4)*220*config.mapScale*math.max(1,config.vehicleScale);p.y=math.sin(#keep*math.pi/4)*220*config.mapScale*math.max(1,config.vehicleScale);keep[#keep+1]=p end end
 self.players=keep;self.batteries={};self.contacts={};self.phase='lobby';self.remaining=config.matchDuration;self.finishedAt=nil;self.nextrefill=nil;self.supplyStage=nil;return true
end
function G:drop(p,n,nx,ny)
 n=math.min(p.cargo,math.max(0,math.floor(n)))
 nx=nx or math.cos(p.angle);ny=ny or math.sin(p.angle)
 local heading=math.atan(ny,nx)
 for _=1,n do
  local angle=heading+(math.random()-.5)*2.4;local speed=150+math.random()*90
  local b={x=p.x+math.cos(angle)*(78+math.random()*20),y=p.y+math.sin(angle)*(78+math.random()*20),
   source='drop',unlock=self.time+.65,vx=math.cos(angle)*speed,vy=math.sin(angle)*speed,z=0,vz=150+math.random()*55}
  batteryMotion.place(self,b)
  self.nextbat=self.nextbat+1;b.id=tostring(self.nextbat);self.batteries[#self.batteries+1]=b
 end
 p.cargo=p.cargo-n
end
function G:step(dt,elapsed,remaining)
 elapsed=elapsed or dt
 self.time=self.time+elapsed
 for _,p in ipairs(self.players) do
  if not p.connected and not p.removed and self.time-(p.disconnected or 0)>=10 then self:drop(p,p.cargo);p.removed=true end
 end
 if self.phase=='lobby' then
  for i=#self.players,1,-1 do if self.players[i].removed then table.remove(self.players,i) end end
 end
 if self.phase=='finished' then
  local abandoned=true
  for _,p in ipairs(self.players) do if p.connected or not p.removed then abandoned=false;break end end
  if abandoned or (self.finishedAt and self.time>=self.finishedAt+10) then self:again() end
 end
 if self.phase~='playing' then return end
 self.remaining=remaining or math.max(0,self.remaining-elapsed)
 if self.remaining<=0 then self.phase='finished';self.finishedAt=self.time;return end
 self:contractSupply()
 if self.time>=self.nextrefill and self.remaining>resources.stopRemaining then self:replenish();self.nextrefill=self.time+resources.refillInterval end
 local active={}
 for _,p in ipairs(self.players) do
  if p.isBot and p.connected and not p.removed and dt>0 then
   p.bot=p.bot or Bot.new();self:input(p,Bot.input(p.bot,self,p,self.time))
  end
 end
 for _,p in ipairs(self.players) do
  if dt>0 and p.connected then
   if p.inputSeq~=p.pendingSeq then p.inputSeq=p.pendingSeq;p.inputElapsed=0 end
   p.inputElapsed=p.inputElapsed+dt
  end
  if self.time-p.last>.3 or p.stun>0 or not p.connected then p.boostHeld=false;p.boost=0 end
  local used=math.min(p.boost,elapsed)
  if p.boostHeld then p.energy=math.max(0,p.energy-used/config.boostDuration)
  else p.energy=math.min(1,p.energy+elapsed/config.boostCooldown);p.cooldown=(1-p.energy)*config.boostCooldown end
  p.stun=math.max(0,p.stun-elapsed);p.cooldown=math.max(0,p.cooldown-(p.boostHeld and elapsed or 0));if p.cooldown<1e-9 then p.cooldown=0 end
  p.protect=math.max(0,p.protect-elapsed)
  if dt==0 then p.boost=math.max(0,p.boost-elapsed) end
  if self.time-p.last>.3 or p.stun>0 or not p.connected then p.ix=0;p.iy=0;p.boost=0;p.boostHeld=false end
  local ix,iy=p.ix,p.iy
  if p.boost>0 and p.bx then ix=p.bx;iy=p.by end
  if ix~=0 or iy~=0 then p.angle=math.atan(iy,ix) end
  if not p.removed then active[#active+1]=p end
 end
 if dt==0 then return end
 -- A contact episode is consumed even while protected; it rearms only after a gap.
 for key in pairs(self.contacts) do
  local ids={key:match('([^:]+):([^:]+)')};local a,b
  for _,p in ipairs(active) do if p.id==ids[1] then a=p elseif p.id==ids[2] then b=p end end
  if not a or not b or dist(a,b)>(2*config.collisionRadius+config.collision.releaseGap)^2 then self.contacts[key]=nil end
 end
 local hitThisTick={}
 local sliceStart=0
 local function resolveContacts(events)
  local hits={}
  for _,e in ipairs(events) do
   e.a.collisionAt=e.time
   if e.b then e.b.collisionAt=e.time end
  end
  local function hit(p,stun,n,nx,ny,push)
   local h=hits[p] or {stun=0,n=0,x=0,y=0};hits[p]=h
   h.stun=math.max(h.stun,stun);h.n=math.max(h.n,n);h.x=h.x+nx*push;h.y=h.y+ny*push
  end
  for _,e in ipairs(events) do if e.b then
   local a,b=e.a,e.b;local key=a.id..':'..b.id
   if not self.contacts[key] then
    self.contacts[key]=true
    a.impactSeq=(a.impactSeq or 0)+1;b.impactSeq=(b.impactSeq or 0)+1
    local nx,ny=e.nx,e.ny
    local closing=(e.avx-e.bvx)*nx+(e.avy-e.bvy)*ny
    local af=a.driveX*nx+a.driveY*ny;local bf=-b.driveX*nx-b.driveY*ny
    local frontA=math.cos(a.angle)*nx+math.sin(a.angle)*ny>=config.collision.frontDot and af>=30*config.vehicleScale
    local frontB=-math.cos(b.angle)*nx-math.sin(b.angle)*ny>=config.collision.frontDot and bf>=30*config.vehicleScale
    local boostA=closing>=config.collision.minClosing and a.boost>0 and sliceStart+(e.time or 0)<=a.boost+1e-9 and frontA
    local boostB=closing>=config.collision.minClosing and b.boost>0 and sliceStart+(e.time or 0)<=b.boost+1e-9 and frontB
    local safe=self:station(a) or self:station(b)
    if closing>1e-7 then
     local function damage(p,amount) return not safe and p.protect<=0 and not hitThisTick[p] and amount or 0 end
     if boostA or boostB then
      local push=math.min(560,math.max(340,closing*.8))
      hit(a,boostA and not boostB and 0 or config.collision.boostStun,boostB and damage(a,math.min(5,math.ceil(a.cargo*.25))) or 0,-nx,-ny,boostB and push or 90)
      hit(b,boostB and not boostA and 0 or config.collision.boostStun,boostA and damage(b,math.min(5,math.ceil(b.cargo*.25))) or 0,nx,ny,boostA and push or 90)
     else
      local push=math.min(220,70+closing*.45)
      hit(a,config.collision.normalStun,0,-nx,-ny,frontA and not frontB and 45 or push)
      hit(b,config.collision.normalStun,0,nx,ny,frontB and not frontA and 45 or push)
     end
    end
   end
  end end
  for p,h in pairs(hits) do
   if h.n>0 then self:drop(p,h.n,h.x,h.y) end
   if p.protect<=0 and h.stun>0 then p.stun=h.stun;p.hitSeq=p.hitSeq+1 end
   if h.stun>0 or h.n>0 then p.protect=math.max(p.protect,config.collision.protection) end
   hitThisTick[p]=true;p.boost=0;p.ix=0;p.iy=0;p.driveX=0;p.driveY=0
   p.vx=h.x;p.vy=h.y
  end
 end
 -- Slice at every dash expiry: averaging boosted and normal speeds changes TOI
 -- and can incorrectly turn a real last-millisecond boost into an ordinary hit.
 local boundaries={dt};local paths={}
 for _,p in ipairs(active) do
  paths[p]={}
  if p.boost>1e-8 and p.boost<dt-1e-8 then boundaries[#boundaries+1]=p.boost end
 end
 table.sort(boundaries)
 for _,sliceEnd in ipairs(boundaries) do
  local slice=sliceEnd-sliceStart
  if slice>1e-8 then
   local decay=math.exp(-config.knockbackDecay*slice)
   local average=(1-decay)/(config.knockbackDecay*slice)
   local initialK={}
   for _,p in ipairs(active) do
    local boosting=p.boost>sliceStart+1e-8
    local speed=config.baseSpeed*(1-.2*p.cargo/20)
    p.driveX=speed*(boosting and (p.bx or math.cos(p.angle))*config.boostMultiplier or p.ix)
    p.driveY=speed*(boosting and (p.by or math.sin(p.angle))*config.boostMultiplier or p.iy)
    initialK[p]={x=p.kx or 0,y=p.ky or 0}
    p.vx=p.driveX+initialK[p].x*average;p.vy=p.driveY+initialK[p].y*average;p.collisionAt=nil
   end
   local segments=vehicleCollision.resolve(active,slice,resolveContacts)
   for _,p in ipairs(active) do
    if p.collisionAt then
     local damping=math.exp(-config.knockbackDecay*(slice-p.collisionAt))
     p.kx=(p.vx-p.driveX)*damping;p.ky=(p.vy-p.driveY)*damping
    else
     p.kx=initialK[p].x*decay;p.ky=initialK[p].y*decay
    end
    for _,path in ipairs(segments[p]) do
     path.t0=(sliceStart+path.t0*slice)/dt;path.t1=(sliceStart+path.t1*slice)/dt
     paths[p][#paths[p]+1]=path
    end
   end
  end
  sliceStart=sliceEnd
 end
 batteryMotion.advance(self,dt)
 for _,p in ipairs(self.players) do if p.connected then
  -- Only actual resolved travel counts; the pre-collision intended endpoint cannot collect through a car.
  local events={}
  for _,path in ipairs(paths[p] or {}) do
   local start,finish=path.a,path.b;local exits={}
   local function add(t,event) event.t=path.t0+(path.t1-path.t0)*t;event.position=along(start,finish,t);events[#events+1]=event end
   for _,station in ipairs(self.stations) do
    local enter,leave=circleInterval(start,finish,station,station.r)
    if enter then add(enter,{deposit=true});if leave<1 then exits[#exits+1]=math.min(1,leave+1e-7) end end
   end
   for _,battery in ipairs(self.batteries) do if battery.unlock<=self.time and (battery.z or 0)<=1 then
    local enter,leave=circleInterval(start,finish,battery,pickupRadius(battery))
    if enter then
     add(enter,{battery=battery})
     for _,t in ipairs(exits) do if t>=enter and t<=leave then add(t,{battery=battery}) end end
    end
   end end
  end
  for _,battery in ipairs(self.batteries) do if battery.unlock<=self.time and (battery.z or 0)<=1 and dist(p,battery)<=pickupRadius(battery)^2 then events[#events+1]={t=1,battery=battery,position=p} end end
  if self:station(p) then events[#events+1]={t=1,deposit=true} end
  table.sort(events,function(a,b)
   if a.t~=b.t then return a.t<b.t end
   if a.deposit~=b.deposit then return a.deposit==true end
   return a.battery and b.battery and tonumber(a.battery.id)>tonumber(b.battery.id) or false
  end)
  local collected={}
  for _,event in ipairs(events) do
   if event.deposit then p.score=p.score+p.cargo;p.cargo=0
   elseif p.cargo<20 and not collected[event.battery] and not self:station(event.position) then
    collected[event.battery]=true;p.cargo=p.cargo+1;p.pickupSeq=p.pickupSeq+1
   end
  end
  for i=#self.batteries,1,-1 do if collected[self.batteries[i]] then table.remove(self.batteries,i) end end
 end;p.boost=math.max(0,p.boost-elapsed) end
end
function G:snapshot(array)
 array=array or function(t)return t or {} end
 local s={type='state',boostMultiplier=config.boostMultiplier,vehicleScale=config.vehicleScale,boostCooldown=config.boostCooldown,boostDuration=config.boostDuration,baseSpeed=config.baseSpeed,serverTime=self.time,roundId=self.roundId,phase=self.phase,remaining=self.remaining,radius=config.arenaRadius,mapScale=config.mapScale,supplySpeed=config.supplySpeed,refillInterval=resources.refillInterval,collisionRadius=config.collisionRadius,pickupRadius=config.pickupRadius,returnIn=self.phase=='finished' and math.max(0,10-(self.time-(self.finishedAt or self.time))) or nil,players=array(),batteries=array(),stations=array(self.stations)}
 if self.phase~='lobby' then s.supply=self:supply() end
 for _,p in ipairs(self.players) do if not p.removed then s.players[#s.players+1]={id=p.id,name=p.name,isBot=p.isBot==true,color=p.color,x=p.x,y=p.y,angle=p.angle,cargo=p.cargo,score=p.score,cooldown=p.cooldown,energy=p.energy,boostHeld=p.boostHeld,boost=p.boost,stun=p.stun,hitSeq=p.hitSeq,impactSeq=p.impactSeq,kx=p.kx,ky=p.ky,pickupSeq=p.pickupSeq,connected=p.connected,inputSeq=p.inputSeq,inputElapsed=p.inputElapsed,ix=p.ix,iy=p.iy,bx=p.bx,by=p.by} end end
 for _,b in ipairs(self.batteries) do s.batteries[#s.batteries+1]={id=b.id,x=b.x,y=b.y,z=b.z,vx=b.vx,vy=b.vy,source=b.source,unlock=b.unlock} end
 if self.phase=='finished' then s.results=array();for _,p in ipairs(self.players) do s.results[#s.results+1]={id=p.id,name=p.name,isBot=p.isBot==true,color=p.color,score=p.score} end;table.sort(s.results,function(a,b)return a.score>b.score or (a.score==b.score and tonumber(a.id)<tonumber(b.id)) end) end
 return s
end
return G
