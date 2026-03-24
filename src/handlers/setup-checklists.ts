import { Context } from 'telegraf';
import { getDb } from '../db/connection.js';
import { SetupSession, Room } from '../types/index.js';

// Room-based suggestions for standard clean
const ROOM_SUGGESTIONS: Record<string, string[]> = {
  kitchen: ['Wipe counters', 'Clean sink', 'Mop floor', 'Clean appliance fronts', 'Empty trash'],
  bathroom: ['Scrub toilet', 'Clean shower/tub', 'Wipe mirror', 'Mop floor', 'Restock towels'],
  bath: ['Scrub toilet', 'Clean shower/tub', 'Wipe mirror', 'Mop floor', 'Restock towels'],
  bedroom: ['Change linens', 'Dust surfaces', 'Vacuum', 'Empty trash'],
  living: ['Vacuum/mop', 'Dust surfaces', 'Fluff cushions', 'Wipe TV screen'],
};

const DEFAULT_SUGGESTIONS = ['General clean', 'Dust surfaces', 'Vacuum/mop', 'Empty trash'];

function getSuggestions(roomName: string): string[] {
  const lower = roomName.toLowerCase();
  for (const [key, suggestions] of Object.entries(ROOM_SUGGESTIONS)) {
    if (lower.includes(key)) return suggestions;
  }
  return DEFAULT_SUGGESTIONS;
}

// Track checklist progress: which room index and which clean type (standard or deep)
interface ChecklistProgress {
  roomIndex: number;
  cleanType: 'standard' | 'deep';
}

const checklistProgress: Map<number, ChecklistProgress> = new Map();

export async function promptChecklist(ctx: Context, roomName: string, cleanType: 'standard' | 'deep'): Promise<void> {
  if (cleanType === 'standard') {
    const suggestions = getSuggestions(roomName);
    const suggestionList = suggestions.map(s => `- ${s}`).join('\n');
    await ctx.reply(
      `What should be done in ${roomName} for a STANDARD clean? ` +
      `List the tasks (one per line, or all at once -- whatever works).\n\n` +
      `Here are some suggestions for ${roomName}:\n${suggestionList}`
    );
  } else {
    await ctx.reply(
      `Now for DEEP clean items in ${roomName}. What extra tasks should be done during a deep clean? ` +
      `(These are IN ADDITION to the standard list)`
    );
  }
}

function getRooms(propertyId: number): Room[] {
  const db = getDb();
  return db.prepare('SELECT * FROM rooms WHERE property_id = ? ORDER BY sort_order')
    .all(propertyId) as Room[];
}

export async function handleChecklistSetup(ctx: Context, session: SetupSession): Promise<'step_complete' | 'waiting'> {
  const text = 'text' in (ctx.message || {}) ? (ctx.message as { text: string }).text.trim() : '';
  if (!text) return 'waiting';

  const ownerId = session.owner_id;
  const rooms = getRooms(session.property_id);

  if (rooms.length === 0) return 'step_complete';

  // Initialize progress if not set
  if (!checklistProgress.has(ownerId)) {
    checklistProgress.set(ownerId, { roomIndex: 0, cleanType: 'standard' });
  }

  const progress = checklistProgress.get(ownerId)!;
  const currentRoom = rooms[progress.roomIndex];

  if (!currentRoom) {
    checklistProgress.delete(ownerId);
    return 'step_complete';
  }

  // Parse items: split by newlines, filter empty
  const items = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  if (items.length === 0) {
    await ctx.reply("I didn't catch any tasks. Please list the cleaning tasks (one per line or all at once).");
    return 'waiting';
  }

  // Create checklist and items
  const db = getDb();
  const checklistResult = db.prepare(
    'INSERT INTO checklists (room_id, clean_type) VALUES (?, ?)'
  ).run(currentRoom.id, progress.cleanType);

  const checklistId = Number(checklistResult.lastInsertRowid);

  const insertItem = db.prepare(
    'INSERT INTO checklist_items (checklist_id, description, sort_order) VALUES (?, ?, ?)'
  );

  const insertMany = db.transaction((taskItems: string[]) => {
    for (let i = 0; i < taskItems.length; i++) {
      insertItem.run(checklistId, taskItems[i], i);
    }
  });

  insertMany(items);

  if (progress.cleanType === 'standard') {
    await ctx.reply(`Standard clean for ${currentRoom.name}: ${items.length} items saved.`);
    // Move to deep clean for same room
    progress.cleanType = 'deep';
    checklistProgress.set(ownerId, progress);
    await promptChecklist(ctx, currentRoom.name, 'deep');
    return 'waiting';
  }

  // Deep clean done, show summary for this room
  const standardCount = (db.prepare(`
    SELECT COUNT(*) as count FROM checklist_items ci
    JOIN checklists c ON c.id = ci.checklist_id
    WHERE c.room_id = ? AND c.clean_type = 'standard'
  `).get(currentRoom.id) as { count: number }).count;

  await ctx.reply(
    `Standard clean for ${currentRoom.name}: ${standardCount} items. Deep clean adds ${items.length} more items.`
  );

  // Move to next room
  const nextRoomIndex = progress.roomIndex + 1;

  if (nextRoomIndex >= rooms.length) {
    checklistProgress.delete(ownerId);
    await ctx.reply("All room checklists are set!");
    return 'step_complete';
  }

  progress.roomIndex = nextRoomIndex;
  progress.cleanType = 'standard';
  checklistProgress.set(ownerId, progress);

  const nextRoom = rooms[nextRoomIndex];
  await promptChecklist(ctx, nextRoom.name, 'standard');
  return 'waiting';
}
