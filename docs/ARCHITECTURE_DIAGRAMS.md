# Invexa System Architecture - Visual Diagrams

## 1. Price Flow Diagram: How Prices Move

```
╔════════════════════════════════════════════════════════════════════════════╗
║                       FAKE STOCK PRICE GENERATION                          ║
╚════════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ PYTHON SIMULATOR (Standalone Process)                              │   │
│  │ File: /sim/app/main.py                                             │   │
│  │                                                                     │   │
│  │ while running:                                                      │   │
│  │   for ticker in [FAKE, TSIM, NOVA, ALFA, ZENX]:                   │   │
│  │     price[ticker] = strategy.next_price(price[ticker])             │   │
│  │     publish({ ticker, price, volume, ts }) → Kafka                 │   │
│  │     sleep(1 second)                                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│           │                                                                 │
│           │ "price.ticks" topic (Kafka)                                     │
│           ├─ Key: ticker (FAKE, TSIM, etc.)                                │
│           ├─ Value: { ticker, price, volume, ts }                          │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ TYPESCRIPT CONSUMER (Backend)                                       │   │
│  │ File: src/workers/priceTicksConsumer.ts                             │   │
│  │                                                                     │   │
│  │ for each message in price.ticks:                                    │   │
│  │   1. Parse: { ticker, price, volume, ts }                           │   │
│  │   2. INSERT price_ticks (TimescaleDB)                               │   │
│  │   3. UPDATE Redis: prices:{ticker}={price, ts}                      │   │
│  │   4. PUBLISH price_channel: {ticker, price}                         │   │
│  │   5. QUEUE triggered orders (limit/stop-loss)                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│           │       │                    │                                    │
│           │       │                    │                                    │
│           ▼       ▼                    ▼                                    │
│      TimescaleDB  Redis            Kafka (orders.placed)                   │
│      (history)    (cache)          (triggered orders)                       │
│      price_ticks  prices           ▼                                        │
│                   hash             Order Executor                          │
│                   ├─ FAKE:150.25   executePendingOrder()                   │
│                   ├─ TSIM:95.50                                            │
│                   └─ TTL: 5s        Fills order at Redis price             │
│                                     Updates user balance & holdings         │
│                                     Publishes orders.filled event           │
│                                                                             │
│                                     ▼                                       │
│                                  FRONTEND                                   │
│                                  (WebSocket)                               │
│                                  ├─ Price updates                          │
│                                  ├─ Portfolio P&L                          │
│                                  └─ Order fills                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Order Execution: User Buy/Sell Flow

```
╔════════════════════════════════════════════════════════════════════════════╗
║                      ORDER EXECUTION PIPELINE                              ║
╚════════════════════════════════════════════════════════════════════════════╝

USER ACTION (Frontend)
    │
    ├─ Ticker: FAKE
    ├─ Type: market|limit|stop_loss
    ├─ Side: buy|sell
    ├─ Quantity: 100
    └─ LimitPrice: optional
    │
    ▼
