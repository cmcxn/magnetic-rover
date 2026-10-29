package.path='./?.lua;'..package.path
local Bot=require 'bot'
local Game=require 'game'
local config=require 'game_config'
local function fixture()
 local g=Game.new();local p=g:join({},'AI','#fb923c');local q=g:join(1,'Human','#38bdf8');p.isBot=true;p.bot=Bot.new(function()return .5 end);g:start();g.batteries={};p.x=0;p.y=0;q.x=-450;q.y=0;return g,p,q
end
local g,p,q=fixture();local b=g:addbattery(200,0);local c=p.bot
local m=Bot.input(c,g,p,0);assert(m.x>.9 and math.abs(m.y)<.01);assert(c.mode=='collect')
g:addbattery(0,80);Bot.input(c,g,p,.05);assert(c.target==b,'decision cadence');Bot.input(c,g,p,.3);assert(c.target==b,'target hysteresis')
p.cargo=10;Bot.input(c,g,p,.5);assert(c.mode=='bank');p.cargo=1;g.remaining=12;Bot.input(c,g,p,.7);assert(c.mode=='bank')
g,p,q=fixture();g:addbattery(-200,0);q.x=180;q.y=0;q.cargo=8;p.angle=0
m=Bot.input(p.bot,g,p,0);assert(p.bot.mode=='attack' and m.boost,'attack loaded rival')
m=Bot.input(p.bot,g,p,.2);assert(not m.boost,'release to recharge')
q.protect=2;Bot.input(p.bot,g,p,.4);assert(p.bot.mode~='attack','respect protection')
p.stun=1;m=Bot.input(p.bot,g,p,.6);assert(m.x==0 and m.y==0 and not m.boost)
g,p,q=fixture();g:addbattery(200,0);for i=0,10 do Bot.input(p.bot,g,p,i*.15) end;assert(p.bot.unstuckUntil and p.bot.unstuckUntil>1.2,'unstuck')
g,p,q=fixture();g:addbattery(200,0);g.batteries[1].unlock=g.time+10;g.batteries[1].z=5;m=Bot.input(p.bot,g,p,0);assert(p.bot.mode~='collect','ignore unavailable battery')
-- An attack must cause actual authoritative collision damage, not a cosmetic dash.
g,p,q=fixture();q.x=180;q.y=0;q.cargo=8;p.angle=0
for i=1,6 do g:step(.05,.05) end
assert(q.hitSeq>0 and q.cargo<8,'competitive dash must hit the loaded rival')
-- An actual full round must bank real pickups using normal game physics.
g,p,q=fixture();g:replenish(36);local maxPickup=0
for i=1,2000 do g:step(.05,.05,100-i*.05);maxPickup=math.max(maxPickup,p.pickupSeq) end
assert(g.phase=='finished');assert(p.score>0 and maxPickup>0,'AI must bank, not just move');assert(p.energy>=0 and p.energy<=1)
local stalled,driver=fixture();local x=driver.x;stalled:step(0,2,98);assert(driver.x==x,'no movement during skipped physics')
print('bot target/cadence/banking/attack/release/protection/stun/unstuck/full match: ok; score '..p.score)
