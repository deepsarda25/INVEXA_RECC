# Invexa Reference Card - One Page Cheat Sheet

## ⚡ The Most Important Thing

**User orders DO NOT move fake stock prices**

```
Why? 
- Price from simulator: Random walk algorithm
- Order execution: Uses that price
- But order size/volume IGNORED by price generator
- Next price: Still from random walk, not affected by orders
```

---

## 🎮 4 Core Order Types

| Type | Execution | Trigger | Example |
|------|-----------|---------|---------|
| **Market** | Immediate | Now | Buy 100 FAKE @ current price |
| **Limit Buy** | Queued | Price ≤ limit | Buy 100 FAKE @ ₹145 |
| **Limit Sell** | Queued | Price ≥ limit | Sell 100 FAKE @ ₹155 |
| **Stop-Loss** | Queued | Price ≥ trigger | Sell 100 FAKE if price hits ₹160 |

---

## 💰 Portfolio Formula

```
Market Value = Quantity × Current Price
Unrealized P&L = (Current Price - Average Cost) × Quantity
Total Portfolio = Cash + Sum(All Holdings Market Value)
P&L % = (Unrealized P&L / Initial Balance) × 100

Example:
  Start: ₹100,000 cash
  Buy: 100 FAKE @ ₹150 → cash: ₹85,000, holdings: ₹15,000
  Price→₹155: → holdings: ₹15,500, P&L: +₹500 (+0.5%)
```

---

## 🏗️ 4 Competition Modes

| Mode | Source | Use Case | Duration | Fair? |
|------|--------|----------|----------|-------|
| **1. Historic** | Real data from API | Education, backtesting | Any period | ✅ |
| **2. Custom** | User CSV upload | Research, proprietary | Custom | ✅ |
| **3. Simulator** | Math-generated | Training, testing | Custom | ✅ |
| **4. Real-Time** | Live NSE/BSE | Real challenge | Market hrs | ❌ |

---

## 📊 System Architecture (One Minute)

```
┌─────────────────────────────┐
│   Python Simulator          │ (generates prices every 1s)
│   price = 150 × (1 + N())   │
└──────────────┬──────────────┘
               │
               ↓
┌──────────────────────────────────┐
│ Kafka Topic: price.ticks         │ (distributes to backend)
│ {ticker, price, volume, ts}      │
└──────────────┬───────────────────┘
               │
               ↓
┌──────────────────────────────────┐
│ Backend Consumer                 │
│ ├─ Store in TimescaleDB          │
│ ├─ Update Redis cache            │ ← Users read from here
│ └─ Trigger limit orders          │
└──────────────┬───────────────────┘
               │
               ↓
┌──────────────────────────────────┐
│ User Action                      │
│ POST /orders                     │
│ ├─ Get price from Redis cache    │
│ ├─ Execute order at that price   │
│ ├─ Update portfolio              │
│ └─ Broadcast update              │
└──────────────────────────────────┘
```

---

## 🔑 Key Concepts

### Price is Independent
```
Fact: 1,000 users buying doesn't move price
Reason: Simulator doesn't know about orders
Result: Fair market for all
```

### Orders Execute in Transaction
```
BEGIN
  ✓ Deduct balance
  ✓ Update holdings
  ✓ Mark order filled
COMMIT (all-or-nothing)
```

### Real-Time Updates
```
1s → New price generated
2s → Kafka publishes
3s → Redis updates
4s → Portfolio recalculates
5s → User sees P&L live
```

### Competitions Fair
```
All users:
  ✓ Same starting balance
  ✓ Same market prices
  ✓ Same order sequence
  ✗ Different strategies
  
Winner = Best strategy
```

---

## 📈 Order Execution Flow

### Market Order
```
User: POST /orders {type: market, side: buy, qty: 100}
  ↓
Backend: price = redis.get("FAKE") → ₹150.25
  ↓
Check: balance ≥ 100 × 150.25 ✓
  ↓
Execute: BEGIN TRANSACTION
  UPDATE users SET balance -= 15,025
  INSERT holdings qty=100, avgCost=150.25
  UPDATE orders SET status='filled'
  COMMIT
  ↓
Response: {status: 'filled', filledPrice: 150.25}
```

### Limit Order
```
User: POST /orders {type: limit, side: buy, qty: 100, limitPrice: 145}
  ↓
Backend: redis.zadd("limits:buy:FAKE", 145, orderId)
  ↓
Store: in DB with status='pending'
  ↓
When price hits 145:
  priceTicksConsumer triggers order
  ordersConsumer executes it
  → Market value: 100 × 145 = ₹14,500
```

---

## 💾 Database Quick Reference

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| users | Account info | id, email, virtual_balance |
| holdings | Current positions | user_id, ticker, quantity, avg_cost |
| orders | Trade history | id, user_id, ticker, status, filled_price |
| price_ticks | Market history | ticker, timestamp, price, volume |
| competitions | Contests | id, mode, config, status |
| competition_snapshots | Leaderboard | competition_id, user_id, total_value, pnl |

---

## 🚀 Implementation Roadmap

