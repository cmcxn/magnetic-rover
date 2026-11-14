-- POC only: rectangular rigid bodies in a zero-gravity world.
-- Chipmunk owns collision detection/impulses, mass/inertia and integration.
-- Lua owns the arcade throttle, steering, speed caps and rolling resistance.
local cp = require 'moonchipmunk'
local M = {}
local World = {}; World.__index = World
local function finite(v) return type(v)=='number' and v==v and math.abs(v)<math.huge end
local function clamp(v,lo,hi) return math.max(lo,math.min(hi,v)) end
local function live(self) assert(not self.closed,'world is closed') end
local function setting(o,k,d) if o[k]==nil then return d end; assert(finite(o[k]),'invalid '..k); return o[k] end
function M.new(o)
    o=o or {}
    local self=setmetatable({cars={},shapes={},shape_ids={},events={},collision_count=0,event_dropped=0,steps=0},World)
    self.width=setting(o,'width',2); self.height=setting(o,'height',1)
    self.bounds=setting(o,'bounds',20); self.linear_drag=setting(o,'linear_drag',.6)
    self.angular_drag=setting(o,'angular_drag',2); self.acceleration=setting(o,'acceleration',10)
    self.turn_acceleration=setting(o,'turn_acceleration',8); self.max_speed=setting(o,'max_speed',15)
    self.max_angular_speed=setting(o,'max_angular_speed',4); self.event_limit=setting(o,'event_limit',256)
    local n=setting(o,'n',8); local mass=setting(o,'mass',1)
    local elasticity=setting(o,'elasticity',.5); local friction=setting(o,'friction',.3)
    assert(n>=1 and n%1==0 and n<=128,'invalid car count')
    assert(self.width>0 and self.height>0 and mass>0 and self.bounds>self.width,'invalid geometry or mass')
    assert(self.linear_drag>=0 and self.angular_drag>=0 and self.max_speed>0 and self.max_angular_speed>0,'invalid control limits')
    assert(elasticity>=0 and elasticity<=1 and friction>=0 and self.event_limit>=0 and self.event_limit%1==0,'invalid material or event limit')
    self.space=cp.space_new()
    self.space:set_gravity({0,0}); self.space:set_damping(1)
    self.space:set_iterations(10); self.space:set_collision_slop(.01)
    local function addshape(shape,id)
        shape:set_friction(friction); shape:set_elasticity(elasticity)
        self.space:add_shape(shape); self.shapes[#self.shapes+1]=shape; self.shape_ids[shape]=id
    end
    for i=1,n do
        local body=cp.body_new(mass,cp.moment_for_box(mass,self.width,self.height))
        self.space:add_body(body); self.cars[i]=body
        local theta=i*2*math.pi/n; local radius=math.min(8,self.bounds*.4)
        body:set_position({radius*math.cos(theta),radius*math.sin(theta)})
        body:set_angle(theta+math.pi)
        addshape(cp.box_shape_new(body,self.width,self.height,0),i)
    end
    local b=self.bounds; local static=self.space:get_static_body()
    for _,line in ipairs({{-b,-b,b,-b},{b,-b,b,b},{b,b,-b,b},{-b,b,-b,-b}}) do
        addshape(cp.segment_shape_new(static,{line[1],line[2]},{line[3],line[4]},0),0)
    end
    self.handler=self.space:add_default_collision_handler()
    self.handler:set_begin_func(function(arbiter)
        local a,b=arbiter:get_shapes()
        self.collision_count=self.collision_count+1
        if #self.events<self.event_limit then
            self.events[#self.events+1]={a=self.shape_ids[a],b=self.shape_ids[b],step=self.steps}
        else self.event_dropped=self.event_dropped+1 end
        return true
    end)
    return self
end
function World:set_car(i,v)
    live(self); local body=assert(self.cars[i],'invalid car index')
    for k,x in pairs(v) do assert(finite(x),'invalid car value '..k) end
    local p=body:get_position(); local velocity=body:get_velocity()
    body:set_position({v.x or p[1],v.y or p[2]})
    body:set_velocity({v.vx or velocity[1],v.vy or velocity[2]})
    if v.angle~=nil then body:set_angle(v.angle) end
    if v.angular_velocity~=nil then body:set_angular_velocity(v.angular_velocity) end
    if v.mass~=nil then
        assert(v.mass>0,'mass must be positive'); body:set_mass(v.mass)
        body:set_moment(cp.moment_for_box(v.mass,self.width,self.height))
    end
    self.space:reindex_shapes_for_body(body)
end
function World:apply_controls(dt,inputs)
    live(self); assert(finite(dt) and dt>0 and dt<=.1,'invalid fixed timestep')
    local drag=math.exp(-self.linear_drag*dt); local adrag=math.exp(-self.angular_drag*dt)
    for i,body in ipairs(self.cars) do
        local input=inputs and inputs[i] or nil
        local throttle=input and input.throttle or 0; local steer=input and input.steer or 0
        assert(finite(throttle) and finite(steer),'invalid input')
        throttle=clamp(throttle,-1,1); steer=clamp(steer,-1,1)
        local v=body:get_velocity(); local angle=body:get_angle()
        local vx=v[1]*drag+math.cos(angle)*throttle*self.acceleration*dt
        local vy=v[2]*drag+math.sin(angle)*throttle*self.acceleration*dt
        local speed=math.sqrt(vx*vx+vy*vy)
        if speed>self.max_speed then local scale=self.max_speed/speed; vx=vx*scale; vy=vy*scale end
        body:set_velocity({vx,vy})
        body:set_angular_velocity(clamp(body:get_angular_velocity()*adrag+steer*self.turn_acceleration*dt,-self.max_angular_speed,self.max_angular_speed))
    end
end
function World:physics_step(dt)
    live(self); assert(finite(dt) and dt>0 and dt<=.1,'invalid fixed timestep')
    self.steps=self.steps+1
    self.space:step(dt)
end
function World:step(dt,inputs)
    self:apply_controls(dt,inputs)
    self:physics_step(dt)
end
function World:snapshot()
    live(self); local out={}
    for i,b in ipairs(self.cars) do
        local p=b:get_position(); local v=b:get_velocity()
        out[i]={x=p[1],y=p[2],vx=v[1],vy=v[2],angle=b:get_angle(),angular_velocity=b:get_angular_velocity()}
    end
    return out
end
function World:drain_events()
    live(self); local out=self.events; self.events={}; return out
end
function World:close()
    if self.closed then return end
    -- Space removal alone does not destroy dynamic bodies in upstream binding.
    -- Explicit free order: shapes, bodies, then space (which owns its handler).
    for _,s in ipairs(self.shapes) do s:free() end
    for _,b in ipairs(self.cars) do b:free() end
    self.space:free()
    self.closed=true; self.space=nil; self.handler=nil
    self.shapes={}; self.cars={}; self.shape_ids={}; self.events={}
end
return M
