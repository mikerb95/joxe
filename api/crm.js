import { initTables, kvGet, kvSet, verifyAdminAuth } from "./db.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    await initTables();

    if (!(await verifyAdminAuth(req))) return res.status(401).json({ error: "Unauthorized" });

    if (req.method === "GET") {
      const data = await kvGet("crm_store");
      return res.status(200).json(data || {});
    }

    if (req.method === "POST") {
      await kvSet("crm_store", req.body);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[crm]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
