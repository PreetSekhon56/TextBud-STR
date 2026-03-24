import 'dotenv/config';
import { bot } from './bot.js';
import { initDb } from './db/schema.js';

async function main() {
  // Initialize database
  initDb();
  console.log('Database initialized');

  // Launch bot
  await bot.launch();
  console.log('TextBud bot is running');

  // Graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start TextBud:', err);
  process.exit(1);
});
