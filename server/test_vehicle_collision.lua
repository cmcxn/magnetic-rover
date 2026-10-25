package.path='./?.lua;'..package.path
local C=require 'vehicle_collision'
local p=function(x,y)return {x=x,y=y}end
local t=C.sweep(p(-180,0),p(180,0),0,p(0,0),p(0,0),0)
assert(math.abs(t-60/360)<1e-9,'earliest circle contact time')
assert(C.sweep(p(-180,120),p(180,120),0,p(0,0),p(0,0),0),'exact swept circle tangent')
assert(not C.sweep(p(-180,120.001),p(180,120.001),0,p(0,0),p(0,0),0),'near tangent excludes')
for _,angle in ipairs({0,math.pi/4,math.pi/2,math.pi}) do
 assert(C.sweep(p(0,0),p(0,0),angle,p(120,0),p(120,0),angle),'circle independent of heading')
 assert(not C.sweep(p(0,0),p(0,0),angle,p(120.001,0),p(120.001,0),angle),'outside circle independent of heading')
end
assert(C.sweep(p(0,0),p(0,0),0,p(124,0),p(124,0),0,2),'four-unit release gap')
assert(not C.sweep(p(0,0),p(0,0),0,p(124.001,0),p(124.001,0),0,2),'release beyond gap')
local cars={{id='1',x=0,y=0,vx=0,vy=0},{id='2',x=0,y=0,vx=0,vy=0}}
C.resolve(cars,.05);assert(math.abs(cars[1].x-cars[2].x)>=120,'coincident initial centers resolved without NaN')
print('PASS authoritative circle boundary: exact tangent, near miss, sweep, rotation invariance, hysteresis, initial overlap')
