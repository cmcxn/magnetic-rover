package.path='./?.lua;'..package.path
local G=require 'game'
local function setup()
 local g=G.new();local a=g:join('a','A','#38bdf8');local b=g:join('b','B','#fb7185');g:start();g.batteries={};return g,a,b
end
local g,a,b=setup();a.cargo=10;g:disconnect('a');g:step(.05,11);assert(a.removed and a.cargo==0)
assert(g:join('new-a','ignored','#38bdf8',a.token)==a,'ten-second removal does not expire playing guest identity')
assert(not g:join('hijack','ignored','#38bdf8',a.token),'connected token cannot be taken over')
local g,a,b=setup();g.remaining=.01;g:step(.05);g:disconnect('a');g:disconnect('b');g:step(.05,9)
assert(g.phase=='finished','empty finished room keeps grace window');assert(g:join('new-a','ignored','#38bdf8',a.token)==a,'finished guest may reconnect within grace');g:disconnect('new-a');g:step(.05,10.1)
assert(g.phase=='lobby' and #g.players==0 and #g.batteries==0,'fully abandoned finished room returns to empty lobby')
assert(g:join('fresh','New','#38bdf8'),'fresh guests can join recovered lobby')
local g,a,b=setup();g:disconnect('a');g:disconnect('b');g:step(.05,11);g.remaining=.01;g:step(.05);g:step(.05)
assert(g.phase=='lobby','match already abandoned at finish recovers')
local g,a,b=setup();g.remaining=.01;g:step(.05);g:disconnect('b');g:step(.05,9);assert(g.phase=='finished','results remain visible for ten seconds');g:step(.05,1.1);assert(g.phase=='lobby' and #g.players==1,'results automatically return connected guests to lobby after ten seconds')
print('PASS lifecycle: ten-second cargo removal preserves identity, live token protected, empty finished reset honors grace and connected results viewer')
