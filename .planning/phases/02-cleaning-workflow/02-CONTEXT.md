# Phase 2: Cleaning Workflow - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Cleaners execute the full cleaning loop — check-in, entry video (liability documentation), sequential room-by-room checklists with inline button interaction, milestone photos with AI comparison via Claude Vision, real-time flagging, and completion flow. All interactions happen in the three-way Telegram group (owner + cleaner + bot).

**Excluded from this phase:** Floor plan generation from video (PROP-08, PROP-09) — deferred to its own phase. The entry video in this phase is for liability documentation only.

Requirements: CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05, CLEAN-06, CLEAN-07, CLEAN-08

</domain>

<decisions>
## Implementation Decisions

### Check-in Flow
- Cleaner initiates check-in with natural language in the group chat ("I'm here", "checking in", "arrived", etc.) — TextBud recognizes intent
- Property is auto-determined from the group (each group is linked to one property from Phase 1)
- Clean type (standard vs deep) is auto-determined from the deep_clean_cycle counter — no manual selection
- On check-in, TextBud sends an overview message (clean type, property name, special instructions) followed immediately by the first room's checklist
- Clock starts on check-in
- If cleaner checks in while a session is already active, TextBud resumes: "Welcome back! You're still on [Room X]. Here's where you left off."
- Owner is notified via the group chat message (no separate DM)

### Sequential Checklist Delivery
- Room-by-room delivery using Telegram inline keyboard buttons
- Each room's checklist items appear as tappable buttons (one per item)
- Cleaner taps each button to mark it done
- When all items for a room are checked off, TextBud auto-advances to the next room
- No typing needed during checklist progression — just taps

### Entry Video
- Recorded right after check-in, before checklist begins
- TextBud prompts: "Before you start, record a slow walkthrough video of the property as-is."
- Cleaner must use Telegram's built-in video recording (video message or video note)
- Purpose is liability documentation only (pre-existing damage/condition)
- Video stored as Telegram file_id reference in database (no local file storage)

### Milestone Photos & AI Comparison
- Photo requests are progress-based: TextBud asks for a photo when cleaner finishes each room's checklist
- TextBud requests a photo from the specific room just completed: "Send me a photo of the Kitchen now."
- Claude Vision compares the submitted photo against the best-matching staging photo angle for that room (not all staging photos)
- If photo doesn't match any room (wrong angle, blurry, wrong room): ask cleaner to resend from a similar angle

### AI Flagging Behavior
- Friendly nudge tone: "Looks like the counter still has some items — can you double-check?"
- On flag, TextBud waits for the cleaner to fix and re-submit a photo before advancing to next room
- Maximum 3 comparison attempts per room — after 3 photos that still don't pass, TextBud accepts and notes it for the owner's report
- AI comparison results (pass/flag) are visible to the owner in real time in the group chat

### Completion Flow
- Cleaner says "I'm done" (natural language recognition)
- TextBud checks if photos were submitted for all rooms — if any missing, prompts: "You haven't sent a photo for [Room] yet. Send one now or skip?"
- Clock stops after all rooms are covered or skipped
- Brief summary sent to cleaner: "All done! Cleaned [Property] in 2h 15m. 6/7 rooms passed. 1 flagged item. Thanks [Cleaner]!"

### Claude's Discretion
- Exact wording of all bot messages (within the "friendly nudge" tone)
- Timeout handling if cleaner goes silent mid-clean
- How to handle rooms with no staging photos (skip comparison or note it)
- Error handling for Claude Vision API failures
- Progress indicators between rooms

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Spec
- `/Users/preetsekhon/Downloads/textbud-mvp-spec.md` — Cleaner Workflow section (Section 2): check-in flow, milestone check-ins, completion, completion report format

### Project Planning
- `.planning/REQUIREMENTS.md` — Requirements CLEAN-01 through CLEAN-08 define this phase's scope
- `.planning/PROJECT.md` — Key decisions: Claude Vision for photo comparison, sequential checklist delivery, three-way Telegram groups

### Phase 1 Context
- `.planning/phases/01-foundation-property-setup/01-CONTEXT.md` — Phase 1 decisions: DM router pattern, handler module pattern, in-memory Maps for session state, keyword-based routing

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/handlers/groups.ts`: Group detection and property linking — provides the group-to-property mapping needed for auto check-in
- `src/bot.ts`: Central DM router pattern with priority-based dispatch — Phase 2 adds group chat routing (not DM)
- `src/types/index.ts`: Owner, Property, Room, StagingPhoto, Checklist, ChecklistItem, Cleaner, TelegramGroup types
- `src/db/connection.ts`: SQLite connection via better-sqlite3
- `src/handlers/setup.ts`: Setup session pattern (getActiveSession) — model for cleaning session state management

### Established Patterns
- Handler module pattern: `registerXHandlers(bot)` exported from handler files, called in bot.ts
- In-memory Maps for transient session state (keyed by user/owner ID)
- Central router with priority-based dispatch for DM messages
- Keyword-based intent recognition for natural language UX
- Setup step handlers returning string literals for orchestrator routing

### Integration Points
- `telegram_groups` table: chat_id -> property_id mapping for auto property detection on check-in
- `properties.clean_count` and `properties.deep_clean_cycle`: existing fields for auto clean type determination
- `staging_photos` table: file_id references for AI comparison
- `checklists` and `checklist_items` tables: room-by-room checklist data for inline button generation
- `rooms` table with sort_order: room sequence for checklist progression
- New tables needed: cleaning_sessions, milestone_photos, comparison_results

</code_context>

<specifics>
## Specific Ideas

- Inline keyboard buttons for checklist items — cleaner taps to mark done, no typing required during the cleaning flow
- Entry video is purely for liability documentation (pre-existing condition), NOT for floor plan generation
- The group chat serves as the real-time activity feed for the owner — they see check-in, flags, and completion all in the group
- Resume behavior on double check-in rather than blocking — assumes the cleaner stepped away and came back

</specifics>

<deferred>
## Deferred Ideas

- **PROP-08 & PROP-09 (Floor plan from video)** — Owner records a walkthrough video during property setup (not cleaning). AI generates a simple visual diagram of room layout. This is a setup/onboarding feature, not a cleaning workflow feature. Should be its own phase.
- Owner override of clean type (e.g., "make next clean deep" or "skip deep clean") — could be a future enhancement

</deferred>

---

*Phase: 02-cleaning-workflow*
*Context gathered: 2026-03-24*
