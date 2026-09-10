# Invexa — Simulated Stock Exchange Platform

> **Team 24** · Software Engineering Project

Invexa is a full-stack, real-time virtual stock exchange built for students and educators. It lets users trade synthetic (and real) stocks with virtual money, track portfolio performance, and compete in trading leagues — all in a risk-free environment powered by a live market simulation engine.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Repository Structure](#repository-structure)
4. [Prerequisites](#prerequisites)
5. [Environment Setup](#environment-setup)
6. [Running the Project](#running-the-project)
7. [Verifying the System](#verifying-the-system)
8. [Key API Endpoints](#key-api-endpoints)
9. [Troubleshooting](#troubleshooting)

---

## Project Overview

Invexa simulates a real stock exchange end-to-end:

- A **Python simulator** continuously generates price ticks using configurable strategies (Random Walk, Mean Reversion, Circuit Breaker) and publishes them to **Kafka**.
- A **TypeScript backend** (Bun + Elysia) consumes those ticks, persists them to **TimescaleDB**, caches the latest price in **Redis**, and broadcasts updates to all connected browsers over **WebSocket**.
- Users can place **Market**, **Limit**, and **Stop-Loss** orders. Market orders execute immediately in an ACID database transaction. Limit and stop-loss orders are queued in Redis sorted sets and triggered automatically when the price moves.
- A **React frontend** shows live prices, portfolio P&L, order history, market indexes (Nifty 50, S&P 500, etc.), and leaderboards — all updating in real time.

### Core Features

| Feature | Description |
|---------|-------------|
| **Authentication** | Register / Login / Logout with JWT + Redis session blacklist |
| **Live Prices** | WebSocket-streamed price ticks from the Python simulator via Kafka |
| **Market Indexes** | Nifty 50, Sensex, S&P 500, NASDAQ, Dow Jones (Yahoo Finance, 60s cache) |
| **Order Placement** | Market, Limit, Stop-Loss orders with full business-rule validation |
| **Portfolio** | Live holdings, cash balance, unrealised P&L updated on every price tick |
| **Order History** | Paginated trade history with status filters and cancel-pending support |
| **Competition Mode** | Create/join trading competitions with isolated portfolios and leaderboards |
| **Market Events** | Admin-triggered circuit breakers and volatility shocks via Kafka |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite, Zustand, React Query, Recharts |
| **Backend** | Bun runtime, Elysia (TypeScript) |
| **Database** | TimescaleDB (PostgreSQL 15 + time-series extension) |
| **Cache / Pub-Sub** | Redis 7 |
| **Message Bus** | Apache Kafka (KRaft mode — no Zookeeper) |
| **Simulator** | Python 3.11+ (`confluent-kafka`) |
| **ORM** | Drizzle ORM |
| **Auth** | JWT (`@elysiajs/jwt`) + bcrypt |
| **Containerisation** | Docker + Docker Compose |

---

## Repository Structure

```
se_project3/
│
├── backend/                        # Bun + Elysia API server
│   ├── src/
│   │   ├── index.ts                # Entry point — mounts all route modules
│   │   ├── config/
│   │   │   └── env.ts              # Typed environment variable loader
│   │   ├── modules/                # HTTP route controllers (thin GRASP Controllers)
│   │   │   ├── auth.ts             # POST /auth/register|login|logout
│   │   │   ├── market.ts           # GET /stocks, GET /stocks/:ticker/history
│   │   │   ├── orders.ts           # POST|GET|DELETE /orders
│   │   │   ├── portfolio.ts        # GET /portfolio, GET /portfolio/history
│   │   │   ├── competitions.ts     # Full competition CRUD + leaderboard
│   │   │   └── indexes.ts          # GET /indexes (Yahoo Finance + Redis cache)
│   │   ├── domain/                 # Business logic — framework-independent
│   │   │   ├── orders/
│   │   │   │   ├── factory.ts      # Factory Method + Template Method: MarketOrder, LimitOrder, StopLossOrder
│   │   │   │   ├── validator.ts    # SRP: all order validation rules
│   │   │   │   ├── executor.ts     # ACID transaction: balance + holdings + order status
│   │   │   │   └── priceResolver.ts# Chain of Responsibility: Redis → DB → Yahoo → default
│   │   │   ├── portfolio/
│   │   │   │   └── portfolioService.ts  # Information Expert: P&L computation
│   │   │   └── market/
│   │   │       └── adapter.ts      # Adapter: IMarketDataAdapter → YahooFinanceAdapter
│   │   ├── lib/                    # Infrastructure adapters
│   │   │   ├── auth.ts             # Facade: JWT verify + Redis blacklist + user lookup
│   │   │   ├── db.ts               # Drizzle ORM + TimescaleDB connection
│   │   │   ├── redis.ts            # Redis client + pub/sub helpers
│   │   │   ├── kafka.ts            # Kafka producer/consumer setup
│   │   │   ├── priceCache.ts       # getLivePrice(): Redis → Yahoo fallback
│   │   │   └── wsHub.ts            # Observer: WebSocket broadcast hub
│   │   ├── workers/                # Background Kafka consumers
│   │   │   ├── priceTicksConsumer.ts   # Kafka price.ticks → DB + Redis + WS broadcast + order triggers
│   │   │   ├── ordersConsumer.ts       # Kafka orders.placed → executePendingOrder()
│   │   │   └── realMarketWorker.ts     # Polls Yahoo Finance for real tickers → price.ticks
│   │   ├── db/
│   │   │   └── schema.ts           # Drizzle schema: users, orders, holdings, price_ticks, competitions
│   │   └── types/                  # Shared TypeScript types
│   ├── drizzle/                    # Auto-generated Drizzle migrations
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                       # React + Vite single-page app
│   ├── src/
│   │   ├── main.tsx                # App entry point
│   │   ├── App.tsx                 # Root component + routing + layout
│   │   ├── api/
│   │   │   └── client.ts           # Facade: apiFetch() — base URL, auth header, error handling
│   │   ├── components/             # UI components
│   │   │   ├── AuthPage.tsx        # Full-screen login/register with glassmorphism UI
│   │   │   ├── IndexTicker.tsx     # Horizontal scrolling live index bar
│   │   │   ├── PriceTable.tsx      # Live stock price table
│   │   │   ├── OrderForm.tsx       # BUY/SELL order placement form
│   │   │   ├── OrderHistory.tsx    # Filterable order list + cancel button
│   │   │   ├── PortfolioCard.tsx   # Holdings tab + Trade history tab + analytics chart
│   │   │   ├── CompetitionBoard.tsx# Competition leaderboard
│   │   │   └── ProfilePanel.tsx    # User profile + account metrics
│   │   ├── hooks/
│   │   │   └── usePriceSocket.ts   # WebSocket hook — Observer: updates Zustand store on each tick
│   │   ├── store/
│   │   │   ├── marketStore.ts      # Zustand: live price state
│   │   │   └── authStore.ts        # Zustand: user session state
│   │   └── styles.css              # Global styles
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── sim/                            # Python market simulator (standalone process)
│   ├── app/
│   │   ├── main.py                 # Entry point: generates ticks every 1s, publishes to Kafka
│   │   ├── strategies.py           # Price strategies: RandomWalk, MeanReversion, CircuitBreaker, UserInfluence
│   │   └── config.py               # Simulator config: tickers, volatility, interval
│   ├── requirements.txt            # confluent-kafka, python-dotenv
│   └── Dockerfile
│
├── infra/
│   ├── kafka/
│   │   └── init.sh                 # Creates Kafka topics on first boot:
│   │                               #   price.ticks, orders.placed, orders.filled,
│   │                               #   sim.control, competition.events
│   └── timescaledb/
│       └── init/
│           └── 01_schema.sql       # DB init: extensions, tables, hypertable (price_ticks),
│                                   #   continuous aggregates (ohlc_1m, ohlc_5m), indexes
│
├── scripts/
│   ├── bootstrap.sh                # Linux/macOS: installs backend + frontend + sim dependencies
│   └── bootstrap.ps1               # Windows (PowerShell): same as above
│
├── docker-compose.yml              # Orchestrates: timescaledb, redis, kafka, kafka-init, backend, sim
├── .env.example                    # Template for all required environment variables
├── REPORT.md                       # SE project report (Tasks 1–4)
└── README.md                       # This file
```

---

## Prerequisites

Install the following on every developer machine:

| Tool | Version | Purpose |
|------|---------|---------|
| **Docker + Docker Compose** | Latest | Runs TimescaleDB, Redis, Kafka |
| **Bun** | v1.1+ | Runs and builds the backend |
| **Node.js** | v20+ | Runs the frontend (Vite dev server) |
| **Python** | v3.11+ | Runs the simulator |

---

## Environment Setup

### 1. Clone the repository

```bash
git https://github.com/deepsarda25/INVEXA_V3.git
cd se_project16
```

### 2. Create your `.env` file

```bash
# Linux / macOS
cp .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env
```

Open `.env` and verify/set the following critical values:

```env
# Database
DATABASE_URL=postgresql://invexa:invexa@localhost:5432/invexa

# Redis
REDIS_URL=redis://localhost:6379

# Kafka (use localhost ports when running app services locally)
KAFKA_BROKERS=localhost:9094

# Auth
JWT_SECRET=your-secret-here

# Frontend (Vite)
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000

# Simulator
SIM_TICKERS=FAKE,TSIM,NOVA,ALFA,ZENX
SIM_INTERVAL_MS=1000
SIM_STRATEGY=random_walk
```

### 3. Install dependencies

```bash
# Linux / macOS
chmod +x scripts/bootstrap.sh
./scripts/bootstrap.sh

# Windows (PowerShell)
./scripts/bootstrap.ps1
```

This runs:
- `bun install` inside `backend/`
- `npm install` inside `frontend/`
- Creates a Python virtualenv inside `sim/.venv` and installs `requirements.txt`

---

## Running the Project

There are two ways to run the system.

---

### Mode A — Recommended for Development

Runs infrastructure (DB, Redis, Kafka) in Docker, and the app services (backend, simulator, frontend) locally for fast iteration.

#### Step 1: Start infrastructure

```bash
docker compose up -d timescaledb redis kafka kafka-init
```

Wait ~10 seconds for Kafka to finish initialising topics.

#### Step 2: Start the backend

```bash
cd backend
bun run dev
```

The API server starts at **http://localhost:3000**.

#### Step 3: Start the simulator

```bash
# Linux / macOS
cd sim
./.venv/bin/python -m app.main

# Windows (PowerShell)
cd sim
.\.venv\Scripts\python -m app.main
```

You should see tick logs like:
```
Published FAKE @ 150.25 → price.ticks
Published TSIM @ 95.50  → price.ticks
```

#### Step 4: Start the frontend

```bash
cd frontend
npm run dev
```

The dashboard is available at **http://localhost:5173**.

---

### Mode B — Everything in Docker

Starts backend and simulator in Docker alongside the infrastructure. Useful for smoke testing or CI.

```bash
docker compose up -d --build timescaledb redis kafka kafka-init backend sim
```

Then start the frontend locally (it is not containerised):

```bash
cd frontend
npm run dev
```

To stop all containers:

```bash
docker compose down

# To also wipe all data volumes (fresh start):
docker compose down -v
```

---

## Verifying the System

Once all services are running, run these checks:

### 1. Backend health check

```bash
curl http://localhost:3000/health
# Expected: { "status": "ok" }
```

### 2. Register a user

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","email":"demo@example.com","password":"demopass123"}'
```

### 3. Check live stock prices

```bash
curl http://localhost:3000/stocks
```

If the simulator is running, prices should be changing each second.

### 4. Open the dashboard

Visit **http://localhost:5173** — you should see the live index ticker bar updating and stock prices streaming in real time.

---

## Key API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/auth/register` | Create account | No |
| `POST` | `/auth/login` | Get JWT token | No |
| `POST` | `/auth/logout` | Invalidate token | Yes |
| `GET` | `/stocks` | List all tickers with current price | No |
| `GET` | `/stocks/:ticker/history` | OHLC price history (`?range=1mo\|3mo\|1y`) | No |
| `GET` | `/indexes` | Live market indexes (Nifty, S&P 500, etc.) | No |
| `POST` | `/orders` | Place a market / limit / stop-loss order | Yes |
| `GET` | `/orders` | List user's orders (`?status=&ticker=`) | Yes |
| `DELETE` | `/orders/:id` | Cancel a pending order | Yes |
| `GET` | `/portfolio` | Live holdings + cash + unrealised P&L | Yes |
| `GET` | `/portfolio/history` | Paginated trade history | Yes |
| `GET` | `/competitions` | List public competitions | Yes |
| `POST` | `/competitions` | Create a competition | Yes |
| `POST` | `/competitions/:id/join` | Join a competition | Yes |
| `GET` | `/competitions/:id/leaderboard` | Get current rankings | Yes |
| `WS` | `/ws/prices` | WebSocket stream of live price ticks | No |

---

## Troubleshooting

### Prices not updating on the dashboard

1. Check the simulator is running and logging tick publications.
2. Verify the Kafka topic exists:
   ```bash
   docker exec -it invexa-kafka bash -lc \
     "/opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list"
   ```
3. Check the backend logs for `priceTicksConsumer` errors:
   ```bash
   # If running locally:
   # Look at terminal output of `bun run dev`
   
   # If running in Docker:
   docker logs invexa-backend --tail 50
   ```

### Kafka connection errors

- When running app services **locally**, use `KAFKA_BROKERS=localhost:9094` in `.env`.
- When running backend **inside Docker**, use `KAFKA_BROKERS=kafka:9092` (already set in `docker-compose.yml`).

### Frontend cannot reach the backend

- Confirm `VITE_API_URL=http://localhost:3000` and `VITE_WS_URL=ws://localhost:3000` in `.env`.
- Confirm the backend CORS config includes `http://localhost:5173`.

### Database errors on first boot

The TimescaleDB init script runs once on first container creation. If the schema is inconsistent:

```bash
docker compose down -v          # wipes volumes
docker compose up -d timescaledb redis kafka kafka-init
```

### Orders placed but never fill (limit/stop-loss)

Check Redis sorted sets to confirm the order was queued:

```bash
docker exec -it invexa-redis redis-cli
> ZRANGE limits:buy:FAKE 0 -1 WITHSCORES
```

If the key is empty, the order was not queued — check `orders.ts` route logs for validation errors.
