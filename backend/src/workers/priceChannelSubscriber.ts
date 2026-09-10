import { redisSubscriber } from "../lib/redis";
import { broadcastPrice } from "../lib/wsHub";

let subscribed = false;

export async function startPriceChannelSubscriber() {
  if (subscribed) return;

  await redisSubscriber.subscribe("price_channel");
  redisSubscriber.on("message", (channel, message) => {
    if (channel !== "price_channel") return;

    try {
      const payload = JSON.parse(message);
      broadcastPrice(payload);
    } catch {
      // Ignore malformed payloads from external publishers.
    }
  });

  subscribed = true;
}

export async function stopPriceChannelSubscriber() {
  if (!subscribed) return;
  await redisSubscriber.unsubscribe("price_channel");
  subscribed = false;
}
