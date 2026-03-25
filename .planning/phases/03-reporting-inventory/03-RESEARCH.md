# Phase 3: Reporting & Inventory - Research

**Researched:** 2026-03-25
**Domain:** Telegram report generation, inventory tracking, AI receipt OCR
**Confidence:** HIGH

## Summary

Phase 3 transforms the brief completion summary in `handleCompletion` into a comprehensive room-by-room report with side-by-side photo pairs, AI assessments, and checklist status. It then adds an inventory walkthrough system where cleaners count supply closet items sequentially, with low-stock alerting to owners and persistent data storage.

The existing codebase provides all necessary building blocks: `comparePhotos` and `downloadTelegramPhoto` in `vision.ts` for AI operations, `getComparisonSummary` and `calculateDuration` in `cleaning.ts` for report data, the sequential prompt pattern from `cleaning-checklist.ts` for item-by-item inventory, and the dynamic migration runner for schema additions. The primary technical challenges are Telegram message formatting constraints (4096 char text limit, 1024 char caption limit, 2-10 items per media group) and designing the inventory data model to support future ordering.

**Primary recommendation:** Split the report into a text header message + per-room media groups (staging + milestone photo pairs with AI verdict captions), then trigger inventory walkthrough as a new in-memory session state machine using the established Map pattern.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Full detailed report, room-by-room breakdown
- Each room shows: staging photo + milestone photo as a 2-photo media group (side-by-side pair), followed by AI pass/flag verdict and specific issues
- Flagged items highlighted inline within their room section (not grouped separately at top)
- Per-room checklist completion status showing which items were completed vs skipped
- Report header includes: time in/out, duration, clean type, overall room pass/fail score, checklist completion stats
- Replaces the current brief summary in `handleCompletion` -- the full report IS the completion message
- Report sent to the group chat (owner + cleaner + bot) immediately after cleaning completion
- No separate DM -- group chat is the single delivery channel
- Report stored in the database for historical access -- owner can ask "show last report for [property]" later
- Inventory auto-triggered immediately after the completion report sends
- Inventory is specifically about the supply closet -- not room-by-room supplies
- Item-by-item sequential prompts: "Trash bags -- how many left?" Cleaner types a number
- Default starter supply list provided by TextBud, owner must customize during setup
- Receipt-to-inventory: owner can photograph a purchase receipt, AI extracts items and adds to inventory list
- Owner configures inventory check frequency: every clean, every Nth clean, or manual trigger only
- When count drops by alarming rate, photo required for verification
- Owner sets initial par level (minimum) per item during inventory setup
- TextBud makes recommendations to adjust thresholds based on consumption patterns over time
- Low-stock alerts appear as a section at the end of the cleaning completion report -- not separate notifications
- Full data stored per inventory check: item, count, session, date, consumption delta, photos taken, cleaner notes
- Owner can update counts via text (e.g., "restocked trash bags 20")

### Claude's Discretion
- Exact wording of inventory prompts and report formatting
- "Alarming rate" threshold logic for requiring photos (e.g., 2x expected consumption)
- Default starter supply list composition
- Receipt OCR/AI extraction approach
- How to handle inventory items owner hasn't set a par level for
- Report message splitting strategy (Telegram has message length limits)

### Deferred Ideas (OUT OF SCOPE)
- Supply e-commerce / ordering system -- MVP collects data; ordering is post-MVP
- AI-recommended par levels from consumption history -- future enhancement
- Inventory trend dashboards -- visual consumption charts, out of scope
- Multi-closet support -- single location for MVP

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REPT-01 | Owner receives completion report (time in/out, duration, all photos side-by-side with staging, AI assessment per room, flagged items, checklist status) | Report generation replaces `handleCompletion` summary; uses `sendMediaGroup` for photo pairs, text messages for header/checklist; data already in `cleaning_sessions`, `milestone_photos`, `comparison_results`, `session_checklist_progress` tables |
| REPT-02 | Inventory walkthrough after clean -- item-by-item counts via text | In-memory `ActiveInventorySession` Map following established pattern; sequential prompt state machine; new `inventory_items` and `inventory_counts` tables |
| REPT-03 | Cleaner can photograph supplies and AI registers inventory levels | Reuse `downloadTelegramPhoto` + new `analyzeInventoryPhoto` vision call; store photo file_id in `inventory_photos` table |
| REPT-04 | Low-stock items flagged to owner | Compare count against `par_level` in `inventory_items`; append low-stock section to completion report |
| REPT-05 | Inventory consumption data collected and stored for future ordering system | `inventory_counts` table stores per-check data with consumption delta; `inventory_items` tracks running count and historical par level |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| telegraf | 4.16.3 | Telegram bot framework | Already in use; `ctx.sendMediaGroup`, `ctx.reply` for report delivery |
| better-sqlite3 | 12.8.0 | SQLite database | Already in use; new migration `003_inventory.sql` auto-discovered |
| @anthropic-ai/sdk | 0.80.0 | Claude AI for photo analysis + receipt OCR | Already in use; extend `vision.ts` for receipt parsing and inventory photo analysis |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | - | - | All Phase 3 needs are covered by existing dependencies |

