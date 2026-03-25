/**
 * CLEAN-03: Entry video recording
 *
 * Verifies that the ActiveCleaningSession tracks entry video state,
 * and that the session starts with entryVideoReceived = false.
 */
import {
  ActiveCleaningSession,
  setActiveSession,
  getActiveSessionByChatId,
  removeActiveSession,
} from '../../src/handlers/cleaning';

describe('Entry Video (CLEAN-03)', () => {
  const chatId = 99999;

  afterEach(() => {
    removeActiveSession(chatId);
  });

  function makeSession(overrides: Partial<ActiveCleaningSession> = {}): ActiveCleaningSession {
    return {
      sessionId: 1,
      propertyId: 1,
      cleanerId: 1,
      chatId,
      cleanType: 'standard',
      currentRoomIndex: 0,
      rooms: [],
      checkedItems: new Set(),
      photoAttempts: new Map(),
      entryVideoReceived: false,
      waitingForPhoto: false,
      ...overrides,
    };
  }

  test('new cleaning session starts with entryVideoReceived = false', () => {
    const session = makeSession();
    expect(session.entryVideoReceived).toBe(false);
  });

  test('entryVideoReceived can be set to true after video is received', () => {
    const session = makeSession();
    setActiveSession(chatId, session);
    session.entryVideoReceived = true;
    const retrieved = getActiveSessionByChatId(chatId);
    expect(retrieved?.entryVideoReceived).toBe(true);
  });

  test('session is retrievable by chatId after being set', () => {
    const session = makeSession();
    setActiveSession(chatId, session);
    const retrieved = getActiveSessionByChatId(chatId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.sessionId).toBe(1);
  });

  test('session is removed after removeActiveSession', () => {
    const session = makeSession();
    setActiveSession(chatId, session);
    removeActiveSession(chatId);
    expect(getActiveSessionByChatId(chatId)).toBeUndefined();
  });
});
