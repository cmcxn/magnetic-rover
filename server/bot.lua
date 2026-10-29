-- Rule controller only: emits the same normalized driving input as a human.
local config=require 'game_config'
local B={}
local function distance(a,b) return math.sqrt((a.x-b.x)^2+(a.y-b.y)^2) end
function B.new(random) return {random=random or math.random,nextThink=-1,holdUntil=-1,nextDash=-1} end
local function available(g,b) return (b.unlock or 0)<=g.time and (b.z or 0)<=1 end
function B.input(c,g,p,now)
 if p.stun>0 or not p.connected or g.phase~='playing' then c.holdUntil=-1;return {x=0,y=0,boost=false} end
 if not c.sampleAt or now-c.sampleAt>=.8 then
  if c.sampleAt and distance(p,c.sample)<8 and c.target then
   c.unstuckUntil=now+.45;c.escapeAngle=(c.random()*2-1)*math.pi+math.pi/2
  end
  c.sampleAt=now;c.sample={x=p.x,y=p.y}
 end
 if now>=c.nextThink then
  c.nextThink=now+.15
  local target,mode
  local urgent=p.cargo>=10 or (p.cargo>0 and g.remaining<=12)
  if not urgent and p.cargo<10 and p.energy>=.45 then
   local best=math.huge
   for _,q in ipairs(g.players) do
    local d=distance(p,q)
    if q~=p and q.connected and not q.removed and q.cargo>=4 and q.protect<=0 and not g:station(q) and not g:station(p) and d<=240 and d<best then best=d;target=q;mode='attack' end
   end
  end
  if urgent then
   local best=math.huge
   for _,s in ipairs(g.stations) do local d=distance(p,s);if d<best then best=d;target=s;mode='bank' end end
  elseif not target then
   if c.mode=='collect' and now<(c.targetUntil or 0) then
    for _,b in ipairs(g.batteries) do if b==c.target and available(g,b) then target=b;break end end
   end
   if not target then
    local best=math.huge
    for _,b in ipairs(g.batteries) do if available(g,b) then
     local d=distance(p,b);local nearby=0
     for _,other in ipairs(g.batteries) do if other~=b and available(g,other) and distance(b,other)<110 then nearby=nearby+1 end end
     local score=d-math.min(nearby,5)*12
     for _,q in ipairs(g.players) do if q~=p and q.connected and distance(q,b)<d then score=score+25 end end
     if score<best then best=score;target=b end
    end end
   end
   if target then mode='collect'
   elseif p.cargo>0 then
    local best=math.huge;for _,s in ipairs(g.stations) do local d=distance(p,s);if d<best then best=d;target=s;mode='bank' end end
   else target={x=0,y=0};mode='roam' end
  end
  if target~=c.target then c.targetUntil=now+.45 end
  c.target=target;c.mode=mode
 end
 local t=c.target or p;local tx,ty=t.x,t.y
 if c.mode=='attack' then
  local lead=.08;local speed=config.baseSpeed
  tx=tx+(t.ix or 0)*speed*lead;ty=ty+(t.iy or 0)*speed*lead
 end
 local dx,dy=tx-p.x,ty-p.y;local d=math.sqrt(dx*dx+dy*dy)
 local x,y=0,0;if d>4 then x=dx/d;y=dy/d end
 if now<(c.unstuckUntil or -1) then x=math.cos(c.escapeAngle);y=math.sin(c.escapeAngle) end
 local aligned=x*math.cos(p.angle)+y*math.sin(p.angle)>.94
 local dashTime=.08+c.random()*.08
 local speed=config.baseSpeed*(1-.3*math.min(p.cargo,20)/20)
 local reach=speed*config.boostMultiplier*math.min(dashTime,p.energy*config.boostDuration)+2*config.collisionRadius
 if now>=c.nextDash and now>=c.holdUntil and aligned and d>2*config.collisionRadius*.8 and (c.mode=='attack' and d<=reach or c.mode~='attack' and d>300 and p.energy>.85) and now>=(c.unstuckUntil or -1) then
  c.holdUntil=now+math.min(dashTime,p.energy*config.boostDuration);c.nextDash=c.holdUntil+.55
 end
 return {x=x,y=y,boost=now<c.holdUntil and p.energy>0}
end
return B
