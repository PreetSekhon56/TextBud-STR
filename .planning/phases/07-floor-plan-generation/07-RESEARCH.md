# Phase 7: Floor Plan Generation - Research

**Researched:** 2026-03-25
**Domain:** Video frame extraction, Claude Vision multi-image analysis, SVG generation
**Confidence:** MEDIUM

## Summary

This phase generates a rough room-connectivity floor plan from the entry walkthrough video that cleaners already submit during Phase 2 check-in. The approach is: (1) download the video from Telegram, (2) extract keyframes using FFmpeg, (3) send frames to Claude Vision to identify rooms and their sequence/connectivity, (4) have Claude generate an SVG floor plan, (5) store the SVG and serve it on request.

The biggest technical risk is the Telegram Bot API 20MB download limit for files. Walkthrough videos of a multi-room property can easily exceed this. The mitigation is to accept shorter/compressed videos or run a local Bot API server. The second risk is output quality -- Claude Vision can identify rooms from video frames and generate SVG, but the resulting "floor plan" will be a schematic room-connectivity diagram (boxes with labels and connections), not a spatially accurate architectural drawing. This aligns with the out-of-scope note that architectural-grade plans are not feasible.

**Primary recommendation:** Use FFmpeg via child_process.execFile to extract 1 frame per ~2 seconds from the walkthrough video, send a batch of frames (up to 20) to Claude Vision with room names from the DB, and ask it to return structured JSON describing room connectivity. Then make a second Claude call (text-only) to generate an SVG floor plan from that connectivity data. Store the SVG string in the database.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROP-08 | AI generates rough floor plan/room layout from cleaner's entry walkthrough video using Claude Vision | FFmpeg frame extraction + Claude Vision multi-image analysis + SVG generation pipeline. Entry video already captured in cleaning_sessions.entry_video_file_id |
| PROP-09 | Floor plan available to cleaners and guests as a navigational reference | Store SVG in DB on properties table, serve via text command in both cleaning and guest groups |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/sdk | 0.80.0 | Claude Vision API for frame analysis + SVG generation | Already in project, proven pattern in vision.ts |
| FFmpeg (system) | 8.0.1 | Extract frames from walkthrough video | Already installed, listed in spec tech stack |
| child_process (Node built-in) | N/A | Invoke FFmpeg from Node.js | Standard Node.js approach, no wrapper library needed |
| better-sqlite3 | 12.8.0 | Store floor plan SVG data | Already in project |
| telegraf | 4.16.3 | Telegram bot framework, file download, message sending | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fs/promises (Node built-in) | N/A | Read/write temp video and frame files | During video processing pipeline |
| path (Node built-in) | N/A | Temp directory path management | Frame extraction output paths |
| os (Node built-in) | N/A | os.tmpdir() for temp file storage | Video/frame temp storage |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw child_process | fluent-ffmpeg npm package | Adds dependency for simple frame extraction; child_process is sufficient for one command |
| SVG string in DB | Rendered PNG via sharp/canvas | SVG is resolution-independent, smaller, and can be sent as a document; no extra dependency |
| Two-pass Claude (analyze frames, then generate SVG) | Single-pass (frames + SVG in one call) | Two-pass is more reliable: structured JSON intermediate prevents SVG hallucination |

**Installation:**
```bash
# No new npm packages needed -- all dependencies are already in the project
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  services/
    floor-plan.ts          # Frame extraction + Claude Vision analysis + SVG generation
  handlers/
    floor-plan.ts          # Telegram command handlers (request floor plan, trigger generation)
  db/
    migrations/
      006_floor_plans.sql  # Add floor_plan_svg column to properties table
```

### Pattern 1: Video Processing Pipeline
**What:** Sequential pipeline: download video -> extract frames -> analyze with Vision -> generate SVG -> store
**When to use:** After a cleaning session's entry video is submitted (or on-demand regeneration)
**Example:**
```typescript
// Source: Project patterns from cleaning.ts + vision.ts
export async function generateFloorPlan(
  bot: Telegraf,
  propertyId: number,
  videoFileId: string,
  roomNames: string[]
): Promise<string> {
  // 1. Download video from Telegram
  const fileLink = await bot.telegram.getFileLink(videoFileId);
  const videoPath = await downloadToTemp(fileLink.href);

  // 2. Extract frames with FFmpeg
  const framePaths = await extractFrames(videoPath, { intervalSec: 2, maxFrames: 20 });

  // 3. Analyze frames with Claude Vision -> room connectivity JSON
  const connectivity = await analyzeWalkthroughFrames(framePaths, roomNames);

  // 4. Generate SVG from connectivity data
  const svg = await generateFloorPlanSvg(connectivity, roomNames);

  // 5. Cleanup temp files
  await cleanupTempFiles(videoPath, framePaths);

  return svg;
}
```

