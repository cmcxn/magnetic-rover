package.path='./?.lua;'..package.path
local Rooms=require 'rooms';local json=require 'json'
local serial=0
local function new() return Rooms.new(function() serial=serial+1;return 'token-'..serial end,0,json.array) end
local function action(r,fd,m,t) r:handle(fd,m,t or r.now);return r:drain() end
local function join(r,fd) local out=action(r,fd,{type='join',name='Driver '..fd,color='#38bdf8'});assert(out[1].message.role=='directory');assert(out[1].message.roomId==json.null);return out[1].message.token end
local function create(r,fd) action(r,fd,{type='create_room'});return r.connections[fd].room end
local function enter(r,fd,room) action(r,fd,{type='join_room',roomId=room.id});assert(r.connections[fd].room==room) end
local r=new();local t1=join(r,1);local a=create(r,1);join(r,2);enter(r,2,a)
assert(a.game.phase=='lobby');action(r,1,{type='start'});assert(a.game.phase=='lobby')
action(r,2,{type='ready',ready=true});assert(a.game.phase=='playing');assert(a.game.remaining==100)
join(r,3);local b=create(r,3);assert(b~=a and b.id~=a.id);assert(b.game.phase=='lobby')
join(r,4);action(r,4,{type='spectate',roomId=a.id});assert(r.connections[4].role=='spectator');assert(#a.game.players==2)
for _,m in ipairs({{type='start'},{type='ready',ready=true},{type='input',x=1,y=0},{type='again'}}) do assert(action(r,4,m)[1].message.type=='error') end
local before=a.game.players[1].x;action(r,3,{type='input',x=1,y=0});assert(a.game.players[1].x==before)
r:disconnect(1,1);assert(not a.ready['1']);local out=action(r,5,{type='join',token=t1,name='Other'});assert(out[1].message.role=='player');assert(out[1].message.token==t1);assert(r.connections[5].room==a)
assert(action(r,6,{type='join',token=t1,name='Other'})[1].message.type=='error')
action(r,5,{type='leave_room'});assert(r.connections[5].role=='directory');enter(r,5,b);assert(r.connections[5].token==t1);assert(r.connections[5].player.token==t1)
action(r,3,{type='ready',ready=true});action(r,5,{type='ready',ready=false});assert(b.game.phase=='lobby')
r:disconnect(5,2);r:advance(13);action(r,3,{type='ready',ready=true});assert(b.game.phase=='lobby')
action(r,5,{type='join',token=t1,name='Ignored'},13);assert(r.connections[5].room==b);assert(not b.ready[r.connections[5].player.id]);local replacement=r.connections[5].player;r:disconnect(5,13);action(r,7,{type='join',token=t1,name='Ignored'},13);assert(r.connections[7].player==replacement and #b.game.players==2);action(r,7,{type='ready',ready=true});assert(b.game.phase=='playing')
r:advance(114);assert(b.game.phase=='finished');r:advance(125);assert(b.game.phase=='lobby');assert(next(b.ready)==nil)
local clean=new();local tok=join(clean,1);local room=create(clean,1);clean:disconnect(1,0);clean:advance(9);assert(clean.rooms[room.id]);clean:advance(10);assert(not clean.rooms[room.id]);assert(action(clean,2,{type='join',token=tok,name='Ignored'})[1].message.role=='directory')
local cap=new();join(cap,1);local full=create(cap,1)
for fd=2,8 do join(cap,fd);enter(cap,fd,full) end
join(cap,9);assert(action(cap,9,{type='join_room',roomId=full.id})[1].message.type=='error')
for fd=10,25 do join(cap,fd);action(cap,fd,{type='spectate',roomId=full.id});assert(cap.connections[fd].role=='spectator') end
join(cap,26);assert(action(cap,26,{type='spectate',roomId=full.id})[1].message.type=='error');assert(#full.game.players==8)
for fd=30,60 do join(cap,fd);create(cap,fd) end
join(cap,61);assert(action(cap,61,{type='create_room'})[1].message.type=='error')
local ready=new();join(ready,1);local trio=create(ready,1);for fd=2,3 do join(ready,fd);enter(ready,fd,trio) end
action(ready,1,{type='ready',ready=true});action(ready,2,{type='ready',ready=true});action(ready,3,{type='leave_room'});ready:advance(.05);assert(trio.game.phase=='playing')
print('room directory, isolation, readiness, spectator caps, stable token, cleanup: ok')
