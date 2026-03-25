import { Telegraf, Context } from 'telegraf';
import { getDb } from '../db/connection.js';
import { generateFloorPlan } from '../services/floor-plan.js';
import { Property, Room, TelegramGroup } from '../types/index.js';

/**
 * Checks if a text message is requesting the floor plan.
 */
export function isFloorPlanRequest(text: string): boolean {
  return /\bfloor\s*plan\b/i.test(text);
}

/**
 * Handles a floor plan request in a group chat.
 * Sends the SVG as a document if available, or a "not available" message.
 * Returns true (always handles the request).
 */
export async function handleFloorPlanRequest(ctx: Context, group: TelegramGroup): Promise<boolean> {
  const db = getDb();
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(group.property_id) as Property | undefined;

  if (!property || !property.floor_plan_svg) {
    await ctx.reply(
      'No floor plan available yet. A floor plan will be generated automatically after the next entry walkthrough video.'
    );
    return true;
  }

  const svg = property.floor_plan_svg;
  await ctx.replyWithDocument(
    {
      source: Buffer.from(svg, 'utf-8'),
      filename: `${property.name}-floor-plan.svg`,
    },
    { caption: `Floor plan for ${property.name}` }
  );

  return true;
}

/**
 * Generates a floor plan for a property if one doesn't exist yet.
 * Fire-and-forget safe: never throws.
 */
export async function generateFloorPlanIfNeeded(
  bot: Telegraf,
  propertyId: number,
  videoFileId: string
): Promise<void> {
  try {
    const db = getDb();
    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId) as Property | undefined;

    if (!property || property.floor_plan_svg) {
      return; // Already has floor plan or property not found
    }

    const rooms = db.prepare(
      'SELECT name FROM rooms WHERE property_id = ? ORDER BY sort_order'
    ).all(propertyId) as { name: string }[];

    if (rooms.length === 0) {
      return; // No rooms configured
    }

    const roomNames = rooms.map(r => r.name);
    await generateFloorPlan(bot, propertyId, videoFileId, roomNames);
    console.log(`[FLOOR-PLAN] Generated floor plan for property ${propertyId}`);
  } catch (err) {
    console.error(`[FLOOR-PLAN] Generation failed for property ${propertyId}:`, err);
    // Never throw -- this is called fire-and-forget
  }
}
