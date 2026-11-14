# Patch provenance and scope

- `skynet-verified-client-tls.patch`: copied verbatim from `cmcxn/skynet-demo@f1baee5051108fce40588738f4a5960f12edea97/patches/`.
- `skynet-socket-flow-control.patch`: copied verbatim from the same commit, `components/skynet-llm/patches/`. These two source patches match the game image build. No production sources or startup are modified.
- `moonchipmunk-lua55-multistate.patch`: POC adaptation of `stetre/moonchipmunk@0e93b019d43041d5c12c6edb5b2bcfcc39c0155a` (MIT). Original source guard rejected Lua >5.4 despite README saying >=5.3. Permit 5.5, use actual Skynet Lua headers. No independent Lua library is linked.

## Why upstream is not multi-Actor-ready

Upstream owns one process-wide `moonchipmunk_L`, allocator+allocator context, userdata red-black tree, enum trees, arbiter singleton, GLMath conversion references, marching-squares callback references, and trace switch. A second `require` also hits `if(Alloc) unexpected(L)` in allocator initialization. Separate `cpSpace` objects alone do not isolate these values.

## POC adaptation

Each Lua registry owns a context userdata and its mutable state slots. Registered C functions and methods (including `__gc`) are protected-call trampolines: set the active Lua state/context on entry, restore it on return or Lua error, and route synchronous Chipmunk callbacks to that state. Only the active pointer is thread-local; the data are registry-owned, so a Skynet Actor can migrate between worker threads. One Lua state must never be concurrently entered by two workers, consistent with Skynet.

The allocator is obtained from the current Lua state per operation. Enum cleanup runs as context finalization instead of `atexit` using a possibly closed Lua state. The context is allocated before the library's other userdata; objects finalize before the context at Lua-state closure. Wrapper userdata remain strongly referenced as in upstream, so rooms must explicitly destroy their worlds/objects rather than relying solely on periodic Lua GC.

Hasty Space is deliberately rejected. Its child threads would not inherit the entry context and are outside this POC. Callbacks cannot yield. This patch retains upstream's temporary arbiter callback semantics: do not retain arbiters or recursively step a world from a collision callback. GLMath and marching APIs remain untested; only the recorded POC API surface is verified. The patch is not a production-wide certification of all MoonChipmunk APIs.

## Native dependency behavior

Chipmunk is built with `-DNDEBUG` (release mode), removing its process-wide debug first-initialization flag. Chipmunk allocations use libc; Skynet retains its bundled prefixed jemalloc. RSS need not fall immediately after freeing, because allocators retain arenas. Use destruction-cycle trends plus lifecycle assertions; RSS alone does not prove or disprove leaks.

## Known first-attempt failures

See `logs/native-moonchipmunk-original-build.log` for the upstream Lua-version guard rejection; `logs/native-skynet-build.log` for missing autoconf; and `logs/native-skynet-smoke.log` for a test-harness shutdown typo (`skynet.abort` before importing `skynet.manager`). The corrected real Skynet smoke passes in `logs/native-skynet-smoke-pass.log`. No failed attempt is treated as a pass.
