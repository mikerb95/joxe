// Portal JOXE — Sistema de turnos
// Shared store + components

// ============================================================
// STORE — Turso (via /api/store) + localStorage cache
// ============================================================
const STORE_KEY = "joxe_turnos_v1";
const STORE_DEFAULT = () => ({ appointments: [], active: [], completed: [], blockedSlots: [] });

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

  // Fetch from Turso and update local cache
  const pull = React.useCallback(async () => {
    try {
      const res = await fetch("/api/store");
      if (!res.ok) return;
      const data = await res.json();
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

  const update = React.useCallback(async (updater) => {
    const current = loadCache();
    const next = typeof updater === "function" ? updater(current) : updater;
    // Optimistic: apply immediately
    setStore(next);
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
    // Persist to Turso
    try {
      await fetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      broadcastUpdate();
    } catch (err) {
      console.warn("[store] save failed, using local cache", err.message);
    }
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

const PortalHeader = ({ title, subtitle, right, tone = "noir" }) => (
  <header style={{
    padding: "24px 40px",
    borderBottom: tone === "noir" ? "1px solid rgba(245,241,234,0.1)" : "1px solid rgba(12,12,12,0.1)",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    flexWrap: "wrap", gap: 16,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <a href="JOXE Portal.html" style={{
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

// ============================================================
// QR RENDERER (simple pseudo-QR using a deterministic grid)
// ============================================================
const pseudoQR = (text) => {
  // Deterministic 21x21 grid from text hash — visual only (decorative QR)
  const size = 25;
  const grid = Array.from({ length: size }, () => Array(size).fill(false));
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      h = (h * 1103515245 + 12345) >>> 0;
      grid[y][x] = (h & 0xff) < 128;
    }
  }
  // finder patterns (corners)
  const finder = (cx, cy) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const on = (x === 0 || x === 6 || y === 0 || y === 6) || (x >= 2 && x <= 4 && y >= 2 && y <= 4);
      if (cx + x < size && cy + y < size) grid[cy + y][cx + x] = on;
    }
    // clear border area
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
      if (x === -1 || x === 7 || y === -1 || y === 7) {
        if (cx + x >= 0 && cx + x < size && cy + y >= 0 && cy + y < size) grid[cy + y][cx + x] = false;
      }
    }
  };
  finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
  return grid;
};

const QRCode = ({ value, size = 220, fg = "#0C0C0C", bg = "#F5F1EA" }) => {
  const grid = pseudoQR(value);
  const cell = size / grid.length;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <rect width={size} height={size} fill={bg} />
      {grid.map((row, y) => row.map((on, x) => on && (
        <rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill={fg} />
      )))}
    </svg>
  );
};

// ============================================================
// PAGE 1 — AGENDAR CITA
// ============================================================
const BookingPortal = () => {
  const [store, setStore] = useStore();
  const [step, setStep] = React.useState(1);
  const [form, setForm] = React.useState({
    service: "", stylist: "", date: "", time: "", name: "", phone: "",
  });
  const [ticket, setTicket] = React.useState(null);

  const services = [
    { name: "Corte mujer", dur: 60, price: "$85.000" },
    { name: "Corte hombre", dur: 40, price: "$45.000" },
    { name: "Balayage", dur: 180, price: "desde $280.000" },
    { name: "Color correction", dur: 240, price: "desde $320.000" },
    { name: "Color raíz", dur: 90, price: "$120.000" },
    { name: "Keratina", dur: 180, price: "desde $260.000" },
    { name: "Asesoría de imagen", dur: 90, price: "$180.000" },
    { name: "Peinado novia", dur: 120, price: "desde $220.000" },
  ];
  const stylists = ["Joxe", "Laura M.", "Camila R.", "Sin preferencia"];
  const times = ["9:00", "10:30", "12:00", "14:00", "15:30", "17:00"];

  const submit = () => {
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
    const code = genTicket();
    const appt = {
      id, code, ...form,
      createdAt: Date.now(),
      status: "scheduled",
    };
    setStore(s => ({ ...s, appointments: [...s.appointments, appt] }));
    setTicket(appt);
    setStep(4);
  };

  const canNext = (step === 1 && form.service)
    || (step === 2 && form.date && form.time && form.stylist)
    || (step === 3 && form.name && form.phone);

  return (
    <PortalShell tone="ivory" header={
      <PortalHeader
        tone="ivory"
        subtitle="Portal · Paso"
        title={step < 4 ? `${step} de 3 — Reservar cita` : "Reserva confirmada"}
        right={
          <a href="JOXE Portal.html" style={{
            textDecoration: "none", color: "#0C0C0C",
            fontFamily: "'Outfit', sans-serif", fontSize: 12,
            letterSpacing: "0.15em", textTransform: "uppercase",
            opacity: 0.7,
          }}>← Inicio</a>
        }
      />
    }>
      <main style={{
        flex: 1, padding: "56px 40px", maxWidth: 880,
        margin: "0 auto", width: "100%",
      }}>
        {/* Progress bar */}
        {step < 4 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 48 }}>
            {[1, 2, 3].map(n => (
              <div key={n} style={{
                flex: 1, height: 2,
                background: n <= step ? "#C29E66" : "rgba(12,12,12,0.1)",
                transition: "background 0.3s",
              }} />
            ))}
          </div>
        )}

        {step === 1 && (
          <>
            <PMono style={{ color: "#C29E66" }}>01 — Servicio</PMono>
            <h1 style={{
              fontFamily: "'Marcellus', serif", fontSize: 56, fontWeight: 400,
              margin: "20px 0 40px", letterSpacing: "-0.01em", lineHeight: 1.05,
            }}>¿Qué necesitas hoy?</h1>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {services.map(s => {
                const sel = form.service === s.name;
                return (
                  <button key={s.name} onClick={() => setForm({ ...form, service: s.name })} style={{
                    padding: "22px 24px", textAlign: "left", cursor: "pointer",
                    background: sel ? "#0C0C0C" : "#FFF",
                    color: sel ? "#F5F1EA" : "#0C0C0C",
                    border: `1px solid ${sel ? "#0C0C0C" : "rgba(12,12,12,0.15)"}`,
                    transition: "all 0.2s",
                  }}>
                    <div style={{
                      fontFamily: "'Marcellus', serif", fontSize: 22,
                      marginBottom: 6,
                    }}>{s.name}</div>
                    <div style={{
                      display: "flex", justifyContent: "space-between",
                      fontSize: 12, opacity: 0.7, fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      <span>{s.dur} min</span>
                      <span>{s.price}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <PMono style={{ color: "#C29E66" }}>02 — Fecha, hora y estilista</PMono>
            <h1 style={{
              fontFamily: "'Marcellus', serif", fontSize: 56, fontWeight: 400,
              margin: "20px 0 40px", letterSpacing: "-0.01em", lineHeight: 1.05,
            }}>Elige tu momento.</h1>
            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              <div>
                <PMono style={{ display: "block", marginBottom: 12, fontSize: 10 }}>Fecha</PMono>
                <input type="date" value={form.date}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                  style={{
                    width: "100%", padding: "18px 20px",
                    border: "1px solid rgba(12,12,12,0.2)",
                    fontFamily: "'Outfit', sans-serif", fontSize: 15,
                    background: "#FFF", color: "#0C0C0C",
                  }} />
              </div>
              <div>
                <PMono style={{ display: "block", marginBottom: 12, fontSize: 10 }}>Hora</PMono>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {times.map(t => {
                    const namedStylists = ["Joxe G.", "Laura M.", "Camila R."];
                    const aptsAtSlot = form.date
                      ? (store.appointments || []).filter(a => a.date === form.date && a.time === t && a.status === "scheduled")
                      : [];
                    const allBusy = namedStylists.every(s => aptsAtSlot.some(a => a.stylist === s));
                    const selectedBusy = form.stylist && form.stylist !== "Sin preferencia" && aptsAtSlot.some(a => a.stylist === form.stylist);
                    const isBlocked = form.date && (
                      (store.blockedSlots || []).some(b => b.date === form.date && b.time === t) ||
                      allBusy ||
                      selectedBusy
                    );
                    return (
                      <button key={t} disabled={isBlocked}
                        onClick={() => !isBlocked && setForm({ ...form, time: t })}
                        style={{
                          padding: "16px", fontFamily: "'JetBrains Mono', monospace",
                          background: isBlocked ? "rgba(12,12,12,0.04)" : form.time === t ? "#0C0C0C" : "#FFF",
                          color: isBlocked ? "rgba(12,12,12,0.3)" : form.time === t ? "#F5F1EA" : "#0C0C0C",
                          border: `1px solid ${isBlocked ? "rgba(12,12,12,0.1)" : form.time === t ? "#0C0C0C" : "rgba(12,12,12,0.2)"}`,
                          cursor: isBlocked ? "not-allowed" : "pointer", fontSize: 14,
                          textDecoration: isBlocked ? "line-through" : "none",
                        }}>
                        {isBlocked ? <><span>{t}</span><br/><span style={{fontSize:9,letterSpacing:"0.1em"}}>NO DISP.</span></> : t}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <PMono style={{ display: "block", marginBottom: 12, fontSize: 10 }}>Estilista</PMono>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {stylists.map(s => (
                    <button key={s} onClick={() => setForm({ ...form, stylist: s })} style={{
                      padding: "16px 20px", textAlign: "left",
                      background: form.stylist === s ? "#0C0C0C" : "#FFF",
                      color: form.stylist === s ? "#F5F1EA" : "#0C0C0C",
                      border: `1px solid ${form.stylist === s ? "#0C0C0C" : "rgba(12,12,12,0.2)"}`,
                      cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 14,
                    }}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <PMono style={{ color: "#C29E66" }}>03 — Tus datos</PMono>
            <h1 style={{
              fontFamily: "'Marcellus', serif", fontSize: 56, fontWeight: 400,
              margin: "20px 0 40px", letterSpacing: "-0.01em", lineHeight: 1.05,
            }}>Un último paso.</h1>
            <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 520 }}>
              <div>
                <PMono style={{ display: "block", marginBottom: 10, fontSize: 10 }}>Nombre completo</PMono>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="María Pérez"
                  style={{
                    width: "100%", padding: "18px 20px",
                    border: "1px solid rgba(12,12,12,0.2)", background: "#FFF",
                    fontFamily: "'Outfit', sans-serif", fontSize: 15, color: "#0C0C0C",
                  }} />
              </div>
              <div>
                <PMono style={{ display: "block", marginBottom: 10, fontSize: 10 }}>WhatsApp</PMono>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="300 123 4567"
                  style={{
                    width: "100%", padding: "18px 20px",
                    border: "1px solid rgba(12,12,12,0.2)", background: "#FFF",
                    fontFamily: "'Outfit', sans-serif", fontSize: 15, color: "#0C0C0C",
                  }} />
              </div>
              <div style={{
                padding: 20, background: "#0C0C0C", color: "#F5F1EA", marginTop: 8,
              }}>
                <PMono style={{ color: "#C29E66", fontSize: 9, display: "block", marginBottom: 10 }}>
                  Resumen de tu cita
                </PMono>
                <div style={{ fontFamily: "'Marcellus', serif", fontSize: 22, lineHeight: 1.4 }}>
                  {form.service}
                </div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                  opacity: 0.7, marginTop: 6, letterSpacing: "0.05em",
                }}>
                  {form.date} · {form.time} · {form.stylist}
                </div>
              </div>
              <div style={{
                padding: "16px 20px",
                background: "rgba(37,211,102,0.08)",
                border: "1px solid rgba(37,211,102,0.3)",
                display: "flex", gap: 12, alignItems: "flex-start",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366" style={{ flexShrink: 0, marginTop: 1 }}>
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

        {step === 4 && ticket && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <PMono style={{ color: "#C29E66" }}>Paso final — Confirma tu reserva</PMono>
            <h1 style={{
              fontFamily: "'Marcellus', serif", fontSize: 56, fontWeight: 400,
              margin: "20px 0 16px", letterSpacing: "-0.015em", lineHeight: 1.05,
            }}>¡Ya casi, <em style={{ color: "#C29E66" }}>{ticket.name.split(" ")[0]}</em>!</h1>
            <div style={{
              maxWidth: 520, margin: "0 auto 36px",
              padding: "20px 24px",
              background: "rgba(37,211,102,0.08)",
              border: "2px solid rgba(37,211,102,0.4)",
            }}>
              <div style={{
                fontFamily: "'Outfit', sans-serif", fontSize: 15, lineHeight: 1.7, color: "#0C0C0C",
              }}>
                <strong>Tu cita aún no está confirmada.</strong><br />
                Debes enviar el mensaje de WhatsApp a continuación
                para que tu reserva quede agendada oficialmente.
                Sin este paso, <strong>la cita no será registrada</strong>.
              </div>
            </div>
            <div style={{ marginBottom: 40 }}>
              <a
                href={(() => {
                  const adminLink = `${window.location.origin}/admin/payment?paymentID=${ticket.id}`;
                  const msg = [
                    `🗓️ *Nueva reserva JOXE*`,
                    `Nombre: ${ticket.name}`,
                    `Servicio: ${ticket.service}`,
                    `Fecha: ${ticket.date} a las ${ticket.time}`,
                    `Estilista: ${ticket.stylist}`,
                    `Tel: ${ticket.phone}`,
                    ``,
                    `🔗 Confirmar abono:`,
                    adminLink,
                  ].join("\n");
                  return `https://wa.me/573124499862?text=${encodeURIComponent(msg)}`;
                })()}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 12,
                  background: "#25D366", color: "#FFF",
                  padding: "20px 36px", fontSize: 14, letterSpacing: "0.15em",
                  textTransform: "uppercase", textDecoration: "none",
                  fontFamily: "'Outfit', sans-serif",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Confirmar cita por WhatsApp
              </a>
              <div style={{
                fontFamily: "'Outfit', sans-serif", fontSize: 12,
                color: "rgba(12,12,12,0.45)", marginTop: 12,
              }}>
                Se abrirá WhatsApp con el mensaje listo — solo envíalo.
              </div>
            </div>
            <p style={{
              fontFamily: "'Outfit', sans-serif", fontSize: 14, lineHeight: 1.6,
              opacity: 0.55, maxWidth: 440, margin: "0 auto 32px",
            }}>
              Una vez confirmada tu cita, guarda el QR a continuación
              para activar tu turno al llegar al salón.
            </p>
            <div style={{
              display: "inline-block", padding: 32, background: "#FFF",
              border: "1px solid rgba(12,12,12,0.1)",
            }}>
              <QRCode value={ticket.id} size={260} />
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 14,
                letterSpacing: "0.3em", marginTop: 16, color: "#C29E66",
              }}>{ticket.code}</div>
            </div>
            <div style={{
              maxWidth: 440, margin: "40px auto 0", padding: "24px 0",
              borderTop: "1px solid rgba(12,12,12,0.15)",
              borderBottom: "1px solid rgba(12,12,12,0.15)",
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, textAlign: "left",
            }}>
              <div>
                <PMono style={{ color: "#C29E66", fontSize: 9, display: "block", marginBottom: 6 }}>Servicio</PMono>
                <div style={{ fontSize: 14 }}>{ticket.service}</div>
              </div>
              <div>
                <PMono style={{ color: "#C29E66", fontSize: 9, display: "block", marginBottom: 6 }}>Fecha</PMono>
                <div style={{ fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>
                  {ticket.date} · {ticket.time}
                </div>
              </div>
              <div>
                <PMono style={{ color: "#C29E66", fontSize: 9, display: "block", marginBottom: 6 }}>Estilista</PMono>
                <div style={{ fontSize: 14 }}>{ticket.stylist}</div>
              </div>
              <div>
                <PMono style={{ color: "#C29E66", fontSize: 9, display: "block", marginBottom: 6 }}>Ticket</PMono>
                <div style={{ fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>{ticket.code}</div>
              </div>
            </div>
            <div style={{ marginTop: 32, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <a href="JOXE Cuenta.html" style={{
                background: "#0C0C0C", color: "#F5F1EA",
                padding: "16px 28px", fontSize: 12, letterSpacing: "0.2em",
                textTransform: "uppercase", textDecoration: "none",
              }}>Ver mi cuenta →</a>
              <a href={`JOXE Scan.html#${ticket.id}`} style={{
                background: "transparent", color: "#0C0C0C",
                padding: "16px 28px", fontSize: 12, letterSpacing: "0.2em",
                textTransform: "uppercase", textDecoration: "none",
                border: "1px solid #0C0C0C",
              }}>Simular escaneo →</a>
            </div>
            <p style={{
              marginTop: 20, fontSize: 12, color: "rgba(12,12,12,0.45)",
              textAlign: "center", lineHeight: 1.6,
            }}>
              Accede a{" "}
              <a href="JOXE Cuenta.html" style={{ color: "#0C0C0C", opacity: 0.7 }}>
                Mi Cuenta
              </a>{" "}
              para ver el estado en vivo y tus puntos de lealtad.
            </p>
          </div>
        )}

        {step < 4 && (
          <div style={{
            display: "flex", justifyContent: "space-between", marginTop: 48,
          }}>
            <button onClick={() => step > 1 && setStep(step - 1)} style={{
              background: "transparent", border: "none", cursor: step > 1 ? "pointer" : "default",
              fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
              opacity: step > 1 ? 0.7 : 0.3, padding: "18px 0", color: "#0C0C0C",
              fontFamily: "'Outfit', sans-serif",
            }}>← Atrás</button>
            <button disabled={!canNext} onClick={() => step === 3 ? submit() : setStep(step + 1)} style={{
              background: canNext ? "#0C0C0C" : "rgba(12,12,12,0.2)",
              color: "#F5F1EA", border: "none",
              padding: "18px 36px", cursor: canNext ? "pointer" : "not-allowed",
              fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
              fontFamily: "'Outfit', sans-serif",
            }}>{step === 3 ? "Confirmar reserva" : "Continuar →"}</button>
          </div>
        )}
      </main>
    </PortalShell>
  );
};

// ============================================================
// PAGE 2 — ESCANEAR QR (RECEPCIÓN)
// ============================================================
const ScanPortal = () => {
  const [store, setStore] = useStore();
  const [scanned, setScanned] = React.useState(null);
  const [scanning, setScanning] = React.useState(false);
  const [error, setError] = React.useState("");

  // Auto-detect from hash
  React.useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) {
      setTimeout(() => handleScan(id), 800);
    }
  }, []);

  const handleScan = (id) => {
    setScanning(true);
    setError("");
    setTimeout(() => {
      const s = loadStore();
      const appt = s.appointments.find(a => a.id === id);
      if (!appt) {
        setError("Ticket no encontrado. Verifica tu QR.");
        setScanning(false);
        return;
      }
      if (s.active.find(a => a.id === id) || s.completed.find(a => a.id === id)) {
        setError("Este turno ya fue activado.");
        setScanning(false);
        return;
      }
      setScanned(appt);
      setScanning(false);
    }, 1200);
  };

  const activateTurn = () => {
    setStore(s => ({
      ...s,
      active: [...s.active, { ...scanned, activatedAt: Date.now(), status: "waiting", position: s.active.length + 1 }],
    }));
    setScanned({ ...scanned, activated: true });
  };

  const recent = store.appointments.filter(a =>
    !store.active.find(x => x.id === a.id) && !store.completed.find(x => x.id === a.id)
  ).slice(-3).reverse();

  return (
    <PortalShell tone="noir" header={
      <PortalHeader
        subtitle="Recepción · Escaneo"
        title="Activa tu turno"
        right={
          <a href="JOXE Portal.html" style={{
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
              {/* Camera feed simulation */}
              <div style={{
                position: "absolute", inset: 0,
                background: "radial-gradient(circle at 30% 40%, rgba(194,158,102,0.08), transparent 50%), repeating-linear-gradient(180deg, rgba(245,241,234,0.02) 0 2px, transparent 2px 4px)",
              }} />
              {/* Corner brackets */}
              {[
                { top: 24, left: 24, borderTop: "2px solid #C29E66", borderLeft: "2px solid #C29E66" },
                { top: 24, right: 24, borderTop: "2px solid #C29E66", borderRight: "2px solid #C29E66" },
                { bottom: 24, left: 24, borderBottom: "2px solid #C29E66", borderLeft: "2px solid #C29E66" },
                { bottom: 24, right: 24, borderBottom: "2px solid #C29E66", borderRight: "2px solid #C29E66" },
              ].map((s, i) => (
                <div key={i} style={{ position: "absolute", width: 32, height: 32, ...s }} />
              ))}
              {/* Scanning line */}
              {scanning && (
                <div style={{
                  position: "absolute", left: 24, right: 24, height: 2,
                  background: "linear-gradient(90deg, transparent, #C29E66, transparent)",
                  animation: "scanLine 1.2s ease-in-out infinite",
                  top: "50%",
                }} />
              )}

              <div style={{
                position: "absolute", top: 16, left: 16, display: "flex",
                alignItems: "center", gap: 8,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", background: "#C29E66",
                  animation: "pulse 2s ease-in-out infinite",
                }} />
                <PMono style={{ color: "#C29E66", fontSize: 9 }}>
                  {scanning ? "Leyendo..." : "Cámara activa"}
                </PMono>
              </div>

              <div style={{
                position: "absolute", bottom: 24, left: 0, right: 0,
                textAlign: "center",
              }}>
                <PMono style={{ color: "rgba(245,241,234,0.5)", fontSize: 9 }}>
                  Centra el QR dentro del marco
                </PMono>
              </div>
            </div>

            {error && (
              <div style={{
                marginTop: 16, padding: 14,
                background: "rgba(200,80,80,0.1)", border: "1px solid rgba(200,80,80,0.3)",
                fontSize: 13,
              }}>{error}</div>
            )}

            <div style={{ marginTop: 24 }}>
              <PMono style={{ color: "rgba(245,241,234,0.5)", fontSize: 9, display: "block", marginBottom: 10 }}>
                Simulación — reservas recientes
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
            {!scanned && !scanning && (
              <div style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", textAlign: "center",
                opacity: 0.4,
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>⊡</div>
                <PMono>Esperando escaneo</PMono>
              </div>
            )}
            {scanning && (
              <div style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", textAlign: "center",
              }}>
                <div style={{
                  width: 40, height: 40, border: "2px solid rgba(194,158,102,0.2)",
                  borderTopColor: "#C29E66", borderRadius: "50%",
                  animation: "spin 1s linear infinite", marginBottom: 20,
                }} />
                <PMono style={{ color: "#C29E66" }}>Verificando ticket…</PMono>
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
                  <a href="JOXE Lobby.html" style={{
                    color: "#C29E66", textDecoration: "none",
                    fontFamily: "'Outfit', sans-serif", fontSize: 12,
                    letterSpacing: "0.2em", textTransform: "uppercase",
                    padding: "14px 20px", border: "1px solid #C29E66",
                    display: "inline-block",
                  }}>Ver pantalla de sala →</a>
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

  const reset = () => {
    if (confirm("¿Limpiar todos los turnos activos y completados?")) {
      setStore(s => ({ ...s, active: [], completed: [] }));
    }
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
            <a href="JOXE Portal.html" style={{
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
    </PortalShell>
  );
};

// ============================================================
// PAGE 4 — MI CUENTA (cliente)
// ============================================================
const ACCT_KEY = "joxe_cuenta_phone";

const CuentaPortal = () => {
  const [phone,    setPhone]    = React.useState(() => localStorage.getItem(ACCT_KEY) || "");
  const [input,    setInput]    = React.useState("");
  const [data,     setData]     = React.useState(null);
  const [loading,  setLoading]  = React.useState(false);
  const [error,    setError]    = React.useState("");
  const [showQR,   setShowQR]   = React.useState(null);

  const fetchData = React.useCallback(async (ph, silent = false) => {
    try {
      const res = await fetch(`/api/client?phone=${encodeURIComponent(ph)}`);
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
    if (saved) { setPhone(saved); fetchData(saved, true); }
  }, [fetchData]);

  React.useEffect(() => {
    if (!phone) return;
    const t = setInterval(() => fetchData(phone, true), 8000);
    return () => clearInterval(t);
  }, [phone, fetchData]);

  const login = async () => {
    const clean = input.replace(/\D/g, "");
    if (clean.length < 7) { setError("Ingresa un número válido."); return; }
    setLoading(true); setError("");
    await fetchData(clean);
    setPhone(clean);
    localStorage.setItem(ACCT_KEY, clean);
    setLoading(false);
  };

  const logout = () => {
    setPhone(""); setData(null); setInput(""); localStorage.removeItem(ACCT_KEY);
  };

  const todayStr  = new Date().toISOString().split("T")[0];
  const fmtDate   = d => !d ? "—" : new Date(d + "T12:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  const fmtShort  = d => !d ? "—" : new Date(d + "T12:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });

  const STATUS = {
    scheduled:   { label: "Agendada",      color: "#C29E66",              bg: "rgba(194,158,102,0.1)"  },
    waiting:     { label: "En sala",        color: "#8ab0ff",              bg: "rgba(138,176,255,0.1)"  },
    "in-service":{ label: "¡En silla!",    color: "#66C499",              bg: "rgba(102,196,153,0.15)" },
    completed:   { label: "Completada",     color: "rgba(245,241,234,0.4)", bg: "rgba(245,241,234,0.05)"},
    cancelled:   { label: "Cancelada",      color: "#C46666",              bg: "rgba(196,102,102,0.1)"  },
  };

  // ── LOGIN SCREEN ──────────────────────────────────────────
  if (!phone || !data) {
    return (
      <PortalShell tone="noir" header={
        <PortalHeader subtitle="Portal · Cliente" title="Mi Cuenta"
          right={
            <a href="JOXE Portal.html" style={{
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
            }}>Bienvenido de vuelta.</h1>
            <p style={{ fontSize: 15, opacity: 0.6, lineHeight: 1.6, marginBottom: 40 }}>
              Ingresa tu número de WhatsApp para ver tus citas y puntos de lealtad.
            </p>

            <div style={{
              background: "#141212", border: "1px solid rgba(245,241,234,0.1)", padding: 32,
            }}>
              <PMono style={{ fontSize: 9, color: "rgba(245,241,234,0.5)", display: "block", marginBottom: 10 }}>
                Número de WhatsApp
              </PMono>
              <input
                value={input}
                onChange={e => { setInput(e.target.value); setError(""); }}
                onKeyDown={e => e.key === "Enter" && login()}
                placeholder="300 123 4567"
                type="tel"
                style={{
                  width: "100%", padding: "18px 20px",
                  background: "#0C0C0C", border: "1px solid rgba(245,241,234,0.15)",
                  color: "#F5F1EA", fontFamily: "'Outfit', sans-serif", fontSize: 16,
                }}
              />
              {error && (
                <div style={{ marginTop: 10, fontSize: 12, color: "#C46666" }}>{error}</div>
              )}
              <button
                onClick={login}
                disabled={loading || !input.trim()}
                style={{
                  width: "100%", marginTop: 16, padding: "18px",
                  background: loading || !input.trim() ? "rgba(194,158,102,0.2)" : "#C29E66",
                  color: "#0C0C0C", border: "none",
                  fontFamily: "'Outfit', sans-serif", fontSize: 12,
                  letterSpacing: "0.2em", textTransform: "uppercase",
                  cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                }}>
                {loading ? "Buscando…" : "Ver mis citas →"}
              </button>
            </div>

            <div style={{ marginTop: 24, textAlign: "center" }}>
              <a href="JOXE Booking.html" style={{
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
            <a href="JOXE Booking.html" style={{
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
            <a href="JOXE Lobby.html" style={{
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
            <a href="JOXE Booking.html" style={{
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
                <a href="JOXE Booking.html" style={{ color: "#C29E66", textDecoration: "none" }}>
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

                      {/* QR toggle — only for upcoming non-live */}
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
              No encontramos citas con este número.<br/>
              <a href="JOXE Booking.html" style={{ color: "#C29E66", textDecoration: "none" }}>
                Reserva tu primera cita →
              </a>
            </div>
          </div>
        )}

      </main>
    </PortalShell>
  );
};

// ============================================================
// PAGE 0 — HOME
// ============================================================
const HomePortal = () => {
  const [store] = useStore();
  return (
    <PortalShell tone="noir" header={
      <PortalHeader
        subtitle="Sistema de turnos"
        title="JOXE · Portal"
        right={
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <a href="JOXE Asesores de Imagen.html" style={{
              color: "#F5F1EA", textDecoration: "none", fontSize: 12,
              letterSpacing: "0.15em", textTransform: "uppercase", opacity: 0.6,
            }}>Sitio web ↗</a>
            <a href="JOXE Admin.html" style={{
              color: "#C29E66", textDecoration: "none", fontSize: 11,
              letterSpacing: "0.15em", textTransform: "uppercase",
              padding: "8px 14px", border: "1px solid rgba(194,158,102,0.4)",
            }}>Admin ⊛</a>
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
              href: "JOXE Booking.html", cta: "Reservar ahora",
              primary: true,
            },
            {
              n: "02", title: "Mi Cuenta", subtitle: "Cliente",
              desc: "Consulta tus citas, el estado en sala y tus puntos de lealtad.",
              href: "JOXE Cuenta.html", cta: "Ver mi cuenta",
            },
            {
              n: "03", title: "Escanear QR", subtitle: "Recepción",
              desc: "Valida el ticket y activa el turno al llegar al salón.",
              href: "JOXE Scan.html", cta: "Abrir escáner",
            },
            {
              n: "04", title: "Pantalla de sala", subtitle: "Lobby",
              desc: "Muestra la cola en vivo — proyecta en pantalla grande.",
              href: "JOXE Lobby.html", cta: "Ver sala",
            },
          ].map(c => (
            <a key={c.n} href={c.href} style={{
              padding: "32px 28px", textDecoration: "none",
              background: c.primary ? "#C29E66" : "#141212",
              color: c.primary ? "#0C0C0C" : "#F5F1EA",
              border: c.primary ? "none" : "1px solid rgba(245,241,234,0.15)",
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
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
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

Object.assign(window, {
  BookingPortal, ScanPortal, LobbyPortal, HomePortal, CuentaPortal,
  QRCode, PortalShell, PortalHeader, PMono, useStore, WABlob,
});
