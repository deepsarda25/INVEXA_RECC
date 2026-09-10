/**
 * getMarketSession — Single Responsibility: decide whether the exchange behind
 * a given ticker is currently open for trading.
 *
 * Only the pure simulator tickers run continuously and are always
 * considered open. Tracked indices (SENSEX, NIFTY, BANK NIFTY, DJI, etc.)
 * are real market indices — they must respect their underlying exchange's
 * actual trading hours just like a real equity, so they're mapped to the
 * correct exchange session below instead of being treated as always-open.
 */

const SIM_TICKERS = new Set(["FAKE", "TSIM", "NOVA", "ALFA", "ZENX"]);

// Indices whose underlying exchange is NSE/BSE (India) — SENSEX, NIFTY,
// BANK NIFTY, and the midcap/smallcap indices.
const INDIA_INDEX_TICKERS = new Set(["BSESN", "NSEI", "NSEBANK", "CNXMIDCAP", "CNXSC"]);

// Indices whose underlying exchange is a US market — S&P 500, NASDAQ, and
// the Dow Jones Industrial Average (DJI/DJIA).
const US_INDEX_TICKERS = new Set(["GSPC", "IXIC", "DJI"]);

const INDEX_TICKERS = new Set([...INDIA_INDEX_TICKERS, ...US_INDEX_TICKERS]);

type MarketSession = {
  open: boolean;
  exchange: string;
  hours: string;
};

function getZonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return { weekday: map.weekday, hour: Number(map.hour), minute: Number(map.minute) };
}

function isWithinSession(now: Date, timeZone: string, openMinute: number, closeMinute: number): boolean {
  const { weekday, hour, minute } = getZonedParts(now, timeZone);
  const isWeekday = weekday !== "Sat" && weekday !== "Sun";
  const minutesNow = hour * 60 + minute;
  return isWeekday && minutesNow >= openMinute && minutesNow <= closeMinute;
}

function getZonedMidnightUTC(date: Date, timeZone: string, dayOffset = 0): Date {
  // Find the wall-clock Y-M-D for `date` in `timeZone`, then build a UTC instant
  // representing local midnight of (that day + dayOffset) in that zone.
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  const y = Number(map.year);
  const m = Number(map.month);
  const d = Number(map.day);

  // UTC instant for local midnight: construct as if the parts were UTC, then
  // correct by the zone's offset at that instant.
  const naiveUtc = Date.UTC(y, m - 1, d + dayOffset);
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(naiveUtc), timeZone);
  return new Date(naiveUtc - offsetMinutes * 60 * 1000);
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) === 24 ? 0 : Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return (asUtc - date.getTime()) / 60000;
}

/**
 * getLastTradingDayWindow — for the "1D" chart range: figure out which single
 * trading day's data to show.
 *
 * - If the exchange has already opened today (even if it has since closed),
 *   today is the target day.
 * - If the exchange hasn't opened yet today, the target day is the most
 *   recent prior weekday.
 * - Weekends always roll back to the most recent Friday.
 *
 * Returns a UTC [start, end) window spanning local midnight-to-midnight of
 * the target day (end is capped at "now" when the target day is today).
 */
export function getLastTradingDayWindow(ticker: string, now: Date = new Date()): { start: Date; end: Date; label: string } {
  const upper = ticker.toUpperCase();
  const isIndia = upper.endsWith(".NS") || upper.endsWith(".BO");
  const isSimOrIndex = SIM_TICKERS.has(upper) || INDEX_TICKERS.has(upper);

  const timeZone = isIndia ? "Asia/Kolkata" : "America/New_York";
  const openMinute = isIndia ? 9 * 60 + 15 : 9 * 60 + 30;

  if (isSimOrIndex) {
    // Simulator/index data streams continuously — "1D" just means the last 24h.
    return { start: new Date(now.getTime() - 24 * 60 * 60 * 1000), end: now, label: "Today" };
  }

  const { weekday, hour, minute } = getZonedParts(now, timeZone);
  const minutesNow = hour * 60 + minute;
  const isWeekday = weekday !== "Sat" && weekday !== "Sun";

  // Start by assuming "today" is the target, then roll back day by day until
  // we land on a weekday whose session has already started.
  let dayOffset = 0;
  if (!isWeekday || minutesNow < openMinute) {
    dayOffset = -1;
    // Roll back through the weekend if needed.
    let probe = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    while (["Sat", "Sun"].includes(getZonedParts(probe, timeZone).weekday)) {
      dayOffset -= 1;
      probe = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    }
  }

  const start = getZonedMidnightUTC(now, timeZone, dayOffset);
  const end = getZonedMidnightUTC(now, timeZone, dayOffset + 1);
  const cappedEnd = dayOffset === 0 && end.getTime() > now.getTime() ? now : end;

  return { start, end: cappedEnd, label: dayOffset === 0 ? "Today" : "Last Session" };
}

