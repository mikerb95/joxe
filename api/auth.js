import { initTables, getAdminPassword, safeEqual } from "../lib/db.js";

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
    const { password } = req.body ?? {};
    if (!password) return res.status(400).json({ error: "Missing password" });

    const stored = await getAdminPassword();
    if (!stored) {
      console.error("[auth] No admin password configured (set ADMIN_PASSWORD env or admin_store.password)");
      return res.status(503).json({ error: "Auth not configured" });
    }

    const ok = safeEqual(password, stored);
    return res.status(200).json({ ok });
  } catch (err) {
    console.error("[auth]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
