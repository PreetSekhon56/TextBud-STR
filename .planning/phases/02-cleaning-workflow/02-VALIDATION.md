---
phase: 2
slug: cleaning-workflow
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (Node.js) |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx jest --testPathPattern=cleaning` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --testPathPattern=cleaning`
- **After every plan wave:** Run `npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | CLEAN-01 | unit | `npx jest --testPathPattern=checkin` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | CLEAN-02 | unit | `npx jest --testPathPattern=session` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | CLEAN-03 | unit | `npx jest --testPathPattern=video` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | CLEAN-04 | unit | `npx jest --testPathPattern=checklist` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | CLEAN-05 | unit | `npx jest --testPathPattern=milestone` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | CLEAN-06 | unit | `npx jest --testPathPattern=comparison` | ❌ W0 | ⬜ pending |
| 02-03-03 | 03 | 2 | CLEAN-07 | unit | `npx jest --testPathPattern=flagging` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 2 | CLEAN-08 | unit | `npx jest --testPathPattern=completion` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/cleaning/checkin.test.ts` — stubs for CLEAN-01, CLEAN-02
- [ ] `tests/cleaning/video.test.ts` — stubs for CLEAN-03
- [ ] `tests/cleaning/checklist.test.ts` — stubs for CLEAN-04
- [ ] `tests/cleaning/milestone.test.ts` — stubs for CLEAN-05
- [ ] `tests/cleaning/comparison.test.ts` — stubs for CLEAN-06, CLEAN-07
- [ ] `tests/cleaning/completion.test.ts` — stubs for CLEAN-08
- [ ] `jest.config.ts` — Jest configuration
- [ ] `@types/jest` + `ts-jest` — TypeScript test dependencies

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Inline keyboard buttons render correctly in Telegram | CLEAN-04 | Requires live Telegram client | Send checklist to test group, verify buttons appear and respond to taps |
| Claude Vision photo comparison quality | CLEAN-06 | AI output is non-deterministic | Submit test photo against staging, verify flagging is reasonable |
| Entry video recording via Telegram | CLEAN-03 | Requires mobile Telegram client | Record video in test group, verify file_id stored |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