POST /orders (Backend)
    │
    ├─ Authenticate user
    │
    ├─ RESOLVE PRICE
    │  │
    │  ├─ Call getLivePrice("FAKE")
    │  │  │
    │  │  └─ Try Redis cache:
    │  │     If hit: return cached price { price: 150.25, ts: now }
    │  │     If miss: fetch from Yahoo (fallback for real stocks)
    │  │
    │  └─ Returns: price=150.25, source="simulator"
    │
    ├─ VALIDATE ORDER
    │  │
    │  ├─ Check quantity > 0 ✓
    │  │
    │  ├─ If BUY:
    │  │  └─ Check: balance >= quantity * price
    │  │     ✗ Reject if insufficient funds
    │  │
    │  ├─ If SELL:
    │  │  └─ Check: holdings >= quantity
    │  │     ✗ Reject if insufficient holdings (not rejecting now as we are allowing short selling as well to be similar to real market apps )
    │  │
    │  └─ If LIMIT|STOP:
    │     └─ Check: limitPrice > 0
    │
    ├─ CREATE ORDER
    │  │
    │  └─ INSERT orders table:
    │     {
    │       id: uuid,
    │       user_id: "user123",
    │       ticker: "FAKE",
    │       type: "market",
    │       side: "buy",
    │       quantity: 100,
    │       limit_price: null,
    │       status: "pending",
    │       created_at: now
    │     }
    │
    ├─ EXECUTE (if market order)
    │  │
    │  └─ executePendingOrder(orderId, preferredPrice=150.25)
    │     │
    │     ├─ BEGIN TRANSACTION
    │     │  │
    │     │  ├─ Lock order row (FOR UPDATE)
    │     │  ├─ Lock user row (FOR UPDATE)
    │     │  ├─ Lock holdings row (FOR UPDATE)
    │     │  │
    │     │  ├─ BUY SIDE:
    │     │  │  │
    │     │  │  ├─ cost = quantity * price
    │     │  │  │  = 100 * 150.25 = ₹15,025
    │     │  │  │
    │     │  │  ├─ Check: balance >= cost
    │     │  │  │  OLD: balance=100,000
    │     │  │  │  NEW: balance=100,000 - 15,025 = 84,975 ✓
    │     │  │  │
    │     │  │  ├─ Update holdings:
    │     │  │  │  OLD: FAKE quantity=0, avgCost=0
    │     │  │  │  NEW: FAKE quantity=100, avgCost=150.25
    │     │  │  │
    │     │  │  └─ Formula for avgCost:
    │     │  │     newAvg = (oldQty*oldAvg + newQty*newPrice) / (oldQty+newQty)
    │     │  │           = (0*0 + 100*150.25) / 100 = 150.25
    │     │  │
    │     │  ├─ SELL SIDE:
    │     │  │  │
    │     │  │  ├─ Check: holdings >= quantity
    │     │  │  │  HAVE: 150 FAKE, WANT: 50 ✓
    │     │  │  │
    │     │  │  ├─ proceeds = quantity * price = 50 * 150.25 = ₹7,512.50
    │     │  │  │
    │     │  │  ├─ Update balance:
    │     │  │  │  OLD: balance=84,975
    │     │  │  │  NEW: balance=84,975 + 7,512.50 = 92,487.50
    │     │  │  │
    │     │  │  └─ Update holdings:
    │     │  │     OLD: quantity=150, avgCost=150.25
    │     │  │     NEW: quantity=100, avgCost=150.25 (unchanged)
    │     │  │
    │     │  ├─ UPDATE orders SET status='filled', filled_price=150.25
    │     │  │
    │     │  └─ COMMIT TRANSACTION
    │     │
    │     └─ If commit fails → ROLLBACK (atomicity guaranteed)
    │
    ├─ PUBLISH EVENT (orders.filled)
    │  │
    │  ├─ Key: orderId
    │  ├─ Value: {
    │  │   orderId: "order123",
    │  │   userId: "user123",
    │  │   ticker: "FAKE",
    │  │   side: "buy",
    │  │   quantity: 100,
    │  │   filledPrice: 150.25,
    │  │   filledAt: now
    │  │ }
    │  │
    │  └─ Consumers:
    │     ├─ Leaderboard service (for ranking)
    │     ├─ Analytics service (for stats)
    │     └─ Frontend (WebSocket notification)
    │
    └─ RESPONSE to user:
       {
         orderId: "order123",
         status: "filled",
         filledPrice: 150.25,
         note: "Market order executed"
       }


LIMIT ORDER FLOW (Different!)
    │
    └─ Instead of execute immediately:
       │
       ├─ Store order with status="pending"
       │
       ├─ Add to Redis sorted set:
       │  │
       │  ├─ Key: limits:buy:FAKE (for buy limit)
       │  │  OR  limits:sell:FAKE (for sell limit)
       │  │
       │  ├─ Member: orderId
       │  ├─ Score: limitPrice
       │  │
       │  └─ Example: ZADD limits:buy:FAKE 145.00 order123
       │
       ├─ When price tick arrives at priceTicksConsumer:
       │  │
       │  ├─ Get all buy limit orders:
       │  │  ZRANGEBYSCORE limits:buy:FAKE currentPrice +inf
       │  │
       │  ├─ If currentPrice=145.00:
       │  │  └─ Query returns [order123] (trigger price hit!)
       │  │
       │  ├─ Publish to orders.placed topic
       │  │
       │  └─ ordersConsumer picks it up and calls executePendingOrder()
       │
       └─ Order filled when condition met (asynchronous)
```

---

## 3. Portfolio P&L Calculation

```
╔════════════════════════════════════════════════════════════════════════════╗
║                    PORTFOLIO SNAPSHOT & P&L                                ║
╚════════════════════════════════════════════════════════════════════════════╝

GET /portfolio (User Action)
    │
    ▼
