import { initTables, kvGet, kvSet, verifyStaffAuth, applyCors } from "../db.js";

const DAY_KEYS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];
const TIME_RE = /^\d{2}:\d{2}$/;

function timeToMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Empleado edita su propio horario desde /staff — sin tocar el resto de
// admin_store (servicios, ingresos, otros empleados, etc.), a diferencia del
// endpoint /api/admin que sobreescribe todo el store y requiere admin.
function validateWorkHours(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const key of DAY_KEYS) {
    const d = raw[key];
    if (!d || typeof d !== "object") return null;
    if (typeof d.active !== "boolean") return null;
    if (!TIME_RE.test(String(d.start ?? "")) || !TIME_RE.test(String(d.end ?? ""))) return null;
    if (d.active && timeToMin(d.start) >= timeToMin(d.end)) return null;
    out[key] = { active: d.active, start: d.start, end: d.end };
  }
  return out;
}

export default async function handler(req, res) {
  applyCors(req, res, "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await initTables();

    const staff = await verifyStaffAuth(req);
    if (!staff || staff.role !== "employee") return res.status(401).json({ error: "Unauthorized" });

    const workHours = validateWorkHours(req.body?.workHours);
    if (!workHours) return res.status(400).json({ error: "Invalid workHours" });

    const admin = await kvGet("admin_store");
    const employees = admin?.employees || [];
    const idx = employees.findIndex(e => e.id === staff.empId);
    if (idx === -1) return res.status(404).json({ error: "Employee not found" });

    const nextEmployees = employees.map((e, i) => i === idx ? { ...e, workHours } : e);
    await kvSet("admin_store", { ...admin, employees: nextEmployees });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[work-hours]", err.message);
    return res.status(500).json({ error: "Internal error" });
  }
}
