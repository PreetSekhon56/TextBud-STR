import { Telegraf, Context } from 'telegraf';
import { getDb } from '../db/connection.js';
import { isDM, getOwnerByTelegramId } from '../bot.js';
import { Owner, Property } from '../types/index.js';

// Active property per owner: ownerTelegramId -> propertyId
const activePropertyMap = new Map<number, number>();

// Tracks whether an owner just saw the property list and a number reply means "select property"
const pendingPropertySelect = new Map<number, number[]>(); // ownerTelegramId -> property IDs in display order

/**
 * Get the active property ID for an owner. Defaults to first property if none selected.
 */
export function getActivePropertyId(ownerTelegramId: number): number | null {
  const cached = activePropertyMap.get(ownerTelegramId);
  if (cached !== undefined) return cached;

  // Default to first property
  const db = getDb();
  const owner = db.prepare('SELECT * FROM owners WHERE telegram_id = ?').get(ownerTelegramId) as Owner | undefined;
  if (!owner) return null;

  const first = db.prepare(
    'SELECT id FROM properties WHERE owner_id = ? ORDER BY created_at LIMIT 1'
  ).get(owner.id) as { id: number } | undefined;

  if (first) {
    activePropertyMap.set(ownerTelegramId, first.id);
    return first.id;
  }

  return null;
}

/**
 * Set the active property for an owner.
 */
export function setActivePropertyId(ownerTelegramId: number, propertyId: number): void {
  activePropertyMap.set(ownerTelegramId, propertyId);
}

/**
 * Check if owner has a pending property selection (from "my properties" list).
 */
export function hasPendingPropertySelect(ownerTelegramId: number): boolean {
  return pendingPropertySelect.has(ownerTelegramId);
}

/**
 * Clear pending property selection state for an owner.
 */
export function clearPendingPropertySelect(ownerTelegramId: number): void {
  pendingPropertySelect.delete(ownerTelegramId);
}

/**
 * Try to handle a numeric reply as property selection.
 * Returns true if handled.
 */
export async function handlePropertySelectReply(ctx: Context): Promise<boolean> {
  if (!ctx.from || !ctx.message || !('text' in ctx.message)) return false;

  const ownerTelegramId = ctx.from.id;
  const propertyIds = pendingPropertySelect.get(ownerTelegramId);
  if (!propertyIds) return false;

  const text = ctx.message.text.trim();
  const selection = parseInt(text, 10);
  if (isNaN(selection) || selection < 1 || selection > propertyIds.length) {
    return false; // not a valid selection, let other handlers try
  }

  const selectedPropertyId = propertyIds[selection - 1];
  const db = getDb();
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(selectedPropertyId) as Property | undefined;

  if (!property) {
    await ctx.reply('That property no longer exists. Send "my properties" to see your current list.');
    pendingPropertySelect.delete(ownerTelegramId);
    return true;
  }

  setActivePropertyId(ownerTelegramId, property.id);
  pendingPropertySelect.delete(ownerTelegramId);

  await ctx.reply(`Switched to ${property.name}. What would you like to do?`);
  return true;
}

/**
 * Check if text matches a manage trigger (my properties, list properties, properties).
 */
export function isManageTrigger(text: string): boolean {
  return /^(my properties|properties|list properties)$/i.test(text.trim());
}

/**
 * Handle the "my properties" / "list properties" command.
 */
async function handleListProperties(ctx: Context, owner: Owner): Promise<void> {
  const db = getDb();
  const properties = db.prepare(
    'SELECT * FROM properties WHERE owner_id = ? ORDER BY created_at'
  ).all(owner.id) as Property[];

  if (properties.length === 0) {
    await ctx.reply(
      "You don't have any properties yet. Send \"new property\" to set up your first one."
    );
    return;
  }

  const ownerTelegramId = ctx.from!.id;
  const activeId = getActivePropertyId(ownerTelegramId);

  const lines = properties.map((p, i) => {
    const status = p.setup_complete ? 'setup complete' : 'setup in progress';
    const active = p.id === activeId ? ' [ACTIVE]' : '';
    return `${i + 1}. ${p.name} (${status})${active}`;
  });

  // Store property IDs for selection
  pendingPropertySelect.set(ownerTelegramId, properties.map(p => p.id));

  await ctx.reply(
    `Your properties:\n${lines.join('\n')}\n\nReply with a number to switch, or send "new property" to add another.`
  );
}

export function registerManageHandlers(bot: Telegraf): void {
  // This handler is registered via the DM router in bot.ts.
  // The actual routing logic is in bot.ts to maintain priority ordering.
  // This module exports the helper functions used by the router.
}

// Export the list handler for use by the DM router in bot.ts
export { handleListProperties };
