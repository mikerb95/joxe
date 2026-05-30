import { initTables, kvGet, kvSet, verifyStaffAuth, applyCors } from "./db.js";

const DEFAULT = () => ({ appointments: [], active: [], completed: [], blockedSlots: [] });

// Fields the public booking page legitimately needs to compute availability.
// Everything else (name, phone, cedula, notes...) is PII and must be stripped
// for unauthenticated readers.
function publicAppt(a) {
  return {
    id: a.id,
    date: a.date,
    time: a.time,
    stylist: a.stylist,
    service: a.service,
    serviceDur: a.serviceDur,
    status: a.status,
  };
}

export default async function handler(req, res) {
  applyCors(req, res, "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    await initTables();

    if (req.method === "GET") {
      const stored = { ...DEFAULT(), ...((await kvGet("turno_store")) || {}) };
      const auth = await verifyStaffAuth(req);
      if (auth) return res.status(200).json(stored);
      // Public: only occupancy data, no client PII
      return res.status(200).json({
        appointments: (stored.appointments || []).map(publicAppt),
        active: [],
        completed: [],
        blockedSlots: stored.blockedSlots || [],
      });
    }

    if (req.method === "POST") {
      // All writes require staff auth (admin or employee token). No anonymous path.
      if (!(await verifyStaffAuth(req))) return res.status(401).json({ error: "Unauthorized" });

      const body = req.body;
      if (!body || typeof body !== "object") return res.status(400).json({ error: "Invalid body" });
      for (const field of ["appointments", "active", "completed", "blockedSlots"]) {
        if (body[field] !== undefined && !Array.isArray(body[field])) {
          return res.status(400).json({ error: `${field} must be an array` });
        }
      }

      await kvSet("turno_store", {
        appointments: body.appointments ?? [],
        active: body.active ?? [],
        completed: body.completed ?? [],
        blockedSlots: body.blockedSlots ?? [],
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[store]", err.message);
    return res.status(500).json({ error: "Internal error" });
  }
}
