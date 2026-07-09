import { initTables, kvGet, kvGetWithMeta, kvCas, applyCors, clientIp, rateLimit, sanitizeStr } from "./db.js";
import webpush from "web-push";

const MAX_APPOINTMENTS = 5000; // hard cap to bound storage / abuse
const CAS_RETRIES = 6;         // retries for the optimistic append under contention
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

async function sendPushNotifications(appt) {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  webpush.setVapidDetails(
    VAPID_SUBJECT ?? "mailto:admin@joxe.co",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  const subs = await kvGet("push_subscriptions") ?? [];
  if (!subs.length) return;

  // Notifica solo a los dispositivos del estilista asignado a la cita
  const admin = await kvGet("admin_store");
  const targetId = (admin?.employees || []).find(e => e.name === appt.stylist)?.id ?? null;
  const targets = subs.filter(s =>
    (targetId && s.empId && s.empId === targetId) ||
    (s.stylist && appt.stylist && s.stylist === appt.stylist)
  );
  if (!targets.length) return;

  const payload = JSON.stringify({
    title: "Nuevo turno reservado",
    body: `${appt.name ?? "Cliente"} · ${appt.service ?? ""} · ${appt.date ?? ""} ${appt.time ?? ""}`,
  });
  await Promise.allSettled(targets.map(sub => webpush.sendNotification(sub, payload)));
}

function validateAppt(raw) {
  if (!raw || typeof raw !== "object") return { error: "Invalid body" };
  if (!ID_RE.test(String(raw.id ?? ""))) return { error: "Invalid id" };
  if (!DATE_RE.test(String(raw.date ?? ""))) return { error: "Invalid date" };
  if (!TIME_RE.test(String(raw.time ?? ""))) return { error: "Invalid time" };

  const dur = Number(raw.serviceDur);
  if (!Number.isFinite(dur) || dur < 0 || dur > 600) return { error: "Invalid serviceDur" };

  // Whitelist fields. Sanitize free-text. Cap lengths.
  const appt = {
    id: String(raw.id),
    code: sanitizeStr(raw.code, 32),
    service: sanitizeStr(raw.service, 80),
    serviceDur: dur,
    stylist: sanitizeStr(raw.stylist, 80),
    date: String(raw.date),
    time: String(raw.time),
    name: sanitizeStr(raw.name, 120),
    phone: String(raw.phone ?? "").replace(/\D/g, "").slice(0, 20),
    cedula: String(raw.cedula ?? "").replace(/\D/g, "").slice(0, 20),
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now(),
    status: ["pending", "scheduled", "confirmed"].includes(raw.status) ? raw.status : "pending",
  };
  return { appt };
}

export default async function handler(req, res) {
  applyCors(req, res, "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await initTables();

    // Rate-limit: 10 bookings / 5 min per IP
    const ip = clientIp(req);
    const rl = await rateLimit(`book:${ip}`, 10, 5 * 60 * 1000);
    if (!rl.ok) {
      res.setHeader("Retry-After", String(rl.retryAfter));
      return res.status(429).json({ error: "Too many requests" });
    }

    const v = validateAppt(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const appt = v.appt;

    const store = await kvGet("turno_store") ?? { appointments: [], active: [], completed: [], blockedSlots: [] };

    if (store.appointments.length >= MAX_APPOINTMENTS) {
      return res.status(507).json({ error: "Storage limit reached" });
    }

    // Idempotent: ignore if already exists
    if (store.appointments.some(a => a.id === appt.id)) {
      return res.status(200).json({ ok: true });
    }

    await kvSet("turno_store", {
      ...store,
      appointments: [...store.appointments, appt],
    });

    sendPushNotifications(appt).catch(() => {});

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[book]", err.message);
    return res.status(500).json({ error: "Internal error" });
  }
}
