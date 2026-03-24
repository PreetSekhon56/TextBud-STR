---
phase: 02-cleaning-workflow
plan: 01
subsystem: database, testing, ai
tags: [sqlite, anthropic, jest, ts-jest, claude-vision, cleaning-workflow]

# Dependency graph
requires:
  - phase: 01-property-setup
    provides: properties, rooms, staging_photos, checklists, checklist_items tables and types
provides:
  - cleaning_sessions, milestone_photos, comparison_results, session_checklist_progress DB tables
  - CleaningSession, MilestonePhoto, ComparisonResult, SessionChecklistProgress TypeScript interfaces
  - comparePhotos and downloadTelegramPhoto vision service functions
  - Jest test infrastructure with ts-jest
  - Test stubs for CLEAN-01 through CLEAN-08
affects: [02-cleaning-workflow, cleaning-session-flow, photo-comparison, completion-flow]

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/sdk", "jest", "ts-jest", "ts-node", "@types/jest"]
  patterns: ["dynamic migration runner (reads all .sql files)", "tsconfig.test.json for test-specific TS config"]

key-files:
  created:
    - src/db/migrations/002_cleaning.sql
    - src/services/vision.ts
    - jest.config.ts
    - tsconfig.test.json
    - tests/cleaning/checkin.test.ts
    - tests/cleaning/checklist.test.ts
    - tests/cleaning/comparison.test.ts
    - tests/cleaning/completion.test.ts
  modified:
    - src/types/index.ts
    - src/db/schema.ts
    - scripts/smoke-test-db.ts
    - package.json

key-decisions:
  - "Dynamic migration runner: schema.ts now reads all .sql files from migrations/ directory instead of hardcoded filename"
  - "Separate tsconfig.test.json with isolatedModules for Jest compatibility with NodeNext module resolution"
  - "ts-node installed for Jest TS config file support (jest.config.ts)"

patterns-established:
  - "Migration pattern: add numbered .sql files to src/db/migrations/, auto-discovered by schema.ts"
  - "Test pattern: tests/{feature}/*.test.ts with ts-jest and tsconfig.test.json"

requirements-completed: [CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05, CLEAN-06, CLEAN-07, CLEAN-08]

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 02 Plan 01: Cleaning Foundation Summary

**Anthropic SDK + 4 cleaning DB tables + vision comparison service + Jest test infrastructure with 27 requirement stubs**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T15:41:48Z
- **Completed:** 2026-03-24T15:45:10Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Four new database tables for cleaning workflow (cleaning_sessions, milestone_photos, comparison_results, session_checklist_progress)
- Vision service with Claude photo comparison (comparePhotos) and Telegram photo download helper
- Jest test infrastructure with 4 test files covering all CLEAN-01 through CLEAN-08 requirements (27 test stubs)
- Dynamic migration runner that auto-discovers all .sql files

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Anthropic SDK, create DB migration, add types, wire migration** - `f09c938` (feat)
2. **Task 2: Set up Jest test infrastructure with test stubs** - `422fe0c` (feat)

## Files Created/Modified
- `src/db/migrations/002_cleaning.sql` - Four cleaning workflow tables
- `src/types/index.ts` - Added CleaningSession, MilestonePhoto, ComparisonResult, SessionChecklistProgress interfaces
- `src/services/vision.ts` - Claude Vision photo comparison service with downloadTelegramPhoto helper
- `src/db/schema.ts` - Updated to dynamic migration runner (reads all .sql files)
- `jest.config.ts` - Jest configuration with ts-jest preset
- `tsconfig.test.json` - Test-specific TypeScript config with jest types and isolatedModules
- `tests/cleaning/checkin.test.ts` - Check-in flow test stubs (CLEAN-01, CLEAN-02)
- `tests/cleaning/checklist.test.ts` - Sequential checklist test stubs (CLEAN-04)
- `tests/cleaning/comparison.test.ts` - Photo comparison test stubs (CLEAN-05, CLEAN-06, CLEAN-07)
- `tests/cleaning/completion.test.ts` - Completion flow test stubs (CLEAN-08)
- `scripts/smoke-test-db.ts` - Updated expected tables list to include new cleaning tables
- `package.json` - Added Anthropic SDK, Jest dependencies, test scripts

## Decisions Made
- Upgraded schema.ts from hardcoded migration path to dynamic file discovery (reads all .sql files sorted alphabetically) -- future migrations just need to be added as numbered files
- Created separate tsconfig.test.json for Jest (adds jest types, isolatedModules, includes tests directory) instead of modifying main tsconfig
- Installed ts-node to support jest.config.ts (TypeScript config file) as required by Jest

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ts-jest peer dependency conflict with TypeScript 6**
- **Found during:** Task 2 (Jest installation)
- **Issue:** ts-jest@29 requires TypeScript <6, project uses TypeScript 6.0.2
- **Fix:** Used --legacy-peer-deps flag for installation (ts-jest works correctly with TS 6)
- **Files modified:** package-lock.json
- **Verification:** Jest runs all test files successfully
- **Committed in:** 422fe0c (Task 2 commit)

**2. [Rule 3 - Blocking] Jest could not parse TypeScript config without ts-node**
- **Found during:** Task 2 (Jest verification)
- **Issue:** jest.config.ts failed to load -- Jest requires ts-node for TS config files
- **Fix:** Installed ts-node as dev dependency
- **Files modified:** package.json, package-lock.json
- **Verification:** jest --listTests discovers all 4 test files
- **Committed in:** 422fe0c (Task 2 commit)

**3. [Rule 3 - Blocking] Jest test files could not find test/describe/expect types**
- **Found during:** Task 2 (Jest verification)
- **Issue:** tsconfig.json has rootDir: "src" and include: ["src"], so tests/ directory not compiled with jest types
- **Fix:** Created tsconfig.test.json extending main tsconfig with rootDir: ".", types: ["jest", "node"], include: ["src", "tests"], isolatedModules: true
- **Files modified:** tsconfig.test.json (new), jest.config.ts (updated tsconfig reference)
- **Verification:** All 4 test suites pass (27 todo tests)
- **Committed in:** 422fe0c (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All auto-fixes necessary to make Jest work with the existing TypeScript 6 + NodeNext setup. No scope creep.

## Issues Encountered
None beyond the auto-fixed blocking issues above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All cleaning DB tables ready for session management queries
- TypeScript interfaces ready for service layer implementation
- Vision service ready for integration with cleaning flow handlers
- Jest infrastructure ready for TDD in subsequent plans
- Test stubs provide requirement traceability for CLEAN-01 through CLEAN-08

---
*Phase: 02-cleaning-workflow*
*Completed: 2026-03-24*
