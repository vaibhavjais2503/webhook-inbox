# Webhook Inbox API

A lightweight backend service to **capture, inspect, and manage webhooks**.  
Built with **Node.js, Express, and SQLite** — perfect for testing, debugging, or storing webhook events from external services like GitHub, Stripe, etc.

---

## ✨ Features
- ✅ Capture and store incoming webhooks  
- ✅ List all stored events with filters  
- ✅ Retrieve an event by ID  
- ✅ Preview event payloads (JSON/text)  
- ✅ Stats endpoint (total count + by source)  
- ✅ Purge old events by date  

---

## 📦 Tech Stack
- **Node.js** + **Express** → API server  
- **better-sqlite3** → Fast and simple SQLite wrapper  
- **UUID** → Unique event IDs  
- **Postman** → API testing  

---

## 🚀 Getting Started

### 1. Clone the repo
```bash
git clone https://github.com/vaibhavjais2503/webhook-inbox.git
cd webhook-inbox
