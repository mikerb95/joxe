import { initTables, kvGet, kvGetWithMeta, kvCas, applyCors, clientIp, rateLimit, sanitizeStr } from "../lib/db.js";
// kvGet: reads admin_store (catalog); kvGetWithMeta + kvCas: optimistic append.
import { blocksFromStore, blockConflict } from "../lib/blocks.js";
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

async function publishNtfy(topic, appt) {
  await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
    method: "POST",
    headers: {
      Title: "Nuevo turno reservado",
      Tags: "calendar",
    },
    body: `${appt.name ?? "Cliente"} · ${appt.service ?? ""} · ${appt.stylist ?? ""} · ${appt.date ?? ""} ${appt.time ?? ""}`,
  });
}

// Notifica al admin (canal general) vía ntfy.sh, y al tópico propio del
// estilista asignado si tiene uno configurado — así cada empleado solo
// recibe avisos de sus propias citas.
async function sendNtfyNotification(appt) {
  const adminTopic = process.env.NTFY_TOPIC;
  const admin = await kvGet("admin_store");
  const empTopic = (admin?.employees || []).find(e => e.name === appt.stylist)?.ntfyTopic || null;

  const topics = new Set([adminTopic, empTopic].filter(Boolean));
  await Promise.allSettled([...topics].map(t => publishNtfy(t, appt)));
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

function timeToMin(t) {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + m;
}

// Server-side occupancy check — the authoritative guard against double-booking.
// Mirrors the essential rule the client enforces: no two live appointments for
// the same stylist may overlap, and admin-blocked ranges are unavailable.
// Business-hours / closed-day / past-time checks stay client-side (UX hints);
// the invariant that actually protects data integrity is the overlap rule.
function slotConflict(appointments, blocks, appt, stylistId) {
  if (blockConflict(blocks, appt, stylistId)) return true;

  const newStart = timeToMin(appt.time);
  const newEnd = newStart + appt.serviceDur + (Number(appt.bufferAfter) || 0);

  return (appointments || []).some(a => {
    if (a.date !== appt.date) return false;
    if (a.stylist !== appt.stylist) return false;
    if (a.status === "cancelled") return false;
    const aStart = timeToMin(a.time);
    const aEnd = aStart + (Number(a.serviceDur) || 60) + (Number(a.bufferAfter) || 0);
    return aStart < newEnd && newStart < aEnd; // interval overlap
  });
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

    // Cross-check stylist + service duration against the source of truth
    // (admin_store), so a stale or tampered client can't book a non-existent
    // stylist or send a duration that corrupts later overlap math.
    const admin = await kvGet("admin_store");
    const employees = admin?.employees || [];
    let stylistId = null;
    if (employees.length) {
      const emp = employees.find(e => e.name === appt.stylist && e.active !== false);
      if (!emp) return res.status(400).json({ error: "Invalid stylist" });
      stylistId = emp.id;
    }
    const svc = (admin?.services || []).find(
      s => s.active && s.name === appt.service
    );
    if (svc && Number.isFinite(Number(svc.dur))) {
      appt.serviceDur = Number(svc.dur); // authoritative duration wins
    }

    // Optimistic append: read the store with its version stamp, re-validate the
    // slot, then compare-and-swap. If another booking landed first, retry on the
    // fresh state so we never blindly overwrite (lost write) or double-book.
    for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
      const rec = await kvGetWithMeta("turno_store");
      const store = rec?.value ?? { appointments: [], active: [], completed: [], blockedSlots: [], blockRanges: [] };
      const appointments = Array.isArray(store.appointments) ? store.appointments : [];

      // Idempotent: already stored → treat as success
      if (appointments.some(a => a.id === appt.id)) {
        return res.status(200).json({ ok: true });
      }
      if (appointments.length >= MAX_APPOINTMENTS) {
        return res.status(507).json({ error: "Storage limit reached" });
      }
      if (slotConflict(appointments, blocksFromStore(store), appt, stylistId)) {
        return res.status(409).json({ error: "Slot no disponible" });
      }

      const next = { ...store, appointments: [...appointments, appt] };
      const written = await kvCas("turno_store", next, rec ? rec.updatedAt : null);
      if (written) {
        sendPushNotifications(appt).catch(() => {});
        sendNtfyNotification(appt).catch(() => {});
        return res.status(200).json({ ok: true });
      }
      // Lost the race — loop and re-read the fresh state.
    }

    return res.status(409).json({ error: "Alta concurrencia, reintenta" });
  } catch (err) {
    console.error("[book]", err.message);
    return res.status(500).json({ error: "Internal error" });
  }
}
