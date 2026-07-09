import { initTables, kvGet, kvSet, applyCors, clientIp, rateLimit } from "../lib/db.js";

const COT_OFFSET = "-05:00"; // Colombia = UTC-5 fijo (sin horario de verano)

export default async function handler(req, res) {
  applyCors(req, res, "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    await initTables();

    // ---- Client self-service cancel ----
    if (req.method === "POST") {
      const { id, cedula: rawCedula, action } = req.body ?? {};
      if (action !== "cancel") return res.status(400).json({ error: "Invalid action" });

      const ip = clientIp(req);
      const rl = await rateLimit(`client:${ip}`, 15, 5 * 60 * 1000);
      if (!rl.ok) {
        res.setHeader("Retry-After", String(rl.retryAfter));
        return res.status(429).json({ error: "Too many requests" });
      }

      const cedula = String(rawCedula ?? "").replace(/\D/g, "");
      if (!id || !cedula) return res.status(400).json({ error: "Missing id or cedula" });

      const store     = await kvGet("turno_store") || { appointments: [], active: [], completed: [], blockedSlots: [] };
      const adminData = await kvGet("admin_store")  || {};

      const all = [...(store.appointments || []), ...(store.active || []), ...(store.completed || [])];
      const appt = all.find(a => a.id === id);
      // Ownership check: the appointment's cedula must match the requester's.
      if (!appt || (appt.cedula || "").replace(/\D/g, "") !== cedula) {
        return res.status(404).json({ error: "Appointment not found" });
      }

      // Already finished/cancelled — nothing to do.
      const completedSet = new Set((store.completed || []).map(a => a.id));
      if ((adminData.cancelledIds || []).includes(id) || completedSet.has(id)) {
        return res.status(200).json({ ok: true, alreadyCancelled: true });
      }

      // Enforce minimum-notice window.
      const minHours = Number(adminData.selfService?.minHoursBefore ?? 2);
      if (minHours > 0 && appt.date && appt.time) {
        const startMs = new Date(`${appt.date}T${appt.time}:00${COT_OFFSET}`).getTime();
        if (!Number.isNaN(startMs) && (startMs - Date.now()) < minHours * 3600 * 1000) {
          return res.status(409).json({ error: "too_late", minHours });
        }
      }

      const cancelledIds = [...new Set([...(adminData.cancelledIds || []), id])];
      await kvSet("admin_store", { ...adminData, cancelledIds });
      return res.status(200).json({ ok: true });
    }

    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const cedula = (req.query.cedula || "").replace(/\D/g, "");
    const phone  = (req.query.phone  || "").replace(/\D/g, "");
    if (!cedula && !phone) return res.status(400).json({ error: "Missing cedula or phone" });

    const store     = await kvGet("turno_store") || { appointments: [], active: [], completed: [], blockedSlots: [] };
    const adminData = await kvGet("admin_store")  || {};
    const crmStore  = await kvGet("crm_store")    || {};

    const activeSet    = new Set((store.active    || []).map(a => a.id));
    const completedSet = new Set((store.completed || []).map(a => a.id));
    const cancelledIds = adminData.cancelledIds || [];

    // Merge all lists, deduplicate, filter by cedula or phone
    const seen = new Set();
    const all  = [
      ...(store.appointments || []),
      ...(store.active       || []),
      ...(store.completed    || []),
    ].filter(a => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      if (cedula) return (a.cedula || "").replace(/\D/g, "") === cedula;
      return (a.phone || "").replace(/\D/g, "") === phone;
    });

    const appointments = all.map(a => {
      let computedStatus = "scheduled";
      if (cancelledIds.includes(a.id))    computedStatus = "cancelled";
      else if (completedSet.has(a.id))    computedStatus = "completed";
      else if (activeSet.has(a.id)) {
        const live = store.active.find(x => x.id === a.id);
        computedStatus = live?.status || "waiting";
      }
      return { ...a, computedStatus };
    });

    // CRM data is keyed by cedula (primary). Fall back to phone for legacy records.
    const phoneKey  = ((all.find(a => a.phone) || {}).phone || "").replace(/\D/g, "");
    const crmKey    = cedula || phone;
    const clientCrm = crmStore[crmKey] || crmStore[phoneKey] || {};
    const loyalty   = adminData.loyalty?.enabled
      ? {
          enabled:  true,
          target:   adminData.loyalty.target  || 10,
          reward:   adminData.loyalty.reward  || "Corte gratis",
          visits:   clientCrm.loyaltyVisits   || 0,
          redeemed: clientCrm.loyaltyRedeemed || 0,
        }
      : null;

    // Self-service policy + salon contact for the client UI
    const selfService = {
      allowCancel:    adminData.selfService?.allowCancel !== false,
      minHoursBefore: Number(adminData.selfService?.minHoursBefore ?? 2),
    };
    const waNumber = (adminData.whatsappAdminNumber || "").replace(/\D/g, "");

    return res.status(200).json({ appointments, loyalty, selfService, waNumber });
  } catch (err) {
    console.error("[client]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
