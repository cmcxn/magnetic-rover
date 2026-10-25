-- Shared server-owned round and natural-resource pacing.
-- Read once at service startup; reject non-finite and unsupported values.
local baseSpeed=tonumber(os.getenv('ROVER_BASE_SPEED'))
if not baseSpeed or baseSpeed~=baseSpeed or baseSpeed<1 or baseSpeed>480 then baseSpeed=480 end
return {
 baseSpeed=baseSpeed,
 matchDuration=100,
 collisionRadius=60,
 vehicleBody={halfLength=49,halfWidth=34,releasePadding=2},
 knockbackDecay=5,
 collision={frontDot=.65,minClosing=40,normalStun=.65,boostStun=1,protection=1.6,releaseGap=4},
 pickupRadius=56, -- Magnet range, independent of vehicle collision radius.
 resources={initial=36,refillInterval=10,refillBatch=6,groundCap=42,stopRemaining=10,
  stages={{at=0,inner=260,outer=470},{at=25,inner=160,outer=340},
   {at=50,inner=70,outer=230},{at=75,inner=0,outer=140}},
  sectors=6,attemptsPerBattery=160}
}
