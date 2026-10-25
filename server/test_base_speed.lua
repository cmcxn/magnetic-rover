package.path='./?.lua;'..package.path
local expected=tonumber(arg[1]) or 480
local G=require 'game'
local function near(a,b) assert(type(a)=='number' and math.abs(a-b)<1e-7,tostring(a)..' ~= '..tostring(b)) end
for _,cargo in ipairs({0,20}) do
 for _,boost in ipairs({false,true}) do
  local g=G.new();local p=g:join('a','A','#38bdf8');local q=g:join('b','B','#fb7185');assert(g:start())
  g.batteries={};p.x=0;p.y=0;q.x=-300;q.y=0;p.cargo=cargo
  near(g:snapshot().baseSpeed,expected)
  assert(g:input(p,{x=1,y=0,boost=boost,speed=99999}))
  g:step(.05);near(p.x,expected*(1-.2*cargo/20)*(boost and 3 or 1)*.05)
 end
end
print('PASS base speed '..expected..': snapshot, authority, cargo and boost')
