import { redis } from "./redis";
import { marketAdapter } from "../domain/market/adapter";

/**
 * getCachedProfile — Cache Proxy Pattern, extracted so both the market
 * routes and the watchlist enrichment logic share one cache + fetch path
 * instead of duplicating the Redis lookup.
 */
export async function getCachedProfile(ticker: string): Promise<any | null> {
  const REDIS_KEY = `profile:${ticker}`;
  const cached = await redis.get(REDIS_KEY);
  if (cached) return JSON.parse(cached);

  const profileData = await marketAdapter.getProfile(ticker);
  if (profileData) {
    await redis.setex(REDIS_KEY, 86400, JSON.stringify(profileData));
  }
  return profileData;
}
