# Invexa — Design Document

> **Project:** Invexa (Fake Stock Exchange)
> **Stack:** Bun + Elysia (TypeScript backend) · React + Vite (frontend) · TimescaleDB · Kafka · Redis · Python sim

---

## 1. Features Implemented

### 1.1 Authentication System
- **Register / Login / Logout** routes (`/auth/register`, `/auth/login`, `/auth/logout`).
- Passwords hashed with **bcrypt** (`hashPassword` / `verifyPassword` in `lib/auth.ts`).
- Stateless **JWT** (via `@elysiajs/jwt`, 7-day expiry).
- **Session blacklist** in Redis → tokens are invalidated on logout (prevents replay).
- Route guard `authenticate()` helper shared across all protected modules.
- Frontend: full-screen **glassmorphism auth page** (`AuthPage.tsx`) — separate from the dashboard, with Login/Register tab toggle, role selector, loading spinner, and error feedback.

### 1.2 Real-Time Market Data (Simulated)
- Python simulator generates price ticks for synthetic tickers (FAKE, etc.) and publishes to Kafka topic `price.ticks`.
- Backend Kafka consumer persists ticks into **TimescaleDB** (`price_ticks` hypertable) and updates a Redis hash (`prices`).
- A Redis `pub/sub` channel (`price_channel`) pushes updates to all connected WebSocket clients (`/ws/prices`).
- Frontend: `usePriceSocket` hook subscribes to the WebSocket and writes prices into a **Zustand** store (`marketStore`); `PriceTable` and the Recharts line chart consume it.

### 1.3 Real-Time Market Indexes (Live External Data)
- New `GET /indexes` endpoint (`modules/indexes.ts`) fetches live quotes for **Nifty 50, Sensex, S&P 500, NASDAQ, Dow Jones** from Yahoo Finance's public v7 API.
- Results are **cached in Redis for 60 seconds** (TTL) to prevent hammering Yahoo Finance.
- Frontend: `IndexTicker.tsx` displays a horizontal scrollable bar of index cards with current value, absolute change, % change — all color-coded green/red.

### 1.4 User Portfolio Management
- `GET /portfolio` returns: cash balance, total holdings value, total portfolio value, unrealized P&L, and per-holding breakdown with live price and market value.
- `GET /portfolio/history` returns paginated trade history (orders with fill price, status, timestamps).
- Frontend `PortfolioCard.tsx` has two tabs: **Holdings** (live position table) and **History** (filled/cancelled orders with badges).

### 1.5 Order Placement System
- `POST /orders` — supports **Market**, **Limit**, and **Stop-Loss** order types for both BUY and SELL sides.
- Business rule validation: quantity > 0, sufficient balance for buys, sufficient holdings for sells, limit/trigger price required for non-market orders.
- Market orders execute immediately through `executePendingOrder` for deterministic UX; non-market orders are stored in Redis sorted sets keyed by ticker + side (for trigger matching).
- Execution price is resolved through a dedicated resolver pipeline (`OrderPriceResolver`) that checks Redis → TimescaleDB → explicit limit → Yahoo Finance → default fallback.
- `GET /orders` — lists orders with optional ticker and status filters.
- `DELETE /orders/:id` — cancels a pending order (removes from Redis sorted set + marks DB as cancelled).
- Frontend `OrderForm.tsx`: BUY/SELL toggle, live price display, order type description tooltip, colored submit button.
- Frontend `OrderHistory.tsx`: filter pills (All/Pending/Filled/Cancelled), cancel-pending button, auto-refresh every 10 s.

### 1.6 Portfolio Analytics + Profile UX
- New historical data route `GET /stocks/:ticker/history?range=1mo|3mo|6mo|1y|5y` for charting month/year trends.
- `PortfolioCard.tsx` includes holdings analytics, ticker/range selector, and growth chart (earnings + percentage change).
- Added `ProfilePanel.tsx`, wired from the top-right avatar, showing role, account identity, and account-level metrics.

