import { createClient } from "@libsql/client/http";
import { timingSafeEqual, createHmac, scryptSync, randomBytes } from "node:crypto";

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

// Read a key together with its updated_at stamp, so a caller can later do an
// optimistic compare-and-swap write. Returns null when the row does not exist.
export async function kvGetWithMeta(key) {
  const res = await getDb().execute({ sql: "SELECT value, updated_at FROM kv WHERE key = ?", args: [key] });
  if (!res.rows.length) return null;
  let value;
  try { value = JSON.parse(res.rows[0].value); } catch { value = null; }
  return { value, updatedAt: Number(res.rows[0].updated_at) };
}

// Optimistic compare-and-swap write. Returns the new updated_at (version) on
// success, or null if the write was rejected because the row moved.
//   expectedUpdatedAt === null  -> insert only if the row does not exist yet.
//   expectedUpdatedAt === number -> update only if updated_at still matches.
// The new updated_at is forced strictly greater than the previous one so two
// writes landing in the same millisecond can't silently clobber each other.
// (A truthy number keeps `if (await kvCas(...))` working for boolean callers.)
export async function kvCas(key, value, expectedUpdatedAt) {
  const json = JSON.stringify(value);
  if (expectedUpdatedAt == null) {
    const now = Date.now();
    const res = await getDb().execute({
      sql: `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO NOTHING`,
      args: [key, json, now],
    });
    return res.rowsAffected > 0 ? now : null;
  }
  const next = Math.max(Date.now(), Number(expectedUpdatedAt) + 1);
  const res = await getDb().execute({
    sql: "UPDATE kv SET value = ?, updated_at = ? WHERE key = ? AND updated_at = ?",
    args: [json, next, key, Number(expectedUpdatedAt)],
  });
  return res.rowsAffected > 0 ? next : null;
}

// ------------------------------------------------------------
// Backup / restore of the entire kv table.
// kvDump() returns every row (value already parsed into JSON) so the result
// is a single self-contained snapshot. kvRestore() writes the rows back in a
// batch transaction, optionally wiping the table first ("replace" mode).
// ------------------------------------------------------------
export async function kvDump() {
  const res = await getDb().execute("SELECT key, value, updated_at FROM kv ORDER BY key");
  return res.rows.map(r => {
    let value;
    try { value = JSON.parse(r.value); } catch { value = r.value; }
    return { key: r.key, value, updated_at: Number(r.updated_at) };
  });
}

export async function kvRestore(rows, { replace = false } = {}) {
  if (!Array.isArray(rows)) throw new Error("backup rows must be an array");

  const stmts = [];
  if (replace) stmts.push("DELETE FROM kv");
  for (const r of rows) {
    if (!r || typeof r.key !== "string" || !r.key) continue;
    const value = typeof r.value === "string" ? r.value : JSON.stringify(r.value);
    const updatedAt = Number.isFinite(Number(r.updated_at)) ? Number(r.updated_at) : Date.now();
    stmts.push({
      sql: `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      args: [r.key, value, updatedAt],
    });
  }

  // batch() runs all statements in a single implicit transaction (all-or-nothing)
  await getDb().batch(stmts, "write");
  return stmts.length - (replace ? 1 : 0);
}

// ------------------------------------------------------------
// Admin auth
// Resolves the active admin password from (in order):
//   1. admin_store.password (set via admin panel)
//   2. ADMIN_PASSWORD env var (for initial bootstrap)
// Returns null if neither is configured — callers MUST fail closed.
// The stored value may be a plaintext (legacy) or a "scrypt$" hash.
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

// ------------------------------------------------------------
// Credential hashing (scrypt, salted). Format: scrypt$<saltHex>$<hashHex>
// verifySecret accepts both hashed and legacy-plaintext stored values so we
// can migrate transparently without locking anyone out.
// ------------------------------------------------------------
export function hashSecret(plain) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(plain), salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function isHashed(stored) {
  return typeof stored === "string" && stored.startsWith("scrypt$");
}

export function verifySecret(plain, stored) {
  if (typeof plain !== "string" || plain.length === 0) return false;
  if (typeof stored !== "string" || stored.length === 0) return false;
  if (!isHashed(stored)) return safeEqual(plain, stored); // legacy plaintext
  const [, saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(plain, Buffer.from(saltHex, "hex"), expected.length);
    return timingSafeEqual(actual, expected);
  } catch { return false; }
}

function bearer(req) {
  const auth = req.headers.authorization ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

// Validates a request's Authorization: Bearer <token> header against the
// configured admin password. Fails closed if no password is configured.
export async function verifyAdminAuth(req) {
  const token = bearer(req);
  if (!token) return false;
  const pw = await getAdminPassword();
  if (!pw) return false;
  return verifySecret(token, pw);
}

// ------------------------------------------------------------
// Employee tokens — short-lived HMAC tokens issued on PIN login.
// Format: <empId>.<expMs>.<hmacHex>  (base64url-safe pieces).
// Secret falls back to TURSO_AUTH_TOKEN when AUTH_SECRET is unset so the
// system works without extra config (the token is server-only and secret).
// ------------------------------------------------------------
function authSecret() {
  return process.env.AUTH_SECRET || process.env.TURSO_AUTH_TOKEN || "";
}

const EMP_TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h

export function signEmpToken(empId) {
  const exp = Date.now() + EMP_TOKEN_TTL_MS;
  const body = `${empId}.${exp}`;
  const sig = createHmac("sha256", authSecret()).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function verifyEmpToken(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [empId, expStr, sig] = parts;
  const body = `${empId}.${expStr}`;
  const expected = createHmac("sha256", authSecret()).update(body).digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (!Number(expStr) || Date.now() > Number(expStr)) return null;
  return empId;
}

// Returns { role: "admin" | "employee", empId? } or null.
// Accepts the admin password OR a valid employee token in the Bearer header.
export async function verifyStaffAuth(req) {
  if (await verifyAdminAuth(req)) return { role: "admin" };
  const empId = verifyEmpToken(bearer(req));
  if (empId) return { role: "employee", empId };
  return null;
}

// ------------------------------------------------------------
// Client IP + fixed-window rate limiter (backed by kv).
// Best-effort: not strictly atomic, but sufficient to throttle brute-force
// and enumeration. Keys are namespaced under "rl:".
// ------------------------------------------------------------
export function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return req.headers["x-real-ip"] || "unknown";
}

export async function rateLimit(key, max, windowMs) {
  const k = "rl:" + key;
  const now = Date.now();
  const rec = await kvGet(k);
  if (!rec || typeof rec.reset !== "number" || now > rec.reset) {
    await kvSet(k, { count: 1, reset: now + windowMs });
    return { ok: true };
  }
  if (rec.count >= max) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((rec.reset - now) / 1000)) };
  }
  await kvSet(k, { count: rec.count + 1, reset: rec.reset });
  return { ok: true };
}

// ------------------------------------------------------------
// CORS — allowlist based. Cross-origin access is only granted to origins in
// ALLOWED_ORIGINS (comma-separated). Same-origin app requests are unaffected
// (browsers don't require ACAO for same-origin), so the secure default with
// no env set is "same-origin only".
// ------------------------------------------------------------
export function applyCors(req, res, methods) {
  const allow = (process.env.ALLOWED_ORIGINS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allow.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// Generic input sanitizer: coerces to string, strips angle brackets and
// control chars, caps length. Mitigates stored XSS at the write boundary.
export function sanitizeStr(v, max = 200) {
  if (v == null) return v;
  return String(v).replace(/[<>]/g, "").replace(/[\x00-\x1F\x7F]/g, "").slice(0, max);
}
