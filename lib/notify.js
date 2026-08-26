import webpush from "web-push";
import { kvGet } from "./db.js";

// Avisos al equipo: web push a los dispositivos registrados y ntfy.sh a los
// tópicos configurados. Lo usan las reservas (api/book.js) y las reseñas
// (api/reviews.js), que solo cambian el texto y a quién apuntan.

function vapidReady() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    VAPID_SUBJECT ?? "mailto:admin@joxe.co",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  return true;
}

// Los dispositivos del admin son los que no tienen empId (ver api/push.js).
async function sendPush({ title, body, stylist = null, toAdmin = false }) {
  if (!vapidReady()) return;
  const subs = await kvGet("push_subscriptions") ?? [];
  if (!subs.length) return;

  const admin = await kvGet("admin_store");
  const targetId = (admin?.employees || []).find(e => e.name === stylist)?.id ?? null;
  const targets = subs.filter(s =>
    (toAdmin && !s.empId) ||
    (targetId && s.empId && s.empId === targetId) ||
    (s.stylist && stylist && s.stylist === stylist)
  );
  if (!targets.length) return;

  const payload = JSON.stringify({ title, body });
  await Promise.allSettled(targets.map(sub => webpush.sendNotification(sub, payload)));
}

// ntfy.sh manda el título en una cabecera HTTP, que es ASCII: las tildes y la
// ñ llegarían rotas. El título va sin acentos y el texto completo en el cuerpo.
async function sendNtfy({ ntfyTitle, title, body, tags = "bell", stylist = null }) {
  const adminTopic = process.env.NTFY_TOPIC;
  const admin = await kvGet("admin_store");
  const empTopic = (admin?.employees || []).find(e => e.name === stylist)?.ntfyTopic || null;

  const topics = new Set([adminTopic, empTopic].filter(Boolean));
  if (!topics.size) return;

  await Promise.allSettled([...topics].map(topic =>
    fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers: { Title: ntfyTitle ?? title, Tags: tags },
      body,
    })
  ));
}

// Nunca revienta: un aviso perdido no puede tumbar la reserva o la reseña que
// ya se guardó. Los errores quedan en el log.
export async function notifyStaff(opts) {
  await Promise.allSettled([
    sendPush(opts).catch(e => console.error("[notify:push]", e.message)),
    sendNtfy(opts).catch(e => console.error("[notify:ntfy]", e.message)),
  ]);
}
