# Phase 5: Payments - Research

**Researched:** 2026-03-25
**Domain:** Telegram Payments API + Stripe subscription billing
**Confidence:** MEDIUM

## Summary

Phase 5 adds subscription billing so property owners can pay for TextBud on a per-property-per-month basis via Telegram's built-in Payments API with Stripe as the backend provider. Telegram Payments supports Apple Pay and Google Pay natively through the Stripe provider, and Telegraf 4.16.3 has built-in methods for `sendInvoice`, `createInvoiceLink`, `answerPreCheckoutQuery`, and event handlers for `pre_checkout_query` and `successful_payment`.

The recommended architecture is a **hybrid approach**: use Telegram Payments API for the checkout UX (user stays in Telegram, Apple Pay/Google Pay work natively) but use Stripe's subscription API directly for subscription lifecycle management (quantity updates when properties are added/removed, cancellation, status queries). This gives the best UX (in-chat payments) while leveraging Stripe's robust subscription management (proration, retry logic, quantity-based billing).

The key complexity is per-property billing with dynamic quantity changes. Stripe's per-unit subscription model (often called "per-seat licensing") handles this natively -- you create a subscription with quantity = number of properties, then update the quantity when properties are added or removed. Stripe automatically prorates charges.

**Primary recommendation:** Use Telegram Payments for initial checkout, Stripe SDK for subscription management, SQLite for local subscription state, and a simple cron/interval check for subscription enforcement.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PAY-01 | Owner can subscribe via Telegram Payments (Stripe backend, Apple Pay / Google Pay) | Telegram Payments API with Stripe provider supports Apple Pay + Google Pay natively. Telegraf has sendInvoice, pre_checkout_query, successful_payment handlers. |
| PAY-02 | Subscription billed per property per month | Stripe per-unit subscription model with quantity = property count. Create one subscription per owner with quantity matching active properties. |
| PAY-03 | Add/remove properties adjusts billing automatically | Stripe subscription update API with quantity parameter. Stripe auto-prorates when quantity changes. Hook into existing property creation/deletion flows. |
| PAY-04 | Owner can view subscription status and cancel via text | Query local subscriptions table + Stripe API for status. Cancel via Stripe subscription cancel API. Conversational UX in DM router. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| telegraf | 4.16.3 | Telegram bot framework (already installed) | Already in use; has built-in payment methods |
| stripe | 20.4.1 | Stripe API for subscription management | Official Node.js SDK; handles subscription CRUD, quantity updates, proration |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| better-sqlite3 | 12.8.0 | Local subscription state storage (already installed) | Store subscription records, enforce access |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Stripe direct subscriptions | Telegram-only recurring payments | Telegram recurring payments are lower-level (store card tokens, manual charge scheduling). Stripe handles retry logic, proration, dunning automatically. |
| Stripe SDK | Stripe webhooks only | Webhooks add infrastructure complexity (HTTP endpoint). For MVP, polling/direct API calls are simpler since bot already runs as long-polling process. |

**Installation:**
```bash
npm install stripe
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── handlers/
│   └── payments.ts          # registerPaymentHandlers(bot) — subscribe, status, cancel commands
├── services/
│   └── stripe.ts            # Stripe client init, subscription CRUD helpers
├── db/
│   └── migrations/
│       └── 005_payments.sql  # subscriptions table
└── types/
    └── index.ts             # Add Subscription type
```

### Pattern 1: Telegram Payments Checkout Flow
**What:** Use Telegram's native payment UI for initial subscription creation.
**When to use:** Owner says "subscribe" or "start subscription" in DM.
**Flow:**
1. Bot sends invoice via `ctx.replyWithInvoice()` with Stripe provider token
2. Telegram shows native payment sheet (Apple Pay / Google Pay / card)
3. Bot receives `pre_checkout_query` -- validate and approve within 10 seconds
4. Bot receives `successful_payment` -- create Stripe subscription via API, store locally

