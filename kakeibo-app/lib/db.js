import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const DB_PATH = process.env.KAKEIBO_DB_PATH || path.join(process.cwd(), "data", "kakeibo.db");

function createDb() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  return db;
}

// Reuse a single connection across hot reloads in dev.
const globalForDb = globalThis;
export const db = globalForDb.__kakeiboDb || (globalForDb.__kakeiboDb = createDb());

export function getValue(key) {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(key);
  return row ? row.value : null;
}

export function setValue(key, value) {
  db.prepare(
    "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}
