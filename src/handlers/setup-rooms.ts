import { Context } from 'telegraf';
import { getDb } from '../db/connection.js';
import { SetupSession, Room } from '../types/index.js';

export async function promptRooms(ctx: Context, propertyName: string): Promise<void> {
  await ctx.reply(
    `What rooms does ${propertyName} have? List them separated by commas ` +
    `(e.g., Kitchen, Master Bedroom, Guest Bath, Living Room)`
  );
}

export async function handleRoomSetup(ctx: Context, session: SetupSession): Promise<'step_complete' | 'waiting'> {
  const text = 'text' in (ctx.message || {}) ? (ctx.message as { text: string }).text.trim() : '';
  if (!text) return 'waiting';

  const roomNames = text.split(',').map(r => r.trim()).filter(r => r.length > 0);

  if (roomNames.length === 0) {
    await ctx.reply("I didn't catch any room names. Please list your rooms separated by commas.");
    return 'waiting';
  }

  const db = getDb();
  const insertRoom = db.prepare(
    'INSERT INTO rooms (property_id, name, sort_order) VALUES (?, ?, ?)'
  );

  const insertMany = db.transaction((names: string[]) => {
    for (let i = 0; i < names.length; i++) {
      insertRoom.run(session.property_id, names[i], i);
    }
  });

  insertMany(roomNames);

  // Get property name for confirmation
  const property = db.prepare('SELECT name FROM properties WHERE id = ?').get(session.property_id) as { name: string } | undefined;
  const propertyName = property?.name || 'your property';

  const roomList = roomNames.map((name, i) => `${i + 1}. ${name}`).join('\n');
  await ctx.reply(
    `Got it! I've set up ${roomNames.length} rooms for ${propertyName}:\n${roomList}`
  );

  return 'step_complete';
}
