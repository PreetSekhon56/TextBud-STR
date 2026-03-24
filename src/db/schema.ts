import { getDb } from './connection.js';
import fs from 'fs';
import path from 'path';

export function initDb(): void {
  const db = getDb();
  const migrationPath = path.join(__dirname, 'migrations', '001_initial.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');
  db.exec(sql);
}
