import type { OhlcPoint } from "../market/adapter";
import type { Market, Sector } from "./universe";
import { usdToInr, USD_TO_INR_RATE } from "../../lib/currency";

export type RecommendationSignal = "BUY" | "HOLD" | "SELL" | "NO_DATA";
export type DataSource = "LIVE" | "USER_PROVIDED" | "MIXED";

export type TechnicalSnapshot = {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  momentum20Pct: number | null;
  volatility20AnnualizedPct: number | null;
  atr14: number | null;
};

export type FundamentalSnapshot = {
  peRatio: number | null;
  pbRatio: number | null;
  roe: number | null;
  debtToEquity: number | null;
  eps: number | null;
  dividendYield: number | null;
  marketCap: number | null;
};

export type PriceLevels = {
  buyRange: { low: number; high: number } | null;
  targetRange: { low: number; high: number } | null;
  stopLoss: number | null;
};

export type Recommendation = {
  ticker: string;
  name: string;
  market: Market;
  sector: Sector | string;
  signal: RecommendationSignal;
  score: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  riskRating: "LOW" | "MEDIUM" | "HIGH";
  currentPrice: number | null;
  currency: "INR" | "USD";
  inrEquivalent: {
    currentPrice: number | null;
    buyRange: { low: number; high: number } | null;
    targetRange: { low: number; high: number } | null;
    stopLoss: number | null;
    exchangeRateUsed: number;
    note: string;
  } | null;
  levels: PriceLevels;
  levelBasis: string;
  horizon: {
    shortTerm: RecommendationSignal;
    swing: RecommendationSignal;
    longTerm: RecommendationSignal;
  };
  technical: TechnicalSnapshot;
  fundamentals: FundamentalSnapshot;
  reasons: string[];
  dataPoints: number;
  dataSource: DataSource;
  manualEntryAvailable: boolean;
  timestamp: string;
  source: string;
  disclaimer: string;
};

export type ManualRecommendationInput = {
  currentPrice?: number;
  priceHistory?: Array<{ date: string; open?: number; high?: number; low?: number; close: number }>;
  technical?: Partial<TechnicalSnapshot>;
  fundamentals?: Partial<FundamentalSnapshot>;
};

const DISCLAIMER =
  "Heuristic, rules-based screening signal derived from public price and fundamental data (or user-supplied data, where noted). It is not a validated trading system and not personalized financial advice.";

const round = (value: number | null | undefined, digits = 2): number | null => {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
};

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

const mean = (values: number[]): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  return mean(closes.slice(closes.length - period));
}

function wilderRsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function annualizedVolatilityPct(closes: number[], period = 20): number | null {
  if (closes.length < period + 1) return null;
  const window = closes.slice(closes.length - (period + 1));
  const logReturns: number[] = [];
  for (let i = 1; i < window.length; i++) {
    if (window[i - 1] > 0 && window[i] > 0) logReturns.push(Math.log(window[i] / window[i - 1]));
  }
  if (logReturns.length < 2) return null;
  const avg = mean(logReturns) ?? 0;
  const variance = mean(logReturns.map((r) => (r - avg) ** 2)) ?? 0;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function wilderAtr(points: OhlcPoint[], period = 14): number | null {
  if (points.length < period + 1) return null;
  const trueRange = (curr: OhlcPoint, prevClose: number) =>
    Math.max(curr.high - curr.low, Math.abs(curr.high - prevClose), Math.abs(curr.low - prevClose));
  let atr = 0;
  for (let i = 1; i <= period; i++) atr += trueRange(points[i], points[i - 1].close);
  atr /= period;
  for (let i = period + 1; i < points.length; i++) {
    atr = (atr * (period - 1) + trueRange(points[i], points[i - 1].close)) / period;
  }
  return atr;
}

const SECTOR_PE_CEILING: Record<string, number> = {
  "Banking & Financial Services": 22,
  "Information Technology": 32,
  "Healthcare & Pharmaceuticals": 38,
  Energy: 18,
  "Consumer Goods": 45,
  Industrials: 30,
  Automotive: 28,
  Telecommunications: 30,
  "Real Estate": 25,
  Utilities: 22
};
const DEFAULT_PE_CEILING = 32;

function mergeOhlcHistory(live: OhlcPoint[], manual?: ManualRecommendationInput["priceHistory"]): OhlcPoint[] {
  if (!manual || manual.length === 0) return live;
  const manualPoints: OhlcPoint[] = manual
    .filter((row) => Number.isFinite(row.close))
    .map((row) => ({
      time: row.date,
      open: row.open ?? row.close,
      high: row.high ?? row.close,
      low: row.low ?? row.close,
      close: row.close,
      volume: 0
    }));
  const byTime = new Map<string, OhlcPoint>();
  for (const p of [...live, ...manualPoints]) byTime.set(p.time, p);
  return Array.from(byTime.values()).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

export function buildRecommendation(input: {
  ticker: string;
  name: string;
  market: Market;
  sector: Sector | string;
  points: OhlcPoint[];
  profile: any;
  manual?: ManualRecommendationInput;
}): Recommendation {
  const now = new Date().toISOString();
  const currency: "INR" | "USD" = input.market === "US" ? "USD" : "INR";
  const usedManualHistory = !!input.manual?.priceHistory?.length;
  const usedManualFundamentals = !!input.manual?.fundamentals && Object.keys(input.manual.fundamentals).length > 0;
  const usedManualTechnical = !!input.manual?.technical && Object.keys(input.manual.technical).length > 0;

  const mergedPoints = mergeOhlcHistory(input.points, input.manual?.priceHistory);
  const closes = mergedPoints.map((p) => p.close).filter((c) => Number.isFinite(c) && c > 0);

  let currentPrice = closes.at(-1) ?? null;
  if (input.manual?.currentPrice != null) currentPrice = input.manual.currentPrice;

  const dataSource: DataSource =
    usedManualHistory || usedManualFundamentals || usedManualTechnical
      ? input.points.length > 0 || (input.profile && Object.keys(input.profile).length > 0)
        ? "MIXED"
        : "USER_PROVIDED"
      : "LIVE";

  const technical: TechnicalSnapshot = {
    sma20: round(sma(closes, 20)),
    sma50: round(sma(closes, 50)),
    sma200: round(sma(closes, 200)),
    rsi14: round(wilderRsi(closes, 14)),
    momentum20Pct:
      closes.length > 20 && closes.at(-21)! > 0 ? round(((currentPrice! / closes.at(-21)!) - 1) * 100) : null,
    volatility20AnnualizedPct: round(annualizedVolatilityPct(closes, 20)),
    atr14: round(wilderAtr(mergedPoints, 14)),
    ...Object.fromEntries(Object.entries(input.manual?.technical ?? {}).filter(([, v]) => v != null))
  };

  const fundamentals: FundamentalSnapshot = {
    peRatio: finiteNumber(input.manual?.fundamentals?.peRatio ?? input.profile?.peRatio),
    pbRatio: finiteNumber(input.manual?.fundamentals?.pbRatio ?? input.profile?.pbRatio),
    roe: finiteNumber(input.manual?.fundamentals?.roe ?? input.profile?.roe),
    debtToEquity: finiteNumber(input.manual?.fundamentals?.debtToEquity ?? input.profile?.debtToEquity),
    eps: finiteNumber(input.manual?.fundamentals?.eps ?? input.profile?.eps),
    dividendYield: finiteNumber(input.manual?.fundamentals?.dividendYield ?? input.profile?.dividendYield),
    marketCap: finiteNumber(input.manual?.fundamentals?.marketCap ?? input.profile?.marketCap)
  };

  const hasEnoughHistory = closes.length >= 30;
  const hasManualShortcut = usedManualTechnical && currentPrice != null;

  if (currentPrice == null || (!hasEnoughHistory && !hasManualShortcut)) {
    return {
      ticker: input.ticker,
      name: input.name,
      market: input.market,
      sector: input.sector,
      signal: "NO_DATA",
      score: 0,
      confidence: "LOW",
      riskRating: "HIGH",
      currentPrice: round(currentPrice),
      currency,
      inrEquivalent: null,
      levels: { buyRange: null, targetRange: null, stopLoss: null },
      levelBasis: "n/a",
      horizon: { shortTerm: "NO_DATA", swing: "NO_DATA", longTerm: "NO_DATA" },
      technical,
      fundamentals,
      reasons: [
        "Not enough daily price history (need at least 30 sessions) and no manual data was supplied.",
        "You can submit manual data for this ticker (current price, and either recent OHLC rows or known indicator values) to get a best-effort signal."
      ],
      dataPoints: closes.length,
      dataSource,
      manualEntryAvailable: true,
      timestamp: now,
      source: usedManualHistory || usedManualTechnical ? "User-provided + Yahoo Finance" : "Yahoo Finance",
      disclaimer: DISCLAIMER
    };
  }

  let score = 0;
  const reasons: string[] = [];
  const { sma20, sma50, sma200, rsi14, momentum20Pct, volatility20AnnualizedPct } = technical;

  if (sma20 != null) {
    if (currentPrice > sma20) { score += 12; reasons.push("Trading above the 20-day moving average."); }
    else reasons.push("Trading below the 20-day moving average.");
  }
  if (sma50 != null) {
    if (currentPrice > sma50) { score += 12; reasons.push("Trading above the 50-day moving average."); }
    else reasons.push("Trading below the 50-day moving average.");
  }
  if (sma200 != null) {
    if (currentPrice > sma200) { score += 12; reasons.push("Trading above the 200-day moving average (long-term uptrend)."); }
    else reasons.push("Trading below the 200-day moving average (long-term downtrend) — treat any short rebound cautiously.");
  } else {
    reasons.push("Fewer than 200 sessions of history; long-term trend not evaluated.");
  }

  if (rsi14 != null) {
    if (rsi14 >= 45 && rsi14 <= 65) { score += 15; reasons.push(`RSI(14) at ${rsi14.toFixed(0)} — healthy, not overbought.`); }
    else if (rsi14 > 65 && rsi14 <= 75) { score += 6; reasons.push(`RSI(14) at ${rsi14.toFixed(0)} — strong momentum, approaching overbought.`); }
    else if (rsi14 > 75) { score -= 10; reasons.push(`RSI(14) at ${rsi14.toFixed(0)} — overbought; a large recent move may already be extended.`); }
    else if (rsi14 >= 30 && rsi14 < 45) { score += 4; reasons.push(`RSI(14) at ${rsi14.toFixed(0)} — soft momentum.`); }
    else { score -= 5; reasons.push(`RSI(14) at ${rsi14.toFixed(0)} — oversold.`); }
  }

  if (momentum20Pct != null) {
    if (momentum20Pct > 25) {
      score += 4;
      reasons.push(`Up ${momentum20Pct.toFixed(1)}% over 20 sessions — extended move, chasing-risk flagged.`);
    } else if (momentum20Pct > 5) { score += 14; reasons.push(`Up ${momentum20Pct.toFixed(1)}% over the last 20 sessions.`); }
    else if (momentum20Pct > 0) { score += 8; reasons.push(`Modestly positive 20-day momentum (${momentum20Pct.toFixed(1)}%).`); }
    else if (momentum20Pct > -5) { score -= 2; reasons.push(`Slightly negative 20-day momentum (${momentum20Pct.toFixed(1)}%).`); }
    else { score -= 10; reasons.push(`Down ${Math.abs(momentum20Pct).toFixed(1)}% over the last 20 sessions.`); }
  }

  if (volatility20AnnualizedPct != null) {
    if (volatility20AnnualizedPct <= 25) { score += 10; reasons.push(`Annualized volatility ~${volatility20AnnualizedPct.toFixed(0)}% — within a typical large-cap range.`); }
    else if (volatility20AnnualizedPct <= 45) { score += 3; reasons.push(`Annualized volatility ~${volatility20AnnualizedPct.toFixed(0)}% — elevated.`); }
    else { score -= 8; reasons.push(`Annualized volatility ~${volatility20AnnualizedPct.toFixed(0)}% — high; expect sharp swings either way.`); }
  }

  const { peRatio, roe, debtToEquity } = fundamentals;
  const peCeiling = SECTOR_PE_CEILING[String(input.sector)] ?? DEFAULT_PE_CEILING;
  if (peRatio !== null && peRatio > 0) {
    if (peRatio < peCeiling) { score += 9; reasons.push(`P/E of ${peRatio.toFixed(1)} is reasonable for ${input.sector} (typical ceiling ~${peCeiling}).`); }
    else if (peRatio < peCeiling * 1.4) { score += 3; reasons.push(`P/E of ${peRatio.toFixed(1)} is on the higher side for ${input.sector}.`); }
    else reasons.push(`P/E of ${peRatio.toFixed(1)} looks expensive for ${input.sector} (typical ceiling ~${peCeiling}).`);
  }
  if (roe !== null) {
    if (roe > 18) { score += 8; reasons.push(`Strong return on equity (${roe.toFixed(1)}%).`); }
    else if (roe > 10) { score += 4; reasons.push(`Reasonable return on equity (${roe.toFixed(1)}%).`); }
    else reasons.push(`Weak return on equity (${roe.toFixed(1)}%).`);
  }
  if (debtToEquity !== null) {
    if (debtToEquity < 1) { score += 8; reasons.push("Conservative debt-to-equity."); }
    else if (debtToEquity < 2) { score += 3; reasons.push("Moderate debt-to-equity."); }
    else reasons.push("High debt-to-equity — added balance-sheet risk.");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const signal: RecommendationSignal = score >= 68 ? "BUY" : score >= 42 ? "HOLD" : "SELL";

  const riskRating: "LOW" | "MEDIUM" | "HIGH" =
    volatility20AnnualizedPct == null ? "MEDIUM" : volatility20AnnualizedPct <= 25 ? "LOW" : volatility20AnnualizedPct <= 45 ? "MEDIUM" : "HIGH";

  const confidence: "LOW" | "MEDIUM" | "HIGH" =
    dataSource !== "LIVE" ? "LOW" : closes.length >= 200 ? "HIGH" : closes.length >= 90 ? "MEDIUM" : "LOW";

  const atrValue = technical.atr14 ?? currentPrice * 0.02;
  const stopDistance = Math.max(atrValue * 1.5, currentPrice * 0.03);
  const targetDistance = Math.max(atrValue * 3, currentPrice * 0.06);
  const levelBasis = technical.atr14 != null
    ? "ATR(14)-based: stop = 1.5x ATR (min 3% of price), target = 3-4.8x ATR (min 6% of price)."
    : "Flat percentage of price (ATR unavailable): stop = 3%, target = 6-9.6%.";

  let levels: PriceLevels;
  if (signal === "SELL") {
    levels = {
      buyRange: null,
      targetRange: {
        low: round(currentPrice - targetDistance * 1.5)!,
        high: round(currentPrice - targetDistance)!
      },
      stopLoss: round(currentPrice + stopDistance)
    };
  } else {
    levels = {
      buyRange: { low: round(currentPrice * 0.985)!, high: round(currentPrice * 1.005)! },
      targetRange: {
        low: round(currentPrice + targetDistance)!,
        high: round(currentPrice + targetDistance * 1.6)!
      },
      stopLoss: round(currentPrice - stopDistance)
    };
  }

  const inrEquivalent =
    currency === "USD"
      ? {
          currentPrice: usdToInr(currentPrice),
          buyRange: levels.buyRange ? { low: usdToInr(levels.buyRange.low)!, high: usdToInr(levels.buyRange.high)! } : null,
          targetRange: levels.targetRange ? { low: usdToInr(levels.targetRange.low)!, high: usdToInr(levels.targetRange.high)! } : null,
          stopLoss: usdToInr(levels.stopLoss),
          exchangeRateUsed: USD_TO_INR_RATE,
          note: `Assumed fixed rate (1 USD = ${USD_TO_INR_RATE} INR) for comparing against an INR-denominated portfolio — not a live FX rate.`
        }
      : null;

  const shortTerm: RecommendationSignal =
    rsi14 != null && rsi14 > 75 ? "SELL" : momentum20Pct != null && momentum20Pct > 3 && momentum20Pct <= 25 && (sma20 == null || currentPrice > sma20) ? "BUY" : "HOLD";
  const longTerm: RecommendationSignal =
    sma200 != null ? (currentPrice > sma200 && (roe === null || roe > 8) ? "BUY" : currentPrice < sma200 * 0.9 ? "SELL" : "HOLD") : signal;
  const swing: RecommendationSignal = signal;

  return {
    ticker: input.ticker,
    name: input.name,
    market: input.market,
    sector: input.sector,
    signal,
    score,
    confidence,
    riskRating,
    currentPrice: round(currentPrice),
    currency,
    inrEquivalent,
    levels,
    levelBasis,
    horizon: { shortTerm, swing, longTerm },
    technical,
    fundamentals,
    reasons: reasons.slice(0, 7),
    dataPoints: closes.length,
    dataSource,
    manualEntryAvailable: dataSource === "LIVE" && closes.length < 60,
    timestamp: now,
    source: dataSource === "LIVE" ? "Yahoo Finance" : dataSource === "MIXED" ? "Yahoo Finance + user-provided data" : "User-provided data",
    disclaimer: DISCLAIMER
  };
}

export async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function runNext(): Promise<void> {
    const index = cursor++;
    if (index >= items.length) return;
    results[index] = await worker(items[index]);
    await runNext();
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}
