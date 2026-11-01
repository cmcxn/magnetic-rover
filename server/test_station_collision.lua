local config=require 'game_config'
local C=require 'vehicle_collision'
local G=require 'game'
local g=G.new();local s=g.stations[1]
assert(s.bodyRadius and s.serviceRadius,'stations need solid footprint and reachable service range')
s.x=0;s.y=0;g.stations={s}
local p={id='1',x=s.x-180,y=s.y,vx=10000,vy=0}
C.resolve({p},.1,nil,g.stations)
assert(p.x<=s.x-s.bodyRadius-config.collisionRadius+.001,'boost must not tunnel through station')
assert(g:station(p),'touching outside wall must allow deposit')
local q={id='2',x=s.x,y=s.y,vx=0,vy=0}
C.resolve({q},.1,nil,g.stations)
assert((q.x-s.x)^2+(q.y-s.y)^2>=(s.bodyRadius+config.collisionRadius)^2-.001,'embedded spawn must be projected out')
print('PASS solid station sweep, recovery and reachable deposit')

local a=g:join(1,'A','#38bdf8');local b=g:join(2,'B','#fb7185');assert(g:start())
g.batteries={};g.nextrefill=1e9;a.x=-180;a.y=0;a.cargo=20;b.x=300;b.y=200
g:input(a,{x=1,y=0,boost=true})
for i=1,20 do g:step(.05);assert(a.x<=-s.bodyRadius-config.collisionRadius+.001,'live game station collision');g:input(a,{x=1,y=0}) end
assert(a.cargo==0 and a.score==20,'deposit at exterior exactly once')
local slider={id='3',x=-s.bodyRadius-config.collisionRadius,y=0,vx=100,vy=80}
C.resolve({slider},.2,nil,{s});assert(slider.y>10,'solid station must preserve tangent motion')
print('PASS live station exterior deposit, repeated drive and tangent sliding')
