/**
 * DB Smoke Test: Verifies initDb() creates all expected tables.
 * Run with: npx tsx scripts/smoke-test-db.ts
 * Uses a temporary DB so it doesn't touch production data.
 */
import fs from 'fs';
import path from 'path';

async function main() {
  // Use a temp DB path to avoid touching real data
  const tmpDir = path.join(__dirname, '..', 'data', '.test');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpDbPath = path.join(tmpDir, 'smoke-test.db');

  // Clean up any previous test DB
  if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);

  // Set env so connection.ts uses our temp DB
  process.env.DATABASE_PATH = tmpDbPath;

  // Now import and run initDb
  const { initDb } = await import('../src/db/schema.js');
  const { getDb, closeDb } = await import('../src/db/connection.js');

  initDb();
  const db = getDb();

  // Query sqlite_master for all tables
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all() as { name: string }[];

  const tableNames = tables.map(t => t.name);

  const expectedTables = [
    'checklist_items',
    'checklists',
    'cleaners',
    'cleaning_sessions',
    'comparison_results',
    'faq_entries',
    'milestone_photos',
    'owners',
    'properties',
    'rooms',
    'session_checklist_progress',
    'setup_sessions',
    'staging_photos',
    'telegram_groups',
  ];

  const missing = expectedTables.filter(t => !tableNames.includes(t));
  const extra = tableNames.filter(t => !expectedTables.includes(t));

  if (missing.length > 0) {
    console.error('FAIL: Missing tables:', missing.join(', '));
    closeDb();
    fs.unlinkSync(tmpDbPath);
    process.exit(1);
  }

  console.log(`PASS: All ${expectedTables.length} tables created successfully.`);
  if (extra.length > 0) {
    console.log(`Note: Extra tables found (OK): ${extra.join(', ')}`);
  }

  // Verify foreign keys are enabled
  const fkStatus = db.pragma('foreign_keys') as { foreign_keys: number }[];
  if (!fkStatus[0] || (fkStatus[0] as any).foreign_keys !== 1) {
    console.error('FAIL: foreign_keys pragma is not enabled');
    closeDb();
    fs.unlinkSync(tmpDbPath);
    process.exit(1);
  }
  console.log('PASS: foreign_keys pragma is ON.');

  // Cleanup
  closeDb();
  fs.unlinkSync(tmpDbPath);
  fs.rmdirSync(tmpDir, { recursive: false });
  console.log('DB smoke test complete.');
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
