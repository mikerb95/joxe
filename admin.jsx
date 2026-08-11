// JOXE Admin Portal — Panel de gestión del barbero

// ==================== STORES (Turso via API + localStorage cache) ====================
const ADMIN_KEY = "joxe_admin_v1";
const APPT_KEY  = "joxe_turnos_v1";
const SES_KEY   = "joxe_admin_session"; // stores the password as session token

const EMP_SES_KEY   = "joxe_emp_session"; // { id, name, role } for employee sessions
const EMP_TOKEN_KEY = "joxe_emp_token";   // signed JWT for authenticated API reads

// ---- Auth helpers — admin ----
const getToken   = () => sessionStorage.getItem(SES_KEY) ?? "";
const isAuthed   = () => !!sessionStorage.getItem(SES_KEY);
const doLogin    = (pw) => sessionStorage.setItem(SES_KEY, pw);
const doLogout   = () => {
  sessionStorage.removeItem(SES_KEY);
  sessionStorage.removeItem(EMP_SES_KEY);
  sessionStorage.removeItem(EMP_TOKEN_KEY);
};

// ---- Auth helpers — employee ----
const getEmpSession  = () => { try { return JSON.parse(sessionStorage.getItem(EMP_SES_KEY)); } catch { return null; } };
const isEmpAuthed    = () => !!sessionStorage.getItem(EMP_SES_KEY);
const doEmpLogin     = (emp) => sessionStorage.setItem(EMP_SES_KEY, JSON.stringify(emp));
const doEmpLogout    = () => sessionStorage.removeItem(EMP_SES_KEY);

// Picks admin token or employee JWT, whichever is available
const storeToken = () =>
  sessionStorage.getItem(SES_KEY) || sessionStorage.getItem(EMP_TOKEN_KEY) || "";

const adminHeaders = () => ({
  "Content-Type": "application/json",
  "Authorization": `Bearer ${getToken()}`,
});

// Como adminHeaders pero también acepta el JWT de empleado — para endpoints abiertos a cualquier staff
const staffHeaders = () => ({
  "Content-Type": "application/json",
  "Authorization": `Bearer ${storeToken()}`,
});

// ---- Polling ----
// Sondeo periódico que se detiene mientras la pestaña está oculta. Las pestañas
// de recepción quedan abiertas todo el día en segundo plano; sin esta pausa
// seguían golpeando la base de datos cada pocos segundos sin que nadie mirara,
// que fue lo que agotó la cuota de lecturas de Turso. Al volver al primer plano
// se hace un pull inmediato, así que la vista sigue estando al día.
const usePolling = (fn, ms) => {
  React.useEffect(() => {
    if (!ms) return;
    let timer = null;
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const start = () => { if (!timer) timer = setInterval(fn, ms); };
    const sync = () => {
      if (document.hidden) { stop(); return; }
      fn();
      start();
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => { stop(); document.removeEventListener("visibilitychange", sync); };
  }, [fn, ms]);
};

// ---- Admin store (services, revenue, settings) ----
const DEFAULT_ADMIN = () => ({
  salonName: "JOXE",
  stylists: ["Joxe", "Laura M.", "Camila R."],
  cancelledIds: [],
  services: [
    { id:"s1", name:"Corte mujer",        price:85000,  dur:60,  active:true },
    { id:"s2", name:"Corte hombre",       price:45000,  dur:40,  active:true },
    { id:"s3", name:"Balayage",           price:280000, dur:180, active:true, note:"desde" },
    { id:"s4", name:"Color correction",   price:320000, dur:240, active:true, note:"desde" },
    { id:"s5", name:"Color raíz",         price:120000, dur:90,  active:true },
    { id:"s6", name:"Keratina",           price:260000, dur:180, active:true, note:"desde" },
    { id:"s7", name:"Asesoría de imagen", price:180000, dur:90,  active:true },
    { id:"s8", name:"Peinado novia",      price:220000, dur:120, active:true, note:"desde" },
  ],
  employees: [
    { id:"e1", name:"Joxe",     role:"Estilista",   services:["s1","s2","s3","s4","s5","s6","s7","s8"], active:true },
    { id:"e2", name:"Laura M.", role:"Estilista",   services:["s1","s2","s3","s5","s6","s8"], active:true },
    { id:"e3", name:"Camila R.",role:"Colorista",   services:["s3","s4","s5","s6"], active:true },
  ],
  revenue: [],
  expenses: [],
  payouts: [],
  selfService: { allowCancel: true, minHoursBefore: 2 },
  noShowIds: [],
  noShowFine: { enabled: false, defaultAmount: 0, byDay: {} },
  archivedEmployees: [],
  chairsCount: 3,
  chairAssignments: {},
});

const loadAdminCache = () => {
  try {
    const s = JSON.parse(localStorage.getItem(ADMIN_KEY));
    const d = DEFAULT_ADMIN();
    return s ? { ...d, ...s, services: s.services || d.services, employees: s.employees || d.employees } : d;
  } catch { return DEFAULT_ADMIN(); }
};

const useAdmin = () => {
  const [a, setA] = React.useState(loadAdminCache);
  const stateRef  = React.useRef(null);

  const setAWithRef = React.useCallback((next) => {
    stateRef.current = next;
    setA(next);
  }, []);

  const pull = React.useCallback(async () => {
    if (!isAuthed()) return;
    try {
      const res = await fetch("/api/admin", { headers: adminHeaders() });
      if (res.status === 401) { doLogout(); return; }
      if (!res.ok) return;
      const data = await res.json();
      localStorage.setItem(ADMIN_KEY, JSON.stringify(data));
      const ref = stateRef.current;
      const base = (ref && typeof ref !== "function") ? ref : loadAdminCache();
      setAWithRef({ ...base, ...data });
    } catch {}
  }, [setAWithRef]);

  // Configuración del salón: cambia muy rara vez, no necesita sondeo rápido.
  usePolling(pull, 60000);

  const setAdmin = React.useCallback(async (fn) => {
    // Use in-memory ref (fresh state) instead of stale localStorage
    const current = stateRef.current ?? loadAdminCache();
    const next = typeof fn === "function" ? fn(current) : fn;
    setAWithRef(next);
    localStorage.setItem(ADMIN_KEY, JSON.stringify(next));
    try {
      await fetch("/api/admin", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify(next),
      });
    } catch (err) {
      console.warn("[admin] save failed", err.message);
    }
  }, [setAWithRef]);

  return [a, setAdmin];
};

// ---- CRM store (client profiles + loyalty) ----
const CRM_KEY = "joxe_crm_v1";

const loadCrmCache = () => {
  try {
    const s = JSON.parse(localStorage.getItem(CRM_KEY));
    return s || {};
  } catch { return {}; }
};

const useCrm = () => {
  const [crm, setCrm] = React.useState(loadCrmCache);

  const pull = React.useCallback(async () => {
    if (!isAuthed()) return;
    try {
      const res = await fetch("/api/crm", { headers: adminHeaders() });
      if (res.status === 401) { doLogout(); return; }
      if (!res.ok) return;
      const data = await res.json();
      localStorage.setItem(CRM_KEY, JSON.stringify(data));
      setCrm(data);
    } catch {}
  }, []);

  // Fichas de clientes: sólo cambian cuando alguien las edita desde el panel.
  usePolling(pull, 60000);

  const setCrmData = React.useCallback(async (fn) => {
    const current = loadCrmCache();
    const next = typeof fn === "function" ? fn(current) : fn;
    setCrm(next);
    localStorage.setItem(CRM_KEY, JSON.stringify(next));
    try {
      await fetch("/api/crm", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify(next),
      });
    } catch (err) {
      console.warn("[crm] save failed", err.message);
    }
  }, []);

  return [crm, setCrmData];
};

// ---- Appointment store (shared with portal) ----
const DEFAULT_APPTS = () => ({ appointments:[], active:[], completed:[], blockedSlots:[], blockRanges:[], timeWarnings:[] });

const loadApptCache = () => {
  try {
    const s = JSON.parse(localStorage.getItem(APPT_KEY));
    return s ? { ...DEFAULT_APPTS(), ...s } : DEFAULT_APPTS();
  } catch { return DEFAULT_APPTS(); }
};

const useAppts = () => {
  const [s, setS] = React.useState(loadApptCache);
  // Version stamp of the store we last read, for optimistic-concurrency writes.
  const versionRef = React.useRef(0);

  const pull = React.useCallback(async () => {
    try {
      const t = storeToken();
      const headers = t ? { "Authorization": `Bearer ${t}` } : {};
      const res = await fetch("/api/store", { headers });
      if (!res.ok) return;
      const { _v, ...data } = await res.json();
      versionRef.current = Number(_v) || 0;
      localStorage.setItem(APPT_KEY, JSON.stringify(data));
      setS(data);
    } catch {}
  }, []);

  // Turnos: es el dato vivo, pero el BroadcastChannel de abajo ya propaga al
  // instante los cambios hechos en este mismo dispositivo. El sondeo sólo cubre
  // cambios hechos desde otro equipo, y para eso 30 s alcanza.
  usePolling(pull, 30000);

  React.useEffect(() => {
    let bc;
    try {
      bc = new BroadcastChannel("joxe_turnos");
      bc.addEventListener("message", pull);
    } catch {}
    return () => { try { bc?.close(); } catch {} };
  }, [pull]);

  // Optimistic concurrency: send the version we based the edit on. If the store
  // moved since (e.g. a client booking landed via /api/book), the server rejects
  // with 409 + the fresh store; we reconcile, re-apply the updater on top, and
  // retry — so an admin edit never silently drops a concurrent booking.
  const setAppts = React.useCallback(async (fn) => {
    const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${storeToken()}` };
    for (let attempt = 0; attempt < 4; attempt++) {
      const next = typeof fn === "function" ? fn(loadApptCache()) : fn;
      setS(next);
      localStorage.setItem(APPT_KEY, JSON.stringify(next));
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
            localStorage.setItem(APPT_KEY, JSON.stringify(data.store));
            setS(data.store);
          }
          continue; // re-apply updater on the reconciled base
        }
        const data = await res.json().catch(() => null);
        if (data && data._v != null) versionRef.current = Number(data._v) || 0;
        try { new BroadcastChannel("joxe_turnos").postMessage({ type:"update" }); } catch {}
        return;
      } catch (err) {
        console.warn("[appts] save failed", err.message);
        return;
      }
    }
    console.warn("[appts] save gave up after repeated conflicts");
  }, []);

  return [s, setAppts];
};

// ==================== HELPERS ====================
// Hora Colombia (COT = UTC-5) — evita que el servidor/navegador en UTC
// muestre el día equivocado durante la noche en Bogotá.
const nowCOT = () => new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
// Formatea un Date a "YYYY-MM-DD" usando sus campos locales (no UTC), para
// no cruzar de día al convertir con toISOString() en horas de la tarde/noche.
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const todayStr = () => ymd(nowCOT());
const genId    = () => Math.random().toString(36).slice(2, 10);
const TIMES    = ["9:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];
// Rango horario que muestra la vista diaria vertical de la agenda (10am a 10pm)
const AGENDA_HOURS = ["10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00"];

// ---- Booking availability helpers (mirror booking portal) ----
const timeToMin = (t) => { const [h,m]=String(t).split(":").map(Number); return h*60+(m||0); };
const minToTime = (mins) => `${Math.floor(mins/60)}:${String(mins%60).padStart(2,"0")}`;
// Convierte "HH:MM" (24h, formato interno) a "h:MM AM/PM" para mostrar en la UI.
const formatTime12h = (t) => {
  if (!t) return "—";
  const [h, m] = String(t).split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, "0")} ${period}`;
};
// Salon business hours by JS getDay(): 0=dom … 6=sab.
// El salón no tiene días cerrados fijos: la disponibilidad real la define
// cada empleado en su workHours y sus ausencias (blockRanges).
const ALL_DAY_SLOTS = ["10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];
const BUSINESS_HOURS = {
  0:ALL_DAY_SLOTS, 1:ALL_DAY_SLOTS, 2:ALL_DAY_SLOTS, 3:ALL_DAY_SLOTS,
  4:ALL_DAY_SLOTS, 5:ALL_DAY_SLOTS, 6:ALL_DAY_SLOTS,
};
const CLOSE_TIME_MIN = { 0:21*60, 1:21*60, 2:21*60, 3:21*60, 4:21*60, 5:21*60, 6:21*60 };
const WORK_DAY_KEYS  = ["dom","lun","mar","mie","jue","vie","sab"];
const dayOfWeekIdx = (dateStr) => new Date(dateStr+"T12:00").getDay();
const isClosedDay  = (dateStr) => !BUSINESS_HOURS[dayOfWeekIdx(dateStr)];
const slotsForDate = (dateStr) => BUSINESS_HOURS[dayOfWeekIdx(dateStr)] || [];
const closesAtMin  = (dateStr) => CLOSE_TIME_MIN[dayOfWeekIdx(dateStr)] ?? 0;
// false if the slot+duration falls outside the employee's configured work hours
const empWorksOnSlot = (emp, date, timeStr, dur) => {
  if (!emp?.workHours) return true; // no schedule configured — no restriction
  const day = emp.workHours[WORK_DAY_KEYS[dayOfWeekIdx(date)]];
  if (!day?.active) return false;
  const s = timeToMin(timeStr), e = s + dur;
  return s >= timeToMin(day.start) && e <= timeToMin(day.end);
};

// ---- Unified block-range model (mirrors lib/blocks.js on the server) ----
// blockedSlots (legacy) = one 30-min cell per entry. blockRanges (current) =
// flexible date/time ranges, optionally multi-day or spanning the whole day
// (absences). Legacy entries are read and converted on the fly so old data
// keeps working; anything created going forward is written as a blockRange.
// LEGACY_SLOT_MIN is fixed at 30: that is what old blockedSlots actually mean,
// and it must stay in sync with lib/blocks.js and portal.jsx. BLOCK_SLOT_MIN is
// the size of a block created today — one hour, matching the hourly grid.
const LEGACY_SLOT_MIN = 30;
const BLOCK_SLOT_MIN = 60;
const legacySlotToRange = (s) => {
  const endMin = timeToMin(s.time) + LEGACY_SLOT_MIN;
  return {
    id: s.id, dateStart: s.date, dateEnd: s.date, allDay: false,
    timeStart: s.time, timeEnd: minToTime(endMin),
    employeeId: s.employeeId ?? null, reason: s.reason || "No disponible",
    type: "block", createdAt: s.createdAt || 0, _legacy: true,
  };
};
const normalizeBlocks = (appts) => {
  const ranges = Array.isArray(appts?.blockRanges) ? appts.blockRanges : [];
  const legacy = Array.isArray(appts?.blockedSlots) ? appts.blockedSlots : [];
  return [...ranges, ...legacy.map(legacySlotToRange)];
};
const blockAppliesToEmp = (b, empId) => b.employeeId == null || b.employeeId === empId;
// Does block `b` cover the half-open [time, time+durMin) window on `date`?
const blockCoversSlot = (b, date, time, durMin = BLOCK_SLOT_MIN) => {
  if (date < b.dateStart || date > (b.dateEnd || b.dateStart)) return false;
  if (b.allDay) return true;
  const s = timeToMin(time), e = s + durMin;
  const bs = timeToMin(b.timeStart), be = timeToMin(b.timeEnd);
  return bs < e && s < be; // interval overlap
};
// Remove a block by id from whichever array it actually lives in (new or legacy).
const removeBlock = (appts, id) => ({
  ...appts,
  blockRanges: (appts.blockRanges || []).filter(b => b.id !== id),
  blockedSlots: (appts.blockedSlots || []).filter(b => b.id !== id),
});

const METHODS  = ["Efectivo","Transferencia","Datáfono","Nequi"];
const EXPENSE_CATEGORIES = ["Insumos","Arriendo","Servicios","Nómina","Comisiones","Productos","Marketing","Otros"];
const ROLES    = ["Estilista","Colorista","Manicurista","Pedicurista","Barbero","Maquillador/a","Masajista","Recepcionista","Otro"];
const DAYS_WORK = [
  { key:"lun", label:"Lun" },
  { key:"mar", label:"Mar" },
  { key:"mie", label:"Mié" },
  { key:"jue", label:"Jue" },
  { key:"vie", label:"Vie" },
  { key:"sab", label:"Sáb" },
  { key:"dom", label:"Dom" },
];
const DEFAULT_WORK_HOURS = () => ({
  lun:{ active:true,  start:"09:00", end:"18:00" },
  mar:{ active:true,  start:"09:00", end:"18:00" },
  mie:{ active:true,  start:"09:00", end:"18:00" },
  jue:{ active:true,  start:"09:00", end:"18:00" },
  vie:{ active:true,  start:"09:00", end:"18:00" },
  sab:{ active:false, start:"09:00", end:"14:00" },
  dom:{ active:false, start:"09:00", end:"14:00" },
});
const PAY_COLORS = { Efectivo:"#C29E66", Transferencia:"#8ab0ff", Datáfono:"#C46666", Nequi:"#66C499", Multa:"#e07070" };

const fmtCOP = (n) => n == null ? "—" : "$" + Number(n).toLocaleString("es-CO");
const fmtDateShort = (d) => !d ? "—" : new Date(d+"T12:00").toLocaleDateString("es-CO",{day:"numeric",month:"short"});
const fmtDateMed = (d) => !d ? "—" : new Date(d+"T12:00").toLocaleDateString("es-CO",{weekday:"short",day:"numeric",month:"short"});
const fmtDateTime = (ts) => !ts ? "—" : new Date(ts).toLocaleTimeString("es-CO",{hour:"numeric",minute:"2-digit",hour12:true});

const PENDING_EXPIRE_MS = 60 * 60 * 1000; // 1 hora
const OVERNIGHT_REVIEW_HOUR = 8;
const OVERNIGHT_REVIEW_MINUTE = 15;

// Si la solicitud se creó entre 22:00 y 08:00 (jornada de descanso del barbero),
// no vence en 1 hora: queda pendiente hasta las 08:15am para revisión manual.
const getPendingDeadline = (createdAt) => {
  const created = new Date(createdAt || 0);
  const hour = created.getHours();
  const isOvernight = hour >= 22 || hour < OVERNIGHT_REVIEW_HOUR;
  if (!isOvernight) return (createdAt || 0) + PENDING_EXPIRE_MS;
  const deadline = new Date(created);
  if (hour >= 22) deadline.setDate(deadline.getDate() + 1);
  deadline.setHours(OVERNIGHT_REVIEW_HOUR, OVERNIGHT_REVIEW_MINUTE, 0, 0);
  return deadline.getTime();
};

const getAllAppts = (store, cancelledIds=[], noShowIds=[]) => {
  const activeIds = new Set(store.active.map(a=>a.id));
  const completedIds = new Set(store.completed.map(a=>a.id));
  const resolveStatus = (a, fallback) => {
    if (noShowIds.includes(a.id)) return "no-show";
    if (cancelledIds.includes(a.id)) return "cancelled";
    if (fallback === "pending" && Date.now() > getPendingDeadline(a.createdAt)) return "expired";
    return fallback;
  };
  const result = [];
  store.appointments.forEach(a => {
    if (activeIds.has(a.id) || completedIds.has(a.id)) return;
    result.push({...a, computedStatus: resolveStatus(a, a.status || "scheduled")});
  });
  store.active.forEach(a => {
    result.push({...a, computedStatus: resolveStatus(a, a.status)});
  });
  store.completed.forEach(a => result.push({...a, computedStatus: resolveStatus(a, "completed")}));
  return result.sort((a,b)=>{
    if ((b.date||"") !== (a.date||"")) return (b.date||"").localeCompare(a.date||"");
    return (a.time||"").localeCompare(b.time||"");
  });
};

const getWeekDates = (offset=0) => {
  const now = nowCOT();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day===0?6:day-1) + offset*7);
  return Array.from({length:7},(_,i)=>{
    const d = new Date(monday); d.setDate(monday.getDate()+i);
    return ymd(d);
  });
};

// ==================== UI TOKENS ====================
const C = {
  bg:"#0C0C0C", s1:"#111", s2:"#181818", s3:"#222",
  bdr:"rgba(245,241,234,0.1)", bdr2:"rgba(245,241,234,0.2)",
  gold:"#C29E66", text:"#F5F1EA",
  muted:"rgba(245,241,234,0.5)", muted2:"rgba(245,241,234,0.25)",
  red:"#C46666", green:"#66C499", blue:"#8ab0ff",
};

const Mono = ({children,style,as:Tag="span"}) => (
  <Tag style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,letterSpacing:"0.15em",textTransform:"uppercase",...style}}>
    {children}
  </Tag>
);

const pseudoQR = (text) => {
  const size = 25;
  const grid = Array.from({length:size},()=>Array(size).fill(false));
  let h = 0;
  for (let i=0;i<text.length;i++) h=(h*31+text.charCodeAt(i))>>>0;
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) { h=(h*1103515245+12345)>>>0; grid[y][x]=(h&0xff)<128; }
  const finder=(cx,cy)=>{
    for (let y=0;y<7;y++) for (let x=0;x<7;x++) {
      const on=(x===0||x===6||y===0||y===6)||(x>=2&&x<=4&&y>=2&&y<=4);
      if(cx+x<size&&cy+y<size) grid[cy+y][cx+x]=on;
    }
    for (let y=-1;y<=7;y++) for (let x=-1;x<=7;x++)
      if(x===-1||x===7||y===-1||y===7) if(cx+x>=0&&cx+x<size&&cy+y>=0&&cy+y<size) grid[cy+y][cx+x]=false;
  };
  finder(0,0); finder(size-7,0); finder(0,size-7);
  return grid;
};

// Real QR code using the qrcode library (loaded via CDN in Admin.html)
// value = full URL to encode; empName = label shown al imprimir
const ChairQRCode = ({ empId, empName, chairNum, size = 200 }) => {
  const url = chairNum
    ? `${window.location.origin}/CheckIn.html#puesto-${chairNum}`
    : `${window.location.origin}/CheckIn.html#chair-${empId}`;
  const [dataUrl, setDataUrl] = React.useState(null);
  const [showUrl, setShowUrl] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const copyUrl = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  React.useEffect(() => {
    let cancelled = false;
    const generate = () => {
      const lib = window.QRCode;
      if (!lib) return false;
      lib.toDataURL(url, { width: size, margin: 2, color: { dark: "#0C0C0C", light: "#F5F1EA" } })
        .then(d => { if (!cancelled) setDataUrl(d); })
        .catch(() => {});
      return true;
    };
    if (!generate()) {
      const i = setInterval(() => { if (generate()) clearInterval(i); }, 200);
      return () => { cancelled = true; clearInterval(i); };
    }
    return () => { cancelled = true; };
  }, [url, size]);

  const printQR = () => {
    if (!dataUrl) return;
    const w = window.open("", "_blank", "width=480,height=600");
    w.document.write(`<!DOCTYPE html><html><head><title>QR · ${empName}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;
    min-height:100vh;background:#fff;font-family:'Helvetica Neue',sans-serif;gap:16px}
  img{display:block}
  .name{font-size:22px;font-weight:600;letter-spacing:0.05em;text-align:center}
  .sub{font-size:11px;color:#888;letter-spacing:0.15em;text-transform:uppercase}
  @media print{@page{margin:0.5cm}}
</style></head>
<body>
<img src="${dataUrl}" width="${size}" height="${size}" />
<div class="name">${empName}</div>
<div class="sub">JOXE · Check-In</div>
<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500)}<\/script>
</body></html>`);
    w.document.close();
  };

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
      {dataUrl
        ? <img src={dataUrl} width={size} height={size} style={{display:"block",border:`1px solid ${C.bdr}`}} />
        : <div style={{width:size,height:size,background:C.s1,border:`1px solid ${C.bdr}`,
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Mono style={{color:C.muted,fontSize:9}}>Generando…</Mono>
          </div>
      }
      <div style={{display:"flex",gap:8}}>
        <Btn onClick={printQR} disabled={!dataUrl} small>⎙ Imprimir QR</Btn>
        <Btn onClick={() => setShowUrl(v => !v)} variant="ghost" small>
          {showUrl ? "Ocultar URL" : "Ver URL"}
        </Btn>
      </div>
      {showUrl && (
        <div style={{width:"100%",background:C.s1,border:`1px solid ${C.bdr}`,borderRadius:6,padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
          <Mono style={{fontSize:9,color:C.muted,wordBreak:"break-all",lineHeight:1.6,userSelect:"all"}}>
            {url}
          </Mono>
          <button onClick={copyUrl} style={{
            alignSelf:"flex-start",background:"transparent",border:`1px solid ${copied?C.gold:C.bdr}`,
            color:copied?C.gold:C.muted,borderRadius:4,padding:"4px 10px",
            fontFamily:"'Outfit',sans-serif",fontSize:10,cursor:"pointer",letterSpacing:"0.05em",
            transition:"color 0.2s,border-color 0.2s",
          }}>
            {copied ? "✓ Copiado" : "Copiar"}
          </button>
        </div>
      )}
    </div>
  );
};

const Btn = ({children,onClick,variant="primary",small,disabled,style}) => {
  const v = {
    primary:{bg:C.gold,color:"#0C0C0C",border:"none"},
    ghost:  {bg:"transparent",color:C.text,border:`1px solid ${C.bdr}`},
    danger: {bg:"transparent",color:C.red,border:`1px solid ${C.red}40`},
    subtle: {bg:C.s2,color:C.text,border:`1px solid ${C.bdr}`},
  }[variant]||{bg:C.gold,color:"#0C0C0C",border:"none"};
  return (
    <button disabled={disabled} onClick={onClick} style={{
      background:disabled?C.s3:v.bg, color:disabled?C.muted:v.color,
      border:v.border, padding:small?"7px 14px":"11px 20px",
      fontFamily:"'Outfit',sans-serif", fontSize:small?10:12,
      letterSpacing:"0.12em", textTransform:"uppercase",
      cursor:disabled?"not-allowed":"pointer", transition:"opacity 0.2s",
      whiteSpace:"nowrap", ...style,
    }}>{children}</button>
  );
};

const FieldInput = ({label,value,onChange,type="text",placeholder,style,min,max,onKeyDown}) => (
  <div style={{display:"flex",flexDirection:"column",gap:6,...style}}>
    {label && <Mono style={{color:C.muted,fontSize:9}}>{label}</Mono>}
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} min={min} max={max} onKeyDown={onKeyDown}
      style={{background:C.s2,border:`1px solid ${C.bdr}`,color:C.text,padding:"11px 14px",
        fontFamily:"'Outfit',sans-serif",fontSize:14,width:"100%"}} />
  </div>
);

const FieldSelect = ({label,value,onChange,options,style}) => (
  <div style={{display:"flex",flexDirection:"column",gap:6,...style}}>
    {label && <Mono style={{color:C.muted,fontSize:9}}>{label}</Mono>}
    <select value={value} onChange={onChange}
      style={{background:C.s2,border:`1px solid ${C.bdr}`,color:C.text,padding:"11px 14px",
        fontFamily:"'Outfit',sans-serif",fontSize:14,width:"100%"}}>
      {options.map((o,i)=>{
        const val = typeof o==="object" ? o.value : o;
        const lbl = typeof o==="object" ? (o.label||o.value) : o;
        return <option key={val+i} value={val}>{lbl}</option>;
      })}
    </select>
  </div>
);

const Badge = ({status}) => {
  const map = {
    pending:     {label:"Solicitud",  bg:"rgba(138,176,255,0.12)",color:"#8ab0ff"},
    scheduled:   {label:"Agendada",   bg:"rgba(194,158,102,0.12)",color:C.gold},
    waiting:     {label:"En cola",    bg:"rgba(138,176,255,0.12)",color:C.blue},
    "in-service":{label:"En silla",   bg:"rgba(102,196,153,0.15)",color:C.green},
    completed:   {label:"Completada", bg:"rgba(102,196,153,0.08)",color:C.green},
    cancelled:   {label:"Cancelada",  bg:"rgba(196,102,102,0.12)",color:C.red},
    "no-show":   {label:"Incumplida", bg:"rgba(196,102,102,0.18)",color:"#e07070"},
    expired:     {label:"Expirada",   bg:"rgba(196,102,102,0.08)",color:"rgba(196,102,102,0.7)"},
  };
  const m = map[status]||map.scheduled;
  return (
    <span style={{padding:"3px 10px",fontSize:10,fontFamily:"'JetBrains Mono',monospace",
      letterSpacing:"0.1em",textTransform:"uppercase",background:m.bg,color:m.color,
      border:`1px solid ${m.color}30`,whiteSpace:"nowrap"}}>
      {m.label}
    </span>
  );
};

const StatCard = ({label,value,sub,color,small}) => (
  <div style={{background:C.s1,border:`1px solid ${C.bdr}`,padding:"22px 26px"}}>
    <Mono style={{color:C.muted,fontSize:9}}>{label}</Mono>
    <div style={{fontFamily:"'Marcellus',serif",fontSize:small?32:44,
      color:color||C.gold,marginTop:8,letterSpacing:"-0.02em",lineHeight:1}}>
      {value}
    </div>
    {sub && <div style={{fontSize:11,color:C.muted,marginTop:6}}>{sub}</div>}
  </div>
);

const Card = ({children,style}) => (
  <div style={{background:C.s1,border:`1px solid ${C.bdr}`,padding:"24px",...style}}>
    {children}
  </div>
);

// ==================== LAYOUT ====================
const VIEWS = [
  {id:"dashboard",   label:"Dashboard",       icon:"◈", tooltip:"Resumen general del negocio"},
  {id:"agenda",      label:"Agenda",           icon:"▦", tooltip:"Vista semanal de citas por estilista"},
  {id:"appointments",label:"Citas",            icon:"≡", tooltip:"Listado y gestión de todas las citas"},
  {id:"clients",     label:"CRM · Clientes",   icon:"◯", tooltip:"Perfiles, historial y fidelización de clientes"},
  {id:"blockslots",  label:"Bloquear horas",   icon:"⊘", tooltip:"Bloquear horarios para evitar reservas"},
  {id:"revenue",     label:"Caja",             icon:"◎", tooltip:"Ingresos, gastos y utilidad"},
  {id:"commissions", label:"Comisiones",       icon:"%", tooltip:"Comisiones por empleado y liquidaciones"},
  {id:"employees",   label:"Empleados",        icon:"◉", tooltip:"Gestión del equipo y sus PINs"},
  {id:"services",    label:"Servicios",        icon:"✦", tooltip:"Catálogo de servicios y precios"},
  {id:"settings",    label:"Configuración",    icon:"⊛", tooltip:"Ajustes generales del salón"},
  {id:"help",        label:"Ayuda",            icon:"?", tooltip:"Guías y documentación del panel"},
];

const Sidebar = ({active,onNav,onLogout,open,onClose}) => {
  const content = (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{padding:"28px 24px",borderBottom:`1px solid ${C.bdr}`}}>
        <div style={{fontFamily:"'Marcellus',serif",fontSize:22,letterSpacing:"0.3em",color:C.text}}>
          JOXE
        </div>
        <Mono style={{color:C.gold,fontSize:9,display:"block",marginTop:4}}>Panel · Admin</Mono>
      </div>
      <nav style={{flex:1,padding:"12px 10px",overflowY:"auto"}}>
        {VIEWS.map(v=>{
          const isA = active===v.id;
          return (
            <button key={v.id} title={v.tooltip} onClick={()=>{onNav(v.id);onClose&&onClose();}} style={{
              width:"100%",padding:"10px 12px",display:"flex",alignItems:"center",gap:12,
              background:isA?"rgba(194,158,102,0.1)":"transparent",border:"none",
              borderLeft:`2px solid ${isA?C.gold:"transparent"}`,
              color:isA?C.text:C.muted,cursor:"pointer",textAlign:"left",
              fontFamily:"'Outfit',sans-serif",fontSize:13,letterSpacing:"0.02em",
              transition:"all 0.2s",marginBottom:1,
            }}>
              <span style={{fontSize:13,width:18,textAlign:"center",color:isA?C.gold:C.muted}}>
                {v.icon}
              </span>
              {v.label}
            </button>
          );
        })}
      </nav>
      <div style={{padding:"14px 10px",borderTop:`1px solid ${C.bdr}`}}>
        <button onClick={onLogout} style={{
          width:"100%",padding:"10px 12px",background:"transparent",
          border:`1px solid ${C.bdr}`,color:C.muted,cursor:"pointer",
          fontFamily:"'Outfit',sans-serif",fontSize:11,letterSpacing:"0.12em",
          textTransform:"uppercase",display:"flex",alignItems:"center",gap:10,
        }}>
          <span>⊖</span> Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="admin-sidebar" style={{
        width:220,minHeight:"100vh",background:C.s1,
        borderRight:`1px solid ${C.bdr}`,position:"fixed",
        top:0,left:0,bottom:0,zIndex:40,
      }}>{content}</div>

      {/* Mobile drawer */}
      {open && (
        <div style={{position:"fixed",inset:0,zIndex:100,display:"flex"}}>
          <div onClick={onClose}
            style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.7)"}} />
          <div style={{
            position:"relative",width:240,background:C.s1,
            borderRight:`1px solid ${C.bdr}`,zIndex:1,
          }}>{content}</div>
        </div>
      )}
    </>
  );
};

const PageHeader = ({title,subtitle,action}) => (
  <div className="adm-page-header" style={{
    padding:"28px 32px 20px",borderBottom:`1px solid ${C.bdr}`,
    display:"flex",justifyContent:"space-between",alignItems:"flex-end",
    flexWrap:"wrap",gap:12,
  }}>
    <div>
      <Mono style={{color:C.gold,fontSize:9}}>{subtitle}</Mono>
      <h1 style={{fontFamily:"'Marcellus',serif",fontSize:28,fontWeight:400,
        margin:"6px 0 0",letterSpacing:"-0.01em",color:C.text}}>{title}</h1>
    </div>
    {action&&<div style={{display:"flex",gap:8}}>{action}</div>}
  </div>
);

const AdminShell = ({children,activeView,onNav,onLogout}) => {
  const [mobileOpen,setMobileOpen] = React.useState(false);
  return (
    <div style={{background:C.bg,color:C.text,fontFamily:"'Outfit',sans-serif",minHeight:"100vh",display:"flex"}}>
      <style>{`
        .admin-sidebar{display:flex!important;}
        .admin-topbar{display:none!important;}
        @media(max-width:768px){
          .admin-sidebar{display:none!important;}
          .admin-topbar{display:flex!important;}
          .admin-content{margin-left:0!important;}
        }
      `}</style>
      <Sidebar active={activeView} onNav={onNav} onLogout={onLogout}
        open={mobileOpen} onClose={()=>setMobileOpen(false)} />
      <div className="admin-topbar" style={{
        position:"fixed",top:0,left:0,right:0,zIndex:50,
        background:C.s1,borderBottom:`1px solid ${C.bdr}`,
        padding:"14px 20px",display:"none",alignItems:"center",justifyContent:"space-between",
      }}>
        <div style={{fontFamily:"'Marcellus',serif",fontSize:20,letterSpacing:"0.3em"}}>JOXE</div>
        <button onClick={()=>setMobileOpen(true)} style={{
          background:"transparent",border:`1px solid ${C.bdr}`,
          color:C.text,padding:"8px 12px",cursor:"pointer",fontSize:14,
        }}>☰</button>
      </div>
      <div className="admin-content" style={{flex:1,marginLeft:220,minHeight:"100vh"}}>
        <div className="admin-page-inner">
          {children}
        </div>
      </div>
    </div>
  );
};

// ==================== LOGIN ====================
const LoginView = ({onAdminSuccess, onEmpSuccess}) => {
  const [mode,setMode]       = React.useState(window.JOXE_STAFF_MODE ? "employee" : null);
  const [pw,setPw]           = React.useState("");
  const [err,setErr]         = React.useState("");
  const [loading,setLoading] = React.useState(false);
  // employee flow
  const [empList,setEmpList]       = React.useState([]);
  const [selEmpId,setSelEmpId]     = React.useState("");
  const [pin,setPin]               = React.useState("");
  const [pinErr,setPinErr]         = React.useState("");

  const [loadingEmps, setLoadingEmps] = React.useState(true);
  React.useEffect(() => {
    fetch("/api/catalog")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.employees) setEmpList(d.employees); })
      .catch(() => {})
      .finally(() => setLoadingEmps(false));
  }, []);

  const attemptAdmin = async () => {
    setLoading(true); setErr("");
    try {
      const res  = await fetch("/api/admin?action=auth", { method:"POST",
        headers:{"Content-Type":"application/json"}, body:JSON.stringify({password:pw}) });
      const data = await res.json();
      if (data.ok) { doLogin(pw); onAdminSuccess(); }
      else { setErr("Contraseña incorrecta. Intenta de nuevo."); setLoading(false); }
    } catch { setErr("Error de conexión."); setLoading(false); }
  };

  const attemptEmp = async () => {
    setPinErr("");
    if (!selEmpId || !pin) { setPinErr("Selecciona un empleado e ingresa tu PIN."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", empId: selEmpId, pin }),
      });
      const data = await res.json();
      if (!res.ok) { setPinErr(data.error || "PIN incorrecto. Intenta de nuevo."); setPin(""); setLoading(false); return; }
      if (data.token) sessionStorage.setItem(EMP_TOKEN_KEY, data.token);
      doEmpLogin({ id: data.employee.id, name: data.employee.name, role: data.employee.role });
      onEmpSuccess({ id: data.employee.id, name: data.employee.name, role: data.employee.role });
    } catch { setPinErr("Error de conexión."); }
    setLoading(false);
  };

  const logoBlock = (
    <div style={{marginBottom:40,textAlign:"center"}}>
      <div style={{fontFamily:"'Marcellus',serif",fontSize:36,letterSpacing:"0.4em",color:C.text,marginBottom:8}}>
        JOXE
      </div>
      <Mono style={{color:C.gold,fontSize:10}}>{window.JOXE_STAFF_MODE ? "Staff · Acceso" : "Portal · Acceso"}</Mono>
    </div>
  );

  // --- Role selector ---
  if (!mode) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{width:"100%",maxWidth:400}}>
        {logoBlock}
        <Card>
          <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:20}}>¿Cómo deseas ingresar?</Mono>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <button onClick={()=>setMode("employee")} style={{
              padding:"18px 24px",background:C.s2,border:`1px solid ${C.bdr}`,
              color:C.text,cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center",
              fontFamily:"'Outfit',sans-serif",
            }}>
              <div>
                <div style={{fontSize:16,marginBottom:4}}>Soy empleado/a</div>
                <div style={{fontSize:12,color:C.muted}}>Accede con tu PIN personal</div>
              </div>
              <span style={{fontSize:20,color:C.gold}}>◉</span>
            </button>
            <button onClick={()=>setMode("admin")} style={{
              padding:"18px 24px",background:C.s2,border:`1px solid ${C.bdr}`,
              color:C.text,cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center",
              fontFamily:"'Outfit',sans-serif",
            }}>
              <div>
                <div style={{fontSize:16,marginBottom:4}}>Soy administrador/a</div>
                <div style={{fontSize:12,color:C.muted}}>Acceso completo al panel</div>
              </div>
              <span style={{fontSize:20,color:C.gold}}>⊛</span>
            </button>
          </div>
        </Card>
      </div>
    </div>
  );

  // --- Admin login ---
  if (mode==="admin") return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{width:"100%",maxWidth:400}}>
        {logoBlock}
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
            <h2 style={{fontFamily:"'Marcellus',serif",fontWeight:400,fontSize:22,margin:0,color:C.text}}>
              Administrador
            </h2>
            <button onClick={()=>setMode(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12}}>← Volver</button>
          </div>
          <FieldInput label="Contraseña" type="password" value={pw}
            onChange={e=>{setPw(e.target.value);setErr("");}}
            placeholder="••••••••"
            onKeyDown={e=>e.key==="Enter"&&pw&&!loading&&attemptAdmin()} />
          {err && (
            <div style={{marginTop:12,padding:"10px 14px",background:"rgba(196,102,102,0.1)",border:`1px solid ${C.red}40`,fontSize:13,color:C.red}}>{err}</div>
          )}
          <Btn onClick={attemptAdmin} disabled={!pw||loading} style={{width:"100%",marginTop:20,padding:"14px"}}>
            {loading?"Verificando...":"Entrar →"}
          </Btn>
        </Card>
      </div>
    </div>
  );

  // --- Employee login ---
  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{width:"100%",maxWidth:400}}>
        {logoBlock}
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
            <h2 style={{fontFamily:"'Marcellus',serif",fontWeight:400,fontSize:22,margin:0,color:C.text}}>
              Empleado/a
            </h2>
            {!window.JOXE_STAFF_MODE && (
              <button onClick={()=>{setMode(null);setPin("");setPinErr("");}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12}}>← Volver</button>
            )}
          </div>

          {empList.length===0 ? (
            <div style={{padding:"20px 0",textAlign:"center"}}>
              <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>
                {loadingEmps ? "Cargando empleados…" : "No hay empleados configurados."}
              </div>
            </div>
          ) : (
            <>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div>
                  <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:10}}>Selecciona tu nombre</Mono>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {empList.map(e=>(
                      <button key={e.id} onClick={()=>{setSelEmpId(e.id);setPin("");setPinErr("");}} style={{
                        padding:"12px 16px",background:selEmpId===e.id?"rgba(194,158,102,0.15)":C.s2,
                        border:`1px solid ${selEmpId===e.id?C.gold+"60":C.bdr}`,
                        color:C.text,cursor:"pointer",textAlign:"left",
                        fontFamily:"'Outfit',sans-serif",fontSize:14,
                        display:"flex",justifyContent:"space-between",alignItems:"center",
                      }}>
                        <span>{e.name}</span>
                        <Mono style={{fontSize:9,color:C.muted}}>{e.role}</Mono>
                      </button>
                    ))}
                  </div>
                </div>

                {selEmpId && (
                  <div>
                    <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:8}}>PIN</Mono>
                    <input
                      type="password" inputMode="numeric" maxLength={6}
                      value={pin} onChange={e=>{setPin(e.target.value.replace(/\D/g,""));setPinErr("");}}
                      onKeyDown={e=>e.key==="Enter"&&pin&&attemptEmp()}
                      placeholder="• • • •"
                      style={{
                        background:C.s2,border:`1px solid ${C.bdr}`,color:C.text,
                        padding:"14px",fontFamily:"'JetBrains Mono',monospace",
                        fontSize:24,width:"100%",letterSpacing:"0.4em",textAlign:"center",
                      }}
                    />
                  </div>
                )}
              </div>

              {pinErr && (
                <div style={{marginTop:12,padding:"10px 14px",background:"rgba(196,102,102,0.1)",border:`1px solid ${C.red}40`,fontSize:13,color:C.red}}>
                  {pinErr}
                </div>
              )}

              <Btn onClick={attemptEmp} disabled={!selEmpId||!pin||loading}
                style={{width:"100%",marginTop:20,padding:"14px"}}>
                {loading?"Verificando...":"Ingresar →"}
              </Btn>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

// ==================== DASHBOARD ====================
const DashboardView = ({onNav}) => {
  const [appts] = useAppts();
  const [admin] = useAdmin();
  const todayD = todayStr();

  const allAppts  = getAllAppts(appts, admin.cancelledIds||[], admin.noShowIds||[]);
  const todayAll  = allAppts.filter(a=>a.date===todayD);
  const todayAct  = todayAll.filter(a=>!["cancelled","completed"].includes(a.computedStatus));
  const inQueue   = appts.active.filter(a=>a.status==="waiting").length;
  const inChair   = appts.active.filter(a=>a.status==="in-service").length;
  const completedToday = appts.completed.filter(a=>a.completedAt&&new Date(a.completedAt).toISOString().split("T")[0]===todayD).length;

  const revenueToday = (admin.revenue||[])
    .filter(r=>r.date===todayD && !r.deleted)
    .reduce((s,r)=>s+Number(r.amount||0),0);

  const upcomingRaw = allAppts
    .filter(a=>a.date>todayD && a.computedStatus==="scheduled")
    .slice(0,5);

  const pendingRequests = allAppts.filter(a=>a.computedStatus==="pending");

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Panel · Resumen" />
      <div className="adm-section-pad" style={{padding:"24px 32px"}}>
        {pendingRequests.length>0 && (
          <div style={{
            marginBottom:24,padding:"14px 20px",
            background:"rgba(138,176,255,0.07)",
            border:"1px solid rgba(138,176,255,0.35)",
            display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,
          }}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <Mono style={{color:"#8ab0ff",fontSize:10}}>⚑ SOLICITUDES SIN CONFIRMAR</Mono>
              <span style={{
                background:"#8ab0ff",color:"#0C0C0C",borderRadius:0,
                fontFamily:"'JetBrains Mono',monospace",fontSize:11,padding:"2px 8px",fontWeight:600,
              }}>{pendingRequests.length}</span>
            </div>
            <button onClick={()=>onNav("appointments")} style={{
              background:"transparent",border:"1px solid rgba(138,176,255,0.4)",
              color:"#8ab0ff",padding:"6px 14px",cursor:"pointer",
              fontFamily:"'Outfit',sans-serif",fontSize:11,letterSpacing:"0.1em",textTransform:"uppercase",
            }}>Revisar →</button>
          </div>
        )}
        <div className="adm-stat-grid" style={{
          display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",
          gap:16,marginBottom:32,
        }}>
          <StatCard label="Citas hoy" value={String(todayAct.length).padStart(2,"0")}
            sub={`${completedToday} completada${completedToday!==1?"s":""}`} />
          <StatCard label="Solicitudes" value={String(pendingRequests.length).padStart(2,"0")}
            color={pendingRequests.length>0?"#8ab0ff":C.muted} />
          <StatCard label="En cola" value={String(inQueue).padStart(2,"0")}
            color={inQueue>0?C.blue:C.muted} />
          <StatCard label="En silla" value={String(inChair).padStart(2,"0")}
            color={inChair>0?C.green:C.muted} />
          <StatCard label="Ingresos hoy" value={revenueToday>0?fmtCOP(revenueToday):"$0"}
            color={revenueToday>0?C.green:C.muted} small />
        </div>

        <div className="adm-dash-grid" style={{display:"grid",gridTemplateColumns:"1.2fr 1fr",gap:20}}>
          {/* Today's schedule */}
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <Mono style={{color:C.gold}}>Hoy · {fmtDateMed(todayD)}</Mono>
              <button onClick={()=>onNav("appointments")} style={{
                background:"transparent",border:"none",color:C.muted,
                fontSize:11,letterSpacing:"0.1em",cursor:"pointer",
                fontFamily:"'Outfit',sans-serif",textTransform:"uppercase",
              }}>Ver todas →</button>
            </div>
            {todayAll.length===0 ? (
              <div style={{textAlign:"center",padding:"32px 0",color:C.muted}}>
                <div style={{fontSize:32,marginBottom:8}}>—</div>
                <Mono style={{fontSize:10}}>Sin citas hoy</Mono>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {todayAll.slice(0,6).map(a=>(
                  <div key={a.id} style={{
                    display:"grid",gridTemplateColumns:"56px 1fr auto",gap:12,
                    padding:"12px 14px",background:C.s2,alignItems:"center",
                  }}>
                    <Mono style={{color:C.gold,fontSize:12}}>{formatTime12h(a.time)}</Mono>
                    <div>
                      <div style={{fontSize:14,marginBottom:2}}>{a.name}</div>
                      <div style={{fontSize:11,color:C.muted}}>{a.service}</div>
                    </div>
                    <Badge status={a.computedStatus}/>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Upcoming + quick actions */}
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <Card>
              <Mono style={{color:C.gold,display:"block",marginBottom:16}}>Próximas citas</Mono>
              {upcomingRaw.length===0 ? (
                <div style={{color:C.muted,fontSize:13}}>No hay citas futuras agendadas.</div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {upcomingRaw.map(a=>(
                    <div key={a.id} style={{
                      display:"flex",justifyContent:"space-between",alignItems:"center",
                      padding:"10px 0",borderBottom:`1px solid ${C.bdr}`,
                    }}>
                      <div>
                        <div style={{fontSize:13}}>{a.name}</div>
                        <div style={{fontSize:11,color:C.muted}}>{a.service}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <Mono style={{color:C.gold,fontSize:10}}>{fmtDateShort(a.date)}</Mono>
                        <div style={{fontSize:11,color:C.muted,marginTop:2}}>{formatTime12h(a.time)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <Mono style={{color:C.gold,display:"block",marginBottom:16}}>Acciones rápidas</Mono>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {[
                  {label:"+ Bloquear horario",view:"blockslots"},
                  {label:"+ Registrar pago",view:"revenue"},
                  {label:"Ver cola en vivo →",href:"Lobby.html"},
                ].map(item=>(
                  item.href
                    ? <a key={item.label} href={item.href} style={{
                        display:"block",padding:"10px 14px",background:C.s2,
                        border:`1px solid ${C.bdr}`,color:C.text,textDecoration:"none",
                        fontFamily:"'Outfit',sans-serif",fontSize:12,
                        letterSpacing:"0.08em",textTransform:"uppercase",
                      }}>{item.label}</a>
                    : <button key={item.label} onClick={()=>onNav(item.view)} style={{
                        padding:"10px 14px",background:C.s2,
                        border:`1px solid ${C.bdr}`,color:C.text,cursor:"pointer",
                        fontFamily:"'Outfit',sans-serif",fontSize:12,
                        letterSpacing:"0.08em",textTransform:"uppercase",
                        textAlign:"left",
                      }}>{item.label}</button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== AGENDA ====================
const AgendaView = () => {
  const [appts] = useAppts();
  const [admin] = useAdmin();
  const todayD = todayStr();
  const tomorrowD = (() => { const d=new Date(todayD+"T12:00"); d.setDate(d.getDate()+1); return d.toISOString().split("T")[0]; })();
  const dates = [todayD, tomorrowD];
  const allAppts = getAllAppts(appts, admin.cancelledIds||[], admin.noShowIds||[]);

  const DAY_LABEL = (d) => d===todayD ? "Hoy" : "Mañana";
  const DAY_SUB   = (d) => new Date(d+"T12:00").toLocaleDateString("es-CO",{weekday:"long",day:"numeric",month:"long"});

  const statusColor = (s) =>
    s==="cancelled"||s==="expired"?"#C46666":s==="completed"?"#66C499":
    s==="in-service"?"#66C499":s==="waiting"?"#8ab0ff":"#C29E66";

  const statusBg = (s) =>
    s==="cancelled"||s==="expired"?"rgba(196,102,102,0.07)":s==="completed"?"rgba(102,196,153,0.07)":
    s==="in-service"?"rgba(102,196,153,0.12)":s==="waiting"?"rgba(138,176,255,0.09)":
    "rgba(194,158,102,0.09)";

  const statusLabel = (s) =>
    s==="in-service"?"En silla":s==="waiting"?"En cola":s==="expired"?"Expirada":
    s==="completed"?"Completada":s==="cancelled"?"Cancelada":"Agendada";

  return (
    <div>
      <PageHeader title="Agenda" subtitle="Hoy · Mañana" />
      <div style={{padding:"24px 32px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          {dates.map(date=>{
            const isToday  = date===todayD;
            const dayAppts = allAppts.filter(a=>a.date===date);
            const blocked  = (appts.blockedSlots||[]).filter(b=>b.date===date);

            // Group appointments by time slot
            const byTime = {};
            AGENDA_HOURS.forEach(t=>{ byTime[t]=[]; });
            dayAppts.forEach(a=>{ if(byTime[a.time]) byTime[a.time].push(a); else byTime[a.time]=[a]; });
            const toMin = (t)=>{ const [hh,mm]=t.split(":").map(Number); return hh*60+(mm||0); };
            const slots = Object.keys(byTime).sort((a,b)=>toMin(a)-toMin(b));

            return (
              <div key={date} style={{border:`1px solid ${isToday?C.gold:C.bdr}`,background:C.s1}}>
                {/* Day header */}
                <div style={{
                  padding:"16px 20px",borderBottom:`1px solid ${C.bdr}`,
                  background:isToday?"rgba(194,158,102,0.08)":C.s2,
                  display:"flex",alignItems:"center",gap:12,
                }}>
                  <div style={{fontFamily:"'Marcellus',serif",fontSize:26,color:isToday?C.gold:C.text}}>
                    {DAY_LABEL(date)}
                  </div>
                  <Mono style={{color:C.muted,fontSize:9,flex:1}}>{DAY_SUB(date)}</Mono>
                  <span style={{
                    fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:C.gold,
                    background:"rgba(194,158,102,0.1)",padding:"3px 10px",border:`1px solid ${C.gold}30`,
                  }}>{dayAppts.length} cita{dayAppts.length!==1?"s":""}</span>
                </div>

                {/* Time rows — scroll vertical independiente (dedo en móvil, scroll en escritorio) */}
                <div style={{
                  maxHeight:"60vh",
                  overflowY:"auto",
                  overscrollBehavior:"contain",
                  WebkitOverflowScrolling:"touch",
                  touchAction:"pan-y",
                }}>
                {slots.map(time=>{
                  const slotAppts  = byTime[time]||[];
                  const isBlocked  = blocked.some(b=>b.time===time);
                  const [h,m]      = time.split(":").map(Number);
                  const slotMin    = h*60+(m||0);
                  const nowMin     = nowCOT().getHours()*60+nowCOT().getMinutes();
                  const isPast     = isToday && slotMin < nowMin-30;

                  return (
                    <div key={time} style={{
                      display:"grid",gridTemplateColumns:"76px 1fr",
                      borderBottom:`1px solid ${C.bdr}`,
                      opacity:isPast?0.4:1,
                    }}>
                      {/* Hour label */}
                      <div style={{
                        padding:"14px 0 14px 16px",borderRight:`1px solid ${C.bdr}`,
                        display:"flex",alignItems:"flex-start",
                      }}>
                        <Mono style={{color:isPast?C.muted2:C.gold,fontSize:11}}>{formatTime12h(time)}</Mono>
                      </div>

                      {/* Slot content */}
                      <div style={{padding:"8px 12px",display:"flex",flexDirection:"column",gap:5}}>
                        {isBlocked && (
                          <div style={{padding:"5px 10px",background:"rgba(196,102,102,0.08)",border:`1px solid ${C.red}25`}}>
                            <Mono style={{fontSize:9,color:C.red}}>Bloqueado</Mono>
                          </div>
                        )}
                        {slotAppts.map(a=>(
                          <div key={a.id} style={{
                            padding:"8px 10px",
                            background:statusBg(a.computedStatus),
                            border:`1px solid ${statusColor(a.computedStatus)}25`,
                          }}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                              <div>
                                <div style={{
                                  fontSize:13,color:a.computedStatus==="cancelled"?C.muted:C.text,
                                  textDecoration:a.computedStatus==="cancelled"?"line-through":"none",
                                }}>{a.name}</div>
                                <div style={{fontSize:11,color:C.muted,marginTop:2}}>{a.service}</div>
                              </div>
                              <div style={{textAlign:"right",flexShrink:0}}>
                                <Mono style={{fontSize:9,color:statusColor(a.computedStatus)}}>
                                  {statusLabel(a.computedStatus)}
                                </Mono>
                                {a.stylist && (
                                  <div style={{fontSize:10,color:C.muted2,marginTop:2}}>{a.stylist}</div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        {slotAppts.length===0 && !isBlocked && (
                          <div style={{fontSize:10,color:C.muted2,padding:"4px 0"}}>Libre</div>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{display:"flex",gap:24,marginTop:20,flexWrap:"wrap"}}>
          {[
            {color:C.gold, label:"Agendada"},
            {color:C.blue, label:"En cola"},
            {color:C.green,label:"En silla / Completada"},
            {color:C.red,  label:"Cancelada / Bloqueada"},
          ].map(l=>(
            <div key={l.label} style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:8,height:8,background:l.color,opacity:0.7}}/>
              <Mono style={{color:C.muted,fontSize:9}}>{l.label}</Mono>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ==================== APPOINTMENTS ====================
const AppointmentsView = () => {
  const [appts, setAppts] = useAppts();
  const [admin, setAdmin] = useAdmin();
  const [crm, setCrm] = useCrm();
  const [filter,setFilter] = React.useState({status:"",date:"",search:""});
  const [expandedId,setExpandedId] = React.useState(null);
  const [payForm,setPayForm] = React.useState(null);

  const all = getAllAppts(appts, admin.cancelledIds||[], admin.noShowIds||[]);
  const filtered = all.filter(a=>{
    if (filter.status && a.computedStatus!==filter.status) return false;
    if (filter.date && a.date!==filter.date) return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      if (!(a.name||"").toLowerCase().includes(q) &&
          !(a.phone||"").includes(q) &&
          !(a.service||"").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const cancelAppt = (id) => {
    if (!confirm("¿Cancelar esta cita?")) return;
    setAdmin(a=>({...a, cancelledIds:[...(a.cancelledIds||[]),id]}));
  };

  const deleteAppt = (id) => {
    if (!confirm("¿Eliminar esta cita permanentemente? No se puede deshacer.")) return;
    setAppts(s=>({
      ...s,
      appointments: s.appointments.filter(a=>a.id!==id),
      active:        s.active.filter(a=>a.id!==id),
      completed:     s.completed.filter(a=>a.id!==id),
    }));
    setAdmin(a=>({
      ...a,
      cancelledIds: (a.cancelledIds||[]).filter(i=>i!==id),
      noShowIds:    (a.noShowIds||[]).filter(i=>i!==id),
    }));
    setExpandedId(null);
  };

  const DAY_KEYS = ["dom","lun","mar","mie","jue","vie","sab"];
  const markNoShow = (appt) => {
    if (!confirm(`¿Marcar a ${appt.name} como incumplida?`)) return;
    setAdmin(a=>{
      const noShowIds = [...(a.noShowIds||[]), appt.id];
      const fine = a.noShowFine;
      if (!fine?.enabled) return {...a, noShowIds};
      // Calculate fine amount: byDay override or defaultAmount
      const dayKey = appt.date ? DAY_KEYS[new Date(appt.date+"T12:00").getDay()] : null;
      const amount = (dayKey && fine.byDay?.[dayKey] > 0)
        ? fine.byDay[dayKey]
        : (fine.defaultAmount || 0);
      if (!amount) return {...a, noShowIds};
      const fineId = `ns-${appt.id}`;
      // Guard: prevent double-registering the same fine
      if ((a.revenue||[]).some(r => r.id === fineId)) return {...a, noShowIds};
      const entry = {
        id: fineId,
        apptId: appt.id,
        date: appt.date || todayStr(),
        amount,
        service: appt.service || "",
        client: appt.name || "",
        phone: appt.phone || "",
        stylist: appt.stylist || "",
        method: "Multa",
        note: `Incumplimiento · ${appt.code||appt.id}`,
        createdAt: Date.now(),
      };
      return {...a, noShowIds, revenue:[...(a.revenue||[]), entry]};
    });
  };

  const confirmAppt = (id) => {
    setAppts(s=>({...s, appointments: s.appointments.map(a=>
      a.id===id ? {...a, status:"scheduled", confirmedAt:Date.now()} : a
    )}));
  };

  // Extra minutes reserved after a turno's own service duration — for when the
  // stylist needs more room (running late, extra touch-up, etc.). Kept separate
  // from serviceDur so revenue/reporting still reflect the real service length.
  // Applied to whichever array currently holds the appointment (appointments,
  // active, or completed), mirroring how deleteAppt touches all three.
  const setApptBuffer = (id, bufferAfter) => {
    const patch = arr => arr.map(a => a.id===id ? {...a, bufferAfter} : a);
    setAppts(s=>({...s, appointments:patch(s.appointments), active:patch(s.active), completed:patch(s.completed)}));
  };
  const extendAppt = (id, extraMin) => {
    const current = all.find(a=>a.id===id)?.bufferAfter || 0;
    setApptBuffer(id, current + extraMin);
  };

  const buildWaToClient = (appt) => {
    const adminCfg = (() => { try { return JSON.parse(localStorage.getItem(ADMIN_KEY)||"{}"); } catch { return {}; } })();
    const salonName = adminCfg.salonName || "JOXE";
    const msg = [
      `Hola ${(appt.name||"").split(" ")[0]} 👋 Soy de ${salonName}.`,
      `Recibimos tu solicitud de cita:`,
      `📅 ${appt.date} a las ${formatTime12h(appt.time)}`,
      `✂️ ${appt.service} con ${appt.stylist}`,
      ``,
      `Para confirmar tu reserva, realiza un abono de $10.000 y envíanos la captura:`,
      `Llave @3124499862`,
      `Nequi o DaviPlata 3124499862`,
      `Cuenta ahorros Davivienda 488414015989`,
      ``,
      `¡Gracias!`,
    ].join("\n");
    const phone = (appt.phone||"").replace(/\D/g,"");
    const num = phone.startsWith("57") ? phone : `57${phone}`;
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  };

  const registerPay = (appt) => {
    const alreadyPaid = (admin.revenue||[]).some(r => r.apptId===appt.id && !r.deleted);
    if (alreadyPaid && !confirm("Ya hay un pago registrado para esta cita. ¿Registrar otro igualmente?")) return;
    setPayForm({
      apptId:appt.id, date:appt.date||todayStr(),
      amount:"", service:appt.service||"", client:appt.name||"",
      phone:appt.phone||"", cedula:appt.cedula||"", method:"Efectivo", note:"", addLoyalty:true,
    });
  };

  const submitPay = () => {
    if (!payForm.amount) return;
    const {addLoyalty, phone, cedula: apptCedula, ...entry} = payForm;
    setAdmin(a=>({...a, revenue:[...a.revenue, {
      id:genId(), ...entry, amount:Number(entry.amount), createdAt:Date.now(),
    }]}));
    if (addLoyalty && admin.loyalty?.enabled) {
      // Use cedula as CRM key; fall back to phone for old appointments without cedula
      const key = (apptCedula||"").replace(/\D/g,"") || (phone||"").replace(/\D/g,"");
      if (key) {
        setCrm(d=>({...d, [key]:{...(d[key]||{}),
          loyaltyVisits:(d[key]?.loyaltyVisits||0)+1,
          updatedAt:Date.now(),
        }}));
      }
    }
    setPayForm(null);
  };

  return (
    <div>
      <PageHeader title="Citas" subtitle="Gestión · Historial"
        action={
          <a href="Booking.html" style={{
            padding:"11px 20px",background:C.gold,color:"#0C0C0C",textDecoration:"none",
            fontFamily:"'Outfit',sans-serif",fontSize:12,letterSpacing:"0.12em",
            textTransform:"uppercase",
          }}>+ Nueva cita</a>
        }
      />

      {/* Filters */}
      <div className="adm-filters adm-section-pad" style={{
        padding:"16px 32px",borderBottom:`1px solid ${C.bdr}`,
        display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end",
      }}>
        <FieldInput placeholder="Buscar nombre, tel, servicio…" value={filter.search}
          onChange={e=>setFilter({...filter,search:e.target.value})}
          style={{minWidth:220,flex:1}} />
        <FieldSelect value={filter.status} onChange={e=>setFilter({...filter,status:e.target.value})}
          options={[
            {value:"",label:"Todos los estados"},
            {value:"pending",label:"Solicitudes"},
            {value:"scheduled",label:"Agendadas"},
            {value:"waiting",label:"En cola"},
            {value:"in-service",label:"En silla"},
            {value:"completed",label:"Completadas"},
            {value:"cancelled",label:"Canceladas"},
            {value:"no-show",label:"Incumplidas"},
          ]} style={{minWidth:180}} />
        <FieldInput type="date" value={filter.date}
          onChange={e=>setFilter({...filter,date:e.target.value})} style={{minWidth:160}} />
        <Btn variant="ghost" small onClick={()=>setFilter({status:"",date:"",search:""})}>
          Limpiar
        </Btn>
      </div>

      <div className="adm-section-pad" style={{padding:"16px 32px"}}>
        <div style={{fontSize:12,color:C.muted,marginBottom:12}}>
          {filtered.length} cita{filtered.length!==1?"s":""} encontrada{filtered.length!==1?"s":""}
        </div>

        {filtered.length===0 ? (
          <div style={{textAlign:"center",padding:"48px",color:C.muted}}>
            <div style={{fontSize:36,marginBottom:12}}>—</div>
            <Mono style={{fontSize:10}}>Sin resultados</Mono>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {filtered.map(a=>{
              const isExp = expandedId===a.id;
              const hasPayment = (admin.revenue||[]).some(r=>r.apptId===a.id);
              return (
                <div key={a.id} style={{border:`1px solid ${C.bdr}`,background:C.s1}}>
                  <div
                    onClick={()=>setExpandedId(isExp?null:a.id)}
                    className="adm-appt-row"
                    style={{
                      display:"grid",gridTemplateColumns:"56px 60px 1fr 140px 120px 120px",
                      gap:12,padding:"14px 18px",cursor:"pointer",alignItems:"center",
                    }}
                  >
                    <Mono style={{color:C.gold,fontSize:10}}>{a.time ? formatTime12h(a.time) : "—"}</Mono>
                    <Mono className="adm-hide-mobile" style={{color:C.muted,fontSize:9}}>{fmtDateShort(a.date)}</Mono>
                    <div>
                      <div style={{fontSize:14}}>{a.name}</div>
                      <div style={{fontSize:11,color:C.muted}}>{a.service}</div>
                    </div>
                    <div className="adm-hide-mobile" style={{fontSize:12,color:C.muted}}>{a.stylist}</div>
                    <Badge status={a.computedStatus}/>
                    <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                      {hasPayment && <span className="adm-hide-mobile" style={{fontSize:10,color:C.green}}>✓ Pagado</span>}
                      <span style={{color:C.muted,fontSize:14}}>{isExp?"▲":"▼"}</span>
                    </div>
                  </div>

                  {isExp && (
                    <div className="adm-two-col" style={{
                      padding:"16px 18px",borderTop:`1px solid ${C.bdr}`,
                      display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,
                      background:C.s2,
                    }}>
                      <div style={{display:"flex",flexDirection:"column",gap:10}}>
                        {[
                          ["Nombre",a.name],
                          ["Teléfono",a.phone],
                          ["Cédula",a.cedula],
                          ["Ticket",a.code],
                          ["Estilista",a.stylist],
                          ["Servicio",a.service],
                          ["Fecha",a.date?" "+fmtDateMed(a.date):"—"],
                          ["Hora",a.time],
                          ["Agendado",a.createdAt?fmtDateShort(new Date(a.createdAt).toISOString().split("T")[0]):"—"],
                        ].map(([k,v])=>(
                          <div key={k} style={{display:"flex",gap:12,alignItems:"baseline"}}>
                            <Mono style={{color:C.muted,fontSize:9,minWidth:70}}>{k}</Mono>
                            <span style={{fontSize:13}}>{v||"—"}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:8,justifyContent:"flex-end"}}>
                        {a.computedStatus==="pending" && (
                          <>
                            {a.phone && (
                              <a href={buildWaToClient(a)} target="_blank" rel="noopener"
                                style={{
                                  display:"block",padding:"9px 14px",textAlign:"center",
                                  background:"rgba(37,211,102,0.12)",
                                  border:"1px solid rgba(37,211,102,0.4)",color:"#25D366",
                                  textDecoration:"none",fontFamily:"'Outfit',sans-serif",
                                  fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",
                                }}>
                                💬 Enviar WA al cliente
                              </a>
                            )}
                            <Btn small onClick={()=>confirmAppt(a.id)}
                              style={{background:C.gold,color:"#0C0C0C",border:"none"}}>
                              ✓ Confirmar cita
                            </Btn>
                            <Btn variant="danger" small onClick={()=>cancelAppt(a.id)}>
                              ✕ Rechazar
                            </Btn>
                          </>
                        )}
                        {a.computedStatus==="expired" && (
                          <Btn small onClick={()=>confirmAppt(a.id)}
                            style={{background:C.gold,color:"#0C0C0C",border:"none"}}>
                            ↺ Reactivar cita
                          </Btn>
                        )}
                        {a.computedStatus!=="pending" && a.computedStatus!=="cancelled" && a.computedStatus!=="completed" && a.computedStatus!=="no-show" && (
                          <Btn variant="danger" small onClick={()=>cancelAppt(a.id)}>
                            ✕ Cancelar cita
                          </Btn>
                        )}
                        {(a.computedStatus==="scheduled"||a.computedStatus==="waiting") && (
                          <Btn variant="danger" small onClick={()=>markNoShow(a)} style={{
                            borderColor:"#e07070",color:"#e07070",
                          }}>
                            ⊘ Marcar incumplida
                          </Btn>
                        )}
                        {["scheduled","waiting","in-service"].includes(a.computedStatus) && (
                          <div style={{padding:"8px 10px",background:C.s2,border:`1px solid ${C.bdr}`}}>
                            <Mono style={{color:C.muted,fontSize:8,display:"block",marginBottom:6}}>
                              Ampliar ventana{a.bufferAfter>0?` · +${a.bufferAfter} min extra`:""}
                            </Mono>
                            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                              {[15,30,45,60].map(min=>(
                                <button key={min} onClick={()=>extendAppt(a.id,min)} style={{
                                  padding:"5px 10px",background:C.s3,border:`1px solid ${C.bdr}`,color:C.text,
                                  cursor:"pointer",fontSize:10,fontFamily:"'JetBrains Mono',monospace",
                                }}>+{min}m</button>
                              ))}
                              {a.bufferAfter>0 && (
                                <button onClick={()=>setApptBuffer(a.id,0)} style={{
                                  padding:"5px 10px",background:"transparent",border:`1px solid ${C.red}30`,color:C.red,
                                  cursor:"pointer",fontSize:10,fontFamily:"'JetBrains Mono',monospace",
                                }}>Quitar</button>
                              )}
                            </div>
                          </div>
                        )}
                        {a.computedStatus!=="pending" && a.computedStatus!=="cancelled" && !hasPayment && (
                          <Btn variant="subtle" small onClick={()=>registerPay(a)}>
                            $ Registrar pago
                          </Btn>
                        )}
                        {hasPayment && (
                          <div style={{padding:"8px 12px",background:"rgba(102,196,153,0.08)",
                            border:`1px solid ${C.green}30`,fontSize:12,color:C.green}}>
                            Pago registrado
                          </div>
                        )}
                        {a.computedStatus!=="pending" && a.phone && (
                          <a href={`https://wa.me/57${a.phone.replace(/\D/g,"")}`}
                            target="_blank" rel="noopener"
                            style={{
                              padding:"7px 14px",background:"transparent",
                              border:`1px solid rgba(37,211,102,0.3)`,color:"#25D366",
                              textDecoration:"none",fontFamily:"'Outfit',sans-serif",
                              fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",
                              textAlign:"center",
                            }}>
                            WhatsApp →
                          </a>
                        )}
                        <div style={{marginTop:4,paddingTop:8,borderTop:`1px solid ${C.bdr}`}}>
                          <button onClick={()=>deleteAppt(a.id)} style={{
                            width:"100%",padding:"7px 14px",background:"transparent",
                            border:`1px solid ${C.red}25`,color:C.red,cursor:"pointer",
                            fontFamily:"'Outfit',sans-serif",fontSize:10,
                            letterSpacing:"0.1em",textTransform:"uppercase",opacity:0.6,
                          }}>⊗ Eliminar cita</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pay modal */}
      {payForm && (
        <div style={{
          position:"fixed",inset:0,zIndex:200,
          background:"rgba(0,0,0,0.8)",backdropFilter:"blur(6px)",
          display:"flex",alignItems:"center",justifyContent:"center",padding:24,
        }} onClick={()=>setPayForm(null)}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:C.s1,border:`1px solid ${C.bdr}`,
            maxWidth:420,width:"100%",padding:32,
          }}>
            <h3 style={{fontFamily:"'Marcellus',serif",fontWeight:400,
              fontSize:24,margin:"0 0 24px",color:C.text}}>Registrar pago</h3>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <FieldInput label="Monto (COP)" type="number" value={payForm.amount}
                onChange={e=>setPayForm({...payForm,amount:e.target.value})}
                placeholder="45000" />
              <FieldSelect label="Método de pago" value={payForm.method}
                onChange={e=>setPayForm({...payForm,method:e.target.value})}
                options={METHODS} />
              <FieldInput label="Nota (opcional)" value={payForm.note}
                onChange={e=>setPayForm({...payForm,note:e.target.value})}
                placeholder="Descuento, propina, etc." />
              <div style={{padding:"12px 14px",background:C.s2,border:`1px solid ${C.bdr}`}}>
                <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:8}}>Resumen</Mono>
                <div style={{fontSize:13}}>{payForm.client} · {payForm.service}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:4}}>{fmtDateShort(payForm.date)}</div>
              </div>
              {admin.loyalty?.enabled && (
                <div style={{
                  display:"flex",alignItems:"center",gap:10,
                  padding:"10px 14px",background:C.s2,border:`1px solid ${C.bdr}`,
                  cursor:"pointer",
                }} onClick={()=>setPayForm(f=>({...f,addLoyalty:!f.addLoyalty}))}>
                  <input type="checkbox" readOnly checked={payForm.addLoyalty}
                    style={{accentColor:C.gold,width:15,height:15,pointerEvents:"none"}} />
                  <div>
                    <div style={{fontSize:13}}>Contar como visita de lealtad</div>
                    <div style={{fontSize:10,color:C.muted,marginTop:2}}>
                      {payForm.addLoyalty
                        ? `Se sumará 1 visita al cliente`
                        : "No afectará el contador de lealtad"}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:10,marginTop:24}}>
              <Btn variant="ghost" onClick={()=>setPayForm(null)} style={{flex:1}}>Cancelar</Btn>
              <Btn onClick={submitPay} disabled={!payForm.amount} style={{flex:1}}>Guardar pago</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== CRM ====================
const CrmView = () => {
  const [appts] = useAppts();
  const [admin] = useAdmin();
  const [crm, setCrm] = useCrm();
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [expanded, setExpanded] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const [editForm, setEditForm] = React.useState({});

  const loyalty = admin.loyalty || { enabled: false, target: 10, reward: "Corte gratis" };

  const all = getAllAppts(appts, admin.cancelledIds || []);
  // Group by cédula (primary identifier). Fall back to phone for old appointments without cédula.
  const byCedula = {};
  all.filter(a => a.cedula || a.phone).forEach(a => {
    const k = (a.cedula || "").replace(/\D/g,"") || (a.phone || "").replace(/\D/g, "");
    if (!byCedula[k]) byCedula[k] = { name: a.name, phone: a.phone, cedula: a.cedula || "", crmKey: k, appts: [] };
    byCedula[k].appts.push(a);
    if (a.createdAt >= (byCedula[k].latestAt || 0)) {
      byCedula[k].name = a.name; byCedula[k].latestAt = a.createdAt || 0;
      // Update to latest known cedula/phone for this key
      if (a.cedula) byCedula[k].cedula = a.cedula;
      if (a.phone)  byCedula[k].phone  = a.phone;
    }
  });

  const clients = Object.entries(byCedula).map(([crmKey, base]) => {
    // Try cedula key first, then phone key for legacy CRM data
    const cd = crm[crmKey] || crm[(base.phone||"").replace(/\D/g,"")] || {};
    const completed = base.appts.filter(a => a.computedStatus === "completed");
    return {
      crmKey, name: base.name, phone: base.phone, cedula: base.cedula,
      email: cd.email || "", birthday: cd.birthday || "", notes: cd.notes || "",
      loyaltyVisits: cd.loyaltyVisits || 0, loyaltyRedeemed: cd.loyaltyRedeemed || 0,
      totalVisits: completed.length,
      lastVisit: completed.sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0]?.date || null,
      totalSpent: (admin.revenue || []).filter(r => !r.deleted && base.appts.some(a => a.id === r.apptId))
        .reduce((s, r) => s + Number(r.amount || 0), 0),
      appts: base.appts,
    };
  }).sort((a, b) => b.appts.length - a.appts.length);

  const readyCount = loyalty.enabled ? clients.filter(c => c.loyaltyVisits >= loyalty.target).length : 0;

  const filtered = clients.filter(c => {
    if (filter === "loyalty" && c.loyaltyVisits === 0) return false;
    if (filter === "ready" && c.loyaltyVisits < loyalty.target) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q)
        || (c.cedula||"").includes(q)
        || (c.phone||"").replace(/\D/g,"").includes(q);
    }
    return true;
  });

  const startEdit = (c) => {
    setEditing(c.crmKey);
    setEditForm({ email: c.email, birthday: c.birthday, notes: c.notes });
  };

  const saveEdit = (crmKey) => {
    setCrm(d => ({ ...d, [crmKey]: { ...(d[crmKey] || {}), ...editForm, updatedAt: Date.now() } }));
    setEditing(null);
  };

  const addVisit = (crmKey) => setCrm(d => ({
    ...d, [crmKey]: { ...(d[crmKey]||{}), loyaltyVisits:(d[crmKey]?.loyaltyVisits||0)+1, updatedAt:Date.now() }
  }));

  const removeVisit = (crmKey) => {
    const cur = crm[crmKey]?.loyaltyVisits || 0;
    if (cur <= 0) return;
    setCrm(d => ({ ...d, [crmKey]: { ...(d[crmKey]||{}), loyaltyVisits:cur-1, updatedAt:Date.now() } }));
  };

  const redeem = (crmKey, c) => {
    if (!confirm(`¿Canjear "${loyalty.reward}" para ${c.name}?`)) return;
    setCrm(d => ({
      ...d, [crmKey]: {
        ...(d[crmKey]||{}),
        loyaltyVisits: Math.max(0, (d[crmKey]?.loyaltyVisits||0) - loyalty.target),
        loyaltyRedeemed: (d[crmKey]?.loyaltyRedeemed||0) + 1,
        updatedAt: Date.now(),
      }
    }));
  };

  const LoyaltyDots = ({ visits, target }) => {
    const dots = Math.min(target, 20);
    return (
      <div style={{ display:"flex", gap:3, flexWrap:"wrap", maxWidth:180 }}>
        {Array.from({length:dots}).map((_,i) => (
          <div key={i} style={{
            width:8, height:8,
            background: i < visits ? (visits >= target ? C.green : C.gold) : C.s3,
            border: `1px solid ${i < visits ? (visits >= target ? C.green : C.gold) : C.bdr}`,
            transition:"background 0.2s",
          }} />
        ))}
        {visits > dots && <Mono style={{fontSize:8,color:C.muted}}>+{visits-dots}</Mono>}
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="CRM · Clientes" subtitle="Fidelización · Historial"
        action={
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            {loyalty.enabled && readyCount > 0 && (
              <span style={{
                padding:"6px 14px",background:"rgba(102,196,153,0.1)",
                border:`1px solid ${C.green}40`,color:C.green,
                fontFamily:"'JetBrains Mono',monospace",fontSize:10,letterSpacing:"0.1em",
              }}>
                {readyCount} listo{readyCount!==1?"s":""} para canjear
              </span>
            )}
            <div style={{fontSize:12,color:C.muted}}>{clients.length} cliente{clients.length!==1?"s":""}</div>
          </div>
        }
      />

      <div style={{padding:"16px 32px",borderBottom:`1px solid ${C.bdr}`,display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
        <FieldInput placeholder="Buscar por nombre o teléfono…" value={search}
          onChange={e=>setSearch(e.target.value)} style={{minWidth:240,flex:1}} />
        <div style={{display:"flex",gap:4}}>
          {[
            {id:"all",label:"Todos"},
            {id:"loyalty",label:"Con puntos"},
            {id:"ready",label:"Para canjear"},
          ].map(f=>(
            <button key={f.id} onClick={()=>setFilter(f.id)} style={{
              padding:"8px 14px",background:filter===f.id?C.gold:"transparent",
              color:filter===f.id?"#0C0C0C":C.muted,
              border:`1px solid ${filter===f.id?C.gold:C.bdr}`,
              cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:11,letterSpacing:"0.08em",
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      <div style={{padding:"16px 32px"}}>
        {loyalty.enabled && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:16,marginBottom:24}}>
            <StatCard label="Total clientes" value={String(clients.length).padStart(2,"0")} small />
            <StatCard label="Con puntos activos" value={String(clients.filter(c=>c.loyaltyVisits>0).length).padStart(2,"0")} small color={C.blue} />
            <StatCard label="Para canjear" value={String(readyCount).padStart(2,"0")} small color={readyCount>0?C.green:C.muted} />
            <StatCard label="Canjes totales" value={String(clients.reduce((s,c)=>s+c.loyaltyRedeemed,0)).padStart(2,"0")} small color={C.gold} />
          </div>
        )}

        {filtered.length===0 ? (
          <div style={{textAlign:"center",padding:"48px",color:C.muted}}>
            <div style={{fontSize:32,marginBottom:12}}>—</div>
            <Mono style={{fontSize:10}}>Sin clientes</Mono>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {filtered.map(c=>{
              const isExp = expanded===c.crmKey;
              const isEditing = editing===c.crmKey;
              const ready = loyalty.enabled && c.loyaltyVisits >= loyalty.target;
              return (
                <div key={c.crmKey} style={{border:`1px solid ${ready?C.green+"60":C.bdr}`,background:C.s1}}>
                  <div onClick={()=>setExpanded(isExp?null:c.crmKey)} style={{
                    display:"grid",
                    gridTemplateColumns:loyalty.enabled?"200px 110px 60px 100px 1fr auto":"200px 110px 60px 100px auto",
                    gap:12,padding:"14px 18px",cursor:"pointer",alignItems:"center",
                  }}>
                    <div>
                      <div style={{fontSize:14}}>{c.name}</div>
                      {c.cedula
                        ? <div style={{fontSize:11,color:C.muted,fontFamily:"'JetBrains Mono',monospace"}}>{c.cedula}</div>
                        : <div style={{fontSize:11,color:C.muted,fontFamily:"'JetBrains Mono',monospace"}}>{(c.phone||"")}</div>
                      }
                    </div>
                    <div style={{fontSize:12,color:C.muted}}>
                      {c.lastVisit?fmtDateShort(c.lastVisit):"—"}
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:20,fontFamily:"'Marcellus',serif",color:C.gold}}>{c.totalVisits}</div>
                      <Mono style={{fontSize:8,color:C.muted}}>visitas</Mono>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:14,color:c.totalSpent>0?C.green:C.muted}}>
                        {c.totalSpent>0?fmtCOP(c.totalSpent):"—"}
                      </div>
                      <Mono style={{fontSize:8,color:C.muted}}>pagado</Mono>
                    </div>
                    {loyalty.enabled && (
                      <div style={{display:"flex",flexDirection:"column",gap:5}}>
                        <LoyaltyDots visits={c.loyaltyVisits} target={loyalty.target} />
                        {ready && <Mono style={{fontSize:8,color:C.green}}>✓ {loyalty.reward}</Mono>}
                        {!ready && c.loyaltyVisits>0 && (
                          <Mono style={{fontSize:8,color:C.muted}}>{c.loyaltyVisits}/{loyalty.target}</Mono>
                        )}
                      </div>
                    )}
                    <span style={{color:C.muted}}>{isExp?"▲":"▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{borderTop:`1px solid ${C.bdr}`,padding:"20px 18px",background:C.s2}}>
                      <div style={{display:"grid",gridTemplateColumns:loyalty.enabled?"1fr 1fr 1.4fr":"1fr 1.8fr",gap:20}}>

                        {/* Perfil */}
                        <div>
                          <Mono style={{color:C.gold,fontSize:9,display:"block",marginBottom:12}}>Perfil</Mono>
                          {isEditing ? (
                            <div style={{display:"flex",flexDirection:"column",gap:10}}>
                              <FieldInput label="Email" value={editForm.email}
                                onChange={e=>setEditForm({...editForm,email:e.target.value})}
                                placeholder="cliente@email.com" />
                              <FieldInput label="Cumpleaños" type="date" value={editForm.birthday}
                                onChange={e=>setEditForm({...editForm,birthday:e.target.value})} />
                              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                                <Mono style={{color:C.muted,fontSize:9}}>Notas</Mono>
                                <textarea value={editForm.notes}
                                  onChange={e=>setEditForm({...editForm,notes:e.target.value})}
                                  placeholder="Preferencias, alergias, estilo…"
                                  style={{
                                    background:C.s1,border:`1px solid ${C.bdr}`,color:C.text,
                                    padding:"10px 12px",fontFamily:"'Outfit',sans-serif",
                                    fontSize:13,resize:"vertical",minHeight:72,width:"100%",
                                  }} />
                              </div>
                              <div style={{display:"flex",gap:8}}>
                                <Btn small onClick={()=>saveEdit(c.crmKey)}>Guardar</Btn>
                                <Btn small variant="ghost" onClick={()=>setEditing(null)}>Cancelar</Btn>
                              </div>
                            </div>
                          ) : (
                            <div style={{display:"flex",flexDirection:"column",gap:10}}>
                              {[
                                ["Cédula", c.cedula||"—"],
                                ["Teléfono", c.phone||"—"],
                                ["Email", c.email],
                                ["Cumpleaños", c.birthday?fmtDateShort(c.birthday):null],
                                ["Notas", c.notes],
                              ].map(([k,v])=>(
                                <div key={k}>
                                  <Mono style={{color:C.muted,fontSize:9,display:"block"}}>{k}</Mono>
                                  <div style={{fontSize:13,marginTop:2,color:v?C.text:C.muted}}>{v||"—"}</div>
                                </div>
                              ))}
                              <div style={{display:"flex",gap:8,marginTop:4}}>
                                <Btn small variant="subtle" onClick={()=>startEdit(c)}>✎ Editar</Btn>
                                {c.phone && (
                                  <a href={`https://wa.me/57${(c.phone||"").replace(/\D/g,"")}`}
                                    target="_blank" rel="noopener"
                                    style={{
                                      padding:"7px 14px",background:"transparent",
                                      border:"1px solid rgba(37,211,102,0.3)",color:"#25D366",
                                      textDecoration:"none",fontFamily:"'Outfit',sans-serif",
                                      fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",
                                    }}>WA →</a>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Lealtad */}
                        {loyalty.enabled && (
                          <div>
                            <Mono style={{color:C.gold,fontSize:9,display:"block",marginBottom:12}}>Lealtad</Mono>
                            <div style={{marginBottom:16}}>
                              <div style={{fontFamily:"'Marcellus',serif",fontSize:36,color:ready?C.green:C.gold,lineHeight:1}}>
                                {c.loyaltyVisits}
                                <span style={{fontSize:18,color:C.muted}}>/{loyalty.target}</span>
                              </div>
                              <Mono style={{color:C.muted,fontSize:9}}>visitas acumuladas</Mono>
                              <div style={{marginTop:10,height:5,background:C.s3,position:"relative"}}>
                                <div style={{
                                  position:"absolute",left:0,top:0,bottom:0,
                                  background:ready?C.green:C.gold,
                                  width:`${Math.min(c.loyaltyVisits/loyalty.target*100,100)}%`,
                                  transition:"width 0.3s",
                                }}/>
                              </div>
                              {c.loyaltyRedeemed>0 && (
                                <div style={{fontSize:11,color:C.muted,marginTop:8}}>
                                  {c.loyaltyRedeemed} canje{c.loyaltyRedeemed!==1?"s":""} totales
                                </div>
                              )}
                            </div>
                            <div style={{display:"flex",flexDirection:"column",gap:8}}>
                              {ready && (
                                <Btn small onClick={()=>redeem(c.crmKey,c)}
                                  style={{background:C.green,color:"#0C0C0C",border:"none"}}>
                                  ✓ Canjear {loyalty.reward}
                                </Btn>
                              )}
                              <div style={{display:"flex",gap:6}}>
                                <Btn small variant="subtle" onClick={()=>addVisit(c.crmKey)}>+ Visita</Btn>
                                <Btn small variant="ghost" onClick={()=>removeVisit(c.crmKey)}>− Visita</Btn>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Historial */}
                        <div>
                          <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:12}}>Historial de citas</Mono>
                          <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:220,overflowY:"auto"}}>
                            {c.appts.sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(a=>(
                              <div key={a.id} style={{
                                display:"grid",gridTemplateColumns:"50px 76px 1fr auto",
                                gap:8,padding:"8px 10px",background:C.s1,alignItems:"center",
                              }}>
                                <Mono style={{color:C.gold,fontSize:9}}>{formatTime12h(a.time)}</Mono>
                                <Mono style={{fontSize:9,color:C.muted}}>{fmtDateShort(a.date)}</Mono>
                                <div style={{fontSize:12}}>{a.service}</div>
                                <Badge status={a.computedStatus}/>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== BLOCK SLOTS ====================
const EMP_COLORS = ["#C29E66","#66C499","#8ab0ff","#C466A0","#66B5C4","#C49066"];

// Modal to create a block range or absence. Shared by the admin "Bloquear
// horas" view and the per-employee self-service section (Staff mode).
// `lockedEmpId`: if set, the employee selector is hidden and forced to that id
// (an employee blocking their own agenda can't block someone else's).
const MONTH_DOW = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

// Compact month calendar for picking a date range inside BlockRangeModal.
// Reuses the same visual language as the weekly grid in BlockSlotsView (same
// nav-arrow buttons, Mono day labels, gold "today"/selection highlight) but
// shows a full navigable month instead of a fixed week, and highlights the
// selected range (click once for the start day, again for the end day)
// instead of a single selected day.
const DayRangePicker = ({ dateStart, dateEnd, onPick }) => {
  const [viewMonth, setViewMonth] = React.useState(() => {
    const [y,m] = dateStart.split("-").map(Number);
    return new Date(y, m-1, 1);
  });
  const [pickingEnd, setPickingEnd] = React.useState(false);
  const todayD = todayStr();

  const monthLabel = viewMonth.toLocaleDateString("es-CO",{month:"long",year:"numeric"});
  const shiftMonth = (n) => setViewMonth(v => new Date(v.getFullYear(), v.getMonth()+n, 1));

  const cells = React.useMemo(() => {
    const year = viewMonth.getFullYear(), month = viewMonth.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const numDays = new Date(year, month+1, 0).getDate();
    const out = [];
    for (let i=0;i<firstDow;i++) out.push(null);
    for (let d=1; d<=numDays; d++) {
      const dt = new Date(year, month, d, 12);
      out.push(`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`);
    }
    return out;
  }, [viewMonth]);

  const pickDay = (d) => {
    if (d < todayD) return; // no se pueden bloquear fechas pasadas
    if (!pickingEnd) {
      onPick(d, d);
      setPickingEnd(true);
    } else {
      if (d < dateStart) onPick(d, dateStart);
      else onPick(dateStart, d);
      setPickingEnd(false);
    }
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <button onClick={()=>shiftMonth(-1)} style={{
          background:"transparent",border:`1px solid ${C.bdr}`,color:C.text,
          cursor:"pointer",padding:"4px 10px",fontSize:12,
        }}>←</button>
        <Mono style={{color:C.gold,fontSize:9,textTransform:"capitalize"}}>{monthLabel}</Mono>
        <button onClick={()=>shiftMonth(1)} style={{
          background:"transparent",border:`1px solid ${C.bdr}`,color:C.text,
          cursor:"pointer",padding:"4px 10px",fontSize:12,
        }}>→</button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
        {MONTH_DOW.map(l=>(
          <Mono key={l} style={{color:C.muted,fontSize:7,textAlign:"center"}}>{l[0]}</Mono>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {cells.map((d,i)=>{
          if (!d) return <div key={i} />;
          const isToday = d===todayD;
          const isPast = d<todayD;
          const inRange = d>=dateStart && d<=dateEnd;
          const isEdge = d===dateStart || d===dateEnd;
          return (
            <button key={d} disabled={isPast} onClick={()=>pickDay(d)} style={{
              background:isEdge?C.gold:inRange?"rgba(194,158,102,0.18)":C.s1,
              border:`1px solid ${isEdge?C.gold:C.bdr}`,
              color:isPast?C.muted2:isEdge?"#0C0C0C":isToday?C.gold:C.text,
              cursor:isPast?"default":"pointer",
              opacity:isPast?0.35:1,
              padding:"6px 0",fontSize:11,
              fontFamily:"'Outfit',sans-serif",fontWeight:isToday||isEdge?600:400,
            }}>
              {Number(d.slice(8,10))}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const BlockRangeModal = ({ employees, defaultEmpId, lockedEmpId, onSave, onClose }) => {
  const [employeeId,setEmployeeId] = React.useState(lockedEmpId ?? defaultEmpId ?? "all");
  const [dateStart,setDateStart] = React.useState(todayStr());
  const [dateEnd,setDateEnd] = React.useState(todayStr());
  const [allDay,setAllDay] = React.useState(false);
  const [timeStart,setTimeStart] = React.useState("09:00");
  const [timeEnd,setTimeEnd] = React.useState("18:00");
  const [reason,setReason] = React.useState("");

  const inputStyle = {
    background:C.s2,border:`1px solid ${C.bdr}`,color:C.text,
    padding:"7px 10px",fontFamily:"'Outfit',sans-serif",fontSize:12,
    outline:"none",width:"100%",
  };

  const valid = dateStart && dateEnd && dateStart<=dateEnd && (allDay || (timeStart && timeEnd && timeStart<timeEnd));

  const submit = () => {
    if (!valid) return;
    const empVal = lockedEmpId ?? (employeeId==="all" ? null : employeeId);
    onSave({
      id: genId(),
      dateStart, dateEnd,
      allDay,
      timeStart: allDay ? null : timeStart,
      timeEnd: allDay ? null : timeEnd,
      employeeId: empVal,
      reason: reason || (allDay ? "Ausencia" : "No disponible"),
      type: (allDay || dateStart!==dateEnd) ? "absence" : "block",
      createdAt: Date.now(),
    });
    onClose();
  };

  return (
    <div style={{
      position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:200,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20,
    }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:C.s1,border:`1px solid ${C.bdr}`,padding:24,width:400,maxWidth:"100%",
      }}>
        <Mono style={{color:C.gold,display:"block",marginBottom:16}}>Bloquear rango / Ausencia</Mono>

        {!lockedEmpId && (
          <div style={{marginBottom:12}}>
            <Mono style={{color:C.muted,fontSize:8,display:"block",marginBottom:5}}>Empleado</Mono>
            <select value={employeeId} onChange={e=>setEmployeeId(e.target.value)} style={inputStyle}>
              <option value="all">Todos</option>
              {employees.map(e=>(<option key={e.id} value={e.id}>{e.name}</option>))}
            </select>
          </div>
        )}

        <div style={{marginBottom:12}}>
          <Mono style={{color:C.muted,fontSize:8,display:"block",marginBottom:6}}>
            Fecha(s) — clic para inicio, clic de nuevo para fin
          </Mono>
          <DayRangePicker
            dateStart={dateStart}
            dateEnd={dateEnd}
            onPick={(s,e)=>{ setDateStart(s); setDateEnd(e); }}
          />
          <Mono style={{color:C.gold,fontSize:9,display:"block",marginTop:8}}>
            {dateStart===dateEnd ? fmtDateMed(dateStart) : `${fmtDateShort(dateStart)} – ${fmtDateShort(dateEnd)}`}
          </Mono>
        </div>

        <label style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,cursor:"pointer"}}>
          <input type="checkbox" checked={allDay} onChange={e=>setAllDay(e.target.checked)} />
          <Mono style={{color:C.text,fontSize:10,textTransform:"none",letterSpacing:0}}>Día(s) completo(s) — ausencia</Mono>
        </label>

        {!allDay && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div>
              <Mono style={{color:C.muted,fontSize:8,display:"block",marginBottom:5}}>Hora inicio</Mono>
              <input type="time" value={timeStart} onChange={e=>setTimeStart(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <Mono style={{color:C.muted,fontSize:8,display:"block",marginBottom:5}}>Hora fin</Mono>
              <input type="time" value={timeEnd} onChange={e=>setTimeEnd(e.target.value)} style={inputStyle} />
            </div>
          </div>
        )}

        <div style={{marginBottom:18}}>
          <Mono style={{color:C.muted,fontSize:8,display:"block",marginBottom:5}}>Motivo</Mono>
          <input value={reason} onChange={e=>setReason(e.target.value)}
            placeholder="Vacaciones, cita médica, permiso… (opcional)" style={inputStyle} />
        </div>

        {!valid && (
          <div style={{color:C.red,fontSize:10,marginBottom:12}}>
            Verifica las fechas/horas: inicio debe ser anterior al fin.
          </div>
        )}

        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{
            background:"transparent",border:`1px solid ${C.bdr}`,color:C.muted,
            cursor:"pointer",padding:"8px 16px",fontSize:11,fontFamily:"'Outfit',sans-serif",
          }}>Cancelar</button>
          <button onClick={submit} disabled={!valid} style={{
            background:valid?C.gold:C.s2,border:"none",color:valid?"#0C0C0C":C.muted,
            cursor:valid?"pointer":"not-allowed",padding:"8px 16px",fontSize:11,
            fontFamily:"'Outfit',sans-serif",fontWeight:600,
          }}>Bloquear</button>
        </div>
      </div>
    </div>
  );
};

const BlockSlotsView = () => {
  const [appts,setAppts] = useAppts();
  const [admin] = useAdmin();
  const [weekOffset,setWeekOffset] = React.useState(0);
  const [reason,setReason] = React.useState("");
  const [hovered,setHovered] = React.useState(null);
  const [selectedDate,setSelectedDate] = React.useState(todayStr());
  const [empId,setEmpId] = React.useState("all");
  const [showRangeModal,setShowRangeModal] = React.useState(false);

  const ALL_TIMES = ["10:00","11:00","12:00","13:00","14:00",
    "15:00","16:00","17:00","18:00","19:00","20:00"];

  const employees = (admin.employees||[]).filter(e=>e.active);
  const weekDates = getWeekDates(weekOffset);
  const todayD = todayStr();
  const blocks = normalizeBlocks(appts);

  const empColor = (id) => {
    const idx = employees.findIndex(e=>e.id===id);
    return idx>=0 ? EMP_COLORS[idx % EMP_COLORS.length] : C.red;
  };

  const visibleBlocks = (date,time) => {
    const matches = blocks.filter(b=>blockCoversSlot(b,date,time));
    if (empId==="all") return matches;
    return matches.filter(b=>blockAppliesToEmp(b,empId));
  };

  const isBlocked = (date,time) => visibleBlocks(date,time).length > 0;

  // Clicking a cell only toggles a single-slot block. Bigger ranges/absences
  // covering this cell must be removed from the sidebar list (can't slice a
  // range from a single click without ambiguity about what to keep).
  const toggleSlot = (date,time) => {
    const covering = visibleBlocks(date,time);
    const exact = covering.find(b=>
      b.dateStart===date && b.dateEnd===date && !b.allDay &&
      b.timeStart===time && (empId==="all" ? b.employeeId==null : b.employeeId===empId)
    );
    if (exact) {
      setAppts(s=>removeBlock(s, exact.id));
      return;
    }
    if (covering.length>0) {
      alert("Esta hora está cubierta por un bloqueo de rango. Elimínalo desde la lista de la derecha.");
      return;
    }
    const endMin = timeToMin(time)+BLOCK_SLOT_MIN;
    const newRange = {
      id:genId(), dateStart:date, dateEnd:date, allDay:false,
      timeStart:time, timeEnd:minToTime(endMin),
      employeeId: empId==="all" ? null : empId,
      reason: reason||"No disponible", type:"block", createdAt:Date.now(),
    };
    setAppts(s=>({...s, blockRanges:[...(s.blockRanges||[]),newRange]}));
  };

  const clearDay = (date) => {
    if (!confirm(`¿Desbloquear todas las horas del ${fmtDateShort(date)}?`)) return;
    const matchesEmp = (b) => empId==="all" ? true : blockAppliesToEmp(b,empId);
    setAppts(s=>({
      ...s,
      blockedSlots:(s.blockedSlots||[]).filter(b=>!(b.date===date && matchesEmp(b))),
      blockRanges:(s.blockRanges||[]).filter(b=>!(b.dateStart===date && b.dateEnd===date && matchesEmp(b))),
    }));
  };

  const blockedForDay = (date) => {
    const all = blocks.filter(b=>date>=b.dateStart && date<=(b.dateEnd||b.dateStart));
    if (empId==="all") return all;
    return all.filter(b=>blockAppliesToEmp(b,empId));
  };
  const selectedBlocked = blockedForDay(selectedDate);

  const DAY_LABELS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

  const weekLabel = () => {
    const first = weekDates[0]; const last = weekDates[weekDates.length-1];
    const f = new Date(first+"T12:00"); const l = new Date(last+"T12:00");
    return `${f.getDate()} – ${l.getDate()} ${l.toLocaleDateString("es-CO",{month:"long",year:"numeric"})}`;
  };

  return (
    <div>
      <PageHeader title="Bloquear horas" subtitle="Agenda · Disponibilidad" />
      <div style={{padding:"24px 32px",display:"grid",gridTemplateColumns:"1fr 280px",gap:24}}>

        {/* Weekly grid */}
        <Card style={{padding:0,overflow:"hidden"}}>
          {/* Week nav header */}
          <div style={{
            display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"16px 20px",borderBottom:`1px solid ${C.bdr}`,
          }}>
            <button onClick={()=>setWeekOffset(o=>o-1)} style={{
              background:"transparent",border:`1px solid ${C.bdr}`,color:C.text,
              cursor:"pointer",padding:"6px 12px",fontSize:14,
            }}>←</button>
            <div style={{textAlign:"center"}}>
              <Mono style={{color:C.gold,fontSize:10}}>{weekLabel()}</Mono>
              {weekOffset!==0 && (
                <button onClick={()=>setWeekOffset(0)} style={{
                  background:"transparent",border:"none",color:C.muted,
                  cursor:"pointer",fontSize:10,marginTop:4,display:"block",
                  fontFamily:"'Outfit',sans-serif",
                }}>Volver a esta semana</button>
              )}
            </div>
            <button onClick={()=>setWeekOffset(o=>o+1)} style={{
              background:"transparent",border:`1px solid ${C.bdr}`,color:C.text,
              cursor:"pointer",padding:"6px 12px",fontSize:14,
            }}>→</button>
          </div>

          {/* Employee + Reason inputs */}
          <div style={{padding:"12px 20px",borderBottom:`1px solid ${C.bdr}`,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <Mono style={{color:C.muted,fontSize:8,whiteSpace:"nowrap"}}>Empleado</Mono>
            <select value={empId} onChange={e=>setEmpId(e.target.value)} style={{
              background:C.s2,border:`1px solid ${empId==="all"?C.bdr:empColor(empId)+"80"}`,
              color:empId==="all"?C.muted:empColor(empId),
              padding:"6px 10px",fontFamily:"'Outfit',sans-serif",fontSize:12,
              cursor:"pointer",outline:"none",minWidth:120,
            }}>
              <option value="all">Todos</option>
              {employees.map(e=>(
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            <Mono style={{color:C.muted,fontSize:8,whiteSpace:"nowrap"}}>Motivo</Mono>
            <input value={reason} onChange={e=>setReason(e.target.value)}
              placeholder="Almuerzo, descanso… (opcional)"
              style={{
                flex:1,background:C.s2,border:`1px solid ${C.bdr}`,color:C.text,
                padding:"6px 10px",fontFamily:"'Outfit',sans-serif",fontSize:12,
                outline:"none",minWidth:160,
              }} />
            <button onClick={()=>setShowRangeModal(true)} style={{
              background:"transparent",border:`1px solid ${C.gold+"60"}`,color:C.gold,
              cursor:"pointer",padding:"6px 12px",fontSize:10,whiteSpace:"nowrap",
              fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.08em",
            }}>+ Bloquear rango / ausencia</button>
          </div>

          {showRangeModal && (
            <BlockRangeModal
              employees={employees}
              defaultEmpId={empId}
              onSave={(range)=>setAppts(s=>({...s, blockRanges:[...(s.blockRanges||[]),range]}))}
              onClose={()=>setShowRangeModal(false)}
            />
          )}

          {/* Calendar grid */}
          <div style={{overflowX:"auto"}}>
            <div style={{
              display:"grid",
              gridTemplateColumns:`52px repeat(${weekDates.length},1fr)`,
              gridAutoRows:"32px",
              minWidth:520,
            }}>
              {/* Header row: day names */}
              <div style={{
                background:C.s1,borderBottom:`1px solid ${C.bdr}`,
                borderRight:`1px solid ${C.bdr}`,
              }} />
              {weekDates.map((d,i)=>{
                const isToday = d===todayD;
                const isSelected = d===selectedDate;
                const cnt = blockedForDay(d).length;
                return (
                  <button key={d} onClick={()=>setSelectedDate(d)} style={{
                    background:isToday?`rgba(194,158,102,0.07)`:isSelected?C.s2:C.s1,
                    borderBottom:`1px solid ${C.bdr}`,
                    borderRight:`1px solid ${C.bdr}`,
                    borderLeft:"none",borderTop:"none",
                    padding:"10px 4px",cursor:"pointer",
                    textAlign:"center",
                    outline:isSelected?`1px solid ${C.gold+"50"}`:"none",
                    outlineOffset:-1,
                  }}>
                    <Mono style={{
                      color:isToday?C.gold:C.muted,
                      fontSize:8,display:"block",
                    }}>{DAY_LABELS[i]}</Mono>
                    <span style={{
                      color:isToday?C.gold:C.text,
                      fontSize:13,fontFamily:"'Outfit',sans-serif",
                      fontWeight:isToday?600:400,
                    }}>
                      {new Date(d+"T12:00").getDate()}
                    </span>
                    {cnt>0 && (
                      <Mono style={{
                        display:"block",fontSize:7,
                        color:C.red,marginTop:2,
                      }}>{cnt}✕</Mono>
                    )}
                  </button>
                );
              })}

              {/* Time rows */}
              {ALL_TIMES.map(t=>{
                const isBookingTime = TIMES.includes(t);
                return (
                  <React.Fragment key={t}>
                    {/* Time label */}
                    <div style={{
                      background:C.s1,
                      borderBottom:`1px solid ${C.bdr}`,
                      borderRight:`1px solid ${C.bdr}`,
                      display:"flex",alignItems:"center",justifyContent:"flex-end",
                      padding:"0 8px",
                    }}>
                      <Mono style={{
                        color:isBookingTime?C.gold+"90":C.muted,
                        fontSize:8,
                      }}>{formatTime12h(t)}</Mono>
                    </div>
                    {/* Day cells */}
                    {weekDates.map(d=>{
                      const blocks = visibleBlocks(d,t);
                      const blocked = blocks.length>0;
                      const blockColor = blocked
                        ? (blocks[0].employeeId ? empColor(blocks[0].employeeId) : C.red)
                        : C.red;
                      const isHov = hovered&&hovered.date===d&&hovered.time===t;
                      const isToday = d===todayD;
                      const blockTitle = blocked
                        ? blocks.map(b=>{
                            const emp = employees.find(e=>e.id===b.employeeId);
                            return `${emp?emp.name:"Todos"}: ${b.reason||"No disponible"}`;
                          }).join(" · ")
                        : "Haz clic para bloquear";
                      return (
                        <button key={d} onClick={()=>toggleSlot(d,t)}
                          onMouseEnter={()=>setHovered({date:d,time:t})}
                          onMouseLeave={()=>setHovered(null)}
                          title={blockTitle}
                          style={{
                            background:blocked?blockColor+"22":
                                       isHov?"rgba(194,158,102,0.08)":
                                       isToday?"rgba(194,158,102,0.03)":"transparent",
                            border:"none",
                            borderBottom:`1px solid ${C.bdr}`,
                            borderRight:`1px solid ${C.bdr}`,
                            cursor:"pointer",
                            display:"flex",alignItems:"center",justifyContent:"center",
                            gap:2,
                            transition:"background 0.1s",
                          }}>
                          {blocked && blocks.map((b,bi)=>(
                            <div key={bi} style={{
                              width:7,height:7,borderRadius:"50%",
                              background:b.employeeId?empColor(b.employeeId):C.red,
                              opacity:0.9,flexShrink:0,
                            }}/>
                          ))}
                          {!blocked && isBookingTime && !isHov && (
                            <div style={{
                              width:3,height:3,borderRadius:"50%",
                              background:C.gold,opacity:0.25,
                            }}/>
                          )}
                          {isHov && !blocked && (
                            <span style={{fontSize:12,color:C.muted,lineHeight:1}}>+</span>
                          )}
                        </button>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div style={{padding:"12px 20px",display:"flex",gap:16,flexWrap:"wrap",borderTop:`1px solid ${C.bdr}`,alignItems:"center"}}>
            {employees.map((e,i)=>(
              <div key={e.id} style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:EMP_COLORS[i%EMP_COLORS.length],opacity:0.9}}/>
                <Mono style={{color:C.muted,fontSize:8}}>{e.name}</Mono>
              </div>
            ))}
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:4,height:4,borderRadius:"50%",background:C.gold,opacity:0.5}}/>
              <Mono style={{color:C.muted,fontSize:8}}>Hora de reserva</Mono>
            </div>
            <Mono style={{color:C.muted,fontSize:8,marginLeft:"auto"}}>Clic para bloquear/desbloquear</Mono>
          </div>
        </Card>

        {/* Sidebar: selected day details */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div>
                <Mono style={{color:C.gold,display:"block",fontSize:9}}>
                  {fmtDateMed(selectedDate)}
                </Mono>
                <Mono style={{color:C.muted,fontSize:8,display:"block",marginTop:2}}>
                  {selectedBlocked.length} bloqueado{selectedBlocked.length!==1?"s":""}
                </Mono>
              </div>
              {selectedBlocked.length>0 && (
                <button onClick={()=>clearDay(selectedDate)} style={{
                  background:"transparent",border:`1px solid ${C.red+"50"}`,
                  color:C.red,cursor:"pointer",fontSize:9,padding:"4px 8px",
                  fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.1em",
                }}>Limpiar</button>
              )}
            </div>
            {selectedBlocked.length===0 ? (
              <div style={{color:C.muted,fontSize:12}}>Sin bloqueos para este día.</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {selectedBlocked
                  .sort((a,b)=>(a.timeStart||"")<(b.timeStart||"")?-1:(a.timeStart||"")>(b.timeStart||"")?1:0)
                  .map(b=>{
                  const emp = employees.find(e=>e.id===b.employeeId);
                  const color = b.employeeId ? empColor(b.employeeId) : C.red;
                  const multiDay = b.dateStart!==b.dateEnd;
                  const whenLabel = b.allDay
                    ? (multiDay ? `${fmtDateShort(b.dateStart)} – ${fmtDateShort(b.dateEnd)} · Todo el día` : "Todo el día")
                    : (multiDay ? `${fmtDateShort(b.dateStart)} – ${fmtDateShort(b.dateEnd)} · ${formatTime12h(b.timeStart)}–${formatTime12h(b.timeEnd)}` : `${formatTime12h(b.timeStart)}–${formatTime12h(b.timeEnd)}`);
                  return (
                    <div key={b.id} style={{
                      display:"flex",justifyContent:"space-between",alignItems:"center",
                      padding:"6px 10px",background:C.s2,
                      borderLeft:`2px solid ${color}50`,
                    }}>
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <Mono style={{color,fontSize:10}}>{whenLabel}</Mono>
                          {emp && <Mono style={{color:C.muted,fontSize:8}}>{emp.name}</Mono>}
                        </div>
                        {b.reason && b.reason!=="No disponible" && (
                          <div style={{fontSize:10,color:C.muted,marginTop:2}}>{b.reason}</div>
                        )}
                      </div>
                      <button onClick={()=>setAppts(s=>removeBlock(s, b.id))} style={{
                        background:"transparent",border:"none",color:C.muted,
                        cursor:"pointer",fontSize:13,padding:"2px 6px",
                      }}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <Mono style={{color:C.muted,display:"block",marginBottom:10,fontSize:8}}>
              Semana actual — total bloqueado
            </Mono>
            {weekDates.map(d=>{
              const cnt = blockedForDay(d).length;
              const isToday = d===todayD;
              const isSelected = d===selectedDate;
              return (
                <button key={d} onClick={()=>setSelectedDate(d)} style={{
                  display:"flex",justifyContent:"space-between",alignItems:"center",
                  width:"100%",padding:"7px 0",background:"transparent",border:"none",
                  borderBottom:`1px solid ${C.bdr}`,cursor:"pointer",
                  color:isSelected?C.gold:isToday?C.gold+"90":C.text,
                  fontFamily:"'Outfit',sans-serif",fontSize:12,
                }}>
                  <span style={{fontWeight:isSelected?600:400}}>{fmtDateMed(d)}</span>
                  {cnt>0
                    ? <Mono style={{color:C.red,fontSize:9}}>{cnt} bloq</Mono>
                    : <Mono style={{color:C.muted+"60",fontSize:9}}>libre</Mono>
                  }
                </button>
              );
            })}
          </Card>
        </div>
      </div>
    </div>
  );
};

// ==================== REVENUE ====================
const RevenueView = () => {
  const [admin,setAdmin] = useAdmin();
  const [tab,setTab] = React.useState("ingresos");
  const [showForm,setShowForm] = React.useState(false);
  const [period,setPeriod] = React.useState("today");
  const [showDaySummary,setShowDaySummary] = React.useState(false);
  const [form,setForm] = React.useState({date:todayStr(),amount:"",service:"",client:"",method:"Efectivo",note:"",stylist:""});
  const [expForm,setExpForm] = React.useState({date:todayStr(),amount:"",category:"Insumos",method:"Efectivo",note:""});

  const revenue   = (admin.revenue||[]).filter(r=>!r.deleted);
  const expenses  = (admin.expenses||[]).filter(r=>!r.deleted);
  const employees = (admin.employees||[]).filter(e=>e.active);
  const todayD    = todayStr();
  const now       = nowCOT();
  const weekStart = (() => {
    const d=new Date(now); d.setDate(now.getDate()-(now.getDay()===0?6:now.getDay()-1));
    return ymd(d);
  })();
  const monthStart = todayD.slice(0,7)+"-01";

  const filtered = revenue.filter(r=>{
    if (period==="today")  return r.date===todayD;
    if (period==="week")   return r.date>=weekStart;
    if (period==="month")  return r.date>=monthStart;
    return true;
  }).sort((a,b)=>(b.date||"").localeCompare(a.date||""));

  const total = filtered.reduce((s,r)=>s+Number(r.amount||0),0);

  const inPeriod = (d) => {
    if (period==="today") return d===todayD;
    if (period==="week")  return d>=weekStart;
    if (period==="month") return d>=monthStart;
    return true;
  };
  const filteredExp = expenses.filter(r=>inPeriod(r.date)).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const expTotal = filteredExp.reduce((s,r)=>s+Number(r.amount||0),0);
  const profit   = total - expTotal;
  const byCategory = {};
  filteredExp.forEach(r=>{ byCategory[r.category||"Otros"]=(byCategory[r.category||"Otros"]||0)+Number(r.amount||0); });

  const byMethod = {};
  filtered.forEach(r=>{ byMethod[r.method]=(byMethod[r.method]||0)+Number(r.amount||0); });

  const byService = {};
  filtered.forEach(r=>{
    if (r.service) byService[r.service]=(byService[r.service]||0)+Number(r.amount||0);
  });

  // Per-employee stats for current period
  const byEmployee = {};
  filtered.forEach(r=>{
    if (!r.stylist) return;
    if (!byEmployee[r.stylist]) byEmployee[r.stylist]={total:0,count:0,services:{}};
    byEmployee[r.stylist].total += Number(r.amount||0);
    byEmployee[r.stylist].count += 1;
    if (r.service) byEmployee[r.stylist].services[r.service]=(byEmployee[r.stylist].services[r.service]||0)+1;
  });

  // Today's entries for day-close summary
  const todayEntries = revenue.filter(r=>r.date===todayD);
  const todayTotal   = todayEntries.reduce((s,r)=>s+Number(r.amount||0),0);
  const todayByEmp   = {};
  todayEntries.forEach(r=>{
    if (!r.stylist) {
      if (!todayByEmp["Sin asignar"]) todayByEmp["Sin asignar"]={total:0,count:0,services:{}};
      todayByEmp["Sin asignar"].total += Number(r.amount||0);
      todayByEmp["Sin asignar"].count += 1;
      if (r.service) todayByEmp["Sin asignar"].services[r.service]=(todayByEmp["Sin asignar"].services[r.service]||0)+1;
      return;
    }
    if (!todayByEmp[r.stylist]) todayByEmp[r.stylist]={total:0,count:0,services:{}};
    todayByEmp[r.stylist].total += Number(r.amount||0);
    todayByEmp[r.stylist].count += 1;
    if (r.service) todayByEmp[r.stylist].services[r.service]=(todayByEmp[r.stylist].services[r.service]||0)+1;
  });
  const todayByMethod={};
  todayEntries.forEach(r=>{ todayByMethod[r.method]=(todayByMethod[r.method]||0)+Number(r.amount||0); });

  const todayExpenses = expenses.filter(r=>r.date===todayD);
  const todayExpTotal = todayExpenses.reduce((s,r)=>s+Number(r.amount||0),0);
  const todayProfit   = todayTotal - todayExpTotal;

  const submitExpense = () => {
    if (!expForm.amount||!expForm.date) return;
    setAdmin(a=>({...a, expenses:[...(a.expenses||[]),{
      id:genId(),...expForm,amount:Number(expForm.amount),createdAt:Date.now(),
    }]}));
    setExpForm({date:todayStr(),amount:"",category:"Insumos",method:"Efectivo",note:""});
    setShowForm(false);
  };

  const deleteExpense = (id) => {
    if (!confirm("¿Eliminar este gasto? Quedará oculto pero no se borrará del historial.")) return;
    setAdmin(a=>({...a, expenses:(a.expenses||[]).map(r=>
      r.id===id ? {...r, deleted:true, deletedAt:Date.now()} : r
    )}));
  };

  const submitEntry = () => {
    if (!form.amount||!form.date) return;
    setAdmin(a=>({...a, revenue:[...a.revenue,{
      id:genId(),...form,amount:Number(form.amount),createdAt:Date.now(),
    }]}));
    setForm({date:todayStr(),amount:"",service:"",client:"",method:"Efectivo",note:"",stylist:""});
    setShowForm(false);
  };

  const deleteEntry = (id) => {
    if (!confirm("¿Eliminar este ingreso? Quedará oculto pero no se borrará del historial.")) return;
    setAdmin(a=>({...a, revenue:(a.revenue||[]).map(r=>
      r.id===id ? {...r, deleted:true, deletedAt:Date.now()} : r
    )}));
  };

  const PERIODS = [
    {id:"today",label:"Hoy"},
    {id:"week",label:"Esta semana"},
    {id:"month",label:"Este mes"},
    {id:"all",label:"Todos"},
  ];

  return (
    <div>
      <PageHeader title="Caja" subtitle="Ingresos · Gastos · Utilidad"
        action={
          <div style={{display:"flex",gap:8}}>
            <Btn variant="ghost" onClick={()=>setShowDaySummary(s=>!s)}>
              {showDaySummary?"Ocultar cierre":"Cierre del día"}
            </Btn>
            <Btn onClick={()=>setShowForm(!showForm)}>
              {showForm ? "Cancelar" : (tab==="gastos" ? "+ Registrar gasto" : "+ Registrar ingreso")}
            </Btn>
          </div>
        }
      />

      {/* Ingresos / Gastos tabs */}
      <div style={{display:"flex",gap:0,padding:"0 32px",borderBottom:`1px solid ${C.bdr}`,background:C.s1}}>
        {[{id:"ingresos",label:"Ingresos"},{id:"gastos",label:"Gastos"}].map(t=>(
          <button key={t.id} onClick={()=>{setTab(t.id);setShowForm(false);}} style={{
            padding:"14px 22px",background:"transparent",border:"none",
            borderBottom:`2px solid ${tab===t.id?C.gold:"transparent"}`,
            color:tab===t.id?C.text:C.muted,cursor:"pointer",
            fontFamily:"'Outfit',sans-serif",fontSize:13,letterSpacing:"0.04em",
          }}>{t.label}</button>
        ))}
      </div>

      {showForm && tab==="gastos" && (
        <div style={{padding:"20px 32px",borderBottom:`1px solid ${C.bdr}`,background:C.s1}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14,maxWidth:1000}}>
            <FieldInput label="Fecha" type="date" value={expForm.date}
              onChange={e=>setExpForm({...expForm,date:e.target.value})} />
            <FieldInput label="Monto (COP)" type="number" value={expForm.amount}
              onChange={e=>setExpForm({...expForm,amount:e.target.value})} placeholder="50000" />
            <FieldSelect label="Categoría" value={expForm.category}
              onChange={e=>setExpForm({...expForm,category:e.target.value})} options={EXPENSE_CATEGORIES} />
            <FieldSelect label="Método" value={expForm.method}
              onChange={e=>setExpForm({...expForm,method:e.target.value})} options={METHODS} />
            <FieldInput label="Nota" value={expForm.note}
              onChange={e=>setExpForm({...expForm,note:e.target.value})} placeholder="Proveedor, detalle…" />
          </div>
          <div style={{display:"flex",gap:10,marginTop:16}}>
            <Btn onClick={submitExpense} disabled={!expForm.amount}>Guardar gasto</Btn>
            <Btn variant="ghost" onClick={()=>setShowForm(false)}>Cancelar</Btn>
          </div>
        </div>
      )}

      {showForm && tab==="ingresos" && (
        <div style={{padding:"20px 32px",borderBottom:`1px solid ${C.bdr}`,background:C.s1}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14,maxWidth:1000}}>
            <FieldInput label="Fecha" type="date" value={form.date}
              onChange={e=>setForm({...form,date:e.target.value})} />
            <FieldInput label="Monto (COP)" type="number" value={form.amount}
              onChange={e=>setForm({...form,amount:e.target.value})} placeholder="45000" />
            <FieldSelect label="Empleado" value={form.stylist}
              onChange={e=>setForm({...form,stylist:e.target.value})}
              options={[{value:"",label:"Sin asignar"},...employees.map(e=>({value:e.name,label:`${e.name} · ${e.role}`}))]} />
            <FieldSelect label="Servicio" value={form.service}
              onChange={e=>setForm({...form,service:e.target.value})}
              options={[{value:"",label:"Otro/Manual"},...(admin.services||[]).filter(s=>s.active).map(s=>({value:s.name,label:s.name}))]} />
            <FieldInput label="Cliente" value={form.client}
              onChange={e=>setForm({...form,client:e.target.value})} placeholder="Nombre" />
            <FieldSelect label="Método" value={form.method}
              onChange={e=>setForm({...form,method:e.target.value})} options={METHODS} />
            <FieldInput label="Nota" value={form.note}
              onChange={e=>setForm({...form,note:e.target.value})} placeholder="Opcional" />
          </div>
          <div style={{display:"flex",gap:10,marginTop:16}}>
            <Btn onClick={submitEntry} disabled={!form.amount}>Guardar ingreso</Btn>
            <Btn variant="ghost" onClick={()=>setShowForm(false)}>Cancelar</Btn>
          </div>
        </div>
      )}

      {/* ---- Cierre del día ---- */}
      {showDaySummary && (
        <div style={{padding:"24px 32px",borderBottom:`1px solid ${C.bdr}`,background:C.s1}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
            <div>
              <Mono style={{color:C.gold,fontSize:11}}>Cierre del día</Mono>
              <div style={{fontSize:11,color:C.muted,marginTop:4}}>{fmtDateMed(todayD)}</div>
            </div>
            <div style={{display:"flex",gap:24,alignItems:"flex-end",flexWrap:"wrap"}}>
              <div style={{textAlign:"right"}}>
                <Mono style={{fontSize:8,color:C.muted}}>Ingresos</Mono>
                <div style={{fontFamily:"'Marcellus',serif",fontSize:24,color:C.green}}>{fmtCOP(todayTotal)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <Mono style={{fontSize:8,color:C.muted}}>Gastos</Mono>
                <div style={{fontFamily:"'Marcellus',serif",fontSize:24,color:C.red}}>{fmtCOP(todayExpTotal)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <Mono style={{fontSize:8,color:C.muted}}>Utilidad</Mono>
                <div style={{fontFamily:"'Marcellus',serif",fontSize:32,color:todayProfit>=0?C.gold:C.red}}>{fmtCOP(todayProfit)}</div>
              </div>
            </div>
          </div>

          {todayEntries.length===0 ? (
            <div style={{textAlign:"center",padding:"24px",color:C.muted}}>
              <Mono style={{fontSize:10}}>Sin ingresos registrados hoy</Mono>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {/* Per-employee cards */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
                {Object.entries(todayByEmp).map(([name,data])=>(
                  <div key={name} style={{
                    background:C.s2,border:`1px solid ${C.bdr}`,padding:"16px 18px",
                  }}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                      <div>
                        <div style={{fontSize:14,fontFamily:"'Marcellus',serif"}}>{name}</div>
                        <Mono style={{fontSize:9,color:C.muted}}>{data.count} servicio{data.count!==1?"s":""}</Mono>
                      </div>
                      <div style={{fontFamily:"'Marcellus',serif",fontSize:22,color:C.green}}>{fmtCOP(data.total)}</div>
                    </div>
                    {Object.entries(data.services).map(([svc,cnt])=>(
                      <div key={svc} style={{
                        display:"flex",justifyContent:"space-between",
                        padding:"4px 0",borderTop:`1px solid ${C.bdr}`,
                        fontSize:12,
                      }}>
                        <span style={{color:C.muted}}>{svc}</span>
                        <Mono style={{fontSize:10,color:C.text}}>×{cnt}</Mono>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Totals by method */}
              <div style={{
                display:"flex",gap:16,flexWrap:"wrap",padding:"14px 18px",
                background:C.s2,border:`1px solid ${C.bdr}`,
              }}>
                <Mono style={{color:C.muted,fontSize:9,alignSelf:"center",marginRight:8}}>
                  Por método:
                </Mono>
                {Object.entries(todayByMethod).map(([m,v])=>(
                  <div key={m} style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{
                      padding:"2px 8px",fontSize:10,fontFamily:"'JetBrains Mono',monospace",
                      letterSpacing:"0.1em",textTransform:"uppercase",
                      background:`${PAY_COLORS[m]||C.gold}15`,
                      color:PAY_COLORS[m]||C.gold,
                      border:`1px solid ${PAY_COLORS[m]||C.gold}30`,
                    }}>{m}</span>
                    <span style={{fontSize:13,color:C.text}}>{fmtCOP(v)}</span>
                  </div>
                ))}
                <div style={{marginLeft:"auto",fontSize:13,color:C.green}}>
                  Total: <strong>{fmtCOP(todayTotal)}</strong>
                </div>
              </div>

              {/* Summary text for copy */}
              <div style={{padding:"14px 18px",background:C.bg,border:`1px solid ${C.bdr}`}}>
                <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:8}}>Resumen texto · copiar</Mono>
                <pre style={{
                  fontFamily:"'JetBrains Mono',monospace",fontSize:11,
                  color:C.text,lineHeight:1.7,whiteSpace:"pre-wrap",margin:0,
                }}>
{`CIERRE DEL DÍA · ${fmtDateMed(todayD).toUpperCase()}
${"─".repeat(36)}
${Object.entries(todayByEmp).map(([n,d])=>
  `${n.padEnd(18)} ${String(d.count+" svc").padEnd(8)} ${fmtCOP(d.total)}`
).join("\n")}
${"─".repeat(36)}
TOTAL                       ${fmtCOP(todayTotal)}
${Object.entries(todayByMethod).map(([m,v])=>`  ${m.padEnd(16)} ${fmtCOP(v)}`).join("\n")}`}
                </pre>
                <button
                  onClick={()=>{
                    const txt=`CIERRE DEL DÍA · ${fmtDateMed(todayD).toUpperCase()}\n${"─".repeat(36)}\n${Object.entries(todayByEmp).map(([n,d])=>`${n.padEnd(18)} ${String(d.count+" svc").padEnd(8)} ${fmtCOP(d.total)}`).join("\n")}\n${"─".repeat(36)}\nTOTAL                       ${fmtCOP(todayTotal)}\n${Object.entries(todayByMethod).map(([m,v])=>`  ${m.padEnd(16)} ${fmtCOP(v)}`).join("\n")}`;
                    navigator.clipboard?.writeText(txt);
                  }}
                  style={{
                    marginTop:10,padding:"6px 14px",background:C.s3,
                    border:`1px solid ${C.bdr}`,color:C.muted,cursor:"pointer",
                    fontFamily:"'JetBrains Mono',monospace",fontSize:9,letterSpacing:"0.1em",
                    textTransform:"uppercase",
                  }}
                >Copiar resumen</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{padding:"24px 32px"}}>
        {/* Period filter */}
        <div style={{display:"flex",gap:4,marginBottom:24}}>
          {PERIODS.map(p=>(
            <button key={p.id} onClick={()=>setPeriod(p.id)} style={{
              padding:"8px 18px",background:period===p.id?C.gold:"transparent",
              color:period===p.id?"#0C0C0C":C.muted,
              border:`1px solid ${period===p.id?C.gold:C.bdr}`,
              cursor:"pointer",fontFamily:"'Outfit',sans-serif",
              fontSize:12,letterSpacing:"0.08em",
            }}>{p.label}</button>
          ))}
        </div>

        {/* Stats — profitability summary (shared) */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:16,marginBottom:20}}>
          <StatCard label="Ingresos" value={fmtCOP(total)} small
            color={total>0?C.green:C.muted} sub={`${filtered.length} transacción${filtered.length!==1?"es":""}`} />
          <StatCard label="Gastos" value={fmtCOP(expTotal)} small
            color={expTotal>0?C.red:C.muted} sub={`${filteredExp.length} registro${filteredExp.length!==1?"s":""}`} />
          <StatCard label="Utilidad" value={fmtCOP(profit)} small
            color={profit>=0?C.gold:C.red} />
        </div>

        {/* Tab-specific breakdown by method/category */}
        {tab==="ingresos" && Object.keys(byMethod).length>0 && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:16,marginBottom:28}}>
            {Object.entries(byMethod).map(([m,v])=>(
              <StatCard key={m} label={m} value={fmtCOP(v)} small color={PAY_COLORS[m]||C.muted} />
            ))}
          </div>
        )}
        {tab==="gastos" && Object.keys(byCategory).length>0 && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:16,marginBottom:28}}>
            {Object.entries(byCategory).sort((a,b)=>b[1]-a[1]).map(([c,v])=>(
              <StatCard key={c} label={c} value={fmtCOP(v)} small color={C.red} />
            ))}
          </div>
        )}

        {/* Employee breakdown */}
        {tab==="ingresos" && Object.keys(byEmployee).length>0 && (
          <Card style={{marginBottom:24}}>
            <Mono style={{color:C.gold,display:"block",marginBottom:16}}>Por empleado</Mono>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {Object.entries(byEmployee).sort((a,b)=>b[1].total-a[1].total).map(([name,data])=>(
                <div key={name} style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13}}>{name}</div>
                    <Mono style={{fontSize:9,color:C.muted}}>{data.count} svc</Mono>
                  </div>
                  <div style={{
                    height:6,flex:2,background:C.s3,position:"relative",overflow:"hidden",
                  }}>
                    <div style={{
                      position:"absolute",left:0,top:0,bottom:0,
                      background:C.blue,opacity:0.6,
                      width:`${Math.round((data.total/total)*100)}%`,
                    }}/>
                  </div>
                  <div style={{fontSize:13,color:C.blue,minWidth:90,textAlign:"right"}}>
                    {fmtCOP(data.total)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Service breakdown */}
        {tab==="ingresos" && Object.keys(byService).length>0 && (
          <Card style={{marginBottom:24}}>
            <Mono style={{color:C.gold,display:"block",marginBottom:16}}>Por servicio</Mono>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {Object.entries(byService).sort((a,b)=>b[1]-a[1]).map(([s,v])=>(
                <div key={s} style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{flex:1,fontSize:13}}>{s}</div>
                  <div style={{
                    height:6,flex:2,background:C.s3,position:"relative",
                    overflow:"hidden",
                  }}>
                    <div style={{
                      position:"absolute",left:0,top:0,bottom:0,
                      background:C.gold,opacity:0.6,
                      width:`${Math.round((v/total)*100)}%`,
                    }}/>
                  </div>
                  <div style={{fontSize:13,color:C.gold,minWidth:90,textAlign:"right"}}>
                    {fmtCOP(v)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Entries list */}
        {tab==="ingresos" && (filtered.length===0 ? (
          <div style={{textAlign:"center",padding:"48px",color:C.muted}}>
            <div style={{fontSize:32,marginBottom:8}}>—</div>
            <Mono style={{fontSize:10}}>Sin ingresos en este periodo</Mono>
          </div>
        ) : (
          <div>
            <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:12}}>
              {filtered.length} registro{filtered.length!==1?"s":""}
            </Mono>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {filtered.map(r=>(
                <div key={r.id} style={{
                  display:"grid",
                  gridTemplateColumns:"80px 100px 1fr 120px 140px 80px 40px",
                  gap:12,padding:"12px 16px",background:C.s1,
                  border:`1px solid ${C.bdr}`,alignItems:"center",
                }}>
                  <Mono style={{fontSize:10,color:C.muted}}>{fmtDateShort(r.date)}</Mono>
                  <div style={{
                    fontFamily:"'JetBrains Mono',monospace",fontSize:16,
                    color:C.green,fontVariantNumeric:"tabular-nums",
                  }}>{fmtCOP(r.amount)}</div>
                  <div>
                    <div style={{fontSize:13}}>{r.service||"—"}</div>
                    {r.client&&<div style={{fontSize:11,color:C.muted}}>{r.client}</div>}
                    {r.note&&<div style={{fontSize:10,color:C.muted,fontStyle:"italic"}}>{r.note}</div>}
                  </div>
                  <Mono style={{fontSize:10,color:r.stylist?C.blue:C.muted}}>
                    {r.stylist||"—"}
                  </Mono>
                  <span style={{
                    padding:"3px 10px",fontSize:10,
                    fontFamily:"'JetBrains Mono',monospace",
                    letterSpacing:"0.1em",textTransform:"uppercase",
                    background:`${PAY_COLORS[r.method]||C.gold}15`,
                    color:PAY_COLORS[r.method]||C.gold,
                    border:`1px solid ${PAY_COLORS[r.method]||C.gold}30`,
                    justifySelf:"start",
                  }}>{r.method}</span>
                  <Mono style={{color:C.muted,fontSize:9}}>
                    {r.createdAt?fmtDateTime(r.createdAt):""}
                  </Mono>
                  <button onClick={()=>deleteEntry(r.id)} style={{
                    background:"transparent",border:"none",
                    color:C.muted,cursor:"pointer",fontSize:14,
                    opacity:0.5,
                  }} title="Eliminar">✕</button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Expenses list */}
        {tab==="gastos" && (filteredExp.length===0 ? (
          <div style={{textAlign:"center",padding:"48px",color:C.muted}}>
            <div style={{fontSize:32,marginBottom:8}}>—</div>
            <Mono style={{fontSize:10}}>Sin gastos en este periodo</Mono>
          </div>
        ) : (
          <div>
            <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:12}}>
              {filteredExp.length} registro{filteredExp.length!==1?"s":""}
            </Mono>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {filteredExp.map(r=>(
                <div key={r.id} style={{
                  display:"grid",
                  gridTemplateColumns:"80px 100px 1fr 120px 140px 80px 40px",
                  gap:12,padding:"12px 16px",background:C.s1,
                  border:`1px solid ${C.bdr}`,alignItems:"center",
                }}>
                  <Mono style={{fontSize:10,color:C.muted}}>{fmtDateShort(r.date)}</Mono>
                  <div style={{
                    fontFamily:"'JetBrains Mono',monospace",fontSize:16,
                    color:C.red,fontVariantNumeric:"tabular-nums",
                  }}>{fmtCOP(r.amount)}</div>
                  <div>
                    <div style={{fontSize:13}}>{r.category||"Otros"}</div>
                    {r.note&&<div style={{fontSize:10,color:C.muted,fontStyle:"italic"}}>{r.note}</div>}
                  </div>
                  <span style={{
                    padding:"3px 10px",fontSize:10,
                    fontFamily:"'JetBrains Mono',monospace",
                    letterSpacing:"0.1em",textTransform:"uppercase",
                    background:`${C.red}15`,color:C.red,border:`1px solid ${C.red}30`,
                    justifySelf:"start",
                  }}>{r.category||"Otros"}</span>
                  <span style={{
                    padding:"3px 10px",fontSize:10,
                    fontFamily:"'JetBrains Mono',monospace",
                    letterSpacing:"0.1em",textTransform:"uppercase",
                    background:`${PAY_COLORS[r.method]||C.gold}15`,
                    color:PAY_COLORS[r.method]||C.gold,
                    border:`1px solid ${PAY_COLORS[r.method]||C.gold}30`,
                    justifySelf:"start",
                  }}>{r.method}</span>
                  <Mono style={{color:C.muted,fontSize:9}}>
                    {r.createdAt?fmtDateTime(r.createdAt):""}
                  </Mono>
                  <button onClick={()=>deleteExpense(r.id)} style={{
                    background:"transparent",border:"none",
                    color:C.muted,cursor:"pointer",fontSize:14,
                    opacity:0.5,
                  }} title="Eliminar">✕</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== COMISIONES ====================
// Comisión por entry: si el servicio tiene "commissionFixed" se paga ese monto fijo;
// de lo contrario es amount * (commissionPct del empleado) / 100.
const COMM_PERIODS = [
  {id:"week",label:"Esta semana"},
  {id:"month",label:"Este mes"},
  {id:"all",label:"Todo"},
];

const CommissionsView = () => {
  const [admin,setAdmin] = useAdmin();
  const [period,setPeriod] = React.useState("month");
  const [payModal,setPayModal] = React.useState(null); // { empId, empName, base, commission }
  const [payMethod,setPayMethod] = React.useState("Efectivo");

  const revenue   = (admin.revenue||[]).filter(r=>!r.deleted);
  const employees = (admin.employees||[]).filter(e=>e.active);
  const payouts   = admin.payouts||[];

  const todayD = todayStr();
  const now = nowCOT();
  const weekStart = (()=>{ const d=new Date(now); d.setDate(now.getDate()-(now.getDay()===0?6:now.getDay()-1)); return ymd(d); })();
  const monthStart = todayD.slice(0,7)+"-01";
  const periodStart = period==="week"?weekStart:period==="month"?monthStart:"";

  const inPeriod = (d)=> period==="all" ? true : (d||"")>=periodStart;
  const filtered = revenue.filter(r=>inPeriod(r.date));

  // Monto fijo de comisión por nombre de servicio (los ingresos guardan el nombre).
  const fixedBySvc = {};
  (admin.services||[]).forEach(s=>{ if (s.commissionFixed) fixedBySvc[s.name]=Number(s.commissionFixed); });

  const commissionFor = (entry, pct) => {
    if (entry.service && fixedBySvc[entry.service] != null) return fixedBySvc[entry.service];
    return Math.round(Number(entry.amount||0) * (pct||0) / 100);
  };

  const rows = employees.map(e=>{
    const pct = Number(e.commissionPct||0);
    const ents = filtered.filter(r=>r.stylist===e.name);
    const base = ents.reduce((s,r)=>s+Number(r.amount||0),0);
    const commission = ents.reduce((s,r)=>s+commissionFor(r,pct),0);
    return { emp:e, pct, count:ents.length, base, commission };
  }).filter(r=>r.count>0 || r.pct>0);

  const totalCommission = rows.reduce((s,r)=>s+r.commission,0);
  const totalBase       = rows.reduce((s,r)=>s+r.base,0);

  const confirmPayout = () => {
    if (!payModal) return;
    const periodEnd = todayD;
    const pStart = periodStart || (filtered.reduce((min,r)=>(!min||r.date<min)?r.date:min, "") || todayD);
    const payout = {
      id:genId(), empId:payModal.empId, empName:payModal.empName,
      periodStart:pStart, periodEnd, base:payModal.base, commission:payModal.commission,
      method:payMethod, note:`Comisión ${COMM_PERIODS.find(p=>p.id===period)?.label||""}`.trim(),
      paidAt:Date.now(),
    };
    // Registra también un gasto para que impacte la utilidad en Caja.
    const expense = {
      id:genId(), date:periodEnd, amount:payModal.commission, category:"Comisiones",
      method:payMethod, note:`Pago comisión · ${payModal.empName}`, createdAt:Date.now(),
    };
    setAdmin(a=>({
      ...a,
      payouts:[...(a.payouts||[]), payout],
      expenses:[...(a.expenses||[]), expense],
    }));
    setPayModal(null);
    setPayMethod("Efectivo");
  };

  return (
    <div>
      <PageHeader title="Comisiones" subtitle="Liquidación por empleado" />

      <div style={{padding:"24px 32px"}}>
        <div style={{display:"flex",gap:4,marginBottom:24}}>
          {COMM_PERIODS.map(p=>(
            <button key={p.id} onClick={()=>setPeriod(p.id)} style={{
              padding:"8px 18px",background:period===p.id?C.gold:"transparent",
              color:period===p.id?"#0C0C0C":C.muted,
              border:`1px solid ${period===p.id?C.gold:C.bdr}`,cursor:"pointer",
              fontFamily:"'Outfit',sans-serif",fontSize:12,letterSpacing:"0.08em",
            }}>{p.label}</button>
          ))}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:16,marginBottom:28}}>
          <StatCard label="Facturado (base)" value={fmtCOP(totalBase)} small color={C.green} />
          <StatCard label="Comisiones a pagar" value={fmtCOP(totalCommission)} small color={C.gold} />
        </div>

        {rows.length===0 ? (
          <div style={{textAlign:"center",padding:"48px",color:C.muted}}>
            <Mono style={{fontSize:10}}>Sin datos. Configura el % de comisión en Empleados y registra ingresos.</Mono>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {rows.sort((a,b)=>b.commission-a.commission).map(r=>(
              <div key={r.emp.id} style={{
                display:"grid",gridTemplateColumns:"1fr 90px 120px 120px 130px",gap:12,
                padding:"14px 16px",background:C.s1,border:`1px solid ${C.bdr}`,alignItems:"center",
              }}>
                <div>
                  <div style={{fontSize:14}}>{r.emp.name}</div>
                  <Mono style={{fontSize:9,color:C.muted}}>{r.emp.role} · {r.count} svc</Mono>
                </div>
                <Mono style={{fontSize:11,color:C.muted}}>{r.pct}%</Mono>
                <div style={{fontSize:13,color:C.green,textAlign:"right"}}>{fmtCOP(r.base)}</div>
                <div style={{fontSize:15,color:C.gold,textAlign:"right",fontFamily:"'JetBrains Mono',monospace"}}>{fmtCOP(r.commission)}</div>
                <div style={{textAlign:"right"}}>
                  <Btn small disabled={r.commission<=0}
                    onClick={()=>{setPayModal({empId:r.emp.id,empName:r.emp.name,base:r.base,commission:r.commission});setPayMethod("Efectivo");}}>
                    Registrar pago
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Historial de pagos */}
        {payouts.length>0 && (
          <Card style={{marginTop:28}}>
            <Mono style={{color:C.gold,display:"block",marginBottom:16}}>Pagos registrados</Mono>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {[...payouts].sort((a,b)=>(b.paidAt||0)-(a.paidAt||0)).slice(0,30).map(p=>(
                <div key={p.id} style={{
                  display:"grid",gridTemplateColumns:"1fr 140px 120px 110px",gap:12,
                  padding:"10px 14px",background:C.s2,border:`1px solid ${C.bdr}`,alignItems:"center",
                }}>
                  <div style={{fontSize:13}}>{p.empName}</div>
                  <Mono style={{fontSize:9,color:C.muted}}>{fmtDateShort(p.periodStart)} – {fmtDateShort(p.periodEnd)}</Mono>
                  <div style={{fontSize:13,color:C.gold,textAlign:"right"}}>{fmtCOP(p.commission)}</div>
                  <Mono style={{fontSize:9,color:C.muted,textAlign:"right"}}>{p.method}</Mono>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Modal de confirmación de pago */}
      {payModal && (
        <div onClick={()=>setPayModal(null)} style={{
          position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.7)",
          display:"flex",alignItems:"center",justifyContent:"center",padding:20,
        }}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:C.s1,border:`1px solid ${C.bdr2}`,padding:28,width:"100%",maxWidth:420,
          }}>
            <Mono style={{color:C.gold,fontSize:10,display:"block",marginBottom:8}}>Registrar pago de comisión</Mono>
            <div style={{fontFamily:"'Marcellus',serif",fontSize:22,marginBottom:4}}>{payModal.empName}</div>
            <div style={{fontSize:13,color:C.muted,marginBottom:18}}>
              Base {fmtCOP(payModal.base)} · Comisión <span style={{color:C.gold}}>{fmtCOP(payModal.commission)}</span>
            </div>
            <FieldSelect label="Método de pago" value={payMethod}
              onChange={e=>setPayMethod(e.target.value)} options={METHODS} />
            <div style={{fontSize:11,color:C.muted,margin:"14px 0 18px"}}>
              Se registrará como gasto (categoría "Comisiones") y afectará la utilidad en Caja.
            </div>
            <div style={{display:"flex",gap:10}}>
              <Btn onClick={confirmPayout}>Confirmar pago</Btn>
              <Btn variant="ghost" onClick={()=>setPayModal(null)}>Cancelar</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== ARCHIVED EMPLOYEES ====================
const ArchivedEmployeesSection = ({ archived, revenue }) => {
  const [open, setOpen] = React.useState(false);
  if (!archived.length) return null;

  const activeRevenue = revenue.filter(r=>!r.deleted);

  return (
    <div style={{marginTop:32,borderTop:`1px solid ${C.bdr}`,paddingTop:24}}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        display:"flex",alignItems:"center",gap:10,background:"none",border:"none",
        cursor:"pointer",padding:0,marginBottom: open?20:0,
      }}>
        <Mono style={{color:C.muted,fontSize:9}}>
          {open?"▾":"▸"} HISTORIAL DE BAJAS · {archived.length} empleado{archived.length!==1?"s":""}
        </Mono>
      </button>

      {open && (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {[...archived].sort((a,b)=>b.archivedAt-a.archivedAt).map(emp=>{
            const empRevenue = activeRevenue.filter(r=>r.stylist===emp.name);
            const total      = empRevenue.reduce((s,r)=>s+Number(r.amount||0),0);
            const byMethod   = {};
            empRevenue.forEach(r=>{ byMethod[r.method]=(byMethod[r.method]||0)+Number(r.amount||0); });
            const archivedDate = new Date(emp.archivedAt).toLocaleDateString("es-CO",{day:"numeric",month:"short",year:"numeric"});
            return (
              <div key={emp.id} style={{
                padding:"18px 20px",background:C.s1,
                border:`1px solid ${C.bdr}`,opacity:0.75,
              }}>
                <div style={{
                  display:"grid",gridTemplateColumns:"1fr auto auto",
                  gap:16,alignItems:"center",marginBottom: total>0?12:0,
                }}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{fontFamily:"'Marcellus',serif",fontSize:16,color:C.muted}}>{emp.name}</div>
                      <Mono style={{fontSize:8,padding:"2px 8px",background:"rgba(245,241,234,0.04)",
                        border:`1px solid ${C.bdr}`,color:C.muted}}>Baja</Mono>
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap",alignItems:"center"}}>
                      <Mono style={{fontSize:9,color:C.muted}}>{emp.role}</Mono>
                      <span style={{color:C.bdr}}>·</span>
                      <Mono style={{fontSize:9,color:C.muted}}>Archivado el {archivedDate}</Mono>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:14,color:total>0?C.green:C.muted,fontFamily:"'Marcellus',serif"}}>
                      {total>0?fmtCOP(total):"Sin ingresos"}
                    </div>
                    <Mono style={{fontSize:8,color:C.muted}}>{empRevenue.length} transacción{empRevenue.length!==1?"es":""} · total facturado</Mono>
                  </div>
                  <div style={{textAlign:"right",minWidth:80}}>
                    <Mono style={{fontSize:9,color:C.muted}}>{empRevenue.length} svc</Mono>
                  </div>
                </div>

                {total>0 && Object.keys(byMethod).length>0 && (
                  <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:8}}>
                    {Object.entries(byMethod).map(([m,v])=>(
                      <span key={m} style={{
                        padding:"2px 10px",fontSize:10,
                        fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.08em",
                        background:`${PAY_COLORS[m]||C.gold}10`,
                        color:PAY_COLORS[m]||C.gold,
                        border:`1px solid ${PAY_COLORS[m]||C.gold}25`,
                      }}>{m} · {fmtCOP(v)}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ==================== EMPLOYEES ====================
const HOUR_OPTIONS = Array.from({ length: 17 }, (_, i) => {
  const h = i + 6;
  const value = `${String(h).padStart(2, "0")}:00`;
  return { value, label: formatTime12h(value) };
});

const HourSelect = ({ value, onChange }) => (
  <select value={value} onChange={onChange} style={{
    background: C.s2, border: `1px solid ${C.bdr}`, color: C.text,
    padding: "5px 10px", fontFamily: "'JetBrains Mono',monospace", fontSize: 12,
  }}>
    {HOUR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

const WorkHoursEditor = ({ value, onChange }) => {
  const hours = { ...DEFAULT_WORK_HOURS(), ...value };
  const setDay = (key, patch) => onChange({ ...hours, [key]: { ...hours[key], ...patch } });

  return (
    <div>
      <Mono style={{ color: C.muted, fontSize: 9, display: "block", marginBottom: 10 }}>Horario laboral</Mono>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {DAYS_WORK.map(({ key, label }) => {
          const day = hours[key] || { active: false, start: "09:00", end: "18:00" };
          return (
            <div key={key} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px", background: day.active ? "rgba(194,158,102,0.06)" : C.s3,
              border: `1px solid ${day.active ? C.gold + "40" : C.bdr}`,
            }}>
              <button onClick={() => setDay(key, { active: !day.active })} style={{
                width: 36, padding: "4px 0", fontSize: 10,
                fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em",
                background: day.active ? "rgba(194,158,102,0.2)" : "transparent",
                border: `1px solid ${day.active ? C.gold + "60" : C.bdr}`,
                color: day.active ? C.gold : C.muted, cursor: "pointer",
              }}>{label}</button>
              {day.active ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                  <HourSelect value={day.start} onChange={e => setDay(key, { start: e.target.value })} />
                  <Mono style={{ color: C.muted, fontSize: 9 }}>—</Mono>
                  <HourSelect value={day.end} onChange={e => setDay(key, { end: e.target.value })} />
                </div>
              ) : (
                <Mono style={{ color: C.muted2, fontSize: 9 }}>Día libre</Mono>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const WorkHoursSummary = ({ workHours }) => {
  const hours = { ...DEFAULT_WORK_HOURS(), ...workHours };
  const activeDays = DAYS_WORK.filter(d => hours[d.key]?.active);
  if (!activeDays.length) return <Mono style={{ fontSize: 9, color: C.muted }}>Sin horario</Mono>;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {activeDays.map(({ key, label }) => {
        const d = hours[key];
        return (
          <span key={key} style={{
            padding: "2px 8px", fontSize: 9,
            fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em",
            background: "rgba(194,158,102,0.08)", color: C.gold,
            border: `1px solid ${C.gold}25`,
          }} title={`${formatTime12h(d.start)} – ${formatTime12h(d.end)}`}>{label}</span>
        );
      })}
    </div>
  );
};

const EmployeesView = () => {
  const [admin,setAdmin] = useAdmin();
  const [showAdd,setShowAdd] = React.useState(false);
  const [editId,setEditId] = React.useState(null);
  const [editForm,setEditForm] = React.useState({});
  const [newEmp,setNewEmp] = React.useState({name:"",role:"Estilista",services:[],pin:"",commissionPct:"",workHours:DEFAULT_WORK_HOURS()});
  const [chairQROpen,setChairQROpen] = React.useState(null);

  const employees = admin.employees || [];
  const services  = (admin.services||[]).filter(s=>s.active);
  const revenue   = admin.revenue||[];

  // Revenue per employee (all time, excluding soft-deleted)
  const revByEmp = {};
  revenue.filter(r=>!r.deleted).forEach(r=>{
    if (r.stylist) revByEmp[r.stylist]=(revByEmp[r.stylist]||0)+Number(r.amount||0);
  });

  const toggleNewSvc = (svcId) => {
    setNewEmp(e=>({...e, services: e.services.includes(svcId)
      ? e.services.filter(s=>s!==svcId)
      : [...e.services, svcId]
    }));
  };

  const toggleEditSvc = (svcId) => {
    setEditForm(f=>({...f, services: (f.services||[]).includes(svcId)
      ? f.services.filter(s=>s!==svcId)
      : [...(f.services||[]), svcId]
    }));
  };

  const addEmployee = () => {
    if (!newEmp.name.trim()) return;
    const emp = { id:genId(), name:newEmp.name.trim(), role:newEmp.role, services:newEmp.services,
      pin:newEmp.pin||"", commissionPct:Number(newEmp.commissionPct)||0,
      ntfyTopic:newEmp.ntfyTopic?.trim()||"",
      workHours:newEmp.workHours||DEFAULT_WORK_HOURS(), active:true };
    // Also sync to stylists list for booking portal
    const stylists = [...(admin.stylists||[])];
    if (!stylists.includes(emp.name)) stylists.push(emp.name);
    setAdmin(a=>({...a, employees:[...(a.employees||[]),emp], stylists}));
    setNewEmp({name:"",role:"Estilista",services:[],pin:"",commissionPct:"",ntfyTopic:"",workHours:DEFAULT_WORK_HOURS()});
    setShowAdd(false);
  };

  const startEdit = (e) => {
    setEditId(e.id);
    setEditForm({name:e.name,role:e.role,services:[...(e.services||[])],pin:e.pin||"",commissionPct:e.commissionPct||"",ntfyTopic:e.ntfyTopic||"",workHours:{...DEFAULT_WORK_HOURS(),...(e.workHours||{})}});
  };

  const saveEdit = (id) => {
    const prev = employees.find(e=>e.id===id);
    const nameChanged = prev && prev.name !== editForm.name;
    let stylists = [...(admin.stylists||[])];
    if (nameChanged) {
      stylists = stylists.map(s=>s===prev.name?editForm.name:s);
    }
    setAdmin(a=>({...a,
      employees: a.employees.map(e=>e.id===id?{...e,...editForm,commissionPct:Number(editForm.commissionPct)||0}:e),
      stylists,
    }));
    setEditId(null);
  };

  const toggleActive = (id) => {
    setAdmin(a=>({...a, employees:a.employees.map(e=>e.id===id?{...e,active:!e.active}:e)}));
  };

  const deleteEmployee = (emp) => {
    if (!confirm(`¿Archivar a ${emp.name}? Se quitará del equipo activo pero su historial de citas y finanzas quedará preservado.`)) return;
    const stylists = (admin.stylists||[]).filter(s=>s!==emp.name);
    const archive  = { ...emp, archivedAt: Date.now() };
    setAdmin(a=>({...a,
      employees: a.employees.filter(e=>e.id!==emp.id),
      stylists,
      archivedEmployees: [...(a.archivedEmployees||[]), archive],
    }));
  };

  return (
    <div>
      <PageHeader title="Empleados" subtitle="Equipo · Roles · Servicios"
        action={<Btn onClick={()=>setShowAdd(!showAdd)}>
          {showAdd?"Cancelar":"+ Agregar empleado"}
        </Btn>}
      />

      {showAdd && (
        <div style={{padding:"20px 32px",borderBottom:`1px solid ${C.bdr}`,background:C.s1}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,maxWidth:720,marginBottom:16}}>
            <FieldInput label="Nombre" value={newEmp.name}
              onChange={e=>setNewEmp({...newEmp,name:e.target.value})} placeholder="Laura M." />
            <FieldSelect label="Rol" value={newEmp.role}
              onChange={e=>setNewEmp({...newEmp,role:e.target.value})}
              options={ROLES} />
            <div>
              <FieldInput label="PIN (4–6 dígitos)" type="password"
                value={newEmp.pin}
                placeholder="••••"
                onChange={e=>setNewEmp({...newEmp,pin:e.target.value.replace(/\D/g,"").slice(0,6)})} />
              <div style={{fontSize:10,color:C.muted,marginTop:4}}>Permite al empleado iniciar sesión</div>
            </div>
            <FieldInput label="Comisión (%)" type="number" min="0" max="100"
              value={newEmp.commissionPct}
              placeholder="0"
              onChange={e=>setNewEmp({...newEmp,commissionPct:e.target.value})} />
            <div>
              <FieldInput label="Tópico ntfy (opcional)"
                value={newEmp.ntfyTopic||""}
                placeholder="ej: joxe-laura-7f2a"
                onChange={e=>setNewEmp({...newEmp,ntfyTopic:e.target.value.replace(/\s/g,"")})} />
              <div style={{fontSize:10,color:C.muted,marginTop:4}}>El empleado se suscribe a este tópico en la app ntfy para recibir solo sus citas</div>
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:10}}>Servicios que ofrece</Mono>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {services.map(s=>{
                const on = newEmp.services.includes(s.id);
                return (
                  <button key={s.id} onClick={()=>toggleNewSvc(s.id)} style={{
                    padding:"6px 14px",fontSize:11,cursor:"pointer",
                    fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.08em",
                    background: on?"rgba(194,158,102,0.15)":C.s3,
                    color: on?C.gold:C.muted,
                    border:`1px solid ${on?C.gold+"50":C.bdr}`,
                  }}>{s.name}</button>
                );
              })}
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <WorkHoursEditor
              value={newEmp.workHours}
              onChange={wh=>setNewEmp(e=>({...e,workHours:wh}))}
            />
          </div>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={addEmployee} disabled={!newEmp.name.trim()}>Agregar empleado</Btn>
            <Btn variant="ghost" onClick={()=>setShowAdd(false)}>Cancelar</Btn>
          </div>
        </div>
      )}

      <div style={{padding:"24px 32px"}}>
        {employees.length===0 && (
          <div style={{textAlign:"center",padding:"48px",color:C.muted}}>
            <div style={{fontSize:32,marginBottom:8}}>◉</div>
            <Mono style={{fontSize:10}}>Sin empleados registrados</Mono>
          </div>
        )}

        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {employees.map(emp=>{
            const isEdit = editId===emp.id;
            const earned = revByEmp[emp.name]||0;
            const empServices = services.filter(s=>(emp.services||[]).includes(s.id));
            const empPuesto = Object.entries(admin.chairAssignments||{}).find(([,id])=>id===emp.id)?.[0]||null;
            return (
              <div key={emp.id} style={{
                border:`1px solid ${C.bdr}`,
                background:emp.active?C.s1:C.s2,
                opacity:emp.active?1:0.6,
              }}>
                {!isEdit ? (
                  <div style={{padding:"18px 20px"}}>
                    <div style={{
                      display:"grid",
                      gridTemplateColumns:"1fr auto auto auto auto",
                      gap:16,alignItems:"center",marginBottom:empServices.length?12:0,
                    }}>
                      <div>
                        <div style={{fontFamily:"'Marcellus',serif",fontSize:17}}>{emp.name}</div>
                        <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
                          <Mono style={{
                            fontSize:9,color:C.gold,
                            background:"rgba(194,158,102,0.1)",border:`1px solid ${C.gold}30`,
                            padding:"2px 8px",display:"inline-block",
                          }}>{emp.role}</Mono>
                          {empPuesto && (
                            <Mono style={{
                              fontSize:9,color:C.muted,
                              background:C.s3,border:`1px solid ${C.bdr}`,
                              padding:"2px 8px",display:"inline-block",
                            }}>Puesto {empPuesto}</Mono>
                          )}
                          <Mono style={{
                            fontSize:9,
                            color:emp.pin?C.green:C.muted,
                            background:emp.pin?"rgba(102,196,153,0.08)":"transparent",
                            border:`1px solid ${emp.pin?C.green+"30":C.bdr}`,
                            padding:"2px 8px",display:"inline-block",
                          }}>{emp.pin?"✓ PIN":"Sin PIN"}</Mono>
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:13,color:earned>0?C.green:C.muted}}>{earned>0?fmtCOP(earned):"—"}</div>
                        <Mono style={{fontSize:8,color:C.muted}}>facturado</Mono>
                      </div>
                      <button onClick={()=>toggleActive(emp.id)} style={{
                        padding:"5px 12px",
                        background:emp.active?"rgba(102,196,153,0.1)":"rgba(196,102,102,0.1)",
                        border:`1px solid ${emp.active?C.green+"40":C.red+"40"}`,
                        color:emp.active?C.green:C.red,cursor:"pointer",
                        fontFamily:"'JetBrains Mono',monospace",fontSize:9,
                        letterSpacing:"0.1em",textTransform:"uppercase",
                      }}>{emp.active?"Activo":"Inactivo"}</button>
                      <button onClick={()=>setChairQROpen(chairQROpen===emp.id?null:emp.id)} style={{
                        background:chairQROpen===emp.id?"rgba(194,158,102,0.12)":C.s3,
                        border:`1px solid ${chairQROpen===emp.id?C.gold+"40":C.bdr}`,
                        color:chairQROpen===emp.id?C.gold:C.muted,
                        cursor:"pointer",padding:"6px 10px",fontSize:11,
                        fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.06em",
                      }} title="QR de silla">⊡</button>
                      <button onClick={()=>startEdit(emp)} style={{
                        background:C.s3,border:`1px solid ${C.bdr}`,
                        color:C.muted,cursor:"pointer",padding:"6px 10px",fontSize:12,
                      }}>✎</button>
                      <button onClick={()=>deleteEmployee(emp)} style={{
                        background:"transparent",border:`1px solid ${C.red}30`,
                        color:C.red,cursor:"pointer",padding:"6px 10px",fontSize:12,
                      }}>✕</button>
                    </div>
                    {empServices.length>0 && (
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {empServices.map(s=>(
                          <span key={s.id} style={{
                            padding:"3px 10px",fontSize:10,
                            fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.08em",
                            background:C.s3,color:C.muted,border:`1px solid ${C.bdr}`,
                          }}>{s.name}</span>
                        ))}
                      </div>
                    )}
                    {emp.workHours && (
                      <div style={{marginTop:8}}>
                        <WorkHoursSummary workHours={emp.workHours} />
                      </div>
                    )}
                    {chairQROpen===emp.id && (
                      <div style={{
                        marginTop:16,padding:"24px",
                        background:C.s2,border:`1px solid ${C.bdr}`,
                        display:"flex",gap:32,alignItems:"flex-start",flexWrap:"wrap",
                      }}>
                        {empPuesto
                          ? <>
                              <ChairQRCode empName={emp.name} chairNum={Number(empPuesto)} size={180} />
                              <div style={{flex:1,minWidth:180,paddingTop:8}}>
                                <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:8}}>URL codificada · Puesto {empPuesto}</Mono>
                                <div style={{
                                  fontFamily:"'JetBrains Mono',monospace",fontSize:10,
                                  color:C.gold,background:C.s1,border:`1px solid ${C.bdr}`,
                                  padding:"10px 14px",wordBreak:"break-all",lineHeight:1.6,
                                }}>
                                  {window.location.origin}/CheckIn.html#puesto-{empPuesto}
                                </div>
                                <Mono style={{color:C.muted,fontSize:9,display:"block",lineHeight:1.6,marginTop:12}}>
                                  El QR está atado al puesto {empPuesto}. Si cambia el trabajador, el mismo QR sigue funcionando.
                                </Mono>
                              </div>
                            </>
                          : <div style={{color:C.muted,fontSize:13}}>
                              Este empleado no está asignado a ningún puesto.{" "}
                              <span style={{fontSize:11}}>Ve a <strong style={{color:C.text}}>Configuración → QR de puestos</strong> para asignarlo.</span>
                            </div>
                        }
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{padding:"18px 20px",background:C.s2}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,maxWidth:680,marginBottom:14}}>
                      <FieldInput label="Nombre" value={editForm.name}
                        onChange={e=>setEditForm({...editForm,name:e.target.value})} />
                      <FieldSelect label="Rol" value={editForm.role}
                        onChange={e=>setEditForm({...editForm,role:e.target.value})}
                        options={ROLES} />
                      <div>
                        <FieldInput label="PIN (4–6 dígitos)" type="password"
                          value={editForm.pin||""}
                          placeholder="••••"
                          onChange={e=>setEditForm({...editForm,pin:e.target.value.replace(/\D/g,"").slice(0,6)})} />
                        <div style={{fontSize:10,color:C.muted,marginTop:4}}>
                          {editForm.pin ? `${editForm.pin.length} dígitos configurados` : "Sin PIN · no puede iniciar sesión"}
                        </div>
                      </div>
                      <FieldInput label="Comisión (%)" type="number" min="0" max="100"
                        value={editForm.commissionPct ?? ""}
                        placeholder="0"
                        onChange={e=>setEditForm({...editForm,commissionPct:e.target.value})} />
                      <div>
                        <FieldInput label="Tópico ntfy (opcional)"
                          value={editForm.ntfyTopic||""}
                          placeholder="ej: joxe-laura-7f2a"
                          onChange={e=>setEditForm({...editForm,ntfyTopic:e.target.value.replace(/\s/g,"")})} />
                        <div style={{fontSize:10,color:C.muted,marginTop:4}}>Notificaciones ntfy solo para sus citas</div>
                      </div>
                    </div>
                    <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:10}}>Servicios</Mono>
                    <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
                      {services.map(s=>{
                        const on = (editForm.services||[]).includes(s.id);
                        return (
                          <button key={s.id} onClick={()=>toggleEditSvc(s.id)} style={{
                            padding:"6px 14px",fontSize:11,cursor:"pointer",
                            fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.08em",
                            background: on?"rgba(194,158,102,0.15)":C.s3,
                            color: on?C.gold:C.muted,
                            border:`1px solid ${on?C.gold+"50":C.bdr}`,
                          }}>{s.name}</button>
                        );
                      })}
                    </div>
                    <div style={{marginBottom:14}}>
                      <WorkHoursEditor
                        value={editForm.workHours}
                        onChange={wh=>setEditForm(f=>({...f,workHours:wh}))}
                      />
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <Btn small onClick={()=>saveEdit(emp.id)}>Guardar</Btn>
                      <Btn small variant="ghost" onClick={()=>setEditId(null)}>Cancelar</Btn>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary */}
        {employees.length>0 && (
          <div style={{
            marginTop:24,padding:"20px 24px",background:C.s1,
            border:`1px solid ${C.bdr}`,display:"flex",gap:40,flexWrap:"wrap",
          }}>
            <div>
              <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:6}}>Empleados activos</Mono>
              <div style={{fontFamily:"'Marcellus',serif",fontSize:32,color:C.gold}}>
                {employees.filter(e=>e.active).length}
              </div>
            </div>
            {ROLES.filter(r=>employees.some(e=>e.role===r&&e.active)).map(role=>(
              <div key={role}>
                <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:6}}>{role}</Mono>
                <div style={{fontFamily:"'Marcellus',serif",fontSize:32,color:C.gold}}>
                  {employees.filter(e=>e.role===role&&e.active).length}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Archived employees */}
        <ArchivedEmployeesSection archived={admin.archivedEmployees||[]} revenue={admin.revenue||[]} />
      </div>
    </div>
  );
};

// ==================== SERVICES ====================
const ServicesView = () => {
  const [admin,setAdmin] = useAdmin();
  const [editId,setEditId] = React.useState(null);
  const [editForm,setEditForm] = React.useState({});
  const [showAdd,setShowAdd] = React.useState(false);
  const [newSvc,setNewSvc] = React.useState({name:"",price:"",dur:"",note:"",commissionFixed:""});

  const services = admin.services||[];
  const revenue  = (admin.revenue||[]).filter(r=>!r.deleted);

  const revenueByService = {};
  revenue.forEach(r=>{
    if (r.service) revenueByService[r.service]=(revenueByService[r.service]||0)+Number(r.amount||0);
  });

  const startEdit = (s) => {
    setEditId(s.id);
    setEditForm({name:s.name,price:s.price,dur:s.dur,note:s.note||"",commissionFixed:s.commissionFixed||""});
  };

  const saveEdit = (id) => {
    setAdmin(a=>({...a, services:a.services.map(s=>
      s.id===id ? {...s,...editForm,price:Number(editForm.price),dur:Number(editForm.dur),commissionFixed:Number(editForm.commissionFixed)||0} : s
    )}));
    setEditId(null);
  };

  const toggleActive = (id) => {
    setAdmin(a=>({...a, services:a.services.map(s=>
      s.id===id ? {...s,active:!s.active} : s
    )}));
  };

  const deleteService = (id) => {
    if (!confirm("¿Eliminar este servicio?")) return;
    setAdmin(a=>({...a, services:a.services.filter(s=>s.id!==id)}));
  };

  const addService = () => {
    if (!newSvc.name||!newSvc.price) return;
    setAdmin(a=>({...a, services:[...a.services,{
      id:genId(),...newSvc,price:Number(newSvc.price),dur:Number(newSvc.dur)||60,
      commissionFixed:Number(newSvc.commissionFixed)||0,active:true,
    }]}));
    setNewSvc({name:"",price:"",dur:"",note:"",commissionFixed:""});
    setShowAdd(false);
  };

  return (
    <div>
      <PageHeader title="Servicios" subtitle="Catálogo · Precios"
        action={<Btn onClick={()=>setShowAdd(!showAdd)}>
          {showAdd?"Cancelar":"+ Agregar servicio"}
        </Btn>}
      />

      {showAdd && (
        <div style={{padding:"20px 32px",borderBottom:`1px solid ${C.bdr}`,background:C.s1}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14,maxWidth:700}}>
            <FieldInput label="Nombre del servicio" value={newSvc.name}
              onChange={e=>setNewSvc({...newSvc,name:e.target.value})} placeholder="Corte hombre" />
            <FieldInput label="Precio (COP)" type="number" value={newSvc.price}
              onChange={e=>setNewSvc({...newSvc,price:e.target.value})} placeholder="45000" />
            <FieldInput label="Duración (min)" type="number" value={newSvc.dur}
              onChange={e=>setNewSvc({...newSvc,dur:e.target.value})} placeholder="40" />
            <FieldInput label="Nota (desde, aprox…)" value={newSvc.note}
              onChange={e=>setNewSvc({...newSvc,note:e.target.value})} placeholder="desde" />
            <FieldInput label="Comisión fija (COP, opcional)" type="number" value={newSvc.commissionFixed}
              onChange={e=>setNewSvc({...newSvc,commissionFixed:e.target.value})} placeholder="0 = usar %" />
          </div>
          <div style={{display:"flex",gap:10,marginTop:14}}>
            <Btn onClick={addService} disabled={!newSvc.name||!newSvc.price}>Agregar servicio</Btn>
            <Btn variant="ghost" onClick={()=>setShowAdd(false)}>Cancelar</Btn>
          </div>
        </div>
      )}

      <div style={{padding:"24px 32px"}}>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {services.map(s=>{
            const isEdit = editId===s.id;
            const earned = revenueByService[s.name]||0;
            return (
              <div key={s.id} style={{
                border:`1px solid ${C.bdr}`,background:s.active?C.s1:C.s2,
                opacity:s.active?1:0.6,
              }}>
                {!isEdit ? (
                  <div style={{
                    display:"grid",
                    gridTemplateColumns:"1fr 80px 80px 100px 120px auto",
                    gap:12,padding:"16px 18px",alignItems:"center",
                  }}>
                    <div>
                      <div style={{fontSize:15,fontFamily:"'Marcellus',serif"}}>{s.name}</div>
                      {s.note&&<Mono style={{color:C.muted,fontSize:9}}>{s.note}</Mono>}
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:15,fontVariantNumeric:"tabular-nums"}}>
                        {fmtCOP(s.price)}
                      </div>
                      <Mono style={{fontSize:8,color:C.muted}}>precio</Mono>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:14,color:C.muted}}>{s.dur} min</div>
                      <Mono style={{fontSize:8,color:C.muted}}>duración</Mono>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:13,color:earned>0?C.green:C.muted}}>
                        {earned>0?fmtCOP(earned):"—"}
                      </div>
                      <Mono style={{fontSize:8,color:C.muted}}>facturado</Mono>
                    </div>
                    <button onClick={()=>toggleActive(s.id)} style={{
                      padding:"5px 12px",background:s.active?"rgba(102,196,153,0.1)":"rgba(196,102,102,0.1)",
                      border:`1px solid ${s.active?C.green+"40":C.red+"40"}`,
                      color:s.active?C.green:C.red,cursor:"pointer",
                      fontFamily:"'JetBrains Mono',monospace",fontSize:9,
                      letterSpacing:"0.1em",textTransform:"uppercase",
                    }}>
                      {s.active?"Activo":"Inactivo"}
                    </button>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>startEdit(s)} style={{
                        background:C.s3,border:`1px solid ${C.bdr}`,
                        color:C.muted,cursor:"pointer",padding:"6px 10px",fontSize:12,
                      }}>✎</button>
                      <button onClick={()=>deleteService(s.id)} style={{
                        background:"transparent",border:`1px solid ${C.red}30`,
                        color:C.red,cursor:"pointer",padding:"6px 10px",fontSize:12,
                      }}>✕</button>
                    </div>
                  </div>
                ) : (
                  <div style={{padding:"16px 18px",background:C.s2}}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12}}>
                      <FieldInput label="Nombre" value={editForm.name}
                        onChange={e=>setEditForm({...editForm,name:e.target.value})} />
                      <FieldInput label="Precio (COP)" type="number" value={editForm.price}
                        onChange={e=>setEditForm({...editForm,price:e.target.value})} />
                      <FieldInput label="Duración (min)" type="number" value={editForm.dur}
                        onChange={e=>setEditForm({...editForm,dur:e.target.value})} />
                      <FieldInput label="Nota" value={editForm.note}
                        onChange={e=>setEditForm({...editForm,note:e.target.value})} />
                      <FieldInput label="Comisión fija (COP, opcional)" type="number" value={editForm.commissionFixed ?? ""}
                        onChange={e=>setEditForm({...editForm,commissionFixed:e.target.value})} placeholder="0 = usar %" />
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:12}}>
                      <Btn small onClick={()=>saveEdit(s.id)}>Guardar</Btn>
                      <Btn small variant="ghost" onClick={()=>setEditId(null)}>Cancelar</Btn>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div style={{
          marginTop:24,padding:"20px 24px",background:C.s1,
          border:`1px solid ${C.bdr}`,
          display:"flex",gap:40,flexWrap:"wrap",
        }}>
          <div>
            <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:6}}>
              Servicios activos
            </Mono>
            <div style={{fontFamily:"'Marcellus',serif",fontSize:32,color:C.gold}}>
              {services.filter(s=>s.active).length}
            </div>
          </div>
          <div>
            <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:6}}>
              Precio promedio
            </Mono>
            <div style={{fontFamily:"'Marcellus',serif",fontSize:32,color:C.gold}}>
              {fmtCOP(Math.round(services.filter(s=>s.active).reduce((s,v)=>s+v.price,0)/(services.filter(s=>s.active).length||1)))}
            </div>
          </div>
          <div>
            <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:6}}>
              Duración promedio
            </Mono>
            <div style={{fontFamily:"'Marcellus',serif",fontSize:32,color:C.gold}}>
              {Math.round(services.filter(s=>s.active).reduce((s,v)=>s+v.dur,0)/(services.filter(s=>s.active).length||1))} min
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== SETTINGS ====================
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// Etiqueta legible del dispositivo actual (para listar las suscripciones)
const deviceLabel = () => {
  const ua = navigator.userAgent || "";
  let os = "Dispositivo";
  if (/iphone/i.test(ua)) os = "iPhone";
  else if (/ipad/i.test(ua)) os = "iPad";
  else if (/android/i.test(ua)) os = "Android";
  else if (/windows/i.test(ua)) os = "Windows";
  else if (/mac os|macintosh/i.test(ua)) os = "Mac";
  else if (/linux/i.test(ua)) os = "Linux";
  let br = "";
  if (/edg/i.test(ua)) br = "Edge";
  else if (/chrome|crios/i.test(ua)) br = "Chrome";
  else if (/firefox|fxios/i.test(ua)) br = "Firefox";
  else if (/safari/i.test(ua)) br = "Safari";
  return br ? os + " · " + br : os;
};

// Navegadores embebidos (Instagram, WhatsApp, Facebook, TikTok…): no permiten
// activar push ni "Agregar a inicio". Hay que abrir la página en Safari/Chrome.
const isInAppBrowser = () => /Instagram|FBAN|FBAV|FB_IAB|FB4A|WhatsApp|Line\/|MicroMessenger|TikTok|Snapchat/i.test(navigator.userAgent || "");

const NotificationsCard = () => {
  const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  const [permission, setPermission] = React.useState(() => supported ? Notification.permission : "unsupported");
  const [subscribed, setSubscribed] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  const [devices, setDevices] = React.useState([]);
  const [thisEndpoint, setThisEndpoint] = React.useState(null);

  const refreshDevices = React.useCallback(async () => {
    try {
      const res = await fetch("/api/push?list=mine", { headers: staffHeaders() });
      if (res.ok) { const d = await res.json(); setDevices(d.devices || []); }
    } catch {}
  }, []);

  React.useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription().then(sub => {
        setSubscribed(!!sub);
        setThisEndpoint(sub?.endpoint ?? null);
      })
    );
    refreshDevices();
  }, []);

  const removeDevice = async (endpoint) => {
    try {
      await fetch("/api/push", {
        method: "DELETE",
        headers: { ...staffHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      if (endpoint === thisEndpoint) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
        setSubscribed(false);
        setThisEndpoint(null);
      }
      refreshDevices();
    } catch { setMsg({ type: "error", text: "No se pudo quitar el dispositivo." }); }
  };

  const flashMsg = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 5000);
  };

  const subscribe = async () => {
    setLoading(true);
    try {
      const keyRes = await fetch("/api/push");
      const { publicKey } = await keyRes.json();
      if (!publicKey) { flashMsg("error", "VAPID no configurado en el servidor."); return; }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      setPermission("granted");

      const res = await fetch("/api/push", {
        method: "POST",
        headers: { ...staffHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), label: deviceLabel() }),
      });
      if (!res.ok) throw new Error("No se pudo guardar la suscripción.");
      setSubscribed(true);
      setThisEndpoint(sub.endpoint);
      flashMsg("success", "Notificaciones activadas en este dispositivo.");
      refreshDevices();
    } catch (e) {
      flashMsg("error", e.message || "Error al activar notificaciones.");
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { ...staffHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setThisEndpoint(null);
      flashMsg("success", "Notificaciones desactivadas.");
      refreshDevices();
    } catch (e) {
      flashMsg("error", e.message || "Error al desactivar.");
    } finally {
      setLoading(false);
    }
  };

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  const inApp = isInAppBrowser();

  return (
    <Card>
      <Mono style={{color:C.gold,display:"block",marginBottom:16}}>Notificaciones push</Mono>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>

        {inApp && (
          <div style={{
            padding:"12px 14px",fontSize:13,lineHeight:1.5,
            background:"rgba(196,102,102,0.08)",border:`1px solid ${C.red}40`,color:C.muted,
          }}>
            Estás en el navegador de <strong style={{color:C.text}}>Instagram / WhatsApp</strong>, que no
            permite activar notificaciones. Abre esta misma página en Safari o Chrome:
            toca el menú <strong style={{color:C.text}}>⋯</strong> (arriba) y elige
            <strong style={{color:C.text}}> "Abrir en el navegador"</strong>, y activa el aviso ahí.
          </div>
        )}

        {!inApp && !supported && (
          <div style={{fontSize:13,color:C.muted}}>
            Este navegador no soporta notificaciones push.
          </div>
        )}

        {!inApp && supported && isIos && !isStandalone && (
          <div style={{
            padding:"12px 14px",fontSize:13,lineHeight:1.5,
            background:"rgba(194,158,102,0.08)",border:`1px solid ${C.gold}30`,color:C.muted,
          }}>
            En iPhone debes <strong style={{color:C.text}}>agregar esta página al Home Screen</strong> y
            abrirla desde ahí antes de activar notificaciones.<br/>
            Safari → Compartir → "Agregar a inicio"
          </div>
        )}

        {!inApp && supported && permission === "denied" && (
          <div style={{
            padding:"12px 14px",fontSize:13,lineHeight:1.5,
            background:"rgba(196,102,102,0.08)",border:`1px solid ${C.red}40`,color:C.muted,
          }}>
            Los permisos de notificación están <strong style={{color:C.red}}>bloqueados</strong> en este
            navegador. Ve a Ajustes → Safari → Notificaciones para habilitarlos.
          </div>
        )}

        {!inApp && supported && permission !== "denied" && (
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16}}>
            <div>
              <div style={{fontSize:14}}>Recibir aviso al llegar un nuevo turno</div>
              <div style={{fontSize:12,color:C.muted,marginTop:4}}>
                Solo afecta este dispositivo. Puedes activarlo en varios teléfonos.
              </div>
            </div>
            <button
              onClick={subscribed ? unsubscribe : subscribe}
              disabled={loading || (isIos && !isStandalone)}
              style={{
                padding:"8px 18px",flexShrink:0,
                background:subscribed?"rgba(102,196,153,0.1)":C.s3,
                border:`1px solid ${subscribed?C.green+"40":C.bdr}`,
                color:subscribed?C.green:C.muted,
                cursor:"pointer",fontFamily:"'JetBrains Mono',monospace",
                fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",
                opacity:(loading||(isIos&&!isStandalone))?0.5:1,
              }}>
              {loading ? "..." : subscribed ? "Activo" : "Inactivo"}
            </button>
          </div>
        )}

        {devices.length > 0 && (
          <div style={{borderTop:`1px solid ${C.bdr}`,paddingTop:14}}>
            <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:10}}>
              Tus dispositivos con avisos ({devices.length})
            </Mono>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {devices.map(d => (
                <div key={d.endpoint} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                  <div>
                    <div style={{fontSize:13,color:C.text}}>
                      {d.label || "Dispositivo"}
                      {d.endpoint===thisEndpoint && <span style={{color:C.green,fontSize:11}}> · este</span>}
                    </div>
                    {d.createdAt && (
                      <div style={{fontSize:11,color:C.muted}}>
                        Activado {new Date(d.createdAt).toLocaleDateString("es-CO",{day:"numeric",month:"short"})}
                      </div>
                    )}
                  </div>
                  <button onClick={()=>removeDevice(d.endpoint)} style={{
                    padding:"5px 12px",background:"transparent",border:`1px solid ${C.red}40`,color:C.red,
                    cursor:"pointer",fontFamily:"'JetBrains Mono',monospace",fontSize:9,letterSpacing:"0.06em",textTransform:"uppercase",
                  }}>Quitar</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {msg && (
          <div style={{
            padding:"10px 14px",fontSize:13,
            background:msg.type==="error"?"rgba(196,102,102,0.1)":"rgba(102,196,153,0.1)",
            border:`1px solid ${msg.type==="error"?C.red+"40":C.green+"40"}`,
            color:msg.type==="error"?C.red:C.green,
          }}>{msg.text}</div>
        )}
      </div>
    </Card>
  );
};

const AllDevicesCard = () => {
  const [groups, setGroups] = React.useState(null);
  const [msg, setMsg] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/push?list=all", { headers: adminHeaders() });
      if (!res.ok) { setGroups([]); return; }
      const { devices } = await res.json();
      const by = {};
      (devices || []).forEach(d => {
        const key = d.stylist || (d.empId ? "Empleado " + d.empId : "Admin / sin asignar");
        (by[key] = by[key] || []).push(d);
      });
      setGroups(Object.entries(by).map(([name, list]) => ({ name, list })));
    } catch { setGroups([]); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const remove = async (endpoint) => {
    try {
      await fetch("/api/push", {
        method: "DELETE",
        headers: { ...adminHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      load();
    } catch { setMsg("Error al quitar el dispositivo."); }
  };

  const total = groups ? groups.reduce((n, g) => n + g.list.length, 0) : 0;

  return (
    <Card>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <Mono style={{color:C.gold}}>Dispositivos de notificaciones · todos</Mono>
        <button onClick={load} style={{
          background:"transparent",border:`1px solid ${C.bdr}`,color:C.muted,cursor:"pointer",
          fontFamily:"'JetBrains Mono',monospace",fontSize:9,padding:"4px 10px",
        }}>↻ Refrescar</button>
      </div>
      {groups === null && <div style={{fontSize:13,color:C.muted}}>Cargando…</div>}
      {groups && total === 0 && <div style={{fontSize:13,color:C.muted}}>Ningún dispositivo registrado todavía.</div>}
      {groups && groups.map(g => (
        <div key={g.name} style={{marginBottom:18}}>
          <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:8}}>{g.name} ({g.list.length})</Mono>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {g.list.map(d => (
              <div key={d.endpoint} style={{
                display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,
                padding:"8px 12px",background:C.s2,border:`1px solid ${C.bdr}`,
              }}>
                <div>
                  <div style={{fontSize:13,color:C.text}}>{d.label || "Dispositivo"}</div>
                  {d.createdAt && (
                    <div style={{fontSize:11,color:C.muted}}>
                      Activado {new Date(d.createdAt).toLocaleDateString("es-CO",{day:"numeric",month:"short",year:"numeric"})}
                    </div>
                  )}
                </div>
                <button onClick={()=>remove(d.endpoint)} style={{
                  padding:"5px 12px",background:"transparent",border:`1px solid ${C.red}40`,color:C.red,
                  cursor:"pointer",fontFamily:"'JetBrains Mono',monospace",fontSize:9,textTransform:"uppercase",
                }}>Quitar</button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {msg && <div style={{marginTop:10,fontSize:12,color:C.red}}>{msg}</div>}
    </Card>
  );
};

// ==================== STYLIST SETTINGS ====================
const StylistSettingsView = ({ empId, onNav }) => {
  const [admin, setAdmin] = useAdmin();
  const [appts, setAppts] = useAppts();
  const [form, setForm]   = React.useState(null);
  const [saved, setSaved] = React.useState(false);
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [selectedDate, setSelectedDate] = React.useState(todayStr());
  const [reason, setReason] = React.useState("");
  const [showRangeModal, setShowRangeModal] = React.useState(false);

  const emp      = (admin.employees || []).find(e => e.id === empId);
  const services = (admin.services  || []).filter(s => s.active);

  React.useEffect(() => {
    if (emp) {
      setForm({
        name:      emp.name,
        role:      emp.role,
        pin:       emp.pin || "",
        services:  [...(emp.services  || [])],
        workHours: { ...DEFAULT_WORK_HOURS(), ...(emp.workHours || {}) },
      });
    }
  }, [empId]);

  if (!emp || !form) return (
    <div style={{ padding: "32px" }}>
      <Mono style={{ color: C.red }}>Empleado no encontrado.</Mono>
      <div style={{ marginTop: 16 }}>
        <Btn variant="ghost" onClick={() => onNav("settings")}>← Volver</Btn>
      </div>
    </div>
  );

  const toggleSvc = (svcId) => setForm(f => ({
    ...f,
    services: f.services.includes(svcId)
      ? f.services.filter(s => s !== svcId)
      : [...f.services, svcId],
  }));

  const save = () => {
    const nameChanged = emp.name !== form.name;
    let stylists = [...(admin.stylists || [])];
    if (nameChanged) stylists = stylists.map(s => s === emp.name ? form.name : s);
    setAdmin(a => ({
      ...a,
      employees: a.employees.map(e => e.id === empId ? { ...e, ...form } : e),
      stylists,
    }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const ALL_TIMES = [
    "10:00","11:00","12:00","13:00","14:00",
    "15:00","16:00","17:00","18:00","19:00","20:00",
  ];
  const weekDates    = getWeekDates(weekOffset);
  const todayD       = todayStr();
  const myAllBlocks  = normalizeBlocks(appts).filter(b => b.employeeId === empId);
  const DAY_LABELS   = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

  const myBlocks   = (date, time) => myAllBlocks.filter(b => blockCoversSlot(b, date, time));
  const isBlocked  = (date, time) => myBlocks(date, time).length > 0;

  // Clicking toggles a single 30-min slot. A bigger range/absence covering this
  // cell must be removed from the list below instead.
  const toggleSlot = (date, time) => {
    const covering = myBlocks(date, time);
    const exact = covering.find(b => b.dateStart === date && b.dateEnd === date && !b.allDay && b.timeStart === time);
    if (exact) {
      setAppts(s => removeBlock(s, exact.id));
      return;
    }
    if (covering.length > 0) {
      alert("Esta hora está cubierta por un bloqueo de rango. Elimínalo desde la lista de abajo.");
      return;
    }
    const endMin = timeToMin(time) + BLOCK_SLOT_MIN;
    setAppts(s => ({ ...s, blockRanges: [...(s.blockRanges || []), {
      id: genId(), dateStart: date, dateEnd: date, allDay: false,
      timeStart: time, timeEnd: minToTime(endMin),
      employeeId: empId, reason: reason || "No disponible", type: "block", createdAt: Date.now(),
    }] }));
  };

  const blockedForDay   = (date) => myAllBlocks.filter(b => date >= b.dateStart && date <= (b.dateEnd || b.dateStart));
  const selectedBlocked = blockedForDay(selectedDate);

  const clearDay = (date) => {
    if (!confirm(`¿Desbloquear todas las horas de ${fmtDateShort(date)}?`)) return;
    setAppts(s => ({
      ...s,
      blockedSlots: (s.blockedSlots || []).filter(b => !(b.date === date && b.employeeId === empId)),
      blockRanges: (s.blockRanges || []).filter(b => !(b.dateStart === date && b.dateEnd === date && b.employeeId === empId)),
    }));
  };

  const weekLabel = () => {
    const first = weekDates[0]; const last = weekDates[weekDates.length - 1];
    const f = new Date(first + "T12:00"); const l = new Date(last + "T12:00");
    return `${f.getDate()} – ${l.getDate()} ${l.toLocaleDateString("es-CO", { month: "long", year: "numeric" })}`;
  };

  return (
    <div>
      <div style={{
        padding: "16px 32px", borderBottom: `1px solid ${C.bdr}`,
        display: "flex", alignItems: "center", gap: 16, background: C.s1,
      }}>
        <button onClick={() => onNav("settings")} style={{
          background: "transparent", border: `1px solid ${C.bdr}`, color: C.muted,
          cursor: "pointer", padding: "7px 14px",
          fontFamily: "'Outfit',sans-serif", fontSize: 11, letterSpacing: "0.1em",
        }}>← Volver</button>
        <div>
          <Mono style={{ color: C.gold, fontSize: 9 }}>Configuración · Estilista</Mono>
          <h1 style={{ fontFamily: "'Marcellus',serif", fontSize: 26, fontWeight: 400, margin: "4px 0 0", color: C.text }}>
            {emp.name}
          </h1>
        </div>
        <Mono style={{ color: C.muted, fontSize: 9, marginLeft: 4 }}>{emp.role}</Mono>
      </div>

      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 760 }}>

        {/* Basic info + services */}
        <Card>
          <Mono style={{ color: C.gold, display: "block", marginBottom: 16 }}>Información básica</Mono>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <FieldInput label="Nombre"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <FieldSelect label="Rol" value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              options={ROLES} />
            <div>
              <FieldInput label="PIN (4–6 dígitos)" type="password"
                value={form.pin} placeholder="••••"
                onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }))} />
              <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                {form.pin ? `${form.pin.length} dígito${form.pin.length !== 1 ? "s" : ""}` : "Sin PIN · no puede iniciar sesión"}
              </div>
            </div>
          </div>

          <Mono style={{ color: C.muted, fontSize: 9, display: "block", marginBottom: 10 }}>Servicios que ofrece</Mono>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {services.map(s => {
              const on = form.services.includes(s.id);
              return (
                <button key={s.id} onClick={() => toggleSvc(s.id)} style={{
                  padding: "6px 14px", fontSize: 11, cursor: "pointer",
                  fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em",
                  background: on ? "rgba(194,158,102,0.15)" : C.s3,
                  color: on ? C.gold : C.muted,
                  border: `1px solid ${on ? C.gold + "50" : C.bdr}`,
                }}>{s.name}</button>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Btn onClick={save}>Guardar</Btn>
            {saved && <Mono style={{ color: C.green, fontSize: 9 }}>✓ Guardado</Mono>}
          </div>
        </Card>

        {/* Work hours */}
        <Card>
          <WorkHoursEditor
            value={form.workHours}
            onChange={wh => setForm(f => ({ ...f, workHours: wh }))}
          />
          <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
            <Btn onClick={save}>Guardar horario</Btn>
            {saved && <Mono style={{ color: C.green, fontSize: 9 }}>✓ Guardado</Mono>}
          </div>
        </Card>

        {/* Blocked slots */}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.bdr}` }}>
            <Mono style={{ color: C.gold }}>Horas bloqueadas</Mono>
          </div>

          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 20px", borderBottom: `1px solid ${C.bdr}`,
          }}>
            <button onClick={() => setWeekOffset(o => o - 1)} style={{
              background: "transparent", border: `1px solid ${C.bdr}`, color: C.text,
              cursor: "pointer", padding: "5px 12px", fontSize: 14,
            }}>←</button>
            <div style={{ textAlign: "center" }}>
              <Mono style={{ color: C.gold, fontSize: 10 }}>{weekLabel()}</Mono>
              {weekOffset !== 0 && (
                <button onClick={() => setWeekOffset(0)} style={{
                  background: "transparent", border: "none", color: C.muted,
                  cursor: "pointer", fontSize: 10, display: "block",
                  fontFamily: "'Outfit',sans-serif", marginTop: 2,
                }}>Esta semana</button>
              )}
            </div>
            <button onClick={() => setWeekOffset(o => o + 1)} style={{
              background: "transparent", border: `1px solid ${C.bdr}`, color: C.text,
              cursor: "pointer", padding: "5px 12px", fontSize: 14,
            }}>→</button>
          </div>

          <div style={{
            padding: "10px 20px", borderBottom: `1px solid ${C.bdr}`,
            display: "flex", gap: 10, alignItems: "center",
          }}>
            <Mono style={{ color: C.muted, fontSize: 8, whiteSpace: "nowrap" }}>Motivo</Mono>
            <input value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Almuerzo, descanso… (opcional)"
              style={{
                flex: 1, background: C.s2, border: `1px solid ${C.bdr}`,
                color: C.text, padding: "6px 10px",
                fontFamily: "'Outfit',sans-serif", fontSize: 12, outline: "none",
              }} />
            <button onClick={() => setShowRangeModal(true)} style={{
              background: "transparent", border: `1px solid ${C.gold + "60"}`, color: C.gold,
              cursor: "pointer", padding: "6px 12px", fontSize: 10, whiteSpace: "nowrap",
              fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em",
            }}>+ Ausencia / rango</button>
          </div>

          {showRangeModal && (
            <BlockRangeModal
              employees={[]}
              lockedEmpId={empId}
              onSave={(range) => setAppts(s => ({ ...s, blockRanges: [...(s.blockRanges || []), range] }))}
              onClose={() => setShowRangeModal(false)}
            />
          )}

          <div style={{ overflowX: "auto" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: `52px repeat(${weekDates.length}, 1fr)`,
              gridAutoRows: "28px",
              minWidth: 480,
            }}>
              <div style={{ background: C.s1, borderBottom: `1px solid ${C.bdr}`, borderRight: `1px solid ${C.bdr}` }} />
              {weekDates.map((d, i) => {
                const isToday    = d === todayD;
                const isSelected = d === selectedDate;
                const cnt        = blockedForDay(d).length;
                return (
                  <button key={d} onClick={() => setSelectedDate(d)} style={{
                    background: isToday ? "rgba(194,158,102,0.07)" : isSelected ? C.s2 : C.s1,
                    borderBottom: `1px solid ${C.bdr}`, borderRight: `1px solid ${C.bdr}`,
                    borderLeft: "none", borderTop: "none",
                    padding: "5px 4px", cursor: "pointer", textAlign: "center",
                    outline: isSelected ? `1px solid ${C.gold + "50"}` : "none", outlineOffset: -1,
                  }}>
                    <Mono style={{ color: isToday ? C.gold : C.muted, fontSize: 7, display: "block" }}>{DAY_LABELS[i]}</Mono>
                    <span style={{ color: isToday ? C.gold : C.text, fontSize: 12, fontFamily: "'Outfit',sans-serif", fontWeight: isToday ? 600 : 400 }}>
                      {new Date(d + "T12:00").getDate()}
                    </span>
                    {cnt > 0 && <Mono style={{ display: "block", fontSize: 7, color: C.red, marginTop: 1 }}>{cnt}✕</Mono>}
                  </button>
                );
              })}

              {ALL_TIMES.map(t => {
                const isBookingTime = TIMES.includes(t);
                return (
                  <React.Fragment key={t}>
                    <div style={{
                      background: C.s1,
                      borderBottom: `1px solid ${C.bdr}`, borderRight: `1px solid ${C.bdr}`,
                      display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 8px",
                    }}>
                      <Mono style={{ color: isBookingTime ? C.gold + "90" : C.muted, fontSize: 8 }}>{formatTime12h(t)}</Mono>
                    </div>
                    {weekDates.map(d => {
                      const blocked = isBlocked(d, t);
                      const isToday = d === todayD;
                      return (
                        <button key={d} onClick={() => toggleSlot(d, t)} style={{
                          background: blocked ? C.red + "22" : isToday ? "rgba(194,158,102,0.03)" : "transparent",
                          border: "none",
                          borderBottom: `1px solid ${C.bdr}`, borderRight: `1px solid ${C.bdr}`,
                          cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "background 0.1s",
                        }}>
                          {blocked
                            ? <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.red, opacity: 0.9 }} />
                            : isBookingTime
                              ? <div style={{ width: 3, height: 3, borderRadius: "50%", background: C.gold, opacity: 0.25 }} />
                              : null
                          }
                        </button>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.bdr}`, background: C.s2 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Mono style={{ color: C.gold, fontSize: 9 }}>
                {fmtDateMed(selectedDate)} · {selectedBlocked.length} bloqueado{selectedBlocked.length !== 1 ? "s" : ""}
              </Mono>
              {selectedBlocked.length > 0 && (
                <button onClick={() => clearDay(selectedDate)} style={{
                  background: "transparent", border: `1px solid ${C.red + "50"}`,
                  color: C.red, cursor: "pointer", fontSize: 9, padding: "4px 8px",
                  fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.1em",
                }}>Limpiar día</button>
              )}
            </div>
            {selectedBlocked.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 12 }}>Sin bloqueos para este día. Haz clic en la grilla para bloquear.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {selectedBlocked
                  .sort((a, b) => (a.timeStart||"") < (b.timeStart||"") ? -1 : 1)
                  .map(b => {
                    const multiDay = b.dateStart !== b.dateEnd;
                    const whenLabel = b.allDay
                      ? (multiDay ? `${fmtDateShort(b.dateStart)} – ${fmtDateShort(b.dateEnd)} · Todo el día` : "Todo el día")
                      : (multiDay ? `${fmtDateShort(b.dateStart)} – ${fmtDateShort(b.dateEnd)} · ${formatTime12h(b.timeStart)}–${formatTime12h(b.timeEnd)}` : `${formatTime12h(b.timeStart)}–${formatTime12h(b.timeEnd)}`);
                    return (
                      <div key={b.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "6px 10px", background: C.s1, borderLeft: `2px solid ${C.red}50`,
                      }}>
                        <div>
                          <Mono style={{ color: C.red, fontSize: 10 }}>{whenLabel}</Mono>
                          {b.reason && b.reason !== "No disponible" && (
                            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{b.reason}</div>
                          )}
                        </div>
                        <button onClick={() => setAppts(s => removeBlock(s, b.id))}
                          style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, padding: "2px 6px" }}>
                          ✕
                        </button>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          <div style={{ padding: "10px 20px", borderTop: `1px solid ${C.bdr}` }}>
            <Mono style={{ color: C.muted, fontSize: 8 }}>
              Clic en la grilla para bloquear / desbloquear · Los puntos dorados son horas de reserva
            </Mono>
          </div>
        </Card>
      </div>
    </div>
  );
};

const SettingsView = ({ onNav }) => {
  const [admin,setAdmin] = useAdmin();
  const [,setAppts] = useAppts();
  const [pwForm,setPwForm] = React.useState({current:"",newPw:"",confirm:""});
  const [pwMsg,setPwMsg] = React.useState(null);
  const [newStylist,setNewStylist] = React.useState("");

  const changePw = async () => {
    if (pwForm.newPw.length < 4) {
      setPwMsg({type:"error", text:"La contraseña debe tener al menos 4 caracteres."});
      return;
    }
    if (pwForm.newPw !== pwForm.confirm) {
      setPwMsg({type:"error", text:"Las contraseñas no coinciden."});
      return;
    }
    // Verify current password via API
    try {
      const res  = await fetch("/api/admin?action=auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwForm.current }),
      });
      const data = await res.json();
      if (!data.ok) { setPwMsg({type:"error", text:"Contraseña actual incorrecta."}); return; }
    } catch {
      setPwMsg({type:"error", text:"Error de conexión al verificar contraseña."}); return;
    }
    // Save new password and update session token so future API calls still work
    await setAdmin(a => ({ ...a, password: pwForm.newPw }));
    doLogin(pwForm.newPw);
    setPwForm({current:"", newPw:"", confirm:""});
    setPwMsg({type:"success", text:"Contraseña actualizada. Sesión renovada."});
    setTimeout(() => setPwMsg(null), 4000);
  };

  const addStylist = () => {
    if (!newStylist.trim()) return;
    setAdmin(a=>({...a,stylists:[...(a.stylists||[]),newStylist.trim()]}));
    setNewStylist("");
  };

  // ---- Backup / restauración de la base de datos ----
  const [backupMsg,setBackupMsg] = React.useState(null);
  const restoreRef = React.useRef(null);

  const downloadBackup = async () => {
    try {
      const res = await fetch("/api/backup", { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) { setBackupMsg({type:"error", text:"No se pudo generar el backup."}); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `joxe-backup-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      setBackupMsg({type:"success", text:"Backup descargado."});
      setTimeout(()=>setBackupMsg(null), 4000);
    } catch {
      setBackupMsg({type:"error", text:"Error de conexión al generar el backup."});
    }
  };

  const restoreBackup = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!confirm("Restaurar combinará los datos del archivo con los actuales (los registros con la misma clave se sobrescriben). ¿Continuar?")) return;
    try {
      const snapshot = JSON.parse(await file.text());
      const res  = await fetch("/api/backup", {
        method: "POST", headers: adminHeaders(), body: JSON.stringify(snapshot),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setBackupMsg({type:"error", text:data.error || "No se pudo restaurar."}); return; }
      setBackupMsg({type:"success", text:`Restaurados ${data.restored} registros. Recargá la página para ver los cambios.`});
    } catch {
      setBackupMsg({type:"error", text:"El archivo no es un backup válido."});
    }
  };

  const deleteStylist = (s) => {
    if (!confirm(`¿Eliminar a ${s}? Se archivará su historial pero ya no aparecerá en el equipo ni en el portal de reservas.`)) return;
    const empMatch = (admin.employees||[]).find(e=>e.name===s);
    setAdmin(a => {
      const next = {
        ...a,
        stylists: a.stylists.filter(x=>x!==s),
      };
      if (empMatch) {
        next.employees = a.employees.filter(e=>e.id!==empMatch.id);
        next.archivedEmployees = [...(a.archivedEmployees||[]), {...empMatch, archivedAt:Date.now()}];
        const chairs = {...(a.chairAssignments||{})};
        Object.keys(chairs).forEach(k=>{ if (chairs[k]===empMatch.id) delete chairs[k]; });
        next.chairAssignments = chairs;
      }
      return next;
    });
  };

  return (
    <div>
      <PageHeader title="Configuración" subtitle="Panel · Ajustes" />
      <div style={{padding:"24px 32px",display:"flex",flexDirection:"column",gap:20,maxWidth:600}}>

        {/* Salon name */}
        <Card>
          <Mono style={{color:C.gold,display:"block",marginBottom:16}}>Información del salón</Mono>
          <FieldInput label="Nombre del salón" value={admin.salonName||"JOXE"}
            onChange={e=>setAdmin(a=>({...a,salonName:e.target.value}))} />
          <div style={{marginTop:12,fontSize:12,color:C.muted}}>
            Aparece en el encabezado del panel.
          </div>
        </Card>

        {/* Stylists */}
        <Card>
          <Mono style={{color:C.gold,display:"block",marginBottom:16}}>Estilistas</Mono>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16}}>
            {(admin.stylists||[]).map(s=>{
              const empMatch = (admin.employees||[]).find(e=>e.name===s);
              return (
                <div key={s} style={{
                  display:"flex",justifyContent:"space-between",alignItems:"center",
                  padding:"10px 14px",background:C.s2,border:`1px solid ${C.bdr}`,
                }}>
                  <span style={{fontSize:14}}>{s}</span>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {empMatch && (
                      <button onClick={()=>onNav("stylist-settings",empMatch.id)} style={{
                        background:C.s3,border:`1px solid ${C.bdr}`,
                        color:C.muted,cursor:"pointer",padding:"5px 12px",
                        fontFamily:"'Outfit',sans-serif",fontSize:10,
                        letterSpacing:"0.06em",display:"flex",alignItems:"center",gap:5,
                      }} title="Configurar estilista">
                        ⚙ Configurar
                      </button>
                    )}
                    <button onClick={()=>deleteStylist(s)} style={{
                      background:"transparent",border:`1px solid ${C.bdr}`,color:C.red||"#c46666",
                      cursor:"pointer",fontSize:11,padding:"4px 10px",
                      fontFamily:"'Outfit',sans-serif",letterSpacing:"0.05em",
                    }} title="Eliminar estilista">Eliminar</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",gap:10}}>
            <FieldInput value={newStylist} onChange={e=>setNewStylist(e.target.value)}
              placeholder="Nombre del estilista" style={{flex:1}} />
            <Btn onClick={addStylist} disabled={!newStylist.trim()}>Agregar</Btn>
          </div>
        </Card>

        {/* Loyalty program */}
        <Card>
          <Mono style={{color:C.gold,display:"block",marginBottom:16}}>Programa de lealtad</Mono>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16}}>
              <div>
                <div style={{fontSize:14}}>Acumular visitas para un premio</div>
                <div style={{fontSize:12,color:C.muted,marginTop:4}}>
                  Los clientes acumulan visitas y canjean un servicio gratis al llegar al objetivo.
                </div>
              </div>
              <button onClick={()=>setAdmin(a=>({...a,loyalty:{...(a.loyalty||{}),enabled:!(a.loyalty?.enabled)}}))}
                style={{
                  padding:"8px 18px",flexShrink:0,
                  background:admin.loyalty?.enabled?"rgba(102,196,153,0.1)":C.s3,
                  border:`1px solid ${admin.loyalty?.enabled?C.green+"40":C.bdr}`,
                  color:admin.loyalty?.enabled?C.green:C.muted,
                  cursor:"pointer",fontFamily:"'JetBrains Mono',monospace",
                  fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",
                }}>
                {admin.loyalty?.enabled?"Activo":"Inactivo"}
              </button>
            </div>

            {admin.loyalty?.enabled && (
              <>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <FieldInput label="Visitas para el premio" type="number"
                    value={admin.loyalty?.target??10} min="1" max="50"
                    onChange={e=>setAdmin(a=>({...a,loyalty:{...(a.loyalty||{}),target:Number(e.target.value)||10}}))} />
                  <FieldInput label="Descripción del premio"
                    value={admin.loyalty?.reward??"Corte gratis"}
                    onChange={e=>setAdmin(a=>({...a,loyalty:{...(a.loyalty||{}),reward:e.target.value}}))}
                    placeholder="Corte gratis" />
                </div>
                <div style={{padding:"12px 14px",background:C.s2,border:`1px solid ${C.bdr}`,fontSize:13,color:C.muted}}>
                  Al llegar a <strong style={{color:C.text}}>{admin.loyalty?.target??10}</strong> visitas acumuladas,
                  el cliente obtiene: <strong style={{color:C.gold}}>{admin.loyalty?.reward??"Corte gratis"}</strong>.
                  Puedes sumar o restar visitas manualmente desde el panel CRM.
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Self-service cancelación */}
        <Card>
          <Mono style={{color:C.gold,display:"block",marginBottom:16}}>Autoservicio del cliente</Mono>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16}}>
              <div>
                <div style={{fontSize:14}}>Permitir que el cliente cancele su cita</div>
                <div style={{fontSize:12,color:C.muted,marginTop:4}}>
                  Desde "Mi Cuenta", el cliente podrá cancelar sus citas próximas. Reagendar se coordina por WhatsApp.
                </div>
              </div>
              <button onClick={()=>setAdmin(a=>({...a,selfService:{...(a.selfService||{}),allowCancel:!(a.selfService?.allowCancel!==false)}}))}
                style={{
                  padding:"8px 18px",flexShrink:0,
                  background:admin.selfService?.allowCancel!==false?"rgba(102,196,153,0.1)":C.s3,
                  border:`1px solid ${admin.selfService?.allowCancel!==false?C.green+"40":C.bdr}`,
                  color:admin.selfService?.allowCancel!==false?C.green:C.muted,
                  cursor:"pointer",fontFamily:"'JetBrains Mono',monospace",
                  fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",
                }}>
                {admin.selfService?.allowCancel!==false?"Activo":"Inactivo"}
              </button>
            </div>
            {admin.selfService?.allowCancel!==false && (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <FieldInput label="Horas mínimas antes de la cita" type="number" min="0" max="72"
                  value={admin.selfService?.minHoursBefore??2}
                  onChange={e=>setAdmin(a=>({...a,selfService:{...(a.selfService||{}),minHoursBefore:Number(e.target.value)||0}}))} />
                <div style={{alignSelf:"end",fontSize:12,color:C.muted}}>
                  El cliente no podrá cancelar si faltan menos de <strong style={{color:C.text}}>{admin.selfService?.minHoursBefore??2}h</strong>.
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* No-show fines */}
        <Card>
          <Mono style={{color:C.gold,display:"block",marginBottom:16}}>Multas por incumplimiento</Mono>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16}}>
              <div>
                <div style={{fontSize:14}}>Cobrar multa al cliente que no se presenta</div>
                <div style={{fontSize:12,color:C.muted,marginTop:4}}>
                  El valor de la multa se puede ajustar por día de la semana.
                </div>
              </div>
              <button
                onClick={()=>setAdmin(a=>({...a,noShowFine:{...(a.noShowFine||{}),enabled:!(a.noShowFine?.enabled)}}))}
                style={{
                  padding:"8px 18px",flexShrink:0,
                  background:admin.noShowFine?.enabled?"rgba(196,102,102,0.1)":C.s3,
                  border:`1px solid ${admin.noShowFine?.enabled?C.red+"50":C.bdr}`,
                  color:admin.noShowFine?.enabled?C.red:C.muted,
                  cursor:"pointer",fontFamily:"'JetBrains Mono',monospace",
                  fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",
                }}>
                {admin.noShowFine?.enabled?"Activo":"Inactivo"}
              </button>
            </div>

            {admin.noShowFine?.enabled && (() => {
              const DAYS = [
                {key:"lun",label:"Lunes"},
                {key:"mar",label:"Martes"},
                {key:"mie",label:"Miércoles"},
                {key:"jue",label:"Jueves"},
                {key:"vie",label:"Viernes"},
                {key:"sab",label:"Sábado"},
                {key:"dom",label:"Domingo"},
              ];
              const fines = admin.noShowFine?.byDay || {};
              const defaultVal = admin.noShowFine?.defaultAmount ?? 0;
              return (
                <>
                  <FieldInput
                    label="Valor por defecto (todos los días)"
                    type="number"
                    value={defaultVal}
                    min="0"
                    onChange={e=>setAdmin(a=>({...a,noShowFine:{
                      ...(a.noShowFine||{}),
                      defaultAmount:Number(e.target.value)||0,
                    }}))}
                    placeholder="0"
                  />
                  <div>
                    <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:10}}>
                      Valor por día (deja en 0 para usar el valor por defecto)
                    </Mono>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {DAYS.map(({key,label})=>{
                        const val = fines[key] ?? "";
                        return (
                          <div key={key} style={{
                            display:"grid",gridTemplateColumns:"120px 1fr",
                            alignItems:"center",gap:12,
                            padding:"10px 14px",background:C.s2,border:`1px solid ${C.bdr}`,
                          }}>
                            <div style={{fontSize:13,color:C.text}}>{label}</div>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <span style={{color:C.muted,fontSize:13}}>$</span>
                              <input
                                type="number"
                                min="0"
                                value={val}
                                placeholder={String(defaultVal||0)}
                                onChange={e=>setAdmin(a=>({...a,noShowFine:{
                                  ...(a.noShowFine||{}),
                                  byDay:{...(a.noShowFine?.byDay||{}),[key]:Number(e.target.value)||0},
                                }}))}
                                style={{
                                  background:"transparent",border:`1px solid ${C.bdr}`,
                                  color:C.text,padding:"6px 10px",
                                  fontFamily:"'Outfit',sans-serif",fontSize:14,
                                  width:"100%",
                                }}
                              />
                              {val > 0 && val !== defaultVal && (
                                <Mono style={{fontSize:9,color:C.gold,whiteSpace:"nowrap"}}>
                                  {fmtCOP(val)}
                                </Mono>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{padding:"12px 14px",background:C.s2,border:`1px solid ${C.bdr}`,fontSize:13,color:C.muted,lineHeight:1.6}}>
                    La multa se registra manualmente desde el detalle de la cita marcada como incumplida.
                    Puedes ver y gestionar las multas pendientes en el módulo de <strong style={{color:C.text}}>Caja</strong>.
                  </div>
                </>
              );
            })()}
          </div>
        </Card>

        {/* WhatsApp blob */}
        <Card>
          <Mono style={{color:C.gold,display:"block",marginBottom:16}}>WhatsApp</Mono>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <FieldInput
              label="Número del admin (recibe confirmaciones de reservas)"
              value={admin.whatsappAdminNumber||"573124499862"}
              onChange={e=>setAdmin(a=>({...a,whatsappAdminNumber:e.target.value.replace(/\D/g,"")}))}
              placeholder="573124499862"
            />
            <FieldInput
              label="Número de contacto (botón flotante para clientes)"
              value={admin.whatsappNumber||"573124499862"}
              onChange={e=>setAdmin(a=>({...a,whatsappNumber:e.target.value.replace(/\D/g,"")}))}
              placeholder="573124499862"
            />
            <FieldInput
              label="Etiqueta del botón (texto al pasar el cursor)"
              value={admin.whatsappMsg||"Escríbenos"}
              onChange={e=>setAdmin(a=>({...a,whatsappMsg:e.target.value}))}
              placeholder="Escríbenos"
            />
            <FieldInput
              label="Mensaje predeterminado al abrir el chat"
              value={admin.whatsappChatMsg||""}
              onChange={e=>setAdmin(a=>({...a,whatsappChatMsg:e.target.value}))}
              placeholder="Hola, me gustaría reservar una cita..."
            />
            <div style={{padding:"12px 14px",background:C.s2,border:`1px solid ${C.bdr}`,fontSize:13,color:C.muted}}>
              Las reservas del portal llegarán a{" "}
              <strong style={{color:C.text}}>
                wa.me/{admin.whatsappAdminNumber||"573124499862"}
              </strong>. El botón flotante apuntará a{" "}
              <strong style={{color:C.text}}>
                wa.me/{admin.whatsappNumber||"573124499862"}
              </strong>
              {admin.whatsappChatMsg ? (
                <> con el mensaje: <strong style={{color:C.gold}}>"{admin.whatsappChatMsg}"</strong></>
              ) : (
                <> sin mensaje predeterminado</>
              )}.
            </div>
          </div>
        </Card>

        {/* Push notifications */}
        <NotificationsCard />

        {/* Dispositivos de todos los empleados (solo admin) */}
        <AllDevicesCard />

        {/* Backup de la base de datos */}
        <Card>
          <Mono style={{color:C.gold,display:"block",marginBottom:16}}>Copia de seguridad</Mono>
          <div style={{fontSize:13,color:C.muted,marginBottom:16}}>
            Descargá un respaldo completo de todos los datos (turnos, clientes, configuración)
            en un archivo JSON, o restaurá desde un respaldo anterior.
          </div>
          {backupMsg && (
            <div style={{
              marginBottom:14,padding:"10px 14px",fontSize:13,
              background:backupMsg.type==="error"?"rgba(196,102,102,0.1)":"rgba(102,196,153,0.1)",
              border:`1px solid ${backupMsg.type==="error"?C.red+"40":C.green+"40"}`,
              color:backupMsg.type==="error"?C.red:C.green,
            }}>{backupMsg.text}</div>
          )}
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <Btn onClick={downloadBackup}>↓ Descargar backup</Btn>
            <Btn variant="ghost" onClick={()=>restoreRef.current?.click()}>↑ Restaurar desde archivo</Btn>
            <input ref={restoreRef} type="file" accept="application/json,.json"
              onChange={restoreBackup} style={{display:"none"}} />
          </div>
        </Card>

        {/* Change password */}
        <Card>
          <Mono style={{color:C.gold,display:"block",marginBottom:16}}>Cambiar contraseña</Mono>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <FieldInput label="Contraseña actual" type="password" value={pwForm.current}
              onChange={e=>setPwForm({...pwForm,current:e.target.value})} placeholder="••••••••" />
            <FieldInput label="Nueva contraseña" type="password" value={pwForm.newPw}
              onChange={e=>setPwForm({...pwForm,newPw:e.target.value})} placeholder="••••••••" />
            <FieldInput label="Confirmar nueva contraseña" type="password" value={pwForm.confirm}
              onChange={e=>setPwForm({...pwForm,confirm:e.target.value})} placeholder="••••••••" />
          </div>
          {pwMsg && (
            <div style={{
              marginTop:12,padding:"10px 14px",fontSize:13,
              background:pwMsg.type==="error"?"rgba(196,102,102,0.1)":"rgba(102,196,153,0.1)",
              border:`1px solid ${pwMsg.type==="error"?C.red+"40":C.green+"40"}`,
              color:pwMsg.type==="error"?C.red:C.green,
            }}>{pwMsg.text}</div>
          )}
          <Btn onClick={changePw}
            disabled={!pwForm.current||!pwForm.newPw||!pwForm.confirm}
            style={{marginTop:16}}>
            Actualizar contraseña
          </Btn>
        </Card>

        {/* Danger zone */}
        <Card>
          <Mono style={{color:C.red,display:"block",marginBottom:16}}>Zona de peligro</Mono>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{fontSize:13,color:C.muted,marginBottom:6}}>
              Estas acciones eliminan datos permanentemente.
            </div>
            <Btn variant="danger" onClick={()=>{
              if (confirm("¿Borrar TODOS los ingresos registrados? Esta acción no se puede deshacer."))
                setAdmin(a=>({...a,revenue:[]}));
            }}>Borrar todos los ingresos</Btn>
            <Btn variant="danger" onClick={async ()=>{
              if (confirm("¿Borrar TODAS las citas y turnos? Esta acción no se puede deshacer.")) {
                await setAppts({ appointments:[], active:[], completed:[], blockedSlots:[] });
                window.location.reload();
              }
            }}>Borrar todas las citas y turnos</Btn>
          </div>
        </Card>

        {/* QR de puestos */}
        <Card style={{maxWidth:"none"}}>
          <Mono style={{color:C.gold,display:"block",marginBottom:4}}>QR de puestos</Mono>
          <div style={{fontSize:13,color:C.muted,marginBottom:20,lineHeight:1.5}}>
            Define cuántos puestos tiene el salón y asigna un empleado a cada uno. El QR está atado al puesto — si cambia el trabajador, imprime de nuevo o reasigna sin cambiar el código.
          </div>

          {/* Número de puestos */}
          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:28}}>
            <Mono style={{fontSize:10,color:C.muted}}>Puestos disponibles</Mono>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <button
                onClick={()=>setAdmin(a=>({...a,chairsCount:Math.max(1,(a.chairsCount||1)-1)}))}
                style={{width:32,height:32,background:C.s3,border:`1px solid ${C.bdr}`,
                  color:C.text,cursor:"pointer",fontSize:16,fontFamily:"monospace"}}>−</button>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:20,color:C.gold,minWidth:24,textAlign:"center"}}>
                {admin.chairsCount||1}
              </span>
              <button
                onClick={()=>setAdmin(a=>({...a,chairsCount:Math.min(20,(a.chairsCount||1)+1)}))}
                style={{width:32,height:32,background:C.s3,border:`1px solid ${C.bdr}`,
                  color:C.text,cursor:"pointer",fontSize:16,fontFamily:"monospace"}}>+</button>
            </div>
          </div>

          {/* Grid de puestos */}
          <div style={{display:"flex",flexWrap:"wrap",gap:24}}>
            {Array.from({length:admin.chairsCount||1},(_,i)=>{
              const num = i+1;
              const assignedId = (admin.chairAssignments||{})[num] || "";
              const assignedEmp = assignedId ? (admin.employees||[]).find(e=>e.id===assignedId) : null;
              const activeEmps = (admin.employees||[]).filter(e=>e.active!==false);
              return (
                <div key={num} style={{
                  background:C.s1,border:`1px solid ${assignedEmp?C.gold+"40":C.bdr}`,
                  padding:"20px 18px",display:"flex",flexDirection:"column",
                  alignItems:"center",gap:14,minWidth:190,
                }}>
                  <Mono style={{fontSize:9,color:C.gold,background:"rgba(194,158,102,0.1)",
                    border:`1px solid ${C.gold}30`,padding:"2px 12px",letterSpacing:"0.15em"}}>
                    PUESTO {num}
                  </Mono>

                  {/* Selector de empleado */}
                  <select
                    value={assignedId}
                    onChange={e=>setAdmin(a=>({...a,
                      chairAssignments:{...(a.chairAssignments||{}),[num]:e.target.value||null}
                    }))}
                    style={{
                      width:"100%",background:C.s2,border:`1px solid ${C.bdr}`,
                      color:assignedEmp?C.text:C.muted,
                      fontFamily:"'Outfit',sans-serif",fontSize:13,
                      padding:"7px 10px",cursor:"pointer",
                    }}>
                    <option value="">— Sin asignar —</option>
                    {activeEmps.map(e=>(
                      <option key={e.id} value={e.id}>{e.name} · {e.role}</option>
                    ))}
                  </select>

                  {/* QR */}
                  {assignedEmp
                    ? <>
                        <div style={{fontFamily:"'Marcellus',serif",fontSize:16,color:C.text,textAlign:"center"}}>
                          {assignedEmp.name}
                        </div>
                        <ChairQRCode empName={assignedEmp.name} chairNum={num} size={150} />
                      </>
                    : <div style={{
                        width:150,height:150,background:C.s2,border:`1px dashed ${C.bdr}`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                      }}>
                        <Mono style={{fontSize:9,color:C.muted,textAlign:"center",lineHeight:1.8}}>
                          Asigna un<br/>empleado
                        </Mono>
                      </div>
                  }
                </div>
              );
            })}
          </div>
        </Card>

        {/* Links */}
        <Card>
          <Mono style={{color:C.gold,display:"block",marginBottom:16}}>Accesos rápidos</Mono>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[
              {label:"Portal de reservas (cliente)",href:"Booking.html"},
              {label:"Escáner QR (recepción)",href:"Scan.html"},
              {label:"Pantalla de sala (lobby)",href:"Lobby.html"},
              {label:"Página principal",href:"Asesores de Imagen.html"},
            ].map(l=>(
              <a key={l.href} href={l.href} target="_blank" rel="noopener" style={{
                display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"10px 14px",background:C.s2,border:`1px solid ${C.bdr}`,
                color:C.text,textDecoration:"none",
                fontFamily:"'Outfit',sans-serif",fontSize:13,
              }}>
                {l.label}
                <span style={{color:C.muted,fontSize:11}}>↗</span>
              </a>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

const HelpView = () => {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);
  const isInApp = isInAppBrowser();

  const Step = ({ n, text }) => (
    <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
      <div style={{
        width:26,height:26,flexShrink:0,borderRadius:"50%",
        background:"rgba(194,158,102,0.12)",border:`1px solid ${C.gold}40`,
        display:"flex",alignItems:"center",justifyContent:"center",
        fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:C.gold,
      }}>{n}</div>
      <div style={{fontSize:14,lineHeight:1.6,color:C.text,paddingTop:3}}>{text}</div>
    </div>
  );

  const Section = ({ title, badge, badgeColor, children }) => (
    <Card>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
        <Mono style={{color:C.gold,fontSize:13}}>{title}</Mono>
        {badge && (
          <span style={{
            padding:"2px 8px",fontSize:10,fontFamily:"'JetBrains Mono',monospace",
            background:`${badgeColor}18`,border:`1px solid ${badgeColor}40`,
            color:badgeColor,letterSpacing:"0.08em",textTransform:"uppercase",
          }}>{badge}</span>
        )}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>{children}</div>
    </Card>
  );

  return (
    <div>
      <PageHeader title="Ayuda" subtitle="Panel · Guías" />
      <div style={{padding:"24px 32px",display:"flex",flexDirection:"column",gap:20,maxWidth:640}}>

        {isInApp && (
          <Section title="Notificaciones push" badge="Abrir en navegador" badgeColor={C.red}>
            <div style={{fontSize:13,color:C.muted,lineHeight:1.6,marginBottom:4}}>
              Estás viendo el panel dentro del navegador de <strong style={{color:C.text}}>Instagram / WhatsApp</strong>,
              que no permite activar notificaciones ni instalar la app. Ábrelo en Safari o Chrome.
            </div>
            <Step n="1" text={<>Toca el menú <strong style={{color:C.text}}>⋯</strong> (arriba a la derecha) y elige <strong style={{color:C.text}}>"Abrir en el navegador"</strong>.</>} />
            <Step n="2" text={<>Ya en <strong style={{color:C.text}}>Safari</strong> (iPhone) o <strong style={{color:C.text}}>Chrome</strong> (Android), vuelve a <strong style={{color:C.text}}>/admin</strong>.</>} />
            <Step n="3" text={<>Sigue los pasos de tu dispositivo para activar las notificaciones.</>} />
          </Section>
        )}

        {!isInApp && (isIos || (!isIos && !isAndroid)) && (
          <Section title="Notificaciones push" badge="iPhone · iOS" badgeColor={C.gold}>
            <div style={{fontSize:13,color:C.muted,lineHeight:1.6,marginBottom:4}}>
              En iPhone las notificaciones requieren que el panel esté instalado como app.
              Solo hay que hacerlo una vez por dispositivo.
            </div>
            <Step n="1" text={<>Abre <strong style={{color:C.text}}>/admin</strong> en <strong style={{color:C.text}}>Safari</strong> (no Chrome ni otro navegador).</>} />
            <Step n="2" text={<>Toca el botón <strong style={{color:C.text}}>Compartir</strong> (el cuadrado con la flecha hacia arriba) en la barra inferior.</>} />
            <Step n="3" text={<>Selecciona <strong style={{color:C.text}}>"Agregar a inicio"</strong> y confirma.</>} />
            <Step n="4" text={<>Cierra Safari y abre la app <strong style={{color:C.text}}>JOXE Admin</strong> desde el Home Screen.</>} />
            <Step n="5" text={<>Inicia sesión, ve a <strong style={{color:C.text}}>Configuración → Notificaciones push</strong> y activa el toggle.</>} />
            <Step n="6" text={<>Acepta el permiso cuando el sistema lo solicite.</>} />
            <div style={{
              padding:"12px 14px",fontSize:12,color:C.muted,lineHeight:1.6,
              background:"rgba(194,158,102,0.05)",border:`1px solid ${C.gold}20`,
            }}>
              A partir de ese momento recibirás una notificación cada vez que alguien haga una reserva, aunque el teléfono esté bloqueado.
            </div>
          </Section>
        )}

        {!isInApp && (isAndroid || (!isIos && !isAndroid)) && (
          <Section title="Notificaciones push" badge="Android" badgeColor={C.green}>
            <div style={{fontSize:13,color:C.muted,lineHeight:1.6,marginBottom:4}}>
              En Android no es necesario instalar nada — funciona directamente desde Chrome.
            </div>
            <Step n="1" text={<>Abre <strong style={{color:C.text}}>/admin</strong> en <strong style={{color:C.text}}>Chrome</strong>.</>} />
            <Step n="2" text={<>Inicia sesión con tu contraseña de administrador.</>} />
            <Step n="3" text={<>Ve a <strong style={{color:C.text}}>Configuración → Notificaciones push</strong> y activa el toggle.</>} />
            <Step n="4" text={<>Acepta el permiso cuando Chrome lo solicite.</>} />
            <div style={{
              padding:"12px 14px",fontSize:12,color:C.muted,lineHeight:1.6,
              background:"rgba(102,196,153,0.05)",border:`1px solid ${C.green}20`,
            }}>
              Las notificaciones llegarán aunque Chrome esté cerrado. No hay que volver a configurarlo.
            </div>
          </Section>
        )}

        {!isInApp && !isIos && !isAndroid && (
          <Section title="Notificaciones push" badge="Escritorio" badgeColor="#8ab0ff">
            <div style={{fontSize:13,color:C.muted,lineHeight:1.6,marginBottom:4}}>
              También puedes activar notificaciones en un computador con Chrome o Edge.
            </div>
            <Step n="1" text={<>Ve a <strong style={{color:C.text}}>Configuración → Notificaciones push</strong> y activa el toggle.</>} />
            <Step n="2" text={<>Acepta el permiso del navegador.</>} />
          </Section>
        )}

        <Section title="Reservar turnos por el staff" badge="Nuevo" badgeColor={C.gold}>
          <div style={{fontSize:13,color:C.muted,lineHeight:1.6,marginBottom:4}}>
            Cuando el cliente no puede usar el sitio web, cada empleado puede agendar el turno
            por su cuenta desde <strong style={{color:C.text}}>/staff</strong>. El bloque se aparta
            automáticamente en su calendario según la duración del servicio.
          </div>
          <Step n="1" text={<>El empleado entra a <strong style={{color:C.text}}>/staff</strong> e inicia sesión con su PIN.</>} />
          <Step n="2" text={<>Abre <strong style={{color:C.text}}>Reservar turno</strong> (en el menú lateral o con el botón <strong style={{color:C.text}}>+ Reservar turno</strong> de Mi Agenda).</>} />
          <Step n="3" text={<>Ingresa el <strong style={{color:C.text}}>celular</strong> del cliente (obligatorio — es lo que lo identifica). Si ya tiene citas, su nombre aparece solo; si el celular es nuevo, el nombre es obligatorio.</>} />
          <Step n="4" text={<>Elige el <strong style={{color:C.text}}>servicio</strong>; la duración se toma del catálogo.</>} />
          <Step n="5" text={<>Selecciona el <strong style={{color:C.text}}>día</strong> y toca una hora libre: el <strong style={{color:C.text}}>bloque se acomoda solo</strong> (ej. un servicio de 180 min aparta 14:00–17:00).</>} />
          <Step n="6" text={<>Confirma con <strong style={{color:C.text}}>Reservar turno</strong>. La cita queda agendada y confirmada a nombre de ese empleado.</>} />
          <div style={{
            padding:"12px 14px",fontSize:12,color:C.muted,lineHeight:1.6,
            background:"rgba(194,158,102,0.05)",border:`1px solid ${C.gold}20`,
          }}>
            La línea de tiempo respeta las citas ya agendadas, los horarios bloqueados, la hora de cierre
            y el horario laboral del empleado — los espacios que no alcanzan a caber se marcan como
            "No alcanza" y no se pueden elegir.
          </div>
        </Section>

        <Section title="Preguntas frecuentes">
          {[
            {
              q:"¿Una cita reservada por el staff entra a 'Confirmar citas'?",
              a:"No. Como la crea el empleado en mano, queda confirmada de inmediato y no aparece en la lista de pendientes por confirmar.",
            },
            {
              q:"¿Cómo se distingue al cliente si no se pide la cédula en /staff?",
              a:"Por el número de celular. El CRM agrupa por cédula y, cuando no hay, usa el teléfono — así el cliente queda correctamente identificado por su número.",
            },
            {
              q:"¿Cuántos dispositivos pueden recibir notificaciones?",
              a:"No hay límite. Puedes activarlo en el iPhone del dueño, el Android de un empleado, una tablet en recepción — todos reciben el aviso al mismo tiempo.",
            },
            {
              q:"¿Las notificaciones se detienen si cierro sesión?",
              a:"No. La suscripción vive de forma independiente a la sesión. Una vez activada, sigue funcionando aunque no estés logueado.",
            },
            {
              q:"¿Cómo desactivo las notificaciones?",
              a:"Ve a Configuración → Notificaciones push y toca el toggle para desactivarlas en ese dispositivo.",
            },
            {
              q:"En iPhone no aparece el toggle de notificaciones.",
              a:"Asegúrate de estar abriendo el panel desde el ícono del Home Screen, no desde Safari directamente.",
            },
          ].map(({ q, a }) => (
            <div key={q} style={{borderBottom:`1px solid ${C.bdr}`,paddingBottom:14}}>
              <div style={{fontSize:13,fontWeight:500,marginBottom:6}}>{q}</div>
              <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>{a}</div>
            </div>
          ))}
        </Section>

      </div>
    </div>
  );
};

// ==================== EMPLOYEE VIEWS ====================
// Single source of truth: appointment needs employee confirmation
const empNeedsConfirm = (a) =>
  a.computedStatus === "pending" ||
  a.computedStatus === "expired" ||
  (a.computedStatus === "scheduled" && !a.confirmedBy);

const EmpDashboardView = ({emp, onNav}) => {
  const [appts]  = useAppts();
  const [admin]  = useAdmin();
  const todayD   = todayStr();

  const allAppts = getAllAppts(appts, admin.cancelledIds||[], admin.noShowIds||[]);
  const myAppts  = allAppts.filter(a=>a.stylist===emp.name);
  const todayAll = myAppts.filter(a=>a.date===todayD);
  const pending  = myAppts.filter(a=>a.computedStatus==="pending"||(a.computedStatus==="scheduled"&&!a.confirmedBy));
  const upcoming = myAppts.filter(a=>a.date>todayD&&a.computedStatus==="scheduled").slice(0,5);
  const todayRevenue = (admin.revenue||[])
    .filter(r=>r.date===todayD&&r.stylist===emp.name)
    .reduce((s,r)=>s+Number(r.amount||0),0);

  return (
    <div>
      <PageHeader
        title={emp.name}
        subtitle={emp.role+" · Mi panel"}
      />
      <div style={{padding:"24px 32px"}}>
        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:16,marginBottom:32}}>
          <StatCard label="Mis citas hoy"
            value={String(todayAll.filter(a=>!["cancelled","completed"].includes(a.computedStatus)).length).padStart(2,"0")} />
          <StatCard label="Pendientes confirmar"
            value={String(pending.length).padStart(2,"0")}
            color={pending.length>0?C.gold:C.muted} />
          <StatCard label="Completadas hoy"
            value={String(todayAll.filter(a=>a.computedStatus==="completed").length).padStart(2,"0")}
            color={C.green} />
          <StatCard label="Ingresos hoy"
            value={todayRevenue>0?fmtCOP(todayRevenue):"$0"}
            color={todayRevenue>0?C.green:C.muted} small />
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1.2fr 1fr",gap:20}}>
          {/* Today */}
          <Card>
            <Mono style={{color:C.gold,display:"block",marginBottom:16}}>
              Hoy · {fmtDateMed(todayD)}
            </Mono>
            {todayAll.length===0 ? (
              <div style={{textAlign:"center",padding:"32px 0",color:C.muted}}>
                <div style={{fontSize:28,marginBottom:8}}>—</div>
                <Mono style={{fontSize:10}}>Sin citas hoy</Mono>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {todayAll.map(a=>(
                  <div key={a.id} style={{
                    display:"grid",gridTemplateColumns:"50px 1fr auto",gap:10,
                    padding:"12px 14px",background:C.s2,alignItems:"center",
                  }}>
                    <Mono style={{color:C.gold,fontSize:12}}>{formatTime12h(a.time)}</Mono>
                    <div>
                      <div style={{fontSize:14}}>{a.name}</div>
                      <div style={{fontSize:11,color:C.muted}}>{a.service}</div>
                    </div>
                    <Badge status={a.computedStatus}/>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {/* Pending confirmation */}
            {pending.length>0 && (
              <Card style={{borderColor:C.gold+"40"}}>
                <Mono style={{color:C.gold,display:"block",marginBottom:12}}>
                  ⚠ Confirmar · {pending.length}
                </Mono>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {pending.slice(0,4).map(a=>(
                    <div key={a.id} style={{
                      padding:"10px 12px",background:C.s2,border:`1px solid ${C.gold}20`,
                    }}>
                      <div style={{fontSize:13}}>{a.name}</div>
                      <div style={{fontSize:11,color:C.muted}}>{fmtDateShort(a.date)} · {formatTime12h(a.time)} · {a.service}</div>
                    </div>
                  ))}
                </div>
                <button onClick={()=>onNav("confirmaciones")} style={{
                  marginTop:10,width:"100%",padding:"8px",background:"transparent",
                  border:`1px solid ${C.gold}40`,color:C.gold,cursor:"pointer",
                  fontFamily:"'Outfit',sans-serif",fontSize:12,letterSpacing:"0.08em",
                }}>Ver todas →</button>
              </Card>
            )}

            {/* Upcoming */}
            <Card>
              <Mono style={{color:C.gold,display:"block",marginBottom:12}}>Próximas</Mono>
              {upcoming.length===0 ? (
                <div style={{color:C.muted,fontSize:12}}>Sin citas futuras.</div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {upcoming.map(a=>(
                    <div key={a.id} style={{
                      display:"flex",justifyContent:"space-between",alignItems:"center",
                      padding:"8px 0",borderBottom:`1px solid ${C.bdr}`,
                    }}>
                      <div>
                        <div style={{fontSize:13}}>{a.name}</div>
                        <div style={{fontSize:11,color:C.muted}}>{a.service}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <Mono style={{color:C.gold,fontSize:10}}>{fmtDateShort(a.date)}</Mono>
                        <div style={{fontSize:11,color:C.muted,marginTop:2}}>{formatTime12h(a.time)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

const EmpAgendaView = ({emp, onNav}) => {
  const [appts, setAppts] = useAppts();
  const [admin]           = useAdmin();
  const todayD  = todayStr();
  const addDay  = (base, n) => { const d=new Date(base+"T12:00"); d.setDate(d.getDate()+n); return d.toISOString().split("T")[0]; };
  const dates   = [todayD, addDay(todayD,1), addDay(todayD,2)];

  const [activeDay,  setActiveDay]  = React.useState(0);
  const [expandedId, setExpandedId] = React.useState(null);

  const allAppts  = getAllAppts(appts, admin.cancelledIds||[], admin.noShowIds||[]);
  const myAppts   = allAppts.filter(a=>a.stylist===emp.name);

  const pendingCount = myAppts.filter(empNeedsConfirm).length;

  const todayAll = myAppts.filter(a=>a.date===todayD);
  const statsData = [
    ["Citas hoy",     todayAll.filter(a=>!["cancelled","completed"].includes(a.computedStatus)).length, null],
    ["Por confirmar", pendingCount, pendingCount>0?C.gold:null],
    ["Completadas",   todayAll.filter(a=>a.computedStatus==="completed").length, C.green],
  ];

  const confirmAppt = (apptId, isPending) => {
    const patch = (list) => list.map(a =>
      a.id===apptId
        ? {...a, status: isPending?"scheduled":a.status, confirmedBy:emp.name, confirmedAt:Date.now()}
        : a
    );
    setAppts(s=>({...s, appointments:patch(s.appointments), active:patch(s.active)}));
  };

  const cancelAppt = (apptId) => {
    if (!confirm("¿Cancelar esta cita?")) return;
    const patch = (list) => list.map(a =>
      a.id===apptId ? {...a, status:"cancelled", cancelledBy:emp.name, cancelledAt:Date.now()} : a
    );
    setAppts(s=>({...s, appointments:patch(s.appointments), active:patch(s.active)}));
  };

  const DAY_TAB_LABEL = (d, i) =>
    i===0 ? "Hoy" : i===1 ? "Mañana" :
    new Date(d+"T12:00").toLocaleDateString("es-CO",{weekday:"short",day:"numeric"});

  const DAY_HEADER_SUB = (d) =>
    new Date(d+"T12:00").toLocaleDateString("es-CO",{weekday:"long",day:"numeric",month:"long"});

  const statusColor = (s) =>
    s==="cancelled"?"#C46666":s==="completed"?"#66C499":
    s==="in-service"?"#66C499":s==="waiting"?"#8ab0ff":"#C29E66";

  const statusLabel = (s) =>
    s==="in-service"?"En silla":s==="waiting"?"En cola":
    s==="completed"?"Completada":s==="cancelled"?"Cancelada":"Agendada";

  const date     = dates[activeDay];
  const isToday  = date===todayD;
  // Las canceladas no se listan: solo hacen ruido en la agenda del día.
  const dayAppts = myAppts.filter(a=>a.date===date&&a.computedStatus!=="cancelled");

  const byTime = {};
  AGENDA_HOURS.forEach(t=>{ byTime[t]=[]; });
  dayAppts.forEach(a=>{ if(byTime[a.time]) byTime[a.time].push(a); else byTime[a.time]=[a]; });
  const toMin = (t)=>{ const [hh,mm]=t.split(":").map(Number); return hh*60+(mm||0); };
  const slots = Object.keys(byTime).sort((a,b)=>toMin(a)-toMin(b));

  const activeCount = dayAppts.length;

  return (
    <div>
      <PageHeader title="Mi Agenda" subtitle={DAY_TAB_LABEL(date,activeDay)+" · "+DAY_HEADER_SUB(date)}
        action={onNav&&<Btn small onClick={()=>onNav("reservar")}>+ Reservar turno</Btn>} />

      {/* Mini stats bar */}
      <div style={{display:"flex",gap:24,padding:"0 32px",borderBottom:`1px solid ${C.bdr}`}}>
        {statsData.map(([label,val,color])=>(
          <div key={label} style={{padding:"12px 0",display:"flex",gap:8,alignItems:"baseline"}}>
            <span style={{fontFamily:"'Marcellus',serif",fontSize:22,color:color||C.text}}>{val}</span>
            <Mono style={{color:C.muted,fontSize:9}}>{label}</Mono>
          </div>
        ))}
      </div>

      {/* Pending banner */}
      {pendingCount>0 && (
        <div style={{
          margin:"16px 32px 0",padding:"11px 18px",
          background:"rgba(194,158,102,0.07)",border:"1px solid rgba(194,158,102,0.35)",
          display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,
        }}>
          <Mono style={{color:C.gold,fontSize:10}}>
            ⚑ {pendingCount} cita{pendingCount>1?"s":""} por confirmar
          </Mono>
          <button onClick={()=>onNav&&onNav("confirmaciones")}
            style={{
              background:"transparent",border:`1px solid ${C.gold}50`,color:C.gold,
              padding:"5px 14px",cursor:"pointer",fontFamily:"'Outfit',sans-serif",
              fontSize:11,letterSpacing:"0.08em",
            }}>Ver →</button>
        </div>
      )}

      {/* Activar avisos push en el teléfono del empleado */}
      <div style={{padding:"16px 32px 0"}}>
        <NotificationsCard />
      </div>

      {/* Day tabs */}
      <div style={{display:"flex",gap:4,padding:"16px 32px 0"}}>
        {dates.map((d,i)=>{
          const cnt = myAppts.filter(a=>a.date===d&&a.computedStatus!=="cancelled").length;
          const hasPending = myAppts.some(a=>a.date===d&&empNeedsConfirm(a));
          return (
            <button key={d} onClick={()=>setActiveDay(i)} style={{
              padding:"8px 18px",
              background:i===activeDay?C.gold:"transparent",
              color:i===activeDay?"#0C0C0C":hasPending?C.gold:C.muted,
              border:`1px solid ${i===activeDay?C.gold:hasPending?C.gold+"50":C.bdr}`,
              cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:12,
              display:"flex",alignItems:"center",gap:8,
            }}>
              {DAY_TAB_LABEL(d,i)}
              {cnt>0 && (
                <span style={{
                  fontFamily:"'JetBrains Mono',monospace",fontSize:9,
                  background:i===activeDay?"rgba(12,12,12,0.2)":"rgba(194,158,102,0.15)",
                  padding:"1px 6px",
                }}>{cnt}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Day grid */}
      <div style={{padding:"16px 32px 32px"}}>
        <div style={{border:`1px solid ${isToday?C.gold:C.bdr}`,background:C.s1}}>
          {/* Day header */}
          <div style={{
            padding:"16px 20px",borderBottom:`1px solid ${C.bdr}`,
            background:isToday?"rgba(194,158,102,0.08)":C.s2,
            display:"flex",alignItems:"center",gap:12,
          }}>
            <div style={{fontFamily:"'Marcellus',serif",fontSize:24,color:isToday?C.gold:C.text}}>
              {DAY_TAB_LABEL(date,activeDay)}
            </div>
            <Mono style={{color:C.muted,fontSize:9,flex:1}}>{DAY_HEADER_SUB(date)}</Mono>
            <span style={{
              fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:C.gold,
              background:"rgba(194,158,102,0.1)",padding:"3px 10px",border:`1px solid ${C.gold}30`,
            }}>{activeCount} cita{activeCount!==1?"s":""}</span>
          </div>

          {/* Time rows — scroll vertical independiente (dedo en móvil, scroll en escritorio) */}
          <div style={{
            maxHeight:"60vh",
            overflowY:"auto",
            overscrollBehavior:"contain",
            WebkitOverflowScrolling:"touch",
            touchAction:"pan-y",
          }}>
          {slots.map(time=>{
            const slotAppts = byTime[time]||[];
            const [h,m]     = time.split(":").map(Number);
            const slotMin   = h*60+(m||0);
            const nowMin    = nowCOT().getHours()*60+nowCOT().getMinutes();
            const isPast    = isToday && slotMin < nowMin-30;

            return (
              <div key={time} style={{
                display:"grid",gridTemplateColumns:"76px 1fr",
                borderBottom:`1px solid ${C.bdr}`,
                opacity:isPast?0.4:1,
              }}>
                <div style={{
                  padding:"14px 0 14px 16px",borderRight:`1px solid ${C.bdr}`,
                  display:"flex",alignItems:"flex-start",
                }}>
                  <Mono style={{color:isPast?C.muted2:C.gold,fontSize:11}}>{formatTime12h(time)}</Mono>
                </div>

                <div style={{padding:"8px 12px",display:"flex",flexDirection:"column",gap:5}}>
                  {slotAppts.map(a=>{
                    const isPending = empNeedsConfirm(a);
                    const isExpanded = expandedId===a.id;
                    return (
                      <div key={a.id} style={{
                        padding:"8px 10px",
                        background:a.confirmedBy?"rgba(102,196,153,0.1)":isPending?"rgba(194,158,102,0.08)":"rgba(245,241,234,0.04)",
                        borderLeft:`3px solid ${a.confirmedBy?C.green:statusColor(a.computedStatus)}`,
                        cursor:a.phone?"pointer":"default",
                      }} onClick={()=>a.phone&&setExpandedId(id=>id===a.id?null:a.id)}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{
                              fontSize:13,color:a.computedStatus==="cancelled"?C.muted:C.text,
                              textDecoration:a.computedStatus==="cancelled"?"line-through":"none",
                            }}>{a.name}</div>
                            <div style={{fontSize:11,color:C.muted,marginTop:2}}>{a.service}</div>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                            {isPending && (
                              <button onClick={e=>{e.stopPropagation();confirmAppt(a.id,["pending","expired"].includes(a.computedStatus));}} style={{
                                padding:"4px 10px",
                                background:a.computedStatus==="expired"?"rgba(194,158,102,0.12)":"rgba(102,196,153,0.12)",
                                border:`1px solid ${a.computedStatus==="expired"?C.gold:C.green}40`,
                                color:a.computedStatus==="expired"?C.gold:C.green,
                                cursor:"pointer",fontFamily:"'JetBrains Mono',monospace",
                                fontSize:9,letterSpacing:"0.06em",
                              }}>{a.computedStatus==="expired"?"↺":"✓"}</button>
                            )}
                            {!isPending && !["cancelled","completed","no-show"].includes(a.computedStatus) && (
                              <button onClick={e=>{e.stopPropagation();cancelAppt(a.id);}} style={{
                                padding:"4px 8px",background:"transparent",
                                border:`1px solid ${C.red}30`,color:C.red,
                                cursor:"pointer",fontFamily:"'JetBrains Mono',monospace",
                                fontSize:9,letterSpacing:"0.06em",whiteSpace:"nowrap",
                              }}>✕ Cancelar cita</button>
                            )}
                            <div style={{textAlign:"right"}}>
                              <Mono style={{fontSize:9,color:statusColor(a.computedStatus)}}>
                                {statusLabel(a.computedStatus)}
                              </Mono>
                              {a.confirmedBy && (
                                <Mono style={{fontSize:8,color:C.green,display:"block",marginTop:2}}>✓ confirmada</Mono>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* Expandable phone */}
                        {isExpanded && a.phone && (
                          <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.bdr}`}}>
                            <a href={`https://wa.me/57${a.phone.replace(/\D/g,"")}`}
                              target="_blank" rel="noopener"
                              onClick={e=>e.stopPropagation()}
                              style={{fontSize:12,color:C.gold,textDecoration:"none",display:"inline-flex",alignItems:"center",gap:6}}>
                              {a.phone} ↗
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {slotAppts.length===0 && (
                    <div style={{fontSize:10,color:C.muted2,padding:"4px 0"}}>Libre</div>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
};

// Vista de mes: panorama de todo el mes para el empleado. Complementa a
// EmpAgendaView (que solo cubre hoy + 2 días) para planear con antelación.
const EmpCalendarView = ({emp, onNav}) => {
  const [appts]  = useAppts();
  const [admin]  = useAdmin();
  const todayD   = todayStr();

  const allAppts = getAllAppts(appts, admin.cancelledIds||[], admin.noShowIds||[]);
  const myAppts  = allAppts.filter(a=>a.stylist===emp.name);

  // Mes visible: primer día del mes como ancla.
  const [anchor, setAnchor] = React.useState(() => {
    const [y,m] = todayD.split("-").map(Number);
    return {y, m}; // m: 1-12
  });
  const [selected, setSelected] = React.useState(todayD);

  const shiftMonth = (n) => setAnchor(({y,m}) => {
    const d = new Date(y, m-1+n, 1);
    return {y:d.getFullYear(), m:d.getMonth()+1};
  });

  const pad2 = (n) => String(n).padStart(2,"0");
  const cellDate = (y,m,d) => `${y}-${pad2(m)}-${pad2(d)}`;

  const monthLabel = new Date(anchor.y, anchor.m-1, 1)
    .toLocaleDateString("es-CO",{month:"long",year:"numeric"});

  // Semana que empieza en lunes.
  const firstDow   = (new Date(anchor.y, anchor.m-1, 1).getDay() + 6) % 7;
  const daysInMon  = new Date(anchor.y, anchor.m, 0).getDate();
  const cells      = [];
  for (let i=0;i<firstDow;i++) cells.push(null);
  for (let d=1;d<=daysInMon;d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // Índice date -> citas del mes (sin canceladas: solo ensucian el conteo).
  const byDate = {};
  myAppts.forEach(a=>{
    if (a.computedStatus==="cancelled") return;
    (byDate[a.date] = byDate[a.date] || []).push(a);
  });

  const toMin = (t)=>{ const [hh,mm]=String(t||"").split(":").map(Number); return hh*60+(mm||0); };
  const statusColor = (s) =>
    s==="cancelled"?C.red:s==="completed"?C.green:
    s==="in-service"?C.green:s==="waiting"?C.blue:C.gold;
  const statusLabel = (s) =>
    s==="in-service"?"En silla":s==="waiting"?"En cola":
    s==="completed"?"Completada":s==="cancelled"?"Cancelada":"Agendada";

  const monthAppts   = Object.keys(byDate)
    .filter(d=>d.startsWith(`${anchor.y}-${pad2(anchor.m)}`))
    .reduce((n,d)=>n+byDate[d].length, 0);
  const monthPending = myAppts.filter(a =>
    a.date.startsWith(`${anchor.y}-${pad2(anchor.m)}`) && empNeedsConfirm(a)
  ).length;

  const selAppts = (byDate[selected]||[]).slice().sort((a,b)=>toMin(a.time)-toMin(b.time));
  const selLabel = new Date(selected+"T12:00")
    .toLocaleDateString("es-CO",{weekday:"long",day:"numeric",month:"long"});

  const DOW = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

  return (
    <div>
      <PageHeader title="Calendario" subtitle={"Vista de mes · "+monthLabel}
        action={onNav&&<Btn small onClick={()=>onNav("reservar")}>+ Reservar turno</Btn>} />

      {/* Mini stats bar */}
      <div style={{display:"flex",gap:24,padding:"0 32px",borderBottom:`1px solid ${C.bdr}`}}>
        {[
          ["Citas del mes", monthAppts, null],
          ["Por confirmar", monthPending, monthPending>0?C.gold:null],
        ].map(([label,val,color])=>(
          <div key={label} style={{padding:"12px 0",display:"flex",gap:8,alignItems:"baseline"}}>
            <span style={{fontFamily:"'Marcellus',serif",fontSize:22,color:color||C.text}}>{val}</span>
            <Mono style={{color:C.muted,fontSize:9}}>{label}</Mono>
          </div>
        ))}
      </div>

      {/* Navegación de mes */}
      <div style={{
        display:"flex",alignItems:"center",gap:12,padding:"16px 32px 0",
      }}>
        {[["‹",-1],["›",1]].map(([txt,delta])=>(
          <button key={txt} onClick={()=>shiftMonth(delta)} style={{
            padding:"6px 14px",background:"transparent",border:`1px solid ${C.bdr}`,
            color:C.muted,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:16,lineHeight:1,
            order: delta<0 ? 0 : 2,
          }}>{txt}</button>
        ))}
        <div style={{
          flex:1,order:1,textAlign:"center",
          fontFamily:"'Marcellus',serif",fontSize:20,textTransform:"capitalize",
        }}>{monthLabel}</div>
        <button onClick={()=>{
          const [y,m] = todayD.split("-").map(Number);
          setAnchor({y,m}); setSelected(todayD);
        }} style={{
          order:3,padding:"6px 14px",background:"transparent",
          border:`1px solid ${C.gold}40`,color:C.gold,cursor:"pointer",
          fontFamily:"'JetBrains Mono',monospace",fontSize:9,letterSpacing:"0.1em",textTransform:"uppercase",
        }}>Hoy</button>
      </div>

      {/* Rejilla del mes */}
      <div style={{padding:"16px 32px 0"}}>
        <div style={{
          display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",
          border:`1px solid ${C.bdr}`,background:C.s1,
        }}>
          {DOW.map(d=>(
            <div key={d} style={{
              padding:"10px 4px",textAlign:"center",background:C.s2,
              borderBottom:`1px solid ${C.bdr}`,
            }}>
              <Mono style={{fontSize:9,color:C.muted}}>{d}</Mono>
            </div>
          ))}

          {cells.map((d,i)=>{
            if (d===null) return (
              <div key={"e"+i} style={{
                minHeight:74,background:"rgba(245,241,234,0.02)",
                borderBottom:`1px solid ${C.bdr}`,borderRight:`1px solid ${C.bdr}`,
              }}/>
            );
            const ds        = cellDate(anchor.y, anchor.m, d);
            const dayAppts  = byDate[ds]||[];
            const isToday   = ds===todayD;
            const isSel     = ds===selected;
            const isPast    = ds<todayD;
            const hasPending= dayAppts.some(empNeedsConfirm);

            return (
              <button key={ds} onClick={()=>setSelected(ds)} style={{
                minHeight:74,padding:"6px 6px 8px",textAlign:"left",cursor:"pointer",
                background:isSel?"rgba(194,158,102,0.13)":isToday?"rgba(194,158,102,0.05)":"transparent",
                border:"none",
                borderBottom:`1px solid ${C.bdr}`,
                borderRight:`1px solid ${C.bdr}`,
                boxShadow:isSel?`inset 0 0 0 1px ${C.gold}`:"none",
                opacity:isPast&&!isSel?0.45:1,
                display:"flex",flexDirection:"column",gap:4,
                fontFamily:"'Outfit',sans-serif",
              }}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{
                    fontFamily:"'JetBrains Mono',monospace",fontSize:12,
                    color:isToday?C.gold:C.text,fontWeight:isToday?500:400,
                  }}>{d}</span>
                  {isToday && <span style={{
                    width:4,height:4,borderRadius:"50%",background:C.gold,flexShrink:0,
                  }}/>}
                </div>

                {dayAppts.length>0 && (
                  <>
                    <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                      {dayAppts.slice(0,4).map(a=>(
                        <span key={a.id} style={{
                          width:5,height:5,borderRadius:"50%",
                          background:empNeedsConfirm(a)?C.gold:statusColor(a.computedStatus),
                        }}/>
                      ))}
                    </div>
                    <Mono style={{
                      fontSize:8,letterSpacing:"0.06em",
                      color:hasPending?C.gold:C.muted,marginTop:"auto",
                    }}>{dayAppts.length} cita{dayAppts.length>1?"s":""}</Mono>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Detalle del día elegido */}
      <div style={{padding:"16px 32px 32px"}}>
        <div style={{border:`1px solid ${C.bdr}`,background:C.s1}}>
          <div style={{
            padding:"14px 20px",borderBottom:`1px solid ${C.bdr}`,background:C.s2,
            display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",
          }}>
            <div style={{
              fontFamily:"'Marcellus',serif",fontSize:18,
              color:selected===todayD?C.gold:C.text,textTransform:"capitalize",flex:1,
            }}>{selLabel}</div>
            <span style={{
              fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:C.gold,
              background:"rgba(194,158,102,0.1)",padding:"3px 10px",border:`1px solid ${C.gold}30`,
            }}>{selAppts.length} cita{selAppts.length!==1?"s":""}</span>
          </div>

          {selAppts.length===0 ? (
            <div style={{padding:"28px 20px",textAlign:"center"}}>
              <Mono style={{fontSize:10,color:C.muted2}}>Sin citas este día</Mono>
            </div>
          ) : selAppts.map(a=>(
            <div key={a.id} style={{
              display:"grid",gridTemplateColumns:"76px 1fr",
              borderBottom:`1px solid ${C.bdr}`,
            }}>
              <div style={{padding:"14px 0 14px 16px",borderRight:`1px solid ${C.bdr}`}}>
                <Mono style={{fontSize:11,color:C.gold}}>{formatTime12h(a.time)}</Mono>
              </div>
              <div style={{
                padding:"12px 16px",display:"flex",justifyContent:"space-between",
                alignItems:"flex-start",gap:10,
                background:empNeedsConfirm(a)?"rgba(194,158,102,0.06)":"transparent",
              }}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{fontSize:13,color:C.text}}>{a.name}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>{a.service}</div>
                  {a.phone && (
                    <a href={`https://wa.me/57${a.phone.replace(/\D/g,"")}`}
                      target="_blank" rel="noopener"
                      style={{fontSize:11,color:C.gold,textDecoration:"none",display:"inline-block",marginTop:6}}>
                      {a.phone} ↗
                    </a>
                  )}
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <Mono style={{fontSize:9,color:statusColor(a.computedStatus)}}>
                    {statusLabel(a.computedStatus)}
                  </Mono>
                  {empNeedsConfirm(a) && (
                    <Mono style={{fontSize:8,color:C.gold,display:"block",marginTop:3}}>Por confirmar</Mono>
                  )}
                  {a.confirmedBy && (
                    <Mono style={{fontSize:8,color:C.green,display:"block",marginTop:3}}>✓ confirmada</Mono>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const EmpAppointmentsView = ({emp, tab: initTab="todas"}) => {
  const [appts,setAppts] = useAppts();
  const [admin]          = useAdmin();
  const [tab,setTab]     = React.useState(initTab);
  const [search,setSearch] = React.useState("");

  const allAppts = getAllAppts(appts, admin.cancelledIds||[], admin.noShowIds||[]);
  const myAppts  = allAppts.filter(a=>a.stylist===emp.name);

  const needsConfirm = empNeedsConfirm;

  const filtered = myAppts.filter(a=>{
    if (tab==="confirmaciones") return needsConfirm(a);
    if (tab==="hoy") return a.date===todayStr();
    if (search) return a.name?.toLowerCase().includes(search.toLowerCase())||a.service?.toLowerCase().includes(search.toLowerCase());
    return true;
  }).sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(a.time||"").localeCompare(b.time||""));

  const confirmAppt = async (apptId, isPending) => {
    const confirmInList = (list) => list.map(a=>
      a.id===apptId
        ? {...a, status: isPending ? "scheduled" : a.status, confirmedBy:emp.name, confirmedAt:Date.now()}
        : a
    );
    setAppts(s=>({
      ...s,
      appointments: confirmInList(s.appointments),
      active: confirmInList(s.active),
    }));
  };

  const rejectAppt = async (apptId) => {
    if (!confirm("¿Rechazar esta cita? Se marcará como cancelada.")) return;
    setAppts(s=>({
      ...s,
      appointments: s.appointments.map(a=>a.id===apptId?{...a,status:"cancelled"}:a),
    }));
  };

  const cancelAppt = async (apptId) => {
    if (!confirm("¿Cancelar esta cita?")) return;
    const patch = (list) => list.map(a=>
      a.id===apptId ? {...a, status:"cancelled", cancelledBy:emp.name, cancelledAt:Date.now()} : a
    );
    setAppts(s=>({
      ...s,
      appointments: patch(s.appointments),
      active:       patch(s.active),
    }));
  };

  const pendingCount = myAppts.filter(needsConfirm).length;

  const TABS = [
    {id:"todas",label:"Todas"},
    {id:"hoy",label:"Hoy"},
    {id:"confirmaciones",label:`Confirmar${pendingCount>0?" · "+pendingCount:""}`},
  ];

  return (
    <div>
      <PageHeader title="Mis Citas" subtitle="Historial · Confirmaciones"/>
      <div style={{padding:"16px 32px",borderBottom:`1px solid ${C.bdr}`}}>
        <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              padding:"8px 18px",background:tab===t.id?C.gold:"transparent",
              color:tab===t.id?"#0C0C0C":t.id==="confirmaciones"&&pendingCount>0?C.gold:C.muted,
              border:`1px solid ${tab===t.id?C.gold:t.id==="confirmaciones"&&pendingCount>0?C.gold+"50":C.bdr}`,
              cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:12,letterSpacing:"0.08em",
            }}>{t.label}</button>
          ))}
          {tab!=="confirmaciones"&&(
            <FieldInput placeholder="Buscar cliente o servicio…" value={search}
              onChange={e=>setSearch(e.target.value)} style={{minWidth:220,marginLeft:"auto"}} />
          )}
        </div>
      </div>

      <div style={{padding:"16px 32px"}}>
        {tab==="confirmaciones"&&filtered.length===0 && (
          <div style={{textAlign:"center",padding:"48px",color:C.muted}}>
            <div style={{fontSize:32,marginBottom:8}}>✓</div>
            <Mono style={{fontSize:10}}>Todas las citas están confirmadas</Mono>
          </div>
        )}
        {tab!=="confirmaciones"&&filtered.length===0 && (
          <div style={{textAlign:"center",padding:"48px",color:C.muted}}>
            <div style={{fontSize:32,marginBottom:8}}>—</div>
            <Mono style={{fontSize:10}}>Sin citas</Mono>
          </div>
        )}

        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {filtered.map(a=>(
            <div key={a.id} style={{
              border:`1px solid ${tab==="confirmaciones"?C.gold+"40":C.bdr}`,
              background:C.s1,
            }}>
              <div style={{
                display:"grid",gridTemplateColumns:"50px 60px 1fr 120px auto",
                gap:12,padding:"14px 18px",alignItems:"center",
              }}>
                <Mono style={{color:C.gold,fontSize:11}}>{a.time ? formatTime12h(a.time) : "—"}</Mono>
                <Mono style={{color:C.muted,fontSize:9}}>{fmtDateShort(a.date)}</Mono>
                <div>
                  <div style={{fontSize:14}}>{a.name}</div>
                  <div style={{fontSize:11,color:C.muted}}>{a.service}</div>
                  {a.phone&&<div style={{fontSize:11,color:C.muted}}>{a.phone}</div>}
                </div>
                <Badge status={a.computedStatus}/>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  {needsConfirm(a) && (
                    <>
                      <button onClick={()=>confirmAppt(a.id, ["pending","expired"].includes(a.computedStatus))} style={{
                        padding:"7px 16px",
                        background:a.computedStatus==="expired"?"rgba(194,158,102,0.1)":"rgba(102,196,153,0.1)",
                        border:`1px solid ${a.computedStatus==="expired"?C.gold:C.green}40`,
                        color:a.computedStatus==="expired"?C.gold:C.green,
                        cursor:"pointer",fontFamily:"'JetBrains Mono',monospace",
                        fontSize:9,letterSpacing:"0.08em",textTransform:"uppercase",
                      }}>{a.computedStatus==="expired"?"↺ Reactivar":"✓ Confirmar"}</button>
                      <button onClick={()=>rejectAppt(a.id)} style={{
                        padding:"7px 12px",background:"transparent",
                        border:`1px solid ${C.red}30`,color:C.red,
                        cursor:"pointer",fontFamily:"'JetBrains Mono',monospace",
                        fontSize:9,letterSpacing:"0.08em",textTransform:"uppercase",
                      }}>✕</button>
                    </>
                  )}
                  {a.confirmedBy && (
                    <Mono style={{fontSize:9,color:C.green}}>✓ Confirmada</Mono>
                  )}
                  {!needsConfirm(a) && !["cancelled","completed","no-show"].includes(a.computedStatus) && (
                    <button onClick={()=>cancelAppt(a.id)} style={{
                      padding:"7px 12px",background:"transparent",
                      border:`1px solid ${C.red}30`,color:C.red,
                      cursor:"pointer",fontFamily:"'JetBrains Mono',monospace",
                      fontSize:9,letterSpacing:"0.08em",textTransform:"uppercase",
                    }}>✕ Cancelar cita</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---- Mis ausencias (staff self-service) ----
// El propio empleado bloquea su agenda: almuerzo/descanso puntual o una
// ausencia de uno o varios días (vacaciones, cita médica, permiso). Los
// bloqueos quedan asociados a su employeeId y afectan su propia disponibilidad
// en el portal público y en /api/book, igual que si los creara el admin.
const EmpAbsencesView = ({emp}) => {
  const [appts,setAppts] = useAppts();
  const [weekOffset,setWeekOffset] = React.useState(0);
  const [reason,setReason] = React.useState("");
  const [hovered,setHovered] = React.useState(null);
  const [selectedDate,setSelectedDate] = React.useState(todayStr());
  const [showRangeModal,setShowRangeModal] = React.useState(false);

  const ALL_TIMES = ["10:00","11:00","12:00","13:00","14:00",
    "15:00","16:00","17:00","18:00","19:00","20:00"];

  const weekDates = getWeekDates(weekOffset);
  const todayD = todayStr();
  const myBlocks = normalizeBlocks(appts).filter(b=>b.employeeId===emp.id);

  const visibleBlocks = (date,time) => myBlocks.filter(b=>blockCoversSlot(b,date,time));
  const isBlocked = (date,time) => visibleBlocks(date,time).length > 0;

  // Clicking a cell only toggles a single-slot block. Bigger ranges/absences
  // covering this cell must be removed from the sidebar list instead.
  const toggleSlot = (date,time) => {
    const covering = visibleBlocks(date,time);
    const exact = covering.find(b=>
      b.dateStart===date && b.dateEnd===date && !b.allDay && b.timeStart===time
    );
    if (exact) {
      setAppts(s=>removeBlock(s, exact.id));
      return;
    }
    if (covering.length>0) {
      alert("Esta hora está cubierta por un bloqueo de rango. Elimínalo desde la lista de la derecha.");
      return;
    }
    const endMin = timeToMin(time)+BLOCK_SLOT_MIN;
    const newRange = {
      id:genId(), dateStart:date, dateEnd:date, allDay:false,
      timeStart:time, timeEnd:minToTime(endMin),
      employeeId: emp.id,
      reason: reason||"No disponible", type:"block", createdAt:Date.now(),
    };
    setAppts(s=>({...s, blockRanges:[...(s.blockRanges||[]),newRange]}));
  };

  const clearDay = (date) => {
    if (!confirm(`¿Desbloquear todas las horas del ${fmtDateShort(date)}?`)) return;
    setAppts(s=>({
      ...s,
      blockedSlots:(s.blockedSlots||[]).filter(b=>!(b.date===date && b.employeeId===emp.id)),
      blockRanges:(s.blockRanges||[]).filter(b=>!(b.dateStart===date && b.dateEnd===date && b.employeeId===emp.id)),
    }));
  };

  const blockedForDay = (date) => myBlocks.filter(b=>date>=b.dateStart && date<=(b.dateEnd||b.dateStart));
  const selectedBlocked = blockedForDay(selectedDate);

  const DAY_LABELS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

  const weekLabel = () => {
    const first = weekDates[0]; const last = weekDates[weekDates.length-1];
    const f = new Date(first+"T12:00"); const l = new Date(last+"T12:00");
    return `${f.getDate()} – ${l.getDate()} ${l.toLocaleDateString("es-CO",{month:"long",year:"numeric"})}`;
  };

  return (
    <div>
      <PageHeader title="Mis ausencias" subtitle="Bloquea horas o días en tu agenda" />
      <div style={{padding:"24px 32px",display:"grid",gridTemplateColumns:"1fr 280px",gap:24}}>

        {/* Weekly grid */}
        <Card style={{padding:0,overflow:"hidden"}}>
          {/* Week nav header */}
          <div style={{
            display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"16px 20px",borderBottom:`1px solid ${C.bdr}`,
          }}>
            <button onClick={()=>setWeekOffset(o=>o-1)} style={{
              background:"transparent",border:`1px solid ${C.bdr}`,color:C.text,
              cursor:"pointer",padding:"6px 12px",fontSize:14,
            }}>←</button>
            <div style={{textAlign:"center"}}>
              <Mono style={{color:C.gold,fontSize:10}}>{weekLabel()}</Mono>
              {weekOffset!==0 && (
                <button onClick={()=>setWeekOffset(0)} style={{
                  background:"transparent",border:"none",color:C.muted,
                  cursor:"pointer",fontSize:10,marginTop:4,display:"block",
                  fontFamily:"'Outfit',sans-serif",
                }}>Volver a esta semana</button>
              )}
            </div>
            <button onClick={()=>setWeekOffset(o=>o+1)} style={{
              background:"transparent",border:`1px solid ${C.bdr}`,color:C.text,
              cursor:"pointer",padding:"6px 12px",fontSize:14,
            }}>→</button>
          </div>

          {/* Reason input */}
          <div style={{padding:"12px 20px",borderBottom:`1px solid ${C.bdr}`,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <Mono style={{color:C.muted,fontSize:8,whiteSpace:"nowrap"}}>Motivo</Mono>
            <input value={reason} onChange={e=>setReason(e.target.value)}
              placeholder="Almuerzo, descanso… (opcional)"
              style={{
                flex:1,background:C.s2,border:`1px solid ${C.bdr}`,color:C.text,
                padding:"6px 10px",fontFamily:"'Outfit',sans-serif",fontSize:12,
                outline:"none",minWidth:160,
              }} />
            <button onClick={()=>setShowRangeModal(true)} style={{
              background:"transparent",border:`1px solid ${C.gold+"60"}`,color:C.gold,
              cursor:"pointer",padding:"6px 12px",fontSize:10,whiteSpace:"nowrap",
              fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.08em",
            }}>+ Bloquear rango / ausencia</button>
          </div>

          {showRangeModal && (
            <BlockRangeModal
              employees={[]}
              lockedEmpId={emp.id}
              onSave={(range)=>setAppts(s=>({...s, blockRanges:[...(s.blockRanges||[]),range]}))}
              onClose={()=>setShowRangeModal(false)}
            />
          )}

          {/* Calendar grid */}
          <div style={{overflowX:"auto"}}>
            <div style={{
              display:"grid",
              gridTemplateColumns:`52px repeat(${weekDates.length},1fr)`,
              gridAutoRows:"32px",
              minWidth:520,
            }}>
              {/* Header row: day names */}
              <div style={{
                background:C.s1,borderBottom:`1px solid ${C.bdr}`,
                borderRight:`1px solid ${C.bdr}`,
              }} />
              {weekDates.map((d,i)=>{
                const isToday = d===todayD;
                const isSelected = d===selectedDate;
                const cnt = blockedForDay(d).length;
                return (
                  <button key={d} onClick={()=>setSelectedDate(d)} style={{
                    background:isToday?`rgba(194,158,102,0.07)`:isSelected?C.s2:C.s1,
                    borderBottom:`1px solid ${C.bdr}`,
                    borderRight:`1px solid ${C.bdr}`,
                    borderLeft:"none",borderTop:"none",
                    padding:"10px 4px",cursor:"pointer",
                    textAlign:"center",
                    outline:isSelected?`1px solid ${C.gold+"50"}`:"none",
                    outlineOffset:-1,
                  }}>
                    <Mono style={{
                      color:isToday?C.gold:C.muted,
                      fontSize:8,display:"block",
                    }}>{DAY_LABELS[i]}</Mono>
                    <span style={{
                      color:isToday?C.gold:C.text,
                      fontSize:13,fontFamily:"'Outfit',sans-serif",
                      fontWeight:isToday?600:400,
                    }}>
                      {new Date(d+"T12:00").getDate()}
                    </span>
                    {cnt>0 && (
                      <Mono style={{
                        display:"block",fontSize:7,
                        color:C.red,marginTop:2,
                      }}>{cnt}✕</Mono>
                    )}
                  </button>
                );
              })}

              {/* Time rows */}
              {ALL_TIMES.map(t=>{
                const isBookingTime = TIMES.includes(t);
                return (
                  <React.Fragment key={t}>
                    {/* Time label */}
                    <div style={{
                      background:C.s1,
                      borderBottom:`1px solid ${C.bdr}`,
                      borderRight:`1px solid ${C.bdr}`,
                      display:"flex",alignItems:"center",justifyContent:"flex-end",
                      padding:"0 8px",
                    }}>
                      <Mono style={{
                        color:isBookingTime?C.gold+"90":C.muted,
                        fontSize:8,
                      }}>{formatTime12h(t)}</Mono>
                    </div>
                    {/* Day cells */}
                    {weekDates.map(d=>{
                      const blocked = isBlocked(d,t);
                      const isHov = hovered&&hovered.date===d&&hovered.time===t;
                      const isToday = d===todayD;
                      const blockTitle = blocked
                        ? (visibleBlocks(d,t)[0]?.reason || "No disponible")
                        : "Haz clic para bloquear";
                      return (
                        <button key={d} onClick={()=>toggleSlot(d,t)}
                          onMouseEnter={()=>setHovered({date:d,time:t})}
                          onMouseLeave={()=>setHovered(null)}
                          title={blockTitle}
                          style={{
                            background:blocked?C.red+"22":
                                       isHov?"rgba(194,158,102,0.08)":
                                       isToday?"rgba(194,158,102,0.03)":"transparent",
                            border:"none",
                            borderBottom:`1px solid ${C.bdr}`,
                            borderRight:`1px solid ${C.bdr}`,
                            cursor:"pointer",
                            display:"flex",alignItems:"center",justifyContent:"center",
                            transition:"background 0.1s",
                          }}>
                          {blocked
                            ? <div style={{width:7,height:7,borderRadius:"50%",background:C.red,opacity:0.9}}/>
                            : isBookingTime && !isHov
                              ? <div style={{width:3,height:3,borderRadius:"50%",background:C.gold,opacity:0.25}}/>
                              : isHov
                                ? <span style={{fontSize:12,color:C.muted,lineHeight:1}}>+</span>
                                : null
                          }
                        </button>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div style={{padding:"12px 20px",display:"flex",gap:16,flexWrap:"wrap",borderTop:`1px solid ${C.bdr}`,alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:C.red,opacity:0.9}}/>
              <Mono style={{color:C.muted,fontSize:8}}>Bloqueado</Mono>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:4,height:4,borderRadius:"50%",background:C.gold,opacity:0.5}}/>
              <Mono style={{color:C.muted,fontSize:8}}>Hora de reserva</Mono>
            </div>
            <Mono style={{color:C.muted,fontSize:8,marginLeft:"auto"}}>Clic para bloquear/desbloquear</Mono>
          </div>
        </Card>

        {/* Sidebar: selected day details */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div>
                <Mono style={{color:C.gold,display:"block",fontSize:9}}>
                  {fmtDateMed(selectedDate)}
                </Mono>
                <Mono style={{color:C.muted,fontSize:8,display:"block",marginTop:2}}>
                  {selectedBlocked.length} bloqueado{selectedBlocked.length!==1?"s":""}
                </Mono>
              </div>
              {selectedBlocked.length>0 && (
                <button onClick={()=>clearDay(selectedDate)} style={{
                  background:"transparent",border:`1px solid ${C.red+"50"}`,
                  color:C.red,cursor:"pointer",fontSize:9,padding:"4px 8px",
                  fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.1em",
                }}>Limpiar</button>
              )}
            </div>
            {selectedBlocked.length===0 ? (
              <div style={{color:C.muted,fontSize:12}}>Sin bloqueos para este día.</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {selectedBlocked
                  .sort((a,b)=>(a.timeStart||"")<(b.timeStart||"")?-1:(a.timeStart||"")>(b.timeStart||"")?1:0)
                  .map(b=>{
                  const multiDay = b.dateStart!==b.dateEnd;
                  const whenLabel = b.allDay
                    ? (multiDay ? `${fmtDateShort(b.dateStart)} – ${fmtDateShort(b.dateEnd)} · Todo el día` : "Todo el día")
                    : (multiDay ? `${fmtDateShort(b.dateStart)} – ${fmtDateShort(b.dateEnd)} · ${formatTime12h(b.timeStart)}–${formatTime12h(b.timeEnd)}` : `${formatTime12h(b.timeStart)}–${formatTime12h(b.timeEnd)}`);
                  return (
                    <div key={b.id} style={{
                      display:"flex",justifyContent:"space-between",alignItems:"center",
                      padding:"6px 10px",background:C.s2,
                      borderLeft:`2px solid ${C.red}50`,
                    }}>
                      <div>
                        <Mono style={{color:C.red,fontSize:10}}>{whenLabel}</Mono>
                        {b.reason && b.reason!=="No disponible" && (
                          <div style={{fontSize:10,color:C.muted,marginTop:2}}>{b.reason}</div>
                        )}
                      </div>
                      <button onClick={()=>setAppts(s=>removeBlock(s, b.id))} style={{
                        background:"transparent",border:"none",color:C.muted,
                        cursor:"pointer",fontSize:13,padding:"2px 6px",
                      }}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <Mono style={{color:C.muted,display:"block",marginBottom:10,fontSize:8}}>
              Semana actual — total bloqueado
            </Mono>
            {weekDates.map(d=>{
              const cnt = blockedForDay(d).length;
              const isToday = d===todayD;
              const isSelected = d===selectedDate;
              return (
                <button key={d} onClick={()=>setSelectedDate(d)} style={{
                  display:"flex",justifyContent:"space-between",alignItems:"center",
                  width:"100%",padding:"7px 0",background:"transparent",border:"none",
                  borderBottom:`1px solid ${C.bdr}`,cursor:"pointer",
                  color:isSelected?C.gold:isToday?C.gold+"90":C.text,
                  fontFamily:"'Outfit',sans-serif",fontSize:12,
                }}>
                  <span style={{fontWeight:isSelected?600:400}}>{fmtDateMed(d)}</span>
                  <Mono style={{color:cnt>0?C.red:C.muted,fontSize:9}}>{cnt>0?`${cnt} bloq.`:"Libre"}</Mono>
                </button>
              );
            })}
          </Card>
        </div>
      </div>
    </div>
  );
};

// ---- Reservar turno (staff agenda en mano) ----
// El empleado agenda un turno cuando el cliente no puede usar el sitio web.
// El celular identifica al cliente; al elegir el servicio, el bloque se acomoda
// automáticamente en el calendario según la duración.
const EmpBookingView = ({emp, onNav}) => {
  const [appts, setAppts] = useAppts();
  const [admin]           = useAdmin();
  const todayD = todayStr();
  const addDay = (base,n)=>{ const d=new Date(base+"T12:00"); d.setDate(d.getDate()+n); return d.toISOString().split("T")[0]; };
  const firstOpen = (()=>{ for(let i=0;i<21;i++){ const d=addDay(todayD,i); if(!isClosedDay(d)) return d; } return todayD; })();

  const [catalog, setCatalog] = React.useState(null);
  React.useEffect(()=>{
    fetch("/api/catalog").then(r=>r.ok?r.json():null).then(d=>{ if(d) setCatalog(d); }).catch(()=>{});
  },[]);

  const [form, setForm]   = React.useState({ phone:"", name:"", serviceId:"", date:firstOpen, time:"" });
  const [saving, setSaving] = React.useState(false);
  const [done, setDone]     = React.useState(null);
  const [err, setErr]       = React.useState("");
  // Celulares para los que el staff dijo "¿No es el cliente?" — no se vuelven a autocompletar
  const [rejectedPhones, setRejectedPhones] = React.useState([]);
  const autoNameRef = React.useRef("");   // último nombre puesto automáticamente (para poder reemplazarlo)
  const setF = (k,v)=> setForm(f=>({...f,[k]:v}));

  const allServices  = catalog?.services || [];
  const myEmp        = (catalog?.employees||[]).find(e=>e.id===emp.id) || null;
  const myServiceIds = myEmp?.services || [];
  const myServices   = myServiceIds.length ? allServices.filter(s=>myServiceIds.includes(s.id)) : allServices;

  const selectedSvc = allServices.find(s=>s.id===form.serviceId) || null;
  const dur = selectedSvc?.dur || 60;

  // El selector de día avanza de semana en semana (hasta 8 semanas hacia adelante),
  // así el staff puede agendar más allá de los próximos 7 días.
  const MAX_WEEKS = 8;
  const [weekPage, setWeekPage] = React.useState(0);
  const weekNavStyle = (disabled)=>({
    width:28,height:28,lineHeight:1,padding:0,
    background:"transparent",border:`1px solid ${C.bdr}`,
    color:disabled?C.muted2:C.gold,cursor:disabled?"default":"pointer",
    fontFamily:"'Outfit',sans-serif",fontSize:14,opacity:disabled?0.5:1,
  });
  const weekStart = addDay(todayD, weekPage*7);
  const weekEnd   = addDay(weekStart, 6);
  const openDays = React.useMemo(()=>{
    const out=[];
    for(let i=0;i<7;i++){ const d=addDay(weekStart,i); if(!isClosedDay(d)) out.push(d); }
    return out;
  },[weekStart]);

  const allAppts = getAllAppts(appts, admin.cancelledIds||[], admin.noShowIds||[]);
  const dayAppts = allAppts.filter(a=> a.stylist===emp.name && a.date===form.date && !["cancelled","no-show"].includes(a.computedStatus));
  const blocked  = (appts.blockedSlots||[]).filter(b=>b.date===form.date);

  const nowMin = nowCOT().getHours()*60 + nowCOT().getMinutes();
  const isPastSlot = (time) => form.date===todayD && timeToMin(time) < nowMin;

  // ¿El bloque [inicio, inicio+dur) cabe sin chocar con otra cita / bloqueo / cierre?
  const blockConflicts = (startTime) => {
    const s = timeToMin(startTime), e = s+dur;
    if (e > closesAtMin(form.date)) return true;                                    // no cierra a tiempo
    if (myEmp && !empWorksOnSlot(myEmp, form.date, startTime, dur)) return true;    // fuera de su horario
    if (dayAppts.some(a=>{ const as=timeToMin(a.time), ae=as+(a.serviceDur||60); return as<e && s<ae; })) return true;
    if (blocked.some(b=>{ const bs=timeToMin(b.time); return bs>=s && bs<e; })) return true;
    return false;
  };

  const slots    = slotsForDate(form.date);
  const selStart = form.time ? timeToMin(form.time) : null;
  const selEnd   = selStart!=null ? selStart+dur : null;
  const apptAt   = (time)=>{ const cs=timeToMin(time), ce=cs+60; return dayAppts.find(a=>{ const as=timeToMin(a.time), ae=as+(a.serviceDur||60); return as<ce && cs<ae; }); };
  const isBlockedSlot = (time)=> blocked.some(b=>b.time===time);

  const phoneDigits = (form.phone||"").replace(/\D/g,"");
  const phoneOk = phoneDigits.length===10;

  // ── Directorio celular → nombre, construido con las citas existentes ──
  const phoneNameMap = React.useMemo(()=>{
    const m={};
    allAppts.forEach(a=>{
      const p=(a.phone||"").replace(/\D/g,"");
      const nm=(a.name||"").trim();
      if(p.length===10 && nm && nm!=="Cliente sin nombre"){
        if(!m[p] || (a.createdAt||0) > m[p].at) m[p]={ name:nm, at:a.createdAt||0 };
      }
    });
    return m;
  },[allAppts]);

  const isRejected = rejectedPhones.includes(phoneDigits);
  const knownName  = phoneOk && !isRejected ? (phoneNameMap[phoneDigits]?.name || null) : null;
  const showKnown  = !!knownName && form.name.trim()===knownName;

  // Al completar 10 dígitos autocompleta el nombre del cliente ya conocido
  React.useEffect(()=>{
    if(!phoneOk) return;
    const m = (!isRejected) ? phoneNameMap[phoneDigits] : null;
    if(m){
      setForm(f=> (f.name.trim()==="" || f.name===autoNameRef.current) ? {...f, name:m.name} : f);
      autoNameRef.current = m.name;
    } else {
      setForm(f=> (f.name!=="" && f.name===autoNameRef.current) ? {...f, name:""} : f);
      autoNameRef.current = "";
    }
  },[phoneDigits, phoneOk, isRejected, phoneNameMap]);

  const dismissKnown = ()=>{
    setRejectedPhones(p=> p.includes(phoneDigits)?p:[...p,phoneDigits]);
    setForm(f=> f.name===knownName ? {...f, name:""} : f);
    autoNameRef.current = "";
  };
  const timeOk  = !!form.time && !blockConflicts(form.time);
  // El nombre es obligatorio la primera vez que se registra un celular nuevo (sin cliente conocido)
  const nameRequired = phoneOk && !knownName;
  const nameOk       = !nameRequired || form.name.trim().length>0;
  const canSubmit = phoneOk && nameOk && !!form.serviceId && !!form.date && timeOk && !saving;

  const pickService = (s)=> setForm(f=>({...f, serviceId:s.id, time:""}));
  const pickDate    = (d)=> setForm(f=>({...f, date:d, time:""}));

  const submit = async () => {
    setErr("");
    if (!phoneOk)            { setErr("Ingresa un celular válido de 10 dígitos."); return; }
    if (!nameOk)             { setErr("Ingresa el nombre del cliente (obligatorio para un celular nuevo)."); return; }
    if (!selectedSvc)        { setErr("Selecciona el servicio."); return; }
    if (!timeOk)             { setErr("Selecciona una hora disponible para el bloque."); return; }
    setSaving(true);

    // Antes de guardar, revisa contra la data más reciente del servidor por si
    // un cliente acaba de agendar este mismo horario desde el sitio web mientras
    // el empleado llenaba el formulario ("turno entrante").
    let freshData = null;
    try {
      const t = storeToken();
      const headers = t ? { "Authorization": `Bearer ${t}` } : {};
      const res = await fetch("/api/store", { headers });
      if (res.ok) freshData = { ...DEFAULT_APPTS(), ...(await res.json()) };
    } catch {}

    const s = timeToMin(form.time), e = s + dur;
    if (freshData) {
      const freshDayAppts = getAllAppts(freshData, admin.cancelledIds||[], admin.noShowIds||[])
        .filter(a=> a.stylist===emp.name && a.date===form.date && !["cancelled","no-show"].includes(a.computedStatus));
      const overlapping = freshDayAppts.find(a=>{ const as=timeToMin(a.time), ae=as+(a.serviceDur||60); return as<e && s<ae; });
      if (overlapping) {
        const withEnd = minToTime(timeToMin(overlapping.time)+(overlapping.serviceDur||60));
        setErr(`Mientras reservabas, ${overlapping.name} agendó ${formatTime12h(overlapping.time)}–${formatTime12h(withEnd)}. Elige otro bloque.`);
        const warning = {
          id: genId(), stylist: emp.name, date: form.date,
          time: form.time, end: minToTime(e),
          withName: overlapping.name, withTime: overlapping.time, withEnd,
          createdAt: Date.now(),
        };
        await setAppts(()=>({ ...freshData, timeWarnings:[...(freshData.timeWarnings||[]), warning] }));
        setSaving(false);
        return;
      }
    }

    const appt = {
      id: genId(),
      code: "JX-"+(Math.floor(Math.random()*9000)+1000),
      service: selectedSvc.name,
      serviceId: selectedSvc.id,
      serviceDur: dur,
      stylist: emp.name,
      date: form.date,
      time: form.time,
      name: form.name.trim() || "Cliente sin nombre",
      phone: phoneDigits,
      cedula: "",
      createdAt: Date.now(),
      status: "scheduled",
      confirmedBy: emp.name,     // creada en mano por el staff → ya confirmada
      confirmedAt: Date.now(),
      bookedBy: "staff",
    };
    // Re-check the overlap against `cur` on every attempt the setAppts retry
    // loop makes (not just once up front): if a 409 lands mid-save because
    // another booking landed first, the retry re-applies this updater on the
    // reconciled store, so without re-validating here a losing booking would
    // get appended blindly on top of the winner — the double-booking bug.
    let conflict = null;
    await setAppts(cur => {
      const dayAppts = getAllAppts(cur, admin.cancelledIds||[], admin.noShowIds||[])
        .filter(a=> a.stylist===emp.name && a.date===form.date && !["cancelled","no-show"].includes(a.computedStatus));
      const overlapping = dayAppts.find(a=>{ const as=timeToMin(a.time), ae=as+(a.serviceDur||60); return as<e && s<ae; });
      if (overlapping) { conflict = overlapping; return cur; } // no-op: don't append on conflict
      return { ...cur, appointments:[...(cur.appointments||[]), appt] };
    });
    setSaving(false);
    if (conflict) {
      const withEnd = minToTime(timeToMin(conflict.time)+(conflict.serviceDur||60));
      setErr(`Mientras reservabas, ${conflict.name} agendó ${formatTime12h(conflict.time)}–${formatTime12h(withEnd)}. Elige otro bloque.`);
      return;
    }
    setDone(appt);
  };

  const resetForNew = () => { setDone(null); setForm({ phone:"", name:"", serviceId:"", date:firstOpen, time:"" }); setErr(""); };

  const dayLabel = (d,i)=> i===0&&d===todayD ? "Hoy" : d===addDay(todayD,1) ? "Mañana" :
    new Date(d+"T12:00").toLocaleDateString("es-CO",{weekday:"short",day:"numeric"});

  // ---- Pantalla de éxito ----
  if (done) {
    const endT = minToTime(timeToMin(done.time)+done.serviceDur);
    return (
      <div>
        <PageHeader title="Turno reservado" subtitle="Staff · Reserva" />
        <div style={{padding:"24px 32px"}}>
          <Card style={{maxWidth:520,borderColor:C.green+"50"}}>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:40,color:C.green,marginBottom:8}}>✓</div>
              <div style={{fontFamily:"'Marcellus',serif",fontSize:22,color:C.text}}>Bloque apartado en el calendario</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[
                ["Cliente", done.name],
                ["Celular", done.phone],
                ["Servicio", `${done.service} · ${done.serviceDur} min`],
                ["Fecha", new Date(done.date+"T12:00").toLocaleDateString("es-CO",{weekday:"long",day:"numeric",month:"long"})],
                ["Bloque", `${formatTime12h(done.time)} – ${formatTime12h(endT)}`],
              ].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",gap:16,padding:"10px 0",borderBottom:`1px solid ${C.bdr}`}}>
                  <Mono style={{color:C.muted,fontSize:9}}>{k}</Mono>
                  <span style={{fontSize:14,color:C.text,textAlign:"right"}}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:10,marginTop:24}}>
              <Btn onClick={resetForNew} style={{flex:1}}>+ Reservar otro</Btn>
              <Btn variant="ghost" onClick={()=>onNav&&onNav("agenda")} style={{flex:1}}>Ver en Mi Agenda</Btn>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Reservar turno" subtitle="Staff · Para el cliente" />
      <div style={{padding:"24px 32px",maxWidth:760}}>
        <div style={{
          marginBottom:24,padding:"12px 16px",background:"rgba(194,158,102,0.06)",
          border:`1px solid ${C.gold}25`,fontSize:13,color:C.muted,lineHeight:1.6,
        }}>
          Agenda un turno cuando el cliente no puede usar el sitio web. El <b style={{color:C.text}}>celular</b> identifica
          al cliente, y al elegir el servicio el bloque se acomoda solo en tu calendario según su duración.
        </div>

        {/* 1 · Cliente */}
        <Mono style={{color:C.gold,fontSize:9,display:"block",marginBottom:12}}>1 · Cliente</Mono>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:28}} className="adm-two-col">
          <div>
            <FieldInput label="Celular *" type="tel" value={form.phone}
              onChange={e=>setF("phone", e.target.value.replace(/[^\d\s]/g,"").slice(0,13))}
              placeholder="300 123 4567" />
            {phoneDigits.length>0 && !phoneOk && (
              <div style={{marginTop:6,fontSize:11,color:C.red}}>Debe tener 10 dígitos.</div>
            )}
          </div>
          <div>
            <FieldInput label={nameRequired ? "Nombre *" : "Nombre (opcional)"} value={form.name}
              onChange={e=>{ autoNameRef.current=""; setF("name", e.target.value); }} placeholder="Nombre del cliente" />
            {nameRequired && form.name.trim()==="" && (
              <div style={{marginTop:6,fontSize:11,color:C.muted}}>Cliente nuevo · el nombre es obligatorio.</div>
            )}
            {showKnown && (
              <div style={{marginTop:6,fontSize:11,color:C.green,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span>✓ Cliente reconocido por su celular</span>
                <button type="button" onClick={dismissKnown} style={{
                  background:"transparent",border:"none",color:C.gold,cursor:"pointer",padding:0,
                  fontFamily:"'JetBrains Mono',monospace",fontSize:11,textDecoration:"underline",
                }}>¿No es el cliente?</button>
              </div>
            )}
          </div>
        </div>

        {/* 2 · Servicio */}
        <Mono style={{color:C.gold,fontSize:9,display:"block",marginBottom:12}}>2 · Servicio</Mono>
        {!catalog ? (
          <div style={{padding:"16px 0",color:C.muted,fontSize:13}}>Cargando servicios…</div>
        ) : myServices.length===0 ? (
          <div style={{padding:"16px 0",color:C.muted,fontSize:13}}>No tienes servicios asignados.</div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8,marginBottom:28}}>
            {myServices.map(s=>{
              const sel = form.serviceId===s.id;
              return (
                <button key={s.id} onClick={()=>pickService(s)} style={{
                  padding:"12px 14px",textAlign:"left",cursor:"pointer",
                  background:sel?"rgba(194,158,102,0.15)":C.s2,
                  border:`1px solid ${sel?C.gold:C.bdr}`,color:C.text,
                  fontFamily:"'Outfit',sans-serif",
                }}>
                  <div style={{fontSize:14,marginBottom:4}}>{s.name}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                    <Mono style={{color:C.gold,fontSize:9}}>{s.dur} min</Mono>
                    <span style={{fontSize:12,color:C.muted}}>{s.note?`${s.note} `:""}{fmtCOP(s.price)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* 3 · Día + 4 · Bloque */}
        {form.serviceId && (
          <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:12}}>
              <Mono style={{color:C.gold,fontSize:9}}>3 · Día</Mono>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>setWeekPage(p=>Math.max(0,p-1))} disabled={weekPage===0} style={weekNavStyle(weekPage===0)}>‹</button>
                <Mono style={{color:C.muted,fontSize:9,minWidth:112,textAlign:"center"}}>
                  {weekPage===0 ? "Esta semana" : fmtDateShort(weekStart)+" – "+fmtDateShort(weekEnd)}
                </Mono>
                <button onClick={()=>setWeekPage(p=>Math.min(MAX_WEEKS-1,p+1))} disabled={weekPage>=MAX_WEEKS-1} style={weekNavStyle(weekPage>=MAX_WEEKS-1)}>›</button>
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:24}}>
              {openDays.length===0 && (
                <Mono style={{color:C.muted2,fontSize:10}}>Sin días abiertos esta semana</Mono>
              )}
              {openDays.map((d,i)=>{
                const sel = form.date===d;
                return (
                  <button key={d} onClick={()=>pickDate(d)} style={{
                    padding:"8px 16px",cursor:"pointer",
                    background:sel?C.gold:"transparent",color:sel?"#0C0C0C":C.muted,
                    border:`1px solid ${sel?C.gold:C.bdr}`,
                    fontFamily:"'Outfit',sans-serif",fontSize:12,letterSpacing:"0.05em",
                  }}>{dayLabel(d,i)}</button>
                );
              })}
            </div>

            <Mono style={{color:C.gold,fontSize:9,display:"block",marginBottom:12}}>4 · Bloque en el calendario</Mono>
            {form.time && !blockConflicts(form.time) && (
              <div style={{
                marginBottom:14,padding:"10px 16px",background:"rgba(102,196,153,0.1)",
                border:`1px solid ${C.green}40`,display:"inline-flex",gap:10,alignItems:"center",
              }}>
                <Mono style={{color:C.green,fontSize:10}}>Bloque</Mono>
                <span style={{fontSize:14,color:C.text}}>{formatTime12h(form.time)} – {formatTime12h(minToTime(timeToMin(form.time)+dur))}</span>
                <Mono style={{color:C.muted,fontSize:9}}>{dur} min</Mono>
              </div>
            )}

            <div style={{border:`1px solid ${C.bdr}`,background:C.s1,marginBottom:24}}>
              {slots.map(time=>{
                const occ     = apptAt(time);
                const blk     = isBlockedSlot(time);
                const past    = isPastSlot(time);
                const slotMin = timeToMin(time);
                const inSel   = selStart!=null && slotMin>=selStart && slotMin<selEnd;
                const selectable = !occ && !blk && !past && !blockConflicts(time);
                const onClick = selectable ? ()=>setF("time", time) : undefined;
                return (
                  <div key={time} onClick={onClick} style={{
                    display:"grid",gridTemplateColumns:"76px 1fr",
                    borderBottom:`1px solid ${C.bdr}`,
                    cursor:selectable?"pointer":"default",
                    background:inSel?"rgba(194,158,102,0.16)":"transparent",
                    opacity:past?0.4:1,
                  }}>
                    <div style={{padding:"12px 0 12px 16px",borderRight:`1px solid ${C.bdr}`}}>
                      <Mono style={{color:inSel?C.gold:past?C.muted2:C.gold,fontSize:11}}>{formatTime12h(time)}</Mono>
                    </div>
                    <div style={{padding:"8px 14px",display:"flex",alignItems:"center",minHeight:42}}>
                      {occ ? (
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,color:C.text}}>{occ.name}</div>
                          <Mono style={{color:C.muted,fontSize:9}}>Ocupado · {occ.service}</Mono>
                        </div>
                      ) : blk ? (
                        <Mono style={{color:C.red,fontSize:10}}>Bloqueado</Mono>
                      ) : inSel ? (
                        <Mono style={{color:C.gold,fontSize:10}}>{slotMin===selStart?"● Inicio del turno":"Reservado"}</Mono>
                      ) : selectable ? (
                        <Mono style={{color:C.muted,fontSize:10}}>Libre · tocar para apartar</Mono>
                      ) : (
                        <Mono style={{color:C.muted2,fontSize:9}}>{past?"—":"No alcanza"}</Mono>
                      )}
                    </div>
                  </div>
                );
              })}
              {slots.length===0 && (
                <div style={{padding:"20px",textAlign:"center",color:C.muted,fontSize:12}}>Día cerrado.</div>
              )}
            </div>
          </>
        )}

        {err && (
          <div style={{marginBottom:16,padding:"10px 14px",background:"rgba(196,102,102,0.1)",border:`1px solid ${C.red}40`,fontSize:13,color:C.red}}>{err}</div>
        )}

        <Btn onClick={submit} disabled={!canSubmit} style={{width:"100%",padding:"14px"}}>
          {saving ? "Reservando…" : "Reservar turno →"}
        </Btn>
      </div>
    </div>
  );
};

// ---- Ayuda para el empleado ----
const EmpHelpView = ({onNav}) => {
  const Step = ({ n, text }) => (
    <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
      <div style={{
        width:26,height:26,flexShrink:0,borderRadius:"50%",
        background:"rgba(194,158,102,0.12)",border:`1px solid ${C.gold}40`,
        display:"flex",alignItems:"center",justifyContent:"center",
        fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:C.gold,
      }}>{n}</div>
      <div style={{fontSize:14,lineHeight:1.6,color:C.text,paddingTop:3}}>{text}</div>
    </div>
  );

  const Section = ({ title, badge, badgeColor, children }) => (
    <Card>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
        <Mono style={{color:C.gold,fontSize:13}}>{title}</Mono>
        {badge && (
          <span style={{
            padding:"2px 8px",fontSize:10,fontFamily:"'JetBrains Mono',monospace",
            background:`${badgeColor}18`,border:`1px solid ${badgeColor}40`,
            color:badgeColor,letterSpacing:"0.08em",textTransform:"uppercase",
          }}>{badge}</span>
        )}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>{children}</div>
    </Card>
  );

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);
  const isInApp = isInAppBrowser();

  return (
    <div>
      <PageHeader title="Ayuda" subtitle="Staff · Guías"
        action={onNav&&<Btn small onClick={()=>onNav("reservar")}>+ Reservar turno</Btn>} />
      <div style={{padding:"24px 32px",display:"flex",flexDirection:"column",gap:20,maxWidth:640}}>

        <Section title="Reservar un turno" badge="Nuevo" badgeColor={C.gold}>
          <div style={{fontSize:13,color:C.muted,lineHeight:1.6,marginBottom:4}}>
            Cuando el cliente no puede usar el sitio web, tú puedes agendar el turno por tu cuenta.
            El bloque se aparta solo en tu calendario según la duración del servicio.
          </div>
          <Step n="1" text={<>Abre <strong style={{color:C.text}}>Reservar turno</strong> (en el menú o con el botón <strong style={{color:C.text}}>+ Reservar turno</strong> de Mi Agenda).</>} />
          <Step n="2" text={<>Ingresa el <strong style={{color:C.text}}>celular</strong> del cliente (obligatorio — es lo que lo identifica). Si ya tiene citas, su nombre aparece solo; si el celular es nuevo, el nombre es obligatorio.</>} />
          <Step n="3" text={<>Elige el <strong style={{color:C.text}}>servicio</strong>. La duración se toma del catálogo.</>} />
          <Step n="4" text={<>Selecciona el <strong style={{color:C.text}}>día</strong> y toca una hora libre: el <strong style={{color:C.text}}>bloque se acomoda solo</strong> (ej. un servicio de 180 min aparta 14:00–17:00).</>} />
          <Step n="5" text={<>Confirma con <strong style={{color:C.text}}>Reservar turno</strong>. La cita queda agendada a tu nombre, ya confirmada.</>} />
          <div style={{
            padding:"12px 14px",fontSize:12,color:C.muted,lineHeight:1.6,
            background:"rgba(194,158,102,0.05)",border:`1px solid ${C.gold}20`,
          }}>
            La línea de tiempo respeta tus citas ya agendadas, los horarios bloqueados, la hora de cierre
            y tu horario laboral. Los espacios que no alcanzan a caber se marcan como "No alcanza".
          </div>
        </Section>

        <Section title="Confirmar citas" badgeColor={C.gold}>
          <div style={{fontSize:13,color:C.muted,lineHeight:1.6,marginBottom:4}}>
            Las reservas que hacen los clientes desde el sitio web te llegan como pendientes.
            Debes confirmarlas para apartarlas en firme.
          </div>
          <Step n="1" text={<>Entra a <strong style={{color:C.text}}>Confirmar citas</strong> — el número en el menú indica cuántas tienes pendientes.</>} />
          <Step n="2" text={<>Toca <strong style={{color:C.text}}>✓ Confirmar</strong> para aceptarla, o <strong style={{color:C.text}}>✕</strong> para rechazarla.</>} />
          <Step n="3" text={<>Una cita <strong style={{color:C.text}}>expirada</strong> (sin confirmar a tiempo) se puede reactivar con <strong style={{color:C.text}}>↺</strong>.</>} />
          <div style={{
            padding:"12px 14px",fontSize:12,color:C.muted,lineHeight:1.6,
            background:"rgba(194,158,102,0.05)",border:`1px solid ${C.gold}20`,
          }}>
            Las que reservas tú mismo desde "Reservar turno" no necesitan confirmación: quedan listas de una vez.
          </div>
        </Section>

        <Section title="Activar mis notificaciones" badge="Importante" badgeColor={C.green}>
          <div style={{fontSize:13,color:C.muted,lineHeight:1.6,marginBottom:4}}>
            Cada empleado activa sus notificaciones en su propio teléfono. Solo recibirás aviso de
            <strong style={{color:C.text}}> tus turnos</strong> — no de los de tus compañeros.
            Hazlo una vez por dispositivo.
          </div>
          {isInApp ? (
            <>
              <Step n="1" text={<>Estás en el navegador de <strong style={{color:C.text}}>Instagram / WhatsApp</strong>; aquí <strong style={{color:C.text}}>no</strong> se pueden activar.</>} />
              <Step n="2" text={<>Toca el menú <strong style={{color:C.text}}>⋯</strong> (arriba a la derecha) y elige <strong style={{color:C.text}}>"Abrir en el navegador"</strong> (Safari/Chrome).</>} />
              <Step n="3" text={<>Ya en Safari/Chrome, vuelve a <strong style={{color:C.text}}>/staff</strong> y sigue los pasos de tu dispositivo.</>} />
            </>
          ) : isIos ? (
            <>
              <Step n="1" text={<>Abre <strong style={{color:C.text}}>/staff</strong> en <strong style={{color:C.text}}>Safari</strong> (no Chrome).</>} />
              <Step n="2" text={<>Toca <strong style={{color:C.text}}>Compartir</strong> (el cuadrado con la flecha) y elige <strong style={{color:C.text}}>"Agregar a inicio"</strong>.</>} />
              <Step n="3" text={<>Abre la app <strong style={{color:C.text}}>JOXE Staff</strong> desde el Home Screen e inicia sesión con tu PIN.</>} />
              <Step n="4" text={<>Vuelve a esta pantalla y pulsa <strong style={{color:C.text}}>Inactivo</strong> en la tarjeta de abajo para activarlas.</>} />
              <Step n="5" text={<>Acepta el permiso cuando el sistema lo pida.</>} />
            </>
          ) : isAndroid ? (
            <>
              <Step n="1" text={<>Abre <strong style={{color:C.text}}>/staff</strong> en <strong style={{color:C.text}}>Chrome</strong> e inicia sesión con tu PIN.</>} />
              <Step n="2" text={<>En la tarjeta de abajo pulsa <strong style={{color:C.text}}>Inactivo</strong> para activarlas.</>} />
              <Step n="3" text={<>Acepta el permiso cuando Chrome lo pida. Llegarán aunque la app esté cerrada.</>} />
            </>
          ) : (
            <>
              <Step n="1" text={<>Inicia sesión en <strong style={{color:C.text}}>/staff</strong> con tu PIN (Chrome o Edge).</>} />
              <Step n="2" text={<>En la tarjeta de abajo pulsa <strong style={{color:C.text}}>Inactivo</strong> y acepta el permiso del navegador.</>} />
            </>
          )}
          <div style={{
            padding:"12px 14px",fontSize:12,color:C.muted,lineHeight:1.6,
            background:"rgba(102,196,153,0.05)",border:`1px solid ${C.green}20`,
          }}>
            El interruptor afecta solo este dispositivo — puedes activarlo en tu teléfono y en una tablet.
            Para dejar de recibirlas, pulsa <strong style={{color:C.text}}>Activo</strong> y quedará en Inactivo.
          </div>
        </Section>

        <NotificationsCard />

        <Section title="Preguntas frecuentes">
          {[
            {
              q:"¿La cita que reservo yo entra a 'Confirmar citas'?",
              a:"No. Como la creas en mano, queda confirmada de inmediato y aparece directo en tu agenda.",
            },
            {
              q:"¿Qué pasa si dos clientes quieren la misma hora?",
              a:"No es posible: al apartar un bloque, esas horas dejan de estar disponibles para ti tanto en el sitio web como en /staff.",
            },
            {
              q:"No me deja elegir una hora.",
              a:"Si una hora se ve como 'No alcanza', el servicio no termina antes del cierre o choca con otra cita. Prueba más temprano o elige otro día.",
            },
            {
              q:"No me llegan las notificaciones.",
              a:"Revisa que el interruptor de 'Activar mis notificaciones' esté en Activo en ese teléfono. En iPhone debes abrir /staff desde el ícono del Home Screen, no desde Safari. Si los permisos están bloqueados, actívalos en los ajustes del navegador.",
            },
          ].map(({ q, a }) => (
            <div key={q} style={{borderBottom:`1px solid ${C.bdr}`,paddingBottom:14}}>
              <div style={{fontSize:13,fontWeight:500,marginBottom:6}}>{q}</div>
              <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>{a}</div>
            </div>
          ))}
        </Section>

      </div>
    </div>
  );
};

// ---- Employee Shell ----
const EMP_VIEWS = [
  {id:"agenda",        label:"Mi Agenda",       icon:"▦"},
  {id:"calendario",    label:"Calendario",      icon:"▥"},
  {id:"reservar",      label:"Reservar turno",  icon:"＋"},
  {id:"confirmaciones",label:"Confirmar citas", icon:"◉"},
  {id:"todas",         label:"Mis Citas",       icon:"≡"},
  {id:"horario",       label:"Mi Horario",      icon:"◷"},
  {id:"ausencias",     label:"Mis ausencias",   icon:"⊘"},
  {id:"ayuda",         label:"Ayuda",           icon:"?"},
];

// Empleado edita su propio horario laboral desde /staff. Se guarda vía
// /api/work-hours (endpoint acotado: solo puede tocar su propio workHours),
// a diferencia de StylistSettingsView que usa /api/admin y es solo-admin.
const EmpWorkHoursView = ({ emp }) => {
  const [workHours, setWorkHours] = React.useState(null);
  const [saving, setSaving]       = React.useState(false);
  const [saved, setSaved]         = React.useState(false);
  const [err, setErr]             = React.useState("");

  React.useEffect(() => {
    fetch("/api/catalog").then(r => r.ok ? r.json() : null).then(d => {
      const me = (d?.employees || []).find(e => e.id === emp.id);
      setWorkHours({ ...DEFAULT_WORK_HOURS(), ...(me?.workHours || {}) });
    }).catch(() => setWorkHours(DEFAULT_WORK_HOURS()));
  }, [emp.id]);

  const save = async () => {
    setSaving(true); setErr(""); setSaved(false);
    try {
      const res = await fetch("/api/work-hours", {
        method: "POST",
        headers: staffHeaders(),
        body: JSON.stringify({ workHours }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setErr("No se pudo guardar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Mi Horario" subtitle="Define los días y horas en que trabajas" />
      <div style={{ padding: "24px 32px", maxWidth: 520 }}>
        <Card>
          {!workHours ? (
            <Mono style={{ fontSize: 10, color: C.muted }}>Cargando…</Mono>
          ) : (
            <>
              <WorkHoursEditor value={workHours} onChange={setWorkHours} />
              <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
                <Btn onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar horario"}</Btn>
                {saved && <Mono style={{ color: C.green, fontSize: 9 }}>✓ Guardado</Mono>}
                {err && <Mono style={{ color: C.red, fontSize: 9 }}>{err}</Mono>}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

const EmpShell = ({emp, onLogout, children, activeView, onNav}) => {
  const [mobileOpen,setMobileOpen] = React.useState(false);
  const [appts, setAppts] = useAppts();
  const [admin] = useAdmin();
  const pendingAppts = getAllAppts(appts, admin.cancelledIds||[], admin.noShowIds||[])
    .filter(x => x.stylist===emp.name && empNeedsConfirm(x)).length;
  const todayD = todayStr();
  const activeWarnings = (appts.timeWarnings||[]).filter(w=>w.date>=todayD);
  const dismissWarning = (id) => setAppts(s=>({ ...s, timeWarnings:(s.timeWarnings||[]).filter(x=>x.id!==id) }));

  const navContent = (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{padding:"28px 24px",borderBottom:`1px solid ${C.bdr}`}}>
        <div style={{fontFamily:"'Marcellus',serif",fontSize:18,letterSpacing:"0.25em",color:C.text}}>
          {emp.name}
        </div>
        <Mono style={{
          color:C.gold,fontSize:9,display:"inline-block",marginTop:6,
          padding:"2px 8px",background:"rgba(194,158,102,0.1)",
          border:`1px solid ${C.gold}30`,
        }}>{emp.role}</Mono>
      </div>
      <nav style={{flex:1,padding:"12px 10px",overflowY:"auto"}}>
        {EMP_VIEWS.map(v=>{
          const isA = activeView===v.id;
          const hasBadge = v.id==="confirmaciones"&&pendingAppts>0;
          return (
            <button key={v.id} onClick={()=>{onNav(v.id);setMobileOpen(false);}} style={{
              display:"flex",alignItems:"center",gap:12,
              width:"100%",padding:"11px 14px",marginBottom:2,
              background:isA?"rgba(194,158,102,0.1)":"transparent",
              border:`1px solid ${isA?C.gold+"30":"transparent"}`,
              color:isA?C.gold:C.muted,cursor:"pointer",textAlign:"left",
              fontFamily:"'Outfit',sans-serif",fontSize:12,letterSpacing:"0.08em",textTransform:"uppercase",
            }}>
              <span style={{fontSize:14,opacity:0.8}}>{v.icon}</span>
              <span style={{flex:1}}>{v.label}</span>
              {hasBadge&&<span style={{
                padding:"1px 7px",fontSize:9,
                background:"rgba(194,158,102,0.2)",color:C.gold,
                fontFamily:"'JetBrains Mono',monospace",
              }}>{pendingAppts}</span>}
            </button>
          );
        })}
      </nav>
      <div style={{padding:"16px 24px",borderTop:`1px solid ${C.bdr}`}}>
        <button onClick={onLogout} style={{
          width:"100%",padding:"10px",background:"transparent",
          border:`1px solid ${C.bdr}`,color:C.muted,cursor:"pointer",
          fontFamily:"'Outfit',sans-serif",fontSize:11,letterSpacing:"0.1em",textTransform:"uppercase",
        }}>Cerrar sesión</button>
      </div>
    </div>
  );

  return (
    <div style={{display:"flex",height:"100vh",background:C.bg,color:C.text,fontFamily:"'Outfit',sans-serif"}}>
      <style>{`
        .admin-sidebar-desktop{display:flex!important;}
        .admin-topbar-mobile{display:none!important;}
        @media(max-width:768px){
          .admin-sidebar-desktop{display:none!important;}
          .admin-topbar-mobile{display:flex!important;}
        }
      `}</style>
      {/* Desktop sidebar */}
      <div style={{
        width:220,flexShrink:0,borderRight:`1px solid ${C.bdr}`,
        display:"flex",flexDirection:"column",
      }} className="admin-sidebar-desktop">
        {navContent}
      </div>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div style={{position:"fixed",inset:0,zIndex:100,display:"flex"}}>
          <div style={{width:240,background:C.bg,borderRight:`1px solid ${C.bdr}`,height:"100%"}}>
            {navContent}
          </div>
          <div style={{flex:1,background:"rgba(0,0,0,0.5)"}} onClick={()=>setMobileOpen(false)}/>
        </div>
      )}

      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Banner de sobredemanda: turnos que se cruzan creados desde Reservar turno */}
        {activeWarnings.length>0 && (
          <div style={{flexShrink:0,background:"rgba(196,102,102,0.08)",borderBottom:`1px solid ${C.red}40`}}>
            {activeWarnings.map(w=>(
              <div key={w.id} style={{
                padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,
                fontSize:12,color:C.text,lineHeight:1.5,
              }}>
                <span>
                  ⚠ <strong style={{color:C.red}}>Sobredemanda</strong> · {w.stylist}: {formatTime12h(w.time)}–{formatTime12h(w.end)} ({fmtDateShort(w.date)}) se
                  cruza con el turno de {w.withName} ({w.withTime}–{w.withEnd}).
                </span>
                <button onClick={()=>dismissWarning(w.id)} style={{
                  flexShrink:0,background:"transparent",border:`1px solid ${C.red}40`,color:C.red,
                  cursor:"pointer",padding:"4px 10px",fontFamily:"'JetBrains Mono',monospace",
                  fontSize:9,letterSpacing:"0.08em",
                }}>✕</button>
              </div>
            ))}
          </div>
        )}
        {/* Mobile topbar */}
        <div style={{
          padding:"12px 20px",borderBottom:`1px solid ${C.bdr}`,
          display:"flex",alignItems:"center",justifyContent:"space-between",
        }} className="admin-topbar-mobile">
          <button onClick={()=>setMobileOpen(true)} style={{
            background:"none",border:"none",color:C.text,cursor:"pointer",fontSize:20,
          }}>☰</button>
          <Mono style={{color:C.gold,fontSize:10}}>{emp.name}</Mono>
          <button onClick={onLogout} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11}}>✕</button>
        </div>
        <main style={{flex:1,overflowY:"auto"}}>
          {children}
        </main>
      </div>
    </div>
  );
};

// ==================== ROOT ====================
const AdminPortal = () => {
  const [authed,setAuthed]     = React.useState(isAuthed);
  const [empSes,setEmpSes]     = React.useState(getEmpSession);
  const [view,setView]         = React.useState(() => (!isAuthed() && !!getEmpSession()) ? "agenda" : "dashboard");
  const [navParam,setNavParam] = React.useState(null);

  const nav = React.useCallback((v, param=null) => {
    setView(v);
    setNavParam(param);
  }, []);

  const isAdmin = authed;
  const isEmp   = !authed && !!empSes;

  const logout = () => {
    doLogout(); doEmpLogout();
    setAuthed(false); setEmpSes(null);
  };

  if (!isAdmin && !isEmp) return (
    <LoginView
      onAdminSuccess={()=>setAuthed(true)}
      onEmpSuccess={(e)=>setEmpSes(e)}
    />
  );

  // --- Employee portal ---
  if (isEmp) {
    const EmpViewComponent = {
      agenda:         (p)=><EmpAgendaView          {...p} emp={empSes} onNav={nav}/>,
      calendario:     (p)=><EmpCalendarView        {...p} emp={empSes} onNav={nav}/>,
      reservar:     (p)=><EmpBookingView         {...p} emp={empSes} onNav={nav}/>,
      confirmaciones: (p)=><EmpAppointmentsView    {...p} emp={empSes} tab="confirmaciones"/>,
      todas:          (p)=><EmpAppointmentsView    {...p} emp={empSes} tab="todas"/>,
      horario:        (p)=><EmpWorkHoursView       {...p} emp={empSes}/>,
      ausencias:      (p)=><EmpAbsencesView        {...p} emp={empSes}/>,
      ayuda:          (p)=><EmpHelpView            {...p} onNav={nav}/>,
    }[view] || ((p)=><EmpAgendaView {...p} emp={empSes} onNav={nav}/>);
    return (
      <EmpShell emp={empSes} onLogout={logout} activeView={view} onNav={nav}>
        <EmpViewComponent />
      </EmpShell>
    );
  }

  // --- Admin portal ---
  const ViewComponent = {
    dashboard:           DashboardView,
    agenda:              AgendaView,
    appointments:        AppointmentsView,
    clients:             CrmView,
    blockslots:          BlockSlotsView,
    revenue:             RevenueView,
    commissions:         CommissionsView,
    employees:           EmployeesView,
    services:            ServicesView,
    settings:            SettingsView,
    "stylist-settings": StylistSettingsView,
    help:                HelpView,
  }[view] || DashboardView;

  return (
    <AdminShell activeView={view=="stylist-settings"?"settings":view} onNav={nav} onLogout={logout}>
      <ViewComponent onNav={nav} empId={navParam} />
    </AdminShell>
  );
};

Object.assign(window, { AdminPortal });
