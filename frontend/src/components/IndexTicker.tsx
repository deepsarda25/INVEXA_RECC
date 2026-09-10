import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import { currencySymbol, currencyLocale } from "../utils/currency";

type IndexQuote = {
  key: string;
  label: string;
  symbol: string;
  shortName: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
};

type IndexesResponse = {
  indexes: IndexQuote[];
  source: "live" | "cache";
};

function fmt(n: number, locale: "en-IN" | "en-US", decimals = 2) {
  return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function IndexTicker({ onSelect }: { onSelect?: (ticker: string) => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["indexes"],
    queryFn: () => apiFetch<IndexesResponse>("/indexes"),
    refetchInterval: 10_000,
    staleTime: 5_000
  });

  if (isLoading) {
    return (
      <div className="index-ticker-viewport">
        <div className="index-ticker-track" style={{ animation: "none" }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="index-ticker-item" style={{ opacity: 0.4 }}>
              <span className="label-sm">Loading…</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data?.indexes?.length) {
    return (
      <div className="index-ticker-viewport">
        <div className="index-ticker-track" style={{ animation: "none" }}>
          <div className="index-ticker-item">
            <span className="label-sm">Market data unavailable — reconnecting…</span>
          </div>
        </div>
      </div>
    );
  }

  const renderItem = (idx: IndexQuote, keySuffix: string) => {
    const positive = idx.regularMarketChange >= 0;
    const bareTicker = idx.symbol.replace("^", "");
    const symbol = currencySymbol(bareTicker);
    const locale = currencyLocale(bareTicker);
    return (
      <button
        key={`${idx.key}-${keySuffix}`}
        className="index-ticker-item index-ticker-item-clickable"
        onClick={() => onSelect?.(bareTicker)}
        title={`Open ${idx.label} in Terminal`}
      >
        <span className="label-sm" style={{ fontWeight: 700, color: "var(--on-surface)" }}>{idx.label}</span>
        <span style={{ fontFamily: "var(--font-data)" }}>{symbol}{fmt(idx.regularMarketPrice, locale)}</span>
        <span className={positive ? "val-up" : "val-down"} style={{ fontFamily: "var(--font-data)" }}>
          {positive ? "+" : ""}{symbol}{fmt(idx.regularMarketChange, locale)} ({positive ? "+" : ""}{fmt(idx.regularMarketChangePercent, locale)}%)
        </span>
      </button>
    );
  };

  return (
    <div className="index-ticker-viewport">
      <div className="index-ticker-track">
        {data.indexes.map((idx) => renderItem(idx, "a"))}
        {/* Duplicate set so the marquee loops seamlessly */}
        {data.indexes.map((idx) => renderItem(idx, "b"))}
      </div>
    </div>
  );
}
