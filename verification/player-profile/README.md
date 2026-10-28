# Remembered driver profile verification

2026-10-29. `h5-edit-name.png` is a real browser screenshot against the updated
local Skynet service at http://127.0.0.1:18080, with a separate QA browser
context. Live steps: connect, create a room, select magenta, click the local
nickname to rename, verify confirmed profile in localStorage, leave/rejoin,
verify selected color, reload, and verify remembered nickname and color on
the login screen. No browser runtime errors. QA context and sockets closed.

154 client/mini tests passed. New checks exercise H5 confirmed profile storage,
the real WeChat rememberProfile function writing wx storage, native lobby
nickname hit action, and server nickname validation, preserved preferences
through automatic fallback, free preferred color on reentry, explicit color
acknowledgment, resumed login preferences, and match rename rejection.
Server regression suite and both TypeScript builds passed. WeChat build total
3857 KiB. This screenshot is H5 evidence; phone validation remains separate.
