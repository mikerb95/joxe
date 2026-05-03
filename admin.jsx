// JOXE Admin Portal — Panel de gestión del barbero

// ==================== STORES (Turso via API + localStorage cache) ====================
const ADMIN_KEY = "joxe_admin_v1";
const APPT_KEY  = "joxe_turnos_v1";
const SES_KEY   = "joxe_admin_session"; // stores the password as session token

// ---- Auth helpers ----
const getToken  = () => sessionStorage.getItem(SES_KEY) ?? "";
const isAuthed  = () => !!sessionStorage.getItem(SES_KEY);
const doLogin   = (pw) => sessionStorage.setItem(SES_KEY, pw);
const doLogout  = () => sessionStorage.removeItem(SES_KEY);

const adminHeaders = () => ({
  "Content-Type": "application/json",
  "Authorization": `Bearer ${getToken()}`,
});

// ---- Admin store (services, revenue, settings) ----
const DEFAULT_ADMIN = () => ({
  salonName: "JOXE",
  stylists: ["Joxe G.", "Laura M.", "Camila R."],
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
  revenue: [],
});

const loadAdminCache = () => {
  try {
    const s = JSON.parse(localStorage.getItem(ADMIN_KEY));
    const d = DEFAULT_ADMIN();
    return s ? { ...d, ...s, services: s.services || d.services } : d;
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

const FieldInput = ({label,value,onChange,type="text",placeholder,style,min,max}) => (
  <div style={{display:"flex",flexDirection:"column",gap:6,...style}}>
    {label && <Mono style={{color:C.muted,fontSize:9}}>{label}</Mono>}
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} min={min} max={max}
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
      {options.map(o=>(
        <option key={o.value||o} value={o.value||o}>{o.label||o}</option>
      ))}
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
  {id:"dashboard",  label:"Dashboard",       icon:"◈"},
  {id:"agenda",     label:"Agenda",           icon:"▦"},
  {id:"appointments",label:"Citas",           icon:"≡"},
  {id:"clients",    label:"Clientes",         icon:"◯"},
  {id:"blockslots", label:"Bloquear horas",   icon:"⊘"},
  {id:"revenue",    label:"Caja",             icon:"◎"},
  {id:"services",   label:"Servicios",        icon:"✦"},
  {id:"settings",   label:"Configuración",    icon:"⊛"},
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
            <button key={v.id} onClick={()=>{onNav(v.id);onClose&&onClose();}} style={{
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
const LoginView = ({onSuccess}) => {
  const [pw,setPw] = React.useState("");
  const [err,setErr] = React.useState("");
  const [loading,setLoading] = React.useState(false);

  const attempt = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (data.ok) { doLogin(pw); onSuccess(); }
      else { setErr("Contraseña incorrecta. Intenta de nuevo."); setLoading(false); }
    } catch {
      setErr("Error de conexión. Verifica tu internet.");
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight:"100vh",background:C.bg,display:"flex",
      alignItems:"center",justifyContent:"center",padding:24,
    }}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{marginBottom:40,textAlign:"center"}}>
          <div style={{fontFamily:"'Marcellus',serif",fontSize:36,letterSpacing:"0.4em",color:C.text,marginBottom:8}}>
            JOXE
          </div>
          <Mono style={{color:C.gold,fontSize:10}}>Portal · Administración</Mono>
        </div>
        <Card>
          <h2 style={{fontFamily:"'Marcellus',serif",fontWeight:400,fontSize:24,
            margin:"0 0 24px",color:C.text}}>Acceso al panel</h2>
          <FieldInput label="Contraseña" type="password" value={pw}
            onChange={e=>{setPw(e.target.value);setErr("");}}
            placeholder="••••••••" />
          {err && (
            <div style={{marginTop:12,padding:"10px 14px",
              background:"rgba(196,102,102,0.1)",border:`1px solid ${C.red}40`,
              fontSize:13,color:C.red}}>
              {err}
            </div>
          )}
          <Btn onClick={attempt} disabled={!pw||loading}
            style={{width:"100%",marginTop:20,padding:"14px"}}>
            {loading?"Verificando...":"Entrar →"}
          </Btn>
          <div style={{marginTop:16,fontSize:12,color:C.muted,textAlign:"center"}}>
            Contraseña por defecto: <Mono style={{color:C.gold,fontSize:10}}>joxe2026</Mono>
          </div>
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
      method:"Efectivo", note:"",
    });
  };

  const submitPay = () => {
    if (!payForm.amount) return;
    setAdmin(a=>({...a, revenue:[...a.revenue, {
      id:genId(), ...payForm, amount:Number(payForm.amount), createdAt:Date.now(),
    }]}));
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

// ==================== CLIENTS ====================
const ClientsView = () => {
  const [appts] = useAppts();
  const [admin] = useAdmin();
  const [search,setSearch] = React.useState("");
  const [expanded,setExpanded] = React.useState(null);

  const all = getAllAppts(appts, admin.cancelledIds||[]);
  const byPhone = {};
  all.filter(a=>a.phone).forEach(a=>{
    const k = (a.phone||"").replace(/\D/g,"");
    if (!byPhone[k]) byPhone[k]={name:a.name,phone:a.phone,appts:[]};
    byPhone[k].appts.push(a);
    if (!byPhone[k].name || a.createdAt>=(byPhone[k].latestAt||0)) {
      byPhone[k].name=a.name; byPhone[k].latestAt=a.createdAt||0;
    }
  });

  const clients = Object.values(byPhone).map(c=>({
    ...c,
    totalVisits: c.appts.filter(a=>a.computedStatus==="completed").length,
    lastVisit: c.appts.filter(a=>a.computedStatus==="completed")
      .sort((a,b)=>(b.date||"").localeCompare(a.date||""))[0]?.date || null,
    totalSpent: (admin.revenue||[]).filter(r=>
      c.appts.some(a=>a.id===r.apptId)
    ).reduce((s,r)=>s+Number(r.amount||0),0),
  })).sort((a,b)=>b.appts.length-a.appts.length);

  const filtered = clients.filter(c=>{
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone.includes(q);
  });

  return (
    <div>
      <PageHeader title="Clientes" subtitle="Directorio · Historial"
        action={
          <div style={{fontSize:12,color:C.muted,padding:"11px 0"}}>
            {clients.length} cliente{clients.length!==1?"s":""}
          </div>
        }
      />
      <div style={{padding:"16px 32px"}}>
        <FieldInput placeholder="Buscar por nombre o teléfono…" value={search}
          onChange={e=>setSearch(e.target.value)} style={{maxWidth:360,marginBottom:20}} />

        {filtered.length===0 ? (
          <div style={{textAlign:"center",padding:"48px",color:C.muted}}>
            <Mono style={{fontSize:10}}>Sin clientes registrados</Mono>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {filtered.map((c,i)=>{
              const isExp = expanded===c.phone;
              return (
                <div key={c.phone} style={{border:`1px solid ${C.bdr}`,background:C.s1}}>
                  <div onClick={()=>setExpanded(isExp?null:c.phone)}
                    style={{
                      display:"grid",gridTemplateColumns:"200px 140px 80px 80px 100px auto",
                      gap:12,padding:"14px 18px",cursor:"pointer",alignItems:"center",
                    }}>
                    <div>
                      <div style={{fontSize:14}}>{c.name}</div>
                      <div style={{fontSize:11,color:C.muted,fontFamily:"'JetBrains Mono',monospace"}}>
                        {c.phone}
                      </div>
                    </div>
                    <div style={{fontSize:12,color:C.muted}}>
                      Última: {c.lastVisit?fmtDateShort(c.lastVisit):"—"}
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:20,fontFamily:"'Marcellus',serif",color:C.gold}}>
                        {c.totalVisits}
                      </div>
                      <Mono style={{fontSize:8,color:C.muted}}>visitas</Mono>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:14,color:c.totalSpent>0?C.green:C.muted}}>
                        {c.totalSpent>0?fmtCOP(c.totalSpent):"—"}
                      </div>
                      <Mono style={{fontSize:8,color:C.muted}}>pagado</Mono>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:16,fontFamily:"'Marcellus',serif",color:C.muted}}>
                        {c.appts.length}
                      </div>
                      <Mono style={{fontSize:8,color:C.muted}}>citas total</Mono>
                    </div>
                    <span style={{color:C.muted}}>{isExp?"▲":"▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{borderTop:`1px solid ${C.bdr}`,padding:"16px 18px",background:C.s2}}>
                      <Mono style={{color:C.muted,fontSize:9,display:"block",marginBottom:12}}>
                        Historial de citas
                      </Mono>
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {c.appts.sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(a=>(
                          <div key={a.id} style={{
                            display:"grid",gridTemplateColumns:"56px 90px 1fr 120px auto",
                            gap:12,padding:"10px 12px",background:C.s1,alignItems:"center",
                          }}>
                            <Mono style={{color:C.gold,fontSize:10}}>{a.time}</Mono>
                            <Mono style={{fontSize:9,color:C.muted}}>{fmtDateShort(a.date)}</Mono>
                            <div style={{fontSize:13}}>{a.service}</div>
                            <div style={{fontSize:12,color:C.muted}}>{a.stylist}</div>
                            <Badge status={a.computedStatus}/>
                          </div>
                        ))}
                      </div>
                      {c.phone && (
                        <div style={{marginTop:12}}>
                          <a href={`https://wa.me/57${c.phone.replace(/\D/g,"")}`}
                            target="_blank" rel="noopener"
                            style={{
                              color:"#25D366",textDecoration:"none",
                              fontFamily:"'Outfit',sans-serif",fontSize:12,
                              letterSpacing:"0.1em",textTransform:"uppercase",
                            }}>
                            Escribir por WhatsApp →
                          </a>
                        </div>
                      )}
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
  const [form,setForm] = React.useState({date:todayStr(),amount:"",service:"",client:"",method:"Efectivo",note:""});

  const revenue = admin.revenue||[];
  const todayD  = todayStr();
  const now     = new Date();
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

  const submitEntry = () => {
    if (!form.amount||!form.date) return;
    setAdmin(a=>({...a, revenue:[...a.revenue,{
      id:genId(),...form,amount:Number(form.amount),createdAt:Date.now(),
    }]}));
    setForm({date:todayStr(),amount:"",service:"",client:"",method:"Efectivo",note:""});
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
          <Btn onClick={()=>setShowForm(!showForm)}>
            {showForm?"Cancelar":"+ Registrar ingreso"}
          </Btn>
        }
      />

      {showForm && (
        <div style={{padding:"20px 32px",borderBottom:`1px solid ${C.bdr}`,background:C.s1}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14,maxWidth:900}}>
            <FieldInput label="Fecha" type="date" value={form.date}
              onChange={e=>setForm({...form,date:e.target.value})} />
            <FieldInput label="Monto (COP)" type="number" value={form.amount}
              onChange={e=>setForm({...form,amount:e.target.value})} placeholder="45000" />
            <FieldInput label="Servicio" value={form.service}
              onChange={e=>setForm({...form,service:e.target.value})} placeholder="Corte hombre" />
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
                  gridTemplateColumns:"80px 100px 1fr 140px 100px 40px",
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

// ==================== ROOT ====================
const AdminPortal = () => {
  const [authed,setAuthed] = React.useState(isAuthed);
  const [view,setView]   = React.useState("dashboard");

  const logout = () => { doLogout(); setAuthed(false); };

  if (!authed) return <LoginView onSuccess={()=>setAuthed(true)} />;

  const ViewComponent = {
    dashboard:    DashboardView,
    agenda:       AgendaView,
    appointments: AppointmentsView,
    clients:      ClientsView,
    blockslots:   BlockSlotsView,
    revenue:      RevenueView,
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
