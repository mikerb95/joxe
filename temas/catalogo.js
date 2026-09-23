// Biblioteca de temas de temporada.
//
// Cada tema es un script de esta carpeta que decora el sitio público (ver
// halloween.js) más una entrada en TEMAS con su temporada. En Configuración →
// Temas de temporada, el admin elige un modo para cada uno:
//
//   auto  se enciende solo, todos los años, dentro de su temporada (por defecto)
//   on    encendido siempre, sin importar la fecha
//   off   apagado siempre
//
// El modo se guarda en admin_store.themes y el sitio lo recibe por
// /api/catalog. Este archivo lo cargan tanto el panel como el sitio, que no
// comparten bundler, así que todo queda expuesto en window.JoxeTemas.
//
// Para sumar un tema (ej. navidad): crear temas/navidad.js y agregar su
// entrada aquí. Una temporada puede cruzar el año: desde "12-01" hasta "01-06".
(() => {
  const TEMAS = [
    {
      id: "halloween",
      nombre: "Halloween",
      descripcion: "Murciélagos, fantasmas, telarañas y una araña que baja por su hilo.",
      desde: "10-01", // MM-DD, ambos días incluidos
      hasta: "10-31",
      archivo: "temas/halloween.js",
    },
  ];

  const MODOS = ["auto", "on", "off"];

  // La temporada se cuenta en la hora de Colombia, no en la del visitante,
  // para que octubre empiece al mismo tiempo para todos.
  const hoyMMDD = (fecha = new Date()) => {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota", month: "2-digit", day: "2-digit",
    }).formatToParts(fecha);
    const parte = tipo => partes.find(p => p.type === tipo).value;
    return `${parte("month")}-${parte("day")}`;
  };

  const enTemporada = (tema, mmdd = hoyMMDD()) =>
    tema.desde <= tema.hasta
      ? mmdd >= tema.desde && mmdd <= tema.hasta
      : mmdd >= tema.desde || mmdd <= tema.hasta;

  const modoDe = (config, id) => (MODOS.includes(config?.[id]) ? config[id] : "auto");

  // Se muestra un solo tema a la vez. Uno encendido a mano gana sobre los
  // automáticos; entre iguales manda el orden de TEMAS.
  const temaActivo = (config, mmdd = hoyMMDD()) =>
    TEMAS.find(t => modoDe(config, t.id) === "on") ||
    TEMAS.find(t => modoDe(config, t.id) === "auto" && enTemporada(t, mmdd)) ||
    null;

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
    "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const fechaLarga = mmdd => {
    const [m, d] = mmdd.split("-").map(Number);
    return `${d} de ${MESES[m - 1]}`;
  };

  window.JoxeTemas = { TEMAS, MODOS, hoyMMDD, enTemporada, modoDe, temaActivo, fechaLarga };
})();
