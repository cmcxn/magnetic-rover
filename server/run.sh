#!/bin/sh
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export ROVER_SERVER="$HERE/"
export SKYNET_ROOT="${SKYNET_ROOT:-$HERE/../../pluto-aoi-integration/vendor/skynet/}"
export SKYNET_ROOT="${SKYNET_ROOT%/}/"
export ROVER_BIND="${ROVER_BIND:-0.0.0.0}"
export ROVER_CLIENT="${ROVER_CLIENT:-$HERE/../client/dist}"
exec "$SKYNET_ROOT/skynet" "$HERE/config"
