---
phase: 6
slug: 06-subscription-enforcement-cleanup
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-25
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.3.0 / ts-jest 29.4.6 |
| **Config file** | jest.config.ts |
| **Quick run command** | `npx jest tests/subscription --bail` |
| **Full suite command** | `npx jest --bail` |
| **Estimated runtime** | ~0.1 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest tests/subscription --bail`
- **After every plan wave:** Run `npx jest --bail`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 1 second

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 1 | PAY-01 | unit | `npx jest tests/subscription/gate.test.ts -t "PAY-01"` | yes | green |
| 6-01-02 | 01 | 1 | cleanup | unit | `npx jest tests/subscription/gate.test.ts -t "cleanup"` | yes | green |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [x] `tests/subscription/gate.test.ts` -- tests for PAY-01, dead import cleanup, ESM conversion

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DM subscription gate blocks features live | PAY-01 | Requires running bot with unsubscribed owner | Register owner, do NOT subscribe, try "new property" -- expect subscribe prompt |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 1s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-25
