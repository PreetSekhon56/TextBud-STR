import { Telegraf, Context } from 'telegraf';
import { getDb } from '../db/connection.js';
import { isDM, getOwnerByTelegramId } from '../bot.js';
import { Owner, Property, InventoryItem } from '../types/index.js';
import { downloadTelegramPhoto, analyzeReceipt } from '../services/vision.js';

// --- Default starter supply list ---

const DEFAULT_SUPPLY_LIST = [
  'Toilet paper (rolls)',
  'Paper towels (rolls)',
  'Trash bags',
  'Dish soap (bottles)',
  'Laundry detergent pods',
  'Hand soap refills (bottles)',
  'All-purpose cleaner (bottles)',
  'Sponges',
  'Dryer sheets',
  'Coffee pods',
];

// --- In-memory state for inventory setup sessions ---

interface InventorySetupSession {
  ownerId: number;
  propertyId: number;
  step: 'list' | 'par_levels' | 'frequency';
  items: string[];
  currentItemIndex: number;
  parLevels: Map<string, number>;
}

const activeInventorySetups = new Map<number, InventorySetupSession>(); // keyed by owner telegram_id

// --- Pending receipt confirmations ---

interface PendingReceipt {
  propertyId: number;
  items: { name: string; quantity: number; matchedItemId: number | null }[];
}

const pendingReceipts = new Map<number, PendingReceipt>(); // keyed by owner telegram_id

// --- Helper: find owner's property ---

function getOwnerProperties(ownerId: number): Property[] {
  const db = getDb();
  return db.prepare('SELECT * FROM properties WHERE owner_id = ? AND setup_complete = 1')
    .all(ownerId) as Property[];
}

function findInventoryItem(propertyId: number, name: string): InventoryItem | null {
  const db = getDb();
  const item = db.prepare(
    "SELECT * FROM inventory_items WHERE property_id = ? AND is_active = 1 AND name LIKE ? LIMIT 1"
  ).get(propertyId, `%${name}%`) as InventoryItem | undefined;
  return item || null;
}

// --- Setup wizard handler ---

async function handleSetupInventory(ctx: Context, owner: Owner, text: string): Promise<boolean> {
  const telegramId = ctx.from!.id;

  // Check for pending receipt confirmation
  if (pendingReceipts.has(telegramId)) {
    if (/^confirm$/i.test(text.trim())) {
      const receipt = pendingReceipts.get(telegramId)!;
      pendingReceipts.delete(telegramId);
      await applyReceiptItems(ctx, receipt);
      return true;
    } else if (/^cancel$/i.test(text.trim())) {
      pendingReceipts.delete(telegramId);
      await ctx.reply('Receipt cancelled.');
      return true;
    }
  }

  // Check for active inventory setup session
  const session = activeInventorySetups.get(telegramId);
  if (session) {
    return await handleSetupStep(ctx, session, text);
  }

  return false;
}

async function startSetupInventory(ctx: Context, owner: Owner, propertyName?: string): Promise<void> {
  const telegramId = ctx.from!.id;
  const properties = getOwnerProperties(owner.id);

  if (properties.length === 0) {
    await ctx.reply("You don't have any properties set up yet. Send 'new property' first.");
    return;
  }

  let property: Property;
  if (properties.length === 1) {
    property = properties[0];
  } else if (propertyName) {
    const match = properties.find(p => p.name.toLowerCase().includes(propertyName.toLowerCase()));
    if (!match) {
      const list = properties.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
      await ctx.reply(`Couldn't find that property. Which one?\n${list}\n\nSend the number.`);
      return;
    }
    property = match;
  } else {
    const list = properties.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    await ctx.reply(`Which property?\n${list}\n\nSend the number.`);
    return;
  }

  const session: InventorySetupSession = {
    ownerId: owner.id,
    propertyId: property.id,
    step: 'list',
    items: [...DEFAULT_SUPPLY_LIST],
    currentItemIndex: 0,
    parLevels: new Map(),
  };
  activeInventorySetups.set(telegramId, session);

  const listText = session.items.map((item, i) => `${i + 1}. ${item}`).join('\n');
  await ctx.reply(
    `Here's a starter supply list:\n${listText}\n\nSend 'done' to accept this list, or tell me what to add/remove (e.g., 'add Bleach' or 'remove Coffee pods').`
  );
}

