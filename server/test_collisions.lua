package.path='./?.lua;'..package.path
local G=require 'game'
local function setup(reverse)
 local g=G.new();local a=g:join('a','A','#38bdf8');local b=g:join('b','B','#fb7185');g:start();g.batteries={};g.nextrefill=1e9
 a.x=-60;a.y=0;b.x=60;b.y=0;a.cargo=20;b.cargo=20
 if reverse then g.players={b,a} end
 return g,a,b
end
local g,a,b=setup();g:input(a,{x=1,y=0});g:step(.05)
assert(b.cargo==20 and a.cargo==20 and #g.batteries==0,'ordinary moving impact never drops cargo');assert(a.stun>0 and b.stun>0,'ordinary both stun')
local g,a,b=setup();g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(b.cargo==15,'boost drops twenty-five percent capped at five')
local g,a,b=setup();b.cargo=1;g:input(a,{x=1,y=0});g:step(.05);assert(b.cargo==1,'small cargo preserved on ordinary collision')
local g,a,b=setup();g:input(a,{x=0,y=0,boost=true});g:step(.05);assert(b.cargo==15 and a.cooldown>0 and a.stun==0 and a.boost==0,'idle boost attacks and consumes dash into recoil')
local g,a,b=setup();g:input(a,{x=-1,y=0,boost=true});g:step(.05);assert(b.cargo==20,'separating boosted car cannot attack')
local g,a,b=setup();g:input(a,{x=1,y=0});g:input(b,{x=1,y=0});g:step(.05);assert(a.cargo==20 and b.cargo==20 and a.hitSeq==0 and b.hitSeq==0,'equal speed following is not an impact')
for _,reverse in ipairs({false,true}) do
 local g,a,b=setup(reverse);g:input(a,{x=1,y=0,boost=true});g:input(b,{x=-1,y=0,boost=true});g:step(.05)
 assert(a.cargo==15 and b.cargo==15,'head-on impacts simultaneous and join-order independent')
 local g,a,b=setup(reverse);a.x=-390;a.y=-220;b.x=-270;b.y=-220;g:input(a,{x=1,y=0,boost=true});g:step(.05)
 assert(a.score+a.cargo==20 and b.score+b.cargo==20 and #g.batteries==0,'safe zone protects cargo of either participant')
end
local function touching(g,a,b)
 a.x=-60;b.x=60;a.y=0;b.y=0;a.kx=0;a.ky=0;b.kx=0;b.ky=0
end
local g,a,b=setup();g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(b.cargo==15)
for i=1,35 do touching(g,a,b);a.boost=.2;a.bx=1;a.by=0;a.ix=1;a.last=g.time;g:step(.05);g.batteries={} end
assert(b.cargo==15,'continuous contact cannot farm cargo after protection expires')
a.x=-250;b.x=60;a.kx=0;b.kx=0;a.boost=0;g:input(a,{x=0,y=0});g:step(.05)
touching(g,a,b);a.energy=1;a.boostHeld=false;a.boost=.2;a.bx=1;a.by=0;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(b.cargo==11,'genuine separated fresh boost can hit again')
local g,a,b=setup();g:input(a,{x=1,y=0,boost=true});g:step(.05);a.x=-250;b.x=60;a.kx=0;b.kx=0;g:input(a,{x=0,y=0});g:step(.05)
touching(g,a,b);a.energy=1;a.boostHeld=false;a.boost=.2;a.bx=1;a.by=0;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(b.cargo==15,'separated return during protection does not lose cargo')
for i=1,35 do touching(g,a,b);a.boost=.2;a.bx=1;a.by=0;a.ix=1;a.last=g.time;g:step(.05);g.batteries={} end
assert(b.cargo==15,'protected recontact consumes episode until another separation')
print('PASS collision regressions: normal no-loss, boost amounts, separating/following, safe zones, simultaneous fairness, contact hysteresis and immunity')
