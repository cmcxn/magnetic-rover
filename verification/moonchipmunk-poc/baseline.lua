-- Pure-Lua comparison, using the unchanged pinned production collision solver.
-- Geometry/response differ from Chipmunk: continuous circles, circular arena,
-- fixed impulses, no collision-induced angular response or friction/mass.
local M={}
local World={}; World.__index=World
local module_path=debug.getinfo(1,"S").source:sub(2):match("^(.*)/[^/]+$") or "."
local function clamp(v,lo,hi) return math.max(lo,math.min(hi,v)) end
function M.new(opts)
 opts=opts or {}
 local self=setmetatable({cars={},closed=false,collision_count=0,events={}},World)
 self.acceleration=opts.acceleration or 10
 self.turn_acceleration=opts.turn_acceleration or 8
 self.linear_drag=opts.linear_drag or .6
 self.angular_drag=opts.angular_drag or 2
 self.max_speed=opts.max_speed or 15
 self.max_angular_speed=opts.max_angular_speed or 4
 -- Config injection affects only this fresh solver closure, never package.loaded.
 local config={collisionRadius=(opts.width or 2)/2,arenaRadius=opts.bounds or 20}
 local env=setmetatable({require=function(name)
  assert(name=="game_config","unexpected upstream dependency: "..name)
  return config
 end},{__index=_G})
 local path=opts.baseline_source or module_path.."/.build/rover/server/vehicle_collision.lua"
 self.solver=assert(loadfile(path,"t",env))()
 local n=opts.count or 8
 for i=1,n do
  local theta=i*2*math.pi/n
  self.cars[i]={id=i,x=8*math.cos(theta),y=8*math.sin(theta),angle=theta+math.pi,vx=0,vy=0,angular_velocity=0}
 end
 return self
end
function World:apply_controls(dt,inputs)
 assert(not self.closed,"closed world"); assert(dt>0 and dt<1,"invalid step")
 inputs=inputs or {}
 local linear=math.exp(-self.linear_drag*dt)
 local angular=math.exp(-self.angular_drag*dt)
 for i,p in ipairs(self.cars) do
  local input=inputs[i] or {}
  local throttle=clamp(input.throttle or 0,-1,1)
  local steer=clamp(input.steer or 0,-1,1)
  p.vx=p.vx*linear+math.cos(p.angle)*throttle*self.acceleration*dt
  p.vy=p.vy*linear+math.sin(p.angle)*throttle*self.acceleration*dt
  local speed=math.sqrt(p.vx*p.vx+p.vy*p.vy)
  if speed>self.max_speed then p.vx=p.vx*self.max_speed/speed;p.vy=p.vy*self.max_speed/speed end
  p.angular_velocity=clamp(p.angular_velocity*angular+steer*self.turn_acceleration*dt,-self.max_angular_speed,self.max_angular_speed)
  p.angle=p.angle+p.angular_velocity*dt
 end
end
function World:physics_step(dt)
 self.solver.resolve(self.cars,dt,function(events)
  self.collision_count=self.collision_count+#events
  -- Bound diagnostics storage identically for all loads.
  for _,e in ipairs(events) do
   if #self.events<256 then self.events[#self.events+1]={a=e.a.id,b=e.b and e.b.id or 0,wall=e.wall or false} end
  end
 end)
end
function World:step(dt,inputs)
 self:apply_controls(dt,inputs)
 self:physics_step(dt)
end
function World:snapshot()
 assert(not self.closed,"closed world")
 local out={}
 for i,p in ipairs(self.cars) do out[i]={x=p.x,y=p.y,angle=p.angle,vx=p.vx,vy=p.vy,angular_velocity=p.angular_velocity} end
 return out
end
function World:set_car(i,values)
 assert(not self.closed,"closed world")
 local p=assert(self.cars[i],"car index")
 for _,k in ipairs{"x","y","angle","vx","vy","angular_velocity"} do if values[k]~=nil then p[k]=values[k] end end
end
function World:drain_events() local out=self.events;self.events={};return out end
function World:close() self.closed=true;self.cars={};self.events={};self.solver=nil end
return M
