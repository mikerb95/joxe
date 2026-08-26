// JOXE ASESORES DE IMAGEN — Componentes
// Paleta: noir, ivory, bronze

const Placeholder = ({ label, ratio = "4/5", tone = "ivory", note }) => {
  const bg = tone === "noir" ? "#141212" : "#EDE6DA";
  const fg = tone === "noir" ? "rgba(230,220,200,0.55)" : "rgba(20,18,18,0.55)";
  const stripe = tone === "noir" ? "rgba(230,220,200,0.06)" : "rgba(20,18,18,0.05)";
  return (
    <div
      style={{
        aspectRatio: ratio,
        background: `repeating-linear-gradient(135deg, ${bg} 0 22px, ${stripe} 22px 23px)`,
        color: fg,
        position: "relative",
        overflow: "hidden",
        width: "100%",
      }}
    >
      <div style={{
        position: "absolute", inset: 0, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 8, padding: 24, textAlign: "center",
      }}>
        <span style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase",
          padding: "4px 10px", border: `1px solid ${fg}`, borderRadius: 999,
        }}>placeholder</span>
        <div style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 11, lineHeight: 1.5, maxWidth: 260, letterSpacing: "0.02em",
        }}>
          {label}
        </div>
        {note && <div style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 9, opacity: 0.7, marginTop: 4, letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}>{note}</div>}
      </div>
    </div>
  );
};

const Mono = ({ children, style }) => (
  <span style={{
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
    ...style,
  }}>{children}</span>
);

// ——————————————————————————————————————————————
// NAV
// ——————————————————————————————————————————————
// Un solo fetch de /api/reviews para toda la página: el nav también necesita
// saber si hay reseñas publicadas, para no enlazar a una sección que no se
// pinta cuando todavía no hay ninguna aprobada.
const useReviewsFeed = () => {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    fetch("/api/reviews")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => {});
  }, []);
  return data;
};

const Nav = ({ onReserveClick, scrolled, hasReviews }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        padding: "18px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: scrolled ? "rgba(12,12,12,0.85)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        transition: "background 0.4s, backdrop-filter 0.4s, padding 0.4s",
        color: "var(--ivory)",
      }}>
        <a href="#top" style={{
          fontFamily: "var(--display)", fontSize: 22, letterSpacing: "0.3em",
          color: "var(--ivory)", textDecoration: "none", fontWeight: 400,
        }}>
          JOXE
        </a>
        <div className="nav-links" style={{ display: "flex", gap: 36, alignItems: "center" }}>
          {[
            ["Servicios", "#servicios"],
            ["Galería", "#galeria"],
            ...(hasReviews ? [["Reseñas", "#resenas"]] : []),
            ["Ubicación", "#ubicacion"],
          ].map(([label, href]) => (
            <a key={href} href={href} style={{
              color: "var(--ivory)", textDecoration: "none",
              fontFamily: "var(--sans)", fontSize: 13, letterSpacing: "0.1em",
              opacity: 0.85,
            }}>{label}</a>
          ))}
          <a href="CheckIn.html" style={{
            color: "var(--bronze)", textDecoration: "none",
            fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.15em",
            textTransform: "uppercase", opacity: 0.9,
          }}>Check-In</a>
          <button onClick={onReserveClick} style={{
            border: "1px solid var(--bronze)", background: "transparent",
            color: "var(--bronze)", padding: "10px 22px",
            fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.2em",
            textTransform: "uppercase", cursor: "pointer",
            transition: "all 0.3s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bronze)"; e.currentTarget.style.color = "var(--noir)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--bronze)"; }}
          >
            Reservar
          </button>
        </div>
        <button className="nav-burger" onClick={() => setOpen(!open)}
          aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-expanded={open}
          style={{
            display: "none", background: "transparent", border: "none",
            color: "var(--ivory)", cursor: "pointer", padding: 8,
          }}>
          <div style={{ width: 22, height: 1, background: "var(--ivory)", marginBottom: 6 }} />
          <div style={{ width: 22, height: 1, background: "var(--ivory)" }} />
        </button>
      </nav>
      {open && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 49, background: "var(--noir)",
          padding: "90px 32px 32px", display: "flex", flexDirection: "column", gap: 28,
        }}>
          {[
            ["Servicios", "#servicios"],
            ["Galería", "#galeria"],
            ...(hasReviews ? [["Reseñas", "#resenas"]] : []),
            ["Ubicación", "#ubicacion"],
          ].map(([label, href]) => (
            <a key={href} href={href} onClick={() => setOpen(false)} style={{
              color: "var(--ivory)", textDecoration: "none",
              fontFamily: "var(--display)", fontSize: 34, letterSpacing: "0.02em",
            }}>{label}</a>
          ))}
          <a href="CheckIn.html" onClick={() => setOpen(false)} style={{
            color: "var(--bronze)", textDecoration: "none",
            fontFamily: "var(--sans)", fontSize: 15, letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}>Check-In →</a>
          <button onClick={() => { setOpen(false); onReserveClick(); }} style={{
            marginTop: 20, border: "1px solid var(--bronze)", background: "transparent",
            color: "var(--bronze)", padding: "16px 22px",
            fontFamily: "var(--sans)", fontSize: 13, letterSpacing: "0.2em",
            textTransform: "uppercase", cursor: "pointer", width: "fit-content",
          }}>
            Reservar cita
          </button>
        </div>
      )}
    </>
  );
};

