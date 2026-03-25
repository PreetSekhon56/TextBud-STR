import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return stripeClient;
}

export async function createStripeCustomer(ownerName: string, metadata: { owner_id: number; telegram_id: number }): Promise<Stripe.Customer> {
  const stripe = getStripeClient();
  return stripe.customers.create({
    name: ownerName,
    metadata: { owner_id: String(metadata.owner_id), telegram_id: String(metadata.telegram_id) },
  });
}

export async function createSubscription(customerId: string, quantity: number): Promise<Stripe.Subscription> {
  const stripe = getStripeClient();
  return stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: process.env.STRIPE_PRICE_ID!, quantity }],
    payment_behavior: 'default_incomplete',
  });
}

export async function updateSubscriptionQuantity(subscriptionId: string, newQuantity: number): Promise<Stripe.Subscription> {
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return stripe.subscriptions.update(subscriptionId, {
    items: [{ id: subscription.items.data[0].id, quantity: newQuantity }],
    proration_behavior: 'create_prorations',
  });
}

export async function cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  const stripe = getStripeClient();
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

export async function getSubscriptionStatus(subscriptionId: string): Promise<Stripe.Subscription> {
  const stripe = getStripeClient();
  return stripe.subscriptions.retrieve(subscriptionId);
}
