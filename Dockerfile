# Multi-architecture runtime published by cmcxn/skynet-demo; pin the manifest digest.
ARG SKYNET_RUNTIME=chenmins/skynet-demo:sha-f1baee5051108fce40588738f4a5960f12edea97@sha256:9cbaa652cb9f37b8f6025a54d76d9fd18315852c70653b038be972ee074b2d8c
FROM node:24.18.1-bookworm-slim AS frontend
WORKDIR /build/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm test && npm run build

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
RUN cd /app/server && sh test_base_speed.sh && sh test_tuning.sh && sh test_arena_supply.sh && \
    for test in test_*.lua; do \
      if [ "$test" != test_base_speed.lua ]; then ROVER_MAP_SCALE=1 ROVER_SUPPLY_SPEED=1 ROVER_BASE_SPEED=240 ROVER_VEHICLE_SCALE=1 ROVER_BOOST_MULTIPLIER=3 ROVER_BOOST_COOLDOWN=4 ROVER_BOOST_DURATION=.32 /skynet/3rd/lua/lua "$test" || exit 1; fi; \
    done
USER 10001:10001
EXPOSE 18080
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 CMD curl -fsS http://127.0.0.1:18080/ >/dev/null || exit 1
ENTRYPOINT ["/skynet/skynet", "/app/server/config"]
CMD []
LABEL org.opencontainers.image.title="magnetic-rover" org.opencontainers.image.skynet-revision="f1baee5051108fce40588738f4a5960f12edea97"
