import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { getDb } from '../db/connection.js';
import { isDM, getOwnerByTelegramId } from '../bot.js';
import { getActivePropertyId, setActivePropertyId } from './manage.js';
import { getActiveSession } from './setup.js';
import { Owner, Property, Room, FaqEntry, Checklist, ChecklistItem, StagingPhoto } from '../types/index.js';

// Edit session state per owner
interface EditState {
  target: string;        // 'room' | 'checklist' | 'faq' | 'photo' | 'deep_clean' | 'name'
  action: string;        // 'add' | 'remove' | 'rename' | 'update' | 'view'
  step: string;          // current step within the edit flow
  data?: Record<string, unknown>;
}

const editSessions = new Map<number, EditState>();

/**
 * Check if an owner has an active edit session.
 */
export function hasActiveEditSession(ownerTelegramId: number): boolean {
  return editSessions.has(ownerTelegramId);
}

/**
 * Clear the edit session for an owner.
 */
export function clearEditSession(ownerTelegramId: number): void {
  editSessions.delete(ownerTelegramId);
}

function getPropertyById(propertyId: number): Property | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId) as Property | undefined) || null;
}

function getRoomsForProperty(propertyId: number): Room[] {
  const db = getDb();
  return db.prepare('SELECT * FROM rooms WHERE property_id = ? ORDER BY sort_order').all(propertyId) as Room[];
}

function getChecklistsForRoom(roomId: number): Checklist[] {
  const db = getDb();
  return db.prepare('SELECT * FROM checklists WHERE room_id = ?').all(roomId) as Checklist[];
}

function getChecklistItems(checklistId: number): ChecklistItem[] {
  const db = getDb();
  return db.prepare('SELECT * FROM checklist_items WHERE checklist_id = ? ORDER BY sort_order').all(checklistId) as ChecklistItem[];
}

function getFaqEntries(propertyId: number): FaqEntry[] {
  const db = getDb();
  return db.prepare('SELECT * FROM faq_entries WHERE property_id = ? ORDER BY category').all(propertyId) as FaqEntry[];
}

/**
 * Detect edit target from text.
 */
function detectEditTarget(text: string): { target: string; action: string } | null {
  const lower = text.toLowerCase();

  // Detect action
  let action = 'update';
  if (/\b(add|new)\b/.test(lower)) action = 'add';
  else if (/\b(remove|delete)\b/.test(lower)) action = 'remove';
  else if (/\brename\b/.test(lower)) action = 'rename';
  else if (/\b(view|show|list)\b/.test(lower)) action = 'view';
  else if (/\b(edit|change|update)\b/.test(lower)) action = 'update';

  // Detect target
  if (/\b(room|rooms)\b/.test(lower)) return { target: 'room', action };
  if (/\b(checklist|clean|task|item)\b/.test(lower)) return { target: 'checklist', action };
  if (/\b(faq|wifi|parking|trash|rules|emergency|guidebook|appliances)\b/.test(lower)) {
    // For specific FAQ categories, detect which one
    return { target: 'faq', action };
  }
  if (/\b(photo|staging|picture)\b/.test(lower)) return { target: 'photo', action };
  if (/\b(deep\s*clean|cycle)\b/.test(lower)) return { target: 'deep_clean', action };
  if (/\b(name|rename)\b/.test(lower) && !/\broom\b/.test(lower)) return { target: 'name', action: 'update' };
  if (/\baddress\b/.test(lower)) return { target: 'address', action: 'update' };

  return null;
}

/**
 * Detect FAQ category from text.
 */
function detectFaqCategory(text: string): string | null {
  const lower = text.toLowerCase();
  if (/\bwifi\b/.test(lower)) return 'wifi';
  if (/\bparking\b/.test(lower)) return 'parking';
  if (/\btrash\b/.test(lower)) return 'trash';
  if (/\brules\b/.test(lower) || /\bhouse.?rules\b/.test(lower)) return 'house_rules';
  if (/\bemergency\b/.test(lower)) return 'emergency';
  if (/\bappliance/.test(lower)) return 'appliances';
  return null;
}

