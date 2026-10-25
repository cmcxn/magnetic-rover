package.path='./?.lua;'..package.path
math.randomseed(4096)
local G=require 'game'
local C=require 'vehicle_collision'
local count=0
local function check(value,label) assert(value,label);count=count+1 end
local function near(a,b) return math.abs(a-b)<1e-6 end
local function setup(n)
 local g=G.new();local ps={};for i=1,n or 2 do ps[i]=g:join(i,'P'..i,'#38bdf8') end
 g:start();g.batteries={};g.nextrefill=1e9
 for i,p in ipairs(ps) do p.x=(i-1)*140-70;p.y=0;p.cargo=20 end
 return g,table.unpack(ps)
end
local function solid(g)
 for i,p in ipairs(g.players) do if not p.removed then
  check(p.x*p.x+p.y*p.y<=440^2+1e-4,'whole circle stays inside wall')
  for j=i+1,#g.players do local q=g.players[j];if not q.removed then
   check((p.x-q.x)^2+(p.y-q.y)^2>=120^2-1e-3,'solid circles cannot overlap')
  end end
 end end
end
local function cargo(g) local n=#g.batteries;for _,p in ipairs(g.players) do n=n+p.cargo+p.score end;return n end
local p=function(x,y)return{x=x,y=y}end
local t=C.sweep(p(-180,0),p(180,0),0,p(0,0),p(0,0),0)
check(near(t,60/360),'circle radius60 catches first contact, not old rectangle')
check(C.sweep(p(-180,120),p(180,120),0,p(0,0),p(0,0),0)~=nil,'circle exact tangent counts')
check(not C.sweep(p(-180,120.001),p(180,120.001),0,p(0,0),p(0,0),0),'circle tangent miss excludes')
local g,a,b=setup();a.x=-64;b.x=64;g:input(a,{x=1,y=0});g:step(.05)
check(a.stun>0 and b.stun>0,'ordinary collision stuns both including attacker')
check(a.cargo==20 and b.cargo==20 and #g.batteries==0,'ordinary collision never drops batteries')
check(a.kx<0 and b.kx>0,'front normal impact recoils attacker and pushes target forward');solid(g)
local g,a,b=setup();g:input(a,{x=1,y=0,boost=true});g:step(.05)
check(a.stun==0 and b.stun>0,'effective frontal boost attacker avoids stun')
check(a.boost==0 and a.kx<0 and b.kx>0,'effective boost recoils and decelerates attacker')
check(b.cargo==15 and #g.batteries==5 and cargo(g)==40,'boost drops25percent max5 preserving total value');solid(g)
for _,bat in ipairs(g.batteries) do check(bat.source=='drop' and bat.unlock>g.time and bat.z>=0 and bat.vx~=nil,'drops have authority velocity height and pickup lock') end
local hit=b.hitSeq;g:step(.05);check(b.hitSeq==hit,'continuous contact never repeats gameplay loss')
local firstx=b.x;g:step(.05);check(b.x>firstx,'stunned target continues physical knockback')
for _,reverse in ipairs({false,true}) do
 local g,a,b=setup();if reverse then g.players={b,a} end
 g:input(a,{x=1,y=0,boost=true});g:input(b,{x=-1,y=0,boost=true});g:step(.05)
 check(a.stun>0 and b.stun>0 and a.cargo==15 and b.cargo==15,'double frontal boost is simultaneous and symmetric');solid(g)
end
-- Boosting sideways into a moving target is not a forward attack.
local g,a,b=setup();a.x=-60;b.x=60;a.boost=.2;a.bx=0;a.by=1;a.angle=math.pi/2;g:input(b,{x=-1,y=0});g:step(.05)
check(a.cargo==20 and b.cargo==20 and a.stun>0 and b.stun>0,'side boost contact is ordinary');solid(g)
local g,a,b=setup();a.x=-60;b.x=60;g:input(a,{x=-1,y=0,boost=true});g:step(.05)
check(a.stun==0 and b.stun==0 and b.cargo==20,'separating boost is not an attack');solid(g)
local g,a,b=setup();a.x=-64;b.x=64;a.protect=2;b.protect=2;g:input(a,{x=1,y=0,boost=true});g:step(.05)
check(b.cargo==20,'protection prevents boosted repeated loss');solid(g)
local g,a,b=setup();a.x=-160;b.x=160;g:input(a,{x=1,y=0,boost=true});g:input(b,{x=-1,y=0,boost=true});g:step(.3)
check(a.x<b.x,'long opposing dash cannot swap through bodies');solid(g)
local g,a,b,c=setup(3);a.x=180;b.x=310;c.x=440;g:input(a,{x=1,y=0,boost=true});g:step(.05);solid(g)
for i=1,40 do g:step(.05);solid(g) end
local g,a,b=setup();a.x=0;b.x=0;g:step(.05);solid(g)
-- One contact remains consumed even if damage protection expires.
local g,a,b=setup();a.x=-60;b.x=60;g:input(a,{x=1,y=0,boost=true});g:step(.05);local lost=b.cargo
for i=1,40 do a.x=-60;b.x=60;a.kx=0;a.ky=0;b.kx=0;b.ky=0;a.boost=.2;a.bx=1;a.by=0;a.ix=1;a.last=g.time;g:step(.05) end
check(b.cargo==lost,'continuous pair remains consumed after protection expiry')
-- Safe station preserves cargo but never makes the bodies non-solid.
local g,a,b=setup();a.x=-330;a.y=-220;b.x=-210;b.y=-220;g:input(a,{x=1,y=0});g:step(.05)
check(a.stun>0 and b.stun>0 and cargo(g)==40 and #g.batteries==0,'safezone ordinary collision stuns without cargo loss');solid(g)
-- Every battery removed from cargo must exist even near stations/walls.
for _,pos in ipairs({{440,0},{-330,-220},{0,380},{0,0}}) do
 local g,a,b=setup();a.x=pos[1];a.y=pos[2];b.x=0;b.y=-300;local before=cargo(g)
 g:drop(a,30,1,0);check(a.cargo==0 and cargo(g)==before,'drop clamps to actual cargo and never destroys value')
 for i=1,30 do g:step(.05) end
 check(cargo(g)==before,'scatter and settlement preserve value');solid(g)
 for _,bat in ipairs(g.batteries) do
  check(bat.x^2+bat.y^2<=(500-10)^2+1e-4 and not g:station(bat),'settled drop outside stations/wall')
  for _,q in ipairs(g.players) do check((bat.x-q.x)^2+(bat.y-q.y)^2>=70^2-1e-3,'settled battery not inside a car') end
 end
end
check(g:snapshot().collisionRadius==60,'snapshot shares hard collision radius')
print('PASS collision redesign '..count..' assertions')
local g,a,b=setup();a.cargo=2;b.cargo=0;b.x=300;g:drop(a,2,1,0)
a.x=-300;a.y=0
for i=1,25 do g:step(.05) end
local battery=g.batteries[1];local bx,by=battery.x,battery.y
b.x=bx+71;b.y=by;b.ix=-1;b.last=g.time;g:step(.05)
check(b.cargo>=1,'settled dropped battery can be picked up at solid contact')
local g=G.new();for i=1,8 do g:join(i,'P'..i,'#38bdf8') end;g:start();solid(g)
print('PASS settled drop pickup and initial eight-car nonoverlap')
local g,a,b=setup();a.x=-60;b.x=60;g:input(a,{x=.05,y=0});g:step(.05)
check(a.stun>0 and b.stun>0,'even low-speed ordinary moving contact stuns both')
local g=G.new();local ps={};for i=1,8 do ps[i]=g:join(i,'P'..i,'#38bdf8') end
g:disconnect(2);g:step(0,10.1);g:join(9,'P9','#38bdf8');solid(g)
print('PASS lobby churn chooses an unoccupied solid spawn')
-- Deterministic stress: eight cars, wall piles, mixed input and initial overlap.
math.randomseed(1024)
for trial=1,80 do
 local g=G.new();for i=1,8 do local p=g:join(i,'P'..i,'#38bdf8');p.x=trial%2==0 and 435 or math.random(-300,300);p.y=trial%2==0 and 0 or math.random(-300,300) end
 g:start();g.batteries={};g.nextrefill=1e9
 for step=1,25 do
  for _,p in ipairs(g.players) do local angle=math.random()*math.pi*2;g:input(p,{x=math.cos(angle),y=math.sin(angle),boost=step%5==0}) end
  g:step(.05);solid(g)
 end
end
print('PASS seeded80x25 eight-car wall/pile stress; total '..count..' assertions')
local g,a,b=setup();a.x=-130;b.x=0;a.cargo=0;a.ix=1;a.boost=.02;a.bx=1;a.by=0;a.last=g.time;g:step(.05)
check(a.stun==0 and b.cargo==15,'last partial boost tick classifies actual pre-expiry contact as boosted')
local g,a,b=setup();a.x=-150;b.x=250;a.kx=100;a.ix=0;local x=a.x;g:step(.05)
check(near(a.kx,100*math.exp(-5*.05)),'persistent knockback decays exactly5 per second without double decay')
check(near(a.x-x,100*(1-math.exp(-5*.05))/5),'knockback displacement uses integrated exponential')
local g,a,b=setup();a.x=-330;a.y=-220;b.x=-210;b.y=-220;g:input(a,{x=1,y=0,boost=true});g:step(.05)
check(a.stun==0 and b.stun>0 and #g.batteries==0 and a.cargo+a.score==20 and b.cargo+b.score==20,'safezone exempts drops only; valid boosted attacker remains unstunned')
print('PASS partial-boost expiry, exact knockback decay, approved safezone boost rule; total '..count..' assertions')
