import { initTables, kvGet, kvSet, verifyAdminAuth } from "./db.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DEFAULT_ADMIN = () => ({
  salonName: "JOXE",
  stylists: ["Joxe", "Laura M.", "Camila R."],
  cancelledIds: [],
  services: [
    { id: "s1", name: "Corte mujer",        price: 85000,  dur: 60,  active: true },
    { id: "s2", name: "Corte hombre",       price: 45000,  dur: 40,  active: true },
    { id: "s3", name: "Balayage",           price: 280000, dur: 180, active: true, note: "desde" },
    { id: "s4", name: "Color correction",   price: 320000, dur: 240, active: true, note: "desde" },
    { id: "s5", name: "Color raíz",         price: 120000, dur: 90,  active: true },
    { id: "s6", name: "Keratina",           price: 260000, dur: 180, active: true, note: "desde" },
    { id: "s7", name: "Asesoría de imagen", price: 180000, dur: 90,  active: true },
    { id: "s8", name: "Peinado novia",      price: 220000, dur: 120, active: true, note: "desde" },
  ],
  revenue: [],
  archivedEmployees: [],
});

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    await initTables();

    if (req.method === "GET") {
      if (!(await validateAuth(req))) return res.status(401).json({ error: "Unauthorized" });
      const stored = await kvGet("admin_store");
      const data   = { ...DEFAULT_ADMIN(), ...(stored || {}) };
      // Never expose the stored password over the wire
      const { password: _pw, ...safe } = data;
      return res.status(200).json(safe);
    }

    if (req.method === "POST") {
      if (!(await validateAuth(req))) return res.status(401).json({ error: "Unauthorized" });
      const body = req.body;
      if (body.revenue !== undefined && !Array.isArray(body.revenue))
        return res.status(400).json({ error: "revenue must be an array" });
      if (body.services !== undefined && !Array.isArray(body.services))
        return res.status(400).json({ error: "services must be an array" });
      if (body.employees !== undefined && !Array.isArray(body.employees))
        return res.status(400).json({ error: "employees must be an array" });
      if (body.archivedEmployees !== undefined && !Array.isArray(body.archivedEmployees))
        return res.status(400).json({ error: "archivedEmployees must be an array" });
      await kvSet("admin_store", body);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[admin]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
