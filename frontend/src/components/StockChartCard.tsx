import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import {
  ComposedChart,
  Area,
  Bar,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts";
import { useMarketStore } from "../store/marketStore";
import { formatCurrency, currencySymbol } from "../utils/currency";

type HistoricalRange = "1d" | "1w" | "1mo" | "3mo" | "6mo" | "1y" | "3y" | "5y" | "max";
type Scale = "linear" | "log";

type OhlcPoint = {
  time?: string;
  bucket?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type HistoryResponse = { ticker: string; range: string; source: string; points: OhlcPoint[] };

type ProfileResponse = {
  ticker: string;
  source: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number | null;
  peRatio: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  previousClose: number | null;
  description: string;
};

const HISTORICAL_OPTIONS: { id: HistoricalRange; label: string }[] = [
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

export function StockChartCard({ token, ticker }: { token: string; ticker: string }) {
  const fmtCur = (n: number) => formatCurrency(ticker, n, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const [historicalRange, setHistoricalRange] = useState<HistoricalRange>("1y");
  const [scale, setScale] = useState<Scale>("linear");

  const prices = useMarketStore((state) => state.prices);
  const livePrice = prices[ticker]?.price;

  const historyQuery = useQuery({
    queryKey: ["history", ticker, historicalRange],
    queryFn: () => apiFetch<HistoryResponse>(`/stocks/${ticker}/history?range=${historicalRange}`, {}, token),
    retry: false
  });

  const profileQuery = useQuery({
    queryKey: ["profile", ticker],
    queryFn: () => apiFetch<ProfileResponse>(`/stocks/${ticker}/profile`, {}, token),
    retry: false
  });

  // Separate from `profileQuery` on purpose: /profile only has data for
  // tickers Yahoo Finance covers, so it 404s for every simulator symbol
  // (FAKE, TSIM, NOVA, ...). /previous-close falls back to our own recorded
  // ticks for those, so the day-change badge below works for every ticker
  // on the platform, not just the handful of real Yahoo-backed ones.
  const previousCloseQuery = useQuery({
    queryKey: ["previous-close", ticker],
    queryFn: () => apiFetch<{ ticker: string; previousClose: number | null }>(`/stocks/${ticker}/previous-close`, {}, token),
    retry: false
  });

  const rawPoints: OhlcPoint[] = historyQuery.data?.points ?? [];
  const isLoading = historyQuery.isLoading;
  const isError = historyQuery.isError;

  const chartData = useMemo(() => {
    const showTime = historicalRange === "1d" || historicalRange === "1w";
    const points = rawPoints.map((p) => {
      const dateObj = new Date(p.time ?? p.bucket ?? Date.now());
      return {
        label: showTime
          ? dateObj.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
          : dateObj.toLocaleDateString(undefined, {
              year: historicalRange === "3y" || historicalRange === "5y" || historicalRange === "max" ? "2-digit" : undefined,
              month: "short",
              day: "numeric"
            }),
        open: p.open,
        close: p.close,
        volume: p.volume ?? 0,
        // Each bar/candle is colored by comparing its own close to its own opening rate.
        isUp: p.close >= p.open
      };
    });

    if (livePrice && points.length > 0) {
      points[points.length - 1].close = livePrice;
      points[points.length - 1].isUp = livePrice >= points[points.length - 1].open;
    }
    return points;
  }, [rawPoints, historicalRange, livePrice]);

  // Overall line/area color: green if the latest price is at or above the period's opening
  // rate, red if it has fallen below it — mirrors how the price bars are colored.
  const isPeriodUp = chartData.length > 0 ? chartData[chartData.length - 1].close >= chartData[0].open : true;
  const lineColor = isPeriodUp ? "var(--secondary-neon)" : "var(--error-neon)";

  const dayChange = useMemo(() => {
    const previousClose = previousCloseQuery.data?.previousClose;
    const current = livePrice ?? (chartData.length > 0 ? chartData[chartData.length - 1].close : null);
    if (!previousClose || current == null) return null;
    const abs = current - previousClose;
    return { abs, pct: (abs / previousClose) * 100 };
  }, [previousCloseQuery.data?.previousClose, livePrice, chartData]);

  const maxVolume = useMemo(() => Math.max(1, ...chartData.map((d) => d.volume)), [chartData]);
  // Scale the volume axis domain so bars only occupy roughly the bottom quarter of the chart.
  const volumeDomainMax = maxVolume * 4;

  const priceDomain: [number, number] | ["auto", "auto"] =
    scale === "log" && chartData.length > 0
      ? [Math.max(0.01, Math.min(...chartData.map((d) => d.close)) * 0.98), Math.max(...chartData.map((d) => d.close)) * 1.02]
      : ["auto", "auto"];

  return (
    <div className="card">
      <div
        className="card-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}
      >
        <div>
          <h2 className="title-md">{profileQuery.data?.name || ticker} <span style={{ color: "var(--text-3)", fontSize: "0.75rem", fontWeight: 400 }}>{ticker}</span></h2>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", marginTop: "0.25rem" }}>
            <span className="headline-sm" style={{ color: lineColor }}>
              {livePrice ? fmtCur(livePrice) : chartData.length > 0 ? fmtCur(chartData[chartData.length - 1].close) : "Loading..."}
            </span>
            {dayChange && (
              <span className="body-sm" style={{ color: lineColor, fontFamily: "var(--font-data)" }}>
                {dayChange.abs >= 0 ? "+" : ""}{dayChange.abs.toFixed(2)} ({dayChange.abs >= 0 ? "+" : ""}{dayChange.pct.toFixed(2)}%)
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-end" }}>
          {/* Timeframe selector */}
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
            {HISTORICAL_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setHistoricalRange(opt.id)}
                className="btn-sm"
                style={{
                  background: historicalRange === opt.id ? "var(--primary-container)" : "var(--surface-variant)",
                  color: historicalRange === opt.id ? "var(--on-primary)" : "var(--on-surface-variant)",
                  border: "none",
                  fontFamily: "var(--font-data)"
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Linear / Log scale toggle */}
          <div style={{ display: "flex", gap: "0.35rem" }}>
            {(["linear", "log"] as Scale[]).map((s) => (
              <button
                key={s}
                onClick={() => setScale(s)}
                className="btn-sm"
                title={s === "linear" ? "Absolute price changes" : "Percentage-based movement, best for long ranges"}
                style={{
                  background: scale === s ? "var(--primary-container)" : "transparent",
                  color: scale === s ? "var(--on-primary)" : "var(--on-surface-variant)",
                  fontFamily: "var(--font-data)"
                }}
              >
                {s === "linear" ? "Linear" : "Log"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ height: "440px", marginTop: "1.5rem" }}>
        {isLoading ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>
            Loading chart...
          </div>
        ) : isError ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--error-color)" }}>
            Failed to load chart data
          </div>
        ) : chartData.length === 0 ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={lineColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--outline-variant)" opacity={0.5} />

              <XAxis
                dataKey="label"
                tick={{ fill: "var(--text-3)", fontSize: 11, fontFamily: "var(--font-data)" }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />

              {/* Price axis — occupies the top ~75% of the chart visually */}
              <YAxis
                yAxisId="price"
                scale={scale === "log" ? "log" : "linear"}
                domain={priceDomain as any}
                allowDataOverflow
                tick={{ fill: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-data)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `${currencySymbol(ticker)}${Number(val).toFixed(0)}`}
                width={64}
              />

              {/* Volume axis — hidden, domain inflated so bars hug the bottom ~25% of the chart */}
              <YAxis yAxisId="volume" domain={[0, volumeDomainMax]} hide />

              <Tooltip
                contentStyle={{ backgroundColor: "var(--surface)", border: "1px solid var(--outline)", borderRadius: "0.5rem", color: "var(--on-surface)" }}
                itemStyle={{ color: "var(--secondary-neon)", fontWeight: "bold" }}
                formatter={(value: number, name: string) =>
                  name === "volume" ? [value.toLocaleString("en-IN"), "Volume"] : [fmtCur(value), "Price"]
                }
              />

              <Bar yAxisId="volume" dataKey="volume" barSize={6}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.isUp ? "var(--secondary-neon)" : "var(--error-neon)"} fillOpacity={0.55} />
                ))}
              </Bar>

              <Area
                yAxisId="price"
                type="monotone"
                dataKey="close"
                stroke={lineColor}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorPrice)"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="body-sm" style={{ color: "var(--text-3)", marginTop: "0.5rem" }}>
        Price and volume are colored green when at/above the opening rate for the period, red when below it.
      </p>
    </div>
  );
}
