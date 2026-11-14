local skynet = require "skynet"
require "skynet.manager"
local now = require "poc_clock"
local function call(a, cmd, ...)
    return skynet.call(a,"lua",cmd,...)
end
local function opts(k,d) return tonumber(os.getenv(k)) or d end
local function main()
    local mode = os.getenv("POC_MODE") or "test"
    if mode == "red" then require("actor_tests").run(); return end
    if mode == "test" then
        for _, hz in ipairs({20,60}) do
            local cases=require("physics_tests").run{dt=1/hz}
            assert(#cases==8)
            for _, c in ipairs(cases) do
                assert(c.passed)
                print(("CASE_PASS hz=%d name=%s"):format(hz,c.name))
            end
        end
        dofile("baseline_test.lua")
        print("PHYSICS_PASS")
        require("actor_tests").run()
        return
    end
    assert(mode == "bench","bad mode")
    local count, hz, sec = opts("POC_ROOMS",1), opts("POC_HZ",20), opts("POC_SECONDS",60)
    local kind = os.getenv("POC_WORLD") or "world"
    assert(hz==20 or hz==60); assert(count>=1 and count<=128 and count%1==0); assert(sec>0 and sec%1==0)
    local rooms = {}
    for i=1,count do
        rooms[i]=skynet.newservice("poc_room")
        assert(call(rooms[i],"open",kind)==8)
    end
    local start = now() + 2*1000000000
    local stop = start + sec*1000000000
    for _, a in ipairs(rooms) do call(a,"start",start,hz,sec) end
    assert(now()<start, "room setup missed epoch")
    print(("BENCH_BEGIN,%s,%d,%d,%d,%d,%d"):format(kind,count,hz,sec,start,stop))
    io.stdout:flush()
    for _, a in ipairs(rooms) do
        local stats = call(a,"result")
        print("ROOM,"..table.concat(stats,","))
    end
    for _, a in ipairs(rooms) do call(a,"destroy") end
    -- Allow service exits and freed-memory RSS sample to reach observer.
    skynet.sleep(5)
    for _, a in ipairs(rooms) do assert(not pcall(call,a,"ping"), "room still live") end
    print("DESTROYED,"..now()); io.stdout:flush()
    skynet.sleep(50)
end
skynet.start(function()
    local ok, err = xpcall(main,debug.traceback)
    if not ok then io.stderr:write(err,"\n"); io.stderr:flush() end
    print(ok and "POC_PASS" or "POC_FAIL")
    io.stdout:flush()
    skynet.abort()
end)
