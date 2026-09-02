import {
  initTables, kvGet, kvGetCached, kvSet,
  applyCors, clientIp, rateLimit, signReviewToken, cleanName, sanitizeStr,
  makeReviewEligibility, apptDoneMs,
} from "../lib/db.js";
import { notifyStaff } from "../lib/notify.js";

const COT_OFFSET = "-05:00"; // Colombia = UTC-5 fijo (sin horario de verano)

// Mi Cuenta se abre solo con la cédula. Como la cédula no es un dato secreto,
// la protección no está en la llave sino en lo que se entrega: la respuesta se
// arma campo por campo y deja fuera el celular, la cédula, el precio cobrado y
// las notas internas del equipo.

// Antelación mínima para que el cliente cancele solo. Es un piso, no un valor
// por defecto: el panel puede pedir más horas, nunca menos. Por debajo de tres
// horas el hueco ya no se alcanza a revender y toca coordinarlo por WhatsApp.
const MIN_HOURS_BEFORE = 3;

const minHoursBefore = (admin) =>
  Math.max(MIN_HOURS_BEFORE, Number(admin?.selfService?.minHoursBefore) || 0);

// Misma ventana que usa Mi Cuenta para ofrecer el botón de reseña.
const REVIEW_WINDOW_MS = 30 * 24 * 3600 * 1000;

const firstWord = (full) => String(full || "").trim().split(/\s+/)[0] || "";

