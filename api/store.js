import { initTables, kvGet, kvSet } from "./db.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DEFAULT = () => ({ appointments: [], active: [], completed: [], blockedSlots: [] });

async function getStoredPassword() {
  const admin = await kvGet("admin_store");
  return admin?.password ?? "joxe2026";
}

async function validateAuth(req) {
  const auth  = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  return token === (await getStoredPassword());
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    await initTables();

    if (req.method === "GET") {
      const stored = await kvGet("turno_store");
      return res.status(200).json({ ...DEFAULT(), ...(stored || {}) });
    }

    if (req.method === "POST") {
      const body = req.body;

      // Require auth for full store replace (admin/employee with admin token)
      // Fall through to append-only path for unauthenticated employee check-in writes
      const authed = await validateAuth(req);

      // Body shape validation: all array fields must be arrays if present
      for (const field of ["appointments", "active", "completed", "blockedSlots"]) {
        if (body[field] !== undefined && !Array.isArray(body[field])) {
          return res.status(400).json({ error: `${field} must be an array` });
        }
      }

      if (authed) {
        // Authenticated: full store replace
        await kvSet("turno_store", body);
        return res.status(200).json({ ok: true });
      }

      // Unauthenticated: merge-only — never shrink active or completed
      const current = await kvGet("turno_store") ?? DEFAULT();
      const merged = {
        appointments: body.appointments ?? current.appointments,
        blockedSlots: body.blockedSlots ?? current.blockedSlots,
        // Protect completed and active: only grow them, never shrink below server state
        active: mergeById(current.active, body.active),
        completed: mergeById(current.completed, body.completed),
      };
      await kvSet("turno_store", merged);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[store]", err.message);
    return res.status(500).json({ error: err.message });
  }
}

// Returns the union of server items and incoming items, keyed by id.
// Incoming changes to existing records win; server-only records are kept.
function mergeById(serverArr, incomingArr) {
  if (!Array.isArray(incomingArr)) return serverArr;
  const map = new Map((serverArr || []).map(item => [item.id, item]));
  for (const item of incomingArr) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}
