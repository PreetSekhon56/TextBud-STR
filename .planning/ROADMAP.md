# Roadmap: TextBud

## Overview

TextBud delivers a complete text-based cleaning operations workflow through Telegram. The build progresses from Telegram bot foundation and property configuration, through the core cleaning loop with AI photo verification, to owner reporting and inventory tracking, and finally guest support. Each phase delivers a complete, testable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & Property Setup** - Telegram bot, three-way groups, property configuration via guided conversation (completed 2026-03-24)
- [ ] **Phase 2: Cleaning Workflow** - Cleaner check-in, sequential checklists, entry video, AI photo comparison, real-time flagging
- [x] **Phase 3: Reporting & Inventory** - Completion reports, inventory walkthrough, AI inventory detection, low-stock alerts (completed 2026-03-25)
- [ ] **Phase 4: Guest Support** - Guest FAQ answers, unknown question routing, self-improving knowledge base
- [x] **Phase 5: Payments** - Telegram Payments via Stripe, per-property subscriptions, Apple Pay / Google Pay (completed 2026-03-25)
- [x] **Phase 6: Subscription Enforcement & Cleanup** - Wire subscription gating, clean dead imports, fix mixed module syntax (GAP CLOSURE) (completed 2026-03-25)
- [x] **Phase 7: Floor Plan Generation** - AI floor plan from entry video, navigational reference for cleaners and guests (GAP CLOSURE) (completed 2026-03-25)

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
**Plans**: 4 plans

Plans:
- [x] 01-01-PLAN.md -- Project scaffolding, database schema, Telegram bot skeleton with owner registration
- [x] 01-02-PLAN.md -- Guided property setup conversation (rooms, photos, FAQ, checklists, deep clean cycle)
- [x] 01-03-PLAN.md -- Three-way group detection, property linking, cleaner onboarding
- [x] 01-04-PLAN.md -- Multi-property management and on-the-fly editing

### Phase 2: Cleaning Workflow
**Goal**: Cleaners execute the full cleaning loop -- check-in, entry video (liability documentation), sequential room-by-room checklists with inline buttons, milestone photos with AI comparison, and real-time feedback
**Depends on**: Phase 1
**Requirements**: CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05, CLEAN-06, CLEAN-07, CLEAN-08
**Success Criteria** (what must be TRUE):
  1. Cleaner checks in via text and receives the correct clean type, checklist, and any special instructions; clock starts automatically
  2. Cleaner records entry video walkthrough for liability documentation
  3. Checklist is delivered room-by-room as cleaner progresses (not all at once), using inline keyboard buttons for tap-to-complete
  4. AI compares each milestone photo to the staging reference photo and flags issues to the cleaner in real time
  5. Cleaner marks completion, submits remaining photos, and clock stops with summary
**Plans**: 3 plans

Plans:
- [ ] 02-01-PLAN.md -- Foundation: Anthropic SDK, DB migration, types, Jest test infrastructure
- [ ] 02-02-PLAN.md -- Check-in flow, entry video, sequential checklist with inline buttons, group routing
- [ ] 02-03-PLAN.md -- Claude Vision photo comparison, flagging/retry, completion flow with summary

### Phase 3: Reporting & Inventory
**Goal**: Owners receive comprehensive completion reports and inventory is tracked with low-stock alerting
**Depends on**: Phase 2
**Requirements**: REPT-01, REPT-02, REPT-03, REPT-04, REPT-05
**Success Criteria** (what must be TRUE):
  1. Owner receives a completion report after each clean showing time in/out, duration, all photos side-by-side with staging references, AI assessment per room, flagged items, and checklist completion status
  2. After cleaning completion, cleaner walks through inventory item-by-item via text and can photograph supplies for AI-based inventory level detection
  3. Low-stock items are automatically flagged to the owner
  4. Inventory consumption data is stored persistently to support future ordering system
**Plans**: 2 plans

Plans:
- [ ] 03-01-PLAN.md -- Completion report: room-by-room photos, AI verdicts, checklist status, DB storage
- [ ] 03-02-PLAN.md -- Inventory walkthrough, setup, low-stock alerts, receipt scanning, restock commands

