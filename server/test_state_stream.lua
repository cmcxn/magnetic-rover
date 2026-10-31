package.path='./?.lua;'..package.path
local R=require 'rooms';local J=require 'json'
local serial=0
local r=R.new(function() serial=serial+1;return 'stream-'..serial end,0,J.array,{epochPrefix='stream'})
r:handle(1,{type='join',name='V2',protocolVersion=2},0)
r:handle(1,{type='create_room'},0)
local events=r:drain();local first
for _,e in ipairs(events) do if e.message.type=='state_full' then first=e.message end end
assert(first and first.seq==0)
r:handle(2,{type='join',name='Legacy'},.01)
r:handle(2,{type='join_room',roomId='000001'},.01);r:drain()
r:handle(3,{type='join',name='Viewer',protocolVersion=2},.02)
r:handle(3,{type='spectate',roomId='000001'},.02)
local events=r:drain();local viewer
for _,e in ipairs(events) do if e.fd==3 and e.message.type=='state_full' then viewer=e.message end end
assert(viewer and viewer.players[2].id=='2')
local room=r.rooms['000001'];local epoch=room.encoder.epoch
local previousSeq=room.encoder.seq
r:handle(3,{type='request_full'},.03)
assert(room.encoder.seq==previousSeq,'resync must not publish or advance shared baseline')
local seq=room.encoder.seq
local events=r:drain();assert(events[#events].message.cause=='resync')
for i=1,5 do r:handle(3,{type='request_full'},.04+i*.001) end
assert(#r:drain()==0 and room.encoder.seq==seq)
r:disconnect(1,.05);r:handle(4,{type='join',token=r.connections[2].token,name='No'},.05) -- live-token rejection
r:drain();r:broadcastStates()
local legacy=false
for _,e in ipairs(r:drain()) do if e.fd==2 and e.message.type=='state' then legacy=true end end
assert(legacy and room.encoder.epoch==epoch,'v1 broadcasts independent of v2 throttle/reconnect')
print('PASS stream mixed protocols, viewer resync/rate limit, canonical join, stable room epoch')
local n=0
local shared=R.new(function() n=n+1;return 'shared-'..n end,0,J.array)
for i=1,8 do
 shared:handle(i,{type='join',name='V2-'..i,protocolVersion=2},0)
 shared:handle(i,i==1 and {type='create_room'} or {type='join_room',roomId='000001'},0)
end
shared:handle(9,{type='join',name='Old'},0);shared:handle(9,{type='spectate',roomId='000001'},0)
for i=1,8 do shared:handle(i,{type='ready',ready=true},0) end
shared:drain()
local encode=J.encode;local calls=0
J.encode=function(...) calls=calls+1;return encode(...) end
shared:broadcastStates()
J.encode=encode
assert(calls==2,'exactly one encoding per room/protocol group')
local payload,recipients
recipients=0
for _,event in ipairs(shared:drain()) do if event.fd~=9 then
 recipients=recipients+1;payload=payload or event.encoded;assert(payload==event.encoded)
end end
assert(recipients==8,'one encoding still sends eight receiver copies')
print('PASS shared encoding: 8 v2 + 1 v1 recipients, two JSON encodings')
