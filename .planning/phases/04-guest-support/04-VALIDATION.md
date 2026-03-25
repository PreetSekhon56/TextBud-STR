---
phase: 4
slug: 04-guest-support
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-25
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.3.0 / ts-jest 29.4.6 |
| **Config file** | jest.config.ts |
| **Quick run command** | `npx jest tests/guest --bail` |
| **Full suite command** | `npx jest --bail` |
| **Estimated runtime** | ~0.2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest tests/guest --bail`
- **After every plan wave:** Run `npx jest --bail`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 1 second

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | GUEST-01 | unit | `npx jest tests/guest/guest.test.ts -t "GUEST-01"` | yes | green |
| 4-01-02 | 01 | 1 | GUEST-02 | unit | `npx jest tests/guest/guest.test.ts -t "GUEST-02"` | yes | green |
| 4-01-03 | 01 | 1 | GUEST-03 | unit | `npx jest tests/guest/guest.test.ts -t "GUEST-03"` | yes | green |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [x] `tests/guest/guest.test.ts` -- tests for GUEST-01, GUEST-02, GUEST-03

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claude AI FAQ matching quality | GUEST-01 | Requires live Anthropic API call | Ask a question in a guest group, verify response quality |
| End-to-end "add faq:" DM flow | GUEST-03 | Multi-message DM flow requires live bot | Trigger unknown question, then reply "add faq: answer" in owner DM |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 1s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-25
