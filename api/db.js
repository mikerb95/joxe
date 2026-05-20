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

// ------------------------------------------------------------
// Admin auth
// Resolves the active admin password from (in order):
//   1. admin_store.password (set via admin panel)
//   2. ADMIN_PASSWORD env var (for initial bootstrap)
// Returns null if neither is configured — callers MUST fail closed.
// ------------------------------------------------------------
export async function getAdminPassword() {
  const admin = await kvGet("admin_store");
  const stored = admin?.password;
  if (typeof stored === "string" && stored.length > 0) return stored;
  const env = process.env.ADMIN_PASSWORD;
  if (typeof env === "string" && env.length > 0) return env;
  return null;
}

// Constant-time string comparison. Returns false if either input is not a
// non-empty string or lengths differ (after equalizing buffer length).
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length === 0 || b.length === 0) return false;
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  try { return timingSafeEqual(ab, bb); } catch { return false; }
}

// Validates a request's Authorization: Bearer <token> header against the
// configured admin password. Fails closed if no password is configured.
export async function verifyAdminAuth(req) {
  const auth  = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  const pw = await getAdminPassword();
  if (!pw) return false;
  return safeEqual(token, pw);
}
