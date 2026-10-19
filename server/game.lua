local G={}; G.__index=G
local colors={['#38bdf8']=true,['#fb7185']=true,['#a78bfa']=true,['#facc15']=true,['#34d399']=true,['#fb923c']=true}
local function dist(a,b) return (a.x-b.x)^2+(a.y-b.y)^2 end
local function clamp(p) local d=math.sqrt(p.x*p.x+p.y*p.y);if d>500 then p.x=p.x*500/d;p.y=p.y*500/d end end
function G.new(tokenfn)
 return setmetatable({phase='lobby',remaining=180,time=0,players={},batteries={},contacts={},nextid=0,nextbat=0,stations={{x=-330,y=-220,r=65},{x=330,y=-220,r=65},{x=0,y=380,r=65}},tokenfn=tokenfn},G)
end
function G:station(p) for _,s in ipairs(self.stations) do if dist(p,s)<=s.r^2 then return true end end return false end
function G:join(fd,name,color,token)
 for _,p in ipairs(self.players) do
  if p.fd==fd then return nil,'Already joined' end
  if token and token==p.token then
   if p.connected then return nil,'Guest already connected; close the other tab first' end
   p.fd=fd;p.connected=true;p.removed=false;p.ix=0;p.iy=0;p.last=self.time;return p
  end
 end
 if self.phase~='lobby' then return nil,'Match in progress; wait for the next lobby' end
 if #self.players>=8 then return nil,'Lobby full' end
 if type(name)~='string' or #name>256 then return nil,'Invalid nickname' end
 name=name:gsub('[%c<>]',''):match('^%s*(.-)%s*$');local ok,len=pcall(utf8.len,name)
 if not ok or not len or len<1 then return nil,'Nickname required' end
 if len>16 then name=name:sub(1,utf8.offset(name,17)-1) end
 self.nextid=self.nextid+1;local n=self.nextid
 local p={id=tostring(n),token=self.tokenfn and self.tokenfn() or ('test-'..n),fd=fd,name=name,color=colors[color] and color or '#38bdf8',x=math.cos(n*2.4)*100,y=math.sin(n*2.4)*100,angle=0,cargo=0,score=0,cooldown=0,boost=0,protect=0,connected=true,ix=0,iy=0,last=self.time}
 table.insert(self.players,p);return p
end
function G:disconnect(fd) for _,p in ipairs(self.players) do if p.fd==fd and p.connected then p.connected=false;p.disconnected=self.time;p.ix=0;p.iy=0 end end end
function G:input(p,m)
 local x,y=m.x,m.y
 if type(x)~='number' or type(y)~='number' or x~=x or y~=y or math.abs(x)>1000 or math.abs(y)>1000 or (m.boost~=nil and type(m.boost)~='boolean') then return nil,'Invalid input' end
 if self.phase~='playing' then return false end
 local n=math.sqrt(x*x+y*y);if n>1 then x=x/n;y=y/n end
 p.ix=x;p.iy=y;p.last=self.time
 if m.boost and n>=.1 and p.cooldown<=0 then p.boost=.35;p.cooldown=4 end
 return true