// "Ana María Pérez" -> "Ana M••• P•••". Alcanza para que el cliente reconozca
// que es su registro, y no para que un tercero se lleve el nombre completo
// probando cédulas.
function maskName(full) {
  const parts = cleanName(full, 120).split(" ").filter(Boolean);
  if (!parts.length) return "";
  return [parts[0], ...parts.slice(1).map(w => `${w[0]}•••`)].join(" ");
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
      const { id, cedula: rawCedula, action } = req.body ?? {};
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
      // Aquí basta la cédula: se pide solo eso para que dejar una opinión no
      // tenga fricción. El nombre nunca sale completo, va enmascarado, y lo
      // que se publica es solo el nombre de pila. La cédula no es un dato
      // secreto, así que el filtro real de lo que sale a la web sigue siendo
      // la moderación del panel: nada se publica sin aprobación.
      if (action === "review-lookup") {
        const mineAll = all.filter(a => (a.cedula || "").replace(/\D/g, "") === cedula);
        if (!mineAll.length) {
          // Una cédula sin citas cuenta como intento fallido: es lo que haría
          // alguien probando números en serie, y así se topa con el límite.
          if (await tooManyFailures(req, res)) return;
          return res.status(404).json({ error: "not_found" });
        }

        // El último nombre registrado: el de la cita más reciente que traiga uno.
        const byRecency = [...mineAll].sort((a, b) => apptDoneMs(b) - apptDoneMs(a));
        const registeredName = cleanName(
          (byRecency.find(a => cleanName(a.name)) || {}).name, 120
        );

        const reviewedIds = new Set(
          ((await kvGet("reviews_store"))?.reviews || []).map(r => r.apptId)
        );
        const eligible = makeReviewEligibility({
          completedIds: (store.completed || []).map(a => a.id),
          cancelledIds: adminData.cancelledIds,
          noShowIds: adminData.noShowIds,
        });
        const visitasMine = byRecency.filter(eligible);
        if (!visitasMine.length) return res.status(409).json({ error: "not_completed" });

        // Se reseña la visita más reciente que siga sin reseña, y solo dentro
        // de la ventana: opinar sobre algo de hace un año no ayuda.
        const target = visitasMine.find(
          a => !reviewedIds.has(a.id) && (Date.now() - apptDoneMs(a)) <= REVIEW_WINDOW_MS
        );
        if (!target) {
          // Distinguir los dos motivos: decirle "ya opinaste" a quien nunca lo
          // hizo, solo porque su visita quedó vieja, es sencillamente falso.
          const yaOpino = visitasMine.some(a => reviewedIds.has(a.id));
          if (!yaOpino) return res.status(409).json({ error: "too_old" });
          return res.status(200).json({ ok: true, already: true, maskedName: maskName(registeredName) });
        }

        return res.status(200).json({
          ok: true,
          token: signReviewToken(target.id),
          // Para confirmar identidad, sin exponer el nombre completo.
          maskedName: maskName(registeredName),
          // El nombre de pila es justo lo que se publicaría de todos modos,
          // así que sirve de valor inicial del formulario sin revelar de más.
          name: firstWord(registeredName),
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
      // La cita ya se comprobó contra la cédula: es la misma llave con la que
      // se entra a Mi Cuenta, sin los últimos 4 del celular.
      const completedSet = new Set((store.completed || []).map(a => a.id));

      // El cliente pide el link para reseñar su propia visita. La cédula ya
      // demostró que la cita es suya, así que aquí solo falta que esté
      // completada y que no haya reseñado antes.
      if (action === "review-link") {
        const eligible = makeReviewEligibility({
          completedIds: [...completedSet],
          cancelledIds: adminData.cancelledIds,
          noShowIds: adminData.noShowIds,
        });
        if (!eligible(appt)) return res.status(409).json({ error: "not_completed" });
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
      const minHours = minHoursBefore(adminData);
      if (minHours > 0 && appt.date && appt.time) {
        const startMs = new Date(`${appt.date}T${appt.time}:00${COT_OFFSET}`).getTime();
        if (!Number.isNaN(startMs) && (startMs - Date.now()) < minHours * 3600 * 1000) {
          return res.status(409).json({ error: "too_late", minHours });
        }
      }

      const cancelledIds = [...new Set([...(adminData.cancelledIds || []), id])];
      await kvSet("admin_store", { ...adminData, cancelledIds });
      // Una cancelación libera un hueco de agenda y el equipo tiene que verlo
      // hoy, no cuando abra el panel: por eso va con prioridad alta. Se espera
      // el envío porque la función se congela al responder.
      await notifyStaff({
        stylist: appt.stylist || null,
        toAdmin: true,
        title: "Cita cancelada por el cliente",
        tags: "x",
        priority: "high",
        body: [
          cleanName(appt.name, 120) || "Cliente",
          appt.service || null,
          appt.stylist ? `con ${appt.stylist}` : null,
          [appt.date, appt.time].filter(Boolean).join(" ") || null,
        ].filter(Boolean).join(" · "),
      });
      return res.status(200).json({ ok: true });
    }

    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const cedula = (req.query.cedula || "").replace(/\D/g, "");
    const phone  = (req.query.phone  || "").replace(/\D/g, "");
    if (!cedula && !phone) return res.status(400).json({ error: "Missing cedula or phone" });

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

    // Entrar solo con la cédula: no es un dato secreto, así que la protección
    // no puede ser la llave sino lo que se entrega. Abajo se arma la respuesta
    // campo por campo, sin celular, sin cédula y sin las notas internas del
    // equipo. Una cédula sin citas cuenta como intento fallido, para que
    // probar números en serie choque con el límite.
    if (cedula && !all.length) {
      if (await tooManyFailures(req, res)) return;
      return res.status(404).json({ error: "not_found" });
    }

    // Estado de la reseña de cada cita: la cuenta no la vuelve a pedir y le
    // cuenta al cliente en qué va la que ya dejó.
    const reviewStatusByAppt = new Map(
      ((await kvGetCached("reviews_store", 30000))?.reviews || [])
        .map(r => [r.apptId, r.status])
    );

    // Misma regla que usa /resena, para que Mi Cuenta no ofrezca el botón en
    // citas que el backend luego rechazaría (ni al revés).
    const canReview = makeReviewEligibility({
      completedIds: [...completedSet],
      cancelledIds,
      noShowIds: adminData.noShowIds,
    });

    const appointments = all.map(a => {
      let computedStatus = "scheduled";
      if (cancelledIds.includes(a.id))    computedStatus = "cancelled";
      else if (completedSet.has(a.id))    computedStatus = "completed";
      else if (activeSet.has(a.id)) {
        const live = store.active.find(x => x.id === a.id);
        computedStatus = live?.status || "waiting";
      }
      // Lista blanca: solo lo que la pantalla de Mi Cuenta pinta. Antes se
      // devolvía la cita entera (...a), y con ella el celular, la cédula, el
      // precio cobrado y las notas internas que el equipo escribe al cerrar
      // el servicio. Nada de eso tiene por qué salir del panel.
      return {
        id: a.id,
        code: a.code || "",
        date: a.date || "",
        time: a.time || "",
        service: a.service || "",
        stylist: a.stylist || "",
        createdAt: a.createdAt || 0,
        completedAt: a.completedAt || null,
        computedStatus,
        reviewed: reviewStatusByAppt.has(a.id),
        reviewStatus: reviewStatusByAppt.get(a.id) || null,
        reviewable: canReview(a),
      };
    });

    // CRM data is keyed by cedula (primary). Fall back to phone for legacy records.
    const phoneKey  = ((all.find(a => a.phone) || {}).phone || "").replace(/\D/g, "");
    const crmKey    = cedula || phone;
    const clientCrm = crmStore[crmKey] || crmStore[phoneKey] || {};
    // El programa solo se le muestra al cliente si de verdad está en marcha:
    // encendido Y con un premio definido por el salón. Antes bastaba con el
    // interruptor, y el código rellenaba el premio con un "Corte gratis" que
    // nadie había configurado: al cliente se le prometía algo inventado.
    const loyaltyReward = String(adminData.loyalty?.reward || "").trim();
    const loyalty = (adminData.loyalty?.enabled && loyaltyReward)
      ? {
          enabled:  true,
          target:   Number(adminData.loyalty.target) > 0 ? Number(adminData.loyalty.target) : 10,
          reward:   sanitizeStr(loyaltyReward, 80),
          visits:   clientCrm.loyaltyVisits   || 0,
          redeemed: clientCrm.loyaltyRedeemed || 0,
        }
      : null;

    // Self-service policy + salon contact for the client UI
    const selfService = {
      allowCancel:    adminData.selfService?.allowCancel !== false,
      minHoursBefore: minHoursBefore(adminData),
    };
    const waNumber = (adminData.whatsappAdminNumber || "").replace(/\D/g, "");

    // Solo el nombre de pila, para saludar. El apellido no hace falta aquí.
    const latest = [...all].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    const firstName = cleanName(latest?.name, 120).split(" ")[0] || "";

    return res.status(200).json({ appointments, firstName, loyalty, selfService, waNumber });
  } catch (err) {
    console.error("[client]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
