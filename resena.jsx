// JOXE — Página de reseña del cliente.
// Se llega aquí solo con el link firmado que el salón manda tras completar la
// cita: /resena?t=<token>. Sin token válido no hay formulario.

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

function Notice({ title, body, tone = "neutral" }) {
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
      <a href="/" style={{
        display: "inline-block", marginTop: 36, padding: "13px 30px",
        border: `1px solid ${C.bronze}`, color: C.bronze, textDecoration: "none",
        fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
      }}>Volver al inicio</a>
    </div>
  );
}

function ResenaPortal() {
  const token = new URLSearchParams(window.location.search).get("t") || "";
  const [state, setState] = useState({ phase: "loading" });
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setState({ phase: "invalid" }); return; }
    fetch(`/api/reviews?token=${encodeURIComponent(token)}`)
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "error");
        if (data.already) setState({ phase: "already", appt: data.appt, review: data.review });
        else setState({ phase: "form", appt: data.appt });
      })
      .catch(err => setState({ phase: err.message === "not_found" ? "notfound" : "invalid" }));
  }, [token]);

  const submit = async () => {
    if (rating === 0) { setError("Elige cuántas estrellas nos das."); return; }
    setSending(true); setError("");
    try {
      const r = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, rating, text: text.trim() }),
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
    return <Shell><Notice tone="ok" title="Ya nos dejaste tu opinión"
      body={state.review?.status === "approved"
        ? "Tu reseña ya está publicada en nuestra web. Gracias por tomarte el tiempo."
        : "La recibimos y está en revisión. Aparecerá en la web muy pronto. Gracias."} /></Shell>;
  }
  if (state.phase === "thanks") {
    return <Shell><Notice tone="ok" title="Gracias por escribirnos"
      body="Revisamos cada reseña antes de publicarla, así que la tuya aparecerá en la web en poco tiempo." /></Shell>;
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

      <label htmlFor="rv-text" style={{ display: "block", margin: "32px 0 10px" }}>
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
        Publicamos tu nombre de pila y tu comentario. Nada más.
      </p>
    </Shell>
  );
}
