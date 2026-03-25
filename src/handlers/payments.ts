import { Telegraf, Context } from 'telegraf';
import { getDb } from '../db/connection.js';
import { Owner, Subscription } from '../types/index.js';
import { createStripeCustomer, createSubscription as createStripeSub } from '../services/stripe.js';

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

  if (/\b(subscribe|start subscription)\b/i.test(text)) {
    return await handleSubscribe(ctx, owner);
  }

  return false; // not handled -- Plan 02 adds status/cancel
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
