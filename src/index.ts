import 'dotenv/config';
import { initDb } from './db/schema.js';

// Must init DB before bot.ts loads — handler registration queries DB
initDb();
console.log('Database initialized');

async function main() {
  const { bot } = await import('./bot.js');
  const { reloadActiveSessions } = await import('./handlers/cleaning.js');

  if (process.env.SEED_DB === 'true') {
    // Dynamic import with variable path to avoid tsc rootDir conflict (scripts/ is outside src/)
    const seedPath = '../scripts/seed-dev.js';
    const { seedDevData } = await import(seedPath);
    seedDevData(process.env.OWNER_TELEGRAM_ID);
  }

  reloadActiveSessions();

  // launch() never resolves (it polls forever), so log before awaiting
  console.log('TextBud bot is running');
  await bot.launch();

  // Graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start TextBud:', err);
  process.exit(1);
});
