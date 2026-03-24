import { Telegraf, Context } from 'telegraf';
import { getDb } from '../db/connection.js';
import { Owner, Property, Cleaner, TelegramGroup } from '../types/index.js';

// In-memory pending group links: ownerTelegramId -> pending link info
interface PendingGroupLink {
  chatId: number;
  cleanerTelegramId: number;
  cleanerFirstName: string;
  cleanerUsername: string | null;
}

const pendingGroupLinks = new Map<number, PendingGroupLink>();

/**
 * Check if an owner has a pending group link and a message is a numeric selection.
 * Used by bot.ts to route DM messages appropriately.
 */
export function hasPendingGroupLink(ownerTelegramId: number): boolean {
  return pendingGroupLinks.has(ownerTelegramId);
}

/**
 * Handle property selection from owner DM when there's a pending group link.
 * Returns true if handled, false if not applicable.
 */
export async function handlePropertySelection(ctx: Context): Promise<boolean> {
  if (!ctx.from || !ctx.message || !('text' in ctx.message)) return false;

  const ownerTelegramId = ctx.from.id;
  const pending = pendingGroupLinks.get(ownerTelegramId);
  if (!pending) return false;

  const text = ctx.message.text.trim();
  const selection = parseInt(text, 10);
  if (isNaN(selection) || selection < 1) return false;

  const db = getDb();

  // Get the owner
  const owner = db.prepare('SELECT * FROM owners WHERE telegram_id = ?').get(ownerTelegramId) as Owner | undefined;
  if (!owner) return false;

  // Get completed properties for this owner
  const properties = db.prepare(
    'SELECT * FROM properties WHERE owner_id = ? AND setup_complete = 1 ORDER BY id'
  ).all(owner.id) as Property[];

  if (selection > properties.length) {
    await ctx.reply(`Please pick a number between 1 and ${properties.length}.`);
    return true;
  }

  const property = properties[selection - 1];

  // Upsert cleaner
  db.prepare(`
    INSERT INTO cleaners (telegram_id, username, first_name)
    VALUES (?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name
  `).run(pending.cleanerTelegramId, pending.cleanerUsername, pending.cleanerFirstName);

  const cleaner = db.prepare('SELECT * FROM cleaners WHERE telegram_id = ?').get(pending.cleanerTelegramId) as Cleaner;

  // Create telegram_groups row
  db.prepare(`
    INSERT INTO telegram_groups (chat_id, property_id, owner_id, cleaner_id, group_type, is_active)
    VALUES (?, ?, ?, ?, 'cleaning', 1)
    ON CONFLICT(chat_id) DO UPDATE SET
      property_id = excluded.property_id,
      owner_id = excluded.owner_id,
      cleaner_id = excluded.cleaner_id,
      group_type = excluded.group_type,
      is_active = 1
  `).run(pending.chatId, property.id, owner.id, cleaner.id);

  // Send welcome message to the GROUP
  try {
    await ctx.telegram.sendMessage(
      pending.chatId,
      `Hi ${pending.cleanerFirstName}! I'm TextBud, ${owner.first_name}'s cleaning assistant for ${property.name}. ` +
      `I'll guide you through each clean. Text me when you arrive!`
    );
  } catch (err) {
    console.error('Failed to send welcome message to group:', err);
  }

  // Confirm to owner via DM
  await ctx.reply(
    `Group linked to ${property.name}. ${pending.cleanerFirstName} is all set!`
  );

  // Clear the pending link
  pendingGroupLinks.delete(ownerTelegramId);

  return true;
}

/**
 * Start the property linking flow: DM the owner with a property list.
 */
async function startPropertyLinkingFlow(
  telegram: Telegraf['telegram'],
  ownerTelegramId: number,
  owner: Owner,
  chatId: number,
  cleanerTelegramId: number,
  cleanerFirstName: string,
  cleanerUsername: string | null
): Promise<void> {
  const db = getDb();

  // Get owner's completed properties
  const properties = db.prepare(
    'SELECT * FROM properties WHERE owner_id = ? AND setup_complete = 1 ORDER BY id'
  ).all(owner.id) as Property[];

  if (properties.length === 0) {
    // Owner has no completed properties
    try {
      await telegram.sendMessage(
        ownerTelegramId,
        `You don't have any properties set up yet. Send "new property" to create one first.`
      );
    } catch (err) {
      console.error('Failed to DM owner about missing properties:', err);
    }
    return;
  }

  // Store pending link
  pendingGroupLinks.set(ownerTelegramId, {
    chatId,
    cleanerTelegramId,
    cleanerFirstName,
    cleanerUsername,
  });

  // Build numbered property list
  const propertyList = properties
    .map((p, i) => `${i + 1}. ${p.name}`)
    .join('\n');

  try {
    await telegram.sendMessage(
      ownerTelegramId,
      `I've been added to a group with ${cleanerFirstName}. Which property should I link this group to?\n\n${propertyList}\n\nReply with the number.`
    );
  } catch (err) {
    console.error('Failed to DM owner for property selection:', err);
  }
}

/**
 * Identify the owner and cleaner in a group chat.
 * Returns { owner, cleanerUser } or null if owner not found.
 */
