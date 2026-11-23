local skynet = require "skynet"
local now = require "poc_clock"
local commands, world, completed, waiter = {}, nil, nil, nil
local function finish(stats)
    completed=stats
    if waiter then
        local response=waiter
        waiter=nil
        response(true, stats)
    end
end
function commands.open(kind)
    assert(not world)
    world=require(kind).new()
    return #world:snapshot()
end
function commands.snapshot() return world:snapshot() end
function commands.ping() return true end
function commands.advance(n,inputs)
    for _=1,n do world:step(1/20,inputs) end
end
function commands.collision_probe(first, second)
    -- Put just these two cars on a head-on course. Unique pairs ensure
    -- callbacks executed after cross-state load actually reach this world.
    for i=1,8 do world:set_car(i,{x=-14+i*3,y=12,vx=0,vy=0,angle=0,angular_velocity=0}) end
    world:drain_events()
    world:set_car(first,{x=-3,y=0,vx=5,angle=0})
    world:set_car(second,{x=3,y=0,vx=-5,angle=0})
    for _=1,18 do world:step(1/20) end
    return world:drain_events()
end
function commands.failure() error("intentional Lua room error") end
function commands.destroy()
    world:close()
    world=nil
    collectgarbage("collect")
    skynet.fork(skynet.exit)
    return true
end
local function histogram(bins, v, width)
    local bucket=math.min(10000, v//width)
    bins[bucket]=(bins[bucket] or 0)+1
end
local function serialize(bins)
    local entries={}
    for k,v in pairs(bins) do entries[#entries+1]=k..":"..v end
    return table.concat(entries,";")
end
local function simulate(epoch,hz,seconds)
    local N = seconds*hz
    local target = 1
    local steps, skipped, sum, max, dsum, dmax, snapshots = 0,0,0,0,0,0,0
    local solve_sum,solve_max=0,0
    local step_hist, delay_hist, solve_hist, inputs = {},{},{},{}
    for i=1,8 do inputs[i]={throttle=1,steer=0} end
    local snapshot_every=hz//10
    local fields={"x","y","angle","vx","vy","angular_velocity"}
    local function due(k) return epoch + (k-1)*1000000000//hz end
    local window_end=epoch+seconds*1000000000
    while target<=N do
        local wall=now()
        if wall>=window_end then
            skipped=skipped+N-target+1
            break
        end
        if wall < due(target) then
            skynet.sleep(1)
        else
            -- Fixed-duration steps. If chronically delayed, cap retained debt
            -- and expose dropped steps; never hide them in a variable dt.
            local eligible=math.min(N,1+(wall-epoch)*hz//1000000000)
            if eligible-target+1>5 then
                local drop=eligible-target-4
                skipped=skipped+drop
                target=target+drop
            end
            local advanced=0
            repeat
                for i=1,8 do
                    local phase=(target//(hz*2)+i)%6
                    inputs[i].throttle=phase==0 and 0 or 1
                    inputs[i].steer=phase==1 and -0.42 or (phase==4 and 0.45 or 0)
                end
                local t0=now()
                world:apply_controls(1/hz, inputs)
                local solve_start=now()
                world:physics_step(1/hz)
                local finish_time=now()
                local elapsed=finish_time-t0
                local solve_time=finish_time-solve_start
                solve_sum,solve_max=solve_sum+solve_time,math.max(solve_max,solve_time)
                histogram(solve_hist,solve_time,1000)
                local late=t0-due(target)
                steps=steps+1
                sum,max=sum+elapsed,math.max(max,elapsed)
                dsum,dmax=dsum+late,math.max(dmax,late)
                histogram(step_hist,elapsed,1000)
                histogram(delay_hist,late,100000)
                if target%snapshot_every==0 then
                    local s=world:snapshot()
                    assert(#s==8)
                    for _, car in ipairs(s) do
                        for _, k in ipairs(fields) do
                            local v=car[k]
                            assert(type(v)=="number" and v==v and math.abs(v)<math.huge, "non-finite snapshot field "..k)
                        end
                        assert(math.abs(car.x) < 22 and math.abs(car.y) < 22, "car escaped arena")
                    end
                    snapshots=snapshots+1
                end
                target=target+1
                advanced=advanced+1
            until target>N or advanced>=5 or now()<due(target) or now()>=window_end
            if target<=N then skynet.sleep(1) end
        end
    end
    assert(steps+skipped==N)
    assert(world.collision_count>0,"expected collisions in scripted load")
    return {steps, skipped, sum, max, dsum, dmax, snapshots, world.collision_count or 0,
        serialize(step_hist), serialize(delay_hist), solve_sum, solve_max, serialize(solve_hist)}
end
function commands.start(epoch,hz,sec)
    skynet.fork(function()
        local ok,result=xpcall(simulate,debug.traceback,epoch,hz,sec)
        if not ok then
            skynet.error(result)
            finish({"ERROR"})
        else finish(result) end
    end)
    return true
end
skynet.start(function()
    skynet.dispatch("lua",function(session,_,cmd,...)
        if cmd=="result" then
            if completed then skynet.retpack(completed)
            else waiter=skynet.response() end
            return
        end
        local ok,r=pcall(assert(commands[cmd],cmd),...)
        if not ok then error(r) end
        if session~=0 then skynet.retpack(r) end
    end)
end)
