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
const Nav = ({ onReserveClick, scrolled }) => {
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
            ["Filosofía", "#filosofia"],
            ["Contacto", "#contacto"],
          ].map(([label, href]) => (
            <a key={href} href={href} style={{
              color: "var(--ivory)", textDecoration: "none",
              fontFamily: "var(--sans)", fontSize: 13, letterSpacing: "0.1em",
              opacity: 0.85,
            }}>{label}</a>
          ))}
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
        <button className="nav-burger" onClick={() => setOpen(!open)} style={{
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
            ["Filosofía", "#filosofia"],
            ["Contacto", "#contacto"],
          ].map(([label, href]) => (
            <a key={href} href={href} onClick={() => setOpen(false)} style={{
              color: "var(--ivory)", textDecoration: "none",
              fontFamily: "var(--display)", fontSize: 34, letterSpacing: "0.02em",
            }}>{label}</a>
          ))}
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
const servicesData = [
  {
    cat: "Corte",
    items: [
      { name: "Corte mujer", desc: "Diagnóstico capilar + corte personalizado + styling.", price: "$85.000", dur: "60 min" },
      { name: "Corte hombre", desc: "Corte de precisión con tijera y máquina. Lavado incluido.", price: "$45.000", dur: "40 min" },
      { name: "Corte niños", desc: "Menores de 10 años. Paciencia garantizada.", price: "$35.000", dur: "30 min" },
    ],
  },
  {
    cat: "Color",
    items: [
      { name: "Balayage", desc: "Técnica de iluminación a mano alzada. Resultado natural y luminoso.", price: "desde $280.000", dur: "3 hrs" },
      { name: "Color correction", desc: "Recuperación de color dañado o no deseado. Consulta previa.", price: "desde $320.000", dur: "4 hrs" },
      { name: "Color raíz", desc: "Retoque de raíz con color uniforme. Tratamiento incluido.", price: "$120.000", dur: "90 min" },
      { name: "Mechas", desc: "Mechas clásicas con papel aluminio. Matización incluida.", price: "desde $220.000", dur: "2.5 hrs" },
    ],
  },
  {
    cat: "Tratamiento",
    items: [
      { name: "Keratina", desc: "Alisado progresivo con keratina brasilera. Sin formol.", price: "desde $260.000", dur: "3 hrs" },
      { name: "Botox capilar", desc: "Hidratación profunda. Cabello sedoso por 6 semanas.", price: "$140.000", dur: "90 min" },
      { name: "Hidratación premium", desc: "Mascarilla + masaje craneal + secado.", price: "$75.000", dur: "60 min" },
    ],
  },
  {
    cat: "Asesoría",
    items: [
      { name: "Asesoría de imagen", desc: "Análisis de rostro, colorimetría y estilo. Incluye guía impresa.", price: "$180.000", dur: "90 min" },
      { name: "Novias · paquete", desc: "Prueba + día del evento. Maquillaje y peinado.", price: "desde $450.000", dur: "día completo" },
    ],
  },
];

