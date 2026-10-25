# Boost Feedback Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show boost duration, cooldown and readiness on the rover.
**Architecture:** Extend existing Phaser world rendering using authoritative player timers and bounded snapshot interpolation; reuse above-sprite graphics and local label.
**Tech Stack:** TypeScript, Phaser, Node test runner.
**Spec:** docs/superpowers/specs/2026-10-25-boost-feedback-design.md

## Global Constraints
- Boost 0.32s; cooldown 4s from activation. No gameplay changes.
- Reduced effects keeps information, suppresses flashing and jitter.

## Review Focus
- Stale, disconnected and finished states suppress feedback.
- Readiness requires authoritative cooldown zero.
- Cargo and rotated body remain readable.
- First snapshot must not trigger readiness flash.
- Mobile labels remain screen-sized.

### Task 1: Render vehicle boost states
- [x] Add rendering regression tests for cooldown text, duration expiry between snapshots and suppressed stale/disconnected feedback; run node --test tests/world-render.test.mjs (expected new tests fail).
- [x] Modify client/src/world.ts: two side strips, bounded timer interpolation, one-shot readiness flash, lightning indicator, local label and shrinking flame.
- [x] Run npm test and npm run build in client (expected pass).
- [x] Inspect desktop/mobile rendered states and review changes.

## Verification
- New regression tests failed before implementation; final client suite 125/125 passed.
- TypeScript and production Vite build passed (existing bundle size warning).
- Playwright with local Edge rendered the actual World scene at 1200x800 and 390x844: ready, boost and cooldown screenshots inspected; no page errors. Preview harness required the same Vite Phaser module URL as World to avoid duplicate Phaser instances.
- Independent read-only review found no material defects.
