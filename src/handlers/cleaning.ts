import { Telegraf, Context } from 'telegraf';
import { getDb } from '../db/connection.js';
import { Room, TelegramGroup, Cleaner, Property, CleaningSession } from '../types/index.js';
import { sendRoomChecklist } from './cleaning-checklist.js';
import { sendCompletionReport } from './reporting.js';

// --- Check-in / completion intent patterns ---

const CHECK_IN_PATTERNS = [
  /\b(i'?m here|checking in|arrived|here to clean|starting|i'?m at)\b/i,
];

const COMPLETION_PATTERNS = [
  /\b(i'?m done|all done|finished|complete|done cleaning)\b/i,
];

export function isCheckInIntent(text: string): boolean {
  return CHECK_IN_PATTERNS.some(p => p.test(text));
}

export function isCompletionIntent(text: string): boolean {
  return COMPLETION_PATTERNS.some(p => p.test(text));
}

export function determineCleanType(property: { clean_count: number; deep_clean_cycle: number }): 'standard' | 'deep' {
  if (property.clean_count + 1 >= property.deep_clean_cycle) {
    return 'deep';
  }
  return 'standard';
}

// --- Active session in-memory state ---

export interface ActiveCleaningSession {
  sessionId: number;
  propertyId: number;
  cleanerId: number;
  chatId: number;
  cleanType: 'standard' | 'deep';
  currentRoomIndex: number;
  rooms: Room[];
  checkedItems: Set<number>;
  photoAttempts: Map<number, number>;
  messageId?: number;
  entryVideoReceived: boolean;
  waitingForPhoto: boolean;
  currentPhotoRoomId?: number;
}

const activeSessions = new Map<number, ActiveCleaningSession>();

export function getActiveSessionByChatId(chatId: number): ActiveCleaningSession | undefined {
  return activeSessions.get(chatId);
}

export function setActiveSession(chatId: number, session: ActiveCleaningSession): void {
  activeSessions.set(chatId, session);
}

export function removeActiveSession(chatId: number): void {
  activeSessions.delete(chatId);
}

// --- Reload active sessions from DB on startup ---

function reloadActiveSessions(): void {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM cleaning_sessions WHERE completed_at IS NULL'
  ).all() as CleaningSession[];

  for (const row of rows) {
    const rooms = db.prepare(
      'SELECT * FROM rooms WHERE property_id = ? ORDER BY sort_order'
    ).all(row.property_id) as Room[];

    // Load already-completed checklist items for this session
    const completedRows = db.prepare(
      'SELECT checklist_item_id FROM session_checklist_progress WHERE session_id = ?'
    ).all(row.id) as { checklist_item_id: number }[];
    const checkedItems = new Set<number>(completedRows.map(r => r.checklist_item_id));

    // Determine current room index from current_room_id
    let currentRoomIndex = 0;
    if (row.current_room_id) {
      const idx = rooms.findIndex(r => r.id === row.current_room_id);
      if (idx >= 0) currentRoomIndex = idx;
    }

    activeSessions.set(row.chat_id, {
      sessionId: row.id,
      propertyId: row.property_id,
      cleanerId: row.cleaner_id,
      chatId: row.chat_id,
      cleanType: row.clean_type,
      currentRoomIndex,
      rooms,
      checkedItems,
      photoAttempts: new Map(),
      entryVideoReceived: !!row.entry_video_file_id,
      waitingForPhoto: false,
    });
  }
}

// --- Pending skip decisions for completion flow ---

const pendingSkipDecisions = new Map<number, { session: ActiveCleaningSession; missingRooms: string[] }>();

// --- Completion helper functions ---

export function calculateDuration(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - startDate.getTime();
  const totalMinutes = Math.floor(diffMs / 60000);

  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  }
  return `${totalMinutes}m`;
}