### Pattern 2: FFmpeg Frame Extraction via execFile
**What:** Use child_process.execFile (not exec) for safe FFmpeg invocation
**When to use:** Extracting frames at fixed intervals from video
**Example:**
```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

async function extractFrames(videoPath: string, opts: { intervalSec: number; maxFrames: number }): Promise<string[]> {
  const outputDir = path.join(os.tmpdir(), `textbud-frames-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  const outputPattern = path.join(outputDir, 'frame_%03d.jpg');

  // Extract 1 frame every N seconds, limit quality for size
  await execFileAsync('ffmpeg', [
    '-i', videoPath,
    '-vf', `fps=1/${opts.intervalSec},scale=800:-1`,
    '-frames:v', String(opts.maxFrames),
    '-q:v', '5',
    outputPattern,
  ]);

  // Read extracted frame paths
  const files = await fs.readdir(outputDir);
  return files
    .filter(f => f.endsWith('.jpg'))
    .sort()
    .map(f => path.join(outputDir, f));
}
```

### Pattern 3: Two-Pass Claude Analysis
**What:** First call extracts room connectivity from frames; second call generates SVG from structured data
**When to use:** Always -- separating analysis from generation improves reliability
**Example:**
```typescript
// Pass 1: Analyze frames -> structured JSON
const analysisPrompt = `You are analyzing frames from a walkthrough video of a rental property.
The property has these rooms: ${roomNames.join(', ')}.

For each frame, identify which room is shown. Then determine the order rooms were visited
and which rooms connect to each other (share doorways/openings).

Return JSON only:
{
  "rooms": [
    { "name": "Kitchen", "connectedTo": ["Living Room", "Hallway"] }
  ],
  "walkOrder": ["Entryway", "Living Room", "Kitchen", "Hallway", "Bedroom 1", ...]
}`;

// Pass 2: Generate SVG from connectivity
const svgPrompt = `Generate a simple SVG floor plan diagram from this room connectivity data.
Each room should be a labeled rectangle. Connected rooms should be adjacent with a doorway indicator.
Use a clean, minimal style. Size: 600x400. Rooms: ${JSON.stringify(connectivity)}
Return only the SVG code, no explanation.`;
```

### Pattern 4: Trigger on Entry Video (Async, Non-Blocking)
**What:** When the entry video handler saves the file_id, queue floor plan generation asynchronously
**When to use:** After entry video is received in cleaning.ts handler
**Example:**
```typescript
// In cleaning.ts video handler, after saving entry_video_file_id:
// Fire-and-forget: don't block the cleaning flow
generateFloorPlanIfNeeded(bot, session.propertyId, fileId, session.rooms)
  .catch(err => console.error('[FLOOR-PLAN] Generation failed:', err));
