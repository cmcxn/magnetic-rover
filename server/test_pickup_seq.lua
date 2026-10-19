package.path='./?.lua;'..package.path
local G=require 'game'
local function setup()
 local g=G.new();local a=g:join('a','A','#38bdf8');local b=g:join('b','B','#fb7185')
 assert(g:start());g.batteries={};g.nextrefill=math.huge
 a.x=0;a.y=0;b.x=200;b.y=0
 return g,a,b
end
local function seq(g,p)
 for _,q in ipairs(g:snapshot().players) do if q.id==p.id then return q.pickupSeq end end
 error('player missing from snapshot')
end
local g,a,b=setup()
assert(a.pickupSeq==0 and seq(g,a)==0,'new player and snapshot start pickupSeq at zero')
for i=1,3 do g:addbattery(0,0) end
g:step(.05)
assert(a.cargo==3 and a.pickupSeq==3 and seq(g,a)==3,'each same-tick collected battery increments authoritative sequence')
assert(b.pickupSeq==0 and seq(g,b)==0,'another player does not receive pickup credit')
g:step(.05);assert(a.pickupSeq==3,'empty subsequent tick does not replay pickups')
for i=1,30 do g:addbattery(0,0) end
g:step(.05)
assert(a.cargo==20 and a.pickupSeq==20 and #g.batteries==13,'only accepted pickups count when reaching cargo cap')
g:step(.05);assert(a.pickupSeq==20 and #g.batteries==13,'full cargo neither collects nor increments sequence')
a.x=-330;a.y=-220;g:step(.05)
assert(a.cargo==0 and a.score==20 and a.pickupSeq==20,'deposit does not increment or reset sequence')
a.x=0;a.y=0;g:step(.05)
assert(a.cargo==13 and a.pickupSeq==33,'pickups after deposit continue sequence beyond cargo cap')
g:drop(a,2)
assert(a.cargo==11 and a.pickupSeq==33,'dropping cargo does not increment or reset sequence')
g.batteries={};g:addbattery(a.x,a.y,g.time+1);g:step(.05)
assert(a.pickupSeq==33,'locked battery does not count as collected')
local before=seq(g,a);g:disconnect('a');g:step(.05)
assert(g:join('rejoined','ignored','#38bdf8',a.token)==a)
assert(seq(g,a)==before,'reconnect preserves sequence; welcome baseline must not replay previous pickups')
g.batteries={};g:addbattery(a.x,a.y);g:step(.05)
assert(seq(g,a)==before+1,'fresh pickup after reconnect increments from preserved sequence')
g:disconnect('rejoined');g:step(.05,11)
assert(a.removed and a.cargo==0 and a.pickupSeq==before+1,'disconnect expiry drops cargo without pickup credit')
assert(g:join('late','ignored','#38bdf8',a.token)==a)
assert(seq(g,a)==before+1,'late same-match reconnect retains pickup sequence')
g.remaining=.01;g:step(.05);assert(g:again())
assert(a.pickupSeq==0 and b.pickupSeq==0 and seq(g,a)==0,'rematch resets all retained player sequences')
assert(g:start());g.batteries={};g.nextrefill=math.huge;a.x=0;a.y=0;b.x=200;b.y=0
g:addbattery(0,0);g:step(.05)
assert(seq(g,a)==1,'new match starts a fresh pickup sequence')
print('PASS pickupSeq: authoritative per-battery increments, same-tick batches, cap, deposits, drops, locks, per-player isolation, reconnect baseline and rematch reset')