PortfolioService.buildSummary(userHoldings, cashBalance)
    │
    ├─ FOR EACH holding in user's portfolio:
    │  │
    │  ├─ Ticker: FAKE
    │  │ Quantity: 100
    │  │ AvgCost: 150.25
    │  │
    │  ├─ GET current price from Redis:
    │  │  getLivePrice("FAKE")
    │  │  ├─ Redis hit: "prices" hash
    │  │  ├─ Value: { price: 152.50, ts: 1234567890 }
    │  │  └─ Returns: 152.50
    │  │
    │  ├─ CALCULATE holding metrics:
    │  │  │
    │  │  ├─ marketValue = livePrice * quantity
    │  │  │               = 152.50 * 100
    │  │  │               = ₹15,250
    │  │  │
    │  │  ├─ unrealizedPnl = (livePrice - avgCost) * quantity
    │  │  │                 = (152.50 - 150.25) * 100
    │  │  │                 = 2.25 * 100
    │  │  │                 = +₹225 ✓ PROFIT
    │  │  │
    │  │  ├─ pnlPercent = (unrealizedPnl / (avgCost * quantity)) * 100
    │  │  │             = (225 / 15,025) * 100
    │  │  │             = 1.50%
    │  │  │
    │  │  └─ return {
    │  │      ticker: "FAKE",
    │  │      quantity: 100,
    │  │      avgCost: 150.25,
    │  │      livePrice: 152.50,
    │  │      marketValue: 15,250,
    │  │      unrealizedPnl: 225
    │  │    }
    │  │
    │  └─ CONTINUE for next holding...
    │
    ├─ AGGREGATE portfolio totals:
    │  │
    │  ├─ cash = virtualBalance = 84,975
    │  │
    │  ├─ totalHoldingsValue = SUM(marketValue for all holdings)
    │  │                      = 15,250 + (other holdings)
    │  │
    │  ├─ totalPortfolioValue = cash + totalHoldingsValue
    │  │                       = 84,975 + 15,250
    │  │                       = 100,225
    │  │
    │  ├─ totalUnrealizedPnl = SUM(unrealizedPnl for all holdings)
    │  │                      = 225 + (other holdings PnL)
    │  │
    │  └─ totalReturn% = (totalUnrealizedPnl / initialCapital) * 100
    │                   = (225 / 100,000) * 100
    │                   = 0.225%
    │
    └─ RESPONSE to user:
       {
         cash: 84,975,
         totalHoldingsValue: 15,250,
         totalPortfolioValue: 100,225,
         totalUnrealizedPnl: 225,
         holdings: [
           {
             ticker: "FAKE",
             quantity: 100,
             avgCost: 150.25,
             livePrice: 152.50,
             marketValue: 15,250,
             unrealizedPnl: 225
           }
         ]
       }


EXAMPLE TIMELINE:
┌──────┬──────────┬────────┬──────────┬────────────┬─────────────┐
│ Time │ Price    │ Action │ Holdings │ Avg Cost   │ Market Val  │
├──────┼──────────┼────────┼──────────┼────────────┼─────────────┤
│ 9:00 │ ₹150.00  │ Buy 100│ 100 FAKE │ ₹150.00    │ ₹15,000     │
│      │          │        │ Balance: │            │ PnL: ₹0     │
│      │          │        │ 85,000   │            │             │
├──────┼──────────┼────────┼──────────┼────────────┼─────────────┤
│ 9:15 │ ₹152.50  │ (price │ 100 FAKE │ ₹150.00    │ ₹15,250     │
│      │ moves up │  update)│ Balance: │            │ PnL: +₹250  │
│      │          │        │ 85,000   │            │             │
├──────┼──────────┼────────┼──────────┼────────────┼─────────────┤
│ 9:30 │ ₹148.00  │ (price │ 100 FAKE │ ₹150.00    │ ₹14,800     │
│      │ goes down│  drop) │ Balance: │            │ PnL: -₹200  │
│      │          │        │ 85,000   │            │             │
├──────┼──────────┼────────┼──────────┼────────────┼─────────────┤
│ 9:45 │ ₹150.00  │ Sell 50│ 50 FAKE  │ ₹150.00    │ ₹7,500      │
│      │          │        │ Balance: │            │ PnL: ₹0     │
│      │          │        │ 92,500   │            │ Realized: 0 │
└──────┴──────────┴────────┴──────────┴────────────┴─────────────┘
```

---

## 4. Real Stocks vs Fake Stocks

```
╔════════════════════════════════════════════════════════════════════════════╗
║                    PRICE SOURCE ARCHITECTURE                               ║
╚════════════════════════════════════════════════════════════════════════════╝

