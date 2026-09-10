import { sql } from "./db";
import { getCachedProfile } from "./profileCache";
import { getLastTradingDayWindow } from "../domain/market/marketHours";

/**
 * getPreviousClose — a ticker's previous-session closing price, working for
 * every ticker on the platform, not just the handful backed by real Yahoo
 * Finance data.
 *
 * Most holdings here are simulator symbols (FAKE, TSIM, NOVA, ALFA, ZENX)
 * or competition-only tickers, none of which Yahoo has ever heard of — so a
 * naive `profile.previousClose` lookup silently comes back `null` for them.
 * Any 1D change/P&L built only on that source under-reports (often to
 * exactly zero) for most real portfolios on this practice-trading app.
 *
 * Resolution order:
 *  1. Yahoo's own previous close, when the ticker is one it actually covers
 *     (authoritative — the exchange's official prior-session close).
 *  2. Our own recorded ticks: the latest tick at/before the start of
 *     "today" (using the same trading-day boundary the 1D chart uses).
 *  3. The ticker's very first recorded tick, if it only started trading
 *     after that boundary (keeps day change ~0 instead of `null`).
 */
export async function getPreviousClose(ticker: string): Promise<number | null> {
  try {
    const profile = await getCachedProfile(ticker);
    if (profile?.previousClose != null) {
      return Number(profile.previousClose);
    }
  } catch {
    // Fall through to the DB-derived fallback below.
  }

  const { start } = getLastTradingDayWindow(ticker);

  const [beforeWindow] = await sql<{ price: string }[]>`
    SELECT price::text FROM price_ticks
    WHERE ticker = ${ticker} AND time <= ${start}
    ORDER BY time DESC
    LIMIT 1
  `;
  if (beforeWindow) return Number(beforeWindow.price);

  const [earliest] = await sql<{ price: string }[]>`
    SELECT price::text FROM price_ticks
    WHERE ticker = ${ticker}
    ORDER BY time ASC
    LIMIT 1
  `;
  if (earliest) return Number(earliest.price);

  return null;
}
