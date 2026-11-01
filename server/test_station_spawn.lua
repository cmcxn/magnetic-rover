local G=require 'game';local c=require 'game_config'
for seed=1,40 do
 math.randomseed(seed);local g=G.new();for i=1,8 do assert(g:join(i,'P'..i,'#38bdf8')) end;assert(g:start())
 for i,p in ipairs(g.players) do
  local nearest=math.huge
  for _,s in ipairs(g.stations) do local d=math.sqrt((p.x-s.x)^2+(p.y-s.y)^2);nearest=math.min(nearest,d);assert(d>=(s.bodyRadius or 70)+c.collisionRadius,'spawn outside building') end
  assert(nearest<=330,'spawn must show nearby station')
  assert(p.x*p.x+p.y*p.y<=(c.arenaRadius-c.collisionRadius)^2,'spawn within arena')
  for j=1,i-1 do local q=g.players[j];assert((p.x-q.x)^2+(p.y-q.y)^2>=(2*c.collisionRadius)^2,'spawn overlap') end
 end
end
print('PASS seeded eight-player station-adjacent spawns')