const Services = () => {
  const [active, setActive] = React.useState("Corte");
  const current = servicesData.find(s => s.cat === active);
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
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {servicesData.map(s => (
              <button key={s.cat} onClick={() => setActive(s.cat)} style={{
                textAlign: "left", padding: "18px 0",
                background: "transparent", border: "none",
                borderTop: "1px solid rgba(20,18,18,0.1)",
                fontFamily: "var(--sans)", fontSize: 15,
                color: active === s.cat ? "var(--noir)" : "rgba(20,18,18,0.5)",
                cursor: "pointer", letterSpacing: "0.02em",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                transition: "color 0.25s",
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                    color: "var(--bronze)",
                  }}>0{servicesData.indexOf(s) + 1}</span>
                  {s.cat}
                </span>
                <span style={{ fontSize: 18, opacity: active === s.cat ? 1 : 0.3 }}>
                  {active === s.cat ? "—" : "+"}
                </span>
              </button>
            ))}
            <div style={{ borderTop: "1px solid rgba(20,18,18,0.1)" }} />
          </div>
        </div>
        <div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {current.items.map((item, i) => (
              <div key={i} style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 32, padding: "28px 0",
                borderTop: i === 0 ? "1px solid rgba(20,18,18,0.15)" : "1px solid rgba(20,18,18,0.08)",
                alignItems: "baseline",
              }}>
                <div>
                  <h3 style={{
                    fontFamily: "var(--display)", fontWeight: 400,
                    fontSize: 28, margin: "0 0 8px", letterSpacing: "-0.01em",
                  }}>{item.name}</h3>
                  <p style={{
                    fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.5,
                    opacity: 0.65, margin: "0 0 10px", maxWidth: 440,
                  }}>{item.desc}</p>
                  <Mono style={{ color: "var(--bronze)", fontSize: 10 }}>
                    {item.dur}
                  </Mono>
                </div>
                <div style={{
                  fontFamily: "var(--sans)", fontSize: 20,
                  fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                  letterSpacing: "-0.01em",
                }}>{item.price}</div>
              </div>
            ))}
            <div style={{ borderTop: "1px solid rgba(20,18,18,0.08)" }} />
          </div>
          <p style={{
            fontFamily: "var(--sans)", fontSize: 12, lineHeight: 1.6,
            opacity: 0.5, marginTop: 32, letterSpacing: "0.02em",
          }}>
            Los precios pueden variar según largo, densidad y estado del cabello.
            Te confirmamos el valor exacto en la consulta.
          </p>
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
                  Joxe G.
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
const testimonials = [
  {
    quote: "Entré con el pelo destruido después de una mala decoloración. Salí con el color que había visto solo en Pinterest. Joxe no me vendió humo, me dijo qué se podía hacer y qué no.",
    name: "Valentina M.",
    service: "Color correction",
  },
  {
    quote: "Llevo tres años yendo. Nunca me he sentido apurada, nunca me han cambiado de estilista sin avisar. Eso en Soacha es difícil de encontrar.",
    name: "Carolina R.",
    service: "Clienta frecuente",
  },
  {
    quote: "Me hicieron el peinado para mi matrimonio. Prueba dos semanas antes, el día llegaron puntuales al lugar. Cero estrés.",
    name: "Daniela P.",
    service: "Novias",
  },
  {
    quote: "La primera vez que alguien me pregunta qué quiero y me escucha de verdad. Vale cada peso.",
    name: "Andrés L.",
    service: "Corte hombre + asesoría",
  },
];

const Testimonials = () => {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % testimonials.length), 6000);
    return () => clearInterval(t);
  }, []);
  const t = testimonials[idx];
  return (
    <section style={{
      background: "var(--ivory)", color: "var(--noir)",
      padding: "140px 64px", position: "relative",
    }} className="section">
      <div style={{
        maxWidth: 1100, margin: "0 auto", textAlign: "center",
      }}>
        <Mono style={{ color: "var(--bronze)" }}>03 — Testimonios</Mono>
        <div style={{
          fontFamily: "var(--display)", fontSize: 120, lineHeight: 0.5,
          color: "var(--bronze)", opacity: 0.4, marginTop: 40, height: 40,
        }}>"</div>
        <blockquote key={idx} style={{
          fontFamily: "var(--display)", fontWeight: 400,
          fontSize: "clamp(24px, 2.6vw, 36px)", lineHeight: 1.35,
          margin: "0 auto 40px", maxWidth: 880, letterSpacing: "-0.005em",
          animation: "fadeIn 0.6s ease",
        }}>
          {t.quote}
        </blockquote>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 16,
          paddingTop: 24, borderTop: "1px solid rgba(20,18,18,0.15)",
        }}>
          <div style={{ fontFamily: "var(--sans)", fontSize: 14, letterSpacing: "0.05em" }}>
            {t.name}
          </div>
          <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--bronze)" }} />
          <Mono style={{ color: "var(--bronze)", fontSize: 10 }}>{t.service}</Mono>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 48, justifyContent: "center" }}>
          {testimonials.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)} style={{
              width: i === idx ? 32 : 8, height: 2,
              background: i === idx ? "var(--bronze)" : "rgba(20,18,18,0.2)",
              border: "none", cursor: "pointer", transition: "all 0.3s", padding: 0,
            }} />
          ))}
        </div>
      </div>
    </section>
  );
};