// ---- Room editing flows ----

async function startRoomEdit(ctx: Context, ownerTelegramId: number, action: string, propertyId: number): Promise<void> {
  const property = getPropertyById(propertyId)!;
  const rooms = getRoomsForProperty(propertyId);

  if (action === 'add') {
    editSessions.set(ownerTelegramId, { target: 'room', action: 'add', step: 'awaiting_name' });
    await ctx.reply(`What should the new room be called? (e.g., "Guest Bathroom", "Patio")`);
    return;
  }

  if (rooms.length === 0) {
    await ctx.reply(`${property.name} has no rooms yet. Say "add room" to create one.`);
    clearEditSession(ownerTelegramId);
    return;
  }

  const roomList = rooms.map((r, i) => `${i + 1}. ${r.name}`).join('\n');

  if (action === 'remove') {
    editSessions.set(ownerTelegramId, {
      target: 'room', action: 'remove', step: 'awaiting_selection',
      data: { roomIds: rooms.map(r => r.id) },
    });
    await ctx.reply(`Which room do you want to remove?\n\n${roomList}\n\nReply with the number.`);
    return;
  }

  if (action === 'rename') {
    editSessions.set(ownerTelegramId, {
      target: 'room', action: 'rename', step: 'awaiting_selection',
      data: { roomIds: rooms.map(r => r.id) },
    });
    await ctx.reply(`Which room do you want to rename?\n\n${roomList}\n\nReply with the number.`);
    return;
  }

  // View / default
  await ctx.reply(`Rooms in ${property.name}:\n\n${roomList}`);
  clearEditSession(ownerTelegramId);
}

async function handleRoomEditStep(ctx: Context, ownerTelegramId: number, text: string, propertyId: number): Promise<void> {
  const session = editSessions.get(ownerTelegramId)!;
  const db = getDb();
  const property = getPropertyById(propertyId)!;

  if (session.action === 'add' && session.step === 'awaiting_name') {
    const roomName = text;
    const rooms = getRoomsForProperty(propertyId);
    const sortOrder = rooms.length;
    db.prepare('INSERT INTO rooms (property_id, name, sort_order) VALUES (?, ?, ?)').run(propertyId, roomName, sortOrder);
    const newCount = rooms.length + 1;
    await ctx.reply(`Added ${roomName} to ${property.name}. Now has ${newCount} rooms.`);
    clearEditSession(ownerTelegramId);
    return;
  }

  if (session.action === 'remove' && session.step === 'awaiting_selection') {
    const selection = parseInt(text, 10);
    const roomIds = session.data?.roomIds as number[];
    if (isNaN(selection) || selection < 1 || selection > roomIds.length) {
      await ctx.reply(`Please pick a number between 1 and ${roomIds.length}.`);
      return;
    }
    const roomId = roomIds[selection - 1];
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as Room;

    // Cascade delete: staging_photos, checklist_items (via checklists), checklists, then room
    const checklists = getChecklistsForRoom(roomId);
    for (const cl of checklists) {
      db.prepare('DELETE FROM checklist_items WHERE checklist_id = ?').run(cl.id);
    }
    db.prepare('DELETE FROM checklists WHERE room_id = ?').run(roomId);
    db.prepare('DELETE FROM staging_photos WHERE room_id = ?').run(roomId);
    db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);

    await ctx.reply(`Removed ${room.name} from ${property.name}.`);
    clearEditSession(ownerTelegramId);
    return;
  }

  if (session.action === 'rename' && session.step === 'awaiting_selection') {
    const selection = parseInt(text, 10);
    const roomIds = session.data?.roomIds as number[];
    if (isNaN(selection) || selection < 1 || selection > roomIds.length) {
      await ctx.reply(`Please pick a number between 1 and ${roomIds.length}.`);
      return;
    }
    const roomId = roomIds[selection - 1];
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as Room;
    editSessions.set(ownerTelegramId, {
      target: 'room', action: 'rename', step: 'awaiting_new_name',
      data: { roomId, oldName: room.name },
    });
    await ctx.reply(`What should "${room.name}" be renamed to?`);
    return;
  }

  if (session.action === 'rename' && session.step === 'awaiting_new_name') {
    const roomId = session.data?.roomId as number;
    const oldName = session.data?.oldName as string;
    db.prepare('UPDATE rooms SET name = ? WHERE id = ?').run(text, roomId);
    await ctx.reply(`Renamed ${oldName} to ${text}.`);
    clearEditSession(ownerTelegramId);
    return;
  }
}

