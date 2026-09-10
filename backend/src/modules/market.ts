import { Elysia, t } from "elysia";
import { sql } from "../lib/db";
import { getLivePrice } from "../lib/priceCache";
import { addPriceClient, removePriceClient } from "../lib/wsHub";
import { redis } from "../lib/redis";
import { normalizeTicker, toYahooSymbol } from "../domain/market/tickerSymbols";
import { marketAdapter } from "../domain/market/adapter";
import { getMarketSession, getLastTradingDayWindow } from "../domain/market/marketHours";
import { getCachedProfile } from "../lib/profileCache";
import { getPreviousClose } from "../lib/previousClose";

type HistoryRange = "1d" | "1w" | "1mo" | "3mo" | "6mo" | "1y" | "3y" | "5y" | "max";

const RANGE_MS: Record<HistoryRange, number> = {
  "1d": 1 * 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1mo": 30 * 24 * 60 * 60 * 1000,
  "3mo": 91 * 24 * 60 * 60 * 1000,
  "6mo": 182 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
  "3y": 3 * 365 * 24 * 60 * 60 * 1000,
  "5y": 5 * 365 * 24 * 60 * 60 * 1000,
  "max": 20 * 365 * 24 * 60 * 60 * 1000
};

// Bucket size used both for the Yahoo `interval` param and for the TimescaleDB fallback query.
const DB_BUCKET: Record<HistoryRange, string> = {
  "1d": "5 minutes",
  "1w": "30 minutes",
  "1mo": "4 hours",
  "3mo": "8 hours",
  "6mo": "12 hours",
  "1y": "1 day",
  "3y": "3 days",
  "5y": "1 week",
  "max": "1 month"
};

const YAHOO_INTERVAL: Record<HistoryRange, string> = {
  "1d": "5m",
  "1w": "30m",
  "1mo": "1d",
  "3mo": "1d",
  "6mo": "1d",
  "1y": "1d",
  "3y": "1wk",
  "5y": "1wk",
  "max": "1mo"
};

async function fetchYahooHistory(ticker: string, range: HistoryRange) {
  try {
    if (range === "1d") {
      const { start, end } = getLastTradingDayWindow(ticker);
      const history = await marketAdapter.getHistoricalPrices(ticker, start, YAHOO_INTERVAL[range]);
      // Yahoo has no "period2" plumbed through the adapter today, so trim client-side to the target day.
      return history.filter((p) => {
        const t = new Date(p.time).getTime();
        return t >= start.getTime() && t <= end.getTime();
      });
    }

    const period1 = new Date(Date.now() - RANGE_MS[range]);
    const history = await marketAdapter.getHistoricalPrices(ticker, period1, YAHOO_INTERVAL[range]);
    return history;
  } catch (err: any) {
    throw new Error(`Yahoo history unavailable (${err.message})`);
  }
}

async function fetchDbHistory(ticker: string, range: HistoryRange) {
  const bucket = DB_BUCKET[range];
  let from: Date;
  let to: Date = new Date();

  if (range === "1d") {
    const window = getLastTradingDayWindow(ticker);
    from = window.start;
    to = window.end;
  } else {
    from = new Date(Date.now() - RANGE_MS[range]);
  }

  const rows = await sql.unsafe(
    `SELECT
       time_bucket('${bucket}', time) as bucket,
       first(price, time)::text as open,
       max(price)::text as high,
       min(price)::text as low,
       last(price, time)::text as close,
       sum(volume) as volume
     FROM price_ticks
     WHERE ticker = $1 AND time >= $2 AND time <= $3
     GROUP BY bucket
     ORDER BY bucket ASC`,
    [ticker, from.toISOString(), to.toISOString()]
  );

  return rows.map((row: any) => ({
    time: String(row.bucket),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume ?? 0)
  }));
}

