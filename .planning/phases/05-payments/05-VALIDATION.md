---
phase: 05
slug: payments
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-25
audited: 2026-03-25
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.3.0 + ts-jest 29.4.6 |
| **Config file** | `jest.config.ts` |
| **Quick run command** | `npx jest tests/payments/payments.test.ts` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | <1 second |

---

## Sampling Rate

- **After every task commit:** Run `npx jest tests/payments/payments.test.ts`
- **After every plan wave:** Run `npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** <1 second

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | PAY-01 | unit | `npx jest tests/payments/payments.test.ts` | yes | green |
| 05-01-02 | 01 | 1 | PAY-02 | unit | `npx jest tests/payments/payments.test.ts` | yes | green |
| 05-02-01 | 02 | 1 | PAY-03 | unit | `npx jest tests/payments/payments.test.ts` | yes | green |
| 05-02-02 | 02 | 1 | PAY-04 | unit | `npx jest tests/payments/payments.test.ts` | yes | green |

*Status: pending -- green -- red -- flaky*

---

## Wave 0 Requirements

- [x] `tests/payments/payments.test.ts` -- PAY-01 through PAY-04: subscribe, per-property pricing, cancel, status

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Telegram payment sheet appears | PAY-01 | Requires live Stripe test keys + Telegram client | Send /subscribe, verify payment sheet renders with Apple/Google Pay |
| Subscription billing adjusts on property add/remove | PAY-02 | Requires Stripe test mode with real API calls | Add property, check Stripe dashboard for quantity update |
| Owner can cancel via text | PAY-03 | Requires live bot interaction | Send "cancel subscription", verify Stripe subscription cancelled |

*Payment integrations require live API keys and cannot be fully automated in unit tests.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 1s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** passed (audited 2026-03-25)
