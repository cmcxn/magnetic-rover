-- Run from repo root: lua tests/network_fixture.lua [seed] [normal|dense] [fine|conservative] [optional stats.json]
-- JSONL rows: raw complete state (oracle), product encoder output or null, time, inputs.
package.path='./server/?.lua;'..package.path
local R=require 'rooms';local C=require 'state_codec';local J=require 'json'
local seed=tonumber(arg[1]) or 20261030;local scenario=arg[2] or 'normal';local profile=arg[3] or 'fine'
math.randomseed(seed)
local n=0;local r=R.new(function() n=n+1;return 'fixture-'..n end,0,J.array)
for i=1,8 do r:handle(i,{type='join',name='Player'..i},0);r:handle(i,i==1 and {type='create_room'} or {type='join_room',roomId='000001'},0) end
for i=1,8 do r:handle(i,{type='ready',ready=true},0) end
r:drain()
local room=r.rooms['000001'];local e=C.new({epochPrefix='fixture-'..seed,profile=profile})
local targets={}
local began=os.clock();local peakKiB=collectgarbage("count")
local function emit(now,inputs)
 local s=r:snapshot(room);local before=J.encode(s);local m=e:publish(s,now)
 assert(J.encode(s)==before,'encoder mutated oracle')
 peakKiB=math.max(peakKiB,collectgarbage("count"))
 print(J.encode({time=now,raw=s,rawJsonBytes=#before,wireJsonBytes=m and #J.encode(m) or 0,message=m or J.null,inputs=inputs or J.array()}))
end
emit(0)
local pendingInputs=J.array()
for tick=1,2600 do
 local now=tick*.05;local inputs=J.array()
 if tick<=2000 then
  for i,p in ipairs(room.game.players) do
   local t=targets[i]
   if not t or now>=t.untilTime or (p.x-t.x)^2+(p.y-t.y)^2<1600 then
    local a=math.random()*math.pi*2;local radius=math.sqrt(math.random())*850
    t={x=math.cos(a)*radius,y=math.sin(a)*radius,untilTime=now+2+math.random()*4};targets[i]=t
   end
   local dx,dy=t.x-p.x,t.y-p.y;local d=math.sqrt(dx*dx+dy*dy)
   local input={type='input',x=dx/math.max(1,d),y=dy/math.max(1,d),boost=(now+i*.31)%4<.15,seq=tick}
   inputs[#inputs+1]=input;r:handle(i,input,now)
  end
  if scenario=='dense' and tick%60==0 then
   for _,p in ipairs(room.game.players) do p.cargo=20;room.game:drop(p,20,1,0) end
  end
 else r:advance(now) end
 if tick<=2000 then pendingInputs[#pendingInputs+1]={time=now,players=inputs} end
 if tick%2==0 then emit(now,pendingInputs);pendingInputs=J.array() end
 r:drain()
end

if arg[4] then
 local f=assert(io.open(arg[4],'w'));f:write(J.encode({cpuSeconds=os.clock()-began,peakLuaKiB=peakKiB,encoder=e:getStats(),note='whole fixture simulation + both JSON encodings + file IO; not server capacity benchmark'}));f:close()
end
