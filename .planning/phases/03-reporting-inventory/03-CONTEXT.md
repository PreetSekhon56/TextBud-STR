# Phase 3: Reporting & Inventory - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

After cleaning completion, owners receive a comprehensive completion report with room-by-room detail, side-by-side photos, and AI assessments. Cleaners then walk through a supply closet inventory check with item-by-item counts, low-stock alerting to owners, and full data storage for the future ordering system.

Requirements: REPT-01, REPT-02, REPT-03, REPT-04, REPT-05

</domain>

<decisions>
## Implementation Decisions

### Completion Report Format
- Full detailed report, room-by-room breakdown
- Each room shows: staging photo + milestone photo as a 2-photo media group (side-by-side pair), followed by AI pass/flag verdict and specific issues
- Flagged items highlighted inline within their room section (not grouped separately at top)
- Per-room checklist completion status showing which items were completed vs skipped
- Report header includes: time in/out, duration, clean type, overall room pass/fail score, checklist completion stats
- Replaces the current brief summary in `handleCompletion` — the full report IS the completion message

### Report Delivery & Timing
- Report sent to the group chat (owner + cleaner + bot) immediately after cleaning completion
- No separate DM — group chat is the single delivery channel
- Report stored in the database for historical access — owner can ask "show last report for [property]" later

### Inventory Walkthrough Flow
- Auto-triggered immediately after the completion report sends — "Now let's do a quick inventory check."
- Inventory is specifically about the **supply closet** — what's left in reserve. Room-by-room stocking is already handled by the checklist
- Item-by-item sequential prompts: "Trash bags — how many left?" Cleaner types a number
- Default starter supply list provided by TextBud (common STR supplies: toilet paper, trash bags, soap, paper towels, etc.), owner must customize during setup
- Receipt-to-inventory: owner can photograph a purchase receipt, AI extracts items and adds them to the inventory list
- Owner configures inventory check frequency: every clean, every Nth clean, or manual trigger only
- When count drops by an alarming rate (significantly below expected consumption), photo is required for verification; otherwise just the count

### Low-Stock Alerts & Data
- Owner sets initial par level (minimum) per item during inventory setup
- TextBud makes recommendations to adjust thresholds based on actual consumption patterns over time
- Low-stock alerts appear as a section at the end of the cleaning completion report — not sent as separate notifications
- Full data stored per inventory check: item, count, session, date, consumption delta, photos taken, cleaner notes
- Owner can update counts via text (e.g., "restocked trash bags 20") to keep inventory accurate after purchasing

### Claude's Discretion
- Exact wording of inventory prompts and report formatting
- "Alarming rate" threshold logic for requiring photos (e.g., 2x expected consumption)
- Default starter supply list composition
- Receipt OCR/AI extraction approach
- How to handle inventory items owner hasn't set a par level for
- Report message splitting strategy (Telegram has message length limits)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Spec
- `/Users/preetsekhon/Downloads/textbud-mvp-spec.md` — Completion Report section: report fields, inventory walkthrough, supply management data model

### Project Planning
- `.planning/REQUIREMENTS.md` — Requirements REPT-01 through REPT-05 define this phase's scope
- `.planning/PROJECT.md` — Key decisions: data strategy for inventory consumption patterns, future ordering system

### Phase 2 Context & Implementation
- `.planning/phases/02-cleaning-workflow/02-CONTEXT.md` — Cleaning flow decisions: completion flow, AI comparison behavior, flagging tone
- `src/handlers/cleaning.ts` — `handleCompletion`, `getComparisonSummary`, `calculateDuration`, `getRoomsWithoutPhotos` — these are the integration points for report generation
- `src/handlers/cleaning-photos.ts` — Photo handling and AI comparison flow
- `src/services/vision.ts` — Claude Vision integration (`comparePhotos`, `downloadTelegramPhoto`)
- `src/db/migrations/002_cleaning.sql` — `cleaning_sessions`, `milestone_photos`, `comparison_results`, `session_checklist_progress` tables

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/services/vision.ts`: Claude Vision already integrated — `comparePhotos` and `downloadTelegramPhoto` can be reused for receipt OCR and inventory photo verification
- `src/handlers/cleaning.ts`: `handleCompletion` is the direct integration point — report generation replaces the current brief summary
- `src/handlers/cleaning.ts`: `getComparisonSummary` already queries pass/fail counts per room — extend for full report
- `src/handlers/cleaning.ts`: `calculateDuration` — reusable for report header
- `src/types/index.ts`: `CleaningSession`, `MilestonePhoto`, `ComparisonResult`, `SessionChecklistProgress` types provide report data model

### Established Patterns
- Handler module pattern: `registerXHandlers(bot)` — new inventory handlers follow this pattern
- In-memory Maps for transient session state (keyed by chatId) — inventory walkthrough session state
- Sequential prompt pattern from cleaning-checklist.ts (item-by-item with inline buttons) — adapt for inventory count prompts
- Keyword-based intent recognition for natural language input
- Dynamic SQL migration runner — new `003_inventory.sql` migration auto-discovered

### Integration Points
- `handleCompletion` in `cleaning.ts` — replace brief summary with full report, then trigger inventory walkthrough
- `cleaning_sessions` table — add report storage (or create `completion_reports` table)
- `properties` table — add inventory frequency setting
- New tables needed: `inventory_items`, `inventory_counts`, `inventory_photos`
- Property setup flow (`src/handlers/setup.ts`) — add inventory setup step for defining supply list and par levels

</code_context>

<specifics>
## Specific Ideas

- Supply closet is the inventory target, NOT room-by-room supplies (rooms are covered by checklists)
- Receipt scanning to build/update inventory list — owner photographs a store receipt, AI extracts items and quantities
- Photo required on alarming consumption drops as a verification/accountability mechanism
- Owner restock updates ("restocked trash bags 20") to keep counts accurate between cleans
- Default starter list lowers setup friction, but owner MUST customize it to their property

</specifics>

<deferred>
## Deferred Ideas

- **Supply e-commerce / ordering system** — MVP collects consumption data; actual ordering is post-MVP (SUPP-01, SUPP-02)
- **AI-recommended par levels from consumption history** — noted as future enhancement once enough data collected
- **Inventory trend dashboards** — visual consumption charts, out of scope for text-first MVP
- **Multi-closet support** — some properties may have multiple supply storage locations; handle as single location for MVP

</deferred>

---

*Phase: 03-reporting-inventory*
*Context gathered: 2026-03-25*
