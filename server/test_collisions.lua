package.path='./?.lua;'..package.path
local G=require 'game'
local function setup(reverse)
 local g=G.new();local a=g:join('a','A','#38bdf8');local b=g:join('b','B','#fb7185');g:start();g.batteries={};g.nextrefill=1e9
 a.x=0;a.y=0;b.x=36;b.y=0;a.cargo=20;b.cargo=20
 if reverse then g.players={b,a} end
 return g,a,b
end
local g,a,b=setup();g:input(a,{x=1,y=0});g:step(.05)
assert(b.cargo==18,'ordinary moving impact drops ten percent capped at two');assert(a.cargo==20,'stationary victim cannot attack')
local g,a,b=setup();g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(b.cargo==15,'boost drops twenty-five percent capped at five')
local g,a,b=setup();b.cargo=1;g:input(a,{x=1,y=0});g:step(.05);assert(b.cargo==0,'small cargo loses one')
local g,a,b=setup();b.x=20;g:input(a,{x=0,y=0,boost=true});g:step(.05);assert(b.cargo==20 and a.cooldown==0 and a.boost==0,'stationary boost neither spends cooldown nor attacks')
local g,a,b=setup();b.x=20;g:input(a,{x=-1,y=0,boost=true});g:step(.05);assert(b.cargo==20,'separating boosted car cannot attack')
local g,a,b=setup();g:input(a,{x=1,y=0});g:input(b,{x=1,y=0});g:step(.05);assert(a.cargo==20 and b.cargo==20,'equal speed following is not an impact')
for _,reverse in ipairs({false,true}) do
 local g,a,b=setup(reverse);a.x=-20;b.x=20;g:input(a,{x=1,y=0,boost=true});g:input(b,{x=-1,y=0,boost=true});g:step(.05)
 assert(a.cargo==15 and b.cargo==15,'head-on impacts are simultaneous and join-order independent')
 local g,a,b=setup(reverse);a.x=-365;a.y=-220;b.x=-330;b.y=-220;g:input(a,{x=1,y=0,boost=true});g:step(.05)
 assert(a.score==20 and b.score==20,'safe zone protects either participant')
end
local g,a,b=setup();g:input(a,{x=1,y=0});g:step(.05);assert(b.cargo==18)
-- Repeated forward pressure while still touching must not become a new collision.
for i=1,30 do a.x=0;b.x=31;g:input(a,{x=1,y=0});g:step(.05);g.batteries={} end
assert(b.cargo==18,'continuous contact never farms cargo after protection expires')
a.x=-50;b.x=31;g:input(a,{x=0,y=0});g:step(.05);a.x=0;g:input(a,{x=1,y=0});g:step(.05);assert(b.cargo==16,'separation then genuine impact can hit again')
local g,a,b=setup();g:input(a,{x=1,y=0});g:step(.05);a.x=-50;g:input(a,{x=0,y=0});g:step(.05);a.x=0;g:input(a,{x=1,y=0});g:step(.05);assert(b.cargo==18,'separated return during protection does not hit')
for i=1,30 do a.x=0;b.x=31;g:input(a,{x=1,y=0});g:step(.05);g.batteries={} end
assert(b.cargo==18,'protected recontact consumes contact until another separation')
print('PASS collision regressions: ordinary/boost amounts, static/separating/following rejection, safe zones, simultaneous fairness, contact hysteresis and immunity')
