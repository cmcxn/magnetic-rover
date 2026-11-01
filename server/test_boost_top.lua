local c=require 'game_config';local B=require 'boost_ramp';local G=require 'game'
local ramp,factor=c.boostRamp,c.boostTopFactor
c.boostRamp=c.boostDuration/2;c.boostTopFactor=1.5
local g=G.new();local s=g:snapshot()
assert(s.boostRamp==c.boostDuration/2 and s.boostTopFactor==1.5)
local cap=c.boostMultiplier*c.boostTopFactor
assert(B.average(c.boostDuration/2,0,c.boostRamp,cap)==cap,'half hold reaches 150 percent of prescribed boost')
assert(B.average(0,.01,c.boostRamp,cap)<cap,'press starts below cap')
c.boostRamp=ramp;c.boostTopFactor=factor
print('PASS half-duration boost reaches 150 percent target and publishes tuning')
