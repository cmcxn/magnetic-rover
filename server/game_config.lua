-- Shared server-owned round and natural-resource pacing.
return {
 matchDuration=100,
 vehicleBody={halfLength=49,halfWidth=34,releasePadding=4},
 pickupRadius=56, -- Magnet range, independent of vehicle collision radius.
 resources={initial=36,refillInterval=10,refillBatch=6,groundCap=42,stopRemaining=10,
  stages={{at=0,inner=260,outer=470},{at=25,inner=160,outer=340},
   {at=50,inner=70,outer=230},{at=75,inner=0,outer=140}},
  sectors=6,attemptsPerBattery=160}
}
