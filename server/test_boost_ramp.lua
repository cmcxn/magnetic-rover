local c=require 'game_config';local G=require 'game';local B=require 'boost_ramp'
local old=c.boostRamp;c.boostRamp=.6
local g=G.new();local p=g:join(1,'A','#38bdf8');g:join(2,'B','#fb7185');g:start();g.batteries={};p.x=0;p.y=0
local speeds={}
for i=1,4 do local x=p.x;g:input(p,{x=1,y=0,boost=true});g:step(.05);speeds[i]=(p.x-x)/.05 end
assert(speeds[2]>speeds[1] and speeds[4]>speeds[3],'hold accelerates progressively')
g:input(p,{x=1,y=0,boost=false});g:step(.05);g:input(p,{x=1,y=0,boost=true});assert(p.boostElapsed==0,'new hold resets acceleration')
assert(B.average(1,.1,.6,3)==3,'speed capped');assert(B.average(0,.1,0,3)==3,'legacy instant mode')
c.boostRamp=old
print('PASS progressive held boost, cap and repress reset')
