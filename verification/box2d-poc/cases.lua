local native=require 'native'
local json=require 'json'
local Rooms=require 'rooms'
local function car(x,y,vx,vy,angle)
 return {x=x,y=y,vx=vx or 0,vy=vy or 0,angle=angle or 0}
end
local function move(w,cars,n)
 local events,states=native.step(w,cars,.05,n)
 for i,p in ipairs(cars) do p.x,p.y,p.vx,p.vy,p.angle,p.omega=table.unpack(states[i]) end
 return events
end
local function physics(n)
 local side={car(-120,34,810),car(0,0,0,0,math.pi/2)}
 local sideWorld=native.new(side,{},1000,48)
 local maxOmega=0
 for tick=1,12 do
  move(sideWorld,side,n)
  maxOmega=math.max(maxOmega,math.abs(side[2].omega))
 end
 assert(maxOmega>.5 and side[2].x>0,'perpendicular off-center hit spins and pushes target')
 print('perpendicular side hit rad/s',n,maxOmega)
 native.close(sideWorld)
 local cars={car(-120,48,800),car(0,0),car(92,0)}
 for i=4,8 do cars[i]=car((i-6)*110,400) end
 local w=native.new(cars,{},1000,48)
 local peak,chain=0,false
 for tick=1,20 do
  for _,e in ipairs(move(w,cars,n)) do
   if math.min(e[1],e[2])==2 and math.max(e[1],e[2])==3 then chain=true end
  end
  peak=math.max(peak,math.abs(cars[2].omega))
 end
 print("chain-check",n,peak,chain,cars[3].x)
 assert(peak>.1 and chain and cars[3].x>92,'offset impact and chain')
 print('offset-chain',n,peak,cars[3].x)
 native.close(w)
 for _,wall in ipairs({false,true}) do
  cars=wall and {car(900,0,810)} or {car(-110,0,810),car(110,0,-810)}
  w=native.new(cars,{},1000,48)
  local touched=false
  for tick=1,12 do
   touched=#move(w,cars,n)>0 or touched
   assert(wall and cars[1].x<960 or not wall and cars[1].x<cars[2].x,'pass-through mode='..n..' wall='..tostring(wall)..' tick='..tick..' x='..cars[1].x)
  end
  assert(touched);native.close(w)
 end
end
-- Compare matched geometry at two approach speeds, including the Lua hit callback.
local function impactSpeed(n)
 local adapter=require 'adapter'
 local function trial(speed,y)
  local cars={car(-80,y,speed),car(0,0)}
  local stations={}
  local maxSpeed,maxSpin=0,0
  for tick=1,20 do
   adapter(cars,.05,function(events)
    for _,e in ipairs(events) do
     if e.b then e.a.vx=-90;e.b.vx=340 end -- legacy gameplay knockback
    end
   end,stations,n)
   local target=cars[2]
   maxSpeed=math.max(maxSpeed,math.sqrt(target.vx^2+target.vy^2))
   maxSpin=math.max(maxSpin,math.abs(target.omega))
  end
  return maxSpeed,maxSpin
 end
 local slow,slowSpin=trial(120,34)
 local fast,fastSpin=trial(720,34)
 local _,centerSpin=trial(720,0)
 print('offset impact speed / spin',n,slow,slowSpin,fast,fastSpin,centerSpin)
 assert(fast>slow*2 and fastSpin>slowSpin*2 and centerSpin<fastSpin*.3)
