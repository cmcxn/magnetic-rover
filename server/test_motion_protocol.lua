package.path='./?.lua;'..package.path
local G=require 'game'
local g=G.new();local p=g:join('a','A','#38bdf8');g:join('b','B','#fb7185');g:start();g.batteries={};p.x=0;p.y=0
assert(g:snapshot().roundId==1,'round generation')
assert(g:input(p,{x=1,y=0,seq=1}))
assert(g:snapshot().players[1].inputSeq==0,'receipt is not simulated acknowledgement')
g:step(0,.1);assert(g:snapshot().players[1].inputSeq==0,'skipped wall time cannot acknowledge physics')
g:step(.05);local s=g:snapshot();assert(math.abs(s.serverTime-.15)<1e-9 and s.players[1].inputSeq==1,'tick acknowledges applied input')
assert(math.abs(s.players[1].inputElapsed-.05)<1e-9)
g:step(.05);assert(math.abs(g:snapshot().players[1].inputElapsed-.1)<1e-9,'held input accumulates simulated time')
assert(not g:input(p,{x=-1,y=0,seq=1}),'reject duplicate/out of order input')
assert(p.ix==1);assert(not g:input(p,{x=1,y=0,seq=1.5}));assert(not g:input(p,{x=1,y=0,seq=0/0}))
g:input(p,{x=0,y=1,boost=true,seq=2});g:input(p,{x=1,y=0,seq=3});g:step(.05);s=g:snapshot();assert(s.players[1].inputSeq==3 and s.players[1].by==1,'coalesced inputs ack latest, boost direction preserved')
g:disconnect('a');g:join('a2','A','#38bdf8',p.token);assert(g:snapshot().players[1].inputSeq==0,'reconnect resets ack')
g.remaining=0;g:step(.05);g:again();g:start();assert(g:snapshot().roundId==2,'new round changes generation')
print('PASS motion protocol: applied ack, held time, sequence validation, coalescing, reconnect, round')
local h=G.new();local a=h:join('a','A','#38bdf8');h:join('b','B','#fb7185');h:start();h.batteries={};a.x=0;a.y=0;a.stun=1
assert(not h:input(a,{x=1,y=0,boost=true,seq=1}));assert(h:snapshot().players[1].inputSeq==0,'stunned receipt is not acknowledgement')
h:step(0,.1);assert(h:snapshot().players[1].inputSeq==0,'stunned skipped time is not acknowledgement')
h:step(.05);assert(h:snapshot().players[1].inputSeq==1 and a.x==0 and a.boost==0,'stunned no-op is acknowledged by physics tick')
a.stun=0;h:input(a,{x=1,y=0,seq=2});h:step(.05);h:step(0,.4);assert(a.ix==0 and a.boost==0,'stale authority clears held input')
assert(h:snapshot().players[1].inputElapsed==.05,'skipped time never expands ack simulated duration')
h:disconnect('a');h:join('new','A','#38bdf8',a.token);assert(h:input(a,{x=0,y=0,seq=1}),'new connection accepts fresh sequence')
print('PASS motion no-op ack, stale input and skipped time, reconnect sequence restart')
