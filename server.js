import express from "express";
import sqlite3 from "sqlite3";
import { v4 as uuidv4 } from "uuid";

console.log("Booting server from:", import.meta.url);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for JSON/form parsing
app.use("/api", express.json({ limit: "5mb" }));
app.use("/api", express.urlencoded({ extended: true }));

// ---------- SQLite ----------
const db = new sqlite3.Database("data.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      source TEXT,
      content_type TEXT,
      headers TEXT,
      body TEXT,
      received_at TEXT
    )
  `);
});

// ---------- Health ----------
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/ping", (_req, res) => res.json({ ping: true }));

// ---------- Ingest ----------
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

  db.run(
    `INSERT INTO events (id, source, content_type, headers, body, received_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [event.id, event.source, event.content_type, event.headers, event.body, event.received_at],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: event.id, received_at: event.received_at });
    }
  );
});

// ---------- List ----------
app.get("/api/events", (req, res) => {
  const { source = "", q = "", limit = "50", offset = "0" } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 50, 200);
  const off = parseInt(offset, 10) || 0;

  db.all(
    `SELECT id, source, content_type, received_at, substr(body,1,200) AS preview
     FROM events
     WHERE (? = '' OR source = ?)
       AND (? = '' OR body LIKE '%' || ? || '%' OR headers LIKE '%' || ? || '%')
     ORDER BY received_at DESC
     LIMIT ? OFFSET ?`,
    [source, source, q, q, q, lim, off],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows, limit: lim, offset: off });
    }
  );
});

// ---------- Get by ID ----------
app.get("/api/events/:id", (req, res) => {
  db.get(
    `SELECT id, source, content_type, headers, body, received_at FROM events WHERE id = ?`,
    [req.params.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    }
  );
});

// ---------- Pretty preview ----------
app.get("/api/events/:id/preview", (req, res) => {
  db.get(
    `SELECT id, content_type, body FROM events WHERE id=?`,
    [req.params.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: "Not found" });

      if ((row.content_type || "").includes("application/json")) {
        try {
          return res.json({ id: row.id, content_type: row.content_type, parsed: JSON.parse(row.body) });
        } catch {}
      }
      res.json({ id: row.id, content_type: row.content_type, text: row.body.slice(0, 2000) });
    }
  );
});

// ---------- Stats ----------
app.get("/api/stats", (_req, res) => {
  db.get(`SELECT COUNT(*) AS c FROM events`, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const total = row.c;

    db.all(
      `SELECT source, COUNT(*) AS c FROM events GROUP BY source ORDER BY c DESC`,
      (err2, rows) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ total_events: total, by_source: rows });
      }
    );
  });
});

// ---------- Purge ----------
app.post("/api/admin/purge", express.json(), (req, res) => {
  const days = Math.max(1, parseInt(req.body?.days ?? "7", 10));
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  db.run(
    `DELETE FROM events WHERE received_at < ?`,
    [cutoff],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ deleted_events: this.changes, cutoff });
    }
  );
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`🚀 Webhook Inbox running on http://localhost:${PORT}`);
  console.log(`Try in browser:
   • http://localhost:${PORT}/api/health
   • http://localhost:${PORT}/api/ping
   • http://localhost:${PORT}/api/stats
  `);
});
