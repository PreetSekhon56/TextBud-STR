/**
 * PAY-01: Subscription initiation via Telegram Payments
 * PAY-02: Quantity-based billing (per-property pricing)
 * PAY-03: Owner can cancel subscription via text
 * PAY-04: Subscription status check
 *
 * These tests verify the payment handler logic with mocked DB and Stripe.
 */

// Mock DB
jest.mock('../../src/db/connection', () => {
  const mockDb = {
    prepare: jest.fn(),
    pragma: jest.fn(),
  };
  return {
    getDb: jest.fn(() => mockDb),
  };
});

// Mock Stripe service
jest.mock('../../src/services/stripe', () => ({
  createStripeCustomer: jest.fn(),
  createSubscription: jest.fn(),
  cancelSubscription: jest.fn(),
  updateSubscriptionQuantity: jest.fn(),
  getSubscriptionStatus: jest.fn(),
}));

// Mock bot.ts helpers
jest.mock('../../src/bot', () => ({
  isDM: jest.fn(),
  getOwnerByTelegramId: jest.fn(),
}));

import { getDb } from '../../src/db/connection';
import {
  handlePaymentMessage,
  syncSubscriptionQuantity,
  hasActiveSubscription,
  getOwnerSubscription,
} from '../../src/handlers/payments';
import {
  cancelSubscription,
  updateSubscriptionQuantity,
  getSubscriptionStatus,
} from '../../src/services/stripe';

const PRICE_PER_PROPERTY_CENTS = 2999;

function makeOwner(id = 1) {
  return { id, telegram_id: 123456, username: null, first_name: 'John', created_at: '' };
}

function makeSubscription(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    owner_id: 1,
    stripe_customer_id: 'cus_test',
    stripe_subscription_id: 'sub_test',
    status: 'active',
    quantity: 2,
    current_period_start: '2026-03-01T00:00:00',
    current_period_end: '2026-04-01T00:00:00',
    cancel_at_period_end: 0,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('Subscription Initiation (PAY-01)', () => {
  test('handlePaymentMessage routes subscribe intent correctly', async () => {
    const mockGet = jest.fn()
      .mockReturnValueOnce(undefined); // no existing subscription
    const mockGetCount = jest.fn().mockReturnValue({ count: 2 });
    const mockPrepare = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('subscriptions')) return { get: mockGet };
      if (sql.includes('COUNT')) return { get: mockGetCount };
      return { get: jest.fn() };
    });
    (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });

    const mockReplyWithInvoice = jest.fn();
    const ctx = {
      message: { text: 'subscribe' },
      reply: jest.fn(),
      replyWithInvoice: mockReplyWithInvoice,
    } as any;

    const owner = makeOwner();
    const handled = await handlePaymentMessage(ctx, owner);
    expect(handled).toBe(true);
    expect(mockReplyWithInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'TextBud Subscription',
        currency: 'USD',
      })
    );
  });

  test('subscribe blocks when owner already has active subscription', async () => {
    const mockGet = jest.fn().mockReturnValue(makeSubscription());
    const mockPrepare = jest.fn().mockReturnValue({ get: mockGet });
    (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });

    const mockReply = jest.fn();
    const ctx = {
      message: { text: 'subscribe' },
      reply: mockReply,
      replyWithInvoice: jest.fn(),
    } as any;

    const handled = await handlePaymentMessage(ctx, makeOwner());
    expect(handled).toBe(true);
    expect(mockReply).toHaveBeenCalledWith(
      expect.stringContaining('already have an active subscription')
    );
  });
});

describe('Per-Property Pricing (PAY-02)', () => {
  test('invoice amount is quantity * PRICE_PER_PROPERTY_CENTS', async () => {
    const mockGet = jest.fn().mockReturnValue(undefined);
    const mockGetCount = jest.fn().mockReturnValue({ count: 3 });
    const mockPrepare = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('subscriptions')) return { get: mockGet };
      if (sql.includes('COUNT')) return { get: mockGetCount };
      return { get: jest.fn() };
    });
    (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });

    const mockReplyWithInvoice = jest.fn();
    const ctx = {
      message: { text: 'start subscription' },
      reply: jest.fn(),
      replyWithInvoice: mockReplyWithInvoice,
    } as any;

    await handlePaymentMessage(ctx, makeOwner());

    const invoiceArg = mockReplyWithInvoice.mock.calls[0][0];
    expect(invoiceArg.prices[0].amount).toBe(3 * PRICE_PER_PROPERTY_CENTS);
  });

  test('syncSubscriptionQuantity updates Stripe when property count changes', async () => {
    const mockSub = makeSubscription({ quantity: 2 });
    const mockRun = jest.fn();
    const mockPrepare = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('subscriptions') && sql.includes('SELECT')) {
        return { get: jest.fn().mockReturnValue(mockSub) };
      }
      if (sql.includes('COUNT')) {
        return { get: jest.fn().mockReturnValue({ count: 3 }) };
      }
      // UPDATE and other statements
      return { run: mockRun, get: jest.fn() };
    });
    (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });
    (updateSubscriptionQuantity as jest.Mock).mockResolvedValue({});

    await syncSubscriptionQuantity(1);
    expect(updateSubscriptionQuantity).toHaveBeenCalledWith('sub_test', 3);
  });
});