// ——————————————————————————————————————————————
// HERO
// ——————————————————————————————————————————————
const Hero = ({ onReserveClick }) => (
  <section id="top" style={{
    minHeight: "100vh", background: "var(--noir)", color: "var(--ivory)",
    position: "relative", display: "grid",
    gridTemplateColumns: "1fr 1fr",
    alignItems: "stretch",
  }} className="hero-grid">
    <div style={{
      padding: "140px 64px 80px",
      display: "flex", flexDirection: "column", justifyContent: "center",
      gap: 32,
    }} className="hero-text">
      <Mono style={{ color: "var(--bronze)" }}>Soacha · San Mateo</Mono>
      <h1 style={{
        fontFamily: "var(--display)", fontWeight: 400,
        fontSize: "clamp(48px, 6vw, 92px)", lineHeight: 1.02,
        letterSpacing: "-0.01em", margin: 0,
      }}>
        La imagen<br />
        <em style={{ fontStyle: "italic", color: "var(--bronze)" }}>no se improvisa.</em><br />
        Se diseña.
      </h1>
      <p style={{
        fontFamily: "var(--sans)", fontSize: 17, lineHeight: 1.6,
        maxWidth: 440, opacity: 0.75, margin: 0,
      }}>
        Un espacio donde el corte, el color y la asesoría se trabajan
        con precisión. Atención personalizada, sin apuros, sin plantillas.
      </p>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={onReserveClick} style={{
          background: "var(--bronze)", border: "none", color: "var(--noir)",
          padding: "18px 32px", fontFamily: "var(--sans)",
          fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase",
          cursor: "pointer", fontWeight: 500,
        }}>
          Reservar cita →
        </button>
        <a href="#galeria" style={{
          color: "var(--ivory)", fontFamily: "var(--sans)", fontSize: 13,
          letterSpacing: "0.2em", textTransform: "uppercase",
          padding: "18px 8px", borderBottom: "1px solid rgba(245,241,234,0.3)",
          textDecoration: "none",
        }}>
          Ver trabajos
        </a>
      </div>
      <div style={{
        position: "absolute", bottom: 32, left: 64,
        display: "flex", alignItems: "center", gap: 12,
      }} className="hero-scroll">
        <div style={{ width: 40, height: 1, background: "var(--bronze)" }} />
        <Mono style={{ color: "var(--bronze)", fontSize: 10 }}>Desde 2018</Mono>
      </div>
    </div>
    <div style={{ position: "relative" }} className="hero-image">
      <Placeholder
        label={"FOTO HERO\nTransformación reciente — retrato vertical\nIluminación cálida, fondo neutro"}
        ratio="auto"
        tone="noir"
        note="1600×2000px · formato vertical"
      />
      <div style={{
        position: "absolute", bottom: 32, right: 32,
        padding: "14px 18px", background: "rgba(12,12,12,0.6)",
        backdropFilter: "blur(10px)", border: "1px solid rgba(194,158,102,0.3)",
      }}>
        <Mono style={{ color: "var(--bronze)", fontSize: 9, display: "block", marginBottom: 4 }}>
          Trabajo reciente
        </Mono>
        <div style={{
          fontFamily: "var(--sans)", fontSize: 12, color: "var(--ivory)",
          letterSpacing: "0.05em",
        }}>
          Color correction + corte · 3.5 hrs
        </div>
      </div>
    </div>
  </section>
);

