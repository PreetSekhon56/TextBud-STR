import {
  buildChecklistKeyboard,
  getCompletedItemIds,
} from '../../src/handlers/cleaning-checklist';

// Mock better-sqlite3 for getCompletedItemIds
jest.mock('../../src/db/connection', () => {
  const mockDb = {
    prepare: jest.fn(),
    pragma: jest.fn(),
  };
  return {
    getDb: jest.fn(() => mockDb),
  };
});

import { getDb } from '../../src/db/connection';

describe('Sequential Checklist (CLEAN-04)', () => {
  describe('buildChecklistKeyboard', () => {
    const sampleItems = [
      { id: 1, checklist_id: 10, description: 'Make beds', sort_order: 0, created_at: '' },
      { id: 2, checklist_id: 10, description: 'Vacuum floors', sort_order: 1, created_at: '' },
      { id: 3, checklist_id: 10, description: 'Clean mirrors', sort_order: 2, created_at: '' },
    ];

    test('generates callback data in c_{sessionId}_{itemId} format', () => {
      const keyboard = buildChecklistKeyboard(42, 5, sampleItems, new Set());
      const markup = keyboard.reply_markup;
      // Each item should be its own row
      expect(markup.inline_keyboard).toHaveLength(3);
      // Check callback data format
      expect(markup.inline_keyboard[0][0].callback_data).toBe('c_42_1');
      expect(markup.inline_keyboard[1][0].callback_data).toBe('c_42_2');
      expect(markup.inline_keyboard[2][0].callback_data).toBe('c_42_3');
    });

    test('shows "[done]" prefix for completed items', () => {
      const completedIds = new Set([2]);
      const keyboard = buildChecklistKeyboard(42, 5, sampleItems, completedIds);
      const markup = keyboard.reply_markup;
      expect(markup.inline_keyboard[0][0].text).toBe('Make beds');
      expect(markup.inline_keyboard[1][0].text).toBe('[done] Vacuum floors');
      expect(markup.inline_keyboard[2][0].text).toBe('Clean mirrors');
    });

    test('callback data length is under 64 bytes for reasonable IDs', () => {
      const keyboard = buildChecklistKeyboard(99999, 5, sampleItems, new Set());
      const markup = keyboard.reply_markup;
      for (const row of markup.inline_keyboard) {
        for (const btn of row) {
          expect(btn.callback_data!.length).toBeLessThan(64);
        }
      }
    });
  });

  describe('getCompletedItemIds', () => {
    test('returns Set of checklist_item_ids from session_checklist_progress', () => {
      const mockAll = jest.fn().mockReturnValue([
        { checklist_item_id: 10 },
        { checklist_item_id: 20 },
        { checklist_item_id: 30 },
      ]);
      const mockPrepare = jest.fn().mockReturnValue({ all: mockAll });
      (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });

      const result = getCompletedItemIds(5);
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(3);
      expect(result.has(10)).toBe(true);
      expect(result.has(20)).toBe(true);
      expect(result.has(30)).toBe(true);
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('session_checklist_progress')
      );
      expect(mockAll).toHaveBeenCalledWith(5);
    });

    test('returns empty Set when no items completed', () => {
      const mockAll = jest.fn().mockReturnValue([]);
      const mockPrepare = jest.fn().mockReturnValue({ all: mockAll });
      (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });

      const result = getCompletedItemIds(99);
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });
  });
});
