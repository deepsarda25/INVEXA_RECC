import { formatCurrency, formatCompactCurrency } from "../utils/currency";

type ProfileData = {
  open: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  previousClose: number | null;
  volume: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
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

function fmtNum(n: number | null, suffix = "") {
  return n != null ? `${n.toLocaleString("en-IN")}${suffix}` : "N/A";
}

function RangeBar({
  ticker,
  low,
  high,
  current,
  lowLabel,
  highLabel
}: {
  ticker: string;
  low: number | null;
  high: number | null;
  current: number | null;
  lowLabel: string;
  highLabel: string;
}) {
  const pct = low != null && high != null && current != null && high > low ? Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100)) : 50;
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--text-3)" }}>
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
        <strong className="body-md">{formatCurrency(ticker, low)}</strong>
        <strong className="body-md">{formatCurrency(ticker, high)}</strong>
      </div>
      <div style={{ position: "relative", height: "4px", background: "var(--outline-variant)", borderRadius: "2px" }}>
        <div
          style={{
            position: "absolute",
            left: `calc(${pct}% - 5px)`,
            top: "-5px",
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderBottom: "7px solid var(--on-surface)"
          }}
        />
      </div>
    </div>
  );
}

export function StockPerformancePanel({
  ticker,
  data,
  livePrice
}: {
  ticker: string;
  data: ProfileData;
  livePrice: number | null;
}) {
  const fundamentalRows: Array<[string, string, string, string]> = [
    ["Market Cap", formatCompactCurrency(ticker, data.marketCap), "ROE", data.roe != null ? `${data.roe.toFixed(2)}%` : "N/A"],
    ["P/E Ratio(TTM)", data.peRatio != null ? data.peRatio.toFixed(2) : "N/A", "EPS(TTM)", data.eps != null ? data.eps.toFixed(2) : "N/A"],
    ["P/B Ratio", data.pbRatio != null ? data.pbRatio.toFixed(2) : "N/A", "Dividend Yield", data.dividendYield != null ? `${data.dividendYield.toFixed(2)}%` : "N/A"],
    ["Industry P/E", data.industryPE != null ? data.industryPE.toFixed(2) : "N/A", "Book Value", data.bookValue != null ? data.bookValue.toFixed(2) : "N/A"],
    ["Face Value", data.faceValue != null ? String(data.faceValue) : "N/A", "Debt to Equity", data.debtToEquity != null ? data.debtToEquity.toFixed(2) : "N/A"]
  ];

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="title-sm">Overview</h2>
      </div>

      <RangeBar ticker={ticker} low={data.dayLow} high={data.dayHigh} current={livePrice} lowLabel="Today's low" highLabel="Today's high" />
      <RangeBar ticker={ticker} low={data.fiftyTwoWeekLow} high={data.fiftyTwoWeekHigh} current={livePrice} lowLabel="52 week low" highLabel="52 week high" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem", marginTop: "0.5rem" }}>
        <div>
          <div className="label-sm" style={{ color: "var(--text-3)" }}>Open price</div>
          <div className="body-md" style={{ fontFamily: "var(--font-data)" }}>{formatCurrency(ticker, data.open)}</div>
        </div>
        <div>
          <div className="label-sm" style={{ color: "var(--text-3)" }}>Previous close</div>
          <div className="body-md" style={{ fontFamily: "var(--font-data)" }}>{formatCurrency(ticker, data.previousClose)}</div>
        </div>
        <div>
          <div className="label-sm" style={{ color: "var(--text-3)" }}>Live volume</div>
          <div className="body-md" style={{ fontFamily: "var(--font-data)" }}>{fmtNum(data.volume)}</div>
        </div>
        <div>
          <div className="label-sm" style={{ color: "var(--text-3)" }}>Lower circuit</div>
          <div className="body-md" style={{ fontFamily: "var(--font-data)" }}>{formatCurrency(ticker, data.lowerCircuit)}</div>
        </div>
        <div>
          <div className="label-sm" style={{ color: "var(--text-3)" }}>Upper circuit</div>
          <div className="body-md" style={{ fontFamily: "var(--font-data)" }}>{formatCurrency(ticker, data.upperCircuit)}</div>
        </div>
      </div>

      <div className="card-header" style={{ marginTop: "1.5rem" }}>
        <h2 className="title-sm">Fundamentals</h2>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
        {fundamentalRows.map(([labelA, valueA, labelB, valueB]) => (
          <div key={labelA} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="label-sm" style={{ color: "var(--text-3)" }}>{labelA}</span>
              <strong className="body-sm">{valueA}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="label-sm" style={{ color: "var(--text-3)" }}>{labelB}</span>
              <strong className="body-sm">{valueB}</strong>
            </div>
          </div>
        ))}
      </div>

      {/* Financial Performance */}
      {data.quarterlyFinancials && data.quarterlyFinancials.length > 0 && (
        <>
          <div className="card-header" style={{ marginTop: "1.5rem" }}>
            <h2 className="title-sm">Financial Performance</h2>
            <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>Quarterly revenue &amp; profit</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Quarter</th>
                <th>Revenue</th>
                <th>Profit</th>
              </tr>
            </thead>
            <tbody>
              {data.quarterlyFinancials.map((q) => (
                <tr key={q.period}>
                  <td>{q.period}</td>
                  <td>{formatCompactCurrency(ticker, q.revenue)}</td>
                  <td className={q.profit != null && q.profit >= 0 ? "good" : q.profit != null ? "bad" : undefined}>
                    {formatCompactCurrency(ticker, q.profit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Shareholding Pattern */}
      {data.shareholding && (
        <>
          <div className="card-header" style={{ marginTop: "1.5rem" }}>
            <h2 className="title-sm">Shareholding Pattern</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {([
              ["Promoters / Insiders", data.shareholding.insiders, "var(--secondary-neon)"],
              ["Institutions (FII + DII)", data.shareholding.institutions, "#6c8cff"],
              ["Public", data.shareholding.public, "var(--outline-variant)"]
            ] as const).map(([label, value, color]) => (
              <div key={label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
                  <span style={{ color: "var(--text-2)" }}>{label}</span>
                  <strong>{value != null ? `${value.toFixed(2)}%` : "N/A"}</strong>
                </div>
                <div style={{ height: "6px", background: "var(--outline-variant)", borderRadius: "3px" }}>
                  <div style={{ width: `${value ?? 0}%`, height: "100%", background: color, borderRadius: "3px" }} />
                </div>
              </div>
            ))}
          </div>
          <p className="label-sm" style={{ color: "var(--text-3)", marginTop: "0.75rem" }}>
            Approximated from Yahoo Finance's insider/institutional holding data — not the exact Promoter/FII/DII split reported to Indian exchanges.
          </p>
        </>
      )}
    </div>
  );
}
