import type { Consumer } from "kafkajs";
import { env } from "../config/env";
import { createConsumer } from "../lib/kafka";
import type { OrderPlacedEvent } from "../types/events";
import { executePendingOrder } from "../domain/orders/executor";

async function executeOrder(event: Partial<OrderPlacedEvent>) {
  if (!event.orderId) return;
  await executePendingOrder(event.orderId, event.triggeredAt);
}

export async function startOrdersConsumer(): Promise<Consumer> {
  const consumer = createConsumer("order-engine");
  await consumer.connect();
  await consumer.subscribe({ topic: env.ORDERS_PLACED_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const event = JSON.parse(message.value.toString()) as Partial<OrderPlacedEvent>;
      await executeOrder(event);
    }
  });

  return consumer;
}
