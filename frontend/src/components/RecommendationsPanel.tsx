import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRecommendations, type RecommendationMarket, type RecommendationSignal, type StockRecommendation } from "../api/client";

function fmtMoney(value: number | null, currency: "INR" | "USD") {
  if (value == null) return "N/A";
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value);
}

function RecommendationTile({ item }: { item: StockRecommendation }) {
  return (
    <article className={`recommendation-card signal-${item.signal.toLowerCase()}`}>
      <div className="recommendation-card-top">
        <div>
          <strong style={{ display: "block" }}>{item.ticker}</strong>
          <span style={{ color: "var(--text-3)", fontSize: "0.78rem" }}>{item.name}</span>
        </div>
        <span className={`badge badge-${item.signal.toLowerCase()}`}>{item.signal.replace("_", " ")}</span>
      </div>

      <div className="recommendation-meta">
        <span>{item.market}</span>
        <span>{item.sector}</span>
        <span>Score {item.score}/100</span>
        <span>Risk {item.riskRating}</span>
      </div>

      <dl className="recommendation-fields">
        <div>
          <dt>Price</dt>
          <dd>
            {fmtMoney(item.currentPrice, item.currency)}
            {item.inrEquivalent && (
              <span style={{ display: "block", fontSize: "0.68rem", color: "var(--text-3)", fontWeight: 400 }}>
                ≈ {fmtMoney(item.inrEquivalent.currentPrice, "INR")}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>Buy range</dt>
          <dd>
            {item.levels.buyRange
              ? `${fmtMoney(item.levels.buyRange.low, item.currency)} – ${fmtMoney(item.levels.buyRange.high, item.currency)}`
              : item.signal === "SELL"
                ? "n/a (Sell)"
                : "N/A"}
          </dd>
        </div>
        <div>
          <dt>{item.signal === "SELL" ? "Downside target" : "Target"}</dt>
          <dd>
            {item.levels.targetRange
              ? `${fmtMoney(item.levels.targetRange.low, item.currency)} – ${fmtMoney(item.levels.targetRange.high, item.currency)}`
              : "N/A"}
          </dd>
        </div>
        <div>
          <dt>{item.signal === "SELL" ? "Invalidation" : "Stop-loss"}</dt>
          <dd>{fmtMoney(item.levels.stopLoss, item.currency)}</dd>
        </div>
      </dl>

      {item.reasons.length > 0 && (
        <ul className="recommendation-reasons">
          {item.reasons.slice(0, 3).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      <span style={{ fontSize: "0.68rem", color: "var(--text-3)" }}>
        Updated {new Date(item.timestamp).toLocaleTimeString()} · {item.source}
      </span>
    </article>
  );
}

export function RecommendationsPanel({ onTrade }: { onTrade?: (ticker: string) => void }) {
  const [market, setMarket] = useState<RecommendationMarket | "">("");
  const [sector, setSector] = useState<string>("");
  const [signal, setSignal] = useState<RecommendationSignal | "ALL">("ALL");
  const [view, setView] = useState<"top-picks" | "all">("top-picks");

  const query = useQuery({
    queryKey: ["recommendations", market, sector, signal],
    queryFn: () => getRecommendations({ market: market || undefined, sector: sector || undefined, signal }),
    staleTime: 5 * 60 * 1000
  });

  const sectors = Array.from(new Set(query.data?.results.map((r) => r.sector) ?? [])).sort();
  const displayed = view === "top-picks" ? query.data?.topPicksBySector ?? [] : query.data?.results ?? [];

  return (
    <div className="card recommendations-panel">
      <div className="card-header" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h2 className="title-sm">Market Recommendations</h2>
          <p className="body-sm" style={{ color: "var(--text-3)", margin: "0.2rem 0 0" }}>
            Technical + fundamental screening across NSE, BSE and US, sector by sector. US prices show in USD, with
            an INR-equivalent alongside (fixed assumed rate: 1 USD = {query.data?.usdToInrRate ?? 95} INR).
          </p>
        </div>
        <div className="recommendation-filters">
          <select className="form-select" value={market} onChange={(e) => setMarket(e.target.value as any)}>
            <option value="">All markets</option>
            <option value="NSE">NSE (India)</option>
            <option value="BSE">BSE (India)</option>
            <option value="US">US Market</option>
          </select>
          <select className="form-select" value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="">All sectors</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select className="form-select" value={signal} onChange={(e) => setSignal(e.target.value as any)}>
            <option value="ALL">All signals</option>
            <option value="BUY">Buy</option>
            <option value="HOLD">Hold</option>
            <option value="SELL">Sell</option>
          </select>
          <div style={{ display: "flex", gap: "0.3rem" }}>
            <button
              className="btn-sm"
              style={{
                background: view === "top-picks" ? "var(--primary-container)" : "var(--surface-variant)",
                color: view === "top-picks" ? "var(--on-primary, #fff)" : "var(--on-surface-variant)",
                border: "none"
              }}
              onClick={() => setView("top-picks")}
            >
              Top pick / sector
            </button>
            <button
              className="btn-sm"
              style={{
                background: view === "all" ? "var(--primary-container)" : "var(--surface-variant)",
                color: view === "all" ? "var(--on-primary, #fff)" : "var(--on-surface-variant)",
                border: "none"
              }}
              onClick={() => setView("all")}
            >
              All results
            </button>
          </div>
        </div>
      </div>

      {query.isLoading ? (
        <div style={{ color: "var(--text-3)", padding: "1rem 0" }}>Screening the universe…</div>
      ) : query.isError ? (
        <p className="muted" style={{ padding: "0.5rem 0" }}>Could not load recommendations right now.</p>
      ) : displayed.length === 0 ? (
        <p className="muted" style={{ padding: "0.5rem 0" }}>No names match these filters.</p>
      ) : (
        <div className="recommendation-grid">
          {displayed.map((item) => (
            <div key={`${item.market}-${item.ticker}`} onClick={() => onTrade?.(item.ticker)} style={{ cursor: onTrade ? "pointer" : "default" }}>
              <RecommendationTile item={item} />
            </div>
          ))}
        </div>
      )}

      {query.data && query.data.noDataCount > 0 && (
        <p className="body-sm" style={{ color: "var(--text-3)", marginTop: "0.5rem" }}>
          {query.data.noDataCount} of {query.data.universeSize} tracked names had no usable live data this pass —
          open a stock's Research page to enter data for it manually.
        </p>
      )}

      <p className="recommendation-disclaimer">
        {query.data ? `Scored ${query.data.scoredCount} of ${query.data.universeSize} tracked names · ` : ""}
        {query.data?.disclaimer ??
          "Heuristic, rules-based screening signal. Not personalized financial advice — do your own research before trading."}
      </p>
    </div>
  );
}
