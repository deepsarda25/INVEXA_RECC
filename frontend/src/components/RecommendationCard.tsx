import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, submitManualRecommendation, type StockRecommendation } from "../api/client";

function fmtMoney(value: number | null, currency: "INR" | "USD") {
  if (value == null) return "N/A";
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value);
}

function signalClass(signal: string) {
  return `badge badge-${signal.toLowerCase()}`;
}

const HORIZON_LABELS: Record<"shortTerm" | "swing" | "longTerm", string> = {
  shortTerm: "Short-term (days)",
  swing: "Swing (weeks)",
  longTerm: "Long-term (months+)"
};

type ManualForm = {
  currentPrice: string;
  rsi14: string;
  sma20: string;
  sma50: string;
  momentum20Pct: string;
  volatility20AnnualizedPct: string;
  peRatio: string;
  roe: string;
  debtToEquity: string;
};

const EMPTY_MANUAL: ManualForm = {
  currentPrice: "",
  rsi14: "",
  sma20: "",
  sma50: "",
  momentum20Pct: "",
  volatility20AnnualizedPct: "",
  peRatio: "",
  roe: "",
  debtToEquity: ""
};

function ManualEntryForm({ ticker, token, onSaved }: { ticker: string; token?: string | null; onSaved: (rec: StockRecommendation) => void }) {
  const [form, setForm] = useState<ManualForm>(EMPTY_MANUAL);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
      if (num(form.currentPrice) == null) {
        throw new Error("Current price is required.");
      }
      return submitManualRecommendation(
        ticker,
        {
          currentPrice: num(form.currentPrice),
          technical: {
            rsi14: num(form.rsi14),
            sma20: num(form.sma20),
            sma50: num(form.sma50),
            momentum20Pct: num(form.momentum20Pct),
            volatility20AnnualizedPct: num(form.volatility20AnnualizedPct)
          },
          fundamentals: {
            peRatio: num(form.peRatio),
            roe: num(form.roe),
            debtToEquity: num(form.debtToEquity)
          }
        },
        token
      );
    },
    onSuccess: (rec) => onSaved(rec),
    onError: (e: any) => setError(e.message ?? "Could not score the ticker with this data.")
  });

  return (
    <div style={{ borderTop: "1px solid var(--outline-variant)", marginTop: "0.75rem", paddingTop: "0.75rem" }}>
      <p className="body-sm" style={{ color: "var(--text-3)", marginBottom: "0.5rem" }}>
        No live price history for <strong>{ticker}</strong>. Enter what you know and we'll score it from that instead
        — current price is required, everything else is optional (unknown fields are simply left out of the score).
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
        <input
          className="form-input"
          placeholder="Current price *"
          value={form.currentPrice}
          onChange={(e) => setForm((f) => ({ ...f, currentPrice: e.target.value }))}
        />
        <input
          className="form-input"
          placeholder="RSI (14)"
          value={form.rsi14}
          onChange={(e) => setForm((f) => ({ ...f, rsi14: e.target.value }))}
        />
        <input
          className="form-input"
          placeholder="20-day SMA"
          value={form.sma20}
          onChange={(e) => setForm((f) => ({ ...f, sma20: e.target.value }))}
        />
        <input
          className="form-input"
          placeholder="50-day SMA"
          value={form.sma50}
          onChange={(e) => setForm((f) => ({ ...f, sma50: e.target.value }))}
        />
        <input
          className="form-input"
          placeholder="20-day momentum %"
          value={form.momentum20Pct}
          onChange={(e) => setForm((f) => ({ ...f, momentum20Pct: e.target.value }))}
        />
        <input
          className="form-input"
          placeholder="Annualized volatility %"
          value={form.volatility20AnnualizedPct}
          onChange={(e) => setForm((f) => ({ ...f, volatility20AnnualizedPct: e.target.value }))}
        />
        <input
          className="form-input"
          placeholder="P/E ratio"
          value={form.peRatio}
          onChange={(e) => setForm((f) => ({ ...f, peRatio: e.target.value }))}
        />
        <input
          className="form-input"
          placeholder="ROE %"
          value={form.roe}
          onChange={(e) => setForm((f) => ({ ...f, roe: e.target.value }))}
        />
        <input
          className="form-input"
          placeholder="Debt-to-equity"
          value={form.debtToEquity}
          onChange={(e) => setForm((f) => ({ ...f, debtToEquity: e.target.value }))}
        />
      </div>
      {error && <p style={{ color: "var(--error-neon)", fontSize: "0.78rem", marginTop: "0.4rem" }}>{error}</p>}
      <button
        className="btn-sm"
        style={{ marginTop: "0.6rem", background: "var(--primary-container)", color: "var(--on-primary, #fff)", border: "none" }}
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Scoring…" : "Score with my data"}
      </button>
    </div>
  );
}

