import { Telegraf, Context } from 'telegraf';
import { getDb } from './db/connection.js';

export const bot = new Telegraf(process.env.BOT_TOKEN!);

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

  const owner = db.prepare('SELECT * FROM owners WHERE telegram_id = ?').get(telegramId);

  await ctx.reply(
    `Welcome to TextBud, ${firstName}! I'm your cleaning operations assistant.\n\n` +
    `I help you manage your properties and cleaning teams right here in Telegram.\n\n` +
    `To get started, send "new property" to set up your first property.`
  );
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
