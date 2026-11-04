import { randomUUID } from "node:crypto";
import { kvGet, kvGetWithMeta, kvCas } from "./db.js";

// Lista de espera: clientes que no encontraron turno el día que querían y
// dejaron su celular para que el salón les escriba si se libera uno. No se
// avisa solo al cliente (eso pediría la API de WhatsApp, que es de pago): el
// equipo ve la lista en el panel y le escribe por WhatsApp con un botón.
//
// Todo vive en una sola clave, igual que la academia y las reseñas, y se
// escribe con compare-and-swap para que dos altas simultáneas no se pisen.

export const KEY = "waitlist_store";
export const STATUSES = ["waiting", "contacted", "booked", "discarded"];
export const ANY_STYLIST = "Sin preferencia";

const MAX_ENTRIES = 500;
const CAS_RETRIES = 4;
// Las entradas de días que ya pasaron no le sirven a nadie: se borran solas
// una semana después, para que la clave no crezca sin fin.
const KEEP_PAST_DAYS = 7;

export const todayBogota = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

export const addDaysStr = (dateStr, n) => {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Para reconocer al mismo cliente aunque escriba el número con o sin
// indicativo (misma idea que phoneKey en telefono.jsx).
export const phoneDigits = (p) => {
  const d = String(p || "").replace(/\D/g, "");
  return d.startsWith("57") && d.length === 12 ? d.slice(2) : d;
};

function readStore(raw) {
  return { entries: Array.isArray(raw?.entries) ? raw.entries : [] };
}

function prune(entries) {
  const cutoff = addDaysStr(todayBogota(), -KEEP_PAST_DAYS);
  return entries.filter(e => e.date >= cutoff);
}

export async function loadWaitlist() {
  return readStore(await kvGet(KEY));
}

// mutateFn recibe { entries } y devuelve { next, result }. next null = no
// escribir. Puede lanzar un Error con .status para cortar con ese código.
export async function mutateWaitlist(mutateFn) {
  for (let i = 0; i < CAS_RETRIES; i++) {
    const rec = await kvGetWithMeta(KEY);
    const current = readStore(rec?.value);
    current.entries = prune(current.entries);
    const { next, result } = mutateFn(current);
    if (!next) return result;
    next.entries = next.entries.slice(-MAX_ENTRIES);
    const ok = await kvCas(KEY, next, rec ? rec.updatedAt : null);
    if (ok) return result;
  }
  const err = new Error("Conflicto al guardar, reintenta");
  err.status = 409;
  throw err;
}

export function newEntry({ name, phone, date, service, stylist }) {
  return {
    id: `w_${randomUUID().slice(0, 12)}`,
    name, phone, date,
    service: service || "",
    stylist: stylist || ANY_STYLIST,
    status: "waiting",
    createdAt: Date.now(),
  };
}

// Cuántos siguen esperando un turno ese día con ese estilista (o con
// cualquiera). Lo usa el aviso de cancelación para decirle al equipo que hay
// a quién ofrecerle el hueco.
export async function waitingFor(date, stylist) {
  const { entries } = await loadWaitlist();
  return entries.filter(e =>
    e.status === "waiting" && e.date === date &&
    (e.stylist === ANY_STYLIST || !stylist || e.stylist === stylist)
  );
}
