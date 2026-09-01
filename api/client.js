import {
  initTables, kvGet, kvGetCached, kvSet,
  applyCors, clientIp, rateLimit, signReviewToken, cleanName, sanitizeStr,
} from "../lib/db.js";

const COT_OFFSET = "-05:00"; // Colombia = UTC-5 fijo (sin horario de verano)

// Mi Cuenta no tiene contraseña: la cédula sola sería una llave demasiado
// débil (no es un dato secreto), así que se exige además los últimos 4 dígitos
// del celular con el que quedó registrada la cita.
const last4 = v => String(v ?? "").replace(/\D/g, "").slice(-4);

// Misma ventana que usa Mi Cuenta para ofrecer el botón de reseña.
const REVIEW_WINDOW_MS = 30 * 24 * 3600 * 1000;

// Momento de la cita: completedAt si el panel lo guardó, si no fecha + hora.
function apptTime(a) {
  const t = a?.completedAt
    ? new Date(a.completedAt).getTime()
    : new Date(`${a?.date || ""}T${a?.time || "00:00"}:00${COT_OFFSET}`).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function phoneMatches(appts, phone4) {
  return appts.some(a => {
    const d = last4(a.phone);
    return d.length === 4 && d === phone4;
  });
}

// Los intentos fallidos se cuentan aparte: así se puede frenar a quien pruebe
// combinaciones sin castigar al cliente que solo está consultando sus citas.
async function tooManyFailures(req, res) {
  const rl = await rateLimit(`client-auth:${clientIp(req)}`, 12, 15 * 60 * 1000);
  if (rl.ok) return false;
  res.setHeader("Retry-After", String(rl.retryAfter));
  res.status(429).json({ error: "Too many requests" });
  return true;
}

export default async function handler(req, res) {
  applyCors(req, res, "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    await initTables();

    // ---- Client self-service: cancelar cita / pedir link de reseña ----
    if (req.method === "POST") {
      const { id, cedula: rawCedula, phone4: rawPhone4, action } = req.body ?? {};
      if (!["cancel", "review-link", "review-lookup"].includes(action)) {
        return res.status(400).json({ error: "Invalid action" });
      }

      const ip = clientIp(req);
      const rl = await rateLimit(`client:${ip}`, 15, 5 * 60 * 1000);
      if (!rl.ok) {
        res.setHeader("Retry-After", String(rl.retryAfter));
        return res.status(429).json({ error: "Too many requests" });
      }

      const cedula = String(rawCedula ?? "").replace(/\D/g, "");
      // review-lookup es el único que no parte de una cita concreta: el cliente
      // llega a /resena sin link y solo trae su cédula.
      if (!cedula) return res.status(400).json({ error: "Missing cedula" });
      if (action !== "review-lookup" && !id) {
        return res.status(400).json({ error: "Missing id or cedula" });
      }

      const store     = await kvGet("turno_store") || { appointments: [], active: [], completed: [], blockedSlots: [] };
      const adminData = await kvGet("admin_store")  || {};

      const all = [...(store.appointments || []), ...(store.active || []), ...(store.completed || [])];

      // ---- Identificación por cédula para dejar reseña sin link ----
      // Misma llave que Mi Cuenta (cédula + últimos 4 del celular): la cédula
      // sola dejaría que cualquiera sacara nombres probando números.
      if (action === "review-lookup") {
        const mineAll = all.filter(a => (a.cedula || "").replace(/\D/g, "") === cedula);
        if (!phoneMatches(mineAll, last4(rawPhone4))) {
          if (await tooManyFailures(req, res)) return;
          return res.status(401).json({ error: "auth_failed" });
        }

        // El último nombre registrado: el de la cita más reciente que traiga uno.
        const byRecency = [...mineAll].sort((a, b) => apptTime(b) - apptTime(a));
        const registeredName = cleanName(
          (byRecency.find(a => cleanName(a.name)) || {}).name, 120
        );

        const completedIds = new Set((store.completed || []).map(a => a.id));
        const reviewedIds = new Set(
          ((await kvGet("reviews_store"))?.reviews || []).map(r => r.apptId)
        );
        const completedMine = byRecency.filter(a => completedIds.has(a.id));
        if (!completedMine.length) return res.status(409).json({ error: "not_completed" });

        // Se reseña la visita completada más reciente que siga sin reseña, y
        // solo dentro de la ventana: opinar sobre algo de hace un año no ayuda.
        const target = completedMine.find(
          a => !reviewedIds.has(a.id) && (Date.now() - apptTime(a)) <= REVIEW_WINDOW_MS
        );
        if (!target) {
          return res.status(200).json({ ok: true, already: true, name: registeredName });
        }

        return res.status(200).json({
          ok: true,
          token: signReviewToken(target.id),
          name: registeredName,
          appt: {
            service: sanitizeStr(target.service, 120) || "",
            stylist: sanitizeStr(target.stylist, 80) || "",
            date: target.date || "",
          },
        });
      }

      const appt = all.find(a => a.id === id);
      // Ownership check: cédula de la cita + últimos 4 del celular.
      if (!appt || (appt.cedula || "").replace(/\D/g, "") !== cedula) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      // Se compara contra todos los celulares de esa cédula: quien cambió de
      // número sigue entrando con el último que registró.
      const phone4 = last4(rawPhone4);
      const mine = all.filter(a => (a.cedula || "").replace(/\D/g, "") === cedula);
      if (!phoneMatches(mine, phone4)) {
        if (await tooManyFailures(req, res)) return;
        return res.status(401).json({ error: "auth_failed" });
      }

      const completedSet = new Set((store.completed || []).map(a => a.id));

      // El cliente pide el link para reseñar su propia visita. La cédula ya
      // demostró que la cita es suya, así que aquí solo falta que esté
      // completada y que no haya reseñado antes.
      if (action === "review-link") {
        if (!completedSet.has(id)) return res.status(409).json({ error: "not_completed" });
        const reviews = (await kvGet("reviews_store"))?.reviews || [];
        if (reviews.some(r => r.apptId === id)) {
          return res.status(200).json({ ok: true, already: true });
        }
        return res.status(200).json({ ok: true, token: signReviewToken(id) });
      }

      // Already finished/cancelled — nothing to do.
      if ((adminData.cancelledIds || []).includes(id) || completedSet.has(id)) {
        return res.status(200).json({ ok: true, alreadyCancelled: true });
      }

      // Enforce minimum-notice window.
      const minHours = Number(adminData.selfService?.minHoursBefore ?? 2);
      if (minHours > 0 && appt.date && appt.time) {
        const startMs = new Date(`${appt.date}T${appt.time}:00${COT_OFFSET}`).getTime();
        if (!Number.isNaN(startMs) && (startMs - Date.now()) < minHours * 3600 * 1000) {
          return res.status(409).json({ error: "too_late", minHours });
        }
      }

      const cancelledIds = [...new Set([...(adminData.cancelledIds || []), id])];
      await kvSet("admin_store", { ...adminData, cancelledIds });
      return res.status(200).json({ ok: true });
    }

    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const cedula = (req.query.cedula || "").replace(/\D/g, "");
    const phone  = (req.query.phone  || "").replace(/\D/g, "");
    const phone4 = last4(req.query.phone4);
    if (!cedula && !phone) return res.status(400).json({ error: "Missing cedula or phone" });
    if (cedula && phone4.length !== 4) return res.status(400).json({ error: "missing_phone4" });

    const store     = await kvGet("turno_store") || { appointments: [], active: [], completed: [], blockedSlots: [] };
    const adminData = await kvGet("admin_store")  || {};
    const crmStore  = await kvGet("crm_store")    || {};

    const activeSet    = new Set((store.active    || []).map(a => a.id));
    const completedSet = new Set((store.completed || []).map(a => a.id));
    const cancelledIds = adminData.cancelledIds || [];

    // Merge all lists, deduplicate, filter by cedula or phone
    const seen = new Set();
    const all  = [
      ...(store.appointments || []),
      ...(store.active       || []),
      ...(store.completed    || []),
    ].filter(a => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      if (cedula) return (a.cedula || "").replace(/\D/g, "") === cedula;
      return (a.phone || "").replace(/\D/g, "") === phone;
    });

    // Cédula y celular tienen que ir juntos. Una cédula sin citas responde
    // igual que una con el celular equivocado: no se confirma si existe.
    if (cedula && !phoneMatches(all, phone4)) {
      if (await tooManyFailures(req, res)) return;
      return res.status(401).json({ error: "auth_failed" });
    }

    // Estado de la reseña de cada cita: la cuenta no la vuelve a pedir y le
    // cuenta al cliente en qué va la que ya dejó.
    const reviewStatusByAppt = new Map(
      ((await kvGetCached("reviews_store", 30000))?.reviews || [])
        .map(r => [r.apptId, r.status])
    );

    const appointments = all.map(a => {
      let computedStatus = "scheduled";
      if (cancelledIds.includes(a.id))    computedStatus = "cancelled";
      else if (completedSet.has(a.id))    computedStatus = "completed";
      else if (activeSet.has(a.id)) {
        const live = store.active.find(x => x.id === a.id);
        computedStatus = live?.status || "waiting";
      }
      return {
        ...a, computedStatus,
        reviewed: reviewStatusByAppt.has(a.id),
        reviewStatus: reviewStatusByAppt.get(a.id) || null,
      };
    });

    // CRM data is keyed by cedula (primary). Fall back to phone for legacy records.
    const phoneKey  = ((all.find(a => a.phone) || {}).phone || "").replace(/\D/g, "");
    const crmKey    = cedula || phone;
    const clientCrm = crmStore[crmKey] || crmStore[phoneKey] || {};
    const loyalty   = adminData.loyalty?.enabled
      ? {
          enabled:  true,
          target:   adminData.loyalty.target  || 10,
          reward:   adminData.loyalty.reward  || "Corte gratis",
          visits:   clientCrm.loyaltyVisits   || 0,
          redeemed: clientCrm.loyaltyRedeemed || 0,
        }
      : null;

    // Self-service policy + salon contact for the client UI
    const selfService = {
      allowCancel:    adminData.selfService?.allowCancel !== false,
      minHoursBefore: Number(adminData.selfService?.minHoursBefore ?? 2),
    };
    const waNumber = (adminData.whatsappAdminNumber || "").replace(/\D/g, "");

    return res.status(200).json({ appointments, loyalty, selfService, waNumber });
  } catch (err) {
    console.error("[client]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
