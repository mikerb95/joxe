import {
  initTables, kvGet, kvGetCached, kvGetWithMeta, kvCas, kvInvalidate,
  applyCors, clientIp, rateLimit, sanitizeStr,
  verifyStaffAuth, verifyAdminAuth, signReviewToken, verifyReviewToken,
} from "../lib/db.js";

const KEY = "reviews_store";
const DEFAULT = () => ({ reviews: [] });

const MAX_TEXT = 600;
const CAS_RETRIES = 4;

// Escritura con compare-and-swap: dos clientes pueden enviar su reseña en el
// mismo segundo y ninguna de las dos puede perderse. mutate recibe el store
// actual y devuelve { next, result } o lanza { status, error }.
async function mutate(mutateFn) {
  for (let i = 0; i < CAS_RETRIES; i++) {
    const rec = await kvGetWithMeta(KEY);
    const current = { ...DEFAULT(), ...(rec?.value || {}) };
    const { next, result } = mutateFn(current);
    if (!next) return result;
    const ok = await kvCas(KEY, next, rec ? rec.updatedAt : null);
    if (ok) { kvInvalidate(KEY); return result; }
  }
  const err = new Error("Conflicto al guardar, reintenta");
  err.status = 409;
  throw err;
}

// Vista pública de una reseña: nombre de pila, nota, texto y servicio.
// El estilista NO se expone: se guarda solo para las métricas del panel.
function publicReview(r) {
  return {
    id: r.id,
    name: r.name,
    rating: r.rating,
    text: r.text,
    service: r.service,
    createdAt: r.createdAt,
    ...(r.reply ? { reply: r.reply } : {}),
  };
}

// Solo el nombre de pila, para no publicar el nombre completo de nadie.
function firstName(full) {
  return sanitizeStr(String(full || "").trim().split(/\s+/)[0] || "Cliente", 40);
}

