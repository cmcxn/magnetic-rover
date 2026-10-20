local G={}; G.__index=G
local config=require 'game_config'
local vehicleCollision=require 'vehicle_collision'
local resources=config.resources
local colors={['#38bdf8']=true,['#fb7185']=true,['#a78bfa']=true,['#facc15']=true,['#34d399']=true,['#fb923c']=true}
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
local function along(a,b,t) return {x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t} end
local function clamp(p) local d=math.sqrt(p.x*p.x+p.y*p.y);if d>500 then p.x=p.x*500/d;p.y=p.y*500/d end end
function G.new(tokenfn)
 return setmetatable({phase='lobby',remaining=config.matchDuration,time=0,roundId=0,players={},batteries={},contacts={},nextid=0,nextbat=0,stations={{x=-330,y=-220,r=65},{x=330,y=-220,r=65},{x=0,y=380,r=65}},tokenfn=tokenfn},G)
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
 self.nextid=self.nextid+1;local n=self.nextid
 local p={id=tostring(n),token=self.tokenfn and self.tokenfn() or ('test-'..n),fd=fd,name=name,color=colors[color] and color or '#38bdf8',x=math.cos(n*2.4)*100,y=math.sin(n*2.4)*100,angle=0,cargo=0,score=0,cooldown=0,boost=0,stun=0,hitSeq=0,pickupSeq=0,protect=0,connected=true,ix=0,iy=0,last=self.time,lastInputSeq=0,pendingSeq=0,inputSeq=0,inputElapsed=0}
 table.insert(self.players,p);return p
