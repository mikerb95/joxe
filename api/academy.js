import { randomUUID } from "node:crypto";
import {
  initTables, kvGet, kvGetCached, kvGetWithMeta, kvCas, kvInvalidate,
  applyCors, clientIp, rateLimit, sanitizeStr, cleanName, nameError,
  verifyStaffAuth, verifyAdminAuth,
} from "../lib/db.js";
import { notifyStaff } from "../lib/notify.js";

// Academia: el contenido que se publica en /academia y las solicitudes de
// inscripción que llegan desde esa página. Todo vive en una sola clave para
// que el panel lea contenido y solicitudes de un tirón.
const KEY = "academy_store";

// Sin datos inventados: la academia nace apagada y vacía. Hasta que alguien
// llene el contenido desde el panel, la página no se enlaza en ningún lado.
const DEFAULT = () => ({
  content: {
    enabled: false,
    kicker: "",
    headline: "",
    intro: "",
    nextStart: "",
    location: "",
    includes: [],
    courses: [],
    faq: [],
    whatsappMsg: "",
  },
  leads: [],
});

const MAX_LEADS = 500;
const CAS_RETRIES = 4;
const LEAD_STATUSES = ["new", "contacted", "enrolled", "discarded"];

// Mismo patrón de escritura que las reseñas: compare-and-swap con reintentos,
// para que dos solicitudes simultáneas no se pisen.
async function mutate(mutateFn) {
  for (let i = 0; i < CAS_RETRIES; i++) {
    const rec = await kvGetWithMeta(KEY);
    const stored = rec?.value || {};
    const current = {
      content: { ...DEFAULT().content, ...(stored.content || {}) },
      leads: Array.isArray(stored.leads) ? stored.leads : [],
    };
    const { next, result } = mutateFn(current);
    if (!next) return result;
    const ok = await kvCas(KEY, next, rec ? rec.updatedAt : null);
    if (ok) { kvInvalidate(KEY); return result; }
  }
  const err = new Error("Conflicto al guardar, reintenta");
  err.status = 409;
  throw err;
}

function readStore(raw) {
  const stored = raw || {};
  return {
    content: { ...DEFAULT().content, ...(stored.content || {}) },
    leads: Array.isArray(stored.leads) ? stored.leads : [],
  };
}

const str = (v, max) => sanitizeStr(v, max)?.trim() ?? "";

// El precio se guarda como número (0 = sin precio publicado) y la nota lleva
// el matiz ("desde", "por sesión"), igual que el catálogo de servicios.
function cleanCourse(c) {
  const price = Number(c?.price);
  return {
    id: str(c?.id, 40) || `c_${randomUUID().slice(0, 8)}`,
    name: str(c?.name, 120),
    summary: str(c?.summary, 400),
    level: str(c?.level, 60),
    duration: str(c?.duration, 60),
    schedule: str(c?.schedule, 120),
    seats: Number.isFinite(Number(c?.seats)) ? Math.max(0, Math.trunc(Number(c.seats))) : 0,
    price: Number.isFinite(price) ? Math.max(0, Math.trunc(price)) : 0,
    note: str(c?.note, 40),
    topics: Array.isArray(c?.topics) ? c.topics.map(t => str(t, 160)).filter(Boolean).slice(0, 20) : [],
    active: c?.active !== false,
  };
}

function dedupeById(courses) {
  const seen = new Set();
  return courses.map(c => {
    let id = c.id;
    while (seen.has(id)) id = `c_${randomUUID().slice(0, 8)}`;
    seen.add(id);
    return id === c.id ? c : { ...c, id };
  });
}

function cleanContent(body) {
  return {
    enabled: !!body?.enabled,
    kicker: str(body?.kicker, 60),
    headline: str(body?.headline, 160),
    intro: str(body?.intro, 800),
    nextStart: str(body?.nextStart, 160),
    location: str(body?.location, 160),
    includes: Array.isArray(body?.includes)
      ? body.includes.map(t => str(t, 160)).filter(Boolean).slice(0, 12) : [],
    // Dos cursos con el mismo id romperían el selector del formulario.
    courses: Array.isArray(body?.courses)
      ? dedupeById(body.courses.map(cleanCourse).filter(c => c.name)).slice(0, 20) : [],
    faq: Array.isArray(body?.faq)
      ? body.faq.map(f => ({ q: str(f?.q, 200), a: str(f?.a, 800) })).filter(f => f.q && f.a).slice(0, 20)
      : [],
    whatsappMsg: str(body?.whatsappMsg, 240),
  };
}

// Vista pública: solo los cursos activos y sin el campo `active`.
function publicContent(content) {
  const { courses, ...rest } = content;
  return {
    ...rest,
    courses: (courses || []).filter(c => c.active !== false).map(({ active, ...c }) => c),
  };
}

