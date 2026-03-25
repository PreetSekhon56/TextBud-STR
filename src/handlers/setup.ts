import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { getDb } from '../db/connection.js';
import { isDM, getOwnerByTelegramId } from '../bot.js';
import { Owner, Property, SetupSession } from '../types/index.js';
import { handleRoomSetup, promptRooms } from './setup-rooms.js';
import { handlePhotoSetup, promptPhotos } from './setup-photos.js';
import { handleFaqSetup, promptFaq } from './setup-faq.js';
import { handleChecklistSetup, promptChecklist } from './setup-checklists.js';
import { handleDeepCleanSetup, promptDeepClean } from './setup-deepclean.js';
import { handleSetupReview, promptReview } from './setup-review.js';
import { syncSubscriptionQuantity } from './payments.js';

// Step order for the setup wizard
const STEP_ORDER = ['name', 'rooms', 'photos', 'faq', 'checklists', 'deep_clean', 'review'] as const;

const STEP_DESCRIPTIONS: Record<string, string> = {
  name: 'name your property',
  rooms: 'set up rooms',
  photos: 'upload staging photos',
  faq: 'fill in the FAQ/guidebook',
  checklists: 'create cleaning checklists',
  deep_clean: 'set the deep clean cycle',
  review: 'review your setup',
};

function getCompletedStepsDescription(currentStep: string): string {
  const currentIndex = STEP_ORDER.indexOf(currentStep as typeof STEP_ORDER[number]);
  if (currentIndex <= 0) return '';
  const completed = STEP_ORDER.slice(0, currentIndex).map(s => STEP_DESCRIPTIONS[s]);
  return completed.join(', ');
}

export function getActiveSession(ownerId: number): SetupSession | null {
  const db = getDb();
  const session = db.prepare(`
    SELECT ss.* FROM setup_sessions ss
    JOIN properties p ON p.id = ss.property_id
    WHERE ss.owner_id = ? AND p.setup_complete = 0
    ORDER BY ss.updated_at DESC
    LIMIT 1
  `).get(ownerId) as SetupSession | undefined;
  return session || null;
}

export function advanceSession(sessionId: number, nextStep: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE setup_sessions SET current_step = ?, current_room_index = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(nextStep, sessionId);
}

export function completeSession(sessionId: number, propertyId: number): void {
  const db = getDb();
  db.prepare('UPDATE properties SET setup_complete = 1, setup_step = NULL WHERE id = ?').run(propertyId);
  db.prepare('DELETE FROM setup_sessions WHERE id = ?').run(sessionId);
}

function getPropertyById(propertyId: number): Property | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId) as Property | undefined) || null;
}

async function promptForStep(ctx: Context, session: SetupSession, step: string): Promise<void> {
  const property = getPropertyById(session.property_id);
  if (!property) return;

  switch (step) {
    case 'name':
      await ctx.reply("What would you like to name this property? (e.g., \"Beach House\", \"Downtown Condo\")");
      break;
    case 'rooms':
      await promptRooms(ctx, property.name);
      break;
    case 'photos': {
      const db = getDb();
      const rooms = db.prepare('SELECT * FROM rooms WHERE property_id = ? ORDER BY sort_order').all(session.property_id) as Array<{ id: number; name: string }>;
      if (rooms.length > 0) {
        // Reset room index to 0 for fresh photo collection
        db.prepare('UPDATE setup_sessions SET current_room_index = 0 WHERE id = ?').run(session.id);
        await promptPhotos(ctx, rooms[0].name);
      }
      break;
    }
    case 'faq':
      await promptFaq(ctx, 'wifi');
      break;
    case 'checklists': {
      const db = getDb();
      const rooms = db.prepare('SELECT * FROM rooms WHERE property_id = ? ORDER BY sort_order').all(session.property_id) as Array<{ id: number; name: string }>;
      if (rooms.length > 0) {
        db.prepare('UPDATE setup_sessions SET current_room_index = 0 WHERE id = ?').run(session.id);
        await promptChecklist(ctx, rooms[0].name, 'standard');
      }
      break;
    }
    case 'deep_clean':
      await promptDeepClean(ctx);
      break;
    case 'review':
      await promptReview(ctx, session.property_id);
      break;
  }
}

