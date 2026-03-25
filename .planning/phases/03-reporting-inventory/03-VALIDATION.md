---
phase: 3
slug: reporting-inventory
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.3.0 + ts-jest 29.4.6 |
| **Config file** | `jest.config.ts` |
| **Quick run command** | `npm test -- --testPathPattern=reporting\|inventory` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=reporting\|inventory`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | REPT-01 | unit | `npx jest tests/reporting/report-generation.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | REPT-01 | unit | `npx jest tests/reporting/report-storage.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | REPT-02 | unit | `npx jest tests/inventory/walkthrough.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | REPT-03 | unit | `npx jest tests/inventory/photo-analysis.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 1 | REPT-04 | unit | `npx jest tests/inventory/low-stock.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 1 | REPT-05 | unit | `npx jest tests/inventory/data-storage.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/reporting/report-generation.test.ts` — stubs for REPT-01 report building logic
- [ ] `tests/reporting/report-storage.test.ts` — stubs for REPT-01 DB storage
- [ ] `tests/inventory/walkthrough.test.ts` — stubs for REPT-02 sequential prompts + number parsing
- [ ] `tests/inventory/photo-analysis.test.ts` — stubs for REPT-03 AI analysis
- [ ] `tests/inventory/low-stock.test.ts` — stubs for REPT-04 threshold detection
- [ ] `tests/inventory/data-storage.test.ts` — stubs for REPT-05 consumption tracking

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Photo pairs render side-by-side in Telegram | REPT-01 | Telegram rendering is client-side | Send test media group, verify visual layout on mobile |
| Receipt OCR extracts correct items | REPT-03 | AI output varies per receipt | Photograph sample receipt, verify extracted items match |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