export function getComparisonSummary(sessionId: number): { passed: number; flagged: number; total: number } {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as passed
    FROM comparison_results cr
    JOIN milestone_photos mp ON cr.milestone_photo_id = mp.id
    WHERE mp.session_id = ?
    AND cr.id IN (
      SELECT MAX(cr2.id) FROM comparison_results cr2
      JOIN milestone_photos mp2 ON cr2.milestone_photo_id = mp2.id
      WHERE mp2.session_id = ? GROUP BY mp2.room_id
    )
  `).get(sessionId, sessionId) as { total: number; passed: number } | undefined;

  const total = row?.total || 0;
  const passed = row?.passed || 0;
  return { passed, flagged: total - passed, total };
}

export function getRoomsWithoutPhotos(sessionId: number, rooms: Room[]): string[] {
  const db = getDb();
  const propertyId = rooms.length > 0 ? rooms[0].property_id : 0;
  const rows = db.prepare(`
    SELECT r.name FROM rooms r
    WHERE r.property_id = ? AND r.id NOT IN (
      SELECT DISTINCT room_id FROM milestone_photos WHERE session_id = ?
    ) ORDER BY r.sort_order
  `).all(propertyId, sessionId) as { name: string }[];
  return rows.map(r => r.name);
}

export async function handleCompletion(ctx: Context, session: ActiveCleaningSession, skip = false): Promise<void> {
  const db = getDb();
  const chatId = ctx.chat!.id;

  if (!skip) {
    // Check for rooms without photos
    const missingRooms = getRoomsWithoutPhotos(session.sessionId, session.rooms);
    if (missingRooms.length > 0 && !pendingSkipDecisions.has(chatId)) {
      pendingSkipDecisions.set(chatId, { session, missingRooms });
      const roomList = missingRooms.join(', ');
      await ctx.reply(
        `You haven't sent photos for: ${roomList}.\n\nSend 'skip' to finish without them, or send a photo for any missing room.`
      );
      return;
    }
  }

  // Complete the session
  db.prepare('UPDATE cleaning_sessions SET completed_at = datetime(\'now\') WHERE id = ?')
    .run(session.sessionId);

  db.prepare('UPDATE properties SET clean_count = clean_count + 1 WHERE id = ?')
    .run(session.propertyId);

  // Remove from in-memory maps
  activeSessions.delete(chatId);
  pendingSkipDecisions.delete(chatId);

  // Send full completion report
  await sendCompletionReport(ctx, session);
}

// --- Group message handler ---

export async function handleGroupMessage(ctx: Context, group: TelegramGroup): Promise<void> {
  if (!ctx.message || !('text' in ctx.message) || !ctx.from) return;

  const chatId = ctx.chat!.id;
  const text = ctx.message.text;

  // Check if there's an active session waiting for entry video or photo -- ignore text
  const existingSession = activeSessions.get(chatId);
  if (existingSession) {
    if (!existingSession.entryVideoReceived) return; // waiting for entry video
    if (existingSession.waitingForPhoto) return; // waiting for milestone photo
  }

  // Handle pending skip decision
  if (pendingSkipDecisions.has(chatId) && /^skip$/i.test(text.trim())) {
    const pending = pendingSkipDecisions.get(chatId)!;
    await handleCompletion(ctx, pending.session, true);
    return;
  }

  // Check-in intent
  if (isCheckInIntent(text)) {
    await handleCheckIn(ctx, group);
    return;
  }

  // Completion intent
  if (isCompletionIntent(text)) {
    const session = activeSessions.get(chatId);
    if (session) {
      await handleCompletion(ctx, session);
    }
    return;
  }

  // Otherwise ignore -- normal chat
}

