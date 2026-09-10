import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const loadEnvFile = (path: string) => {
  if (!existsSync(path)) {
    return;
  }

  const content = readFileSync(path, "utf-8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const value = line.slice(separatorIndex + 1).trim();
    process.env[key] = value;
  }
};

loadEnvFile(resolve(process.cwd(), ".env"));
loadEnvFile(resolve(process.cwd(), "..", ".env"));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  JWT_SECRET: z.string().min(16).default("replace_with_a_long_random_secret"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  KAFKA_BROKERS: z.string().default("localhost:9094"),
  KAFKA_CLIENT_ID: z.string().default("invexa-backend"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  // WebAuthn (fingerprint / platform biometric) settings.
  // RP_ID must be the bare hostname (no scheme/port) the frontend is served from.
  WEBAUTHN_RP_ID: z.string().default("localhost"),
  WEBAUTHN_RP_NAME: z.string().default("Invexa"),
  // Comma-separated list of origins allowed to complete a WebAuthn ceremony.
  // Defaults to CORS_ORIGIN so it "just works" in dev without extra config.
  WEBAUTHN_ORIGIN: z.string().optional(),
  SIM_CONTROL_TOPIC: z.string().default("sim-control"),
  PRICE_TICKS_TOPIC: z.string().default("price-ticks"),
  ORDERS_PLACED_TOPIC: z.string().default("orders-placed"),
  ORDERS_FILLED_TOPIC: z.string().default("orders-filled"),
  COMPETITION_EVENTS_TOPIC: z.string().default("competition-events"),
  REAL_TICKERS: z.string().default("RELIANCE.NS,TCS.NS,HDFCBANK.NS,INFY.NS"),
  REAL_TICKER_INTERVAL: z.coerce.number().default(10000),
  // Transaction email notifications. Left unset, the app runs fine and
  // simply skips sending mail (logged once) — nothing else depends on this.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("Invexa <no-reply@invexa.app>")
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  kafkaBrokers: parsed.KAFKA_BROKERS.split(",").map((b) => b.trim()).filter(Boolean),
  webauthnOrigins: (parsed.WEBAUTHN_ORIGIN ?? parsed.CORS_ORIGIN)
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
};
