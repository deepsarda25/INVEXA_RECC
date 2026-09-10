export type PriceTickEvent = {
  ticker: string;
  price: number;
  volume: number;
  ts: number;
};

export type OrderPlacedEvent = {
  orderId: string;
  userId: string;
  ticker: string;
  type: "market" | "limit" | "stop_loss";
  side: "buy" | "sell";
  quantity: number;
  limitPrice?: number | null;
  triggeredAt?: number;
};

export type OrderFilledEvent = {
  orderId: string;
  userId: string;
  ticker: string;
  quantity: number;
  filledAt: number;
  side: "buy" | "sell";
  ts: number;
};
