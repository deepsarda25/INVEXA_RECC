import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { apiFetch } from "../api/client";

type Holding = {
  ticker: string;
  quantity: number;
  avgCost: number;
  livePrice: number;
  marketValue: number;
  unrealizedPnl: number;
};

type ProfileLite = { sector?: string; marketCap?: number | null };

const SLICE_COLORS = ["#6c8cff", "var(--secondary-neon)", "#ffb454", "#c792ea", "#ff8fa3", "#7fd3c7", "#e0af68"];

function fmtCur(n: number) {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function classifyCap(marketCap: number | null | undefined): "Large Cap" | "Mid Cap" | "Small Cap" | "Unclassified" {
  if (marketCap == null) return "Unclassified";
  if (marketCap >= 2e11) return "Large Cap";
  if (marketCap >= 5e10) return "Mid Cap";
  return "Small Cap";
}

function Donut({ data, centerLabel }: { data: Array<{ name: string; value: number }>; centerLabel: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return <div style={{ height: "220px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>No data</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
          {data.map((_, idx) => (
            <Cell key={idx} fill={SLICE_COLORS[idx % SLICE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ backgroundColor: "var(--surface)", border: "1px solid var(--outline)", borderRadius: "0.5rem", color: "var(--on-surface)" }}
          formatter={(value: number, name: string) => [`${fmtCur(value)} (${((value / total) * 100).toFixed(1)}%)`, name]}
        />
        <Legend verticalAlign="middle" align="right" layout="vertical" iconSize={10} wrapperStyle={{ fontSize: "0.78rem", color: "var(--text-2)", fontFamily: "var(--font-data)" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function HoldingsAnalysis({ holdings }: { holdings: Holding[] }) {
  const profilesQuery = useQuery({
    queryKey: ["holdings-profiles", holdings.map((h) => h.ticker).join(",")],
    queryFn: async () => {
      const entries = await Promise.all(
        holdings.map(async (h) => {
          try {
            const profile = await apiFetch<ProfileLite>(`/stocks/${h.ticker}/profile`);
            return [h.ticker, profile] as const;
          } catch {
            return [h.ticker, {} as ProfileLite] as const;
          }
        })
      );
      return Object.fromEntries(entries) as Record<string, ProfileLite>;
    },
    enabled: holdings.length > 0
  });

  const { sectorData, capData, investedValue, currentValue } = useMemo(() => {
    const profiles = profilesQuery.data ?? {};
    const sectorMap = new Map<string, number>();
    const capMap = new Map<string, number>();
    let invested = 0;
    let current = 0;

    for (const h of holdings) {
      invested += h.avgCost * h.quantity;
      current += h.marketValue;

      const profile = profiles[h.ticker];
      const sector = profile?.sector && profile.sector !== "N/A" ? profile.sector : "Unclassified";
      sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + h.marketValue);

      const cap = classifyCap(profile?.marketCap);
      capMap.set(cap, (capMap.get(cap) ?? 0) + h.marketValue);
    }

    return {
      sectorData: Array.from(sectorMap.entries()).map(([name, value]) => ({ name, value })),
      capData: Array.from(capMap.entries()).map(([name, value]) => ({ name, value })),
      investedValue: invested,
      currentValue: current
    };
  }, [holdings, profilesQuery.data]);

  const totalReturn = currentValue - investedValue;
  const totalReturnPct = investedValue > 0 ? (totalReturn / investedValue) * 100 : 0;

  if (holdings.length === 0) {
    return <p className="muted" style={{ padding: "1rem 0" }}>Nothing to analyse yet — buy a stock to see your portfolio breakdown here.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div className="stats-row">
        <div className="stat-cell">
          <span>Invested Value</span>
          <strong>{fmtCur(investedValue)}</strong>
        </div>
        <div className="stat-cell">
          <span>Current Value</span>
          <strong>{fmtCur(currentValue)}</strong>
        </div>
        <div className="stat-cell">
          <span>Total Returns</span>
          <strong className={totalReturn >= 0 ? "good" : "bad"}>
            {totalReturn >= 0 ? "+" : ""}{fmtCur(totalReturn)} ({totalReturn >= 0 ? "+" : ""}{totalReturnPct.toFixed(2)}%)
          </strong>
        </div>
      </div>

      {profilesQuery.isLoading ? (
        <div style={{ color: "var(--text-3)", padding: "1rem 0" }}>Analysing your portfolio…</div>
      ) : (
        <div className="grid-2">
          <div>
            <div className="label-sm" style={{ color: "var(--text-3)", marginBottom: "0.5rem" }}>Market Cap Allocation</div>
            <Donut data={capData} centerLabel="Market cap" />
          </div>
          <div>
            <div className="label-sm" style={{ color: "var(--text-3)", marginBottom: "0.5rem" }}>Sector Allocation</div>
            <Donut data={sectorData} centerLabel="Sector" />
          </div>
        </div>
      )}
    </div>
  );
}
