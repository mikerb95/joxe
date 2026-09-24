// ==================== TELÉFONO CON INDICATIVO ====================
// Campo de celular con selector de país (bandera + indicativo) y las reglas
// para guardar, comparar y mostrar números. Lo cargan todas las páginas que
// piden o muestran un celular, antes de su propio .jsx:
//   Booking, Portal, Agenda, CheckIn, Lobby, Scan, Cuenta, Admin, Staff,
//   Academia y Payment.
//
// Formato estándar: E.164, "+573001234567". Es lo que se guarda desde ahora.
// Las citas de antes tienen 10 dígitos sin indicativo ("3001234567"): todos
// eran celulares colombianos, así que se leen como +57. La misma regla está
// en el servidor (normPhone en lib/db.js); si cambia, hay que cambiarla en
// los dos lados.

const PHONE_DEFAULT_ISO = "CO";

// ISO 3166 + indicativo. Varios países comparten indicativo (+1, +7, +39):
// el primero de la lista es el que se elige al leer un número guardado.
const PHONE_COUNTRIES = (() => {
  const raw = "CO57 US1 CA1 AG1 AI1 AS1 BB1 BM1 BS1 DM1 DO1 GD1 GU1 JM1 KN1 KY1 LC1 MS1 PR1 SX1 TC1 TT1 VC1 VG1 VI1 " +
    "RU7 KZ7 IT39 VA39 EG20 SS211 MA212 DZ213 TN216 LY218 GM220 SN221 MR222 ML223 GN224 CI225 BF226 NE227 " +
    "TG228 BJ229 MU230 LR231 SL232 GH233 NG234 TD235 CF236 CM237 CV238 ST239 GQ240 GA241 CG242 CD243 AO244 " +
    "GW245 SC248 SD249 RW250 ET251 SO252 DJ253 KE254 TZ255 UG256 BI257 MZ258 ZM260 MG261 RE262 ZW263 NA264 " +
    "MW265 LS266 BW267 SZ268 KM269 ZA27 ER291 AW297 GL299 GR30 NL31 BE32 FR33 ES34 GI350 PT351 LU352 IE353 " +
    "IS354 AL355 MT356 CY357 FI358 BG359 HU36 LT370 LV371 EE372 MD373 AM374 BY375 AD376 MC377 SM378 UA380 " +
    "RS381 ME382 XK383 HR385 SI386 BA387 MK389 RO40 CH41 CZ420 SK421 LI423 AT43 GB44 DK45 SE46 NO47 PL48 " +
    "DE49 BZ501 GT502 SV503 HN504 NI505 CR506 PA507 HT509 PE51 MX52 CU53 AR54 BR55 CL56 VE58 GP590 BO591 " +
    "GY592 EC593 GF594 PY595 MQ596 SR597 UY598 CW599 MY60 AU61 ID62 PH63 NZ64 SG65 TH66 TL670 BN673 NR674 " +
    "PG675 TO676 SB677 VU678 FJ679 PW680 CK682 WS685 KI686 NC687 TV688 PF689 FM691 MH692 JP81 KR82 VN84 " +
    "KP850 HK852 MO853 KH855 LA856 CN86 BD880 TW886 TR90 IN91 PK92 AF93 LK94 MM95 MV960 LB961 JO962 SY963 " +
    "IQ964 KW965 SA966 YE967 OM968 PS970 AE971 IL972 BH973 QA974 BT975 MN976 NP977 IR98 TJ992 TM993 AZ994 " +
    "GE995 KG996 UZ998";
  let names = null;
  try { names = new Intl.DisplayNames(["es"], { type: "region" }); } catch {}
  const list = raw.split(" ").map((s, order) => {
    const iso = s.slice(0, 2), dial = s.slice(2);
    let name = iso;
    try { name = names?.of(iso) || iso; } catch {}
    const flag = String.fromCodePoint(...[...iso].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
    return { iso, dial, name, flag, order };
  });
  // Colombia arriba; el resto por nombre, como se busca en una lista.
  const [co, ...rest] = list;
  return [co, ...rest.sort((a, b) => a.name.localeCompare(b.name, "es"))];
})();

const phoneCountry = (iso) =>
  PHONE_COUNTRIES.find(c => c.iso === iso) || PHONE_COUNTRIES[0];

// Los indicativos no son prefijo unos de otros, así que el que calce es el
// único posible; entre países que lo comparten gana el primero de la lista
// original (Estados Unidos para +1).
const phoneCountryOf = (digits) => {
  let best = null;
  for (const c of PHONE_COUNTRIES) {
    if (digits.startsWith(c.dial) && (!best || c.order < best.order)) best = c;
  }
  return best;
};

// Cualquier cosa que venga (lo que escribió alguien, una cita vieja) →
// "+573001234567". Si no hay forma de saber el país, devuelve los dígitos.
const normPhone = (raw) => {
  const s = String(raw ?? "").trim();
  const d = s.replace(/\D/g, "");
  if (!d) return "";
  if (s.startsWith("+")) return "+" + d.slice(0, 15);
  if (d.length === 10) return "+57" + d;           // cita de antes: celular colombiano
  if (d.length > 10) return "+" + d.slice(0, 15);  // ya traía indicativo, sin el "+"
  return d;
};

// Separa un número en país y número nacional, para llenar el campo.
const splitPhone = (raw) => {
  const e = normPhone(raw);
  if (!e.startsWith("+")) return { iso: PHONE_DEFAULT_ISO, national: e };
  const d = e.slice(1);
  const c = phoneCountryOf(d);
  return c ? { iso: c.iso, national: d.slice(c.dial.length) } : { iso: PHONE_DEFAULT_ISO, national: d };
};

// Llave para reconocer al mismo cliente (CRM, autocompletar el nombre). Para
// Colombia son los 10 dígitos de siempre, que es como están guardadas las
// citas viejas y las fichas del CRM; así nadie queda partido en dos.
const phoneKey = (raw) => {
  const e = normPhone(raw);
  if (e.startsWith("+57") && e.length === 13) return e.slice(3);
  return e.replace(/\D/g, "");
};

// Número para wa.me: indicativo y número, sin "+" ni espacios.
const waNumber = (raw) => normPhone(raw).replace(/\D/g, "");

// Para mostrar: "+57 300 123 4567". Lo que no se pueda leer sale tal cual.
const fmtPhone = (raw) => {
  const e = normPhone(raw);
  if (!e.startsWith("+")) return String(raw ?? "");
  const { iso, national } = splitPhone(e);
  const c = phoneCountry(iso);
  const n = iso === "CO" && national.length === 10
    ? `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`
    : national;
  return `+${c.dial} ${n}`;
};

// "" si el número sirve. Vacío también es "" (lo exige el `required` de cada
// formulario). Colombia pide exactamente 10 dígitos; para otros países no hay
// una regla única, solo que no esté corto ni pase el máximo de E.164.
const phoneError = (raw) => {
  const e = normPhone(raw);
  if (!e) return "";
  const { iso, national } = splitPhone(e);
  if (iso === "CO") return national.length === 10 ? "" : "Debe tener 10 dígitos (ej: 300 123 4567).";
  return national.length >= 6 ? "" : "Revisa el número: parece incompleto.";
};

// Windows no trae banderas en su fuente de emoji (pinta "CO" en vez de 🇨🇴).
// Si el navegador dibuja emoji pero no banderas, se carga una fuente que solo
// tiene banderas. Detección tomada de country-flag-emoji-polyfill (MIT): un
// emoji a color sale igual con relleno blanco o negro; las letras no.
const PHONE_FLAG_FONT = "Twemoji Country Flags";
(() => {
  try {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    cx.textBaseline = "top";
    cx.font = `100px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    cx.scale(0.01, 0.01);
    const px = (txt, fill) => { cx.clearRect(0, 0, 100, 100); cx.fillStyle = fill; cx.fillText(txt, 0, 0); return cx.getImageData(0, 0, 1, 1).data.join(","); };
    const color = (txt) => { const w = px(txt, "#fff"), b = px(txt, "#000"); return w === b && !b.startsWith("0,0,0,"); };
    if (!color("\u{1F60A}") || color("\u{1F1E8}\u{1F1ED}")) return;
    const st = document.createElement("style");
    st.textContent = `@font-face{font-family:"${PHONE_FLAG_FONT}";unicode-range:U+1F1E6-1F1FF;` +
      `src:url("https://cdn.jsdelivr.net/npm/country-flag-emoji-polyfill@0.1.10/dist/TwemojiCountryFlags.woff2") format("woff2");font-display:swap}`;
    document.head.appendChild(st);
  } catch {}
})();

// El campo: país a la izquierda (un <select> nativo transparente encima de la
// bandera, así en el celular sale la lista del sistema) y el número a la
// derecha. Entrega el valor ya normalizado ("+573001234567", o "" si el número
// está vacío). `fieldStyle` es el estilo de input de cada página: lo usan las
// dos cajas para que el campo se vea como el resto del formulario.
const PhoneField = ({
  value, onChange, id, name = "tel", placeholder, required, autoFocus,
  invalid, describedBy, ariaLabel, fieldStyle = {}, theme = "dark", focusColor = "#C29E66",
}) => {
  const [iso, setIso]   = React.useState(() => splitPhone(value).iso);
  const [text, setText] = React.useState(() => splitPhone(value).national);
  const [focus, setFocus] = React.useState(false);
  // Último valor que salió de aquí. Si llega otro distinto (se limpió el
  // formulario, se restauró un borrador) el campo se vuelve a armar desde él.
  const sent = React.useRef(normPhone(value));
  React.useEffect(() => {
    if (normPhone(value) === sent.current) return;
    const p = splitPhone(value);
    setIso(p.iso); setText(p.national);
    sent.current = normPhone(value);
  }, [value]);

  const country = phoneCountry(iso);
  const emit = (nextIso, nextText) => {
    const d = nextText.replace(/\D/g, "");
    const v = d ? `+${phoneCountry(nextIso).dial}${d}` : "";
    sent.current = v;
    onChange(v);
  };

  const onText = (e) => {
    let t = e.target.value;
    // Pegaron o autocompletaron el número completo con indicativo.
    if (t.trim().startsWith("+")) {
      const p = splitPhone(t);
      setIso(p.iso); setText(p.national); emit(p.iso, p.national);
      return;
    }
    t = t.replace(/[^\d\s]/g, "");
    let d = t.replace(/\D/g, "");
    // En Colombia es común escribir "57 300…" sin el "+".
    if (iso === "CO" && d.length === 12 && d.startsWith("57")) { d = d.slice(2); t = d; }
    const max = 15 - country.dial.length;
    if (d.length > max) { d = d.slice(0, max); t = d; }
    setText(t); emit(iso, t);
  };

  const onIso = (e) => { setIso(e.target.value); emit(e.target.value, text); };

  const flagFont = `"${PHONE_FLAG_FONT}", ${fieldStyle.fontFamily || "sans-serif"}`;
  const optBg    = theme === "light" ? "#FFFFFF" : "#141212";
  const optColor = theme === "light" ? "#0C0C0C" : "#F5F1EA";

  return (
    <div style={{ display: "flex", gap: 8, width: "100%" }}>
      <div style={{
        ...fieldStyle, width: "auto", flex: "0 0 auto", position: "relative",
        display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
        paddingLeft: 12, paddingRight: 10,
        outline: focus ? `1px solid ${focusColor}` : "none", outlineOffset: 2,
      }}>
        <span aria-hidden="true" style={{ fontFamily: flagFont, fontSize: "1.15em", lineHeight: 1 }}>{country.flag}</span>
        <span aria-hidden="true">+{country.dial}</span>
        <span aria-hidden="true" style={{ fontSize: "0.7em", opacity: 0.55 }}>▾</span>
        <select value={iso} onChange={onIso} aria-label="País del celular"
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0,
            cursor: "pointer", border: "none", margin: 0, appearance: "none",
            fontFamily: flagFont, fontSize: 16, background: optBg, color: optColor,
          }}>
          {PHONE_COUNTRIES.map(c => (
            <option key={c.iso} value={c.iso} style={{ background: optBg, color: optColor }}>
              {c.flag} {c.name} +{c.dial}
            </option>
          ))}
        </select>
      </div>
      <input id={id} name={name} type="tel" inputMode="tel" autoComplete="tel-national"
        value={text} onChange={onText} placeholder={placeholder ?? (iso === "CO" ? "300 123 4567" : "")}
        required={required} autoFocus={autoFocus} aria-label={ariaLabel}
        aria-invalid={invalid || undefined} aria-describedby={describedBy}
        style={{ ...fieldStyle, flex: "1 1 auto", minWidth: 0, width: "100%" }} />
    </div>
  );
};
