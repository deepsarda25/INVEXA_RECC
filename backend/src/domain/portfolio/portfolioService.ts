import { getLivePrice } from "../../lib/priceCache";
import { toInrAmount } from "../../lib/currency";

export type HoldingLine = {
  ticker: string;
  quantity: string | number;
  avgCost: string | number;
};

export type PortfolioSummary = {
  cash: number;
  totalHoldingsValue: number;
  totalPortfolioValue: number;
  totalUnrealizedPnl: number;
  holdings: Array<{
    ticker: string;
    quantity: number;
    avgCost: number;
    livePrice: number;
    marketValue: number;
    unrealizedPnl: number;
  }>;
};

/**
 * PortfolioService — Single Responsibility: compute portfolio value & P/L.
 * Extracted from the route handler (GRASP Information Expert: owns the
 * computation because it has access to both holdings data and live prices).
 */
export class PortfolioService {
  /**
   * Builds a full portfolio summary given a list of holdings and cash balance.
   * Fetches live prices from Redis cache for each position.
   */
  static async buildSummary(
    userHoldings: HoldingLine[],
    cashBalance: string | number
  ): Promise<PortfolioSummary> {
    const lines = await Promise.all(
      userHoldings.map(async (h) => {
        const live = (await getLivePrice(h.ticker)) ?? Number(h.avgCost);
        const qty = Number(h.quantity);
        const avg = Number(h.avgCost);
        // avgCost/livePrice/marketValue/unrealizedPnl below are kept in the
        // ticker's own native currency (USD for US stocks) — that's what
        // the frontend displays per-holding, alongside a $/₹ symbol chosen
        // per ticker. Only the account-wide totals further down need an
        // INR-converted figure, since the virtual balance itself is INR.
        return {
          ticker: h.ticker,
          quantity: qty,
          avgCost: avg,
          livePrice: live,
          marketValue: live * qty,
          unrealizedPnl: (live - avg) * qty
        };
      })
    );

    const totalHoldingsValue = lines.reduce((acc, l) => acc + toInrAmount(l.marketValue, l.ticker), 0);
    const totalUnrealizedPnl = lines.reduce((acc, l) => acc + toInrAmount(l.unrealizedPnl, l.ticker), 0);
    const cash = Number(cashBalance);

    return {
      cash,
      totalHoldingsValue,
      totalPortfolioValue: cash + totalHoldingsValue,
      totalUnrealizedPnl,
      holdings: lines
    };
  }
}
