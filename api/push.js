import { initTables, kvGet, kvSet, verifyAdminAuth } from "./db.js";
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

  // Public: browser needs the VAPID public key to create a subscription
  if (req.method === "GET") {
    return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null });
  }

  const authed = await verifyAdminAuth(req);
  if (!authed) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "POST") {
    const { subscription } = req.body ?? {};
    if (!subscription?.endpoint) return res.status(400).json({ error: "Invalid subscription" });
    const subs = await kvGet("push_subscriptions") ?? [];
    const deduped = subs.filter(s => s.endpoint !== subscription.endpoint);
    await kvSet("push_subscriptions", [...deduped, subscription]);
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { endpoint } = req.body ?? {};
    if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });
    const subs = await kvGet("push_subscriptions") ?? [];
    await kvSet("push_subscriptions", subs.filter(s => s.endpoint !== endpoint));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
