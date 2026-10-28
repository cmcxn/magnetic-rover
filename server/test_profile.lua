package.path='./?.lua;'..package.path
local Rooms=require 'rooms';local json=require 'json'
local serial=0;local r=Rooms.new(function() serial=serial+1;return 'profile-'..serial end,0,json.array)
local function act(fd,m) r:handle(fd,m,0);return r:drain() end
for fd=1,2 do act(fd,{type='join',name='Old '..fd,color='#38bdf8'}) end
act(1,{type='create_room'});local room=r.connections[1].room
act(2,{type='join_room',roomId=room.id})
local s=r.connections[2]
assert(s.color=='#38bdf8','automatic allocation must preserve preferred color')
act(2,{type='leave_room'});act(1,{type='set_color',color='#34d399'})
act(2,{type='join_room',roomId=room.id})
assert(s.player.color=='#38bdf8','return to saved preference when it becomes free')
local result=act(2,{type='set_name',name='  新车手  '})
assert(s.name=='新车手' and s.player.name=='新车手','rename updates session and room')
assert(result[1].message.type=='profile' and result[1].message.name=='新车手')
assert(act(2,{type='set_name',name='   '})[1].message.type=='error')
assert(s.name=='新车手','invalid rename must preserve profile')
local ack=act(2,{type='set_color',color='#e879f9'})[1].message
assert(ack.type=='profile' and ack.color=='#e879f9')
act(2,{type='leave_room'});act(2,{type='join_room',roomId=room.id})
assert(s.player.color=='#e879f9' and s.player.name=='新车手')
act(2,{type='leave_room'});act(2,{type='set_name',name='大厅改名'});assert(s.name=='大厅改名')
act(2,{type='join_room',roomId=room.id});act(1,{type='ready',ready=true});act(2,{type='ready',ready=true})
assert(room.game.phase=='playing');assert(act(2,{type='set_name',name='比赛中'})[1].message.type=='error')
print('profile: preferred fallback, rename validation, acknowledged color and reentry passed')
local directory=Rooms.new(function() serial=serial+1;return 'profile-'..serial end,0,json.array)
directory:handle(10,{type='join',name='Old',color='#38bdf8'},0);directory:drain()
local token=directory.connections[10].token;directory:disconnect(10,0)
directory:handle(11,{type='join',token=token,name='Saved new name',color='#e879f9'},0)
assert(directory.connections[11].name=='Saved new name','saved login name applies on resumed directory session')
assert(directory.connections[11].color=='#e879f9','saved preferred color applies on resumed directory session')
