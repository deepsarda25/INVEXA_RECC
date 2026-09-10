import { producer } from "../lib/kafka";
import { sql } from "../lib/db";
import { env } from "../config/env";

let intervalId: NodeJS.Timeout | null = null;

export async function startVolumeAggregator() {
  if (intervalId) return;

  // Run every 5 seconds
  intervalId = setInterval(async () => {
    try {
      // 1. Query global pressure
      const globalRows = await sql<{ side: string; vol: number }[]>`
        SELECT side, COALESCE(SUM(quantity), 0) as vol
        FROM orders
        WHERE status = 'filled' AND competition_id IS NULL AND executed_at >= NOW() - INTERVAL '15 seconds'
        GROUP BY side
      `;

      let buyVol = 0;
      let sellVol = 0;

      for (const row of globalRows) {
        if (row.side === "buy") buyVol += Number(row.vol);
        if (row.side === "sell") sellVol += Number(row.vol);
      }

      const totalVol = buyVol + sellVol;
      let globalPressure = 0;
      if (totalVol > 0) {
        globalPressure = (buyVol - sellVol) / totalVol;
      }
      
      const messages = [
        {
          key: "volume-aggregator",
          value: JSON.stringify({
            action: "set_pressure",
            pressure: globalPressure
          })
        }
      ];

      // 2. Query competition-specific pressure
      const compRows = await sql<{ competitionId: string; side: string; vol: number }[]>`
        SELECT competition_id as "competitionId", side, COALESCE(SUM(quantity), 0) as vol
        FROM orders
        WHERE status = 'filled' AND competition_id IS NOT NULL AND executed_at >= NOW() - INTERVAL '15 seconds'
        GROUP BY competition_id, side
      `;

      const compVols: Record<string, { buy: number; sell: number }> = {};
      for (const row of compRows) {
        if (!compVols[row.competitionId]) compVols[row.competitionId] = { buy: 0, sell: 0 };
        if (row.side === "buy") compVols[row.competitionId].buy += Number(row.vol);
        if (row.side === "sell") compVols[row.competitionId].sell += Number(row.vol);
      }

      for (const [compId, vols] of Object.entries(compVols)) {
        const tVol = vols.buy + vols.sell;
        let p = 0;
        if (tVol > 0) {
          p = (vols.buy - vols.sell) / tVol;
        }
        messages.push({
          key: `volume-aggregator-${compId}`,
          value: JSON.stringify({
            action: "set_pressure",
            pressure: p,
            competitionId: compId
          })
        });
      }

      await producer.send({
        topic: env.SIM_CONTROL_TOPIC,
        messages
      });

    } catch (err) {
      console.error("[VolumeAggregator] Error calculating pressure:", err);
    }
  }, 5000);
}

export function stopVolumeAggregator() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