### Phase 4: Guest Support
**Goal**: Guests get instant answers to property questions through Telegram, with unknown questions routed to the owner to build a self-improving knowledge base
**Depends on**: Phase 1
**Requirements**: GUEST-01, GUEST-02, GUEST-03
**Success Criteria** (what must be TRUE):
  1. Guest texts a question in a three-way Telegram group (guest + owner/manager + bot) and gets an instant answer from the property FAQ
  2. When the bot cannot answer a question, it flags the owner who can respond and optionally add the answer to the knowledge base for future use
  3. The knowledge base grows over time -- previously unknown questions that were answered by the owner are now answered automatically
**Plans**: 1 plan

Plans:
- [ ] 04-01-PLAN.md -- Guest group detection, Claude-powered FAQ matching, unknown question routing, self-improving knowledge base

### Phase 5: Payments
**Goal**: Owners can subscribe and pay for TextBud per property via Telegram Payments with Apple Pay / Google Pay
**Depends on**: Phase 1
**Requirements**: PAY-01, PAY-02, PAY-03, PAY-04
**Success Criteria** (what must be TRUE):
  1. Owner can subscribe to TextBud via Telegram Payments using Apple Pay or Google Pay (Stripe backend)
  2. Subscription is billed per property per month — adding/removing properties adjusts billing automatically
  3. Owner can view subscription status and cancel via text conversation with the bot
**Plans**: 2 plans

Plans:
- [ ] 05-01-PLAN.md -- Stripe service, payments migration, Telegram Payments subscribe flow
- [ ] 05-02-PLAN.md -- Subscription status/cancel commands, property add/remove billing sync

### Phase 6: Subscription Enforcement & Cleanup
**Goal**: Wire hasActiveSubscription() into the DM router to gate premium features behind active subscription, clean up dead imports and mixed module syntax
**Depends on**: Phase 5
**Requirements**: PAY-01
**Gap Closure**: Closes integration gap (payments → all handlers) and flow gap (subscription enforcement) from v1.0 audit
**Success Criteria** (what must be TRUE):
  1. Owners without an active subscription cannot use premium features (setup, cleaning, guest, inventory)
  2. Owners with an active subscription can use all features as before
  3. Dead imports removed (syncSubscriptionQuantity in setup-review.ts, reloadActiveSessions in bot.ts)
  4. Mixed import/require in index.ts converted to consistent ESM imports
**Plans**: 1 plan

Plans:
- [ ] 06-01-PLAN.md -- Subscription gate in DM router, dead import cleanup, ESM conversion in index.ts

### Phase 7: Floor Plan Generation
**Goal**: AI generates a rough floor plan from the cleaner's entry walkthrough video and makes it available as a navigational reference
**Depends on**: Phase 2
**Requirements**: PROP-08, PROP-09
**Gap Closure**: Closes orphaned requirements PROP-08 and PROP-09 from v1.0 audit
**Success Criteria** (what must be TRUE):
  1. After a cleaner submits an entry walkthrough video, AI extracts frames and generates a room-connectivity floor plan
  2. Floor plan is stored and associated with the property
  3. Cleaners and guests can request the floor plan via text command
**Plans**: 2 plans

Plans:
- [ ] 07-01-PLAN.md -- Floor plan service: DB migration, types, FFmpeg frame extraction, Claude Vision analysis, SVG generation pipeline
- [ ] 07-02-PLAN.md -- Telegram handlers: async trigger on entry video, floor plan request command for cleaners and guests

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Property Setup | 4/4 | Complete   | 2026-03-24 |
| 2. Cleaning Workflow | 3/3 | Complete   | 2026-03-25 |
| 3. Reporting & Inventory | 2/2 | Complete   | 2026-03-25 |
| 4. Guest Support | 1/1 | Complete   | 2026-03-25 |
| 5. Payments | 2/2 | Complete   | 2026-03-25 |
| 6. Subscription Enforcement & Cleanup | 1/1 | Complete   | 2026-03-25 |
| 7. Floor Plan Generation | 2/2 | Complete   | 2026-03-25 |
