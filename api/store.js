import { initTables, kvGet, kvSet } from "./db.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const DEFAULT = () => ({ appointments: [], active: [], completed: [], blockedSlots: [] });

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    await initTables();

    if (req.method === "GET") {
      const stored = await kvGet("turno_store");
      return res.status(200).json({ ...DEFAULT(), ...(stored || {}) });
    }

    if (req.method === "POST") {
      await kvSet("turno_store", req.body);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[store]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