// ——————————————————————————————————————————————
// MARQUEE
// ——————————————————————————————————————————————
const Marquee = () => {
  const items = ["Corte", "Color", "Balayage", "Keratina", "Asesoría de imagen", "Novias", "Extensiones", "Peinados"];
  return (
    <div style={{
      background: "var(--ivory)", color: "var(--noir)",
      padding: "28px 0", borderTop: "1px solid rgba(20,18,18,0.1)",
      borderBottom: "1px solid rgba(20,18,18,0.1)", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", gap: 64, whiteSpace: "nowrap",
        animation: "marquee 40s linear infinite",
      }}>
        {[...items, ...items, ...items].map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 64 }}>
            <span style={{
              fontFamily: "var(--display)", fontSize: 28,
              fontStyle: "italic", fontWeight: 400,
            }}>{item}</span>
            <span style={{ color: "var(--bronze)" }}>✦</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ——————————————————————————————————————————————
// SERVICIOS
// ——————————————————————————————————————————————
const formatPrice = (price, note) => {
  const formatted = "$" + Number(price).toLocaleString("es-CO");
  return note ? `${note} ${formatted}` : formatted;
};

const formatDur = (mins) => {
  if (!mins) return "";
  if (mins >= 60 && mins % 60 === 0) return `${mins / 60} hrs`;
  if (mins > 60) return `${(mins / 60).toFixed(1).replace(".0", "")} hrs`;
  return `${mins} min`;
};

const FALLBACK_SERVICES = [
  { id:"s1", name:"Corte mujer",        price:85000,  dur:60,  active:true },
  { id:"s2", name:"Corte hombre",       price:45000,  dur:40,  active:true },
  { id:"s3", name:"Balayage",           price:280000, dur:180, active:true, note:"desde" },
  { id:"s4", name:"Color correction",   price:320000, dur:240, active:true, note:"desde" },
  { id:"s5", name:"Color raíz",         price:120000, dur:90,  active:true },
  { id:"s6", name:"Keratina",           price:260000, dur:180, active:true, note:"desde" },
  { id:"s7", name:"Asesoría de imagen", price:180000, dur:90,  active:true },
  { id:"s8", name:"Peinado novia",      price:220000, dur:120, active:true, note:"desde" },
];

const Services = () => {
  const [services, setServices] = React.useState(FALLBACK_SERVICES);

  React.useEffect(() => {
    fetch("/api/catalog")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { if (data.services?.length) setServices(data.services); })
      .catch(() => {});
  }, []);

  return (
    <section id="servicios" style={{
      background: "var(--ivory)", color: "var(--noir)",
      padding: "120px 64px",
    }} className="section">
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 2fr", gap: 80,
        maxWidth: 1400, margin: "0 auto",
      }} className="services-grid">
        <div>
          <Mono style={{ color: "var(--bronze)" }}>01 — Servicios</Mono>
          <h2 style={{
            fontFamily: "var(--display)", fontWeight: 400,
            fontSize: "clamp(40px, 4.5vw, 64px)", lineHeight: 1.05,
            margin: "24px 0 32px", letterSpacing: "-0.01em",
          }}>
            Precios claros.<br />
            <em style={{ color: "var(--bronze)" }}>Sin sorpresas.</em>
          </h2>
          <p style={{
            fontFamily: "var(--sans)", fontSize: 15, lineHeight: 1.6,
            opacity: 0.7, maxWidth: 340, marginBottom: 40,
          }}>
            La consulta inicial siempre es gratis. Te contamos qué
            necesita tu cabello antes de tocarlo.
          </p>
          <p style={{
            fontFamily: "var(--sans)", fontSize: 13, lineHeight: 1.6,
            opacity: 0.5, maxWidth: 340,
          }}>
            Los precios pueden variar según largo, densidad y estado del cabello.
            Te confirmamos el valor exacto en la consulta.
          </p>
        </div>
        <div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {services.map((item, i) => (
              <div key={item.id || i} style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 32, padding: "28px 0",
                borderTop: i === 0 ? "1px solid rgba(20,18,18,0.15)" : "1px solid rgba(20,18,18,0.08)",
                alignItems: "baseline",
              }}>
                <div>
                  <h3 style={{
                    fontFamily: "var(--display)", fontWeight: 400,
                    fontSize: 28, margin: "0 0 10px", letterSpacing: "-0.01em",
                  }}>{item.name}</h3>
                  {item.dur > 0 && (
                    <Mono style={{ color: "var(--bronze)", fontSize: 10 }}>
                      {formatDur(item.dur)}
                    </Mono>
                  )}
                </div>
                <div style={{
                  fontFamily: "var(--sans)", fontSize: 20,
                  fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                  letterSpacing: "-0.01em",
                }}>{formatPrice(item.price, item.note)}</div>
              </div>
            ))}
            <div style={{ borderTop: "1px solid rgba(20,18,18,0.08)" }} />
          </div>
        </div>
      </div>
    </section>
  );
};