```
Phase 1: Setup (1-2 hours)
  ✓ Create database tables
  ✓ Define TypeScript types
  ✓ Set up API routes

Phase 2: Historic Replay (2-3 hours)
  ✓ Implement HistoricReplayWorker
  ✓ Test price emission
  ✓ Verify database storage

Phase 3: Simulator Service (2-3 hours)
  ✓ Implement SimulatorService
  ✓ Process management
  ✓ Configuration passing

Phase 4: Integration (2-3 hours)
  ✓ Add to order executor
  ✓ Portfolio snapshots
  ✓ Leaderboard queries

Phase 5: Frontend (1-2 hours)
  ✓ Competition UI
  ✓ Real-time leaderboard
  ✓ WebSocket updates
```

---

## 🐛 Debugging Checklist

| Issue | Check | Fix |
|-------|-------|-----|
| Prices not updating | Simulator running? Kafka flowing? | `docker logs sim` |
| Orders not filling | Redis has order? Price hit limit? | `redis-cli ZRANGE` |
| Portfolio stuck | Snapshots being taken? | Check DB snapshots |
| Leaderboard wrong | Latest snapshot data? Sorting logic? | Check query |
| High latency | Redis slow? DB slow? | Profile each layer |

---

## 🎯 Important Files

### For Understanding
- `QUICK_START.md` - 15 min intro
- `ARCHITECTURE_DIAGRAMS.md` - System design
- `PRICE_MECHANISM_AND_COMPETITION_IDEAS.md` - Deep dive

### For Implementing
- `IMPLEMENTATION_CODE_EXAMPLES.md` - Working code
- `backend/src/domain/orders/executor.ts` - Order logic
- `backend/src/workers/priceTicksConsumer.ts` - Price processing
- `sim/app/main.py` - Simulator

### For Configuring
- `backend/src/config/env.ts` - Environment variables
- `sim/app/config.py` - Simulator config
- `.env` - Runtime settings

---

## ✅ Production Checklist

Before going live:
- ✓ Database backups configured
- ✓ Kafka topics created & monitored
- ✓ Redis persistence enabled
- ✓ Error logging in place
- ✓ Load testing completed
- ✓ SSL/HTTPS enabled
- ✓ Rate limiting configured
- ✓ Monitoring alerts set

---

## 💡 Pro Tips

1. **Cache prices aggressively** - Redis hit rate > 95%
2. **Use database transactions** - No race conditions
3. **Monitor Kafka lag** - Should be < 1s
4. **Take frequent snapshots** - Every order or every minute
5. **Test with seeds** - Reproduce bugs consistently
6. **Log everything** - Timestamps, user_id, amount
7. **Scale horizontally** - Multiple backend instances

---

## 🌐 API Quick Reference

```
POST /orders
  body: {ticker, type, side, quantity, limitPrice?}
  → {orderId, status, filledPrice, note}

GET /portfolio
  → {cash, totalValue, holdings[], pnl}

POST /competitions
  body: {name, mode, config}
  → {competitionId}

POST /competitions/:id/join
  → {ok: true}

GET /competitions/:id/leaderboard
  → {leaderboard: [{rank, user, totalValue, pnl}]}
```

---

## 📊 Real Formulas (Math)

```
Random Walk Price:
  P(t+1) = P(t) × (1 + N(μ, σ))
  where N(μ=0.0005, σ=0.02)

Average Cost:
  newAvg = (oldQty × oldAvg + newQty × newPrice) / (oldQty + newQty)

P&L:
  unrealized = (currentPrice - avgCost) × quantity
  realized = (soldPrice - boughtPrice) × quantity

Portfolio Return:
  return% = (currentValue - initialValue) / initialValue × 100
```

---

## 🎮 Example Scenarios

### Scenario 1: User Buys and Sells
```
1. User buys 100 FAKE @ ₹150
   Balance: 100k → 85k, Holdings: 100 @ 150
2. Price goes to ₹160
   Holdings value: ₹16,000, P&L: +₹1,000
3. User sells 50 @ ₹160
   Balance: 85k → 93k, Holdings: 50 @ 150
4. P&L on sold: +(160-150)×50 = +₹500 (realized)
```

### Scenario 2: Competition with 3 Users
```
Start: All have ₹100,000
Market: Historic replay of INFY march 2024

User A: Buy and hold strategy
  - Buys 10 INFY @ ₹1,800 = ₹18,000
  - End price: ₹1,850
  - Final: ₹18,500 + ₹82,000 = ₹100,500 ← Rank 1

User B: Day trading strategy
  - 5 buys × 5 sells
  - Wins: +₹800, Loses: -₹300
  - Final: ₹100,500 (same as A!)

User C: No trading
  - Cash only: ₹100,000
  - Final: ₹100,000 ← Rank 3

Winner: A or B by 0.5%
```

---

## 🔗 Documentation Map

```
📖 START: QUICK_START.md
  ├─ For system overview: ARCHITECTURE_DIAGRAMS.md
  ├─ For deep dive: PRICE_MECHANISM_AND_COMPETITION_IDEAS.md
  ├─ For quick lookup: QUICK_REFERENCE.md
  ├─ For coding: IMPLEMENTATION_CODE_EXAMPLES.md
  ├─ For navigation: DOCUMENTATION_INDEX.md
  └─ For summary: DOCUMENTATION_SUMMARY.md
```

---

## ✨ Key Takeaway

```
Invexa is a fair trading simulation where:
  ✓ Prices generated independently (simulator)
  ✓ Orders execute at those prices (backend)
  ✓ P&L calculated in real-time (portfolio service)
  ✓ Competitions rank by performance (leaderboard)
  ✓ All with ZERO real money (virtual only)
```

---

**Print this card. Reference it daily. You've got this! 🚀**
