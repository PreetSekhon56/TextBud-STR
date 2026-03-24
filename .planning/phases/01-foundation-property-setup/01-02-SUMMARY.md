---
phase: 01-foundation-property-setup
plan: 02
subsystem: bot, handlers, setup-wizard
tags: [telegraf, telegram-bot, sqlite, conversation-flow, setup-wizard]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Project scaffold, DB schema (10 tables), bot skeleton, domain types"
provides:
  - "Full guided property setup wizard (name -> rooms -> photos -> FAQ -> checklists -> deep clean -> review)"
  - "Setup orchestrator with session management and step routing"
  - "Room creation from comma-separated input"
  - "Staging photo collection per room with Telegram download and local storage"
  - "FAQ guidebook collection across 6 categories with skip support"
  - "Per-room cleaning checklists (standard + deep) with room-type suggestions"
  - "Deep clean cycle configuration with input validation"
  - "Setup review summary with confirmation flow"
  - "Session resume after owner abandonment"
affects: [01-03, 01-04, 02-cleaning-workflow, 03-guest-support]

# Tech tracking
tech-stack:
  added: []
  patterns: [conversation-step-machine, in-memory-progress-tracking, per-room-iteration, photo-download-and-store]

key-files:
  created:
    - src/handlers/setup.ts
    - src/handlers/setup-rooms.ts
    - src/handlers/setup-photos.ts
    - src/handlers/setup-faq.ts
    - src/handlers/setup-checklists.ts
    - src/handlers/setup-deepclean.ts
    - src/handlers/setup-review.ts
  modified:
    - src/bot.ts

key-decisions:
  - "Used in-memory Maps for FAQ and checklist sub-step tracking (keyed by owner ID) since setup_sessions table only has current_room_index"
  - "Photo download uses fetch API with Buffer conversion for local file storage"
  - "Cancel setup support via 'cancel setup' command that cleans up session and property"
  - "Resume detection based on 5-minute inactivity gap on setup_sessions.updated_at"

patterns-established:
  - "Handler pattern: each step has handleXxx(ctx, session) and promptXxx(ctx, ...) exports"
  - "Step completion signal: handlers return string literals ('step_complete', 'waiting', etc.) for orchestrator routing"
  - "Room iteration: setup_sessions.current_room_index tracks which room for multi-room steps (photos, checklists)"
  - "In-memory progress: Map<ownerId, subStepState> for steps with sub-categories (FAQ categories, checklist clean types)"

requirements-completed: [PROP-01, PROP-02, PROP-03, PROP-04, PROP-05, PROP-06]

# Metrics
duration: 4min
completed: 2026-03-24
---

# Phase 01 Plan 02: Property Setup Wizard Summary

**Full conversational property setup: 7-step wizard with rooms, staging photos, FAQ guidebook, per-room checklists, deep clean cycles, and review confirmation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-24T09:12:52Z
- **Completed:** 2026-03-24T09:17:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Complete setup orchestrator routing DM messages through 7 setup steps with session persistence
- Room handler accepting comma-separated input with bulk insert and sort ordering
- Photo handler downloading from Telegram API, saving locally, tracking per-room with done/skip
- FAQ handler walking through 6 essential categories (WiFi, parking, trash, appliances, house rules, emergency) with skip support
- Per-room checklist creation with standard + deep clean types and room-based suggestions (Kitchen, Bathroom, Bedroom, Living Room patterns)
- Deep clean cycle config with positive integer validation
- Review handler showing full property summary with confirmation or edit guidance
- Session resume: detects 5-minute inactivity and shows "Welcome back!" with progress

## Task Commits

Each task was committed atomically:

1. **Task 1: Setup orchestrator with session management and room/photo handlers** - `ef31359` (feat)
2. **Task 2: FAQ, checklist, deep clean cycle, and review handlers** - `2f71e46` (feat)

## Files Created/Modified
- `src/handlers/setup.ts` - Setup orchestrator: step routing, session CRUD, "new property" trigger, resume logic
- `src/handlers/setup-rooms.ts` - Room creation from comma-separated text with sort_order
- `src/handlers/setup-photos.ts` - Staging photo download, local storage, per-room collection
- `src/handlers/setup-faq.ts` - FAQ collection across 6 categories with auto-generated questions and skip
- `src/handlers/setup-checklists.ts` - Per-room standard + deep clean checklists with room-type suggestions
- `src/handlers/setup-deepclean.ts` - Deep clean cycle (every Nth clean) with positive integer validation
- `src/handlers/setup-review.ts` - Full property summary display with confirmation/edit flow
- `src/bot.ts` - Added registerSetupHandlers import and registration

## Decisions Made
- Used in-memory Maps for FAQ category and checklist sub-step tracking rather than adding DB columns, since these are transient session state that resets on restart
- Photo download uses native fetch + Buffer.from(arrayBuffer) pattern, with graceful fallback to file_id-only storage if download fails
- Cancel setup command cleans up both session and property rows to avoid orphaned data
- Resume detection uses 5-minute threshold on updated_at to distinguish between rapid message flow and returning after absence

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. STAGING_PHOTOS_DIR environment variable (already in .env.example from Plan 01) controls photo storage location.

## Next Phase Readiness
- Full setup wizard complete: owners can configure properties entirely through DM conversation
- Ready for Plan 03 (group management / cleaner onboarding) which connects properties to cleaning groups
- Ready for Plan 04 (editing flows) which allows owners to modify setup data after completion

---
*Phase: 01-foundation-property-setup*
*Completed: 2026-03-24*
