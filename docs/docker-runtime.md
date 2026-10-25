# Published Docker runtime

## Version

- Base: `chenmins/skynet-demo:sha-f1baee5051108fce40588738f4a5960f12edea97`
- Multi-platform manifest: `sha256:9cbaa652cb9f37b8f6025a54d76d9fd18315852c70653b038be972ee074b2d8c`
- Published platforms: `linux/amd64`, `linux/arm64`.
- Runtime location: `/skynet`; application: `/app/server`; frontend: `/app/client/dist`.

The application inherits the published runtime and its native dependencies, modules and license notices. It no longer compiles `skynet-source.tar`. The archive and its checksum remain only as historical source provenance and are excluded from the Docker build context. Native `start.sh`/`stop.sh` remain available for development and do not control Docker containers.

## Run

```sh
docker compose up -d --build --wait
docker compose logs -f --tail=100 game
docker compose down
```

The default port is 18080 and speed is 480. To run alongside the native server:

```sh
ROVER_PORT=18083 docker compose -p magnetic-rover-runtime up -d --build --wait
node smoke.mjs http://127.0.0.1:18083
ROVER_PORT=18083 docker compose -p magnetic-rover-runtime down
```

Smoke tests create a temporary two-player room; use an isolated instance. Stopping/recreating a container loses its in-memory games. The Compose project keeps non-root UID 10001, read-only filesystem, dropped capabilities, no-new-privileges and existing resource limits. Only port 18080 in the container is published; inherited base-image metadata also mentions 8888 but the game does not bind it.

## Health check and architecture selection

`curl` is installed only for the application's HTTP `HEALTHCHECK`, which requests the game page on port 18080. It is not a Skynet module dependency. This lets `docker compose up --wait` verify that the application serves HTTP rather than merely checking whether its process exists.

The pinned digest identifies a multi-platform manifest list. Docker selects the matching base-image variant for the build target, including ARM64 on a native ARM64 builder. No `platform` is forced by this Compose file. An explicit `--platform` or `DOCKER_DEFAULT_PLATFORM` overrides the default selection. To explicitly build ARM64, use `docker buildx build --platform linux/arm64 --load -t magnetic-rover:arm64 .` with a builder that supports that target.

## Build verification

Frontend tests, TypeScript and Vite run in the Node build stage. The published Lua runtime executes the game's Lua tests. Historical geometry fixtures explicitly use speed 240; `test_base_speed.sh` separately verifies default 480, all supported example overrides, rejected values, cargo slowdown and boost speed.

For future runtime updates, inspect the new image layout and multi-platform digest, change the Dockerfile runtime reference, rebuild and rerun smoke tests. No automatic tracking of `latest` is used.

## Remote deployment

DEPLOYMENT.md records the older deployed release; this refactor does not alter that server. A future deployment no longer needs the source tar and must preserve the remote `.env` port setting. Build the application image from this branch before recreating the remote service.

## Verification on 2026-10-25

- Local Docker Desktop `linux/amd64` image build passed: 125 frontend tests, TypeScript/Vite, 17 speed configurations, and all existing Lua test files.
- `magnetic-rover-runtime-game-1` is healthy on host port 18083 with UID 10001 and read-only root filesystem.
- `node smoke.mjs http://127.0.0.1:18083` passed HTTP, built assets, two independent WebSocket identities, room creation/join/readiness and authoritative movement.
- LAN request to `http://192.168.1.93:18083/` returned HTTP 200 from the development machine.
- The native service on 18080 was left running. No remote deployment or registry push was performed.
- Base manifest includes AMD64 and ARM64; the application image was built/tested only on local AMD64, not independently on ARM64.
- Independent code review found no material defects. Vite retains its existing large-bundle warning.
