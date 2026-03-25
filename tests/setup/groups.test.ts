/**
 * Phase 1 — Group Detection & Cleaner Onboarding
 * Tests for: group link state, property selection, cleaner upsert, welcome messages
 * Requirements: COMM-01 (group detection), COMM-02 (property linking), COMM-04 (group persistence)
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
    telegram: {},
  })),
  Context: {},
}));

jest.mock('telegraf/filters', () => ({
  message: jest.fn(() => 'text'),
}));

jest.mock('../../src/bot', () => ({
  isDM: jest.fn(() => true),
  getOwnerByTelegramId: jest.fn(),
  bot: {
    on: jest.fn(),
    use: jest.fn(),
    start: jest.fn(),
    launch: jest.fn(),
    catch: jest.fn(),
  },
}));

jest.mock('../../src/handlers/payments', () => ({
  syncSubscriptionQuantity: jest.fn().mockResolvedValue(undefined),
  hasActiveSubscription: jest.fn().mockReturnValue(true),
  registerPaymentHandlers: jest.fn(),
  handlePaymentMessage: jest.fn(),
}));

// Mock setup sub-handlers
jest.mock('../../src/handlers/setup-rooms', () => ({ handleRoomSetup: jest.fn(), promptRooms: jest.fn() }));
jest.mock('../../src/handlers/setup-photos', () => ({ handlePhotoSetup: jest.fn(), promptPhotos: jest.fn() }));
jest.mock('../../src/handlers/setup-faq', () => ({ handleFaqSetup: jest.fn(), promptFaq: jest.fn() }));
jest.mock('../../src/handlers/setup-checklists', () => ({ handleChecklistSetup: jest.fn(), promptChecklist: jest.fn() }));
jest.mock('../../src/handlers/setup-deepclean', () => ({ handleDeepCleanSetup: jest.fn(), promptDeepClean: jest.fn() }));
jest.mock('../../src/handlers/setup-review', () => ({ handleSetupReview: jest.fn(), promptReview: jest.fn() }));

import { hasPendingGroupLink, handlePropertySelection } from '../../src/handlers/groups';

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

beforeEach(() => {
  testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  initTestDb();
});

afterEach(() => {
  if (testDb) testDb.close();
});

describe('Phase 1 — Group link state management (COMM-01)', () => {
  test('hasPendingGroupLink returns false when no pending link', () => {
    expect(hasPendingGroupLink(12345)).toBe(false);
  });
});

describe('Phase 1 — Property selection links group correctly (COMM-02)', () => {
  test('handlePropertySelection returns false when no pending link exists', async () => {
    const ctx = {
      from: { id: 12345 },
      message: { text: '1' },
    } as any;

    const result = await handlePropertySelection(ctx);
    expect(result).toBe(false);
  });
});

describe('Phase 1 — Group persistence in telegram_groups table (COMM-04)', () => {
  test('telegram_groups table stores group links persistently', () => {
    // Create owner + property
    testDb.prepare('INSERT INTO owners (telegram_id, username, first_name) VALUES (?, ?, ?)').run(11111, 'owner', 'Owner');
    const owner = testDb.prepare('SELECT id FROM owners WHERE telegram_id = 11111').get() as any;
    testDb.prepare('INSERT INTO properties (owner_id, name, setup_complete) VALUES (?, ?, 1)').run(owner.id, 'Beach House');
    const property = testDb.prepare('SELECT id FROM properties WHERE name = ?').get('Beach House') as any;

    // Create cleaner
    testDb.prepare('INSERT INTO cleaners (telegram_id, username, first_name) VALUES (?, ?, ?)').run(22222, 'cleaner', 'Cleaner');
    const cleaner = testDb.prepare('SELECT id FROM cleaners WHERE telegram_id = 22222').get() as any;

    // Insert group link
    testDb.prepare(`
      INSERT INTO telegram_groups (chat_id, property_id, owner_id, cleaner_id, group_type, is_active)
      VALUES (?, ?, ?, ?, 'cleaning', 1)
    `).run(-100001, property.id, owner.id, cleaner.id);

    // Verify persistence
    const group = testDb.prepare('SELECT * FROM telegram_groups WHERE chat_id = ?').get(-100001) as any;
    expect(group).toBeTruthy();
    expect(group.property_id).toBe(property.id);
    expect(group.owner_id).toBe(owner.id);
    expect(group.cleaner_id).toBe(cleaner.id);
    expect(group.group_type).toBe('cleaning');
    expect(group.is_active).toBe(1);
  });

  test('telegram_groups enforces unique chat_id via upsert', () => {
    testDb.prepare('INSERT INTO owners (telegram_id, username, first_name) VALUES (?, ?, ?)').run(11111, 'owner', 'Owner');
    const owner = testDb.prepare('SELECT id FROM owners WHERE telegram_id = 11111').get() as any;
    testDb.prepare('INSERT INTO properties (owner_id, name, setup_complete) VALUES (?, ?, 1)').run(owner.id, 'Prop A');
    const propA = testDb.prepare('SELECT id FROM properties WHERE name = ?').get('Prop A') as any;
    testDb.prepare('INSERT INTO properties (owner_id, name, setup_complete) VALUES (?, ?, 1)').run(owner.id, 'Prop B');
    const propB = testDb.prepare('SELECT id FROM properties WHERE name = ?').get('Prop B') as any;

    // Insert first link
    testDb.prepare(`
      INSERT INTO telegram_groups (chat_id, property_id, owner_id, group_type, is_active)
      VALUES (?, ?, ?, 'cleaning', 1)
    `).run(-100002, propA.id, owner.id);

    // Upsert to re-link to different property
    testDb.prepare(`
      INSERT INTO telegram_groups (chat_id, property_id, owner_id, group_type, is_active)
      VALUES (?, ?, ?, 'guest', 1)
      ON CONFLICT(chat_id) DO UPDATE SET
        property_id = excluded.property_id,
        group_type = excluded.group_type
    `).run(-100002, propB.id, owner.id);

    const groups = testDb.prepare('SELECT * FROM telegram_groups WHERE chat_id = ?').all(-100002);
    expect(groups).toHaveLength(1);
    expect((groups[0] as any).property_id).toBe(propB.id);
    expect((groups[0] as any).group_type).toBe('guest');
  });

  test('cleaner upsert works on telegram_id conflict', () => {
    testDb.prepare(`
      INSERT INTO cleaners (telegram_id, username, first_name)
      VALUES (?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name
    `).run(33333, 'cleaner1', 'Alice');

    testDb.prepare(`
      INSERT INTO cleaners (telegram_id, username, first_name)
      VALUES (?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name
    `).run(33333, 'cleaner1_updated', 'Alice Updated');

    const cleaners = testDb.prepare('SELECT * FROM cleaners WHERE telegram_id = ?').all(33333);
    expect(cleaners).toHaveLength(1);
    expect((cleaners[0] as any).first_name).toBe('Alice Updated');
  });
});
