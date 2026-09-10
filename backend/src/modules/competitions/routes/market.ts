import { Elysia, t } from "elysia";
import { authenticate } from "../../../lib/auth";
import { env } from "../../../config/env";
import { connectProducer, producer } from "../../../lib/kafka";
import { redis } from "../../../lib/redis";
import { sql } from "../../../lib/db";
import { competitionService } from "../deps";
import { handleCompetitionError } from "../errorHandler";
import { competitionRepository } from "../../../data/repositories/CompetitionRepository";
import { CompetitionNotFoundError, UnauthorizedCompetitionError, CompetitionAlreadyStartedError } from "../../../domain/competitions/types";

// Dynamic import for getLivePrice
async function fetchLivePrice(ticker: string) {
  const { getLivePrice } = await import("../../../lib/priceCache");
  return getLivePrice(ticker);
}

export const marketRoutes = new Elysia()
  .put(
    "/:id/stock-config",
    async (ctx: any) => {
      try {
        const { user } = await authenticate(ctx);
        const competitionId = ctx.params.id;
        const body = ctx.body as any;

        await competitionService.configureStockData(user.id, competitionId, {
          dataSource: body.dataSource,
          allowInfluence: body.allowInfluence,
          tickers: body.tickers || [],
        });

        if (body.dataSource === "simulated") {
          await redis.set(
            `competition-pricing:${competitionId}`,
            JSON.stringify({
              competitionId,
              tickers: body.tickers || ["FAKE", "NOVA", "TSIM", "ALFA", "ZENX"],
              allowInfluence: body.allowInfluence ?? false,
              createdAt: new Date().toISOString(),
            }),
            "EX",
            86400 * 30
          );
        }

        return { ok: true };
      } catch (error: any) {
        return handleCompetitionError(error, ctx);
      }
    },
    {
      body: t.Object({
        dataSource: t.String(),
        allowInfluence: t.Boolean(),
        tickers: t.Optional(t.Array(t.String())),
      }),
    }
  )
  .post(
    "/:id/stock-data",
    async (ctx: any) => {
      try {
        const { user } = await authenticate(ctx);
        const competitionId = ctx.params.id;
        const body = ctx.body as any;

        const file: File = body.file;
        const configStr = body.config;
        let config: any = {};
        try {
          config = JSON.parse(configStr);
        } catch {}

        const competition = await competitionRepository.getById(competitionId);
        if (!competition) throw new CompetitionNotFoundError(competitionId);
        if (competition.createdBy !== user.id)
          throw new UnauthorizedCompetitionError(user.id, "upload stock data");
        if (competition.startAt <= new Date())
          throw new CompetitionAlreadyStartedError(competitionId);

        const xlsx = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const workbook = xlsx.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet);

        let lastRow: any = {};
        const processedData = data.map((row: any) => {
          const newRow: any = {};
          for (const [k, v] of Object.entries(row)) {
            newRow[k] = v === null || v === undefined || v === "" ? (lastRow[k] ?? 0) : v;
          }
          lastRow = newRow;
          return newRow;
        });

        const redisKey = `opt:excel:${competitionId}`;
        await redis.set(redisKey, JSON.stringify(processedData), "EX", 86400 * 7);

        await competitionRepository.update(competitionId, {
          stockDataSource: "excel",
          allowUserInfluence: config?.allowInfluence ?? false,
          stockDataConfig: config,
        });

        await connectProducer();
        await producer.send({
          topic: env.SIM_CONTROL_TOPIC,
          messages: [
            {
              key: "admin",
              value: JSON.stringify({
                action: "launch_competition_excel",
                competitionId,
                redisKey,
                tickers: config.tickers || [],
                allowInfluence: config.allowInfluence ?? false,
              }),
            },
          ],
        });

        return { ok: true, rows: processedData.length };
      } catch (error: any) {
        return handleCompetitionError(error, ctx);
      }
    },
    {
      body: t.Object({
        file: t.File(),
        config: t.String(),
      }),
    }
  )
  .get("/:id/dashboard", async (ctx: any) => {
    try {
      const { user } = await authenticate(ctx);
      const competitionId = ctx.params.id;

      const comp = await competitionRepository.getById(competitionId);
      if (!comp) throw new CompetitionNotFoundError(competitionId);

      if (Date.now() < new Date(comp.startAt).getTime()) {
        return { stocks: [] };
      }

      let tickers: string[] = [];
      try {
        const cfg =
          typeof comp.stockDataConfig === "string"
            ? JSON.parse(comp.stockDataConfig)
            : comp.stockDataConfig;
        tickers = cfg?.tickers || [];
      } catch {}

      const holdings = await sql<any[]>`
        SELECT ticker, quantity, avg_cost as "avgCost"
        FROM competition_holdings
        WHERE user_id = ${user.id} AND competition_id = ${competitionId}
      `;

      const combinedTickers = Array.from(
        new Set([...tickers, ...holdings.map((h: any) => h.ticker)])
      ) as string[];

      const tickerMap: Record<string, string> = {};
      combinedTickers.forEach((t, i) => {
        tickerMap[`STOCK${i + 1}`] = t;
        tickerMap[t] = t;
      });
      await redis.set(`comp:${competitionId}:tickers`, JSON.stringify(tickerMap), "EX", 3600);

      const isCreator = comp.createdBy === user.id;
      const isLive = comp.stockDataSource === "live" || (comp.stockDataSource as string) === "real";

      const stocks = await Promise.all(
        combinedTickers.map(async (t, i) => {
          const resolveTicker = isLive ? t : `C_${competitionId}_${t}`;

          let livePrice: number | null = await fetchLivePrice(resolveTicker);

          if (livePrice === null || livePrice === undefined) {
            const [lastTick] = await sql<{ price: string }[]>`
              SELECT price FROM price_ticks
              WHERE ticker = ${resolveTicker}
              ORDER BY time DESC LIMIT 1
            `;
            livePrice = lastTick ? Number(lastTick.price) : null;
          }

          const hold = holdings.find((h: any) => h.ticker === t);
          const avgCost = Number(hold?.avgCost || 0);
          const anonTicker = `STOCK${i + 1}`;

          return {
            ticker: anonTicker,
            displayTicker: isCreator ? `${anonTicker} (${t})` : anonTicker,
            dbTicker: resolveTicker,
            price: livePrice,
            holdingQuantity: hold ? Number(hold.quantity) : 0,
            avgCost,
            pnl: hold && livePrice ? (livePrice - avgCost) * Number(hold.quantity) : 0,
          };
        })
      );

      return { stocks };
    } catch (error: any) {
      return handleCompetitionError(error, ctx);
    }
  })
  .get("/:id/stock-history/:ticker", async (ctx: any) => {
    try {
      const competitionId = ctx.params.id;
      let requestedTicker = ctx.params.ticker.toUpperCase();

      const comp = await competitionRepository.getById(competitionId);
      if (!comp) throw new CompetitionNotFoundError(competitionId);

      const mappingStr = await redis.get(`comp:${competitionId}:tickers`);
      if (mappingStr) {
        const map = JSON.parse(mappingStr);
        if (map[requestedTicker]) requestedTicker = map[requestedTicker];
      }

      const now = Date.now();
      const startMs = new Date(comp.startAt).getTime();
      const queryStart = new Date(startMs).toISOString();
      const queryEnd = new Date(Math.min(now, new Date(comp.endAt).getTime())).toISOString();

      const resultPoints: { time: string; price: number }[] = [];

      if (comp.stockDataSource === "excel") {
        const dataJson = await redis.get(`opt:excel:${competitionId}`);
        if (dataJson) {
          const allPoints = JSON.parse(dataJson);
          const tickerData = allPoints.filter((p: any) => p.ticker === requestedTicker);

          const beforeStart = tickerData.filter(
            (p: any) => new Date(p.time).getTime() < startMs
          );
          if (beforeStart.length > 0) {
            const last = beforeStart[beforeStart.length - 1];
            resultPoints.push({ time: comp.startAt.toISOString(), price: last.close ?? last.price ?? 0 });
          }

          for (const p of tickerData) {
            const pt = new Date(p.time).getTime();
            if (pt >= startMs && pt <= now) {
              resultPoints.push({ time: p.time, price: p.close ?? p.price ?? 0 });
            }
          }
        }
      } else {
        const dbTicker =
          (comp.stockDataSource === "live" || (comp.stockDataSource as string) === "real")
            ? requestedTicker
            : `C_${competitionId}_${requestedTicker}`;

        const [seedTick] = await sql<{ time: string; price: string }[]>`
          SELECT time, price FROM price_ticks
          WHERE ticker = ${dbTicker} AND time < ${queryStart}
          ORDER BY time DESC LIMIT 1
        `;
        if (seedTick) {
          resultPoints.push({ time: comp.startAt.toISOString(), price: Number(seedTick.price) });
        }

        const points = await sql<{ time: string; price: string }[]>`
          SELECT time, price FROM price_ticks
          WHERE ticker = ${dbTicker}
            AND time >= ${queryStart}
            AND time <= ${queryEnd}
          ORDER BY time ASC
        `;
        resultPoints.push(...points.map((p) => ({ time: p.time, price: Number(p.price) })));
      }

      await redis.set(
        `comp-history:${competitionId}:${requestedTicker}`,
        JSON.stringify(resultPoints),
        "EX",
        10
      );

      return { points: resultPoints, source: "db" };
    } catch (error: any) {
      return handleCompetitionError(error, ctx);
    }
  });
