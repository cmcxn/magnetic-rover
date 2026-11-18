#!/bin/sh
set -eu
cd "$(dirname "$0")"
: "${BROWSER:?set BROWSER to a Chromium or Edge executable}"
runner=${NODE:-node}
image=${IMAGE:-magnetic-rover:skynet-runtime-f1baee5}
sed "s/start = 'poc'/start = 'h5'/" config > .build/h5.conf
container=$(docker run -d --rm --cpus=2 --memory=512m -p 127.0.0.1:18982:18080 -e SKYNET_ROOT=/skynet/ -e ROVER_BIND=0.0.0.0 -e ROVER_SERVER=/app/server/ -v "$PWD:/p:ro" -v "$PWD/../../server:/app/server:ro" --entrypoint /skynet/skynet "$image" /p/.build/h5.conf)
(cd ../../client && exec "$runner" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 18983 --strictPort) > .build/vite.log 2>&1 &
vite=$!
cleanup(){
 kill "$vite" 2>/dev/null || true
 docker logs "$container" >results/h5-server.log 2>&1
 docker stop "$container" >/dev/null
}
trap cleanup EXIT
for i in 1 2 3 4 5; do curl -fsS http://127.0.0.1:18983/ >/dev/null 2>&1 && break; sleep 1; done
kill -0 "$vite"
"$runner" h5.cjs >results/h5.log 2>&1
cat results/h5.log
