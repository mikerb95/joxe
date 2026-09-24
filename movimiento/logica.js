// Lógica pura del motion del home: geometría del croquis, odómetro, fila
// activa de la ficha de servicios y día de la semana en Colombia. Nada de aquí
// toca el DOM, así que se prueba en Node (logica.test.js).
//
// Se carga como script suelto, igual que temas/catalogo.js: el sitio no tiene
// bundler, así que todo queda expuesto en window.JoxeMovimiento.
(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const suave = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const r1 = n => Math.round(n * 10) / 10;

  // Pseudoaleatorio con semilla (mulberry32): el croquis sale igual en cada
  // visita y en cada render, sin que las hebras "tiemblen" al redibujar.
  const semilla = s => () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // ------------------------------------------------------------------
  // CROQUIS: cabeza de perfil (mirando a la izquierda) en un lienzo de
  // 640 x 720. Todas las piezas salen de los mismos tramos, así el pelo
  // calza exacto sobre el cuero cabelludo que dibuja el perfil.
  // ------------------------------------------------------------------
  const ANCHO = 640;
  const ALTO = 720;

  // Cráneo: de la línea frontal del pelo (u = 0) a la nuca (u = 1).
  const CRANEO = [
    [[176, 200], [166, 150], [226, 102], [304, 102]],
    [[304, 102], [388, 102], [462, 164], [470, 256]],
    [[470, 256], [476, 306], [468, 348], [452, 376]],
    [[452, 376], [438, 404], [422, 426], [408, 446]],
  ];

  // Rostro: de la línea del pelo al cuello. Se guía por los tercios del
  // rostro (línea del pelo, cejas, base de la nariz, mentón) que el croquis
  // también dibuja, como en la asesoría de imagen.
  const ROSTRO = [
    [[176, 200], [170, 236], [158, 266], [160, 296]],   // frente
    [[160, 296], [160, 306], [168, 312], [170, 320]],   // ceja a raíz de la nariz
    [[170, 320], [160, 344], [132, 370], [124, 388]],   // dorso de la nariz
    [[124, 388], [120, 400], [140, 406], [152, 404]],   // punta y base
    [[152, 404], [156, 412], [146, 420], [146, 430]],   // labio superior
    [[146, 430], [146, 436], [152, 440], [156, 442]],
    [[156, 442], [152, 446], [148, 450], [150, 456]],   // labio inferior
    [[150, 456], [152, 464], [162, 468], [164, 476]],
    [[164, 476], [164, 486], [154, 494], [156, 506]],   // mentón
    [[156, 506], [158, 518], [170, 526], [186, 526]],
    [[186, 526], [214, 527], [248, 534], [264, 554]],   // mandíbula al cuello
    [[264, 554], [274, 590], [270, 660], [272, 720]],
  ];
  const NUCA = [[[408, 446], [396, 500], [400, 640], [404, 720]]];

  const OREJA = "M326 306C340 288 374 290 380 318C385 342 368 356 364 374" +
    "C360 394 346 404 334 396C328 392 330 384 334 380" +
    "M338 318C350 308 366 314 366 330C366 342 356 346 354 356";

  // Línea del pelo a los lados: de la patilla, por encima de la oreja, a la
  // nuca. Junto con el cráneo encierra la zona que se sombrea con hebras.
  const CONTORNO = [
    [176, 200], [206, 222], [240, 244], [276, 262], [300, 282], [304, 316],
    [302, 352], [314, 352], [320, 318], [330, 294], [352, 282], [376, 288],
    [390, 304], [394, 340], [398, 384], [404, 420], [408, 446],
  ];

  // Línea de degradado: debajo de ella el pelo va casi al ras.
  const DEGRADADO = [[[290, 262], [330, 240], [406, 236], [438, 286]],
    [[438, 286], [452, 310], [456, 340], [458, 356]]];

  // Tercios del rostro: línea del pelo, cejas, base de la nariz, mentón.
  const TERCIOS = [200, 298, 404, 518];

  const bez = ([p0, p1, p2, p3], t) => {
    const m = 1 - t;
    const a = m * m * m, b = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
  };

  // Muestrea una cadena de cúbicas en n puntos repartidos por longitud de
  // arco, con su normal hacia fuera (a la izquierda del avance en pantalla,
  // que en el cráneo recorrido de frente a nuca apunta fuera de la cabeza).
  const muestrear = (tramos, n) => {
    const fino = [];
    tramos.forEach((s, i) => {
      for (let k = i ? 1 : 0; k <= 40; k++) fino.push(bez(s, k / 40));
    });
    const acum = [0];
    for (let i = 1; i < fino.length; i++) {
      acum.push(acum[i - 1] + Math.hypot(fino[i][0] - fino[i - 1][0], fino[i][1] - fino[i - 1][1]));
    }
    const total = acum[acum.length - 1];
    const pts = [];
    let j = 0;
    for (let i = 0; i < n; i++) {
      const objetivo = (i / (n - 1)) * total;
      while (j < acum.length - 2 && acum[j + 1] < objetivo) j++;
      const t = (objetivo - acum[j]) / (acum[j + 1] - acum[j] || 1);
      pts.push([lerp(fino[j][0], fino[j + 1][0], t), lerp(fino[j][1], fino[j + 1][1], t)]);
    }
    return pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      return { x: p[0], y: p[1], u: i / (n - 1), tx: dx / l, ty: dy / l, nx: dy / l, ny: -dx / l };
    });
  };

  const cadena = tramos => tramos.map((s, i) =>
    (i ? "" : `M${s[0][0]} ${s[0][1]}`) +
    `C${s[1][0]} ${s[1][1]} ${s[2][0]} ${s[2][1]} ${s[3][0]} ${s[3][1]}`).join("");

  // Curva suave que pasa por los puntos (Catmull-Rom convertida a cúbicas).
  const curvaPor = pts => {
    let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ` +
        `${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
    }
    return d;
  };

  const CUERO = muestrear(CRANEO, 90);
  const LINEA_DEG = muestrear(DEGRADADO, 60);

  // y de la línea de degradado en una x dada (fuera de su tramo se prolonga
  // plana). La línea es casi horizontal hasta la parte trasera, donde baja.
  const yDegradado = x => {
    const L = LINEA_DEG;
    if (x <= L[0].x) return L[0].y;
    for (let i = 1; i < L.length; i++) {
      if (L[i].x >= x) {
        const t = (x - L[i - 1].x) / (L[i].x - L[i - 1].x || 1);
        return lerp(L[i - 1].y, L[i].y, t);
      }
    }
    return L[L.length - 1].y + (x - L[L.length - 1].x) * 4;
  };

  // Punto del cráneo donde la línea de degradado lo corta por detrás: de ahí
  // hacia la nuca el pelo va al ras.
  const U_DEGRADADO = (() => {
    const p = CUERO.find(q => q.u > 0.5 && q.y > yDegradado(q.x));
    return p ? p.u : 0.8;
  })();

  // Pivote de la elevación: en la parte trasera de la coronilla.
  const U_PIVOTE = 0.6;

  const gauss = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));

  // Grosor del pelo sobre el cráneo según la elevación (0 a 90 grados).
  // A 0° el peso se acumula abajo, justo encima del degradado; a 90° las capas
  // quedan parejas y la forma sigue la cabeza. Es la idea de graduación que se
  // enseña con cualquier croquis de corte, simplificada para que se lea sola.
  const grosorPelo = (u, grados) => {
    const k = clamp(grados, 0, 90) / 90;
    // Arriba: textura fija, un poco más larga hacia el frente. En la línea
    // del pelo nace casi en cero para que el flequillo no termine en un
    // corte recto de casco.
    const arriba = lerp(4, 38, suave(0, 0.09, u)) - 8 * suave(0.16, 0.42, u);
    const base = lerp(arriba, 18, suave(0.38, 0.62, u));
    const centro = lerp(U_DEGRADADO - 0.08, 0.48, k);
    const peso = 22 * Math.pow(1 - k, 1.15) * gauss(u, centro, 0.08);
    const capas = 6 * k * suave(0.3, 0.55, u);
    // Textura: el borde de arriba no es liso, como un pelo texturizado.
    const textura = (1 - suave(0.4, 0.55, u)) * suave(0.03, 0.1, u) *
      (1.1 * Math.sin(u * 83) + 0.9 * Math.sin(u * 197 + 1.3) + 0.6 * Math.sin(u * 331 + 0.4));
    const g = base + peso + capas + textura;
    // El degradado corta todo por debajo de su línea.
    return 1.2 + (g - 1.2) * (1 - suave(U_DEGRADADO - 0.075, U_DEGRADADO + 0.015, u));
  };

  // Mechones sobre la franja del pelo que sobresale del cráneo: trazos
  // cortos peinados hacia atrás, para que la franja se lea como pelo y no
  // como un relleno liso.
  const mechones = (grados, s = 11) => {
    const rnd = semilla(s);
    let d = "";
    CUERO.forEach((p, i) => {
      if (i % 2 || p.u < 0.04 || p.u > U_DEGRADADO - 0.02) return;
      const g = grosorPelo(p.u, grados);
      if (g < 6) return;
      for (let k = 0; k < 2; k++) {
        const f = 0.25 + rnd() * 0.6;
        const x = p.x + p.nx * g * f, y = p.y + p.ny * g * f;
        const largo = 5 + rnd() * 7;
        // Casi a lo largo del cráneo, con una leve inclinación hacia fuera.
        const dx = p.tx * 0.94 + p.nx * 0.34, dy = p.ty * 0.94 + p.ny * 0.34;
        d += `M${r1(x)} ${r1(y)}l${r1(dx * largo)} ${r1(dy * largo)}`;
      }
    });
    return d;
  };

  // Silueta del pelo: borde exterior (cráneo desplazado por el grosor) y
  // vuelta por el cráneo para cerrar la forma.
  const siluetaPelo = grados => {
    const fuera = CUERO.map(p => {
      const g = grosorPelo(p.u, grados);
      return [p.x + p.nx * g, p.y + p.ny * g];
    });
    const dentro = CUERO.slice().reverse().map(p => [p.x, p.y]);
    return {
      borde: curvaPor(fuera),
      forma: curvaPor(fuera) + "L" + dentro.map(p => `${r1(p[0])} ${r1(p[1])}`).join("L") + "Z",
    };
  };

  // Dónde queda la línea de peso (el punto más grueso de la parte trasera).
  const puntoPeso = grados => {
    let mejor = null;
    CUERO.forEach(p => {
      if (p.u < 0.42 || p.u > U_DEGRADADO) return;
      const g = grosorPelo(p.u, grados);
      if (!mejor || g > mejor.g) mejor = { g, p };
    });
    const { g, p } = mejor;
    return { x: r1(p.x + p.nx * g), y: r1(p.y + p.ny * g), u: p.u };
  };

  const puntoCuero = u => CUERO[Math.round(clamp(u, 0, 1) * (CUERO.length - 1))];

  // Línea guía de la elevación: sale del pivote formando `grados` con la
  // tangente del cráneo (0° = peinado hacia abajo, pegado a la cabeza; 90° =
  // perpendicular a ella).
  const guia = (grados, largo = 150, radio = 44) => {
    const p = puntoCuero(U_PIVOTE);
    const a = (clamp(grados, 0, 90) * Math.PI) / 180;
    const dir = [Math.cos(a) * p.tx + Math.sin(a) * p.nx, Math.cos(a) * p.ty + Math.sin(a) * p.ny];
    const mitad = a / 2;
    const bis = [Math.cos(mitad) * p.tx + Math.sin(mitad) * p.nx, Math.cos(mitad) * p.ty + Math.sin(mitad) * p.ny];
    const ini = [p.x + p.tx * radio, p.y + p.ty * radio];
    const fin = [p.x + dir[0] * radio, p.y + dir[1] * radio];
    return {
      x: r1(p.x), y: r1(p.y),
      x2: r1(p.x + dir[0] * largo), y2: r1(p.y + dir[1] * largo),
      rx2: r1(p.x + p.tx * largo * 0.8), ry2: r1(p.y + p.ty * largo * 0.8),
      // De la tangente hacia la normal el giro va en sentido antihorario.
      arco: `M${r1(ini[0])} ${r1(ini[1])}A${radio} ${radio} 0 0 0 ${r1(fin[0])} ${r1(fin[1])}`,
      tx: r1(p.x + bis[0] * (radio + 26)), ty: r1(p.y + bis[1] * (radio + 26)),
    };
  };

  // Ángulo que marca el cursor respecto al pivote, ya recortado a 0-90°.
  const anguloDesde = (x, y) => {
    const p = puntoCuero(U_PIVOTE);
    const vx = x - p.x, vy = y - p.y;
    if (Math.hypot(vx, vy) < 1) return 45;
    const t = vx * p.tx + vy * p.ty, n = vx * p.nx + vy * p.ny;
    let g = (Math.atan2(n, t) * 180) / Math.PI;
    // Detrás del cráneo (ángulo negativo grande) cuenta como 90, no como 0.
    if (g < -90) g = 90;
    return clamp(g, 0, 90);
  };

  const dentroDe = (x, y, poli) => {
    let dentro = false;
    for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
      const [xi, yi] = poli[i], [xj, yj] = poli[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  };

  // Hebras del costado: una rejilla con leve desorden dentro de la zona del
  // pelo. Por encima de la línea de degradado son largas y por debajo casi
  // puntos; en la franja de transición se acortan de a poco, que es
  // exactamente lo que se ve en un degradado. Se agrupan por largo en
  // `bandas` para animarlas de la más corta a la más larga.
  const hebras = (s = 7, paso = 10, bandas = 6) => {
    const rnd = semilla(s);
    const zona = CUERO.map(p => [p.x, p.y]).concat(CONTORNO.slice().reverse());
    const grupos = Array.from({ length: bandas }, () => []);
    for (let y = 108; y < 450; y += paso) {
      for (let x = 170; x < 476; x += paso) {
        const px = x + (rnd() - 0.5) * paso * 0.8, py = y + (rnd() - 0.5) * paso * 0.8;
        if (!dentroDe(px, py, zona)) continue;
        // Margen con el borde del cráneo para que ninguna hebra lo cruce.
        const cerca = CUERO.some(p => Math.hypot(p.x - px, p.y - py) < 9);
        if (cerca) continue;
        const sobre = yDegradado(px) - py; // > 0: por encima de la línea
        const f = suave(-4, 26, sobre);
        const largo = lerp(1.6, 11, f) * lerp(0.8, 1.15, rnd());
        // Peinado hacia atrás arriba y hacia abajo en la parte trasera.
        const atras = suave(230, 450, px);
        let dx = lerp(1, 0.3, atras), dy = lerp(0.42, 1, atras);
        const l = Math.hypot(dx, dy);
        dx /= l; dy /= l;
        const b = Math.min(bandas - 1, Math.floor(f * bandas));
        grupos[b].push(`M${r1(px)} ${r1(py)}l${r1(dx * largo)} ${r1(dy * largo)}`);
      }
    }
    return grupos.map(g => g.join(""));
  };

  const CROQUIS = {
    ancho: ANCHO, alto: ALTO, tercios: TERCIOS,
    craneo: cadena(CRANEO),
    rostro: cadena(ROSTRO),
    nuca: cadena(NUCA),
    oreja: OREJA,
    contorno: curvaPor(CONTORNO.slice(4)),
    degradado: cadena(DEGRADADO),
    uDegradado: U_DEGRADADO,
  };

  // ------------------------------------------------------------------
  // ODÓMETRO: cada dígito es una tira "0-9" repetida dos veces; se mueve la
  // tira hasta dejar a la vista el dígito de la segunda vuelta, así todos los
  // dígitos ruedan hacia arriba aunque el nuevo sea menor.
  // ------------------------------------------------------------------
  const partesOdometro = texto =>
    Array.from(String(texto)).map(c => (/[0-9]/.test(c) ? { tipo: "d", v: Number(c) } : { tipo: "s", v: c }));

  const desplazamientoDigito = d => (-(10 + clamp(d, 0, 9)) / 20) * 100;

  // ------------------------------------------------------------------
  // FICHA DE SERVICIOS: la fila activa es la que cruza la línea de lectura,
  // o la más cercana a ella si ninguna la cruza.
  // ------------------------------------------------------------------
  const filaActiva = (filas, lineaY) => {
    if (!filas.length) return -1;
    let mejor = 0, dist = Infinity;
    filas.forEach((f, i) => {
      const d = lineaY < f.top ? f.top - lineaY : lineaY > f.bottom ? lineaY - f.bottom : 0;
      if (d < dist) { dist = d; mejor = i; }
    });
    return mejor;
  };

  // Día de la semana en hora de Colombia, con las claves de dayPrices.
  const DIAS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];
  const diaBogota = (fecha = new Date()) => {
    const nombre = new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", weekday: "short" }).format(fecha);
    return DIAS[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(nombre)];
  };

  window.JoxeMovimiento = {
    clamp, lerp, suave, semilla,
    CROQUIS, CUERO, grosorPelo, siluetaPelo, mechones, puntoPeso, guia, anguloDesde, hebras, dentroDe, yDegradado,
    partesOdometro, desplazamientoDigito,
    filaActiva, diaBogota,
  };
})();
