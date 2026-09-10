import { Elysia, t } from "elysia";
import { authenticate } from "../lib/auth";
import { sql } from "../lib/db";
import { getLivePrice } from "../lib/priceCache";
import { getCachedProfile } from "../lib/profileCache";
import { getPreviousClose } from "../lib/previousClose";
import { normalizeTicker } from "../domain/market/tickerSymbols";

const DEFAULT_LIST_NAME = "My Watchlist";

async function ensureDefaultList(userId: string): Promise<{ id: string; name: string }> {
  const [existing] = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM watchlist_lists WHERE user_id = ${userId} ORDER BY created_at ASC LIMIT 1
  `;
  if (existing) return existing;

  const [created] = await sql<{ id: string; name: string }[]>`
    INSERT INTO watchlist_lists (user_id, name) VALUES (${userId}, ${DEFAULT_LIST_NAME})
    RETURNING id, name
  `;
  return created;
}

async function assertOwnsList(userId: string, listId: string) {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM watchlist_lists WHERE id = ${listId} AND user_id = ${userId}
  `;
  if (!row) throw new Error("Watchlist not found");
}

/**
 * watchlistModule — a user can keep several named watchlists (e.g. "Tech
 * Picks", "Dividend Plays"). Each list's rows are enriched with live price,
 * day change, volume, and 52-week range so the UI can render a broker-style
 * table without extra round trips.
 */
export const watchlistModule = new Elysia({ prefix: "/watchlist" })
  // ── List management ──
  .get("/lists", async (ctx: any) => {
    const { user } = await authenticate(ctx as any);
    await ensureDefaultList(user.id);

    const lists = await sql<{ id: string; name: string; createdAt: string; count: number }[]>`
      SELECT wl.id, wl.name, wl.created_at as "createdAt", COUNT(w.id)::int as count
      FROM watchlist_lists wl
      LEFT JOIN watchlist w ON w.list_id = wl.id
      WHERE wl.user_id = ${user.id}
      GROUP BY wl.id
      ORDER BY wl.created_at ASC
    `;

    return { lists };
  })
  .post(
    "/lists",
    async (ctx: any) => {
      const { user } = await authenticate(ctx as any);
      const name = String((ctx.body as any).name).trim();

      if (!name) {
        ctx.set.status = 400;
        return { error: "Give your watchlist a name." };
      }

      try {
        const [created] = await sql<{ id: string; name: string; createdAt: string }[]>`
          INSERT INTO watchlist_lists (user_id, name) VALUES (${user.id}, ${name})
          RETURNING id, name, created_at as "createdAt"
        `;
        return { ok: true, list: { ...created, count: 0 } };
      } catch {
        ctx.set.status = 409;
        return { error: `You already have a watchlist named "${name}".` };
      }
    },
    { body: t.Object({ name: t.String({ minLength: 1, maxLength: 60 }) }) }
  )
  .delete("/lists/:listId", async (ctx: any) => {
    const { user } = await authenticate(ctx as any);
    const { listId } = ctx.params;

    const result = await sql`
      DELETE FROM watchlist_lists WHERE id = ${listId} AND user_id = ${user.id}
    `;

    if (result.count === 0) {
      ctx.set.status = 404;
      return { error: "Watchlist not found." };
    }
    return { ok: true };
  })
  // ── Items within a list ──
  .get("/lists/:listId", async (ctx: any) => {
    const { user } = await authenticate(ctx as any);
    const { listId } = ctx.params;

    try {
      await assertOwnsList(user.id, listId);
    } catch {
      ctx.set.status = 404;
      return { error: "Watchlist not found." };
    }

    const rows = await sql<
      { id: string; ticker: string; targetPrice: string | null; notes: string | null; addedAt: string }[]
    >`
      SELECT id, ticker, target_price as "targetPrice", notes, added_at as "addedAt"
      FROM watchlist
      WHERE list_id = ${listId}
      ORDER BY added_at DESC
    `;

    const items = await Promise.all(
      rows.map(async (row) => {
        const [livePrice, profile, previousClose] = await Promise.all([
          getLivePrice(row.ticker),
          getCachedProfile(row.ticker),
          getPreviousClose(row.ticker)
        ]);
        const targetPrice = row.targetPrice ? Number(row.targetPrice) : null;

        let targetHit: boolean | null = null;
        if (targetPrice !== null && typeof livePrice === "number") {
          targetHit = livePrice <= targetPrice;
        }

        const changeAbs = typeof livePrice === "number" && previousClose != null ? livePrice - previousClose : null;
        const changePct = changeAbs !== null && previousClose ? (changeAbs / previousClose) * 100 : null;

        return {
          id: row.id,
          ticker: row.ticker,
          targetPrice,
          notes: row.notes,
          addedAt: row.addedAt,
          livePrice: typeof livePrice === "number" ? livePrice : null,
          targetHit,
          previousClose,
          changeAbs,
          changePct,
          volume: profile?.volume ?? null,
          fiftyTwoWeekLow: profile?.fiftyTwoWeekLow ?? null,
          fiftyTwoWeekHigh: profile?.fiftyTwoWeekHigh ?? null
        };
      })
    );

    return { listId, watchlist: items };
  })
  .post(
    "/lists/:listId",
    async (ctx: any) => {
      const { user } = await authenticate(ctx as any);
      const { listId } = ctx.params;

      try {
        await assertOwnsList(user.id, listId);
      } catch {
        ctx.set.status = 404;
        return { error: "Watchlist not found." };
      }

      const body = ctx.body as any;
      const ticker = normalizeTicker(String(body.ticker));

      if (!ticker) {
        ctx.set.status = 400;
        return { error: "A valid ticker symbol is required." };
      }

      const [row] = await sql<{ id: string; ticker: string; targetPrice: string | null; notes: string | null; addedAt: string }[]>`
        INSERT INTO watchlist (list_id, ticker, target_price, notes)
        VALUES (${listId}, ${ticker}, ${body.targetPrice ?? null}, ${body.notes ?? null})
        ON CONFLICT (list_id, ticker)
        DO UPDATE SET target_price = EXCLUDED.target_price, notes = EXCLUDED.notes
        RETURNING id, ticker, target_price as "targetPrice", notes, added_at as "addedAt"
      `;

      return {
        ok: true,
        item: {
          id: row.id,
          ticker: row.ticker,
          targetPrice: row.targetPrice ? Number(row.targetPrice) : null,
          notes: row.notes,
          addedAt: row.addedAt
        }
      };
    },
    {
      body: t.Object({
        ticker: t.String({ minLength: 1, maxLength: 50 }),
        targetPrice: t.Optional(t.Number({ minimum: 0.0001 })),
        notes: t.Optional(t.String({ maxLength: 500 }))
      })
    }
  )
  .delete("/lists/:listId/:ticker", async (ctx: any) => {
    const { user } = await authenticate(ctx as any);
    const { listId } = ctx.params;

    try {
      await assertOwnsList(user.id, listId);
    } catch {
      ctx.set.status = 404;
      return { error: "Watchlist not found." };
    }

    const ticker = normalizeTicker(String(ctx.params.ticker));
    const result = await sql`
      DELETE FROM watchlist WHERE list_id = ${listId} AND ticker = ${ticker}
    `;

    if (result.count === 0) {
      ctx.set.status = 404;
      return { error: `${ticker} is not on this watchlist.` };
    }

    return { ok: true };
  });
