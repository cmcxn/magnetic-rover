package.path = './?.lua;' .. package.path
local G = require 'game'
local g=G.new(); local p=g:join('one','甲','#38bdf8'); local q=g:join('two','乙','#fb7185')
assert(p and q); assert(not g:join('three','bad','#fff',p.token)); assert(g:start())
g.batteries={{id='test',x=0,y=0,unlock=0}}; p.x=0;p.y=0;q.x=150;q.y=0
g:step(.05); assert(p.cargo==1 and #g.batteries==0,'pickup exactly once')
p.x=-330;p.y=-220;g:step(.05);g:step(.05); assert(p.score==1 and p.cargo==0,'deposit exactly once')
p.x=0;p.y=0;g:input(p,{x=1e200,y=1e200,boost=false});g:step(.05);assert(p.x==0,'reject huge input')
assert(not g:input(p,{x='1',y=0})); assert(not g:input(p,{x=0/0,y=0}));
g:input(p,{x=1,y=1,boost=false}); g:step(.05);assert(math.abs(math.sqrt(p.x^2+p.y^2)-6)<.001,'normalized diagonal')
p.x=499;p.y=0;g:input(p,{x=1,y=0});g:step(.05); assert(math.sqrt(p.x^2+p.y^2)<=500,'arena clamp')
p.x=0;p.y=0;g:input(p,{x=1,y=0}); for i=1,20 do g:step(.05) end; assert(p.x<=42,'stale input stops')
p.x=0;p.y=0;p.cargo=0;q.x=12;q.y=0;q.cargo=20;g:input(p,{x=1,y=0,boost=true});g:step(.05);assert(q.cargo==15,'boost drops five');local n=#g.batteries;g:step(.05);assert(q.cargo==15 and #g.batteries==n,'victim protection and drop lock')
g:disconnect('two');local id=q.id;g:step(.05);local re=g:join('new','ignored','#38bdf8',q.token);assert(re.id==id and re.connected,'reconnect retains identity')
g:disconnect('new');for i=1,201 do g:step(.05) end;assert(q.removed and q.cargo==0,'disconnect removes after ten seconds')
g.remaining=.04;g:step(.05);assert(g.phase=='finished');assert(not g:start());assert(g:again() and g.phase=='lobby')
print('PASS game: pickup/deposit once, input validation, normalized movement, bounds, stale inputs, boost/drop protection, reconnect, timeout, finish/restart')
local h=G.new();for i=1,8 do assert(h:join('fd'..i,'p'..i,'#fb923c')) end;assert(not h:join('fd9','ninth','#fb923c'),'eight player cap')
local bad=G.new();assert(not bad:join('a','\255','#fff'));local clean=bad:join('b',' <昵称> ','#fff');assert(clean.name=='昵称' and clean.color=='#38bdf8')
local z=G.new();local a=z:join('a','A','#38bdf8');local b=z:join('b','B','#fb7185');assert(z:start());for _,r in ipairs(z.batteries) do assert(not z:station(r),'station spawn exclusion');assert(r.x*r.x+r.y*r.y<=500^2) end
z.batteries={};z.nextrefill=z.time;z.remaining=9;z:step(.05);assert(#z.batteries==0,'no last-ten-seconds refill');a.score=3;b.score=3;z.remaining=.01;z:step(.05);local s=z:snapshot();assert(#s.results==2 and s.results[1].score==s.results[2].score,'shared ties');assert(s.players[1].token==nil)
local t=G.new();t:join('a','A','#38bdf8');t:join('b','B','#fb7185');assert(t:start());for i=1,3601 do t:step(.05) end;assert(t.phase=='finished' and t.remaining==0,'full 180 second clock')
print('PASS limits: 8 guests, UTF-8 sanitization, six-color allowlist, station spawn exclusion, last-ten-seconds refill stop, shared ties, token privacy, full 180-second simulated match')
local c=G.new();local p1=c:join('1','One','#38bdf8');c:join('2','Two','#fb7185');c:start();c.batteries={};p1.x=0;p1.y=0
for i=1,30 do c:addbattery(0,0) end;c:step(.05);assert(p1.cargo==20 and #c.batteries==10,'cargo cap')
c:input(p1,{x=1,y=0});c:step(.05);assert(math.abs(p1.x-4.8)<.001,'twenty cargo slows to eighty percent')
p1.cargo=0;p1.x=100;p1.y=0;c:input(p1,{x=1,y=0,boost=true});c:step(.05);assert(math.abs(p1.x-118)<.001,'boost triples speed');local cd=p1.cooldown;c:input(p1,{x=1,y=0,boost=true});assert(p1.cooldown==cd,'boost spam cannot reset cooldown')
print('PASS mechanics: cargo cap, loaded speed, boost speed and cooldown spam rejection')
local abandoned=G.new();for i=1,8 do abandoned:join(i,'Guest','#38bdf8');abandoned:disconnect(i) end;abandoned:step(10.1);assert(abandoned:join(9,'New','#38bdf8'),'abandoned lobby frees reservations')
for _,reverse in ipairs({false,true}) do local duel=G.new();local aa=duel:join('a','A','#38bdf8');local bb=duel:join('b','B','#fb7185');duel:start();for _,p in ipairs({aa,bb}) do p.x=-330;p.y=-220;p.cargo=20;p.boost=.35 end;if reverse then duel.players={bb,aa} end;duel:step(.05);assert(aa.score==20 and bb.score==20,'station safety independent of join order') end
print('PASS regressions: abandoned lobby frees slots; simultaneous station boost collisions are order-independent')

for _,reverse in ipairs({false,true}) do local duel=G.new();local aa=duel:join('a','A','#38bdf8');local bb=duel:join('b','B','#fb7185');duel:start();duel.batteries={};for _,p in ipairs({aa,bb}) do p.x=0;p.y=0;p.cargo=20;p.boost=.35 end;if reverse then duel.players={bb,aa} end;duel:step(.05);assert(aa.cargo==20 and bb.cargo==20,'overlapping stationary cars cannot attack regardless of join order') end
print('PASS overlapping stationary boost does not attack; station safe-zone deposits both full cargo')
