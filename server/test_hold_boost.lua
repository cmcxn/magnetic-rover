package.path='./?.lua;'..package.path
local G=require 'game';local c=require 'game_config'
local g=G.new();local p=g:join(1,'One','#38bdf8');g:join(2,'Two','#fb7185');g:start()
g:input(p,{x=1,y=0,boost=true});g:step(.08)
assert(p.energy>0 and p.energy<1)
local retained=p.energy;g:input(p,{x=1,y=0,boost=false});assert(p.boost==0)
g:step(.1);assert(p.energy>retained,'release recharges remaining energy')
g:input(p,{x=1,y=0,boost=true});assert(p.boost>0,'partial charge can be reused')
print('hold, release, recharge and partial reuse passed')
local h=G.new();local a=h:join(1,'One','#38bdf8');h:join(2,'Two','#fb7185');h:start();h.batteries={}
for i=1,30 do h:input(a,{x=0,y=0,boost=true});h:step(.05) end
assert(a.energy<1e-8 and a.boost==0,'empty held boost must not auto recharge')
h:input(a,{x=0,y=0,boost=false});h:step(.2);assert(a.energy>0 and a.energy<1)
assert(h:snapshot().players[1].energy==a.energy)
