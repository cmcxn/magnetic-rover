#define _POSIX_C_SOURCE 200809L
#include <time.h>
#include "lua.h"
#include "lauxlib.h"
static int now(lua_State *L) {
    struct timespec t;
    if (clock_gettime(CLOCK_MONOTONIC, &t)) return luaL_error(L, "clock_gettime failed");
    lua_pushinteger(L, (lua_Integer)t.tv_sec * 1000000000 + t.tv_nsec);
    return 1;
}
int luaopen_poc_clock(lua_State *L) {
    lua_pushcfunction(L, now);
    return 1;
}
