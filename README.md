# 📬 Webhook Inbox API

A simple **Webhook Inbox API** built with **Node.js + Express** that allows you to ingest, store, and query webhook events.  
Now fully deployed and live on **Render** 🚀.

---

## 🌐 Live Deployment
You can access the API here:

👉 [https://webhook-inbox.onrender.com](https://webhook-inbox.onrender.com)

### Example Endpoints
- Health Check → [https://webhook-inbox.onrender.com/api/health](https://webhook-inbox.onrender.com/api/health)  
- Ping → [https://webhook-inbox.onrender.com/api/ping](https://webhook-inbox.onrender.com/api/ping)  
- Stats → [https://webhook-inbox.onrender.com/api/stats](https://webhook-inbox.onrender.com/api/stats)  

---

## ⚙️ Features
- ✅ Ingest incoming webhook events  
- ✅ Store events in JSON (using LowDB)  
- ✅ List all events or fetch by ID  
- ✅ Purge old events  
- ✅ Stats endpoint to check system status  
- ✅ Deployed on **Render** for public access  

---

## 🛠️ Getting Started (Local Setup)

Follow these steps to run the project locally:

### 1. Clone the repository
```bash
git clone https://github.com/vaibhjais2503/webhook-inbox.git
cd webhook-inbox