FAKE STOCKS (Simulator)          │         REAL STOCKS (Yahoo Finance)
═════════════════════════════════╪═════════════════════════════════════════

Tickers:                          │ Tickers:
├─ FAKE                           │ ├─ RELIANCE.NS
├─ TSIM                           │ ├─ TCS.NS
├─ NOVA                           │ ├─ HDFCBANK.NS
├─ ALFA                           │ └─ INFY.NS
└─ ZENX                           │    (Configurable in .env)
                                  │
Source:                           │ Source:
└─ Python process (/sim/app)      │ └─ Yahoo Finance API (every 10s)
   Every 1 second                 │
                                  │
Strategy:                         │ Strategy:
├─ Random Walk                    │ ├─ Real market data
├─ Mean Reversion                 │ ├─ Actually traded
├─ Circuit Breaker                │ └─ Historical accuracy
└─ User Influence (optional)      │
                                  │
Topic:                            │ Topic:
└─ price.ticks (from Simulator)   │ └─ price.ticks (from RealMarketWorker)
   Key: FAKE                      │    Key: RELIANCE.NS
                                  │
Filtering:                        │ Filtering:
└─ priceTicksConsumer processes   │ └─ priceTicksConsumer processes
   all tickers uniformly          │    all tickers uniformly
                                  │
Price Cache:                      │ Price Cache:
├─ redis.hset("prices", "FAKE",   │ ├─ redis.hset("prices", "RELIANCE.NS",
│  "{ price: 150.25 }")           │ │  "{ price: 2845.50 }")
└─ TTL: 5 seconds                 │ └─ TTL: 5 seconds
                                  │
Portfolio Impact:                 │ Portfolio Impact:
├─ Same order execution           │ ├─ Same order execution
├─ Same P&L calculation           │ ├─ Same P&L calculation
└─ Indistinguishable by users     │ └─ Indistinguishable by users

User doesn't care about source!
All prices fetched via getLivePrice(ticker):
  1. Try Redis cache first
  2. Fallback to Yahoo Finance
  3. User always gets current market price
```

---

## 5. Competition Mode Architectures

```
╔════════════════════════════════════════════════════════════════════════════╗
║                   COMPETITION MODES - DATA FLOW                            ║
╚════════════════════════════════════════════════════════════════════════════╝

MODE 1: HISTORIC REPLAY
═══════════════════════════════════════════════════════════════════════════

[Competition Created]
        │
        ├─ Config:
        │  ├─ Stock: INFY.NS
        │  ├─ Period: Jan-Mar 2024
        │  ├─ Duration: 180 min
        │  └─ Speed: 60x
        │
        ▼
[Fetch Historical Data]
        │
        └─ Source: Yahoo Finance, NSE, or Alpha Vantage
           ├─ Query: INFY.NS prices from 2024-01-01 to 2024-03-31
           ├─ Format: OHLCV candles (1-min or 5-min)
           └─ Store: historical_data table
              (stock, timestamp, open, high, low, close, volume)

        ▼
[Calculate Replay Schedule]
        │
        ├─ Total candles: 36 (for 3 hours of 5-min bars)
        ├─ Total time: 180 minutes
        ├─ Tick interval: 180 min ÷ 36 = 5 min per candle
        ├─ With 60x speedup: 5 sec per candle
        └─ Wall-clock: Start at 00:00, emit 1 price every 5 sec

        ▼
[Start HistoricReplayWorker]
        │
        ├─ Read candles sequentially
        ├─ For each candle:
        │  ├─ Use close price
        │  ├─ Publish to price.ticks:
        │  │  { ticker: "INFY.NS", price: 2500.00, volume, ts }
        │  └─ Sleep 5 seconds (scaled time)
        │
        └─ Continue until end of candles

        ▼
[Normal Order Processing]
        │
        ├─ Users place orders (same API)
        ├─ Orders matched at historical prices
        ├─ Portfolio values calculated from historical data
        └─ Result: Users traded on EXACT same market conditions


MODE 2: CUSTOM DATA IMPORT
═══════════════════════════════════════════════════════════════════════════

[User Uploads CSV]
        │
        ├─ Format:
        │  timestamp,open,high,low,close,volume
        │  2024-01-01 09:15,500,502,499,501,1000000
        │  2024-01-01 09:20,501,503,500,502,950000
        │
        ▼
[Parse & Validate]
        │
        ├─ Check format
        ├─ Validate prices > 0
        ├─ Sort chronologically
        ├─ Calculate duration
        └─ Store in competition_custom_data

        ▼
