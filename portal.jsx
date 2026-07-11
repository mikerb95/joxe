// Portal JOXE — Sistema de turnos
// Shared store + components

// ============================================================
// STORE — Turso (via /api/store) + localStorage cache
// ============================================================
const STORE_KEY = "joxe_turnos_v1";
const STORE_DEFAULT = () => ({ appointments: [], active: [], completed: [], blockedSlots: [], blockRanges: [] });

const loadCache = () => {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    return s ? { ...STORE_DEFAULT(), ...s } : STORE_DEFAULT();
  } catch { return STORE_DEFAULT(); }
};

const broadcastUpdate = () => {
  try { new BroadcastChannel("joxe_turnos").postMessage({ type: "update" }); } catch {}
};

const useStore = () => {
  const [store, setStore] = React.useState(loadCache);
  // Version stamp of the store we last read, for optimistic-concurrency writes.
  const versionRef = React.useRef(0);

  // Fetch from Turso and update local cache
  const pull = React.useCallback(async () => {
    try {
      const t = sessionStorage.getItem("joxe_admin_session") || sessionStorage.getItem("joxe_emp_token") || "";
      const headers = t ? { "Authorization": `Bearer ${t}` } : {};
      const res = await fetch("/api/store", { headers });
      if (!res.ok) return;
      const { _v, ...data } = await res.json();
      versionRef.current = Number(_v) || 0;
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
      setStore(data);
    } catch {}
  }, []);

  React.useEffect(() => {
    pull();
    const interval = setInterval(pull, 5000); // live sync every 5 s
    let bc;
    try {
      bc = new BroadcastChannel("joxe_turnos");
      bc.addEventListener("message", pull);
    } catch {}
    window.addEventListener("storage", () => setStore(loadCache()));
    return () => {
      clearInterval(interval);
      try { bc?.close(); } catch {}
    };
  }, [pull]);

  // Persist to Turso. Returns { ok, status, error } so booking callers can
  // surface server-side rejections (slot taken, rate-limited, storage full)
  // instead of showing a confirmed ticket for a booking the server refused.
  const update = React.useCallback(async (updater, bookingAppt) => {
    const token = sessionStorage.getItem("joxe_admin_session") || "";

    // Client booking without session: append-only endpoint (its own atomic path)
    if (bookingAppt && !token) {
      const next = typeof updater === "function" ? updater(loadCache()) : updater;
      setStore(next);
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
      try {
        const res = await fetch("/api/book", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bookingAppt),
        });
        broadcastUpdate();
        if (!res.ok) {
          let error = "No se pudo agendar";
          try { error = (await res.json()).error || error; } catch {}
          return { ok: false, status: res.status, error };
        }
        return { ok: true, status: res.status };
      } catch (err) {
        console.warn("[store] book failed, using local cache", err.message);
        return { ok: false, status: 0, error: "Sin conexión" };
      }
    }

    // Staff write: optimistic concurrency. Send the version we based the edit on;
    // if the server rejects (409, store moved), reconcile with the fresh store
    // and re-apply the updater on top, then retry — never clobber a booking that
    // landed in between. Non-functional updaters (full replaces) can't be merged,
    // so they just force through on the fresh version.
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    for (let attempt = 0; attempt < 4; attempt++) {
      const next = typeof updater === "function" ? updater(loadCache()) : updater;
      setStore(next);
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
      try {
        const res = await fetch("/api/store", {
          method: "POST",
          headers,
          body: JSON.stringify({ ...next, _v: versionRef.current }),
        });
        if (res.status === 409) {
          const data = await res.json().catch(() => null);
          if (data?.store) {
            versionRef.current = Number(data._v) || 0;
            localStorage.setItem(STORE_KEY, JSON.stringify(data.store));
            setStore(data.store);
          }
          continue; // re-apply updater on the reconciled base
        }
        const data = await res.json().catch(() => null);
        if (data && data._v != null) versionRef.current = Number(data._v) || 0;
        broadcastUpdate();
        return { ok: res.ok, status: res.status };
      } catch (err) {
        console.warn("[store] save failed, using local cache", err.message);
        return { ok: false, status: 0, error: "Sin conexión" };
      }
    }
    return { ok: false, status: 409, error: "Conflicto al guardar, reintenta" };
  }, []);

  return [store, update];
};

const genTicket = () => {
  const n = Math.floor(Math.random() * 9000) + 1000;
  return `JX-${n}`;
};

// ============================================================
// SHARED UI
// ============================================================
const PMono = ({ children, style }) => (
  <span style={{
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
    letterSpacing: "0.18em", textTransform: "uppercase", ...style,
  }}>{children}</span>
);

const PortalShell = ({ children, tone = "noir", header }) => (
  <div style={{
    minHeight: "100vh",
    background: tone === "noir" ? "#0C0C0C" : "#F5F1EA",
    color: tone === "noir" ? "#F5F1EA" : "#0C0C0C",
    fontFamily: "'Outfit', sans-serif",
    display: "flex", flexDirection: "column",
  }}>
    {header}
    {children}
    <WABlob />
  </div>
);

const PortalHeader = ({ title, subtitle, right, tone = "noir" }) => {
  const hasRole = !!(
    sessionStorage.getItem("joxe_admin_session") ||
    sessionStorage.getItem("joxe_agenda_session")
  );
  const logoHref = hasRole ? "Portal.html" : "Asesores de Imagen.html";
  return (
  <header style={{
    padding: "24px 40px",
    borderBottom: tone === "noir" ? "1px solid rgba(245,241,234,0.1)" : "1px solid rgba(12,12,12,0.1)",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    flexWrap: "wrap", gap: 16,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <a href={logoHref} style={{
        fontFamily: "'Marcellus', serif", fontSize: 22,
        letterSpacing: "0.3em", textDecoration: "none", color: "inherit",
      }}>JOXE</a>
      <div style={{
        width: 1, height: 24,
        background: tone === "noir" ? "rgba(245,241,234,0.2)" : "rgba(12,12,12,0.2)",
      }} />
      <div>
        <PMono style={{ color: "#C29E66", fontSize: 10 }}>{subtitle}</PMono>
        <div style={{
          fontFamily: "'Marcellus', serif", fontSize: 18, marginTop: 2,
        }}>{title}</div>
      </div>
    </div>
    <div>{right}</div>
  </header>
  );
};

// ============================================================
// Dialog (confirm/alert replacement) — branded, accessible, focus-trap.
// Usage:
//   const dlg = useDialog();
//   const ok = await dlg.confirm({ title, body, confirmLabel, danger });
//   await dlg.alert({ title, body });
// ============================================================
const Dialog = ({ open, title, body, confirmLabel = "Confirmar", cancelLabel = "Cancelar",
                  danger = false, hideCancel = false, onConfirm, onCancel }) => {
  const cancelRef = React.useRef(null);
  const confirmRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    // Focus the safe action: cancel for confirm dialogs, confirm for alerts (hideCancel).
    const target = hideCancel ? confirmRef.current : (cancelRef.current || confirmRef.current);
    setTimeout(() => target?.focus(), 0);
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onCancel?.(); }
      if (e.key === "Enter" && document.activeElement === confirmRef.current) onConfirm?.();
      if (e.key === "Tab") {
        const focusables = [cancelRef.current, confirmRef.current].filter(Boolean);
        if (focusables.length === 0) return;
        const idx = focusables.indexOf(document.activeElement);
        e.preventDefault();
        const next = e.shiftKey
          ? focusables[(idx - 1 + focusables.length) % focusables.length]
          : focusables[(idx + 1) % focusables.length];
        next.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hideCancel, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="joxe-dlg-title"
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(12,12,12,0.78)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, animation: "fadeIn 0.2s ease",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}
    >
      <div style={{
        background: "#141212", color: "#F5F1EA",
        border: "1px solid rgba(245,241,234,0.12)",
        padding: 32, maxWidth: 440, width: "100%",
        fontFamily: "'Outfit', sans-serif",
      }}>
        {title && (
          <h2 id="joxe-dlg-title" style={{
            fontFamily: "'Marcellus', serif", fontSize: 24, fontWeight: 400,
            margin: "0 0 12px", color: danger ? "#e07070" : "#F5F1EA",
            letterSpacing: "-0.005em",
          }}>{title}</h2>
        )}
        {body && (
          <div style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.75, marginBottom: 28 }}>
            {body}
          </div>
        )}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {!hideCancel && (
            <button ref={cancelRef} onClick={onCancel} type="button" style={{
              flex: "1 1 120px", minWidth: 0,
              background: "transparent", color: "#F5F1EA",
              border: "1px solid rgba(245,241,234,0.2)", padding: "12px 18px",
              cursor: "pointer", fontFamily: "'Outfit', sans-serif",
              fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase",
            }}>{cancelLabel}</button>
          )}
          <button ref={confirmRef} onClick={onConfirm} type="button" style={{
            flex: "1 1 120px", minWidth: 0,
            background: danger ? "rgba(196,102,102,0.15)" : "#C29E66",
            color: danger ? "#e07070" : "#0C0C0C",
            border: danger ? "1px solid rgba(196,102,102,0.45)" : "none",
            padding: "12px 18px", cursor: "pointer", fontFamily: "'Outfit', sans-serif",
            fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase",
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

const useDialog = () => {
  const [state, setState] = React.useState(null); // { resolve, opts }

  const ask = React.useCallback((opts, hideCancel) =>
    new Promise((resolve) => {
      setState({ resolve, opts: { ...opts, hideCancel: !!hideCancel } });
    }), []
  );

  const close = (result) => {
    state?.resolve(result);
    setState(null);
  };

  const node = (
    <Dialog
      open={!!state}
      title={state?.opts?.title}
      body={state?.opts?.body}
      confirmLabel={state?.opts?.confirmLabel}
      cancelLabel={state?.opts?.cancelLabel}
      danger={state?.opts?.danger}
      hideCancel={state?.opts?.hideCancel}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );

  return {
    confirm: (opts) => ask(opts, false),
    alert:   (opts) => ask({ confirmLabel: "Entendido", ...opts }, true),
    node,
  };
};

// ============================================================
// QR RENDERER — real, scannable QR using `qrcode-generator` (UMD via CDN)
// The library exposes a global `qrcode(typeNumber, errorCorrectionLevel)` factory.
// We pick the smallest type that fits the payload and use error level "M".
// ============================================================
const buildQRMatrix = (text) => {
  if (typeof window.qrcode !== "function") return null;
  // typeNumber=0 lets the lib auto-pick the smallest version that fits.
  const qr = window.qrcode(0, "M");
  qr.addData(String(text));
  qr.make();
  const n = qr.getModuleCount();
  const grid = Array.from({ length: n }, (_, y) =>
    Array.from({ length: n }, (_, x) => qr.isDark(y, x))
  );
  return grid;
};

const QRCode = ({ value, size = 220, fg = "#0C0C0C", bg = "#F5F1EA" }) => {
  // Re-render when the lib finishes loading (the script is async on the page).
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    if (typeof window.qrcode === "function") return;
    const i = setInterval(() => {
      if (typeof window.qrcode === "function") { force(); clearInterval(i); }
    }, 80);
    return () => clearInterval(i);
  }, []);

  const grid = buildQRMatrix(value);
  if (!grid) {
    return (
      <div style={{
        width: size, height: size, background: bg, color: fg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, opacity: 0.5,
      }}>cargando QR…</div>
    );
  }

  const n = grid.length;
  const pad = 2; // quiet zone in modules (spec recommends 4; 2 is enough for screens)
  const total = n + pad * 2;
  const cell = size / total;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}
      role="img" aria-label="Código QR de tu cita">
      <rect width={size} height={size} fill={bg} />
      {grid.map((row, y) => row.map((on, x) => on && (
        <rect key={`${x}-${y}`}
          x={(x + pad) * cell} y={(y + pad) * cell}
          width={cell} height={cell} fill={fg} />
      )))}
    </svg>
  );
};

// ============================================================
// PAGE 1 — AGENDAR CITA
// ============================================================

const PENDING_EXPIRE_MS = 60 * 60 * 1000; // 1 hora
const isPendingExpired = (a) => a.status === "pending" && (Date.now() - (a.createdAt || 0)) > PENDING_EXPIRE_MS;

// Helpers — hora Colombia (COT = UTC-5)
const nowCOT = () => new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
const todayStr = () => {
  const d = nowCOT();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
// Retorna true si el slot "HH:MM" ya pasó para el día de hoy en COT
const isTimePast = (date, time) => {
  if (date !== todayStr()) return false;
  const [h, m] = time.split(":").map(Number);
  const now = nowCOT();
  return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
};

const addDays = (d, n) => {
  const dt = new Date(d + "T12:00");
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().split("T")[0];
};

const fmtDateLabel = (d) => {
  const t = todayStr();
  if (d === t) return "Hoy";
  if (d === addDays(t, 1)) return "Mañana";
  if (d === addDays(t, 2)) return "Pasado mañana";
  return fmtDateSub(d);
};

const timeToMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
const minToTime = (mins) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

// ---- Unified block-range model (mirrors lib/blocks.js on the server) ----
// blockedSlots (legacy) = one 30-min cell each; blockRanges (current) = flexible
// date/time ranges, optionally multi-day or spanning the whole day (absences).
const BLOCK_SLOT_MIN = 30;
const legacySlotToRange = (s) => {
  const endMin = timeToMin(s.time) + BLOCK_SLOT_MIN;
  return {
    dateStart: s.date, dateEnd: s.date, allDay: false,
    timeStart: s.time, timeEnd: minToTime(endMin), employeeId: s.employeeId ?? null,
  };
};
const normalizeBlocks = (store) => {
  const ranges = Array.isArray(store?.blockRanges) ? store.blockRanges : [];
  const legacy = Array.isArray(store?.blockedSlots) ? store.blockedSlots : [];
  return [...ranges, ...legacy.map(legacySlotToRange)];
};
const blockAppliesToEmp = (b, empId) => b.employeeId == null || b.employeeId === empId;
// True if block `b` overlaps the [time, time+durMin) window on `date`.
const blockOverlapsSlot = (b, date, time, durMin) => {
  if (date < b.dateStart || date > (b.dateEnd || b.dateStart)) return false;
  if (b.allDay) return true;
  const s = timeToMin(time), e = s + durMin;
  const bs = timeToMin(b.timeStart), be = timeToMin(b.timeEnd);
  return bs < e && s < be;
};

const fmtDateSub = (d) => {
  try {
    return new Date(d + "T12:00").toLocaleDateString("es-CO", { weekday:"short", day:"numeric", month:"short" });
  } catch { return d; }
};

const fmtCOP = (n) => n == null ? "" : "$" + Number(n).toLocaleString("es-CO");

// Business hours — JS getDay(): 0=dom, 1=lun, 2=mar, ..., 6=sab
// JOXE: Mar—Vie 9-21, Sáb 8-19, Dom—Lun cerrado
const BUSINESS_HOURS = {
  0: null,  // dom — cerrado
  1: null,  // lun — cerrado
  2: ["9:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"],  // mar
  3: ["9:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"],  // mie
  4: ["9:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"],  // jue
  5: ["9:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"],  // vie
  6: ["8:00","9:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"],           // sab
};

// Closing time per day in minutes — upper bound for service duration fit check
const CLOSE_TIME_MIN = {
  2: 21 * 60, 3: 21 * 60, 4: 21 * 60, 5: 21 * 60,  // mar—vie
  6: 19 * 60,                                         // sab
};

const dayOfWeek = (dateStr) => new Date(dateStr + "T12:00").getDay();
const isClosedDay = (dateStr) => !BUSINESS_HOURS[dayOfWeek(dateStr)];
const slotsForDate = (dateStr) => BUSINESS_HOURS[dayOfWeek(dateStr)] || [];
const closesAtMin  = (dateStr) => CLOSE_TIME_MIN[dayOfWeek(dateStr)] ?? 0;

// Maps JS getDay() index to workHours key stored in each employee profile
const WORK_DAY_KEYS = ["dom","lun","mar","mie","jue","vie","sab"];

// Returns false if the slot falls outside the employee's configured work hours for that day
const empWorksOnSlot = (emp, date, timeStr, dur) => {
  if (!emp?.workHours) return true; // no schedule configured — no restriction
  const dayKey = WORK_DAY_KEYS[new Date(date + "T12:00").getDay()];
  const day = emp.workHours[dayKey];
  if (!day?.active) return false; // employee doesn't work this day
  const startMin = timeToMin(day.start);
  const endMin   = timeToMin(day.end);
  const slotStart = timeToMin(timeStr);
  const slotEnd   = slotStart + dur;
  return slotStart >= startMin && slotEnd <= endMin;
};

const DEFAULT_SERVICES = [
  { id:"s1", name:"Corte mujer",        price:85000,  dur:60  },
  { id:"s2", name:"Corte hombre",       price:45000,  dur:40  },
  { id:"s3", name:"Balayage",           price:280000, dur:180, note:"desde" },
  { id:"s4", name:"Color correction",   price:320000, dur:240, note:"desde" },
  { id:"s5", name:"Color raíz",         price:120000, dur:90  },
  { id:"s6", name:"Keratina",           price:260000, dur:180, note:"desde" },
  { id:"s7", name:"Asesoría de imagen", price:180000, dur:90  },
  { id:"s8", name:"Peinado novia",      price:220000, dur:120, note:"desde" },
];

const DEFAULT_EMPLOYEES = [
  { id:"e1", name:"Joxe",      role:"Estilista",  services:["s1","s2","s3","s4","s5","s6","s7","s8"] },
  { id:"e2", name:"Laura M.",  role:"Estilista",  services:["s1","s2","s3","s5","s6","s8"] },
  { id:"e3", name:"Camila R.", role:"Colorista",  services:["s3","s4","s5","s6"] },
];

const useCatalog = () => {
  const [catalog, setCatalog] = React.useState({ services: DEFAULT_SERVICES, employees: DEFAULT_EMPLOYEES });
  React.useEffect(() => {
    fetch("/api/catalog")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCatalog(d); })
      .catch(() => {});
  }, []);
  return catalog;
};

const BOOKING_DRAFT_KEY = "joxe_booking_draft_v1";
const EMPTY_BOOKING_FORM = {
  service: "", serviceId: "", stylist: "", stylistId: "", date: "", time: "",
  name: "", phone: "", cedula: "",
};

const ADMIN_KEY_BOOKING = "joxe_admin_v1";
const loadBookingAdmin = () => {
  try { return JSON.parse(localStorage.getItem(ADMIN_KEY_BOOKING)) || {}; } catch { return {}; }
};

