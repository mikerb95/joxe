// JOXE — Página de reseña del cliente.
// Dos maneras de entrar:
//   1. Con el link firmado que manda el salón: /resena?t=<token>.
//   2. Sin link: /resena pide cédula + últimos 4 del celular, encuentra la
//      última visita completada sin reseñar y trae el nombre registrado.
// En los dos casos se termina con un token firmado: el formulario nunca se
// abre sin una cita completada detrás.

const { useState, useEffect } = React;

const C = { noir: "#0C0C0C", ivory: "#F5F1EA", bronze: "#C29E66", red: "#C46666", green: "#66C499" };

const RMono = ({ children, style }) => (
  <span style={{
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
    letterSpacing: "0.18em", textTransform: "uppercase", ...style,
  }}>{children}</span>
);

const Star = ({ filled, size = 34 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
    fill={filled ? C.bronze : "none"} stroke={filled ? C.bronze : "rgba(245,241,234,0.35)"}
    strokeWidth="1.2" style={{ transition: "fill 0.2s, stroke 0.2s, transform 0.2s" }}>
    <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.45l-5.81 3.05 1.11-6.47-4.7-4.58 6.5-.95z" />
  </svg>
);

const LABELS = ["", "Muy mal", "Mal", "Aceptable", "Muy bien", "Excelente"];

// Espejo de cleanName/nameError en lib/db.js. El backend vuelve a validar;
// esto es solo para que el cliente vea el error mientras escribe.
const NAME_STRIP_RE = /[^\p{L}\p{M}'’ -]/gu;
const NAME_HAS_FORBIDDEN_RE = /[^\p{L}\p{M}'’ -]/u;
const cleanName = (v, max = 40) => String(v ?? "")
  .replace(NAME_STRIP_RE, "").replace(/['’-]{2,}/g, m => m[0])
  .replace(/\s+/g, " ").trimStart().slice(0, max);
const nameError = (v) => {
  const raw = String(v ?? "").trim();
  if (!raw) return "Escribe el nombre con el que quieres aparecer.";
  if (raw.replace(/[^\p{L}]/gu, "").length < 2) return "Escribe al menos 2 letras.";
  return "";
};

function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div>
      <div style={{ display: "flex", gap: 6 }} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            aria-label={`${n} de 5 estrellas`}
            aria-pressed={value === n}
            style={{
              background: "transparent", border: "none", padding: 2, cursor: "pointer",
              lineHeight: 0, transform: shown >= n ? "scale(1.06)" : "scale(1)",
            }}>
            <Star filled={shown >= n} />
          </button>
        ))}
      </div>
      <div style={{ height: 18, marginTop: 10 }}>
        {shown > 0 && <RMono style={{ color: C.bronze }}>{LABELS[shown]}</RMono>}
      </div>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: C.noir, color: C.ivory }}>
      <header style={{
        padding: "22px 32px", borderBottom: "1px solid rgba(245,241,234,0.08)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <a href="/" style={{
          fontFamily: "'Marcellus', serif", fontSize: 20, letterSpacing: "0.3em",
          color: C.ivory, textDecoration: "none",
        }}>JOXE</a>
        <RMono style={{ opacity: 0.5 }}>Tu opinión</RMono>
      </header>
      <main style={{ padding: "56px 32px 80px", maxWidth: 620, margin: "0 auto" }}>
        {children}
      </main>
    </div>
  );
}

function Notice({ title, body, tone = "neutral", account = false }) {
  const color = tone === "error" ? C.red : tone === "ok" ? C.green : C.bronze;
  return (
    <div style={{ textAlign: "center", paddingTop: 40 }}>
      <div style={{
        width: 46, height: 46, borderRadius: "50%", margin: "0 auto 24px",
        border: `1px solid ${color}`, display: "flex", alignItems: "center",
        justifyContent: "center", color, fontSize: 20,
      }}>{tone === "error" ? "!" : "✓"}</div>
      <h1 style={{
        fontFamily: "'Marcellus', serif", fontSize: 28, fontWeight: 400,
        margin: "0 0 12px", letterSpacing: "0.02em",
      }}>{title}</h1>
      <p style={{ opacity: 0.65, fontSize: 15, lineHeight: 1.7, margin: "0 auto", maxWidth: 380 }}>
        {body}
      </p>
      <div style={{
        display: "flex", gap: 12, justifyContent: "center",
        flexWrap: "wrap", marginTop: 36,
      }}>
        {account && (
          <a href="/cuenta" style={{
            padding: "13px 30px", background: C.bronze, color: C.noir,
            textDecoration: "none", fontSize: 12,
            letterSpacing: "0.2em", textTransform: "uppercase",
          }}>Ver mi cuenta</a>
        )}
        <a href="/" style={{
          padding: "13px 30px",
          border: `1px solid ${C.bronze}`, color: C.bronze, textDecoration: "none",
          fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
        }}>Volver al inicio</a>
      </div>
    </div>
  );
}


