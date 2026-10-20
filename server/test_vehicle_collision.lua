package.path='./?.lua;'..package.path
local G=require 'game'
local function setup(x,y)
 local g=G.new();local a=g:join('a','A','#38bdf8');local b=g:join('b','B','#fb7185');g:start();g.batteries={};g.nextrefill=1e9
 a.x=0;a.y=0;b.x=x;b.y=y;b.cargo=20;return g,a,b
end
local g,a,b=setup(105,0);g:input(a,{x=1,y=0});g:step(.05);assert(b.hitSeq==1 and b.cargo==18 and b.stun==1,'enlarged98x68body edge impact drops cargo and stuns before old center-radius contact')
local g,a,b=setup(105,68.001);g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(b.hitSeq==0,'passing outside visible body width is not a collision')
local g,a,b=setup(105,68);g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(b.hitSeq==1 and b.cargo==15,'body edge tangent dash counts with boosted drop')
local g,a,b=setup(0,0);a.x=-130;g:input(a,{x=1,y=0,boost=true});g:step(.05);assert(b.hitSeq==1 and b.x==24,'new enlarged front contact retains24-unit knockback')
local C=require 'vehicle_collision'
local function pose(x,y) return {x=x,y=y} end
assert(C.sweep(pose(-180,0),pose(180,0),0,pose(0,0),pose(0,0),0),'sweep catches full body traversal even when both endpoints miss')
assert(not C.sweep(pose(-180,68.001),pose(180,68.001),0,pose(0,0),pose(0,0),0),'sweep excludes near tangent miss')
local t=C.sweep(pose(-180,0),pose(180,0),0,pose(0,0),pose(0,0),0);assert(math.abs(t-82/360)<1e-9,'earliest rectangle contact time is exact')
assert(C.sweep(pose(0,0),pose(0,0),math.pi/2,pose(68,0),pose(68,0),math.pi/2),'upright side boundary uses68combined width')
assert(not C.sweep(pose(0,0),pose(0,0),math.pi/2,pose(68.001,0),pose(68.001,0),math.pi/2),'upright side excludes radius-style oversized circle')
local c=math.sqrt(.5)
assert(C.sweep(pose(0,0),pose(0,0),math.pi/4,pose(-68*c,68*c),pose(-68*c,68*c),math.pi/4),'rotated parallel side tangent')
assert(not C.sweep(pose(0,0),pose(0,0),math.pi/4,pose(-68.01*c,68.01*c),pose(-68.01*c,68.01*c),math.pi/4),'rotated outside side miss')
assert(C.sweep(pose(0,0),pose(0,0),0,pose(106,0),pose(106,0),0,4),'release hysteresis includes8-unit combined gap')
assert(not C.sweep(pose(0,0),pose(0,0),0,pose(106.001,0),pose(106.001,0),0,4),'release hysteresis ends after genuine separation')
print('PASS enlarged oriented body collisions: edge, sweep, rotation, tangent, knockback and release gap')
