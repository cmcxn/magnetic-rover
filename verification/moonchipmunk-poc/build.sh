#!/usr/bin/env bash
# Native Linux build. No sudo, system Lua, global install, or Docker required.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT"
if [[ ${1:-} == clean ]]; then
  rm -rf -- "$ROOT/.build"
  echo "Removed only generated .build; logs/results preserved."
  exit 0
fi
[[ $# == 0 ]] || { echo "usage: $0 [clean]" >&2; exit 2; }
source ./deps.lock
[[ $(uname -s) == Linux ]] || { echo 'This verified build targets Linux. On macOS/Windows use a Linux VM or the optional Dockerfile.' >&2; exit 2; }
for cmd in git gcc make curl patch perl python3; do command -v "$cmd" >/dev/null || { echo "Missing build tool: $cmd" >&2; exit 2; }; done
BUILD="$ROOT/.build"; mkdir -p "$BUILD/lib" "$ROOT/logs"
exec > >(tee "$ROOT/logs/build-latest.log") 2>&1
fetch() {
 local name=$1 url=$2 revision=$3
 if [[ ! -d "$BUILD/$name/.git" ]]; then git clone "$url" "$BUILD/$name"; fi
 [[ $(git -C "$BUILD/$name" rev-parse HEAD) == "$revision" ]] || {
   if [[ -n $(git -C "$BUILD/$name" status --porcelain) ]]; then echo "Refusing to overwrite modified $name checkout"; exit 2; fi
   git -C "$BUILD/$name" fetch origin "$revision"
   git -C "$BUILD/$name" checkout --detach "$revision"
 }
}
fetch skynet https://github.com/cloudwu/skynet.git "$SKYNET_COMMIT"
fetch chipmunk https://github.com/slembcke/Chipmunk2D.git "$CHIPMUNK_COMMIT"
fetch moonchipmunk https://github.com/stetre/moonchipmunk.git "$MOONCHIPMUNK_COMMIT"
git -C "$BUILD/skynet" submodule update --init --recursive
[[ $(git -C "$BUILD/skynet/3rd/jemalloc" rev-parse HEAD) == "$JEMALLOC_COMMIT" ]]
apply_patch_once() {
 local dir=$1 patch=$2
 if git -C "$dir" apply --check "$patch" 2>/dev/null; then git -C "$dir" apply "$patch"
 elif git -C "$dir" apply --reverse --check "$patch" 2>/dev/null; then echo "Already applied: $(basename "$patch")"
 else echo "Patch mismatch: $patch" >&2; exit 2; fi
}
apply_patch_once "$BUILD/skynet" "$ROOT/patches/skynet-verified-client-tls.patch"
apply_patch_once "$BUILD/skynet" "$ROOT/patches/skynet-socket-flow-control.patch"
apply_patch_once "$BUILD/moonchipmunk" "$ROOT/patches/moonchipmunk-lua55-multistate.patch"
# Minimal cloud images may omit autoconf and m4. Use checksum-locked official
# Debian packages locally, without modifying host packages (x86_64 only).
if ! command -v autoconf >/dev/null || ! command -v m4 >/dev/null; then
 [[ $(uname -m) == x86_64 ]] || { echo 'Install autoconf and m4 with your distro package manager.'; exit 2; }
 command -v dpkg-deb >/dev/null || { echo 'Install autoconf and m4 (or supply dpkg-deb for local bootstrap).'; exit 2; }
 TOOLS="$BUILD/tools"; mkdir -p "$TOOLS"; pushd "$TOOLS" >/dev/null
 download() {
   local name=$1 url=$2 sha=$3
   [[ -f "$name" ]] || curl -fL --retry 3 "$url" -o "$name"
   printf '%s  %s\n' "$sha" "$name" | sha256sum -c -
   dpkg-deb -x "$name" .
 }
 download autoconf.deb https://deb.debian.org/debian/pool/main/a/autoconf/autoconf_2.72-3.1_all.deb 0de76b647b0afb6c7934999aaefeb463656c147672464a367df1019969e77af3
 download m4.deb https://deb.debian.org/debian/pool/main/m/m4/m4_1.4.19-8_amd64.deb 221b3e224708c1da2a1a88b6824380593579b2254ae7d914afa14cbd5d343334
 sed -i "s@/usr/share/autoconf@$TOOLS/usr/share/autoconf@g" usr/share/autoconf/autom4te.cfg
 export PATH="$TOOLS/usr/bin:$PATH" autom4te_perllibdir="$TOOLS/usr/share/autoconf" AC_MACRODIR="$TOOLS/usr/share/autoconf" AUTOM4TE="$TOOLS/usr/bin/autom4te" AUTOM4TE_CFG="$TOOLS/usr/share/autoconf/autom4te.cfg" M4="$TOOLS/usr/bin/m4" trailer_m4="$TOOLS/usr/share/autoconf/autoconf/trailer.m4"
 popd >/dev/null
fi
# Exactly the project Lua, jemalloc and source patches. No alternate Lua ABI.
# TLS paths are directories, not linker flags, per Skynet's Makefile.
TLS_INC=${TLS_INC:-/usr/include}
TLS_LIB=${TLS_LIB:-/usr/lib/$(gcc -dumpmachine)}
# Rebuild TLS so its directory flags are never silently stale.
rm -f "$BUILD/skynet/luaclib/ltls.so"
make -C "$BUILD/skynet" linux -j"${JOBS:-4}" TLS_MODULE=ltls TLS_INC="$TLS_INC" TLS_LIB="$TLS_LIB"
gcc -std=gnu11 -O2 -DNDEBUG -fPIC -shared -I"$BUILD/chipmunk/include" "$BUILD/chipmunk"/src/*.c -o "$BUILD/lib/libchipmunk.so" -lm -lpthread
gcc -std=gnu11 -O2 -fPIC -shared -DLINUX -I"$BUILD/skynet/3rd/lua" -I"$BUILD/chipmunk/include" "$BUILD/moonchipmunk"/src/*.c -L"$BUILD/lib" -lchipmunk -lm -lpthread '-Wl,-rpath,$ORIGIN' -o "$BUILD/lib/moonchipmunk.so"
# Benchmark helper (if present) follows the same Lua headers and link contract.
if [[ -f "$ROOT/monotime.c" ]]; then
 gcc -std=gnu11 -O2 -fPIC -shared -I"$BUILD/skynet/3rd/lua" "$ROOT/monotime.c" -o "$BUILD/lib/poc_clock.so"
fi
ldd "$BUILD/lib/moonchipmunk.so" | tee "$ROOT/logs/native-module-ldd.log"
nm -D "$BUILD/lib/moonchipmunk.so" | grep -E '(luaopen_moonchipmunk| U lua_)' >"$ROOT/logs/native-module-symbols.log"
"$BUILD/skynet/3rd/lua/lua" -v
printf 'Build complete. This alone does not establish Skynet integration or test success.\n'