// ——————————————————————————————————————————————
// ANTES / DESPUÉS
// ——————————————————————————————————————————————
const BeforeAfter = () => {
  const [pos, setPos] = React.useState(50);
  return (
    <div style={{
      position: "relative", aspectRatio: "4/5", overflow: "hidden",
      userSelect: "none", cursor: "ew-resize", background: "var(--noir)",
    }}
    onMouseMove={(e) => {
      if (e.buttons !== 1) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const p = ((e.clientX - rect.left) / rect.width) * 100;
      setPos(Math.max(0, Math.min(100, p)));
    }}
    onTouchMove={(e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const p = ((e.touches[0].clientX - rect.left) / rect.width) * 100;
      setPos(Math.max(0, Math.min(100, p)));
    }}
    >
      <div style={{ position: "absolute", inset: 0 }}>
        <Placeholder label={"DESPUÉS\nFoto final del cliente"} ratio="auto" tone="noir" />
      </div>
      <div style={{
        position: "absolute", inset: 0, clipPath: `inset(0 ${100 - pos}% 0 0)`,
      }}>
        <Placeholder label={"ANTES\nFoto inicial del cliente"} ratio="auto" tone="ivory" />
      </div>
      <div style={{
        position: "absolute", top: 0, bottom: 0, left: `${pos}%`,
        width: 1, background: "var(--bronze)",
      }}>
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 44, height: 44, borderRadius: "50%",
          background: "var(--bronze)", display: "flex",
          alignItems: "center", justifyContent: "center",
          color: "var(--noir)", fontSize: 14,
        }}>
          ⇄
        </div>
      </div>
      <div style={{
        position: "absolute", top: 16, left: 16,
        padding: "4px 10px", background: "rgba(12,12,12,0.7)",
      }}>
        <Mono style={{ color: "var(--ivory)", fontSize: 9 }}>Antes</Mono>
      </div>
      <div style={{
        position: "absolute", top: 16, right: 16,
        padding: "4px 10px", background: "rgba(194,158,102,0.9)",
      }}>
        <Mono style={{ color: "var(--noir)", fontSize: 9 }}>Después</Mono>
      </div>
    </div>
  );
};

