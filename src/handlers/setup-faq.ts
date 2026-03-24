import { Context } from 'telegraf';
import { getDb } from '../db/connection.js';
import { SetupSession } from '../types/index.js';

// FAQ categories in order
const FAQ_CATEGORIES = ['wifi', 'parking', 'trash', 'appliances', 'house_rules', 'emergency'] as const;

const CATEGORY_PROMPTS: Record<string, string> = {
  wifi: "What's the WiFi network name and password?",
  parking: "What are the parking instructions for guests/cleaners?",
  trash: "When is trash day and where are the bins?",
  appliances: "Any special instructions for appliances? (TV, washer, thermostat, etc.) Or say 'skip'",
  house_rules: "What are the house rules guests should know?",
  emergency: "What emergency contacts should be available? (your number, local emergency, maintenance, etc.)",
};

const CATEGORY_QUESTIONS: Record<string, string> = {
  wifi: 'What is the WiFi password?',
  parking: 'Where do I park?',
  trash: 'When is trash day?',
  appliances: 'How do I use the appliances?',
  house_rules: 'What are the house rules?',
  emergency: 'Who do I contact in an emergency?',
};

const CATEGORY_LABELS: Record<string, string> = {
  wifi: 'WiFi',
  parking: 'Parking',
  trash: 'Trash',
  appliances: 'Appliances',
  house_rules: 'House rules',
  emergency: 'Emergency contacts',
};

// Track which FAQ category each owner is on (keyed by owner telegram_id)
const faqProgress: Map<number, number> = new Map();

export async function promptFaq(ctx: Context, category: string): Promise<void> {
  const prompt = CATEGORY_PROMPTS[category];
  if (prompt) {
    const label = CATEGORY_LABELS[category] || category;
    await ctx.reply(`${label}: ${prompt}`);
  }
}

export async function handleFaqSetup(ctx: Context, session: SetupSession): Promise<'step_complete' | 'waiting'> {
  const text = 'text' in (ctx.message || {}) ? (ctx.message as { text: string }).text.trim() : '';
  if (!text) return 'waiting';

  const ownerId = session.owner_id;
  let categoryIndex = faqProgress.get(ownerId) ?? 0;
  const currentCategory = FAQ_CATEGORIES[categoryIndex];

  if (!currentCategory) return 'step_complete';

  // Handle skip
  if (text.toLowerCase() === 'skip') {
    categoryIndex++;
    faqProgress.set(ownerId, categoryIndex);

    if (categoryIndex >= FAQ_CATEGORIES.length) {
      faqProgress.delete(ownerId);
      await ctx.reply("FAQ basics are set! You can always add more entries later. Moving on to checklists...");
      return 'step_complete';
    }

    const nextCategory = FAQ_CATEGORIES[categoryIndex];
    const nextLabel = CATEGORY_LABELS[nextCategory];
    await ctx.reply(`Skipped. Next up: ${nextLabel}.`);
    await promptFaq(ctx, nextCategory);
    return 'waiting';
  }

  // Save the answer
  const db = getDb();
  db.prepare(
    'INSERT INTO faq_entries (property_id, category, question, answer) VALUES (?, ?, ?, ?)'
  ).run(session.property_id, currentCategory, CATEGORY_QUESTIONS[currentCategory], text);

  const label = CATEGORY_LABELS[currentCategory];
  categoryIndex++;
  faqProgress.set(ownerId, categoryIndex);

  if (categoryIndex >= FAQ_CATEGORIES.length) {
    faqProgress.delete(ownerId);
    await ctx.reply(`Got it! ${label} info saved.\n\nFAQ basics are set! You can always add more entries later. Moving on to checklists...`);
    return 'step_complete';
  }

  const nextCategory = FAQ_CATEGORIES[categoryIndex];
  const nextLabel = CATEGORY_LABELS[nextCategory];
  await ctx.reply(`Got it! ${label} info saved. Next up: ${nextLabel}.`);
  await promptFaq(ctx, nextCategory);
  return 'waiting';
}
