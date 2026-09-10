# Buy / Hold / Sell Recommendation Feature (v2)

This adds a rules-based stock recommendation engine to Invexa, covering NSE,
BSE, and US-listed stocks across 10 sectors. It is a **heuristic screening
signal**, not personalized financial advice, and not a validated trading
system.

## v2 changes (post-review fixes)

A self-review pass caught several correctness issues in the first version.
All of these are fixed in this version:

- **Wilder's RSI and Wilder's ATR**, smoothed across the full available
  series, instead of a rough "average of the last 14 diffs" approximation.
- **Annualized volatility** (stdev of daily log returns × √252 × 100)
  instead of a raw, un-annualized daily-return stdev — the old thresholds
  were miscalibrated (4% daily ≈ ~63% annualized, extremely high).
- **Direction-aware price levels.** A `SELL` signal no longer shows a
  long-style upside buy range/target. It shows a downside target zone and
  an upside *invalidation* level (a rally back above it weakens the sell
  case) instead.
- **Null-safe fundamentals.** `Number(null)` silently evaluates to `0`,
  which the old code's `Number.isFinite()` check let through as a "valid"
  zero. Fundamentals now use an explicit `finiteNumber()` helper that
  treats missing data as `null`, never `0`.
- **Sector-aware P/E ceiling** instead of one fixed `< 35` threshold shared
  by banks, IT, pharma, etc. (still a coarse static band, not live
  sector-relative percentiles — see Limitations below).
- **Momentum-chasing flag.** A stock up >25% in 20 sessions is no longer
  scored as strongly as a stock up 5-15% — very large recent moves are
  flagged as extended/higher-risk rather than rewarded outright.