```typescript
// Send invoice for subscription
bot.command('subscribe', async (ctx) => {
  const propertyCount = getOwnerPropertyCount(owner.id);
  await ctx.replyWithInvoice({
    title: 'TextBud Subscription',
    description: `${propertyCount} properties x $X/month`,
    payload: JSON.stringify({ ownerId: owner.id, quantity: propertyCount }),
    provider_token: process.env.STRIPE_PROVIDER_TOKEN!,
    currency: 'USD',
    prices: [{ label: `${propertyCount} properties`, amount: propertyCount * PRICE_PER_PROPERTY_CENTS }],
  });
});

// Must answer within 10 seconds
bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

// Payment succeeded -- create subscription in Stripe
bot.on('successful_payment', async (ctx) => {
  const payment = ctx.message.successful_payment;
  // Create/update Stripe subscription, store in DB
});
```

### Pattern 2: Stripe Subscription Quantity Management
**What:** Use Stripe SDK to manage subscription lifecycle after initial payment.
**When to use:** Owner adds/removes property, checks status, cancels.

```typescript
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Update quantity when property added/removed
async function updateSubscriptionQuantity(subscriptionId: string, newQuantity: number) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await stripe.subscriptions.update(subscriptionId, {
    items: [{
      id: subscription.items.data[0].id,
      quantity: newQuantity,
    }],
    proration_behavior: 'create_prorations',
  });
}

// Cancel subscription
async function cancelSubscription(subscriptionId: string) {
  await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true, // Graceful: access until end of billing period
  });
}
```

### Pattern 3: Conversational Payment UX
**What:** Payment interactions happen through text conversation in DM, following the existing bot routing pattern.
**When to use:** All payment interactions.

```typescript
// In the central DM router (bot.ts), add payment triggers:
// Priority X: Payment triggers
if (/\b(subscribe|subscription|billing|cancel subscription|my plan)\b/i.test(text)) {
  return next(); // Let payment handlers handle it
}
```

### Pattern 4: Subscription Enforcement
**What:** Check subscription status before allowing property operations.
**When to use:** Property setup, cleaning session start.

```typescript
function hasActiveSubscription(ownerId: number): boolean {
  const sub = db.prepare(
    'SELECT * FROM subscriptions WHERE owner_id = ? AND status IN (?, ?) AND current_period_end > datetime(?)'
  ).get(ownerId, 'active', 'trialing', new Date().toISOString());
  return !!sub;
}
```

### Anti-Patterns to Avoid
- **Building custom retry/dunning logic:** Stripe handles failed payment retries automatically with smart retry. Do not build custom charge retry loops.
- **Storing card data locally:** Never store payment credentials. Stripe and Telegram handle PCI compliance. Only store subscription IDs and status.
- **Using Telegram recurring payments directly:** The `recurring_init`/`recurring_used` flags in the raw Telegram API require manual charge scheduling. Stripe subscriptions handle this automatically.
- **Webhook-first architecture for MVP:** Adding an HTTP endpoint for Stripe webhooks adds deployment complexity. For MVP, poll Stripe on demand (status check, property change) and trust `successful_payment` event for initial creation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recurring billing | Cron job to charge cards monthly | Stripe Subscriptions API | Retry logic, dunning, proration, compliance |
| Payment UI | Custom payment form | Telegram Payments API (`sendInvoice`) | Native Apple Pay/Google Pay, PCI compliance |
| Proration | Calculate partial month charges | Stripe proration_behavior | Edge cases around billing cycles, refunds |
| Subscription status | Custom state machine | Stripe subscription status + local cache | Stripe tracks `active`, `past_due`, `canceled`, `unpaid` |
| Payment method storage | Store card tokens | Stripe Customer objects | PCI compliance, automatic card updates |

**Key insight:** Payment and billing have enormous edge-case surface area (failed charges, card expiry, timezone billing, proration rounding). Stripe has spent years solving these. The bot should be a thin wrapper around Stripe's subscription lifecycle.

## Common Pitfalls

### Pitfall 1: Pre-Checkout Query Timeout
**What goes wrong:** Bot takes >10 seconds to answer `pre_checkout_query`, transaction auto-cancels.
**Why it happens:** Doing async work (DB queries, Stripe calls) before answering.
**How to avoid:** Answer `pre_checkout_query` with `true` immediately. Do validation synchronously (check owner exists, basic sanity). Heavy work happens in `successful_payment` handler.
**Warning signs:** Intermittent payment failures, users reporting "payment failed" messages.

