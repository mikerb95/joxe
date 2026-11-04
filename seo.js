// JOXE: completa la ficha del salón para Google (#ld-salon) con lo que cambia
// desde el panel: horario (sale de los workHours, igual que /cita), rango de
// precios y servicios. Google lee el JSON-LD también cuando se inyecta con JS.
// Si el catálogo no carga, la ficha queda con los datos fijos del HTML.
(function () {
  const el = document.getElementById("ld-salon");
  const H = window.JoxeHorario;
  if (!el || !H) return;

  const SCHEMA_DIA = {
    lun: "Monday", mar: "Tuesday", mie: "Wednesday", jue: "Thursday",
    vie: "Friday", sab: "Saturday", dom: "Sunday",
  };
  const cop = (n) => "$" + Math.round(n).toLocaleString("es-CO");

  fetch("/api/catalog")
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((cat) => {
      const ld = JSON.parse(el.textContent);

      const horario = H.horarioSalon(cat.employees);
      const horas = H.DIAS.filter((d) => horario[d]).map((d) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "https://schema.org/" + SCHEMA_DIA[d],
        opens: horario[d].start,
        closes: horario[d].end,
      }));
      if (horas.length) ld.openingHoursSpecification = horas;

      // Precio más bajo (contando el del martes) y más alto con precio
      // publicado. Los servicios "a cotizar" (precio 0) no cuentan.
      const precios = [];
      for (const s of cat.services || []) {
        if (s.price > 0) precios.push(s.price);
        for (const p of Object.values(s.dayPrices || {})) if (p > 0) precios.push(p);
      }
      if (precios.length) {
        ld.priceRange = `${cop(Math.min(...precios))} - ${cop(Math.max(...precios))}`;
      }

      const servicios = (cat.services || []).map((s) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: s.name },
        // "desde" es un precio mínimo, no el precio: se declara como tal.
        ...(s.price > 0 && s.note === "desde"
          ? { priceSpecification: { "@type": "PriceSpecification", minPrice: s.price, priceCurrency: "COP" } }
          : s.price > 0 ? { price: s.price, priceCurrency: "COP" } : {}),
      }));
      if (servicios.length) {
        ld.hasOfferCatalog = {
          "@type": "OfferCatalog",
          name: "Servicios",
          itemListElement: servicios,
        };
      }

      el.textContent = JSON.stringify(ld);
    })
    .catch(() => {});
})();
