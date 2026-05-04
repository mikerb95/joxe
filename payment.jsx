// JOXE — Confirmación de abono (admin/empleado)

const SES_KEY = "joxe_admin_session";

const getToken  = () => sessionStorage.getItem(SES_KEY) ?? "";
const isAuthed  = () => !!sessionStorage.getItem(SES_KEY);
const doLogin   = (pw) => sessionStorage.setItem(SES_KEY, pw);
const doLogout  = () => sessionStorage.removeItem(SES_KEY);

const adminHeaders = () => ({
  "Content-Type": "application/json",
  "Authorization": `Bearer ${getToken()}`,
});

const C = {
  bg: "#0C0C0C", s1: "#111", s2: "#181818",
  bdr: "rgba(245,241,234,0.1)",
  gold: "#C29E66", text: "#F5F1EA",
  muted: "rgba(245,241,234,0.5)",
  red: "#C46666", green: "#66C499",
};

const Mono = ({ children, style }) => (
  <span style={{
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase",
    ...style,
  }}>{children}</span>
);

const getPaymentId = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("paymentID") || params.get("paymentId") || params.get("id") || "";
};

// ——————————————————————————————————————————————
// LOGIN SCREEN
// ——————————————————————————————————————————————
const LoginScreen = ({ onLogin }) => {
  const [pw, setPw] = React.useState("");
  const [err, setErr] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (data.ok) { doLogin(pw); onLogin(); }
      else { setErr("Contraseña incorrecta."); }
    } catch {
      setErr("Error de conexión. Intenta de nuevo.");
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        background: C.s1, border: `1px solid ${C.bdr}`,
        padding: "48px 40px", maxWidth: 380, width: "100%",
      }}>
        <div style={{
          fontFamily: "'Marcellus', serif", fontSize: 28,
          color: C.text, marginBottom: 8, letterSpacing: "0.3em",
        }}>JOXE</div>
        <Mono style={{ color: C.gold, display: "block", marginBottom: 32 }}>
          Confirmación de abono
        </Mono>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <Mono style={{ color: C.muted, fontSize: 9, display: "block", marginBottom: 8 }}>
              Contraseña admin
            </Mono>
            <input
              type="password" value={pw} onChange={e => setPw(e.target.value)}
              autoFocus required
              style={{
                width: "100%", padding: "14px", background: C.s2,
                border: `1px solid ${C.bdr}`, color: C.text,
                fontFamily: "'Outfit', sans-serif", fontSize: 15,
              }}
            />
          </div>
          {err && (
            <div style={{ fontSize: 13, color: C.red }}>{err}</div>
          )}
          <button type="submit" disabled={loading || !pw} style={{
            background: loading || !pw ? C.s2 : C.gold,
            color: loading || !pw ? C.muted : "#0C0C0C",
            border: "none", padding: "14px", cursor: loading || !pw ? "not-allowed" : "pointer",
            fontFamily: "'Outfit', sans-serif", fontSize: 12,
            letterSpacing: "0.2em", textTransform: "uppercase",
          }}>
            {loading ? "Verificando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
};

