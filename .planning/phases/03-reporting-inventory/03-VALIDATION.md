---
phase: 3
slug: reporting-inventory
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-25
audited: 2026-03-25
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.3.0 + ts-jest 29.4.6 |
| **Config file** | `jest.config.ts` |
| **Quick run command** | `npx jest --testPathPattern='reporting\|inventory'` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | <1 second |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --testPathPattern='reporting\|inventory'`
- **After every plan wave:** Run `npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** <1 second

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | REPT-01 | unit | `npx jest tests/reporting/reporting.test.ts` | yes | green |
| 03-01-02 | 01 | 1 | REPT-01 | unit | `npx jest tests/reporting/reporting.test.ts` | yes | green |
| 03-02-01 | 02 | 1 | REPT-02 | unit | `npx jest tests/inventory/inventory.test.ts` | yes | green |
| 03-02-02 | 02 | 1 | REPT-03 | unit | `npx jest tests/inventory/inventory.test.ts` | yes | green |
| 03-03-01 | 03 | 1 | REPT-04 | unit | `npx jest tests/reporting/reporting.test.ts` | yes | green |
| 03-03-02 | 03 | 1 | REPT-05 | unit | `npx jest tests/inventory/inventory.test.ts` | yes | green |

*Status: pending -- green -- red -- flaky*

---

## Wave 0 Requirements

- [x] `tests/reporting/reporting.test.ts` -- REPT-01 report building, formatting, low-stock alerts (REPT-04)
- [x] `tests/inventory/inventory.test.ts` -- REPT-02 walkthrough prompts, REPT-03 photo analysis flow, REPT-05 consumption tracking

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Photo pairs render side-by-side in Telegram | REPT-01 | Telegram rendering is client-side | Send test media group, verify visual layout on mobile |
| Receipt OCR extracts correct items | REPT-03 | AI output varies per receipt | Photograph sample receipt, verify extracted items match |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 1s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** passed (audited 2026-03-25)
