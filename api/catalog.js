import { initTables, kvGetCached } from "../lib/db.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const DEFAULT_SERVICES = [
  { id:"s2",   name:"Corte hombre (con mascarilla puntos negros + cejas)", price:22000, dur:60,  active:true, dayPrices:{ mar:16000 } },
  { id:"s9",   name:"Corte hombre con barba",                              price:27000, dur:60,  active:true, dayPrices:{ mar:20000 } },
  { id:"s1",   name:"Corte dama",                                          price:20000, dur:60,  active:true },
  { id:"s12",  name:"Cepillado dama",                                      price:20000, dur:60,  active:true, note:"desde" },
  { id:"s13",  name:"Tinturas",                                            price:0,     dur:60,  active:true, quote:true },
  { id:"s6",   name:"Keratina alisado permanente dama",                    price:100000, dur:240, active:true, note:"desde" },
  { id:"s14",  name:"Keratina alisado permanente hombre (+ corte gratis)", price:90000, dur:240, active:true },
  { id:"s15",  name:"Ondulado permanente hombre (+ corte gratis)",         price:130000, dur:120, active:true },
  { id:"s16",  name:"Depilación de cejas con cera",                        price:10000, dur:60,  active:true },
  { id:"s17",  name:"Depilación de cejas con cuchilla",                    price:5000,  dur:60,  active:true },
  { id:"s18",  name:"Limpieza facial",                                     price:45000, dur:60,  active:true },
  { id:"s19",  name:"Corte + limpieza facial",                             price:55000, dur:60,  active:true },
  { id:"s7",   name:"Asesoría de imagen",                                  price:0,     dur:60,  active:true },
];

const DEFAULT_EMPLOYEES = [
  { id:"e1", name:"Joxe",      role:"Estilista",  services:["s2","s9","s1","s12","s13","s6","s14","s15","s16","s17","s18","s19","s7"], active:true },
  { id:"e3", name:"Camila R.", role:"Colorista",  services:["s6"], active:true },
];

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")     return res.status(405).json({ error: "Method not allowed" });

  try {
    await initTables();
    // El catálogo es público y se pide en cada carga de página; la config del
    // salón cambia como mucho un par de veces al día.
    const admin = await kvGetCached("admin_store", 60000);

    const services = (admin?.services || DEFAULT_SERVICES)
      .filter(s => s.active)
      .map(({ id, name, price, dur, note, quote, dayPrices }) => ({
        id, name, price, dur, note,
        ...(quote ? { quote: true } : {}),
        ...(dayPrices && Object.keys(dayPrices).length ? { dayPrices } : {}),
      }));

    const employees = (admin?.employees || DEFAULT_EMPLOYEES)
      .filter(e => e.active !== false)
      // Strip PIN — workHours is safe to expose (no sensitive data)
      .map(({ id, name, role, services: svcs, workHours }) => ({
        id, name, role,
        services: svcs || [],
        ...(workHours ? { workHours } : {}),
      }));

    const chairsCount = admin?.chairsCount ?? 3;
    const chairAssignments = admin?.chairAssignments ?? {};

    // Modo de cada tema de temporada (auto/on/off). Las fechas y los archivos
    // viven en temas/catalogo.js; aquí solo viaja lo que eligió el admin.
    const themes = Object.fromEntries(
      Object.entries(admin?.themes || {})
        .filter(([id, modo]) => /^[a-z0-9-]{1,40}$/.test(id) && ["auto", "on", "off"].includes(modo))
    );

    return res.status(200).json({ services, employees, chairsCount, chairAssignments, themes });
  } catch (err) {
    console.error("[catalog]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
