# Phase 2: Cleaning Workflow - Research

**Researched:** 2026-03-24
**Domain:** Telegram bot interactive workflows, Claude Vision image comparison, session state management
**Confidence:** HIGH

## Summary

Phase 2 transforms TextBud from a property setup tool into an active cleaning workflow manager. The core technical challenges are: (1) handling interactive inline keyboard buttons in Telegram group chats for room-by-room checklist progression, (2) integrating Claude Vision API for real-time photo comparison between cleaner milestone photos and owner staging photos, (3) managing long-running cleaning session state across check-in, checklist progression, photo submission, and completion, and (4) routing group chat messages through a new group-aware handler alongside the existing DM router.

The existing codebase provides a solid foundation. The `telegram_groups` table maps group chats to properties, `rooms` with `sort_order` provides sequencing, `checklists`/`checklist_items` tables have the per-room data, and `staging_photos` have Telegram `file_id` references. Three new tables are needed: `cleaning_sessions`, `milestone_photos`, and `comparison_results`. The Anthropic SDK (`@anthropic-ai/sdk`) is already available at v0.80.0 but not yet installed in the project.

**Primary recommendation:** Use in-memory Maps for active cleaning session state (consistent with Phase 1 patterns), Telegraf's `bot.action()` with regex-based callback data for inline keyboard interactions, and the Anthropic SDK with base64-encoded images for Claude Vision photo comparison. Add a group text handler in bot.ts that dispatches to the cleaning workflow handler based on group chat context.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Cleaner initiates check-in with natural language in the group chat ("I'm here", "checking in", "arrived", etc.) -- TextBud recognizes intent
- Property is auto-determined from the group (each group is linked to one property from Phase 1)
- Clean type (standard vs deep) is auto-determined from the deep_clean_cycle counter -- no manual selection
- On check-in, TextBud sends an overview message (clean type, property name, special instructions) followed immediately by the first room's checklist
- Clock starts on check-in
- If cleaner checks in while a session is already active, TextBud resumes: "Welcome back! You're still on [Room X]. Here's where you left off."
- Owner is notified via the group chat message (no separate DM)
- Room-by-room delivery using Telegram inline keyboard buttons
- Each room's checklist items appear as tappable buttons (one per item)
- Cleaner taps each button to mark it done
- When all items for a room are checked off, TextBud auto-advances to the next room
- No typing needed during checklist progression -- just taps
- Entry video recorded right after check-in, before checklist begins (liability documentation only)
- Video stored as Telegram file_id reference in database (no local file storage)
- Photo requests are progress-based: TextBud asks for a photo when cleaner finishes each room's checklist
- Claude Vision compares the submitted photo against the best-matching staging photo angle for that room
- If photo doesn't match any room (wrong angle, blurry, wrong room): ask cleaner to resend from a similar angle
- Friendly nudge tone for AI flagging
- On flag, TextBud waits for the cleaner to fix and re-submit a photo before advancing to next room
- Maximum 3 comparison attempts per room -- after 3 photos that still don't pass, TextBud accepts and notes it for the owner's report
- AI comparison results (pass/flag) are visible to the owner in real time in the group chat
- Cleaner says "I'm done" (natural language recognition) to complete
- TextBud checks if photos were submitted for all rooms -- if any missing, prompts or allows skip
- Clock stops after all rooms are covered or skipped
- Brief summary sent to cleaner on completion

### Claude's Discretion
- Exact wording of all bot messages (within the "friendly nudge" tone)
- Timeout handling if cleaner goes silent mid-clean
- How to handle rooms with no staging photos (skip comparison or note it)
- Error handling for Claude Vision API failures
- Progress indicators between rooms

