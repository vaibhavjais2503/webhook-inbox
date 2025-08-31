// server.js
import express from "express";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import path from "path";

// Show which file is running
console.log("Booting server from:", import.meta.url);

const app = express();
const PORT = process.env.PORT || 3000;

// Database path for Render (inside project folder)
const dbPath = path.join(process.cwd(), "data.db");
const db = new Database(dbPath);

// Enable WAL mode for performance
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

// Middleware for JSON and form data
app.use("/api", express.json({ limit: "5mb" }));
app.use("/api", express.urlencoded({ extended: true }));

// Health & Ping routes
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/ping", (_req, res) => res.json({ ping: true }));

// Ingest webhook events (raw body)
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

// List events
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

// Get event by ID
app.get("/api/events/:id", (req, res) => {
  const row = db.prepare(`
    SELECT id, source, content_type, headers, body, received_at
    FROM events WHERE id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

// Stats
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

// Purge
app.post("/api/admin/purge", express.json(), (req, res) => {
  const days = Math.max(1, parseInt(req.body?.days ?? "7", 10));
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const info = db.prepare(`DELETE FROM events WHERE received_at < ?`).run(cutoff);
  res.json({ deleted_events: info.changes, cutoff });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Webhook Inbox running on http://localhost:${PORT}`);
});
