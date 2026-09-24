// Motor de movimiento del home. Recorre el marcado buscando atributos
// data-mv y les pone su animación de entrada con GSAP y ScrollTrigger:
//
//   lineas    titular: cada .mv-li sube desde su máscara
//   rotulo    trazo corto de bronce que se dibuja y luego el texto
//   sube      bloque que sube y aparece (se agrupan los que entran juntos)
//   grupo     sus hijos entran en cadena
//   traza     línea que se dibuja de izquierda a derecha
//   odometro  los dígitos ruedan hasta su valor
//   estrellas las estrellas de la nota aparecen una por una
//   iman      botón que se deja atraer por el cursor
//   cinta     la cinta de servicios, cuya velocidad sigue al scroll
//   mapa      el mapa se abre desde el centro
//
// El marcado ya viene en su estado final. El motor fija el estado inicial
// justo antes de animar, dentro del mismo fotograma en que React pinta (el
// MutationObserver corre antes del repintado), así que no hay parpadeo. Sin
// GSAP o con prefers-reduced-motion no hace nada y todo se ve quieto y
// completo.
(() => {
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;
  const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const activo = !!(gsap && ST) && !reducido;
  window.JoxeMotor = { activo };
  if (!activo) return;

  gsap.registerPlugin(ST);
  document.documentElement.classList.add("mv-on");

  const EASE = "expo.out";
  const INICIO = "top 86%";
  const vistos = new WeakSet();
  const puntero = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const tipos = {
    lineas(el) {
      const lineas = el.querySelectorAll(".mv-li");
      gsap.set(lineas, { yPercent: 108 });
      const ir = () => gsap.to(lineas, { yPercent: 0, duration: 1.15, ease: EASE, stagger: 0.09 });
      if (el.hasAttribute("data-mv-carga")) gsap.delayedCall(Number(el.dataset.mvCarga) || 0, ir);
      else ST.create({ trigger: el, start: INICIO, once: true, onEnter: ir });
    },

    rotulo(el) {
      const trazo = el.querySelector(".mv-trazo");
      const texto = el.querySelector(".mv-rt");
      gsap.set(trazo, { scaleX: 0 });
      gsap.set(texto, { opacity: 0, x: -6 });
      const ir = () => gsap.timeline()
        .to(trazo, { scaleX: 1, duration: 0.7, ease: "power2.inOut" })
        .to(texto, { opacity: 1, x: 0, duration: 0.6, ease: "power2.out" }, "-=0.25");
      const carga = el.closest("[data-mv-carga]");
      if (carga) gsap.delayedCall(Number(carga.dataset.mvCarga) || 0, ir);
      else ST.create({ trigger: el, start: INICIO, once: true, onEnter: ir });
    },

    traza(el) {
      gsap.set(el, { scaleX: 0, transformOrigin: "left center" });
      ST.create({
        trigger: el, start: "top 92%", once: true,
        onEnter: () => gsap.to(el, { scaleX: 1, duration: 1.1, ease: "power3.inOut" }),
      });
    },

    grupo(el) {
      const hijos = Array.from(el.children);
      gsap.set(hijos, { y: 26, opacity: 0 });
      ST.create({
        trigger: el, start: INICIO, once: true,
        onEnter: () => gsap.to(hijos, {
          y: 0, opacity: 1, duration: 0.9, ease: EASE,
          stagger: Number(el.dataset.mvPaso) || 0.07, clearProps: "transform",
          ...sinTransicion(hijos),
        }),
      });
    },

    // La opacidad de cada estrella vive en su atributo (las vacías van al
    // 30 %), así que aquí solo se escala: tocar la opacidad las llenaría.
    estrellas(el) {
      const svgs = el.querySelectorAll("svg");
      gsap.set(svgs, { scale: 0, transformOrigin: "50% 50%" });
      ST.create({
        trigger: el, start: INICIO, once: true,
        onEnter: () => gsap.to(svgs, { scale: 1, duration: 0.6, ease: "back.out(2.2)", stagger: 0.08, delay: 0.3, clearProps: "transform" }),
      });
    },

    odometro(el) {
      const tiras = el.querySelectorAll(".odo-t");
      gsap.set(tiras, { yPercent: 0 });
      ST.create({
        trigger: el, start: "top 94%", once: true,
        onEnter: () => tiras.forEach((t, i) => gsap.to(t, {
          yPercent: Number(t.dataset.y), duration: 1.3, ease: "expo.out", delay: 0.1 + i * 0.06,
        })),
      });
    },

    iman(el) {
      if (!puntero) return;
      const texto = el.querySelector(".mv-iman-t");
      const x = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
      const y = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
      const tx = texto && gsap.quickTo(texto, "x", { duration: 0.5, ease: "power3.out" });
      const ty = texto && gsap.quickTo(texto, "y", { duration: 0.5, ease: "power3.out" });
      el.addEventListener("pointermove", ev => {
        // El centro se mide sin la traslación propia; si no, el botón se
        // persigue a sí mismo y tiembla.
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2 - gsap.getProperty(el, "x");
        const cy = r.top + r.height / 2 - gsap.getProperty(el, "y");
        const dx = (ev.clientX - cx) * 0.28, dy = (ev.clientY - cy) * 0.35;
        x(dx); y(dy);
        if (texto) { tx(dx * 0.45); ty(dy * 0.45); }
      });
      el.addEventListener("pointerleave", () => {
        x(0); y(0);
        if (texto) { tx(0); ty(0); }
      });
    },

    // La cinta es una cinta métrica: avanza sola y el scroll la acelera; si
    // se sube, retrocede. Fuera de pantalla se detiene.
    cinta(el) {
      el.classList.add("mv-cinta-on");
      // La regla va aparte y lleva su propio recorrido sin envolver: al dar
      // la vuelta la pista salta un tercio de su ancho, que no es múltiplo
      // de la separación de las marcas, y las marcas saltarían con ella.
      const regla = el.parentElement.querySelector(".cinta-regla");
      let x = 0, recorrido = 0, vel = 0, dir = 1, visible = false;
      const BASE = 38; // px por segundo
      const tick = (t, dt) => {
        const ancho = el.scrollWidth / 3;
        if (!ancho) return;
        vel *= 0.92;
        const paso = ((BASE + Math.min(Math.abs(vel), 3000) * 0.12) * dir * dt) / 1000;
        x = gsap.utils.wrap(-ancho, 0, x - paso);
        recorrido = (recorrido - paso) % 60;
        gsap.set(el, { x });
        if (regla) regla.style.backgroundPosition = `${recorrido}px 100%, ${recorrido}px 100%`;
      };
      ST.create({
        trigger: el, start: "top bottom", end: "bottom top",
        onToggle: s => {
          visible = s.isActive;
          if (visible) gsap.ticker.add(tick); else gsap.ticker.remove(tick);
        },
      });
      ST.create({
        start: 0, end: "max",
        onUpdate: s => { vel = s.getVelocity(); if (visible && Math.abs(vel) > 20) dir = s.direction; },
      });
    },

    mapa(el) {
      gsap.set(el, { clipPath: "inset(10% 16% 10% 16%)", opacity: 0.4 });
      ST.create({
        trigger: el, start: "top 88%", once: true,
        onEnter: () => gsap.to(el, { clipPath: "inset(0% 0% 0% 0%)", opacity: 1, duration: 1.4, ease: "expo.inOut" }),
      });
    },
  };

  // Si el elemento ya trae una transición CSS de transform (tarjetas con
  // hover), la transición suavizaría cada fotograma de GSAP y la entrada se
  // arrastraría. Se apaga mientras dura y se devuelve la original al final.
  const sinTransicion = els => {
    const antes = els.map(e => e.style.transition);
    els.forEach(e => { if (e.style.transition) e.style.transition = "none"; });
    return { onComplete: () => els.forEach((e, i) => { e.style.transition = antes[i]; }) };
  };

  // "sube" se agrupa: los bloques que entran en pantalla a la vez lo hacen en
  // cadena en lugar de todos juntos.
  const subir = els => {
    gsap.set(els, { y: 32, opacity: 0 });
    ST.batch(els, {
      start: INICIO, once: true,
      onEnter: lote => gsap.to(lote, {
        y: 0, opacity: 1, duration: 1, ease: EASE, stagger: 0.08, clearProps: "transform",
        ...sinTransicion(lote),
      }),
    });
  };

  // Si algo falla después de esconder, se devuelve la visibilidad de todo lo
  // que el motor pudo haber tocado.
  const rescatar = err => {
    console.error("[motor]", err);
    gsap.set(".mv-li, .mv-trazo, .mv-rt, [data-mv=traza], [data-mv=grupo] > *, [data-mv=sube], [data-mv=mapa], [data-mv=estrellas] svg",
      { clearProps: "transform,opacity,clipPath" });
    document.querySelectorAll(".odo-t").forEach(t => gsap.set(t, { yPercent: Number(t.dataset.y) }));
  };

  let refrescar = null;
  const pedirRefresco = () => {
    clearTimeout(refrescar);
    refrescar = setTimeout(() => ST.refresh(), 180);
  };

  const enlazar = () => {
    const nuevos = Array.from(document.querySelectorAll("[data-mv]")).filter(el => !vistos.has(el));
    if (!nuevos.length) return;
    try {
      const sube = [];
      nuevos.forEach(el => {
        vistos.add(el);
        const tipo = el.dataset.mv;
        if (tipo === "sube") sube.push(el);
        else if (tipos[tipo]) tipos[tipo](el);
      });
      if (sube.length) subir(sube);
      pedirRefresco();
    } catch (err) {
      rescatar(err);
    }
  };

  const arrancar = () => {
    const raiz = document.getElementById("root");
    if (!raiz) return;
    // Las secciones que dependen de la API (reseñas, academia) llegan
    // después: el observador las enlaza apenas React las pinta.
    new MutationObserver(enlazar).observe(raiz, { childList: true, subtree: true });
    // Cualquier cambio de alto (fuentes, secciones nuevas) mueve los puntos
    // de disparo de lo que viene abajo.
    new ResizeObserver(pedirRefresco).observe(raiz);
    document.fonts && document.fonts.ready.then(pedirRefresco);
    enlazar();
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
