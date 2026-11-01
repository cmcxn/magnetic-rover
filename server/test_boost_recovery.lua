local G=require 'game';local c=require 'game_config';local B=require 'boost_ramp'
local old=c.boostRecovery;c.boostRecovery=.7
local g=G.new();local p=g:join(1,'A','#38bdf8');local q=g:join(2,'B','#fb7185');g:start();g.batteries={};g.nextrefill=1e9;p.x=0;p.y=0;q.x=-300;q.y=200
p.boostSpeed=2.25;p.boost=0;g:input(p,{x=1,y=0,boost=false});local x=p.x;g:step(.05)
assert(p.x-x>c.baseSpeed*.05*1.8,'exhausted boost must decelerate gradually');assert(p.boostSpeed>1 and p.boostSpeed<2.25);assert(p.boost==0,'coasting must not remain an attack')
local avg,final=B.recover(2.25,.7,.7,2.25);assert(math.abs(final-1)<1e-8 and avg>1)
c.boostRecovery=old
print('PASS gradual recovery, target speed and no continued boost attack')