[Create Custom Replay Worker]
        │
        ├─ Similar to historic replay
        ├─ Read from competition_custom_data (not historical_data)
        ├─ Scale duration: total_rows × tick_interval
        └─ Emit prices at specified intervals

        ▼
[Use Cases]
        │
        ├─ Backtest trading algorithms
        ├─ Test on hypothetical scenarios
        ├─ Use proprietary data
        ├─ Educational simulations
        └─ Reproducible research


MODE 3: SIMULATOR CONFIGURED
═══════════════════════════════════════════════════════════════════════════

[Admin Creates Competition]
        │
        ├─ Config:
        │  ├─ Strategy: mean_reversion
        │  ├─ Tickers: [CUSTOM1, CUSTOM2, CUSTOM3]
        │  ├─ Volatility: 0.01 (1%)
        │  ├─ Duration: 120 min
        │  └─ Starting Balance: 100,000
        │
        ▼
[Spawn Isolated Simulator Instance]
        │
        ├─ Container/Process per competition
        ├─ Environment:
        │  ├─ SIM_TICKERS=CUSTOM1,CUSTOM2,CUSTOM3
        │  ├─ SIM_STRATEGY=mean_reversion
        │  ├─ SIM_VOLATILITY=0.01
        │  ├─ SIM_KAFKA_BROKERS=...
        │  └─ SIM_COMPETITION_ID=comp123
        │
        ├─ Docker approach:
        │  └─ docker run -e SIM_TICKERS=... \
        │      invexa/simulator:latest
        │
        └─ Store metadata in competition_simulators table

        ▼
[Simulator Runs for Duration]
        │
        ├─ Generate prices independently
        ├─ Publish to price.ticks
        ├─ Users trade with real-time prices
        └─ Stop when duration expires

        ▼
[Optional: Runtime Control]
        │
        ├─ Change strategy:
        │  POST /competitions/123/strategy
        │  { strategy: "random_walk" }
        │
        ├─ Set buy/sell pressure:
        │  POST /competitions/123/strategy/pressure
        │  { pressure: 0.75 }  // 75% buy pressure
        │
        └─ Send via sim.control Kafka topic


MODE 4: REAL-TIME (Future)
═══════════════════════════════════════════════════════════════════════════

[Competition scheduled for market hours]
        │
        ├─ Start: 09:15 IST (market open)
        ├─ End: 15:30 IST (market close)
        ├─ Stocks: Real NSE/BSE tickers
        │
        ▼
[Real Market Data Feed]
        │
        ├─ Source: NSE or BSE live feed
        ├─ Prices updated tick-by-tick
        ├─ Publish to price.ticks
        └─ Users trade live (but virtual money)

        ▼
[Results Matter!]
        │
        ├─ Real market conditions
        ├─ No reproducibility (market is volatile)
        ├─ Educational value (learn from real moves)
        └─ Bragging rights (I beat real market trends!)
```

---

## 6. Database Schema Diagram

```
╔════════════════════════════════════════════════════════════════════════════╗
║                         COMPETITION TABLES                                 ║
╚════════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────┐
│ competitions                        │
├─────────────────────────────────────┤
│ id (PK, UUID)                       │
│ created_by (FK → users)             │
│ name (VARCHAR)                      │
│ mode (VARCHAR)                      │
│ config (JSONB)                      │  ← Mode-specific config
│ status (created|running|ended)      │
│ started_at (TIMESTAMP)              │
│ ended_at (TIMESTAMP)                │
│ created_at (TIMESTAMP)              │
└─────────────────────────────────────┘
        │
        ├─────────────────────────────────────┐
        │ ONE-TO-MANY                         │
        └─────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
        ▼           ▼           ▼
   ┌────────────┐ ┌──────────┐ ┌──────────────┐
   │ Historic   │ │ Custom   │ │ Simulators   │
   │ Data       │ │ Data     │ │              │
   ├────────────┤ ├──────────┤ ├──────────────┤
   │ id (PK)    │ │ id (PK)  │ │ id (PK)      │
   │ ticker     │ │ comp_id  │ │ comp_id (FK) │
   │ timestamp  │ │ (FK)     │ │ process_id   │
   │ open       │ │ ts       │ │ config       │
   │ high       │ │ price    │ │ started_at   │
   │ low        │ │ volume   │ │ stopped_at   │
   │ close      │ │ sequence │ │              │
   │ volume     │ │          │ │              │
   └────────────┘ └──────────┘ └──────────────┘


