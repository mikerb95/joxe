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
      const auth = await verifyStaffAuth(req);
      if (!auth) return res.status(401).json({ error: "Unauthorized" });

      const body = req.body;
      if (!body || typeof body !== "object") return res.status(400).json({ error: "Invalid body" });
      for (const field of ["appointments", "active", "completed", "blockedSlots", "blockRanges"]) {
        if (body[field] !== undefined && !Array.isArray(body[field])) {
          return res.status(400).json({ error: `${field} must be an array` });
        }
      }

      const payload = {
        appointments: body.appointments ?? [],
        active: body.active ?? [],
        completed: body.completed ?? [],
        blockedSlots: body.blockedSlots ?? [],
        blockRanges: body.blockRanges ?? [],
      };

      // La versión es obligatoria. Antes, un POST sin _v se saltaba el control
      // y reemplazaba la agenda entera: con un token de empleado bastaba
      // mandar listas vacías para borrarla. El panel y el portal siempre la
      // mandan.
      const clientV = Number(body._v);
      if (body._v === undefined || body._v === null || !Number.isFinite(clientV)) {
        return res.status(400).json({ error: "Missing _v" });
      }

      const rec = await kvGetWithMeta("turno_store");
      const curV = rec ? rec.updatedAt : 0;

      // Un empleado mueve citas (estado, cola, completar) pero nunca las borra:
      // eliminar es solo del admin. Si una escritura de empleado hace
      // desaparecer citas o historial, se rechaza entera.
      if (auth.role === "employee" && rec?.value) {
        const ids = (arr) => new Set((Array.isArray(arr) ? arr : []).map(a => a?.id));
        const before = rec.value;
        const keptAll = (field) => {
          const now = ids(payload[field]);
          for (const id of ids(before[field])) if (!now.has(id)) return false;
          return true;
        };
        // "active" (la cola de la sala) sí puede vaciarse: al completar, la cita
        // pasa a "completed", y limpiar la sala es parte del día a día.
        if (!keptAll("appointments") || !keptAll("completed")) {
          return res.status(403).json({ error: "Un empleado no puede eliminar citas" });
        }
      }

      // Optimistic concurrency: if the store has moved since the version the
      // client based its edit on (e.g. a client booking landed via /api/book),
      // reject instead of clobbering. The client reconciles with the fresh store
      // and retries, so no appointment is silently lost.
      if (clientV !== curV) {
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