end
function G:addbattery(x,y,unlock)
 local b={x=x,y=y};clamp(b);if self:station(b) then return end
 self.nextbat=self.nextbat+1;b.id=tostring(self.nextbat);b.unlock=unlock or 0;self.batteries[#self.batteries+1]=b
end
function G:replenish()
 local counts={0,0,0,0,0,0}
 local function region(x,y) return math.min(6,math.floor((math.atan(y,x)+math.pi)/(math.pi/3))+1) end
 for _,b in ipairs(self.batteries) do local r=region(b.x,b.y);counts[r]=counts[r]+1 end
 for r=1,6 do for _=1,160 do if counts[r]>=18 then break end
  local a=-math.pi+(r-1+math.random())*math.pi/3;local d=math.sqrt(math.random())*470;local b={x=math.cos(a)*d,y=math.sin(a)*d}
  if not self:station(b) then self:addbattery(b.x,b.y);counts[r]=counts[r]+1 end
 end end
end
function G:start()
 if self.phase~='lobby' then return nil,'Not in lobby' end
 local count=0;for _,p in ipairs(self.players) do if p.connected then count=count+1 end end
 if count<2 then return nil,'At least two players required' end
 self.phase='playing';self.remaining=180;self.nextrefill=self.time+5;self:replenish();return true
end
function G:again()
 if self.phase~='finished' then return nil,'Match not finished' end
 local keep={};for _,p in ipairs(self.players) do if p.connected then p.score=0;p.cargo=0;p.cooldown=0;p.boost=0;p.protect=0;p.ix=0;p.iy=0;p.x=math.cos(#keep*2.4)*100;p.y=math.sin(#keep*2.4)*100;keep[#keep+1]=p end end
 self.players=keep;self.batteries={};self.contacts={};self.phase='lobby';self.remaining=180;return true
end
function G:drop(p,n)
 p.cargo=p.cargo-n
 for i=1,n do local a=i*2.4;self:addbattery(p.x+math.cos(a)*28,p.y+math.sin(a)*28,self.time+.5) end
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
  if abandoned then self:again() end
 end
 if self.phase~='playing' then return end
 self.remaining=remaining or math.max(0,self.remaining-elapsed)
 if self.remaining<=0 then self.phase='finished';return end
 if self.time>=self.nextrefill and self.remaining>10 then self:replenish();self.nextrefill=self.time+5 end
 local motion={}
 for _,p in ipairs(self.players) do
  motion[p]={x=p.x,y=p.y}
  p.cooldown=math.max(0,p.cooldown-elapsed);p.protect=math.max(0,p.protect-elapsed)
  if dt==0 then p.boost=math.max(0,p.boost-elapsed) end
  if p.connected then
   if self.time-p.last>.3 then p.ix=0;p.iy=0 end
   local speed=120*(1-.2*p.cargo/20)*(p.boost>0 and 2 or 1)
   p.x=p.x+p.ix*speed*dt;p.y=p.y+p.iy*speed*dt;clamp(p)
   if p.ix~=0 or p.iy~=0 then p.angle=math.atan(p.iy,p.ix) end
  end
 end
 if dt==0 then return end
 -- Resolve new contacts from pre-step positions and actual server displacement.
 -- Hysteresis prevents a touching pair from farming drops after immunity expires.
 local hit={};local contacts={}
 for i,p in ipairs(self.players) do if p.connected then
  for j=i+1,#self.players do local q=self.players[j]
   if q.connected then
    local key=tonumber(p.id)<tonumber(q.id) and p.id..':'..q.id or q.id..':'..p.id
    local distance=dist(p,q)
    if distance<=40^2 and self.contacts[key] then contacts[key]=true end
    if distance<=32^2 then
     contacts[key]=true
     if not self.contacts[key] and not self:station(p) and not self:station(q) then
      local a,b=motion[p],motion[q];local nx,ny=b.x-a.x,b.y-a.y
      local length=math.sqrt(nx*nx+ny*ny)
      if length>.001 then
       nx=nx/length;ny=ny/length
       local pv=((p.x-a.x)*nx+(p.y-a.y)*ny)/dt
       local qv=-((q.x-b.x)*nx+(q.y-b.y)*ny)/dt
       if pv+qv>=40 then
        local function impact(attacker,victim,forward)
         if forward>=30 and victim.protect<=0 and victim.cargo>0 then
          local n=attacker.boost>0 and math.min(5,math.ceil(victim.cargo*.25)) or math.min(2,math.ceil(victim.cargo*.1))
          hit[victim]=math.max(hit[victim] or 0,n)
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
 for p,n in pairs(hit) do self:drop(p,n);p.protect=1 end
 for _,p in ipairs(self.players) do if p.connected then
  if self:station(p) then p.score=p.score+p.cargo;p.cargo=0
  else for i=#self.batteries,1,-1 do local b=self.batteries[i];if p.cargo<20 and b.unlock<=self.time and dist(p,b)<=20^2 then p.cargo=p.cargo+1;table.remove(self.batteries,i) end end end
 end;p.boost=math.max(0,p.boost-elapsed) end
end
function G:snapshot(array)
 array=array or function(t)return t or {} end
 local s={type='state',phase=self.phase,remaining=self.remaining,radius=500,players=array(),batteries=array(),stations=array(self.stations)}
 for _,p in ipairs(self.players) do if not p.removed then s.players[#s.players+1]={id=p.id,name=p.name,color=p.color,x=p.x,y=p.y,angle=p.angle,cargo=p.cargo,score=p.score,cooldown=p.cooldown,connected=p.connected} end end
 for _,b in ipairs(self.batteries) do s.batteries[#s.batteries+1]={id=b.id,x=b.x,y=b.y} end
 if self.phase=='finished' then s.results=array();for _,p in ipairs(self.players) do s.results[#s.results+1]={id=p.id,name=p.name,color=p.color,score=p.score} end;table.sort(s.results,function(a,b)return a.score>b.score or (a.score==b.score and tonumber(a.id)<tonumber(b.id)) end) end
 return s
end
return G
