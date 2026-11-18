#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p results
image=${IMAGE:-magnetic-rover:skynet-runtime-f1baee5}
if ! docker image inspect "$image" >/dev/null 2>&1 && test -z "${IMAGE:-}"; then
 image=chenmins/skynet-demo:sha-f1baee5051108fce40588738f4a5960f12edea97@sha256:9cbaa652cb9f37b8f6025a54d76d9fd18315852c70653b038be972ee074b2d8c
fi
run(){
 mode=$1 rooms=$2 action=$3 name=$4
 set -- --env SKYNET_ROOT=/skynet/ --env ROVER_SERVER=/app/server/
 if test "$action" = compat; then
  set -- "$@" -e ROVER_MAP_SCALE=1 -e ROVER_SUPPLY_SPEED=1 -e ROVER_BASE_SPEED=240 -e ROVER_VEHICLE_SCALE=1 -e ROVER_BOOST_MULTIPLIER=3 -e ROVER_BOOST_COOLDOWN=4 -e ROVER_BOOST_DURATION=.32 -e ROVER_BOOST_RAMP=0 -e ROVER_BOOST_TOP_FACTOR=1 -e ROVER_BOOST_RECOVERY=0
 fi
 docker run --rm --cpus=2 --memory=512m -v "$PWD:/p:ro" -v "$PWD/../../server:/app/server:ro" "$@" -e MODE="$mode" -e ROOMS="$rooms" -e TEST="$action" --entrypoint /skynet/skynet "$image" /p/config > "results/$name.log" 2>&1 || { tail -30 "results/$name.log"; exit 1; }
 if test "$action" = 0; then
  grep "^TRACE " "results/$name.log" | gzip -c >"results/$name.trace.gz"
  sed '/^TRACE /d' "results/$name.log" >"results/$name.tmp" && mv "results/$name.tmp" "results/$name.log"
 fi
 grep -q POC_PASS "results/$name.log" || { cat "results/$name.log"; exit 1; }
}
case "${1:-test}" in
test) run 1 1 1 test ;;
compat) for n in 0 1 3; do run "$n" 1 compat "compat-$n"; done ;;
primary) for n in 0 1 3; do run "$n" 32 0 "32-$n"; done ;;
bench) for r in 32 16 8; do for n in 0 1 3; do run "$n" "$r" 0 "$r-$n"; done; done ;;
*) echo "usage: $0 test|compat|bench|primary" >&2; exit 2 ;;
esac
