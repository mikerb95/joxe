// Capa decorativa de Halloween: murciélagos, fantasmas, telarañas y una araña.
// Se carga suelta (sin React ni Babel) y solo inyecta marcado y CSS. Todas las
// animaciones son @keyframes sobre transform y opacity, así que corren en el
// compositor y nunca disparan layout. La capa entera y cada pieza llevan
// pointer-events: none, de modo que no bloquea ningún clic.
//
// Se activa sola entre DESDE y HASTA (hora local del visitante). Para verla
// fuera de temporada basta abrir la página con ?halloween=1; ?halloween=0 la
// apaga aunque sea octubre.
(() => {
  const DESDE = "10-01"; // MM-DD, ambos días incluidos
  const HASTA = "10-31";

  const forzar = new URLSearchParams(location.search).get("halloween");
  const hoy = new Date();
  const mmdd = `${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  const activa = forzar === "1" || (forzar !== "0" && mmdd >= DESDE && mmdd <= HASTA);
  if (!activa || document.getElementById("hw-capa")) return;

  // ruta: trayectoria diagonal (ver @keyframes hw-ruta-*). t: ancho en px.
  // d: duración del ciclo; el vuelo ocupa ~40% y el resto espera fuera de
  // pantalla, así no hay murciélagos cruzando todo el tiempo. y: desfase
  // vertical de la ruta. a/b: ritmo del aleteo y del vaivén.
  const MURCIELAGOS = [
    { ruta: "a", t: 46, d: 24, r: 1.5, y: 0,  o: 1,   a: 0.28, b: 1.7 },
    { ruta: "a", t: 30, d: 24, r: 2.6, y: 12, o: 0.75, a: 0.24, b: 1.4, soloEscritorio: true },
    { ruta: "b", t: 38, d: 31, r: 10,  y: 0,  o: 1,   a: 0.32, b: 2.0 },
    { ruta: "c", t: 26, d: 37, r: 18,  y: 0,  o: 0.7, a: 0.22, b: 1.5, soloEscritorio: true },
  ];

  // x: columna fija en vw, pegada a los márgenes para no tapar el contenido.
  const FANTASMAS = [
    { x: 3,  t: 38, d: 26, r: 4,  b: 3.2 },
    { x: 88, t: 30, d: 30, r: 13, b: 2.6 },
    { x: 64, t: 24, d: 34, r: 22, b: 3.6, soloEscritorio: true },
  ];

  const MURCIELAGO = `<svg class="hw-aleteo" viewBox="0 0 100 36"><path d="M50 16L53.5 9.5L55.5 15.5C62 12 72 6 84 4.5C91 3.5 96 6 99.5 10Q91 12 88 20Q82.5 16 77 22.5Q71 19 66 26Q60.5 21 55.5 25.5C54.5 29 52.5 32 50 34C47.5 32 45.5 29 44.5 25.5Q39.5 21 34 26Q29 19 23 22.5Q17.5 16 12 20Q9 12 0.5 10C4 6 9 3.5 16 4.5C28 6 38 12 44.5 15.5L46.5 9.5Z"/></svg>`;

  const FANTASMA = `<svg viewBox="0 0 40 48"><path class="hw-cuerpo" d="M4 20C4 10 10.5 2 20 2S36 10 36 20V41Q33.5 46 30 43Q27 40 24 44Q20 48 16 44Q13 40 10 43Q6.5 46 4 41Z"/><ellipse class="hw-rasgo" cx="15" cy="19" rx="2.2" ry="3"/><ellipse class="hw-rasgo" cx="25" cy="19" rx="2.2" ry="3"/><ellipse class="hw-rasgo" cx="20" cy="27" rx="1.8" ry="2.4" opacity=".75"/></svg>`;

  const ARANA = `<svg viewBox="0 0 24 26"><path class="hw-patas" d="M9 12L4.5 8L2 10.5M8.5 14L3.5 13L1 15.5M8.5 16.5L4 18.5L2.5 22M9.5 18.5L6.5 22L6 25M15 12L19.5 8L22 10.5M15.5 14L20.5 13L23 15.5M15.5 16.5L20 18.5L21.5 22M14.5 18.5L17.5 22L18 25"/><ellipse class="hw-cuerpo" cx="12" cy="15.5" rx="4.2" ry="5.2"/><circle class="hw-cuerpo" cx="12" cy="8" r="3"/><circle class="hw-ojo" cx="10.9" cy="8.3" r=".75"/><circle class="hw-ojo" cx="13.1" cy="8.3" r=".75"/></svg>`;

  // Tela de esquina: radios que salen del vértice y anillos que se comban
  // hacia él. Se dibuja una vez para la izquierda; la derecha es su espejo.
  const tela = () => {
    const ANGULOS = [0, 14, 29, 45, 61, 76, 90];
    const ANILLOS = [20, 41, 64, 90, 119, 150];
    const pt = (r, a) => {
      const rad = a * Math.PI / 180;
      return `${(r * Math.cos(rad)).toFixed(1)} ${(r * Math.sin(rad)).toFixed(1)}`;
    };
    let d = ANGULOS.map(a => `M0 0L${pt(170, a)}`).join("");
    ANILLOS.forEach((r, i) => {
      for (let j = 0; j < ANGULOS.length - 1; j++) {
        // Un tramo roto para que no parezca de plantilla.
        if (i === ANILLOS.length - 2 && j === 3) continue;
        const medio = (ANGULOS[j] + ANGULOS[j + 1]) / 2;
        d += `M${pt(r, ANGULOS[j])}Q${pt(r * 0.86, medio)} ${pt(r, ANGULOS[j + 1])}`;
      }
    });
    d += `M${pt(119, 45)}q3 9 -1 17`; // hebra suelta que cuelga del tramo roto
    return `<svg viewBox="0 0 170 170"><path d="${d}"/></svg>`;
  };

  const soloEscritorio = p => (p.soloEscritorio ? " hw-solo-escritorio" : "");

  const murcielagos = MURCIELAGOS.map(m => `
    <span class="hw-murcielago hw-ruta-${m.ruta}${soloEscritorio(m)}"
      style="--t:${m.t}px;--d:${m.d}s;--r:${m.r}s;--a:${m.a}s;--b:${m.b}s;top:${m.y}vh;opacity:${m.o}">
      <span class="hw-bamboleo">${MURCIELAGO}</span>
    </span>`).join("");

  const fantasmas = FANTASMAS.map(f => `
    <span class="hw-fantasma${soloEscritorio(f)}"
      style="--t:${f.t}px;--d:${f.d}s;--r:${f.r}s;--b:${f.b}s;left:${f.x}vw">
      <span class="hw-vaiven">${FANTASMA}</span>
    </span>`).join("");

  const css = `
    .hw-capa {
      --hw-sombra: var(--noir, #0C0C0C);
      --hw-luz: var(--ivory, #F5F1EA);
      --hw-bronce: var(--bronze, #C29E66);
      --hw-calabaza: #F0822D;
      --hw-tela: clamp(88px, 13vw, 180px);
      --hw-hilo: clamp(110px, 26vh, 260px);
      --hw-escala: 1;

      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      /* 100vw incluye la barra de scroll en escritorio; el tope en 100% evita
         que la capa quede unos píxeles más ancha que el viewport. */
      max-width: 100%;
      overflow: hidden;
      /* Encima del contenido, debajo del nav (50), del menú móvil (49) y de
         los botones flotantes (9998+). */
      z-index: 45;
      contain: strict;
      pointer-events: none;
      user-select: none;
    }
    .hw-capa * { pointer-events: none !important; }
    .hw-capa > * { position: absolute; }
    .hw-capa svg { display: block; width: 100%; height: auto; overflow: visible; }

    /* Telarañas */
    .hw-tela {
      top: 0;
      width: var(--hw-tela);
      height: var(--hw-tela);
      opacity: .5;
    }
    .hw-tela--izq { left: 0; }
    .hw-tela--der { right: 0; transform: scaleX(-1); }
    .hw-tela svg {
      height: 100%;
      transform-origin: 0 0;
      animation: hw-brisa 6s ease-in-out infinite alternate;
    }
    .hw-tela--der svg { animation-duration: 7.5s; animation-delay: -2s; }
    .hw-tela path {
      fill: none;
      stroke: var(--hw-bronce);
      stroke-width: 1;
      stroke-linecap: round;
      vector-effect: non-scaling-stroke;
    }

    /* Araña: cuelga de la tela derecha. El hilo se estira con scaleY y el
       cuerpo baja con translateY en el mismo ritmo, así la punta del hilo y la
       araña siempre coinciden sin animar height. */
    .hw-arana {
      top: calc(var(--hw-tela) * .28);
      right: calc(var(--hw-tela) * .28 - 9px);
      width: 18px;
      height: var(--hw-hilo);
      transform-origin: 50% 0;
      animation: hw-pendulo 5.5s ease-in-out infinite alternate;
    }
    .hw-hilo, .hw-descenso {
      position: absolute;
      top: 0;
      height: 100%;
      animation: 16s ease-in-out 3s infinite both;
    }
    .hw-hilo {
      left: calc(50% - .5px);
      width: 1px;
      background: var(--hw-bronce);
      opacity: .7;
      transform-origin: 50% 0;
      animation-name: hw-hilo;
    }
    .hw-descenso { left: 0; width: 100%; animation-name: hw-descenso; }
    .hw-descenso svg { position: absolute; top: 100%; left: 0; margin-top: -4px; }
    .hw-arana .hw-patas {
      fill: none;
      stroke: var(--hw-bronce);
      stroke-width: 1.3;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .hw-arana .hw-cuerpo { fill: var(--hw-sombra); stroke: var(--hw-bronce); stroke-width: .8; }
    .hw-arana .hw-ojo { fill: var(--hw-calabaza); }

    /* Murciélagos: la ruta mueve, el bamboleo ondula la trayectoria y el
       aleteo comprime las alas. Tres capas, una transformación cada una. */
    .hw-murcielago {
      left: 0;
      width: calc(var(--t) * var(--hw-escala));
      will-change: transform;
    }
    .hw-ruta-a { animation: hw-ruta-a var(--d) linear var(--r) infinite both; }
    .hw-ruta-b { animation: hw-ruta-b var(--d) linear var(--r) infinite both; }
    .hw-ruta-c { animation: hw-ruta-c var(--d) linear var(--r) infinite both; }
    .hw-bamboleo {
      display: block;
      animation: hw-bamboleo var(--b) ease-in-out infinite alternate;
    }
    .hw-aleteo {
      transform-origin: 50% 40%;
      animation: hw-aleteo var(--a) ease-in-out infinite alternate;
    }
    .hw-aleteo path {
      fill: var(--hw-sombra);
      /* Contorno bronce: sin él, el murciélago desaparece sobre las
         secciones oscuras del sitio. */
      stroke: var(--hw-bronce);
      stroke-opacity: .7;
      stroke-width: 1;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }

    /* Fantasmas: suben desde abajo, se desvanecen a media pantalla y
       esperan su siguiente turno. */
    .hw-fantasma {
      top: 0;
      width: calc(var(--t) * var(--hw-escala));
      will-change: transform, opacity;
      animation: hw-subida var(--d) cubic-bezier(.25, .1, .25, 1) var(--r) infinite both;
    }
    .hw-vaiven {
      display: block;
      animation: hw-vaiven var(--b) ease-in-out infinite alternate;
    }
    .hw-fantasma .hw-cuerpo {
      fill: var(--hw-luz);
      stroke: var(--hw-bronce);
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
    }
    .hw-fantasma .hw-rasgo { fill: var(--hw-sombra); }

    @keyframes hw-brisa {
      from { transform: scale(1, 1); }
      to   { transform: scale(1.03, 1.02); }
    }
    @keyframes hw-pendulo {
      from { transform: rotate(-3deg); }
      to   { transform: rotate(3deg); }
    }
    @keyframes hw-hilo {
      0%, 100% { transform: scaleY(.08); }
      40%, 62% { transform: scaleY(1); }
    }
    /* -92% = -(1 - .08): deja la araña justo en la punta del hilo. */
    @keyframes hw-descenso {
      0%, 100% { transform: translate3d(0, -92%, 0); }
      40%, 62% { transform: translate3d(0, 0, 0); }
    }
    @keyframes hw-ruta-a {
      0%        { transform: translate3d(-14vw, 92vh, 0) rotate(-14deg); }
      38%, 100% { transform: translate3d(108vw, 6vh, 0) rotate(-18deg); }
    }
    @keyframes hw-ruta-b {
      0%        { transform: translate3d(106vw, 58vh, 0) rotate(10deg); }
      40%, 100% { transform: translate3d(-16vw, 14vh, 0) rotate(14deg); }
    }
    @keyframes hw-ruta-c {
      0%        { transform: translate3d(-12vw, 16vh, 0) rotate(8deg); }
      42%, 100% { transform: translate3d(106vw, 64vh, 0) rotate(12deg); }
    }
    @keyframes hw-bamboleo {
      from { transform: translate3d(0, -10px, 0); }
      to   { transform: translate3d(0, 10px, 0); }
    }
    @keyframes hw-aleteo {
      from { transform: scale(1, 1); }
      to   { transform: scale(.86, .28); }
    }
    @keyframes hw-subida {
      0%        { transform: translate3d(0, 105vh, 0); opacity: 0; }
      8%        { opacity: .9; }
      38%       { opacity: .9; }
      48%, 100% { transform: translate3d(0, 22vh, 0); opacity: 0; }
    }
    @keyframes hw-vaiven {
      from { transform: translate3d(-10px, 0, 0) rotate(-6deg); }
      to   { transform: translate3d(10px, 0, 0) rotate(6deg); }
    }

    @media (max-width: 640px) {
      .hw-capa {
        --hw-tela: 92px;
        --hw-hilo: 22vh;
        --hw-escala: .78;
      }
      .hw-solo-escritorio { display: none; }
    }

    /* Sin movimiento: quedan las telas y la araña colgando quietas. */
    @media (prefers-reduced-motion: reduce) {
      .hw-capa *, .hw-capa *::before, .hw-capa *::after { animation: none !important; }
      .hw-murcielago, .hw-fantasma { display: none; }
    }

    @media print {
      .hw-capa { display: none; }
    }
  `;

  const estilos = document.createElement("style");
  estilos.id = "hw-estilos";
  estilos.textContent = css;
  document.head.appendChild(estilos);

  const capa = document.createElement("div");
  capa.id = "hw-capa";
  capa.className = "hw-capa";
  capa.setAttribute("aria-hidden", "true");
  capa.innerHTML = `
    <div class="hw-tela hw-tela--izq">${tela()}</div>
    <div class="hw-tela hw-tela--der">${tela()}</div>
    <div class="hw-arana">
      <span class="hw-hilo"></span>
      <span class="hw-descenso">${ARANA}</span>
    </div>
    ${murcielagos}
    ${fantasmas}
  `;
  document.body.appendChild(capa);
})();
