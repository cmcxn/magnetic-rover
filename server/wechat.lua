local json=require 'json'
local W={}
W.rejected='用户名称不合规，请修改后重试'
W.unavailable='审核暂时不可用，请稍后重试'

function W.config(getenv,path)
 local values={}
 local file=io.open(path or '.env.wechat','r')
 if file then
  for line in file:lines() do
   local key,value=line:match('^%s*(WECHAT_[A-Z_]+)%s*=%s*(.-)%s*$')
   if key then values[key]=value end
  end
  file:close()
 end
 local function read(key,default)
  local value=getenv(key)
  if value and value~='' then return value end
  return values[key]~='' and values[key] or default
 end
 return {appid=read('WECHAT_APP_ID','wx570e397999b5bf8e'),secret=read('WECHAT_APP_SECRET')}
end

local function escape(value)
 return (value:gsub('[^%w_.~-]',function(c) return string.format('%%%02X',c:byte()) end))
end

function W.new(config,request,now)
 local token,expires
 local api={}
 local function call(method,path,data)
  local ok,status,body=pcall(request,method,path,data and json.encode(data))
  if not ok or status~=200 then return end
  local parsed,result=pcall(json.decode,body)
  if parsed and type(result)=='table' then return result end
 end
 function api.exchange(code)
  if not config.secret or type(code)~='string' or #code<1 or #code>512 then return end
  local result=call('GET','/sns/jscode2session?appid='..escape(config.appid)..'&secret='..escape(config.secret)..'&js_code='..escape(code)..'&grant_type=authorization_code')
  if result and (result.errcode==nil or result.errcode==0) and type(result.openid)=='string' and result.openid:match('^[%w_-]+$') then
   return result.openid
  end
 end
 function api.review(openid,name)
  if not config.secret or not openid then return nil,W.unavailable end
  if not token or now()>=expires then
   local result=call('POST','/cgi-bin/stable_token',{
    grant_type='client_credential',appid=config.appid,secret=config.secret,force_refresh=false,
   })
   if not result or (result.errcode~=nil and result.errcode~=0) or type(result.access_token)~='string' or result.access_token=='' or type(result.expires_in)~='number' or result.expires_in<=0 then
    return nil,W.unavailable
   end
   token=result.access_token
   expires=now()+result.expires_in-math.min(60,result.expires_in/10)
  end
  local result=call('POST','/wxa/game/content_spam/msg_sec_check?access_token='..escape(token),{
   openid=openid,version=2,scene=1,content=name,
  })
  if result and (result.errcode==40001 or result.errcode==42001) then token=nil end
  local suggest=result and result.errcode==0 and type(result.result)=='table' and result.result.suggest
  if suggest=='pass' then return true end
  return nil,suggest=='risky' and W.rejected or W.unavailable
 end
 return api
end
return W
