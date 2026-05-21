import { initTables, kvGet } from "./db.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const DEFAULT_SERVICES = [
  { id:"s1", name:"Corte mujer",        price:85000,  dur:60,  active:true },
  { id:"s2", name:"Corte hombre",       price:45000,  dur:40,  active:true },
  { id:"s3", name:"Balayage",           price:280000, dur:180, active:true, note:"desde" },
  { id:"s4", name:"Color correction",   price:320000, dur:240, active:true, note:"desde" },
  { id:"s5", name:"Color raíz",         price:120000, dur:90,  active:true },
  { id:"s6", name:"Keratina",           price:260000, dur:180, active:true, note:"desde" },
  { id:"s7", name:"Asesoría de imagen", price:180000, dur:90,  active:true },
  { id:"s8", name:"Peinado novia",      price:220000, dur:120, active:true, note:"desde" },
];

const DEFAULT_EMPLOYEES = [
  { id:"e1", name:"Joxe",      role:"Estilista",  services:["s1","s2","s3","s4","s5","s6","s7","s8"], active:true },
  { id:"e2", name:"Laura M.",  role:"Estilista",  services:["s1","s2","s3","s5","s6","s8"], active:true },
  { id:"e3", name:"Camila R.", role:"Colorista",  services:["s3","s4","s5","s6"], active:true },
];

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")     return res.status(405).json({ error: "Method not allowed" });

  try {
    await initTables();
    const admin = await kvGet("admin_store");

    const services = (admin?.services || DEFAULT_SERVICES)
      .filter(s => s.active)
      .map(({ id, name, price, dur, note }) => ({ id, name, price, dur, note }));

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

    return res.status(200).json({ services, employees, chairsCount, chairAssignments });
  } catch (err) {
    console.error("[catalog]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
