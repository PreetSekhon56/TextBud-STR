---
phase: 07
slug: floor-plan-generation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-25
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 30.3.0 (ts-jest 29.4.6) |
| **Config file** | jest.config.ts |
| **Quick run command** | `npx jest --testPathPattern=floor-plan -x` |
| **Full suite command** | `npx jest --no-coverage` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run task-specific verify command (see Per-Task map)
- **After every plan wave:** Run `npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | PROP-08 | unit | `npx jest tests/floor-plan/service.test.ts -x` | W0 (created in task) | pending |
| 07-01-02 | 01 | 1 | PROP-08 | unit | `npx jest tests/floor-plan/service.test.ts -x` | created in 07-01-01 | pending |
| 07-02-01 | 02 | 2 | PROP-08, PROP-09 | unit | `npx jest tests/floor-plan/handler.test.ts -x` | W0 (created in task) | pending |
| 07-02-02 | 02 | 2 | PROP-09 | integration | `npx tsc --noEmit && npx jest tests/floor-plan/ -x` | created in 07-02-01 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Test files are created by TDD tasks within each plan:
- `tests/floor-plan/service.test.ts` -- created by Plan 01, Task 1 (covers FFmpeg extraction, Claude Vision analysis, SVG generation, full pipeline)
- `tests/floor-plan/handler.test.ts` -- created by Plan 02, Task 1 (covers floor plan request handling, async trigger)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Floor plan generated from entry video | PROP-08 | Requires live FFmpeg + Claude Vision + real video | Submit entry video in group, verify floor plan generated |
| Floor plan viewable by cleaner/guest | PROP-09 | Requires live bot interaction | Type "floor plan" in group, verify SVG document sent |
| SVG renders correctly in Telegram | PROP-09 | Telegram client rendering | Open sent document, verify room layout visible |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
