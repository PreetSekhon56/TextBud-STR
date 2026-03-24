describe('Completion Flow (CLEAN-08)', () => {
  describe('Completion Intent', () => {
    test.todo('recognizes "I\'m done" as completion intent');
    test.todo('recognizes "all done" as completion intent');
    test.todo('recognizes "finished" as completion intent');
  });

  describe('Missing Photo Check', () => {
    test.todo('prompts for rooms without milestone photos');
    test.todo('allows skipping missing photos');
  });

  describe('Session Completion', () => {
    test.todo('sets completed_at timestamp on cleaning_session');
    test.todo('increments property clean_count');
    test.todo('sends summary message with duration and pass/fail counts');
  });
});