describe('Cancel Subscription (PAY-03)', () => {
  test('owner can cancel subscription via text command', async () => {
    const mockSub = makeSubscription();
    const mockGet = jest.fn().mockReturnValue(mockSub);
    const mockRun = jest.fn();
    const mockPrepare = jest.fn().mockReturnValue({ get: mockGet, run: mockRun });
    (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });

    (cancelSubscription as jest.Mock).mockResolvedValue({
      id: 'sub_test',
      cancel_at_period_end: true,
      items: { data: [{ current_period_end: 1711929600 }] },
    });

    const mockReply = jest.fn();
    const ctx = {
      message: { text: 'cancel subscription' },
      reply: mockReply,
    } as any;

    const handled = await handlePaymentMessage(ctx, makeOwner());
    expect(handled).toBe(true);
    expect(cancelSubscription).toHaveBeenCalledWith('sub_test');
    expect(mockReply).toHaveBeenCalledWith(
      expect.stringContaining('canceled')
    );
  });

  test('cancel fails gracefully when no active subscription', async () => {
    const mockGet = jest.fn().mockReturnValue(undefined);
    const mockPrepare = jest.fn().mockReturnValue({ get: mockGet });
    (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });

    const mockReply = jest.fn();
    const ctx = {
      message: { text: 'cancel subscription' },
      reply: mockReply,
    } as any;

    const handled = await handlePaymentMessage(ctx, makeOwner());
    expect(handled).toBe(true);
    expect(mockReply).toHaveBeenCalledWith(
      expect.stringContaining("don't have an active subscription")
    );
  });

  test('already-canceling subscription shows informative message', async () => {
    const mockSub = makeSubscription({ cancel_at_period_end: 1 });
    const mockGet = jest.fn().mockReturnValue(mockSub);
    const mockPrepare = jest.fn().mockReturnValue({ get: mockGet });
    (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });

    const mockReply = jest.fn();
    const ctx = {
      message: { text: 'cancel subscription' },
      reply: mockReply,
    } as any;

    const handled = await handlePaymentMessage(ctx, makeOwner());
    expect(handled).toBe(true);
    expect(mockReply).toHaveBeenCalledWith(
      expect.stringContaining('already set to cancel')
    );
  });
});

describe('Subscription Status (PAY-04)', () => {
  test('my plan command shows subscription details', async () => {
    const mockSub = makeSubscription();
    const mockGet = jest.fn().mockReturnValue(mockSub);
    const mockRun = jest.fn();
    const mockPrepare = jest.fn().mockReturnValue({ get: mockGet, run: mockRun });
    (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });

    (getSubscriptionStatus as jest.Mock).mockResolvedValue({
      status: 'active',
      cancel_at_period_end: false,
      items: { data: [{ current_period_end: 1711929600 }] },
    });

    const mockReply = jest.fn();
    const ctx = {
      message: { text: 'my plan' },
      reply: mockReply,
    } as any;

    const handled = await handlePaymentMessage(ctx, makeOwner());
    expect(handled).toBe(true);
    const message = mockReply.mock.calls[0][0];
    expect(message).toContain('TextBud Plan');
    expect(message).toContain('Active');
    expect(message).toContain('Properties: 2');
  });

  test('no subscription shows subscribe prompt', async () => {
    const mockGet = jest.fn().mockReturnValue(undefined);
    const mockPrepare = jest.fn().mockReturnValue({ get: mockGet });
    (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });

    const mockReply = jest.fn();
    const ctx = {
      message: { text: 'my plan' },
      reply: mockReply,
    } as any;

    const handled = await handlePaymentMessage(ctx, makeOwner());
    expect(handled).toBe(true);
    expect(mockReply).toHaveBeenCalledWith(
      expect.stringContaining('subscribe')
    );
  });

  test('hasActiveSubscription returns true for active sub within period', () => {
    const mockGet = jest.fn().mockReturnValue({ id: 1 });
    const mockPrepare = jest.fn().mockReturnValue({ get: mockGet });
    (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });

    expect(hasActiveSubscription(1)).toBe(true);
  });

  test('hasActiveSubscription returns false when no sub exists', () => {
    const mockGet = jest.fn().mockReturnValue(undefined);
    const mockPrepare = jest.fn().mockReturnValue({ get: mockGet });
    (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });

    expect(hasActiveSubscription(1)).toBe(false);
  });

  test('getOwnerSubscription returns subscription record', () => {
    const mockSub = makeSubscription();
    const mockGet = jest.fn().mockReturnValue(mockSub);
    const mockPrepare = jest.fn().mockReturnValue({ get: mockGet });
    (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });

    const result = getOwnerSubscription(1);
    expect(result).toEqual(mockSub);
  });

  test('unrecognized payment text returns false', async () => {
    const ctx = {
      message: { text: 'hello there' },
      reply: jest.fn(),
    } as any;

    const handled = await handlePaymentMessage(ctx, makeOwner());
    expect(handled).toBe(false);
  });
});
