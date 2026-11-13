// Capa decorativa de Navidad: nieve, guirnaldas con esferas, un muñeco de
// nieve que se asoma, regalos que caen y un trineo que cruza de vez en cuando.
// Igual que halloween.js: se carga suelta (sin React ni Babel), solo inyecta
// marcado y CSS, anima con @keyframes sobre transform y opacity y no bloquea
// ningún clic (pointer-events: none en la capa y en cada pieza).
//
// Paleta de la marca: noir, marfil y bronce, con un único acento cálido (ámbar)
// en las luces. Todas las piezas, claras u oscuras, llevan contorno bronce, así
// se ven tanto en las secciones marfil como en las negras.
//
// Este archivo solo pinta. Cuándo se muestra lo decide temas/cargador.js con
// los datos de temas/catalogo.js.
(() => {
  if (document.getElementById("nv-capa")) return;

  // Nieve en tres profundidades: los copos lejanos son pequeños, tenues y
  // lentos; los cercanos, grandes y rápidos. x: columna en vw. t: ancho en px.
  // d: duración de la caída. f: fase inicial (0 a 1) para que al cargar ya haya
  // copos repartidos por la pantalla. v: amplitud del vaivén en px. b: ritmo
  // del vaivén. g: duración de un giro completo (negativo gira al revés).
  // k: forma del cristal (0 o 1).
  const COPOS = [
    // lejanos
    { x: 6,  t: 9,  d: 28, f: .10, v: 10, b: 4.2, g: 22,  o: .5,  k: 1 },
    { x: 23, t: 10, d: 30, f: .55, v: 12, b: 4.8, g: -26, o: .5,  k: 0, soloEscritorio: true },
    { x: 41, t: 9,  d: 27, f: .82, v: 9,  b: 4.0, g: 24,  o: .45, k: 1 },
    { x: 58, t: 11, d: 29, f: .30, v: 11, b: 4.6, g: -20, o: .5,  k: 0, soloEscritorio: true },
    { x: 77, t: 9,  d: 31, f: .68, v: 10, b: 4.4, g: 28,  o: .45, k: 1, soloEscritorio: true },
    { x: 94, t: 10, d: 28, f: .20, v: 12, b: 5.0, g: -24, o: .5,  k: 0 },
    // medios
    { x: 13, t: 15, d: 20, f: .40, v: 18, b: 3.4, g: -16, o: .75, k: 0 },
    { x: 32, t: 14, d: 19, f: .05, v: 16, b: 3.0, g: 18,  o: .7,  k: 1, soloEscritorio: true },
    { x: 50, t: 16, d: 21, f: .62, v: 20, b: 3.6, g: -14, o: .75, k: 0, soloEscritorio: true },
    { x: 68, t: 14, d: 18, f: .90, v: 16, b: 3.2, g: 16,  o: .7,  k: 1 },
    { x: 86, t: 15, d: 20, f: .35, v: 18, b: 3.8, g: -18, o: .75, k: 0, soloEscritorio: true },
    // cercanos
    { x: 3,  t: 22, d: 14, f: .72, v: 26, b: 2.8, g: 12,  o: .95, k: 1, soloEscritorio: true },
    { x: 19, t: 21, d: 15, f: .25, v: 24, b: 2.6, g: -11, o: .9,  k: 0 },
    { x: 37, t: 20, d: 13, f: .48, v: 22, b: 3.0, g: 13,  o: .9,  k: 1, soloEscritorio: true },
    { x: 63, t: 23, d: 15, f: .15, v: 28, b: 2.7, g: -12, o: .95, k: 0 },
    { x: 81, t: 21, d: 14, f: .58, v: 24, b: 2.9, g: 10,  o: .9,  k: 1 },
    { x: 46, t: 20, d: 16, f: .95, v: 22, b: 2.5, g: -13, o: .85, k: 0, soloEscritorio: true },
    { x: 97, t: 22, d: 13, f: .45, v: 20, b: 2.8, g: 11,  o: .9,  k: 1 },
  ];

  // Caen pegados a los márgenes para no tapar el contenido. v: estilo de caja.
  const REGALOS = [
    { x: 4,  t: 34, d: 30, r: 9,  b: 3.4, v: 0 },
    { x: 90, t: 28, d: 34, r: 20, b: 2.8, v: 1 },
    { x: 73, t: 24, d: 38, r: 31, b: 3.8, v: 2, soloEscritorio: true },
  ];

  const pt = (cx, cy, r, grados) => {
    const rad = grados * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const f1 = n => n.toFixed(1);

  // Cristal de seis brazos con dos pares de ramas por brazo. La forma 1 lleva
  // las ramas más abiertas y más cerca del centro.
  const copo = k => {
    const [r1, l1, r2, l2, abre] = k ? [4.5, 4, 8, 2.4, 50] : [6, 3.4, 8.6, 2, 38];
    let d = "";
    for (let i = 0; i < 6; i++) {
      const a = i * 60 - 90;
      const [x, y] = pt(0, 0, 11, a);
      d += `M0 0L${f1(x)} ${f1(y)}`;
      [[r1, l1], [r2, l2]].forEach(([r, l]) => {
        const [bx, by] = pt(0, 0, r, a);
        [-abre, abre].forEach(giro => {
          const [ex, ey] = pt(bx, by, l, a + giro);
          d += `M${f1(bx)} ${f1(by)}L${f1(ex)} ${f1(ey)}`;
        });
      });
    }
    return `<svg viewBox="-12 -12 24 24"><path class="nv-halo" d="${d}"/><path class="nv-trazo" d="${d}"/></svg>`;
  };
  const CRISTALES = [copo(0), copo(1)];

  // Guirnalda de esquina: un cable que cuelga en curva desde la esquina, con
  // focos que titilan y dos esferas colgando de hilos. La curva es una
  // cuadrática de (0,0) a (320,0) con control en (160,240), así que en el
  // punto t queda en x = 320t, y = 480t(1 - t). Se dibuja para la izquierda;
  // la derecha es su espejo.
  const guirnalda = () => {
    const enCurva = t => [320 * t, 480 * t * (1 - t)];
    // Huecos en .34 y .62, donde cuelgan las esferas.
    const focos = [.06, .15, .24, .43, .52, .71, .8, .89].map((t, i) => {
      const [x, y] = enCurva(t);
      // Ritmos y desfases distintos para que no titilen en coro.
      const ritmo = [2.6, 3.4, 2.9, 3.8][i % 4];
      return `<g class="nv-foco" style="animation-duration:${ritmo}s;animation-delay:-${f1(i * .7)}s">
        <circle class="nv-brillo" cx="${f1(x)}" cy="${f1(y + 7)}" r="8"/>
        <rect class="nv-casquillo" x="${f1(x - 1.7)}" y="${f1(y)}" width="3.4" height="3.2" rx=".6"/>
        <ellipse class="nv-bombillo" cx="${f1(x)}" cy="${f1(y + 7)}" rx="2.7" ry="4"/>
      </g>`;
    }).join("");

    const esfera = (t, largo, r, estilo) => {
      const [x, y] = enCurva(t);
      const cy = y + largo + 3.4 + r;
      return `<g class="nv-esfera nv-esfera--${estilo}">
        <path class="nv-hilo" d="M${f1(x)} ${f1(y)}V${f1(y + largo)}"/>
        <rect class="nv-tapa" x="${f1(x - 2.6)}" y="${f1(y + largo)}" width="5.2" height="3.6" rx=".8"/>
        <circle class="nv-bola" cx="${f1(x)}" cy="${f1(cy)}" r="${r}"/>
        <ellipse class="nv-reflejo" cx="${f1(x - r * .38)}" cy="${f1(cy - r * .38)}" rx="${f1(r * .2)}" ry="${f1(r * .32)}" transform="rotate(35 ${f1(x - r * .38)} ${f1(cy - r * .38)})"/>
      </g>`;
    };

    return `<svg viewBox="0 0 320 230">
      <path class="nv-cable" d="M0 0Q160 240 320 0"/>
      ${esfera(.34, 34, 10, "noir")}
      ${esfera(.62, 58, 8, "bronce")}
      ${focos}
    </svg>`;
  };

  const MUNECO = `<svg viewBox="0 0 60 92">
    <path class="nv-rama" d="M10 62L-6 51M-1 54.5L-4 46"/>
    <g class="nv-brazo"><path class="nv-rama" d="M50 62L65 47M60.5 51.5L67 50.5M58 54L59.5 46"/></g>
    <circle class="nv-nieve" cx="30" cy="68" r="22"/>
    <circle class="nv-nieve" cx="30" cy="34" r="12"/>
    <circle class="nv-carbon" cx="30" cy="60" r="1.8"/>
    <circle class="nv-carbon" cx="30" cy="68" r="1.8"/>
    <circle class="nv-carbon" cx="30" cy="76" r="1.8"/>
    <circle class="nv-carbon" cx="26" cy="31" r="1.6"/>
    <circle class="nv-carbon" cx="34" cy="31" r="1.6"/>
    <circle class="nv-carbon" cx="25" cy="39.3" r=".9"/>
    <circle class="nv-carbon" cx="28" cy="40.8" r=".9"/>
    <circle class="nv-carbon" cx="32" cy="40.8" r=".9"/>
    <circle class="nv-carbon" cx="35" cy="39.3" r=".9"/>
    <path class="nv-zanahoria" d="M30 34.2L40.5 36.4L30 37.6Z"/>
    <g class="nv-bufanda"><path class="nv-tela" d="M35 47.5L39.5 62L34.5 61.2L32.2 48.5Z"/></g>
    <path class="nv-tela" d="M18.5 43.5Q30 49.5 41.5 43.5L42 47.6Q30 53.6 18 47.6Z"/>
    <rect class="nv-copa" x="19" y="4" width="22" height="17" rx="1.5"/>
    <rect class="nv-cinta-sombrero" x="19" y="15" width="22" height="3"/>
    <rect class="nv-copa" x="14" y="20" width="32" height="3.6" rx="1"/>
  </svg>`;

  const REGALO = `<svg viewBox="0 0 40 44">
    <rect class="nv-caja" x="5" y="18" width="30" height="24" rx="1.5"/>
    <rect class="nv-caja" x="3" y="12" width="34" height="7" rx="1.5"/>
    <rect class="nv-cinta" x="18" y="12" width="4" height="30"/>
    <path class="nv-cinta nv-lazo" d="M20 12C13 3 5 7 11 11.5C14 12.5 17 12.5 20 12ZM20 12C27 3 35 7 29 11.5C26 12.5 23 12.5 20 12Z"/>
    <circle class="nv-cinta" cx="20" cy="12" r="2.2"/>
  </svg>`;

  // Reno visto de lado, mirando a la derecha. Las patas van en dos grupos que
  // se mueven a contratiempo para el galope.
  const reno = (x, y) => `<g transform="translate(${x} ${y})">
    <path class="nv-cuerno" d="M30 2L27 -5M28.3 -1.8L24.5 -3M27.6 -3.4L28.6 -7M32 2.2L33.2 -5M32.7 -2L35.6 -3.6"/>
    <g class="nv-patas nv-patas--del"><path d="M24 20L27 28M22 20L23.5 28"/></g>
    <g class="nv-patas nv-patas--tras"><path d="M9 20L6 28M11 20L12.5 28"/></g>
    <path class="nv-silueta" d="M5 13.5L1.5 11.5"/>
    <ellipse class="nv-silueta" cx="16" cy="16" rx="11" ry="5.5"/>
    <path class="nv-silueta" d="M23.5 12.5L30 3.5L33 5L28.5 15.5Z"/>
    <ellipse class="nv-silueta" cx="33.5" cy="4.6" rx="4.6" ry="2.6"/>
  </g>`;

  const chispa = (x, y, r, i) =>
    `<path class="nv-chispa" style="animation-delay:-${f1(i * .35)}s" d="M${x} ${y - r}L${f1(x + r * .28)} ${f1(y - r * .28)}L${x + r} ${y}L${f1(x + r * .28)} ${f1(y + r * .28)}L${x} ${y + r}L${f1(x - r * .28)} ${f1(y + r * .28)}L${x - r} ${y}L${f1(x - r * .28)} ${f1(y - r * .28)}Z"/>`;

  const TRINEO = `<svg viewBox="0 0 160 52">
    ${chispa(-4, 32, 3.2, 0)}${chispa(-15, 27, 2.6, 1)}${chispa(-25, 35, 2.2, 2)}${chispa(-36, 29, 1.7, 3)}
    <path class="nv-rienda" d="M57 22Q76 31 94 27M94 27Q118 31 140 23"/>
    <path class="nv-patin" d="M2 44H52C58 44 61 41 61 37M18 37V44M42 37V44"/>
    <path class="nv-saco" d="M15 23C13 14 18 8.5 24 9.5C30 8.5 33.5 15 30.5 23Z"/>
    <path class="nv-silueta" d="M8 20C4 20 3 25 6 30C9 35 14 37 22 37H46C53 37 57 32 58 24V19C54 22 50 23 45 23H20C17 23 15 17 10 17C8 17 7 18 8 20Z"/>
    ${reno(68, 13)}
    ${reno(112, 9)}
  </svg>`;

  const soloEscritorio = p => (p.soloEscritorio ? " nv-solo-escritorio" : "");

  const copos = COPOS.map(c => `
    <span class="nv-copo${soloEscritorio(c)}"
      style="--t:${c.t}px;--d:${c.d}s;--r:-${f1(c.f * c.d)}s;--v:${c.v}px;--b:${c.b}s;--g:${Math.abs(c.g)}s;--sentido:${c.g < 0 ? "reverse" : "normal"};left:${c.x}vw;opacity:${c.o}">
      <span class="nv-deriva">${CRISTALES[c.k]}</span>
    </span>`).join("");

  const regalos = REGALOS.map(g => `
    <span class="nv-regalo nv-regalo--${g.v}${soloEscritorio(g)}"
      style="--t:${g.t}px;--d:${g.d}s;--r:${g.r}s;--b:${g.b}s;left:${g.x}vw">
      <span class="nv-balanceo">${REGALO}</span>
    </span>`).join("");

  const css = `
    .nv-capa {
      --nv-noir: var(--noir, #0C0C0C);
      --nv-marfil: var(--ivory, #F5F1EA);
      --nv-bronce: var(--bronze, #C29E66);
      --nv-ambar: #F7C66A;
      --nv-guirnalda: clamp(170px, 24vw, 330px);
      --nv-escala: 1;

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
    .nv-capa * { pointer-events: none !important; }
    .nv-capa > * { position: absolute; }
    .nv-capa svg { display: block; width: 100%; height: auto; overflow: visible; }

    /* Guirnaldas de esquina */
    .nv-guirnalda { top: 0; width: var(--nv-guirnalda); }
    .nv-guirnalda--izq { left: 0; }
    .nv-guirnalda--der { right: 0; transform: scaleX(-1); }
    .nv-cable {
      fill: none;
      stroke: var(--nv-bronce);
      stroke-width: 1.2;
      stroke-linecap: round;
      opacity: .85;
    }
    .nv-casquillo { fill: var(--nv-bronce); }
    .nv-bombillo { fill: var(--nv-ambar); stroke: var(--nv-bronce); stroke-width: .5; }
    .nv-brillo { fill: var(--nv-ambar); opacity: .28; }
    .nv-foco { animation: nv-titilar 3s ease-in-out infinite alternate; }

    /* Esferas: el grupo gira desde la punta del hilo (borde superior de su
       caja, que es el punto donde cuelga del cable). */
    .nv-esfera {
      transform-box: fill-box;
      transform-origin: 50% 0;
      animation: nv-pendulo 4.6s ease-in-out infinite alternate;
    }
    .nv-esfera--bronce { animation-duration: 5.8s; animation-delay: -1.8s; }
    .nv-guirnalda--der .nv-esfera { animation-delay: -2.6s; }
    .nv-guirnalda--der .nv-esfera--bronce { animation-delay: -.9s; }
    .nv-hilo { fill: none; stroke: var(--nv-bronce); stroke-width: .8; opacity: .8; }
    .nv-tapa { fill: var(--nv-bronce); }
    .nv-esfera--noir .nv-bola { fill: var(--nv-noir); stroke: var(--nv-bronce); stroke-width: 1; }
    .nv-esfera--bronce .nv-bola { fill: var(--nv-bronce); stroke: var(--nv-noir); stroke-width: .6; }
    .nv-reflejo { fill: var(--nv-marfil); opacity: .75; }

    /* Nieve: la caída mueve, la deriva mece de lado y el cristal gira. Tres
       capas, una transformación cada una. */
    .nv-copo {
      top: 0;
      width: calc(var(--t) * var(--nv-escala));
      will-change: transform;
      animation: nv-caida var(--d) linear var(--r) infinite;
    }
    .nv-deriva {
      display: block;
      animation: nv-deriva var(--b) ease-in-out infinite alternate;
    }
    .nv-copo svg { animation: nv-giro var(--g) linear infinite var(--sentido); }
    .nv-copo path { fill: none; stroke-linecap: round; }
    /* Halo marfil para las secciones oscuras, trazo bronce para las claras. */
    .nv-halo { stroke: var(--nv-marfil); stroke-width: 3.2; opacity: .9; }
    .nv-trazo { stroke: var(--nv-bronce); stroke-width: 1.3; }

    /* Regalos: bajan por los márgenes meciéndose y se desvanecen antes de
       llegar al borde inferior, donde viven los botones flotantes. */
    .nv-regalo {
      top: 0;
      width: calc(var(--t) * var(--nv-escala));
      will-change: transform, opacity;
      animation: nv-regalo var(--d) linear var(--r) infinite both;
    }
    .nv-balanceo {
      display: block;
      animation: nv-balanceo var(--b) ease-in-out infinite alternate;
    }
    .nv-regalo--0 { --caja: var(--nv-noir);   --cinta: var(--nv-bronce); --borde: var(--nv-bronce); }
    .nv-regalo--1 { --caja: var(--nv-marfil); --cinta: var(--nv-bronce); --borde: var(--nv-bronce); }
    .nv-regalo--2 { --caja: var(--nv-bronce); --cinta: var(--nv-noir);   --borde: var(--nv-noir); }
    .nv-caja { fill: var(--caja); stroke: var(--borde); stroke-width: 1; }
    .nv-cinta { fill: var(--cinta); }
    .nv-lazo { stroke: var(--borde); stroke-width: .6; }

    /* Muñeco de nieve: se asoma por el borde izquierdo inclinándose desde
       su base, saluda con la rama y vuelve a esconderse. */
    .nv-muneco {
      left: 0;
      top: 56vh;
      width: calc(70px * var(--nv-escala));
      transform-origin: 0 100%;
      will-change: transform;
      animation: nv-asomo 26s cubic-bezier(.4, 0, .2, 1) 5s infinite both;
    }
    .nv-nieve { fill: var(--nv-marfil); stroke: var(--nv-bronce); stroke-width: 1; }
    .nv-carbon { fill: var(--nv-noir); }
    .nv-zanahoria { fill: var(--nv-bronce); }
    .nv-tela { fill: var(--nv-bronce); stroke: var(--nv-noir); stroke-width: .4; }
    .nv-copa { fill: var(--nv-noir); stroke: var(--nv-bronce); stroke-width: .8; }
    .nv-cinta-sombrero { fill: var(--nv-bronce); }
    .nv-rama {
      fill: none;
      stroke: var(--nv-bronce);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .nv-brazo {
      transform-box: fill-box;
      transform-origin: 0 100%;
      animation: nv-saludo .5s ease-in-out infinite alternate;
    }
    .nv-bufanda {
      transform-box: fill-box;
      transform-origin: 30% 0;
      animation: nv-ondear 1.6s ease-in-out infinite alternate;
    }

    /* Trineo: cruza en diagonal hacia arriba cada 48 s; el resto del ciclo
       espera fuera de pantalla. */
    .nv-trineo {
      left: 0;
      top: 0;
      width: calc(150px * var(--nv-escala));
      will-change: transform;
      animation: nv-vuelo 48s linear 12s infinite both;
    }
    .nv-galope {
      display: block;
      animation: nv-galope .9s ease-in-out infinite alternate;
    }
    .nv-trineo .nv-silueta {
      fill: var(--nv-noir);
      stroke: var(--nv-bronce);
      stroke-width: 1;
      stroke-linejoin: round;
    }
    .nv-saco { fill: var(--nv-bronce); stroke: var(--nv-noir); stroke-width: .6; }
    .nv-patin, .nv-cuerno, .nv-patas path {
      fill: none;
      stroke: var(--nv-bronce);
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .nv-rienda { fill: none; stroke: var(--nv-bronce); stroke-width: .8; opacity: .8; }
    .nv-patas {
      transform-box: fill-box;
      transform-origin: 50% 0;
      animation: nv-patas .45s ease-in-out infinite alternate;
    }
    .nv-patas--tras { animation-direction: alternate-reverse; }
    .nv-chispa {
      fill: var(--nv-ambar);
      transform-box: fill-box;
      transform-origin: 50% 50%;
      animation: nv-chispa 1.4s ease-in-out infinite alternate;
    }

    @keyframes nv-titilar {
      from { opacity: .45; }
      to   { opacity: 1; }
    }
    @keyframes nv-pendulo {
      from { transform: rotate(-5deg); }
      to   { transform: rotate(5deg); }
    }
    @keyframes nv-caida {
      from { transform: translate3d(0, -6vh, 0); }
      to   { transform: translate3d(0, 106vh, 0); }
    }
    @keyframes nv-deriva {
      from { transform: translate3d(calc(var(--v) * -1), 0, 0); }
      to   { transform: translate3d(var(--v), 0, 0); }
    }
    @keyframes nv-giro {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    @keyframes nv-regalo {
      0%        { transform: translate3d(0, -14vh, 0); opacity: 0; }
      4%        { opacity: 1; }
      34%       { opacity: 1; }
      44%, 100% { transform: translate3d(0, 82vh, 0); opacity: 0; }
    }
    @keyframes nv-balanceo {
      from { transform: rotate(-14deg); }
      to   { transform: rotate(14deg); }
    }
    @keyframes nv-asomo {
      0%        { transform: translate3d(-115%, 0, 0) rotate(0deg); }
      7%, 25%   { transform: translate3d(-34%, 0, 0) rotate(12deg); }
      32%, 100% { transform: translate3d(-115%, 0, 0) rotate(0deg); }
    }
    @keyframes nv-saludo {
      from { transform: rotate(6deg); }
      to   { transform: rotate(-22deg); }
    }
    @keyframes nv-ondear {
      from { transform: rotate(-4deg); }
      to   { transform: rotate(10deg); }
    }
    @keyframes nv-vuelo {
      0%        { transform: translate3d(-26vw, 48vh, 0) rotate(-9deg); }
      30%, 100% { transform: translate3d(108vw, 6vh, 0) rotate(-13deg); }
    }
    @keyframes nv-galope {
      from { transform: translate3d(0, -5px, 0); }
      to   { transform: translate3d(0, 5px, 0); }
    }
    @keyframes nv-patas {
      from { transform: rotate(-20deg); }
      to   { transform: rotate(20deg); }
    }
    @keyframes nv-chispa {
      from { opacity: .1; transform: scale(.6); }
      to   { opacity: 1;  transform: scale(1); }
    }

    @media (max-width: 640px) {
      .nv-capa {
        --nv-guirnalda: 46vw;
        --nv-escala: .78;
      }
      .nv-solo-escritorio { display: none; }
    }

    /* Sin movimiento: quedan las guirnaldas encendidas y quietas. */
    @media (prefers-reduced-motion: reduce) {
      .nv-capa *, .nv-capa *::before, .nv-capa *::after { animation: none !important; }
      .nv-copo, .nv-regalo, .nv-muneco, .nv-trineo { display: none; }
    }

    @media print {
      .nv-capa { display: none; }
    }
  `;

  const estilos = document.createElement("style");
  estilos.id = "nv-estilos";
  estilos.textContent = css;
  document.head.appendChild(estilos);

  const capa = document.createElement("div");
  capa.id = "nv-capa";
  capa.className = "nv-capa";
  capa.setAttribute("aria-hidden", "true");
  capa.innerHTML = `
    ${copos}
    <div class="nv-guirnalda nv-guirnalda--izq">${guirnalda()}</div>
    <div class="nv-guirnalda nv-guirnalda--der">${guirnalda()}</div>
    ${regalos}
    <div class="nv-muneco">${MUNECO}</div>
    <div class="nv-trineo"><span class="nv-galope">${TRINEO}</span></div>
  `;
  document.body.appendChild(capa);
})();
