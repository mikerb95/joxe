import { initTables, kvGet, kvSet, applyCors, clientIp, rateLimit, sanitizeStr, verifyStaffAuth } from "../lib/db.js";

const MAX_ENTRIES = 2000;          // hard cap to bound storage / abuse
const ID_RE   = /^[A-Za-z0-9_-]{6,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ["waiting", "booked", "cancelled"];
const STORE_KEY = "waitlist_store";

const DEFAULT = () => ({ entries: [] });

function genId() {
  return "wl_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// Whitelist + sanitize a public join request. Returns { entry } or { error }.
function validateEntry(raw) {
  if (!raw || typeof raw !== "object") return { error: "Invalid body" };
  const name = sanitizeStr(raw.name, 120);
  if (!name || name.trim().length < 3) return { error: "Invalid name" };

  const phone = String(raw.phone ?? "").replace(/\D/g, "").slice(0, 20);
  if (phone.length < 7) return { error: "Invalid phone" };

  const preferredDate = raw.preferredDate ? String(raw.preferredDate) : "";
  if (preferredDate && !DATE_RE.test(preferredDate)) return { error: "Invalid date" };

  const dur = Number(raw.serviceDur);
  const entry = {
    id: genId(),
    name,
    phone,
    cedula: String(raw.cedula ?? "").replace(/\D/g, "").slice(0, 20),
    service: sanitizeStr(raw.service, 80),
    serviceDur: Number.isFinite(dur) && dur >= 0 && dur <= 600 ? dur : 0,
    stylist: sanitizeStr(raw.stylist, 80),
    preferredDate,
    note: sanitizeStr(raw.note, 200),
    status: "waiting",
    createdAt: Date.now(),
  };
  return { entry };
}

export default async function handler(req, res) {
  applyCors(req, res, "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    await initTables();

    // ---- Staff read: full list ----
    if (req.method === "GET") {
      if (!(await verifyStaffAuth(req))) return res.status(401).json({ error: "Unauthorized" });
      const store = { ...DEFAULT(), ...((await kvGet(STORE_KEY)) || {}) };
      return res.status(200).json({ entries: store.entries || [] });
    }

    if (req.method === "POST") {
      const body = req.body ?? {};

      // ---- Staff management: update status / delete ----
      if (body.action === "status" || body.action === "delete") {
        if (!(await verifyStaffAuth(req))) return res.status(401).json({ error: "Unauthorized" });
        if (!ID_RE.test(String(body.id ?? ""))) return res.status(400).json({ error: "Invalid id" });
        const store = { ...DEFAULT(), ...((await kvGet(STORE_KEY)) || {}) };
        let entries = store.entries || [];
        if (body.action === "delete") {
          entries = entries.filter(e => e.id !== body.id);
        } else {
          if (!STATUSES.includes(body.status)) return res.status(400).json({ error: "Invalid status" });
          entries = entries.map(e => e.id === body.id ? { ...e, status: body.status } : e);
        }
        await kvSet(STORE_KEY, { ...store, entries });
        return res.status(200).json({ ok: true });
      }

      // ---- Public join ----
      const ip = clientIp(req);
      const rl = await rateLimit(`waitlist:${ip}`, 8, 5 * 60 * 1000);
      if (!rl.ok) {
        res.setHeader("Retry-After", String(rl.retryAfter));
        return res.status(429).json({ error: "Too many requests" });
      }

      const v = validateEntry(body);
      if (v.error) return res.status(400).json({ error: v.error });

      const store = { ...DEFAULT(), ...((await kvGet(STORE_KEY)) || {}) };
      const entries = store.entries || [];
      if (entries.length >= MAX_ENTRIES) return res.status(507).json({ error: "Storage limit reached" });

      // Idempotent-ish: ignore an identical pending entry (same phone + date + service)
      const dup = entries.some(e =>
        e.status === "waiting" && e.phone === v.entry.phone &&
        e.preferredDate === v.entry.preferredDate && e.service === v.entry.service
      );
      if (dup) return res.status(200).json({ ok: true, duplicate: true });

      await kvSet(STORE_KEY, { ...store, entries: [...entries, v.entry] });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[waitlist]", err.message);
    return res.status(500).json({ error: "Internal error" });
  }
}
