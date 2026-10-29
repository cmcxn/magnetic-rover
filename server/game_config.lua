-- Shared server-owned round and natural-resource pacing.
-- Read once at service startup; reject non-finite and unsupported values.
local baseSpeed=tonumber(os.getenv('ROVER_BASE_SPEED'))
if not baseSpeed or baseSpeed~=baseSpeed or baseSpeed<1 or baseSpeed>480 then baseSpeed=480 end
local function setting(key,default,min,max)
 local v=tonumber(os.getenv(key));if not v or v~=v or v<min or v>max then return default end;return v
end
local scale=setting('ROVER_VEHICLE_SCALE',1,.25,1.5)
local multiplier=setting('ROVER_BOOST_MULTIPLIER',3,1,10)
local cooldown=setting('ROVER_BOOST_COOLDOWN',4,.1,60)
local duration=setting('ROVER_BOOST_DURATION',.32,.01,10)
local mapScale=setting('ROVER_MAP_SCALE',2,1,4)
local supplySpeed=setting('ROVER_SUPPLY_SPEED',2,.25,10)
local function density(n) return math.floor(n*mapScale*mapScale+.5) end
return {
 mapScale=mapScale,arenaRadius=500*mapScale,supplySpeed=supplySpeed,
 baseSpeed=baseSpeed,
 vehicleScale=scale,boostMultiplier=multiplier,boostCooldown=cooldown,boostDuration=duration,
 matchDuration=100,
 collisionRadius=60*scale,
 vehicleBody={halfLength=49*scale,halfWidth=34*scale,releasePadding=2*scale},
 knockbackDecay=5,
 collision={frontDot=.65,minClosing=40,normalStun=.65,boostStun=1,protection=1.6,releaseGap=4*scale},
 pickupRadius=56*scale, -- Magnet range, independent of vehicle collision radius.
 resources={initial=density(36),refillInterval=10/supplySpeed,refillBatch=density(6),groundCap=density(42),stopRemaining=10,
  stages={{at=0,inner=260*mapScale,outer=470*mapScale},{at=25,inner=160*mapScale,outer=340*mapScale},
   {at=50,inner=70*mapScale,outer=230*mapScale},{at=75,inner=0,outer=140*mapScale}},
  sectors=6,attemptsPerBattery=160}
}
