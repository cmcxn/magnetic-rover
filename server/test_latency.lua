package.path='./?.lua;'..package.path
local ok,L=pcall(require,'latency');assert(ok,'server latency handler exists')
local peer={};local reply=L.reply(peer,{id=1},0);assert(reply.type=='pong' and reply.id==1,'echo only valid ID')
assert(L.reply(peer,{id=2147483647},.1).id==2147483647,'max safe protocol ID')
assert(not L.reply(peer,{id=2},.2),'at most two ping replies per second')
assert(L.reply(peer,{id=3},1).id==3,'rate budget renews')
for _,id in ipairs({0,-1,1.5,2147483648,math.huge,0/0,'1',{},true}) do
 local result,err=L.reply({}, {id=id,extra='never echo'},0);assert(not result and err=='Invalid ping','reject malformed ping identifier')
end
assert(not L.reply({}, {},0),'missing ID rejected')
print('PASS latency protocol: bounded integer IDs, exact echo, two replies/sec per peer, malformed rejection')
