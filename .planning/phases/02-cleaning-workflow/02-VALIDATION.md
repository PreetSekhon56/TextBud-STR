---
phase: 2
slug: cleaning-workflow
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-24
audited: 2026-03-25
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.3.0 + ts-jest 29.4.6 |
| **Config file** | `jest.config.ts` |
| **Quick run command** | `npx jest --testPathPattern=cleaning` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | <1 second |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --testPathPattern=cleaning`
- **After every plan wave:** Run `npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** <1 second

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | CLEAN-01 | unit | `npx jest tests/cleaning/checkin.test.ts` | yes | green |
| 02-01-02 | 01 | 1 | CLEAN-02 | unit | `npx jest tests/cleaning/checkin.test.ts` | yes | green |
| 02-02-01 | 02 | 1 | CLEAN-03 | unit | `npx jest tests/cleaning/video.test.ts` | yes | green |
| 02-02-02 | 02 | 1 | CLEAN-04 | unit | `npx jest tests/cleaning/checklist.test.ts` | yes | green |
| 02-03-01 | 03 | 2 | CLEAN-05 | unit | `npx jest tests/cleaning/comparison.test.ts` | yes | green |
| 02-03-02 | 03 | 2 | CLEAN-06 | unit | `npx jest tests/cleaning/comparison.test.ts` | yes | green |
| 02-03-03 | 03 | 2 | CLEAN-07 | unit | `npx jest tests/cleaning/comparison.test.ts` | yes | green |
| 02-04-01 | 04 | 2 | CLEAN-08 | unit | `npx jest tests/cleaning/completion.test.ts` | yes | green |

*Status: pending -- green -- red -- flaky*

---

## Wave 0 Requirements

- [x] `tests/cleaning/checkin.test.ts` -- CLEAN-01, CLEAN-02
- [x] `tests/cleaning/video.test.ts` -- CLEAN-03
- [x] `tests/cleaning/checklist.test.ts` -- CLEAN-04
- [x] `tests/cleaning/comparison.test.ts` -- CLEAN-05, CLEAN-06, CLEAN-07
- [x] `tests/cleaning/completion.test.ts` -- CLEAN-08
- [x] `jest.config.ts` -- Jest configuration
- [x] `@types/jest` + `ts-jest` -- TypeScript test dependencies

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Inline keyboard buttons render correctly in Telegram | CLEAN-04 | Requires live Telegram client | Send checklist to test group, verify buttons appear and respond to taps |
| Claude Vision photo comparison quality | CLEAN-06 | AI output is non-deterministic | Submit test photo against staging, verify flagging is reasonable |
| Entry video recording via Telegram | CLEAN-03 | Requires mobile Telegram client | Record video in test group, verify file_id stored |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 1s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** passed (audited 2026-03-25)
