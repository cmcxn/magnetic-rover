-- Exercise the actual static handler root-selection expression without Skynet I/O.
local f=assert(io.open('main.lua','r'));local source=f:read('*a');f:close()
local expression=assert(source:match('local root=([^\n]+)'), 'static root expression')
local function root(client,server)
 local env={os={getenv=function(name) return ({ROVER_CLIENT=client,ROVER_SERVER=server})[name] end}}
 return assert(load('return '..expression,'static-root','t',env))()
end
assert(root('/custom/public','/repo/server/')=='/custom/public','explicit client root retained')
assert(root(nil,'/repo/server/')=='/repo/server/../client/dist','server directory derives portable public root')
assert(root(nil,'/repo/server')=='/repo/server/../client/dist','server directory accepts optional trailing slash')
assert(root(nil,nil)=='./server/../client/dist','no-env fallback assumes repository working directory')
print('PASS portable HTTP client root: explicit override, server-relative default, trailing slash, repository cwd fallback')
