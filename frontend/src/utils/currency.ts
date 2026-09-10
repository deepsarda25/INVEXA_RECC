/**
 * Single source of truth for "which market/currency does this ticker belong
 * to" on the frontend. Mirrors the equivalent classification already used on
 * the backend (see backend/src/domain/market/marketHours.ts) so the exchange
 * badge, the ₹/$ symbol, and the trading-hours logic never disagree with
 * each other for the same ticker.
 *
 * Previously several components (Watchlist, Order Form, Stock Chart,
 * Overview panel, Order History, ...) simply hard-coded "₹" no matter what
 * the ticker was, which is why US stocks (and US indices like ^DJI) showed
 * rupee symbols. Other components inferred the market from the ticker with
 * a one-off "no suffix -> US" rule, which wrongly classified suffix-less
 * Indian index tickers (NIFTY50 -> NSEI, BANKNIFTY -> NSEBANK, the
 * smallcap/midcap indices, ...) as US. Both problems are fixed by routing
 * every component through `resolveMarket` / `formatCurrency` below instead
 * of re-deriving the logic locally.
 */

export type MarketRegion = "NSE" | "BSE" | "US";

/**
 * Fixed assumed FX rate used across the app to convert USD-priced
 * instruments into the platform's INR-denominated virtual balance. Mirrors
 * `USD_TO_INR_RATE` in `backend/src/lib/currency.ts` — there is no live FX
 * feed wired into this repo, so this is a clearly-labelled fixed rate
 * rather than a real-time one.
 */
export const USD_TO_INR_RATE = 95;

// Suffix-less Indian index tickers (as normalized by the backend — see
// backend/src/domain/market/tickerSymbols.ts / marketHours.ts).
const INDIA_INDEX_TICKERS = new Set(["BSESN", "NSEI", "NSEBANK", "CNXMIDCAP", "CNXSC"]);

// Suffix-less US index tickers.
const US_INDEX_TICKERS = new Set(["GSPC", "IXIC", "DJI"]);

/** Strip a leading "^" (Yahoo's index prefix) and upper-case for comparisons. */
function normalize(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/^\^/, "");
}

/**
 * Resolve which exchange/market a ticker belongs to.
 * - ".NS" suffix -> NSE (India)
 * - ".BO" suffix -> BSE (India)
 * - known Indian index ticker (with or without "^") -> NSE
 * - known US index ticker (with or without "^") -> US
 * - anything else (plain tickers like AAPL, TSLA, RELIANCE-without-suffix) -> US
 */
export function resolveMarket(ticker: string): MarketRegion {
  const upper = normalize(ticker);
  if (upper.endsWith(".NS")) return "NSE";
  if (upper.endsWith(".BO")) return "BSE";
  if (INDIA_INDEX_TICKERS.has(upper)) return "NSE";
  if (US_INDEX_TICKERS.has(upper)) return "US";
  return "US";
}

/** True for any NSE- or BSE-listed ticker (i.e. priced in INR). */
export function isIndianMarket(ticker: string): boolean {
  const market = resolveMarket(ticker);
  return market === "NSE" || market === "BSE";
}

/** "₹" for NSE/BSE tickers (and Indian indices), "$" for everything else. */
export function currencySymbol(ticker: string): "₹" | "$" {
  return isIndianMarket(ticker) ? "₹" : "$";
}

/** "en-IN" for NSE/BSE tickers, "en-US" for everything else. */
export function currencyLocale(ticker: string): "en-IN" | "en-US" {
  return isIndianMarket(ticker) ? "en-IN" : "en-US";
}

/**
 * Format a plain price/amount with the correct symbol for `ticker`.
 * Returns "N/A" for null/undefined/non-finite values.
 */
export function formatCurrency(
  ticker: string,
  value: number | null | undefined,
  opts: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {}
): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  const { minimumFractionDigits = 2, maximumFractionDigits = 2 } = opts;
  const symbol = currencySymbol(ticker);
  const locale = currencyLocale(ticker);
  return `${symbol}${value.toLocaleString(locale, { minimumFractionDigits, maximumFractionDigits })}`;
}

/**
 * Compact/abbreviated formatting for large numbers (market cap, revenue,
 * profit, ...). Indian tickers use Lakh/Crore, everything else uses
 * K/M/B/T — matching the conventions investors on each market expect.
 */
export function formatCompactCurrency(ticker: string, value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  const symbol = currencySymbol(ticker);
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  if (isIndianMarket(ticker)) {
    if (abs >= 1e7) return `${sign}${symbol}${(abs / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 2 })}Cr`;
    if (abs >= 1e5) return `${sign}${symbol}${(abs / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 2 })}L`;
    if (abs >= 1e3) return `${sign}${symbol}${(abs / 1e3).toLocaleString("en-IN", { maximumFractionDigits: 2 })}K`;
    return `${sign}${symbol}${abs.toLocaleString("en-IN")}`;
  }

  if (abs >= 1e12) return `${sign}${symbol}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${symbol}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${symbol}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${symbol}${(abs / 1e3).toFixed(2)}K`;
  return `${sign}${symbol}${abs.toLocaleString("en-US")}`;
}