// ——————————————————————————————————————————————
// GALERÍA
// ——————————————————————————————————————————————
const Gallery = () => {
  const [idx, setIdx] = React.useState(0);
  const cases = [
    { title: "Balayage miel sobre base oscura", meta: "Color correction · 4 hrs" },
    { title: "Corte bob francés", meta: "Corte + styling · 90 min" },
    { title: "Recuperación post-decoloración", meta: "Tratamiento + color · 3.5 hrs" },
    { title: "Rubio platino", meta: "Decoloración + matiz · 5 hrs" },
  ];
  return (
    <section id="galeria" style={{
      background: "var(--noir)", color: "var(--ivory)",
      padding: "120px 64px",
    }} className="section">
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          marginBottom: 64, flexWrap: "wrap", gap: 24,
        }}>
          <div>
            <Mono style={{ color: "var(--bronze)" }}>02 — Trabajos reales</Mono>
            <h2 style={{
              fontFamily: "var(--display)", fontWeight: 400,
              fontSize: "clamp(40px, 4.5vw, 64px)", lineHeight: 1.05,
              margin: "24px 0 0", letterSpacing: "-0.01em",
            }}>
              El resultado habla.<br />
              <em style={{ color: "var(--bronze)" }}>Arrastra para ver.</em>
            </h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setIdx((idx - 1 + cases.length) % cases.length)}
              className="gallery-btn">←</button>
            <button onClick={() => setIdx((idx + 1) % cases.length)}
              className="gallery-btn">→</button>
          </div>
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 48,
          alignItems: "center",
        }} className="gallery-grid">
          <BeforeAfter key={idx} />
          <div>
            <Mono style={{ color: "var(--bronze)", fontSize: 10 }}>
              Caso {String(idx + 1).padStart(2, "0")} / {String(cases.length).padStart(2, "0")}
            </Mono>
            <h3 style={{
              fontFamily: "var(--display)", fontWeight: 400,
              fontSize: "clamp(28px, 3vw, 40px)", lineHeight: 1.15,
              margin: "20px 0", letterSpacing: "-0.005em",
            }}>{cases[idx].title}</h3>
            <p style={{
              fontFamily: "var(--sans)", fontSize: 15, lineHeight: 1.6,
              opacity: 0.7, margin: "0 0 32px", maxWidth: 420,
            }}>
              Cada trabajo parte de un diagnóstico honesto del cabello.
              Nunca prometemos lo que no podemos sostener.
            </p>
            <div style={{
              display: "flex", gap: 40, paddingTop: 24,
              borderTop: "1px solid rgba(245,241,234,0.15)",
            }}>
              <div>
                <Mono style={{ color: "var(--bronze)", fontSize: 9, display: "block", marginBottom: 6 }}>
                  Servicio
                </Mono>
                <div style={{ fontFamily: "var(--sans)", fontSize: 14 }}>
                  {cases[idx].meta}
                </div>
              </div>
              <div>
                <Mono style={{ color: "var(--bronze)", fontSize: 9, display: "block", marginBottom: 6 }}>
                  Estilista
                </Mono>
                <div style={{ fontFamily: "var(--sans)", fontSize: 14 }}>
                  Joxe
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{
          display: "flex", gap: 8, marginTop: 48, justifyContent: "center",
        }}>
          {cases.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)} style={{
              width: i === idx ? 32 : 8, height: 2,
              background: i === idx ? "var(--bronze)" : "rgba(245,241,234,0.25)",
              border: "none", cursor: "pointer", transition: "all 0.3s",
              padding: 0,
            }} />
          ))}
        </div>
      </div>
    </section>
  );
};