### Deferred Ideas (OUT OF SCOPE)
- **PROP-08 & PROP-09 (Floor plan from video)** -- Owner records a walkthrough video during property setup (not cleaning). AI generates a simple visual diagram of room layout. This is a setup/onboarding feature, not a cleaning workflow feature. Should be its own phase.
- Owner override of clean type (e.g., "make next clean deep" or "skip deep clean") -- could be a future enhancement
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLEAN-01 | Cleaner can check in via text and receive clean type, checklist, and special instructions | Natural language intent recognition in group chat, auto property detection via telegram_groups table, clean type from deep_clean_cycle/clean_count |
| CLEAN-02 | Clock starts on check-in and stops on completion | cleaning_sessions table with checked_in_at and completed_at timestamps |
| CLEAN-03 | Cleaner records entry video walkthrough of property on arrival | Telegraf video/video_note handler, store file_id in cleaning_sessions.entry_video_file_id |
| CLEAN-04 | Checklist is delivered sequentially room-by-room as cleaner progresses | Inline keyboard buttons via Markup.inlineKeyboard(), bot.action() with regex callback data, rooms.sort_order for sequencing |
| CLEAN-05 | TextBud requests milestone photos at timed intervals from specific rooms | Progress-based (per room completion), not timed intervals -- per user decision |
| CLEAN-06 | AI compares milestone photos to staging photos using Claude Vision | Anthropic SDK with base64-encoded dual-image comparison, structured prompt for pass/flag |
| CLEAN-07 | TextBud flags issues to cleaner in real time based on AI comparison | Comparison result parsing, retry flow (max 3 attempts), friendly nudge messaging |
| CLEAN-08 | Cleaner marks completion, submits any remaining photos | Natural language completion detection, missing photo check, clock stop, summary message |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| telegraf | 4.16.3 | Telegram bot framework | Already in project, provides inline keyboards, callback queries, file handling |
| @anthropic-ai/sdk | 0.80.0 | Claude Vision API for photo comparison | Project decision: Claude for AI, official SDK for TypeScript |
| better-sqlite3 | 12.8.0 | Database for cleaning sessions, photos, comparison results | Already in project, consistent with Phase 1 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | -- | -- | All required functionality is covered by existing dependencies + Anthropic SDK |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @anthropic-ai/sdk | Direct HTTP to Anthropic API | SDK handles auth, types, retries -- no reason to go raw |
| In-memory Map for sessions | DB-only sessions | Map is faster for active lookups, DB for persistence. Use both: Map for hot state, DB for durability |

**Installation:**
```bash
npm install @anthropic-ai/sdk
```

**Version verification:** telegraf 4.16.3 (already installed), @anthropic-ai/sdk 0.80.0 (latest), better-sqlite3 12.8.0 (already installed).

## Architecture Patterns

### Recommended Project Structure
```
src/
  handlers/
    cleaning.ts          # registerCleaningHandlers(bot) - main cleaning workflow
    cleaning-checklist.ts # Inline keyboard generation and callback handling
    cleaning-photos.ts   # Photo submission and Claude Vision comparison
  services/
    vision.ts            # Claude Vision comparison logic (isolated from Telegram)
  db/
    migrations/
      002_cleaning.sql   # New tables: cleaning_sessions, milestone_photos, comparison_results
  types/
    index.ts             # Add CleaningSession, MilestonePhoto, ComparisonResult types
```

### Pattern 1: Group Chat Message Routing
**What:** Add a group chat text handler in bot.ts that dispatches to cleaning workflow handlers, separate from the existing DM router.
**When to use:** All group chat text messages (check-in, completion, general chat).
**Example:**
```typescript
// In bot.ts - group chat routing (runs before the DM router's return next())
// The existing DM router already does: if (ctx.chat.type !== 'private') return next();
// So group messages fall through. Add a separate handler:
bot.on('text', async (ctx, next) => {
  if (ctx.chat.type === 'private') return next(); // DM handler above handles these
  // Group chat message - check if this group is linked to a property
  const group = getGroupByChatId(ctx.chat.id);
  if (!group) return; // Not a linked group, ignore

  await handleGroupMessage(ctx, group);
});
```