async function handleSetupStep(ctx: Context, session: InventorySetupSession, text: string): Promise<boolean> {
  const telegramId = ctx.from!.id;

  switch (session.step) {
    case 'list':
      return await handleListStep(ctx, session, text);
    case 'par_levels':
      return await handleParLevelStep(ctx, session, text);
    case 'frequency':
      return await handleFrequencyStep(ctx, session, text);
    default:
      return false;
  }
}

async function handleListStep(ctx: Context, session: InventorySetupSession, text: string): Promise<boolean> {
  const trimmed = text.trim();

  if (/^done$/i.test(trimmed)) {
    session.step = 'par_levels';
    session.currentItemIndex = 0;
    const item = session.items[0];
    await ctx.reply(`${item} -- what's the minimum you want to keep? (or 'skip')`);
    return true;
  }

  const addMatch = trimmed.match(/^add\s+(.+)/i);
  if (addMatch) {
    const newItem = addMatch[1].trim();
    session.items.push(newItem);
    await ctx.reply(`Added "${newItem}". Send 'done' when the list looks good, or keep adding/removing.`);
    return true;
  }

  const removeMatch = trimmed.match(/^remove\s+(.+)/i);
  if (removeMatch) {
    const toRemove = removeMatch[1].trim().toLowerCase();
    const idx = session.items.findIndex(i => i.toLowerCase().includes(toRemove));
    if (idx >= 0) {
      const removed = session.items.splice(idx, 1)[0];
      await ctx.reply(`Removed "${removed}". Send 'done' when the list looks good.`);
    } else {
      await ctx.reply(`Couldn't find "${removeMatch[1].trim()}" in the list.`);
    }
    return true;
  }

  await ctx.reply("Send 'add [item]', 'remove [item]', or 'done' to accept the list.");
  return true;
}

async function handleParLevelStep(ctx: Context, session: InventorySetupSession, text: string): Promise<boolean> {
  const trimmed = text.trim();

  if (/^skip$/i.test(trimmed)) {
    session.currentItemIndex++;
  } else {
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num > 0) {
      session.parLevels.set(session.items[session.currentItemIndex], num);
      session.currentItemIndex++;
    } else {
      await ctx.reply("Send a number for the minimum, or 'skip'.");
      return true;
    }
  }

  if (session.currentItemIndex >= session.items.length) {
    session.step = 'frequency';
    await ctx.reply(
      "How often should inventory be checked?\n1. Every clean\n2. Every Nth clean (e.g., 'every 3')\n3. Manual only"
    );
    return true;
  }

  const nextItem = session.items[session.currentItemIndex];
  await ctx.reply(`${nextItem} -- what's the minimum you want to keep? (or 'skip')`);
  return true;
}

async function handleFrequencyStep(ctx: Context, session: InventorySetupSession, text: string): Promise<boolean> {
  const telegramId = ctx.from!.id;
  const trimmed = text.trim();
  const db = getDb();

  let frequency = 'every';
  let frequencyN = 1;

  if (trimmed === '1' || /^every clean$/i.test(trimmed)) {
    frequency = 'every';
    frequencyN = 1;
  } else if (trimmed === '3' || /^manual/i.test(trimmed)) {
    frequency = 'manual';
    frequencyN = 1;
  } else {
    const everyMatch = trimmed.match(/^(?:2|every\s*(\d+))/i);
    if (everyMatch) {
      frequency = 'every';
      frequencyN = everyMatch[1] ? parseInt(everyMatch[1], 10) : 2;
      if (trimmed === '2') {
        // Just "2" means "every Nth" -- ask for N
        await ctx.reply("Every how many cleans? (e.g., 'every 3')");
        return true;
      }
    } else {
      await ctx.reply("Send 1, 2, or 3 (or 'every 3', 'manual only').");
      return true;
    }
  }

  // Save inventory items to DB
  for (let i = 0; i < session.items.length; i++) {
    const name = session.items[i];
    const parLevel = session.parLevels.get(name) || null;
    db.prepare(
      'INSERT INTO inventory_items (property_id, name, par_level, sort_order) VALUES (?, ?, ?, ?)'
    ).run(session.propertyId, name, parLevel, i);
  }

  // Update property frequency
  db.prepare(
    'UPDATE properties SET inventory_frequency = ?, inventory_frequency_n = ? WHERE id = ?'
  ).run(frequency, frequencyN, session.propertyId);

  activeInventorySetups.delete(telegramId);

  const freqLabel = frequency === 'manual' ? 'manual only' : frequencyN === 1 ? 'every clean' : `every ${frequencyN} cleans`;
  await ctx.reply(
    `Inventory set up with ${session.items.length} items. Checking: ${freqLabel}.\n\n` +
    `Your cleaners will be prompted to count supplies after cleaning.`
  );
  return true;
}