// ---- Checklist editing flows ----

async function startChecklistEdit(ctx: Context, ownerTelegramId: number, action: string, propertyId: number, originalText: string): Promise<void> {
  const rooms = getRoomsForProperty(propertyId);

  if (rooms.length === 0) {
    await ctx.reply('No rooms found. Add rooms first before editing checklists.');
    clearEditSession(ownerTelegramId);
    return;
  }

  const roomList = rooms.map((r, i) => `${i + 1}. ${r.name}`).join('\n');

  editSessions.set(ownerTelegramId, {
    target: 'checklist', action, step: 'awaiting_room_selection',
    data: { roomIds: rooms.map(r => r.id) },
  });
  await ctx.reply(`Which room's checklist?\n\n${roomList}\n\nReply with the number.`);
}

async function handleChecklistEditStep(ctx: Context, ownerTelegramId: number, text: string, propertyId: number): Promise<void> {
  const session = editSessions.get(ownerTelegramId)!;
  const db = getDb();

  if (session.step === 'awaiting_room_selection') {
    const selection = parseInt(text, 10);
    const roomIds = session.data?.roomIds as number[];
    if (isNaN(selection) || selection < 1 || selection > roomIds.length) {
      await ctx.reply(`Please pick a number between 1 and ${roomIds.length}.`);
      return;
    }
    const roomId = roomIds[selection - 1];
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as Room;

    if (session.action === 'view') {
      // Show both standard and deep checklists
      const checklists = getChecklistsForRoom(roomId);
      let response = `Checklists for ${room.name}:\n`;
      for (const cl of checklists) {
        const items = getChecklistItems(cl.id);
        response += `\n${cl.clean_type.toUpperCase()} clean:\n`;
        if (items.length === 0) {
          response += '  (no items)\n';
        } else {
          items.forEach((item, i) => {
            response += `  ${i + 1}. ${item.description}\n`;
          });
        }
      }
      if (checklists.length === 0) {
        response += '\n(no checklists set up yet)';
      }
      await ctx.reply(response);
      clearEditSession(ownerTelegramId);
      return;
    }

    // For add/remove, ask which clean type
    editSessions.set(ownerTelegramId, {
      target: 'checklist', action: session.action, step: 'awaiting_clean_type',
      data: { roomId, roomName: room.name },
    });
    await ctx.reply(`Standard or deep clean checklist? Reply "standard" or "deep".`);
    return;
  }

  if (session.step === 'awaiting_clean_type') {
    const lower = text.toLowerCase();
    let cleanType: 'standard' | 'deep';
    if (lower.startsWith('standard') || lower === 's') {
      cleanType = 'standard';
    } else if (lower.startsWith('deep') || lower === 'd') {
      cleanType = 'deep';
    } else {
      await ctx.reply('Please reply "standard" or "deep".');
      return;
    }

    const roomId = session.data?.roomId as number;
    const roomName = session.data?.roomName as string;

    // Get or create checklist
    let checklist = db.prepare(
      'SELECT * FROM checklists WHERE room_id = ? AND clean_type = ?'
    ).get(roomId, cleanType) as Checklist | undefined;

    if (!checklist) {
      db.prepare('INSERT INTO checklists (room_id, clean_type) VALUES (?, ?)').run(roomId, cleanType);
      checklist = db.prepare(
        'SELECT * FROM checklists WHERE room_id = ? AND clean_type = ?'
      ).get(roomId, cleanType) as Checklist;
    }

    const items = getChecklistItems(checklist.id);

    if (session.action === 'add') {
      editSessions.set(ownerTelegramId, {
        target: 'checklist', action: 'add', step: 'awaiting_item_text',
        data: { checklistId: checklist.id, roomName, cleanType, itemCount: items.length },
      });
      await ctx.reply(`What item should I add to ${roomName}'s ${cleanType} checklist?`);
      return;
    }

    if (session.action === 'remove') {
      if (items.length === 0) {
        await ctx.reply(`${roomName}'s ${cleanType} checklist has no items to remove.`);
        clearEditSession(ownerTelegramId);
        return;
      }
      const itemList = items.map((item, i) => `${i + 1}. ${item.description}`).join('\n');
      editSessions.set(ownerTelegramId, {
        target: 'checklist', action: 'remove', step: 'awaiting_item_selection',
        data: { itemIds: items.map(i => i.id), roomName, cleanType },
      });
      await ctx.reply(`Which item to remove from ${roomName}'s ${cleanType} checklist?\n\n${itemList}\n\nReply with the number.`);
      return;
    }

    // update -- show current and ask for changes
    if (items.length === 0) {
      await ctx.reply(`${roomName}'s ${cleanType} checklist has no items. Say "add item" to create one.`);
    } else {
      const itemList = items.map((item, i) => `${i + 1}. ${item.description}`).join('\n');
      await ctx.reply(`${roomName}'s ${cleanType} checklist:\n\n${itemList}\n\nSay "add item" or "remove item" to make changes.`);
    }
    clearEditSession(ownerTelegramId);
    return;
  }

  if (session.step === 'awaiting_item_text') {
    const checklistId = session.data?.checklistId as number;
    const roomName = session.data?.roomName as string;
    const cleanType = session.data?.cleanType as string;
    const currentCount = session.data?.itemCount as number;
    const sortOrder = currentCount;

    db.prepare('INSERT INTO checklist_items (checklist_id, description, sort_order) VALUES (?, ?, ?)').run(checklistId, text, sortOrder);
    const newCount = currentCount + 1;

    // Show updated list
    const items = getChecklistItems(checklistId);
    const itemList = items.map((item, i) => `${i + 1}. ${item.description}`).join('\n');

    await ctx.reply(
      `Added "${text}" to ${roomName} ${cleanType} clean. ${roomName} now has ${newCount} ${cleanType} items.\n\nFull list:\n${itemList}`
    );
    clearEditSession(ownerTelegramId);
    return;
  }

  if (session.step === 'awaiting_item_selection') {
    const selection = parseInt(text, 10);
    const itemIds = session.data?.itemIds as number[];
    const roomName = session.data?.roomName as string;
    const cleanType = session.data?.cleanType as string;

    if (isNaN(selection) || selection < 1 || selection > itemIds.length) {
      await ctx.reply(`Please pick a number between 1 and ${itemIds.length}.`);
      return;
    }

    const itemId = itemIds[selection - 1];
    const item = db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(itemId) as ChecklistItem;
    db.prepare('DELETE FROM checklist_items WHERE id = ?').run(itemId);

    await ctx.reply(`Removed "${item.description}" from ${roomName}'s ${cleanType} checklist.`);
    clearEditSession(ownerTelegramId);
    return;
  }
}

