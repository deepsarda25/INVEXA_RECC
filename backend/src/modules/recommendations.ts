import { Elysia, t } from "elysia";
import { redis } from "../lib/redis";
import { marketAdapter } from "../domain/market/adapter";
import { normalizeTicker } from "../domain/market/tickerSymbols";
import { resolveMarket } from "../domain/market/marketHours";
import { getCachedProfile } from "../lib/profileCache";
import { USD_TO_INR_RATE } from "../lib/currency";
import {
  buildRecommendation,
  runWithConcurrencyLimit,
  type ManualRecommendationInput,
  type Recommendation
} from "../domain/recommendations/recommendationEngine";
import { RECOMMENDATION_UNIVERSE, SECTORS, getUniverse, type Market, type UniverseEntry } from "../domain/recommendations/universe";

/**
 * NOTE ON SCOPE: this route file (and the curated list in `universe.ts`)
 * only seeds the sector-wide screen with a default set of liquid names.
 * The engine itself (`buildRecommendation`) is generic — `/stocks/:ticker`
 * below works for ANY ticker, curated or not, live data or user-supplied.
 * Nothing here special-cases individual stocks.
 */

const HISTORY_LOOKBACK_MS = 400 * 24 * 60 * 60 * 1000; // ~400 days, enough for a 200-day SMA
const RESULT_TTL_SECONDS = 15 * 60; // cache computed recommendations for 15 minutes to stay easy on Yahoo Finance
const CONCURRENCY = 5; // conservative to avoid Yahoo rate-limiting, bumped slightly since the universe grew

const DISCLAIMER =
  "Heuristic, rules-based screening signal generated from public price and fundamental data (or user-supplied data, where noted). It is not a validated trading system and not personalized financial or investment advice — do your own research or consult a licensed advisor before trading.";

function inferMarket(ticker: string): Market {
  return resolveMarket(ticker);
}

async function computeLiveRecommendation(entry: UniverseEntry, skipCache = false): Promise<Recommendation | null> {
  const cacheKey = `recommendation:${entry.ticker}`;
  if (!skipCache) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as Recommendation;
      } catch {
        // fall through and recompute
      }
    }
  }

  try {
    const [points, profile] = await Promise.all([
      marketAdapter.getHistoricalPrices(entry.ticker, new Date(Date.now() - HISTORY_LOOKBACK_MS), "1d"),
      getCachedProfile(entry.ticker).catch(() => null)
    ]);

    const recommendation = buildRecommendation({
      ticker: normalizeTicker(entry.ticker),
      name: profile?.name || entry.name,
      market: entry.market,
      sector: entry.sector,
      points: points ?? [],
      profile
    });

    if (recommendation.signal !== "NO_DATA") {
      await redis.setex(cacheKey, RESULT_TTL_SECONDS, JSON.stringify(recommendation));
    }
    return recommendation;
  } catch (err: any) {
    console.error(`[recommendations] Failed to fetch live data for ${entry.ticker}:`, err.message);
    // Even on a hard fetch failure, still return a NO_DATA shell so the
    // caller/UI knows manual entry is available for this ticker.
    return buildRecommendation({
      ticker: normalizeTicker(entry.ticker),
      name: entry.name,
      market: entry.market,
      sector: entry.sector,
      points: [],
      profile: null
    });
  }
}

const manualSchema = t.Optional(
  t.Object({
    currentPrice: t.Optional(t.Number()),
    priceHistory: t.Optional(
      t.Array(
        t.Object({
          date: t.String(),
          open: t.Optional(t.Number()),
          high: t.Optional(t.Number()),
          low: t.Optional(t.Number()),
          close: t.Number()
        })
      )
    ),
    technical: t.Optional(
      t.Object({
        sma20: t.Optional(t.Number()),
        sma50: t.Optional(t.Number()),
        sma200: t.Optional(t.Number()),
        rsi14: t.Optional(t.Number()),
        momentum20Pct: t.Optional(t.Number()),
        volatility20AnnualizedPct: t.Optional(t.Number()),
        atr14: t.Optional(t.Number())
      })
    ),
    fundamentals: t.Optional(
      t.Object({
        peRatio: t.Optional(t.Number()),
        pbRatio: t.Optional(t.Number()),
        roe: t.Optional(t.Number()),
        debtToEquity: t.Optional(t.Number()),
        eps: t.Optional(t.Number()),
        dividendYield: t.Optional(t.Number()),
        marketCap: t.Optional(t.Number())
      })
    )
  })
);

