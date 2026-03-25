/**
 * Phase 1 — Foundation & Property Setup
 * Tests for: setup session management, manage triggers, property context
 * Requirements: PROP-01 (DB schema), PROP-02 (owner registration), PROP-07 (multi-property), COMM-03 (manage triggers)
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// We need to mock getDb before importing modules that use it
let testDb: Database.Database;

jest.mock('../../src/db/connection', () => ({
  getDb: () => testDb,
  closeDb: () => { if (testDb) testDb.close(); },
}));

// Mock telegraf to avoid bot instantiation
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

// Mock telegraf/filters
jest.mock('telegraf/filters', () => ({
  message: jest.fn(() => 'text'),
}));

// Mock the bot module to avoid circular deps and Telegraf instantiation
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

// Mock payments to avoid stripe dependency
jest.mock('../../src/handlers/payments', () => ({
  syncSubscriptionQuantity: jest.fn().mockResolvedValue(undefined),
  hasActiveSubscription: jest.fn().mockReturnValue(true),
  registerPaymentHandlers: jest.fn(),
  handlePaymentMessage: jest.fn(),
}));

// Mock setup sub-handlers to avoid deep import chains
jest.mock('../../src/handlers/setup-rooms', () => ({
  handleRoomSetup: jest.fn(),
  promptRooms: jest.fn(),
}));
jest.mock('../../src/handlers/setup-photos', () => ({
  handlePhotoSetup: jest.fn(),
  promptPhotos: jest.fn(),
}));
jest.mock('../../src/handlers/setup-faq', () => ({
  handleFaqSetup: jest.fn(),
  promptFaq: jest.fn(),
}));
jest.mock('../../src/handlers/setup-checklists', () => ({
  handleChecklistSetup: jest.fn(),
  promptChecklist: jest.fn(),
}));
jest.mock('../../src/handlers/setup-deepclean', () => ({
  handleDeepCleanSetup: jest.fn(),
  promptDeepClean: jest.fn(),
}));
jest.mock('../../src/handlers/setup-review', () => ({
  handleSetupReview: jest.fn(),
  promptReview: jest.fn(),
}));

import {
  getActiveSession,
  advanceSession,
  completeSession,
} from '../../src/handlers/setup';

import {
  isManageTrigger,
  getActivePropertyId,
  setActivePropertyId,
} from '../../src/handlers/manage';

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

describe('Phase 1 — Database schema creates all required tables (PROP-01)', () => {
  test('initDb creates all 10 core tables', () => {
    const tables = testDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all() as { name: string }[];

    const tableNames = tables.map(t => t.name);

    const expectedCoreTables = [
      'checklist_items', 'checklists', 'cleaners', 'faq_entries',
      'owners', 'properties', 'rooms', 'setup_sessions',
      'staging_photos', 'telegram_groups',
    ];

    for (const table of expectedCoreTables) {
      expect(tableNames).toContain(table);
    }
  });

  test('foreign_keys pragma is enabled', () => {
    const result = testDb.pragma('foreign_keys') as { foreign_keys: number }[];
    expect((result[0] as any).foreign_keys).toBe(1);
  });
});

describe('Phase 1 — Owner registration via /start (PROP-02)', () => {
  test('owner upsert inserts new owner', () => {
    testDb.prepare(`
      INSERT INTO owners (telegram_id, username, first_name)
      VALUES (?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name
    `).run(12345, 'testuser', 'Test');

    const owner = testDb.prepare('SELECT * FROM owners WHERE telegram_id = ?').get(12345) as any;
    expect(owner).toBeTruthy();
    expect(owner.first_name).toBe('Test');
    expect(owner.username).toBe('testuser');
  });

  test('owner upsert updates existing owner', () => {
    testDb.prepare('INSERT INTO owners (telegram_id, username, first_name) VALUES (?, ?, ?)').run(12345, 'old', 'Old');
    testDb.prepare(`
      INSERT INTO owners (telegram_id, username, first_name)
      VALUES (?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name
    `).run(12345, 'newuser', 'New');

    const owner = testDb.prepare('SELECT * FROM owners WHERE telegram_id = ?').get(12345) as any;
    expect(owner.first_name).toBe('New');
    expect(owner.username).toBe('newuser');
  });
});

describe('Phase 1 — Setup session management (PROP-03 through PROP-06)', () => {
  let ownerId: number;
  let propertyId: number;
  let sessionId: number;

  beforeEach(() => {
    testDb.prepare('INSERT INTO owners (telegram_id, username, first_name) VALUES (?, ?, ?)').run(99999, 'owner', 'Owner');
    ownerId = (testDb.prepare('SELECT id FROM owners WHERE telegram_id = 99999').get() as any).id;

    testDb.prepare('INSERT INTO properties (owner_id, name, setup_step) VALUES (?, ?, ?)').run(ownerId, 'Test Property', 'rooms');
    propertyId = Number(testDb.prepare('SELECT last_insert_rowid() as id').get()!['id' as keyof typeof Object]);

    const propRow = testDb.prepare('SELECT id FROM properties WHERE owner_id = ?').get(ownerId) as any;
    propertyId = propRow.id;

    testDb.prepare('INSERT INTO setup_sessions (owner_id, property_id, current_step) VALUES (?, ?, ?)').run(ownerId, propertyId, 'rooms');
    const sessRow = testDb.prepare('SELECT id FROM setup_sessions WHERE owner_id = ?').get(ownerId) as any;
    sessionId = sessRow.id;
  });

  test('getActiveSession returns active session for owner with incomplete property', () => {
    const session = getActiveSession(ownerId);
    expect(session).not.toBeNull();
    expect(session!.current_step).toBe('rooms');
    expect(session!.property_id).toBe(propertyId);
  });

  test('getActiveSession returns null when no session exists', () => {
    const session = getActiveSession(999999);
    expect(session).toBeNull();
  });

  test('getActiveSession returns null after property is marked complete', () => {
    testDb.prepare('UPDATE properties SET setup_complete = 1 WHERE id = ?').run(propertyId);
    const session = getActiveSession(ownerId);
    expect(session).toBeNull();
  });

  test('advanceSession updates current_step', () => {
    advanceSession(sessionId, 'photos');
    const session = testDb.prepare('SELECT * FROM setup_sessions WHERE id = ?').get(sessionId) as any;
    expect(session.current_step).toBe('photos');
    expect(session.current_room_index).toBeNull();
  });

  test('completeSession marks property as complete and deletes session', () => {
    completeSession(sessionId, propertyId);

    const property = testDb.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId) as any;
    expect(property.setup_complete).toBe(1);
    expect(property.setup_step).toBeNull();

    const session = testDb.prepare('SELECT * FROM setup_sessions WHERE id = ?').get(sessionId);
    expect(session).toBeUndefined();
  });
});

describe('Phase 1 — Multi-property management triggers (PROP-07, COMM-03)', () => {
  test('isManageTrigger matches "my properties"', () => {
    expect(isManageTrigger('my properties')).toBe(true);
  });

  test('isManageTrigger matches "properties"', () => {
    expect(isManageTrigger('properties')).toBe(true);
  });

  test('isManageTrigger matches "list properties"', () => {
    expect(isManageTrigger('list properties')).toBe(true);
  });

  test('isManageTrigger is case insensitive', () => {
    expect(isManageTrigger('My Properties')).toBe(true);
    expect(isManageTrigger('MY PROPERTIES')).toBe(true);
  });

  test('isManageTrigger rejects non-matching text', () => {
    expect(isManageTrigger('hello')).toBe(false);
    expect(isManageTrigger('new property')).toBe(false);
    expect(isManageTrigger('edit property')).toBe(false);
  });

  test('setActivePropertyId and getActivePropertyId manage active property context', () => {
    // Insert owner + property so default lookup works
    testDb.prepare('INSERT INTO owners (telegram_id, username, first_name) VALUES (?, ?, ?)').run(11111, 'test', 'Test');
    const owner = testDb.prepare('SELECT id FROM owners WHERE telegram_id = 11111').get() as any;
    testDb.prepare('INSERT INTO properties (owner_id, name, setup_complete) VALUES (?, ?, 1)').run(owner.id, 'Prop A');
    const propA = testDb.prepare('SELECT id FROM properties WHERE name = ?').get('Prop A') as any;
    testDb.prepare('INSERT INTO properties (owner_id, name, setup_complete) VALUES (?, ?, 1)').run(owner.id, 'Prop B');
    const propB = testDb.prepare('SELECT id FROM properties WHERE name = ?').get('Prop B') as any;

    // Default should return first property
    const defaultId = getActivePropertyId(11111);
    expect(defaultId).toBe(propA.id);

    // Switch to Prop B
    setActivePropertyId(11111, propB.id);
    expect(getActivePropertyId(11111)).toBe(propB.id);
  });

  test('getActivePropertyId returns null for unknown owner', () => {
    expect(getActivePropertyId(999999)).toBeNull();
  });
});
