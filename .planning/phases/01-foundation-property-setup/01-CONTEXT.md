# Phase 1: Foundation & Property Setup - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Telegram bot foundation with three-way group structure and guided property configuration. Owners can fully configure properties (rooms, staging photos, FAQ/guidebook, checklists, deep clean cycles) and manage multiple properties — entirely through text in DM with the bot. Groups are for operations (cleaning sessions, guest support), not setup or editing.

Requirements: PROP-01, PROP-02, PROP-03, PROP-04, PROP-05, PROP-06, PROP-07, COMM-01, COMM-02, COMM-03, COMM-04

</domain>

<decisions>
## Implementation Decisions

### Setup Conversation Flow
- Step-by-step wizard: rooms -> staging photos -> FAQ -> checklists -> deep clean cycle
- Setup happens in DM with bot (not in group chats)
- If owner leaves mid-setup, resume where they left off when they return ("Welcome back! You finished rooms and photos. Ready to set up your FAQ?")
- Room input: one message, comma-separated list
- One property at a time; owner can start another setup whenever they want
- Full summary shown at end of setup with option to change anything
- Confirm each entry as it's received (echo back for verification)

### Checklist Creation
- Per-room checklists (each room has its own standard + deep clean items)
- Very flexible input: owner can type free-form, send a photo of an existing checklist, upload a document, or stream of consciousness
- TextBud also recommends items based on cleaning best practices for each room type
- Two checklist types per room: standard clean and deep clean

### FAQ/Guidebook Setup
- Cover essentials first during guided setup: WiFi, parking, trash, house rules, emergency contacts
- Owner can add more entries anytime after initial setup
- Each entry confirmed as received

### Deep Clean Cycle
- Simple N-count: owner specifies "every Nth clean" and TextBud tracks the counter per property

### Group & Role Recognition
- Owner registers first via DM — bot already knows them
- When bot is added to a group, anyone else is identified as the cleaner
- Bot DMs the owner asking which property to link the group to (shows property list)
- One group per property per cleaner — clean separation of context
- Cleaner can be in multiple property groups

### Cleaner Onboarding
- When bot joins a group, it sends a friendly welcome: "Hi [Cleaner]! I'm TextBud, [Owner]'s cleaning assistant for [Property]. I'll guide you through each clean. Text me when you arrive!"
- Short, friendly, informative — no lengthy orientation

### Staging Photo Handling
- 1-5 photos per room, flexible (TextBud suggests key angles but doesn't enforce a count)
- Echo each photo back with room label: "Got it — staging photo 1 of 3 for Kitchen. Send more or say 'done' to move to next room."
- Owner can replace/update staging photos anytime via DM

### On-the-fly Editing UX
- All edits happen in DM with bot only — not in group chats
- Natural language input: owner just describes what they want to change
- Conversational flow: owner says they want to make an edit, TextBud asks which property, then guides them through the change
- Show before/after confirmation: "Updated Kitchen checklist: added 'Mop the patio'. Kitchen now has 6 items. Here's the full list: [...]"

### Claude's Discretion
- Brief quality tips for staging photos (e.g., "Wide shots with good lighting work best")
- Exact wording of all bot messages and conversation prompts
- Error handling and edge cases during setup
- How to handle photos with no room context (ask which room)
- Setup flow transitions and progress indicators

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Spec
- `/Users/preetsekhon/Downloads/textbud-mvp-spec.md` — Full MVP product spec: property setup flow, room structure, staging photos, FAQ guidebook, deep clean cycles, checklist design, three-way thread model

### Project Planning
- `.planning/REQUIREMENTS.md` — Requirements PROP-01 through PROP-07 and COMM-01 through COMM-04 define this phase's scope
- `.planning/PROJECT.md` — Key decisions: Node.js + SQLite stack, Telegram three-way groups, Claude Vision, sequential checklist delivery

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — Phase 1 establishes the foundational patterns

### Integration Points
- Telegram Bot API — primary interface for all interactions
- SQLite database — property data, room configs, staging photos, FAQ entries, checklists
- File storage for staging photos (local filesystem for MVP)

</code_context>

<specifics>
## Specific Ideas

- Checklist input should be extremely flexible — "whatever works": free-form text, photo of a paper checklist, uploaded document, stream of consciousness. TextBud interprets and structures it.
- TextBud recommends checklist items based on cleaning best practices per room type
- DM is the "control center" for owners — setup, editing, property management all happen there
- Group chats are purely operational — cleaning sessions and guest support only
- Conversational editing: owner says "I want to make an edit" and TextBud guides them (asks which property, what to change) rather than requiring commands or syntax

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-property-setup*
*Context gathered: 2026-03-24*
