describe('Check-in Flow (CLEAN-01, CLEAN-02)', () => {
  describe('Intent Recognition', () => {
    test.todo('recognizes "I\'m here" as check-in intent');
    test.todo('recognizes "checking in" as check-in intent');
    test.todo('recognizes "arrived" as check-in intent');
    test.todo('does not recognize random text as check-in');
  });

  describe('Clean Type Determination', () => {
    test.todo('returns standard when clean_count < deep_clean_cycle');
    test.todo('returns deep when clean_count + 1 >= deep_clean_cycle');
  });

  describe('Session Creation', () => {
    test.todo('creates cleaning_session row with checked_in_at timestamp');
    test.todo('resumes existing active session instead of creating new one');
  });
});