export const recommendationsModule = new Elysia()
  .get("/recommendations/meta", () => ({
    markets: ["NSE", "BSE", "US"],
    sectors: SECTORS,
    signals: ["BUY", "HOLD", "SELL", "NO_DATA"],
    usdToInrRate: USD_TO_INR_RATE,
    disclaimer: DISCLAIMER
  }))
  .get(
    "/recommendations",
    async ({ query }) => {
      const universe = getUniverse({
        market: query.market as Market | undefined,
        sector: query.sector as any
      });

      const scored = (await runWithConcurrencyLimit(universe, CONCURRENCY, (e) => computeLiveRecommendation(e))).filter(
        (r): r is Recommendation => r !== null
      );

      const filtered =
        query.signal && query.signal !== "ALL" ? scored.filter((r) => r.signal === query.signal) : scored;

      const sorted = filtered.sort((a, b) => b.score - a.score);

      const bestPerSector = new Map<string, Recommendation>();
      for (const rec of sorted) {
        const key = `${rec.market}:${rec.sector}`;
        if (!bestPerSector.has(key) && rec.signal !== "NO_DATA") bestPerSector.set(key, rec);
      }
      const worstPerSector = new Map<string, Recommendation>();
      for (const rec of [...sorted].reverse()) {
        const key = `${rec.market}:${rec.sector}`;
        if (!worstPerSector.has(key) && rec.signal !== "NO_DATA") worstPerSector.set(key, rec);
      }

      return {
        results: sorted,
        topPicksBySector: Array.from(bestPerSector.values()),
        weakestBySector: Array.from(worstPerSector.values()),
        universeSize: universe.length,
        scoredCount: scored.filter((r) => r.signal !== "NO_DATA").length,
        noDataCount: scored.filter((r) => r.signal === "NO_DATA").length,
        usdToInrRate: USD_TO_INR_RATE,
        generatedAt: new Date().toISOString(),
        source: "Yahoo Finance",
        disclaimer: DISCLAIMER
      };
    },
    {
      query: t.Object({
        market: t.Optional(t.Union([t.Literal("NSE"), t.Literal("BSE"), t.Literal("US")])),
        sector: t.Optional(t.String()),
        signal: t.Optional(
          t.Union([t.Literal("BUY"), t.Literal("HOLD"), t.Literal("SELL"), t.Literal("NO_DATA"), t.Literal("ALL")])
        )
      })
    }
  )
  // Live lookup for any ticker — curated or not.
  .get(
    "/stocks/:ticker/recommendation",
    async ({ params }) => {
      const ticker = normalizeTicker(params.ticker);
      const known = RECOMMENDATION_UNIVERSE.find((e) => normalizeTicker(e.ticker) === ticker);
      const market: Market = known?.market ?? inferMarket(ticker);
      const sector = known?.sector ?? "Unclassified";
      const name = known?.name ?? ticker;

      const recommendation = await computeLiveRecommendation({ ticker, name, market, sector: sector as any });
      return recommendation;
    },
    { params: t.Object({ ticker: t.String({ minLength: 1 }) }) }
  )
  // Manual/override lookup — used when live data is missing or thin (e.g.
  // CIPLA.BO with no Yahoo history) or when the user simply wants to test
  // their own numbers against the model.
  .post(
    "/stocks/:ticker/recommendation",
    async ({ params, body }) => {
      const ticker = normalizeTicker(params.ticker);
      const known = RECOMMENDATION_UNIVERSE.find((e) => normalizeTicker(e.ticker) === ticker);
      const market: Market = known?.market ?? inferMarket(ticker);
      const sector = known?.sector ?? "Unclassified";
      const name = known?.name ?? ticker;

      // Try live data first (best-effort — a manual submission can still be
      // blended with whatever Yahoo does have), but never fail the request
      // if Yahoo has nothing for this ticker.
      let points: Awaited<ReturnType<typeof marketAdapter.getHistoricalPrices>> = [];
      let profile: any = null;
      try {
        points = await marketAdapter.getHistoricalPrices(ticker, new Date(Date.now() - HISTORY_LOOKBACK_MS), "1d");
      } catch {
        points = [];
      }
      try {
        profile = await getCachedProfile(ticker);
      } catch {
        profile = null;
      }

      const manual = body as ManualRecommendationInput | undefined;

      const recommendation = buildRecommendation({
        ticker,
        name,
        market,
        sector: sector as any,
        points: points ?? [],
        profile,
        manual
      });

      return recommendation;
    },
    { params: t.Object({ ticker: t.String({ minLength: 1 }) }), body: manualSchema }
  );