// ——————————————————————————————————————————————
// TESTIMONIOS
// ——————————————————————————————————————————————


// ——————————————————————————————————————————————
// RESEÑAS
// Alimentadas por /api/reviews. Solo llegan aquí las que el salón aprobó
// desde el panel, y solo puede escribirlas quien tuvo una cita completada.
// Si todavía no hay ninguna aprobada, la sección no se pinta.
// ——————————————————————————————————————————————
const StarRow = ({ value, size = 15, color = "var(--bronze)" }) => (
  <div style={{ display: "inline-flex", gap: 2 }} aria-label={`${value} de 5 estrellas`}>
    {[1, 2, 3, 4, 5].map(n => (
      <svg key={n} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
        fill={n <= value ? color : "none"} stroke={color}
        strokeWidth="1.2" opacity={n <= value ? 1 : 0.3}>
        <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.45l-5.81 3.05 1.11-6.47-4.7-4.58 6.5-.95z" />
      </svg>
    ))}
  </div>
);

const reviewDate = (ms) => {
  try {
    return new Date(ms).toLocaleDateString("es-CO", {
      day: "numeric", month: "long", year: "numeric",
    });
  } catch { return ""; }
};

const ReviewCard = ({ r }) => (
  <article style={{
    background: "rgba(20,18,18,0.035)",
    padding: "28px 26px",
    display: "flex", flexDirection: "column", gap: 14,
  }}>
    <StarRow value={r.rating} />
    {r.text && (
      <p style={{
        fontFamily: "var(--display)", fontSize: 19, lineHeight: 1.55,
        margin: 0, letterSpacing: "-0.01em",
      }}>
        {r.text}
      </p>
    )}
    {r.reply?.text && (
      <div style={{
        marginTop: 2, paddingTop: 14,
        borderTop: "1px solid rgba(20,18,18,0.1)",
      }}>
        <Mono style={{ fontSize: 9, color: "var(--bronze)" }}>Respuesta de JOXE</Mono>
        <p style={{
          fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.6,
          margin: "8px 0 0", opacity: 0.7,
        }}>{r.reply.text}</p>
      </div>
    )}
    <div style={{
      paddingTop: 8,
      display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap",
    }}>
      <span style={{
        fontFamily: "var(--sans)", fontSize: 14, letterSpacing: "0.04em",
      }}>{r.name}</span>
      <span style={{ fontFamily: "var(--sans)", fontSize: 12, opacity: 0.45 }}>
        {[r.service, reviewDate(r.createdAt)].filter(Boolean).join(" · ")}
      </span>
    </div>
  </article>
);

const Reviews = ({ data }) => {
  const [showAll, setShowAll] = React.useState(false);

  if (!data || !data.count) return null;

  const visible = showAll ? data.reviews : data.reviews.slice(0, 6);

  return (
    <section id="resenas" style={{
      background: "var(--ivory)", color: "var(--noir)",
      padding: "120px 64px",
    }} className="section">
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          marginBottom: 64, flexWrap: "wrap", gap: 32,
        }}>
          <div>
            <Mono style={{ color: "var(--bronze)" }}>03 — Reseñas</Mono>
            <h2 style={{
              fontFamily: "var(--display)", fontWeight: 400,
              fontSize: "clamp(36px, 4vw, 58px)", lineHeight: 1.05,
              margin: "24px 0 0", letterSpacing: "-0.01em",
            }}>
              Lo que dicen<br />
              <em style={{ color: "var(--bronze)" }}>quienes ya vinieron.</em>
            </h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{
              fontFamily: "var(--display)", fontSize: 64, lineHeight: 1,
              letterSpacing: "-0.02em",
            }}>
              {data.avg.toLocaleString("es-CO", { minimumFractionDigits: 1 })}
            </div>
            <div>
              <StarRow value={Math.round(data.avg)} size={17} />
              <div style={{
                fontFamily: "var(--sans)", fontSize: 13, opacity: 0.5, marginTop: 8,
              }}>
                {data.count} {data.count === 1 ? "reseña" : "reseñas"} verificadas
              </div>
            </div>
          </div>
        </div>

        <div className="reviews-grid" style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24,
          alignItems: "start",
        }}>
          {visible.map(r => <ReviewCard key={r.id} r={r} />)}
        </div>

        {data.reviews.length > 6 && !showAll && (
          <button onClick={() => setShowAll(true)} style={{
            marginTop: 40, background: "transparent",
            border: "1px solid rgba(20,18,18,0.25)", color: "var(--noir)",
            padding: "15px 32px", cursor: "pointer",
            fontFamily: "var(--sans)", fontSize: 12,
            letterSpacing: "0.2em", textTransform: "uppercase",
          }}>
            Ver las {data.reviews.length} reseñas
          </button>
        )}

        <p style={{
          marginTop: 40, fontFamily: "var(--sans)", fontSize: 12,
          opacity: 0.45, lineHeight: 1.6, maxWidth: 520,
        }}>
          Solo puede dejar reseña quien tuvo una cita atendida en el salón.
          Te enviamos el enlace por WhatsApp después de tu visita, y también
          lo encuentras en tu cuenta.
        </p>
      </div>
    </section>
  );
};