async function handleCheckIn(ctx: Context, group: TelegramGroup): Promise<void> {
  const db = getDb();
  const chatId = ctx.chat!.id;
  const fromId = ctx.from!.id;

  // Verify sender is the assigned cleaner
  if (!group.cleaner_id) {
    await ctx.reply("This group doesn't have a cleaner assigned yet.");
    return;
  }

  const cleaner = db.prepare('SELECT * FROM cleaners WHERE id = ?').get(group.cleaner_id) as Cleaner | undefined;
  if (!cleaner) {
    await ctx.reply("Cleaner record not found. Please re-link this group.");
    return;
  }

  if (cleaner.telegram_id !== fromId) {
    // Not the assigned cleaner -- ignore
    return;
  }

  // Check for existing active session in DB
  const existingDbSession = db.prepare(
    'SELECT * FROM cleaning_sessions WHERE chat_id = ? AND completed_at IS NULL'
  ).get(chatId) as CleaningSession | undefined;

  if (existingDbSession) {
    // Resume existing session
    const rooms = db.prepare(
      'SELECT * FROM rooms WHERE property_id = ? ORDER BY sort_order'
    ).all(existingDbSession.property_id) as Room[];

    const completedRows = db.prepare(
      'SELECT checklist_item_id FROM session_checklist_progress WHERE session_id = ?'
    ).all(existingDbSession.id) as { checklist_item_id: number }[];
    const checkedItems = new Set<number>(completedRows.map(r => r.checklist_item_id));

    let currentRoomIndex = 0;
    if (existingDbSession.current_room_id) {
      const idx = rooms.findIndex(r => r.id === existingDbSession.current_room_id);
      if (idx >= 0) currentRoomIndex = idx;
    }

    const session: ActiveCleaningSession = {
      sessionId: existingDbSession.id,
      propertyId: existingDbSession.property_id,
      cleanerId: existingDbSession.cleaner_id,
      chatId,
      cleanType: existingDbSession.clean_type,
      currentRoomIndex,
      rooms,
      checkedItems,
      photoAttempts: new Map(),
      entryVideoReceived: !!existingDbSession.entry_video_file_id,
      waitingForPhoto: false,
    };

    activeSessions.set(chatId, session);

    const currentRoom = rooms[currentRoomIndex];
    const roomName = currentRoom ? currentRoom.name : 'the current room';
    await ctx.reply(`Welcome back! You're still on ${roomName}. Here's where you left off.`);
    await sendRoomChecklist(ctx, session, currentRoomIndex);
    return;
  }

  // New session
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(group.property_id) as Property | undefined;
  if (!property) {
    await ctx.reply("Property not found. Please re-link this group.");
    return;
  }

  const cleanType = determineCleanType(property);

  const result = db.prepare(
    'INSERT INTO cleaning_sessions (property_id, cleaner_id, chat_id, clean_type) VALUES (?, ?, ?, ?)'
  ).run(property.id, group.cleaner_id, chatId, cleanType);

  const sessionId = Number(result.lastInsertRowid);

  const rooms = db.prepare(
    'SELECT * FROM rooms WHERE property_id = ? ORDER BY sort_order'
  ).all(property.id) as Room[];

  const session: ActiveCleaningSession = {
    sessionId,
    propertyId: property.id,
    cleanerId: group.cleaner_id,
    chatId,
    cleanType,
    currentRoomIndex: 0,
    rooms,
    checkedItems: new Set(),
    photoAttempts: new Map(),
    entryVideoReceived: false,
    waitingForPhoto: false,
  };

  activeSessions.set(chatId, session);

  const cleanTypeLabel = cleanType === 'deep' ? 'Deep' : 'Standard';
  await ctx.reply(
    `${cleanTypeLabel} clean for ${property.name}.\n\nBefore you start, record a slow walkthrough video of the property as-is. Just send a video here.`
  );
}

// --- Register handlers ---

/** Call after initDb() to reload any in-progress cleaning sessions */
export { reloadActiveSessions };

export function registerCleaningHandlers(bot: Telegraf): void {

  // Entry video handler
  bot.on(['video', 'video_note'], async (ctx) => {
    if (ctx.chat.type === 'private') return;

    const chatId = ctx.chat.id;
    const session = activeSessions.get(chatId);
    if (!session || session.entryVideoReceived) return; // not expecting video

    const msg = ctx.message;
    const fileId = ('video' in msg && msg.video?.file_id)
      || ('video_note' in msg && msg.video_note?.file_id)
      || null;

    if (!fileId) return;

    // Update DB
    const db = getDb();
    db.prepare('UPDATE cleaning_sessions SET entry_video_file_id = ? WHERE id = ?')
      .run(fileId, session.sessionId);

    session.entryVideoReceived = true;

    await ctx.reply("Got it! Entry video recorded. Now let's get started with the cleaning.");

    // Start first room checklist
    await sendRoomChecklist(ctx, session, 0);
  });
}
