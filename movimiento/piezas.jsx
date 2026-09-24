// Piezas con movimiento del home: el croquis del hero, el odómetro de precios
// y la ficha fija de servicios. La geometría y los cálculos viven en
// logica.js; aquí solo se pinta y se anima.
//
// Todo arranca en su estado final: si GSAP no carga o el visitante pidió
// menos movimiento, se ve el croquis terminado y los precios quietos. Solo
// cuando JoxeMotor.activo es true se esconden las piezas para animarlas.

const mvActivo = () => !!(window.JoxeMotor && window.JoxeMotor.activo);

// Línea de un titular dentro de una máscara: el motor la hace subir desde
// abajo. Sin motor es un bloque normal.
const L = ({ children }) => (
  <span className="mv-l"><span className="mv-li">{children}</span></span>
);

// Rótulo de sección: un trazo corto de bronce seguido del texto en mono.
const Rotulo = ({ children, style }) => (
  <span data-mv="rotulo" style={{
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
    display: "inline-flex", alignItems: "center", ...style,
  }}>
    <span className="mv-trazo" aria-hidden="true" />
    <span className="mv-rt">{children}</span>
  </span>
);

// ------------------------------------------------------------------
// ODÓMETRO
// ------------------------------------------------------------------
const TIRA = "0123456789".repeat(2).split("").join("\n");

const Odometro = ({ texto, style }) => {
  const M = window.JoxeMovimiento;
  const partes = M.partesOdometro(texto);
  const ref = React.useRef(null);
  const previo = React.useRef(texto);

  // Cuando cambia el valor (la ficha pasa a otro servicio), cada dígito rueda
  // hacia arriba desde el anterior. La primera aparición la anima el motor.
  React.useLayoutEffect(() => {
    const antes = previo.current;
    previo.current = texto;
    if (antes === texto || !mvActivo() || !ref.current) return;
    const viejos = M.partesOdometro(antes).filter(p => p.tipo === "d").reverse();
    const tiras = Array.from(ref.current.querySelectorAll(".odo-t")).reverse();
    tiras.forEach((t, i) => {
      const desde = viejos[i] ? -(viejos[i].v / 20) * 100 : 0;
      window.gsap.fromTo(t, { y: 0, yPercent: desde },
        { y: 0, yPercent: Number(t.dataset.y), duration: 0.9, ease: "expo.out", delay: i * 0.035, overwrite: true });
    });
  }, [texto]);

  if (!partes.some(p => p.tipo === "d")) return <span style={style}>{texto}</span>;

  return (
    <span ref={ref} className="odo" data-mv="odometro" style={style}>
      <span className="sr-only">{texto}</span>
      <span className="odo-v" aria-hidden="true">
        {partes.map((p, i) => {
          const k = partes.length - i; // desde la derecha: las unidades conservan su columna
          if (p.tipo === "s") return <span key={"s" + k} className="odo-s">{p.v}</span>;
          const y = M.desplazamientoDigito(p.v);
          return (
            <span key={"d" + k} className="odo-c">
              <span className="odo-t" data-y={y} style={{ transform: `translateY(${y}%)` }}>{TIRA}</span>
            </span>
          );
        })}
      </span>
    </span>
  );
};

// Texto que asoma desde abajo cada vez que se monta (se usa con key para que
// cada servicio nuevo de la ficha entre con su propio gesto).
const Asoma = ({ children, style }) => {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => {
    if (!mvActivo() || !ref.current) return;
    window.gsap.fromTo(ref.current, { yPercent: 105 }, { yPercent: 0, duration: 0.7, ease: "expo.out" });
  }, []);
  return (
    <span className="mv-l" style={style}><span ref={ref} className="mv-li">{children}</span></span>
  );
};

// ------------------------------------------------------------------
// FICHA DE SERVICIOS (solo escritorio)
// Muestra el servicio que cruza la línea de lectura o el que se apunta: lo
// mismo que dice la fila, pero puesto como una cuenta que no cambia al
// llegar al salón. La lista sigue siendo el contenido; la ficha es la prueba
// de "sin sorpresas".
// ------------------------------------------------------------------
// Duración con las mismas unidades que la regla de la ficha ("1 h", "2 h 30 min").
const duracionFicha = mins => {
  if (!mins) return "";
  const h = Math.floor(mins / 60), m = mins % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
};