// ——————————————————————————————————————————————
// MAPA DE UBICACIÓN
// ——————————————————————————————————————————————
const LocationMap = () => (
  <section id="ubicacion" style={{ background: "var(--ivory)", color: "var(--noir)" }}>
    <div style={{
      maxWidth: 1400, margin: "0 auto",
      padding: "80px 64px 40px",
      display: "flex", justifyContent: "space-between",
      alignItems: "flex-end", flexWrap: "wrap", gap: 24,
    }}>
      <div>
        <Mono style={{ color: "var(--bronze)" }}>06 — Ubicación</Mono>
        <h2 style={{
          fontFamily: "var(--display)", fontWeight: 400,
          fontSize: "clamp(32px, 3.5vw, 52px)", lineHeight: 1.05,
          margin: "20px 0 0", letterSpacing: "-0.01em",
        }}>
          Nos encontrarás<br />
          <em style={{ color: "var(--bronze)" }}>en San Mateo, Soacha.</em>
        </h2>
      </div>
      <a
        href="https://www.google.com/maps/place/Joxe+Asesores+De+Imagen/@4.5808563,-74.2037333,17.61z/"
        target="_blank" rel="noopener noreferrer"
        style={{
          display: "inline-flex", alignItems: "center", gap: 10,
          color: "var(--noir)", textDecoration: "none",
          fontFamily: "var(--sans)", fontSize: 13, letterSpacing: "0.15em",
          textTransform: "uppercase", padding: "14px 0",
          borderBottom: "1px solid var(--noir)",
        }}
      >
        Abrir en Google Maps ↗
      </a>
    </div>
    <div style={{ width: "100%", height: "480px", position: "relative" }}>
      <iframe
        src="https://maps.google.com/maps?q=4.5808563,-74.2037333&hl=es&z=17&output=embed"
        width="100%" height="100%"
        style={{ border: 0, display: "block", filter: "grayscale(20%) contrast(1.05)" }}
        allowFullScreen=""
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title="Ubicación JOXE Asesores de Imagen"
      />
    </div>
  </section>
);

