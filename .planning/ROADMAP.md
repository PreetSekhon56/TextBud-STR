# Roadmap: TextBud

## Overview

TextBud delivers a complete text-based cleaning operations workflow through Telegram. The build progresses from Telegram bot foundation and property configuration, through the core cleaning loop with AI photo verification, to owner reporting and inventory tracking, and finally guest support. Each phase delivers a complete, testable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Property Setup** - Telegram bot, three-way groups, property configuration via guided conversation
- [ ] **Phase 2: Cleaning Workflow** - Cleaner check-in, sequential checklists, entry video, AI photo comparison, real-time flagging
- [ ] **Phase 3: Reporting & Inventory** - Completion reports, inventory walkthrough, AI inventory detection, low-stock alerts
- [ ] **Phase 4: Guest Support** - Guest FAQ answers, unknown question routing, self-improving knowledge base

## Phase Details

### Phase 1: Foundation & Property Setup
**Goal**: Owners can fully configure properties and the bot operates in persistent three-way Telegram groups
**Depends on**: Nothing (first phase)
**Requirements**: PROP-01, PROP-02, PROP-03, PROP-04, PROP-05, PROP-06, PROP-07, COMM-01, COMM-02, COMM-03, COMM-04
**Success Criteria** (what must be TRUE):
  1. Owner can add bot to a Telegram group with a cleaner, and the bot recognizes the three-way structure (owner + cleaner + bot)
  2. Owner can set up a new property through text conversation -- defining rooms, uploading staging photos per room, writing FAQ entries, setting deep clean cycle, and building standard/deep clean checklists
  3. Owner can manage multiple properties and switch between them via text
  4. Owner can edit any property detail (checklists, FAQ, room info) on the fly from any thread
  5. Bot automatically brings property knowledge into new groups when a cleaner is added
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD

### Phase 2: Cleaning Workflow
**Goal**: Cleaners execute the full cleaning loop -- check-in, entry video, sequential room-by-room checklists, milestone photos with AI comparison, and real-time feedback
**Depends on**: Phase 1
**Requirements**: CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05, CLEAN-06, CLEAN-07, CLEAN-08, PROP-08, PROP-09
**Success Criteria** (what must be TRUE):
  1. Cleaner checks in via text and receives the correct clean type, checklist, and any special instructions; clock starts automatically
  2. Cleaner records entry video walkthrough, and AI generates a rough floor plan from the video that is available to cleaners and guests
  3. Checklist is delivered room-by-room as cleaner progresses (not all at once), and TextBud requests milestone photos at timed intervals
  4. AI compares each milestone photo to the staging reference photo and flags issues to the cleaner in real time
  5. Cleaner marks completion, submits remaining photos, and clock stops
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Reporting & Inventory
**Goal**: Owners receive comprehensive completion reports and inventory is tracked with low-stock alerting
**Depends on**: Phase 2
**Requirements**: REPT-01, REPT-02, REPT-03, REPT-04, REPT-05
**Success Criteria** (what must be TRUE):
  1. Owner receives a completion report after each clean showing time in/out, duration, all photos side-by-side with staging references, AI assessment per room, flagged items, and checklist completion status
  2. After cleaning completion, cleaner walks through inventory item-by-item via text and can photograph supplies for AI-based inventory level detection
  3. Low-stock items are automatically flagged to the owner
  4. Inventory consumption data is stored persistently to support future ordering system
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: Guest Support
**Goal**: Guests get instant answers to property questions through Telegram, with unknown questions routed to the owner to build a self-improving knowledge base
**Depends on**: Phase 1
**Requirements**: GUEST-01, GUEST-02, GUEST-03
**Success Criteria** (what must be TRUE):
  1. Guest texts a question in a three-way Telegram group (guest + owner/manager + bot) and gets an instant answer from the property FAQ
  2. When the bot cannot answer a question, it flags the owner who can respond and optionally add the answer to the knowledge base for future use
  3. The knowledge base grows over time -- previously unknown questions that were answered by the owner are now answered automatically
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Property Setup | 0/? | Not started | - |
| 2. Cleaning Workflow | 0/? | Not started | - |
| 3. Reporting & Inventory | 0/? | Not started | - |
| 4. Guest Support | 0/? | Not started | - |
