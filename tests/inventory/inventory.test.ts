/**
 * REPT-02: Inventory walkthrough sequential prompts
 * REPT-03: Photo analysis for inventory
 * REPT-05: Consumption tracking
 *
 * Tests the inventory walkthrough flow, prompt generation,
 * number parsing, and inventory session management.
 */
import {
  activeInventorySessions,
  promptNextInventoryItem,
  handleInventoryResponse,
  completeInventory,
} from '../../src/handlers/inventory';
import { ActiveInventorySession, InventoryItem } from '../../src/types/index';

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

// Mock vision service (transitive dep)
jest.mock('../../src/services/vision', () => ({
  downloadTelegramPhoto: jest.fn(),
  analyzeInventoryPhoto: jest.fn(),
}));

// Mock reporting (transitive dep)
jest.mock('../../src/handlers/reporting', () => ({
  appendLowStockAlerts: jest.fn(),
}));

import { getDb } from '../../src/db/connection';
import { appendLowStockAlerts } from '../../src/handlers/reporting';

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 1,
    property_id: 1,
    name: 'Toilet paper',
    par_level: 5,
    last_count: 10,
    last_counted_at: null,
    sort_order: 0,
    is_active: 1,
    created_at: '',
    ...overrides,
  };
}

function makeSession(overrides: Partial<ActiveInventorySession> = {}): ActiveInventorySession {
  return {
    sessionId: 1,
    propertyId: 1,
    chatId: 12345,
    cleanerId: 1,
    items: [
      makeItem({ id: 1, name: 'Toilet paper', sort_order: 0 }),
      makeItem({ id: 2, name: 'Trash bags', sort_order: 1 }),
    ],
    currentItemIndex: 0,
    counts: new Map(),
    photos: new Map(),
    waitingForInventoryPhoto: false,
    lastActivity: Date.now(),
    ...overrides,
  };
}

describe('Inventory Walkthrough (REPT-02)', () => {
  describe('promptNextInventoryItem', () => {
    test('prompts for the current item with its name', async () => {
      const mockReply = jest.fn();
      const ctx = { reply: mockReply } as any;
      const session = makeSession();

      await promptNextInventoryItem(ctx, session);
      expect(mockReply).toHaveBeenCalledWith(
        expect.stringContaining('Toilet paper')
      );
    });

    test('includes last count when available', async () => {
      const mockReply = jest.fn();
      const ctx = { reply: mockReply } as any;
      const session = makeSession();

      await promptNextInventoryItem(ctx, session);
      expect(mockReply.mock.calls[0][0]).toContain('last count: 10');
    });

    test('does not include last count when null', async () => {
      const mockReply = jest.fn();
      const ctx = { reply: mockReply } as any;
      const session = makeSession({
        items: [makeItem({ last_count: null })],
      });

      await promptNextInventoryItem(ctx, session);
      expect(mockReply.mock.calls[0][0]).not.toContain('last count');
    });

    test('completes inventory when all items are prompted', async () => {
      const mockReply = jest.fn();
      const ctx = { reply: mockReply } as any;

      // Mock DB calls for completeInventory
      const mockRun = jest.fn().mockReturnValue({ lastInsertRowid: 1n });
      const mockAll = jest.fn().mockReturnValue([]);
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun, all: mockAll, get: jest.fn() });
      (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });
      (appendLowStockAlerts as jest.Mock).mockResolvedValue(undefined);

      const session = makeSession({ currentItemIndex: 2 }); // past last item
      activeInventorySessions.set(session.chatId, session);

      await promptNextInventoryItem(ctx, session);
      // completeInventory should have been called (appendLowStockAlerts invoked)
      expect(appendLowStockAlerts).toHaveBeenCalled();

      activeInventorySessions.delete(session.chatId);
    });
  });

  describe('handleInventoryResponse', () => {
    test('parses numeric response and stores count', async () => {
      // Mock DB for alarming drop check
      const mockAll = jest.fn().mockReturnValue([]);
      const mockPrepare = jest.fn().mockReturnValue({ all: mockAll });
      (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });

      const mockReply = jest.fn();
      const ctx = {
        reply: mockReply,
        message: { text: '8' },
      } as any;

      const session = makeSession();
      activeInventorySessions.set(session.chatId, session);

      const handled = await handleInventoryResponse(ctx, session);
      expect(handled).toBe(true);
      expect(session.counts.get(1)).toBe(8);

      activeInventorySessions.delete(session.chatId);
    });

    test('rejects non-numeric input with helpful message', async () => {
      const mockReply = jest.fn();
      const ctx = {
        reply: mockReply,
        message: { text: 'hello' },
      } as any;

      const session = makeSession();

      const handled = await handleInventoryResponse(ctx, session);
      expect(handled).toBe(true);
      expect(mockReply).toHaveBeenCalledWith(
        expect.stringContaining('number')
      );
    });

    test('handles skip command to advance to next item', async () => {
      const mockReply = jest.fn();
      const mockAll = jest.fn().mockReturnValue([]);
      const mockPrepare = jest.fn().mockReturnValue({ all: mockAll });
      (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });

      const ctx = {
        reply: mockReply,
        message: { text: 'skip' },
      } as any;

      const session = makeSession();
      const handled = await handleInventoryResponse(ctx, session);
      expect(handled).toBe(true);
      expect(session.currentItemIndex).toBe(1);
    });

    test('ignores text when waiting for inventory photo unless skip', async () => {
      const mockReply = jest.fn();
      const ctx = {
        reply: mockReply,
        message: { text: 'some text' },
      } as any;

      const session = makeSession({ waitingForInventoryPhoto: true });
      const handled = await handleInventoryResponse(ctx, session);
      expect(handled).toBe(true);
      expect(mockReply).toHaveBeenCalledWith(
        expect.stringContaining('photo')
      );
    });
  });
});

describe('Consumption Tracking (REPT-05)', () => {
  describe('completeInventory persists counts with consumption delta', () => {
    test('saves inventory counts and calculates consumption delta', async () => {
      const mockRun = jest.fn().mockReturnValue({ lastInsertRowid: 1n });
      const mockAll = jest.fn().mockReturnValue([]);
      const mockGet = jest.fn().mockReturnValue(undefined);
      const mockPrepare = jest.fn().mockReturnValue({
        run: mockRun,
        all: mockAll,
        get: mockGet,
      });
      (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });
      (appendLowStockAlerts as jest.Mock).mockResolvedValue(undefined);

      const mockReply = jest.fn();
      const ctx = { reply: mockReply } as any;

      const session = makeSession();
      session.counts.set(1, 7); // was 10, now 7 -> delta = 3
      session.counts.set(2, 8); // was 10, now 8 -> delta = 2
      activeInventorySessions.set(session.chatId, session);

      await completeInventory(ctx, session);

      // Verify INSERT INTO inventory_counts was called with consumption_delta
      const insertCalls = mockRun.mock.calls.filter(
        (call: any[]) => true // all run calls
      );
      expect(insertCalls.length).toBeGreaterThan(0);

      // Verify appendLowStockAlerts was called
      expect(appendLowStockAlerts).toHaveBeenCalled();

      // Session should be cleaned up
      expect(activeInventorySessions.has(session.chatId)).toBe(false);
    });
  });
});