// ---- FAQ editing flows ----

async function startFaqEdit(ctx: Context, ownerTelegramId: number, action: string, propertyId: number, originalText: string): Promise<void> {
  const entries = getFaqEntries(propertyId);

  // Check if a specific category was mentioned
  const category = detectFaqCategory(originalText);

  if (action === 'add') {
    editSessions.set(ownerTelegramId, {
      target: 'faq', action: 'add', step: 'awaiting_question',
      data: { propertyId },
    });
    await ctx.reply('What\'s the question? (e.g., "What\'s the WiFi password?")');
    return;
  }

  if (action === 'remove') {
    if (entries.length === 0) {
      await ctx.reply('No FAQ entries to remove.');
      clearEditSession(ownerTelegramId);
      return;
    }
    const entryList = entries.map((e, i) => `${i + 1}. [${e.category}] ${e.question}`).join('\n');
    editSessions.set(ownerTelegramId, {
      target: 'faq', action: 'remove', step: 'awaiting_selection',
      data: { entryIds: entries.map(e => e.id) },
    });
    await ctx.reply(`Which FAQ entry to remove?\n\n${entryList}\n\nReply with the number.`);
    return;
  }

  // Update a specific category
  if (category) {
    const entry = entries.find(e => e.category === category);
    if (entry) {
      editSessions.set(ownerTelegramId, {
        target: 'faq', action: 'update', step: 'awaiting_new_answer',
        data: { entryId: entry.id, category, oldAnswer: entry.answer },
      });
      await ctx.reply(`Current ${category} info: "${entry.answer}"\n\nWhat should the new answer be?`);
      return;
    } else {
      // No entry for this category -- offer to create
      editSessions.set(ownerTelegramId, {
        target: 'faq', action: 'add', step: 'awaiting_answer_for_category',
        data: { propertyId, category },
      });
      await ctx.reply(`No ${category} info set yet. What should it be?`);
      return;
    }
  }

  // View / generic
  if (entries.length === 0) {
    await ctx.reply('No FAQ entries yet. Say "add faq" to create one.');
  } else {
    const entryList = entries.map(e => `[${e.category}] ${e.question}\n  ${e.answer}`).join('\n\n');
    await ctx.reply(`FAQ entries:\n\n${entryList}`);
  }
  clearEditSession(ownerTelegramId);
}