// ——————————————————————————————————————————————
// FOOTER
// ——————————————————————————————————————————————
const Footer = () => (
  <footer style={{
    background: "var(--noir)", color: "var(--ivory)",
    padding: "80px 64px 32px", borderTop: "1px solid rgba(245,241,234,0.1)",
  }} className="section">
    <div style={{
      maxWidth: 1400, margin: "0 auto",
      display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 48,
    }} className="footer-grid">
      <div>
        <div style={{
          fontFamily: "var(--display)", fontSize: 36, letterSpacing: "0.2em",
          marginBottom: 20,
        }}>JOXE</div>
        <p style={{
          fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.6,
          opacity: 0.6, maxWidth: 320, margin: 0,
        }}>
          Asesores de imagen · Soacha, San Mateo.<br />
          Estudio de belleza con enfoque personalizado.
        </p>
      </div>
      <div>
        <Mono style={{ color: "var(--bronze)", display: "block", marginBottom: 18 }}>Navegación</Mono>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[["Servicios", "#servicios"], ["Galería", "#galeria"]].map(([l, h]) => (
            <a key={h} href={h} style={{
              color: "var(--ivory)", textDecoration: "none",
              fontFamily: "var(--sans)", fontSize: 14, opacity: 0.75,
            }}>{l}</a>
          ))}
        </div>
      </div>
      <div>
        <Mono style={{ color: "var(--bronze)", display: "block", marginBottom: 18 }}>Contacto</Mono>
        <div style={{ display: "flex", flexDirection: "column", gap: 10,
          fontFamily: "var(--sans)", fontSize: 14, opacity: 0.75 }}>
          <span>+57 312 449 9862</span>
          <span>hola@joxe.co</span>
          <span>San Mateo, Soacha</span>
        </div>
      </div>
      <div>
        <Mono style={{ color: "var(--bronze)", display: "block", marginBottom: 18 }}>Social</Mono>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            ["Instagram", "#"],
            ["TikTok", "#"],
            ["WhatsApp", "https://wa.me/573124499862"],
          ].map(([s, href]) => (
            <a key={s} href={href} target="_blank" rel="noopener noreferrer" style={{
              color: "var(--ivory)", textDecoration: "none",
              fontFamily: "var(--sans)", fontSize: 14, opacity: 0.75,
            }}>{s} ↗</a>
          ))}
        </div>
      </div>
    </div>
    <div style={{
      maxWidth: 1400, margin: "80px auto 0", paddingTop: 24,
      borderTop: "1px solid rgba(245,241,234,0.1)",
      display: "flex", justifyContent: "space-between",
      fontFamily: "var(--sans)", fontSize: 12, opacity: 0.5, flexWrap: "wrap", gap: 12,
    }} className="footer-bottom">
      <span>© 2026 JOXE Asesores de Imagen</span>
      <span>Diseño · in situ</span>
    </div>
  </footer>
);

// ——————————————————————————————————————————————
// WHATSAPP BLOB
// ——————————————————————————————————————————————
const WA_DEFAULT_NUMBER   = "573124499862";
const WA_DEFAULT_MSG      = "Escríbenos";
const WA_DEFAULT_CHAT_MSG = "";

const getWAConfig = () => {
  try {
    const stored = JSON.parse(localStorage.getItem("joxe_admin_v1") || "{}");
    return {
      number:  stored.whatsappNumber  || WA_DEFAULT_NUMBER,
      msg:     stored.whatsappMsg     || WA_DEFAULT_MSG,
      chatMsg: stored.whatsappChatMsg ?? WA_DEFAULT_CHAT_MSG,
    };
  } catch { return { number: WA_DEFAULT_NUMBER, msg: WA_DEFAULT_MSG, chatMsg: WA_DEFAULT_CHAT_MSG }; }
};

const WhatsAppBlob = () => {
  const [hovered, setHovered] = React.useState(false);
  const cfg = getWAConfig();
  const url = cfg.chatMsg
    ? `https://wa.me/${cfg.number}?text=${encodeURIComponent(cfg.chatMsg)}`
    : `https://wa.me/${cfg.number}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
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
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      {hovered && (
        <span style={{
          fontFamily: "'Outfit', sans-serif", fontSize: 14,
          fontWeight: 500, letterSpacing: "0.03em",
        }}>
          {cfg.msg}
        </span>
      )}
    </a>
  );
};

Object.assign(window, {
  Nav, Hero, Marquee, Services, Gallery,
  LocationMap, Footer, Placeholder, Mono,
  WhatsAppBlob,
});
