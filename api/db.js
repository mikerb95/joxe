import { createClient } from "@libsql/client/http";
import { timingSafeEqual } from "node:crypto";

let _db = null;

function getDb() {
  if (_db) return _db;
  const url   = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url || !token) throw new Error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");
  _db = createClient({ url, authToken: token });
  return _db;
}

export async function initTables() {
  await getDb().execute(`
    CREATE TABLE IF NOT EXISTS kv (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
}

export async function kvGet(key) {
  const res = await getDb().execute({ sql: "SELECT value FROM kv WHERE key = ?", args: [key] });
  if (!res.rows.length) return null;
  try { return JSON.parse(res.rows[0].value); } catch { return null; }
}

export async function kvSet(key, value) {
  await getDb().execute({
    sql: `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [key, JSON.stringify(value), Date.now()],
  });
}
