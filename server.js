import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- DB (Lowdb JSON) ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "events.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

const adapter = new JSONFile(DB_FILE);
const db = new Low(adapter, { events: [] });
await db.read();
db.data ||= { events: [] };

// helpers
async function persist() {
  await db.write();
}

// ---------- Middleware ----------
app.use("/api", express.json({ limit: "5mb" }));
app.use("/api", express.urlencoded({ extended: true }));

// ---------- Health ----------
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/ping", (_req, res) => res.json({ ping: true }));

// ---------- Ingest (RAW body to capture any content-type) ----------
app.post(
  "/api/events",
  express.raw({ type: "*/*", limit: "5mb" }),
  async (req, res) => {
    const id = uuidv4();
    const event = {
      id,
      source: (req.query.source || "").toString(),
      content_type: req.headers["content-type"] || "application/octet-stream",
      headers: req.headers || {},
      body: Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || ""),
      received_at: new Date().toISOString(),
    };

    db.data.events.push(event);
    await persist();
    res.status(201).json({ id: event.id, received_at: event.received_at });
  }
);

// ---------- List Events ----------
app.get("/api/events", async (req, res) => {
  const { source = "", q = "", limit = "50", offset = "0" } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 50, 200);
  const off = parseInt(offset, 10) || 0;

  const events = db.data.events
    .filter((e) => (source === "" || e.source === source) &&
      (q === "" ||
        e.body?.toLowerCase().includes(String(q).toLowerCase()) ||
        JSON.stringify(e.headers).toLowerCase().includes(String(q).toLowerCase())))
    .sort((a, b) => new Date(b.received_at) - new Date(a.received_at));

  const items = events.slice(off, off + lim).map((e) => ({
    id: e.id,
    source: e.source,
    content_type: e.content_type,
    received_at: e.received_at,
    preview: (e.body || "").slice(0, 200),
  }));

  res.json({ items, limit: lim, offset: off, total: events.length });
});

// ---------- Get by ID ----------
app.get("/api/events/:id", async (req, res) => {
  const row = db.data.events.find((e) => e.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

// ---------- Stats ----------
app.get("/api/stats", async (_req, res) => {
  const total = db.data.events.length;
  const map = new Map();
  for (const e of db.data.events) {
    const key = e.source || "";
    map.set(key, (map.get(key) || 0) + 1);
  }
  const by_source = [...map.entries()]
    .map(([source, c]) => ({ source, c }))
    .sort((a, b) => b.c - a.c);

  res.json({ total_events: total, by_source });
});

// ---------- Purge ----------
app.post("/api/admin/purge", async (req, res) => {
  const days = Math.max(1, parseInt(req.body?.days ?? "7", 10));
  const cutoffISO = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const before = db.data.events.length;
  db.data.events = db.data.events.filter((e) => e.received_at >= cutoffISO);
  await persist();
  res.json({ deleted_events: before - db.data.events.length, cutoff: cutoffISO });
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`🚀 Webhook Inbox running on http://localhost:${PORT}`);
});
