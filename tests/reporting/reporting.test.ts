/**
 * REPT-01: Report generation and storage
 *
 * Verifies report header building, formatting helpers, and
 * per-room report structure.
 */
import {
  formatTime,
  buildReportHeader,
  getChecklistStatusForRoom,
  getDetailedComparisonForRoom,
  appendLowStockAlerts,
} from '../../src/handlers/reporting';
import { calculateDuration } from '../../src/handlers/cleaning';

// Mock DB for functions that query it
jest.mock('../../src/db/connection', () => {
  const mockDb = {
    prepare: jest.fn(),
    pragma: jest.fn(),
  };
  return {
    getDb: jest.fn(() => mockDb),
  };
});

// Mock cleaning-checklist (transitive dep)
jest.mock('../../src/handlers/cleaning-checklist', () => ({
  sendRoomChecklist: jest.fn(),
}));

import { getDb } from '../../src/db/connection';

describe('Report Generation (REPT-01)', () => {
  describe('formatTime', () => {
    test('formats ISO date to human-readable time', () => {
      const result = formatTime('2026-03-24T14:30:00');
      expect(result).toContain('Mar');
      expect(result).toContain('24');
      // Should contain time portion
      expect(result).toMatch(/\d+:\d{2}\s*(AM|PM)/);
    });

    test('formats midnight correctly', () => {
      const result = formatTime('2026-01-15T00:00:00');
      expect(result).toContain('Jan');
      expect(result).toContain('15');
      expect(result).toContain('12:00 AM');
    });

    test('formats noon correctly', () => {
      const result = formatTime('2026-06-01T12:00:00');
      expect(result).toContain('Jun');
      expect(result).toContain('12:00 PM');
    });
  });

  describe('buildReportHeader', () => {
    test('includes property name, cleaner name, clean type, and duration', () => {
      const header = buildReportHeader(
        {
          id: 1, property_id: 1, cleaner_id: 1, chat_id: 1,
          clean_type: 'standard', current_room_id: null,
          entry_video_file_id: null,
          checked_in_at: '2026-03-24T10:00:00',
          completed_at: '2026-03-24T12:30:00',
          summary: null, created_at: '',
        },
        {
          id: 1, owner_id: 1, name: 'Beach House', address: null,
          deep_clean_cycle: 5, clean_count: 0, setup_complete: true,
          setup_step: null, floor_plan_svg: null, created_at: '',
        },
        { id: 1, telegram_id: 123, username: null, first_name: 'Maria', created_at: '' },
        { passed: 3, flagged: 1, total: 4 },
        { completed: 10, total: 12 },
      );

      expect(header).toContain('Beach House');
      expect(header).toContain('Maria');
      expect(header).toContain('Standard Clean');
      expect(header).toContain('2h 30m');
      expect(header).toContain('3/4 rooms passed');
      expect(header).toContain('1 flagged');
      expect(header).toContain('10/12 checklist items done');
    });

    test('shows Deep Clean label for deep clean type', () => {
      const header = buildReportHeader(
        {
          id: 1, property_id: 1, cleaner_id: 1, chat_id: 1,
          clean_type: 'deep', current_room_id: null,
          entry_video_file_id: null,
          checked_in_at: '2026-03-24T10:00:00',
          completed_at: '2026-03-24T11:00:00',
          summary: null, created_at: '',
        },
        {
          id: 1, owner_id: 1, name: 'Mountain Cabin', address: null,
          deep_clean_cycle: 5, clean_count: 0, setup_complete: true,
          setup_step: null, floor_plan_svg: null, created_at: '',
        },
        { id: 1, telegram_id: 123, username: null, first_name: 'Ana', created_at: '' },
        { passed: 0, flagged: 0, total: 0 },
        { completed: 0, total: 0 },
      );

      expect(header).toContain('Deep Clean');
      expect(header).toContain('No photo comparisons');
      expect(header).toContain('No checklist items');
    });
  });

  describe('getChecklistStatusForRoom', () => {
    test('returns checklist items with completed status from DB', () => {
      const mockAll = jest.fn().mockReturnValue([
        { description: 'Make beds', progress_id: 1 },
        { description: 'Vacuum', progress_id: null },
      ]);
      const mockPrepare = jest.fn().mockReturnValue({ all: mockAll });
      (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });

      const result = getChecklistStatusForRoom(1, 10, 'standard');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ description: 'Make beds', completed: true });
      expect(result[1]).toEqual({ description: 'Vacuum', completed: false });
    });
  });

  describe('getDetailedComparisonForRoom', () => {
    test('returns comparison result from DB', () => {
      const mockResult = {
        id: 1, milestone_photo_id: 1, staging_photo_id: 1,
        passed: true, issues: null, raw_response: null, created_at: '',
      };
      const mockGet = jest.fn().mockReturnValue(mockResult);
      const mockPrepare = jest.fn().mockReturnValue({ get: mockGet });
      (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });

      const result = getDetailedComparisonForRoom(1, 10);
      expect(result).toEqual(mockResult);
    });

    test('returns null when no comparison exists', () => {
      const mockGet = jest.fn().mockReturnValue(undefined);
      const mockPrepare = jest.fn().mockReturnValue({ get: mockGet });
      (getDb as jest.Mock).mockReturnValue({ prepare: mockPrepare });

      const result = getDetailedComparisonForRoom(1, 99);
      expect(result).toBeNull();
    });
  });
});

describe('Low Stock Alerts (REPT-04)', () => {
  describe('appendLowStockAlerts', () => {
    test('sends all-clear message when no low stock items', async () => {
      const mockReply = jest.fn();
      const ctx = { reply: mockReply } as any;

      await appendLowStockAlerts(ctx, 5, []);
      expect(mockReply).toHaveBeenCalledTimes(1);
      expect(mockReply).toHaveBeenCalledWith(
        expect.stringContaining('All supplies above minimum levels')
      );
    });

    test('sends low stock alert with item details', async () => {
      const mockReply = jest.fn();
      const ctx = { reply: mockReply } as any;

      await appendLowStockAlerts(ctx, 5, [
        { name: 'Toilet paper', count: 2, parLevel: 5 },
        { name: 'Trash bags', count: 1, parLevel: 3 },
      ]);

      expect(mockReply).toHaveBeenCalledTimes(1);
      const message = mockReply.mock.calls[0][0];
      expect(message).toContain('Low stock alert');
      expect(message).toContain('Toilet paper: 2 left (minimum: 5)');
      expect(message).toContain('Trash bags: 1 left (minimum: 3)');
    });

    test('includes session ID in inventory update header', async () => {
      const mockReply = jest.fn();
      const ctx = { reply: mockReply } as any;

      await appendLowStockAlerts(ctx, 42, []);
      expect(mockReply.mock.calls[0][0]).toContain('Session #42');
    });
  });
});
