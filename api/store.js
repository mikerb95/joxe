import { initTables, kvGetWithMeta, kvCas, verifyStaffAuth, applyCors } from "../lib/db.js";

const DEFAULT = () => ({ appointments: [], active: [], completed: [], blockedSlots: [], blockRanges: [] });

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
      const rec = await kvGetWithMeta("turno_store");
      const version = rec ? rec.updatedAt : 0;
      const stored = { ...DEFAULT(), ...(rec?.value || {}) };
      const auth = await verifyStaffAuth(req);
      // _v is the optimistic-concurrency stamp staff clients echo back on write.
      if (auth) return res.status(200).json({ ...stored, _v: version });
      // Public: only occupancy data, no client PII
      return res.status(200).json({
        appointments: (stored.appointments || []).map(publicAppt),
        active: [],
        completed: [],
        blockedSlots: stored.blockedSlots || [],
        blockRanges: stored.blockRanges || [],
        _v: version,
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

      const payload = {
        appointments: body.appointments ?? [],
        active: body.active ?? [],
        completed: body.completed ?? [],
        blockedSlots: body.blockedSlots ?? [],
      };

      const rec = await kvGetWithMeta("turno_store");
      const curV = rec ? rec.updatedAt : 0;
      const clientV = Number(body._v);
      const guarded = Number.isFinite(clientV);

      // Optimistic concurrency: if the client sent the version it based its edit
      // on and the store has moved since (e.g. a client booking landed via
      // /api/book), reject instead of clobbering. The client reconciles with the
      // fresh store and retries — no silent loss of appointments.
      if (guarded && clientV !== curV) {
        const fresh = { ...DEFAULT(), ...(rec?.value || {}) };
        return res.status(409).json({ error: "stale", store: fresh, _v: curV });
      }

      const newV = rec
        ? await kvCas("turno_store", payload, rec.updatedAt)
        : await kvCas("turno_store", payload, null);

      // Lost the race between our read and write → tell the client to reconcile.
      if (!newV) {
        const after = await kvGetWithMeta("turno_store");
        return res.status(409).json({
          error: "stale",
          store: { ...DEFAULT(), ...(after?.value || {}) },
          _v: after ? after.updatedAt : 0,
        });
      }
      return res.status(200).json({ ok: true, _v: newV });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[store]", err.message);
    return res.status(500).json({ error: "Internal error" });
  }
}