### 1.7 Auth & Pricing Robustness Improvements
- Frontend API layer now auto-attaches persisted bearer token (`invexa-token`) when an explicit token arg is not supplied, preventing accidental unauthenticated protected calls.
- Yahoo-based price resolution now supports fallback hierarchy: `regularMarketPrice` → `regularMarketPreviousClose` → latest close from recent chart candles.
- This ensures executable prices are still available when markets are closed or live quote fields are null.

---

## 2. Design Patterns Used

### 2.1 Factory Method Pattern
**File:** `backend/src/domain/orders/factory.ts`

`OrderFactory.create(payload)` is the single entry point for creating any order object. Callers pass an `OrderPayload` and receive a `TradeOrder` interface — they never import `MarketOrder`, `LimitOrder`, or `StopLossOrder` directly.

```
OrderFactory.create({ type: "limit", ... })
        │
        ▼
  ┌─────────────┐
  │  LimitOrder │ implements TradeOrder
  └─────────────┘
```

**Why:** Decouples construction from usage. Adding a new order type (e.g. `trailing_stop`) requires only adding a new class and one `case` in the factory — existing callers are unaffected.

---

### 2.2 Template Method Pattern
**File:** `backend/src/domain/orders/factory.ts` — `BaseOrder` hierarchy

`BaseOrder.validate()` calls `OrderValidator.validateCommon()`. Subclasses (`LimitOrder`, `StopLossOrder`) override `validate()` to add their specific pre-checks *before* calling `super.validate()`. This defines an algorithm skeleton with customisable steps.

```
BaseOrder.validate()         ← template
  └── OrderValidator.validateCommon()

LimitOrder.validate()        ← concrete step
  ├── OrderValidator.validateLimitPrice()
  └── super.validate()       ← reuses template
```

---

### 2.3 Strategy Pattern (implicit)
**Files:** `domain/orders/factory.ts`, `lib/priceCache.ts`, `modules/orders.ts`

Each order subclass encapsulates a different **Redis key strategy** via `redisKey()`:
- `MarketOrder` → `null` (not queued in Redis)
- `LimitOrder` → `limits:buy:<TICKER>` or `limits:sell:<TICKER>`
- `StopLossOrder` → `stops:sell:<TICKER>`

The caller (`orders.ts` route) interacts only with the `TradeOrder` interface and calls `redisKey()` polymorphically — it doesn't know which subclass is being used.

---

### 2.4 Observer Pattern
**Files:** `backend/src/lib/wsHub.ts`, `lib/redis.ts` (Redis pub/sub), `frontend/src/hooks/usePriceSocket.ts`

The system uses two observer layers:
1. **Redis Pub/Sub** — backend subscribes to `price_channel`; when the Kafka consumer writes a new tick, it publishes to the channel, triggering a broadcast.
2. **WebSocket hub** — `wsHub.ts` maintains a `Set<SocketClient>` (the subscriber list). `broadcastPrice()` is the `notify()` call. Frontend `usePriceSocket` is the concrete observer that updates the Zustand store.

---

### 2.5 Repository Pattern (lightweight)
**Files:** `modules/portfolio.ts`, `modules/orders.ts`, `lib/db.ts`

All DB access goes through **Drizzle ORM** query builders in the module files, treating the DB layer as a repository. `PortfolioService.buildSummary()` receives pre-fetched data and never touches the DB directly — it operates purely on in-memory data + Redis.

---

### 2.6 Facade Pattern
**Files:** `backend/src/index.ts`, `lib/auth.ts`

`authenticate(ctx)` is a **facade** over JWT verification + Redis session checks + user DB lookup — callers get a clean `{ user, token }` object without knowing about any of those steps.

---

### 2.7 Chain of Responsibility + Strategy (price resolution)
**Files:** `backend/src/domain/orders/priceResolver.ts`, `backend/src/modules/orders.ts`

`OrderPriceResolver` processes an ordered list of price providers (Redis, TimescaleDB, explicit order limit, Yahoo, default).

