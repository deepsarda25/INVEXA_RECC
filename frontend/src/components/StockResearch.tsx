import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import { useMarketStore } from "../store/marketStore";
import {
  TickerFormatter,
  USFormattingStrategy,
  NSEFormattingStrategy,
  BSEFormattingStrategy
} from "../utils/tickerStrategy";
import { addRecentlyViewed } from "../utils/recentlyViewed";
import { resolveMarket } from "../utils/currency";
import { StockChartCard } from "./StockChartCard";
import { StockPerformancePanel } from "./StockPerformancePanel";
import { TechnicalsPanel } from "./TechnicalsPanel";
import { RecommendationCard } from "./RecommendationCard";
import { NewsPanel } from "./NewsPanel";
import { SimilarStocksCard } from "./SimilarStocksCard";
import { OrderForm } from "./OrderForm";
import { OrderHistory } from "./OrderHistory";

type ProfileResponse = {
  ticker: string;
  source: string;
  name: string;
  sector: string;
  industry: string;
  description: string;
  open: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  previousClose: number | null;
  volume: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  lowerCircuit: number | null;
  upperCircuit: number | null;
  marketCap: number | null;
  peRatio: number | null;
  industryPE: number | null;
  pbRatio: number | null;
  faceValue: number | null;
  roe: number | null;
  eps: number | null;
  dividendYield: number | null;
  bookValue: number | null;
  debtToEquity: number | null;
  quarterlyFinancials?: Array<{ period: string; revenue: number | null; profit: number | null }>;
  shareholding?: { insiders: number | null; institutions: number | null; public: number | null } | null;
};

type SearchResult = { ticker: string; name: string; exchange: string; type: string };
type SearchResponse = { results: SearchResult[] };

