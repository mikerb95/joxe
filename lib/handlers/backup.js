import { initTables, kvDump, kvRestore, verifyAdminAuth } from "../db.js";

// Backup / restore de la base de datos (tabla kv de Turso).
//
//   GET  /api/backup        -> descarga un snapshot JSON completo
//   POST /api/backup        -> restaura desde un snapshot (merge por defecto)
//   POST /api/backup?mode=replace -> vacía la tabla antes de restaurar
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

const BACKUP_VERSION = 1;

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
        return res.status(400).json({ error: "Body must be a backup snapshot ({ rows: [...] }) or a rows array" });
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
