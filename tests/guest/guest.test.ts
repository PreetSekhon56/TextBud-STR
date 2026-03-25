/**
 * Phase 4 — Guest Support
 * Tests for: FAQ matching, guest message handling, interaction logging, owner notification
 * Requirements: GUEST-01 (instant FAQ answers), GUEST-02 (interaction logging), GUEST-03 (owner FAQ addition)
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let testDb: Database.Database;

jest.mock('../../src/db/connection', () => ({
  getDb: () => testDb,
  closeDb: () => { if (testDb) testDb.close(); },
}));

// Mock the faq-matcher service (Claude AI) -- avoid real API calls
const mockMatchFaq = jest.fn();
jest.mock('../../src/services/faq-matcher', () => ({
  matchFaq: (...args: any[]) => mockMatchFaq(...args),
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

import { handleGuestMessage, pendingFaqAdditions } from '../../src/handlers/guest';
import { FaqMatchResult } from '../../src/services/faq-matcher';

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

function seedGuestTestData() {
  testDb.prepare('INSERT INTO owners (telegram_id, username, first_name) VALUES (?, ?, ?)').run(11111, 'owner', 'Owner');
  const owner = testDb.prepare('SELECT id FROM owners WHERE telegram_id = 11111').get() as any;

  testDb.prepare('INSERT INTO properties (owner_id, name, setup_complete) VALUES (?, ?, 1)').run(owner.id, 'Beach House');
  const property = testDb.prepare('SELECT id FROM properties WHERE name = ?').get('Beach House') as any;

  // Insert guest group
  testDb.prepare(`
    INSERT INTO telegram_groups (chat_id, property_id, owner_id, group_type, is_active)
    VALUES (?, ?, ?, 'guest', 1)
  `).run(-200001, property.id, owner.id);

  // Insert FAQ entries
  testDb.prepare(`INSERT INTO faq_entries (property_id, category, question, answer) VALUES (?, ?, ?, ?)`).run(
    property.id, 'wifi', 'What is the WiFi password?', 'Network: BeachHouse5G, Password: sun1234'
  );
  testDb.prepare(`INSERT INTO faq_entries (property_id, category, question, answer) VALUES (?, ?, ?, ?)`).run(
    property.id, 'parking', 'Where do I park?', 'Use the driveway. Spot #3 is yours.'
  );

  return { ownerId: owner.id, propertyId: property.id };
}

function createMockCtx(text: string, fromId: number, chatId: number, firstName = 'Guest') {
  const replyFn = jest.fn().mockResolvedValue(undefined);
  const sendMessageFn = jest.fn().mockResolvedValue(undefined);

  return {
    message: { text, message_id: 1 },
    from: { id: fromId, first_name: firstName },
    chat: { id: chatId, type: 'group' },
    reply: replyFn,
    telegram: { sendMessage: sendMessageFn },
    _replyFn: replyFn,
    _sendMessageFn: sendMessageFn,
  } as any;
}

beforeEach(() => {
  testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  initTestDb();
  mockMatchFaq.mockReset();
  pendingFaqAdditions.clear();
});

afterEach(() => {
  if (testDb) testDb.close();
});

describe('Phase 4 — Guest gets instant FAQ answer (GUEST-01)', () => {
  test('guest question matched to FAQ returns answer in group', async () => {
    const { propertyId } = seedGuestTestData();

    mockMatchFaq.mockResolvedValue({
      matched: true,
      answer: 'The WiFi network is BeachHouse5G and the password is sun1234!',
      matchedFaqId: 1,
      confidence: 'high',
    } as FaqMatchResult);

    const group = testDb.prepare('SELECT * FROM telegram_groups WHERE chat_id = -200001').get() as any;
    const ctx = createMockCtx('What is the wifi password?', 55555, -200001);

    await handleGuestMessage(ctx, group);

    // Should reply with the matched answer
    expect(ctx._replyFn).toHaveBeenCalledWith(
      'The WiFi network is BeachHouse5G and the password is sun1234!',
      expect.objectContaining({ reply_parameters: { message_id: 1 } })
    );
  });

  test('unmatched question sends "checking with owner" reply', async () => {
    seedGuestTestData();

    mockMatchFaq.mockResolvedValue({
      matched: false,
      answer: null,
      matchedFaqId: null,
      confidence: 'none',
    } as FaqMatchResult);

    const group = testDb.prepare('SELECT * FROM telegram_groups WHERE chat_id = -200001').get() as any;
    const ctx = createMockCtx('Where is the nearest grocery store?', 55555, -200001);

    await handleGuestMessage(ctx, group);

    expect(ctx._replyFn).toHaveBeenCalledWith(
      expect.stringContaining('check with the property owner'),
      expect.anything()
    );
  });

  test('owner messages in guest group are ignored', async () => {
    seedGuestTestData();

    const group = testDb.prepare('SELECT * FROM telegram_groups WHERE chat_id = -200001').get() as any;
    // Owner's telegram_id is 11111
    const ctx = createMockCtx('Hello everyone', 11111, -200001);

    await handleGuestMessage(ctx, group);

    expect(ctx._replyFn).not.toHaveBeenCalled();
    expect(mockMatchFaq).not.toHaveBeenCalled();
  });

  test('slash commands in guest group are ignored', async () => {
    seedGuestTestData();

    const group = testDb.prepare('SELECT * FROM telegram_groups WHERE chat_id = -200001').get() as any;
    const ctx = createMockCtx('/start', 55555, -200001);

    await handleGuestMessage(ctx, group);

    expect(ctx._replyFn).not.toHaveBeenCalled();
    expect(mockMatchFaq).not.toHaveBeenCalled();
  });
});

describe('Phase 4 — Guest interactions are logged (GUEST-02)', () => {
  test('matched question is logged with was_answered = 1', async () => {
    const { propertyId } = seedGuestTestData();

    mockMatchFaq.mockResolvedValue({
      matched: true,
      answer: 'Spot #3 in the driveway.',
      matchedFaqId: 2,
      confidence: 'high',
    } as FaqMatchResult);

    const group = testDb.prepare('SELECT * FROM telegram_groups WHERE chat_id = -200001').get() as any;
    const ctx = createMockCtx('Where do I park?', 55555, -200001);

    await handleGuestMessage(ctx, group);

    const interaction = testDb.prepare('SELECT * FROM guest_interactions WHERE guest_telegram_id = 55555').get() as any;
    expect(interaction).toBeTruthy();
    expect(interaction.question).toBe('Where do I park?');
    expect(interaction.was_answered).toBe(1);
    expect(interaction.matched_faq_id).toBe(2);
    expect(interaction.property_id).toBe(propertyId);
  });

  test('unmatched question is logged with was_answered = 0', async () => {
    seedGuestTestData();

    mockMatchFaq.mockResolvedValue({
      matched: false,
      answer: null,
      matchedFaqId: null,
      confidence: 'none',
    } as FaqMatchResult);

    const group = testDb.prepare('SELECT * FROM telegram_groups WHERE chat_id = -200001').get() as any;
    const ctx = createMockCtx('Is there a pool?', 55555, -200001);

    await handleGuestMessage(ctx, group);

    const interaction = testDb.prepare('SELECT * FROM guest_interactions WHERE guest_telegram_id = 55555').get() as any;
    expect(interaction).toBeTruthy();
    expect(interaction.question).toBe('Is there a pool?');
    expect(interaction.was_answered).toBe(0);
    expect(interaction.matched_faq_id).toBeNull();
  });
});

describe('Phase 4 — Owner notified and can add FAQ (GUEST-03)', () => {
  test('unmatched question notifies owner via DM', async () => {
    seedGuestTestData();

    mockMatchFaq.mockResolvedValue({
      matched: false,
      answer: null,
      matchedFaqId: null,
      confidence: 'none',
    } as FaqMatchResult);

    const group = testDb.prepare('SELECT * FROM telegram_groups WHERE chat_id = -200001').get() as any;
    const ctx = createMockCtx('Where is the nearest grocery store?', 55555, -200001, 'John');

    await handleGuestMessage(ctx, group);

    // Owner should be DM'd (telegram_id 11111)
    expect(ctx._sendMessageFn).toHaveBeenCalledWith(
      11111,
      expect.stringContaining('asked a question')
    );
  });

  test('unmatched question stores pending FAQ addition for owner', async () => {
    seedGuestTestData();

    mockMatchFaq.mockResolvedValue({
      matched: false,
      answer: null,
      matchedFaqId: null,
      confidence: 'none',
    } as FaqMatchResult);

    const group = testDb.prepare('SELECT * FROM telegram_groups WHERE chat_id = -200001').get() as any;
    const ctx = createMockCtx('Is there a BBQ?', 55555, -200001);

    await handleGuestMessage(ctx, group);

    // pendingFaqAdditions should have entry keyed by owner telegram_id
    expect(pendingFaqAdditions.has(11111)).toBe(true);
    const pending = pendingFaqAdditions.get(11111)!;
    expect(pending.question).toBe('Is there a BBQ?');
    expect(pending.chatId).toBe(-200001);
  });

  test('unmatched question marks owner_notified = 1 in guest_interactions', async () => {
    seedGuestTestData();

    mockMatchFaq.mockResolvedValue({
      matched: false,
      answer: null,
      matchedFaqId: null,
      confidence: 'none',
    } as FaqMatchResult);

    const group = testDb.prepare('SELECT * FROM telegram_groups WHERE chat_id = -200001').get() as any;
    const ctx = createMockCtx('Any restaurants nearby?', 55555, -200001);

    await handleGuestMessage(ctx, group);

    const interaction = testDb.prepare('SELECT * FROM guest_interactions WHERE guest_telegram_id = 55555').get() as any;
    expect(interaction.owner_notified).toBe(1);
  });
});

describe('Phase 4 — FAQ matcher returns correct structure with empty entries', () => {
  test('matchFaq is called with faq entries from the correct property', async () => {
    seedGuestTestData();

    mockMatchFaq.mockResolvedValue({
      matched: true,
      answer: 'Here is the WiFi info!',
      matchedFaqId: 1,
      confidence: 'high',
    } as FaqMatchResult);

    const group = testDb.prepare('SELECT * FROM telegram_groups WHERE chat_id = -200001').get() as any;
    const ctx = createMockCtx('wifi info please', 55555, -200001);

    await handleGuestMessage(ctx, group);

    // matchFaq should have been called with the question and FAQ entries
    expect(mockMatchFaq).toHaveBeenCalledTimes(1);
    const [question, faqEntries] = mockMatchFaq.mock.calls[0];
    expect(question).toBe('wifi info please');
    expect(faqEntries).toHaveLength(2);
    expect(faqEntries[0].category).toBe('wifi');
  });
});
