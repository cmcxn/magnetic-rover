local skynet=require 'skynet'
local native=require 'native'
local json=require 'json'
local function stat()
 local f=assert(io.open('/proc/self/status'));local s=f:read('a');f:close()
 return tonumber(s:match('VmRSS:%s+(%d+)')),tonumber(s:match('VmHWM:%s+(%d+)'))
end
local function threadTimes()
 local result={}
 local status=assert(io.open('/proc/self/stat'))
 local pid=status:read('n');status:close()
 local file=assert(io.popen('ls /proc/'..pid..'/task'))
 for tid in file:lines() do
  local stat=io.open('/proc/self/task/'..tid..'/stat')
  if stat then
   local fields={};for part in stat:read('l'):gmatch('%S+') do fields[#fields+1]=part end
   result[tid]=tonumber(fields[14])+tonumber(fields[15]);stat:close()
  end
 end
 file:close();return result
end
local function run()
 math.randomseed(1701)
 local n=tonumber(os.getenv('MODE'));local count=tonumber(os.getenv('ROOMS'))
 if os.getenv('TEST')=='compat' then require('compat')(n);return end
 if os.getenv('TEST')=='1' then require('cases')();return end
 local collision=require 'vehicle_collision'
 local resolver=n==0 and collision.resolve or require 'adapter'
 local phys,round,lag={},{},{}
 collision.resolve=function(players,dt,cb,stations)
  local t=native.now();local paths=resolver(players,dt,cb,stations,n)
  phys[#phys+1]=(native.now()-t)*1000
  return paths
 end
 local rooms=require('rooms').new(nil,0,json.array)
 for r=1,count do
  local game=require('game').new();local room={id=tostring(r),game=game,ready={},clock=require('game_clock').new(game,0)}
  rooms.rooms[r]=room
  for i=1,8 do
   local fd=8*r+i;local p=assert(game:join(fd,'driver'..i))
   local session={room=room,player=p,fd=fd,protocolVersion=2,baseline=true,role='player'}
   rooms.connections[fd]=session;rooms.sessions[fd]=session
  end
  local core=game.step
  local tick=0
  function game:step(dt,...)
   if dt>0 then
    tick=tick+1
    for i,p in ipairs(self.players) do
     local heading=i*math.pi/4+math.floor(tick/32)*1.71
     self:input(p,{x=math.cos(heading),y=math.sin(heading),boost=tick%83<5})
    end
   end
   return core(self,dt,...)
  end
  assert(room.clock:start(0))
 end
 local start=skynet.now();local wake=start+5;local sync=start+10
 local begin,cpu,miss,catch=nil,nil,0,0
 local threads={}
 while true do
  skynet.sleep(math.max(1,wake-skynet.now()))
  local now=skynet.now();local elapsed=(now-start)/100
  if not begin and elapsed>=3 then threads=threadTimes();begin=native.now();cpu=os.clock();phys={};round={};lag={};miss=0;catch=0 end
  local t=native.now()
  lag[#lag+1]=(now-wake)*10
  wake=wake+5;if wake<=now then wake=now+5 end
  local clock=rooms.rooms[1].clock
  local steps=math.floor((clock.accumulator+elapsed-clock.last+1e-9)/.05)
  miss=miss+math.max(0,steps-5);catch=catch+math.max(0,math.min(steps,5)-1)
  rooms:advance(elapsed)
  if now>=sync then rooms:broadcastStates();rooms:drain();sync=sync+10;if sync<=now then sync=now+10 end end
  round[#round+1]=(native.now()-t)*1000
  if begin and native.now()-begin>=60 then break end
 end
 local duration=native.now()-begin
 local row={mode=n,rooms=count,seconds=duration,cpu=(os.clock()-cpu)*100/duration,miss=miss,catch=catch}
 local hot=0;for tid,v in pairs(threadTimes()) do hot=math.max(hot,v-(threads[tid] or v)) end
 row.hotThreadCPU=hot/duration -- Linux USER_HZ=100
 local _,peak=stat(); row.peakKiB=peak
 for name,samples in pairs({physics=phys,round=round,lag=lag}) do
  local encoded={}
  for i,v in ipairs(samples) do encoded[i]=math.floor(v*1000000+.5) end
  print('TRACE '..name..'_ns '..table.concat(encoded,','))
  table.sort(samples)
  for _,q in ipairs({95,99}) do row[name..q]=samples[math.ceil(#samples*q/100)] end
 end
 rooms=nil;phys=nil;round=nil;lag=nil;collectgarbage();collectgarbage();row.postKiB=stat()
 print('RESULT '..json.encode(row))
end
skynet.start(function()
 local ok,e=xpcall(run,debug.traceback)
 print(ok and 'POC_PASS' or ('POC_FAIL '..e))
 os.exit(ok and 0 or 1)
end)
