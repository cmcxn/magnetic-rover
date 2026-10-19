# Real browser screenshot attempt

Date: 2026-10-18

Result: blocked before any page loaded. No real gameplay screenshot was produced, and no gameplay/UI verification is claimed.

## Minimal reproduction

The default sandboxed executor ran Python Playwright with `/usr/bin/chromium`, headless mode, and writable temporary paths:

- HOME=/tmp/rover-browser-home
- XDG_CONFIG_HOME=/tmp/rover-browser-config
- XDG_CACHE_HOME=/tmp/rover-browser-cache

The attempt only launched a browser and intended to render a static heading. It failed before creating a page, so neither a running game server nor the game code caused this failure.

## Observed failure

```
FATAL:chrome/browser/process_singleton_posix.cc:297
Check failed: . socket() failed: Operation not permitted (1)
```

Chromium exited with SIGABRT. A subsequent crash handler ptrace EPERM was secondary to the fatal socket error.

Setting writable HOME and XDG paths removed the earlier reported directory/crashpad setup issue but did not change the socket permission denial. No elevated execution or access-control workaround was attempted by this diagnostic worker. The previously reported cloud browser localhost ERR_BLOCKED_BY_CLIENT route was not retried.

## Unverified scope

- Two independent live browser contexts
- Desktop rendered appearance
- Mobile viewport and touch interactions
- Actual screenshot capture

A supported execution environment that permits a real browser's required IPC sockets is needed to complete these checks. Existing server/protocol tests are separate evidence and do not substitute for browser screenshots.
