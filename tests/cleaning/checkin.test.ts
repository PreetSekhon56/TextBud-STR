import {
  isCheckInIntent,
  isCompletionIntent,
  determineCleanType,
} from '../../src/handlers/cleaning';

describe('Check-in Flow (CLEAN-01, CLEAN-02)', () => {
  describe('isCheckInIntent', () => {
    test('recognizes "I\'m here" as check-in intent', () => {
      expect(isCheckInIntent("I'm here")).toBe(true);
    });

    test('recognizes "Im here" (no apostrophe) as check-in intent', () => {
      expect(isCheckInIntent("Im here")).toBe(true);
    });

    test('recognizes "checking in" as check-in intent', () => {
      expect(isCheckInIntent("checking in")).toBe(true);
    });

    test('recognizes "arrived" as check-in intent', () => {
      expect(isCheckInIntent("arrived")).toBe(true);
    });

    test('recognizes "here to clean" as check-in intent', () => {
      expect(isCheckInIntent("here to clean")).toBe(true);
    });

    test('is case insensitive', () => {
      expect(isCheckInIntent("I'M HERE")).toBe(true);
      expect(isCheckInIntent("Checking In")).toBe(true);
    });

    test('does not recognize "hello how are you" as check-in', () => {
      expect(isCheckInIntent("hello how are you")).toBe(false);
    });

    test('does not recognize "I\'m done" as check-in', () => {
      expect(isCheckInIntent("I'm done")).toBe(false);
    });
  });

  describe('isCompletionIntent', () => {
    test('recognizes "I\'m done" as completion intent', () => {
      expect(isCompletionIntent("I'm done")).toBe(true);
    });

    test('recognizes "finished" as completion intent', () => {
      expect(isCompletionIntent("finished")).toBe(true);
    });

    test('recognizes "all done" as completion intent', () => {
      expect(isCompletionIntent("all done")).toBe(true);
    });

    test('does not recognize "I\'m here" as completion intent', () => {
      expect(isCompletionIntent("I'm here")).toBe(false);
    });
  });

  describe('determineCleanType', () => {
    test('returns standard when clean_count is 0 (far from cycle)', () => {
      expect(determineCleanType({ clean_count: 0, deep_clean_cycle: 10 })).toBe('standard');
    });

    test('returns standard when clean_count + 1 < deep_clean_cycle', () => {
      expect(determineCleanType({ clean_count: 5, deep_clean_cycle: 10 })).toBe('standard');
    });

    test('returns deep when clean_count + 1 >= deep_clean_cycle (at threshold)', () => {
      expect(determineCleanType({ clean_count: 9, deep_clean_cycle: 10 })).toBe('deep');
    });

    test('returns deep when clean_count + 1 equals deep_clean_cycle exactly', () => {
      expect(determineCleanType({ clean_count: 4, deep_clean_cycle: 5 })).toBe('deep');
    });
  });
});