export function RecommendationCard({ ticker, token }: { ticker: string; token?: string | null }) {
  const queryClient = useQueryClient();
  const [manualResult, setManualResult] = useState<StockRecommendation | null>(null);

  const query = useQuery({
    queryKey: ["recommendation", ticker],
    queryFn: () => apiFetch<StockRecommendation>(`/stocks/${ticker}/recommendation`, {}, token),
    retry: false,
    staleTime: 10 * 60 * 1000
  });

  const data = manualResult ?? query.data;

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="title-sm">Recommendation</h2>
        {data && <span className={signalClass(data.signal)}>{data.signal.replace("_", " ")}</span>}
      </div>

      {query.isLoading ? (
        <div style={{ color: "var(--text-3)", padding: "1rem 0" }}>Scoring {ticker}…</div>
      ) : query.isError || !data ? (
        <p className="muted" style={{ padding: "0.5rem 0" }}>
          Not enough data to score {ticker} right now.
        </p>
      ) : (
        <>
          {data.dataSource !== "LIVE" && (
            <div className="recommendation-meta" style={{ background: "rgba(255,196,87,0.1)", padding: "0.3rem 0.5rem", borderRadius: "0.4rem" }}>
              <span>
                {data.dataSource === "USER_PROVIDED" ? "Based entirely on data you entered." : "Mixed: live data + fields you entered."}
              </span>
            </div>
          )}

          <div className="recommendation-meta">
            <span>Score {data.score}/100</span>
            <span>Confidence {data.confidence}</span>
            <span>Risk {data.riskRating}</span>
            <span>{data.sector}</span>
          </div>

          <dl className="recommendation-fields">
            <div>
              <dt>Current price</dt>
              <dd>
                {fmtMoney(data.currentPrice, data.currency)}
                {data.inrEquivalent && (
                  <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 400 }}>
                    ≈ {fmtMoney(data.inrEquivalent.currentPrice, "INR")}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>Buy range</dt>
              <dd>
                {data.levels.buyRange
                  ? `${fmtMoney(data.levels.buyRange.low, data.currency)} – ${fmtMoney(data.levels.buyRange.high, data.currency)}`
                  : data.signal === "SELL"
                    ? "Not applicable (Sell signal)"
                    : "N/A"}
              </dd>
            </div>
            <div>
              <dt>{data.signal === "SELL" ? "Downside target" : "Target range"}</dt>
              <dd>
                {data.levels.targetRange
                  ? `${fmtMoney(data.levels.targetRange.low, data.currency)} – ${fmtMoney(data.levels.targetRange.high, data.currency)}`
                  : "N/A"}
              </dd>
            </div>
            <div>
              <dt>{data.signal === "SELL" ? "Invalidation level" : "Stop-loss"}</dt>
              <dd>{fmtMoney(data.levels.stopLoss, data.currency)}</dd>
            </div>
            <div>
              <dt>RSI (14, Wilder)</dt>
              <dd>{data.technical.rsi14 ?? "N/A"}</dd>
            </div>
            <div>
              <dt>20D momentum</dt>
              <dd>{data.technical.momentum20Pct != null ? `${data.technical.momentum20Pct}%` : "N/A"}</dd>
            </div>
            <div>
              <dt>Ann. volatility</dt>
              <dd>{data.technical.volatility20AnnualizedPct != null ? `${data.technical.volatility20AnnualizedPct}%` : "N/A"}</dd>
            </div>
            <div>
              <dt>P/E · ROE</dt>
              <dd>
                {data.fundamentals.peRatio ?? "N/A"} · {data.fundamentals.roe != null ? `${data.fundamentals.roe}%` : "N/A"}
              </dd>
            </div>
          </dl>

          <p style={{ fontSize: "0.7rem", color: "var(--text-3)", margin: 0 }}>{data.levelBasis}</p>

          <div className="recommendation-meta" style={{ marginTop: "0.25rem" }}>
            {(Object.keys(HORIZON_LABELS) as Array<keyof typeof HORIZON_LABELS>).map((k) => (
              <span key={k}>
                {HORIZON_LABELS[k]}: <strong>{data.horizon[k].replace("_", " ")}</strong>
              </span>
            ))}
          </div>

          {data.reasons.length > 0 && (
            <ul className="recommendation-reasons">
              {data.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}

          <p className="recommendation-disclaimer">
            {data.source} · updated {new Date(data.timestamp).toLocaleString()}. {data.disclaimer}
          </p>

          {data.signal === "NO_DATA" && data.manualEntryAvailable && (
            <ManualEntryForm
              ticker={ticker}
              token={token}
              onSaved={(rec) => {
                setManualResult(rec);
                queryClient.setQueryData(["recommendation", ticker], rec);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
