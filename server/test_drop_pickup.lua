package.path='./?.lua;'..package.path
local G=require 'game'
local c=require 'game_config'
local function setup()
 local g=G.new()
 local p=g:join(1,'Collector','#38bdf8')
 local other=g:join(2,'Other','#fb7185')
 g:start();g.batteries={};g.nextrefill=1e9
 p.x=0;p.y=0;other.x=-200;other.y=-200
 return g,p
end
local function drop(g,x,y,unlock)
 local b=assert(g:addbattery(x,y,unlock or 0,'drop'))
 b.z=0;b.vz=0;b.vx=0;b.vy=0
 return b
end
-- Reproduce an unlocked dropped unit being pushed just beyond pickup reach.
local g,p=setup()
drop(g,c.collisionRadius+5,0)
g:step(.05)
assert(p.cargo==1 and #g.batteries==0,'contact with settled drop must collect at scale '..c.vehicleScale)
-- Loot outside the contracted supply circle is still collectible at the wall.
local g,p=setup()
local theta=math.pi/4
local distance=c.arenaRadius-c.collisionRadius-11
p.x=math.cos(theta)*distance;p.y=math.sin(theta)*distance
drop(g,math.cos(theta)*(c.arenaRadius-11),math.sin(theta)*(c.arenaRadius-11))
g.remaining=20;g:step(.05)
assert(p.cargo==1,'wall-side drop outside supply circle remains collectible')
-- Locked/airborne loot and full cars must not bypass pickup rules.
local g,p=setup();drop(g,c.collisionRadius+5,0,g.time+1)
g:step(.05);assert(p.cargo==0 and #g.batteries==1)
local g,p=setup();local b=drop(g,c.collisionRadius+5,0);b.z=50
g:step(.05);assert(p.cargo==0 and #g.batteries==1)
local g,p=setup();p.cargo=20;drop(g,c.collisionRadius+5,0)
g:step(.05);assert(p.cargo==20 and #g.batteries==1)
-- Real AI steering must finish the chase, including beyond the last supply ring.
local g,p=setup();p.isBot=true
p.x=c.arenaRadius*.7;p.y=0
drop(g,p.x+c.collisionRadius+20,0)
g.remaining=20
for i=1,100 do g:step(.05) if p.pickupSeq>0 then break end end
assert(p.pickupSeq==1,'AI must collect the chased dropped unit')
print('PASS dropped loot: scaled contact, wall, supply ring, locks, height, capacity, AI',c.vehicleScale)
