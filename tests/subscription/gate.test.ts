/**
 * Phase 6 — Subscription Enforcement & Cleanup
 * Tests for: hasActiveSubscription gate logic, ESM imports in index.ts, dead import removal
 * Requirements: PAY-01 (subscription gates premium features)
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let testDb: Database.Database;

jest.mock('../../src/db/connection', () => ({
  getDb: () => testDb,
  closeDb: () => { if (testDb) testDb.close(); },
}));

jest.mock('telegraf', () => ({
  Telegraf: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    use: jest.fn(),
    start: jest.fn(),
    launch: jest.fn(),
    catch: jest.fn(),
  })),
  Context: {},
}));

jest.mock('telegraf/filters', () => ({
  message: jest.fn(() => 'text'),
}));

// Mock stripe service to avoid real Stripe calls
jest.mock('../../src/services/stripe', () => ({
  createStripeCustomer: jest.fn(),
  createSubscription: jest.fn(),
  cancelSubscription: jest.fn(),
  updateSubscriptionQuantity: jest.fn(),
  getSubscriptionStatus: jest.fn(),
}));

import { hasActiveSubscription } from '../../src/handlers/payments';

function initTestDb(): void {
  const migrationsDir = path.join(__dirname, '..', '..', 'src', 'db', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    const statements = sql.split(/;\s*\n/).filter(s => s.trim().length > 0);
    for (const stmt of statements) {
      try {
        testDb.exec(stmt + ';');
      } catch (err: any) {
        if (err.message && err.message.includes('duplicate column')) continue;
        throw err;
      }
    }
  }
}

function seedOwner(): number {
  testDb.prepare('INSERT INTO owners (telegram_id, username, first_name) VALUES (?, ?, ?)').run(11111, 'owner', 'Owner');
  return (testDb.prepare('SELECT id FROM owners WHERE telegram_id = 11111').get() as any).id;
}

beforeEach(() => {
  testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  initTestDb();
});

afterEach(() => {
  if (testDb) testDb.close();
});

describe('Phase 6 — hasActiveSubscription gate (PAY-01)', () => {
  test('returns false when owner has no subscription', () => {
    const ownerId = seedOwner();
    expect(hasActiveSubscription(ownerId)).toBe(false);
  });

  test('returns true when owner has active subscription with future period_end', () => {
    const ownerId = seedOwner();
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    testDb.prepare(`
      INSERT INTO subscriptions (owner_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, quantity)
      VALUES (?, ?, ?, 'active', ?, 1)
    `).run(ownerId, 'cus_test', 'sub_test', futureDate);

    expect(hasActiveSubscription(ownerId)).toBe(true);
  });

  test('returns true when owner has trialing subscription with future period_end', () => {
    const ownerId = seedOwner();
    const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    testDb.prepare(`
      INSERT INTO subscriptions (owner_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, quantity)
      VALUES (?, ?, ?, 'trialing', ?, 1)
    `).run(ownerId, 'cus_test', 'sub_test', futureDate);

    expect(hasActiveSubscription(ownerId)).toBe(true);
  });

  test('returns false when subscription is cancelled', () => {
    const ownerId = seedOwner();
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    testDb.prepare(`
      INSERT INTO subscriptions (owner_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, quantity)
      VALUES (?, ?, ?, 'canceled', ?, 1)
    `).run(ownerId, 'cus_test', 'sub_test', futureDate);

    expect(hasActiveSubscription(ownerId)).toBe(false);
  });

  test('returns false when subscription period_end is in the past', () => {
    const ownerId = seedOwner();
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    testDb.prepare(`
      INSERT INTO subscriptions (owner_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, quantity)
      VALUES (?, ?, ?, 'active', ?, 1)
    `).run(ownerId, 'cus_test', 'sub_test', pastDate);

    expect(hasActiveSubscription(ownerId)).toBe(false);
  });
});

describe('Phase 6 — Subscription gate in DM router (PAY-01)', () => {
  test('bot.ts subscription gate code exists with hasActiveSubscription import', () => {
    const botSource = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'bot.ts'), 'utf-8'
    );

    // Verify hasActiveSubscription is imported
    expect(botSource).toContain('hasActiveSubscription');

    // Verify the subscription gate block exists
    expect(botSource).toContain('!hasActiveSubscription(owner.id)');

    // Verify billing commands are whitelisted
    expect(botSource).toMatch(/subscribe|subscription|billing|my plan/);

    // Verify manage triggers are whitelisted
    expect(botSource).toContain('isManageTrigger(text)');

    // Verify the gated message is present
    expect(botSource).toContain('You need an active subscription to use this feature');
  });
});

describe('Phase 6 — Dead imports removed (cleanup)', () => {
  test('bot.ts does not import reloadActiveSessions', () => {
    const botSource = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'bot.ts'), 'utf-8'
    );
    // reloadActiveSessions should NOT be in bot.ts imports
    expect(botSource).not.toMatch(/import.*reloadActiveSessions.*from.*cleaning/);
  });

  test('setup-review.ts does not import syncSubscriptionQuantity', () => {
    const reviewSource = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'handlers', 'setup-review.ts'), 'utf-8'
    );
    expect(reviewSource).not.toMatch(/import.*syncSubscriptionQuantity.*from.*payments/);
  });

  test('index.ts uses no require() calls', () => {
    const indexSource = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'index.ts'), 'utf-8'
    );
    expect(indexSource).not.toMatch(/require\s*\(/);
  });
});