async function identifyGroupMembers(
  telegram: Telegraf['telegram'],
  chatId: number,
  botId: number
): Promise<{ owner: Owner; cleanerUser: { id: number; first_name: string; username?: string } } | null> {
  const db = getDb();

  // Get chat administrators (includes creator and admins -- covers group members for small groups)
  // For a typical 3-person group (owner + cleaner + bot), the creator/admin list helps identify members.
  // We also use getChatMember for known members.
  let admins: Awaited<ReturnType<typeof telegram.getChatAdministrators>>;
  try {
    admins = await telegram.getChatAdministrators(chatId);
  } catch {
    admins = [];
  }

  let foundOwner: Owner | null = null;
  let cleanerUser: { id: number; first_name: string; username?: string } | null = null;

  for (const admin of admins) {
    if (admin.user.is_bot) continue; // skip bots

    const owner = db.prepare('SELECT * FROM owners WHERE telegram_id = ?').get(admin.user.id) as Owner | undefined;
    if (owner) {
      foundOwner = owner;
    } else {
      // Non-owner, non-bot member is the cleaner
      cleanerUser = {
        id: admin.user.id,
        first_name: admin.user.first_name,
        username: admin.user.username,
      };
    }
  }

  if (!foundOwner) return null;

  if (cleanerUser) {
    return { owner: foundOwner, cleanerUser };
  }

  // If we only found the owner but no cleaner in admins, return owner-only
  // (cleaner may join later or is a non-admin member)
  return { owner: foundOwner, cleanerUser: null as unknown as { id: number; first_name: string; username?: string } };
}

export function registerGroupHandlers(bot: Telegraf): void {
  const botInfo = { id: 0 }; // will be populated on first event

  /**
   * my_chat_member: Fired when the BOT's membership status changes in a chat.
   * We use this to detect when the bot is added to a group.
   */
  bot.on('my_chat_member', async (ctx) => {
    const update = ctx.myChatMember;
    if (!update) return;

    // Only care about being added to a group/supergroup
    const chat = update.chat;
    if (chat.type !== 'group' && chat.type !== 'supergroup') return;

    const newStatus = update.new_chat_member.status;
    const oldStatus = update.old_chat_member.status;

    // Bot was added (went from left/kicked to member/administrator)
    const wasAdded = (oldStatus === 'left' || oldStatus === 'kicked') &&
      (newStatus === 'member' || newStatus === 'administrator');

    if (!wasAdded) return;

    // Cache bot ID
    if (botInfo.id === 0) {
      const me = await ctx.telegram.getMe();
      botInfo.id = me.id;
    }

    const chatId = chat.id;
    const db = getDb();

    // Try to identify owner and cleaner from group admins/members
    const result = await identifyGroupMembers(ctx.telegram, chatId, botInfo.id);

    if (!result) {
      // No registered owner found
      await ctx.reply(
        "I don't recognize anyone here as a registered owner. The property owner needs to DM me /start first."
      );
      return;
    }

    const { owner, cleanerUser } = result;

    if (!cleanerUser || !cleanerUser.id) {
      // Owner found but no cleaner yet -- wait for cleaner to join
      // Store a partial pending state so chat_member can pick up later
      // We use the DB to track groups waiting for a cleaner
      console.log(`Bot added to group ${chatId} with owner ${owner.first_name}, waiting for cleaner to join.`);
      return;
    }

    // Both owner and cleaner identified -- start the property linking flow
    await startPropertyLinkingFlow(
      ctx.telegram,
      owner.telegram_id,
      owner,
      chatId,
      cleanerUser.id,
      cleanerUser.first_name,
      cleanerUser.username || null
    );
  });

  /**
   * chat_member: Fired when any user's membership changes in a chat the bot is in.
   * Used to detect when a cleaner joins a group that's already waiting for one.
   */
  bot.on('chat_member', async (ctx) => {
    const update = ctx.chatMember;
    if (!update) return;

    const chat = update.chat;
    if (chat.type !== 'group' && chat.type !== 'supergroup') return;

    const newStatus = update.new_chat_member.status;
    const oldStatus = update.old_chat_member.status;

    // New member joined
    const memberJoined = (oldStatus === 'left' || oldStatus === 'kicked') &&
      (newStatus === 'member' || newStatus === 'administrator' || newStatus === 'creator');

    if (!memberJoined) return;

    const newUser = update.new_chat_member.user;
    if (newUser.is_bot) return; // skip other bots

    const db = getDb();
    const chatId = chat.id;

    // Check if this group already has a linked property
    const existingGroup = db.prepare('SELECT * FROM telegram_groups WHERE chat_id = ?').get(chatId) as TelegramGroup | undefined;
    if (existingGroup) return; // group already linked, nothing to do

    // Check if this new member is an owner (owners don't become cleaners)
    const isOwner = db.prepare('SELECT * FROM owners WHERE telegram_id = ?').get(newUser.id) as Owner | undefined;
    if (isOwner) return;

    // This user is likely the cleaner. Find the owner in this group.
    if (botInfo.id === 0) {
      const me = await ctx.telegram.getMe();
      botInfo.id = me.id;
    }

    const result = await identifyGroupMembers(ctx.telegram, chatId, botInfo.id);

    if (!result || !result.owner) return;

    // Start the linking flow with this new member as the cleaner
    await startPropertyLinkingFlow(
      ctx.telegram,
      result.owner.telegram_id,
      result.owner,
      chatId,
      newUser.id,
      newUser.first_name,
      newUser.username || null
    );
  });
}