function summarize(reviews) {
  const approved = reviews.filter(r => r.status === "approved");
  const count = approved.length;
  const avg = count
    ? Math.round((approved.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10
    : 0;
  return { avg, count, approved };
}

// Busca la cita en las tres listas y decide si admite reseña.
async function findCompletedAppt(apptId) {
  const store = await kvGet("turno_store") || {};
  const completed = store.completed || [];
  const appt = completed.find(a => a.id === apptId)
    || [...(store.appointments || []), ...(store.active || [])].find(a => a.id === apptId);
  if (!appt) return null;
  const isCompleted = completed.some(a => a.id === apptId);
  return { appt, isCompleted };
}

export default async function handler(req, res) {
  applyCors(req, res, "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    await initTables();

    // ---------------- GET ----------------
    if (req.method === "GET") {
      const { token, action, apptId } = req.query;

      // Panel: genera el link que se le manda al cliente.
      if (action === "link") {
        if (!(await verifyStaffAuth(req))) return res.status(401).json({ error: "Unauthorized" });
        const id = String(apptId || "");
        if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) return res.status(400).json({ error: "apptId inválido" });
        const found = await findCompletedAppt(id);
        if (!found) return res.status(404).json({ error: "Cita no encontrada" });
        if (!found.isCompleted) return res.status(409).json({ error: "La cita aún no está completada" });
        const store = await kvGet(KEY) || DEFAULT();
        const already = store.reviews.some(r => r.apptId === id);
        return res.status(200).json({ token: signReviewToken(id), already });
      }

      // Panel: todas las reseñas, incluidas pendientes y ocultas.
      if (action === "all") {
        if (!(await verifyStaffAuth(req))) return res.status(401).json({ error: "Unauthorized" });
        const store = await kvGet(KEY) || DEFAULT();
        const { avg, count } = summarize(store.reviews);
        // Nota por estilista, solo para el panel.
        const byStylist = {};
        for (const r of store.reviews) {
          if (r.status !== "approved" || !r.stylist) continue;
          const b = byStylist[r.stylist] || (byStylist[r.stylist] = { sum: 0, count: 0 });
          b.sum += r.rating; b.count++;
        }
        for (const k of Object.keys(byStylist)) {
          byStylist[k] = {
            count: byStylist[k].count,
            avg: Math.round((byStylist[k].sum / byStylist[k].count) * 10) / 10,
          };
        }
        return res.status(200).json({ reviews: store.reviews, avg, count, byStylist });
      }

      // Cliente con link: datos de su cita para pintar el formulario.
      if (token) {
        const apptIdFromToken = verifyReviewToken(String(token));
        if (!apptIdFromToken) return res.status(401).json({ error: "invalid_token" });
        const found = await findCompletedAppt(apptIdFromToken);
        if (!found || !found.isCompleted) return res.status(404).json({ error: "not_found" });
        const store = await kvGet(KEY) || DEFAULT();
        const existing = store.reviews.find(r => r.apptId === apptIdFromToken);
        return res.status(200).json({
          appt: {
            name: firstName(found.appt.name),
            service: sanitizeStr(found.appt.service, 120) || "",
            stylist: sanitizeStr(found.appt.stylist, 80) || "",
            date: found.appt.date || "",
          },
          already: !!existing,
          ...(existing ? { review: { rating: existing.rating, text: existing.text, status: existing.status } } : {}),
        });
      }

      // Público: solo lo aprobado.
      const store = await kvGetCached(KEY, 30000) || DEFAULT();
      const { avg, count, approved } = summarize(store.reviews || []);
      const reviews = approved
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(publicReview);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ avg, count, reviews });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // ---------------- POST: moderación (admin) ----------------
    if (req.query.action === "moderate") {
      if (!(await verifyAdminAuth(req))) return res.status(401).json({ error: "Unauthorized" });
      const { id, op, reply } = req.body ?? {};
      if (!id || !["approve", "hide", "delete", "reply"].includes(op)) {
        return res.status(400).json({ error: "Operación inválida" });
      }
      const result = await mutate(current => {
        const idx = current.reviews.findIndex(r => r.id === id);
        if (idx === -1) { const e = new Error("Reseña no encontrada"); e.status = 404; throw e; }
        const reviews = [...current.reviews];
        if (op === "delete") {
          reviews.splice(idx, 1);
        } else if (op === "reply") {
          const text = sanitizeStr(reply, MAX_TEXT).trim();
          reviews[idx] = text
            ? { ...reviews[idx], reply: { text, at: Date.now() } }
            : { ...reviews[idx], reply: undefined };
        } else {
          reviews[idx] = { ...reviews[idx], status: op === "approve" ? "approved" : "hidden" };
        }
        return { next: { ...current, reviews }, result: { ok: true } };
      });
      return res.status(200).json(result);
    }

    // ---------------- POST: el cliente deja su reseña ----------------
    const ip = clientIp(req);
    const rl = await rateLimit(`review:${ip}`, 10, 10 * 60 * 1000);
    if (!rl.ok) {
      res.setHeader("Retry-After", String(rl.retryAfter));
      return res.status(429).json({ error: "Too many requests" });
    }

    const { token, rating: rawRating, text: rawText } = req.body ?? {};
    const apptId = verifyReviewToken(String(token || ""));
    if (!apptId) return res.status(401).json({ error: "invalid_token" });

    const rating = Number(rawRating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "La calificación debe ir de 1 a 5" });
    }
    const text = sanitizeStr(rawText, MAX_TEXT).trim();

    const found = await findCompletedAppt(apptId);
    if (!found || !found.isCompleted) return res.status(404).json({ error: "not_found" });
    const { appt } = found;

    const review = {
      id: `rv_${apptId.slice(0, 12)}`,
      apptId,
      name: firstName(appt.name),
      rating,
      text,
      service: sanitizeStr(appt.service, 120) || "",
      stylist: sanitizeStr(appt.stylist, 80) || "",
      stylistId: appt.stylistId || null,
      serviceId: appt.serviceId || null,
      status: "pending", // toda reseña pasa por el panel antes de salir al home
      createdAt: Date.now(),
    };

    const result = await mutate(current => {
      // Una reseña por cita. Reenviar el formulario no crea duplicados.
      if (current.reviews.some(r => r.apptId === apptId)) {
        return { next: null, result: { ok: true, already: true } };
      }
      return {
        next: { ...current, reviews: [...current.reviews, review] },
        result: { ok: true },
      };
    });
    return res.status(200).json(result);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error("[reviews]", err.message);
    return res.status(status).json({ error: err.message });
  }
}
