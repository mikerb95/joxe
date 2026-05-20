import { initTables, kvGet, kvSet, verifyAdminAuth } from "./db.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    await initTables();

    if (!(await validateAuth(req))) return res.status(401).json({ error: "Unauthorized" });

    const store = await kvGet("turno_store") ?? { appointments: [], active: [], completed: [], blockedSlots: [] };

    if (req.method === "GET") {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "Missing id" });

      const appt =
        store.appointments?.find(a => a.id === id) ||
        store.active?.find(a => a.id === id) ||
        store.completed?.find(a => a.id === id);

      if (!appt) return res.status(404).json({ error: "Appointment not found" });

      const adminStore = await kvGet("admin_store") ?? {};
      const cancelled = (adminStore.cancelledIds || []).includes(id);
      return res.status(200).json({ ...appt, cancelled });
    }

    if (req.method === "POST") {
      const { id, action } = req.body ?? {};
      if (!id || !action) return res.status(400).json({ error: "Missing id or action" });

      const adminStore = await kvGet("admin_store") ?? {};

      if (action === "confirm") {
        const patch = (arr) =>
          (arr || []).map(a =>
            a.id === id ? { ...a, paymentConfirmed: true, paymentConfirmedAt: Date.now() } : a
          );
        await kvSet("turno_store", {
          ...store,
          appointments: patch(store.appointments),
          active: patch(store.active),
          completed: patch(store.completed),
        });
        return res.status(200).json({ ok: true });
      }

      if (action === "cancel") {
        const cancelledIds = [...new Set([...(adminStore.cancelledIds || []), id])];
        await kvSet("admin_store", { ...adminStore, cancelledIds });
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: "Invalid action" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[payment]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
