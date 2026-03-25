---
phase: 07-floor-plan-generation
plan: 01
subsystem: ai-services
tags: [ffmpeg, claude-vision, svg, video-processing, floor-plan]

requires:
  - phase: 01-foundation
    provides: Property model, database schema, Telegram bot
  - phase: 02-cleaning-workflow
    provides: entry_video_file_id in cleaning sessions, Anthropic SDK pattern
provides:
  - Floor plan generation service (video -> frames -> Claude Vision -> SVG)
  - DB migration adding floor_plan_svg column to properties
  - RoomConnectivity type for room graph data
  - Fallback SVG generation when Claude returns invalid output
affects: [07-02 (Telegram handlers for floor plan commands)]

tech-stack:
  added: []
  patterns: [two-pass Claude pipeline (Vision analysis then SVG generation), FFmpeg frame extraction via execFile, fallback SVG generation, try/finally temp file cleanup]

key-files:
  created:
    - src/db/migrations/006_floor_plans.sql
    - src/services/floor-plan.ts
    - tests/floor-plan/service.test.ts
  modified:
    - src/types/index.ts

key-decisions:
  - "Two-pass Claude approach: Vision analysis returns structured JSON, then text-only call generates SVG from that JSON"
  - "Fallback SVG uses grid layout with room boxes and dashed connection lines when Claude returns invalid SVG"
  - "extractFrames creates temp dir with timestamp suffix to avoid collisions"

patterns-established:
  - "Two-pass AI pipeline: structured data extraction first, then creative generation from structured data"
  - "Fallback generation: deterministic output when AI fails, ensuring the system always produces a result"
  - "try/finally cleanup: temp video and frame files cleaned up even on pipeline errors"

requirements-completed: [PROP-08]

duration: 3min
completed: 2026-03-25
---

# Phase 7 Plan 1: Floor Plan Generation Service Summary

**Video-to-SVG floor plan pipeline using FFmpeg frame extraction, two-pass Claude Vision analysis, and fallback SVG generation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T18:51:42Z
- **Completed:** 2026-03-25T18:54:56Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Full video processing pipeline: Telegram video download, FFmpeg frame extraction, Claude Vision room analysis, SVG floor plan generation, DB storage
- Robust fallback SVG generation with grid layout when Claude produces invalid output
- Temp file cleanup via try/finally ensuring no disk leaks even on errors
- 9 unit tests covering extraction, download, analysis, SVG generation, fallback, full pipeline, and error cleanup

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration, types, and FFmpeg frame extraction** - `c4b3000` (feat)
2. **Task 2: Claude Vision analysis, SVG generation, and full pipeline** - `a280931` (feat)

## Files Created/Modified
- `src/db/migrations/006_floor_plans.sql` - Adds floor_plan_svg TEXT column to properties table
- `src/services/floor-plan.ts` - Full floor plan generation service (downloadVideoToTemp, extractFrames, analyzeWalkthroughFrames, generateFloorPlanSvg, generateFloorPlan)
- `src/types/index.ts` - Added floor_plan_svg to Property interface, new RoomConnectivity type
- `tests/floor-plan/service.test.ts` - 9 tests with mocked execFile, Anthropic SDK, fetch, and DB

## Decisions Made
- Two-pass Claude approach: Vision analysis returns structured RoomConnectivity JSON, then a separate text-only call generates SVG from that data. More reliable than single-pass.
- Fallback SVG uses deterministic grid layout with labeled rectangles and dashed connection lines. Always produces valid SVG even when Claude fails.
- Frame extraction limited to 20 frames at 1 frame per 2 seconds (configurable via opts parameter).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Floor plan service is ready. Plan 07-02 will wire Telegram handlers for async trigger on entry video and floor plan request commands.
- All exports (generateFloorPlan, extractFrames, analyzeWalkthroughFrames, generateFloorPlanSvg) available for handler integration.

---
*Phase: 07-floor-plan-generation*
*Completed: 2026-03-25*
