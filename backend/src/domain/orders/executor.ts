import { producer } from "../../lib/kafka";
import { getLivePrice } from "../../lib/priceCache";
import { notifyUser } from "../../lib/wsHub";
import { sendTransactionEmail } from "../../lib/mailer";
import { sql } from "../../lib/db";
import { env } from "../../config/env";
import { toInrAmount } from "../../lib/currency";
import type { OrderFilledEvent } from "../../types/events";

type OrderRow = {
  id: string;
  userId: string;
  ticker: string;
  side: "buy" | "sell";
  quantity: number;
  status: "pending" | "filled" | "cancelled";
  competitionId: string | null;
};

export async function executePendingOrder(orderId: string, preferredPrice?: number) {
  const [order] = await sql<OrderRow[]>`
    SELECT id,
           user_id as "userId",
           ticker,
           side,
           quantity,
           status,
           competition_id as "competitionId"
    FROM orders
    WHERE id = ${orderId}
    LIMIT 1
  `;

  if (!order || order.status !== "pending") {
    return { ok: false, reason: "not-pending" as const };
  }

  const livePrice = preferredPrice ?? (await getLivePrice(order.ticker));
  if (!livePrice || livePrice <= 0) {
    return { ok: false, reason: "no-price" as const };
  }

  const success = await sql.begin(async (trx) => {
    const [lockedOrder] = await trx<OrderRow[]>`
      SELECT id,
             user_id as "userId",
             ticker,
             side,
             quantity,
             status,
             competition_id as "competitionId"
      FROM orders
      WHERE id = ${order.id}
      FOR UPDATE
    `;

    if (!lockedOrder || lockedOrder.status !== "pending") {
      return false;
    }

    const qty = Number(lockedOrder.quantity);
    const isComp = !!lockedOrder.competitionId;

    let currentBalance = 0;
    let holdingQty = 0;
    let holdingAvg = 0;

    if (isComp) {
      const [participant] = await trx<{ virtualBalance: string }[]>`
        SELECT virtual_balance as "virtualBalance"
        FROM competition_participants
        WHERE user_id = ${lockedOrder.userId} AND competition_id = ${lockedOrder.competitionId}
        FOR UPDATE
      `;
      if (!participant) return false;
      currentBalance = Number(participant.virtualBalance);

      const [holding] = await trx<{ quantity: number; avgCost: string }[]>`
        SELECT quantity, avg_cost as "avgCost"
        FROM competition_holdings
        WHERE user_id = ${lockedOrder.userId} AND ticker = ${lockedOrder.ticker} AND competition_id = ${lockedOrder.competitionId}
        FOR UPDATE
      `;
      holdingQty = Number(holding?.quantity ?? 0);
      holdingAvg = Number(holding?.avgCost ?? 0);
    } else {
      const [user] = await trx<{ virtualBalance: string }[]>`
        SELECT virtual_balance as "virtualBalance"
        FROM users
        WHERE id = ${lockedOrder.userId}
        FOR UPDATE
      `;
      if (!user) return false;
      currentBalance = Number(user.virtualBalance);

      const [holding] = await trx<{ quantity: number; avgCost: string }[]>`
        SELECT quantity, avg_cost as "avgCost"
        FROM holdings
        WHERE user_id = ${lockedOrder.userId} AND ticker = ${lockedOrder.ticker}
        FOR UPDATE
      `;
      holdingQty = Number(holding?.quantity ?? 0);
      holdingAvg = Number(holding?.avgCost ?? 0);
    }

    if (lockedOrder.side === "buy") {
      // `livePrice` is in the ticker's native currency (USD for US stocks).
      // The per-share average cost basis is kept in that same native
      // currency (consistent with the live price and with how the
      // frontend displays holdings — each stock in its own currency), but
      // the actual money debited from the INR-denominated virtual balance
      // must be converted first.
      const nativeCost = qty * livePrice;
      const cost = toInrAmount(nativeCost, lockedOrder.ticker);
      if (currentBalance < cost) {
        await trx`UPDATE orders SET status = 'cancelled' WHERE id = ${lockedOrder.id}`;
        return false;
      }

      const newBalance = currentBalance - cost;
      const newQty = holdingQty + qty;
      const newAvg = newQty === 0 ? 0 : (holdingQty * holdingAvg + qty * livePrice) / newQty;

      if (isComp) {
        await trx`UPDATE competition_participants SET virtual_balance = ${newBalance} WHERE user_id = ${lockedOrder.userId} AND competition_id = ${lockedOrder.competitionId}`;
        await trx`
          INSERT INTO competition_holdings (competition_id, user_id, ticker, quantity, avg_cost)
          VALUES (${lockedOrder.competitionId}, ${lockedOrder.userId}, ${lockedOrder.ticker}, ${newQty}, ${newAvg})
          ON CONFLICT (competition_id, user_id, ticker)
          DO UPDATE SET quantity = EXCLUDED.quantity, avg_cost = EXCLUDED.avg_cost, updated_at = NOW()
        `;
      } else {
        await trx`UPDATE users SET virtual_balance = ${newBalance} WHERE id = ${lockedOrder.userId}`;
        await trx`
          INSERT INTO holdings (user_id, ticker, quantity, avg_cost)
          VALUES (${lockedOrder.userId}, ${lockedOrder.ticker}, ${newQty}, ${newAvg})
          ON CONFLICT (user_id, ticker)
          DO UPDATE SET quantity = EXCLUDED.quantity, avg_cost = EXCLUDED.avg_cost, updated_at = NOW()
        `;
      }
    } else {
      // Short selling is not allowed: reject the fill if the position isn't
      // (still) fully held by the time the order comes up for execution —
      // e.g. a queued limit/stop-loss order whose holdings changed since placement.
      if (holdingQty < qty) {
        await trx`UPDATE orders SET status = 'cancelled' WHERE id = ${lockedOrder.id}`;
        return false;
      }

      const proceeds = toInrAmount(qty * livePrice, lockedOrder.ticker);
      const newBalance = currentBalance + proceeds;
      const newQty = holdingQty - qty;

      if (isComp) {
        await trx`UPDATE competition_participants SET virtual_balance = ${newBalance} WHERE user_id = ${lockedOrder.userId} AND competition_id = ${lockedOrder.competitionId}`;
        await trx`
          INSERT INTO competition_holdings (competition_id, user_id, ticker, quantity, avg_cost)
          VALUES (${lockedOrder.competitionId}, ${lockedOrder.userId}, ${lockedOrder.ticker}, ${newQty}, ${holdingAvg})
          ON CONFLICT (competition_id, user_id, ticker)
          DO UPDATE SET quantity = EXCLUDED.quantity, avg_cost = EXCLUDED.avg_cost, updated_at = NOW()
        `;
      } else {
        await trx`UPDATE users SET virtual_balance = ${newBalance} WHERE id = ${lockedOrder.userId}`;
        await trx`
          INSERT INTO holdings (user_id, ticker, quantity, avg_cost)
          VALUES (${lockedOrder.userId}, ${lockedOrder.ticker}, ${newQty}, ${holdingAvg})
          ON CONFLICT (user_id, ticker)
          DO UPDATE SET quantity = EXCLUDED.quantity, avg_cost = EXCLUDED.avg_cost, updated_at = NOW()
        `;
      }
    }

    await trx`
      UPDATE orders
      SET status = 'filled', filled_price = ${livePrice}, executed_at = NOW()
      WHERE id = ${lockedOrder.id}
    `;

    return true;
  });

  if (!success) {
    return { ok: false, reason: "rejected" as const };
  }

  const fill: OrderFilledEvent = {
    orderId: order.id,
    userId: order.userId,
    ticker: order.ticker,
    quantity: Number(order.quantity),
    filledAt: Number(livePrice),
    side: order.side,
    ts: Date.now()
  };

  await producer.send({
    topic: env.ORDERS_FILLED_TOPIC,
    messages: [{ key: fill.userId, value: JSON.stringify(fill) }]
  });

  notifyUser(fill.userId, fill);

  // Fire-and-forget: email the user that their order filled. Only for the
  // main portfolio (not competitions, which can generate many rapid trades
  // during a timed round and would otherwise spam the inbox). This never
  // blocks or fails the order — `sendTransactionEmail`/`sendMail` swallow
  // and log their own errors, and the `.catch` here is just an extra
  // safety net.
  if (!order.competitionId) {
    void (async () => {
      const [recipient] = await sql<{ username: string; email: string }[]>`
        SELECT username, email FROM users WHERE id = ${order.userId} LIMIT 1
      `;
      if (recipient) {
        await sendTransactionEmail({
          to: recipient.email,
          username: recipient.username,
          side: order.side,
          ticker: order.ticker,
          quantity: Number(order.quantity),
          price: Number(livePrice)
        });
      }
    })().catch((err) => console.error("[mailer] transaction email failed:", err));
  }

  return { ok: true, fill };
}