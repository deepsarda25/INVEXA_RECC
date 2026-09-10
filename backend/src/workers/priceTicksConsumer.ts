import type { Consumer } from "kafkajs";
import { env } from "../config/env";
import { createConsumer, producer } from "../lib/kafka";
import { redis } from "../lib/redis";
import { sql } from "../lib/db";
import type { OrderPlacedEvent, PriceTickEvent } from "../types/events";

async function queueTriggeredOrders(ticker: string, currentPrice: number) {
  const buyHits = await redis.zrangebyscore(`limits:buy:${ticker}`, currentPrice, "+inf");
  const sellLimitHits = await redis.zrangebyscore(`limits:sell:${ticker}`, "-inf", currentPrice);
  const stopLossHits = await redis.zrangebyscore(`stops:sell:${ticker}`, currentPrice, "+inf");

  const uniqueIds = [...new Set([...buyHits, ...sellLimitHits, ...stopLossHits])];
  if (uniqueIds.length === 0) return;

  const messages = uniqueIds.map((orderId) => ({
    key: orderId,
    value: JSON.stringify({ orderId, triggeredAt: currentPrice } satisfies Partial<OrderPlacedEvent>)
  }));

  await producer.send({
    topic: env.ORDERS_PLACED_TOPIC,
    messages
  });

  const removals = uniqueIds.flatMap((orderId) => [
    redis.zrem(`limits:buy:${ticker}`, orderId),
    redis.zrem(`limits:sell:${ticker}`, orderId),
    redis.zrem(`stops:sell:${ticker}`, orderId)
  ]);

  await Promise.allSettled(removals);
}

export async function startPriceTicksConsumer(): Promise<Consumer> {
  const consumer = createConsumer("price-persister");
  await consumer.connect();
  await consumer.subscribe({ topic: env.PRICE_TICKS_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      const parsed = JSON.parse(message.value.toString()) as PriceTickEvent;
      const ticker = parsed.ticker.toUpperCase();
      const tickTime = new Date(parsed.ts < 1_000_000_000_000 ? parsed.ts * 1000 : parsed.ts);

      let safePrice = parsed.price;
      if (safePrice > 99999999.9999) safePrice = 99999999.9999;
      if (safePrice < 0.0001) safePrice = 0.0001;

      await sql`
        INSERT INTO price_ticks (time, ticker, price, volume)
        VALUES (${tickTime.toISOString()}, ${ticker}, ${safePrice}, ${parsed.volume})
        ON CONFLICT (time, ticker) DO NOTHING
      `;

      const cachePayload = JSON.stringify({ price: safePrice, ts: Date.now() });
      await redis.hset("prices", ticker, cachePayload);
      // NOTE: Do NOT expire the entire "prices" hash here. A blanket expire would
      // evict all competition-namespaced tickers (C_{id}_TICKER) 5s after the last
      // tick of *any* stock, causing the dashboard to see null prices for simulated
      // competitions. Entries are overwritten on every tick so no cleanup is needed.
      await redis.publish("price_channel", JSON.stringify({ ticker, price: safePrice, ts: parsed.ts }));

      await queueTriggeredOrders(ticker, safePrice);
    }
  });

  return consumer;
}
