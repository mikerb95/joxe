// JOXE ACADEMIA — Página pública de las clases de barbería
// El contenido lo edita el salón desde el panel (Admin → Academia). Aquí no
// hay textos de negocio quemados: si no hay nada publicado, la página lo dice.

const { useState, useEffect } = React;

const AC_STATUS = { idle: "idle", sending: "sending", sent: "sent" };

// ——————————————————————————————————————————————
// HERO
// ——————————————————————————————————————————————
const AcHero = ({ content, onEnroll }) => (
  <section id="top" style={{
    background: "var(--noir)", color: "var(--ivory)",
    padding: "180px 64px 96px", position: "relative",
  }} className="ac-hero">
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <Mono style={{ color: "var(--bronze)" }}>{content.kicker || "Academia JOXE"}</Mono>
      <h1 style={{
        fontFamily: "var(--display)", fontWeight: 400,
        fontSize: "clamp(44px, 7vw, 104px)", lineHeight: 1,
        margin: "28px 0 0", letterSpacing: "-0.02em", maxWidth: 1100,
      }}>
        {content.headline || <>Clases de barbería<br /><em style={{ color: "var(--bronze)" }}>en el salón.</em></>}
      </h1>
      {content.intro && (
        <p style={{
          fontFamily: "var(--sans)", fontSize: 17, lineHeight: 1.7,
          opacity: 0.72, maxWidth: 620, margin: "36px 0 0",
        }}>{content.intro}</p>
      )}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 48 }}>
        <button onClick={onEnroll} style={{
          background: "var(--bronze)", border: "1px solid var(--bronze)",
          color: "var(--noir)", padding: "18px 34px", cursor: "pointer",
          fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}>Quiero inscribirme</button>
        <a href="/#servicios" style={{
          border: "1px solid rgba(245,241,234,0.25)", color: "var(--ivory)",
          textDecoration: "none", padding: "18px 34px",
          fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.2em",
          textTransform: "uppercase", display: "inline-flex", alignItems: "center",
        }}>Ver el salón</a>
      </div>

      {(content.nextStart || content.location) && (
        <div style={{
          display: "flex", gap: 48, flexWrap: "wrap", marginTop: 64,
          paddingTop: 32, borderTop: "1px solid rgba(245,241,234,0.12)",
        }}>
          {content.nextStart && (
            <div>
              <Mono style={{ color: "var(--bronze)", fontSize: 9 }}>Próximo grupo</Mono>
              <div style={{ fontFamily: "var(--sans)", fontSize: 16, marginTop: 10 }}>{content.nextStart}</div>
            </div>
          )}
          {content.location && (
            <div>
              <Mono style={{ color: "var(--bronze)", fontSize: 9 }}>Dónde</Mono>
              <div style={{ fontFamily: "var(--sans)", fontSize: 16, marginTop: 10 }}>{content.location}</div>
            </div>
          )}
        </div>
      )}
    </div>
  </section>
);