No new dependencies required. The existing stack fully supports report generation, media groups, AI vision calls, and database storage.

## Architecture Patterns

### Recommended Project Structure
```
src/
  handlers/
    reporting.ts           # Report generation + "show last report" handler
    inventory.ts           # Inventory walkthrough session state machine
    inventory-setup.ts     # Owner inventory setup (supply list, par levels, frequency)
  services/
    vision.ts              # Extended: add analyzeReceipt(), analyzeInventoryPhoto()
  db/
    migrations/
      003_inventory.sql    # inventory_items, inventory_counts, inventory_photos tables
  types/
    index.ts               # Extended: InventoryItem, InventoryCount, InventoryPhoto, ActiveInventorySession
```

### Pattern 1: Report Generation as Message Sequence
**What:** Build the completion report as a sequence of Telegram messages: one text header, then per-room media groups with captions, then a checklist summary, then low-stock alerts.
**When to use:** Whenever generating the completion report.
**Why:** Telegram limits text messages to 4096 chars and media group captions to 1024 chars. A single message cannot contain the full report. Media groups require 2-10 items and support photos with individual captions.

```typescript
// Report structure:
// 1. Header text message (time in/out, duration, clean type, overall score)
// 2. Per-room: sendMediaGroup([stagingPhoto, milestonePhoto]) with caption on first photo
//    Caption: "Room: Kitchen -- PASS" or "Room: Kitchen -- FLAGGED\n- Counter still has items"
// 3. Checklist summary text message (completed X/Y items per room)
// 4. Low-stock inventory alerts (if inventory was done)

async function sendCompletionReport(ctx: Context, session: ActiveCleaningSession): Promise<string> {
  // Gather all data
  const sessionRow = db.prepare('SELECT * FROM cleaning_sessions WHERE id = ?').get(session.sessionId);
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(session.propertyId);

  // 1. Header
  const header = buildReportHeader(sessionRow, property, comparison);
  await ctx.reply(header);

  // 2. Per-room photo pairs
  for (const room of rooms) {
    const staging = db.prepare('SELECT * FROM staging_photos WHERE room_id = ? LIMIT 1').get(room.id);
    const milestone = db.prepare(
      'SELECT * FROM milestone_photos WHERE session_id = ? AND room_id = ? ORDER BY attempt_number DESC LIMIT 1'
    ).get(session.sessionId, room.id);

    if (staging && milestone) {
      await ctx.sendMediaGroup([
        { type: 'photo', media: staging.file_id, caption: `${room.name} - Reference` },
        { type: 'photo', media: milestone.file_id, caption: `${room.name} - ${verdict}` },
      ]);
    }
    // AI verdict + issues as follow-up text if needed
  }

  // 3. Checklist summary
  // 4. Low-stock alerts (appended after inventory completes)
}
```

### Pattern 2: Inventory Walkthrough State Machine
**What:** In-memory `activeInventorySessions` Map keyed by chatId, with sequential item prompts. Mirrors the cleaning checklist sequential pattern.
**When to use:** After completion report is sent.
**Why:** Consistent with established patterns (`activeSessions`, `pendingSkipDecisions`). Cleaners respond with numbers; the state machine advances through items.