### Pattern 2: Inline Keyboard Checklist with Callback Data
**What:** Render checklist items as inline keyboard buttons with structured callback data, handle taps via bot.action() with regex.
**When to use:** Room-by-room checklist delivery and progression.
**Example:**
```typescript
// Source: Telegraf docs + Telegram Bot API
import { Markup } from 'telegraf';

// Generate checklist for a room
function buildChecklistKeyboard(sessionId: number, roomId: number, items: ChecklistItem[], completedIds: Set<number>) {
  const buttons = items.map(item => {
    const label = completedIds.has(item.id) ? `[done] ${item.description}` : item.description;
    return [Markup.button.callback(label, `check_${sessionId}_${item.id}`)];
  });
  return Markup.inlineKeyboard(buttons);
}

// Handle checklist item tap
bot.action(/^check_(\d+)_(\d+)$/, async (ctx) => {
  const sessionId = parseInt(ctx.match[1], 10);
  const itemId = parseInt(ctx.match[2], 10);
  await markItemComplete(sessionId, itemId);
  await ctx.answerCbQuery('Done!');
  // Update the keyboard to show completion state
  // If all items done, auto-advance to next room
});
```

### Pattern 3: Claude Vision Photo Comparison
**What:** Download Telegram photo via getFileLink, convert to base64, send both staging and milestone photos to Claude Vision for comparison.
**When to use:** After cleaner submits a milestone photo for a room.
**Example:**
```typescript
// Source: Anthropic Vision docs (platform.claude.com)
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

async function comparePhotos(
  stagingBase64: string,
  milestoneBase64: string,
  roomName: string
): Promise<{ pass: boolean; issues: string[] }> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Reference photo (how this room should look after cleaning):' },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: stagingBase64 } },
        { type: 'text', text: `Current photo of ${roomName} submitted by cleaner:` },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: milestoneBase64 } },
        { type: 'text', text: `Compare the current photo to the reference staging photo for ${roomName}. Focus on cleanliness, organization, and whether the room matches the expected standard. Respond with JSON: {"pass": true/false, "issues": ["issue1", "issue2"]}. Be reasonably lenient -- minor differences in angle or lighting are fine. Flag only genuine cleanliness or organization issues.` }
      ]
    }]
  });
  // Parse response
}
```

### Pattern 4: Cleaning Session State (Hybrid In-Memory + DB)
**What:** Use in-memory Map for fast active session lookups (which room, which items checked), persist to DB for durability.
**When to use:** Tracking cleaning session progress across check-in to completion.
**Example:**
```typescript
interface ActiveCleaningSession {
  sessionId: number;        // DB row ID
  propertyId: number;
  cleanerId: number;
  chatId: number;
  cleanType: 'standard' | 'deep';
  currentRoomIndex: number; // index into sorted rooms array
  checkedItems: Set<number>; // checklist_item IDs marked done
  photoAttempts: Map<number, number>; // roomId -> attempt count
  messageId?: number;       // ID of the current checklist message (for editing)
}

// Keyed by chat_id (one active session per group)
const activeSessions = new Map<number, ActiveCleaningSession>();
```

### Pattern 5: Downloading Telegram Photos for Claude Vision
**What:** Use ctx.telegram.getFileLink() to get the download URL, fetch with native fetch/axios, convert to base64.
**When to use:** When cleaner sends a photo that needs AI comparison.
**Example:**
```typescript
async function downloadTelegramPhoto(ctx: Context, fileId: string): Promise<string> {
  const fileLink = await ctx.telegram.getFileLink(fileId);
  const response = await fetch(fileLink.href);
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString('base64');
}
```

### Anti-Patterns to Avoid
- **Polling for session state from DB on every message:** Use in-memory Map for active sessions; only hit DB on session start/resume/end.
- **Registering separate bot.on('text') per feature in group chats:** Centralize group routing in one handler, just like the DM router pattern from Phase 1.
- **Sending full checklist as one giant message:** Deliver room-by-room with inline buttons. Each room gets its own message with tappable items.
- **Storing downloaded photos locally:** Use Telegram file_id references and download on-demand for Claude Vision comparison. Avoids storage management.
- **Using timed intervals for photo requests:** User decided progress-based (after each room completion), not time-based.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image comparison AI | Custom CV pipeline | Claude Vision API via @anthropic-ai/sdk | Vision API handles the comparison; just need good prompts |
| Inline keyboard state | Manual message tracking | Telegraf's editMessageReplyMarkup / editMessageText | Built-in support for updating inline keyboards after button taps |
| File downloads from Telegram | Manual HTTP to Telegram file API | ctx.telegram.getFileLink() | Telegraf handles auth and URL construction |
| Session persistence | Custom file-based state | SQLite table + in-memory Map | Consistent with Phase 1 pattern, handles bot restarts |

