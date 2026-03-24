import { Telegraf, Context } from 'telegraf';
import { getDb } from '../db/connection.js';
import { Room, TelegramGroup, Cleaner, Property, CleaningSession } from '../types/index.js';
import { sendRoomChecklist } from './cleaning-checklist.js';

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

  // Check-in intent
  if (isCheckInIntent(text)) {
    await handleCheckIn(ctx, group);
    return;
  }

  // Completion intent -- delegate to Plan 03
  if (isCompletionIntent(text)) {
    // TODO: Plan 03 will implement completion handler
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

export function registerCleaningHandlers(bot: Telegraf): void {
  // Reload active sessions from DB so they survive bot restarts
  reloadActiveSessions();

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