```typescript
interface ActiveInventorySession {
  sessionId: number;          // cleaning_session_id this inventory belongs to
  propertyId: number;
  chatId: number;
  cleanerId: number;
  items: InventoryItem[];     // ordered list of items to check
  currentItemIndex: number;
  counts: Map<number, number>; // item_id -> count entered
  photos: Map<number, string>; // item_id -> file_id if photo taken
}

const activeInventorySessions = new Map<number, ActiveInventorySession>();
```

### Pattern 3: Owner Inventory Setup in Property Setup Flow
**What:** Add an `inventory` step to the property setup wizard (or as a separate "setup inventory" command). Owner defines supply list and par levels.
**When to use:** During initial property setup or on-demand via "setup inventory" command.
**Why:** Owner must customize the default supply list before inventory checks can run.

### Anti-Patterns to Avoid
- **Single giant message:** Telegram will reject messages over 4096 chars. Always split report into multiple messages.
- **Blocking completion on inventory:** Inventory should be a separate flow that runs after the report. If the cleaner abandons inventory mid-way, the cleaning session is still complete.
- **Storing inventory state in DB during walkthrough:** Follow established pattern of in-memory Maps for transient session state. Only persist to DB when the inventory check is complete.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Photo side-by-side display | Image stitching/compositing | Telegram `sendMediaGroup` with 2 photos | Native Telegram album view shows photos side-by-side; no image processing needed |
| Receipt text extraction | Custom OCR pipeline | Claude Vision with receipt-specific prompt | Claude can read receipts; already integrated; just a different prompt |
| Message length splitting | Manual char-counting splitter | Structure report as multiple messages by design | Design around the constraint rather than fighting it |
| Consumption rate calculation | Complex statistical analysis | Simple delta: `previous_count - current_count` per item | MVP only needs basic consumption tracking; stats are deferred |

**Key insight:** The report is naturally decomposable into discrete Telegram messages (header, per-room photo pairs, summary). This is not a limitation to work around but a design advantage -- each room becomes its own visual unit.

## Common Pitfalls

### Pitfall 1: Media Group Caption Length
**What goes wrong:** Captions on `sendMediaGroup` items are limited to 1024 characters. If AI issues are verbose, the caption gets truncated or the API rejects it.
**Why it happens:** AI comparison `issues` array can produce long text.
**How to avoid:** Put only the room name + pass/flag verdict in the media group caption. Send detailed issues as a separate text reply after the media group.
**Warning signs:** API errors on `sendMediaGroup` calls.

