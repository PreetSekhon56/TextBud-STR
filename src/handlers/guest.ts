import { Telegraf, Context } from 'telegraf';
import { getDb } from '../db/connection.js';
import { matchFaq } from '../services/faq-matcher.js';
import { FaqEntry, TelegramGroup, Owner } from '../types/index.js';

// Pending "add to FAQ" decisions: ownerTelegramId -> { interactionId, question, chatId, propertyId }
export const pendingFaqAdditions = new Map<number, {
  interactionId: number;
  question: string;
  chatId: number;
  propertyId: number;
}>();

export async function handleGuestMessage(ctx: Context, group: TelegramGroup): Promise<void> {
  if (!ctx.message || !('text' in ctx.message) || !ctx.from) return;

  const text = ctx.message.text.trim();
  if (!text || text.startsWith('/')) return; // Ignore commands

  const db = getDb();
  const guestTelegramId = ctx.from.id;

  // Don't respond to messages from the owner
  const owner = db.prepare('SELECT * FROM owners WHERE id = ?').get(group.owner_id) as Owner | undefined;
  if (owner && owner.telegram_id === guestTelegramId) return;

  // Get FAQ entries for this property
  const faqEntries = db.prepare(
    'SELECT * FROM faq_entries WHERE property_id = ?'
  ).all(group.property_id) as FaqEntry[];

  // Match question against FAQ
  let matchResult;
  try {
    matchResult = await matchFaq(text, faqEntries);
  } catch (err) {
    console.error('[GUEST] FAQ matching error:', err);
    matchResult = { matched: false, answer: null, matchedFaqId: null, confidence: 'none' as const };
  }

  // Log the interaction
  const result = db.prepare(
    `INSERT INTO guest_interactions (property_id, chat_id, guest_telegram_id, question, answer, matched_faq_id, was_answered, owner_notified)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
  ).run(
    group.property_id,
    group.chat_id,
    guestTelegramId,
    text,
    matchResult.answer,
    matchResult.matchedFaqId,
    matchResult.matched ? 1 : 0
  );

  const interactionId = Number(result.lastInsertRowid);

  if (matchResult.matched && matchResult.answer) {
    // Answered from FAQ
    await ctx.reply(matchResult.answer, { reply_parameters: { message_id: ctx.message.message_id } });
  } else {
    // Cannot answer -- notify owner
    await ctx.reply(
      "Good question! Let me check with the property owner and get back to you.",
      { reply_parameters: { message_id: ctx.message.message_id } }
    );

    // DM the owner
    if (owner) {
      const guestName = ctx.from.first_name || 'A guest';
      try {
        await ctx.telegram.sendMessage(
          owner.telegram_id,
          `${guestName} asked a question I couldn't answer:\n\n"${text}"\n\nPlease reply in the group, or reply here with the answer and I'll add it to the FAQ.\n\nTo add to FAQ, reply: add faq: [your answer]`
        );

        // Store pending FAQ addition
        pendingFaqAdditions.set(owner.telegram_id, {
          interactionId,
          question: text,
          chatId: group.chat_id,
          propertyId: group.property_id,
        });

        // Mark owner notified
        db.prepare('UPDATE guest_interactions SET owner_notified = 1 WHERE id = ?').run(interactionId);
      } catch (err) {
        console.error('[GUEST] Failed to DM owner:', err);
      }
    }
  }
}

export function registerGuestHandlers(bot: Telegraf): void {
  // No standalone handlers needed -- guest message handling is done via handleGuestMessage
  // called from bot.ts group text routing
}
