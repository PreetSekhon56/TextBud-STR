---
phase: 05-payments
plan: 01
subsystem: payments
tags: [stripe, telegram-payments, subscriptions, sqlite]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Owner model, bot framework, DM router, migration runner
provides:
  - subscriptions table with owner_id, stripe IDs, status, quantity, period dates
  - Stripe service layer (customer/subscription CRUD)
  - Payment handler with pre_checkout_query and successful_payment
  - Subscribe command via DM with Telegram invoice generation
  - hasActiveSubscription and getOwnerSubscription helpers
affects: [05-payments-plan-02, subscription-status, cancel-subscription]

# Tech tracking
tech-stack:
  added: [stripe]
  patterns: [telegram-payments-invoice-flow, stripe-as-lifecycle-manager]

key-files:
  created:
    - src/db/migrations/005_payments.sql
    - src/services/stripe.ts
    - src/handlers/payments.ts
  modified:
    - src/types/index.ts
    - src/bot.ts
    - .env.example
    - package.json

key-decisions:
  - "Store subscription as 'active' based on Telegram successful_payment, not Stripe subscription.status (which returns 'incomplete' due to payment_behavior)"
  - "Period dates sourced from subscription items (Stripe API v2024+ moved current_period_start/end to item level)"
  - "replyWithInvoice uses object parameter form (Telegraf API)"

patterns-established:
  - "Payment handler pattern: registerPaymentHandlers(bot) + handlePaymentMessage(ctx, owner) for DM routing"
  - "Priority 5.7 in DM router for payment/subscription triggers"

requirements-completed: [PAY-01, PAY-02]

# Metrics
duration: 4min
completed: 2026-03-25
---

# Phase 05 Plan 01: Payments Subscription Flow Summary

**Telegram Payments subscribe flow with Stripe backend: invoice generation, pre-checkout, subscription creation, and local DB storage**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-25T17:12:09Z
- **Completed:** 2026-03-25T17:16:09Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Subscriptions table with all required columns (owner_id, stripe IDs, status, quantity, period dates)
- Stripe service layer with customer creation, subscription CRUD, and cancellation helpers
- Full subscribe flow: owner types "subscribe" -> property count check -> Telegram invoice -> payment -> Stripe subscription + local DB record
- Pre-checkout query answered immediately (no blocking async work)
- Idempotency guard prevents duplicate subscriptions

## Task Commits

Each task was committed atomically:

1. **Task 1: Database migration, Subscription type, and Stripe service** - `1a0f95f` (feat)
2. **Task 2: Payment handlers and bot integration for subscribe flow** - `9713313` (feat)

## Files Created/Modified
- `src/db/migrations/005_payments.sql` - Subscriptions table with indexes
- `src/services/stripe.ts` - Stripe client init, customer/subscription CRUD helpers
- `src/handlers/payments.ts` - Payment handler registration, subscribe flow, active subscription checks
- `src/types/index.ts` - Added Subscription interface
- `src/bot.ts` - Registered payment handlers, added Priority 5.7 DM routing
- `.env.example` - Added STRIPE_SECRET_KEY, STRIPE_PROVIDER_TOKEN, STRIPE_PRICE_ID, PRICE_PER_PROPERTY_CENTS
- `package.json` - Added stripe dependency

## Decisions Made
- Store subscription as 'active' in local DB based on Telegram's successful_payment event (billing source of truth), not Stripe's subscription.status which returns 'incomplete' due to payment_behavior: 'default_incomplete'
- Period dates (current_period_start/end) sourced from subscription.items.data[0] since newer Stripe API moved these from Subscription to SubscriptionItem level
- Used object parameter form for ctx.replyWithInvoice (Telegraf API expectation)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Stripe Subscription period date access**
- **Found during:** Task 2 (Payment handlers)
- **Issue:** Plan used `subscription.current_period_start` but newer Stripe types moved these to `subscription.items.data[0]`
- **Fix:** Access period dates from `subscription.items.data[0].current_period_start/end`
- **Files modified:** src/handlers/payments.ts
- **Verification:** TypeScript compilation passes
- **Committed in:** 9713313 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed replyWithInvoice call signature**
- **Found during:** Task 2 (Payment handlers)
- **Issue:** Plan used positional arguments but Telegraf expects object parameter `{ title, description, payload, ... }`
- **Fix:** Changed to object form matching Telegraf's `NewInvoiceParameters` type
- **Files modified:** src/handlers/payments.ts
- **Verification:** TypeScript compilation passes
- **Committed in:** 9713313 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes required for TypeScript compilation. No scope creep.

## Issues Encountered
- npm peer dependency conflict with ts-jest and TypeScript 6 -- resolved with --legacy-peer-deps flag for stripe installation

## User Setup Required

**External services require manual configuration:**
- STRIPE_SECRET_KEY: Stripe Dashboard -> Developers -> API keys -> Secret key
- STRIPE_PROVIDER_TOKEN: Telegram BotFather -> /mybots -> your bot -> Payments -> Stripe (connect) -> copy provider token
- STRIPE_PRICE_ID: Stripe Dashboard -> Products -> Create product 'TextBud Subscription' with recurring per-unit price -> copy Price ID
- PRICE_PER_PROPERTY_CENTS: Default 2999 ($29.99/month per property)

## Next Phase Readiness
- Subscribe flow complete, ready for Plan 02 (subscription status, cancel, billing management)
- hasActiveSubscription() and getOwnerSubscription() available for gating features

---
*Phase: 05-payments*
*Completed: 2026-03-25*
