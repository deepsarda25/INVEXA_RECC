import { env } from "../config/env";
import { producer } from "../lib/kafka";
import type { PriceTickEvent } from "../types/events";
import { marketAdapter } from "../domain/market/adapter";
import { redis } from "../lib/redis";
import { sql } from "../lib/db";

let workerInterval: NodeJS.Timeout | null = null;

/**
 * Fetches real market prices for simulated competitions
 * Publishes them with competition-specific namespacing (C_comp-id_TICKER)
 * Allows player influence to affect ONLY that competition's prices
 * Global tickers continue independently
 */
export async function processCompetitionMarketPrices() {
  try {
    // Get all simulated competitions that are currently within their time window.
    // We intentionally do NOT filter by status='active' because the status column
    // may still be 'draft' if the background status job hasn't run yet. Using the
    // start_at / end_at window ensures prices are published from the moment the
    // competition is supposed to be live.
    const competitions = await sql<any[]>`
      SELECT 
        id,
        stock_data_config,
        allow_user_influence
      FROM competitions
      WHERE stock_data_source = 'simulated'
        AND start_at <= NOW()
        AND end_at >= NOW()
    `;

    if (competitions.length === 0) return;

    const messages: any[] = [];
    const now = Date.now();

    for (const comp of competitions) {
      try {
        // Parse tickers from config
        let tickers: string[] = [];
        try {
          const config = typeof comp.stock_data_config === 'string' 
            ? JSON.parse(comp.stock_data_config) 
            : comp.stock_data_config;
          tickers = config?.tickers || ["FAKE", "NOVA", "TSIM", "ALFA", "ZENX"];
        } catch {
          tickers = ["FAKE", "NOVA", "TSIM", "ALFA", "ZENX"];
        }

        // Fetch real market prices for these tickers
        const results = await marketAdapter.getBulkLivePrices(tickers);

        // Publish with competition namespacing
        for (const res of results) {
          const namespacedTicker = `C_${comp.id}_${res.ticker}`;
          
          const event: PriceTickEvent = {
            ticker: namespacedTicker,
            price: res.price,
            ts: now,
            volume: res.volume
          };

          messages.push({
            key: namespacedTicker,
            value: JSON.stringify(event)
          });
        }
      } catch (err) {
        console.error(`[CompetitionMarketWorker] Error processing competition ${comp.id}:`, err);
      }
    }

    if (messages.length > 0) {
      try {
        await producer.send({
          topic: env.PRICE_TICKS_TOPIC,
          messages
        });
        console.log(`[CompetitionMarketWorker] Published ${messages.length} competition prices to ${env.PRICE_TICKS_TOPIC}`);
      } catch (err) {
        console.error("[CompetitionMarketWorker] Failed to publish prices:", err);
      }
    }
  } catch (err) {
    console.error("[CompetitionMarketWorker] Error in processCompetitionMarketPrices:", err);
  }
}

export function startCompetitionMarketWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
  }

  console.log(`[CompetitionMarketWorker] Starting. Fetching competition prices every ${env.REAL_TICKER_INTERVAL}ms`);
  
  // Run immediately then loop
  processCompetitionMarketPrices().catch(console.error);
  workerInterval = setInterval(() => {
    processCompetitionMarketPrices().catch(console.error);
  }, env.REAL_TICKER_INTERVAL);
}

export function stopCompetitionMarketWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log("[CompetitionMarketWorker] Stopped.");
  }
}
