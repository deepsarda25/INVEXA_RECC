import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";

type OhlcPoint = { time?: string; bucket?: string; close: number };
type HistoryResponse = { points: OhlcPoint[] };

export function Sparkline({ ticker, width = 90, height = 32 }: { ticker: string; width?: number; height?: number }) {
  const query = useQuery({
    queryKey: ["sparkline", ticker],
    queryFn: () => apiFetch<HistoryResponse>(`/stocks/${ticker}/history?range=1d`),
    staleTime: 60_000,
    retry: false
  });

  const points = query.data?.points ?? [];
  if (points.length < 2) {
    return <div style={{ width, height, color: "var(--text-3)", fontSize: "0.7rem" }}>—</div>;
  }

  const closes = points.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const isUp = closes[closes.length - 1] >= closes[0];
  const color = isUp ? "var(--secondary-neon)" : "var(--error-neon)";

  const coords = closes.map((c, i) => {
    const x = (i / (closes.length - 1)) * width;
    const y = height - ((c - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={coords.join(" ")} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}
