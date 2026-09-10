const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export type ApiError = {
  error: string;
};

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  headers.set("Content-Type", "application/json");

  const fallbackToken = typeof window !== "undefined" ? localStorage.getItem("invexa-token") : null;
  const effectiveToken = token ?? fallbackToken;

  if (effectiveToken) {
    headers.set("Authorization", `Bearer ${effectiveToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as ApiError;
      if (body?.error) {
        message = body.error;
      }
    } catch {
      // Non-JSON response, keep fallback message.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

// ── Recommendations ──────────────────────────────────────────────────────
export type RecommendationSignal = "BUY" | "HOLD" | "SELL" | "NO_DATA";
export type RecommendationMarket = "NSE" | "BSE" | "US";
export type RecommendationDataSource = "LIVE" | "USER_PROVIDED" | "MIXED";

export type PriceRange = { low: number; high: number };

export type RecommendationTechnical = {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  momentum20Pct: number | null;
  volatility20AnnualizedPct: number | null;
  atr14: number | null;
};

export type RecommendationFundamentals = {
  peRatio: number | null;
  pbRatio: number | null;
  roe: number | null;
  debtToEquity: number | null;
  eps: number | null;
  dividendYield: number | null;
  marketCap: number | null;
};

export type StockRecommendation = {
  ticker: string;
  name: string;
  market: RecommendationMarket;
  sector: string;
  signal: RecommendationSignal;
  score: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  riskRating: "LOW" | "MEDIUM" | "HIGH";
  currentPrice: number | null;
  /** Native currency the stock trades in — USD for US-market tickers, INR otherwise. */
  currency: "INR" | "USD";
  /** Only present for USD tickers: the same figures converted at a fixed assumed rate so they can be read alongside an INR portfolio. */
  inrEquivalent: {
    currentPrice: number | null;
    buyRange: PriceRange | null;
    targetRange: PriceRange | null;
    stopLoss: number | null;
    exchangeRateUsed: number;
    note: string;
  } | null;
  levels: {
    buyRange: PriceRange | null;
    targetRange: PriceRange | null;
    stopLoss: number | null;
  };
  levelBasis: string;
  horizon: {
    shortTerm: RecommendationSignal;
    swing: RecommendationSignal;
    longTerm: RecommendationSignal;
  };
  technical: RecommendationTechnical;
  fundamentals: RecommendationFundamentals;
  reasons: string[];
  dataPoints: number;
  dataSource: RecommendationDataSource;
  manualEntryAvailable: boolean;
  timestamp: string;
  source: string;
  disclaimer: string;
};

export type RecommendationListResponse = {
  results: StockRecommendation[];
  topPicksBySector: StockRecommendation[];
  weakestBySector: StockRecommendation[];
  universeSize: number;
  scoredCount: number;
  noDataCount: number;
  usdToInrRate: number;
  generatedAt: string;
  source: string;
  disclaimer: string;
};

export type ManualRecommendationInput = {
  currentPrice?: number;
  priceHistory?: Array<{ date: string; open?: number; high?: number; low?: number; close: number }>;
  technical?: Partial<RecommendationTechnical>;
  fundamentals?: Partial<RecommendationFundamentals>;
};

export function getRecommendation(ticker: string, token?: string | null) {
  return apiFetch<StockRecommendation>(`/stocks/${encodeURIComponent(ticker)}/recommendation`, {}, token);
}

/** Submits manually-entered data for a ticker Yahoo Finance has no/insufficient history for. */
export function submitManualRecommendation(ticker: string, manual: ManualRecommendationInput, token?: string | null) {
  return apiFetch<StockRecommendation>(
    `/stocks/${encodeURIComponent(ticker)}/recommendation`,
    { method: "POST", body: JSON.stringify(manual) },
    token
  );
}

export function getRecommendations(
  params: { market?: RecommendationMarket; sector?: string; signal?: RecommendationSignal | "ALL" } = {},
  token?: string | null
) {
  const query = new URLSearchParams();
  if (params.market) query.set("market", params.market);
  if (params.sector) query.set("sector", params.sector);
  if (params.signal) query.set("signal", params.signal);
  const qs = query.toString();
  return apiFetch<RecommendationListResponse>(`/recommendations${qs ? `?${qs}` : ""}`, {}, token);
}

export type QuotesResponse = { quotes: Array<{ ticker: string; price: number | null }> };

/**
 * On-demand live quotes for a handful of tickers, regardless of whether the
 * real-time price worker is actively streaming them. Used by "Recently
 * Viewed" so it doesn't depend on the websocket price feed, which only
 * covers actively-held/ordered tickers.
 */
export function getQuotes(tickers: string[], token?: string | null) {
  if (tickers.length === 0) return Promise.resolve<QuotesResponse>({ quotes: [] });
  const qs = new URLSearchParams({ tickers: tickers.join(",") }).toString();
  return apiFetch<QuotesResponse>(`/stocks/quotes?${qs}`, {}, token);
}
