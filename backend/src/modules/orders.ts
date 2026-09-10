import { Elysia, t } from "elysia";
import { OrderFactory } from "../domain/orders/factory";
import { authenticate } from "../lib/auth";
import { sql } from "../lib/db";
import { redis } from "../lib/redis";
import { executePendingOrder } from "../domain/orders/executor";
import { OrderPriceResolver } from "../domain/orders/priceResolver";
import { normalizeTicker } from "../domain/market/tickerSymbols";

const orderPriceResolver = new OrderPriceResolver();

export const ordersModule = new Elysia({ prefix: "/orders" })
  .post(
    "/",
    async (ctx: any) => {
      const { user } = await authenticate(ctx as any);
      const body = ctx.body as any;

      let ticker = normalizeTicker(String(body.ticker));
      
      let resolveTicker = ticker;
      if (body.competitionId) {
        // Unmap STOCKX -> AAPL
        const mappingStr = await redis.get(`comp:${body.competitionId}:tickers`);
        if (mappingStr) {
          const map = JSON.parse(mappingStr);
          if (map[ticker]) {
            ticker = map[ticker];
            resolveTicker = ticker;
          }
        }

        const [comp] = await sql<any[]>`SELECT stock_data_source as "stockDataSource" FROM competitions WHERE id = ${body.competitionId} LIMIT 1`;
        if (comp && comp.stockDataSource === 'excel') {
          resolveTicker = `C_${body.competitionId}_${ticker}`;
        }
      }

      let balance = Number(user.virtualBalance);
      let holdingQty = 0;

      if (body.competitionId) {
        const [participant] = await sql<{ virtualBalance: string }[]>`
          SELECT virtual_balance as "virtualBalance" FROM competition_participants
          WHERE user_id = ${user.id} AND competition_id = ${body.competitionId} LIMIT 1
        `;
        if (!participant) {
            ctx.set.status = 403;
            return { error: "You are not a participant in this competition." };
        }
        balance = Number(participant.virtualBalance);
        
        const [holding] = await sql<{ quantity: number }[]>`
          SELECT quantity FROM competition_holdings WHERE user_id = ${user.id} AND ticker = ${ticker} AND competition_id = ${body.competitionId} LIMIT 1
        `;
        holdingQty = Number(holding?.quantity ?? 0);
      } else {
        const [holding] = await sql<{ quantity: number }[]>`
          SELECT quantity FROM holdings WHERE user_id = ${user.id} AND ticker = ${ticker} LIMIT 1
        `;
        holdingQty = Number(holding?.quantity ?? 0);
      }

      const resolved = await orderPriceResolver.resolve({
        ticker: resolveTicker,
        limitPrice: body.limitPrice
      });

      if (!resolved || Number.isNaN(resolved.price)) {
        ctx.set.status = 400;
        return { error: `No executable price found for ${ticker}. Start simulator or use a limit price.` };
      }

      const livePrice = resolved.price;

      const orderEntity = OrderFactory.create({
        ticker: resolveTicker,
        type: body.type,
        side: body.side,
        quantity: body.quantity,
        limitPrice: body.limitPrice ?? null
      });

      orderEntity.validate({
        balance,
        holdings: holdingQty,
        livePrice
      });

      const orderId = crypto.randomUUID();

      await sql`
        INSERT INTO orders (id, user_id, ticker, type, side, quantity, limit_price, status, competition_id)
        VALUES (
          ${orderId},
          ${user.id},
          ${ticker},
          ${body.type},
          ${body.side},
          ${body.quantity},
          ${body.limitPrice ? String(body.limitPrice) : null},
          'pending',
          ${body.competitionId || null}
        )
      `;

      const pendingRedisKey = orderEntity.redisKey();
      if (pendingRedisKey && body.limitPrice) {
        await redis.zadd(pendingRedisKey, body.limitPrice, orderId);
      }

      if (body.type === "market") {
        const executed = await executePendingOrder(orderId, livePrice);
        if (executed.ok) {
          return {
            orderId,
            status: "filled",
            queued: false,
            filledPrice: executed.fill.filledAt,
            priceSource: resolved.source,
            note: "Market order executed immediately"
          };
        }
      }

      return {
        orderId,
        status: "pending",
        queued: body.type !== "market",
        priceSource: resolved.source,
        note:
          body.type === "market"
            ? "Market order emitted to Kafka orders.placed"
            : "Order stored in Redis trigger queue and DB pending state"
      };
    },
    {
      body: t.Object({
        ticker: t.String({ minLength: 1, maxLength: 50 }),
        type: t.Union([t.Literal("market"), t.Literal("limit"), t.Literal("stop_loss")]),
        side: t.Union([t.Literal("buy"), t.Literal("sell")]),
        quantity: t.Number({ minimum: 1 }),
        limitPrice: t.Optional(t.Number({ minimum: 0.0001 })),
        competitionId: t.Optional(t.String())
      })
    }
  )
  .get(
    "/",
    async (ctx: any) => {
      const { user } = await authenticate(ctx as any);
      const ticker = ctx.query.ticker?.toUpperCase();
      const status = ctx.query.status;

      const params: Array<string> = [user.id];
      let whereClause = "user_id = $1 AND competition_id IS NULL";

      if (ticker) {
        params.push(ticker);
        whereClause += ` AND ticker = $${params.length}`;
      }

      if (status) {
        params.push(status);
        whereClause += ` AND status = $${params.length}`;
      }

      const data = await sql.unsafe(
        `SELECT id,
                ticker,
                type,
                side,
                quantity,
                limit_price as "limitPrice",
                status,
                filled_price as "filledPrice",
                created_at as "createdAt",
                executed_at as "executedAt"
         FROM orders
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT 200`,
        params
      );

      return { orders: data };
    },
    {
      query: t.Object({
        ticker: t.Optional(t.String()),
        status: t.Optional(t.Union([t.Literal("pending"), t.Literal("filled"), t.Literal("cancelled")]))
      })
    }
  )
  .delete("/:id", async (ctx: any) => {
    const { user } = await authenticate(ctx as any);

    const [row] = await sql<
      {
        id: string;
        ticker: string;
        type: "market" | "limit" | "stop_loss";
        side: "buy" | "sell";
        quantity: number;
        limitPrice: string | null;
        status: "pending" | "filled" | "cancelled";
      }[]
    >`
      SELECT id,
             ticker,
             type,
             side,
             quantity,
             limit_price as "limitPrice",
             status
      FROM orders
      WHERE id = ${ctx.params.id} AND user_id = ${user.id}
      LIMIT 1
    `;

    if (!row) {
      ctx.set.status = 404;
      return { error: "Order not found" };
    }

    if (row.status !== "pending") {
      ctx.set.status = 409;
      return { error: "Only pending orders can be cancelled" };
    }

    const key = OrderFactory.create({
      ticker: row.ticker,
      type: row.type,
      side: row.side,
      quantity: row.quantity,
      limitPrice: row.limitPrice ? Number(row.limitPrice) : null
    }).redisKey();

    if (key) {
      await redis.zrem(key, row.id);
    }

    await sql`
      UPDATE orders
      SET status = 'cancelled'
      WHERE id = ${row.id}
    `;

    return { ok: true };
  });
