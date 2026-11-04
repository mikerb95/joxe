import {
  initTables, kvGetCached, applyCors, clientIp, rateLimit, sanitizeStr,
  cleanName, nameError, normPhone, phoneError, verifyStaffAuth, verifyAdminAuth,
} from "../db.js";
import {
  STATUSES, ANY_STYLIST, todayBogota, addDaysStr, phoneDigits,
  loadWaitlist, mutateWaitlist, newEntry,
} from "../waitlist.js";
import { notifyStaff } from "../notify.js";

// Lista de espera (ver lib/waitlist.js).
//
//   POST /api/waitlist                 -> el cliente se anota (público, con límite)
//   GET  /api/waitlist?action=all      -> la lista para el panel (staff; el
//                                         empleado solo ve lo suyo y lo de
//                                         "Sin preferencia")
//   POST /api/waitlist?action=op       -> { id, op } mover o borrar (admin)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Hasta dónde se puede pedir turno. La reserva muestra tres semanas; aquí se
// da algo más de margen sin aceptar fechas absurdas.
const MAX_DAYS_AHEAD = 60;

const fail = (status, error) => Object.assign(new Error(error), { status });

export default async function handler(req, res) {
  applyCors(req, res, "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    await initTables();

    if (req.method === "GET") {
      if (req.query.action !== "all") return res.status(400).json({ error: "Acción desconocida" });
      const staff = await verifyStaffAuth(req);
      if (!staff) return res.status(401).json({ error: "Unauthorized" });
      let { entries } = await loadWaitlist();
      if (staff.role === "employee") {
        const admin = await kvGetCached("admin_store", 30000);
        const me = (admin?.employees || []).find(e => e.id === staff.empId)?.name;
        entries = entries.filter(e => e.stylist === ANY_STYLIST || (me && e.stylist === me));
      }
      return res.status(200).json({ entries, today: todayBogota() });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // ---------------- POST: mover o borrar (admin) ----------------
    if (req.query.action === "op") {
      if (!(await verifyAdminAuth(req))) return res.status(401).json({ error: "Unauthorized" });
      const { id, op } = req.body ?? {};
      if (!id || !(op === "delete" || STATUSES.includes(op))) {
        return res.status(400).json({ error: "Operación inválida" });
      }
      const result = await mutateWaitlist(current => {
        const idx = current.entries.findIndex(e => e.id === id);
        if (idx === -1) throw fail(404, "No está en la lista");
        const entries = [...current.entries];
        if (op === "delete") entries.splice(idx, 1);
        else entries[idx] = { ...entries[idx], status: op, updatedAt: Date.now() };
        return { next: { entries }, result: { ok: true } };
      });
      return res.status(200).json(result);
    }

    // ---------------- POST: el cliente se anota ----------------
    const ip = clientIp(req);
    const rl = await rateLimit(`waitlist:${ip}`, 5, 10 * 60 * 1000);
    if (!rl.ok) {
      res.setHeader("Retry-After", String(rl.retryAfter));
      return res.status(429).json({ error: "Demasiados intentos, prueba en unos minutos." });
    }

    const body = req.body ?? {};
    const nameErr = nameError(body.name, { min: 3, max: 120 });
    if (nameErr) return res.status(400).json({ error: nameErr });
    const phoneErr = phoneError(body.phone);
    if (phoneErr) return res.status(400).json({ error: phoneErr });

    const date = String(body.date ?? "");
    const today = todayBogota();
    if (!DATE_RE.test(date) || date < today || date > addDaysStr(today, MAX_DAYS_AHEAD)) {
      return res.status(400).json({ error: "Elige un día de las próximas semanas." });
    }

    // Servicio y estilista se comparan con el catálogo: lo que no exista se
    // guarda como "cualquiera" en vez de rechazar al cliente.
    const admin = await kvGetCached("admin_store", 30000);
    const svcName = sanitizeStr(body.service, 80)?.trim() || "";
    const services = admin?.services || [];
    const service = !services.length || services.some(s => s.active && s.name === svcName) ? svcName : "";
    const stylistIn = sanitizeStr(body.stylist, 80)?.trim() || "";
    const stylist = (admin?.employees || []).some(e => e.active !== false && e.name === stylistIn)
      ? stylistIn : ANY_STYLIST;

    const entry = newEntry({
      name: cleanName(body.name, 120),
      phone: normPhone(body.phone),
      date, service, stylist,
    });

    const result = await mutateWaitlist(current => {
      // Mismo celular y mismo día, aún esperando: se actualiza, no se duplica.
      const dup = current.entries.findIndex(e =>
        e.status === "waiting" && e.date === date && phoneDigits(e.phone) === phoneDigits(entry.phone)
      );
      if (dup !== -1) {
        const entries = [...current.entries];
        entries[dup] = { ...entries[dup], name: entry.name, service, stylist };
        return { next: { entries }, result: { ok: true, already: true } };
      }
      return { next: { entries: [...current.entries, entry] }, result: { ok: true } };
    });

    if (!result.already) {
      await notifyStaff({
        stylist: stylist === ANY_STYLIST ? null : stylist,
        toAdmin: true,
        title: "Nueva persona en lista de espera",
        ntfyTitle: "Lista de espera",
        tags: "hourglass",
        body: [entry.name, date, service || null, stylist].filter(Boolean).join(" · "),
      });
    }
    return res.status(200).json(result);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error("[waitlist]", err.message);
    return res.status(status).json({ error: status === 500 ? "Internal error" : err.message });
  }
}
