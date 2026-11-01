# Selection Showroom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Real 3D yaw-only selected-car preview on an isolated feature branch.
**Architecture:** Shared version-pinned Three renderer; H5 owned canvas and mini Phaser Extern adapter. Existing static images remain fallback; match World is unchanged.
**Tech Stack:** TypeScript, Three0.162, Phaser3.90, Blender4.3 GLB export, Vite/esbuild.
**Spec:** docs/superpowers/specs/2026-11-01-selection-showroom.md

## Global Constraints
- No main merge/deployment/WeChat upload or gameplay/network changes.
- Eight existing colors, three theme material names, fixed magnet colors; preserve yaw on recolor.
- Fixed camera, horizontal drag + slow auto yaw only. Target1–2MB extra measured runtime.

## Review Focus
- Loading failure and context loss retain static fallback, recover without blank UI.
- Palette changes and repeated room rerenders do not reset yaw or leak contexts.
- Pointer cancel/release, vertical motion and multi-touch do not add pitch/zoom or trigger gameplay.
- Shared GL viewport/scissor/depth state does not corrupt Phaser UI.
- Leaving, hidden document and entering match stop preview activity; returning works.

### Task1: Safe source export
- [ ] Inspect source with autoexec disabled; write GLB validation before export.
- [ ] Export material-merged geometry + manifest under assets/cartoon/rover-showroom; scripts under art/rover-showroom. Verify geometry/material scope and measured bytes.

### Task2: Shared renderer
- [ ] Add failing yaw/color/lifecycle tests in client/tests; implement showroom-motion.ts/showroom-3d.ts.
- [ ] API load(ArrayBuffer),setColor,dragX,update,render(framebufferViewport),dispose. Explicit theme names only; no shared context destruction.
- [ ] Test fixed camera/drag/color/cleanup and baseline suite.

### Task3: Selection adapters
- [ ] Add failing H5 mounting/fallback/lifecycle tests; integrate own-card preview without changing room protocol.
- [ ] Add failing mini adapter tests; integrate selection bigimage + owncard through Extern, existing touch routing, file bytes and static fallback.
- [ ] Validate resize/repeated palette changes/hidden/leave/re-enter and both builds.

### Task4: Acceptance
- [ ] Actual browser owned + shared WebGL1 canvas checks, screenshots, resource counters and package delta.
- [ ] Independent review, fix findings, full relevant tests/builds, concise local Codex/WeChat checklist.
- [ ] Commit feature branch; parent verifies/publishes exact tree only, no main merge.
