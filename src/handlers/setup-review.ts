import { Context } from 'telegraf';
import { getDb } from '../db/connection.js';
import { SetupSession, Property, Room } from '../types/index.js';
export async function promptReview(ctx: Context, propertyId: number): Promise<void> {
  const db = getDb();
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId) as Property;
  const rooms = db.prepare('SELECT * FROM rooms WHERE property_id = ? ORDER BY sort_order').all(propertyId) as Room[];

  // Build summary
  let summary = `Here's your property setup for ${property.name}:\n\n`;

  // Rooms
  summary += `Rooms (${rooms.length}):\n`;
  rooms.forEach((room, i) => {
    summary += `${i + 1}. ${room.name}\n`;
  });

  // Staging photos
  summary += '\nStaging Photos:\n';
  for (const room of rooms) {
    const photoCount = (db.prepare(
      'SELECT COUNT(*) as count FROM staging_photos WHERE room_id = ?'
    ).get(room.id) as { count: number }).count;
    summary += `- ${room.name}: ${photoCount} photo(s)\n`;
  }

  // FAQ entries
  const faqEntries = db.prepare(
    'SELECT category FROM faq_entries WHERE property_id = ?'
  ).all(propertyId) as Array<{ category: string }>;
  const faqCategories = faqEntries.map(e => e.category.charAt(0).toUpperCase() + e.category.slice(1).replace('_', ' '));
  summary += `\nFAQ Entries: ${faqEntries.length} entries`;
  if (faqCategories.length > 0) {
    summary += ` (${faqCategories.join(', ')})`;
  }
  summary += '\n';

  // Checklists
  summary += '\nChecklists:\n';
  for (const room of rooms) {
    const standardCount = (db.prepare(`
      SELECT COUNT(*) as count FROM checklist_items ci
      JOIN checklists c ON c.id = ci.checklist_id
      WHERE c.room_id = ? AND c.clean_type = 'standard'
    `).get(room.id) as { count: number }).count;

    const deepCount = (db.prepare(`
      SELECT COUNT(*) as count FROM checklist_items ci
      JOIN checklists c ON c.id = ci.checklist_id
      WHERE c.room_id = ? AND c.clean_type = 'deep'
    `).get(room.id) as { count: number }).count;

    summary += `- ${room.name}: ${standardCount} standard items, ${deepCount} deep clean items\n`;
  }

  // Deep clean cycle
  summary += `\nDeep Clean: Every ${property.deep_clean_cycle} cleans\n`;

  summary += '\nEverything look good? Reply "yes" to confirm, or tell me what you\'d like to change.';

  await ctx.reply(summary);
}

export async function handleSetupReview(ctx: Context, session: SetupSession): Promise<'complete' | 'waiting'> {
  const text = 'text' in (ctx.message || {}) ? (ctx.message as { text: string }).text.trim().toLowerCase() : '';
  if (!text) return 'waiting';

  // Check for confirmation
  if (['yes', 'confirm', 'looks good', 'lgtm', 'perfect', 'good'].includes(text)) {
    return 'complete';
  }

  // Handle edit requests -- for MVP, provide guidance
  await ctx.reply(
    "What would you like to change? You can say things like " +
    "'add a room', 'update kitchen checklist', or 'change WiFi info'.\n\n" +
    "For now, say 'yes' to confirm and you can make changes later via DM."
  );
  return 'waiting';
}
