const { useState, useEffect } = React;

const PALETTES = {
  "noir-bronze": { noir: "#0C0C0C", ivory: "#F5F1EA", bronze: "#C29E66" },
  "ink-champagne": { noir: "#14110F", ivory: "#F2EADD", bronze: "#D4B88A" },
  "charcoal-gold": { noir: "#1A1816", ivory: "#EFEAE0", bronze: "#B8894D" },
  "jet-rose": { noir: "#0A0A0A", ivory: "#F4EFE8", bronze: "#C89983" },
};

const FONTS = {
  "marcellus-outfit": { display: "'Marcellus', serif", sans: "'Outfit', sans-serif" },
  "cormorant-manrope": { display: "'Cormorant Garamond', serif", sans: "'Manrope', sans-serif" },
  "italiana-jost": { display: "'Italiana', serif", sans: "'Jost', sans-serif" },
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "noir-bronze",
  "fonts": "marcellus-outfit",
  "heroVariant": "split"
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);
  const [editMode, setEditMode] = useState(false);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === "__activate_edit_mode") setEditMode(true);
      if (e.data?.type === "__deactivate_edit_mode") setEditMode(false);
    };
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const palette = PALETTES[tweaks.palette] || PALETTES["noir-bronze"];
  const fonts = FONTS[tweaks.fonts] || FONTS["marcellus-outfit"];

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--noir", palette.noir);
    root.style.setProperty("--ivory", palette.ivory);
    root.style.setProperty("--bronze", palette.bronze);
    root.style.setProperty("--display", fonts.display);
    root.style.setProperty("--sans", fonts.sans);
  }, [palette, fonts]);

  const updateTweak = (key, value) => {
    const next = { ...tweaks, [key]: value };
    setTweaks(next);
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [key]: value } }, "*");
  };

  return (
    <div style={{ background: "var(--ivory)", minHeight: "100vh" }}>
      <Nav onReserveClick={() => setReserveOpen(true)} scrolled={scrolled} />
      <Hero onReserveClick={() => setReserveOpen(true)} />
      <Marquee />
      <Services />
      <Gallery />
      <Testimonials />
      <Philosophy />
      <BookingSection onReserveClick={() => setReserveOpen(true)} />
      <Footer />
      <BookingModal open={reserveOpen} onClose={() => setReserveOpen(false)} />

      {editMode && <TweaksPanel tweaks={tweaks} update={updateTweak} />}
    </div>
  );
}

function TweaksPanel({ tweaks, update }) {
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 200,
      background: "rgba(12,12,12,0.95)", color: "#F5F1EA",
      padding: 20, width: 280, fontFamily: "'Outfit', sans-serif",
      border: "1px solid rgba(194,158,102,0.4)",
      backdropFilter: "blur(12px)",
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
        letterSpacing: "0.2em", textTransform: "uppercase",
        color: "#C29E66", marginBottom: 16,
      }}>Tweaks</div>

      <div style={{ marginBottom: 18 }}>
        <label style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.6, display: "block", marginBottom: 8 }}>
          Paleta
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {Object.entries(PALETTES).map(([key, p]) => (
            <button key={key} onClick={() => update("palette", key)} style={{
              padding: "8px 10px", display: "flex", alignItems: "center", gap: 6,
              background: tweaks.palette === key ? "rgba(194,158,102,0.15)" : "transparent",
              border: `1px solid ${tweaks.palette === key ? "#C29E66" : "rgba(245,241,234,0.15)"}`,
              color: "#F5F1EA", cursor: "pointer", fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace", textAlign: "left",
            }}>
              <div style={{ display: "flex", gap: 2 }}>
                <div style={{ width: 10, height: 10, background: p.noir }} />
                <div style={{ width: 10, height: 10, background: p.ivory }} />
                <div style={{ width: 10, height: 10, background: p.bronze }} />
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.6, display: "block", marginBottom: 8 }}>
          Tipografía
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {Object.keys(FONTS).map(key => (
            <button key={key} onClick={() => update("fonts", key)} style={{
              padding: "8px 10px",
              background: tweaks.fonts === key ? "rgba(194,158,102,0.15)" : "transparent",
              border: `1px solid ${tweaks.fonts === key ? "#C29E66" : "rgba(245,241,234,0.15)"}`,
              color: "#F5F1EA", cursor: "pointer", fontSize: 11,
              fontFamily: "'Outfit', sans-serif", textAlign: "left",
              letterSpacing: "0.05em",
            }}>{key.replace("-", " + ")}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