export function StockResearch({ token, initialTicker }: { token: string; initialTicker?: string }) {
  const queryClient = useQueryClient();
  const prices = useMarketStore((s) => s.prices);
  const [exchange, setExchange] = useState<"NSE" | "BSE" | "US">("NSE");
  const [search, setSearch] = useState("RELIANCE");
  const [ticker, setTicker] = useState(initialTicker || "RELIANCE.NS");
  const [watchlistMessage, setWatchlistMessage] = useState<string | null>(null);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Let external "Trade" shortcuts (Dashboard, Watchlist, Holdings) jump
  // straight to a specific ticker on this page.
  useEffect(() => {
    if (initialTicker && initialTicker !== ticker) {
      setTicker(initialTicker);
      setSearch(initialTicker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTicker]);

  // Auto-select the Exchange badge from whatever ticker is currently being
  // viewed so it always reflects the actual stock on screen rather than a
  // stale manual choice. Goes through the shared `resolveMarket` helper
  // (.NS -> NSE, .BO -> BSE, known Indian/US index tickers classified by
  // name, everything else -> US) instead of a local "no suffix -> US" rule,
  // which used to wrongly bucket suffix-less Indian indices like NIFTY50
  // (-> NSEI), BANKNIFTY (-> NSEBANK) and the smallcap index (-> CNXSC)
  // as US market.
  useEffect(() => {
    setExchange(resolveMarket(ticker));
  }, [ticker]);

  const formatter = useMemo(() => {
    let strategy = new USFormattingStrategy();
    if (exchange === "NSE") strategy = new NSEFormattingStrategy();
    else if (exchange === "BSE") strategy = new BSEFormattingStrategy();
    return new TickerFormatter(strategy);
  }, [exchange]);

  // Company-name search — lets people find a stock by typing "Reliance" or
  // "Apple" instead of needing to already know the ticker symbol.
  const searchQuery = useQuery({
    queryKey: ["symbol-search", search],
    queryFn: () => apiFetch<SearchResponse>(`/stocks/search?q=${encodeURIComponent(search)}`),
    enabled: search.trim().length >= 2 && showSuggestions,
    staleTime: 60_000
  });

  const profileQuery = useQuery({
    queryKey: ["profile", ticker],
    queryFn: () => apiFetch<ProfileResponse>(`/stocks/${ticker}/profile`, {}, token),
    retry: false
  });

  const livePrice = prices[ticker]?.price ?? null;

  useEffect(() => {
    addRecentlyViewed(ticker);
  }, [ticker]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) setTicker(formatter.format(search.trim().toUpperCase()));
    setShowSuggestions(false);
  };

  const selectSuggestion = (result: SearchResult) => {
    setTicker(result.ticker);
    setSearch(result.name);
    setShowSuggestions(false);
  };

  const addToWatchlist = async () => {
    setWatchlistLoading(true);
    setWatchlistMessage(null);
    try {
      const listsRes = await apiFetch<{ lists: Array<{ id: string; name: string }> }>("/watchlist/lists", {}, token);
      let listId = listsRes.lists[0]?.id;
      if (!listId) {
        const created = await apiFetch<{ list: { id: string } }>(
          "/watchlist/lists",
          { method: "POST", body: JSON.stringify({ name: "My Watchlist" }) },
          token
        );
        listId = created.list.id;
      }
      await apiFetch(`/watchlist/lists/${listId}`, { method: "POST", body: JSON.stringify({ ticker }) }, token);
      setWatchlistMessage(`✓ ${ticker} added to your watchlist`);
      await queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      await queryClient.invalidateQueries({ queryKey: ["watchlist-lists"] });
    } catch (error) {
      setWatchlistMessage((error as Error).message);
    } finally {
      setWatchlistLoading(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "1fr 340px", alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

        {/* Search Bar */}
        <div className="card" style={{ display: "flex", gap: "1rem", alignItems: "center", position: "relative" }} ref={searchBoxRef}>
          <form onSubmit={handleSearch} style={{ display: "flex", gap: "1rem", flex: 1 }}>
            <select
              className="form-select"
              value={exchange}
              onChange={(e) => setExchange(e.target.value as any)}
              style={{ width: "200px" }}
            >
              <option value="NSE">NSE (India)</option>
              <option value="BSE">BSE (India)</option>
              <option value="US">US Market</option>
            </select>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                className="form-input"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder={exchange === "US" ? "Search by name, e.g. Apple" : "Search by name, e.g. Reliance"}
                style={{ width: "100%" }}
                autoComplete="off"
              />
              {showSuggestions && search.trim().length >= 2 && (
                <div
                  className="glass-panel"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    left: 0,
                    right: 0,
                    zIndex: 30,
                    borderRadius: "0.5rem",
                    overflow: "hidden",
                    maxHeight: "280px",
                    overflowY: "auto"
                  }}
                >
                  {searchQuery.isLoading ? (
                    <div style={{ padding: "0.75rem 1rem", color: "var(--text-3)" }}>Searching…</div>
                  ) : (searchQuery.data?.results.length ?? 0) === 0 ? (
                    <div style={{ padding: "0.75rem 1rem", color: "var(--text-3)" }}>No matches — try the exact ticker instead.</div>
                  ) : (
                    searchQuery.data!.results.map((r) => (
                      <button
                        key={r.ticker}
                        type="button"
                        onClick={() => selectSuggestion(r)}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          width: "100%",
                          padding: "0.6rem 1rem",
                          background: "transparent",
                          border: "none",
                          borderBottom: "1px solid var(--outline-variant)",
                          color: "var(--on-surface)",
                          cursor: "pointer",
                          textAlign: "left"
                        }}
                      >
                        <span>{r.name}</span>
                        <span style={{ color: "var(--text-3)", fontFamily: "var(--font-data)" }}>{r.ticker}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <button type="submit" className="btn-primary" style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}>Search</button>
          </form>
        </div>

        {/* Chart */}
        <StockChartCard token={token} ticker={ticker} />

        {/* Company Profile */}
        <div className="card">
          <div className="card-header">
            <h2>Company Profile</h2>
          </div>
          {profileQuery.isLoading ? (
            <div style={{ color: "var(--text-3)", padding: "1rem" }}>Loading profile...</div>
          ) : profileQuery.isError ? (
            <div style={{ color: "var(--text-3)", padding: "1rem" }}>Profile data unavailable for this ticker.</div>
          ) : profileQuery.data ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1.5rem" }}>
              <div>
                <div className="label-sm" style={{ color: "var(--text-3)" }}>Sector</div>
                <div className="body-md">{profileQuery.data.sector}</div>
              </div>
              <div>
                <div className="label-sm" style={{ color: "var(--text-3)" }}>Industry</div>
                <div className="body-md">{profileQuery.data.industry}</div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <hr style={{ border: "none", borderTop: "1px solid var(--outline-variant)", margin: "0 0 1rem" }} />
                <div className="label-sm" style={{ color: "var(--text-3)", marginBottom: "0.5rem" }}>About</div>
                <p className="body-sm" style={{ color: "var(--text-2)", lineHeight: 1.6 }}>
                  {profileQuery.data.description || "No description available."}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Buy / Hold / Sell Recommendation */}
        <RecommendationCard ticker={ticker} token={token} />

        {/* Overview, Technicals & News */}
        <div className="terminal-insights-grid">
          <div style={{ minWidth: 0 }}>{profileQuery.data && <StockPerformancePanel ticker={ticker} data={profileQuery.data} livePrice={livePrice} />}</div>
          <div style={{ minWidth: 0 }}><TechnicalsPanel ticker={ticker} /></div>
          <div style={{ minWidth: 0 }}><NewsPanel ticker={ticker} /></div>
        </div>

        {/* Similar Stocks */}
        <SimilarStocksCard ticker={ticker} onSelect={(t) => { setTicker(t); setSearch(t); }} />

        {/* Order History */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <OrderHistory token={token} />
        </div>
      </div>

      {/* Sidebar: Buy/Sell */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <OrderForm
          initialTicker={ticker}
          dbTicker={ticker}
          lockTicker
          onOrderPlaced={() => {
            queryClient.invalidateQueries({ queryKey: ["portfolio"] });
          }}
        />

        <button
          className="btn-sm"
          style={{ width: "100%", padding: "0.65rem" }}
          onClick={() => void addToWatchlist()}
          disabled={watchlistLoading}
        >
          {watchlistLoading ? "Adding…" : "+ Add to Watchlist"}
        </button>
        {watchlistMessage && (
          <p className="body-sm" style={{ marginTop: "0.5rem", color: "var(--text-2)" }}>{watchlistMessage}</p>
        )}
      </div>
    </div>
  );
}
