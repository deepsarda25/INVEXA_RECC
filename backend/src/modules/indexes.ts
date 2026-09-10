import { Elysia } from "elysia";
import YahooFinanceClass from "yahoo-finance2";
import { redis } from "../lib/redis";

// Suppress the survey notice
const yahooFinance = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] });

const CACHE_KEY = "indexes:snapshot";
// Updating every 10 seconds as per user request to keep index prices real-time
const CACHE_TTL_SECONDS = 10;

export type IndexQuote = {
  key: string;
  label: string;
  symbol: string;
  shortName: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
};

// Each index tries its candidate Yahoo symbols in order — some of these
// (especially the midcap/smallcap indices) have shifted symbols on Yahoo's
// side over time, so we fall back through alternates rather than silently
// dropping the index from the bar if the primary symbol doesn't resolve.
const INDEX_CANDIDATES: Array<{ key: string; label: string; symbols: string[] }> = [
  { key: "NIFTY50", label: "NIFTY", symbols: ["^NSEI"] },
  { key: "SENSEX", label: "SENSEX", symbols: ["^BSESN"] },
  { key: "BANKNIFTY", label: "BANKNIFTY", symbols: ["^NSEBANK"] },
  { key: "MIDCAP100", label: "NIFTY MIDCAP 100", symbols: ["^CNXMIDCAP", "NIFTY_MID_SELECT.NS", "NIFTYMIDCAP150.NS", "^NIFTYMDCP100"] },
  { key: "SMALLCAP100", label: "NIFTY SMALLCAP 100", symbols: ["^CNXSC", "NIFTYSMLCAP100.NS", "^NIFTYSMCAP100"] },
  // US indices — shown alongside the Indian ones so the ticker bar covers
  // both markets. Their ".symbol" (with the leading "^" stripped by the
  // frontend on click) is classified as US by the shared market-resolution
  // logic (see frontend/src/utils/currency.ts and
  // backend/src/domain/market/marketHours.ts), so they correctly display
  // in USD ($) rather than INR (₹) when opened in the Terminal.
  { key: "SP500", label: "S&P 500", symbols: ["^GSPC"] },
  { key: "NASDAQ", label: "NASDAQ", symbols: ["^IXIC"] },
  { key: "DOWJONES", label: "DOW JONES", symbols: ["^DJI"] }
];

async function fetchOneIndex(entry: { key: string; label: string; symbols: string[] }): Promise<IndexQuote | null> {
  for (const symbol of entry.symbols) {
    try {
      const quote = await yahooFinance.quote(symbol, {
        fields: ["regularMarketPrice", "regularMarketPreviousClose", "regularMarketChange", "regularMarketChangePercent", "shortName"]
      });

      const livePrice = (quote as any).regularMarketPrice;
      const prevClose = (quote as any).regularMarketPreviousClose;
      const priceToUse = livePrice ?? prevClose ?? null;

      if (priceToUse == null) continue;

      return {
        key: entry.key,
        label: entry.label,
        symbol,
        shortName: (quote as any).shortName ?? entry.label,
        regularMarketPrice: priceToUse,
        regularMarketChange: (quote as any).regularMarketChange ?? 0,
        regularMarketChangePercent: (quote as any).regularMarketChangePercent ?? 0
      };
    } catch {
      // Try the next candidate symbol for this index.
    }
  }
  return null;
}

async function fetchIndexesFromYahoo(): Promise<IndexQuote[]> {
  const settled = await Promise.all(INDEX_CANDIDATES.map(fetchOneIndex));
  return settled.filter((q): q is IndexQuote => q !== null);
}

export const indexesModule = new Elysia().get("/indexes", async ({ set }) => {
  // 1. Serve from Redis cache if fresh
  const cached = await redis.get(CACHE_KEY);
  if (cached) {
    try {
      return { indexes: JSON.parse(cached) as IndexQuote[], source: "cache" };
    } catch {
      // Corrupted cache, fall through
    }
  }

  // 2. Fetch live via yahoo-finance2 (handles crumb auth automatically)
  try {
    const indexes = await fetchIndexesFromYahoo();

    if (indexes.length === 0) {
      set.status = 502;
      return {
        error: "No index data retrieved",
        hint: "Markets may be closed or Yahoo Finance is temporarily unavailable."
      };
    }

    await redis.set(CACHE_KEY, JSON.stringify(indexes), "EX", CACHE_TTL_SECONDS);
    return { indexes, source: "live" };
  } catch (err) {
    set.status = 502;
    return {
      error: "Failed to fetch index data",
      detail: String(err),
      hint: "Yahoo Finance may be rate-limiting. Try again in a few seconds."
    };
  }
});