export const marketModule = new Elysia()
  .get(
    "/stocks/search",
    async ({ query }) => {
      const q = (query.q ?? "").trim();
      if (q.length < 1) return { results: [] };

      const REDIS_KEY = `search:${q.toLowerCase()}`;
      const cached = await redis.get(REDIS_KEY);
      if (cached) return { results: JSON.parse(cached), source: "redis" };

      const results = await marketAdapter.searchSymbols(q);
      await redis.setex(REDIS_KEY, 3600, JSON.stringify(results));
      return { results, source: "yahoo" };
    },
    { query: t.Object({ q: t.Optional(t.String()) }) }
  )
  .get("/stocks/:ticker/news", async ({ params }) => {
    const ticker = normalizeTicker(params.ticker);
    const REDIS_KEY = `news:${ticker}`;

    const cached = await redis.get(REDIS_KEY);
    if (cached) return { ticker, results: JSON.parse(cached) };

    const results = await marketAdapter.getNews(ticker);
    await redis.setex(REDIS_KEY, 900, JSON.stringify(results));
    return { ticker, results };
  })
  .get("/stocks/:ticker/similar", async ({ params }) => {
    const ticker = normalizeTicker(params.ticker);
    const REDIS_KEY = `similar:${ticker}`;

    const cached = await redis.get(REDIS_KEY);
    if (cached) return { ticker, results: JSON.parse(cached) };

    const results = await marketAdapter.getSimilarStocks(ticker);
    await redis.setex(REDIS_KEY, 21600, JSON.stringify(results));
    return { ticker, results };
  })
  .get("/stocks/:ticker/market-status", ({ params }) => {
    const ticker = normalizeTicker(params.ticker);
    return { ticker, ...getMarketSession(ticker) };
  })
  .get("/stocks", async () => {
    const snapshot = await redis.hgetall("prices");

    const rows = Object.entries(snapshot).map(([ticker, value]) => {
      try {
        const parsed = JSON.parse(String(value)) as { price: number; ts: number };
        return { ticker, price: parsed.price, ts: parsed.ts };
      } catch {
        return { ticker, price: null, ts: null };
      }
    });

    return { stocks: rows };
  })
  .get("/stocks/:ticker/price", async ({ params, set }) => {
    const ticker = normalizeTicker(params.ticker);
    const cached = await getLivePrice(ticker);
    if (cached !== null) {
      return { ticker, price: cached, source: "redis" };
    }

    const latest = await sql<{ price: string; time: string }[]>`
      SELECT price::text, time::text
      FROM price_ticks
      WHERE ticker = ${ticker}
      ORDER BY time DESC
      LIMIT 1
    `;

    if (latest.length === 0) {
      set.status = 404;
      return { error: `No price found for ${ticker}` };
    }

    return {
      ticker,
      price: Number(latest[0].price),
      ts: latest[0].time,
      source: "timescaledb"
    };
  })
  .get(
    "/stocks/quotes",
    async ({ query }) => {
      // Bulk on-demand quote lookup for a comma-separated ticker list. Used
      // by the Dashboard's "Recently Viewed" box (and anywhere else that
      // needs a handful of live prices right now) instead of relying on the
      // websocket price stream, which only pushes updates for tickers the
      // real-time worker is actively polling (current holdings/pending
      // orders/the configured default list) — a ticker someone merely
      // *looked at* wouldn't be in that set and would otherwise show "—"
      // forever. `getLivePrice` already falls back to a direct Yahoo fetch
      // per ticker (same as the Watchlist endpoint), so this works for any
      // valid ticker regardless of whether it's being streamed.
      const raw = (query.tickers ?? "").split(",").map((t) => t.trim()).filter(Boolean);
      const tickers = Array.from(new Set(raw.map((t) => normalizeTicker(t)))).slice(0, 25);

      const quotes = await Promise.all(
        tickers.map(async (ticker) => ({
          ticker,
          price: await getLivePrice(ticker)
        }))
      );

      return { quotes };
    },
    {
      query: t.Object({
        tickers: t.String()
      })
    }
  )
  .get(
    "/stocks/:ticker/candles",
    async ({ params, query }) => {
      const ticker = normalizeTicker(params.ticker);
      const interval = query.interval ?? "1m";
      const from = query.from ? new Date(query.from) : new Date(Date.now() - 60 * 60 * 1000);
      const to = query.to ? new Date(query.to) : new Date();

      // 1m/5m are backed by pre-materialized continuous aggregates (cheap, fast).
      // 15m/1h are computed on the fly via time_bucket over raw price_ticks.
      let candles: any[];
      if (interval === "1m" || interval === "5m") {
        const viewName = interval === "5m" ? "ohlc_5m" : "ohlc_1m";
        candles = await sql.unsafe(
          `SELECT bucket::text, open::text, high::text, low::text, close::text, volume
           FROM ${viewName}
           WHERE ticker = $1 AND bucket BETWEEN $2 AND $3
           ORDER BY bucket ASC`,
          [ticker, from.toISOString(), to.toISOString()]
        );
      } else {
        const bucket = interval === "15m" ? "15 minutes" : "1 hour";
        candles = await sql.unsafe(
          `SELECT
             time_bucket('${bucket}', time) as bucket,
             first(price, time)::text as open,
             max(price)::text as high,
             min(price)::text as low,
             last(price, time)::text as close,
             sum(volume) as volume
           FROM price_ticks
           WHERE ticker = $1 AND time BETWEEN $2 AND $3
           GROUP BY bucket
           ORDER BY bucket ASC`,
          [ticker, from.toISOString(), to.toISOString()]
        );
      }

      return {
        ticker,
        interval,
        candles: candles.map((row: any) => ({
          bucket: row.bucket,
          open: Number(row.open),
          high: Number(row.high),
          low: Number(row.low),
          close: Number(row.close),
          volume: Number(row.volume)
        }))
      };
    },
    {
      query: t.Object({
        interval: t.Optional(t.Union([t.Literal("1m"), t.Literal("5m"), t.Literal("15m"), t.Literal("1h")])),
        from: t.Optional(t.String()),
        to: t.Optional(t.String())
      })
    }
  )
  .get(
    "/stocks/:ticker/history",
    async ({ params, query, set }) => {
      const ticker = normalizeTicker(params.ticker);
      const range = (query.range ?? "1y") as HistoryRange;

      try {
        const yahooPoints = await fetchYahooHistory(ticker, range);
        if (yahooPoints.length > 0) {
          return { ticker, range, source: "yahoo", points: yahooPoints };
        }
      } catch {
      }

      const dbPoints = await fetchDbHistory(ticker, range);
      if (dbPoints.length > 0) {
        return { ticker, range, source: "timescaledb", points: dbPoints };
      }

      set.status = 404;
      return {
        error: `No historical data found for ${ticker}`,
        hint: "Try after simulator runs longer or choose a market ticker like TSLA"
      };
    },
    {
      query: t.Object({
        range: t.Optional(
          t.Union([
            t.Literal("1d"),
            t.Literal("1w"),
            t.Literal("1mo"),
            t.Literal("3mo"),
            t.Literal("6mo"),
            t.Literal("1y"),
            t.Literal("3y"),
            t.Literal("5y"),
            t.Literal("max")
          ])
        )
      })
    }
  )
  .get("/stocks/:ticker/profile", async ({ params, set }) => {
    const ticker = normalizeTicker(params.ticker);
    const profileData = await getCachedProfile(ticker);

    if (profileData) {
      return { ticker, ...profileData };
    }

    set.status = 404;
    return {
      error: `No profile data found for ${ticker}`,
      hint: "Select a real market ticker."
    };
  })
  .get("/stocks/:ticker/previous-close", async ({ params, set }) => {
    const ticker = normalizeTicker(params.ticker);
    const previousClose = await getPreviousClose(ticker);

    if (previousClose == null) {
      set.status = 404;
      return { error: `No price history found for ${ticker}` };
    }

    return { ticker, previousClose };
  })
  .ws("/ws/prices", {
    open(ws) {
      addPriceClient(ws as any);
      ws.send(JSON.stringify({ event: "connected", data: { channel: "price_channel" } }));
    },
    close(ws) {
      removePriceClient(ws as any);
    }
  });
