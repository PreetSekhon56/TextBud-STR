# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-25
**Phases:** 7 | **Plans:** 15 | **Tasks:** ~31

### What Was Built
- Complete property setup wizard with rooms, staging photos, FAQ, checklists, deep clean scheduling
- Full cleaning workflow: check-in, entry video, sequential checklists with inline buttons, AI photo comparison, real-time flagging
- Completion reports with inventory walkthrough, AI receipt scanning, low-stock alerts
- Guest support with Claude-powered FAQ matching and self-improving knowledge base
- Telegram Payments with Stripe (Apple Pay / Google Pay), per-property subscriptions with enforcement gate
- AI floor plan generation from entry walkthrough video (FFmpeg + Claude Vision + SVG)

### What Worked
- Wave-based parallel execution: independent plans in the same phase executed concurrently
- TDD approach in plans: writing tests alongside implementation caught issues early
- Two-pass Claude approach for floor plans: structured JSON intermediate prevented SVG hallucination
- Central DM router with priority dispatch: clean separation of handler concerns
- In-memory Maps for transient session state: fast and simple for MVP
- Milestone audit → gap closure cycle: caught orphaned requirements (PROP-08/09) and integration gaps (subscription enforcement)

### What Was Inefficient
- Subscription gate was implemented in Phase 6 without testing the full onboarding flow — created a chicken-and-egg deadlock for new owners that the integration checker caught
- bot.hears handlers registered outside the DM text router bypass the subscription gate — architectural pattern mismatch
- ROADMAP.md plan checkboxes drifted from actual completion status during rapid execution — had to fix stale markers
- Phase 2 plan checkboxes showed incomplete in ROADMAP.md even after execution due to the executor not updating them

### Patterns Established
- Handler module pattern: `registerXHandlers(bot)` exported from handler files, called in bot.ts
- Anthropic SDK pattern: model 'claude-sonnet-4-20250514', JSON parsing via regex `/\{[\s\S]*\}/`
- Migration pattern: sequential .sql files in migrations/ directory, auto-discovered by schema.ts
- Session state: in-memory Maps keyed by chatId or ownerId for transient conversational state
- Fire-and-forget async: `fn().catch(err => console.error(...))` for non-blocking background work

### Key Lessons
1. Integration testing should verify the full onboarding flow end-to-end, not just individual feature paths — the subscription gate deadlock was only caught by the integration checker, not by phase-level tests
2. bot.hears vs bot.on('text') has routing priority implications in Telegraf — hears fires first and bypasses middleware chains; subscription enforcement should use middleware, not router position
3. Two-pass AI pipelines (analyze → generate) are more reliable than single-pass (analyze + generate in one call)
4. Nyquist validation retroactively is more expensive than building it in — phases 1, 4, 6 needed full test suites written after the fact

### Cost Observations
- Model mix: ~80% opus (planning + execution), ~20% sonnet (integration checking, nyquist auditing)
- Sessions: ~4 sessions across 2 days
- Notable: Parallel agent execution (wave-based) significantly reduced wall-clock time for multi-plan phases

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 7 | 15 | Initial build — established all core patterns |

### Cumulative Quality

| Milestone | Tests | Suites | Source LOC | Test LOC |
|-----------|-------|--------|-----------|----------|
| v1.0 | 141 | 14 | 5,606 | 2,659 |

### Top Lessons (Verified Across Milestones)

1. Integration testing catches what phase-level verification misses — test the full user journey, not just features in isolation
