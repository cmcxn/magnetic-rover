package.path='./?.lua;'..package.path
local G=require 'game'
local function setup()
 local g=G.new();local a=g:join('a','A','#38bdf8');local b=g:join('b','B','#fb7185');g:start();g.batteries={};g.nextrefill=1e9;a.x=0;a.y=0;b.x=300;b.y=0;return g,a,b
end
local g,a=setup();g:input(a,{x=1,y=0,speed=99999});g:step(.05);assert(a.x==12,'base speed is 240 units per second, authority ignores forged speed')
local g,a=setup();a.cargo=20;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(math.abs(a.x-28.8)<1e-9,'loaded dash keeps 80% speed and 3x boost')
-- A grazing pickup is outside both endpoints even at a normal fixed 50ms tick.
local g,a=setup();g:addbattery(18,55);g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.pickupSeq==1 and #g.batteries==0,'swept dash collects grazing battery exactly once');g:step(.05);assert(a.pickupSeq==1)
local g,a=setup();g:addbattery(18,57);g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.pickupSeq==0,'sweep does not widen pickup radius')
local g,a=setup();g:addbattery(18,55,1);g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.pickupSeq==0,'sweep respects dropped battery lock')
local g,a=setup();a.x=-344;a.y=-156;a.cargo=20;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.score==20 and a.cargo==0,'grazing station pass deposits even when endpoints are outside')
local g,a,b=setup();a.x=-36;a.y=31;b.x=0;b.y=0;g:input(a,{x=1,y=0,boost=true});g:input(b,{x=-1,y=0,boost=true});g:step(.05);assert(a.hitSeq==1 and b.hitSeq==1,'double speed opposing dashes cannot tunnel through players')
local g,a=setup();a.x=499;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.x<=440 and a.x>=430 and a.y==0,'double speed dash keeps entire circle inside arena')
print('PASS doubled movement, swept pickup/station grazing, locks, radius, collision and arena bounds')
local g,a=setup();a.x=-266;a.y=-220;g:addbattery(-239,-220);g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.pickupSeq==1 and a.cargo==1,'station exit permits later same-tick pickup')
local g,a=setup();a.x=-344;a.y=-156;g:addbattery(-344,-136);g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.pickupSeq==1 and a.score==1 and a.cargo==0,'pickup preceding station entry is deposited in path order')
local g,a,b=setup();a.x=-344;a.y=-156;a.cargo=20;b.x=-200;b.y=-125;g:input(a,{x=1,y=0,boost=true});g:input(b,{x=-1,y=0,boost=true});g:step(.05);assert(a.score+a.cargo==20 and b.score+b.cargo==0 and #g.batteries==0,'station collision protects cargo while hard contact blocks intended grazing traversal')
local g,a=setup();a.x=-330;a.y=-220;a.cargo=3;g:step(0,.1);assert(a.score==0 and a.cargo==3,'zero physics step never processes deposits');g:step(.05);g:step(.05);assert(a.score==3 and a.cargo==0,'stationary station deposit occurs once')
local g,a=setup();a.x=-330;a.y=-154.99;a.cargo=3;g:step(.05);assert(a.score==0 and a.cargo==3,'stationary outside station does not deposit')
local g,a=setup();a.x=-344;a.y=-155;a.cargo=3;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.score==3,'exact tangent station contact deposits')
local g,a=setup();a.x=-344;a.y=-154.999;a.cargo=3;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.score==0,'near tangent miss remains outside')
print('PASS path ordered station entry/exit pickups, contact-time safety, stationary and tangent regressions')
-- The visible magnet range must be enforced by the server on every device.
local g,a=setup();a.cargo=13;g:addbattery(50,0);g:step(.05);assert(a.cargo==14 and a.pickupSeq==1,'battery inside visible mobile magnet circle is collected by authority')
local g,a=setup();assert(g:snapshot().pickupRadius==56,'snapshot advertises authoritative magnet radius')
g:addbattery(56,0);g:addbattery(56.001,0);g:step(.05);assert(a.cargo==1 and #g.batteries==1,'inclusive exact magnet boundary excludes outside center');g:step(.05);assert(a.pickupSeq==1,'stationary collected battery never replays')
local g,a=setup();a.cargo=19;g:addbattery(40,0);g:addbattery(50,0);g:step(.05);assert(a.cargo==20 and a.pickupSeq==1 and #g.batteries==1,'expanded magnet respects capacity20')
local g,a,b=setup();a.x=-60;b.x=60;g:addbattery(4,0);g:step(.05);assert(a.cargo+b.cargo==1 and a.pickupSeq+b.pickupSeq==1 and #g.batteries==0,'overlapping magnets award one authoritative claim only')
print('PASS unified magnet radius, snapshot, exact boundary, capacity and simultaneous single claim')
local g,a=setup();a.cargo=13;g:addbattery(15,55);g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.cargo==14 and a.pickupSeq==1,'part-loaded dash collects radius56 grazing battery with endpoints outside')
local g,a=setup();g:addbattery(18,56);g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.pickupSeq==1,'exact tangent to magnet circle collects')
local g,a=setup();g:addbattery(18,56.001);g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.pickupSeq==0,'near tangent outside magnet circle does not collect')
print('PASS loaded magnet sweep and exact tangent boundary')
