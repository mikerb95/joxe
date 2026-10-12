// JOXE: horario del salón a partir del catálogo (/api/catalog).
// Lo usan la página del QR (/cita) y el aviso para imprimir (Aviso.html).
// No hay un horario fijo del salón: sale de los workHours de cada empleado.
// El salón está abierto un día si al menos uno trabaja, desde la primera
// entrada hasta la última salida.
(function () {
  const DIAS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];
  const NOMBRES = {
    lun: "Lunes", mar: "Martes", mie: "Miércoles", jue: "Jueves",
    vie: "Viernes", sab: "Sábado", dom: "Domingo",
  };
  const JS_DIA = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];

  const aMin = (t) => {
    const [h, m] = String(t).split(":").map(Number);
    return h * 60 + (m || 0);
  };

  const horarioSalon = (employees) => {
    const out = {};
    for (const d of DIAS) {
      let ini = null, fin = null;
      for (const e of employees || []) {
        const dia = e.workHours?.[d];
        if (!dia?.active) continue;
        if (ini === null || aMin(dia.start) < aMin(ini)) ini = dia.start;
        if (fin === null || aMin(dia.end) > aMin(fin)) fin = dia.end;
      }
      out[d] = ini ? { start: ini, end: fin } : null;
    }
    return out;
  };

  // "21:00" -> "9 p. m.", "09:30" -> "9:30 a. m."
  const hora = (t) => {
    const [h, m] = String(t).split(":").map(Number);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h >= 12 ? "p. m." : "a. m."}`;
  };

  const ahoraBogota = (fecha = new Date()) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Bogota", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(fecha).map(x => [x.type, x.value]));
    const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
    return { dia: JS_DIA[idx], min: Number(p.hour) * 60 + Number(p.minute) };
  };

  // { abierto, texto }: "Abierto ahora · hasta las 9 p. m." o cuándo abre.
  const estado = (horario, fecha) => {
    const { dia, min } = ahoraBogota(fecha);
    const hoy = horario[dia];
    if (hoy && min >= aMin(hoy.start) && min < aMin(hoy.end)) {
      return { abierto: true, texto: `Abierto ahora · hasta las ${hora(hoy.end)}` };
    }
    if (hoy && min < aMin(hoy.start)) {
      return { abierto: false, texto: `Cerrado ahora · abrimos hoy a las ${hora(hoy.start)}` };
    }
    const i = DIAS.indexOf(dia);
    for (let k = 1; k <= 7; k++) {
      const d = DIAS[(i + k) % 7];
      if (!horario[d]) continue;
      const cuando = k === 1 ? "mañana" : `el ${NOMBRES[d].toLowerCase()}`;
      return { abierto: false, texto: `Cerrado ahora · abrimos ${cuando} a las ${hora(horario[d].start)}` };
    }
    return null;
  };

  // Agrupa días seguidos con el mismo horario:
  // [{ dias: "Jueves a sábado", horas: "10 a. m. - 9 p. m.", claves: [...] }, ...]
  const grupos = (horario) => {
    const out = [];
    for (const d of DIAS) {
      const h = horario[d];
      const horas = h ? `${hora(h.start)} - ${hora(h.end)}` : "Cerrado";
      const ult = out[out.length - 1];
      if (ult && ult.horas === horas) ult.claves.push(d);
      else out.push({ horas, claves: [d], cerrado: !h });
    }
    for (const g of out) {
      const n = g.claves.map(k => NOMBRES[k]);
      g.dias = n.length === 1 ? n[0]
        : n.length === 2 ? `${n[0]} y ${n[1].toLowerCase()}`
        : `${n[0]} a ${n[n.length - 1].toLowerCase()}`;
    }
    return out;
  };

  window.JoxeHorario = { DIAS, NOMBRES, horarioSalon, hora, ahoraBogota, estado, grupos };
})();
