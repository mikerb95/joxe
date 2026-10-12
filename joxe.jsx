// JOXE: página "Conoce a Joxe", el estilista detrás del salón.
// BORRADOR: la historia (barrio, barberías, salón propio) y la forma de
// trabajar las escribimos para tener una base; falta confirmarlas con Joxe.
// No lleva años, cifras ni premios a propósito. Lo que sí es real: la
// ubicación y la lista de especialidades, que sale de los nombres que él mismo
// le puso a sus trabajos.

const { useState, useEffect } = React;

const JX_HISTORIA = [
  ["Empezó en el barrio",
    "Como muchos barberos, Joxe aprendió con la máquina en la mano y los amigos de modelos. Primero fueron los cortes del colegio y los del fin de semana; después, la fila de vecinos que preferían esperar su turno antes que ir a otro lado."],
  ["Se volvió oficio",
    "Pasó por barberías y salones donde aprendió lo que no sale en un tutorial: leer el tipo de pelo, llevar la navaja con pulso y entender el color. Con el tiempo sumó el trabajo de dama, el balayage, las mechas y tratamientos como la keratina."],
  ["Abrió su propio espacio",
    "Así nació JOXE Asesores de Imagen, en San Mateo, Soacha: un salón donde el corte no se improvisa, se diseña. Cada persona que se sienta en la silla sale con algo pensado para ella, no con el corte de moda de la semana."],
];

const JX_METODO = [
  ["Primero escucha",
    "Qué haces, cómo te peinas en la mañana y cuánto tiempo le dedicas. Un buen corte tiene que verse bien también el cuarto día."],
  ["Después diseña",
    "Forma del rostro, remolinos, grosor y textura del pelo. Con eso te propone algo, y si una idea no te va, te lo dice de frente."],
  ["Termina en el detalle",
    "La línea del degradado, el diseño con navaja, el tono exacto del color. Ahí es donde se nota la diferencia."],
];

// Los nombres los escribió Joxe al mandar las fotos de sus trabajos.
const JX_ESPECIALIDADES = [
  ["Barbería", ["Taper fade", "Low fade", "Dragón fade", "Diseños con navaja", "Mohicano texturizado"]],
  ["Cortes", ["Mullet", "Wolf cut", "Corte bob", "Bob long"]],
  ["Color y tratamientos", ["Balayage", "Mechas", "Color global", "Keratina", "Ondulado permanente"]],
];

const jxH2 = {
  fontFamily: "var(--display)", fontWeight: 400,
  fontSize: "clamp(34px, 4vw, 56px)", lineHeight: 1.05,
  margin: "20px 0 0", letterSpacing: "-0.01em",
};

const jxBody = {
  fontFamily: "var(--sans)", fontSize: 15, lineHeight: 1.75, opacity: 0.75, margin: 0,
};

// ------------------------------------------------
// HERO
// ------------------------------------------------
const JxHero = ({ onReserve }) => (
  <section id="top" className="jx-hero" style={{
    background: "var(--noir)", color: "var(--ivory)",
    padding: "160px 64px 110px",
    display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 72, alignItems: "center",
    maxWidth: "100%",
  }}>
    <div style={{ maxWidth: 640, justifySelf: "end", width: "100%" }}>
      <Mono style={{ color: "var(--bronze)" }}>El estilista · San Mateo, Soacha</Mono>
      <h1 style={{
        fontFamily: "var(--display)", fontWeight: 400,
        fontSize: "clamp(48px, 7vw, 108px)", lineHeight: 0.98,
        margin: "28px 0 0", letterSpacing: "-0.02em",
      }}>
        Conoce<br />a <em style={{ color: "var(--bronze)" }}>Joxe.</em>
      </h1>
      <p style={{
        fontFamily: "var(--sans)", fontSize: 17, lineHeight: 1.7,
        opacity: 0.72, maxWidth: 520, margin: "36px 0 0",
      }}>
        Es el estilista detrás de JOXE Asesores de Imagen. Corta, diseña y
        colorea, pero antes de tocar las tijeras hace lo mismo con cada
        cliente: lo mira, lo escucha y piensa qué le va a funcionar.
      </p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 44 }}>
        <button onClick={onReserve} style={{
          background: "var(--bronze)", border: "1px solid var(--bronze)",
          color: "var(--noir)", padding: "18px 34px", cursor: "pointer",
          fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
        }}>Reservar con Joxe</button>
        <a href="#historia" style={{
          border: "1px solid rgba(245,241,234,0.25)", color: "var(--ivory)",
          textDecoration: "none", padding: "18px 34px",
          fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
          display: "inline-flex", alignItems: "center",
        }}>Su historia</a>
      </div>
    </div>

    <figure className="jx-foto jx-hero-foto" style={{ margin: 0, aspectRatio: "3 / 4", width: "100%", maxWidth: 520 }}>
      <img src="/assets/joxe/joxe-1200.webp"
        srcSet="/assets/joxe/joxe-600.webp 600w, /assets/joxe/joxe-1200.webp 1200w"
        sizes="(max-width: 900px) 90vw, 40vw"
        alt="Joxe sonriendo en la calle, con camisa a rayas y una chaqueta de jean en la mano" />
    </figure>
  </section>
);

