---
phase: 04-guest-support
plan: 01
subsystem: messaging
tags: [claude-ai, faq, telegram, guest-support, nlp]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Telegram bot, owner/property/FAQ schema, group detection"
provides:
  - "Guest group detection and auto-linking"
  - "Claude-powered FAQ matching service"
  - "Guest message handler with interaction logging"
  - "Owner FAQ addition flow via DM"
affects: [05-polish]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Claude AI for semantic FAQ matching with JSON response parsing", "In-memory Map for pending FAQ additions keyed by owner telegram ID"]

key-files:
  created:
    - src/db/migrations/004_guest_support.sql
    - src/services/faq-matcher.ts
    - src/handlers/guest.ts
  modified:
    - src/types/index.ts
    - src/handlers/groups.ts
    - src/bot.ts

key-decisions:
  - "Guest group detected by non-cleaner member presence (unknown telegram_id in cleaners table)"
  - "Single-property owners get auto-linked guest groups; multi-property owners go through DM selection"
  - "pendingFaqAdditions in-memory Map for transient owner FAQ reply state"

patterns-established:
  - "Guest group routing: group_type === 'guest' check before cleaning handler in bot.ts"
  - "FAQ addition DM pattern: owner replies 'add faq: [answer]' to grow knowledge base"

requirements-completed: [GUEST-01, GUEST-02, GUEST-03]

# Metrics
duration: 7min
completed: 2026-03-25
---

# Phase 4 Plan 1: Guest Support Summary

**Claude-powered FAQ matching for guest groups with owner notification and dynamic FAQ growth via "add faq:" DM flow**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-25T15:20:40Z
- **Completed:** 2026-03-25T15:27:52Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Guest groups detected when bot added to group with owner and non-cleaner member
- Claude AI matches guest questions against property FAQ entries with confidence scoring
- Unmatched questions trigger owner DM notification with "add faq:" reply flow
- All guest interactions logged in guest_interactions table for analytics

## Task Commits

Each task was committed atomically:

1. **Task 1: Database migration, types, and guest group detection** - `28b36d7` (feat)
2. **Task 2: FAQ matcher service, guest message handler, and bot.ts wiring** - `da0d3ad` (feat)

## Files Created/Modified
- `src/db/migrations/004_guest_support.sql` - guest_interactions table for logging questions/answers
- `src/services/faq-matcher.ts` - Claude-powered semantic FAQ matching service
- `src/handlers/guest.ts` - Guest message handler with interaction logging and owner notification
- `src/types/index.ts` - Added GuestInteraction interface
- `src/handlers/groups.ts` - Guest group detection (non-cleaner = guest), auto-link for single-property owners
- `src/bot.ts` - Guest group routing, registerGuestHandlers, "add faq:" DM handler

## Decisions Made
- Guest vs cleaning group determined by checking if non-owner member exists in cleaners table
- Single-property owners get auto-linked guest groups without DM prompt
- pendingFaqAdditions uses in-memory Map (consistent with existing patterns for transient session state)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Guest FAQ answering flow is complete and integrated
- Ready for phase 05 polish and refinements

---
*Phase: 04-guest-support*
*Completed: 2026-03-25*
