#include <box2d/box2d.h>
#include <lauxlib.h>
#include <lua.h>
#include <math.h>
#include <stdint.h>
#include <time.h>
#define SCALE 100.0f
typedef struct {
    b2WorldId id;
    b2BodyId car[8];
    int count;
} World;
static World *world(lua_State *L) { return luaL_checkudata(L, 1, "rover.world"); }
static int close_world(lua_State *L) {
    World *w = world(L);
    if (b2World_IsValid(w->id))
        b2DestroyWorld(w->id);
    w->id = b2_nullWorldId;
    return 0;
}
static float field(lua_State *L, int index, const char *name) {
    lua_getfield(L, index, name);
    float v = luaL_checknumber(L, -1);
    lua_pop(L, 1);
    return v;
}
static int create(lua_State *L) {
    float radius = luaL_checknumber(L, 3) / SCALE, size = luaL_checknumber(L, 4) / SCALE;
    int count = luaL_len(L, 1);
    luaL_argcheck(L, count >= 1 && count <= 8, 1, "1..8 cars");
    World *w = lua_newuserdatauv(L, sizeof *w, 0);
    b2WorldDef wd = b2DefaultWorldDef();
    wd.gravity = (b2Vec2){0, 0};
    w->id = b2CreateWorld(&wd);
    w->count = count;
    luaL_setmetatable(L, "rover.world");
    b2BodyDef bd = b2DefaultBodyDef();
    b2ShapeDef sd = b2DefaultShapeDef();
    b2BodyId ground = b2CreateBody(w->id, &bd);
    for (int i = 0; i < 96; i++) {
        float a = i * 2 * M_PI / 96, b = (i + 1) * 2 * M_PI / 96;
        b2Segment edge = {{radius * cosf(a), radius * sinf(a)},
                          {radius * cosf(b), radius * sinf(b)}};
        b2CreateSegmentShape(ground, &sd, &edge);
    }
    for (int i = 1; i <= luaL_len(L, 2); i++) {
        lua_geti(L, 2, i);
        lua_getfield(L, -1, "bodyRadius");
        if (lua_isnil(L, -1)) {
            lua_pop(L, 2);
            continue;
        } // Trigger-only station
        lua_pop(L, 1);
        b2Circle c = {{field(L, -1, "x") / SCALE, field(L, -1, "y") / SCALE},
                      field(L, -1, "bodyRadius") / SCALE};
        b2CreateCircleShape(ground, &sd, &c);
        lua_pop(L, 1);
    }
    bd.type = b2_dynamicBody;
    bd.isBullet = true;
    bd.angularDamping = 1.5f;
    // The solver applies restitution to the normal approach speed at the
    // contact point. Off-centre impulses produce yaw through the lever arm.
    sd.material.restitution = 0.53f;
    sd.enableContactEvents = true;
    b2Polygon rect = b2MakeBox(size * .9f, size * .62f);
    for (int i = 0; i < count; i++) {
        lua_geti(L, 1, i + 1);
        bd.position = (b2Vec2){field(L, -1, "x") / SCALE, field(L, -1, "y") / SCALE};
        lua_getfield(L, -1, "angle");
        bd.rotation = b2MakeRot(luaL_optnumber(L, -1, 0));
        lua_pop(L, 2);
        w->car[i] = b2CreateBody(w->id, &bd);
        sd.userData = (void *)(intptr_t)(i + 1);
        b2CreatePolygonShape(w->car[i], &sd, &rect);
    }
    return 1;
}
static void put(lua_State *L, int key, float value) {
    lua_pushnumber(L, value);
    lua_seti(L, -2, key);
}
static int step(lua_State *L) {
    World *w = world(L);
    float dt = luaL_checknumber(L, 3);
    int n = luaL_checkinteger(L, 4);
    luaL_argcheck(L, b2World_IsValid(w->id) && luaL_len(L, 2) == w->count, 1,
                  "inactive world or roster changed");
    luaL_argcheck(L, (n == 1 || n == 3) && dt > 0 && dt <= .051, 3, "invalid step");
    for (int i = 0; i < w->count; i++) {
        lua_geti(L, 2, i + 1);
        b2Body_SetLinearVelocity(w->car[i],
                                 (b2Vec2){field(L, -1, "vx") / SCALE, field(L, -1, "vy") / SCALE});
        lua_getfield(L, -1, "steerOmega");
        if (lua_isnumber(L, -1))
            b2Body_SetAngularVelocity(w->car[i], lua_tonumber(L, -1));
        lua_pop(L, 2);
    }
    lua_newtable(L);
    int events = lua_gettop(L), total = 0;
    b2Vec2 points[8][3];
    for (int s = 0; s < n; s++) {
        b2Vec2 incoming[9] = {{0, 0}};
        for (int i = 0; i < w->count; i++)
            incoming[i + 1] = b2Body_GetLinearVelocity(w->car[i]);
        b2World_Step(w->id, dt / n, 1);
        for (int i = 0; i < w->count; i++)
            points[i][s] = b2Body_GetPosition(w->car[i]);
        b2ContactEvents ev = b2World_GetContactEvents(w->id);
        for (int j = 0; j < ev.beginCount; j++) {
            b2ContactBeginTouchEvent e = ev.beginEvents[j];
            intptr_t a = (intptr_t)b2Shape_GetUserData(e.shapeIdA),
                     b = (intptr_t)b2Shape_GetUserData(e.shapeIdB);
            lua_createtable(L, 9, 0);
            put(L, 1, a);
            put(L, 2, b);
            put(L, 3, e.manifold.normal.x);
            put(L, 4, e.manifold.normal.y);
            put(L, 5, s * dt / n);
            put(L, 6, incoming[a].x * SCALE);
            put(L, 7, incoming[a].y * SCALE);
            put(L, 8, incoming[b].x * SCALE);
            put(L, 9, incoming[b].y * SCALE);
            lua_seti(L, events, ++total);
        }
    }
    lua_newtable(L);
    for (int i = 0; i < w->count; i++) {
        b2BodyId id = w->car[i];
        b2Vec2 p = b2Body_GetPosition(id), v = b2Body_GetLinearVelocity(id);
        lua_createtable(L, 6, 0);
        put(L, 1, p.x * SCALE);
        put(L, 2, p.y * SCALE);
        put(L, 3, v.x * SCALE);
        put(L, 4, v.y * SCALE);
        put(L, 5, b2Rot_GetAngle(b2Body_GetRotation(id)));
        put(L, 6, b2Body_GetAngularVelocity(id));
        for (int s = 0; s < n - 1; s++) {
            put(L, 7 + 2 * s, points[i][s].x * SCALE);
            put(L, 8 + 2 * s, points[i][s].y * SCALE);
        }
        lua_seti(L, -2, i + 1);
    }
    return 2;
}
static int now(lua_State *L) {
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    lua_pushnumber(L, t.tv_sec + t.tv_nsec * 1e-9);
    return 1;
}
// Isolate solver cost from binding marshalling. Warmup and measured iterations
// use the same alternating velocity drive. Keep the room awake throughout.
static int micro(lua_State *L) {
    World *w = world(L);
    int steps = luaL_checkinteger(L, 2);
    luaL_argcheck(L, b2World_IsValid(w->id), 1, "closed world");
    luaL_argcheck(L, steps == 1 || steps == 3, 2, "expected 1 or 3 steps");
    lua_createtable(L, 10000, 0);
    for (int tick = 0; tick < 11000; tick++) {
        for (int i = 0; i < w->count; i++) {
            float angle = i * 0.785398f + (tick / 32) * 1.71f;
            b2Body_SetLinearVelocity(w->car[i], (b2Vec2){3.6f * cosf(angle), 3.6f * sinf(angle)});
        }
        struct timespec begin, end;
        clock_gettime(CLOCK_MONOTONIC, &begin);
        for (int j = 0; j < steps; j++)
            b2World_Step(w->id, 0.05f / steps, 1);
        clock_gettime(CLOCK_MONOTONIC, &end);
        if (tick >= 1000) {
            lua_pushnumber(L, (end.tv_sec - begin.tv_sec) * 1e6 +
                                  (end.tv_nsec - begin.tv_nsec) * 1e-3);
            lua_seti(L, -2, tick - 999);
        }
    }
    return 1;
}
int luaopen_native(lua_State *L) {
    luaL_checkversion(L);
    luaL_newmetatable(L, "rover.world");
    lua_pushcfunction(L, close_world);
    lua_setfield(L, -2, "__gc");
    lua_pop(L, 1);
    luaL_Reg api[] = {{"new", create}, {"step", step},   {"close", close_world},
                      {"now", now},    {"micro", micro}, {NULL, NULL}};
    luaL_newlib(L, api);
    return 1;
}
