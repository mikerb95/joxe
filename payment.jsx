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

// ——————————————————————————————————————————————
// Dialog — branded, accessible confirm/alert (replaces window.confirm/alert)
// ——————————————————————————————————————————————
const Dialog = ({ open, title, body, confirmLabel = "Confirmar", cancelLabel = "Cancelar",
                  danger = false, hideCancel = false, onConfirm, onCancel }) => {
  const cancelRef = React.useRef(null);
  const confirmRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const target = hideCancel ? confirmRef.current : (cancelRef.current || confirmRef.current);
    setTimeout(() => target?.focus(), 0);
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onCancel?.(); }
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
  }, [open, hideCancel, onCancel]);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="pay-dlg-title"
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(12,12,12,0.78)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, animation: "fadeIn 0.2s ease",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}
    >
      <div style={{
        background: C.s1, color: C.text,
        border: `1px solid ${C.bdr}`,
        padding: 32, maxWidth: 440, width: "100%",
        fontFamily: "'Outfit', sans-serif",
      }}>
        {title && (
          <h2 id="pay-dlg-title" style={{
            fontFamily: "'Marcellus', serif", fontSize: 24, fontWeight: 400,
            margin: "0 0 12px", color: danger ? C.red : C.text,
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
              background: "transparent", color: C.text,
              border: `1px solid ${C.bdr}`, padding: "12px 18px",
              cursor: "pointer", fontFamily: "'Outfit', sans-serif",
              fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase",
            }}>{cancelLabel}</button>
          )}
          <button ref={confirmRef} onClick={onConfirm} type="button" style={{
            flex: "1 1 120px", minWidth: 0,
            background: danger ? "rgba(196,102,102,0.15)" : C.gold,
            color: danger ? C.red : "#0C0C0C",
            border: danger ? `1px solid ${C.red}40` : "none",
            padding: "12px 18px", cursor: "pointer", fontFamily: "'Outfit', sans-serif",
            fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase",
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

const useDialog = () => {
  const [state, setState] = React.useState(null);
  const ask = React.useCallback((opts, hideCancel) =>
    new Promise((resolve) => setState({ resolve, opts: { ...opts, hideCancel: !!hideCancel } })),
    []
  );
  const close = (r) => { state?.resolve(r); setState(null); };
  const node = (
    <Dialog
      open={!!state}
      title={state?.opts?.title} body={state?.opts?.body}
      confirmLabel={state?.opts?.confirmLabel} cancelLabel={state?.opts?.cancelLabel}
      danger={state?.opts?.danger} hideCancel={state?.opts?.hideCancel}
      onConfirm={() => close(true)} onCancel={() => close(false)}
    />
  );
  return {
    confirm: (opts) => ask(opts, false),
    alert:   (opts) => ask({ confirmLabel: "Entendido", ...opts }, true),
    node,
  };
};

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
  const dlg = useDialog();

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
    const ok = await dlg.confirm(
      action === "confirm"
        ? { title: "Confirmar recibo del abono", body: "Marcarás esta reserva como pagada. El cliente recibirá su cita confirmada.", confirmLabel: "Confirmar abono" }
        : { title: "Cancelar esta reserva", body: "La cita quedará marcada como cancelada y el cliente lo verá en su cuenta. Esta acción no se puede deshacer desde aquí.", confirmLabel: "Cancelar reserva", danger: true }
    );
    if (!ok) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/payment", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ id: paymentId, action }),
      });
      if (res.status === 401) { doLogout(); window.location.reload(); return; }
      if (!res.ok) {
        await dlg.alert({ title: "Error al procesar", body: "No pudimos completar la acción. Intenta de nuevo." });
      } else {
        load();
      }
    } catch {
      await dlg.alert({ title: "Error de conexión", body: "Revisa tu internet e intenta de nuevo." });
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
      {dlg.node}
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
