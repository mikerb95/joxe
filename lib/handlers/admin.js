import { initTables, kvGet, kvSet, verifyAdminAuth, getAdminPassword, safeEqual } from "../db.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DEFAULT_ADMIN = () => ({
  salonName: "JOXE",
  stylists: ["Joxe", "Camila R."],
  cancelledIds: [],
  services: [
    { id: "s2",   name: "Corte hombre (con mascarilla puntos negros + cejas)", price: 22000, dur: 60,  active: true, dayPrices: { mar: 16000 } },
    { id: "s9",   name: "Corte hombre con barba",                              price: 27000, dur: 60,  active: true, dayPrices: { mar: 20000 } },
    { id: "s1",   name: "Corte dama",                                          price: 20000, dur: 60,  active: true },
    { id: "s12",  name: "Cepillado dama",                                      price: 20000, dur: 60,  active: true, note: "desde" },
    { id: "s13",  name: "Tinturas",                                            price: 0,     dur: 60,  active: true, quote: true },
    { id: "s6",   name: "Keratina alisado permanente dama",                    price: 100000, dur: 240, active: true, note: "desde" },
    { id: "s14",  name: "Keratina alisado permanente hombre (+ corte gratis)", price: 90000, dur: 240, active: true },
    { id: "s15",  name: "Ondulado permanente hombre (+ corte gratis)",         price: 130000, dur: 120, active: true },
    { id: "s16",  name: "Depilación de cejas con cera",                        price: 10000, dur: 60,  active: true },
    { id: "s17",  name: "Depilación de cejas con cuchilla",                    price: 5000,  dur: 60,  active: true },
    { id: "s18",  name: "Limpieza facial",                                     price: 45000, dur: 60,  active: true },
    { id: "s19",  name: "Corte + limpieza facial",                             price: 55000, dur: 60,  active: true },
    { id: "s7",   name: "Asesoría de imagen",                                  price: 0,     dur: 60,  active: true },
  ],
  revenue: [],
  archivedEmployees: [],
});

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    await initTables();

    if (req.method === "POST" && req.query.action === "auth") {
      const { password } = req.body ?? {};
      if (!password) return res.status(400).json({ error: "Missing password" });
      const stored = await getAdminPassword();
      if (!stored) {
        console.error("[admin/auth] No admin password configured (set ADMIN_PASSWORD env or admin_store.password)");
        return res.status(503).json({ error: "Auth not configured" });
      }
      return res.status(200).json({ ok: safeEqual(password, stored) });
    }

    if (req.method === "GET") {
      if (!(await verifyAdminAuth(req))) return res.status(401).json({ error: "Unauthorized" });
      const stored = await kvGet("admin_store");
      const data   = { ...DEFAULT_ADMIN(), ...(stored || {}) };
      // Never expose the stored password over the wire
      const { password: _pw, ...safe } = data;
      return res.status(200).json(safe);
    }

    if (req.method === "POST") {
      if (!(await verifyAdminAuth(req))) return res.status(401).json({ error: "Unauthorized" });
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
