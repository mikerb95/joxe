// JOXE Admin Portal — Panel de gestión del barbero

// ==================== STORES (Turso via API + localStorage cache) ====================
const ADMIN_KEY = "joxe_admin_v1";
const APPT_KEY  = "joxe_turnos_v1";
const SES_KEY   = "joxe_admin_session"; // stores the password as session token

const EMP_SES_KEY = "joxe_emp_session"; // { id, name, role } for employee sessions

// ---- Auth helpers — admin ----
const getToken   = () => sessionStorage.getItem(SES_KEY) ?? "";
const isAuthed   = () => !!sessionStorage.getItem(SES_KEY);
const doLogin    = (pw) => sessionStorage.setItem(SES_KEY, pw);
const doLogout   = () => { sessionStorage.removeItem(SES_KEY); sessionStorage.removeItem(EMP_SES_KEY); };

// ---- Auth helpers — employee ----
const getEmpSession  = () => { try { return JSON.parse(sessionStorage.getItem(EMP_SES_KEY)); } catch { return null; } };
const isEmpAuthed    = () => !!sessionStorage.getItem(EMP_SES_KEY);
const doEmpLogin     = (emp) => sessionStorage.setItem(EMP_SES_KEY, JSON.stringify(emp));
const doEmpLogout    = () => sessionStorage.removeItem(EMP_SES_KEY);

const adminHeaders = () => ({
  "Content-Type": "application/json",
  "Authorization": `Bearer ${getToken()}`,
});

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

  const pull = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin", { headers: adminHeaders() });
      if (res.status === 401) { doLogout(); return; }
      if (!res.ok) return;
      const data = await res.json();
      localStorage.setItem(ADMIN_KEY, JSON.stringify(data));
      setA(prev => ({ ...prev, ...data }));
    } catch {}
  }, []);

  React.useEffect(() => {
    if (!isAuthed()) return;
    pull();
    const t = setInterval(pull, 8000);
    return () => clearInterval(t);
  }, [pull]);

  const setAdmin = React.useCallback(async (fn) => {
    const current = loadAdminCache();
    const next = typeof fn === "function" ? fn(current) : fn;
    setA(next);
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
  }, []);

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

  React.useEffect(() => {
    if (!isAuthed()) return;
    pull();
    const t = setInterval(pull, 10000);
    return () => clearInterval(t);
  }, [pull]);

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
const DEFAULT_APPTS = () => ({ appointments:[], active:[], completed:[], blockedSlots:[] });

const loadApptCache = () => {
  try {
    const s = JSON.parse(localStorage.getItem(APPT_KEY));
    return s ? { ...DEFAULT_APPTS(), ...s } : DEFAULT_APPTS();
  } catch { return DEFAULT_APPTS(); }
};

const useAppts = () => {
  const [s, setS] = React.useState(loadApptCache);

  const pull = React.useCallback(async () => {
    try {
      const res = await fetch("/api/store");
      if (!res.ok) return;
      const data = await res.json();
      localStorage.setItem(APPT_KEY, JSON.stringify(data));
      setS(data);
    } catch {}
  }, []);

  React.useEffect(() => {
    pull();
    const t = setInterval(pull, 5000);
    let bc;
    try {
      bc = new BroadcastChannel("joxe_turnos");
      bc.addEventListener("message", pull);
    } catch {}
    return () => {
      clearInterval(t);
      try { bc?.close(); } catch {}
    };
  }, [pull]);

  const setAppts = React.useCallback(async (fn) => {
    const current = loadApptCache();
    const next = typeof fn === "function" ? fn(current) : fn;
    setS(next);
    localStorage.setItem(APPT_KEY, JSON.stringify(next));
    try {
      await fetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      try { new BroadcastChannel("joxe_turnos").postMessage({ type:"update" }); } catch {}
    } catch (err) {
      console.warn("[appts] save failed", err.message);
    }
  }, []);

  return [s, setAppts];
};

// ==================== HELPERS ====================
const todayStr = () => new Date().toISOString().split("T")[0];
const genId    = () => Math.random().toString(36).slice(2, 10);
const TIMES    = ["9:00","10:30","12:00","14:00","15:30","17:00"];
const METHODS  = ["Efectivo","Transferencia","Datáfono","Nequi"];
const ROLES    = ["Estilista","Colorista","Manicurista","Pedicurista","Barbero","Maquillador/a","Masajista","Recepcionista","Otro"];
const PAY_COLORS = { Efectivo:"#C29E66", Transferencia:"#8ab0ff", Datáfono:"#C46666", Nequi:"#66C499" };

const fmtCOP = (n) => n == null ? "—" : "$" + Number(n).toLocaleString("es-CO");
const fmtDateShort = (d) => !d ? "—" : new Date(d+"T12:00").toLocaleDateString("es-CO",{day:"numeric",month:"short"});
const fmtDateMed = (d) => !d ? "—" : new Date(d+"T12:00").toLocaleDateString("es-CO",{weekday:"short",day:"numeric",month:"short"});
const fmtDateTime = (ts) => !ts ? "—" : new Date(ts).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"});

const getAllAppts = (store, cancelledIds=[]) => {
  const activeIds = new Set(store.active.map(a=>a.id));
  const completedIds = new Set(store.completed.map(a=>a.id));
  const result = [];
  store.appointments.forEach(a => {
    if (activeIds.has(a.id) || completedIds.has(a.id)) return;
    result.push({...a, computedStatus: cancelledIds.includes(a.id) ? "cancelled" : "scheduled"});
  });
  store.active.forEach(a => {
    result.push({...a, computedStatus: cancelledIds.includes(a.id) ? "cancelled" : a.status});
  });
  store.completed.forEach(a => result.push({...a, computedStatus:"completed"}));
  return result.sort((a,b)=>{
    if ((b.date||"") !== (a.date||"")) return (b.date||"").localeCompare(a.date||"");
    return (a.time||"").localeCompare(b.time||"");
  });
};

