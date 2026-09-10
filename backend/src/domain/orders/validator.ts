/**
 * OrderValidator — Single Responsibility: validate order business rules.
 * Separated from order entity creation (SRP, GRASP Information Expert).
 */
import { getMarketSession } from "../market/marketHours";
import { toInrAmount, USD_TO_INR_RATE } from "../../lib/currency";

export type ValidationContext = {
  balance: number;
  holdings: number;
  livePrice: number;
};

export type OrderPayload = {
  ticker: string;
  type: "market" | "limit" | "stop_loss";
  side: "buy" | "sell";
  quantity: number;
  limitPrice?: number | null;
};

export class OrderValidator {
  /**
   * Validates common rules for all order types.
   * Throws with a descriptive message on failure.
   */
  static validateCommon(payload: OrderPayload, ctx: ValidationContext): void {
    if (payload.quantity <= 0) {
      throw new Error("Quantity must be greater than 0");
    }

    const session = getMarketSession(payload.ticker);
    if (!session.open) {
      throw new Error(
        `${session.exchange} is closed right now, so ${payload.ticker.toUpperCase()} can't be traded. Trading hours: ${session.hours}.`
      );
    }

    if (payload.side === "buy") {
      const referencePrice = payload.limitPrice ?? ctx.livePrice;
      // `referencePrice` is in the ticker's native currency (USD for US
      // stocks). The virtual balance is always INR, so the cost must be
      // converted before it's compared against it — otherwise a $150 order
      // was being treated as costing ₹150 instead of the correct
      // ₹150 × USD_TO_INR_RATE.
      const nativeCost = referencePrice * payload.quantity;
      const required = toInrAmount(nativeCost, payload.ticker);
      if (ctx.balance < required) {
        const fxNote =
          required !== nativeCost
            ? ` (${payload.quantity} × $${referencePrice.toFixed(2)} converted at 1 USD = ₹${USD_TO_INR_RATE})`
            : "";
        throw new Error(
          `Insufficient balance — this order needs ₹${required.toFixed(2)}${fxNote} but you only have ₹${ctx.balance.toFixed(2)} available.`
        );
      }
    }

    if (payload.side === "sell") {
      // Short selling is not allowed: a stock can only be sold if it is
      // already part of the portfolio, and only up to the quantity held.
      if (ctx.holdings <= 0) {
        throw new Error(
          `Can't sell ${payload.ticker.toUpperCase()} — this stock isn't in your portfolio holdings.`
        );
      }
      if (payload.quantity > ctx.holdings) {
        throw new Error(
          `Can't sell ${payload.quantity} share(s) of ${payload.ticker.toUpperCase()} — you only hold ${ctx.holdings}.`
        );
      }
    }
  }

  /** Additional validation specific to limit orders. */
  static validateLimitPrice(payload: OrderPayload): void {
    if (!payload.limitPrice || payload.limitPrice <= 0) {
      throw new Error("Limit orders require a positive limitPrice");
    }
  }

  /** Additional validation specific to stop-loss orders. */
  static validateTriggerPrice(payload: OrderPayload): void {
    if (!payload.limitPrice || payload.limitPrice <= 0) {
      throw new Error("Stop-loss orders require a positive trigger price");
    }
  }
}