// --- Restock handler ---

async function handleRestock(ctx: Context, owner: Owner, text: string): Promise<boolean> {
  const match = text.match(/\brestock(ed)?\s+(.+?)\s+(\d+)/i);
  if (!match) return false;

  const itemName = match[2].trim();
  const quantity = parseInt(match[3], 10);

  const properties = getOwnerProperties(owner.id);
  if (properties.length === 0) {
    await ctx.reply("No properties set up yet.");
    return true;
  }

  // Search across all properties for matching item
  for (const property of properties) {
    const item = findInventoryItem(property.id, itemName);
    if (item) {
      const db = getDb();
      const newCount = (item.last_count || 0) + quantity;

      db.prepare(`
        INSERT INTO inventory_counts (inventory_item_id, count, previous_count, consumption_delta, counted_by, notes)
        VALUES (?, ?, ?, ?, 'owner', 'restock')
      `).run(item.id, newCount, item.last_count, null);

      db.prepare(
        'UPDATE inventory_items SET last_count = ?, last_counted_at = datetime(\'now\') WHERE id = ?'
      ).run(newCount, item.id);

      await ctx.reply(`Updated ${item.name}: now ${newCount} in stock.`);
      return true;
    }
  }

  await ctx.reply(`Couldn't find '${itemName}' in your inventory. Check 'my inventory' to see your items.`);
  return true;
}

// --- Show inventory handler ---

async function handleShowInventory(ctx: Context, owner: Owner, text: string): Promise<boolean> {
  const properties = getOwnerProperties(owner.id);
  if (properties.length === 0) {
    await ctx.reply("No properties set up yet.");
    return true;
  }

  // Check if specific property mentioned
  const propMatch = text.match(/inventory\s+for\s+(.+)/i);
  let targetProperties = properties;
  if (propMatch) {
    const name = propMatch[1].trim();
    const match = properties.find(p => p.name.toLowerCase().includes(name.toLowerCase()));
    if (match) targetProperties = [match];
  }

  const db = getDb();
  for (const property of targetProperties) {
    const items = db.prepare(
      'SELECT * FROM inventory_items WHERE property_id = ? AND is_active = 1 ORDER BY sort_order'
    ).all(property.id) as InventoryItem[];

    if (items.length === 0) {
      await ctx.reply(`No inventory items for ${property.name}. Set up with 'setup inventory'.`);
      continue;
    }

    const lines = items.map(item => {
      let line = `- ${item.name}: ${item.last_count ?? '?'}`;
      if (item.par_level !== null) {
        const status = item.last_count !== null && item.last_count <= item.par_level ? 'LOW' : 'OK';
        line += ` (min: ${item.par_level}) ${status}`;
      } else {
        line += ' (no minimum set)';
      }
      return line;
    });

    await ctx.reply(`Inventory for ${property.name}:\n${lines.join('\n')}`);
  }

  return true;
}

// --- Receipt photo handler ---