### Pitfall 2: Duplicate Subscription Creation
**What goes wrong:** Owner pays twice, gets two Stripe subscriptions.
**Why it happens:** No idempotency check in `successful_payment` handler.
**How to avoid:** Check if owner already has active subscription before creating new one in Stripe. Use Stripe customer ID to query existing subscriptions.
**Warning signs:** Multiple subscription records per owner in DB.

### Pitfall 3: Quantity Desync Between DB and Stripe
**What goes wrong:** Owner has 3 properties locally but Stripe bills for 2.
**Why it happens:** Property add/remove does not update Stripe subscription quantity.
**How to avoid:** Hook into property creation and deletion to call `updateSubscriptionQuantity`. Count properties from DB as source of truth for quantity.
**Warning signs:** Revenue leakage or overbilling complaints.

### Pitfall 4: Stripe Provider Token vs Secret Key Confusion
**What goes wrong:** Using Stripe secret key as Telegram provider token or vice versa.
**Why it happens:** Two different Stripe-related tokens with different purposes.
**How to avoid:** `STRIPE_PROVIDER_TOKEN` comes from BotFather (for Telegram Payments API). `STRIPE_SECRET_KEY` comes from Stripe Dashboard (for Stripe SDK). Both are needed. Provider token for `sendInvoice`, secret key for subscription management.
**Warning signs:** 400 errors from Telegram or Stripe API.

### Pitfall 5: Not Handling Subscription Lapse Gracefully
**What goes wrong:** Subscription expires/cancels, bot crashes or gives cryptic errors.
**Why it happens:** No grace period or clear messaging for expired subscriptions.
**How to avoid:** When subscription is `past_due` or `canceled`, bot still works but shows "subscription expired" message and prompts to renew. Don't hard-block immediately -- allow a grace period.
**Warning signs:** Angry users who lost access mid-cleaning-session.

## Code Examples

### Migration: 005_payments.sql
```sql
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES owners(id),
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'active', 'past_due', 'canceled', 'unpaid', 'trialing')),
  quantity INTEGER NOT NULL DEFAULT 1,
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_owner
  ON subscriptions(owner_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub
  ON subscriptions(stripe_subscription_id);
```

### Payment Handler Registration Pattern
```typescript
// src/handlers/payments.ts
import { Telegraf } from 'telegraf';

export function registerPaymentHandlers(bot: Telegraf) {
  // Pre-checkout: MUST answer within 10 seconds
  bot.on('pre_checkout_query', async (ctx) => {
    await ctx.answerPreCheckoutQuery(true);
  });

  // Successful payment: create subscription
  bot.on('successful_payment', async (ctx) => {
    const payment = ctx.message.successful_payment;
    const payload = JSON.parse(payment.invoice_payload);
    // Create Stripe subscription, update DB
  });
}
```

