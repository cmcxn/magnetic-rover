package.path='./?.lua;'..package.path
local config=require 'game_config';local Game=require 'game';local Collision=require 'vehicle_collision';local Motion=require 'battery_motion'
local scale=tonumber(arg[1]) or tonumber(os.getenv('ROVER_MAP_SCALE')) or 2
local speed=tonumber(arg[2]) or tonumber(os.getenv('ROVER_SUPPLY_SPEED')) or 2
assert(config.mapScale==scale and config.arenaRadius==500*scale,'configured arena scale')
assert(config.supplySpeed==speed and math.abs(config.resources.refillInterval-10/speed)<1e-8,'configured supply speed')
local area=scale*scale;local r=config.resources
assert(r.initial==math.floor(36*area+.5) and r.groundCap==math.floor(42*area+.5) and r.refillBatch==math.floor(6*area+.5),'preserve supply density')
local g=Game.new();local p=g:join(1,'One','#38bdf8');g:join(2,'Two','#fb7185');assert(g:start());assert(#g.batteries==r.initial)
assert(g:snapshot().radius==500*scale and g:snapshot().supply.outerRadius==470*scale)
assert(g.stations[1].x==-330*scale and g.stations[3].y==380*scale and g.stations[1].r==65)
assert(math.abs(math.sqrt(p.x*p.x+p.y*p.y)-220*scale*math.max(1,config.vehicleScale))<1e-6)
local edge={x=config.arenaRadius+100,y=0,id='1'};Collision.project({edge});assert(math.abs(edge.x-(config.arenaRadius-config.collisionRadius))<1e-6)
local battery={x=config.arenaRadius+100,y=0};Motion.place(g,battery);assert(math.sqrt(battery.x*battery.x+battery.y*battery.y)<=config.arenaRadius-10+1e-6)
g:step(0,r.refillInterval-.001);assert(#g.batteries==r.initial,'not early');g:step(0,.001);assert(#g.batteries==r.groundCap,'first refill fills natural cap')
g.batteries={};g:step(0,80,15);assert(#g.batteries==r.refillBatch,'no catch-up burst');assert(g:snapshot().supply.outerRadius==140*scale)
for _,b in ipairs(g.batteries) do assert(b.x*b.x+b.y*b.y<=(140*scale)^2+1e-5) end
g.batteries={};g:step(0,5,10);assert(#g.batteries==0,'final ten seconds stop supply')
print('arena/supply: radius '..config.arenaRadius..', interval '..r.refillInterval..', initial '..r.initial..', batch '..r.refillBatch..', cap '..r.groundCap..' passed')
