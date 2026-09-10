import { sql } from "../../lib/db";
import { getLivePrice } from "../../lib/priceCache";
import { normalizeTicker, toYahooSymbol } from "../market/tickerSymbols";

export type PriceResolutionContext = {
  ticker: string;
  limitPrice?: number;
};

export type PriceResolution = {
  price: number;
  source: string;
};

interface PriceSource {
  name: string;
  resolve(ctx: PriceResolutionContext): Promise<number | null>;
}

class RedisPriceSource implements PriceSource {
  name = "redis";

  async resolve(ctx: PriceResolutionContext) {
    const price = await getLivePrice(normalizeTicker(ctx.ticker));
    if (price && price > 0) {
      return price;
    }
    return null;
  }
}

class TimescalePriceSource implements PriceSource {
  name = "timescaledb";

  async resolve(ctx: PriceResolutionContext) {
    const ticker = normalizeTicker(ctx.ticker);
    const latest = await sql<{ price: string }[]>`
      SELECT price::text
      FROM price_ticks
      WHERE ticker = ${ticker}
      ORDER BY time DESC
      LIMIT 1
    `;

    if (latest.length === 0) {
      return null;
    }

    const price = Number(latest[0].price);
    if (Number.isFinite(price) && price > 0) {
      return price;
    }

    return null;
  }
}

class ExplicitLimitPriceSource implements PriceSource {
  name = "order-limit";

  async resolve(ctx: PriceResolutionContext) {
    const value = Number(ctx.limitPrice ?? 0);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }

    return null;
  }
}

class YahooPriceSource implements PriceSource {
  name = "yahoo";

  async resolve(ctx: PriceResolutionContext) {
    const yahooSymbol = toYahooSymbol(ctx.ticker);

    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}`
      );

      if (!response.ok) {
        return null;
      }

      const json = (await response.json()) as any;
      const row = json?.quoteResponse?.result?.[0];
      const live = Number(row?.regularMarketPrice ?? 0);
      if (Number.isFinite(live) && live > 0) {
        return live;
      }

      const previousClose = Number(row?.regularMarketPreviousClose ?? 0);
      if (Number.isFinite(previousClose) && previousClose > 0) {
        return previousClose;
      }

      const historyResponse = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=5d&interval=1d`
      );

      if (historyResponse.ok) {
        const historyJson = (await historyResponse.json()) as any;
        const closes = historyJson?.chart?.result?.[0]?.indicators?.quote?.[0]?.close as Array<number | null> | undefined;
        if (Array.isArray(closes)) {
          for (let idx = closes.length - 1; idx >= 0; idx -= 1) {
            const value = closes[idx];
            if (typeof value === "number" && Number.isFinite(value) && value > 0) {
              return value;
            }
          }
        }
      }
    } catch {
      return null;
    }

    return null;
  }
}

export class OrderPriceResolver {
  constructor(
    private readonly sources: PriceSource[] = [
      new RedisPriceSource(),
      new TimescalePriceSource(),
      new ExplicitLimitPriceSource(),
      new YahooPriceSource()
    ]
  ) {}

  async resolve(ctx: PriceResolutionContext): Promise<PriceResolution | null> {
    for (const source of this.sources) {
      const value = await source.resolve(ctx);
      if (value && value > 0) {
        return {
          price: value,
          source: source.name
        };
      }
    }

    return null;
  }
}