- **Chain of Responsibility:** Each source gets a chance to resolve price and passes control onward when it cannot.
- **Strategy:** Each price provider encapsulates a distinct algorithm behind a common interface.

This keeps order placement logic stable while allowing new sources (e.g., broker feed, valuation model) to be added without changing route/controller code.

---

### 2.8 Defensive Facade (frontend API auth)
**File:** `frontend/src/api/client.ts`

`apiFetch()` acts as a lightweight facade for HTTP concerns (base URL, content-type, auth header, API error translation).

- It now follows a defensive token strategy: explicit token parameter first, then persisted token fallback from storage.
- This reduces coupling between each component and auth header wiring, and keeps protected API usage consistent.

---

## 3. SOLID Principles

### S — Single Responsibility Principle
| Class / File | Responsibility |
|---|---|
| `OrderValidator` | Validate order business rules only |
| `OrderFactory` | Construct order objects only |
| `OrderPriceResolver` | Resolve executable price through source chain only |
| `executePendingOrder` (`executor.ts`) | Execute and settle pending order transaction only |
| `apiFetch` | Standardize API calls + auth header/error handling only |
| `PortfolioService` | Compute portfolio value & P/L only |
| `wsHub.ts` | Manage WebSocket clients & broadcast only |
| `priceCache.ts` | Read price from Redis only |
| `portfolio.ts` (route) | HTTP controller: auth, fetch from DB, delegate computation |

Before the refactor, `portfolio.ts` contained inline P/L computation and DB queries mixed in the same handler function — violating SRP. After extracting `PortfolioService`, the handler is a thin controller.

### O — Open/Closed Principle
`TradeOrder` interface + `BaseOrder` + `OrderFactory` are **closed for modification but open for extension**. To add a `TrailingStop` order type:
1. Write `class TrailingStopOrder extends BaseOrder { ... }`.
2. Add `case "trailing_stop"` in `OrderFactory.create()`.
3. Zero changes to `orders.ts`, `workers/`, or any consumer.

### L — Liskov Substitution Principle
`LimitOrder` and `StopLossOrder` are substitutable for `TradeOrder` anywhere in the codebase. The route handler in `orders.ts` uses only `TradeOrder.validate()` and `TradeOrder.redisKey()` — both are correctly implemented by every subclass.

### I — Interface Segregation Principle
`TradeOrder` exposes only two methods: `validate()` and `redisKey()`. No subclass is forced to implement methods it doesn't need. The WebSocket hub exposes `addPriceClient`, `removePriceClient`, `broadcastPrice` as **separate exports** so consumers can import only what they need.

### D — Dependency Inversion Principle
- `BaseOrder.validate()` depends on the **abstraction** `OrderValidator` (static methods as an interface), not on concrete implementation details.
- `orders.ts` depends on `OrderPriceResolver` abstraction (price resolution pipeline), not hard-coded source logic.
- `PortfolioService` depends on `getLivePrice` (can be mocked/swapped) rather than importing `redis` directly.
- The frontend API layer (`api/client.ts`) is depended on by components; auth/header concerns are centralized behind `apiFetch`, making components simpler and less error-prone.

---

## 4. GRASP Principles

### Information Expert
`PortfolioService` is the expert for portfolio computation because it has access to both holdings and a live price resolver. The route handler has the HTTP context; the service has the domain knowledge.

### Creator
`OrderFactory` is responsible for creating `TradeOrder` instances — it contains the knowledge of all concrete classes. No other file creates order objects directly.

### Controller
Route handlers in `modules/` act as **controllers** — they receive HTTP requests, delegate to domain services (`PortfolioService`, `OrderFactory`, `OrderValidator`), and return responses. They contain no business logic themselves.

### Low Coupling
- `IndexTicker.tsx` only depends on `apiFetch` and `useQuery` — no coupling to order or portfolio logic.
- `OrderValidator` has zero imports — it is a pure validation class with no coupling to DB, Redis, or frameworks.
- `OrderPriceResolver` isolates external price-source coupling from `orders.ts` route logic.
- `PortfolioService` depends only on `getLivePrice` (Redis abstraction) — not on Elysia, Drizzle, or Kafka.

