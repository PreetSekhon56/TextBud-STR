---
phase: 02-cleaning-workflow
plan: 02
subsystem: cleaning
tags: [telegraf, inline-keyboard, callback-query, session-management, intent-recognition]

# Dependency graph
requires:
  - phase: 02-cleaning-workflow/01
    provides: "DB schema (cleaning_sessions, session_checklist_progress), types, test stubs"
provides:
  - "Check-in intent recognition and session creation"
  - "Entry video capture handler"
  - "Room-by-room inline keyboard checklist"
  - "Cleaner-only button verification"
  - "Group chat text routing in bot.ts"
affects: [02-cleaning-workflow/03, 03-photo-verification]

# Tech tracking
tech-stack:
  added: []
  patterns: [inline-keyboard-callbacks, in-memory-session-map-with-db-reload, group-text-routing]

key-files:
  created:
    - src/handlers/cleaning.ts
    - src/handlers/cleaning-checklist.ts
  modified:
    - src/bot.ts
    - tests/cleaning/checkin.test.ts
    - tests/cleaning/checklist.test.ts
    - jest.config.ts

key-decisions:
  - "moduleNameMapper in jest.config.ts to strip .js extensions for ts-jest resolution"
  - "ActiveCleaningSession in-memory Map keyed by chatId with DB reload on startup for restart resilience"
  - "Milestone photo request on room completion blocks auto-advance to next room (Plan 03 handles photo receipt)"

patterns-established:
  - "Inline keyboard callback data format: c_{sessionId}_{itemId}"
  - "Group message routing: bot.ts terminal text handler after DM router queries telegram_groups and delegates to handleGroupMessage"
  - "Session reload on bot startup: query completed_at IS NULL rows and rebuild in-memory state"

requirements-completed: [CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04]

# Metrics
duration: 5min
completed: 2026-03-24
---

# Phase 02 Plan 02: Check-in, Entry Video, and Room Checklist Summary

**Cleaner check-in via intent recognition, entry video capture, and sequential room-by-room inline keyboard checklists with cleaner-only button verification**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-24T15:47:15Z
- **Completed:** 2026-03-24T15:51:45Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Check-in intent recognition (regex patterns for "I'm here", "checking in", "arrived", etc.) with clean type determination based on deep_clean_cycle
- Entry video handler captures walkthrough video before cleaning starts, then triggers first room checklist
- Inline keyboard checklist with [done] prefix on completed items, auto-detects room completion, requests milestone photo
- Group chat text routing wired into bot.ts after DM router, delegating to handleGroupMessage
- Session resume: re-checking in reloads active session and resends current room checklist
- 21 unit tests passing across checkin and checklist test suites

## Task Commits

Each task was committed atomically:

1. **Task 1: Check-in flow with intent recognition, session creation, and entry video handler** - `56d2b1f` (feat)
2. **Task 2: Sequential checklist with inline keyboard buttons and room auto-advancement** - `f45f905` (feat)
3. **Task 3: Wire cleaning handlers into bot.ts group routing** - `94a7a12` (feat)

## Files Created/Modified
- `src/handlers/cleaning.ts` - Check-in intent, session creation, entry video, group message routing
- `src/handlers/cleaning-checklist.ts` - Inline keyboard generation, callback handling, room progression
- `src/bot.ts` - Import cleaning handlers, register them, add group text routing
- `tests/cleaning/checkin.test.ts` - 16 tests for isCheckInIntent, isCompletionIntent, determineCleanType
- `tests/cleaning/checklist.test.ts` - 5 tests for buildChecklistKeyboard and getCompletedItemIds
- `jest.config.ts` - Added moduleNameMapper for .js extension stripping

## Decisions Made
- Added moduleNameMapper to jest.config.ts to resolve .js imports in TypeScript source when running under ts-jest
- ActiveCleaningSession Map keyed by chatId with DB reload on startup ensures sessions survive bot restarts
- Milestone photo request on room completion blocks auto-advance -- Plan 03 will handle photo receipt and trigger next room

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added moduleNameMapper to jest.config.ts**
- **Found during:** Task 1 (TDD RED phase)
- **Issue:** ts-jest could not resolve .js extension imports in source files (e.g., `../db/connection.js`)
- **Fix:** Added `moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' }` to jest.config.ts
- **Files modified:** jest.config.ts
- **Verification:** All tests run and pass
- **Committed in:** 56d2b1f (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for test execution. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Check-in through checklist flow complete, ready for Plan 03 (photo comparison, completion, exit video)
- Milestone photo handler not yet implemented (Plan 03 will receive photos and call sendRoomChecklist for next room)
- Completion intent stub ready for Plan 03 to implement

---
*Phase: 02-cleaning-workflow*
*Completed: 2026-03-24*