function getNextStep(currentStep: string): string | null {
  const idx = STEP_ORDER.indexOf(currentStep as typeof STEP_ORDER[number]);
  if (idx === -1 || idx >= STEP_ORDER.length - 1) return null;
  return STEP_ORDER[idx + 1];
}

export function registerSetupHandlers(bot: Telegraf): void {
  // Handle photo messages during setup
  bot.on(message('photo'), async (ctx) => {
    if (!isDM(ctx)) return;

    const owner = getOwnerByTelegramId(ctx.from.id) as Owner | null;
    if (!owner) return;

    const session = getActiveSession(owner.id);
    if (!session || session.current_step !== 'photos') return;

    const result = await handlePhotoSetup(ctx, session);
    if (result === 'step_complete') {
      const nextStep = getNextStep(session.current_step);
      if (nextStep) {
        advanceSession(session.id, nextStep);
        // Refresh session after advancing
        const updatedSession = getActiveSession(owner.id);
        if (updatedSession) {
          await promptForStep(ctx, updatedSession, nextStep);
        }
      }
    }
  });

  // Handle all text messages in DM for setup flow
  bot.on(message('text'), async (ctx, next) => {
    if (!isDM(ctx)) return next();

    // Skip bot commands — let them fall through to bot.start() etc.
    if (ctx.message.text.startsWith('/')) return next();

    const owner = getOwnerByTelegramId(ctx.from.id) as Owner | null;
    if (!owner) return;

    const text = ctx.message.text.trim();

    // Check for "new property" trigger
    if (/^new property$/i.test(text)) {
      // Check if there's already an active session
      const existingSession = getActiveSession(owner.id);
      if (existingSession) {
        const property = getPropertyById(existingSession.property_id);
        await ctx.reply(
          `You're already setting up "${property?.name || 'a property'}". ` +
          `Let's finish that first, or say "cancel setup" to start fresh.`
        );
        return;
      }

      // Create new property and session
      const db = getDb();
      const propertyResult = db.prepare(
        'INSERT INTO properties (owner_id, name, setup_step) VALUES (?, ?, ?)'
      ).run(owner.id, 'Untitled Property', 'name');

      const propertyId = Number(propertyResult.lastInsertRowid);

      db.prepare(
        'INSERT INTO setup_sessions (owner_id, property_id, current_step) VALUES (?, ?, ?)'
      ).run(owner.id, propertyId, 'name');

      await ctx.reply(
        "Let's set up a new property! This will take a few minutes.\n\n" +
        "What would you like to name this property? (e.g., \"Beach House\", \"Downtown Condo\")"
      );
      return;
    }

    // Check for cancel
    if (/^cancel setup$/i.test(text)) {
      const session = getActiveSession(owner.id);
      if (session) {
        const db = getDb();
        // Delete the property and session
        db.prepare('DELETE FROM setup_sessions WHERE id = ?').run(session.id);
        db.prepare('DELETE FROM properties WHERE id = ?').run(session.property_id);
        // Sync subscription quantity (remove property from billing)
        try {
          await syncSubscriptionQuantity(owner.id);
        } catch (err) {
          console.error('[PAYMENTS] Failed to sync subscription quantity after property deletion:', err);
        }
        await ctx.reply("Setup cancelled. Send \"new property\" whenever you're ready to start again.");
      } else {
        await ctx.reply("No active setup to cancel.");
      }
      return;
    }

    // Check for active session
    const session = getActiveSession(owner.id);
    if (!session) return; // No active setup, ignore message

    // Route based on current step
    switch (session.current_step) {
      case 'name': {
        const db = getDb();
        db.prepare('UPDATE properties SET name = ?, setup_step = ? WHERE id = ?')
          .run(text, 'rooms', session.property_id);
        advanceSession(session.id, 'rooms');
        await ctx.reply(`Great! "${text}" it is.`);
        const updatedSession = getActiveSession(owner.id);
        if (updatedSession) {
          await promptForStep(ctx, updatedSession, 'rooms');
        }
        break;
      }

      case 'rooms': {
        const result = await handleRoomSetup(ctx, session);
        if (result === 'step_complete') {
          advanceSession(session.id, 'photos');
          const updatedSession = getActiveSession(owner.id);
          if (updatedSession) {
            await promptForStep(ctx, updatedSession, 'photos');
          }
        }
        break;
      }

      case 'photos': {
        // Text messages during photo step (e.g., "done")
        const result = await handlePhotoSetup(ctx, session);
        if (result === 'step_complete') {
          const nextStep = getNextStep(session.current_step);
          if (nextStep) {
            advanceSession(session.id, nextStep);
            const updatedSession = getActiveSession(owner.id);
            if (updatedSession) {
              await promptForStep(ctx, updatedSession, nextStep);
            }
          }
        } else if (result === 'next_room') {
          // Prompt for next room photos handled inside handlePhotoSetup
        }
        break;
      }

      case 'faq': {
        const result = await handleFaqSetup(ctx, session);
        if (result === 'step_complete') {
          advanceSession(session.id, 'checklists');
          const updatedSession = getActiveSession(owner.id);
          if (updatedSession) {
            await promptForStep(ctx, updatedSession, 'checklists');
          }
        }
        break;
      }

      case 'checklists': {
        const result = await handleChecklistSetup(ctx, session);
        if (result === 'step_complete') {
          advanceSession(session.id, 'deep_clean');
          const updatedSession = getActiveSession(owner.id);
          if (updatedSession) {
            await promptForStep(ctx, updatedSession, 'deep_clean');
          }
        }
        break;
      }

      case 'deep_clean': {
        const result = await handleDeepCleanSetup(ctx, session);
        if (result === 'step_complete') {
          advanceSession(session.id, 'review');
          const updatedSession = getActiveSession(owner.id);
          if (updatedSession) {
            await promptForStep(ctx, updatedSession, 'review');
          }
        }
        break;
      }

      case 'review': {
        const result = await handleSetupReview(ctx, session);
        if (result === 'complete') {
          completeSession(session.id, session.property_id);
          // Sync subscription quantity (add property to billing)
          try {
            await syncSubscriptionQuantity(session.owner_id);
          } catch (err) {
            console.error('[PAYMENTS] Failed to sync subscription quantity after property setup:', err);
            // Non-blocking: don't fail property setup if billing sync fails
          }
          const property = getPropertyById(session.property_id);
          await ctx.reply(
            `Property "${property?.name}" is all set! You can add it to a cleaning group anytime.\n\n` +
            `Send "new property" to set up another property.`
          );
        }
        break;
      }
    }
  });

  // Handle resume: when owner sends any message with active session,
  // the text handler above catches it. The "Welcome back" logic is
  // handled by checking the session's updated_at timestamp.
  bot.use(async (ctx, next) => {
    if (!isDM(ctx) || !ctx.from) {
      await next();
      return;
    }

    const owner = getOwnerByTelegramId(ctx.from.id) as Owner | null;
    if (!owner) {
      await next();
      return;
    }

    const session = getActiveSession(owner.id);
    if (session) {
      // Check if resuming after absence (more than 5 minutes since last update)
      const lastUpdate = new Date(session.updated_at + 'Z').getTime();
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      if (now - lastUpdate > fiveMinutes) {
        const completedDesc = getCompletedStepsDescription(session.current_step);
        const currentDesc = STEP_DESCRIPTIONS[session.current_step] || session.current_step;
        const property = getPropertyById(session.property_id);

        if (completedDesc) {
          await ctx.reply(
            `Welcome back! You're setting up "${property?.name}". ` +
            `You finished ${completedDesc}. Ready to ${currentDesc}?`
          );
        }

        // Update the timestamp so we don't show the message again
        const db = getDb();
        db.prepare('UPDATE setup_sessions SET updated_at = datetime(\'now\') WHERE id = ?').run(session.id);
      }
    }

    await next();
  });
}
