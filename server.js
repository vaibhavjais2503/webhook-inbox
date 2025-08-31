// server.js
import express from "express";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";

// Show which file is actually running (important!)
console.log("Booting server from:", import.meta.url);

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON + form for /api routes. (Ingest uses RAW below.)
app.use("/api", express.json({ limit: "5mb" }));
app.use("/api", express.urlencoded({ extended: true }));

// ---------- SQLite ----------
const db = new Database("data.db");
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  source TEXT,
  content_type TEXT,
  headers TEXT,
  body TEXT,
  received_at TEXT
);
`);

// ---------- Health ----------
app.get("/api/health", (_req, res) => res.json({ ok: true }));
// tiny ping to confirm routing easily
app.get("/api/ping", (_req, res) => res.json({ ping: true }));

// ---------- Ingest (RAW body) ----------
app.post("/api/events", express.raw({ type: "*/*", limit: "5mb" }), (req, res) => {
  const id = uuidv4();
  const event = {
    id,
    source: (req.query.source || "").toString(),
    content_type: req.headers["content-type"] || "application/octet-stream",
    headers: JSON.stringify(req.headers || {}),
    body: Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || ""),
    received_at: new Date().toISOString(),
  };
  db.prepare(`
    INSERT INTO events (id, source, content_type, headers, body, received_at)
    VALUES (@id, @source, @content_type, @headers, @body, @received_at)
  `).run(event);
  res.status(201).json({ id: event.id, received_at: event.received_at });
});

// ---------- List ----------
app.get("/api/events", (req, res) => {
  const { source = "", q = "", limit = "50", offset = "0" } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 50, 200);
  const off = parseInt(offset, 10) || 0;

  const rows = db.prepare(`
    SELECT id, source, content_type, received_at, substr(body,1,200) AS preview
    FROM events
    WHERE (@source = '' OR source = @source)
      AND (@q = '' OR body LIKE '%' || @q || '%' OR headers LIKE '%' || @q || '%')
    ORDER BY received_at DESC
    LIMIT @lim OFFSET @off
  `).all({ source, q, lim, off });

  res.json({ items: rows, limit: lim, offset: off });
});

// ---------- Get by ID ----------
app.get("/api/events/:id", (req, res) => {
  const row = db.prepare(`
    SELECT id, source, content_type, headers, body, received_at
    FROM events WHERE id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

// ---------- Pretty preview ----------
app.get("/api/events/:id/preview", (req, res) => {
  const row = db.prepare(`SELECT id, content_type, body FROM events WHERE id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });

  if ((row.content_type || "").includes("application/json")) {
    try { return res.json({ id: row.id, content_type: row.content_type, parsed: JSON.parse(row.body) }); }
    catch {}
  }
  res.json({ id: row.id, content_type: row.content_type, text: row.body.slice(0, 2000) });
});

// ---------- Stats (this is the one you’re calling) ----------
app.get("/api/stats", (_req, res) => {
  const total = db.prepare(`SELECT COUNT(*) AS c FROM events`).get().c;
  const bySource = db.prepare(`
    SELECT source, COUNT(*) AS c
    FROM events
    GROUP BY source
    ORDER BY c DESC
  `).all();
  res.json({ total_events: total, by_source: bySource });
});

// ---------- Purge ----------
app.post("/api/admin/purge", express.json(), (req, res) => {
  const days = Math.max(1, parseInt(req.body?.days ?? "7", 10));
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const info = db.prepare(`DELETE FROM events WHERE received_at < ?`).run(cutoff);
  res.json({ deleted_events: info.changes, cutoff });
});

// ---------- Debug: print all routes on start ----------
function printRoutes() {
  const routes = [];
  app._router?.stack?.forEach((layer) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join(",");
      routes.push(`${methods} ${layer.route.path}`);
    }
  });
  console.log("Registered routes:\n" + routes.join("\n"));
}

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`🚀 Webhook Inbox running on http://localhost:${PORT}`);
  printRoutes();
  console.log(`Try in browser:
   • http://localhost:${PORT}/api/health
   • http://localhost:${PORT}/api/ping
   • http://localhost:${PORT}/api/stats
  `);
});
