import { FormEvent, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import { useMarketStore } from "../store/marketStore";
import { Sparkline } from "./Sparkline";
import {
  TickerFormatter,
  USFormattingStrategy,
  NSEFormattingStrategy,
  BSEFormattingStrategy
} from "../utils/tickerStrategy";
import { formatCurrency } from "../utils/currency";

type WatchlistList = { id: string; name: string; createdAt: string; count: number };
type WatchlistItem = {
  id: string;
  ticker: string;
  targetPrice: number | null;
  notes: string | null;
  addedAt: string;
  livePrice: number | null;
  targetHit: boolean | null;
  previousClose: number | null;
  changeAbs: number | null;
  changePct: number | null;
  volume: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
};

type Props = {
  token: string;
  onTrade: (ticker: string) => void;
};

function RangeSlider({ low, high, current }: { low: number | null; high: number | null; current: number | null }) {
  const pct = low != null && high != null && current != null && high > low ? Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100)) : 50;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", minWidth: "110px" }}>
      <span style={{ fontSize: "0.7rem", color: "var(--text-3)" }}>L</span>
      <div style={{ position: "relative", flex: 1, height: "3px", background: "var(--outline-variant)", borderRadius: "2px" }}>
        <div style={{ position: "absolute", left: `calc(${pct}% - 3px)`, top: "-2.5px", width: "7px", height: "7px", borderRadius: "50%", background: "var(--on-surface)" }} />
      </div>
      <span style={{ fontSize: "0.7rem", color: "var(--text-3)" }}>H</span>
    </div>
  );
}

