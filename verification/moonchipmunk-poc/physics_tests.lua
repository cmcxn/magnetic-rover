-- Tests run inside a real Skynet Service. Every case checks physical outcomes.
local M = {}
local function check(v, msg) assert(v, msg) end
local function near(a,b,eps,msg) assert(math.abs(a-b)<=eps, (msg or 'not near')..': '..a..' vs '..b) end
local function finite(x) return x == x and x ~= math.huge and x ~= -math.huge end
function M.run(opts)
    opts = opts or {}
    local World = require 'world'
    local dt = opts.dt or 1/60
    local results = {}
    local function case(name, fn)
        local opts = {n=8, bounds=40, linear_drag=0, angular_drag=0,
                      elasticity=1, friction=0, max_speed=100, max_angular_speed=100}
        local w = World.new(opts)
        -- Unused cars are safely parked far from the collision lane.
        for i=1,8 do w:set_car(i,{x=-30+i*4,y=25,vx=0,vy=0,angle=0}) end
        local function advance(seconds, inputs)
            for _=1,math.floor(seconds/dt+.5) do w:step(dt,inputs) end
        end
        local ok,err = xpcall(function() fn(w,advance) end, debug.traceback)
        w:close()
        assert(ok, name..': '..tostring(err))
        results[#results+1] = {name=name, passed=true, dt=dt}
    end
    case('head_on_bounce', function(w,run)
        w:set_car(1,{x=-4,y=0,vx=4,vy=0}); w:set_car(2,{x=4,y=0,vx=-4,vy=0})
        run(1.25)
        local s=w:snapshot()
        check(s[1].vx < -3 and s[2].vx > 3,'cars must reverse after elastic impact')
        check(w.collision_count>0,'missing collision callback')
        near(s[1].vx+s[2].vx,0,.1,'equal-mass momentum')
        local events=w:drain_events(); check(#events>0 and events[1].a~=events[1].b,'collision ids')
        check(#w:drain_events()==0,'drain must clear bounded event buffer')
    end)
    case('oblique_collision_rotation',function(w,run)
        w:set_car(1,{x=-5,y=.4,vx=5,vy=0}); w:set_car(2,{x=0,y=0,vx=0,vy=0})
        run(1.0)
        local s=w:snapshot()
        check(w.collision_count>0,'oblique contact missing')
        check(math.abs(s[1].angular_velocity)+math.abs(s[2].angular_velocity)>.1,'offset impact must generate spin')
        check(math.abs(s[1].angle)+math.abs(s[2].angle)>.01,'angle must change')
        check(math.abs(s[1].vx-5)>.1 and math.abs(s[2].vx)>.1,'velocities must change')
    end)
    case('push_stationary_car',function(w,run)
        w:set_car(1,{x=-5,y=0,vx=5,vy=0}); w:set_car(2,{x=0,y=0,vx=0,vy=0})
        run(1.2)
        local s=w:snapshot(); check(s[2].vx>4 and s[2].x>1,'stationary car not pushed')
    end)
    case('unequal_mass_collision',function(w,run)
        w:set_car(1,{x=-5,y=0,vx=6,vy=0,mass=1}); w:set_car(2,{x=0,y=0,vx=0,vy=0,mass=4})
        run(1.0)
        local s=w:snapshot()
        check(s[1].vx<0 and s[2].vx>0,'light car must recoil and heavy car move')
        near(s[1].vx+4*s[2].vx,6,.2,'unequal-mass momentum')
        near(s[1].vx,-3.6,.3,'unequal-mass recoil'); near(s[2].vx,2.4,.3,'heavy car velocity')
    end)
    case('static_boundary_bounce',function(w,run)
        w:set_car(1,{x=36,y=0,vx=6,vy=0}); run(1)
        local s=w:snapshot(); check(s[1].vx<0,'wall must reflect velocity')
        check(s[1].x<39.2 and s[1].x>-39.2,'car escaped bounds')
        local found=false; for _,e in ipairs(w:drain_events()) do if e.a==0 or e.b==0 then found=true end end
        check(found,'boundary contact event missing')
    end)
    case('eight_car_collision_chain',function(w,run)
        for i=1,8 do w:set_car(i,{x=-15+(i-1)*3,y=0,vx=i==1 and 10 or 0,vy=0}) end
        run(2)
        local s=w:snapshot(); check(w.collision_count>=7,'collision impulse did not traverse chain')
        check(s[8].vx>1,'last car did not receive momentum')
        for _,v in ipairs(s) do check(finite(v.x) and finite(v.vx) and finite(v.angle),'non-finite state') end
    end)
    -- Rolling resistance and steering are custom Lua controls, not contact friction.
    do
        local w=World.new{n=8,bounds=100,linear_drag=1,angular_drag=2}
        for i=1,8 do w:set_car(i,{x=-40+i*5,y=30}) end
        w:set_car(1,{x=0,y=0,angle=0})
        for _=1,math.floor(1/dt+.5) do w:step(dt,{{throttle=1,steer=.2}}) end
        local before=w:snapshot()[1]
        check(before.vx>1 and math.abs(before.angle)>.01,'throttle/steering input not applied')
        local speed=math.sqrt(before.vx^2+before.vy^2)
        for _=1,math.floor(2/dt+.5) do w:step(dt) end
        local after=w:snapshot()[1]
        check(math.sqrt(after.vx^2+after.vy^2)<speed*.2,'neutral input should decelerate')
        w:close(); results[#results+1]={name='accelerate_steer_release_decelerate',passed=true,dt=dt}
    end
    do
        local w=World.new(); local original=w:snapshot()
        check(#original==8,'default world must have eight cars')
        w:set_car(1,{x=1,y=2,vx=3}); w:step(dt); w:close(); w:close()
        check(not pcall(function() w:step(dt) end),'closed world must reject stepping')
        local fresh=World.new(); local s=fresh:snapshot()
        for i=1,8 do near(s[i].x,original[i].x,1e-9,'new world position'); near(s[i].vx,0,1e-9,'new world velocity') end
        check(fresh.collision_count==0,'new world retained collision count')
        fresh:close(); results[#results+1]={name='destroy_recreate_state',passed=true,dt=dt}
    end
    return results
end
return M
