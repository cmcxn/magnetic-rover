package.path='./?.lua;'..package.path
local G=require 'game'
local function setup()
 local g=G.new();local a=g:join('a','A','#38bdf8');local b=g:join('b','B','#fb7185');g:start();g.batteries={};a.x=0;a.y=0;b.x=200;b.y=200;return g,a,b
end
local g,a,b=setup();g:input(a,{x=0,y=0,boost=true});g:step(.05);assert(math.abs(a.x-36)<.001 and a.y==0,'idle boost moves at triple speed along spawn heading');assert(a.cooldown>3.9)
local g,a,b=setup();g:input(a,{x=0,y=-1});g:step(.05);g:input(a,{x=0,y=0});local y=a.y;g:input(a,{x=0,y=0,boost=true,angle=0,speed=999});g:step(.05);assert(math.abs(a.y-y+36)<.001 and math.abs(a.x)<.001,'idle boost retains server heading');local cd=a.cooldown;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.cooldown<cd and math.abs(a.x)<.001,'boost locks direction and cooldown')
local g,a,b=setup();g:input(a,{x=1,y=0,boost=true});g:disconnect('a');g:step(.05);assert(a.x==0 and a.boost==0,'disconnect cancels boost');assert(not g:input(a,{x=1,y=0,boost=true}),'offline input rejected')
local g,a,b=setup();g:input(a,{x=0,y=0,boost=true});g:step(.05,.31);assert(a.x==0 and a.boost==0,'stale input cancels boost')
local g,a,b=setup();b.x=36;b.y=0;g:input(a,{x=1,y=0});g:step(.05);assert(b.stun==1 and b.x==60 and b.hitSeq==1,'empty victim pushed 24 and stunned once');assert(b.protect==1.6);g:input(b,{x=-1,y=0,boost=true});g:step(.05);assert(b.x==60 and b.boost==0 and b.ix==0,'stunned inputs discarded');g:step(0,1);g:step(.05);assert(b.x==60,'no buffered motion after recovery');g:input(b,{x=0,y=1});g:step(.05);assert(b.y==12,'fresh input works after recovery')
local g,a,b=setup();a.x=-18;a.y=31;b.x=0;b.y=0;g:input(a,{x=1,y=0,boost=true});g:input(b,{x=-1,y=0,boost=true});g:step(.05);assert(a.hitSeq==1 and b.hitSeq==1,'swept glancing collision catches missed endpoints')
local g,a,b=setup();a.x=-365;a.y=-220;b.x=-330;b.y=-220;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(b.stun==0 and b.hitSeq==0,'safe zone blocks stun and push')
local g,a,b=setup();a.x=465;a.y=0;b.x=497;b.y=0;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(b.x<=500 and b.stun==1,'knockback stays in arena')
local g,a,b=setup();b.x=36;b.y=0;g:input(a,{x=1,y=0});g:step(.05);local x=b.x;g.remaining=.01;g:step(.05);local stun=b.stun;g:step(.05);assert(b.x==x and b.stun==stun,'finished match freezes motion and stun');g:again();assert(a.angle==0 and b.stun==0 and b.hitSeq==0,'rematch resets heading and hit state')
local g,a,b=setup();a.cargo=19;for i=1,5 do g:addbattery(0,0) end;g:step(.05);assert(a.cargo==20 and #g.batteries==4,'cap twenty preserves overflow');g:step(.05);assert(#g.batteries==4,'full rover does not eat batteries');g:drop(a,2);g:step(.05);assert(a.cargo==20 and #g.batteries==4,'released capacity can refill without eating locked drops')
print('PASS boost-hit and cargo regressions')
local g,a,b=setup();for i=1,7 do g:input(a,{x=0,y=0,boost=i==1});g:step(.05) end;assert(math.abs(a.x-230.4)<.001,'idle dash integrates exactly .32 seconds, no extra tick')
local function triple(reverse)
 local g=G.new();local a=g:join('a','A','#38bdf8');local b=g:join('b','B','#fb7185');local c=g:join('c','C','#34d399');g:start();g.batteries={};a.x=-36;a.y=0;b.x=0;b.y=0;c.x=36;c.y=0;b.cargo=20
 if reverse then g.players={c,b,a} end
 g:input(a,{x=1,y=0,boost=true});g:input(c,{x=-1,y=0,boost=true});g:step(.05)
 assert(b.cargo==15 and b.hitSeq==1 and b.stun==1 and b.x==0,'opposite simultaneous hits resolve once with no arbitrary push')
end
triple(false);triple(true)
local g,a,b=setup();a.x=-430;a.y=-220;b.x=-397;b.y=-220;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(b.x < -395 and not g:station(b),'push stops outside station perimeter')
local g=G.new();local a=g:join('a','A','#38bdf8');local b=g:join('b','B','#fb7185');local c=g:join('c','C','#34d399');g:start();g.batteries={};a.x=0;a.y=0;b.x=36;b.y=0;c.x=140;c.y=0;g:input(a,{x=1,y=0});g:step(.05);assert(b.hitSeq==1 and c.hitSeq==0,'push cannot trigger chain attack');g:input(a,{x=0,y=0});g:step(.05);assert(c.hitSeq==0,'push never persists as attack velocity')
local g,a,b=setup();b.x=36;b.y=0;g:input(a,{x=1,y=0});g:step(.05);g:step(0,1.1);assert(b.stun==0 and b.protect>0,'recovery retains protective window');a.x=-100;g:input(a,{x=0,y=0});g:step(.05);a.x=b.x-36;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(b.hitSeq==1 and b.stun==0,'fresh collision cannot restun during recovery protection')
print('PASS exact dash duration, simultaneous multi-hit, station push boundary, no knockback chain, recovery protection')
local g,a,b=setup();g:input(a,{x=0,y=0,boost=true});for i=1,80 do g:step(.05) end;assert(a.cooldown==0,'cooldown ready exactly four seconds');g:input(a,{x=0,y=0,boost=true});assert(a.boost==.32,'dash accepted at four second boundary')
