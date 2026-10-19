package.path='./?.lua;'..package.path
local G=require 'game'
local function setup()
 local g=G.new();local a=g:join('a','A','#38bdf8');local b=g:join('b','B','#fb7185');g:start();g.batteries={};g.nextrefill=1e9;a.x=0;a.y=0;b.x=300;b.y=0;return g,a,b
end
local g,a=setup();g:input(a,{x=1,y=0,speed=99999});g:step(.05);assert(a.x==12,'base speed is 240 units per second, authority ignores forged speed')
local g,a=setup();a.cargo=20;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(math.abs(a.x-28.8)<1e-9,'loaded dash keeps 80% speed and 3x boost')
-- A grazing pickup is outside both endpoints even at a normal fixed 50ms tick.
local g,a=setup();g:addbattery(18,19);g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.pickupSeq==1 and #g.batteries==0,'swept dash collects grazing battery exactly once');g:step(.05);assert(a.pickupSeq==1)
local g,a=setup();g:addbattery(18,21);g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.pickupSeq==0,'sweep does not widen pickup radius')
local g,a=setup();g:addbattery(18,19,1);g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.pickupSeq==0,'sweep respects dropped battery lock')
local g,a=setup();a.x=-344;a.y=-156;a.cargo=20;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.score==20 and a.cargo==0,'grazing station pass deposits even when endpoints are outside')
local g,a,b=setup();a.x=-36;a.y=31;b.x=0;b.y=0;g:input(a,{x=1,y=0,boost=true});g:input(b,{x=-1,y=0,boost=true});g:step(.05);assert(a.hitSeq==1 and b.hitSeq==1,'double speed opposing dashes cannot tunnel through players')
local g,a=setup();a.x=499;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.x==500 and a.y==0,'double speed dash remains inside arena')
print('PASS doubled movement, swept pickup/station grazing, locks, radius, collision and arena bounds')
local g,a=setup();a.x=-266;a.y=-220;g:addbattery(-239,-220);g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.pickupSeq==1 and a.cargo==1,'station exit permits later same-tick pickup')
local g,a=setup();a.x=-344;a.y=-156;g:addbattery(-344,-136);g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.pickupSeq==1 and a.score==1 and a.cargo==0,'pickup preceding station entry is deposited in path order')
local g,a,b=setup();a.x=-344;a.y=-156;a.cargo=20;b.x=-310;b.y=-125;g:input(a,{x=1,y=0,boost=true});g:input(b,{x=-1,y=0,boost=true});g:step(.05);assert(a.score==20 and a.stun==0 and b.stun==0,'first collision contact inside station is safe during grazing pass')
local g,a=setup();a.x=-330;a.y=-220;a.cargo=3;g:step(0,.1);assert(a.score==0 and a.cargo==3,'zero physics step never processes deposits');g:step(.05);g:step(.05);assert(a.score==3 and a.cargo==0,'stationary station deposit occurs once')
local g,a=setup();a.x=-330;a.y=-154.99;a.cargo=3;g:step(.05);assert(a.score==0 and a.cargo==3,'stationary outside station does not deposit')
local g,a=setup();a.x=-344;a.y=-155;a.cargo=3;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.score==3,'exact tangent station contact deposits')
local g,a=setup();a.x=-344;a.y=-154.999;a.cargo=3;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.score==0,'near tangent miss remains outside')
print('PASS path ordered station entry/exit pickups, contact-time safety, stationary and tangent regressions')
