import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Context } from "elysia";
import { db } from "./db";
import { redis } from "./redis";
import { users } from "../db/schema";

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  role: "user" | "educator" | "admin";
  virtualBalance: string;
};

export async function hashPassword(raw: string) {
  return bcrypt.hash(raw, 10);
}

export async function verifyPassword(raw: string, hash: string) {
  return bcrypt.compare(raw, hash);
}

export function getBearerToken(headers: Record<string, string | undefined>) {
  const value = headers.authorization ?? headers.Authorization;
  if (!value) return null;
  if (!value.startsWith("Bearer ")) return null;
  return value.slice("Bearer ".length).trim();
}

export async function authenticate(context: Context & { jwt: any }) {
  const token = getBearerToken(context.headers as any);
  if (!token) {
    throw new Error("Missing bearer token");
  }

  const blacklistKey = `session:blacklist:${token}`;
  const isBlacklisted = await redis.get(blacklistKey);
  if (isBlacklisted) {
    throw new Error("Session expired. Please login again.");
  }

  const payload = await context.jwt.verify(token);
  if (!payload || typeof payload !== "object" || !payload.sub) {
    throw new Error("Invalid token");
  }

  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      virtualBalance: users.virtualBalance
    })
    .from(users)
    .where(eq(users.id, String(payload.sub)))
    .limit(1);

  if (!user) {
    throw new Error("User not found");
  }

  return { token, user };
}
