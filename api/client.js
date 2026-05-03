import { initTables, kvGet } from "./db.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    await initTables();

    const phone = (req.query.phone || "").replace(/\D/g, "");
    if (!phone) return res.status(400).json({ error: "Missing phone" });

    const store     = await kvGet("turno_store") || { appointments: [], active: [], completed: [], blockedSlots: [] };
    const adminData = await kvGet("admin_store")  || {};
    const crmStore  = await kvGet("crm_store")    || {};

    const activeSet    = new Set((store.active    || []).map(a => a.id));
    const completedSet = new Set((store.completed || []).map(a => a.id));
    const cancelledIds = adminData.cancelledIds || [];

    // Merge all lists, deduplicate, filter by phone
    const seen = new Set();
    const all  = [
      ...(store.appointments || []),
      ...(store.active       || []),
      ...(store.completed    || []),
    ].filter(a => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
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

    const clientCrm = crmStore[phone] || {};
    const loyalty   = adminData.loyalty?.enabled
      ? {
          enabled:  true,
          target:   adminData.loyalty.target  || 10,
          reward:   adminData.loyalty.reward  || "Corte gratis",
          visits:   clientCrm.loyaltyVisits   || 0,
          redeemed: clientCrm.loyaltyRedeemed || 0,
        }
      : null;

    return res.status(200).json({ appointments, loyalty });
  } catch (err) {
    console.error("[client]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
