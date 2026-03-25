import { Telegraf, Context } from 'telegraf';
import { getDb } from '../db/connection.js';
import { Owner, Subscription } from '../types/index.js';
import {
  createStripeCustomer,
  createSubscription as createStripeSub,
  cancelSubscription,
  updateSubscriptionQuantity,
  getSubscriptionStatus,
} from '../services/stripe.js';

const PRICE_PER_PROPERTY_CENTS = parseInt(process.env.PRICE_PER_PROPERTY_CENTS || '2999', 10);

export function registerPaymentHandlers(bot: Telegraf) {
  // Pre-checkout: MUST answer within 10 seconds -- do NO async work here
  bot.on('pre_checkout_query', async (ctx) => {
    await ctx.answerPreCheckoutQuery(true);
  });

  // Successful payment: create Stripe subscription + store locally
  bot.on('successful_payment', async (ctx) => {
    const payment = ctx.message.successful_payment;
    const payload = JSON.parse(payment.invoice_payload);
    const { ownerId, quantity } = payload as { ownerId: number; quantity: number };
    const db = getDb();

    try {
      // Check for existing subscription (idempotency guard)
      const existing = db.prepare(
        'SELECT * FROM subscriptions WHERE owner_id = ? AND status IN (?, ?)'
      ).get(ownerId, 'active', 'pending') as Subscription | undefined;
      if (existing) {
        await ctx.reply('You already have an active subscription!');
        return;
      }

      // Get owner for Stripe customer creation
      const owner = db.prepare('SELECT * FROM owners WHERE id = ?').get(ownerId) as Owner;

      // Create Stripe customer
      const customer = await createStripeCustomer(owner.first_name, {
        owner_id: owner.id,
        telegram_id: owner.telegram_id,
      });

      // Create Stripe subscription (will have status 'incomplete' due to payment_behavior: 'default_incomplete')
      const subscription = await createStripeSub(customer.id, quantity);

      // IMPORTANT: Store as 'active' in local DB, NOT subscription.status.
      // Stripe returns 'incomplete' because payment_behavior is 'default_incomplete' --
      // Stripe's PaymentIntent is separate from Telegram's payment flow.
      // Telegram's successful_payment event IS our billing source of truth.
      // The Stripe subscription is used for lifecycle management (quantity updates,
      // cancellation, period tracking), not as the payment gateway.
      const localStatus = 'active';

      // Period dates are on subscription items in newer Stripe API versions
      const item = subscription.items.data[0];
      db.prepare(`
        INSERT INTO subscriptions (owner_id, stripe_customer_id, stripe_subscription_id, status, quantity, current_period_start, current_period_end)
        VALUES (?, ?, ?, ?, ?, datetime(?, 'unixepoch'), datetime(?, 'unixepoch'))
      `).run(
        ownerId,
        customer.id,
        subscription.id,
        localStatus,
        quantity,
        item.current_period_start,
        item.current_period_end,
      );

      await ctx.reply(
        `Payment received! Your TextBud subscription is now active.\n\n` +
        `Properties: ${quantity}\n` +
        `Amount: $${((quantity * PRICE_PER_PROPERTY_CENTS) / 100).toFixed(2)}/month\n\n` +
        `Say "my plan" anytime to check your subscription status.`
      );
    } catch (err: any) {
      console.error('[PAYMENTS] Failed to create subscription:', err);
      await ctx.reply('Payment was received but there was an issue setting up your subscription. Please contact support.');
    }
  });
}

// Handle payment-related text messages in DM
export async function handlePaymentMessage(ctx: Context, owner: Owner): Promise<boolean> {
  const text = ((ctx.message as any)?.text || '').trim().toLowerCase();

  if (/\b(my plan|billing|subscription status)\b/i.test(text)) {
    return await handleStatus(ctx, owner);
  }

  if (/\b(cancel subscription|cancel my plan)\b/i.test(text)) {
    return await handleCancel(ctx, owner);
  }

  if (/\b(subscribe|start subscription)\b/i.test(text)) {
    return await handleSubscribe(ctx, owner);
  }

  return false;
}

async function handleSubscribe(ctx: Context, owner: Owner): Promise<boolean> {
  const db = getDb();

  // Check for existing active subscription
  const existing = db.prepare(
    'SELECT * FROM subscriptions WHERE owner_id = ? AND status IN (?, ?)'
  ).get(owner.id, 'active', 'trialing') as Subscription | undefined;
  if (existing) {
    await ctx.reply(
      `You already have an active subscription for ${existing.quantity} properties.\n` +
      `Say "my plan" to see details or "cancel subscription" to cancel.`
    );
    return true;
  }

  // Count owner's properties
  const propertyCount = (db.prepare(
    'SELECT COUNT(*) as count FROM properties WHERE owner_id = ? AND setup_complete = 1'
  ).get(owner.id) as { count: number }).count;

  if (propertyCount === 0) {
    await ctx.reply('You need at least one property set up before subscribing. Say "new property" to get started.');
    return true;
  }

  const totalCents = propertyCount * PRICE_PER_PROPERTY_CENTS;

  // Send Telegram Payment invoice
  await ctx.replyWithInvoice({
    title: 'TextBud Subscription',
    description: `${propertyCount} propert${propertyCount === 1 ? 'y' : 'ies'} x $${(PRICE_PER_PROPERTY_CENTS / 100).toFixed(2)}/month`,
    payload: JSON.stringify({ ownerId: owner.id, quantity: propertyCount }),
    provider_token: process.env.STRIPE_PROVIDER_TOKEN!,
    currency: 'USD',
    prices: [{ label: `${propertyCount} propert${propertyCount === 1 ? 'y' : 'ies'}`, amount: totalCents }],
  });

  return true;
}

