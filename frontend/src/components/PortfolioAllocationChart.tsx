import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

type Holding = { ticker: string; marketValue: number };

type Props = {
  cash: number;
  holdings: Holding[];
};

const CASH_COLOR = "var(--outline-variant)";
const CASH_LEGEND_SWATCH = "#8c90a3";

/**
 * Generates a color for the Nth stock slice such that, for whatever number
 * of holdings the portfolio actually has, every slice gets an evenly-spaced
 * hue around the color wheel. This guarantees no two stocks ever share a
 * color — a fixed short palette (the old approach) starts repeating colors
 * once a portfolio holds more entries than the palette has, which is
 * exactly what happened once someone held 14-15+ stocks.
 */
function colorForSlice(index: number, total: number): string {
  const hue = total > 0 ? (index * (360 / total)) % 360 : 0;
  return `hsl(${hue}, 68%, 58%)`;
}

function fmtCur(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function PortfolioAllocationChart({ cash, holdings }: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const stockSlices = holdings.filter((h) => h.marketValue > 0);
  const data = [
    { name: "Cash", value: Math.max(0, cash) },
    ...stockSlices.map((h) => ({ name: h.ticker, value: h.marketValue }))
  ].filter((d) => d.value > 0);

  const total = data.reduce((sum, d) => sum + d.value, 0);

  // Colors are computed from the full data set once, so the legend and the
  // pie slices always agree on which color belongs to which ticker even as
  // the hovered slice changes.
  const colors = useMemo(
    () => data.map((d, idx) => (d.name === "Cash" ? CASH_COLOR : colorForSlice(idx - 1, data.length - 1))),
    [data]
  );

  if (total === 0) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>
        No portfolio data yet
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: "1rem", height: "100%", minHeight: 0 }}>
      <div style={{ flex: "0 0 45%", minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={2}
              strokeWidth={0}
              onMouseEnter={(_, idx) => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {data.map((_, idx) => (
                <Cell key={idx} fill={colors[idx]} opacity={hoveredIndex === null || hoveredIndex === idx ? 1 : 0.35} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: "var(--surface)", border: "1px solid var(--outline)", borderRadius: "0.5rem", color: "var(--on-surface)" }}
              formatter={(value: number, name: string) => [`${fmtCur(value)} (${((value / total) * 100).toFixed(1)}%)`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Custom legend: scrolls instead of overflowing the card, and every
          ticker name is truncated with an ellipsis (full name on hover via
          `title`) so a long/unusual symbol can never push past the box —
          the bug that showed up once a portfolio held 14-15+ stocks. */}
      <ul
        style={{
          flex: "1 1 55%",
          minWidth: 0,
          listStyle: "none",
          margin: 0,
          padding: "0.25rem 0.25rem 0.25rem 0",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.4rem"
        }}
      >
        {data.map((d, idx) => (
          <li
            key={d.name}
            onMouseEnter={() => setHoveredIndex(idx)}
            onMouseLeave={() => setHoveredIndex(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              minWidth: 0,
              fontSize: "0.78rem",
              fontFamily: "var(--font-data)",
              color: "var(--text-2)",
              opacity: hoveredIndex === null || hoveredIndex === idx ? 1 : 0.45
            }}
          >
            <span
              style={{
                flex: "0 0 auto",
                width: "0.6rem",
                height: "0.6rem",
                borderRadius: "50%",
                background: d.name === "Cash" ? CASH_LEGEND_SWATCH : colors[idx]
              }}
            />
            <span
              title={d.name}
              style={{
                flex: "1 1 auto",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {d.name}
            </span>
            <span style={{ flex: "0 0 auto", color: "var(--text-3)" }}>
              {((d.value / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