const BookingPortal = () => {
  const [store, setStore] = useStore();
  const catalog = useCatalog();
  const waAdminRaw = loadBookingAdmin().whatsappAdminNumber || "573124499862";
  const waAdminFormatted = (() => {
    const d = waAdminRaw.replace(/\D/g, "");
    if (d.startsWith("57") && d.length === 12) {
      return `+57 ${d.slice(2,5)} ${d.slice(5,8)} ${d.slice(8)}`;
    }
    return `+${d}`;
  })();
  // Restore draft from sessionStorage (cleared on submit)
  const initial = React.useMemo(() => {
    try {
      const raw = sessionStorage.getItem(BOOKING_DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        return {
          step: typeof d.step === "number" && d.step >= 1 && d.step <= 4 ? d.step : 1,
          form: { ...EMPTY_BOOKING_FORM, ...(d.form || {}) },
        };
      }
    } catch {}
    return { step: 1, form: EMPTY_BOOKING_FORM };
  }, []);
  const [step, setStep] = React.useState(initial.step);
  const [form, setForm] = React.useState(initial.form);
  const [ticket, setTicket] = React.useState(null);
  const [secsLeft, setSecsLeft] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [bookError, setBookError] = React.useState("");

  // Waitlist (lista de espera) — para cuando no hay un horario que sirva
  const [wlOpen, setWlOpen] = React.useState(false);
  const [wlSent, setWlSent] = React.useState(false);
  const [wlSending, setWlSending] = React.useState(false);
  const [wlForm, setWlForm] = React.useState({ name: "", phone: "" });

  // Auto-save form/step to sessionStorage on every change (so refresh keeps the draft)
  React.useEffect(() => {
    try { sessionStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify({ form, step })); } catch {}
  }, [form, step]);

  // 15-min countdown once ticket is created
  const CLIENT_DEADLINE_MS = 15 * 60 * 1000;
  React.useEffect(() => {
    if (!ticket) return;
    const tick = () => {
      const remaining = Math.max(0, CLIENT_DEADLINE_MS - (Date.now() - ticket.createdAt));
      setSecsLeft(Math.floor(remaining / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [ticket]);

  const services = catalog.services;
  const employees = catalog.employees;

  // Employees that offer the currently selected service.
  // Employees with an empty services array are treated as available for all services.
  const eligibleEmployees = React.useMemo(() => {
    if (!form.serviceId) return employees;
    return employees.filter(e =>
      !(e.services || []).length || (e.services || []).includes(form.serviceId)
    );
  }, [form.serviceId, employees]);

  // Show next 14 days, skipping closed days (Dom/Lun)
  const availableDates = React.useMemo(() => {
    const out = [];
    const today = todayStr();
    for (let i = 0; i < 21 && out.length < 14; i++) {
      const d = addDays(today, i);
      if (!isClosedDay(d)) out.push(d);
    }
    return out;
  }, []);

  // Duration of the currently selected service in minutes
  const selectedDur = React.useMemo(() => {
    if (!form.serviceId) return 60;
    return services.find(s => s.id === form.serviceId)?.dur || 60;
  }, [form.serviceId, services]);

  // Check if a time slot is available for a given date + stylist
  // Takes into account service duration — a long service blocks subsequent slots
  // and must finish before the salon closes for that day.
  const isSlotTaken = (date, time, stylistName, newDur) => {
    if (!date) return false;
    if (isClosedDay(date)) return true;
    if (isTimePast(date, time)) return true;

    const dur = newDur ?? selectedDur;
    const newStart = timeToMin(time);
    const newEnd   = newStart + dur;

    // Service must finish before closing time
    if (newEnd > closesAtMin(date)) return true;

    // Admin-blocked ranges/absences — scoped per stylist (null employeeId = salon-wide)
    const blocks = normalizeBlocks(store);
    const blockedForEmp = (empId) => blocks.some(b =>
      blockAppliesToEmp(b, empId) && blockOverlapsSlot(b, date, time, dur)
    );

    const aptsOnDay = (store.appointments || []).filter(
      a => a.date === date && !["cancelled"].includes(a.status) && !isPendingExpired(a)
    );

    const conflictsFor = (stylist) => aptsOnDay
      .filter(a => a.stylist === stylist)
      .some(a => {
        const aStart = timeToMin(a.time);
        const aEnd   = aStart + (a.serviceDur || 60) + (Number(a.bufferAfter) || 0);
        // Overlap: existing ends after new starts AND new ends after existing starts
        return aStart < newEnd && newStart < aEnd;
      });

    if (stylistName === "Sin preferencia") {
      return eligibleEmployees.every(e =>
        conflictsFor(e.name) || !empWorksOnSlot(e, date, time, dur) || blockedForEmp(e.id)
      );
    }
    const emp = employees.find(e => e.name === stylistName);
    if (emp && !empWorksOnSlot(emp, date, time, dur)) return true;
    if (blockedForEmp(emp ? emp.id : null)) return true;
    return conflictsFor(stylistName);
  };

  const submit = async () => {
    if (submitting) return;
    setBookError("");

    // Re-check availability right before submitting (the cache may have moved
    // since the client picked the slot). Fail fast with a clear message.
    if (form.stylist !== "Sin preferencia" && isSlotTaken(form.date, form.time, form.stylist)) {
      setBookError("Ese horario ya no está disponible. Elige otro.");
      setStep(3);
      return;
    }

    let assignedStylist = form.stylist;
    // Assign least-busy eligible stylist when "Sin preferencia"
    if (form.stylist === "Sin preferencia") {
      const counts = eligibleEmployees.map(e => ({
        name: e.name,
        count: (store.appointments || []).filter(
          a => a.date === form.date && a.stylist === e.name && !["cancelled"].includes(a.status) && !isPendingExpired(a)
        ).length,
      }));
      const free = counts.filter(e => !isSlotTaken(form.date, form.time, e.name));
      // Si ningún estilista está libre en este bloque, NO reservar sobre el menos
      // ocupado (eso genera doble reserva). Rechazar y devolver al paso de horario.
      if (free.length === 0) {
        setBookError("Ese horario ya no está disponible. Elige otro.");
        setStep(3);
        return;
      }
      assignedStylist = free.sort((a, b) => a.count - b.count)[0].name;
    }
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
    const code = genTicket();
    const appt = {
      id, code,
      service: form.service,
      serviceDur: selectedDur,
      stylist: assignedStylist,
      date: form.date,
      time: form.time,
      name: form.name,
      phone: form.phone,
      cedula: form.cedula,
      createdAt: Date.now(),
      status: "pending",
    };
    setSubmitting(true);
    // Optimistic add + persist. Only confirm the ticket if the server accepted;
    // otherwise revert the local add and show why (slot taken, rate-limited...).
    const result = await setStore(
      s => ({ ...s, appointments: [...s.appointments, appt] }),
      appt
    );
    setSubmitting(false);

    if (result && result.ok === false) {
      // Roll back the optimistic insert so the cache doesn't show a ghost.
      setStore(s => ({ ...s, appointments: s.appointments.filter(a => a.id !== id) }));
      setBookError(
        result.status === 409 ? "Ese horario acaba de ocuparse. Elige otro."
        : result.status === 429 ? "Demasiados intentos. Espera un momento."
        : (result.error || "No se pudo agendar. Intenta de nuevo.")
      );
      if (result.status === 409) setStep(3);
      return;
    }

    setTicket(appt);
    setStep(5);
    try { sessionStorage.removeItem(BOOKING_DRAFT_KEY); } catch {}
  };

  const submitWaitlist = async () => {
    const name = wlForm.name.trim();
    const phone = (wlForm.phone || "").replace(/\D/g, "");
    if (name.length < 3 || phone.length < 7) return;
    setWlSending(true);
    try {
      await fetch("/api/waitlist", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, phone,
          service: form.service || "",
          serviceDur: selectedDur,
          stylist: form.stylist && form.stylist !== "Sin preferencia" ? form.stylist : "",
          preferredDate: form.date || "",
          note: "",
        }),
      });
      setWlSent(true);
    } catch {
      setWlSent(true); // fail-soft: avoid blocking the client
    } finally {
      setWlSending(false);
    }
  };

  const TOTAL_STEPS = 4;

  // Inline field validation for step 4
  const cleanDigits = (s) => (s || "").replace(/\D/g, "");
  const trimmedName = form.name.trim();
  const phoneDigits = cleanDigits(form.phone);
  const errors = {
    name:   trimmedName.length === 0 ? "" : trimmedName.length < 3 ? "Ingresa al menos 3 caracteres." : "",
    phone:  phoneDigits.length === 0 ? "" : phoneDigits.length !== 10 ? "Debe tener 10 dígitos (ej: 300 123 4567)." : "",
    cedula: form.cedula.length === 0 ? "" : (form.cedula.length < 6 || form.cedula.length > 12) ? "Cédula entre 6 y 12 dígitos." : "",
  };
  const step4Valid = trimmedName.length >= 3
    && phoneDigits.length === 10
    && form.cedula.length >= 6 && form.cedula.length <= 12;

  const canNext = (step === 1 && !!form.service)
    || (step === 2 && !!form.stylist)
    || (step === 3 && !!form.date && !!form.time)
    || (step === 4 && step4Valid);

  const hasRole = !!(
    sessionStorage.getItem("joxe_admin_session") ||
    sessionStorage.getItem("joxe_agenda_session")
  );
  const homeHref = hasRole ? "Portal.html" : "Asesores de Imagen.html";

  return (
    <PortalShell tone="ivory" header={
      <PortalHeader
        tone="ivory"
        subtitle="Portal · Paso"
        title={step < 5 ? `${step} de ${TOTAL_STEPS} — Reservar cita` : "Reserva confirmada"}
        right={
          <a href={homeHref} style={{
            textDecoration: "none", color: "#0C0C0C",
            fontFamily: "'Outfit', sans-serif", fontSize: 12,
            letterSpacing: "0.15em", textTransform: "uppercase",
            opacity: 0.7,
          }}>← Inicio</a>
        }
      />
    }>
      <main style={{
        flex: 1, padding: "56px 40px", maxWidth: 900,
        margin: "0 auto", width: "100%",
      }}>
        {/* Progress bar */}
        {step < 5 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 48 }}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(n => (
              <div key={n} style={{
                flex: 1, height: 2,
                background: n <= step ? "#C29E66" : "rgba(12,12,12,0.1)",
                transition: "background 0.3s",
              }} />
            ))}
          </div>
        )}

        {/* ── STEP 1: Service ── */}
        {step === 1 && (
          <>
            <PMono style={{ color: "#C29E66" }}>01 — Servicio</PMono>
            <h1 style={{
              fontFamily: "'Marcellus', serif", fontSize: 52, fontWeight: 400,
              margin: "20px 0 40px", letterSpacing: "-0.01em", lineHeight: 1.05,
            }}>¿Qué necesitas hoy?</h1>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {services.map(s => {
                const sel = form.serviceId === s.id;
                return (
                  <button key={s.id}
                    onClick={() => setForm({ ...form, service: s.name, serviceId: s.id, stylist: "", stylistId: "", date: "", time: "" })}
                    style={{
                      padding: "22px 24px", textAlign: "left", cursor: "pointer",
                      background: sel ? "#0C0C0C" : "#FFF",
                      color: sel ? "#F5F1EA" : "#0C0C0C",
                      border: `1px solid ${sel ? "#0C0C0C" : "rgba(12,12,12,0.15)"}`,
                      transition: "all 0.2s",
                    }}>
                    <div style={{ fontFamily: "'Marcellus', serif", fontSize: 20, marginBottom: 6 }}>{s.name}</div>
                    <div style={{
                      display: "flex", justifyContent: "space-between",
                      fontSize: 12, opacity: 0.7, fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      <span>{s.dur} min</span>
                      <span>{s.note ? s.note + " " : ""}{fmtCOP(s.price)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ── STEP 2: Stylist ── */}
        {step === 2 && (
          <>
            <PMono style={{ color: "#C29E66" }}>02 — Tu estilista</PMono>
            <h1 style={{
              fontFamily: "'Marcellus', serif", fontSize: 52, fontWeight: 400,
              margin: "20px 0 12px", letterSpacing: "-0.01em", lineHeight: 1.05,
            }}>¿Con quién prefieres?</h1>
            <p style={{ fontSize: 14, color: "rgba(12,12,12,0.55)", marginBottom: 40, fontFamily: "'Outfit',sans-serif" }}>
              Servicio seleccionado: <strong>{form.service}</strong>
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* "Sin preferencia" always shown first */}
              {(() => {
                const sp = "Sin preferencia";
                const sel = form.stylist === sp;
                return (
                  <button key={sp}
                    onClick={() => setForm({ ...form, stylist: sp, stylistId: "", date: "", time: "" })}
                    style={{
                      padding: "20px 24px", textAlign: "left", cursor: "pointer",
                      background: sel ? "#0C0C0C" : "#FFF",
                      color: sel ? "#F5F1EA" : "#0C0C0C",
                      border: `2px dashed ${sel ? "#0C0C0C" : "rgba(12,12,12,0.2)"}`,
                      transition: "all 0.2s", display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                    <div>
                      <div style={{ fontFamily: "'Marcellus', serif", fontSize: 18 }}>Sin preferencia</div>
                      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                        Se asignará al profesional con mayor disponibilidad
                      </div>
                    </div>
                    {sel && <span style={{ fontSize: 20 }}>✓</span>}
                  </button>
                );
              })()}

              {eligibleEmployees.map(e => {
                const sel = form.stylistId === e.id;
                // Count today's appointments for this stylist (availability hint)
                const todayApts = (store.appointments || []).filter(
                  a => a.date === todayStr() && a.stylist === e.name && !["cancelled"].includes(a.status)
                ).length;
                const availSlots = availableDates.reduce((acc, d) =>
                  acc + slotsForDate(d).filter(t => !isSlotTaken(d, t, e.name, selectedDur)).length, 0
                );
                const todayFreeSlots = isClosedDay(todayStr())
                  ? 0
                  : slotsForDate(todayStr()).filter(t => !isSlotTaken(todayStr(), t, e.name, selectedDur)).length;
                return (
                  <button key={e.id}
                    onClick={() => setForm({ ...form, stylist: e.name, stylistId: e.id, date: "", time: "" })}
                    style={{
                      padding: "20px 24px", textAlign: "left", cursor: "pointer",
                      background: sel ? "#0C0C0C" : "#FFF",
                      color: sel ? "#F5F1EA" : "#0C0C0C",
                      border: `1px solid ${sel ? "#0C0C0C" : "rgba(12,12,12,0.2)"}`,
                      transition: "all 0.2s", display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                    <div>
                      <div style={{ fontFamily: "'Marcellus', serif", fontSize: 20 }}>{e.name}</div>
                      <div style={{
                        fontSize: 11, opacity: 0.6, marginTop: 4,
                        fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}>{e.role}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{
                        fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                        color: sel ? "rgba(245,241,234,0.7)" : availSlots > 0 ? "#2a7a50" : "rgba(12,12,12,0.4)",
                        letterSpacing: "0.08em",
                      }}>
                        {availSlots > 0 ? `${availSlots} turnos libres` : "Sin disponibilidad"}
                      </div>
                      <div style={{
                        fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                        color: sel
                          ? "rgba(245,241,234,0.5)"
                          : todayFreeSlots > 0 ? "#1a6e40" : "rgba(12,12,12,0.35)",
                        letterSpacing: "0.06em", marginTop: 3,
                      }}>
                        {todayFreeSlots > 0 ? `${todayFreeSlots} disponibles hoy` : "Sin turnos hoy"}
                      </div>
                    </div>
                  </button>
                );
              })}

              {eligibleEmployees.length === 0 && (
                <div style={{
                  padding: "24px", textAlign: "center",
                  border: "1px solid rgba(12,12,12,0.1)", color: "rgba(12,12,12,0.5)",
                  fontFamily: "'Outfit',sans-serif", fontSize: 14,
                }}>
                  No hay profesionales disponibles para este servicio en este momento.
                </div>
              )}
            </div>
          </>
        )}

        {/* ── STEP 3: Agenda (date + time) ── */}
        {step === 3 && (
          <>
            <PMono style={{ color: "#C29E66" }}>03 — Elige tu momento</PMono>
            <h1 style={{
              fontFamily: "'Marcellus', serif", fontSize: 52, fontWeight: 400,
              margin: "20px 0 12px", letterSpacing: "-0.01em", lineHeight: 1.05,
            }}>¿Cuándo te vemos?</h1>
            <p style={{ fontSize: 14, color: "rgba(12,12,12,0.55)", marginBottom: 36, fontFamily: "'Outfit',sans-serif" }}>
              {form.stylist !== "Sin preferencia" ? form.stylist : "Cualquier profesional"} · {form.service}
            </p>

            <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(160px, 1fr)", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
              {availableDates.map(date => {
                const isSelectedDate = form.date === date;
                return (
                  <div key={date} style={{
                    border: `1px solid ${isSelectedDate ? "#0C0C0C" : "rgba(12,12,12,0.15)"}`,
                    background: isSelectedDate ? "rgba(12,12,12,0.03)" : "#FFF",
                    transition: "border 0.2s",
                  }}>
                    {/* Date header */}
                    <div style={{
                      padding: "14px 16px", borderBottom: "1px solid rgba(12,12,12,0.1)",
                      background: isSelectedDate ? "#0C0C0C" : "transparent",
                      color: isSelectedDate ? "#F5F1EA" : "#0C0C0C",
                    }}>
                      <div style={{ fontFamily: "'Marcellus', serif", fontSize: 16 }}>
                        {fmtDateLabel(date)}
                      </div>
                      <div style={{
                        fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                        letterSpacing: "0.08em", textTransform: "uppercase",
                        opacity: 0.6, marginTop: 2,
                      }}>{fmtDateSub(date)}</div>
                    </div>

                    {/* Time slots */}
                    <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                      {slotsForDate(date).map(t => {
                        const blocked = isSlotTaken(date, t, form.stylist);
                        const isSelected = form.date === date && form.time === t;
                        return (
                          <button key={t}
                            disabled={blocked}
                            onClick={() => !blocked && setForm({ ...form, date, time: t })}
                            style={{
                              padding: "10px 8px",
                              fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                              background: isSelected ? "#C29E66"
                                : blocked ? "rgba(12,12,12,0.03)" : "#FFF",
                              color: isSelected ? "#0C0C0C"
                                : blocked ? "rgba(12,12,12,0.25)" : "#0C0C0C",
                              border: `1px solid ${isSelected ? "#C29E66"
                                : blocked ? "rgba(12,12,12,0.07)" : "rgba(12,12,12,0.15)"}`,
                              cursor: blocked ? "not-allowed" : "pointer",
                              textDecoration: blocked ? "line-through" : "none",
                              transition: "all 0.15s",
                              letterSpacing: "0.05em",
                            }}>
                            {blocked
                              ? <><span>{t}</span> <span style={{ fontSize: 9 }}>NO DISP.</span></>
                              : t
                            }
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {form.date && form.time && (
              <div style={{
                marginTop: 24, padding: "14px 20px",
                background: "#0C0C0C", color: "#F5F1EA",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <PMono style={{ color: "#C29E66", fontSize: 9, display: "block", marginBottom: 4 }}>
                    Turno seleccionado
                  </PMono>
                  <div style={{ fontFamily: "'Marcellus', serif", fontSize: 18 }}>
                    {fmtDateLabel(form.date)} · {form.time}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>{fmtDateSub(form.date)}</div>
                </div>
                <div style={{ fontSize: 28, color: "#C29E66" }}>✓</div>
              </div>
            )}

            {/* Lista de espera */}
            <div style={{ marginTop: 28, padding: "20px 24px", border: "1px dashed rgba(12,12,12,0.2)", background: "#FFF" }}>
              {wlSent ? (
                <div style={{ fontFamily: "'Outfit',sans-serif" }}>
                  <div style={{ fontFamily: "'Marcellus', serif", fontSize: 20, marginBottom: 6, color: "#0C0C0C" }}>
                    ¡Listo! Estás en la lista de espera ✓
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(12,12,12,0.6)" }}>
                    Te escribiremos por WhatsApp en cuanto se libere un cupo para tu {form.service || "servicio"}.
                  </div>
                </div>
              ) : !wlOpen ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontFamily: "'Marcellus', serif", fontSize: 18, color: "#0C0C0C" }}>
                      ¿No encuentras un horario que te sirva?
                    </div>
                    <div style={{ fontSize: 13, color: "rgba(12,12,12,0.55)", fontFamily: "'Outfit',sans-serif", marginTop: 4 }}>
                      Únete a la lista de espera y te avisamos cuando se libere un cupo.
                    </div>
                  </div>
                  <button onClick={() => { setWlForm({ name: form.name || "", phone: form.phone || "" }); setWlOpen(true); }} style={{
                    background: "#0C0C0C", color: "#F5F1EA", border: "none",
                    padding: "12px 20px", cursor: "pointer", whiteSpace: "nowrap",
                    fontFamily: "'Outfit', sans-serif", fontSize: 12,
                    letterSpacing: "0.15em", textTransform: "uppercase",
                  }}>Lista de espera →</button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 460 }}>
                  <PMono style={{ fontSize: 10, color: "rgba(12,12,12,0.5)" }}>Lista de espera · {form.service}</PMono>
                  <input value={wlForm.name} onChange={e => setWlForm({ ...wlForm, name: e.target.value })}
                    placeholder="Tu nombre" style={{
                      padding: "14px 16px", border: "1px solid rgba(12,12,12,0.2)", background: "#FFF",
                      fontFamily: "'Outfit', sans-serif", fontSize: 14, color: "#0C0C0C",
                    }} />
                  <input value={wlForm.phone} onChange={e => setWlForm({ ...wlForm, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    placeholder="WhatsApp (300 123 4567)" inputMode="tel" style={{
                      padding: "14px 16px", border: "1px solid rgba(12,12,12,0.2)", background: "#FFF",
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: "#0C0C0C",
                    }} />
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={submitWaitlist}
                      disabled={wlSending || wlForm.name.trim().length < 3 || wlForm.phone.replace(/\D/g, "").length < 7}
                      style={{
                        background: "#C29E66", color: "#0C0C0C", border: "none",
                        padding: "12px 22px", cursor: "pointer",
                        fontFamily: "'Outfit', sans-serif", fontSize: 12,
                        letterSpacing: "0.15em", textTransform: "uppercase",
                        opacity: (wlSending || wlForm.name.trim().length < 3 || wlForm.phone.replace(/\D/g, "").length < 7) ? 0.5 : 1,
                      }}>{wlSending ? "Enviando…" : "Unirme"}</button>
                    <button onClick={() => setWlOpen(false)} style={{
                      background: "transparent", color: "rgba(12,12,12,0.5)",
                      border: "1px solid rgba(12,12,12,0.2)", padding: "12px 20px", cursor: "pointer",
                      fontFamily: "'Outfit', sans-serif", fontSize: 12,
                      letterSpacing: "0.15em", textTransform: "uppercase",
                    }}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── STEP 4: Personal data ── */}
        {step === 4 && (
          <>
            <PMono style={{ color: "#C29E66" }}>04 — Tus datos</PMono>
            <h1 style={{
              fontFamily: "'Marcellus', serif", fontSize: 52, fontWeight: 400,
              margin: "20px 0 40px", letterSpacing: "-0.01em", lineHeight: 1.05,
            }}>Un último paso.</h1>
            <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 520 }}>
              <div>
                <label htmlFor="bk-name">
                  <PMono style={{ display: "block", marginBottom: 10, fontSize: 10 }}>Nombre completo</PMono>
                </label>
                <input id="bk-name" name="name" autoComplete="name" required
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="María Pérez"
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? "bk-name-err" : undefined}
                  style={{
                    width: "100%", padding: "18px 20px",
                    border: `1px solid ${errors.name ? "#C46666" : "rgba(12,12,12,0.2)"}`, background: "#FFF",
                    fontFamily: "'Outfit', sans-serif", fontSize: 15, color: "#0C0C0C",
                  }} />
                {errors.name && (
                  <div id="bk-name-err" role="alert" style={{ marginTop: 6, fontSize: 12, color: "#C46666" }}>
                    {errors.name}
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="bk-phone">
                  <PMono style={{ display: "block", marginBottom: 10, fontSize: 10 }}>WhatsApp</PMono>
                </label>
                <input id="bk-phone" name="tel" type="tel" autoComplete="tel" required
                  value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="300 123 4567" inputMode="tel"
                  aria-invalid={!!errors.phone}
                  aria-describedby={errors.phone ? "bk-phone-err" : undefined}
                  style={{
                    width: "100%", padding: "18px 20px",
                    border: `1px solid ${errors.phone ? "#C46666" : "rgba(12,12,12,0.2)"}`, background: "#FFF",
                    fontFamily: "'Outfit', sans-serif", fontSize: 15, color: "#0C0C0C",
                  }} />
                {errors.phone && (
                  <div id="bk-phone-err" role="alert" style={{ marginTop: 6, fontSize: 12, color: "#C46666" }}>
                    {errors.phone}
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="bk-cedula">
                  <PMono style={{ display: "block", marginBottom: 10, fontSize: 10 }}>Cédula de ciudadanía</PMono>
                </label>
                <input id="bk-cedula" name="cedula" required
                  value={form.cedula} onChange={e => setForm({ ...form, cedula: e.target.value.replace(/\D/g, "").slice(0, 12) })}
                  placeholder="1234567890" inputMode="numeric"
                  aria-invalid={!!errors.cedula}
                  aria-describedby={errors.cedula ? "bk-cedula-err" : "bk-cedula-hint"}
                  style={{
                    width: "100%", padding: "18px 20px",
                    border: `1px solid ${errors.cedula ? "#C46666" : "rgba(12,12,12,0.2)"}`, background: "#FFF",
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: "#0C0C0C",
                    letterSpacing: "0.08em",
                  }} />
                {errors.cedula ? (
                  <div id="bk-cedula-err" role="alert" style={{ marginTop: 6, fontSize: 12, color: "#C46666" }}>
                    {errors.cedula}
                  </div>
                ) : (
                  <div id="bk-cedula-hint" style={{ marginTop: 6, fontSize: 11, color: "rgba(12,12,12,0.45)", fontFamily: "'Outfit', sans-serif" }}>
                    Con tu cédula podrás consultar tu historial de visitas en cualquier momento.
                  </div>
                )}
              </div>

              {/* Summary card */}
              <div style={{ padding: 20, background: "#0C0C0C", color: "#F5F1EA" }}>
                <PMono style={{ color: "#C29E66", fontSize: 9, display: "block", marginBottom: 10 }}>
                  Resumen de tu cita
                </PMono>
                <div style={{ fontFamily: "'Marcellus', serif", fontSize: 22, lineHeight: 1.4 }}>{form.service}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, opacity: 0.7, marginTop: 6, letterSpacing: "0.05em" }}>
                  {fmtDateLabel(form.date)} {fmtDateSub(form.date)} · {form.time}
                </div>
                <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
                  {form.stylist}
                </div>
              </div>

              <div style={{
                padding: "16px 20px", background: "rgba(37,211,102,0.08)",
                border: "1px solid rgba(37,211,102,0.3)",
                display: "flex", gap: 12, alignItems: "flex-start",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, lineHeight: 1.6, color: "#0C0C0C" }}>
                  <strong>Importante:</strong> al finalizar deberás confirmar tu cita por WhatsApp.
                  Sin este paso, la reserva <strong>no quedará agendada</strong>.
                </div>
              </div>
            </div>
          </>
        )}

        {step === 5 && ticket && (
          <div style={{ maxWidth: 480, margin: "0 auto", padding: "8px 0 40px" }}>
            <PMono style={{ color: "#C29E66" }}>Solicitud recibida</PMono>
            <h1 style={{
              fontFamily: "'Marcellus', serif", fontSize: 44, fontWeight: 400,
              margin: "16px 0 8px", letterSpacing: "-0.01em", lineHeight: 1.1,
            }}>Casi listo, <em style={{ color: "#C29E66" }}>{ticket.name.split(" ")[0]}</em>.</h1>
            <p style={{ fontSize: 14, color: "rgba(12,12,12,0.55)", margin: "0 0 20px", lineHeight: 1.6 }}>
              Tu cita está guardada pero <strong>pendiente de confirmar</strong>.
            </p>

            {/* Countdown warning */}
            {secsLeft !== null && (
              <div style={{
                padding: "14px 18px", marginBottom: 24,
                background: secsLeft > 0 ? "rgba(196,102,102,0.07)" : "rgba(196,102,102,0.15)",
                border: `1px solid rgba(196,102,102,${secsLeft > 0 ? 0.35 : 0.6})`,
                display: "flex", alignItems: "center", gap: 14,
              }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 26, fontWeight: 700, letterSpacing: "0.05em",
                  color: secsLeft > 0 ? "#C46666" : "#C46666", flexShrink: 0,
                  minWidth: 64, textAlign: "center",
                }}>
                  {secsLeft > 0
                    ? `${String(Math.floor(secsLeft / 60)).padStart(2,"0")}:${String(secsLeft % 60).padStart(2,"0")}`
                    : "00:00"
                  }
                </div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, lineHeight: 1.5, color: "#0C0C0C" }}>
                  {secsLeft > 0
                    ? <>Tienes <strong>{Math.floor(secsLeft / 60)} min {secsLeft % 60} seg</strong> para enviar el comprobante. Pasado este tiempo, la reserva será cancelada automáticamente.</>
                    : <><strong>Tiempo agotado.</strong> Esta reserva ya no puede confirmarse. Si aún deseas tu cita, vuelve a agendar.</>
                  }
                </div>
              </div>
            )}

            {/* Resumen */}
            <div style={{
              padding: "20px", background: "#0C0C0C", color: "#F5F1EA", marginBottom: 24,
            }}>
              <PMono style={{ color: "#C29E66", fontSize: 9, display: "block", marginBottom: 12 }}>Resumen</PMono>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {[
                  ["Servicio", ticket.service],
                  ["Estilista", ticket.stylist],
                  ["Fecha", ticket.date],
                  ["Hora", ticket.time],
                ].map(([k, v]) => (
                  <div key={k}>
                    <PMono style={{ color: "rgba(245,241,234,0.4)", fontSize: 9, display: "block", marginBottom: 4 }}>{k}</PMono>
                    <div style={{ fontSize: 13 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {secsLeft > 0 && (
              <>
                {/* Abono */}
                <div style={{
                  padding: "20px 24px", marginBottom: 28,
                  background: "rgba(194,158,102,0.07)",
                  border: "1px solid rgba(194,158,102,0.4)",
                }}>
                  <PMono style={{ color: "#C29E66", fontSize: 10, display: "block", marginBottom: 10 }}>
                    Para confirmar tu cita
                  </PMono>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "#0C0C0C" }}>
                    Realiza un abono de <strong>$10.000</strong> y envía el comprobante por WhatsApp.
                    El estilista confirmará tu cita al recibirlo.
                  </p>
                  <div style={{ margin: "16px 0 0", paddingTop: 14, borderTop: "1px solid rgba(194,158,102,0.35)" }}>
                    <PMono style={{ color: "#C29E66", fontSize: 9, display: "block", marginBottom: 8 }}>
                      Datos para el abono
                    </PMono>
                    <div style={{ fontSize: 13, lineHeight: 1.9, color: "#0C0C0C" }}>
                      <div>Llave <strong>@3124499862</strong></div>
                      <div>Nequi o DaviPlata <strong>3124499862</strong></div>
                      <div>Cuenta ahorros Davivienda <strong>488414015989</strong></div>
                    </div>
                  </div>
                </div>

                {/* Botón WhatsApp */}
                <a
                  href={`https://wa.me/${waAdminRaw}?text=${encodeURIComponent(
                    `Hola, quiero confirmar mi cita 🗓️\n\nNombre: ${ticket.name}\nServicio: ${ticket.service}\nFecha: ${ticket.date} a las ${ticket.time}\nEstilista: ${ticket.stylist}\nCódigo: ${ticket.code}\n\nAdjunto comprobante de abono de $10.000 a Nequi/DaviPlata 3124499862.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                    background: "#25D366", color: "#FFF", textDecoration: "none",
                    padding: "18px 24px", width: "100%", boxSizing: "border-box",
                    fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 500,
                    letterSpacing: "0.05em",
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Enviar comprobante
                </a>
                <p style={{ margin: "12px 0 0", fontSize: 12, color: "rgba(12,12,12,0.4)", textAlign: "center" }}>
                  Se abrirá WhatsApp con el mensaje listo — solo adjunta el comprobante y envía.
                </p>
                <p style={{ margin: "10px 0 0", fontSize: 12, color: "rgba(12,12,12,0.45)", textAlign: "center", lineHeight: 1.6 }}>
                  ¿No puedes abrir el botón? Envía el comprobante directamente a{" "}
                  <strong style={{ color: "#0C0C0C", letterSpacing: "0.03em" }}>{waAdminFormatted}</strong>
                  {" "}por WhatsApp.
                </p>
              </>
            )}

            {/* Volver al inicio */}
            <a href="Asesores de Imagen.html" style={{
              display: "block", textAlign: "center", marginTop: 32,
              padding: "14px 0",
              border: "1px solid rgba(12,12,12,0.15)",
              color: "rgba(12,12,12,0.55)", textDecoration: "none",
              fontFamily: "'Outfit', sans-serif", fontSize: 12,
              letterSpacing: "0.18em", textTransform: "uppercase",
              transition: "border-color 0.2s, color 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#0C0C0C"; e.currentTarget.style.color = "#0C0C0C"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(12,12,12,0.15)"; e.currentTarget.style.color = "rgba(12,12,12,0.55)"; }}
            >← Volver al sitio</a>
          </div>
        )}

        {step < 5 && (
          <div>
            {bookError && (
              <div role="alert" style={{
                marginTop: 24, padding: "12px 16px",
                background: "rgba(180,30,30,0.08)", border: "1px solid rgba(180,30,30,0.35)",
                color: "#8A1A1A", fontSize: 13, fontFamily: "'Outfit', sans-serif",
                letterSpacing: "0.02em",
              }}>{bookError}</div>
            )}
            <div style={{
              display: "flex", justifyContent: "space-between", marginTop: 48,
            }}>
              <button onClick={() => { if (step > 1) { setBookError(""); setStep(step - 1); } }} style={{
                background: "transparent", border: "none", cursor: step > 1 ? "pointer" : "default",
                fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
                opacity: step > 1 ? 0.7 : 0.3, padding: "18px 0", color: "#0C0C0C",
                fontFamily: "'Outfit', sans-serif",
              }}>← Atrás</button>
              <button disabled={!canNext || submitting} onClick={() => step === TOTAL_STEPS ? submit() : setStep(step + 1)} style={{
                background: (canNext && !submitting) ? "#0C0C0C" : "rgba(12,12,12,0.2)",
                color: "#F5F1EA", border: "none",
                padding: "18px 36px", cursor: (canNext && !submitting) ? "pointer" : "not-allowed",
                fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
                fontFamily: "'Outfit', sans-serif",
              }}>{step === TOTAL_STEPS ? (submitting ? "Agendando…" : "Confirmar reserva") : "Continuar →"}</button>
            </div>
          </div>
        )}
      </main>
    </PortalShell>
  );
};

// ============================================================
// PAGE 2 — ESCANEAR QR (RECEPCIÓN)
// Uses the real camera via getUserMedia + jsQR (loaded as a global in Scan.html)
// ============================================================
const ScanPortal = () => {
  const [store, setStore] = useStore();
  const [scanned, setScanned] = React.useState(null);
  const [error, setError] = React.useState("");
  const [camStatus, setCamStatus] = React.useState("idle"); // idle | requesting | active | denied | unsupported
  const videoRef  = React.useRef(null);
  const canvasRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const rafRef    = React.useRef(0);

  const lookupAppt = (id) => {
    const s = loadCache();
    const appt = s.appointments.find(a => a.id === id);
    if (!appt) return { error: "Ticket no encontrado. Verifica tu QR." };
    if (s.active.find(a => a.id === id) || s.completed.find(a => a.id === id)) {
      return { error: "Este turno ya fue activado." };
    }
    return { appt };
  };

  const handleScan = React.useCallback((id) => {
    const r = lookupAppt(id);
    if (r.error) { setError(r.error); return; }
    setError("");
    setScanned(r.appt);
    stopCamera();
  }, []);

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    const s = streamRef.current;
    if (s) { s.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startCamera = React.useCallback(async () => {
    if (typeof window.jsQR !== "function") {
      setCamStatus("unsupported");
      setError("La biblioteca de escaneo no cargó. Usa la lista de abajo o recarga.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamStatus("unsupported");
      setError("Tu navegador no soporta acceso a cámara. Usa la lista de abajo.");
      return;
    }
    setCamStatus("requesting");
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } }, audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach(t => t.stop()); return; }
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();
      setCamStatus("active");
      tick();
    } catch (err) {
      console.warn("[scan] camera denied/failed", err.name, err.message);
      setCamStatus("denied");
      setError(err.name === "NotAllowedError"
        ? "Permiso de cámara denegado. Usa la lista de abajo o habilítala en el navegador."
        : "No se pudo abrir la cámara. Usa la lista de abajo.");
    }
  }, []);

  const tick = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const w = video.videoWidth, h = video.videoHeight;
      if (w && h) {
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const code = window.jsQR(imageData.data, w, h, { inversionAttempts: "dontInvert" });
        if (code?.data) {
          handleScan(code.data);
          return;
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  // Auto-detect from hash (QR may also be opened as a deep link)
  React.useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) handleScan(id);
  }, [handleScan]);

  // Start camera on mount; cleanup on unmount
  React.useEffect(() => {
    startCamera();
    return stopCamera;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rescan = () => {
    setScanned(null);
    setError("");
    startCamera();
  };

  const activateTurn = () => {
    setStore(s => ({
      ...s,
      active: [...s.active, { ...scanned, activatedAt: Date.now(), status: "waiting", position: s.active.length + 1 }],
    }));
    setScanned({ ...scanned, activated: true });
  };

  const recent = store.appointments.filter(a =>
    a.date === todayStr() &&
    !["cancelled"].includes(a.status) &&
    !store.active.find(x => x.id === a.id) && !store.completed.find(x => x.id === a.id)
  ).slice(-5).reverse();

  return (
    <PortalShell tone="noir" header={
      <PortalHeader
        subtitle="Recepción · Escaneo"
        title="Activa tu turno"
        right={
          <a href="Portal.html" style={{
            textDecoration: "none", color: "#F5F1EA",
            fontFamily: "'Outfit', sans-serif", fontSize: 12,
            letterSpacing: "0.15em", textTransform: "uppercase",
            opacity: 0.7,
          }}>← Inicio</a>
        }
      />
    }>
      <main style={{
        flex: 1, padding: "40px", maxWidth: 980,
        margin: "0 auto", width: "100%",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48,
          alignItems: "start",
        }} className="scan-grid">
          {/* Scanner */}
          <div>
            <PMono style={{ color: "#C29E66" }}>Escáner</PMono>
            <h2 style={{
              fontFamily: "'Marcellus', serif", fontSize: 40, fontWeight: 400,
              margin: "16px 0 24px", lineHeight: 1.1, letterSpacing: "-0.01em",
            }}>Apunta al QR.</h2>

            <div style={{
              position: "relative", aspectRatio: "1", background: "#141212",
              border: "1px solid rgba(245,241,234,0.15)", overflow: "hidden",
            }}>
              {/* Real camera feed */}
              <video ref={videoRef} muted playsInline
                style={{
                  position: "absolute", inset: 0,
                  width: "100%", height: "100%",
                  objectFit: "cover",
                  display: camStatus === "active" ? "block" : "none",
                }}
              />
              <canvas ref={canvasRef} style={{ display: "none" }} />

              {/* Fallback background when no camera */}
              {camStatus !== "active" && (
                <div style={{
                  position: "absolute", inset: 0,
                  background: "radial-gradient(circle at 30% 40%, rgba(194,158,102,0.08), transparent 50%), repeating-linear-gradient(180deg, rgba(245,241,234,0.02) 0 2px, transparent 2px 4px)",
                }} />
              )}
              {/* Corner brackets */}
              {[
                { top: 24, left: 24, borderTop: "2px solid #C29E66", borderLeft: "2px solid #C29E66" },
                { top: 24, right: 24, borderTop: "2px solid #C29E66", borderRight: "2px solid #C29E66" },
                { bottom: 24, left: 24, borderBottom: "2px solid #C29E66", borderLeft: "2px solid #C29E66" },
                { bottom: 24, right: 24, borderBottom: "2px solid #C29E66", borderRight: "2px solid #C29E66" },
              ].map((s, i) => (
                <div key={i} style={{ position: "absolute", width: 32, height: 32, pointerEvents: "none", ...s }} />
              ))}

              {/* Status indicator */}
              <div style={{
                position: "absolute", top: 16, left: 16, display: "flex",
                alignItems: "center", gap: 8, padding: "4px 10px",
                background: "rgba(12,12,12,0.55)", backdropFilter: "blur(6px)",
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: camStatus === "active" ? "#66C499" : "#C46666",
                  animation: camStatus === "active" ? "pulse 2s ease-in-out infinite" : "none",
                }} />
                <PMono style={{ color: camStatus === "active" ? "#66C499" : "#C46666", fontSize: 9 }}>
                  {camStatus === "active"   ? "Cámara activa" :
                   camStatus === "requesting" ? "Solicitando…" :
                   camStatus === "denied"   ? "Sin acceso" :
                   camStatus === "unsupported" ? "No disponible" :
                   "Cámara apagada"}
                </PMono>
              </div>

              {camStatus !== "active" && (
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  textAlign: "center", padding: 24, gap: 14,
                }}>
                  <div style={{ fontSize: 36, opacity: 0.4 }}>⊡</div>
                  <PMono style={{ color: "rgba(245,241,234,0.6)", fontSize: 10, maxWidth: 240, lineHeight: 1.6 }}>
                    {camStatus === "denied" || camStatus === "unsupported"
                      ? "Usa la lista de reservas de hoy"
                      : "Permite el acceso a la cámara para escanear"}
                  </PMono>
                  {(camStatus === "denied" || camStatus === "idle") && (
                    <button onClick={startCamera}
                      style={{
                        marginTop: 4, padding: "10px 18px",
                        background: "#C29E66", color: "#0C0C0C", border: "none",
                        fontFamily: "'Outfit', sans-serif", fontSize: 11,
                        letterSpacing: "0.15em", textTransform: "uppercase", cursor: "pointer",
                      }}>
                      Activar cámara
                    </button>
                  )}
                </div>
              )}

              {camStatus === "active" && (
                <div style={{
                  position: "absolute", bottom: 24, left: 0, right: 0,
                  textAlign: "center", pointerEvents: "none",
                }}>
                  <PMono style={{
                    color: "#F5F1EA", fontSize: 9,
                    background: "rgba(12,12,12,0.55)", padding: "4px 10px",
                    backdropFilter: "blur(6px)",
                  }}>
                    Centra el QR dentro del marco
                  </PMono>
                </div>
              )}
            </div>

            {error && (
              <div role="alert" style={{
                marginTop: 16, padding: 14,
                background: "rgba(200,80,80,0.1)", border: "1px solid rgba(200,80,80,0.3)",
                fontSize: 13,
              }}>{error}</div>
            )}

            <div style={{ marginTop: 24 }}>
              <PMono style={{ color: "rgba(245,241,234,0.5)", fontSize: 9, display: "block", marginBottom: 10 }}>
                Reservas de hoy · activar manualmente
              </PMono>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {recent.length === 0 && (
                  <div style={{ fontSize: 12, opacity: 0.5, padding: 12, border: "1px dashed rgba(245,241,234,0.15)" }}>
                    No hay reservas pendientes. Agenda una primero desde el Portal.
                  </div>
                )}
                {recent.map(a => (
                  <button key={a.id} onClick={() => handleScan(a.id)} style={{
                    padding: "12px 14px", textAlign: "left",
                    background: "rgba(245,241,234,0.04)",
                    border: "1px solid rgba(245,241,234,0.1)",
                    color: "#F5F1EA", cursor: "pointer",
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span>{a.code} · {a.name}</span>
                    <span style={{ color: "#C29E66" }}>escanear →</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Result */}
          <div style={{
            padding: 32, background: "#141212",
            border: "1px solid rgba(245,241,234,0.1)", minHeight: 460,
            display: "flex", flexDirection: "column",
          }}>
            {!scanned && (
              <div style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", textAlign: "center",
                opacity: 0.4,
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>⊡</div>
                <PMono>Esperando escaneo</PMono>
              </div>
            )}
            {scanned && !scanned.activated && (
              <>
                <PMono style={{ color: "#C29E66" }}>✓ QR válido</PMono>
                <div style={{
                  fontFamily: "'Marcellus', serif", fontSize: 36, fontWeight: 400,
                  margin: "16px 0 4px", letterSpacing: "-0.01em",
                }}>{scanned.name}</div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 14,
                  color: "#C29E66", letterSpacing: "0.15em", marginBottom: 24,
                }}>{scanned.code}</div>
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20,
                  padding: "20px 0", borderTop: "1px solid rgba(245,241,234,0.1)",
                  borderBottom: "1px solid rgba(245,241,234,0.1)", marginBottom: 24,
                }}>
                  <div>
                    <PMono style={{ color: "rgba(245,241,234,0.5)", fontSize: 9, display: "block", marginBottom: 6 }}>Servicio</PMono>
                    <div style={{ fontSize: 14 }}>{scanned.service}</div>
                  </div>
                  <div>
                    <PMono style={{ color: "rgba(245,241,234,0.5)", fontSize: 9, display: "block", marginBottom: 6 }}>Estilista</PMono>
                    <div style={{ fontSize: 14 }}>{scanned.stylist}</div>
                  </div>
                  <div>
                    <PMono style={{ color: "rgba(245,241,234,0.5)", fontSize: 9, display: "block", marginBottom: 6 }}>Agendado</PMono>
                    <div style={{ fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>
                      {scanned.date} · {scanned.time}
                    </div>
                  </div>
                  <div>
                    <PMono style={{ color: "rgba(245,241,234,0.5)", fontSize: 9, display: "block", marginBottom: 6 }}>Contacto</PMono>
                    <div style={{ fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>{scanned.phone}</div>
                  </div>
                </div>
                <button onClick={activateTurn} style={{
                  background: "#C29E66", color: "#0C0C0C", border: "none",
                  padding: "18px 24px", fontSize: 12, letterSpacing: "0.2em",
                  textTransform: "uppercase", cursor: "pointer", fontWeight: 500,
                  marginTop: "auto", fontFamily: "'Outfit', sans-serif",
                }}>Activar turno →</button>
              </>
            )}
            {scanned && scanned.activated && (
              <>
                <div style={{ textAlign: "center", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: "50%", background: "#C29E66",
                    color: "#0C0C0C", margin: "0 auto 20px", display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 28,
                  }}>✓</div>
                  <div style={{
                    fontFamily: "'Marcellus', serif", fontSize: 36, marginBottom: 8,
                  }}>Turno activo</div>
                  <p style={{
                    fontSize: 14, opacity: 0.7, maxWidth: 300, margin: "0 auto 28px",
                    lineHeight: 1.5,
                  }}>
                    {scanned.name}, toma asiento. Tu nombre aparecerá en la pantalla
                    de sala cuando sea tu turno.
                  </p>
                  <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                    <button onClick={rescan} style={{
                      color: "#0C0C0C", background: "#C29E66", border: "none",
                      fontFamily: "'Outfit', sans-serif", fontSize: 12,
                      letterSpacing: "0.2em", textTransform: "uppercase",
                      padding: "14px 20px", cursor: "pointer",
                    }}>Escanear otro →</button>
                    <a href="Lobby.html" style={{
                      color: "#C29E66", textDecoration: "none",
                      fontFamily: "'Outfit', sans-serif", fontSize: 12,
                      letterSpacing: "0.2em", textTransform: "uppercase",
                      padding: "14px 20px", border: "1px solid #C29E66",
                      display: "inline-block",
                    }}>Ver sala →</a>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </PortalShell>
  );
};

// ============================================================
// PAGE 3 — LOBBY (pantalla grande con cola)
// ============================================================
const LobbyPortal = () => {
  const [store, setStore] = useStore();
  const [now, setNow] = React.useState(new Date());
  const dlg = useDialog();
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const inChair = store.active.find(a => a.status === "in-service");
  const queue = store.active.filter(a => a.status === "waiting");

  const callNext = () => {
    const next = queue[0];
    if (!next) return;
    setStore(s => {
      const updated = s.active.map(a => {
        if (a.id === next.id) return { ...a, status: "in-service", startedAt: Date.now() };
        return a;
      });
      // move previous in-chair to completed
      const prevChair = s.active.find(a => a.status === "in-service");
      const completed = prevChair
        ? [...s.completed, { ...prevChair, completedAt: Date.now() }]
        : s.completed;
      const remaining = updated.filter(a => a.id !== (prevChair ? prevChair.id : null));
      return { ...s, active: remaining, completed };
    });
  };

  const reset = async () => {
    const ok = await dlg.confirm({
      title: "¿Limpiar la sala?",
      body: "Esto borra todos los turnos activos y completados de hoy. Las citas agendadas no se ven afectadas.",
      confirmLabel: "Limpiar",
      danger: true,
    });
    if (ok) setStore(s => ({ ...s, active: [], completed: [] }));
  };

  const timeStr = now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

  return (
    <PortalShell tone="noir" header={
      <PortalHeader
        subtitle="Pantalla de sala"
        title="Cola en vivo"
        right={
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <PMono style={{
              color: "#C29E66", fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14, letterSpacing: "0.2em",
            }}>{timeStr}</PMono>
            <button onClick={callNext} disabled={!queue.length} style={{
              background: queue.length ? "#C29E66" : "rgba(194,158,102,0.2)",
              color: "#0C0C0C", border: "none", padding: "10px 18px",
              fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase",
              cursor: queue.length ? "pointer" : "not-allowed",
              fontFamily: "'Outfit', sans-serif",
            }}>Llamar siguiente →</button>
            <button onClick={reset} style={{
              background: "transparent", color: "#F5F1EA",
              border: "1px solid rgba(245,241,234,0.2)", padding: "10px 14px",
              fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase",
              cursor: "pointer", fontFamily: "'Outfit', sans-serif",
            }}>Reset</button>
            <a href="Portal.html" style={{
              color: "#F5F1EA", textDecoration: "none", fontSize: 12,
              letterSpacing: "0.15em", textTransform: "uppercase", opacity: 0.6,
            }}>Inicio</a>
          </div>
        }
      />
    }>
      <main style={{
        flex: 1, padding: "48px 40px", maxWidth: 1400,
        margin: "0 auto", width: "100%",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 48,
        }} className="lobby-grid">
          {/* Now serving */}
          <div>
            <PMono style={{ color: "#C29E66" }}>Atendiendo</PMono>
            {inChair ? (
              <div style={{ marginTop: 20 }}>
                <div style={{
                  fontFamily: "'Marcellus', serif", fontSize: "clamp(48px, 7vw, 96px)",
                  lineHeight: 1, letterSpacing: "-0.02em", fontWeight: 400,
                }}>
                  {inChair.name}
                </div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 16,
                  color: "#C29E66", letterSpacing: "0.3em", marginTop: 16,
                }}>{inChair.code}</div>
                <div style={{
                  marginTop: 40, paddingTop: 32,
                  borderTop: "1px solid rgba(245,241,234,0.15)",
                  display: "flex", gap: 48, flexWrap: "wrap",
                }}>
                  <div>
                    <PMono style={{ color: "rgba(245,241,234,0.5)", fontSize: 10, display: "block", marginBottom: 8 }}>
                      Servicio
                    </PMono>
                    <div style={{ fontFamily: "'Marcellus', serif", fontSize: 26 }}>
                      {inChair.service}
                    </div>
                  </div>
                  <div>
                    <PMono style={{ color: "rgba(245,241,234,0.5)", fontSize: 10, display: "block", marginBottom: 8 }}>
                      Estilista
                    </PMono>
                    <div style={{ fontFamily: "'Marcellus', serif", fontSize: 26 }}>
                      {inChair.stylist}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{
                marginTop: 20, padding: 48,
                border: "1px dashed rgba(245,241,234,0.15)",
                textAlign: "center", opacity: 0.5,
              }}>
                <div style={{
                  fontFamily: "'Marcellus', serif", fontSize: 40, marginBottom: 8,
                }}>—</div>
                <PMono style={{ fontSize: 10 }}>Nadie en silla</PMono>
                {queue.length > 0 && (
                  <button onClick={callNext} style={{
                    marginTop: 20, background: "#C29E66", color: "#0C0C0C",
                    border: "none", padding: "14px 22px",
                    fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase",
                    cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                  }}>Llamar a {queue[0].name.split(" ")[0]} →</button>
                )}
              </div>
            )}
          </div>

          {/* Queue */}
          <div>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
            }}>
              <PMono style={{ color: "#C29E66" }}>En espera</PMono>
              <PMono style={{ color: "rgba(245,241,234,0.5)", fontSize: 10 }}>
                {queue.length} {queue.length === 1 ? "persona" : "personas"}
              </PMono>
            </div>
            <div style={{
              marginTop: 20, display: "flex", flexDirection: "column",
            }}>
              {queue.length === 0 && (
                <div style={{
                  padding: "40px 20px", textAlign: "center", opacity: 0.4,
                  border: "1px dashed rgba(245,241,234,0.15)",
                }}>
                  <PMono style={{ fontSize: 10 }}>Cola vacía</PMono>
                </div>
              )}
              {queue.map((a, i) => (
                <div key={a.id} style={{
                  display: "grid",
                  gridTemplateColumns: "40px 1fr auto",
                  gap: 20, padding: "20px 4px",
                  borderBottom: "1px solid rgba(245,241,234,0.1)",
                  alignItems: "center",
                  opacity: i === 0 ? 1 : 0.7 - (i * 0.1),
                }}>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                    color: "#C29E66", letterSpacing: "0.1em",
                  }}>
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <div style={{
                      fontFamily: "'Marcellus', serif", fontSize: 22,
                      letterSpacing: "-0.005em",
                    }}>{a.name}</div>
                    <div style={{
                      fontSize: 12, opacity: 0.6, marginTop: 2,
                      fontFamily: "'Outfit', sans-serif",
                    }}>{a.service} · {a.stylist}</div>
                  </div>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                    color: "#C29E66", letterSpacing: "0.15em",
                  }}>{a.code}</div>
                </div>
              ))}
            </div>

            {store.completed.length > 0 && (
              <div style={{ marginTop: 40 }}>
                <PMono style={{ color: "rgba(245,241,234,0.4)", fontSize: 9 }}>
                  Completados hoy · {store.completed.length}
                </PMono>
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                  {store.completed.slice(-3).reverse().map(a => (
                    <div key={a.id} style={{
                      display: "flex", justifyContent: "space-between",
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                      opacity: 0.4, padding: "6px 0",
                    }}>
                      <span>{a.code} · {a.name}</span>
                      <span>✓</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      {dlg.node}
    </PortalShell>
  );
};

// ============================================================
// PAGE 4 — MI CUENTA (cliente)
// ============================================================
const ACCT_KEY = "joxe_cuenta_cedula";

const CuentaPortal = () => {
  const [cedula,   setCedula]   = React.useState(() => localStorage.getItem(ACCT_KEY) || "");
  const [input,    setInput]    = React.useState("");
  const [data,     setData]     = React.useState(null);
  const [loading,  setLoading]  = React.useState(false);
  const [error,    setError]    = React.useState("");
  const [showQR,   setShowQR]   = React.useState(null);

  const fetchData = React.useCallback(async (cc, silent = false) => {
    try {
      const res = await fetch(`/api/client?cedula=${encodeURIComponent(cc)}`);
      if (!res.ok) throw new Error("error");
      const d = await res.json();
      setData(d);
    } catch {
      if (!silent) setError("No pudimos conectarnos. Intenta de nuevo.");
    }
  }, []);

  // Auto-load + live poll
  React.useEffect(() => {
    const saved = localStorage.getItem(ACCT_KEY);
    if (saved) { setCedula(saved); fetchData(saved, true); }
  }, [fetchData]);

  React.useEffect(() => {
    if (!cedula) return;
    const t = setInterval(() => fetchData(cedula, true), 8000);
    return () => clearInterval(t);
  }, [cedula, fetchData]);

  const login = async () => {
    const clean = input.replace(/\D/g, "");
    if (clean.length < 6) { setError("Ingresa una cédula válida."); return; }
    setLoading(true); setError("");
    await fetchData(clean);
    setCedula(clean);
    localStorage.setItem(ACCT_KEY, clean);
    setLoading(false);
  };

  const logout = () => {
    setCedula(""); setData(null); setInput(""); localStorage.removeItem(ACCT_KEY);
  };

  const todayStr  = (() => { const d = nowCOT(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })();
  const fmtDate   = d => !d ? "—" : new Date(d + "T12:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  const fmtShort  = d => !d ? "—" : new Date(d + "T12:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });

  const STATUS = {
    scheduled:   { label: "Agendada",      color: "#C29E66",              bg: "rgba(194,158,102,0.1)"  },
    waiting:     { label: "En sala",        color: "#8ab0ff",              bg: "rgba(138,176,255,0.1)"  },
    "in-service":{ label: "¡En silla!",    color: "#66C499",              bg: "rgba(102,196,153,0.15)" },
    completed:   { label: "Completada",     color: "rgba(245,241,234,0.4)", bg: "rgba(245,241,234,0.05)"},
    cancelled:   { label: "Cancelada",      color: "#C46666",              bg: "rgba(196,102,102,0.1)"  },
  };

  // ── Self-service: cancelar / reagendar ────────────────────
  const dialog = useDialog();
  const [busyId, setBusyId] = React.useState(null);
  const selfService = data?.selfService || { allowCancel: true, minHoursBefore: 2 };
  const waNumber = (data?.waNumber || "").replace(/\D/g, "") || "573124499862";

  const waReschedule = (a) => {
    const msg = [
      `Hola 👋 Quiero *reagendar* mi cita:`,
      `✂️ ${a.service}${a.stylist ? ` con ${a.stylist}` : ""}`,
      `📅 ${a.date} a las ${a.time}`,
      a.code ? `Código: ${a.code}` : "",
      ``,
      `¿Qué otros horarios tienen disponibles?`,
    ].filter(Boolean).join("\n");
    return `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
  };

  const cancelAppt = async (a) => {
    const ok = await dialog.confirm({
      title: "Cancelar cita",
      body: `¿Seguro que quieres cancelar tu cita de ${a.service} el ${fmtDate(a.date)}${a.time ? ` a las ${a.time}` : ""}?`,
      confirmLabel: "Sí, cancelar", cancelLabel: "No", danger: true,
    });
    if (!ok) return;
    setBusyId(a.id);
    try {
      const res = await fetch("/api/client", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, cedula, action: "cancel" }),
      });
      if (res.status === 409) {
        const d = await res.json().catch(() => ({}));
        await dialog.alert({
          title: "No se puede cancelar en línea",
          body: `Faltan menos de ${d.minHours || selfService.minHoursBefore} horas para tu cita. Escríbenos por WhatsApp para coordinar la cancelación.`,
        });
      } else if (!res.ok) {
        await dialog.alert({ title: "Error", body: "No pudimos cancelar la cita. Intenta de nuevo." });
      } else {
        await fetchData(cedula, true);
      }
    } catch {
      await dialog.alert({ title: "Sin conexión", body: "No pudimos conectarnos. Intenta de nuevo." });
    } finally {
      setBusyId(null);
    }
  };

  // ── LOGIN SCREEN ──────────────────────────────────────────
  if (!cedula || !data) {
    return (
      <PortalShell tone="noir" header={
        <PortalHeader subtitle="Portal · Cliente" title="Mi Cuenta"
          right={
            <a href="Asesores de Imagen.html" style={{
              color: "#F5F1EA", textDecoration: "none", fontSize: 12,
              letterSpacing: "0.15em", textTransform: "uppercase", opacity: 0.6,
            }}>← Inicio</a>
          }
        />
      }>
        <main style={{
          flex: 1, display: "flex", alignItems: "center",
          justifyContent: "center", padding: "48px 20px",
        }}>
          <div style={{ width: "100%", maxWidth: 440 }}>
            <PMono style={{ color: "#C29E66" }}>Tu espacio personal</PMono>
            <h1 style={{
              fontFamily: "'Marcellus', serif", fontSize: "clamp(36px, 7vw, 52px)",
              fontWeight: 400, margin: "16px 0 12px",
              letterSpacing: "-0.01em", lineHeight: 1.1,
            }}>Consulta tus visitas.</h1>
            <p style={{ fontSize: 15, opacity: 0.6, lineHeight: 1.6, marginBottom: 40 }}>
              Ingresa tu cédula de ciudadanía para ver tus citas, historial de visitas y puntos de lealtad.
            </p>

            <div style={{
              background: "#141212", border: "1px solid rgba(245,241,234,0.1)", padding: 32,
            }}>
              <label htmlFor="cuenta-cedula">
                <PMono style={{ fontSize: 9, color: "rgba(245,241,234,0.5)", display: "block", marginBottom: 10 }}>
                  Cédula de ciudadanía
                </PMono>
              </label>
              <input id="cuenta-cedula" name="cedula" autoComplete="off"
                value={input}
                onChange={e => { setInput(e.target.value.replace(/\D/g, "")); setError(""); }}
                onKeyDown={e => e.key === "Enter" && login()}
                placeholder="1234567890"
                inputMode="numeric"
                aria-invalid={!!error}
                aria-describedby={error ? "cuenta-cedula-err" : undefined}
                style={{
                  width: "100%", padding: "18px 20px",
                  background: "#0C0C0C", border: "1px solid rgba(245,241,234,0.15)",
                  color: "#F5F1EA", fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 16, letterSpacing: "0.1em",
                }}
              />
              {error && (
                <div id="cuenta-cedula-err" role="alert" style={{ marginTop: 10, fontSize: 12, color: "#C46666" }}>{error}</div>
              )}
              <button
                onClick={login}
                disabled={loading || input.length < 6}
                style={{
                  width: "100%", marginTop: 16, padding: "18px",
                  background: loading || input.length < 6 ? "rgba(194,158,102,0.2)" : "#C29E66",
                  color: "#0C0C0C", border: "none",
                  fontFamily: "'Outfit', sans-serif", fontSize: 12,
                  letterSpacing: "0.2em", textTransform: "uppercase",
                  cursor: loading || input.length < 6 ? "not-allowed" : "pointer",
                }}>
                {loading ? "Buscando…" : "Ver mis visitas →"}
              </button>
            </div>

            <div style={{ marginTop: 24, textAlign: "center" }}>
              <a href="Booking.html" style={{
                color: "rgba(245,241,234,0.4)", textDecoration: "none",
                fontFamily: "'Outfit', sans-serif", fontSize: 12,
                letterSpacing: "0.15em", textTransform: "uppercase",
              }}>¿Primera vez? Reservar cita →</a>
            </div>
          </div>
        </main>
      </PortalShell>
    );
  }

  // ── ACCOUNT SCREEN ────────────────────────────────────────
  const appts  = data.appointments || [];
  const loyalty = data.loyalty;

  const clientName = appts.length > 0
    ? appts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0]?.name || ""
    : "";

  const upcoming = appts
    .filter(a => !["cancelled","completed"].includes(a.computedStatus)
      && (a.date >= todayStr || a.computedStatus === "waiting" || a.computedStatus === "in-service"))
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.time || "").localeCompare(b.time || ""));

  const history = appts
    .filter(a => ["completed","cancelled"].includes(a.computedStatus))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const liveAppt = appts.find(a => a.computedStatus === "waiting" || a.computedStatus === "in-service");

  return (
    <PortalShell tone="noir" header={
      <PortalHeader
        subtitle="Mi Cuenta · JOXE"
        title={clientName ? clientName.split(" ")[0] : "Mi Cuenta"}
        right={
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <a href="Booking.html" style={{
              color: "#C29E66", textDecoration: "none", fontSize: 11,
              letterSpacing: "0.15em", textTransform: "uppercase",
              padding: "8px 14px", border: "1px solid rgba(194,158,102,0.4)",
            }}>+ Nueva cita</a>
            <button onClick={logout} style={{
              background: "transparent", border: "none",
              color: "rgba(245,241,234,0.4)", cursor: "pointer",
              fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase",
              fontFamily: "'Outfit', sans-serif",
            }}>Salir</button>
          </div>
        }
      />
    }>
      <main style={{
        flex: 1, padding: "40px", maxWidth: 900,
        margin: "0 auto", width: "100%",
        display: "flex", flexDirection: "column", gap: 40,
      }}>

        {/* Live status banner */}
        {liveAppt && (
          <div style={{
            padding: "20px 28px",
            background: liveAppt.computedStatus === "in-service"
              ? "rgba(102,196,153,0.07)" : "rgba(138,176,255,0.06)",
            border: `1px solid ${liveAppt.computedStatus === "in-service"
              ? "rgba(102,196,153,0.35)" : "rgba(138,176,255,0.3)"}`,
            display: "flex", justifyContent: "space-between",
            alignItems: "center", gap: 20, flexWrap: "wrap",
            animation: "fadeIn 0.4s ease",
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: liveAppt.computedStatus === "in-service" ? "#66C499" : "#8ab0ff",
                  animation: "pulse 2s ease-in-out infinite",
                }} />
                <PMono style={{
                  fontSize: 10,
                  color: liveAppt.computedStatus === "in-service" ? "#66C499" : "#8ab0ff",
                }}>
                  {liveAppt.computedStatus === "in-service"
                    ? "¡Estás en silla ahora!" : "Estás en sala · en espera"}
                </PMono>
              </div>
              <div style={{ fontFamily: "'Marcellus', serif", fontSize: 28 }}>
                {liveAppt.service}
              </div>
              {liveAppt.stylist && (
                <div style={{ fontSize: 13, opacity: 0.55, marginTop: 4 }}>
                  {liveAppt.stylist}
                </div>
              )}
            </div>
            <a href="Lobby.html" style={{
              padding: "12px 20px", background: "transparent",
              border: "1px solid rgba(245,241,234,0.2)", color: "#F5F1EA",
              textDecoration: "none", fontSize: 11, letterSpacing: "0.15em",
              textTransform: "uppercase", fontFamily: "'Outfit', sans-serif",
            }}>Ver sala →</a>
          </div>
        )}

        {/* Loyalty card */}
        {loyalty && loyalty.enabled && (
          <div style={{
            background: "#141212",
            border: `1px solid ${loyalty.visits >= loyalty.target
              ? "rgba(102,196,153,0.3)" : "rgba(245,241,234,0.1)"}`,
            padding: "28px 32px",
          }}>
            <PMono style={{ color: "#C29E66", fontSize: 9, display: "block", marginBottom: 20 }}>
              Programa de lealtad · {loyalty.reward}
            </PMono>
            <div style={{
              display: "grid", gridTemplateColumns: "auto 1fr",
              gap: 32, alignItems: "center",
            }} className="appt-grid">
              <div>
                <div style={{
                  fontFamily: "'Marcellus', serif",
                  fontSize: "clamp(48px, 8vw, 72px)",
                  color: loyalty.visits >= loyalty.target ? "#66C499" : "#C29E66",
                  lineHeight: 1,
                }}>
                  {loyalty.visits}
                  <span style={{ fontSize: "0.4em", color: "rgba(245,241,234,0.35)" }}>
                    /{loyalty.target}
                  </span>
                </div>
                {loyalty.redeemed > 0 && (
                  <PMono style={{ fontSize: 9, color: "rgba(245,241,234,0.35)", display: "block", marginTop: 8 }}>
                    {loyalty.redeemed} canje{loyalty.redeemed !== 1 ? "s" : ""} previos
                  </PMono>
                )}
              </div>
              <div>
                <div style={{ fontSize: 15, lineHeight: 1.5, marginBottom: 16 }}>
                  {loyalty.visits >= loyalty.target ? (
                    <span style={{ color: "#66C499" }}>
                      ¡Felicidades! Tienes un <strong>{loyalty.reward}</strong>.
                      Avisa en recepción cuando llegues.
                    </span>
                  ) : (
                    <>
                      Te faltan{" "}
                      <strong style={{ color: "#C29E66" }}>
                        {loyalty.target - loyalty.visits} visita{loyalty.target - loyalty.visits !== 1 ? "s" : ""}
                      </strong>{" "}
                      para tu {loyalty.reward}.
                    </>
                  )}
                </div>
                {/* Progress bar */}
                <div style={{
                  height: 4, background: "rgba(245,241,234,0.1)",
                  position: "relative", marginBottom: 12,
                }}>
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    background: loyalty.visits >= loyalty.target ? "#66C499" : "#C29E66",
                    width: `${Math.min(loyalty.visits / loyalty.target * 100, 100)}%`,
                    transition: "width 0.5s ease",
                  }} />
                </div>
                {/* Dots */}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {Array.from({ length: Math.min(loyalty.target, 20) }).map((_, i) => (
                    <div key={i} style={{
                      width: 11, height: 11,
                      background: i < loyalty.visits
                        ? (loyalty.visits >= loyalty.target ? "#66C499" : "#C29E66")
                        : "rgba(245,241,234,0.08)",
                      border: `1px solid ${i < loyalty.visits
                        ? (loyalty.visits >= loyalty.target ? "#66C499" : "#C29E66")
                        : "rgba(245,241,234,0.12)"}`,
                      transition: "background 0.3s",
                    }} />
                  ))}
                  {loyalty.visits > 20 && (
                    <PMono style={{ fontSize: 9, color: "rgba(245,241,234,0.4)" }}>
                      +{loyalty.visits - 20}
                    </PMono>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Upcoming appointments */}
        <div>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "baseline", marginBottom: 20,
          }}>
            <PMono style={{ color: "#C29E66" }}>
              Próximas citas
              {upcoming.length > 0 && ` · ${upcoming.length}`}
            </PMono>
            <a href="Booking.html" style={{
              color: "rgba(245,241,234,0.4)", textDecoration: "none",
              fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase",
              fontFamily: "'Outfit', sans-serif",
            }}>+ Agendar →</a>
          </div>

          {upcoming.length === 0 ? (
            <div style={{
              padding: "52px 32px", background: "#141212",
              border: "1px solid rgba(245,241,234,0.08)", textAlign: "center",
            }}>
              <div style={{
                fontFamily: "'Marcellus', serif", fontSize: 40,
                opacity: 0.15, marginBottom: 14,
              }}>—</div>
              <div style={{ fontSize: 14, opacity: 0.5, lineHeight: 1.7 }}>
                No tienes citas próximas.<br/>
                <a href="Booking.html" style={{ color: "#C29E66", textDecoration: "none" }}>
                  Reserva una ahora →
                </a>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {upcoming.map(a => {
                const s = STATUS[a.computedStatus] || STATUS.scheduled;
                const isQROpen = showQR === a.id;
                const isLive   = a.computedStatus === "waiting" || a.computedStatus === "in-service";
                return (
                  <div key={a.id} style={{
                    background: "#141212",
                    border: `1px solid ${isLive
                      ? (a.computedStatus === "in-service" ? "rgba(102,196,153,0.35)" : "rgba(138,176,255,0.3)")
                      : "rgba(245,241,234,0.1)"}`,
                    animation: "fadeIn 0.3s ease",
                  }}>
                    <div style={{
                      padding: "22px 26px",
                      display: "grid", gridTemplateColumns: "1fr auto",
                      gap: 16, alignItems: "start",
                    }}>
                      <div>
                        <div style={{
                          display: "flex", alignItems: "center",
                          gap: 10, marginBottom: 12, flexWrap: "wrap",
                        }}>
                          <span style={{
                            padding: "4px 12px", fontSize: 10,
                            fontFamily: "'JetBrains Mono', monospace",
                            letterSpacing: "0.1em", textTransform: "uppercase",
                            background: s.bg, color: s.color,
                            border: `1px solid ${s.color}30`,
                          }}>{s.label}</span>
                          <PMono style={{ color: "#C29E66", fontSize: 11 }}>{a.code}</PMono>
                        </div>
                        <div style={{
                          fontFamily: "'Marcellus', serif",
                          fontSize: "clamp(22px, 4vw, 30px)",
                          marginBottom: 8, lineHeight: 1.1,
                        }}>{a.service}</div>
                        <div style={{ fontSize: 13, opacity: 0.55, lineHeight: 1.6 }}>
                          {a.stylist && <>{a.stylist} · </>}
                          {fmtDate(a.date)}
                          {a.time && <> · {a.time}</>}
                        </div>
                      </div>

                      {/* Actions for upcoming appointments */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                        {a.computedStatus === "scheduled" && (
                          <button onClick={() => setShowQR(isQROpen ? null : a.id)} style={{
                            background: "transparent",
                            border: "1px solid rgba(245,241,234,0.15)",
                            color: "rgba(245,241,234,0.5)", cursor: "pointer",
                            padding: "8px 16px",
                            fontFamily: "'Outfit', sans-serif", fontSize: 11,
                            letterSpacing: "0.1em", textTransform: "uppercase",
                            whiteSpace: "nowrap",
                          }}>
                            {isQROpen ? "Ocultar QR" : "Ver QR ⊡"}
                          </button>
                        )}
                        {a.date === todayStr && (a.computedStatus === "scheduled" || a.computedStatus === "waiting") && (
                          <a href="CheckIn.html" style={{
                            background: "rgba(194,158,102,0.12)",
                            border: "1px solid rgba(194,158,102,0.35)",
                            color: "#C29E66", textDecoration: "none",
                            padding: "8px 16px",
                            fontFamily: "'Outfit', sans-serif", fontSize: 11,
                            letterSpacing: "0.1em", textTransform: "uppercase",
                            whiteSpace: "nowrap",
                          }}>Check-In →</a>
                        )}
                        {a.computedStatus === "scheduled" && (
                          <>
                            <a href={waReschedule(a)} target="_blank" rel="noopener noreferrer" style={{
                              background: "transparent",
                              border: "1px solid rgba(245,241,234,0.15)",
                              color: "rgba(245,241,234,0.5)", textDecoration: "none",
                              padding: "8px 16px",
                              fontFamily: "'Outfit', sans-serif", fontSize: 11,
                              letterSpacing: "0.1em", textTransform: "uppercase",
                              whiteSpace: "nowrap",
                            }}>Reagendar</a>
                            {selfService.allowCancel && (
                              <button onClick={() => cancelAppt(a)} disabled={busyId === a.id} style={{
                                background: "transparent",
                                border: "1px solid rgba(196,102,102,0.4)",
                                color: "#C46666", cursor: busyId === a.id ? "wait" : "pointer",
                                padding: "8px 16px",
                                fontFamily: "'Outfit', sans-serif", fontSize: 11,
                                letterSpacing: "0.1em", textTransform: "uppercase",
                                whiteSpace: "nowrap", opacity: busyId === a.id ? 0.5 : 1,
                              }}>{busyId === a.id ? "Cancelando…" : "Cancelar"}</button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {isQROpen && (
                      <div style={{
                        borderTop: "1px solid rgba(245,241,234,0.07)",
                        padding: "28px", display: "flex", flexDirection: "column",
                        alignItems: "center", gap: 14,
                        animation: "fadeIn 0.25s ease",
                      }}>
                        <PMono style={{ fontSize: 9, color: "rgba(245,241,234,0.4)", textAlign: "center" }}>
                          Muestra este código en recepción para activar tu turno
                        </PMono>
                        <div style={{ padding: 20, background: "#F5F1EA", display: "inline-block" }}>
                          <QRCode value={a.id} size={200} />
                        </div>
                        <PMono style={{ color: "#C29E66", fontSize: 14, letterSpacing: "0.35em" }}>
                          {a.code}
                        </PMono>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* History */}
        {history.length > 0 && (
          <div>
            <PMono style={{
              color: "rgba(245,241,234,0.35)", display: "block", marginBottom: 16,
            }}>
              Historial · {history.length} visita{history.length !== 1 ? "s" : ""}
            </PMono>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {history.map(a => {
                const s = STATUS[a.computedStatus] || STATUS.completed;
                return (
                  <div key={a.id} style={{
                    display: "grid",
                    gridTemplateColumns: "72px 1fr 60px auto",
                    gap: 16, padding: "14px 20px",
                    background: "#111",
                    border: "1px solid rgba(245,241,234,0.05)",
                    alignItems: "center",
                  }} className="hist-grid">
                    <PMono style={{ color: "#C29E66", fontSize: 10 }}>
                      {fmtShort(a.date)}
                    </PMono>
                    <div>
                      <div style={{ fontSize: 14 }}>{a.service}</div>
                      {a.stylist && (
                        <div style={{ fontSize: 11, opacity: 0.4, marginTop: 2 }}>{a.stylist}</div>
                      )}
                    </div>
                    <PMono style={{ fontSize: 9, color: "rgba(245,241,234,0.3)" }}>
                      {a.time}
                    </PMono>
                    <span style={{
                      padding: "3px 10px", fontSize: 9,
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: "0.1em", textTransform: "uppercase",
                      background: s.bg, color: s.color,
                      border: `1px solid ${s.color}25`,
                      whiteSpace: "nowrap",
                    }}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {appts.length === 0 && (
          <div style={{
            textAlign: "center", padding: "60px 32px",
            border: "1px dashed rgba(245,241,234,0.1)",
          }}>
            <div style={{
              fontFamily: "'Marcellus', serif", fontSize: 48,
              opacity: 0.15, marginBottom: 16,
            }}>◯</div>
            <div style={{ fontSize: 15, opacity: 0.5, lineHeight: 1.7 }}>
              No encontramos citas con esta cédula.<br/>
              <a href="Booking.html" style={{ color: "#C29E66", textDecoration: "none" }}>
                Reserva tu primera cita →
              </a>
            </div>
          </div>
        )}

      </main>
      {dialog.node}
    </PortalShell>
  );
};

// ============================================================
// PAGE 0 — HOME
// ============================================================
// ── Portal auth gate ─────────────────────────────────────────
const PORTAL_SES_ADMIN = "joxe_admin_session";
const PORTAL_SES_EMP   = "joxe_agenda_session";

const isPortalAuthed = () =>
  !!sessionStorage.getItem(PORTAL_SES_ADMIN) ||
  !!sessionStorage.getItem(PORTAL_SES_EMP);

const PortalLoginGate = ({ onAuth }) => {
  const [tab, setTab]       = React.useState("admin"); // "admin" | "empleado"
  const [pw, setPw]         = React.useState("");
  const [empList, setEmpList] = React.useState([]);
  const [selId, setSelId]   = React.useState("");
  const [pin, setPin]       = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr]       = React.useState("");

  React.useEffect(() => {
    fetch("/api/catalog")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.employees) setEmpList(d.employees.filter(e => e.active !== false)); })
      .catch(() => {});
  }, []);

  const loginAdmin = async () => {
    if (!pw) return;
    setLoading(true); setErr("");
    try {
      const res  = await fetch("/api/admin?action=auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setErr("Contraseña incorrecta."); setPw(""); setLoading(false); return; }
      sessionStorage.setItem(PORTAL_SES_ADMIN, pw);
      onAuth();
    } catch { setErr("Error de conexión."); }
    setLoading(false);
  };

  const loginEmp = async () => {
    if (!selId || !pin) return;
    setLoading(true); setErr("");
    try {
      const res  = await fetch("/api/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", empId: selId, pin }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "PIN incorrecto."); setPin(""); setLoading(false); return; }
      sessionStorage.setItem(PORTAL_SES_EMP, JSON.stringify(data.employee));
      if (data.token) sessionStorage.setItem("joxe_emp_token", data.token);
      onAuth();
    } catch { setErr("Error de conexión."); }
    setLoading(false);
  };

  const tabStyle = (active) => ({
    flex: 1, padding: "10px 0", background: "none", border: "none",
    borderBottom: active ? "2px solid #C29E66" : "2px solid transparent",
    color: active ? "#C29E66" : "rgba(245,241,234,0.45)",
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
    letterSpacing: "0.2em", textTransform: "uppercase", cursor: "pointer",
    transition: "color 0.2s",
  });

  return (
    <PortalShell tone="noir" header={
      <PortalHeader subtitle="Sistema de turnos" title="JOXE · Portal"
        right={
          <a href="Asesores de Imagen.html" style={{
            color: "#F5F1EA", textDecoration: "none", fontSize: 12,
            letterSpacing: "0.15em", textTransform: "uppercase", opacity: 0.6,
          }}>Sitio web ↗</a>
        }
      />
    }>
      <main style={{
        flex: 1, display: "flex", alignItems: "center",
        justifyContent: "center", padding: "48px 20px",
      }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <PMono style={{ color: "#C29E66" }}>Acceso restringido</PMono>
          <h1 style={{
            fontFamily: "'Marcellus', serif", fontSize: "clamp(32px, 6vw, 48px)",
            fontWeight: 400, margin: "16px 0 8px", letterSpacing: "-0.01em", lineHeight: 1.1,
          }}>Portal de equipo.</h1>
          <p style={{ fontSize: 14, opacity: 0.55, lineHeight: 1.6, marginBottom: 40 }}>
            Ingresa con tu cuenta de administrador o empleado para continuar.
          </p>

          <div style={{
            background: "#141212", border: "1px solid rgba(245,241,234,0.1)", padding: 32,
          }}>
            {/* Tabs */}
            <div style={{ display: "flex", marginBottom: 28, borderBottom: "1px solid rgba(245,241,234,0.08)" }}>
              <button style={tabStyle(tab === "admin")} onClick={() => { setTab("admin"); setErr(""); }}>
                Administrador
              </button>
              <button style={tabStyle(tab === "empleado")} onClick={() => { setTab("empleado"); setErr(""); }}>
                Empleado
              </button>
            </div>

            {tab === "admin" && (
              <div>
                <label htmlFor="portal-pw">
                  <PMono style={{ fontSize: 9, color: "rgba(245,241,234,0.5)", display: "block", marginBottom: 10 }}>
                    Contraseña de administrador
                  </PMono>
                </label>
                <input id="portal-pw" type="password" value={pw}
                  onChange={e => { setPw(e.target.value); setErr(""); }}
                  onKeyDown={e => e.key === "Enter" && loginAdmin()}
                  placeholder="••••••••"
                  style={{
                    width: "100%", padding: "14px 16px", marginBottom: 20,
                    background: "#0C0C0C", border: "1px solid rgba(245,241,234,0.15)",
                    color: "#F5F1EA", fontFamily: "'JetBrains Mono', monospace", fontSize: 15,
                  }}
                />
                <button onClick={loginAdmin} disabled={!pw || loading} style={{
                  width: "100%", padding: "14px 0",
                  background: pw && !loading ? "#C29E66" : "rgba(194,158,102,0.25)",
                  color: pw && !loading ? "#0C0C0C" : "rgba(194,158,102,0.5)",
                  border: "none", cursor: pw && !loading ? "pointer" : "default",
                  fontFamily: "'Outfit', sans-serif", fontSize: 13,
                  letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 500,
                  transition: "background 0.2s",
                }}>
                  {loading ? "Verificando…" : "Entrar"}
                </button>
              </div>
            )}

            {tab === "empleado" && (
              <div>
                <label htmlFor="portal-emp">
                  <PMono style={{ fontSize: 9, color: "rgba(245,241,234,0.5)", display: "block", marginBottom: 10 }}>
                    Selecciona tu nombre
                  </PMono>
                </label>
                <select id="portal-emp" value={selId}
                  onChange={e => { setSelId(e.target.value); setErr(""); }}
                  style={{
                    width: "100%", padding: "14px 16px", marginBottom: 16,
                    background: "#0C0C0C", border: "1px solid rgba(245,241,234,0.15)",
                    color: selId ? "#F5F1EA" : "rgba(245,241,234,0.4)",
                    fontFamily: "'Outfit', sans-serif", fontSize: 14,
                  }}>
                  <option value="">— Seleccionar —</option>
                  {empList.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
                <label htmlFor="portal-pin">
                  <PMono style={{ fontSize: 9, color: "rgba(245,241,234,0.5)", display: "block", marginBottom: 10 }}>
                    PIN
                  </PMono>
                </label>
                <input id="portal-pin" type="password" value={pin}
                  onChange={e => { setPin(e.target.value.replace(/\D/g, "")); setErr(""); }}
                  onKeyDown={e => e.key === "Enter" && selId && pin && loginEmp()}
                  placeholder="••••"
                  inputMode="numeric" maxLength={8}
                  style={{
                    width: "100%", padding: "14px 16px", marginBottom: 20,
                    background: "#0C0C0C", border: "1px solid rgba(245,241,234,0.15)",
                    color: "#F5F1EA", fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 20, letterSpacing: "0.3em",
                  }}
                />
                <button onClick={loginEmp} disabled={!selId || !pin || loading} style={{
                  width: "100%", padding: "14px 0",
                  background: selId && pin && !loading ? "#C29E66" : "rgba(194,158,102,0.25)",
                  color: selId && pin && !loading ? "#0C0C0C" : "rgba(194,158,102,0.5)",
                  border: "none", cursor: selId && pin && !loading ? "pointer" : "default",
                  fontFamily: "'Outfit', sans-serif", fontSize: 13,
                  letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 500,
                  transition: "background 0.2s",
                }}>
                  {loading ? "Verificando…" : "Entrar"}
                </button>
              </div>
            )}

            {err && (
              <p role="alert" style={{
                marginTop: 16, fontSize: 13, color: "#C46666",
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.05em",
              }}>{err}</p>
            )}
          </div>
        </div>
      </main>
    </PortalShell>
  );
};

const HomePortal = () => {
  const [store] = useStore();
  const [authed, setAuthed] = React.useState(isPortalAuthed);

  const doLogout = () => {
    sessionStorage.removeItem(PORTAL_SES_ADMIN);
    sessionStorage.removeItem(PORTAL_SES_EMP);
    setAuthed(false);
  };

  if (!authed) return <PortalLoginGate onAuth={() => setAuthed(true)} />;

  const empSession = (() => { try { return JSON.parse(sessionStorage.getItem(PORTAL_SES_EMP)); } catch { return null; } })();
  const isAdmin    = !!sessionStorage.getItem(PORTAL_SES_ADMIN);
  const label      = isAdmin ? "Admin" : (empSession?.name ?? "Empleado");

  return (
    <PortalShell tone="noir" header={
      <PortalHeader
        subtitle="Sistema de turnos"
        title="JOXE · Portal"
        right={
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <a href="Asesores de Imagen.html" style={{
              color: "#F5F1EA", textDecoration: "none", fontSize: 12,
              letterSpacing: "0.15em", textTransform: "uppercase", opacity: 0.6,
            }}>Sitio web ↗</a>
            <a href="CheckIn.html" style={{
              color: "#F5F1EA", textDecoration: "none", fontSize: 12,
              letterSpacing: "0.15em", textTransform: "uppercase", opacity: 0.75,
            }}>Check-In</a>
            {empSession && !isAdmin && (
              <a href="Agenda.html" style={{
                color: "#C29E66", textDecoration: "none", fontSize: 11,
                letterSpacing: "0.15em", textTransform: "uppercase",
                padding: "8px 14px", border: "1px solid rgba(194,158,102,0.4)",
              }}>Mi Agenda ◈</a>
            )}
            {isAdmin && (
              <a href="Admin.html" style={{
                color: "#C29E66", textDecoration: "none", fontSize: 11,
                letterSpacing: "0.15em", textTransform: "uppercase",
                padding: "8px 14px", border: "1px solid rgba(194,158,102,0.4)",
              }}>Admin ⊛</a>
            )}
            <button onClick={doLogout} style={{
              background: "none", border: "1px solid rgba(245,241,234,0.2)",
              color: "rgba(245,241,234,0.55)", cursor: "pointer", fontSize: 11,
              letterSpacing: "0.12em", textTransform: "uppercase", padding: "8px 14px",
              fontFamily: "'Outfit', sans-serif",
            }}>
              {label} · Salir
            </button>
          </div>
        }
      />
    }>
      <main style={{
        flex: 1, padding: "80px 40px", maxWidth: 1200,
        margin: "0 auto", width: "100%",
      }}>
        <PMono style={{ color: "#C29E66" }}>Bienvenido</PMono>
        <h1 style={{
          fontFamily: "'Marcellus', serif", fontSize: "clamp(48px, 7vw, 88px)",
          fontWeight: 400, lineHeight: 1.02, letterSpacing: "-0.015em",
          margin: "20px 0 24px",
        }}>
          Reserva. Escanea. <em style={{ color: "#C29E66" }}>Entra.</em>
        </h1>
        <p style={{
          fontSize: 17, lineHeight: 1.6, opacity: 0.75, maxWidth: 560,
          margin: "0 0 72px",
        }}>
          Un sistema simple en tres tiempos. Agenda tu cita desde casa,
          escanea el QR al llegar, y espera cómodo mientras te llamamos
          por nombre.
        </p>

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20,
        }} className="portal-cards">
          {[
            {
              n: "01", title: "Agendar cita", subtitle: "Cliente",
              desc: "Elige servicio, fecha y estilista. Recibe tu QR personal.",
              href: "Booking.html", cta: "Reservar ahora",
              primary: true,
            },
            {
              n: "02", title: "Mi Cuenta", subtitle: "Cliente",
              desc: "Consulta tus citas, el estado en sala y tus puntos de lealtad.",
              href: "Cuenta.html", cta: "Ver mi cuenta",
            },
            ...(empSession ? [{
              n: "03", title: "Mi Agenda", subtitle: "Empleado",
              desc: "Revisa las solicitudes de citas asignadas a ti y confírmalas al recibir el comprobante.",
              href: "Agenda.html", cta: "Ver solicitudes →",
              accent: true,
            }] : []),
            {
              n: empSession ? "04" : "03", title: "Escanear QR", subtitle: "Recepción",
              desc: "Valida el ticket y activa el turno al llegar al salón.",
              href: "Scan.html", cta: "Abrir escáner",
            },
            {
              n: empSession ? "05" : "04", title: "Pantalla de sala", subtitle: "Lobby",
              desc: "Muestra la cola en vivo — proyecta en pantalla grande.",
              href: "Lobby.html", cta: "Ver sala",
            },
            {
              n: empSession ? "06" : "05", title: "Check-In", subtitle: "Cliente · Silla",
              desc: "Escanea el QR de tu silla para confirmar asistencia o cerrar el servicio.",
              href: "CheckIn.html", cta: "Ir a Check-In",
            },
          ].map(c => (
            <a key={c.n} href={c.href} style={{
              padding: "32px 28px", textDecoration: "none",
              background: c.primary ? "#C29E66" : "#141212",
              color: c.primary ? "#0C0C0C" : "#F5F1EA",
              border: c.primary ? "none" : c.accent ? "1px solid rgba(194,158,102,0.5)" : "1px solid rgba(245,241,234,0.15)",
              display: "flex", flexDirection: "column",
              minHeight: 280, transition: "transform 0.3s",
            }}
            onMouseEnter={e => e.currentTarget.style.transform = "translateY(-4px)"}
            onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                letterSpacing: "0.3em", marginBottom: 32,
                color: c.primary ? "rgba(12,12,12,0.7)" : "#C29E66",
              }}>{c.n} · {c.subtitle}</div>
              <div style={{
                fontFamily: "'Marcellus', serif", fontSize: 34,
                letterSpacing: "-0.01em", marginBottom: 12,
              }}>{c.title}</div>
              <div style={{
                fontSize: 14, lineHeight: 1.5,
                opacity: c.primary ? 0.75 : 0.7, marginBottom: 40,
              }}>{c.desc}</div>
              <div style={{
                marginTop: "auto",
                fontFamily: "'Outfit', sans-serif", fontSize: 12,
                letterSpacing: "0.2em", textTransform: "uppercase",
              }}>{c.cta} →</div>
            </a>
          ))}
        </div>

        {/* Stats */}
        <div style={{
          marginTop: 72, paddingTop: 32,
          borderTop: "1px solid rgba(245,241,234,0.1)",
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 32,
        }} className="portal-stats">
          {[
            ["En espera", store.active.filter(a => a.status === "waiting").length],
            ["En silla", store.active.filter(a => a.status === "in-service").length],
            ["Agendados", store.appointments.length],
            ["Atendidos hoy", store.completed.length],
          ].map(([l, n]) => (
            <div key={l}>
              <div style={{
                fontFamily: "'Marcellus', serif", fontSize: 56,
                color: "#C29E66", letterSpacing: "-0.02em",
              }}>{String(n).padStart(2, "0")}</div>
              <PMono style={{ color: "rgba(245,241,234,0.5)", fontSize: 10, marginTop: 8, display: "block" }}>
                {l}
              </PMono>
            </div>
          ))}
        </div>
      </main>
    </PortalShell>
  );
};

// ============================================================
// PAGE 5 — CHECK-IN (silla de estilista)
// Admin: ve la agenda del día con acciones.
// Todos los demás: confirman asistencia con cédula.
// ============================================================

// Helpers locales para leer/escribir el estado de admin sin importar admin.jsx
const ADMIN_KEY_CI = "joxe_admin_v1";
const loadAdminCI = () => {
  try { return JSON.parse(localStorage.getItem(ADMIN_KEY_CI)) || {}; } catch { return {}; }
};
const saveAdminCI = (next) => localStorage.setItem(ADMIN_KEY_CI, JSON.stringify(next));

// Calcula el status visible de una cita igual que getAllAppts en admin.jsx
const resolveApptStatus = (appt, activeIds, completedIds, noShowIds, cancelledIds) => {
  if (noShowIds.includes(appt.id))    return "no-show";
  if (cancelledIds.includes(appt.id)) return "cancelled";
  if (completedIds.has(appt.id))      return "completed";
  if (activeIds.has(appt.id))         return "waiting";
  return appt.status || "scheduled";
};

const CheckInPortal = () => {
  const [store, setStore] = useStore();
  const catalog = useCatalog();

  const hash     = window.location.hash.replace('#', '');
  const chairNum = hash.startsWith('puesto-') ? Number(hash.replace('puesto-', '')) : null;
  const legacyId = !chairNum && hash.startsWith('chair-') ? hash.replace('chair-', '') : null;
  const resolvedEmpId = chairNum
    ? (catalog.chairAssignments?.[chairNum] || null)
    : legacyId;
  const employee = resolvedEmpId
    ? (catalog.employees.find(e => e.id === resolvedEmpId) || null)
    : null;

  const isAdmin = !!sessionStorage.getItem("joxe_admin_session");

  const headerRight = (
    <a href={isAdmin ? "Portal.html" : "Asesores de Imagen.html"} style={{
      color: "#F5F1EA", textDecoration: "none", fontSize: 12,
      letterSpacing: "0.15em", textTransform: "uppercase", opacity: 0.6,
    }}>← Inicio</a>
  );

  // ── MODO ADMIN: agenda del estilista ───────────────────────
  if (isAdmin) {
    return <CheckInAdminView store={store} setStore={setStore}
      employee={employee} headerRight={headerRight} />;
  }

  // ── MODO CLIENTE / ESTILISTA / ANÓNIMO: check-in por cédula ─
  return <CheckInClientView store={store} setStore={setStore}
    employee={employee} headerRight={headerRight} />;
};

// ── Vista admin ─────────────────────────────────────────────
const CheckInAdminView = ({ store, setStore, employee, headerRight }) => {
  const [adminState, setAdminState] = React.useState(loadAdminCI);
  const [checkoutId, setCheckoutId] = React.useState(null);
  const [price, setPrice] = React.useState('');
  const [note, setNote]   = React.useState('');
  const [done, setDone]   = React.useState(false);
  const [confirm, setConfirm] = React.useState(null); // { appt, action: 'noshow'|'checkin' }

  const noShowIds    = adminState.noShowIds    || [];
  const cancelledIds = adminState.cancelledIds || [];
  const activeIds    = new Set(store.active.map(a => a.id));
  const completedIds = new Set(store.completed.map(a => a.id));

  const today = todayStr();

  // Todas las citas de hoy para este estilista (o todas si no hay silla)
  const todayAppts = React.useMemo(() => {
    const all = [
      ...store.appointments.map(a => ({ ...a, _src: 'scheduled' })),
      ...store.active.map(a => ({ ...a, _src: 'active' })),
      ...store.completed.map(a => ({ ...a, _src: 'completed' })),
    ];
    // Dedup por id: active/completed override scheduled (last wins)
    const seen = new Map();
    all.forEach(a => seen.set(a.id, a));
    return [...seen.values()]
      .filter(a => a.date === today && (!employee || a.stylist === employee.name))
      .map(a => ({
        ...a,
        computedStatus: resolveApptStatus(a, activeIds, completedIds, noShowIds, cancelledIds),
      }))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }, [store, employee, today, noShowIds, cancelledIds]);

  // Cliente activo en silla (para checkout)
  const inService = checkoutId
    ? store.active.find(a => a.id === checkoutId) || null
    : null;

  const manualCheckIn = (appt) => {
    setStore(s => {
      const alreadyActive = s.active.some(a => a.id === appt.id);
      const rawAppt = s.appointments.find(a => a.id === appt.id) || appt;
      return {
        ...s,
        appointments: s.appointments.map(a =>
          a.id === appt.id ? { ...a, checkedIn: true, checkedInAt: Date.now() } : a
        ),
        active: alreadyActive ? s.active : [
          ...s.active,
          { ...rawAppt, checkedIn: true, checkedInAt: Date.now(), activatedAt: Date.now(), status: "waiting", position: s.active.length + 1 },
        ],
      };
    });
    setConfirm(null);
  };

  const CI_DAY_KEYS = ["dom","lun","mar","mie","jue","vie","sab"];

  const markNoShow = async (appt) => {
    const admin = loadAdminCI();
    const ids   = [...(admin.noShowIds || []), appt.id];
    const fine  = admin.noShowFine;
    let next    = { ...admin, noShowIds: ids };
    if (fine?.enabled) {
      // Use same day-key format as admin.jsx ("lun","mar"...) to match byDay config
      const day    = CI_DAY_KEYS[new Date(appt.date + "T12:00").getDay()];
      const amount = (fine.byDay?.[day] > 0 ? fine.byDay[day] : fine.defaultAmount) || 0;
      if (amount > 0) {
        const fineId = `ns-${appt.id}`;
        // Guard: prevent double-registering the same fine
        const alreadyExists = (admin.revenue || []).some(r => r.id === fineId);
        if (!alreadyExists) {
          next = {
            ...next,
            revenue: [...(admin.revenue || []), {
              id: fineId, date: appt.date, type: 'no-show-fine',
              client: appt.name, service: appt.service,
              phone: appt.phone || "",
              stylist: appt.stylist || "",
              method: "Multa",
              note: `Incumplimiento · ${appt.code || appt.id}`,
              amount,
              createdAt: Date.now(),
            }],
          };
        }
      }
    }
    saveAdminCI(next);
    setAdminState(next);
    setConfirm(null);
    // Persist to server so admin panel syncs correctly
    const token = sessionStorage.getItem("joxe_admin_session") || "";
    if (token) {
      try {
        await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify(next),
        });
      } catch (err) {
        console.warn("[checkin] admin save failed", err.message);
      }
    }
  };

  const checkout = () => {
    if (!inService) return;
    const finalPrice = price ? Number(price.replace(/\D/g, '')) : undefined;
    setStore(s => ({
      ...s,
      active: s.active.filter(a => a.id !== inService.id),
      completed: [...s.completed, {
        ...inService,
        completedAt: Date.now(),
        ...(finalPrice ? { finalPrice } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }],
    }));
    setDone(true);
  };

  const STATUS_CHIP = {
    scheduled:  { label: "Pendiente",   bg: "rgba(138,176,255,0.1)",  color: "#8ab0ff",  border: "rgba(138,176,255,0.3)" },
    waiting:    { label: "En sala",     bg: "rgba(194,158,102,0.12)", color: "#C29E66",  border: "rgba(194,158,102,0.4)" },
    "in-service":{ label: "En silla",  bg: "rgba(102,196,153,0.12)", color: "#66C499",  border: "rgba(102,196,153,0.4)" },
    completed:  { label: "Completada",  bg: "rgba(102,196,153,0.06)", color: "#66C499",  border: "rgba(102,196,153,0.2)" },
    "no-show":  { label: "Incumplida", bg: "rgba(196,102,102,0.12)", color: "#e07070",  border: "rgba(196,102,102,0.3)" },
    cancelled:  { label: "Cancelada",  bg: "rgba(245,241,234,0.04)", color: "rgba(245,241,234,0.35)", border: "rgba(245,241,234,0.1)" },
  };

  // ── Checkout overlay ──────────────────────────────────────
  if (checkoutId) {
    return (
      <PortalShell tone="noir" header={
        <PortalHeader subtitle={employee ? `Silla · ${employee.name}` : "Admin"} title="Completar servicio" right={
          <button onClick={() => { setCheckoutId(null); setDone(false); setPrice(''); setNote(''); }}
            style={{ background: "none", border: "none", color: "#F5F1EA", cursor: "pointer",
              fontFamily: "'Outfit', sans-serif", fontSize: 12, letterSpacing: "0.15em",
              textTransform: "uppercase", opacity: 0.6 }}>← Volver</button>
        } />
      }>
        <main style={{ flex: 1, padding: "48px 40px", maxWidth: 700, margin: "0 auto", width: "100%" }}>
          {done ? (
            <>
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: "rgba(102,196,153,0.15)", border: "1px solid rgba(102,196,153,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, color: "#66C499", marginBottom: 24,
              }}>✓</div>
              <PMono style={{ color: "#66C499" }}>Servicio completado</PMono>
              <h2 style={{ fontFamily: "'Marcellus', serif", fontSize: 48, fontWeight: 400, margin: "16px 0 16px" }}>Cerrado.</h2>
              <p style={{ opacity: 0.5, fontSize: 15, marginBottom: 40 }}>
                El cliente fue movido al historial.
              </p>
              <button onClick={() => { setCheckoutId(null); setDone(false); setPrice(''); setNote(''); }}
                style={{ background: "transparent", border: "1px solid rgba(245,241,234,0.25)",
                  color: "#F5F1EA", padding: "14px 28px", cursor: "pointer",
                  fontFamily: "'Outfit', sans-serif", fontSize: 12,
                  letterSpacing: "0.18em", textTransform: "uppercase" }}>← Ver agenda</button>
            </>
          ) : !inService ? (
            <>
              <h2 style={{ fontFamily: "'Marcellus', serif", fontSize: 40, fontWeight: 400, margin: "0 0 16px" }}>
                Cita no activa.
              </h2>
              <p style={{ opacity: 0.45, fontSize: 14 }}>
                Esta cita no está en cola activa. Actívala desde recepción primero.
              </p>
            </>
          ) : (
            <>
              <PMono style={{ color: "#C29E66" }}>{inService.code}</PMono>
              <h2 style={{ fontFamily: "'Marcellus', serif", fontSize: 52, fontWeight: 400, margin: "16px 0 32px" }}>
                {inService.name}
              </h2>
              <div style={{ background: "#141212", border: "1px solid rgba(245,241,234,0.08)",
                padding: "24px", marginBottom: 28,
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {[["Servicio", inService.service], ["Estilista", inService.stylist],
                  ["Teléfono", inService.phone], ["Cédula", inService.cedula]].map(([label, val]) => (
                  <div key={label}>
                    <PMono style={{ color: "rgba(245,241,234,0.35)", fontSize: 9, display: "block", marginBottom: 6 }}>{label}</PMono>
                    <div style={{ fontFamily: "'Marcellus', serif", fontSize: 17 }}>{val || "—"}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 32 }}>
                <div>
                  <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
                    color: "rgba(245,241,234,0.4)", marginBottom: 10 }}>Precio final (COP)</label>
                  <input type="text"
                    value={price ? Number(price).toLocaleString('es-CO') : ''}
                    onChange={e => setPrice(e.target.value.replace(/\D/g, ''))}
                    placeholder="85.000"
                    style={{ width: "100%", background: "#141212",
                      border: "1px solid rgba(245,241,234,0.12)",
                      color: "#F5F1EA", padding: "14px 16px",
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 16,
                      letterSpacing: "0.08em" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
                    color: "rgba(245,241,234,0.4)", marginBottom: 10 }}>Notas internas</label>
                  <textarea value={note} onChange={e => setNote(e.target.value)}
                    placeholder="Ej: cliente requirió tratamiento adicional…" rows={3}
                    style={{ width: "100%", background: "#141212",
                      border: "1px solid rgba(245,241,234,0.12)",
                      color: "#F5F1EA", padding: "14px 16px",
                      fontFamily: "'Outfit', sans-serif", fontSize: 14,
                      resize: "vertical", lineHeight: 1.5 }} />
                </div>
              </div>
              <button onClick={checkout} style={{ width: "100%", background: "#C29E66", color: "#0C0C0C",
                border: "none", padding: "18px 32px", cursor: "pointer",
                fontFamily: "'Outfit', sans-serif", fontSize: 12,
                letterSpacing: "0.18em", textTransform: "uppercase" }}>
                Completar servicio →
              </button>
            </>
          )}
        </main>
      </PortalShell>
    );
  }

  // ── Agenda del día ────────────────────────────────────────
  return (
    <PortalShell tone="noir" header={
      <PortalHeader
        subtitle={employee ? `Silla · ${employee.name}` : "Admin · Agenda"}
        title={employee ? `Agenda de ${employee.name}` : "Agenda hoy"}
        right={headerRight}
      />
    }>
      <main style={{ flex: 1, padding: "40px", maxWidth: 860, margin: "0 auto", width: "100%" }}>

        {/* Modal de confirmación */}
        {confirm && (
          <div role="dialog" aria-modal="true" aria-labelledby="ci-confirm-title"
            onClick={(e) => { if (e.target === e.currentTarget) setConfirm(null); }}
            style={{
              position: "fixed", inset: 0, background: "rgba(12,12,12,0.85)",
              display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 100, padding: 24,
            }}>
            <div style={{ background: "#141212", border: "1px solid rgba(245,241,234,0.15)",
              padding: 40, maxWidth: 420, width: "100%" }}>
              {confirm.action === 'noshow' ? (
                <>
                  <PMono style={{ color: "#e07070" }}>Marcar incumplida</PMono>
                  <h3 id="ci-confirm-title" style={{ fontFamily: "'Marcellus', serif", fontSize: 28, fontWeight: 400, margin: "12px 0 8px" }}>
                    {confirm.appt.name}
                  </h3>
                  <p style={{ fontSize: 13, opacity: 0.55, lineHeight: 1.6, marginBottom: 28 }}>
                    Esto registrará la cita como incumplida
                    {adminState.noShowFine?.enabled ? " y aplicará la multa configurada" : ""}.
                    Esta acción no se puede deshacer desde aquí.
                  </p>
                  <div style={{ display: "flex", gap: 12 }}>
                    <button onClick={() => setConfirm(null)} style={{
                      flex: 1, background: "transparent", border: "1px solid rgba(245,241,234,0.2)",
                      color: "#F5F1EA", padding: "12px", cursor: "pointer",
                      fontFamily: "'Outfit', sans-serif", fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase",
                    }}>Cancelar</button>
                    <button onClick={() => markNoShow(confirm.appt)} style={{
                      flex: 1, background: "rgba(196,102,102,0.15)", border: "1px solid rgba(196,102,102,0.4)",
                      color: "#e07070", padding: "12px", cursor: "pointer",
                      fontFamily: "'Outfit', sans-serif", fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase",
                    }}>Confirmar →</button>
                  </div>
                </>
              ) : (
                <>
                  <PMono style={{ color: "#C29E66" }}>Check-in manual</PMono>
                  <h3 id="ci-confirm-title" style={{ fontFamily: "'Marcellus', serif", fontSize: 28, fontWeight: 400, margin: "12px 0 8px" }}>
                    {confirm.appt.name}
                  </h3>
                  <p style={{ fontSize: 13, opacity: 0.55, lineHeight: 1.6, marginBottom: 28 }}>
                    Confirmarás la asistencia de este cliente manualmente. Esto evita la multa por no-show.
                  </p>
                  <div style={{ display: "flex", gap: 12 }}>
                    <button onClick={() => setConfirm(null)} style={{
                      flex: 1, background: "transparent", border: "1px solid rgba(245,241,234,0.2)",
                      color: "#F5F1EA", padding: "12px", cursor: "pointer",
                      fontFamily: "'Outfit', sans-serif", fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase",
                    }}>Cancelar</button>
                    <button onClick={() => manualCheckIn(confirm.appt)} style={{
                      flex: 1, background: "#C29E66", border: "none",
                      color: "#0C0C0C", padding: "12px", cursor: "pointer",
                      fontFamily: "'Outfit', sans-serif", fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase",
                    }}>Confirmar →</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <PMono style={{ color: "rgba(245,241,234,0.4)", display: "block", marginBottom: 24 }}>
          {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
        </PMono>

        {todayAppts.length === 0 ? (
          <div style={{ opacity: 0.4, textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>—</div>
            <PMono>Sin citas para hoy{employee ? ` · ${employee.name}` : ""}</PMono>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {todayAppts.map(appt => {
              const chip  = STATUS_CHIP[appt.computedStatus] || STATUS_CHIP.scheduled;
              const done  = ["completed", "no-show", "cancelled"].includes(appt.computedStatus);
              const isActive = activeIds.has(appt.id);
              const canCheckIn  = !done && !appt.checkedIn && appt.computedStatus !== "no-show";
              const canNoShow   = !done && !appt.checkedIn;
              return (
                <div key={appt.id} style={{
                  background: "#141212", border: "1px solid rgba(245,241,234,0.07)",
                  padding: "20px 24px",
                  display: "grid", gridTemplateColumns: "64px 1fr auto",
                  gap: 20, alignItems: "center",
                  opacity: done && appt.computedStatus !== "completed" ? 0.5 : 1,
                }}>
                  {/* Hora */}
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15,
                    color: "#C29E66", letterSpacing: "0.08em" }}>{appt.time || "—"}</div>

                  {/* Info cliente */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontFamily: "'Marcellus', serif", fontSize: 20 }}>{appt.name}</span>
                      {appt.checkedIn && (
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
                          letterSpacing: "0.15em", textTransform: "uppercase",
                          color: "#66C499", border: "1px solid rgba(102,196,153,0.4)",
                          padding: "2px 8px", background: "rgba(102,196,153,0.08)" }}>✓ Check-in</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.55 }}>{appt.service}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                      <span style={{
                        padding: "3px 10px", fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
                        letterSpacing: "0.12em", textTransform: "uppercase",
                        background: chip.bg, color: chip.color, border: `1px solid ${chip.border}`,
                      }}>{chip.label}</span>
                      {!employee && (
                        <span style={{ fontSize: 11, opacity: 0.4 }}>{appt.stylist}</span>
                      )}
                    </div>
                  </div>

                  {/* Acciones */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                    {isActive && (
                      <button onClick={() => { setCheckoutId(appt.id); setPrice(''); setNote(''); setDone(false); }}
                        style={{ background: "rgba(102,196,153,0.1)", border: "1px solid rgba(102,196,153,0.35)",
                          color: "#66C499", padding: "8px 16px", cursor: "pointer",
                          fontFamily: "'Outfit', sans-serif", fontSize: 11,
                          letterSpacing: "0.15em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                        Completar →
                      </button>
                    )}
                    {canCheckIn && (
                      <button onClick={() => setConfirm({ appt, action: 'checkin' })}
                        style={{ background: "transparent", border: "1px solid rgba(194,158,102,0.35)",
                          color: "#C29E66", padding: "8px 16px", cursor: "pointer",
                          fontFamily: "'Outfit', sans-serif", fontSize: 11,
                          letterSpacing: "0.15em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                        Check-in
                      </button>
                    )}
                    {canNoShow && (
                      <button onClick={() => setConfirm({ appt, action: 'noshow' })}
                        style={{ background: "transparent", border: "1px solid rgba(196,102,102,0.25)",
                          color: "#e07070", padding: "8px 16px", cursor: "pointer",
                          fontFamily: "'Outfit', sans-serif", fontSize: 11,
                          letterSpacing: "0.15em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                        No-show
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </PortalShell>
  );
};

// ── Vista cliente / estilista / anónimo ──────────────────────
const CheckInClientView = ({ store, setStore, employee, headerRight }) => {
  const [cedula,    setCedula]    = React.useState('');
  const [confirmed, setConfirmed] = React.useState(null);
  const [notFound,  setNotFound]  = React.useState(false);

  const confirmVisit = () => {
    const clean = cedula.replace(/\D/g, '');
    if (clean.length < 5) return;
    const today   = todayStr();
    const admin   = loadAdminCI();
    const noShowIds    = admin.noShowIds    || [];
    const cancelledIds = admin.cancelledIds || [];

    // Todas las citas válidas del cliente hoy en esta silla
    const candidates = store.appointments.filter(a =>
      a.cedula === clean &&
      a.date === today &&
      (!employee || a.stylist === employee.name) &&
      !noShowIds.includes(a.id) &&
      !cancelledIds.includes(a.id) &&
      a.status !== 'cancelled' &&
      !isPendingExpired(a)
    );
    if (candidates.length === 0) { setNotFound(true); return; }

    // Selecciona la más próxima vigente: primero las futuras ordenadas por hora, luego las pasadas
    const nowMin  = timeToMin(nowCOT().toTimeString().slice(0, 5));
    const upcoming = candidates.filter(a => timeToMin(a.time) >= nowMin)
      .sort((a, b) => timeToMin(a.time) - timeToMin(b.time));
    const appt = upcoming.length > 0
      ? upcoming[0]
      : candidates.sort((a, b) => timeToMin(b.time) - timeToMin(a.time))[0];

    setStore(s => ({
      ...s,
      appointments: s.appointments.map(a =>
        a.id === appt.id ? { ...a, checkedIn: true, checkedInAt: Date.now() } : a
      ),
    }));
    setConfirmed(appt);
    setNotFound(false);
  };

  return (
    <PortalShell tone="noir" header={
      <PortalHeader
        subtitle={employee ? `Silla · ${employee.name}` : "Check-In · Bienvenido"}
        title="Check-In"
        right={headerRight}
      />
    }>
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 20px" }}>
        {confirmed ? (
          <div style={{ width: "100%", maxWidth: 480, textAlign: "center" }}>
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              background: "rgba(102,196,153,0.15)", border: "1px solid rgba(102,196,153,0.4)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28, color: "#66C499", margin: "0 auto 28px",
            }}>✓</div>
            <PMono style={{ color: "#66C499" }}>Asistencia confirmada</PMono>
            <h2 style={{ fontFamily: "'Marcellus', serif", fontSize: 48, fontWeight: 400, margin: "16px 0 8px" }}>
              {confirmed.name}
            </h2>
            {employee && (
              <p style={{ fontSize: 14, opacity: 0.5, margin: "0 0 28px" }}>
                Silla de <span style={{ color: "#C29E66" }}>{employee.name}</span>
              </p>
            )}
            <div style={{ padding: "16px 24px", background: "#141212",
              border: "1px solid rgba(245,241,234,0.1)",
              fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
              letterSpacing: "0.15em", color: "#C29E66",
              display: "inline-block", marginBottom: 32 }}>
              {confirmed.code} · {confirmed.service}
            </div>
            <p style={{ fontSize: 13, opacity: 0.4, lineHeight: 1.6 }}>
              Tu visita ha sido registrada. ¡Disfruta tu servicio!
            </p>
          </div>
        ) : (
          <div style={{ width: "100%", maxWidth: 480 }}>
            {employee && (
              <PMono style={{ color: "#C29E66", display: "block", marginBottom: 12 }}>
                Silla de {employee.name} · {employee.role}
              </PMono>
            )}
            <h1 style={{ fontFamily: "'Marcellus', serif",
              fontSize: "clamp(34px, 6vw, 50px)", fontWeight: 400,
              margin: "0 0 12px", letterSpacing: "-0.01em",
              lineHeight: 1.1, color: "#F5F1EA" }}>
              {employee ? `Bienvenido a la silla de ${employee.name}.` : "Confirma tu visita."}
            </h1>
            <p style={{ fontSize: 15, opacity: 0.55, lineHeight: 1.6, marginBottom: 40, color: "#F5F1EA" }}>
              Ingresa tu cédula para confirmar tu asistencia al servicio de hoy.
            </p>
            <div style={{ background: "#141212", border: "1px solid rgba(245,241,234,0.1)", padding: 32 }}>
              <label htmlFor="checkin-cedula" style={{ display: "block", fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
                color: "#C29E66", marginBottom: 10 }}>Cédula de ciudadanía</label>
              <input id="checkin-cedula" name="cedula"
                type="tel"
                value={cedula}
                onChange={e => { setCedula(e.target.value.replace(/\D/g, '').slice(0, 12)); setNotFound(false); }}
                onKeyDown={e => e.key === 'Enter' && confirmVisit()}
                placeholder="1234567890"
                aria-invalid={notFound}
                aria-describedby={notFound ? "checkin-cedula-err" : undefined}
                autoFocus
                style={{ width: "100%", background: "#0C0C0C",
                  border: `1px solid ${notFound ? "#C46666" : "rgba(245,241,234,0.18)"}`,
                  color: "#F5F1EA", padding: "18px 20px",
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 20,
                  letterSpacing: "0.1em", marginBottom: notFound ? 10 : 20 }}
              />
              {notFound && (
                <div id="checkin-cedula-err" role="alert"
                  style={{ color: "#C46666", fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
                    marginBottom: 20, lineHeight: 1.5 }}>
                  No encontramos una cita para hoy con esa cédula
                  {employee ? ` en la silla de ${employee.name}` : ""}.
                </div>
              )}
              <button
                onClick={confirmVisit}
                disabled={cedula.replace(/\D/g, '').length < 5}
                style={{ width: "100%",
                  background: cedula.replace(/\D/g, '').length >= 5 ? "#C29E66" : "rgba(194,158,102,0.15)",
                  color: "#0C0C0C", border: "none", padding: "16px",
                  cursor: cedula.replace(/\D/g, '').length >= 5 ? "pointer" : "not-allowed",
                  fontFamily: "'Outfit', sans-serif", fontSize: 12,
                  letterSpacing: "0.18em", textTransform: "uppercase" }}>
                Confirmar asistencia →
              </button>
            </div>
            <p style={{ fontSize: 11, opacity: 0.3, marginTop: 20, textAlign: "center", color: "#F5F1EA",
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em" }}>
              {employee ? `QR exclusivo · silla de ${employee.name}` : "Escanea el QR de tu silla para registrar tu visita"}
            </p>
          </div>
        )}
      </main>
    </PortalShell>
  );
};

// ——————————————————————————————————————————————
// WHATSAPP BLOB
// ——————————————————————————————————————————————
const WABlob = () => {
  const [hovered, setHovered] = React.useState(false);
  return (
    <a
      href="https://wa.me/573124499862"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "fixed", bottom: 28, right: 28, zIndex: 9999,
        display: "flex", alignItems: "center", gap: 10,
        background: "#25D366", color: "#fff",
        borderRadius: 999, textDecoration: "none",
        padding: hovered ? "14px 22px 14px 18px" : "14px",
        boxShadow: "0 4px 24px rgba(37,211,102,0.35)",
        transition: "all 0.25s cubic-bezier(.4,0,.2,1)",
        overflow: "hidden", whiteSpace: "nowrap",
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      {hovered && (
        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 500 }}>
          Escríbenos
        </span>
      )}
    </a>
  );
};

// ============================================================
// AGENDA — Confirmación de citas + Resumen por empleado
// ============================================================
const AGENDA_SES = "joxe_agenda_session"; // { id, name, role }
const DAYS_ES = { dom: "Domingo", lun: "Lunes", mar: "Martes", mie: "Miércoles", jue: "Jueves", vie: "Viernes", sab: "Sábado" };
const fmtCOPAmt = n => "$" + Math.round(n || 0).toLocaleString("es-CO");

const AgendaPortal = () => {
  const [store, setStore] = useStore();
  // Auto-restore session from sessionStorage (same key used by Portal.html login)
  const [session, setSession] = React.useState(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(AGENDA_SES));
      return s?.id ? s : null;
    } catch { return null; }
  });
  const [empList, setEmpList] = React.useState([]);
  const [selId, setSelId] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [err, setErr] = React.useState("");
  const [confirmErr, setConfirmErr] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [confirming, setConfirming] = React.useState(null);
  const [confirmed, setConfirmed] = React.useState(null);
  // PIN prompt shown when session was auto-restored (pin not in memory)
  const [pinPrompt, setPinPrompt] = React.useState(null);
  const [pinInput, setPinInput]   = React.useState("");
  // Tabs + resumen
  const [view, setView] = React.useState("agenda");
  const [summaryData, setSummaryData] = React.useState(null);
  const [loadingSummary, setLoadingSummary] = React.useState(false);
  const [summaryErr, setSummaryErr] = React.useState("");
  const [summaryNeedPin, setSummaryNeedPin] = React.useState(false);
  const [summaryPinInput, setSummaryPinInput] = React.useState("");

  React.useEffect(() => {
    // Pre-select employee from previous session if available
    try {
      const s = JSON.parse(sessionStorage.getItem(AGENDA_SES));
      if (s?.id) setSelId(s.id);
    } catch {}
  }, []);

  React.useEffect(() => {
    fetch("/api/catalog")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.employees) setEmpList(d.employees); })
      .catch(() => {});
  }, []);

  const login = async () => {
    if (!selId || !pin) return;
    setLoading(true); setErr("");
    try {
      const res = await fetch("/api/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", empId: selId, pin }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "PIN incorrecto"); setPin(""); setLoading(false); return; }
      sessionStorage.setItem(AGENDA_SES, JSON.stringify(data.employee));
      if (data.token) sessionStorage.setItem("joxe_emp_token", data.token);
      setSession(data.employee);
      // pin stays in state for confirm calls during this session
    } catch { setErr("Error de conexión"); }
    setLoading(false);
  };

  const confirmAppt = async (appt, pinOverride) => {
    const usedPin = pinOverride ?? pin;
    if (!usedPin) {
      // Pin not in memory (session restored from Portal.html) — ask for it
      setPinPrompt(appt);
      setPinInput("");
      return;
    }
    setConfirming(appt.id);
    setConfirmErr("");
    setPinPrompt(null);
    try {
      const res = await fetch("/api/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", empId: session.id, pin: usedPin, apptId: appt.id }),
      });
      const data = await res.json();
      if (res.ok) {
        if (!pin) setPin(usedPin); // cache PIN for subsequent confirms this session
        setStore(s => ({
          ...s,
          appointments: s.appointments.map(a =>
            a.id === appt.id
              ? { ...a, status: "scheduled", confirmedAt: Date.now(), confirmedBy: session.name }
              : a
          ),
        }));
        setConfirmed(appt.id);
        setTimeout(() => setConfirmed(null), 3000);
      } else {
        setConfirmErr(data.error || "Error al confirmar la cita.");
        if (data.error?.toLowerCase().includes("pin")) setPin(""); // clear cached bad pin
      }
    } catch {
      setConfirmErr("Error de conexión. Intenta de nuevo.");
    }
    setConfirming(null);
  };

  const logout = () => {
    sessionStorage.removeItem(AGENDA_SES);
    setSession(null); setPin(""); setSelId(""); setErr(""); setConfirmErr("");
    setView("agenda"); setSummaryData(null);
  };

  const fetchSummary = React.useCallback(async (pinOverride) => {
    const usedPin = pinOverride ?? pin;
    if (!usedPin) { setSummaryNeedPin(true); return; }
    setLoadingSummary(true); setSummaryErr("");
    try {
      const res = await fetch("/api/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "summary", empId: session.id, pin: usedPin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSummaryErr(data.error || "Error al cargar el resumen");
      } else {
        setSummaryData(data);
        if (!pin) { setPin(usedPin); setSummaryNeedPin(false); setSummaryPinInput(""); }
      }
    } catch { setSummaryErr("Error de conexión"); }
    setLoadingSummary(false);
  }, [pin, session]);

  // Load summary when tab is opened
  React.useEffect(() => {
    if (view === "resumen" && session) fetchSummary();
  }, [view]);

  // Auto-refresh summary every 30s while on that tab
  React.useEffect(() => {
    if (view !== "resumen" || !session || !pin) return;
    const t = setInterval(() => fetchSummary(), 30000);
    return () => clearInterval(t);
  }, [view, session, pin]);

  const fmtDate = (d) => {
    if (!d) return "—";
    try { return new Date(d + "T12:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" }); }
    catch { return d; }
  };

  const today = new Date().toISOString().slice(0, 10);

  // Citas pendientes del empleado logueado (todas las fechas — para confirmar)
  const myPending = React.useMemo(() => {
    if (!session) return [];
    return (store.appointments || []).filter(
      a => a.stylist === session.name && a.status === "pending"
    ).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }, [store.appointments, session]);

  // Datos en vivo para la vista Resumen (desde el store que se actualiza cada 5s)
  const myTodayScheduled = React.useMemo(() => {
    if (!session) return [];
    return (store.appointments || []).filter(
      a => a.stylist === session.name && a.date === today &&
           (a.status === "scheduled" || a.status === "confirmed")
    ).sort((a, b) => a.time.localeCompare(b.time));
  }, [store.appointments, session, today]);

  const myTodayPending = React.useMemo(() => {
    if (!session) return [];
    return (store.appointments || []).filter(
      a => a.stylist === session.name && a.date === today && a.status === "pending"
    ).sort((a, b) => a.time.localeCompare(b.time));
  }, [store.appointments, session, today]);

  // ── LOGIN ──
  if (!session) {
    return (
      <PortalShell tone="noir" header={
        <PortalHeader tone="noir" subtitle="Equipo · Acceso" title="Mi agenda" />
      }>
        <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px" }}>
          <div style={{ width: "100%", maxWidth: 380 }}>
            <div style={{ marginBottom: 32 }}>
              <PMono style={{ color: "#C29E66", display: "block", marginBottom: 8 }}>Selecciona tu nombre</PMono>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {empList.length === 0 && (
                  <div style={{ color: "rgba(245,241,234,0.4)", fontSize: 13, padding: "16px 0" }}>
                    Cargando empleados…
                  </div>
                )}
                {empList.map(e => (
                  <button key={e.id} onClick={() => { setSelId(e.id); setPin(""); setErr(""); }}
                    style={{
                      padding: "16px 20px", textAlign: "left", cursor: "pointer",
                      background: selId === e.id ? "rgba(194,158,102,0.15)" : "rgba(245,241,234,0.04)",
                      border: `1px solid ${selId === e.id ? "#C29E66" : "rgba(245,241,234,0.1)"}`,
                      color: "#F5F1EA", fontFamily: "'Outfit', sans-serif", fontSize: 15,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                    <span>{e.name}</span>
                    <PMono style={{ color: "rgba(245,241,234,0.35)", fontSize: 9 }}>{e.role}</PMono>
                  </button>
                ))}
              </div>
            </div>

            {selId && (
              <div style={{ marginBottom: 24 }}>
                <label htmlFor="agenda-pin">
                  <PMono style={{ color: "#C29E66", display: "block", marginBottom: 8 }}>PIN</PMono>
                </label>
                <input id="agenda-pin" name="pin" autoComplete="off"
                  type="password" inputMode="numeric" maxLength={6}
                  value={pin}
                  onChange={e => { setPin(e.target.value.replace(/\D/g, "")); setErr(""); }}
                  onKeyDown={e => e.key === "Enter" && pin && login()}
                  aria-label="PIN de empleado"
                  placeholder="Ingresa tu PIN"
                  style={{
                    width: "100%", padding: "18px", textAlign: "center",
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 28,
                    letterSpacing: "0.5em", background: "rgba(245,241,234,0.05)",
                    border: "1px solid rgba(245,241,234,0.15)", color: "#F5F1EA",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            )}

            {err && (
              <div style={{
                padding: "12px 16px", marginBottom: 16,
                background: "rgba(196,102,102,0.1)", border: "1px solid rgba(196,102,102,0.3)",
                color: "#C46666", fontSize: 13,
              }}>{err}</div>
            )}

            <button onClick={login} disabled={!selId || !pin || loading}
              style={{
                width: "100%", padding: "18px",
                background: selId && pin ? "#C29E66" : "rgba(194,158,102,0.2)",
                color: selId && pin ? "#0C0C0C" : "rgba(194,158,102,0.4)",
                border: "none", cursor: selId && pin ? "pointer" : "not-allowed",
                fontFamily: "'Outfit', sans-serif", fontSize: 13,
                letterSpacing: "0.2em", textTransform: "uppercase",
              }}>
              {loading ? "Verificando…" : "Entrar →"}
            </button>
          </div>
        </main>
      </PortalShell>
    );
  }

  // ── TAB BAR ──
  const tabBar = (
    <div style={{
      display: "flex", borderBottom: "1px solid rgba(245,241,234,0.1)",
      maxWidth: 520, margin: "0 auto", width: "100%", boxSizing: "border-box",
      padding: "0 24px",
    }}>
      {[["agenda", "Mi Agenda"], ["resumen", "Resumen"]].map(([v, label]) => (
        <button key={v} onClick={() => setView(v)} style={{
          padding: "14px 20px", background: "transparent", border: "none",
          borderBottom: `2px solid ${view === v ? "#C29E66" : "transparent"}`,
          color: view === v ? "#C29E66" : "rgba(245,241,234,0.4)",
          cursor: "pointer", fontFamily: "'Outfit', sans-serif",
          fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
          marginBottom: -1, transition: "color 0.2s",
        }}>{label}</button>
      ))}
    </div>
  );

  // ── RESUMEN VIEW ──
  if (view === "resumen") {
    const sd = summaryData;

    // Revenue breakdown by method
    const byMethod = {};
    (sd?.revenueEntries || []).forEach(r => {
      byMethod[r.method] = (byMethod[r.method] || 0) + r.amount;
    });

    // Work hours
    const wh = sd?.workHours;
    const dayOrder = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];

    const ApptRowSimple = ({ a, badge, badgeColor }) => (
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px", marginBottom: 6,
        background: "rgba(245,241,234,0.04)",
        border: "1px solid rgba(245,241,234,0.08)",
      }}>
        <PMono style={{ fontSize: 12, color: "#F5F1EA", minWidth: 42 }}>{a.time}</PMono>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontFamily: "'Outfit', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name || "—"}</div>
          <PMono style={{ fontSize: 9, color: "rgba(245,241,234,0.4)", display: "block", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.service}</PMono>
        </div>
        {badge && (
          <PMono style={{ fontSize: 9, color: badgeColor || "#C29E66", padding: "3px 8px", border: `1px solid ${badgeColor || "#C29E66"}`, flexShrink: 0 }}>
            {badge}
          </PMono>
        )}
      </div>
    );

    const SectionHead = ({ label, count }) => (
      <PMono style={{ color: "#C29E66", display: "block", marginBottom: 10, marginTop: 28 }}>
        {label}{count !== undefined ? ` · ${count}` : ""}
      </PMono>
    );

    const empty = (msg) => (
      <div style={{ padding: "16px", border: "1px solid rgba(245,241,234,0.06)", textAlign: "center" }}>
        <PMono style={{ color: "rgba(245,241,234,0.25)", fontSize: 10 }}>{msg}</PMono>
      </div>
    );

    return (
      <PortalShell tone="noir" header={
        <PortalHeader
          tone="noir"
          subtitle={session.role + " · Resumen"}
          title={session.name}
          right={
            <button onClick={logout} style={{
              background: "transparent", border: "none", color: "rgba(245,241,234,0.5)",
              cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 12,
              letterSpacing: "0.15em", textTransform: "uppercase",
            }}>Salir</button>
          }
        />
      }>
        {tabBar}

        <main style={{ flex: 1, padding: "8px 24px 40px", maxWidth: 520, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>

          {/* PIN needed for session restored without pin */}
          {summaryNeedPin && (
            <div style={{ marginTop: 32, padding: 24, border: "1px solid rgba(194,158,102,0.2)", background: "rgba(194,158,102,0.04)" }}>
              <PMono style={{ color: "#C29E66", display: "block", marginBottom: 12 }}>Confirma tu PIN para ver el resumen</PMono>
              <input type="password" inputMode="numeric" maxLength={6} autoFocus
                value={summaryPinInput}
                onChange={e => setSummaryPinInput(e.target.value.replace(/\D/g, ""))}
                onKeyDown={e => e.key === "Enter" && summaryPinInput && fetchSummary(summaryPinInput)}
                placeholder="••••"
                style={{
                  width: "100%", padding: "16px", marginBottom: 12,
                  background: "#0C0C0C", border: "1px solid rgba(245,241,234,0.15)",
                  color: "#F5F1EA", fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 28, letterSpacing: "0.4em", textAlign: "center", boxSizing: "border-box",
                }}
              />
              <button onClick={() => summaryPinInput && fetchSummary(summaryPinInput)}
                disabled={!summaryPinInput || loadingSummary}
                style={{
                  width: "100%", padding: "14px",
                  background: summaryPinInput ? "#C29E66" : "rgba(194,158,102,0.2)",
                  color: summaryPinInput ? "#0C0C0C" : "rgba(194,158,102,0.4)",
                  border: "none", cursor: summaryPinInput ? "pointer" : "not-allowed",
                  fontFamily: "'Outfit', sans-serif", fontSize: 12,
                  letterSpacing: "0.15em", textTransform: "uppercase",
                }}>
                {loadingSummary ? "Cargando…" : "Ver resumen →"}
              </button>
            </div>
          )}

          {!summaryNeedPin && summaryErr && (
            <div style={{ marginTop: 24, padding: "12px 16px", background: "rgba(196,102,102,0.1)", border: "1px solid rgba(196,102,102,0.3)", color: "#C46666", fontSize: 13 }}>
              {summaryErr}
              <button onClick={() => fetchSummary()} style={{ marginLeft: 12, background: "transparent", border: "none", color: "#C29E66", cursor: "pointer", fontSize: 12, fontFamily: "'Outfit', sans-serif", letterSpacing: "0.1em" }}>Reintentar</button>
            </div>
          )}

          {!summaryNeedPin && loadingSummary && !sd && (
            <div style={{ textAlign: "center", padding: "56px 0" }}>
              <PMono style={{ color: "rgba(245,241,234,0.3)", fontSize: 10 }}>Cargando resumen…</PMono>
            </div>
          )}

          {!summaryNeedPin && (
            <>
              {/* ── TOTAL DEL DÍA ── */}
              <SectionHead label="Total del día" />
              <div style={{ padding: "20px 20px 16px", background: "rgba(194,158,102,0.06)", border: "1px solid rgba(194,158,102,0.2)", marginBottom: 4 }}>
                <div style={{ fontFamily: "'Marcellus', serif", fontSize: 32, marginBottom: 12 }}>
                  {fmtCOPAmt(sd?.totalHoy || 0)}
                </div>
                {Object.keys(byMethod).length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {Object.entries(byMethod).map(([m, amt]) => (
                      <div key={m} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <PMono style={{ fontSize: 9, color: "rgba(245,241,234,0.4)" }}>{m}</PMono>
                        <PMono style={{ fontSize: 11, color: "#F5F1EA" }}>{fmtCOPAmt(amt)}</PMono>
                      </div>
                    ))}
                  </div>
                ) : (
                  <PMono style={{ fontSize: 9, color: "rgba(245,241,234,0.3)" }}>Sin ingresos registrados hoy</PMono>
                )}
              </div>
              {/* refresh hint */}
              <div style={{ textAlign: "right", marginBottom: 4 }}>
                <button onClick={() => fetchSummary()} style={{ background: "transparent", border: "none", color: "rgba(245,241,234,0.25)", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 10, letterSpacing: "0.1em" }}>
                  ↺ Actualizar
                </button>
              </div>

              {/* ── CONFIRMADOS HOY ── */}
              <SectionHead label="Confirmados hoy" count={myTodayScheduled.length} />
              {myTodayScheduled.length === 0
                ? empty("Sin turnos confirmados para hoy")
                : myTodayScheduled.map(a => (
                  <ApptRowSimple key={a.id} a={a}
                    badge={a.status === "confirmed" ? "Check-in" : "Confirmado"}
                    badgeColor={a.status === "confirmed" ? "#66C499" : "#C29E66"}
                  />
                ))
              }

              {/* ── POR CONFIRMAR CONSIGNACIÓN ── */}
              <SectionHead label="Por confirmar consignación" count={myTodayPending.length} />
              {myTodayPending.length === 0
                ? empty("Sin solicitudes pendientes para hoy")
                : myTodayPending.map(a => {
                  const isDone = confirmed === a.id;
                  const isLoading = confirming === a.id;
                  return (
                    <div key={a.id} style={{
                      padding: "14px 16px", marginBottom: 6,
                      background: isDone ? "rgba(102,196,153,0.07)" : "rgba(245,241,234,0.04)",
                      border: `1px solid ${isDone ? "rgba(102,196,153,0.3)" : "rgba(245,241,234,0.1)"}`,
                      transition: "all 0.3s",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: isDone ? 0 : 10 }}>
                        <PMono style={{ fontSize: 12, color: "#F5F1EA", minWidth: 42 }}>{a.time}</PMono>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontFamily: "'Outfit', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name || "—"}</div>
                          <PMono style={{ fontSize: 9, color: "rgba(245,241,234,0.4)", display: "block", marginTop: 2 }}>{a.service}</PMono>
                        </div>
                        {isDone && <PMono style={{ fontSize: 9, color: "#66C499", padding: "3px 8px", border: "1px solid rgba(102,196,153,0.4)", flexShrink: 0 }}>✓ Confirmado</PMono>}
                      </div>
                      {!isDone && (
                        <button onClick={() => confirmAppt(a)} disabled={isLoading}
                          style={{
                            width: "100%", padding: "10px",
                            background: "#C29E66", color: "#0C0C0C",
                            border: "none", cursor: isLoading ? "not-allowed" : "pointer",
                            fontFamily: "'Outfit', sans-serif", fontSize: 11,
                            letterSpacing: "0.15em", textTransform: "uppercase",
                            opacity: isLoading ? 0.6 : 1,
                          }}>
                          {isLoading ? "Confirmando…" : "✓ Confirmar cita"}
                        </button>
                      )}
                    </div>
                  );
                })
              }

              {/* ── COMPLETADOS ── */}
              {(() => {
                const completedList = [...(sd?.active || []), ...(sd?.completed || [])];
                return (
                  <>
                    <SectionHead label="Completados hoy" count={completedList.length} />
                    {completedList.length === 0
                      ? empty("Sin servicios completados hoy")
                      : completedList.sort((a, b) => (a.time || "").localeCompare(b.time || "")).map(a => (
                        <ApptRowSimple key={a.id} a={a} badge="✓ Listo" badgeColor="rgba(102,196,153,0.8)" />
                      ))
                    }
                  </>
                );
              })()}

              {/* ── HORARIOS DISPONIBLES ── */}
              <SectionHead label="Configuración de turnos" />
              {wh ? (
                <div style={{ border: "1px solid rgba(245,241,234,0.08)" }}>
                  {dayOrder.map(d => {
                    const h = wh[d];
                    if (!h) return null;
                    return (
                      <div key={d} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "11px 16px", borderBottom: "1px solid rgba(245,241,234,0.05)",
                      }}>
                        <PMono style={{ fontSize: 10, color: "rgba(245,241,234,0.45)" }}>{DAYS_ES[d]}</PMono>
                        <PMono style={{ fontSize: 11 }}>{h.open} — {h.close}</PMono>
                      </div>
                    );
                  }).filter(Boolean)}
                </div>
              ) : (
                empty("Sin horario configurado · Contacta al administrador")
              )}
            </>
          )}
        </main>

        {/* PIN prompt overlay — shown when session was auto-restored from Portal.html */}
        {pinPrompt && (
          <div role="dialog" aria-modal="true" style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(12,12,12,0.82)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
          }}
            onClick={e => { if (e.target === e.currentTarget) { setPinPrompt(null); setPinInput(""); } }}
          >
            <div style={{
              background: "#141212", color: "#F5F1EA",
              border: "1px solid rgba(245,241,234,0.12)",
              padding: 32, maxWidth: 360, width: "100%",
            }}>
              <PMono style={{ color: "#C29E66", display: "block", marginBottom: 10 }}>Confirmar identidad</PMono>
              <div style={{ fontFamily: "'Marcellus', serif", fontSize: 22, marginBottom: 6 }}>{pinPrompt.name}</div>
              <div style={{ fontSize: 13, opacity: 0.55, marginBottom: 24 }}>
                {pinPrompt.service} · {pinPrompt.date} {pinPrompt.time}
              </div>
              <label htmlFor="agenda-pin-confirm">
                <PMono style={{ fontSize: 9, color: "rgba(245,241,234,0.5)", display: "block", marginBottom: 8 }}>Tu PIN para aprobar</PMono>
              </label>
              <input id="agenda-pin-confirm" type="password" inputMode="numeric" maxLength={6}
                autoFocus value={pinInput}
                onChange={e => { setPinInput(e.target.value.replace(/\D/g, "")); setConfirmErr(""); }}
                onKeyDown={e => e.key === "Enter" && pinInput && confirmAppt(pinPrompt, pinInput)}
                placeholder="••••"
                style={{
                  width: "100%", padding: "16px", marginBottom: 16,
                  background: "#0C0C0C", border: "1px solid rgba(245,241,234,0.15)",
                  color: "#F5F1EA", fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 28, letterSpacing: "0.4em", textAlign: "center", boxSizing: "border-box",
                }}
              />
              {confirmErr && <div style={{ marginBottom: 12, fontSize: 12, color: "#C46666" }}>{confirmErr}</div>}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setPinPrompt(null); setPinInput(""); setConfirmErr(""); }} style={{
                  flex: 1, padding: "14px", background: "transparent",
                  border: "1px solid rgba(245,241,234,0.2)", color: "rgba(245,241,234,0.7)",
                  cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                  fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase",
                }}>Cancelar</button>
                <button onClick={() => pinInput && confirmAppt(pinPrompt, pinInput)}
                  disabled={!pinInput || !!confirming}
                  style={{
                    flex: 2, padding: "14px",
                    background: pinInput ? "#C29E66" : "rgba(194,158,102,0.2)",
                    color: pinInput ? "#0C0C0C" : "rgba(194,158,102,0.4)",
                    border: "none", cursor: pinInput ? "pointer" : "not-allowed",
                    fontFamily: "'Outfit', sans-serif", fontSize: 12,
                    letterSpacing: "0.15em", textTransform: "uppercase",
                  }}>
                  {confirming ? "Confirmando…" : "✓ Aprobar cita"}
                </button>
              </div>
            </div>
          </div>
        )}
      </PortalShell>
    );
  }

  // ── AGENDA ──
  return (
    <PortalShell tone="noir" header={
      <PortalHeader
        tone="noir"
        subtitle={session.role + " · Mi agenda"}
        title={session.name}
        right={
          <button onClick={logout} style={{
            background: "transparent", border: "none", color: "rgba(245,241,234,0.5)",
            cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 12,
            letterSpacing: "0.15em", textTransform: "uppercase",
          }}>Salir</button>
        }
      />
    }>
      {tabBar}

      <main style={{ flex: 1, padding: "8px 24px 40px", maxWidth: 520, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <PMono style={{ color: "#C29E66", display: "block", marginBottom: 20, marginTop: 20 }}>
          Solicitudes pendientes · {myPending.length}
        </PMono>

        {confirmErr && (
          <div style={{
            padding: "12px 16px", marginBottom: 16,
            background: "rgba(196,102,102,0.1)", border: "1px solid rgba(196,102,102,0.3)",
            color: "#C46666", fontSize: 13,
          }}>{confirmErr}</div>
        )}

        {myPending.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "56px 24px",
            border: "1px solid rgba(245,241,234,0.08)",
          }}>
            <div style={{ fontFamily: "'Marcellus', serif", fontSize: 32, marginBottom: 12, opacity: 0.3 }}>—</div>
            <PMono style={{ color: "rgba(245,241,234,0.3)", fontSize: 10 }}>Sin solicitudes pendientes</PMono>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {myPending.map(a => {
              const isDone = confirmed === a.id;
              const isLoading = confirming === a.id;
              return (
                <div key={a.id} style={{
                  background: isDone ? "rgba(102,196,153,0.08)" : "rgba(245,241,234,0.04)",
                  border: `1px solid ${isDone ? "rgba(102,196,153,0.35)" : "rgba(245,241,234,0.1)"}`,
                  padding: "20px",
                  transition: "all 0.3s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontFamily: "'Marcellus', serif", fontSize: 18, marginBottom: 4 }}>{a.name}</div>
                      <PMono style={{ color: "#C29E66", fontSize: 10 }}>{a.service}</PMono>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <PMono style={{ color: "rgba(245,241,234,0.5)", fontSize: 10, display: "block" }}>
                        {fmtDate(a.date)}
                      </PMono>
                      <PMono style={{ color: "#F5F1EA", fontSize: 13 }}>{a.time}</PMono>
                    </div>
                  </div>

                  {a.phone && (
                    <div style={{ marginBottom: 14 }}>
                      <PMono style={{ color: "rgba(245,241,234,0.3)", fontSize: 9, display: "block", marginBottom: 4 }}>WhatsApp</PMono>
                      <div style={{ fontSize: 13, color: "rgba(245,241,234,0.7)" }}>{a.phone}</div>
                    </div>
                  )}

                  {isDone ? (
                    <div style={{
                      padding: "12px 16px", background: "rgba(102,196,153,0.1)",
                      border: "1px solid rgba(102,196,153,0.3)",
                      color: "#66C499", fontSize: 13, textAlign: "center",
                    }}>✓ Cita confirmada</div>
                  ) : (
                    <button onClick={() => confirmAppt(a)} disabled={isLoading}
                      style={{
                        width: "100%", padding: "14px",
                        background: "#C29E66", color: "#0C0C0C",
                        border: "none", cursor: isLoading ? "not-allowed" : "pointer",
                        fontFamily: "'Outfit', sans-serif", fontSize: 13,
                        letterSpacing: "0.15em", textTransform: "uppercase",
                        opacity: isLoading ? 0.6 : 1,
                      }}>
                      {isLoading ? "Confirmando…" : "✓ Confirmar cita"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* PIN prompt overlay — shown when session was auto-restored from Portal.html */}
      {pinPrompt && (
        <div role="dialog" aria-modal="true" style={{
          position: "fixed", inset: 0, zIndex: 9000,
          background: "rgba(12,12,12,0.82)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}
          onClick={e => { if (e.target === e.currentTarget) { setPinPrompt(null); setPinInput(""); } }}
        >
          <div style={{
            background: "#141212", color: "#F5F1EA",
            border: "1px solid rgba(245,241,234,0.12)",
            padding: 32, maxWidth: 360, width: "100%",
          }}>
            <PMono style={{ color: "#C29E66", display: "block", marginBottom: 10 }}>Confirmar identidad</PMono>
            <div style={{ fontFamily: "'Marcellus', serif", fontSize: 22, marginBottom: 6 }}>
              {pinPrompt.name}
            </div>
            <div style={{ fontSize: 13, opacity: 0.55, marginBottom: 24 }}>
              {pinPrompt.service} · {pinPrompt.date} {pinPrompt.time}
            </div>
            <label htmlFor="agenda-pin-confirm">
              <PMono style={{ fontSize: 9, color: "rgba(245,241,234,0.5)", display: "block", marginBottom: 8 }}>
                Tu PIN para aprobar
              </PMono>
            </label>
            <input id="agenda-pin-confirm" type="password" inputMode="numeric" maxLength={6}
              autoFocus
              value={pinInput}
              onChange={e => { setPinInput(e.target.value.replace(/\D/g, "")); setConfirmErr(""); }}
              onKeyDown={e => e.key === "Enter" && pinInput && confirmAppt(pinPrompt, pinInput)}
              placeholder="••••"
              style={{
                width: "100%", padding: "16px", marginBottom: 16,
                background: "#0C0C0C", border: "1px solid rgba(245,241,234,0.15)",
                color: "#F5F1EA", fontFamily: "'JetBrains Mono', monospace",
                fontSize: 28, letterSpacing: "0.4em", textAlign: "center",
                boxSizing: "border-box",
              }}
            />
            {confirmErr && (
              <div style={{ marginBottom: 12, fontSize: 12, color: "#C46666" }}>{confirmErr}</div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setPinPrompt(null); setPinInput(""); setConfirmErr(""); }} style={{
                flex: 1, padding: "14px", background: "transparent",
                border: "1px solid rgba(245,241,234,0.2)", color: "rgba(245,241,234,0.7)",
                cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase",
              }}>Cancelar</button>
              <button onClick={() => pinInput && confirmAppt(pinPrompt, pinInput)}
                disabled={!pinInput || !!confirming}
                style={{
                  flex: 2, padding: "14px",
                  background: pinInput ? "#C29E66" : "rgba(194,158,102,0.2)",
                  color: pinInput ? "#0C0C0C" : "rgba(194,158,102,0.4)",
                  border: "none", cursor: pinInput ? "pointer" : "not-allowed",
                  fontFamily: "'Outfit', sans-serif", fontSize: 12,
                  letterSpacing: "0.15em", textTransform: "uppercase",
                }}>
                {confirming ? "Confirmando…" : "✓ Aprobar cita"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
};

Object.assign(window, {
  BookingPortal, ScanPortal, LobbyPortal, HomePortal, CuentaPortal, CheckInPortal,
  AgendaPortal,
  QRCode, PortalShell, PortalHeader, PMono, useStore, WABlob,
  Dialog, useDialog,
});
