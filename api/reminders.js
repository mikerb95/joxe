import { initTables, kvGet, kvSet } from "./db.js";
import webpush from "web-push";

// Avisa al estilista ~5 minutos antes de que empiece cada turno confirmado.
// Pensado para ejecutarse cada minuto vía Vercel Cron (ver "crons" en vercel.json).
const REMINDER_WINDOW_MIN = 5;   // dispara cuando faltan entre 0 y 5 min (tolerante a runs atrasados)
const COT_OFFSET = "-05:00";     // Colombia = UTC-5 fijo (sin horario de verano)
const REMINDED_TTL_MS = 2 * 60 * 60 * 1000;

function configureWebPush() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    VAPID_SUBJECT ?? "mailto:admin@joxe.co",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  return true;
}

export default async function handler(req, res) {
  // Si hay CRON_SECRET configurado, exige el header que envía Vercel Cron (o un cron externo)
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await initTables();
    if (!configureWebPush()) {
      return res.status(200).json({ ok: true, skipped: "VAPID not configured" });
    }

    const store     = await kvGet("turno_store") || { appointments: [], active: [], completed: [] };
    const adminData = await kvGet("admin_store")  || {};
    const subs      = await kvGet("push_subscriptions") || [];
    if (!subs.length) return res.status(200).json({ ok: true, sent: 0 });

    const cancelledIds = new Set(adminData.cancelledIds || []);
    const noShowIds    = new Set(adminData.noShowIds || []);
    const completedSet = new Set((store.completed || []).map(a => a.id));
    const employees    = adminData.employees || [];

    // Dedupe: turnos ya avisados (con timestamp para poder podar los viejos)
    let reminded = await kvGet("reminded_appts") || [];
    const remindedSet = new Set(reminded.map(r => r.id));

    const now = Date.now();
    const sentIds = [];
    const tasks = [];

    for (const a of (store.appointments || [])) {
      if (remindedSet.has(a.id)) continue;
      if (cancelledIds.has(a.id) || noShowIds.has(a.id) || completedSet.has(a.id)) continue;
      // Solo turnos confirmados/agendados (no "pending" sin confirmar)
      if (!(["scheduled", "confirmed"].includes(a.status) || a.confirmedBy)) continue;
      if (!a.date || !a.time) continue;

      const startMs = new Date(`${a.date}T${a.time}:00${COT_OFFSET}`).getTime();
      if (Number.isNaN(startMs)) continue;
      const mins = (startMs - now) / 60000;
      if (mins < 0 || mins > REMINDER_WINDOW_MIN) continue;

      // Notifica solo a los dispositivos del estilista asignado
      const targetId = employees.find(e => e.name === a.stylist)?.id ?? null;
      const targets = subs.filter(s =>
        (targetId && s.empId && s.empId === targetId) ||
        (s.stylist && a.stylist && s.stylist === a.stylist)
      );

      // Marca como avisado aunque no haya dispositivos, para no reevaluarlo cada minuto
      sentIds.push(a.id);
      if (!targets.length) continue;

      const payload = JSON.stringify({
        title: "Turno en 5 minutos",
        body: `${a.name ?? "Cliente"} · ${a.service ?? ""} · ${a.time}`,
      });
      for (const sub of targets) {
        tasks.push(webpush.sendNotification(sub, payload).catch(() => {}));
      }
    }

    await Promise.allSettled(tasks);

    if (sentIds.length) {
      const cutoff = now - REMINDED_TTL_MS;
      reminded = [
        ...reminded.filter(r => r.ts > cutoff),
        ...sentIds.map(id => ({ id, ts: now })),
      ];
      await kvSet("reminded_appts", reminded);
    }

    return res.status(200).json({ ok: true, sent: sentIds.length });
  } catch (err) {
    console.error("[reminders]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
