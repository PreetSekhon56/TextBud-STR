---
phase: 1
slug: 01-foundation-property-setup
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-25
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.3.0 / ts-jest 29.4.6 |
| **Config file** | jest.config.ts |
| **Quick run command** | `npx jest tests/setup --bail` |
| **Full suite command** | `npx jest --bail` |
| **Estimated runtime** | ~0.3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest tests/setup --bail`
- **After every plan wave:** Run `npx jest --bail`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 1 second

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | PROP-01 | unit | `npx jest tests/setup/setup.test.ts -t "PROP-01"` | yes | green |
| 1-01-02 | 01 | 1 | PROP-02 | unit | `npx jest tests/setup/setup.test.ts -t "PROP-02"` | yes | green |
| 1-02-01 | 02 | 2 | PROP-03 | unit | `npx jest tests/setup/setup.test.ts -t "session management"` | yes | green |
| 1-02-02 | 02 | 2 | PROP-04 | unit | `npx jest tests/setup/setup.test.ts -t "session management"` | yes | green |
| 1-02-03 | 02 | 2 | PROP-05 | unit | `npx jest tests/setup/setup.test.ts -t "session management"` | yes | green |
| 1-02-04 | 02 | 2 | PROP-06 | unit | `npx jest tests/setup/setup.test.ts -t "session management"` | yes | green |
| 1-03-01 | 03 | 2 | COMM-01 | unit | `npx jest tests/setup/groups.test.ts -t "COMM-01"` | yes | green |
| 1-03-02 | 03 | 2 | COMM-02 | unit | `npx jest tests/setup/groups.test.ts -t "COMM-02"` | yes | green |
| 1-03-03 | 03 | 2 | COMM-04 | unit | `npx jest tests/setup/groups.test.ts -t "COMM-04"` | yes | green |
| 1-04-01 | 04 | 3 | PROP-07 | unit | `npx jest tests/setup/setup.test.ts -t "PROP-07"` | yes | green |
| 1-04-02 | 04 | 3 | COMM-03 | unit | `npx jest tests/setup/setup.test.ts -t "COMM-03"` | yes | green |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [x] `tests/setup/setup.test.ts` -- tests for PROP-01, PROP-02, PROP-03 through PROP-07, COMM-03
- [x] `tests/setup/groups.test.ts` -- tests for COMM-01, COMM-02, COMM-04

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full setup wizard conversation flow | PROP-03-06 | Multi-turn Telegram conversation requires live bot | Start bot, DM "new property", walk through all setup steps |
| Group welcome message delivery | COMM-01 | Requires real Telegram group with bot added | Add bot to a group with owner + another user |
| Photo download and local storage | PROP-04 | Requires Telegram API file download | Send photos during setup, verify files in STAGING_PHOTOS_DIR |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 1s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-25
