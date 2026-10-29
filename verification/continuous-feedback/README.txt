2026-10-29 — start CTA, PC keys and continuous predicted feedback

167 frontend/mini tests cover native PC key mapping, Space release, foreground reset, bounded loop start/stop/mute, pre-ack dash prediction and authoritative stun correction, and pointer acceptance matching the predicted recovery state shown by the UI.

Live H5 browser against isolated Skynet with 2-second dash capacity: 600ms press starts exactly one WebAudio looping source; release stops it; partial energy recharges and can be reused. A collision/stun during QA correctly disabled dash until recovery. The follow-up pointer hold succeeded after recovery.

Native bundle browser bridge maps actual browser keys to wx.onKeyDown/onKeyUp. Real Skynet verified WASD/Space hold and release, and 3x canvas. Native audio loop behavior is verified through wx API mocks, not phone listening. This is not actual PC WeChat or phone screenshot evidence.

PNG files are actual browser or native-bundle bridge captures; filenames containing bridge indicate the latter. Start highlighted and ready captures are real 8-connection lobby states. QA sessions and temporary container/server are cleaned up after verification.

PC startup screen now replaces the mobile introduction with an explicit WASD/arrow/hold-Space guide and mouse-joystick hint. A panel test verifies that the PC guide is absent on mobile.