// Campo de la pantalla de identificación. Mismo look que el resto: caja
// translúcida sobre el fondo negro, sin bordes redondeados.
function IdField({ id, label, hint, value, onChange, maxLength, inputMode = "numeric", autoComplete }) {
  return (
    <div>
      <label htmlFor={id} style={{ display: "block", marginBottom: 10 }}>
        <RMono style={{ opacity: 0.55 }}>{label}</RMono>
      </label>
      <input id={id} value={value} maxLength={maxLength} inputMode={inputMode}
        autoComplete={autoComplete}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", padding: "15px 16px",
          background: "rgba(245,241,234,0.04)", color: C.ivory,
          border: "1px solid rgba(245,241,234,0.15)", borderRadius: 0,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 15,
          letterSpacing: "0.08em",
        }} />
      {hint && (
        <div style={{ marginTop: 6, opacity: 0.4, fontSize: 11, lineHeight: 1.5 }}>{hint}</div>
      )}
    </div>
  );
}

function ResenaPortal() {
  const urlToken = new URLSearchParams(window.location.search).get("t") || "";
  // El token puede venir del link o salir de la identificación por cédula.
  const [token, setToken] = useState(urlToken);
  const [state, setState] = useState({ phase: urlToken ? "loading" : "identify" });
  const [rating, setRating] = useState(0);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // Identificación (solo cuando se entra sin link).
  const [cedula, setCedula] = useState("");
  const [phone4, setPhone4] = useState("");
  const [idError, setIdError] = useState("");
  const [idBusy, setIdBusy] = useState(false);
  // Avisa cuando el filtro descarta algo de lo que se escribió en el nombre.
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!urlToken) return;
    fetch(`/api/reviews?token=${encodeURIComponent(urlToken)}`)
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "error");
        if (data.already) setState({ phase: "already", appt: data.appt, review: data.review });
        else {
          setName(cleanName(data.appt?.name || ""));
          setState({ phase: "form", appt: data.appt });
        }
      })
      .catch(err => setState({ phase: err.message === "not_found" ? "notfound" : "invalid" }));
  }, [urlToken]);

  // Cédula + últimos 4 del celular: la misma llave que pide Mi Cuenta. La
  // cédula sola no basta, no es un dato secreto.
  const identify = async () => {
    if (cedula.length < 6) { setIdError("Escribe tu cédula completa."); return; }
    if (phone4.length !== 4) { setIdError("Faltan los últimos 4 dígitos de tu celular."); return; }
    setIdBusy(true); setIdError("");
    try {
      const r = await fetch("/api/client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review-lookup", cedula, phone4 }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 401) throw new Error("No encontramos una visita con esos datos. Revisa tu cédula y los últimos 4 dígitos del celular con el que reservaste.");
      if (r.status === 429) throw new Error("Demasiados intentos. Espera unos minutos y vuelve a probar.");
      if (data.error === "not_completed") throw new Error("Todavía no tienes una visita completada para reseñar. Cuando termines tu próxima cita podrás dejarnos tu opinión.");
      if (!r.ok) throw new Error(data.error || "No pudimos verificar tus datos.");
      if (data.already) {
        setState({ phase: "already", review: null });
        return;
      }
      setToken(data.token);
      setName(cleanName(data.name || ""));
      setState({ phase: "form", appt: { ...data.appt, name: cleanName(data.name || "") } });
    } catch (err) {
      setIdError(err.message);
    } finally {
      setIdBusy(false);
    }
  };

  const submit = async () => {
    if (rating === 0) { setError("Elige cuántas estrellas nos das."); return; }
    const nameErr = nameError(name);
    if (nameErr) { setError(nameErr); return; }
    setSending(true); setError("");
    try {
      const r = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: cleanName(name), rating, text: text.trim() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "No pudimos guardar tu reseña.");
      setState(s => ({ ...s, phase: "thanks" }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (state.phase === "identify") {
    return (
      <Shell>
        <RMono style={{ color: C.bronze }}>Tu opinión</RMono>
        <h1 style={{
          fontFamily: "'Marcellus', serif", fontSize: 34, fontWeight: 400,
          margin: "16px 0 10px", letterSpacing: "0.01em", lineHeight: 1.2,
        }}>Cuéntanos cómo te fue.</h1>
        <p style={{ opacity: 0.6, fontSize: 15, lineHeight: 1.7, margin: "0 0 36px" }}>
          Identifícate con tu cédula y buscamos tu última visita. Solo pueden
          opinar quienes ya estuvieron en el salón.
        </p>

        <div style={{ display: "grid", gap: 24, maxWidth: 420 }}>
          <IdField id="rv-cedula" label="Cédula" autoComplete="off"
            value={cedula} maxLength={12}
            hint="Sin puntos ni espacios."
            onChange={v => { setCedula(v.replace(/\D/g, "").slice(0, 12)); setIdError(""); }} />
          <IdField id="rv-phone4" label="Últimos 4 del celular" autoComplete="off"
            value={phone4} maxLength={4}
            hint="Los 4 últimos dígitos del número con el que reservaste."
            onChange={v => { setPhone4(v.replace(/\D/g, "").slice(0, 4)); setIdError(""); }} />
        </div>

        {idError && (
          <div style={{
            marginTop: 22, padding: "12px 16px", fontSize: 13, maxWidth: 420,
            color: C.red, border: `1px solid ${C.red}`,
            background: "rgba(196,102,102,0.07)", lineHeight: 1.6,
          }}>{idError}</div>
        )}

        <button onClick={identify} disabled={idBusy} style={{
          marginTop: 30, maxWidth: 420, width: "100%", padding: "17px 22px",
          background: idBusy ? "transparent" : C.bronze,
          color: idBusy ? C.bronze : C.noir,
          border: `1px solid ${C.bronze}`, cursor: idBusy ? "default" : "pointer",
          fontFamily: "'Outfit', sans-serif", fontSize: 13,
          letterSpacing: "0.2em", textTransform: "uppercase",
          transition: "background 0.3s, color 0.3s",
        }}>
          {idBusy ? "Buscando…" : "Continuar"}
        </button>

        <p style={{ marginTop: 18, opacity: 0.4, fontSize: 12, lineHeight: 1.6, maxWidth: 420 }}>
          Usamos estos datos solo para encontrar tu visita. No se publican.
        </p>
      </Shell>
    );
  }
  if (state.phase === "loading") {
    return <Shell><div style={{ textAlign: "center", paddingTop: 60, opacity: 0.5 }}><RMono>Cargando…</RMono></div></Shell>;
  }
  if (state.phase === "invalid") {
    return <Shell><Notice tone="error" title="Link no válido"
      body="Este enlace expiró o no es correcto. Pídele uno nuevo al salón por WhatsApp y con gusto te lo reenviamos." /></Shell>;
  }
  if (state.phase === "notfound") {
    return <Shell><Notice tone="error" title="No encontramos tu cita"
      body="El enlace apunta a una cita que ya no está registrada. Escríbenos y lo revisamos." /></Shell>;
  }
  if (state.phase === "already") {
    return <Shell><Notice tone="ok" account title="Ya nos dejaste tu opinión"
      body={state.review?.status === "approved"
        ? "Tu reseña ya está publicada en nuestra web. Gracias por tomarte el tiempo."
        : "Ya tenemos tu opinión de la última visita. Aparecerá en la web en cuanto la revisemos. Gracias."} /></Shell>;
  }
  if (state.phase === "thanks") {
    return <Shell><Notice tone="ok" account title="Gracias por escribirnos"
      body="Revisamos cada reseña antes de publicarla, así que la tuya aparecerá en la web en poco tiempo. Puedes seguir su estado en Mi Cuenta, junto a tu historial de visitas." /></Shell>;
  }

  const { appt } = state;
  return (
    <Shell>
      <RMono style={{ color: C.bronze }}>{appt.service || "Tu visita"}</RMono>
      <h1 style={{
        fontFamily: "'Marcellus', serif", fontSize: 34, fontWeight: 400,
        margin: "16px 0 10px", letterSpacing: "0.01em", lineHeight: 1.2,
      }}>
        {appt.name}, ¿cómo te fue?
      </h1>
      <p style={{ opacity: 0.6, fontSize: 15, lineHeight: 1.7, margin: "0 0 40px" }}>
        {appt.stylist ? `Te atendió ${appt.stylist}. ` : ""}
        Tu opinión nos ayuda a mejorar y a que otras personas sepan qué esperar.
      </p>

      <StarPicker value={rating} onChange={n => { setRating(n); setError(""); }} />

      <label htmlFor="rv-name" style={{ display: "block", margin: "32px 0 10px" }}>
        <RMono style={{ opacity: 0.55 }}>Tu nombre</RMono>
      </label>
      <input id="rv-name" value={name} maxLength={40} autoComplete="given-name"
        onChange={e => {
          // Se filtra al escribir: números, emojis y símbolos no entran.
          setBlocked(NAME_HAS_FORBIDDEN_RE.test(e.target.value));
          setName(cleanName(e.target.value));
          setError("");
        }}
        placeholder="Así aparecerás en la web"
        style={{
          width: "100%", padding: "15px 16px",
          background: "rgba(245,241,234,0.04)", color: C.ivory,
          border: "1px solid rgba(245,241,234,0.15)", borderRadius: 0,
          fontFamily: "'Outfit', sans-serif", fontSize: 15,
        }} />
      <div style={{ marginTop: 6, opacity: blocked ? 1 : 0.4, fontSize: 11, lineHeight: 1.5,
        color: blocked ? C.red : "inherit" }}>
        {blocked
          ? "Solo letras: sin números, emojis ni símbolos."
          : "Este es el nombre con el que te tenemos registrado. Puedes ajustarlo si prefieres otro."}
      </div>

      <label htmlFor="rv-text" style={{ display: "block", margin: "28px 0 10px" }}>
        <RMono style={{ opacity: 0.55 }}>Cuéntanos (opcional)</RMono>
      </label>
      <textarea id="rv-text" value={text} maxLength={600}
        onChange={e => setText(e.target.value)}
        placeholder="Lo que más te gustó, lo que podríamos mejorar…"
        style={{
          width: "100%", minHeight: 130, resize: "vertical", padding: 16,
          background: "rgba(245,241,234,0.04)", color: C.ivory,
          border: "1px solid rgba(245,241,234,0.15)", borderRadius: 0,
          fontFamily: "'Outfit', sans-serif", fontSize: 15, lineHeight: 1.6,
        }} />
      <div style={{ textAlign: "right", marginTop: 6, opacity: 0.4, fontSize: 11 }}>
        {text.length}/600
      </div>

      {error && (
        <div style={{
          marginTop: 20, padding: "12px 16px", fontSize: 13,
          color: C.red, border: `1px solid ${C.red}`,
          background: "rgba(196,102,102,0.07)",
        }}>{error}</div>
      )}

      <button onClick={submit} disabled={sending} style={{
        marginTop: 30, width: "100%", padding: "17px 22px",
        background: sending ? "transparent" : C.bronze,
        color: sending ? C.bronze : C.noir,
        border: `1px solid ${C.bronze}`, cursor: sending ? "default" : "pointer",
        fontFamily: "'Outfit', sans-serif", fontSize: 13,
        letterSpacing: "0.2em", textTransform: "uppercase",
        transition: "background 0.3s, color 0.3s",
      }}>
        {sending ? "Enviando…" : "Enviar reseña"}
      </button>

      <p style={{ marginTop: 18, opacity: 0.4, fontSize: 12, lineHeight: 1.6, textAlign: "center" }}>
        Publicamos el nombre que escribas aquí y tu comentario. Nada más.
      </p>
    </Shell>
  );
}