export function WatchlistCard({ token, onTrade }: Props) {
  const queryClient = useQueryClient();
  const livePrices = useMarketStore((s) => s.prices);

  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [filterText, setFilterText] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const [exchange, setExchange] = useState<"US" | "NSE" | "BSE">("NSE");
  const [ticker, setTicker] = useState("");
  const [targetPrice, setTargetPrice] = useState<number | "">("");
  const [message, setMessage] = useState<{ text: string; kind: "success" | "error" } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const formatter = useMemo(() => {
    let strategy = new USFormattingStrategy();
    if (exchange === "NSE") strategy = new NSEFormattingStrategy();
    else if (exchange === "BSE") strategy = new BSEFormattingStrategy();
    return new TickerFormatter(strategy);
  }, [exchange]);

  const listsQuery = useQuery({
    queryKey: ["watchlist-lists", token],
    queryFn: () => apiFetch<{ lists: WatchlistList[] }>("/watchlist/lists", {}, token),
    enabled: Boolean(token)
  });

  const lists = listsQuery.data?.lists ?? [];
  const currentListId = activeListId ?? lists[0]?.id ?? null;

  const itemsQuery = useQuery({
    queryKey: ["watchlist", currentListId],
    queryFn: () => apiFetch<{ watchlist: WatchlistItem[] }>(`/watchlist/lists/${currentListId}`, {}, token),
    enabled: Boolean(currentListId),
    refetchInterval: 10000
  });

  const items = (itemsQuery.data?.watchlist ?? []).filter((i) =>
    i.ticker.toLowerCase().includes(filterText.toLowerCase())
  );

  const createList = async () => {
    if (!newListName.trim()) return;
    try {
      const res = await apiFetch<{ list: WatchlistList }>("/watchlist/lists", {
        method: "POST",
        body: JSON.stringify({ name: newListName.trim() })
      }, token);
      await queryClient.invalidateQueries({ queryKey: ["watchlist-lists", token] });
      setActiveListId(res.list.id);
      setNewListName("");
      setCreatingList(false);
    } catch (error) {
      setMessage({ text: (error as Error).message, kind: "error" });
    }
  };

  const deleteList = async (listId: string) => {
    if (!confirm("Delete this watchlist? This can't be undone.")) return;
    await apiFetch(`/watchlist/lists/${listId}`, { method: "DELETE" }, token);
    await queryClient.invalidateQueries({ queryKey: ["watchlist-lists", token] });
    setActiveListId(null);
  };

  const addTicker = async (event: FormEvent) => {
    event.preventDefault();
    const formatted = formatter.format(ticker || "");
    if (!formatted || !currentListId) return;

    setSubmitting(true);
    setMessage(null);
    try {
      await apiFetch(
        `/watchlist/lists/${currentListId}`,
        {
          method: "POST",
          body: JSON.stringify({
            ticker: formatted,
            ...(targetPrice ? { targetPrice: Number(targetPrice) } : {})
          })
        },
        token
      );
      setMessage({ text: `✓ ${formatted} added`, kind: "success" });
      setTicker("");
      setTargetPrice("");
      await queryClient.invalidateQueries({ queryKey: ["watchlist", currentListId] });
      await queryClient.invalidateQueries({ queryKey: ["watchlist-lists", token] });
    } catch (error) {
      setMessage({ text: (error as Error).message, kind: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const removeTicker = async (tickerToRemove: string) => {
    if (!currentListId) return;
    try {
      await apiFetch(`/watchlist/lists/${currentListId}/${encodeURIComponent(tickerToRemove)}`, { method: "DELETE" }, token);
      await queryClient.invalidateQueries({ queryKey: ["watchlist", currentListId] });
      await queryClient.invalidateQueries({ queryKey: ["watchlist-lists", token] });
    } catch (error) {
      setMessage({ text: (error as Error).message, kind: "error" });
    }
  };

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* List tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", padding: "1rem 1.5rem 0", borderBottom: "1px solid var(--outline-variant)", overflowX: "auto" }}>
        {lists.map((list) => (
          <button
            key={list.id}
            onClick={() => setActiveListId(list.id)}
            style={{
              background: "none",
              border: "none",
              padding: "0.5rem 0.9rem",
              cursor: "pointer",
              fontWeight: currentListId === list.id ? 700 : 500,
              color: currentListId === list.id ? "var(--on-surface)" : "var(--text-3)",
              borderBottom: currentListId === list.id ? "2px solid var(--secondary-neon)" : "2px solid transparent",
              whiteSpace: "nowrap"
            }}
          >
            {list.name}
          </button>
        ))}
        {creatingList ? (
          <form onSubmit={(e) => { e.preventDefault(); void createList(); }} style={{ display: "flex", gap: "0.4rem", padding: "0.4rem 0" }}>
            <input
              className="form-input"
              autoFocus
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="List name"
              style={{ padding: "0.35rem 0.6rem", fontSize: "0.85rem", width: "140px" }}
            />
            <button type="submit" className="btn-sm">Create</button>
            <button type="button" className="btn-cancel" onClick={() => setCreatingList(false)}>✕</button>
          </form>
        ) : (
          <button
            onClick={() => setCreatingList(true)}
            style={{ background: "none", border: "none", color: "var(--secondary-neon)", cursor: "pointer", padding: "0.5rem 0.9rem", fontWeight: 600, whiteSpace: "nowrap" }}
          >
            + Watchlist
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", padding: "1rem 1.5rem", flexWrap: "wrap" }}>
        <input
          className="form-input"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Search your watchlist"
          style={{ maxWidth: "280px" }}
        />
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn-sm" onClick={() => setShowAddForm((v) => !v)}>+ Add stocks</button>
          <button className="btn-sm" onClick={() => setEditMode((v) => !v)}>{editMode ? "Done" : "Edit"}</button>
          {currentListId && (
            <button className="btn-cancel" onClick={() => void deleteList(currentListId)}>Delete List</button>
          )}
        </div>
      </div>

      {/* Add form */}
      {showAddForm && (
        <form onSubmit={addTicker} style={{ display: "flex", gap: "0.75rem", padding: "0 1.5rem 1.25rem", flexWrap: "wrap", alignItems: "center" }}>
          <select className="form-select" value={exchange} onChange={(e) => setExchange(e.target.value as any)}>
            <option value="NSE">NSE (India)</option>
            <option value="BSE">BSE (India)</option>
            <option value="US">US Market</option>
          </select>
          <input
            className="form-input"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder={exchange === "US" ? "e.g. AAPL" : "e.g. RELIANCE"}
            style={{ width: "160px" }}
          />
          <input
            className="form-input"
            type="number"
            step="0.01"
            min={0.01}
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="Target price (optional)"
            style={{ width: "200px" }}
          />
          <button type="submit" className="btn-primary" disabled={submitting || !ticker}>
            {submitting ? "Adding…" : "Add"}
          </button>
        </form>
      )}

      {message && <p className={`order-msg ${message.kind}`} style={{ margin: "0 1.5rem 1rem" }}>{message.text}</p>}

      {/* Table */}
      {itemsQuery.isLoading ? (
        <div style={{ padding: "1.5rem", color: "var(--text-3)" }}>Loading watchlist…</div>
      ) : items.length === 0 ? (
        <p className="muted" style={{ padding: "1.5rem" }}>
          {filterText ? "No matches." : "Nothing here yet — add a ticker to start tracking it."}
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Trend</th>
              <th>Mkt Price</th>
              <th>1D Change</th>
              <th>1D Vol</th>
              <th>52W Perf</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const socketPrice = livePrices[item.ticker]?.price;
              const price = typeof socketPrice === "number" ? socketPrice : item.livePrice;
              const changeAbs = price != null && item.previousClose ? price - item.previousClose : item.changeAbs;
              const changePct = changeAbs != null && item.previousClose ? (changeAbs / item.previousClose) * 100 : item.changePct;
              const isUp = (changeAbs ?? 0) >= 0;

              return (
                <tr key={item.id}>
                  <td><strong>{item.ticker}</strong></td>
                  <td><Sparkline ticker={item.ticker} /></td>
                  <td>{typeof price === "number" ? formatCurrency(item.ticker, price) : "—"}</td>
                  <td className={isUp ? "good" : "bad"}>
                    {changeAbs != null ? `${isUp ? "+" : ""}${formatCurrency(item.ticker, changeAbs)} (${isUp ? "+" : ""}${changePct?.toFixed(2)}%)` : "—"}
                  </td>
                  <td>{item.volume != null ? item.volume.toLocaleString("en-IN") : "—"}</td>
                  <td><RangeSlider low={item.fiftyTwoWeekLow} high={item.fiftyTwoWeekHigh} current={price} /></td>
                  <td style={{ display: "flex", gap: "0.5rem" }}>
                    <button className="btn-sm" onClick={() => onTrade(item.ticker)}>Trade</button>
                    {editMode && (
                      <button className="btn-cancel" onClick={() => void removeTicker(item.ticker)}>Remove</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
