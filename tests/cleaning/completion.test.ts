import {
  calculateDuration,
  isCompletionIntent,
} from '../../src/handlers/cleaning';

// Mock DB
jest.mock('../../src/db/connection', () => ({
  getDb: jest.fn(),
}));

// Mock cleaning-checklist
jest.mock('../../src/handlers/cleaning-checklist', () => ({
  sendRoomChecklist: jest.fn(),
}));

describe('Completion Flow (CLEAN-08)', () => {
  describe('Completion Intent', () => {
    test('recognizes "I\'m done" as completion intent', () => {
      expect(isCompletionIntent("I'm done")).toBe(true);
    });

    test('recognizes "all done" as completion intent', () => {
      expect(isCompletionIntent('all done')).toBe(true);
    });

    test('recognizes "finished" as completion intent', () => {
      expect(isCompletionIntent('finished')).toBe(true);
    });

    test('recognizes "done cleaning" as completion intent', () => {
      expect(isCompletionIntent('done cleaning')).toBe(true);
    });

    test('recognizes "complete" as completion intent', () => {
      expect(isCompletionIntent('complete')).toBe(true);
    });

    test('does not match random text', () => {
      expect(isCompletionIntent('hello there')).toBe(false);
    });
  });

  describe('calculateDuration', () => {
    test('returns hours and minutes for long durations', () => {
      expect(calculateDuration('2026-03-24T10:00:00', '2026-03-24T12:15:00')).toBe('2h 15m');
    });

    test('returns only minutes for short durations', () => {
      expect(calculateDuration('2026-03-24T10:00:00', '2026-03-24T10:45:00')).toBe('45m');
    });

    test('handles exactly 1 hour', () => {
      expect(calculateDuration('2026-03-24T10:00:00', '2026-03-24T11:00:00')).toBe('1h 0m');
    });

    test('handles 0 minutes', () => {
      expect(calculateDuration('2026-03-24T10:00:00', '2026-03-24T10:00:00')).toBe('0m');
    });
  });

  describe('Missing Photo Check', () => {
    test('getRoomsWithoutPhotos is exported', () => {
      const { getRoomsWithoutPhotos } = require('../../src/handlers/cleaning');
      expect(typeof getRoomsWithoutPhotos).toBe('function');
    });
  });

  describe('Session Completion', () => {
    test('handleCompletion is exported', () => {
      const { handleCompletion } = require('../../src/handlers/cleaning');
      expect(typeof handleCompletion).toBe('function');
    });

    test('getComparisonSummary is exported', () => {
      const { getComparisonSummary } = require('../../src/handlers/cleaning');
      expect(typeof getComparisonSummary).toBe('function');
    });
  });
});
