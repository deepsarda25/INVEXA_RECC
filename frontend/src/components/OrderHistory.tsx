import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import { formatCurrency } from "../utils/currency";

type OrderRow = {
  id: string;
  ticker: string;
  type: "market" | "limit" | "stop_loss";
  side: "buy" | "sell";
  quantity: number;
  limitPrice: string | null;
  status: "pending" | "filled" | "cancelled";
  filledPrice: string | null;
  createdAt: string;
  executedAt: string | null;
};

type Props = {
  token: string;
};

type StatusFilter = "all" | "pending" | "filled" | "cancelled";

export function OrderHistory({ token }: Props) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [cancelling, setCancelling] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["orders", token],
    queryFn: () => apiFetch<{ orders: OrderRow[] }>("/orders", {}, token),
    refetchInterval: 10_000,
    staleTime: 5_000
  });

  const cancelOrder = async (orderId: string) => {
    setCancelling(orderId);
    try {
      await apiFetch(`/orders/${orderId}`, { method: "DELETE" }, token);
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setCancelling(null);
    }
  };

  const orders = data?.orders ?? [];
  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  const counts = {
    all: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    filled: orders.filter((o) => o.status === "filled").length,
    cancelled: orders.filter((o) => o.status === "cancelled").length
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2>Order History</h2>
        <button
          className="btn-sm"
          onClick={() => void refetch()}
          disabled={isLoading}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="filter-row">
        {(["all", "pending", "filled", "cancelled"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
          </button>
        ))}
      </div>

      {isLoading && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className="spinner" />
          <span className="muted">Loading orders…</span>
        </div>
      )}

      {isError && <p className="muted">Failed to load orders.</p>}

      {!isLoading && !filtered.length && (
        <p className="muted">No {filter !== "all" ? filter : ""} orders found.</p>
      )}

      {!!filtered.length && (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Side</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Limit/Trig</th>
                <th>Fill Price</th>
                <th>Status</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td><strong>{o.ticker}</strong></td>
                  <td className={o.side === "buy" ? "good" : "bad"} style={{ fontWeight: 600 }}>
                    {o.side.toUpperCase()}
                  </td>
                  <td style={{ color: "var(--text-2)", textTransform: "capitalize" }}>
                    {o.type.replace("_", " ")}
                  </td>
                  <td>{o.quantity}</td>
                  <td style={{ color: "var(--text-2)" }}>
                    {o.limitPrice ? formatCurrency(o.ticker, Number(o.limitPrice)) : "—"}
                  </td>
                  <td>
                    {o.filledPrice ? formatCurrency(o.ticker, Number(o.filledPrice)) : "—"}
                  </td>
                  <td>
                    <span className={`badge badge-${o.status}`}>{o.status}</span>
                  </td>
                  <td style={{ color: "var(--text-3)", fontSize: "0.78rem" }}>
                    {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  </td>
                  <td>
                    {o.status === "pending" && (
                      <button
                        className="btn-cancel"
                        disabled={cancelling === o.id}
                        onClick={() => void cancelOrder(o.id)}
                      >
                        {cancelling === o.id ? "…" : "Cancel"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