// ——————————————————————————————————————————————
// PAYMENT CONFIRMATION SCREEN
// ——————————————————————————————————————————————
const PaymentScreen = ({ paymentId }) => {
  const [appt, setAppt] = React.useState(null);
  const [status, setStatus] = React.useState("idle"); // idle | loading | confirmed | cancelled | error | not_found
  const [actionLoading, setActionLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch(`/api/payment?id=${encodeURIComponent(paymentId)}`, {
        headers: adminHeaders(),
      });
      if (res.status === 401) { doLogout(); window.location.reload(); return; }
      if (res.status === 404) { setStatus("not_found"); return; }
      if (!res.ok) { setStatus("error"); return; }
      const data = await res.json();
      setAppt(data);
      if (data.cancelled) setStatus("cancelled");
      else if (data.paymentConfirmed) setStatus("confirmed");
      else setStatus("idle");
    } catch {
      setStatus("error");
    }
  }, [paymentId]);

  React.useEffect(() => { load(); }, [load]);

  const act = async (action) => {
    if (!confirm(action === "confirm" ? "¿Confirmar recibo del abono?" : "¿Cancelar esta reserva?")) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/payment", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ id: paymentId, action }),
      });
      if (res.status === 401) { doLogout(); window.location.reload(); return; }
      if (!res.ok) { alert("Error al procesar la acción."); }
      else { load(); }
    } catch {
      alert("Error de conexión.");
    }
    setActionLoading(false);
  };

  const fmtDate = (d) =>
    d ? new Date(d + "T12:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "—";

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.text, padding: "40px 24px",
      fontFamily: "'Outfit', sans-serif",
    }}>
      <div style={{ maxWidth: 540, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 48 }}>
          <div style={{
            fontFamily: "'Marcellus', serif", fontSize: 24, letterSpacing: "0.3em",
          }}>JOXE</div>
          <button onClick={() => { doLogout(); window.location.reload(); }} style={{
            background: "transparent", border: "none", color: C.muted,
            fontFamily: "'Outfit', sans-serif", fontSize: 11, letterSpacing: "0.15em",
            textTransform: "uppercase", cursor: "pointer",
          }}>Salir</button>
        </div>

        <Mono style={{ color: C.gold, display: "block", marginBottom: 16 }}>
          Confirmación de abono
        </Mono>
        <div style={{
          fontFamily: "'Marcellus', serif", fontSize: 32, fontWeight: 400,
          letterSpacing: "-0.01em", marginBottom: 40,
        }}>
          Reserva #{paymentId.slice(0, 8).toUpperCase()}
        </div>

        {status === "loading" && (
          <div style={{ color: C.muted, fontSize: 14 }}>Cargando reserva…</div>
        )}

        {status === "not_found" && (
          <div style={{
            padding: 24, background: C.s2, border: `1px solid ${C.bdr}`,
            color: C.muted, fontSize: 14,
          }}>
            Reserva no encontrada. El ID puede ser incorrecto o expirado.
          </div>
        )}

        {status === "error" && (
          <div style={{
            padding: 24, background: C.s2, border: `1px solid ${C.bdr}`,
            color: C.red, fontSize: 14,
          }}>
            Error al cargar la reserva. <button onClick={load} style={{
              background: "none", border: "none", color: C.gold,
              cursor: "pointer", fontFamily: "inherit", fontSize: "inherit",
              padding: 0, textDecoration: "underline",
            }}>Reintentar</button>
          </div>
        )}

        {appt && (
          <>
            {/* Status badge */}
            {(status === "confirmed" || status === "cancelled") && (
              <div style={{
                padding: "12px 20px", marginBottom: 32,
                background: status === "confirmed" ? "rgba(102,196,153,0.1)" : "rgba(196,102,102,0.1)",
                border: `1px solid ${status === "confirmed" ? C.green : C.red}40`,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>{status === "confirmed" ? "✓" : "✕"}</span>
                <Mono style={{ color: status === "confirmed" ? C.green : C.red, fontSize: 10 }}>
                  {status === "confirmed" ? "Abono confirmado" : "Reserva cancelada"}
                </Mono>
              </div>
            )}

            {/* Appointment details */}
            <div style={{
              background: C.s1, border: `1px solid ${C.bdr}`,
              padding: "32px",
            }}>
              <Mono style={{ color: C.muted, fontSize: 9, display: "block", marginBottom: 24 }}>
                Detalles de la cita
              </Mono>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px 32px" }}>
                {[
                  ["Cliente", appt.name],
                  ["Teléfono", appt.phone],
                  ["Servicio", appt.service],
                  ["Estilista", appt.stylist || "Sin asignar"],
                  ["Fecha", fmtDate(appt.date)],
                  ["Hora", appt.time],
                ].map(([label, value]) => (
                  <div key={label}>
                    <Mono style={{ color: C.muted, fontSize: 9, display: "block", marginBottom: 6 }}>
                      {label}
                    </Mono>
                    <div style={{ fontSize: 15, lineHeight: 1.4 }}>{value || "—"}</div>
                  </div>
                ))}
              </div>

              {appt.paymentConfirmedAt && (
                <div style={{
                  marginTop: 24, paddingTop: 24, borderTop: `1px solid ${C.bdr}`,
                  fontSize: 12, color: C.muted,
                }}>
                  Confirmado el{" "}
                  {new Date(appt.paymentConfirmedAt).toLocaleString("es-CO", {
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </div>
              )}
            </div>

            {/* Actions — only show if not already resolved */}
            {status === "idle" && (
              <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                <button
                  onClick={() => act("confirm")}
                  disabled={actionLoading}
                  style={{
                    flex: 1, padding: "18px", background: C.green, color: "#0C0C0C",
                    border: "none", cursor: actionLoading ? "not-allowed" : "pointer",
                    fontFamily: "'Outfit', sans-serif", fontSize: 12,
                    letterSpacing: "0.2em", textTransform: "uppercase",
                    opacity: actionLoading ? 0.5 : 1,
                  }}
                >
                  ✓ Confirmar reserva
                </button>
                <button
                  onClick={() => act("cancel")}
                  disabled={actionLoading}
                  style={{
                    flex: 1, padding: "18px", background: "transparent", color: C.red,
                    border: `1px solid ${C.red}60`, cursor: actionLoading ? "not-allowed" : "pointer",
                    fontFamily: "'Outfit', sans-serif", fontSize: 12,
                    letterSpacing: "0.2em", textTransform: "uppercase",
                    opacity: actionLoading ? 0.5 : 1,
                  }}
                >
                  ✕ Cancelar reserva
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ——————————————————————————————————————————————
// ROOT
// ——————————————————————————————————————————————
const PaymentPortal = () => {
  const [authed, setAuthed] = React.useState(isAuthed());
  const paymentId = getPaymentId();

  if (!paymentId) {
    return (
      <div style={{
        minHeight: "100vh", background: C.bg, color: C.text,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Outfit', sans-serif", fontSize: 14, opacity: 0.6,
      }}>
        No se especificó un ID de reserva.
      </div>
    );
  }

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;
  return <PaymentScreen paymentId={paymentId} />;
};