async function handleFaqEditStep(ctx: Context, ownerTelegramId: number, text: string, propertyId: number): Promise<void> {
  const session = editSessions.get(ownerTelegramId)!;
  const db = getDb();

  if (session.step === 'awaiting_question') {
    editSessions.set(ownerTelegramId, {
      target: 'faq', action: 'add', step: 'awaiting_answer',
      data: { ...session.data, question: text },
    });
    await ctx.reply('And what\'s the answer?');
    return;
  }

  if (session.step === 'awaiting_answer') {
    const question = session.data?.question as string;
    db.prepare(
      'INSERT INTO faq_entries (property_id, category, question, answer) VALUES (?, ?, ?, ?)'
    ).run(propertyId, 'custom', question, text);
    await ctx.reply(`Added FAQ entry:\nQ: ${question}\nA: ${text}`);
    clearEditSession(ownerTelegramId);
    return;
  }

  if (session.step === 'awaiting_answer_for_category') {
    const category = session.data?.category as string;
    const categoryQuestions: Record<string, string> = {
      wifi: 'What is the WiFi password?',
      parking: 'Where do guests park?',
      trash: 'Where does trash go?',
      house_rules: 'What are the house rules?',
      emergency: 'Emergency contacts?',
      appliances: 'How do I use the appliances?',
    };
    const question = categoryQuestions[category] || `${category} info`;
    db.prepare(
      'INSERT INTO faq_entries (property_id, category, question, answer) VALUES (?, ?, ?, ?)'
    ).run(propertyId, category, question, text);
    await ctx.reply(`Added ${category} info: "${text}"`);
    clearEditSession(ownerTelegramId);
    return;
  }

  if (session.step === 'awaiting_new_answer') {
    const entryId = session.data?.entryId as number;
    const category = session.data?.category as string;
    const oldAnswer = session.data?.oldAnswer as string;
    db.prepare('UPDATE faq_entries SET answer = ? WHERE id = ?').run(text, entryId);
    await ctx.reply(`Updated ${category} info:\nBefore: ${oldAnswer}\nAfter: ${text}`);
    clearEditSession(ownerTelegramId);
    return;
  }

  if (session.step === 'awaiting_selection') {
    const selection = parseInt(text, 10);
    const entryIds = session.data?.entryIds as number[];
    if (isNaN(selection) || selection < 1 || selection > entryIds.length) {
      await ctx.reply(`Please pick a number between 1 and ${entryIds.length}.`);
      return;
    }
    const entryId = entryIds[selection - 1];
    const entry = db.prepare('SELECT * FROM faq_entries WHERE id = ?').get(entryId) as FaqEntry;
    db.prepare('DELETE FROM faq_entries WHERE id = ?').run(entryId);
    await ctx.reply(`Removed FAQ entry: [${entry.category}] ${entry.question}`);
    clearEditSession(ownerTelegramId);
    return;
  }
}

