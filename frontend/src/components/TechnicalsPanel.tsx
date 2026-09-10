import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import { sma, ema, rsi, macd, pivotPoints, beta as computeBeta, Verdict } from "../utils/technicals";

type OhlcPoint = { time?: string; bucket?: string; open: number; high: number; low: number; close: number };
type HistoryResponse = { points: OhlcPoint[] };

type Range = "1d" | "1w" | "1mo" | "3mo" | "6mo" | "1y" | "3y" | "5y" | "max";

const RANGE_OPTIONS: { id: Range; label: string }[] = [
  { id: "1d", label: "1D" },
  { id: "1w", label: "1W" },
  { id: "1mo", label: "1M" },
  { id: "3mo", label: "3M" },
  { id: "6mo", label: "6M" },
  { id: "1y", label: "1Y" },
  { id: "3y", label: "3Y" },
  { id: "5y", label: "5Y" },
  { id: "max", label: "Max" }
];

const MA_PERIODS = [10, 20, 50, 100, 200];

function verdictColor(v: Verdict) {
  if (v === "Bullish") return "var(--secondary-neon)";
  if (v === "Bearish") return "var(--error-neon)";
  return "var(--text-3)";
}

function fmtNum(n: number | null) {
  return n != null ? n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "N/A";
}

const boxStyle: CSSProperties = {
  border: "1px solid var(--outline-variant)",
  borderRadius: "0.5rem",
  padding: "1rem 1.25rem"
};

