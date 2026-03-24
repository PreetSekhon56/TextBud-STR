import { Telegraf, Context, Markup } from 'telegraf';
import { getDb } from '../db/connection.js';
import { ChecklistItem, Room } from '../types/index.js';
import { ActiveCleaningSession, getActiveSessionByChatId } from './cleaning.js';

// Stub - will be fully implemented in Task 2
export async function sendRoomChecklist(ctx: Context, session: ActiveCleaningSession, roomIndex: number): Promise<void> {
  // Placeholder - Task 2 implements this
}

export function buildChecklistKeyboard(sessionId: number, roomId: number, items: ChecklistItem[], completedIds: Set<number>) {
  // Placeholder - Task 2 implements this
  return Markup.inlineKeyboard([]);
}

export function getCompletedItemIds(sessionId: number): Set<number> {
  // Placeholder - Task 2 implements this
  return new Set();
}

export function registerChecklistHandlers(bot: Telegraf): void {
  // Placeholder - Task 2 implements this
}
