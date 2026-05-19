import { initTables, kvGet, kvSet } from "./db.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await initTables();

    const appt = req.body;
    if (!appt || typeof appt !== "object" || !appt.id || !appt.date) {
      return res.status(400).json({ error: "Invalid appointment" });
    }

    const store = await kvGet("turno_store") ?? { appointments: [], active: [], completed: [], blockedSlots: [] };

    // Idempotent: ignore if already exists
    if (store.appointments.some(a => a.id === appt.id)) {
      return res.status(200).json({ ok: true });
    }

    await kvSet("turno_store", {
      ...store,
      appointments: [...store.appointments, appt],
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[book]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
