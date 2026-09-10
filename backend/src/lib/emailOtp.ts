import { createHash, randomInt } from "node:crypto";
import { redis } from "./redis";

// Email verification codes, one per user, held in Redis rather than
// Postgres — they are short-lived and disposable, which is exactly what a
// cache is for.
//
// The code itself is never stored in the clear (only its SHA-256 hash), and
// attempts are capped so a stranger can't sit there guessing. Five wrong
// guesses burns the code and a fresh one has to be requested — it does not
// lock the account itself, since that would just hand anyone who knows an
// email address a way to lock its owner out.

const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
const MAX_ATTEMPTS = 5;

const codeKey = (userId: string) => `email-otp:${userId}`;
const attemptsKey = (userId: string) => `email-otp-attempts:${userId}`;

function hashOtp(otp: string) {
  return createHash("sha256").update(otp).digest("hex");
}

/** Generates a fresh 6-digit code, stores its hash, and returns the code to email. */
export async function issueEmailOtp(userId: string): Promise<string> {
  const otp = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await redis.set(codeKey(userId), hashOtp(otp), "EX", OTP_TTL_SECONDS);
  await redis.del(attemptsKey(userId));
  return otp;
}

export type VerifyEmailOtpResult = "ok" | "no-code" | "too-many-attempts" | "wrong-code";

/** Checks a submitted code against the stored hash, tracking attempts. */
export async function verifyEmailOtp(userId: string, submitted: string): Promise<VerifyEmailOtpResult> {
  const storedHash = await redis.get(codeKey(userId));
  if (!storedHash) {
    return "no-code";
  }

  const attempts = Number((await redis.get(attemptsKey(userId))) ?? "0");
  if (attempts >= MAX_ATTEMPTS) {
    await redis.del(codeKey(userId));
    await redis.del(attemptsKey(userId));
    return "too-many-attempts";
  }

  if (hashOtp(submitted) !== storedHash) {
    await redis.set(attemptsKey(userId), attempts + 1, "EX", OTP_TTL_SECONDS);
    return "wrong-code";
  }

  await redis.del(codeKey(userId));
  await redis.del(attemptsKey(userId));
  return "ok";
}