async function handleStatus(ctx: Context, owner: Owner): Promise<boolean> {
  const db = getDb();
  const sub = db.prepare(
    'SELECT * FROM subscriptions WHERE owner_id = ? ORDER BY id DESC LIMIT 1'
  ).get(owner.id) as Subscription | undefined;

  if (!sub) {
    await ctx.reply("You don't have a subscription yet. Say 'subscribe' to get started.");
    return true;
  }

  // Fetch fresh data from Stripe if we have a subscription ID
  if (sub.stripe_subscription_id) {
    try {
      const stripeSub = await getSubscriptionStatus(sub.stripe_subscription_id);
      const item = stripeSub.items.data[0];
      // Update local DB with fresh Stripe data
      db.prepare(`
        UPDATE subscriptions
        SET status = ?, current_period_end = datetime(?, 'unixepoch'), cancel_at_period_end = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        sub.status === 'active' ? 'active' : stripeSub.status, // keep 'active' if locally active (Telegram is billing source of truth)
        item.current_period_end,
        stripeSub.cancel_at_period_end ? 1 : 0,
        sub.id,
      );
      // Update local values for display
      sub.current_period_end = new Date((item.current_period_end as number) * 1000).toISOString();
      sub.cancel_at_period_end = stripeSub.cancel_at_period_end ? 1 : 0;
    } catch (err) {
      console.error('[PAYMENTS] Failed to fetch Stripe subscription status:', err);
      // Continue with local data
    }
  }

  const monthlyCost = ((sub.quantity * PRICE_PER_PROPERTY_CENTS) / 100).toFixed(2);
  const nextBilling = sub.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Unknown';

  let message = `Your TextBud Plan:\n` +
    `Status: ${sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}\n` +
    `Properties: ${sub.quantity}\n` +
    `Monthly cost: $${monthlyCost}\n` +
    `Next billing: ${nextBilling}`;

  if (sub.cancel_at_period_end) {
    message += '\nCancels at end of billing period';
  } else {
    message += '\n\nSay "cancel subscription" to cancel.';
  }

  await ctx.reply(message);
  return true;
}

async function handleCancel(ctx: Context, owner: Owner): Promise<boolean> {
  const db = getDb();
  const sub = db.prepare(
    'SELECT * FROM subscriptions WHERE owner_id = ? AND status IN (?, ?) ORDER BY id DESC LIMIT 1'
  ).get(owner.id, 'active', 'trialing') as Subscription | undefined;

  if (!sub) {
    await ctx.reply("You don't have an active subscription to cancel.");
    return true;
  }

  if (sub.cancel_at_period_end) {
    await ctx.reply('Your subscription is already set to cancel at the end of the current billing period.');
    return true;
  }

  if (!sub.stripe_subscription_id) {
    await ctx.reply('Unable to cancel subscription. Please contact support.');
    return true;
  }

  try {
    const updated = await cancelSubscription(sub.stripe_subscription_id);
    const item = updated.items.data[0];
    db.prepare(
      "UPDATE subscriptions SET cancel_at_period_end = 1, status = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(sub.status, sub.id); // keep current status (active until period end)

    const periodEnd = sub.current_period_end
      ? new Date(sub.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'the end of your billing period';

    await ctx.reply(
      `Your subscription has been canceled. You'll keep access until ${periodEnd}. ` +
      `Say 'subscribe' anytime to resubscribe.`
    );
  } catch (err) {
    console.error('[PAYMENTS] Failed to cancel subscription:', err);
    await ctx.reply('There was an error canceling your subscription. Please try again or contact support.');
  }

  return true;
}

export async function syncSubscriptionQuantity(ownerId: number): Promise<void> {
  const db = getDb();
  const sub = db.prepare(
    'SELECT * FROM subscriptions WHERE owner_id = ? AND status IN (?, ?) AND cancel_at_period_end = 0'
  ).get(ownerId, 'active', 'trialing') as Subscription | undefined;
  if (!sub || !sub.stripe_subscription_id) return;

  const propertyCount = (db.prepare(
    'SELECT COUNT(*) as count FROM properties WHERE owner_id = ? AND setup_complete = 1'
  ).get(ownerId) as { count: number }).count;

  if (propertyCount === sub.quantity) return; // no change needed

  if (propertyCount === 0) {
    // No properties left -- cancel subscription
    await cancelSubscription(sub.stripe_subscription_id);
    db.prepare("UPDATE subscriptions SET cancel_at_period_end = 1, updated_at = datetime('now') WHERE id = ?").run(sub.id);
    return;
  }

  // Update quantity in Stripe
  await updateSubscriptionQuantity(sub.stripe_subscription_id, propertyCount);
  db.prepare(
    "UPDATE subscriptions SET quantity = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(propertyCount, sub.id);
}

export function getOwnerSubscription(ownerId: number): Subscription | undefined {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM subscriptions WHERE owner_id = ? ORDER BY id DESC LIMIT 1'
  ).get(ownerId) as Subscription | undefined;
}

export function hasActiveSubscription(ownerId: number): boolean {
  const db = getDb();
  const sub = db.prepare(
    'SELECT id FROM subscriptions WHERE owner_id = ? AND status IN (?, ?) AND current_period_end > datetime(?)'
  ).get(ownerId, 'active', 'trialing', new Date().toISOString());
  return !!sub;
}
