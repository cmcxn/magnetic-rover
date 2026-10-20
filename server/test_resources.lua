package.path='./?.lua;'..package.path
local G=require 'game'
math.randomseed(20261019)
local function setup()
 local g=G.new();g:join('a','A','#38bdf8');g:join('b','B','#fb7185');assert(g:start());return g
end
local function bounds(g,lo,hi)
 for _,b in ipairs(g.batteries) do if b.source~='drop' then
  local r=math.sqrt(b.x*b.x+b.y*b.y)
  assert(r>=lo-1e-8 and r<=hi+1e-8,'natural batteries belong to current supply zone')
  assert(not g:station(b),'no natural battery inside station')
 end end
end
local g=setup();assert(g.remaining==100 and #g.batteries==36)
assert(g:snapshot().supply and g:snapshot().supply.stage==1,'snapshot advertises authoritative supply stage')
bounds(g,260,470)
g:step(0,10);assert(#g.batteries==42,'refill and natural cap')
g:step(0,10);assert(#g.batteries==42)
local s=g:snapshot().supply;assert(s.secondsToShrink==5 and s.nextOuterRadius==340)
local ids={};for _,b in ipairs(g.batteries) do ids[b.id]={unlock=b.unlock} end
local drop=g:addbattery(450,0,999,'drop');local dx,dy=drop.x,drop.y
g:step(0,4.999);assert(g:snapshot().supply.stage==1)
g:step(0,.001);assert(g:snapshot().supply.stage==2);bounds(g,0,340)
assert(#g.batteries==43,'full cap cannot prevent contraction; no count inflation')
for _,b in ipairs(g.batteries) do if b.source~='drop' then assert(ids[b.id] and ids[b.id].unlock==b.unlock,'migration conserves IDs and unlock') end end
assert(drop.x==dx and drop.y==dy and drop.unlock==999,'collision loot untouched')
local positions={};for _,b in ipairs(g.batteries) do positions[b.id]={b.x,b.y} end
g:step(0,.1);for _,b in ipairs(g.batteries) do assert(b.x==positions[b.id][1] and b.y==positions[b.id][2],'migration runs once') end
g:step(0,24.9,50);assert(g:snapshot().supply.stage==3);bounds(g,0,230)
g:step(0,25,25);assert(g:snapshot().supply.stage==4);bounds(g,0,140)
assert(drop.x==dx and drop.y==dy and #g.batteries==43)
local p=g.players[1];local token=p.token;g:disconnect('a');assert(g:join('reconnected','A','#38bdf8',token));assert(g:snapshot().supply.stage==4,'reconnect sees current stage')
g.batteries={};g:step(0,10,15);assert(#g.batteries==6);bounds(g,0,140)
g.batteries={};g:step(0,5,10);assert(#g.batteries==0 and g:snapshot().supply.banking,'no final-ten-second refill')
g:step(0,10,0);assert(g.phase=='finished' and g.remaining==0)
assert(g:again());assert(g.remaining==100 and #g.batteries==0 and g:snapshot().supply==nil)
assert(g:start());assert(g:snapshot().supply.stage==1);bounds(g,260,470)
local stalled=setup();stalled.batteries={};stalled:step(0,80)
assert(#stalled.batteries==6 and stalled:snapshot().supply.stage==4,'stall advances directly, never bursts refills');bounds(stalled,0,140)
print('PASS resources: staged contraction, warnings, full-cap migration, identity/count conservation, drops retained, reconnect/reset, final banking, no catch-up bursts')
