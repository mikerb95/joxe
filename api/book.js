import { initTables, kvGet, kvSet } from "./db.js";
import webpush from "web-push";

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
  const payload = JSON.stringify({
    title: "Nuevo agendamiento",
    body: `${appt.name ?? "Cliente"} · ${appt.service ?? ""} · ${appt.date ?? ""} ${appt.time ?? ""}`,
  });
  await Promise.allSettled(subs.map(sub => webpush.sendNotification(sub, payload)));
}

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

    sendPushNotifications(appt).catch(() => {});

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[book]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
