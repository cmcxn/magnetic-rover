local skynet = require "skynet"
local function call(a, cmd, ...)
    return skynet.call(a, "lua", cmd, ...)
end
local M = {}
function M.run()
    local a, b = skynet.newservice("poc_room"), skynet.newservice("poc_room")
    assert(call(a, "open", "world") == 8)
    assert(call(b, "open", "world") == 8)
    local function probe(addr, x, y)
        local events=call(addr,"collision_probe",x,y)
        assert(#events==1,"expected one collision callback in the correct room")
        local e=events[1]
        assert((e.a==x and e.b==y) or (e.a==y and e.b==x), "callback returned incorrect body IDs")
    end
    local start = call(b, "snapshot")
    assert(#start == 8)
    local function same(s, t)
        assert(#s == #t)
        for i = 1, #s do
            for _, k in ipairs({"x", "y", "angle", "vx", "vy"}) do
                assert(math.abs(s[i][k] - t[i][k]) < 1e-9, ("state differed %d %s"):format(i,k))
            end
        end
    end
    call(a, "advance", 20, {[1]={throttle=1, steer=0.25}})
    local moved = call(a, "snapshot")
    assert(math.abs(moved[1].x - start[1].x) + math.abs(moved[1].y - start[1].y) > 0.01)
    same(start, call(b, "snapshot"))
    assert(not pcall(call, a, "failure"), "injected Lua exception must fail RPC")
    same(start, call(b, "snapshot"))
    local function verify_destroyed(old)
        for _=1, 30 do
            if not pcall(call, old, "ping") then return end
            skynet.sleep(1)
        end
        error("room service did not exit")
    end
    probe(a,1,4)
    same(start, call(b,"snapshot"))
    call(a, "destroy")
    verify_destroyed(a)
    for _ = 1, 24 do
        local c = skynet.newservice("poc_room")
        assert(call(c, "open", "world") == 8)
        same(start, call(c, "snapshot"))
        call(c, "advance", 6, {[2]={throttle=1, steer=0.5}})
        call(c, "destroy")
        verify_destroyed(c)
    end
    same(start, call(b, "snapshot"))
    probe(b,5,7)
    call(b,"destroy")
    verify_destroyed(b)
    print("ACTOR_PASS isolated=true rpc_error_contained=true recreate_cycles=24")
end
return M