// ---- Photo editing flows ----

async function startPhotoEdit(ctx: Context, ownerTelegramId: number, action: string, propertyId: number): Promise<void> {
  const rooms = getRoomsForProperty(propertyId);

  if (rooms.length === 0) {
    await ctx.reply('No rooms found. Add rooms first before managing photos.');
    clearEditSession(ownerTelegramId);
    return;
  }

  const roomList = rooms.map((r, i) => `${i + 1}. ${r.name}`).join('\n');
  editSessions.set(ownerTelegramId, {
    target: 'photo', action, step: 'awaiting_room_selection',
    data: { roomIds: rooms.map(r => r.id) },
  });
  await ctx.reply(`Which room's photos?\n\n${roomList}\n\nReply with the number.`);
}

async function handlePhotoEditStep(ctx: Context, ownerTelegramId: number, text: string, propertyId: number): Promise<void> {
  const session = editSessions.get(ownerTelegramId)!;
  const db = getDb();

  if (session.step === 'awaiting_room_selection') {
    const selection = parseInt(text, 10);
    const roomIds = session.data?.roomIds as number[];
    if (isNaN(selection) || selection < 1 || selection > roomIds.length) {
      await ctx.reply(`Please pick a number between 1 and ${roomIds.length}.`);
      return;
    }
    const roomId = roomIds[selection - 1];
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as Room;
    const photos = db.prepare('SELECT * FROM staging_photos WHERE room_id = ? ORDER BY sort_order').all(roomId) as StagingPhoto[];

    if (session.action === 'add' || session.action === 'update') {
      editSessions.set(ownerTelegramId, {
        target: 'photo', action: session.action, step: 'awaiting_photo',
        data: { roomId, roomName: room.name, photoCount: photos.length },
      });
      const current = photos.length > 0 ? `${room.name} currently has ${photos.length} staging photo(s). ` : '';
      await ctx.reply(`${current}Send me the staging photo(s) for ${room.name}. Type "done" when finished.`);
      return;
    }

    // View
    if (photos.length === 0) {
      await ctx.reply(`${room.name} has no staging photos.`);
    } else {
      await ctx.reply(`${room.name} has ${photos.length} staging photo(s).`);
    }
    clearEditSession(ownerTelegramId);
    return;
  }

  if (session.step === 'awaiting_photo') {
    if (/^done$/i.test(text)) {
      const roomName = session.data?.roomName as string;
      const roomId = session.data?.roomId as number;
      const photos = db.prepare('SELECT * FROM staging_photos WHERE room_id = ?').all(roomId) as StagingPhoto[];
      await ctx.reply(`${roomName} now has ${photos.length} staging photo(s). Photos updated.`);
      clearEditSession(ownerTelegramId);
      return;
    }
    await ctx.reply('Send a photo or type "done" when finished.');
    return;
  }
}

/**
 * Handle incoming photos during an edit session.
 */
