import { Telegraf, Context, Markup } from 'telegraf';
import { getDb } from '../db/connection.js';
import { Checklist, ChecklistItem, Cleaner, Room } from '../types/index.js';
import { ActiveCleaningSession, getActiveSessionByChatId } from './cleaning.js';

/**
 * Get completed checklist item IDs for a session from the DB.
 */
export function getCompletedItemIds(sessionId: number): Set<number> {
  const db = getDb();
  const rows = db.prepare(
    'SELECT checklist_item_id FROM session_checklist_progress WHERE session_id = ?'
  ).all(sessionId) as { checklist_item_id: number }[];
  return new Set(rows.map(r => r.checklist_item_id));
}

/**
 * Build an inline keyboard for a room's checklist items.
 * Completed items get a "[done]" prefix.
 */
export function buildChecklistKeyboard(
  sessionId: number,
  roomId: number,
  items: ChecklistItem[],
  completedIds: Set<number>
) {
  const buttons = items.map(item => {
    const prefix = completedIds.has(item.id) ? '[done] ' : '';
    return [Markup.button.callback(`${prefix}${item.description}`, `c_${sessionId}_${item.id}`)];
  });
  return Markup.inlineKeyboard(buttons);
}

/**
 * Send the checklist for the room at the given index.
 * If all rooms are done, signals completion (Plan 03 handles it).
 */
export async function sendRoomChecklist(
  ctx: Context,
  session: ActiveCleaningSession,
  roomIndex: number
): Promise<void> {
  const db = getDb();

  // All rooms done
  if (roomIndex >= session.rooms.length) {
    session.waitingForPhoto = false;
    // Plan 03 handles completion prompt
    return;
  }

  const room = session.rooms[roomIndex];
  session.currentRoomIndex = roomIndex;

  // Update current_room_id in DB
  db.prepare('UPDATE cleaning_sessions SET current_room_id = ? WHERE id = ?')
    .run(room.id, session.sessionId);

  // Get checklist for this room + clean type
  const checklist = db.prepare(
    'SELECT * FROM checklists WHERE room_id = ? AND clean_type = ?'
  ).get(room.id, session.cleanType) as Checklist | undefined;

  if (!checklist) {
    await ctx.reply(`No checklist for ${room.name}. Moving to next room.`);
    await sendRoomChecklist(ctx, session, roomIndex + 1);
    return;
  }

  // Get checklist items sorted by sort_order
  const items = db.prepare(
    'SELECT * FROM checklist_items WHERE checklist_id = ? ORDER BY sort_order'
  ).all(checklist.id) as ChecklistItem[];

  if (items.length === 0) {
    await ctx.reply(`No items in checklist for ${room.name}. Moving to next room.`);
    await sendRoomChecklist(ctx, session, roomIndex + 1);
    return;
  }

  // Get already-completed item IDs
  const completedIds = getCompletedItemIds(session.sessionId);

  // Build inline keyboard
  const keyboard = buildChecklistKeyboard(session.sessionId, room.id, items, completedIds);

  const totalRooms = session.rooms.length;
  const msg = await ctx.reply(
    `Room ${roomIndex + 1}/${totalRooms}: ${room.name}\n\nTap each item when done:`,
    keyboard
  );

  // Store message ID for later editing
  session.messageId = msg.message_id;
}

/**
 * Register callback query handlers for checklist button taps.
 */
export function registerChecklistHandlers(bot: Telegraf): void {
  bot.action(/^c_(\d+)_(\d+)$/, async (ctx) => {
    const sessionId = parseInt(ctx.match[1], 10);
    const itemId = parseInt(ctx.match[2], 10);
    const db = getDb();

    // Find the active session with this sessionId
    let session: ActiveCleaningSession | undefined;
    const chatId = ctx.chat?.id;
    if (chatId) {
      const candidate = getActiveSessionByChatId(chatId);
      if (candidate && candidate.sessionId === sessionId) {
        session = candidate;
      }
    }

    if (!session) {
      await ctx.answerCbQuery('Session not found.');
      return;
    }

    // Verify sender is the cleaner
    const cleaner = db.prepare('SELECT * FROM cleaners WHERE id = ?').get(session.cleanerId) as Cleaner | undefined;
    if (!cleaner || ctx.from.id !== cleaner.telegram_id) {
      await ctx.answerCbQuery('Only the cleaner can mark items.');
      return;
    }

    // Answer callback immediately
    await ctx.answerCbQuery('Done!');

    // Insert into session_checklist_progress
    db.prepare(
      'INSERT OR IGNORE INTO session_checklist_progress (session_id, checklist_item_id) VALUES (?, ?)'
    ).run(sessionId, itemId);

    // Add to in-memory tracking
    session.checkedItems.add(itemId);

    // Get current room and its checklist items to rebuild keyboard
    const room = session.rooms[session.currentRoomIndex];
    const checklist = db.prepare(
      'SELECT * FROM checklists WHERE room_id = ? AND clean_type = ?'
    ).get(room.id, session.cleanType) as Checklist | undefined;

    if (!checklist) return;

    const items = db.prepare(
      'SELECT * FROM checklist_items WHERE checklist_id = ? ORDER BY sort_order'
    ).all(checklist.id) as ChecklistItem[];

    const completedIds = getCompletedItemIds(sessionId);
    const newKeyboard = buildChecklistKeyboard(sessionId, room.id, items, completedIds);

    // Edit message with updated keyboard
    try {
      await ctx.editMessageReplyMarkup(newKeyboard.reply_markup);
    } catch {
      // Message may have been deleted or can't be edited
    }

    // Check if ALL items for current room are now checked
    const allDone = items.every(item => completedIds.has(item.id));
    if (allDone) {
      await ctx.reply(`Great job on ${room.name}!`);

      // Request milestone photo
      session.waitingForPhoto = true;
      session.currentPhotoRoomId = room.id;
      await ctx.reply(`Send me a photo of ${room.name} now.`);

      // Do NOT auto-advance -- wait for photo submission (Plan 03 handles
      // photo receipt and then calls sendRoomChecklist for next room)
    }
  });
}
