package.path='./?.lua;'..package.path
local c=require 'game_config';local G=require 'game';local C=require 'vehicle_collision'
local multiplier=tonumber(arg[4]) or 3
local scale=tonumber(arg[1]) or 1;local cooldown=tonumber(arg[2]) or 4;local duration=tonumber(arg[3]) or .32
assert(c.vehicleScale==scale);assert(c.collisionRadius==60*scale);assert(c.pickupRadius==56*scale)
local g=G.new();local p=assert(g:join(1,'One','#38bdf8'));assert(g:join(2,'Two','#fb7185'));g:start();g:input(p,{x=1,y=0,boost=true})
assert(p.cooldown==cooldown and p.boost==duration)
assert(c.boostMultiplier==multiplier)
p.x=0;p.y=0;g:step(.001);assert(math.abs(p.x-c.baseSpeed*multiplier*.001)<1e-6)
local s=g:snapshot();assert(s.boostMultiplier==multiplier);assert(s.vehicleScale==scale and s.boostCooldown==cooldown and s.boostDuration==duration)
local a={x=0,y=0}
local b={x=100*scale,y=0};assert(C.sweep(a,a,0,b,b,0)==0)
print('tuning validated',scale,cooldown,duration)
local eight=G.new();for i=1,8 do assert(eight:join(i,'Car '..i,'#38bdf8')) end
for i,a in ipairs(eight.players) do
 assert(math.sqrt(a.x*a.x+a.y*a.y)<=500-c.collisionRadius)
 for j=i+1,8 do local b=eight.players[j];assert((a.x-b.x)^2+(a.y-b.y)^2>=(2*c.collisionRadius)^2-1e-6) end
end
local edge={x=500,y=0,id='1'};C.project({edge});assert(math.abs(edge.x-(500-c.collisionRadius))<1e-5)
