local json=require 'json'
local W=require 'wechat'
local Rooms=require 'rooms'
local path=os.tmpname()
local file=assert(io.open(path,'w'))
file:write('WECHAT_APP_ID=file-app\nWECHAT_APP_SECRET=mock-file\n')
file:close()
local config=W.config(function(key)
 if key=='WECHAT_APP_ID' then return 'env-app' end
 if key=='WECHAT_APP_SECRET' then return '' end
end,path)
os.remove(path)
assert(config.appid=='env-app' and config.secret=='mock-file')

local mode,refreshes,clock='pass',0,0
local api=W.new(config,function(method,url,body)
 if method=='GET' then
  assert(url:find('appid=env-app',1,true))
  return 200,json.encode({openid='verified-id'})
 end
 local request=json.decode(body)
 if url=='/cgi-bin/stable_token' then
  assert(request.force_refresh==false)
  refreshes=refreshes+1
  return 200,json.encode({access_token='test-token',expires_in=100})
 end
 assert(request.openid=='verified-id' and request.version==2 and request.scene==1 and request.content=='新名称')
 if mode=='timeout' then error('simulated timeout') end
 if mode=='http' then return 503,'' end
 if mode=='bad-code' then return 200,'{"errcode":40001,"result":{"suggest":"pass"}}' end
 return 200,json.encode({errcode=0,result={suggest=mode,replaced_content='ignored'}})
end,function() return clock end)
local openid=assert(api.exchange('mock-code'))
local rooms=Rooms.new(function() return 'test-session' end,0,json.array)
rooms:handle(1,{type='join',name='初始名称'},0,openid)
local session=assert(rooms.connections[1])
for _,scenario in ipairs({'risky','review','timeout','http','bad-code','pass'}) do
 mode=scenario
 local allowed,reason=api.review(openid,'新名称')
 if allowed then rooms:handle(1,{type='set_name',name='新名称'},0) end
 if mode=='pass' then assert(session.name=='新名称')
 else
  assert(session.name=='初始名称')
  assert(reason==(mode=='risky' and W.rejected or W.unavailable))
 end
end
assert(refreshes==2)
clock=100
assert(api.review(openid,'新名称') and refreshes==3)
rooms:disconnect(1,0)
rooms:handle(2,{type='join',token=session.token,name='绕过审核'},0)
assert(not rooms.connections[2] and session.name=='新名称')
print('WeChat config priority, token cache, fail-closed review and session binding passed')
