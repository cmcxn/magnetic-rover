#!/bin/sh
set -eu
ROVER_PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
# Reuse the dependency image when both manifests match, avoiding registry access.
# Force a refresh with ROVER_REBUILD_FRONTEND=1 when needed.
if [ "${ROVER_REBUILD_FRONTEND:-0}" = 1 ] ||
   ! docker image inspect magnetic-rover:frontend-validation >/dev/null 2>&1 ||
   ! docker run --rm --entrypoint cat magnetic-rover:frontend-validation /build/client/package-lock.json | cmp -s "$ROVER_PROJECT_ROOT/client/package-lock.json" - ||
   ! docker run --rm --entrypoint cat magnetic-rover:frontend-validation /build/client/package.json | cmp -s "$ROVER_PROJECT_ROOT/client/package.json" -; then
  docker build --target frontend -t magnetic-rover:frontend-validation "$ROVER_PROJECT_ROOT"
fi
docker run --rm \
  -v "$ROVER_PROJECT_ROOT:/workspace" -w /workspace \
  -e ROVER_NODE_MODULES=/build/client/node_modules \
  --entrypoint node magnetic-rover:frontend-validation minigame/build.mjs
