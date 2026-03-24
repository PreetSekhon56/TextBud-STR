import { Telegraf, Context } from 'telegraf';
import { getDb } from './db/connection.js';
import { registerGroupHandlers, hasPendingGroupLink, handlePropertySelection } from './handlers/groups.js';
import { registerSetupHandlers, getActiveSession } from './handlers/setup.js';
import {
  registerManageHandlers,
  isManageTrigger,
  handleListProperties,
  hasPendingPropertySelect,
  handlePropertySelectReply,
  clearPendingPropertySelect,
} from './handlers/manage.js';
import { registerEditHandlers, handleEditMessage, hasActiveEditSession } from './handlers/edit.js';
import { registerCleaningHandlers, handleGroupMessage } from './handlers/cleaning.js';
import { registerChecklistHandlers } from './handlers/cleaning-checklist.js';
import { registerPhotoHandlers } from './handlers/cleaning-photos.js';
import { Owner, TelegramGroup } from './types/index.js';

export const bot = new Telegraf(process.env.BOT_TOKEN!);

// Register group detection and property linking handlers
registerGroupHandlers(bot);

// Register manage handlers (mostly exports, actual routing in central DM router below)
registerManageHandlers(bot);

// Register setup wizard handlers (photo handler + resume middleware)
registerSetupHandlers(bot);

// Register edit handlers (photo handler for edit sessions)
registerEditHandlers(bot);

// Register cleaning workflow handlers (video, checklist callbacks)
registerCleaningHandlers(bot);
registerChecklistHandlers(bot);
registerPhotoHandlers(bot);

// /start in DM: register as owner
bot.start(async (ctx) => {
  if (ctx.chat.type !== 'private') return; // ignore /start in groups

  const db = getDb();
  const telegramId = ctx.from.id;
  const username = ctx.from.username || null;
  const firstName = ctx.from.first_name;

  // Upsert owner
  db.prepare(`
    INSERT INTO owners (telegram_id, username, first_name)
    VALUES (?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name
  `).run(telegramId, username, firstName);

  await ctx.reply(
    `Welcome to TextBud, ${firstName}! I'm your cleaning operations assistant.\n\n` +
    `I help you manage your properties and cleaning teams right here in Telegram.\n\n` +
    `To get started, send "new property" to set up your first property.`
  );
});

/**
 * Central DM text router with priority ordering:
 * 1. Pending group link (number = property selection for group)
 * 2. Pending property select from "my properties" list
 * 3. Active setup session (route to setup handlers via next())
 * 4. Property management triggers ("my properties", "new property")
 * 5. Edit triggers (handled in edit handler via next())
 * 6. Unknown: help message
 */
bot.on('text', async (ctx, next) => {
  if (ctx.chat.type !== 'private') return next();
  if (!ctx.from) return next();

  const ownerTelegramId = ctx.from.id;
  const text = (ctx.message as { text: string }).text.trim();

  // Priority 1: Pending group link
  if (hasPendingGroupLink(ownerTelegramId)) {
    const handled = await handlePropertySelection(ctx);
    if (handled) return;
  }

  // Priority 2: Pending property select (from "my properties" list)
  if (hasPendingPropertySelect(ownerTelegramId)) {
    // If they typed a manage trigger or "new property", clear the pending select and handle normally
    if (isManageTrigger(text) || /^new property$/i.test(text) || /^cancel setup$/i.test(text)) {
      clearPendingPropertySelect(ownerTelegramId);
      // fall through to normal handling below
    } else {
      const handled = await handlePropertySelectReply(ctx);
      if (handled) return;
      // If not a valid number, clear pending and fall through
      clearPendingPropertySelect(ownerTelegramId);
    }
  }

  // Get owner (needed for remaining checks)
  const owner = getOwnerByTelegramId(ownerTelegramId) as Owner | null;

  // Priority 3: Active setup session -- let setup handlers handle it
  // (except for manage triggers which should still work during setup)
  if (owner && !isManageTrigger(text)) {
    const session = getActiveSession(owner.id);
    if (session) {
      // "new property" during active setup is handled by setup handler
      return next();
    }
  }

  // Priority 4: Property management triggers
  if (isManageTrigger(text)) {
    if (!owner) {
      await ctx.reply('Please send /start first to register.');
      return;
    }
    await handleListProperties(ctx, owner);
    return;
  }

  // "new property" -- let setup handler handle it
  if (/^new property$/i.test(text)) {
    return next();
  }

  // "cancel setup" -- let setup handler handle it
  if (/^cancel setup$/i.test(text)) {
    return next();
  }

  // Priority 5: Active edit session or edit triggers
  if (hasActiveEditSession(ownerTelegramId) || /\b(edit|change|update|add|remove)\b/i.test(text)) {
    if (owner) {
      const handled = await handleEditMessage(ctx);
      if (handled) return;
    }
  }

  // Priority 6: Unknown command -- show help
  if (owner) {
    await ctx.reply(
      "I didn't understand that. You can say:\n" +
      '- "my properties" to list your properties\n' +
      '- "new property" to set up a new one\n' +
      '- "edit [something]" to change property details'
    );
  }
});

// Group chat text routing for cleaning workflow
bot.on('text', async (ctx) => {
  if (ctx.chat.type === 'private') return; // DM handler above handles these

  const db = getDb();
  const group = db.prepare(
    'SELECT * FROM telegram_groups WHERE chat_id = ? AND is_active = 1'
  ).get(ctx.chat.id) as TelegramGroup | undefined;

  if (!group) return; // Not a linked group, ignore

  await handleGroupMessage(ctx, group);
});

// Helper: check if a message is from a DM (private chat)
export function isDM(ctx: Context): boolean {
  return ctx.chat?.type === 'private';
}

// Helper: get owner by telegram_id, returns null if not registered
export function getOwnerByTelegramId(telegramId: number) {
  const db = getDb();
  return db.prepare('SELECT * FROM owners WHERE telegram_id = ?').get(telegramId) || null;
}
