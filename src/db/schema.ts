import { getDb } from './connection.js';
import fs from 'fs';
import path from 'path';

export function initDb(): void {
  const db = getDb();
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    // Split on semicolons and execute each statement individually
    // This allows ALTER TABLE statements to fail gracefully on re-run
    const statements = sql.split(/;\s*\n/).filter(s => s.trim().length > 0);
    for (const stmt of statements) {
      try {
        db.exec(stmt + ';');
      } catch (err: any) {
        // Ignore "duplicate column" errors from ALTER TABLE on re-run
        if (err.message && err.message.includes('duplicate column')) {
          continue;
        }
        throw err;
      }
    }
  }
}