**Key insight:** The heavy lifting in this phase is orchestration (state machine for the cleaning flow) and prompt engineering (Claude Vision comparison prompts), not building new infrastructure. Telegraf and the Anthropic SDK handle the hard parts.

## Common Pitfalls

### Pitfall 1: Callback Query Timeout
**What goes wrong:** Telegram expects `answerCbQuery()` within 30 seconds of a button press. If Claude Vision comparison takes too long, the callback times out.
**Why it happens:** Claude Vision API calls can take 2-5 seconds; if combined with photo download, total can exceed expectations.
**How to avoid:** Answer the callback query immediately with a brief acknowledgment ("Got it!"), then perform async work (photo comparison) separately. Never block callback handling on API calls.
**Warning signs:** Users see "loading" spinner on button that never resolves.

### Pitfall 2: Editing Messages in Group Chats
**What goes wrong:** `editMessageText` and `editMessageReplyMarkup` require the message_id. If not stored, you cannot update the checklist keyboard.
**Why it happens:** Telegraf's ctx in a callback_query has the message reference, but if you want to edit from a different context (e.g., after photo comparison), you need the stored message_id.
**How to avoid:** Store the checklist message_id in the active session state when sending it. Use `ctx.telegram.editMessageReplyMarkup(chatId, messageId, ...)` for out-of-context edits.
**Warning signs:** "Message to edit not found" errors.

### Pitfall 3: Multiple Users Tapping Buttons Simultaneously
**What goes wrong:** In a three-way group, the owner could also tap checklist buttons meant for the cleaner.
**Why it happens:** Inline keyboards are visible and tappable by all group members.
**How to avoid:** Check `ctx.from.id` in the callback handler and verify it matches the session's cleaner. Answer with "Only the cleaner can mark items" for others.
**Warning signs:** Owner accidentally checking off items; inconsistent checklist state.

### Pitfall 4: Bot Restart Loses Active Sessions
**What goes wrong:** In-memory Map is lost on restart; cleaning sessions in progress become orphaned.
**Why it happens:** Map state is ephemeral.
**How to avoid:** Persist session state to DB on every significant state change (item checked, room advanced, photo submitted). On startup, reload any incomplete sessions from DB into the Map. Check for `completed_at IS NULL` sessions.
**Warning signs:** Cleaner checks in, bot restarts, cleaner is stuck.

### Pitfall 5: Photo File Size Limits for Claude Vision
**What goes wrong:** Telegram photos can be large; Claude Vision has a 5MB per image limit for API requests.
**Why it happens:** High-resolution phone cameras produce large files.
**How to avoid:** Use the last element of Telegram's `photo` array (highest resolution) but check size. Telegram already compresses photos significantly (usually under 1MB). For the staging photo, use the stored file_id and download fresh. Claude recommends images under 1568px on long edge for optimal performance.
**Warning signs:** API errors about payload size.

### Pitfall 6: Callback Data Length Limit
**What goes wrong:** Telegram limits callback_data to 64 bytes. Encoding too much info (session ID + room ID + item ID) could exceed this.
**Why it happens:** Trying to be too descriptive in callback data.
**How to avoid:** Use compact format like `c_${sessionId}_${itemId}` -- session IDs and item IDs are small integers. Keep prefix short.
**Warning signs:** Telegram API errors about callback_data length.

## Code Examples