┌─────────────────────────────────────┐
│ competition_participants            │
├─────────────────────────────────────┤
│ id (PK, UUID)                       │
│ competition_id (FK)                 │
│ user_id (FK)                        │
│ joined_at (TIMESTAMP)               │
│ portfolio_value (NUMERIC)           │
│ pnl (NUMERIC)                       │
│ rank (INT)                          │
│ UNIQUE(competition_id, user_id)     │
└─────────────────────────────────────┘
        │
        │ ONE-TO-MANY
        │
        ▼
┌──────────────────────────────────────┐
│ competition_snapshots                │
├──────────────────────────────────────┤
│ id (PK, UUID)                        │
│ competition_id (FK)                  │
│ user_id (FK)                         │
│ snapshot_at (TIMESTAMP)              │
│ cash (NUMERIC)                       │
│ holdings_value (NUMERIC)             │
│ total_value (NUMERIC)                │
│ pnl (NUMERIC)                        │
└──────────────────────────────────────┘
(Taken every minute or every order)
```

---

## 7. Leaderboard Real-Time Update Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   LEADERBOARD CALCULATION PIPELINE                          │
└─────────────────────────────────────────────────────────────────────────────┘

1. ORDER FILLS
   │
   └─ orders.filled Kafka topic
      ├─ Event: { orderId, userId, filledPrice, ... }
      │
      ├─ Consumer: LeaderboardUpdater
      │  ├─ userId changed
      │  ├─ Portfolio value likely changed
      │  └─ Trigger snapshot
      │
      └─ INSERT competition_snapshots:
         {
           competition_id,
           user_id,
           snapshot_at: now,
           cash: (from DB),
           holdings_value: (calc),
           total_value: (sum),
           pnl: (total - starting)
         }

2. GET /competitions/:id/leaderboard
   │
   └─ Query:
      SELECT user_id, total_value, pnl
      FROM competition_snapshots cs
      WHERE competition_id = ?
      AND snapshot_at = (
        SELECT MAX(snapshot_at)
        FROM competition_snapshots
        WHERE competition_id = cs.competition_id
        AND user_id = cs.user_id
      )
      ORDER BY total_value DESC

3. RESPONSE
   │
   └─ [
        {
          rank: 1,
          userId: "user123",
          userName: "Alice",
          totalValue: 105000,
          pnl: 5000,
          pnlPercent: 5.0,
          holdingsValue: 15250,
          cash: 89750,
          lastUpdate: "2024-04-22T10:30:00Z"
        },
        {
          rank: 2,
          userId: "user456",
          userName: "Bob",
          totalValue: 103000,
          pnl: 3000,
          pnlPercent: 3.0,
          ...
        },
        ...
      ]

4. FRONTEND WEBSOCKET
   │
   ├─ Receive leaderboard update
   ├─ Highlight rank changes
   ├─ Show real-time P&L
   └─ Animate up/down movements
```

---

## Summary: Data Flow Chart

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  USER                    BACKEND                INFRASTRUCTURE           │
│  ════════════════════════════════════════════════════════════════════════ │
│                                                                          │
│  Place Order             Order Module           Kafka                    │
│      ↓                      ↓                   price.ticks             │
│      ├────────────→ Validate                    (from Simulator        │
│      │              Resolve Price ←────────────  or Real Market)         │
│      │              Execute                                              │
│      │              ↓                                                     │
│      │         [ACID Transaction]                                        │
│      │         ├─ Update balance                                         │
│      │         ├─ Update holdings              Redis Cache               │
│      │         ├─ Create order                 prices:{ticker}           │
│      │         └─ Publish event ──────────────→ {price, ts}              │
│      │                                          (updates constantly)      │
│      │                                                                    │
│      │         orders.filled                                             │
│      │         ↓                                                         │
│      └────────────────→ Portfolio                                        │
│                        Snapshot                 TimescaleDB              │
│                        ↓                        price_ticks             │
│         ┌──────────────────────────────────→ (historical record)         │
│         │                                                                │
│         │  Leaderboard                                                   │
│         │  Update                          Database                      │
│         │  ↓                                users (balance)              │
│         └────────────→ Snapshot Table       holdings (position)          │
│                       ↓                     orders (history)             │
│            Rank by total_value                                           │
│                       │                                                  │
│                       └────────→ GET /leaderboard                        │
│                                  ↓                                       │
│                           Response to User                               │
│                           (WebSocket)                                    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```
