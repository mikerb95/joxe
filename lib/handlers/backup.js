import { initTables, kvDump, kvRestore, verifyAdminAuth } from "../db.js";

// Backup / restore de la base de datos (tabla kv de Turso).
//
//   GET  /api/backup        -> descarga un snapshot JSON completo
//   POST /api/backup        -> restaura desde un snapshot (merge por defecto)
//   POST /api/backup?mode=replace -> restauración completa: deja la base
//                                    exactamente como el archivo (vacía la
//                                    tabla antes de escribir).
//
// El snapshot es autosuficiente: la base entera vive en la tabla kv, así que
// el archivo del GET basta para reconstruirla desde cero.
//
// Autenticación:
//   - GET  acepta el password admin (Bearer) O el CRON_SECRET (Bearer),
//     de modo que un cron externo pueda descargar backups automáticos.
//   - POST (restaurar) es destructivo: SOLO password admin.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// v2 añade el flag `raw` en las filas cuyo valor no es JSON válido, para que
// restaurar sea la inversa exacta de descargar. Los archivos v1 se siguen
// aceptando al restaurar.
const BACKUP_VERSION = 2;

function bearer(req) {
  const auth = req.headers.authorization ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

// GET puede autenticarse con el password admin o con el CRON_SECRET.
async function verifyBackupRead(req) {
  if (await verifyAdminAuth(req)) return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && bearer(req) === secret;
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    await initTables();

    if (req.method === "GET") {
      if (!(await verifyBackupRead(req))) return res.status(401).json({ error: "Unauthorized" });

      const rows = await kvDump();
      const snapshot = {
        version: BACKUP_VERSION,
        createdAt: new Date().toISOString(),
        count: rows.length,
        rows,
      };

      const stamp = snapshot.createdAt.replace(/[:.]/g, "-");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="joxe-backup-${stamp}.json"`);
      return res.status(200).send(JSON.stringify(snapshot, null, 2));
    }

    if (req.method === "POST") {
      // Restaurar es destructivo -> solo admin (no CRON_SECRET).
      if (!(await verifyAdminAuth(req))) return res.status(401).json({ error: "Unauthorized" });

      const body = req.body ?? {};
      const rows = Array.isArray(body) ? body : body.rows;
      if (!Array.isArray(rows)) {
        return res.status(400).json({ error: "El archivo no es un respaldo válido ({ rows: [...] })." });
      }
      if (!rows.length) {
        return res.status(400).json({ error: "El respaldo está vacío." });
      }
      // Una sola fila mal formada delata un archivo que no es un respaldo
      // nuestro. Mejor rechazarlo entero que restaurar a medias.
      const bad = rows.findIndex(r => !r || typeof r.key !== "string" || !r.key || !("value" in r));
      if (bad !== -1) {
        return res.status(400).json({ error: `El respaldo tiene un registro inválido (posición ${bad + 1}).` });
      }

      const replace = req.query?.mode === "replace";
      const restored = await kvRestore(rows, { replace });
      return res.status(200).json({ ok: true, restored, mode: replace ? "replace" : "merge" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[backup]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
