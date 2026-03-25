import { Telegraf, Context } from 'telegraf';
import { getDb } from '../db/connection.js';
import { ActiveInventorySession, InventoryItem } from '../types/index.js';
import { downloadTelegramPhoto, analyzeInventoryPhoto } from '../services/vision.js';
import { appendLowStockAlerts } from './reporting.js';

// --- Active inventory sessions keyed by chatId ---

export const activeInventorySessions = new Map<number, ActiveInventorySession>();

// --- Timeout tracking ---

const sessionTimeouts = new Map<number, ReturnType<typeof setTimeout>>();
const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function resetTimeout(session: ActiveInventorySession, ctx: Context): void {
  session.lastActivity = Date.now();

  const existing = sessionTimeouts.get(session.chatId);
  if (existing) clearTimeout(existing);

  const timeout = setTimeout(async () => {
    const current = activeInventorySessions.get(session.chatId);
    if (current && current.lastActivity === session.lastActivity) {
      // Session timed out -- auto-complete with partial data
      try {
        await completeInventory(ctx, current);
        await ctx.reply('Inventory check timed out. Saved what we had.');
      } catch (err) {
        console.error('[INVENTORY] Timeout auto-complete error:', err);
        activeInventorySessions.delete(session.chatId);
      }
      sessionTimeouts.delete(session.chatId);
    }
  }, TIMEOUT_MS);

  sessionTimeouts.set(session.chatId, timeout);
}

// --- Inventory frequency check ---

function isInventoryDue(propertyId: number): boolean {
  const db = getDb();
  const property = db.prepare('SELECT inventory_frequency, inventory_frequency_n FROM properties WHERE id = ?')
    .get(propertyId) as { inventory_frequency: string | null; inventory_frequency_n: number | null } | undefined;
  if (!property) return false;
  if (property.inventory_frequency === 'manual') return false;
  if (property.inventory_frequency === 'every') return true;

  // 'every_n': count completed sessions since last inventory
  const lastInventory = db.prepare(`
    SELECT MAX(created_at) as last_at FROM inventory_counts ic
    JOIN inventory_items ii ON ic.inventory_item_id = ii.id
    WHERE ii.property_id = ?
  `).get(propertyId) as { last_at: string | null } | undefined;

  if (!lastInventory?.last_at) return true; // never done, do it

  const sessionsSince = db.prepare(`
    SELECT COUNT(*) as cnt FROM cleaning_sessions
    WHERE property_id = ? AND completed_at > ? AND completed_at IS NOT NULL
  `).get(propertyId, lastInventory.last_at) as { cnt: number };

  const frequencyN = property.inventory_frequency_n || 1;
  return sessionsSince.cnt >= frequencyN;
}

// --- Alarming drop detection ---

function isAlarmingDrop(itemId: number, newCount: number, previousCount: number | null): boolean {
  if (previousCount === null) return false;
  const db = getDb();
  const recentDeltas = db.prepare(`
    SELECT consumption_delta FROM inventory_counts
    WHERE inventory_item_id = ? AND consumption_delta IS NOT NULL
    ORDER BY created_at DESC LIMIT 5
  `).all(itemId) as { consumption_delta: number }[];

  const currentDelta = previousCount - newCount;
  if (currentDelta <= 0) return false; // count went up (restocked) or unchanged

  if (recentDeltas.length >= 5) {
    const avgDelta = recentDeltas.reduce((sum, r) => sum + r.consumption_delta, 0) / recentDeltas.length;
    return currentDelta > avgDelta * 2;
  } else {
    // Less than 5 data points: flag if dropped by more than 50%
    return currentDelta > previousCount * 0.5;
  }
}

// --- Threshold recommendations ---