### DM Router Integration
```typescript
// Add to bot.ts central DM router, before "unknown command" fallback:
// Priority X: Payment/subscription triggers
if (/\b(subscribe|subscription|billing|my plan|cancel subscription|payment)\b/i.test(text)) {
  if (!owner) {
    await ctx.reply('Please send /start first to register.');
    return;
  }
  const handled = await handlePaymentMessage(ctx, owner);
  if (handled) return;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Telegram Stars for subscriptions | Stripe via Telegram Payments API | 2024+ | Stars are for digital goods/tipping; Stripe is for SaaS subscriptions |
| Manual recurring charge scheduling | Stripe Subscriptions with auto-billing | Stripe Billing GA | No need to build cron-based charge logic |
| Webhook-only subscription events | Hybrid: direct API calls + webhook fallback | Always available | Simpler for MVP -- no HTTP endpoint needed |

**Deprecated/outdated:**
- Telegram Payments 1.0: Replaced by Payments 2.0 which supports multi-chat invoices and flexible pricing
- `provider_token` empty string for Stars: Only for digital goods via Telegram Stars, not applicable here

## Open Questions

1. **Pricing per property**
   - What we know: Subscription is per-property-per-month (PAY-02)
   - What's unclear: Exact dollar amount per property per month
   - Recommendation: Make price configurable via env var (`PRICE_PER_PROPERTY_CENTS`). Default to a reasonable amount (e.g., 2999 = $29.99/month/property) that can be changed without code changes.

2. **Free trial / grace period**
   - What we know: Requirements don't mention a trial period
   - What's unclear: Should new users get a trial? What happens when payment lapses?
   - Recommendation: Implement a simple grace period (e.g., 3 days past due) where bot continues working but reminds owner to pay. No trial in MVP unless specified.

3. **Stripe Webhook endpoint**
   - What we know: Bot uses Telegram long-polling, no HTTP server
   - What's unclear: Whether Stripe webhooks are needed for subscription lifecycle events
   - Recommendation: For MVP, skip webhooks. Use Stripe SDK direct API calls on demand (when owner checks status, when property changes). Add webhooks in v2 when scaling or adding a web presence.

4. **Stripe Product/Price setup**
   - What we know: Need a Stripe Product with a per-unit Price
   - What's unclear: Whether to create these via Stripe Dashboard or programmatically
   - Recommendation: Create the Product and Price manually in Stripe Dashboard. Store the Price ID in env var (`STRIPE_PRICE_ID`). This is a one-time setup task.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.3.0 + ts-jest 29.4.6 |
| Config file | jest.config.ts |
| Quick run command | `npx jest --testPathPattern=payments -x` |
| Full suite command | `npx jest` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAY-01 | Invoice sent with correct params, pre_checkout answered, successful_payment creates subscription | unit | `npx jest tests/payments/subscribe.test.ts -x` | No -- Wave 0 |
| PAY-02 | Subscription quantity matches property count | unit | `npx jest tests/payments/billing.test.ts -x` | No -- Wave 0 |
| PAY-03 | Property add/remove triggers quantity update | unit | `npx jest tests/payments/quantity.test.ts -x` | No -- Wave 0 |
| PAY-04 | Status query returns correct info, cancel sets cancel_at_period_end | unit | `npx jest tests/payments/status.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest --testPathPattern=payments -x`
- **Per wave merge:** `npx jest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/payments/` directory -- new test directory for payment tests
- [ ] Mock for Stripe SDK -- stripe methods need to be mocked (no real API calls in tests)
- [ ] Mock for Telegraf payment methods -- ctx.replyWithInvoice, ctx.answerPreCheckoutQuery need mocking

## Sources

### Primary (HIGH confidence)
- [Telegram Bot Payments API](https://core.telegram.org/bots/payments) -- payment flow, provider tokens, pre_checkout_query timing
- [Telegram Payments API (raw)](https://core.telegram.org/api/payments) -- recurring flags, subscription_period, credential storage
- [Telegraf API docs](https://telegraf.js.org/classes/Telegram.html) -- sendInvoice, createInvoiceLink, answerPreCheckoutQuery method signatures
- [Stripe Subscription Quantities](https://docs.stripe.com/billing/subscriptions/quantities) -- per-unit billing, quantity updates, proration

### Secondary (MEDIUM confidence)
- [Stripe Subscriptions API](https://docs.stripe.com/api/subscriptions) -- subscription CRUD operations
- [Stripe Update Subscription](https://docs.stripe.com/api/subscriptions/update?lang=node) -- quantity update parameters

### Tertiary (LOW confidence)
- Various blog posts on Telegram + Stripe integration patterns (community examples, not official)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Telegraf and Stripe are well-documented, versions verified via npm
- Architecture: MEDIUM -- Hybrid Telegram Payments + Stripe SDK approach is sound but exact `successful_payment` to Stripe subscription creation flow needs validation during implementation
- Pitfalls: HIGH -- Pre-checkout timeout and idempotency are well-documented issues
- Subscription quantity management: HIGH -- Stripe's per-unit billing is a core documented feature

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable APIs, unlikely to change)