async function handleEditPhoto(ctx: Context, ownerTelegramId: number): Promise<boolean> {
  const session = editSessions.get(ownerTelegramId);
  if (!session || session.target !== 'photo' || session.step !== 'awaiting_photo') return false;

  if (!ctx.message || !('photo' in ctx.message)) return false;

  const db = getDb();
  const roomId = session.data?.roomId as number;
  const roomName = session.data?.roomName as string;
  const photos = ctx.message.photo;
  const largestPhoto = photos[photos.length - 1]; // Telegram sends multiple sizes, use largest

  const currentPhotos = db.prepare('SELECT COUNT(*) as count FROM staging_photos WHERE room_id = ?').get(roomId) as { count: number };
  const sortOrder = currentPhotos.count;

  db.prepare(
    'INSERT INTO staging_photos (room_id, file_id, file_path, sort_order) VALUES (?, ?, ?, ?)'
  ).run(roomId, largestPhoto.file_id, '', sortOrder);

  const newCount = sortOrder + 1;
  await ctx.reply(`Photo received for ${roomName} (${newCount} total). Send more or type "done".`);
  return true;
}

// ---- Deep clean cycle editing ----

async function startDeepCleanEdit(ctx: Context, ownerTelegramId: number, propertyId: number): Promise<void> {
  const property = getPropertyById(propertyId)!;
  editSessions.set(ownerTelegramId, {
    target: 'deep_clean', action: 'update', step: 'awaiting_number',
    data: { currentCycle: property.deep_clean_cycle },
  });
  await ctx.reply(
    `Current deep clean cycle: every ${property.deep_clean_cycle} cleans.\n\n` +
    `What should the new cycle be? (Enter a number)`
  );
}

async function handleDeepCleanEditStep(ctx: Context, ownerTelegramId: number, text: string, propertyId: number): Promise<void> {
  const session = editSessions.get(ownerTelegramId)!;

  if (session.step === 'awaiting_number') {
    const num = parseInt(text, 10);
    if (isNaN(num) || num < 1) {
      await ctx.reply('Please enter a valid number (1 or higher).');
      return;
    }
    const oldCycle = session.data?.currentCycle as number;
    const db = getDb();
    db.prepare('UPDATE properties SET deep_clean_cycle = ? WHERE id = ?').run(num, propertyId);
    await ctx.reply(`Deep clean cycle changed from every ${oldCycle} cleans to every ${num} cleans.`);
    clearEditSession(ownerTelegramId);
    return;
  }
}

// ---- Property name editing ----

async function startNameEdit(ctx: Context, ownerTelegramId: number, propertyId: number): Promise<void> {
  const property = getPropertyById(propertyId)!;
  editSessions.set(ownerTelegramId, {
    target: 'name', action: 'update', step: 'awaiting_new_name',
    data: { oldName: property.name },
  });
  await ctx.reply(`Current property name: "${property.name}". What should the new name be?`);
}

async function handleNameEditStep(ctx: Context, ownerTelegramId: number, text: string, propertyId: number): Promise<void> {
  const session = editSessions.get(ownerTelegramId)!;

  if (session.step === 'awaiting_new_name') {
    const oldName = session.data?.oldName as string;
    const db = getDb();
    db.prepare('UPDATE properties SET name = ? WHERE id = ?').run(text, propertyId);
    await ctx.reply(`Property renamed from ${oldName} to ${text}.`);
    clearEditSession(ownerTelegramId);
    return;
  }
}

// ---- Address editing ----

async function startAddressEdit(ctx: Context, ownerTelegramId: number, propertyId: number): Promise<void> {
  const property = getPropertyById(propertyId)!;
  const current = property.address || '(not set)';
  editSessions.set(ownerTelegramId, {
    target: 'address', action: 'update', step: 'awaiting_new_address',
    data: { oldAddress: current },
  });
  await ctx.reply(`Current address: "${current}". What should the new address be?`);
}

async function handleAddressEditStep(ctx: Context, ownerTelegramId: number, text: string, propertyId: number): Promise<void> {
  const session = editSessions.get(ownerTelegramId)!;

  if (session.step === 'awaiting_new_address') {
    const oldAddress = session.data?.oldAddress as string;
    const db = getDb();
    db.prepare('UPDATE properties SET address = ? WHERE id = ?').run(text, propertyId);
    await ctx.reply(`Address updated.\nBefore: ${oldAddress}\nAfter: ${text}`);
    clearEditSession(ownerTelegramId);
    return;
  }
}