export default async function handler(req, res) {
  applyCors(req, res, "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    await initTables();

    // ---------------- GET ----------------
    if (req.method === "GET") {
      // Panel: contenido completo (incluidos los cursos ocultos) y solicitudes.
      if (req.query.action === "all") {
        if (!(await verifyStaffAuth(req))) return res.status(401).json({ error: "Unauthorized" });
        const store = readStore(await kvGet(KEY));
        return res.status(200).json({
          content: store.content,
          leads: [...store.leads].sort((a, b) => b.createdAt - a.createdAt),
        });
      }

      // Público: se pide en cada carga del home y de /academia, y cambia muy
      // de vez en cuando, así que va por el cache corto.
      const store = readStore(await kvGetCached(KEY, 60000));
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        enabled: !!store.content.enabled,
        content: store.content.enabled ? publicContent(store.content) : null,
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // ---------------- POST: guardar contenido (admin) ----------------
    if (req.query.action === "content") {
      if (!(await verifyAdminAuth(req))) return res.status(401).json({ error: "Unauthorized" });
      const content = cleanContent(req.body ?? {});
      await mutate(current => ({ next: { ...current, content }, result: { ok: true, content } }));
      return res.status(200).json({ ok: true, content });
    }

    // ---------------- POST: mover una solicitud (admin) ----------------
    if (req.query.action === "lead") {
      if (!(await verifyAdminAuth(req))) return res.status(401).json({ error: "Unauthorized" });
      const { id, op, note } = req.body ?? {};
      if (!id || !(op === "delete" || op === "note" || LEAD_STATUSES.includes(op))) {
        return res.status(400).json({ error: "Operación inválida" });
      }
      const result = await mutate(current => {
        const idx = current.leads.findIndex(l => l.id === id);
        if (idx === -1) { const e = new Error("Solicitud no encontrada"); e.status = 404; throw e; }
        const leads = [...current.leads];
        if (op === "delete") leads.splice(idx, 1);
        else if (op === "note") leads[idx] = { ...leads[idx], staffNote: str(note, 400) };
        else leads[idx] = { ...leads[idx], status: op, movedAt: Date.now() };
        return { next: { ...current, leads }, result: { ok: true } };
      });
      return res.status(200).json(result);
    }

    // ---------------- POST: el interesado se inscribe ----------------
    const ip = clientIp(req);
    const rl = await rateLimit(`academy:${ip}`, 6, 10 * 60 * 1000);
    if (!rl.ok) {
      res.setHeader("Retry-After", String(rl.retryAfter));
      return res.status(429).json({ error: "Demasiadas solicitudes, intenta más tarde" });
    }

    const store = readStore(await kvGet(KEY));
    if (!store.content.enabled) return res.status(404).json({ error: "not_found" });

    const { name: rawName, phone: rawPhone, email: rawEmail, courseId, message: rawMsg } = req.body ?? {};

    // Mismo criterio que en reservas: el nombre de una persona son letras.
    const nameErr = nameError(rawName, { min: 2, max: 80 });
    if (nameErr) return res.status(400).json({ error: nameErr });
    const name = cleanName(rawName, 80);

    const phone = String(rawPhone ?? "").replace(/\D/g, "").slice(0, 15);
    if (phone.length < 7) return res.status(400).json({ error: "Escribe un celular válido" });

    const email = str(rawEmail, 120);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ error: "El correo no parece válido" });
    }

    const course = store.content.courses.find(c => c.id === courseId && c.active !== false) || null;
    const lead = {
      id: `ac_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      name,
      phone,
      email,
      courseId: course?.id || "",
      courseName: course?.name || "",
      message: str(rawMsg, 600),
      status: "new",
      createdAt: Date.now(),
    };

    const result = await mutate(current => {
      // Reenviar el formulario en la misma hora no crea una segunda solicitud
      // para el mismo celular y curso.
      const hourAgo = Date.now() - 60 * 60 * 1000;
      if (current.leads.some(l =>
        l.phone === lead.phone && l.courseId === lead.courseId && l.createdAt > hourAgo)) {
        return { next: null, result: { ok: true, already: true } };
      }
      // Tope de solicitudes guardadas: se descartan las más viejas ya cerradas.
      let leads = [...current.leads, lead];
      if (leads.length > MAX_LEADS) {
        const open = leads.filter(l => l.status === "new" || l.status === "contacted");
        const closed = leads.filter(l => l.status !== "new" && l.status !== "contacted")
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, Math.max(0, MAX_LEADS - open.length));
        leads = [...open, ...closed];
      }
      return { next: { ...current, leads }, result: { ok: true } };
    });

    // Nadie ve la solicitud si no entra al panel: se avisa igual que con las
    // reseñas, y se espera el envío porque la función se congela al responder.
    if (!result.already) {
      await notifyStaff({
        toAdmin: true,
        title: "Nueva solicitud de clases",
        ntfyTitle: "Nueva solicitud de clases",
        tags: "mortar_board",
        body: [
          `${lead.name} · ${lead.phone}`,
          lead.courseName || null,
          lead.message ? `"${lead.message.slice(0, 140)}${lead.message.length > 140 ? "…" : ""}"` : null,
        ].filter(Boolean).join(" · "),
      });
    }
    return res.status(200).json(result);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error("[academy]", err.message);
    return res.status(status).json({ error: err.message });
  }
}
