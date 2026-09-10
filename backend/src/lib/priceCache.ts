import { redis } from "./redis";
import { sql } from "./db";
import { normalizeTicker, toYahooSymbol } from "../domain/market/tickerSymbols";
import { marketAdapter } from "../domain/market/adapter";

async function fetchYahooSpotPrice(ticker: string) {
  return marketAdapter.getLivePrice(ticker);
}

export async function getLivePrice(ticker: string) {
  // For competition-specific tickers (C_comp-id_TICKER), check redis first
  // These come from the simulator and have namespaced keys
  if (ticker.startsWith("C_")) {
    const raw = await redis.hget("prices", ticker);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { price: number };
        if (typeof parsed.price === "number" && parsed.price > 0) {
          return parsed.price;
        }
      } catch {}
    }
    
    // Fallback: check database for most recent price
    try {
      const [lastTick] = await sql<{ price: string }[]>`
        SELECT price FROM price_ticks 
        WHERE ticker = ${ticker} 
        ORDER BY time DESC LIMIT 1
      `;
      if (lastTick) {
        const dbPrice = Number(lastTick.price);
        if (dbPrice > 0) {
          return dbPrice;
        }
      }
    } catch (err) {
      console.error(`[getLivePrice] DB error for ${ticker}:`, err);
    }
    
    // No price found anywhere
    return null;
  }

  // For regular tickers, normalize and check redis/polygon
  const normalized = normalizeTicker(ticker);
  const raw = await redis.hget("prices", normalized);
  if (!raw) {
    return fetchYahooSpotPrice(normalized);
  }

  try {
    const parsed = JSON.parse(raw) as { price: number };
    if (typeof parsed.price === "number") {
      return parsed.price;
    }
  } catch {
    return fetchYahooSpotPrice(normalized);
  }

  return fetchYahooSpotPrice(normalized);
}