async function handleReceiptPhoto(ctx: Context, owner: Owner): Promise<void> {
  const telegramId = ctx.from!.id;
  const properties = getOwnerProperties(owner.id);
  if (properties.length === 0) {
    await ctx.reply("No properties set up yet.");
    return;
  }

  if (!ctx.message || !('photo' in ctx.message)) return;

  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id;

  await ctx.reply('Scanning receipt...');

  try {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const photoBase64 = await downloadTelegramPhoto(fileLink.toString());
    const result = await analyzeReceipt(photoBase64);

    if (result.items.length === 0) {
      await ctx.reply("Couldn't find any cleaning supply items on this receipt.");
      return;
    }

    // Match items to inventory
    const propertyId = properties[0].id; // Default to first property
    const matchedItems = result.items.map(item => {
      const matched = findInventoryItem(propertyId, item.name);
      return {
        name: item.name,
        quantity: item.quantity,
        matchedItemId: matched?.id || null,
      };
    });

    pendingReceipts.set(telegramId, { propertyId, items: matchedItems });

    const lines = matchedItems.map((item, i) => {
      const matchLabel = item.matchedItemId ? '' : ' (no match found)';
      return `${i + 1}. ${item.name} x${item.quantity}${matchLabel}`;
    });

    await ctx.reply(
      `I found these items on the receipt:\n${lines.join('\n')}\n\nSend 'confirm' to add these to inventory, or 'cancel' to discard.`
    );
  } catch (err) {
    console.error('[INVENTORY-SETUP] Receipt scanning error:', err);
    await ctx.reply('Error scanning receipt. Please try again.');
  }
}

async function applyReceiptItems(ctx: Context, receipt: PendingReceipt): Promise<void> {
  const db = getDb();
  let updated = 0;

  for (const item of receipt.items) {
    if (!item.matchedItemId) continue;

    const existing = db.prepare('SELECT * FROM inventory_items WHERE id = ?')
      .get(item.matchedItemId) as InventoryItem | undefined;
    if (!existing) continue;

    const newCount = (existing.last_count || 0) + item.quantity;

    db.prepare(`
      INSERT INTO inventory_counts (inventory_item_id, count, previous_count, consumption_delta, counted_by, notes)
      VALUES (?, ?, ?, ?, 'owner', 'receipt restock')
    `).run(item.matchedItemId, newCount, existing.last_count, null);

    db.prepare(
      'UPDATE inventory_items SET last_count = ?, last_counted_at = datetime(\'now\') WHERE id = ?'
    ).run(newCount, item.matchedItemId);

    updated++;
  }

  await ctx.reply(`Updated ${updated} inventory item(s) from receipt.`);
}

// --- Register handlers ---

export function registerInventorySetupHandlers(bot: Telegraf): void {
  // Receipt photo handler (DM only, caption contains "receipt")
  bot.on('photo', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    if (!ctx.from) return;

    const caption = (ctx.message as any).caption || '';
    if (!/receipt/i.test(caption)) return;

    const owner = getOwnerByTelegramId(ctx.from.id) as Owner | null;
    if (!owner) return;

    await handleReceiptPhoto(ctx, owner);
  });

  // Text handlers for inventory setup/management
  bot.hears(/\b(setup inventory|my inventory|show inventory|inventory for|restock)/i, async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    if (!ctx.from) return;

    const owner = getOwnerByTelegramId(ctx.from.id) as Owner | null;
    if (!owner) {
      await ctx.reply('Please send /start first to register.');
      return;
    }

    const text = (ctx.message as { text: string }).text.trim();

    // Check for active setup session first
    if (activeInventorySetups.has(ctx.from.id) || pendingReceipts.has(ctx.from.id)) {
      const handled = await handleSetupInventory(ctx, owner, text);
      if (handled) return;
    }

    // Setup inventory
    if (/^setup inventory/i.test(text)) {
      const propMatch = text.match(/setup inventory\s+for\s+(.+)/i);
      await startSetupInventory(ctx, owner, propMatch?.[1]);
      return;
    }

    // Restock
    if (/\brestock/i.test(text)) {
      const handled = await handleRestock(ctx, owner, text);
      if (handled) return;
    }

    // Show inventory
    if (/\b(my inventory|show inventory|inventory for)\b/i.test(text)) {
      await handleShowInventory(ctx, owner, text);
      return;
    }
  });

  // Catch-all text handler for active inventory setup sessions
  bot.on('text', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next();
    if (!ctx.from) return next();

    const telegramId = ctx.from.id;
    if (!activeInventorySetups.has(telegramId) && !pendingReceipts.has(telegramId)) return next();

    const owner = getOwnerByTelegramId(telegramId) as Owner | null;
    if (!owner) return next();

    const text = (ctx.message as { text: string }).text.trim();
    const handled = await handleSetupInventory(ctx, owner, text);
    if (!handled) return next();
  });
}
