// Router de endpoints administrativos.
//
// El plan Hobby de Vercel permite un máximo de 12 Serverless Functions por
// deployment. Para no gastar una función por cada endpoint poco transitado,
// estos handlers viven en lib/handlers/ (fuera de api/, así Vercel no los
// compila) y se despachan desde aquí.
//
// Las URLs públicas no cambian: vercel.json reescribe /api/<nombre> hacia
// /api/ops?_ep=<nombre>, así que el frontend y el cron externo siguen
// llamando a las mismas rutas de siempre.
//
// Para añadir un endpoint nuevo aquí: crea lib/handlers/<nombre>.js con el
// mismo `export default async function handler(req, res)`, añádelo a HANDLERS
// y añade su rewrite en vercel.json.

const HANDLERS = {
  admin: () => import("../lib/handlers/admin.js"),
  backup: () => import("../lib/handlers/backup.js"),
  crm: () => import("../lib/handlers/crm.js"),
  payment: () => import("../lib/handlers/payment.js"),
  push: () => import("../lib/handlers/push.js"),
  reminders: () => import("../lib/handlers/reminders.js"),
  "work-hours": () => import("../lib/handlers/work-hours.js"),
};

export default async function handler(req, res) {
  const ep = req.query?._ep;
  const load = Object.prototype.hasOwnProperty.call(HANDLERS, ep)
    ? HANDLERS[ep]
    : null;

  if (!load) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(404).json({ error: "Endpoint no encontrado" });
  }

  // El handler destino no debe ver el parámetro interno de enrutado.
  delete req.query._ep;

  const mod = await load();
  return mod.default(req, res);
}