// ------------------------------------------------
// HISTORIA
// ------------------------------------------------
const JxHistoria = () => (
  <section id="historia" className="section" style={{
    background: "var(--ivory)", color: "var(--noir)", padding: "120px 64px",
  }}>
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <Mono style={{ color: "var(--bronze)" }}>Su historia</Mono>
      <h2 style={{ ...jxH2, maxWidth: 760 }}>
        De los cortes del barrio <em style={{ color: "var(--bronze)" }}>a su propio salón.</em>
      </h2>
      <div className="jx-historia" style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 56, marginTop: 64,
      }}>
        {JX_HISTORIA.map(([titulo, texto], i) => (
          <article key={titulo}>
            <div style={{
              fontFamily: "var(--display)", fontSize: 64, lineHeight: 1,
              color: "var(--bronze)", opacity: 0.85,
            }}>{String(i + 1).padStart(2, "0")}</div>
            <h3 style={{
              fontFamily: "var(--display)", fontWeight: 400, fontSize: 28,
              margin: "18px 0 14px", letterSpacing: "-0.01em",
            }}>{titulo}</h3>
            <p style={jxBody}>{texto}</p>
          </article>
        ))}
      </div>
    </div>
  </section>
);

// ------------------------------------------------
// CÓMO TRABAJA
// ------------------------------------------------
const JxMetodo = () => (
  <section className="section" style={{
    background: "var(--noir)", color: "var(--ivory)", padding: "120px 64px",
  }}>
    <div className="jx-metodo" style={{
      maxWidth: 1200, margin: "0 auto",
      display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 80, alignItems: "center",
    }}>
      <figure className="jx-foto" style={{ margin: 0, aspectRatio: "4 / 5" }}>
        <img src="/assets/joxe/joxe-trabajando-1200.webp"
          srcSet="/assets/joxe/joxe-trabajando-600.webp 600w, /assets/joxe/joxe-trabajando-1200.webp 1200w"
          sizes="(max-width: 900px) 90vw, 35vw" loading="lazy"
          alt="Joxe con la máquina en la mano, atendiendo a un cliente en el salón" />
      </figure>
      <div>
        <Mono style={{ color: "var(--bronze)" }}>Cómo trabaja</Mono>
        <h2 style={jxH2}>
          La imagen no se improvisa.<br /><em style={{ color: "var(--bronze)" }}>Se diseña.</em>
        </h2>
        <div style={{ display: "grid", gap: 36, marginTop: 52 }}>
          {JX_METODO.map(([titulo, texto], i) => (
            <div key={titulo} style={{
              display: "grid", gridTemplateColumns: "44px 1fr", gap: 16, alignItems: "baseline",
            }}>
              <Mono style={{ color: "var(--bronze)", fontSize: 10 }}>{String(i + 1).padStart(2, "0")}</Mono>
              <div>
                <h3 style={{
                  fontFamily: "var(--display)", fontWeight: 400, fontSize: 26,
                  margin: "0 0 10px", letterSpacing: "-0.01em",
                }}>{titulo}</h3>
                <p style={{ ...jxBody, opacity: 0.68 }}>{texto}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

// ------------------------------------------------
// ESPECIALIDADES + TRABAJOS
// ------------------------------------------------
const JxOficio = () => (
  <section className="section" style={{
    background: "var(--ivory)", color: "var(--noir)", padding: "120px 64px",
  }}>
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <Mono style={{ color: "var(--bronze)" }}>Lo que hace</Mono>
      <h2 style={jxH2}>
        Barbería, cortes <em style={{ color: "var(--bronze)" }}>y color.</em>
      </h2>

      <div className="jx-historia" style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 40, marginTop: 56,
      }}>
        {JX_ESPECIALIDADES.map(([grupo, items]) => (
          <div key={grupo} style={{ background: "#EDE6DA", padding: "30px 30px 34px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span aria-hidden="true" style={{
                width: 7, height: 7, borderRadius: "50%", background: "var(--bronze)",
              }} />
              <Mono style={{ fontSize: 10 }}>{grupo}</Mono>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0", display: "grid", gap: 10 }}>
              {items.map(it => (
                <li key={it} style={{ fontFamily: "var(--display)", fontSize: 22 }}>{it}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {GALLERY_PHOTOS.length > 0 && (
        <>
          <div className="jx-trabajos" style={{
            display: "grid", gridTemplateColumns: `repeat(${Math.min(GALLERY_PHOTOS.length, 4)}, 1fr)`,
            gap: 12, marginTop: 72,
          }}>
            {GALLERY_PHOTOS.slice(0, 4).map(p => (
              <a key={p.name} href="/#galeria" className="jx-foto jx-trabajo" style={{ aspectRatio: "3 / 4" }}>
                <img src={`/assets/trabajos/${p.name}-600.webp`} alt={p.alt} loading="lazy" />
              </a>
            ))}
          </div>
          <a href="/#galeria" style={{
            display: "inline-block", marginTop: 28, color: "var(--noir)",
            fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
            textDecoration: "none", borderBottom: "1px solid var(--bronze)", paddingBottom: 6,
          }}>Ver más trabajos →</a>
        </>
      )}
    </div>
  </section>
);

// ------------------------------------------------
// CIERRE
// ------------------------------------------------
const JxCierre = ({ onReserve }) => {
  const wa = getWAConfig();
  const waUrl = `https://wa.me/${wa.number}?text=${encodeURIComponent(
    "Hola Joxe, quiero una asesoría para mi próximo corte.")}`;
  return (
    <section className="section" style={{
      background: "var(--noir)", color: "var(--ivory)", padding: "120px 64px",
    }}>
      <div className="jx-cta-grid" style={{
        maxWidth: 1200, margin: "0 auto",
        display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 64, alignItems: "end",
      }}>
        <div>
          <Mono style={{ color: "var(--bronze)" }}>Tu turno</Mono>
          <h2 style={{ ...jxH2, fontSize: "clamp(38px, 5vw, 72px)" }}>
            Siéntate en la silla<br /><em style={{ color: "var(--bronze)" }}>y hablemos de tu imagen.</em>
          </h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <button onClick={onReserve} style={{
            background: "var(--bronze)", border: "1px solid var(--bronze)",
            color: "var(--noir)", padding: "18px 28px", cursor: "pointer",
            fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
          }}>Reservar cita</button>
          <a href={waUrl} target="_blank" rel="noopener noreferrer" style={{
            border: "1px solid rgba(245,241,234,0.25)", color: "var(--ivory)",
            textDecoration: "none", padding: "18px 28px", textAlign: "center",
            fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
          }}>Escribirle por WhatsApp</a>
        </div>
      </div>
    </section>
  );
};

// ------------------------------------------------
// PÁGINA
// ------------------------------------------------
function JoxePage() {
  const academy = useAcademy();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const reservar = () => { window.location.href = "/booking"; };
  const hasAcademy = !!academy?.enabled;
  return (
    <div style={{ background: "var(--ivory)", minHeight: "100vh" }}>
      <Nav onReserveClick={reservar} scrolled={scrolled} hasAcademy={hasAcademy} hrefPrefix="/" />
      <JxHero onReserve={reservar} />
      <JxHistoria />
      <JxMetodo />
      <JxOficio />
      <JxCierre onReserve={reservar} />
      <Footer hasAcademy={hasAcademy} hasModels={!!academy?.models} />
      <WhatsAppBlob />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<JoxePage />);
