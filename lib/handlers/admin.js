import {
  initTables, kvGet, kvSet, verifyAdminAuth, checkAdminPassword, setAdminPassword,
  signAdminToken, clientIp, failureGate, recordFailure,
} from "../db.js";

// Límite de intentos fallidos de contraseña: por IP y, como respaldo, global
// (frena a quien reparta los intentos entre muchas IPs). Quien acierta nunca
// cuenta. Lo usan el login y el cambio de contraseña.
const loginLimits = (req) => [
  { key: `admin-login:${clientIp(req)}`, max: 10, windowMs: 15 * 60 * 1000 },
  { key: "admin-login:all", max: 100, windowMs: 60 * 60 * 1000 },
];

async function checkWithLimit(req, res, password) {
  const limits = loginLimits(req);
  const gate = await failureGate(limits);
  if (!gate.ok) {
    res.setHeader("Retry-After", String(gate.retryAfter));
    res.status(429).json({ ok: false, error: "Demasiados intentos. Espera unos minutos." });
    return null;
  }
  const r = await checkAdminPassword(String(password ?? ""));
  if (!r.configured) {
    console.error("[admin/auth] No admin password configured (set ADMIN_PASSWORD env)");
    res.status(503).json({ ok: false, error: "Auth not configured" });
    return null;
  }
  if (!r.ok) await recordFailure(limits);
  return r;
}

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

    // Login: devuelve un token de sesión. La contraseña ya no se usa como token.
    if (req.method === "POST" && req.query.action === "auth") {
      const { password } = req.body ?? {};
      if (!password) return res.status(400).json({ error: "Missing password" });
      const r = await checkWithLimit(req, res, password);
      if (!r) return;
      if (!r.ok) return res.status(200).json({ ok: false });
      return res.status(200).json({ ok: true, token: await signAdminToken() });
    }

    // Cambio de contraseña: pide sesión válida Y la contraseña actual. Guarda
    // el hash en admin_auth y devuelve un token nuevo (los viejos dejan de
    // valer porque la firma depende de la credencial).
    if (req.method === "POST" && req.query.action === "password") {
      if (!(await verifyAdminAuth(req))) return res.status(401).json({ error: "Unauthorized" });
      const { current, next } = req.body ?? {};
      if (typeof next !== "string" || next.length < 4 || next.length > 200) {
        return res.status(400).json({ ok: false, error: "La contraseña debe tener al menos 4 caracteres." });
      }
      const r = await checkWithLimit(req, res, current);
      if (!r) return;
      if (!r.ok) return res.status(200).json({ ok: false, error: "Contraseña actual incorrecta." });
      await setAdminPassword(next);
      return res.status(200).json({ ok: true, token: await signAdminToken() });
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
      if (!body || typeof body !== "object" || Array.isArray(body)) return res.status(400).json({ error: "Invalid body" });
      if (body.revenue !== undefined && !Array.isArray(body.revenue))
        return res.status(400).json({ error: "revenue must be an array" });
      if (body.services !== undefined && !Array.isArray(body.services))
        return res.status(400).json({ error: "services must be an array" });
      if (body.employees !== undefined && !Array.isArray(body.employees))
        return res.status(400).json({ error: "employees must be an array" });
      if (body.archivedEmployees !== undefined && !Array.isArray(body.archivedEmployees))
        return res.status(400).json({ error: "archivedEmployees must be an array" });
      if (body.themes !== undefined && (!body.themes || typeof body.themes !== "object" || Array.isArray(body.themes)))
        return res.status(400).json({ error: "themes must be an object" });
      // La contraseña nunca se guarda aquí (vive en admin_auth). Se descarta
      // la que mande el panel, y si quedaba una vieja en texto plano se borra
      // con este guardado, salvo que todavía sea la única credencial (nadie ha
      // entrado desde el cambio): entonces se conserva para no dejar a nadie
      // afuera.
      const { password: _ignored, ...clean } = body;
      const [authRec, prev] = await Promise.all([kvGet("admin_auth"), kvGet("admin_store")]);
      if (!authRec?.hash && prev?.password) clean.password = prev.password;
      await kvSet("admin_store", clean);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[admin]", err.message);
    return res.status(err.status || 500).json({ error: err.status ? err.message : "Internal error" });
  }
}
