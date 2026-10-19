-- Monotonic wall clock owns the match deadline; physics remains fixed-step.
local Clock={};Clock.__index=Clock
local STEP=.05
local MAX_STEPS=5
function Clock.new(game,now)
 return setmetatable({game=game,last=now,accumulator=0,deadline=nil},Clock)
end
function Clock:start(now)
 self:advance(now)
 local ok,e=self.game:start();if not ok then return nil,e end
 self.last=math.max(self.last,now);self.accumulator=0
 self.deadline=self.last+self.game.remaining
 return true
end
function Clock:disconnect(fd,now)
 -- Close/error callbacks may be the first event handled after a long stall.
 self:advance(now)
 self.game:disconnect(fd)
end
function Clock:advance(now)
 now=math.max(self.last,now)
 self.accumulator=self.accumulator+now-self.last;self.last=now
 local g=self.game
 local remaining=g.phase=='playing' and self.deadline and math.max(0,self.deadline-now) or nil
 if remaining==0 then
  -- Never replay physics from a stalled server after the deadline has passed.
  g:step(0,self.accumulator,0);self.accumulator=0;return 0
 end
 local steps=math.floor((self.accumulator+1e-9)/STEP)
 if steps>MAX_STEPS then
  -- Age timeout/protection/drop clocks but discard old movement work.
  local skipped=(steps-MAX_STEPS)*STEP
  g:step(0,skipped,remaining);self.accumulator=self.accumulator-skipped;steps=MAX_STEPS
 end
 for _=1,steps do g:step(STEP,STEP,remaining) end
 self.accumulator=math.max(0,self.accumulator-steps*STEP)
 if remaining then g.remaining=remaining end
 return steps
end
return Clock
