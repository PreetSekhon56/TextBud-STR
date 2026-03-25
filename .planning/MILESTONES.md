# Milestones

## v1.0 MVP (Shipped: 2026-03-25)

**Phases completed:** 7 phases, 15 plans, ~31 tasks
**Timeline:** 2 days (2026-03-24 → 2026-03-25)
**Source:** 5,606 LOC TypeScript | 2,659 LOC tests (141 tests, 14 suites)
**Commits:** 92

**Key accomplishments:**

1. Full property setup wizard via guided text conversation — rooms, staging photos, FAQ/guidebook, standard + deep clean checklists, deep clean scheduling
2. Complete cleaning workflow with sequential room-by-room checklists, inline keyboard buttons, entry video recording, Claude Vision AI photo comparison, real-time issue flagging, and retry loops
3. Completion reports with room-by-room photos, AI assessments, duration tracking, and checklist status; plus inventory walkthrough with AI-powered receipt scanning, alarming drop detection, and threshold recommendations
4. Guest support with Claude-powered FAQ matching, unknown question routing to owner, and self-improving knowledge base
5. Telegram Payments with Stripe backend — per-property subscriptions, Apple Pay / Google Pay, subscription enforcement gate
6. AI floor plan generation from entry walkthrough video via FFmpeg frame extraction + Claude Vision analysis + SVG generation

**Known tech debt:**
- Subscription gate blocks "new property" for unsubscribed new owners (chicken-and-egg deadlock)
- `bot.hears` for reporting/inventory-setup bypasses subscription gate
- `getOwnerSubscription` orphaned export; `syncSubscriptionQuantity` missing from manage/edit paths
- Inventory session timeout leak on error

---
