import { eq, gt, and } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { holdings, orders } from "../db/schema";
import { authenticate } from "../lib/auth";
import { db, sql } from "../lib/db";
import { PortfolioService } from "../domain/portfolio/portfolioService";
import { toInrAmount, isUsdTicker } from "../lib/currency";

/**
 * portfolioModule — route controller only.
 * All computation is delegated to PortfolioService (SRP, GRASP Controller).
 */
export const portfolioModule = new Elysia({ prefix: "/portfolio" })
  .post(
    "/deposit",
    async (ctx: any) => {
      const { user } = await authenticate(ctx as any);
      const amount = Number((ctx.body as any).amount);

      if (!Number.isFinite(amount) || amount <= 0) {
        ctx.set.status = 400;
        return { error: "Enter a positive amount to add to your portfolio." };
      }

      const [row] = await sql<{ virtualBalance: string }[]>`
        UPDATE users
        SET virtual_balance = virtual_balance + ${amount}, updated_at = NOW()
        WHERE id = ${user.id}
        RETURNING virtual_balance as "virtualBalance"
      `;

      // Log the top-up so it shows up in the account statement.
      await sql`INSERT INTO deposits (user_id, amount) VALUES (${user.id}, ${amount})`;

      return {
        ok: true,
        amountAdded: amount,
        virtualBalance: row.virtualBalance
      };
    },
    {
      body: t.Object({
        amount: t.Number({ minimum: 0.01 })
      })
    }
  )
  .get("/", async (ctx) => {
    const { user } = await authenticate(ctx as any);

    const userHoldings = await db
      .select({
        ticker: holdings.ticker,
        quantity: holdings.quantity,
        avgCost: holdings.avgCost
      })
      .from(holdings)
      // A fully-sold position leaves a zero-quantity row behind for cost-basis
      // history — exclude it so it doesn't show up as a phantom holding.
      .where(and(eq(holdings.userId, user.id), gt(holdings.quantity, 0)));

    return PortfolioService.buildSummary(userHoldings, user.virtualBalance);
  })
  .get(
    "/history",
    async (ctx) => {
      const { user } = await authenticate(ctx as any);
      const limit = Math.min(Number((ctx as any).query.limit ?? 50), 100);
      const offset = Math.max(Number((ctx as any).query.offset ?? 0), 0);

      const rows = await db
        .select({
          id: orders.id,
          ticker: orders.ticker,
          type: orders.type,
          side: orders.side,
          quantity: orders.quantity,
          status: orders.status,
          filledPrice: orders.filledPrice,
          createdAt: orders.createdAt,
          executedAt: orders.executedAt
        })
        .from(orders)
        .where(eq(orders.userId, user.id))
        .limit(limit)
        .offset(offset);

      return { history: rows };
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String())
      })
    }
  )
  .get("/transactions", async (ctx: any) => {
    const { user } = await authenticate(ctx as any);

    const orderRows = await db
      .select({
        ticker: orders.ticker,
        side: orders.side,
        quantity: orders.quantity,
        filledPrice: orders.filledPrice,
        executedAt: orders.executedAt,
        createdAt: orders.createdAt
      })
      .from(orders)
      .where(and(eq(orders.userId, user.id), eq(orders.status, "filled")));

    const depositRows = await sql<{ amount: string; createdAt: string }[]>`
      SELECT amount, created_at as "createdAt" FROM deposits WHERE user_id = ${user.id}
    `;

    type Transaction = {
      date: string;
      type: "BUY" | "SELL" | "DEPOSIT";
      description: string;
      ticker?: string;
      quantity?: number;
      rate?: number;
      amount: number;
    };

    const transactions: Transaction[] = [
      ...orderRows.map((o): Transaction => {
        const rate = Number(o.filledPrice ?? 0);
        const qty = o.quantity;
        const symbol = isUsdTicker(o.ticker) ? "$" : "₹";
        // `amount` is the ledger figure (what actually moved in/out of the
        // INR-denominated virtual balance), so it must be FX-converted for
        // US tickers even though the per-share `rate` shown in the
        // description stays in the stock's native currency.
        const amount = toInrAmount(rate * qty, o.ticker);
        return {
          date: (o.executedAt ?? o.createdAt) as unknown as string,
          type: o.side === "buy" ? "BUY" : "SELL",
          description: `${o.side === "buy" ? "Bought" : "Sold"} ${qty} share(s) of ${o.ticker} at ${symbol}${rate.toFixed(2)}`,
          ticker: o.ticker,
          quantity: qty,
          rate,
          amount
        };
      }),
      ...depositRows.map((d): Transaction => ({
        date: d.createdAt,
        type: "DEPOSIT",
        description: `Added ₹${Number(d.amount).toLocaleString("en-IN")} to portfolio`,
        amount: Number(d.amount)
      }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return { transactions };
  });
