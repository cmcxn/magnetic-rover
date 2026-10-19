package.path='./?.lua;'..package.path
local G=require 'game';local Clock=require 'game_clock'
local function setup()
 local g=G.new();local p=g:join('a','A','#38bdf8');g:join('b','B','#fb7185');local c=Clock.new(g,100);assert(c:start(100));return g,c,p
end
local g,c=setup();for i=1,1941 do c:advance(100+i*.0515) end
assert(g.phase=='playing' and math.abs(g.remaining-(100-1941*.0515))<1e-8,'execution overhead must not accumulate into timer drift')
c:advance(199.999);assert(g.phase=='playing' and g.remaining>0,'do not finish early');c:advance(200);assert(g.phase=='finished' and g.remaining==0,'finish exactly at monotonic deadline')
local h,d,p=setup();h:input(p,{x=1,y=0,boost=true});local x=p.x;local steps=d:advance(150);assert(steps<=5,'bounded catchup');assert(p.x==x,'old input expires before post-pause physics');assert(h.remaining==50 and p.cooldown==0,'wall-clock timers continue during pause')
local before=p.x;d:advance(400);assert(h.phase=='finished' and h.remaining==0 and p.x==before,'long gap beyond deadline cannot simulate post-finish movement')
assert(h:again());assert(d:start(401));d:advance(402);assert(h.remaining==99,'rematch resets deadline')
local t,e=setup();e:advance(100.02);e:advance(100.01);assert(math.abs(t.remaining-99.98)<1e-8,'backwards timestamp cannot add time');e:advance(100.05);assert(math.abs(t.remaining-99.95)<1e-8)
print('PASS monotonic clock: no cumulative drift, exact finish boundary, bounded catchup, stale-input expiry, cooldown expiry, no post-deadline motion, rematch deadline, backwards-clock clamp')

local stall,sc,attacker=setup();local victim=stall.players[2];attacker.x=0;attacker.y=0;victim.x=0;victim.y=0;victim.cargo=20;stall.batteries={};stall:input(attacker,{x=0,y=0,boost=true});sc:advance(150);assert(victim.cargo==20,'expired boost cannot collide when discarded paused time is aged');print('PASS stalled boost cannot apply an expired attack')
local reconnect,rc,guest=setup();guest.cargo=20;reconnect.batteries={};guest.x=0;guest.y=0
rc:disconnect('a',120);rc:advance(120)
local joined=reconnect:join('reconnected','ignored','#38bdf8',guest.token)
assert(joined and joined.cargo==20 and joined.connected,'disconnect after long service stall starts a fresh grace window')
rc:disconnect('reconnected',121);rc:advance(130.9);assert(not guest.removed and guest.cargo==20,'retain cargo before ten wall seconds');rc:advance(131.1);assert(guest.removed and guest.cargo==0,'expire cargo after ten wall seconds')
print('PASS disconnect clock: paused service then immediate reconnect preserves cargo, fresh ten-second grace expires correctly')
