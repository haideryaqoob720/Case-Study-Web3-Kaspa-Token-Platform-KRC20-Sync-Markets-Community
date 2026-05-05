## 🚀 Project Overview

This is a case study of a production-level **Web3 Kaspa token & community platform** developed by FlexLab for a client — **NestJS backend** (summarized here) plus a **Next.js** web app.

Due to client confidentiality (NDA), the full source code is not publicly available — including the **Next.js frontend**, which is also **not publicly viewable**.  
This repository focuses on the backend: system architecture, features, and our engineering approach.

---

## 🧠 Key Features

- **KRC20 & Kasplex integration** — Scheduled token sync from Kasplex with normalization, persistence, and cache invalidation; API reads avoid hammering upstream (cache-first patterns).
- **Market & exchange layer** — Multi-exchange adapters, normalized market data, candle aggregation, and recent-trades ingestion for token listings.
- **On-chain–style analytics** — KRC20 transaction indexing, holder snapshots and trends, and supporting repositories shared by workers and HTTP APIs.
- **Community & engagement** — Chat, community spaces, watchlists, token voting, curated token/news surfaces, and user feedback — with **Socket.io** for real-time updates where needed.
- **Platform hardening** — Background jobs via **BullMQ**, throttling, Swagger documentation, and Cloudinary-backed media where applicable.

---

## 🛠 Tech Stack

- **Frontend:** Next.js _(developed for the same product; repo not public — NDA)_
- **Backend:** NestJS / Node.js (TypeScript)
- **Database:** MongoDB (Mongoose)
- **Cache & queues:** Redis, BullMQ
- **Real-time:** WebSockets (Socket.io / NestJS)
- **Others:** Kasplex API, Axios, node-cron, Swagger, Cloudinary, RSS ingestion

---

## 🧩 Our Role

We handled:

- Full system architecture
- **Next.js** frontend development _(private deliverable)_
- Backend API design & implementation (REST + WebSocket gateways)
- Background workers, sync pipelines, and performance-oriented caching
- Integration with external data sources (Kasplex, CEX adapters)
- Deployment & scaling considerations

---

## 🏗 Architecture (high level)

**HTTP path:** Controller → Service → Repository  
**Worker path:** Scheduler / BullMQ processor → Service → Repository

Both paths reuse the same domain services and persistence layers so APIs and jobs stay consistent. Token sync runs on a schedule with retries and degrades gracefully if Redis is unavailable.

---

## 🔒 Note

This project was developed for a client.  
**Backend and Next.js frontend** source remain private under NDA and are not publicly viewable.
