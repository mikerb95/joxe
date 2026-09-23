// Decide qué tema de temporada decora la página y carga su script. Va después
// de temas/catalogo.js; el modo de cada tema lo pone el admin y llega con
// /api/catalog.
//
// Vista previa sin tocar la configuración: ?tema=<id> muestra ese tema aunque
// esté apagado o fuera de temporada, y ?tema=ninguno no muestra ninguno.
(() => {
  const T = window.JoxeTemas;
  if (!T) return;

  const cargar = tema => {
    if (!tema) return;
    const s = document.createElement("script");
    s.src = "/" + tema.archivo;
    document.body.appendChild(s);
  };

  const vista = new URLSearchParams(location.search).get("tema");
  if (vista) return cargar(T.TEMAS.find(t => t.id === vista));

  // Si la configuración no llega, no se decora nada: es preferible quedarse
  // sin tema que mostrar uno que el admin apagó.
  fetch("/api/catalog")
    .then(r => (r.ok ? r.json() : Promise.reject()))
    .then(d => cargar(T.temaActivo(d.themes)))
    .catch(() => {});
})();
