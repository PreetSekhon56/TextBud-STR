# TextBud

## What This Is

TextBud is a text-based operations assistant that manages the full cleaning workflow — property setup, cleaner onboarding, real-time milestone tracking, AI photo verification, inventory management, and guest support — entirely through Telegram group chats. No app. No dashboard. Just text. One product serving two markets simultaneously: short-term rental (STR) operators and regular homeowners who manage cleaners. The core cleaning workflow is shared; guest features (FAQ, guidebook, guest chat) are optional per property.

## Core Value

Cleaners clean the property exactly the way the owner wants it, verified by AI photo comparison, managed entirely through text messaging.

## Requirements

### Validated

- [x] Owner can set up a property through guided text conversation (rooms, staging photos, FAQ/guidebook, checklists, deep clean schedule) — *Validated in Phase 1: Foundation & Property Setup*
- [x] All interactions are three-way Telegram groups (owner + other party + bot) — *Validated in Phase 1*
- [x] Owner can manage multiple properties — *Validated in Phase 1*
- [x] Everything is editable on the fly via text (checklists, instructions, property info) from group or personal thread — *Validated in Phase 1*
- [x] Cleaner checks in via text, receives sequential room-by-room checklist, and records entry video walkthrough on arrival — *Validated in Phase 2: Cleaning Workflow*
- [x] TextBud requests milestone photos at timed intervals and compares them to staging photos using Claude Vision — *Validated in Phase 2*
- [x] Owner receives completion report with photos, AI assessments, duration, flagged items, and checklist status — *Validated in Phase 3: Reporting & Inventory*
- [x] Inventory walkthrough after each clean with item-by-item counts and low-stock alerts to owner — *Validated in Phase 3*
- [x] Guest can text for property info; unknown questions flagged to owner (self-improving knowledge base) — *Validated in Phase 4: Guest Support*

### Active

- [ ] Inventory data collection to support future backend ordering system

### Out of Scope

- Smart home / door codes / auto-unlock — not core to cleaning workflow
- Visual floor plan builder — unnecessary complexity for MVP
- Payment processing — defer to post-MVP
- Owner dashboard / web portal — text-first, no dashboard
- Mobile app — Telegram is the interface
- Multi-channel (WhatsApp, Signal, iMessage) — Telegram only for MVP
- Supply e-commerce / ordering — MVP collects data, ordering is post-MVP
- Website — not needed for MVP

## Context

**Market insight:** STR is the entry point, but the real market is home cleaning broadly. Regular homeowners managing cleaners ($10/month) is a massive, underserved market — immigrant workers cleaning houses for homeowners who want consistency and control. Same product, minor variation from STR.

**Communication model:** Everything runs through Telegram groups. The three-way chat (owner + cleaner/guest + bot) IS the product interface. No separate invite flow — owner creates a group, adds the cleaner and the bot, and the bot brings all property knowledge into that chat. Cleaning chats are persistent per cleaner. Guest chats also include the owner/manager.

**Property knowledge:** Lives in the backend database, not in any specific chat. Flows into whichever group needs it. When a new cleaner is onboarded, the bot carries all institutional knowledge about the property into the new group.

**Data strategy:** Track inventory consumption patterns, purchasing data, and cleaning frequencies across all properties. This data powers a future ordering/supply system — "we order for you based on your usage tiers."

**Entry video:** Cleaner records a slow walkthrough video of the entire property on arrival (before any cleaning). Documents pre-existing condition and damages. Protects both owner and cleaner.

**Checklist design:** Built collaboratively with the owner during property setup. Delivered sequentially to the cleaner (room-by-room, timed) — not dumped all at once. Informed by cleaning best practices. Deep clean schedule set by owner (every Nth clean).

## Constraints

- **Tech stack**: Node.js backend, SQLite for MVP (migrate to Supabase at scale)
- **Messaging**: Telegram only for MVP
- **AI**: Claude Vision for photo comparison
- **Video**: FFmpeg for frame extraction from entry videos
- **Timeline**: 3-week express build target

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node.js + SQLite over Python + Supabase | Start simple, scale later. Spec-aligned stack | — Pending |
| Three-way Telegram groups as core model | Owner always in the loop. No separate invite/onboarding flow needed | — Pending |
| Claude Vision for photo comparison | Keep in Anthropic ecosystem | — Pending |
| STR first, home cleaning market second | STR operators are early adopters with clear pain; same product serves both markets | — Pending |
| Entry video on arrival | Liability protection for both parties, damage documentation | — Pending |
| Sequential checklist delivery | Guide cleaners through the process rather than overwhelming with full list | — Pending |

---
*Last updated: 2026-03-25 — Phase 4 (Guest Support) complete*
