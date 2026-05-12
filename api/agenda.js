import { initTables, kvGet, kvSet } from "./db.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// POST { action: "login", empId, pin }  → { ok, employee }
// POST { action: "confirm", empId, pin, apptId }  → { ok }
export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await initTables();
    const { action, empId, pin, apptId } = req.body || {};

    if (!empId || !pin) return res.status(400).json({ error: "empId y pin requeridos" });

    const admin = await kvGet("admin_store");
    const employees = admin?.employees || [];
    const emp = employees.find(e => e.id === empId && e.active !== false);

    if (!emp || emp.pin !== String(pin)) {
      return res.status(401).json({ error: "PIN incorrecto" });
    }

    if (action === "login") {
      return res.status(200).json({
        ok: true,
        employee: { id: emp.id, name: emp.name, role: emp.role },
      });
    }

    if (action === "confirm") {
      if (!apptId) return res.status(400).json({ error: "apptId requerido" });
      const store = await kvGet("turno_store");
      if (!store) return res.status(404).json({ error: "Store no encontrado" });

      const appt = (store.appointments || []).find(a => a.id === apptId);
      if (!appt) return res.status(404).json({ error: "Cita no encontrada" });
      if (appt.stylist !== emp.name) return res.status(403).json({ error: "Esta cita no te pertenece" });

      store.appointments = store.appointments.map(a =>
        a.id === apptId
          ? { ...a, status: "scheduled", confirmedAt: Date.now(), confirmedBy: emp.name }
          : a
      );
      await kvSet("turno_store", store);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Acción desconocida" });
  } catch (err) {
    console.error("[agenda]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