end
function G:disconnect(fd) for _,p in ipairs(self.players) do if p.fd==fd and p.connected then p.connected=false;p.disconnected=self.time;p.ix=0;p.iy=0;p.boost=0 end end end
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
 if m.boost and p.cooldown<=0 then
  if n>=.1 then p.angle=math.atan(y,x) end
  p.bx=math.cos(p.angle);p.by=math.sin(p.angle);p.boost=.32;p.cooldown=4
 end
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
 local keep={};for _,p in ipairs(self.players) do if p.connected then p.score=0;p.cargo=0;p.cooldown=0;p.boost=0;p.stun=0;p.hitSeq=0;p.pickupSeq=0;p.angle=0;p.protect=0;p.ix=0;p.iy=0;p.x=math.cos(#keep*2.4)*100;p.y=math.sin(#keep*2.4)*100;keep[#keep+1]=p end end
 self.players=keep;self.batteries={};self.contacts={};self.phase='lobby';self.remaining=config.matchDuration;self.finishedAt=nil;self.nextrefill=nil;self.supplyStage=nil;return true
end
function G:drop(p,n)
 p.cargo=p.cargo-n
 for i=1,n do local a=i*2.4;self:addbattery(p.x+math.cos(a)*28,p.y+math.sin(a)*28,self.time+.5,'drop') end
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
 local motion={}
 for _,p in ipairs(self.players) do
  motion[p]={x=p.x,y=p.y}
  if dt>0 and p.connected then
   if p.inputSeq~=p.pendingSeq then p.inputSeq=p.pendingSeq;p.inputElapsed=0 end
   p.inputElapsed=p.inputElapsed+dt
  end
  p.stun=math.max(0,p.stun-elapsed);p.cooldown=math.max(0,p.cooldown-elapsed);if p.cooldown<1e-9 then p.cooldown=0 end;p.protect=math.max(0,p.protect-elapsed)
  if dt==0 then p.boost=math.max(0,p.boost-elapsed) end
  if p.connected then
   if self.time-p.last>.3 or p.stun>0 then p.ix=0;p.iy=0;p.boost=0 end
   local ix,iy=p.ix,p.iy
   if p.boost>0 and p.bx then ix=p.bx;iy=p.by end
   local speed=240*(1-.2*p.cargo/20)
   local dash=math.min(dt,p.boost)
   p.x=p.x+speed*(ix*3*dash+p.ix*(dt-dash));p.y=p.y+speed*(iy*3*dash+p.iy*(dt-dash));clamp(p)
   if ix~=0 or iy~=0 then p.angle=math.atan(iy,ix) end
  end
 end
 for _,p in ipairs(self.players) do motion[p].finish={x=p.x,y=p.y} end
 if dt==0 then return end
 -- Resolve new contacts from pre-step positions and actual server displacement.
 -- Hysteresis prevents a touching pair from farming drops after immunity expires.
 local hit={};local contacts={}
 for i,p in ipairs(self.players) do if p.connected then
  for j=i+1,#self.players do local q=self.players[j]
   if q.connected then
    local key=tonumber(p.id)<tonumber(q.id) and p.id..':'..q.id or q.id..':'..p.id
    local a,b=motion[p],motion[q]
    -- Same 98x68 oriented body as every client's artwork. A small release gap
    -- consumes continuous contact even after the 24-unit non-solid knockback.
    if self.contacts[key] and vehicleCollision.sweep(p,p,p.angle,q,q,q.angle,config.vehicleBody.releasePadding) then contacts[key]=true end
    local contactTime=vehicleCollision.sweep(a,p,p.angle,b,q,q.angle)
    if contactTime then
     contacts[key]=true
     local contactSafe=self:station(along(a,p,contactTime)) or self:station(along(b,q,contactTime))
     if not self.contacts[key] and not contactSafe and not self:station(p) and not self:station(q) and not self:station(a) and not self:station(b) then
      local a,b=motion[p],motion[q];local nx,ny=b.x-a.x,b.y-a.y
      local length=math.sqrt(nx*nx+ny*ny)
      if length>.001 then
       nx=nx/length;ny=ny/length
       local pv=((p.x-a.x)*nx+(p.y-a.y)*ny)/dt
       local qv=-((q.x-b.x)*nx+(q.y-b.y)*ny)/dt
       if pv+qv>=40 then
        local function impact(attacker,victim,forward)
         if forward>=30 and victim.protect<=0 then
          local n=attacker.boost>0 and math.min(5,math.ceil(victim.cargo*.25)) or math.min(2,math.ceil(victim.cargo*.1))
          local h=hit[victim] or {n=0,x=0,y=0};hit[victim]=h
          h.n=math.max(h.n,n)
          local sign=attacker==p and 1 or -1
          h.x=h.x+nx*sign;h.y=h.y+ny*sign
         end
        end
        impact(p,q,pv);impact(q,p,qv)
       end
      end
     end
    end
   end
  end
 end end
 self.contacts=contacts
 for p,h in pairs(hit) do
  self:drop(p,h.n);p.protect=1.6;p.stun=1;p.hitSeq=p.hitSeq+1;p.boost=0;p.ix=0;p.iy=0
  local length=math.sqrt(h.x*h.x+h.y*h.y)
  if length>.001 then
   -- Stop at the first safe-zone boundary; knockback is never attack motion.
   local startx,starty=p.x,p.y
   for step=1,24 do
    local nextpos={x=startx+h.x/length*step,y=starty+h.y/length*step}
    clamp(nextpos)
    if self:station(nextpos) then break end
    p.x=nextpos.x;p.y=nextpos.y
   end
  end
 end
 for _,p in ipairs(self.players) do if p.connected then
  -- Keep the existing collision-loss-before-collection contract, then process
  -- pickups and station deposits in travel order within this 50ms tick.
  local start,finish=motion[p],motion[p].finish
  local events,exits={},{}
  for _,station in ipairs(self.stations) do
   local enter,leave=circleInterval(start,finish,station,station.r)
   if enter then
    events[#events+1]={t=enter,deposit=true}
    if leave<1 then exits[#exits+1]=math.min(1,leave+1e-7) end
   end
  end
  for _,battery in ipairs(self.batteries) do if battery.unlock<=self.time then
   local enter,leave=circleInterval(start,finish,battery,config.pickupRadius)
   if enter then
    events[#events+1]={t=enter,battery=battery}
    -- A battery's pickup circle may overlap the station: try again just outside.
    for _,t in ipairs(exits) do if t>=enter and t<=leave then events[#events+1]={t=t,battery=battery} end end
   end
   if dist(p,battery)<=config.pickupRadius^2 then events[#events+1]={t=1,battery=battery,position=p} end
  end end
  if self:station(p) then events[#events+1]={t=1,deposit=true} end
  table.sort(events,function(a,b)
   if a.t~=b.t then return a.t<b.t end
   if a.deposit~=b.deposit then return a.deposit==true end
   return a.battery and b.battery and tonumber(a.battery.id)>tonumber(b.battery.id) or false
  end)
  local collected={}
  for _,event in ipairs(events) do
   if event.deposit then p.score=p.score+p.cargo;p.cargo=0
   elseif p.cargo<20 and not collected[event.battery] and not self:station(event.position or along(start,finish,event.t)) then
    collected[event.battery]=true;p.cargo=p.cargo+1;p.pickupSeq=p.pickupSeq+1
   end
  end
  for i=#self.batteries,1,-1 do if collected[self.batteries[i]] then table.remove(self.batteries,i) end end
 end;p.boost=math.max(0,p.boost-elapsed) end
end
function G:snapshot(array)
 array=array or function(t)return t or {} end
 local s={type='state',serverTime=self.time,roundId=self.roundId,phase=self.phase,remaining=self.remaining,radius=500,pickupRadius=config.pickupRadius,returnIn=self.phase=='finished' and math.max(0,10-(self.time-(self.finishedAt or self.time))) or nil,players=array(),batteries=array(),stations=array(self.stations)}
 if self.phase~='lobby' then s.supply=self:supply() end
 for _,p in ipairs(self.players) do if not p.removed then s.players[#s.players+1]={id=p.id,name=p.name,color=p.color,x=p.x,y=p.y,angle=p.angle,cargo=p.cargo,score=p.score,cooldown=p.cooldown,boost=p.boost,stun=p.stun,hitSeq=p.hitSeq,pickupSeq=p.pickupSeq,connected=p.connected,inputSeq=p.inputSeq,inputElapsed=p.inputElapsed,ix=p.ix,iy=p.iy,bx=p.bx,by=p.by} end end
 for _,b in ipairs(self.batteries) do s.batteries[#s.batteries+1]={id=b.id,x=b.x,y=b.y} end
 if self.phase=='finished' then s.results=array();for _,p in ipairs(self.players) do s.results[#s.results+1]={id=p.id,name=p.name,color=p.color,score=p.score} end;table.sort(s.results,function(a,b)return a.score>b.score or (a.score==b.score and tonumber(a.id)<tonumber(b.id)) end) end
 return s
end
return G