### Database Migration for Cleaning Tables
```sql
-- 002_cleaning.sql
CREATE TABLE IF NOT EXISTS cleaning_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  cleaner_id INTEGER NOT NULL REFERENCES cleaners(id),
  chat_id INTEGER NOT NULL,
  clean_type TEXT NOT NULL CHECK(clean_type IN ('standard', 'deep')),
  current_room_id INTEGER REFERENCES rooms(id),
  entry_video_file_id TEXT,
  checked_in_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  summary TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS milestone_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES cleaning_sessions(id),
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  file_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comparison_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  milestone_photo_id INTEGER NOT NULL REFERENCES milestone_photos(id),
  staging_photo_id INTEGER NOT NULL REFERENCES staging_photos(id),
  passed INTEGER NOT NULL DEFAULT 0,
  issues TEXT, -- JSON array of issue strings
  raw_response TEXT, -- Full Claude response for debugging
  created_at TEXT DEFAULT (datetime('now'))
);

-- Track which checklist items were completed per session
CREATE TABLE IF NOT EXISTS session_checklist_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES cleaning_sessions(id),
  checklist_item_id INTEGER NOT NULL REFERENCES checklist_items(id),
  completed_at TEXT DEFAULT (datetime('now')),
  UNIQUE(session_id, checklist_item_id)
);
```

### Check-in Intent Recognition
```typescript
// Simple keyword-based intent matching (consistent with Phase 1 pattern)
const CHECK_IN_PATTERNS = [
  /\b(i'?m here|checking in|arrived|here to clean|starting|i'?m at)\b/i,
];

const COMPLETION_PATTERNS = [
  /\b(i'?m done|all done|finished|complete|done cleaning)\b/i,
];

function isCheckInIntent(text: string): boolean {
  return CHECK_IN_PATTERNS.some(p => p.test(text));
}

function isCompletionIntent(text: string): boolean {
  return COMPLETION_PATTERNS.some(p => p.test(text));
}
```

### Determining Clean Type
```typescript
function determineCleanType(property: Property): 'standard' | 'deep' {
  // clean_count tracks cleans since last deep clean
  // deep_clean_cycle is the N in "every Nth clean"
  if (property.clean_count + 1 >= property.deep_clean_cycle) {
    return 'deep';
  }
  return 'standard';
}
```