- **Generic by design, not a fixed stock list.** The scoring engine
  (`buildRecommendation`) takes no hard-coded ticker list — it scores
  whatever ticker + data it's given. `universe.ts` is only a seed list for
  the sector-wide screen (so there's *something* to show by default); the
  single-stock endpoint works for any ticker.
- **USD → INR conversion.** The app's portfolio is INR-denominated but US
  stocks trade in USD. US recommendations now carry an `inrEquivalent`
  block (current price, buy/target/stop levels) converted at a fixed,
  clearly-labelled assumed rate (see below) — not a live FX feed.
- **Manual data entry for missing/thin data.** If Yahoo Finance has no or
  too little history for a ticker (e.g. a thinly-traded BSE name), the
  single-stock endpoint now returns `NO_DATA` with `manualEntryAvailable:
  true`, and a `POST` variant lets the user submit their own current price,
  indicator values, and/or fundamentals to get a best-effort score instead
  of a dead end. The Research page renders a small form for this
  automatically when it happens.
- **Redis caching + conservative concurrency**, unchanged from v1 in spirit
  but tightened (concurrency limit of 3, 15-minute cache) to stay well
  clear of Yahoo Finance rate limits on a full sector screen.

## USD/INR conversion

`backend/src/lib/currency.ts` exports a single constant:

```ts
export const USD_TO_INR_RATE = 95; // 1 USD = 95 INR, assumed fixed rate
```

Every USD-denominated recommendation carries both its native USD figures
(`currentPrice`, `levels.*`) *and* an `inrEquivalent` block with the same
figures converted at this rate, plus the rate itself and a note explaining
it's an assumption, not a live feed. If a live FX rate is wired in later,
this is the only place that needs to change.

## What was added

### Backend
- `backend/src/domain/recommendations/universe.ts` — curated seed list of
  ~20 real, liquid tickers per market (NSE `.NS`, BSE `.BO`, US) across 10
  sectors: Banking & Financial Services, Information Technology, Healthcare
  & Pharmaceuticals, Energy, Consumer Goods, Industrials, Automotive,
  Telecommunications, Real Estate, Utilities.
- `backend/src/domain/recommendations/recommendationEngine.ts` — the scoring
  model. Computes SMA(20/50/200), RSI(14), 20-day momentum, 20-day realized
  volatility, and ATR(14) from live daily OHLC history (your existing Yahoo
  Finance adapter), combines them with P/E, ROE, and debt-to-equity from
  your existing profile fetch, and produces a 0–100 score →
  `BUY` (≥68) / `HOLD` (≥42) / `SELL` (<42) / `NO_DATA` (insufficient
  history). Also derives a buy range, target range, and ATR-based
  stop-loss, a risk rating, a confidence level, and separate short-term /
  swing / long-term horizon views.
- `backend/src/modules/recommendations.ts` — two new endpoints (see below),
  mounted in `server.ts`. Results are cached in Redis for 15 minutes and
  fetched with a concurrency limit of 5 to stay within Yahoo Finance's
  rate limits.

### Frontend
- `frontend/src/components/RecommendationCard.tsx` — single-stock
  recommendation, embedded into the existing Stock Research / Terminal
  page.
- `frontend/src/components/RecommendationsPanel.tsx` — new **Recommendations**
  tab: filter by market/sector/signal, toggle between "top pick per sector"
  and "all results".
- `frontend/src/api/client.ts` — typed `getRecommendation()` /
  `getRecommendations()` helpers.
- `frontend/src/App.tsx`, `frontend/src/styles.css` — new tab + matching
  styles (uses your existing CSS variables and card/badge conventions).

## API

```
GET /recommendations?market=NSE|BSE|US&sector=<sector>&signal=BUY|HOLD|SELL|NO_DATA|ALL
```
Returns `{ results, topPicksBySector, weakestBySector, universeSize, scoredCount, generatedAt, source, disclaimer }`.

```
GET /stocks/:ticker/recommendation
```
Returns a single `Recommendation` object for any ticker (not just the
curated universe) using live Yahoo Finance data. If there's no/insufficient
history, returns `signal: "NO_DATA"` with `manualEntryAvailable: true`.

```
POST /stocks/:ticker/recommendation
Body: {
  currentPrice?: number,
  priceHistory?: { date, open?, high?, low?, close }[],
  technical?: { sma20?, sma50?, sma200?, rsi14?, momentum20Pct?, volatility20AnnualizedPct?, atr14? },
  fundamentals?: { peRatio?, pbRatio?, roe?, debtToEquity?, eps?, dividendYield?, marketCap? }
}
```
Scores a ticker using user-supplied data, optionally blended with whatever
live data Yahoo does have (`dataSource: "MIXED"`), or entirely on its own
(`dataSource: "USER_PROVIDED"`) when Yahoo has nothing. Only `currentPrice`
is required — everything else is used if provided and simply skipped if not.

```
GET /recommendations/meta
```
Returns the list of markets, sectors, signals, and the disclaimer text —
handy for building filter UIs.

### Recommendation fields
Each result includes: `ticker`, `name`, `market`, `sector`, `signal`,
`score`, `confidence`, `riskRating`, `currentPrice`, `currency`,
`inrEquivalent` (USD tickers only), `levels` (`buyRange`/`targetRange`/
`stopLoss`, direction-aware for `SELL`), `levelBasis` (plain-English
description of how the levels were derived), `horizon` (short-term / swing
/ long-term view), `technical` (SMA20/50/200, Wilder RSI14, 20D momentum,
annualized 20D volatility, Wilder ATR14), `fundamentals` (P/E, P/B, ROE,
debt-to-equity, EPS, dividend yield, market cap — `null` when genuinely
missing, never a false `0`), `reasons` (plain-English drivers of the
score), `dataPoints`, `dataSource` (`LIVE` / `MIXED` / `USER_PROVIDED`),
`manualEntryAvailable`, `timestamp`, `source`, and `disclaimer`.

## Running it

```bash
cd backend
bun install
bun run dev

cd frontend
npm install
npm run dev
```

Try it directly:
```bash
curl "http://localhost:3000/recommendations?market=US&signal=BUY"
curl "http://localhost:3000/recommendations?market=NSE&sector=Information%20Technology"
curl "http://localhost:3000/stocks/AAPL/recommendation"
```

## Notes / caveats
- This has been type-checked (`tsc --noEmit`) on both backend and frontend,
  and the frontend build (`vite build`) succeeds. The scoring engine was
  smoke-tested against synthetic uptrending/downtrending price series, the
  SELL-direction level logic, the USD→INR conversion, the manual-data path,
  and the null-vs-zero fundamentals fix.
- The universe list is a static seed of well-known names — swap in your own
  list in `universe.ts`, or wire `/recommendations` to your DB-backed
  ticker list if you want full market coverage instead of a curated set.
  The engine itself never restricts which tickers it can score.
- The 1 USD = 95 INR rate is a fixed assumption, not a live FX feed —
  see `backend/src/lib/currency.ts` if you want to wire in a real one.
- The sector P/E ceilings in `recommendationEngine.ts` are coarse static
  bands, not live sector-relative percentiles against real peer data — good
  enough to stop comparing a bank and a software company on the same P/E
  scale, not a substitute for a proper valuation model.
- Yahoo Finance can rate-limit heavy concurrent use. If you widen the
  universe a lot, consider raising the Redis TTL in
  `backend/src/modules/recommendations.ts` (`RESULT_TTL_SECONDS`) or
  lowering `CONCURRENCY` (currently 3).
- This is a heuristic technical/fundamental screening tool, not investment
  advice, and not a backtested trading strategy — the UI disclaimer text
  should stay intact wherever these numbers are shown.
