// JOXE ACADEMIA: convocatoria de modelos para las prácticas
// Las condiciones las fijó el salón: el corte es gratis, solo corte, solo
// mayores de edad y lo supervisa el administrador. Lo que cambia (si la
// convocatoria está abierta y las fechas) se maneja en Admin → Academia.

const { useState, useEffect } = React;

const MD_STATUS = { idle: "idle", sending: "sending", sent: "sent" };

// Espejo de cleanName en lib/db.js, igual que en academia.jsx.
const NAME_STRIP_RE = /[^\p{L}\p{M}'’ -]/gu;
const NAME_HAS_FORBIDDEN_RE = /[^\p{L}\p{M}'’ -]/u;
const cleanName = (v, max = 80) => String(v ?? "")
  .replace(NAME_STRIP_RE, "").replace(/['’-]{2,}/g, m => m[0])
  .replace(/\s+/g, " ").trimStart().slice(0, max);

// "2026-10-10" → "Sábado 10 de octubre". Se arma al mediodía para que la zona
// horaria del navegador no corra la fecha un día.
const fmtSessionDate = (iso) => {
  const s = new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const sessionLabel = (s) => [fmtSessionDate(s.date), s.time].filter(Boolean).join(" · ");

const MD_FACTS = [
  ["Costo", "Gratis"],
  ["Servicio", "Solo corte"],
  ["Edad", "Mayores de 18"],
  ["Supervisa", "El administrador"],
];

const MD_STEPS = [
  ["Te anotas", "Déjanos tu nombre y tu celular en el formulario. Toma un minuto."],
  ["Te escribimos", "Las prácticas no tienen un día fijo. Cuando haya una sesión te avisamos por WhatsApp y nos dices si te sirve."],
  ["Vienes por tu corte", "Te atiende un estudiante de la academia y el administrador de la barbería supervisa el corte. Ven sin afán: uno de práctica toma más tiempo que uno normal."],
];

// ------------------------------------------------
// HERO
// ------------------------------------------------
const MdHero = ({ onJoin }) => (
  <section id="top" style={{
    background: "var(--noir)", color: "var(--ivory)", padding: "180px 64px 96px",
  }} className="ac-hero">
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <Mono style={{ color: "var(--bronze)" }}>Academia JOXE · Modelos</Mono>
      <h1 style={{
        fontFamily: "var(--display)", fontWeight: 400,
        fontSize: "clamp(44px, 7vw, 104px)", lineHeight: 1,
        margin: "28px 0 0", letterSpacing: "-0.02em", maxWidth: 1100,
      }}>
        Tu próximo corte,<br /><em style={{ color: "var(--bronze)" }}>gratis.</em>
      </h1>
      <p style={{
        fontFamily: "var(--sans)", fontSize: 17, lineHeight: 1.7,
        opacity: 0.72, maxWidth: 620, margin: "36px 0 0",
      }}>
        Los estudiantes de nuestra academia necesitan practicar con personas
        reales. Tú pones la cabeza, ellos el oficio, y el administrador de la
        barbería supervisa cada corte.
      </p>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 48 }}>
        <button onClick={onJoin} style={{
          background: "var(--bronze)", border: "1px solid var(--bronze)",
          color: "var(--noir)", padding: "18px 34px", cursor: "pointer",
          fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}>Quiero ser modelo</button>
        <a href="#como-funciona" style={{
          border: "1px solid rgba(245,241,234,0.25)", color: "var(--ivory)",
          textDecoration: "none", padding: "18px 34px",
          fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.2em",
          textTransform: "uppercase", display: "inline-flex", alignItems: "center",
        }}>Cómo funciona</a>
      </div>

      <div className="md-facts" style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 32,
        marginTop: 72, paddingTop: 32, borderTop: "1px solid rgba(245,241,234,0.12)",
      }}>
        {MD_FACTS.map(([k, v]) => (
          <div key={k}>
            <Mono style={{ color: "var(--bronze)", fontSize: 9 }}>{k}</Mono>
            <div style={{ fontFamily: "var(--display)", fontSize: 24, marginTop: 10 }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ------------------------------------------------
// CÓMO FUNCIONA
// ------------------------------------------------
const MdSteps = () => (
  <section id="como-funciona" style={{
    background: "var(--ivory)", color: "var(--noir)", padding: "110px 64px",
  }} className="section">
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <Mono style={{ color: "var(--bronze)" }}>Cómo funciona</Mono>
      <h2 style={{
        fontFamily: "var(--display)", fontWeight: 400,
        fontSize: "clamp(34px, 4vw, 56px)", lineHeight: 1.05,
        margin: "20px 0 56px", letterSpacing: "-0.01em",
      }}>
        Sin letra pequeña, <em style={{ color: "var(--bronze)" }}>en tres pasos.</em>
      </h2>
      <div className="md-steps" style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 48,
      }}>
        {MD_STEPS.map(([title, body], i) => (
          <div key={title} style={{ paddingTop: 24, borderTop: "1px solid rgba(20,18,18,0.15)" }}>
            <Mono style={{ color: "var(--bronze)", fontSize: 10 }}>
              {String(i + 1).padStart(2, "0")}
            </Mono>
            <h3 style={{
              fontFamily: "var(--display)", fontWeight: 400, fontSize: 28,
              margin: "14px 0 12px", letterSpacing: "-0.01em",
            }}>{title}</h3>
            <p style={{
              fontFamily: "var(--sans)", fontSize: 15, lineHeight: 1.7,
              opacity: 0.75, margin: 0,
            }}>{body}</p>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 72, background: "#EDE6DA", padding: "32px 36px",
        display: "grid", gap: 14,
      }}>
        <Mono style={{ color: "var(--bronze)", fontSize: 10 }}>Bueno saberlo</Mono>
        {[
          "Es solo corte de cabello: en las prácticas no se hace barba ni otros servicios.",
          "Solo pueden participar mayores de edad.",
          "Las fotos son opcionales. Solo tomamos fotos de tu corte si nos das permiso en el formulario.",
        ].map((t, i) => (
          <div key={i} style={{
            fontFamily: "var(--sans)", fontSize: 15, lineHeight: 1.6,
            display: "grid", gridTemplateColumns: "18px 1fr", gap: 8,
          }}>
            <span style={{ color: "var(--bronze)" }}>✦</span>
            <span>{t}</span>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ------------------------------------------------
// FECHAS + FORMULARIO
// ------------------------------------------------
const MdField = ({ label, children }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <Mono style={{ color: "var(--bronze)", fontSize: 9 }}>{label}</Mono>
    {children}
  </label>
);

const mdInputStyle = {
  background: "transparent", border: "1px solid rgba(245,241,234,0.22)",
  color: "var(--ivory)", padding: "14px 16px", width: "100%",
  fontFamily: "var(--sans)", fontSize: 15,
};

const MdCheck = ({ checked, onChange, required, children }) => (
  <label style={{
    display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer",
    fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.5, opacity: 0.85,
  }}>
    <input type="checkbox" checked={checked} required={required}
      onChange={e => onChange(e.target.checked)} />
    <span>{children}</span>
  </label>
);

const MdJoin = React.forwardRef(({ sessions }, ref) => {
  const [form, setForm] = useState({
    name: "", phone: "", message: "", sessionId: "", adult: false, photoConsent: false,
  });
  const [status, setStatus] = useState(MD_STATUS.idle);
  const [error, setError] = useState("");
  const [nameBlocked, setNameBlocked] = useState(false);
  const nameBlockedTimer = React.useRef(null);
  useEffect(() => () => clearTimeout(nameBlockedTimer.current), []);

  const set = (k) => (v) => { setForm(f => ({ ...f, [k]: v })); setError(""); };
  const setName = (e) => {
    const raw = e.target.value;
    if (NAME_HAS_FORBIDDEN_RE.test(raw)) {
      setNameBlocked(true);
      clearTimeout(nameBlockedTimer.current);
      nameBlockedTimer.current = setTimeout(() => setNameBlocked(false), 4000);
    }
    setForm(f => ({ ...f, name: cleanName(raw, 80) }));
  };

  const wa = getWAConfig();
  const waUrl = `https://wa.me/${wa.number}?text=${encodeURIComponent(
    "Hola, quiero ser modelo para las prácticas de la academia.")}`;

  const submit = async (e) => {
    e.preventDefault();
    if (status === MD_STATUS.sending) return;
    const phoneErr = phoneError(form.phone);
    if (phoneErr) { setError(phoneErr); return; }
    if (!form.adult) { setError("Las prácticas son solo para mayores de edad"); return; }
    setStatus(MD_STATUS.sending);
    setError("");
    try {
      const res = await fetch("/api/academy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, kind: "model" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo enviar la solicitud");
      setStatus(MD_STATUS.sent);
    } catch (err) {
      setError(err.message);
      setStatus(MD_STATUS.idle);
    }
  };

  return (
    <section id="anotarme" ref={ref} style={{
      background: "var(--noir)", color: "var(--ivory)", padding: "110px 64px",
    }} className="section">
      <div style={{
        maxWidth: 1100, margin: "0 auto",
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72,
      }} className="ac-form-grid">
        <div>
          <Mono style={{ color: "var(--bronze)" }}>Próximas fechas</Mono>
          <h2 style={{
            fontFamily: "var(--display)", fontWeight: 400,
            fontSize: "clamp(34px, 4vw, 56px)", lineHeight: 1.05,
            margin: "20px 0 28px", letterSpacing: "-0.01em",
          }}>
            Anótate<br /><em style={{ color: "var(--bronze)" }}>y te avisamos.</em>
          </h2>

          {sessions.length > 0 ? (
            <div style={{ margin: "0 0 32px", maxWidth: 420 }}>
              {sessions.map(s => (
                <div key={s.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "baseline",
                  gap: 16, padding: "16px 0", borderTop: "1px solid rgba(245,241,234,0.12)",
                }}>
                  <span style={{ fontFamily: "var(--sans)", fontSize: 16 }}>{sessionLabel(s)}</span>
                  {s.seats > 0 && (
                    <Mono style={{ color: "var(--bronze)", fontSize: 9, whiteSpace: "nowrap" }}>
                      {s.seats} cupo{s.seats !== 1 ? "s" : ""}
                    </Mono>
                  )}
                </div>
              ))}
              <div style={{ borderTop: "1px solid rgba(245,241,234,0.12)" }} />
            </div>
          ) : (
            <p style={{
              fontFamily: "var(--sans)", fontSize: 15, lineHeight: 1.7,
              opacity: 0.65, margin: "0 0 32px", maxWidth: 400,
            }}>
              Las fechas cambian según el grupo. Déjanos tus datos y te
              escribimos por WhatsApp cuando haya una sesión.
            </p>
          )}

          <a href={waUrl} target="_blank" rel="noopener noreferrer" style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            background: "#25D366", color: "#fff", textDecoration: "none",
            padding: "15px 26px", fontFamily: "var(--sans)", fontSize: 12,
            letterSpacing: "0.15em", textTransform: "uppercase",
          }}>
            Prefiero WhatsApp
          </a>
        </div>

        {status === MD_STATUS.sent ? (
          <div style={{
            border: "1px solid var(--bronze)", padding: "48px 40px",
            display: "flex", flexDirection: "column", justifyContent: "center", gap: 16,
          }}>
            <Mono style={{ color: "var(--bronze)" }}>Ya estás en la lista</Mono>
            <p style={{ fontFamily: "var(--sans)", fontSize: 16, lineHeight: 1.7, margin: 0, opacity: 0.8 }}>
              Gracias, {form.name.split(" ")[0]}. Te escribimos al {fmtPhone(form.phone)} para
              confirmar la fecha de tu corte.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 20 }}>
            <MdField label="Nombre y apellido">
              <input required value={form.name} onChange={setName}
                maxLength={80} style={mdInputStyle}
                aria-invalid={nameBlocked}
                aria-describedby={nameBlocked ? "md-name-err" : undefined} />
              {nameBlocked && (
                <div id="md-name-err" role="alert" style={{
                  marginTop: 6, fontSize: 12, color: "#C46666",
                }}>Solo letras: sin números, emojis ni símbolos.</div>
              )}
            </MdField>
            <MdField label="Celular">
              <PhoneField required ariaLabel="Celular" value={form.phone}
                onChange={set("phone")} fieldStyle={mdInputStyle} focusColor="var(--bronze)" />
            </MdField>
            {sessions.length > 0 && (
              <MdField label="Fecha que te sirve">
                <select value={form.sessionId} onChange={e => set("sessionId")(e.target.value)}
                  style={{ ...mdInputStyle, appearance: "auto" }}>
                  <option value="">Cualquiera, avísenme</option>
                  {sessions.map(s => <option key={s.id} value={s.id}>{sessionLabel(s)}</option>)}
                </select>
              </MdField>
            )}
            <MdField label="Qué días y horas te quedan bien (opcional)">
              <textarea rows={3} value={form.message} onChange={e => set("message")(e.target.value)}
                maxLength={600} placeholder="Ej.: entre semana después de las 4 pm"
                style={{ ...mdInputStyle, resize: "vertical" }} />
            </MdField>

            <div style={{ display: "grid", gap: 14, marginTop: 4 }}>
              <MdCheck checked={form.adult} onChange={set("adult")} required>
                Soy mayor de edad.
              </MdCheck>
              <MdCheck checked={form.photoConsent} onChange={set("photoConsent")}>
                Autorizo que tomen fotos de mi corte para mostrarlas en la web y
                las redes de JOXE. <span style={{ opacity: 0.6 }}>(Opcional)</span>
              </MdCheck>
            </div>

            {error && (
              <div style={{
                border: "1px solid rgba(196,102,102,0.5)", color: "#e08a8a",
                padding: "12px 16px", fontFamily: "var(--sans)", fontSize: 14,
              }}>{error}</div>
            )}

            <button type="submit" disabled={status === MD_STATUS.sending} style={{
              background: "var(--bronze)", border: "none", color: "var(--noir)",
              padding: "18px 28px", fontFamily: "var(--sans)", fontSize: 12,
              letterSpacing: "0.2em", textTransform: "uppercase",
              cursor: status === MD_STATUS.sending ? "wait" : "pointer",
              opacity: status === MD_STATUS.sending ? 0.6 : 1,
            }}>
              {status === MD_STATUS.sending ? "Enviando…" : "Quiero ser modelo"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
});

// ------------------------------------------------
// SIN CONVOCATORIA
// ------------------------------------------------
const MdMessage = ({ title, body }) => (
  <section style={{
    background: "var(--noir)", color: "var(--ivory)", minHeight: "100vh",
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", gap: 20, padding: "120px 32px", textAlign: "center",
  }}>
    <Mono style={{ color: "var(--bronze)" }}>Academia JOXE · Modelos</Mono>
    <h1 style={{
      fontFamily: "var(--display)", fontWeight: 400,
      fontSize: "clamp(32px, 5vw, 56px)", margin: 0, letterSpacing: "-0.01em",
    }}>{title}</h1>
    {body && (
      <p style={{
        fontFamily: "var(--sans)", fontSize: 16, lineHeight: 1.7,
        opacity: 0.65, maxWidth: 480, margin: 0,
      }}>{body}</p>
    )}
    <a href="/" style={{
      marginTop: 16, border: "1px solid var(--bronze)", color: "var(--bronze)",
      textDecoration: "none", padding: "16px 30px", fontFamily: "var(--sans)",
      fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
    }}>Volver al inicio</a>
  </section>
);

// ------------------------------------------------
// PORTAL
// ------------------------------------------------
function ModelosPortal() {
  const academy = useAcademy();
  const [scrolled, setScrolled] = useState(false);
  const formRef = React.useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (academy === null) return <MdMessage title="Cargando…" />;
  if (!academy.models) {
    return (
      <MdMessage
        title="Por ahora no estamos buscando modelos"
        body="Cuando abramos una nueva sesión de prácticas la anunciaremos aquí."
      />
    );
  }

  const hasAcademy = !!academy.enabled;
  return (
    <div style={{ background: "var(--ivory)", minHeight: "100vh" }}>
      <Nav onReserveClick={() => { window.location.href = "/booking"; }}
        scrolled={scrolled} hasAcademy={hasAcademy} hrefPrefix="/" />
      <MdHero onJoin={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
      <MdSteps />
      <MdJoin ref={formRef} sessions={academy.models.sessions || []} />
      <Footer hasAcademy={hasAcademy} hasModels />
      <WhatsAppBlob />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<ModelosPortal />);