const FichaServicio = ({ servicios, activa, precio, dias, hoy }) => {
  const s = servicios[activa] || servicios[0];
  if (!s) return null;
  const maxDur = Math.max(240, ...servicios.map(x => x.dur || 0));
  const horas = Math.ceil(maxDur / 60);
  const etiquetasDia = dias(s);
  const hoyPrecio = hoy && s.dayPrices && Number(s.dayPrices[hoy.clave]) > 0
    ? `${hoy.nombre} ${precio({ price: s.dayPrices[hoy.clave] })}` : null;

  return (
    <div className="ficha" data-mv="sube">
      <div aria-hidden="true">
        <div className="ficha-cab">
          <span>Servicio {String(activa + 1).padStart(2, "0")} / {String(servicios.length).padStart(2, "0")}</span>
          {hoyPrecio && <span className="ficha-hoy"><i />Hoy</span>}
        </div>
        <div className="ficha-nombre">
          <Asoma key={s.id || activa}>{s.name}</Asoma>
        </div>

        <div className="ficha-dato">
          <span className="ficha-rot">Duración</span>
          <span className="ficha-val">{duracionFicha(s.dur)}</span>
        </div>
        <div className="ficha-regla">
          <span className="ficha-regla-fill" style={{ transform: `scaleX(${(s.dur || 0) / maxDur})` }} />
          {Array.from({ length: horas + 1 }, (_, h) => (
            <span key={h} className="ficha-tick" style={{ left: `${(h / horas) * 100}%` }} />
          ))}
        </div>
        <div className="ficha-horas">
          {Array.from({ length: horas + 1 }, (_, h) => <span key={h}>{h} h</span>)}
        </div>

        <div className="ficha-dato" style={{ marginTop: 30 }}>
          <span className="ficha-rot">Precio</span>
        </div>
        {/* "Según valoración" no cabe al tamaño de una cifra. */}
        <div className={"ficha-precio" + (/[0-9]/.test(precio(s)) ? "" : " ficha-precio-texto")}>
          <Odometro texto={precio(s)} />
        </div>
        <div className="ficha-dias">
          {hoyPrecio
            ? <span className="ficha-dia-hoy">{hoyPrecio} · hoy</span>
            : etiquetasDia.map(l => <span key={l}>{l}</span>)}
        </div>
      </div>
      <a href="/booking" className="ficha-cta" data-mv="iman">
        <span className="mv-iman-t">Reservar cita →</span>
      </a>
    </div>
  );
};

