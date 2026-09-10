/**
 * Trading Service
 * 
 * Orchestrates order placement, validation, and execution across global and competition contexts.
 */

import { OrderFactory } from "./factory";
import { executePendingOrder } from "./executor";
import { OrderPriceResolver } from "./priceResolver";
import { MarketDataService, marketDataService } from "../market/MarketDataService";
import { IHoldingRepository, holdingRepository } from "../../data/repositories/HoldingRepository";
import { sql } from "../../lib/db";
import { redis } from "../../lib/redis";

export interface PlaceOrderInput {
  userId: string;
  ticker: string;
  type: 'market' | 'limit' | 'stop_loss';
  side: 'buy' | 'sell';
  quantity: number;
  limitPrice?: number;
  competitionId?: string;
}

export class TradingService {
  constructor(
    private marketData: MarketDataService = marketDataService,
    private holdings: IHoldingRepository = holdingRepository,
    private priceResolver: OrderPriceResolver = new OrderPriceResolver()
  ) {}

  async placeOrder(input: PlaceOrderInput) {
    let ticker = input.ticker.toUpperCase();
    let resolveTicker = ticker;

    // 1. Handle Competition Ticker Mapping
    if (input.competitionId) {
      ticker = await this.marketData.resolveTicker(input.competitionId, ticker);
      resolveTicker = ticker;

      const [comp] = await sql<any[]>`SELECT stock_data_source as "stockDataSource" FROM competitions WHERE id = ${input.competitionId} LIMIT 1`;
      if (comp && comp.stockDataSource !== 'live' && comp.stockDataSource !== 'real') {
        resolveTicker = `C_${input.competitionId}_${ticker}`;
      }
    }

    // 2. Fetch Balance and Current Holdings
    let balance = 0;
    let holdingQty = 0;

    if (input.competitionId) {
       const [participant] = await sql<{ virtualBalance: string }[]>`
          SELECT virtual_balance as "virtualBalance" FROM competition_participants
          WHERE user_id = ${input.userId} AND competition_id = ${input.competitionId} LIMIT 1
        `;
        if (!participant) {
            throw new Error("You are not a participant in this competition.");
        }
        balance = Number(participant.virtualBalance);
        
        const compHoldings = await this.holdings.getCompetitionHoldings(input.competitionId, input.userId);
        holdingQty = compHoldings.find(h => h.ticker === ticker)?.quantity ?? 0;
    } else {
        const [user] = await sql<{ virtualBalance: string }[]>`SELECT virtual_balance as "virtualBalance" FROM users WHERE id = ${input.userId} LIMIT 1`;
        balance = Number(user.virtualBalance);

        const globalHoldings = await this.holdings.getGlobalHoldings(input.userId);
        holdingQty = globalHoldings.find(h => h.ticker === ticker)?.quantity ?? 0;
    }

    // 3. Resolve Execution Price
    const resolved = await this.priceResolver.resolve({
      ticker: resolveTicker,
      limitPrice: input.limitPrice
    });

    if (!resolved || Number.isNaN(resolved.price)) {
      throw new Error(`No executable price found for ${ticker}.`);
    }

    const livePrice = resolved.price;

    // 4. Create and Validate Order Entity
    const orderEntity = OrderFactory.create({
      ticker: resolveTicker,
      type: input.type,
      side: input.side,
      quantity: input.quantity,
      limitPrice: input.limitPrice ?? null
    });

    orderEntity.validate({
      balance,
      holdings: holdingQty,
      livePrice
    });

    // 5. Persist Order
    const orderId = crypto.randomUUID();
    await sql`
      INSERT INTO orders (id, user_id, ticker, type, side, quantity, limit_price, status, competition_id)
      VALUES (
        ${orderId},
        ${input.userId},
        ${ticker},
        ${input.type},
        ${input.side},
        ${input.quantity},
        ${input.limitPrice ? String(input.limitPrice) : null},
        'pending',
        ${input.competitionId || null}
      )
    `;

    // 6. Handle Redis Queue for Limit Orders
    const pendingRedisKey = orderEntity.redisKey();
    if (pendingRedisKey && input.limitPrice) {
      await redis.zadd(pendingRedisKey, input.limitPrice, orderId);
    }

    // 7. Immediate Execution for Market Orders
    if (input.type === "market") {
      const executed = await executePendingOrder(orderId, livePrice);
      if (executed.ok) {
        return {
          orderId,
          status: "filled",
          filledPrice: livePrice,
          priceSource: resolved.source
        };
      }
    }

    return {
      orderId,
      status: "pending",
      priceSource: resolved.source
    };
  }
}

export const tradingService = new TradingService();