### High Cohesion
Each module is tightly focused:
- `domain/orders/` — everything about order creation and validation.
- `domain/portfolio/` — everything about portfolio value computation.
- `lib/` — infrastructure adapters (DB, Redis, Kafka, WS Hub).
- `modules/` — HTTP route controllers.
- `workers/` — background consumers.

---

## 5. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React + Vite, http://localhost:5173)         │
│                                                          │
│  AuthPage ──▶ useAuthStore (Zustand) ──▶ /auth/*       │
│  IndexTicker ──▶ React Query ──▶ GET /indexes           │
│  Dashboard tabs:                                         │
│    Market: PriceTable + Chart (WebSocket + REST)         │
│    Portfolio: PortfolioCard (Holdings + History tabs)    │
│    Orders: OrderForm + OrderHistory                      │
│    Competition: CompetitionBoard                         │
└────────────────────────┬───────────────────────────────-┘
                         │ HTTP / WebSocket
┌────────────────────────▼────────────────────────────────┐
│  Backend (Bun + Elysia, http://localhost:3000)          │
│                                                          │
│  modules/ ── route controllers (thin GRASP Controllers)  │
│    auth.ts · market.ts · orders.ts · portfolio.ts        │
│    indexes.ts (Yahoo Finance + Redis cache)              │
│                                                          │
│  domain/ ── business logic                               │
│    orders/factory.ts   ← Factory Method + Template       │
│    orders/validator.ts ← SRP validation                  │
│    portfolio/portfolioService.ts ← Information Expert    │
│                                                          │
│  lib/ ── infrastructure adapters                         │
│    auth.ts · db.ts · redis.ts · kafka.ts                 │
│    priceCache.ts · wsHub.ts (Observer hub)               │
│                                                          │
│  workers/ ── Kafka consumers                             │
│    priceConsumer → TimescaleDB + Redis + WS broadcast    │
│    orderWorker  → fills orders, updates balances         │
└──────────┬────────────────────────────┬─────────────────┘
           │ Kafka                      │ Redis
┌──────────▼───────────┐   ┌───────────▼─────────────────┐
│  TimescaleDB         │   │  Redis                       │
│  price_ticks (TS)    │   │  prices hash (live cache)    │
│  orders              │   │  limits:buy/sell:TICKER      │
│  holdings            │   │  stops:sell:TICKER           │
│  users               │   │  session:active / blacklist  │
│  ohlc_1m / ohlc_5m   │   │  indexes:snapshot (60s TTL)  │
└──────────────────────┘   └─────────────────────────────-┘
           ▲
           │ Kafka price.ticks
┌──────────┴───────────┐
│  Python Sim          │
│  (GBM + strategies)  │
└──────────────────────┘
```

---

## 6. Key Files Reference

| File | Role |
|---|---|
| `backend/src/domain/orders/factory.ts` | Factory Method + Template Method, order hierarchy |
| `backend/src/domain/orders/validator.ts` | SRP: all validation logic |
| `backend/src/domain/portfolio/portfolioService.ts` | Information Expert: P/L computation |
| `backend/src/modules/indexes.ts` | Yahoo Finance integration + Redis cache |
| `backend/src/lib/wsHub.ts` | Observer: WebSocket broadcast hub |
| `backend/src/lib/auth.ts` | Facade: JWT + Redis session guard |
| `frontend/src/components/AuthPage.tsx` | Full-screen auth UI |
| `frontend/src/components/IndexTicker.tsx` | Live index display bar |
| `frontend/src/components/PortfolioCard.tsx` | Holdings + history tabs |
| `frontend/src/components/OrderForm.tsx` | BUY/SELL order placement |
| `frontend/src/components/OrderHistory.tsx` | Order list + cancel |
| `frontend/src/store/marketStore.ts` | Zustand: real-time price state (Observer consumer) |