### Entry Video Handler
```typescript
// Handle video or video_note messages in group during entry video phase
bot.on(['video', 'video_note'], async (ctx) => {
  if (ctx.chat.type === 'private') return;
  const session = getActiveSessionByChatId(ctx.chat.id);
  if (!session || session.entryVideoReceived) return;

  const fileId = ctx.message.video?.file_id || ctx.message.video_note?.file_id;
  if (!fileId) return;

  // Store in DB
  db.prepare('UPDATE cleaning_sessions SET entry_video_file_id = ? WHERE id = ?')
    .run(fileId, session.sessionId);

  session.entryVideoReceived = true;
  await ctx.reply("Got it! Entry video recorded. Now let's get started with the checklist.");
  // Send first room's checklist
  await sendRoomChecklist(ctx, session, 0);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Time-based milestone photos | Progress-based (after each room) | User decision | Simpler, tied to actual workflow progress |
| Custom image diff algorithms | Claude Vision API comparison | 2024+ | No CV expertise needed; natural language output |
| Reply keyboards (custom keyboard) | Inline keyboards (callback buttons) | Telegram Bot API 6.0+ | Buttons attach to messages, cleaner UX |
| Separate bot DM to cleaner | Three-way group chat | User decision | Owner sees everything in real-time |

**Deprecated/outdated:**
- Telegram Bot API `sendChatAction('typing')` is still useful for indicating processing during photo comparison

## Open Questions

1. **Which Claude model for photo comparison?**
   - What we know: Claude Sonnet is cheaper and faster; Opus is more capable. Photo comparison is fairly straightforward visual analysis.
   - Recommendation: Use `claude-sonnet-4-20250514` for cost efficiency. Comparison prompts are well-structured enough that Sonnet handles them well.

2. **How to handle rooms with no staging photos?**
   - What we know: User left this to Claude's discretion. Some rooms may not have staging photos from Phase 1 setup.
   - Recommendation: Skip AI comparison for rooms without staging photos. Send a message like "No reference photo for [Room] -- skipping comparison. Moving to next room." Still request a milestone photo for the record.

3. **Timeout handling for idle cleaners?**
   - What we know: User left this to Claude's discretion. Cleaner might go silent mid-clean.
   - Recommendation: Implement a simple timeout check (e.g., 2 hours since last interaction). Send a nudge: "Still cleaning? Send a message or tap a button when you're ready." Don't auto-complete -- just nudge. Can be implemented as a periodic check or on next bot startup.

4. **Claude Vision API failure handling?**
   - What we know: API calls can fail (rate limits, network issues, service outages).
   - Recommendation: Retry once after 3-second delay. If still fails, skip comparison with message: "Couldn't compare this photo right now -- I've saved it for the report. Moving on." Log the failure for debugging.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None currently configured |
| Config file | none -- see Wave 0 |
| Quick run command | `npx tsx scripts/test-cleaning.ts` (to be created) |
| Full suite command | `npx tsx scripts/test-cleaning.ts` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLEAN-01 | Check-in intent recognition + property lookup + clean type determination | unit | `npx tsx scripts/test-cleaning.ts` | No -- Wave 0 |
| CLEAN-02 | Session timestamps (checked_in_at, completed_at) | unit | `npx tsx scripts/test-cleaning.ts` | No -- Wave 0 |
| CLEAN-03 | Entry video file_id storage | smoke | Manual -- send video in Telegram group | No |
| CLEAN-04 | Sequential checklist delivery with inline buttons | smoke | Manual -- tap buttons in Telegram group | No |
| CLEAN-05 | Photo request after room completion | smoke | Manual -- complete a room checklist | No |
| CLEAN-06 | Claude Vision photo comparison | unit | `npx tsx scripts/test-vision.ts` | No -- Wave 0 |
| CLEAN-07 | Flagging and retry flow (max 3 attempts) | unit | `npx tsx scripts/test-cleaning.ts` | No -- Wave 0 |
| CLEAN-08 | Completion flow with missing photo check | unit | `npx tsx scripts/test-cleaning.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx tsx scripts/test-cleaning.ts`
- **Per wave merge:** Full smoke test via Telegram group interaction
- **Phase gate:** All unit tests green + manual walkthrough of full cleaning flow

### Wave 0 Gaps
- [ ] `scripts/test-cleaning.ts` -- unit tests for intent recognition, clean type logic, session state transitions
- [ ] `scripts/test-vision.ts` -- integration test for Claude Vision comparison (requires API key)
- [ ] No test framework configured -- using tsx scripts for now (consistent with existing `test:db` script pattern)

## Sources

### Primary (HIGH confidence)
- [Anthropic Vision docs](https://platform.claude.com/docs/en/build-with-claude/vision) - Multi-image comparison API, base64 encoding, image size limits, TypeScript SDK examples
- [Telegraf v4.16.3 docs](https://telegraf.js.org/) - Inline keyboard API, callback queries
- Existing codebase (`src/bot.ts`, `src/handlers/groups.ts`, `src/types/index.ts`, `src/db/migrations/001_initial.sql`) - Established patterns, schema, integration points

### Secondary (MEDIUM confidence)
- [Telegraf GitHub Issues/Discussions](https://github.com/telegraf/telegraf) - Inline keyboard patterns, editMessageReplyMarkup usage, callback data handling
- [Telegram Bot API](https://core.telegram.org/bots/api) - VideoNote object structure, file download API, callback_data 64-byte limit

### Tertiary (LOW confidence)
- None -- all findings verified against primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are either already in the project or are the official Anthropic SDK
- Architecture: HIGH - Patterns directly extend Phase 1 conventions (handler modules, in-memory Maps, central routing)
- Pitfalls: HIGH - Verified against Telegram Bot API docs (callback_data limits, answerCbQuery timeout) and Anthropic docs (image size limits)

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable stack, no fast-moving dependencies)
