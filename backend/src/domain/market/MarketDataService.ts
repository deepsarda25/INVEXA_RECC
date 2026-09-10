/**
 * Market Data Service
 * 
 * Centralizes price retrieval, ticker mapping, and strategy resolution.
 */

import { IMarketDataAdapter, marketAdapter } from "./adapter";
import { DataSourceType, IPriceProvider, PricePoint } from "./types";
import { sql } from "../../lib/db";
import { redis } from "../../lib/redis";

export class MarketDataService {
  constructor(
    private adapter: IMarketDataAdapter = marketAdapter
  ) {}

  /**
   * Resolve a ticker to its real underlying symbol
   */
  async resolveTicker(competitionId: string, ticker: string): Promise<string> {
    const mappingStr = await redis.get(`comp:${competitionId}:tickers`);
    if (mappingStr) {
      const map = JSON.parse(mappingStr);
      if (map[ticker]) {
        return map[ticker];
      }
    }
    return ticker;
  }

  /**
   * Get ticker mapping for a competition
   */
  async getTickerMapping(competitionId: string): Promise<Record<string, string>> {
     const mappingStr = await redis.get(`comp:${competitionId}:tickers`);
     return mappingStr ? JSON.parse(mappingStr) : {};
  }

  /**
   * Store ticker mapping for a competition
   */
  async setTickerMapping(competitionId: string, mapping: Record<string, string>): Promise<void> {
    await redis.set(`comp:${competitionId}:tickers`, JSON.stringify(mapping), "EX", 3600);
  }

  /**
   * Get current price based on source
   */
  async getPrice(
    ticker: string,
    source: DataSourceType,
    competitionId?: string
  ): Promise<number | null> {
    let resolvedTicker = ticker;
    
    if (source !== 'real' && competitionId) {
      resolvedTicker = `C_${competitionId}_${ticker}`;
    }

    // 1. Try Redis cache (live price)
    const { getLivePrice } = require("../../lib/priceCache");
    let price = await getLivePrice(resolvedTicker);

    // 2. Fallback to Database price_ticks
    if (price === null || price === undefined) {
      const [lastTick] = await sql<{ price: string }[]>`
        SELECT price FROM price_ticks 
        WHERE ticker = ${resolvedTicker} 
        ORDER BY time DESC LIMIT 1
      `;
      if (lastTick) {
        price = Number(lastTick.price);
      }
    }

    return price;
  }

  /**
   * Get price history based on source
   */
  async getPriceHistory(
    ticker: string,
    source: DataSourceType,
    start: Date,
    end: Date,
    competitionId?: string
  ): Promise<PricePoint[]> {
    const now = new Date();
    const queryStart = start.toISOString();
    const queryEnd = (end < now ? end : now).toISOString();
    const resultPoints: PricePoint[] = [];

    if (source === 'excel' && competitionId) {
      const redisKey = `opt:excel:${competitionId}`;
      const dataJson = await redis.get(redisKey);
      if (dataJson) {
        const allPoints = JSON.parse(dataJson);
        const tickerData = allPoints.filter((p: any) => p.ticker === ticker);
        
        // Seed point
        const beforeStart = tickerData.filter((p: any) => new Date(p.time) < start);
        if (beforeStart.length > 0) {
          const last = beforeStart[beforeStart.length - 1];
          resultPoints.push({ time: start.toISOString(), price: Number(last.close ?? last.price ?? 0) });
        }

        for (const point of tickerData) {
          const pointDate = new Date(point.time);
          if (pointDate >= start && pointDate <= now) {
            resultPoints.push({ time: point.time, price: Number(point.close ?? point.price ?? 0) });
          }
        }
      }
    } else {
      const dbTicker = source === 'real' ? ticker : `C_${competitionId}_${ticker}`;

      // Seed tick
      const [seedTick] = await sql<{ time: string; price: string }[]>`
        SELECT time, price FROM price_ticks
        WHERE ticker = ${dbTicker} AND time < ${queryStart}
        ORDER BY time DESC LIMIT 1
      `;
      if (seedTick) {
        resultPoints.push({ time: start.toISOString(), price: Number(seedTick.price) });
      }

      // Range ticks
      const points = await sql<{ time: string; price: string }[]>`
        SELECT time, price
        FROM price_ticks
        WHERE ticker = ${dbTicker}
          AND time >= ${queryStart}
          AND time <= ${queryEnd}
        ORDER BY time ASC
      `;
      resultPoints.push(...points.map(p => ({ time: p.time, price: Number(p.price) })));
    }

    return resultPoints;
  }
}

export const marketDataService = new MarketDataService();
