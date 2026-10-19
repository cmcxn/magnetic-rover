package.path='./?.lua;'..package.path
local G=require 'game'
math.randomseed(20261019)
local function setup()
 local g=G.new();g:join('a','A','#38bdf8');g:join('b','B','#fb7185');assert(g:start());return g
end
local function bounds(g,first,lo,hi)
 for i=first,#g.batteries do local b=g.batteries[i];local r=math.sqrt(b.x*b.x+b.y*b.y)
  assert(r>=lo-1e-8 and r<=hi+1e-8,'new batteries belong to current annulus')
  assert(not g:station(b),'no natural battery inside station')
 end
end
local g=setup();assert(g.remaining==100,'round lasts 100 seconds')
assert(#g.batteries==36,'only 36 batteries initially');bounds(g,1,320,470)
local first=g.batteries[1];local x,y=first.x,first.y
g:step(0,9);assert(#g.batteries==36,'no refill before ten seconds')
g:step(0,1);assert(#g.batteries==42,'refill adds at most six');bounds(g,37,320-260/9,470-260/9)
g:step(0,10);assert(#g.batteries==42,'natural ground cap is 42')
assert(first.x==x and first.y==y,'existing batteries never move inward')
local p=g.players[1];p.x=0;p.y=0;p.cargo=20;g:drop(p,20)
assert(#g.batteries==62,'drops are never trimmed to natural cap')
for _=1,6 do table.remove(g.batteries,1) end
g:step(0,10);assert(#g.batteries==62,'drops do not consume natural spawn allowance');bounds(g,57,320-260/3,470-260/3)
local count=0;for _,b in ipairs(g.batteries) do if b.source=='drop' then count=count+1 end end
assert(count==20,'all collision drops retained')
g.batteries={};g:step(0,30);assert(#g.batteries==6,'stall adds one batch, never bursts missed refills');bounds(g,1,320-520/3,470-520/3)
g.batteries={};g:step(0,20);assert(#g.batteries==6);bounds(g,1,320-2080/9,470-2080/9)
g.batteries={};g:step(0,10);assert(#g.batteries==0,'no refill at ten seconds remaining')
g:step(0,9);assert(#g.batteries==0 and g.phase=='playing','no refill in final ten seconds')
g:step(0,1);assert(g.phase=='finished' and g.remaining==0,'finish at 100 seconds')
assert(g:again());assert(g.remaining==100 and #g.batteries==0,'reset duration and resources')
assert(g:start());assert(#g.batteries==36 and g.remaining==100);bounds(g,1,320,470)
g:step(0,9);assert(#g.batteries==36,'rematch resets refill deadline');g:step(0,1);assert(#g.batteries==42)
print('PASS resources: 100s round/reset, 36 initial, six per 10s, natural cap 42, drops retained, shrinking annulus, station exclusion, no final-ten-second refill, no catch-up bursts')
