import { OrderValidator, type OrderPayload, type ValidationContext } from "./validator";

export type { OrderPayload, ValidationContext };
export type OrderType = "market" | "limit" | "stop_loss";
export type OrderSide = "buy" | "sell";

/**
 * TradeOrder interface (Open/Closed Principle):
 * Open for extension (new order types) but closed for modification to core logic.
 */
export interface TradeOrder {
  payload: OrderPayload;
  validate(ctx: ValidationContext): void;
  redisKey(): string | null;
}

/**
 * BaseOrder (Template Method pattern):
 * Defines the common structure; subclasses override specific steps.
 * Delegates ALL validation to OrderValidator (SRP / DIP).
 */
class BaseOrder implements TradeOrder {
  constructor(public payload: OrderPayload) {}

  validate(ctx: ValidationContext): void {
    OrderValidator.validateCommon(this.payload, ctx);
  }

  redisKey(): string | null {
    return null;
  }
}

/** Market order — executes immediately at live price. */
class MarketOrder extends BaseOrder {
  // Inherits common validation; no additional rules needed.
}

/**
 * Limit order — executes at or better than a specified price.
 * Uses Liskov Substitution Principle: substituting BaseOrder with LimitOrder
 * still satisfies the TradeOrder contract with additional pre-conditions.
 */
class LimitOrder extends BaseOrder {
  override validate(ctx: ValidationContext): void {
    OrderValidator.validateLimitPrice(this.payload);
    super.validate(ctx);
  }

  override redisKey(): string | null {
    const ticker = this.payload.ticker.toUpperCase();
    return this.payload.side === "buy"
      ? `limits:buy:${ticker}`
      : `limits:sell:${ticker}`;
  }
}

/** Stop-loss order — triggers a sell when price drops to trigger level. */
class StopLossOrder extends BaseOrder {
  override validate(ctx: ValidationContext): void {
    OrderValidator.validateTriggerPrice(this.payload);
    super.validate(ctx);
  }

  override redisKey(): string | null {
    return `stops:sell:${this.payload.ticker.toUpperCase()}`;
  }
}

/**
 * OrderFactory (Factory Method pattern):
 * Centralises construction of order objects — callers never instantiate
 * MarketOrder / LimitOrder / StopLossOrder directly (Creator GRASP).
 */
export class OrderFactory {
  static create(payload: OrderPayload): TradeOrder {
    switch (payload.type) {
      case "market":    return new MarketOrder(payload);
      case "limit":     return new LimitOrder(payload);
      case "stop_loss": return new StopLossOrder(payload);
      default:
        throw new Error(`Unsupported order type: ${(payload as any).type}`);
    }
  }
}