// ---- Main handler ----

/**
 * Check if an incoming DM text is an edit trigger.
 */
export function isEditTrigger(text: string): boolean {
  return /\b(edit|change|update|add|remove)\b/i.test(text);
}

/**
 * Handle an edit-related message. Returns true if handled.
 */
export async function handleEditMessage(ctx: Context): Promise<boolean> {
  if (!ctx.from || !ctx.message || !('text' in ctx.message)) return false;

  const ownerTelegramId = ctx.from.id;
  const text = ctx.message.text.trim();
  const owner = getOwnerByTelegramId(ownerTelegramId) as Owner | null;
  if (!owner) return false;

  // Don't handle edits during active setup
  const session = getActiveSession(owner.id);
  if (session) return false;

  // If there's an active edit session, route to the appropriate step handler
  const editState = editSessions.get(ownerTelegramId);
  if (editState) {
    const propertyId = getActivePropertyId(ownerTelegramId);
    if (!propertyId) {
      await ctx.reply('Which property do you want to edit? Send "my properties" to see your list.');
      clearEditSession(ownerTelegramId);
      return true;
    }

    switch (editState.target) {
      case 'room':
        await handleRoomEditStep(ctx, ownerTelegramId, text, propertyId);
        return true;
      case 'checklist':
        await handleChecklistEditStep(ctx, ownerTelegramId, text, propertyId);
        return true;
      case 'faq':
        await handleFaqEditStep(ctx, ownerTelegramId, text, propertyId);
        return true;
      case 'photo':
        await handlePhotoEditStep(ctx, ownerTelegramId, text, propertyId);
        return true;
      case 'deep_clean':
        await handleDeepCleanEditStep(ctx, ownerTelegramId, text, propertyId);
        return true;
      case 'name':
        await handleNameEditStep(ctx, ownerTelegramId, text, propertyId);
        return true;
      case 'address':
        await handleAddressEditStep(ctx, ownerTelegramId, text, propertyId);
        return true;
    }
  }

  // New edit request -- detect what they want to edit
  const propertyId = getActivePropertyId(ownerTelegramId);
  if (!propertyId) {
    await ctx.reply('Which property do you want to edit? Send "my properties" to see your list and select one first.');
    return true;
  }

  const detected = detectEditTarget(text);
  if (!detected) {
    await ctx.reply(
      "What would you like to edit? You can change:\n" +
      "- Rooms\n" +
      "- Checklists\n" +
      "- FAQ/Guidebook\n" +
      "- Staging photos\n" +
      "- Deep clean cycle\n" +
      "- Property name"
    );
    return true;
  }

  switch (detected.target) {
    case 'room':
      await startRoomEdit(ctx, ownerTelegramId, detected.action, propertyId);
      return true;
    case 'checklist':
      await startChecklistEdit(ctx, ownerTelegramId, detected.action, propertyId, text);
      return true;
    case 'faq':
      await startFaqEdit(ctx, ownerTelegramId, detected.action, propertyId, text);
      return true;
    case 'photo':
      await startPhotoEdit(ctx, ownerTelegramId, detected.action, propertyId);
      return true;
    case 'deep_clean':
      await startDeepCleanEdit(ctx, ownerTelegramId, propertyId);
      return true;
    case 'name':
      await startNameEdit(ctx, ownerTelegramId, propertyId);
      return true;
    case 'address':
      await startAddressEdit(ctx, ownerTelegramId, propertyId);
      return true;
  }

  return false;
}

export function registerEditHandlers(bot: Telegraf): void {
  // Handle photos during edit sessions
  bot.on(message('photo'), async (ctx, next) => {
    if (!isDM(ctx) || !ctx.from) return next();

    const handled = await handleEditPhoto(ctx, ctx.from.id);
    if (handled) return;

    return next();
  });

  // Text handling is done via the central DM router in bot.ts
  // which calls handleEditMessage() when edit triggers are detected.
}