### Pitfall 2: Missing Photos in Report
**What goes wrong:** Some rooms may not have milestone photos (cleaner skipped them) or staging photos (owner didn't upload). Report crashes or looks broken.
**Why it happens:** The skip flow in `handleCompletion` allows completing without photos for some rooms.
**How to avoid:** Handle all four cases: (1) both photos exist -- send pair, (2) only milestone -- send single with note, (3) only staging -- note "no photo submitted", (4) neither -- text-only room entry.
**Warning signs:** Rooms silently missing from report.

### Pitfall 3: Inventory Session Orphaning
**What goes wrong:** Cleaner starts inventory but never finishes (leaves, loses signal, app crash). Inventory session stays in memory forever.
**Why it happens:** No timeout or cleanup mechanism.
**How to avoid:** Add a timeout (e.g., 30 minutes of inactivity) that auto-completes with partial data. On bot restart, do NOT reload inventory sessions from DB -- they're transient.
**Warning signs:** Memory leak from accumulating stale sessions.

### Pitfall 4: Race Condition Between Report and Inventory
**What goes wrong:** Inventory triggers before report messages finish sending. Messages appear interleaved.
**Why it happens:** `sendMediaGroup` and `ctx.reply` are async; multiple rooms send in sequence.
**How to avoid:** Await all report messages before triggering inventory prompt. Use sequential awaits, not `Promise.all`.
**Warning signs:** Inventory prompt appears between room photo pairs.

### Pitfall 5: Number Parsing for Inventory Counts
**What goes wrong:** Cleaner types "about 5" or "5 rolls" or "idk" instead of just "5".
**Why it happens:** Natural language input vs strict number expectation.
**How to avoid:** Parse with regex `\d+` to extract first number. If no number found, ask again: "Just send me the number." Also accept "skip" to move to next item.
**Warning signs:** Inventory walkthrough stalls on non-numeric input.

### Pitfall 6: sendMediaGroup Requires File IDs or URLs
**What goes wrong:** Trying to send photos by local file path instead of Telegram file_id.
**Why it happens:** Confusion between `file_path` (local storage) and `file_id` (Telegram reference).
**How to avoid:** Always use `file_id` from `staging_photos.file_id` and `milestone_photos.file_id`. These are Telegram-native references that work directly with `sendMediaGroup`.
**Warning signs:** "Bad Request: wrong file identifier" errors.

## Code Examples

### Completion Report Header
```typescript
function buildReportHeader(
  session: CleaningSession,
  property: Property,
  cleaner: Cleaner,
  comparison: { passed: number; flagged: number; total: number },
  checklistStats: { completed: number; total: number }
): string {
  const duration = calculateDuration(session.checked_in_at, session.completed_at!);
  const cleanLabel = session.clean_type === 'deep' ? 'Deep Clean' : 'Standard Clean';
  const score = comparison.total > 0
    ? `${comparison.passed}/${comparison.total} rooms passed`
    : 'No photo comparisons';

  return [
    `--- Cleaning Report: ${property.name} ---`,
    ``,
    `Cleaner: ${cleaner.first_name}`,
    `Type: ${cleanLabel}`,
    `Time in: ${formatTime(session.checked_in_at)}`,
    `Time out: ${formatTime(session.completed_at!)}`,
    `Duration: ${duration}`,
    ``,
    `Rooms: ${score}${comparison.flagged > 0 ? ` (${comparison.flagged} flagged)` : ''}`,
    `Checklist: ${checklistStats.completed}/${checklistStats.total} items completed`,
  ].join('\n');
}
```

### Per-Room Media Group
```typescript
// Source: Telegraf ctx.sendMediaGroup with InputMediaPhoto array
async function sendRoomReport(
  ctx: Context,
  room: Room,
  stagingFileId: string | null,
  milestoneFileId: string | null,
  comparisonResult: ComparisonResult | null,
  checklistItems: { description: string; completed: boolean }[]
): Promise<void> {
  // Send photo pair as media group
  if (stagingFileId && milestoneFileId) {
    const verdict = comparisonResult?.passed ? 'PASS' : 'FLAGGED';
    await ctx.sendMediaGroup([
      { type: 'photo', media: stagingFileId, caption: `${room.name} - Reference` },
      { type: 'photo', media: milestoneFileId, caption: `${room.name} - ${verdict}` },
    ]);

    // Send issues as follow-up text if flagged
    if (comparisonResult && !comparisonResult.passed && comparisonResult.issues) {
      const issues = JSON.parse(comparisonResult.issues) as string[];
      const issueText = issues.map(i => `  - ${i}`).join('\n');
      await ctx.reply(`Issues in ${room.name}:\n${issueText}`);
    }
  } else if (milestoneFileId) {
    await ctx.replyWithPhoto(milestoneFileId, {
      caption: `${room.name} - No reference photo available`,
    });
  } else {
    await ctx.reply(`${room.name} - No photo submitted`);
  }

  // Checklist status for this room
  const completed = checklistItems.filter(i => i.completed).length;
  const total = checklistItems.length;
  if (total > 0) {
    const skipped = checklistItems.filter(i => !i.completed).map(i => i.description);
    let checklistLine = `Checklist: ${completed}/${total} items`;
    if (skipped.length > 0) {
      checklistLine += `\nSkipped: ${skipped.join(', ')}`;
    }
    await ctx.reply(checklistLine);
  }
}
```

### Inventory Walkthrough Prompt
```typescript
async function promptNextInventoryItem(ctx: Context, session: ActiveInventorySession): Promise<void> {
  if (session.currentItemIndex >= session.items.length) {
    await completeInventory(ctx, session);
    return;
  }

  const item = session.items[session.currentItemIndex];
  const previousCount = item.last_count;

  let prompt = `${item.name} -- how many left?`;
  if (previousCount !== null) {
    prompt += ` (last count: ${previousCount})`;
  }

  await ctx.reply(prompt);
}

function parseInventoryResponse(text: string): number | null {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}
```

### Receipt OCR via Claude Vision
```typescript
async function analyzeReceipt(receiptBase64: string): Promise<{ items: { name: string; quantity: number }[] }> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: receiptBase64 } },
        {
          type: 'text',
          text: 'Extract cleaning supply items from this store receipt. Return JSON only: {"items": [{"name": "item name", "quantity": 1}]}. Focus on: toilet paper, trash bags, soap, paper towels, cleaning products, laundry supplies, sponges. Ignore non-cleaning items like food.'
        }
      ]
    }]
  });

  try {
    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { items: [] };
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { items: [] };
  }
}
```

## Database Schema Design

### Migration 003_inventory.sql
```sql
-- Inventory items per property (supply closet items)
CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  par_level INTEGER,              -- owner-set minimum threshold
  last_count INTEGER,             -- most recent count
  last_counted_at TEXT,           -- when last counted
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER DEFAULT 1,    -- soft delete for removed items
  created_at TEXT DEFAULT (datetime('now'))
);

-- Per-check inventory count records
CREATE TABLE IF NOT EXISTS inventory_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  session_id INTEGER REFERENCES cleaning_sessions(id),  -- nullable for manual restocks
  count INTEGER NOT NULL,
  previous_count INTEGER,          -- for calculating delta
  consumption_delta INTEGER,       -- previous - current (positive = consumed)
  counted_by TEXT NOT NULL,        -- 'cleaner' or 'owner'
  notes TEXT,                      -- optional cleaner notes
  created_at TEXT DEFAULT (datetime('now'))
);

-- Photos taken during inventory checks
CREATE TABLE IF NOT EXISTS inventory_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_count_id INTEGER NOT NULL REFERENCES inventory_counts(id),
  file_id TEXT NOT NULL,           -- Telegram file_id
  ai_analysis TEXT,                -- AI assessment of supply level
  created_at TEXT DEFAULT (datetime('now'))
);

-- Completion reports (stored for historical access)
CREATE TABLE IF NOT EXISTS completion_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL UNIQUE REFERENCES cleaning_sessions(id),
  property_id INTEGER NOT NULL REFERENCES properties(id),
  report_data TEXT NOT NULL,       -- JSON blob: full report content for replay
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Properties Table Extension
```sql
-- Add inventory_check_frequency to properties
-- Values: 'every', 'every_N' (where N stored separately), 'manual'
ALTER TABLE properties ADD COLUMN inventory_frequency TEXT DEFAULT 'every';
ALTER TABLE properties ADD COLUMN inventory_frequency_n INTEGER DEFAULT 1;
```

## Design Decisions (Claude's Discretion)

### Alarming Rate Threshold
**Recommendation:** Flag when consumption exceeds 2x the rolling average of the last 5 inventory checks. For first 5 checks (insufficient data), flag when count drops by more than 50% in a single check. Require photo verification when flagged.

### Default Starter Supply List
**Recommendation:** 10 common STR supply closet items:
1. Toilet paper (rolls)
2. Paper towels (rolls)
3. Trash bags (count)
4. Dish soap (bottles)
5. Laundry detergent pods (count)
6. Hand soap refills (bottles)
7. All-purpose cleaner (bottles)
8. Sponges (count)
9. Dryer sheets (count)
10. Coffee pods (count)

Owner can add/remove/rename during setup. Items marked `is_active = 0` when removed.

### Items Without Par Level
**Recommendation:** Still track counts but do not generate low-stock alerts. Show "(no minimum set)" in report. Periodically remind owner: "You haven't set a minimum for [item]. Want to set one?"

### Report Message Splitting Strategy
**Recommendation:**
1. One text message: report header (always under 4096 chars)
2. Per room: one `sendMediaGroup` with 2 photos (staging + milestone), captions limited to room name + verdict
3. Per flagged room: one follow-up text with issues list
4. One text message: checklist summary across all rooms
5. One text message: low-stock alerts (if any)

This keeps each message well within limits and creates a clean visual flow in the chat.

### Receipt OCR Approach
**Recommendation:** Reuse Claude Vision (already integrated). Send receipt photo with a targeted prompt asking for cleaning supply items only. Parse JSON response. Show extracted items to owner for confirmation before adding to inventory. Handle partial/failed extraction gracefully ("I found these items: ... Anything I missed?").

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Brief text summary | Full room-by-room report with photos | This phase | Owners get actionable visual reports |
| No inventory tracking | Sequential count walkthrough | This phase | Data collection for future ordering |
| Manual stock monitoring | Automated low-stock alerts | This phase | Proactive supply management |

## Open Questions

1. **Inventory check during non-cleaning contexts**
   - What we know: Cleaners do inventory after each clean (configurable frequency)
   - What's unclear: Can an owner trigger an inventory check outside of a cleaning session? (e.g., "do inventory for Beach House")
   - Recommendation: Support manual trigger via owner command in the group chat. The `session_id` in `inventory_counts` is already nullable for this case.

2. **Report replay format**
   - What we know: Owner can ask "show last report for [property]"
   - What's unclear: Should replay re-send all photos (expensive, slow) or just the text summary?
   - Recommendation: Store full report as JSON in `completion_reports.report_data`. On replay, re-send photos from stored file_ids (Telegram caches them; no re-upload needed). Add a compact text-only option if the owner just wants a quick summary.

3. **Inventory setup timing**
   - What we know: Owner must customize the default supply list
   - What's unclear: Should inventory setup be part of the initial property setup wizard or a separate flow?
   - Recommendation: Keep it separate from the initial property setup wizard (which is already 7 steps long). Offer "setup inventory" as a standalone command. Auto-prompt on first cleaning completion: "Want to set up inventory tracking for this property?"

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.3.0 + ts-jest 29.4.6 |
| Config file | `jest.config.ts` (exists) |
| Quick run command | `npm test -- --testPathPattern=reporting` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REPT-01 | Report generation produces correct header, photo pairs, checklist summary | unit | `npx jest tests/reporting/report-generation.test.ts -x` | Wave 0 |
| REPT-01 | Report data stored in completion_reports table | unit | `npx jest tests/reporting/report-storage.test.ts -x` | Wave 0 |
| REPT-02 | Inventory walkthrough advances item-by-item, parses numeric input | unit | `npx jest tests/inventory/walkthrough.test.ts -x` | Wave 0 |
| REPT-03 | Inventory photo triggers AI analysis and stores result | unit | `npx jest tests/inventory/photo-analysis.test.ts -x` | Wave 0 |
| REPT-04 | Low-stock detection compares count to par_level correctly | unit | `npx jest tests/inventory/low-stock.test.ts -x` | Wave 0 |
| REPT-05 | Inventory counts stored with consumption delta | unit | `npx jest tests/inventory/data-storage.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- --testPathPattern=reporting\|inventory`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/reporting/report-generation.test.ts` -- covers REPT-01 report building logic
- [ ] `tests/reporting/report-storage.test.ts` -- covers REPT-01 DB storage
- [ ] `tests/inventory/walkthrough.test.ts` -- covers REPT-02 sequential prompts + number parsing
- [ ] `tests/inventory/photo-analysis.test.ts` -- covers REPT-03 AI analysis
- [ ] `tests/inventory/low-stock.test.ts` -- covers REPT-04 threshold detection
- [ ] `tests/inventory/data-storage.test.ts` -- covers REPT-05 consumption tracking

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/handlers/cleaning.ts`, `src/services/vision.ts`, `src/handlers/cleaning-photos.ts`, `src/handlers/cleaning-checklist.ts` -- direct integration points
- Existing schema: `001_initial.sql`, `002_cleaning.sql` -- table structures to extend
- Phase 3 CONTEXT.md -- locked decisions and constraints

### Secondary (MEDIUM confidence)
- [Telegram Bot API limits](https://limits.tginfo.me/en) -- 4096 char text, 1024 char caption, 2-10 items per media group
- [Telegraf sendMediaGroup discussion](https://github.com/telegraf/telegraf/discussions/1661) -- API usage pattern
- [Telegraf Context docs](https://telegraf.js.org/classes/Context.html) -- `sendMediaGroup`, `replyWithPhoto` methods

### Tertiary (LOW confidence)
- Alarming rate threshold (2x rolling average) -- reasonable heuristic but may need tuning with real usage data

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, everything exists
- Architecture: HIGH -- follows established codebase patterns exactly
- Pitfalls: HIGH -- derived from Telegram API constraints and existing code patterns
- Database schema: HIGH -- follows existing migration conventions
- Inventory threshold logic: MEDIUM -- reasonable defaults but may need tuning

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable domain, no fast-moving dependencies)
