# TextBud

## What This Is

TextBud is a text-based operations assistant that manages the full cleaning workflow — property setup, cleaner onboarding, real-time milestone tracking, AI photo verification, inventory management, guest support, AI floor plan generation, and subscription billing — entirely through Telegram group chats. No app. No dashboard. Just text. One product serving two markets simultaneously: short-term rental (STR) operators and regular homeowners who manage cleaners.

## Core Value

Cleaners clean the property exactly the way the owner wants it, verified by AI photo comparison, managed entirely through text messaging.

## Requirements

### Validated

- [x] Owner can set up a property through guided text conversation (rooms, staging photos, FAQ/guidebook, checklists, deep clean schedule) — *v1.0*
- [x] All interactions are three-way Telegram groups (owner + other party + bot) — *v1.0*
- [x] Owner can manage multiple properties — *v1.0*
- [x] Everything is editable on the fly via text (checklists, instructions, property info) from group or personal thread — *v1.0*
- [x] Cleaner checks in via text, receives sequential room-by-room checklist, and records entry video walkthrough on arrival — *v1.0*
- [x] TextBud requests milestone photos at timed intervals and compares them to staging photos using Claude Vision — *v1.0*
- [x] Owner receives completion report with photos, AI assessments, duration, flagged items, and checklist status — *v1.0*
- [x] Inventory walkthrough after each clean with item-by-item counts and low-stock alerts to owner — *v1.0*
- [x] Guest can text for property info; unknown questions flagged to owner (self-improving knowledge base) — *v1.0*
- [x] Owner can subscribe and pay via Telegram Payments (Stripe + Apple Pay / Google Pay), per-property billing — *v1.0*
- [x] AI generates rough floor plan from entry walkthrough video, available to cleaners and guests — *v1.0*

### Active

- [ ] Inventory data collection to support future backend ordering system
- [ ] Fix subscription gate deadlock for new owners (first property creation blocked)
- [ ] Align bot.hears commands with subscription gate enforcement

### Out of Scope

- Smart home / door codes / auto-unlock — not core to cleaning workflow
- Owner dashboard / web portal — text-first, no dashboard
- Mobile app — Telegram is the interface
- Multi-channel (WhatsApp, Signal, iMessage) — Telegram only for MVP
- Supply e-commerce / ordering — MVP collects data, ordering is post-MVP
- Website — not needed for MVP
- Architectural-grade floor plans — rough connectivity diagram is sufficient

## Context

**Shipped:** v1.0 MVP on 2026-03-25 (5,606 LOC TypeScript, 141 tests)

**Market insight:** STR is the entry point, but the real market is home cleaning broadly. Regular homeowners managing cleaners ($10/month) is a massive, underserved market — immigrant workers cleaning houses for homeowners who want consistency and control. Same product, minor variation from STR.

**Communication model:** Everything runs through Telegram groups. The three-way chat (owner + cleaner/guest + bot) IS the product interface. No separate invite flow — owner creates a group, adds the cleaner and the bot, and the bot brings all property knowledge into that chat. Cleaning chats are persistent per cleaner. Guest chats also include the owner/manager.

**Property knowledge:** Lives in the backend database, not in any specific chat. Flows into whichever group needs it. When a new cleaner is onboarded, the bot carries all institutional knowledge about the property into the new group.

**Data strategy:** Track inventory consumption patterns, purchasing data, and cleaning frequencies across all properties. This data powers a future ordering/supply system — "we order for you based on your usage tiers."

**Entry video:** Cleaner records a slow walkthrough video of the entire property on arrival (before any cleaning). Documents pre-existing condition and damages. Protects both owner and cleaner. Also used for AI floor plan generation.

**Checklist design:** Built collaboratively with the owner during property setup. Delivered sequentially to the cleaner (room-by-room, timed) — not dumped all at once. Informed by cleaning best practices. Deep clean schedule set by owner (every Nth clean).

## Constraints

- **Tech stack**: Node.js backend, SQLite (better-sqlite3) — scale to Supabase later
- **Messaging**: Telegram only (Telegraf framework)
- **AI**: Claude Vision (Anthropic SDK) for photo comparison, FAQ matching, floor plan generation
- **Video**: FFmpeg for frame extraction from entry videos
- **Payments**: Stripe via Telegram Payments API

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node.js + SQLite over Python + Supabase | Start simple, scale later | Good — fast iteration, single-file DB |
| Three-way Telegram groups as core model | Owner always in the loop | Good — natural interaction model |
| Claude Vision for photo comparison | Keep in Anthropic ecosystem | Good — accurate room comparison |
| STR first, home cleaning market second | STR operators are early adopters | Pending — not yet validated with users |
| Entry video on arrival | Liability protection for both parties | Good — also enables floor plan generation |
| Sequential checklist delivery | Guide cleaners through the process | Good — prevents overwhelm |
| CJS with NodeNext resolution, tsx for dev | Simpler module resolution | Good — no ESM headaches |
| In-memory Maps for transient session state | MVP-appropriate, avoids extra DB tables | Good — simple, fast |
| Central DM router with priority dispatch | Avoids handler registration conflicts | Good — clean routing |
| Two-pass Claude for floor plans | Separate analysis from SVG generation | Good — more reliable output |
| Telegram Payments + Stripe hybrid | Telegram checkout UX, Stripe lifecycle | Good — native payment experience |
| Store subscription as active on Telegram payment | Telegram is billing source of truth | Good — avoids Stripe incomplete status |

---
*Last updated: 2026-03-25 after v1.0 milestone*
