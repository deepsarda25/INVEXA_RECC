import Redis from "ioredis";
import { env } from "../config/env";

const redisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true
};

export const redis = new Redis(env.REDIS_URL, redisOptions);
export const redisSubscriber = new Redis(env.REDIS_URL, redisOptions);

export async function connectRedis() {
  if (redis.status === "wait") {
    await redis.connect();
  }
  if (redisSubscriber.status === "wait") {
    await redisSubscriber.connect();
  }
}

export async function closeRedis() {
  await Promise.allSettled([redis.quit(), redisSubscriber.quit()]);
}
