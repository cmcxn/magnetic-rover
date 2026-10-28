package.path='./?.lua;'..package.path
local Game=require 'game'
local g=Game.new()
local used={}
for i=1,8 do
 local p=assert(g:join(i,'Driver '..i,'#38bdf8'))
 assert(not used[p.color],'room colors must be unique');used[p.color]=true
end
local token=g.players[1].token;local color=g.players[1].color
g:disconnect(1);assert(g:join(9,'Resume','#fb923c',token).color==color)
local Rooms=require 'rooms';local json=require 'json'
local serial=0;local r=Rooms.new(function() serial=serial+1;return 'c'..serial end,0,json.array)
local function act(fd,m) r:handle(fd,m,0);return r:drain() end
for i=1,2 do act(i,{type='join',name='Driver '..i,color='#38bdf8'}) end
act(1,{type='create_room'});local room=r.connections[1].room
act(2,{type='join_room',roomId=room.id})
local p1,p2=r.connections[1].player,r.connections[2].player
assert(p1.color~=p2.color)
assert(act(2,{type='set_color',color=p1.color})[1].message.type=='error')
act(2,{type='set_color',color='#e879f9'});assert(p2.color=='#e879f9')
assert(act(2,{type='set_color',color='invalid'})[1].message.type=='error')
act(1,{type='leave_room'});act(2,{type='set_color',color=color});assert(p2.color==color)
print('unique room colors and occupied color rejection passed')
