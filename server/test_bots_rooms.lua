package.path='./?.lua;'..package.path
local Rooms=require 'rooms'
local serial=0
local function fixture()
 local r=Rooms.new(function()serial=serial+1;return 'bot-test-'..serial end,0)
 local function act(fd,m,t)r:handle(fd,m,t or r.now);return r:drain()end
 local function join(fd)act(fd,{type='join',name='Driver'..fd,color='#38bdf8'})end
 join(1);act(1,{type='create_room'});return r,r.connections[1].room,act,join
end
local r,room,act,join=fixture();local human=r.connections[1].player
act(1,{type='ready',ready=true});act(1,{type='add_bot'});assert(#room.game.players==2,'AI added');local bot=room.game.players[2]
assert(bot.isBot and not bot.token and bot.connected and bot.color~=human.color);assert(room.ready[bot.id] and not room.ready[human.id]);assert(room.game.phase=='lobby')
local snap=r:snapshot(room);assert(snap.botCount==1 and snap.humanCount==1 and snap.canRemoveBot and not snap.canAddBot);assert(snap.players[2].isBot)
act(1,{type='add_bot'});assert(#room.game.players==2,'idempotent add');join(3);act(3,{type='spectate',roomId=room.id});assert(#room.game.players==2)
assert(act(3,{type='remove_bot'})[1].message.type=='error');act(1,{type='remove_bot'});assert(#room.game.players==1 and r:snapshot(room).canAddBot)
act(1,{type='add_bot'});join(2);act(2,{type='join_room',roomId=room.id});assert(#room.game.players==2 and not room.game.players[2].isBot);assert(not room.ready[human.id]);assert(act(1,{type='add_bot'})[1].message.type=='error')
-- A failed join (already in another room) must leave the AI untouched.
r,room,act,join=fixture();act(1,{type='add_bot'});join(2);act(2,{type='create_room'});act(2,{type='join_room',roomId=room.id});assert(room.game.players[2].isBot)
-- Reconnection keeps the AI; a disconnected reserved human seat forbids adding.
local token=r.connections[1].token;r:disconnect(1,0);act(4,{type='join',token=token,name='Again'});assert(r.connections[4].room==room and #room.game.players==2)
act(4,{type='start'});assert(room.game.phase=='playing');assert(act(4,{type='remove_bot'})[1].message.type=='error');r:advance(101);assert(room.game.phase=='finished');act(4,{type='again'});assert(room.game.phase=='lobby' and room.ready[room.game.players[2].id] and not room.ready[room.game.players[1].id])
r:disconnect(4,102);r:advance(113);assert(not r.rooms[room.id],'AI cannot keep empty room')
r,room,act,join=fixture();join(2);act(2,{type='join_room',roomId=room.id});r:disconnect(2,0);assert(act(1,{type='add_bot'})[1].message.type=='error');assert(#room.game.players==2)
print('bot rooms: lifecycle, authority, idempotence, color, join/reconnect, rematch, cleanup passed')