end
local function business(n)
 local collision=require 'vehicle_collision'
 local adapt=require 'adapter'
 local g=require('game').new();local a=g:join(1,'A');local b=g:join(2,'B')
 assert(g:start());g.batteries={};g.nextrefill=1e9
 a.x=-102;a.y=0;b.x=0;b.y=0;a.angle=0;b.angle=0;b.cargo=12
 local rooms=Rooms.new(nil,0,json.array)
 local room={id='fixture',game=g,ready={}}
 rooms.rooms[1]=room
 rooms.connections[1]={room=room,protocolVersion=2,baseline=true}
 local tick,contact,damage,pickup,firstOverlap,wire
 collision.resolve=function(players,dt,cb,stations)
  return adapt(players,dt,function(events)
   if #events>0 then contact=contact or tick end
   cb(events)
  end,stations,n)
 end
 local dropCalls=0
 local drop=g.drop
 function g:drop(...)
  dropCalls=dropCalls+1;return drop(self,...)
 end
 for t=1,30 do
  tick=t;g:input(a,{x=1,y=0,boost=t<6});g:step(.05)
  if t==1 and b.x-a.x<=86.5 then firstOverlap=firstOverlap or t end
  if b.hitSeq>0 and not damage then
   damage=t;assert(b.cargo==9 and #g.batteries==3 and b.pickupSeq==0)
   local snapshot=g:snapshot()
   assert(snapshot.players[2].cargo==9 and snapshot.players[2].hitSeq==1)
  end
  if t%2==0 then
   rooms.now=t*.05;rooms:broadcastStates()
   local out=rooms:drain()
   if damage and not wire then
    assert(#out==1 and type(out[1].encoded)=='string')
    local m=json.decode(out[1].encoded)
    assert(m.type=='state_full' or m.type=='state_delta')
    assert(m.players[2].hitSeq==1 and m.players[2].cargo==9)
    wire=t
   end
  end
  if damage and t==damage+1 then
   -- Force one settled drop onto the victim; preserve its real unlock time.
   local loot=g.batteries[1];loot.x=b.x;loot.y=b.y;loot.vx=0;loot.vy=0;loot.z=0;loot.vz=0
  end
  if damage and not pickup then
   local loot=g.batteries[1]
   if loot and g.time<loot.unlock then assert(b.pickupSeq==0) end
   if b.pickupSeq>0 then pickup=t end
   if loot then loot.x=b.x;loot.y=b.y end
  end
 end
 print('rule ticks',n,firstOverlap or 'solver prevented end-overlap',contact,damage,pickup,dropCalls,wire)
 assert(contact and damage==contact and dropCalls==1 and pickup and pickup>damage and wire==damage+damage%2)
end
local function dashPair(n)
 local adapter=require 'adapter'
 require('vehicle_collision').resolve=function(c,dt,cb,stations) return adapter(c,dt,cb,stations,n) end
 local g=require('game').new()
 local a,b=g:join(1,'a'),g:join(2,'b');g:start();g.batteries={}
 a.x=-110;a.y=0;b.x=110;b.y=0;a.cargo=12;b.cargo=12
 for i=1,10 do
  g:input(a,{x=1,y=0,boost=true});g:input(b,{x=-1,y=0,boost=true})
  g:step(.05)
  assert(a.x<b.x)
 end
 assert(a.hitSeq==1 and b.hitSeq==1 and a.cargo==9 and b.cargo==9)
 print('game double boost',n,a.hitSeq,b.hitSeq,a.cargo,b.cargo)
 -- Stress probe beyond the default maximum dash speed.
 for _,wall in ipairs({false,true}) do
  local cars=wall and {car(900,0,2200)} or {car(-110,0,2200),car(110,0,-2200)}
  local w=native.new(cars,{},1000,48);local first
  for i=1,12 do
   move(w,cars,n)
   if not first and (wall and cars[1].x>=1000 or not wall and cars[1].x>=cars[2].x) then first=i end
  end
  print('2200 stress',n,wall and 'wall' or 'pair',first or 'no-crossing')
  native.close(w)
 end
end
local function pinnedCargo(n)
 local adapt=require 'adapter'
 local g=require('game').new()
 local a,b=g:join(1,'A'),g:join(2,'B');assert(g:start())
 g.batteries={};g.nextrefill=math.huge
 local cfg=require 'game_config'
 a.x=cfg.arenaRadius-140;b.x=cfg.arenaRadius-44
 a.y=0;b.y=0;a.angle=0;b.angle=0;b.cargo=20
 local drops=0
 local inherited=g.drop
 function g:drop(...)
  drops=drops+1
  return inherited(self,...)
 end
 local began=false
 require('vehicle_collision').resolve=function(cars,dt,cb,stations)
  return adapt(cars,dt,function(events)
   for _,e in ipairs(events) do if e.b then began=true end end
   cb(events)
  end,stations,n)
 end
 local run,longest=0,0
 for i=1,100 do
  began=false
  local before=drops
  g:input(a,{x=1,y=0,boost=true})
  g:step(.05)
  if not began then assert(drops==before,'sustained contact must not repeat damage') end
  -- The rule's contact latch persists until distance exceeds its release gap.
  if drops>0 and g.contacts['1:2'] and drops==before then
   run=run+1;longest=math.max(longest,run)
  else
   run=0
  end
 end
 print('pinned cargo',n,drops,longest)
 assert(drops==1 and longest>=32,'contact stays latched beyond protection interval')
end
local function lifecycle()
 local created=native.new
 local observed=setmetatable({},{__mode='v'})
 local total=0
 native.new=function(...)
  local w=created(...);total=total+1;observed[total]=w;return w
 end
 local serial=0
 local manager=Rooms.new(function() serial=serial+1;return tostring(serial) end,0,json.array)
 local now=0
 for cycle=1,100 do
  local function act(fd,msg)
   manager:handle(fd,msg,now)
   manager:drain()
  end
  act(1,{type='join',name='first'})
  act(1,{type='create_room'})
  local room=manager.connections[1].room
  act(2,{type='join',name='second'})
  act(2,{type='join_room',roomId=room.id})
  act(1,{type='ready',ready=true});act(2,{type='ready',ready=true})
  assert(room.game.phase=='playing')
  now=now+.05;manager:advance(now)
  assert(room.game.players[1].omega~=nil)
  manager:disconnect(1,now);manager:disconnect(2,now)
  now=now+11;manager:advance(now)
  assert(next(manager.rooms)==nil)
 end
 collectgarbage();collectgarbage()
 assert(total==100 and next(observed)==nil,'retained room world after two collections')
 native.new=created
 print('Rooms.handle create/start/disconnect/expire 100 PASS; reachable worlds 0')
end
local function brakeAndHold(n)
 local resolve=require 'adapter'
 local stations={}
 local p=car(0,0,360);p.ix=1;p.iy=0
 local noop=function() end
 resolve({p},.05,noop,stations,n)
 local previous=p.vx
 for t=1,15 do
  p.ix=0;p.vx=0;p.vy=0
  resolve({p},.05,noop,stations,n)
  assert(p.vx>0 and p.vx<previous)
  previous=p.vx
 end
 -- A stationary overlap is a single contact episode.
 local still={car(-43,0),car(43,0)}
 local resting=native.new(still,{},1000,48);local restingEvents=0
 for t=1,100 do restingEvents=restingEvents+#move(resting,still,n) end
 assert(restingEvents==1);native.close(resting)
 local cars={car(-43,0),car(43,0)}
 local w=native.new(cars,{},1000,48);local touches=0
 for t=1,100 do
  cars[1].vx=300;cars[2].vx=-300
  touches=touches+#move(w,cars,n)
 end
 print('opposed throttle begin events',n,touches)
 assert(touches>0)
 native.close(w)
end
return function()
 for _,n in ipairs({1,3}) do physics(n);impactSpeed(n);business(n);brakeAndHold(n);dashPair(n);pinnedCargo(n) end
 lifecycle()
 local cars={car(0,0,360)};local other={car(200,0)}
 local keep=native.new(other,{},1000,48)
 for i=1,1000 do
  local w=native.new(cars,{},1000,48);local _,s=native.step(w,cars,.05,1)
  assert(math.abs(s[1][1]-18)<.01);native.close(w)
 end
 move(keep,other,1);assert(math.abs(other[1].x-200)<.001);native.close(keep)
 print('world lifecycle 1000 PASS')
 for _,n in ipairs({1,3}) do
  cars={};for i=1,8 do cars[i]=car(i*105-470,0,100) end
  local w=native.new(cars,{},1000,48);local times={}
  for i=1,11000 do
   local begin=native.now();native.step(w,cars,.05,n)
   if i>1000 then times[#times+1]=(native.now()-begin)*1e6 end
  end
  table.sort(times);print('native batch us p95 p99',n,times[9500],times[9900]);native.close(w)
  w=native.new(cars,{},1000,48);times=native.micro(w,n);table.sort(times)
  print('solver only us p95 p99',n,times[9500],times[9900]);native.close(w)
 end
end
