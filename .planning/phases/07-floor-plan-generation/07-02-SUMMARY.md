---
phase: 07-floor-plan-generation
plan: 02
subsystem: telegram-handlers
tags: [floor-plan, telegram, cleaning-workflow, group-routing, fire-and-forget]

requires:
  - phase: 07-floor-plan-generation
    provides: Floor plan service (generateFloorPlan), Property.floor_plan_svg column, RoomConnectivity type
  - phase: 02-cleaning-workflow
    provides: Entry video handler in cleaning.ts, registerCleaningHandlers pattern
  - phase: 01-foundation
    provides: Bot.ts group text router, handler module pattern
provides:
  - Floor plan request handler for cleaning and guest groups
  - Async floor plan trigger on entry video submission
  - isFloorPlanRequest keyword matcher
affects: []

tech-stack:
  added: []
  patterns: [fire-and-forget async trigger with .catch() error swallowing, keyword-based group routing before type-specific handlers]

key-files:
  created:
    - src/handlers/floor-plan.ts
    - tests/floor-plan/handler.test.ts
  modified:
    - src/handlers/cleaning.ts
    - src/bot.ts

key-decisions:
  - "Floor plan routing placed before guest/cleaning routing in bot.ts group handler so it works for both group types"
  - "generateFloorPlanIfNeeded called before ctx.reply in video handler to start async work ASAP"

patterns-established:
  - "Fire-and-forget async pattern: call .catch() on promise without await to prevent blocking main flow"
  - "Cross-group-type routing: keyword check before group_type dispatch handles commands shared across group types"

requirements-completed: [PROP-08, PROP-09]

duration: 3min
completed: 2026-03-25
---

# Phase 7 Plan 2: Floor Plan Handlers Summary

**Telegram handlers for async floor plan generation on entry video and on-demand SVG retrieval in cleaning/guest groups**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T18:57:02Z
- **Completed:** 2026-03-25T19:00:02Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Floor plan handler module with handleFloorPlanRequest, generateFloorPlanIfNeeded, and isFloorPlanRequest exports
- Async fire-and-forget floor plan generation triggered after entry video submission without blocking cleaning flow
- Floor plan routing in bot.ts group handler works for both cleaning and guest group types
- 13 handler tests covering SVG delivery, no-plan messaging, skip-when-exists, error swallowing, and keyword matching

## Task Commits

Each task was committed atomically:

1. **Task 1: Floor plan handler and async trigger** - `73ba465` (feat)
2. **Task 2: Wire into cleaning.ts and bot.ts** - `14f59c6` (feat)

## Files Created/Modified
- `src/handlers/floor-plan.ts` - Floor plan request handler, async generation trigger, keyword matcher
- `tests/floor-plan/handler.test.ts` - 13 tests for handler module
- `src/handlers/cleaning.ts` - Added generateFloorPlanIfNeeded import and fire-and-forget call in entry video handler
- `src/bot.ts` - Added floor plan imports, group routing before guest/cleaning dispatch, help text update

## Decisions Made
- Floor plan routing placed before guest/cleaning group type dispatch in bot.ts so a single check handles both group types
- generateFloorPlanIfNeeded called before ctx.reply in video handler to start async work as early as possible

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 7 (Floor Plan Generation) is complete. Both plans delivered: service pipeline (07-01) and Telegram handlers (07-02).
- All floor plan requirements (PROP-08, PROP-09) are satisfied.

---
*Phase: 07-floor-plan-generation*
*Completed: 2026-03-25*
