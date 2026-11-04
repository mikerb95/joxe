import {
  initTables, kvGet, kvGetWithMeta, kvCas, signEmpToken, safeEqual,
  clientIp, failureGate, recordFailure,
} from "../lib/db.js";

// Límite de PINs fallidos. Un PIN de 4 dígitos son 10.000 combinaciones y los
// ids de empleado son públicos (/api/catalog): sin esto se adivina en minutos.
// Por IP, y por empleado para frenar a quien reparta los intentos entre IPs.
// Solo cuentan los fallos: quien escribe bien su PIN nunca se topa con esto.
const pinLimits = (req, empId) => [
  { key: `pin:${clientIp(req)}`, max: 10, windowMs: 15 * 60 * 1000 },
  { key: `pin-emp:${String(empId).slice(0, 40)}`, max: 20, windowMs: 15 * 60 * 1000 },
];

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

    const limits = pinLimits(req, empId);
    const gate = await failureGate(limits);
    if (!gate.ok) {
      res.setHeader("Retry-After", String(gate.retryAfter));
      return res.status(429).json({ error: "Demasiados intentos. Espera unos minutos e intenta de nuevo." });
    }

    const admin = await kvGet("admin_store");
    const employees = admin?.employees || [];
    const emp = employees.find(e => e.id === empId && e.active !== false);

    if (!emp || !safeEqual(String(emp.pin ?? ""), String(pin))) {
      await recordFailure(limits);
      return res.status(401).json({ error: "PIN incorrecto" });
    }

    if (action === "login") {
      return res.status(200).json({
        ok: true,
        employee: { id: emp.id, name: emp.name, role: emp.role },
        token: signEmpToken(emp),
      });
    }

    if (action === "confirm") {
      if (!apptId) return res.status(400).json({ error: "apptId requerido" });
      // Compare-and-swap con reintentos: antes se escribía el store entero con
      // kvSet, y una reserva que entrara justo en ese momento se perdía.
      for (let attempt = 0; attempt < 5; attempt++) {
        const rec = await kvGetWithMeta("turno_store");
        const store = rec?.value;
        if (!store) return res.status(404).json({ error: "Store no encontrado" });

        const appt = (store.appointments || []).find(a => a.id === apptId);
        if (!appt) return res.status(404).json({ error: "Cita no encontrada" });
        if (appt.stylist !== emp.name) return res.status(403).json({ error: "Esta cita no te pertenece" });

        const next = {
          ...store,
          appointments: store.appointments.map(a =>
            a.id === apptId
              ? { ...a, status: "scheduled", confirmedAt: Date.now(), confirmedBy: emp.name }
              : a
          ),
        };
        if (await kvCas("turno_store", next, rec.updatedAt)) return res.status(200).json({ ok: true });
      }
      return res.status(409).json({ error: "Alta concurrencia, reintenta" });
    }

    if (action === "summary") {
      const store = await kvGet("turno_store");
      const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }))
        .toISOString().slice(0, 10);

      const slim = a => ({
        id: a.id, name: a.name, service: a.service, serviceDur: a.serviceDur,
        time: a.time, date: a.date, phone: a.phone, status: a.status,
        confirmedAt: a.confirmedAt, completedAt: a.completedAt,
      });

      // Las cancelaciones viven en admin_store.cancelledIds (no en appt.status),
      // por eso hay que filtrarlas aparte para que no ensucien el resumen.
      const cancelledIds = new Set(admin?.cancelledIds || []);
      const mine = a =>
        a.stylist === emp.name && a.date === today &&
        !cancelledIds.has(a.id) && a.status !== "cancelled";

      const myAppts = (store?.appointments || []).filter(mine).map(slim);

      const activeToday = (store?.active || []).filter(mine).map(slim);

      const completedToday = (store?.completed || []).filter(mine).map(slim);

      const revenueToday = (admin?.revenue || []).filter(
        r => !r.deleted && r.stylist === emp.name && r.date === today
      );
      const totalHoy = revenueToday.reduce((sum, r) => sum + (r.amount || 0), 0);

      return res.status(200).json({
        ok: true,
        today,
        pending: myAppts.filter(a => a.status === "pending"),
        scheduled: myAppts.filter(a => a.status === "scheduled" || a.status === "confirmed"),
        active: activeToday,
        completed: completedToday,
        totalHoy,
        revenueEntries: revenueToday.map(r => ({
          service: r.service, amount: r.amount, method: r.method, client: r.client,
        })),
        workHours: emp.workHours || null,
        cancelledIds: [...cancelledIds],
      });
    }

    return res.status(400).json({ error: "Acción desconocida" });
  } catch (err) {
    console.error("[agenda]", err.message);
    return res.status(err.status || 500).json({ error: err.status ? err.message : "Internal error" });
  }
}