function generateThresholdRecommendations(propertyId: number): { itemName: string; currentParLevel: number; recommendedParLevel: number; reason: string }[] {
  const db = getDb();
  const items = db.prepare(`
    SELECT id, name, par_level FROM inventory_items
    WHERE property_id = ? AND is_active = 1 AND par_level IS NOT NULL
  `).all(propertyId) as { id: number; name: string; par_level: number }[];

  const recommendations: { itemName: string; currentParLevel: number; recommendedParLevel: number; reason: string }[] = [];

  for (const item of items) {
    const deltas = db.prepare(`
      SELECT consumption_delta FROM inventory_counts
      WHERE inventory_item_id = ? AND consumption_delta IS NOT NULL AND consumption_delta > 0
      ORDER BY created_at DESC LIMIT 10
    `).all(item.id) as { consumption_delta: number }[];

    if (deltas.length < 5) continue; // Need enough data

    const avgConsumption = deltas.reduce((sum, d) => sum + d.consumption_delta, 0) / deltas.length;
    const recommended = Math.ceil(avgConsumption * 2); // 2-clean buffer

    // Only recommend if more than 30% off
    const diff = Math.abs(recommended - item.par_level) / item.par_level;
    if (diff > 0.3) {
      const direction = recommended > item.par_level ? 'raising' : 'lowering';
      recommendations.push({
        itemName: item.name,
        currentParLevel: item.par_level,
        recommendedParLevel: recommended,
        reason: `Average usage is ${avgConsumption.toFixed(1)}/clean -- ${direction} to ${recommended} gives a 2-clean buffer`
      });
    }
  }

  return recommendations;
}

// --- Start inventory walkthrough ---

export async function startInventoryWalkthrough(
  ctx: Context,
  cleaningSessionId: number,
  propertyId: number,
  cleanerId: number,
  chatId: number
): Promise<void> {
  // Check if inventory is due
  if (!isInventoryDue(propertyId)) return;

  const db = getDb();
  const items = db.prepare(
    'SELECT * FROM inventory_items WHERE property_id = ? AND is_active = 1 ORDER BY sort_order'
  ).all(propertyId) as InventoryItem[];

  if (items.length === 0) return; // No inventory items configured

  const session: ActiveInventorySession = {
    sessionId: cleaningSessionId,
    propertyId,
    chatId,
    cleanerId,
    items,
    currentItemIndex: 0,
    counts: new Map(),
    photos: new Map(),
    waitingForInventoryPhoto: false,
    lastActivity: Date.now(),
  };

  activeInventorySessions.set(chatId, session);
  resetTimeout(session, ctx);

  await ctx.reply("Now let's do a quick inventory check.");
  await promptNextInventoryItem(ctx, session);
}

// --- Handle inventory text response ---

export async function handleInventoryResponse(ctx: Context, session: ActiveInventorySession): Promise<boolean> {
  if (!ctx.message || !('text' in ctx.message)) return false;

  const text = ctx.message.text.trim();
  resetTimeout(session, ctx);

  // If waiting for photo, ignore text unless it's 'skip'
  if (session.waitingForInventoryPhoto) {
    if (/^skip$/i.test(text)) {
      session.waitingForInventoryPhoto = false;
      session.currentItemIndex++;
      await promptNextInventoryItem(ctx, session);
      return true;
    }
    await ctx.reply("Send a photo, or 'skip' to move on.");
    return true;
  }

  // Check for skip
  if (/^skip$/i.test(text)) {
    session.currentItemIndex++;
    await promptNextInventoryItem(ctx, session);
    return true;
  }

  // Parse number
  const numberMatch = text.match(/\d+/);
  if (!numberMatch) {
    await ctx.reply("Just send me the number, or 'skip' to move on.");
    return true;
  }

  const count = parseInt(numberMatch[0], 10);
  const currentItem = session.items[session.currentItemIndex];
  session.counts.set(currentItem.id, count);

  // Check for alarming drop
  if (isAlarmingDrop(currentItem.id, count, currentItem.last_count)) {
    session.waitingForInventoryPhoto = true;
    await ctx.reply(`That's a big drop. Can you send a photo of the ${currentItem.name}?`);
    return true;
  }

  // Advance to next item
  session.currentItemIndex++;
  await promptNextInventoryItem(ctx, session);
  return true;
}

// --- Handle inventory photo ---

