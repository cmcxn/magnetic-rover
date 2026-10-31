package.path='./?.lua;'..package.path
local C=require 'state_codec';local J=require 'json';local G=require 'game'
assert(C.round(-1.5)==-2 and C.round(1.5)==2 and C.round(-0.1)==0)
local g=G.new();g:join(1,'A','#38bdf8');g:join(2,'B','#fb7185')
local raw=g:snapshot(J.array);raw.roomId='000001';local original=J.encode(raw)
local e=C.new({epochPrefix='test'});local a=e:publish(raw,0)
assert(a.seq==0 and a.metadata and a.type=='state_full')
assert(J.encode(raw)==original,'projection mutated Game snapshot')
for i=1,9 do local s=g:snapshot(J.array);s.roomId=raw.roomId;s.serverTime=i/10;assert(e:publish(s,i/10)==nil);assert(e.seq==0) end
local s=g:snapshot(J.array);s.roomId=raw.roomId;s.serverTime=1
local hb=e:publish(s,1);assert(hb.type=='state_heartbeat' and hb.seq==1 and hb.baseSeq==0)
local f=e:full('resync');assert(f.seq==1 and f.frame.serverTime==1)
s.players[1].name='New';local d=e:publish(s,1.1)
assert(d.type=='state_delta' and d.metadata and d.baseSeq==1)
g:start();s=g:snapshot(J.array);s.roomId=raw.roomId
local started=e:publish(s,1.2);assert(started.seq==0 and started.epoch~=a.epoch)
s.batteries[1].x=s.batteries[1].x+1
local delta=e:publish(s,1.3);assert(#delta.batteryUpserts==1)
s.batteries={};local delta=e:publish(s,1.4);assert(#delta.batteryRemoves>0)
local seq=e.seq;local full=e:full('reconnect');assert(e.seq==seq and full.seq==seq)
assert(J.decode(J.encode(delta)).batteryUpserts[1]==nil)
print('PASS codec: pure DTO, rounding, heartbeat throttling, canonical recovery, metadata, epochs, upsert/remove')

local tiny=g:snapshot(J.array);tiny.roomId='tiny'
tiny.players[1].stun=1e-17;tiny.players[1].boost=1e-17;tiny.players[1].energy=1e-17
local projected=C.project(tiny,'fine')
assert(projected.players[1].stun==1 and projected.players[1].boost==1 and projected.players[1].energy==1,'positive predicates survive quantization')
assert(tiny.players[1].stun==1e-17,'authority tail unchanged')
local saved=e:full('resync')
local x=saved.players[1].x
s.players[1].x=999
assert(e:full('resync').players[1].x==x,'full must only read committed canonical state')
local fresh=g:snapshot(J.array);fresh.roomId='tiny'
fresh.batteries=J.array({{id='loot',x=20,y=30,source='drop',unlock=0,z=0,vx=1,vy=2}})
local enc=C.new();enc:publish(fresh,0)
fresh.batteries[1].x=21;fresh.batteries[1].vx=nil;fresh.batteries[1].vy=nil
local moved=enc:publish(fresh,.1)
assert(#moved.batteryUpserts==1 and moved.batteryUpserts[1].vx==nil,'settled loot movement sends full replacement')
fresh.players[2]=nil
local names=enc:publish(fresh,.2)
assert(names.metadata and names.metadata.profiles['2']==nil,'removed profile must not persist')

local epoch=enc.epoch;enc.profile='conservative'
local changed=enc:publish(fresh,.3)
assert(changed.type=='state_full' and changed.seq==0 and changed.epoch~=epoch,'profile change starts a new epoch')