export function getMarketSession(ticker: string, now: Date = new Date()): MarketSession {
  const upper = ticker.toUpperCase();

  if (SIM_TICKERS.has(upper)) {
    return { open: true, exchange: "Simulator", hours: "Open 24/7" };
  }

  if (INDIA_INDEX_TICKERS.has(upper)) {
    const open = isWithinSession(now, "Asia/Kolkata", 9 * 60 + 15, 15 * 60 + 30);
    return { open, exchange: "NSE/BSE", hours: "9:15 AM – 3:30 PM IST, Mon–Fri" };
  }

  if (US_INDEX_TICKERS.has(upper)) {
    const open = isWithinSession(now, "America/New_York", 9 * 60 + 30, 16 * 60);
    return { open, exchange: "US Market", hours: "9:30 AM – 4:00 PM ET, Mon–Fri" };
  }

  if (upper.endsWith(".NS") || upper.endsWith(".BO")) {
    const open = isWithinSession(now, "Asia/Kolkata", 9 * 60 + 15, 15 * 60 + 30);
    return { open, exchange: "NSE/BSE", hours: "9:15 AM – 3:30 PM IST, Mon–Fri" };
  }

  // Anything else is treated as a US-listed equity.
  const open = isWithinSession(now, "America/New_York", 9 * 60 + 30, 16 * 60);
  return { open, exchange: "US Market", hours: "9:30 AM – 4:00 PM ET, Mon–Fri" };
}

/**
 * Is `ticker` priced in USD (i.e. a genuine US-market instrument)?
 *
 * Used to decide whether a price needs FX conversion before it can be
 * moved in or out of the platform's single INR-denominated virtual
 * balance. Deliberately excludes synthetic competition tickers
 * (`C_<competitionId>_<TICKER>`, used when a competition's stock data
 * source isn't "live"/"real") — those are randomly-generated simulation
 * prices, not real USD quotes, and must never be scaled by the USD/INR
 * rate. NSE/BSE tickers, Indian indices, and the paper-trading SIM
 * tickers are always INR (1:1).
 */
export function isUsdTicker(ticker: string): boolean {
  if (ticker.toUpperCase().startsWith("C_")) return false;
  return getMarketSession(ticker).exchange === "US Market";
}

export type ResolvedMarket = "NSE" | "BSE" | "US";

/**
 * Canonical NSE/BSE/US classification for a ticker — the single place
 * every part of the backend should ask "which market/currency does this
 * ticker belong to". Mirrors `frontend/src/utils/currency.ts`'s
 * `resolveMarket` exactly (same index-ticker sets, same suffix rules) so
 * the exchange badge, order validation, market-hours check, and
 * recommendation currency can never disagree on the same ticker.
 *
 * A previous ad-hoc "no suffix -> US" rule used elsewhere in the codebase
 * (e.g. the recommendation route's currency inference) wrongly classified
 * suffix-less Indian index tickers — NIFTY ("NSEI"), SENSEX ("BSESN"),
 * BANKNIFTY ("NSEBANK"), the midcap/smallcap indices — as US, which is why
 * their recommendation prices were shown/computed in USD instead of INR.
 */
export function resolveMarket(ticker: string): ResolvedMarket {
  const upper = ticker.toUpperCase().replace(/^\^/, "");
  if (upper.endsWith(".NS")) return "NSE";
  if (upper.endsWith(".BO")) return "BSE";
  if (INDIA_INDEX_TICKERS.has(upper)) return "NSE";
  if (US_INDEX_TICKERS.has(upper)) return "US";
  return "US";
}
