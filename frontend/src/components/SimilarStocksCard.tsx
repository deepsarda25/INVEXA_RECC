import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import { formatCurrency, formatCompactCurrency } from "../utils/currency";

type SimilarStock = {
  ticker: string;
  name: string;
  price: number | null;
  changePct: number | null;
  marketCap: number | null;
};

type Props = {
  ticker: string;
  onSelect: (ticker: string) => void;
};

export function SimilarStocksCard({ ticker, onSelect }: Props) {
  const query = useQuery({
    queryKey: ["similar", ticker],
    queryFn: () => apiFetch<{ results: SimilarStock[] }>(`/stocks/${ticker}/similar`),
    staleTime: 6 * 60 * 60 * 1000,
    retry: false
  });

  const results = query.data?.results ?? [];

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="title-sm">Similar Stocks</h2>
      </div>

      {query.isLoading ? (
        <div style={{ color: "var(--text-3)", padding: "1rem 0" }}>Finding related stocks…</div>
      ) : results.length === 0 ? (
        <p className="muted" style={{ padding: "0.5rem 0" }}>No similar stocks found for this ticker.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Stock</th>
              <th>Mkt Price</th>
              <th>1D Change</th>
              <th>Market Cap</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {results.map((s) => (
              <tr key={s.ticker}>
                <td>
                  <strong>{s.name}</strong>
                  <div style={{ color: "var(--text-3)", fontSize: "0.75rem", fontFamily: "var(--font-data)" }}>{s.ticker}</div>
                </td>
                <td>{s.price != null ? formatCurrency(s.ticker, s.price) : "—"}</td>
                <td className={(s.changePct ?? 0) >= 0 ? "good" : "bad"}>
                  {s.changePct != null ? `${s.changePct >= 0 ? "+" : ""}${s.changePct.toFixed(2)}%` : "—"}
                </td>
                <td>{formatCompactCurrency(s.ticker, s.marketCap)}</td>
                <td>
                  <button className="btn-sm" onClick={() => onSelect(s.ticker)}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
