-- Deterministic test-only producer. Uses the production game core, not mock physics.
-- Run from repository root: <skynet>/3rd/lua/lua tests/collision_scenarios.lua <output.json>
package.path='./server/?.lua;'..package.path
local G=require 'game'
local json=require 'json'
local out=assert(arg[1],'output JSON path required')
local scenarios=json.array()
local function setup(name,positions,cargo)
 math.randomseed(20261024)
 local g=G.new(); local players={}
 local names={'蓝圈小车','珊瑚小车','薄荷小车'}
 local colors={'#38bdf8','#fb7185','#34d399'}
 for i,pos in ipairs(positions) do
  local p=assert(g:join(tostring(i),names[i],colors[i]));players[i]=p
  p.x=pos[1];p.y=pos[2];p.angle=pos[3] or 0;p.cargo=cargo[i] or 0
 end
 assert(g:start());g.batteries={};g.nextrefill=1e9
 local scenario={name=name,method='Deterministic production Lua game core; exact snapshots replayed through real Phaser browser client',frames=json.array(),captures={}}
 scenarios[#scenarios+1]=scenario
 local function capture(label)
  local s=g:snapshot(json.array);s.roomId='qa-'..name;s.roomCode='QA';s.playerCount=#players;s.readyCount=#players;s.spectatorCount=0
  for _,p in ipairs(s.players) do p.ready=true end
  scenario.frames[#scenario.frames+1]=s
  if label then scenario.captures[label]=#scenario.frames end
 end
 return g,players,scenario,capture
end
local function separation(s)
 assert(s.collisionRadius==60,'authoritative snapshot must expose hard-circle radius60')
 local gap=math.huge
 for i,p in ipairs(s.players) do
  assert(math.sqrt(p.x*p.x+p.y*p.y)<=s.radius-s.collisionRadius+1e-4,'body outside arena')
  for j=i+1,#s.players do local q=s.players[j]
   gap=math.min(gap,math.sqrt((p.x-q.x)^2+(p.y-q.y)^2)-2*s.collisionRadius)
  end
 end
 assert(gap>=-1e-4,'circle overlap in authoritative scenario')
 return gap
end
local function verify(scenario)
 local minGap=math.huge
 for _,s in ipairs(scenario.frames) do minGap=math.min(minGap,separation(s)) end
 scenario.minimumGap=minGap
end
local function play(g,ps,scenario,capture,controls,steps)
 capture('before')
 local hit=false
 for tick=1,steps do
  for i,p in ipairs(ps) do
   local c=controls[i] or {0,0,false}
   if not hit then g:input(p,{x=c[1],y=c[2],boost=c[3] and tick==1}) else g:input(p,{x=0,y=0,boost=false}) end
  end
  g:step(.05)
  local nowHit=false
  for _,p in ipairs(ps) do if p.hitSeq>0 then nowHit=true end end
  if nowHit and not hit then hit=true;capture('contact') else capture() end
  if hit and not scenario.captures.scatter and #g.batteries>0 then
   local z=0;for _,b in ipairs(g.batteries) do z=math.max(z,b.z or 0) end
   if z>=8 then scenario.captures.scatter=#scenario.frames end
  end
 end
 scenario.captures.after=#scenario.frames
 assert(hit,'scenario never collided')
 verify(scenario)
 return scenario.frames[scenario.captures.contact],scenario.frames[#scenario.frames]
end

do
 local g,ps,s,c=setup('normal',{{-90,0,0},{90,0,math.pi}},{12,12})
 local contact=play(g,ps,s,c,{{1,0,false},{-1,0,false}},15)
 assert(contact.players[1].stun>0 and contact.players[2].stun>0,'ordinary contact must stun both')
 assert(contact.players[1].cargo==12 and contact.players[2].cargo==12 and #contact.batteries==0,'ordinary contact loses cargo')
 s.check='Both stunned; cargo 12 + 12 preserved; no ground drops.'
end

do
 local g,ps,s,c=setup('boost',{{-140,0,0},{70,0,math.pi}},{12,20})
 local contact=play(g,ps,s,c,{{1,0,true},{0,0,false}},16)
 assert(contact.players[1].stun==0 and contact.players[2].stun>0,'frontal boost stun ownership')
 assert(contact.players[1].cargo==12 and contact.players[2].cargo==15 and #contact.batteries==5,'boost drops exactly five carried units')
 s.check='Attacker unstunned; target 20 → 15, five real dropped batteries; all 32 units conserved.'
end

do
 local g,ps,s,c=setup('double-boost',{{-135,0,0},{135,0,math.pi}},{20,20})
 local contact=play(g,ps,s,c,{{1,0,true},{-1,0,true}},16)
 assert(contact.players[1].stun>0 and contact.players[2].stun>0,'double frontal boost stuns both')
 assert(contact.players[1].cargo==15 and contact.players[2].cargo==15 and #contact.batteries==10,'double boost conserves ten dropped units')
 s.check='Both stunned; both 20 → 15; ten real dropped batteries, all 40 units conserved.'
end

do
 local g,ps,s,c=setup('wall-three',{{190,0,0},{315,0,0},{430,70,math.pi}},{20,20,20})
 local contact=play(g,ps,s,c,{{1,0,true},{0,0,false},{-1,0,true}},16)
 s.check='Three cars near the arena wall remain mutually exclusive and their entire circles stay inside the arena.'
end
local file=assert(io.open(out,'w'));file:write(json.encode({source='server/game.lua production core',seed=20261024,dt=.05,scenarios=scenarios}));file:close()
print('PASS production-core scenarios: normal, boost, double boost and three-car wall; wrote '..out)