export function TechnicalsPanel({ ticker }: { ticker: string }) {
  const [range, setRange] = useState<Range>("1y");
  const benchmark = ticker.toUpperCase().endsWith(".NS") || ticker.toUpperCase().endsWith(".BO") ? "NSEI" : "GSPC";

  const stockHistory = useQuery({
    queryKey: ["technicals-history", ticker, range],
    queryFn: () => apiFetch<HistoryResponse>(`/stocks/${ticker}/history?range=${range}`),
    retry: false
  });

  const indexHistory = useQuery({
    queryKey: ["technicals-index", benchmark, range],
    queryFn: () => apiFetch<HistoryResponse>(`/stocks/${benchmark}/history?range=${range}`),
    retry: false
  });

  const analysis = useMemo(() => {
    const points = stockHistory.data?.points ?? [];
    if (points.length < 2) return null;

    const closes = points.map((p) => p.close);
    const highs = points.map((p) => p.high);
    const lows = points.map((p) => p.low);
    const currentPrice = closes[closes.length - 1];

    const periodHigh = Math.max(...highs);
    const periodLow = Math.min(...lows);
    const pivots = pivotPoints(periodHigh, periodLow, currentPrice);

    const rsiValue = rsi(closes, 14);
    const macdValue = macd(closes, 12, 26, 9);
    const betaValue = computeBeta(closes, (indexHistory.data?.points ?? []).map((p) => p.close));

    const mas = MA_PERIODS.map((period) => ({
      period,
      sma: sma(closes, period),
      ema: ema(closes, period)
    }));

    let bullish = 0;
    let bearish = 0;
    let neutral = 0;
    const tally = (v: Verdict) => {
      if (v === "Bullish") bullish++;
      else if (v === "Bearish") bearish++;
      else neutral++;
    };

    const pivotVerdict: Verdict = currentPrice > pivots.r1 ? "Bullish" : currentPrice < pivots.s1 ? "Bearish" : "Neutral";
    tally(pivotVerdict);

    const rsiVerdict: Verdict = rsiValue == null ? "Neutral" : rsiValue > 70 ? "Bearish" : rsiValue < 30 ? "Bullish" : "Neutral";
    tally(rsiVerdict);

    const macdVerdict: Verdict = !macdValue
      ? "Neutral"
      : macdValue.macdLine > macdValue.signalLine
        ? "Bullish"
        : macdValue.macdLine < macdValue.signalLine
          ? "Bearish"
          : "Neutral";
    tally(macdVerdict);

    mas.forEach(({ sma: s, ema: e }) => {
      if (s != null) tally(currentPrice >= s ? "Bullish" : "Bearish");
      if (e != null) tally(currentPrice >= e ? "Bullish" : "Bearish");
    });

    const score = bullish - bearish;
    let summaryLabel = "Neutral";
    if (score >= 8) summaryLabel = "Strongly Bullish";
    else if (score >= 3) summaryLabel = "Bullish";
    else if (score <= -8) summaryLabel = "Strongly Bearish";
    else if (score <= -3) summaryLabel = "Bearish";

    const macdSignalVerdict: Verdict = !macdValue
      ? "Neutral"
      : macdValue.macdLine > macdValue.signalLine
        ? "Bullish"
        : macdValue.macdLine < macdValue.signalLine
          ? "Bearish"
          : "Neutral";

    return {
      currentPrice,
      pivots,
      rsiValue,
      rsiVerdict,
      macdValue,
      macdSignalVerdict,
      betaValue,
      mas,
      bullish,
      bearish,
      neutral,
      summaryLabel
    };
  }, [stockHistory.data, indexHistory.data]);

  const summaryTone: Verdict = analysis
    ? analysis.summaryLabel.includes("Bear") ? "Bearish" : analysis.summaryLabel.includes("Bull") ? "Bullish" : "Neutral"
    : "Neutral";

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <h2 className="title-sm">Technicals</h2>
        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setRange(opt.id)}
              className="btn-sm"
              style={{
                background: range === opt.id ? "var(--primary-container)" : "var(--surface-variant)",
                color: range === opt.id ? "var(--on-primary)" : "var(--on-surface-variant)",
                border: "none"
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {stockHistory.isLoading ? (
        <div style={{ color: "var(--text-3)", padding: "1rem 0" }}>Crunching the numbers…</div>
      ) : !analysis ? (
        <p className="muted" style={{ padding: "0.5rem 0" }}>Not enough price history for this range to compute technicals.</p>
      ) : (
        <>
          {/* Summary */}
          <div style={boxStyle}>
            <div className="label-sm" style={{ color: "var(--text-3)", marginBottom: "0.75rem" }}>
              Summary · based on {RANGE_OPTIONS.find((r) => r.id === range)?.label} data
            </div>
            <div className="body-sm" style={{ color: "var(--text-2)" }}>Based on technicals, this stock is</div>
            <div className="title-md" style={{ color: verdictColor(summaryTone), marginBottom: "0.9rem" }}>
              {analysis.summaryLabel}
            </div>
            <div style={{ display: "flex", gap: "2px" }}>
              {Array.from({ length: analysis.bearish }).map((_, i) => (
                <div key={`b${i}`} style={{ flex: 1, height: "20px", background: "var(--error-neon)", borderRadius: "2px" }} />
              ))}
              {Array.from({ length: analysis.neutral }).map((_, i) => (
                <div key={`n${i}`} style={{ flex: 1, height: "20px", background: "var(--outline-variant)", borderRadius: "2px" }} />
              ))}
              {Array.from({ length: analysis.bullish }).map((_, i) => (
                <div key={`u${i}`} style={{ flex: 1, height: "20px", background: "var(--secondary-neon)", borderRadius: "2px" }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.78rem", marginTop: "0.75rem", color: "var(--text-2)" }}>
              <span><span style={{ color: "var(--error-neon)" }}>●</span> Bearish {analysis.bearish}</span>
              <span><span style={{ color: "var(--text-3)" }}>●</span> Neutral {analysis.neutral}</span>
              <span><span style={{ color: "var(--secondary-neon)" }}>●</span> Bullish {analysis.bullish}</span>
            </div>
          </div>

          {/* Support & Resistance */}
          <div style={boxStyle}>
            <div className="label-sm" style={{ color: "var(--text-3)", marginBottom: "0.75rem" }}>Support &amp; Resistance</div>
            {(["r3", "r2", "r1"] as const).map((k) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", borderBottom: "1px solid var(--outline-variant)" }}>
                <span style={{ textTransform: "uppercase", color: "var(--text-2)" }}>{k}</span>
                <strong>{fmtNum(analysis.pivots[k])}</strong>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0" }}>
              <span className="badge badge-filled">Price {fmtNum(analysis.currentPrice)}</span>
              <span style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>Pivot {fmtNum(analysis.pivots.pivot)}</span>
            </div>
            {(["s1", "s2", "s3"] as const).map((k) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", borderTop: "1px solid var(--outline-variant)" }}>
                <span style={{ textTransform: "uppercase", color: "var(--text-2)" }}>{k}</span>
                <strong>{fmtNum(analysis.pivots[k])}</strong>
              </div>
            ))}
          </div>

          {/* Indicators — full width of its own row so verdict text always has room */}
          <div style={boxStyle}>
            <div className="label-sm" style={{ color: "var(--text-3)", marginBottom: "0.75rem" }}>Indicators</div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1.4fr) minmax(70px, 0.8fr) minmax(100px, 1fr)", gap: "0.5rem", fontSize: "0.72rem", color: "var(--text-3)", textTransform: "uppercase", paddingBottom: "0.5rem", borderBottom: "1px solid var(--outline-variant)" }}>
              <span>Indicator</span><span>Value</span><span style={{ textAlign: "right" }}>Verdict</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1.4fr) minmax(70px, 0.8fr) minmax(100px, 1fr)", gap: "0.5rem", padding: "0.6rem 0", borderBottom: "1px solid var(--outline-variant)" }}>
              <span>RSI (14)</span>
              <span>{analysis.rsiValue != null ? analysis.rsiValue.toFixed(2) : "N/A"}</span>
              <span style={{ textAlign: "right", color: verdictColor(analysis.rsiVerdict), fontWeight: 600, whiteSpace: "nowrap" }}>{analysis.rsiValue == null ? "N/A" : analysis.rsiVerdict}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1.4fr) minmax(70px, 0.8fr) minmax(100px, 1fr)", gap: "0.5rem", padding: "0.6rem 0", borderBottom: "1px solid var(--outline-variant)" }}>
              <span>MACD (12,26,9)</span>
              <span>{analysis.macdValue ? analysis.macdValue.macdLine.toFixed(2) : "N/A"}</span>
              <span style={{ textAlign: "right", color: verdictColor(analysis.macdSignalVerdict), fontWeight: 600, whiteSpace: "nowrap" }}>{!analysis.macdValue ? "N/A" : analysis.macdSignalVerdict}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1.4fr) minmax(70px, 0.8fr) minmax(100px, 1fr)", gap: "0.5rem", padding: "0.6rem 0" }}>
              <span>Beta</span>
              <span>{analysis.betaValue != null ? analysis.betaValue.toFixed(2) : "N/A"}</span>
              <span style={{ textAlign: "right", color: "var(--text-2)", whiteSpace: "nowrap" }}>
                {analysis.betaValue == null ? "N/A" : analysis.betaValue > 1.2 ? "Highly volatile" : analysis.betaValue < 0.8 ? "Defensive" : "In line with market"}
              </span>
            </div>
          </div>

          {/* Moving Averages */}
          <div style={boxStyle}>
            <div className="label-sm" style={{ color: "var(--text-3)", marginBottom: "0.75rem" }}>Moving Averages</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", fontSize: "0.72rem", color: "var(--text-3)", textTransform: "uppercase", paddingBottom: "0.5rem", borderBottom: "1px solid var(--outline-variant)" }}>
              <span>Period</span><span style={{ textAlign: "right" }}>SMA</span><span style={{ textAlign: "right" }}>EMA</span>
            </div>
            {analysis.mas.map(({ period, sma: s, ema: e }) => (
              <div key={period} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "0.55rem 0", borderBottom: "1px solid var(--outline-variant)" }}>
                <span style={{ color: "var(--text-2)" }}>{period}D</span>
                <span style={{ textAlign: "right", color: s != null ? verdictColor(analysis.currentPrice >= s ? "Bullish" : "Bearish") : "var(--text-3)", fontWeight: 600 }}>{fmtNum(s)}</span>
                <span style={{ textAlign: "right", color: e != null ? verdictColor(analysis.currentPrice >= e ? "Bullish" : "Bearish") : "var(--text-3)", fontWeight: 600 }}>{fmtNum(e)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
