FROM node:24.18.1-bookworm-slim AS frontend
WORKDIR /build/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm test && npm run build

FROM debian:bookworm-slim AS skynet-build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /build/skynet
# Clean git archive of the verified local Skynet commit; no host binaries or .git.
COPY skynet-source.tar /tmp/skynet-source.tar
RUN tar -xf /tmp/skynet-source.tar && make linux -j2 MALLOC_STATICLIB= SKYNET_DEFINES=-DNOUSE_JEMALLOC
COPY server/ /build/server/
RUN cd /build/server && /build/skynet/3rd/lua/lua test_game.lua && /build/skynet/3rd/lua/lua test_clock.lua

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=skynet-build /build/skynet/skynet /opt/skynet/skynet
COPY --from=skynet-build /build/skynet/cservice/ /opt/skynet/cservice/
COPY --from=skynet-build /build/skynet/luaclib/ /opt/skynet/luaclib/
COPY --from=skynet-build /build/skynet/lualib/ /opt/skynet/lualib/
COPY --from=skynet-build /build/skynet/service/ /opt/skynet/service/
COPY server/ /app/server/
COPY --from=frontend /build/client/dist/ /app/client/dist/
COPY licenses/ /app/licenses/
ENV SKYNET_ROOT=/opt/skynet/ ROVER_BIND=0.0.0.0 ROVER_SERVER=/app/server/ ROVER_CLIENT=/app/client/dist
USER 10001:10001
EXPOSE 18080
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 CMD curl -fsS http://127.0.0.1:18080/ >/dev/null || exit 1
ENTRYPOINT ["/opt/skynet/skynet", "/app/server/config"]
LABEL org.opencontainers.image.title="magnetic-rover" org.opencontainers.image.skynet-revision="64391f732e76507ea6615f312cb71be1fd7bfbdd"
