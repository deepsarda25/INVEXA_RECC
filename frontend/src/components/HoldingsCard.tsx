import { useState } from "react";
import { HoldingsAnalysis } from "./HoldingsAnalysis";
import { formatCurrency } from "../utils/currency";

type Holding = {
  ticker: string;
  quantity: number;
  avgCost: number;
  livePrice: number;
  marketValue: number;
  unrealizedPnl: number;
};

type Portfolio = {
  cash: number;
  totalHoldingsValue: number;
  totalPortfolioValue: number;
  totalUnrealizedPnl: number;
  holdings: Holding[];
};

type Props = {
  data?: Portfolio;
  onTrade?: (ticker: string) => void;
};

// Portfolio-level totals are always in the account's base currency (INR —
// see the practice balance on the Auth page), regardless of which markets
// the underlying holdings trade on.
function fmtCurTotal(n: number) {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PnlCell({ ticker, value, pct }: { ticker: string; value: number; pct: number }) {
  const sign = value >= 0 ? "+" : "";
  return (
    <span className={value >= 0 ? "good" : "bad"}>
      {sign}{formatCurrency(ticker, value)} ({sign}{pct.toFixed(2)}%)
    </span>
  );
}

export function HoldingsCard({ data, onTrade }: Props) {
  const holdings = data?.holdings ?? [];
  const [view, setView] = useState<"holdings" | "analyse">("holdings");

  return (
    <div className="card">
      <div className="card-header">
        <h2>Holdings</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn-sm"
            style={{ background: view === "holdings" ? "var(--primary-container)" : "var(--surface-variant)", color: view === "holdings" ? "var(--on-primary)" : "var(--on-surface-variant)", border: "none" }}
            onClick={() => setView("holdings")}
          >
            Holdings
          </button>
          <button
            className="btn-sm"
            style={{ background: view === "analyse" ? "var(--primary-container)" : "var(--surface-variant)", color: view === "analyse" ? "var(--on-primary)" : "var(--on-surface-variant)", border: "none" }}
            onClick={() => setView("analyse")}
          >
            📊 Analyse
          </button>
        </div>
      </div>

      {view === "analyse" ? (
        <HoldingsAnalysis holdings={holdings} />
      ) : (
        <>
          {holdings.length > 0 && (
        <div className="stats-row" style={{ marginBottom: "1.25rem" }}>
          <div className="stat-cell">
            <span>Holdings Market Value</span>
            <strong>{fmtCurTotal(data!.totalHoldingsValue)}</strong>
          </div>
          <div className="stat-cell">
            <span>Unrealized P&amp;L</span>
            <strong className={data!.totalUnrealizedPnl >= 0 ? "good" : "bad"}>
              {data!.totalUnrealizedPnl >= 0 ? "+" : ""}{fmtCurTotal(data!.totalUnrealizedPnl)}
            </strong>
          </div>
          <div className="stat-cell">
            <span>Distinct Stocks</span>
            <strong>{holdings.length}</strong>
          </div>
        </div>
      )}

      {holdings.length === 0 ? (
        <p className="muted" style={{ padding: "1rem 0" }}>
          You don't hold any stocks yet. Buy something from the Terminal to see it show up here.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Qty</th>
                <th>Avg Cost</th>
                <th>Live Price</th>
                <th>Mkt Value</th>
                <th>P&amp;L</th>
                {onTrade && <th></th>}
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => {
                const pct = h.avgCost > 0 ? ((h.livePrice - h.avgCost) / h.avgCost) * 100 : 0;
                return (
                  <tr key={h.ticker}>
                    <td><strong>{h.ticker}</strong></td>
                    <td>{h.quantity}</td>
                    <td>{formatCurrency(h.ticker, h.avgCost)}</td>
                    <td>{formatCurrency(h.ticker, h.livePrice)}</td>
                    <td>{formatCurrency(h.ticker, h.marketValue)}</td>
                    <td><PnlCell ticker={h.ticker} value={h.unrealizedPnl} pct={pct} /></td>
                    {onTrade && (
                      <td>
                        <button className="btn-sm" onClick={() => onTrade(h.ticker)}>Trade</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}
    </div>
  );
}
