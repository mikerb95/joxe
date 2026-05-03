import { initTables, kvGet, kvSet } from "./db.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

async function validateAuth(req) {
  const auth  = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  const admin = await kvGet("admin_store");
  return token === (admin?.password ?? "joxe2026");
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    await initTables();

    if (!(await validateAuth(req))) return res.status(401).json({ error: "Unauthorized" });

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
