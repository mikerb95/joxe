import { initTables, kvGet, kvSet, verifyStaffAuth } from "./db.js";
import webpush from "web-push";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

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
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  await initTables();

  // GET ?list=mine|all -> listado de dispositivos (requiere staff); sin params -> VAPID public key (publico)
  if (req.method === "GET") {
    const list = req.query?.list;
    if (!list) {
      return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null });
    }
    const who = await verifyStaffAuth(req);
    if (!who) return res.status(401).json({ error: "Unauthorized" });
    const all = await kvGet("push_subscriptions") ?? [];

    if (list === "all") {
      if (who.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const devices = all.map(s => ({
        endpoint: s.endpoint, label: s.label ?? null, createdAt: s.createdAt ?? null,
        empId: s.empId ?? null, stylist: s.stylist ?? null,
      }));
      return res.status(200).json({ devices });
    }

    // list === "mine": empleado -> sus dispositivos; admin -> dispositivos sin empId
    const mine = all.filter(s => who.role === "employee" ? s.empId === who.empId : !s.empId);
    const devices = mine.map(s => ({ endpoint: s.endpoint, label: s.label ?? null, createdAt: s.createdAt ?? null }));
    return res.status(200).json({ devices });
  }

  const staff = await verifyStaffAuth(req);
  if (!staff) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "POST") {
    const { subscription, label } = req.body ?? {};
    if (!subscription?.endpoint) return res.status(400).json({ error: "Invalid subscription" });

    // Ata la suscripción al empleado dueño del token, para notificar solo al estilista asignado
    let empId = null, stylist = null;
    if (staff.role === "employee") {
      empId = staff.empId;
      const admin = await kvGet("admin_store");
      stylist = (admin?.employees || []).find(e => e.id === empId)?.name ?? null;
    }
    const record = {
      ...subscription, empId, stylist,
      label: String(label ?? "").slice(0, 120) || null,
      createdAt: Date.now(),
    };

    const subs = await kvGet("push_subscriptions") ?? [];
    const deduped = subs.filter(s => s.endpoint !== subscription.endpoint);
    await kvSet("push_subscriptions", [...deduped, record]);
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { endpoint } = req.body ?? {};
    if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });
    const subs = await kvGet("push_subscriptions") ?? [];
    // Un empleado solo puede quitar sus propios dispositivos; el admin puede quitar cualquiera
    const kept = subs.filter(s =>
      s.endpoint !== endpoint || (staff.role === "employee" && s.empId !== staff.empId)
    );
    await kvSet("push_subscriptions", kept);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