// ------------------------------------------------------------------
// CROQUIS DEL HERO
// "La imagen no se improvisa. Se diseña.": el corte se dibuja antes de
// hacerse. Perfil, tercios del rostro, línea de degradado y una guía de
// elevación que el visitante mueve con el cursor; la silueta del pelo
// responde (a poca elevación el peso baja, a mucha las capas se emparejan).
// Es una ilustración, no un trabajo del salón, y así lo dice su rótulo.
// ------------------------------------------------------------------
// memo: el hero se vuelve a pintar cuando cambia el nav al hacer scroll, y
// el croquis no tiene por qué repetir su render (lo que se mueve lo cambia
// aplicar() directo en el SVG).
const Croquis = React.memo(() => {
  const M = window.JoxeMovimiento;
  const C = M.CROQUIS;
  const raiz = React.useRef(null);
  const el = React.useRef({});
  const setRef = nombre => n => { el.current[nombre] = n; };
  const hebras = React.useMemo(() => M.hebras(), []);
  const INICIAL = 45;
  const s0 = M.siluetaPelo(INICIAL), g0 = M.guia(INICIAL), w0 = M.puntoPeso(INICIAL);
  // Columna de rótulos a la derecha: el texto va alineado al borde del
  // lienzo y las líneas guía terminan antes, así el rótulo no se sale del
  // SVG aunque en móvil la letra sea más grande.
  const ROT_X = C.ancho - 16;
  const LIDER_X = 530;

  // Redibuja lo que depende de la elevación sin pasar por React: se llama en
  // cada fotograma mientras la guía se mueve.
  const aplicar = React.useCallback(grados => {
    const e = el.current;
    if (!e.forma) return;
    const s = M.siluetaPelo(grados), g = M.guia(grados), w = M.puntoPeso(grados);
    e.forma.setAttribute("d", s.forma);
    e.borde.setAttribute("d", s.borde);
    e.mechones.setAttribute("d", M.mechones(grados));
    e.guia.setAttribute("x2", g.x2); e.guia.setAttribute("y2", g.y2);
    e.arco.setAttribute("d", g.arco);
    e.valor.textContent = `${Math.round(grados)}°`;
    e.peso.setAttribute("cx", w.x); e.peso.setAttribute("cy", w.y);
    e.pesoLinea.setAttribute("d", `M${w.x + 5} ${w.y}H${LIDER_X}`);
    e.pesoRot.setAttribute("y", w.y + 3.5);
  }, []);

  React.useLayoutEffect(() => {
    const nodo = raiz.current;
    const svg = nodo.querySelector("svg");
    const gsap = window.gsap;
    const activo = mvActivo();
    const estado = { g: INICIAL };
    let vaiven = null, intro = null, visible = false, tocado = false, reanudar = null;

    const aSvg = ev => {
      const m = svg.getScreenCTM();
      if (!m) return null;
      const p = svg.createSVGPoint();
      p.x = ev.clientX; p.y = ev.clientY;
      return p.matrixTransform(m.inverse());
    };

    // El cursor manda la guía. Mientras se apunta, nada se mueve solo.
    const mover = ev => {
      if (ev.pointerType === "touch") return;
      const p = aSvg(ev);
      if (!p) return;
      const destino = M.anguloDesde(p.x, p.y);
      if (!tocado) { tocado = true; nodo.classList.add("cq-tocado"); }
      if (vaiven) vaiven.pause();
      clearTimeout(reanudar);
      if (activo) {
        gsap.to(estado, { g: destino, duration: 0.45, ease: "power3.out", overwrite: true, onUpdate: () => aplicar(estado.g) });
      } else {
        estado.g = destino;
        aplicar(destino);
      }
    };
    const salir = () => {
      if (!vaiven) return;
      clearTimeout(reanudar);
      reanudar = setTimeout(() => {
        gsap.to(estado, {
          g: INICIAL, duration: 1.2, ease: "power2.inOut", overwrite: true,
          onUpdate: () => aplicar(estado.g),
          onComplete: () => { if (visible) vaiven.restart(); },
        });
      }, 2500);
    };
    nodo.addEventListener("pointermove", mover);
    nodo.addEventListener("pointerleave", salir);

    const limpiar = [() => {
      nodo.removeEventListener("pointermove", mover);
      nodo.removeEventListener("pointerleave", salir);
      clearTimeout(reanudar);
    }];

    if (activo) {
      const q = sel => nodo.querySelectorAll(sel);
      // Los trazos llevan pathLength="1": con guion y desfase de 1 quedan
      // sin dibujar y se dibujan llevando el desfase a 0.
      gsap.set(q(".cq-dib"), { strokeDasharray: 1, strokeDashoffset: 1 });
      gsap.set(q(".cq-aparece, .cq-hebras path, .cq-rot"), { opacity: 0 });
      estado.g = 0;
      aplicar(0);

      intro = gsap.timeline({ paused: true, defaults: { ease: "power2.inOut" } })
        .to(q(".cq-esquina"), { opacity: 1, duration: 0.5, stagger: 0.06 }, 0)
        .to(q(".cq-tercio"), { strokeDashoffset: 0, duration: 0.9, stagger: 0.07 }, 0.1)
        .to(q(".cq-perfil"), { strokeDashoffset: 0, duration: 1.7, stagger: 0.12 }, 0.25)
        .to(q(".cq-oreja"), { strokeDashoffset: 0, duration: 0.9 }, 1.0)
        .to(q(".cq-deg-mascara"), { strokeDashoffset: 0, duration: 1.1 }, 1.3)
        .to(q(".cq-hebras path"), { opacity: 1, duration: 0.45, stagger: 0.11, ease: "power1.out" }, 1.45)
        .to(q(".cq-borde"), { strokeDashoffset: 0, duration: 1.2 }, 1.7)
        .to(q(".cq-forma, .cq-mechones"), { opacity: 1, duration: 0.8, ease: "power1.out" }, 2.1)
        .to(q(".cq-guia-g"), { opacity: 1, duration: 0.3 }, 2.2)
        .to(estado, { g: INICIAL, duration: 1.3, ease: "expo.out", onUpdate: () => aplicar(estado.g) }, 2.2)
        .to(q(".cq-rot"), { opacity: 1, duration: 0.5, stagger: 0.09, ease: "power1.out" }, 2.6);

      // Después de dibujarse, la guía se pasea sola para mostrar que se
      // puede mover: baja, sube, vuelve a 45° y descansa.
      vaiven = gsap.timeline({ paused: true, repeat: -1, delay: 0.6, defaults: { ease: "sine.inOut", onUpdate: () => aplicar(estado.g) } })
        .to(estado, { g: 16, duration: 2.6 })
        .to(estado, { g: 80, duration: 3.8 })
        .to(estado, { g: INICIAL, duration: 2.4 })
        .to({}, { duration: 2.2 });
      intro.eventCallback("onComplete", () => { if (!tocado && visible) vaiven.play(); });

      // Fuera de pantalla no se gasta un fotograma.
      const io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        if (visible) {
          if (!intro.progress()) intro.play();
          else if (intro.progress() === 1 && !tocado) vaiven.play();
        } else if (vaiven) vaiven.pause();
      }, { threshold: 0.25 });
      io.observe(nodo);
      limpiar.push(() => { io.disconnect(); intro.kill(); vaiven.kill(); gsap.killTweensOf(estado); });
    }

    return () => limpiar.forEach(f => f());
  }, []);

  const tercio = (y1, y2, n) => (
    <text className="cq-mono cq-rot cq-tenue" x="38" y={(y1 + y2) / 2 + 4} textAnchor="middle">{n}</text>
  );
  const T = C.tercios;

  return (
    <div ref={raiz} className="croquis">
      <svg viewBox={`0 0 ${C.ancho} ${C.alto}`} role="img"
        aria-label="Croquis de un corte: perfil de una cabeza con los tercios del rostro, la línea de degradado y la guía de elevación del pelo. Ejemplo ilustrativo.">
        <defs>
          <linearGradient id="cq-desvanece" gradientUnits="userSpaceOnUse" x1="0" y1="560" x2="0" y2="712">
            <stop offset="0" stopColor="#fff" />
            <stop offset="1" stopColor="#000" />
          </linearGradient>
          <mask id="cq-cuello" maskUnits="userSpaceOnUse" x="0" y="0" width={C.ancho} height={C.alto}>
            <rect width={C.ancho} height={C.alto} fill="url(#cq-desvanece)" />
          </mask>
          <mask id="cq-deg" maskUnits="userSpaceOnUse" x="0" y="0" width={C.ancho} height={C.alto}>
            <path className="cq-dib cq-deg-mascara" d={C.degradado} pathLength="1" fill="none" stroke="#fff" strokeWidth="8" />
          </mask>
        </defs>

        {/* Marco de dibujo técnico */}
        {[[18, 18, 1, 1], [C.ancho - 18, 18, -1, 1], [18, C.alto - 18, 1, -1], [C.ancho - 18, C.alto - 18, -1, -1]].map(([x, y, sx, sy], i) => (
          <path key={i} className="cq-esquina cq-aparece" d={`M${x} ${y + 14 * sy}V${y}H${x + 14 * sx}`} />
        ))}

        {/* Tercios del rostro */}
        {T.map((y, i) => (
          <line key={y} className="cq-dib cq-tercio" pathLength="1" x1="54" x2={C.ancho - 40} y1={y} y2={y} />
        ))}
        <line className="cq-dib cq-tercio cq-cota" pathLength="1" x1="54" x2="54" y1={T[0]} y2={T[3]} />
        {tercio(T[0], T[1], "I")}
        {tercio(T[1], T[2], "II")}
        {tercio(T[2], T[3], "III")}

        {/* Pelo: forma, hebras del costado y mechones */}
        <path ref={setRef("forma")} className="cq-forma cq-aparece" d={s0.forma} />
        <g className="cq-hebras">
          {hebras.map((d, i) => <path key={i} d={d} />)}
        </g>
        <path ref={setRef("mechones")} className="cq-mechones cq-aparece" d={M.mechones(INICIAL)} />

        {/* Cabeza */}
        <g mask="url(#cq-cuello)">
          <path className="cq-dib cq-perfil" pathLength="1" d={C.craneo} />
          <path className="cq-dib cq-perfil" pathLength="1" d={C.rostro} />
          <path className="cq-dib cq-perfil" pathLength="1" d={C.nuca} />
        </g>
        <path className="cq-dib cq-oreja" pathLength="1" d={C.oreja} />

        {/* Línea de degradado (punteada, se revela con una máscara) */}
        <path className="cq-degradado" d={C.degradado} mask="url(#cq-deg)" />
        <path ref={setRef("borde")} className="cq-dib cq-borde" pathLength="1" d={s0.borde} />

        {/* Guía de elevación */}
        <g className="cq-guia-g cq-aparece">
          <line className="cq-ref" x1={g0.x} y1={g0.y} x2={g0.rx2} y2={g0.ry2} />
          <line ref={setRef("guia")} className="cq-guia" x1={g0.x} y1={g0.y} x2={g0.x2} y2={g0.y2} />
          <path ref={setRef("arco")} className="cq-arco" d={g0.arco} />
          <circle className="cq-pivote" cx={g0.x} cy={g0.y} r="3.5" />
        </g>

        {/* Cajetín con la lectura de la elevación, fijo para que ningún
            ángulo lo haga chocar con la guía o con los rótulos. */}
        <g className="cq-rot" transform="translate(54 58)">
          <text className="cq-mono">ELEVACIÓN</text>
          <text ref={setRef("valor")} className="cq-num" y="40">{INICIAL}°</text>
        </g>

        {/* Rótulos */}
        <g className="cq-rot">
          <circle ref={setRef("peso")} className="cq-marca" cx={w0.x} cy={w0.y} r="4" />
          <path ref={setRef("pesoLinea")} className="cq-lider" d={`M${w0.x + 5} ${w0.y}H${LIDER_X}`} />
          <text ref={setRef("pesoRot")} className="cq-mono" x={ROT_X} y={w0.y + 3.5} textAnchor="end">LÍNEA DE PESO</text>
        </g>
        <g className="cq-rot">
          <path className="cq-lider" d={`M452 338L500 404H${LIDER_X}`} />
          <text className="cq-mono" x={ROT_X} y="407.5" textAnchor="end">DEGRADADO</text>
        </g>
        <g className="cq-rot">
          <path className="cq-lider" d={`M258 90L292 58H${LIDER_X}`} />
          <text className="cq-mono" x={ROT_X} y="61.5" textAnchor="end">TEXTURA</text>
        </g>

        <text className="cq-mono cq-rot cq-tenue" x="54" y={C.alto - 26}>TERCIOS DEL ROSTRO</text>
        <text className="cq-mono cq-rot cq-tenue" x={C.ancho - 40} y={C.alto - 26} textAnchor="end">EJEMPLO ILUSTRATIVO</text>
      </svg>
      <p className="cq-pista" aria-hidden="true">Mueve el cursor sobre el croquis para cambiar la elevación</p>
    </div>
  );
});

Object.assign(window, { L, Rotulo, Odometro, Asoma, FichaServicio, Croquis });