```

### Anti-Patterns to Avoid
- **Blocking the cleaning flow:** Floor plan generation takes 30-60 seconds. Never make the cleaner wait for it.
- **Regenerating every clean:** Only generate if property has no floor plan yet, or if explicitly requested. Most properties need this done once.
- **Sending SVG as text:** SVG markup is unreadable in chat. Send as a document file or render a description.
- **Single massive Claude call:** Sending 20 images + asking for SVG in one call is unreliable. Use two passes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Frame extraction from video | Custom video parser | FFmpeg via child_process.execFile | FFmpeg handles all codecs, formats, edge cases |
| SVG rendering to image | Canvas-based renderer | Send SVG as .svg document via Telegram | SVG is natively viewable; avoid sharp/canvas dependency |
| Temp file cleanup | Manual tracking | try/finally with recursive rm | Leaked temp files fill disk |
| Video download | Custom HTTP client | fetch() (already used in downloadTelegramPhoto) | Consistent with existing patterns |

**Key insight:** The complexity here is in the AI prompt engineering, not in the code infrastructure. FFmpeg and Claude Vision do the heavy lifting. Keep the code thin.

## Common Pitfalls

### Pitfall 1: Telegram 20MB Video Download Limit
**What goes wrong:** Walkthrough videos of multi-room properties easily exceed 20MB. bot.telegram.getFileLink() will fail with "file is too big" error.
**Why it happens:** Telegram Bot API standard servers limit file downloads to 20MB.
**How to avoid:** Three approaches (in order of simplicity):
1. **Instruct cleaners to send compressed/short videos** -- Telegram compresses videos by default when sent as "video" (not "document"). A 1-2 minute compressed video is typically under 20MB.
2. **Use video_note (round video)** -- These are limited to 1 minute and heavily compressed, always under 20MB. Already handled in the video handler.
3. **Run a local Bot API server** -- Removes the 20MB limit (up to 2GB). Only needed if approach 1 fails in practice.
**Warning signs:** "Bad Request: file is too big" error from Telegram API.

### Pitfall 2: Claude Vision Image Limit and Token Cost
**What goes wrong:** Sending too many frames wastes tokens and may hit rate limits. Each image costs significant tokens.
**Why it happens:** A 2-minute video at 1fps = 120 frames. Sending all of them is wasteful.
**How to avoid:** Extract at most 15-20 frames (1 frame every 2-3 seconds for a short video). Use lower resolution (800px wide). Claude Vision supports up to 100 images per API call but 20 is the practical sweet spot.
**Warning signs:** Slow response times, high API costs, rate limit errors.

### Pitfall 3: Room Identification Accuracy
**What goes wrong:** Claude may not correctly identify which room is in each frame, especially for similar-looking rooms or transitional hallway frames.
**Why it happens:** Video frames from a walkthrough are often blurry, poorly lit, or show transitions between rooms.
**How to avoid:** Provide the known room names from the database as context. Accept that the floor plan is approximate. Use the walk-order (sequential room transitions) as the primary signal rather than trying to identify every frame.
**Warning signs:** Generated floor plan has rooms the property doesn't have, or is missing rooms.

### Pitfall 4: SVG Generation Quality
**What goes wrong:** Claude sometimes generates malformed SVG or overly complex diagrams.
**Why it happens:** SVG generation from prose descriptions can be inconsistent.
**How to avoid:** Use a constrained prompt: fixed canvas size, simple rectangles with labels, minimal styling. Validate the SVG output (check it starts with `<svg` and ends with `</svg>`). Have a fallback that generates a simple text-based room list if SVG generation fails.
**Warning signs:** SVG doesn't parse, rooms overlap, text is unreadable.

### Pitfall 5: Async Generation Failure Goes Unnoticed
**What goes wrong:** Fire-and-forget generation fails silently; nobody knows the floor plan wasn't created.
**Why it happens:** Error is caught and logged but no notification is sent.
**How to avoid:** Log errors clearly. When a user requests the floor plan and none exists, offer to regenerate. Don't promise the floor plan will be ready immediately.
**Warning signs:** Properties with entry videos but no floor plans in the database.

## Code Examples

### Downloading Video from Telegram
```typescript
// Source: Existing pattern from vision.ts downloadTelegramPhoto
async function downloadVideoToTemp(bot: Telegraf, fileId: string): Promise<string> {
  const fileLink = await bot.telegram.getFileLink(fileId);
  const response = await fetch(fileLink.href);
  const buffer = Buffer.from(await response.arrayBuffer());

  const tmpPath = path.join(os.tmpdir(), `textbud-video-${Date.now()}.mp4`);
  await fs.writeFile(tmpPath, buffer);
  return tmpPath;
}
```

### Reading Frames as Base64 for Claude
```typescript
// Source: Existing pattern from vision.ts
async function framesToBase64(framePaths: string[]): Promise<string[]> {
  return Promise.all(
    framePaths.map(async (p) => {
      const buf = await fs.readFile(p);
      return buf.toString('base64');
    })
  );
}
```

### Sending Floor Plan via Telegram
```typescript
// Send SVG as a document so it's viewable
async function sendFloorPlan(ctx: Context, svg: string, propertyName: string): Promise<void> {
  const buffer = Buffer.from(svg, 'utf-8');
  await ctx.replyWithDocument(
    { source: buffer, filename: `${propertyName}-floor-plan.svg` },
    { caption: `Floor plan for ${propertyName}` }
  );
}
```

### Text-Based Fallback
```typescript
// If SVG generation fails, provide a text description
function formatRoomConnectivity(connectivity: RoomConnectivity): string {
  return connectivity.rooms
    .map(r => `${r.name} -> ${r.connectedTo.join(', ')}`)
    .join('\n');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Matterport/LiDAR scanning | AI vision from video frames | 2024-2025 | Enables rough floor plans without specialized hardware |
| GPT-4V single-image analysis | Claude Vision multi-image batch (up to 100) | 2024 | Can analyze walkthrough sequences in a single API call |
| Raster image generation | SVG code generation | 2024-2025 | Claude excels at SVG; resolution-independent, editable |

**Deprecated/outdated:**
- Using external floor plan APIs (PlanRadar, Magicplan) -- overkill for a rough connectivity diagram
- Client-side canvas rendering -- unnecessary complexity when SVG works

## Open Questions

1. **Video compression and length guidelines**
   - What we know: Telegram compresses videos sent as "video" type, keeping most under 20MB for 1-2 min clips
   - What's unclear: What's the typical walkthrough video length/size for a 3-bedroom STR property?
   - Recommendation: Start with the 20MB limit assumption. If it fails in practice, add guidance to cleaners or run local Bot API server.

2. **Floor plan regeneration policy**
   - What we know: Only need to generate once per property (layout doesn't change)
   - What's unclear: Should owner be able to trigger regeneration? What if the first attempt is poor?
   - Recommendation: Generate on first entry video that has no floor plan. Add a "regenerate floor plan" command for owners.

3. **SVG rendering in Telegram**
   - What we know: Telegram can send/receive documents including SVG files
   - What's unclear: How well Telegram clients render SVG inline vs requiring download
   - Recommendation: Send as document. Also provide a text summary ("Your property has: Kitchen -> Living Room -> Hallway -> Bedroom 1, Bedroom 2") as immediate response, with SVG as attachment.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.3.0 + ts-jest 29.4.6 |
| Config file | jest.config.ts (exists) |
| Quick run command | `npx jest --testPathPattern=floor-plan -x` |
| Full suite command | `npx jest` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROP-08 | extractFrames produces frame files from video | unit (mock execFile) | `npx jest tests/floor-plan/extraction.test.ts -x` | Wave 0 |
| PROP-08 | analyzeWalkthroughFrames returns room connectivity JSON | unit (mock Anthropic) | `npx jest tests/floor-plan/analysis.test.ts -x` | Wave 0 |
| PROP-08 | generateFloorPlanSvg produces valid SVG | unit (mock Anthropic) | `npx jest tests/floor-plan/svg-gen.test.ts -x` | Wave 0 |
| PROP-08 | Full pipeline: video file_id -> SVG stored in DB | integration (mock external) | `npx jest tests/floor-plan/pipeline.test.ts -x` | Wave 0 |
| PROP-09 | "floor plan" command in group returns SVG doc | unit (mock ctx) | `npx jest tests/floor-plan/handler.test.ts -x` | Wave 0 |
| PROP-09 | Guest can request floor plan | unit (mock ctx) | `npx jest tests/floor-plan/handler.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest --testPathPattern=floor-plan -x`
- **Per wave merge:** `npx jest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/floor-plan/extraction.test.ts` -- covers FFmpeg frame extraction (mock execFile)
- [ ] `tests/floor-plan/analysis.test.ts` -- covers Claude Vision analysis (mock Anthropic SDK)
- [ ] `tests/floor-plan/svg-gen.test.ts` -- covers SVG generation (mock Anthropic SDK)
- [ ] `tests/floor-plan/pipeline.test.ts` -- covers end-to-end pipeline
- [ ] `tests/floor-plan/handler.test.ts` -- covers Telegram command handlers

## Sources

### Primary (HIGH confidence)
- Project codebase: src/services/vision.ts, src/handlers/cleaning.ts -- existing patterns for Claude Vision and video handling
- Project codebase: src/db/migrations/002_cleaning.sql -- entry_video_file_id column exists
- FFmpeg 8.0.1 installed locally -- verified frame extraction capabilities

### Secondary (MEDIUM confidence)
- [Telegram Bot API docs](https://core.telegram.org/bots/api) -- 20MB download limit confirmed
- [Claude Vision docs](https://platform.claude.com/docs/en/build-with-claude/vision) -- up to 100 images per API call, JPEG/PNG support
- [Telegram local Bot API server](https://github.com/tdlib/telegram-bot-api) -- 2GB limit workaround

### Tertiary (LOW confidence)
- Claude SVG generation quality for floor plans -- based on general reports of Claude SVG capability, not tested with this specific use case
- Walkthrough video typical file sizes -- no hard data, estimated from general video compression knowledge

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new dependencies
- Architecture: MEDIUM -- pipeline pattern is solid, but Claude Vision accuracy for room identification from walkthrough video is unproven for this specific use case
- Pitfalls: HIGH -- Telegram file size limit is well-documented, async generation pattern is established
- SVG generation quality: LOW -- untested with room connectivity data specifically

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable domain, no fast-moving dependencies)
