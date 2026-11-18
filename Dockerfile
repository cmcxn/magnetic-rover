# Multi-architecture runtime published by cmcxn/skynet-demo; pin the manifest digest.
ARG SKYNET_RUNTIME=chenmins/skynet-demo:sha-f1baee5051108fce40588738f4a5960f12edea97@sha256:9cbaa652cb9f37b8f6025a54d76d9fd18315852c70653b038be972ee074b2d8c
FROM node:24.18.1-bookworm-slim AS frontend
WORKDIR /build/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm test && npm run build

# Build against the target runtime's libc and the project's embedded Lua headers.
FROM ${SKYNET_RUNTIME} AS physics
USER root
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev && rm -rf /var/lib/apt/lists/*
COPY skynet-source.tar verification/box2d-poc/native.c verification/box2d-poc/vendor/box2d-3.1.1-src.tar.gz ./
RUN echo "f7c509d54e4e02be3007a468eb3bed36e3319cca303c6e33d0c41fd4745f30cc  box2d-3.1.1-src.tar.gz" | sha256sum -c - && \
    tar -xzf box2d-3.1.1-src.tar.gz && tar -xf skynet-source.tar 3rd/lua && \
    gcc -O2 -std=gnu17 -fPIC -shared -I3rd/lua -Iinclude native.c src/*.c -lm -o native.so

FROM ${SKYNET_RUNTIME} AS runtime
USER root
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/ /app/server/
COPY --from=frontend /build/client/dist/ /app/client/dist/
COPY licenses/ /app/licenses/
ENV SKYNET_ROOT=/skynet/ ROVER_BIND=0.0.0.0 ROVER_SERVER=/app/server/ ROVER_CLIENT=/app/client/dist
# Historical fixtures use legacy arena/supply settings and speed 240. Dedicated
# tests cover default/overridden arena, density, refill timing and motion tuning.
# Their Lua fixtures already run above with explicit expectations; do not rerun
# test_tuning.lua under the historical environment used by the general suite.
RUN export ROVER_BOOST_RAMP=0 ROVER_BOOST_TOP_FACTOR=1 ROVER_BOOST_RECOVERY=0 && cd /app/server && sh test_base_speed.sh && sh test_tuning.sh && sh test_arena_supply.sh && \
    for test in test_*.lua; do \
      if [ "$test" != test_base_speed.lua ] && [ "$test" != test_tuning.lua ]; then ROVER_MAP_SCALE=1 ROVER_SUPPLY_SPEED=1 ROVER_BASE_SPEED=240 ROVER_VEHICLE_SCALE=1 ROVER_BOOST_MULTIPLIER=3 ROVER_BOOST_COOLDOWN=4 ROVER_BOOST_DURATION=.32 /skynet/3rd/lua/lua "$test" || exit 1; fi; \
    done
COPY --from=physics /build/native.so /skynet/luaclib/native.so
COPY --from=physics /build/LICENSE /app/licenses/Box2D.LICENSE
COPY verification/box2d-poc/adapter.lua verification/box2d-poc/box2d_main.lua /app/server/
COPY verification/box2d-poc/cases.lua verification/box2d-poc/poc.lua /app/server/
RUN sed "s/^start = 'main'$/start = 'poc'/" /app/server/config > /tmp/physics-test.conf && \
    timeout 60s env TEST=1 /skynet/skynet /tmp/physics-test.conf >/tmp/physics-test.log 2>&1 && \
    grep -Fx POC_PASS /tmp/physics-test.log || { cat /tmp/physics-test.log; exit 1; }
RUN sed -i "s/^start = 'main'$/start = 'box2d_main'/" /app/server/config && \
    grep -Fx "start = 'box2d_main'" /app/server/config && \
    rm /app/server/cases.lua /app/server/poc.lua /tmp/physics-test.conf /tmp/physics-test.log
USER 10001:10001
EXPOSE 18080
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 CMD curl -fsS http://127.0.0.1:18080/ >/dev/null || exit 1
ENTRYPOINT ["/skynet/skynet", "/app/server/config"]
CMD []
LABEL org.opencontainers.image.title="magnetic-rover" org.opencontainers.image.skynet-revision="f1baee5051108fce40588738f4a5960f12edea97"
