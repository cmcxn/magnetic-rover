package.path='./?.lua;'..package.path
local G=require 'game'
local function setup()
 local g=G.new();local a=g:join('a','A','#38bdf8');local b=g:join('b','B','#fb7185');g:start();g.batteries={};g.nextrefill=1e9;a.x=0;a.y=0;b.x=200;b.y=200;return g,a,b
end
local g,a,b=setup();g:input(a,{x=0,y=0,boost=true});g:step(.05);assert(math.abs(a.x-36)<.001 and a.y==0,'idle boost triple speed along spawn heading');assert(a.cooldown>3.9)
local g,a,b=setup();g:input(a,{x=0,y=-1});g:step(.05);g:input(a,{x=0,y=0});local y=a.y;g:input(a,{x=0,y=0,boost=true,angle=0,speed=999});g:step(.05);assert(math.abs(a.y-y+36)<.001 and math.abs(a.x)<.001,'idle boost retains server heading');local cd=a.cooldown;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(a.cooldown<cd and math.abs(a.x)<.001,'boost locks direction and cooldown')
local g,a,b=setup();g:input(a,{x=1,y=0,boost=true});g:disconnect('a');g:step(.05);assert(a.x==0 and a.boost==0,'disconnect cancels boost');assert(not g:input(a,{x=1,y=0,boost=true}),'offline input rejected')
local g,a,b=setup();g:input(a,{x=0,y=0,boost=true});g:step(.05,.31);assert(a.x==0 and a.boost==0,'stale input cancels boost')
local g,a,b=setup();b.x=120;b.y=0;g:input(a,{x=1,y=0});g:step(.05);assert(b.stun>0 and b.x>120 and b.hitSeq==1 and a.stun>0,'empty ordinary target moves with impulse and both stun once');assert(b.protect==1.6)
local x=b.x;g:input(b,{x=-1,y=0,boost=true});g:step(.05);assert(b.x>x and b.boost==0 and b.ix==0,'stunned input discarded but knockback keeps moving')
g:step(0,1);g:step(.05);assert(b.ix==0 and b.boost==0,'no buffered driving after recovery');g:input(b,{x=0,y=1});g:step(.05);assert(b.y>0,'fresh input after recovery')
local g,a,b=setup();a.x=-65;a.y=31;b.x=65;b.y=0;g:input(a,{x=1,y=0,boost=true});g:input(b,{x=-1,y=0,boost=true});g:step(.05);assert(a.hitSeq==1 and b.hitSeq==1,'swept angled frontal collision catches double boost')
local g,a,b=setup();a.x=-330;a.y=-220;b.x=-210;b.y=-220;g:input(a,{x=1,y=0});g:step(.05);assert(b.stun>0 and b.hitSeq==1 and a.stun>0,'safe zone preserves cargo but no longer suppresses normal stun')
local g,a,b=setup();a.x=310;a.y=0;b.x=440;b.y=0;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(b.x<=440 and b.stun>0 and b.x-a.x>=120-1e-5,'whole knockback circle stays in arena and solid')
local g,a,b=setup();b.x=120;b.y=0;g:input(a,{x=1,y=0});g:step(.05);local x=b.x;g.remaining=.01;g:step(.05);local stun=b.stun;g:step(.05);assert(b.x==x and b.stun==stun,'finished freezes motion/stun');g:again();assert(a.angle==0 and b.stun==0 and b.hitSeq==0 and b.kx==0,'rematch resets heading hit state and impulse')
local g,a,b=setup();a.cargo=19;for i=1,5 do g:addbattery(0,0) end;g:step(.05);assert(a.cargo==20 and #g.batteries==4,'cap twenty preserves overflow');g:step(.05);assert(#g.batteries==4,'full rover does not eat batteries');g:drop(a,2);g:step(.05);assert(a.cargo==20 and #g.batteries==4,'released capacity refills without eating locked drops')
local g,a,b=setup();for i=1,7 do g:input(a,{x=0,y=0,boost=i==1});g:step(.05) end;assert(math.abs(a.x-230.4)<.001,'idle dash integrates exactly .32 seconds')
local function triple(reverse)
 local g=G.new();local a=g:join('a','A','#38bdf8');local b=g:join('b','B','#fb7185');local c=g:join('c','C','#34d399');g:start();g.batteries={};a.x=-130;a.y=0;b.x=0;b.y=0;c.x=130;c.y=0;b.cargo=20
 if reverse then g.players={c,b,a} end
 g:input(a,{x=1,y=0,boost=true});g:input(c,{x=-1,y=0,boost=true});g:step(.05)
 assert(b.cargo==15 and b.hitSeq==1 and b.stun==1 and math.abs(b.x)<1e-6,'opposite simultaneous hits resolve once with canceling impulses')
end
triple(false);triple(true)
-- Recoil may enter a safe station physically, but cannot earn another boosted attack.
local g,a,b=setup();a.x=-180;a.y=-220;b.x=-300;b.y=-220;g:input(a,{x=-1,y=0,boost=true});g:step(.05);assert(#g.batteries==0,'station-safe knockback cannot drop cargo')
local g=G.new();local a=g:join('a','A','#38bdf8');local b=g:join('b','B','#fb7185');local c=g:join('c','C','#34d399');g:start();g.batteries={};a.x=-130;a.y=0;b.x=0;b.y=0;c.x=140;c.y=0;c.cargo=20;g:input(a,{x=1,y=0,boost=true});g:step(.05);for i=1,8 do g:step(.05) end;assert(c.cargo==20,'knockback cannot trigger chain boosted cargo theft')
local g,a,b=setup();b.x=120;b.y=0;g:input(a,{x=1,y=0});g:step(.05);g:step(0,.8);assert(b.stun==0 and b.protect>0,'recovery retains protective window');a.x=-200;b.x=100;a.kx=0;b.kx=0;g:input(a,{x=0,y=0});g:step(.05);a.x=b.x-120;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(b.hitSeq==1 and b.stun==0,'fresh collision cannot restun during recovery protection')
local g,a,b=setup();g:input(a,{x=0,y=0,boost=true});for i=1,80 do g:step(.05) end;assert(a.cooldown==0,'cooldown exactly four seconds');g:input(a,{x=0,y=0,boost=true});assert(a.boost==.32,'dash accepted at boundary')
print('PASS boost-hit: idle direction, exact dash, stale/disconnected input, moving stun, immunity, walls, simultaneous multi-hit, no boosted chain, rematch, capacity and cooldown')