export async function handleInventoryPhoto(ctx: Context, session: ActiveInventorySession): Promise<void> {
  if (!ctx.message || !('photo' in ctx.message)) return;

  resetTimeout(session, ctx);

  const currentItem = session.items[session.currentItemIndex];
  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id;

  // Store photo file_id
  session.photos.set(currentItem.id, fileId);

  try {
    // Download and analyze photo
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const photoBase64 = await downloadTelegramPhoto(fileLink.toString());
    const analysis = await analyzeInventoryPhoto(photoBase64, currentItem.name);

    let reply = analysis.description;
    if (analysis.estimatedCount !== null) {
      reply += ` (AI estimate: ${analysis.estimatedCount})`;
    }
    await ctx.reply(reply);
  } catch (err) {
    console.error('[INVENTORY] Photo analysis error:', err);
    await ctx.reply('Got the photo. Moving on.');
  }

  session.waitingForInventoryPhoto = false;
  session.currentItemIndex++;
  await promptNextInventoryItem(ctx, session);
}

// --- Prompt next item or complete ---

export async function promptNextInventoryItem(ctx: Context, session: ActiveInventorySession): Promise<void> {
  if (session.currentItemIndex >= session.items.length) {
    await completeInventory(ctx, session);
    return;
  }

  const item = session.items[session.currentItemIndex];
  let prompt = `${item.name} -- how many left?`;
  if (item.last_count !== null) {
    prompt += ` (last count: ${item.last_count})`;
  }
  await ctx.reply(prompt);
}

// --- Complete inventory ---

export async function completeInventory(ctx: Context, session: ActiveInventorySession): Promise<void> {
  const db = getDb();

  const lowStockItems: { name: string; count: number; parLevel: number }[] = [];

  // Persist all counts
  for (const [itemId, count] of session.counts) {
    const item = session.items.find(i => i.id === itemId);
    if (!item) continue;

    const previousCount = item.last_count;
    const consumptionDelta = previousCount !== null ? previousCount - count : null;

    const result = db.prepare(`
      INSERT INTO inventory_counts (inventory_item_id, session_id, count, previous_count, consumption_delta, counted_by)
      VALUES (?, ?, ?, ?, ?, 'cleaner')
    `).run(itemId, session.sessionId, count, previousCount, consumptionDelta);

    const countId = Number(result.lastInsertRowid);

    // Update inventory item
    db.prepare(`
      UPDATE inventory_items SET last_count = ?, last_counted_at = datetime('now') WHERE id = ?
    `).run(count, itemId);

    // Persist photo if any
    const photoFileId = session.photos.get(itemId);
    if (photoFileId) {
      db.prepare(`
        INSERT INTO inventory_photos (inventory_count_id, file_id) VALUES (?, ?)
      `).run(countId, photoFileId);
    }

    // Check low stock
    if (item.par_level !== null && count <= item.par_level) {
      lowStockItems.push({ name: item.name, count, parLevel: item.par_level });
    }
  }

  // Send low-stock alerts via appendLowStockAlerts (session-labeled follow-up)
  await appendLowStockAlerts(ctx, session.sessionId, lowStockItems);

  // Generate and send threshold recommendations
  const recommendations = generateThresholdRecommendations(session.propertyId);
  for (const rec of recommendations) {
    await ctx.reply(
      `Threshold suggestion: Consider changing ${rec.itemName} minimum from ${rec.currentParLevel} to ${rec.recommendedParLevel} -- based on average usage of ${rec.reason.match(/[\d.]+\/clean/)?.[0] || 'N/A'}.`
    );
  }

  // Clean up
  const timeout = sessionTimeouts.get(session.chatId);
  if (timeout) {
    clearTimeout(timeout);
    sessionTimeouts.delete(session.chatId);
  }
  activeInventorySessions.delete(session.chatId);
}

// --- Register inventory handlers ---

export function registerInventoryHandlers(bot: Telegraf): void {
  // Photo handler for group chats -- inventory photo during walkthrough
  bot.on('photo', async (ctx) => {
    if (ctx.chat.type === 'private') return;

    const session = activeInventorySessions.get(ctx.chat.id);
    if (!session || !session.waitingForInventoryPhoto) return;

    await handleInventoryPhoto(ctx, session);
  });
}