// ——————————————————————————————————————————————
// QUÉ INCLUYE
// ——————————————————————————————————————————————
const AcIncludes = ({ items }) => {
  if (!items?.length) return null;
  return (
    <section style={{
      background: "var(--ivory)", color: "var(--noir)", padding: "96px 64px",
    }} className="section">
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <Mono style={{ color: "var(--bronze)" }}>Qué incluye</Mono>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
          gap: 40, marginTop: 40,
        }}>
          {items.map((item, i) => (
            <div key={i} style={{ paddingTop: 24, borderTop: "1px solid rgba(20,18,18,0.15)" }}>
              <Mono style={{ color: "var(--bronze)", fontSize: 10 }}>
                {String(i + 1).padStart(2, "0")}
              </Mono>
              <p style={{
                fontFamily: "var(--sans)", fontSize: 16, lineHeight: 1.6,
                margin: "14px 0 0",
              }}>{item}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ——————————————————————————————————————————————
// CURSOS
// ——————————————————————————————————————————————
const AcCourse = ({ course, onEnroll }) => {
  const meta = [course.level, course.duration, course.schedule].filter(Boolean);
  return (
    <article style={{
      background: "var(--ivory)", padding: "40px 40px 36px",
      boxShadow: "0 1px 0 rgba(20,18,18,0.12), 0 18px 40px -32px rgba(20,18,18,0.5)",
      display: "flex", flexDirection: "column", gap: 20,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{
          width: 7, height: 7, borderRadius: 999, background: "var(--bronze)",
          flexShrink: 0, transform: "translateY(-4px)",
        }} />
        <h3 style={{
          fontFamily: "var(--display)", fontWeight: 400, fontSize: 32,
          margin: 0, letterSpacing: "-0.01em", lineHeight: 1.15,
        }}>{course.name}</h3>
      </div>

      {meta.length > 0 && (
        <Mono style={{ color: "rgba(20,18,18,0.5)", fontSize: 10 }}>{meta.join(" · ")}</Mono>
      )}

      {course.summary && (
        <p style={{
          fontFamily: "var(--sans)", fontSize: 15, lineHeight: 1.7,
          opacity: 0.75, margin: 0,
        }}>{course.summary}</p>
      )}

      {course.topics?.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
          {course.topics.map((t, i) => (
            <li key={i} style={{
              fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.5,
              display: "grid", gridTemplateColumns: "16px 1fr", gap: 8, opacity: 0.8,
            }}>
              <span style={{ color: "var(--bronze)" }}>✦</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}

      <div style={{
        marginTop: "auto", paddingTop: 24, borderTop: "1px solid rgba(20,18,18,0.12)",
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        gap: 20, flexWrap: "wrap",
      }}>
        <div>
          {course.price > 0 ? (
            <div style={{
              fontFamily: "var(--sans)", fontSize: 24, letterSpacing: "-0.01em",
              fontVariantNumeric: "tabular-nums",
            }}>{formatPrice(course.price, course.note)}</div>
          ) : (
            <div style={{ fontFamily: "var(--sans)", fontSize: 15, opacity: 0.6 }}>
              Precio a consultar
            </div>
          )}
          {course.seats > 0 && (
            <Mono style={{ color: "var(--bronze)", fontSize: 9, display: "block", marginTop: 8 }}>
              {course.seats} cupo{course.seats !== 1 ? "s" : ""}
            </Mono>
          )}
        </div>
        <button onClick={() => onEnroll(course.id)} style={{
          border: "1px solid var(--noir)", background: "transparent", color: "var(--noir)",
          padding: "13px 24px", cursor: "pointer", fontFamily: "var(--sans)",
          fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
          transition: "background 0.25s, color 0.25s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--noir)"; e.currentTarget.style.color = "var(--ivory)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--noir)"; }}
        >Inscribirme</button>
      </div>
    </article>
  );
};

const AcCourses = ({ courses, onEnroll }) => {
  if (!courses?.length) return null;
  return (
    <section id="cursos" style={{
      background: "#EDE6DA", color: "var(--noir)", padding: "110px 64px",
    }} className="section">
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <Mono style={{ color: "var(--bronze)" }}>Los cursos</Mono>
        <h2 style={{
          fontFamily: "var(--display)", fontWeight: 400,
          fontSize: "clamp(34px, 4vw, 56px)", lineHeight: 1.05,
          margin: "20px 0 56px", letterSpacing: "-0.01em",
        }}>
          Elige por dónde <em style={{ color: "var(--bronze)" }}>empezar.</em>
        </h2>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 28,
        }} className="ac-courses-grid">
          {courses.map(c => <AcCourse key={c.id} course={c} onEnroll={onEnroll} />)}
        </div>
      </div>
    </section>
  );
};

// ——————————————————————————————————————————————
// FORMULARIO DE INSCRIPCIÓN
// ——————————————————————————————————————————————
const AcField = ({ label, children }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <Mono style={{ color: "var(--bronze)", fontSize: 9 }}>{label}</Mono>
    {children}
  </label>
);

const acInputStyle = {
  background: "transparent", border: "1px solid rgba(245,241,234,0.22)",
  color: "var(--ivory)", padding: "14px 16px", width: "100%",
  fontFamily: "var(--sans)", fontSize: 15,
};

const AcEnroll = React.forwardRef(({ content, courseId, onCourseChange }, ref) => {
  const [form, setForm] = useState({ name: "", phone: "", email: "", message: "" });
  const [status, setStatus] = useState(AC_STATUS.idle);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const courses = content.courses || [];

  const wa = getWAConfig();
  const waMsg = content.whatsappMsg
    || `Hola, quiero información sobre las clases${courseId ? " de " + (courses.find(c => c.id === courseId)?.name || "") : ""}.`;
  const waUrl = `https://wa.me/${wa.number}?text=${encodeURIComponent(waMsg)}`;

  const submit = async (e) => {
    e.preventDefault();
    if (status === AC_STATUS.sending) return;
    setStatus(AC_STATUS.sending);
    setError("");
    try {
      const res = await fetch("/api/academy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, courseId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo enviar la solicitud");
      setStatus(AC_STATUS.sent);
    } catch (err) {
      setError(err.message);
      setStatus(AC_STATUS.idle);
    }
  };

  return (
    <section id="inscripcion" ref={ref} style={{
      background: "var(--noir)", color: "var(--ivory)", padding: "110px 64px",
    }} className="section">
      <div style={{
        maxWidth: 1100, margin: "0 auto",
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72,
      }} className="ac-form-grid">
        <div>
          <Mono style={{ color: "var(--bronze)" }}>Inscripción</Mono>
          <h2 style={{
            fontFamily: "var(--display)", fontWeight: 400,
            fontSize: "clamp(34px, 4vw, 56px)", lineHeight: 1.05,
            margin: "20px 0 28px", letterSpacing: "-0.01em",
          }}>
            Déjanos tus datos<br /><em style={{ color: "var(--bronze)" }}>y te contamos.</em>
          </h2>
          <p style={{
            fontFamily: "var(--sans)", fontSize: 15, lineHeight: 1.7,
            opacity: 0.65, margin: "0 0 32px", maxWidth: 380,
          }}>
            Te escribimos por WhatsApp para resolver dudas, confirmar el cupo
            y coordinar el pago. Sin compromiso.
          </p>
          <a href={waUrl} target="_blank" rel="noopener noreferrer" style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            background: "#25D366", color: "#fff", textDecoration: "none",
            padding: "15px 26px", fontFamily: "var(--sans)", fontSize: 12,
            letterSpacing: "0.15em", textTransform: "uppercase",
          }}>
            Prefiero WhatsApp
          </a>
        </div>

        {status === AC_STATUS.sent ? (
          <div style={{
            border: "1px solid var(--bronze)", padding: "48px 40px",
            display: "flex", flexDirection: "column", justifyContent: "center", gap: 16,
          }}>
            <Mono style={{ color: "var(--bronze)" }}>Solicitud recibida</Mono>
            <p style={{ fontFamily: "var(--sans)", fontSize: 16, lineHeight: 1.7, margin: 0, opacity: 0.8 }}>
              Gracias, {form.name.split(" ")[0]}. Te contactamos al {form.phone} para
              darte los detalles del curso.
            </p>
            <a href={waUrl} target="_blank" rel="noopener noreferrer" style={{
              color: "var(--bronze)", fontFamily: "var(--sans)", fontSize: 13,
              letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 8,
            }}>Escribir ahora por WhatsApp →</a>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 20 }}>
            <AcField label="Nombre y apellido">
              <input required value={form.name} onChange={set("name")}
                maxLength={80} style={acInputStyle} />
            </AcField>
            <AcField label="Celular">
              <input required type="tel" inputMode="numeric" value={form.phone}
                onChange={set("phone")} maxLength={15} placeholder="300 000 0000"
                style={acInputStyle} />
            </AcField>
            <AcField label="Correo (opcional)">
              <input type="email" value={form.email} onChange={set("email")}
                maxLength={120} style={acInputStyle} />
            </AcField>
            {courses.length > 0 && (
              <AcField label="Curso de interés">
                <select value={courseId} onChange={e => onCourseChange(e.target.value)}
                  style={{ ...acInputStyle, appearance: "auto" }}>
                  <option value="">Todavía no lo tengo claro</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </AcField>
            )}
            <AcField label="Cuéntanos (opcional)">
              <textarea rows={4} value={form.message} onChange={set("message")}
                maxLength={600} style={{ ...acInputStyle, resize: "vertical" }} />
            </AcField>

            {error && (
              <div style={{
                border: "1px solid rgba(196,102,102,0.5)", color: "#e08a8a",
                padding: "12px 16px", fontFamily: "var(--sans)", fontSize: 14,
              }}>{error}</div>
            )}

            <button type="submit" disabled={status === AC_STATUS.sending} style={{
              background: "var(--bronze)", border: "none", color: "var(--noir)",
              padding: "18px 28px", fontFamily: "var(--sans)", fontSize: 12,
              letterSpacing: "0.2em", textTransform: "uppercase",
              cursor: status === AC_STATUS.sending ? "wait" : "pointer",
              opacity: status === AC_STATUS.sending ? 0.6 : 1,
            }}>
              {status === AC_STATUS.sending ? "Enviando…" : "Enviar solicitud"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
});

// ——————————————————————————————————————————————
// PREGUNTAS FRECUENTES
// ——————————————————————————————————————————————
const AcFaqItem = ({ item, open, onToggle }) => (
  <div style={{ borderTop: "1px solid rgba(20,18,18,0.12)" }}>
    <button onClick={onToggle} aria-expanded={open} style={{
      width: "100%", background: "transparent", border: "none", cursor: "pointer",
      padding: "26px 0", display: "flex", justifyContent: "space-between",
      alignItems: "center", gap: 24, textAlign: "left", color: "var(--noir)",
    }}>
      <span style={{ fontFamily: "var(--display)", fontSize: 22, letterSpacing: "-0.01em" }}>
        {item.q}
      </span>
      <span style={{
        color: "var(--bronze)", fontSize: 20, flexShrink: 0,
        transform: open ? "rotate(45deg)" : "none", transition: "transform 0.25s",
      }}>+</span>
    </button>
    {open && (
      <p style={{
        fontFamily: "var(--sans)", fontSize: 15, lineHeight: 1.7,
        opacity: 0.75, margin: "0 0 28px", maxWidth: 760,
      }}>{item.a}</p>
    )}
  </div>
);

const AcFaq = ({ items }) => {
  const [open, setOpen] = useState(null);
  if (!items?.length) return null;
  return (
    <section id="faq" style={{
      background: "var(--ivory)", color: "var(--noir)", padding: "110px 64px",
    }} className="section">
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <Mono style={{ color: "var(--bronze)" }}>Preguntas frecuentes</Mono>
        <div style={{ marginTop: 40 }}>
          {items.map((item, i) => (
            <AcFaqItem key={i} item={item} open={open === i}
              onToggle={() => setOpen(open === i ? null : i)} />
          ))}
          <div style={{ borderTop: "1px solid rgba(20,18,18,0.12)" }} />
        </div>
      </div>
    </section>
  );
};

// ——————————————————————————————————————————————
// ESTADOS SIN CONTENIDO
// ——————————————————————————————————————————————
const AcMessage = ({ title, body }) => (
  <section style={{
    background: "var(--noir)", color: "var(--ivory)", minHeight: "100vh",
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", gap: 20, padding: "120px 32px", textAlign: "center",
  }}>
    <Mono style={{ color: "var(--bronze)" }}>Academia JOXE</Mono>
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

// ——————————————————————————————————————————————
// PORTAL
// ——————————————————————————————————————————————
function AcademiaPortal() {
  const academy = useAcademy();
  const [scrolled, setScrolled] = useState(false);
  const [courseId, setCourseId] = useState("");
  const formRef = React.useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const goToEnroll = (id) => {
    if (id) setCourseId(id);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (academy === null) {
    return <AcMessage title="Cargando…" />;
  }
  if (!academy.enabled || !academy.content) {
    return (
      <AcMessage
        title="Las clases todavía no están publicadas"
        body="Estamos preparando el programa. Escríbenos por WhatsApp si quieres que te avisemos cuando abra el próximo grupo."
      />
    );
  }

  const content = academy.content;

  return (
    <div style={{ background: "var(--ivory)", minHeight: "100vh" }}>
      <Nav onReserveClick={() => { window.location.href = "/booking"; }}
        scrolled={scrolled} hasAcademy hrefPrefix="/" />
      <AcHero content={content} onEnroll={() => goToEnroll("")} />
      <AcIncludes items={content.includes} />
      <AcCourses courses={content.courses} onEnroll={goToEnroll} />
      <AcEnroll ref={formRef} content={content} courseId={courseId}
        onCourseChange={setCourseId} />
      <AcFaq items={content.faq} />
      <Footer hasAcademy />
      <WhatsAppBlob />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AcademiaPortal />);
