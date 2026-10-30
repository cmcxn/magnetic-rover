package.path='./?.lua;'..package.path
local Rooms=require 'rooms';local json=require 'json';local serial=0
local r=Rooms.new(function() serial=serial+1;return 'rt-'..serial end,0,json.array)
local function act(fd,m,t) r:handle(fd,m,t or r.now);return r:drain() end
local function join(fd) act(fd,{type='join',name='Driver'..fd,color='#38bdf8'}) end
join(1);act(1,{type='create_room'});local room=r.connections[1].room
r:advance(120);assert(r.connections[1].room==room,'solo never expires')
act(1,{type='add_bot'});r:advance(240);assert(r.connections[1].room==room,'AI does not activate timeout')
join(2);act(2,{type='join_room',roomId=room.id});assert(r:snapshot(room).players[1].readyIn==60,'second human starts timer')
r:advance(290);local out=r:drain();local warnings=0;for _,e in ipairs(out) do if e.message.code=='ready_warning' then warnings=warnings+1 end end;assert(warnings==2,'both warned at ten')
r:advance(290.1);assert(#r:drain()==0,'no repeated warning in same second')
local token=r.connections[2].token;r:disconnect(2,291);act(3,{type='join',token=token},292);assert(r:snapshot(room).players[2].readyIn==8,'reconnect keeps deadline')
act(1,{type='ready',ready=true},293);r:advance(300);out=r:drain();assert(r.connections[3].role=='directory','unready removed');assert(r.connections[1].room==room,'ready remains');assert(#room.game.players==1,'seat freed')
local welcome=false;for _,e in ipairs(out) do if e.fd==3 and e.message.type=='welcome' and e.message.role=='directory' and e.message.roomId==json.null then welcome=true end end;assert(welcome,'legacy welcome clears room')
act(1,{type='ready',ready=false});r:advance(400);assert(r.connections[1].room==room,'solo cancels timer')
join(4);act(4,{type='join_room',roomId=room.id});assert(r:snapshot(room).players[1].readyIn==60)
r:advance(460);assert(r.connections[1].role=='directory' and r.connections[4].role=='directory','simultaneous expirations both removed')
print('ready timeout, solo/AI, reconnect, warning and old-protocol departure: ok')
