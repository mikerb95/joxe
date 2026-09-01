import { createClient as createHttpClient } from "@libsql/client/http";
import { timingSafeEqual, createHmac, scryptSync, randomBytes } from "node:crypto";
import { createRequire } from "node:module";

let _db = null;

function getDb() {
  if (_db) return _db;
  const url   = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("Missing TURSO_DATABASE_URL");
  // Remote Turso/libsql uses the lightweight HTTP client (as on Vercel). A
  // local file: URL (dev/testing) needs the full client, which bundles the
  // native driver; this branch never runs in production.
  if (url.startsWith("file:")) {
    // Lazy require so the native client is only loaded when actually used.
    const { createClient } = createRequire(import.meta.url)("@libsql/client");
    _db = createClient({ url });
    return _db;
  }
  if (!token) throw new Error("Missing TURSO_AUTH_TOKEN");
  _db = createHttpClient({ url, authToken: token });
  return _db;
}

// La tabla se crea una sola vez por instancia de función. Antes este
// CREATE TABLE IF NOT EXISTS viajaba a la base en cada request de cada
// endpoint, aunque la tabla existiera desde hace meses. Fluid Compute reutiliza
// las instancias, así que guardar la promesa elimina esa consulta repetida.
// Si falla se limpia el cache para que el siguiente request lo reintente.
let _initPromise = null;

export async function initTables() {
  if (!_initPromise) {
    _initPromise = getDb().execute(`
      CREATE TABLE IF NOT EXISTS kv (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).catch(err => { _initPromise = null; throw err; });
  }
  await _initPromise;
}

// ------------------------------------------------------------
// Lectura con cache corto en memoria, por instancia de función.
// Pensado para claves que se leen muchísimo y cambian poco (admin_store: la
// configuración del salón). El TTL es corto a propósito: un cambio hecho desde
// el panel se ve reflejado como mucho unos segundos después, y a cambio se
// evitan miles de lecturas diarias contra Turso.
// NO usar para turno_store: ese dato necesita ser exacto para no dar dos veces
// el mismo turno, y sus escrituras van por compare-and-swap.
// ------------------------------------------------------------
const _cache = new Map();

export async function kvGetCached(key, ttlMs = 30000) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await kvGet(key);
  _cache.set(key, { value, at: Date.now() });
  return value;
}

// Invalida el cache de una clave (o de todo). Llamar tras escribir.
export function kvInvalidate(key) {
  if (key === undefined) _cache.clear();
  else _cache.delete(key);
}

export async function kvGet(key) {
  const res = await getDb().execute({ sql: "SELECT value FROM kv WHERE key = ?", args: [key] });
  if (!res.rows.length) return null;
  try { return JSON.parse(res.rows[0].value); } catch { return null; }
}

export async function kvSet(key, value) {
  kvInvalidate(key);
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

// ------------------------------------------------------------
// Nombres de personas. Un nombre se publica en la web, se imprime en el panel
// y se lee en voz alta en el lobby, así que solo se aceptan letras (con tildes
// y ñ), espacios y los dos signos que aparecen dentro de nombres reales:
// apóstrofo y guion. Fuera quedan números, emojis y símbolos.
//
// cleanName limpia y NO falla: sirve para normalizar lo que llega.
// nameError devuelve el mensaje a mostrar, o "" si el nombre es válido.
// Las dos funciones están duplicadas en el front (portal, resena, academia,
// admin) porque esos archivos se cargan sueltos en el navegador, sin bundler.
// Si cambias la regla aquí, cámbiala también allá.
// ------------------------------------------------------------
const NAME_STRIP_RE = /[^\p{L}\p{M}'’ -]/gu;
const NAME_HAS_FORBIDDEN_RE = /[^\p{L}\p{M}'’ -]/u;

export function cleanName(v, max = 120) {
  return String(v ?? "")
    .replace(NAME_STRIP_RE, "")       // fuera dígitos, emojis y símbolos
    .replace(/['’-]{2,}/g, m => m[0])  // "Ana--María" -> "Ana-María"
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// Longitud mínima 2: hay nombres de pila de dos letras (Li, Jo) y el campo
// puede recibir solo el nombre, sin apellido.
export function nameError(v, { min = 2, max = 120 } = {}) {
  const raw = String(v ?? "").trim();
  if (!raw) return "Escribe tu nombre.";
  // Solo se reclama por caracteres prohibidos. Los espacios de más o un guion
  // repetido se arreglan solos en cleanName, no son culpa del cliente.
  if (NAME_HAS_FORBIDDEN_RE.test(raw)) {
    return "Usa solo letras: sin números, emojis ni símbolos.";
  }
  const clean = cleanName(raw, max);
  if (clean.replace(/[^\p{L}]/gu, "").length < min) return `Escribe al menos ${min} letras.`;
  return "";
}

// ------------------------------------------------------------
// ¿Esta cita da derecho a dejar reseña?
// El flujo presencial (check-in -> "Completar servicio") mueve la cita a
// store.completed, pero no todos los salones lo usan: si nadie pulsa ese
// botón, la cita se queda en "appointments" para siempre y el cliente jamás
// puede opinar. Por eso también cuenta una cita cuya hora ya pasó, siempre
// que no esté cancelada ni marcada como incumplida.
// El filtro de lo que sale a la web sigue siendo la moderación del panel.
// ------------------------------------------------------------
const COT_UTC_OFFSET = "-05:00"; // Colombia, sin horario de verano

export function apptStartMs(a) {
  const t = new Date(`${a?.date || ""}T${a?.time || "00:00"}:00${COT_UTC_OFFSET}`).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// Momento a partir del cual la visita se considera ocurrida.
export function apptDoneMs(a) {
  if (a?.completedAt) {
    const t = new Date(a.completedAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return apptStartMs(a);
}

// completedIds/cancelledIds/noShowIds llegan como Set o array.
export function makeReviewEligibility({ completedIds, cancelledIds, noShowIds } = {}) {
  const asSet = v => (v instanceof Set ? v : new Set(v || []));
  const done = asSet(completedIds);
  const cancelled = asSet(cancelledIds);
  const noShow = asSet(noShowIds);
  return (a) => {
    if (!a?.id) return false;
    if (cancelled.has(a.id) || noShow.has(a.id)) return false;
    if (a.status === "cancelled" || a.status === "no-show") return false;
    if (done.has(a.id)) return true;          // pasó por el checkout
    return apptStartMs(a) < Date.now();       // o simplemente ya ocurrió
  };
}

// ------------------------------------------------------------
// Tokens de reseña - HMAC de larga duración, uno por cita completada.
// Formato: <apptId>.<expMs>.<hmacHex>, igual que los tokens de empleado pero
// con un dominio distinto en la firma ("rev:") para que un token no sirva
// jamás como el otro. Se generan desde el panel al completar la cita y viajan
// en el link que se le pasa al cliente por WhatsApp.
// ------------------------------------------------------------
const REVIEW_TOKEN_TTL_MS = 45 * 24 * 60 * 60 * 1000; // 45 días

export function signReviewToken(apptId, ttlMs = REVIEW_TOKEN_TTL_MS) {
  const exp = Date.now() + ttlMs;
  const body = `${apptId}.${exp}`;
  const sig = createHmac("sha256", authSecret()).update(`rev:${body}`).digest("hex");
  return `${body}.${sig}`;
}

export function verifyReviewToken(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [apptId, expStr, sig] = parts;
  const expected = createHmac("sha256", authSecret())
    .update(`rev:${apptId}.${expStr}`).digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (!Number(expStr) || Date.now() > Number(expStr)) return null;
  return apptId;
}
