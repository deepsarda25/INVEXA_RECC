import { env } from "../config/env";
import { producer } from "../lib/kafka";
import type { PriceTickEvent } from "../types/events";
import { marketAdapter } from "../domain/market/adapter";
import { sql } from "../lib/db";
import { redis } from "../lib/redis";

let workerInterval: NodeJS.Timeout | null = null;
let lastPrices: Record<string, number> = {};

export async function fetchRealPrices(tickers: string[]) {
  return marketAdapter.getBulkLivePrices(tickers);
}

export async function getDynamicTickers() {
  const dynamicSet = new Set<string>(env.REAL_TICKERS.split(",").map(t => t.trim()).filter(Boolean));
  // Collect all tickers currently being traded (from active Holdings and pending Orders)
  try {
    const holdings = await sql<{ ticker: string }[]>`SELECT DISTINCT ticker FROM holdings`;
    holdings.forEach(h => dynamicSet.add(h.ticker.toUpperCase()));
    
    const compHoldings = await sql<{ ticker: string }[]>`SELECT DISTINCT ticker FROM competition_holdings`;
    compHoldings.forEach(h => dynamicSet.add(h.ticker.toUpperCase()));

    const orders = await sql<{ ticker: string }[]>`SELECT DISTINCT ticker FROM orders WHERE status = 'pending'`;
    orders.forEach(o => dynamicSet.add(o.ticker.toUpperCase()));
  } catch (err) {
    console.error("[RealMarketWorker] Failed evaluating dynamic tickers", err);
  }
  
  // Filter out any default static fake tickers the Simulator generates
  const simFakeTickers = new Set(["FAKE", "TSIM", "NOVA", "ALFA", "ZENX"]);
  
  // Also filter out any tickers from active SIMULATED competitions
  try {
    const activeSimCompConfigs = await sql<any[]>`
      SELECT sc.stock_data_config
      FROM competitions sc
      WHERE sc.status = 'active' AND sc.stock_data_source != 'real'
    `;
    for (const comp of activeSimCompConfigs) {
      try {
        const config = typeof comp.stock_data_config === 'string' ? JSON.parse(comp.stock_data_config) : comp.stock_data_config;
        if (config && config.tickers && Array.isArray(config.tickers)) {
          config.tickers.forEach((t: string) => simFakeTickers.add(t.toUpperCase()));
        }
      } catch {}
    }
  } catch (err) {
    console.error("[RealMarketWorker] Failed evaluating active sim competition tickers", err);
  }

  const array = Array.from(dynamicSet).filter(t => !simFakeTickers.has(t));
  return array;
}

export async function processRealMarketTicks() {
  const tickers = await getDynamicTickers();
  if (tickers.length === 0) return;

  const results = await fetchRealPrices(tickers);
  if (results.length === 0) return;

  const messages = [];
  const now = Date.now();

  for (const res of results) {
    // Determine if price actually changed, or if we should just push it anyway
    // The simulator pushes every 1s. We push every 10s. We'll push unconditionally to keep timescaledb updated.
    lastPrices[res.ticker] = res.price;

    const event: PriceTickEvent = {
        ticker: res.ticker,
        price: res.price,
        ts: now,
        volume: res.volume
    };

    messages.push({
        key: res.ticker,
        value: JSON.stringify(event)
    });
  }

  if (messages.length > 0) {
    try {
        await producer.send({
            topic: env.PRICE_TICKS_TOPIC,
            messages
        });
        console.log(`[RealMarketWorker] Published ${messages.length} real stock prices to ${env.PRICE_TICKS_TOPIC}`);
    } catch (err) {
        console.error("[RealMarketWorker] Failed to publish market ticks:", err);
    }
  }
}

export function startRealMarketWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
  }

  console.log(`[RealMarketWorker] Starting. Fetching {${env.REAL_TICKERS}} every ${env.REAL_TICKER_INTERVAL}ms`);
  
  // Run immediately then loop
  processRealMarketTicks().catch(console.error);
  workerInterval = setInterval(() => {
    processRealMarketTicks().catch(console.error);
  }, env.REAL_TICKER_INTERVAL);
}

export function stopRealMarketWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log("[RealMarketWorker] Stopped.");
  }
}