// ——————————————————————————————————————————————
// FILOSOFÍA / EXPERIENCIA
// ——————————————————————————————————————————————
const Philosophy = () => (
  <section id="filosofia" style={{
    background: "var(--noir)", color: "var(--ivory)",
    padding: "120px 64px",
  }} className="section">
    <div style={{
      maxWidth: 1400, margin: "0 auto",
      display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 80,
      alignItems: "center",
    }} className="philo-grid">
      <div style={{ aspectRatio: "4/5" }}>
        <Placeholder
          label={"RETRATO\nFoto del estilista principal\no equipo trabajando"}
          ratio="auto"
          tone="noir"
          note="1200×1500px"
        />
      </div>
      <div>
        <Mono style={{ color: "var(--bronze)" }}>04 — Filosofía</Mono>
        <h2 style={{
          fontFamily: "var(--display)", fontWeight: 400,
          fontSize: "clamp(40px, 4.5vw, 64px)", lineHeight: 1.05,
          margin: "24px 0 40px", letterSpacing: "-0.01em",
        }}>
          Ocho años<br />
          <em style={{ color: "var(--bronze)" }}>aprendiendo a escuchar</em><br />
          antes de cortar.
        </h2>
        <p style={{
          fontFamily: "var(--sans)", fontSize: 17, lineHeight: 1.65,
          opacity: 0.8, marginBottom: 24, maxWidth: 520,
        }}>
          JOXE no es una cadena. Somos un estudio pequeño en San Mateo
          donde cada cita tiene tiempo propio. No atendemos en paralelo,
          no tenemos agenda apretada, no te recibimos si el horario
          no alcanza.
        </p>
        <p style={{
          fontFamily: "var(--sans)", fontSize: 17, lineHeight: 1.65,
          opacity: 0.8, marginBottom: 48, maxWidth: 520,
        }}>
          Formación continua en Bogotá y certificaciones en color y
          tricología. Porque el cabello colombiano tiene su propia química
          y merece manos que la entiendan.
        </p>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32,
          paddingTop: 40, borderTop: "1px solid rgba(245,241,234,0.15)",
        }} className="philo-stats">
          {[
            ["+2.400", "Clientes atendidos"],
            ["8 años", "De experiencia"],
            ["94%", "Vuelven a agendar"],
          ].map(([n, l]) => (
            <div key={l}>
              <div style={{
                fontFamily: "var(--display)", fontSize: 40, fontWeight: 400,
                color: "var(--bronze)", letterSpacing: "-0.02em", marginBottom: 8,
              }}>{n}</div>
              <Mono style={{ color: "rgba(245,241,234,0.6)", fontSize: 10 }}>{l}</Mono>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

// ——————————————————————————————————————————————
// RESERVA (MODAL + SECCIÓN)
// ——————————————————————————————————————————————
const BookingSection = ({ onReserveClick }) => (
  <section id="contacto" style={{
    background: "var(--ivory)", color: "var(--noir)",
    padding: "140px 64px",
  }} className="section">
    <div style={{
      maxWidth: 1400, margin: "0 auto",
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64,
    }} className="booking-grid">
      <div>
        <Mono style={{ color: "var(--bronze)" }}>05 — Reserva</Mono>
        <h2 style={{
          fontFamily: "var(--display)", fontWeight: 400,
          fontSize: "clamp(48px, 5.5vw, 80px)", lineHeight: 1.02,
          margin: "24px 0 32px", letterSpacing: "-0.015em",
        }}>
          Agenda.<br />
          <em style={{ color: "var(--bronze)" }}>Llega.</em><br />
          Confía.
        </h2>
        <p style={{
          fontFamily: "var(--sans)", fontSize: 17, lineHeight: 1.6,
          opacity: 0.75, maxWidth: 440, marginBottom: 40,
        }}>
          Reserva en línea en menos de un minuto. Si prefieres hablar
          primero, escríbenos por WhatsApp — respondemos en menos de 30 minutos
          en horario laboral.
        </p>
        <button onClick={onReserveClick} style={{
          background: "var(--noir)", color: "var(--ivory)", border: "none",
          padding: "20px 32px", fontFamily: "var(--sans)",
          fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase",
          cursor: "pointer", marginBottom: 16, display: "block", width: "fit-content",
        }}>
          Reservar en línea →
        </button>
        <a href="https://wa.me/573001234567" target="_blank" rel="noopener" style={{
          display: "inline-flex", gap: 10, alignItems: "center",
          color: "var(--noir)", textDecoration: "none",
          fontFamily: "var(--sans)", fontSize: 14, letterSpacing: "0.05em",
          padding: "12px 0", borderBottom: "1px solid var(--noir)",
        }}>
          WhatsApp · +57 300 123 4567
        </a>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        <div style={{ padding: "32px 0", borderTop: "1px solid rgba(20,18,18,0.15)" }}>
          <Mono style={{ color: "var(--bronze)", fontSize: 10 }}>Ubicación</Mono>
          <h3 style={{
            fontFamily: "var(--display)", fontSize: 24, fontWeight: 400,
            margin: "14px 0 8px",
          }}>San Mateo, Soacha</h3>
          <p style={{
            fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.6,
            opacity: 0.7, margin: 0,
          }}>
            Dirección exacta al confirmar tu cita · Parqueadero incluido
          </p>
        </div>

        <div style={{ padding: "32px 0", borderTop: "1px solid rgba(20,18,18,0.15)" }}>
          <Mono style={{ color: "var(--bronze)", fontSize: 10 }}>Horario</Mono>
          <div style={{
            marginTop: 14, display: "flex", flexDirection: "column", gap: 6,
          }}>
            {[
              ["Mar — Vie", "9:00 — 19:00"],
              ["Sábado", "8:00 — 18:00"],
              ["Dom — Lun", "Cerrado"],
            ].map(([d, h]) => (
              <div key={d} style={{
                display: "flex", justifyContent: "space-between",
                fontFamily: "var(--sans)", fontSize: 15,
              }}>
                <span>{d}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.7 }}>{h}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          padding: "24px", background: "var(--noir)", color: "var(--ivory)",
        }}>
          <Mono style={{ color: "var(--bronze)", fontSize: 10 }}>Antes de venir</Mono>
          <p style={{
            fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.6,
            opacity: 0.85, margin: "12px 0 0",
          }}>
            Llega con el cabello en su estado habitual — no necesitamos
            que lo laves antes. Si es color correction, envíanos fotos
            previas por WhatsApp.
          </p>
        </div>
      </div>
    </div>
  </section>
);

const BookingModal = ({ open, onClose }) => {
  const [step, setStep] = React.useState(1);
  const [data, setData] = React.useState({ service: "", date: "", time: "", name: "", phone: "" });
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    if (open) { setStep(1); setDone(false); setData({ service: "", date: "", time: "", name: "", phone: "" }); }
  }, [open]);

  if (!open) return null;

  const services = [
    "Corte mujer", "Corte hombre", "Balayage", "Color correction",
    "Color raíz", "Keratina", "Asesoría de imagen", "Otro",
  ];
  const times = ["9:00", "10:30", "12:00", "14:00", "15:30", "17:00"];

  const canNext = (step === 1 && data.service) || (step === 2 && data.date && data.time) || (step === 3 && data.name && data.phone);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(12,12,12,0.85)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, animation: "fadeIn 0.3s ease",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--ivory)", color: "var(--noir)",
        maxWidth: 640, width: "100%", maxHeight: "90vh", overflow: "auto",
        position: "relative",
      }}>
        <button onClick={onClose} style={{
          position: "absolute", top: 20, right: 20, background: "transparent",
          border: "none", fontSize: 18, cursor: "pointer", width: 32, height: 32,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--noir)",
        }}>✕</button>

        <div style={{ padding: "48px 48px 36px" }}>
          {!done ? (
            <>
              <Mono style={{ color: "var(--bronze)" }}>Paso {step} de 3</Mono>
              <h3 style={{
                fontFamily: "var(--display)", fontSize: 36, fontWeight: 400,
                margin: "16px 0 32px", letterSpacing: "-0.01em",
              }}>
                {step === 1 && "¿Qué servicio?"}
                {step === 2 && "Elige fecha y hora"}
                {step === 3 && "Un último paso"}
              </h3>

              {step === 1 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {services.map(s => (
                    <button key={s} onClick={() => setData({ ...data, service: s })} style={{
                      padding: "18px 20px", textAlign: "left",
                      background: data.service === s ? "var(--noir)" : "transparent",
                      color: data.service === s ? "var(--ivory)" : "var(--noir)",
                      border: `1px solid ${data.service === s ? "var(--noir)" : "rgba(20,18,18,0.2)"}`,
                      fontFamily: "var(--sans)", fontSize: 14, cursor: "pointer",
                      transition: "all 0.2s",
                    }}>{s}</button>
                  ))}
                </div>
              )}

              {step === 2 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  <div>
                    <Mono style={{ display: "block", marginBottom: 10, fontSize: 10 }}>Fecha</Mono>
                    <input type="date" value={data.date}
                      onChange={e => setData({ ...data, date: e.target.value })}
                      style={{
                        width: "100%", padding: "16px", border: "1px solid rgba(20,18,18,0.2)",
                        fontFamily: "var(--sans)", fontSize: 15, background: "transparent",
                        color: "var(--noir)",
                      }} />
                  </div>
                  <div>
                    <Mono style={{ display: "block", marginBottom: 10, fontSize: 10 }}>Hora disponible</Mono>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                      {times.map(t => (
                        <button key={t} onClick={() => setData({ ...data, time: t })} style={{
                          padding: "14px", background: data.time === t ? "var(--noir)" : "transparent",
                          color: data.time === t ? "var(--ivory)" : "var(--noir)",
                          border: `1px solid ${data.time === t ? "var(--noir)" : "rgba(20,18,18,0.2)"}`,
                          fontFamily: "var(--sans)", fontSize: 14, cursor: "pointer",
                          fontVariantNumeric: "tabular-nums",
                        }}>{t}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <div>
                    <Mono style={{ display: "block", marginBottom: 10, fontSize: 10 }}>Nombre</Mono>
                    <input type="text" value={data.name} placeholder="María Pérez"
                      onChange={e => setData({ ...data, name: e.target.value })}
                      style={{
                        width: "100%", padding: "16px", border: "1px solid rgba(20,18,18,0.2)",
                        fontFamily: "var(--sans)", fontSize: 15, background: "transparent",
                        color: "var(--noir)",
                      }} />
                  </div>
                  <div>
                    <Mono style={{ display: "block", marginBottom: 10, fontSize: 10 }}>WhatsApp</Mono>
                    <input type="tel" value={data.phone} placeholder="300 123 4567"
                      onChange={e => setData({ ...data, phone: e.target.value })}
                      style={{
                        width: "100%", padding: "16px", border: "1px solid rgba(20,18,18,0.2)",
                        fontFamily: "var(--sans)", fontSize: 15, background: "transparent",
                        color: "var(--noir)",
                      }} />
                  </div>
                  <div style={{
                    padding: 16, background: "rgba(194,158,102,0.12)",
                    borderLeft: "2px solid var(--bronze)",
                  }}>
                    <Mono style={{ color: "var(--bronze)", fontSize: 9 }}>Resumen</Mono>
                    <div style={{ fontFamily: "var(--sans)", fontSize: 13, lineHeight: 1.7, marginTop: 8 }}>
                      {data.service} · {data.date} · {data.time}
                    </div>
                  </div>
                </div>
              )}

              <div style={{
                display: "flex", gap: 12, marginTop: 40, justifyContent: "space-between",
              }}>
                <button onClick={() => step > 1 && setStep(step - 1)} style={{
                  background: "transparent", border: "none", color: "var(--noir)",
                  fontFamily: "var(--sans)", fontSize: 13, letterSpacing: "0.1em",
                  textTransform: "uppercase", cursor: step > 1 ? "pointer" : "default",
                  opacity: step > 1 ? 0.7 : 0.3, padding: "16px 0",
                }}>← Atrás</button>
                <button disabled={!canNext}
                  onClick={() => step < 3 ? setStep(step + 1) : setDone(true)}
                  style={{
                    background: canNext ? "var(--noir)" : "rgba(20,18,18,0.2)",
                    color: "var(--ivory)", border: "none",
                    padding: "16px 32px", fontFamily: "var(--sans)",
                    fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase",
                    cursor: canNext ? "pointer" : "not-allowed",
                  }}>
                  {step < 3 ? "Continuar →" : "Confirmar reserva"}
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%", background: "var(--bronze)",
                margin: "0 auto 24px", display: "flex",
                alignItems: "center", justifyContent: "center",
                color: "var(--noir)", fontSize: 24,
              }}>✓</div>
              <h3 style={{
                fontFamily: "var(--display)", fontSize: 32, fontWeight: 400,
                margin: "0 0 16px",
              }}>Reserva recibida</h3>
              <p style={{
                fontFamily: "var(--sans)", fontSize: 15, lineHeight: 1.6,
                opacity: 0.7, maxWidth: 380, margin: "0 auto 32px",
              }}>
                Te confirmamos por WhatsApp en los próximos minutos con la
                dirección exacta y cualquier indicación previa.
              </p>
              <button onClick={onClose} style={{
                background: "var(--noir)", color: "var(--ivory)", border: "none",
                padding: "14px 28px", fontFamily: "var(--sans)", fontSize: 12,
                letterSpacing: "0.2em", textTransform: "uppercase", cursor: "pointer",
              }}>Cerrar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

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
          {[["Servicios", "#servicios"], ["Galería", "#galeria"], ["Filosofía", "#filosofia"], ["Reservar", "#contacto"]].map(([l, h]) => (
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
          <span>+57 300 123 4567</span>
          <span>hola@joxe.co</span>
          <span>San Mateo, Soacha</span>
        </div>
      </div>
      <div>
        <Mono style={{ color: "var(--bronze)", display: "block", marginBottom: 18 }}>Social</Mono>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {["Instagram", "TikTok", "WhatsApp"].map(s => (
            <a key={s} href="#" style={{
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

Object.assign(window, {
  Nav, Hero, Marquee, Services, Gallery, Testimonials,
  Philosophy, BookingSection, BookingModal, Footer, Placeholder, Mono,
});
