describe('Photo Comparison (CLEAN-05, CLEAN-06, CLEAN-07)', () => {
  describe('Milestone Photo Request', () => {
    test.todo('requests photo after room checklist completion');
    test.todo('skips comparison for rooms without staging photos');
  });

  describe('AI Comparison', () => {
    test.todo('sends staging and milestone photos to Claude Vision');
    test.todo('parses pass/fail result from JSON response');
  });

  describe('Flagging Flow', () => {
    test.todo('sends friendly nudge on flag');
    test.todo('allows up to 3 retry attempts per room');
    test.todo('accepts after 3 failed attempts and notes for report');
  });
});
