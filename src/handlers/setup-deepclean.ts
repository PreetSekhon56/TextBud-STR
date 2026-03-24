import { Context } from 'telegraf';
import { getDb } from '../db/connection.js';
import { SetupSession } from '../types/index.js';

export async function promptDeepClean(ctx: Context): Promise<void> {
  await ctx.reply(
    "How often should a deep clean happen? Enter a number " +
    "(e.g., 10 means every 10th clean is a deep clean). Most owners do every 5-10 cleans."
  );
}

export async function handleDeepCleanSetup(ctx: Context, session: SetupSession): Promise<'step_complete' | 'waiting'> {
  const text = 'text' in (ctx.message || {}) ? (ctx.message as { text: string }).text.trim() : '';
  if (!text) return 'waiting';

  const num = parseInt(text, 10);

  if (isNaN(num) || num <= 0) {
    await ctx.reply("Please enter a positive number (e.g., 10).");
    return 'waiting';
  }

  const db = getDb();
  db.prepare('UPDATE properties SET deep_clean_cycle = ? WHERE id = ?')
    .run(num, session.property_id);

  await ctx.reply(`Deep clean set for every ${num} cleans.`);
  return 'step_complete';
}