const getWeekDates = (offset=0) => {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day===0?6:day-1) + offset*7);
  return Array.from({length:6},(_,i)=>{
    const d = new Date(monday); d.setDate(monday.getDate()+i);
    return d.toISOString().split("T")[0];
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

const QRCode = ({value,size=120,fg=C.text,bg=C.s2}) => {
  const grid = pseudoQR(value);
  const cell = size/grid.length;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{display:"block"}}>
      <rect width={size} height={size} fill={bg}/>
      {grid.map((row,y)=>row.map((on,x)=>on&&(
        <rect key={`${x}-${y}`} x={x*cell} y={y*cell} width={cell} height={cell} fill={fg}/>
      )))}
    </svg>
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
    scheduled:   {label:"Agendada",   bg:"rgba(194,158,102,0.12)",color:C.gold},
    waiting:     {label:"En cola",    bg:"rgba(138,176,255,0.12)",color:C.blue},
    "in-service":{label:"En silla",   bg:"rgba(102,196,153,0.15)",color:C.green},
    completed:   {label:"Completada", bg:"rgba(102,196,153,0.08)",color:C.green},
    cancelled:   {label:"Cancelada",  bg:"rgba(196,102,102,0.12)",color:C.red},
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
  {id:"revenue",     label:"Caja",             icon:"◎", tooltip:"Registro de ingresos y pagos"},
  {id:"employees",   label:"Empleados",        icon:"◉", tooltip:"Gestión del equipo y sus PINs"},
  {id:"services",    label:"Servicios",        icon:"✦", tooltip:"Catálogo de servicios y precios"},
  {id:"settings",    label:"Configuración",    icon:"⊛", tooltip:"Ajustes generales del salón"},
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
  <div style={{
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
        <div style={{paddingTop:0}} className="admin-page-inner">
          {children}
        </div>
      </div>
    </div>
  );
};

// ==================== LOGIN ====================
const LoginView = ({onAdminSuccess, onEmpSuccess}) => {
  const [mode,setMode]       = React.useState(null); // null | "admin" | "employee"
  const [pw,setPw]           = React.useState("");
  const [err,setErr]         = React.useState("");
  const [loading,setLoading] = React.useState(false);
  // employee flow
  const [empList,setEmpList]       = React.useState([]);
  const [selEmpId,setSelEmpId]     = React.useState("");
  const [pin,setPin]               = React.useState("");
  const [pinErr,setPinErr]         = React.useState("");

  React.useEffect(() => {
    // Load employees from localStorage cache (set by admin on this device)
    try {
      const cached = JSON.parse(localStorage.getItem(ADMIN_KEY));
      if (cached?.employees) setEmpList(cached.employees.filter(e=>e.active&&e.pin));
    } catch {}
  }, []);

  const attemptAdmin = async () => {
    setLoading(true); setErr("");
    try {
      const res  = await fetch("/api/auth", { method:"POST",
        headers:{"Content-Type":"application/json"}, body:JSON.stringify({password:pw}) });
      const data = await res.json();
      if (data.ok) { doLogin(pw); onAdminSuccess(); }
      else { setErr("Contraseña incorrecta. Intenta de nuevo."); setLoading(false); }
    } catch { setErr("Error de conexión."); setLoading(false); }
  };

  const attemptEmp = () => {
    setPinErr("");
    const emp = empList.find(e=>e.id===selEmpId);
    if (!emp) { setPinErr("Selecciona un empleado."); return; }
    if (emp.pin !== pin) { setPinErr("PIN incorrecto. Intenta de nuevo."); setPin(""); return; }
    doEmpLogin({ id:emp.id, name:emp.name, role:emp.role });
    onEmpSuccess({ id:emp.id, name:emp.name, role:emp.role });
  };

  const logoBlock = (
    <div style={{marginBottom:40,textAlign:"center"}}>
      <div style={{fontFamily:"'Marcellus',serif",fontSize:36,letterSpacing:"0.4em",color:C.text,marginBottom:8}}>
        JOXE
      </div>
      <Mono style={{color:C.gold,fontSize:10}}>Portal · Acceso</Mono>
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
            <button onClick={()=>{setMode(null);setPin("");setPinErr("");}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12}}>← Volver</button>
          </div>

          {empList.length===0 ? (
            <div style={{padding:"20px 0",textAlign:"center"}}>
              <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>
                No hay empleados con PIN configurado.<br/>
                El administrador debe asignar PINs desde el panel de empleados.
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

              <Btn onClick={attemptEmp} disabled={!selEmpId||!pin}
                style={{width:"100%",marginTop:20,padding:"14px"}}>
                Ingresar →
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

  const allAppts  = getAllAppts(appts, admin.cancelledIds||[]);
  const todayAll  = allAppts.filter(a=>a.date===todayD);
  const todayAct  = todayAll.filter(a=>!["cancelled","completed"].includes(a.computedStatus));
  const inQueue   = appts.active.filter(a=>a.status==="waiting").length;
  const inChair   = appts.active.filter(a=>a.status==="in-service").length;
  const completedToday = appts.completed.filter(a=>a.completedAt&&new Date(a.completedAt).toISOString().split("T")[0]===todayD).length;

  const revenueToday = (admin.revenue||[])
    .filter(r=>r.date===todayD)
    .reduce((s,r)=>s+Number(r.amount||0),0);

  const upcomingRaw = allAppts
    .filter(a=>a.date>todayD && a.computedStatus==="scheduled")
    .slice(0,5);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Panel · Resumen" />
      <div style={{padding:"24px 32px"}}>
        <div style={{
          display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",
          gap:16,marginBottom:32,
        }}>
          <StatCard label="Citas hoy" value={String(todayAct.length).padStart(2,"0")}
            sub={`${completedToday} completada${completedToday!==1?"s":""}`} />
          <StatCard label="En cola" value={String(inQueue).padStart(2,"0")}
            color={inQueue>0?C.blue:C.muted} />
          <StatCard label="En silla" value={String(inChair).padStart(2,"0")}
            color={inChair>0?C.green:C.muted} />
          <StatCard label="Ingresos hoy" value={revenueToday>0?fmtCOP(revenueToday):"$0"}
            color={revenueToday>0?C.green:C.muted} small />
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1.2fr 1fr",gap:20}}>
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
                    <Mono style={{color:C.gold,fontSize:12}}>{a.time}</Mono>
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
                        <div style={{fontSize:11,color:C.muted,marginTop:2}}>{a.time}</div>
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
                  {label:"Ver cola en vivo →",href:"JOXE Lobby.html"},
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
  const [weekOffset,setWeekOffset] = React.useState(0);
  const [appts] = useAppts();
  const [admin] = useAdmin();
  const dates = getWeekDates(weekOffset);
  const todayD = todayStr();
  const allAppts = getAllAppts(appts, admin.cancelledIds||[]);

  const DAYS_ES = ["Lun","Mar","Mié","Jue","Vie","Sáb"];

  return (
    <div>
      <PageHeader
        title="Agenda"
        subtitle="Calendario · Semana"
        action={
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <Btn variant="ghost" small onClick={()=>setWeekOffset(o=>o-1)}>← Ant</Btn>
            <Btn variant="ghost" small onClick={()=>setWeekOffset(0)}>Hoy</Btn>
            <Btn variant="ghost" small onClick={()=>setWeekOffset(o=>o+1)}>Sig →</Btn>
          </div>
        }
      />
      <div style={{padding:"24px 32px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:12}}>
          {dates.map((date,i)=>{
            const isToday = date===todayD;
            const dayAppts = allAppts.filter(a=>a.date===date);
            const blocked  = (appts.blockedSlots||[]).filter(b=>b.date===date);
            return (
              <div key={date} style={{
                background: isToday?"rgba(194,158,102,0.05)":C.s1,
                border:`1px solid ${isToday?C.gold:C.bdr}`,
                minHeight:180,
              }}>
                <div style={{
                  padding:"10px 14px",borderBottom:`1px solid ${C.bdr}`,
                  background:isToday?"rgba(194,158,102,0.1)":C.s2,
                }}>
                  <Mono style={{color:isToday?C.gold:C.muted,fontSize:9}}>{DAYS_ES[i]}</Mono>
                  <div style={{
                    fontFamily:"'Marcellus',serif",fontSize:22,
                    color:isToday?C.gold:C.text,marginTop:2,
                  }}>{new Date(date+"T12:00").getDate()}</div>
                  <div style={{fontSize:10,color:C.muted}}>
                    {new Date(date+"T12:00").toLocaleDateString("es-CO",{month:"short"})}
                  </div>
                </div>
                <div style={{padding:8,display:"flex",flexDirection:"column",gap:4}}>
                  {blocked.map(b=>(
                    <div key={b.id} style={{
                      padding:"5px 8px",background:"rgba(196,102,102,0.1)",
                      border:`1px solid ${C.red}30`,fontSize:10,color:C.red,
                    }}>
                      <Mono style={{fontSize:9,color:C.red}}>{b.time}</Mono>
                      <div style={{marginTop:2,opacity:0.8}}>Bloqueado</div>
                    </div>
                  ))}
                  {dayAppts.map(a=>(
                    <div key={a.id} style={{
                      padding:"5px 8px",
                      background:a.computedStatus==="cancelled"?"rgba(196,102,102,0.06)":
                                 a.computedStatus==="completed"?"rgba(102,196,153,0.06)":"rgba(194,158,102,0.08)",
                      border:`1px solid ${
                        a.computedStatus==="cancelled"?C.red+"30":
                        a.computedStatus==="completed"?C.green+"30":C.gold+"30"
                      }`,
                    }}>
                      <Mono style={{fontSize:9,color:
                        a.computedStatus==="cancelled"?C.red:
                        a.computedStatus==="completed"?C.green:C.gold}}>
                        {a.time}
                      </Mono>
                      <div style={{fontSize:11,color:C.text,marginTop:2,
                        opacity:a.computedStatus==="cancelled"?0.4:1}}>
                        {a.name?.split(" ")[0]}
                      </div>
                      <div style={{fontSize:10,color:C.muted}}>{a.service?.slice(0,14)}</div>
                    </div>
                  ))}
                  {dayAppts.length===0 && blocked.length===0 && (
                    <div style={{fontSize:10,color:C.muted2,padding:"6px 4px",textAlign:"center"}}>
                      Libre
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{display:"flex",gap:24,marginTop:20,flexWrap:"wrap"}}>
          {[
            {color:C.gold,label:"Agendada"},
            {color:C.green,label:"Completada"},
            {color:C.red,label:"Cancelada / Bloqueada"},
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

  const all = getAllAppts(appts, admin.cancelledIds||[]);
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

  const registerPay = (appt) => {
    setPayForm({
      apptId:appt.id, date:appt.date||todayStr(),
      amount:"", service:appt.service||"", client:appt.name||"",
      phone:appt.phone||"", method:"Efectivo", note:"", addLoyalty:true,
    });
  };

  const submitPay = () => {
    if (!payForm.amount) return;
    const {addLoyalty, phone, ...entry} = payForm;
    setAdmin(a=>({...a, revenue:[...a.revenue, {
      id:genId(), ...entry, amount:Number(entry.amount), createdAt:Date.now(),
    }]}));
    if (addLoyalty && phone && (admin.loyalty?.enabled)) {
      const key = phone.replace(/\D/g,"");
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
          <a href="JOXE Booking.html" style={{
            padding:"11px 20px",background:C.gold,color:"#0C0C0C",textDecoration:"none",
            fontFamily:"'Outfit',sans-serif",fontSize:12,letterSpacing:"0.12em",
            textTransform:"uppercase",
          }}>+ Nueva cita</a>
        }
      />

      {/* Filters */}
      <div style={{
        padding:"16px 32px",borderBottom:`1px solid ${C.bdr}`,
        display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end",
      }}>
        <FieldInput placeholder="Buscar nombre, tel, servicio…" value={filter.search}
          onChange={e=>setFilter({...filter,search:e.target.value})}
          style={{minWidth:220,flex:1}} />
        <FieldSelect value={filter.status} onChange={e=>setFilter({...filter,status:e.target.value})}
          options={[
            {value:"",label:"Todos los estados"},
            {value:"scheduled",label:"Agendadas"},
            {value:"waiting",label:"En cola"},
            {value:"in-service",label:"En silla"},
            {value:"completed",label:"Completadas"},
            {value:"cancelled",label:"Canceladas"},
          ]} style={{minWidth:180}} />
        <FieldInput type="date" value={filter.date}
          onChange={e=>setFilter({...filter,date:e.target.value})} style={{minWidth:160}} />
        <Btn variant="ghost" small onClick={()=>setFilter({status:"",date:"",search:""})}>
          Limpiar
        </Btn>
      </div>

      <div style={{padding:"16px 32px"}}>
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
                    style={{
                      display:"grid",gridTemplateColumns:"56px 60px 1fr 140px 120px 120px",
                      gap:12,padding:"14px 18px",cursor:"pointer",alignItems:"center",
                    }}
                  >
                    <Mono style={{color:C.gold,fontSize:10}}>{a.time||"—"}</Mono>
                    <Mono style={{color:C.muted,fontSize:9}}>{fmtDateShort(a.date)}</Mono>
                    <div>
                      <div style={{fontSize:14}}>{a.name}</div>
                      <div style={{fontSize:11,color:C.muted}}>{a.service}</div>
                    </div>
                    <div style={{fontSize:12,color:C.muted}}>{a.stylist}</div>
                    <Badge status={a.computedStatus}/>
                    <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                      {hasPayment && <span style={{fontSize:10,color:C.green}}>✓ Pagado</span>}
                      <span style={{color:C.muted,fontSize:14}}>{isExp?"▲":"▼"}</span>
                    </div>
                  </div>

                  {isExp && (
                    <div style={{
                      padding:"16px 18px",borderTop:`1px solid ${C.bdr}`,
                      display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,
                      background:C.s2,
                    }}>
                      <div style={{display:"flex",flexDirection:"column",gap:10}}>
                        {[
                          ["Ticket",a.code],
                          ["WhatsApp",a.phone],
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
                        {a.computedStatus!=="cancelled" && a.computedStatus!=="completed" && (
                          <Btn variant="danger" small onClick={()=>cancelAppt(a.id)}>
                            ✕ Cancelar cita
                          </Btn>
                        )}
                        {a.computedStatus!=="cancelled" && !hasPayment && (
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
                        {a.phone && (
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
  const byPhone = {};
  all.filter(a => a.phone).forEach(a => {
    const k = (a.phone || "").replace(/\D/g, "");
    if (!byPhone[k]) byPhone[k] = { name: a.name, phone: k, rawPhone: a.phone, appts: [] };
    byPhone[k].appts.push(a);
    if (a.createdAt >= (byPhone[k].latestAt || 0)) {
      byPhone[k].name = a.name; byPhone[k].latestAt = a.createdAt || 0;
    }
  });

  const clients = Object.entries(byPhone).map(([phone, base]) => {
    const cd = crm[phone] || {};
    const completed = base.appts.filter(a => a.computedStatus === "completed");
    return {
      phone, name: base.name, rawPhone: base.rawPhone,
      email: cd.email || "", birthday: cd.birthday || "", notes: cd.notes || "",
      loyaltyVisits: cd.loyaltyVisits || 0, loyaltyRedeemed: cd.loyaltyRedeemed || 0,
      totalVisits: completed.length,
      lastVisit: completed.sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0]?.date || null,
      totalSpent: (admin.revenue || []).filter(r => base.appts.some(a => a.id === r.apptId))
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
      return c.name.toLowerCase().includes(q) || c.phone.includes(q);
    }
    return true;
  });

  const startEdit = (c) => {
    setEditing(c.phone);
    setEditForm({ email: c.email, birthday: c.birthday, notes: c.notes });
  };

  const saveEdit = (phone) => {
    setCrm(d => ({ ...d, [phone]: { ...(d[phone] || {}), ...editForm, updatedAt: Date.now() } }));
    setEditing(null);
  };

  const addVisit = (phone) => setCrm(d => ({
    ...d, [phone]: { ...(d[phone]||{}), loyaltyVisits:(d[phone]?.loyaltyVisits||0)+1, updatedAt:Date.now() }
  }));

  const removeVisit = (phone) => {
    const cur = crm[phone]?.loyaltyVisits || 0;
    if (cur <= 0) return;
    setCrm(d => ({ ...d, [phone]: { ...(d[phone]||{}), loyaltyVisits:cur-1, updatedAt:Date.now() } }));
  };

  const redeem = (phone, c) => {
    if (!confirm(`¿Canjear "${loyalty.reward}" para ${c.name}?`)) return;
    setCrm(d => ({
      ...d, [phone]: {
        ...(d[phone]||{}),
        loyaltyVisits: Math.max(0, (d[phone]?.loyaltyVisits||0) - loyalty.target),
        loyaltyRedeemed: (d[phone]?.loyaltyRedeemed||0) + 1,
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
              const isExp = expanded===c.phone;
              const isEditing = editing===c.phone;
              const ready = loyalty.enabled && c.loyaltyVisits >= loyalty.target;
              return (
                <div key={c.phone} style={{border:`1px solid ${ready?C.green+"60":C.bdr}`,background:C.s1}}>
                  <div onClick={()=>setExpanded(isExp?null:c.phone)} style={{
                    display:"grid",
                    gridTemplateColumns:loyalty.enabled?"200px 110px 60px 100px 1fr auto":"200px 110px 60px 100px auto",
                    gap:12,padding:"14px 18px",cursor:"pointer",alignItems:"center",
                  }}>
                    <div>
                      <div style={{fontSize:14}}>{c.name}</div>
                      <div style={{fontSize:11,color:C.muted,fontFamily:"'JetBrains Mono',monospace"}}>{c.phone}</div>
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
                                <Btn small onClick={()=>saveEdit(c.phone)}>Guardar</Btn>
                                <Btn small variant="ghost" onClick={()=>setEditing(null)}>Cancelar</Btn>
                              </div>
                            </div>
                          ) : (
                            <div style={{display:"flex",flexDirection:"column",gap:10}}>
                              {[["Email",c.email],["Cumpleaños",c.birthday?fmtDateShort(c.birthday):null],["Notas",c.notes]].map(([k,v])=>(
                                <div key={k}>
                                  <Mono style={{color:C.muted,fontSize:9,display:"block"}}>{k}</Mono>
                                  <div style={{fontSize:13,marginTop:2,color:v?C.text:C.muted}}>{v||"—"}</div>
                                </div>
                              ))}
                              <div style={{display:"flex",gap:8,marginTop:4}}>
                                <Btn small variant="subtle" onClick={()=>startEdit(c)}>✎ Editar</Btn>
                                {c.rawPhone && (
                                  <a href={`https://wa.me/57${c.rawPhone.replace(/\D/g,"")}`}
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
                                <Btn small onClick={()=>redeem(c.phone,c)}
                                  style={{background:C.green,color:"#0C0C0C",border:"none"}}>
                                  ✓ Canjear {loyalty.reward}
                                </Btn>
                              )}
                              <div style={{display:"flex",gap:6}}>
                                <Btn small variant="subtle" onClick={()=>addVisit(c.phone)}>+ Visita</Btn>
                                <Btn small variant="ghost" onClick={()=>removeVisit(c.phone)}>− Visita</Btn>
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
                                <Mono style={{color:C.gold,fontSize:9}}>{a.time}</Mono>
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
const BlockSlotsView = () => {
  const [appts,setAppts] = useAppts();
  const [date,setDate] = React.useState(todayStr());
  const [reason,setReason] = React.useState("");
  const [hoveredTime,setHoveredTime] = React.useState(null);

  const ALL_TIMES = ["9:00","9:30","10:00","10:30","11:00","11:30",
    "12:00","12:30","13:00","13:30","14:00","14:30",
    "15:00","15:30","16:00","16:30","17:00","17:30","18:00"];

  const blocked = (appts.blockedSlots||[]).filter(b=>b.date===date);
  const blockedTimes = new Set(blocked.map(b=>b.time));

  const toggleSlot = (time) => {
    if (blockedTimes.has(time)) {
      setAppts(s=>({...s, blockedSlots:(s.blockedSlots||[]).filter(b=>!(b.date===date&&b.time===time))}));
    } else {
      setAppts(s=>({...s, blockedSlots:[...(s.blockedSlots||[]),{
        id:genId(), date, time, reason:reason||"No disponible",
      }]}));
    }
  };

  const clearDay = () => {
    if (!confirm(`¿Desbloquear todas las horas del ${fmtDateShort(date)}?`)) return;
    setAppts(s=>({...s, blockedSlots:(s.blockedSlots||[]).filter(b=>b.date!==date)}));
  };

  const allBlockedDates = [...new Set((appts.blockedSlots||[]).map(b=>b.date))].sort().reverse();

  return (
    <div>
      <PageHeader title="Bloquear horas" subtitle="Agenda · Disponibilidad" />
      <div style={{padding:"24px 32px",display:"grid",gridTemplateColumns:"1fr 320px",gap:24}}>
        <Card>
          <div style={{display:"flex",gap:16,alignItems:"flex-end",marginBottom:24,flexWrap:"wrap"}}>
            <FieldInput label="Fecha" type="date" value={date}
              onChange={e=>setDate(e.target.value)} style={{minWidth:180}} />
            <FieldInput label="Motivo (opcional)" value={reason}
              onChange={e=>setReason(e.target.value)} placeholder="Almuerzo, descanso…"
              style={{flex:1}} />
            {blocked.length>0 && (
              <Btn variant="danger" small onClick={clearDay}>
                Desbloquear todo
              </Btn>
            )}
          </div>

          <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:12}}>
            {fmtDateMed(date)} — haz clic para bloquear/desbloquear
          </Mono>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:8}}>
            {ALL_TIMES.map(t=>{
              const isBlocked = blockedTimes.has(t);
              const isBookingTime = TIMES.includes(t);
              return (
                <button key={t} onClick={()=>toggleSlot(t)}
                  onMouseEnter={()=>setHoveredTime(t)}
                  onMouseLeave={()=>setHoveredTime(null)}
                  style={{
                    padding:"12px 8px",
                    background:isBlocked?"rgba(196,102,102,0.15)":
                               hoveredTime===t?"rgba(194,158,102,0.1)":C.s2,
                    border:`1px solid ${isBlocked?C.red+"60":isBookingTime?C.gold+"40":C.bdr}`,
                    color:isBlocked?C.red:C.text,cursor:"pointer",
                    fontFamily:"'JetBrains Mono',monospace",fontSize:13,
                    display:"flex",flexDirection:"column",alignItems:"center",gap:4,
                    transition:"all 0.15s",
                  }}>
                  {t}
                  {isBlocked && <span style={{fontSize:9,color:C.red}}>BLOQ</span>}
                  {!isBlocked && isBookingTime && <span style={{fontSize:8,color:C.gold+"80"}}>★</span>}
                </button>
              );
            })}
          </div>
          <div style={{marginTop:16,display:"flex",gap:20,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:8,height:8,background:C.red,opacity:0.6}}/>
              <Mono style={{color:C.muted,fontSize:9}}>Bloqueado</Mono>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:8,height:8,background:C.gold,opacity:0.4}}/>
              <Mono style={{color:C.muted,fontSize:9}}>Hora de reserva (★)</Mono>
            </div>
          </div>
        </Card>

        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card>
            <Mono style={{color:C.gold,display:"block",marginBottom:12}}>
              Bloqueado hoy · {blocked.length}
            </Mono>
            {blocked.length===0 ? (
              <div style={{color:C.muted,fontSize:12}}>Sin bloqueos para esta fecha.</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {blocked.sort((a,b)=>a.time.localeCompare(b.time)).map(b=>(
                  <div key={b.id} style={{
                    display:"flex",justifyContent:"space-between",alignItems:"center",
                    padding:"8px 12px",background:C.s2,
                  }}>
                    <div>
                      <Mono style={{color:C.red,fontSize:11}}>{b.time}</Mono>
                      {b.reason && b.reason!=="No disponible" && (
                        <div style={{fontSize:10,color:C.muted,marginTop:2}}>{b.reason}</div>
                      )}
                    </div>
                    <button onClick={()=>toggleSlot(b.time)} style={{
                      background:"transparent",border:"none",color:C.muted,
                      cursor:"pointer",fontSize:14,padding:"2px 6px",
                    }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <Mono style={{color:C.muted,display:"block",marginBottom:12,fontSize:9}}>
              Otros días con bloqueos
            </Mono>
            {allBlockedDates.filter(d=>d!==date).slice(0,8).map(d=>{
              const cnt = (appts.blockedSlots||[]).filter(b=>b.date===d).length;
              return (
                <button key={d} onClick={()=>setDate(d)} style={{
                  display:"flex",justifyContent:"space-between",alignItems:"center",
                  width:"100%",padding:"8px 0",background:"transparent",border:"none",
                  borderBottom:`1px solid ${C.bdr}`,cursor:"pointer",color:C.text,
                  fontFamily:"'Outfit',sans-serif",fontSize:13,
                }}>
                  <span>{fmtDateMed(d)}</span>
                  <Mono style={{color:C.red,fontSize:10}}>{cnt} bloq</Mono>
                </button>
              );
            })}
            {allBlockedDates.filter(d=>d!==date).length===0 && (
              <div style={{fontSize:12,color:C.muted}}>Sin otros días bloqueados.</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

// ==================== REVENUE ====================
const RevenueView = () => {
  const [admin,setAdmin] = useAdmin();
  const [showForm,setShowForm] = React.useState(false);
  const [period,setPeriod] = React.useState("today");
  const [showDaySummary,setShowDaySummary] = React.useState(false);
  const [form,setForm] = React.useState({date:todayStr(),amount:"",service:"",client:"",method:"Efectivo",note:"",stylist:""});

  const revenue   = admin.revenue||[];
  const employees = (admin.employees||[]).filter(e=>e.active);
  const todayD    = todayStr();
  const now       = new Date();
  const weekStart = (() => {
    const d=new Date(now); d.setDate(now.getDate()-(now.getDay()===0?6:now.getDay()-1));
    return d.toISOString().split("T")[0];
  })();
  const monthStart = todayD.slice(0,7)+"-01";

  const filtered = revenue.filter(r=>{
    if (period==="today")  return r.date===todayD;
    if (period==="week")   return r.date>=weekStart;
    if (period==="month")  return r.date>=monthStart;
    return true;
  }).sort((a,b)=>(b.date||"").localeCompare(a.date||""));

  const total = filtered.reduce((s,r)=>s+Number(r.amount||0),0);

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

  const submitEntry = () => {
    if (!form.amount||!form.date) return;
    setAdmin(a=>({...a, revenue:[...a.revenue,{
      id:genId(),...form,amount:Number(form.amount),createdAt:Date.now(),
    }]}));
    setForm({date:todayStr(),amount:"",service:"",client:"",method:"Efectivo",note:"",stylist:""});
    setShowForm(false);
  };

  const deleteEntry = (id) => {
    if (!confirm("¿Eliminar este ingreso?")) return;
    setAdmin(a=>({...a, revenue:a.revenue.filter(r=>r.id!==id)}));
  };

  const PERIODS = [
    {id:"today",label:"Hoy"},
    {id:"week",label:"Esta semana"},
    {id:"month",label:"Este mes"},
    {id:"all",label:"Todos"},
  ];

  return (
    <div>
      <PageHeader title="Caja" subtitle="Ingresos · Pagos"
        action={
          <div style={{display:"flex",gap:8}}>
            <Btn variant="ghost" onClick={()=>setShowDaySummary(s=>!s)}>
              {showDaySummary?"Ocultar cierre":"Cierre del día"}
            </Btn>
            <Btn onClick={()=>setShowForm(!showForm)}>
              {showForm?"Cancelar":"+ Registrar ingreso"}
            </Btn>
          </div>
        }
      />

      {showForm && (
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
            <div style={{fontFamily:"'Marcellus',serif",fontSize:32,color:C.green}}>
              {fmtCOP(todayTotal)}
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

        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:16,marginBottom:28}}>
          <StatCard label={PERIODS.find(p=>p.id===period)?.label||"Periodo"} value={fmtCOP(total)} small
            color={total>0?C.green:C.muted} sub={`${filtered.length} transacción${filtered.length!==1?"es":""}`} />
          {Object.entries(byMethod).map(([m,v])=>(
            <StatCard key={m} label={m} value={fmtCOP(v)} small
              color={PAY_COLORS[m]||C.muted} />
          ))}
        </div>

        {/* Employee breakdown */}
        {Object.keys(byEmployee).length>0 && (
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
        {Object.keys(byService).length>0 && (
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
        {filtered.length===0 ? (
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
        )}
      </div>
    </div>
  );
};

// ==================== EMPLOYEES ====================
const EmployeesView = () => {
  const [admin,setAdmin] = useAdmin();
  const [showAdd,setShowAdd] = React.useState(false);
  const [editId,setEditId] = React.useState(null);
  const [editForm,setEditForm] = React.useState({});
  const [newEmp,setNewEmp] = React.useState({name:"",role:"Estilista",services:[],pin:""});
  const [chairQROpen,setChairQROpen] = React.useState(null);

  const employees = admin.employees || [];
  const services  = (admin.services||[]).filter(s=>s.active);
  const revenue   = admin.revenue||[];

  // Revenue per employee (all time)
  const revByEmp = {};
  revenue.forEach(r=>{
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
    const emp = { id:genId(), name:newEmp.name.trim(), role:newEmp.role, services:newEmp.services, active:true };
    // Also sync to stylists list for booking portal
    const stylists = [...(admin.stylists||[])];
    if (!stylists.includes(emp.name)) stylists.push(emp.name);
    setAdmin(a=>({...a, employees:[...(a.employees||[]),emp], stylists}));
    setNewEmp({name:"",role:"Estilista",services:[],pin:""});
    setShowAdd(false);
  };

  const startEdit = (e) => {
    setEditId(e.id);
    setEditForm({name:e.name,role:e.role,services:[...(e.services||[])],pin:e.pin||""});
  };

  const saveEdit = (id) => {
    const prev = employees.find(e=>e.id===id);
    const nameChanged = prev && prev.name !== editForm.name;
    let stylists = [...(admin.stylists||[])];
    if (nameChanged) {
      stylists = stylists.map(s=>s===prev.name?editForm.name:s);
    }
    setAdmin(a=>({...a,
      employees: a.employees.map(e=>e.id===id?{...e,...editForm}:e),
      stylists,
    }));
    setEditId(null);
  };

  const toggleActive = (id) => {
    setAdmin(a=>({...a, employees:a.employees.map(e=>e.id===id?{...e,active:!e.active}:e)}));
  };

  const deleteEmployee = (emp) => {
    if (!confirm(`¿Eliminar a ${emp.name}? También se quitará de la lista de estilistas del portal.`)) return;
    const stylists = (admin.stylists||[]).filter(s=>s!==emp.name);
    setAdmin(a=>({...a,
      employees: a.employees.filter(e=>e.id!==emp.id),
      stylists,
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
                    {chairQROpen===emp.id && (
                      <div style={{
                        marginTop:16,padding:"20px 24px",
                        background:C.s2,border:`1px solid ${C.bdr}`,
                        display:"flex",gap:32,alignItems:"flex-start",flexWrap:"wrap",
                      }}>
                        <div>
                          <Mono style={{color:C.gold,fontSize:9,display:"block",marginBottom:12}}>
                            QR de silla · {emp.name}
                          </Mono>
                          <QRCode value={`chair-${emp.id}`} size={120} fg={C.text} bg={C.s2} />
                        </div>
                        <div style={{flex:1,minWidth:200}}>
                          <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:8}}>
                            URL del QR (imprime o comparte)
                          </Mono>
                          <div style={{
                            fontFamily:"'JetBrains Mono',monospace",fontSize:11,
                            color:C.gold,background:C.s1,
                            border:`1px solid ${C.bdr}`,
                            padding:"10px 14px",wordBreak:"break-all",lineHeight:1.5,
                            marginBottom:12,
                          }}>
                            {window.location.origin}/JOXE CheckIn.html#chair-{emp.id}
                          </div>
                          <Mono style={{color:C.muted,fontSize:9,display:"block",lineHeight:1.6}}>
                            Pega esta URL en un generador de QR real (ej. qr-code-generator.com) e imprime el código para colocarlo en el espejo de la silla.
                          </Mono>
                        </div>
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
  const [newSvc,setNewSvc] = React.useState({name:"",price:"",dur:"",note:""});

  const services = admin.services||[];
  const revenue  = admin.revenue||[];

  const revenueByService = {};
  revenue.forEach(r=>{
    if (r.service) revenueByService[r.service]=(revenueByService[r.service]||0)+Number(r.amount||0);
  });

  const startEdit = (s) => {
    setEditId(s.id);
    setEditForm({name:s.name,price:s.price,dur:s.dur,note:s.note||""});
  };

  const saveEdit = (id) => {
    setAdmin(a=>({...a, services:a.services.map(s=>
      s.id===id ? {...s,...editForm,price:Number(editForm.price),dur:Number(editForm.dur)} : s
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
      id:genId(),...newSvc,price:Number(newSvc.price),dur:Number(newSvc.dur)||60,active:true,
    }]}));
    setNewSvc({name:"",price:"",dur:"",note:""});
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
const SettingsView = () => {
  const [admin,setAdmin] = useAdmin();
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
      const res  = await fetch("/api/auth", {
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

  const removeStylist = (s) => {
    setAdmin(a=>({...a,stylists:a.stylists.filter(x=>x!==s)}));
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
            {(admin.stylists||[]).map(s=>(
              <div key={s} style={{
                display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"10px 14px",background:C.s2,border:`1px solid ${C.bdr}`,
              }}>
                <span style={{fontSize:14}}>{s}</span>
                <button onClick={()=>removeStylist(s)} style={{
                  background:"transparent",border:"none",color:C.muted,
                  cursor:"pointer",fontSize:16,
                }}>✕</button>
              </div>
            ))}
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
            <Btn variant="danger" onClick={()=>{
              if (confirm("¿Borrar TODAS las citas y turnos? Esta acción no se puede deshacer.")) {
                localStorage.removeItem("joxe_turnos_v1");
                window.location.reload();
              }
            }}>Borrar todas las citas y turnos</Btn>
          </div>
        </Card>

        {/* Links */}
        <Card>
          <Mono style={{color:C.gold,display:"block",marginBottom:16}}>Accesos rápidos</Mono>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[
              {label:"Portal de reservas (cliente)",href:"JOXE Booking.html"},
              {label:"Escáner QR (recepción)",href:"JOXE Scan.html"},
              {label:"Pantalla de sala (lobby)",href:"JOXE Lobby.html"},
              {label:"Página principal",href:"JOXE Asesores de Imagen.html"},
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

// ==================== EMPLOYEE VIEWS ====================

const EmpDashboardView = ({emp, onNav}) => {
  const [appts]  = useAppts();
  const [admin]  = useAdmin();
  const todayD   = todayStr();

  const allAppts = getAllAppts(appts, admin.cancelledIds||[]);
  const myAppts  = allAppts.filter(a=>a.stylist===emp.name);
  const todayAll = myAppts.filter(a=>a.date===todayD);
  const pending  = myAppts.filter(a=>a.computedStatus==="scheduled"&&!a.confirmedBy);
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
                    <Mono style={{color:C.gold,fontSize:12}}>{a.time}</Mono>
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
                      <div style={{fontSize:11,color:C.muted}}>{fmtDateShort(a.date)} · {a.time} · {a.service}</div>
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
                        <div style={{fontSize:11,color:C.muted,marginTop:2}}>{a.time}</div>
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

const EmpAgendaView = ({emp}) => {
  const [appts]       = useAppts();
  const [admin]       = useAdmin();
  const [weekOffset,setWeekOffset] = React.useState(0);
  const weekDates     = getWeekDates(weekOffset);
  const todayD        = todayStr();

  const allAppts = getAllAppts(appts, admin.cancelledIds||[]);
  const myAppts  = allAppts.filter(a=>a.stylist===emp.name);

  const getSlotAppts = (date, time) =>
    myAppts.filter(a=>a.date===date&&a.time===time&&a.computedStatus!=="cancelled");

  const DAY_LABELS = ["Lun","Mar","Mié","Jue","Vie","Sáb"];

  return (
    <div>
      <PageHeader title="Mi Agenda" subtitle="Semana · Vista"/>
      <div style={{padding:"24px 32px"}}>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:20}}>
          <button onClick={()=>setWeekOffset(w=>w-1)} style={{
            padding:"7px 14px",background:C.s2,border:`1px solid ${C.bdr}`,
            color:C.text,cursor:"pointer",
          }}>←</button>
          <Mono style={{color:C.gold,fontSize:11,flex:1,textAlign:"center"}}>
            {fmtDateShort(weekDates[0])} — {fmtDateShort(weekDates[5])}
            {weekOffset===0&&<span style={{color:C.muted}}> · semana actual</span>}
          </Mono>
          <button onClick={()=>setWeekOffset(w=>w+1)} style={{
            padding:"7px 14px",background:C.s2,border:`1px solid ${C.bdr}`,
            color:C.text,cursor:"pointer",
          }}>→</button>
          <button onClick={()=>setWeekOffset(0)} style={{
            padding:"7px 14px",background:"transparent",border:`1px solid ${C.bdr}`,
            color:C.muted,cursor:"pointer",fontFamily:"'JetBrains Mono',monospace",fontSize:9,
          }}>Hoy</button>
        </div>

        <div style={{overflowX:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"70px repeat(6,1fr)",minWidth:640}}>
            {/* Header */}
            <div/>
            {weekDates.map((d,i)=>(
              <div key={d} style={{
                padding:"10px 8px",textAlign:"center",
                borderBottom:`2px solid ${d===todayD?C.gold:C.bdr}`,
              }}>
                <Mono style={{color:d===todayD?C.gold:C.muted,fontSize:9}}>{DAY_LABELS[i]}</Mono>
                <div style={{fontSize:15,fontFamily:"'Marcellus',serif",color:d===todayD?C.gold:C.text,marginTop:2}}>
                  {new Date(d+"T12:00").getDate()}
                </div>
              </div>
            ))}

            {/* Time rows */}
            {TIMES.map(t=>(
              <React.Fragment key={t}>
                <div style={{
                  padding:"12px 8px",textAlign:"right",
                  borderRight:`1px solid ${C.bdr}`,
                }}>
                  <Mono style={{color:C.muted,fontSize:9}}>{t}</Mono>
                </div>
                {weekDates.map(d=>{
                  const cell = getSlotAppts(d,t);
                  return (
                    <div key={d} style={{
                      minHeight:60,padding:4,
                      borderBottom:`1px solid ${C.bdr}`,
                      borderRight:`1px solid ${C.bdr}`,
                      background:d===todayD?"rgba(194,158,102,0.03)":"transparent",
                    }}>
                      {cell.map(a=>(
                        <div key={a.id} style={{
                          padding:"5px 8px",marginBottom:3,fontSize:11,
                          background: a.confirmedBy
                            ? "rgba(102,196,153,0.15)"
                            : "rgba(194,158,102,0.12)",
                          borderLeft:`3px solid ${a.confirmedBy?C.green:C.gold}`,
                          color:C.text,lineHeight:1.4,
                        }}>
                          <div style={{fontWeight:500}}>{a.name}</div>
                          <div style={{color:C.muted,fontSize:10}}>{a.service}</div>
                          {a.confirmedBy && <Mono style={{fontSize:8,color:C.green}}>✓ conf</Mono>}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
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

  const allAppts = getAllAppts(appts, admin.cancelledIds||[]);
  const myAppts  = allAppts.filter(a=>a.stylist===emp.name);

  const filtered = myAppts.filter(a=>{
    if (tab==="confirmaciones") return a.computedStatus==="scheduled"&&!a.confirmedBy;
    if (tab==="hoy") return a.date===todayStr();
    if (search) return a.name?.toLowerCase().includes(search.toLowerCase())||a.service?.toLowerCase().includes(search.toLowerCase());
    return true;
  }).sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(a.time||"").localeCompare(b.time||""));

  const confirmAppt = async (apptId) => {
    const confirmInList = (list) => list.map(a=>
      a.id===apptId ? {...a, confirmedBy:emp.name, confirmedAt:Date.now()} : a
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

  const pendingCount = myAppts.filter(a=>a.computedStatus==="scheduled"&&!a.confirmedBy).length;

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
                <Mono style={{color:C.gold,fontSize:11}}>{a.time||"—"}</Mono>
                <Mono style={{color:C.muted,fontSize:9}}>{fmtDateShort(a.date)}</Mono>
                <div>
                  <div style={{fontSize:14}}>{a.name}</div>
                  <div style={{fontSize:11,color:C.muted}}>{a.service}</div>
                  {a.phone&&<div style={{fontSize:11,color:C.muted}}>{a.phone}</div>}
                </div>
                <Badge status={a.computedStatus}/>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  {a.computedStatus==="scheduled"&&!a.confirmedBy && (
                    <>
                      <button onClick={()=>confirmAppt(a.id)} style={{
                        padding:"7px 16px",background:"rgba(102,196,153,0.1)",
                        border:`1px solid ${C.green}40`,color:C.green,
                        cursor:"pointer",fontFamily:"'JetBrains Mono',monospace",
                        fontSize:9,letterSpacing:"0.08em",textTransform:"uppercase",
                      }}>✓ Confirmar</button>
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
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---- Employee Shell ----
const EMP_VIEWS = [
  {id:"dashboard",     label:"Mi Resumen",     icon:"◈"},
  {id:"agenda",        label:"Mi Agenda",       icon:"▦"},
  {id:"confirmaciones",label:"Confirmar citas", icon:"◉"},
  {id:"todas",         label:"Mis Citas",       icon:"≡"},
];

const EmpShell = ({emp, onLogout, children, activeView, onNav}) => {
  const [mobileOpen,setMobileOpen] = React.useState(false);
  const pendingAppts = (() => {
    try {
      const s = JSON.parse(localStorage.getItem(APPT_KEY));
      const d = s ? {...DEFAULT_APPTS(),...s} : DEFAULT_APPTS();
      const a = JSON.parse(localStorage.getItem(ADMIN_KEY));
      const cancelled = a?.cancelledIds||[];
      return getAllAppts(d,cancelled).filter(x=>x.stylist===emp.name&&x.computedStatus==="scheduled"&&!x.confirmedBy).length;
    } catch { return 0; }
  })();

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
  const [authed,setAuthed]   = React.useState(isAuthed);
  const [empSes,setEmpSes]   = React.useState(getEmpSession);
  const [view,setView]       = React.useState("dashboard");

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
      dashboard:      (p)=><EmpDashboardView      {...p} emp={empSes} onNav={setView}/>,
      agenda:         (p)=><EmpAgendaView          {...p} emp={empSes}/>,
      confirmaciones: (p)=><EmpAppointmentsView    {...p} emp={empSes} tab="confirmaciones"/>,
      todas:          (p)=><EmpAppointmentsView    {...p} emp={empSes} tab="todas"/>,
    }[view] || ((p)=><EmpDashboardView {...p} emp={empSes} onNav={setView}/>);
    return (
      <EmpShell emp={empSes} onLogout={logout} activeView={view} onNav={setView}>
        <EmpViewComponent />
      </EmpShell>
    );
  }

  // --- Admin portal ---
  const ViewComponent = {
    dashboard:    DashboardView,
    agenda:       AgendaView,
    appointments: AppointmentsView,
    clients:      CrmView,
    blockslots:   BlockSlotsView,
    revenue:      RevenueView,
    employees:    EmployeesView,
    services:     ServicesView,
    settings:     SettingsView,
  }[view] || DashboardView;

  return (
    <AdminShell activeView={view} onNav={setView} onLogout={logout}>
      <ViewComponent onNav={setView} />
    </AdminShell>
  );
};

Object.assign(window, { AdminPortal });
